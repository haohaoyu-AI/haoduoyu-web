import type {WordProgress} from './word-progress-contract';
export type BridgeSpec = {nonce:string; batch_id:string; local_origin:string};
type FrozenRequest = {request_key:string; filename:string; source_sha256:string; original_sha256:string; title:string; paragraphs:string[]; subheading_indices:number[]; leading_blank_paragraphs?:number};
type LocalItem = {item_id:string; request_key:string; payload:Omit<FrozenRequest,'request_key'>; job_id:string|null};
type WordJob = {id:string; source_kind:string; output_mode:string; destinations:unknown[]; source_sha256:string; original_sha256:string; state:string; dispatch_state?:string; error?:string|null; word_progress?:WordProgress|null; word_progress_unavailable?:boolean; word?:{ready:boolean; size:number; sha256:string; filename:string}|null};
const RECOVERY_COOLDOWN_MS=60*1000;
const MAX_RECOVERY_DISPATCHES=3;

class BridgeHttpError extends Error {
  constructor(readonly status:number,message:string){super(message);}
}

export function parseBridgeFragment(fragment:string):BridgeSpec {
  const parameters=new URLSearchParams(fragment.replace(/^#/,''));
  if([...parameters.keys()].some(key=>!['nonce','batch_id','local_origin'].includes(key)))throw Error('本机连接参数无效，请从本地版重新进入。');
  for(const key of ['nonce','batch_id','local_origin'])if(parameters.getAll(key).length!==1)throw Error('本机连接参数不完整，请从本地版重新进入。');
  const nonce=parameters.get('nonce')||'',batch_id=parameters.get('batch_id')||'',local_origin=parameters.get('local_origin')||'';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(nonce)||!/^[a-f0-9]{32}$/.test(batch_id)||!/^http:\/\/127\.0\.0\.1:88(?:7[5-9]|8[0-4])$/.test(local_origin))throw Error('本机连接参数无效，请从本地版重新进入。');
  return {nonce,batch_id,local_origin};
}

export function assertWordOnlyJob(job:WordJob,request:FrozenRequest):void {
  if(!job||!/^localword_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(job.id)||job.source_kind!=='local_desktop'||job.output_mode!=='word_only'||!Array.isArray(job.destinations)||job.destinations.length||job.source_sha256!==request.source_sha256||job.original_sha256!==request.original_sha256)throw Error('云任务与本机冻结源稿不匹配，已停止接收。');
}

async function responseJson(response:Response):Promise<any>{
  const value:any=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401)throw new BridgeHttpError(response.status,'请正常登录本人账号，再从本地版重新点击求助小鱼。');
    if(response.status===404)throw new BridgeHttpError(response.status,'真实小鱼本地连接接口尚未上线，请完成专用接口部署后重试。');
    throw new BridgeHttpError(response.status,typeof value.error==='string'?value.error:'小鱼连接暂时失败，请重试。');
  }
  return value;
}

function transientCloudError(error:unknown):boolean {
  return !(error instanceof BridgeHttpError)||error.status>=500||[408,425,429].includes(error.status);
}

function assertSameJob(job:WordJob,request:FrozenRequest,id:string):void {
  assertWordOnlyJob(job,request);
  if(job.id!==id)throw Error('云任务编号发生变化，已停止接收；请继续查询原任务。');
}

function delay(signal:AbortSignal,milliseconds:number):Promise<void>{return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Closed','AbortError'));return;}
  const aborted=()=>{clearTimeout(timer);reject(new DOMException('Closed','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve();},milliseconds);
  signal.addEventListener('abort',aborted,{once:true});
});}

export async function runDesktopWordBridge(spec:BridgeSpec,onState:(message:string)=>void,signal:AbortSignal,fetcher:typeof fetch=fetch,onProgress?:(progress:WordProgress|null,disconnected:boolean,unavailable?:boolean)=>void):Promise<void>{
  // Observation only: the existing bridge controls/nonce/dispatch/import/save
  // evidence remain authoritative. Older cloud responses simply omit progress.
  const notifyProgress=(progress:WordProgress|null,disconnected=false,unavailable=false)=>{try{onProgress?.(progress,disconnected,unavailable);}catch{/* Presentation cannot interrupt the bridge. */}};
  const report=(job:WordJob,disconnected=false)=>notifyProgress(job.word_progress?.contract_version===1?job.word_progress:null,disconnected,!!job.word_progress_unavailable);
  const headers={'X-Local-Xiaoyu-Nonce':spec.nonce,'X-Local-Xiaoyu-Batch':spec.batch_id};
  const local=async(path:string,options:RequestInit={})=>{
    try{return await responseJson(await fetcher(spec.local_origin+'/api/local-xiaoyu/cloud/'+path,{...options,mode:'cors',credentials:'omit',headers:{...headers,...options.headers},signal}));}
    catch(error){
      if(signal.aborted||error instanceof BridgeHttpError)throw error;
      throw Error(path==='result'?'Word 回传结果尚未确认；请回本地查看成品与本篇状态，原云任务已保留。':
        '本地连接已中断；请保持本地版打开，再从求助小鱼进入，原云任务已保留。');
    }
  };
  const cloud=async(path:string,options:RequestInit={})=>responseJson(await fetcher(path,{...options,credentials:'same-origin',cache:'no-store',signal}));
  let current:LocalItem|null=null;
  let unavailable:string|null=null;
  // Keep the local session alive during cloud poll and a slow Word download.
  const heartbeat=setInterval(()=>{if(!signal.aborted)void local('pending').catch(()=>{});},3000);
  try{
    onState('正在连接本机，使用本人登录提交 Word-only 任务…');
    while(!signal.aborted){
      const pending=await local('pending');
      if(pending.batch_id!==spec.batch_id)throw Error('本机批次已变化，请从本地版重新进入。');
      if(!pending.item){if(pending.running===false){await local('end',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});onState('本批文章处理已结束，请回本地版查看成品。');return;}await delay(signal,1500);continue;}
      current=pending.item as LocalItem;
      // A new item must never inherit the previous item's saved progress if its first cloud read fails.
      notifyProgress(null);
      try{
      if(unavailable)throw Error(unavailable);
      const request:FrozenRequest={...current.payload,request_key:current.request_key};
      let response:any;
      try{
        if(current.job_id){response=await cloud('/api/local-word-jobs/'+encodeURIComponent(current.job_id));}
        else {response=await cloud('/api/local-word-jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Xiaoyu-Upload':'1'},body:JSON.stringify(request)});}
      }catch(error){
        if(!transientCloudError(error))throw error;
        throw Error(current.job_id?'云连接中断；原任务已保留，请回本地重新点击求助小鱼查询同一任务。':
          '源稿提交结果尚未确认；不会重复上传，请回本地重新点击求助小鱼，使用同一任务键查询。');
      }
      let job:WordJob=response.job;
      assertWordOnlyJob(job,request);
      report(job);
      if(current.job_id)assertSameJob(job,request,current.job_id);
      const jobId=job.id;
      current.job_id=job.id;
      await local('bind',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_id:current.item_id,job_id:job.id})});
      if(response.connection_ready===false&&job.state!=='word_completed'){
        unavailable='真实小鱼专用连接尚未启用；当前云任务已保留，本批后续源稿未继续提交。';
        throw Error(unavailable);
      }
      // Unknown may have delivered the immutable event. Wait out the server's
      // 60s cooldown, then read this exact job before each bounded recovery.
      let recognized=job.dispatch_state==='accepted'||job.state!=='queued';
      let recoveryDispatches=0;
      let nextRecoveryAt=Date.now()+(job.dispatch_state==='pending'?0:RECOVERY_COOLDOWN_MS);
      const deadline=Date.now()+45*60*1000;
      while(job.state!=='word_completed'&&job.state!=='failed'){
        if(Date.now()>deadline)throw Error('真实小鱼暂未完成；云任务已保留，下次可继续查询。');
        onState(job.state==='queued'?'任务已保存，等待真实小鱼认领：'+request.filename+'。':
          '小鱼已认领，正在自动配图排版：'+request.filename+'。此任务只生成 Word。');
        await delay(signal,3000);
        await local('pending');
        let refreshed:any;
        try{refreshed=await cloud('/api/local-word-jobs/'+encodeURIComponent(jobId));}
        catch(error){
          if(!transientCloudError(error))throw error;
          nextRecoveryAt=Math.max(nextRecoveryAt,Date.now()+RECOVERY_COOLDOWN_MS);
          onState('云连接暂时中断，正在查询原任务：'+request.filename+'；不会重新上传源稿。');
          report(job,true);
          continue;
        }
        assertSameJob(refreshed.job,request,jobId);
        job=refreshed.job;
        report(job);
        recognized=recognized||job.dispatch_state==='accepted'||job.state!=='queued';
        if(refreshed.connection_ready===false&&job.state==='queued'&&!recognized){
          unavailable='真实小鱼专用连接尚未启用；当前云任务已保留，本批后续源稿未继续提交。';
          throw Error(unavailable);
        }
        if(!recognized&&job.state==='queued'&&['pending','unknown','sending'].includes(job.dispatch_state||'')&&Date.now()>=nextRecoveryAt){
          if(recoveryDispatches>=MAX_RECOVERY_DISPATCHES)throw Error('本篇已尝试 3 次恢复，仍未确认小鱼认领；同一云任务已保留，请回本地重新点击求助小鱼继续。');
          recoveryDispatches++;
          nextRecoveryAt=Date.now()+RECOVERY_COOLDOWN_MS;
          onState('正在恢复同一小鱼任务（'+recoveryDispatches+'/'+MAX_RECOVERY_DISPATCHES+'）：'+request.filename+'。');
          let dispatched:any;
          try{dispatched=await cloud('/api/local-word-jobs/'+encodeURIComponent(jobId)+'/dispatch',{method:'POST',headers:{'X-Xiaoyu-Upload':'1'}});}
          catch(error){
            if(!transientCloudError(error))throw error;
            nextRecoveryAt=Date.now()+RECOVERY_COOLDOWN_MS;
            onState('恢复派发结果尚未确认；原任务保留，冷却后先读取状态再继续。');
            continue;
          }
          assertSameJob(dispatched.job,request,jobId);
          job=dispatched.job;
          report(job);
          recognized=recognized||job.dispatch_state==='accepted'||dispatched.dispatch?.state==='accepted'||job.state!=='queued';
          nextRecoveryAt=Date.now()+RECOVERY_COOLDOWN_MS;
          if(dispatched.connection_ready===false&&job.state==='queued'&&!recognized){
            unavailable='真实小鱼专用连接尚未启用；当前云任务已保留，本批后续源稿未继续提交。';
            throw Error(unavailable);
          }
        }
      }
      if(job.state==='failed')throw Error(job.error||'小鱼处理本篇失败，继续下一篇。');
      const word=job.word;
      if(!word?.ready||!Number.isSafeInteger(word.size)||word.size<1||word.size>32*1024*1024||!/^[a-f0-9]{64}$/.test(word.sha256))throw Error('小鱼成品描述无效，本篇未保存。');
      let download:Response;
      try{download=await fetcher('/api/local-word-jobs/'+encodeURIComponent(job.id)+'/download',{credentials:'same-origin',cache:'no-store',signal});}
      catch(error){
        if(signal.aborted)throw error;
        throw Error('Word 下载连接中断；原云任务已保留，本篇未确认保存，请从本地求助小鱼重新进入。');
      }
      if(!download.ok){await responseJson(download);throw Error('Word 下载失败。');}
      const advertisedSha=download.headers.get('X-Word-SHA256'),advertisedSize=download.headers.get('Content-Length');
      if((advertisedSha!==null&&advertisedSha!==word.sha256)||(advertisedSize!==null&&Number(advertisedSize)!==word.size))throw Error('Word 下载描述不匹配，本篇未保存。');
      const bytes=await download.arrayBuffer();
      const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(value=>value.toString(16).padStart(2,'0')).join('');
      if(bytes.byteLength!==word.size||actual!==word.sha256)throw Error('Word 下载校验失败，本篇未保存。');
      await local('result',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Local-Xiaoyu-Item':current.item_id,'X-Local-Xiaoyu-Job':job.id,'X-Word-SHA256':word.sha256},body:bytes});
      onState('Word 已交回本地核验保存：'+request.filename);
      current=null;
      await delay(signal,250);
      }catch(error){
        if(signal.aborted)return;
        const message=error instanceof Error?error.message:'本篇小鱼处理失败。';
        if(/尚未上线|正常登录本人账号/.test(message))unavailable=message;
        if(current){await local('fail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_id:current.item_id,job_id:current.job_id,error:message})});}
        current=null;
        onState(message+' 正在继续检查本批下一篇。');
        await delay(signal,250);
      }
    }
  }catch(error){
    if(signal.aborted)return;
    const message=error instanceof Error?error.message:'小鱼连接中断，请重新进入。';
    if(current){await local('fail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({item_id:current.item_id,job_id:current.job_id,error:message})}).catch(()=>{});}
    onState(message);
    throw error;
  }finally{
    clearInterval(heartbeat);
  }
}
