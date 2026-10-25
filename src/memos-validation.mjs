import {fail} from './security.mjs';

export const MEMO_LIMITS=Object.freeze({groups:32,notes:200,title:120,body:65536,position:1000000});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export function memoId(value) {
  if(typeof value!=='string'||!uuid.test(value))throw fail(400,'VALIDATION_ERROR','备忘录标识无效');
  return value;
}
export function memosOwner(env) {
  const id=env.MEMOS_OWNER_ID;
  if(typeof id!=='string'||!uuid.test(id.toLowerCase()))throw fail(503,'MEMOS_CONFIG','备忘录尚未配置明确归属');
  return id.toLowerCase();
}
function plain(value) {
  return typeof value==='string'&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}
export function memoTitle(value) {
  if(!plain(value)||/[\r\n\t]/.test(value)||!value.trim()||Array.from(value.trim()).length>MEMO_LIMITS.title)
    throw fail(400,'VALIDATION_ERROR','标题须为 1–120 字的单行纯文字');
  return value.trim();
}
export function memoInput(input,kind,method,restore) {
  const fields=['version','save_id'];
  if(method==='PUT')fields.push('title','position',...(kind==='notes'?['group_id','body']:[]));
  if(method==='DELETE'&&kind==='groups')fields.push('confirm_title','confirm_note_count');
  if(Object.keys(input).sort().join(',')!==fields.sort().join(',')||!Number.isSafeInteger(input.version)||
    input.version<(method==='PUT'?0:1)||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','备忘录字段或版本无效');
  memoId(input.save_id);
  if(method==='PUT') {
    input.title=memoTitle(input.title);
    if(!Number.isSafeInteger(input.position)||input.position<0||input.position>MEMO_LIMITS.position)
      throw fail(400,'VALIDATION_ERROR','排序位置无效');
    if(kind==='notes') {
      memoId(input.group_id);
      if(!plain(input.body))throw fail(400,'VALIDATION_ERROR','正文必须为纯文字');
      input.body=input.body.replace(/\r\n?/g,'\n');
      if(Buffer.byteLength(input.body,'utf8')>MEMO_LIMITS.body)throw fail(413,'MEMOS_TOO_LARGE','正文最多 64KiB，请保留未保存草稿');
    }
  }
  if(method==='DELETE'&&kind==='groups') {
    if(typeof input.confirm_title!=='string'||!Number.isSafeInteger(input.confirm_note_count)||
      input.confirm_note_count<0||input.confirm_note_count>MEMO_LIMITS.notes)
      throw fail(400,'VALIDATION_ERROR','删除分组须确认标题和笔记数量');
  }
  if(restore&&method!=='POST')throw fail(404,'NOT_FOUND','备忘录接口不存在');
  return input;
}
