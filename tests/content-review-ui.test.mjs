import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReviewData,periodsFor} from '../web/core/review-data.mjs';
import {renderContentReviewContent,renderReviewMarkdown,safeReviewUrl,reviewNumber,REVIEW_VIEWS} from '../web/pages/content-review.mjs';
import {readReviewCollection,readContentReviewData} from '../web/review-controller.mjs';

const fixture = () => normalizeReviewData({
  articles:[{id:'a',account:'V字',title:'<img src=x onerror=alert(1)>',published_at:'2026-10-29',topic_category:'影评',title_pattern:'追问',url:'javascript:alert(1)'}],
  snapshots:[{id:'s',article_id:'a',snapshot_date:'2026-10-29',reads:12,ctr:5,completion_rate:30,traffic_sources:{推荐:9,搜索:3},completion_curve:[100,70,30],audience:{年龄:{青年:70,中年:30}}}],
  reports:[{id:'r',account:'V字',period_type:'daily',period_start:'2026-10-29',period_end:'2026-10-29',verdicts:{a:{verdict:'爆',reason:'真实原因'}},findings:{verified:[{rule_id:'r-1',reason:'证据'}]},summary_md:'# 复盘\n**正文**',playbook_version:'V2',metrics:{reads:12}}],
  playbooks:[{id:'p2',account:'V字',version:'V2',published_on:'2026-10-29',content_md:'## 规则\n手册正文',rules:[{rule_id:'r-1',section:'标题',text:'新规则'}]},
    {id:'p1',account:'V字',version:'V1',published_on:'2026-10-28',rules:[{rule_id:'r-1',section:'标题',text:'旧规则'}]}]
});
const model = (data,view) => ({account:'V字',view,date:'2026-10-29',start:'2026-10-23',end:'2026-10-29',periods:periodsFor(data,view),filters:{},article:'',version:'',compare:'',loading:false,error:''});

test('all five empty views render an accurate empty state without synthetic statistics',() => {
  const data = normalizeReviewData();
  for (const [view] of REVIEW_VIEWS) {
    const html = renderContentReviewContent(data,model(data,view));
    assert.match(html,/尚无内容复盘数据/);
    assert.doesNotMatch(html,/class="review-stat"|<svg|style=/);
  }
  assert.equal(reviewNumber(null),'未采集');
  assert.equal(reviewNumber(0),'0');
});
test('populated views and article detail render real metrics, escaped titles and rule links',() => {
  const data = fixture();
  for (const [view] of REVIEW_VIEWS) {
    const html = renderContentReviewContent(data,model(data,view));
    assert.doesNotMatch(html,/<img|href="javascript:|<[^>]+\sonerror=|\sstyle=/);
    assert.match(html,/内容复盘/);
  }
  const daily = renderContentReviewContent(data,model(data,'daily'));
  assert.match(daily,/data-review-rule="r-1"/);
  assert.doesNotMatch(daily,/与快照计算存在不一致/);
  assert.match(daily,/&lt;img/);
  const detail = renderContentReviewContent(data,{...model(data,'articles'),article:'a'});
  assert.match(detail,/逐日快照增长/);
  assert.match(detail,/流量来源/);
  assert.match(detail,/完读曲线/);
  assert.match(detail,/读者画像/);
  const books = renderContentReviewContent(data,model(data,'playbooks'));
  assert.equal((books.match(/− r-1/g) || []).length,1);
  assert.equal((books.match(/\+ r-1/g) || []).length,1);
});
test('Markdown permits safe formatting and HTTP links while escaping HTML and blocking URL schemes',() => {
  const html = renderReviewMarkdown('## 标题\n<script>alert(1)</script>\n[安全](https://example.com/a?q=1&b=2)\n[危险](javascript:alert(1))\n**粗体**\n- 项目');
  assert.match(html,/<h3>标题<\/h3>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/rel="noopener noreferrer"/);
  assert.doesNotMatch(html,/href="javascript|<script/);
  assert.equal(safeReviewUrl('data:text/html,x'),'');
  assert.equal(safeReviewUrl('//evil.test'),'');
});
test('pagination uses fixed pages and pins the subsequent page revision',async () => {
  const paths = [];
  const first = Array.from({length:100},(_,i) => ({id:String(i),account:'V字'}));
  const result = await readReviewCollection(async path => { paths.push(path); return paths.length === 1 ? {items:first,has_more:true,read_revision:7} : {items:[{id:'last',account:'V字'}],has_more:false,read_revision:7}; },'articles','V字');
  assert.equal(result.items.length,101);
  assert.match(paths[1],/offset=100&read_revision=7$/);
  assert.doesNotMatch(paths[0],/limit=/);
  await assert.rejects(() => readReviewCollection(async () => ({items:[{id:'a',account:'V字'}],has_more:true,read_revision:7}),'articles','V字'),/分页/);
});
test('read sets reject mixed revisions and do not accept another account',async () => {
  await assert.rejects(() => readContentReviewData(async path => ({items:[],has_more:false,read_revision:path.includes('/reports?') ? 2 : 1}),'V字'),{code:'REVIEW_READ_CHANGED'});
  await assert.rejects(() => readReviewCollection(async () => ({items:[{id:'x',account:'other'}],has_more:false,read_revision:1}),'articles','V字'),/账号不一致/);
});

test('article cards, library filters and Gemini delivery show the same Shanghai date and time', () => {
  const data=fixture();
  data.articles[0].published_at='2026-10-26T20:05:00Z';
  data.playbooks[0].sent_to_gemini_at='2026-10-27T22:09:00Z';
  const daily=renderContentReviewContent(data,{...model(data,'daily'),date:'2026-10-27'});
  assert.match(daily,/2026-10-27 04:05/);
  assert.doesNotMatch(daily,/2026-10-26 20:05/);
  const selected=renderContentReviewContent(data,{...model(data,'articles'),filters:{from:'2026-10-27',to:'2026-10-27'}});
  assert.match(selected,/data-review-article="a"/);
  assert.match(selected,/<td>2026-10-27<\/td>/);
  const excluded=renderContentReviewContent(data,{...model(data,'articles'),filters:{from:'2026-10-26',to:'2026-10-26'}});
  assert.doesNotMatch(excluded,/data-review-article="a"/);
  const books=renderContentReviewContent(data,model(data,'playbooks'));
  assert.match(books,/2026-10-28 06:09/);
  assert.doesNotMatch(books,/2026-10-27T22:09:00Z/);
});

test('period views lead with key numbers and keep a 07:13 Beijing post on that day', () => {
  const data = fixture();
  data.articles[0].published_at = '2026-10-27T23:13:00.000Z';
  const three = renderContentReviewContent(data, {...model(data,'three_day'), start:'2026-10-28', end:'2026-10-30', periods:[{start:'2026-10-28', end:'2026-10-30', label:'2026-10-28 — 2026-10-30'}]});
  assert.match(three, /class="review-keyline"/);
  assert.match(three, /2026-10-28 07:13/);
  assert.match(three, /真实原因/);
  assert.match(three, /data-review-article="a"/);
  assert.doesNotMatch(three, /未采集|无可比数据|本期手册|class="review-stat"/);
  assert.doesNotMatch(renderContentReviewContent(data, {...model(data,'daily'), date:'2026-10-27'}), /data-review-article="a"/);
  assert.match(renderContentReviewContent(data, {...model(data,'daily'), date:'2026-10-28'}), /data-review-article="a"/);
  for (const view of ['daily','three_day','weekly','articles','playbooks']) assert.match(renderContentReviewContent(data, model(data, view)), /class="review-keyline"/);
  const books = renderContentReviewContent(data, model(data,'playbooks'));
  assert.match(books, /展开更多/);
  assert.doesNotMatch(books, /未记录发送/);
});

test('one-sided and two-sided article date filters exclude unknown publication dates', () => {
  const data=fixture();
  data.articles.push({id:'unknown',account:data.articles[0].account,title:'unknown publication',published_at:null});
  for (const filters of [{to:'2026-10-29'},{from:'2026-10-29'},{from:'2026-10-29',to:'2026-10-29'}]) {
    const html=renderContentReviewContent(data,{...model(data,'articles'),filters});
    assert.match(html,/data-review-article="a"/);
    assert.doesNotMatch(html,/data-review-article="unknown"/);
  }
});
