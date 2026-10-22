"""Manual four-width comparison of old/new overview cache. Loopback only."""
import hashlib
import json
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts/browser-cache'
out.mkdir(parents=True, exist_ok=True)
harness = (root / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
report = {'synthetic': True, 'widths': [375, 390, 768, 1440], 'captures': [],
          'pageerrors': [], 'console_errors': [], 'mismatches': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    for variant, port in [('baseline', 8791), ('candidate', 8792)]:
        origin = f'http://127.0.0.1:{port}'
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, timezone_id='Asia/Shanghai')
        context.add_init_script("""const NativeDate = Date;globalThis.Date = class extends NativeDate {
          constructor(...args){super(...(args.length?args:[1792656000000]));}static now(){return 1792656000000;}};""")
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
        page.on('console', lambda message: report['console_errors'].append(message.text)
                if message.type == 'error' else None)

        def ready():
            page.locator('#page-content[aria-busy=false]').wait_for()
            expect(page.locator('.error-panel')).to_have_count(0)

        def capture(name, width):
            assert page.locator('input[type=password]').count() == 0
            assert page.locator('#created-token').count() == 0
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            path = out / f'{variant}-{name}-{width}.png'
            page.screenshot(path=str(path), animations='disabled', full_page=True)
            report['captures'].append({'variant': variant, 'view': name, 'width': width,
                                       'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

        page.goto(origin, wait_until='networkidle')
        page.locator('#username').fill(username)
        page.locator('#password').fill(password)
        page.locator('#login-form button[type=submit]').click()
        ready()
        for width in report['widths']:
            page.set_viewport_size({'width': width, 'height': 900})
            for view, query in [('dashboard', 'page=dashboard'), ('articles', 'page=articles'),
                                ('data', 'page=reviews&tab=observations')]:
                page.goto(origin + '/?' + query)
                ready()
                capture(view, width)
            page.goto(origin + '/?page=articles')
            ready()
            page.locator('[data-action=article-detail]:visible').first.click()
            page.locator('#overlay [role=dialog]').wait_for()
            capture('detail', width)
            page.keyboard.press('Escape')
            expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
        context.close()
    browser.close()
for width in report['widths']:
    for view in ['dashboard', 'articles', 'data', 'detail']:
        hashes = [x['sha256'] for x in report['captures'] if x['width'] == width and x['view'] == view]
        if len(hashes) != 2 or hashes[0] != hashes[1]:
            report['mismatches'].append({'width': width, 'view': view})
(out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
assert not report['pageerrors']
assert not report['mismatches'], report['mismatches']
print('32 synthetic screenshots match byte-for-byte across four widths; startup 401 diagnostics retained.')
