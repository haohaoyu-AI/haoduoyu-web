"""Synthetic IndexedDB regression; serves only the local worktree."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
origin = 'http://127.0.0.1:%s' % server.server_port
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        context = browser.new_context()
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.goto(origin + '/')
        result = page.evaluate('''async () => {
          const {openOfflineDB} = await import('/web/offline/db.mjs');
          const {createDraftJournal} = await import('/web/offline/drafts.mjs');
          const db = await openOfflineDB({name:'synthetic-cleanup-only'});
          const scope = 'a'.repeat(64), id = crypto.randomUUID(), day = '2026-10-26';
          const row = {kind:'note_entry', id, category:'life', date:day, draft:'synthetic text',
            version:3, labels:['life'], dirty:true, phase:'dirty'};
          const deleted = {id, category:'life', date:day, text:row.draft, version:4, deleted:true, can_edit:true,
            labels_version:3, labels:['life'], created_at:'2026-10-26T09:00:00Z', updated_at:'2026-10-26T10:00:00Z',
            deleted_at:'2026-10-26T10:00:00Z', content_hash:'a'.repeat(64)};
          const journal = owner => createDraftJournal({db, getScope:() => scope, draftOwner:owner});
          const a = journal('a'), b = journal('b'), c = journal('c'), d = journal('d');
          await a.capture([row]); await b.capture([row]);
          await c.capture([{...row, draft:'other valid work'}]);
          await d.capture([{...row, phase:'unknown', pending:{kind:'put',saveId:crypto.randomUUID()}}]);
          const snapshots = await a.records('note_entry');
          await a.purgeVerified(snapshots, new Map([[id,deleted]]));
          await b.capture([row]);
          const actual = await a.list('note_entry');
          db.close();
          return actual.map(value => ({draft:value.draft, pending:!!value.pending}));
        }''')
        assert len(result) == 2 and any(x['draft'] == 'other valid work' for x in result) and any(x['pending'] for x in result), result
        context.close(); browser.close()
        print('Synthetic Chromium IndexedDB: duplicate records deleted; stale replay blocked; independent and pending drafts preserved.')
finally:
    server.shutdown(); server.server_close()
