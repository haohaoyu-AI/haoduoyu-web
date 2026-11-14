import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleTodoCarry,carriedTodoId,TODO_CARRY_DAYS} from '../src/todo-carry.mjs';
import {handleTodos} from '../src/todos.mjs';
import {digest,csrfFor} from '../src/security.mjs';
import {beijingDay} from '../src/lib/time.mjs';

function setup(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    for(const stmt of readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  let tail=Promise.resolve();
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},
    async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},
  async batch(statements){const previous=tail;let release;tail=new Promise(resolve=>{release=resolve});await previous;
    try{sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}finally{release()}}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost',stamp=new Date().toISOString();
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'synthetic','hash',stamp);
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+86400000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  const headers={'Content-Type':'application/json',Origin:origin,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)};
  const call=async (handler,route,method='GET',body)=>{
    const response=await handler(new Request(origin+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),route);
    return (await response.json()).data;
  };
  const carry=()=>call(request=>handleTodoCarry(db,request,origin),'/todo-carry','POST',{});
  const todos=(route,method,body)=>call((request,path)=>handleTodos(db,request,path.split('?')[0],origin),route,method,body);
  const add=(date,text,extra={})=>{const id=randomUUID();
    sql.prepare('INSERT INTO matrix_todos(user_id,id,date,text,completed,version,created_at,updated_at,deleted_at,note) VALUES(?,?,?,?,?,1,?,?,?,?)')
      .run(owner,id,date,text,extra.completed?1:0,stamp,stamp,extra.deleted?stamp:null,extra.note||'');return id;};
  return {sql,owner,carry,todos,add};
}
const today=beijingDay(Date.now()),ago=n=>new Date(Date.parse(today+'T00:00:00Z')-n*86400000).toISOString().slice(0,10);

test('unfinished one-off to-dos from the last week reappear today, once, and the originals stay on their day',async t=>{
  const {sql,owner,carry,todos,add}=setup(t);
  const open=add(ago(1),'知乎改版计划',{note:'先列提纲'}),older=add(ago(3),'onenote整理');
  add(ago(1),'已完成的事',{completed:true});add(ago(2),'删掉的事',{deleted:true});
  add(ago(TODO_CARRY_DAYS+1),'太久以前的事');add(ago(1),'2/4 次 上厕所');add(today,'今天本来的事');
  const template=randomUUID(),daily=add(ago(1),'写日记');
  sql.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(owner,template,'写日记',today,today);
  sql.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)').run(owner,daily,template);
  const first=await carry();
  assert.deepEqual(first.carried.map(row=>[row.text,row.from]),[['onenote整理',ago(3)],['知乎改版计划',ago(1)]]);
  assert.equal(first.carried[1].id,await carriedTodoId(open));
  const list=(await todos('/todos?date='+today)).items;
  assert.deepEqual(list.map(row=>row.text).sort(),['onenote整理','今天本来的事','知乎改版计划'].sort());
  assert.equal(list.find(row=>row.text==='知乎改版计划').note,'先列提纲','the note travels with it');
  assert.equal((await todos('/todos?date='+ago(1))).items.find(row=>row.id===open).completed,false,'original unchanged');
  assert.deepEqual((await carry()).carried,[],'a second call (another device) adds nothing');
  const copy=list.find(row=>row.text==='onenote整理');
  await todos('/todos/'+copy.id,'DELETE',{date:today,version:copy.version});
  assert.deepEqual((await carry()).carried,[],'a deleted copy is not brought back');
  assert.ok(!(await todos('/todos?date='+today)).items.some(row=>row.text==='onenote整理'));
  assert.ok(older);
});

test('carried ids are valid, stable UUIDs and the route refuses other methods',async t=>{
  const id=await carriedTodoId('11111111-1111-4111-8111-111111111111');
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(id,await carriedTodoId('11111111-1111-4111-8111-111111111111'));
  assert.notEqual(id,await carriedTodoId(id),'a copy of a copy gets its own id');
  const {carry}=setup(t);assert.deepEqual((await carry()).carried,[]);
  await assert.rejects(handleTodoCarry({},new Request('http://localhost/todo-carry'),'http://localhost'),error=>error.status===404);
});

test('a counted 常用 item starts each new day at zero with the same target',async t=>{
  const {sql,owner,todos,add}=setup(t);
  const open=randomUUID(),plain=randomUUID();
  for(const [id,text] of [[open,'合成习惯'],[plain,'合成事项']])
    sql.prepare('INSERT INTO matrix_todo_templates(user_id,id,text,version,created_at,updated_at) VALUES(?,?,?,1,?,?)').run(owner,id,text,today,today);
  const link=(todo,template)=>sql.prepare('INSERT INTO matrix_todo_template_links(user_id,todo_id,template_id) VALUES(?,?,?)').run(owner,todo,template);
  link(add(ago(2),'合成习惯',{note:'2/4 次'}),open);link(add(ago(1),'合成习惯',{note:'7/∞ 次 · 合成备注'}),open);
  link(add(ago(1),'合成事项',{note:'只是备注'}),plain);
  const counted=await todos('/todos','POST',{id:randomUUID(),date:today,text:'合成习惯',template_id:open});
  assert.equal(counted.note,'0/∞ 次','the latest day sets the target; the tally restarts and the note text stays behind');
  const saved=await todos('/todos?date='+today,'GET');
  assert.equal(saved.items.find(item=>item.id===counted.id).note,'0/∞ 次');
  assert.equal((await todos('/todos','POST',{id:randomUUID(),date:today,text:'合成事项',template_id:plain})).note,undefined,'an uncounted item stays plain');
});
