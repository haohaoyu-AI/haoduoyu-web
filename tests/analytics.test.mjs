import test from 'node:test';
import assert from 'node:assert/strict';
import { articleFacts, cumulativeOverview, summarizeArticles, snapshotTimeline, paginate } from '../src/analytics.mjs';
import { buildOverview, overviewWindow } from '../src/overview.mjs';
const base={id:'a',account_id:'zhihu-haoduoyu',account_name:'好多鱼',platform:'zhihu',published_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-02T00:00:00Z',title:'合成文章',latest_as_of:'2026-10-03T00:00:00Z',latest_collected_at:'2026-10-04T00:00:00Z'};
const row=(id,metrics,rest={})=>articleFacts({...base,id,latest_metrics:metrics,...rest});
const snapshot=(id,as_of,metrics,kind='latest')=>({id,as_of,collected_at:as_of,metrics,kind});
test('cumulative: empty, no snapshot, omitted metrics and genuine zeros remain distinct',()=>{
 const empty=summarizeArticles([]);assert.equal(empty.totals.reads,null);assert.equal(empty.coverage,null);
 const none=summarizeArticles([row('none',null)]);assert.equal(none.no_snapshot_count,1);assert.equal(none.mean_reads,null);
 const zero=summarizeArticles([row('zero',{reads:0,likes:0,comments:0})]);assert.equal(zero.totals.reads,0);assert.equal(zero.mean_reads,0);assert.equal(zero.coverage,1);
 const items=[row('none',null),row('missing',{likes:8}),row('zero',{reads:0,likes:0}),row('known',{reads:13,approvals:4})];
 const result=summarizeArticles(items);assert.equal(result.totals.reads,13);assert.equal(result.mean_reads,6.5);assert.equal(result.median_reads,6.5);assert.equal(result.missing_reads_count,2);assert.equal(result.no_snapshot_count,1);
 assert.equal(result.totals.likes,8);assert.equal(result.totals.approvals,4);assert.equal(result.metric_coverage.comments.recorded,0);
 assert.equal(items[0].snapshot_status,'not_collected');assert.ok(items[1].missing_metrics.includes('reads'));assert.equal(items[2].latest_metrics.reads,0);
});
test('cumulative: global top includes zero, stable ties, platform filter and independent read denominator',()=>{
 const rows=[row('z',{reads:20}),row('b',{reads:20}),row('none',null),row('a',{reads:0},{platform:'toutiao'}),row('m',{comments:3})];
 const before=JSON.stringify(rows),result=cumulativeOverview(rows,{topN:10});
 assert.deepEqual(result.top_articles.map(r=>r.id),['b','z','a']);assert.equal(result.cumulative.mean_reads,40/3);
 assert.deepEqual(cumulativeOverview(rows,{topPlatform:'toutiao'}).top_articles.map(r=>r.id),['a']);assert.equal(JSON.stringify(rows),before);
});
test('cumulative: timestamp range, safe sums, medians and all-null interactions',()=>{
 const r=summarizeArticles([row('a',{reads:1},{latest_as_of:'2026-10-02T00:00:00Z'}),row('b',{reads:9}),row('c',{reads:30})]);
 assert.equal(r.median_reads,9);assert.equal(r.earliest_as_of,'2026-10-02T00:00:00Z');assert.equal(r.as_of,base.latest_as_of);assert.equal(r.collected_at,base.latest_collected_at);assert.equal(r.totals.likes,null);
 assert.throws(()=>summarizeArticles([row('a',{reads:Number.MAX_SAFE_INTEGER}),row('b',{reads:1})]),e=>e.code==='METRIC_OVERFLOW');
});
test('topics/dates/series: infer without writes, parse exact published titles, exclude pending and future',()=>{
 const insurance=title=>row(title,{reads:0},{title,platform:'wechat',account_name:'小鱼儿真保鲜',account_id:'wechat-xiaoyuer'});
 const rows=[insurance('【保险200篇·第17篇】甲'),insurance('【保险200篇·第19篇】乙'),insurance('【保险200篇·第201篇】错误'),insurance('保险200篇第200篇 不匹配'),{...insurance('【保险200篇·第99篇】待核实'),notes:'日期待核实'},{...insurance('【保险200篇·第150篇】未来'),published_at:'2099-01-01T00:00:00Z'}];
 const before=JSON.stringify(rows),out=cumulativeOverview(rows,{now:Date.parse('2026-10-17T00:00:00Z')});
 assert.equal(out.series.highest_recorded,19);assert.equal(out.series.recorded_count,2);assert.equal(JSON.stringify(rows),before);
 assert.equal(articleFacts(rows[4]).date_status,'unverified');assert.equal(articleFacts({...base,account_id:'other',account_name:'其他'}).topic,'unknown');
 assert.equal(articleFacts({...base,published_at:'bad'}).date_status,'unverified');
});
test('snapshot timeline: one sample, zeros, missing metrics, negatives and actual chronological order',()=>{
 assert.equal(snapshotTimeline([snapshot('one','2026-10-03T00:00:00Z',{reads:0})],base.published_at).timeline[0].changes,null);
 const rows=[snapshot('later','2026-10-04T00:00:00Z',{reads:5,likes:1,approvals:4},'d1'),snapshot('early','2026-10-02T00:00:00Z',{reads:10,likes:0,comments:2},'latest')];
 const before=JSON.stringify(rows),out=snapshotTimeline(rows,base.published_at,Date.parse('2026-10-05T00:00:00Z'));
 assert.deepEqual(out.timeline.map(r=>r.id),['early','later']);const c=out.timeline[1].changes;assert.equal(c.reads.delta,-5);assert.equal(c.reads.percent,-50);assert.equal(c.likes.delta,1);assert.equal(c.likes.percent,null);assert.equal(c.comments.comparable,false);assert.equal(c.approvals.delta,null);assert.equal(JSON.stringify(rows),before);
 assert.equal(out.nodes.find(n=>n.kind==='d7').status,'not_due');assert.equal(out.nodes.find(n=>n.kind==='d3').status,'not_collected');
});
test('timeline: equal timestamps do not invent growth, latest captured sample wins per kind',()=>{
 const a=snapshot('a','2026-10-04T00:00:00Z',{reads:2}),b=snapshot('b','2026-10-04T00:00:00Z',{reads:3});
 const out=snapshotTimeline([b,a],null);assert.equal(out.timeline[1].changes.reads.comparable,false);assert.equal(out.nodes.find(n=>n.kind==='latest').snapshot.id,'b');
});
test('pagination: legacy arrays, cross-page continuity, offsets and invalid parameters',()=>{
 const rows=Array.from({length:17},(_,i)=>({id:String(i)}));
 assert.equal(paginate(rows).data.length,17);const pages=[1,2,3].flatMap(page=>paginate(rows,{page,page_size:6}).data);
 assert.deepEqual(pages,rows);assert.equal(paginate(rows,{limit:6,offset:6}).meta.has_more,true);assert.equal(paginate(rows,{page:20,page_size:6}).meta.total,17);
 for(const query of [{page:0},{page:-1},{page:'1.2'},{page_size:0},{page_size:201},{limit:'bad'},{offset:-1},{page:1,offset:0},{page:'9007199254740992'},{page_size:''}])assert.throws(()=>paginate(rows,query),e=>e.status===400);
});
test('30 days: Beijing window boundaries and publication zeros are independent of absent performance data',()=>{
 const now=Date.parse('2026-10-17T16:00:00Z'),win=overviewWindow('30d',now);assert.equal(win.days,30);assert.equal(win.to,'2026-10-17');assert.equal(win.from,'2026-09-18');
 const account={id:base.account_id,platform:'zhihu',name:'好多鱼'},rows=[row('a',null),row('pending',null,{notes:'日期待核实'})];
 const out=buildOverview({accounts:[account],articles:rows,daily:[],observations:[],period:'30d',now});
 assert.equal(out.trend.length,30);assert.ok(out.trend.every(d=>Object.keys(d.accounts[0].metrics).length===0));
 assert.equal(out.publication_trend.reduce((sum,d)=>sum+d.accounts[0].count,0),1);assert.equal(out.publication_trend.find(d=>d.date==='2026-10-02').accounts[0].count,0);
});
