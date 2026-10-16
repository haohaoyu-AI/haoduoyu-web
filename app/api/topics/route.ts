import { getTopicBoard, getTopicHistory, getTopicResearch, isTopicBoardPlatform, isTopicPlatform } from '../../../lib/topic-candidates';
import { owner } from '../../../lib/test-store';

export const dynamic = 'force-dynamic';

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
};

export async function GET(request: Request) {
  const userId = owner(request);
  if (!userId) return Response.json({ error: '请使用本人 ChatGPT 账号登录' }, { status: 401, headers: privateHeaders });

  const search = new URL(request.url).searchParams;
  const view = search.get('view');
  if (view && !['platform', 'history'].includes(view)) {
    return Response.json({ error: '视图参数无效' }, { status: 400, headers: privateHeaders });
  }
  const refreshValue = search.get('refresh');
  if (refreshValue && refreshValue !== '1') {
    return Response.json({ error: '刷新参数无效' }, { status: 400, headers: privateHeaders });
  }
  const requestedPlatform = search.get('platform');
  if (view === 'history' && requestedPlatform) {
    return Response.json({ error: '历史视图不接受平台参数' }, { status: 400, headers: privateHeaders });
  }
  if (view === 'platform' && (!requestedPlatform || !isTopicBoardPlatform(requestedPlatform))) {
    return Response.json({ error: '平台参数无效' }, { status: 400, headers: privateHeaders });
  }
  if (!view && requestedPlatform && requestedPlatform !== 'all' && !isTopicPlatform(requestedPlatform)) {
    return Response.json({ error: '平台筛选无效' }, { status: 400, headers: privateHeaders });
  }
  const platform = requestedPlatform && requestedPlatform !== 'all' && isTopicPlatform(requestedPlatform)
    ? requestedPlatform
    : undefined;

  try {
    if (view === 'history') return Response.json(await getTopicHistory(userId), { headers: privateHeaders });
    if (view === 'platform' && requestedPlatform && isTopicBoardPlatform(requestedPlatform)) {
      return Response.json(await getTopicBoard(requestedPlatform, refreshValue === '1'), { headers: privateHeaders });
    }
    const result = await getTopicResearch(userId, {
      refresh: refreshValue === '1',
      platform,
    });
    return Response.json(result, { headers: privateHeaders });
  } catch {
    return Response.json({ error: '暂时无法读取选题信息，请稍后重试' }, { status: 503, headers: privateHeaders });
  }
}
