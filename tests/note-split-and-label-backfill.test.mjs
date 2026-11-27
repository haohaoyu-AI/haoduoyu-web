import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {digest,csrfFor} from '../src/security.mjs';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleNoteSuggest} from '../src/todo-assist.mjs';
import {handleNoteEntries} from '../src/note-entries.mjs';
import {beijingDay,shift} from '../src/lib/time.mjs';

// 想法 ③ 一大段话拆成待办 and 想法 ② 新标签补旧碎碎念. Synthetic notes only; the model is a stub.
function setup(t,{reply}) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    for(const stmt of readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},
    async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},
  async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
  const owner=randomUUID(),origin='http://localhost',stamp=new Date().toISOString();
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'synthetic','hash',stamp);
  const token=randomBytes(32).toString('hex');
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+86400000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  const calls=[];
  const env={DAILY_NOTES_OWNER_ID:owner,OPENAI_API_KEY:'sk-synthetic-key-0123456789abcdef',OPENAI_REVIEW_MODEL:'synthetic-model',
    REVIEW_AI_FETCH:async (url,init)=>{calls.push(JSON.parse(init.body));
      return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:reply()}]}]});}};
  const headers={Origin:origin,'Content-Type':'application/json',Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)};
  const suggest=async body=>(await (await handleNoteSuggest(db,new Request(origin+'/note-suggest',{method:'POST',headers,body:JSON.stringify(body)}),env,origin)).json()).data;
  const backfill=async body=>{
    try{return (await (await handleNoteEntries(db,new Request(origin+'/api/v1/note-entries/label-backfill',{method:'POST',headers,body:JSON.stringify(body)}),
      '/note-entries/label-backfill',env,origin,1)).json()).data;}catch(error){return {error:error.status};}
  };
  let seq=0;
  const note=(date,text,labels=[],category='life')=>{
    const id=randomUUID();
    sql.prepare('INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)')
      .run(owner,id,category,date,text,1,++seq,date+'T0'+(seq%10)+':00:00.000Z',date+'T01:00:00.000Z');
    if(labels.length)sql.prepare('INSERT INTO matrix_note_entry_label_sets(user_id,entry_id,labels_json) VALUES(?,?,?)').run(owner,id,JSON.stringify(labels));
    return id;
  };
  const label=name=>sql.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(owner,name,stamp);
  return {suggest,backfill,note,label,calls};
}

test('a long paragraph returns every stated to-do in order; todo stays the first for older clients',async t=>{
  const today=beijingDay(Date.now()),tomorrow=shift(today,1);
  const reply=JSON.stringify({todos:[
    {when:'day',date:tomorrow,text:'给房东打电话',inferred:false},
    {when:'this_week',date:null,text:'交水电费',inferred:false},
    {when:'none',date:null,text:'交水电费',inferred:false},
    {when:'none',date:null,text:'约小黑见个面',inferred:true}],labels:['生活']});
  const {suggest,calls}=setup(t,{reply:()=>reply});
  const data=await suggest({text:'明天要给房东打电话，这周得把水电费交了，好久没见小黑了',labels:['生活','工作'],current:[]});
  assert.deepEqual(data.todos.map(todo=>todo.text),['给房东打电话','交水电费'],'duplicates and the guess are dropped when things were said outright');
  assert.equal(data.todo.text,'给房东打电话');assert.equal(data.todos[0].date,tomorrow);assert.match(data.todos[1].period,/^\d{4}-W\d{2}$/);
  assert.match(calls[0].input[0].content,/最多 8 件/);
});

test('a short note with only a guess still offers the one guess, and the old todo-only reply still works',async t=>{
  let reply=JSON.stringify({todos:[{when:'none',date:null,text:'约小黑见个面',inferred:true},{when:'none',date:null,text:'买花',inferred:true}],labels:[]});
  const {suggest}=setup(t,{reply:()=>reply});
  const guess=await suggest({text:'好久没见小黑了',labels:[],current:[]});
  assert.deepEqual(guess.todos.map(todo=>[todo.text,todo.inferred]),[['约小黑见个面',true]],'only one guess per note');
  reply=JSON.stringify({todo:{when:'none',date:null,text:'换灯泡',inferred:false},labels:[]});
  const old=await suggest({text:'客厅的灯又闪了，得换',labels:[],current:[]});
  assert.equal(old.todo.text,'换灯泡');assert.equal(old.todos.length,1);
  reply=JSON.stringify({todos:[],labels:[]});
  const none=await suggest({text:'今天天气真好',labels:[],current:[]});
  assert.equal(none.todo,null);assert.deepEqual(none.todos,[]);
});

test('label backfill lists unlabelled recent notes the model picks and changes nothing',async t=>{
  const today=beijingDay(Date.now());
  let reply='{"items":[1,3,99,"x"]}';
  const {backfill,note,label,calls}=setup(t,{reply:()=>reply});
  label('情绪');
  const sad=note(shift(today,-1),'今天有点烦，什么都不想做');
  note(shift(today,-2),'已经贴好的心情记录',['情绪']);
  const lunch=note(shift(today,-3),'中午吃了面');
  const happy=note(shift(today,-4),'开心，终于把稿子写完了','','work');
  note(shift(today,-400),'很久以前的心情');
  const data=await backfill({label:'情绪'});
  assert.equal(data.needs_model,true);assert.equal(data.scanned,3,'labelled, old and deleted notes are not read');
  assert.deepEqual(data.items.map(item=>item.id),[sad,happy],'out-of-range picks are ignored; newest first');
  assert.equal(data.items[1].category,'work');assert.equal(data.items[0].version,1);
  assert.doesNotMatch(calls[0].input[1].content,/已经贴好的心情记录|很久以前/);
  assert.match(calls[0].input[1].content,/标签：情绪/);assert.ok(lunch);
  assert.deepEqual(await backfill({label:'没有这个'}),{error:404});
  assert.deepEqual(await backfill({label:'情绪',extra:1}),{error:400});
  reply='{"items":[]}';
  assert.deepEqual((await backfill({label:'情绪'})).items,[]);
});
