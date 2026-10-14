// Offline regression: actual recovery/article functions, SQLite and generated PNG/DOCX.
// No production article, browser, upload or network call is used.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
import {png,docx} from './word-recovery-artifact-fixture.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const raw=JSON.stringify(['Synthetic title','Synthetic body']);
const chinese='https://www.shazam.com/song/123/有没有人告诉你';
const encoded='https://www.shazam.com/song/123/%E6%9C%89%E6%B2%A1%E6%9C%89%E4%BA%BA%E5%91%8A%E8%AF%89%E4%BD%A0';
let passed=0;
function pass(name){passed++;console.log('PASS '+name);}

async function fixture(source_url){
 const h=createSyntheticHarness({projectRoot:process.cwd()}),load=h.loader();
 const w=load('word-recovery'),p=load('word-progress'),articles=load('article-tools'),owner='synthetic-source-url',id=randomUUID();
 h.sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(id,owner,'Synthetic title','synthetic.docx','articles/'+id+'/source',raw,new Date().toISOString(),'queued',null,null);
 const mainClaim=await articles.articleCall(owner,'claim_article',{article_id:id});
 assert.equal(mainClaim.claimed,true);assert.equal(mainClaim.word_execution_granted,false);
 const claim=mainClaim.claim_token;
 const base={target_kind:'article',target_id:id,claim_token:claim,input_sha256:hash(raw),execution_token:randomUUID()};
 const native={article_id:id,claim_token:claim,execution_token:base.execution_token};
 assert.equal((await w.wordRecoveryCall(owner,'acquire_word_execution',{...base,request_key:randomUUID(),execution_id:randomUUID()})).acquired,true);
 await w.declareImageFloor(owner,{...base,minimum_images:1});
 const image=png(),word=docx(image),metadata={source_url,source_title:'Synthetic source identity',after_paragraph:1};
 async function cache(kind,bytes,metadata={}){
  const asset_id=randomUUID(),a={...base,asset_id};
  await w.checkpointCall(owner,'begin_word_checkpoint',{...a,kind,sha256:hash(bytes),size:bytes.length,chunks:Math.ceil(bytes.length/65536),metadata});
  for(let i=0;i<Math.ceil(bytes.length/65536);i++)await w.checkpointCall(owner,'put_word_checkpoint_chunk',{...a,index:i,data_base64:Buffer.from(bytes.slice(i*65536,(i+1)*65536)).toString('base64')});
  await w.checkpointCall(owner,'finalize_word_checkpoint',a);
  return asset_id;
 }
 const imageAsset=await cache('image',image,metadata);
 const planned={...metadata,sha256:hash(image)};
 const record=images=>articles.articleCall(owner,'record_article_images',{...native,images});
 const begin=overrides=>articles.articleCall(owner,'begin_article_output',{...native,size:word.length,sha256:hash(word),chunks:Math.ceil(word.length/65536),...overrides});
 const checkpoints=()=>JSON.stringify(h.sql.prepare('SELECT * FROM word_checkpoints ORDER BY asset_id').all());
 const objects=()=>JSON.stringify([...h.objects].map(([key,value])=>({key,version:value.version,sha256:hash(value.bytes),size:value.bytes.length})).sort((a,b)=>a.key.localeCompare(b.key)));
 const checkpointObjects=()=>JSON.stringify([...h.objects].filter(([key])=>key.includes('/checkpoints/')).map(([key,value])=>({key,version:value.version,sha256:hash(value.bytes),size:value.bytes.length})).sort((a,b)=>a.key.localeCompare(b.key)));
 const manifest=()=>h.sql.prepare('SELECT artifact_manifest FROM articles WHERE id=?').get(id).artifact_manifest;
 const noOutput=()=>assert.equal(h.sql.prepare('SELECT result_meta FROM articles WHERE id=?').get(id).result_meta,null);
 return {h,w,p,articles,owner,id,claim,base,native,imageAsset,metadata,planned,word,cache,record,begin,checkpoints,objects,checkpointObjects,manifest,noOutput};
}

for(const {name,cpUrl,recordUrl,expected} of [
 {name:'Chinese source path survives raw checkpoint → frozen encoded layout → ready Word checkpoint → native declaration',cpUrl:chinese,recordUrl:chinese,expected:encoded},
 {name:'equivalent percent-encoded source matches the original Chinese checkpoint without rewriting it',cpUrl:chinese,recordUrl:encoded,expected:encoded},
 {name:'query ordering, tracking removal and fragment normalization remain compatible with raw checkpoints',cpUrl:chinese+'?b=2&a=1&utm_source=synthetic#source',recordUrl:chinese+'?b=2&a=1&utm_source=synthetic#source',expected:encoded+'?a=1&b=2'},
]){
 const f=await fixture(cpUrl);
 try{
  const beforeImages=f.checkpoints(),beforeImageBytes=f.objects();
  await f.record([{...f.planned,source_url:recordUrl}]);
  const frozen=f.manifest();
  assert.equal(JSON.parse(frozen).layout.images[0].source_url,expected);
  assert.equal(f.checkpoints(),beforeImages);
  assert.equal(f.objects(),beforeImageBytes);
  await assert.rejects(f.begin(),/先持久保存并核验同一完整 Word 字节/);
  f.noOutput();
  await f.cache('word',f.word);
  const before=f.checkpoints(),storedBytes=f.objects();
  const out=await f.begin();
  assert.equal(out.sha256,hash(f.word));assert.equal(out.size,f.word.length);assert.equal(out.chunks,Math.ceil(f.word.length/65536));
  assert.equal(f.checkpoints(),before);assert.equal(f.objects(),storedBytes);assert.equal(f.manifest(),frozen);
  assert.equal(JSON.parse(f.h.sql.prepare('SELECT metadata_json FROM word_checkpoints WHERE asset_id=?').get(f.imageAsset).metadata_json).source_url,cpUrl);
  assert.equal((await f.articles.articleCall(f.owner,'read_article_output',{article_id:f.id})).output.output_id,out.output_id);
  const checkpointBytes=f.checkpointObjects();
  for(let index=0;index<out.chunks;index++){
   const part=f.word.slice(index*65536,(index+1)*65536);
   const accepted=await f.articles.articleCall(f.owner,'put_article_output_chunk',{...f.native,output_id:out.output_id,index,data_base64:Buffer.from(part).toString('base64')});
   assert.equal(accepted.accepted,true);assert.equal(accepted.next_index,index+1);
   const readPart=await f.w.readNativeOutputChunk(f.owner,{target_kind:'article',target_id:f.id,output_id:out.output_id,index});
   assert.equal(readPart.sha256,hash(part));assert.equal(readPart.size,part.length);assert.deepEqual(Buffer.from(readPart.data_base64,'base64'),Buffer.from(part));
  }
  const final=await f.articles.articleCall(f.owner,'finalize_article_output',{...f.native,output_id:out.output_id});
  assert.equal(final.ready,true);assert.equal(final.sha256,hash(f.word));assert.equal(final.size,f.word.length);
  const saved=await f.articles.articleCall(f.owner,'read_article_output',{article_id:f.id});
  assert.equal(saved.ready,true);assert.equal(saved.state,'word_ready');assert.equal(saved.output.output_id,out.output_id);assert.equal(saved.output.sha256,hash(f.word));assert.equal(saved.output.bytes,f.word.length);assert.equal(saved.output.next_index,out.chunks);
  const verifiedProgress=await f.p.readWordProgress(f.owner,'article',f.id);
  assert.equal(verifiedProgress.save.independently_confirmed,true);
  const finalKey=f.h.sql.prepare('SELECT result_key FROM articles WHERE id=?').get(f.id).result_key;
  const storedFinal=await f.h.bucket.get(finalKey),finalBytes=Buffer.from(await storedFinal.arrayBuffer());
  assert.equal(hash(finalBytes),hash(f.word));assert.deepEqual(finalBytes,Buffer.from(f.word));
  assert.equal(f.checkpoints(),before);assert.equal(f.checkpointObjects(),checkpointBytes);assert.equal(f.manifest(),frozen);
  assert.equal(f.h.externalCalls,0);pass(name);
 }finally{f.h.close();}
}

const f=await fixture(chinese+'?asset=1');
try{
 const pristine=f.checkpoints(),pristineBytes=f.objects();
 for(const [name,changes] of [
  ['different source host',{source_url:'https://other.example.org/song/123/有没有人告诉你?asset=1'}],
  ['different source path',{source_url:'https://www.shazam.com/song/456/有没有人告诉你?asset=1'}],
  ['different effective query value',{source_url:chinese+'?asset=2'}],
  ['different source title',{source_title:'Different source identity'}],
  ['different image anchor',{after_paragraph:0}],
  ['different image SHA',{sha256:'f'.repeat(64)}],
 ]){
  await assert.rejects(f.record([{...f.planned,...changes}]),/配图须先持久保存并核验同一图片字节、来源与锚点/);
  f.noOutput();assert.equal(f.manifest(),null);assert.equal(f.checkpoints(),pristine);assert.equal(f.objects(),pristineBytes);pass(name+' remains rejected');
 }
 // Synthetic persisted-state faults exercise legacy/unverified pixels and a higher floor.
 const verification=f.h.sql.prepare('SELECT verification_json FROM word_checkpoints WHERE asset_id=?').get(f.imageAsset).verification_json;
 f.h.sql.prepare('UPDATE word_checkpoints SET verification_json=? WHERE asset_id=?').run(JSON.stringify({...JSON.parse(verification),pixel_decode_verified:false}),f.imageAsset);
 await assert.rejects(f.record([f.planned]),/配图须先持久保存并核验同一图片字节、来源与锚点/);
 f.noOutput();assert.equal(f.manifest(),null);f.h.sql.prepare('UPDATE word_checkpoints SET verification_json=? WHERE asset_id=?').run(verification,f.imageAsset);pass('unverified PNG still cannot freeze the image plan');
 f.h.sql.prepare('UPDATE word_recovery SET minimum_images=2 WHERE target_id=?').run(f.id);
 await assert.rejects(f.record([f.planned]),/真实去重配图不足/);
 f.noOutput();assert.equal(f.manifest(),null);f.h.sql.prepare('UPDATE word_recovery SET minimum_images=1 WHERE target_id=?').run(f.id);pass('declared image floor remains enforced');
 await f.record([f.planned]);await f.cache('word',f.word);
 const frozen=f.manifest(),before=f.checkpoints(),storedBytes=f.objects();
 for(const [name,overrides,pattern] of [
  ['wrong business claim',{claim_token:randomUUID()},/认领已失效/],
  ['wrong execution token',{execution_token:randomUUID()},/Word 执行租约已失效或已暂停/],
  ['different ready Word SHA',{sha256:'f'.repeat(64)},/先持久保存并核验同一完整 Word 字节/],
 ]){
  await assert.rejects(f.begin(overrides),pattern);f.noOutput();assert.equal(f.checkpoints(),before);assert.equal(f.objects(),storedBytes);assert.equal(f.manifest(),frozen);pass(name+' remains rejected');
 }
 const expires=f.h.sql.prepare('SELECT claim_expires FROM articles WHERE id=?').get(f.id).claim_expires;
 f.h.sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(new Date(Date.now()-1000).toISOString(),f.id);
 await assert.rejects(f.begin(),/认领已失效/);f.noOutput();assert.equal(f.checkpoints(),before);assert.equal(f.objects(),storedBytes);assert.equal(f.manifest(),frozen);
 f.h.sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run(expires,f.id);pass('expired business claim remains rejected');
 assert.ok((await f.begin()).output_id);assert.equal(f.checkpoints(),before);assert.equal(f.objects(),storedBytes);assert.equal(f.manifest(),frozen);assert.equal(f.h.externalCalls,0);
 pass('unchanged exact bytes and frozen plan remain usable after rejected requests');
}finally{f.h.close();}
console.log(`RESULT ${passed} groups PASS; actual business functions/SQLite/PNG/DOCX, memory R2, offline only`);
