import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerStatuses,loadArticleLedgerSummary,summarizeArticleLedger} from '../web/core/article-ledger-data.mjs';
import {renderArticleLedgerSummary} from '../web/pages/article-ledger-overview.mjs';

const article=(id,status,writer=null,account_id='synthetic-account')=>({id,status,writer,account_id});
function service(rows,{mutate}={}) {
  const calls=[];
  return {calls,async request(path,options) {
    calls.push({path,options});
    const query=new URL('http://synthetic.invalid'+path).searchParams,status=query.get('status');
    const page=Number(query.get('page')),page_size=Number(query.get('page_size')),accountId=query.get('account_id');
    const cohort=rows.filter(row=>row.status===status&&(!accountId||row.account_id===accountId)),offset=(page-1)*page_size;
    const payload={data:cohort.slice(offset,offset+page_size),meta:{total:cohort.length,page,page_size,offset,has_more:offset+page_size<cohort.length}};
    return mutate?mutate(payload,{query,status,page}):payload;
  }};
}

test('ledger summary counts only actual statuses and writer values without inventing missing metadata or schedules',()=>{
  const rows=[article('a','draft_saved','dedao'),article('b','drafting','dedao'),article('c','illustrated','gemini_web'),
    article('d','failed','human'),article('e','published','dedao'),article('f','published',null),article('g','draft_saved','future-writer')];
  const before=structuredClone(rows),summary=summarizeArticleLedger(rows);
  assert.equal(summary.total,7);assert.equal(summary.unpublished,5);assert.equal(summary.draft_saved,2);assert.equal(summary.published,2);
  assert.deepEqual(summary.counts,{drafting:1,illustrated:1,draft_saved:2,published:2,failed:1});
  assert.deepEqual(summary.writers.find(row=>row.writer==='dedao'),{writer:'dedao',unpublished:2,published:1,total:3});
  assert.deepEqual(summary.writers.find(row=>row.writer==='unknown'),{writer:'unknown',unpublished:1,published:1,total:2});
  assert.equal(summary.consistency,'paged_not_atomic');assert.deepEqual(rows,before);
  assert.throws(()=>summarizeArticleLedger([article('bad',null)]),error=>error.code==='LEDGER_INCOMPLETE');
});

test('empty real set stays clean and unavailable data is not rendered as zero',()=>{
  const summary=summarizeArticleLedger([]),empty=renderArticleLedgerSummary(summary),unknown=renderArticleLedgerSummary();
  assert.equal(summary.total,0);assert.deepEqual(summary.writers,[]);assert.match(empty,/尚未记录文章/);
  assert.match(empty,/data-action="new-article"/);assert.doesNotMatch(empty,/<table|<dd>|应产出|缺失/);
  assert.match(unknown,/数量未取得/);assert.doesNotMatch(unknown,/>0</);
});

test('all five cohorts and complete pages are loaded before counting with the same cancellable context',async()=>{
  const rows=Array.from({length:205},(_,i)=>article('draft-'+i,'draft_saved',i%2?'dedao':null));
  rows.push(article('published','published','human'),article('other-account','published','other','other-account'));
  const mock=service(rows),context={synthetic:true};
  const result=await loadArticleLedgerSummary(context,{accountId:'synthetic-account',request:mock.request});
  assert.equal(result.total,206);assert.equal(result.unpublished,205);assert.equal(result.published,1);assert.equal(result.requests,6);
  assert.deepEqual([...new Set(mock.calls.map(call=>new URL('http://synthetic.invalid'+call.path).searchParams.get('status')))],ledgerStatuses);
  assert.ok(mock.calls.every(call=>call.options.envelope===true&&call.options.context===context));
  assert.ok(mock.calls.every(call=>new URL('http://synthetic.invalid'+call.path).searchParams.get('account_id')==='synthetic-account'));
});

test('incomplete, drifting, duplicate, wrong-status and cross-account pages never produce partial summary counts',async()=>{
  const rows=Array.from({length:201},(_,i)=>article('row-'+i,'draft_saved','dedao'));
  for(const mutate of [
    payload=>({...payload,meta:undefined}),
    payload=>({...payload,meta:{...payload.meta,has_more:!payload.meta.has_more}}),
    (payload,{status,page})=>status==='draft_saved'&&page===2?{...payload,meta:{...payload.meta,total:202}}:payload,
    (payload,{status,page})=>status==='draft_saved'&&page===2?{...payload,data:[rows[0]]}:payload,
    (payload,{status})=>status==='draft_saved'?{...payload,data:payload.data.map(row=>({...row,status:'published'}))}:payload,
    (payload,{status})=>status==='draft_saved'?{...payload,data:payload.data.map(row=>({...row,account_id:'forbidden'}))}:payload,
  ])await assert.rejects(()=>loadArticleLedgerSummary(null,{accountId:'synthetic-account',request:service(rows,{mutate}).request}),
    error=>error.code==='LEDGER_INCOMPLETE');
});

test('bounded total and failed requests remain unavailable instead of truncating records',async()=>{
  const tooMany=service(Array.from({length:2001},(_,i)=>article('large-'+i,'draft_saved')));
  await assert.rejects(()=>loadArticleLedgerSummary(null,{request:tooMany.request}),error=>error.code==='LEDGER_INCOMPLETE');
  const failure=Object.assign(new Error('synthetic cancelled'),{staleSession:true});
  await assert.rejects(()=>loadArticleLedgerSummary(null,{request:async()=>{throw failure;}}),error=>error===failure);
});

test('summary HTML escapes all labels, retains genuine zero comparison cells and does not infer scheduled output',()=>{
  const summary=summarizeArticleLedger([article('a','draft_saved','dedao'),article('b','published','human')]);
  const html=renderArticleLedgerSummary(summary);
  assert.match(html,/得到大脑/);assert.match(html,/人工/);assert.match(html,/>0<\/td>/);assert.match(html,/不是原子快照/);
  assert.doesNotMatch(html,/今日应产出|缺失 \d|完成率|耗时中位/);
  const untrusted=structuredClone(summary);untrusted.writers[0].writer='<img src=x onerror=1>';
  const safe=renderArticleLedgerSummary(untrusted);assert.doesNotMatch(safe,/<img|onerror/);assert.match(safe,/未记录/);
});
