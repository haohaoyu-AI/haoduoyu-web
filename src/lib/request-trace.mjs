import { randomUUID } from 'node:crypto';

const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']);
const paths = [
  '/', '/index.html', '/app.js', '/style.css', '/favicon.svg', '/openapi.json', '/robots.txt', '/llms.txt', '/api-docs', '/health',
  ...['bootstrap', 'auth/me', 'auth/login', 'auth/logout', 'auth/password', 'accounts', 'articles', 'observations',
    'daily-metrics', 'todos', 'todo-templates', 'todo-preferences', 'dashboard', 'overview', 'due-reviews', 'api-keys', 'audit', 'backup', 'export'].map(path => '/api/v1/' + path),
];
const routes = new Map(paths.map(path => [path, path]));
const dynamic = ['articles', 'accounts', 'api-keys', 'todos', 'todo-templates'].map(name => [
  new RegExp('^/api/v1/' + name + '/[^/]+$'), '/api/v1/' + name + '/{id}',
]);
for(const action of ['restore','template']) dynamic.push([new RegExp('^/api/v1/todos/[^/]+/'+action+'$'),'/api/v1/todos/{id}/'+action]);
const labels = new Set([...paths, ...dynamic.map(([, label]) => label), 'unmatched', 'unmatched-api', 'unmatched-static']);
const safeMethod = method => methods.has(method) ? method : 'OTHER';

export function requestTrace(method) {
  return {rid: randomUUID(), method: safeMethod(method), route: 'unmatched'};
}
export function traceRoute(path) {
  if (typeof path !== 'string') return 'unmatched';
  if (routes.has(path)) return routes.get(path);
  for (const [pattern, label] of dynamic) if (pattern.test(path)) return label;
  return path.startsWith('/api/v1/') ? 'unmatched-api' : 'unmatched-static';
}
export function withRequestId(response, context) {
  try {
    response.headers.set('X-Request-Id', context.rid);
    return response;
  } catch {
    // Immutable fetch/redirect headers: reuse the stream, never clone/tee/read it.
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', context.rid);
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  }
}
function failureClass(error, returned) {
  if (returned) return {name: 'ReturnedResponse', message: '服务端返回失败状态'};
  try {
    if (error instanceof SyntaxError) return {name: 'SyntaxError', message: '服务端数据解析失败'};
    if (error instanceof TypeError) return {name: 'TypeError', message: '服务端类型处理失败'};
    if (error instanceof RangeError) return {name: 'RangeError', message: '服务端数值处理失败'};
    if (error instanceof Error) return {name: 'Error', message: '服务端请求处理失败'};
  } catch {}
  return {name: 'UnknownError', message: '服务端请求处理失败'};
}
export function logServerFailure(context, error, returned = false) {
  // No error properties, causes, request bodies, headers or raw URL reach JSON.
  // Logging itself must never change the response or retry a second log write.
  try {
    const {name, message} = failureClass(error, returned);
    console.error(JSON.stringify({rid: context.rid, method: safeMethod(context.method),
      route: labels.has(context.route) ? context.route : 'unmatched', name, message}));
  } catch {}
}
