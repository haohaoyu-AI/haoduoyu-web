"""One bounded 375px touch check of create-failure feedback above a long list.

Run against tests/daily-todos-browser-server.mjs after the product build.
Uses real synthetic Cookie/CSRF and D1; only the first create response is injected.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import traceback
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/daily-todos/feedback'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:' + os.environ.get('DAILY_TODOS_PORT', '8797')
DAY = '2026-10-23'
HARNESS = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", HARNESS).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", HARNESS).group(1)
assert USERNAME.startswith('synthetic-')
DRAFT = '保存失败后保留的合成计划，请主动重试'
FAILURE = '合成测试：暂时无法保存，输入已保留，请重试。'
REPORT = {'synthetic': True, 'completed': False, 'viewport': {'width': 375, 'height': 844},
          'checks': {}, 'browser_responses': [], 'pageerrors': [], 'blocked_external_requests': [],
          'test_source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


def save():
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))


def mark(name, evidence=True):
    REPORT['checks'][name] = evidence
    save()
    print('Passed: ' + name, flush=True)


def safe_exception(kind, error, frames):
    REPORT['failure'] = {'type': kind.__name__, 'message': str(error).replace(PASSWORD, '[redacted]')}
    save()
    sys.stderr.write(''.join(traceback.format_exception(kind, error, frames)).replace(PASSWORD, '[redacted]'))


sys.excepthook = safe_exception
expect.set_options(timeout=10000)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    REPORT['browser'] = {'engine': 'Chromium', 'version': browser.version, 'touch_emulation': True}
    context = browser.new_context(viewport=REPORT['viewport'], is_mobile=True, has_touch=True,
                                  locale='zh-CN', timezone_id='Asia/Shanghai')
    context.add_init_script("""const NativeDate=Date;globalThis.Date=class extends NativeDate {
      constructor(...args){super(...(args.length?args:[NativeDate.parse('2026-10-23T15:59:58.000Z')]));}
      static now(){return NativeDate.parse('2026-10-23T15:59:58.000Z');}};""")

    def local_only(route):
        if route.request.url.startswith(ORIGIN + '/'):
            route.continue_()
        else:
            REPORT['blocked_external_requests'].append(route.request.url)
            route.abort()

    context.route('**/*', local_only)
    page = context.new_page()
    page.on('pageerror', lambda error: REPORT['pageerrors'].append(str(error)))
    page.on('response', lambda response: REPORT['browser_responses'].append({
        'method': response.request.method, 'path': response.url.removeprefix(ORIGIN), 'status': response.status})
        if response.url.startswith(ORIGIN + '/api/v1/') else None)
    loaded_assets = {}
    page.on('response', lambda response: loaded_assets.setdefault(response.url.removeprefix(ORIGIN), response)
            if response.url in [ORIGIN + '/app.js', ORIGIN + '/style.css'] else None)
    metadata = page.request.get(ORIGIN + '/__synthetic-fixture').json()
    assert metadata['synthetic']
    REPORT['fixture'] = {key: metadata[key] for key in ['source_commit', 'product_manifest_sha256', 'isolation']}
    REPORT['product_hashes'] = {path: metadata['product_hashes'][path]
                               for path in ['public/app.js', 'public/style.css', 'dist/server/index.js']}
    page.goto(ORIGIN + '/?page=todos', wait_until='networkidle')
    page.locator('#username').fill(USERNAME)
    page.locator('#password').fill(PASSWORD)
    page.locator('#login-form button[type=submit]').tap()
    page.locator('#page-content[aria-busy=false]').wait_for()
    expect(page.locator('#todo-text')).to_be_visible()
    expect(page.locator('#todo-status')).not_to_have_text('正在读取计划…')
    # Capture while the document still owns these network response bodies;
    # Chromium may release them after the deliberate reload below.
    REPORT['loaded_asset_hashes'] = {path: hashlib.sha256(loaded_assets[path].body()).hexdigest()
                                    for path in ['/app.js', '/style.css']}
    identity = page.request.get(ORIGIN + '/api/v1/auth/me').json()['data']
    headers = {'Origin': ORIGIN, 'X-CSRF-Token': identity['csrfToken']}

    def items():
        response = page.request.get(ORIGIN + '/api/v1/todos?date=' + DAY)
        assert response.status == 200
        return response.json()['data']['items']

    def ui_rows():
        return page.locator('.daily-todo-row').evaluate_all("""rows=>rows.map(row=>({
          id:row.dataset.id,text:row.querySelector('.daily-todo-text').textContent,
          completed:row.querySelector('input[type=checkbox]').checked,
          strikethrough:getComputedStyle(row.querySelector('.daily-todo-text')).textDecorationLine.includes('line-through')
        }))""")

    assert items() == [], 'Start a fresh isolated fixture for this bounded check'
    seeded_statuses = []
    for index in range(24):
        created = page.request.post(ORIGIN + '/api/v1/todos', headers=headers, data={
            'id': str(uuid.uuid4()), 'date': DAY,
            'text': f'合成计划 {index + 1:02d}：核对公开信息并整理今天的记录'})
        assert created.status == 201
        seeded_statuses.append(created.status)
        if index % 4 == 0:
            item = created.json()['data']
            completed = page.request.patch(ORIGIN + '/api/v1/todos/' + item['id'], headers=headers,
                                            data={'completed': True, 'version': item['version']})
            assert completed.status == 200
    page.reload(wait_until='networkidle')
    page.locator('#page-content[aria-busy=false]').wait_for()
    expect(page.locator('#todo-status')).not_to_have_text('正在读取计划…')
    expect(page.locator('.daily-todo-row')).to_have_count(24)
    before_api = items()
    before_ui = ui_rows()
    assert sum(item['completed'] for item in before_api) == 6
    assert page.evaluate('document.documentElement.scrollHeight > innerHeight')
    page.evaluate('window.scrollTo(0,0)')
    mark('long_list_seeded_with_real_api', {'items': 24, 'completed': 6,
        'create_statuses': seeded_statuses, 'content_height': page.evaluate('document.documentElement.scrollHeight')})

    attempts = []

    def fail_first_create(route):
        if route.request.method != 'POST':
            route.continue_()
            return
        attempts.append(route.request.post_data_json)
        if len(attempts) == 1:
            route.fulfill(status=503, content_type='application/json', body=json.dumps({
                'error': {'code': 'SYNTHETIC_FEEDBACK_503', 'message': FAILURE}}))
        else:
            route.continue_()

    page.route('**/api/v1/todos', fail_first_create)
    server_offset = len(page.request.get(ORIGIN + '/__synthetic-metrics').json())
    page.locator('#todo-text').fill(DRAFT)
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todos') as failed:
        page.locator('#todo-form button[type=submit]').tap()
    assert failed.value.status == 503
    assert failed.value.json()['error']['code'] == 'SYNTHETIC_FEEDBACK_503'
    expect(page.locator('#todo-feedback')).to_contain_text(FAILURE)
    expect(page.locator('#todo-form button[type=submit]')).to_be_enabled()
    expect(page.locator('#todo-text')).to_have_value(DRAFT)
    rects = page.evaluate("""() => {
      const box = selector => {const r=document.querySelector(selector).getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
      return {form:box('#todo-form'),feedback:box('#todo-feedback'),list:box('#todo-items'),
        nav:box('.mobile-nav'),viewport:{width:innerWidth,height:innerHeight},scroll_y:scrollY,
        feedback_follows_form:document.querySelector('#todo-form').nextElementSibling.id==='todo-feedback',
        feedback_before_list:Boolean(document.querySelector('#todo-feedback').compareDocumentPosition(
          document.querySelector('#todo-items')) & Node.DOCUMENT_POSITION_FOLLOWING)};
    }""")
    assert rects['feedback_follows_form'] and rects['feedback_before_list']
    assert rects['feedback']['top'] >= rects['form']['bottom']
    assert rects['feedback']['bottom'] <= rects['list']['top']
    assert rects['feedback']['top'] >= 0 and rects['feedback']['bottom'] < rects['nav']['top']
    assert rects['feedback']['bottom'] <= rects['viewport']['height']
    assert rects['feedback']['left'] >= 0 and rects['feedback']['right'] <= 375
    assert rects['scroll_y'] == 0
    assert page.locator('#todo-feedback').evaluate('node=>node.scrollHeight<=node.clientHeight')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    REPORT['date_controls'] = page.evaluate("""() => ({
      pointer_coarse:matchMedia('(pointer:coarse)').matches,
      controls:['[data-action=todo-prev]','#todo-date','[data-action=todo-next]','[data-action=todo-today]'].map(selector=>{
        const node=document.querySelector(selector),r=node.getBoundingClientRect(),s=getComputedStyle(node);
        const points=[[r.left+r.width/2,r.top+r.height/2],[r.left+2,r.top+2],
          [r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2]];
        return {selector,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
          computed_height:s.height,computed_min_height:s.minHeight,
          control_h_sm:s.getPropertyValue('--control-h-sm').trim(),
          interior_hit_tests:points.map(([x,y])=>({x,y,hit:node===document.elementFromPoint(x,y)
            || node.contains(document.elementFromPoint(x,y))}))};
      })
    })""")
    mark('complete_failure_feedback_is_in_first_viewport_below_form_above_list_and_nav', rects)

    assert ui_rows() == before_ui
    assert items() == before_api
    page.wait_for_timeout(1250)
    assert len(attempts) == 1
    receipts = page.request.get(ORIGIN + '/__synthetic-metrics').json()[server_offset:]
    assert not any(receipt['method'] == 'POST' and receipt['path'] == '/api/v1/todos' for receipt in receipts)
    mark('draft_rows_and_completion_unchanged_without_automatic_replay', {
        'observation_ms': 1250, 'browser_create_attempts': 1, 'server_create_attempts_after_injected_failure': 0,
        'draft_preserved': True, 'rows_unchanged': 24, 'completed_unchanged': 6})

    screenshot = OUT / 'failure-first-viewport-375.png'
    assert page.locator('input[type=password]').count() == 0
    page.screenshot(path=str(screenshot), full_page=False, animations='disabled')
    REPORT['screenshot'] = {'path': str(screenshot.relative_to(ROOT)),
                            'sha256': hashlib.sha256(screenshot.read_bytes()).hexdigest(),
                            'bytes': screenshot.stat().st_size, 'full_page': False}
    save()

    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todos') as retry:
        page.locator('#todo-form button[type=submit]').tap()
    assert retry.value.status == 201
    saved = retry.value.json()['data']
    expect(page.locator('#todo-text')).to_have_value('')
    expect(page.locator('.daily-todo-row')).to_have_count(25)
    expect(page.locator('#todo-feedback')).to_have_text('')
    assert len(attempts) == 2 and attempts[0] == attempts[1]
    assert saved['id'] == attempts[0]['id'] and saved['text'] == DRAFT
    after_api = items()
    assert len(after_api) == 25 and sum(item['text'] == DRAFT for item in after_api) == 1
    assert [item for item in after_api if item['id'] != saved['id']] == before_api
    assert [item for item in ui_rows() if item['id'] != saved['id']] == before_ui
    REPORT['real_retry_response'] = {'status': retry.value.status, 'item': saved}
    mark('explicit_retry_saves_once_with_same_id_and_preserves_existing_rows')

    for path in ['/app.js', '/style.css']:
        actual = REPORT['loaded_asset_hashes'][path]
        assert actual == REPORT['product_hashes']['public' + path]
    for path, expected_hash in REPORT['product_hashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash
    assert not REPORT['pageerrors'] and not REPORT['blocked_external_requests']
    REPORT['server_receipts'] = page.request.get(ORIGIN + '/__synthetic-metrics').json()
    mark('actual_js_css_responses_and_worker_hash_match_no_page_errors_or_external_requests')
    REPORT['completed'] = True
    save()
    context.close()
    browser.close()
print('Bounded 375px long-list failure feedback check passed; screenshot and exact hashes saved.')
