import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';

test('改文字 keeps the id, done state, note, date and template link of a dated to-do', async t => {
  const app=await fixture(t); const session=await app.login();
  const req=(path,method='GET',body)=>app.request('/api/v1'+path,{method,session,...(body?{body}:{})});
  const template=(await req('/todo-templates','POST',{id:randomUUID(),text:'合成常用事项'})).data;
  const todo=(await req('/todos','POST',{id:randomUUID(),date:'2026-11-06',text:template.text,template_id:template.id})).data;
  const ticked=(await req(`/todos/${todo.id}`,'PATCH',{completed:true,version:todo.version})).data;
  const noted=(await req(`/todos/${todo.id}/note`,'PATCH',{note:'已发给编辑',version:ticked.version})).data;
  const saved=await req(`/todos/${todo.id}/text`,'PATCH',{text:'  改过的事项  ',version:noted.version});
  assert.equal(saved.status,200);
  assert.equal(saved.data.id,todo.id); assert.equal(saved.data.text,'改过的事项'); assert.equal(saved.data.completed,true);
  assert.equal(saved.data.note,'已发给编辑'); assert.equal(saved.data.date,'2026-11-06'); assert.equal(saved.data.version,noted.version+1);
  assert.equal(saved.data.template_id,template.id); assert.equal(saved.data.template_active,true);
  // A repeated save of the same words is answered with the saved row; other words on the old version conflict.
  assert.equal((await req(`/todos/${todo.id}/text`,'PATCH',{text:'改过的事项',version:noted.version})).data.version,saved.data.version);
  assert.equal((await req(`/todos/${todo.id}/text`,'PATCH',{text:'别的字',version:noted.version})).status,409);
  const [row]=(await req('/todos?date=2026-11-06')).data.items;
  assert.equal(row.text,'改过的事项'); assert.equal(row.note,'已发给编辑'); assert.equal(row.completed,true);
  // The template keeps its own words.
  assert.equal((await req('/todo-templates')).data.items[0].text,'合成常用事项');
  // The old calls are unchanged: ticking and the note still work on the new version.
  const unticked=await req(`/todos/${todo.id}`,'PATCH',{completed:false,version:saved.data.version});
  assert.equal(unticked.status,200); assert.equal(unticked.data.text,'改过的事项');
});

test('改文字 checks its input and refuses deleted to-dos', async t => {
  const app=await fixture(t); const session=await app.login();
  const req=(path,method='GET',body)=>app.request('/api/v1'+path,{method,session,...(body?{body}:{})});
  const todo=(await req('/todos','POST',{id:randomUUID(),date:'2026-11-06',text:'原来的字'})).data;
  for(const body of [{text:'   ',version:1},{text:'x'.repeat(501),version:1},{text:'好',version:0},{text:'好'},{text:'好',version:1,completed:true},{text:3,version:1}])
    assert.equal((await req(`/todos/${todo.id}/text`,'PATCH',body)).status,400,JSON.stringify(body).slice(0,40));
  assert.equal((await req(`/todos/${randomUUID()}/text`,'PATCH',{text:'好',version:1})).status,404);
  const gone=(await req(`/todos/${todo.id}`,'DELETE',{date:'2026-11-06',version:1})).data;
  assert.equal((await req(`/todos/${todo.id}/text`,'PATCH',{text:'好',version:gone.version})).status,404);
});

test('改文字 works for future to-dos through the same endpoint', async t => {
  const app=await fixture(t); const session=await app.login();
  const req=(path,method='GET',body)=>app.request('/api/v1'+path,{method,session,...(body?{body}:{})});
  const created=(await req('/unscheduled-todos','POST',{id:randomUUID(),text:'下周要做的事'})).data;
  const noted=(await req(`/todos/${created.id}/note`,'PATCH',{version:created.version,note:'记一笔'})).data;
  const saved=await req(`/todos/${created.id}/text`,'PATCH',{text:'下周要做的另一件事',version:noted.version});
  assert.equal(saved.status,200); assert.equal(saved.data.id,created.id); assert.equal(saved.data.text,'下周要做的另一件事');
  assert.equal(saved.data.note,'记一笔'); assert.equal(saved.data.version,noted.version+1);
  assert.equal((await req(`/todos/${created.id}/text`,'PATCH',{text:'下周要做的另一件事',version:noted.version})).data.version,saved.data.version);
  assert.equal((await req(`/todos/${created.id}/text`,'PATCH',{text:'覆盖',version:noted.version})).status,409);
  const [row]=(await req('/unscheduled-todos')).data.items;
  assert.equal(row.text,'下周要做的另一件事'); assert.equal(row.note,'记一笔');
});
