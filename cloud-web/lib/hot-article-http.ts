export class HotArticleRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** Bound bytes while reading; content-length is only an early rejection hint. */
export async function readHotArticleRefresh(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HotArticleRequestError('刷新参数须为 JSON', 415);
  }
  const limit = 3000;
  if (Number(request.headers.get('content-length') || 0) > limit) throw new HotArticleRequestError('刷新参数过大', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new HotArticleRequestError('刷新参数无效');
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let bytes = 0, raw = '';
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new HotArticleRequestError('刷新参数过大', 413);
      }
      raw += decoder.decode(value, {stream: true});
    }
    const value: unknown = JSON.parse(raw + decoder.decode());
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['request_key', 'writer', 'authority_id'].includes(key))) {
      throw new HotArticleRequestError('刷新参数无效');
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HotArticleRequestError) throw error;
    throw new HotArticleRequestError('刷新参数无效');
  } finally { reader.releaseLock(); }
}

export function hotArticleQuery(url: URL) {
  const params = url.searchParams;
  if ([...params.keys()].some(key => !['view', 'id', 'request_key'].includes(key)) || [...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) {
    throw new HotArticleRequestError('读取参数无效');
  }
  if (params.has('view')) {
    if (params.get('view') !== 'settings' || params.has('id') || params.has('request_key')) throw new HotArticleRequestError('读取参数无效');
    return {settings: true as const, args: {}};
  }
  if (params.has('id') && params.has('request_key') || params.has('id') && !params.get('id') || params.has('request_key') && !params.get('request_key')) throw new HotArticleRequestError('读取参数无效');
  return {settings: false as const, args: params.has('id') ? {batch_id: params.get('id')!} : params.has('request_key') ? {request_key: params.get('request_key')!} : {}};
}
