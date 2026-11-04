// Actual native form builder -> isolated current-source Worker -> temporary real D1.
// The production transport is never replaced or pointed at another origin.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath,formAssembly,dotnet='dotnet']=process.argv.slice(2);
if(!fixtureDirectory||!outputPath||!formAssembly)throw new Error('Usage: node generate-review-form-contract.mjs <isolated-source-worktree> <output.json> <Haoduoyu.Api.Tests.dll> [dotnet-executable]');
const root=resolve(fixtureDirectory),assembly=resolve(formAssembly);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const formFile=fileURLToPath(new URL('../Haoduoyu.Windows/ReviewFormLogic.cs',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const formSourceHash=sha(await readFile(formFile)),assemblyHash=sha(await readFile(assembly));
function form(input) {
  return JSON.parse(execFileSync(dotnet,[assembly,'--review-form-command'],{encoding:'utf8',input:JSON.stringify(input),maxBuffer:2*1024*1024}));
}
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();
const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic native form contract');}
  return originalFetch(input,options);
};
const samples=[],invalidForms=[],states={};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  async function call(name,method,path,body,{expected=200,vector,noOp=false}={}) {
    const headers=new Headers({Origin:app.origin,'X-Public-Business':'1'});
    if(body!==undefined){headers.set('Content-Type','application/json');headers.set('Idempotency-Key',randomUUID());}
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const responseJson=await response.text();
    assert.equal(response.status,expected,name+' returned '+responseJson);
    samples.push({name,method,path,...(body===undefined?{}:{body}),...(vector?{form:{kind:vector.kind,original:vector.original,values:vector.values}}:{}),
      ...(noOp?{no_op:true}:{}),status:response.status,response_json:responseJson});
    return JSON.parse(responseJson).data;
  }
  const today=(await call('native-form-server-beijing-today','GET','/api/v1/todos')).today;
  const scope=await call('native-form-complete-scope','GET','/api/v1/workbench-snapshot/index?version=2');assert.equal(scope.complete,true);
  const account='V字';
  const ids=Object.fromEntries(['benchmark-accounts','benchmark-articles','playbooks','articles','snapshots','reports','notes','account-health'].map(kind=>[kind,randomUUID()]));
  const starts=new Date(today+'T00:00:00Z');starts.setUTCDate(starts.getUTCDate()-6);const weekStart=starts.toISOString().slice(0,10);
  const values={
    'benchmark-accounts':{platform:'toutiao',name:'本次合成对标账号',profile_url:'https://example.invalid/synthetic-account',fans:0,is_featured_author:false,
      posting_cadence:'每周两篇（合成）',topic_focus:'合成题材',title_patterns:['合成对话式','合成数字式'],structure_notes_md:'合成结构观察\n第二行'},
    'benchmark-articles':{benchmark_account_id:ids['benchmark-accounts'],title:'本次合成对标文章',url:'https://example.invalid/synthetic-reference#retained',reads:100000,
      published_at:'2026-11-04',title_pattern:'数字开头',topic:'合成选题',news_hook:'合成新闻切口',word_count:0,image_count:0,collected_on:today},
    playbooks:{status:'draft',version:1,published_on:today,content_md:'合成规则正文\n第二行',changelog_md:'合成初版',rules:[{rule_id:'synthetic-rule',section:'title',text:'只用于合成验证',status:'candidate',check:'manual',evidence_note:null,trials:0,support_ids:[],counter_ids:[]}]},
    articles:{title:'本次合成我方文章',url:'https://example.invalid/synthetic-own-article#retained',published_at:'2026-11-04 08:00:00',platform_article_id:'synthetic-'+ids.articles,
      topic_category:'合成题材',title_pattern:'合成标题形式',sample_title:'合成参考标题',sample_url:'https://example.invalid/synthetic-reference',reference_article_id:ids['benchmark-articles'],
      image_count:0,source_chat:'本地临时合成验证',playbook_version_used:1,applied_rule_ids:['synthetic-rule']},
    snapshots:{article_id:ids.articles,snapshot_date:today,age_hours:24,source:'manual',impressions:null,fan_impressions:null,reads:0,fan_reads:0,ctr:0,completion_rate:0,
      avg_read_seconds:1e-7,likes:0,comments:0,reposts:0,shares:0,favorites:0,revenue:1e-29,traffic_sources:{synthetic_unknown:{kept:true}},
      completion_curve:[{synthetic_point:'start',value:0}],audience:{synthetic_unknown:{zero:0}}},
    reports:{period_type:'weekly',period_start:weekStart,period_end:today,summary_md:'合成周复盘摘要\n第二段',
      verdicts:{[ids.articles]:{verdict:'中',reason:'只依据本次合成记录'}},findings:{verified:[{rule_id:'synthetic-rule',synthetic_unknown:{kept:true}}],overturned:[]},
      metrics:{synthetic_unknown:{kept:true},known_zero:0},playbook_version:1},
    notes:{note_date:today,kind:'insight',title:'本次合成复盘笔记',body_md:'合成洞察\n第二行',tags:['合成','保持'],related_article_ids:[ids.articles],related_rule_ids:['synthetic-rule'],decided_by:'本次合成执行者'},
    'account-health':{platform:'toutiao',observed_on:today,impressions_per_day:0,reads_per_day:0,ctr:0,since_date:weekStart,
      platform_notice:{text:'合成平台通知',date:today},judgement:'normal',action:'仅合成记录，无真实操作',resume_on:null}
  };
  const edits={
    'benchmark-accounts':{posting_cadence:'每周三篇（合成修改）'},'benchmark-articles':{topic:'合成选题修改'},playbooks:{changelog_md:'合成修改记录'},
    articles:{topic_category:'合成题材修改'},snapshots:{reads:12},reports:{summary_md:'修改后的合成周复盘。'},notes:{body_md:'修改后的合成洞察'},'account-health':{action:'合成后续动作修改'}
  };
  for(const kind of Object.keys(ids)) {
    const create=form({kind,id:ids[kind],account,date:today,values:values[kind]});
    assert.equal(create.ok,true,kind+' new native form: '+create.error);assert.equal(create.method,'PUT');
    const created=await call(kind+'-actual-form-create',create.method,create.path,create.body,{expected:201,vector:create});
    const loaded=await call(kind+'-actual-form-load-detail','GET',create.path);
    const patch=form({kind,original:loaded,values:edits[kind]});
    assert.equal(patch.ok,true,kind+' edit native form: '+patch.error);assert.equal(patch.method,'PATCH');assert.equal(patch.body.expected_hash,loaded.content_hash);
    const edited=await call(kind+'-actual-form-edit',patch.method,patch.path,patch.body,{vector:patch});
    const noop=form({kind,original:edited,values:{}});
    assert.equal(noop.ok,true,kind+' no-op native form: '+noop.error);
    const unchanged=await call(kind+'-actual-form-no-op',noop.method,noop.path,noop.body,{vector:noop,noOp:true});
    assert.equal(unchanged.content_hash,edited.content_hash,kind+' no-op changed its hash');
    const stale=form({kind,original:created,values:edits[kind]});
    assert.equal(stale.ok,true,kind+' stale native form: '+stale.error);
    await call(kind+'-actual-form-real-cas-conflict',stale.method,stale.path,stale.body,{expected:409,vector:stale});
    await call(kind+'-actual-filtered-list','GET','/api/v1/review/'+kind+'?account='+encodeURIComponent(account)+'&offset=0');
    states[kind]=unchanged;
  }
  assert.equal(states.snapshots.impressions,null);assert.equal(states.snapshots.fan_reads,0);
  assert.equal(states.snapshots.avg_read_seconds,1e-7);assert.equal(states.snapshots.revenue,1e-29);
  assert.deepEqual(states.snapshots.traffic_sources,{synthetic_unknown:{kept:true}});
  assert.deepEqual(states.reports.metrics,{synthetic_unknown:{kept:true},known_zero:0});
  assert.deepEqual(states.reports.findings.verified[0].synthetic_unknown,{kept:true});

  // Read-only defaults from legacy playbooks must remain an exact no-op under the actual shared form builder.
  const rawRules=states.playbooks.rules.map(({status,...rule})=>rule);
  await app.db.prepare('UPDATE matrix_review_playbooks SET status=NULL,rules_json=? WHERE user_id=? AND id=?').bind(JSON.stringify(rawRules),owner,ids.playbooks).run();
  const legacy=await call('playbooks-legacy-default-detail','GET','/api/v1/review/playbooks/'+ids.playbooks);
  const legacyForm=form({kind:'playbooks',original:legacy,values:{}});assert.equal(legacyForm.ok,true,legacyForm.error);
  const legacyNoop=await call('playbooks-legacy-default-actual-form-no-op',legacyForm.method,legacyForm.path,legacyForm.body,{vector:legacyForm,noOp:true});
  assert.equal(legacyNoop.content_hash,legacy.content_hash);

  function invalid(name,kind,changes) {
    const original=states[kind],merged={...structuredClone(original),...structuredClone(changes)};
    const built=form({kind,original,values:changes});assert.equal(built.ok,false,name+' was accepted by the actual native form builder');
    invalidForms.push({name,kind,original,values:merged,error:built.error});
  }
  invalid('percentage-over-100','snapshots',{ctr:101});invalid('negative-read-count','snapshots',{reads:-1});invalid('fractional-integer-read-count','snapshots',{reads:1.5});
  invalid('daily-summary-over-two-sentences','reports',{period_type:'daily',summary_md:'第一句。第二句。第三句。'});
  invalid('duplicate-rule-identities','playbooks',{rules:[states.playbooks.rules[0],states.playbooks.rules[0]]});
  invalid('invalid-boolean','benchmark-accounts',{is_featured_author:'maybe'});
  invalid('guessed-article-reference','notes',{related_article_ids:['not-a-record-uuid']});invalid('invalid-calendar-time','articles',{published_at:'2026-02-30'});
  invalid('missing-required-metrics-object','reports',{metrics:null});invalid('unknown-notice-field','account-health',{platform_notice:{text:'合成',unsupported:'blocked'}});
  invalid('reserved-structured-key','snapshots',{traffic_sources:{constructor:'blocked'}});
  invalid('missing-required-benchmark-name','benchmark-accounts',{name:''});
  invalid('unfinished-native-row-blocks-queue','playbooks',{__native_pending_rules:{rule_id:'unsaved-synthetic-input'}});
  invalid('unknown-rule-field-kept-but-not-written','playbooks',{rules:[{...states.playbooks.rules[0],synthetic_future_field:'must-not-be-dropped'}]});
  invalid('unknown-evidence-field-kept-but-not-written','playbooks',{rules:[{...states.playbooks.rules[0],evidence:{metric:'reads',with_median:0,without_median:null,n_with:1,n_without:1,synthetic_future_field:'must-not-be-dropped'}}]});
  assert.equal(externalFetchAttempts,0);assert.equal(sha(await readFile(formFile)),formSourceHash,'Native form source changed during capture; rebuild and regenerate');
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,commands_from:'Actual shared native ReviewFormLogic.New/Build',
    form_logic_sha256:formSourceHash,form_builder_assembly_sha256:assemblyHash,external_fetch_attempts:externalFetchAttempts,generated_at:new Date().toISOString(),
    fixture:'Exact c30a8a9 compiled Worker.fetch + existing temporary Miniflare D1 harness; external services/fetch disabled',samples,invalid_forms:invalidForms},null,2)+'\n');
  console.log('Generated '+samples.length+' actual native form/Worker samples and '+invalidForms.length+' local form rejections; synthetic temporary D1; zero external fetch attempts.');
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
