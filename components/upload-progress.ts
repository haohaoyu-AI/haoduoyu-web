export type UploadProgress={platform:string;attempt:{state:string;consumed_at?:string|null}|null;diagnostic:{stage:string;outcome:string;cause:string}|null;diagnostic_superseded:boolean};
export function uploadProgressText(progress:UploadProgress|undefined){
 if(!progress)return null;
 const d=progress.diagnostic;
 if(d?.outcome==='failed'&&!progress.diagnostic_superseded){
  if(d.stage==='file_submission')return d.cause==='permission_denied'?'文件提交受工具审批限制，执行已暂停；提交结果待确认，先核对已有草稿，不重复提交':'文件提交结果待确认，请先核对已有草稿；保留本次尝试，不重复提交';
  if(d.cause==='permission_denied')return '页面操作受工具审批限制，执行已暂停；保留 Word 和草稿，等待该操作获准';
  if(d.cause==='tool_unavailable'||d.cause==='browser_disconnected')return '执行工具或浏览器连接不可用；保留 Word 和已有进度，核对原执行是否结束';
  if(d.stage==='file_handoff')return 'Word 文件交接未完成；核对同一浏览器里的最终 Word 字节和文件名';
  if(d.stage==='chooser_wait')return '文件选择器步骤失败，尚未确认文件提交；核对导入弹窗中的实际选择文档按钮';
  if(d.stage==='platform_import'&&d.cause==='platform_rejected')return '平台明确提示文档导入失败；保留本次尝试，核对 Word 兼容性和实际文件字节。已有本人重导授权且原执行结束后，才可使用关联新尝试';
  return '执行结果待核对';
 }
 if(progress.attempt?.state==='draft_observed')return '已发现草稿，完整验收待确认';
 if(progress.attempt?.state==='outcome_unknown')return '文档导入结果待确认';
 if(progress.attempt?.state==='reserved')return 'Word 已准备，等待文件导入';
 return null;
}
