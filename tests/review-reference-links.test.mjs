import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

test('article references prefer scoped benchmark records and safely fall back to the article sample', () => {
  const articles = [
    {id:'a',account:'A',title:'Article A',published_at:'2026-11-02',reference_article_id:'ref',sample_title:'Fallback A',sample_url:'https://example.test/fallback-a'},
    {id:'b',account:'A',title:'Article B',published_at:'2026-11-02',sample_title:'Fallback B',sample_url:'https://example.test/fallback-b'},
    {id:'c',account:'A',title:'Article C',published_at:'2026-11-02',reference_article_id:'foreign',sample_title:'Local fallback',sample_url:'https://example.test/local'},
    {id:'d',account:'A',title:'Article D',published_at:'2026-11-02',sample_title:'<Unsafe>',sample_url:'javascript:alert(1)'},
    {id:'e',account:'A',title:'Article E',published_at:'2026-11-02',reference_article_id:'no-reads'},
    {id:'f',account:'A',title:'Article F',published_at:'2026-11-02'},
    {id:'g',account:'A',title:'Article G',published_at:'2026-11-02',reference_article_id:'missing-account',sample_title:'Safe fallback',sample_url:'https://example.test/safe'},
    {id:'foreign-article',account:'B',title:'FOREIGN ARTICLE',published_at:'2026-11-02'}
  ];
  const benchmarkArticles = [
    {id:'ref',account:'A',benchmark_account_id:'account-a',title:'Reference title',url:'https://example.test/reference',reads:0},
    {id:'foreign',account:'B',benchmark_account_id:'account-b',title:'FOREIGN REFERENCE',url:'https://example.test/foreign',reads:999},
    {id:'no-reads',account:'A',benchmark_account_id:'account-a',title:'No reads',url:'https://example.test/no-reads',reads:null},
    {id:'missing-account',benchmark_account_id:'account-a',title:'UNKNOWN ACCOUNT REFERENCE',url:'https://example.test/unknown',reads:100}
  ];
  const benchmarkAccounts = [{id:'account-a',account:'A',name:'Account A'},{id:'account-b',account:'B',name:'Account B'}];
  const data = normalizeReviewData({articles,benchmarkAccounts,benchmarkArticles});
  const vm = {account:'A',now:'2026-11-02T12:00:00Z',filters:{range:'all'},secondary:'articles'};
  const html = renderContentReviewContent(data,vm);
  const drawer = article => renderContentReviewContent(data,{...vm,article}).split('class="review-drawer-overlay"')[1];
  assert.doesNotMatch(html,/Reference title|Fallback B|FOREIGN ARTICLE/);
  assert.match(drawer('a'),/data-review-benchmark="ref">Reference title<\/a>/);
  assert.doesNotMatch(drawer('a'),/Fallback A/);
  assert.match(drawer('b'),/href="https:\/\/example\.test\/fallback-b"[^>]*>Fallback B<\/a>/);
  assert.match(drawer('c'),/href="https:\/\/example\.test\/local"[^>]*>Local fallback<\/a>/);
  assert.doesNotMatch(drawer('c'),/FOREIGN REFERENCE|example\.test\/foreign/);
  assert.match(drawer('d'),/&lt;Unsafe&gt;/);
  assert.doesNotMatch(drawer('d'),/javascript:|<Unsafe>/);
  assert.match(drawer('e'),/data-review-benchmark="no-reads">No reads<\/a>/);
  assert.match(drawer('f'),/自选题/);
  assert.match(drawer('g'),/href="https:\/\/example\.test\/safe"[^>]*>Safe fallback<\/a>/);
  assert.doesNotMatch(drawer('g'),/UNKNOWN ACCOUNT REFERENCE|example\.test\/unknown/);
});
