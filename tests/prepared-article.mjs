import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ts from 'typescript';

// Real parser, credential inspection, SHA implementation and SQLite migrations.
// Storage is in-memory, and every network/event/provider boundary fails closed.
const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
const objects = new Map();
let writes = 0, mutations = 0, network = 0, events = 0, models = 0;
let failPut = false, failInsert = false, failAfterInsert = false;
const db = {prepare: statement => ({bind: (...values) => ({
 first: async () => sql.prepare(statement).get(...values) || null,
 all: async () => ({results: sql.prepare(statement).all(...values)}),
 run: async () => {
  if (failInsert) throw Error('synthetic insert failure');
  mutations++;
  const result = {meta: {changes: Number(sql.prepare(statement).run(...values).changes)}};
  if (failAfterInsert) throw Error('synthetic uncertain commit');
  return result;
 },
})})};
const bucket = {put: async (key, bytes, options) => {
 writes++;
 if (failPut) throw Error('synthetic storage failure');
 const copy = new Uint8Array(bytes);
 if (objects.has(key)) assert.deepEqual(copy, objects.get(key).bytes, 'concurrent retries must write identical bytes');
 objects.set(key, {bytes: copy, options});
}, delete: async () => {throw Error('must never delete a shared object');}};
const deniedEvent = () => {events++; throw Error('unexpected event');};
const modules = {};
function load(name) {
 if (modules[name]) return modules[name];
 const ex = {}; modules[name] = ex;
 const js = ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {exports: ex, crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Error, URL, Date, btoa, atob,
  fetch: url => {network++; if (String(url).includes('/messages')) models++; throw Error('network forbidden in offline tests');},
  require: n => n === './test-store' ? {db: () => db} : n === './articles' ? {bucket: () => bucket} :
   n === './events' ? {dispatch: deniedEvent, subscribe: deniedEvent} :
   n === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket, CLAUDE_CONFIG_KEY: btoa('01234567890123456789012345678901')}} :
   n.startsWith('./') ? load(n.slice(2)) : nativeRequire(n),
 }, {filename: 'lib/' + name + '.ts'});
 return ex;
}
const {registerPreparedArticle: register, preparedArticleTools} = load('prepared-article');
const hash = text => createHash('sha256').update(text).digest('hex');
const fixture = (extra = {}) => {
 const body = {title: '离线定稿：原文不改', paragraphs: Array.from({length: 25}, (_, i) => `${String(i).padStart(2, '0')} 原创电影评论，保留标点。${'证'.repeat(83)}`), confirm: true, ...extra};
 return {...body, expected_original_sha256: hash(JSON.stringify([body.title, ...body.paragraphs]))};
};
const idFor = (owner, value) => {
 const digest = hash(JSON.stringify(['approved-final-import-v1', owner, value.expected_original_sha256]));
 return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};
const row = id => sql.prepare('SELECT * FROM articles WHERE id=?').get(id);
const snapshot = () => JSON.stringify({rows: sql.prepare('SELECT * FROM articles ORDER BY id').all(), objects: [...objects].map(([key, value]) => [key, [...value.bytes]]), writes, mutations});
const noSideEffects = () => {assert.equal(network, 0); assert.equal(events, 0); assert.equal(models, 0);};
const tests = [];
const test = (name, fn) => tests.push({name, fn});
async function rejected(owner, input, pattern) {
 const before = snapshot();
 await assert.rejects(register(owner, input), pattern);
 assert.equal(snapshot(), before, 'invalid input must not change DB or storage');
 noSideEffects();
}

test('tool contract is bounded and explicit', () => {
 assert.equal(preparedArticleTools.length, 1);
 const tool = preparedArticleTools[0];
 assert.equal(tool.name, 'register_prepared_article');
 assert.equal(tool.inputSchema.additionalProperties, false);
 assert.equal(tool.inputSchema.properties.confirm.const, true);
 assert.equal(tool.inputSchema.properties.paragraphs.maxItems, 200);
 assert.equal(tool.annotations.openWorldHint, false);
});
test('exact title/body/hash and deterministic id persist without rewriting', async () => {
 const input = fixture(), original = JSON.stringify(input), result = await register('exact-owner', input);
 assert.equal(JSON.stringify(input), original);
 assert.equal(result.article_id, idFor('exact-owner', input));
 assert.match(result.article_id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(result.state, 'queued'); assert.equal(result.cached, false); assert.equal(result.read_only, false);
 assert.equal(result.original_sha256, input.expected_original_sha256);
 assert.equal(result.event_dispatched, false); assert.equal(result.model_request_sent, false);
 assert.equal(result.verification, 'legacy_unverified');
 const stored = row(result.article_id), texts = [input.title, ...input.paragraphs];
 assert.equal(stored.owner, 'exact-owner'); assert.equal(stored.title, input.title);
 assert.equal(stored.paragraphs, JSON.stringify(texts));
 assert.equal(hash(stored.paragraphs), input.expected_original_sha256);
 assert.equal(stored.source_key, `articles/${result.article_id}/source`);
 const object = objects.get(stored.source_key);
 assert.equal(new TextDecoder().decode(object.bytes), texts.join('\n'));
 assert.equal(object.options.httpMetadata.contentType, 'text/plain; charset=utf-8');
 assert.equal(stored.result_key, null); assert.equal(stored.draft_url, null);
 noSideEffects();
});
test('same owner replay is read-only and respects advanced state', async () => {
 const input = fixture(), first = await register('replay-owner', input);
 sql.prepare('UPDATE articles SET state=? WHERE id=?').run('word_ready', first.article_id);
 const before = snapshot(), next = await register('replay-owner', input);
 assert.equal(next.article_id, first.article_id); assert.equal(next.cached, true); assert.equal(next.read_only, true);
 assert.equal(next.state, 'word_ready'); assert.equal(snapshot(), before);
});
test('16 simultaneous imports produce one row and one logical source object', async () => {
 const input = fixture(), initialMutations = mutations;
 const results = await Promise.all(Array.from({length: 16}, () => register('concurrent-owner', input)));
 assert.equal(new Set(results.map(r => r.article_id)).size, 1);
 assert.equal(results.filter(r => !r.cached).length, 1);
 assert.equal(sql.prepare('SELECT count(*) n FROM articles WHERE owner=?').get('concurrent-owner').n, 1);
 assert.equal(objects.has(`articles/${results[0].article_id}/source`), true);
 assert.ok(mutations > initialMutations); noSideEffects();
});
test('identical content is isolated by owner; changed content gets distinct identity', async () => {
 const input = fixture(), a = await register('isolation-a', input), b = await register('isolation-b', input);
 assert.notEqual(a.article_id, b.article_id); assert.equal(b.cached, false);
 assert.notEqual(row(a.article_id).source_key, row(b.article_id).source_key);
 const next = await register('isolation-a', fixture({title: '独立的另一篇定稿'}));
 assert.notEqual(next.article_id, a.article_id); assert.equal(row(a.article_id).title, input.title);
});
for (const field of ['title', 'paragraphs', 'source_key', 'state']) test(`existing inconsistent ${field} is rejected without mutation`, async () => {
 const owner = 'corrupt-' + field, input = fixture(), result = await register(owner, input);
 sql.prepare(`UPDATE articles SET ${field}=? WHERE id=?`).run(field === 'state' ? 'deleting' : 'corrupted', result.article_id);
 await rejected(owner, input, /既有定稿记录不一致/);
});
for (const length of [1, 1999, 2000, 3000, 3001, 10000]) test(`already-made body ${length} characters is accepted without writing length targets`, async () => {
 const parts = Array.from({length: Math.ceil(length / 1000)}, (_, i) => '文'.repeat(Math.min(1000, length - i * 1000)));
 assert.equal((await register('boundary-' + length, fixture({paragraphs: parts}))).state, 'queued');
});

const finishedWordText = () => fixture({title: '  已完成Word的3141字离线回归  ',
 paragraphs: Array.from({length: 49}, (_, i) => `  ${String(i).padStart(2, '0')}：${'文'.repeat(i === 48 ? 66 : 61)}  `)});
test('49-paragraph 3141-character finished Word text is exact and replay stays read-only', async () => {
 const input = finishedWordText(), original = JSON.stringify(input), texts = [input.title, ...input.paragraphs];
 assert.equal(input.paragraphs.length, 49);
 assert.equal(input.paragraphs.join('').replace(/\s/g, '').length, 3141);
 const result = await register('finished-word-owner', input), stored = row(result.article_id);
 assert.equal(JSON.stringify(input), original);
 assert.equal(result.article_id, idFor('finished-word-owner', input));
 assert.equal(result.original_sha256, hash(JSON.stringify(texts)));
 assert.equal(stored.title, input.title); assert.equal(stored.paragraphs, JSON.stringify(texts));
 assert.equal(new TextDecoder().decode(objects.get(stored.source_key).bytes), texts.join('\n'));
 const before = snapshot(), replay = await register('finished-word-owner', input);
 assert.equal(replay.article_id, result.article_id); assert.equal(replay.cached, true); assert.equal(replay.read_only, true);
 assert.equal(snapshot(), before); noSideEffects();
});
test('significant whitespace, punctuation, and paragraph order remain exact', async () => {
 const input = fixture({title: '  原样标题  ', paragraphs: Array.from({length: 25}, (_, i) => `  ${i}：甲\t乙，${'文'.repeat(90)}  `)});
 const result = await register('whitespace-owner', input);
 assert.equal(row(result.article_id).paragraphs, JSON.stringify([input.title, ...input.paragraphs]));
});
const invalids = [
 ['null', null], ['array', []], ['string', 'bad'],
 ['missing confirm', {...fixture(), confirm: undefined}], ['false confirm', {...fixture(), confirm: false}], ['string confirm', {...fixture(), confirm: 'true'}],
 ['extra argument', {...fixture(), regenerate: true}], ['empty title', fixture({title: ' '})], ['long title', fixture({title: '文'.repeat(121)})],
 ['newline title', fixture({title: '标\n题'})], ['empty body', fixture({paragraphs: []})],
 ['non-string paragraph', {...fixture(), paragraphs: [null]}], ['blank paragraph', fixture({paragraphs: [' ', ...fixture().paragraphs]})],
 ['long paragraph', fixture({paragraphs: ['文'.repeat(1001), '文'.repeat(1000)]})],
 ['too many paragraphs', fixture({paragraphs: Array(201).fill('文'.repeat(10))})],
 ['newline paragraph', fixture({paragraphs: ['原\n文', ...fixture().paragraphs]})],
 ['carriage return paragraph', fixture({paragraphs: ['原\r文', ...fixture().paragraphs]})],
 ['text resource limit', fixture({paragraphs: Array(101).fill('文'.repeat(1000))})],
 ['missing hash', {...fixture(), expected_original_sha256: undefined}], ['wrong hash', {...fixture(), expected_original_sha256: '0'.repeat(64)}],
 ['uppercase hash', {...fixture(), expected_original_sha256: fixture().expected_original_sha256.toUpperCase()}],
 ['title mutated after hash', {...fixture(), title: '被改写的标题'}],
 ['body reordered after hash', {...fixture(), paragraphs: [...fixture().paragraphs].reverse()}],
 ['BOM would change parsed source', fixture({title: '\uFEFF标题'})],
];
for (const [name, input] of invalids) test(`invalid ${name} fails before writes`, () => rejected('invalid-owner', input));
test('empty owner fails before writes', () => rejected('', fixture()));
const unicode = text => [...text].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const syntheticSecret = 'sk-' + 'z'.repeat(32);
for (const [name, secret] of [
 ['generic key', syntheticSecret], ['escaped key', unicode(syntheticSecret)],
 ['nested escaped key', unicode(unicode('sk-' + 'z'.repeat(24)))],
 ['authorization', 'authorization=Bearer ' + 'A'.repeat(32)],
 ['JSON credential', JSON.stringify({password: 'A'.repeat(32)})],
 ['private key marker', '-----BEGIN PRIVATE KEY-----'], ['uninspectable escape', '\\uZZZZ'],
]) test(`credential ${name} is rejected with no persistence`, async () => {
 const input = fixture({paragraphs: [secret, '文'.repeat(1000), '文'.repeat(1000)]});
 await rejected('credential-owner', input);
});
test('credential in title is blocked', () => rejected('credential-owner', fixture({title: syntheticSecret})));
test('short final text still goes through credential protection', () => rejected('credential-owner', fixture({paragraphs: [syntheticSecret]})));
test('storage failure leaves no DB row; same import can retry', async () => {
 const input = fixture(); failPut = true;
 try {await assert.rejects(register('storage-failure', input), /synthetic storage failure/);} finally {failPut = false;}
 assert.equal(row(idFor('storage-failure', input)), undefined);
 assert.equal((await register('storage-failure', input)).cached, false);
});
test('failed DB insert preserves shared source and retry reuses exact identity', async () => {
 const input = fixture(); failInsert = true;
 try {await assert.rejects(register('db-failure', input), /synthetic insert failure/);} finally {failInsert = false;}
 const id = idFor('db-failure', input);
 assert.equal(row(id), undefined); assert.equal(objects.has(`articles/${id}/source`), true);
 assert.equal((await register('db-failure', input)).article_id, id);
});
test('uncertain successful commit is recovered read-only without duplicate', async () => {
 const input = fixture(); failAfterInsert = true;
 try {await assert.rejects(register('uncertain-commit', input), /synthetic uncertain commit/);} finally {failAfterInsert = false;}
 const before = snapshot(), result = await register('uncertain-commit', input);
 assert.equal(result.cached, true); assert.equal(snapshot(), before);
});
async function encryptedConfig(owner, secret) {
 const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('01234567890123456789012345678901'), {name: 'AES-GCM'}, false, ['encrypt']);
 const iv = crypto.getRandomValues(new Uint8Array(12));
 const data = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner)}, key, new TextEncoder().encode(secret));
 const encode = value => Buffer.from(value).toString('base64');
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run(owner, 'offline-model', JSON.stringify({iv: encode(iv), data: encode(data)}), '0', new Date().toISOString());
}
const unsafeFixture = secret => fixture({paragraphs: [secret, '文'.repeat(1000), '文'.repeat(1000)]});
test('actual owner helper rejects opaque configured keys, including escaped keys and disabled configs', async () => {
 const owner = 'opaque-owner', secret = 'opaque.Q9vN2mX7pR4tL6cZ';
 await encryptedConfig(owner, secret);
 for (const text of [secret, unicode(secret), unicode(unicode(secret))]) await rejected(owner, unsafeFixture(text), /安全校验/);
 await rejected(owner, fixture({title: secret}), /安全校验/);
 assert.equal((await register(owner, fixture())).state, 'queued');
 // The helper must not read another owner's key; this synthetic opaque string is ordinary prose to that owner.
 assert.equal((await register('unconfigured-other-owner', unsafeFixture(secret))).state, 'queued');
});
test('unreadable encrypted config fails closed, without storing text', async () => {
 sql.prepare('INSERT INTO claude_settings(owner,model,secret,enabled,updated) VALUES(?,?,?,?,?)').run('broken-config', 'offline-model', '{}', '0', new Date().toISOString());
 await rejected('broken-config', fixture());
});
for (const source of ['writing_runs', 'articles', 'article_deliveries']) test(`actual helper blocks ${source} owner token, uppercase and escaped variants`, async () => {
 const owner = 'token-' + source, token = 'abcdefab-cdef-4abc-abcd-abcdefabcdef', time = new Date().toISOString();
 let fixtureId;
 if (source === 'articles') {
  fixtureId = (await register(owner, fixture())).article_id;
  sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(token, fixtureId);
 } else if (source === 'writing_runs') {
  fixtureId = owner;
  sql.prepare('INSERT INTO writing_runs(id,owner,day,state,token,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?)').run(fixtureId, owner, '2026-10-05', 'writing', token, 'fixture-article', time, time);
 } else {
  fixtureId = owner;
  sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,updated) VALUES(?,?,?,?,?,?,?)').run(fixtureId, owner, 'fixture-article', 'toutiao', 'claimed', token, time);
 }
 try {
  for (const text of [token, token.toUpperCase(), unicode(token.toUpperCase())]) await rejected(owner, unsafeFixture(text), /安全校验/);
  assert.equal((await register('other-' + owner, unsafeFixture(token))).state, 'queued');
 } finally {
  if (source !== 'articles') sql.prepare(`DELETE FROM ${source} WHERE id=?`).run(fixtureId);
 }
});
test('no writing slots, paid attempts, events, or model requests are created', () => {
 for (const table of ['writing_runs', 'claude_attempts', 'manual_writing_batches']) assert.equal(sql.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
 noSideEffects();
});
// HTTP entrypoint exercises the real owner header reader and the same registration helper.
const routeExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/articles/prepared/route.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
 exports: routeExports, Request, Response, URL, TextEncoder,
 require: name => name.includes('/lib/') ? load(name.split('/').at(-1)) : nativeRequire(name),
});
const post = routeExports.POST;
const endpoint = 'https://prepared.example.test/api/articles/prepared';
const fixedError = {error: '导入未确认；请读取已有记录。不会重新写作、搜图或投递。'};
function request(body = fixture(), headers = {}, owner = 'http-owner') {
 const h = new Headers({'oai-authenticated-user-id': owner, origin: new URL(endpoint).origin, 'x-prepared-import': '1', 'content-type': 'application/json'});
 for (const [key, value] of Object.entries(headers)) value === null ? h.delete(key) : h.set(key, value);
 return new Request(endpoint, {method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body)});
}
async function httpRejected(req, status, expected) {
 const before = snapshot(), response = await post(req);
 assert.equal(response.status, status);
 if (typeof expected === 'string') assert.equal(await response.text(), expected);
 else {
  assert.deepEqual(await response.json(), expected);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
 }
 assert.equal(snapshot(), before); noSideEffects();
}
test('HTTP requires authenticated owner before reading request body', async () => {
 const req = request(fixture(), {'oai-authenticated-user-id': null});
 req.text = () => {throw Error('unauthenticated request body must not be read');};
 await httpRejected(req, 401, 'Unauthorized');
 await httpRejected(request(fixture(), {}, ''), 401, 'Unauthorized');
 await httpRejected(request(fixture(), {'oai-authenticated-user-id': null, 'oai-authenticated-user-email': 'user@example.test'}), 401, 'Unauthorized');
});
for (const [name, headers] of [
 ['missing origin', {origin: null}], ['cross-site origin', {origin: 'https://attacker.example.test'}],
 ['null origin', {origin: 'null'}], ['wrong port', {origin: 'https://prepared.example.test:8443'}],
 ['missing custom header', {'x-prepared-import': null}], ['wrong custom header', {'x-prepared-import': 'true'}],
]) test(`HTTP rejects ${name} before reading body`, async () => {
 const req = request(fixture(), headers);
 req.text = () => {throw Error('forbidden request body must not be read');};
 await httpRejected(req, 403, 'Forbidden');
});
test('HTTP normal import, helper replay and owner isolation have identical hashes and body', async () => {
 const input = fixture(), response = await post(request(input));
 assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
 const result = await response.json(), stored = row(result.article_id);
 assert.equal(result.article_id, idFor('http-owner', input));
 assert.equal(stored.owner, 'http-owner'); assert.equal(stored.paragraphs, JSON.stringify([input.title, ...input.paragraphs]));
 assert.equal(result.original_sha256, input.expected_original_sha256);
 assert.equal(result.event_dispatched, false); assert.equal(result.model_request_sent, false);
 const before = snapshot(), replay = await post(request(input));
 assert.equal((await replay.json()).cached, true); assert.equal(snapshot(), before);
 const direct = await register('http-owner', input); assert.equal(direct.article_id, result.article_id);
 const other = await post(request(input, {}, 'http-other-owner'));
 const otherResult = await other.json(); assert.equal(other.status, 200);
 assert.notEqual(otherResult.article_id, result.article_id); assert.equal(row(otherResult.article_id).owner, 'http-other-owner');
 noSideEffects();
});

test('HTTP accepts the finished 49-paragraph 3141-character text without shortening it', async () => {
 const input = finishedWordText(), original = JSON.stringify(input), response = await post(request(input, {}, 'http-finished-word'));
 assert.equal(response.status, 200);
 const result = await response.json(), stored = row(result.article_id);
 assert.equal(result.original_sha256, input.expected_original_sha256);
 assert.equal(stored.title, input.title); assert.equal(stored.paragraphs, JSON.stringify([input.title, ...input.paragraphs]));
 assert.equal(JSON.stringify(input), original); noSideEffects();
});
test('HTTP accepts exactly 40000 UTF-8 bytes and rejects 40001', async () => {
 const raw = JSON.stringify(fixture());
 const padded = raw + ' '.repeat(40000 - Buffer.byteLength(raw));
 assert.equal(Buffer.byteLength(padded), 40000);
 const response = await post(request(padded, {}, 'http-size-boundary'));
 assert.equal(response.status, 200);
 await httpRejected(request(padded + ' '), 413, 'Too large');
 // Character count is below the limit, but the Chinese UTF-8 body exceeds it.
 const multibyte = '文'.repeat(13334);
 assert.ok(multibyte.length < 40000); assert.ok(Buffer.byteLength(multibyte) > 40000);
 await httpRejected(request(multibyte), 413, 'Too large');
});
for (const [name, body] of [
 ['malformed JSON', '{invalid PRIVATE_SENTINEL'], ['JSON null', 'null'], ['JSON array', '[]'],
 ['unconfirmed import', {...fixture(), confirm: false}], ['incorrect hash', {...fixture(), expected_original_sha256: '0'.repeat(64)}],
 ['body owner override', {...fixture(), owner: 'other-owner'}], ['credential content', unsafeFixture(syntheticSecret)],
]) test(`HTTP ${name} returns only the fixed error`, () => httpRejected(request(body), 400, fixedError));
test('HTTP body read failure is sanitized', async () => {
 const req = request(); req.text = () => {throw Error('PRIVATE_BODY_READ_ERROR');};
 await httpRejected(req, 400, fixedError);
});
test('HTTP internal decryption failure is sanitized without writes', () => httpRejected(request(fixture(), {}, 'broken-config'), 400, fixedError));
test('HTTP uncertain commit returns fixed error; caller can read/replay without duplicate', async () => {
 failAfterInsert = true;
 let response;
 try {response = await post(request(fixture(), {}, 'http-uncertain'));} finally {failAfterInsert = false;}
 assert.equal(response.status, 400); assert.deepEqual(await response.json(), fixedError);
 assert.equal(response.headers.get('cache-control'), 'private, no-store');
 const before = snapshot(), replay = await post(request(fixture(), {}, 'http-uncertain'));
 assert.equal(replay.status, 200); assert.equal((await replay.json()).cached, true); assert.equal(snapshot(), before);
});
test('private page uses authenticated dynamic server rendering', () => {
 const source = fs.readFileSync('app/writing/import-prepared/page.tsx', 'utf8');
 assert.match(source, /dynamic\s*=\s*['"]force-dynamic['"]/);
 assert.match(source, /await requireChatGPTUser\(['"]\/writing\/import-prepared['"]\)/);
 assert.ok(source.indexOf('await requireChatGPTUser(') < source.indexOf('return <PreparedImport'));
});
test('form keeps explicit confirmation, bounded normal file input and no automated retries', () => {
 const source = fs.readFileSync('components/prepared-import.tsx', 'utf8');
 assert.match(source, /useRef\(false\)/);
 assert.match(source, /if\s*\(lock\.current\)\s*return/);
 assert.ok(source.indexOf('lock.current = true') < source.indexOf('await file.text()'));
 assert.match(source, /finally\s*\{lock\.current\s*=\s*false;\s*setBusy\(false\)/);
 assert.match(source, /name="file" type="file" accept="application\/json,\.json" required disabled=\{busy\}/);
 assert.match(source, /file\.size > 40000/);
 assert.match(source, /name="confirm" type="checkbox" required disabled=\{busy\}/);
 assert.match(source, /confirm:\s*data\.get\('confirm'\)\s*===\s*'on'/);
 assert.match(source, /type="submit" disabled=\{busy\}/);
 assert.match(source, /确认这份正文已经定稿，按原文登记/);
 assert.match(source, /不会重新写文、搜图或投递平台/);
 assert.match(source, /导入状态未知，请先查看任务列表。不会自动重试。/);
 assert.equal((source.match(/\bfetch\s*\(/g) || []).length, 1);
 assert.match(source, /fetch\('\/api\/articles\/prepared'/);
 assert.match(source, /'X-Prepared-Import': '1'/);
 assert.doesNotMatch(source, /setInterval|setTimeout|\bwhile\s*\(|\bfor\s*\(|\.submit\(|requestSubmit\(/);
});
test('HTTP and form regressions leave paid quota and network boundaries untouched', () => {
 for (const table of ['writing_runs', 'claude_attempts', 'manual_writing_batches']) assert.equal(sql.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
 noSideEffects();
});
let failures = 0;
for (const {name, fn} of tests) {
 try {await fn(); console.log('PASS ' + name);} catch (error) {failures++; console.error('FAIL ' + name + ': ' + error.message);}
}
console.log(`${tests.length - failures}/${tests.length} offline prepared-article tests passed; network=${network}, events=${events}, models=${models}`);
sql.close();
if (failures) process.exitCode = 1;
