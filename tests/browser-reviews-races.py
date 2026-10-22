"""C4 race checks using real authentication and an isolated loopback D1 only."""
import json
from pathlib import Path
import re
import sys
import traceback
import subprocess
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
origin = 'http://127.0.0.1:8794'
out = root / 'artifacts/browser-reviews-light-final'
out.mkdir(parents=True, exist_ok=True)
harness = (root / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
report = {'synthetic': True, 'instrumentation': 'test-only private module accessors; authentication and application API functions are real', 'source_commit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(), 'checks': {}, 'pageerrors': [], 'console': []}
def mark(name):
    report['checks'][name] = True
    (out / 'races.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print('Synthetic browser check passed: ' + name, flush=True)

def safe_exception(kind, error, frames):
    report['failure'] = {'type': kind.__name__, 'after_checks': list(report['checks'])}
    (out / 'races.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    text = ''.join(traceback.format_exception(kind, error, frames)).replace(password, '[SYNTHETIC PASSWORD REDACTED]')
    text = re.sub(r'[a-fA-F0-9]{64}', '[TOKEN OR HASH REDACTED]', text)
    sys.stderr.write(text)

sys.excepthook = safe_exception
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='Asia/Shanghai')
    context.add_init_script("""const NativeDate=Date;globalThis.Date=class extends NativeDate {
      constructor(...args){super(...(args.length?args:[1792656000000]));}static now(){return 1792656000000;}};""")
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
    page = context.new_page()
    page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
    page.on('console', lambda message: report['console'].append(message.text) if message.type == 'error' else None)

    def ready():
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.error-panel')).to_have_count(0)

    def login():
        page.locator('#username').fill(username)
        page.locator('#password').fill(password)
        page.locator('#login-form button[type=submit]').click()
        ready()
        identity = page.request.get(origin + '/api/v1/auth/me').json()['data']
        assert identity['id']
        return identity

    def hold_index():
        holder = {}
        def handler(route):
            if 'fields=index' in route.request.url and not holder:
                holder['route'] = route
                holder['response'] = route.fetch()
                assert holder['response'].status == 200
            else:
                route.continue_()
        page.route('**/api/v1/articles?*', handler)
        return holder, handler

    def wait_held(holder):
        for _ in range(100):
            if 'response' in holder:
                return
            page.wait_for_timeout(100)
        raise AssertionError('Synthetic index was not intercepted')

    def release(holder, handler):
        holder['route'].fulfill(response=holder['response'])
        page.unroute('**/api/v1/articles?*', handler)

    page.goto(origin + '/?page=reviews&tab=observations', wait_until='networkidle')
    identity = login()
    mark('real_session_identity')
    page.evaluate('syntheticClient.clearArticleIndexes()')
    held, handler = hold_index()
    page.locator('[data-action=review-tab][data-tab=pending]').click()
    wait_held(held)
    title = 'Synthetic in-flight write article'
    created = page.evaluate("""title => syntheticClient.api('/articles',{method:'POST',body:{account_id:'zhihu-haoduoyu',
      title,url:'https://example.invalid/race/'+crypto.randomUUID(),published_at:'2026-10-19T08:00:00Z',production_mode:'manual'}})""", title)
    release(held, handler)
    ready()
    assert page.get_by_role('button', name=title, exact=True).count() >= 1
    assert page.evaluate('title => syntheticClient.articleIndex().then(rows=>rows.some(row=>row.title===title))', title)
    mark('inflight_write_refetched_and_rendered_new_rows')

    page.evaluate('syntheticClient.clearArticleIndexes()')
    held, handler = hold_index()
    page.locator('[data-action=new-review]').first.click()
    wait_held(held)
    page.locator('[data-nav=articles]').click()
    ready()
    release(held, handler)
    page.wait_for_timeout(100)
    expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
    page.locator('[data-action=article-menu]:visible').first.click()
    expect(page.locator('[role=menu] a').filter(has_text='原文')).to_have_count(1)
    page.keyboard.press('Escape')
    mark('navigation_prevents_late_modal_and_retains_original_link')

    page.evaluate('syntheticClient.clearArticleIndexes()')
    failed = {'done': False}
    def fail_once(route):
        if 'fields=index' in route.request.url and not failed['done']:
            failed['done'] = True
            route.fulfill(status=503, content_type='application/json', body=json.dumps({'error': {'code': 'SYNTHETIC_FAILURE', 'message': 'Synthetic retryable read failure'}}))
        else:
            route.continue_()
    page.route('**/api/v1/articles?*', fail_once)
    page.locator('[data-nav=reviews]').click()
    page.locator('.error-panel').wait_for()
    page.locator('.error-panel [data-action=refresh]').click()
    ready()
    page.unroute('**/api/v1/articles?*', fail_once)
    assert page.evaluate('syntheticClient.cacheSize') > 0
    mark('injected_503_is_not_permanently_cached')

    external_title = 'Synthetic external direct target'
    response = page.request.post(origin + '/api/v1/articles', headers={'Origin': origin, 'X-CSRF-Token': identity['csrfToken']},
        data={'account_id': 'zhihu-haoduoyu', 'title': external_title, 'url': 'https://example.invalid/external/'+created['id'],
              'published_at': '2026-10-19T08:00:00Z', 'production_mode': 'manual'})
    assert response.status == 201
    target = response.json()['data']['id']
    page.locator('[data-action=review-tab][data-tab=pending]').click()
    ready()
    page.locator('[data-action=review-article][data-id="'+target+'"]').first.click()
    page.locator('#overlay [role=dialog]').wait_for()
    assert page.locator('#review-article').input_value() == target
    page.keyboard.press('Escape')
    mark('external_target_missing_from_cache_is_refreshed_not_defaulted')

    # Submit both affected forms through their actual delegated handlers.
    page.locator('[data-action=review-tab][data-tab=daily]').click()
    ready()
    page.locator('[data-action=new-review]').first.click()
    page.locator('#overlay [role=dialog]').wait_for()
    page.locator('#review-account').select_option('zhihu-haoduoyu')
    assert page.evaluate("[...document.querySelector('#review-article').options].filter(o=>o.value).every(o=>syntheticClient.reviewArticles.some(a=>a.id===o.value&&a.account_id==='zhihu-haoduoyu'))")
    page.locator('#review-form [name=source]').fill('Synthetic daily form')
    page.locator('#review-form [name=metric_reads]').fill('0')
    before = len(page.request.get(origin + '/__synthetic-metrics').json())
    page.locator('#review-form button[type=submit]').click()
    expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
    ready()
    receipts = page.request.get(origin + '/__synthetic-metrics').json()[before:]
    assert sum(row['method']=='GET' and 'fields=index' in row['path'] for row in receipts) == 1
    mark('daily_form_zero_and_account_options_preserved_write_refetches_once')
    page.locator('[data-action=review-tab][data-tab=observations]').click()
    ready()
    page.locator('[data-action=new-review]').first.click()
    page.locator('#overlay [role=dialog]').wait_for()
    page.locator('#review-article').select_option(created['id'])
    page.locator('#review-form [name=source]').fill('Synthetic snapshot form')
    page.locator('#review-form [name=metric_reads]').fill('0')
    before = len(page.request.get(origin + '/__synthetic-metrics').json())
    page.locator('#review-form button[type=submit]').click()
    expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
    ready()
    receipts = page.request.get(origin + '/__synthetic-metrics').json()[before:]
    assert sum(row['method']=='GET' and 'fields=index' in row['path'] for row in receipts) == 1
    saved = page.request.get(origin + '/api/v1/observations?article_id='+created['id']).json()['data']
    assert any(row['metrics'].get('reads') == 0 and 'likes' not in row['metrics'] for row in saved)
    mark('snapshot_form_keeps_zero_missing_distinct_write_refetches_once')

    page.evaluate('syntheticClient.clearArticleIndexes()')
    held, handler = hold_index()
    page.locator('[data-action=review-tab][data-tab=observations]').click()
    wait_held(held)
    page.locator('[data-action=logout]').click()
    page.locator('#login-form').wait_for()
    release(held, handler)
    page.wait_for_timeout(100)
    assert page.evaluate('syntheticClient.cacheSize') == 0
    assert page.evaluate('syntheticClient.reviewArticles.length') == 0
    assert page.request.get(origin + '/api/v1/auth/me').status == 401
    mark('logout_rejects_late_success_and_clears_index')
    new_identity = login()
    assert new_identity['id'] == identity['id'] and new_identity['csrfToken'] != identity['csrfToken']
    mark('new_real_session_does_not_reuse_previous_session_cache')
    # Delay a real old-cookie 401 until after a new login with the same user ID.
    old_401 = {}
    def delay_old_session(route):
        if 'fields=index' in route.request.url and not old_401:
            old_401['route'] = route
            old_401['cookie'] = route.request.all_headers().get('cookie', '')
            assert old_401['cookie']
        else:
            route.continue_()
    page.evaluate('syntheticClient.clearArticleIndexes()')
    page.route('**/api/v1/articles?*', delay_old_session)
    page.locator('[data-action=review-tab][data-tab=pending]').click()
    for _ in range(100):
        if 'route' in old_401:
            break
        page.wait_for_timeout(100)
    assert 'route' in old_401
    page.locator('[data-action=logout]').click()
    page.locator('#login-form').wait_for()
    expired_response = old_401['route'].fetch(headers={'Cookie': old_401['cookie'], 'Accept': 'application/json'})
    assert expired_response.status == 401
    newest = login()
    assert newest['id'] == new_identity['id'] and newest['csrfToken'] != new_identity['csrfToken']
    assert page.evaluate('syntheticClient.cacheSize') > 0
    old_401['route'].fulfill(response=expired_response)
    page.unroute('**/api/v1/articles?*', delay_old_session)
    page.wait_for_timeout(100)
    expect(page.locator('#login-form')).to_have_count(0)
    assert page.evaluate('syntheticClient.me.id') == newest['id']
    assert page.evaluate('syntheticClient.cacheSize') > 0
    mark('real_old_cookie_401_does_not_sign_out_same_user_new_session')
    # A current-session real 401 must still sign out; this is not swallowed.
    revoked = page.request.post(origin + '/api/v1/auth/logout', headers={'Origin': origin, 'X-CSRF-Token': newest['csrfToken']})
    assert revoked.status == 200
    status = page.evaluate("syntheticClient.api('/accounts').then(()=>200).catch(error=>error.status)")
    assert status == 401
    page.locator('#login-form').wait_for()
    assert page.evaluate('syntheticClient.me') is None
    assert page.evaluate('syntheticClient.cacheSize') == 0
    mark('real_current_session_401_still_signs_out')
    browser.close()
(out / 'races.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
assert not report['pageerrors']
assert all(report['checks'].values())
print('Real local session, in-flight write/logout/navigation, retry and direct-target checks passed; injected 503 and startup 401 retained.')
