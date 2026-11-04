// Read-only inventory contract against exact source and newly seeded temporary D1 records only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-article-reconciliation-contract.mjs <isolated-source-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const {reconcileArticles}=await import(pathToFileURL(resolve(root,'src/article-reconciliation.mjs')));
const app=await fixture();const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic reconciliation contract');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  const samples=[];
  async function get(name,path,{expected=200,ownerMode=false,allowedAccounts}={}) {
    const headers=new Headers({Origin:app.origin});
    if(ownerMode)headers.set('Cookie',session.cookie);else headers.set('X-Public-Business','1');
    const response=await worker.fetch(new Request(app.origin+path,{headers}),env);
    const responseJson=await response.text();assert.equal(response.status,expected,name+' returned '+responseJson);
    samples.push({name,method:'GET',path,status:response.status,response_json:responseJson,...(allowedAccounts?{allowed_accounts:allowedAccounts}:{})});
    return JSON.parse(responseJson).data;
  }
  const publicAllowed=['toutiao-haoduoyu'];
  const empty=await get('complete-empty-public-inventory','/api/v1/article-reconciliation',{allowedAccounts:publicAllowed});assert.equal(empty.total,0);
  const definitions=[
    ['A','draft_saved','gzh','human','2026-11-01',4,[{done:false,text:'合成待核'}]],
    ['B','published','gzh','dedao','2026-11-02',4,[]],
    ['C',null,'gzh',null,null,8,[{done:1,text:'合成未知状态'}]],
    ['D','failed','tt1','gemini_web','2026-11-03',200,null],
    ['E',null,'gzh',null,null,null,null],
    ['F','drafting','zh1','other',null,99,[{done:true,text:'合成已核'}]]
  ];
  const ids={};
  for(const [label,status,slot,writer,date,series,verify] of definitions) {
    const id=ids[label]=randomUUID();
    await app.db.prepare(`INSERT INTO matrix_articles(id,account_id,title,status,slot,writer,run_date,series_no,
      sample_json,verify_items_json,char_count,subheading_count,image_count,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,'toutiao-haoduoyu','合成 PUBLIC '+label,status,slot,writer,date,series,
        JSON.stringify({synthetic_future:{zero:0,nullable:null,text:'原始样本 😀',tiny:1e-7,big:1e20}}),verify===null?null:JSON.stringify(verify),
        label==='D'?0:null,null,label==='D'?0:null,'2026-11-04T00:00:00Z','2026-11-04T00:00:00Z').run();
  }
  const privateId=randomUUID();
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .bind(privateId,'zhihu-haoduoyu','SYNTHETIC-PRIVATE-ACCOUNT-CANARY','drafting','2026-11-04T00:00:00Z','2026-11-04T00:00:00Z').run();
  const publicAccounts=await get('complete-public-accounts','/api/v1/accounts');assert.deepEqual(publicAccounts.map(x=>x.id),publicAllowed);
  const value=await get('complete-public-inventory','/api/v1/article-reconciliation',{allowedAccounts:publicAllowed});
  assert.equal(value.total,6);assert.equal(value.counts.unknown,2);assert.ok(!JSON.stringify(value).includes(privateId));
  assert.deepEqual(value.insurance.duplicate_numbers,[{number:4,article_ids:[ids.B,ids.A]}]);
  assert.deepEqual(value.insurance.observed_gap_ranges,[{from:5,to:7}]);assert.equal(value.insurance.highest,8);
  assert.equal(value.schedule.configured,false);assert.equal(value.schedule.expected,null);
  const ownerAccounts=await get('complete-owner-accounts','/api/v1/accounts',{ownerMode:true});
  const ownerValue=await get('complete-owner-inventory','/api/v1/article-reconciliation',{ownerMode:true,allowedAccounts:ownerAccounts.map(x=>x.id)});
  assert.equal(ownerValue.total,7);assert.ok(ownerValue.rows.some(x=>x.id===privateId));
  await get('reconciliation-rejects-query','/api/v1/article-reconciliation?date=2026-11-04',{expected:400});
  const nullDetail=await get('complete-null-status-detail','/api/v1/articles/'+ids.C);assert.equal(nullDetail.status,null);

  const filters=[
    [{},value.rows],
    [{AccountId:'toutiao-haoduoyu'},value.rows],
    [{Status:'unknown'},value.rows.filter(x=>x.status===null)],
    [{RunDate:'unknown'},value.rows.filter(x=>x.run_date===null)],
    [{Slot:'gzh'},value.rows.filter(x=>x.slot==='gzh')],
    [{Writer:'unknown'},value.rows.filter(x=>x.writer===null)],
    [{Query:'public a'},value.rows.filter(x=>x.id===ids.A)],
    [{HasWarnings:true},value.rows.filter(x=>x.warnings.length>0)],
    [{HasPendingVerify:true},value.rows.filter(x=>x.has_pending_verify===true)],
    [{HasPendingVerify:false},value.rows.filter(x=>x.has_pending_verify===false)],
    [{PendingUnknownOnly:true},value.rows.filter(x=>x.has_pending_verify===null)],
    [{Slot:'gzh',Status:'unknown'},value.rows.filter(x=>x.slot==='gzh'&&x.status===null)]
  ].map(([filter,rows])=>({filter,expected_ids:rows.map(x=>x.id),expected_counts:reconcileArticles(rows).counts}));
  // The current D1 CHECK forbids future status strings. Exercise that portable read-only case with the original source reducer, never by disabling constraints.
  const futureRows=structuredClone(value.rows);futureRows[0].status='synthetic_future_status';
  const futureModel=reconcileArticles(futureRows);
  const futureUnknown=futureRows.filter(x=>x.status===null||!['drafting','illustrated','draft_saved','published','failed'].includes(x.status)).map(x=>x.id);
  // Small seed representation of a legitimate near-1MiB source inventory. C# reconstructs the rows then roundtrips escaped cache JSON.
  const template={...structuredClone(value.rows[0]),slot:null,series_no:null,status:'drafting',writer:null,run_date:null,warnings:[],has_pending_verify:null,verify_state:'unknown',missing_fields:['run_date','slot','writer']};
  const budgetIds=Array.from({length:24},()=>randomUUID()),repeats=6000;
  const budgetRows=budgetIds.map(id=>({...structuredClone(template),id,sample:{text:'中😀'.repeat(repeats),tiny:1e-7,big:1e20,zero:0,nullable:null}}));
  const budgetBytes=Buffer.byteLength(JSON.stringify(budgetRows));assert.ok(budgetBytes>1000000&&budgetBytes<1048576);
  const budgetModel=reconcileArticles(budgetRows);delete budgetModel.rows;
  assert.equal(externalFetchAttempts,0);await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:0,
    generated_at:new Date().toISOString(),fixture:'Exact compiled c30 Worker.fetch + existing temporary Miniflare D1; public/account-scoped reads only; synthetic direct-D1 setup; no constraints changed; runtimes disposed',
    samples,filters,synthetic_source_reducer_case:{data:futureModel,unknown_ids:futureUnknown,not_an_http_response:true},
    unicode_budget_case:{template,ids:budgetIds,repeats,source_js_rows_bytes:budgetBytes,summary_without_rows:budgetModel}},null,2)+'\n');
  console.log(`Generated ${samples.length} real read-only Worker requests, ${filters.length} source-derived local filters, null/unknown/gzh duplicates/gap candidates and one near-limit Unicode cache seed; zero external fetch attempts.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
