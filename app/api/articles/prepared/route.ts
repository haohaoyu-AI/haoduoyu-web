import {owner} from '../../../../lib/test-store';
import {registerPreparedArticle} from '../../../../lib/prepared-article';
export async function POST(request: Request) {
 const user = owner(request);
 if (!user) return new Response('Unauthorized', {status: 401});
 if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('x-prepared-import') !== '1') return new Response('Forbidden', {status: 403});
 try {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 40000) return new Response('Too large', {status: 413});
  const result = await registerPreparedArticle(user, JSON.parse(raw));
  return Response.json(result, {headers: {'Cache-Control': 'private, no-store'}});
 } catch {return Response.json({error: '导入未确认；请读取已有记录。不会重新写作、搜图或投递。'}, {status: 400, headers: {'Cache-Control': 'private, no-store'}});}
}
