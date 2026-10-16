import {db} from './test-store';
import {decodeCredentialJsonEscape} from './credential-boundary';

// Only selected public metadata/observations belong here. Frozen text, binary
// artifacts and intentionally returned authorization grants are separate paths.
export const WORD_CREDENTIAL_REDACTED='敏感内容已隐藏';
export const WORD_CREDENTIAL_ERROR='Word 信息含敏感凭据或暂不可核对；未保存';
export class WordCredentialError extends Error {constructor(){super(WORD_CREDENTIAL_ERROR);}}

const maxCandidates=512,batchSize=30,timeoutMs=1000,maxInFlight=2,maxQueued=32;
const maxNodes=20000,maxDepth=32,maxString=65536,maxCharacters=4000000;
const uuidInText=/(?=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))/gi;
const hexDigest=/^[0-9a-f]{64}$/;
type Text={kind:'text';original:string;candidates:Set<string>;unsafe:boolean};
type Node=Text|{kind:'array';items:Node[]}|{kind:'object';entries:{key:Text;value:Node}[]}|{kind:'value';original:unknown}|{kind:'hidden'};
type Plan={node:Node;candidates:Set<string>;unsafe:boolean;overflow:boolean};
type Lookup={key:string;owner:string;candidates:string[];promise:Promise<Set<string>>;resolve:(value:Set<string>)=>void;reject:(reason:WordCredentialError)=>void;expired:boolean;state:'queued'|'running';timer?:ReturnType<typeof setTimeout>};
let inFlight=0;
const lookups=new Map<string,Lookup>(),queue:Lookup[]=[];

function decodeLayer(text:string){
 const unescaped=text.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/g,decodeCredentialJsonEscape);
 // Decode valid runs independently: an ordinary isolated '%' must not mask a
 // reversible ASCII credential elsewhere in the same field.
 return unescaped.replace(/(?:%[0-9a-fA-F]{2})+/g,part=>{try{return decodeURIComponent(part);}catch{return part.replace(/%([0-9a-fA-F]{2})/g,(_all,hex:string)=>String.fromCharCode(parseInt(hex,16)));}});
}
function knownStrings(tokens:unknown[]){
 if(!Array.isArray(tokens)||tokens.length>32)throw new WordCredentialError();
 const result:string[]=[];
 for(const token of tokens){if(token===undefined||token===null||token==='')continue;if(typeof token!=='string'||token.length>2048)throw new WordCredentialError();result.push(token.toLowerCase());}
 return result;
}
function plan(value:unknown,knownTokens:unknown[]=[]):Plan{
 const known=knownStrings(knownTokens),candidates=new Set<string>(),active=new Set<object>();
 let nodes=0,characters=0,unsafe=false,overflow=false;
 function text(original:string):Text{
  const item:Text={kind:'text',original,candidates:new Set(),unsafe:false};
  if(original.length>maxString){item.unsafe=unsafe=true;return item;}
  let current=original;
  for(let layer=0;layer<=4;layer++){
   characters+=current.length;
   if(characters>maxCharacters||/\\u(?![0-9a-fA-F]{4})/i.test(current)){item.unsafe=unsafe=true;break;}
   const lower=current.toLowerCase();if(known.some(token=>lower.includes(token))){item.unsafe=unsafe=true;break;}
   for(const match of current.matchAll(uuidInText)){
    const candidate=match[1].toLowerCase();item.candidates.add(candidate);candidates.add(candidate);
    if(candidates.size>maxCandidates){overflow=true;item.unsafe=unsafe=true;break;}
   }
   if(overflow)break;
   const next=decodeLayer(current);if(next===current)break;
   if(layer===4){item.unsafe=unsafe=true;break;}
   current=next;
  }
  return item;
 }
 function visit(current:unknown,depth:number):Node{
  if(++nodes>maxNodes||depth>maxDepth){unsafe=true;return {kind:'hidden'};}
  if(typeof current==='string')return text(current);
  if(current===null||typeof current==='number'||typeof current==='boolean'||current===undefined)return {kind:'value',original:current};
  if(current instanceof ArrayBuffer||ArrayBuffer.isView(current))return {kind:'value',original:current};
  if(typeof current!=='object'||active.has(current)){unsafe=true;return {kind:'hidden'};}
  active.add(current);
  try{
   if(Array.isArray(current))return {kind:'array',items:current.map(item=>visit(item,depth+1))};
   if(Object.prototype.toString.call(current)!=='[object Object]'){unsafe=true;return {kind:'hidden'};}
   const descriptors=Object.getOwnPropertyDescriptors(current);
   if(Object.values(descriptors).some(d=>d.get||d.set)){unsafe=true;return {kind:'hidden'};}
   return {kind:'object',entries:Object.entries(descriptors).filter(([,d])=>d.enumerable).map(([key,d])=>({key:text(key),value:visit(d.value,depth+1)}))};
  }finally{active.delete(current);}
 }
 const node=visit(value,0);return {node,candidates,unsafe,overflow};
}
export function wordCredentialKnownHit(value:unknown,knownTokens:unknown[]=[]){try{return plan(value,knownTokens).unsafe;}catch{return true;}}
async function sha(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}

async function lookup(task:Lookup){
 const entries=await Promise.all(task.candidates.map(async candidate=>({candidate,digest:await sha(candidate)}))),hits=new Set<string>();
 for(let at=0;at<entries.length;at+=batchSize){
  if(task.expired)throw new WordCredentialError();const batch=entries.slice(at,at+batchSize);
  // One SELECT and at most 37 binds; all owner history remains eligible.
  const sql=`WITH candidates(digest) AS (VALUES ${batch.map(()=>'(?)').join(',')})
   SELECT c.digest FROM candidates c WHERE
    EXISTS(SELECT 1 FROM word_recovery w WHERE w.owner=? AND (w.token_hash=c.digest OR w.claim_hash=c.digest))
    OR EXISTS(SELECT 1 FROM word_execution_receipts r WHERE r.owner=? AND (r.token_hash=c.digest OR r.from_token_hash=c.digest OR r.claim_hash=c.digest))
    OR EXISTS(SELECT 1 FROM word_execution_queue q WHERE q.owner=? AND (q.token_hash=c.digest OR q.from_token_hash=c.digest OR q.claim_hash=c.digest))
    OR EXISTS(SELECT 1 FROM word_execution_requests h WHERE h.owner=? AND (h.token_hash=c.digest OR h.from_token_hash=c.digest OR h.claim_hash=c.digest))
    OR EXISTS(SELECT 1 FROM local_word_jobs j WHERE j.owner=? AND j.claim_hash=c.digest)
    OR EXISTS(SELECT 1 FROM local_word_queue_claims q WHERE q.owner=? AND q.claim_hash=c.digest)
    OR EXISTS(SELECT 1 FROM article_claim_credential_hashes a WHERE a.owner=? AND a.sha256=c.digest)`;
  const result:{results?:{digest:string}[];success?:boolean}=await db().prepare(sql).bind(...batch.map(item=>item.digest),task.owner,task.owner,task.owner,task.owner,task.owner,task.owner,task.owner).all<{digest:string}>();
  if(task.expired||!result||!Array.isArray(result.results)||result.success===false)throw new WordCredentialError();
  const hashes=new Set(result.results.map(item=>item.digest));if([...hashes].some(item=>typeof item!=='string'||!hexDigest.test(item)))throw new WordCredentialError();
  for(const item of batch)if(hashes.has(item.digest))hits.add(item.candidate);
 }
 return hits;
}
function pump(){
 while(inFlight<maxInFlight&&queue.length){
  const task=queue.shift()!;if(task.expired)continue;
  task.state='running';inFlight++;
  void lookup(task).then(hits=>task.resolve(hits),()=>task.reject(new WordCredentialError())).finally(()=>{
   if(task.timer!==undefined)clearTimeout(task.timer);
   // Deadline rejects the caller; only actual completion releases a D1 slot.
   inFlight--;if(lookups.get(task.key)===task)lookups.delete(task.key);pump();
  });
 }
}
async function matchedCandidates(owner:string,candidates:Set<string>){
 if(!candidates.size)return new Set<string>();
 if(typeof owner!=='string'||!owner||owner.length>512)throw new WordCredentialError();
 const sorted=[...candidates].sort(),key=JSON.stringify([owner,sorted]),existing=lookups.get(key);
 // Share only pending work, never completed positive or negative results.
 if(existing)return existing.promise;
 if(queue.length>=maxQueued)throw new WordCredentialError();
 let resolve!:(value:Set<string>)=>void,reject!:(reason:WordCredentialError)=>void;
 const promise=new Promise<Set<string>>((yes,no)=>{resolve=yes;reject=no;});
 const task:Lookup={key,owner,candidates:sorted,promise,resolve,reject,expired:false,state:'queued'};
 task.timer=setTimeout(()=>{
  task.expired=true;task.reject(new WordCredentialError());
  if(task.state==='queued'){
   const index=queue.indexOf(task);if(index>=0)queue.splice(index,1);
   if(lookups.get(key)===task)lookups.delete(key);
  }
 },timeoutMs);
 lookups.set(key,task);queue.push(task);pump();return promise;
}
export async function hasWordCredential(owner:string,value:unknown,knownTokens:unknown[]=[]):Promise<boolean>{
 try{const prepared=plan(value,knownTokens);if(prepared.unsafe||prepared.overflow)return true;return (await matchedCandidates(owner,prepared.candidates)).size>0;}catch{return true;}
}
export async function assertWordCredentialFree(owner:string,value:unknown,knownTokens:unknown[]=[]):Promise<void>{if(await hasWordCredential(owner,value,knownTokens))throw new WordCredentialError();}

export async function redactWordCredentialText<T>(owner:string,value:T,knownTokens:unknown[]=[]):Promise<T>{
 let prepared:Plan;try{prepared=plan(value,knownTokens);}catch{return WORD_CREDENTIAL_REDACTED as T;}
 let hits=new Set<string>(),unverified=prepared.overflow;
 if(!unverified){try{hits=await matchedCandidates(owner,prepared.candidates);}catch{unverified=true;}}
 function hidden(item:Text){return item.unsafe||unverified&&item.candidates.size>0||[...item.candidates].some(candidate=>hits.has(candidate));}
 function render(node:Node):unknown{
  if(node.kind==='hidden')return WORD_CREDENTIAL_REDACTED;
  if(node.kind==='value')return node.original;
  if(node.kind==='text')return hidden(node)?WORD_CREDENTIAL_REDACTED:node.original;
  if(node.kind==='array')return node.items.map(render);
  const keys=new Set<string>(),entries:[string,unknown][]=[];
  for(const entry of node.entries){let key=hidden(entry.key)?WORD_CREDENTIAL_REDACTED:entry.key.original;while(keys.has(key))key+='_';keys.add(key);entries.push([key,render(entry.value)]);}
  return Object.fromEntries(entries);
 }
 return render(prepared.node) as T;
}
