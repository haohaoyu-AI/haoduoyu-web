"""Nonblocking topic jobs; each request uses its selected model credentials."""
import threading
import time
import uuid
from . import ai, model_settings, topics, topic_research, topic_research_sources

LOCK = threading.Lock()
OPERATION = {}
OPERATION_TIMEOUT = 120
OPERATION_TIMEOUTS = {'manual': 420, 'batch': 600}
OPERATION_TTL = 300


def _expire_locked(now=None):
    """Release a stuck/old operation so one failed model call cannot lock the UI."""
    now = time.time() if now is None else now
    if OPERATION.get('status') == 'running' and now >= OPERATION.get('deadline', now + 1):
        minutes = max(1, round(OPERATION.get('timeout', OPERATION_TIMEOUT) / 60))
        OPERATION.update(status='failed',
                         error=f'选题任务超过 {minutes} 分钟，已停止等待；可直接重试',
                         finished_at=now)
    elif (OPERATION.get('status') in {'done', 'failed'}
          and now - OPERATION.get('finished_at', now) > OPERATION_TTL):
        OPERATION.clear()


def snapshot(job_id):
    with LOCK:
        _expire_locked()
        if OPERATION.get('id') != job_id:
            raise ValueError('选题任务已过期，请重新获取推荐')
        return dict(OPERATION)


def cancel(job_id):
    with LOCK:
        if OPERATION.get('id') != job_id or OPERATION.get('status') != 'running':
            raise ValueError('没有正在运行的该项研究')
        OPERATION.update(status='failed', error='研究已停止', finished_at=time.time())
    return {'ok': True}


def _cancelled(job_id):
    with LOCK:
        _expire_locked()
        return OPERATION.get('id') != job_id or OPERATION.get('status') != 'running'


def _fail_if_current(job_id, exc):
    """Publish a worker failure only while that worker still owns the slot."""
    with LOCK:
        now = time.time()
        _expire_locked(now)
        if OPERATION.get('id') != job_id or OPERATION.get('status') != 'running':
            return False
        OPERATION.update(status='failed', error=str(exc)[:300], finished_at=now)
        return True


def _commit_if_current(job_id, commit):
    """Run a short commit while the job is current and before its deadline.

    The lock closes the gap between checking ownership and writing files: a
    timeout or replacement cannot occur between those two operations.
    """
    with LOCK:
        now = time.time()
        _expire_locked(now)
        if OPERATION.get('id') != job_id or OPERATION.get('status') != 'running':
            return False
        try:
            result = commit()
        except Exception as exc:
            OPERATION.update(status='failed', error=str(exc)[:300], finished_at=time.time())
        else:
            OPERATION.update(status='done', result=result, finished_at=time.time())
        return True


def start(kind, data):
    if not isinstance(data, dict):
        raise ValueError('选题数据不合法')
    if kind not in {'recommendations', 'rewrite', 'manual', 'batch'}:
        raise ValueError('不支持的选题任务')
    choice = model_settings.public_config()['choices']['topics']
    mode = data.get('mode', 'fast') if kind == 'recommendations' else 'fast'
    if mode not in {'fast', 'deep'}:
        raise ValueError('选题方式无效')
    model = data.get('model') or choice['model']
    profile = model_settings.resolve(data.get('provider') or choice['provider'], model)
    names = data.get('sources', list(topics.TOPIC_SOURCES))
    allowed_sources = (topic_research_sources.SOURCES if mode == 'deep'
                       else topics.TOPIC_SOURCES)
    if not isinstance(names, list) or not names or any(n not in allowed_sources for n in names):
        if kind == 'manual':
            names = list(topics.TOPIC_SOURCES)  # 人工选题不依赖热榜来源
        else:
            raise ValueError('请至少选择一个有效热榜来源')
    categories = topics.selected_categories(data.get('categories', []))
    direction = str(data.get('direction') or '').strip()[:120]
    hours = data.get('hours', 72)
    count = data.get('count', 5)
    if mode == 'deep' and (hours not in {24, 72, 168} or count not in {5, 10}):
        raise ValueError('时间范围或推荐数量无效')
    if mode == 'deep':
        states = {row['name']: row['state'] for row in topic_research_sources.source_status()}
        if any(states.get(name) != 'ready' for name in names):
            raise ValueError('所选平台尚未就绪，请检查数据来源状态')
    titles = topics.normalize_manual_titles(data.get('titles')) if kind == 'manual' else []
    if kind == 'rewrite' and not str(data.get('title', '')).strip():
        raise ValueError('请选择一条推荐')
    items = data.get('items', [])
    if kind == 'batch' and (not isinstance(items, list) or not 1 <= len(items) <= 6
                           or any(not isinstance(item, dict) or not str(item.get('title', '')).strip() for item in items)):
        raise ValueError('请选择 1 至 6 条有效选题')
    timeout = 420 if kind == 'recommendations' and mode == 'deep' else OPERATION_TIMEOUTS.get(kind, OPERATION_TIMEOUT)
    with LOCK:
        now = time.time()
        _expire_locked(now)
        if OPERATION.get('status') == 'running':
            raise ValueError('选题任务正在运行，请等待完成')
        job_id = uuid.uuid4().hex
        OPERATION.clear()
        OPERATION.update(id=job_id, status='running', started_at=now,
                         deadline=now + timeout, timeout=timeout, kind=kind, progress=[])

    def hint(message):
        """把工作线程的进度写进状态，让页面上的等待看得见。"""
        text = str(message)
        with LOCK:
            if OPERATION.get('id') != job_id or OPERATION.get('status') != 'running':
                return
            lines = OPERATION.setdefault('progress', [])
            lines.append(text)
            del lines[:-24]

    def work():
        try:
            with ai.using_profile(profile):
                if kind == 'recommendations':
                    if mode == 'deep':
                        result = topic_research.run(names=names, categories=categories,
                            direction=direction, hours=hours, count=count, model=model,
                            cancelled=lambda: _cancelled(job_id), hint=hint,
                            refresh=data.get('refresh') is True)
                        commit = lambda: topic_research.commit(result)
                    else:
                        result = topics.live_recommendations(sources_names=names, categories=categories, model=model)
                        commit = lambda: result
                elif kind == 'manual':
                    prepared = topics.prepare_manual_topics(
                        titles, model=model, sources_names=names, hint=hint)
                    commit = lambda: topics.commit_manual_topics(prepared)
                elif kind == 'batch':
                    prepared_items = []
                    for index, item in enumerate(items):
                        if _cancelled(job_id):
                            return
                        hint(f'正在生成 {index + 1}/{len(items)}：{item["title"]}')
                        research = (topic_research.candidate(item['research_id'], item['candidate_id'])
                                    if item.get('research_id') or item.get('candidate_id') else None)
                        trusted = research['item'] if research else item
                        prepared_items.append(topics.prepare_recommendation(
                            title=trusted['title'], detail=trusted.get('detail', ''),
                            potential=trusted.get('potential', ''), source=trusted.get('source', ''),
                            model=model, research=research))
                    def commit():
                        from pathlib import Path
                        results = [topics.commit_recommendation(item, update_batch=False) for item in prepared_items]
                        topics.mark_batch([Path(item['merged']) for item in prepared_items])
                        return {'items': results}
                else:
                    research = (topic_research.candidate(data['research_id'], data['candidate_id'])
                                if data.get('research_id') or data.get('candidate_id') else None)
                    trusted = research['item'] if research else data
                    prepared = topics.prepare_recommendation(title=trusted['title'], detail=trusted.get('detail', ''),
                        potential=trusted.get('potential', ''), source=trusted.get('source', ''),
                        model=model, research=research)
                    commit = lambda: topics.commit_recommendation(prepared)
        except Exception as exc:
            _fail_if_current(job_id, exc)
            return
        # A timed-out request may already have been replaced by a newer one.
        # Only this guarded boundary is allowed to publish results or files.
        _commit_if_current(job_id, commit)
    threading.Thread(target=work, daemon=True).start()
    return {'id': job_id, 'status': 'running'}
