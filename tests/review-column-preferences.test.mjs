import test from 'node:test';
import assert from 'node:assert/strict';
import {articleListDate, articleWeekGroups, sortReviewArticles} from '../web/pages/review-article-list.mjs';

test('Beijing Monday starts a new week and date-only rows retain an unknown time', () => {
  const sunday = {id:'sun',published_at:'2026-11-15T15:59:59Z',verdict:'中',reads_24h:0};
  const monday = {id:'mon',published_at:'2026-11-15T16:00:00Z',verdict:'爆',reads_24h:120};
  const dateOnly = {id:'date',published_at:'2026-11-16',reads_24h:null};
  assert.equal(articleListDate(sunday.published_at),'11-15 周日 23:59');
  assert.equal(articleListDate(monday.published_at),'11-16 周一 00:00');
  assert.equal(articleListDate(dateOnly.published_at),'11-16 周一');
  const rows = sortReviewArticles([sunday,dateOnly,monday]);
  assert.deepEqual(rows.map(row => row.id),['mon','date','sun']);
  assert.deepEqual(articleWeekGroups(rows).map(({start,end,reads,counts}) => [start,end,reads,counts]),[
    ['2026-11-16','2026-11-22',120,[1,0,0]],['2026-11-09','2026-11-15',0,[0,1,0]],
  ]);
});

test('sorting uses numeric values from the displayed observation and keeps missing values last', () => {
  const rows = [{id:'zero'},{id:'missing'},{id:'measured'},{id:'invalid'}];
  const observations = new Map([
    ['zero',{snapshot:{reads:0,impressions:0,ctr:0,completion_rate:0,avg_read_seconds:0,fan_reads:0,fan_impressions:0}}],
    ['measured',{snapshot:{reads:100,impressions:2500,ctr:10,completion_rate:20,avg_read_seconds:135,fan_reads:320,fan_impressions:1800}}],
    ['invalid',{snapshot:{reads:-1,impressions:-1,ctr:101,completion_rate:110,avg_read_seconds:-5,fan_reads:-1,fan_impressions:-1}}],
  ]);
  for (const key of ['reads','impressions','ctr','completion_rate','avg_read_seconds','fan_reads','fan_impressions']) {
    for (const [direction,first] of [['descending','measured'],['ascending','zero']]) {
      const ids = sortReviewArticles(rows,observations,{key,direction}).map(row => row.id);
      assert.equal(ids[0],first);
      assert.deepEqual(new Set(ids.slice(2)),new Set(['missing','invalid']));
    }
  }
});
