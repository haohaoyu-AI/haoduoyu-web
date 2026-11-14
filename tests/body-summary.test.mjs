import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleBodySummary,bodySummaryWeeks,BODY_SUMMARY_LABEL} from '../src/body-summary.mjs';

// Synthetic notes only; nothing here comes from a real person.
function setup(t,{reply,mode='1'}={}) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    for(const stmt of readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},
    async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},
  async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
  const owner=randomUUID(),origin='http://localhost',stamp=new Date().toISOString();
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'synthetic','hash',stamp);
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  const calls=[];
  const env={PUBLIC_BUSINESS_MODE:mode,DAILY_NOTES_OWNER_ID:owner,OPENAI_API_KEY:'sk-synthetic-key-0123456789abcdef',OPENAI_REVIEW_MODEL:'synthetic-model',
    REVIEW_AI_FETCH:async (url,init)=>{calls.push(JSON.parse(init.body));
      return Response.json({status:'completed',usage:{input_tokens:10,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:reply()}]}]});}};
  const call=async (route,method='GET',body)=>{
    const headers={Origin:origin,'X-Public-Business':'1',...(body?{'Content-Type':'application/json'}:{})};
    const response=await handleBodySummary(db,new Request(origin+route,{method,headers,body:body?JSON.stringify(body):undefined}),route,owner,env,origin);
    return (await response.json()).data;
  };
  const note=(date,text,label)=>{const id=randomUUID();
    sql.prepare("INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,'life',?,?,1,1,?,?)")
      .run(owner,id,date,text,date+'T02:00:00.000Z',date+'T02:00:00.000Z');
    if(label)sql.prepare('INSERT OR IGNORE INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').run(owner,label,stamp);
    if(label)sql.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').run(owner,id,label);};
  return {call,note,calls,env,sql,owner};
}
const good=()=>JSON.stringify({headline:'本周大体平稳',stats:{bowel:5,normal:3,loose:1,hard:1,accidents:1,discomfort:2},previous:null,
  sections:[{title:'排便情况',points:['5 次，3 次成形']},{title:'可能有关的因素',points:['周三吃辣后偏稀']}],alerts:[]});

test('last week is summarized once from tagged and related untagged notes, with the owner background',async t=>{
  const {call,note,calls,sql,owner}=setup(t,{reply:good});
  const {last}=bodySummaryWeeks();
  note(last.start,'合成记录：早上一次，成形',BODY_SUMMARY_LABEL);
  note(last.end,'合成记录：肚子有点胀');
  note(last.end,'合成记录：今天去买菜');
  note(new Date(Date.parse(last.start)-10*86400000).toISOString().slice(0,10),'合成记录：上上周偏稀',BODY_SUMMARY_LABEL);
  assert.equal((await call('/body-summary/context','PUT',{text:'合成背景：长期情况 A；“小包”指护理垫'})).text,'合成背景：长期情况 A；“小包”指护理垫');
  const before=await call('/body-summary');
  assert.equal(before.last,null);assert.equal(before.configured,true);assert.equal(before.weeks.last.start,last.start);
  const saved=await call('/body-summary','POST',{week:'last'});
  assert.equal(saved.headline,'本周大体平稳');assert.equal(saved.stats.bowel,5);assert.equal(saved.entry_count,2);
  const prompt=calls[0].input[1].content;
  assert.match(prompt,/合成背景/);assert.match(prompt,/成形/);assert.match(prompt,/肚子有点胀（?/);assert.match(prompt,/上上周偏稀/);
  assert.doesNotMatch(prompt,/买菜/,'unrelated notes stay out');
  assert.match(prompt,/更早的记录还不满 2 个整周，不够比较/,'one partial earlier week is not a baseline');
  assert.equal(saved.previous_weeks,0);assert.equal(saved.previous,null);assert.equal(saved.format,3);
  assert.deepEqual((await call('/body-summary','POST',{week:'last'})).headline,saved.headline);
  assert.equal(calls.length,1,'a second device does not pay again');
  await call('/body-summary','POST',{week:'last',redo:true});assert.equal(calls.length,2);
  assert.equal((await call('/body-summary')).last.headline,'本周大体平稳');
  sql.prepare("INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)").run(randomUUID(),'body-summary:'+owner,'body-summary.saved',
    'body-summary:week:'+last.start,JSON.stringify({headline:'旧版小结',week_start:last.start,week_end:last.end,complete:true}),new Date(Date.now()+1000).toISOString());
  assert.equal((await call('/body-summary')).last,null,'an older summary is offered for one rewrite');
  await call('/body-summary','POST',{week:'last'});assert.equal(calls.length,3);
});

test('an empty week is saved without calling the model; bad replies and inputs are rejected',async t=>{
  let text='不是 JSON';const {call,note,calls}=setup(t,{reply:()=>text});
  const empty=await call('/body-summary','POST',{week:'last'});
  assert.equal(empty.empty,true);assert.equal(calls.length,0);
  note(bodySummaryWeeks().today,'合成记录：拉了一次',BODY_SUMMARY_LABEL);
  await assert.rejects(call('/body-summary','POST',{week:'current'}),error=>error.status===502);
  text=JSON.stringify({headline:'',stats:{},sections:[]});
  await assert.rejects(call('/body-summary','POST',{week:'current'}),error=>error.status===502);
  await assert.rejects(call('/body-summary','POST',{week:'2026-01-05'}),error=>error.status===400);
  await assert.rejects(call('/body-summary/context','PUT',{text:'x'.repeat(601)}),error=>error.status===400);
  await assert.rejects(call('/body-summary?x=1'),error=>error.status===400);
});

test('without public mode a visitor cannot read or generate a summary',async t=>{
  const {call}=setup(t,{reply:good,mode:'0'});
  await assert.rejects(call('/body-summary'),error=>error.status===403);
  await assert.rejects(call('/body-summary','POST',{week:'last'}),error=>error.status===401);
});

test('two whole earlier weeks give a baseline; the week the notes began part-way is left out',async t=>{
  const reply=()=>JSON.stringify({headline:'本周平稳',stats:{bowel:5,normal:3,loose:1,hard:1,accidents:1,discomfort:0},
    previous:{bowel:4,normal:3,loose:1,hard:0,accidents:1,discomfort:0},sections:[{title:'这周',points:['5 次']},{title:'和之前比',points:['差不多']}],alerts:[]});
  const {call,note,calls}=setup(t,{reply});
  const {last}=bodySummaryWeeks(),ago=n=>new Date(Date.parse(last.start)-n*86400000).toISOString().slice(0,10);
  note(last.start,'合成记录：拉了一次',BODY_SUMMARY_LABEL);
  note(ago(18),'合成记录：开始记录，周中第一条',BODY_SUMMARY_LABEL);
  note(ago(14),'合成记录：一次',BODY_SUMMARY_LABEL);note(ago(7),'合成记录：一次',BODY_SUMMARY_LABEL);
  let saved=await call('/body-summary','POST',{week:'last'});
  assert.equal(saved.previous_weeks,2,'the two whole weeks count, the partial first week does not');
  assert.equal(saved.previous.bowel,4);assert.ok(saved.sections.some(section=>section.title==='和之前比'));
  assert.match(calls[0].input[1].content,new RegExp('其中完整记录的周：'+ago(14)+' 起、'+ago(7)+' 起'));
});
