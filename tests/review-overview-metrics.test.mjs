import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOverviewMetrics, reviewDuration} from '../web/core/review-overview-metrics.mjs';

const now = '2026-11-02T04:00:00Z'; // Monday 12:00 in Shanghai
const article = (id,published_at,account='A') => ({id,published_at,account});
const snap = (id,article_id,age_hours,values={}) => ({id,article_id,age_hours,...values});
const data = {
  articles:[article('edge','2026-11-01T04:00:00Z'),article('inside','2026-11-02T03:00:00Z'),
    article('before','2026-11-01T03:59:59Z'),article('future','2026-11-02T04:00:01Z'),
    article('date','2026-11-02'),article('lastStart','2026-10-26T00:00:00+08:00'),
    article('previous','2026-10-25T23:59:59+08:00'),article('foreign','2026-11-02T03:00:00Z','B')],
  snapshots:[snap('a','edge',24,{reads:0,ctr:0,avg_read_seconds:0,completion_rate:0}),
    snap('b','inside',24,{reads:1000,ctr:10,avg_read_seconds:90,completion_rate:60}),
    snap('c','before',23,{reads:9999,ctr:99,avg_read_seconds:999,completion_rate:99}),
    snap('d','foreign',24,{reads:9999,ctr:99,avg_read_seconds:999,completion_rate:99})]
};
test('rolling publication window uses explicit instants and recorded samples, scoped by account', () => {
  const value = reviewOverviewMetrics(data,{account:'A',range:'24h',now});
  assert.deepEqual(value,{count:2,observedCount:2,hits:1,middle:0,flops:1,readsMedian:500,ctrMedian:5,avgReadSeconds:45,completion:30,
    samples:Object.fromEntries(['judged','readsMedian','ctrMedian','avgReadSeconds','completion'].map(key => [key,{count:2,minHours:24,maxHours:24}]))});
});
test('Shanghai Monday and complete prior week include date-only records but exclude future instants', () => {
  assert.equal(reviewOverviewMetrics(data,{account:'A',range:'this',now}).count,2);
  const last = reviewOverviewMetrics(data,{account:'A',range:'last',now});
  assert.equal(last.count,3);
  assert.equal(last.readsMedian,4999.5);
  assert.equal(last.avgReadSeconds,499.5);
  assert.deepEqual(last.samples.readsMedian,{count:2,minHours:23,maxHours:24});
});
test('missing values remain missing; zero is retained and durations format correctly', () => {
  const value = reviewOverviewMetrics({articles:[article('x','2026-11-02T03:00:00Z')],snapshots:[snap('x','x',10,{reads:10})]}, {account:'A',range:'24h',now});
  assert.equal(value.hits,null);
  assert.equal(value.middle,null);
  assert.equal(value.flops,null);
  assert.equal(value.readsMedian,null);
  assert.equal(value.avgReadSeconds,null);
  assert.equal(value.completion,null);
  assert.deepEqual(value.samples.readsMedian,{count:0,minHours:null,maxHours:null});
  assert.deepEqual(value.samples.judged,{count:0,minHours:null,maxHours:null});
  assert.equal(reviewDuration(null),'—');
  assert.equal(reviewDuration(0),'0分00秒');
  assert.equal(reviewDuration(90),'1分30秒');
});

test('nearest eligible recorded ages are retained with per-metric sample coverage and range', () => {
  const ids = ['a','b','c','d','e','short','long','foreign'];
  const rows = ids.map(id => article(id,'2026-11-01T03:00:00Z',id === 'foreign' ? 'B' : 'A'));
  const observations = [
    snap('a12','a',12,{reads:0,ctr:0,avg_read_seconds:0,completion_rate:0}),
    snap('b23','b',23,{reads:10,ctr:10,avg_read_seconds:90}),
    snap('c25','c',25,{reads:20,completion_rate:50}),
    snap('d36','d',36,{reads:30,ctr:30,avg_read_seconds:120,completion_rate:100}),
    snap('e72','e',72,{reads:40,ctr:101,avg_read_seconds:-1,completion_rate:101}),
    snap('short','short',2,{reads:999}),snap('long','long',73,{reads:999}),
    snap('foreign','foreign',24,{reads:999,ctr:99,avg_read_seconds:999,completion_rate:99}),
    snap('b36','b',36,{reads:999,ctr:99})
  ];
  const value = reviewOverviewMetrics({articles:rows,snapshots:observations},{account:'A',range:'last',now});
  assert.equal(value.count,7);
  assert.equal(value.readsMedian,20);
  assert.equal(value.ctrMedian,10);
  assert.equal(value.avgReadSeconds,70);
  assert.equal(value.completion,50);
  assert.deepEqual(value.samples.readsMedian,{count:5,minHours:12,maxHours:72});
  assert.deepEqual(value.samples.judged,{count:5,minHours:12,maxHours:72});
  assert.deepEqual(value.samples.ctrMedian,{count:3,minHours:12,maxHours:36});
  assert.deepEqual(value.samples.avgReadSeconds,{count:3,minHours:12,maxHours:36});
  assert.deepEqual(value.samples.completion,{count:3,minHours:12,maxHours:36});
});
