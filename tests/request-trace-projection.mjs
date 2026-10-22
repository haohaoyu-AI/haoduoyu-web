import assert from 'node:assert/strict';

export const REQUEST_ID_HEADER = {
  description: '服务端为每次请求独立生成的 UUID，不采用客户端值。所有响应均包含此头，包括静态资源、HEAD 和 304；错误 JSON 顶层 request_id 与其一致。',
  schema: {type: 'string', format: 'uuid'},
};
export const REQUEST_ID_FIELD = {
  type: 'string', format: 'uuid', readOnly: true,
  description: '服务端生成的本次请求关联 ID，位于错误 JSON 顶层，与 X-Request-Id 响应头一致；原有 error 或 data 字段保持不变。',
};
export function assertRequestId(headers, required = false) {
  const id = new Headers(headers).get('X-Request-Id');
  if (id !== null || required) assert.match(id ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'valid server request ID');
  return id;
}
export function traceHeaders(headers, required = false) {
  assertRequestId(headers, required);
  const result = new Headers(headers);result.delete('X-Request-Id');return result;
}
export function traceJSON(value, status, headers, required = false) {
  const id = assertRequestId(headers, required), object = value && typeof value === 'object' && !Array.isArray(value);
  if (status < 400) {
    if (object) assert.equal(Object.hasOwn(value, 'request_id'), false, 'success business JSON must not gain a request ID');
    return value;
  }
  if (required || id !== null || object && Object.hasOwn(value, 'request_id')) {
    assert.ok(object, 'error JSON envelope');assert.ok(id, 'error trace requires its header');
    assert.equal(value.request_id, id, 'top-level error ID must equal the response header');
    const copy = structuredClone(value);delete copy.request_id;return copy;
  }
  return value;
}
export function traceText(text, status, headers, required = false) {
  assertRequestId(headers, required);
  if (status >= 400 && new Headers(headers).get('Content-Type')?.includes('application/json')) {
    const value = JSON.parse(text), projected = traceJSON(value, status, headers, required);
    return projected === value ? text : JSON.stringify(projected);
  }
  return text;
}
export function traceDocument(spec) {
  const value = structuredClone(spec), components = value.components;
  if (!Object.hasOwn(components.headers ?? {}, 'RequestId')) {
    assert.equal(Object.hasOwn(components.schemas.Error.properties, 'request_id'), false);
    return value;
  }
  assert.deepEqual(components.headers.RequestId, REQUEST_ID_HEADER);
  assert.deepEqual(components.schemas.Error.properties.request_id, REQUEST_ID_FIELD);
  delete components.headers.RequestId;if (!Object.keys(components.headers).length) delete components.headers;
  delete components.schemas.Error.properties.request_id;
  const responses = [...Object.values(components.responses), ...Object.values(value.paths)
    .flatMap(path => Object.values(path).flatMap(operation => Object.values(operation.responses ?? {})))];
  for (const response of responses) {
    if (response.$ref) continue;
    assert.deepEqual(response.headers?.['X-Request-Id'], {$ref: '#/components/headers/RequestId'});
    delete response.headers['X-Request-Id'];if (!Object.keys(response.headers).length) delete response.headers;
  }
  return value;
}
