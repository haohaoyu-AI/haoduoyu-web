import {digest,fail,stable} from './security.mjs';

// Durable ingestion receipts are backed up with the existing idempotency ledger.
// Their actor namespace is private to review ingestion and separate from callers' keys.
const receiptActor=owner=>'review-publication:'+owner;
export const reviewReceiptJoin="LEFT JOIN matrix_idempotency receipt ON receipt.actor='review-publication:'||a.user_id AND receipt.key=a.id";
export const reviewCanonicalWhere="json_extract(receipt.response_json,'$.canonical_id') IS NULL";
export const reviewReceiptColumns="receipt.response_json AS publication_receipt";
export const reviewReceipt=row=>row?.publication_receipt?JSON.parse(row.publication_receipt):{};
export const reviewReceiptFields=receipt=>receipt.original_draft_title?{original_draft_title:receipt.original_draft_title}:{};

export async function readReviewReceipt(store,owner,id) {
  const row=await store.get('SELECT response_json AS publication_receipt FROM idempotency WHERE actor=? AND key=?',receiptActor(owner),id);
  return reviewReceipt(row);
}
export function queueReviewReceipt(store,owner,id,receipt,previous) {
  const serialized=JSON.stringify(stable(receipt));
  if(serialized===JSON.stringify(stable(previous)))return false;
  store.queue('INSERT INTO idempotency(actor,key,request_hash,response_json,status,created_at) VALUES(?,?,?,?,200,?) ON CONFLICT(actor,key) DO UPDATE SET request_hash=excluded.request_hash,response_json=excluded.response_json',receiptActor(owner),id,digest(serialized),serialized,new Date().toISOString());
  return true;
}

function invalid(){throw fail(400,'VALIDATION_ERROR','文章匹配证据格式无效');}
function object(value,allowed) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))invalid();
}
function text(value,limit) {
  if(typeof value!=='string'||!value.trim()||value.length>limit||value.includes('\0'))invalid();
  return value.trim();
}
function list(value,validator) {
  if(!Array.isArray(value)||value.length>16)invalid();
  return [...new Set(value.map(validator))];
}
const evidenceFields={
  body:value=>text(value,16000),
  source_urls:value=>list(value,item=>{
    const url=text(item,2048);
    try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)invalid();}
    catch{invalid();}
    return url;
  }),
  cover_fingerprint:value=>{
    if(typeof value!=='string'||!/^cover-v1:[0-9a-f]{864}$/.test(value))invalid();
    return value;
  },
  people:value=>list(value,item=>text(item,160)),
  events:value=>list(value,item=>text(item,160)),
  numbers:value=>list(value,item=>text(item,160)),
};
export function validatedMatchEvidence(value) {
  if(value==null)return undefined;
  object(value,Object.keys(evidenceFields));
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,evidenceFields[key](item)]));
}
export function validatedDraftRef(value) {
  if(value==null)return undefined;
  object(value,['pgc_id','appmsgid']);
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,text(item,240)]));
}
export const mergeMatchEvidence=(previous,incoming)=>incoming?{...previous,...incoming}:previous;
export const publicationKeys=(previous,key)=>key?[...new Set([...(previous??[]),key])].slice(-8):previous;
export function publicationReplayKey(values,proof) {
  // A sparse import still has a stable identity on exact payload replay.
  // An evidence update or a different timestamp/title requires a fresh decision.
  return digest(JSON.stringify(stable({values,proof})));
}
