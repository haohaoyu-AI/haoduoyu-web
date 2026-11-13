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
    async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},
    async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}
      catch(error){sql.exec('ROLLBACK');throw error;}}};
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
    [{pattern:'对话体',code:'',count:2,reads:200,ctr:6,hits:1,articles:[{id:'b',title:'',reads:300,verdict:''},{id:'a',title:'',reads:100,verdict:'爆'}]}]);
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
test('weekly history and patterns remain readable without generation; weekly POST is retired',async t=>{
  const {call,article,calls,sql,owner}=fixture(t);
  const id=article('合成标题',3,1234,{pattern:'合成套路'});
  const history={period_start:'2026-10-31',period_end:'2026-11-06',summary_md:'合成历史周报'};
  sql.prepare('INSERT INTO matrix_audit(id,actor,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(),'review-ai:'+owner,'review-ai.weekly','review-ai:weekly:V字',JSON.stringify(history),'2026-11-08T00:00:00Z');
  const before=(await call('ai?account=V%E5%AD%97')).data;
  assert.equal(before.weekly[0].summary_md,history.summary_md);
  assert.equal(before.patterns[0].pattern,'合成套路');
  assert.equal(before.patterns[0].articles[0].id,id);
  assert.equal(calls.length,0);
  assert.equal((await call('ai/weekly','POST',{account:'V字'})).status,410);
  const after=(await call('ai?account=V%E5%AD%97')).data;
  assert.deepEqual(after.weekly,before.weekly);assert.deepEqual(after.patterns,before.patterns);
  assert.equal(calls.length,0);assert.equal(after.usage.used,0);
});
test('four decision actions update only their isolated fixture rules',async t=>{
  const {call}=fixture(t),id=randomUUID();
  const rules=[['agree','candidate'],['decline','candidate'],['keep','trial'],['drop','trial']]
    .map(([rule_id,status])=>({rule_id,section:'title',text:'合成规则 '+rule_id,status}));
  let book=(await call('playbooks/'+id,'PUT',{account:'V字',version:1,status:'active',published_on:'2026-11-01',rules})).data;
  for(const [rule_id,status] of [['agree','trial'],['decline','dropped'],['keep','kept'],['drop','dropped']]) {
    const result=await call('rules/'+rule_id,'PATCH',{account:'V字',playbook_id:id,expected_hash:book.content_hash,save_id:randomUUID(),status});
    assert.equal(result.status,200);book=result.data;
    assert.equal(book.rules.find(rule=>rule.rule_id===rule_id).status,status);
  }
  assert.deepEqual(book.rules.map(rule=>rule.status),['trial','dropped','kept','dropped']);
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

});
test('spellings of one pattern merge, and each pattern lists its articles most-read first',async()=>{
  const {patternStats:stats,splitPattern}=await import('../shared/review-experiments.mjs');
  assert.deepEqual(splitPattern('T5 人物逆袭体'),{code:'T5',name:'人物逆袭体'});assert.deepEqual(splitPattern('揭底体'),{code:'',name:'揭底体'});
  assert.deepEqual(splitPattern('T11'),{code:'',name:'T11'},'a bare code is left as written');
  const row=(id,pattern,reads,title)=>({id,title,title_pattern:pattern,reads_24h:reads,ctr_24h:8,verdict:'中'});
  const result=stats([row('a','人物逆袭体',100,'甲'),row('b','T5 人物逆袭体',900,'乙'),row('c','极小细节引出巨大后果+具',50,'丙'),
    row('d','极小细节引出巨大后果+具体人物',70,'丁'),row('e','揭底体',10,'戊'),row('f','揭底',20,'己')]);
  assert.deepEqual(result.map(item=>[item.pattern,item.code,item.count]),[['人物逆袭体','T5',2],['极小细节引出巨大后果+具体人物','',2],['揭底',"",1],['揭底体','',1]]);
  assert.deepEqual(result[0].articles.map(item=>item.title),['乙','甲']);
  assert.equal(result.some(item=>item.pattern==='揭底'),true,'short names are never merged by prefix');
});

test('title classification and headline breakdown are retired without calling the provider',async t=>{
  const {call,calls,article}=fixture(t);
  article('一篇文章',3,500);
  for(const path of ['ai/titles','ai/benchmarks']){
    const before=calls.length,reply=await call(path,'POST',{account:'V字'});
    assert.equal(reply.status,410,path);assert.equal(reply.error.code,'REVIEW_AI_RETIRED');assert.equal(calls.length,before,'no provider call');
  }
});
