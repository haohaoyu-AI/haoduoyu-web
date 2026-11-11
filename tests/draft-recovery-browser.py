from pathlib import Path
import subprocess
import os
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
expect.set_options(timeout=30000)
env=os.environ.copy()
server=subprocess.Popen(['node','tests/draft-recovery-server.mjs'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8',errors='replace')
try:
    origin=server.stdout.readline().strip()
    if not origin.startswith('http://127.0.0.1:'): raise RuntimeError('Synthetic fixture did not start: '+origin+' '+server.stderr.read()[:1200])
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',headless=True)
        context=browser.new_context(viewport={'width':390,'height':844})
        context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
        page=context.new_page();page.goto(origin+'/?page=notes');expect(page.locator('[data-notes-action=new]')).to_be_visible()
        page.locator('[data-notes-action=new]').click()
        editor=page.locator('#notes-active-entry textarea');editor.fill('SYNTHETIC recovery text')
        def records(p):
            return p.evaluate('''async () => {let db=await new Promise((ok,fail)=>{let r=indexedDB.open('haoduoyu-offline');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});let rows=await new Promise((ok,fail)=>{let r=db.transaction('meta').objectStore('meta').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});db.close();return rows.filter(x=>x.draft_kind==='note_entry' && x.data?.draft==='SYNTHETIC recovery text').map(x=>({key:x.key,write_id:x.write_id}));}''')
        for _ in range(100):
            initial=records(page)
            if initial:break
            page.wait_for_timeout(100)
        assert len(initial)==1,initial
        for _ in range(3):
            page.reload();expect(page.get_by_text('SYNTHETIC recovery text')).to_be_visible();page.wait_for_timeout(800)
            assert records(page)==initial, {'initial':initial,'after':records(page)}
        second=context.new_page();second.goto(origin+'/?page=notes');expect(second.get_by_text('SYNTHETIC recovery text')).to_be_visible();second.wait_for_timeout(800)
        assert records(second)==initial, {'initial':initial,'second':records(second)}
        second.close()
        # Model a retained, unconfirmed save without sending any request.
        page.evaluate('''async key => {let db=await new Promise((ok,fail)=>{let r=indexedDB.open('haoduoyu-offline');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});await new Promise((ok,fail)=>{let tx=db.transaction('meta','readwrite'),s=tx.objectStore('meta'),g=s.get(key);g.onsuccess=()=>{let row=g.result;row.data.phase='unknown';row.data.pending={kind:'put',version:row.data.version,saveId:crypto.randomUUID(),text:row.data.draft};row.write_id=crypto.randomUUID();s.put(row)};tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});db.close();}''',initial[0]['key'])
        pending_source=records(page)
        page.reload();expect(page.get_by_text('SYNTHETIC recovery text')).to_be_visible();page.wait_for_timeout(800)
        assert records(page)==pending_source, {'pending_source':pending_source,'after':records(page)}
        print('Synthetic browser: reloads, another tab and an unconfirmed save retain the original without extra drafts.')
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
