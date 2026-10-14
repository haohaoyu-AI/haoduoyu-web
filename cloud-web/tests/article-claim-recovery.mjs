// Offline, synthetic fixtures only. No platform, provider, network or real article data.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {zipSync, strToU8,zlibSync} from 'fflate';
import {png} from './word-recovery-artifact-fixture.mjs';

const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
// Start at the actual DB clock; fixed past dates incorrectly fail the live SQL lease fence.
let tick = Date.now();
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
    require: name => name.endsWith('?raw') ? {__esModule:true,default:fs.readFileSync('lib/'+name.slice(0,-4),'utf8')} : name === 'cloudflare:workers' ? {env: {DB: db, BUCKET: bucket}} : name.startsWith('./') ? load(name.slice(2)) : nativeRequire(name),
    crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Map, Error, URL, btoa, atob, Date: Clock, File, ReadableStream, Response, Request, AbortSignal, setTimeout, clearTimeout,
    fetch: () => { networkCalls++; throw Error('Network is forbidden in upload guard tests'); },
  });
  return exports;
}
const articles = load('articles'), tools = load('article-tools'), guards = load('article-upload-attempts');
const rasterOne=png(),compressed=zlibSync(Uint8Array.from([0,0,0,255])),idat=Buffer.alloc(compressed.length+12);idat.writeUInt32BE(compressed.length);idat.write('IDAT',4);idat.set(compressed,8);let crc=0xffffffff;for(const byte of idat.subarray(4,-4)){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0);}idat.writeUInt32BE((crc^0xffffffff)>>>0,idat.length-4);
const images=[rasterOne,Buffer.concat([rasterOne.subarray(0,33),idat,rasterOne.subarray(-12)])];
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
async function cacheArtifact(owner,base,bytes,kind,metadata={}){
 const checkpoint={target_kind:'article',target_id:base.article_id,claim_token:base.claim_token,execution_token:base.execution_token,input_sha256:digest(sql.prepare('SELECT paragraphs FROM articles WHERE id=?').get(base.article_id).paragraphs),asset_id:crypto.randomUUID()};
 const recovery=load('word-recovery');await recovery.checkpointCall(owner,'begin_word_checkpoint',{...checkpoint,kind,size:bytes.length,sha256:digest(bytes),chunks:1,metadata});await recovery.checkpointCall(owner,'put_word_checkpoint_chunk',{...checkpoint,index:0,data_base64:Buffer.from(bytes).toString('base64')});await recovery.checkpointCall(owner,'finalize_word_checkpoint',checkpoint);
}
async function grantedBase(owner,articleId,claimToken){
 const raw=sql.prepare('SELECT paragraphs FROM articles WHERE id=?').get(articleId).paragraphs,executionToken=crypto.randomUUID();
 const granted=await load('word-recovery').wordRecoveryCall(owner,'acquire_word_execution',{target_kind:'article',target_id:articleId,claim_token:claimToken,input_sha256:digest(raw),execution_token:executionToken,execution_id:crypto.randomUUID(),request_key:crypto.randomUUID(),execution_scope:'heavy'});assert.equal(granted.acquired,true);
 return {article_id:articleId,claim_token:claimToken,execution_token:executionToken};
}
let sequence = 0;
async function fixture(label = 'fixture', pending=false) {
  const owner = 'upload-owner-' + (++sequence), title = '100% 离线上传核验 ' + label, paragraphs = ['第一段合成正文，不能省略或替换。', '第二段合成正文，不能改变顺序。'];
  const created = await articles.createArticle(owner, new File([[title, ...paragraphs].join('\n')], label + '.txt'));
  const manifest = {contract_version: 1, author: 'synthetic', input_sha256: '1'.repeat(64), prompt_sha256: '2'.repeat(64), original_sha256: digest(JSON.stringify([title, ...paragraphs])), sources_sha256: digest('[]'), sources: [], frozen_at: instant(), layout: null};
  sql.prepare('UPDATE articles SET state=?,artifact_manifest=? WHERE id=?').run('queued', JSON.stringify(manifest), created.id);
  const claim = await tools.articleCall(owner, 'claim_article', {article_id: created.id});
  const base = await grantedBase(owner,created.id,claim.claim_token);
  for(let index=0;index<images.length;index++)await cacheArtifact(owner,base,images[index],'image',{source_url:imagePlan[index].source_url,source_title:imagePlan[index].source_title,after_paragraph:imagePlan[index].after_paragraph});
  await tools.articleCall(owner, 'record_article_images', {...base, images: imagePlan});
  const bytes = word(title, paragraphs), hash = digest(bytes);
  await cacheArtifact(owner,base,bytes,'word');
  const upload = await tools.articleCall(owner, 'begin_article_output', {...base, size: bytes.length, sha256: hash, chunks: pending?2:1});
  if(!pending)await tools.articleCall(owner, 'put_article_output_chunk', {...base, output_id: upload.output_id, index: 0, data_base64: Buffer.from(bytes).toString('base64')});
  if(!pending)await tools.articleCall(owner, 'finalize_article_output', {...base, output_id: upload.output_id});
  const result = {owner, id: created.id, title, paragraphs, bytes, hash, claim: claim.claim_token, base, output_id:upload.output_id, account: guards.authorizedUploadAccounts.toutiao};
  assert.equal(sql.prepare('SELECT upload_guard_version FROM articles WHERE id=?').get(result.id).upload_guard_version, pending?0:1);
  return result;
}
async function preparedFixture(label){
 const owner='prepared-owner-'+(++sequence),title='离线用户确认定稿 '+label,paragraphs=Array.from({length:4},(_,index)=>'第'+index+'段'+('已核实原文内容。'.repeat(70)));
 const originalHash=digest(JSON.stringify([title,...paragraphs])),created=await load('prepared-article').registerPreparedArticle(owner,{title,paragraphs,expected_original_sha256:originalHash,confirm:true});
 const claim=await tools.articleCall(owner,'claim_article',{article_id:created.article_id}),base=await grantedBase(owner,created.article_id,claim.claim_token),bytes=word(title,paragraphs),hash=digest(bytes);
 for(let index=0;index<images.length;index++)await cacheArtifact(owner,base,images[index],'image',{source_url:imagePlan[index].source_url,source_title:imagePlan[index].source_title,after_paragraph:imagePlan[index].after_paragraph});await tools.articleCall(owner,'record_article_images',{...base,images:imagePlan});await cacheArtifact(owner,base,bytes,'word');
 const output=await tools.articleCall(owner,'begin_article_output',{...base,size:bytes.length,sha256:hash,chunks:1});await tools.articleCall(owner,'put_article_output_chunk',{...base,output_id:output.output_id,index:0,data_base64:Buffer.from(bytes).toString('base64')});await tools.articleCall(owner,'finalize_article_output',{...base,output_id:output.output_id});
 // Explicit historical compatibility fixture: current APIs validated the bytes,
 // then model the old persisted prepared-output shape without a layout receipt.
 const historical=JSON.parse(sql.prepare('SELECT result_meta FROM articles WHERE id=?').get(created.article_id).result_meta);delete historical.verification;
 sql.prepare('UPDATE articles SET artifact_manifest=NULL,result_meta=? WHERE id=?').run(JSON.stringify(historical),created.article_id);
 return {owner,id:created.article_id,title,paragraphs,bytes,hash,claim:claim.claim_token,base,output_id:output.output_id};
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

const recoveryArgs = (item, preview, platform='toutiao') => ({platform,expected_lease_fingerprint:preview.lease_fingerprint,confirm_article_id:item.id,confirm_prior_executor_ended:true,confirm_read_only_recovery:true,confirm_existing_results_checked:true});

await test('current holder can explicitly hand off untouched word_ready without disclosing a token',async()=>{
 const item=await fixture('handoff');
 await assert.rejects(tools.articleCall('wrong-owner','release_article_word_claim',item.base));
 await assert.rejects(call(item,'release_article_word_claim',{claim_token:'missing'}));
 const output=await call(item,'release_article_word_claim',item.base);
 assert.equal(output.released,true);assert.equal(JSON.stringify(output).includes(item.claim),false);
 await assert.rejects(call(item,'record_article_status',{...item.base,state:'needs_login'}));
 const next=await call(item,'claim_article');assert.equal(next.claimed,true);assert.notEqual(next.claim_token,item.claim);
 assert.equal((await call(item,'claim_article')).claimed,false);
 assert.equal((await call(item,'read_article')).state,'word_ready');
});
await test('stage handoff cannot release a reserved, consumed or destination-claimed task',async()=>{
 const reserved=await fixtureWithReservation('reserved-release');await assert.rejects(call(reserved,'release_article_word_claim',reserved.base));
 await consume(reserved,reserved.reservation);await assert.rejects(call(reserved,'release_article_word_claim',reserved.base));
 const delivered=await fixture('claimed-delivery');await call(delivered,'claim_article_delivery',{platform:'zhihu'});await assert.rejects(call(delivered,'release_article_word_claim',delivered.base));
 assert.equal((await call(reserved,'read_article')).state,'word_ready');
});
await test('preview is read-only and confirmation binds exact task, current lease and checked results',async()=>{
 const item=await fixture('confirmation');const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
 const preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 assert.equal(preview.new_upload_allowed,false);assert.equal(preview.word.sha256,item.hash);
 assert.equal(JSON.stringify(preview).includes(item.claim),false);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),before);
 for(const key of ['confirm_prior_executor_ended','confirm_read_only_recovery','confirm_existing_results_checked']){
  const args=recoveryArgs(item,preview);delete args[key];await assert.rejects(call(item,'recover_article_claim',args),/confirmation/);
 }
 await assert.rejects(call(item,'recover_article_claim',{...recoveryArgs(item,preview),confirm_article_id:crypto.randomUUID()}));
 await assert.rejects(call(item,'recover_article_claim',{...recoveryArgs(item,preview),expected_lease_fingerprint:'a'.repeat(64)}));
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),before);
});
await test('confirmed recovery rotates a lost token and transactionally fences its reserved permission',async()=>{
 const item=await fixtureWithReservation('lost-claim');const preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview));
 assert.equal(recovered.old_claim_fenced,true);assert.equal(recovered.new_upload_allowed,false);assert.notEqual(recovered.claim_token,item.claim);
 assert.equal((await call(item,'read_article')).state,'needs_verification');assert.equal(attemptRow(item).state,'outcome_unknown');
 await assert.rejects(call(item,'record_article_status',{...item.base,state:'needs_login'}));
 assert.equal((await consume(item,item.reservation)).execute_import,false);
 assert.equal((await consume(item,item.reservation,'toutiao',recovered.claim_token)).execute_import,false);
 const retry=await reserve(item);assert.equal(retry.reserved,false);
 await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview)),/changed/);
 await record(item,item.reservation,'verified',{execution_claim:recovered.claim_token,readback:receipt(item)});
 await call(item,'record_article_status',{claim_token:recovered.claim_token,state:'completed',draft_url:editor('toutiao')});
});
await test('simultaneous owner-confirmed recoveries rotate once, never share two live claims',async()=>{
 const item=await fixture('recovery-race'),preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 const outcomes=await Promise.allSettled([call(item,'recover_article_claim',recoveryArgs(item,preview)),call(item,'recover_article_claim',recoveryArgs(item,preview))]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
});
await test('an upload consumed after preview invalidates recovery instead of racing a live attempt',async()=>{
 const item=await fixtureWithReservation('preview-race');const preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 await consume(item,item.reservation);
 await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview)),/changed/);
 assert.equal(sql.prepare('SELECT claim_token FROM articles WHERE id=?').get(item.id).claim_token,item.claim);
});
await test('the recovery transaction rolls back token rotation if attempt fencing fails',async()=>{
 const item=await fixtureWithReservation('rollback'),preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 beforeRun=async statement=>{if(statement.startsWith('UPDATE article_upload_attempts SET'))throw Error('Synthetic transaction failure');};
 await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview)),/Synthetic/);beforeRun=null;
 assert.equal(sql.prepare('SELECT claim_token FROM articles WHERE id=?').get(item.id).claim_token,item.claim);
 assert.equal(attemptRow(item).state,'reserved');
});
await test('Zhihu recovery is scoped independently and does not reopen a completed Toutiao result',async()=>{
 const item=await started('zhihu-recovery');await record(item,item.reservation,'verified',{readback:receipt(item)});
 await call(item,'record_article_status',{...item.base,state:'completed',draft_url:editor('toutiao')});
 const delivery=await call(item,'claim_article_delivery',{platform:'zhihu'});
 const reservation=await reserve(item,'zhihu',delivery.delivery_token);
 const mainBefore=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
 const preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
 assert.equal(JSON.stringify(preview).includes(delivery.delivery_token),false);
 const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu'));
 assert.equal(recovered.platform,'zhihu');assert.notEqual(recovered.delivery_token,delivery.delivery_token);
 assert.equal(attemptRow(item,'zhihu').state,'outcome_unknown');assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),mainBefore);
 assert.equal((await consume(item,reservation,'zhihu',delivery.delivery_token)).execute_import,false);
 await record(item,reservation,'verified',{readback:receipt(item,'zhihu')},'zhihu');
 await call(item,'record_article_delivery',{platform:'zhihu',delivery_token:recovered.delivery_token,state:'saved',draft_url:editor('zhihu')});
 const terminal=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
 await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,terminal,'zhihu')),/Terminal/);
});
await test('untouched Zhihu pending lease recovers independently beside a consumed unknown Toutiao upload',async()=>{
 const item=await started('zhihu-pending-other-unknown');await call(item,'record_article_status',{...item.base,state:'toutiao_saving'});
 const delivery=await call(item,'claim_article_delivery',{platform:'zhihu'});assert.equal(delivery.state,'pending');
 tick+=6*3600000+1; // Both six-hour credentials are lost/expired; only this destination is recovered.
 const mainBefore=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),toutiaoBefore=JSON.stringify(attemptRow(item)),objectsBefore=objects.size;
 const preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
 assert.equal(preview.recovery_scope,'platform_pending_only');assert.equal(preview.new_upload_allowed,false);assert.equal(JSON.stringify(preview).includes(delivery.delivery_token),false);
 for(const key of ['confirm_prior_executor_ended','confirm_read_only_recovery','confirm_existing_results_checked']){const args=recoveryArgs(item,preview,'zhihu');args[key]=false;await assert.rejects(call(item,'recover_article_claim',args),/confirmation/);}
 const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu'));
 assert.equal(recovered.state,'pending');assert.equal(recovered.recovery_scope,'platform_pending_only');assert.equal(recovered.new_upload_allowed,false);assert.equal(recovered.old_claim_fenced,true);assert.notEqual(recovered.delivery_token,delivery.delivery_token);
 assert.equal(attemptRow(item,'zhihu'),undefined);assert.equal(JSON.stringify(attemptRow(item)),toutiaoBefore);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),mainBefore);assert.equal(objects.size,objectsBefore);
 await assert.rejects(reserve(item,'zhihu',delivery.delivery_token),/claim/);
 const reservation=await reserve(item,'zhihu',recovered.delivery_token);assert.equal(reservation.reserved,true);assert.equal(reservation.execute_import,false);assert.equal((await reserve(item,'zhihu',recovered.delivery_token)).reserved,false);
 await assert.rejects(consume(item,reservation,'zhihu',delivery.delivery_token),/claim/);
 const grants=await Promise.all([consume(item,reservation,'zhihu',recovered.delivery_token),consume(item,reservation,'zhihu',recovered.delivery_token)]);assert.equal(grants.filter(grant=>grant.execute_import).length,1);
 assert.equal((await consume(item,reservation,'zhihu',recovered.delivery_token)).execute_import,false);assert.equal((await reserve(item,'zhihu',recovered.delivery_token)).reserved,false);
 assert.equal(JSON.stringify(attemptRow(item)),toutiaoBefore);assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM article_upload_attempts WHERE article_id=? AND platform='zhihu'").get(item.id).count,1);
 const hashes=sql.prepare('SELECT sha256 FROM article_claim_credential_hashes WHERE owner=?').all(item.owner).map(row=>row.sha256);assert.ok(hashes.includes(digest(delivery.delivery_token)));assert.ok(hashes.includes(digest(recovered.delivery_token)));
});
await test('Zhihu historical evidence never becomes pending-only even without a current attempt',async()=>{
 for(const [label,change] of [
  ['reserved-attempt',async(item,delivery)=>{await reserve(item,'zhihu',delivery.delivery_token);}],
  ['consumed-unknown',async(item,delivery)=>{const reservation=await reserve(item,'zhihu',delivery.delivery_token);await consume(item,reservation,'zhihu',delivery.delivery_token);}],
  ['draft-url',async item=>{sql.prepare("UPDATE article_deliveries SET draft_url=? WHERE article_id=? AND platform='zhihu'").run(editor('zhihu'),item.id);}],
  ['readback',async item=>{sql.prepare("UPDATE article_deliveries SET readback=? WHERE article_id=? AND platform='zhihu'").run(JSON.stringify(receipt(item,'zhihu')),item.id);}],
  ['history-message',async item=>{sql.prepare("UPDATE article_deliveries SET message=? WHERE article_id=? AND platform='zhihu'").run('Synthetic previous platform activity',item.id);}],
  ...['saving','needs_verification','needs_login','failed'].map(state=>[state,async item=>{sql.prepare("UPDATE article_deliveries SET state=? WHERE article_id=? AND platform='zhihu'").run(state,item.id);}]),
  ['legacy-guard',async item=>{sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(item.id);}],
  ['incomplete-output',async item=>{const row=sql.prepare('SELECT result_meta FROM articles WHERE id=?').get(item.id),meta=JSON.parse(row.result_meta);meta.chunks++;sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run(JSON.stringify(meta),item.id);}],
 ]){
  const item=await fixture('zhihu-history-'+label),delivery=await call(item,'claim_article_delivery',{platform:'zhihu'});await change(item,delivery);
  const evidence=sql.prepare("SELECT draft_url,readback,message FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id),preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
  assert.equal(preview.recovery_scope,'platform_read_only',label);const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu'));assert.equal(recovered.state,'needs_verification',label);assert.equal(recovered.new_upload_allowed,false);
  assert.deepEqual(sql.prepare("SELECT draft_url,readback,message FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id),evidence);
  if(!attemptRow(item,'zhihu'))await assert.rejects(reserve(item,'zhihu',recovered.delivery_token),/confirmation|Prior or uncertain/i);
 }
});
await test('Zhihu pending recovery requires actual frozen bytes, original text and complete Word metadata',async()=>{
 for(const [label,change] of [
  ['corrupt',item=>{const row=sql.prepare('SELECT result_key FROM articles WHERE id=?').get(item.id),bytes=objects.get(row.result_key).slice();bytes[bytes.length-1]^=1;objects.set(row.result_key,bytes);}],
  ['missing',item=>{const row=sql.prepare('SELECT result_key FROM articles WHERE id=?').get(item.id);objects.delete(row.result_key);}],
  ['changed-text',item=>{sql.prepare('UPDATE articles SET paragraphs=? WHERE id=?').run(JSON.stringify([item.title,'Changed frozen text']),item.id);}],
 ]){
  const item=await fixture('zhihu-invalid-'+label),delivery=await call(item,'claim_article_delivery',{platform:'zhihu'}),preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});change(item);
  await assert.rejects(call(item,'preview_article_claim_recovery',{platform:'zhihu'}));await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu')));
  assert.equal(sql.prepare("SELECT claim_token FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id).claim_token,delivery.delivery_token);assert.equal(attemptRow(item,'zhihu'),undefined);
 }
});
await test('Zhihu pending previews bind the whole platform snapshot and exact article identity',async()=>{
 const item=await started('zhihu-other-platform-preview-race');await call(item,'claim_article_delivery',{platform:'zhihu'});const preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
 await record(item,item.reservation,'outcome_unknown',{editor_url:editor('toutiao')});await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu')),/changed/);
 const changed=await fixture('zhihu-artifact-preview-race');await call(changed,'claim_article_delivery',{platform:'zhihu'});const artifactPreview=await call(changed,'preview_article_claim_recovery',{platform:'zhihu'});
 sql.prepare('UPDATE articles SET title=? WHERE id=?').run('Changed fixture title',changed.id);await assert.rejects(call(changed,'recover_article_claim',recoveryArgs(changed,artifactPreview,'zhihu')),/changed/);
});
await test('Zhihu active saving recovery refuses same-state message, readback and update races',async()=>{
 for(const [column,value] of [['message','New platform activity'],['readback','{}'],['updated','2026-01-01T00:00:00.000Z']]){
  const item=await fixture('zhihu-saving-cas-'+column),delivery=await call(item,'claim_article_delivery',{platform:'zhihu'});
  sql.prepare("UPDATE article_deliveries SET state='saving' WHERE article_id=? AND platform='zhihu'").run(item.id);
  const preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});assert.equal(preview.recovery_scope,'platform_read_only');
  beforeRun=async statement=>{if(statement.startsWith('UPDATE article_deliveries SET claim_token=')){beforeRun=null;sql.prepare('UPDATE article_deliveries SET '+column+"=? WHERE article_id=? AND platform='zhihu'").run(value,item.id);}};
  await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu')),/changed/);beforeRun=null;
  assert.equal(sql.prepare("SELECT claim_token FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id).claim_token,delivery.delivery_token);
 }
});
await test('Zhihu pending SQL CAS refuses destination activity and frozen artifact races after confirmation',async()=>{
 const changedToken=crypto.randomUUID();
 const destinationChange=(column,value)=>item=>{sql.prepare('UPDATE article_deliveries SET '+column+"=? WHERE article_id=? AND platform='zhihu'").run(value,item.id);};
 const articleChange=(column,value)=>item=>{sql.prepare('UPDATE articles SET '+column+'=? WHERE id=?').run(value,item.id);};
 for(const [label,change] of [
  ['new-attempt',async(item,delivery)=>{await reserve(item,'zhihu',delivery.delivery_token);}],
  ['state',destinationChange('state','saving')],['token',destinationChange('claim_token',changedToken)],['expires',destinationChange('claim_expires','2026-01-01T00:00:00.000Z')],
  ['url',destinationChange('draft_url',editor('zhihu'))],['readback',destinationChange('readback','{}')],['message',destinationChange('message','New platform activity')],['updated',destinationChange('updated','2026-01-01T00:00:00.000Z')],
  ['guard',articleChange('upload_guard_version',0)],['word-key',articleChange('result_key','synthetic-changed-key')],['word-meta',articleChange('result_meta','{}')],['original-text',articleChange('paragraphs','[]')],['manifest',articleChange('artifact_manifest','{}')],['article-state',articleChange('state','needs_verification')],
 ]){
  const item=await fixture('zhihu-cas-'+label),delivery=await call(item,'claim_article_delivery',{platform:'zhihu'}),preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
  beforeRun=async statement=>{if(statement.startsWith('UPDATE article_deliveries SET claim_token=')){beforeRun=null;await change(item,delivery);}};
  await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu')),/changed/,label);beforeRun=null;
  const current=sql.prepare("SELECT claim_token FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id);assert.equal(current.claim_token,label==='token'?changedToken:delivery.delivery_token,label);
  if(label==='new-attempt')assert.equal(attemptRow(item,'zhihu').state,'reserved');
 }
});
await test('concurrent owner-confirmed Zhihu pending recoveries issue exactly one live lease',async()=>{
 const item=await fixture('zhihu-pending-concurrent');await call(item,'claim_article_delivery',{platform:'zhihu'});const preview=await call(item,'preview_article_claim_recovery',{platform:'zhihu'});
 const outcomes=await Promise.allSettled([call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu')),call(item,'recover_article_claim',recoveryArgs(item,preview,'zhihu'))]);assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.filter(result=>result.status==='rejected').length,1);
 const winner=outcomes.find(result=>result.status==='fulfilled').value;assert.equal(winner.state,'pending');assert.equal(sql.prepare("SELECT claim_token FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id).claim_token,winner.delivery_token);
});
await test('explicit first-import approval is separate from claim recovery and never inferred',async()=>{
 const item=await fixture('no-auto-clear');sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(item.id);
 const preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview));
 const args=reserveArgs(item,'toutiao',recovered.claim_token);
 await assert.rejects(call(item,'reserve_article_upload',args),/Owner confirmation/);
 const authorized=await call(item,'reserve_article_upload',{...args,mode:'owner_confirmed_first_import',confirm_never_submitted:true});
 assert.equal((await consume(item,authorized,'toutiao',recovered.claim_token)).execute_import,true);
});

await test('recovery fences every old evidence writer, including writes already between read and SQL',async()=>{
 const item=await started('fenced-evidence'),old=item.claim,preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview));
 await assert.rejects(record(item,item.reservation,'verified',{execution_claim:old,readback:receipt(item)}),/Current execution claim/);
 await record(item,item.reservation,'draft_observed',{execution_claim:recovered.claim_token,editor_url:editor('toutiao')});
 beforeRun=async statement=>{if(statement.startsWith('UPDATE article_upload_attempts SET state=?')){beforeRun=null;sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(crypto.randomUUID(),item.id);}};
 await assert.rejects(record(item,item.reservation,'verified',{execution_claim:recovered.claim_token,readback:receipt(item)}),/changed/);
 assert.equal(attemptRow(item).state,'draft_observed');
});
await test('same-millisecond editor observations change the preview fingerprint and revision',async()=>{
 const item=await started('same-millisecond');await record(item,item.reservation,'draft_observed',{editor_url:editor('toutiao')});
 const first=await call(item,'preview_article_claim_recovery',{platform:'toutiao'}),revision=attemptRow(item).revision;
 await record(item,item.reservation,'draft_observed',{editor_url:editor('toutiao').replace('123','456')});
 const second=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 assert.notEqual(first.lease_fingerprint,second.lease_fingerprint);assert.equal(attemptRow(item).revision,revision+1);
 await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,first)),/changed/);
});
await test('revoked and twice-rotated tokens cannot reappear in encoded receipt URLs',async()=>{
 const item=await started('revoked-secret'),old=item.claim;
 const p1=await call(item,'preview_article_claim_recovery',{platform:'toutiao'}),r1=await call(item,'recover_article_claim',recoveryArgs(item,p1));
 const p2=await call(item,'preview_article_claim_recovery',{platform:'toutiao'}),r2=await call(item,'recover_article_claim',recoveryArgs(item,p2));
 for(const secret of [old,r1.claim_token]){
  const proof=receipt(item);proof.images[0].observed_url='https://image.example.com/'+[...secret].map(c=>'%'+c.charCodeAt(0).toString(16)).join('');
  await assert.rejects(record(item,item.reservation,'verified',{execution_claim:r2.claim_token,readback:proof}),/credential|敏感凭据/);
 }
 assert.equal(attemptRow(item).readback,null);
 const rows=sql.prepare('SELECT * FROM article_claim_credential_hashes WHERE owner=?').all(item.owner);
 assert.ok(rows.length>=3);assert.equal(JSON.stringify(rows).includes(old),false);assert.equal(JSON.stringify(rows).includes(r1.claim_token),false);
});
await test('unfinished verified receipt can refresh on the same URL after 24h without reimport',async()=>{
 const item=await started('refresh-receipt');const oldReceipt=receipt(item);await record(item,item.reservation,'verified',{readback:oldReceipt});
 tick+=25*3600000;const next=await call(item,'claim_article');assert.equal(next.claimed,true);
 const fresh=receipt(item);fresh.saved_at=oldReceipt.saved_at;
 await record(item,item.reservation,'verified',{execution_claim:next.claim_token,readback:fresh});
 assert.equal(JSON.parse(attemptRow(item).readback).read_at,instant());
 await call(item,'record_article_status',{claim_token:next.claim_token,state:'completed',draft_url:editor('toutiao')});
 assert.equal((await consume(item,item.reservation,'toutiao',next.claim_token)).execute_import,false);
 await assert.rejects(record(item,item.reservation,'verified',{execution_claim:next.claim_token,readback:fresh}),/claim/);
});
await test('consume binds a newly checked visible path and browser session to its reservation',async()=>{
 const item=await fixtureWithReservation('session-bound');
 const input={platform:'toutiao',attempt_id:item.reservation.attempt.attempt_id,execution_claim:item.claim,target_account:item.account,file_confirmation:reserveArgs(item).preflight.file};
 for(const change of [{browser_session:'another-browser'},{absolute_path:'/another/已核验图文.docx'}])await assert.rejects(call(item,'consume_article_upload',{...input,file_confirmation:{...input.file_confirmation,...change}}),/changed/);
 await assert.rejects(call(item,'consume_article_upload',{...input,file_confirmation:{...input.file_confirmation,visible_in_browser:false}}),/Actual browser visibility or explicit same-browser download handoff required/);
 assert.equal(attemptRow(item).state,'reserved');assert.equal((await call(item,'consume_article_upload',input)).execute_import,true);
});
await test('real MCP surfaces fixed upload safety next steps while hiding unknown internal errors',async()=>{
 const route={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/mcp/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:route,require:name=>name.startsWith('../../lib/')?load(name.slice(10)):nativeRequire(name),Response,Request,URL,crypto,TextEncoder,console});
 const item=await fixture('mcp-errors');sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(item.id);
 const request=new Request('https://offline.test/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':item.owner},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'reserve_article_upload',arguments:{article_id:item.id,...reserveArgs(item)}}})});
 const output=await (await route.POST(request)).json();assert.equal(output.result.isError,true);assert.match(output.result.content[0].text,/Owner confirmation required/);assert.equal(JSON.stringify(output).includes(item.claim),false);
 assert.equal(load('workflow-errors').workflowPublicError(Error('SQL failure secret=do-not-echo'),'safe fallback'),'safe fallback');
});

await test('owner-only read exposes exact pending output and parts without credentials or storage keys',async()=>{
 const item=await fixture('pending-read',true),first=item.bytes.slice(0,Math.floor(item.bytes.length/2));
 await call(item,'put_article_output_chunk',{...item.base,output_id:item.output_id,index:0,data_base64:Buffer.from(first).toString('base64')});
 const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),read=await call(item,'read_article_output');
 assert.equal(read.ready,false);assert.equal(read.output.output_id,item.output_id);assert.equal(read.output.sha256,item.hash);assert.equal(read.output.next_index,1);assert.equal(read.output.parts[0].sha256,digest(first));assert.equal(read.output.parts[0].size,first.length);
 assert.equal(JSON.stringify(read).includes(item.claim),false);assert.equal(JSON.stringify(read).includes('articles/'),false);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),before);
 await assert.rejects(tools.articleCall('another-owner','read_article_output',{article_id:item.id}));
});
await test('partial manual Word refuses legacy boolean-only recovery and preserves the live holder output',async()=>{
 const item=await fixture('pending-resume',true),split=Math.floor(item.bytes.length/2),first=item.bytes.slice(0,split),last=item.bytes.slice(split);
 await call(item,'put_article_output_chunk',{...item.base,output_id:item.output_id,index:0,data_base64:Buffer.from(first).toString('base64')});
 const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
 const preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});assert.equal(preview.recovery_scope,'manual_word_before_final_save');assert.equal(preview.next_tool,'preview_article_word_recovery');
 await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview)),/exact original executor end/);
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),before);
 const base=item.base,existing=await call(item,'begin_article_output',{...base,size:item.bytes.length,sha256:item.hash,chunks:2});assert.equal(existing.output_id,item.output_id);
 await assert.rejects(call(item,'begin_article_output',{...base,size:item.bytes.length,sha256:'a'.repeat(64),chunks:2}),/identity differs/);
 assert.equal((await call(item,'put_article_output_chunk',{...base,output_id:item.output_id,index:0,data_base64:Buffer.from(first).toString('base64')})).duplicate,true);
 await call(item,'put_article_output_chunk',{...base,output_id:item.output_id,index:1,data_base64:Buffer.from(last).toString('base64')});
 const done=await call(item,'finalize_article_output',{...base,output_id:item.output_id});assert.equal(done.sha256,item.hash);
 assert.equal((await call(item,'release_article_word_claim',base)).released,true);assert.equal(attemptRow(item),undefined);
 const row=sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id);assert.equal(digest(objects.get(row.result_key)),item.hash);assert.equal(row.claim_token,null);assert.equal(row.state,'word_ready');assert.equal(JSON.parse(row.result_meta).word_claim_recoveries,undefined);
});
await test('ready Word recovery preserves phase; no upload permission is granted by recovery itself',async()=>{
 const item=await fixture('ready-resume'),preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'}),recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview));
 assert.equal(recovered.state,'word_ready');assert.equal(recovered.new_upload_allowed,false);assert.equal(recovered.recovery_scope,'word_output_only');
 await assert.rejects(call(item,'release_article_word_claim',item.base));assert.equal((await call(item,'release_article_word_claim',{claim_token:recovered.claim_token})).released,true);
});
const restoreArgs=item=>({claim_token:item.claim,output_id:item.output_id,word_sha256:item.hash,word_size:item.bytes.length,original_state:'word_ready',original_lease_fingerprint:'b'.repeat(64),original_execution_end_reference:'Synthetic original executor ended; owner chat evidence',confirm_word_only_restore:true,confirm_no_platform_actions:true});
await test('old ready-Word recovery bug can be repaired once by exact current claim without rotating it',async()=>{
 const item=await fixture('legacy-bug');sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(item.id);
 const original=sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id),objectsBefore=objects.size,args=restoreArgs(item);
 for(const change of [{word_sha256:'a'.repeat(64)},{word_size:item.bytes.length+1},{output_id:crypto.randomUUID()},{original_state:'toutiao_saving'},{confirm_no_platform_actions:false},{claim_token:crypto.randomUUID()}])await assert.rejects(call(item,'restore_article_word_phase',{...args,...change}));
 const restored=await call(item,'restore_article_word_phase',args);assert.equal(restored.same_claim,true);assert.equal(restored.new_upload_allowed,false);assert.equal(restored.evidence,'authenticated_owner_attested_not_server_verified');
 const row=sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id);assert.equal(row.claim_token,item.claim);assert.equal(row.claim_expires,original.claim_expires);assert.equal(row.result_key,original.result_key);assert.equal(row.paragraphs,original.paragraphs);assert.equal(objects.size,objectsBefore);assert.equal(digest(objects.get(row.result_key)),item.hash);
 assert.equal(JSON.parse(row.result_meta).word_claim_recoveries[0].operation,'legacy_phase_restore');assert.equal(JSON.stringify(row.result_meta).includes(item.claim),false);
 await assert.rejects(call(item,'restore_article_word_phase',args));assert.equal((await call(item,'release_article_word_claim',item.base)).released,true);
});
await test('prepared ready Word with no fabricated image verification can repair the old recovery bug',async()=>{
 const item=await preparedFixture('legacy-prepared-ready'),before=sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id),meta=JSON.parse(before.result_meta);
 assert.equal(before.artifact_manifest,null);assert.equal(before.upload_guard_version,1);assert.equal(meta.verification??null,null);assert.equal(meta.word_claim_recoveries,undefined);
 sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(item.id);
 const read=await call(item,'read_article_output');assert.equal(read.output.verification,null);assert.equal(read.output.recovery_audit.length,0);
 const restored=await call(item,'restore_article_word_phase',restoreArgs(item));assert.equal(restored.same_claim,true);assert.equal(restored.word_unchanged,true);assert.equal(restored.new_upload_allowed,false);
 const after=sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id);assert.equal(after.claim_token,before.claim_token);assert.equal(after.result_key,before.result_key);assert.equal(after.paragraphs,before.paragraphs);assert.equal(digest(objects.get(after.result_key)),item.hash);assert.equal(JSON.parse(after.result_meta).verification,meta.verification);
 assert.equal((await call(item,'release_article_word_claim',item.base)).released,true);
});
await test('receipt-free prepared Word repair still refuses corruption, changed text, guard-zero and platform traces',async()=>{
 for(const [label,change] of [
  ['corrupt-bytes',async item=>{const row=sql.prepare('SELECT result_key FROM articles WHERE id=?').get(item.id),bytes=objects.get(row.result_key).slice();bytes[bytes.length-1]^=1;objects.set(row.result_key,bytes);}],
  ['changed-text',async item=>{sql.prepare('UPDATE articles SET paragraphs=? WHERE id=?').run(JSON.stringify([item.title,'Changed original text']),item.id);}],
  ['legacy-flag-zero',async item=>{sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(item.id);}],
  ['unknown-platform-audit',async item=>{const row=sql.prepare('SELECT result_meta FROM articles WHERE id=?').get(item.id),meta=JSON.parse(row.result_meta);meta.word_claim_recoveries=[{scope:'platform_read_only',original_state:'toutiao_saving'}];sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run(JSON.stringify(meta),item.id);}],
  ['existing-url',async item=>{sql.prepare('UPDATE articles SET draft_url=? WHERE id=?').run(editor('toutiao'),item.id);}],
  ['pending-delivery',async item=>{await call(item,'claim_article_delivery',{platform:'zhihu'});}],
 ]){
  const item=await preparedFixture(label);sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(item.id);await change(item);const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));await assert.rejects(call(item,'restore_article_word_phase',restoreArgs(item)));assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),before);
 }
});
await test('prior unknown platform state stays read-only even when there is no attempt row',async()=>{
 const item=await fixture('unknown-no-ledger');sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(item.id);
 const preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});assert.equal(preview.recovery_scope,'platform_read_only');
 const recovered=await call(item,'recover_article_claim',recoveryArgs(item,preview));assert.equal(recovered.state,'needs_verification');
 await assert.rejects(call(item,'restore_article_word_phase',{...restoreArgs(item),claim_token:recovered.claim_token}),/uncertain/);
 await assert.rejects(call(item,'release_article_word_claim',{claim_token:recovered.claim_token}));
});
await test('Word-only restore rejects actual platform traces, races and credential-bearing evidence',async()=>{
 const reserved=await fixtureWithReservation('restore-reserved');sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(reserved.id);await assert.rejects(call(reserved,'restore_article_word_phase',restoreArgs(reserved)),/uncertain/);
 const delivery=await fixture('restore-delivery');await call(delivery,'claim_article_delivery',{platform:'zhihu'});sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(delivery.id);await assert.rejects(call(delivery,'restore_article_word_phase',restoreArgs(delivery)),/uncertain/);
 const url=await fixture('restore-url');sql.prepare("UPDATE articles SET state='needs_verification',draft_url=? WHERE id=?").run(editor('toutiao'),url.id);await assert.rejects(call(url,'restore_article_word_phase',restoreArgs(url)),/uncertain/);
 const item=await fixture('restore-race');sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(item.id);
 await assert.rejects(call(item,'restore_article_word_phase',{...restoreArgs(item),original_execution_end_reference:encodeURIComponent(item.claim)}),/credential|敏感凭据/);
 beforeRun=async statement=>{if(statement.startsWith("UPDATE articles SET state='word_ready'")){beforeRun=null;sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(crypto.randomUUID(),item.id);}};
 await assert.rejects(call(item,'restore_article_word_phase',restoreArgs(item)),/changed/);assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(item.id).state,'needs_verification');
});
await test('overlapping revoked token starts cannot be saved in owner-attested recovery evidence',async()=>{
 const item=await fixture('overlap-secret'),old=item.claim;item.claim=crypto.randomUUID();item.base.claim_token=item.claim;
 await load('article-claim-credentials').rememberArticleClaimHashes(item.owner,item.claim);
 sql.prepare("UPDATE articles SET state='needs_verification',claim_token=? WHERE id=?").run(item.claim,item.id);
 const reference='11111111-2222-3333-4444-aaaa'+old;
 const encodedApiKey=[...('sk-proj-'+('z'.repeat(32)))].map(c=>'%'+c.charCodeAt(0).toString(16)).join('');
 await assert.rejects(call(item,'restore_article_word_phase',{...restoreArgs(item),original_execution_end_reference:encodedApiKey}),/credential|敏感凭据/);
 assert.equal(await load('article-claim-credentials').hasArticleClaimCredential(item.owner,reference),true);
 for(const evidence of [reference,encodeURIComponent(reference)])await assert.rejects(call(item,'restore_article_word_phase',{...restoreArgs(item),original_execution_end_reference:evidence}),/credential|敏感凭据/);
 const read=await call(item,'read_article_output');assert.equal(JSON.stringify(read).includes(old),false);assert.equal(read.output.recovery_audit.length,0);
});
await test('recovery references reject every wider owner credential pool before persistence',async()=>{
 const item=await fixture('wide-reference-boundary');sql.prepare("UPDATE articles SET state='needs_verification' WHERE id=?").run(item.id);
 // Synthetic real-schema pool rows only; no authorization/run execution is represented here.
 const insert=(table,overrides)=>{const columns=sql.prepare('PRAGMA table_info('+table+')').all(),row={};for(const c of columns)if(c.notnull&&c.dflt_value===null)row[c.name]=c.type==='INTEGER'?0:'offline-'+crypto.randomUUID();Object.assign(row,overrides);const keys=Object.keys(row);sql.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));};
 const requestToken=crypto.randomUUID(),legacyToken=crypto.randomUUID(),v3Token=crypto.randomUUID(),researchLease=crypto.randomUUID(),editorialLease=crypto.randomUUID(),researchClaim=crypto.randomUUID()+crypto.randomUUID(),recoveredOld=crypto.randomUUID(),recoveredNew=crypto.randomUUID();
 insert('editorial_requests',{owner:item.owner,claim_hash:digest(requestToken)});
 insert('editorial_stages',{owner:item.owner,token:legacyToken});insert('editorial_stages_v3',{owner:item.owner,token:v3Token});
 insert('topic_research_runs',{owner:item.owner,claim_hash:digest(researchClaim)});
 insert('topic_research_outbox',{owner:item.owner,lease_token:researchLease});insert('editorial_request_outbox',{owner:item.owner,lease_token:editorialLease});
 insert('editorial_agent_claim_recoveries_v3',{owner:item.owner,scope:'editorial_v3_same_stage_unpaid_agent_claim_recovery',old_token_sha256:digest(recoveredOld),new_token_sha256:digest(recoveredNew)});
 const overlapReference='11111111-2222-3333-4444-aaaa'+requestToken;
 // Differential proof: V85 known-token overlap protection does not cover this hash-only pool.
 const prior={};const priorSource=fs.readFileSync('lib/editorial-credential-boundary.ts','utf8').replace("for(const match of raw.matchAll(/(?=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))/gi))ids.add(match[1].toLowerCase());","for(const id of raw.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi)||[])ids.add(id.toLowerCase());");
 vm.runInNewContext(ts.transpileModule(priorSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:prior,require:name=>name.startsWith('./')?load(name.slice(2)):nativeRequire(name),crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Map,Error,URL,btoa,atob,Date:Clock,File,ReadableStream,Response,Request,AbortSignal,setTimeout,clearTimeout});
 const priorScan=await prior.createEditorialCredentialScanContext(item.owner),fixedScan=await load('editorial-credential-boundary').createEditorialCredentialScanContext(item.owner);
 assert.equal(await priorScan.inspect(overlapReference,[item.claim,editorialLease]),false);assert.equal(await fixedScan.inspect(overlapReference,[item.claim,editorialLease]),true);await priorScan.assertFresh();await fixedScan.assertFresh();
 const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id));
 for(const secret of [requestToken,legacyToken,v3Token,researchLease,editorialLease,recoveredOld,recoveredNew,researchClaim]){
  for(const reference of [secret,[...secret].map(c=>'%'+c.charCodeAt(0).toString(16)).join(''),'11111111-2222-3333-4444-aaaa'+secret])await assert.rejects(call(item,'restore_article_word_phase',{...restoreArgs(item),original_execution_end_reference:reference}),reference.length>180?/confirmation/:/credential|敏感凭据/);
 }
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id)),before);
 const read=await call(item,'read_article_output');assert.equal(read.output.recovery_audit.length,0);for(const secret of [requestToken,legacyToken,v3Token,researchLease,editorialLease,recoveredOld,recoveredNew,researchClaim])assert.equal(JSON.stringify(read).includes(secret),false);
 // A proper token-free execution reference still repairs the exact original Word.
 assert.equal((await call(item,'restore_article_word_phase',restoreArgs(item))).restored,true);
});
await test('legacy guard-zero Word remains platform-read-only and guard changes invalidate the preview and CAS',async()=>{
 const legacy=await fixture('legacy-no-ledger');sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(legacy.id);
 const preview=await call(legacy,'preview_article_claim_recovery',{platform:'toutiao'});assert.equal(preview.recovery_scope,'platform_read_only');
 const recovered=await call(legacy,'recover_article_claim',recoveryArgs(legacy,preview));assert.equal(recovered.state,'needs_verification');await assert.rejects(call(legacy,'release_article_word_claim',{claim_token:recovered.claim_token}));
 const changed=await fixture('guard-preview-race'),p=await call(changed,'preview_article_claim_recovery',{platform:'toutiao'});sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(changed.id);await assert.rejects(call(changed,'recover_article_claim',recoveryArgs(changed,p)),/changed/);
 const race=await fixture('guard-cas-race'),rp=await call(race,'preview_article_claim_recovery',{platform:'toutiao'});
 beforeRun=async statement=>{if(statement.startsWith('UPDATE articles SET claim_token=')){beforeRun=null;sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(race.id);}};
 await assert.rejects(call(race,'recover_article_claim',recoveryArgs(race,rp)),/changed/);assert.equal(sql.prepare('SELECT claim_token FROM articles WHERE id=?').get(race.id).claim_token,race.claim);
});
await test('a destination claim created after Word preview invalidates phase recovery',async()=>{
 const item=await fixture('word-platform-race'),preview=await call(item,'preview_article_claim_recovery',{platform:'toutiao'});
 await call(item,'claim_article_delivery',{platform:'zhihu'});await assert.rejects(call(item,'recover_article_claim',recoveryArgs(item,preview)),/changed/);
});

assert.equal(networkCalls,0);
console.log(`${cases} claim recovery/handoff groups passed; ${failures} failed; no live data or network used.`);
if(failures)process.exitCode=1;
