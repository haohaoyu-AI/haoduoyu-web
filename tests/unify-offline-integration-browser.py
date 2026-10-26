"""Real controllers + Worker + temporary synthetic D1 + Chromium IndexedDB/SW."""
import json
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen(['node', 'tests/unify-offline-integration-browser-server.mjs'], cwd=ROOT,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
origin = server.stdout.readline().strip()
if not origin.startswith('http://127.0.0.1:'):
    raise RuntimeError('Synthetic fixture failed: ' + server.stderr.read())
report = {'synthetic': True, 'real_worker': True, 'browser': 'Chromium', 'checks': [], 'errors': []}
expect.set_options(timeout=20000)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Shanghai')
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.goto(origin + '/?page=todos')
        expect(page.locator('#todo-text')).to_be_visible()
        page.evaluate('navigator.serviceWorker.ready.then(() => true)')
        page.reload()
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        expect(page.locator('#todo-completed-mode')).to_be_enabled()
        page.wait_for_function('document.querySelector("#todo-templates")?.dataset.loaded === "true"')
        date = page.locator('#todo-form').get_attribute('data-date')
        context.set_offline(True)
        page.locator('#todo-text').fill('【自动测试】离线刷新不丢')
        page.locator('#todo-form button[type=submit]').click()
        expect(page.locator('#todo-text')).to_have_value('')
        expect(page.locator('#todo-items')).to_contain_text('【自动测试】离线刷新不丢')
        expect(page.locator('.offline-state-button')).to_have_text('离线（1 条待同步）')
        checkbox = page.locator('[data-todo-id]').first
        item_id = checkbox.get_attribute('data-todo-id')
        checkbox.check()
        expect(page.locator('.offline-state-button')).to_have_text('离线（2 条待同步）')
        page.reload()
        expect(page.locator('#todo-items')).to_contain_text('【自动测试】离线刷新不丢')
        expect(page.locator('[data-todo-id="' + item_id + '"]')).to_be_checked()
        expect(page.locator('.offline-state-button')).to_have_text('离线（2 条待同步）')
        page.locator('.offline-state-button').click()
        expect(page.locator('#offline-queue')).to_contain_text('离线刷新不丢')
        report['checks'].append('offline create/checkbox -> durable local ack -> SW reload -> IDB rows and queue survive')
        context.set_offline(False)
        page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        saved = page.request.get(origin + '/api/v1/todos?date=' + date).json()['data']['items']
        row = next(row for row in saved if row['id'] == item_id)
        assert row['completed'] is True and row['version'] == 2
        report['checks'].append('online fresh scope verification -> original UUID FIFO create/checkbox -> real D1 v2')
        page.reload()
        expect(page.locator('[data-todo-id="' + item_id + '"]')).to_be_checked()
        context.set_offline(True)
        page.locator('[data-action="todo-menu"][data-id="' + item_id + '"]').click()
        page.locator('[data-action="todo-delete"]').click()
        expect(page.locator('[data-action="todo-restore"]')).to_be_enabled()
        page.locator('[data-action="todo-restore"]').click()
        expect(page.locator('[data-todo-id="' + item_id + '"]')).to_be_checked()
        context.set_offline(False)
        page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        row = next(row for row in page.request.get(origin + '/api/v1/todos?date=' + date).json()['data']['items'] if row['id'] == item_id)
        assert row['version'] == 4 and row['deleted_at'] is None and row['completed'] is True
        report['checks'].append('existing delete/undo controllers -> durable tombstone/explicit restore -> real D1 v4')
        context.set_offline(True)
        page.locator('#todo-text').fill('【自动测试】正在继续输入')
        page.locator('#todo-text').evaluate("el => {el.focus();el.setSelectionRange(6, 6);el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));}")
        page.evaluate("window.dispatchEvent(new Event('offline'))")
        assert page.locator('#todo-text').input_value() == '【自动测试】正在继续输入'
        assert page.locator('#todo-text').evaluate('el => el.selectionStart') == 6
        page.locator('#todo-text').dispatch_event('compositionend')
        report['checks'].append('background status update preserves Chinese IME input and caret')
        page.evaluate('''() => {
          const original = IDBDatabase.prototype.transaction;
          let failures = 0;
          IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
            if (mode === 'readwrite' && Array.from(stores).includes('outbox')) {
              if (++failures === 2) IDBDatabase.prototype.transaction = original;
              throw new Error('Synthetic durable transaction failure');
            }
            return original.call(this, stores, mode, ...rest);
          };
        }''')
        page.locator('#todo-text').fill('【自动测试】事务失败保留输入')
        page.locator('#todo-form button[type=submit]').click()
        expect(page.locator('#todo-feedback')).to_contain_text('Synthetic durable transaction failure')
        expect(page.locator('#todo-text')).to_have_value('【自动测试】事务失败保留输入')
        report['checks'].append('real IndexedDB transaction failure rejects local ack and preserves composer input')
        page.locator('#todo-text').fill('')
        page.locator('[data-todo-id="' + item_id + '"]').uncheck()
        expect(page.locator('.offline-state-button')).to_have_text('离线（1 条待同步）')
        second = context.new_page()
        second.goto(origin + '/?page=todos')
        expect(second.locator('[data-todo-id="' + item_id + '"]')).not_to_be_checked()
        headers = {'X-Public-Business': '1', 'Origin': origin}
        remote = second.request.patch(origin + '/api/v1/todos/' + item_id, headers=headers,
                                      data={'completed': False, 'version': 4})
        assert remote.status == 200, remote.text()
        remote = second.request.patch(origin + '/api/v1/todos/' + item_id, headers=headers,
                                      data={'completed': True, 'version': 5})
        assert remote.status == 200, remote.text()
        context.set_offline(False)
        page.evaluate("window.dispatchEvent(new Event('online'))")
        expect(page.locator('.offline-state-button')).to_have_text('有冲突')
        page.locator('.offline-state-button').click()
        expect(page.locator('.offline-conflict')).to_contain_text('完成：否')
        expect(page.locator('.offline-conflict')).to_contain_text('完成：是')
        page.locator('.offline-conflict button', has_text='用本地').click()
        expect(page.locator('.offline-followup')).to_contain_text('两份内容仍保留')
        expect(page.locator('.offline-state-button')).to_have_text('有冲突')
        page.locator('.offline-conflict button', has_text='用线上').click()
        expect(page.locator('.offline-state-button')).to_have_text('已同步')
        preserved = page.evaluate('''async () => {
          const db = await new Promise((ok, fail) => {const r=indexedDB.open('haoduoyu-offline');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
          const rows = await new Promise((ok, fail) => {const r=db.transaction('conflicts').objectStore('conflicts').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
          db.close();return rows.map(row=>({local:row.local.completed,remote:row.remote.completed,resolved:row.resolved_at!==null}));
        }''')
        assert preserved == [{'local': False, 'remote': True, 'resolved': True}], preserved
        report['checks'].append('two tabs share durable queue; real remote v6 conflict retains both sides; use-local stays unresolved; use-server archives but retains text')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not report['errors'], report['errors']
        report['complete'] = True
        print(json.dumps(report, ensure_ascii=False))
        context.close(); browser.close()
finally:
    server.terminate()
    try:
        server.wait(timeout=15)
    except subprocess.TimeoutExpired:
        server.kill()
