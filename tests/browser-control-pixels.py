"""One bounded 375px key-form old/new/old paint diagnostic; no product edits.

Uses the original fixed 4c server and its exact backend-freeze guard. Captures
two frames per context, never retries or treats complete as pixel equality.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import socket
import subprocess
import time
from urllib.request import urlopen

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = 'dc598ac1c1b53303500e2313965c3f980d94d0ad'
BASELINE = 'a1babd8558d7869ab61fe6bc463615a04eec6eb9'
sha = lambda data: hashlib.sha256(data).hexdigest()
git = lambda *args: subprocess.check_output(['git', *args], cwd=ROOT)


def pixels(a, b):
    a, b = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    assert a.size == b.size
    delta = ImageChops.difference(a, b)
    return {'size': list(a.size), 'changed_pixels': sum(any(x) for x in delta.getdata()),
        'max_channel_delta': max(max(x) for x in delta.getdata()), 'bbox': delta.getbbox(),
        'exact': delta.getbbox() is None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--history-only', action='store_true', help='One old context with the original 375px modal prefix')
    args = parser.parse_args()
    snapshot, out = args.snapshot_root.resolve(), args.output.resolve()
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=snapshot).decode().strip() == SNAPSHOT
    assert not git('diff', SNAPSHOT, 'HEAD', '--', 'web', 'public/app.js', 'public/style.css', 'public/index.html')
    server = snapshot / 'tests/frontend-style-browser-server.mjs'
    assert server.read_bytes() == git('show', SNAPSHOT + ':tests/frontend-style-browser-server.mjs')
    assert not subprocess.check_output(['git', 'diff', 'HEAD', '--', 'src', 'shared', 'tests', 'scripts', 'public'], cwd=snapshot)
    for port in [8835, 8836]:
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', port))
    out.mkdir(parents=True, exist_ok=False)
    harness = (snapshot / 'tests/harness.mjs').read_text()
    username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
    password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
    assert username.startswith('synthetic-')
    report = {'status': 'running', 'synthetic': True, 'snapshot': SNAPSHOT, 'baseline': BASELINE,
        'frontend_main': git('rev-parse', 'HEAD').decode().strip(), 'started_at_utc': datetime.now(timezone.utc).isoformat(),
        'scope': 'old-only original navigation/modal prefix' if args.history_only else
            'one form-key/375 state; two screenshots each; old/new/old independent contexts',
        'tool_sha256': sha(Path(__file__).read_bytes()), 'server_sha256': sha(server.read_bytes()),
        'worker_sha256': sha((snapshot / 'dist/server/index.js').read_bytes()),
        'contexts': [], 'comparisons': [], 'pageerrors': [], 'csp_events': []}
    with (out / 'server.log').open('w') as log:
        process = subprocess.Popen(['node', str(server)], cwd=snapshot, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 45
            while True:
                assert process.poll() is None
                try:
                    for port in [8835, 8836]:
                        with urlopen(f'http://127.0.0.1:{port}/__synthetic-fixture', timeout=1) as response:
                            assert json.load(response)['baseline'] == BASELINE
                    break
                except OSError:
                    assert time.monotonic() < deadline
                    time.sleep(.1)
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
                report['browser_version'] = browser.version
                baseline_storage = None
                cases = [('old-history', 8835)] if args.history_only else [('old-a', 8835), ('new', 8836), ('old-b', 8835)]
                for name, port in cases:
                    report['stage'] = name
                    origin = f'http://127.0.0.1:{port}'
                    context = browser.new_context(viewport={'width': 1440 if args.history_only else 375, 'height': 900}, timezone_id='Asia/Shanghai',
                        reduced_motion='reduce', bypass_csp=False, storage_state=baseline_storage if name == 'old-b' else None)
                    context.route('**/*', lambda route: route.continue_()
                        if route.request.url.startswith(origin + '/') else route.abort())
                    context.add_init_script("""const D=Date;globalThis.Date=class extends D {
                      constructor(...a){super(...(a.length?a:[1792656000000]));}static now(){return 1792656000000;}};
                      window.cspEvents=[];document.addEventListener('securitypolicyviolation',e=>
                        window.cspEvents.push({directive:e.effectiveDirective,blockedURI:e.blockedURI}));""")
                    page = context.new_page()
                    page.set_default_timeout(20000)
                    page.on('pageerror', lambda e: report['pageerrors'].append(str(e)))
                    page.goto(origin + ('/?page=articles' if args.history_only else '/?page=settings&tab=keys'))
                    if name != 'old-b':
                        page.locator('#username').fill(username)
                        page.locator('#password').fill(password)
                        with page.expect_response(lambda r: r.url.endswith('/api/v1/auth/login')) as response:
                            page.locator('#login-form [type=submit]').click()
                        assert response.value.status == 200
                    page.locator('#page-content[aria-busy=false]').wait_for()
                    me = context.request.get(origin + '/api/v1/auth/me').json()['data']
                    assert me['id'] and me['csrfToken'] and context.cookies(origin)
                    if args.history_only:
                        page.set_viewport_size({'width': 375, 'height': 900})
                        def go(query):
                            page.goto(origin + '/?' + query)
                            page.locator('#page-content[aria-busy=false]').wait_for()
                        def cycle_close():
                            controls = page.locator('.modal button:not(:disabled),.modal input:not(:disabled),'
                                '.modal select:not(:disabled),.modal textarea:not(:disabled)').filter(visible=True)
                            controls.first.focus()
                            page.keyboard.press('Shift+Tab')
                            assert controls.last.evaluate('e=>e===document.activeElement')
                            page.keyboard.press('Tab')
                            assert controls.first.evaluate('e=>e===document.activeElement')
                            page.keyboard.press('Escape')
                            expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
                        for query in ['page=dashboard&period=7d', 'page=articles', 'page=reviews&tab=observations',
                                      'page=settings&tab=accounts', 'page=settings&tab=keys',
                                      'page=settings&tab=security', 'page=settings&tab=log']:
                            go(query)
                            if query.startswith('page=dashboard'):
                                page.locator('.trend-disclosure>summary').click()
                        go('page=articles')
                        page.locator('[data-action=article-detail]:visible').first.click()
                        page.locator('.drawer').wait_for()
                        cycle_close()
                        for query, action, form in [('page=articles', 'new-article', 'article-form'),
                            ('page=reviews&tab=daily', 'new-review', 'daily-form'),
                            ('page=settings&tab=accounts', 'new-account', 'account-form')]:
                            go(query)
                            page.locator(f'[data-action={action}]').click()
                            page.locator('.modal form').wait_for()
                            cycle_close()
                        go('page=settings&tab=keys')
                    # keyModal uses already loaded account data; it sends no GET.
                    page.locator('[data-action=new-key]').click()
                    page.locator('#key-form').wait_for()
                    controls = page.locator('.modal button:not(:disabled),.modal input:not(:disabled),'
                        '.modal select:not(:disabled),.modal textarea:not(:disabled)').filter(visible=True)
                    controls.first.focus()
                    page.keyboard.press('Shift+Tab')
                    assert controls.last.evaluate('e=>e===document.activeElement')
                    page.keyboard.press('Tab')
                    assert controls.first.evaluate('e=>e===document.activeElement')
                    field = page.locator('#field-name')
                    assert field.input_value() == '' and page.locator('input[type=password]').count() == 0
                    sample = field.evaluate("""e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {
                      html:e.outerHTML,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
                      styles:Object.fromEntries([...s].map(k=>[k,s.getPropertyValue(k)])),
                      active:document.activeElement.getAttribute('data-action'),
                      modalRect:document.querySelector('.modal').getBoundingClientRect().toJSON()};}""")
                    captures = []
                    for frame in [1, 2]:
                        page.evaluate('document.fonts.ready')
                        page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                        file = f'{name}-{frame}.png'
                        page.screenshot(path=str(out / file), full_page=True, animations='disabled')
                        captures.append({'file': file, 'sha256': sha((out / file).read_bytes())})
                    report['csp_events'].extend(page.evaluate('window.cspEvents'))
                    if name == 'old-a':
                        baseline_storage = context.storage_state()  # memory only; never serialized to report/disk
                    report['contexts'].append({'name': name, 'input': sample, 'captures': captures,
                        'app_sha256': sha(context.request.get(origin + '/app.js').body())})
                    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                    context.close()
                    print(name + ': captured two frames', flush=True)
                browser.close()
            pairs = [('old-history-1.png', 'old-history-2.png')] if args.history_only else [
                ('old-a-1.png', 'new-1.png'), ('old-a-1.png', 'old-b-1.png'),
                ('old-a-1.png', 'old-a-2.png'), ('new-1.png', 'new-2.png'), ('old-b-1.png', 'old-b-2.png')]
            for a, b in pairs:
                report['comparisons'].append({'a': a, 'b': b, **pixels(out / a, out / b)})
            report['computed_inputs_equal'] = all(c['input'] == report['contexts'][0]['input'] for c in report['contexts'])
            assert not report['pageerrors'] and not report['csp_events']
            report['status'] = 'complete'
        except Exception as e:
            report['status'] = 'failed'
            report['failure'] = {'type': type(e).__name__, 'message': str(e)}
            raise
        finally:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
