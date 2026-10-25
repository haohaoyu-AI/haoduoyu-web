"""Focused integrated memo visuals and save feedback at 1440/375/390; local synthetic D1 only."""
import json, os, re, select, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(os.environ.get('GLASS_MEMO_ROOT',Path(__file__).resolve().parents[1]))
OUT=ROOT/'artifacts/glass-memos';OUT.mkdir(parents=True,exist_ok=True)
harness=(ROOT/'tests/harness.mjs').read_text()
username=re.search(r"export const USERNAME='([^']+)'",harness).group(1)
password=re.search(r"export const PASSWORD='([^']+)'",harness).group(1)
assert username.startswith('synthetic-')
report={'synthetic':True,'completed':False,'checks':[],'captures':[],'pageerrors':[],'external_requests':[]}
server=subprocess.Popen(['node','tests/memos-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    assert select.select([server.stdout],[],[],45)[0]
    origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
        def context(width,state=None):
            c=browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844},is_mobile=width<600,has_touch=width<600,storage_state=state,locale='zh-CN',timezone_id='Asia/Shanghai')
            def local(route):
                if route.request.url.startswith(origin+'/'):route.continue_()
                else:report['external_requests'].append(route.request.url);route.abort()
            c.route('**/*',local);page=c.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
            return c,page
        def action(page,name):return page.locator('[data-memo-action="'+name+'"]')
        def capture(page,name):
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),name
            page.screenshot(path=str(OUT/(name+'.png')),full_page=True,animations='disabled');report['captures'].append(name+'.png')
        def create(page,name,title):
            action(page,name).click();expect(page.locator('#memo-dialog')).to_be_visible();page.locator('#memo-dialog-title').fill(title);action(page,'confirm').click();expect(page.locator('#memo-dialog')).to_be_hidden()
        owner,desktop=context(1440)
        desktop.goto(origin+'/?page=memos');action(desktop,'login').click()
        desktop.locator('#username').fill(username);desktop.locator('#password').fill(password);desktop.locator('#login-form button[type=submit]').click()
        expect(action(desktop,'new-group')).to_be_visible()
        create(desktop,'new-group','长期参考资料')
        group=desktop.request.get(origin+'/api/v1/memos').json()['data']['groups'][0]
        desktop.locator('[data-memo-group="'+group['id']+'"]').click()
        create(desktop,'new-note','每周内容复盘')
        desktop.locator('#memo-body').fill('把重要的观察留下来。\n\n记录来源、判断和下一步行动，方便日后回看。')
        expect(desktop.locator('#memo-status')).to_contain_text('已保存')
        note=desktop.request.get(origin+'/api/v1/memos').json()['data']['notes'][0]
        capture(desktop,'memo-editor-1440')
        state=owner.storage_state()
        for width in [375,390]:
            c,page=context(width,state);page.goto(origin+'/?page=memos')
            expect(page.locator('[data-memo-group]')).to_have_count(1);capture(page,'memo-groups-'+str(width))
            page.locator('[data-memo-group="'+group['id']+'"]').click();expect(page.locator('[data-memo-note]')).to_have_count(1);capture(page,'memo-notes-'+str(width))
            page.locator('[data-memo-note="'+note['id']+'"]').click();expect(page.locator('#memo-body')).to_be_visible()
            text='把重要的观察留下来。\n\n'+str(width)+'px 手机保存反馈核验。'
            page.locator('#memo-body').fill(text);expect(page.locator('#memo-status')).to_contain_text('已保存')
            saved=page.request.get(origin+'/api/v1/memos/notes/'+note['id']).json()['data'];assert saved['body']==text
            capture(page,'memo-editor-'+str(width))
            action(page,'back-notes').click();expect(page.locator('[data-memo-note]')).to_have_count(1)
            action(page,'back-groups').click();expect(page.locator('[data-memo-group]')).to_have_count(1)
            report['checks'].append(str(width)+' two-level navigation, owner save feedback and persisted body');c.close()
        c,public=context(390);public.goto(origin+'/?page=memos')
        public.locator('[data-memo-group="'+group['id']+'"]').click();public.locator('[data-memo-note="'+note['id']+'"]').click()
        expect(public.locator('#memo-read-body')).to_contain_text('390px');expect(public.locator('#memo-body')).to_be_hidden();expect(action(public,'save')).to_be_hidden()
        capture(public,'memo-public-390');report['checks'].append('anonymous public read-only boundary')
        assert not report['pageerrors'] and not report['external_requests'];report['completed']=True
        c.close();owner.close();browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
