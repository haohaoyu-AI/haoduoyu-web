import { db } from './test-store';
import { protectPreparedArticleForOwner } from './claude';
import { inspectCredentialValue, type CredentialInspection } from './credential-boundary';

// Check, never rewrite: a credential-contaminated fact or link must not become
// a silently altered research result. Decode bounded URL/JSON layers for inspection only.
function researchCredentialVariants(value:unknown):unknown[]|null {
 const variants:unknown[]=[value];
 let serialized:string;
 try {serialized=JSON.stringify(value);}catch{return null;}
 if(serialized.length>600000)return null;
 let text=serialized;
 for(let layer=0;layer<8;layer++) {
  const decoded=text.replace(/(?:%[0-9a-fA-F]{2})+/g,part=>{
   try{return decodeURIComponent(part);}catch{return part.replace(/%([0-9a-fA-F]{2})/g,(_all,hex:string)=>String.fromCharCode(parseInt(hex,16)));}
  });
  if(decoded===text)break;
  variants.push(decoded);text=decoded;
  if(layer===7)return null;
 }
 // Research claim tokens are two adjacent UUIDs and only their hashes persist.
 // Conservatively reject this high-entropy token shape, including another run's token.
 const doubleUUID=/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i;
 const tokenShapeText=JSON.stringify(variants).replace(/\\+u([0-9a-fA-F]{4})/g,(_match,hex:string)=>String.fromCharCode(parseInt(hex,16)));
 if(doubleUUID.test(tokenShapeText))return null;
 return variants;
}
function researchKnownCredentials(extra:string[],leases:string[]){
 return [...extra,...leases].flatMap(token=>/^[a-f0-9-]{36,}$/.test(token)?[token,token.toUpperCase()]:[token]);
}
// Internal, DB-free scanner. The configured key stays inside inspectPrepared.
export function createResearchCredentialInspector(leases:string[],inspectPrepared:(value:unknown)=>CredentialInspection){
 const capturedLeases=[...leases];
 return (value:unknown,extra:string[]=[]):boolean=>{
  const variants=researchCredentialVariants(value);if(!variants)return true;
  if(inspectCredentialValue(variants,researchKnownCredentials(extra,capturedLeases)).hit)return true;
  return inspectPrepared(variants).hit;
 };
}
export async function researchCredentialHit(owner:string,value:unknown,extra:string[]=[]):Promise<boolean> {
 const variants=researchCredentialVariants(value);if(!variants)return true;
 const leases=await db().prepare('SELECT lease_token AS token FROM topic_research_outbox WHERE owner=? AND lease_token IS NOT NULL').bind(owner).all<{token:string}>();
 const credentials=researchKnownCredentials(extra,leases.results.map(row=>row.token));
 if(inspectCredentialValue(variants,credentials).hit)return true;
 return (await protectPreparedArticleForOwner(owner,variants)).hit;
}
