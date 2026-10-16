// Synthetic metadata isolation and real local workerd D1 only. No production calls.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {createSyntheticHarness} from './word-recovery-harness.mjs';
import {png,docx} from './word-recovery-artifact-fixture.mjs';
const root=process.cwd();
const require=createRequire(root+'/package.json'),ts=require('typescript');
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC WORD PROGRESS ISOLATION")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'synthetic-word-progress-isolation'}});
const h=createSyntheticHarness({projectRoot:root,migrate:false});
let failProgress=false,stallProgress=false,releaseProgress,headFailure=false,getVersionMismatch=false,omitVersion=false,headCalls=0,getCalls=0,bytesRead=0,inFlight=0,maxInFlight=0,readDelay=0,networkCalls=0;
const objects=new Map(),versions=new Map();
const bucket={async head(key){headCalls++;if(headFailure)throw Error('synthetic HEAD failure');return objects.has(key)?{size:objects.get(key).byteLength,...(omitVersion?{}:{version:versions.get(key)})}:null;},async get(key){getCalls++;const bytes=objects.get(key);if(!bytes)return null;return {...(omitVersion?{}:{version:getVersionMismatch?'changed-in-flight':versions.get(key)}),arrayBuffer:async()=>{inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);if(readDelay)await new Promise(r=>setTimeout(r,readDelay));bytesRead+=bytes.byteLength;inFlight--;return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};},async put(key,bytes){objects.set(key,new Uint8Array(bytes));}};
try {
const nativeDb=await mf.getD1Database('DB');
await migrate(drizzle(nativeDb),{migrationsFolder:'drizzle'});
await migrate(drizzle(nativeDb),{migrationsFolder:'drizzle'});
// Inject only reads of optional progress metadata; every SQL expression and
// transaction still executes in D1. Business reads and writes are never mocked.
function prepared(source,values=[]){const native=nativeDb.prepare(source).bind(...values);return {native,bind:(...bound)=>prepared(source,bound),async first(column){if(source.includes('word_progress_events')){if(failProgress)throw Error('synthetic progress-only read outage');if(stallProgress)await new Promise(r=>{releaseProgress=r;});}return native.first(column);},all:()=>native.all(),run:()=>native.run()};}
const db={prepare:source=>prepared(source),batch:statements=>nativeDb.batch(statements.map(s=>s.native)),exec:source=>nativeDb.exec(source)};
h.env.DB=db;h.env.BUCKET=bucket;
const get=(source,...values)=>nativeDb.prepare(source).bind(...values).first();
const run=(source,...values)=>nativeDb.prepare(source).bind(...values).run();
function loader(baseline=false){const modules={};return function load(name){if(modules[name])return modules[name];const ex={};modules[name]=ex;const replacement=process.env.WORD_PROGRESS_REVIEW_SOURCE&&process.env.WORD_PROGRESS_REVIEW_SOURCE+'/lib/'+name+'.ts';const src=replacement&&fs.existsSync(replacement)?fs.readFileSync(replacement,'utf8'):baseline&&['articles','local-word-jobs','article-tools'].includes(name)?execFileSync('git',['show','HEAD:lib/'+name+'.ts'],{cwd:root,encoding:'utf8'}):fs.readFileSync(root+'/lib/'+name+'.ts','utf8');const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports:ex,require:n=>n==='cloudflare:workers'?{env:h.env}:n.startsWith('./')?load(n.slice(2)):require(n),crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Error,URL,Response,Request,AbortSignal,btoa,atob,Date,File,ReadableStream,structuredClone,setTimeout,clearTimeout,fetch:()=>{networkCalls++;throw Error('No external requests allowed');}});return ex;};}
const load=loader(),base=loader(true),owner='independent-ui-hooks-synthetic',hash=s=>createHash('sha256').update(s).digest('hex'),stamp=()=>new Date().toISOString();
async function article(overrides={}){const id=webcrypto.randomUUID(),paragraphs=JSON.stringify(['Synthetic title','Synthetic body']);const r={id,owner,title:'Synthetic title',filename:'synthetic.txt',source_key:'articles/'+id+'/source',paragraphs,created:stamp(),state:'processing',claim_token:webcrypto.randomUUID(),claim_expires:new Date(Date.now()+3600000).toISOString(),...overrides};const keys=Object.keys(r);await run('INSERT INTO articles('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')',...Object.values(r));return r;}
async function local(){const id='localword_'+webcrypto.randomUUID(),input={request_key:webcrypto.randomUUID(),filename:'synthetic.txt',source_sha256:'c'.repeat(64),title:'Synthetic title',leading_blank_paragraphs:0,paragraphs:['Synthetic body'],subheading_indices:[],original_sha256:hash(JSON.stringify(['Synthetic title','Synthetic body']))},raw=JSON.stringify(input),inputSha=hash(raw),manifest={contract_version:1,original_sha256:input.original_sha256,layout:null};await run("INSERT INTO local_word_jobs(id,owner,request_key,source_kind,output_mode,destinations_json,filename,title,leading_blank_paragraphs,source_sha256,original_sha256,input_sha256,input_json,artifact_manifest,state,created,updated,dispatch_state,dispatch_attempts) VALUES(?,?,?,'local_desktop','word_only','[]',?,?,0,?,?,?,?,?,'queued',?,?,'pending',0)",id,owner,input.request_key,input.filename,input.title,input.source_sha256,input.original_sha256,inputSha,raw,JSON.stringify(manifest),stamp(),stamp());return id;}

const a=await article(),id=await local();failProgress=true;
assert.equal((await base('articles').articleList(owner)).length,1);
assert.equal((await base('local-word-jobs').readLocalWordJob(owner,id)).job.state,'queued');
for(const [label,fn,extract] of [
 ['articleList',()=>load('articles').articleList(owner),r=>r[0]],
 ...['read_article','read_article_output','read_article_handoff'].map(name=>[name,()=>load('article-tools').articleCall(owner,name,{article_id:a.id}),r=>r]),
 ['readLocalWordJob',()=>load('local-word-jobs').readLocalWordJob(owner,id),r=>r.job]]){
 const r=extract(await fn());assert.equal(r.word_progress,null);assert.equal(r.word_progress_unavailable,true);console.log('PASS optional outage cannot break '+label);
}
const claimed=await load('local-word-jobs').localWordCall(owner,'claim_local_word_job',{job_id:id});
assert.equal(claimed.claimed,true);assert.equal(hash(claimed.claim_token),(await get('SELECT claim_hash FROM local_word_jobs WHERE id=?',id)).claim_hash);assert.equal(claimed.job.word_progress_unavailable,true);
await assert.rejects(load('word-progress').wordProgressCall(owner,'read_word_progress',{target_kind:'article',target_id:a.id}),/synthetic progress-only/);
console.log('PASS committed local claim returns its exact token during outage; explicit diagnostic remains strict');
await assert.rejects(load('article-tools').articleCall(owner,'begin_article_output',{article_id:a.id,claim_token:a.claim_token,size:1,sha256:hash('x'),chunks:1}),/同一任务实际 Word 执行位|Output already prepared|执行权限/);
assert.equal((await get('SELECT result_meta FROM articles WHERE owner=? AND id=?',owner,a.id)).result_meta,null);
assert.equal((await get('SELECT state FROM local_word_jobs WHERE owner=? AND id=?',owner,id)).state,'processing');
const standalone=await article({owner:'synthetic-isolated-business-owner',state:'queued',claim_token:null,claim_expires:null});
const standaloneClaim=await load('article-tools').articleCall(standalone.owner,'claim_article',{article_id:standalone.id});assert.equal(standaloneClaim.claimed,true);standalone.claim_token=standaloneClaim.claim_token;assert.equal((await get('SELECT COUNT(*) n FROM word_claim_origins WHERE owner=? AND target_id=? AND claim_hash=?',standalone.owner,standalone.id,hash(standalone.claim_token))).n,1);
const word=load('word-recovery'),executionToken=webcrypto.randomUUID(),grantBase={target_kind:'article',target_id:standalone.id,input_sha256:hash(standalone.paragraphs),claim_token:standalone.claim_token,execution_token:executionToken};
const granted=await word.wordRecoveryCall(standalone.owner,'acquire_word_execution',{...grantBase,execution_id:webcrypto.randomUUID(),request_key:webcrypto.randomUUID(),execution_scope:'heavy'});assert.equal(granted.acquired,true);
async function cache(kind,bytes,metadata={}){const asset_id=webcrypto.randomUUID();await word.checkpointCall(standalone.owner,'begin_word_checkpoint',{...grantBase,asset_id,kind,size:bytes.length,sha256:hash(bytes),chunks:1,metadata});await word.checkpointCall(standalone.owner,'put_word_checkpoint_chunk',{...grantBase,asset_id,index:0,data_base64:Buffer.from(bytes).toString('base64')});await word.checkpointCall(standalone.owner,'finalize_word_checkpoint',{...grantBase,asset_id});return asset_id;}
const image=Buffer.from(png()),wordBytes=Buffer.from(docx(image)),imageMetadata={source_url:'https://images.example.org/synthetic-isolation.png',source_title:'Synthetic isolation image',after_paragraph:1};await word.declareImageFloor(standalone.owner,{...grantBase,minimum_images:1});const imageAsset=await cache('image',image,imageMetadata);await word.recordImageResult(standalone.owner,{...grantBase,candidate_id:webcrypto.randomUUID(),source_url:imageMetadata.source_url,source_title:imageMetadata.source_title,outcome:'ready',reason:'none',asset_id:imageAsset});await load('article-tools').articleCall(standalone.owner,'record_article_images',{article_id:standalone.id,claim_token:standalone.claim_token,execution_token:executionToken,images:[{...imageMetadata,sha256:hash(image)}]});await cache('word',wordBytes);
const begun=await load('article-tools').articleCall(standalone.owner,'begin_article_output',{article_id:standalone.id,claim_token:standalone.claim_token,execution_token:executionToken,size:wordBytes.length,sha256:hash(wordBytes),chunks:1});assert.ok(begun.output_id);
assert.equal(JSON.parse((await get('SELECT result_meta FROM articles WHERE owner=? AND id=?',standalone.owner,standalone.id)).result_meta).output_id,begun.output_id);
console.log('PASS progress-only outage preserves real D1 writes while serial guard refuses another unresolved holder');
assert.equal((await get('SELECT count(*) n FROM word_progress_events')).n,0);
failProgress=false;stallProgress=true;const start=Date.now();const slow=await load('local-word-jobs').readLocalWordJob(owner,id);assert.equal(slow.job.word_progress_unavailable,true);assert.ok(Date.now()-start<1800);stallProgress=false;releaseProgress();
console.log('PASS optional stalled progress read bounded; existing business path remains usable');
const p=load('word-progress'),bytes=new TextEncoder().encode('Synthetic final Word bytes'),sha=hash(bytes);
async function finalArticle(key,overrides={}){objects.set(key,bytes);versions.set(key,webcrypto.randomUUID());return article({state:'completed',result_key:key,result_meta:JSON.stringify({output_id:webcrypto.randomUUID(),size:bytes.length,sha256:sha,chunks:1,bytes:bytes.length,parts:[{sha256:sha,size:bytes.length}],completed_at:stamp()}),...overrides});}
const rows=await Promise.all(Array.from({length:10},(_,i)=>finalArticle('synthetic/word-'+i)));
getCalls=0;await load('articles').articleList(owner);await load('articles').articleList(owner);assert.equal(getCalls,0);
const r=rows[0],read=()=>p.readWordProgress(owner,'article',r.id,r),summary=()=>p.optionalWordProgress(owner,'article',r.id,r);
assert.equal((await summary()).save.independently_confirmed,false);
assert.equal((await read()).save.independently_confirmed,true);assert.equal(getCalls,1);
for(let i=0;i<4;i++)assert.equal((await summary()).save.independently_confirmed,true);
assert.equal(getCalls,1);console.log('PASS cold and repeated worklist polls never GET Word; explicit digest reused only after current provider-version HEAD');
const changed=await article({...r,id:webcrypto.randomUUID(),owner:'second-synthetic-owner'});assert.equal((await p.optionalWordProgress(changed.owner,'article',changed.id,changed)).save.independently_confirmed,false);
assert.equal((await summary()).save.desktop_saved,null);
versions.set(r.result_key,webcrypto.randomUUID());objects.set(r.result_key,new Uint8Array(bytes.length));assert.equal((await summary()).save.independently_confirmed,false);assert.equal((await read()).save.independently_confirmed,false);
objects.set(r.result_key,bytes);versions.set(r.result_key,webcrypto.randomUUID());assert.equal((await read()).save.independently_confirmed,true);
const altered={...r,result_meta:JSON.stringify({...JSON.parse(r.result_meta),sha256:'f'.repeat(64)})};assert.equal((await p.optionalWordProgress(owner,'article',r.id,altered)).save.independently_confirmed,false);
console.log('PASS task/owner/output identities isolate cached proofs; same-size replacement invalidates proof; desktop save remains unknown');
headFailure=true;assert.equal((await read()).save.independently_confirmed,false);headFailure=false;
objects.delete(r.result_key);assert.equal((await summary()).save.independently_confirmed,false);objects.set(r.result_key,bytes);
omitVersion=true;let count=getCalls;await read();await read();assert.equal(getCalls-count,2);assert.equal((await summary()).save.independently_confirmed,false);omitVersion=false;
versions.set(r.result_key,webcrypto.randomUUID());getVersionMismatch=true;assert.equal((await read()).save.independently_confirmed,false);getVersionMismatch=false;
console.log('PASS absent object/version, failed HEAD and HEAD/GET version races never reuse digest evidence');
// More than cacheLimit successes must evict earlier entries; all fixtures synthetic.
for(let i=0;i<130;i++){const row=await finalArticle('synthetic/cache-'+i);assert.equal((await p.readWordProgress(owner,'article',row.id,row)).save.independently_confirmed,true);}
count=getCalls;assert.equal((await read()).save.independently_confirmed,true);assert.equal(getCalls,count+1);
console.log('PASS verified-success cache bounded at 128 entries, with no object bytes retained');
const originalGet=bucket.get;let releaseObject;bucket.get=async key=>{if(key===rows[1].result_key)await new Promise(r=>{releaseObject=r;});return originalGet(key);};
const pending=p.readWordProgress(owner,'article',rows[1].id,rows[1]);while(!releaseObject)await new Promise(r=>setTimeout(r,1));assert.equal((await p.readWordProgress(owner,'article',rows[2].id,rows[2])).save.independently_confirmed,true);assert.ok(await summary());releaseObject();await pending;
assert.equal(networkCalls,0);console.log('PASS one stalled full read cannot block unrelated read/summary; zero external calls');
console.log('13 word progress isolation groups passed; actual local workerd D1; synthetic R2 only; no production or external calls.');
} finally {h.close();await mf.dispose();}
