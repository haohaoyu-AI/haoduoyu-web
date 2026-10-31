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

test('each secondary tab and article view excludes every other-account resource', () => {
  const input = {
    articles:[{id:'own-article',account,title:'OWN_ARTICLE',published_at:'2026-10-29'},
      {id:'other-article',account:other,title:'OTHER_ARTICLE',published_at:'2026-10-29'}],
    snapshots:[{id:'own-snapshot',article_id:'own-article',snapshot_date:'2026-10-30',age_hours:24,reads:800,ctr:3},
      {id:'other-snapshot',article_id:'other-article',snapshot_date:'2026-10-30',age_hours:24,reads:999999,ctr:99}],
    benchmarkAccounts:[{id:'own-account',account,name:'OWN_BENCHMARK_ACCOUNT'},
      {id:'other-account',account:other,name:'OTHER_BENCHMARK_ACCOUNT'}],
    benchmarkArticles:[{id:'own-reference',benchmark_account_id:'own-account',title:'OWN_REFERENCE'},
      {id:'other-reference',account,benchmark_account_id:'other-account',title:'OTHER_REFERENCE'},
      {id:'orphan',account,benchmark_account_id:'missing-account',title:'OTHER_ORPHAN'}],
    notes:[{id:'own-note',account,title:'OWN_NOTE',note_date:'2026-10-30',body_md:'own note'},
      {id:'other-note',account:other,title:'OTHER_NOTE',note_date:'2026-10-31',body_md:'OTHER_NOTE_BODY'}],
    accountHealth:[{id:'own-health',account,observed_on:'2026-10-29',judgement:'normal',action:'OWN_HEALTH_ACTION'},
      {id:'other-health',account:other,observed_on:'2026-10-30',judgement:'限流',action:'OTHER_HEALTH_ACTION'}],
    reports:[{id:'own-report',account,period_type:'daily',period_end:'2026-10-29',summary_md:'OWN_REPORT',metrics:{reads:42}},
      {id:'other-report',account:other,period_type:'daily',period_end:'2026-10-30',summary_md:'OTHER_REPORT',metrics:{reads:999999}}],
    playbooks:[{id:'own-book',account,version:1,published_on:'2026-10-29',content_md:'OWN_PLAYBOOK',rules:[]},
      {id:'other-book',account:other,version:2,published_on:'2026-10-30',content_md:'OTHER_PLAYBOOK',rules:[]}]
  };
  assert.deepEqual(REVIEW_SECTIONS.map(([id]) => id),['accounts','benchmarks','notes','playbook','trend','attention']);
  const expected = {accounts:'OWN_BENCHMARK_ACCOUNT',benchmarks:'OWN_REFERENCE',notes:'OWN_NOTE',
    playbook:'OWN_PLAYBOOK',attention:'OWN_HEALTH_ACTION'};
  for (const [secondary] of REVIEW_SECTIONS) {
    const html = render(input,{secondary});
    assert.match(html, /OWN_ARTICLE/);
    assert.doesNotMatch(html, /OTHER_|其他账号|>限流</, `account leak in ${secondary}`);
    if (expected[secondary]) assert.ok(html.includes(expected[secondary]), `missing current-account content in ${secondary}`);
  }
});

test('notes are newest first and historical daily report contains only its summary and numeric metrics', () => {
  const html = render({notes:[
    {id:'old',account,title:'OLD_NOTE',note_date:'2026-10-01',kind:'insight',body_md:'old body'},
    {id:'new',account,title:'NEW_NOTE',note_date:'2026-10-30',kind:'action',body_md:'first line\nsecond line\nthird line'}
  ],reports:[{id:'daily',account,period_type:'daily',period_end:'2026-10-30',summary_md:'DAILY_SUMMARY',
    metrics:{reads:42,notes_md:'123',benchmark_accounts:'SECRET_BENCHMARK',account_health:'SECRET_HEALTH',
      nested:{text:'SECRET_NESTED'}}}]},
  {secondary:'notes'});
  assert.ok(html.indexOf('NEW_NOTE') < html.indexOf('OLD_NOTE'));
  assert.match(html, /<details class="review-note-card"/);
  assert.match(html, /class="review-note-preview"/);
  assert.match(html, /DAILY_SUMMARY/);
  assert.match(html, />42<\/dd>/);
  assert.doesNotMatch(html, /notes_md|benchmark_accounts|account_health|SECRET_BENCHMARK|SECRET_HEALTH|SECRET_NESTED|>123<\/dd>/);
});

test('each supported note kind has a distinct visible color', async () => {
  const kinds = ['insight','decision','diagnosis','account_health'];
  const html = render({notes:kinds.map((kind,index) => ({id:String(index),account,kind,
    title:`note-${index}`,note_date:'2026-10-30',body_md:'内容'}))},{secondary:'notes'});
  const tones = kinds.map(kind => {
    const match = html.match(new RegExp(`class="review-kind review-kind-(\\d+)">${kind}</span>`));
    assert.ok(match, `missing visual tag for ${kind}`);
    return match[1];
  });
  assert.equal(new Set(tones).size,4);
  const css = await readFile(new URL('../public/review.css',import.meta.url),'utf8');
  const colors = tones.map(tone => {
    const match = css.match(new RegExp(`\\.review-kind-${tone}\\s*\\{[^}]*?color:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `missing color for tone ${tone}`);
    return match[1].toLowerCase();
  });
  assert.equal(new Set(colors).size,4);
});

test('article rows contain five columns, a bounded reason, a reference only when available, and full detail', () => {
  const reason = '这是一段非常长的文章判断原因需要展示第一句并且超过四十个中文字以便确认截断之后仍然能够通过详情阅读全部内容。第二句只在详情查看。';
  const input = {
    articles:[{id:'a',account,title:'ARTICLE_A',published_at:'2026-10-29',reference_article_id:'ref',applied_rule_ids:['r1'],playbook_version_used:1},
      {id:'b',account,title:'ARTICLE_B',published_at:'2026-10-28'}],
    benchmarkAccounts:[{id:'source',account,name:'BENCHMARK_SOURCE'}],
    benchmarkArticles:[{id:'ref',benchmark_account_id:'source',title:'REFERENCE_TITLE',reads:8123,url:'https://example.com/reference'}],
    reports:[{id:'other-r',account:other,period_type:'daily',period_end:'2026-10-30',verdicts:{a:{verdict:'扑',reason:'OTHER_REASON'}}},
      {id:'r',account,period_type:'daily',period_end:'2026-10-30',verdicts:{a:{verdict:'中',reason}}}],
    playbooks:[{id:'p',account,version:1,published_on:'2026-10-28',rules:[{rule_id:'r1',section:'title',text:'RULE_ONLY_IN_DETAIL',status:'kept'}]}]
  };
  const html = render(input), row = html.match(/<tr data-review-row="a">([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(row, 'expected article row');
  assert.equal((row.match(/<td\b/g) || []).length,5);
  assert.match(row, /REFERENCE_TITLE/);
  assert.match(row, /href="https:\/\/example\.com\/reference"/);
  const preview = row.match(/class="review-reason-preview"[^>]*>([^<]*)<\/[^>]+>/)?.[1];
  assert.ok(preview, 'expected visible reason preview');
  assert.ok(Array.from(preview).length <= 41, 'at most 40 characters plus ellipsis');
  assert.doesNotMatch(row, /第二句|RULE_ONLY_IN_DETAIL|OTHER_REASON/);
  const otherRow = html.match(/<tr data-review-row="b">([\s\S]*?)<\/tr>/)?.[1];
  assert.ok(otherRow);
  assert.doesNotMatch(otherRow, /review-reference|无样本/);
  assert.match(otherRow, /review-sample-icon/);
  assert.match(otherRow, /title="[^"]*24h/);
  const detail = render(input,{article:'a'});
  assert.ok(detail.includes(reason));
  assert.match(detail, /RULE_ONLY_IN_DETAIL/);
});

test('review deep link retains the requested account', () => {
  const route = reviewRoute('https://haoduoyu.xyz/?page=review&account=V%E5%AD%97');
  assert.equal(route.account,account);
});
