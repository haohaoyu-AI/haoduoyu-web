// Exact-source read-only media contracts. Synthetic setup uses an isolated temporary D1 only.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-media-review-contract.mjs <isolated-source-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture(),originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic media review contract');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const accounts={tt:'toutiao-haoduoyu',zh:'zhihu-haoduoyu',wx:'wechat-xiaoyuer'};
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(Object.values(accounts)),DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const samples=[],tables=['matrix_accounts','matrix_articles','matrix_observations','matrix_daily_metrics','matrix_audit','matrix_control'];
  async function businessDigest() {
    const rows=await Promise.all(tables.map(async table=>[table,(await app.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results]));
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  async function get(name,path,{status=200,localReject=false}={}) {
    assert.ok(samples.length<50,'capture remains below the normal sixty/minute public-read budget');
    const before=await businessDigest();
    const response=await worker.fetch(new Request(app.origin+path,{headers:{Origin:app.origin,'X-Public-Business':'1'}}),env);
    const responseJson=await response.text();assert.equal(response.status,status,name+' returned '+responseJson.slice(0,500));
    assert.equal(await businessDigest(),before,name+' unexpectedly changed synthetic business data');
    samples.push({name,method:'GET',path,status:response.status,response_json:responseJson,local_query_rejection:localReject,business_data_unchanged:true});
    return JSON.parse(responseJson).data;
  }
  // Use a distinct initial query: direct synthetic setup does not manipulate the
  // normal revision/cache machinery, and this empty cache key is never reused.
  const initial=await get('initial-empty-overview-anchor','/api/v1/overview?period=30d&top_n=2');
  const today=initial.window.to,day=n=>new Date(Date.parse(today+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const stamp=day(0)+'T12:00:00.000Z';
  const ids={candidate:randomUUID(),zh:randomUUID(),wx:randomUUID(),unverified:randomUUID(),draft:randomUUID(),peers:Array.from({length:5},()=>randomUUID())};
  const statements=[];
  function article(id,accountId,published,title,{notes='',mode='manual',status='published'}={}) {
    statements.push(app.db.prepare(`INSERT INTO matrix_articles
      (id,account_id,title,url,published_at,started_at,production_mode,summary,notes,version,created_at,updated_at,status)
      VALUES(?,?,?,?,?,?,?,?,?,1,?,?,?)`).bind(id,accountId,title,status==='published'?'https://example.invalid/media-contract/'+id:null,
        status==='published'?published+'T01:00:00.000Z':null,null,mode,'合成数据，不是真实运营记录',notes,stamp,stamp,status));
  }
  article(ids.candidate,accounts.tt,day(-70),'合成候选文章 🐟',{mode:'automatic'});
  article(ids.zh,accounts.zh,day(-80),'合成知乎文章');
  article(ids.wx,accounts.wx,day(-90),'【保险200篇·第31篇】合成保险记录');
  article(ids.unverified,accounts.tt,day(-65),'日期待核实合成文章',{notes:'日期待核实'});
  article(ids.draft,accounts.tt,day(0),'合成未发布草稿',{status:'drafting'});
  for(const id of ids.peers)article(id,accounts.tt,day(-120),'合成历史样本 '+id);
  function observation(articleId,asOf,kind,metrics) {
    statements.push(app.db.prepare(`INSERT INTO matrix_observations
      (id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(randomUUID(),articleId,asOf,stamp,kind,JSON.stringify(metrics),'synthetic isolated platform capture','合成纯读取合同',stamp));
  }
  observation(ids.candidate,day(-70)+'T12:00:00.000Z','d1',{reads:0,likes:0}); // Before d1 due, not completion.
  observation(ids.candidate,day(-1)+'T12:00:00.000Z','latest',{reads:900,likes:0,comments:0});
  observation(ids.candidate,stamp,'latest',{reads:1000,likes:0});
  observation(ids.zh,stamp,'latest',{reads:0,approvals:0,comments:0});
  observation(ids.wx,stamp,'latest',{reads:2000,likes:2,comments:0});
  let dailyIndex=0;
  function daily(accountId,articleId,date,metrics) {
    statements.push(app.db.prepare(`INSERT INTO matrix_daily_metrics(id,account_id,article_id,date,metrics_json,source,updated_at)
      VALUES(?,?,?,?,?,?,?)`).bind('synthetic-daily-'+(++dailyIndex),accountId,articleId,date,JSON.stringify(metrics),'synthetic day increments',stamp));
  }
  for(let offset=-59;offset<=0;offset++) {
    daily(accounts.tt,null,day(offset),{reads:offset<-29||offset===0?0:10,likes:0,comments:0});
    daily(accounts.zh,null,day(offset),{reads:20,approvals:0,comments:0}); // likes stays missing.
  }
  daily(accounts.tt,ids.candidate,day(0),{reads:900,likes:5,comments:0});
  for(const id of ids.peers)daily(accounts.tt,id,day(-50),{reads:100});
  daily(accounts.wx,null,day(-1),{reads:50});
  daily(accounts.wx,ids.wx,day(0),{reads:1,likes:0});
  await app.db.batch(statements);
  const all=await get('overview-yesterday-all','/api/v1/overview');
  assert.equal(all.window.to,today,'capture crossed Beijing midnight; rerun in a fresh isolated fixture');
  assert.equal(all.totals.article_count,9);assert.equal(all.cumulative.article_count,9);assert.equal(all.cumulative.totals.reads,3000);
  const tt=all.accounts.find(row=>row.id===accounts.tt),zh=all.accounts.find(row=>row.id===accounts.zh);
  assert.equal(tt.period_metrics.reads,0);assert.equal(tt.comparisons.reads.delta,-10);assert.equal(tt.comparisons.reads.percent,-100);
  assert.equal(zh.period_metrics.approvals,0);assert.equal(zh.period_metrics.likes,undefined);assert.ok(zh.coverage.missing_metrics.includes('likes'));
  assert.equal(all.attention_articles.find(row=>row.id===ids.candidate).attention.kind,'up');
  assert.ok(!all.attention_articles.some(row=>row.id===ids.unverified||row.id===ids.draft));
  const seven=await get('overview-7d-all','/api/v1/overview?period=7d&top_n=10');
  const thirty=await get('overview-30d-all','/api/v1/overview?period=30d&top_n=10');
  assert.equal(thirty.window.days,30);assert.equal(thirty.accounts.find(row=>row.id===accounts.tt).coverage.days,30);
  assert.equal(thirty.accounts.find(row=>row.id===accounts.tt).comparisons.reads.comparable,true);
  assert.equal(thirty.accounts.find(row=>row.id===accounts.tt).comparisons.reads.percent,null);
  assert.equal(thirty.accounts.find(row=>row.id===accounts.wx).coverage.source,'mixed');
  const ranked=await get('overview-7d-zhihu-top1-only','/api/v1/overview?period=7d&top_n=1&top_platform=zhihu');
  assert.deepEqual(ranked.cumulative,seven.cumulative);assert.deepEqual(ranked.accounts,seven.accounts);assert.deepEqual(ranked.trend,seven.trend);
  assert.equal(ranked.top_articles.length,1);assert.equal(ranked.top_articles[0].id,ids.zh);assert.equal(ranked.top_articles[0].latest_metrics.reads,0);
  const scoped=await get('overview-7d-tt-account','/api/v1/overview?account_id='+accounts.tt+'&period=7d');
  assert.equal(scoped.accounts.length,1);assert.equal(scoped.cumulative.article_count,7);assert.equal(scoped.cumulative.totals.reads,1000);
  const detail=await get('candidate-detail','/api/v1/articles/'+ids.candidate);
  assert.equal(detail.observations.length,3);assert.equal(detail.version,1);
  const due=await get('due-all-three-targets','/api/v1/due-reviews');
  assert.deepEqual(due.filter(row=>row.id===ids.candidate).map(row=>row.due_kind),['d1','d3','d7']);
  assert.ok(!due.some(row=>row.id===ids.unverified||row.id===ids.draft));
  const dueScoped=await get('due-tt-account','/api/v1/due-reviews?account_id='+accounts.tt);
  assert.ok(dueScoped.every(row=>row.account_id===accounts.tt));
  const observations=await get('observations-all','/api/v1/observations');assert.equal(observations.length,5);
  const observationsAccount=await get('observations-tt-account','/api/v1/observations?account_id='+accounts.tt);assert.equal(observationsAccount.length,3);
  const observationsArticle=await get('observations-candidate-article','/api/v1/observations?article_id='+ids.candidate);assert.equal(observationsArticle.length,3);
  await get('observations-account-and-article','/api/v1/observations?account_id='+accounts.tt+'&article_id='+ids.candidate);
  assert.deepEqual(await get('observations-empty-article','/api/v1/observations?article_id='+ids.peers[0]),[]);
  const dailyAll=await get('daily-all','/api/v1/daily-metrics');assert.equal(dailyAll.length,128);
  const dailyRange=await get('daily-tt-seven-range','/api/v1/daily-metrics?account_id='+accounts.tt+'&from='+day(-6)+'&to='+today);
  assert.equal(dailyRange.length,8);assert.ok(dailyRange.some(row=>row.article_id===null)&&dailyRange.some(row=>row.article_id===ids.candidate));
  assert.deepEqual(await get('daily-empty-range','/api/v1/daily-metrics?from=1900-01-01&to=1900-01-02'),[]);
  await get('daily-wx-thirty-range','/api/v1/daily-metrics?account_id='+accounts.wx+'&from='+day(-29)+'&to='+today);
  for(const [name,path] of [
    ['daily-invalid-calendar-date','/api/v1/daily-metrics?from=2026-02-30'],
    ['daily-reversed-range','/api/v1/daily-metrics?from=2026-02-02&to=2026-02-01'],
    ['overview-invalid-period','/api/v1/overview?period=today'],
    ['overview-duplicate-period','/api/v1/overview?period=7d&period=30d'],
    ['overview-invalid-topn','/api/v1/overview?top_n=0'],
    ['overview-invalid-topplatform','/api/v1/overview?top_platform=unsupported']])
    await get(name,path,{status:400,localReject:true});
  assert.equal(externalFetchAttempts,0);
  const sourceHashes={};
  for(const name of ['src/records.mjs','src/overview.mjs','src/analytics.mjs','src/worker.mjs','dist/server/index.js'])
    sourceHashes[name]=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:0,production_business_requests:0,
    generated_at:new Date().toISOString(),source_hashes:sourceHashes,accounts,ids,last_complete_day:today,seven_from:day(-6),thirty_from:day(-29),
    fixture:'Exact c30 compiled Worker.fetch, existing synthetic harness bootstrap/login and fresh temporary Miniflare D1. Captured business GETs check unchanged business/control/audit digests; no source, constraints, permissions, limiter, clock or revision/cache manipulation. Runtimes disposed.',
    native_only_rejected_queries:['/api/v1/overview?page=1','/api/v1/due-reviews?period=7d','/api/v1/observations?from=2026-01-01',
      '/api/v1/daily-metrics?article_id='+ids.candidate,'/api/v1/overview?account_id='+accounts.tt+'&account_id='+accounts.zh],samples},null,2)+'\n');
  console.log(`Generated ${samples.length} actual GET-only media review contracts; zero/missing, 7/30 days, top-only platform, due triples and scoped arrays verified; business data unchanged on every GET, zero external fetch attempts.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
