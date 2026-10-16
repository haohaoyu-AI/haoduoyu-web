import {assertWordCredentialFree} from './word-credentials';
import {rememberArticleClaimHashes,hasArticleClaimCredential} from './article-claim-credentials';
import {db} from './test-store';
import {uploadAttempts} from './article-upload-attempts';
import {bucket} from './articles';
import {assertOriginalText,parseArticle} from './article-format';
import {parseArtifactManifest,verifyWordManifest} from './article-manifest';
import {createEditorialCredentialScanContext} from './editorial-credential-boundary';
import {articleUploadExecutionEndTool,finishArticleUploadExecution} from './article-upload-execution-end';
import {unfinishedManualWordClaim,unfinishedManualWordClaimSql,prewordClaimGuidance} from './article-word-claim-guard';

// This operation never certifies that a browser/executor stopped. The authenticated owner must
// explicitly confirm that fact and the narrowly read-only recovery scope before it is called.
// Like other confirmation-gated Site tools, caller policy enforces the owner's approval; MCP
// authentication alone cannot distinguish a human from an agent acting on that owner's account.
type Article = {id:string;source_key?:string;title:string;state:string;result_key:string|null;result_meta:string|null;draft_url:string|null;draft_readback?:string|null;upload_guard_version?:number;artifact_manifest?:string|null;paragraphs:string;claim_token:string|null;claim_expires:string|null};
type Lease = {id?:string;updated?:string;state:string;claim_token:string|null;claim_expires:string|null;draft_url:string|null;readback?:string|null;message?:string|null};
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function lease(owner:string,article:Article,platform:string):Promise<Lease>{
 if(platform==='toutiao')return article;
 if(platform!=='zhihu')throw Error('Recovery destination not supported');
 const record=await db().prepare('SELECT * FROM article_deliveries WHERE owner=? AND article_id=? AND platform=?').bind(owner,article.id,platform).first<Lease>();
 if(!record)throw Error('No existing destination claim to recover');
 return record;
}
type WordRecoveryAudit = {scope:string};
type WordPart = {key:string;sha256:string;size:number};
type WordOutput = {output_id:string;sha256:string;size:number;chunks:number;parts:WordPart[];bytes:number;verification?:unknown;word_claim_recoveries?:WordRecoveryAudit[]};
const validOutput=(value:unknown):value is WordOutput=>{const word=value as WordOutput|null;return !!word&&typeof word.output_id==='string'&&/^[a-f0-9-]{36}$/.test(word.output_id)&&/^[a-f0-9]{64}$/.test(word.sha256)&&Number.isSafeInteger(word.size)&&word.size>0&&Number.isSafeInteger(word.chunks)&&word.chunks>0&&word.chunks<=400&&Array.isArray(word.parts)&&word.parts.length<=word.chunks&&word.parts.every(part=>part&&typeof part.key==='string'&&/^[a-f0-9]{64}$/.test(part.sha256)&&Number.isSafeInteger(part.size)&&part.size>0&&part.size<=65536)&&Number.isSafeInteger(word.bytes)&&word.bytes>=0&&word.bytes<=word.size&&word.parts.reduce((total,part)=>total+part.size,0)===word.bytes&&(word.word_claim_recoveries===undefined||Array.isArray(word.word_claim_recoveries));};
async function verifyFrozenWord(article:Article,word:WordOutput){
 const head=await bucket().head(article.result_key!);if(!head||head.size!==word.size)throw Error('Word bytes unavailable or size changed');
 // Prepared/manual outputs need no invented historical image receipt: verify their real bytes.
 const file=await bucket().get(article.result_key!);if(!file)throw Error('Word bytes unavailable');
 const bytes=new Uint8Array(await file.arrayBuffer()),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 if(bytes.length!==word.size||hash!==word.sha256)throw Error('Word checksum failed');
 const paragraphs:string[]=JSON.parse(article.paragraphs);assertOriginalText(paragraphs,parseArticle(bytes,'recovered-word.docx',true));
 const manifest=parseArtifactManifest(article.artifact_manifest||null);if(manifest)await verifyWordManifest(manifest,paragraphs,bytes,word.sha256);
}
async function platformSnapshot(owner:string,id:string){
 const attempts=(await db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? ORDER BY platform,attempt_version').bind(owner,id).all<{platform:string}>()).results;
 const deliveries=(await db().prepare('SELECT * FROM article_deliveries WHERE owner=? AND article_id=? ORDER BY platform').bind(owner,id).all<{platform:string}>()).results;
 return {attempts,deliveries};
}
const properties={article_id:{type:'string'},platform:{type:'string',enum:['toutiao','zhihu']}};
const schema=(p:Record<string,unknown>)=>({type:'object',properties:p,required:Object.keys(p),additionalProperties:false});
export const articleClaimRecoveryTools=[
 articleUploadExecutionEndTool,
 {name:'release_article_word_claim',description:'Explicit stage handoff by the current token holder only: release a word_ready main claim before any platform attempt or delivery claim exists. No token is shared or saved elsewhere. A successor must claim normally. Never use for saving/unknown outcomes or a lost token.',inputSchema:schema({article_id:{type:'string'},claim_token:{type:'string',maxLength:100}}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
 {name:'restore_article_word_phase',description:'One-time authenticated-owner-attested repair of an already recovered Word-only claim from the old recovery bug. Requires the current live claim, exact stored final output identity and the original word_ready preview fingerprint, plus actual owner confirmation that no platform action occurred. Records this as owner attestation, never server-proven history. Existing platform attempts, delivery records, links/readbacks or recovery audits are refused. Keeps the same token and Word bytes; grants no platform import permission.',inputSchema:schema({article_id:{type:'string'},claim_token:{type:'string',maxLength:100},output_id:{type:'string'},word_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},word_size:{type:'integer',minimum:1},original_state:{type:'string',const:'word_ready'},original_lease_fingerprint:{type:'string',pattern:'^[a-f0-9]{64}$'},original_execution_end_reference:{type:'string',minLength:1,maxLength:180},confirm_word_only_restore:{type:'boolean',const:true},confirm_no_platform_actions:{type:'boolean',const:true}}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}},
 {name:'preview_article_claim_recovery',description:'Read current owner-scoped lease fingerprint, final Word identity, real draft links and upload fence. Never reveals a token or changes a lock. Only recover after the owner explicitly confirms the old executor has ended. The preview distinguishes frozen Word-only continuation, untouched pending-destination claim rotation, and same-draft read-only platform verification; absence of attempts alone does not prove no platform history.',inputSchema:schema(properties),annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:'recover_article_claim',description:'Requires the actual owner’s explicit confirmation, not a worker’s own assertion. Atomically rotate the exact previewed lease, fence the old token and every unconsumed upload permit, and preserve the current frozen Word-only output or untouched pending-destination phase, or force same-article read-only platform verification. The server cannot prove the prior browser stopped. No upload, draft creation, model call, content edit, deletion, account or subscription change is authorized.',inputSchema:schema({...properties,expected_lease_fingerprint:{type:'string',pattern:'^[a-f0-9]{64}$'},confirm_article_id:{type:'string'},confirm_prior_executor_ended:{type:'boolean',const:true},confirm_read_only_recovery:{type:'boolean',const:true},confirm_existing_results_checked:{type:'boolean',const:true}}),annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}}
];
export const articleClaimRecoveryNames=new Set(articleClaimRecoveryTools.map(tool=>tool.name));
export async function articleClaimRecoveryCall(owner:string,article:Article,name:string,args:Record<string,unknown>){
 if(name==='finish_article_upload_execution')return finishArticleUploadExecution(owner,article,args);
 if(name==='release_article_word_claim'){
  if(typeof args.claim_token!=='string'||args.claim_token!==article.claim_token||!article.claim_expires||!Number.isFinite(Date.parse(article.claim_expires))||Date.parse(article.claim_expires)<=Date.now())throw Error('Only the current live Word claim holder can hand off');
  if(article.state!=='word_ready'||!article.result_key||!article.result_meta||article.draft_url)throw Error('Handoff is limited to a ready Word before platform work');
  const word=JSON.parse(article.result_meta);if(word.word_claim_recoveries?.some((entry:WordRecoveryAudit)=>entry.scope!=='word_output_only'))throw Error('Handoff is limited to a ready Word before platform work');
  await rememberArticleClaimHashes(owner,article.claim_token);
  const released=await db().prepare(`UPDATE articles SET claim_token=NULL,claim_expires=NULL WHERE id=? AND owner=? AND state='word_ready' AND result_key=? AND result_meta=? AND claim_token=? AND claim_expires>? AND draft_url IS NULL AND draft_readback IS NULL
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.article_id=articles.id AND u.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=articles.id AND d.owner=articles.owner)`)
   .bind(article.id,owner,article.result_key,article.result_meta,args.claim_token,new Date().toISOString()).run();
  if(!released.meta.changes)throw Error('Platform work or claim changed; do not release or hand off blindly');
  return {article_id:article.id,state:'word_ready',released:true,instruction:'Successor must call claim_article. No token transfer and no browser import permission granted.'};
 }
 if(name==='restore_article_word_phase'){
  if(typeof args.claim_token!=='string'||args.claim_token!==article.claim_token||!article.claim_expires||!Number.isFinite(Date.parse(article.claim_expires))||Date.parse(article.claim_expires)<=Date.now())throw Error('Only the current live Word claim holder can hand off');
  const word=article.result_meta?JSON.parse(article.result_meta):null;
  if(args.confirm_word_only_restore!==true||args.confirm_no_platform_actions!==true||args.original_state!=='word_ready'||typeof args.original_lease_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(args.original_lease_fingerprint)||typeof args.original_execution_end_reference!=='string'||!args.original_execution_end_reference.trim()||args.original_execution_end_reference.length>180||/[\x00-\x1f\x7f]/.test(args.original_execution_end_reference))throw Error('Explicit owner confirmation of exact Word-only recovery evidence is required');
  if(article.state!=='needs_verification'||!article.result_key||!validOutput(word)||word.parts.length!==word.chunks||word.bytes!==word.size||article.upload_guard_version!==1||args.output_id!==word.output_id||args.word_sha256!==word.sha256||args.word_size!==word.size)throw Error('Word-only repair requires the exact complete finalized output and current recovery phase');
  if(word.word_claim_recoveries!==undefined||article.draft_url||article.draft_readback)throw Error('Word-only repair cannot clear prior or uncertain platform activity');
  await verifyFrozenWord(article,word);
  const snapshot=await platformSnapshot(owner,article.id);if(snapshot.attempts.length||snapshot.deliveries.length)throw Error('Word-only repair cannot clear prior or uncertain platform activity');
  const referenceScan=await createEditorialCredentialScanContext(owner);
  const editorialLeases=(await db().prepare('SELECT lease_token FROM editorial_request_outbox WHERE owner=? AND lease_token IS NOT NULL').bind(owner).all<{lease_token:string}>()).results.map(row=>row.lease_token);
  await assertWordCredentialFree(owner,args.original_execution_end_reference,[args.claim_token]);
  if(await referenceScan.inspect(args.original_execution_end_reference,[args.claim_token,...editorialLeases])||await hasArticleClaimCredential(owner,args.original_execution_end_reference))throw Error('Word recovery evidence contains unsafe credential content; nothing saved');
  await referenceScan.assertFresh();
  const claimHash=await digest(args.claim_token),audit={scope:'word_output_only',operation:'legacy_phase_restore',actor_owner:owner,claim_sha256:claimHash,original_state:'word_ready',original_lease_fingerprint:args.original_lease_fingerprint,original_execution_end_reference:args.original_execution_end_reference,evidence:'authenticated_owner_attested_not_server_verified',no_platform_actions:true,at:new Date().toISOString()};
  const meta=JSON.stringify({...word,word_claim_recoveries:[audit]});
  const change=await db().prepare(`UPDATE articles SET state='word_ready',result_meta=? WHERE id=? AND owner=? AND state='needs_verification' AND claim_token=? AND claim_expires>? AND result_key=? AND result_meta=? AND upload_guard_version=1 AND draft_url IS NULL AND draft_readback IS NULL
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.article_id=articles.id AND u.owner=articles.owner)
   AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=articles.id AND d.owner=articles.owner)`).bind(meta,article.id,owner,args.claim_token,new Date().toISOString(),article.result_key,article.result_meta).run();
  if(!change.meta.changes)throw Error('Platform work or claim changed; do not release or hand off blindly');
  return {article_id:article.id,state:'word_ready',restored:true,same_claim:true,word_unchanged:true,new_upload_allowed:false,evidence:audit.evidence,instruction:'Continue the same Word-only handoff. No platform file submission is authorized; the separate upload protocol and actual owner authorization remain required.'};
 }
 const platform=String(args.platform),current=await lease(owner,article,platform);
 if(platform==='toutiao'&&unfinishedManualWordClaim(article)&&await db().prepare('SELECT 1 AS blocked FROM articles WHERE id=? AND owner=? AND '+unfinishedManualWordClaimSql).bind(article.id,owner).first()){
  const guidance=await prewordClaimGuidance(owner,article);
  if(name==='preview_article_claim_recovery')return {article_id:article.id,state:article.state,recovery_scope:'manual_word_before_final_save',...guidance,new_upload_allowed:false};
  throw Error('blocked' in guidance&&guidance.blocked?'Source or original submission evidence is incomplete; retain this article and await source review, without reclaim or dispatch':'Use preview_article_word_recovery and recover_article_word_execution with exact original executor end evidence; pre-final Word claims cannot use destination recovery');
 }
 const attempt=await db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? AND platform=? ORDER BY attempt_version DESC LIMIT 1').bind(owner,article.id,platform).first<{id:string;state:string;consumed_at:string|null;updated:string;revision:number;editor_urls:string;readback:string|null}>();
 const attemptSnapshot=attempt?JSON.stringify(attempt):'';
 const attemptRevision=attempt?.revision??-1;
 const snapshot=await platformSnapshot(owner,article.id);
 const fingerprint=await digest(JSON.stringify({article_snapshot:article,platform_snapshot:snapshot,upload_guard_version:article.upload_guard_version||0,draft_readback:article.draft_readback||null,owner,article_id:article.id,platform,state:current.state,token:current.claim_token,expires:current.claim_expires,draft_url:current.draft_url,result_key:article.result_key,result_meta:article.result_meta,attempt_snapshot:attemptSnapshot}));
 const word=article.result_meta?JSON.parse(article.result_meta):null;
 const wordOnly=platform==='toutiao'&&validOutput(word)&&!article.draft_url&&!article.draft_readback&&!snapshot.attempts.length&&!snapshot.deliveries.length&&!word.word_claim_recoveries?.some((entry:WordRecoveryAudit)=>entry.scope!=='word_output_only')&&((current.state==='processing'&&!article.result_key)||(current.state==='word_ready'&&!!article.result_key&&article.upload_guard_version===1&&word.parts.length===word.chunks&&word.bytes===word.size));
 // A finalized Word and untouched pending destination are an independent phase. Activity on
 // another platform cannot turn this destination's first import into an unknown outcome.
 const pendingDeliveries=snapshot.deliveries.filter(record=>record.platform==='zhihu');
 const platformPending=platform==='zhihu'&&pendingDeliveries.length===1&&JSON.stringify(pendingDeliveries[0])===JSON.stringify(current)&&!snapshot.attempts.some(record=>record.platform==='zhihu')&&current.state==='pending'&&validOutput(word)&&!!article.result_key&&article.upload_guard_version===1&&word.parts.length===word.chunks&&word.bytes===word.size&&!attempt&&!current.draft_url&&!current.readback&&!current.message;
 if(platformPending)await verifyFrozenWord(article,word);
 const recoveryScope=wordOnly?'word_output_only':platformPending?'platform_pending_only':'platform_read_only';
 if(name==='preview_article_claim_recovery')return {article_id:article.id,title:article.title,platform,state:current.state,upload_guard_version:article.upload_guard_version??null,claim_present:!!current.claim_token,claim_expires:current.claim_expires,lease_fingerprint:fingerprint,word:{ready:!!article.result_key,output_id:word?.output_id||null,sha256:word?.sha256||null,size:word?.size||null},recovery_scope:recoveryScope,draft_url:current.draft_url,upload_attempts:await uploadAttempts(owner,article.id),recovery_only:true,new_upload_allowed:false,limitation:'The server cannot prove the prior executor/browser has stopped. The owner must explicitly confirm it and authorize the displayed recovery scope. Word-only continuation preserves the same output; an untouched pending destination preserves pending status. Recovery itself never permits platform submission. Absence of attempts alone is not proof of no historical upload.'};
 if(name!=='recover_article_claim')throw Error('Unknown recovery operation');
 if(args.confirm_article_id!==article.id||args.confirm_prior_executor_ended!==true||args.confirm_read_only_recovery!==true||args.confirm_existing_results_checked!==true)throw Error('Explicit owner confirmation of the exact article, ended executor and read-only recovery is required');
 if(args.expected_lease_fingerprint!==fingerprint)throw Error('Lease or artifact changed; read a fresh recovery preview and reconfirm');
 if((!article.result_key&&!wordOnly)||!current.claim_token||!current.claim_expires||!Number.isFinite(Date.parse(current.claim_expires)))throw Error('Recovery requires an existing Word and prior destination claim; ordinary claiming handles unclaimed work');
 if(current.state==='completed'||current.state==='saved'||article.state==='deleting')throw Error('Terminal or deleting records are read-only');
 const token=crypto.randomUUID(),updated=new Date().toISOString(),expires=new Date(Date.now()+6*3600000).toISOString();
 await rememberArticleClaimHashes(owner,current.claim_token,token);
 const nextState=wordOnly||platformPending?current.state:'needs_verification';
 const nextMeta=platform==='toutiao'&&word?JSON.stringify({...word,word_claim_recoveries:[...(word.word_claim_recoveries||[]),{scope:wordOnly?'word_output_only':'platform_read_only',operation:'claim_rotation',actor_owner:owner,original_state:current.state,original_lease_fingerprint:fingerprint,old_claim_sha256:await digest(current.claim_token),claim_sha256:await digest(token),evidence:'server_current_phase_and_owner_termination_attestation',at:updated}]}):article.result_meta;
 // Use the prior full lease and artifact snapshot in the same update; no SELECT-then-blind lock clear.
 const mutation=platform==='toutiao'?db().prepare(`UPDATE articles SET claim_token=?,claim_expires=?,state=?,result_meta=? WHERE id=? AND owner=? AND claim_token=? AND claim_expires=? AND state=? AND draft_url IS ? AND result_key IS ? AND result_meta=? AND draft_readback IS ? AND upload_guard_version=? AND (?=0 OR (NOT EXISTS(SELECT 1 FROM article_upload_attempts x WHERE x.owner=articles.owner AND x.article_id=articles.id) AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=articles.owner AND d.article_id=articles.id))) AND COALESCE((SELECT revision FROM article_upload_attempts u WHERE u.owner=articles.owner AND u.article_id=articles.id AND u.platform='toutiao' ORDER BY u.attempt_version DESC LIMIT 1),-1)=? AND NOT ${unfinishedManualWordClaimSql}`)
  .bind(token,expires,nextState,nextMeta,article.id,owner,current.claim_token,current.claim_expires,current.state,current.draft_url,article.result_key,article.result_meta,article.draft_readback||null,article.upload_guard_version||0,wordOnly?1:0,attemptRevision):platformPending?db().prepare(`UPDATE article_deliveries SET claim_token=?,claim_expires=?,state='pending',updated=? WHERE id=? AND article_id=? AND owner=? AND platform='zhihu' AND state='pending' AND claim_token=? AND claim_expires=? AND draft_url IS ? AND readback IS ? AND message IS ? AND updated=?
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.owner=article_deliveries.owner AND u.article_id=article_deliveries.article_id AND u.platform='zhihu')
   AND EXISTS(SELECT 1 FROM articles a WHERE a.id=article_deliveries.article_id AND a.owner=article_deliveries.owner AND a.state=? AND a.state!='deleting' AND a.result_key=? AND a.result_meta=? AND a.paragraphs=? AND a.artifact_manifest IS ? AND a.upload_guard_version=1 AND a.draft_url IS ? AND a.draft_readback IS ? AND a.claim_token IS ? AND a.claim_expires IS ?)`)
  .bind(token,expires,updated,current.id,article.id,owner,current.claim_token,current.claim_expires,current.draft_url,current.readback??null,current.message??null,current.updated,article.state,article.result_key,article.result_meta,article.paragraphs,article.artifact_manifest??null,article.draft_url,article.draft_readback??null,article.claim_token,article.claim_expires):db().prepare(`UPDATE article_deliveries SET claim_token=?,claim_expires=?,state='needs_verification',updated=? WHERE article_id=? AND owner=? AND platform='zhihu' AND claim_token=? AND claim_expires=? AND state=? AND draft_url IS ? AND readback IS ? AND message IS ? AND updated=? AND EXISTS(SELECT 1 FROM articles a WHERE a.id=article_deliveries.article_id AND a.owner=? AND a.result_key=? AND a.result_meta=? AND a.state!='deleting') AND COALESCE((SELECT revision FROM article_upload_attempts u WHERE u.owner=article_deliveries.owner AND u.article_id=article_deliveries.article_id AND u.platform='zhihu' ORDER BY u.attempt_version DESC LIMIT 1),-1)=?`)
  .bind(token,expires,updated,article.id,owner,current.claim_token,current.claim_expires,current.state,current.draft_url,current.readback??null,current.message??null,current.updated,owner,article.result_key,article.result_meta,attemptRevision);
 const fence=db().prepare(`UPDATE article_upload_attempts SET state='outcome_unknown',updated=?,revision=revision+1 WHERE owner=? AND article_id=? AND platform=? AND state='reserved' AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=article_upload_attempts.id) AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=article_upload_attempts.id)
  AND ((?='toutiao' AND EXISTS(SELECT 1 FROM articles a WHERE a.id=article_upload_attempts.article_id AND a.owner=? AND a.claim_token=?))
  OR (?='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=article_upload_attempts.article_id AND d.owner=? AND d.platform='zhihu' AND d.claim_token=?)))`)
  .bind(updated,owner,article.id,platform,platform,owner,token,platform,owner,token);
 // D1 batch is transactional: lease rotation and explanatory attempt fencing commit together.
 // consume also compares the live token/hash, so it cannot reuse the old permission.
 const [change]=await db().batch([mutation,fence]);
 if(!change.meta.changes)throw Error('Claim changed during recovery; no handoff granted');
 return {article_id:article.id,platform,state:nextState,recovery_scope:recoveryScope,...(platform==='toutiao'?{claim_token:token}:{delivery_token:token}),expires,recovery_only:true,new_upload_allowed:false,old_claim_fenced:true,instruction:platformPending?'Continue only the unchanged pending destination and frozen Word. Recovery grants no file submission; separately reserve and consume its first-import permission once.':wordOnly?'Resume only the same frozen Word output, then explicitly release its ready Word claim. No platform import permission is granted.':'Reopen and verify the same existing draft in the same account. Do not import, create another draft, generate text or reset the upload fence.'};
}
