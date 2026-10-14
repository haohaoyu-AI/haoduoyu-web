import {owner} from '../../../../lib/test-store';
import {readClaudeHistoricalResult} from '../../../../lib/claude';
export async function GET(request: Request) {
 const user = owner(request);
 if (!user) return new Response('Unauthorized', {status: 401});
 const url = new URL(request.url);
 try {return Response.json(await readClaudeHistoricalResult(user, {day: url.searchParams.get('day'), scope: url.searchParams.get('scope')}), {headers: {'Cache-Control': 'private, no-store'}});}
 catch {return Response.json({error: '历史结果读取未完成，请检查日期和范围；不会重新调用模型'}, {status: 400, headers: {'Cache-Control': 'private, no-store'}});}
}
