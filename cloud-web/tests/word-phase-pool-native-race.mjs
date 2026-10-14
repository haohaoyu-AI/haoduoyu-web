// Actual native TypeScript + SQLite permissions/CAS with synthetic-only jobs.
// Barriers run before the permission SELECT executes, after its fresh JS reads.
// This verifies no production task, network service, real image or page renderer.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSyntheticHarness, barrier, withDeadline} from './word-recovery-harness.mjs';
import {hash, owner, seed, native, operations} from './word-phase-pool-fixture.mjs';

const h=createSyntheticHarness({projectRoot:process.cwd()}), load=h.loader();
const w=load('word-recovery'), p=load('word-progress');
const article=load('article-tools'), local=load('local-word-jobs'), op=operations(w,p);
const bytes=Buffer.from('synthetic-native-race-part');
let passed=0;
const pass=name=>{passed++;console.log(`PASS ${name}`);};
const table=job=>job.target_kind==='article'?'articles':'local_word_jobs';
const outputColumn=job=>job.target_kind==='article'?'result_meta':'output_meta';
const getRow=job=>h.sql.prepare(`SELECT * FROM ${table(job)} WHERE owner=? AND id=?`).get(job.owner,job.target_id);
const call=(job,operation,args)=>job.target_kind==='article'
 ?article.articleCall(job.owner,`${operation}_article_output`,args)
 :local.localWordCall(job.owner,`${operation}_local_word_output`,args);

async function fixture(kind){
 const job=await seed(h.d1,owner(`native-race-${kind}`),kind);
 assert.equal((await op.acquire(job,'heavy')).acquired,true);
 const meta={output_id:randomUUID(),size:bytes.length,sha256:hash(bytes),chunks:1,bytes:bytes.length,
  parts:[{key:`synthetic/${job.target_id}/part`,sha256:hash(bytes),size:bytes.length}]};
 h.sql.prepare(`UPDATE ${table(job)} SET ${outputColumn(job)}=? WHERE owner=? AND id=?`)
  .run(JSON.stringify(meta),job.owner,job.target_id);
 return {job,meta};
}
const beginArgs=(job,meta)=>({...native(job),size:meta.size,sha256:meta.sha256,chunks:meta.chunks});
const partArgs=(job,meta)=>({...native(job),output_id:meta.output_id,index:0,data_base64:bytes.toString('base64')});

try{
 for(const kind of ['article','local_word']){
  const valid=await fixture(kind);
  const begun=await call(valid.job,'begin',beginArgs(valid.job,valid.meta));
  assert.equal(begun.output_id,valid.meta.output_id);
  const chunk=kind==='article'
   ?await article.articleCall(valid.job.owner,'put_article_output_chunk',partArgs(valid.job,valid.meta))
   :await local.localWordCall(valid.job.owner,'put_local_word_output_chunk',partArgs(valid.job,valid.meta));
  assert.equal(chunk.accepted,true);assert.equal(chunk.duplicate,true);
  assert.equal(getRow(valid.job)[outputColumn(valid.job)],JSON.stringify(valid.meta));
  pass(`${kind}: live heavy existing declaration and identical part replay remain idempotent`);

  for(const mutation of kind==='article'?['scope','claim','input','lease','claim_expiry']:['scope','claim','lease','claim_expiry']){
   const {job,meta}=await fixture(kind), gate=barrier();
   const original=getRow(job), puts=h.counts['bucket.put']||0;
   h.on({method:'first',phase:'before',match:source=>
    source.source.startsWith(`SELECT 1 FROM ${table(job)} WHERE owner=? AND id=? AND state='processing'`),
    action:()=>gate.arrive()});
   const rejection=assert.rejects(call(job,'begin',beginArgs(job,meta)));
   await withDeadline(gate.ready);
   if(mutation==='scope'){
    const change=await op.transitionArgs(job,'prepare');
    const changed=await op.transition(job,change);
    assert.equal(changed.acquired,true);assert.equal(changed.transitioned,true);
   }else if(mutation==='claim'){
    h.sql.prepare(`UPDATE ${table(job)} SET ${kind==='article'?'claim_token':'claim_hash'}=? WHERE owner=? AND id=?`)
     .run(kind==='article'?randomUUID():hash(randomUUID()),job.owner,job.target_id);
   }else if(mutation==='input'){
    const column=kind==='article'?'paragraphs':'input_json';
    h.sql.prepare(`UPDATE ${table(job)} SET ${column}=? WHERE owner=? AND id=?`)
     .run(kind==='article'?JSON.stringify(['Synthetic replacement']):JSON.stringify({synthetic:'replacement'}),job.owner,job.target_id);
   }else if(mutation==='lease'){
    h.sql.prepare('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?')
     .run(new Date(Date.now()-60000).toISOString(),job.owner,job.target_id);
   }else{
    h.sql.prepare(`UPDATE ${table(job)} SET claim_expires=? WHERE owner=? AND id=?`)
     .run(new Date(Date.now()-60000).toISOString(),job.owner,job.target_id);
   }
   gate.release();await withDeadline(rejection);
   assert.equal(gate.count,1);
   assert.equal(getRow(job)[outputColumn(job)],original[outputColumn(job)]);
   assert.equal(getRow(job).result_key,null);
   assert.equal(h.counts['bucket.put']||0,puts);
   pass(`${kind}: existing declaration ${mutation} changes after fresh JS fence but before SQL are rejected without native writes`);
  }

  if(kind==='local_word'){
   const {job}=await fixture(kind), original=getRow(job);
   assert.throws(()=>h.sql.prepare('UPDATE local_word_jobs SET input_json=? WHERE owner=? AND id=?')
    .run(JSON.stringify({synthetic:'replacement'}),job.owner,job.target_id),/local_word_frozen_input/);
   assert.equal(getRow(job).input_json,original.input_json);
   pass('local_word: actual immutable-input trigger blocks attempted source change before any permission acknowledgement');
  }

  const {job,meta}=await fixture(kind);
  const key=`synthetic/${job.target_id}/result-${meta.sha256}.docx`;
  h.sql.prepare(`UPDATE ${table(job)} SET result_key=?,state=?,claim_expires=? WHERE owner=? AND id=?`)
   .run(key,kind==='article'?'word_ready':'word_completed',new Date(Date.now()-60000).toISOString(),job.owner,job.target_id);
  h.sql.prepare("UPDATE word_recovery SET desired='paused',lease_until=? WHERE owner=? AND target_id=?")
   .run(new Date(Date.now()-60000).toISOString(),job.owner,job.target_id);
  const snapshot=JSON.stringify(getRow(job)), grants=h.sql.prepare('SELECT COUNT(*) n FROM word_execution_receipts WHERE owner=?').get(job.owner).n;
  const finalizeArgs={...native(job),output_id:meta.output_id};
  const completed=await call(job,'finalize',finalizeArgs);
  assert.equal(kind==='article'?completed.ready:completed.terminal,true);
  assert.equal(completed.read_only,true);assert.equal(completed.new_execution_grant,false);
  if(kind==='article'){
   const saved=await call(job,'begin',beginArgs(job,meta));
   assert.equal(saved.already_ready,true);assert.equal(saved.read_only,true);assert.equal(saved.new_execution_grant,false);
   await assert.rejects(call(job,'begin',{...beginArgs(job,meta),sha256:'0'.repeat(64)}));
  }
  await assert.rejects(call(job,'finalize',{...finalizeArgs,output_id:randomUUID()}));
  await assert.rejects(kind==='article'
   ?article.articleCall(owner('foreign'),'finalize_article_output',finalizeArgs)
   :local.localWordCall(owner('foreign'),'finalize_local_word_output',finalizeArgs));
  assert.equal(JSON.stringify(getRow(job)),snapshot);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM word_execution_receipts WHERE owner=?').get(job.owner).n,grants);
  pass(`${kind}: completed exact identity remains owner-only read-only with expired execution/claim; conflicts and foreign owner fail`);
 }
 assert.equal(h.externalCalls,0);assert.equal(h.objects.size,0);
 console.log(`PASS ${passed} native race groups; actual TS + SQLite; zero network/production calls, zero object writes`);
}finally{h.close();}
