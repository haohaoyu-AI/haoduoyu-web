import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {digest,csrfFor} from '../src/security.mjs';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleTodoParse,TODO_PARSE_HINT} from '../src/todo-parse.mjs';
import {beijingDay,shift} from '../src/lib/time.mjs';

// Synthetic sentences only.
function setup(t,{reply,signedIn=true}={}) {
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
  const call=async (body,route='/todo-parse',method='POST')=>{
    const headers={Origin:origin,'Content-Type':'application/json',...(signedIn?{Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}:{})};
    const response=await handleTodoParse(db,new Request(origin+route,{method,headers,body:JSON.stringify(body)}),env,origin);
    return (await response.json()).data;
  };
  const settings=features=>sql.prepare('INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(),'review-ai:'+owner,'review-ai.settings','review-ai:settings',JSON.stringify({daily_limit:30,features}),new Date().toISOString());
  return {call,calls,settings};
}

test('a sentence with a day is read once and returned as a proposal; nothing is saved',async t=>{
  const today=beijingDay(Date.now()),tomorrow=shift(today,1);
  let text=JSON.stringify({kind:'once',date:tomorrow,text:'下午取快递',count:null});
  const {call,calls,settings}=setup(t,{reply:()=>text});
  const plain=await call({text:'买牛奶'});
  assert.deepEqual(plain,{needs_model:false});assert.equal(calls.length,0,'a plain sentence costs nothing');
  const read=await call({text:'明天下午取快递'});
  assert.equal(read.needs_model,true);assert.equal(read.kind,'once');assert.equal(read.date,tomorrow);assert.equal(read.text,'下午取快递');
  assert.equal(read.count,null);assert.equal(read.model,'synthetic-model');
  assert.match(calls[0].input[1].content,new RegExp('今天：'+today));assert.match(calls[0].input[1].content,/明天下午取快递/);
  text=JSON.stringify({kind:'daily',date:'2020-01-01',text:'喝水',count:8});
  assert.deepEqual((await call({text:'每天喝水 8 次'})).date,null,'a daily item has no date');
  text=JSON.stringify({kind:'once',date:'2020-01-01',text:'交表',count:2000});
  const past=await call({text:'周五前交表'});
  assert.equal(past.date,today,'a past date falls back to today');assert.equal(past.count,null,'an absurd count is dropped');
  text='说不清';await assert.rejects(call({text:'下周一开会'}),error=>error.status===502);
  settings({todo:{model:'small-model',effort:''}});text=JSON.stringify({kind:'once',date:today,text:'开会',count:null});
  await call({text:'下周一开会'});assert.equal(calls.at(-1).model,'small-model','the to-do feature uses its own model');
  settings({todo:{model:'off',effort:''}});const before=calls.length;
  assert.deepEqual(await call({text:'下周一开会'}),{needs_model:false,off:true});assert.equal(calls.length,before,'switched off, no call');
});

test('bad input and signed-out visitors are refused',async t=>{
  const {call}=setup(t,{reply:()=>'{}'});
  await assert.rejects(call({text:''}),error=>error.status===400);
  await assert.rejects(call({text:'明天'.repeat(300)}),error=>error.status===400);
  await assert.rejects(call({text:'明天',extra:1}),error=>error.status===400);
  await assert.rejects(call({text:'明天'},'/todo-parse?x=1'),error=>error.status===400);
  const closed=setup(t,{reply:()=>'{}',signedIn:false});
  await assert.rejects(closed.call({text:'明天开会'}),error=>error.status===403||error.status===401);
});

test('the hint picks sentences that name a day, a count or a daily habit',()=>{
  for(const text of ['明天交电费','下周三体检','20号还信用卡','每天喝水','上厕所 4 次','周五前交稿','11月20日开会'])assert.match(text,TODO_PARSE_HINT,text);
  for(const text of ['买牛奶','给妈妈打电话','今天洗衣服'])assert.doesNotMatch(text,TODO_PARSE_HINT,text);
});
