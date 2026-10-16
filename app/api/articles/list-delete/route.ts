import { owner, db } from '../../../../lib/test-store';
import { ArticleDeletionError } from '../../../../lib/article-deletion';
import { previewListDeletion, readListDeletion, confirmListDeletion, cancelListDeletion } from '../../../../lib/article-list-deletion';
const headers = {'Cache-Control': 'private, no-store'};
type DeleteBody = {action:'preview';scope:'publish'|'writing';request_key:string;article_ids:string[]}
  | {action:'cancel';operation_id:string}
  | ({action:'confirm'} & Parameters<typeof confirmListDeletion>[1]);
function failure(error: unknown) {
  return Response.json({error: error instanceof ArticleDeletionError ? error.message : '清空结果尚未确认，请回读原操作'}, {status: error instanceof ArticleDeletionError ? error.status : 503, headers});
}
export async function GET(request: Request) {
  const user = owner(request);
  if (!user) return Response.json({error:'请使用本人账号登录'}, {status:401, headers});
  try {
    const url = new URL(request.url);
    let id = url.searchParams.get('operation_id');
    if (!id) {
      const key = url.searchParams.get('request_key');
      if (!key || !/^[0-9a-f-]{36}$/.test(key)) throw new ArticleDeletionError('操作编号无效', 400);
      id = (await db().prepare('SELECT id FROM article_list_deletions WHERE owner=? AND request_key=?').bind(user, key).first<{id:string}>())?.id || null;
    }
    if (!id) throw new ArticleDeletionError('未找到原操作；未执行删除', 404);
    return Response.json(await readListDeletion(user, id), {headers});
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const user = owner(request);
  if (!user) return Response.json({error:'请使用本人账号登录'}, {status:401, headers});
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-xiaoyu-list-delete') !== '1') return Response.json({error:'请求未获允许'}, {status:403, headers});
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return Response.json({error:'请求格式无效'}, {status:415, headers});
  try {
    if (!request.body) throw new ArticleDeletionError('请求格式无效', 400);
    const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', {fatal:true});
    let raw = '', size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) {await reader.cancel(); throw new ArticleDeletionError('请求过大', 413);} raw += decoder.decode(part.value, {stream:true}); } raw += decoder.decode(); } finally { reader.releaseLock(); }
    let body: DeleteBody; try {body = JSON.parse(raw);} catch {throw new ArticleDeletionError('请求格式无效', 400);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ArticleDeletionError('请求格式无效', 400);
    const allowed = body.action === 'preview' ? ['action','scope','request_key','article_ids'] : body.action === 'cancel' ? ['action','operation_id'] : body.action === 'confirm' ? ['action','operation_id','confirm_owner','confirm_scope','confirm_ids','snapshot_sha256','confirm_permanent'] : [];
    if (!allowed.length || Object.keys(body).some(key => !allowed.includes(key))) throw new ArticleDeletionError('请求格式无效', 400);
    return Response.json(body.action === 'preview' ? await previewListDeletion(user, body.scope, body.request_key, body.article_ids) : body.action==='cancel' ? await cancelListDeletion(user,body.operation_id) : await confirmListDeletion(user, body), {headers});
  } catch (error) { return failure(error); }
}
