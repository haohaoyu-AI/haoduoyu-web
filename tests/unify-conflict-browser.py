"""Real Chromium, real E handlers and synthetic Worker/D1 only; no production access."""
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
    raise RuntimeError(server.stderr.read())
expect.set_options(timeout=20000)
report = {'synthetic': True, 'real_worker': True, 'browser': 'Chromium', 'checks': [], 'errors': []}
csrf = ''
proof = Path('/workspace/ui-validation-private/unify-validation/stage3e-browser')
proof.mkdir(parents=True, exist_ok=True)

def table(page, name):
    return page.evaluate('''async name=>{const db=await new Promise((ok,no)=>{const r=indexedDB.open('haoduoyu-offline');
      r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const rows=await new Promise((ok,no)=>{
      const r=db.transaction(name).objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
      db.close();return rows}''', name)

def wait(page, check, message):
    for _ in range(400):
        if check(): return
        page.wait_for_timeout(50)
    raise AssertionError(message)

def active(page):
    return [row for row in table(page, 'outbox') if row['status'] not in ['archived', 'acked']]

def request(page, path, method='GET', body=None):
    response = page.request.fetch(origin + '/api/v1' + path, method=method,
        headers={'Origin': origin, 'X-Public-Business': '1', 'X-CSRF-Token': csrf}, data=body)
    assert response.ok, response.text()
    return response.json()['data']

def remote_edit(page, entry_id, text):
    row = request(page, '/note-entries/' + entry_id)
    return request(page, '/note-entries/' + entry_id, 'PUT', {
        'category': row['category'], 'date': row['date'], 'text': text, 'version': row['version'], 'save_id': str(uuid.uuid4())})

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, locale='zh-CN')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page(); page.on('pageerror', lambda error: report['errors'].append(str(error)))
        csrf = page.request.get(origin + '/__offline-test/session').json()['csrfToken']
        assert page.request.get(origin + '/api/v1/auth/me').json()['data']['id'] != 'public-business'
        page.goto(origin + '/?page=notes')
        expect(page.locator('[data-notes-action=new]')).to_be_visible()
        page.locator('[data-notes-action=new]').click()
        editor = page.locator('#notes-active-entry textarea'); entry_id = editor.get_attribute('data-note-entry-editor')
        editor.fill('【自动测试】冲突原稿')
        expect(page.locator('#notes-active-entry .note-entry-status')).to_have_text('已保存')
        expect(page.locator('.offline-state-button')).to_have_text('已同步')

        def conflict(local, remote):
            context.set_offline(True)
            if not page.locator('#notes-active-entry textarea').is_visible():
                page.locator('[data-note-entry="' + entry_id + '"] [data-note-entry-action=edit]').click()
            page.locator('#notes-active-entry textarea').fill(local)
            wait(page, lambda: len(active(page)) == 1, 'local conflict draft was not durable')
            remote_edit(page, entry_id, remote)
            context.set_offline(False); page.evaluate("dispatchEvent(new Event('online'))")
            try:
                expect(page.locator('.offline-state-button')).to_have_text('有冲突')
            except Exception:
                print(json.dumps({'during': local, 'ops': active(page), 'calls': page.request.get(origin + '/__offline-test/calls').json()[-25:],
                    'body': page.locator('body').inner_text(), 'online': page.evaluate('navigator.onLine')}, ensure_ascii=False), flush=True)
                raise
            if not page.locator('#offline-queue').is_visible(): page.locator('.offline-state-button').click()
            expect(page.locator('.offline-conflict').last).to_contain_text(remote)

        conflict('【自动测试】采用本机稿', '【自动测试】第一份线上稿')
        page.screenshot(path=str(proof / 'conflict-390.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 900})
        page.screenshot(path=str(proof / 'conflict-1440.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        held = []; hold_put = {'value': True}
        def hold(route):
            if route.request.method == 'PUT' and hold_put['value']: held.append(route)
            else: route.continue_()
        context.route(origin + '/api/v1/note-entries/*', hold)
        page.locator('.offline-conflict button', has_text='用本地').click()
        wait(page, lambda: bool(held), 'new resolution PUT was not queued')
        roots = [row for row in table(page, 'conflicts') if row.get('resolution')]
        assert len(roots) == 1 and roots[0]['resolved_at'] is None and roots[0]['resolution']['state'] == 'queued'
        assert roots[0]['operation']['protocol'] == 3 and roots[0]['original_operation']['body']['text'] == '【自动测试】采用本机稿'
        assert all(row['protocol'] == 3 for row in active(page))
        expect(page.locator('.offline-state-button')).to_have_text('有冲突')
        hold_put['value'] = False
        for route in held: route.continue_()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        row = request(page, '/note-entries/' + entry_id)
        assert row['text'] == '【自动测试】采用本机稿' and row['version'] == 3
        assert table(page, 'conflicts')[0]['resolution']['state'] == 'synced'
        report['checks'].append('use-local performs a real fresh CAS; original evidence and protocol-three pending decision survive until actual ACK')

        conflict('【自动测试】独立本机副本', '【自动测试】第二份线上稿')
        page.locator('.offline-conflict button', has_text='两份都留').click()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        original = request(page, '/note-entries/' + entry_id)
        entries = request(page, '/note-entries?category=life&date=' + original['date'])['entries']
        copy = next(row for row in entries if row['text'] == '【自动测试】独立本机副本')
        assert copy['id'] != entry_id and copy['version'] == 1 and original['text'] == '【自动测试】第二份线上稿'
        report['checks'].append('keep-both creates a distinct real UUID while leaving the original remote text intact')

        conflict('【自动测试】待归档本机稿', '【自动测试】第三份线上稿')
        before = len([row for row in page.request.get(origin + '/__offline-test/calls').json() if row['method'] == 'PUT'])
        page.locator('.offline-conflict button', has_text='用线上').click()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        after = len([row for row in page.request.get(origin + '/__offline-test/calls').json() if row['method'] == 'PUT'])
        assert before == after and request(page, '/note-entries/' + entry_id)['text'] == '【自动测试】第三份线上稿'
        assert any(row['local']['text'] == '【自动测试】待归档本机稿' for row in table(page, 'conflicts'))
        report['checks'].append('use-server accepts a freshly verified row without sending another write and retains the archived local text')

        conflict('【自动测试】重新确认本机稿', '【自动测试】较早线上稿')
        remote_edit(page, entry_id, '【自动测试】比较后又更新的线上稿')
        page.locator('.offline-conflict button', has_text='用本地').click()
        expect(page.locator('.offline-conflict')).to_contain_text('请核对新比较内容')
        expect(page.locator('.offline-conflict')).to_contain_text('【自动测试】比较后又更新的线上稿')
        assert len(active(page)) == 1 and active(page)[0]['status'] == 'conflict'
        assert any(row.get('remote_history') for row in table(page, 'conflicts'))
        page.locator('.offline-conflict button', has_text='用本地').click()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        assert request(page, '/note-entries/' + entry_id)['text'] == '【自动测试】重新确认本机稿'
        report['checks'].append('a remote edit after comparison requires a second explicit choice and preserves the previous comparison in history')

        conflict('【自动测试】选择前本机稿', '【自动测试】输入期间线上稿')
        held_get = []; hold_read = {'value': True}
        def hold_detail(route):
            if route.request.method == 'GET' and hold_read['value']: held_get.append(route)
            else: route.continue_()
        context.route(origin + '/api/v1/note-entries/' + entry_id, hold_detail)
        page.locator('.offline-conflict button', has_text='用本地').click()
        wait(page, lambda: bool(held_get), 'fresh comparison read was not held')
        field = page.locator('#notes-active-entry textarea')
        field.evaluate('''el=>{el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
          el.value='【自动测试】选择后尚在合成的新稿';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));}''')
        hold_read['value'] = False
        for route in held_get: route.continue_()
        expect(page.locator('.offline-conflict')).to_contain_text('本机输入或身份已变化')
        assert len(active(page)) == 1 and active(page)[0]['status'] == 'conflict'
        expect(field).to_have_value('【自动测试】选择后尚在合成的新稿')
        assert field.get_attribute('data-composing') == 'true'
        report['checks'].append('new Chinese input during the fresh read cancels the earlier choice without archiving its branch or losing unfinished input')
        group_id, memo_id = str(uuid.uuid4()), str(uuid.uuid4())
        title = '【自动测试】已删原分组'
        request(page, '/memos/groups/' + group_id, 'PUT',
            {'title': title, 'position': 0, 'version': 0, 'save_id': str(uuid.uuid4())})
        request(page, '/memos/notes/' + memo_id, 'PUT', {'group_id': group_id, 'title': '【自动测试】原笔记',
            'body': '【自动测试】原备忘录正文', 'position': 0, 'version': 0, 'save_id': str(uuid.uuid4())})
        page.set_viewport_size({'width': 1440, 'height': 900})
        page.once('dialog', lambda dialog: dialog.accept()); page.goto(origin + '/?page=memos')
        try:
            expect(page.locator('[data-memo-action="new-note"]')).to_be_visible()
        except Exception:
            me = page.request.get(origin + '/api/v1/auth/me').json()['data']
            print(json.dumps({'memo_identity': {'id': me['id'], 'publicBusiness': me.get('publicBusiness')},
                'memo_api': request(page, '/memos'), 'meta': [row for row in table(page, 'meta')
                    if 'identity' in row['key'] or 'memo-capability' in row['key']],
                'memo_calls': page.request.get(origin + '/__offline-test/calls').json()[-30:]}, ensure_ascii=False), flush=True)
            raise
        page.locator('[data-memo-note="' + memo_id + '"]').click()
        expect(page.locator('#memo-body')).to_have_value('【自动测试】原备忘录正文')
        try:
            expect(page.locator('#memo-body')).to_be_visible()
        except Exception:
            print(json.dumps({'memo_me': page.request.get(origin + '/api/v1/auth/me').json(),
                'memo_api': request(page, '/memos'), 'meta': [row for row in table(page, 'meta')
                    if 'identity' in row['key'] or 'memo-capability' in row['key']],
                'memo_pane': page.locator('#memos').get_attribute('data-pane')}, ensure_ascii=False), flush=True)
            raise
        page.set_viewport_size({'width': 390, 'height': 844})
        context.set_offline(True); page.locator('#memo-body').fill('【自动测试】父组删除后的本机正文')
        wait(page, lambda: any(row['entity_type'] == 'memo_note' for row in active(page)), 'memo edit was not durable')
        request(page, '/memos/groups/' + group_id, 'DELETE', {'version': 1, 'save_id': str(uuid.uuid4()),
            'confirm_title': title, 'confirm_note_count': 1})
        context.set_offline(False); page.evaluate("dispatchEvent(new Event('online'))")
        wait(page, lambda: any(row['entity_id'] == 'memo-note:' + memo_id and row['resolved_at'] is None
            for row in table(page, 'conflicts')), 'deleted-parent memo conflict did not appear')
        page.locator('.offline-state-button').click()
        memo_conflict = page.locator('.offline-conflict').filter(has_text='【自动测试】父组删除后的本机正文')
        expect(memo_conflict).to_be_visible()
        expect(memo_conflict.get_by_role('button', name='另存本地副本', exact=True)).to_be_visible()
        page.screenshot(path=str(proof / 'memo-copy-390.png'), full_page=True)
        memo_conflict.get_by_role('button', name='另存本地副本', exact=True).click()
        wait(page, lambda: not any(row['entity_type'].startswith('memo_') for row in active(page)), 'memo copy did not ACK')
        index = request(page, '/memos')
        old_group = next(row for row in index['groups'] if row['id'] == group_id)
        assert old_group['deleted_at'] is not None
        new_group = next(row for row in index['groups'] if row['id'] != group_id and row['deleted_at'] is None)
        new_note = next(row for row in index['notes'] if row['id'] != memo_id and row['group_id'] == new_group['id'])
        copied = request(page, '/memos/notes/' + new_note['id'])
        assert copied['body'] == '【自动测试】父组删除后的本机正文' and copied['version'] == 1
        assert request(page, '/memos/notes/' + memo_id)['body'] == '【自动测试】原备忘录正文'
        calls = page.request.get(origin + '/__offline-test/calls').json()
        assert not any(row['path'].endswith('/restore') for row in calls)
        report['checks'].append('deleted memo parent shows an explicit copy action and creates a new parent plus dependent note without restoring either original')
        assert not report['errors'], report['errors']
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        report['complete'] = True
        print(json.dumps(report, ensure_ascii=False))
        context.close(); browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=15)
    except subprocess.TimeoutExpired: server.kill()
