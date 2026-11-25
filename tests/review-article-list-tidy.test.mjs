import test from 'node:test';
import assert from 'node:assert/strict';
import {renderArticleList, articleDensity, articlePatternGroups, renderDetailPatterns} from '../web/pages/review-article-list.mjs';

const article = {id:'a1',account:'V字',title:'合成文章',published_at:'2026-11-18T03:00:00Z',publish_status:'published',verdict:'中'};
const snapshots = [
  {id:'s24',article_id:'a1',snapshot_date:'2026-11-19',age_hours:24,reads:500,ctr:6,impressions:8000,completion_rate:null,avg_read_seconds:null},
  {id:'s70',article_id:'a1',snapshot_date:'2026-11-21',age_hours:70,reads:900,ctr:5,impressions:12000,completion_rate:21.5,avg_read_seconds:130},
];
const withSample = (row,list) => ({...row,sample24h:list[0],reads_24h:list[0].reads});
const vm = filters => ({now:'2026-11-21T10:00:00Z',filters:{range:'all',...filters},tags:null});
const cell = (html,label) => html.match(new RegExp(`<td data-label="${label}"[^>]*>([\\s\\S]*?)</td>`))?.[1];

test('compact shows four metrics; full adds the other three; unknown density falls back to compact', () => {
  const heads = html => [...html.matchAll(/<th scope="col" class="review-cell-([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(heads(renderArticleList([article],vm({}),snapshots,'')),['published','reads','ctr','completion_rate','avg_read_seconds']);
  assert.equal(heads(renderArticleList([article],vm({density:'full'}),snapshots,'')).length,8);
  assert.equal(articleDensity('wide'),'compact');
});

test('reads and click rate stay on the 24h observation; completion and read time fall back to the latest collection', () => {
  const html = renderArticleList([withSample(article,snapshots)],vm({}),snapshots,'');
  assert.match(cell(html,'24h 阅读'),/500/);
  assert.equal(cell(html,'点击率'),'6.0%');
  assert.match(cell(html,'完读率'),/review-latest-value[^>]*发布后 70 小时[^>]*>21\.5%</);
  assert.match(cell(html,'阅读时长'),/review-latest-value/);
  assert.match(html,/完读中位 <b>21\.5%<\/b>/);
});

test('24h values win when the 24h observation already has them', () => {
  const own = snapshots.map(s => s.id === 's24' ? {...s,completion_rate:18,avg_read_seconds:100} : s);
  const html = renderArticleList([withSample(article,own)],vm({}),own,'');
  assert.equal(cell(html,'完读率'),'18.0%');
});

test('pattern groups merge aliases by dimension while preserving API labels and reserved groups', () => {
  const title = '标题套路', body = '文章套路';
  const titleNames = ['中外交锋','谁跟谁较劲','身份反差','谁做了什么','细节引大案','一件小事引出大事',
    '别人怎么说','败局揭底','悬念问答','暴利数字','其他'];
  const bodyNames = ['历史名场面与暗战纪实','脑洞怪题与硬核剥笋流','双方怎么争','市井切片与江湖高人传','一个人怎么走到这一步',
    '商业败局与作死复盘流','事情怎么搞砸的','为什么跟想的不一样','赛博罪案与猫鼠博弈流','草根江湖与赛博淘金流','隐形冠军与暴利商战流','其他'];
  const rows = bodyNames.map((_,i) => ({...article,id:'pattern-'+i,title:'样本 '+i}));
  const entries = Object.freeze(Object.fromEntries(rows.map(({id},i) => [id,Object.freeze({[title]:titleNames[i],[body]:bodyNames[i]})])));
  const tags = Object.freeze({dimensions:Object.freeze([body,title]),tags:entries});
  const before = JSON.stringify(tags);
  const show = (group,pattern) => renderArticleList(rows,{...vm({group,pattern}),tags},[],'');
  const groups = dimension => new Map(articlePatternGroups(rows,tags,dimension).map(item => [item.name,item]));
  const titleGroups = groups(title), bodyGroups = groups(body);
  assert.deepEqual([...titleGroups].map(([name,group]) => [name,group.rows.length]).sort(), [
    ['谁跟谁较劲',2],['谁做了什么',2],['一件小事引出大事',2],['别人怎么说',1],['败局揭底',1],
    ['悬念问答',1],['暴利数字',1],['其他',1],['未分类',1]
  ].sort());
  assert.deepEqual([...bodyGroups].map(([name,group]) => [name,group.rows.length]).sort(), [
    ['双方怎么争',3],['一个人怎么走到这一步',2],['事情怎么搞砸的',2],['为什么跟想的不一样',1],
    ['赛博罪案与猫鼠博弈流',1],['草根江湖与赛博淘金流',1],['隐形冠军与暴利商战流',1],['其他',1]
  ].sort());
  assert.match(show(body),/双方怎么争<\/span><span[^>]*>含旧名：历史名场面与暗战纪实、脑洞怪题与硬核剥笋流<\/span><span[^>]*>3 篇/);
  assert.equal((show(body).match(/>备用</g) || []).length,3);
  assert.match(show(title),/败局揭底<\/span><span[^>]*>旧名，按内容归谁跟谁较劲或谁做了什么/);
  assert.match(show(title),/谁跟谁较劲<\/span><span[^>]*>含旧名：中外交锋/);
  for (const name of ['双方怎么争','脑洞怪题与硬核剥笋流']) {
    const filtered = show(body,{dimension:body,name});
    assert.equal((filtered.match(/data-review-row=/g) || []).length,3);
    assert.match(filtered,/data-review-pattern="双方怎么争"/);
  }
  assert.match(renderDetailPatterns(rows[0],tags),/中外交锋/);
  assert.equal(JSON.stringify(tags),before);
});
