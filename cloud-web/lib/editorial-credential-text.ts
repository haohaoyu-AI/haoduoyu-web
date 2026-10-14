import {inspectCredentialValue,decodeCredentialJsonEscape} from './credential-boundary';
// Inspection-only canonicalization. Never return decoded material to a caller/UI.
export function editorialCredentialVariants(value:unknown):unknown[] {
 let raw:string;try{raw=JSON.stringify(value)||'';}catch{throw Error('uninspectable');}
 if(raw.length>2000000)throw Error('uninspectable');
 const variants:unknown[]=[value],seen=new Set<string>();let text=raw,characters=0;
 for(let layer=0;layer<16;layer++){
  characters+=text.length;if(characters>8000000)throw Error('uninspectable');
  if(!seen.has(text)){seen.add(text);variants.push(text);}
  if(/\\u(?![0-9a-fA-F]{4})/.test(text))throw Error('uninspectable');
  let next=text.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/g,decodeCredentialJsonEscape);
  next=next.replace(/(?:%[0-9a-fA-F]{2})+/g,part=>{try{return decodeURIComponent(part);}catch{return part.replace(/%([0-9a-fA-F]{2})/g,(_all,hex:string)=>String.fromCharCode(parseInt(hex,16)));}});
  if(next===text)return variants;text=next;
 }throw Error('uninspectable');
}
export function editorialCredentialInspection(value:unknown,known:string[]):boolean {
 try{if(inspectCredentialValue(value,known).hit)return true;for(const variant of editorialCredentialVariants(value)){if(typeof variant!=='string')continue;for(let at=0;at<variant.length;at+=60000)if(inspectCredentialValue(variant.slice(at,at+64096),known).hit)return true;}return false;}catch{return true;}
}
