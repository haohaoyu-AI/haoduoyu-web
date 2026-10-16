/** Owner-private derived DOM for debugging only. Never original HTML or metric proof. */
import {parse} from 'parse5';
import type {DefaultTreeAdapterMap} from 'parse5';
import {db,diagnosticBucket} from './test-store';
import {publicAccountURL} from './hot-article-discovery';
import {publicArticleURL} from './hot-article-public';
import type {BenchmarkAccount} from './hot-article-discovery';
export type ResponseDiagnosticSummary={state:'stored'|'unavailable';derived:true;can_verify_metrics:false;expires_at?:string;truncated?:boolean;reason?:'restricted_response'};
export type DiagnosticBudget={signal:AbortSignal;deadline:number};
export function checkDiagnosticBudget(budget?:DiagnosticBudget){if(budget&&(budget.signal.aborted||Date.now()>=budget.deadline))throw Error('diagnostic_budget_expired');}
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const ttl=86400000,domLimit=60*1024,recordLimit=64*1024;
const bytes=(s:string)=>new TextEncoder().encode(s).length;
const cost=(s:string)=>bytes(JSON.stringify(s))-2;
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const prefix=async(owner:string)=>`hot-benchmark-response-v1/${await hash(owner)}/`;
const key=async(owner:string,scan:string,account:string)=>(await prefix(owner))+`${scan}/${account}.json`;
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sensitive=/token|secret|csrf|session|cookie|credential|nonce|password|(?:^|[-_:])(?:auth|authorization)(?:$|[-_:])/i;
function safeText(s:string){return s.replace(/https?:\/\/[^\s<>"']+/gi,'[URL omitted]').replace(/(?:bearer\s+|(?:[a-z_-]*token|secret|csrf|password|session|cookie|authorization|credential|nonce)\s*[:=]\s*)[^\s<>]+/gi,'[sensitive text omitted]').replace(/[A-Za-z0-9_-]{24,}/g,'[opaque text omitted]');}
const assignment=/(?:bearer\s+|["']?(?:[a-z_-]*token|secret|csrf|password|session|cookie|authorization|credential|nonce)["']?\s*[:=]\s*["']?)[^\s<>"',;}]+/i;
type N=DefaultTreeAdapterMap['node'];
const drop=new Set(['script','style','template','form','input','textarea','button','select','option','iframe','object','embed','svg','math','meta','link','img','canvas','xmp','plaintext']);
const allowed=new Set(['html','head','body','title','main','article','section','header','footer','nav','aside','div','span','p','ul','ol','li','a','time','h1','h2','h3','h4','h5','h6','strong','b','em','small','figure','figcaption','details','summary','dialog','noscript','br']);
export async function deriveResponse(html:string,budget?:DiagnosticBudget){
 checkDiagnosticBudget(budget);
 const root=parse(html,{scriptingEnabled:true});
 // Plan redaction across adjacent text nodes. A complete credential assignment
 // drops its smallest containing subtree, including split keys/quoted values.
 const redacted=new Set<N>();let planned=0;
 function plan(n:N,depth=0):string{
  if(++planned>60000||depth>150)throw Error('diagnostic_dom_limit');checkDiagnosticBudget(budget);
  if('value'in n)return n.value.slice(0,domLimit);
  if('tagName'in n){const attrs=Object.fromEntries(n.attrs.map(a=>[a.name,a.value]));
   if(drop.has(n.tagName)||'hidden'in attrs||attrs['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style??'')||Object.keys(attrs).some(a=>sensitive.test(a))||['id','class','name','itemprop','aria-label'].some(a=>sensitive.test(attrs[a]??''))){redacted.add(n);return '';}
  }
  let joined='';if('childNodes'in n)for(const child of n.childNodes)joined=(joined+plan(child,depth+1)).slice(0,domLimit);
  if('tagName'in n&&assignment.test(joined)){redacted.add(n);return '';}return joined;
 }
 plan(root);
 const counts={main:0,article:0,li:0,script:0,time:0,explicit_author:0,article_links:0,profile_links:0,non_inert_text_chars:0};
 let nodes=0,output='',used=0,reserved=0,truncated=false,js_hint=false;
 function emit(s:string){output+=s;used+=cost(s);}
 function walk(n:N,depth=0){
  if(++nodes>60000||depth>150)throw Error('diagnostic_dom_limit');checkDiagnosticBudget(budget);
  if('value'in n){const clean=safeText(n.value);counts.non_inert_text_chars+=clean.trim().length;js_hint ||= /JavaScript required|需要允许本站执行\s*JavaScript|请启用\s*JavaScript/i.test(clean);
   if(!truncated){const text=escape(clean),budget=domLimit-used-reserved;if(cost(text)<=budget)emit(text);else{const encoded=new TextEncoder().encode(text);let low=0,high=Math.min(encoded.length,Math.max(0,budget));while(low<high){const mid=Math.ceil((low+high)/2),part=new TextDecoder().decode(encoded.slice(0,mid),{stream:true});if(cost(part)<=budget)low=mid;else high=mid-1;}emit(new TextDecoder().decode(encoded.slice(0,low),{stream:true}));truncated=true;}}return;}
  const element='tagName'in n?n:null,tag=element?.tagName,attrs=Object.fromEntries(element?.attrs.map(a=>[a.name,a.value])??[]);
  if(tag==='script')counts.script++;
  if(tag&&tag in counts&&['main','article','li','time'].includes(tag))counts[tag as 'main'|'article'|'li'|'time']++;
  if(redacted.has(n))return;
  if(tag&&drop.has(tag))return;
  // parse5 treats scripting-enabled noscript as raw text. Do not retain markup
  // containing form fields as escaped text; plain JS fallback notices survive.
  if(tag==='noscript'&&'childNodes'in n&&n.childNodes.some(c=>'value'in c&&c.value.includes('<')))return;
  if('hidden'in attrs||attrs['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style??'')||(tag==='dialog'&&!('open'in attrs)))return;
  if(Object.keys(attrs).some(a=>sensitive.test(a))||Object.entries(attrs).some(([a,v])=>a==='id'&&sensitive.test(v)))return;
  if(tag==='a'){if(publicArticleURL(attrs.href??''))counts.article_links++;if(publicAccountURL(attrs.href??''))counts.profile_links++;}
  if(/(?:^|\s)author(?:\s|$)/.test(attrs.itemprop??'')||(tag==='a'&&/(?:^|\s)author(?:\s|$)/.test(attrs.rel??'')))counts.explicit_author++;
  const safe:Record<string,string>={};
  if(attrs.class)safe.class=attrs.class.split(/\s+/).filter(c=>/^[a-z][a-z0-9_-]{0,40}$/i.test(c)&&!sensitive.test(c)).slice(0,12).join(' ');
  if(tag==='a'){const url=publicArticleURL(attrs.href??'')??publicAccountURL(attrs.href??'');if(url)safe.href=url;}
  for(const a of ['rel','itemprop'])if(attrs[a])safe[a]=attrs[a].split(/\s+/).filter(v=>/^[a-z][a-z0-9_-]{0,30}$/i.test(v)&&!sensitive.test(v)).slice(0,8).join(' ');
  if(tag==='time'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(attrs.datetime??''))safe.datetime=attrs.datetime;
  if(['details','dialog'].includes(tag??'')&&'open'in attrs)safe.open='';
  const keep=!!tag&&allowed.has(tag),close=keep&&tag!=='br'?`</${tag}>`:'',open=keep?`<${tag}${Object.entries(safe).filter(([,v])=>v||'open'in safe).map(([a,v])=>` ${a}="${escape(v)}"`).join('')}>`:'';
  const opened=keep&&!truncated&&used+reserved+cost(open)+cost(close)<=domLimit;
  if(keep&&!truncated&&!opened)truncated=true;
  if(opened){emit(open);reserved+=cost(close);}
  if('childNodes'in n){const firstSummary=n.childNodes.find(c=>'tagName'in c&&c.tagName==='summary');for(const child of n.childNodes){if(tag==='details'&&!('open'in attrs)&&child!==firstSummary)continue;walk(child,depth+1);}}
  if(opened){reserved-=cost(close);emit(close);}
 }
 walk(root);
 return {derived:true as const,can_verify_metrics:false as const,sanitization:'allowlist-dom-v1',dom:output,truncated,dom_bytes:bytes(output),source_bytes:bytes(html),source_sha256:await hash(html),counts,js_hint,visibility:'static non-inert estimate; external CSS and browser rendering not evaluated'};
}
type Scan={id:string;created:string;accounts_json:string;result_json:string|null};
async function recent(owner:string):Promise<Scan[]>{return (await db().prepare('SELECT id,created,accounts_json,result_json FROM hot_benchmark_scans WHERE owner=? ORDER BY rowid DESC LIMIT 2').bind(owner).all()).results as Scan[];}
export class DiagnosticReadError extends Error{constructor(public readonly status:400|404|410){super(status===400?'诊断标识无效':status===404?'诊断记录不存在':'诊断记录已过期或超出最近两次扫描范围');}}
async function scope(owner:string,scan:string,account:string){
 if(!uuid.test(scan)||!uuid.test(account))throw new DiagnosticReadError(400);
 const row=await db().prepare('SELECT id,created,accounts_json,result_json FROM hot_benchmark_scans WHERE owner=? AND id=?').bind(owner,scan).first<Scan>();if(!row)throw new DiagnosticReadError(404);
 const latest=await recent(owner);
 if(!Number.isFinite(Date.parse(row.created))||Date.now()>=Date.parse(row.created)+ttl||!latest.some(r=>r.id===scan))throw new DiagnosticReadError(410);
 const source=(JSON.parse(row.accounts_json) as BenchmarkAccount[]).find(a=>a.id===account);if(!source)throw new DiagnosticReadError(404);return {row,source};
}
/** One bounded pass, only this owner's exact diagnostic namespace. Never articles/. */
export async function cleanupResponseDiagnostics(owner:string,budget?:DiagnosticBudget){
 checkDiagnosticBudget(budget);const base=await prefix(owner);checkDiagnosticBudget(budget);
 // R2 supports include; the pinned Workers type omits this documented option.
 const options={prefix:base,limit:1000,include:['customMetadata']};
 const listing=await diagnosticBucket().list(options);checkDiagnosticBudget(budget);
 const keep=new Set((await recent(owner)).map(r=>r.id));checkDiagnosticBudget(budget);const remove:string[]=[];
 for(const item of listing.objects){const suffix=item.key.slice(base.length),parts=suffix.split('/');if(!item.key.startsWith(base)||parts.length!==2||!uuid.test(parts[0])||!uuid.test(parts[1].replace(/\.json$/,''))||!parts[1].endsWith('.json')||item.customMetadata?.diagnostic_version!=='response-diagnostic-1')continue;
  const expiry=Date.parse(item.customMetadata.expires_at??'');if(!keep.has(parts[0])||Number.isFinite(expiry)&&Date.now()>=expiry)remove.push(item.key);
 }
 checkDiagnosticBudget(budget);if(remove.length)await diagnosticBucket().delete(remove);checkDiagnosticBudget(budget);
 if(listing.truncated)throw Error('diagnostic_cleanup_pending');
}
export async function captureResponseDiagnostic(owner:string,scan:string,account:BenchmarkAccount,html:string,status:number,stamp:string,budget?:DiagnosticBudget):Promise<ResponseDiagnosticSummary>{
 try{
  checkDiagnosticBudget(budget);
  const {row,source}=await scope(owner,scan,account.id);if(source.url!==account.url||publicAccountURL(source.url)!==source.url||row.created!==stamp)throw Error('diagnostic_scope');
  checkDiagnosticBudget(budget);
  // Conservative storage-only gate; never retain login/challenge private fields.
  if(status<200||status>=300||/captcha|verify-center|安全验证|访问频繁|请完成验证|验证码|(?:请|需要|须)登录|登录后(?:阅读|查看)|<title[^>]*>[^<]*(?:登录|login)/i.test(html))return {state:'unavailable',derived:true,can_verify_metrics:false,reason:'restricted_response'};
  const sample=await deriveResponse(html,budget),expires_at=new Date(Date.parse(stamp)+ttl).toISOString();checkDiagnosticBudget(budget);
  const record={version:'response-diagnostic-1',scan_id:scan,account_id:account.id,source_url:source.url,scan_created_at:stamp,captured_at:new Date().toISOString(),expires_at,http_status:status,requires_completed_summary:!!budget,...sample};const body=JSON.stringify(record);if(bytes(body)>recordLimit)throw Error('diagnostic_record_limit');
  const objectKey=await key(owner,scan,account.id);checkDiagnosticBudget(budget);await diagnosticBucket().put(objectKey,body,{customMetadata:{diagnostic_version:'response-diagnostic-1',expires_at}});
  try{checkDiagnosticBudget(budget);await scope(owner,scan,account.id);checkDiagnosticBudget(budget);}catch{await diagnosticBucket().delete(objectKey);throw Error('diagnostic_scope_changed');}
  return {state:'stored',derived:true,can_verify_metrics:false,expires_at,truncated:sample.truncated};
 }catch{return {state:'unavailable',derived:true,can_verify_metrics:false};}
}
export async function readResponseDiagnostic(owner:string,scan:string,account:string){
 const {source}=await scope(owner,scan,account);const object=await diagnosticBucket().get(await key(owner,scan,account));if(!object)throw new DiagnosticReadError(404);if(object.size>recordLimit)throw Error('diagnostic_record_limit');
 const record=await object.json<Record<string,unknown>>();
 if(record.version!=='response-diagnostic-1'||record.scan_id!==scan||record.account_id!==account||record.source_url!==source.url||record.derived!==true||record.can_verify_metrics!==false||typeof record.dom!=='string'||bytes(record.dom)>domLimit||typeof record.expires_at!=='string')throw Error('diagnostic_record_invalid');
 if(!Number.isFinite(Date.parse(record.expires_at))||Date.now()>=Date.parse(record.expires_at))throw new DiagnosticReadError(410);
 const {row}=await scope(owner,scan,account);if(record.scan_created_at!==row.created||Date.parse(record.expires_at)!==Date.parse(row.created)+ttl)throw Error('diagnostic_record_invalid');
 if(record.requires_completed_summary===true){const result=row.result_json?JSON.parse(row.result_json):null;if(!result?.observations?.some((o:{account_id:string;page_sha256:string;response_diagnostic?:ResponseDiagnosticSummary})=>o.account_id===account&&o.page_sha256===record.source_sha256&&o.response_diagnostic?.state==='stored'))throw new DiagnosticReadError(404);}
 // Return only fields produced here, never arbitrary properties in an object.
 const fields=['version','scan_id','account_id','source_url','scan_created_at','captured_at','expires_at','http_status','derived','can_verify_metrics','sanitization','dom','truncated','dom_bytes','source_bytes','source_sha256','js_hint','visibility'];
 const countKeys=['main','article','li','script','time','explicit_author','article_links','profile_links','non_inert_text_chars'];
 const counts=record.counts as Record<string,unknown>|undefined;
 if(record.sanitization!=='allowlist-dom-v1'||typeof record.truncated!=='boolean'||record.dom_bytes!==bytes(record.dom)||typeof record.source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(record.source_sha256)||!counts||countKeys.some(k=>!Number.isSafeInteger(counts[k])||Number(counts[k])<0))throw Error('diagnostic_record_invalid');
 return {...Object.fromEntries(fields.map(k=>[k,record[k]])),counts:Object.fromEntries(countKeys.map(k=>[k,counts[k]]))};
}
