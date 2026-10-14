// Independent actual-Site-TypeScript/workerd-D1 checks. Synthetic records only.
// Source-contract assertions are added only after the root publishes that contract.
// Never production reads/writes, real manuscripts, session logs or extracted tokens.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness,barrier,withDeadline} from './word-recovery-harness.mjs';
import {hash,owner,seed,native,base,operations} from './word-phase-pool-fixture.mjs';
import {png,docx} from './word-recovery-artifact-fixture.mjs';

// SQL hooks only delay actual workerd operations or discard a committed response.
// They do not model the Site's permissions, clock, provenance or recovery behavior.
function instrument(db){
  const hooks=[];
  const on=(method,match,action,phase='before')=>hooks.push({method,match,action,phase});
  async function notify(method,phase,context){
    const hook=hooks.find(x=>x.method===method&&x.phase===phase&&x.match(context));
    if(hook){hooks.splice(hooks.indexOf(hook),1);await hook.action(context);}
  }
  function prepare(source,values=[]){
    const statement={source,values,native:db.prepare(source).bind(...values),bind:(...bound)=>prepare(source,bound)};
    for(const method of ['first','all','run'])statement[method]=async(...args)=>{
      await notify(method,'before',statement);const result=await statement.native[method](...args);
      await notify(method,'after',{...statement,result});return result;
    };
    return statement;
  }
  const d1={prepare,exec:source=>db.exec(source),async batch(statements){
    const context={source:statements.map(x=>x.source).join('\n'),statements};
    await notify('batch','before',context);let result;
    try{result=await db.batch(statements.map(x=>x.native));}catch(error){
      // Compile-only diagnosis never executes a partial failed transaction and
      // never prints SQL, bind values, fixture text or credentials.
      for(let index=0;index<statements.length;index++)try{await db.prepare(`EXPLAIN ${statements[index].source}`).bind(...statements[index].values).all();}catch(compileError){console.error(`D1_BATCH_COMPILE_FAIL statement=${index} chars=${statements[index].source.length} message=${compileError.message}`);}
      throw error;
    }
    await notify('batch','after',{...context,result});return result;
  }};
  return {d1,on,hooks};
}

function sourceDocx(title='Synthetic title',body='Synthetic body'){
  const xml=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return Buffer.from(zipSync({
    '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml':strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${xml(title)}</w:t></w:r></w:p><w:p><w:r><w:t>${xml(body)}</w:t></w:r></w:p></w:body></w:document>`)
  }));
}

async function fixtures(d1,h,load){
  const articleTools=load('article-tools'),localTools=load('local-word-jobs'),articles=load('articles'),format=load('article-format'),word=load('word-recovery'),progress=load('word-progress'),dedaoContract=load('dedao-contract'),op=operations(word,progress);
  const get=job=>d1.prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(job.owner,job.target_id).first();
  const control=job=>d1.prepare("SELECT * FROM word_recovery WHERE owner=? AND target_kind='article' AND target_id=?").bind(job.owner,job.target_id).first();
  const update=(job,set,...values)=>d1.prepare(`UPDATE articles SET ${set} WHERE owner=? AND id=?`).bind(...values,job.owner,job.target_id).run();
  const sameBytes=bytes=>Buffer.from(bytes);
  async function imported(label,{who=owner(label),title='Synthetic title',body='Synthetic body',acquire=false}={}){
    const id=randomUUID(),filename='synthetic-dedao-source.docx',bytes=sourceDocx(title,body),sourceHash=hash(bytes),
      original=await articles.createArticle(who,new File([bytes],filename),{id,sha256:sourceHash,title}),
      paragraphs=format.parseArticle(bytes,filename),created=new Date(Date.now()-120000).toISOString(),claim=randomUUID(),
      job={owner:who,target_kind:'article',target_id:id,claim_token:claim,input_sha256:hash(JSON.stringify(paragraphs)),execution_token:randomUUID(),execution_id:randomUUID(),request_key:randomUUID()},
      batch=randomUUID(),item=randomUUID(),handoff=randomUUID(),event=randomUUID(),acquisition=randomUUID(),
      upstreamExecutor=`synthetic-upstream-${randomUUID()}`,finalRef='synthetic-final-version-reference',browser='synthetic-original-browser';
    assert.equal(original.id,id);assert.equal(original.title,title.slice(0,120));
    if(acquire){await update(job,"state='queued'");const issued=await articleTools.articleCall(who,'claim_article',{article_id:id});assert.equal(issued.claimed,true);job.claim_token=issued.claim_token;}
    await update(job,"created=?,state='processing',claim_token=?,claim_expires=?",created,job.claim_token,new Date(Date.now()-60000).toISOString());
    await d1.prepare("INSERT INTO dedao_batches(id,owner,request_key,queue_revision,total,state,current_ordinal,created,updated,started,finished,executor_id,execution_id,executor_ended) VALUES(?,?,?,?,1,'completed',1,?,?,?,?,?,?,1)")
      .bind(batch,who,randomUUID(),randomUUID(),created,created,created,created,upstreamExecutor,'synthetic-upstream-execution').run();
    await d1.prepare("INSERT INTO dedao_batch_runtime(batch_id,owner,runtime,dispatch_mode,safe_boundary,updated) VALUES(?,?,'cli_cdp','fixed',1,?)").bind(batch,who,created).run();
    const download={filename,path:'/synthetic-original-download/source.docx',sha256:sourceHash,size:bytes.length,title,final_version_ref:finalRef,browser_session:browser,executor_id:upstreamExecutor};
    await d1.prepare("INSERT INTO dedao_items(batch_id,owner,ordinal,id,title,stage,version,final_ref,download_json,article_id,upload_state,submitted_handoff_id,submitted,created,updated) VALUES(?,?,1,?,?,11,7,?,?,?,'uploaded',?,?,?,?)")
      .bind(batch,who,item,title,finalRef,JSON.stringify(download),id,handoff,created,created,created).run();
    const previous=['recommend','adopt','framework'].map(action=>[action,{conversation_url:dedaoContract.DEDAO_URL,result:'response_completed',response_ref:`synthetic-${action}-reference`,observed_at:created}]);
    for(const [action,observation] of [...previous,['finalize',{conversation_url:dedaoContract.DEDAO_URL,title,final_version_ref:finalRef,result:'response_completed',response_ref:finalRef,observed_at:created}],['download',download]])
      await d1.prepare("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,observation_json,created,updated) VALUES(?,1,?,?,'confirmed',?,?,?)")
        .bind(batch,action,randomUUID(),JSON.stringify(observation),created,created).run();
    const chunkKey=`dedao/${batch}/1/chunk-0-${sourceHash}`;
    await h.bucket.put(chunkKey,sameBytes(bytes));
    await d1.prepare('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,1,0,?,?,?)').bind(batch,bytes.length,sourceHash,chunkKey).run();
    await d1.prepare("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)").bind(handoff,who,id,event,created,created,created).run();
    await d1.prepare('INSERT INTO article_help_queue_claims(owner,request_key,article_id,handoff_id,event_id,claim_hash,created) VALUES(?,?,?,?,?,?,?)').bind(who,acquisition,id,handoff,event,hash(job.claim_token),created).run();
    if(acquire){await update(job,'claim_expires=?',new Date(Date.now()+3600000).toISOString());assert.equal((await op.acquire(job,'prepare')).acquired,true);}
    return {job,bytes,sourceHash,filename,batch,item,handoff,event,acquisition,upstreamExecutor,finalRef,browser,created,download,chunkKey};
  }
  const noSecret=(value,tokens)=>{const text=JSON.stringify(value);for(const token of tokens)assert.ok(!text.includes(token),'credential returned or stored in audit projection');};
  async function fresh(who,kind='article'){
    const job=await seed(d1,who,kind);
    if(kind==='article'){await update(job,"state='queued',claim_token=NULL,claim_expires=NULL");const issued=await articleTools.articleCall(who,'claim_article',{article_id:job.target_id});assert.equal(issued.claimed,true);job.claim_token=issued.claim_token;}
    else{await d1.prepare("UPDATE local_word_jobs SET state='queued',claim_hash=NULL,claim_expires=NULL WHERE owner=? AND id=?").bind(who,job.target_id).run();const issued=await localTools.localWordCall(who,'claim_local_word_job',{job_id:job.target_id});assert.equal(issued.claimed,true);job.claim_token=issued.claim_token;}
    const proof=await d1.prepare('SELECT * FROM word_claim_origins WHERE owner=? AND target_kind=? AND target_id=? AND claim_hash=?').bind(who,kind,job.target_id,hash(job.claim_token)).first();assert.equal(proof?.origin,'fresh_claim');return job;
  }
  return {articles,word,progress,op,get,control,update,imported,noSecret,fresh};
}

const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC DEDAO WORD ATTEMPT INDEPENDENT")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'synthetic-dedao-word-attempt-independent'}});
const h=createSyntheticHarness({projectRoot:process.cwd(),migrate:false});
let passed=0;
const pass=name=>{passed++;console.log(`PASS ${name}`);};
try{
  const raw=await mf.getD1Database('DB');
  await migrate(drizzle(raw),{migrationsFolder:'drizzle'});
  await migrate(drizzle(raw),{migrationsFolder:'drizzle'});
  const {d1,on,hooks}=instrument(raw);h.env.DB=d1;
  const load=h.loader(),f=await fixtures(d1,h,load),recovery=load('article-word-recovery'),article=load('article-tools');
  const call=(job,name,args={})=>recovery.articleWordRecoveryCall(job.owner,name,{article_id:job.target_id,...args});
  const preview=job=>call(job,'preview_article_word_recovery');
  const external=fixture=>({kind:'codex_terminal_observation',execution_id:fixture.job.execution_id,thread_id:randomUUID(),turn_id:randomUUID(),terminal_state:'completed',ended_at:new Date(Date.now()-10000).toISOString(),observed_at:new Date().toISOString(),observation_reference:'synthetic-normal-tool-terminal-reference',execution_mapping_reference:'synthetic-normal-tool-acquisition-task-reference',original_acquisition_request_key:fixture.acquisition,confirm_all_actions_settled:true,settled_reference:'synthetic-all-actions-settled-reference'});
  const args=async(fixture,extra={})=>{const view=await preview(fixture.job);assert.match(view.expected_fingerprint,/^[a-f0-9]{64}$/);return {request_key:randomUUID(),next_claim_token:randomUUID(),expected_fingerprint:view.expected_fingerprint,input_sha256:fixture.job.input_sha256,confirm_same_article:true,confirm_existing_results_checked:true,confirmation_reference:'synthetic-authorized-same-article-recovery',confirm_original_executor_match:true,termination:external(fixture),...extra};};
  const recover=(fixture,a)=>call(fixture.job,'recover_article_word_execution',a);
  const receipt=(fixture,key)=>call(fixture.job,'read_article_word_recovery_receipt',{request_key:key});
  const sql=(source,...values)=>d1.prepare(source).bind(...values).run();
  const count=(table,who)=>d1.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner=?`).bind(who).first('n');
  const readonlyState=async job=>Object.fromEntries(await Promise.all([job.target_kind==='article'?'articles':'local_word_jobs','word_recovery','word_execution_receipts','word_execution_requests','word_execution_queue','word_attempts','word_attempt_requests','word_serial_slots','word_progress_events','word_checkpoints','word_image_candidates','word_claim_origins'].map(async table=>[table,(await d1.prepare(`SELECT * FROM ${table} WHERE owner=? ORDER BY rowid`).bind(job.owner).all()).results])));
  const dedaoRows=async fixture=>({item:await d1.prepare('SELECT * FROM dedao_items WHERE batch_id=?').bind(fixture.batch).first(),batch:await d1.prepare('SELECT * FROM dedao_batches WHERE id=?').bind(fixture.batch).first(),actions:(await d1.prepare('SELECT * FROM dedao_actions WHERE batch_id=? ORDER BY action').bind(fixture.batch).all()).results,chunks:(await d1.prepare('SELECT * FROM dedao_chunks WHERE batch_id=? ORDER BY offset').bind(fixture.batch).all()).results});
  const sourceKey=fixture=>`articles/${fixture.job.target_id}/source`;

  const valid=await f.imported('strict-valid'),validBefore=await f.get(valid.job),validDedao=await dedaoRows(valid),validPreview=await preview(valid.job),validArgs=await args(valid);
  assert.equal(validPreview.input_sha256,valid.job.input_sha256);
  assert.equal(validPreview.scope,'confirmed_dedao_word_before_final_save');assert.equal(validPreview.source_origin.kind,'confirmed_dedao_source_import');assert.equal(validPreview.source_origin.source_size,valid.bytes.length);assert.equal(validPreview.source_origin.source_sha256,valid.sourceHash);
  assert.equal(validPreview.new_execution_grant,false);assert.equal(validPreview.new_platform_upload_allowed,false);
  const result=await recover(valid,validArgs),validAfter=await f.get(valid.job);
  assert.equal(result.claim_rotated,true);assert.equal(validAfter.id,validBefore.id);assert.equal(validAfter.paragraphs,validBefore.paragraphs);assert.equal(validAfter.source_key,validBefore.source_key);assert.equal(validAfter.claim_token,validArgs.next_claim_token);
  assert.deepEqual(await dedaoRows(valid),validDedao);assert.equal(await count('articles',valid.job.owner),1);
  assert.equal(await count('article_word_claim_recoveries',valid.job.owner),1);
  const validProof=JSON.parse((await d1.prepare('SELECT termination_json FROM article_word_claim_recoveries WHERE owner=?').bind(valid.job.owner).first()).termination_json);assert.equal(validProof.server_verified,false);assert.equal(validProof.confirm_all_actions_settled,true);
  f.noSecret([validPreview,result],[valid.job.claim_token,valid.job.execution_token,validArgs.next_claim_token]);
  assert.ok(!JSON.stringify(validPreview).includes(valid.download.path));assert.ok(!JSON.stringify(validPreview).includes('Synthetic body'));
  pass('actual original parser and full source bytes permit exactly linked strict Dedao recovery on the same article/input without resubmission, source rewrite or credential/path/body disclosure');

  const malformed=[
    ['foreign item owner',x=>sql('UPDATE dedao_items SET owner=? WHERE batch_id=?',owner('foreign'),x.batch)],
    ['foreign batch owner',x=>sql('UPDATE dedao_batches SET owner=? WHERE id=?',owner('foreign'),x.batch)],
    ['batch unfinished',x=>sql("UPDATE dedao_batches SET state='running',finished=NULL WHERE id=?",x.batch)],
    ['wrong item stage',x=>sql('UPDATE dedao_items SET stage=10 WHERE batch_id=?',x.batch)],
    ['upload unconfirmed',x=>sql("UPDATE dedao_items SET upload_state='pending' WHERE batch_id=?",x.batch)],
    ['submission absent',x=>sql('UPDATE dedao_items SET submitted_handoff_id=NULL,submitted=NULL WHERE batch_id=?',x.batch)],
    ['item title mismatch',x=>sql('UPDATE dedao_items SET title=? WHERE batch_id=?','Synthetic other title',x.batch)],
    ['final ref mismatch',x=>sql('UPDATE dedao_items SET final_ref=? WHERE batch_id=?','synthetic-other-final-ref',x.batch)],
    ['download observation mismatch',x=>sql("UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND action='download'",JSON.stringify({...x.download,path:'/synthetic-other-path'}),x.batch)],
    ['download unconfirmed',x=>sql("UPDATE dedao_actions SET state='intent' WHERE batch_id=? AND action='download'",x.batch)],
    ['source filename mismatch',x=>f.update(x.job,'filename=?','different-source.docx')],
    ['source declared size mismatch',async x=>{const download={...x.download,size:x.bytes.length+1};await sql('UPDATE dedao_items SET download_json=? WHERE batch_id=?',JSON.stringify(download),x.batch);await sql("UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND action='download'",JSON.stringify(download),x.batch);}],
    ['source declared digest mismatch',async x=>{const download={...x.download,sha256:'0'.repeat(64)};await sql('UPDATE dedao_items SET download_json=? WHERE batch_id=?',JSON.stringify(download),x.batch);await sql("UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND action='download'",JSON.stringify(download),x.batch);}],
    ['source upstream executor mismatch',async x=>{const download={...x.download,executor_id:'synthetic-other-upstream'};await sql('UPDATE dedao_items SET download_json=? WHERE batch_id=?',JSON.stringify(download),x.batch);await sql("UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND action='download'",JSON.stringify(download),x.batch);}],
    ['source object absent',x=>h.bucket.delete(sourceKey(x))],
    ['source actual digest mismatch',x=>h.bucket.put(sourceKey(x),sourceDocx('Synthetic title','Changed body'))],
    ['frozen paragraph mismatch',x=>f.update(x.job,'paragraphs=?',JSON.stringify(['Synthetic title','Different frozen body']))],
    ['chunk metadata absent',x=>sql('DELETE FROM dedao_chunks WHERE batch_id=?',x.batch)],
    ['chunk offset gap',x=>sql('UPDATE dedao_chunks SET offset=1 WHERE batch_id=?',x.batch)],
    ['chunk digest mismatch',x=>sql('UPDATE dedao_chunks SET sha256=? WHERE batch_id=?','f'.repeat(64),x.batch)],
    ['chunk actual bytes mismatch',x=>h.bucket.put(x.chunkKey,sourceDocx('Synthetic title','Wrong chunk body'))],
    ['handoff not delivered',x=>sql("UPDATE article_handoffs SET state='unknown' WHERE id=?",x.handoff)],
    ['handoff event mismatch',x=>sql('UPDATE article_handoffs SET event_id=? WHERE id=?','synthetic-foreign-event',x.handoff)],
    ['original acquisition claim mismatch',x=>f.update(x.job,'claim_token=?',randomUUID())],
    ['finalize fixed conversation mismatch',x=>sql("UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND action='finalize'",JSON.stringify({conversation_url:'https://example.org/synthetic-other-conversation',title:'Synthetic title',final_version_ref:x.finalRef,result:'response_completed',response_ref:x.finalRef,observed_at:x.created}),x.batch)],
    ['finalize reference mismatch',x=>sql("UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND action='finalize'",JSON.stringify({conversation_url:load('dedao-contract').DEDAO_URL,title:'Synthetic title',final_version_ref:'synthetic-other-final-ref',result:'response_completed',response_ref:x.finalRef,observed_at:x.created}),x.batch)]
  ];
  for(const [name,mutate] of malformed){const fixture=await f.imported(`reject-${name.replaceAll(' ','-')}`),a=await args(fixture),before=await f.get(fixture.job);if(name==='foreign item owner'||name==='chunk metadata absent'){const rows=await dedaoRows(fixture);await assert.rejects(mutate(fixture),name==='foreign item owner'?/ARTICLE_CONTENT_PERMANENTLY_DELETED/:/dedao_article_purge_exact_confirmation_required/);assert.deepEqual(await dedaoRows(fixture),rows);assert.deepEqual(await f.get(fixture.job),before);assert.equal(await count('article_word_claim_recoveries',fixture.job.owner),0);pass(`actual database fence refuses ${name} before an invalid recovery fixture can exist`);continue;}await mutate(fixture);await assert.rejects(preview(fixture.job),undefined,name);await assert.rejects(recover(fixture,a),undefined,name);assert.equal(await count('article_word_claim_recoveries',fixture.job.owner),0);assert.equal((await f.get(fixture.job)).id,before.id);pass(`strict origin refuses ${name} without recovery audit or duplicate article`);}

  const movedLink=await f.imported('origin-link-moved'),movedArgs=await args(movedLink);await sql('UPDATE dedao_items SET article_id=? WHERE batch_id=?',randomUUID(),movedLink.batch);
  const movedPreview=await preview(movedLink.job);assert.equal(movedPreview.source_origin.kind,'direct_manual_upload');await assert.rejects(recover(movedLink,movedArgs));assert.equal(await count('article_word_claim_recoveries',movedLink.job.owner),0);
  pass('a source link moved after preview invalidates its strict-origin fingerprint; an article with no remaining Dedao link is never falsely labeled verified Dedao');

  const terminalFixture=await f.imported('strict-terminal'),terminalArgs=await args(terminalFixture);
  for(const bad of [{confirm_all_actions_settled:false},{confirm_all_actions_settled:undefined},{settled_reference:undefined},{settled_reference:''},{terminal_state:'idle'},{terminal_state:'active'},{ended_at:new Date(Date.now()+60000).toISOString()},{ended_at:new Date(Date.now()-3600000).toISOString()},{original_acquisition_request_key:randomUUID()},{execution_mapping_reference:''},{observation_reference:''}])await assert.rejects(recover(terminalFixture,{...terminalArgs,termination:{...terminalArgs.termination,...bad}}));
  assert.equal(await count('article_word_claim_recoveries',terminalFixture.job.owner),0);
  pass('terminal recovery requires actual all-actions-settled assertion/reference, original acquisition, mapping/terminal references and admissible end times; idle, active and expiry never prove ended');

  const holderFixture=await f.imported('strict-current-holder',{acquire:true}),holderControl=await f.control(holderFixture.job),holderEndArgs={claim_token:holderFixture.job.claim_token,execution_token:holderFixture.job.execution_token,execution_id:holderFixture.job.execution_id,epoch:holderControl.epoch,input_sha256:holderFixture.job.input_sha256,request_key:randomUUID(),confirm_all_actions_stopped:true,end_reference:'synthetic-current-holder-ended',confirm_all_actions_settled:true,settled_reference:'synthetic-current-holder-all-actions-settled'};
  const {confirm_all_actions_settled:removedSettled,settled_reference:removedReference,...legacyEndArgs}=holderEndArgs;
  await assert.rejects(call(holderFixture.job,'end_article_word_execution',legacyEndArgs));assert.ok(await d1.prepare('SELECT 1 FROM word_serial_slots WHERE owner=?').bind(holderFixture.job.owner).first());
  const holderEnded=await call(holderFixture.job,'end_article_word_execution',holderEndArgs);assert.equal(holderEnded.ended,true);assert.equal(await d1.prepare('SELECT 1 FROM word_serial_slots WHERE owner=?').bind(holderFixture.job.owner).first(),null);
  const holderRecoveryArgs=await args(holderFixture,{termination:{kind:'holder_end_receipt',end_request_key:holderEndArgs.request_key}});assert.equal((await recover(holderFixture,holderRecoveryArgs)).claim_rotated,true);assert.equal((await f.control(holderFixture.job)).token_hash,null);
  pass('old holder-end shape without explicit settled confirmation/reference cannot release serial holder; exact explicit end only then permits same-source recovery with no Word grant');

  const race=await f.imported('strict-cas-race'),first=await args(race),second={...first,request_key:randomUUID(),next_claim_token:randomUUID()},raceResults=await Promise.allSettled([recover(race,first),recover(race,second)]);
  assert.equal(raceResults.filter(x=>x.status==='fulfilled').length,1);assert.equal(await count('article_word_claim_recoveries',race.job.owner),1);assert.equal(await count('articles',race.job.owner),1);
  pass('actual atomic strict-origin full snapshot allows one of two recovery claim conversions on the same article');

  const lost=await f.imported('strict-response-loss'),lostArgs=await args(lost);
  on('batch',context=>context.source.includes('article_word_claim_recoveries'),()=>{throw Error('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT');},'after');
  await assert.rejects(recover(lost,lostArgs),/SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT/);
  const lostClaim=(await f.get(lost.job)).claim_token,read=await receipt(lost,lostArgs.request_key),replayed=await recover(lost,lostArgs);
  assert.equal(lostClaim,lostArgs.next_claim_token);assert.equal(read.recorded,true);assert.equal(read.applicable,true);assert.equal(replayed.duplicate,true);assert.equal((await f.get(lost.job)).claim_token,lostClaim);assert.equal(await count('article_word_claim_recoveries',lost.job.owner),1);assert.equal(await count('articles',lost.job.owner),1);
  f.noSecret([read,replayed],[lost.job.claim_token,lost.job.execution_token,lostArgs.next_claim_token]);
  pass('lost committed strict-origin response is read/replayed under the same stable key without new claim rotation, token return, article or submission');

  for(const table of ['dedao_items','dedao_batches','dedao_actions','dedao_chunks']){
    const changed=await f.imported(`strict-cas-${table}`),a=await args(changed),changes={dedao_items:()=>sql('UPDATE dedao_items SET updated=? WHERE batch_id=?',new Date().toISOString(),changed.batch),dedao_batches:()=>sql('UPDATE dedao_batches SET updated=? WHERE id=?',new Date().toISOString(),changed.batch),dedao_actions:()=>sql("UPDATE dedao_actions SET updated=? WHERE batch_id=? AND action='recommend'",new Date().toISOString(),changed.batch),dedao_chunks:()=>sql('UPDATE dedao_chunks SET object_key=? WHERE batch_id=?',`${changed.chunkKey}-changed`,changed.batch)};
    on('batch',context=>context.source.includes('article_word_claim_recoveries'),changes[table]);
    await assert.rejects(recover(changed,a));assert.equal((await f.get(changed.job)).claim_token,changed.job.claim_token);assert.equal(await count('article_word_claim_recoveries',changed.job.owner),0);
    pass(`actual recovery transaction rejects concurrent ${table} aggregate changes after its snapshot`);
  }

  const sourceVersion=await f.imported('strict-r2-version'),sourceArgs=await args(sourceVersion);
  h.on({method:'bucket.head',phase:'before',match:({key})=>key===sourceKey(sourceVersion),action:()=>h.bucket.put(sourceKey(sourceVersion),sourceVersion.bytes)});
  await assert.rejects(recover(sourceVersion,sourceArgs));assert.equal((await f.get(sourceVersion.job)).claim_token,sourceVersion.job.claim_token);assert.equal(await count('article_word_claim_recoveries',sourceVersion.job.owner),0);
  pass('same-byte original source object replacement during verification invalidates etag/version freshness before recovery');

  const chunkVersion=await f.imported('strict-chunk-version'),chunkVersionArgs=await args(chunkVersion);h.on({method:'bucket.head',phase:'before',match:({key})=>key===chunkVersion.chunkKey,action:()=>h.bucket.put(chunkVersion.chunkKey,chunkVersion.bytes)});await assert.rejects(recover(chunkVersion,chunkVersionArgs));assert.equal(await count('article_word_claim_recoveries',chunkVersion.job.owner),0);
  pass('same-byte historical chunk replacement during verification invalidates its independent object version/etag before recovery');

  const receiptChanged=await f.imported('strict-receipt-source-change'),receiptChangedArgs=await args(receiptChanged);await recover(receiptChanged,receiptChangedArgs);await h.bucket.put(sourceKey(receiptChanged),sourceDocx('Synthetic title','Changed after committed recovery'));
  const staleReceipt=await receipt(receiptChanged,receiptChangedArgs.request_key);assert.equal(staleReceipt.recorded,true);assert.equal(staleReceipt.applicable,false);assert.equal(staleReceipt.new_execution_grant,false);assert.equal(await count('article_word_claim_recoveries',receiptChanged.job.owner),1);
  pass('recorded recovery receipt revalidates actual original source bytes and becomes inapplicable after source mutation without rewriting its immutable audit or granting execution');

  for(const [name,insert] of [
    ['writing',x=>sql('INSERT INTO writing_runs(id,owner,day,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?)',randomUUID(),x.job.owner,'2026-10-10','completed',x.job.target_id,x.created,x.created)],
    ['outline',x=>sql('INSERT INTO outline_flows(id,owner,authorization_key,snapshot,snapshot_sha256,state,article_id,expires,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',randomUUID(),x.job.owner,randomUUID(),'{}',hash('{}'),'completed',x.job.target_id,x.created,x.created,x.created)]
  ]){const fixture=await f.imported(`strict-automatic-${name}`),a=await args(fixture);await insert(fixture);await assert.rejects(preview(fixture.job));await assert.rejects(recover(fixture,a));if(name==='writing')await assert.rejects(article.articleCall(fixture.job.owner,'claim_article',{article_id:fixture.job.target_id}),/自动写文/);else{const blocked=await article.articleCall(fixture.job.owner,'claim_article',{article_id:fixture.job.target_id});assert.equal(blocked.claimed,false);assert.equal(blocked.recovery.blocked,true);assert.equal(blocked.recovery.next_tool,null);}assert.equal((await f.get(fixture.job)).claim_token,fixture.job.claim_token);assert.equal(await count('article_word_claim_recoveries',fixture.job.owner),0);pass(`linked true ${name} automatic lineage cannot impersonate a manual or strict Dedao recovery or bypass it via ordinary claim`);}

  const guidance=await f.imported('strict-guidance');
  const supportedGuidance=await article.articleCall(guidance.job.owner,'claim_article',{article_id:guidance.job.target_id});assert.equal(supportedGuidance.claimed,false);assert.equal(supportedGuidance.recovery.next_tool,'preview_article_word_recovery');
  const invalidGuidance=await f.imported('invalid-guidance');await sql("UPDATE dedao_items SET upload_state='pending' WHERE batch_id=?",invalidGuidance.batch);
  const unsupportedGuidance=await article.articleCall(invalidGuidance.job.owner,'claim_article',{article_id:invalidGuidance.job.target_id});assert.equal(unsupportedGuidance.claimed,false);assert.equal(unsupportedGuidance.recovery.next_tool,null);assert.equal(unsupportedGuidance.recovery.blocked,true);
  assert.equal((await f.get(invalidGuidance.job)).claim_token,invalidGuidance.job.claim_token);
  pass('ordinary expired claim guides a complete supported Dedao lineage to recovery while invalid lineage remains blocked without claiming or directing it to an inapplicable preview');

  const attempts=load('word-attempts'),attemptCall=(job,name,a={})=>attempts.wordAttemptCall(job.owner,name,{target_kind:job.target_kind,target_id:job.target_id,...a}),attemptView=job=>attempts.wordAttemptView(job.owner,job.target_kind,job.target_id);
  const granted=async(label,{who=owner(label),kind='article',scope='prepare'}={})=>{const job=await f.fresh(who,kind),result=await f.op.acquire(job,scope);assert.equal(result.acquired,true);job.epoch=result.epoch;return job;};
  const stop=async(job,reason='owner_request',request_key=randomUUID())=>{const view=await attemptView(job);return attemptCall(job,'request_word_safe_stop',{input_sha256:job.input_sha256,attempt_id:view.attempt_id,request_key,reason});};
  const acknowledge=async(job,state='ended',extra={})=>{const view=await attemptView(job);return attemptCall(job,'acknowledge_word_attempt_stopped',{input_sha256:job.input_sha256,attempt_id:view.attempt_id,claim_token:job.claim_token,execution_token:job.execution_token,execution_id:job.execution_id,epoch:job.epoch,request_key:randomUUID(),confirm_all_actions_settled:true,settled_reference:'synthetic-original-holder-all-actions-settled',confirm_executor_ended:true,terminal_reference:'synthetic-original-holder-actually-ended',state,...extra});};
  const restartArgs=async(job,extra={})=>{const view=await attemptView(job);return {input_sha256:job.input_sha256,attempt_id:view.attempt_id,expected_generation:view.generation,request_key:randomUUID(),strategy_sha256:hash(`synthetic-new-image-strategy-${randomUUID()}`),strategy_reference:'synthetic-authorized-different-public-image-strategy',confirm_same_frozen_input:true,confirm_existing_results_read:true,...extra};};
  const restart=(job,a)=>attemptCall(job,'restart_word_attempt',a);
  const nextExecution=job=>({...job,execution_id:randomUUID(),execution_token:randomUUID(),request_key:randomUUID()});
  const slot=who=>d1.prepare('SELECT * FROM word_serial_slots WHERE owner=?').bind(who).first();
  const setAttempt=(job,set,...values)=>d1.prepare(`UPDATE word_attempts SET ${set} WHERE owner=? AND target_kind=? AND target_id=? AND attempt_id=(SELECT attempt_id FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=?)`).bind(...values,job.owner,job.target_kind,job.target_id,job.owner,job.target_kind,job.target_id).run();
  const cache=async(job,kind,bytes,metadata={})=>{const asset_id=randomUUID(),a={...base(job),asset_id};await f.word.checkpointCall(job.owner,'begin_word_checkpoint',{...a,kind,sha256:hash(bytes),size:bytes.length,chunks:Math.ceil(bytes.length/65536),metadata});for(let index=0;index<Math.ceil(bytes.length/65536);index++)await f.word.checkpointCall(job.owner,'put_word_checkpoint_chunk',{...a,index,data_base64:Buffer.from(bytes.subarray(index*65536,(index+1)*65536)).toString('base64')});await f.word.checkpointCall(job.owner,'finalize_word_checkpoint',a);return asset_id;};
  const preparedOutput=async job=>{const image=Buffer.from(png()),bytes=Buffer.from(docx(image)),metadata={source_url:'https://images.example.org/synthetic-generated.png',source_title:'Synthetic validation raster',after_paragraph:1};await f.word.declareImageFloor(job.owner,{...base(job),minimum_images:1});const asset=await cache(job,'image',image,metadata);await f.word.recordImageResult(job.owner,{...base(job),candidate_id:randomUUID(),source_url:metadata.source_url,source_title:metadata.source_title,outcome:'ready',reason:'none',asset_id:asset});await article.articleCall(job.owner,'record_article_images',{...native(job),images:[{...metadata,sha256:hash(image)}]});await cache(job,'word',bytes);return bytes;};
  assert.ok((await d1.prepare('PRAGMA table_info(word_attempts)').all()).results.length);
  assert.ok((await d1.prepare('PRAGMA table_info(word_progress_events)').all()).results.some(x=>x.name==='attempt_id'));
  pass('all native migrations including immutable attempt audits apply twice in real isolated workerd D1');

  const serial=await granted('owner-serial'),queued=await f.fresh(serial.owner),localQueued=await f.fresh(serial.owner,'local_word'),serialSlot=await slot(serial.owner);
  const queueResults=await Promise.all([f.op.acquire(queued,'prepare'),f.op.acquire(localQueued,'heavy')]);
  assert.ok(queueResults.every(x=>!x.acquired&&x.queued&&!x.new_execution_grant));
  assert.equal(await attemptView(queued),null);assert.equal(await attemptView(localQueued),null);
  assert.equal((await slot(serial.owner)).execution_id,serial.execution_id);
  const queueRead=await attemptCall(queued,'read_word_attempt');assert.equal(queueRead.attempt,null);assert.equal(queueRead.new_execution_grant,false);
  assert.equal((await f.op.receipt(queued)).queued,true);assert.equal((await f.op.receipt(localQueued)).queued,true);
  for(const queueJob of [queued,localQueued]){const beforeQueueRead=await readonlyState(queueJob),queuedProgress=await f.progress.readWordProgress(queueJob.owner,queueJob.target_kind,queueJob.target_id);assert.ok(queuedProgress.steps.every(x=>x.state==='pending'&&x.counts===null));assert.equal(queuedProgress.legacy,false);assert.equal(queuedProgress.started_at,null);assert.equal(queuedProgress.attempt,null);assert.deepEqual(await readonlyState(queueJob),beforeQueueRead);}
  const queuedBefore=(await d1.prepare('SELECT * FROM word_execution_queue WHERE owner=? ORDER BY request_key').bind(serial.owner).all()).results;
  await attemptCall(queued,'read_word_attempt');await attemptCall(localQueued,'read_word_attempt');
  assert.equal(await attemptView(queued),null);assert.equal(await attemptView(localQueued),null);
  assert.deepEqual((await d1.prepare('SELECT * FROM word_execution_queue WHERE owner=? ORDER BY request_key').bind(serial.owner).all()).results,queuedBefore);
  assert.equal((await attemptView(serial)).generation,1);assert.ok((await attemptView(serial)).started_at);
  pass('one owner has one actual holder across article and local Word; all other requests remain durable queues with no elapsed clock or read-induced queue mutation');

  await f.update(serial,'claim_expires=?',new Date(Date.now()-60000).toISOString());
  await sql('UPDATE word_recovery SET lease_until=?,heartbeat_at=? WHERE owner=? AND target_id=?',new Date(Date.now()-60000).toISOString(),new Date(Date.now()-3600000).toISOString(),serial.owner,serial.target_id);
  await setAttempt(serial,'active_started_at=?',new Date(Date.now()-120000).toISOString());
  const disconnected=await attemptView(serial);assert.ok(Date.parse(disconnected.read_at)-Date.parse(disconnected.active_started_at)>119000);assert.equal((await slot(serial.owner)).execution_id,serialSlot.execution_id);
  assert.equal((await f.op.acquire(queued,'prepare')).queued,true);assert.equal((await f.op.acquire(localQueued,'heavy')).queued,true);
  await assert.rejects(restart(serial,await restartArgs(serial)));
  pass('network silence, expired business/Word lease and overdue heartbeat keep the same unresolved owner holder and running timer; queued requests cannot steal it or reopen a generation');

  await acknowledge(serial);
  const dequeued=await f.op.acquire(queued,'prepare');assert.equal(dequeued.acquired,true);queued.epoch=dequeued.epoch;assert.ok((await attemptView(queued)).started_at);assert.equal((await attemptView(queued)).generation,1);assert.equal((await slot(serial.owner)).target_id,queued.target_id);assert.equal((await f.op.acquire(localQueued,'heavy')).acquired,false);
  pass('an actually ended and settled holder releases admission for the exact original never-granted queued request; only its real first grant starts the next timer');

  for(const kind of ['article','local_word']){
    const legacy=await seed(d1,owner(`unknown-legacy-first-intent-${kind}`),kind);
    if(kind==='article')await f.update(legacy,'claim_expires=?',new Date(Date.now()-60000).toISOString());else await sql('UPDATE local_word_jobs SET claim_expires=? WHERE owner=? AND id=?',new Date(Date.now()-60000).toISOString(),legacy.owner,legacy.target_id);
    const legacyMainClaim=kind==='article'?await article.articleCall(legacy.owner,'claim_article',{article_id:legacy.target_id}):await load('local-word-jobs').localWordCall(legacy.owner,'claim_local_word_job',{job_id:legacy.target_id});assert.equal(legacyMainClaim.claimed,false);assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_claim_origins WHERE owner=? AND target_kind=? AND target_id=?').bind(legacy.owner,kind,legacy.target_id).first('n')),0);
    assert.equal(await f.op.view(legacy),null);await f.word.setWordIntent(legacy.owner,{target_kind:kind,target_id:legacy.target_id,input_sha256:legacy.input_sha256,expected_version:0,intent:'paused'});
    const legacyControl=await d1.prepare('SELECT * FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=?').bind(legacy.owner,kind,legacy.target_id).first();assert.equal(legacyControl.attempt_id,null);assert.equal(legacyControl.execution_id,null);assert.equal(legacyControl.token_hash,null);assert.equal(await count('word_execution_receipts',legacy.owner),0);
    const other=await f.fresh(legacy.owner,kind==='article'?'local_word':'article'),otherFirst=await Promise.allSettled([f.op.acquire(other,'prepare')]);assert.ok(otherFirst[0].status==='rejected'||otherFirst[0].value.acquired===false);
    await f.op.intent(legacy,'run');await sql('UPDATE word_recovery SET version=0,epoch=0 WHERE owner=? AND target_kind=? AND target_id=?',legacy.owner,kind,legacy.target_id);const otherAgain=await Promise.allSettled([f.op.acquire(other,'prepare')]);assert.ok(otherAgain[0].status==='rejected'||otherAgain[0].value.acquired===false);
    // Make the original synthetic main lease valid again to isolate the serial
    // unknown-holder fence from simple expiry rejection; no new origin is inserted.
    if(kind==='article')await f.update(legacy,'claim_expires=?',new Date(Date.now()+3600000).toISOString());else await sql('UPDATE local_word_jobs SET claim_expires=? WHERE owner=? AND id=?',new Date(Date.now()+3600000).toISOString(),legacy.owner,legacy.target_id);
    const selfFresh=nextExecution(legacy),selfResult=await Promise.allSettled([f.op.acquire(selfFresh,'prepare')]);assert.ok(selfResult[0].status==='rejected'||selfResult[0].value.acquired===false);
    assert.equal(await slot(legacy.owner),null);assert.equal(await count('word_execution_receipts',legacy.owner),0);assert.equal(await count('word_attempts',legacy.owner),0);
    const legacyReadBefore=await readonlyState(legacy),legacyProgress=await f.progress.readWordProgress(legacy.owner,kind,legacy.target_id);assert.equal(legacyProgress.legacy,true);assert.ok(legacyProgress.steps.every(x=>x.state==='unrecorded'&&x.counts===null));assert.equal(legacyProgress.started_at,null);assert.equal(legacyProgress.attempt,null);assert.deepEqual(await readonlyState(legacy),legacyReadBefore);
    pass(`${kind} unknown original legacy executor remains a serial blocker after first pause/run creates null execution/attempt control; neither another job nor fresh self-grant treats user intent as end proof`);
  }

  for(const kind of ['article','local_word']){
    const original=await f.fresh(owner(`fresh-proof-binding-${kind}`),kind),priorOrigins=(await d1.prepare('SELECT * FROM word_claim_origins WHERE owner=?').bind(original.owner).all()).results;
    if(kind==='article')await f.update(original,'word_claim_origin_hash=?',hash(randomUUID()));
    else await sql('UPDATE local_word_jobs SET claim_hash=? WHERE owner=? AND id=?',hash(randomUUID()),original.owner,original.target_id);
    const sibling=await f.fresh(original.owner,kind==='article'?'local_word':'article'),blocked=await Promise.allSettled([f.op.acquire(sibling,'prepare')]);assert.ok(blocked[0].status==='rejected'||blocked[0].value.acquired===false);assert.equal(await slot(original.owner),null);assert.equal(await count('word_execution_receipts',original.owner),0);
    assert.deepEqual((await d1.prepare('SELECT * FROM word_claim_origins WHERE owner=?').bind(original.owner).all()).results.filter(x=>x.target_id===original.target_id),priorOrigins);
    for(const operation of ['UPDATE','DELETE'])await assert.rejects(sql(operation==='UPDATE'?"UPDATE word_claim_origins SET proof_reference='forged' WHERE owner=?":"DELETE FROM word_claim_origins WHERE owner=?",original.owner));
    const markerReadBefore=await readonlyState(original),markerProgress=await f.progress.readWordProgress(original.owner,kind,original.target_id);assert.equal(markerProgress.legacy,true);assert.ok(markerProgress.steps.every(x=>x.state==='unrecorded'&&x.counts===null));assert.deepEqual(await readonlyState(original),markerReadBefore);
    pass(`${kind} fresh main-claim origin is immutable and exact-hash bound; a mismatched current claim cannot clear unknown-holder admission`);
  }
  for(const kind of ['article','local_word']){
    const neverGranted=await f.fresh(owner(`fresh-main-without-word-grant-${kind}`),kind),target=kind==='article'?'article':'local_word';
    const freshReadBefore=await readonlyState(neverGranted);const freshProgress=await f.progress.readWordProgress(neverGranted.owner,kind,neverGranted.target_id);assert.ok(freshProgress.steps.every(x=>x.state==='pending'&&x.counts===null&&x.action===null&&x.evidence===null));assert.equal(freshProgress.legacy,false);assert.equal(freshProgress.execution.reason,'none');assert.equal(freshProgress.execution.reason_text,'配图尚未开始');assert.equal(freshProgress.updated_at,null);assert.equal(freshProgress.started_at,null);assert.equal(freshProgress.attempt,null);assert.equal(freshProgress.output,null);assert.equal(freshProgress.save.state,'not_started');assert.equal(freshProgress.save.independently_confirmed,false);assert.equal(freshProgress.version,0);f.noSecret(freshProgress,[neverGranted.claim_token,neverGranted.execution_token]);await f.progress.readWordProgress(neverGranted.owner,kind,neverGranted.target_id);assert.deepEqual(await readonlyState(neverGranted),freshReadBefore);
    await assert.rejects(f.op.progress(neverGranted,'read_source','completed',{action:'read_frozen_source',reason:'none'}));
    if(kind==='article'){
      await assert.rejects(article.articleCall(neverGranted.owner,'record_article_images',{...native(neverGranted),images:[]}));
      await assert.rejects(article.articleCall(neverGranted.owner,'begin_article_output',{...native(neverGranted),sha256:hash('synthetic-ungated-output'),size:1,chunks:1}));
      await assert.rejects(article.articleCall(neverGranted.owner,'put_article_output_chunk',{...native(neverGranted),output_id:randomUUID(),index:0,data_base64:Buffer.from('x').toString('base64')}));assert.equal((await f.get(neverGranted)).result_meta,null);
    }else{
      const local=load('local-word-jobs');await assert.rejects(local.localWordCall(neverGranted.owner,'record_local_word_images',{...native(neverGranted),images:[]}));await assert.rejects(local.localWordCall(neverGranted.owner,'begin_local_word_output',{...native(neverGranted),sha256:hash('synthetic-ungated-output'),size:1,chunks:1}));await assert.rejects(local.localWordCall(neverGranted.owner,'put_local_word_output_chunk',{...native(neverGranted),output_id:randomUUID(),index:0,data_base64:Buffer.from('x').toString('base64')}));assert.equal((await d1.prepare('SELECT output_meta FROM local_word_jobs WHERE owner=? AND id=?').bind(neverGranted.owner,neverGranted.target_id).first()).output_meta,null);
    }
    assert.equal(await count('word_execution_receipts',neverGranted.owner),0);assert.equal(await count('word_attempts',neverGranted.owner),0);assert.equal(await count('word_progress_events',neverGranted.owner),0);assert.equal(await slot(neverGranted.owner),null);
    // Synthetic incomplete pre-protocol evidence must defeat fresh-unstarted
    // inference without importing or rechecking nonexistent fixture bytes.
    await sql("INSERT INTO word_checkpoints(owner,target_kind,target_id,input_sha256,asset_id,kind,sha256,size,chunks,metadata_json,parts_json,state,created) VALUES(?,?,?,?,?,'image',?,1,1,'{}','[]','incomplete',?)",neverGranted.owner,kind,neverGranted.target_id,neverGranted.input_sha256,randomUUID(),hash('synthetic-historical-image'),new Date().toISOString());const historyReadBefore=await readonlyState(neverGranted),historyProgress=await f.progress.readWordProgress(neverGranted.owner,kind,neverGranted.target_id);assert.equal(historyProgress.legacy,true);assert.ok(historyProgress.steps.every(x=>x.state==='unrecorded'&&x.counts===null));assert.equal(historyProgress.started_at,null);assert.equal(historyProgress.attempt,null);assert.deepEqual(await readonlyState(neverGranted),historyReadBefore);
    pass(`${target} genuine fresh main claim with no actual Word grant cannot write image plans, output declarations/chunks or progress and cannot create a timer/slot`);
  }
  const expiredLocal=await granted('expired-local-mainclaim-no-rotation',{kind:'local_word'}),expiredLocalHash=hash(expiredLocal.claim_token),expiredLocalSlot=await slot(expiredLocal.owner);await sql('UPDATE local_word_jobs SET claim_expires=? WHERE owner=? AND id=?',new Date(Date.now()-1000).toISOString(),expiredLocal.owner,expiredLocal.target_id);const expiredLocalClaim=await load('local-word-jobs').localWordCall(expiredLocal.owner,'claim_local_word_job',{job_id:expiredLocal.target_id});assert.equal(expiredLocalClaim.claimed,false);assert.equal((await d1.prepare('SELECT claim_hash FROM local_word_jobs WHERE owner=? AND id=?').bind(expiredLocal.owner,expiredLocal.target_id).first()).claim_hash,expiredLocalHash);assert.deepEqual(await slot(expiredLocal.owner),expiredLocalSlot);assert.equal(await count('word_claim_origins',expiredLocal.owner),1);await acknowledge(expiredLocal);assert.equal(await slot(expiredLocal.owner),null);
  pass('expired local processing main claim never rotates or backfills a fresh origin; the exact retained original holder can still settle and release safely');

  const directRace=await seed(d1,owner('direct-origin-input-cas'));await f.update(directRace,"state='queued',claim_token=NULL,claim_expires=NULL");
  on('batch',x=>x.source.includes('word_claim_origins'),()=>f.update(directRace,'paragraphs=?',JSON.stringify(['Synthetic title','CAS-changed frozen source'])));
  const directRaceResult=await article.articleCall(directRace.owner,'claim_article',{article_id:directRace.target_id});assert.equal(directRaceResult.claimed,false);assert.equal(await count('word_claim_origins',directRace.owner),0);assert.equal((await f.get(directRace)).state,'queued');
  pass('direct native queued claim repeats exact source/input CAS in its actual transaction; a raced source change writes neither main claim nor fresh origin');

  const helpQueue=load('article-help-queue'),helpCall=(job,key,name='claim_next_article_help')=>helpQueue.articleHelpQueueCall(job.owner,name,{request_key:key});
  const helpFixture=async label=>{const job=await seed(d1,owner(label)),handoff=randomUUID(),created=new Date().toISOString();await f.update(job,"state='queued',claim_token=NULL,claim_expires=NULL");await sql("INSERT INTO article_handoffs(id,owner,article_id,event_id,state,created,updated,expires) VALUES(?,?,?,?,'delivered',?,?,?)",handoff,job.owner,job.target_id,`synthetic-event-${handoff}`,created,created,created);return job;};
  const helpJob=await helpFixture('fresh-help-samekey-race'),helpKey=randomUUID(),helpResults=await Promise.all(Array.from({length:8},()=>helpCall(helpJob,helpKey)));
  assert.equal(helpResults.filter(x=>x.new_execution_grant).length,1);assert.ok(helpResults.every(x=>x.claimed&&x.article_id===helpJob.target_id&&x.claim_token===helpResults[0].claim_token));helpJob.claim_token=helpResults[0].claim_token;assert.equal(await count('word_claim_origins',helpJob.owner),1);assert.equal((await f.get(helpJob)).word_claim_origin_hash,hash(helpJob.claim_token));assert.equal((await f.op.acquire(helpJob,'prepare')).acquired,true);
  const helpProof=await d1.prepare('SELECT * FROM word_claim_origins WHERE owner=?').bind(helpJob.owner).first();assert.equal(helpProof.proof_reference,`article_help_queue_claim:${hash(helpKey)}`);f.noSecret(helpProof,[helpJob.claim_token,helpJob.execution_token]);
  pass('actual help-queue eight-way same-key race grants one main claim and one immutable native fresh origin, with no credential stored in that origin');
  const helpLost=await helpFixture('fresh-help-response-loss'),helpLostKey=randomUUID();on('batch',x=>x.source.includes('word_claim_origins'),()=>{throw Error('SYNTHETIC_HELP_CLAIM_RESPONSE_LOST');},'after');await assert.rejects(helpCall(helpLost,helpLostKey),/SYNTHETIC_HELP_CLAIM_RESPONSE_LOST/);const helpLostRead=await helpCall(helpLost,helpLostKey,'read_article_help_claim'),helpLostReplay=await helpCall(helpLost,helpLostKey);assert.equal(helpLostRead.claimed,true);assert.equal(helpLostReplay.claim_token,helpLostRead.claim_token);assert.equal(helpLostReplay.new_execution_grant,false);assert.equal(await count('word_claim_origins',helpLost.owner),1);assert.equal(await count('article_help_queue_claims',helpLost.owner),1);
  pass('lost actual help-queue response reuses the same main claim and origin via exact receipt; retry neither rotates nor backfills');
  const helpRollback=await helpFixture('fresh-help-whole-batch-rollback'),helpRollbackKey=randomUUID();await sql("CREATE TRIGGER synthetic_origin_rollback BEFORE INSERT ON word_claim_origins BEGIN SELECT RAISE(ABORT,'SYNTHETIC_ORIGIN_ROLLBACK'); END");await assert.rejects(helpCall(helpRollback,helpRollbackKey),/SYNTHETIC_ORIGIN_ROLLBACK/);assert.equal((await f.get(helpRollback)).state,'queued');assert.equal((await f.get(helpRollback)).claim_token,null);assert.equal(await count('word_claim_origins',helpRollback.owner),0);assert.equal(await count('article_help_queue_claims',helpRollback.owner),0);await sql('DROP TRIGGER synthetic_origin_rollback');assert.equal((await helpCall(helpRollback,helpRollbackKey)).new_execution_grant,true);assert.equal(await count('word_claim_origins',helpRollback.owner),1);
  pass('actual origin insertion failure rolls back the entire help claim/receipt transaction; exact stable-key retry later creates one origin');

  const localQueueJob=await seed(d1,owner('fresh-native-local-queue'),'local_word');await sql("UPDATE local_word_jobs SET state='queued',claim_hash=NULL,claim_expires=NULL WHERE owner=? AND id=?",localQueueJob.owner,localQueueJob.target_id);const localQueueKey=randomUUID(),localQueueExecution=`synthetic-local-queue-execution-${randomUUID()}`,localQueueCore=load('local-word-queue'),localQueueArgs={claim_request_key:localQueueKey,execution_id:localQueueExecution};const localQueueResults=await Promise.all(Array.from({length:4},()=>localQueueCore.localWordQueueCall(localQueueJob.owner,'claim_pending_local_word_job',localQueueArgs)));assert.equal(localQueueResults.filter(x=>x.new_execution_grant).length,1);assert.ok(localQueueResults.every(x=>x.claimed&&x.job_id===localQueueJob.target_id&&x.claim_token===localQueueResults[0].claim_token));localQueueJob.claim_token=localQueueResults[0].claim_token;assert.equal(await count('word_claim_origins',localQueueJob.owner),1);const localQueueOrigin=await d1.prepare('SELECT * FROM word_claim_origins WHERE owner=?').bind(localQueueJob.owner).first();assert.equal(localQueueOrigin.claim_hash,hash(localQueueJob.claim_token));assert.equal(localQueueOrigin.proof_reference,`local_word_queue_claim:${hash(localQueueKey)}`);f.noSecret(localQueueOrigin,[localQueueJob.claim_token,localQueueJob.execution_token]);assert.equal((await f.op.acquire(localQueueJob,'prepare')).acquired,true);
  pass('actual desktop Word-only pending queue grants one immutable fresh main origin under four same-key callers, then requires a separate actual serial Word grant');

  const boundary=await granted('strict-timeout-boundary');
  await setAttempt(boundary,'active_elapsed_ms=3600000,active_started_at=NULL');
  const sixty=await attemptView(boundary);assert.equal(sixty.timeout_due,false);assert.equal(sixty.active_elapsed_ms,3600000);
  await assert.rejects(stop(boundary,'timeout'));assert.equal((await attemptView(boundary)).state,'running');
  await setAttempt(boundary,'active_elapsed_ms=3600001');
  assert.equal((await attemptView(boundary)).timeout_due,true);
  const timed=await stop(boundary,'timeout');assert.equal(timed.external_stop_confirmed,false);assert.equal(timed.new_execution_grant,false);assert.equal(timed.attempt.state,'waiting_safe_stop');assert.ok(timed.attempt.stop_requested_at);assert.ok(await slot(boundary.owner));
  await assert.rejects(f.op.progress(boundary,'read_source','completed',{action:'read_frozen_source',reason:'none'}));
  await assert.rejects(restart(boundary,await restartArgs(boundary)));
  pass('strict 60-minute equality is not due; 60 minutes plus 1ms fences writes and requests safe stop without declaring executor ended, releasing its slot or reopening');

  const paused=await granted('safe-pause'),pausedOriginal=await attemptView(paused);
  await setAttempt(paused,'active_elapsed_ms=12345,active_started_at=?',new Date(Date.now()-2000).toISOString());
  await f.op.intent(paused,'paused');
  const pendingPause=await attemptView(paused);assert.equal(pendingPause.state,'waiting_safe_stop');assert.ok(pendingPause.active_started_at);assert.ok(await slot(paused.owner));
  await assert.rejects(restart(paused,await restartArgs(paused)));
  for(const bad of [{confirm_all_actions_settled:false},{confirm_executor_ended:false},{execution_token:randomUUID()},{execution_id:randomUUID()},{claim_token:randomUUID()},{epoch:paused.epoch+1},{settled_reference:''},{terminal_reference:''}])await assert.rejects(acknowledge(paused,'paused_safe',bad));
  const safePaused=await acknowledge(paused,'paused_safe');assert.equal(safePaused.attempt.state,'paused_safe');assert.equal(safePaused.attempt.active_started_at,null);assert.ok(safePaused.attempt.active_elapsed_ms>=14000);assert.equal(await slot(paused.owner),null);
  assert.equal((await f.control(paused)).desired,'paused');await assert.rejects(f.op.acquire(nextExecution(paused),'prepare'));
  await f.op.intent(paused,'run');const resumed=nextExecution(paused),resumedGrant=await f.op.acquire(resumed,'prepare');assert.equal(resumedGrant.acquired,true);resumed.epoch=resumedGrant.epoch;
  const resumedView=await attemptView(resumed);assert.equal(resumedView.attempt_id,pausedOriginal.attempt_id);assert.equal(resumedView.generation,1);assert.ok(resumedView.active_elapsed_ms>=safePaused.attempt.active_elapsed_ms);assert.ok(resumedView.active_started_at);
  await assert.rejects(f.op.progress(paused,'read_source','completed',{action:'read_frozen_source',reason:'none'}));
  pass('pause remains potentially running until exact original holder end plus all-actions-settled; resume keeps the same generation and elapsed budget, while the old token stays fenced');

  const generations=await granted('generation-history',{scope:'heavy'}),generation1=await attemptView(generations);
  await f.op.progress(generations,'read_source','completed',{action:'read_frozen_source',reason:'none'});
  await f.op.progress(generations,'collect_images','waiting',{action:'search_public_images',reason:'waiting_for_images',candidate_urls:['https://images.example.org/synthetic-old-one.png','https://images.example.org/synthetic-old-two.png']});
  const oldProgress=await f.progress.readWordProgress(generations.owner,'article',generations.target_id);assert.equal(oldProgress.steps[1].counts.completed,2);
  const imageBytes=Buffer.from('synthetic-old-image-prefix'),imageId=randomUUID(),imageKey=`synthetic/${generations.target_id}/${imageId}/0`;
  await h.bucket.put(imageKey,imageBytes);
  await sql("INSERT INTO word_checkpoints(owner,target_kind,target_id,input_sha256,asset_id,kind,sha256,size,chunks,metadata_json,parts_json,state,created,attempt_id) VALUES(?,'article',?,?,?,'image',?,?,2,?,?,'incomplete',?,?)",generations.owner,generations.target_id,generations.input_sha256,imageId,hash(Buffer.concat([imageBytes,imageBytes])),imageBytes.length*2,JSON.stringify({source_url:'https://images.example.org/synthetic-old-one.png',after_paragraph:0}),JSON.stringify([{key:imageKey,size:imageBytes.length,sha256:hash(imageBytes)}]),new Date().toISOString(),generation1.attempt_id);
  const manifest=JSON.stringify({contract_version:1,original_sha256:generations.input_sha256,output_mode:'illustrated_word',layout:{images:[],recorded_at:new Date().toISOString()}});await f.update(generations,'artifact_manifest=?',manifest);
  await stop(generations);await acknowledge(generations);
  const gen2Args=await restartArgs(generations),oldArticle=await f.get(generations),gen2=await restart(generations,gen2Args);assert.equal(gen2.attempt.generation,2);assert.equal(gen2.attempt.active_elapsed_ms,0);assert.equal(gen2.attempt.started_at,null);assert.equal(gen2.attempt.active_started_at,null);assert.equal(gen2.new_execution_grant,false);
  assert.equal((await f.get(generations)).paragraphs,oldArticle.paragraphs);assert.equal((await f.get(generations)).id,oldArticle.id);assert.equal(JSON.parse((await f.get(generations)).artifact_manifest).layout,null);
  const audit=await d1.prepare('SELECT receipt_json FROM word_attempt_requests WHERE owner=? AND request_key=?').bind(generations.owner,gen2Args.request_key).first();assert.equal(JSON.parse(audit.receipt_json).archived_manifest_json,manifest);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_progress_events WHERE owner=? AND target_id=? AND attempt_id=?').bind(generations.owner,generations.target_id,generation1.attempt_id).first('n')),2);
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_checkpoints WHERE owner=? AND target_id=? AND attempt_id=?').bind(generations.owner,generations.target_id,generation1.attempt_id).first('n')),1);
  const freshProgress=await f.progress.readWordProgress(generations.owner,'article',generations.target_id);assert.equal(freshProgress.attempt.generation,2);assert.ok(freshProgress.steps.every(x=>x.counts===null));assert.equal(freshProgress.legacy,false);
  const freshRead=await f.op.read(generations);assert.equal(freshRead.checkpoints.length,0);assert.equal(freshRead.image_candidates.length,0);
  await assert.rejects(f.op.progress(generations,'collect_images','waiting',{action:'search_public_images',reason:'waiting_for_images',candidate_urls:['https://images.example.org/synthetic-late-old.png']}));
  const replayGen2=await restart(generations,gen2Args);assert.equal(replayGen2.duplicate,true);assert.equal(replayGen2.attempt.attempt_id,gen2.attempt.attempt_id);
  pass('safe audited generation two archives old plan and retains old checkpoints/progress but exposes none of their search/image/page counts; restart response replay never opens another attempt');

  let current=nextExecution(generations),grant=await f.op.acquire(current,'heavy');assert.equal(grant.acquired,true);current.epoch=grant.epoch;
  await stop(current);await acknowledge(current);const gen3=await restart(current,await restartArgs(current));assert.equal(gen3.attempt.generation,3);assert.equal(gen3.attempt.restarts_used,2);assert.equal(gen3.attempt.max_restarts,2);
  current=nextExecution(current);grant=await f.op.acquire(current,'prepare');assert.equal(grant.acquired,true);current.epoch=grant.epoch;await stop(current);await acknowledge(current);await assert.rejects(restart(current,await restartArgs(current)));
  assert.equal(await count('articles',generations.owner),1);assert.equal(await count('word_attempts',generations.owner),3);
  pass('same frozen article permits at most two distinct strategy restarts, totaling three durable generations; a fourth attempt cannot be minted');

  let replacements=await granted('replacement-budget-all-generations'),replacementSequence=0;
  const failedCandidate=async(job,url,extra={})=>{const candidate_id=randomUUID();await f.word.recordImageResult(job.owner,{...base(job),candidate_id,source_url:url,source_title:'Synthetic inaccessible public image',outcome:'download_failed',reason:'http_403',...extra});return candidate_id;};
  const original403Url='https://images.example.org/synthetic-original-403.png',originalFailed=await failedCandidate(replacements,original403Url);
  for(let index=0;index<3;index++)await failedCandidate(replacements,`https://replacement${replacementSequence++}.example.org/synthetic-alternate.png`,{replacement_for:originalFailed});
  await stop(replacements);await acknowledge(replacements);await restart(replacements,await restartArgs(replacements));replacements=nextExecution(replacements);let replacementGrant=await f.op.acquire(replacements,'prepare');assert.equal(replacementGrant.acquired,true);replacements.epoch=replacementGrant.epoch;
  await assert.rejects(failedCandidate(replacements,original403Url));
  const secondFailed=await failedCandidate(replacements,'https://images.example.org/synthetic-second-403.png');
  for(let index=0;index<3;index++)await failedCandidate(replacements,`https://replacement${replacementSequence++}.example.org/synthetic-alternate.png`,{replacement_for:secondFailed});
  await assert.rejects(failedCandidate(replacements,'https://replacement-seventh.example.org/synthetic-alternate.png',{replacement_for:secondFailed}));
  await stop(replacements);await acknowledge(replacements);await restart(replacements,await restartArgs(replacements));replacements=nextExecution(replacements);replacementGrant=await f.op.acquire(replacements,'prepare');assert.equal(replacementGrant.acquired,true);replacements.epoch=replacementGrant.epoch;
  const thirdFailed=await failedCandidate(replacements,'https://images.example.org/synthetic-third-403.png');await assert.rejects(failedCandidate(replacements,'https://replacement-eighth.example.org/synthetic-alternate.png',{replacement_for:thirdFailed}));
  assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_image_candidates WHERE owner=? AND target_id=? AND replacement_for IS NOT NULL').bind(replacements.owner,replacements.target_id).first('n')),6);assert.equal(await count('articles',replacements.owner),1);
  pass('six alternate-source failures remain a whole-job budget across generations; a new attempt cannot rerecord an already failed 403 URL or reset replacements');

  const attemptRace=await granted('restart-cas-race');await stop(attemptRace);await acknowledge(attemptRace);const restartFirst=await restartArgs(attemptRace),restartSecond={...restartFirst,request_key:randomUUID(),strategy_sha256:hash('synthetic-competing-image-strategy')};
  const restartResults=await Promise.allSettled([restart(attemptRace,restartFirst),restart(attemptRace,restartSecond)]);assert.equal(restartResults.filter(x=>x.status==='fulfilled').length,1);assert.equal((await attemptView(attemptRace)).generation,2);assert.equal(await count('word_attempts',attemptRace.owner),2);
  pass('two actual concurrent restart requests produce one next generation and one immutable restart audit');

  const restartLoss=await granted('restart-response-loss');await stop(restartLoss);await acknowledge(restartLoss);const lossRestartArgs=await restartArgs(restartLoss);
  on('batch',context=>context.source.includes("'restart'")&&context.source.includes('word_attempt_requests'),()=>{throw Error('SYNTHETIC_RESTART_RESPONSE_LOST');},'after');
  await assert.rejects(restart(restartLoss,lossRestartArgs),/SYNTHETIC_RESTART_RESPONSE_LOST/);const committedAttempt=await attemptView(restartLoss),restartReplay=await restart(restartLoss,lossRestartArgs);assert.equal(restartReplay.duplicate,true);assert.equal(restartReplay.attempt.attempt_id,committedAttempt.attempt_id);assert.equal(restartReplay.attempt.generation,2);assert.equal(await count('word_attempts',restartLoss.owner),2);
  pass('a committed restart response loss reads/replays the existing generation instead of using another attempt budget');

  const priorBarrier=arrivals=>{const gate=barrier(arrivals);for(let index=0;index<arrivals;index++)on('first',context=>context.source.startsWith('SELECT * FROM word_attempt_requests WHERE owner=? AND request_key=?'),async context=>{assert.equal(context.result,null);await gate.arrive();},'after');return gate;};
  for(const operation of ['stop','settle','restart']){
    const conflict=await granted(`same-key-conflicting-${operation}`),key=randomUUID(),view=await attemptView(conflict);let requests;
    if(operation==='stop')requests=[()=>stop(conflict,'owner_request',key),()=>stop(conflict,'pause',key)];
    if(operation==='settle')requests=[()=>acknowledge(conflict,'ended',{request_key:key,terminal_reference:'synthetic-terminal-one'}),()=>acknowledge(conflict,'ended',{request_key:key,terminal_reference:'synthetic-terminal-two'})];
    if(operation==='restart'){await stop(conflict);await acknowledge(conflict);const a=await restartArgs(conflict,{request_key:key});requests=[()=>restart(conflict,a),()=>restart(conflict,{...a,strategy_sha256:hash('synthetic-conflicting-strategy')})];}
    const gate=priorBarrier(2),inFlight=requests.map(request=>request());await withDeadline(gate.ready);gate.release();const conflicts=await Promise.allSettled(inFlight);
    assert.equal(conflicts.filter(x=>x.status==='fulfilled').length,1,`${operation} must not acknowledge a different payload under the winner's request key`);
    assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_attempt_requests WHERE owner=? AND request_key=?').bind(conflict.owner,key).first('n')),1);
    if(operation==='restart')assert.equal((await attemptView(conflict)).generation,2);else assert.equal((await attemptView(conflict)).attempt_id,view.attempt_id);
    pass(`actual simultaneous ${operation} same-key different-payload requests acknowledge only the one immutable winner, rather than borrowing its receipt`);
  }

  for(const operation of ['stop','settle','restart']){
    const repeated=await granted(`same-key-identical-${operation}`),key=randomUUID();let request;
    if(operation==='stop')request=()=>stop(repeated,'owner_request',key);
    if(operation==='settle')request=()=>acknowledge(repeated,'ended',{request_key:key});
    if(operation==='restart'){await stop(repeated);await acknowledge(repeated);const a=await restartArgs(repeated,{request_key:key});request=()=>restart(repeated,a);}
    const before=await f.control(repeated),gate=priorBarrier(4),inFlight=Array.from({length:4},()=>request());await withDeadline(gate.ready);gate.release();const duplicates=await Promise.all(inFlight),after=await f.control(repeated);
    assert.ok(duplicates.every(x=>x.recorded));assert.equal(duplicates.filter(x=>!x.duplicate).length,1);assert.equal(after.epoch,before.epoch+1);assert.equal(after.version,before.version+1);assert.equal((await d1.prepare('SELECT COUNT(*) n FROM word_attempt_requests WHERE owner=? AND request_key=?').bind(repeated.owner,key).first('n')),1);
    if(operation==='restart'){assert.equal((await attemptView(repeated)).generation,2);assert.equal(await count('word_attempts',repeated.owner),2);}
    f.noSecret(duplicates,[repeated.claim_token,repeated.execution_token]);
    pass(`four simultaneous identical ${operation} requests mutate control epoch/version exactly once and reuse one receipt`);
  }

  const frozenRace=await granted('restart-declared-output-race');await stop(frozenRace);await acknowledge(frozenRace);const frozenRaceArgs=await restartArgs(frozenRace),raceIdentity={output_id:randomUUID(),size:100,sha256:hash('synthetic-unfinished-word'),chunks:1,parts:[],bytes:0};
  on('batch',context=>context.source.includes("'restart'")&&context.source.includes('word_attempt_requests'),()=>f.update(frozenRace,'result_meta=?',JSON.stringify(raceIdentity)));
  await assert.rejects(restart(frozenRace,frozenRaceArgs));assert.equal((await attemptView(frozenRace)).generation,1);assert.equal(JSON.parse((await f.get(frozenRace)).result_meta).output_id,raceIdentity.output_id);
  pass('a Word declaration arriving after restart preflight is preserved by the actual transactional CAS and prevents new generation');

  const forbiddenRace=await granted('restart-403-cas-race');await stop(forbiddenRace);await acknowledge(forbiddenRace);const forbiddenRaceArgs=await restartArgs(forbiddenRace);
  on('batch',context=>context.source.includes("'restart'")&&context.source.includes('word_attempt_requests'),()=>sql("INSERT INTO word_service_incidents(owner,dependency,reason,state,first_seen,last_seen) VALUES(?,'public_images','http_403','await_executor',?,?)",forbiddenRace.owner,new Date().toISOString(),new Date().toISOString()));
  await assert.rejects(restart(forbiddenRace,forbiddenRaceArgs));assert.equal((await attemptView(forbiddenRace)).generation,1);assert.equal(await count('word_attempts',forbiddenRace.owner),1);
  pass('persistent 403 inserted between restart preflight and actual transaction defeats its CAS without minting another attempt');

  const elapsedAcquire=await granted('expired-timeout-reacquire');await setAttempt(elapsedAcquire,'active_elapsed_ms=3600001,active_started_at=NULL');await sql('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?',new Date(Date.now()-60000).toISOString(),elapsedAcquire.owner,elapsedAcquire.target_id);
  await assert.rejects(f.op.acquire({...elapsedAcquire,execution_token:randomUUID(),request_key:randomUUID()},'prepare'));
  const elapsedAcquireView=await attemptView(elapsedAcquire);assert.equal(elapsedAcquireView.state,'waiting_safe_stop');assert.equal(elapsedAcquireView.active_elapsed_ms,3600001);assert.ok(await slot(elapsedAcquire.owner));
  pass('expired subordinate lease with elapsed time above budget cannot reacquire even under the original execution ID; it persists safe-stop without resetting its accumulated clock');

  const crossed=await granted('acquire-crosses-time-budget');await setAttempt(crossed,'active_elapsed_ms=3599999,active_started_at=NULL');await sql('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?',new Date(Date.now()-60000).toISOString(),crossed.owner,crossed.target_id);
  const crossedSlot=await slot(crossed.owner);on('batch',context=>context.source.includes('word_execution_receipts')&&context.source.includes("status='running'"),()=>setAttempt(crossed,'active_elapsed_ms=3600001'));
  const crossedResults=await Promise.allSettled([f.op.acquire({...crossed,execution_token:randomUUID(),request_key:randomUUID()},'prepare')]);assert.ok(crossedResults[0].status==='rejected'||crossedResults[0].value.acquired===false);assert.equal((await slot(crossed.owner)).token_hash,crossedSlot.token_hash);assert.equal(await count('word_execution_receipts',crossed.owner),1);
  await attempts.enforceWordAttemptDeadline(crossed.owner,'article',crossed.target_id);assert.equal((await attemptView(crossed)).state,'waiting_safe_stop');
  pass('elapsed budget crossing between acquire preflight and final D1 grant cannot rotate the original serial holder or mint a fresh execution receipt');

  const legacyGrant=await granted('real-legacy-grant-unrecorded-time'),legacyGrantControl=await f.control(legacyGrant);
  await sql('DELETE FROM word_serial_slots WHERE owner=?',legacyGrant.owner);await sql('DELETE FROM word_attempts WHERE owner=?',legacyGrant.owner);await sql('UPDATE word_recovery SET attempt_id=NULL,lease_until=? WHERE owner=? AND target_id=?',new Date(Date.now()-60000).toISOString(),legacyGrant.owner,legacyGrant.target_id);
  assert.equal(await attemptView(legacyGrant),null);const legacyView=await f.op.view(legacyGrant);assert.equal(legacyView.status,'waiting_safe_stop');assert.equal(legacyView.reason,'legacy_executor_end_unconfirmed');
  await assert.rejects(f.op.acquire({...legacyGrant,execution_token:randomUUID(),request_key:randomUUID()},'prepare'));await assert.rejects(f.op.acquire(nextExecution(legacyGrant),'heavy'));assert.equal((await f.control(legacyGrant)).epoch,legacyGrantControl.epoch);assert.equal(await count('word_attempts',legacyGrant.owner),0);
  const oldGrantReadBefore=await readonlyState(legacyGrant),oldGrantProgress=await f.progress.readWordProgress(legacyGrant.owner,'article',legacyGrant.target_id);assert.equal(oldGrantProgress.legacy,true);assert.ok(oldGrantProgress.steps.every(x=>x.state==='unrecorded'&&x.counts===null));assert.equal(oldGrantProgress.started_at,null);assert.equal(oldGrantProgress.attempt,null);assert.deepEqual(await readonlyState(legacyGrant),oldGrantReadBefore);
  pass('a real immutable pre-protocol grant with missing elapsed history remains explicitly unknown and blocks regrant instead of fabricating a fresh clock');

  const lateCheckpoint=await granted('late-checkpoint-generation',{scope:'heavy'}),lateAsset=randomUUID(),lateBytes=Buffer.from(png()),lateCheckpointArgs={...base(lateCheckpoint),asset_id:lateAsset},lateAttempt=await attemptView(lateCheckpoint);
  await f.word.checkpointCall(lateCheckpoint.owner,'begin_word_checkpoint',{...lateCheckpointArgs,kind:'image',size:lateBytes.length,sha256:hash(lateBytes),chunks:1,metadata:{source_url:'https://images.example.org/synthetic-late.png',source_title:'Synthetic late raster',after_paragraph:1}});
  const lateBarrier=barrier();h.on({method:'bucket.put',match:({key})=>key.includes(`/checkpoints/${lateAsset}/`),action:()=>lateBarrier.arrive()});
  const oldCheckpointWrite=f.word.checkpointCall(lateCheckpoint.owner,'put_word_checkpoint_chunk',{...lateCheckpointArgs,index:0,data_base64:lateBytes.toString('base64')});await withDeadline(lateBarrier.ready);
  await stop(lateCheckpoint);await acknowledge(lateCheckpoint);await restart(lateCheckpoint,await restartArgs(lateCheckpoint));const lateSuccessor=nextExecution(lateCheckpoint),lateGrant=await f.op.acquire(lateSuccessor,'heavy');assert.equal(lateGrant.acquired,true);lateSuccessor.epoch=lateGrant.epoch;
  lateBarrier.release();await assert.rejects(oldCheckpointWrite);const oldCheckpoint=await d1.prepare('SELECT parts_json,attempt_id FROM word_checkpoints WHERE owner=? AND asset_id=?').bind(lateCheckpoint.owner,lateAsset).first();assert.deepEqual(JSON.parse(oldCheckpoint.parts_json),[]);assert.equal(oldCheckpoint.attempt_id,lateAttempt.attempt_id);
  await assert.rejects(f.word.checkpointCall(lateCheckpoint.owner,'finalize_word_checkpoint',lateCheckpointArgs));assert.equal((await f.op.read(lateSuccessor)).checkpoints.length,0);
  await assert.rejects(f.op.acquire({...lateSuccessor,execution_id:lateCheckpoint.execution_id,execution_token:randomUUID(),request_key:randomUUID()},'heavy'));
  pass('an old generation chunk delayed during actual object write cannot update checkpoint metadata or finalize after safe stop/restart; ended executor identity is never a new grant');

  const declared=await granted('declared-output-unknown',{scope:'heavy'}),outputBytes=await preparedOutput(declared),declaredArgs={...native(declared),size:outputBytes.length,sha256:hash(outputBytes),chunks:1};
  on('run',context=>context.source.includes('UPDATE articles SET result_meta'),()=>{throw Error('SYNTHETIC_BEGIN_OUTPUT_RESPONSE_LOST');},'after');
  await assert.rejects(article.articleCall(declared.owner,'begin_article_output',declaredArgs),/SYNTHETIC_BEGIN_OUTPUT_RESPONSE_LOST/);
  const outputMeta=JSON.parse((await f.get(declared)).result_meta);assert.ok(outputMeta.output_id);assert.equal(outputMeta.parts.length,0);
  const outputRead=await article.articleCall(declared.owner,'read_article_output', {article_id:declared.target_id});assert.equal(outputRead.output.output_id,outputMeta.output_id);
  const sameBegin=await article.articleCall(declared.owner,'begin_article_output',declaredArgs);assert.equal(sameBegin.output_id,outputMeta.output_id);
  await stop(declared);await acknowledge(declared);await assert.rejects(restart(declared,await restartArgs(declared)));
  assert.equal(JSON.parse((await f.get(declared)).result_meta).output_id,outputMeta.output_id);assert.equal(await count('articles',declared.owner),1);
  pass('declared Word identity with zero accepted parts and an unknown begin response is read/reused exactly; safe stop still cannot replace it with a new generation');

  await assert.rejects(article.articleCall(declared.owner,'begin_article_output',declaredArgs));
  const continued=nextExecution(declared),continuedGrant=await f.op.acquire(continued,'heavy');assert.equal(continuedGrant.acquired,true);continued.epoch=continuedGrant.epoch;
  await article.articleCall(continued.owner,'put_article_output_chunk',{...native(continued),output_id:outputMeta.output_id,index:0,data_base64:outputBytes.toString('base64')});
  const acceptedBeforeStop=await article.articleCall(continued.owner,'read_article_output',{article_id:continued.target_id});assert.equal(acceptedBeforeStop.output.next_index,1);
  const lateFinalizeBarrier=barrier();h.on({method:'bucket.get',match:({key})=>key.includes(`/output/${outputMeta.output_id}/`),action:()=>lateFinalizeBarrier.arrive()});
  const lateFinalize=article.articleCall(continued.owner,'finalize_article_output',{...native(continued),output_id:outputMeta.output_id});await withDeadline(lateFinalizeBarrier.ready);await stop(continued);await acknowledge(continued);lateFinalizeBarrier.release();await assert.rejects(lateFinalize);assert.equal((await f.get(continued)).result_key,null);
  await assert.rejects(article.articleCall(continued.owner,'put_article_output_chunk',{...native(continued),output_id:outputMeta.output_id,index:0,data_base64:outputBytes.toString('base64')}));
  const finalExecutor=nextExecution(continued),finalGrant=await f.op.acquire(finalExecutor,'heavy');assert.equal(finalGrant.acquired,true);finalExecutor.epoch=finalGrant.epoch;
  const finalized=await article.articleCall(finalExecutor.owner,'finalize_article_output',{...native(finalExecutor),output_id:outputMeta.output_id});assert.equal(finalized.ready,true);assert.ok(await slot(finalExecutor.owner));
  const saved=await f.progress.readWordProgress(finalExecutor.owner,'article',finalExecutor.target_id);assert.equal(saved.save.independently_confirmed,true);assert.equal(saved.save.desktop_saved,null);assert.equal(saved.output.output_id,outputMeta.output_id);assert.equal(saved.steps[5].state,'completed');assert.equal((await attemptView(finalExecutor)).state,'saved');assert.equal(await slot(finalExecutor.owner),null);
  await assert.rejects(stop(finalExecutor));await assert.rejects(restart(finalExecutor,await restartArgs(finalExecutor)));
  const finalReplay=await article.articleCall(finalExecutor.owner,'finalize_article_output',{...native(finalExecutor),output_id:outputMeta.output_id});assert.equal(finalReplay.read_only,true);assert.equal(finalReplay.new_execution_grant,false);
  pass('late old native finalize and cached chunk acknowledgement fail after safe stop; exact declared output then finalizes once and independent full SHA read alone marks cloud saved/releases holder, with desktop evidence separate');

  const forbidden=await granted('persistent-403'),forbiddenEpoch=forbidden.epoch;
  const interruption=await f.word.wordRecoveryCall(forbidden.owner,'report_word_interruption',{...base(forbidden),request_key:randomUUID(),epoch:forbiddenEpoch,reason:'http_403'});assert.equal(interruption.automatic_repair_started,false);assert.equal((await f.control(forbidden)).status,'blocked');assert.equal(interruption.recovery.reason,'http_403');assert.equal(interruption.recovery.safety_stop_pending,true);
  assert.ok(await slot(forbidden.owner));await acknowledge(forbidden);await assert.rejects(restart(forbidden,await restartArgs(forbidden)));
  const forbiddenRegrant=await Promise.allSettled([f.op.acquire(nextExecution(forbidden),'prepare')]);assert.ok(forbiddenRegrant[0].status==='rejected'||forbiddenRegrant[0].value.acquired===false);
  const forbiddenView=await f.op.view(forbidden);assert.equal(forbiddenView.status,'blocked');assert.equal(forbiddenView.reason,'http_403');assert.equal(forbiddenView.execution_confirmed,false);
  assert.equal((await d1.prepare("SELECT COUNT(*) n FROM word_service_incidents WHERE owner=? AND reason='http_403'").bind(forbidden.owner).first('n')),1);
  assert.equal((await attemptView(forbidden)).generation,1);assert.equal(h.externalCalls,0);
  pass('403 remains a bounded persistent dependency incident after the original holder safely ends; no fresh generation or network retry resets its blocker');

  for(const table of ['word_attempt_requests'])for(const operation of ['UPDATE','DELETE'])await assert.rejects(sql(operation==='UPDATE'?`UPDATE ${table} SET receipt_json='{}' WHERE owner=?`:`DELETE FROM ${table} WHERE owner=?`,generations.owner));
  for(const bad of [{unexpected:true},{target_kind:'article',target_id:randomUUID()}])await assert.rejects(attemptCall(generations,'read_word_attempt',bad));
  f.noSecret([await attemptCall(generations,'read_word_attempt'),await f.op.read(generations)],[generations.claim_token,generations.execution_token]);
  pass('immutable attempt request audit rejects update/delete; strict owner/target/extra-field reads expose no claim or execution credential');
  assert.equal(h.externalCalls,0);assert.equal(hooks.length,0);
  console.log(`PASS total=${passed}; actual Site TypeScript + isolated workerd D1; synthetic R2 bytes; no production/network/OS/browser acceptance`);
}finally{h.close();await mf.dispose();}
