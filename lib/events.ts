import {db} from './test-store';
const ENC=new TextEncoder();
const SITE='xiaoyu-event-test.haohaoyu202409.chatgpt.site';
export function callbackURL(value:unknown){if(typeof value!=='string'||value.length>2048)throw Error('invalid_callback');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||!u.hostname.includes('.')||u.hostname.endsWith('.')||u.hostname.includes(':')||/^[0-9.]+$/.test(u.hostname)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||u.hostname===SITE||u.hostname.endsWith('.chatgpt.site'))throw Error('invalid_callback');return u.href;}
export function keyBytes(s:unknown){if(typeof s!=='string'||!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error('invalid_secret');const raw=atob(s.slice(6));if(raw.length<24||raw.length>64)throw Error('invalid_secret');return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function hex(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ENC.encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
async function boundedText(response:Response,limit:number){const reader=response.body?.getReader();if(!reader)return '';let total=0;const chunks:Uint8Array[]=[];try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error('response_too_large');}chunks.push(value);}const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return new TextDecoder().decode(bytes);}finally{reader.releaseLock();}}
async function subID(owner:string,url:string,name='test.created'){return 'sub_'+await hex(JSON.stringify([owner,url,name,{}]));}
export function equal(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
export async function signature(secret:string,id:string,timestamp:string,body:string){const key=await crypto.subtle.importKey('raw',keyBytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,ENC.encode(`${id}.${timestamp}.${body}`)));return 'v1,'+btoa(String.fromCharCode(...bytes));}
// Native Workers fetch uses the provider's public-only DNS/connection egress.
// global_fetch_strictly_public removes same-zone origin exceptions. No custom proxy, TLS or resolver.
// Correlate the signed bytes with callback acceptance. Never log callback URLs,
// owner IDs, secrets, signatures, challenges, article contents or response bodies.
// A callback 2xx is not proof that the automation received its event context.
function transportLog(details:Record<string,unknown>){try{console.info(JSON.stringify({component:'event-transport',...details}));}catch{/* diagnostics cannot affect delivery */}}
async function transportDiagnostic(sub:{id:unknown},id:string,body:string,attempt:number){
 let name='unknown',dataKeys:string[]=[];
 try{const event=JSON.parse(body);if(['test.created','article.submitted','topic.research_requested','editorial.requested','hot_article.research_requested','local_word.requested','dedao.writing_requested','dedao.cloud_requested'].includes(event.name)){name=event.name;dataKeys=Object.keys(event.data||{}).filter(key=>['test_id','article_id','research_id','request_id','batch_id','job_id','task_id'].includes(key)).sort();}else if(event.type==='verification')name='verification';}catch{/* no raw malformed payload in logs */}
 let payloadHash:string|null=null;try{payloadHash=await hex(body);}catch{/* diagnostics cannot affect signing or delivery */}
 return {eventId:/^(?:evt_|article_wake_|topic_evt_|editorial_evt_|hot_evt_|local_word_evt_|dedao_evt_|verify_)[A-Za-z0-9_-]{1,160}$/.test(id)?id:null,event_name:name,subscription_id:typeof sub.id==='string'&&/^sub_[0-9a-f]{64}$/.test(sub.id)?sub.id:null,attempt,payload_sha256:payloadHash,payload_bytes:ENC.encode(body).length,data_keys:dataKeys};
}
async function send(sub:any,id:string,body:string,attempt=1,beforeFetch?:()=>Promise<boolean>){
 const details=await transportDiagnostic(sub,id,body,attempt),started=Date.now();transportLog({...details,stage:'sign_begin'});
 try{const url=callbackURL(sub.callback);const stamp=String(Math.floor(Date.now()/1000));let sig=await signature(sub.secret,id,stamp,body);if(sub.previous_secret&&Date.parse(sub.previous_until)>Date.now())sig+=' '+await signature(sub.previous_secret,id,stamp,body);transportLog({...details,stage:'fetch_begin'});
  if(beforeFetch&&!await beforeFetch())throw Error('dedao_source_no_longer_writable');
  const response=await fetch(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','webhook-id':id,'webhook-timestamp':stamp,'webhook-signature':sig,'X-MCP-Subscription-Id':sub.id},body});
  transportLog({...details,stage:'callback_response',callback_status:response.status,callback_accepted:response.ok,delivery_semantics:'callback_acceptance_only',duration_ms:Date.now()-started});return response;
 }catch(error:unknown){const kind=error instanceof Error&&['TimeoutError','AbortError','TypeError','SyntaxError','Error'].includes(error.name)?error.name:'OtherError';transportLog({...details,stage:'transport_failed',error_type:kind,duration_ms:Date.now()-started});throw error;}
}
function args(p:any){if(!['test.created','article.submitted','topic.research_requested','editorial.requested','hot_article.research_requested','local_word.requested','dedao.writing_requested','dedao.cloud_requested'].includes(p?.name)||!p.arguments||typeof p.arguments!=='object'||Array.isArray(p.arguments)||Object.keys(p.arguments).length||p.delivery?.mode!=='webhook')throw Error('invalid_arguments');return callbackURL(p.delivery.url);}
export async function subscribe(owner:string,p:any){const callback=args(p);keyBytes(p.delivery.secret);const ttl=p.ttlMs==null?86400000:p.ttlMs;if(typeof ttl!=='number'||!Number.isSafeInteger(ttl)||ttl<=0)throw Error('invalid_ttl');const expires=new Date(Date.now()+Math.min(ttl,86400000)).toISOString();const id=await subID(owner,callback,p.name),generation=crypto.randomUUID();const prior:any=await db().prepare('SELECT secret FROM event_subscriptions WHERE id=? AND owner=?').bind(id,owner).first();await db().prepare('INSERT INTO event_subscriptions(id,owner,callback,expires,active,generation,event_name) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET active=excluded.active,generation=excluded.generation,expires=excluded.expires').bind(id,owner,callback,expires,'pending',generation,p.name).run();const challenge=crypto.randomUUID()+crypto.randomUUID();try{const response=await send({id,callback,secret:p.delivery.secret},'verify_'+crypto.randomUUID(),JSON.stringify({type:'verification',challenge}));if(!response.ok){console.info(JSON.stringify({component:'event-verification',reason:'callback_http_status',status:response.status}));await response.body?.cancel();throw Error('challenge_failed');}console.info(JSON.stringify({component:'event-verification',stage:'read_begin',status:response.status}));const raw=await boundedText(response,4096);console.info(JSON.stringify({component:'event-verification',stage:'parse_begin',responseBytes:raw.length}));const reply=JSON.parse(raw);if(typeof reply.challenge!=='string'||!equal(reply.challenge,challenge))throw Error('challenge_failed');console.info(JSON.stringify({component:'event-verification',stage:'persist_begin'}));const changed=await db().prepare('UPDATE event_subscriptions SET secret=?,previous_secret=?,previous_until=?,active=? WHERE id=? AND owner=? AND generation=? AND active=? AND expires>?').bind(p.delivery.secret,prior?.secret||null,prior?.secret?new Date(Date.now()+60000).toISOString():null,'active',id,owner,generation,'pending',new Date().toISOString()).run();if(!changed.meta.changes)throw Error('subscription_changed');return {id,refreshBefore:expires,cursor:null,truncated:false};}catch(error:any){const diagnosticText=String(error?.message||'').toLowerCase();const errorHints=['cache','redirect','signal','timeout','not a function','illegal invocation','network','fetch failed','certificate','dns','header','unsupported','undefined','url','connection','blocked','denied'].filter(x=>diagnosticText.includes(x));const category=['invalid_callback','invalid_secret','invalid_arguments','invalid_ttl','challenge_failed','subscription_changed','response_too_large'].includes(error?.message)?error.message:(error?.name==='TimeoutError'?'timeout':'verification_io_error');console.info(JSON.stringify({component:'event-verification',reason:category,errorHints,errorType:['Error','TypeError','SyntaxError','DOMException','TimeoutError','AbortError'].includes(error?.name)?error.name:'OtherError'}));await db().prepare('UPDATE event_subscriptions SET active=? WHERE id=? AND owner=? AND generation=?').bind('verification_failed',id,owner,generation).run();throw Error('callback_verification_failed');}}
export async function unsubscribe(owner:string,p:any){const callback=args(p),id=await subID(owner,callback,p.name);await db().prepare('UPDATE event_subscriptions SET active=?,secret=NULL,previous_secret=NULL,previous_until=NULL,generation=? WHERE id=? AND owner=?').bind('inactive',crypto.randomUUID(),id,owner).run();return {};}
export async function readiness(owner:string,name='test.created'){const row:any=await db().prepare('SELECT count(*) AS n FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),name).first();return {connected:row.n>0,stage:row.n>0?'subscription_verified':'awaiting_subscription'};}
export async function dispatch(owner:string,testID:string,created:string,name='test.created',notificationID?:string){
 const all=await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),name).all();
 if(!all.results.length)return '仅保存，尚未建立订阅';let sent=0;
 for(const s of all.results as any[]){
  for(let attempt=0;attempt<3;attempt++){
   const latest:any=await db().prepare('SELECT active,generation,expires FROM event_subscriptions WHERE id=? AND owner=?').bind(s.id,owner).first();
   if(latest?.active!=='active'||latest.generation!==s.generation||Date.parse(latest.expires)<=Date.now())break;
   let retry=false;
   try{const eventId=notificationID||'evt_'+testID;const res=await send(s,eventId,JSON.stringify({eventId,name,timestamp:created,data:name==='test.created'?{test_id:testID}:{article_id:testID},cursor:null}),attempt+1);
    if(res.ok){sent++;await res.body?.cancel();break;}
    retry=res.status===425||res.status===429||res.status>=500;await res.body?.cancel();
   }catch{retry=true;}
   if(!retry||attempt===2)break;
   await new Promise(resolve=>setTimeout(resolve,250*2**attempt));
  }
 }
 return sent?'事件已送达，等待小鱼回应':'事件发送未确认，请勿重复点击';
}

// Separate topic event transport: article payloads and existing subscriptions remain unchanged.
export async function dispatchTopicResearch(owner:string,researchID:string,created:string) {
 const all=await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),'topic.research_requested').all();
 let accepted=false;
 for(const subscription of all.results as Array<{id:string;callback:string;secret:string;generation:string}>) {
  const current=await db().prepare('SELECT active,generation,expires FROM event_subscriptions WHERE id=? AND owner=?').bind(subscription.id,owner).first<{active:string;generation:string;expires:string}>();
  if(current?.active!=='active'||current.generation!==subscription.generation||Date.parse(current.expires)<=Date.now()) continue;
  const eventId='topic_evt_'+researchID;
  try { const response=await send(subscription,eventId,JSON.stringify({eventId,name:'topic.research_requested',timestamp:created,data:{research_id:researchID},cursor:null})); accepted=response.ok||accepted;await response.body?.cancel(); } catch { /* dedicated outbox retains pending delivery */ }
 }
 return accepted;
}

// Independent editorial wake transport. It never changes article/topic subscriptions.
export async function dispatchEditorialRequest(owner:string,requestID:string,created:string){
 const all=await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),'editorial.requested').all();let accepted=false;
 for(const subscription of all.results as Array<{id:string;callback:string;secret:string;generation:string}>){const current=await db().prepare('SELECT active,generation,expires FROM event_subscriptions WHERE id=? AND owner=?').bind(subscription.id,owner).first<{active:string;generation:string;expires:string}>();if(current?.active!=='active'||current.generation!==subscription.generation||Date.parse(current.expires)<=Date.now())continue;
  const eventId='editorial_evt_'+requestID;try{const response=await send(subscription,eventId,JSON.stringify({eventId,name:'editorial.requested',timestamp:created,data:{request_id:requestID},cursor:null}));accepted=response.ok||accepted;await response.body?.cancel();}catch{/* bounded same-ID outbox recovery, no paid model */}
 }return accepted;
}

// New module wake-up only. Existing subscriptions are never reinterpreted.
export async function dispatchHotArticleResearch(owner:string,batchID:string,created:string) {
 const all=await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),'hot_article.research_requested').all();
 let accepted=false;
 for(const subscription of all.results as Array<{id:string;callback:string;secret:string;generation:string}>) {
  const current=await db().prepare('SELECT active,generation,expires FROM event_subscriptions WHERE id=? AND owner=?').bind(subscription.id,owner).first<{active:string;generation:string;expires:string}>();
  if(current?.active!=='active'||current.generation!==subscription.generation||Date.parse(current.expires)<=Date.now())continue;
  const eventId='hot_evt_'+batchID;
  try{const response=await send(subscription,eventId,JSON.stringify({eventId,name:'hot_article.research_requested',timestamp:created,data:{batch_id:batchID},cursor:null}));accepted=response.ok||accepted;await response.body?.cancel();}catch{/* outbox records unknown, never automatic duplicate */}
 }
 return accepted;
}

// A separate desktop Word-only event never enters article.submitted or its payload.
export async function dispatchLocalWord(owner:string,jobID:string,created:string){
 const all=await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),'local_word.requested').all();let accepted=false;
 for(const subscription of all.results as Array<{id:string;callback:string;secret:string;generation:string}>){const current=await db().prepare('SELECT active,generation,expires FROM event_subscriptions WHERE id=? AND owner=?').bind(subscription.id,owner).first<{active:string;generation:string;expires:string}>();if(current?.active!=='active'||current.generation!==subscription.generation||Date.parse(current.expires)<=Date.now())continue;
  try{const response=await send(subscription,'local_word_evt_'+jobID,JSON.stringify({eventId:'local_word_evt_'+jobID,name:'local_word.requested',timestamp:created,data:{job_id:jobID},cursor:null}));accepted=response.ok||accepted;await response.body?.cancel();}catch{/* Exact immutable job remains available; callback acceptance never proves execution. */}
 }return accepted;
}

// Dedicated event wake for the persisted batch and exact queue generation.
export async function dispatchDedao(owner:string,batchID:string,created:string,queueRevision?:string){
 const maySend=async()=>!!await db().prepare(`SELECT 1 FROM dedao_batches b WHERE b.owner=? AND b.id=? AND b.state='queued' AND (? IS NULL OR b.queue_revision=?)
  AND EXISTS(SELECT 1 FROM dedao_items i WHERE i.owner=b.owner AND i.batch_id=b.id AND i.ordinal=b.current_ordinal
   AND NOT EXISTS(SELECT 1 FROM article_content_fences f WHERE f.owner=i.owner AND (f.entity_kind='dedao_items.batch_ordinal' AND f.entity_key=json_array(i.batch_id,i.ordinal) OR f.entity_kind='dedao_items' AND f.entity_key=i.id OR f.entity_kind='articles' AND f.entity_key=i.article_id))
   AND NOT EXISTS(SELECT 1 FROM article_deletions d WHERE d.owner=i.owner AND d.id=i.article_id)
   AND NOT EXISTS(SELECT 1 FROM articles a WHERE a.owner=i.owner AND a.id=i.article_id AND a.state='deleting'))`).bind(owner,batchID,queueRevision??null,queueRevision??null).first();
 const subscriptions=(await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),'dedao.writing_requested').all()).results as Array<{id:string;callback:string;secret:string;generation:string}>;
 let accepted=false;
 for(const subscription of subscriptions){
  const live=await db().prepare('SELECT generation,active,expires FROM event_subscriptions WHERE owner=? AND id=?').bind(owner,subscription.id).first<{generation:string;active:string;expires:string}>();
  if(live?.generation!==subscription.generation||live.active!=='active'||live.expires<=new Date().toISOString())continue;
  const eventId='dedao_evt_'+batchID+(queueRevision?'_'+queueRevision:'');
  try{const response=await send(subscription,eventId,JSON.stringify({eventId,name:'dedao.writing_requested',timestamp:created,data:{batch_id:batchID,...(queueRevision?{queue_revision:queueRevision}:{})},cursor:null}),1,maySend);accepted=response.ok||accepted;await response.body?.cancel();}catch{/* A fence prevents an unsent wake. Already-sent outcomes remain unknown; callback acceptance never proves execution. */}
 }
 return accepted;
}

// Independent cloud request. No legacy desktop/native dispatch or other subscription changes.
export async function dispatchCloudDedao(owner:string,taskId:string,created:string){
 const rows=await db().prepare('SELECT * FROM event_subscriptions WHERE owner=? AND active=? AND expires>? AND event_name=?').bind(owner,'active',new Date().toISOString(),'dedao.cloud_requested').all();let accepted=false;
 for(const subscription of rows.results as Array<{id:string;callback:string;secret:string;generation:string}>){
  const live=await db().prepare('SELECT active,generation,expires FROM event_subscriptions WHERE owner=? AND id=?').bind(owner,subscription.id).first<{active:string;generation:string;expires:string}>();
  if(live?.active!=='active'||live.generation!==subscription.generation||Date.parse(live.expires)<=Date.now())continue;
  try{const response=await send(subscription,'dedao_evt_'+taskId,JSON.stringify({eventId:'dedao_evt_'+taskId,name:'dedao.cloud_requested',timestamp:created,data:{task_id:taskId},cursor:null}));accepted=response.ok||accepted;await response.body?.cancel();}catch{/* exact persisted task remains unknown, never claim dispatched success */}
 }return accepted;
}
