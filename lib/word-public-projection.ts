import {redactWordCredentialText} from './word-credentials';

// Public projections only. Never rewrite a raw row used by a CAS, a frozen source,
// byte payload, grant, digest or output identity while suppressing unsafe metadata.
export async function publicWordManifest<T>(owner:string,value:T,knownTokens:unknown[]=[]):Promise<T>{
 const m=value as any;
 if(!m?.layout?.images)return value;
 const sources=await redactWordCredentialText(owner,m.layout.images.map((image:any)=>({source_url:image.source_url,source_title:image.source_title})),knownTokens);
 const images=m.layout.images.map((image:any,index:number)=>({...image,...sources[index]}));
 return {...m,layout:{...m.layout,images}};
}
export async function publicWordOutput<T>(owner:string,value:T,knownTokens:unknown[]=[]):Promise<T>{
 const m=value as any;if(!m)return value;
 const execution=m.execution?{...m.execution,...await redactWordCredentialText(owner,{execution_id:m.execution.execution_id,model:m.execution.model,verification_summary:m.execution.verification_summary},knownTokens)}:m.execution;
 const audit=Array.isArray(m.word_claim_recoveries)?await Promise.all(m.word_claim_recoveries.map(async(a:any)=>({...a,...await redactWordCredentialText(owner,{original_execution_end_reference:a.original_execution_end_reference},knownTokens)}))):m.word_claim_recoveries;
 return {...m,...(execution?{execution}:{}),...(audit?{word_claim_recoveries:audit}:{})};
}
