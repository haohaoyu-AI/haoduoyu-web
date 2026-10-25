"""Only synthetic loopback Worker/D1; anonymous editing smoke acceptance."""
import json, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/glass-public-notes-integration'
OUT.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','tests/memos-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
origin=server.stdout.readline().strip()
assert origin.startswith('http://127.0.0.1:'),origin
report={'synthetic':True,'checks':[],'pageerrors':[],'outbound':[]}
def button(page,name):return page.locator('[data-memo-action="'+name+'"]')
def confirm(page,title):
    expect(page.locator('#memo-dialog')).to_be_visible()
    if title is not None:page.locator('#memo-dialog-title').fill(title)
    button(page,'confirm').click()
    expect(page.locator('#memo-dialog')).to_be_hidden()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        for width in [1440,375]:
            context=browser.new_context(viewport={'width':width,'height':900})
            def route(r):
                if r.request.url.startswith(origin+'/'):r.continue_()
                else:report['outbound'].append(r.request.url);r.abort()
            context.route('**/*',route)
            page=context.new_page()
            page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
            page.goto(origin+'/')
            expect(page.locator('#todo-text')).to_be_visible()
            assert page.request.get(origin+'/glass.css').status==200
            assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--glass-panel').trim()")=='rgba(255,255,255,.57)'
            page.goto(origin+'/?page=articles')
            expect(page.locator('#article-filters')).to_be_visible()
            assert page.request.get(origin+'/api/v1/snapshot/index').status==200
            page.goto(origin+'/?page=memos')
            expect(button(page,'new-group')).to_be_visible()
            expect(button(page,'login')).to_be_hidden()
            button(page,'new-group').click();confirm(page,'synthetic public '+str(width))
            button(page,'new-note').click();confirm(page,'anonymous note '+str(width))
            expect(page.locator('#memo-body')).to_be_enabled()
            page.locator('#memo-body').fill('Anonymous synthetic text '+str(width))
            expect(page.locator('#memo-status')).to_have_text('已保存')
            button(page,'delete-note').click();confirm(page,None)
            button(page,'trash').click()
            if width==375:button(page,'back-notes').click()
            page.locator('[data-memo-note]').filter(has_text='anonymous note '+str(width)).click()
            button(page,'restore-note').click()
            expect(page.locator('#memo-read-body')).to_have_count(1)
            page.goto(origin+'/?page=notes')
            expect(page.locator('#notes-editor')).to_be_visible()
            page.locator('#notes-editor').fill('Anonymous daily text '+str(width))
            expect(page.locator('#notes-status')).to_have_text('已保存')
            page.locator('[data-notes-action="delete"]').click()
            page.locator('[data-notes-action="confirm-delete"]').click()
            expect(page.locator('[data-notes-action="restore"]')).to_be_visible()
            page.locator('[data-notes-action="restore"]').click()
            expect(page.locator('#notes-editor')).to_have_value('Anonymous daily text '+str(width))
            expect(page.locator('#notes-status')).to_have_text('已保存')
            assert page.request.get(origin+'/api/v1/backup').status==401
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(OUT/('anonymous-'+str(width)+'.png')),full_page=True)
            report['checks'].append({'width':width,'anonymous_memo_create_save_delete_restore':True,
                'anonymous_notes_save_delete_restore':True,'backup_401':True,'no_horizontal_overflow':True,'default_todo_articles_snapshot_glass_smoke':True})
            context.close()
        browser.close()
    assert not report['pageerrors'],report['pageerrors']
    assert not report['outbound'],report['outbound']
    report['completed']=True
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill()
print(json.dumps(report,ensure_ascii=False))
