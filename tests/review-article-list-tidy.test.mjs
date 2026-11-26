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

test('pattern groups keep the fixed 4+4 roster, absorb leftover labels, and leave API tags unchanged', () => {
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
  const groupNames = html => [...html.matchAll(/review-article-group-name">([^<]+)/g)].map(match => match[1]);
  const retired = ['谁跟谁较劲','别人怎么说','谁做了什么','一件小事引出大事','双方怎么争','一个人怎么走到这一步','事情怎么搞砸的','为什么跟想的不一样',
    '赛博罪案与猫鼠博弈流','草根江湖与赛博淘金流','隐形冠军与暴利商战流'];
  const titleGroups = articlePatternGroups(rows,tags,title);
  const bodyGroups = articlePatternGroups(rows,tags,body);
  assert.deepEqual(titleGroups.map(group => [group.name,group.rows.length]), [
    ['中外交锋',2],['引用外媒',1],['身份反差',2],['细节引大案',2],['其他',4],['未分类',1],
  ]);
  assert.deepEqual(bodyGroups.map(group => [group.name,group.rows.length]), [
    ['两方对决',3],['人物来路',2],['败局复盘',2],['预期反转',1],['其他',4],
  ]);
  assert.deepEqual(titleGroups.find(group => group.name === '中外交锋').legacyNames,['谁跟谁较劲']);
  assert.deepEqual(titleGroups.find(group => group.name === '其他').legacyNames,['悬念问答','暴利数字','败局揭底']);
  assert.equal(bodyGroups.find(group => group.name === '其他').note,
    '旧备用名，须重打：赛博罪案与猫鼠博弈流、草根江湖与赛博淘金流、隐形冠军与暴利商战流');
  const titleHtml = show(title), bodyHtml = show(body);
  assert.deepEqual(groupNames(titleHtml),['中外交锋','引用外媒','身份反差','细节引大案','其他','未分类']);
  assert.deepEqual(groupNames(bodyHtml),['两方对决','人物来路','败局复盘','预期反转','其他']);
  for (const name of retired) {
    assert.equal(groupNames(titleHtml).includes(name),false,name);
    assert.equal(groupNames(bodyHtml).includes(name),false,name);
  }
  assert.match(bodyHtml,/两方对决<\/span><span[^>]*>含旧名：双方怎么争、历史名场面与暗战纪实、脑洞怪题与硬核剥笋流<\/span><span[^>]*>3 篇/);
  assert.match(bodyHtml,/旧备用名，须重打：赛博罪案与猫鼠博弈流、草根江湖与赛博淘金流、隐形冠军与暴利商战流<\/span><span[^>]*>4 篇/);
  assert.match(titleHtml,/其他<\/span><span[^>]*>含旧名：悬念问答、暴利数字、败局揭底<\/span><span[^>]*>4 篇/);
  assert.match(titleHtml,/含旧名：谁跟谁较劲/);
  assert.doesNotMatch(bodyHtml,/>备用</);
  for (const name of ['两方对决','脑洞怪题与硬核剥笋流']) {
    const filtered = show(body,{dimension:body,name});
    assert.equal((filtered.match(/data-review-row=/g) || []).length,3);
    assert.match(filtered,/data-review-pattern="两方对决"/);
    assert.match(filtered,/data-review-pattern-clear[^>]*>两方对决 ×/);
    assert.deepEqual(groupNames(filtered),['两方对决']);
  }
  assert.match(renderDetailPatterns(rows[0],tags),/中外交锋/);
  assert.match(renderDetailPatterns(rows[1],tags),/中外交锋/);
  assert.doesNotMatch(renderDetailPatterns(rows[1],tags),/谁跟谁较劲/);
  assert.equal(JSON.stringify(tags),before);
});

test('current pattern names keep their own counts and the fixed order', () => {
  const title = '标题套路', body = '文章套路';
  const countsFor = (dimension,counts) => {
    const rows = [], tags = {};
    for (const [name,count] of counts) for (let i = 0; i < count; i += 1) {
      const id = `${dimension}-${name}-${i}`;
      rows.push({...article,id});
      tags[id] = {[dimension]:name};
    }
    return articlePatternGroups(rows,{dimensions:[title,body],tags},dimension).map(group => [group.name,group.rows.length]);
  };
  assert.deepEqual(countsFor(title,[['细节引大案',47],['身份反差',39],['中外交锋',28],['其他',12],['引用外媒',7]]),
    [['中外交锋',28],['引用外媒',7],['身份反差',39],['细节引大案',47],['其他',12]]);
  assert.deepEqual(countsFor(body,[['两方对决',40],['人物来路',37],['预期反转',30],['败局复盘',19],['其他',7]]),
    [['两方对决',40],['人物来路',37],['败局复盘',19],['预期反转',30],['其他',7]]);
});

test('a pattern with no articles stays visible at 0, and 其他 stays hidden until some article lands there', () => {
  const title = '标题套路', body = '文章套路';
  const present = {id:'kept',account:'V字',title:'只剩中外交锋',published_at:'2026-11-18T03:00:00Z',publish_status:'published',verdict:'爆'};
  const tags = {dimensions:[title,body],tags:{kept:{[title]:'中外交锋',[body]:'两方对决'}}};
  const titleGroups = articlePatternGroups([present],tags,title);
  assert.deepEqual(titleGroups.map(group => [group.name,group.rows.length]), [
    ['中外交锋',1],['引用外媒',0],['身份反差',0],['细节引大案',0],
  ]);
  const html = renderArticleList([present],{...vm({group:title}),tags},[],'');
  assert.match(html,/引用外媒<\/span><span class="review-group-count">0 篇<\/span>/);
  assert.doesNotMatch(html,/引用外媒<\/span><span class="review-group-count">0 篇<\/span><span class="review-sample-badge"/);
  assert.doesNotMatch(html,/review-article-group-name">其他</);
  const other = {...present,id:'other'};
  const withOther = articlePatternGroups([other],{dimensions:[title,body],tags:{other:{[title]:'其他'}}},title);
  assert.deepEqual(withOther.map(group => [group.name,group.rows.length]), [
    ['中外交锋',0],['引用外媒',0],['身份反差',0],['细节引大案',0],['其他',1],
  ]);
});
