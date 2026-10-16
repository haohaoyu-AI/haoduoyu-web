// Independent review counterexamples. All fixtures are synthetic, never live evidence.
import assert from 'node:assert/strict';
import {loadTS} from './hot-discovery-loader.mjs';
const {parseAccountCards,scanBenchmarkAccounts}=loadTS('lib/hot-article-discovery.ts');
const stamp='2026-10-08T08:00:00Z',account={id:'review',name:'SYNTHETIC',url:'https://www.toutiao.com/c/user/123456789/',created:stamp};
const other='https://www.toutiao.com/c/user/987654321/',url='https://www.toutiao.com/article/1000000000000000001/';
const card=({read='12万阅读',date='2026-10-07T08:00:00Z',visible='2026-10-07',more='',author=account.url}={})=>`<li><h3><a href="${url}">SYNTHETIC 卡片</a></h3><a rel="author" href="${author}">本文作者</a><time datetime="${date}">${visible}</time><div class="article-stats"><span>${read}</span></div>${more}</li>`;
const page=cards=>`<main><ul>${cards}</ul></main>`;
const cases=[
 ['script_rawtext',`<main><script>const inertTemplate = \`</main><main><ul>${card()}</ul></main>\`;</script></main>`],
 ['textarea_rcdata',`<main><textarea>${card()}</textarea></main>`],
 ['quoted_attribute',`<main><div title="> ${card().replaceAll('"',"'")}"></div></main>`],
 ['datetime_conflict',page(card({date:'2026-10-05T12:00:00Z',visible:'2026-10-05 00:00'}))],
 ['minute_mismatch',page(card({date:'2026-10-07T12:01:00Z',visible:'2026-10-07 12:00'}))],
 ['second_mismatch',page(card({date:'2026-10-07T12:00:01Z',visible:'2026-10-07 12:00:00'}))],
 ['date_only_cannot_prove_boundary',page(card({date:'2026-10-05T12:00:00Z',visible:'2026-10-05'}))],
 ['minute_only_cannot_prove_boundary',page(card({date:'2026-10-05T08:00:59Z',visible:'2026-10-05 08:00'}))],
 ['duplicate_low_reads',page(card()+card({read:'99999阅读'}))],
 ['duplicate_stale_date',page(card()+card({date:'2026-10-04T08:00:00Z',visible:'2026-10-04'}))],
 ['duplicate_missing_metrics',page(card()+card({read:'未公开'}))],
 ['duplicate_invalid_date',page(card()+card({visible:'昨天'}))],
 ['recommendation_other_author',page(card({author:other,more:`<div class="follow-suggestion"><a class="user-name" href="${account.url}">推荐账号</a></div>`}))],
 ['conflicting_authors',page(card({more:`<a rel="author" href="${other}">另一作者</a>`}))],
 ['generic_username_not_author',page(card().replace('rel="author"','class="user-name"'))],
 ['body_promotion_metric',page(card().replace('<div class="article-stats"><span>12万阅读</span></div>','<section itemprop="articleBody"><div>上一期文章战报：<span class="read-count">12万阅读</span>欢迎关注。</div></section>'))],
 ['closed_dialog',page(`<dialog>${card()}</dialog>`)],
 ['closed_details_body',page(`<details><summary>展开</summary><ul>${card()}</ul></details>`)],
 ['closed_details_second_summary',page(`<details><summary>展开</summary><summary><ul>${card()}</ul></summary></details>`)],
 ['description_metric',page(card().replace('<div class="article-stats"><span>12万阅读</span></div>','<section itemprop="description"><span class="read-count">12万阅读</span></section>'))],
 ['isolated_metric_not_stats',page(card().replace('<div class="article-stats"><span>12万阅读</span></div>','<span class="read-count">12万阅读</span>'))],
 ['unsupported_person_author_conflict',page(card({more:`<div itemprop="author" itemscope itemtype="https://schema.org/Person"><a itemprop="url" href="${other}">另一作者</a></div>`}))]
];
const control=await parseAccountCards(page(card()),account,stamp);assert.equal(control.articles.length,1);assert.equal(control.articles[0].reads.exact,null);assert.match(control.articles[0].evidence.card_html,/12万阅读/);
for(const [name,html]of cases){const result=await parseAccountCards(html,account,name==='minute_only_cannot_prove_boundary'?'2026-10-08T08:00:30Z':stamp);assert.equal(result.articles.length,0,name);}
const exact=await parseAccountCards(page(card({date:'2026-10-05T08:00:00Z',visible:'2026-10-05 08:00:00'})),account,stamp);assert.equal(exact.articles.length,1);assert.equal(exact.articles[0].evidence.date_precision,'second');
for(const html of [page(`<dialog open>${card()}</dialog>`),page(`<details open><summary>展开</summary>${card()}</details>`),page(`<details><summary>${card()}</summary></details>`)])assert.equal((await parseAccountCards(html,account,stamp)).articles.length,1,'open native containers and first closed-details summary stay visible');
const ambiguous=card({more:'<a href="https://www.toutiao.com/article/1000000000000000002/">另一文章</a>'});
const result=await scanBenchmarkAccounts([account],async()=>new Response(page(card({read:'99999阅读'})+ambiguous),{headers:{'content-type':'text/html'}}),stamp);
assert.equal(result.status,'incomplete');assert.equal(result.observations[0].outcome,'unverifiable');assert.equal(result.observations[0].cards,2);
const nested=await scanBenchmarkAccounts([account],async()=>new Response(page(`<article><h3><a href="https://www.toutiao.com/article/1000000000000000002/">未解析外层文章</a></h3><ul>${card({read:'99999阅读'})}</ul></article>`),{headers:{'content-type':'text/html'}}),stamp);
assert.equal(nested.status,'incomplete');assert.equal(nested.observations[0].outcome,'unverifiable');assert.equal(nested.observations[0].cards,2,'outer own-URL article counted alongside nested low-read card');
const second={...account,id:'review-other',url:other};
const cross=await scanBenchmarkAccounts([account,second],async request=>new Response(page(card(request===other?{author:other,read:'99万阅读'}:{})),{headers:{'content-type':'text/html'}}),stamp);
assert.equal(cross.articles.length,0,'conflicting author/read identity across account pages');assert.equal(cross.status,'incomplete');assert.ok(cross.observations.every(o=>o.qualified===0),'conflicting articles never inflate qualified diagnostics');
console.log(`PASS ${cases.length} review rejections + positive controls, precision boundaries, ambiguity accounting and cross-account conflict; synthetic HTML only`);
