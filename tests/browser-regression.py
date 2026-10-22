"""Optional browser checks against the synthetic loopback analytics preview only."""
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = os.environ.get('ANALYTICS_PREVIEW_ORIGIN', 'http://127.0.0.1:8788')
parsed = urlsplit(ORIGIN)
try:
    valid_port = parsed.port is not None and 1024 <= parsed.port <= 65535
except ValueError:
    valid_port = False
if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
        or not valid_port or parsed.username or parsed.password
        or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
    raise SystemExit('Refusing non-loopback or malformed synthetic preview origin')
ORIGIN = ORIGIN.rstrip('/')
if '--check-origin' in sys.argv:
    print('Accepted loopback synthetic preview origin')
    raise SystemExit(0)

# Origin validation occurs before loading test authentication or a browser.
from playwright.sync_api import sync_playwright, expect

harness = (ROOT / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
out = ROOT / 'artifacts/browser'
out.mkdir(parents=True, exist_ok=True)
report = {'source': 'synthetic loopback preview', 'widths': [],
          'pageerrors': [], 'console_errors': [], 'failed_requests': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='Asia/Shanghai')
    context.route('**/*', lambda route: route.continue_()
                  if route.request.url.startswith(ORIGIN + '/') else route.abort())
    page = context.new_page()
    request_paths = []
    page.on('request', lambda request: request_paths.append(urlsplit(request.url).path))
    page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
    page.on('console', lambda message: report['console_errors'].append(message.text)
            if message.type == 'error' else None)
    page.on('requestfailed', lambda request: report['failed_requests'].append({
        'path': urlsplit(request.url).path, 'reason': request.failure}))

    def ready():
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.error-panel')).to_have_count(0)

    def screenshot(name):
        assert page.locator('input[type=password]').count() == 0
        assert page.locator('#created-token').count() == 0
        page.screenshot(path=str(out / (name + '.png')), animations='disabled', full_page=True)

    page.goto(ORIGIN, wait_until='networkidle')
    page.locator('#login-form').wait_for()
    page.locator('#username').fill(username)
    page.locator('#password').fill(password)
    page.locator('#login-form button[type=submit]').click()
    ready()
    expect(page.locator('.nav-list [data-nav]')).to_have_count(3)
    expect(page.locator('[data-nav=settings]')).to_have_count(1)
    identity = page.request.get(ORIGIN + '/api/v1/auth/me').json()['data']
    assert isinstance(identity.get('id'), str) and identity['id']
    audit = page.request.get(ORIGIN + '/api/v1/audit').json()['data']
    assert any(row['actor'] == 'user:' + identity['id'] for row in audit)
    report['authenticated_audit_actor_matches'] = True
    accounts = page.request.get(ORIGIN + '/api/v1/accounts').json()['data']
    audit_title = '虚构审计 <img src=x onerror=alert(1)> & "样本"'
    created = page.request.post(ORIGIN + '/api/v1/articles',
        headers={'X-CSRF-Token': identity['csrfToken'], 'Origin': ORIGIN},
        data={'account_id': accounts[0]['id'], 'title': audit_title,
              'url': 'https://example.invalid/browser-audit-label/' + str(__import__('uuid').uuid4()),
              'published_at': '2000-01-01T00:00:00Z', 'production_mode': 'manual'})
    assert created.status == 201
    audit_article_id = created.json()['data']['id']
    first_page = page.request.get(ORIGIN + '/api/v1/articles?page=1&page_size=20').json()['data']
    assert all(row['id'] != audit_article_id for row in first_page)
    report['audit_label_outside_first_page'] = True
    for width in [375, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 900})
        for name, query in [('dashboard', 'page=dashboard'), ('articles', 'page=articles'),
                            ('data', 'page=reviews&tab=observations')]:
            page.goto(ORIGIN + '/?' + query)
            ready()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            screenshot(f'{name}-{width}')
        request_paths.clear()
        page.goto(ORIGIN + '/?page=settings&tab=log')
        ready()
        expect(page.locator('.audit-meta').filter(has_text=re.compile(r'^我 ·')).first).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        assert '/api/v1/articles' not in request_paths
        article_link = page.get_by_role('button', name=audit_title, exact=True)
        expect(article_link).to_have_count(1)
        article_link.locator('xpath=ancestor::details').locator('summary').click()
        expect(article_link).to_be_visible()
        expect(page.locator('.audit-list img')).to_have_count(0)
        screenshot(f'audit-{width}')
        article_link.click()
        page.locator('#overlay [role=dialog]').wait_for()
        expect(page.locator('#overlay')).to_contain_text(audit_title)
        page.keyboard.press('Escape')
        page.goto(ORIGIN + '/?page=articles')
        ready()
        page.locator('[data-action=article-detail]:visible').first.click()
        page.locator('#overlay [role=dialog]').wait_for()
        screenshot(f'detail-{width}')
        page.keyboard.press('Escape')
        expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
        report['widths'].append(width)
    assert not report['pageerrors']
    browser.close()
# Keep the known unauthenticated startup 401 console entry visible in this report.
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
print('Synthetic browser checks completed; startup authentication diagnostics retained.')
