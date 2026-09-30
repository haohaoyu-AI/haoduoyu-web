"""Fill or replace pictures; network first, GPT fallback, explicit finalization."""
import json
import os
import sys
import tempfile
import time
import uuid
from collections import Counter
from pathlib import Path
from datetime import datetime
from urllib.parse import urlsplit, urlunsplit

from . import (ai, config, image_review as review, model_settings,
               sourcing as src, topic_packages)
from .imageops import IMAGE_SUFFIXES

TOPIC_CANDIDATE_TARGET = 20
TOPIC_CANDIDATE_CHECK_BUDGET = 80
TOPIC_SEARCH_REQUEST_BUDGET = 20
TOPIC_ROUND_TIME_BUDGET_SECONDS = 360
TOPIC_SEARCH_HISTORY_FILE = '配图搜索历史.json'


def _normalized_image_url(value):
    """Compare stable image URLs without signatures, fragments, or host case."""
    try:
        parsed = urlsplit(str(value or '').strip())
        if parsed.scheme.lower() not in {'http', 'https'} or not parsed.hostname:
            return str(value or '').strip().split('#', 1)[0].split('?', 1)[0]
        host = parsed.hostname.casefold()
        port = parsed.port
        if port and not ((parsed.scheme.lower() == 'http' and port == 80)
                         or (parsed.scheme.lower() == 'https' and port == 443)):
            host += ':' + str(port)
        return urlunsplit((parsed.scheme.lower(), host, parsed.path or '/', '', ''))
    except (TypeError, ValueError):
        return str(value or '').strip().split('#', 1)[0].split('?', 1)[0]


def _cursor_key(source, query):
    return json.dumps([str(source), str(query)], ensure_ascii=False, separators=(',', ':'))


def _load_topic_search_history(folder, topic_id):
    path = Path(folder) / TOPIC_SEARCH_HISTORY_FILE
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        value = {}
    except (OSError, ValueError) as exc:
        raise ValueError(f'本篇跨轮搜图记录无法读取：{exc}') from exc
    if value and (not isinstance(value, dict) or value.get('topic_id') != topic_id
                  or value.get('schema_version') != 1):
        raise ValueError('本篇跨轮搜图记录与内容包编号不一致，已停止追加搜索')
    value = value or {'schema_version': 1, 'topic_id': topic_id,
                      'next_pages': {}, 'pages': {}, 'permanent_urls': {}, 'rounds': []}
    for field in ('next_pages', 'pages', 'permanent_urls'):
        if not isinstance(value.get(field), dict):
            raise ValueError('本篇跨轮搜图记录格式错误：' + field)
    if not isinstance(value.get('rounds'), list):
        raise ValueError('本篇跨轮搜图轮次记录格式错误')
    return value


def _save_topic_search_history(folder, history):
    review._write_json(Path(folder) / TOPIC_SEARCH_HISTORY_FILE, history)


def _role_snapshot(profile, duty, *, status='未开始', detail='', completed=0,
                   total=None, elapsed=0, result=''):
    return {'provider': profile.get('name') or profile.get('提供方') or '未配置',
            'model': profile.get('模型') or '未配置', 'duty': duty,
            'status': status, 'detail': detail, 'completed': int(completed or 0),
            'total': total if type(total) is int and total >= 0 else None,
            'elapsed_seconds': round(max(0.0, float(elapsed or 0)), 1),
            'result': result}


def _image_progress(hint, topic, **values):
    """Write a refresh-safe, machine-readable image progress snapshot."""
    payload = {'topic': topic, 'updated_at': datetime.now().isoformat(timespec='seconds'), **values}
    try:
        folder = review.topic_path(topic)
        destination = folder / '配图搜图进度.json'
        if payload.get('stage') != '准备图源' and destination.is_file():
            try:
                previous = json.loads(destination.read_text(encoding='utf-8'))
                if isinstance(previous, dict) and previous.get('topic') == topic:
                    previous.update(payload)
                    payload = previous
            except (OSError, ValueError):
                pass
        temporary = folder / ('.配图搜图进度-' + uuid.uuid4().hex + '.tmp')
        temporary.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, destination)
    except (OSError, ValueError):
        try:
            temporary.unlink(missing_ok=True)
        except (OSError, UnboundLocalError):
            pass
    hint('[图片进度] ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')))


def validate(data):
    if not isinstance(data, dict):
        raise ValueError('图片操作格式不正确')
    download_attempts = data.get('download_attempts', 2)
    if type(download_attempts) is not int or download_attempts not in (1, 2):
        raise ValueError('下载尝试次数只能是 1 或 2')
    topic, mode = data.get('topic'), data.get('mode')
    if not isinstance(topic, str) or mode not in {'search', 'generate', 'auto'}:
        raise ValueError('请选择网络搜图或 AI 生成')
    review.ensure_editable(topic)
    folder = review.topic_path(topic)
    package = topic_packages.load(folder) if topic_packages.is_package(folder) else None
    if package is not None and not topic_packages.is_imported(folder):
        raise ValueError('请先在选题卡点击「一键导入配图清单」，再开始单篇配图')
    if package is not None and mode != 'search':
        raise ValueError('选题内容包只按已校验清单搜索网络图片，不会自动切换到 AI 生图')
    if package is None:
        review.source_document(folder)
    position_id = data.get('position_id', '')
    if not isinstance(position_id, str) or len(position_id) > 40:
        raise ValueError('配图位置编号不正确')
    image = data.get('image') or ''
    if not isinstance(image, str):
        raise ValueError('图片名称不正确')
    if image and image not in review.load_review(folder)['states']:
        raise ValueError('请选择本篇文章中的图片再替换')
    count = data.get('count', 1)
    lower, upper = ((1, 100) if package is not None and not image else
                    (0, 100) if mode == 'auto' else (1, 5))
    if type(count) is not int or not lower <= count <= upper or (image and count != 1):
        raise ValueError('自动补图数量必须在 0—100；手动新增每次 1—5 张；替换图片每次 1 个候选')
    query = data.get('query') or ''
    if not isinstance(query, str) or len(query) > 1000:
        raise ValueError('请将图片要求控制在 1000 字以内')
    provider, model = data.get('provider'), data.get('model', '')
    collaboration = data.get('collaboration')
    if data.get('image_mode') == 'collaborative' and collaboration is None:
        collaboration = model_settings.image_collaboration()
    if collaboration is not None:
        collaboration = model_settings.validate_image_collaboration(collaboration)
        if collaboration.get('mode') != 'collaborative':
            collaboration = None
        elif package is None:
            raise ValueError('双模型协作只用于新版选题配图；旧版 Word 流程保持原模式')
        else:
            provider = collaboration['roles']['text']['provider']
            model = collaboration['roles']['text']['model']
    if mode == 'generate':
        if provider != 'gpt':
            raise ValueError('AI 配图只使用 GPT 图片模型；DeepSeek 仅用于网络搜图分析')
        if not model_settings.is_image_model(model):
            raise ValueError('AI 生成需要 GPT 图片模型，不能使用 DeepSeek 等文本型号')
        model_settings.resolve_image(provider, model)
    elif provider not in {'gpt', 'deepseek', 'doubao'}:
        raise ValueError('网络搜图模型仅支持 GPT、DeepSeek 或豆包')
    elif provider in {'gpt', 'deepseek'}:
        if model_settings.is_image_model(model):
            raise ValueError('网络搜图请使用文本分析模型')
        model_settings.resolve(provider, model)
    names = data.get('sources')
    if names is None:
        names = [] if package is not None else ['今日头条']
    if mode in {'search', 'auto'} and (not isinstance(names, list) or not names or
                            any(n not in src.SOURCE_ORDER for n in names)):
        raise ValueError('请选择有效的网络图片来源')
    names = list(dict.fromkeys(names))
    states = review.load_review(folder)['states']
    manifest = _metadata(folder)
    context = next((item for item in manifest.get('配图', [])
                    if item.get('原始文件名') == image), {})
    if package is not None and image:
        position_id = context.get('计划位置')
        planned = next((item for item in package['image_plan']
                        if item['position_id'] == position_id), None)
        if planned is None:
            raise ValueError('这张图片没有对应的选题配图位置，不能按错误计划换图')
        query = planned['query']
    keyword_snapshot = topic_packages.searchable_plan(package) if package is not None else []
    target = review.target_count(folder)
    if package is not None:
        if position_id:
            planned_position = next((item for item in keyword_snapshot
                                     if item['position_id'] == position_id), None)
            if planned_position is None:
                raise ValueError('配图位置不在本选题的已校验清单中')
        # Candidate target is independent from the number of saved search terms.
        # Repeated searches append new pending candidates; old decisions never
        # make a position unavailable.
        count = min(count, TOPIC_CANDIDATE_TARGET)
    else:
        active = sum(value != 'rejected' for value in states.values())
        missing = max(0, (src.candidate_target(target) if mode == 'auto' else target) - active)
        if image:
            # Replacement is count-neutral: a successful atomic commit retires the
            # old image and installs exactly one pending candidate.
            count = 1
        elif not missing:
            if mode != 'auto':
                raise ValueError(f'已有 {target} 张可用图片；请先淘汰不合适图片再新增候选')
            count = 0
        else:
            count = missing if mode == 'auto' else min(count, missing)
    validated = dict(topic=topic, mode=mode, image=image, count=count, provider=provider,
                     model=model, query=query.strip(), sources=names, target_count=target,
                     topic_package=package is not None, position_id=position_id,
                     download_attempts=download_attempts)
    if collaboration is not None:
        validated['image_mode'] = 'collaborative'
        validated['collaboration'] = collaboration
    if package is not None:
        validated['plan_keyword_count'] = len(keyword_snapshot)
        validated['keyword_snapshot'] = keyword_snapshot
        validated['keyword_version'] = package.get('keyword_version', 1)
    return validated


def _package_analysis(folder, data):
    """Use the saved plan verbatim; never infer or regenerate search words."""
    package = topic_packages.load(folder)
    snapshot = data.get('keyword_snapshot')
    if isinstance(snapshot, list):
        package = topic_packages.validate({**package, 'image_plan': snapshot})
    else:
        package = {**package, 'image_plan': topic_packages.searchable_plan(package)}
        package = topic_packages.validate(package)
    document = topic_packages.synthetic_document(folder, package_override=package)
    manifest = _metadata(folder)
    current_names = set(review.load_review(folder)['states'])
    if data.get('position_id'):
        wanted = {data['position_id']}
    elif data.get('image'):
        current = next((item for item in manifest.get('配图', [])
                        if item.get('原始文件名') == data['image']), None)
        wanted = {current.get('计划位置')} if current else set()
    else:
        # Every retry may search the original confirmed plan again. Candidate
        # de-duplication happens against the full image manifest, not position.
        wanted = {item['position_id'] for item in topic_packages.searchable_plan(package)}
    selected = [item for item in topic_packages.searchable_plan(package) if item['position_id'] in wanted]
    if data.get('query') and data.get('image'):
        selected = [item for item in selected if item['query'] == data['query']]
    unique, seen_queries = [], set()
    for item in selected:
        query = item['query'].strip()
        if query and query not in seen_queries:
            seen_queries.add(query)
            unique.append(item)
    selected = unique
    headings = {item['section_id']: item['heading'] for item in package['outline']}
    queries = []
    for item in selected:
        heading = headings.get(item['section_id'], '')
        section = src._find_section(document, heading) if heading else -1
        queries.append(src.Query(item['query'], section, heading,
                                 '选题配图计划 · ' + item.get('keyword_type', 'core')))
    anchors = []
    for item in selected:
        for term in item['query'].split():
            if len(term) >= 2 and term not in anchors:
                anchors.append(term)
    return document, src.Analysis(queries, anchors, []), selected


def _metadata(folder):
    path = folder / src.MANIFEST_FILE
    if path.exists():
        manifest = json.loads(path.read_text(encoding='utf-8'))
    else:
        manifest = {'配图': []}
    # Earlier failed runs left pictures without a manifest. They are still
    # reviewable; do not claim to know the network source from the filename.
    known = {item.get('原始文件名') for item in manifest.get('配图', [])}
    for p in sorted(folder.iterdir()):
        if p.is_file() and not p.is_symlink() and p.suffix.lower() in IMAGE_SUFFIXES and p.name not in known:
            manifest.setdefault('配图', []).append({'原始文件名': p.name, '原始标题': p.stem,
                '平台': '来源待核对', '角色': '正文配图', '插入到段落': -1})
    return manifest


def _network(data, document, folder, stage, context, hint):
    if data.get('topic_package'):
        # The new workflow treats the UI choice as authoritative.
        hint(f'[进度] 使用已选择的 {data["provider"].upper()} 网络搜图，计划本轮 {data["count"]} 个位置…')
        return _network_round(data, document, folder, stage, context, hint)
    # Compatibility: old Word-only drafts keep their explicit legacy chain.
    profiles = src.search_profiles(data['provider'], data['model'])
    rounds = [(key, profile['模型']) for key, profile in profiles] or [(data['provider'], data['model'])]
    results = []
    for provider, model in rounds:
        hint(f'[进度] {provider.upper()} 网络搜图，尚缺 {data["count"]-len(results)} 张…')
        try:
            results.extend(_network_round(dict(data, provider=provider, model=model,
                count=data['count']-len(results)), document, folder, stage, context, hint))
        except Exception as exc:
            hint(f'[提示] {provider.upper()} 网络搜图失败：{exc}')
        if len(results) >= data['count']:
            break
    return results


def _network_round(data, document, folder, stage, context, hint):
    if data.get('topic_package'):
        return _network_topic_package_round(data, document, folder, stage, hint)
    profile = None if data['provider'] == 'rules' else model_settings.resolve(data['provider'], data['model'])
    # Selection keeps at most one image per query.  Size the query set to the
    # whole article plan so a long article can still be completed from web
    # results after some earlier subjects have already supplied pictures.
    query_limit = src.query_budget(data.get('target_count', data['count']), 6)
    plan_items = []
    if data.get('topic_package'):
        document, analysis, plan_items = _package_analysis(folder, data)
        hint(f'[进度] 直接读取选题配图清单的 {len(analysis.queries)} 条搜图词；不分析 Word，不二次生成关键词。')
    else:
        analysis = src.analyze(document, limit=query_limit)
    if profile and not data.get('topic_package'):
        hint(f"[进度] {data['model']} 正在分析搜索词…")
        with ai.using_profile(profile):
            analysis = src.model_analysis(document, limit=query_limit)
    queries = analysis.queries
    if not data.get('topic_package'):
        if data['query']:
            queries = [src.Query(data['query'], -1, '', '自定义')]
        elif context.get('搜索词'):
            queries = [src.Query(context['搜索词'], -1, '', '自定义')] + queries
    sources = []
    try:
        sources, warnings = src.build_sources(
            data['sources'], hint=hint, exact=bool(data.get('topic_package')))
        for warning in warnings:
            hint('[提示] ' + warning)
        if not sources:
            raise ValueError('网络来源不可用，请检查登录状态或换来源')
        hits, warnings = src.collect_hits(sources, queries, hint=hint)
        searched_counts = Counter(hit.query for hit in hits)
        for warning in warnings:
            hint('[提示] ' + warning)
        if profile and hits:
            raw_hits = list(hits)
            try:
                with ai.using_profile(profile):
                    filtered = src.model_filter_hits(
                        document, raw_hits, analysis.anchors, queries=queries,
                        image_plan=plan_items if data.get('topic_package') else None,
                        hint=hint)
                if filtered:
                    hits = filtered
                elif data.get('topic_package'):
                    hits = []
                    hint('[配图结果] 模型相关性检查没有保留候选；本轮不把检查失败或空结果当作通过。')
                else:
                    hint('[提示] 模型筛图未保留候选；保留原始网络候选，'
                         '改用现有规则打分和安全过滤。')
                    hits = raw_hits
            except (ai.AiError, ValueError) as exc:
                if data.get('topic_package'):
                    raise ValueError(f'配图相关性检查失败，未放行未经检查的候选：{exc}') from exc
                hint(f'[提示] 模型筛图失败；保留原始网络候选，'
                     f'改用现有规则打分和安全过滤：{exc}')
                hits = raw_hits
        checked_counts = Counter(hit.query for hit in hits)
        # Exclude all old pictures, including rejected ones, by URL AND pixels.
        manifest = _metadata(folder)
        urls = {(item.get('图片链接') or '').split('?')[0] for item in manifest.get('配图', [])}
        # One web picture per search subject/page; repeated coverage of a
        # side event must not occupy all five slots simply because it ranks well.
        decisions = review.load_review(folder)['states']
        subjects = {item.get('搜索词', '').strip() for item in manifest.get('配图', [])
                    if item.get('搜索词') and decisions.get(item.get('原始文件名')) != 'rejected'}
        pages = {item.get('文章链接', '').split('?')[0] for item in manifest.get('配图', [])
                 if item.get('文章链接')}
        hashes = [src._dhash(p.read_bytes()) for p in list(folder.iterdir()) + list(stage.iterdir())
                  if p.is_file() and not p.is_symlink() and p.suffix.lower() in IMAGE_SUFFIXES]
        download = src._Downloader(sources, hint=hint,
                                   max_attempts=data.get('download_attempts', 2))
        # 旧版 Word 链路同样不做画面判断：下载与本地规则通过即作为待审核候选。
        quality_check = src.rules_only_quality_check()
        for path in folder.iterdir():
            if path.suffix.lower() in IMAGE_SUFFIXES and decisions.get(path.name) != 'rejected':
                quality_check.accept(path.read_bytes())
        results = []
        if data.get('topic_package'):
            groups = [(item, [hit for hit in hits if hit.query == item['query']])
                      for item in plan_items]
        else:
            groups = [(None, list(hits))]
        halted = False
        for plan, group in groups:
            picked = False
            blocked = Counter()
            for hit in sorted(group, key=lambda h: -src.score_hit(h, h.query)):
                if hit.image_key in urls:
                    blocked['与已有图片重复'] += 1
                    continue
                if plan is not None and plan.get('purpose') == 'cover' and not hit.cover_approved:
                    blocked['封面相关性检查未通过'] += 1
                    continue
                rejection = src.rejection_reason(hit, document, analysis.anchors,
                                                 prompt_driven=bool(data.get('topic_package')))
                if rejection:
                    blocked[rejection] += 1
                    continue
                if data.get('topic_package') and not hit.semantic_approved and not src.is_relevant(hit, hit.query):
                    blocked['标题未命中搜图词'] += 1
                    continue
                raw = download(hit)
                if not raw:
                    blocked['图片下载失败'] += 1
                    continue
                try:
                    width, height = src._measure(raw, hit.image_url)
                except src.ImageError:
                    blocked['图片格式或可读性检查失败'] += 1
                    continue
                digest = src._dhash(raw)
                if min(width, height) < 400:
                    blocked['图片尺寸不足'] += 1
                    continue
                if any(src._similar(digest, old) for old in hashes):
                    blocked['图片像素去重'] += 1
                    continue
                requirement = ('候选配图；关键词：' + plan['query']
                               if plan is not None else '候选配图（可能用于正文）')
                try:
                    reason = quality_check(raw, hit, requirement)
                except (ai.AiError, ValueError, OSError) as exc:
                    if plan is None or not results:
                        raise
                    hint(f'[配图结果] 位置 {plan["order"]} 的画面检查失败：{exc}；'
                         '未放行这张图，已通过的较早位置会保留。')
                    halted = True
                    break
                if reason:
                    hint('[筛图] ' + reason + '：' + hit.title[:60])
                    blocked['画面检查：' + str(reason)[:70]] += 1
                    continue
                try:
                    file = src._save_image(raw, hit.image_url, stage, '网络候选_' + uuid.uuid4().hex[:12])
                except (OSError, src.ImageError) as exc:
                    if plan is None or not results:
                        raise
                    hint(f'[配图结果] 位置 {plan["order"]} 保存失败：{exc}；'
                         '已通过的较早位置会保留。')
                    halted = True
                    break
                quality_check.accept(raw)
                result = {'原始文件名': file.name, '原始标题': hit.title, '平台': hit.platform,
                    '来源': hit.source, '图片链接': hit.image_url, '文章链接': hit.page_url,
                    '搜索词': hit.query, '宽': width, '高': height, '图注': src.caption_for(hit)}
                if plan is not None:
                    result.update({'角色': '配图',
                        '计划位置': plan['position_id'], '计划顺序': plan['order'],
                        '插入到小标题': next((row['heading'] for row in topic_packages.load(folder)['outline']
                                               if row['section_id'] == plan['section_id']), ''),
                        '需要画面': '', '排除画面': [],
                        '对应正文': plan['query']})
                results.append(result)
                hashes.append(digest)
                urls.add(hit.image_key)
                subjects.add(hit.query.strip())
                if hit.page_url:
                    pages.add(hit.page_url.split('?')[0])
                picked = True
                break
            if plan is not None and not picked:
                searched = searched_counts.get(plan['query'], 0)
                checked = checked_counts.get(plan['query'], 0)
                if not searched:
                    detail = '所选图源没有返回候选图片'
                elif not checked:
                    detail = f'搜索到 {searched} 条，但相关性检查未放行'
                else:
                    reasons = '；'.join(f'{reason} {count} 条' for reason, count in blocked.most_common(3))
                    detail = f'搜索到 {searched} 条，相关性检查放行 {checked} 条；未通过：{reasons or "候选筛查"}'
                hint(f'[无图] 位置 {plan["order"]}「{plan["query"]}」：{detail}。')
            if halted:
                break
            if len(results) >= data['count']:
                break
        return results
    finally:
        for source in sources:
            try:
                source.close()
            except Exception:
                pass


def _balance_hit_sources(hits):
    """Rotate through selected image sources while keeping each source ranked."""
    groups = {}
    order = []
    for hit in hits:
        source = str(hit.source or hit.platform or '未知图源')
        if source not in groups:
            groups[source] = []
            order.append(source)
        groups[source].append(hit)
    for group in groups.values():
        group.sort(key=lambda hit: -src.score_hit(hit, hit.query))
    result = []
    while True:
        added = False
        for source in order:
            if groups[source]:
                result.append(groups[source].pop(0))
                added = True
        if not added:
            return result


def _network_topic_package_round(data, document, folder, stage, hint):
    """Append a bounded, fairly distributed set of candidates from the saved plan."""
    document, analysis, plan_items = _package_analysis(folder, data)
    if not plan_items:
        raise ValueError('已确认的图片关键词清单为空，未执行搜图')

    found_counts = Counter()
    passed_counts = Counter()
    blocked = Counter()
    checked = 0
    raw_hit_count = 0
    filter_input_count = 0
    filter_check_total = 0
    screened_count = 0
    rule_prefiltered_count = 0
    text_model_accepted = 0
    text_model_unanswered = 0
    download_attempted = 0
    downloaded_count = 0
    filter_failed = False
    filter_budget_exhausted = False
    target = min(max(1, int(data['count'])), TOPIC_CANDIDATE_TARGET)
    deadline = time.monotonic() + TOPIC_ROUND_TIME_BUDGET_SECONDS
    budget_reasons = set()
    filter_budget_exhausted = False
    package = topic_packages.load(folder)
    history = _load_topic_search_history(folder, package['topic_id'])
    round_number = len(history['rounds']) + 1
    round_record = {'round': round_number, 'status': 'running',
                    'started_at': datetime.now().isoformat(timespec='seconds'),
                    'keyword_version': data.get('keyword_version', package.get('keyword_version', 1)),
                    'keyword_versions': [], 'queries': [],
                    'sources': list(data['sources']), 'pages': [],
                    'found': 0, 'checked': 0, 'accepted': 0}
    history['rounds'].append(round_record)
    _save_topic_search_history(folder, history)
    sources = []
    try:
        collaboration = data.get('collaboration') or {}
        roles = collaboration.get('roles', {})
        profile = model_settings.resolve(
            roles.get('text', {}).get('provider', data['provider']),
            roles.get('text', {}).get('model', data['model']))
        text_role = roles.get('text', {})
        profile = {**profile, 'name': profile.get('name') or text_role.get('provider', data['provider']),
                   '模型': profile.get('模型') or text_role.get('model', data['model'])}
        layout_profile = (model_settings.resolve(
            roles['layout']['provider'], roles['layout']['model'])
            if collaboration.get('mode') == 'collaborative' else profile)
        layout_role = roles.get('layout', {})
        layout_profile = {**layout_profile,
                          'name': layout_profile.get('name') or layout_role.get('provider', data['provider']),
                          '模型': layout_profile.get('模型') or layout_role.get('model', data['model'])}
        collaborative = collaboration.get('mode') == 'collaborative'
        role_state = {
            'text': _role_snapshot(profile, '根据已确认话题和关键词核对候选来源文字',
                                   status='未开始', detail='等待候选搜索结果'),
            'layout': _role_snapshot(layout_profile, '仅在点击排版后匹配正文段落与已保留图片',
                                     status='未调用', detail='待点击排版后执行')}
        role_started = {}

        def emit(**values):
            value = dict(values)
            value.pop('topic', None)
            value.setdefault('round', round_number)
            value.setdefault('search_candidates', raw_hit_count)
            value.setdefault('text_input_count', filter_input_count)
            value.setdefault('text_rule_prefiltered', rule_prefiltered_count)
            value.setdefault('text_model_candidates', filter_check_total)
            value.setdefault('text_model_checked', screened_count)
            value.setdefault('text_model_accepted', text_model_accepted)
            value.setdefault('text_model_unanswered', text_model_unanswered)
            value.setdefault('download_attempted', download_attempted)
            value.setdefault('downloaded', downloaded_count)
            value['model_roles'] = dict(role_state)
            _image_progress(hint, data['topic'], **value)

        if collaboration.get('mode') == 'collaborative':
            hint('[模型分工] 文本相关性：' + profile['name'] + ' · ' + profile['模型'])
            hint('[模型分工] 排版匹配：' + layout_profile['name'] + ' · ' + layout_profile['模型']
                 + ' · 待点击排版后执行')
        emit(stage='准备图源', query='', source='', keywords_done=0,
             keywords_total=len(plan_items), found=0, screened=0, screen_total=0,
             candidate_checked=0, accepted=0, target=target,
             keyword_version=data.get('keyword_version', package.get('keyword_version', 1)),
             keyword_plan=[{'query':item['query'],
                            'keyword_type':item.get('keyword_type', 'core'),
                            'subject_query':item.get('subject_query', ''),
                            'scene_term':item.get('scene_term', '')}
                           for item in plan_items],
             search_request_budget=TOPIC_SEARCH_REQUEST_BUDGET,
             candidate_check_budget=TOPIC_CANDIDATE_CHECK_BUDGET,
             time_budget_seconds=TOPIC_ROUND_TIME_BUDGET_SECONDS)
        sources, warnings = src.build_sources(data['sources'], hint=hint, exact=True)
        for warning in warnings:
            hint('[提示] ' + warning)
        if not sources:
            raise ValueError('网络来源不可用，请检查当前已选图源')

        searched_sources = {item['query']: set() for item in plan_items}
        page_records = history.setdefault('pages', {})
        page_urls = {}
        attempted_pages = set()
        searched_keywords = {}
        request_count = 0
        active_keyword_version = data.get('keyword_version', package.get('keyword_version', 1))

        def search_progress(event):
            value = dict(event)
            query = value.get('query', '')
            source = value.get('source', '')
            if query in searched_sources and source:
                searched_sources[query].add(source)
            keywords_done = sum(len(seen) >= len(sources) for seen in searched_sources.values())
            if value.get('budget_exhausted'):
                budget_reasons.add(value.get('budget_reason') or '图源请求预算已用尽')
            if value.get('cursor_key') and value.get('page_success'):
                page = int(value.get('page_index', 0))
                urls_on_page = sorted({_normalized_image_url(url)
                                       for url in value.get('candidate_urls', []) if url})
                page_urls[(value['cursor_key'], page)] = urls_on_page
                page_records.setdefault(value['cursor_key'], {})[str(page)] = {
                    'success': True, 'urls': urls_on_page, 'complete': False,
                    'source': source, 'query': query,
                    'seen_at': datetime.now().isoformat(timespec='seconds')}
                round_record['pages'].append({'source': source, 'query': query,
                                              'page': page + 1,
                                              'candidate_count': len(urls_on_page)})
                _save_topic_search_history(folder, history)
            value.update({'topic': data['topic'], 'keywords_total': len(plan_items),
                          'keywords_done': keywords_done, 'target': target, 'accepted': 0, 'screened': 0,
                          'screen_total': 0, 'candidate_checked': 0,
                          'keyword_version': active_keyword_version,
                          'keyword_plan': [{'query':item['query'],
                                            'keyword_type':item.get('keyword_type', 'core'),
                                            'subject_query':item.get('subject_query', ''),
                                            'scene_term':item.get('scene_term', '')}
                                           for item in plan_items],
                          'searched_keywords': list(searched_keywords.values()),
                          'searches_done': request_count + 1,
                          'searches_total': TOPIC_SEARCH_REQUEST_BUDGET})
            emit(**value)

        page_offsets = {key: int(value or 0)
                        for key, value in history.get('next_pages', {}).items()}
        hits = []
        warnings = []
        while request_count < TOPIC_SEARCH_REQUEST_BUDGET and time.monotonic() < deadline:
            # A round may stay open while the user edits its keyword list. Refresh
            # the authoritative package before every not-yet-sent source request.
            package = topic_packages.load(folder)
            current_data = {**data,
                            'keyword_snapshot': topic_packages.searchable_plan(package),
                            'keyword_version': package.get('keyword_version', 1)}
            document, analysis, plan_items = _package_analysis(folder, current_data)
            active_keyword_version = current_data['keyword_version']
            searched_sources = {item['query']: searched_sources.get(item['query'], set())
                                for item in plan_items}
            query_by_text = {query.text: query for query in analysis.queries}
            next_request = None
            for page_step in range(4):
                for item in plan_items:
                    query = query_by_text.get(item['query'])
                    if query is None:
                        continue
                    for source in sources:
                        key = _cursor_key(source.name, query.text)
                        try:
                            offset = max(0, int(page_offsets.get(key, 0)))
                        except (TypeError, ValueError):
                            offset = 0
                        page = offset + page_step
                        if page >= 20 or (page > 0 and not callable(getattr(source, 'search_page', None))):
                            continue
                        if (key, page) not in attempted_pages:
                            next_request = (item, query, source, key, page)
                            break
                    if next_request:
                        break
                if next_request:
                    break
            if not next_request:
                break
            item, query, source, key, page = next_request
            attempted_pages.add((key, page))
            searched_keywords[item['position_id']] = {
                'position_id': item['position_id'], 'query': item['query'],
                'keyword_type': item.get('keyword_type', 'core'),
                'keyword_version': active_keyword_version}
            if not any(row['position_id'] == item['position_id']
                       for row in round_record['queries']):
                round_record['queries'].append(dict(searched_keywords[item['position_id']]))
                versions = round_record.setdefault('keyword_versions', [])
                if active_keyword_version not in versions:
                    versions.append(active_keyword_version)
            _save_topic_search_history(folder, history)
            emit(stage='搜图', query=query.text, source=source.name,
                 keyword_version=active_keyword_version,
                 keyword_plan=[{'query':row['query'],
                                'keyword_type':row.get('keyword_type', 'core'),
                                'subject_query':row.get('subject_query', ''),
                                'scene_term':row.get('scene_term', '')}
                               for row in plan_items],
                 searched_keywords=list(searched_keywords.values()))
            request_hits, request_warnings = src.collect_hits_with_pages(
                [source], [query], hint=hint, progress=search_progress,
                max_requests=1, max_pages_per_query=1, deadline=deadline,
                page_offsets={key: page})
            request_count += 1
            hits.extend(request_hits)
            warnings.extend(request_warnings)
        for warning in warnings:
            hint('[提示] ' + warning)
        queries = analysis.queries
        found_counts.update(hit.query for hit in hits)
        raw_hit_count = len(hits)
        manifest = _metadata(folder)
        old_rows = [item for item in manifest.get('配图', []) if isinstance(item, dict)]
        existing_urls = {_normalized_image_url(item.get('图片链接')) for item in old_rows
                         if item.get('图片链接')}
        permanent_urls = history.setdefault('permanent_urls', {})
        fresh_hits = []
        for hit in hits:
            key = _normalized_image_url(hit.image_url)
            if not key:
                fresh_hits.append(hit)
            elif key in existing_urls or key in permanent_urls:
                blocked['跨轮 URL 重复'] += 1
            else:
                fresh_hits.append(hit)
        hits = fresh_hits
        if raw_hit_count > TOPIC_CANDIDATE_CHECK_BUDGET:
            grouped_hits = {item['query']: {} for item in plan_items}
            source_order = []
            for hit in hits:
                if hit.query in grouped_hits:
                    source = str(hit.source or hit.platform or '未知图源')
                    if source not in source_order:
                        source_order.append(source)
                    grouped_hits[hit.query].setdefault(source, []).append(hit)
            bounded_hits = []
            cursor = 0
            while len(bounded_hits) < TOPIC_CANDIDATE_CHECK_BUDGET:
                advanced = False
                for item in plan_items:
                    for source in source_order:
                        group = grouped_hits[item['query']].get(source, [])
                        if cursor < len(group):
                            bounded_hits.append(group[cursor])
                            advanced = True
                            if len(bounded_hits) >= TOPIC_CANDIDATE_CHECK_BUDGET:
                                break
                    if len(bounded_hits) >= TOPIC_CANDIDATE_CHECK_BUDGET:
                        break
                if not advanced:
                    break
                cursor += 1
            hits = bounded_hits
            hint(f'[配图结果] 搜到 {raw_hit_count} 条，按每轮最多检查 {TOPIC_CANDIDATE_CHECK_BUDGET} 条的上限均衡送检。')
        filter_input_count = len(hits)
        filter_check_total = filter_input_count
        screen_candidates = list(hits)
        emit(stage='相关性筛选', query='', source='',
             keywords_done=sum(len(seen) >= len(sources) for seen in searched_sources.values()),
             keywords_total=len(plan_items), found=raw_hit_count, screened=0,
             screen_total=filter_input_count, candidate_checked=0,
             accepted=0, target=target)
        verified_hits = []
        def filter_progress(event):
            nonlocal filter_budget_exhausted, screened_count
            nonlocal filter_check_total, rule_prefiltered_count, text_model_accepted, text_model_unanswered
            screened_count = max(screened_count, int(event.get('checked', 0) or 0))
            if type(event.get('check_total')) is int:
                filter_check_total = max(0, event['check_total'])
            if type(event.get('prefiltered')) is int:
                rule_prefiltered_count = max(0, event['prefiltered'])
            if type(event.get('accepted')) is int:
                text_model_accepted = max(0, event['accepted'])
            if type(event.get('unanswered')) is int:
                text_model_unanswered = max(0, event['unanswered'])
            filter_stage = event.get('stage', '相关性筛选')
            model_running = filter_stage == '相关性筛选'
            payload = {'topic': data['topic'], 'source': '',
                       'keywords_done': sum(len(seen) >= len(sources) for seen in searched_sources.values()),
                       'keywords_total': len(plan_items),
                       'found': sum(found_counts.values()),
                       'target': target,
                       'stage': filter_stage,
                       'screened': event.get('checked', 0),
                       'screen_total': filter_check_total,
                       'accepted': event.get('accepted', 0),
                       'text_input_count': event.get('input_total', filter_input_count),
                       'text_rule_prefiltered': rule_prefiltered_count,
                       'text_model_candidates': filter_check_total,
                       'text_model_checked': screened_count,
                       'text_model_accepted': text_model_accepted,
                       'text_model_unanswered': text_model_unanswered}
            if event.get('budget_exhausted'):
                filter_budget_exhausted = True
                budget_reasons.add(event.get('budget_reason') or '相关性筛选时间预算已用尽')
            if 'text' in role_state:
                elapsed = time.monotonic() - role_started.get('text', time.monotonic())
                role_state['text'].update({'status': '运行中' if model_running else '未开始',
                    'detail': (f"正在核对来源文字与关键词「{'、'.join(item['query'] for item in plan_items)}」："
                               f'{screened_count}/{filter_check_total} 条' if model_running else
                               f'本地规则预筛：{filter_input_count} 条输入，移除 {rule_prefiltered_count} 条；'
                               f'待模型检查 {filter_check_total} 条，尚未调用模型'),
                    'completed': screened_count, 'total': filter_check_total,
                    'elapsed_seconds': round(elapsed, 1)})
            emit(**payload)

        if hits:
            role_started['text'] = time.monotonic()
            role_state['text'].update({'status': '未开始', 'detail': f'正在本地规则预筛 {filter_input_count} 条候选；预筛结束后再调用模型',
                                       'completed': 0, 'total': filter_input_count,
                                       'result': ''})
            emit(stage='相关性筛选', query='', source='', found=raw_hit_count,
                 screened=0, screen_total=filter_input_count, accepted=0, target=target)
            try:
                with ai.using_profile(profile):
                    hits = src.model_filter_hits(
                        document, hits, analysis.anchors, queries=queries,
                        image_plan=plan_items, hint=hint,
                        progress=filter_progress, deadline=deadline,
                        accepted_callback=verified_hits.extend)
                text_model_accepted = len(hits)
                if filter_budget_exhausted and screened_count < filter_check_total:
                    text_status = '失败'
                    text_detail = '文本相关性检查因本轮时间预算提前停止；未检查候选不会放行'
                elif filter_check_total:
                    text_status = '部分失败' if text_model_unanswered else '已完成'
                    text_detail = (f'文本模型实际检查 {screened_count}/{filter_check_total} 条；'
                                   f'规则预筛移除 {rule_prefiltered_count} 条'
                                   + (f'；模型未答复 {text_model_unanswered} 条已排除'
                                      if text_model_unanswered else ''))
                else:
                    text_status = '未调用'
                    text_detail = f'本地规则预筛移除 {rule_prefiltered_count} 条；没有候选送交文本模型'
                role_state['text'].update({'status': text_status,
                    'detail': text_detail,
                    'completed': screened_count, 'total': filter_check_total,
                    'elapsed_seconds': round(time.monotonic() - role_started['text'], 1),
                    'result': f'放行 {len(hits)} 条候选'
                              + (f'；本轮时间预算停止，尚有 {max(0, filter_check_total-screened_count)} 条未检查'
                                 if text_status == '失败' else '')})
                kept_keys = {_normalized_image_url(hit.image_url) for hit in hits}
                for hit in screen_candidates:
                    key = _normalized_image_url(hit.image_url)
                    if key and key not in kept_keys:
                        permanent_urls.setdefault(key, '文本相关性检查未通过')
                if rule_prefiltered_count:
                    blocked['规则预筛排除'] += rule_prefiltered_count
                if not filter_budget_exhausted:
                    blocked['文本相关性未放行'] += max(0, filter_check_total - len(hits))
            except (ai.AiError, ValueError) as exc:
                role_state['text'].update({'status': '失败',
                    'detail': '相关性检查失败，未完成部分不会放行',
                    'completed': screened_count, 'total': filter_check_total,
                    'elapsed_seconds': round(time.monotonic() - role_started['text'], 1),
                    'result': str(exc)[:180]})
                emit(stage='相关性检查失败', query='', source='',
                     keywords_done=sum(len(seen) >= len(sources) for seen in searched_sources.values()),
                     keywords_total=len(plan_items), found=sum(found_counts.values()),
                     screened=screened_count, screen_total=filter_check_total,
                     text_rule_prefiltered=rule_prefiltered_count,
                     text_model_candidates=filter_check_total,
                     text_model_checked=screened_count,
                     candidate_checked=0, accepted=len(verified_hits), target=target,
                     error=str(exc))
                if verified_hits:
                    hits = verified_hits
                    filter_failed = True
                    text_model_accepted = len(verified_hits)
                    blocked['相关性检查失败未放行'] += max(1, filter_check_total - screened_count)
                    hint(f'[配图结果] 后续相关性检查失败：{exc}；只保留此前已经检查通过的候选，未检查候选不会放行。')
                else:
                    raise ValueError(f'配图相关性检查失败，未放行未经检查的候选：{exc}') from exc
        else:
            role_state['text'].update({'status': '未调用', 'detail': '本轮没有未见过的候选来源文字',
                                       'completed': 0, 'total': 0,
                                       'result': '跳过文本模型调用'})
        checked_counts = Counter(hit.query for hit in hits)
        if rule_prefiltered_count and not blocked['规则预筛排除']:
            blocked['规则预筛排除'] += rule_prefiltered_count

        # A candidate rejected by the text model was processed permanently;
        # transient model failure leaves unchecked URLs eligible on a later run.
        if not filter_failed and not filter_budget_exhausted:
            kept_keys = {_normalized_image_url(item.image_url) for item in hits}
            for hit in screen_candidates:
                key = _normalized_image_url(hit.image_url)
                if key and key not in kept_keys:
                    permanent_urls.setdefault(key, '文本相关性检查未通过')
        urls = set(existing_urls)
        decisions = review.load_review(folder)['states']
        hashes = [src._dhash(path.read_bytes()) for path in
                  list(folder.iterdir()) + list(stage.iterdir())
                  if path.is_file() and not path.is_symlink()
                  and path.suffix.lower() in IMAGE_SUFFIXES]
        download = src._Downloader(sources, hint=hint,
                                   max_attempts=data.get('download_attempts', 2))
        round_processed = set(existing_urls) | set(permanent_urls)
        candidates = {item['query']: _balance_hit_sources(
            [hit for hit in hits if hit.query == item['query']]) for item in plan_items}
        cursors = {query: 0 for query in candidates}
        results = []
        halted = False
        background_accepted = 0
        background_limit = target // 4

        def report_candidate(stage_name, query, source_name, **extra):
            emit(stage=stage_name, query=query, source=source_name,
                 keywords_done=sum(len(seen) >= len(sources) for seen in searched_sources.values()),
                 keywords_total=len(plan_items), found=raw_hit_count,
                 screened=screened_count, screen_total=filter_input_count,
                 candidate_checked=checked, accepted=len(results), target=target,
                 blocked=dict(blocked), **extra)

        while len(results) < target and checked < TOPIC_CANDIDATE_CHECK_BUDGET:
            if time.monotonic() >= deadline:
                budget_reasons.add('配图下载与校验时间预算已用尽')
                break
            advanced = False
            for plan in plan_items:
                query = plan['query']
                group = candidates.get(query, [])
                cursor = cursors.get(query, 0)
                if cursor >= len(group):
                    continue
                if plan.get('keyword_type') == 'background' and background_accepted >= background_limit:
                    blocked['背景词比例上限'] += len(group) - cursor
                    cursors[query] = len(group)
                    continue
                hit = group[cursor]
                cursors[query] = cursor + 1
                advanced = True
                checked += 1
                url_key = _normalized_image_url(hit.image_url)
                current_stage = '相关性核验与去重'
                if url_key and (url_key in urls or url_key in permanent_urls):
                    blocked['跨轮 URL 重复'] += 1
                    round_processed.add(url_key)
                    report_candidate(current_stage, query, hit.source,
                                     duplicate=blocked['跨轮 URL 重复'])
                    continue
                rejection = src.rejection_reason(
                    hit, document, analysis.anchors, prompt_driven=True)
                if rejection:
                    blocked['相关性或内容规则'] += 1
                    if url_key:
                        permanent_urls[url_key] = rejection[:160]
                        round_processed.add(url_key)
                    report_candidate(current_stage, query, hit.source)
                    continue
                if not hit.semantic_approved and not src.is_relevant(hit, query):
                    blocked['关键词相关性'] += 1
                    if url_key:
                        permanent_urls[url_key] = '关键词相关性不符合'
                        round_processed.add(url_key)
                    report_candidate(current_stage, query, hit.source)
                    continue
                report_candidate('下载与可读性检查', query, hit.source, substage='下载原图')
                download_attempted += 1
                raw = download(hit)
                if not raw:
                    blocked['图片下载失败'] += 1
                    report_candidate('下载失败', query, hit.source)
                    continue
                downloaded_count += 1
                try:
                    width, height = src._measure(raw, hit.image_url)
                except src.ImageError:
                    blocked['图片不可读'] += 1
                    if url_key:
                        permanent_urls[url_key] = '图片格式或数据不可读'
                        round_processed.add(url_key)
                    report_candidate('可读性检查失败', query, hit.source)
                    continue
                if min(width, height) < 400:
                    blocked['尺寸不足'] += 1
                    if url_key:
                        permanent_urls[url_key] = '图片尺寸不足'
                        round_processed.add(url_key)
                    report_candidate('尺寸不足', query, hit.source)
                    continue
                digest = src._dhash(raw)
                if any(src._similar(digest, old) for old in hashes):
                    blocked['图片内容重复'] += 1
                    if url_key:
                        permanent_urls[url_key] = '图片内容与本篇既有候选近似'
                        round_processed.add(url_key)
                    report_candidate('去重', query, hit.source,
                                     duplicate=blocked['跨轮 URL 重复'] + blocked['图片内容重复'])
                    continue
                if time.monotonic() >= deadline:
                    budget_reasons.add('配图下载与校验时间预算已用尽')
                    halted = True
                    report_candidate('时间预算已用尽', query, hit.source,
                                     budget_reason='配图下载与校验时间预算已用尽')
                    break
                report_candidate('候选暂存', query, hit.source, substage='本地尺寸与像素去重通过，留待人工审核')
                try:
                    report_candidate('候选暂存', query, hit.source, substage='写入本轮候选')
                    file = src._save_image(
                        raw, hit.image_url, stage, '网络候选_' + uuid.uuid4().hex[:12])
                except (OSError, src.ImageError) as exc:
                    blocked['保存失败'] += 1
                    hint(f'[配图结果] 关键词「{query}」的候选保存失败：{exc}；继续检查后续候选。')
                    report_candidate('候选保存失败', query, hit.source, error=str(exc))
                    continue
                result = {'原始文件名': file.name, '原始标题': hit.title,
                          '平台': hit.platform, '来源': hit.source,
                          '图片链接': hit.image_url, '文章链接': hit.page_url,
                          '搜索词': query, '宽': width, '高': height,
                          '图注': src.caption_for(hit), '角色': '配图',
                          '关键词类型': plan.get('keyword_type', 'core'),
                          '关联主体': plan.get('subject_query', ''),
                          '场景方向': plan.get('scene_term', ''),
                          '关键词版本': data.get('keyword_version', package.get('keyword_version', 1)),
                          '计划位置': plan['position_id'], '计划顺序': plan['order'],
                          '插入到小标题': plan.get('heading', ''),
                          '需要画面': '', '排除画面': [], '对应正文': query}
                results.append(result)
                background_accepted += plan.get('keyword_type') == 'background'
                passed_counts[query] += 1
                hashes.append(digest)
                if url_key:
                    urls.add(url_key)
                    round_processed.add(url_key)
                report_candidate('候选已通过并暂存', query, hit.source)
                if len(results) >= target:
                    break
            if halted or not advanced:
                break

        if checked >= TOPIC_CANDIDATE_CHECK_BUDGET and len(results) < target:
            hint(f'[配图结果] 已达到本轮 {TOPIC_CANDIDATE_CHECK_BUDGET} 条候选检查上限。')
        for plan in plan_items:
            if plan.get('keyword_type') == 'scene' and plan.get('scene_term') in topic_packages.INFO_MATERIAL_TERMS:
                if not found_counts.get(plan['query']):
                    hint(f'[无图] 信息素材方向「{plan["query"]}」：所选图源没有返回候选；不会用人物照片代替声明、公告或新闻材料。')
                elif not passed_counts.get(plan['query']):
                    hint(f'[无图] 信息素材方向「{plan["query"]}」：本轮没有图片通过材料可读性、来源与相关性检查；普通人物照片不计入。')
                continue
            if not found_counts.get(plan['query']):
                hint(f'[无图] 关键词「{plan["query"]}」：所选图源没有返回候选图片。')
            elif (not checked_counts.get(plan['query']) and not filter_budget_exhausted
                  and not filter_failed):
                hint(f'[无图] 关键词「{plan["query"]}」：相关性检查没有放行候选。')
        if budget_reasons:
            hint('[配图结果] 本轮已触及预算上限：' + '；'.join(sorted(budget_reasons)))
        duplicate_count = (blocked['URL重复'] + blocked['跨轮 URL 重复']
                           + blocked['图片内容重复'])
        failure_summary = '；'.join(f'{reason} {amount} 张' for reason, amount in blocked.items())
        stage_metrics = (
            f'搜索返回 {raw_hit_count} 条候选；规则预筛移除 {rule_prefiltered_count} 条；'
            f'文本模型实际检查 {screened_count}/{filter_check_total} 条、放行 {text_model_accepted} 条；'
            f'模型未答复并排除 {text_model_unanswered} 条；'
            f'下载尝试 {download_attempted} 条、成功 {downloaded_count} 条；候选进入待审核列表。'
        )
        shortfall = max(0, target - len(results))
        if not raw_hit_count:
            round_status = 'no_results'
            stage_name = '无搜索结果'
            outcome = stage_metrics + '图源没有返回候选图片，本轮新增 0 张。'
        elif results:
            round_status = 'partial' if shortfall else 'completed'
            stage_name = '候选检查部分完成' if shortfall else '候选检查完成'
            outcome = stage_metrics + f'本轮新增 {len(results)} 张待审核候选。'
            if shortfall:
                outcome += f'有限目标 {target} 张，尚差 {shortfall} 张。'
        else:
            round_status = 'no_approved'
            stage_name = '没有合格候选'
            outcome = stage_metrics + '本轮没有新增合格图片。'
        if failure_summary:
            outcome += '分类统计：' + failure_summary + '。'
        if budget_reasons:
            outcome += '停止原因：' + '；'.join(sorted(budget_reasons)) + '。'
        hint('[配图结果] ' + outcome)
        processed_urls = round_processed | set(existing_urls) | set(permanent_urls)
        for key, pages in page_records.items():
            if not isinstance(pages, dict):
                continue
            for record in pages.values():
                if isinstance(record, dict) and record.get('success'):
                    record['complete'] = all(url in processed_urls
                                             for url in record.get('urls', []))
            try:
                cursor = max(0, int(history['next_pages'].get(key, 0)))
            except (TypeError, ValueError):
                cursor = 0
            while cursor < 20:
                record = pages.get(str(cursor))
                if not isinstance(record, dict) or not record.get('success') or not record.get('complete'):
                    break
                cursor += 1
            history['next_pages'][key] = cursor
        round_record.update({'status': round_status, 'finished_at': datetime.now().isoformat(timespec='seconds'),
                             'found': sum(found_counts.values()), 'checked': checked,
                             'accepted': len(results), 'duplicate': duplicate_count,
                             'text_input_count': filter_input_count,
                             'text_rule_prefiltered': rule_prefiltered_count,
                             'text_model_candidates': filter_check_total,
                             'text_model_checked': screened_count,
                             'text_model_accepted': text_model_accepted,
                             'text_model_unanswered': text_model_unanswered,
                             'download_attempted': download_attempted,
                             'downloaded': downloaded_count,
                             'blocked': dict(blocked), 'summary': outcome,
                             'budget_reasons': sorted(budget_reasons)})
        data['_topic_search_history'] = history
        data['_topic_round_status'] = round_status
        data['_topic_round_summary'] = outcome
        if not results:
            _save_topic_search_history(folder, history)
        emit(stage=stage_name, query='', source='',
             keywords_done=sum(len(seen) >= len(sources) for seen in searched_sources.values()),
             keywords_total=len(plan_items), found=sum(found_counts.values()),
             screened=screened_count, screen_total=filter_check_total,
             candidate_checked=checked, accepted=len(results), target=target,
             duplicate=duplicate_count, budget_exhausted=bool(budget_reasons),
             budget_reason='；'.join(sorted(budget_reasons)),
             blocked=dict(blocked), result=outcome)
        return results
    except Exception as exc:
        round_record.update({'status': 'failed',
                             'finished_at': datetime.now().isoformat(timespec='seconds'),
                             'found': sum(found_counts.values()),
                             'checked': checked,
                             'accepted': len(locals().get('results', [])),
                             'text_input_count': filter_input_count,
                             'text_rule_prefiltered': rule_prefiltered_count,
                             'text_model_candidates': filter_check_total,
                             'text_model_checked': screened_count,
                             'text_model_accepted': text_model_accepted,
                             'text_model_unanswered': text_model_unanswered,
                             'download_attempted': download_attempted,
                             'downloaded': downloaded_count,
                             'summary': str(exc)[:500]})
        for role in role_state.values() if 'role_state' in locals() else []:
            if role.get('status') == '运行中':
                role.update({'status': '失败', 'detail': '本轮在当前阶段中断；未完成候选未放行',
                             'result': str(exc)[:180]})
        try:
            _save_topic_search_history(folder, history)
            if 'emit' in locals():
                emit(stage='本轮失败', query='', source='', error=str(exc),
                     result='已保留此前已提交候选；未完成部分可在本篇重试')
        except (OSError, ValueError):
            pass
        raise
    finally:
        for source in sources:
            try:
                source.close()
            except Exception:
                pass


def _install_candidates(topic, folder, stage, manifest, results, search_history=None):
    """Commit pictures and review metadata together, or restore the old state."""
    paths = [folder / name for name in (src.MANIFEST_FILE, review.REVIEW_FILE, review.SELECTION_FILE)]
    if search_history is not None:
        paths.append(folder / TOPIC_SEARCH_HISTORY_FILE)
    previous = {path: path.read_bytes() if path.exists() else None for path in paths}
    temporary_paths = [path.with_name(path.name + '.tmp') for path in paths[1:]]
    previous_temps = {path: path.read_bytes() if path.exists() else None for path in temporary_paths}
    moved = []
    try:
        for item in results:
            name = item['原始文件名']
            if Path(name).name != name or not (stage / name).is_file() or (folder / name).exists():
                raise ValueError('候选图片文件不合法或已存在，请重试')
            (stage / name).rename(folder / name)
            moved.append(name)
        temp = stage / 'manifest.json'
        temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        temp.replace(paths[0])
        if search_history is not None:
            review._write_json(folder / TOPIC_SEARCH_HISTORY_FILE, search_history)
        replacement = next((str(item.get('替换原图') or '') for item in results
                            if item.get('替换原图')), '')
        review.save_candidate_review(
            topic, [i['原始文件名'] for i in results], replace_image=replacement)
    except Exception:
        for path, raw in {**previous, **previous_temps}.items():
            if raw is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(raw)
        for name in moved:
            (folder / name).replace(stage / name)
        raise


def _discard_unkept_previous_candidates(topic, folder, hint):
    """Retain explicit approvals and remove older unkept candidates before a new round."""
    with review.ledger_file_lock(review._state_lock_target(folder / review.REVIEW_FILE)):
        current = review.load_review(folder)
        # A later search may retire undecided candidates, but an explicit
        # rejection is a user decision and must survive retries just like
        # an approval.
        discarded = [path for path in review._image_paths(folder)
                     if current['states'].get(path.name) == 'pending']
        if not discarded:
            return
        discarded_names = {path.name for path in discarded}
        manifest = _metadata(folder)
        history = _load_topic_search_history(folder, topic_packages.load(folder)['topic_id'])
        for item in manifest.get('配图', []):
            if isinstance(item, dict) and item.get('原始文件名') in discarded_names:
                url = _normalized_image_url(item.get('图片链接'))
                if url:
                    history['permanent_urls'].setdefault(url, '上一轮未保留')
        kept_manifest = {**manifest, '配图': [item for item in manifest.get('配图', [])
                       if not isinstance(item, dict) or item.get('原始文件名') not in discarded_names]}
        kept_states = {name: state for name, state in current['states'].items()
                       if state in {'approved', 'rejected'}}
        kept_names = review._approved_names(current, folder)
        kept_positions = {name: value for name, value in review.load_positions(folder).items()
                          if name in kept_states}
        kept_review = {'states': kept_states,
                       'cover': current['cover'] if current['cover'] in kept_states else '',
                       'revision': current['revision'] + 1, 'needs_layout': True}
        files = [folder / src.MANIFEST_FILE, folder / review.REVIEW_FILE,
                 folder / review.SELECTION_FILE, folder / TOPIC_SEARCH_HISTORY_FILE]
        previous = {path: path.read_bytes() if path.exists() else None for path in files}
        moved = []
        with tempfile.TemporaryDirectory(prefix='.旧轮未保留-', dir=folder) as temporary:
            staging = Path(temporary)
            try:
                for path in discarded:
                    path.rename(staging / path.name)
                    moved.append(path.name)
                review._write_json(files[0], kept_manifest)
                review._write_json(files[1], kept_review)
                review._write_json(files[2], {'保留图片': kept_names, '图片位置': kept_positions})
                review._write_json(files[3], history)
            except Exception:
                for path, raw in previous.items():
                    if raw is None:
                        path.unlink(missing_ok=True)
                    else:
                        path.write_bytes(raw)
                for name in moved:
                    (staging / name).rename(folder / name)
                raise
    hint(f'[配图结果] 开始新一轮前已删除上一轮未保留的 {len(discarded)} 张图片，已保留图片继续显示。')


def run(data, *, hint=print):
    """Run one candidate action without ever approving or finalizing it."""
    data = validate(data)
    folder = review.topic_path(data['topic'])
    if data.get('topic_package') and data['mode'] == 'search' and not data['image']:
        _discard_unkept_previous_candidates(data['topic'], folder, hint)
    initial = review.load_review(folder)
    return _run_validated(data, folder=folder, initial=initial, hint=hint)


def _run_validated(data, *, folder, initial, hint=print):
    document = (topic_packages.synthetic_document(folder) if data.get('topic_package')
                else review.source_document(folder))
    manifest = _metadata(folder)
    context = next((i for i in manifest['配图'] if i['原始文件名'] == data['image']), {})
    config.DATA.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='配图候选-', dir=config.DATA) as tmp:
        stage = Path(tmp)
        results = []
        network_error = ''
        if data['mode'] in {'search', 'auto'} and data['count']:
            hint('[进度] 优先搜索网络图片，保留现有可用图片。')
            try:
                results = _network(data, document, folder, stage, context, hint)
            except Exception as exc:
                if data.get('topic_package'):
                    network_error = str(exc)
                    hint(f'[提示] 按选题清单搜图未完成：{exc}；未自动换模型、未分析 Word、未调用 AI 生图。')
                elif data['mode'] == 'auto':
                    hint(f'[提示] 网络搜图未完成：{exc}；自动尝试 GPT 生图补齐。')
                elif data['image']:
                    hint(f'[提示] 网络搜图未完成：{exc}；替换图片将尝试 GPT 生图补缺。')
                else:
                    hint(f'[提示] 网络搜图未完成：{exc}；此次仅网络搜图，不会调用 AI 配图。')
        fallback = data['mode'] == 'generate' or (not data.get('topic_package') and (
            data['mode'] == 'auto' or (data['mode'] == 'search' and bool(data['image']))))
        if len(results) < data['count'] and fallback:
            if data['mode'] == 'generate':
                profile = (data['model'], model_settings.resolve_image(data['provider'], data['model']))
            else:
                profile = src._image_ai_profile()
            if profile:
                sections = [i for i, block in enumerate(document.blocks) if block.kind in {'h2', 'h3'}]
                for index in range(data['count'] - len(results)):
                    if sections and not data['image']:
                        section = sections[min(len(sections)-1, round(index * (len(sections)-1) / max(1, data['count']-1)))]
                        paragraph = src._section_text(document.blocks, section)[:1800]
                    else:
                        paragraph = context.get('对应正文') or '\n'.join(b.text for b in document.blocks)[:3000]
                    prompt = src.illustration_prompt(document, paragraph,
                        index=index + len(results) + 1, requirement=data['query'], hint=hint)
                    hint(f'[进度] GPT 自动补图 {len(results)+1}/{data["count"]} 张 · {profile[0]}')
                    generated = src.generate_ai_image(prompt,
                        stage, stem='AI示意图_' + uuid.uuid4().hex[:12], hint=hint, profile=profile)
                    if not generated:
                        break
                    file, width, height, model = generated
                    results.append({'原始文件名': file.name, '原始标题': 'AI示意图 · ' + document.title,
                        '平台': 'AI生成', '来源': model, '模型': model, '生成提示词': prompt,
                        '图片链接': 'ai://generated/' + file.name, '文章链接': '',
                        '宽': width, '高': height, '图注': 'AI生成示意图'})
        if not data['count']:
            hint(f'当前已有 {data["target_count"]} 张可用图片；请先完成审阅，再明确点击定稿。')
            return []
        if not results:
            if data.get('topic_package'):
                if data.get('_topic_round_summary'):
                    hint('[配图结果] ' + data['_topic_round_summary'])
                    return []
                result = ('本轮没有新增合格图片；已保存的候选和人工决定未更改。'
                          + (('搜图失败：' + network_error) if network_error else ''))
                hint('[配图结果] ' + result)
                stage_name = '相关性检查失败' if '相关性检查' in network_error else '本轮结束'
                _image_progress(hint, data['topic'], stage=stage_name, query='', source='',
                                accepted=0, target=data['count'], new_candidates=0,
                                result=result,
                                error=network_error or '未新增合格图片；已有候选和人工决定未改动。')
                return []
            if data['mode'] == 'search' and not data['image']:
                raise ValueError('未取得可用的网络图片；此次仅网络搜图，未调用 AI 配图。请调整关键词、来源或模型后重试。')
            raise ValueError('网络和 GPT 均未取得可用的新图片，旧图和原稿均保留。请调整关键词或检查图片模型。')
        if review.load_review(folder) != initial:
            raise ValueError('审阅状态已变化，请重新操作，未替换任何图片')
        for item in results:
            if data.get('topic_package'):
                item.update({'替换原图': data['image'],
                    '插入到段落': context.get('插入到段落', -1)})
            else:
                item.update({'角色': '正文配图', '替换原图': data['image'],
                    '插入到段落': context.get('插入到段落', -1),
                    '插入到小标题': context.get('插入到小标题', ''),
                    '对应正文': context.get('对应正文', document.title)})
        manifest['配图'].extend(results)
        resulting_count = sum(
            value != 'rejected' and name != data['image']
            for name, value in initial['states'].items()
        ) + len(results)
        manifest.update({'配图状态': '待审核',
                         '建议配图数': data['target_count'],
                         '配图计划版本': src.IMAGE_PLAN_VERSION,
                         '生成时间': datetime.now().isoformat(timespec='seconds')})
        if data.get('topic_package'):
            _image_progress(hint, data['topic'], stage='保存候选', query='', source='',
                            keywords_done=data.get('plan_keyword_count', 0),
                            keywords_total=data.get('plan_keyword_count', 0),
                            accepted=len(results), target=data['count'],
                            new_candidates=len(results))
        try:
            _install_candidates(data['topic'], folder, stage, manifest, results,
                                search_history=data.get('_topic_search_history')
                                if data.get('topic_package') else None)
        except Exception as exc:
            if data.get('topic_package'):
                try:
                    package = topic_packages.load(folder)
                    history = _load_topic_search_history(folder, package['topic_id'])
                    if history['rounds']:
                        history['rounds'][-1].update({'status': 'failed',
                            'finished_at': datetime.now().isoformat(timespec='seconds'),
                            'summary': f'候选文件提交失败：{str(exc)[:200]}'})
                        _save_topic_search_history(folder, history)
                except (OSError, ValueError, TypeError):
                    pass
                _image_progress(hint, data['topic'], stage='候选保存失败', query='', source='',
                                keywords_done=data.get('plan_keyword_count', 0),
                                keywords_total=data.get('plan_keyword_count', 0),
                                accepted=0, new_candidates=0,
                                target=data['count'], error=str(exc))
            raise
        if data.get('topic_package'):
            shortfall = max(0, data['count'] - len(results))
            round_error = data.get('_topic_round_error', '')
            round_summary = data.get('_topic_round_summary', '')
            final_stage = ('部分成功·画面审核失败' if round_error else
                           '候选已保存（待人工审核）' if not shortfall else '部分成功')
            _image_progress(hint, data['topic'],
                            stage=final_stage,
                            query='', source='', keywords_done=data.get('plan_keyword_count', 0),
                            keywords_total=data.get('plan_keyword_count', 0),
                            accepted=len(results), target=data['count'], shortfall=shortfall,
                            new_candidates=len(results),
                            result=round_summary or f'已保存 {len(results)} 张候选。',
                            error=round_error)
    shortfall = data['count'] - len(results)
    if shortfall:
        if data.get('topic_package'):
            if data.get('_topic_round_error'):
                hint(f'[配图结果] 已保留 {len(results)} 张已完成候选；本轮审核中断：{data["_topic_round_error"]}')
            else:
                hint(f'[配图结果] 已保存 {len(results)} 张新候选；本轮目标 {data["count"]} 张，尚差 {shortfall} 张。可查看本篇检查结果后手动继续搜图。')
            return results
        if data['mode'] == 'search' and not data['image']:
            raise ValueError(f'已保存 {len(results)} 张网络图片，还缺 {shortfall} 张；此次仅网络搜图，未调用 AI 配图。请继续重新搜图，或单独选择 AI 配图。')
        raise ValueError(f'已保存 {len(results)} 张新图片，还缺 {shortfall} 张；GPT 自动补图未完成，请检查图片模型后重试。')
    hint(f'新候选图片已保存为待审核；请逐张确认，保留的张数由你决定，随时可以定稿。')
    return results


def _finalize_five(topic, *, hint=print):
    """Finalize the pictures the user actually approved.

    The per-article plan is a suggestion: any non-empty approved selection can
    be finalized, so the choice never disappears just because the plan is not
    filled to the brim.
    """
    folder = review.topic_path(topic)
    current = review.load_review(folder)
    names = review._approved_names(current, folder)
    if not names:
        pending = sum(status == 'pending' for status in current['states'].values())
        if pending:
            raise ValueError(f'还有 {pending} 张图片待审核；请至少保留一张图片再定稿')
        raise ValueError('还没有保留任何图片；请先逐张选择保留、换一张或去掉')
    cover = current.get('cover')
    if cover in names:
        names = [cover] + [name for name in names if name != cover]
    document = review.source_document(folder)
    body_count = len(names) - 1
    slots = src.body_positions(document.blocks, body_count)
    if len(slots) < body_count:
        raise ValueError(f'正文段落不足，无法在不堆叠图片的情况下排入 {len(names)} 张图')
    positions = {name: slots[index] for index, name in enumerate(names[1:])}
    review.save_selection(topic, names, positions)
    hint(f'[进度] 已通过 {len(names)} 张，正在生成成稿…')
    review.reformat(topic)
    hint(f'已通过 {len(names)} 张并生成成稿，可继续审阅和逐张换图。')
    return []


if __name__ == '__main__':
    try:
        payload = json.loads(os.environ['ARTICLE_HUB_IMAGE_ACTION'])
        run(payload)
        if payload.get('_topic_round_error'):
            print('[审核失败] ' + str(payload['_topic_round_error']), flush=True)
            sys.exit(1)
    except Exception as exc:
        print(f'[待处理] {exc}', flush=True)
        sys.exit(1)
