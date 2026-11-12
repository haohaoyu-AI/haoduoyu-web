import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent, REVIEW_SECTIONS} from '../web/pages/content-review.mjs';
import {readContentReviewData, reviewRoute} from '../web/review-controller.mjs';

const account = 'V字';
const other = '其他账号';
const model = (overrides = {}) => ({account, view:'overview', secondary:'accounts', week:'this',
  now:'2026-10-30T12:00:00Z', filters:{range:'all'}, article:'', version:'', loading:false, error:'', ...overrides});
const render = (input, overrides) => renderContentReviewContent(normalizeReviewData(input), model(overrides));

test('other account health alone does not defeat the current-account empty state or badge', () => {
  const html = render({accountHealth:[{id:'other-health',account:other,judgement:'限流',
    observed_on:'2026-10-30',platform_notice:'OTHER_HEALTH_NOTICE'}]}, {secondary:'attention'});
  assert.match(html, /暂无内容复盘数据/);
  assert.doesNotMatch(html, /OTHER_HEALTH_NOTICE|>限流<|其他账号/);
});

test('collection read filters other accounts but still detects an unknown snapshot', async () => {
  const records = {
    articles:[{id:'own',account},{id:'foreign',account:other}],
    snapshots:[{id:'s-own',article_id:'own'},{id:'s-foreign',article_id:'foreign'}],
    notes:[{id:'n-own',account},{id:'n-foreign',account:other}]
  };
  const read = async path => {
    const resource = /^\/review\/([^?]+)/.exec(path)[1];
    return {items:records[resource] || [],has_more:false,read_revision:7};
  };
  const result = await readContentReviewData(read,account);
  assert.deepEqual(result.articles.map(row => row.id),['own']);
  assert.deepEqual(result.snapshots.map(row => row.id),['s-own']);
  assert.deepEqual(result.notes.map(row => row.id),['n-own']);
  records.snapshots.push({id:'s-orphan',article_id:'unknown'});
  await assert.rejects(() => readContentReviewData(read,account),{code:'READ_REVISION_CHANGED'});
});

test('each supported section and article detail excludes other-account resources', () => {
  const input={
    articles:[{id:'own',account,title:'OWN_ARTICLE',published_at:'2026-10-29'}, {id:'foreign',account:other,title:'OTHER_ARTICLE',published_at:'2026-10-29'}],
    snapshots:[{id:'s-own',article_id:'own',snapshot_date:'2026-10-30',reads:800},{id:'s-other',article_id:'foreign',snapshot_date:'2026-10-30',reads:999999}],
    benchmarkAccounts:[{id:'own-account',account,name:'OWN_BENCHMARK'},{id:'other-account',account:other,name:'OTHER_BENCHMARK'}],
    benchmarkArticles:[{id:'own-ref',account,benchmark_account_id:'own-account',title:'OWN_REFERENCE'},
      {id:'other-ref',account:other,benchmark_account_id:'other-account',title:'OTHER_REFERENCE'},
      {id:'orphan',account,benchmark_account_id:'missing',title:'OTHER_ORPHAN'}],
    notes:[{id:'n',account:other,title:'OTHER_NOTE'}],reports:[{id:'r',account:other,summary_md:'OTHER_REPORT'}],
    playbooks:[{id:'own-book',account,status:'active',version:1,content_md:'OWN_PLAYBOOK',rules:[]},
      {id:'other-book',account:other,status:'active',version:2,content_md:'OTHER_PLAYBOOK',rules:[]}]
  };
  assert.deepEqual(REVIEW_SECTIONS.map(([id])=>id),['cockpit','weekly','articles','benchmarks','rules','prompts','library']);
  for(const [secondary] of REVIEW_SECTIONS) for(const article of ['', 'own', 'foreign']) {
    const html=render(input,{secondary,article});
    if (secondary === 'articles' || article === 'own') assert.match(html,/OWN_ARTICLE/);
    assert.doesNotMatch(html,/OTHER_|999999|其他账号/, `account leak in ${secondary}/${article}`);
  }
  assert.match(render(input,{secondary:'benchmarks'}),/OWN_BENCHMARK/);
  assert.match(render(input,{secondary:'rules'}),/OWN_PLAYBOOK/);
  assert.match(render(input,{secondary:'review'}),/OWN_PLAYBOOK/);
});

test('notes and historical daily report fields are not exposed', () => {
  const html=render({notes:[{id:'old',account,title:'OLD_NOTE',body_md:'OLD_BODY'},{id:'new',account,title:'NEW_NOTE',body_md:'NEW_BODY'}],
    reports:[{id:'daily',account,period_type:'daily',period_end:'2026-10-30',summary_md:'DAILY_SUMMARY',
      metrics:{reads:42,notes_md:'SECRET_NOTES',benchmark_accounts:'SECRET_BENCHMARK',account_health:'SECRET_HEALTH',nested:{text:'SECRET_NESTED'}}}]},
    {secondary:'notes'});
  assert.doesNotMatch(html,/OLD_NOTE|OLD_BODY|NEW_NOTE|NEW_BODY|DAILY_SUMMARY|SECRET_NOTES|SECRET_BENCHMARK|SECRET_HEALTH|SECRET_NESTED/);
});

test('hidden note kinds cannot expose their text or unsafe markup', () => {
  const kinds=['insight','decision','diagnosis','account_health'];
  const html=render({notes:kinds.map((kind,index)=>({id:String(index),account,kind,title:`SECRET_NOTE_${index}`,
    note_date:'2026-10-30',body_md:'<script>BAD</script>'}))},{secondary:'notes'});
  assert.doesNotMatch(html,/SECRET_NOTE_|<script>|&lt;script&gt;|review-kind/);
});

test('article rows contain four columns and isolate references and details', () => {
  const input={
    articles:[{id:'a',account,title:'ARTICLE_A',published_at:'2026-10-29',reference_article_id:'ref',applied_rule_ids:['r1']},
      {id:'b',account,title:'ARTICLE_B',published_at:'2026-10-28'}],
    benchmarkAccounts:[{id:'source',account,name:'BENCHMARK_SOURCE'}],
    benchmarkArticles:[{id:'ref',account,benchmark_account_id:'source',title:'REFERENCE_TITLE',reads:8123,url:'https://example.com/reference'}],
    reports:[{id:'other-r',account:other,summary_md:'OTHER_REASON'}],
    playbooks:[{id:'p',account,status:'active',version:1,rules:[{rule_id:'r1',section:'title',text:'RULE_ONLY_IN_MANUAL'}]}]
  };
  const html=render(input,{secondary:'articles'}), row=html.match(/<tr data-review-row="a">([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(row); assert.equal((row.match(/<td\b/g)||[]).length,4);
  assert.match(row,/REFERENCE_TITLE/); assert.match(row,/href="https:\/\/example\.com\/reference"/);
  assert.doesNotMatch(row,/OTHER_REASON|RULE_ONLY_IN_MANUAL/);
  const otherRow=html.match(/<tr data-review-row="b">([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(otherRow); assert.doesNotMatch(otherRow,/review-reference/);
  const detail=render(input,{article:'a'});
  assert.match(detail,/role="dialog" aria-modal="true"/);
  assert.doesNotMatch(detail,/OTHER_REASON|RULE_ONLY_IN_MANUAL/);
});

test('review deep link retains the requested account', () => {
  const route = reviewRoute('https://haoduoyu.xyz/?page=review&account=V%E5%AD%97');
  assert.equal(route.account,account);
});
