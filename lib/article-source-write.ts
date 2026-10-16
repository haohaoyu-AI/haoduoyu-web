import {db} from './test-store';
import {bucket} from './articles';
import {validArticleObjectKey} from './article-deletion';

// D1 cannot fence an R2 put that was already in flight when another identical
// finalizer finished. Every article artifact writer must compensate that late put.
export async function writeArticleObject(owner:string,articleId:string,key:string,bytes:Uint8Array,options?:R2PutOptions) {
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(articleId)
   || !validArticleObjectKey(articleId,key))throw Error('文章文件位置无法确认');
 const rejectDeleted=async(cleanup=false)=>{
  if(await db().prepare('SELECT 1 AS deleted FROM article_deletions WHERE owner=? AND id=?').bind(owner,articleId).first()) {
   if(cleanup)await bucket().delete(key);
   throw Error('文章已进入永久删除，不能重新保存文件');
  }
 };
 await rejectDeleted();
 try {
  await bucket().put(key,bytes,options);
 } catch(error) {
  // Also covers a put whose response failed after R2 accepted the bytes. Never
  // remove another writer's valid source merely because this writer failed.
  await rejectDeleted(true);
  throw error;
 }
 await rejectDeleted(true);
}

export async function writeArticleSource(owner:string,articleId:string,key:string,bytes:Uint8Array) {
 const prefix=`articles/${articleId}/`;
 if(!key.startsWith(prefix)||!/^(?:writing|editorial|editorial-v2|editorial-v3)-[a-f0-9]{64}\.txt$/.test(key.slice(prefix.length)))throw Error('原文文件位置无法确认');
 return writeArticleObject(owner,articleId,key,bytes,{httpMetadata:{contentType:'text/plain; charset=utf-8'}});
}
