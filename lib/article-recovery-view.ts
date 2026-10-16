import {unfinishedManualWordClaim,manualWordRecoveryGuidance,sourceRecoveryBlockedGuidance} from './article-word-claim-guard';
/** Public progress only. No tokens, claim rotation or browser permission. */
type Lease = {id?:string;article_id?:string;source_key?:string;manual_word_recovery_required?:boolean;word_recovery_source_blocked?:boolean;word_recovery_source_reason?:string;state:string;claim_token?:string|null;claim_present?:number|boolean;claim_expires?:string|null;draft_url?:string|null;platform?:string;updated?:string|null};
export function executionRecoveryGuidance(platform:string){
 return {platform,next_tool:'preview_article_claim_recovery',wait_for_expiry_required:false,requires_owner_termination_confirmation:true,recovery_tool:'recover_article_claim',preserve_existing_word:true,new_platform_upload_allowed:false,guidance:'若执行者仍在工作，继续等待；若本人已确认原执行结束且内存凭据不可用，可立即核对并恢复现有进度，无需等占用到期。恢复须本人明确授权，不授予文件重传许可。'};
}
export function articleContinuation(row:Lease & {has_word:boolean;output_mode?:string|null}, deliveries:Lease[]) {
 if(row.output_mode==='text_only'||['text_saved','deleting'].includes(row.state))return {remaining_platforms:[],next_tool:null,reuse_existing_word:row.has_word,new_platform_upload_allowed:false};
 if(row.word_recovery_source_blocked&&unfinishedManualWordClaim(row))return {remaining_platforms:[],...sourceRecoveryBlockedGuidance(row.word_recovery_source_reason),next_platform:null,reuse_existing_word:row.has_word};
 if(row.manual_word_recovery_required&&unfinishedManualWordClaim(row))return {remaining_platforms:['toutiao',...(!deliveries.some(d=>d.platform==='zhihu'&&d.state==='saved')?['zhihu']:[])],...manualWordRecoveryGuidance(),next_platform:null,reuse_existing_word:false};
 const remaining_platforms=[...(row.state==='completed'?[]:['toutiao']),...(!deliveries.some(d=>d.platform==='zhihu'&&d.state==='saved')?['zhihu']:[])];
 const next_tool=!remaining_platforms.length?null:row.state==='completed'?(row.has_word?'claim_article_delivery':'read_article_manifest'):'claim_article';
 return {remaining_platforms,next_tool,next_platform:next_tool==='claim_article_delivery'?'zhihu':null,reuse_existing_word:row.has_word,new_platform_upload_allowed:false,guidance:row.state==='completed'?'头条已完成并保持只读；主任务 claimed=false 只表示主任务不可认领。知乎未完成时先读取本平台记录，再独立 claim_article_delivery(platform=zhihu)，复用已有 Word；仍须原上传许可和真实草稿核验。':'先读取已有 Word 与各平台记录，再认领未完成阶段；保留已保存成果。'};
}
export function articleRecoveryView(row:Lease & {output_mode?:string|null;notification_state?:string|null;notification_created?:string|null;notification_expires?:string|null}, deliveries:Lease[], now=Date.now()) {
 const mainDone=['completed','text_saved','deleting'].includes(row.state);
 const destinationPending=deliveries.some(d=>d.platform==='zhihu'&&d.state!=='saved');
 const unfinished=!mainDone||(row.state==='completed'&&(destinationPending||!deliveries.some(d=>d.platform==='zhihu'&&d.state==='saved')));
 if(row.word_recovery_source_blocked&&unfinishedManualWordClaim(row))return {unfinished:true,can_notify:false,can_retry:false,waiting_for_executor:false,lease_expires:row.claim_expires||null,execution_recovery:[sourceRecoveryBlockedGuidance(row.word_recovery_source_reason)],action:'wait_for_source_review',preserve_existing_word:true,new_platform_upload_allowed:false};
 const leases=[...(!mainDone?[row]:[]),...deliveries.filter(d=>d.platform==='zhihu'&&d.state!=='saved')];
 const active=leases.filter(d=>(!!d.claim_token||!!d.claim_present)&&!!d.claim_expires&&Number.isFinite(Date.parse(d.claim_expires))&&Date.parse(d.claim_expires)>now);
 const expires=active.map(d=>d.claim_expires!).sort().at(-1)||null;
 const can_notify=unfinished&&row.output_mode!=='text_only'&&!active.length&&row.state!=='deleting';
 const expiredSend=row.notification_state==='sending'&&!!row.notification_expires&&Date.parse(row.notification_expires)<=now;
 const pendingNotification=['sending','delivered'].includes(row.notification_state||'')&&!expiredSend;
 const notifiedAt=Date.parse(row.notification_created||'');
 const interrupted=['failed','needs_login','needs_verification'];
 // Presentation hints only: terminal status writes normally end the main lease,
 // while delivery has its own updated time. These times do not prove an executor
 // stopped and never grant a claim or upload. Suppress old recovery hints while
 // a newer notification is awaiting the executor.
 const faults=[...(interrupted.includes(row.state)?[{at:row.claim_expires}]:[]),...deliveries.filter(d=>d.platform==='zhihu'&&interrupted.includes(d.state)).map(d=>({at:d.updated}))];
 const newFault=faults.some(f=>!pendingNotification||(Number.isFinite(notifiedAt)&&!!f.at&&Date.parse(f.at)>notifiedAt));
 const can_retry=can_notify&&(row.notification_state!=='sending'||expiredSend)&&(newFault||row.notification_state==='unknown'||expiredSend);
 const waiting_for_executor=can_notify&&!can_retry&&pendingNotification&&!['processing','word_ready','toutiao_saving'].includes(row.state);
 return {unfinished:unfinished&&row.output_mode!=='text_only',can_notify,can_retry,waiting_for_executor,lease_expires:expires,execution_recovery:active.map(d=>d===row&&row.manual_word_recovery_required?manualWordRecoveryGuidance():executionRecoveryGuidance(d.platform||'toutiao')),action:row.output_mode==='text_only'?'read_text':!unfinished?'read_result':active.length?'wait_or_owner_authorized_recovery':waiting_for_executor?'wait_for_executor':'notify_same_article',preserve_existing_word:true,new_platform_upload_allowed:false};
}
