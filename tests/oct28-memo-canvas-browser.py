"""Synthetic loopback regression for the memo canvas and splitter."""
import re, select, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
harness = (ROOT / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
server = subprocess.Popen(['node', 'tests/unify-offline-integration-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    assert select.select([server.stdout], [], [], 45)[0], 'test server did not start'
    origin = server.stdout.readline().strip()
    assert origin.startswith('http://127.0.0.1:')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        context = browser.new_context(viewport={'width':1440,'height':900}, locale='zh-CN')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        login = context.request.post(origin + '/api/v1/auth/login', headers={'Origin':origin},
                                     data={'username':username,'password':password})
        assert login.status == 200
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin + '/?page=memos')
        new = page.locator('[data-memo-action="new-note"]')
        expect(new).to_be_visible()
        split = page.locator('#memo-resizer')
        area = page.locator('.memo-layout').evaluate('e => e.clientWidth - 10')
        default_width = int(split.get_attribute('aria-valuenow'))
        assert abs(default_width - max(160, min(480, round(area * .24)))) <= 1
        new.click()
        expect(page.locator('#memo-body')).to_be_visible()
        expect(page.locator('#memo-edited-at')).to_be_visible()
        canvas = page.evaluate('''() => {
          const title=document.querySelector('#memo-title'), time=document.querySelector('#memo-edited-at'),
            body=document.querySelector('#memo-body'), editor=document.querySelector('.memo-editor');
          return {titleBottom:title.getBoundingClientRect().bottom, timeTop:time.getBoundingClientRect().top,
            timeBottom:time.getBoundingClientRect().bottom, bodyTop:body.getBoundingClientRect().top,
            border:getComputedStyle(title).borderBottomWidth, color:getComputedStyle(editor).backgroundColor,
            bodyHeight:body.getBoundingClientRect().height};
        }''')
        assert canvas['titleBottom'] <= canvas['timeTop'] and canvas['timeBottom'] <= canvas['bodyTop'], canvas
        assert canvas['border'] == '1px' and canvas['color'] == 'rgb(255, 253, 251)' and canvas['bodyHeight'] >= 576, canvas
        expect(page.locator('#memo-status')).to_be_hidden()
        split.focus(); page.keyboard.press('ArrowRight')
        chosen = int(split.get_attribute('aria-valuenow'))
        assert chosen > default_width
        page.reload()
        expect(split).to_have_attribute('aria-valuenow', str(chosen))
        page.set_viewport_size({'width':390,'height':844})
        expect(split).to_be_hidden()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        if not page.locator('#memo-body').is_visible():
            page.locator('.memo-list-item').first.click()
        expect(page.locator('#memo-body')).to_be_visible()
        page.locator('[data-memo-action="fullscreen"]').click()
        expect(page.locator('#memo-fullscreen')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#memo-fullscreen')).to_be_hidden()
        assert not errors, errors
        context.close()
        previous = browser.new_context(viewport={'width':1440,'height':900}, locale='zh-CN')
        previous.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        previous.add_init_script("localStorage.setItem('haoduoyu.memos.split-ratio.v1', '0.4')")
        assert previous.request.post(origin + '/api/v1/auth/login', headers={'Origin':origin},
                                     data={'username':username,'password':password}).status == 200
        old_page = previous.new_page(); old_page.goto(origin + '/?page=memos')
        old_split = old_page.locator('#memo-resizer'); expect(old_split).to_be_visible()
        old_area = old_page.locator('.memo-layout').evaluate('e => e.clientWidth - 10')
        assert abs(int(old_split.get_attribute('aria-valuenow')) - max(160, min(480, round(old_area * .4)))) <= 1
        previous.close(); browser.close()
        print('PASS default and existing split, saved split/keyboard, title/time/canvas, 390px and fullscreen')
finally:
    server.terminate()
    try: server.wait(timeout=10)
    except subprocess.TimeoutExpired: server.kill(); server.wait()
