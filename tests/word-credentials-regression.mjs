// Real isolated workerd D1 and actual TS boundary; synthetic credentials only.
// No hook integration, renderer, production, external calls or nonce log output.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
const root=process.cwd(),h=createSyntheticHarness({projectRoot:root,migrate:false}),mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC WORD CREDENTIAL TEST")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'synthetic-word-credentials'}});
const hash=value=>createHash('sha256').update(value).digest('hex');let groups=0,queryCount=0,maxBinds=0;
const pass=name=>{groups++;console.log('PASS '+name);};
try{
 const real=await mf.getD1Database('DB');await migrate(drizzle(real),{migrationsFolder:'drizzle'});
 function counted(){return {prepare(sql){const q=real.prepare(sql);return {bind(...values){maxBinds=Math.max(maxBinds,values.length);return {async all(){queryCount++;return await q.bind(...values).all();}};}};}};}
 h.env.DB=counted();const b=h.loader()('word-credentials'),owner='synthetic-credential-owner',other='synthetic-other-owner',claim=randomUUID(),token=randomUUID();
 async function receipt(who,rawToken,rawClaim=claim){await real.prepare('INSERT INTO word_execution_receipts(owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,created) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(who,randomUUID(),'article',randomUUID(),hash('synthetic frozen source'),hash(rawClaim),hash(rawToken),randomUUID(),1,new Date().toISOString()).run();}
 await receipt(owner,token);const sentinel=b.WORD_CREDENTIAL_REDACTED;
 const normal={source_url:'https://public.example.org/photo.png',source_title:'正常公开图片来源',model:'synthetic-test-model',verification_summary:'Synthetic protocol only; no actual rendering',checked_pages:[1,2],sha256:'a'.repeat(64)};
 const before=queryCount;await b.assertWordCredentialFree(owner,normal,[claim,token]);assert.ok(JSON.stringify(await b.redactWordCredentialText(owner,normal))===JSON.stringify(normal));assert.equal(queryCount,before);pass('normal metadata stays exact; no UUID means zero D1 queries');
 assert.equal(await b.hasWordCredential(owner,randomUUID()),false); // Prove DB is healthy before positive suppression tests.

 for(const payload of [
  {metadata:{source_title:'Synthetic '+token}},
  {images:[{source_title:'Synthetic '+token.toUpperCase()}]},
  {observation:{candidate_urls:['https://public.example.org/'+token+'/photo.png']}},
  {message:'Synthetic failure '+token},
  {execution:{model:'Synthetic '+token,verification_summary:'Synthetic '+token}}
 ]){const start=queryCount;await assert.rejects(b.assertWordCredentialFree(owner,payload,[claim,token]),e=>e.message===b.WORD_CREDENTIAL_ERROR&&!e.message.includes(token));assert.equal(queryCount,start);assert.equal(await b.hasWordCredential(owner,payload,[claim,token]),true);}
 pass('five known leak field groups reject before any D1 call with constant safe error');

 const percent=value=>[...value].map(c=>'%'+c.charCodeAt(0).toString(16)).join('');
 const unicode=value=>[...value].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 let encoded=token;for(let depth=1;depth<=4;depth++){encoded=percent(encoded);await assert.rejects(b.assertWordCredentialFree(owner,'ordinary % text '+encoded,[token]));const redacted=await b.redactWordCredentialText(owner,{title:encoded});assert.ok(redacted.title===sentinel);}
 for(const value of [token.toUpperCase(),unicode(token.toUpperCase()),'ordinary % prose '+percent(token),'\\u0025'+percent(token).slice(1)]){await assert.rejects(b.assertWordCredentialFree(owner,value,[token]));const redacted=await b.redactWordCredentialText(owner,{title:value});assert.ok(redacted.title===sentinel);}
 const deeper=percent(encoded),deep=await b.redactWordCredentialText(owner,{title:deeper,normal:'normal 50% prose'});assert.ok(deep.title===sentinel);assert.ok(deep.normal==='normal 50% prose');
 pass('case, partial percent, four encoding layers and JSON unicode suppress; deeper ambiguity fails closed');

 const currentToken=randomUUID(),currentClaim=randomUUID();await real.prepare("INSERT INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,token_hash,status,reason,retry_count,updated) VALUES(?,'local_word',?,?,?,1,1,'paused',?,'await_executor','user_intent',0,?)").bind(owner,'localword_'+randomUUID(),hash('synthetic local input'),hash(currentClaim),hash(currentToken),new Date().toISOString()).run();
 assert.equal(await b.hasWordCredential(owner,{message:currentToken}),true);assert.equal(await b.hasWordCredential(owner,{message:currentClaim}),true);assert.equal(await b.hasWordCredential(owner,{message:claim}),true);
 await real.batch(Array.from({length:600},()=>real.prepare('INSERT INTO word_execution_receipts(owner,request_key,target_kind,target_id,input_sha256,claim_hash,token_hash,execution_id,epoch,created) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(owner,randomUUID(),'article',randomUUID(),hash('synthetic frozen source'),hash(randomUUID()),hash(randomUUID()),randomUUID(),2,new Date().toISOString())));
 const historical=await b.redactWordCredentialText(owner,{metadata:{source_title:token.toUpperCase()},observation:{candidate_urls:['https://public.example.org/'+token+'/photo.png']},message:'Synthetic '+token,execution:{model:token,verification_summary:unicode(token)}});
 assert.ok(historical.metadata.source_title===sentinel);assert.ok(historical.observation.candidate_urls[0]===sentinel);assert.ok(historical.message===sentinel);assert.ok(historical.execution.model===sentinel);assert.ok(historical.execution.verification_summary===sentinel);
 pass('all five read projection groups suppress current and historical hashes beyond 600 newer receipts across same-owner jobs');

 const foreign=randomUUID();await receipt(other,foreign,randomUUID());assert.equal(await b.hasWordCredential(owner,foreign),false);assert.equal(await b.hasWordCredential(other,foreign),true);
 const late=randomUUID();assert.equal(await b.hasWordCredential(owner,late),false);await receipt(owner,late);assert.equal(await b.hasWordCredential(owner,late),true);
 pass('owner boundary holds and a formerly negative candidate detects a newly stored receipt without negative cache');
 const shared=randomUUID(),coalescedStart=queryCount;
 assert.ok((await Promise.all(Array.from({length:8},()=>b.hasWordCredential(owner,{summary:shared})))).every(hit=>hit===false));assert.equal(queryCount-coalescedStart,1);
 const queuedStart=queryCount;assert.ok((await Promise.all(Array.from({length:8},()=>b.hasWordCredential(owner,{summary:randomUUID()})))).every(hit=>hit===false));assert.equal(queryCount-queuedStart,8);
 pass('eight identical lookups share one pending query; eight distinct healthy lookups queue and all complete without false credential hits');

 const legacyLocal=randomUUID(),legacyQueue=randomUUID(),legacyArticle=randomUUID(),stamp=new Date().toISOString(),legacyJob='localword_'+randomUUID();
 await real.prepare("INSERT INTO local_word_jobs(id,owner,request_key,source_kind,output_mode,destinations_json,filename,title,source_sha256,original_sha256,input_sha256,input_json,artifact_manifest,state,created,updated,claim_hash,dispatch_state,dispatch_attempts) VALUES(?,?,?,'local_desktop','word_only','[]','synthetic.docx','Synthetic',?,?,?,'{}','{}','processing',?,?,?,'accepted',0)").bind(legacyJob,owner,randomUUID(),hash('synthetic'),hash('synthetic'),hash('{}'),stamp,stamp,hash(legacyLocal)).run();
 await real.prepare('INSERT INTO local_word_queue_claims(owner,claim_request_key,execution_id,job_id,input_sha256,claim_hash,grant_ciphertext,expires,created) VALUES(?,?,?,?,?,?,?,?,?)').bind(owner,randomUUID(),randomUUID(),legacyJob,hash('{}'),hash(legacyQueue),'synthetic nonfunctional grant cipher','2000-01-01T00:00:00.000Z',stamp).run();
 await real.prepare('INSERT INTO article_claim_credential_hashes(owner,sha256,created) VALUES(?,?,?)').bind(owner,hash(legacyArticle),stamp).run();
 for(const legacy of [legacyLocal,legacyQueue,legacyArticle]){assert.equal(await b.hasWordCredential(owner,legacy),true);const protectedValue=await b.redactWordCredentialText(owner,{message:legacy.toUpperCase()});assert.ok(protectedValue.message===sentinel);assert.equal(await b.hasWordCredential(other,legacy),false);}
 pass('unadopted local current claims, immutable local queue claims and historical article claim hashes suppress without raw tokens');

 const unknowns=Array.from({length:512},()=>randomUUID()),start=queryCount;await b.assertWordCredentialFree(owner,{urls:unknowns});assert.ok(queryCount-start<=18);assert.ok(maxBinds<=37);
 const over=unknowns.concat(randomUUID()),overStart=queryCount;await assert.rejects(b.assertWordCredentialFree(owner,{urls:over}));assert.equal(queryCount,overStart);const limited=await b.redactWordCredentialText(owner,{urls:over,label:'normal',counts:{completed:8,total:12}});assert.ok(limited.urls.every(x=>x===sentinel));assert.ok(limited.label==='normal');assert.equal(limited.counts.completed,8);assert.equal(limited.counts.total,12);
 pass('512 candidates use bounded batches and at most18queries/37binds including queue/request history; overflow hides candidate fields without querying or altering counts');

 const publicId=randomUUID(),bytes=Uint8Array.from([1,2,3]);const plain={id:publicId,sha256:'b'.repeat(64),counts:{completed:8},bytes,normal:'normal metadata'};const intact=await b.redactWordCredentialText(owner,plain);assert.ok(intact.id===publicId);assert.ok(intact.sha256===plain.sha256);assert.equal(intact.counts.completed,8);assert.ok(intact.bytes===bytes);assert.ok(intact.normal===plain.normal);
 await assert.rejects(b.assertWordCredentialFree(owner,{request_key:token},[token]));await assert.rejects(b.assertWordCredentialFree(owner,{execution_id:token.toUpperCase()},[token]));await assert.rejects(b.assertWordCredentialFree(owner,{asset_id:token},[token]));
 pass('ordinary IDs/SHA/counts and opaque bytes stay exact; secret reused as a caller nonce rejects');

 h.env.DB={prepare(){throw Error('SYNTHETIC_D1_UNAVAILABLE');}};
 const failClosed=await b.redactWordCredentialText(owner,{summary:'Synthetic '+randomUUID(),normal:'normal metadata',counts:{completed:8,total:12},sha256:'c'.repeat(64)});assert.ok(failClosed.summary===sentinel);assert.ok(failClosed.normal==='normal metadata');assert.equal(failClosed.counts.completed,8);assert.ok(failClosed.sha256==='c'.repeat(64));await assert.rejects(b.assertWordCredentialFree(owner,'Synthetic '+randomUUID()));
 const grant={claim_token:claim,id:publicId},safeGrant={...grant,error:await b.redactWordCredentialText(owner,'Synthetic '+token)};assert.ok(safeGrant.claim_token===claim);assert.ok(safeGrant.id===publicId);assert.ok(safeGrant.error===sentinel);
 const cleanStart=queryCount;await b.assertWordCredentialFree(owner,'normal metadata',[claim,token]);assert.ok((await b.redactWordCredentialText(owner,'normal metadata'))==='normal metadata');assert.equal(queryCount,cleanStart);
 pass('D1 outage hides only selected candidate text; normal fields and externally merged claim grant/ID are preserved');

 let release;const blocked=new Promise(resolve=>{release=resolve;});let hangingCalls=0;
 h.env.DB={prepare(){return {bind(){return {async all(){hangingCalls++;await blocked;return {success:true,results:[]};}};}};}};
 const started=Date.now(),pending=Array.from({length:40},()=>b.redactWordCredentialText(owner,{summary:randomUUID()}));
 const timed=await Promise.all(pending);assert.ok(timed.every(x=>x.summary===sentinel));assert.equal(hangingCalls,2);assert.ok(Date.now()-started<1600);
 const fourthStart=Date.now(),fourth=await b.redactWordCredentialText(owner,{summary:randomUUID()});assert.ok(fourth.summary===sentinel);assert.equal(hangingCalls,2);assert.ok(Date.now()-fourthStart<1600);
 release();await new Promise(resolve=>setTimeout(resolve,20));h.env.DB=counted();assert.equal(await b.hasWordCredential(owner,randomUUID()),false);
 pass('one-second total deadline, two actual-query slots and at most 32 queued tasks suppress 40 stalled requests without releasing hung slots or issuing extra queries');

 const giant={summary:'x'.repeat(65537),normal:'normal metadata'},giantResult=await b.redactWordCredentialText(owner,giant);assert.ok(giantResult.summary===sentinel);assert.ok(giantResult.normal===giant.normal);await assert.rejects(b.assertWordCredentialFree(owner,giant));
 const cyclic={normal:'normal'};cyclic.loop=cyclic;await assert.rejects(b.assertWordCredentialFree(owner,cyclic));const cycles=await b.redactWordCredentialText(owner,cyclic);assert.ok(cycles.normal==='normal');assert.ok(cycles.loop===sentinel);
 pass('oversized or cyclic free-text subtrees fail closed while adjacent normal fields remain');
 assert.equal(h.externalCalls,0);console.log(`RESULT ${groups} groups PASS; real isolated workerd D1, synthetic credentials, zero external calls, no nonce logging; hook integration and production untested`);
}finally{h.close();await mf.dispose();}
