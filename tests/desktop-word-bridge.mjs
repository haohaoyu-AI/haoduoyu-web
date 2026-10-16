import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';

// No real HTTP, paid execution or user manuscripts. A virtual clock exercises
// the server's 60s cooldown and proves the local heartbeat stays alive.
const compiled=ts.transpileModule(fs.readFileSync('lib/desktop-word-bridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class FakeClock {
  now=1700000000000;
  nextId=0;
  timers=new Map();
  setTimeout=(fn,ms)=>this.add(fn,ms,0);
  setInterval=(fn,ms)=>this.add(fn,ms,ms);
  clearTimeout=id=>this.timers.delete(id);
  clearInterval=id=>this.timers.delete(id);
  add(fn,ms,period){const id=++this.nextId;this.timers.set(id,{id,fn,at:this.now+ms,period});return id;}
  sleep(ms){return new Promise(resolve=>this.setTimeout(resolve,ms));}
  async drive(promise){
    let done=false,result,error;
    promise.then(value=>{done=true;result=value;},value=>{done=true;error=value;});
    for(let step=0;step<6000&&!done;step++){
      for(let flush=0;flush<25;flush++)await Promise.resolve();
      // Real crypto and Response streams must settle before moving fake time.
      await new Promise(resolve=>setImmediate(resolve));
      if(done)break;
      const timer=[...this.timers.values()].sort((a,b)=>a.at-b.at||a.id-b.id)[0];
      if(!timer)continue;
      this.now=timer.at;
      if(timer.period){timer.at+=timer.period;}else this.timers.delete(timer.id);
      timer.fn();
    }
    assert.equal(done,true,'Bridge must finish within the finite fake-clock budget');
    if(error)throw error;
    return result;
  }
}
function loadBridge(clock){
  const module={exports:{}};
  class ClockDate extends Date{static now(){return clock.now;}}
  vm.runInNewContext(compiled,{module,exports:module.exports,URLSearchParams,Response,DOMException,Date:ClockDate,crypto:webcrypto,Array,Uint8Array,fetch,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,setInterval:clock.setInterval,clearInterval:clock.clearInterval});
  return module.exports;
}
const nonce='a'.repeat(64),batch_id='b'.repeat(32),local_origin='http://127.0.0.1:8875';
const bridge=loadBridge(new FakeClock());
const spec=bridge.parseBridgeFragment('#'+new URLSearchParams({nonce,batch_id,local_origin}));
assert.equal(spec.local_origin,local_origin);
for(const local of ['http://evil.invalid:8875','http://127.0.0.1:8765','https://127.0.0.1:8875','http://127.0.0.1:8875/','http://127.0.0.1:8875?path=x'])assert.throws(()=>bridge.parseBridgeFragment('#'+new URLSearchParams({nonce,batch_id,local_origin:local})));
assert.throws(()=>bridge.parseBridgeFragment('#'+new URLSearchParams({nonce,batch_id,local_origin})+'&nonce=other'));
assert.throws(()=>bridge.parseBridgeFragment('#'+new URLSearchParams({nonce,batch_id,local_origin})+'&platform=toutiao'));
const payload={filename:'synthetic.txt',title:'合成标题',paragraphs:['合成正文。'],subheading_indices:[],leading_blank_paragraphs:2,source_sha256:'c'.repeat(64),original_sha256:'d'.repeat(64)};
const item={item_id:'e'.repeat(32),request_key:'018d2a85-0bce-532c-a502-e1c737b95ec6',payload,job_id:null};
const raw=new Uint8Array([80,75,3,4,5,6,7,8]),sha256=createHash('sha256').update(raw).digest('hex');
const job={id:'localword_10a6db0c-e2d3-42db-9f8a-77377141e08e',source_kind:'local_desktop',output_mode:'word_only',destinations:[],state:'word_completed',source_sha256:payload.source_sha256,original_sha256:payload.original_sha256,word:{ready:true,size:raw.length,sha256,filename:'synthetic.docx'}};
const queued=dispatch_state=>({...job,state:'queued',dispatch_state,word:null});
const request={...payload,request_key:item.request_key};
bridge.assertWordOnlyJob(job,request);
for(const changed of [{id:'article_old'},{source_kind:'web'},{output_mode:'default'},{destinations:['toutiao']},{source_sha256:'0'.repeat(64)},{original_sha256:'0'.repeat(64)}])assert.throws(()=>bridge.assertWordOnlyJob({...job,...changed},request));
const json=value=>Response.json(value);
let scenarios=0;
async function scenario(config={}){
  scenarios++;
  const clock=new FakeClock(),started=clock.now,calls=[],states=[],failures=[],progress=[];
  let complete=false,reads=0,dispatches=0,uploads=0,results=0,ended=0,downloadInFlight=false,heartbeatDuringDownload=0;
  const controller=new AbortController();
  if(config.abortAt)clock.setTimeout(()=>controller.abort(),config.abortAt);
  const context=()=>({clock,elapsed:clock.now-started,reads,dispatches,uploads,results,failures,calls});
  const fake=async(url,options={})=>{
    calls.push({url,options,at:clock.now-started});
    if(url.startsWith(local_origin+'/')){
      assert.equal(options.credentials,'omit');
      assert.equal(options.headers['X-Local-Xiaoyu-Nonce'],nonce);
      assert.equal(options.headers['X-Local-Xiaoyu-Batch'],batch_id);
      if(config.localOffline?.(context(),url))throw new TypeError('Local server disconnected');
    }
    if(url===local_origin+'/api/local-xiaoyu/cloud/pending'){
      if(downloadInFlight)heartbeatDuringDownload++;
      return json(config.pending?.(context())||{batch_id,running:!complete,item:complete?null:{...item,job_id:config.localJobId||null}});
    }
    if(url===local_origin+'/api/local-xiaoyu/cloud/end'){ended++;return json({ok:true});}
    if(url==='/api/local-word-jobs'){
      uploads++;
      assert.equal(options.credentials,'same-origin');assert.equal(options.method,'POST');
      const submitted=JSON.parse(options.body);
      assert.equal(submitted.request_key,item.request_key);assert.equal(submitted.title,payload.title);
      assert.deepEqual(submitted.paragraphs,payload.paragraphs);assert.equal(submitted.leading_blank_paragraphs,2);
      assert.equal('nonce' in submitted,false);assert.equal('destinations' in submitted,false);
      return json(config.create?await config.create(context()):{job,connection_ready:true});
    }
    if(url==='/api/local-word-jobs/'+job.id){
      reads++;
      const value=config.read?await config.read(context()):{job:config.initial||queued('pending'),connection_ready:true};
      return value instanceof Response?value:json(value);
    }
    if(url==='/api/local-word-jobs/'+job.id+'/dispatch'){
      dispatches++;
      assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');
      assert.equal(options.body,undefined,'Recovery never resends the source payload');
      assert.equal(options.headers['X-Xiaoyu-Upload'],'1');
      const cloudCalls=calls.filter(call=>call.url.startsWith('/api/local-word-jobs'));
      assert.equal(cloudCalls.at(-2).url,'/api/local-word-jobs/'+job.id,'Every recovery follows a fresh same-job GET');
      return json(config.dispatch?await config.dispatch(context()):{job,connection_ready:true,dispatch:{state:'accepted'}});
    }
    if(url===local_origin+'/api/local-xiaoyu/cloud/bind'){
      assert.equal(JSON.parse(options.body).job_id,job.id);return json({ok:true});
    }
    if(url==='/api/local-word-jobs/'+job.id+'/download'){
      if(config.downloadUnknown)throw new TypeError('Word download disconnected');
      downloadInFlight=true;
      if(config.downloadDelay)await clock.sleep(config.downloadDelay);
      downloadInFlight=false;
      return new Response(config.corrupt?new Uint8Array([1,2,3,4,5,6,7,8]):raw,{headers:{'X-Word-SHA256':sha256,'Content-Length':String(raw.length)}});
    }
    if(url===local_origin+'/api/local-xiaoyu/cloud/result'){
      results++;
      assert.notEqual(config.corrupt,true);
      assert.deepEqual(new Uint8Array(options.body),raw);
      assert.equal(options.headers['X-Local-Xiaoyu-Job'],job.id);assert.equal(options.headers['X-Word-SHA256'],sha256);
      complete=true;
      if(config.resultUnknown)throw new TypeError('Local save acknowledgement disconnected');
      return json({ok:true});
    }
    if(url===local_origin+'/api/local-xiaoyu/cloud/fail'){
      failures.push(JSON.parse(options.body));
      if(config.resultUnknown)return Response.json({error:'already complete'},{status:409});
      complete=true;return json({ok:true});
    }
    throw Error('Unexpected endpoint '+url);
  };
  let error=null;
  try{await clock.drive(loadBridge(clock).runDesktopWordBridge(spec,value=>states.push(value),controller.signal,fake,(value,disconnected,unavailable)=>{progress.push({value,disconnected,unavailable});if(config.progressThrows)throw Error('Synthetic presentation failure');}));}catch(value){error=value;}
  assert.equal(calls.some(call=>/article\.submitted|\/api\/articles|toutiao|zhihu/.test(call.url)),false);
  assert.equal(clock.timers.size,0,'Bridge clears its heartbeat when stopped');
  return {...context(),states,error,ended,heartbeatDuringDownload,progress};
}
function succeeded(result){assert.equal(result.error,null);assert.equal(result.results,1);assert.equal(result.ended,1);assert.equal(result.failures.length,0);}
const recoveryTimes=result=>result.calls.filter(call=>call.url.endsWith('/dispatch')).map(call=>call.at);

// Successful relay and corrupt bytes preserve the original scope checks.
succeeded(await scenario());
{
  const result=await scenario({corrupt:true});
  assert.equal(result.results,0);assert.equal(result.failures.length,1);assert.match(result.failures[0].error,/校验失败/);assert.equal(result.ended,1);
}
// Connection absence stores the first job and does not upload later sources.
{
  const result=await scenario({
    pending:({failures})=>({batch_id,running:failures.length<2,item:failures.length<2?{...item,item_id:String(failures.length+1).repeat(32)}:null}),
    create:()=>({job:queued('pending'),reused:false,connection_ready:false})
  });
  assert.equal(result.uploads,1);assert.equal(result.dispatches,0);assert.equal(result.failures.length,2);
  assert.equal(result.failures[0].job_id,job.id);assert.equal(result.failures[1].job_id,null);
}
// Never-sent reused jobs resume on the same ID after a confirming read.
{
  const result=await scenario({create:()=>({job:queued('pending'),reused:true,connection_ready:true})});
  succeeded(result);assert.equal(result.dispatches,1);assert.equal(result.uploads,1);
}
// Fresh unknown now recovers automatically once the real cooldown expires.
{
  const result=await scenario({create:()=>({job:queued('unknown'),reused:false,connection_ready:true}),initial:queued('unknown')});
  succeeded(result);assert.equal(result.dispatches,1);assert.ok(recoveryTimes(result)[0]>=60000);assert.equal(result.uploads,1);
}
// A reused job still cooling down retries again after 60s, with one stable ID.
{
  const result=await scenario({
    create:()=>({job:queued('unknown'),reused:true,connection_ready:true}),initial:queued('unknown'),
    dispatch:({dispatches})=>dispatches===1?{job:queued('unknown'),connection_ready:true,dispatch:{state:'unknown',event_dispatched:false}}:{job,connection_ready:true,dispatch:{state:'accepted'}}
  });
  succeeded(result);assert.equal(result.dispatches,2);assert.equal(result.uploads,1);
  assert.ok(recoveryTimes(result)[0]>=60000);assert.ok(recoveryTimes(result)[1]-recoveryTimes(result)[0]>=60000);
}
// Accepted and processing jobs keep polling beyond 60s without dispatching.
for(const initial of [queued('accepted'),{...queued('unknown'),state:'processing'}]){
  const result=await scenario({create:()=>({job:initial,connection_ready:true}),read:({reads})=>({job:reads<25?initial:job,connection_ready:true})});
  succeeded(result);assert.equal(result.dispatches,0);assert.ok(result.elapsed>=75000);
}
{
  const result=await scenario({create:()=>({job:{...queued('unknown'),state:'failed',error:'Synthetic processing failed'},connection_ready:true})});
  assert.equal(result.dispatches,0);assert.equal(result.results,0);assert.equal(result.failures.length,1);
}
// A later stale queued snapshot cannot erase an observed accepted state.
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),read:({reads})=>({job:reads===1?queued('accepted'):reads<25?queued('unknown'):job,connection_ready:true})});
  succeeded(result);assert.equal(result.dispatches,0);
}
// Dispatch's accepted acknowledgement also survives a stale job view.
{
  const result=await scenario({
    create:()=>({job:queued('unknown'),connection_ready:true}),
    read:({dispatches,reads})=>({job:dispatches&&reads>45?job:queued('unknown'),connection_ready:true}),
    dispatch:()=>({job:queued('unknown'),connection_ready:true,dispatch:{state:'accepted'}})
  });
  succeeded(result);assert.equal(result.dispatches,1);
}
// Persisting unknown finishes with an actionable retained-job message in ~4min.
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),initial:queued('unknown'),dispatch:()=>({job:queued('unknown'),connection_ready:true,dispatch:{state:'unknown',event_dispatched:true}})});
  assert.equal(result.dispatches,3);assert.equal(result.uploads,1);assert.equal(result.results,0);assert.equal(result.failures.length,1);
  assert.equal(result.failures[0].job_id,job.id);assert.match(result.failures[0].error,/3 次恢复.*同一云任务已保留/);
  assert.ok(result.elapsed<10*60*1000);
  const times=recoveryTimes(result);for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=60000);
}
// A lost dispatch response first reads this job; observed processing suppresses retries.
{
  const result=await scenario({
    create:()=>({job:queued('unknown'),connection_ready:true}),
    read:({dispatches,reads})=>({job:dispatches?(reads<25?{...queued('unknown'),state:'processing'}:job):queued('unknown'),connection_ready:true}),
    dispatch:()=>{throw new TypeError('Dispatch response lost');}
  });
  succeeded(result);assert.equal(result.dispatches,1);assert.equal(result.uploads,1);assert.ok(result.states.some(state=>state.includes('结果尚未确认')));
}
// A cloud GET disconnect delays dispatch until a fresh read and another cooldown.
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),read:({reads})=>{if(reads<=2)throw new TypeError('Cloud offline');return {job:queued('unknown'),connection_ready:true};}});
  succeeded(result);assert.equal(result.uploads,1);assert.ok(recoveryTimes(result)[0]>=66000);assert.ok(result.states.some(state=>state.includes('云连接暂时中断')));
}
// Unknown upload outcome never retries the source POST within this run.
{
  const result=await scenario({create:()=>{throw new TypeError('Upload response lost');}});
  assert.equal(result.uploads,1);assert.equal(result.dispatches,0);assert.equal(result.results,0);assert.equal(result.failures[0].job_id,null);
  assert.match(result.failures[0].error,/提交结果尚未确认.*不会重复上传/);
}
// A matching hash on a different ID is insufficient to replace an existing task.
{
  const result=await scenario({localJobId:job.id,read:()=>({job:{...job,id:'localword_20a6db0c-e2d3-42db-9f8a-77377141e08e'},connection_ready:true})});
  assert.equal(result.uploads,0);assert.equal(result.dispatches,0);assert.equal(result.results,0);
  assert.equal(result.failures[0].job_id,job.id);assert.match(result.failures[0].error,/任务编号发生变化/);
}
// Slow downloads keep pending heartbeats alive until the acknowledged local end.
{
  const result=await scenario({downloadDelay:8000});
  succeeded(result);assert.ok(result.heartbeatDuringDownload>=2);
}
// Lost save acknowledgement is not called a successful handoff and never reuploads.
{
  const result=await scenario({resultUnknown:true});
  assert.ok(result.error);assert.equal(result.results,1);assert.equal(result.uploads,1);
  assert.equal(result.states.some(state=>state.includes('Word 已交回')),false);
}
// A stopped local server aborts the relay; browser closure clears the heartbeat.
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),localOffline:({elapsed})=>elapsed>=3000});
  assert.ok(result.error);assert.equal(result.uploads,1);assert.equal(result.dispatches,0);assert.equal(result.results,0);
  assert.ok(result.states.some(state=>state.includes('本地连接已中断')));
}
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),abortAt:5000});
  assert.equal(result.error,null);assert.equal(result.dispatches,0);assert.equal(result.results,0);assert.equal(result.failures.length,0);
}
// A Word download disconnect gives a retained-job message, not a saved result.
{
  const result=await scenario({downloadUnknown:true});
  assert.equal(result.results,0);assert.equal(result.uploads,1);assert.equal(result.dispatches,0);
  assert.equal(result.failures.length,1);assert.match(result.failures[0].error,/Word 下载连接中断.*原云任务已保留.*未确认保存/);
}
// Auth errors stop recovery; a temporary HTTP 503 reads the same task again.
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),read:()=>Response.json({error:'expired'},{status:401})});
  assert.equal(result.dispatches,0);assert.equal(result.results,0);assert.equal(result.failures.length,1);
  assert.match(result.failures[0].error,/正常登录本人账号/);
}
{
  const result=await scenario({create:()=>({job:queued('unknown'),connection_ready:true}),read:({reads})=>reads===1?Response.json({error:'temporarily unavailable'},{status:503}):{job:queued('unknown'),connection_ready:true}});
  succeeded(result);assert.equal(result.uploads,1);assert.ok(recoveryTimes(result)[0]>=63000);
}
// Optional Word progress is presentation-only, including a failed projection.
const progressFixture={contract_version:1,target_kind:'local_word',target_id:job.id,execution:{state:'saved'},save:{independently_confirmed:true,desktop_saved:null}};
{
  const result=await scenario({create:()=>({job:{...job,word_progress:progressFixture},connection_ready:true}),progressThrows:true});
  succeeded(result);assert.equal(result.progress[0].value,null);assert.equal(result.progress[1].value.target_id,job.id);
}
{
  const result=await scenario({create:()=>({job:{...job,word_progress:null,word_progress_unavailable:true},connection_ready:true})});
  succeeded(result);assert.equal(result.progress.at(-1).value,null);assert.equal(result.progress.at(-1).unavailable,true);
}
{
  const result=await scenario({create:()=>({job:{...queued('accepted'),word_progress:progressFixture},connection_ready:true}),read:({reads})=>{if(reads===1)throw new TypeError('Synthetic cloud outage');return {job:{...job,word_progress:progressFixture},connection_ready:true};}});
  succeeded(result);assert.deepEqual(result.progress.map(value=>value.disconnected),[false,false,true,false]);
}
{
  const result=await scenario();succeeded(result);assert.ok(result.progress.every(value=>value.value===null&&!value.unavailable));
}
// Clear the old item's progress before any cloud operation for the next item.
{
  const result=await scenario({
    pending:({results,failures})=>({batch_id,running:failures.length===0,item:failures.length?null:results?{...item,item_id:'f'.repeat(32),payload:{...payload,filename:'second-synthetic.txt'}}:item}),
    create:({uploads})=>{if(uploads===2)throw new TypeError('Second cloud response unknown');return {job:{...job,word_progress:progressFixture},connection_ready:true};}
  });
  assert.equal(result.results,1);assert.equal(result.failures.length,1);assert.equal(result.uploads,2);
  assert.equal(result.progress.at(-1).value,null);assert.equal(result.progress.at(-1).unavailable,false);
  assert.ok(result.states.some(value=>value.includes('提交结果尚未确认')));
}
console.log('Desktop Word bridge: '+scenarios+' isolated fake-HTTP/fake-clock scenarios passed; origin/scope/hash checks, bounded same-job cooldown recovery, stable request key/ID, accepted/processing suppression, disconnects, slow-download heartbeat, optional-progress isolation and batch-item clearing. No real network/model execution.');
