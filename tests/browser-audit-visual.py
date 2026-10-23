"""Bounded audit-only comparison using the unchanged, pinned 4c fixture server.

Run after building a clean dc598ac snapshot with existing dependencies. Each
fresh D1 receives exactly one real browser login. No production requests,
fixture deletion after login, baseline replacement, or pixel tolerances.
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
CLOCK = '2026-10-22T08:00:00.000Z'
WIDTHS = [375, 390, 768, 1440]
sha = lambda data: hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def compare(left, right):
    a, b = Image.open(left).convert('RGB'), Image.open(right).convert('RGB')
    assert a.size == b.size, 'Different screenshot dimensions'
    diff = ImageChops.difference(a, b)
    return {'size': list(a.size), 'changed_pixels': sum(any(p) for p in diff.getdata()),
        'max_channel_delta': max(max(p) for p in diff.getdata()), 'bbox': diff.getbbox(),
        'exact': diff.getbbox() is None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    snapshot, out = args.snapshot_root.resolve(), args.output.resolve()
    assert git(snapshot, 'rev-parse', 'HEAD').decode().strip() == SNAPSHOT
    assert not git(snapshot, 'diff', 'HEAD', '--', 'src', 'shared', 'public', 'tests', 'scripts')
    frontend = ['public/app.js', 'public/style.css', 'public/index.html']
    assert not git(ROOT, 'diff', SNAPSHOT, 'HEAD', '--', 'web', *frontend), 'Frontend changed since 4c'
    server = snapshot / 'tests/frontend-style-browser-server.mjs'
    assert server.read_bytes() == git(ROOT, 'show', SNAPSHOT + ':tests/frontend-style-browser-server.mjs')
    # Fail on occupied ports; never attach to an unknown or reused fixture.
    for port in [8835, 8836]:
        with socket.socket() as sock:
            # Match Node's listener reuse policy; closed connections in TIME_WAIT
            # are not a live fixture. An active listener still makes bind fail.
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('127.0.0.1', port))
    out.mkdir(parents=True, exist_ok=False)
    report = {'status': 'running', 'synthetic': True, 'clock': CLOCK, 'widths': WIDTHS,
        'started_at_utc': datetime.now(timezone.utc).isoformat(),
        'current_main': git(ROOT, 'rev-parse', 'HEAD').decode().strip(),
        'snapshot': SNAPSHOT, 'baseline': BASELINE, 'fresh_server': True,
        'frontend_unchanged_since_snapshot': True,
        'tool_sha256': sha(Path(__file__).read_bytes()), 'server_sha256': sha(server.read_bytes()),
        'worker_sha256': sha((snapshot / 'dist/server/index.js').read_bytes()),
        'frontend_sha256': {f: sha((ROOT / f).read_bytes()) for f in frontend},
        'variants': [], 'pairs': [], 'diagnostics': [], 'csp_events': [], 'stage': 'startup'}
    harness = (snapshot / 'tests/harness.mjs').read_text()
    username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
    password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
    assert username.startswith('synthetic-')
    with (out / 'server.log').open('w') as log:
        process = subprocess.Popen(['node', str(server)], cwd=snapshot, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 45
            while True:
                assert process.poll() is None, 'Fixture server exited; inspect local server.log'
                try:
                    for port in [8835, 8836]:
                        with urlopen(f'http://127.0.0.1:{port}/__synthetic-fixture', timeout=1) as r:
                            assert json.load(r)['clock'] == CLOCK
                    break
                except OSError:
                    assert time.monotonic() < deadline, 'Fixture server startup timeout'
                    time.sleep(.1)
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
                report['browser_version'] = browser.version
                for variant, port in [('baseline', 8835), ('candidate', 8836)]:
                    report['stage'] = variant + '-login'
                    origin = f'http://127.0.0.1:{port}'
                    context = browser.new_context(viewport={'width': 1440, 'height': 900},
                        timezone_id='Asia/Shanghai', reduced_motion='reduce', bypass_csp=False)
                    context.add_init_script("""const NativeDate=Date;globalThis.Date=class extends NativeDate {
                      constructor(...args){super(...(args.length?args:[1792656000000]));}
                      static now(){return 1792656000000;}};""")
                    context.expose_binding('recordCsp', lambda source, event:
                        report['csp_events'].append({'variant': variant, **event}))
                    context.add_init_script("""document.addEventListener('securitypolicyviolation', e=>
                      window.recordCsp({directive:e.effectiveDirective,blockedURI:e.blockedURI}));""")
                    context.route('**/*', lambda route: route.continue_()
                        if route.request.url.startswith(origin + '/') else route.abort())
                    page = context.new_page()
                    page.set_default_timeout(20000)
                    page.on('crash', lambda _: report['diagnostics'].append({'type': 'pagecrash'}))
                    page.on('pageerror', lambda e: report['diagnostics'].append({'type': 'pageerror', 'message': str(e)}))
                    # Anonymous /auth/me 401 is expected; unexpected failed HTTP requests are checked via receipts.
                    page.goto(origin + '/?page=settings&tab=log')
                    page.locator('#username').fill(username)
                    page.locator('#password').fill(password)
                    with page.expect_response(lambda r: r.url.endswith('/api/v1/auth/login')
                            and r.request.method == 'POST') as response:
                        page.locator('#login-form [type=submit]').click()
                    assert response.value.status == 200
                    page.locator('#page-content[aria-busy=false]').wait_for()
                    me = context.request.get(origin + '/api/v1/auth/me').json()['data']
                    assert me['id'] and me['csrfToken'] and context.cookies(origin)
                    rows = context.request.get(origin + '/api/v1/audit').json()['data']
                    assert len(rows) == 1 and rows[0]['action'] == 'auth.login'
                    assert rows[0]['actor'] == 'user:' + me['id'] and rows[0]['created_at'] == CLOCK
                    public_rows = [{k: r[k] for k in ['action', 'created_at', 'entity_id', 'entity_label', 'detail']}
                        | {'actor_is_current_user': r['actor'] == 'user:' + me['id']} for r in rows]
                    captures = []
                    variant_result = {'variant': variant, 'successful_logins': 1,
                        'audit_projection': public_rows, 'captures': captures}
                    report['variants'].append(variant_result)
                    for width in WIDTHS:
                        report['stage'] = f'{variant}-audit-{width}'
                        page.set_viewport_size({'width': width, 'height': 900})
                        with page.expect_response(lambda r: r.url.endswith('/api/v1/audit')) as audit_response:
                            page.goto(origin + '/?page=settings&tab=log')
                        assert audit_response.value.status == 200
                        page.locator('#page-content[aria-busy=false]').wait_for()
                        expect(page.locator('.error-panel')).to_have_count(0)
                        expect(page.locator('.audit-item')).to_have_count(1)
                        expect(page.locator('.audit-item strong')).to_have_text('登录网站 ×1')
                        assert page.locator('.audit-meta').inner_text().startswith('我 · ')
                        assert page.locator('input[type=password]').count() == 0
                        assert page.locator('#created-token').count() == 0
                        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                        page.evaluate('document.fonts.ready')
                        page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                        filename = f'{variant}-audit-{width}.png'
                        page.screenshot(path=str(out / filename), animations='disabled', full_page=True)
                        captures.append({'width': width, 'file': filename,
                            'bytes': (out / filename).stat().st_size, 'sha256': sha((out / filename).read_bytes())})
                        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
                    receipts = context.request.get(origin + '/__synthetic-metrics').json()
                    logins = [r for r in receipts if r['path'] == '/api/v1/auth/login' and r['method'] == 'POST']
                    assert len(logins) == 1 and logins[0]['status'] == 200
                    assert not [r for r in receipts if r['status'] >= 400
                        and not (r['path'] == '/api/v1/auth/me' and r['status'] == 401)]
                    loaded = context.request.get(origin + '/app.js').body()
                    expected = (git(ROOT, 'show', BASELINE + ':public/app.js') if variant == 'baseline'
                        else (ROOT / 'public/app.js').read_bytes())
                    assert loaded == expected
                    variant_result['app_sha256'] = sha(loaded)
                    context.close()
                browser.close()
            assert report['variants'][0]['audit_projection'] == report['variants'][1]['audit_projection']
            for width in WIDTHS:
                report['pairs'].append({'width': width, **compare(out / f'baseline-audit-{width}.png',
                    out / f'candidate-audit-{width}.png')})
            assert not report['diagnostics'] and not report['csp_events']
            assert all(r['exact'] for r in report['pairs']), 'Strict pixel comparison failed; keep original captures'
            report['status'] = 'complete'
        except Exception as error:
            report['status'] = 'failed'
            report['failure'] = {'type': type(error).__name__, 'message': str(error)}
            raise
        finally:
            report['receipts'] = {}
            for variant, port in [('baseline', 8835), ('candidate', 8836)]:
                try:
                    with urlopen(f'http://127.0.0.1:{port}/__synthetic-metrics', timeout=2) as response:
                        report['receipts'][variant] = json.load(response)
                except OSError:
                    report['receipts'][variant] = 'unavailable after failure'
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
            (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
