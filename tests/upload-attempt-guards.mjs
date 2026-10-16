// Offline, synthetic fixtures only. No platform, provider, network or real article data.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {zipSync, strToU8} from 'fflate';

const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
let tick = Date.parse('2026-10-06T08:00:00.000Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [tick])); }
  static now() { return tick; }
}
const instant = () => new Clock().toISOString();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let beforeRun = null, afterRun = null, networkCalls = 0;
const db = {
  prepare: statement => ({bind: (...values) => ({
    first: async () => sql.prepare(statement).get(...values) || null,
    all: async () => ({results: sql.prepare(statement).all(...values)}),
    run: async () => {
      if (beforeRun) await beforeRun(statement, values);
      const result = {meta: {changes: Number(sql.prepare(statement).run(...values).changes)}};
      if (afterRun) await afterRun(statement, values, result);
      return result;
    },
  })}),
  batch: async statements => {
    sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const objects = new Map();
const bucket = {
  async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
  async delete(key) { objects.delete(key); },
  async head(key) { return objects.has(key) ? {size: objects.get(key).length} : null; },
  async list({prefix}) { return {truncated: false, objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({key, size: bytes.length}))}; },
  async get(key, options) {
    if (!objects.has(key)) return null;
    const original = objects.get(key);
    const bytes = options?.range ? original.slice(options.range.offset, options.range.offset + options.range.length) : original;
    return {arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), body: new ReadableStream({start(controller) { controller.enqueue(bytes); controller.close(); }})};
  },
};
const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const exports = {}; modules[name] = exports;
  const source = fs.readFileSync('lib/' + name + '.ts', 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code, {
    exports,
    require: name => name === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket}}
      : name.endsWith('?raw') ? {__esModule:true,default:fs.readFileSync('lib/'+name.slice(0,-4),'utf8')}
      : name.startsWith('./') ? load(name.slice(2)) : nativeRequire(name),
    crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Map, Error, URL, btoa, atob, Date: Clock, File, ReadableStream, Response, Request, AbortSignal, structuredClone, setTimeout, clearTimeout,
    fetch: () => { networkCalls++; throw Error('Network is forbidden in upload guard tests'); },
  });
  return exports;
}
const articles = load('articles'), tools = load('article-tools'), guards = load('article-upload-attempts'), wordManifest = load('article-manifest');
const images = [
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+A8AAQIBAEK+vGgAAAAASUVORK5CYII=',
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=',
].map(value => new Uint8Array(Buffer.from(value, 'base64')));
const imagePlan = images.map((bytes, index) => ({sha256: digest(bytes), source_url: 'https://example.com/synthetic-image-' + index, source_title: '离线合成配图' + index, after_paragraph: index === 0 ? 0 : 2}));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function word(title, paragraphs) {
  const body = [title, ...paragraphs].flatMap((text, paragraph) => [
    '<w:p><w:r><w:t xml:space="preserve">' + escape(text) + '</w:t></w:r></w:p>',
    ...imagePlan.flatMap((image, index) => image.after_paragraph === paragraph ? ['<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId' + index + '"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'] : []),
  ]).join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' + body + '</w:body></w:document>'),
    'word/_rels/document.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + images.map((_, index) => '<Relationship Id="rId' + index + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + index + '.png"/>').join('') + '</Relationships>'),
    'word/media/image0.png': images[0], 'word/media/image1.png': images[1],
  });
}
let sequence = 0;
async function fixture(label = 'fixture') {
  const owner = 'upload-owner-' + (++sequence), title = '100% 离线上传核验 ' + label, paragraphs = ['第一段合成正文，不能省略或替换。', '第二段合成正文，不能改变顺序。'];
  const created = await articles.createArticle(owner, new File([[title, ...paragraphs].join('\n')], label + '.txt'));
  const manifest = {contract_version: 1, author: 'synthetic', input_sha256: '1'.repeat(64), prompt_sha256: '2'.repeat(64), original_sha256: digest(JSON.stringify([title, ...paragraphs])), sources_sha256: digest('[]'), sources: [], frozen_at: instant(), layout: null};
  sql.prepare('UPDATE articles SET state=?,artifact_manifest=? WHERE id=?').run('queued', JSON.stringify(manifest), created.id);
  const claim = await tools.articleCall(owner, 'claim_article', {article_id: created.id});
  const base = {article_id: created.id, claim_token: claim.claim_token};
  const bytes = word(title, paragraphs), hash = digest(bytes);
  // This suite begins with an already-finalized synthetic Word. Word execution
  // grants/checkpoints are tested separately; never stub the upload guards to
  // replay the obsolete claim-only Word writer. Planning and OOXML validation
  // here use the real production functions, storage is this in-memory fixture.
  const planned = await wordManifest.planArticleImages(manifest, imagePlan, paragraphs.length + 1);
  const verification = await wordManifest.verifyWordManifest(planned, [title, ...paragraphs], bytes, hash);
  const outputId = crypto.randomUUID(), partKey = `articles/${created.id}/output/${outputId}/0-${hash}`, resultKey = `articles/${created.id}/result-${hash}.docx`;
  await bucket.put(partKey, bytes); await bucket.put(resultKey, bytes);
  const meta = {output_id:outputId,size:bytes.length,sha256:hash,chunks:1,bytes:bytes.length,parts:[{key:partKey,size:bytes.length,sha256:hash}],verification};
  sql.prepare('UPDATE articles SET artifact_manifest=?,result_key=?,result_meta=?,state=?,upload_guard_version=1 WHERE id=?').run(JSON.stringify(planned), resultKey, JSON.stringify(meta), 'word_ready', created.id);
  const result = {owner, id: created.id, title, paragraphs, bytes, hash, claim: claim.claim_token, base, account: guards.authorizedUploadAccounts.toutiao};
  assert.equal(sql.prepare('SELECT upload_guard_version FROM articles WHERE id=?').get(result.id).upload_guard_version, 1);
  return result;
}
const call = (fixture, name, args = {}) => tools.articleCall(fixture.owner, name, {article_id: fixture.id, ...args});
const attemptRow = (fixture, platform = 'toutiao') => sql.prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? AND platform=?').get(fixture.owner, fixture.id, platform);
const editor = platform => platform === 'zhihu' ? 'https://zhuanlan.zhihu.com/p/321/edit' : 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123';
function reserveArgs(fixture, platform = 'toutiao', claim = fixture.claim) {
  const account = guards.authorizedUploadAccounts[platform];
  return {platform, execution_claim: claim, mode: 'new_import', target_account: account, word_sha256: fixture.hash, word_size: fixture.bytes.length,
    preflight: {file: {absolute_path:'/mock/shared/已核验图文.docx',browser_session:'offline-browser-session',filename: '已核验图文.docx', visible_in_browser: true, sha256: fixture.hash, size: fixture.bytes.length, checked_at: instant()}, existing_drafts: {account, prior_submission: 'never_attempted', current_editor_url: platform === 'toutiao' ? 'https://mp.toutiao.com/profile_v4/graphic/publish' : 'https://zhuanlan.zhihu.com/write', editor_checked: true, draft_list_checked: true, matching_editor_urls: [], checked_at: instant()}}};
}
async function reserve(fixture, platform = 'toutiao', claim = fixture.claim) { return call(fixture, 'reserve_article_upload', reserveArgs(fixture, platform, claim)); }
async function consume(fixture, reservation, platform = 'toutiao', claim = fixture.claim) { return call(fixture, 'consume_article_upload', {platform, attempt_id: reservation.attempt.attempt_id, execution_claim: claim, target_account: guards.authorizedUploadAccounts[platform],file_confirmation:reserveArgs(fixture,platform,claim).preflight.file}); }
function receipt(fixture, platform = 'toutiao') {
  return {verification_method: 'agent_readback', word_sha256: fixture.hash, target_account: guards.authorizedUploadAccounts[platform], draft_url: editor(platform), independently_reopened: true, saved_indicator_observed: true, images_loaded: true,
    title: fixture.title, paragraphs: [...fixture.paragraphs], images: imagePlan.map((image, index) => ({reference_sha256: image.sha256, after_paragraph: image.after_paragraph, observed_url: 'https://image.example.com/synthetic-' + index + '.png'})),
    saved_at: instant(), reopened_at: instant(), read_at: instant(), ...(platform === 'zhihu' ? {cover: {loaded: true, reference_sha256: imagePlan[0].sha256, observed_url: 'https://image.example.com/synthetic-cover.png'}} : {})};
}
const record = (fixture, reservation, state, extra = {}, platform = 'toutiao') => call(fixture, 'record_article_upload', {platform,execution_claim: platform==='toutiao'?fixture.claim:sql.prepare('SELECT claim_token FROM article_deliveries WHERE article_id=? AND platform=?').get(fixture.id,platform)?.claim_token, attempt_id: reservation.attempt.attempt_id, state, ...extra});
async function started(label) { const fixture = await fixtureWithReservation(label); await consume(fixture, fixture.reservation); return fixture; }
async function fixtureWithReservation(label) { const item = await fixture(label); item.reservation = await reserve(item); return item; }
let cases = 0, failures = 0;
async function test(name, action) {
  try { await action(); cases++; console.log('PASS ' + name); }
  catch (error) { failures++; console.error('FAIL ' + name + '\n' + error.stack); }
  finally { beforeRun = null; afterRun = null; }
}

await test('runtime schemas expose a separate reservation, single-use consume and read-only recovery', async () => {
  const definitions = new Map(tools.articleTools.map(item => [item.name, item]));
  for (const name of ['read_article_upload', 'reserve_article_upload', 'consume_article_upload', 'record_article_upload']) assert.ok(definitions.has(name));
  assert.equal(definitions.get('read_article_upload').annotations.readOnlyHint, true);
  assert.ok(definitions.get('reserve_article_upload').inputSchema.required.includes('execution_claim'));
  assert.ok(definitions.get('consume_article_upload').inputSchema.required.includes('execution_claim'));
});

await test('old status tools cannot claim completed or saving without the new attempt receipt', async () => {
  const item = await fixture('status-bypass');
  await assert.rejects(call(item, 'record_article_status', {...item.base, state: 'completed', draft_url: editor('toutiao'), readback: receipt(item)}));
  await assert.rejects(call(item, 'record_article_status', {...item.base, state: 'toutiao_saving'}));
  const claim = await call(item, 'claim_article_delivery', {platform: 'zhihu'});
  assert.equal(claim.state, 'pending');
  await assert.rejects(call(item, 'record_article_delivery', {platform: 'zhihu', delivery_token: claim.delivery_token, state: 'saved', draft_url: editor('zhihu'), readback: receipt(item, 'zhihu')}));
  await assert.rejects(call(item, 'record_article_delivery', {platform: 'zhihu', delivery_token: claim.delivery_token, state: 'saving'}));
  assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(item.id).state, 'word_ready');
});

await test('preflight rejects missing visible DOCX, altered filename/hash/size, unchecked account and prior drafts without reserving', async () => {
  const item = await fixture('preflight');
  const changes = [
    value => { value.preflight.file.visible_in_browser = false; },
    value => { value.preflight.file.filename = 'unnamed'; },
    value => { value.preflight.file.filename = '.docx'; },
    value => { value.preflight.file.filename = '../draft.docx'; },
    value => { value.preflight.file.sha256 = '0'.repeat(64); },
    value => { value.preflight.file.size++; },
    value => { value.word_sha256 = '0'.repeat(64); },
    value => { value.word_size++; },
    value => { value.preflight.existing_drafts.account = 'different-account'; },
    value => { value.target_account = 'different-account'; value.preflight.existing_drafts.account = value.target_account; },
    value => { delete value.preflight.existing_drafts.prior_submission; },
    value => { delete value.preflight.existing_drafts.current_editor_url; },
    value => { value.preflight.existing_drafts.current_editor_url += '?token=synthetic-session'; },
    value => { value.preflight.existing_drafts.current_editor_url = 'https://evil.example/editor'; },
    value => { value.preflight.existing_drafts.prior_submission = 'submitted_unknown'; },
    value => { value.preflight.existing_drafts.prior_submission = 'verified_existing'; },
    value => { value.preflight.existing_drafts.editor_checked = false; },
    value => { value.preflight.existing_drafts.draft_list_checked = false; },
    value => { value.preflight.existing_drafts.matching_editor_urls = [editor('toutiao')]; },
    value => { value.preflight.file.checked_at = new Clock(tick - 16 * 60000).toISOString(); },
    value => { value.preflight.existing_drafts.checked_at = 'invalid'; },
    value => { value.execution_claim = 'wrong-claim'; },
  ];
  for (const mutate of changes) { const value = reserveArgs(item); mutate(value); await assert.rejects(call(item, 'reserve_article_upload', value)); assert.equal(attemptRow(item), undefined); }
  await assert.rejects(tools.articleCall('foreign-owner', 'reserve_article_upload', {article_id: item.id, ...reserveArgs(item)}));
  await assert.rejects(call(item, 'reserve_article_upload', {...reserveArgs(item), platform: 'baijiahao'}));
});

await test('stored Word bytes are checked independently of supplied SHA and size', async () => {
  const item = await fixture('word-bytes'), key = sql.prepare('SELECT result_key FROM articles WHERE id=?').get(item.id).result_key;
  const original = objects.get(key);
  objects.set(key, original.slice(0, -1));
  await assert.rejects(reserve(item));
  const changed = new Uint8Array(original); changed[changed.length - 1] ^= 1; objects.set(key, changed);
  await assert.rejects(reserve(item));
  objects.set(key, original);
  assert.equal(attemptRow(item), undefined);
  assert.equal((await reserve(item)).reserved, true);
});

await test('concurrent reservations and consumption grant exactly one instruction and bind account/file', async () => {
  const item = await fixture('concurrency');
  const reservations = await Promise.all([reserve(item), reserve(item)]);
  assert.equal(reservations.filter(result => result.reserved).length, 1);
  assert.ok(reservations.every(result => result.execute_import === false));
  assert.equal(reservations[0].attempt.attempt_id, reservations[1].attempt.attempt_id);
  assert.equal(reservations[0].attempt.preflight.existing_drafts.current_editor_url, 'https://mp.toutiao.com/profile_v4/graphic/publish');
  const reservation = reservations.find(result => result.reserved);
  const outcomes = await Promise.all([consume(item, reservation), consume(item, reservation)]);
  assert.equal(outcomes.filter(result => result.execute_import).length, 1);
  assert.equal((await consume(item, reservation)).execute_import, false);
  const changed = reserveArgs(item); changed.target_account = 'other-account'; changed.preflight.existing_drafts.account = changed.target_account; changed.preflight.file.filename = 'another-name.docx';
  const duplicate = await call(item, 'reserve_article_upload', changed);
  assert.equal(duplicate.reserved, false); assert.equal(duplicate.execute_import, false); assert.equal(duplicate.attempt.target_account, item.account);
  await assert.rejects(call(item, 'consume_article_upload', {platform: 'toutiao', execution_claim: item.claim, attempt_id: reservation.attempt.attempt_id, target_account: 'other-account'}));
  const raw = attemptRow(item); assert.ok(raw.claim_hash); assert.notEqual(raw.claim_hash, item.claim);
  const output = JSON.stringify(await call(item, 'read_article_upload', {platform: 'toutiao'}));
  assert.equal(output.includes(item.claim), false); assert.equal(output.includes(raw.claim_hash), false);
});

await test('a lost successful consume response never grants another import', async () => {
  const item = await fixtureWithReservation('lost-response');
  let dropped = false;
  afterRun = statement => { if (!dropped && statement.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'")) { dropped = true; throw Error('Synthetic lost response after commit'); } };
  await assert.rejects(consume(item, item.reservation), error => {
    assert.equal(error.message, '交付状态未确认，请只读取已有结果');
    assert.equal(JSON.stringify(error).includes('Synthetic lost response'), false);
    assert.deepEqual(JSON.parse(JSON.stringify(load('article-upload-consume-diagnostics').consumeUploadPublicDiagnostic(error))), {stage:'consume_cas',outcome:'unconfirmed',execute_import:false,next_action:'read_existing_record'});
    return true;
  }); afterRun = null;
  assert.equal(dropped, true); assert.equal(attemptRow(item).state, 'outcome_unknown'); assert.ok(attemptRow(item).consumed_at);
  assert.equal((await consume(item, item.reservation)).execute_import, false);
  assert.equal((await reserve(item)).reserved, false);
});

await test('unknown outcome, login interruption and claim renewal retain the consumed fence and editor URL', async () => {
  const item = await started('uncertain');
  await record(item, item.reservation, 'draft_observed', {editor_url: editor('toutiao')});
  await call(item, 'record_article_status', {...item.base, state: 'toutiao_saving', draft_url: editor('toutiao')});
  await record(item, item.reservation, 'outcome_unknown');
  await call(item, 'record_article_status', {...item.base, state: 'needs_login'});
  const renewed = await call(item, 'claim_article');
  assert.equal(renewed.claimed, true); assert.notEqual(renewed.claim_token, item.claim);
  assert.equal((await consume(item, item.reservation, 'toutiao', renewed.claim_token)).execute_import, false);
  const stored = attemptRow(item); assert.deepEqual(JSON.parse(stored.editor_urls), [editor('toutiao')]);
  assert.equal((await call(item, 'reserve_article_upload', {...reserveArgs(item, 'toutiao', renewed.claim_token), preflight: reserveArgs(item).preflight})).reserved, false);
  await assert.rejects(call(item, 'record_article_status', {claim_token: renewed.claim_token, state: 'failed'}));
});

await test('expired and rotated leases cannot consume an unconsumed reservation', async () => {
  for (const type of ['expired', 'rotated']) {
    const item = await fixtureWithReservation('lease-' + type);
    if (type === 'expired') sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Clock(tick - 1).toISOString(), item.id);
    else sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(crypto.randomUUID(), item.id);
    await assert.rejects(consume(item, item.reservation));
    const row = attemptRow(item); assert.equal(row.state, 'reserved'); assert.equal(row.consumed_at, null);
  }
  const item = await fixtureWithReservation('lease-renewed');
  sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Clock(tick - 1).toISOString(), item.id);
  const renewed = await call(item, 'claim_article');
  await assert.rejects(consume(item, item.reservation, 'toutiao', renewed.claim_token), /claim changed/);
});

await test('reservation and consumption CAS reject lease rotation between read and write', async () => {
  const reserveItem = await fixture('reserve-race'); let rotated = false;
  beforeRun = statement => { if (!rotated && statement.startsWith('INSERT OR IGNORE INTO article_upload_attempts')) { rotated = true; sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(crypto.randomUUID(), reserveItem.id); } };
  await assert.rejects(reserve(reserveItem)); beforeRun = null;
  assert.equal(rotated, true); assert.equal(attemptRow(reserveItem), undefined);
  const item = await fixtureWithReservation('consume-race'); rotated = false;
  beforeRun = statement => { if (!rotated && statement.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'")) { rotated = true; sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(crypto.randomUUID(), item.id); } };
  const denied = await consume(item, item.reservation); beforeRun = null;
  assert.equal(rotated, true); assert.equal(denied.execute_import, false); assert.equal(attemptRow(item).consumed_at, null);
});

await test('historical flag-zero results remain read-only and cannot authorize a new import', async () => {
  const item = await fixture('historical');
  sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(item.id);
  const before = JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
  await assert.rejects(reserve(item), /Historical|Owner confirmation/);
  await call(item, 'read_article'); await call(item, 'read_article_manifest'); await call(item, 'read_article_upload', {platform: 'toutiao'});
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)), before);
  assert.equal(attemptRow(item), undefined);
  sql.prepare('UPDATE articles SET state=?,draft_url=? WHERE id=?').run('completed', editor('toutiao'), item.id);
  const terminalBefore = JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
  await assert.rejects(call(item, 'reserve_article_upload', {...reserveArgs(item), mode: 'verify_existing'}));
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)), terminalBefore);
});

await test('explicit owner-confirmed never-submitted legacy work can get one first-import grant without resetting uncertainty', async () => {
  // This synthetic mode invocation represents explicit owner approval at the tool boundary.
  // The server validates its bound account/file/prior classification; it cannot infer a real chat approval.
  for (const state of ['word_ready', 'needs_verification', 'needs_login', 'failed']) {
    const item = await fixture('owner-confirmed-' + state);
    sql.prepare('UPDATE articles SET upload_guard_version=0,state=? WHERE id=?').run(state, item.id);
    const args = {...reserveArgs(item), mode: 'owner_confirmed_first_import', confirm_never_submitted:true};
    await assert.rejects(call(item,'reserve_article_upload',{...args,confirm_never_submitted:false}),/owner confirmation/);
    const reservation = await call(item, 'reserve_article_upload', args);
    assert.equal(reservation.reserved, true);
    assert.equal(attemptRow(item).authorization_kind, 'owner_confirmed_never_submitted');
    assert.equal((await consume(item, reservation)).execute_import, true);
    assert.equal((await consume(item, reservation)).execute_import, false);
    assert.equal((await call(item, 'reserve_article_upload', args)).reserved, false);
    assert.equal(sql.prepare('SELECT upload_guard_version FROM articles WHERE id=?').get(item.id).upload_guard_version, 0);
  }
  for (const kind of ['unknown', 'existing', 'wrong-account', 'prior-url']) {
    const item = await fixture('owner-confirmed-reject-' + kind);
    sql.prepare('UPDATE articles SET upload_guard_version=0,state=? WHERE id=?').run('needs_verification', item.id);
    const args = {...reserveArgs(item), mode: 'owner_confirmed_first_import', confirm_never_submitted:true};
    if (kind === 'unknown') args.preflight.existing_drafts.prior_submission = 'submitted_unknown';
    if (kind === 'existing') args.preflight.existing_drafts.prior_submission = 'verified_existing';
    if (kind === 'wrong-account') { args.target_account = 'other-account'; args.preflight.existing_drafts.account = args.target_account; }
    if (kind === 'prior-url') args.preflight.existing_drafts.matching_editor_urls = [editor('toutiao')];
    await assert.rejects(call(item, 'reserve_article_upload', args)); assert.equal(attemptRow(item), undefined);
  }
  const consumed = await started('owner-confirmation-cannot-reset');
  const args = {...reserveArgs(consumed), mode: 'owner_confirmed_first_import', confirm_never_submitted:true};
  assert.equal((await call(consumed, 'reserve_article_upload', args)).reserved, false);
  assert.equal((await consume(consumed, consumed.reservation)).execute_import, false);
});

await test('verify_existing accepts an old saved draft with a fresh reopen and never authorizes file submission', async () => {
  const item = await fixture('existing-draft');
  sql.prepare('UPDATE articles SET upload_guard_version=0,state=?,draft_url=? WHERE id=?').run('needs_verification', editor('toutiao'), item.id);
  const args = {...reserveArgs(item), mode: 'verify_existing'};
  args.preflight.existing_drafts.prior_submission = 'verified_existing';
  args.preflight.existing_drafts.matching_editor_urls = [editor('toutiao')];
  const reserved = await call(item, 'reserve_article_upload', args);
  assert.equal(reserved.reserved, true); assert.equal(reserved.attempt.state, 'outcome_unknown');
  assert.equal((await consume(item, reserved)).execute_import, false);
  const readback = receipt(item); readback.saved_at = new Clock(tick - 2 * 86400000).toISOString();
  await record(item, reserved, 'verified', {readback});
  assert.equal(attemptRow(item).state, 'verified'); assert.equal(attemptRow(item).consumed_at, null);
  assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(item.id).state, 'needs_verification');
});

await test('owner-confirmed first Zhihu import remains separate from historical completed Toutiao', async () => {
  const item = await fixture('legacy-zhihu');
  sql.prepare('UPDATE articles SET upload_guard_version=0,state=?,draft_url=? WHERE id=?').run('completed', editor('toutiao'), item.id);
  const original = JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
  const claim = await call(item, 'claim_article_delivery', {platform: 'zhihu'});
  sql.prepare('UPDATE article_deliveries SET state=? WHERE article_id=? AND owner=? AND platform=?').run('needs_verification', item.id, item.owner, 'zhihu');
  const args = {...reserveArgs(item, 'zhihu', claim.delivery_token), mode: 'owner_confirmed_first_import', confirm_never_submitted:true};
  const reserved = await call(item, 'reserve_article_upload', args);
  assert.equal((await consume(item, reserved, 'zhihu', claim.delivery_token)).execute_import, true);
  assert.equal((await consume(item, reserved, 'zhihu', claim.delivery_token)).execute_import, false);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)), original);
  assert.equal(attemptRow(item, 'toutiao'), undefined);
});

await test('exact title/body, image order/hash/anchors and independent saved/reopened evidence are mandatory', async () => {
  const item = await started('receipt-negative');
  const changes = [
    value => { value.title += ' altered'; },
    value => { value.paragraphs.pop(); },
    value => { value.paragraphs.push('extra'); },
    value => { value.paragraphs.reverse(); },
    value => { value.paragraphs[0] += ' '; },
    value => { value.word_sha256 = '0'.repeat(64); },
    value => { value.target_account = 'other-account'; },
    value => { value.images.pop(); },
    value => { value.images.reverse(); },
    value => { value.images[0].reference_sha256 = '0'.repeat(64); },
    value => { value.images[0].after_paragraph++; },
    value => { value.images[0].observed_url += '?token=synthetic-session'; },
    value => { value.independently_reopened = false; },
    value => { value.saved_indicator_observed = false; },
    value => { value.images_loaded = false; },
    value => { delete value.saved_at; },
    value => { delete value.reopened_at; },
    value => { value.saved_at = new Clock(tick - 1).toISOString(); },
    value => { value.reopened_at = new Clock(tick - 1).toISOString(); },
    value => { value.read_at = new Clock(tick - 1).toISOString(); },
    value => { value.read_at = new Clock(tick + 61000).toISOString(); },
  ];
  for (const mutate of changes) {
    const value = receipt(item); mutate(value); await assert.rejects(record(item, item.reservation, 'verified', {readback: value}));
    assert.equal(attemptRow(item).state, 'outcome_unknown'); assert.equal(attemptRow(item).readback, null);
  }
  await assert.rejects(call(item, 'record_article_status', {...item.base, state: 'completed', draft_url: editor('toutiao'), readback: receipt(item)}));
  assert.equal((await record(item, item.reservation, 'verified', {readback: receipt(item)})).recorded, true);
});

await test('full Toutiao completion then Zhihu pending/consume/verify/save works with mandatory cover', async () => {
  const item = await started('two-platform');
  await record(item, item.reservation, 'verified', {readback: receipt(item)});
  await call(item, 'record_article_status', {...item.base, state: 'completed', draft_url: editor('toutiao')});
  assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(item.id).state, 'completed');
  const claim = await call(item, 'claim_article_delivery', {platform: 'zhihu'}); assert.equal(claim.state, 'pending');
  const reserved = await reserve(item, 'zhihu', claim.delivery_token);
  assert.equal((await consume(item, reserved, 'zhihu', claim.delivery_token)).execute_import, true);
  for (const mutate of [value => { delete value.cover; }, value => { value.cover.loaded = false; }, value => { value.cover.reference_sha256 = '0'.repeat(64); }, value => { value.cover.observed_url += '?signature=private'; }]) {
    const value = receipt(item, 'zhihu'); mutate(value); await assert.rejects(record(item, reserved, 'verified', {readback: value}, 'zhihu'));
  }
  await record(item, reserved, 'verified', {readback: receipt(item, 'zhihu')}, 'zhihu');
  await call(item, 'record_article_delivery', {platform: 'zhihu', delivery_token: claim.delivery_token, state: 'saved', draft_url: editor('zhihu')});
  const read = await call(item, 'read_article_manifest');
  assert.equal(read.destinations.find(value => value.platform === 'toutiao').state, 'completed');
  assert.equal(read.destinations.find(value => value.platform === 'zhihu').state, 'saved');
  assert.equal(read.upload_attempts.find(value => value.platform === 'zhihu').readback.cover.loaded, true);
  assert.equal((await consume(item, reserved, 'zhihu', claim.delivery_token)).execute_import, false);
  assert.equal((await call(item, 'claim_article_delivery', {platform: 'zhihu'})).claimed, false);
  assert.equal(JSON.stringify(read).includes(claim.delivery_token), false);
});

await test('authorized source cleanup retains immutable digest and supports later Zhihu verification', async () => {
  const item = await started('cleaned-source');
  await record(item, item.reservation, 'verified', {readback: receipt(item)});
  await call(item, 'record_article_status', {...item.base, state: 'completed', draft_url: editor('toutiao')});
  await call(item, 'cleanup_article_workfiles', {expected_word_sha256: item.hash, confirm_permanent: true});
  assert.equal(sql.prepare('SELECT paragraphs FROM articles WHERE id=?').get(item.id).paragraphs, '[]');
  const claim = await call(item, 'claim_article_delivery', {platform: 'zhihu'});
  const reserved = await reserve(item, 'zhihu', claim.delivery_token);
  assert.equal((await consume(item, reserved, 'zhihu', claim.delivery_token)).execute_import, true);
  await record(item, reserved, 'verified', {readback: receipt(item, 'zhihu')}, 'zhihu');
  await call(item, 'record_article_delivery', {platform: 'zhihu', delivery_token: claim.delivery_token, state: 'saved', draft_url: editor('zhihu')});
  assert.equal(attemptRow(item, 'zhihu').state, 'verified');
});

await test('editor URLs reject credentials, unknown paths/queries, duplicate identities and fragments', async () => {
  assert.equal(guards.uploadEditorUrl('toutiao', editor('toutiao')), editor('toutiao'));
  assert.equal(guards.uploadEditorUrl('zhihu', editor('zhihu')), editor('zhihu'));
  for (const url of ['https://mp.toutiao.com/other?pgc_id=123', editor('toutiao') + '&pgc_id=456', editor('toutiao') + '&token=secret', editor('toutiao') + '#private', 'https://secret@mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123', 'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=opaque-key', 'http://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123']) assert.throws(() => guards.uploadEditorUrl('toutiao', url));
  for (const url of [editor('zhihu') + '?token=secret', editor('zhihu') + '#private', 'https://zhuanlan.zhihu.com/p/not-numeric/edit', 'https://evil.example/p/321/edit']) assert.throws(() => guards.uploadEditorUrl('zhihu', url));
});

await test('current and other owner-known lease credentials including percent-encoded paths are not persisted', async () => {
  const item = await started('credential-path');
  const otherLease = '11223344-5566-4778-8990-112233445566';
  sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,updated) VALUES(?,?,?,?,?,?,?)').run('known-lease-' + sequence, item.owner, 'synthetic-other-article', 'zhihu', 'failed', otherLease, instant());
  const encode = text => [...text].map(char => '%' + char.charCodeAt(0).toString(16)).join('');
  for (const token of [item.claim, otherLease, otherLease.toUpperCase(), encode(item.claim), encode(otherLease), encode(encode(otherLease))]) {
    const value = receipt(item); value.images[0].observed_url = 'https://image.example.com/' + token;
    await assert.rejects(record(item, item.reservation, 'verified', {readback: value}), /credential/);
    assert.equal(attemptRow(item).readback, null);
  }
  const quoted = receipt(item); quoted.images[0].observed_url = 'https://image.example.com/' + encode(otherLease); quoted.extra = 'malformed%ZZ';
  await assert.rejects(record(item, item.reservation, 'verified', {readback: quoted}), /credential/);
  const generic = receipt(item); generic.images[0].observed_url = 'https://image.example.com/sk-proj-' + 'Q'.repeat(32);
  await assert.rejects(record(item, item.reservation, 'verified', {readback: generic}), /credential/);
  assert.equal(attemptRow(item).state, 'outcome_unknown');
});

await test('concurrent editor observations use CAS and retain both real URLs after read-only reconciliation', async () => {
  const item = await started('editor-cas'), first = editor('toutiao'), second = first.replace('123', '456');
  const outcomes = await Promise.allSettled([record(item, item.reservation, 'draft_observed', {editor_url: first}), record(item, item.reservation, 'draft_observed', {editor_url: second})]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
  const existing = JSON.parse(attemptRow(item).editor_urls); const missing = existing.includes(first) ? second : first;
  await record(item, item.reservation, 'draft_observed', {editor_url: missing});
  assert.deepEqual(new Set(JSON.parse(attemptRow(item).editor_urls)), new Set([first, second]));
  assert.equal((await consume(item, item.reservation)).execute_import, false);
});

await test('verified receipts are terminal and the editor URL history cannot exceed its bound', async () => {
  const item = await started('terminal-readback');
  await record(item, item.reservation, 'verified', {readback: receipt(item)});
  const before = JSON.stringify(attemptRow(item));
  await assert.rejects(record(item, item.reservation, 'outcome_unknown'));
  const different = receipt(item); different.draft_url = different.draft_url.replace('123', '999');
  await assert.rejects(record(item, item.reservation, 'verified', {readback: different}));
  assert.equal((await record(item, item.reservation, 'verified', {readback: receipt(item)})).cached, true);
  assert.equal(JSON.stringify(attemptRow(item)), before);
  const bounded = await started('bounded-urls');
  for (let index = 0; index < 20; index++) await record(bounded, bounded.reservation, 'draft_observed', {editor_url: editor('toutiao').replace('123', String(1000 + index))});
  const boundedBefore = JSON.stringify(attemptRow(bounded));
  await assert.rejects(record(bounded, bounded.reservation, 'verified', {readback: receipt(bounded)}), /Too many/);
  assert.equal(JSON.stringify(attemptRow(bounded)), boundedBefore);
});

await test('a stale reservation fails closed without clearing the durable fence', async () => {
  const item = await fixtureWithReservation('stale-preflight');
  tick += 16 * 60000;
  await assert.rejects(consume(item, item.reservation), /Fresh browser evidence/);
  assert.equal(attemptRow(item).state, 'reserved'); assert.equal(attemptRow(item).consumed_at, null);
  const replay = await reserve(item); assert.equal(replay.reserved, false); assert.equal(replay.attempt.attempt_id, item.reservation.attempt.attempt_id);
});

assert.equal(networkCalls, 0);
console.log(`${cases} upload guard groups passed; ${failures} failed; real SQLite migrations and mock R2; network/platform/provider calls=0.`);
if (failures) process.exitCode = 1;
