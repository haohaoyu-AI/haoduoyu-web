import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchVisibleTodoDay} from '../web/core/todo-live-refresh.mjs';

test('a visible day follows other clients without applying stale reads across edits, tabs or IME', async () => {
  const window = new EventTarget(), document = new EventTarget();
  let tick, answer, time=0, key='today', reads=0, painted=[];
  Object.assign(window, {navigator:{onLine:true}, setInterval:fn=>{tick=fn; return 1;}, clearInterval() {}});
  document.visibilityState='visible';
  const stop=watchVisibleTodoDay({window,document,now:()=>time,selection:()=>key && {date:'2026-11-18',key},
    read:()=>{reads++; return new Promise(resolve=>{answer=resolve;});}, apply:(_,data)=>painted.push(data)});
  let pass=tick(); answer('first'); await pass;
  assert.deepEqual(painted,['first']);
  time+=20000;
  pass=tick(); await tick(); key='tomorrow'; answer('yesterday'); await pass;
  assert.equal(reads,2); assert.deepEqual(painted,['first']);
  time+=20000; pass=tick(); document.dispatchEvent(new Event('compositionstart')); answer('draft'); await pass;
  time+=20000; await tick(); assert.equal(reads,3);
  document.dispatchEvent(new Event('compositionend'));
  pass=tick(); answer('current'); await pass; assert.deepEqual(painted,['first','current']);
  time+=20000; document.visibilityState='hidden'; await tick(); assert.equal(reads,4);
  document.visibilityState='visible'; pass=tick(); stop(); answer('closed'); await pass; assert.equal(painted.length,2);
});
