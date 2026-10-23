"""Bounded real-bundle comparison of reselecting the current mobile todos page.

Start daily-todos-browser-server.mjs first. No product changes or artificial
network delay: both bundles use the same current CSS/Worker and synthetic D1.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/daily-todos/navigation-before-after'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:' + os.environ.get('DAILY_TODOS_PORT', '8797')
BASELINE = 'e53fce334932ef5063e0c26d49ea450cba16a0fd'
CURRENT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
OLD = subprocess.check_output(['git', 'show', BASELINE + ':public/app.js'], cwd=ROOT)
NEW = (ROOT / 'public/app.js').read_bytes()
HARNESS = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", HARNESS).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", HARNESS).group(1)
assert USERNAME.startswith('synthetic-')
DRAFT = '同页导航前后的未提交计划'
REPORT = {'synthetic': True, 'completed': False, 'width': 390,
          'operation': 'Fully loaded todos page; type draft; open sidebar; tap current todos item once.',
          'boundary': 'One local Chromium sample per real bundle; identical current CSS/Worker. Timing is observational, not a performance guarantee.',
          'test_source_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'variants': [], 'pageerrors': [], 'blocked_external_requests': []}


def save():
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    REPORT['browser'] = browser.version
    for label, commit, bundle in [('before', BASELINE, OLD), ('after', CURRENT, NEW)]:
        context = browser.new_context(viewport={'width': 390, 'height': 844},
                                      is_mobile=True, has_touch=True, locale='zh-CN', timezone_id='Asia/Shanghai')
        context.add_init_script("""const NativeDate=Date;globalThis.Date=class extends NativeDate {
          constructor(...args){super(...(args.length?args:[NativeDate.parse('2026-10-23T15:59:58.000Z')]));}
          static now(){return NativeDate.parse('2026-10-23T15:59:58.000Z');}};""")

        def route_request(route):
            if not route.request.url.startswith(ORIGIN + '/'):
                REPORT['blocked_external_requests'].append(route.request.url)
                route.abort()
            elif route.request.url == ORIGIN + '/app.js':
                route.fulfill(status=200, content_type='text/javascript', body=bundle,
                              headers={'Cache-Control': 'no-store'})
            else:
                route.continue_()

        context.route('**/*', route_request)
        page = context.new_page()
        page.on('pageerror', lambda error: REPORT['pageerrors'].append(str(error)))
        requests = []
        page.on('request', lambda request: requests.append({'method': request.method,
            'path': request.url.removeprefix(ORIGIN)}) if request.url.startswith(ORIGIN + '/api/v1/') else None)
        metadata = page.request.get(ORIGIN + '/__synthetic-fixture').json()
        REPORT['fixture_product_manifest_sha256'] = metadata['product_manifest_sha256']
        REPORT['worker_sha256'] = metadata['product_hashes']['dist/server/index.js']
        REPORT['css_sha256'] = metadata['product_hashes']['public/style.css']
        loaded_bundles = []
        page.on('response', lambda response: loaded_bundles.append(response)
                if response.url == ORIGIN + '/app.js' else None)
        page.goto(ORIGIN + '/?page=todos', wait_until='networkidle')
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill(PASSWORD)
        page.locator('#login-form button[type=submit]').tap()
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('#todo-text')).to_be_visible()
        expect(page.locator('.daily-todo-status')).not_to_have_text('正在读取计划…')
        assert len(loaded_bundles) == 1
        assert hashlib.sha256(loaded_bundles[0].body()).digest() == hashlib.sha256(bundle).digest()
        page.locator('#todo-text').fill(DRAFT)
        page.get_by_role('button', name='打开导航', exact=True).tap()
        expect(page.locator('.shell')).to_have_class(re.compile(r'\bmenu-open\b'))
        history_before = page.evaluate('history.length')
        request_offset = len(requests)
        page.evaluate("""() => {
          const input = document.querySelector('#todo-text');
          const probe = window.__syntheticNavigationProbe = {
            input, start: null, running: true, changes: [], frames: []
          };
          const state = () => ({
            busy: document.querySelector('#page-content')?.getAttribute('aria-busy') === 'true',
            loading: document.querySelector('.daily-todo-status')?.textContent === '正在读取计划…',
            inputSame: input === document.querySelector('#todo-text')
          });
          let last = '';
          probe.observer = new MutationObserver(() => {
            if (probe.start === null) return;
            const value = state(), key = JSON.stringify(value);
            if (key !== last) { probe.changes.push({ms:performance.now()-probe.start,...value}); last=key; }
          });
          probe.observer.observe(document.querySelector('#app'), {subtree:true,childList:true,attributes:true,characterData:true});
          document.querySelector('#site-nav [data-nav=todos]').addEventListener('click', () => {
            probe.start=performance.now();
          }, {capture:true,once:true});
          const frame = () => {
            if (!probe.running) return;
            if (probe.start !== null) probe.frames.push({ms:performance.now()-probe.start,...state()});
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }""")
        tap_start = time.perf_counter()
        page.locator('#site-nav [data-nav=todos]').tap()
        tap_ms = (time.perf_counter() - tap_start) * 1000
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.daily-todo-status')).not_to_have_text('正在读取计划…')
        expect(page.locator('#todo-text')).to_have_value(DRAFT)
        page.wait_for_timeout(250)
        observed = page.evaluate("""() => {
          const probe=window.__syntheticNavigationProbe;
          probe.running=false; probe.observer.disconnect();
          return {changes:probe.changes,frames:probe.frames,
            input_dom_preserved:probe.input === document.querySelector('#todo-text'),
            draft:document.querySelector('#todo-text').value};
        }""")
        added_gets = [request for request in requests[request_offset:] if request['method'] == 'GET']
        loading_frames = [frame for frame in observed['frames'] if frame['loading'] or frame['busy']]
        visible_until = None
        if loading_frames:
            first_busy = loading_frames[0]['ms']
            first_clear = next((frame['ms'] for frame in observed['frames']
                                if frame['ms'] > loading_frames[-1]['ms'] and not frame['busy'] and not frame['loading']), None)
            visible_until = round(first_clear - first_busy, 2) if first_clear is not None else None
        result = {'variant': label, 'source_commit': commit, 'app_js_sha256': hashlib.sha256(bundle).hexdigest(),
                  'new_get_count': len(added_gets), 'new_gets': added_gets,
                  'history_delta': page.evaluate('history.length') - history_before,
                  'input_dom_preserved': observed['input_dom_preserved'], 'draft_preserved': observed['draft'] == DRAFT,
                  'playwright_tap_roundtrip_ms': round(tap_ms, 2),
                  'prepaint_busy_or_loading_observed': bool(loading_frames),
                  'sampled_loading_span_ms': visible_until,
                  'dom_changes': observed['changes'],
                  'sampled_animation_frames': observed['frames']}
        REPORT['variants'].append(result)
        save()
        print(json.dumps({key: value for key, value in result.items()
                          if key not in ('sampled_animation_frames', 'dom_changes')}, ensure_ascii=False))
        context.close()
    browser.close()

assert not REPORT['pageerrors'], REPORT['pageerrors']
assert not REPORT['blocked_external_requests'], REPORT['blocked_external_requests']
assert hashlib.sha256((ROOT / 'public/app.js').read_bytes()).digest() == hashlib.sha256(NEW).digest()
REPORT['completed'] = True
save()
