import {db} from './test-store';
import {hashText} from './writing-input';
import {researchCredentialHit,createResearchCredentialInspector} from './topic-research-security';
import {createPreparedArticleCredentialInspector} from './claude';
import {editorialCredentialVariants,editorialCredentialInspection} from './editorial-credential-text';
import {credentialSourceChanged} from './credential-source-change';
// New editorial boundary only. Existing legacy/provider behavior remains unchanged.
type EditorialCredentialSources={claimHashes:()=>Promise<string[]>;stageTokens:()=>Promise<string[]>;research:(value:unknown,known:string[])=>Promise<boolean>|boolean};
async function inspectEditorialCredentialSources(value:unknown,extra:string[],sources:EditorialCredentialSources):Promise<boolean>{
 let variants:unknown[];try{variants=editorialCredentialVariants(value);}catch{return true;}
 const ids=new Set<string>();for(const variant of variants){const raw=typeof variant==='string'?variant:JSON.stringify(variant)||'';for(const match of raw.matchAll(/(?=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))/gi))ids.add(match[1].toLowerCase());}if(ids.size>1000)return true;
 const hashes=await sources.claimHashes();for(const id of ids)if(hashes.includes(await hashText(id)))return true;
 const stageTokens=await sources.stageTokens();
 const known=[...extra,...stageTokens];if(editorialCredentialInspection(value,known))return true;
 // Bounded overlapping inspection avoids introducing the topic helper's 600k
 // aggregate limit as a new SSE response/token cap. It keeps its percent/key rules.
 for(const variant of variants){if(typeof variant!=='string')continue;for(let at=0;at<variant.length;at+=60000)if(await sources.research(variant.slice(at,at+64096),known))return true;}return false;
}
export async function editorialCredentialHit(owner:string,value:unknown,extra:string[]=[]):Promise<boolean>{
 return inspectEditorialCredentialSources(value,extra,{
  claimHashes:async()=>(await db().prepare('SELECT claim_hash FROM editorial_requests WHERE owner=? AND claim_hash IS NOT NULL UNION SELECT old_token_sha256 AS claim_hash FROM editorial_agent_claim_recoveries_v3 WHERE owner=? UNION SELECT new_token_sha256 AS claim_hash FROM editorial_agent_claim_recoveries_v3 WHERE owner=? UNION SELECT claim_hash FROM hot_article_batches WHERE owner=? AND claim_hash IS NOT NULL').bind(owner,owner,owner,owner).all<{claim_hash:string}>()).results.map(row=>row.claim_hash),
  stageTokens:async()=>(await db().prepare('SELECT token FROM editorial_stages WHERE owner=? UNION SELECT token FROM editorial_stages_v3 WHERE owner=? UNION SELECT lease_token AS token FROM hot_article_outbox WHERE owner=? AND lease_token IS NOT NULL').bind(owner,owner,owner).all<{token:string}>()).results.map(row=>row.token),
  research:(variant,known)=>researchCredentialHit(owner,variant,known)
 });
}
export type EditorialCredentialScanContext={inspect:(value:unknown,extra?:string[])=>Promise<boolean>;assertFresh:()=>Promise<void>};
async function gatherEditorialCredentialPools(owner:string){
 const [claims,legacy,v3,research]=await Promise.all([
  db().prepare('SELECT claim_hash FROM editorial_requests WHERE owner=? AND claim_hash IS NOT NULL UNION SELECT old_token_sha256 AS claim_hash FROM editorial_agent_claim_recoveries_v3 WHERE owner=? UNION SELECT new_token_sha256 AS claim_hash FROM editorial_agent_claim_recoveries_v3 WHERE owner=? UNION SELECT claim_hash FROM hot_article_batches WHERE owner=? AND claim_hash IS NOT NULL').bind(owner,owner,owner,owner).all<{claim_hash:string}>(),
  db().prepare('SELECT token FROM editorial_stages WHERE owner=?').bind(owner).all<{token:string}>(),
  db().prepare('SELECT token FROM editorial_stages_v3 WHERE owner=?').bind(owner).all<{token:string}>(),
  db().prepare('SELECT lease_token AS token FROM topic_research_outbox WHERE owner=? AND lease_token IS NOT NULL UNION SELECT lease_token AS token FROM hot_article_outbox WHERE owner=? AND lease_token IS NOT NULL').bind(owner,owner).all<{token:string}>()
 ]);
 return {claimHashes:claims.results.map(row=>row.claim_hash),legacyTokens:legacy.results.map(row=>row.token),v3Tokens:v3.results.map(row=>row.token),researchLeases:research.results.map(row=>row.token)};
}
async function credentialPoolsFingerprint(pools:Awaited<ReturnType<typeof gatherEditorialCredentialPools>>){
 return hashText(JSON.stringify(Object.fromEntries(Object.entries(pools).map(([kind,values])=>[kind,[...new Set(values)].sort()]))));
}
// Memoize only lossless JSON inputs. Accessors, toJSON, cycles, undefined,
// non-finite numbers and special objects retain the original inspection path.
function exactInspectionMemo(value:unknown,extra:string[]):{key:string;value:unknown}|null{
 let nodes=0;
 const lossless=(input:unknown,depth:number):boolean=>{
  if(++nodes>20000||depth>32)return false;
  if(input===null||typeof input==='string'||typeof input==='boolean')return true;
  if(typeof input==='number')return Number.isFinite(input);
  if(!input||typeof input!=='object')return false;
  const prototype=Object.getPrototypeOf(input);
  if(!Array.isArray(input)&&prototype!==null&&Object.getPrototypeOf(prototype)!==null)return false;
  const descriptors=Object.getOwnPropertyDescriptors(input);
  if('toJSON' in input)return false;
  if(Array.isArray(input)){const names=Object.keys(input);if(names.length!==input.length||names.some((name,index)=>name!==String(index)))return false;}
  return Object.entries(descriptors).every(([name,descriptor])=>!descriptor.enumerable||(Array.isArray(input)&&!/^\d+$/.test(name)?false:'value' in descriptor&&lossless(descriptor.value,depth+1)));
 };
 try{
  if(!extra.every(token=>typeof token==='string')||!lossless(value,0)||!lossless(extra,0))return null;
  const serialized=JSON.stringify(value),key=JSON.stringify([typeof value,serialized,extra]);
  return key.length<=2000000?{key,value:JSON.parse(serialized)}:null;
 }catch{return null;}
}
// Create once per load; inspect is DB-free and carries no authorizations.
// assertFresh must succeed before returning the load, and permanently seals it.
export async function createEditorialCredentialScanContext(owner:string):Promise<EditorialCredentialScanContext>{
 const [pools,prepared]=await Promise.all([gatherEditorialCredentialPools(owner),createPreparedArticleCredentialInspector(owner)]);
 const fingerprint=await credentialPoolsFingerprint(pools),research=createResearchCredentialInspector(pools.researchLeases,prepared.inspect);
 const sources:EditorialCredentialSources={claimHashes:async()=>pools.claimHashes,stageTokens:async()=>[...pools.v3Tokens,...pools.legacyTokens],research};
 const memo=new Map<string,Promise<boolean>>();let memoCharacters=0,sealed=false;
 return Object.freeze({
  inspect:async(value:unknown,extra:string[]=[])=>{
   if(sealed)return true;
   const capturedExtra=[...extra],exact=exactInspectionMemo(value,capturedExtra);
   let inspection=exact?memo.get(exact.key):undefined;
   if(!inspection){
    inspection=inspectEditorialCredentialSources(exact?exact.value:value,capturedExtra,sources);
    if(exact){
     while(memo.size&&(memo.size>=128||memoCharacters+exact.key.length>2000000)){const oldest=memo.keys().next().value!;memoCharacters-=oldest.length;memo.delete(oldest);}
     memo.set(exact.key,inspection);memoCharacters+=exact.key.length;
    }
   }
   const hit=await inspection;return sealed||hit;
  },
  assertFresh:async()=>{
   if(sealed)throw Error('credential_source_changed');sealed=true;memo.clear();memoCharacters=0;
   const [fresh,preparedFresh]=await Promise.allSettled([gatherEditorialCredentialPools(owner),prepared.assertFresh()]);
   if(fresh.status==='rejected')throw fresh.reason;
   const freshFingerprint=await credentialPoolsFingerprint(fresh.value);
   if(preparedFresh.status==='rejected')throw preparedFresh.reason;
   if(freshFingerprint!==fingerprint)throw credentialSourceChanged();
  }
 });
}
