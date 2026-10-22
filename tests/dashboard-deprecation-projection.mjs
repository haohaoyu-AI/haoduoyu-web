import assert from 'node:assert/strict';

export const DEPRECATION_HEADER = {
  description: '该接口已弃用但继续保留兼容；尚无删除日期。',
  schema: {type: 'string', enum: ['true']},
};
// Project only the exact authorized addition. Every other header stays intact.
export function dashboardHeaders(path, status, headers) {
  const rows = [...headers], markers = rows.filter(([name]) => name.toLowerCase() === 'deprecation');
  if (markers.length) {
    assert.equal(new URL(path, 'http://localhost').pathname, '/api/v1/dashboard');
    assert.equal(status, 200);assert.deepEqual(markers.map(([, value]) => value), ['true']);
  }
  return rows.filter(([name]) => name.toLowerCase() !== 'deprecation');
}
export function dashboardSpec(spec) {
  const value = structuredClone(spec), operation = value.paths['/api/v1/dashboard'].get;
  const success = operation.responses['200'];
  if (Object.hasOwn(operation, 'deprecated') || Object.hasOwn(success, 'headers')) {
    assert.equal(operation.deprecated, true);
    assert.deepEqual(success.headers, {Deprecation: DEPRECATION_HEADER});
    delete operation.deprecated;delete success.headers;
  }
  return value;
}
