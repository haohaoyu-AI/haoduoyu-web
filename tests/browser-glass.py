"""Glass visual acceptance: synthetic real Worker; desktop/mobile snapshots and navigation checks."""
import hashlib
import json
import os
from pathlib import Path
import select
import subprocess
import traceback
import uuid
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/ui-glass'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'baseline_commit': '701db4febbdb17b098d8734b22d94f1a813d7616', 'phase': 'working-tree-glass-refresh', 'synthetic': True,
          'real_worker': True, 'temporary_d1': True, 'shared_browser_used': False,
          'completed': False, 'captures': [], 'checks': {}, 'pageerrors': [],
          'blocked_external_requests': [], 'responses': [], 'layout': [],
          'assets': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                     for p in ['public/app.js', 'public/style.css', 'public/glass.css', 'dist/server/index.js']}}
expect.set_options(timeout=10000)
server = subprocess.Popen(['node', 'tests/article-pipeline-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    if not select.select([server.stdout], [], [], 45)[0]:
        raise RuntimeError('Local fixture startup exceeded 45 seconds')
    ORIGIN = server.stdout.readline().strip()
    assert ORIGIN.startswith('http://127.0.0.1:'), ORIGIN
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        REPORT['browser'] = browser.version
        seed = browser.new_context()
        fixture = seed.request.get(ORIGIN + '/__fixture').json()
        assert fixture['synthetic']
        identity = seed.request.get(ORIGIN + '/api/v1/auth/me').json()['data']
        assert identity['publicBusiness'] is True
        headers = {'Origin': ORIGIN, 'X-Public-Business': '1'}
        for i, text in enumerate(['核对今天的文章选题与资料来源', '完成两篇稿件的内容复核', '整理图片和草稿记录',
                                  '复盘昨日阅读数据，记录下一步调整']):
            result = seed.request.post(ORIGIN + '/api/v1/todos', headers=headers,
                data={'id': str(uuid.uuid4()), 'date': '2026-10-25', 'text': text})
            assert result.status == 201, result.text()
            item = result.json()['data']
            if i == 2:
                result = seed.request.patch(ORIGIN + '/api/v1/todos/' + item['id'], headers=headers,
                    data={'version': item['version'], 'completed': True})
                assert result.status == 200, result.text()
        seed.close()

        def ready(page):
            expect(page.locator('#page-content')).to_have_attribute('aria-busy', 'false')
            expect(page.locator('.error-panel')).to_have_count(0)

        def capture(page, name):
            page.evaluate('document.fonts.ready')
            page.screenshot(path=str(OUT / (name + '.png')), animations='disabled', full_page=True)
            REPORT['captures'].append(name + '.png')
            REPORT['layout'].append({'name': name, **page.evaluate('''() => ({
                innerWidth, scrollWidth: document.documentElement.scrollWidth,
                h1: [...document.querySelectorAll('h1')].map(e => e.textContent),
                unnamedButtons: [...document.querySelectorAll('button')].filter(e => e.checkVisibility() &&
                  !(e.textContent.trim() || e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.title)).length,
                smallTargets: [...document.querySelectorAll('button, a, input, select, summary')]
                  .filter(e => e.checkVisibility()).map(e => ({tag:e.tagName, text:(e.textContent.trim() || e.getAttribute('aria-label') || e.id).slice(0,40),
                    width:e.getBoundingClientRect().width, height:e.getBoundingClientRect().height}))
                  .filter(e => e.width < 24 || e.height < 24)
            })''')})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), name + ': overflow'

        for width in [1440, 375, 390]:
            context = browser.new_context(viewport={'width':width,'height':1000 if width == 1440 else 844},
                is_mobile=width < 600, has_touch=width < 600, locale='zh-CN', timezone_id='Asia/Shanghai')
            def local_only(route):
                if route.request.url.startswith(ORIGIN + '/'):
                    route.continue_()
                else:
                    REPORT['blocked_external_requests'].append(route.request.url)
                    route.abort()
            context.route('**/*', local_only)
            context.add_init_script("""{ const NativeDate=Date; globalThis.Date=class extends NativeDate {
                constructor(...args){super(...(args.length?args:['2026-10-25T08:00:00.000Z']));}
                static now(){return NativeDate.parse('2026-10-25T08:00:00.000Z');}}; }""")
            page = context.new_page()
            page.on('pageerror', lambda error: REPORT['pageerrors'].append(str(error)))
            page.on('response', lambda response: REPORT['responses'].append({
                'width': width, 'method': response.request.method, 'path': urlsplit(response.url).path,
                'status': response.status}) if '/api/v1/' in response.url else None)

            for name, query, selector in [
                ('overview', 'page=dashboard', 'section.article-ledger-overview'),
                ('articles', 'page=articles', '#article-filters'),
                ('todos', 'page=todos&date=2026-10-25', '#todo-text'),
                ('notes', 'page=notes&date=2026-10-24', '.notes-sheet')]:
                page.goto(ORIGIN + '/?' + query) if name == 'overview' else page.locator(('.mobile-nav-item' if width < 600 else '.nav-item') + '[data-nav="' + {'articles':'articles','todos':'todos','notes':'notes'}[name] + '"]').click(force=True)
                ready(page)
                expect(page.locator(selector)).to_be_visible()
                if name == 'todos':
                    expect(page.locator('.daily-todo-row')).to_have_count(4)
                if name == 'notes':
                    page.locator('[data-notes-action=previous]').click()
                    expect(page.locator('#notes-status')).to_have_text('公开只读')
                    expect(page.locator('#notes-editor')).to_be_hidden()
                if name == 'articles':
                    expect(page.locator('#article-filters [name=status]')).to_have_value('draft_saved')
                    expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(3)
                capture(page, name + '-' + str(width))
                REPORT['checks'][name + '-' + str(width)] = True

            page.locator(('.mobile-nav-item' if width < 600 else '.nav-item') + '[data-nav=articles]').click()
            ready(page)
            ready(page)
            trigger = page.locator('[data-action=article-detail][data-id="' + fixture['ids']['tt1'] + '"]')
            trigger.click()
            expect(page.locator('#overlay [role=dialog]')).to_be_visible()
            capture(page, 'article-detail-' + str(width))
            page.keyboard.press('Escape')
            expect(page.locator('#overlay [role=dialog]')).to_have_count(0)
            REPORT['checks']['modal_escape_focus_' + str(width)] = trigger.evaluate('(e) => document.activeElement === e')
            page.locator('[data-action=article-filter]').click()
            expect(page.locator('#filter-panel')).to_be_visible()
            capture(page, 'article-filter-' + str(width))
            page.keyboard.press('Escape')
            expect(page.locator('#filter-panel')).to_have_count(0)
            REPORT['checks']['filter_open_escape_' + str(width)] = True
            context.close()
        for width in [1024, 760]:
            context=browser.new_context(viewport={'width':width,'height':900},reduced_motion='reduce')
            page=context.new_page()
            page.goto(ORIGIN+'/?page=dashboard')
            ready(page)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert page.locator('.shell').evaluate('(e)=>getComputedStyle(e).backdropFilter') == 'none'
            if width == 1024:
                sidebar=page.locator('.sidebar').bounding_box();content=page.locator('.workspace').bounding_box()
                assert sidebar['x']+sidebar['width'] <= content['x']+1
            else:
                assert page.locator('.sidebar').evaluate('(e)=>e.inert')
                page.locator('.mobile-bar [data-action=menu]').click()
                expect(page.locator('.shell')).to_have_class('shell menu-open')
                assert not page.locator('.sidebar').evaluate('(e)=>e.inert')
                page.keyboard.press('Escape')
                expect(page.locator('.shell')).to_have_class('shell')
            REPORT['checks']['responsive_reduced_motion_'+str(width)] = True
            page.screenshot(path=str(OUT/('responsive-'+str(width)+'.png')),animations='disabled')
            context.close()
        browser.close()
    REPORT['completed'] = True
except Exception as error:
    REPORT['error'] = str(error)
    traceback.print_exc()
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
    REPORT['server_exit'] = server.returncode
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
print(json.dumps({'completed':REPORT['completed'], 'captures':len(REPORT['captures']),
                  'pageerrors':REPORT['pageerrors'], 'output':str(OUT)}, ensure_ascii=False))
if not REPORT['completed']:
    raise SystemExit(1)
