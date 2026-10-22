import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {traceHeaders, traceJSON, traceText, traceDocument} from './request-trace-projection.mjs';

test('legacy projection validates and removes only the authorized header and top-level error field', () => {
  const id = randomUUID(), headers = new Headers({'X-Request-Id': id, 'Cache-Control': 'no-store', 'X-Other-Trace': 'keep', 'Content-Type': 'application/json'});
  const value = {error: {code: 'SYNTHETIC', message: 'Synthetic error', details: {request_id: 'business-value'}},
    request_id: id, other_trace: 'keep'};
  const projected = traceJSON(value, 400, headers, true);
  assert.deepEqual(projected, {error: value.error, other_trace: 'keep'});
  assert.equal(value.request_id, id);assert.equal(traceHeaders(headers, true).get('X-Other-Trace'), 'keep');
  assert.equal(traceHeaders(headers, true).get('Cache-Control'), 'no-store');assert.equal(traceHeaders(headers, true).has('X-Request-Id'), false);
  assert.equal(traceText(JSON.stringify(value), 400, headers, true), JSON.stringify(projected));
  const legacy = {error: {code: 'SYNTHETIC', message: 'Synthetic error'}};
  assert.equal(traceJSON(legacy, 400, new Headers()), legacy);
  for (const broken of [{...value, request_id: randomUUID()}, legacy]) assert.throws(() => traceJSON(broken, 400, headers, true));
  assert.throws(() => traceJSON(value, 400, new Headers(), true));
  assert.throws(() => traceJSON({data: {}, request_id: id}, 200, headers, true));
  assert.throws(() => traceHeaders(new Headers({'X-Request-Id': 'synthetic-invalid'})));
  const success = {data: {request_id: 'business-value'}};assert.equal(traceJSON(success, 200, headers, true), success);
});

test('OpenAPI has only the compatible response-header and top-level error-ID additions', async () => {
  const value = JSON.parse(await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8'));
  const previous = JSON.parse(execFileSync('git', ['show', '24b5c5082a115cd9ee78e440c0848245079e6048:public/openapi.json'],
    {cwd: new URL('../', import.meta.url), encoding: 'utf8'}));
  assert.equal(value.info.version, '1.1.0');assert.deepEqual(traceDocument(value), previous);
  assert.deepEqual(value.components.schemas.Error.required, previous.components.schemas.Error.required);
  assert.deepEqual(value.components.schemas.Error.properties.error, previous.components.schemas.Error.properties.error);
  assert.deepEqual(value.paths['/api/v1/dashboard'].get.responses['200'].headers.Deprecation,
    previous.paths['/api/v1/dashboard'].get.responses['200'].headers.Deprecation);
  for (const mutate of [spec => {delete spec.paths['/health'].get.responses['200'].headers['X-Request-Id'];},
    spec => {spec.components.schemas.Error.properties.request_id.type = 'number';},
    spec => {delete spec.components.headers.RequestId;}]) {
    const copy = structuredClone(value);mutate(copy);assert.throws(() => traceDocument(copy));
  }
});
