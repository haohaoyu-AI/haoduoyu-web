import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,ORIGIN} from './harness.mjs';
import worker from '../dist/server/index.js';
import {ideaStatus,ideaPriority} from '../src/idea-pool.mjs';
import {beijingDay} from '../src/lib/time.mjs';
const today=beijingDay(Date.now());

async function site(t) {
  const app=await fixture(t),session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:ORIGIN,DAILY_NOTES_OWNER_ID:owner};
  async function call(path,method='GET',body,{labels=false,cookie=true}={}) {
    const headers={Origin:ORIGIN,...(cookie?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{}),...(labels?{'X-Note-Labels-Version':'3'}:{})};
    if(body!==undefined)headers['Content-Type']='application/json';
    const response=await worker.fetch(new Request(ORIGIN+'/api/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
    return {status:response.status,data:json?.data,text};
  }
  const note=async(text,labels,date=today)=>{
    const id=randomUUID(),saved=await call('/note-entries/'+id,'PUT',{category:'life',date,text,labels,version:0,save_id:randomUUID()},{labels:true});
    assert.ok([200,201].includes(saved.status),saved.text);
    return id;
  };
  for(const name of ['想法池','生活'])await call('/note-entries/labels','POST',{name},{labels:true});
  return {call,note};
}

test('想法池 lists every labelled 碎碎念 across days with status and priority, newest first', async t => {
  const {call,note}=await site(t);
  const older=await note('想法 ⑧：语音大按钮\n状态：想法池，等 App 落地\n优先级：⭐⭐⭐',['想法池']);
  const newer=await note('桌面挂件\n优先级：⭐⭐',['想法池','生活']);
  await note('中午吃了面',['生活']);
  const listed=await call('/ideas');
  assert.equal(listed.status,200,listed.text);
  assert.deepEqual(listed.data.items.map(item=>item.id),[newer,older]);
  const [a,b]=listed.data.items;
  assert.equal(a.status,'idea');assert.equal(a.label,'想法');assert.equal(a.priority,2);assert.deepEqual(a.todos,[]);
  assert.equal(b.label,'想法池，等 App 落地');assert.equal(b.priority,3);assert.equal(b.date,today);
  assert.equal(listed.data.total,2);assert.equal(listed.data.truncated,false);
  // Owner only: no session, no list.
  assert.equal((await call('/ideas','GET',undefined,{cookie:false})).status,401);
  assert.equal((await call('/ideas?x=1')).status,400);
});

test('转成待办 links a to-do; the idea lands once every linked to-do is done', async t => {
  const {call,note}=await site(t);
  const idea=await note('整理微信聊天记录\n状态：想法池',['想法池']);
  const future=(await call('/unscheduled-todos','POST',{id:randomUUID(),text:'导出微信聊天记录'})).data;
  const linked=await call(`/ideas/${idea}/todos`,'POST',{todo_id:future.id});
  assert.equal(linked.status,201,linked.text);
  assert.equal(linked.data.status,'todo');assert.equal(linked.data.label,'已转待办');
  assert.deepEqual(linked.data.todos.map(todo=>[todo.id,todo.kind,todo.completed]),[[future.id,'future',false]]);
  // Linking again is a replay, not a second link.
  assert.equal((await call(`/ideas/${idea}/todos`,'POST',{todo_id:future.id})).data.todos.length,1);
  const dated=(await call('/todos','POST',{id:randomUUID(),date:'2026-11-23',text:'备份到硬盘'})).data;
  await call(`/ideas/${idea}/todos`,'POST',{todo_id:dated.id});
  const done=(await call(`/todos/${dated.id}`,'PATCH',{completed:true,version:dated.version})).data;
  assert.equal((await call('/ideas')).data.items[0].status,'todo');
  await call(`/unscheduled-todos/${future.id}`,'PATCH',{completed:true,version:future.version});
  const landed=(await call('/ideas')).data.items[0];
  assert.equal(landed.status,'landed');assert.equal(landed.label,'已落地');assert.ok(landed.landed_at>=done.updated_at);
  // The idea itself is untouched: same text, same version.
  const raw=(await call('/note-entries/'+idea,'GET',undefined,{labels:true})).data;
  assert.equal(raw.version,1);assert.match(raw.text,/状态：想法池/);
});

test('linking checks the idea, the to-do and the input', async t => {
  const {call,note}=await site(t);
  const idea=await note('一个想法',['想法池']),plain=await note('不是想法',['生活']);
  const todo=(await call('/unscheduled-todos','POST',{id:randomUUID(),text:'做'})).data;
  assert.equal((await call(`/ideas/${plain}/todos`,'POST',{todo_id:todo.id})).status,404);
  assert.equal((await call(`/ideas/${idea}/todos`,'POST',{todo_id:randomUUID()})).status,404);
  assert.equal((await call(`/ideas/${idea}/todos`,'POST',{todo_id:todo.id,extra:1})).status,400);
  assert.equal((await call(`/ideas/${idea}/todos`,'POST',{})).status,400);
  assert.equal((await call(`/ideas/not-a-uuid/todos`,'POST',{todo_id:todo.id})).status,404);
});

test('status and priority come from the idea text unless linked to-dos decide', () => {
  assert.deepEqual(ideaStatus('a\n状态：搁置',[]),{status:'idea',label:'搁置',landed_at:null});
  assert.equal(ideaStatus('a',[{completed:true,deleted:true,updated_at:'x'}]).status,'idea');
  assert.equal(ideaStatus('a',[{completed:true,deleted:false,updated_at:'2026-11-20T00:00:00.000Z'},{completed:false,deleted:true}]).status,'landed');
  assert.deepEqual(ideaPriority('优先级：⭐⭐'),{priority:2,priority_label:'⭐⭐'});
  assert.deepEqual(ideaPriority('无'),{priority:null,priority_label:null});
});
