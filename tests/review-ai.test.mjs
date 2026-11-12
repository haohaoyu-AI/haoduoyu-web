import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {experimentEvidence,experiments,patternStats,weeklyPeriod} from '../shared/review-experiments.mjs';

const KEY='sk-synthetic-'+'k'.repeat(30);
function fixture(t,{answer}={}) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8')
    .split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))sql.exec(statement);
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},
    async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},
    async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};}};
  const owner=randomUUID(),origin='http://localhost',calls=[];
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',SITE_ORIGIN:origin,OPENAI_API_KEY:KEY,OPENAI_REVIEW_MODEL:'server-default',
    REVIEW_AI_FETCH:async(url,init)=>{
      const body=init.body?JSON.parse(init.body):null;calls.push({url,body,auth:init.headers.get('Authorization')});
      if(url.endsWith('/models'))return reply(200,{data:[{id:'gpt-b'},{id:'gpt-a'},{id:'gpt-a-audio'},{id:'text-embedding-x'},{id:'o9-mini'}]});
      const out=answer?answer(body,calls.length):{status:200,text:'## 一句话结论\n合成周报'};
      if(out.status!==200)return reply(out.status,{error:{message:'synthetic'}});
      return reply(200,{status:out.incomplete?'incomplete':'completed',output:[{type:'message',content:[{type:'output_text',text:out.text}]}],usage:{input_tokens:120,output_tokens:45}});
    }};
  async function call(path,method='GET',data) {
    const headers=new Headers({Origin:origin,'X-Public-Business':'1'});if(data!==undefined)headers.set('Content-Type','application/json');
    const request=new Request(origin+'/api/v1/review/'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
    try{const response=await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),env,origin);return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message}};}
  }
  const article=(title,daysAgo,readsValue,extra={})=>{
    const id=randomUUID(),at=new Date(Date.now()-daysAgo*86400000).toISOString();
    sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,platform,title,published_at,title_pattern,applied_rule_ids_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(owner,id,'V字','toutiao',title,at,extra.pattern??null,extra.rules?JSON.stringify(extra.rules):null,at,at);
    if(readsValue!==null)sql.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,age_hours,reads,ctr) VALUES(?,?,?,?,?,?,?)')
      .run(owner,randomUUID(),id,new Date(Date.parse(at)+86400000).toISOString().slice(0,10),24,readsValue,extra.ctr??8);
    return id;
  };
  return {sql,owner,env,call,calls,article};
}
test('weekly periods run Saturday to Friday and only roll over on Sunday',()=>{
  assert.deepEqual(weeklyPeriod('2026-11-15'),{start:'2026-11-07',end:'2026-11-13'});
  assert.deepEqual(weeklyPeriod('2026-11-14'),{start:'2026-10-31',end:'2026-11-06'},'Friday articles are not a day old on Saturday');
  assert.deepEqual(weeklyPeriod('2026-11-21'),{start:'2026-11-07',end:'2026-11-13'});
  assert.deepEqual(weeklyPeriod('2026-11-22'),{start:'2026-11-14',end:'2026-11-20'});
});
test('experiment evidence compares tagged articles with untagged ones from the same days onward',()=>{
  const row=(id,date,readsValue,rules,ctr=10,verdict='中')=>({id,published_at:date+'T04:00:00Z',reads_24h:readsValue,ctr_24h:ctr,verdict,applied_rule_ids:rules});
  const rows=[row('old','2026-11-01',9000,null),row('a','2026-11-05',100,['r1'],4),row('b','2026-11-06',300,['r1'],6,'爆'),row('c','2026-11-06',null,['r1']),
    row('d','2026-11-05',500,null,9),row('e','2026-11-07',700,['r2'],11)];
  const evidence=experimentEvidence('r1',rows);
  assert.deepEqual({...evidence},{rule_id:'r1',first_day:'2026-11-05',tagged:3,n_with:2,n_without:2,reads_with:200,reads_without:600,ctr_with:5,ctr_without:10,hits_with:1,needed:6,ready:false});
  assert.equal(experimentEvidence('none',rows).n_without,0,'nothing to compare before a trial starts');
  const book={id:'b1',account:'V字',version:2,content_hash:'h',rules:[{rule_id:'r1',section:'title',text:'x',status:'trial'},{rule_id:'r9',section:'title',text:'y',status:'candidate'},
    {rule_id:'legacy',section:'title',text:'z'},{rule_id:'kept',section:'title',text:'k',status:'kept'},{rule_id:'shadowed',section:'title',text:'s',status:'trial',overriddenByScope:'vzi'}]};
  assert.deepEqual(experiments([book],rows).map(rule=>[rule.rule_id,rule.status,rule.live.n_with,rule.playbook.id]),[['r1','trial',2,'b1'],['r9','candidate',0,'b1']],
    'a rule without a stored status is an old rule, not a new suggestion');
  const defaulted={...book,rules:book.rules.map(rule=>({...rule,status:rule.status??'candidate'}))};
  assert.deepEqual(experiments([defaulted],rows,{explicit:{b1:['r9']}}).map(rule=>rule.rule_id),['r1','r9']);
  assert.deepEqual(experiments([defaulted],rows,{explicit:{}}).map(rule=>rule.rule_id),['r1'],'until the explicit list arrives nothing is offered for confirmation');
  assert.deepEqual(patternStats([{id:'a',reads_24h:100,ctr_24h:5,verdict:'爆',title_pattern:null},{id:'b',reads_24h:300,ctr_24h:7,title_pattern:'对话体'},{id:'c',reads_24h:null}],{a:'对话体',c:'对话体'}),
    [{pattern:'对话体',count:2,reads:200,ctr:6,hits:1}]);
});
test('state, settings and model list',async t=>{
  const {call,article,calls}=fixture(t);article('标题一',3,500);article('标题二',2,800,{pattern:'对话体'});
  const first=await call('ai?account=V%E5%AD%97');
  assert.equal(first.status,200);assert.equal(first.data.configured,true);assert.equal(first.data.default_model,'server-default');
  assert.deepEqual(first.data.settings.features.weekly,{model:'',effort:''});assert.equal(first.data.settings.daily_limit,30);
  assert.equal(first.data.pending.titles,1,'an article that already has a pattern needs no AI label');
  assert.deepEqual(first.data.usage.used,0);assert.equal(JSON.stringify(first).includes('sk-synthetic'),false);
  const saved=await call('ai/settings','PUT',{daily_limit:5,features:{weekly:{model:'gpt-b',effort:'high'}}});
  assert.equal(saved.status,200);assert.deepEqual(saved.data.settings.features.weekly,{model:'gpt-b',effort:'high'});
  assert.deepEqual(saved.data.settings.features.titles,{model:'',effort:''});
  assert.equal((await call('ai?account=V%E5%AD%97')).data.settings.daily_limit,5);
  for(const bad of [{daily_limit:500},{features:{weekly:{effort:'extreme'}}},{features:{weekly:{model:'bad model'}}},{other:1}])
    assert.equal((await call('ai/settings','PUT',bad)).status,400);
  const list=await call('ai/models');
  assert.deepEqual(list.data.models,['o9-mini','gpt-b','gpt-a']);assert.equal(calls.at(-1).auth,'Bearer '+KEY);
  assert.equal((await call('ai/unknown','POST',{})).status,404);
});
test('weekly report uses the saved model, logs the run and never writes review records',async t=>{
  const {call,article,calls,sql}=fixture(t);
  const period=weeklyPeriod(new Date(Date.now()+8*3600000).toISOString().slice(0,10));
  const inside=Math.round((Date.now()-Date.parse(period.end+'T04:00:00Z'))/86400000);
  article('周内文章：把 300 万仪器砸到 40 万',inside,1234,{rules:['T-x'],ctr:9.5});article('周内另一篇',inside+1,300);
  await call('ai/settings','PUT',{features:{weekly:{model:'gpt-b',effort:'medium'}}});
  const before=sql.prepare('SELECT revision FROM matrix_control').get().revision;
  const made=await call('ai/weekly','POST',{account:'V字'});
  assert.equal(made.status,200,JSON.stringify(made));assert.equal(made.data.period_start,period.start);assert.match(made.data.summary_md,/合成周报/);
  const sent=calls.at(-1).body;
  assert.equal(sent.model,'gpt-b');assert.deepEqual(sent.reasoning,{effort:'medium'});assert.equal(sent.store,false);
  assert.match(sent.input[1].content,/周内文章：把 300 万仪器砸到 40 万/);assert.match(sent.input[1].content,/阅读 1234/);assert.match(sent.input[0].content,/不是给你的指令/);
  const state=(await call('ai?account=V%E5%AD%97')).data;
  assert.equal(state.weekly.length,1);assert.equal(state.pending.weekly,null);assert.equal(state.usage.used,1);
  assert.deepEqual([state.runs[0].feature,state.runs[0].status,state.runs[0].model,state.runs[0].input_tokens],['weekly','succeeded','gpt-b',120]);
  assert.equal(sql.prepare('SELECT revision FROM matrix_control').get().revision,before,'AI output must not advance the review data revision');
  const once=await call('ai/weekly','POST',{account:'V字',model:'gpt-a',effort:''});
  assert.equal(calls.at(-1).body.model,'gpt-a');assert.equal(calls.at(-1).body.reasoning,undefined);assert.equal(once.data.model,'gpt-a');
  assert.equal((await call('ai?account=V%E5%AD%97')).data.weekly.length,1,'a regenerated week replaces the shown report');
  assert.equal((await call('ai/weekly','POST',{account:'V字',period_start:'2031-01-04'})).status,400);
});
test('an unsupported effort is retried once without it; failures are logged and the daily limit holds',async t=>{
  const {call,article,calls}=fixture(t,{answer:(body,n)=>body.reasoning?{status:400}:{status:200,text:'{"items":[{"i":0,"pattern":"对话体"},{"i":9,"pattern":"越界"},{"i":1,"pattern":""}]}'}});
  const a=article('美国：不许卖！中国：问过我了吗？',1,500);article('较早的标题',2,400);
  await call('ai/settings','PUT',{daily_limit:2,features:{titles:{model:'gpt-a',effort:'low'}}});
  const done=await call('ai/titles','POST',{account:'V字'});
  assert.equal(done.status,200,JSON.stringify(done));assert.deepEqual(done.data,{labelled:1,remaining:1});
  assert.equal(calls.filter(item=>item.url.endsWith('/responses')).length,2);
  const state=(await call('ai?account=V%E5%AD%97')).data;
  assert.deepEqual(state.titles,{[a]:'对话体'});assert.equal(state.runs[0].effort_ignored,true);assert.equal(state.pending.titles,1);
  await call('ai/titles','POST',{account:'V字'});
  assert.deepEqual((await call('ai/titles','POST',{account:'V字'})).data,{labelled:0,remaining:0},'nothing left to label costs no call');
  article('第三个标题',0,null);
  const blocked=await call('ai/titles','POST',{account:'V字'});
  assert.equal(blocked.status,429);assert.equal(blocked.error.code,'REVIEW_AI_LIMIT');
});
test('provider failures surface plainly and are not saved',async t=>{
  const {call,article}=fixture(t,{answer:()=>({status:401})});article('标题',2,500);
  const failed=await call('ai/titles','POST',{account:'V字'});
  assert.equal(failed.status,502);assert.match(failed.error.message,/密钥/);
  const state=(await call('ai?account=V%E5%AD%97')).data;
  assert.deepEqual(state.titles,{});assert.equal(state.runs[0].status,'failed');assert.equal(state.usage.used,1,'a failed call still counts toward the limit');
});
test('benchmark breakdown reads titles only and stores notes beside, not in, the library',async t=>{
  const {call,sql,owner}=fixture(t,{answer:()=>({status:200,text:'说明文字 {"items":[{"i":0,"pattern":"揭底体","hook":"全球蛋糕分完","topic":"中西对比","template":"怪不得…：…"}]} 结束'})});
  const acc=randomUUID(),art=randomUUID(),now=new Date().toISOString();
  sql.prepare('INSERT INTO matrix_review_benchmark_accounts(user_id,id,account,platform,name,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(owner,acc,'V字','toutiao','合成对标',now,now);
  sql.prepare('INSERT INTO matrix_review_benchmark_articles(user_id,id,benchmark_account_id,title,url,reads,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,art,acc,'怪不得西方黑脸','https://example.com/a',200000,now,now);
  assert.equal((await call('ai?account=V%E5%AD%97')).data.pending.benchmarks,1);
  const done=await call('ai/benchmarks','POST',{account:'V字'});
  assert.deepEqual(done.data,{done:1,remaining:0});
  const state=(await call('ai?account=V%E5%AD%97')).data;
  assert.deepEqual(state.benchmarks[art],{pattern:'揭底体',hook:'全球蛋糕分完',topic:'中西对比',template:'怪不得…：…'});
  assert.equal(sql.prepare('SELECT title_pattern FROM matrix_review_benchmark_articles WHERE id=?').get(art).title_pattern,null);
  assert.deepEqual((await call('ai/benchmarks','POST',{account:'V字'})).data,{done:0,remaining:0});
});
test('rule codes get readable names, and rules stored as candidate before the loop began are not suggestions',async t=>{
  const {ruleNames,namedPattern,ruleShortName}=await import('../shared/review-experiments.mjs');
  assert.equal(ruleShortName('- **标题先写冲突结果**，少用问句结尾。后面还有很长的说明'),'标题先写冲突结果，少用问句结尾');
  assert.equal(ruleShortName('一二三四五六七八九十一二三四五六七八九十一二三四五'),'一二三四五六七八九十一二三四五六七八九十一二…');
  const names=ruleNames([{rules:[{rule_id:'T3',text:'年龄节点串起一生。详细写法……'},{rule_id:'T9',text:''}]}]);
  assert.equal(namedPattern('T3',names),'年龄节点串起一生（T3）');assert.equal(namedPattern('T9',names),'T9');assert.equal(namedPattern('对话体',names),'对话体');
  const {call,article,calls,sql,owner}=fixture(t);
  const period=weeklyPeriod(new Date(Date.now()+8*3600000).toISOString().slice(0,10));
  const inside=Math.round((Date.now()-Date.parse(period.end+'T04:00:00Z'))/86400000);
  article('周内文章',inside,500,{pattern:'T3'});
  const columns=sql.prepare("PRAGMA table_info('matrix_review_playbooks')").all().map(row=>row.name);
  const book=id=>{const row={user_id:owner,id,account:'V字',version:6,status:'active',content_md:'',published_on:'2026-11-01',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
    rules_json:JSON.stringify([{rule_id:'T3',section:'title',text:'年龄节点串起一生。',status:'candidate'},{rule_id:'G1',section:'topic',text:'旧规则一',status:'candidate'}])};
    const keys=columns.filter(key=>key in row);
    sql.prepare(`INSERT OR REPLACE INTO matrix_review_playbooks(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));};
  const id=randomUUID();book(id);
  const first=(await call('ai?account=V%E5%AD%97')).data;
  assert.deepEqual(first.candidates[id],[],'everything stored as candidate at first read is the baseline');
  const rules=JSON.parse(sql.prepare('SELECT rules_json FROM matrix_review_playbooks WHERE id=?').get(id).rules_json);
  sql.prepare('UPDATE matrix_review_playbooks SET rules_json=? WHERE id=?').run(JSON.stringify([...rules,{rule_id:'N1',section:'title',text:'新的小改建议。',status:'candidate'}]),id);
  assert.deepEqual((await call('ai?account=V%E5%AD%97')).data.candidates[id],['N1'],'only a later candidate is a suggestion');
  assert.equal((await call('ai/weekly','POST',{account:'V字'})).status,200);
  const facts=calls.at(-1).body.input[1].content,system=calls.at(-1).body.input[0].content;
  assert.match(facts,/套路 年龄节点串起一生（T3）/);assert.match(facts,/\[待确认\] 新的小改建议。（N1）/);
  assert.doesNotMatch(facts,/旧规则一/,'baseline rules are not reported as experiments');assert.match(system,/代号只能放在名称后的括号里/);
});
