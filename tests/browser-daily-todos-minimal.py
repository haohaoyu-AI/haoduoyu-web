"""Focused real-browser acceptance for the minimal daily-todos experience.

Build the product, start tests/daily-todos-browser-server.mjs with a fresh D1,
then run this script. Only synthetic sessions and loopback traffic are used.
The seven screenshots and report remain ignored in artifacts/daily-todos/minimal.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import traceback
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/daily-todos/minimal'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:' + os.environ.get('DAILY_TODOS_PORT', '8797')
DAY, YESTERDAY, NEXT_DAY = '2026-10-23', '2026-10-22', '2026-10-24'
NEXT_NOW = '2026-10-23T16:00:01.000Z'
HARNESS = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", HARNESS).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", HARNESS).group(1)
assert USERNAME.startswith('synthetic-')
REPORT = {'synthetic': True, 'completed': False, 'checks': {}, 'captures': [],
          'api_responses': [], 'api_requests': [], 'api_request_failures': [], 'entry_api_gets': {},
          'pageerrors': [], 'blocked_external_requests': [],
          'test_source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
CLOCK = """(() => {const NativeDate=Date;const now=()=>Number(sessionStorage.getItem('__synthetic_minimal_clock'))
  ||NativeDate.parse('2026-10-23T15:59:58.000Z');globalThis.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:[now()]));}static now(){return now();}};})();"""


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
    REPORT['browser'] = {'engine': 'Chromium', 'version': browser.version}

    def new_page(width):
        mobile = width == 375
        context = browser.new_context(viewport={'width': width, 'height': 844 if mobile else 1000},
                                      is_mobile=mobile, has_touch=mobile, locale='zh-CN',
                                      timezone_id='America/Los_Angeles')
        context.add_init_script(CLOCK)

        def local_only(route):
            if route.request.url.startswith(ORIGIN + '/'):
                route.continue_()
            else:
                REPORT['blocked_external_requests'].append(route.request.url)
                route.abort()

        context.route('**/*', local_only)
        page = context.new_page()
        page.on('pageerror', lambda error: REPORT['pageerrors'].append(str(error)))
        page.on('request', lambda request: REPORT['api_requests'].append({
            'width': width, 'method': request.method, 'path': request.url.removeprefix(ORIGIN)})
            if request.url.startswith(ORIGIN + '/api/v1/') else None)
        page.on('requestfailed', lambda request: REPORT['api_request_failures'].append({
            'width': width, 'method': request.method, 'path': request.url.removeprefix(ORIGIN), 'failure': request.failure})
            if request.url.startswith(ORIGIN + '/api/v1/') else None)
        page.on('response', lambda response: REPORT['api_responses'].append({
            'width': width, 'method': response.request.method,
            'path': response.url.removeprefix(ORIGIN), 'status': response.status})
            if response.url.startswith(ORIGIN + '/api/v1/') else None)
        return context, page

    def ready(page, date=DAY):
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.error-panel')).to_have_count(0)
        expect(page.locator('#daily-todos')).to_have_attribute('data-date', date)
        expect(page.locator('#todo-status')).not_to_contain_text('正在读取')
        expect(page.locator('#todo-text')).to_be_visible()

    def login_default(page):
        responses = {}

        def assets(response):
            if response.url in [ORIGIN + '/app.js', ORIGIN + '/style.css']:
                responses[response.url.removeprefix(ORIGIN)] = response

        page.on('response', assets)
        page.goto(ORIGIN, wait_until='networkidle')
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill(PASSWORD)
        page.locator('#login-form button[type=submit]').click()
        ready(page)
        assert 'page=todos' in page.url
        assert page.locator('#main h1:visible, #main h2:visible').count() == 1
        expect(page.locator('#todo-history')).not_to_have_attribute('open', '')
        expect(page.locator('#todo-history summary')).to_be_visible()
        expect(page.locator('#todo-date')).not_to_be_visible()
        expect(page.locator('#todo-templates')).not_to_have_attribute('open', '')
        expect(page.locator('#todo-templates summary')).to_be_visible()
        expect(page.locator('#todo-template-text')).not_to_be_visible()
        box = page.locator('#todo-text').bounding_box()
        assert box['y'] + box['height'] < 400
        # Read response bodies now, while their original document is active.
        hashes = {path: hashlib.sha256(response.body()).hexdigest() for path, response in responses.items()}
        assert set(hashes) == {'/app.js', '/style.css'}
        for path, value in hashes.items():
            assert value == REPORT['product_hashes']['public' + path]
        width = page.viewport_size['width']
        entry_gets = [entry['path'] for entry in REPORT['api_requests']
                      if entry['width'] == width and entry['method'] == 'GET']
        assert any(path.startswith('/api/v1/todos?') for path in entry_gets)
        assert not any(path.startswith('/api/v1/overview') for path in entry_gets)
        REPORT['entry_api_gets'][str(width)] = entry_gets
        page.remove_listener('response', assets)
        identity_response = page.request.get(ORIGIN + '/api/v1/auth/me')
        assert identity_response.status == 200
        return identity_response.json()['data'], hashes

    def api_items(page, date=DAY):
        response = page.request.get(ORIGIN + '/api/v1/todos?date=' + date)
        assert response.status == 200
        return response.json()['data']['items']

    def select_date(page, date, action):
        with page.expect_response(lambda response: response.request.method == 'GET'
                                  and response.url == ORIGIN + '/api/v1/todos?date=' + date) as read:
            action()
        assert read.value.status == 200
        ready(page, date)

    def open_templates(page):
        if not page.locator('#todo-templates').evaluate('node=>node.open'):
            page.locator('#todo-templates summary').click()
        expect(page.locator('#todo-template-text')).to_be_visible()

    def template_row(page, template_id):
        return page.locator('#todo-templates [data-template-id="' + template_id + '"]')

    def templates(page):
        response = page.request.get(ORIGIN + '/api/v1/todo-templates')
        assert response.status == 200
        return response.json()['data']

    def ui_rows(page):
        return page.locator('.daily-todo-row').evaluate_all("""rows=>rows.map(row=>({id:row.dataset.id,
          text:row.querySelector('.daily-todo-text').textContent,
          checked:row.querySelector('input[type=checkbox]').checked,
          strike:getComputedStyle(row.querySelector('.daily-todo-text')).textDecorationLine.includes('line-through')}))""")

    def create_api(page, identity, text, completed=False):
        headers = {'Origin': ORIGIN, 'X-CSRF-Token': identity['csrfToken']}
        response = page.request.post(ORIGIN + '/api/v1/todos', headers=headers,
                                    data={'id': str(uuid.uuid4()), 'date': DAY, 'text': text})
        assert response.status == 201
        item = response.json()['data']
        if completed:
            response = page.request.patch(ORIGIN + '/api/v1/todos/' + item['id'], headers=headers,
                                          data={'completed': True, 'version': item['version']})
            assert response.status == 200
            item = response.json()['data']
        return item

    def capture(page, name):
        assert not page.locator('input[type=password]').count()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        path = OUT / (name + '.png')
        page.screenshot(path=str(path), full_page=False, animations='disabled')
        REPORT['captures'].append({'name': name, 'path': str(path.relative_to(ROOT)),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size})
        save()

    def wait_held(page, held):
        deadline = time.monotonic() + 10
        while not held and time.monotonic() < deadline:
            page.wait_for_timeout(50)
        assert held, 'Expected intercepted request was not captured'

    def hold(page, pattern, method):
        held = []

        def handler(route):
            if route.request.method == method:
                held.append(route)
            else:
                route.continue_()

        page.route(pattern, handler)
        return held, handler

    def release(page, held, pattern, handler, status):
        assert len(held) == 1
        response = held[0].fetch()
        assert response.status == status
        held[0].fulfill(response=response)
        page.unroute(pattern, handler)
        return response.json()['data']

    def visual_state(page, item_id, completed):
        current = next(item for item in ui_rows(page) if item['id'] == item_id)
        assert current['checked'] is completed and current['strike'] is completed, current

    def feedback_geometry(page):
        rectangles = page.evaluate("""() => {
          const box=s=>{const r=document.querySelector(s).getBoundingClientRect();
            return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
          return {form:box('#todo-form'),feedback:box('#todo-feedback'),list:box('#todo-items'),
            nav:box('.mobile-nav'),height:innerHeight,scroll_y:scrollY};
        }""")
        assert rectangles['scroll_y'] == 0
        assert rectangles['feedback']['top'] >= rectangles['form']['bottom']
        assert rectangles['feedback']['bottom'] <= rectangles['list']['top']
        assert rectangles['feedback']['bottom'] < rectangles['nav']['top'] <= rectangles['height']
        assert rectangles['feedback']['left'] >= 0 and rectangles['feedback']['right'] <= 375
        assert page.locator('#todo-feedback').evaluate('node=>node.scrollHeight<=node.clientHeight')
        return rectangles

    mobile_context, page = new_page(375)
    metadata = page.request.get(ORIGIN + '/__synthetic-fixture').json()
    assert metadata['synthetic']
    REPORT['fixture'] = {key: metadata[key] for key in ['source_commit', 'product_manifest_sha256', 'isolation']}
    REPORT['product_hashes'] = {path: metadata['product_hashes'][path] for path in [
        'public/app.js', 'public/style.css', 'dist/server/index.js', 'web/pages/todos.mjs']}
    identity, mobile_hashes = login_default(page)
    assert api_items(page) == [], 'Start a fresh synthetic fixture'
    capture(page, '375-default')
    mark('mobile_default_login_opens_todos_with_one_title_input_and_compact_history', mobile_hashes)

    create_api(page, identity, '核对今天的三个公开来源', completed=True)
    target = create_api(page, identity, '写完今天的影视选题分析')
    create_api(page, identity, '整理明天需要继续查证的材料')
    page.reload(wait_until='networkidle')
    ready(page)
    expect(page.locator('.daily-todo-row')).to_have_count(3)
    assert page.locator('.daily-todo-row').first.bounding_box()['y'] < 500
    held, handler = hold(page, ORIGIN + '/api/v1/todos', 'POST')
    page.locator('#todo-text').fill('补上一条今天的计划')
    page.locator('#todo-form button[type=submit]').tap()
    wait_held(page, held)
    expect(page.locator('#todo-form button[type=submit]')).to_be_disabled()
    expect(page.locator('#todo-form button[type=submit]')).to_contain_text('保存中')
    expect(page.locator('#todo-text')).to_have_attribute('readonly', '')
    assert len(api_items(page)) == 3
    add_bounds = page.locator('#todo-form button[type=submit]').bounding_box()
    page.touchscreen.tap(add_bounds['x'] + add_bounds['width'] / 2, add_bounds['y'] + add_bounds['height'] / 2)
    page.wait_for_timeout(100)
    assert len(held) == 1
    capture(page, '375-list-saving')
    created = release(page, held, ORIGIN + '/api/v1/todos', handler, 201)
    expect(page.locator('#todo-status')).to_have_text('已添加')
    expect(page.locator('#todo-text')).to_have_value('')
    expect(page.locator('.daily-todo-row')).to_have_count(4)
    capture(page, '375-list-saved')
    mark('add_shows_pending_before_response_then_short_success_feedback')

    desktop_context, desktop = new_page(1440)
    desktop_identity, desktop_hashes = login_default(desktop)
    assert desktop_identity['id'] == identity['id'] and desktop_identity['csrfToken'] != identity['csrfToken']
    assert api_items(desktop) == api_items(page)
    expect(desktop.locator('.daily-todo-row')).to_have_count(4)
    capture(desktop, '1440-default')
    mark('desktop_default_login_and_independent_device_session_show_same_saved_rows', desktop_hashes)

    open_templates(page)
    assert templates(page)['items'] == []
    template_attempts = []

    def fail_first_template(route):
        if route.request.method != 'POST':
            route.continue_()
            return
        template_attempts.append(route.request.post_data_json)
        if len(template_attempts) == 1:
            route.fulfill(status=503, content_type='application/json', body=json.dumps({
                'error': {'code': 'SYNTHETIC_TEMPLATE_FAILURE', 'message': '合成测试：常用计划未保存，请重试。'}}))
        else:
            route.continue_()

    page.route(ORIGIN + '/api/v1/todo-templates', fail_first_template)
    template_text = '每天核对公开资料与记录'
    page.locator('#todo-template-text').fill(template_text)
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todo-templates') as template_failed:
        page.locator('#todo-template-form button[type=submit]').tap()
    assert template_failed.value.status == 503
    expect(page.locator('#todo-template-feedback')).to_contain_text('常用计划未保存')
    expect(page.locator('#todo-template-text')).to_have_value(template_text)
    page.wait_for_timeout(500)
    assert len(template_attempts) == 1 and templates(page)['items'] == []
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todo-templates') as template_created:
        page.locator('#todo-template-form button[type=submit]').tap()
    assert template_created.value.status == 201
    template = template_created.value.json()['data']
    assert template['text'] == template_text
    page.unroute(ORIGIN + '/api/v1/todo-templates', fail_first_template)
    expect(template_row(page, template['id'])).to_have_count(1)
    page.reload(wait_until='networkidle')
    ready(page)
    open_templates(page)
    expect(template_row(page, template['id'])).to_have_count(1)
    expect(template_row(page, template['id']).locator('[data-template-status]')).to_have_text('待办')
    expect(template_row(page, template['id']).locator('[data-template-count]')).to_have_text(re.compile(r'近30天已完成\s*0\s*天'))
    open_templates(desktop)
    expect(template_row(desktop, template['id'])).to_have_count(1)
    mark('custom_template_failure_keeps_input_and_retry_persists_across_reload_and_device_session')

    hand_draft = '手写输入不被常用计划调用覆盖'
    page.locator('#todo-text').fill(hand_draft)
    held, handler = hold(page, ORIGIN + '/api/v1/todos', 'POST')
    use = template_row(page, template['id']).locator('[data-action=todo-template-use]')
    use.tap()
    wait_held(page, held)
    use_bounds = use.bounding_box()
    page.touchscreen.tap(use_bounds['x'] + use_bounds['width'] / 2, use_bounds['y'] + use_bounds['height'] / 2)
    page.wait_for_timeout(100)
    assert len(held) == 1
    expect(page.locator('#todo-text')).to_have_value(hand_draft)
    linked_today = release(page, held, ORIGIN + '/api/v1/todos', handler, 201)
    assert linked_today['template_id'] == template['id'] and linked_today['date'] == DAY
    expect(page.locator('.daily-todo-row[data-id="' + linked_today['id'] + '"]')).to_have_count(1)
    expect(page.locator('#todo-text')).to_have_value(hand_draft)
    expect(page.locator('#todo-template-status')).not_to_contain_text('正在读取')
    with page.expect_response(lambda response: response.request.method == 'GET'
                              and response.url == ORIGIN + '/api/v1/todo-templates') as template_progress:
        with page.expect_response(lambda response: response.request.method == 'PATCH'
                                 and response.url.endswith('/todos/' + linked_today['id'])) as linked_completed:
            page.locator('[data-todo-id="' + linked_today['id'] + '"]').tap()
    assert linked_completed.value.status == 200 and template_progress.value.status == 200
    linked_today = linked_completed.value.json()['data']
    progress = next(item for item in template_progress.value.json()['data']['items'] if item['id'] == template['id'])
    assert progress['completed_days'] == 1 and progress['habit_status'] == 'todo'
    expect(template_row(page, template['id']).locator('[data-template-count]')).to_have_text(re.compile(r'近30天已完成\s*1\s*天'))
    expect(template_row(page, template['id']).locator('[data-template-status]')).to_have_text('待办')
    page.evaluate('window.scrollTo(0,0)')
    capture(page, '375-common-templates')
    mark('template_use_is_linked_and_deduplicated_and_open_completion_count_updates_zero_to_one')

    if not page.locator('#todo-history').evaluate('node=>node.open'):
        page.locator('#todo-history summary').tap()
    select_date(page, NEXT_DAY,
                lambda: page.locator('[data-action=todo-calendar-date][data-date="' + NEXT_DAY + '"]').tap())
    open_templates(page)
    expect(template_row(page, template['id'])).to_have_count(1)
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todos') as template_future:
        template_row(page, template['id']).locator('[data-action=todo-template-use]').tap()
    assert template_future.value.status == 201
    linked_future = template_future.value.json()['data']
    assert linked_future['template_id'] == template['id'] and linked_future['date'] == NEXT_DAY
    assert linked_future['text'] == template_text and not linked_future['completed']
    template_days_before = {date: api_items(page, date) for date in [DAY, NEXT_DAY]}
    template_row(page, template['id']).locator('[data-action=todo-template-edit]').tap()
    expect(page.locator('#todo-template-edit-text')).to_have_value(template_text)
    page.locator('#todo-template-edit-text').fill('改名后的公开资料核验')
    with page.expect_response(lambda response: response.request.method == 'PATCH'
                             and response.url.endswith('/todo-templates/' + template['id'])) as renamed:
        page.locator('#todo-template-edit-form button[type=submit]').tap()
    assert renamed.value.status == 200 and renamed.value.json()['data']['id'] == template['id']
    expect(template_row(page, template['id']).locator('[data-action=todo-template-use]')).to_contain_text('改名后的公开资料核验')
    assert {date: api_items(page, date) for date in [DAY, NEXT_DAY]} == template_days_before

    with page.expect_response(lambda response: response.request.method == 'DELETE'
                             and response.url.endswith('/todo-templates/' + template['id'])) as deleted:
        template_row(page, template['id']).locator('[data-action=todo-template-delete]').tap()
    assert deleted.value.status == 200 and deleted.value.json()['data']['deleted'] is True
    expect(template_row(page, template['id'])).to_have_count(0)
    assert templates(page)['items'] == []
    assert {date: api_items(page, date) for date in [DAY, NEXT_DAY]} == template_days_before
    mark('future_template_use_and_stable_id_rename_soft_delete_leave_generated_todos_unchanged')
    if not page.locator('#todo-history').evaluate('node=>node.open'):
        page.locator('#todo-history summary').tap()
    select_date(page, DAY, lambda: page.locator('[data-action=todo-today]').tap())
    if page.locator('#todo-templates').evaluate('node=>node.open'):
        page.locator('#todo-templates summary').tap()

    pattern = ORIGIN + '/api/v1/todos/' + target['id']
    checkbox = lambda: page.locator('[data-todo-id="' + target['id'] + '"]')
    REPORT['checkbox_geometry'] = checkbox().evaluate("""node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);
      return {type:node.type,width:r.width,height:r.height,border_radius:s.borderRadius,appearance:s.appearance};}""")
    assert REPORT['checkbox_geometry']['type'] == 'checkbox'
    assert abs(REPORT['checkbox_geometry']['width'] - REPORT['checkbox_geometry']['height']) < 0.1
    assert REPORT['checkbox_geometry']['appearance'] == 'none'
    assert REPORT['checkbox_geometry']['border_radius'] == '50%'
    for desired in [True, False]:
        before = next(item for item in api_items(page) if item['id'] == target['id'])
        held, handler = hold(page, pattern, 'PATCH')
        if desired:
            checkbox().tap()
        else:
            checkbox().focus()
            checkbox().press('Space')
        wait_held(page, held)
        visual_state(page, target['id'], desired)
        expect(checkbox()).to_have_attribute('aria-disabled', 'true')
        assert next(item for item in api_items(page) if item['id'] == target['id']) == before
        # Raw touch bypasses Playwright's aria-disabled actionability guard and
        # reproduces a second physical tap while the first request is held.
        bounds = checkbox().bounding_box()
        page.touchscreen.tap(bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2)
        page.wait_for_timeout(100)
        assert len(held) == 1
        visual_state(page, target['id'], desired)
        target = release(page, held, pattern, handler, 200)
        expect(checkbox()).to_have_attribute('aria-disabled', 'false')
        expect(page.locator('#todo-status')).to_have_text('已保存')
        visual_state(page, target['id'], desired)
    mark('held_patch_immediately_checks_strikes_and_undoes_with_one_request_per_direction')

    page.evaluate('window.scrollTo(0,0)')
    page.locator('#todo-text').fill('状态保存失败时也不能丢掉这段草稿')
    held, handler = hold(page, pattern, 'PATCH')
    checkbox().tap()
    wait_held(page, held)
    visual_state(page, target['id'], True)
    held[0].fulfill(status=503, content_type='application/json', body=json.dumps({
        'error': {'code': 'SYNTHETIC_PATCH_FAILURE', 'message': '合成测试：状态未保存，请重试。'}}))
    page.unroute(pattern, handler)
    expect(page.locator('#todo-feedback')).to_contain_text('状态未保存')
    expect(checkbox()).to_have_attribute('aria-disabled', 'false')
    visual_state(page, target['id'], False)
    expect(page.locator('#todo-text')).to_have_value('状态保存失败时也不能丢掉这段草稿')
    assert next(item for item in api_items(page) if item['id'] == target['id']) == target
    mark('failed_optimistic_patch_rolls_back_and_keeps_draft_with_first_screen_error', feedback_geometry(page))

    remote = desktop.request.patch(ORIGIN + '/api/v1/todos/' + target['id'],
        headers={'Origin': ORIGIN, 'X-CSRF-Token': desktop_identity['csrfToken']},
        data={'completed': False, 'version': target['version']})
    assert remote.status == 200
    with page.expect_response(lambda response: response.request.method == 'GET'
                              and response.url == ORIGIN + '/api/v1/todos?date=' + DAY) as conflict_reload:
        with page.expect_response(lambda response: response.request.method == 'PATCH'
                                 and response.url.endswith('/todos/' + target['id'])) as conflict:
            checkbox().tap()
    assert conflict.value.status == 409
    assert conflict_reload.value.status == 200
    expect(page.locator('#todo-feedback')).to_contain_text('这项计划已更新')
    expect(checkbox()).to_have_attribute('aria-disabled', 'false')
    expect(page.locator('#todo-status')).not_to_contain_text('正在读取')
    visual_state(page, target['id'], False)
    target = remote.json()['data']
    assert next(item for item in api_items(page) if item['id'] == target['id']) == target
    mark('real_cross_device_stale_version_409_converges_to_persisted_state')

    for index in range(24 - len(api_items(page))):
        create_api(page, identity, f'合成补充计划 {index + 1:02d}：核对公开信息并整理记录', completed=index % 5 == 0)
    page.reload(wait_until='networkidle')
    ready(page)
    before_api, before_ui = api_items(page), ui_rows(page)
    assert len(before_api) == 24 and page.evaluate('document.documentElement.scrollHeight>innerHeight')
    failed_creates = []

    def fail_first_create(route):
        if route.request.method != 'POST':
            route.continue_()
        else:
            failed_creates.append(route.request.post_data_json)
            if len(failed_creates) == 1:
                route.fulfill(status=503, content_type='application/json', body=json.dumps({
                    'error': {'code': 'SYNTHETIC_CREATE_FAILURE', 'message': '合成测试：暂时无法保存，输入已保留，请重试。'}}))
            else:
                route.continue_()

    page.route(ORIGIN + '/api/v1/todos', fail_first_create)
    draft = '长清单保存失败后保留的计划'
    page.locator('#todo-text').fill(draft)
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todos') as failed:
        page.locator('#todo-form button[type=submit]').tap()
    assert failed.value.status == 503
    expect(page.locator('#todo-feedback')).to_contain_text('输入已保留')
    expect(page.locator('#todo-text')).to_have_value(draft)
    geometry = feedback_geometry(page)
    assert api_items(page) == before_api and ui_rows(page) == before_ui
    page.wait_for_timeout(1000)
    assert len(failed_creates) == 1
    capture(page, '375-long-list-failure')
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todos') as retried:
        page.locator('#todo-form button[type=submit]').tap()
    assert retried.value.status == 201
    expect(page.locator('#todo-text')).to_have_value('')
    assert len(failed_creates) == 2 and failed_creates[0] == failed_creates[1]
    new_id = retried.value.json()['data']['id']
    after = api_items(page)
    assert len(after) == 25 and sum(item['text'] == draft for item in after) == 1
    assert [item for item in after if item['id'] != new_id] == before_api
    page.unroute(ORIGIN + '/api/v1/todos', fail_first_create)
    mark('long_list_create_failure_stays_first_screen_preserves_rows_and_only_explicit_retry_saves_once', geometry)

    today_before_future = api_items(page)
    page.locator('#todo-history summary').tap()
    expect(page.locator('#todo-calendar')).to_be_visible()
    expect(page.locator('#todo-calendar-month')).to_have_text('2026年10月')
    page.locator('[data-action=todo-calendar-prev]').tap()
    expect(page.locator('#todo-calendar-month')).to_have_text('2026年9月')
    page.locator('[data-action=todo-calendar-next]').tap()
    expect(page.locator('#todo-calendar-month')).to_have_text('2026年10月')
    page.locator('[data-action=todo-calendar-next]').tap()
    expect(page.locator('#todo-calendar-month')).to_have_text('2026年11月')
    page.locator('[data-action=todo-calendar-prev]').tap()
    expect(page.locator('[data-action=todo-calendar-date][data-date="' + DAY + '"]')).to_have_attribute('aria-current', 'date')
    select_date(page, NEXT_DAY,
                lambda: page.locator('[data-action=todo-calendar-date][data-date="' + NEXT_DAY + '"]').tap())
    assert 'date=' + NEXT_DAY in page.url
    if not page.locator('#todo-history').evaluate('node=>node.open'):
        page.locator('#todo-history summary').tap()
    expect(page.locator('[data-action=todo-calendar-date][data-date="' + NEXT_DAY + '"]')).to_have_attribute('aria-pressed', 'true')
    page.evaluate('window.scrollTo(0,0)')
    capture(page, '375-history-expanded')
    page.locator('#todo-history summary').tap()
    future_text = '提前写给明天的第一项计划'
    page.locator('#todo-text').fill(future_text)
    with page.expect_response(lambda response: response.request.method == 'POST'
                             and response.url == ORIGIN + '/api/v1/todos') as future_response:
        page.locator('#todo-form button[type=submit]').tap()
    assert future_response.value.status == 201
    future = future_response.value.json()['data']
    assert future['date'] == NEXT_DAY and future['text'] == future_text
    expect(page.locator('.daily-todo-row[data-id="' + future['id'] + '"]')).to_have_count(1)
    page.locator('#todo-history summary').tap()
    select_date(page, DAY, lambda: page.locator('[data-action=todo-today]').tap())
    assert api_items(page) == today_before_future
    assert future in api_items(page, NEXT_DAY)
    mark('calendar_month_navigation_future_selection_and_preplanning_do_not_move_today_rows')

    if not page.locator('#todo-history').evaluate('node=>node.open'):
        page.locator('#todo-history summary').tap()
    expect(page.locator('#todo-date')).to_be_visible()
    select_date(page, YESTERDAY,
                lambda: page.locator('[data-action=todo-calendar-date][data-date="' + YESTERDAY + '"]').tap())
    assert 'date=' + YESTERDAY in page.url
    page.reload(wait_until='networkidle')
    ready(page, YESTERDAY)
    expect(page.locator('#todo-history')).to_have_attribute('open', '')
    expect(page.locator('#todo-date')).to_have_value(YESTERDAY)
    page.locator('.mobile-nav [data-nav=articles]').tap()
    page.locator('#page-content[aria-busy=false]').wait_for()
    expect(page.locator('[data-action=article-detail]:visible')).to_have_count(3)
    page.locator('.mobile-nav [data-nav=reviews]').tap()
    page.locator('#page-content[aria-busy=false]').wait_for()
    assert 'page=reviews' in page.url
    page.go_back()
    page.locator('#page-content[aria-busy=false]').wait_for()
    assert 'page=articles' in page.url
    page.go_back()
    ready(page, YESTERDAY)
    assert 'date=' + YESTERDAY in page.url
    select_date(page, DAY, lambda: page.locator('[data-action=todo-today]').tap())
    mark('compact_history_deeplink_reload_articles_data_and_back_keep_correct_date')

    page.locator('#todo-text').fill('切换模块后继续输入的计划')
    held_articles = []

    def hold_articles(route):
        held_articles.append((route, route.fetch()))

    page.route(ORIGIN + '/api/v1/articles?*', hold_articles)
    article_failure_offset = len(REPORT['api_request_failures'])
    page.locator('.mobile-nav [data-nav=articles]').tap()
    wait_held(page, held_articles)
    page.locator('.mobile-nav [data-nav=todos]').tap()
    ready(page)
    expect(page.locator('#todo-text')).to_have_value('切换模块后继续输入的计划')
    page.locator('#todo-text').focus()
    page.locator('#todo-text').evaluate('input=>{window.__syntheticMinimalInput=input;input.setSelectionRange(2,4)}')
    article_response_offset = len(REPORT['api_responses'])
    for route, response in held_articles:
        route.fulfill(response=response)
    page.unroute(ORIGIN + '/api/v1/articles?*', hold_articles)
    page.wait_for_timeout(100)
    expect(page.locator('#todo-text')).to_have_value('切换模块后继续输入的计划')
    expect(page.locator('#todo-text')).to_be_focused()
    assert page.evaluate('window.__syntheticMinimalInput===document.querySelector("#todo-text")')
    assert page.locator('#todo-text').evaluate('input=>[input.selectionStart,input.selectionEnd]') == [2, 4]
    mark('late_or_cancelled_article_read_cannot_replace_returned_todo_input_or_draft', {
        'upstream_statuses': [response.status for route, response in held_articles],
        'browser_received_after_return': [entry for entry in REPORT['api_responses'][article_response_offset:]
                                          if entry['width'] == 375 and entry['path'].startswith('/api/v1/articles?')],
        'browser_cancellations': [entry for entry in REPORT['api_request_failures'][article_failure_offset:]
                                  if entry['width'] == 375 and entry['path'].startswith('/api/v1/articles?')]})

    dashboard_offset = len(REPORT['api_requests'])
    page.goto(ORIGIN + '/?page=dashboard', wait_until='networkidle')
    page.locator('#page-content[aria-busy=false]').wait_for()
    expect(page.locator('.error-panel')).to_have_count(0)
    expect(page.locator('#daily-todos')).to_have_count(0)
    expect(page.locator('#page-header h1')).to_have_text('总览')
    dashboard_gets = [entry['path'] for entry in REPORT['api_requests'][dashboard_offset:]
                      if entry['width'] == 375 and entry['method'] == 'GET']
    assert any(path.startswith('/api/v1/overview') for path in dashboard_gets)
    assert not any(path.startswith('/api/v1/todos') for path in dashboard_gets)
    mark('explicit_dashboard_loads_statistics_without_todo_ui_or_todo_requests', dashboard_gets)
    page.goto(ORIGIN + '/?page=todos', wait_until='networkidle')
    ready(page)

    desktop.reload(wait_until='networkidle')
    ready(desktop)
    assert api_items(desktop) == api_items(page)
    selected_future = '2026-10-25'
    desktop.goto(ORIGIN + '/?page=todos&date=' + selected_future, wait_until='networkidle')
    ready(desktop, selected_future)
    expect(desktop.locator('#todo-calendar-month')).to_have_text('2026年10月')
    expect(desktop.locator('[data-action=todo-calendar-date][data-date="' + DAY + '"]')).to_have_attribute('aria-current', 'date')
    before_midnight = api_items(page)
    future_before_midnight = api_items(page, NEXT_DAY)
    assert page.request.post(ORIGIN + '/__synthetic-clock', data={'now': NEXT_NOW}).status == 200
    page.evaluate('value=>sessionStorage.setItem("__synthetic_minimal_clock",String(Date.parse(value)))', NEXT_NOW)
    desktop.evaluate('value=>sessionStorage.setItem("__synthetic_minimal_clock",String(Date.parse(value)))', NEXT_NOW)
    # Let the existing product timer fire; no focus, visibility or navigation event.
    expect(page.locator('#daily-todos')).to_have_attribute('data-date', NEXT_DAY, timeout=8000)
    ready(page, NEXT_DAY)
    expect(page.locator('.daily-todo-row')).to_have_count(len(future_before_midnight))
    expect(page.locator('.daily-todo-text').filter(has_text=future_text)).to_have_count(1)
    assert api_items(page, NEXT_DAY) == future_before_midnight and api_items(page, DAY) == before_midnight
    assert page.evaluate('new Date().getDate()') == 23
    mark('preplanned_future_item_naturally_becomes_beijing_today_without_moving_yesterday')
    expect(desktop.locator('[data-action=todo-calendar-date][data-date="' + NEXT_DAY + '"]')).to_have_attribute('aria-current', 'date', timeout=8000)
    expect(desktop.locator('[data-action=todo-calendar-date][data-date="' + DAY + '"]')).not_to_have_attribute('aria-current', 'date')
    expect(desktop.locator('#daily-todos')).to_have_attribute('data-date', selected_future)
    expect(desktop.locator('#todo-date')).to_have_value(selected_future)
    expect(desktop.locator('#todo-calendar-month')).to_have_text('2026年10月')
    expect(desktop.locator('[data-action=todo-calendar-date][data-date="' + selected_future + '"]')).to_have_attribute('aria-pressed', 'true')
    mark('explicit_future_selection_and_month_remain_while_midnight_today_marker_updates')

    for path, expected_hash in REPORT['product_hashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash, path
    assert not REPORT['pageerrors'] and not REPORT['blocked_external_requests']
    assert len(REPORT['captures']) == 7
    REPORT['server_receipts'] = page.request.get(ORIGIN + '/__synthetic-metrics').json()
    REPORT['completed'] = True
    save()
    mobile_context.close()
    desktop_context.close()
    browser.close()
print(f"{len(REPORT['checks'])} focused minimal-todos checks passed; seven screenshots and exact hashes saved.")
