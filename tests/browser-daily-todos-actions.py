"""Real Chromium acceptance for todo menus, soft deletion and display preferences.

After a coordinated product build, start daily-todos-browser-server.mjs with a
fresh synthetic D1, then run this file. No production configuration is used.
Evidence stays ignored under artifacts/daily-todos/actions; prior runs are kept.
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
OUT = ROOT / 'artifacts/daily-todos/actions'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:' + os.environ.get('DAILY_TODOS_PORT', '8797')
DAY, PAST, FUTURE = '2026-10-23', '2026-10-22', '2026-10-25'
HARNESS = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", HARNESS).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", HARNESS).group(1)
assert USERNAME.startswith('synthetic-')
CLOCK = """(() => {const NativeDate=Date;globalThis.Date=class extends NativeDate {
 constructor(...args){super(...(args.length?args:['2026-10-23T15:59:58.000Z']));}
 static now(){return NativeDate.parse('2026-10-23T15:59:58.000Z');}};})();"""
REPORT = {'synthetic': True, 'completed': False, 'checks': {}, 'captures': [],
          'api_requests': [], 'api_responses': [], 'api_request_failures': [],
          'pageerrors': [], 'blocked_external_requests': [],
          'test_source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if (OUT / 'report.json').exists():
    previous = (OUT / 'report.json').read_bytes()
    (OUT / ('previous-report-' + hashlib.sha256(previous).hexdigest()[:12] + '.json')).write_bytes(previous)


def save():
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))


def mark(name, evidence=True):
    REPORT['checks'][name] = evidence
    save()
    print('Passed: ' + name, flush=True)


def exception(kind, error, frames):
    REPORT['failure'] = {'type': kind.__name__, 'message': str(error).replace(PASSWORD, '[redacted]')}
    save()
    sys.stderr.write(''.join(traceback.format_exception(kind, error, frames)).replace(PASSWORD, '[redacted]'))


sys.excepthook = exception
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
        page.on('response', lambda response: REPORT['api_responses'].append({
            'width': width, 'method': response.request.method,
            'path': response.url.removeprefix(ORIGIN), 'status': response.status})
            if response.url.startswith(ORIGIN + '/api/v1/') else None)
        page.on('requestfailed', lambda request: REPORT['api_request_failures'].append({
            'width': width, 'method': request.method, 'path': request.url.removeprefix(ORIGIN), 'failure': request.failure})
            if request.url.startswith(ORIGIN + '/api/v1/') else None)
        return context, page

    def ready(page, date=DAY):
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.error-panel')).to_have_count(0)
        expect(page.locator('#daily-todos')).to_have_attribute('data-date', date)
        expect(page.locator('#todo-status')).not_to_contain_text('正在读取')
        expect(page.locator('#todo-text')).to_be_visible()

    def login(page):
        assets = {}

        def asset(response):
            if response.url in [ORIGIN + '/app.js', ORIGIN + '/style.css']:
                assets[response.url.removeprefix(ORIGIN)] = response

        page.on('response', asset)
        page.goto(ORIGIN, wait_until='networkidle')
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill(PASSWORD)
        page.locator('#login-form button[type=submit]').click()
        ready(page)
        assert 'page=todos' in page.url
        body_hashes = {path: hashlib.sha256(response.body()).hexdigest() for path, response in assets.items()}
        assert set(body_hashes) == {'/app.js', '/style.css'}
        assert all(value == REPORT['product_hashes']['public' + path] for path, value in body_hashes.items())
        REPORT.setdefault('served_asset_hashes', {})[str(page.viewport_size['width'])] = body_hashes
        page.remove_listener('response', asset)
        response = page.request.get(ORIGIN + '/api/v1/auth/me')
        assert response.status == 200
        return response.json()['data']

    def api(page, method, path, data=None, identity=None, status=200):
        options = {'method': method}
        if data is not None:
            options['data'] = data
        if identity is not None:
            options['headers'] = {'Origin': ORIGIN, 'X-CSRF-Token': identity['csrfToken']}
        response = page.request.fetch(ORIGIN + '/api/v1' + path, **options)
        assert response.status == status, (method, path, response.status, response.text())
        payload = response.json()
        return payload['data'] if status < 400 else payload

    def items(page, date=DAY):
        return api(page, 'GET', '/todos?date=' + date)['items']

    def item(page, item_id, date=DAY):
        return next(row for row in items(page, date) if row['id'] == item_id)

    def seed(page, identity, text, date=DAY, completed=False, template_id=None):
        body = {'id': str(uuid.uuid4()), 'date': date, 'text': text}
        if template_id:
            body['template_id'] = template_id
        row = api(page, 'POST', '/todos', body, identity, 201)
        if completed:
            row = api(page, 'PATCH', '/todos/' + row['id'], {'completed': True, 'version': row['version']}, identity)
        return row

    def row(page, item_id):
        return page.locator('.daily-todo-row[data-id="' + item_id + '"]')

    def checkbox(page, item_id):
        return row(page, item_id).locator('input[type=checkbox]')

    def menu(page):
        return page.locator('.popover[role=menu]')

    def open_menu(page, item_id, keyboard=False):
        trigger = row(page, item_id).locator('[data-action=todo-menu]')
        if keyboard:
            trigger.focus()
            trigger.press('Enter')
        elif page.viewport_size['width'] == 375:
            trigger.tap()
        else:
            trigger.click()
        expect(menu(page)).to_be_visible()
        return trigger

    def choose(page, action):
        target = menu(page).locator('[data-action=' + action + ']')
        if page.viewport_size['width'] == 375:
            target.tap()
        else:
            target.click()

    def expect_call(page, method, path):
        return page.expect_response(lambda response: response.request.method == method and response.url == ORIGIN + '/api/v1' + path)

    def held_call(page, method, path):
        held = []

        def handler(route):
            if route.request.method == method:
                held.append(route)
            else:
                route.continue_()

        pattern = ORIGIN + '/api/v1' + path
        page.route(pattern, handler)
        return held, handler, pattern

    def wait_held(page, held):
        deadline = time.monotonic() + 10
        while not held and time.monotonic() < deadline:
            page.wait_for_timeout(50)
        assert len(held) == 1, len(held)

    def release(page, held, handler, pattern, expected=200):
        assert len(held) == 1
        response = held[0].fetch()
        assert response.status == expected
        data = response.json()['data']
        held[0].fulfill(response=response)
        page.unroute(pattern, handler)
        return data

    def fail(page, held, handler, pattern, message):
        assert len(held) == 1
        held[0].fulfill(status=503, content_type='application/json', body=json.dumps({
            'error': {'code': 'SYNTHETIC_ACTION_FAILURE', 'message': message}}))
        page.unroute(pattern, handler)

    def capture(page, name):
        assert not page.locator('input[type=password]').count()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        path = OUT / (name + '.png')
        page.screenshot(path=str(path), full_page=False, animations='disabled')
        REPORT['captures'].append({'name': name, 'path': str(path.relative_to(ROOT)),
                                  'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size})
        save()

    def set_mode(page, mode):
        with expect_call(page, 'PATCH', '/todo-preferences') as response:
            page.locator('#todo-completed-mode').select_option(mode)
        assert response.value.status == 200
        expect(page.locator('#todo-completed-mode')).to_have_value(mode)
        return response.value.json()['data']

    def read_templates(page):
        return api(page, 'GET', '/todo-templates')['items']

    def open_templates(page):
        if not page.locator('#todo-templates').evaluate('node=>node.open'):
            page.locator('#todo-templates summary').click()
        expect(page.locator('#todo-template-text')).to_be_visible()
        expect(page.locator('#todo-template-status')).not_to_contain_text('正在读取')

    def close_templates(page):
        if page.locator('#todo-templates').evaluate('node=>node.open'):
            page.locator('#todo-templates summary').click()

    def todo_writes(offset, width=375):
        return [entry for entry in REPORT['api_requests'][offset:]
                if entry['width'] == width and entry['method'] != 'GET' and entry['path'].startswith('/api/v1/todos')]

    def stable_fields(rows):
        return [{key: row.get(key) for key in ['id', 'date', 'text', 'completed', 'template_id']} for row in rows]

    mobile_context, page = new_page(375)
    metadata = page.request.get(ORIGIN + '/__synthetic-fixture').json()
    assert metadata['synthetic']
    REPORT['fixture'] = {key: metadata[key] for key in ['source_commit', 'product_manifest_sha256', 'isolation']}
    REPORT['product_hashes'] = {path: metadata['product_hashes'][path] for path in [
        'public/app.js', 'public/style.css', 'dist/server/index.js', 'web/pages/todos.mjs', 'web/ui/todo-gestures.mjs']}
    identity = login(page)
    assert items(page) == [] and read_templates(page) == [], 'Start a fresh synthetic fixture'
    expect(page.locator('#todo-completed-mode')).to_have_value('strike')
    shared_text = '核对今日公开资料'
    template = api(page, 'POST', '/todo-templates', {'id': str(uuid.uuid4()), 'text': shared_text}, identity, 201)
    linked = seed(page, identity, shared_text, completed=True, template_id=template['id'])
    same_name = seed(page, identity, shared_text)
    plain = seed(page, identity, '写完今日影视选题')
    complete = seed(page, identity, '归档已经完成的资料', completed=True)
    for index in range(14):
        seed(page, identity, f'合成手势滚动计划 {index + 1:02d}')
    past = seed(page, identity, '昨日保持原样的计划', date=PAST, completed=True)
    future = seed(page, identity, '提前写给未来的计划', date=FUTURE)
    protected_dates = {date: items(page, date) for date in [PAST, FUTURE]}
    REPORT['synthetic_ids'] = {'linked': linked['id'], 'same_name': same_name['id'], 'plain': plain['id'],
                               'complete': complete['id'], 'template': template['id'], 'past': past['id'], 'future': future['id']}
    page.reload(wait_until='networkidle')
    ready(page)
    expect(row(page, same_name['id'])).to_be_visible()
    desktop_context, desktop = new_page(1440)
    desktop_identity = login(desktop)
    assert desktop_identity['id'] == identity['id'] and desktop_identity['csrfToken'] != identity['csrfToken']
    mark('default_entry_and_two_independent_sessions_use_same_user_with_strike_default')

    # CDP dispatches trusted Chromium touch input, not DOM-dispatched pointer events.
    cdp = mobile_context.new_cdp_session(page)
    page.evaluate("""() => {window.__todoGestureEvents=[];window.__todoMenuTimes=[];
      new MutationObserver(records=>{for(const record of records)for(const n of record.addedNodes)
        if(n.nodeType===1&&n.matches('.popover[role=menu]'))window.__todoMenuTimes.push(performance.now());})
        .observe(document.body,{childList:true});
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel','click','contextmenu'])
        document.addEventListener(type,event=>queueMicrotask(()=>window.__todoGestureEvents.push({
          type,pointerType:event.pointerType||'',trusted:event.isTrusted,prevented:event.defaultPrevented,
          x:event.clientX,y:event.clientY,performance_ms:performance.now()})),{capture:true});}""")

    def point(item_id):
        row(page, item_id).scroll_into_view_if_needed()
        bounds = row(page, item_id).locator('label').bounding_box()
        return {'x': bounds['x'] + min(120, bounds['width'] / 2), 'y': bounds['y'] + bounds['height'] / 2,
                'radiusX': 2, 'radiusY': 2, 'force': 1, 'id': 1}

    def touch(kind, points):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': points})

    before_gesture = items(page)
    offset = len(REPORT['api_requests'])
    p = point(same_name['id'])
    touch('touchStart', [p])
    page.wait_for_timeout(500)
    expect(menu(page)).to_have_count(0)
    observed_absent_at = page.evaluate('performance.now()')
    page.wait_for_timeout(250)
    expect(menu(page)).to_be_visible()
    touch('touchEnd', [])
    page.wait_for_timeout(150)
    expect(menu(page).locator('[data-action=todo-make-template]')).to_be_visible()
    expect(menu(page).locator('[data-action=todo-remove-template]')).to_have_count(0)
    assert items(page) == before_gesture and todo_writes(offset) == []
    gesture_events = page.evaluate('window.__todoGestureEvents')
    assert all(event['prevented'] for event in gesture_events if event['type'] == 'contextmenu')
    capture(page, '375-long-press-menu')
    menu_bounds = menu(page).bounding_box()
    assert menu_bounds['x'] >= 0 and menu_bounds['x'] + menu_bounds['width'] <= 375
    assert menu_bounds['y'] >= 0 and menu_bounds['y'] + menu_bounds['height'] <= 844
    page.keyboard.press('Escape')
    expect(menu(page)).to_have_count(0)
    press_started = next(event['performance_ms'] for event in gesture_events if event['type'] == 'pointerdown')
    mark('trusted_touch_before_and_after_threshold_opens_menu_without_release_toggle', {
        'requested_waits_ms': [500, 250], 'observed_menu_absent_after_ms': observed_absent_at - press_started,
        'observed_menu_open_after_ms': page.evaluate('window.__todoMenuTimes[0]') - press_started,
        'todo_write_requests': 0, 'menu_bounds': menu_bounds,
        'events': gesture_events,
        'native_contextmenu_events_observed': sum(event['type'] == 'contextmenu' for event in gesture_events)})

    gesture_cases = []
    for kind in ['cancel', 'move', 'scroll']:
        page.evaluate('window.scrollTo(0,0)')
        p = point(plain['id'])
        offset = len(REPORT['api_requests'])
        event_offset = page.evaluate('window.__todoGestureEvents.length')
        touch('touchStart', [p])
        page.wait_for_timeout(120)
        if kind == 'cancel':
            touch('touchCancel', [])
        elif kind == 'move':
            touch('touchMove', [{**p, 'x': p['x'] + 35}])
        else:
            for distance in [35, 70, 110, 150]:
                touch('touchMove', [{**p, 'y': p['y'] - distance}])
                page.wait_for_timeout(30)
        page.wait_for_timeout(700)
        if kind != 'cancel':
            touch('touchEnd', [])
        page.wait_for_timeout(100)
        expect(menu(page)).to_have_count(0)
        assert todo_writes(offset) == [] and items(page) == before_gesture
        observed = page.evaluate('start=>window.__todoGestureEvents.slice(start)', event_offset)
        if kind == 'cancel':
            assert any(event['type'] == 'pointercancel' and event['trusted'] for event in observed)
        if kind == 'scroll':
            assert page.evaluate('scrollY') > 0
        gesture_cases.append({'case': kind, 'scroll_y': page.evaluate('scrollY'), 'events': observed})
    page.evaluate('window.scrollTo(0,0)')
    mark('trusted_pointer_cancel_drag_and_real_scroll_cancel_long_press_without_writes', gesture_cases)

    trigger = open_menu(desktop, linked['id'], keyboard=True)
    expect(menu(desktop).locator('[data-action=todo-remove-template]')).to_be_visible()
    expect(menu(desktop).locator('[data-action=todo-make-template]')).to_have_count(0)
    desktop.keyboard.press('End')
    expect(menu(desktop).locator('[role=menuitem]').last).to_be_focused()
    desktop.keyboard.press('Home')
    expect(menu(desktop).locator('[role=menuitem]').first).to_be_focused()
    capture(desktop, '1440-keyboard-menu')
    desktop.keyboard.press('Escape')
    expect(menu(desktop)).to_have_count(0)
    expect(trigger).to_be_focused()
    trigger.press('Space')
    expect(menu(desktop)).to_be_visible()
    desktop.keyboard.press('Escape')
    expect(trigger).to_be_focused()
    open_menu(page, plain['id'])
    page.locator('#page-header h1').tap()
    expect(menu(page)).to_have_count(0)
    mark('keyboard_menu_navigation_escape_focus_and_outside_tap_close_same_menu')

    # Same text is not an association: from-todo creates a new stable template id.
    open_menu(page, same_name['id'])
    held, handler, pattern = held_call(page, 'POST', '/todos/' + same_name['id'] + '/template')
    choose(page, 'todo-make-template')
    wait_held(page, held)
    from_todo_body = held[0].request.post_data_json
    assert from_todo_body['template_id'] != template['id'] and from_todo_body['template_version'] == 0
    assert not item(page, same_name['id']).get('template_id')
    made = release(page, held, handler, pattern, expected=200)
    expect(row(page, same_name['id']).locator('[data-action=todo-menu]')).to_be_enabled()
    linked_same = made['todo']
    new_template = made['template']
    assert linked_same['template_id'] == new_template['id'] != template['id']
    assert linked_same['text'] == same_name['text'] and linked_same['completed'] is False
    assert len(read_templates(page)) == 2
    open_menu(page, same_name['id'])
    expect(menu(page).locator('[data-action=todo-remove-template]')).to_be_visible()
    expect(menu(page).locator('[data-action=todo-make-template]')).to_have_count(0)
    with expect_call(page, 'DELETE', '/todo-templates/' + new_template['id']) as removed:
        choose(page, 'todo-remove-template')
    assert removed.value.status == 200
    expect(row(page, same_name['id'])).to_have_count(1)
    assert stable_fields([item(page, same_name['id'])]) == stable_fields([linked_same])
    assert item(page, same_name['id'])['template_active'] is False
    api(page, 'POST', '/todos/' + same_name['id'] + '/template', from_todo_body, identity, 409)
    open_menu(page, same_name['id'])
    expect(menu(page).locator('[data-action=todo-make-template]')).to_be_visible()
    expect(menu(page).locator('[data-action=todo-remove-template]')).to_have_count(0)
    with expect_call(page, 'POST', '/todos/' + same_name['id'] + '/template') as reactivated:
        choose(page, 'todo-make-template')
    assert reactivated.value.status == 200
    assert reactivated.value.json()['data']['template']['id'] == new_template['id']
    assert len(read_templates(page)) == 2 and item(page, same_name['id'])['template_active'] is True
    mark('same_name_is_not_misbound_menu_actions_are_exclusive_cancel_preserves_todo_and_readd_reuses_id')

    # Preferences are server persisted; hiding completed rows never mutates todos.
    before_mode = items(page)
    offset = len(REPORT['api_requests'])
    mode = set_mode(page, 'hide')
    assert mode['completed_mode'] == 'hide'
    expect(row(page, linked['id'])).to_have_count(0)
    expect(row(page, complete['id'])).to_have_count(0)
    expect(row(page, plain['id'])).to_have_count(1)
    assert items(page) == before_mode and todo_writes(offset) == []
    capture(page, '375-hidden-completed')
    page.reload(wait_until='networkidle')
    ready(page)
    expect(page.locator('#todo-completed-mode')).to_have_value('hide')
    expect(row(page, linked['id'])).to_have_count(0)
    desktop.reload(wait_until='networkidle')
    ready(desktop)
    expect(desktop.locator('#todo-completed-mode')).to_have_value('hide')
    expect(row(desktop, linked['id'])).to_have_count(0)
    assert api(desktop, 'GET', '/todos?date=' + DAY)['completed_mode'] == 'hide'
    mark('hide_preference_survives_reload_and_independent_session_without_any_todo_write', {
        'preference_version': mode['version'], 'todo_writes_on_mode_change': 0,
        'api_items_still_include_completed': sum(row['completed'] for row in before_mode)})

    page.locator('#todo-text').fill('失败时继续保留这段计划草稿')
    held, handler, pattern = held_call(page, 'PATCH', '/todos/' + plain['id'])
    checkbox(page, plain['id']).tap()
    wait_held(page, held)
    expect(row(page, plain['id'])).to_have_count(0)
    assert item(page, plain['id'])['completed'] is False
    fail(page, held, handler, pattern, '合成测试：完成状态未保存，请重试。')
    expect(row(page, plain['id'])).to_have_count(1)
    expect(checkbox(page, plain['id'])).not_to_be_checked()
    expect(page.locator('#todo-text')).to_have_value('失败时继续保留这段计划草稿')
    expect(page.locator('#todo-feedback')).to_contain_text('完成状态未保存')
    bounds = page.locator('#todo-feedback').bounding_box()
    nav = page.locator('.mobile-nav').bounding_box()
    assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] < nav['y']
    capture(page, '375-hide-failure-rollback')
    mark('failed_completion_in_hide_mode_restores_row_and_keeps_first_screen_error_and_draft', {
        'feedback': bounds, 'nav_top': nav['y'], 'intercepted_patch_requests': len(held)})

    with expect_call(page, 'PATCH', '/todos/' + plain['id']) as completed:
        checkbox(page, plain['id']).tap()
    assert completed.value.status == 200
    plain = completed.value.json()['data']
    expect(row(page, plain['id'])).to_have_count(0)
    assert plain['completed'] is True and plain['deleted_at'] is None
    set_mode(page, 'strike')
    expect(row(page, plain['id'])).to_have_count(1)
    expect(checkbox(page, plain['id'])).to_be_checked()
    assert row(page, plain['id']).locator('.daily-todo-text').evaluate('n=>getComputedStyle(n).textDecorationLine.includes("line-through")')
    mark('successful_hide_completion_remains_in_storage_and_strike_mode_restores_visible_completed_row')

    # A failed soft deletion returns the exact stored row and retains the draft.
    before_delete = items(page)
    open_menu(page, plain['id'])
    held, handler, pattern = held_call(page, 'DELETE', '/todos/' + plain['id'])
    choose(page, 'todo-delete')
    wait_held(page, held)
    expect(row(page, plain['id'])).to_have_count(0)
    fail(page, held, handler, pattern, '合成测试：删除未保存，事项已保留。')
    expect(row(page, plain['id'])).to_have_count(1)
    expect(page.locator('#todo-feedback')).to_contain_text('删除未保存')
    expect(page.locator('#todo-text')).to_have_value('失败时继续保留这段计划草稿')
    assert items(page) == before_delete
    mark('failed_delete_rolls_back_exact_row_and_keeps_draft')

    # Another session wins the version race; the browser must reconcile a 409.
    open_templates(page)
    progress = page.locator('[data-template-id="' + template['id'] + '"] [data-template-count]')
    expect(progress).to_have_text(re.compile(r'近30天已完成\s*1\s*天'))
    changed = api(desktop, 'PATCH', '/todos/' + linked['id'],
                  {'completed': False, 'version': linked['version']}, desktop_identity)
    open_menu(page, linked['id'])
    with expect_call(page, 'GET', '/todo-templates') as conflict_progress:
        with expect_call(page, 'GET', '/todos?date=' + DAY) as reread:
            with expect_call(page, 'DELETE', '/todos/' + linked['id']) as conflict:
                choose(page, 'todo-delete')
    assert conflict.value.status == 409 and reread.value.status == 200 and conflict_progress.value.status == 200
    expect(row(page, linked['id'])).to_have_count(1)
    expect(checkbox(page, linked['id'])).not_to_be_checked()
    expect(progress).to_have_text(re.compile(r'近30天已完成\s*0\s*天'))
    assert item(page, linked['id']) == changed
    with expect_call(page, 'GET', '/todo-templates') as recompleted_progress:
        with expect_call(page, 'PATCH', '/todos/' + linked['id']) as recompleted:
            checkbox(page, linked['id']).tap()
    assert recompleted.value.status == 200 and recompleted_progress.value.status == 200
    linked = recompleted.value.json()['data']
    expect(progress).to_have_text(re.compile(r'近30天已完成\s*1\s*天'))
    close_templates(page)
    mark('real_cross_session_delete_409_reconciles_row_and_open_template_count', {
        'delete_status': 409, 'todo_reload_status': 200, 'template_reload_status': 200,
        'template_count_before_conflict_after_conflict_after_recompletion': [1, 0, 1]})

    open_templates(page)
    progress = page.locator('[data-template-id="' + template['id'] + '"] [data-template-count]')
    expect(progress).to_have_text(re.compile(r'近30天已完成\s*1\s*天'))
    close_templates(page)
    open_menu(page, linked['id'])
    with expect_call(page, 'DELETE', '/todos/' + linked['id']) as deleted:
        choose(page, 'todo-delete')
    assert deleted.value.status == 200
    deleted_item = deleted.value.json()['data']
    assert deleted_item['deleted_at'] and deleted_item['completed'] and deleted_item['template_id'] == template['id']
    expect(row(page, linked['id'])).to_have_count(0)
    undo = page.locator('#todo-undo [data-action=todo-restore][data-id="' + linked['id'] + '"]')
    expect(undo).to_be_visible()
    assert next(t for t in read_templates(page) if t['id'] == template['id'])['completed_days'] == 0
    capture(page, '375-delete-undo')
    held, handler, pattern = held_call(page, 'POST', '/todos/' + linked['id'] + '/restore')
    undo.tap()
    wait_held(page, held)
    page.wait_for_timeout(8200)
    expect(undo).to_be_visible()
    expect(undo).to_be_disabled()
    undo_box = undo.bounding_box()
    page.touchscreen.tap(undo_box['x'] + undo_box['width'] / 2, undo_box['y'] + undo_box['height'] / 2)
    page.wait_for_timeout(100)
    assert len(held) == 1
    restore_body = held[0].request.post_data_json
    fail(page, held, handler, pattern, '合成测试：撤销未保存，请重试。')
    expect(page.locator('#todo-feedback')).to_contain_text('撤销未保存')
    expect(undo).to_be_visible()
    expect(row(page, linked['id'])).to_have_count(0)
    with expect_call(page, 'POST', '/todos/' + linked['id'] + '/restore') as restored:
        undo.tap()
    assert restored.value.status == 200
    restored_item = restored.value.json()['data']
    expect(row(page, linked['id'])).to_have_count(1)
    assert restored_item['deleted_at'] is None and stable_fields([restored_item]) == stable_fields([linked])
    duplicate_restore = api(page, 'POST', '/todos/' + linked['id'] + '/restore', restore_body, identity)
    assert duplicate_restore == restored_item
    assert next(t for t in read_templates(page) if t['id'] == template['id'])['completed_days'] == 1
    open_templates(page)
    expect(progress).to_have_text(re.compile(r'近30天已完成\s*1\s*天'))
    page.evaluate('window.scrollTo(0,0)')
    capture(page, '375-restored-template-count')
    close_templates(page)
    mark('soft_delete_and_retryable_undo_preserve_completed_template_and_recompute_days_with_duplicate_restore_idempotent', {
        'delete_status': deleted.value.status, 'restore_status': restored.value.status,
        'restore_pending_taps': 2, 'restore_pending_requests': len(held),
        'restore_held_without_expiring_undo_ms': 8200,
        'completed_days_before_after_delete_after_restore': [1, 0, 1]})

    # A late failure after navigation must not replace the active module.
    late_target = item(page, same_name['id'])
    open_menu(page, late_target['id'])
    held, handler, pattern = held_call(page, 'DELETE', '/todos/' + late_target['id'])
    choose(page, 'todo-delete')
    wait_held(page, held)
    page.locator('.mobile-nav [data-nav=articles]').tap()
    page.locator('#page-content[aria-busy=false]').wait_for()
    expect(page.locator('[data-action=article-detail]:visible')).to_have_count(3)
    fail(page, held, handler, pattern, '合成测试：迟到删除失败，原事项保留。')
    page.wait_for_timeout(100)
    assert 'page=articles' in page.url
    expect(page.locator('[data-action=article-detail]:visible')).to_have_count(3)
    expect(page.locator('#daily-todos')).to_have_count(0)
    page.locator('.mobile-nav [data-nav=todos]').tap()
    ready(page)
    expect(row(page, late_target['id'])).to_have_count(1)
    assert item(page, late_target['id']) == late_target
    mark('late_delete_failure_cannot_overwrite_articles_and_original_todo_survives_return')

    for date in [PAST, FUTURE]:
        page.goto(ORIGIN + '/?page=todos&date=' + date, wait_until='networkidle')
        ready(page, date)
        assert 'date=' + date in page.url and items(page, date) == protected_dates[date]
        assert stable_fields(items(page, date)) == stable_fields(protected_dates[date])
    assert item(page, same_name['id'])['template_id'] == new_template['id']
    assert next(t for t in read_templates(page) if t['id'] == template['id'])['completed_days'] == 1
    mark('history_future_and_other_template_records_are_unchanged_by_menu_actions')

    for path, value in REPORT['product_hashes'].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == value, path
    assert not REPORT['pageerrors'] and not REPORT['blocked_external_requests']
    assert len(REPORT['captures']) == 6
    REPORT['server_receipts'] = page.request.get(ORIGIN + '/__synthetic-metrics').json()
    REPORT['completed'] = True
    save()
    mobile_context.close()
    desktop_context.close()
    browser.close()
print(f"{len(REPORT['checks'])} focused todo-action checks passed; six screenshots and exact hashes saved.")
