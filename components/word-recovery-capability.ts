import type {WordProgress} from '../lib/word-progress-contract';
/** Display evidence, never turn a stale status or checkpoint row into a permission. */
export function retainedWordAdvice(progress:WordProgress|null|undefined,stale=false){
 if(!progress)return '原文保留；Word 成品和断点情况待核验。';
 if(progress.save.independently_confirmed===true)return stale?'上次已读回 Word 成品；请先重新核验当前状态。':'Word 成品已保存并读回核验，无需重新制作。';
 if(progress.save.cloud_ready||progress.save.state==='readback_pending')return '已有 Word 保存记录，先读回确认同一份成品。';
 if(progress.output)return progress.output.next_index>0?'已有 Word 声明和部分字节记录，核验后续传同一文件。':'已有 Word 输出声明，先核验接受情况，不能用重建替代未确认结果。';
 const assets=progress.retained_assets;
 if(assets?.metadata_known!==true||!Number.isSafeInteger(assets.image_checkpoint_records)||assets.image_checkpoint_records<0||!Number.isSafeInteger(assets.word_checkpoint_records)||assets.word_checkpoint_records<0)return '原文保留；Word 和图片断点仍待核验。';
 if(assets.word_checkpoint_records>0)return assets.reusable_word_checkpoint_verified===true?'可复用的 Word 断点已核验，无需重新制作。':'已有 Word 断点记录，需核验后续传同一文件。';
 if(assets.image_checkpoint_records>0)return '原文和图片断点记录保留，尚无 Word 成品；可核验后继续配图。';
 return '原文已保留，尚无 Word 成品；合法恢复后可从搜图继续。';
}
export function wordRecoveryActionCapability(progress:WordProgress,stale=false){
 const title=progress.output||progress.retained_assets?.word_checkpoint_records?'继续现有 Word':'重试配图 / 继续处理';
 const reasons:string[]=[];
 if(progress.recovery?.reason==='http_403')reasons.push('记录中的图片访问阻断仍待正规核验，不能自动解除或换路重试。');
 if(stale)reasons.push('当前是上次读取的状态，先重新读取进度。');
 const control=progress.recovery,attempt=progress.attempt;
 if(control?.execution_confirmed||control?.safety_stop_pending||['running','stop_requested','waiting_safe_stop'].includes(attempt?.state||''))reasons.push('原执行仍有效或安全停止未确认，不能并发重试。');
 if(progress.recovery_capability?.trusted_terminal_verifier_available!==true)reasons.push('可信原执行终态与映射核验接口尚未接通，不能用观察时间代填实际结束时间。');
 if(progress.recovery_capability?.page_recovery_adapter_available!==true)reasons.push('页面尚无受支持的无令牌恢复接口。恢复须本人确认、新鲜服务端预览和同一幂等请求。');
 if(!reasons.length)reasons.push('恢复入口尚未通过受支持服务端预览与执行接口的校验。');
 return {title,enabled:false as const,reasons,token_sent_to_frontend:false as const,new_execution_grant:false as const};
}
