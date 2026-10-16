// Offline security/concurrency tests: real SQLite and actual finish/consume functions.
// Ancillary Word/credential parsers are isolated stubs; this is not an OOXML or browser test.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE articles(id TEXT PRIMARY KEY,owner TEXT,state TEXT,source_key TEXT,result_key TEXT,result_meta TEXT,claim_token TEXT,claim_expires TEXT,paragraphs TEXT,artifact_manifest TEXT,draft_url TEXT,draft_readback TEXT,upload_guard_version INTEGER);
 CREATE TABLE article_deliveries(id TEXT PRIMARY KEY,owner TEXT,article_id TEXT,platform TEXT,state TEXT,claim_token TEXT,claim_expires TEXT,draft_url TEXT,readback TEXT,message TEXT,updated TEXT);
 CREATE TABLE article_upload_attempts(id TEXT PRIMARY KEY,owner TEXT,article_id TEXT,platform TEXT,attempt_version INTEGER,previous_attempt_id TEXT,revision INTEGER,state TEXT,consumed_at TEXT,claim_hash TEXT,target_account TEXT,word_sha256 TEXT,word_size INTEGER,authorization_kind TEXT,preflight TEXT,baseline TEXT,editor_urls TEXT,readback TEXT,created TEXT,updated TEXT,reimport_authorization TEXT,consume_token_sha256 TEXT,confirmation_message_id TEXT,authorization_key TEXT);
 CREATE TABLE article_upload_executor_ends(attempt_id TEXT PRIMARY KEY,owner TEXT,article_id TEXT,platform TEXT,attempt_sha256 TEXT,attempt_snapshot TEXT,claim_sha256 TEXT,execution_end_reference TEXT,created TEXT);
 CREATE TABLE article_upload_diagnostics(id TEXT PRIMARY KEY,owner TEXT,article_id TEXT,platform TEXT,cause TEXT);
 CREATE TABLE article_deletions(id TEXT,owner TEXT);
 CREATE TABLE article_claim_credential_hashes(owner TEXT,sha256 TEXT,created TEXT,UNIQUE(owner,sha256));
 CREATE TABLE editorial_request_outbox(owner TEXT,lease_token TEXT);
 CREATE TABLE writing_runs(owner TEXT,article_id TEXT);
 CREATE TABLE editorial_runs_v3(owner TEXT,article_id TEXT);
 CREATE TABLE editorial_flows(owner TEXT,article_id TEXT);
 CREATE TABLE outline_flows(owner TEXT,article_id TEXT);`);
const tick=Date.parse('2026-10-07T20:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[tick]));}static now(){return tick;}}
const now=()=>new Clock().toISOString(),future=()=>new Clock(tick+6*3600000).toISOString();
const hash=value=>createHash('sha256').update(value).digest('hex');
let beforeRun=null,networkCalls=0;
const db={prepare:statement=>({bind:(...values)=>({
 first:async()=>sql.prepare(statement).get(...values)||null,
 all:async()=>({results:sql.prepare(statement).all(...values)}),
 run:async()=>{if(beforeRun)await beforeRun(statement,values);return {meta:{changes:Number(sql.prepare(statement).run(...values).changes)}};}
})})};
const bytes=new TextEncoder().encode('Synthetic Word parser boundary; not real OOXML'),wordHash=hash(bytes);
const outsideFinishScope=()=>{throw Error('Ancillary recovery operation is outside this finish/consume test');};
const stubs={
 './test-store':{db:()=>db},
 './article-claim-credentials':{rememberArticleClaimHashes:async(owner,...tokens)=>{for(const token of tokens)if(token)await db.prepare('INSERT OR IGNORE INTO article_claim_credential_hashes(owner,sha256,created) VALUES(?,?,?)').bind(owner,hash(token.toLowerCase()),now()).run();},hasArticleClaimCredential:async()=>false},
 './articles':{bucket:()=>({head:async()=>({size:bytes.length}),get:async()=>({arrayBuffer:async()=>bytes.buffer})})},
 './article-format':{MAX_FILE:50000000,parseArticle:()=>['合成标题','合成正文'],assertOriginalText:(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b))},
 './article-manifest':{inspectUploadWord:async(manifest,original)=>{assert.equal(manifest,null);assert.equal(JSON.stringify(original),JSON.stringify(['合成标题','合成正文']));return {text:original.slice(),images:[]};},inspectWordImages:async()=>[],parseArtifactManifest:()=>null,verifyWordManifest:async()=>{},draftReadbackSchema:{properties:{title:{},paragraphs:{},images:{items:{properties:{after_paragraph:{}}}},cover:{}},required:[]}},
 './editorial-credential-boundary':{editorialCredentialHit:async()=>false,createEditorialCredentialScanContext:outsideFinishScope},
 './credential-boundary':{inspectCredentialValue:()=>({hit:false})},
 // Only finish is exercised through articleClaimRecoveryCall; accidental use
 // of another recovery operation fails instead of receiving a permissive stub.
 './word-credentials':{assertWordCredentialFree:outsideFinishScope},
 './article-word-claim-guard':{unfinishedManualWordClaim:outsideFinishScope,unfinishedManualWordClaimSql:'unexercised_finish_scope',prewordClaimGuidance:outsideFinishScope},
};
function load(name){
 let source=stripTypeScriptTypes(fs.readFileSync('lib/'+name+'.ts','utf8'),{mode:'strip'});
 const names=[...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m=>m[1]);
 source=source.replace(/import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;/g,(_,bindings,quote,path)=>'const {'+bindings+'}=require('+JSON.stringify(path)+');').replace(/\bexport\s+/g,'');
 const exports={};vm.runInNewContext(source+'\nObject.assign(exports,{'+names.join(',')+'});',{exports,require:path=>{if(!stubs[path])throw Error('Unexpected dependency '+path);return stubs[path];},crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Map,Error,URL,Date:Clock,fetch:()=>{networkCalls++;throw Error('Network forbidden');}});
 return exports;
}
const executionEndModule=load('article-upload-execution-end');
const {finishArticleUploadExecution:finish,articleUploadExecutionEndTool:descriptor}=executionEndModule;
// Load the actual metadata reader into this explicitly isolated dependency map.
stubs['./article-upload-recovery-diagnostics']=load('article-upload-recovery-diagnostics');
// Follow current production imports without bypassing receipt validation or
// fixed public diagnostic handling. Only the declared Word parser is synthetic.
stubs['./article-upload-word']=load('article-upload-word');
stubs['./article-upload-errors']=load('article-upload-errors');
stubs['./workflow-errors']=load('workflow-errors');
stubs['./article-upload-consume-diagnostics']=load('article-upload-consume-diagnostics');
const uploadModule=load('article-upload-attempts');
const {articleUploadCall,authorizedUploadAccounts}=uploadModule;
stubs['./article-upload-execution-end']=executionEndModule;
stubs['./article-upload-attempts']=uploadModule;
const recoveryModule=load('article-claim-recovery');
let sequence=0,cases=0;
const article=item=>sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id);
const delivery=item=>sql.prepare("SELECT * FROM article_deliveries WHERE article_id=? AND platform='zhihu'").get(item.id);
function fixture(platform='toutiao',state='needs_verification'){
 const item={id:'synthetic-'+(++sequence),owner:'owner-'+sequence,claim:crypto.randomUUID(),platform};
 sql.prepare('INSERT INTO articles(id,owner,state,result_key,result_meta,claim_token,claim_expires,paragraphs,upload_guard_version) VALUES(?,?,?,?,?,?,?,?,?)').run(item.id,item.owner,platform==='toutiao'?state:'completed','word/'+item.id,JSON.stringify({sha256:wordHash,size:bytes.length}),platform==='toutiao'?item.claim:crypto.randomUUID(),future(),JSON.stringify(['合成标题','合成正文']),1);
 if(platform==='zhihu')sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,claim_expires,updated) VALUES(?,?,?,?,?,?,?,?)').run('delivery-'+sequence,item.owner,item.id,platform,state,item.claim,future(),now());
 sql.prepare('INSERT INTO article_upload_diagnostics VALUES(?,?,?,?,?)').run('diag-'+sequence,item.owner,item.id,platform,'tool_unavailable');
 return item;
}
const args=item=>({article_id:item.id,platform:item.platform,execution_claim:item.claim,executor_stopped:true});
const run=item=>finish(item.owner,article(item),args(item));
function addAttempt(item,{platform=item.platform,version=1,state='outcome_unknown',consumed=true,ended=false,claim=item.claim}={}){
 const id=item.id+'-'+platform+'-'+version,account=authorizedUploadAccounts[platform];
 const file={filename:'合成.docx',absolute_path:'/mock/合成.docx',browser_session:'synthetic-session',visible_in_browser:true,sha256:wordHash,size:bytes.length,checked_at:now()};
 const preflight={file,existing_drafts:{checked_at:now()}};
 sql.prepare('INSERT INTO article_upload_attempts(id,owner,article_id,platform,attempt_version,revision,state,consumed_at,claim_hash,target_account,word_sha256,word_size,authorization_kind,preflight,baseline,editor_urls,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,item.owner,item.id,platform,version,0,state,consumed?now():null,hash(claim),account,wordHash,bytes.length,'new_word',JSON.stringify(preflight),'{}','[]',now(),now());
 if(ended)sql.prepare('INSERT INTO article_upload_executor_ends(attempt_id,owner,article_id,platform,execution_end_reference) VALUES(?,?,?,?,?)').run(id,item.owner,item.id,platform,'synthetic-ended');
 return {id,file};
}
const history=item=>JSON.stringify(['article_upload_attempts','article_upload_executor_ends','article_upload_diagnostics'].map(t=>sql.prepare('SELECT * FROM '+t+' WHERE article_id=? ORDER BY rowid').all(item.id)));
const consume=(item,attempt,claim=item.claim)=>articleUploadCall(item.owner,article(item),'consume_article_upload',{platform:item.platform,attempt_id:attempt.id,execution_claim:claim,target_account:authorizedUploadAccounts[item.platform],file_confirmation:attempt.file});
async function test(name,action){try{await action();cases++;console.log('PASS '+name);}finally{beforeRun=null;}}

await test('self finish releases recovered lease, preserves all prior attempts, diagnoses and Word',async()=>{
 const item=fixture();addAttempt(item,{ended:true,claim:crypto.randomUUID()});const before=article(item),frozen=history(item);
 const result=await run(item);assert.equal(result.released,true);assert.equal(result.new_upload_allowed,false);assert.equal(result.execute_import,false);assert.equal(JSON.stringify(result).includes(item.claim),false);
 const after=article(item);assert.deepEqual({...after,claim_token:before.claim_token,claim_expires:before.claim_expires},{...before});assert.equal(after.claim_token,null);assert.equal(after.claim_expires,null);assert.equal(history(item),frozen);
 await assert.rejects(run(item),/current live/);
});
await test('wrong owner, wrong token, expired claim and malformed scope cannot release',async()=>{
 for(const kind of ['owner','token','expired','platform','article','missing-ack']){const item=fixture(),a=args(item);let owner=item.owner;
  if(kind==='owner')owner='another-owner';if(kind==='token')a.execution_claim=crypto.randomUUID();if(kind==='expired')sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Clock(tick).toISOString(),item.id);if(kind==='platform')a.platform='baijiahao';if(kind==='article')a.article_id='another-article';if(kind==='missing-ack')delete a.executor_stopped;
  const before=JSON.stringify(article(item));await assert.rejects(finish(owner,article(item),a));assert.equal(JSON.stringify(article(item)),before);
 }
});
await test('every older consumed unknown/draft/verified attempt requires its own exact end',async()=>{
 for(const state of ['outcome_unknown','draft_observed','verified']){const item=fixture();addAttempt(item,{state,claim:crypto.randomUUID()});addAttempt(item,{version:2,ended:true});const before=history(item);await assert.rejects(run(item),/not ended/);assert.equal(article(item).claim_token,item.claim);assert.equal(history(item),before);}
});
await test('an end with mismatched owner, article or destination does not satisfy consumed guard',async()=>{
 for(const column of ['owner','article_id','platform']){const item=fixture(),a=addAttempt(item,{ended:true});sql.prepare('UPDATE article_upload_executor_ends SET '+column+'=? WHERE attempt_id=?').run('wrong-scope',a.id);await assert.rejects(run(item),/not ended/);assert.equal(article(item).claim_token,item.claim);}
});
await test('reserved old permit remains immutable and cannot consume after finish or under a new claim',async()=>{
 const item=fixture('toutiao','word_ready'),a=addAttempt(item,{state:'reserved',consumed:false}),before=history(item);
 await run(item);await assert.rejects(consume(item,a),/Current execution claim/);assert.equal(history(item),before);
 const successor=crypto.randomUUID();sql.prepare('UPDATE articles SET claim_token=?,claim_expires=? WHERE id=?').run(successor,future(),item.id);await assert.rejects(consume(item,a,successor),/claim changed/);assert.equal(history(item),before);
});
await test('Zhihu finish preserves main claim and its independently unended attempt',async()=>{
 const item=fixture('zhihu'),aBefore=JSON.stringify(article(item));addAttempt(item,{ended:true});addAttempt(item,{platform:'toutiao'});const before=delivery(item),frozen=history(item);await run(item);
 assert.equal(JSON.stringify(article(item)),aBefore);assert.equal(delivery(item).claim_token,null);assert.equal(delivery(item).state,before.state);assert.equal(history(item),frozen);
});
await test('Toutiao finish leaves independent Zhihu lease and attempt intact',async()=>{
 const item=fixture();sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,claim_token,claim_expires,updated) VALUES(?,?,?,?,?,?,?,?)').run('zh-'+sequence,item.owner,item.id,'zhihu','saving',crypto.randomUUID(),future(),now());addAttempt(item,{platform:'zhihu'});const before=JSON.stringify(delivery(item)),frozen=history(item);await run(item);assert.equal(JSON.stringify(delivery(item)),before);assert.equal(history(item),frozen);
});
await test('processing, deleting and terminal phases cannot use platform finish',async()=>{
 for(const [platform,state] of [['toutiao','processing'],['toutiao','deleting'],['toutiao','completed'],['zhihu','saved']]){const item=fixture(platform,state),before=JSON.stringify(article(item)),d=JSON.stringify(delivery(item));await assert.rejects(run(item));assert.equal(JSON.stringify(article(item)),before);assert.equal(JSON.stringify(delivery(item)),d);}
 const item=fixture();sql.prepare('INSERT INTO article_deletions VALUES(?,?)').run(item.id,item.owner);await assert.rejects(run(item));assert.equal(article(item).claim_token,item.claim);
});
await test('simultaneous finishes release exactly once',async()=>{
 const item=fixture(),results=await Promise.allSettled([run(item),run(item)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(article(item).claim_token,null);
});
await test('claim rotation between read and finish preserves successor claim',async()=>{
 for(const platform of ['toutiao','zhihu']){const item=fixture(platform),successor=crypto.randomUUID();let fired=false;
  beforeRun=statement=>{if(!fired&&statement.startsWith('UPDATE '+(platform==='toutiao'?'articles':'article_deliveries'))){fired=true;sql.prepare('UPDATE '+(platform==='toutiao'?'articles':'article_deliveries')+' SET claim_token=? WHERE '+(platform==='toutiao'?'id':'article_id')+'=?').run(successor,item.id);}};
  await assert.rejects(run(item),/changed/);assert.equal(fired,true);assert.equal((platform==='toutiao'?article(item):delivery(item)).claim_token,successor);beforeRun=null;
 }
});
await test('actual consume wins race and atomically refuses finish',async()=>{
 for(const platform of ['toutiao','zhihu']){const item=fixture(platform,platform==='toutiao'?'word_ready':'pending'),a=addAttempt(item,{state:'reserved',consumed:false});let fired=false;
  beforeRun=async statement=>{if(!fired&&statement.startsWith('UPDATE '+(platform==='toutiao'?'articles':'article_deliveries'))){fired=true;assert.equal((await consume(item,a)).execute_import,true);}};
  await assert.rejects(run(item),/not ended/);assert.equal(fired,true);assert.equal((platform==='toutiao'?article(item):delivery(item)).claim_token,item.claim);assert.equal(sql.prepare('SELECT consumed_at FROM article_upload_attempts WHERE id=?').get(a.id).consumed_at,now());beforeRun=null;
 }
});
await test('finish wins race and actual consume returns execute_import=false',async()=>{
 for(const platform of ['toutiao','zhihu']){const item=fixture(platform,platform==='toutiao'?'word_ready':'pending'),a=addAttempt(item,{state:'reserved',consumed:false}),before=history(item);let fired=false;
  beforeRun=async statement=>{if(!fired&&statement.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'")){fired=true;assert.equal((await run(item)).released,true);}};
  assert.equal((await consume(item,a)).execute_import,false);assert.equal(fired,true);assert.equal(history(item),before);assert.equal((platform==='toutiao'?article(item):delivery(item)).claim_token,null);beforeRun=null;
 }
});
await test('concurrently arriving older unended consumed attempt prevents finish',async()=>{
 const item=fixture();let fired=false;beforeRun=statement=>{if(!fired&&statement.startsWith('UPDATE articles SET claim_token=NULL')){fired=true;addAttempt(item,{claim:crypto.randomUUID()});}};await assert.rejects(run(item),/not ended/);assert.equal(article(item).claim_token,item.claim);
});
await test('artifact or phase changes between read and finish are refused',async()=>{
 for(const platform of ['toutiao','zhihu']){const item=fixture(platform);let fired=false;beforeRun=statement=>{if(!fired&&statement.startsWith('UPDATE '+(platform==='toutiao'?'articles':'article_deliveries'))){fired=true;sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run('{"changed":true}',item.id);}};await assert.rejects(run(item),/changed/);assert.equal((platform==='toutiao'?article(item):delivery(item)).claim_token,item.claim);beforeRun=null;}
});
await test('tool is strict, routed in recovery tools, and grants no import',async()=>{
 assert.equal(descriptor.inputSchema.additionalProperties,false);assert.equal(descriptor.inputSchema.properties.executor_stopped.const,true);assert.deepEqual([...descriptor.inputSchema.required],['article_id','platform','execution_claim','executor_stopped']);
 assert.equal(recoveryModule.articleClaimRecoveryNames.has(descriptor.name),true);assert.equal(recoveryModule.articleClaimRecoveryTools.find(t=>t.name===descriptor.name),descriptor);
 const item=fixture();assert.equal((await recoveryModule.articleClaimRecoveryCall(item.owner,article(item),descriptor.name,args(item))).released,true);assert.equal(article(item).claim_token,null);
});
assert.equal(networkCalls,0);
console.log(`${cases} execution-end security/concurrency groups passed; actual finish/consume SQL, isolated synthetic SQLite, platform/provider/network calls=0.`);
