// Real SQLite + synthetic R2 and callback. No external API, browser or real user data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
const nativeRequire=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
let tick=Date.now(),batchTail=Promise.resolve(),beforeBatch=null;
class Clock extends Date{constructor(...args){super(...(args.length?args:[tick]));}static now(){return tick;}}
sql.function('strftime',(format,value)=>{assert.equal(format,'%Y-%m-%dT%H:%M:%fZ');assert.equal(value,'now');return new Clock().toISOString();});
const db={prepare:s=>({bind:(...v)=>({first:async()=>sql.prepare(s).get(...v)||null,all:async()=>({results:sql.prepare(s).all(...v)}),run:async()=>({meta:{changes:Number(sql.prepare(s).run(...v).changes)}})})}),batch(statements){
 const run=batchTail.then(async()=>{if(beforeBatch){const fn=beforeBatch;beforeBatch=null;fn();}sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}});
 batchTail=run.catch(()=>{});return run;
}};
const objects=new Map();let putHook=null;
const bucket={async put(key,bytes){if(putHook)await putHook(key);objects.set(key,new Uint8Array(bytes));},async head(key){return objects.has(key)?{size:objects.get(key).length}:null;},async get(key){const b=objects.get(key);return b?{arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}:null;}};
const sends=[];let connected=true,sendHook=null;
const events={readiness:async()=>({connected}),dispatch:async(owner,id,created,name,eventID)=>{sends.push({owner,id,eventID,name});if(sendHook)return sendHook();return '事件已送达，等待小鱼回应';}};
const modules={};
function load(name){if(modules[name])return modules[name];const exports={};modules[name]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket}}:n==='./events'?events:n.startsWith('./')?load(n.slice(2)):nativeRequire(n),crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Map,Error,URL,btoa,atob,Date:Clock,File,ReadableStream,Response,Request,AbortSignal,setTimeout,clearTimeout});return exports;}
const articles=load('articles'),tools=load('article-tools'),handoff=load('article-handoff');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function word(body='正文'){return zipSync({'[Content_Types].xml':strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<Relationships><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>原题</w:t></w:r></w:p><w:p><w:r><w:t>'+body+'</w:t></w:r></w:p></w:body></w:document>')});}
async function fixture(owner='manual-owner'){return {...await articles.createArticle(owner,new File(['原题\n正文'],'source.txt')),owner};}
const call=(f,name,args={})=>tools.articleCall(f.owner,name,{article_id:f.id,...args});
const stored=f=>sql.prepare('SELECT * FROM articles WHERE id=?').get(f.id);
async function outputFixture(bytes=word('错误正文')){const f=await fixture();sql.prepare("UPDATE articles SET state='queued' WHERE id=?").run(f.id);f.claim=await call(f,'claim_article');f.base={claim_token:f.claim.claim_token};f.output=await call(f,'begin_article_output',{...f.base,size:bytes.length,sha256:hash(bytes),chunks:1});f.bytes=bytes;return f;}
const restart=(f,extra={})=>call(f,'restart_article_output',{...f.base,expected_output_id:f.output.output_id,expected_sha256:f.output.sha256,size:word().length,sha256:hash(word()),chunks:1,reason:'invalid_word',...extra});
const chunk=(f,bytes=f.bytes)=>call(f,'put_article_output_chunk',{...f.base,output_id:f.output.output_id,index:0,data_base64:Buffer.from(bytes).toString('base64')});
const finalize=f=>call(f,'finalize_article_output',{...f.base,output_id:f.output.output_id});

const queued=await fixture();let notified=await handoff.notifyArticle(queued.owner,queued.id);
assert.equal(notified.notification.state,'delivered');assert.equal(stored(queued).state,'queued');
const publicQueued=(await articles.articleList(queued.owner)).find(x=>x.id===queued.id);
assert.equal(publicQueued.recovery.can_notify,true,'HTTP acceptance does not hide recovery before claim');
assert.equal(publicQueued.recovery.can_retry,false,'permission to notify again does not ask the user to click twice');
assert.equal(publicQueued.recovery.waiting_for_executor,true);
tick+=1000;await handoff.notifyArticle(queued.owner,queued.id);assert.equal(sends.length,2);assert.equal(sends[0].id,sends[1].id);assert.notEqual(sends[0].eventID,sends[1].eventID,'new wake is not swallowed by old webhook dedup');
const claim=await call(queued,'claim_article');const before=sends.length;
notified=await handoff.notifyArticle(queued.owner,queued.id);assert.equal(sends.length,before);assert.ok(notified.recovery.lease_expires);assert.equal(stored(queued).claim_token,claim.claim_token);
await assert.rejects(handoff.notifyArticle('foreign',queued.id));
const text=await fixture();sql.prepare("UPDATE articles SET state='text_saved' WHERE id=?").run(text.id);await assert.rejects(handoff.notifyArticle(text.owner,text.id));

const failedWake=await fixture();
sql.prepare("UPDATE articles SET state='failed',claim_token='old-ended',claim_expires=? WHERE id=?").run(new Clock(tick-1000).toISOString(),failedWake.id);
await handoff.notifyArticle(failedWake.owner,failedWake.id);
let failedView=(await articles.articleList(failedWake.owner)).find(x=>x.id===failedWake.id).recovery;
assert.equal(failedView.can_retry,false,'a retry request waits despite its old failure state');assert.equal(failedView.waiting_for_executor,true);
tick+=1000;sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Clock().toISOString(),failedWake.id);
failedView=(await articles.articleList(failedWake.owner)).find(x=>x.id===failedWake.id).recovery;
assert.equal(failedView.can_retry,true,'a later actual failure restores the fault-recovery action');

const uncertain=await fixture();sendHook=async()=>{throw Error('synthetic network loss');};await handoff.notifyArticle(uncertain.owner,uncertain.id);sendHook=null;
assert.equal((await handoff.articleHandoff(uncertain.owner,uncertain.id)).state,'unknown');assert.equal(stored(uncertain).state,'queued');
assert.equal((await articles.articleList(uncertain.owner)).find(x=>x.id===uncertain.id).recovery.can_retry,true);
const duplicate=await fixture();await Promise.all([handoff.notifyArticle(duplicate.owner,duplicate.id),handoff.notifyArticle(duplicate.owner,duplicate.id)]);
assert.equal(sends.filter(s=>s.id===duplicate.id).length,1,'simultaneous buttons issue one wake');
const expired=await fixture();sql.prepare('INSERT INTO article_handoffs VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),expired.owner,expired.id,'stale-wake','sending',new Clock(tick-120000).toISOString(),new Clock(tick-120000).toISOString(),new Clock(tick-1000).toISOString());
assert.equal((await articles.articleList(expired.owner)).find(x=>x.id===expired.id).recovery.can_retry,true,'abandoned send retains explicit recovery without an automatic resend');
await handoff.notifyArticle(expired.owner,expired.id);assert.equal(sql.prepare("SELECT state FROM article_handoffs WHERE event_id='stale-wake'").get().state,'unknown');
const late=await fixture();let notifyRelease,notifyStarted;const sendingStarted=new Promise(r=>notifyStarted=r),sendingRelease=new Promise(r=>notifyRelease=r);
sendHook=async()=>{sendHook=null;notifyStarted();await sendingRelease;throw Error('old send failed late');};const oldSend=handoff.notifyArticle(late.owner,late.id);await sendingStarted;tick+=61000;await handoff.notifyArticle(late.owner,late.id);notifyRelease();await oldSend;
assert.equal(stored(late).error,null,'late old send cannot overwrite latest success');assert.equal((await handoff.articleHandoff(late.owner,late.id)).state,'delivered');

const partial=await fixture();sql.prepare("UPDATE articles SET state='completed',result_key='frozen-word',draft_url='https://mp.toutiao.com/draft?pgc_id=123',claim_token='terminal-token',claim_expires=? WHERE id=?").run(new Clock(tick+999999).toISOString(),partial.id);
sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)').run(partial.id+':zhihu',partial.owner,partial.id,'zhihu','needs_verification',new Clock().toISOString());
const partialBefore=JSON.stringify(stored(partial));await handoff.notifyArticle(partial.owner,partial.id);assert.equal(JSON.stringify(stored(partial)),partialBefore,'resume destination keeps main terminal and Word');
let partialView=(await articles.articleList(partial.owner)).find(x=>x.id===partial.id).recovery;
assert.equal(partialView.can_retry,false);assert.equal(partialView.waiting_for_executor,true,'old destination fault waits after its new request');
tick+=1000;sql.prepare("UPDATE article_deliveries SET updated=? WHERE article_id=? AND platform='zhihu'").run(new Clock().toISOString(),partial.id);
partialView=(await articles.articleList(partial.owner)).find(x=>x.id===partial.id).recovery;
assert.equal(partialView.can_retry,true,'a newly recorded destination fault has a recovery action');
const partialRead=await call(partial,'read_article');assert.deepEqual(Array.from(partialRead.continuation.remaining_platforms),['zhihu']);assert.equal(partialRead.continuation.next_tool,'claim_article_delivery');assert.equal(partialRead.continuation.reuse_existing_word,true);
const terminalClaim=await call(partial,'claim_article');assert.equal(terminalClaim.claimed,false);assert.equal(terminalClaim.continuation.next_platform,'zhihu');assert.equal(terminalClaim.continuation.new_platform_upload_allowed,false);
const zhihuClaim=await call(partial,terminalClaim.continuation.next_tool,{platform:terminalClaim.continuation.next_platform});assert.equal(zhihuClaim.claimed,true);assert.equal(zhihuClaim.state,'needs_verification');assert.equal(JSON.stringify(stored(partial)),partialBefore,'independent destination claim keeps completed main and Word unchanged');
sql.prepare("UPDATE article_deliveries SET state='saved',claim_expires=? WHERE article_id=?").run(new Clock().toISOString(),partial.id);assert.equal((await call(partial,'read_article')).continuation.next_tool,null,'both platforms complete: no further claim');

const invalid=await outputFixture();await chunk(invalid);await assert.rejects(finalize(invalid));
const frozen=stored(invalid),oldKeys=[...objects.keys()];const repaired=await restart(invalid);
assert.notEqual(repaired.claim_token,invalid.claim.claim_token);assert.notEqual(repaired.output.output_id,invalid.output.output_id);
for(const field of ['source_key','paragraphs','title','artifact_manifest'])assert.equal(stored(invalid)[field],frozen[field]);
for(const key of oldKeys)assert.ok(objects.has(key));
assert.equal(sql.prepare('SELECT count(*) n FROM article_output_restarts WHERE article_id=?').get(invalid.id).n,1);
await assert.rejects(chunk(invalid));await assert.rejects(restart(invalid));
await assert.rejects(call(invalid,'finalize_article_output',{claim_token:repaired.claim_token,output_id:invalid.output.output_id}));
invalid.base={claim_token:repaired.claim_token};invalid.output=repaired.output;invalid.bytes=word();await chunk(invalid);await finalize(invalid);
assert.equal(stored(invalid).state,'word_ready');await assert.rejects(restart(invalid));

for(const block of ['delivery','upload','draft','expired','foreign','changed','race_platform']){
 const f=await outputFixture();
 if(block==='delivery')sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)').run(f.id+':zhihu',f.owner,f.id,'zhihu','pending',new Clock().toISOString());
 if(block==='upload')sql.prepare('INSERT INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),f.owner,f.id,'toutiao','account','a'.repeat(64),1,'verify_existing','b'.repeat(64),'{}','{}','outcome_unknown','[]',new Clock().toISOString(),new Clock().toISOString());
 if(block==='draft')sql.prepare("UPDATE articles SET draft_url='https://mp.toutiao.com/draft?pgc_id=1' WHERE id=?").run(f.id);
 if(block==='expired')sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Clock(tick-1).toISOString(),f.id);
 if(block==='foreign')f.owner='foreign';
 if(block==='race_platform')beforeBatch=()=>sql.prepare('INSERT INTO article_deliveries(id,owner,article_id,platform,state,updated) VALUES(?,?,?,?,?,?)').run(f.id+':zhihu',f.owner,f.id,'zhihu','pending',new Clock().toISOString());
 const snapshot=stored(f).result_meta;await assert.rejects(restart(f,block==='changed'?{expected_sha256:'0'.repeat(64)}:{}),undefined,block);assert.equal(stored(f).result_meta,snapshot);assert.equal(sql.prepare('SELECT count(*) n FROM article_output_restarts WHERE article_id=?').get(f.id).n,0);
}

const race=await outputFixture();const restarts=await Promise.allSettled([restart(race),restart(race)]);assert.equal(restarts.filter(r=>r.status==='fulfilled').length,1);
const expiryRace=await outputFixture();beforeBatch=()=>{tick=Date.parse(stored(expiryRace).claim_expires)+1;};await assert.rejects(restart(expiryRace));assert.equal(sql.prepare('SELECT count(*) n FROM article_output_restarts WHERE article_id=?').get(expiryRace.id).n,0,'lease expiring at commit cannot be revived');
for(const phase of ['chunk','finalize']){
 const f=await outputFixture(word());if(phase==='finalize')await chunk(f);
 let signal,release;const paused=new Promise(r=>signal=r),resume=new Promise(r=>release=r);
 putHook=async key=>{if((phase==='chunk'&&key.includes('/output/'))||(phase==='finalize'&&key.includes('/result-'))){putHook=null;signal();await resume;}};
 const old=(phase==='chunk'?chunk(f):finalize(f));const rejected=assert.rejects(old);
 await paused;const newAttempt=await restart(f);release();await rejected;
 assert.equal(JSON.parse(stored(f).result_meta).output_id,newAttempt.output.output_id);assert.equal(stored(f).result_key,null);
}

const heartbeat=await outputFixture();const token=heartbeat.base.claim_token;tick+=1000;
assert.equal((await call(heartbeat,'renew_article_claim',{platform:'toutiao',claim_token:token})).renewed,true);assert.equal(stored(heartbeat).claim_token,token);
sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Clock(tick-1).toISOString(),heartbeat.id);await assert.rejects(call(heartbeat,'renew_article_claim',{platform:'toutiao',claim_token:token}));
const reclaim=await call(heartbeat,'claim_article');assert.notEqual(reclaim.claim_token,token);await assert.rejects(call(heartbeat,'renew_article_claim',{platform:'toutiao',claim_token:token}));

for(let i=0;i<32;i++){tick+=1000;const f=await fixture('worklist-owner');sql.prepare("UPDATE articles SET state=? WHERE id=?").run(i===0?'needs_verification':'queued',f.id);}
const page1=await articles.articleWorklist('worklist-owner');assert.equal(page1.pending_total,32);assert.equal(page1.next_offset,25);const page2=await articles.articleWorklist('worklist-owner',page1.next_offset);assert.equal(page2.items.length,7);assert.equal(page2.next_offset,null);assert.ok(page2.items.some(r=>r.state==='needs_verification'),'old blocked article survives new uploads');
for(const row of [...page1.items,...page2.items])for(const secret of ['claim_token','source_key','result_key'])assert.equal(row[secret],undefined);
console.log('PASS mainline fault tests: durable accepted/unknown/stale notifications; distinct wake/same article; duplicate and live-lease guards; destination-only resume; exact Word repair audit and old-worker fencing; platform/owner/expiry/concurrency refusals; heartbeat expiry; paged old-work visibility. Real external calls=0.');
