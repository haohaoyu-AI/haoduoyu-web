"""Real Chromium acceptance of daily todos against a temporary loopback D1.

Run `node tests/daily-todos-browser-server.mjs` after the product build, then
`python3 tests/browser-daily-todos.py`. Screenshots and JSON remain git-ignored.
Use `--navigation-only` for bounded explicit-refresh and A-B-A late-read checks.
Only tests replace Date and inject failures; shipped JS/CSS are served unchanged.
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
OUT = ROOT / 'artifacts/daily-todos'
NAVIGATION_ONLY = '--navigation-only' in sys.argv
if NAVIGATION_ONLY:
    OUT = OUT / 'navigation'
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('DAILY_TODOS_PORT', '8797'))
ORIGIN = f'http://127.0.0.1:{PORT}'
DAY = '2026-10-23'
NEXT_DAY = '2026-10-24'
INITIAL_NOW = '2026-10-23T15:59:58.000Z'
NEXT_NOW = '2026-10-23T16:00:01.000Z'
HARNESS = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", HARNESS).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", HARNESS).group(1)
assert USERNAME.startswith('synthetic-')
REPORT = {'synthetic': True, 'origin': ORIGIN, 'checks': {}, 'captures': [],
          'pageerrors': [], 'console_errors': [], 'blocked_external_requests': [],
          'api_responses': [], 'injections': [], 'navigation_timings': [], 'completed': False}


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
CLOCK_SCRIPT = """(() => {
  const NativeDate = Date;
  const read = () => Number(sessionStorage.getItem('__synthetic_todo_clock')) || NativeDate.parse(%s);
  globalThis.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [read()])); }
    static now() { return read(); }
  };
})();""" % json.dumps(INITIAL_NOW)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    REPORT['browser'] = {'engine': 'Chromium', 'version': browser.version, 'executable': '/usr/bin/chromium'}

    def new_context(mobile=False):
        context = browser.new_context(viewport={'width': 1440, 'height': 1000},
                                      timezone_id='America/Los_Angeles', locale='zh-CN',
                                      is_mobile=mobile, has_touch=mobile)
        context.add_init_script(CLOCK_SCRIPT)

        def local_only(route):
            if route.request.url.startswith(ORIGIN + '/'):
                route.continue_()
            else:
                REPORT['blocked_external_requests'].append(route.request.url)
                route.abort()

        context.route('**/*', local_only)
        return context

    def new_page(context, label):
        page = context.new_page()
        page.on('pageerror', lambda error: REPORT['pageerrors'].append({'page': label, 'message': str(error)}))
        page.on('console', lambda message: REPORT['console_errors'].append({'page': label, 'message': message.text})
                if message.type == 'error' else None)
        page.on('response', lambda response: REPORT['api_responses'].append({
            'page': label, 'method': response.request.method,
            'path': response.url.removeprefix(ORIGIN), 'status': response.status})
                if response.url.startswith(ORIGIN + '/api/v1/') else None)
        return page

    def ready(page):
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.error-panel')).to_have_count(0)

    def todo_ready(page, date=DAY):
        ready(page)
        expect(page.locator('#daily-todos')).to_have_attribute('data-date', date)
        expect(page.locator('#todo-text')).to_be_visible()
        expect(page.locator('#todo-form button[type=submit]')).to_be_enabled()
        expect(page.locator('#daily-todos .daily-todo-status')).not_to_have_text('正在读取计划…')

    def login(page):
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill(PASSWORD)
        page.locator('#login-form button[type=submit]').click()
        ready(page)
        result = page.request.get(ORIGIN + '/api/v1/auth/me')
        assert result.status == 200
        identity = result.json()['data']
        assert identity['id'] and identity['username'] == USERNAME
        return identity

    def api_items(page, date=DAY):
        response = page.request.get(ORIGIN + '/api/v1/todos?date=' + date)
        assert response.status == 200
        data = response.json()['data']
        assert data['date'] == date
        return data['items']

    def row(page, item_id):
        return page.locator('.daily-todo-row[data-id="' + item_id + '"]')

    def checkbox(page, item_id):
        return row(page, item_id).locator('input[type=checkbox]')

    def add(page, text, date=DAY):
        page.locator('#todo-text').fill(text)
        with page.expect_response(lambda response: response.request.method == 'POST'
                                 and response.url == ORIGIN + '/api/v1/todos') as response:
            page.locator('#todo-form button[type=submit]').click()
        assert response.value.status in (200, 201)
        item = response.value.json()['data']
        expect(row(page, item['id'])).to_have_count(1)
        expect(page.locator('#todo-text')).to_have_value('')
        assert item['date'] == date and item['text'] == text and not item['completed']
        return item

    def change(page, item_id, completed):
        with page.expect_response(lambda response: response.request.method == 'PATCH'
                                 and response.url == ORIGIN + '/api/v1/todos/' + item_id) as response:
            checkbox(page, item_id).click()
        assert response.value.status == 200
        expect(checkbox(page, item_id)).to_be_checked(checked=completed)
        return response.value.json()['data']

    def no_overflow(page):
        sizes = page.evaluate('({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
        assert sizes['document'] <= sizes['viewport'] and sizes['body'] <= sizes['viewport'], sizes
        return sizes

    def wait_captured(page, captured):
        deadline = time.monotonic() + 10
        while not captured and time.monotonic() < deadline:
            page.wait_for_timeout(50)
        assert captured, 'Expected synthetic interception was not captured'

    def capture(page, name, width):
        assert page.locator('input[type=password]').count() == 0
        assert page.locator('#created-token').count() == 0
        sizes = no_overflow(page)
        path = OUT / f'{name}-{width}.png'
        # Chromium full-page screenshots resize the document; the app correctly
        # closes its mobile drawer on resize, so capture that drawer as a viewport.
        page.screenshot(path=str(path), animations='disabled', full_page=not name.startswith('mobile-navigation'))
        REPORT['captures'].append({'view': name, 'width': width, 'path': str(path.relative_to(ROOT)),
                                   'bytes': path.stat().st_size,
                                   'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'layout': sizes})
        save()

    def check_fresh_navigation(mobile, width, mobile_identity, navigate_mobile):
        mobile.locator('[data-action=page-menu]').tap()
        with mobile.expect_response(lambda response: response.request.method == 'GET'
                                    and '/api/v1/todos?' in response.url) as refreshed:
            mobile.locator('[role=menuitem][data-action=refresh]').tap()
        assert refreshed.value.status == 200
        todo_ready(mobile)
        mark('mobile_explicit_refresh_requests_fresh_todos_' + str(width))

        held_todo_reads = []

        def hold_first_todo_read(route):
            if not held_todo_reads:
                held_todo_reads.append((route, route.fetch()))
            else:
                route.continue_()

        mobile.route('**/api/v1/todos?*', hold_first_todo_read)
        mobile.locator('[data-action=page-menu]').tap()
        mobile.locator('[role=menuitem][data-action=refresh]').tap()
        wait_captured(mobile, held_todo_reads)
        external_id = str(uuid.uuid4())
        external_text = '返回待办后读取的新版本 ' + str(width)
        changed = mobile.request.post(ORIGIN + '/api/v1/todos',
            headers={'Origin': ORIGIN, 'X-CSRF-Token': mobile_identity['csrfToken']},
            data={'id': external_id, 'date': DAY, 'text': external_text})
        assert changed.status == 201
        assert not any(item['id'] == external_id for item in held_todo_reads[0][1].json()['data']['items'])
        navigate_mobile('articles')
        ready(mobile)
        navigate_mobile('todos')
        todo_ready(mobile)
        expect(row(mobile, external_id)).to_have_count(1)
        held_todo_reads[0][0].fulfill(response=held_todo_reads[0][1])
        mobile.unroute('**/api/v1/todos?*', hold_first_todo_read)
        mobile.wait_for_timeout(150)
        expect(row(mobile, external_id)).to_have_count(1)
        assert 'page=todos' in mobile.url
        mark('mobile_a_b_a_late_todo_read_cannot_replace_fresh_rows_' + str(width))


    if NAVIGATION_ONLY:
        for width in [375, 390]:
            bounded_context = new_context(mobile=True)
            bounded = new_page(bounded_context, 'navigation-' + str(width))
            bounded.set_viewport_size({'width': width, 'height': 844})
            metadata = bounded.request.get(ORIGIN + '/__synthetic-fixture').json()
            REPORT['fixture'] = metadata
            bounded.goto(ORIGIN + '/?page=todos')
            bounded_identity = login(bounded)
            todo_ready(bounded)

            def navigate_bounded(target):
                bounded.locator('.mobile-nav [data-nav=' + target + ']').tap()
                expect(bounded.locator('.mobile-nav [data-nav=' + target + ']')).to_have_attribute('aria-current', 'page')

            check_fresh_navigation(bounded, width, bounded_identity, navigate_bounded)
            REPORT['server_receipts'] = bounded.request.get(ORIGIN + '/__synthetic-metrics').json()
            bounded_context.close()
        assert not REPORT['pageerrors'], REPORT['pageerrors']
        assert not REPORT['blocked_external_requests'], REPORT['blocked_external_requests']
        for path, expected_hash in metadata['product_hashes'].items():
            assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash, path
        REPORT['completed'] = True
        save()
        browser.close()
        print(f"{len(REPORT['checks'])} bounded navigation checks passed; same product manifest "
              + metadata['product_manifest_sha256'])
        sys.exit(0)

    context = new_context()
    page = new_page(context, 'main')
    metadata = page.request.get(ORIGIN + '/__synthetic-fixture').json()
    assert metadata['synthetic'] and metadata['initial_now'] == INITIAL_NOW
    REPORT['fixture'] = metadata
    assert hashlib.sha256(page.request.get(ORIGIN + '/app.js').body()).hexdigest() == metadata['product_hashes']['public/app.js']
    assert hashlib.sha256(page.request.get(ORIGIN + '/style.css').body()).hexdigest() == metadata['product_hashes']['public/style.css']
    mark('served_app_and_css_match_product_hashes')

    page.goto(ORIGIN, wait_until='networkidle')
    identity = login(page)
    todo_ready(page)
    assert page.locator('#todo-text').bounding_box()['y'] < 350
    assert page.locator('#daily-todos').evaluate('(node)=>node.parentElement.firstElementChild===node')
    assert page.locator('[data-nav=todos]').count() >= 1
    assert page.locator('#overlay [role=dialog]').count() == 0
    mark('homepage_top_direct_input_without_modal')

    first = add(page, '写完今天的影视选题分析')
    completed = change(page, first['id'], True)
    assert completed['version'] > first['version']
    assert row(page, first['id']).evaluate("node=>[...node.querySelectorAll('*')].some(child=>getComputedStyle(child).textDecorationLine.includes('line-through'))")
    first = change(page, first['id'], False)
    assert not row(page, first['id']).evaluate("node=>[...node.querySelectorAll('*')].some(child=>getComputedStyle(child).textDecorationLine.includes('line-through'))")
    mark('add_complete_strikethrough_and_cancel')
    first = change(page, first['id'], True)
    pending = add(page, '查阅三条公开来源，核对日期与引文')

    held = []

    def hold_post(route):
        if route.request.method == 'POST':
            held.append(route)
        else:
            route.continue_()

    page.route('**/api/v1/todos', hold_post)
    page.locator('#todo-text').fill('双击添加只保留一条计划')
    page.locator('#todo-form button[type=submit]').dblclick()
    wait_captured(page, held)
    assert len(held) == 1
    expect(page.locator('#todo-form button[type=submit]')).to_be_disabled()
    held[0].fulfill(response=held[0].fetch())
    page.unroute('**/api/v1/todos', hold_post)
    expect(page.locator('#todo-text')).to_have_value('')
    assert sum(item['text'] == '双击添加只保留一条计划' for item in api_items(page)) == 1
    mark('double_click_has_one_write_and_one_row')

    failed_post = []

    def fail_post(route):
        if route.request.method == 'POST' and not failed_post:
            failed_post.append(route.request.post_data_json)
            route.fulfill(status=503, content_type='application/json', body=json.dumps({
                'error': {'code': 'SYNTHETIC_FAILURE', 'message': '合成测试：暂时无法保存，请重试'}}))
        else:
            route.continue_()

    page.route('**/api/v1/todos', fail_post)
    text = '失败后仍保留输入，再按一次添加'
    page.locator('#todo-text').fill(text)
    page.locator('#todo-form button[type=submit]').click()
    expect(page.locator('#todo-form button[type=submit]')).to_be_enabled()
    expect(page.locator('#todo-text')).to_have_value(text)
    expect(page.locator('#daily-todos [role=alert]')).to_contain_text('合成测试：暂时无法保存，请重试')
    assert len(failed_post) == 1 and not any(item['text'] == text for item in api_items(page))
    retry = add(page, text)
    assert retry['id'] == failed_post[0]['id']
    page.unroute('**/api/v1/todos', fail_post)
    REPORT['injections'].append('POST 503 before commit; retained input and same-id retry')
    mark('failed_add_keeps_input_and_retries_same_id')

    lost = []

    def lose_saved_response(route):
        if route.request.method == 'POST' and not lost:
            saved = route.fetch()
            assert saved.status == 201
            lost.append(saved.json()['data'])
            route.fulfill(status=503, content_type='application/json', body=json.dumps({
                'error': {'code': 'SYNTHETIC_LOST_RESPONSE', 'message': '合成测试：保存响应中断'}}))
        else:
            route.continue_()

    page.route('**/api/v1/todos', lose_saved_response)
    text = '响应中断后重试也不会重复创建'
    page.locator('#todo-text').fill(text)
    page.locator('#todo-form button[type=submit]').click()
    expect(page.locator('#todo-form button[type=submit]')).to_be_enabled()
    expect(page.locator('#todo-text')).to_have_value(text)
    assert len(lost) == 1
    retried = add(page, text)
    assert retried['id'] == lost[0]['id']
    assert sum(item['text'] == text for item in api_items(page)) == 1
    page.unroute('**/api/v1/todos', lose_saved_response)
    REPORT['injections'].append('POST committed in real D1, response replaced with 503, same-id retry')
    mark('lost_create_response_retry_is_idempotent')

    failed_patch = []

    def fail_patch(route):
        if route.request.method == 'PATCH' and not failed_patch:
            failed_patch.append(True)
            route.fulfill(status=503, content_type='application/json', body=json.dumps({
                'error': {'code': 'SYNTHETIC_FAILURE', 'message': '合成测试：状态保存失败'}}))
        else:
            route.continue_()

    page.route('**/api/v1/todos/' + pending['id'], fail_patch)
    checkbox(page, pending['id']).click()
    expect(page.locator('#daily-todos [role=alert]')).to_contain_text('合成测试：状态保存失败')
    expect(checkbox(page, pending['id'])).not_to_be_checked()
    assert len(failed_patch) == 1
    assert next(item for item in api_items(page) if item['id'] == pending['id'])['completed'] is False
    page.unroute('**/api/v1/todos/' + pending['id'], fail_patch)
    REPORT['injections'].append('PATCH 503 before commit; UI returns to persisted unchecked state')
    mark('failed_patch_restores_persisted_state')

    page.reload()
    todo_ready(page)
    expect(checkbox(page, first['id'])).to_be_checked()
    expect(checkbox(page, pending['id'])).not_to_be_checked()
    mark('refresh_retains_completed_and_pending_states')

    tab = new_page(context, 'second-tab')
    tab.goto(ORIGIN + '/?page=todos')
    todo_ready(tab)
    expect(checkbox(tab, first['id'])).to_be_checked()
    added_in_tab = add(tab, '另一标签页填写的计划')
    page.bring_to_front()
    page.reload()
    todo_ready(page)
    expect(row(page, added_in_tab['id'])).to_have_count(1)
    mark('same_session_second_tab_write_persists_after_reload')

    device_context = new_context()
    device = new_page(device_context, 'independent-device-session')
    device.goto(ORIGIN + '/?page=todos')
    other_identity = login(device)
    todo_ready(device)
    assert other_identity['id'] == identity['id'] and other_identity['csrfToken'] != identity['csrfToken']
    expect(checkbox(device, first['id'])).to_be_checked()
    expect(row(device, added_in_tab['id'])).to_have_count(1)
    mark('independent_authenticated_device_session_reads_same_saved_rows')

    remote = device.request.patch(ORIGIN + '/api/v1/todos/' + pending['id'],
        headers={'Origin': ORIGIN, 'X-CSRF-Token': other_identity['csrfToken']},
        data={'completed': True, 'version': pending['version']})
    assert remote.status == 200
    expect(checkbox(page, pending['id'])).not_to_be_checked()
    with page.expect_response(lambda response: response.request.method == 'PATCH'
                             and response.url.endswith('/todos/' + pending['id'])) as conflict:
        checkbox(page, pending['id']).click()
    assert conflict.value.status == 409
    expect(page.locator('#daily-todos [role=alert]')).to_contain_text('这项计划已更新')
    expect(page.locator('#daily-todos .daily-todo-status')).not_to_have_text('正在读取计划…')
    expect(checkbox(page, pending['id'])).to_be_checked()
    assert next(item for item in api_items(page) if item['id'] == pending['id'])['version'] == remote.json()['data']['version']
    mark('real_stale_version_409_refetches_other_session_state')
    pending = change(page, pending['id'], False)
    tab.close()
    device_context.close()

    long_item = add(page, '长文本换行检查 ' + 'abcdefghijklmnopqrstuvwxyz' * 12)
    literal = add(page, '<img src=x onerror="window.__todo_xss=true">应显示为文字')
    assert page.evaluate('window.__todo_xss !== true')
    assert row(page, literal['id']).locator('img').count() == 0
    expect(page.locator('#todo-text')).to_have_attribute('maxlength', '500')
    mark('literal_html_is_escaped_and_input_has_500_limit')

    # Keyboard users can complete and undo the same row without losing focus.
    checkbox(page, long_item['id']).focus()
    checkbox(page, long_item['id']).press('Space')
    expect(checkbox(page, long_item['id'])).to_be_checked()
    expect(checkbox(page, long_item['id'])).to_be_focused()
    checkbox(page, long_item['id']).press('Space')
    expect(checkbox(page, long_item['id'])).not_to_be_checked()
    expect(checkbox(page, long_item['id'])).to_be_focused()
    mark('keyboard_space_complete_undo_retains_checkbox_focus')

    delayed_overview = []

    def hold_overview(route):
        delayed_overview.append((route, route.fetch()))

    page.route('**/api/v1/overview?*', hold_overview)
    page.goto(ORIGIN + '/?page=dashboard', wait_until='domcontentloaded')
    expect(page.locator('#todo-text')).to_be_visible()
    page.locator('#todo-text').fill('慢总览加载时正在输入的草稿')
    page.locator('#todo-text').evaluate('input=>input.setSelectionRange(3, 6)')
    wait_captured(page, delayed_overview)
    assert len(delayed_overview) == 1
    delayed_overview[0][0].fulfill(response=delayed_overview[0][1])
    page.unroute('**/api/v1/overview?*', hold_overview)
    ready(page)
    expect(page.locator('#todo-text')).to_have_value('慢总览加载时正在输入的草稿')
    expect(page.locator('#todo-text')).to_be_focused()
    assert page.locator('#todo-text').evaluate('input=>[input.selectionStart,input.selectionEnd]') == [3, 6]
    page.locator('#todo-text').fill('')
    mark('late_overview_preserves_todo_draft_focus_and_selection')

    # The task entry remains available if unrelated overview loading fails.
    def fail_overview(route):
        route.fulfill(status=503, content_type='application/json', body=json.dumps({
            'error': {'code': 'SYNTHETIC_FAILURE', 'message': '合成测试：总览暂时不可用'}}))

    page.route('**/api/v1/overview?*', fail_overview)
    page.goto(ORIGIN + '/?page=dashboard')
    expect(page.locator('#todo-text')).to_be_visible()
    expect(row(page, first['id'])).to_have_count(1)
    page.unroute('**/api/v1/overview?*', fail_overview)
    mark('dashboard_todos_survive_unrelated_overview_failure')

    for width in [375, 390, 1440]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.goto(ORIGIN + '/?page=dashboard')
        todo_ready(page)
        assert page.locator('#todo-text').bounding_box()['y'] < 440
        capture(page, 'dashboard', width)
        if width < 600:
            page.get_by_role('button', name='打开导航', exact=True).click()
        page.locator('#site-nav [data-nav=todos]').click()
        todo_ready(page)
        expect(page.locator('#todo-date')).to_have_value(DAY)
        capture(page, 'todos', width)
        page.locator('#todo-date').fill('2026-10-22')
        page.locator('#todo-date').dispatch_event('change')
        todo_ready(page, '2026-10-22')
        expect(page.locator('.daily-todo-row')).to_have_count(0)
        assert 'date=2026-10-22' in page.url
        page.reload()
        todo_ready(page, '2026-10-22')
        capture(page, 'history-empty', width)
        page.locator('[data-action=todo-today]').click()
        todo_ready(page)
        expect(row(page, first['id'])).to_have_count(1)
        page.goto(ORIGIN + '/?page=articles')
        ready(page)
        expect(page.locator('[data-action=article-detail]:visible')).to_have_count(3)
        capture(page, 'articles', width)
        page.locator('[data-action=article-detail]:visible').first.click()
        page.locator('#overlay [role=dialog]').wait_for()
        no_overflow(page)
        page.keyboard.press('Escape')
        expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
        page.goto(ORIGIN + '/?page=reviews&tab=observations')
        ready(page)
        capture(page, 'reviews-observations', width)
        page.goto(ORIGIN + '/?page=settings&tab=accounts')
        ready(page)
        expect(page.locator('[data-action=edit-account]')).to_have_count(3)
        capture(page, 'settings-accounts', width)
        page.locator('[data-action=settings-tab][data-tab=security]').click()
        ready(page)
        expect(page.locator('#password-form')).to_be_visible()
        no_overflow(page)
        mark('navigation_articles_settings_and_layout_' + str(width))

    for width in [375, 390]:
        mobile_context = new_context(mobile=True)
        mobile = new_page(mobile_context, 'mobile-' + str(width))
        mobile.set_viewport_size({'width': width, 'height': 844})
        mobile.goto(ORIGIN)
        mobile_identity = login(mobile)
        todo_ready(mobile)
        assert 'page=todos' in mobile.url
        expect(mobile.locator('#todo-date')).to_be_visible()
        assert mobile.locator('#todo-text').bounding_box()['y'] < 380
        expect(mobile.locator('.mobile-nav [data-nav]')).to_have_count(5)
        expect(mobile.locator('.mobile-nav [data-nav=todos]')).to_have_attribute('aria-current', 'page')
        capture(mobile, 'mobile-default-todos', width)
        mobile.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
        last_todo = mobile.locator('.daily-todo-row').last.bounding_box()
        nav_bounds = mobile.locator('.mobile-nav').bounding_box()
        assert last_todo['y'] + last_todo['height'] <= nav_bounds['y'], (last_todo, nav_bounds)
        mobile.reload()
        todo_ready(mobile)
        assert 'page=todos' in mobile.url
        mobile.goto(ORIGIN + '/?page=articles')
        ready(mobile)
        assert 'page=articles' in mobile.url
        expect(mobile.locator('#daily-todos')).to_have_count(0)
        capture(mobile, 'touch-articles', width)
        mobile.goto(ORIGIN + '/?page=reviews&tab=observations')
        ready(mobile)
        capture(mobile, 'touch-reviews-observations', width)
        mobile.goto(ORIGIN + '/?page=settings&tab=accounts')
        ready(mobile)
        for button in mobile.locator('[data-action=edit-account]').all():
            bounds = button.bounding_box()
            assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width, bounds
        mobile.evaluate('window.scrollTo(0, document.documentElement.scrollHeight)')
        last_edit = mobile.locator('[data-action=edit-account]').last.bounding_box()
        assert last_edit['y'] + last_edit['height'] <= mobile.locator('.mobile-nav').bounding_box()['y']
        capture(mobile, 'touch-settings-accounts', width)
        mobile.goto(ORIGIN + '/?page=dashboard')
        todo_ready(mobile)
        capture(mobile, 'touch-dashboard', width)
        mark('mobile_default_todos_and_explicit_deeplink_' + str(width))

        def navigate_mobile(target):
            start = time.perf_counter()
            mobile.locator('.mobile-nav [data-nav=' + target + ']').tap()
            expect(mobile.locator('.mobile-nav [data-nav=' + target + ']')).to_have_attribute('aria-current', 'page')
            REPORT['navigation_timings'].append({'width': width, 'target': target,
                'bottom_navigation_tap_ms': round((time.perf_counter() - start) * 1000, 2)})

        navigate_mobile('todos')
        todo_ready(mobile)
        mobile.locator('#todo-text').fill('当前页面再次点击待办时保留的草稿')
        mobile.evaluate('window.__syntheticTodoInput = document.querySelector("#todo-text")')
        history_length = mobile.evaluate('history.length')
        todo_reads = sum(entry['page'] == 'mobile-' + str(width) and entry['method'] == 'GET'
                         and entry['path'].startswith('/api/v1/todos?') for entry in REPORT['api_responses'])
        navigate_mobile('todos')
        expect(mobile.locator('#todo-text')).to_have_value('当前页面再次点击待办时保留的草稿')
        assert mobile.evaluate('window.__syntheticTodoInput === document.querySelector("#todo-text")')
        mobile.wait_for_timeout(100)
        assert mobile.evaluate('history.length') == history_length
        assert sum(entry['page'] == 'mobile-' + str(width) and entry['method'] == 'GET'
                   and entry['path'].startswith('/api/v1/todos?') for entry in REPORT['api_responses']) == todo_reads
        mobile.locator('#todo-text').fill('')
        mark('mobile_same_route_keeps_existing_input_' + str(width))

        check_fresh_navigation(mobile, width, mobile_identity, navigate_mobile)

        held_articles = []

        def hold_articles(route):
            held_articles.append((route, route.fetch()))

        mobile.route('**/api/v1/articles?*', hold_articles)
        navigate_mobile('articles')
        expect(mobile.locator('#page-content')).to_have_attribute('aria-busy', 'true')
        wait_captured(mobile, held_articles)
        navigate_mobile('settings')
        ready(mobile)
        expect(mobile.locator('[data-action=edit-account]')).to_have_count(3)
        navigate_mobile('todos')
        todo_ready(mobile)
        for request, response in held_articles:
            request.fulfill(response=response)
        mobile.unroute('**/api/v1/articles?*', hold_articles)
        mobile.wait_for_timeout(150)
        assert 'page=todos' in mobile.url
        todo_ready(mobile)
        expect(mobile.locator('[data-action=article-detail]:visible')).to_have_count(0)
        mobile.go_back()
        ready(mobile)
        assert 'page=settings' in mobile.url
        expect(mobile.locator('[data-action=edit-account]')).to_have_count(3)
        mobile.go_forward()
        todo_ready(mobile)
        assert 'page=todos' in mobile.url
        mobile.get_by_role('button', name='打开导航', exact=True).click()
        expect(mobile.locator('.shell')).to_have_class(re.compile(r'\bmenu-open\b'))
        assert mobile.locator('#site-nav').bounding_box()['x'] >= 0
        expect(mobile.locator('#site-nav [data-nav=todos]')).to_have_attribute('aria-current', 'page')
        capture(mobile, 'mobile-navigation', width)
        mark('mobile_fast_switch_loading_back_and_late_response_isolation_' + str(width))
        mobile_context.close()

    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.goto(ORIGIN + '/?page=todos')
    todo_ready(page)
    before = api_items(page)
    old_states = {item['id']: (item['completed'], item['version']) for item in before}
    page.locator('#todo-text').fill('零点前尚未提交的输入')
    history_tab = new_page(context, 'history-midnight')
    history_tab.goto(ORIGIN + '/?page=todos&date=2026-10-22')
    todo_ready(history_tab, '2026-10-22')
    result = page.request.post(ORIGIN + '/__synthetic-clock', data={'now': NEXT_NOW})
    assert result.status == 200
    page.evaluate('value=>sessionStorage.setItem("__synthetic_todo_clock", String(Date.parse(value)))', NEXT_NOW)
    history_tab.evaluate('value=>sessionStorage.setItem("__synthetic_todo_clock", String(Date.parse(value)))', NEXT_NOW)
    # Do not send focus, visibilitychange, navigation or manual refresh: the
    # product's already-armed timer must move the mounted today view itself.
    expect(page.locator('#daily-todos')).to_have_attribute('data-date', NEXT_DAY, timeout=8000)
    expect(page.locator('.daily-todo-row')).to_have_count(0)
    assert page.evaluate('new Date().getDate()') == 23  # Los Angeles is still Oct 23.
    assert api_items(page, NEXT_DAY) == []
    assert {item['id']: (item['completed'], item['version']) for item in api_items(page, DAY)} == old_states
    todo_ready(history_tab, '2026-10-22')
    assert 'date=2026-10-22' in history_tab.url
    history_tab.close()
    capture(page, 'automatic-beijing-midnight', 1440)
    mark('beijing_midnight_automatically_opens_empty_today_without_moving_pending', {
        'browser_timezone': 'America/Los_Angeles', 'browser_local_day': 23,
        'beijing_day': NEXT_DAY, 'yesterday_rows_unchanged': len(old_states), 'explicit_history_stays_selected': True})

    page.locator('#todo-date').fill(DAY)
    page.locator('#todo-date').dispatch_event('change')
    todo_ready(page, DAY)
    expect(checkbox(page, first['id'])).to_be_checked()
    expect(checkbox(page, pending['id'])).not_to_be_checked()
    expect(page.locator('#todo-text')).to_have_value('零点前尚未提交的输入')
    page.reload()
    todo_ready(page, DAY)
    expect(checkbox(page, first['id'])).to_be_checked()
    expect(checkbox(page, pending['id'])).not_to_be_checked()
    capture(page, 'yesterday-preserved', 1440)
    mark('yesterday_history_keeps_both_states_and_unsent_draft_is_date_scoped')
    page.locator('[data-action=todo-today]').click()
    todo_ready(page, NEXT_DAY)
    next_item = add(page, '新一天的第一项计划', NEXT_DAY)
    page.reload()
    todo_ready(page, NEXT_DAY)
    expect(row(page, next_item['id'])).to_have_count(1)
    assert len(api_items(page, DAY)) == len(before)
    mark('new_day_add_refresh_and_yesterday_isolation')

    REPORT['server_receipts'] = page.request.get(ORIGIN + '/__synthetic-metrics').json()
    assert not REPORT['pageerrors'], REPORT['pageerrors']
    assert not REPORT['blocked_external_requests'], REPORT['blocked_external_requests']
    for path, expected_hash in metadata['product_hashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected_hash, 'Product changed during browser run: ' + path
    mark('no_uncaught_page_errors_no_external_requests_and_exact_product_hashes')
    context.close()
    browser.close()

REPORT['completed'] = True
save()
print(f"{len(REPORT['checks'])} real Chromium checks passed; {len(REPORT['captures'])} screenshots saved in {OUT}")
