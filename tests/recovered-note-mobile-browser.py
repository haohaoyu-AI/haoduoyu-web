"""Synthetic loopback-only mobile interaction checks; never accesses production."""
from pathlib import Path
import json, subprocess
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
expect.set_options(timeout=30000)
server = subprocess.Popen(['node', 'tests/draft-recovery-server.mjs'], cwd=root,
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
try:
    origin = server.stdout.readline().strip()
    assert origin.startswith('http://127.0.0.1:'), server.stderr.read()[:2000]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', headless=True)
        for width in (320, 390):
            sample = 'SYNTHETIC safe retry ' + str(width)
            ctx = browser.new_context(viewport={'width':width, 'height':844}, is_mobile=True, has_touch=True)
            external, errors = [], []
            def route_request(route):
                if route.request.url.startswith(origin + '/'):
                    route.continue_()
                else:
                    external.append(route.request.url); route.abort()
            ctx.route('**/*', route_request)
            page = ctx.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(origin+'/?page=notes'); expect(page.locator('[data-notes-action=new]')).to_be_visible()
            page.locator('[data-notes-action=new]').click()
            editor = page.locator('#notes-active-entry textarea'); editor.fill(sample)
            read_records = '''async sample => {const db=await new Promise((ok,fail)=>{const r=indexedDB.open('haoduoyu-offline');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});const rows=await new Promise((ok,fail)=>{const r=db.transaction('meta').objectStore('meta').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});db.close();return rows.filter(x=>x.draft_kind==='note_entry'&&x.data?.draft===sample).map(x=>({key:x.key,id:x.data.id,date:x.data.date}));}'''
            rows=[]
            for _ in range(100):
                rows=page.evaluate(read_records,sample)
                if rows: break
                page.wait_for_timeout(100)
            assert len(rows)==1, rows
            page.reload(); expect(page.get_by_text(sample)).to_be_visible()
            card=page.locator('[data-note-entry]').filter(has_text=sample)
            card.locator('[data-note-entry-action=edit]').click()
            active=page.locator('#notes-active-entry')
            expect(active.locator('textarea')).to_have_value(sample)
            # Check the actual controls fit in the mobile viewport and are actionable.
            save=active.locator('[data-note-entry-action=save]'); expect(save).to_be_enabled()
            box=save.bounding_box(); assert box and box['x'] >= 0 and box['x']+box['width'] <= width+1, box
            save.click()
            expect(active.locator('.note-entry-send-feedback')).to_have_text('发送成功')
            live=page.evaluate('''async ({id,date,sample}) => {let r=await fetch('/api/v1/note-entries?category=life&date='+date,{headers:{'X-Note-Labels-Version':'3'},cache:'no-store'});let j=await r.json();return j.data.entries.filter(x=>x.id===id && x.text===sample).length}''',{**rows[0], 'sample':sample})
            assert live==1, live
            retained=page.evaluate(read_records,sample); assert any(x['key']==rows[0]['key'] for x in retained), retained
            calls=page.request.get(origin+'/__offline-test/calls').json()
            puts=[x for x in calls if x['path'].endswith('/'+rows[0]['id']) and x['method']=='PUT']
            assert len(puts)==1, puts
            assert not external and not errors, {'external':external,'errors':errors}
            print(f'Synthetic mobile {width}px: explicit save, live readback, one write and retained original passed',flush=True)
            ctx.close()
        browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=10)
    except subprocess.TimeoutExpired: server.kill(); server.wait()
