"""Real synthetic loopback login/history characterization, before and after B5."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlencode, urlsplit, parse_qs

parser = argparse.ArgumentParser()
parser.add_argument('--phase', choices=['before', 'after'], required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
origin = os.environ.get('ANALYTICS_PREVIEW_ORIGIN', 'http://127.0.0.1:8788').rstrip('/')
u = urlsplit(origin)
try:
    port_ok = u.port is not None and 1024 <= u.port <= 65535
except ValueError:
    port_ok = False
if (u.scheme != 'http' or u.hostname not in ('localhost', '127.0.0.1', '::1') or not port_ok
        or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment):
    raise SystemExit('Refusing non-loopback synthetic preview')

# No authentication material is loaded until the loopback destination is validated.
from playwright.sync_api import sync_playwright, expect
harness = (root / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
expected = dict(page='articles', q='虚构', platform='zhihu', data_status='zero_reads',
                sort='reads', order='asc', page_size='10', account='zhihu-haoduoyu',
                columns='reads,likes,as_of', period='7d', top_n='3', top_platform='toutiao')
route = '/?' + urlencode(expected)
baseline_source = subprocess.check_output(['git', 'show',
    'feea144dda3a8e5c7dc8e7c8cdac3159ac2ac24e:public/app.js'], cwd=root)
out = root / 'artifacts/login-deeplink' / args.phase
out.mkdir(parents=True, exist_ok=True)
report = {'phase': args.phase, 'data': 'isolated synthetic preview', 'widths': [],
          'pageerrors': [], 'console_errors': [], 'failed_requests': [],
          'authentication': 'real loopback API and Cookie session; never stubbed',
          'asset_override': args.phase == 'after', 'frontend_clock': 'fixed presentation clock only',
          'screenshot_motion': 'prefers-reduced-motion: reduce'}
clock = """(() => {const NativeDate=Date;const fixed=Date.parse('2026-10-22T05:00:00Z');
window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[fixed]));}
static now(){return fixed;}};})();"""
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                args=['--disable-gpu', '--force-color-profile=srgb'])
    for width in [375, 390, 768, 1440]:
        context = browser.new_context(viewport={'width': width, 'height': 900}, timezone_id='Asia/Shanghai', reduced_motion='reduce')
        context.add_init_script(clock)
        def route_request(r):
            if not r.request.url.startswith(origin + '/'):
                return r.abort()
            if args.phase == 'after' and urlsplit(r.request.url).path == '/app.js':
                return r.fulfill(status=200, content_type='text/javascript; charset=utf-8',
                                 body=(root / 'public/app.js').read_text())
            return r.continue_()
        context.route('**/*', route_request)
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
        page.on('console', lambda message: report['console_errors'].append(message.text)
                if message.type == 'error' else None)
        page.on('requestfailed', lambda request: report['failed_requests'].append(urlsplit(request.url).path))
        def ready():
            page.locator('#page-content[aria-busy=false]').wait_for()
            expect(page.locator('.error-panel')).to_have_count(0)
        def check_articles():
            ready()
            expect(page.locator('#page-header h1')).to_have_text('文章')
            actual = parse_qs(urlsplit(page.url).query)
            for key, value in expected.items():
                assert actual.get(key) == [value], (key, actual.get(key))
            expect(page.locator('input[name=q]')).to_have_value(expected['q'])
        def nav(name):
            if width <= 760:
                page.get_by_role('button', name='打开导航', exact=True).click()
            page.locator('[data-nav=' + name + ']').click()
            ready()
        served = page.request.get(origin + '/app.js')
        assert served.status == 200
        server_hash = hashlib.sha256(served.body()).hexdigest()
        report.setdefault('server_asset_sha256', server_hash)
        assert report['server_asset_sha256'] == server_hash
        if args.phase == 'after':
            old_report = json.loads((root / 'artifacts/login-deeplink/before/report.json').read_text())
            assert old_report['server_asset_sha256'] == server_hash
        with page.expect_response(lambda r: urlsplit(r.url).path == '/app.js') as loaded:
            page.goto(origin + route, wait_until='networkidle')
        expected_source = baseline_source if args.phase == 'before' else (root / 'public/app.js').read_bytes()
        assert hashlib.sha256(loaded.value.body()).hexdigest() == hashlib.sha256(expected_source).hexdigest()
        page.locator('#login-form').wait_for()
        assert page.request.get(origin + '/api/v1/auth/me').status == 401
        page.locator('#username').fill(username)
        if width == 375:
            page.locator('#password').fill(password + '-incorrect')
            with page.expect_response(lambda r: urlsplit(r.url).path == '/api/v1/auth/login'
                                      and r.request.method == 'POST') as response:
                page.locator('#login-form button[type=submit]').click()
            assert response.value.status == 401
            expect(page.locator('#login-form')).to_be_visible()
        page.locator('#password').fill(password)
        with page.expect_response(lambda r: urlsplit(r.url).path == '/api/v1/auth/login'
                                  and r.request.method == 'POST') as response:
            page.locator('#login-form button[type=submit]').click()
        assert response.value.status == 200
        check_articles()
        me = page.request.get(origin + '/api/v1/auth/me')
        assert me.status == 200 and isinstance(me.json()['data'].get('id'), str)
        assert context.cookies(origin)
        page.reload(wait_until='networkidle')
        check_articles()
        nav('settings')
        expect(page.locator('#page-header h1')).to_have_text('设置')
        page.go_back()
        check_articles()
        page.go_forward()
        ready()
        expect(page.locator('#page-header h1')).to_have_text('设置')
        page.go_back()
        check_articles()
        page.reload(wait_until='networkidle')
        check_articles()
        assert page.locator('input[type=password]').count() == 0
        assert page.locator('#created-token').count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        image = out / f'articles-{width}.png'
        page.mouse.move(0, 0)
        page.screenshot(path=str(image), full_page=True, animations='disabled')
        item = {'width': width, 'login': 200, 'anonymous': 401, 'wrong_password': 401 if width == 375 else 'not repeated',
                'deeplink_reload_back_forward': True, 'screenshot_sha256': hashlib.sha256(image.read_bytes()).hexdigest()}
        if args.phase == 'after':
            before = root / 'artifacts/login-deeplink/before' / image.name
            assert before.read_bytes() == image.read_bytes(), 'before/after screenshot differs at ' + str(width)
            item['screenshot_byte_identical'] = True
        report['widths'].append(item)
        if width <= 760:
            page.get_by_role('button', name='打开导航', exact=True).click()
        with page.expect_response(lambda r: urlsplit(r.url).path == '/api/v1/auth/logout') as response:
            page.get_by_role('button', name='退出登录', exact=True).click()
        assert response.value.status == 200
        page.locator('#login-form').wait_for()
        assert page.request.get(origin + '/api/v1/auth/me').status == 401
        context.close()
    assert not report['pageerrors'] and not report['failed_requests']
    browser.close()
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('Real loopback login/deeplink/history passed at 375/390/768/1440; credentials never recorded.')
