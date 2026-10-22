import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fixture, USERNAME} from './harness.mjs';

const source = await frontendSource();

function auditHtml(identity, rows) {
  const body = {style: {}};
  const context = vm.createContext({AbortController, AbortSignal, DOMException, Headers,
    document: {body, activeElement: body, querySelector() {}, querySelectorAll: () => [], addEventListener() {}},
    window: {addEventListener() {}}, location: {href: 'http://localhost/', search: ''},
    history: {replaceState() {}}, URL, URLSearchParams, Intl,
    localStorage: {getItem() {}}, requestAnimationFrame() {}, setTimeout, clearTimeout,
    identity, rows,
  });
  new vm.Script(source).runInContext(context);
  return vm.runInContext('state.me=identity;renderAudit(rows)', context);
}

test('authenticated identity adds its exact user id and renders only that audit actor as me', async t => {
  const app = await fixture(t);
  const session = await app.login();
  const result = await app.request('/api/v1/auth/me', {session});
  assert.equal(result.status, 200);
  const user = await app.db.prepare('SELECT id FROM matrix_users WHERE username=?').bind(USERNAME).first();
  assert.equal(typeof result.data.id, 'string', 'authenticated response must include user id');
  assert.equal(result.data.id, user.id);
  const {id, ...legacy} = result.data;
  assert.deepEqual(legacy, {username: USERNAME, csrfToken: session.csrfToken});
  const rows = (await app.request('/api/v1/audit', {session})).data;
  assert.ok(rows.some(row => row.actor === 'user:' + id));
  const html = auditHtml(result.data, rows.concat({
    action: 'auth.login', actor: 'user:' + id + '-other', created_at: '2001-01-01T00:00:00Z',
  }));
  assert.match(html, /我 ·/);
  assert.match(html, /用户 2/);
  assert.doesNotMatch(auditHtml(legacy, rows), /我 ·/);
});

test('identity authorization errors retain their old HTTP and JSON contract', async t => {
  const app = await fixture(t);
  const anonymous = await app.request('/api/v1/auth/me');
  assert.equal(anonymous.status, 401);
  assert.deepEqual(anonymous.json, {error: {code: 'UNAUTHORIZED', message: '请先登录'}});
  const session = await app.login();
  const accounts = (await app.request('/api/v1/accounts', {session})).data;
  const key = await app.request('/api/v1/api-keys', {method: 'POST', session,
    body: {name: 'Synthetic identity scope', account_ids: [accounts[0].id], permissions: ['read']}});
  assert.equal(key.status, 201);
  const denied = await app.request('/api/v1/auth/me', {token: key.data.token});
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.json, {error: {code: 'FORBIDDEN', message: '此操作仅限网站管理员'}});
  assert.equal(Object.hasOwn(denied.json, 'data'), false);
});

test('OpenAPI 1.1.0 adds current identity without requiring id in the legacy login schema', async () => {
  const spec = JSON.parse(await readFile(new URL('../public/openapi.json', import.meta.url), 'utf8'));
  assert.equal(spec.info.version, '1.1.0');
  const identity = spec.components.schemas;
  assert.deepEqual(identity.AdminIdentity.required, ['username', 'csrfToken']);
  assert.equal(Object.hasOwn(identity.AdminIdentity.properties, 'id'), false);
  assert.deepEqual(identity.CurrentAdminIdentity.allOf, [
    {$ref: '#/components/schemas/AdminIdentity'},
    {type: 'object', properties: {id: {
      type: 'string', description: '当前已认证管理员的稳定用户标识，用于精确匹配审计操作者；不是凭据。',
    }}, required: ['id']},
  ]);
  const success = path => spec.paths[path].post?.responses['200'] || spec.paths[path].get.responses['200'];
  const ref = response => response.content['application/json'].schema.properties.data.$ref;
  assert.equal(ref(success('/api/v1/auth/login')), '#/components/schemas/AdminIdentity');
  assert.equal(ref(success('/api/v1/auth/me')), '#/components/schemas/CurrentAdminIdentity');
});
