import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {ARTICLE_DIAGNOSIS_PROMPT,articleDiagnosisFacts} from '../shared/article-diagnosis.mjs';
import {normalizeReviewData} from '../web/core/review-data.mjs';
import {renderContentReviewContent} from '../web/pages/content-review.mjs';

const promptLines = ARTICLE_DIAGNOSIS_PROMPT.split('\n');
function fixture(t) {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON'); t.after(() => sql.close());
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for (const {tag} of journal.entries) for (const statement of readFileSync(new URL('../drizzle/' + tag + '.sql',import.meta.url),'utf8')
    .split('--> statement-breakpoint').map(value => value.trim()).filter(Boolean)) sql.exec(statement);
  const db = {prepare(text){ let values = []; return {bind(...args){ values = args; return this; },
    async first(){ return sql.prepare(text).get(...values) || null; },
    async all(){ return {results:sql.prepare(text).all(...values)}; },
    async run(){ const result = sql.prepare(text).run(...values); return {meta:{changes:Number(result.changes)}}; }}; }};
  const owner = randomUUID(), origin = 'http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const env = {DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1',SITE_ORIGIN:origin};
  const headers = {Origin:origin,'X-Public-Business':'1'};
  async function call(path, method = 'GET', data, settings = env) {
    const h = new Headers(headers); if (data !== undefined) h.set('Content-Type','application/json');
    const request = new Request(origin + '/api/v1/review/' + path,{method,headers:h,body:data === undefined ? undefined : JSON.stringify(data)});
    try {
      const response = await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),settings,origin);
      return {status:response.status,...await response.json()};
    } catch (error) { if (!error.status) throw error; return {status:error.status,error:{code:error.code,message:error.message}}; }
  }
  return {sql,owner,env,call};
}
function article(sql, owner, id, title, published) {
  const now = new Date().toISOString();
  sql.prepare('INSERT INTO matrix_review_articles(user_id,id,account,platform,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(owner,id,'V字','toutiao',title,published,now,now);
}
test('the diagnosis prompt is the requested draft, verbatim', () => {
  assert.deepEqual(promptLines, [
    '你是头条图文数据复盘助手。只根据我给你的这一篇数据，和同账号最近30篇的平均值做对比，写且只写三句话，不要标题、不要列表、不要开头客套。',
    '第一句：这篇好在哪，必须点出明显高于均值的指标，并带上这篇的数字和均值。',
    '第二句：这篇差在哪，必须点出明显低于均值的指标，并带上这篇的数字和均值。如果没有明显短板，就写最接近均值、提升空间最大的一项。',
    '第三句：下一篇同类稿的标题或开头怎么改，只给一个具体改法，不要空话。',
    '只谈标题、展现、阅读、点击率、完读率，不要编造未提供的数据，不要评价正文内容。',
  ]);
});
test('facts use this article and the average of the latest 30 peers', () => {
  const peers = Array.from({length:31}, (_,index) => ({id:'p' + index, account:'V字', title:'p' + index,
    published_at:new Date(Date.UTC(2026,0,index + 1)).toISOString()}));
  const articles = [{id:'self', account:'V字', title:'这一篇', published_at:'2026-02-01T01:00:00Z'}, ...peers,
    {id:'other', account:'鱼见', title:'别的账号', published_at:'2026-02-02T01:00:00Z'}];
  const snapshots = [{article_id:'self', snapshot_date:'2026-02-01', impressions:100, reads:40, ctr:8, completion_rate:50},
    {article_id:'other', snapshot_date:'2026-02-02', impressions:9999, reads:9999, ctr:99, completion_rate:99},
    ...peers.map(row => ({article_id:row.id, snapshot_date:'2026-01-31', impressions:row.id === 'p0' ? 1000 : 10, reads:20, ctr:4, completion_rate:30}))];
  const facts = articleDiagnosisFacts({articles,snapshots}, articles[0]);
  assert.match(facts.text, /标题：这一篇/);
  assert.equal(facts.metrics.impressions.value, 100);
  assert.equal(facts.metrics.impressions.average, 10);
  assert.equal(facts.metrics.impressions.samples, 30);
  assert.equal(facts.metrics.reads.samples, 30);
});
test('prompt page shows the default diagnosis prompt and the article button does not call by itself', () => {
  const data = normalizeReviewData({articles:[{id:'a',account:'V字',title:'示例',published_at:'2026-11-11'}],
    prompts:[{id:'write',prompt_key:'longform_write',scope:'vzi',version:2,status:'active',title:'写',content_md:'完整写文章提示词',updated_at:'2026-11-10T04:00:00Z'}]});
  const page = renderContentReviewContent(data,{account:'V字',secondary:'prompts',filters:{},article:''});
  assert.match(page, /完整写文章提示词/);
  assert.ok(page.includes(ARTICLE_DIAGNOSIS_PROMPT));
  assert.match(page, /data-review-action="copy-diagnosis-prompt"/);
  const detail = renderContentReviewContent(data,{account:'V字',secondary:'articles',filters:{},article:'a'});
  assert.match(detail, /data-review-action="diagnose-article"/);
  assert.doesNotMatch(detail, /正在诊断/);
  const saved = renderContentReviewContent(data,{account:'V字',secondary:'articles',filters:{},article:'a',diagnoses:{a:{text:'好。\n差。\n改标题。',status:'saved'}}});
  assert.match(saved, /好。\n差。\n改标题。/);
  assert.doesNotMatch(saved, /data-review-action="diagnose-article"/);
});
test('a stored diagnosis is returned without another model call', async t => {
  const app = fixture(t), id = randomUUID();
  article(app.sql, app.owner, id, '诊断样本', '2026-11-11T01:00:00Z');
  assert.equal((await app.call('articles/' + randomUUID() + '/diagnosis')).status, 404);
  assert.equal((await app.call('articles/' + id + '/diagnosis')).data.result_text, null);
  let calls = 0;
  const fetch = async (_url, options) => { calls += 1; assert.match(options.body, new RegExp(promptLines[0].slice(0,12)));
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'好。差。改标题。'}]}]}),{status:200}); };
  const denied = await app.call('articles/' + id + '/diagnosis', 'POST', {});
  assert.equal(denied.status, 503); assert.equal(calls, 0);
  const env = {...app.env, OPENAI_API_KEY:'sk-test-key-000000000', OPENAI_REVIEW_MODEL:'gpt-test', ARTICLE_DIAGNOSIS_FETCH:fetch};
  const created = await app.call('articles/' + id + '/diagnosis', 'POST', {}, env);
  assert.equal(created.status, 200); assert.equal(created.data.result_text, '好。差。改标题。'); assert.equal(calls, 1);
  const again = await app.call('articles/' + id + '/diagnosis', 'POST', {}, env);
  assert.equal(again.data.result_text, '好。差。改标题。'); assert.equal(calls, 1);
  assert.equal((await app.call('articles/' + id + '/diagnosis')).data.result_text, '好。差。改标题。');
});
