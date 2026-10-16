// Review counterexamples: actual modules, synthetic HTML, isolated SQLite/R2.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {loadTS} from './hot-discovery-loader.mjs';
const TTL=86400000;
function fixture(){
 let now=Date.parse('2026-10-08T08:00:00Z');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0034_parallel_doctor_spectrum.sql','utf8'));sql.function('strftime',{varargs:true},()=>new Clock().toISOString());
 const state={allHook:null,listHook:null,putHook:null};
 const db={prepare(query){let args=[];return {bind(...v){args=v;return this;},async all(){const results=sql.prepare(query).all(...args);if(state.allHook)await state.allHook();return {results};},async first(){return sql.prepare(query).get(...args)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}};
 const objects=new Map(),ops=[];
 const bucket={async list(options){ops.push('list');if(state.listHook)await state.listHook();return {objects:[...objects].filter(([k])=>k.startsWith(options.prefix)).map(([key,v])=>({key,customMetadata:v.metadata})),truncated:false};},async put(key,body,options){ops.push('put');objects.set(key,{body,metadata:options.customMetadata});if(state.putHook)await state.putHook();},async get(key){ops.push('get');const v=objects.get(key);return v?{size:Buffer.byteLength(v.body),async json(){return JSON.parse(v.body);}}:null;},async delete(keys){ops.push('delete');for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
 const seam={'./test-store':{db:()=>db,diagnosticBucket:()=>bucket}},globals={Date:Clock};
 const diag=loadTS('lib/hot-response-diagnostics.ts',seam,globals),store=loadTS('lib/hot-article-discovery-store.ts',seam,globals);
 const owner='TEST ONLY review',account={id:crypto.randomUUID(),name:'TEST ONLY',url:'https://www.toutiao.com/c/user/123456789/',created:new Clock().toISOString()};
 sql.prepare('INSERT INTO hot_benchmark_accounts(id,owner,name,url,created) VALUES(?,?,?,?,?)').run(account.id,owner,account.name,account.url,account.created);
 function scan(){const id=crypto.randomUUID(),stamp=new Clock().toISOString();sql.prepare('INSERT INTO hot_benchmark_scans(id,owner,request_key,state,accounts_json,created,expires,updated) VALUES(?,?,?,?,?,?,?,?)').run(id,owner,crypto.randomUUID(),'ready',JSON.stringify([account]),stamp,new Clock(now+60000).toISOString(),stamp);return {id,stamp};}
 const capture=(s,html='<main>TEST ONLY public content</main>')=>diag.captureResponseDiagnostic(owner,s.id,account,html,200,s.stamp);
 const read=s=>diag.readResponseDiagnostic(owner,s.id,account.id);
 return {sql,state,objects,ops,diag,store,owner,account,scan,capture,read,get now(){return now;},set now(v){now=v;}};
}
for(const phase of ['list','put']){
 const f=fixture();let entered=false,release,fetches=0;
 f.state[phase+'Hook']=async()=>{entered=true;await new Promise(resolve=>{release=resolve;});};
 const html=`<main><li><h3><a href="https://www.toutiao.com/article/1000000000000000001/">TEST ONLY card</a></h3><a rel="author" href="${f.account.url}">作者</a><time datetime="2026-10-07T08:00:00Z">2026-10-07</time><div class="article-stats"><span>12万阅读</span></div></li></main>`;
 const key=crypto.randomUUID(),start=performance.now(),pending=f.store.refreshDiscovery(f.owner,key,async()=>{fetches++;return new Response(html,{headers:{'content-type':'text/html'}});});
 while(!entered)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(fetches,1);const durable=await f.store.readDiscovery(f.owner,key);assert.equal(durable.scan.state,'ready');assert.equal(durable.scan.result.articles.length,1);
 f.now+=61000;const result=await pending;assert.ok(performance.now()-start<1000,'bounded optional wait');assert.equal(result.scan.state,'ready');assert.equal(result.scan.result.articles.length,1);assert.equal(result.scan.result.observations[0].response_diagnostic.state,'unavailable');
 if(phase==='put')await assert.rejects(()=>f.diag.readResponseDiagnostic(f.owner,result.scan.id,f.account.id),e=>e.status===404,'timed-out object is not a completed diagnostic');
 release();for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 if(phase==='list'){assert.equal(f.ops.includes('put'),false);assert.equal(f.ops.includes('delete'),false);}else assert.equal(f.objects.size,0,'late put deletes only its own object');
 f.sql.close();console.log('PASS optional '+phase+' timeout: primary ready before R2, 61s lease jump cannot discard result, bounded return and late-operation cancellation');
}
{
 const f=fixture(),s=f.scan();
 for(const [html,secret] of [['<pre>{"access_token":"AbC123-private"}</pre>','AbC123-private'],['<p>token=<span>AbC123-private</span></p>','AbC123-private'],['<div class="access-token">AbC123-private</div>','AbC123-private'],['<output name="password">p4ss-WORD</output>','p4ss-WORD'],['<p><span>access_</span><span>token</span><span>:</span><span>AbC123-private</span></p>','AbC123-private']]){
  assert.equal((await f.capture(s,html)).state,'stored');assert.ok(!JSON.stringify((await f.read(s)).dom).includes(secret));
 }
 f.sql.close();console.log('PASS quoted JSON, split token/key, sensitive class and output name redaction');
}
for(const phase of ['read','capture']){
 const f=fixture(),s=f.scan();if(phase==='read')await f.capture(s);f.now=Date.parse(s.stamp)+TTL-1;let calls=0;
 f.state.allHook=async()=>{if(++calls===2){await Promise.resolve();f.now+=2;}};
 if(phase==='read')await assert.rejects(()=>f.read(s),e=>e.status===410);else{assert.equal((await f.capture(s)).state,'unavailable');assert.equal(f.objects.size,0);}
 f.sql.close();console.log('PASS '+phase+' TTL check after final recent-scans await');
}
{
 const f=fixture(),a=f.scan();await f.capture(a);f.now++;const b=f.scan();await f.capture(b);let c;
 f.state.listHook=async()=>{f.state.listHook=null;f.now+=61000;c=f.scan();await f.capture(c);};
 await f.diag.cleanupResponseDiagnostics(f.owner);assert.equal((await f.read(c)).scan_id,c.id);assert.equal(f.objects.size,2);f.sql.close();console.log('PASS cleanup re-reads latest two after delayed list and retains newly accepted scan');
}
{
 const f=fixture(),a=f.scan();await f.capture(a);const controller=new AbortController();
 f.state.listHook=async()=>{controller.abort();};const before=f.objects.size;
 await assert.rejects(()=>f.diag.cleanupResponseDiagnostics(f.owner,{signal:controller.signal,deadline:f.now+200}));assert.equal(f.objects.size,before);assert.equal(f.ops.includes('delete'),false);f.sql.close();console.log('PASS canceled cleanup performs no later deletes');
}
