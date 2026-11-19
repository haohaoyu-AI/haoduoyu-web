import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';

const moduleUrl = new URL('../web/pages/note-suggest.mjs',import.meta.url).href;
const stubs = {
  '../core/api.mjs': 'export const api = (...args) => globalThis.__noteSuggestMockApi(...args);',
  '../core/format.mjs': 'export const bjtDate = () => "2026-11-19";',
  './unscheduled-todos.mjs': 'export const addFutureTodo = () => { throw new Error("Unexpected task write"); };',
  './todo-smart.mjs': 'export const smartDayLabel = () => "";',
};
const hook = registerHooks({resolve(specifier,context,next) {
  if(context.parentURL===moduleUrl && Object.hasOwn(stubs,specifier))
    return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
  return next(specifier,context);
}});
const {suggestForNote, setNoteSuggestRepaint} = await import(moduleUrl);
hook.deregister();

const label = '大小便记录';

test('eligible newly sent note uses one suggestion request with unchanged current tag and no task write',async () => {
  const calls = [];
  let complete;
  globalThis.__noteSuggestMockApi = (...args) => {
    calls.push(args);
    return new Promise(resolve => {complete=resolve;});
  };
  const item = {id:'fixture-note-a',version:1,serverText:' 明天下午买绿植 ',labels:[label]};
  const categories = [label,'工作'];
  const first = suggestForNote(item,categories);
  await suggestForNote(item,categories); // same version is already being read
  assert.deepEqual(calls,[['/note-suggest',{method:'POST',body:{text:'明天下午买绿植',labels:categories,current:[label]}}]]);
  complete({needs_model:true,todo:{text:'买绿植',when:'day',date:'2026-11-20'},labels:[]});
  await first;
  await suggestForNote(item,categories);
  assert.equal(calls.length,1);
  assert.deepEqual(item.labels,[label]);
});

test('ordinary records can return nothing, and very short notes still skip the request',async () => {
  const calls = [];
  let repaints = 0;
  setNoteSuggestRepaint(() => {repaints++;});
  globalThis.__noteSuggestMockApi = async (...args) => {
    calls.push(args);
    return {needs_model:true,todo:null,labels:[]};
  };
  await suggestForNote({id:'fixture-short',version:1,serverText:' 三个字 ',labels:[label]},[label]);
  assert.equal(calls.length,0);
  await suggestForNote({id:'fixture-record',version:1,serverText:'这是合成记录',labels:[label]},[label]);
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'/note-suggest');
  assert.equal(repaints,2);
});

test('disabled suggestion response remains empty and does not add tasks',async () => {
  const calls = [];
  globalThis.__noteSuggestMockApi = async (...args) => {
    calls.push(args);
    return {needs_model:false,off:true};
  };
  await suggestForNote({id:'fixture-off',version:1,serverText:'明天下午买绿植',labels:[label]},[label]);
  assert.deepEqual(calls.map(([url])=>url),['/note-suggest']);
});
