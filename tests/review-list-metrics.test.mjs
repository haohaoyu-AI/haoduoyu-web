import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichArticles} from '../shared/review-analytics.mjs';
import {reviewListObservation} from '../web/core/review-list-observation.mjs';
import {REVIEW_LIST_METRICS, formatReviewListMetric} from '../web/core/review-list-metrics.mjs';

const now = '2026-11-02T04:00:00Z';
const item = {id:'a',account:'A',published_at:'2026-10-28T00:00:00Z'};
const values = observation => Object.fromEntries(REVIEW_LIST_METRICS.map(({key}) => [key,formatReviewListMetric(observation,key)]));

test('all selected fields use the same nearest eligible observation, with zero and missing values intact', () => {
  const snapshots = [
    {id:'nearest',article_id:'a',age_hours:23,reads:0,impressions:12000,fan_impressions:0,fan_reads:null,ctr:0,avg_read_seconds:65,completion_rate:14.71},
    {id:'later',article_id:'a',age_hours:40,reads:999,impressions:999,fan_impressions:999,fan_reads:999,ctr:99,avg_read_seconds:999,completion_rate:99},
    {id:'other',article_id:'b',age_hours:24,reads:1000,impressions:1000}
  ];
  const row = enrichArticles({articles:[item],snapshots},{account:'A'})[0];
  assert.deepEqual(values(reviewListObservation(row,snapshots,now)),{reads:'0',impressions:'1.2 万',fan_impressions:'0',fan_reads:'—',ctr:'0.0%',avg_read_seconds:'1分05秒',completion_rate:'14.7%'});
});

test('longtail columns come from the first reading snapshot rather than the latest', () => {
  const snapshots = [
    {id:'latest',article_id:'a',age_hours:100,reads:900,impressions:900,ctr:9,avg_read_seconds:90},
    {id:'first',article_id:'a',age_hours:73,reads:12,impressions:20,ctr:5,avg_read_seconds:61,fan_reads:0},
  ];
  const row = enrichArticles({articles:[item],snapshots},{account:'A'})[0];
  const observation = reviewListObservation(row,snapshots,now);
  assert.equal(observation.kind,'longtail');
  assert.deepEqual(values(observation),{reads:'12',impressions:'20',fan_impressions:'—',fan_reads:'0',ctr:'5.0%',avg_read_seconds:'1分01秒',completion_rate:'—'});
});

test('immature, absent, invalid and real-zero values remain distinct', () => {
  const immature = reviewListObservation({...item,published_at:'2026-11-02T03:00:00Z'},[],now);
  assert.equal(formatReviewListMetric(immature,'reads'),'未满24h');
  assert.equal(formatReviewListMetric(immature,'impressions'),'—');
  assert.equal(formatReviewListMetric({kind:'missing',snapshot:null},'reads'),'—');
  const invalid = {kind:'sample',snapshot:{reads:-1,ctr:101,completion_rate:-1,avg_read_seconds:-1,fan_reads:0}};
  assert.equal(formatReviewListMetric(invalid,'reads'),'—');
  assert.equal(formatReviewListMetric(invalid,'ctr'),'—');
  assert.equal(formatReviewListMetric(invalid,'completion_rate'),'—');
  assert.equal(formatReviewListMetric(invalid,'avg_read_seconds'),'—');
  assert.equal(formatReviewListMetric(invalid,'fan_reads'),'0');
  assert.equal(formatReviewListMetric(invalid,'unknown'),'—');
});
