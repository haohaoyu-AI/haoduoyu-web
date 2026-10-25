import {fail} from './security.mjs';
import {snapshotDate} from './business-snapshot.mjs';

export const NOTE_ENTRY_LIMITS=Object.freeze({per_day:200,text:65536});
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function noteEntryId(value) {
  if(typeof value!=='string'||!uuid.test(value))throw fail(400,'VALIDATION_ERROR','碎碎念标识无效');
  return value.toLowerCase();
}
export function noteEntryCategory(value='life') {
  if(value!=='life'&&value!=='work')throw fail(400,'VALIDATION_ERROR','碎碎念分类无效');
  return value;
}
export function noteEntryQuery(query,allowed) {
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))
    throw fail(400,'VALIDATION_ERROR','碎碎念查询参数无效');
}
export function noteEntryInput(input,method) {
  const expected=method==='PUT'?['category','date','text','version','save_id']:['version','save_id'];
  if(Object.keys(input).sort().join(',')!==expected.sort().join(',')||
    !Number.isSafeInteger(input.version)||input.version<(method==='PUT'?0:1)||input.version>=Number.MAX_SAFE_INTEGER)
    throw fail(400,'VALIDATION_ERROR','碎碎念字段或版本无效');
  const value={...input,save_id:noteEntryId(input.save_id)};
  if(method==='PUT') {
    value.category=noteEntryCategory(input.category);
    value.date=snapshotDate(input.date);
    if(typeof input.text!=='string'||!input.text.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.text))
      throw fail(400,'VALIDATION_ERROR','正文必须为纯文字');
    value.text=input.text.replace(/\r\n?/g,'\n');
    if(Buffer.byteLength(value.text,'utf8')>NOTE_ENTRY_LIMITS.text)
      throw fail(413,'NOTES_TOO_LARGE','正文最多 64KiB，请保留未保存草稿');
  }
  return value;
}
