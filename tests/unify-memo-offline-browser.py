"""Real Chromium/IndexedDB/Worker/D1; loopback synthetic data only."""
import json, os, re, select, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(os.environ.get('MEMO_OFFLINE_ROOT', Path(__file__).resolve().parents[1]))
OUT = Path('/workspace/ui-validation-private/unify-memo-offline-browser')
OUT.mkdir(parents=True, exist_ok=True)
harness = (ROOT / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
report = {'synthetic': True, 'completed': False, 'checks': [], 'pageerrors': [], 'external_requests': []}
server = subprocess.Popen(['node', 'tests/unify-offline-integration-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def db_rows(page, store):
    return page.evaluate("""store => new Promise((resolve,reject)=>{const open=indexedDB.open('haoduoyu-offline',1);
      open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,
      tx=db.transaction(store,'readonly'),get=tx.objectStore(store).getAll();
      get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};})""", store)
def pending(page):
    return [row for row in db_rows(page, 'outbox') if row['status'] not in ('archived', 'acked')]
def wait_pending(page, count, timeout=30000):
    deadline = time.monotonic() + timeout / 1000
    while time.monotonic() < deadline:
        if len(pending(page)) == count:
            return
        page.wait_for_timeout(50)
    raise AssertionError('durable pending count did not become ' + str(count))
def wait_local_body(page, text):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if any(row['entity_id'].startswith('memo-note:') and row.get('local', {}).get('body') == text
               for row in db_rows(page, 'entities')):
            return
        page.wait_for_timeout(50)
    raise AssertionError('durable local body did not match the completed input')
def wait_server_body(context, origin, note_id, text):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        response = context.request.get(origin + '/api/v1/memos/notes/' + note_id)
        if response.status == 200 and response.json()['data'].get('body') == text:
            return response.json()['data']
        time.sleep(0.05)
    raise AssertionError('the real server body did not match the completed edit')
try:
    assert select.select([server.stdout], [], [], 45)[0]
    origin = server.stdout.readline().strip()
    assert origin.startswith('http://127.0.0.1:')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 900}, locale='zh-CN', timezone_id='Asia/Shanghai')
        def route_local(route):
            if route.request.url.startswith(origin + '/'):
                route.continue_()
            else:
                report['external_requests'].append(route.request.url)
                route.abort()
        context.route('**/*', route_local)
        login = context.request.post(origin + '/api/v1/auth/login', headers={'Origin': origin},
                                     data={'username': username, 'password': password})
        assert login.status == 200
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
        page.goto(origin + '/?page=memos')
        page.evaluate('navigator.serviceWorker.ready.then(() => true)')
        page.reload()
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        expect(page.locator('[data-memo-action="new-note"]')).to_be_visible()
        context.set_offline(True)
        page.locator('[data-memo-action="new-note"]').click()
        expect(page.locator('#memo-body')).to_be_visible()
        page.locator('#memo-title').fill('【自动测试】离线备忘')
        for text in ['【自动测试】第一稿', '【自动测试】第二稿', '【自动测试】第三稿']:
            page.locator('#memo-body').fill(text)
            wait_local_body(page, text)
        expect(page.locator('#memo-status')).to_contain_text('本机')
        queued = pending(page)
        note_ops = [row for row in queued if row['entity_type'] == 'memo_note']
        assert len(note_ops) == 4 and all(row['protocol'] == 2 for row in note_ops), [
            {'version': row['body']['version'], 'protocol': row.get('protocol'), 'body': row['body'].get('body')} for row in note_ops]
        note_id = note_ops[0]['source_id']
        assert note_ops[0]['depends_on'][0].startswith('memo-group:')
        page.reload()
        expect(page.locator('#memo-body')).to_have_value('【自动测试】第三稿')
        report['checks'].append('offline default group, three durable edits and reload retain the complete body')
        page.screenshot(path=str(OUT / 'offline-queued-desktop.png'), full_page=True)
        context.set_offline(False)
        wait_pending(page, 0)
        expect(page.locator('#memo-status')).not_to_contain_text('本机', timeout=30000)
        saved = context.request.get(origin + '/api/v1/memos/notes/' + note_id).json()['data']
        assert saved['body'] == '【自动测试】第三稿' and saved['version'] == 4
        report['checks'].append('online sends parent then note versions and restores the true server baseline')

        context.set_offline(True)
        body = page.locator('#memo-body')
        body.focus()
        body.dispatch_event('compositionstart')
        body.evaluate("node=>{node.value='【自动测试】输入法中间态';node.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));}")
        page.wait_for_timeout(1000)
        assert not pending(page)
        body.evaluate("node=>{node.value='【自动测试】刷新前尚在合成';node.setSelectionRange(5,9);}")
        frozen = page.evaluate('''() => {
          const field=document.querySelector('#memo-body'),root=document.querySelector('#memos');
          window.__memoRefreshField=field;
          const original=Storage.prototype.setItem;
          Storage.prototype.setItem=function(key,value){
            if(key.startsWith('haoduoyu.memos.drafts.v1.')) throw new DOMException('Synthetic memo quota','QuotaExceededError');
            return original.call(this,key,value);
          };
          const writes=[],failures=[];
          dispatchEvent(new CustomEvent('haoduoyu:before-refresh',{detail:{
            waitUntil:promise=>{const work=Promise.resolve(promise);work.catch(()=>{});writes.push(work)},
            onFailure:callback=>failures.push(callback)}}));
          window.__memoRefreshSettle=async()=>{
            const results=await Promise.allSettled(writes);Storage.prototype.setItem=original;
            const failure=results.find(result=>result.status==='rejected');
            if(!failure) throw Error('Memo draft quota failure did not block refresh');
            await Promise.all(failures.map(callback=>callback(failure.reason)));
          };
          return {readonly:field.readOnly,inert:root.inert,
            actions:[...root.querySelectorAll('button,input,select')].every(control=>control.disabled)};
        }''')
        assert frozen == {'readonly': True, 'inert': True, 'actions': True}, frozen
        page.evaluate('window.__memoRefreshSettle()')
        assert body.evaluate('''node=>node===window.__memoRefreshField && !node.readOnly &&
          node.value==='【自动测试】刷新前尚在合成' && node.selectionStart===5 && node.selectionEnd===9 && node.dataset.composing==='true' ''')
        assert not page.locator('#memos').evaluate('node=>node.inert')
        page.wait_for_timeout(1000)
        assert not pending(page)
        page.evaluate('''async()=>{
          const writes=[],failures=[];
          dispatchEvent(new CustomEvent('haoduoyu:before-refresh',{detail:{
            waitUntil:promise=>{const work=Promise.resolve(promise);work.catch(()=>{});writes.push(work)},
            onFailure:callback=>failures.push(callback)}}));
          if(!writes.length || !document.querySelector('#memo-body').readOnly) throw Error('Memo retry did not freeze input');
          const results=await Promise.allSettled(writes),failure=results.find(result=>result.status==='rejected');
          if(failure){await Promise.all(failures.map(callback=>callback(failure.reason)));throw failure.reason;}
        }''')
        assert not pending(page)
        page.reload()
        expect(page.locator('#memo-body')).to_have_value('【自动测试】刷新前尚在合成')
        page.wait_for_timeout(1000)
        assert not pending(page)
        report['checks'].append('refresh waits for verified private DOM/IME draft persistence; quota failure restores caret/input and retry reopens privately without enqueue')
        body.focus()
        body.dispatch_event('compositionstart')
        body.evaluate("node=>{node.value='【自动测试】输入法完整正文';node.setSelectionRange(5,9);}")
        body.dispatch_event('compositionend')
        wait_pending(page, 1)
        assert page.evaluate('document.activeElement.id') == 'memo-body'
        selection = body.evaluate('node=>[node.selectionStart,node.selectionEnd]')
        page.locator('[data-memo-action="fullscreen"]').click()
        expect(page.locator('#memo-fullscreen')).to_be_visible()
        assert body.evaluate('node=>[node.selectionStart,node.selectionEnd]') == selection
        page.keyboard.press('Escape')
        expect(page.locator('#memo-fullscreen')).not_to_be_visible()
        expect(body).to_have_value('【自动测试】输入法完整正文')
        handle = page.locator('#memo-resizer')
        before_width = int(handle.get_attribute('aria-valuenow'))
        area = handle.bounding_box()
        page.mouse.move(area['x'] + 3, area['y'] + 70)
        page.mouse.down()
        page.mouse.move(area['x'] + 100, area['y'] + 70)
        page.mouse.up()
        dragged_width = int(handle.get_attribute('aria-valuenow'))
        assert dragged_width > before_width
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.close()
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
        page.goto(origin + '/?page=memos')
        expect(page.locator('#memo-body')).to_have_value('【自动测试】输入法完整正文')
        expect(page.locator('#memo-resizer')).to_have_attribute('aria-valuenow', str(dragged_width))
        page.set_viewport_size({'width': 390, 'height': 844})
        expect(page.locator('#memo-resizer')).to_be_hidden()
        expect(page.locator('#memo-body')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.screenshot(path=str(OUT / 'offline-reopened-phone.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 900})
        report['checks'].append('IME commits only after composition; fullscreen keeps selection; drag width persists after offline close/reopen and phone resize')
        context.set_offline(False)
        wait_pending(page, 0)
        expect(page.locator('#memo-status')).not_to_contain_text('本机', timeout=30000)

        page.locator('[data-memo-action="new-note"]').click()
        expect(page.locator('#memo-body')).to_have_value('')
        page.locator('#memo-title').fill('【自动测试】在线删除恢复')
        page.locator('#memo-body').fill('【自动测试】X仍走原来的在线软删与恢复')
        wait_local_body(page, '【自动测试】X仍走原来的在线软删与恢复')
        newer = [row for row in db_rows(page, 'entities') if row['entity_id'].startswith('memo-note:') and
                 row.get('local', {}).get('body') == '【自动测试】X仍走原来的在线软删与恢复'][0]
        clean_id = newer['entity_id'].split(':', 1)[1]
        wait_server_body(context, origin, clean_id, '【自动测试】X仍走原来的在线软删与恢复')
        wait_pending(page, 0)
        page.locator('[data-memo-action="delete-note"][data-memo-target="' + clean_id + '"]').click()
        try:
            expect(page.locator('[data-memo-note="' + clean_id + '"]')).to_have_count(0)
        except Exception:
            report['delete_diagnostic'] = {'ui_error': page.locator('#memo-error').inner_text(),
                'note_error': page.locator('#memo-note-error').inner_text(), 'pending': pending(page),
                'phase': page.locator('#memo-status').get_attribute('data-phase'),
                'entity': [row for row in db_rows(page, 'entities') if row['entity_id'] == 'memo-note:' + clean_id],
                'server': context.request.get(origin + '/api/v1/memos/notes/' + clean_id).json()['data']}
            raise
        deleted = context.request.get(origin + '/api/v1/memos/notes/' + clean_id).json()['data']
        assert deleted['deleted_at']
        page.goto(origin + '/?page=settings&tab=workspace')
        expect(page.locator('[data-memo-note="' + clean_id + '"]')).to_be_visible()
        page.locator('[data-memo-action="restore-note"][data-memo-target="' + clean_id + '"]').click()
        expect(page.locator('[data-memo-note="' + clean_id + '"]')).to_have_count(0)
        restored = context.request.get(origin + '/api/v1/memos/notes/' + clean_id).json()['data']
        assert restored['deleted_at'] is None and restored['body'] == deleted['body']
        page.goto(origin + '/?page=memos')
        expect(page.locator('[data-memo-note="' + note_id + '"]')).to_be_visible()
        page.locator('[data-memo-note="' + note_id + '"]').click()
        report['checks'].append('online flat-list X uses real soft deletion and the existing settings trash restores the original body')

        second = context.new_page()
        second.on('pageerror', lambda error: report['pageerrors'].append(str(error)))
        second.goto(origin + '/?page=memos')
        expect(second.locator('#memo-body')).to_have_value('【自动测试】输入法完整正文')
        context.set_offline(True)
        page.locator('#memo-body').fill('【自动测试】本机冲突稿')
        wait_pending(page, 1)
        me = second.request.get(origin + '/api/v1/auth/me').json()['data']
        remote = second.request.get(origin + '/api/v1/memos/notes/' + note_id).json()['data']
        for text in ['【自动测试】第二页线上新稿', '【自动测试】第二页线上最终稿']:
            result = second.request.put(origin + '/api/v1/memos/notes/' + note_id,
                headers={'Origin': origin, 'X-CSRF-Token': me['csrfToken']},
                data={key: remote[key] for key in ('group_id', 'title', 'position', 'version')} |
                     {'body': text, 'save_id': second.evaluate('crypto.randomUUID()')})
            assert result.status == 200
            remote = result.json()['data']
        context.set_offline(False)
        expect(page.locator('.offline-state-button')).to_have_text('有冲突', timeout=30000)
        expect(page.locator('#memo-body')).to_have_value('【自动测试】本机冲突稿')
        conflicts = [row for row in db_rows(page, 'conflicts') if row['resolved_at'] is None]
        assert any(row['local']['body'] == '【自动测试】本机冲突稿' and
                   row['remote']['body'] == '【自动测试】第二页线上最终稿' for row in conflicts)
        report['checks'].append('two tabs preserve the durable local body and the independently updated real server body')
        context.set_offline(True)
        page.locator('[data-memo-action="delete-note"][data-memo-target="' + note_id + '"]').click()
        expect(page.locator('#memo-error')).to_contain_text('联网')
        expect(page.locator('#memo-body')).to_have_value('【自动测试】本机冲突稿')
        report['checks'].append('offline X keeps both copies and explicitly requires network instead of pretending to delete')
        page.screenshot(path=str(OUT / 'offline-conflict-desktop.png'), full_page=True)
        assert not report['pageerrors'] and not report['external_requests']
        report['completed'] = True
        context.close()
        browser.close()
finally:
    server.terminate()
    try:
        server.wait(timeout=10)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait()
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
