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
  const html = renderContentReviewContent(data,{account:'A',now:'2026-11-02T12:00:00Z',filters:{range:'all'},secondary:'articles',article:'',loading:false,error:''});
  const row = id => html.match(new RegExp(`<tr data-review-row="${id}">([\\s\\S]*?)</tr>`))?.[1] || '';
  assert.match(row('a'),/href="https:\/\/example\.test\/reference"[^>]*>仿：Reference title（阅读 0）<\/a>/);
  assert.doesNotMatch(row('a'),/Fallback A/);
  assert.match(row('b'),/href="https:\/\/example\.test\/fallback-b"[^>]*>仿：Fallback B<\/a>/);
  assert.match(row('c'),/href="https:\/\/example\.test\/local"[^>]*>仿：Local fallback<\/a>/);
  assert.doesNotMatch(html,/FOREIGN REFERENCE|FOREIGN ARTICLE|example\.test\/foreign/);
  assert.match(row('d'),/仿：&lt;Unsafe&gt;/);
  assert.doesNotMatch(row('d'),/javascript:|<Unsafe>/);
  assert.match(row('e'),/仿：No reads<\/a>/);
  assert.doesNotMatch(row('e'),/阅读 0|阅读 —/);
  assert.doesNotMatch(row('f'),/review-reference/);
  assert.match(row('g'),/href="https:\/\/example\.test\/safe"[^>]*>仿：Safe fallback<\/a>/);
  assert.doesNotMatch(html,/UNKNOWN ACCOUNT REFERENCE|example\.test\/unknown/);
});
