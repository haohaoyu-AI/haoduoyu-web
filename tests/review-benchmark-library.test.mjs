import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBenchmarkLibrary} from '../web/pages/review-benchmark-library.mjs';

test('benchmark library sorts Shanghai publication times and preserves real links and missing values', () => {
  const data = {
    benchmarkAccounts:[{id:'ba',account:'A',name:'甲账号'},{id:'foreign',account:'B',name:'OTHER_ACCOUNT'}],
    benchmarkArticles:[
      {id:'older',account:'A',benchmark_account_id:'ba',title:'较早',url:'https://example.com/old',published_at:'2026-10-30T16:30:00Z',reads:0,image_count:0,collected_on:'2026-11-01'},
      {id:'newer',account:'A',benchmark_account_id:'ba',title:'较新',url:'https://example.com/new',published_at:'2026-10-31T17:00:00Z',reads:100,image_count:3},
      {id:'dateonly',account:'A',benchmark_account_id:'ba',title:'仅日期',published_at:'2026-11-01'},
      {id:'missing',account:'A',benchmark_account_id:'ba',title:'未知时间',url:'javascript:alert(1)'},
      {id:'foreign-ref',account:'B',benchmark_account_id:'foreign',title:'OTHER_REFERENCE',published_at:'2026-11-20T00:00:00Z'},
      {id:'cross',account:'A',benchmark_account_id:'foreign',title:'CROSS_ACCOUNT'}
    ],
    articles:[{id:'own1',account:'A',title:'我方一',url:'https://example.com/own',reference_article_id:'older'},
      {id:'own2',account:'A',title:'我方二',reference_article_id:'older'},
      {id:'foreign-own',account:'B',title:'OTHER_OWN',reference_article_id:'older'}]
  };
  const html=renderBenchmarkLibrary(data,'A');
  const row=id=>html.match(new RegExp(`<tr id="review-benchmark-${id}"[^>]*>([\\s\\S]*?)</tr>`))?.[1] || '';
  assert.deepEqual([...html.matchAll(/<tr id="review-benchmark-([^"]+)/g)].map(m=>m[1]),['newer','dateonly','older','missing']);
  assert.match(row('newer'),/2026-11-01 01:00/);
  assert.match(row('older'),/2026-10-31 00:30/);
  assert.match(row('older'),/data-label="阅读">0<\/td>/);
  assert.match(row('older'),/data-label="配图数">0<\/td>/);
  assert.match(row('older'),/2026-11-01/);
  assert.match(row('older'),/href="https:\/\/example\.com\/own"[^>]*>我方一/);
  assert.match(row('older'),/review_article=own2[^\"]*">我方二/);
  assert.match(row('missing'),/data-label="发布时间">未知/);
  assert.match(row('missing'),/data-label="阅读">—/);
  assert.match(row('missing'),/data-label="配图数">—/);
  assert.doesNotMatch(html,/OTHER_ACCOUNT|OTHER_REFERENCE|CROSS_ACCOUNT|OTHER_OWN|href="javascript:/);
});

test('benchmark anchors are stable and escaped, and empty library stays empty', () => {
  const html=renderBenchmarkLibrary({benchmarkAccounts:[{id:'a',account:'A',name:'<name>'}],
    benchmarkArticles:[{id:'x / ?',account:'A',benchmark_account_id:'a',title:'<title>',url:'https://example.com'}]},'A');
  assert.match(html,/id="review-benchmark-x%20%2F%20%3F" tabindex="-1"/);
  assert.match(html,/&lt;name&gt;/); assert.match(html,/&lt;title&gt;/);
  assert.match(renderBenchmarkLibrary({},'A'),/暂无爆文/);
});

test('same-minute timestamp ordering uses the real instant and date-only sorts after timed records', () => {
  const accounts=[{id:'a',account:'A',name:'甲'}];
  const records=[{id:'a-old',account:'A',benchmark_account_id:'a',published_at:'2026-11-01T00:00:01Z'},
    {id:'z-new',account:'A',benchmark_account_id:'a',published_at:'2026-11-01T08:00:59+08:00'},
    {id:'date',account:'A',benchmark_account_id:'a',published_at:'2026-11-01'}];
  const html=renderBenchmarkLibrary({benchmarkAccounts:accounts,benchmarkArticles:records},'A');
  assert.deepEqual([...html.matchAll(/<tr id="review-benchmark-([^"]+)/g)].map(m=>m[1]),['z-new','a-old','date']);
});
