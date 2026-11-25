import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewListObservation} from '../web/core/review-list-observation.mjs';
import {enrichArticles} from '../shared/review-analytics.mjs';
import {reviewOverviewMetrics} from '../web/core/review-overview-metrics.mjs';

const now = '2026-11-02T04:00:00Z';
const article = (id,published_at='2026-10-27T00:00:00Z',account='A') => ({id,account,published_at});
const snap = (id,article_id,age_hours,reads,extra={}) => ({id,article_id,age_hours,reads,...extra});

test('longtail is the first recorded reading after 72 hours, not the latest', () => {
  const row = article('a');
  const snapshots = [snap('later','a',140,888),snap('first','a',73,0),snap('old','a',90,321),snap('foreign','b',73,999)];
  assert.deepEqual(reviewListObservation(row,snapshots,now),{kind:'longtail',snapshot:snapshots[1],reads:0,hours:73});
  const noReading = [snap('missing','a',73,null),snap('first-read','a',80,17),snap('last','a',81,90)];
  assert.equal(reviewListObservation(row,noReading,now).snapshot.id,'first-read');
  assert.equal(reviewListObservation(row,[snap('missing','a',73,null)],now).reads,null);
});

test('12–72 samples and deterministic nearest 24 selection take precedence', () => {
  const data = {articles:[article('a')],snapshots:[snap('12','a',12,12),snap('72','a',72,72),snap('23','a',23,23),snap('25','a',25,25),snap('tail','a',73,73)]};
  const [row] = enrichArticles(data,{account:'A'});
  assert.equal(row.sample24h.id,'23');
  assert.equal(reviewListObservation(row,data.snapshots,now).reads,23);
  for (const age of [12,72]) {
    const one = {articles:[article('a')],snapshots:[snap(String(age),'a',age,0)]};
    assert.equal(reviewListObservation(enrichArticles(one,{account:'A'})[0],one.snapshots,now).kind,'sample');
  }
});

test('under 12 elapsed hours are distinguished without guessing date-only or future times', () => {
  assert.equal(reviewListObservation(article('a','2026-11-01T16:00:01Z'),[],now).kind,'immature');
  assert.equal(reviewListObservation(article('a','2026-11-01T16:00:00Z'),[],now).kind,'missing');
  assert.equal(reviewListObservation(article('a','2026-11-02'),[],now).kind,'missing');
  assert.equal(reviewListObservation(article('a','2026-11-02T04:00:01Z'),[],now).kind,'missing');
  assert.equal(reviewListObservation(article('a','2026-11-01T00:00:00+08:00'),[],now).kind,'missing');
});

test('an absent age requires real explicit publication and observation instants', () => {
  const row = article('a','2026-10-28T00:00:00Z');
  assert.equal(reviewListObservation(row,[snap('date','a',null,10,{snapshot_date:'2026-11-01'})],now).kind,'missing');
  const exact = snap('time','a',null,10,{observed_at:'2026-10-31T01:00:00Z'});
  assert.equal(reviewListObservation(row,[exact],now).hours,73);
  assert.equal(reviewListObservation(article('a','2026-10-28'),[exact],now).kind,'missing');
});

test('longtail readings do not enter cohort metrics, including a foreign account', () => {
  const data = {articles:[article('valid','2026-11-01T02:00:00Z'),article('tail','2026-11-01T01:00:00Z'),article('foreign','2026-11-01T01:00:00Z','B')],
    snapshots:[snap('v','valid',24,0),snap('t','tail',73,90000),snap('f','foreign',24,80000)]};
  const result = reviewOverviewMetrics(data,{account:'A',range:'last',now});
  assert.equal(result.count,2);
  assert.equal(result.readsMedian,0);
  assert.equal(result.samples.readsMedian.count,1);
  assert.equal(result.hits,0);
});
