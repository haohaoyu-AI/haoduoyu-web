import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDB} from '../frontend/web/offline/db.mjs';
import {createLocalApi, LOCAL_SCOPE} from '../frontend/web/local/api.mjs';
import {REVIEW_COLLECTIONS, REVIEW_READ_LIMITS} from '../frontend/web/local/review.mjs';
import {readContentReviewData, readContentReviewDataWithRetry} from '../frontend/web/review-controller.mjs';
import {readAllAiReports, reportsForDailyDate} from '../frontend/web/ai-reports-controller.mjs';
import {renderContentReviewContent} from '../frontend/web/pages/content-review.mjs';
import {reviewOverviewMetrics} from '../frontend/web/core/review-overview-metrics.mjs';
const fixture = () => {const db = createMemoryDB(); return {db, api:createLocalApi({db, now:() => Date.parse('2026-11-08T04:00:00Z')})};};
const row = (id, extra = {}) => ({id, account:'V字', ...extra});
const seed = (db,kind,value,scope=LOCAL_SCOPE) => db.transaction(['entities'],'readwrite',tx => tx.put('entities',
  {key:JSON.stringify([scope,kind,value.id]),scope,kind,id:value.id,value}));
const readPath = (resource,extra='') => '/review/' + resource + '?account=' + encodeURIComponent('V字') + extra;
const vm = {account:'V字',view:'overview',secondary:'benchmarks',filters:{},metricColumns:['reads'],articlesExpanded:true,loading:false,error:''};

test('original eight-collection loader reads true empty local database and original template empty state', async () => {
  const {db,api} = fixture(), calls = [];
  const before = await db.transaction(['entities'],'readonly',tx => tx.getAll('entities'));
  const data = await readContentReviewData(path => {calls.push(path); return api(path);},'V字');
  assert.equal(calls.length,8); for (const items of Object.values(data)) assert.deepEqual(items,[]);
  const pages = await Promise.all(REVIEW_COLLECTIONS.map(name => api(readPath(name))));
  assert.equal(new Set(pages.map(p => p.read_revision)).size,1);
  assert.match(pages[0].read_revision,/^[a-f0-9]{64}$/);
  assert.ok(pages.every(p => p.has_more === false && p.items.length === 0));
  assert.deepEqual(await api('/accounts'),[]);
  assert.deepEqual(await db.transaction(['entities'],'readonly',tx => tx.getAll('entities')),before);
  const html = renderContentReviewContent(data,vm);
  assert.match(html,/暂无内容复盘数据/); assert.doesNotMatch(html,/读取失败|正在读取/);
  const metrics = reviewOverviewMetrics(data,{account:'V字',now:'2026-11-08T04:00:00Z'});
  assert.equal(metrics.count,0); assert.equal(metrics.readsMedian,null); assert.equal(metrics.ctrMedian,null);
});

test('original loader and renderer read populated isolated synthetic fixtures without inventing missing metrics', async () => {
  const {db,api} = fixture();
  await seed(db,'review:articles',row('article-1',{title:'合成测试文章，不是真实资料',published_at:'2026-11-08T00:00:00Z',platform:'头条'}));
  await seed(db,'review:articles',row('foreign-article',{account:'其他分区',title:'不显示',published_at:'2026-11-08T00:00:00Z'}));
  await seed(db,'review:snapshots',{id:'snapshot-1',article_id:'article-1',snapshot_date:'2026-11-08',reads:0,ctr:null});
  await seed(db,'review:snapshots',{id:'snapshot-foreign',article_id:'foreign-article',snapshot_date:'2026-11-08',reads:999});
  await seed(db,'review:benchmark-accounts',row('bench-1',{name:'合成对标'}));
  await seed(db,'review:benchmark-articles',{id:'sample-1',benchmark_account_id:'bench-1',title:'合成参考'});
  await seed(db,'review:articles',row('deleted',{deleted_at:'2026-11-08T01:00:00Z'}));
  await seed(db,'review:articles',row('remote'), 'remote:website');
  const data = await readContentReviewData(api,'V字');
  assert.deepEqual(data.articles.map(a => a.id),['article-1']);
  assert.deepEqual(data.snapshots.map(s => s.id),['snapshot-1']);
  assert.equal(data.snapshots[0].reads,0); assert.equal(data.snapshots[0].ctr,null);
  assert.equal(data.benchmarkArticles[0].account,'V字');
  const html = renderContentReviewContent(data,vm);
  assert.match(html,/合成测试文章/); assert.doesNotMatch(html,/暂无内容复盘数据|不显示/);
  assert.deepEqual(await api('/accounts'),[]);
});

test('100-item pagination reads all actual records with the original loader', async () => {
  const {db,api} = fixture();
  for (let i=0;i<101;i++) await seed(db,'review:articles',row('article-'+String(i).padStart(3,'0'),{published_at:'2026-11-08'}));
  const first=await api(readPath('articles')); assert.equal(first.items.length,100); assert.equal(first.has_more,true);
  const last=await api(readPath('articles','&offset=100&read_revision='+first.read_revision));
  assert.equal(last.items.length,1); assert.equal(last.has_more,false);
  assert.equal((await readContentReviewData(api,'V字')).articles.length,101);
});

test('revision binds all eight collections, including a different collection between pages', async () => {
  const {db,api} = fixture(), original = (await api(readPath('articles'))).read_revision;
  for (const resource of REVIEW_COLLECTIONS) {
    await seed(db,'review:'+resource,row(resource,{article_id:'missing',benchmark_account_id:'missing'}));
    const next=(await api(readPath('articles'))).read_revision; assert.notEqual(next,original);
    await assert.rejects(api(readPath('articles','&offset=100&read_revision='+original)),e=>e.code==='READ_REVISION_CHANGED');
  }
  // Actual original loader rejects mixed cross-collection snapshots; retry succeeds only on a stable snapshot.
  let release; const gate = new Promise(resolve => {release=resolve;});
  const unstable = async path => {
    if (!path.startsWith('/review/articles?')) {await gate; return api(path);}
    const result=await api(path);
    await seed(db,'review:notes',row('change',{note_date:'2026-11-08'})); release();
    return result;
  };
  await assert.rejects(readContentReviewData(unstable,'V字'),e=>e.code==='READ_REVISION_CHANGED');
  assert.ok(await readContentReviewDataWithRetry(api,'V字'));
});

test('AI report original loader returns actual stored reports and preserves work-date filtering', async () => {
  const {db,api} = fixture(); assert.deepEqual(await readAllAiReports(api),[]);
  assert.deepEqual(await api('/work-reminders?date=2026-11-08'),{date:'2026-11-08',items:[],can_edit:false});
  await seed(db,'ai-report',{id:'report-1',author:'合成 GPT',content:'2026-11-07\n合成测试汇报',created_at:'2026-11-08T01:00:00Z'});
  const reports=await readAllAiReports(api); assert.equal(reports.length,1);
  assert.equal(reportsForDailyDate(reports,'2026-11-08').length,1);
  assert.equal(reportsForDailyDate(reports,'2026-11-09').length,0);
  await seed(db,'work-reminder',{id:'reminder-1',date:'2026-11-08',summary:'合成提醒',created_at:'2026-11-08T01:00:00Z'});
  assert.equal((await api('/work-reminders?date=2026-11-08')).items[0].summary,'合成提醒');
  assert.equal((await api('/work-reminders?date=2026-11-09')).items.length,0);
});

test('strict queries, unsupported mutations and analysis never fake success or access network', async () => {
  const {api} = fixture(), prior=globalThis.fetch; let network=0;
  globalThis.fetch=()=>{network++;throw Error('Network prohibited');};
  try {
    for (const suffix of ['&offset=-1','&offset=1.5','&offset=9007199254740992','&offset=0&offset=0','&unknown=1','&account=x'])
      await assert.rejects(api(readPath('articles',suffix)),e=>e.code==='VALIDATION_ERROR');
    await assert.rejects(api('/review/articles'),e=>e.code==='VALIDATION_ERROR');
    await assert.rejects(api('/work-reminders?date=2026-02-30'),e=>e.code==='VALIDATION_ERROR');
    for (const path of ['/review/articles','/ai-reports','/work-reminders','/openai-review/runs'])
      await assert.rejects(api(path,{method:'POST',body:{}}),e=>e.code==='LOCAL_NOT_IMPLEMENTED');
    await assert.rejects(api('/review/overview?account=V字'),e=>e.code==='LOCAL_NOT_IMPLEMENTED');
    await readContentReviewData(api,'V字'); await readAllAiReports(api); assert.equal(network,0);
  } finally {globalThis.fetch=prior;}
});

test('read limits fail rather than truncate or show false zero counts', async () => {
  const {db,api} = fixture();
  for (let i=0;i<=REVIEW_READ_LIMITS.remindersPerDay;i++) await seed(db,'work-reminder',{id:'r'+i,date:'2026-11-08'});
  await assert.rejects(api('/work-reminders?date=2026-11-08'),e=>e.code==='LOCAL_REMINDERS_TOO_LARGE');
  await seed(db,'review:notes',row('oversize',{text:'x'.repeat(REVIEW_READ_LIMITS.totalBytes)}));
  await assert.rejects(readContentReviewData(api,'V字'),e=>e.code==='LOCAL_REVIEW_TOO_LARGE');
});

test('unmodified AI report/reminder paint functions show true empty states and stored synthetic cards', async () => {
  const {paintAiReports,paintAiDailyReminders}=await import('../frontend/web/pages/ai-reports.mjs');
  const previous=globalThis.document, nodes=new Map();
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:''});return nodes.get(selector);};
  globalThis.document={querySelector:selector=>selector==='#ai-reports'?{querySelector:node}:null};
  try {
    const {db,api}=fixture();
    paintAiReports(await readAllAiReports(api),'',false,'2026-11-08');
    assert.equal(node('#ai-report-list-status').textContent,'暂无汇报');
    assert.match(node('#ai-report-list').innerHTML,/暂无汇报/);
    paintAiDailyReminders(await api('/work-reminders?date=2026-11-08'));
    assert.equal(node('#ai-reminder-list').innerHTML,'<p>暂无工作提醒</p>');
    await seed(db,'ai-report',{id:'paint-report',author:'GPT',content:'2026-11-07\n合成测试卡片 <script>bad</script>',created_at:'2026-11-08T01:00:00Z'});
    paintAiReports(await readAllAiReports(api),'',false,'2026-11-08');
    assert.match(node('#ai-report-list').innerHTML,/合成测试卡片/);
    assert.doesNotMatch(node('#ai-report-list').innerHTML,/<script>/);
    await seed(db,'work-reminder',{id:'paint-reminder',date:'2026-11-08',summary:'合成提醒卡片',created_at:'2026-11-08T01:00:00Z'});
    paintAiDailyReminders(await api('/work-reminders?date=2026-11-08'));
    assert.match(node('#ai-reminder-list').innerHTML,/合成提醒卡片/);
  } finally {globalThis.document=previous;}
});
