// Offline boundary tests. Real source scanners, settings SQL and AES-GCM
// decryptor run here; unrelated provider/event/bucket dependencies never run.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';

const root=process.env.TEST_SOURCE||new URL('..',import.meta.url).pathname.replace(/\/$/u,'');
const native=createRequire((process.env.TEST_DEPENDENCY_ROOT||root)+'/package.json'),ts=native('typescript');
const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync(root+'/drizzle/0031_hot_article_imitation.sql','utf8'));
sql.exec('CREATE TABLE claude_settings(owner TEXT PRIMARY KEY,model TEXT,secret TEXT,enabled TEXT,updated TEXT);CREATE TABLE editorial_requests(id TEXT,owner TEXT,claim_hash TEXT);CREATE TABLE editorial_stages(id TEXT,owner TEXT,token TEXT);CREATE TABLE editorial_stages_v3(id TEXT,owner TEXT,token TEXT);CREATE TABLE topic_research_outbox(id TEXT,owner TEXT,lease_token TEXT);CREATE TABLE writing_runs(id TEXT,owner TEXT,token TEXT);CREATE TABLE articles(id TEXT,owner TEXT,claim_token TEXT);CREATE TABLE article_deliveries(id TEXT,owner TEXT,claim_token TEXT);CREATE TABLE outline_flow_stages(id TEXT,owner TEXT,token TEXT);');
sql.exec("CREATE TABLE editorial_agent_claim_recoveries_v3(owner TEXT,old_token_sha256 TEXT,new_token_sha256 TEXT);");
const owner='offline-v84-owner',other='offline-v84-other',secret='密钥🧪-V84.synthetic.configured.X7Y9Z2';
const master='01234567890123456789012345678901';
const ids=Array.from({length:10},(_,i)=>`f702e0fa-bac8-4a1c-bb89-${String(i+1).padStart(12,'0')}`);
const [claim,legacy,v3,researchLease,writer,article,delivery,outline]=ids;
const hotClaim=ids[8],hotLease=ids[9],otherHotClaim='b702e0fa-bac8-4a1c-bb89-687c70da39ec',otherHotLease='c702e0fa-bac8-4a1c-bb89-687c70da39ec';
let reads=0,decrypts=0,network=0,writes=0,reverse=false,failRead=null,hashes=0;
const queryCounts=new Map();
function record(query,args){
 reads++;queryCounts.set(query,(queryCounts.get(query)||0)+1);
 assert.ok(/^SELECT /u.test(query));assert.ok(args.every(arg=>arg===owner||arg===other||arg==='unconfigured'));
 if(failRead?.(query,args))throw Error('offline credential pool read failure');
}
const db={prepare:query=>({bind:(...args)=>({
 first:async()=>{record(query,args);return sql.prepare(query).get(...args)||null;},
 all:async()=>{record(query,args);const results=sql.prepare(query).all(...args);return {results:reverse?results.reverse():results};},
 run:async()=>{writes++;throw Error('Boundary must be read-only');}
})})};
const crypto={subtle:{
 importKey:webcrypto.subtle.importKey.bind(webcrypto.subtle),
 digest:async(...args)=>{hashes++;return webcrypto.subtle.digest(...args);},
 decrypt:async(...args)=>{decrypts++;return webcrypto.subtle.decrypt(...args);}
}};
const modules={},real=new Set(['claude','writing-input','credential-boundary','editorial-credential-text','editorial-credential-boundary','topic-research-security','credential-source-change']);
function compile(source,require){const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,Date,Set,Map,btoa,atob,AbortSignal,fetch:()=>{network++;throw Error('Offline network forbidden');}});return exports;}
function load(name){
 if(modules[name])return modules[name];
 const source=fs.readFileSync(root+'/lib/'+name+'.ts','utf8'),exports={};modules[name]=exports;
 const require=name=>name==='cloudflare:workers'?{env:{DB:db,CLAUDE_CONFIG_KEY:btoa(master)}}:name==='./test-store'?{db:()=>db}:name==='./legacy-generation'?{retiredGenerationNames:new Set()}:real.has(name.slice(2))?load(name.slice(2)):{};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URL,Date,Set,Map,btoa,atob,AbortSignal,fetch:()=>{network++;throw Error('Offline network forbidden');}});
 return exports;
}
const baselineResearch=compile(fs.readFileSync(root+'/tests/fixtures/topic-research-security-v83.ts.txt','utf8'),name=>name==='./test-store'?{db:()=>db}:load(name.slice(2)));
const baselineEditorial=compile(fs.readFileSync(root+'/tests/fixtures/editorial-credential-v83.ts.txt','utf8'),name=>name==='./test-store'?{db:()=>db}:name==='./topic-research-security'?baselineResearch:load(name.slice(2)));
const boundary=load('editorial-credential-boundary'),claude=load('claude'),research=load('topic-research-security');
const hash=value=>load('writing-input').hashText(value);
async function encryptedKey(forOwner,key){const iv=webcrypto.getRandomValues(new Uint8Array(12)),aes=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(master),{name:'AES-GCM'},false,['encrypt']);const data=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(forOwner)},aes,new TextEncoder().encode(key));return JSON.stringify({iv:Buffer.from(iv).toString('base64'),data:Buffer.from(data).toString('base64')});}
const configured=await encryptedKey(owner,secret),otherSecret='V84.other-owner.configured.X7Y9Z2',otherConfigured=await encryptedKey(other,otherSecret);
const tables=['editorial_agent_claim_recoveries_v3','claude_settings','editorial_requests','editorial_stages','editorial_stages_v3','topic_research_outbox','writing_runs','articles','article_deliveries','outline_flow_stages','hot_article_batches','hot_article_outbox'];
async function seed(){
 for(const table of tables)sql.exec('DELETE FROM '+table);
 sql.prepare('INSERT INTO claude_settings VALUES(?,?,?,?,?)').run(owner,'offline-model',configured,'0','2026-10-07');
 sql.prepare('INSERT INTO claude_settings VALUES(?,?,?,?,?)').run(other,'offline-model',otherConfigured,'0','2026-10-07');
 sql.prepare('INSERT INTO editorial_requests VALUES(?,?,?)').run('request',owner,await hash(claim));
 for(const [forOwner,token,lease] of [[owner,hotClaim,hotLease],[other,otherHotClaim,otherHotLease]]){
  sql.prepare('INSERT INTO hot_article_batches(id,owner,request_key,writer,state,claim_hash,created,updated) VALUES(?,?,?,?,?,?,?,?)').run('hot-'+forOwner,forOwner,'hot-request-'+forOwner,'xiaoyu_agent0YYLX','researching',await hash(token),'2026-10-07','2026-10-07');
  sql.prepare('INSERT INTO hot_article_outbox(batch_id,owner,event_id,state,lease_token,created) VALUES(?,?,?,?,?,?)').run('hot-'+forOwner,forOwner,'hot-event-'+forOwner,'sending',lease,'2026-10-07');
 }
 for(const [table,token] of [['editorial_stages',legacy],['editorial_stages_v3',v3],['topic_research_outbox',researchLease],['writing_runs',writer],['articles',article],['article_deliveries',delivery],['outline_flow_stages',outline]])sql.prepare('INSERT INTO '+table+' VALUES(?,?,?)').run(table,owner,token);
 reverse=false;failRead=null;
}
const percent=value=>[...new TextEncoder().encode(value)].map(byte=>'%'+byte.toString(16).padStart(2,'0')).join('');
const unicode=value=>value.split('').map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
let checks=0;
async function check(name,work){await seed();await work();checks++;console.log('PASS '+name);}

await check('real AES-GCM factory: six initial reads, DB-free inspection, six fresh reads and one decrypt',async()=>{
 const before=reads,beforeDecrypts=decrypts,context=await boundary.createEditorialCredentialScanContext(owner);
 assert.equal(reads-before,6);assert.equal(decrypts-beforeDecrypts,1);
 assert.deepEqual(Object.keys(context).sort(),['assertFresh','inspect']);assert.equal(Object.isFrozen(context),true);assert.equal(JSON.stringify(context),'{}');
 const start=reads;for(let i=0;i<12;i++)assert.equal(await context.inspect({note:'公开的离线合成内容',nested:[i]}),false);assert.equal(reads,start);
 const fresh=reads;await context.assertFresh();assert.equal(reads-fresh,6);assert.equal(decrypts-beforeDecrypts,1);
 assert.equal(await context.inspect('公开内容'),true);await assert.rejects(context.assertFresh(),/credential_source_changed/u);
});

await check('V83 differential: Unicode/percent/JSON/UUID/hash/generic credentials and original budgets',async()=>{
 const context=await boundary.createEditorialCredentialScanContext(owner);
 let deeply=secret;for(let i=0;i<20;i++)deeply=JSON.stringify(deeply);
 let percentDeep=secret;for(let i=0;i<9;i++)percentDeep=percent(percentDeep);
 const cases=[['prose',{note:'合成事实第一段\n第二段'},false],['empty','',false],['undefined',undefined,false],['large benign',{raw_response:'benign-data '.repeat(60000)},false],['other owner',otherSecret,false],['opaque',secret,true],['percent opaque',percent(secret),true],['unicode opaque',unicode(secret),true],['nested percent key',{[percent(secret)]:true},true],['mixed unicode percent',unicode(percent(secret)),true],['truncated JSON',{raw:'{"unparsed":"'+percent(secret)+'",'},true],['hashed claim',claim.toUpperCase(),true],['percent hashed claim',percent(claim),true],['legacy',legacy,true],['V3',v3.toUpperCase(),true],['research lease',researchLease.toUpperCase(),true],...[[writer,'writer'],[article,'article'],[delivery,'delivery'],[outline,'outline']].map(([token,name])=>[name+' lease',percent(token),true]),['double UUID',claim+v3,true],['generic','sk-'+'q'.repeat(32),true],['escaped generic',unicode('sk-'+'q'.repeat(32)),true],['field association',{'api_\\u006bey':unicode('A'.repeat(32))},true],['private key','-----BEGIN RSA PRIVATE KEY-----',true],['malformed unicode','public \\u00',true],['nested JSON budget',deeply,true],['percent layer budget',percentDeep,true],['text budget','x'.repeat(2000001),true]];
 for(const [label,value,expected] of cases){
  const old=await baselineEditorial.editorialCredentialHit(owner,value,[v3]),current=await boundary.editorialCredentialHit(owner,value,[v3]),before=reads,captured=await context.inspect(value);
  assert.equal(reads,before,label+' context query-free');assert.equal(old,expected,label+' V83 outcome');assert.equal(current,old,label+' default API parity');assert.equal(captured,old,label+' context parity');
 }
 const cyclic={};cyclic.self=cyclic;assert.equal(await context.inspect(cyclic),true);
 const manyIds=Array.from({length:1001},(_,i)=>`f702e0fa-bac8-4a1c-bb89-${String(i+1000).padStart(12,'0')}`).join(' ');assert.equal(await context.inspect(manyIds),true);
 await context.assertFresh();
});

await check('hot claim hashes and outbox leases are inspected without exposing another owner',async()=>{
 const context=await boundary.createEditorialCredentialScanContext(owner),before=reads;
 for(const value of [hotClaim,percent(hotClaim),hotLease,unicode(hotLease)])assert.equal(await context.inspect(value),true);
 for(const value of [otherHotClaim,otherHotLease])assert.equal(await context.inspect(value),false);
 assert.equal(reads,before);await context.assertFresh();
 for(const value of [hotClaim,hotLease])assert.equal(await boundary.editorialCredentialHit(owner,value),true);
});

await check('default research wrapper retains V83 outcomes, rejection semantics and configured-key protection',async()=>{
 for(const value of ['公开研究',secret,percent(secret),unicode(secret),claim+v3,researchLease,percent(researchLease),{api_key:'A'.repeat(32)},'x'.repeat(600001)])assert.equal(await research.researchCredentialHit(owner,value),await baselineResearch.researchCredentialHit(owner,value));
 await assert.rejects(research.researchCredentialHit(owner,undefined),/length/u);await assert.rejects(baselineResearch.researchCredentialHit(owner,undefined),/length/u);
 assert.equal((await claude.protectPreparedArticleForOwner(owner,secret)).hit,true);
});

await check('pure memo: exact JSON/type/extra, changed object, non-JSON values and budget overflow are still inspected',async()=>{
 const context=await boundary.createEditorialCredentialScanContext(owner),value={note:'公开合成事实'},before=reads;
 const memoValue={note:'e702e0fa-bac8-4a1c-bb89-687c70da39ec'};assert.equal(await context.inspect(memoValue),false);const inspectedHashes=hashes;assert.equal(await context.inspect(memoValue),false);assert.equal(hashes,inspectedHashes);
 assert.equal(await context.inspect(value),false);value.note=secret;assert.equal(await context.inspect(value),true);
 assert.equal(await context.inspect('separately-captured-extra'),false);assert.equal(await context.inspect('separately-captured-extra',['separately-captured-extra']),true);
 const withUndefined={note:undefined};assert.equal(await context.inspect(withUndefined),false);withUndefined.note=secret;assert.equal(await context.inspect(withUndefined),true);
 const accessor={get note(){return secret;}};assert.equal(await context.inspect(accessor),true);
 for(let i=0;i<140;i++)assert.equal(await context.inspect('公开'+i),false);
 assert.equal(await context.inspect('x'.repeat(1999998)+secret),true);
 assert.equal(reads,before);await context.assertFresh();
});

const mutations=[
 ['configuration key',async()=>sql.prepare('UPDATE claude_settings SET secret=? WHERE owner=?').run(await encryptedKey(owner,'V84.rotated.synthetic.key.X7Y9Z2'),owner)],
 ...['model','enabled','updated'].map(field=>['configuration '+field,()=>sql.prepare('UPDATE claude_settings SET '+field+'=? WHERE owner=?').run('changed',owner)]),
 ['configuration removal',()=>sql.prepare('DELETE FROM claude_settings WHERE owner=?').run(owner)],
 ['claim hash',async()=>sql.prepare('UPDATE editorial_requests SET claim_hash=? WHERE owner=?').run(await hash(ids[0]+'changed'),owner)],
 ['hot claim hash replace',async()=>sql.prepare('UPDATE hot_article_batches SET claim_hash=? WHERE owner=?').run(await hash('d702e0fa-bac8-4a1c-bb89-687c70da39ec'),owner)],
 ['hot claim hash add',async()=>sql.prepare('INSERT INTO hot_article_batches(id,owner,request_key,writer,state,claim_hash,created,updated) VALUES(?,?,?,?,?,?,?,?)').run('hot-added',owner,'hot-added','xiaoyu_agent0YYLX','researching',await hash('d702e0fa-bac8-4a1c-bb89-687c70da39ec'),'2026-10-07','2026-10-07')],
 ['hot claim hash remove',()=>sql.prepare('DELETE FROM hot_article_batches WHERE owner=?').run(owner)],
 ['hot outbox lease replace',()=>sql.prepare('UPDATE hot_article_outbox SET lease_token=? WHERE owner=?').run('V84-new-hot-lease',owner)],
 ['hot outbox lease add',()=>sql.prepare('INSERT INTO hot_article_outbox(batch_id,owner,event_id,state,lease_token,created) VALUES(?,?,?,?,?,?)').run('hot-added',owner,'hot-added','sending','V84-added-hot-lease','2026-10-07')],
 ['hot outbox lease remove',()=>sql.prepare('DELETE FROM hot_article_outbox WHERE owner=?').run(owner)],
 ...[['editorial_stages','token'],['editorial_stages_v3','token'],['topic_research_outbox','lease_token'],['writing_runs','token'],['articles','claim_token'],['article_deliveries','claim_token'],['outline_flow_stages','token']].flatMap(([table,field])=>[
  [table+' replace',()=>sql.prepare('UPDATE '+table+' SET '+field+'=? WHERE owner=?').run('V84-new-'+table+'-lease',owner)],
  [table+' add',()=>sql.prepare('INSERT INTO '+table+' VALUES(?,?,?)').run('new',owner,'V84-added-'+table+'-lease')],
  [table+' remove',()=>sql.prepare('DELETE FROM '+table+' WHERE owner=?').run(owner)]
 ]),
 ['same credential moved between writer lease sources',()=>{sql.prepare('DELETE FROM writing_runs WHERE owner=?').run(owner);sql.prepare('INSERT INTO articles VALUES(?,?,?)').run('transferred',owner,writer);}]
];
for(const [name,mutate] of mutations)await check(name+' rejects the enclosing load and seals the context',async()=>{
 const context=await boundary.createEditorialCredentialScanContext(owner);assert.equal(await context.inspect('公开内容'),false);await mutate();await assert.rejects(context.assertFresh(),/credential_source_changed/u);assert.equal(await context.inspect('公开内容'),true);
});

await check('new request gathers new key/lease/hash while previous request cannot be reused',async()=>{
 const first=await boundary.createEditorialCredentialScanContext(owner),rotated='V84.new-request.synthetic.key.X7Y9Z2',newLease='V84-new-request.lease',newClaim='e702e0fa-bac8-4a1c-bb89-687c70da39ec';
 assert.equal(await first.inspect(rotated),false);assert.equal(await first.inspect(newLease),false);assert.equal(await first.inspect(newClaim),false);
 sql.prepare('UPDATE claude_settings SET secret=? WHERE owner=?').run(await encryptedKey(owner,rotated),owner);sql.prepare('UPDATE editorial_stages_v3 SET token=? WHERE owner=?').run(newLease,owner);sql.prepare('UPDATE editorial_requests SET claim_hash=? WHERE owner=?').run(await hash(newClaim),owner);
 await assert.rejects(first.assertFresh(),/credential_source_changed/u);const before=reads,second=await boundary.createEditorialCredentialScanContext(owner);assert.equal(reads-before,6);
 for(const value of [rotated,newLease,newClaim])assert.equal(await second.inspect(value),true);await second.assertFresh();
});

await check('pool order and duplicate values do not create false freshness failures',async()=>{
 const context=await boundary.createEditorialCredentialScanContext(owner);reverse=true;
 sql.prepare('INSERT INTO editorial_stages_v3 VALUES(?,?,?)').run('duplicate',owner,v3);sql.prepare('INSERT INTO writing_runs VALUES(?,?,?)').run('duplicate',owner,writer);
 await context.assertFresh();
});

for(const table of ['claude_settings','editorial_requests','editorial_stages WHERE','editorial_stages_v3','topic_research_outbox','writing_runs','hot_article_batches','hot_article_outbox'])await check(table+' fresh read failure rejects and seals',async()=>{
 const context=await boundary.createEditorialCredentialScanContext(owner);failRead=query=>query.includes(table);await assert.rejects(context.assertFresh(),/offline credential pool read failure/u);assert.equal(await context.inspect('公开内容'),true);
});

await check('missing configuration still scans pools; newly added settings fail freshness',async()=>{
 sql.prepare('DELETE FROM claude_settings WHERE owner=?').run(owner);const context=await boundary.createEditorialCredentialScanContext(owner);assert.equal(await context.inspect(secret),false);assert.equal(await context.inspect(writer),true);sql.prepare('INSERT INTO claude_settings VALUES(?,?,?,?,?)').run(owner,'offline-model',configured,'0','2026-10-07');await assert.rejects(context.assertFresh(),/credential_source_changed/u);
});

assert.equal(network,0);assert.equal(writes,0);
console.log(JSON.stringify({result:'passed',checks,reads,decrypts,hashes,provider_calls:network,boundary_writes:writes,distinct_selects:queryCounts.size}));
