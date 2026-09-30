"""Per-workflow model choices and separate local provider credentials."""
import json
import re
import urllib.request
import urllib.error
from urllib.parse import urlsplit

from . import config


def _path():
    return config.DATA / '模型服务.json'


def _load():
    if not _path().exists():
        return {'providers': {}, 'choices': {}}
    try:
        data = json.loads(_path().read_text(encoding='utf-8'))
        if (not isinstance(data, dict)
                or not isinstance(data.get('providers', {}), dict)
                or not isinstance(data.get('choices', {}), dict)):
            raise ValueError()
        return data
    except (ValueError, OSError) as exc:
        raise ValueError('模型配置无法读取，请检查 data/模型服务.json') from exc


def _save(data):
    _path().parent.mkdir(parents=True, exist_ok=True)
    temporary = _path().with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(_path())


def providers():
    from . import ai
    legacy = {} if ai.network_model_config_is_project_only() else ai.legacy_settings()
    rows = {
        'doubao': {'name':'豆包（火山方舟）', 'base_url':'https://ark.cn-beijing.volces.com/api/v3', 'api_key':'', 'wire_api':'chat', '模型':'', 'models':[]},
        'deepseek': {'name':'DeepSeek', 'base_url':'https://api.deepseek.com', 'api_key':'', 'wire_api':'chat', '模型':'', 'models':[]},
        'gpt': {'name':'GPT', 'base_url':'https://api.openai.com/v1', 'api_key':'', 'wire_api':'responses', '模型':'', 'models':[]},
    }
    family = 'deepseek' if str(legacy.get('模型', '')).lower().startswith('deepseek') else 'gpt'
    rows[family].update(legacy)
    rows[family]['models'] = [legacy['模型']] if legacy.get('模型') else []
    for key, value in _load().get('providers', {}).items():
        if key in rows and isinstance(value, dict):
            # A saved provider is a complete profile: never inherit another endpoint's key.
            rows[key] = value
    return rows


def project_settings():
    """Resolve the saved topic profile without consulting machine-wide settings."""
    data = _load()
    choices = data.get('choices', {})
    if not isinstance(choices, dict):
        raise ValueError('项目模型配置中的 choices 格式不正确')
    choice = choices.get('topics', {})
    if choice is None:
        choice = {}
    if not isinstance(choice, dict):
        raise ValueError('项目选题模型配置格式不正确')
    rows = providers()
    provider = choice.get('provider')
    model = choice.get('model') or ''
    if provider is None:
        provider = next((key for key in ('deepseek', 'gpt', 'doubao')
                         if rows[key].get('api_key') and rows[key].get('模型')), 'deepseek')
    if provider not in rows:
        raise ValueError('项目选题模型配置无效，请在模型设置中重新选择服务')
    row = rows[provider]
    model = model or row.get('模型', '')
    if model and row.get('api_key'):
        return resolve(provider, model)
    return {**row, 'api_key': '', '模型': model}


def recommended_models(models, scope):
    """Small workflow menus from IDs actually returned by Ark; never invent IDs."""
    groups = (
        [(r'doubao-seed-([\d-]+)-pro-(\d{6,8})', '选题首选'),
         (r'deepseek-v([\d-]+)-pro(?:-ga)?-(\d{6,8})', '选题备选'),
         (r'glm-([\d-]+)-(\d{6,8})', '选题备选')]
        if scope == 'topics' else
        [(r'doubao-seed-([\d-]+)-turbo-(\d{6,8})', '配图首选'),
         (r'deepseek-v([\d-]+)-flash(?:-ga)?-(\d{6,8})', '配图备选'),
         (r'doubao-seed-([\d-]+)-lite-(\d{6,8})', '配图备选')]
    )
    result = []
    for pattern, label in groups:
        candidates = []
        for model in models:
            match = re.fullmatch(pattern, model)
            if match:
                version = tuple(int(x) for x in match[1].split('-'))
                date = match[2] if len(match[2]) == 8 else '20' + match[2]
                candidates.append((version, date, model))
        if candidates:
            result.append({'id': max(candidates)[2], 'label': label})
    return result


def is_image_model(model):
    """Recognise generation families, not text models with vision input."""
    return isinstance(model, str) and bool(re.search(
        r'(?:^|[-_/])(?:seedream|gpt-image|dall-e|image-generation)(?:[-_/]|$)',
        model.lower()))


# 豆包推荐菜单保持精简；协作角色允许输入当前服务实际分配的自定义型号/接入点 ID。
DOUBAO_COLLABORATION_MODELS = (
    'doubao-seed-2-1-turbo-260628',
    'doubao-seed-2-1-pro-260628',
)


def collaboration_model_options():
    """Return configured models for the two image-workflow roles.

    Menus contain the compact supported list; custom IDs are validated
    against the configured provider when saved.
    """
    rows = providers()
    options = []
    for role in ('text', 'layout'):
        for key, row in rows.items():
            if not row.get('api_key'):
                continue
            known = list(dict.fromkeys(
                list(row.get('models', [])) + ([row.get('模型')] if row.get('模型') else [])))
            for model in known:
                if (not isinstance(model, str) or not model
                        or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}', model)
                        or is_image_model(model)):
                    continue
                if key == 'doubao' and model not in DOUBAO_COLLABORATION_MODELS:
                    continue
                options.append({'role': role, 'provider': key, 'model': model,
                                'label': row.get('name', key) + ' · ' + model})
    return options


def _model_lists(row):
    known = list(dict.fromkeys(model for model in
        list(row.get('models', [])) + list(row.get('image_models', []))
        if isinstance(model, str)))
    return ([model for model in known if not is_image_model(model)],
            [model for model in known if is_image_model(model)])


def public_config():
    from . import ai
    rows = providers()
    if ai.network_model_config_is_project_only():
        stored = _load().get('choices', {})
        stored_topic = stored.get('topics', {}) if isinstance(stored, dict) else {}
        saved_provider = stored_topic.get('provider') if isinstance(stored_topic, dict) else None
        if saved_provider in rows:
            default = saved_provider
        else:
            default = next((key for key in ('deepseek', 'gpt', 'doubao')
                            if rows[key].get('api_key') and rows[key].get('模型')), 'deepseek')
    else:
        default = 'deepseek' if ai.legacy_settings().get('模型','').lower().startswith('deepseek') else 'gpt'
    choices = {'topics':{'provider':default, 'model':rows[default].get('模型','')},
               'images':{'provider':'rules', 'model':''}}
    choices.update(_load().get('choices', {}))
    if choices['images'].get('provider') not in {'gpt', 'deepseek', 'doubao'}:
        provider = next((key for key in ('doubao', 'deepseek', 'gpt') if rows[key].get('api_key')), 'deepseek')
        choices['images'] = {'provider': provider, 'model': rows[provider].get('模型', '')}
    if choices.get('image_generation', {}).get('provider') not in {None, 'gpt', 'doubao'}:
        choices.pop('image_generation')
    result = []
    for key, row in rows.items():
        text_models, image_models = _model_lists(row)
        # The DeepSeek service supplies text models, even if a stale local
        # configuration happens to contain an image model from another service.
        if key == 'deepseek':
            image_models = []
        if key == 'doubao':
            # Keep the compact recommendation list; custom model IDs are entered in the
            # collaboration role controls and validated against the configured service.
            text_models = [m for m in text_models if m in set(DOUBAO_COLLABORATION_MODELS)]
        result.append({'id':key, 'name':row.get('name',key), 'base_url':row.get('base_url',''),
            'wire_api':row.get('wire_api','chat'), 'configured':bool(row.get('api_key')),
            'model':row.get('模型','') if not is_image_model(row.get('模型','')) else '',
            'models':text_models, 'image_models':image_models,
            'recommendations': {scope: recommended_models(text_models, scope) for scope in ('topics','images')}
                if key == 'doubao' else {}})
    try:
        collaboration = image_collaboration()
    except ValueError as exc:
        collaboration = {'mode':'single', 'roles':{}, 'error':str(exc)}
    return {'providers':result, 'choices':choices,
            'image_collaboration':collaboration,
            'collaboration_models': collaboration_model_options()}


def resolve(provider, model):
    rows = providers()
    if provider not in rows:
        raise ValueError('请选择 DeepSeek、GPT 或豆包接口')
    row = dict(rows[provider])
    if not row.get('api_key'):
        raise ValueError(f'{row.get("name",provider)} 尚未配置密钥，请先打开模型设置')
    if not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}', model):
        raise ValueError('请填写接口支持的具体模型 ID')
    row['模型'] = model
    return row


def resolve_image(provider, model):
    """Validate generation capability before allowing an image API request."""
    if provider == 'deepseek' or not is_image_model(model):
        raise ValueError('AI 配图需要图片生成模型（Seedream、GPT Image 等）；DeepSeek 等文本模型用于搜图，不能生成图片')
    return resolve(provider, model)


def validate_image_collaboration(payload, *, resolve_profiles=True):
    """Validate the two image-workflow roles without guessing model capabilities."""
    if not isinstance(payload, dict) or payload.get('mode') not in {'single', 'collaborative'}:
        raise ValueError('配图模型模式不正确')
    if payload['mode'] == 'single':
        return {'mode':'single', 'roles':{}}
    roles = payload.get('roles')
    if not isinstance(roles, dict) or set(roles) - {'text', 'vision', 'layout'}:
        raise ValueError('协作模式至少需要配置文本筛选、正文排版两个模型')
    if not roles.get('text') or not roles.get('layout'):
        raise ValueError('协作模式至少需要配置文本筛选、正文排版两个模型')
    clean = {}
    # Ignore the retired optional visual-audit role when loading old local settings.
    for role in ('text', 'layout'):
        value = roles.get(role)
        if value is None:
            continue
        if not isinstance(value, dict):
            raise ValueError('协作模型配置格式不正确')
        provider, model = value.get('provider'), value.get('model')
        if provider not in {'gpt', 'deepseek', 'doubao'}:
            raise ValueError('协作模式只使用已配置的 GPT、DeepSeek 或豆包服务')
        if not isinstance(model, str) or not model.strip():
            raise ValueError('请为每个协作职责选择具体型号')
        model = model.strip()
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}', model):
            raise ValueError(f'{role}职责的模型 ID 格式无效')
        if is_image_model(model):
            raise ValueError(f'{role}职责需要文本模型，不能使用图片生成型号')
        if resolve_profiles:
            resolve(provider, model)
        clean[role] = {'provider':provider, 'model':model}
    return {'mode':'collaborative', 'roles':clean}


def image_collaboration():
    raw = _load().get('image_collaboration')
    if raw is None:
        return {'mode':'single', 'roles':{}}
    return validate_image_collaboration(raw, resolve_profiles=False)


def save_image_collaboration(payload):
    clean = validate_image_collaboration(payload, resolve_profiles=True)
    data = _load()
    data['image_collaboration'] = clean
    if clean.get('mode') == 'collaborative':
        # Keep the legacy Word-image path on the same saved text model.
        data.setdefault('choices', {})['images'] = dict(clean['roles']['text'])
    _save(data)
    return clean


def save_choice(scope, provider, model):
    if scope not in {'topics','images','image_generation'}:
        raise ValueError('未知板块')
    if scope == 'images' and provider not in {'gpt', 'deepseek', 'doubao'}:
        raise ValueError('网络搜图只使用 GPT、DeepSeek 或豆包')
    if scope == 'image_generation':
        if provider not in {'gpt', 'doubao'}:
            raise ValueError('自动补图使用 GPT 图片模型或豆包 Seedream；DeepSeek 用于网络搜图')
        resolve_image(provider, model)
    else:
        if is_image_model(model):
            raise ValueError('选题和网络搜图需要文本模型；图片生成模型请在 AI 配图中选择')
        resolve(provider, model)
    data = _load()
    data.setdefault('choices', {})[scope] = {'provider':provider, 'model':model}
    _save(data)


def save_provider(payload):
    key = payload.get('provider')
    if key not in {'gpt','deepseek','doubao'}:
        raise ValueError('未知模型服务')
    old = providers()[key]
    base = str(payload.get('base_url','')).strip().rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('接口地址需为 HTTPS 地址，不应包含密钥或查询参数')
    wire = payload.get('wire_api')
    if wire not in {'chat','responses'}:
        raise ValueError('请选择受支持的接口格式')
    token = str(payload.get('api_key','')).strip()
    if not token:
        if base != old.get('base_url','').rstrip('/'):
            raise ValueError('更换接口地址时需填写该地址对应的密钥')
        token = old.get('api_key','')
    if not token:
        raise ValueError('请填写 API Key')
    data = _load()
    same = base == old.get('base_url','').rstrip('/')
    data.setdefault('providers', {})[key] = {'name':old.get('name',key), 'base_url':base,
        'wire_api':wire, 'api_key':token, '模型':old.get('模型','') if same else '',
        'models':old.get('models',[]) if same else [],
        'image_models':old.get('image_models',[]) if same else []}
    _save(data)


def discover(provider):
    row = providers().get(provider)
    if not row or not row.get('api_key'):
        raise ValueError('请先保存该接口的密钥')
    request = urllib.request.Request(row['base_url'].rstrip('/')+'/models',
                                    headers={'Authorization':'Bearer '+row['api_key']})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
        models = sorted({item['id'] for item in payload.get('data', [])
                         if isinstance(item, dict) and isinstance(item.get('id'), str)
                         and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}', item['id'])
                         and (is_image_model(item['id']) or not any(word in item['id'].lower()
                             for word in ('image','embedding','audio','tts','whisper','moderation','auto-review')))})
    except urllib.error.HTTPError as exc:
        messages = {401:'密钥验证失败（401）：请核对 API Key 和接口地址是否来自同一家服务商',
                    403:'接口拒绝访问（403）：请检查账户权限',
                    429:'接口限流或额度不足（429）：请稍后再试'}
        raise ValueError(messages.get(exc.code, f'接口返回 HTTP {exc.code}，请检查地址和账户状态')) from exc
    except Exception as exc:
        raise ValueError('无法读取模型列表，请检查接口配置；也可手动填写模型 ID') from exc
    if not models:
        raise ValueError('接口未返回可用的文本或图片生成模型列表，可手动填写模型 ID')
    data = _load()
    row['models'] = models
    row['image_models'] = []
    text_models, image_models = _model_lists(row)
    row['image_models'] = image_models
    if row.get('模型') not in text_models:
        row['模型'] = text_models[0] if text_models else ''
    data.setdefault('providers', {})[provider] = row
    _save(data)
    return models
