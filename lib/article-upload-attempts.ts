import {rememberArticleClaimHashes,hasArticleClaimCredential} from './article-claim-credentials';
import {db} from './test-store';
import {bucket} from './articles';
import {MAX_FILE} from './article-format';
import {inspectUploadWord, parseArtifactManifest, draftReadbackSchema} from './article-manifest';
import {reuseVerifiedUploadWord} from './article-upload-word';
import {editorialCredentialHit} from './editorial-credential-boundary';
import {inspectCredentialValue} from './credential-boundary';
import {readUploadRecoverySchema} from './article-upload-recovery-diagnostics';
import {reserveUploadDiagnosticError,type ReserveUploadStage} from './workflow-errors';
import {consumeUploadDiagnosticError,probeConsumeUpload,type ConsumeUploadStage} from './article-upload-consume-diagnostics';

// This fence grants at most one import instruction, not exactly-once execution by a browser/platform.
// A consumed attempt never resets. An owner-authorized manual-task reimport is a new linked attempt.
export const authorizedUploadAccounts={toutiao:'61556093362',zhihu:'ren-zhe-ai-chi-yu-52'} as const;
type Platform = 'toutiao' | 'zhihu';
type Image = {sha256: string; after_paragraph: number};
type Baseline = {title: string; paragraphs: string[]; images: Image[]};
type Attempt = {
 id: string; attempt_version:number;previous_attempt_id:string|null;authorization_key:string|null;reimport_authorization:string|null;consume_token_sha256:string|null;confirmation_message_id:string|null;revision:number; owner: string; article_id: string; platform: Platform; target_account: string;
 word_sha256: string; word_size: number; authorization_kind: string; claim_hash: string; preflight: string; baseline: string;
 state: 'reserved' | 'outcome_unknown' | 'draft_observed' | 'verified';
 editor_urls: string; readback: string | null; created: string; consumed_at: string | null; updated: string;
};
type Article = {source_key?:string;claim_expires?:string|null;id: string; state: string; result_key: string | null; result_meta: string | null; paragraphs: string; artifact_manifest: string | null; draft_url: string | null; draft_readback?:string|null; claim_token?: string | null; upload_guard_version?: number};
const sha = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))).map(x => x.toString(16).padStart(2, '0')).join('');
const hashClaim=(value:string)=>sha(new TextEncoder().encode(value));
const now = () => new Date().toISOString();
const object = (value: unknown): Record<string, unknown> => {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Upload evidence must be an object');
 return value as Record<string, unknown>;
};
function safe(value: unknown, known: string[] = []) {
 if (inspectCredentialValue(value, known).hit) throw Error('Upload evidence contains unsafe credential content; nothing saved');
}
async function unsafeEvidence(owner:string,value:unknown,extra:string[]=[]){
 const leases=await db().prepare('SELECT lease_token FROM editorial_request_outbox WHERE owner=? AND lease_token IS NOT NULL').bind(owner).all<{lease_token:string}>();
 if(await hasArticleClaimCredential(owner,value))return true;
 return editorialCredentialHit(owner,value,[...extra,...leases.results.map(row=>row.lease_token)]);
}
function short(value: unknown, max = 180) {
 if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw Error('Invalid upload evidence text');
 safe(value); return value;
}
function timestamp(value: unknown, floor = Date.now() - 15 * 60000) {
 if (typeof value !== 'string' || value.length>40 || !Number.isFinite(Date.parse(value)) || Date.parse(value) < floor || Date.parse(value) > Date.now() + 60000) throw Error('Fresh browser evidence required');
 return value;
}
function platform(value: unknown): Platform {
 if (value !== 'toutiao' && value !== 'zhihu') throw Error('Upload destination not supported');
 return value;
}
// Persist only real canonical editor identities. No query credentials, session fragments or signed URLs.
export function uploadEditorUrl(destination: Platform, value: unknown) {
 const raw = short(value, 1024); let url: URL;
 try { url = new URL(raw); } catch { throw Error('Invalid draft editor URL'); }
 if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error('Invalid draft editor URL');
 if (destination === 'toutiao' && url.hostname === 'mp.toutiao.com' && url.pathname === '/profile_v4/graphic/publish' && [...url.searchParams.keys()].length === 1 && /^\d+$/.test(url.searchParams.get('pgc_id') || '')) return url.href;
 if (destination === 'zhihu' && url.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d+\/edit$/.test(url.pathname) && !url.search) return url.href;
 throw Error('A real private draft editor URL without credentials is required');
}
function observedEditorUrl(destination:Platform,value:unknown){
 const raw=short(value,1024);
 if(destination==='toutiao'&&raw==='https://mp.toutiao.com/profile_v4/graphic/publish')return raw;
 if(destination==='zhihu'&&raw==='https://zhuanlan.zhihu.com/write')return raw;
 return uploadEditorUrl(destination,raw);
}
function assetUrl(value: unknown) {
 const url = new URL(short(value, 2048));
 // Query-free observed resource identity only; never persist platform authorization/signature parameters.
 if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) throw Error('Use a credential-free, query-free image resource identity');
 return url.href;
}
async function row(owner: string, articleId: string, destination: Platform) {
 return db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? AND platform=? ORDER BY attempt_version DESC LIMIT 1').bind(owner, articleId, destination).first<Attempt>();
}
function publicAttempt(attempt: Attempt | null) {
 if (!attempt) return null;
 return {attempt_id: attempt.id, attempt_version:attempt.attempt_version,previous_attempt_id:attempt.previous_attempt_id,owner_reimport_confirmed:['owner_confirmed_reimport','owner_confirmed_legacy_reimport'].includes(attempt.authorization_kind),...((attempt.authorization_kind==='owner_confirmed_legacy_reimport'||attempt.reimport_authorization&&JSON.parse(attempt.reimport_authorization).prior_history==='untracked_unknown')?{prior_history:'untracked_unknown'}:{}),revision:attempt.revision,article_id: attempt.article_id, platform: attempt.platform, target_account: attempt.target_account,
  word_sha256: attempt.word_sha256, word_size: attempt.word_size, authorization_kind:attempt.authorization_kind,submission_state:attempt.state==='verified'?'verified_existing':attempt.state==='reserved'&&['new_word','owner_confirmed_never_submitted'].includes(attempt.authorization_kind)?'never_attempted':'submitted_unknown',state: attempt.state, preflight: JSON.parse(attempt.preflight),
  editor_urls: JSON.parse(attempt.editor_urls), readback: attempt.readback ? JSON.parse(attempt.readback) : null,
  created: attempt.created, consumed_at: attempt.consumed_at, updated: attempt.updated,
  next_action: attempt.state === 'reserved' ? 'consume_once_before_file_submission' : attempt.state==='verified'?'read_verified_draft_only':'verify_existing_or_owner_authorized_manual_task_reimport'};
}
export async function uploadAttempts(owner: string, articleId: string) {
 const records = await db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND article_id=? ORDER BY platform,attempt_version').bind(owner, articleId).all<Attempt>();
 return records.results.map(publicAttempt);
}
async function wordBaseline(article: Article, expectedSha: unknown, expectedSize: unknown): Promise<Baseline> {
 if (!article.result_key || !article.result_meta) throw Error('Ready Word required');
 const meta = JSON.parse(article.result_meta);
 if (!/^[a-f0-9]{64}$/.test(String(expectedSha)) || expectedSha !== meta.sha256 || !Number.isSafeInteger(expectedSize) || expectedSize !== meta.size || meta.size < 1 || meta.size > MAX_FILE) throw Error('Word SHA256 or size does not match the stored output');
 const head = await bucket().head(article.result_key);
 if (!head || head.size !== meta.size) throw Error('Word bytes unavailable or size changed');
 const file = await bucket().get(article.result_key);
 if (!file) throw Error('Word bytes unavailable');
 const bytes = new Uint8Array(await file.arrayBuffer());
 if (bytes.length !== meta.size || await sha(bytes) !== meta.sha256) throw Error('Word checksum failed');
 const manifest = parseArtifactManifest(article.artifact_manifest);
 // Only an actual matching byte digest may reuse the server's finalized content receipt.
 const original=JSON.parse(article.paragraphs);
 const {text,images}=await reuseVerifiedUploadWord(manifest,original,meta.sha256,meta.verification)
  ?? await inspectUploadWord(manifest,original,bytes,meta.sha256);
 if (!text.length) throw Error('Word text unavailable');
 const baseline = {title: text[0], paragraphs: text.slice(1), images};
 safe(baseline, [article.claim_token || '']); return baseline;
}
// Same-browser download evidence authorizes one access attempt. It does not establish
// that the chooser can resolve this path; keep visibility false in the durable audit.
function fileEvidence(value:unknown,wordSha:string,wordSize:number):{filename:string;absolute_path:string;browser_session:string;sha256:string;size:number;checked_at:string;visible_in_browser:boolean;visibility_unproven?:boolean;handoff?:Record<string,unknown>}{
 const file=object(value);
 const filename = short(file.filename),absolutePath=short(file.absolute_path,1024),browserSession=short(file.browser_session,180);
 if(!absolutePath.startsWith('/')||absolutePath.split('/').includes('..')||absolutePath.split('/').pop()!==filename)throw Error('An absolute file path matching the named Word is required');
 if (!/\.docx$/i.test(filename) || filename.length <= 5 || /[\\/]/.test(filename) || file.sha256 !== wordSha || file.size !== wordSize) throw Error('Confirm the actual named .docx with matching SHA256 and size');
 const checkedAt=timestamp(file.checked_at),common={filename,absolute_path:absolutePath,browser_session:browserSession,sha256:wordSha,size:wordSize,checked_at:checkedAt};
 if(file.visible_in_browser===true){
  if(Object.prototype.hasOwnProperty.call(file,'handoff')||Object.prototype.hasOwnProperty.call(file,'visibility_unproven'))throw Error('Visible file evidence cannot contain an unproven download handoff');
  return {...common,visible_in_browser:true};
 }
 if(file.visible_in_browser!==false||file.visibility_unproven!==true)throw Error('Actual browser visibility or explicit same-browser download handoff required');
 if(Object.keys(file).some(key=>!['filename','absolute_path','browser_session','sha256','size','checked_at','visible_in_browser','visibility_unproven','handoff'].includes(key)))throw Error('Exact same-browser download handoff evidence required');
 const handoff=object(file.handoff),keys=['kind','download_path','download_browser_session','executor_id','source_sha256','source_size','verified_in_cua','copied_in_same_executor','chooser_prepared','chooser_prepared_at'];
 if(Object.keys(handoff).some(key=>!keys.includes(key))||keys.some(key=>!Object.prototype.hasOwnProperty.call(handoff,key)))throw Error('Exact same-browser download handoff evidence required');
 const downloadPath=short(handoff.download_path,1024),downloadSession=short(handoff.download_browser_session,180),executorId=short(handoff.executor_id,180),preparedAt=timestamp(handoff.chooser_prepared_at);
 if(!downloadPath.startsWith('/')||/[\\]/.test(downloadPath)||downloadPath.split('/').some(part=>part==='..'||part==='.')||!downloadPath.split('/').pop())throw Error('An actual absolute browser download path is required');
 if(handoff.kind!=='same_browser_download'||downloadSession!==browserSession||handoff.source_sha256!==wordSha||handoff.source_size!==wordSize||handoff.verified_in_cua!==true||handoff.copied_in_same_executor!==true||handoff.chooser_prepared!==true||Date.parse(preparedAt)+60000<Date.parse(checkedAt))throw Error('Fresh same-browser source bytes and a genuinely prepared chooser are required');
 return {...common,visible_in_browser:false,visibility_unproven:true,handoff:{kind:'same_browser_download',download_path:downloadPath,download_browser_session:downloadSession,executor_id:executorId,source_sha256:wordSha,source_size:wordSize,verified_in_cua:true,copied_in_same_executor:true,chooser_prepared:true,chooser_prepared_at:preparedAt}};
}
function preflight(value: unknown, destination: Platform, account: string, wordSha: string, wordSize: number) {
 const input = object(value), file = fileEvidence(input.file,wordSha,wordSize), check = object(input.existing_drafts);
 const currentEditor=observedEditorUrl(destination,check.current_editor_url);
 const checkedAt = timestamp(check.checked_at);
 if(!['never_attempted','submitted_unknown','verified_existing'].includes(String(check.prior_submission)))throw Error('Classify prior submission as never_attempted, submitted_unknown or verified_existing');
 if (check.account !== account || check.editor_checked !== true || check.draft_list_checked !== true || !Array.isArray(check.matching_editor_urls) || check.matching_editor_urls.length > 20) throw Error('Check the target account, current editor and draft list before reserving');
 const urls = check.matching_editor_urls.map(url => uploadEditorUrl(destination, url));
 return {file, existing_drafts: {account,current_editor_url:currentEditor,prior_submission:String(check.prior_submission),editor_checked: true, draft_list_checked: true, matching_editor_urls: urls, checked_at: checkedAt, ...(check.editor_empty===true?{editor_empty:true}:{}),...(check.private_draft===true?{private_draft:true}:{})}};
}
async function executionClaim(owner:string,article:Article,destination:Platform,value:unknown){
 if(typeof value!=='string'||value.length>100)throw Error('Current execution claim required');
 const claim=destination==='toutiao'?await db().prepare('SELECT claim_token,claim_expires FROM articles WHERE id=? AND owner=?').bind(article.id,owner).first<{claim_token:string;claim_expires:string}>():await db().prepare('SELECT claim_token,claim_expires FROM article_deliveries WHERE article_id=? AND owner=? AND platform=?').bind(article.id,owner,destination).first<{claim_token:string;claim_expires:string}>();
 if(!claim||claim.claim_token!==value||!Number.isFinite(Date.parse(claim.claim_expires))||Date.parse(claim.claim_expires)<=Date.now())throw Error('Current execution claim required');
 return value;
}
// This read confirms a point-in-time match to an already consumed chain. It never
// creates, renews or reissues permission: the parent must retain the original
// execute_import=true receipt and its unused, same-window submission ledger.
const currentAuthorizationKeys=['article_id','platform','execution_claim','attempt_id','target_account','word_sha256','word_size','consumed_at','expected_attempt_revision','consume_token'];
async function readCurrentUploadAuthorization(owner:string,articleId:string,args:Record<string,unknown>){
 const rejected=()=>({read_only:true,current:false,matches:false,execute_import:false,submission_permission_issued:false,reason:'current_upload_authorization_not_confirmed'});
 try{
  if(!args||typeof args!=='object'||Array.isArray(args))return rejected();
  const keys=Reflect.ownKeys(args),descriptors=Object.getOwnPropertyDescriptors(args);
  if(keys.some(key=>typeof key!=='string'||!currentAuthorizationKeys.includes(key)||!descriptors[key].enumerable||!Object.hasOwn(descriptors[key],'value'))
   ||currentAuthorizationKeys.filter(key=>key!=='consume_token').some(key=>!Object.hasOwn(descriptors,key)))return rejected();
  // Snapshot validated scalar data before digest awaits; caller-owned objects
  // and accessors cannot substitute scope or credentials while this read runs.
  args=Object.fromEntries(keys.map(key=>[key,descriptors[key as string].value]));
  const destination=args.platform,claim=args.execution_claim,consumeToken=args.consume_token;
  if(Object.keys(args).some(key=>!currentAuthorizationKeys.includes(key))||args.article_id!==articleId
   ||(destination!=='toutiao'&&destination!=='zhihu')||typeof claim!=='string'||!claim||claim.length>100
   ||typeof args.attempt_id!=='string'||!args.attempt_id||args.attempt_id.length>100
   ||args.target_account!==authorizedUploadAccounts[destination]
   ||typeof args.word_sha256!=='string'||!/^[a-f0-9]{64}$/.test(args.word_sha256)
   ||!Number.isSafeInteger(args.word_size)||(args.word_size as number)<1||(args.word_size as number)>MAX_FILE
   ||!Number.isSafeInteger(args.expected_attempt_revision)||(args.expected_attempt_revision as number)<0
   ||typeof args.consumed_at!=='string'||args.consumed_at.length>40
   ||!Number.isFinite(Date.parse(args.consumed_at))
   ||(Object.hasOwn(args,'consume_token')&&(typeof consumeToken!=='string'||!consumeToken||consumeToken.length>100)))return rejected();
  const claimHash=await hashClaim(claim),consumeHash=typeof consumeToken==='string'?await hashClaim(consumeToken):null;
  const checkedMs=Date.now(),checkedAt=new Date(checkedMs).toISOString(),consumedMs=Date.parse(args.consumed_at);
  if(consumedMs>checkedMs||consumedMs+60000<checkedMs)return rejected();
  // One SQL snapshot reads the live owner-scoped article, destination lease and
  // exact latest attempt together; the article passed into dispatch may be stale.
  // CASE protects corrupt metadata without exposing database error text.
  const found=await db().prepare(`SELECT u.revision,u.consumed_at,
   CASE WHEN u.platform='toutiao' THEN a.claim_expires ELSE d.claim_expires END AS lease_expires
   FROM article_upload_attempts u JOIN articles a ON a.id=u.article_id AND a.owner=u.owner
   LEFT JOIN article_deliveries d ON d.article_id=a.id AND d.owner=a.owner AND d.platform=u.platform
   WHERE u.owner=? AND u.article_id=? AND u.platform=? AND u.id=? AND u.target_account=?
   AND u.word_sha256=? AND u.word_size=? AND u.revision=? AND u.consumed_at=? AND u.claim_hash=?
   AND ((u.consume_token_sha256 IS NULL AND ? IS NULL) OR (u.consume_token_sha256 IS NOT NULL AND u.consume_token_sha256=?))
   AND u.authorization_kind IN ('new_word','owner_confirmed_never_submitted','unconsumed_continuation','owner_confirmed_reimport','owner_confirmed_legacy_reimport')
   AND u.state='outcome_unknown' AND u.editor_urls='[]' AND u.readback IS NULL
   AND a.state!='deleting' AND a.result_key IS NOT NULL AND a.result_key!='' AND a.upload_guard_version IN (0,1)
   AND (u.authorization_kind!='new_word' OR a.upload_guard_version=1)
   AND CASE WHEN json_valid(a.result_meta) THEN
    json_extract(a.result_meta,'$.sha256')=u.word_sha256 AND json_type(a.result_meta,'$.size')='integer'
    AND json_extract(a.result_meta,'$.size')=u.word_size AND json_type(a.result_meta,'$.output_id')='text'
    AND length(json_extract(a.result_meta,'$.output_id'))>0 ELSE 0 END
   AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner)
   AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=u.id)
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=u.id)
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts n WHERE n.owner=u.owner AND n.article_id=u.article_id AND n.platform=u.platform AND n.attempt_version>u.attempt_version)
   AND ((u.platform='toutiao' AND a.state='toutiao_saving' AND a.claim_token=? AND julianday(a.claim_expires)>julianday(?) AND a.draft_url IS NULL AND a.draft_readback IS NULL)
    OR (u.platform='zhihu' AND d.state='saving' AND d.claim_token=? AND julianday(d.claim_expires)>julianday(?) AND d.draft_url IS NULL AND d.readback IS NULL))`)
   .bind(owner,articleId,destination,args.attempt_id,args.target_account,args.word_sha256,args.word_size,args.expected_attempt_revision,args.consumed_at,claimHash,consumeHash,consumeHash,claim,checkedAt,claim,checkedAt)
   .first<{revision:number;consumed_at:string;lease_expires:string}>();
  const verifiedMs=Date.now(),verifiedAt=new Date(verifiedMs).toISOString(),expires=found?Date.parse(found.lease_expires):NaN;
  // A delayed database response cannot extend either original deadline. This
  // does not lock a lease or certify future facts after the snapshot was read.
  if(!found||verifiedMs<checkedMs||!Number.isFinite(expires)||expires<=verifiedMs||consumedMs>verifiedMs||consumedMs+60000<verifiedMs)return rejected();
  return {read_only:true,current:true,matches:true,execute_import:false,submission_permission_issued:false,
   article_id:articleId,platform:destination,attempt_id:args.attempt_id,target_account:args.target_account,
   word_sha256:args.word_sha256,word_size:args.word_size,revision:found.revision,consumed_at:found.consumed_at,
   observed_at:checkedAt,checked_at:checkedAt,verified_at:verifiedAt,lease_expires:found.lease_expires,
   valid_until:new Date(Math.min(expires,consumedMs+60000)).toISOString()};
 }catch{return rejected();}
}
// Existing source bytes and generated-run lineage identify a manual upload; an absent run alone does not.
// This is the createArticle intake path, not a new caller-controlled provenance assertion.
function manualSourceFence(a:string){return `${a}.source_key='articles/'||${a}.id||'/source'
 AND NOT EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
 AND NOT EXISTS(SELECT 1 FROM editorial_runs_v3 w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
 AND NOT EXISTS(SELECT 1 FROM editorial_flows w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)
 AND NOT EXISTS(SELECT 1 FROM outline_flows w WHERE w.owner=${a}.owner AND w.article_id=${a}.id)`;}
async function assertManualSource(owner:string,article:Article){
 const source=await db().prepare(`SELECT source_key FROM articles a WHERE a.id=? AND a.owner=? AND ${manualSourceFence('a')}`).bind(article.id,owner).first<{source_key:string}>();
 if(!source||!await bucket().head(source.source_key))throw Error('Reimport requires verified manual-upload source');
 return source.source_key;
}
const attemptColumns=['id','revision','owner','article_id','platform','target_account','word_sha256','word_size','authorization_kind','claim_hash','preflight','baseline','state','editor_urls','readback','created','consumed_at','updated','attempt_version','previous_attempt_id','authorization_key','reimport_authorization','consume_token_sha256','confirmation_message_id'] as const;
function attemptSnapshot(a:Attempt){return JSON.stringify(Object.fromEntries(attemptColumns.map(c=>[c,a[c]])));}
function attemptFence(alias:string,a:Attempt,bindings:unknown[]){return attemptColumns.map(c=>{bindings.push(a[c]);return `${alias}.${c} IS ?`;}).join(' AND ');}
type ExecutorEnd={attempt_id:string;owner:string;article_id:string;platform:Platform;attempt_sha256:string;attempt_snapshot:string;claim_sha256:string;execution_end_reference:string;created:string};
async function executorEnd(owner:string,id:string){return db().prepare('SELECT * FROM article_upload_executor_ends WHERE owner=? AND attempt_id=?').bind(owner,id).first<ExecutorEnd>();}
// Official compatibility input for clients whose cached schema still requires this string.
// Exactly "" means unknown identity, never a URL. It grants no authorization or reset.
async function normalizeLegacyUnknownUrl(owner:string,article:Article,destination:Platform,name:string,args:Record<string,unknown>){
 if(args.existing_editor_url!==''||(name!=='record_article_upload_executor_end'&&!(name==='reserve_article_upload'&&args.mode==='owner_confirmed_reimport')))return args;
 if(args.prior_draft_identity!==undefined&&args.prior_draft_identity!=='unknown_without_editor_url')throw Error('Empty prior URL is incompatible with a known draft identity');
 const normalized:Record<string,unknown>={...args,prior_draft_identity:'unknown_without_editor_url'};delete normalized.existing_editor_url;
 // Old clients have no task field. Supply only a deterministic owner/article/platform audit
 // reference for exact one-off approval; never infer or enable standing duplicate approval.
 if(name==='reserve_article_upload'&&args.current_task_id===undefined&&(args.authorization_scope===undefined||args.authorization_scope==='exact_reimport'))normalized.current_task_id='manual-task-'+await hashClaim(JSON.stringify({owner,article_id:article.id,platform:destination}));
 return normalized;
}
// Unknown identities stay unknown. Never substitute a blank editor URL for a saved draft identity.
function priorDraftIdentity(args:Record<string,unknown>){
 const identity=args.prior_draft_identity??'known_editor_url';
 if(identity!=='known_editor_url'&&identity!=='unknown_without_editor_url')throw Error('Invalid prior draft identity');
 return identity;
}
async function priorDraftUrl(owner:string,article:Article,destination:Platform,previous:Attempt,args:Record<string,unknown>){
 const identity=priorDraftIdentity(args),urls:string[]=JSON.parse(previous.editor_urls);
 if(identity==='known_editor_url'){
  const url=uploadEditorUrl(destination,args.existing_editor_url);
  if(!urls.includes(url))throw Error('Exact retained editor URL required');
  return url;
 }
 if(args.existing_editor_url!==undefined&&args.existing_editor_url!==null)throw Error('Unknown prior draft must not invent an editor URL');
 const delivery=destination==='zhihu'?await db().prepare('SELECT draft_url,readback FROM article_deliveries WHERE owner=? AND article_id=? AND platform=?').bind(owner,article.id,destination).first<{draft_url:string|null;readback:string|null}>():null;
 if(previous.state!=='outcome_unknown'||urls.length||previous.readback||(destination==='toutiao'?(article.draft_url||article.draft_readback):(delivery?.draft_url||delivery?.readback)))throw Error('Unknown-without-URL requires an unchanged unknown attempt with no recorded draft identity or readback');
 return null;
}
async function recordExecutorEnd(owner:string,article:Article,destination:Platform,previous:Attempt|null,args:Record<string,unknown>,suppliedClaim:unknown){
 if(!previous||args.attempt_id!==previous.id||!previous.consumed_at||previous.state==='reserved')throw Error('Matching consumed upload attempt required for executor end');
 await priorDraftUrl(owner,article,destination,previous,args);const reference=short(args.prior_executor_end_reference);
 if(args.prior_executor_stopped!==true||args.target_account!==previous.target_account||args.word_sha256!==previous.word_sha256||args.word_size!==previous.word_size||args.expected_attempt_revision!==previous.revision)throw Error('Exact ended-executor acknowledgement required');
 const snapshot=attemptSnapshot(previous),fingerprint=await hashClaim(snapshot),existing=await executorEnd(owner,previous.id);
 if(existing){if(existing.attempt_sha256!==fingerprint||existing.execution_end_reference!==reference)throw Error('Executor end acknowledgement changed');return {recorded:true,cached:true,execute_import:false,attempt:publicAttempt(previous),executor_end_reference:reference};}
 const claim=await executionClaim(owner,article,destination,suppliedClaim),created=now(),bindings:unknown[]=[];
 const fence=attemptFence('p',previous,bindings);
 const result=await db().prepare(`INSERT OR IGNORE INTO article_upload_executor_ends(attempt_id,owner,article_id,platform,attempt_sha256,attempt_snapshot,claim_sha256,execution_end_reference,created)
  SELECT ?,?,?,?,?,?,?,?,? FROM article_upload_attempts p JOIN articles a ON a.id=p.article_id AND a.owner=p.owner
  WHERE ${fence} AND a.state!='deleting' AND a.result_key=? AND a.result_meta=? AND a.draft_url IS ? AND a.draft_readback IS ?
  AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=p.id)
  AND ((p.platform='toutiao' AND a.claim_token=? AND a.claim_expires>?) OR (p.platform='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform=p.platform AND d.claim_token=? AND d.claim_expires>? AND (?='known_editor_url' OR (d.draft_url IS NULL AND d.readback IS NULL)))))`)
  .bind(previous.id,owner,article.id,destination,fingerprint,snapshot,await hashClaim(claim),reference,created,...bindings,article.result_key,article.result_meta,article.draft_url,article.draft_readback||null,claim,created,claim,created,priorDraftIdentity(args)).run();
 const ended=await executorEnd(owner,previous.id);
 if(!ended||ended.attempt_sha256!==fingerprint||ended.execution_end_reference!==reference)throw Error('Attempt changed before executor end; reread without writing');
 return {recorded:true,cached:!result.meta.changes,execute_import:false,attempt:publicAttempt(previous),executor_end_reference:reference,limitation:'Executor acknowledgement, not server proof of browser termination. This attempt is now immutable.'};
}
function blankEditorUrl(destination:Platform){return destination==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish':'https://zhuanlan.zhihu.com/write';}
function validateBlankEditor(value:unknown,destination:Platform,account:string){const v=object(value);if(v.target_account!==account||v.current_editor_url!==blankEditorUrl(destination)||v.editor_empty!==true||v.private_draft!==true)throw Error('Reimport requires a new empty private editor in the same account');timestamp(v.checked_at);}
function legacyReimportRequest(article:Article,destination:Platform,args:Record<string,unknown>){
 if(Object.hasOwn(args,'reserved_upload_guard_version'))throw Error('Upload guard snapshot is server-generated and cannot be supplied');
 if(args.expected_attempt_id!==null||args.confirm_unrecorded_history!==true||Object.hasOwn(args,'previous_attempt_id'))throw Error('Legacy reimport requires explicit unknown history and no recorded attempt');
 if(args.confirm_reimport!==true||args.confirm_new_draft!==true||args.preserve_existing_draft!==true||args.prior_executor_stopped!==true)throw Error('Explicit owner confirmation of exact new private-draft reimport required');
 const account=short(args.target_account),identity=priorDraftIdentity(args),scope=args.authorization_scope??'exact_reimport';
 if(account!==authorizedUploadAccounts[destination])throw Error('Destination account is outside the authorized Haoduoyu upload scope');
 if(scope!=='exact_reimport'&&scope!=='duplicate_tolerant_task')throw Error('Invalid owner reimport authorization scope');
 if(scope==='duplicate_tolerant_task'&&args.confirm_duplicate_tolerant_task!==true)throw Error('Explicit owner authorization for duplicate-tolerant manual task required');
 if(args.current_word_sha256!==args.word_sha256||!/^[a-f0-9]{64}$/.test(String(args.current_word_sha256))||!Number.isSafeInteger(args.word_size))throw Error('Word SHA256 or size does not match the stored output');
 if(identity==='unknown_without_editor_url'&&Object.hasOwn(args,'existing_editor_url'))throw Error('Unknown prior draft must not invent an editor URL');
 return {article_id:article.id,platform:destination,expected_attempt_id:null,confirm_unrecorded_history:true,prior_history:'untracked_unknown',prior_draft_identity:identity,existing_editor_url:identity==='known_editor_url'?uploadEditorUrl(destination,args.existing_editor_url):null,authorization_scope:scope,current_task_id:short(args.current_task_id),current_word_sha256:String(args.current_word_sha256),word_size:Number(args.word_size),target_account:account,authorization_key:short(args.authorization_key),confirmation_message_id:short(args.confirmation_message_id),prior_executor_end_reference:short(args.prior_executor_end_reference),confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true,prior_executor_stopped:true,...(scope==='duplicate_tolerant_task'?{confirm_duplicate_tolerant_task:true}:{})};
}
async function reserveLegacyReimport(owner:string,article:Article,destination:Platform,previous:Attempt|null,args:Record<string,unknown>,suppliedClaim:unknown){
 const request=legacyReimportRequest(article,destination,args),requestSha=await hashClaim(JSON.stringify(request));
 const replay=await db().prepare("SELECT * FROM article_upload_attempts WHERE owner=? AND (authorization_key=? OR (?='exact_reimport' AND article_id=? AND platform=? AND confirmation_message_id=?)) ORDER BY attempt_version DESC LIMIT 1").bind(owner,request.authorization_key,request.authorization_scope,article.id,destination,request.confirmation_message_id).first<Attempt>();
 if(replay){const auth=replay.reimport_authorization?JSON.parse(replay.reimport_authorization):null;if(replay.authorization_kind!=='owner_confirmed_legacy_reimport'||auth?.request_sha256!==requestSha)throw Error('Reimport authorization is already bound to another request');return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(replay)};}
 const reservedGuard=article.upload_guard_version;
 if(previous||!Number.isInteger(reservedGuard)||(reservedGuard!==0&&reservedGuard!==1))throw Error('Legacy reimport requires a supported upload guard and no recorded upload attempt');
 const oldClaim=await executionClaim(owner,article,destination,suppliedClaim),sourceKey=await assertManualSource(owner,article),baseline=await wordBaseline(article,request.current_word_sha256,request.word_size);
 if(await unsafeEvidence(owner,baseline))throw Error('Word evidence contains unsafe credential content; nothing saved');
 const checked=preflight(args.preflight,destination,request.target_account,request.current_word_sha256,request.word_size);
 validateBlankEditor({...checked.existing_drafts,target_account:request.target_account},destination,request.target_account);
 if(checked.existing_drafts.prior_submission!=='submitted_unknown')throw Error('Legacy historical submission must remain submitted_unknown');
 const delivery=destination==='zhihu'?await db().prepare('SELECT state,draft_url,readback,claim_token,claim_expires FROM article_deliveries WHERE owner=? AND article_id=? AND platform=?').bind(owner,article.id,destination).first<{state:string;draft_url:string|null;readback:string|null;claim_token:string;claim_expires:string}>():null;
 const oldState=destination==='toutiao'?article.state:delivery?.state,oldUrl=destination==='toutiao'?article.draft_url:delivery?.draft_url,oldReadback=destination==='toutiao'?article.draft_readback:delivery?.readback;
 if(!(destination==='toutiao'?['word_ready','needs_verification','needs_login','failed','toutiao_saving']:['pending','needs_verification','needs_login','failed','saving']).includes(String(oldState)))throw Error('Current destination changed or is terminal; reimport denied');
 const retained=[...new Set([...checked.existing_drafts.matching_editor_urls,...(oldUrl?[uploadEditorUrl(destination,oldUrl)]:[])])];
 if(oldUrl&&!checked.existing_drafts.matching_editor_urls.includes(oldUrl)||request.existing_editor_url&&!checked.existing_drafts.matching_editor_urls.includes(request.existing_editor_url)||request.prior_draft_identity==='unknown_without_editor_url'&&retained.length)throw Error('Retain the old submission and existing draft in reimport preflight');
 const id=crypto.randomUUID(),claim=crypto.randomUUID(),consumeToken=crypto.randomUUID(),created=now(),expires=new Date(Date.now()+6*3600000).toISOString(),claimHash=await hashClaim(claim);
 const auth={request_sha256:requestSha,request,reserved_upload_guard_version:reservedGuard,prior_history:'untracked_unknown',source_key:sourceKey,retained_editor_urls:retained,retained_destination_url:oldUrl||null,retained_destination_readback:oldReadback||null,executor_end_reference:request.prior_executor_end_reference,audit_kind:'authenticated_owner_attestation_not_chat_signature',executor_end_attestation_only:true};
 await rememberArticleClaimHashes(owner,oldClaim,claim,consumeToken);
 const insert=db().prepare(`INSERT OR IGNORE INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated,attempt_version,previous_attempt_id,authorization_key,reimport_authorization,consume_token_sha256,confirmation_message_id)
  SELECT ?,?,?,?,?,?,?,'owner_confirmed_legacy_reimport',?,?,?,'reserved','[]',?,?,1,NULL,?,?,?,? FROM articles a
  WHERE a.id=? AND a.owner=? AND a.upload_guard_version=? AND a.state=? AND a.result_key=? AND a.result_meta=? AND a.paragraphs=? AND a.artifact_manifest IS ? AND a.draft_url IS ? AND a.draft_readback IS ? AND a.source_key=? AND ${manualSourceFence('a')}
  AND NOT EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.owner=a.owner AND u.article_id=a.id AND u.platform=?)
  AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner)
  AND ((?='toutiao' AND a.claim_token=? AND a.claim_expires>?) OR (?='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu' AND d.claim_token=? AND d.claim_expires>? AND d.state=? AND d.draft_url IS ? AND d.readback IS ?)))`)
  .bind(id,owner,article.id,destination,request.target_account,request.current_word_sha256,request.word_size,claimHash,JSON.stringify(checked),JSON.stringify(baseline),created,created,request.authorization_key,JSON.stringify(auth),await hashClaim(consumeToken),request.confirmation_message_id,article.id,owner,reservedGuard,article.state,article.result_key,article.result_meta,article.paragraphs,article.artifact_manifest,article.draft_url,article.draft_readback||null,sourceKey,destination,destination,oldClaim,created,destination,oldClaim,created,oldState,oldUrl||null,oldReadback||null);
 const rotate=destination==='toutiao'?db().prepare(`UPDATE articles SET claim_token=?,claim_expires=?,state='needs_verification' WHERE id=? AND owner=? AND claim_token=? AND claim_expires>? AND EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.id=? AND u.owner=articles.owner AND u.article_id=articles.id AND u.claim_hash=?)`).bind(claim,expires,article.id,owner,oldClaim,created,id,claimHash):db().prepare(`UPDATE article_deliveries SET claim_token=?,claim_expires=?,state='needs_verification',updated=? WHERE article_id=? AND owner=? AND platform='zhihu' AND claim_token=? AND claim_expires>? AND EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.id=? AND u.owner=article_deliveries.owner AND u.article_id=article_deliveries.article_id AND u.claim_hash=?)`).bind(claim,expires,created,article.id,owner,oldClaim,created,id,claimHash);
 const [allocated,rotated]=await db().batch([insert,rotate]),current=await row(owner,article.id,destination);
 if(!allocated.meta.changes){if(current?.authorization_kind==='owner_confirmed_legacy_reimport'&&JSON.parse(current.reimport_authorization!).request_sha256===requestSha)return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(current)};throw Error('Legacy upload history or authorization changed; reread without importing');}
 if(!rotated.meta.changes||current?.id!==id)throw Error('Reimport lease rotation was not confirmed; read existing attempt only');
 return {reserved:true,execute_import:false,attempt:publicAttempt(current),execution_claim:claim,consume_token:consumeToken,expires,legacy_reimport_permission_ready:true,prior_history:'untracked_unknown',old_draft_preserved:true,instruction:'Consume this new root once before one file submission. Historical submission remains unknown; no prior attempt or consumption was invented.'};
}
function legacyReimportConsumeFence(a:string,u:string){return `${manualSourceFence(a)}
 AND ((json_type(${u}.reimport_authorization,'$.reserved_upload_guard_version') IS NULL AND ${a}.upload_guard_version=0)
 OR (json_type(${u}.reimport_authorization,'$.reserved_upload_guard_version')='integer' AND json_extract(${u}.reimport_authorization,'$.reserved_upload_guard_version') IN (0,1) AND ${a}.upload_guard_version=json_extract(${u}.reimport_authorization,'$.reserved_upload_guard_version')))
 AND ${a}.source_key=json_extract(${u}.reimport_authorization,'$.source_key') AND ${u}.previous_attempt_id IS NULL AND ${u}.attempt_version=1
 AND json_extract(${u}.reimport_authorization,'$.prior_history')='untracked_unknown'
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts other WHERE other.owner=${u}.owner AND other.article_id=${u}.article_id AND other.platform=${u}.platform AND other.id!=${u}.id)
 AND ((${u}.platform='toutiao' AND ${a}.state='needs_verification' AND ${a}.draft_url IS json_extract(${u}.reimport_authorization,'$.retained_destination_url') AND ${a}.draft_readback IS json_extract(${u}.reimport_authorization,'$.retained_destination_readback'))
 OR (${u}.platform='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.owner=${a}.owner AND d.article_id=${a}.id AND d.platform='zhihu' AND d.state='needs_verification' AND d.draft_url IS json_extract(${u}.reimport_authorization,'$.retained_destination_url') AND d.readback IS json_extract(${u}.reimport_authorization,'$.retained_destination_readback'))))`;}
async function verifyLegacyReimportLineage(owner:string,article:Article,attempt:Attempt){
 const auth=attempt.reimport_authorization?JSON.parse(attempt.reimport_authorization):null,source=await assertManualSource(owner,article);
 // Existing guard-zero roots predate this server-owned snapshot. Missing means
 // zero only; null, strings, booleans and unsupported integers never authorize.
 const reservedGuard=auth&&Object.hasOwn(auth,'reserved_upload_guard_version')?auth.reserved_upload_guard_version:0;
 if(!Number.isInteger(reservedGuard)||(reservedGuard!==0&&reservedGuard!==1)||article.upload_guard_version!==reservedGuard||attempt.previous_attempt_id!==null||attempt.attempt_version!==1||auth?.prior_history!=='untracked_unknown'||auth.source_key!==source||!auth.request||auth.request.expected_attempt_id!==null||auth.request.confirm_unrecorded_history!==true||auth.request.current_word_sha256!==attempt.word_sha256||auth.request.word_size!==attempt.word_size||auth.request.target_account!==attempt.target_account||await hashClaim(JSON.stringify(auth.request))!==auth.request_sha256)throw Error('Legacy upload history or authorization changed; reread without importing');
}
function reimportRequest(article:Article,destination:Platform,args:Record<string,unknown>){
 if(args.confirm_reimport!==true||args.confirm_new_draft!==true||args.preserve_existing_draft!==true||args.prior_executor_stopped!==true)throw Error('Explicit owner confirmation of exact new private-draft reimport required');
 const account=short(args.target_account),identity=priorDraftIdentity(args),url=identity==='known_editor_url'?uploadEditorUrl(destination,args.existing_editor_url):null;
 if(identity==='unknown_without_editor_url'&&args.existing_editor_url!==undefined&&args.existing_editor_url!==null)throw Error('Unknown prior draft must not invent an editor URL');
 const scope=args.authorization_scope??'exact_reimport';
 if(scope!=='exact_reimport'&&scope!=='duplicate_tolerant_task')throw Error('Invalid owner reimport authorization scope');
 const task=scope==='duplicate_tolerant_task'||identity==='unknown_without_editor_url'?short(args.current_task_id):args.current_task_id===undefined?null:short(args.current_task_id);
 if(scope==='duplicate_tolerant_task'&&args.confirm_duplicate_tolerant_task!==true)throw Error('Explicit owner authorization for duplicate-tolerant manual task required');
 if(account!==authorizedUploadAccounts[destination])throw Error('Destination account is outside the authorized Haoduoyu upload scope');
 if(typeof args.previous_attempt_id!=='string'||!/^[0-9a-f-]{36}$/.test(args.previous_attempt_id)||args.current_word_sha256!==args.word_sha256||!/^[a-f0-9]{64}$/.test(String(args.current_word_sha256))||!Number.isSafeInteger(args.word_size))throw Error('Exact previous attempt and current Word required');
 return {article_id:article.id,platform:destination,previous_attempt_id:args.previous_attempt_id,existing_editor_url:url,prior_draft_identity:identity,authorization_scope:scope,current_task_id:task,...(scope==='duplicate_tolerant_task'?{confirm_duplicate_tolerant_task:true}:{}),current_word_sha256:args.current_word_sha256,word_size:args.word_size,target_account:account,authorization_key:short(args.authorization_key),confirmation_message_id:short(args.confirmation_message_id),prior_executor_end_reference:short(args.prior_executor_end_reference),confirm_reimport:true,confirm_new_draft:true,preserve_existing_draft:true,prior_executor_stopped:true};
}
function sameReimportRequest(auth:Record<string,unknown>|null,request:ReturnType<typeof reimportRequest>,requestSha:string){
 if(!auth)return false;
 if(auth.request_sha256===requestSha)return true;
 // Preserve idempotent reads for known-URL exact approvals created by the previous deployment.
 if(request.authorization_scope!=='exact_reimport'||request.prior_draft_identity!=='known_editor_url'||request.current_task_id!==null)return false;
 const {prior_draft_identity,authorization_scope,current_task_id,...legacy}=request;
 return JSON.stringify(auth.request)===JSON.stringify(legacy);
}
async function reserveOwnerReimport(owner:string,article:Article,destination:Platform,previous:Attempt|null,args:Record<string,unknown>,suppliedClaim:unknown){
 const request=reimportRequest(article,destination,args),requestSha=await hashClaim(JSON.stringify(request));
 // Replay returns the originally allocated attempt, including after an unknown result, never its secrets.
 const cached=await db().prepare("SELECT * FROM article_upload_attempts WHERE owner=? AND (authorization_key=? OR previous_attempt_id=? OR (?='exact_reimport' AND article_id=? AND platform=? AND confirmation_message_id=?)) ORDER BY attempt_version DESC LIMIT 1").bind(owner,request.authorization_key,request.previous_attempt_id,request.authorization_scope,article.id,destination,request.confirmation_message_id).first<Attempt>();
 if(cached){const auth=cached.reimport_authorization?JSON.parse(cached.reimport_authorization):null;if(!sameReimportRequest(auth,request,requestSha)||cached.article_id!==article.id||cached.platform!==destination)throw Error('Reimport authorization is already bound to another request');return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(cached)};}
 if(!previous||previous.id!==request.previous_attempt_id||!previous.consumed_at||previous.state==='reserved'||previous.target_account!==request.target_account||previous.word_sha256!==request.current_word_sha256||previous.word_size!==request.word_size)throw Error('Reimport scope differs from the exact consumed attempt');
 await priorDraftUrl(owner,article,destination,previous,args);
 if(request.authorization_scope==='duplicate_tolerant_task'){
  const grants=await db().prepare('SELECT reimport_authorization FROM article_upload_attempts WHERE owner=? AND article_id=? AND platform=? AND confirmation_message_id=?').bind(owner,article.id,destination,request.confirmation_message_id).all<{reimport_authorization:string|null}>();
  for(const grant of grants.results){const prior=grant.reimport_authorization?JSON.parse(grant.reimport_authorization).request:null;if(!prior||prior.authorization_scope!=='duplicate_tolerant_task'||prior.current_task_id!==request.current_task_id||prior.target_account!==request.target_account||prior.current_word_sha256!==request.current_word_sha256||prior.word_size!==request.word_size)throw Error('Duplicate-tolerant approval is bound to another manual task or frozen Word');}
 }
 const ended=await executorEnd(owner,previous.id),snapshot=attemptSnapshot(previous),fingerprint=await hashClaim(snapshot);
 if(!ended||ended.attempt_sha256!==fingerprint||ended.attempt_snapshot!==snapshot||ended.execution_end_reference!==request.prior_executor_end_reference)throw Error('Prior executor end acknowledgement required');
 let oldClaim:string;
 try{oldClaim=await executionClaim(owner,article,destination,suppliedClaim);}catch(error){const replay=await db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND authorization_key=?').bind(owner,request.authorization_key).first<Attempt>();if(replay?.reimport_authorization&&sameReimportRequest(JSON.parse(replay.reimport_authorization),request,requestSha))return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(replay)};throw error;}
 const sourceKey=await assertManualSource(owner,article);
 const baseline=await wordBaseline(article,request.current_word_sha256,request.word_size);
 if(JSON.stringify(baseline)!==previous.baseline)throw Error('Reimport baseline differs from the frozen original Word');
 if(await unsafeEvidence(owner,baseline))throw Error('Word evidence contains unsafe credential content; nothing saved');
 const checked=preflight(args.preflight,destination,request.target_account,String(request.current_word_sha256),Number(request.word_size));
 validateBlankEditor({...checked.existing_drafts,target_account:request.target_account},destination,request.target_account);
 if(checked.existing_drafts.prior_submission==='never_attempted'||(request.existing_editor_url!==null&&!checked.existing_drafts.matching_editor_urls.includes(request.existing_editor_url)))throw Error('Retain the old submission and existing draft in reimport preflight');
 const delivery=destination==='zhihu'?await db().prepare('SELECT state,draft_url,readback,claim_token,claim_expires FROM article_deliveries WHERE owner=? AND article_id=? AND platform=?').bind(owner,article.id,destination).first<{state:string;draft_url:string|null;readback:string|null;claim_token:string;claim_expires:string}>():null;
 const oldState=destination==='toutiao'?article.state:delivery?.state,oldUrl=destination==='toutiao'?article.draft_url:delivery?.draft_url;
 if(!['word_ready','needs_verification','needs_login','toutiao_saving','saving'].includes(String(oldState))||oldUrl&&oldUrl!==request.existing_editor_url)throw Error('Current destination changed or is terminal; reimport denied');
 const id=crypto.randomUUID(),claim=crypto.randomUUID(),consumeToken=crypto.randomUUID(),created=now(),expires=new Date(Date.now()+6*3600000).toISOString();
 const retainedUrls=await priorEditorUrls(owner,article.id,destination,previous.attempt_version+1);
 if(retainedUrls.some(url=>!checked.existing_drafts.matching_editor_urls.includes(url)))throw Error('Reimport preflight must retain every historical draft URL');
 const auth={retained_editor_urls:[...new Set([...retainedUrls,...checked.existing_drafts.matching_editor_urls])],request_sha256:requestSha,request,source_key:sourceKey,previous_attempt_sha256:fingerprint,existing_editor_url:request.existing_editor_url,executor_end_reference:ended.execution_end_reference,executor_end_created:ended.created,audit_kind:'authenticated_owner_attestation_not_chat_signature',retained_destination_url:oldUrl||null};
 await rememberArticleClaimHashes(owner,oldClaim,claim,consumeToken);
 const bindings:unknown[]=[],fence=attemptFence('p',previous,bindings);
 const insert=db().prepare(`INSERT OR IGNORE INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated,attempt_version,previous_attempt_id,authorization_key,reimport_authorization,consume_token_sha256,confirmation_message_id)
  SELECT ?,?,?,?,?,?,?,'owner_confirmed_reimport',?,?,?,'reserved','[]',?,?,?,?,?,?,?,? FROM articles a JOIN article_upload_attempts p ON p.owner=a.owner AND p.article_id=a.id JOIN article_upload_executor_ends e ON e.attempt_id=p.id
  WHERE ${fence} AND e.attempt_sha256=? AND e.attempt_snapshot=? AND e.execution_end_reference=?
  AND a.id=? AND a.owner=? AND a.state=? AND a.result_key=? AND a.result_meta=? AND a.paragraphs=? AND a.artifact_manifest IS ? AND a.draft_url IS ? AND a.draft_readback IS ? AND ${manualSourceFence('a')}
  AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner)
  AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=p.id)
  AND ((p.platform='toutiao' AND a.claim_token=? AND a.claim_expires>?) OR (p.platform='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform=p.platform AND d.claim_token=? AND d.claim_expires>? AND d.state=? AND d.draft_url IS ? AND d.readback IS ?)))`)
  .bind(id,owner,article.id,destination,request.target_account,request.current_word_sha256,request.word_size,await hashClaim(claim),JSON.stringify(checked),previous.baseline,created,created,previous.attempt_version+1,previous.id,request.authorization_key,JSON.stringify(auth),await hashClaim(consumeToken),request.confirmation_message_id,...bindings,fingerprint,snapshot,ended.execution_end_reference,article.id,owner,article.state,article.result_key,article.result_meta,article.paragraphs,article.artifact_manifest,article.draft_url,article.draft_readback||null,oldClaim,created,oldClaim,created,oldState,oldUrl||null,delivery?.readback||null);
 const rotate=destination==='toutiao'?db().prepare(`UPDATE articles SET claim_token=?,claim_expires=?,state='needs_verification' WHERE id=? AND owner=? AND claim_token=? AND claim_expires>? AND EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.id=? AND u.owner=articles.owner AND u.article_id=articles.id AND u.claim_hash=?)`).bind(claim,expires,article.id,owner,oldClaim,created,id,await hashClaim(claim)):db().prepare(`UPDATE article_deliveries SET claim_token=?,claim_expires=?,state='needs_verification',updated=? WHERE article_id=? AND owner=? AND platform=? AND claim_token=? AND claim_expires>? AND EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.id=? AND u.owner=article_deliveries.owner AND u.article_id=article_deliveries.article_id AND u.claim_hash=?)`).bind(claim,expires,created,article.id,owner,destination,oldClaim,created,id,await hashClaim(claim));
 const [allocated,rotated]=await db().batch([insert,rotate]);
 const current=await row(owner,article.id,destination);
 if(!allocated.meta.changes){if(current?.reimport_authorization&&sameReimportRequest(JSON.parse(current.reimport_authorization),request,requestSha))return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(current)};throw Error('Reimport scope changed during reservation; reread without importing');}
 if(!rotated.meta.changes||current?.id!==id)throw Error('Reimport lease rotation was not confirmed; read existing attempt only');
 return {reserved:true,execute_import:false,attempt:publicAttempt(current),execution_claim:claim,consume_token:consumeToken,expires,old_attempt_preserved:true,old_draft_preserved:true,instruction:'Only consume the new attempt/token immediately before one file submission in a new empty private editor. Never reuse old grants or overwrite the existing draft.'};
}
function reimportConsumeFence(a:string,u:string){return `${manualSourceFence(a)} AND ${a}.source_key=json_extract(${u}.reimport_authorization,'$.source_key') AND (${u}.platform!='toutiao' OR ${a}.state='needs_verification')
 AND (${u}.platform!='toutiao' OR ${a}.draft_url IS json_extract(${u}.reimport_authorization,'$.retained_destination_url'))
 AND EXISTS(SELECT 1 FROM article_upload_attempts p JOIN article_upload_executor_ends e ON e.attempt_id=p.id WHERE p.id=${u}.previous_attempt_id AND p.owner=${u}.owner AND p.article_id=${u}.article_id AND p.platform=${u}.platform AND p.target_account=${u}.target_account AND p.word_sha256=${u}.word_sha256 AND p.word_size=${u}.word_size AND p.attempt_version+1=${u}.attempt_version AND e.attempt_sha256=json_extract(${u}.reimport_authorization,'$.previous_attempt_sha256') AND e.execution_end_reference=json_extract(${u}.reimport_authorization,'$.executor_end_reference'))
 AND (${u}.platform!='zhihu' OR EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=${a}.id AND d.owner=${a}.owner AND d.platform='zhihu' AND d.state='needs_verification' AND d.draft_url IS json_extract(${u}.reimport_authorization,'$.retained_destination_url')))`;}
async function priorEditorUrls(owner:string,id:string,destination:Platform,beforeVersion:number){const rows=await db().prepare('SELECT editor_urls,reimport_authorization FROM article_upload_attempts WHERE owner=? AND article_id=? AND platform=? AND attempt_version<? ORDER BY attempt_version').bind(owner,id,destination,beforeVersion).all<{editor_urls:string;reimport_authorization:string|null}>();return [...new Set(rows.results.flatMap(r=>[...(JSON.parse(r.editor_urls) as string[]),...(r.reimport_authorization?JSON.parse(r.reimport_authorization).retained_editor_urls as string[]:[])]))];}
async function verifyReimportLineage(owner:string,article:Article,attempt:Attempt){
 const auth=attempt.reimport_authorization?JSON.parse(attempt.reimport_authorization):null;
 const source=await assertManualSource(owner,article),prior=await db().prepare('SELECT * FROM article_upload_attempts WHERE id=? AND owner=? AND article_id=? AND platform=?').bind(attempt.previous_attempt_id,owner,article.id,attempt.platform).first<Attempt>();
 const ended=prior?await executorEnd(owner,prior.id):null,retained=await priorEditorUrls(owner,article.id,attempt.platform,attempt.attempt_version);
 if(!auth||!Array.isArray(auth.retained_editor_urls)||retained.some(url=>!auth.retained_editor_urls.includes(url))||source!==auth.source_key||!prior||!ended||ended.attempt_sha256!==auth.previous_attempt_sha256||ended.attempt_snapshot!==attemptSnapshot(prior)||await hashClaim(attemptSnapshot(prior))!==auth.previous_attempt_sha256||ended.execution_end_reference!==auth.executor_end_reference||prior.target_account!==attempt.target_account||prior.word_sha256!==attempt.word_sha256||prior.word_size!==attempt.word_size||prior.attempt_version+1!==attempt.attempt_version)throw Error('Reimport lineage changed; read existing attempts only');
}

// Exact unconsumed handoff. Never convert an unknown/consumed attempt to reserved.
const continuationKinds=['new_word','owner_confirmed_never_submitted','owner_confirmed_reimport','owner_confirmed_legacy_reimport','unconsumed_continuation'];
const artifactColumns=['state','source_key','result_key','result_meta','paragraphs','artifact_manifest','draft_url','draft_readback','upload_guard_version'] as const;
const destinationColumns=['id','state','claim_token','claim_expires','draft_url','readback','message','updated'] as const;
async function continuationContext(owner:string,article:Article,destination:Platform,parent:Attempt|null){
 if(!parent||parent.state!=='reserved'||parent.consumed_at!==null||parent.editor_urls!=='[]'||parent.readback!==null||!continuationKinds.includes(parent.authorization_kind)||await executorEnd(owner,parent.id))throw Error('Exact untouched reserved upload required for continuation');
 const lease=destination==='toutiao'?await db().prepare('SELECT * FROM articles WHERE id=? AND owner=?').bind(article.id,owner).first<Record<string,unknown>>():await db().prepare("SELECT * FROM article_deliveries WHERE article_id=? AND owner=? AND platform='zhihu'").bind(article.id,owner).first<Record<string,unknown>>();
 if(!lease||!(destination==='toutiao'?['word_ready','needs_verification','needs_login','failed']:['pending','needs_verification','needs_login','failed']).includes(String(lease.state))||['deleting','published','scheduled','user_edited'].includes(article.state)||!Number.isInteger(article.upload_guard_version)||![0,1].includes(article.upload_guard_version!))throw Error('Continuation destination is terminal or changed');
 const source=await assertManualSource(owner,article),baseline=await wordBaseline(article,parent.word_sha256,parent.word_size);
 if(JSON.stringify(baseline)!==parent.baseline)throw Error('Continuation frozen Word or baseline changed');
 if(parent.authorization_kind==='owner_confirmed_legacy_reimport')await verifyLegacyReimportLineage(owner,article,parent);
 if(parent.authorization_kind==='owner_confirmed_reimport')await verifyReimportLineage(owner,article,parent);
 if(parent.authorization_kind==='unconsumed_continuation')await verifyContinuationLineage(owner,article,parent);
 const auth=parent.reimport_authorization?JSON.parse(parent.reimport_authorization):null;
 const oldUrl=destination==='toutiao'?article.draft_url:lease.draft_url,oldReadback=destination==='toutiao'?article.draft_readback:lease.readback;
 if((oldUrl??null)!==(auth?.retained_destination_url??null)||(oldReadback??null)!==(auth?.retained_destination_readback??null))throw Error('Continuation retained draft evidence changed');
 const artifacts=Object.fromEntries(artifactColumns.map(k=>[k,article[k]??null])),destinationSnapshot=Object.fromEntries(destinationColumns.map(k=>[k,lease[k]??null]));
 const fingerprint=await hashClaim(JSON.stringify({owner,article_id:article.id,platform:destination,parent:attemptSnapshot(parent),artifacts,destination:{...destinationSnapshot,claim_token:lease.claim_token?await hashClaim(String(lease.claim_token)):null}}));
 return {lease,source,artifacts,destinationSnapshot,fingerprint,auth,oldUrl:oldUrl??null,oldReadback:oldReadback??null};
}
function balancedAnd(parts:readonly string[]):string{
 if(!parts.length)throw Error('Empty SQL fence');
 if(parts.length===1)return parts[0];
 const middle=Math.floor(parts.length/2);
 return `(${balancedAnd(parts.slice(0,middle))} AND ${balancedAnd(parts.slice(middle))})`;
}
function continuationConsumeFence(a:string,u:string){
 // D1 limits expression depth to 100. Preserve every snapshot comparison while
 // keeping the full consume statement below that limit, including other modes.
 const parentMatch=balancedAnd(attemptColumns.map(c=>`p.${c} IS json_extract(${u}.reimport_authorization,'$.parent_snapshot.${c}')`));
 return `${manualSourceFence(a)} AND ${a}.source_key=json_extract(${u}.reimport_authorization,'$.source_key')
 AND ${a}.upload_guard_version=json_extract(${u}.reimport_authorization,'$.reserved_upload_guard_version')
 AND ${a}.paragraphs=json_extract(${u}.reimport_authorization,'$.artifacts.paragraphs') AND ${a}.artifact_manifest IS json_extract(${u}.reimport_authorization,'$.artifacts.artifact_manifest')
 AND EXISTS(SELECT 1 FROM article_upload_attempts p WHERE p.id=${u}.previous_attempt_id AND ${parentMatch} AND p.state='reserved' AND p.consumed_at IS NULL AND p.claim_hash!=${u}.claim_hash)
 AND ((${u}.platform='toutiao' AND ${a}.state='needs_verification' AND ${a}.draft_url IS json_extract(${u}.reimport_authorization,'$.retained_destination_url') AND ${a}.draft_readback IS json_extract(${u}.reimport_authorization,'$.retained_destination_readback'))
 OR (${u}.platform='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=${a}.id AND d.owner=${a}.owner AND d.platform='zhihu' AND d.state='needs_verification' AND d.draft_url IS json_extract(${u}.reimport_authorization,'$.retained_destination_url') AND d.readback IS json_extract(${u}.reimport_authorization,'$.retained_destination_readback'))))`;
}
// The read-only compiler probe and the actual consume share the exact predicate.
function consumeAttemptWhere(){
 return `id=? AND owner=? AND article_id=? AND platform=? AND target_account=? AND state='reserved' AND consumed_at IS NULL AND preflight=?
   AND EXISTS(SELECT 1 FROM articles a WHERE a.id=article_upload_attempts.article_id AND a.owner=? AND a.result_key=? AND a.result_meta=? AND ((article_upload_attempts.platform='toutiao' AND a.claim_token=? AND a.claim_expires>?) OR (article_upload_attempts.platform='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu' AND d.claim_token=? AND d.claim_expires>?)))
    AND a.state!='deleting' AND ((article_upload_attempts.authorization_kind='unconsumed_continuation' AND ${continuationConsumeFence('a','article_upload_attempts')}) OR (article_upload_attempts.authorization_kind='owner_confirmed_reimport' AND ${reimportConsumeFence('a','article_upload_attempts')}) OR (article_upload_attempts.authorization_kind='owner_confirmed_legacy_reimport' AND ${legacyReimportConsumeFence('a','article_upload_attempts')}) OR (article_upload_attempts.authorization_kind NOT IN ('unconsumed_continuation','owner_confirmed_reimport','owner_confirmed_legacy_reimport') AND (a.upload_guard_version=1 OR article_upload_attempts.authorization_kind='owner_confirmed_never_submitted') AND (article_upload_attempts.platform='zhihu' OR (a.draft_url IS NULL AND (a.state='word_ready' OR (article_upload_attempts.authorization_kind='owner_confirmed_never_submitted' AND a.state IN ('needs_verification','needs_login','failed')))))
    AND (article_upload_attempts.platform='toutiao' OR NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu' AND (d.draft_url IS NOT NULL OR (d.state!='pending' AND NOT (article_upload_attempts.authorization_kind='owner_confirmed_never_submitted' AND d.state IN ('needs_verification','needs_login','failed')))))))))
   AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=article_upload_attempts.id)
   AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=article_upload_attempts.id)`;
}
async function verifyContinuationLineage(owner:string,article:Article,attempt:Attempt){
 const auth=attempt.reimport_authorization?JSON.parse(attempt.reimport_authorization):null;
 const parent=await db().prepare('SELECT * FROM article_upload_attempts WHERE id=? AND owner=? AND article_id=? AND platform=?').bind(attempt.previous_attempt_id,owner,article.id,attempt.platform).first<Attempt>();
 if(!auth||!parent||attemptSnapshot(parent)!==JSON.stringify(auth.parent_snapshot)||await hashClaim(attemptSnapshot(parent))!==auth.parent_sha256||parent.state!=='reserved'||parent.consumed_at!==null||parent.claim_hash===attempt.claim_hash||parent.word_sha256!==attempt.word_sha256||parent.word_size!==attempt.word_size||parent.target_account!==attempt.target_account||parent.baseline!==attempt.baseline||parent.attempt_version+1!==attempt.attempt_version||!continuationKinds.includes(parent.authorization_kind)||auth.request?.confirm_unconsumed_recovery!==true||auth.request.prior_executor_stopped!==true||await hashClaim(JSON.stringify(auth.request))!==auth.request_sha256||article.upload_guard_version!==auth.reserved_upload_guard_version||await assertManualSource(owner,article)!==auth.source_key)throw Error('Unconsumed continuation lineage changed');
}
async function reserveUnconsumedContinuation(owner:string,article:Article,destination:Platform,parent:Attempt|null,args:Record<string,unknown>,suppliedClaim:unknown,ownerRecovery=false){
 if(args.confirm_unconsumed_recovery!==true||args.prior_executor_stopped!==true||args.preserve_existing_draft!==true||args.confirm_new_draft!==true||typeof args.expected_recovery_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(args.expected_recovery_fingerprint)||!Number.isSafeInteger(args.expected_attempt_revision)||typeof args.previous_attempt_id!=='string')throw Error('Explicit owner authorization of exact unconsumed recovery and stopped executor required');
 const request={article_id:article.id,platform:destination,previous_attempt_id:args.previous_attempt_id,expected_attempt_revision:args.expected_attempt_revision,expected_recovery_fingerprint:args.expected_recovery_fingerprint,target_account:short(args.target_account),word_sha256:args.word_sha256,word_size:args.word_size,current_task_id:short(args.current_task_id),authorization_key:short(args.authorization_key),confirmation_message_id:short(args.confirmation_message_id),prior_executor_end_reference:short(args.prior_executor_end_reference),confirm_unconsumed_recovery:true,prior_executor_stopped:true,preserve_existing_draft:true,confirm_new_draft:true,preflight:args.preflight};
 const requestSha=await hashClaim(JSON.stringify(request));
 const replay=await db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND (authorization_key=? OR previous_attempt_id=?)').bind(owner,request.authorization_key,request.previous_attempt_id).first<Attempt>();
 if(replay){if(replay.authorization_kind!=='unconsumed_continuation'||JSON.parse(replay.reimport_authorization!).request_sha256!==requestSha)throw Error('Unconsumed recovery request is already bound');return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(replay)};}
 const context=await continuationContext(owner,article,destination,parent);
 if(!parent||parent.id!==request.previous_attempt_id||parent.revision!==request.expected_attempt_revision||context.fingerprint!==request.expected_recovery_fingerprint||request.target_account!==authorizedUploadAccounts[destination]||parent.target_account!==request.target_account||parent.word_sha256!==request.word_sha256||parent.word_size!==request.word_size)throw Error('Unconsumed recovery snapshot or scope changed');
 const priorTask=context.auth?.request?.current_task_id;
 if(priorTask&&priorTask!==request.current_task_id)throw Error('Unconsumed recovery must retain the original manual task');
 // Authenticated owner recovery uses the exact previewed lease (including null/expired),
 // not a fabricated replacement for a lost bearer. The full lease CAS and explicit
 // stop/owner authorization still fence every late old request. Ordinary mode
 // callers retain the current-holder credential requirement.
 const oldClaim=ownerRecovery?(context.lease.claim_token as string|null):await executionClaim(owner,article,destination,suppliedClaim),checked=preflight(args.preflight,destination,parent.target_account,parent.word_sha256,parent.word_size);
 validateBlankEditor({...checked.existing_drafts,target_account:parent.target_account},destination,parent.target_account);
 const retained=await priorEditorUrls(owner,article.id,destination,parent.attempt_version+1);
 if(retained.some(url=>!checked.existing_drafts.matching_editor_urls.includes(url))||checked.existing_drafts.prior_submission!==publicAttempt(parent)!.submission_state)throw Error('Unconsumed recovery must retain the original submission history');
 const id=crypto.randomUUID(),claim=crypto.randomUUID(),consumeToken=crypto.randomUUID(),claimHash=await hashClaim(claim),created=now(),expires=new Date(Date.now()+6*3600000).toISOString();
 const audit={request,request_sha256:requestSha,parent_snapshot:JSON.parse(attemptSnapshot(parent)),parent_sha256:await hashClaim(attemptSnapshot(parent)),source_key:context.source,reserved_upload_guard_version:article.upload_guard_version,artifacts:context.artifacts,retained_editor_urls:[...new Set([...retained,...checked.existing_drafts.matching_editor_urls])],retained_destination_url:context.oldUrl,retained_destination_readback:context.oldReadback,prior_history:context.auth?.prior_history??null,original_authorization_kind:context.auth?.original_authorization_kind??parent.authorization_kind,original_authorization:context.auth?.original_authorization??context.auth,audit_kind:'authenticated_owner_attestation_not_chat_signature',executor_end_attestation_only:true};
 await rememberArticleClaimHashes(owner,oldClaim,claim,consumeToken);
 const bindings:unknown[]=[],parentFence=attemptFence('p',parent,bindings);
 const artifactFence=artifactColumns.map(k=>{bindings.push(article[k]??null);return `a.${k} IS ?`;}).join(' AND ');
 const leaseFence=(destination==='toutiao'?['id','state','claim_token','claim_expires','draft_url','draft_readback']:destinationColumns).map(k=>{bindings.push(context.lease[k]??null);return `d.${k} IS ?`;}).join(' AND ');
 // The insert and exact live lease rotation commit together. Parent fields are never rewritten.
 const insert=db().prepare(`INSERT OR IGNORE INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated,attempt_version,previous_attempt_id,authorization_key,reimport_authorization,consume_token_sha256,confirmation_message_id)
 SELECT ?,?,?,?,?,?,?,'unconsumed_continuation',?,?,?,'reserved','[]',?,?,?,?,?,?,?,NULL FROM articles a JOIN article_upload_attempts p ON p.article_id=a.id AND p.owner=a.owner JOIN ${destination==='toutiao'?'articles':'article_deliveries'} d ON ${destination==='toutiao'?'d.id=a.id AND d.owner=a.owner':"d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu'"}
 WHERE ${parentFence} AND ${artifactFence} AND ${leaseFence} AND ${manualSourceFence('a')}
 AND p.state='reserved' AND p.consumed_at IS NULL AND d.claim_token IS ? AND (?=1 OR d.claim_expires>?)
 AND NOT EXISTS(SELECT 1 FROM article_upload_attempts n WHERE n.owner=p.owner AND n.article_id=p.article_id AND n.platform=p.platform AND n.attempt_version>p.attempt_version)
 AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner)`)
 .bind(id,owner,article.id,destination,parent.target_account,parent.word_sha256,parent.word_size,claimHash,JSON.stringify(checked),parent.baseline,created,created,parent.attempt_version+1,parent.id,request.authorization_key,JSON.stringify(audit),await hashClaim(consumeToken),...bindings,oldClaim,ownerRecovery?1:0,created);
 const rotate=destination==='toutiao'?db().prepare(`UPDATE articles SET claim_token=?,claim_expires=?,state='needs_verification' WHERE id=? AND owner=? AND claim_token IS ? AND EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.id=? AND u.claim_hash=?)`).bind(claim,expires,article.id,owner,oldClaim,id,claimHash):db().prepare(`UPDATE article_deliveries SET claim_token=?,claim_expires=?,state='needs_verification',updated=? WHERE article_id=? AND owner=? AND platform='zhihu' AND claim_token IS ? AND EXISTS(SELECT 1 FROM article_upload_attempts u WHERE u.id=? AND u.claim_hash=?)`).bind(claim,expires,created,article.id,owner,oldClaim,id,claimHash);
 let allocation:D1Result[];
 try{allocation=await db().batch([insert,rotate]);}
 catch{
  // A concurrent same request or a lost batch response can commit before this
  // caller sees it. Read only that immutable request; never reissue its secrets.
  const replay=await db().prepare('SELECT * FROM article_upload_attempts WHERE owner=? AND authorization_key=?').bind(owner,request.authorization_key).first<Attempt>();
  if(replay?.authorization_kind==='unconsumed_continuation'&&JSON.parse(replay.reimport_authorization!).request_sha256===requestSha)return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(replay)};
  throw Error('Unconsumed recovery snapshot or scope changed');
 }
 const [allocated,rotated]=allocation,current=await row(owner,article.id,destination);
 if(!allocated.meta.changes){if(current?.authorization_kind==='unconsumed_continuation'&&JSON.parse(current.reimport_authorization!).request_sha256===requestSha)return {reserved:false,cached:true,execute_import:false,attempt:publicAttempt(current)};throw Error('Unconsumed recovery snapshot or scope changed');}
 if(!rotated.meta.changes||current?.id!==id)throw Error('Unconsumed recovery rotation was not confirmed');
 return {reserved:true,execute_import:false,attempt:publicAttempt(current),execution_claim:claim,consume_token:consumeToken,expires,unconsumed_continuation_permission_ready:true,old_permit_fenced:true,old_attempt_preserved:true,executor_end_attestation_only:true};
}

const idSchema = {type: 'string'};
const destinationSchema = {type: 'string', enum: ['toutiao', 'zhihu']};
const claimSchema={type:'string',maxLength:100,description:'Current article claim_token for Toutiao, or delivery_token for Zhihu. Never put this credential in evidence.'};
const common = {article_id: idSchema, platform: destinationSchema};
const timeSchema = {type: 'string', maxLength: 40};
const hashSchema = {type: 'string', pattern: '^[a-f0-9]{64}$'};
const urlSchema = {type: 'string', maxLength: 1024};
const shape = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({type: 'object', properties, required, additionalProperties: false});
const tool = (name: string, description: string, properties: Record<string, unknown>, readOnlyHint = false, optional:string[] = []) => ({name, description, inputSchema: shape(properties,Object.keys(properties).filter(key=>!optional.includes(key))), annotations: {readOnlyHint, destructiveHint: false, openWorldHint: false}});
const yesSchema={type:'boolean',const:true};
const blankEditorSchema=shape({target_account:{type:'string',maxLength:180},current_editor_url:urlSchema,editor_empty:yesSchema,private_draft:yesSchema,checked_at:timeSchema});
const identitySchema={type:'string',enum:['known_editor_url','unknown_without_editor_url'],description:'For owner_confirmed_reimport, unknown means a consumed outcome_unknown attempt without a recorded URL or readback. For owner_confirmed_legacy_reimport, it means explicitly untracked unknown history with no known URL; no prior attempt is fabricated. Never fabricate a draft identity.'};
const priorUrlSchema={...urlSchema,description:'Exact retained real draft URL, or exactly an empty string for an unknown draft identity when a cached older client still requires this field. Empty is normalized to unknown, never saved as a URL, and never grants standing approval.'};
const reimportProperties={previous_attempt_id:idSchema,existing_editor_url:priorUrlSchema,prior_draft_identity:identitySchema,authorization_scope:{type:'string',enum:['exact_reimport','duplicate_tolerant_task'],description:'Use duplicate_tolerant_task only under the owner’s explicit standing approval for this manual task; no repeated duplicate confirmation is needed within that scope.'},current_task_id:{type:'string',minLength:1,maxLength:180,description:'Stable non-secret current manual task reference. Not a credential or fabricated human signature.'},confirm_duplicate_tolerant_task:yesSchema,current_word_sha256:hashSchema,authorization_key:{type:'string',minLength:1,maxLength:180},confirmation_message_id:{type:'string',minLength:1,maxLength:180,description:'Owner-attested audit reference only, never a signature or authorization token.'},prior_executor_end_reference:{type:'string',minLength:1,maxLength:180},confirm_reimport:yesSchema,confirm_new_draft:yesSchema,preserve_existing_draft:yesSchema,prior_executor_stopped:yesSchema};
const legacyReimportProperties={expected_attempt_id:{type:'null',const:null,description:'Exact absence of any recorded attempt. Does not assert that no historical file submission occurred.'},confirm_unrecorded_history:{...yesSchema,description:'Explicitly acknowledge historical submission remains unknown and possible duplicate private drafts are authorized.'}};
const downloadHandoffSchema=shape({kind:{type:'string',const:'same_browser_download'},download_path:{type:'string',maxLength:1024,description:'Exact original path returned by the official download event in this browser session. Never infer shared chooser path resolution from this path.'},download_browser_session:{type:'string',minLength:1,maxLength:180},executor_id:{type:'string',minLength:1,maxLength:180,description:'Non-secret identifier of the same live CUA executor that downloaded, copied and checked both files.'},source_sha256:hashSchema,source_size:{type:'integer',minimum:1,maximum:MAX_FILE},verified_in_cua:{...yesSchema,description:'This executor actually read and hashed both original download and submitted named file bytes in CUA; shell stat alone is insufficient.'},copied_in_same_executor:yesSchema,chooser_prepared:{...yesSchema,description:'Set by the runner only after obtaining the genuine current upload chooser. Caller assertions do not create a chooser.'},chooser_prepared_at:timeSchema});
// Keep this object flat: connector schema normalizers can close each partial
// oneOf object and incorrectly reject common file properties. Runtime fileEvidence
// still enforces the complete, mutually exclusive true/false evidence branches.
const fileSchema={...shape({absolute_path:{type:'string',maxLength:1024},browser_session:{type:'string',maxLength:180,description:'Non-secret browser session identifier, exactly matching the download session for an unproven handoff; never a cookie or authentication token.'},filename:{type:'string',maxLength:180},visible_in_browser:{type:'boolean',enum:[true,false]},sha256:hashSchema,size:{type:'integer',minimum:1,maximum:MAX_FILE},checked_at:{...timeSchema,description:'Fresh actual file check time. For same_browser_download, both original download and named submitted bytes were read and hashed in CUA at this time.'},visibility_unproven:yesSchema,handoff:downloadHandoffSchema},['absolute_path','browser_session','filename','visible_in_browser','sha256','size','checked_at']),description:'Either actual browser-visible file evidence, or a frozen same-browser download handoff with visibility explicitly false. The runtime requires visibility_unproven=true and the complete handoff for false, and rejects either extra field for true. The unproven branch permits one authorized chooser access attempt; path access remains unproven until setFiles and independent draft verification.'};
const preflightSchema = shape({file:fileSchema, existing_drafts: shape({current_editor_url:urlSchema,prior_submission:{type:'string',enum:['never_attempted','submitted_unknown','verified_existing']},account: {type: 'string', maxLength: 180}, editor_checked: {const: true, type: 'boolean'}, draft_list_checked: {const: true, type: 'boolean'}, matching_editor_urls: {type: 'array', maxItems: 20, items: urlSchema}, checked_at: timeSchema,editor_empty:yesSchema,private_draft:yesSchema},['current_editor_url','prior_submission','account','editor_checked','draft_list_checked','matching_editor_urls','checked_at'])});
export const uploadReadbackSchema = shape({
 ...draftReadbackSchema.properties,
 title: {...draftReadbackSchema.properties.title, description: 'The complete original title, supplied once in this separate field. Do not repeat the top title in paragraphs.'},
 paragraphs: {...draftReadbackSchema.properties.paragraphs, description: 'Full body paragraphs only, in their original order, excluding the top title. read_article.paragraphs includes the title, but this readback array does not; supply the title separately in title.'},
 images: {...draftReadbackSchema.properties.images, items: {...draftReadbackSchema.properties.images.items, properties: {...draftReadbackSchema.properties.images.items.properties,
  after_paragraph: {...draftReadbackSchema.properties.images.items.properties.after_paragraph, description: 'Keep the frozen Word paragraph index, including its title at index 0. 0 means after the Word title/before the first body paragraph. Do not renumber anchors when excluding the title from readback.paragraphs.'}
 }}},
 target_account: {type: 'string', maxLength: 180}, draft_url: urlSchema,
 saved_at: {...timeSchema, description: 'Real time saved status was first observed in the original editor before leaving it to reopen the draft. Do not use a later repeat observation after reopening. For a new import: consumed_at <= saved_at <= reopened_at <= read_at. An existing draft may retain its actual earlier saved_at. Date.parse must accept the timestamp; fixed millisecond digits are not required. Never invent a missing time.'},
 reopened_at: {...timeSchema, description: 'Real time the same actual draft was independently reopened after the original saved observation. Must satisfy saved_at <= reopened_at <= read_at and the existing freshness checks. Date.parse must accept the timestamp; fractional seconds are optional. Never backdate to satisfy validation.'},
 read_at: {...draftReadbackSchema.properties.read_at, description: 'Real time the full independent title/body/images/save-state readback finished in the reopened draft; must be >= reopened_at and satisfy existing freshness checks. Date.parse must accept the timestamp; fractional seconds are optional. This is not the original saved_at.'},
 independently_reopened: {type: 'boolean', const: true}, saved_indicator_observed: {type: 'boolean', const: true}, images_loaded: {type: 'boolean', const: true}, cover: shape({observed_url: {type: 'string', maxLength: 2048}, reference_sha256: hashSchema, loaded: {type: 'boolean', const: true}})
}, [...draftReadbackSchema.required, 'target_account', 'draft_url', 'saved_at', 'reopened_at', 'independently_reopened', 'saved_indicator_observed', 'images_loaded']);
export const articleUploadTools = [
 tool('read_article_upload_authorization','Owner-only read of whether the supplied volatile original claim and exact already-consumed attempt still match a live saving lease, frozen Word/account and original 60-second consume window. The single SQL snapshot is not a lease lock. observed_at/checked_at are server read-start time; verified_at checks response-time deadlines. Always execute_import=false; never creates, refreshes or reissues permission. The parent must retain the original real execute_import=true receipt and unused same-window submission ledger. A stored one-use consume-token hash additionally requires its original volatile consume_token; ordinary new_word has no such token and must omit it. No credentials, claim/token hashes or full evidence are returned or persisted.',{...common,execution_claim:claimSchema,attempt_id:{...idSchema,minLength:1,maxLength:100},target_account:{type:'string',maxLength:180},word_sha256:hashSchema,word_size:{type:'integer',minimum:1,maximum:MAX_FILE},consumed_at:timeSchema,expected_attempt_revision:{type:'integer',minimum:0},consume_token:{type:'string',minLength:1,maxLength:100}},true,['consume_token']),
 tool('record_article_upload_executor_end','Append a current-claim executor acknowledgement that it has ended all browser/file/status writes for this exact consumed upload attempt. Known/default draft identity requires the exact existing_editor_url. Unknown-without-editor-URL requires prior_draft_identity=unknown_without_editor_url and omission of existing_editor_url (cached exact-empty compatibility is normalized separately). The runtime enforces these conditional requirements. This permanently freezes that attempt, not its platform draft. The server records an acknowledgement and cannot prove browser termination. Does not authorize a reimport.',{...common,execution_claim:claimSchema,attempt_id:idSchema,target_account:{type:'string',maxLength:180},word_sha256:hashSchema,word_size:{type:'integer',minimum:1,maximum:MAX_FILE},existing_editor_url:priorUrlSchema,prior_draft_identity:identitySchema,expected_attempt_revision:{type:'integer',minimum:0},prior_executor_stopped:yesSchema,prior_executor_end_reference:{type:'string',minLength:1,maxLength:180}},false,['existing_editor_url','prior_draft_identity']),
 tool('preview_article_unconsumed_upload_recovery','Read an exact reserved, never-consumed manual-upload recovery fingerprint and frozen Word/history. No permit or claim. Owner must explicitly authorize this exact recovery and attest actual original execution stop; the server cannot prove termination.',common,true),
 tool('read_article_upload', 'Read the durable upload fence. No claim, retry or reset. If consumed/unknown, retain this audit. Reimport needs a separately ended executor and owner-authorized manual task; empty editor/list alone is never authority.', common, true),
 tool('reserve_article_upload', 'continue_unconsumed requires an exact preview fingerprint/revision of a reserved never-consumed manual attempt, a new explicit owner recovery approval, original executor stop reference, same task/Word/account and fresh blank private editor/chooser. It appends one child and atomically fences the old lease/permit; never use consumed/unknown/verify-only parents. Freeze one current owner/article/platform attempt, Word bytes, actual named .docx visibility and target account. new_import requires a newly finalized Word and no prior attempt; owner_confirmed_first_import additionally requires the actual owner to explicitly confirm this exact legacy article/account/platform has NEVER had file submission. A worker assertion is not owner approval. owner_confirmed_reimport requires owner approval of unchanged manual Word/account and a new private draft, preserving old drafts, plus an exact consumed prior attempt and append-only actual executor-end acknowledgement. owner_confirmed_legacy_reimport is only for a verified manual intake with a supported current integer upload guard (0 or 1) and genuinely no recorded attempt; the finalization guard is not proof of historical submission, under explicit owner duplicate-risk authorization and an actual prior-executor-stop attestation; it preserves untracked unknown history and never invents a prior attempt or consumption. Legacy-root inputs require expected_attempt_id=null, confirm_unrecorded_history=true, current_task_id and all exact owner/Word/account/stopped-executor confirmations, with previous_attempt_id omitted. Both owner reimport modes require confirm_reimport, confirm_new_draft, preserve_existing_draft and prior_executor_stopped to be true, plus current_word_sha256, authorization_key, confirmation_message_id and prior_executor_end_reference. Unknown identity omits existing_editor_url; a known identity supplies its exact retained URL. The runtime enforces these conditional requirements. duplicate_tolerant_task requires current_task_id and confirm_duplicate_tolerant_task=true and reuses explicit standing approval in the same current task without repeated duplicate confirmation; each ended attempt still has one child and each grant is single-use. Stop and report repeated identical failures without progress; this tool never runs an automatic retry loop. Chat IDs are audit only. The winner receives a fresh execution claim and new one-use consume token; same request returns the original attempt without reissuing secrets. verify_existing never grants import. This reservation is not permission to click file submit.', {...common, execution_claim:claimSchema, mode: {type: 'string', enum: ['continue_unconsumed','new_import', 'owner_confirmed_first_import', 'verify_existing','owner_confirmed_reimport','owner_confirmed_legacy_reimport']}, target_account: {type: 'string', maxLength: 180}, word_sha256: hashSchema, word_size: {type: 'integer', minimum: 1, maximum: MAX_FILE}, preflight: preflightSchema,expected_recovery_fingerprint:hashSchema,expected_attempt_revision:{type:'integer',minimum:0},confirm_unconsumed_recovery:yesSchema,...reimportProperties,...legacyReimportProperties,confirm_never_submitted:{type:'boolean',const:true,description:'Only after actual owner approval of this exact article/file/account/platform first import; never set by a worker on its own.'}},false,['expected_recovery_fingerprint','expected_attempt_revision','confirm_unconsumed_recovery','confirm_never_submitted',...Object.keys(reimportProperties),...Object.keys(legacyReimportProperties)]),
 tool('consume_article_upload', 'Immediately before exactly one file submission, atomically consume the reserved attempt. Only execute_import=true in this response permits one setFiles OR native Open. Never replay a consumed grant or file submission. Unknown outcomes retain audit and may use a new linked attempt only after actual executor end under explicit owner manual-task reimport approval.', {...common, execution_claim:claimSchema, attempt_id: idSchema, target_account: {type: 'string', maxLength: 180},file_confirmation:preflightSchema.properties.file,consume_token:{type:'string',maxLength:100,description:'New volatile one-use reimport token returned only to the initial successful reserver; never an old claim/grant.'},reimport_editor_confirmation:blankEditorSchema},false,['consume_token','reimport_editor_confirmation']),
 {...tool('record_article_upload', 'Retain real editor URLs and observed outcome on the same attempt. Unknown never clears its fence. verified requires independently reopened, saved, exact title/body, loaded ordered images and anchors; Zhihu also requires a loaded cover. Browser assertions are agent evidence, not server observation.', {...common, execution_claim:claimSchema, attempt_id: idSchema, state: {type: 'string', enum: ['outcome_unknown', 'draft_observed', 'verified']}, editor_url: urlSchema, readback: uploadReadbackSchema}), inputSchema: shape({...common, execution_claim:claimSchema, attempt_id: idSchema, state: {type: 'string', enum: ['outcome_unknown', 'draft_observed', 'verified']}, editor_url: urlSchema, readback: uploadReadbackSchema}, ['article_id', 'platform', 'execution_claim', 'attempt_id', 'state'])}
];
// Keep advertised inputs as complete flat object schemas. Connector normalizers
// may close partial conditional objects and reject valid requests or hide their
// conditions. Mode-specific required inputs and URL identity stay enforced by
// legacyReimportRequest, reimportRequest, priorDraftUrl and recordExecutorEnd.
// Separate authenticated-owner recovery entry: no lost bearer is fabricated.
const continuationReserveSchema=articleUploadTools.find(t=>t.name==='reserve_article_upload')!.inputSchema;
const continuationRecoveryFields=['article_id','platform','target_account','word_sha256','word_size','preflight','previous_attempt_id','expected_recovery_fingerprint','expected_attempt_revision','current_task_id','authorization_key','confirmation_message_id','prior_executor_end_reference','prior_executor_stopped','confirm_unconsumed_recovery','confirm_new_draft','preserve_existing_draft'];
articleUploadTools.push(tool('recover_article_unconsumed_upload','Only under the authenticated owner’s explicit authorization for this exact previewed reserved never-consumed manual attempt and real original executor stop. Atomically append one child and rotate the exact previewed lease, including lost/expired/released claims, preserving all history and original Word/account/task. No bearer is reconstructed; no consumed/unknown/verify-only/terminal attempt can use this recovery. The winner receives new volatile claim/one-use token; exact request replay never reissues them. Server stores owner stop attestation, not termination proof. Not a file submission permission.',Object.fromEntries(continuationRecoveryFields.map(key=>[key,continuationReserveSchema.properties[key as keyof typeof continuationReserveSchema.properties]]))));
articleUploadTools.push(tool('read_article_unconsumed_upload_diagnostics','Owner-only read of fixed effective schema/0037 Drizzle statuses, current lease classification, and read-only Word/continuation checks. Checks inspect the current immutable output and lineage without consuming a permit or identifying a historical refusal. No raw SQL, DB errors, credentials, reset or writes.',common,true));
export const articleUploadToolNames = new Set(articleUploadTools.map(item => item.name));

export async function articleUploadCall(owner: string, article: Article, name: string, args: Record<string, unknown>) {
 const diagnoseReserve=name==='reserve_article_upload'&&args.mode==='new_import';
 const diagnoseConsume=name==='consume_article_upload';
 let reserveStage:ReserveUploadStage='attempt_read';
 let consumeStage:ConsumeUploadStage='attempt_read';
 try{
 if(name==='read_article_upload_authorization')return readCurrentUploadAuthorization(owner,article.id,args);
 const destination = platform(args.platform), previous = await row(owner, article.id, destination);
 if(name==='read_article_unconsumed_upload_diagnostics'){
  const lease=destination==='toutiao'?article:await db().prepare("SELECT state,claim_token,claim_expires FROM article_deliveries WHERE owner=? AND article_id=? AND platform='zhihu'").bind(owner,article.id).first<{state:string;claim_token:string|null;claim_expires:string|null}>();
  const expiry=lease?.claim_expires?Date.parse(lease.claim_expires):NaN;
  const phases=['word_ready','needs_verification','needs_login','failed','pending','toutiao_saving','saving','published','scheduled','user_edited','completed','saved'];
  const checks=previous?await probeConsumeUpload([
   {stage:'consume_query_check',run:async()=>{const checked=now();await db().prepare(`SELECT 1 AS compile_ok FROM article_upload_attempts WHERE ${consumeAttemptWhere()} LIMIT 0`).bind(previous.id,owner,article.id,destination,previous.target_account,previous.preflight,owner,article.result_key,article.result_meta,null,checked,null,checked).first();}},
   {stage:'word_output_check',run:async()=>{await wordBaseline(article,previous.word_sha256,previous.word_size);}},
   ...(previous.authorization_kind==='unconsumed_continuation'?[{stage:'continuation_lineage_check' as const,run:async()=>{await verifyContinuationLineage(owner,article,previous);}}]:[])
  ]):[];
  return {article_id:article.id,platform:destination,read_only:true,execute_import:false,does_not_identify_past_failure_branch:true,
   current_checks:checks,
   schema:await readUploadRecoverySchema(db()),current:{upload_guard_version:[0,1].includes(article.upload_guard_version!)?article.upload_guard_version:null,
    destination_phase:lease&&phases.includes(lease.state)?lease.state:'other',lease_claim_present:!!lease?.claim_token,
    lease_expiry:!lease?.claim_expires?'absent':!Number.isFinite(expiry)?'invalid':expiry<=Date.now()?'expired':'live',
    parent_phase:previous&&['reserved','outcome_unknown','draft_observed','verified'].includes(previous.state)?previous.state:'absent_or_other',
    parent_authorization_kind:previous&&continuationKinds.includes(previous.authorization_kind)?previous.authorization_kind:'absent_or_other',
    parent_untouched_reserved:!!previous&&previous.state==='reserved'&&previous.consumed_at===null&&previous.editor_urls==='[]'&&previous.readback===null,
    parent_account_matches_destination:!!previous&&previous.target_account===authorizedUploadAccounts[destination]}};
 }
 if(name==='preview_article_unconsumed_upload_recovery'){const c=await continuationContext(owner,article,destination,previous);return {article_id:article.id,platform:destination,attempt:publicAttempt(previous),recovery_fingerprint:c.fingerprint,word:{output_id:JSON.parse(article.result_meta!).output_id,sha256:previous!.word_sha256,size:previous!.word_size},retained_editor_urls:await priorEditorUrls(owner,article.id,destination,previous!.attempt_version+1),execute_import:false,requires_explicit_owner_recovery_confirmation:true,executor_end_attestation_only:true};}
 if (name === 'read_article_upload') {const intake=await db().prepare(`SELECT 1 AS manual FROM articles a WHERE a.id=? AND a.owner=? AND ${manualSourceFence('a')}`).bind(article.id,owner).first<{manual:number}>();const sourceAvailable=!!intake&&!!article.source_key&&!!await bucket().head(article.source_key);const ended=previous?await executorEnd(owner,previous.id):null;return {article_id: article.id, platform: destination, upload_guard_version:article.upload_guard_version??null,attempt: publicAttempt(previous), execute_import: false, no_attempt_is_not_proof_of_no_historical_upload: true,source_classification:sourceAvailable?'manual_intake':'unverified_or_generated',source_evidence:{manual_intake_row:!!intake,original_source_available:sourceAvailable},executor_end:ended?{recorded:true,reference:ended.execution_end_reference,created:ended.created,attestation_only:true}:null};}
 // Claim credentials are accepted only as ephemeral inputs; receipts persist a one-way lease hash.
 if(diagnoseReserve)reserveStage='request_credential_check';
 if(diagnoseConsume)consumeStage='request_credential_check';
 const {execution_claim: suppliedClaim,consume_token: suppliedConsumeToken,...evidence}=args;
 if(await unsafeEvidence(owner,evidence,[article.claim_token || '',typeof suppliedClaim==='string'?suppliedClaim:'']))throw Error('Upload evidence contains unsafe credential content; nothing saved');
 args=await normalizeLegacyUnknownUrl(owner,article,destination,name,args);
 if(name==='recover_article_unconsumed_upload')return reserveUnconsumedContinuation(owner,article,destination,previous,{...args,mode:'continue_unconsumed'},undefined,true);
 if(name==='record_article_upload_executor_end')return recordExecutorEnd(owner,article,destination,previous,args,suppliedClaim);
 if (name === 'reserve_article_upload') {
  if(args.mode==='continue_unconsumed')return reserveUnconsumedContinuation(owner,article,destination,previous,args,suppliedClaim);
  if(args.mode==='owner_confirmed_legacy_reimport')return reserveLegacyReimport(owner,article,destination,previous,args,suppliedClaim);
  if(args.mode==='owner_confirmed_reimport')return reserveOwnerReimport(owner,article,destination,previous,args,suppliedClaim);
  if (previous) {if(diagnoseReserve)reserveStage='attempt_read';return {reserved: false, execute_import: false, attempt: publicAttempt(previous)};}
  if(diagnoseReserve)reserveStage='claim_check';
  const claim=await executionClaim(owner,article,destination,suppliedClaim);
  const account = short(args.target_account), mode = args.mode;
  if(account!==authorizedUploadAccounts[destination])throw Error('Destination account is outside the authorized Haoduoyu upload scope');
  if (mode !== 'new_import' && mode !== 'owner_confirmed_first_import' && mode !== 'verify_existing') throw Error('Invalid upload mode');
  if(diagnoseReserve)reserveStage='word_output_check';
  const baseline = await wordBaseline(article, args.word_sha256, args.word_size);
  if(diagnoseReserve)reserveStage='baseline_credential_check';
  if(await unsafeEvidence(owner,baseline))throw Error('Word evidence contains unsafe credential content; nothing saved');
  if(diagnoseReserve)reserveStage='preflight_check';
  const checked = preflight(args.preflight, destination, account, String(args.word_sha256), Number(args.word_size));
  if(diagnoseReserve)reserveStage='destination_check';
  const delivery = destination === 'zhihu' ? await db().prepare('SELECT state,draft_url FROM article_deliveries WHERE owner=? AND article_id=? AND platform=?').bind(owner, article.id, destination).first<{state: string; draft_url: string | null}>() : null;
  const oldUrl = destination === 'toutiao' ? article.draft_url : delivery?.draft_url;
  const legacyState = destination === 'toutiao' ? article.state : delivery?.state;
  if (legacyState === 'completed' || legacyState === 'saved') throw Error('Historical completed delivery is read-only; missing new evidence does not imply failure');
  if (mode === 'new_import' && article.upload_guard_version !== 1) throw Error('Owner confirmation required: confirm this exact article, Word and destination account/platform have never had a file submitted; then use owner_confirmed_first_import. Unknown prior submission cannot be cleared.');
  const firstImport=mode!=='verify_existing',ownerConfirmed=mode==='owner_confirmed_first_import';
  if(ownerConfirmed&&args.confirm_never_submitted!==true)throw Error('Actual owner confirmation of never-submitted first import is required');
  if(firstImport&&checked.existing_drafts.prior_submission!=='never_attempted')throw Error('Unknown or existing submission permits same-draft verification only, never a new import');
  if (firstImport && (oldUrl || checked.existing_drafts.matching_editor_urls.length || (destination === 'toutiao' ? legacyState !== 'word_ready'&&!(ownerConfirmed&&['needs_verification','needs_login','failed'].includes(String(legacyState))) : !!delivery && delivery.state !== 'pending'&&!(ownerConfirmed&&['needs_verification','needs_login','failed'].includes(delivery.state))))) throw Error('Prior or uncertain platform activity: verify the same existing draft, never reserve another import');
  const urls = [...new Set([...checked.existing_drafts.matching_editor_urls, ...(oldUrl ? [uploadEditorUrl(destination, oldUrl)] : [])])];
  if(diagnoseReserve)reserveStage='attempt_insert';
  const id = crypto.randomUUID(), created = now(), state = firstImport ? 'reserved' : 'outcome_unknown',authorizationKind=ownerConfirmed?'owner_confirmed_never_submitted':firstImport?'new_word':'verify_existing';
  // The unique key deliberately excludes filename, hash and account: none can bypass the same-task fence.
  const change = await db().prepare(`INSERT OR IGNORE INTO article_upload_attempts(id,owner,article_id,platform,target_account,word_sha256,word_size,authorization_kind,claim_hash,preflight,baseline,state,editor_urls,created,updated)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? FROM articles a WHERE a.id=? AND a.owner=? AND a.state=? AND a.result_key=? AND a.result_meta=? AND a.paragraphs=? AND a.artifact_manifest IS ? AND a.draft_url IS ? AND a.upload_guard_version=?
   AND ((?='toutiao') OR (? IS NULL AND NOT EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu')) OR EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu' AND d.state=? AND d.draft_url IS ?))
   AND ((?='toutiao' AND a.claim_token=? AND a.claim_expires>?) OR (?='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu' AND d.claim_token=? AND d.claim_expires>?)))
   AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=a.id AND x.owner=a.owner)`)
   .bind(id, owner, article.id, destination, account, args.word_sha256, args.word_size, authorizationKind, await hashClaim(claim), JSON.stringify(checked), JSON.stringify(baseline), state, JSON.stringify(urls), created, created, article.id, owner, article.state, article.result_key, article.result_meta, article.paragraphs, article.artifact_manifest, article.draft_url, article.upload_guard_version || 0, destination, delivery?.state || null, delivery?.state || null, delivery?.draft_url || null, destination,claim,created,destination,claim,created).run();
  if(diagnoseReserve)reserveStage='attempt_readback';
  const current = await row(owner, article.id, destination);
  if (!current) throw Error('Article changed during upload preparation; reread without importing');
  return {reserved: !!change.meta.changes, execute_import: false, attempt: publicAttempt(current)};
 }
 if(diagnoseConsume)consumeStage='attempt_read';
 if (!previous || args.attempt_id !== previous.id) throw Error('Matching upload attempt required');
 const ended=await executorEnd(owner,previous.id);
 if(ended) {if(name==='consume_article_upload')return {execute_import:false,attempt:publicAttempt(previous)};throw Error('Ended upload attempt is immutable');}
 if (name === 'consume_article_upload') {
  if (args.target_account !== previous.target_account) throw Error('Target account differs from the reserved account');
  if (previous.state !== 'reserved') return {execute_import: false, attempt: publicAttempt(previous)};
  consumeStage='claim_check';
  const claim=await executionClaim(owner,article,destination,suppliedClaim);
  const isContinuation=previous.authorization_kind==='unconsumed_continuation';
  if(isContinuation){consumeStage='continuation_lineage_check';await verifyContinuationLineage(owner,article,previous);consumeStage='consume_token_check';if(typeof suppliedConsumeToken!=='string'||await hashClaim(suppliedConsumeToken)!==previous.consume_token_sha256)throw Error('New reimport consume token required');consumeStage='editor_confirmation_check';validateBlankEditor(args.reimport_editor_confirmation,destination,previous.target_account);}
  const isReimport=previous.authorization_kind==='owner_confirmed_reimport';
  const isLegacyReimport=previous.authorization_kind==='owner_confirmed_legacy_reimport';
  if(isReimport){consumeStage='continuation_lineage_check';await verifyReimportLineage(owner,article,previous);consumeStage='consume_token_check';if(typeof suppliedConsumeToken!=='string'||await hashClaim(suppliedConsumeToken)!==previous.consume_token_sha256)throw Error('New reimport consume token required');consumeStage='editor_confirmation_check';validateBlankEditor(args.reimport_editor_confirmation,destination,previous.target_account);}
  if(isLegacyReimport){consumeStage='continuation_lineage_check';await verifyLegacyReimportLineage(owner,article,previous);consumeStage='consume_token_check';if(typeof suppliedConsumeToken!=='string'||await hashClaim(suppliedConsumeToken)!==previous.consume_token_sha256)throw Error('New reimport consume token required');consumeStage='editor_confirmation_check';validateBlankEditor(args.reimport_editor_confirmation,destination,previous.target_account);}
  consumeStage='claim_hash_check';
  if(await hashClaim(claim)!==previous.claim_hash)throw Error('Execution claim changed; the old reservation cannot authorize an import');
  // Stale preparation blocks this reservation. No reset exists; stop for explicit owner review.
  consumeStage='file_confirmation_check';
  const prepared = JSON.parse(previous.preflight),preparedFile=fileEvidence(prepared.file,previous.word_sha256,previous.word_size),confirmedFile=fileEvidence(args.file_confirmation,previous.word_sha256,previous.word_size);
  for(const key of ['filename','absolute_path','browser_session','sha256','size','visible_in_browser'] as const)if(confirmedFile[key]!==prepared.file[key])throw Error('File path, browser session or visible Word evidence changed; do not import');
  if(confirmedFile.visibility_unproven!==preparedFile.visibility_unproven||JSON.stringify(confirmedFile.handoff)!==JSON.stringify(preparedFile.handoff))throw Error('Same-browser download handoff changed; do not import');
  timestamp(confirmedFile.checked_at,Math.max(Date.parse(prepared.file.checked_at),Date.now()-15*60000));
  timestamp(prepared.file.checked_at); timestamp(prepared.existing_drafts.checked_at);
  consumeStage='word_output_check';
  await wordBaseline(article, previous.word_sha256, previous.word_size);
  const consumed = now();
  consumeStage='consume_cas';
  const change = await db().prepare(`UPDATE article_upload_attempts SET state='outcome_unknown',consumed_at=?,updated=?,revision=revision+1 WHERE ${consumeAttemptWhere()}`)
   .bind(consumed, consumed, previous.id, owner, article.id, destination, previous.target_account,previous.preflight, owner, article.result_key, article.result_meta,claim,consumed,claim,consumed).run();
  consumeStage='attempt_readback';
  return {execute_import: !!change.meta.changes, attempt: publicAttempt(await row(owner, article.id, destination)), instruction: change.meta.changes ? 'Submit this named file once in this account now. Never replay this grant or the file submission.' : 'Do not import; read and reconcile the same attempt.'};
 }
 if (name !== 'record_article_upload') throw Error('Unknown upload operation');
 const claim=await executionClaim(owner,article,destination,suppliedClaim);
 if(JSON.parse(article.result_meta||'{}').sha256!==previous.word_sha256)throw Error('Current Word differs from the upload attempt');
 if (previous.state === 'reserved') throw Error('Consume before platform file submission; no outcome can be invented');
 if (!['outcome_unknown', 'draft_observed', 'verified'].includes(String(args.state))) throw Error('Invalid upload outcome');
 const urls: string[] = JSON.parse(previous.editor_urls);
 if (args.editor_url !== undefined) { const url = uploadEditorUrl(destination, args.editor_url);if(previous.reimport_authorization&&JSON.parse(previous.reimport_authorization).retained_editor_urls.includes(url))throw Error('Reimport must use a new private draft and preserve the old draft'); if (!urls.includes(url)) urls.push(url); }
 if (urls.length > 20) throw Error('Too many draft identities; stop and review duplicates');
 if (args.state === 'draft_observed' && !urls.length) throw Error('A real editor URL is required');
 const readback = args.state === 'verified' ? await verifyUploadReadback(previous, args.readback) : null;
 if (readback && !urls.includes(readback.draft_url)) urls.push(readback.draft_url);
 if(urls.length>20)throw Error('Too many draft identities; stop and review duplicates');
 if (previous.state === 'verified') {
  if (args.state !== 'verified' || !readback || JSON.parse(previous.readback!).draft_url !== readback.draft_url) throw Error('Verified upload is terminal; read existing evidence');
  if(JSON.stringify(readback)===previous.readback)return {recorded: true, cached: true, attempt: publicAttempt(previous)};
  if(Date.parse(String(readback.read_at))<Date.parse(JSON.parse(previous.readback!).read_at))throw Error('Do not replace a newer readback with older evidence');
 }
 const updated = now();
 const change = await db().prepare(`UPDATE article_upload_attempts SET state=?,editor_urls=?,readback=?,updated=?,revision=revision+1 WHERE id=? AND owner=? AND state=? AND revision=?
  AND NOT EXISTS(SELECT 1 FROM article_upload_executor_ends e WHERE e.attempt_id=article_upload_attempts.id) AND NOT EXISTS(SELECT 1 FROM article_upload_attempts c WHERE c.previous_attempt_id=article_upload_attempts.id)
  AND EXISTS(SELECT 1 FROM articles a WHERE a.id=article_upload_attempts.article_id AND a.owner=? AND a.result_key=? AND a.result_meta=? AND a.state!='deleting'
   AND ((article_upload_attempts.platform='toutiao' AND a.claim_token=? AND a.claim_expires>? AND a.state!='completed') OR (article_upload_attempts.platform='zhihu' AND EXISTS(SELECT 1 FROM article_deliveries d WHERE d.article_id=a.id AND d.owner=a.owner AND d.platform='zhihu' AND d.claim_token=? AND d.claim_expires>? AND d.state!='saved'))))`)
  .bind(args.state, JSON.stringify(urls), readback ? JSON.stringify(readback) : previous.readback, updated, previous.id, owner, previous.state, previous.revision,owner,article.result_key,article.result_meta,claim,updated,claim,updated).run();
 if (!change.meta.changes) throw Error('Upload evidence changed; reread and retain all existing draft URLs');
 return {recorded: true, execute_import: false, attempt: publicAttempt(await row(owner, article.id, destination))};
 }catch(error){throw diagnoseConsume?consumeUploadDiagnosticError(error,consumeStage):diagnoseReserve?reserveUploadDiagnosticError(error,reserveStage):error;}
}
async function verifyUploadReadback(attempt: Attempt, value: unknown) {
 const read = object(value), baseline: Baseline = JSON.parse(attempt.baseline);
 const actualUrl = uploadEditorUrl(attempt.platform, read.draft_url);
 if(attempt.reimport_authorization&&JSON.parse(attempt.reimport_authorization).retained_editor_urls.includes(actualUrl))throw Error('Reimport must use a new private draft and preserve the old draft');
 const freshFloor=Math.max(Date.parse(attempt.created),Date.now()-24*3600000);
 timestamp(read.saved_at,attempt.consumed_at?Date.parse(attempt.consumed_at):0);
 timestamp(read.reopened_at,Math.max(freshFloor,Date.parse(String(read.saved_at))));timestamp(read.read_at,Date.parse(String(read.reopened_at)));
 if (read.verification_method !== 'agent_readback' || read.word_sha256 !== attempt.word_sha256 || read.target_account !== attempt.target_account || read.independently_reopened !== true || read.saved_indicator_observed !== true || read.images_loaded !== true || read.title !== baseline.title || JSON.stringify(read.paragraphs) !== JSON.stringify(baseline.paragraphs) || !Array.isArray(read.images) || read.images.length !== baseline.images.length) throw Error('Independent saved-draft title/body/account/image readback is incomplete or mismatched');
 const images = read.images.map((value, i) => {
  const image = object(value), expected = baseline.images[i];
  if (image.reference_sha256 !== expected.sha256 || image.after_paragraph !== expected.after_paragraph) throw Error('Draft image order or paragraph anchor differs from the Word');
  return {reference_sha256: expected.sha256, after_paragraph: expected.after_paragraph, observed_url: assetUrl(image.observed_url)};
 });
 let cover;
 if (attempt.platform === 'zhihu') {
  const input = object(read.cover);
  if (input.loaded !== true || !baseline.images.some(image => image.sha256 === input.reference_sha256)) throw Error('Zhihu requires a loaded cover verified against a frozen Word image');
  cover = {loaded: true, reference_sha256: input.reference_sha256, observed_url: assetUrl(input.observed_url)};
 }
 return {verification_method: 'agent_readback', word_sha256: attempt.word_sha256, target_account: attempt.target_account, draft_url: actualUrl, independently_reopened: true, saved_indicator_observed: true, images_loaded: true, title: baseline.title, paragraphs: baseline.paragraphs, images, ...(cover ? {cover} : {}), saved_at:read.saved_at,reopened_at:read.reopened_at,read_at: read.read_at, verified_at: now()};
}

// Older status writers cannot bypass the receipt protocol, even for a legacy article without a manifest.
export async function guardUploadStatus(owner: string, article: Article, destination: Platform, state: string, draftUrl?: string | null,message?:unknown) {
 if(message!==undefined&&await unsafeEvidence(owner,message))throw Error('Status message contains unsafe credential content; nothing saved');
 const attempt = await row(owner, article.id, destination);
 if(attempt&&await executorEnd(owner,attempt.id))throw Error('Ended upload attempt is immutable');
 if (draftUrl) {uploadEditorUrl(destination, draftUrl);const retainedLegacy=!!attempt&&['owner_confirmed_legacy_reimport','unconsumed_continuation'].includes(attempt?.authorization_kind||'')&&['toutiao_saving','saving','needs_login','needs_verification','failed'].includes(state)&&JSON.parse(attempt.reimport_authorization!).retained_destination_url===draftUrl;if(attempt&&!JSON.parse(attempt.editor_urls).includes(draftUrl)&&!retainedLegacy)throw Error('Record and retain the real editor URL on the same upload attempt first');}
 if (state === 'completed' || state === 'saved') {
  if (!attempt || attempt.state !== 'verified' || !attempt.readback) throw Error('Verified same-attempt independent readback required before completed/saved');
  const readback = JSON.parse(attempt.readback);
  if (!draftUrl || draftUrl !== readback.draft_url || attempt.word_sha256 !== JSON.parse(article.result_meta || '{}').sha256) throw Error('Completion must reference the verified Word and same actual draft URL');
  return readback;
 }
 if (state === 'toutiao_saving' || state === 'saving') {
  if (!attempt || attempt.state === 'reserved' || attempt.state === 'verified') throw Error('Consume the upload gate once, or recover the already-consumed attempt without importing');
 }
 if (state === 'failed' && (attempt || article.state === 'toutiao_saving')) throw Error('Upload outcome cannot be reset to failed; retain uncertainty and reconcile the same draft');
 return null;
}
