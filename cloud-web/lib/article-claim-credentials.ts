import {db} from './test-store';
import {editorialCredentialVariants} from './editorial-credential-text';
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
// Remember only one-way fingerprints before issuing, releasing or rotating a lease. This is
// credential suppression, not an authorization database; neither reads nor evidence expose it.
export async function rememberArticleClaimHashes(owner:string,...tokens:(string|null|undefined)[]){
 for(const token of new Set(tokens.filter((value):value is string=>typeof value==='string'&&!!value)))await db().prepare('INSERT OR IGNORE INTO article_claim_credential_hashes(owner,sha256,created) VALUES(?,?,?)').bind(owner,await digest(token.toLowerCase()),new Date().toISOString()).run();
}
export async function hasArticleClaimCredential(owner:string,value:unknown){
 let variants:unknown[];try{variants=editorialCredentialVariants(value);}catch{return true;}const ids=new Set<string>();
 for(const variant of variants){const text=typeof variant==='string'?variant:JSON.stringify(variant)||'';for(const match of text.matchAll(/(?=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))/gi))ids.add(match[1].toLowerCase());}
 if(ids.size>1000)return true;
 const hashes=new Set((await db().prepare('SELECT sha256 FROM article_claim_credential_hashes WHERE owner=? UNION SELECT claim_hash AS sha256 FROM article_upload_attempts WHERE owner=? UNION SELECT consume_token_sha256 AS sha256 FROM article_upload_attempts WHERE owner=? AND consume_token_sha256 IS NOT NULL').bind(owner,owner,owner).all<{sha256:string}>()).results.map(row=>row.sha256));
 for(const id of ids)if(hashes.has(await digest(id)))return true;
 return false;
}
