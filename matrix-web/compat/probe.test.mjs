import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { openDatabase } from '../src/db.mjs';
import { hashPassword, verifyPassword, digest } from '../src/auth.mjs';

const origin = 'https://matrix-probe.invalid';
const password = randomBytes(24).toString('hex');
const username = 'synthetic-probe';
let mf, db, nodeHash;
const evidence = { runtime:'Miniflare/workerd, local ephemeral D1 only', checks:[] };
const q = (sql, ...args) => db.prepare(sql).bind(...args);
const count = async table => (await q(`SELECT count(*) AS n FROM matrix_${table}`).first()).n;
async function request(path, { method='GET', body, headers={} } = {}) {
  const response = await mf.dispatchFetch(origin + path, { method, headers:{ ...(body ? {'Content-Type':'application/json'} : {}), ...headers }, ...(body ? {body:JSON.stringify(body)} : {}) });
  return { status:response.status, headers:response.headers, body:await response.json() };
}
async function login() {
  const result = await request('/api/v1/auth/login', { method:'POST', body:{ username,password }, headers:{Origin:origin} });
  assert.equal(result.status,200,JSON.stringify(result.body));
  return { Cookie:result.headers.get('set-cookie').split(';')[0], Origin:origin, 'X-CSRF-Token':result.body.data.csrfToken };
}
function record(name, detail={}) { evidence.checks.push({ name, ...detail }); }

before(async () => {
  const bundle = await build({ entryPoints:[new URL('./worker.mjs',import.meta.url).pathname], bundle:true, write:false, format:'esm', platform:'neutral', external:['node:*'], target:'es2022' });
  mf = new Miniflare({ modules:true, script:bundle.outputFiles[0].text,
    compatibilityDate:'2026-07-30', compatibilityFlags:['nodejs_compat'],
    d1Databases:['MATRIX_PROBE_DB'], d1Persist:false,
    bindings:{ SYNTHETIC_ONLY:'yes', SITE_ORIGIN:origin },
    // All external Worker fetches fail; no hosted binding/account credentials exist.
    outboundService:() => new Response('No outbound access in probe', {status:502}),
  });
  db = await mf.getD1Database('MATRIX_PROBE_DB');
  // Execute the ACTUAL Node schema on an in-memory Node database, then copy only
  // DDL (no seed rows) with a matrix_ namespace to the isolated D1 emulator.
  const source = openDatabase(':memory:');
  const schema = source.prepare("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type='index',rowid").all();
  source.close();
  const names = schema.map(v=>v.name).sort((a,b)=>b.length-a.length);
  for (const item of schema) {
    const sql = item.sql.replace(new RegExp('\\b(' + names.join('|') + ')\\b','g'), name=>'matrix_'+name);
    await db.prepare(sql).run();
  }
  await q('CREATE TABLE matrix_probe_guards(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))').run();
  nodeHash = await hashPassword(password);
  await q('INSERT INTO matrix_users VALUES(?,?,?,?)','fixture-user',username,nodeHash,new Date().toISOString()).run();
  await q("INSERT INTO matrix_accounts VALUES('fixture-account','other','SYNTHETIC',1,?)",new Date().toISOString()).run();
  record('original_schema_applied', { objects:schema.length, productionRowsRead:0, persisted:false });
});

after(async () => {
  await mf?.dispose();
  if (process.env.PROBE_EVIDENCE_PATH) await writeFile(process.env.PROBE_EVIDENCE_PATH, JSON.stringify(evidence,null,2)+'\n');
});

test('unchanged scrypt interoperates Node <-> Worker; inspect PBKDF2 alternatives', async () => {
  const result = await request('/__probe/crypto',{method:'POST',body:{password,nodeHash}});
  assert.equal(result.status,200,JSON.stringify(result.body));
  const {workerHash,...safe} = result.body;
  assert.equal(safe.correct,true);
  assert.equal(safe.incorrect,false);
  assert.equal(await verifyPassword(password,workerHash),true);
  assert.match(workerHash,/^scrypt\$32768\$8\$1\$/);
  record('crypto',safe);
});

test('public anonymous health works; business routes reject anonymity and platform identity alone', async () => {
  assert.equal((await request('/health')).status,200);
  for (const path of ['/api/v1/auth/me','/api/v1/articles','/api/v1/dashboard','/api/v1/export']) {
    assert.equal((await request(path)).status,401);
    assert.equal((await request(path,{headers:{'oai-authenticated-user-id':'synthetic-platform-user','oai-authenticated-user-email':'probe@example.invalid'}})).status,401);
  }
  const disabled = await mf.dispatchFetch('https://haoduoyu.xyz/health');
  assert.equal(disabled.status,503);
  record('anonymous_and_platform_headers_fail_closed');
});

test('independent password login, cookie flags, CSRF, same-origin and revocation', async () => {
  const bad = await request('/api/v1/auth/login',{method:'POST',body:{username,password:'wrong'},headers:{Origin:origin}});
  assert.equal(bad.status,401);
  const cross = await request('/api/v1/auth/login',{method:'POST',body:{username,password},headers:{Origin:'https://evil.invalid'}});
  assert.equal(cross.status,403);
  const raw = await request('/api/v1/auth/login',{method:'POST',body:{username,password},headers:{Origin:origin}});
  assert.equal(raw.status,200);
  const setCookie = raw.headers.get('set-cookie');
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=604800']) assert.ok(setCookie.includes(flag));
  assert.ok(!setCookie.includes('Domain='));
  const headers={ Cookie:setCookie.split(';')[0], Origin:origin, 'X-CSRF-Token':raw.body.data.csrfToken };
  const me = await request('/api/v1/auth/me',{headers});
  assert.equal(me.body.data.username,username);
  assert.equal(me.headers.get('cache-control'),'no-store');
  assert.equal((await request('/api/v1/auth/logout',{method:'POST',headers:{Cookie:headers.Cookie,Origin:origin}})).status,403);
  assert.equal((await request('/api/v1/auth/logout',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await request('/api/v1/auth/logout',{method:'POST',headers})).status,200);
  assert.equal((await request('/api/v1/auth/me',{headers})).status,401);
  record('independent_session_cookie_csrf_logout');
});

test('D1 rejects interactive BEGIN IMMEDIATE; batch rollback preserves receipt/business/audit', async () => {
  await assert.rejects(q('BEGIN IMMEDIATE').run(),/transaction|BEGIN|SQLITE_AUTH/i);
  const before = await count('audit');
  await assert.rejects(db.batch([
    q('INSERT INTO matrix_idempotency VALUES(?,?,?,?,?,?)','actor','rollback','hash','{}',201,'now'),
    q('INSERT INTO matrix_audit VALUES(?,?,?,?,?,?)','rollback-audit','actor','test',null,'{}','now'),
    q('INSERT INTO matrix_accounts VALUES(?,?,?,?,?)','bad','other','synthetic',7,'now'),
  ]),/CHECK constraint failed/);
  assert.equal(await q("SELECT * FROM matrix_idempotency WHERE key='rollback'").first(),null);
  assert.equal(await count('audit'),before);
  assert.equal(await q("SELECT * FROM matrix_accounts WHERE id='bad'").first(),null);
  record('interactive_begin_rejected_atomic_batch_rollback');
});

test('20 concurrent retries commit one business row, receipt and audit; changed payload conflicts', async () => {
  const headers={...await login(),'Idempotency-Key':'parallel-key'};
  const body={account_id:'fixture-account',title:'SYNTHETIC',url:'https://example.invalid/article'};
  const before = await count('audit');
  const results=await Promise.all(Array.from({length:20},()=>request('/api/v1/articles',{method:'POST',body,headers})));
  for(const r of results) assert.equal(r.status,201,JSON.stringify(r.body));
  assert.equal(new Set(results.map(r=>r.body.data.id)).size,1);
  assert.equal(await count('articles'),1);
  assert.equal(await count('idempotency'),1);
  assert.equal(await count('audit'),before+1);
  // Canonical object key order replays; different content conflicts.
  const reordered={url:body.url,title:body.title,account_id:body.account_id};
  assert.deepEqual((await request('/api/v1/articles',{method:'POST',body:reordered,headers})).body,results[0].body);
  assert.equal((await request('/api/v1/articles',{method:'POST',body:{...body,title:'changed'},headers})).status,409);
  assert.equal(await count('articles'),1);
  record('parallel_idempotency', { requests:20, committedBusinessRows:1, committedReceipts:1, committedAudits:1 });
});

test('global URL uniqueness failure rolls back the new receipt; same key can retry corrected input', async () => {
  const headers={...await login(),'Idempotency-Key':'duplicate-url'};
  const body={account_id:'fixture-account',title:'SYNTHETIC',url:'https://example.invalid/article'};
  const before = await count('audit');
  assert.equal((await request('/api/v1/articles',{method:'POST',body,headers})).status,409);
  assert.equal(await count('audit'),before);
  assert.equal(await q("SELECT * FROM matrix_idempotency WHERE key='duplicate-url'").first(),null);
  assert.equal((await request('/api/v1/articles',{method:'POST',body:{...body,url:'https://example.invalid/corrected'},headers})).status,201);
  record('uniqueness_error_has_no_partial_receipt_or_audit');
});

test('failure of the final audit statement rolls back the receipt and article', async () => {
  const headers={...await login(),'Idempotency-Key':'audit-fault'};
  const before={articles:await count('articles'),audit:await count('audit'),receipts:await count('idempotency')};
  await q("CREATE TRIGGER matrix_probe_audit_fault BEFORE INSERT ON matrix_audit WHEN NEW.action='article.created' BEGIN SELECT RAISE(ABORT,'synthetic audit fault'); END").run();
  try {
    const result=await request('/api/v1/articles',{method:'POST',headers,body:{account_id:'fixture-account',title:'SYNTHETIC',url:'https://example.invalid/audit-fault'}});
    assert.equal(result.status,500);
    assert.match(result.body.error.message,/synthetic audit fault/);
    assert.equal(await count('articles'),before.articles);
    assert.equal(await count('audit'),before.audit);
    assert.equal(await count('idempotency'),before.receipts);
  } finally { await q('DROP TRIGGER matrix_probe_audit_fault').run(); }
  record('final_audit_failure_rolls_back_business_and_receipt');
});

test('two competing version updates have one winner and one atomic guard failure', async () => {
  const row=await q('SELECT id FROM matrix_articles LIMIT 1').first();
  const before=await count('audit');
  const update = title => db.batch([
    q('UPDATE matrix_articles SET title=?,version=version+1 WHERE id=? AND version=1',title,row.id),
    q('INSERT INTO matrix_probe_guards VALUES(?,changes())',randomUUID()),
    q('INSERT INTO matrix_audit VALUES(?,?,?,?,?,?)',randomUUID(),'actor','article.updated',row.id,'{}','now'),
  ]);
  const results=await Promise.allSettled([update('winner-A'),update('winner-B')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.match(String(results.find(r=>r.status==='rejected').reason),/CHECK constraint failed/);
  assert.equal((await q('SELECT version FROM matrix_articles WHERE id=?',row.id).first()).version,2);
  assert.equal(await count('audit'),before+1);
  record('version_cas_guard_prevents_partial_audit');
});

test('D1 FK rejection rolls back preceding statements', async () => {
  const before=await count('audit');
  await assert.rejects(db.batch([
    q('INSERT INTO matrix_audit VALUES(?,?,?,?,?,?)','fk-audit','actor','test',null,'{}','now'),
    q('INSERT INTO matrix_observations VALUES(?,?,?,?,?,?,?,?,?)','bad-fk','missing','2026-10-15T00:00:00Z','2026-10-15T00:00:00Z','d1','{}','synthetic','','now'),
  ]),/FOREIGN KEY constraint failed/);
  assert.equal(await count('audit'),before);
  record('foreign_keys_enforced');
});

test('NULL account daily scope upserts once, article scope stays separate; missing and zero survive JSON/D1', async () => {
  const article=await q('SELECT id FROM matrix_articles LIMIT 1').first();
  const upsert=(id,articleId,metrics) => q("INSERT INTO matrix_daily_metrics VALUES(?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET metrics_json=excluded.metrics_json,updated_at=excluded.updated_at",id,'fixture-account',articleId,'2026-10-15',JSON.stringify(metrics),'synthetic','now').run();
  await upsert('overall-1',null,{reads:7});
  await upsert('overall-2',null,{reads:0});
  await upsert('article-day',article.id,{reads:99,likes:0});
  const rows=(await q('SELECT article_id,metrics_json FROM matrix_daily_metrics').all()).results;
  assert.equal(rows.length,2);
  const overall=JSON.parse(rows.find(r=>r.article_id===null).metrics_json);
  assert.equal(overall.reads,0);
  assert.equal(Object.hasOwn(overall,'likes'),false);
  const result=await q("SELECT json_extract(metrics_json,'$.reads') AS zero,json_extract(metrics_json,'$.likes') AS missing FROM matrix_daily_metrics WHERE article_id IS NULL").first();
  assert.deepEqual(result,{zero:0,missing:null});
  // Same account/day: account total wins, never 0 + 99.
  const authoritative=rows.find(r=>r.article_id===null) || rows.find(r=>r.article_id===article.id);
  assert.equal(JSON.parse(authoritative.metrics_json).reads,0);
  record('null_scope_unique_zero_distinct_from_missing', { accountDailyRows:1, articleDailyRows:1 });
});

test('cumulative observations select by as_of, retain collection time; no sum or false exact-day claim', async () => {
  const article=await q('SELECT id FROM matrix_articles LIMIT 1').first();
  for(const [id,asOf,collected,kind,metrics] of [
    ['snap-new','2026-10-15T08:00:00Z','2026-10-15T08:05:00Z','d3',{reads:100,likes:0}],
    ['snap-old','2026-10-14T08:00:00Z','2026-10-16T08:00:00Z','d1',{reads:30}],
  ]) await q('INSERT INTO matrix_observations VALUES(?,?,?,?,?,?,?,?,?)',id,article.id,asOf,collected,kind,JSON.stringify(metrics),'synthetic','','now').run();
  const latest=await q('SELECT * FROM matrix_observations WHERE article_id=? ORDER BY as_of DESC,created_at DESC,rowid DESC LIMIT 1',article.id).first();
  assert.equal(latest.id,'snap-new');
  assert.deepEqual(JSON.parse(latest.metrics_json),{reads:100,likes:0});
  assert.notEqual(latest.as_of,latest.collected_at);
  assert.equal(await count('observations'),2);
  record('cumulative_snapshot_order_and_missing_zero');
});

test('D1 sessions/bookmarks are consistency cursors; batch supplies a coherent multi-query read', async () => {
  const session=db.withSession('first-primary');
  const result=await session.batch([
    session.prepare('SELECT count(*) AS n FROM matrix_articles'),
    session.prepare('SELECT count(*) AS n FROM matrix_observations'),
  ]);
  assert.equal(result[0].results[0].n,2);
  assert.equal(result[1].results[0].n,2);
  const bookmark=session.getBookmark();
  assert.ok(bookmark===null || typeof bookmark==='string');
  record('d1_session_api', { bookmarkType:bookmark===null?'null':typeof bookmark, replicaSemanticsVerified:false });
});

test('withSession is not a frozen snapshot; read batch never tears a concurrent paired write', async () => {
  await q('CREATE TABLE matrix_probe_pair(name TEXT PRIMARY KEY,value INTEGER NOT NULL)').run();
  await db.batch([q("INSERT INTO matrix_probe_pair VALUES('left',0)"),q("INSERT INTO matrix_probe_pair VALUES('right',0)")]);
  const session=db.withSession('first-primary');
  const left=await session.prepare("SELECT value FROM matrix_probe_pair WHERE name='left'").first();
  await db.batch([q("UPDATE matrix_probe_pair SET value=1 WHERE name='left'"),q("UPDATE matrix_probe_pair SET value=1 WHERE name='right'")]);
  const right=await session.prepare("SELECT value FROM matrix_probe_pair WHERE name='right'").first();
  assert.equal(left.value,0);
  assert.equal(right.value,1); // Sequential consistency does not promise repeatable reads.
  const writers=[],readers=[];
  for(let i=0;i<30;i++) {
    writers.push(db.batch([
      q("UPDATE matrix_probe_pair SET value=? WHERE name='left'",i+2),
      q("UPDATE matrix_probe_pair SET value=? WHERE name='right'",i+2),
    ]));
    readers.push(db.batch([
      q("SELECT value FROM matrix_probe_pair WHERE name='left'"),
      q("SELECT value FROM matrix_probe_pair WHERE name='right'"),
    ]));
  }
  const [results]=await Promise.all([Promise.all(readers),Promise.all(writers)]);
  for(const pair of results) assert.equal(pair[0].results[0].value,pair[1].results[0].value);
  const observedVersions=new Set(results.map(pair=>pair[0].results[0].value)).size;
  assert.ok(observedVersions>1,'Readers must observe multiple committed versions to exercise interleaving');
  record('snapshot_boundary', { withSessionIsFrozenSnapshot:false, coherentReadBatches:30, concurrentAtomicWrites:30, observedVersions });
});

test('D1 bind(null) preserves NULL and bind(undefined) rejects an omitted field', async () => {
  assert.deepEqual(await q('SELECT ? AS unknown,? AS observed_zero',null,0).first(),{unknown:null,observed_zero:0});
  assert.throws(()=>q('SELECT ? AS value',undefined),/undefined|D1_TYPE_ERROR/i);
  record('explicit_null_and_undefined_binding');
});

test('expired or tampered session cannot access business data', async () => {
  const headers=await login();
  const token=headers.Cookie.split('=')[1];
  await q('UPDATE matrix_sessions SET expires_at=? WHERE token_hash=?','2000-01-01T00:00:00.000Z',digest(token)).run();
  assert.equal((await request('/api/v1/auth/me',{headers})).status,401);
  assert.equal((await request('/api/v1/auth/me',{headers:{Cookie:'matrix_session='+'f'.repeat(64)}})).status,401);
  record('expiry_and_tampering_rejected');
});

test('password rotation audit failure preserves the old hash and all sessions', async () => {
  const headers=await login();
  const before=await count('sessions');
  await q("CREATE TRIGGER matrix_probe_rotation_fault BEFORE INSERT ON matrix_audit WHEN NEW.action='auth.password_changed' BEGIN SELECT RAISE(ABORT,'synthetic rotation audit fault'); END").run();
  try {
    const result=await request('/api/v1/auth/password',{method:'PUT',headers,body:{currentPassword:password,newPassword:randomBytes(24).toString('hex')}});
    assert.equal(result.status,500);
    assert.equal((await q("SELECT password_hash FROM matrix_users WHERE id='fixture-user'").first()).password_hash,nodeHash);
    assert.equal(await count('sessions'),before);
    assert.equal((await request('/api/v1/auth/me',{headers})).status,200);
  } finally { await q('DROP TRIGGER matrix_probe_rotation_fault').run(); }
  record('rotation_final_audit_failure_rolls_back_hash_and_session_revocation');
});

test('password rotation invalidates all sessions; stale login proof cannot mint a new one', async () => {
  const headers=await login(), other=await login();
  const oldHash=(await q("SELECT password_hash FROM matrix_users WHERE id='fixture-user'").first()).password_hash;
  const nextPassword=randomBytes(24).toString('hex');
  const result=await request('/api/v1/auth/password',{method:'PUT',headers,body:{currentPassword:password,newPassword:nextPassword}});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(await count('sessions'),0);
  assert.equal((await request('/api/v1/auth/me',{headers:other})).status,401);
  const before=await count('audit');
  const stale=await request('/__probe/login-proof',{method:'POST',body:{id:'fixture-user',proof:oldHash}});
  assert.equal(stale.status,401,JSON.stringify(stale.body));
  assert.equal(await count('sessions'),0);
  assert.equal(await count('audit'),before);
  // Restore synthetic fixture for possible additional tests; never persist it.
  await q("UPDATE matrix_users SET password_hash=? WHERE id='fixture-user'",nodeHash).run();
  record('rotation_invalidates_sessions_and_stale_proof');
});
