import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import {handleUnscheduledTodos} from '../src/unscheduled-todos.mjs';

async function setup(t) {
  const app = await fixture(t), session = await app.login();
  async function call(route, {method = 'GET', body} = {}) {
    const request = new Request(app.origin + '/api/v1' + route, {method, headers:{Cookie:session.cookie, Origin:app.origin,
      'X-CSRF-Token':session.csrfToken, ...(body ? {'Content-Type':'application/json'} : {})}, ...(body ? {body:JSON.stringify(body)} : {})});
    const response = await handleUnscheduledTodos(app.db, request, route, app.origin);
    return {status:response.status, ...await response.json()};
  }
  return {app, call};
}
test('a future to-do gets, changes and clears its period through PATCH /period', async t => {
  const {app, call} = await setup(t), id = randomUUID();
  const created = await call('/unscheduled-todos', {method:'POST', body:{id, text:'看一场电影'}});
  assert.equal(created.status, 201); assert.ok(!Object.hasOwn(created.data, 'period'));
  const week = await call(`/unscheduled-todos/${id}/period`, {method:'PATCH', body:{period:'2026-W48', version:1}});
  assert.equal(week.data.period, '2026-W48'); assert.equal(week.data.version, 2);
  assert.deepEqual((await call(`/unscheduled-todos/${id}/period`, {method:'PATCH', body:{period:'2026-W48', version:1}})).data, week.data);
  await assert.rejects(call(`/unscheduled-todos/${id}/period`, {method:'PATCH', body:{period:'2026-12', version:1}}), e => e.status === 409);
  for (const period of ['下周', '2026-W60', '2026-11-20'])
    await assert.rejects(call(`/unscheduled-todos/${id}/period`, {method:'PATCH', body:{period, version:2}}), e => e.status === 400);
  assert.equal((await call('/unscheduled-todos')).data.items[0].period, '2026-W48');
  const cleared = await call(`/unscheduled-todos/${id}/period`, {method:'PATCH', body:{period:null, version:2}});
  assert.ok(!Object.hasOwn(cleared.data, 'period')); assert.equal(cleared.data.version, 3);
  const row = await app.db.prepare('SELECT period FROM matrix_unscheduled_todos WHERE id=?').bind(id).first();
  assert.equal(row.period, null);
  await assert.rejects(app.db.prepare("UPDATE matrix_unscheduled_todos SET period='soon' WHERE id=?").bind(id).run());
});
