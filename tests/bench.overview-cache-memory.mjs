// Manual target-runtime diagnostic, isolated synthetic D1 only. Never deployed.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {mkdtemp, readFile, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {BENCHMARK, seedBenchmark} from './bench-fixture.mjs';
import {PASSWORD} from './harness.mjs';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),directory=await mkdtemp(join(tmpdir(),'synthetic-cache-memory-'));
const runtime=JSON.parse(await readFile(join(root,'runtime.json'))),source=join(directory,'worker.mjs');
await build({stdin:{contents:`import worker from './src/worker.mjs';
const NativeDate=globalThis.Date;
globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[${Date.parse(BENCHMARK.now)}]));}static now(){return ${Date.parse(BENCHMARK.now)};}};
export default worker;`,resolveDir:root},outfile:source,bundle:true,platform:'node',format:'esm',target:'node24'});
const bootstrapSecret='synthetic-memory-bootstrap-only-not-a-live-secret';
const mf=new Miniflare({name:'synthetic-overview-cache',modules:true,cf:false,scriptPath:source,modulesRoot:directory,
  compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,
  d1Databases:['DB'],d1Persist:false,bindings:{SITE_ORIGIN:'http://localhost',MATRIX_BOOTSTRAP_SECRET:bootstrapSecret},
  host:'127.0.0.1',port:0,inspectorPort:0,outboundService:()=>new Response('External requests disabled',{status:502})});
const report={synthetic:true,complete:false,source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  test_bundle_sha256:createHash('sha256').update(await readFile(source)).digest('hex'),
  source_files:Object.fromEntries(await Promise.all(['src/worker.mjs','src/storage.mjs','src/records.mjs','src/overview-cache.mjs','src/overview-cache-time.mjs'].map(async file=>[file,createHash('sha256').update(await readFile(join(root,file))).digest('hex')]))),
  scope:'local workerd V8 Inspector only; sampled heap/backing storage, not full isolate RSS or a proven Cloudflare production maximum',
  fixed_time:BENCHMARK.now,samples:[],requests:[]};
let socket,timer,serial=0;const pending=new Map();
async function command(method) {
  const id=++serial;
  return new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>{pending.delete(id);reject(new Error('Synthetic inspector request timeout'));},5000);
    pending.set(id,{resolve:value=>{clearTimeout(deadline);resolve(value);},reject});
    socket.send(JSON.stringify({id,method}));
  });
}
try {
  const db=await mf.getD1Database('DB');
  const journal=JSON.parse(await readFile(join(root,'drizzle/meta/_journal.json')));
  for(const entry of journal.entries) {
    const sql=await readFile(join(root,'drizzle',entry.tag+'.sql'),'utf8');
    await db.batch(sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
  }
  const inspector=await mf.getInspectorURL();inspector.protocol='http:';inspector.pathname='/json/list';
  const targets=await(await fetch(inspector)).json();
  const target=targets.find(value=>String(value.title).includes('synthetic-overview-cache'));
  assert.ok(target?.webSocketDebuggerUrl,'exact synthetic user-worker inspector target required');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=()=>reject(new Error('Synthetic inspector connection failed'));});
  socket.onmessage=event=>{const message=JSON.parse(event.data),entry=pending.get(message.id);if(entry){pending.delete(message.id);entry.resolve(message);}};
  async function setup(path,body,authorization) {
    const response=await mf.dispatchFetch('http://localhost/api/v1'+path,{method:'POST',headers:{Origin:'http://localhost',
      'Content-Type':'application/json',...(authorization?{Authorization:'Bearer '+authorization}:{})},body:JSON.stringify(body)});
    assert.equal(response.status,path==='/bootstrap'?201:200);await response.text();return response;
  }
  await setup('/bootstrap',{username:'synthetic-memory-admin',password:PASSWORD},bootstrapSecret);
  const login=await setup('/auth/login',{username:'synthetic-memory-admin',password:PASSWORD});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const accounts=(await db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
  report.counts=await seedBenchmark(db,['toutiao','zhihu','wechat'].map(p=>accounts.find(x=>x.platform===p).id));
  let polling=false;
  const sample=async()=>{if(polling)return;polling=true;try {const value=await command('Runtime.getHeapUsage');
    if(value.error) throw new Error('Heap diagnostic unsupported');report.samples.push(value.result);
  } finally {polling=false;}};
  await sample();timer=setInterval(()=>sample().catch(()=>{report.sampling_error=true;}),25);
  for(const phase of ['cold','hot-1','hot-2']) {
    const started=performance.now(),response=await mf.dispatchFetch('http://localhost/api/v1/overview',{headers:{Cookie:cookie}});
    const bytes=Buffer.from(await response.arrayBuffer());await sample();
    report.requests.push({phase,status:response.status,ms:performance.now()-started,bytes:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex')});
    assert.equal(response.status,200);assert.equal(JSON.parse(bytes).data.cumulative.article_count,BENCHMARK.articles);
    if(phase!=='cold')assert.equal(report.requests.at(-1).sha256,report.requests[0].sha256);
  }
  report.complete=true;
} catch(error) {report.failure=error.message==='exact synthetic user-worker inspector target required'?error.message:'Synthetic target-runtime diagnostic failed; no production request performed';}
finally {
  clearInterval(timer);socket?.close();await mf.dispose().catch(()=>{report.dispose_error=true;});await rm(directory,{recursive:true,force:true});
  report.maxima=Object.fromEntries(['usedSize','totalSize','embedderHeapUsedSize','backingStorageSize'].map(key=>[key,Math.max(0,...report.samples.map(x=>x[key]??0))]));
  await mkdir(join(root,'artifacts/perf'),{recursive:true});
  await writeFile(join(root,'artifacts/perf/overview-cache-workerd-memory.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({complete:report.complete,counts:report.counts,requests:report.requests,maxima:report.maxima,failure:report.failure}));
}
