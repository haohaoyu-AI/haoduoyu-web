"""Real notes controllers, synthetic Worker/D1 and Chromium IndexedDB/SW; no production access."""
import json
from pathlib import Path
import subprocess
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen(['node', 'tests/unify-offline-notes-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
origin = server.stdout.readline().strip()
if not origin.startswith('http://127.0.0.1:'):
    raise RuntimeError('Synthetic fixture failed: ' + server.stderr.read())
report = {'synthetic': True, 'real_worker': True, 'browser': 'Chromium', 'checks': [], 'errors': []}
expect.set_options(timeout=20000)

def table(page, name):
    return page.evaluate('''async name => {
      const db = await new Promise((ok, fail)=>{const r=indexedDB.open('haoduoyu-offline');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
      const rows = await new Promise((ok, fail)=>{const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
      db.close();return rows;
    }''', name)

def wait_operations(page, count):
    wait_table(page, 'outbox', lambda rows: len(rows) == count)

def wait_table(page, name, predicate, attempts=400):
    for _ in range(attempts):
        rows = table(page, name)
        if predicate(rows): return rows
        page.wait_for_timeout(50)
    raise AssertionError('Bounded IndexedDB wait failed: ' + name)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Shanghai')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page(); page.on('pageerror', lambda error: report['errors'].append(error.stack))
        page.goto(origin + '/?page=notes')
        expect(page.locator('[data-notes-action=new]')).to_be_visible()
        page.evaluate('navigator.serviceWorker.ready.then(() => true)'); page.reload()
        expect(page.locator('[data-notes-action=new]')).to_be_visible()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        date = page.locator('#notes-date').input_value()
        page.locator('[data-notes-action=edit-legacy]').click()
        expect(page.locator('#notes-editor')).to_have_attribute('readonly', '')
        assert not page.locator('#notes-write-actions').is_visible()
        context.set_offline(True)
        page.locator('[data-notes-action=new]').click()
        editor = page.locator('#notes-active-entry textarea'); entry_id = editor.get_attribute('data-note-entry-editor')
        for count, text in enumerate(['【自动测试】离线初稿', '【自动测试】连续第二稿', '【自动测试】连续第三稿'], start=1):
            editor.fill(text); wait_operations(page, count)
            expect(page.locator('#notes-active-entry .note-entry-status')).to_have_text('已存本机，待同步')
        operations = sorted(table(page, 'outbox'), key=lambda row: row['seq'])
        assert [row['body']['version'] for row in operations] == [0, 1, 2]
        assert len({row['save_id'] for row in operations}) == 3
        assert all(row['entity_id'] == 'note-entry:' + entry_id for row in operations)
        page.locator('[data-notes-action=new]').click()
        page.locator('#notes-active-entry textarea').fill('【自动测试】同日第二条'); wait_operations(page, 4)
        report['checks'].append('life same-day independent entries and one-entry CAS 0/1/2 survive as durable local documents')
        page.get_by_role('button', name='工作碎碎念', exact=True).click()
        expect(page.locator('[data-notes-action=new]')).to_be_visible()
        page.locator('[data-notes-action=new]').click()
        page.locator('#notes-active-entry textarea').fill('【自动测试】工作独立条目'); wait_operations(page, 5)
        before_reload = table(page, 'outbox')
        page.reload()
        after_reload = table(page, 'outbox')
        assert len(after_reload) == len(before_reload), {'before': before_reload, 'after': after_reload}
        expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】工作独立条目')
        page.get_by_role('button', name='生活碎碎念', exact=True).click()
        expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】连续第三稿')
        expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】同日第二条')
        report['checks'].append('offline SW reload restores both categories without merging independently identified entries')
        page.locator('[data-note-entry="' + entry_id + '"] [data-note-entry-action=edit]').click()
        editor = page.locator('#notes-active-entry textarea')
        editor.evaluate('''el=>{el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
          el.value='【自动测试】中文尚在合成';el.setSelectionRange(8,8);el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));}''')
        wait_table(page, 'meta', lambda rows: any(row.get('draft_kind') == 'note_entry' and
                   row['data']['draft'] == '【自动测试】中文尚在合成' for row in rows))
        assert len(table(page, 'outbox')) == 5
        assert editor.evaluate('el=>el.selectionStart') == 8
        frozen = page.evaluate('''() => {
          const field=document.querySelector('#notes-active-entry textarea'), root=document.querySelector('#daily-notes');
          window.__notesRefreshField=field;
          const original=IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction=function(stores,mode,...args){
            if(mode==='readwrite' && (typeof stores==='string'?[stores]:Array.from(stores)).includes('meta'))
              throw new DOMException('Synthetic journal quota failure','QuotaExceededError');
            return original.call(this,stores,mode,...args);
          };
          const writes=[],failures=[];
          dispatchEvent(new CustomEvent('haoduoyu:before-refresh',{detail:{
            waitUntil:promise=>{const work=Promise.resolve(promise);work.catch(()=>{});writes.push(work)},
            onFailure:callback=>failures.push(callback)}}));
          window.__notesRefreshSettle=async()=>{
            const results=await Promise.allSettled(writes);
            IDBDatabase.prototype.transaction=original;
            const failure=results.find(result=>result.status==='rejected');
            if(!failure) throw Error('The synthetic journal failure was not observed');
            await Promise.all(failures.map(callback=>callback(failure.reason)));
          };
          return {readonly:field.readOnly,inert:root.inert,
            actions:[...root.querySelectorAll('button,input,select')].every(control=>control.disabled)};
        }''')
        assert frozen == {'readonly': True, 'inert': True, 'actions': True}, frozen
        page.evaluate('window.__notesRefreshSettle()')
        assert editor.evaluate('el=>el===window.__notesRefreshField && !el.readOnly && el.value==="【自动测试】中文尚在合成" && el.selectionStart===8 && el.dataset.composing==="true"')
        assert not page.locator('#daily-notes').evaluate('el=>el.inert')
        assert len(table(page, 'outbox')) == 5
        report['checks'].append('explicit refresh freezes input through journal persistence; a real IndexedDB failure restores the same composition/caret/text without enqueue or reload')
        page.once('dialog', lambda dialog: dialog.accept()); page.reload()
        expect(page.locator('#notes-active-entry textarea')).to_have_value('【自动测试】中文尚在合成')
        assert len(table(page, 'outbox')) == 5
        page.locator('#notes-active-entry [data-note-entry-action=save]').click(); wait_operations(page, 6)
        report['checks'].append('Chinese composition journals a draft without enqueue; reload retains it for explicit save under its original category/date')
        context.set_offline(False); page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        saved = page.request.get(origin + '/api/v1/note-entries/' + entry_id).json()['data']
        assert saved['version'] == 4 and saved['text'] == '【自动测试】中文尚在合成' and len(saved['content_hash']) == 64
        page.locator('[data-note-entry="' + entry_id + '"] [data-note-entry-action=edit]').click()
        expect(page.locator('#notes-active-entry .note-entry-status')).to_have_text('已保存')
        report['checks'].append('online FIFO sends original save IDs and real D1 v4/hash acknowledgement replaces only the true server baseline')
        context.set_offline(True)
        page.locator('#notes-active-entry textarea').fill('【自动测试】本机冲突稿'); wait_operations(page, 1)
        response = page.request.put(origin + '/api/v1/note-entries/' + entry_id,
            headers={'Origin': origin, 'X-Public-Business': '1'},
            data={'category': 'life', 'date': date, 'text': '【自动测试】线上冲突稿', 'version': 4, 'save_id': str(uuid.uuid4())})
        assert response.status == 200, response.text()
        context.set_offline(False); page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('.offline-state-button')).to_have_text('有冲突')
        expect(page.locator('#notes-active-entry textarea')).to_have_value('【自动测试】本机冲突稿')
        page.locator('.offline-state-button').click()
        expect(page.locator('.offline-conflict')).to_contain_text('【自动测试】线上冲突稿')
        page.locator('.offline-conflict button', has_text='用本地').click()
        expect(page.locator('.offline-followup')).to_be_visible()
        expect(page.locator('.offline-state-button')).to_have_text('有冲突')
        page.locator('.offline-conflict button', has_text='用线上').click()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        page.locator('[data-note-entry="' + entry_id + '"] [data-note-entry-action=edit]').click()
        expect(page.locator('#notes-active-entry textarea')).to_have_value('【自动测试】线上冲突稿')
        report['checks'].append('real concurrent version conflict preserves both texts; local choice stays unresolved and explicit server choice archives without deleting conflict evidence')
        page.request.get(origin + '/__offline-test/drop-next-put')
        page.locator('#notes-active-entry textarea').fill('【自动测试】提交后丢响应')
        try:
            wait_table(page, 'outbox', lambda rows: any(row['status'] == 'unknown' for row in rows), attempts=700)
        except Exception:
            print(json.dumps({'fault_body': page.locator('body').inner_text(), 'fault_ops': table(page, 'outbox'),
                              'fault_calls': page.request.get(origin + '/__offline-test/calls').json()[-30:]}, ensure_ascii=False), flush=True)
            raise
        expect(page.locator('.offline-state-button')).to_have_text('已同步', timeout=25000)
        calls = page.request.get(origin + '/__offline-test/calls').json()
        dropped = [row for row in calls if row.get('dropped')]
        assert len(dropped) == 1
        assert len([row for row in calls if row.get('save_id') == dropped[0]['save_id'] and row['method'] == 'PUT']) == 1
        assert any(row['path'].endswith('/operations/' + dropped[0]['save_id']) for row in calls)
        report['checks'].append('lost real committed response stays unknown; original receipt confirms success with exactly one PUT')
        context.set_offline(True)
        page.locator('#notes-active-entry [data-note-entry-action=delete]').click()
        page.locator('#notes-active-entry [data-note-entry-action=confirm-delete]').click(); wait_operations(page, 1)
        context.set_offline(False); page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        deleted = page.request.get(origin + '/api/v1/note-entries/' + entry_id).json()['data']
        assert deleted['deleted'] is True
        report['checks'].append('explicit offline delete becomes a real versioned tombstone and never revives the remote entry')
        calls = page.request.get(origin + '/__offline-test/calls').json()
        assert not any(row['method'] != 'GET' and '/daily-notes' in row['path'] for row in calls)
        assert not report['errors'], report['errors']
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        report['complete'] = True; print(json.dumps(report, ensure_ascii=False))
        context.close(); browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=15)
    except subprocess.TimeoutExpired: server.kill()
