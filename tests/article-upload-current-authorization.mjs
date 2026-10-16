// Offline read-only current-authorization regression. ALL data, Word bytes,
// credentials and SQL fixtures below are synthetic; real production handlers.
// No CUA, platform, network, original frozen Word or website deployment.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {zipSync, strToU8} from 'fflate';
import path from 'node:path';

const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
let tick = Date.now();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [tick])); }
  static now() { return tick; }
}
const instant = () => new Clock().toISOString();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let beforeRun = null, afterRun = null, networkCalls = 0;
let authorizationReadActive=false,serverWrites=0,storageWrites=0,readHook=null,beforeReadHook=null,readEvents=[],digestHook=null;
const fixtureSubtle=new Proxy(crypto.subtle,{get(target,key){const member=Reflect.get(target,key,target);return key==='digest'?async(...args)=>{if(digestHook)await digestHook(args);return target.digest(...args);}:typeof member==='function'?member.bind(target):member;}});
const fixtureCrypto=new Proxy(crypto,{get(target,key){if(key==='subtle')return fixtureSubtle;const member=Reflect.get(target,key,target);return typeof member==='function'?member.bind(target):member;}});
const db = {
  prepare: statement => ({bind: (...values) => ({
    first: async () => {if(beforeReadHook)await beforeReadHook({statement,values});const value=sql.prepare(statement).get(...values)||null;readEvents.push({statement,values});if(readHook)await readHook({statement,values,value});return value;},
    all: async () => {if(beforeReadHook)await beforeReadHook({statement,values});const value={results:sql.prepare(statement).all(...values)};readEvents.push({statement,values});if(readHook)await readHook({statement,values,value});return value;},
    run: async () => {
      if(authorizationReadActive){serverWrites++;throw Error("Read authorization attempted a write");}
      if (beforeRun) await beforeRun(statement, values);
      const result = {meta: {changes: Number(sql.prepare(statement).run(...values).changes)}};
      if (afterRun) await afterRun(statement, values, result);
      return result;
    },
  })}),
  batch: async statements => {
    if(authorizationReadActive){serverWrites++;throw Error('Read authorization attempted a batch write');}
    sql.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
    catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const objects = new Map();
const bucket = {
  async put(key, bytes) {if(authorizationReadActive){storageWrites++;throw Error('Read authorization attempted storage write');}objects.set(key, new Uint8Array(bytes));},
  async delete(key) {if(authorizationReadActive){storageWrites++;throw Error('Read authorization attempted storage deletion');}objects.delete(key);},
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
      : name.endsWith('?raw') ? {__esModule:true,default:fs.readFileSync(path.resolve('lib',name.slice(0,-4)),'utf8')}
      : name.startsWith('./') ? load(name.slice(2)) : nativeRequire(name),
    crypto:fixtureCrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Map, Error, URL, btoa, atob, Date: Clock, File, ReadableStream, Response, Request, AbortSignal, structuredClone, setTimeout, clearTimeout,
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
const attemptRow = (fixture, platform = 'toutiao') => sql.prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? AND platform=? ORDER BY attempt_version DESC LIMIT 1').get(fixture.owner, fixture.id, platform);
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

import test from 'node:test';
const toolName='read_article_upload_authorization';
const publicError=load('workflow-errors').workflowPublicError;
const realTableNames=sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
const databaseSnapshot=()=>JSON.stringify(Object.fromEntries(realTableNames.map(name=>[name,sql.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()])));
const objectSnapshot=()=>JSON.stringify([...objects.entries()].map(([key,bytes])=>[key,digest(bytes)]).sort((a,b)=>a[0].localeCompare(b[0])));
let apiReads=0;
function argsFor(f,change={}){
  const a=attemptRow(f,f.platform);
  return {article_id:f.id,platform:f.platform,execution_claim:f.executionClaim,attempt_id:f.reservation.attempt.attempt_id,target_account:guards.authorizedUploadAccounts[f.platform],word_sha256:f.hash,word_size:f.bytes.length,consumed_at:a.consumed_at,expected_attempt_revision:a.revision,...change};
}
async function authorization(f,change={},options={}){
  const dbBefore=databaseSnapshot(),objectsBefore=objectSnapshot();serverWrites=0;storageWrites=0;readEvents=[];authorizationReadActive=true;apiReads++;
  let value,error;
  try{const args=argsFor(f,change);value=await tools.articleCall(options.owner||f.owner,toolName,options.buildArgs?options.buildArgs(args):args);}
  catch(caught){error=caught;}
  finally{authorizationReadActive=false;beforeReadHook=null;readHook=null;digestHook=null;}
  assert.equal(serverWrites,0,'read handler must not issue any DB write/batch');assert.equal(storageWrites,0,'read handler must not change storage');
  assert.equal(objectSnapshot(),objectsBefore,'original synthetic Word/storage must not change');
  if(!options.race)assert.equal(databaseSnapshot(),dbBefore,'all DB rows must remain byte-for-byte identical');
  const serialized=JSON.stringify(value)||'';
  assert.equal(serialized.includes(f.executionClaim),false,'no credential echo in success or failure');
  if(f.consumeToken)assert.equal(serialized.includes(f.consumeToken),false,'no one-use token echo');
  const forbiddenKeys=['claim_token','delivery_token','execution_claim','consume_token','claim_hash','consume_token_sha256','result_key','source_key','baseline','preflight'];
  function noSecrets(v){if(v&&typeof v==='object')for(const [key,entry]of Object.entries(v)){assert.equal(forbiddenKeys.includes(key),false,'private field '+key+' never returned');noSecrets(entry);}}
  noSecrets(value);
  if(error){const safe=publicError(error,'Current upload authorization unconfirmed');assert.equal(safe.includes(f.executionClaim),false);if(f.consumeToken)assert.equal(safe.includes(f.consumeToken),false);}
  return {value,error};
}
function current(r,f){
  assert.equal(r.error,undefined);assert.equal(r.value.read_only,true);assert.equal(r.value.execute_import,false);assert.equal(r.value.submission_permission_issued,false);assert.equal(r.value.current,true);assert.equal(r.value.matches,true);
  assert.equal(r.value.article_id,f.id);assert.equal(r.value.platform,f.platform);assert.equal(r.value.attempt_id,f.reservation.attempt.attempt_id);
  const a=attemptRow(f,f.platform);assert.equal(r.value.revision,a.revision);assert.equal(r.value.target_account,guards.authorizedUploadAccounts[f.platform]);assert.equal(r.value.word_sha256,f.hash);assert.equal(r.value.word_size,f.bytes.length);
  for(const key of ['checked_at','observed_at','verified_at','valid_until','lease_expires'])assert.equal(Number.isFinite(Date.parse(r.value[key])),true,'actual timestamp '+key);
  assert.ok(Date.parse(r.value.verified_at)>=Date.parse(r.value.checked_at));assert.equal(r.value.consumed_at,attemptRow(f,f.platform).consumed_at);
  assert.equal(r.value.observed_at,r.value.checked_at);assert.equal(r.value.valid_until,new Date(Math.min(Date.parse(r.value.lease_expires),Date.parse(a.consumed_at)+60000)).toISOString());
}
function refused(r){
  assert.ok(r.error||r.value?.current===false,'unknown or invalid authorization never current');
  if(r.value){assert.equal(r.value.read_only,true);assert.equal(r.value.execute_import,false);assert.equal(r.value.submission_permission_issued,false);assert.equal(r.value.matches,false);}
}
async function readyFixture(label,platform='toutiao',{saving=true,consumeGrant=true}={}){
  const f=await fixture(label);f.platform=platform;f.executionClaim=f.claim;
  if(platform==='zhihu'){const d=await call(f,'claim_article_delivery',{platform});assert.equal(d.claimed,true);f.executionClaim=d.delivery_token;}
  f.reservation=await reserve(f,platform,f.executionClaim);assert.equal(f.reservation.reserved,true);
  if(consumeGrant){f.consumed=await consume(f,f.reservation,platform,f.executionClaim);assert.equal(f.consumed.execute_import,true);}
  if(saving){const result=await call(f,platform==='toutiao'?'record_article_status':'record_article_delivery',{...(platform==='toutiao'?{claim_token:f.executionClaim}:{platform,delivery_token:f.executionClaim}),state:platform==='toutiao'?'toutiao_saving':'saving'});assert.equal(result.state,platform==='toutiao'?'toutiao_saving':'saving');}
  return f;
}
function setLease(f,changes){const table=f.platform==='toutiao'?'articles':'article_deliveries';const columns=Object.keys(changes);sql.prepare('UPDATE '+table+' SET '+columns.map(key=>key+'=?').join(',')+' WHERE '+(f.platform==='toutiao'?'id=?':'article_id=? AND platform=?')).run(...columns.map(key=>changes[key]),f.id,...(f.platform==='toutiao'?[]:[f.platform]));}
async function endAttempt(f){
  const a=attemptRow(f,f.platform);
  const ack=await call(f,'record_article_upload_executor_end',{platform:f.platform,execution_claim:f.executionClaim,attempt_id:a.id,target_account:a.target_account,word_sha256:f.hash,word_size:f.bytes.length,prior_draft_identity:'unknown_without_editor_url',expected_attempt_revision:a.revision,prior_executor_stopped:true,prior_executor_end_reference:'Synthetic offline original executor really returned and all synthetic actions settled'});assert.equal(ack.recorded,true);
}

await test('published tool schema is owner-scoped read-only, closed and cannot issue an import permit',async()=>{
  const spec=tools.articleTools.find(item=>item.name===toolName);assert.ok(spec);assert.equal(spec.annotations.readOnlyHint,true);assert.equal(spec.inputSchema.additionalProperties,false);
  assert.deepEqual([...spec.inputSchema.required].sort(),['article_id','platform','execution_claim','attempt_id','target_account','word_sha256','word_size','consumed_at','expected_attempt_revision'].sort());
});

for(const platform of ['toutiao','zhihu']){
  await test(platform+' correct original consumed saving chain reads twice without mutation, grant or secret echo',async()=>{
    const f=await readyFixture('positive-'+platform,platform);const before=attemptRow(f,platform);assert.equal(before.consume_token_sha256,null);
    current(await authorization(f),f);tick+=1;current(await authorization(f),f);
    assert.deepEqual(attemptRow(f,platform),before);assert.equal(networkCalls,0);
  });
  const malformed=[
    ['wrong original token',()=>({execution_claim:crypto.randomUUID()})],['missing token',()=>({execution_claim:undefined})],['object token',()=>({execution_claim:{fake:true}})],
    ['wrong attempt id',()=>({attempt_id:crypto.randomUUID()})],['wrong account',()=>({target_account:'other-account'})],['wrong Word SHA',()=>({word_sha256:'0'.repeat(64)})],['wrong Word size',f=>({word_size:f.bytes.length+1})],
    ['wrong consumed timestamp',()=>({consumed_at:new Date(tick-1).toISOString()})],['missing consumed timestamp',()=>({consumed_at:undefined})],['invalid consumed timestamp',()=>({consumed_at:'invalid'})],
    ['wrong revision',f=>({expected_attempt_revision:attemptRow(f,platform).revision+1})],['missing revision',()=>({expected_attempt_revision:undefined})],['fractional revision',()=>({expected_attempt_revision:1.5})],
    ['unexpected consume token for new_word',()=>({consume_token:'synthetic-unknown-consume-token'})],['unknown field',()=>({selector:'synthetic-only-secret-must-not-echo'})],['legacy alias secret field',()=>({claim_token:'synthetic-only-secret-must-not-echo'})],
  ];
  for(const [label,change] of malformed)await test(platform+' refuses '+label+' without writing',async()=>{const f=await readyFixture('refused-'+label,platform);refused(await authorization(f,change(f)));});
  await test(platform+' another owner cannot inspect the current original claim',async()=>{const f=await readyFixture('foreign-owner',platform);refused(await authorization(f,{}, {owner:'different-authenticated-owner'}));});
  await test(platform+' cross-article attempt cannot authorize another article',async()=>{const a=await readyFixture('article-a',platform),b=await readyFixture('article-b',platform);refused(await authorization(a,{attempt_id:b.reservation.attempt.attempt_id}));});
  await test(platform+' cross-platform inputs cannot reuse one claim/attempt',async()=>{const f=await readyFixture('other-platform',platform);refused(await authorization(f,{platform:platform==='toutiao'?'zhihu':'toutiao'}));});
  await test(platform+' a consumed chain not yet saving is not current submission authorization',async()=>{const f=await readyFixture('not-saving',platform,{saving:false});refused(await authorization(f));});
  await test(platform+' reserved never-consumed attempt is refused',async()=>{const f=await readyFixture('unconsumed',platform,{saving:false,consumeGrant:false});refused(await authorization(f));});
  for(const state of platform==='toutiao'?['needs_verification','needs_login','failed','completed']:['pending','needs_verification','needs_login','failed','saved'])await test(platform+' current '+state+' phase refuses authorization',async()=>{const f=await readyFixture('phase-'+state,platform);setLease(f,{state});refused(await authorization(f));});
  await test(platform+' expiry equality and old expiry are refused',async()=>{const f=await readyFixture('expiry',platform);setLease(f,{claim_expires:instant()});refused(await authorization(f));setLease(f,{claim_expires:new Date(tick-1).toISOString()});refused(await authorization(f));});
  await test(platform+' expiry malformed/null is refused',async()=>{const f=await readyFixture('invalid-expiry',platform);for(const expiry of [null,'not-a-date']){setLease(f,{claim_expires:expiry});refused(await authorization(f));}});
  await test(platform+' 60000ms consumed boundary remains inclusive, 60001ms never renews it',async()=>{const f=await readyFixture('age-boundary',platform);tick+=60000;current(await authorization(f),f);tick+=1;refused(await authorization(f));});
  await test(platform+' current lease token rotation cannot adopt old attempt claim hash',async()=>{const f=await readyFixture('rotation',platform);const original=f.executionClaim,replacement=crypto.randomUUID();setLease(f,{claim_token:replacement});refused(await authorization(f));f.executionClaim=replacement;refused(await authorization(f));assert.notEqual(digest(replacement),attemptRow(f,platform).claim_hash);f.executionClaim=original;});
  await test(platform+' current finalized Word metadata change is refused',async()=>{const f=await readyFixture('word-change',platform);const meta=JSON.parse(sql.prepare('SELECT result_meta FROM articles WHERE id=?').get(f.id).result_meta);meta.sha256='0'.repeat(64);sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run(JSON.stringify(meta),f.id);refused(await authorization(f));});
  await test(platform+' deleting article is refused and never revives the lease',async()=>{const f=await readyFixture('deleting',platform);sql.prepare("UPDATE articles SET state='deleting' WHERE id=?").run(f.id);refused(await authorization(f));});
  await test(platform+' an exact officially recorded executor end makes the same consumed attempt immutable',async()=>{const f=await readyFixture('ended',platform);await endAttempt(f);refused(await authorization(f));});
}

const isAuthorizationSnapshot=statement=>statement.startsWith('SELECT u.revision,u.consumed_at,');
async function tokenReimportFixture(label,platform){
  const f=await readyFixture(label,platform),old=attemptRow(f,platform);await endAttempt(f);
  const p=reserveArgs(f,platform,f.executionClaim);Object.assign(p.preflight.existing_drafts,{prior_submission:'submitted_unknown',editor_empty:true,private_draft:true});
  const next=await call(f,'reserve_article_upload',{...p,mode:'owner_confirmed_reimport',previous_attempt_id:old.id,prior_draft_identity:'unknown_without_editor_url',authorization_scope:'duplicate_tolerant_task',confirm_duplicate_tolerant_task:true,current_task_id:'synthetic-task-'+f.id,current_word_sha256:f.hash,authorization_key:'synthetic-linked-'+f.id,confirmation_message_id:'synthetic-owner-confirmation-'+f.id,prior_executor_end_reference:'Synthetic offline original executor really returned and all synthetic actions settled',prior_executor_stopped:true,confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true});
  assert.equal(next.reserved,true);assert.equal(typeof next.consume_token,'string');f.previousAttempt=old;f.reservation=next;f.executionClaim=next.execution_claim;f.consumeToken=next.consume_token;
  f.consumed=await call(f,'consume_article_upload',{platform,attempt_id:next.attempt.attempt_id,execution_claim:f.executionClaim,consume_token:f.consumeToken,target_account:guards.authorizedUploadAccounts[platform],file_confirmation:p.preflight.file,reimport_editor_confirmation:{target_account:guards.authorizedUploadAccounts[platform],current_editor_url:p.preflight.existing_drafts.current_editor_url,editor_empty:true,private_draft:true,checked_at:instant()}});assert.equal(f.consumed.execute_import,true);
  await call(f,platform==='toutiao'?'record_article_status':'record_article_delivery',{...(platform==='toutiao'?{claim_token:f.executionClaim}:{platform,delivery_token:f.executionClaim}),state:platform==='toutiao'?'toutiao_saving':'saving'});
  return f;
}
for(const platform of ['toutiao','zhihu']){
  await test(platform+' ordinary new_word cannot adopt guard-version-zero legacy compatibility',async()=>{const f=await readyFixture('guard-downgrade',platform);sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(f.id);refused(await authorization(f));});
  await test(platform+' validated input scalars cannot mutate scope across the genuine hash await',async()=>{
    const f=await readyFixture('hash-input-race',platform);let submitted,fired=0;
    const out=await authorization(f,{}, {buildArgs:args=>{submitted=args;digestHook=([algorithm,bytes])=>{if(new TextDecoder().decode(bytes)===f.executionClaim){digestHook=null;fired++;submitted.execution_claim=crypto.randomUUID();submitted.attempt_id=crypto.randomUUID();submitted.target_account='changed-after-entry';submitted.word_sha256='0'.repeat(64);submitted.consumed_at=instant();submitted.expected_attempt_revision++;}};return args;}});
    current(out,f);assert.equal(fired,1);assert.notEqual(submitted.attempt_id,f.reservation.attempt.attempt_id);
  });
  await test(platform+' stored original consume-token hash requires that same volatile token and preserves old lineage',async()=>{
    const f=await tokenReimportFixture('conditional-token-'+platform,platform);assert.equal(attemptRow(f,platform).consume_token_sha256,digest(f.consumeToken));
    current(await authorization(f,{consume_token:f.consumeToken}),f);refused(await authorization(f));refused(await authorization(f,{consume_token:crypto.randomUUID()}));refused(await authorization(f,{consume_token:''}));
    refused(await authorization(f,{attempt_id:f.previousAttempt.id,consumed_at:f.previousAttempt.consumed_at,expected_attempt_revision:f.previousAttempt.revision}));
    assert.deepEqual(sql.prepare('SELECT * FROM article_upload_attempts WHERE id=?').get(f.previousAttempt.id),f.previousAttempt);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM article_upload_executor_ends WHERE attempt_id=?').get(f.previousAttempt.id).n,1);
    sql.prepare('UPDATE articles SET upload_guard_version=0 WHERE id=?').run(f.id);current(await authorization(f,{consume_token:f.consumeToken}),f);
  });
  await test(platform+' matching original consumed_at in future is refused without renewal',async()=>{const f=await readyFixture('future-original',platform),saved=tick;try{tick-=1;refused(await authorization(f));}finally{tick=saved;}});
  for(const [label,change]of [
    ['symbol own field',args=>{args[Symbol('private-extra')]='synthetic-secret';return args;}],
    ['nonenumerable own field',args=>{Object.defineProperty(args,'secret_extra',{value:'synthetic-secret',enumerable:false});return args;}],
    ['credential accessor',args=>{const token=args.execution_claim;Object.defineProperty(args,'execution_claim',{get:()=>token,enumerable:true});return args;}],
    ['inherited required token',args=>{const token=args.execution_claim;delete args.execution_claim;return Object.assign(Object.create({execution_claim:token}),args);}]
  ])await test(platform+' runtime closed input refuses '+label,async()=>{const f=await readyFixture('runtime-fields',platform);refused(await authorization(f,{}, {buildArgs:change}));});
  for(const [label,mutate]of [
    ['lease token',f=>setLease(f,{claim_token:crypto.randomUUID()})],
    ['destination phase',f=>setLease(f,{state:f.platform==='toutiao'?'needs_verification':'needs_verification'})],
    ['Word identity',f=>sql.prepare("UPDATE articles SET result_meta='{}' WHERE id=?").run(f.id)],
    ['attempt revision',f=>sql.prepare('UPDATE article_upload_attempts SET revision=revision+1 WHERE id=?').run(f.reservation.attempt.attempt_id)]
  ])await test(platform+' actual SQL snapshot catches concurrent '+label+' after entry article read',async()=>{
    const f=await readyFixture('snapshot-race',platform);let fired=0;beforeReadHook=({statement})=>{if(isAuthorizationSnapshot(statement)){beforeReadHook=null;fired++;mutate(f);}};
    refused(await authorization(f,{}, {race:true}));assert.equal(fired,1);assert.equal(readEvents.filter(e=>isAuthorizationSnapshot(e.statement)).length,1);
  });
  for(const boundary of ['consume-window','lease-expiry','clock-backwards'])await test(platform+' delayed authorization result refuses '+boundary+' crossing after genuine SELECT',async()=>{
    const f=await readyFixture('postquery-'+boundary,platform),saved=tick;if(boundary==='lease-expiry')setLease(f,{claim_expires:new Date(tick+5).toISOString()});let fired=0;
    readHook=({statement,value})=>{if(isAuthorizationSnapshot(statement)){assert.ok(value);readHook=null;fired++;tick+=boundary==='consume-window'?60001:boundary==='lease-expiry'?5:-1;}};
    try{refused(await authorization(f));assert.equal(fired,1);}finally{tick=Math.max(tick,saved);}
  });
  for(const [label,meta]of [['invalid JSON','not-json'],['null metadata',null],['missing output identity',JSON.stringify({sha256:'0'.repeat(64),size:1})],['wrong size type',JSON.stringify({sha256:'0'.repeat(64),size:'1',output_id:'synthetic'})]])await test(platform+' current corrupt '+label+' never echoes database internals',async()=>{const f=await readyFixture('bad-meta',platform);sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run(meta,f.id);refused(await authorization(f));});
  for(const [label,changes]of [['existing URL',{draft_url:editor(platform)}],['existing readback',{[platform==='toutiao'?'draft_readback':'readback']:'{"synthetic":true}'}]])await test(platform+' '+label+' cannot masquerade as unused empty-editor submission',async()=>{const f=await readyFixture('existing',platform);setLease(f,changes);refused(await authorization(f));});
  for(const [label,changes]of [['draft_observed',{state:'draft_observed'}],['verified',{state:'verified'}],['recorded editor URL',{editor_urls:JSON.stringify([editor(platform)])}],['recorded readback',{readback:'{"synthetic":true}'}]])await test(platform+' attempt '+label+' is never reissued',async()=>{const f=await readyFixture('attempt-state',platform);const keys=Object.keys(changes);sql.prepare('UPDATE article_upload_attempts SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?').run(...keys.map(k=>changes[k]),f.reservation.attempt.attempt_id);refused(await authorization(f));});
  await test(platform+' actual DB read rejection is generic, secret-free and performs no write',async()=>{const f=await readyFixture('db-error',platform);beforeReadHook=({statement})=>{if(isAuthorizationSnapshot(statement))throw Error('synthetic SQL failure private '+f.executionClaim);};const out=await authorization(f);refused(out);assert.equal(out.error,undefined);assert.equal(out.value.reason,'current_upload_authorization_not_confirmed');});
}

console.log(JSON.stringify({scope:'offline_synthetic_current_authorization_only',api_reads:apiReads,network_calls:networkCalls,cua_calls:0,mcp_calls:0,actual_platform_actions:0,real_Word_recreated:false}));
