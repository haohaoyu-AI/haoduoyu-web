import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {requestTrace, traceRoute, withRequestId, logServerFailure} from '../src/lib/request-trace.mjs';

test('contexts use independent server UUIDs and only controlled method/route values', () => {
  const contexts = Array.from({length: 100}, () => requestTrace('GET'));
  assert.equal(new Set(contexts.map(row => row.rid)).size, 100);
  for (const row of contexts) assert.match(row.rid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const canary = 'synthetic-' + randomUUID();
  assert.equal(requestTrace(canary).method, 'OTHER');
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal(requestTrace(method).method, method);
  for (const name of ['articles', 'accounts', 'api-keys', 'todos']) assert.equal(traceRoute('/api/v1/' + name + '/' + canary), '/api/v1/' + name + '/{id}');
  assert.equal(traceRoute('/api/v1/' + canary), 'unmatched-api');
  assert.equal(traceRoute('/' + canary), 'unmatched-static');
  for (const path of ['/health', '/', '/app.js', '/api/v1/auth/password', '/api/v1/dashboard', '/api/v1/due-reviews']) assert.equal(traceRoute(path), path);
});

test('500 logging uses fixed classifications without traversing names, causes or nested canaries', t => {
  const canary = 'synthetic-' + randomUUID(), logs = [];let touched = 0;
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const context = requestTrace('GET');context.route = '/api/v1/articles/{id}';
  for (const Class of [Error, TypeError, SyntaxError, RangeError]) {
    const error = new Class(canary + '\r\n' + 'x'.repeat(100000));
    Object.defineProperty(error, 'name', {get() {touched++;throw new Error(canary);}});
    Object.defineProperty(error, 'cause', {get() {touched++;throw new Error(canary);}});
    Object.defineProperty(error, 'toJSON', {get() {touched++;throw new Error(canary);}});
    logServerFailure(context, error);
    const call = logs.at(-1);assert.equal(call.length, 1);assert.equal(typeof call[0], 'string');
    const row = JSON.parse(call[0]);assert.equal(row.name, Class.name);assert.equal(row.rid, context.rid);
    assert.deepEqual(Object.keys(row).sort(), ['rid', 'method', 'route', 'name', 'message'].sort());
    assert.equal(call[0].includes(canary), false);assert.equal(call[0].includes('\n'), false);assert.ok(call[0].length < 512);
  }
  assert.equal(touched, 0);
  logServerFailure({...context, method: canary, route: canary}, {name: canary, message: canary});
  const unknown = JSON.parse(logs.at(-1)[0]);assert.equal(unknown.name, 'UnknownError');assert.equal(unknown.method, 'OTHER');assert.equal(unknown.route, 'unmatched');
  logServerFailure(context, new Proxy({}, {getPrototypeOf() {throw new Error(canary);}}));
  assert.equal(JSON.parse(logs.at(-1)[0]).name, 'UnknownError');
  logServerFailure(context, null, true);assert.equal(JSON.parse(logs.at(-1)[0]).name, 'ReturnedResponse');
});

test('a failing log sink is attempted once and cannot propagate an exception', t => {
  let attempted = 0;
  t.mock.method(console, 'error', () => {attempted++;throw new Error('Synthetic unavailable log sink');});
  assert.doesNotThrow(() => logServerFailure(requestTrace('GET'), new Error('Synthetic failure')));
  assert.equal(attempted, 1);
});

test('mutable success streams are not read, cloned or buffered while assigning the header', async () => {
  let pulls = 0, cancellations = 0;
  const stream = new ReadableStream({pull() {pulls++;}, cancel() {cancellations++;}}, {highWaterMark: 0});
  const response = new Response(stream), context = requestTrace('GET');
  const traced = withRequestId(response, context);
  assert.equal(traced, response);assert.equal(traced.body, stream);assert.equal(traced.bodyUsed, false);assert.equal(pulls, 0);
  assert.equal(traced.headers.get('X-Request-Id'), context.rid);
  await traced.body.cancel();assert.equal(cancellations, 1);assert.equal(pulls, 0);
});

test('immutable headers are copied without changing status, location or body and do not share IDs', () => {
  const original = Response.redirect('http://localhost/synthetic-fixed', 302);
  assert.throws(() => original.headers.set('Synthetic', 'value'));
  const a = requestTrace('GET'), b = requestTrace('GET');
  const first = withRequestId(original, a), second = withRequestId(original, b);
  assert.equal(first.status, 302);assert.equal(first.headers.get('Location'), original.headers.get('Location'));
  assert.equal(first.body, null);assert.equal(first.headers.get('X-Request-Id'), a.rid);assert.equal(second.headers.get('X-Request-Id'), b.rid);
  assert.equal(original.headers.has('X-Request-Id'), false);
});
