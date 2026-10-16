import { owner } from '../../../../../lib/test-store';
import { ArticleDeletionError, deleteArticlePermanently } from '../../../../../lib/article-deletion';

type DeleteRequestBody = {
  article_id?: unknown;
  confirm_article_id?: unknown;
  confirm_title?: unknown;
  confirm_permanent?: unknown;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const currentOwner = owner(request);
  if (!currentOwner) return Response.json({ error: '请使用本人账号登录' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-xiaoyu-upload') !== '1') {
    return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  try {
    const { id } = await params;
    if (typeof id !== 'string' || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new ArticleDeletionError('删除请求无效', 400);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 2048) throw new ArticleDeletionError('删除请求过大', 413);
    let body: DeleteRequestBody;
    try { body = JSON.parse(raw); } catch { throw new ArticleDeletionError('删除确认无效', 400); }
    if (!body || typeof body.article_id !== 'string' || typeof body.confirm_article_id !== 'string'
      || typeof body.confirm_title !== 'string' || typeof body.confirm_permanent !== 'boolean'
      || body.article_id !== id) throw new ArticleDeletionError('文章编号与当前页面不匹配', 400);
    const result = await deleteArticlePermanently(currentOwner, {
      article_id: body.article_id,
      confirm_article_id: body.confirm_article_id,
      confirm_title: body.confirm_title,
      confirm_permanent: body.confirm_permanent,
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: unknown) {
    if (error instanceof ArticleDeletionError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return Response.json({ error: '删除未完成；请刷新核对状态后再重试同一篇文章' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
