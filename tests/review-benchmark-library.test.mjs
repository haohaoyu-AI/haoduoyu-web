import test from 'node:test';
import assert from 'node:assert/strict';
import {renderBenchmarkLibrary} from '../web/pages/review-benchmark-library.mjs';

const own = (id, reference, extra = {}) => ({id, account:'A', title:'我方' + id, url:'https://example.com/' + id, reference_article_id:reference, ...extra});

test('imitated library keeps Shanghai order, real links and only copied rows', () => {
  const data = {
    benchmarkAccounts:[{id:'ba',account:'A',name:'甲账号'},{id:'foreign',account:'B',name:'OTHER_ACCOUNT'}],
    benchmarkArticles:[
      {id:'older',account:'A',benchmark_account_id:'ba',title:'较早',url:'https://example.com/old',published_at:'2026-10-30T16:30:00Z',reads:0,image_count:0,collected_on:'2026-11-01'},
      {id:'newer',account:'A',benchmark_account_id:'ba',title:'较新',url:'https://example.com/new',published_at:'2026-10-31T17:00:00Z',reads:100,image_count:3},
      {id:'dateonly',account:'A',benchmark_account_id:'ba',title:'仅日期',published_at:'2026-11-01',reads:12},
      {id:'missing',account:'A',benchmark_account_id:'ba',title:'未知时间',url:'javascript:alert(1)'},
      {id:'unused',account:'A',benchmark_account_id:'ba',title:'UNUSED_SAMPLE',published_at:'2026-11-20T00:00:00Z',reads:9},
      {id:'foreign-ref',account:'B',benchmark_account_id:'foreign',title:'OTHER_REFERENCE',published_at:'2026-11-20T00:00:00Z'},
      {id:'cross',account:'A',benchmark_account_id:'foreign',title:'CROSS_ACCOUNT'}
    ],
    snapshots:[{article_id:'own-older',snapshot_date:'2026-11-02',reads:20,likes:3}],
    articles:[own('own-older','older'), own('own-older-2','older',{title:'我方二',url:''}),
      own('own-newer','newer'), own('own-date','dateonly'), own('own-missing','missing'),
      {id:'foreign-own',account:'B',title:'OTHER_OWN',reference_article_id:'older'}]
  };
  const html=renderBenchmarkLibrary(data,'A');
  const row=id=>html.match(new RegExp(`<tr id="review-benchmark-${id}"[^>]*>([\\s\\S]*?)</tr>`))?.[1] || '';
  assert.deepEqual([...html.matchAll(/<tr id="review-benchmark-([^"]+)/g)].map(m=>m[1]),['newer','dateonly','older','missing']);
  assert.doesNotMatch(html,/UNUSED_SAMPLE|配图数|发布时间|收录日期/);
  assert.match(row('newer'),/data-label="样本阅读">100/);
  assert.match(row('newer'),/data-label="对标账号">甲账号/);
  assert.match(row('older'),/data-label="样本阅读">0<\/td>/);
  assert.match(row('older'),/href="https:\/\/example\.com\/own-older"[^>]*>我方own-older/);
  assert.match(html,/review_article=own-older-2[^"]*">我方二/);
  assert.match(row('older'),/data-label="仿写数据">阅读 20 · 点赞 3/);
  assert.match(row('missing'),/data-label="样本阅读">—/);
  assert.match(row('missing'),/data-label="仿写账号">A/);
  assert.doesNotMatch(html,/OTHER_ACCOUNT|OTHER_REFERENCE|CROSS_ACCOUNT|OTHER_OWN|href="javascript:/);
});

test('benchmark anchors are stable and escaped, and an unused library stays empty', () => {
  const html=renderBenchmarkLibrary({benchmarkAccounts:[{id:'a',account:'A',name:'<name>'}],
    benchmarkArticles:[{id:'x / ?',account:'A',benchmark_account_id:'a',title:'<title>',url:'https://example.com'}],
    articles:[{id:'mine',account:'A',title:'仿写',reference_article_id:'x / ?'}]},'A');
  assert.match(html,/id="review-benchmark-x%20%2F%20%3F" tabindex="-1"/);
  assert.match(html,/&lt;name&gt;/); assert.match(html,/&lt;title&gt;/);
  assert.match(renderBenchmarkLibrary({benchmarkArticles:[{id:'kept',account:'A',title:'隐藏'}]},'A'),/暂无已仿写爆文/);
});

test('same-minute timestamp ordering uses the real instant and date-only sorts after timed records', () => {
  const accounts=[{id:'a',account:'A',name:'甲'}];
  const records=[{id:'a-old',account:'A',benchmark_account_id:'a',published_at:'2026-11-01T00:00:01Z'},
    {id:'z-new',account:'A',benchmark_account_id:'a',published_at:'2026-11-01T08:00:59+08:00'},
    {id:'date',account:'A',benchmark_account_id:'a',published_at:'2026-11-01'}];
  const articles=records.map(row => ({id:'own-'+row.id,account:'A',title:row.id,reference_article_id:row.id}));
  const html=renderBenchmarkLibrary({benchmarkAccounts:accounts,benchmarkArticles:records,articles},'A');
  assert.deepEqual([...html.matchAll(/<tr id="review-benchmark-([^"]+)/g)].map(m=>m[1]),['z-new','a-old','date']);
});
