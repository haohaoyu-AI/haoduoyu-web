// Entirely synthetic evidence fixtures. No real article, provider, browser,
// public search, production data or network request is used in these tests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import * as publicModule from '../lib/hot-article-public.ts';

const exported={},compile=ts.transpileModule(fs.readFileSync('lib/hot-article-acquisition.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let networkCalls=0;
vm.runInNewContext(compile,{exports:exported,TextEncoder,crypto,fetch:()=>{networkCalls++;throw Error('Network forbidden in synthetic validator test');},require:name=>{assert.equal(name,'./hot-article-public');return publicModule;}});
const validate=exported.validateHotPublicAcquisition,hash=text=>createHash('sha256').update(text).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value));
const stamp='2026-10-08T02:00:00.000Z',prior='2026-10-06T04:20:00.000Z';
const url=id=>`https://www.toutiao.com/article/${String(id).padStart(19,'9')}/`;
const title='离线合成电影叙事样本，不是真实热文';
const body='这是一份仅供校验器离线测试的电影评论合成文本，讨论演员表演、导演选择与叙事节奏，不代表任何真实人物或作品。'.repeat(3);
const metricHTML=(id=1,reads=100000,likes=0,comments=null,extra={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'NewsArticle',url:url(id),headline:title,interactionStatistic:[['ViewAction',reads],['LikeAction',likes],['CommentAction',comments]].filter(([,value])=>value!==null).map(([interactionType,userInteractionCount])=>({interactionType,userInteractionCount})),...extra})}</script>`;
const read=(id=1,extra={})=>({url:url(id),title,published_at:prior,category:'娱乐',method:'public_web_read',observed_at:stamp,visible_text:`${title}\n${body}\n阅读 100000\n点赞：0`,body,full_text_read:true,...(extra.visible_text===undefined?{metric_html:metricHTML(id)}:{}),...extra});
const payload=(reads=[read()],extra={})=>({queries:['site:toutiao.com/article/ 电影（离线合成查询，未执行）'],reads,notice:'全部为离线合成采集结果，不能作为生产文章或热榜。',...extra});
const cases=[];
const test=async(name,run)=>{await run();cases.push(name);};

await test('ordinary_objects_from_independent_realm_are_accepted',async()=>{
 const foreign=vm.runInNewContext('JSON.parse(serialized)',{serialized:JSON.stringify(payload())});
 assert.notEqual(Object.getPrototypeOf(foreign),Object.prototype);assert.notEqual(Object.getPrototypeOf(foreign.reads[0]),Object.prototype);
 const result=await validate(foreign,stamp);assert.equal(result.status,'ready');assert.equal(result.articles[0].body_sha256,hash(body));
 const nullProto=payload([Object.assign(Object.create(null),read())]);Object.setPrototypeOf(nullProto,null);
 assert.equal((await validate(nullProto,stamp)).status,'ready');
});
await test('class_instances_in_any_realm_are_rejected',async()=>{
 class Result {constructor(data){Object.assign(this,data);}}
 class Read {constructor(data){Object.assign(this,data);}}
 class NullBase extends null {constructor(data){return Object.assign(Object.create(new.target.prototype),data);}}
 await assert.rejects(validate(new Result(payload()),stamp),/普通对象/);
 await assert.rejects(validate(payload([new Read(read())]),stamp),/普通对象/);
 await assert.rejects(validate(new NullBase(payload()),stamp),/普通对象/);
 const foreignClass=vm.runInNewContext('(() => {class Result {constructor(data){Object.assign(this,data);}} return new Result(JSON.parse(serialized));})()',{serialized:JSON.stringify(payload())});
 await assert.rejects(validate(foreignClass,stamp),/普通对象/);
});

await test('prior_day_real_body_with_100000_reads_stays_qualified',async()=>{
 const result=await validate(payload(),stamp),article=result.articles[0];
 assert.equal(result.status,'ready');assert.equal(result.acquisition_needed,false);assert.equal(result.articles.length,1);assert.equal(result.leads.length,0);
 assert.equal(article.published_at,prior);assert.equal(article.body,body);assert.equal(article.body_sha256,hash(body));
 assert.equal(article.acquisition.source_content_sha256,hash(read().visible_text));assert.equal(article.acquisition.metric_source_sha256,hash(read().metric_html));assert.equal(article.acquisition.verification,'authenticated_collection_executor_attested_not_platform_verified');
 assert.equal(article.body_evidence.kind,'authenticated_public_read');assert.equal(article.heat_state,'multi_metric');
 assert.equal(article.reads.value,100000);assert.equal(article.likes.value,0);assert.equal(article.comments.value,null);assert.equal(article.comments.evidence,null);
 assert.match(article.likes.evidence.label,/LikeAction userInteractionCount=0/);assert.match(result.coverage,/公开样本/);assert.match(result.coverage,/indexed_search 0篇，public_web_read 1篇/);assert.match(result.notice,/null/);assert.match(result.notice,/并非平台签名/);
});
await test('zero_comment_remains_real_but_missing_reads_is_not_qualified',async()=>{
 const result=await validate(payload([read(1,{visible_text:`${title}\n${body}\n0评论`,metric_html:metricHTML(1,null,null,0)})]),stamp),article=result.leads[0];
 assert.equal(result.status,'insufficient');assert.equal(article.heat_state,'partial_metric');assert.equal(article.comments.value,0);assert.equal(article.reads.value,null);assert.equal(article.likes.value,null);
});
await test('indexed_search_cannot_attest_page_body_or_current_metrics',async()=>{
 const result=await validate(payload([read(1,{method:'indexed_search',full_text_read:true})]),stamp),lead=result.leads[0];
 assert.equal(result.status,'insufficient');assert.equal(result.acquisition_needed,true);assert.equal(result.articles.length,0);assert.equal(lead.body,'');assert.equal(lead.body_sha256,null);assert.equal(lead.body_evidence,null);assert.equal(lead.body_state,'unreadable');
 assert.equal(lead.heat_state,'unverified');for(const field of ['reads','likes','comments'])assert.equal(lead[field].value,null);
 assert.equal(lead.acquisition.source_content_sha256,hash(read().visible_text));assert.match(lead.exclusion,/搜索索引线索/);
});
await test('source_content_and_full_body_have_separate_exact_hashes',async()=>{
 const visible_text=`公开页面标题\n${title}\n${body.replaceAll('，','，\n')}\n阅读量：123`;
 const result=await validate(payload([read(1,{visible_text,metric_html:metricHTML()})]),stamp),article=result.articles[0];
 assert.equal(article.body_sha256,hash(body));assert.equal(article.acquisition.source_content_sha256,hash(visible_text));assert.equal(article.reads.value,100000);
});
await test('unbound_claimed_full_body_is_only_a_lead_without_hash',async()=>{
 const result=await validate(payload([read(1,{visible_text:`${title}\n只有合成摘要，不含所声称的完整正文。\n阅读 5`})]),stamp),lead=result.leads[0];
 assert.equal(result.articles.length,0);assert.equal(lead.body,'');assert.equal(lead.body_sha256,null);assert.equal(lead.body_evidence,null);assert.match(lead.exclusion,/无法.*绑定/);
});
await test('no_heat_metrics_is_a_lead_even_with_full_body',async()=>{
 const result=await validate(payload([read(1,{visible_text:`${title}\n${body}`})]),stamp),lead=result.leads[0];
 assert.equal(result.status,'insufficient');assert.equal(lead.body_sha256,hash(body));assert.equal(lead.heat_state,'unverified');assert.match(lead.exclusion,/未取得.*阅读数/);
});
await test('story_attendance_votes_box_office_and_inline_numbers_are_not_metrics',async()=>{
 const story=`${body}\n评论 900\n这是人物故事中写出的标签。`;
 const result=await validate(payload([read(1,{body:story,visible_text:`${title}\n${story}\n观众 1200\n点赞票数：600\n电影票房 999999\n1200人参加\n读者阅读 5000\n主角赢得100赞`})]),stamp),lead=result.leads[0];
 for(const field of ['reads','likes','comments'])assert.equal(lead[field].value,null);assert.equal(lead.heat_state,'unverified');
});
for(const count of ['1.2万','-1','1.5','9007199254740992','01','1,234','１２３'])await test(`unsafe_or_abbreviated_metric_${count}_is_null`,async()=>{
 const result=await validate(payload([read(1,{visible_text:`${title}\n${body}\n阅读 ${count}`})]),stamp);assert.equal(result.leads[0].reads.value,null);assert.equal(result.leads[0].reads.evidence,null);
});
await test('conflicting_or_malformed_duplicate_metric_is_null',async()=>{
 for(const extra of ['阅读 2','阅读 1.2万']){const result=await validate(payload([read(1,{visible_text:`${title}\n${body}\n阅读 1\n${extra}`})]),stamp);assert.equal(result.leads[0].reads.value,null);}
 const same=await validate(payload([read(1,{visible_text:`${title}\n${body}\n阅读 1\n阅读 1`})]),stamp);assert.equal(same.leads[0].reads.value,null);
});
for(const marker of ['登录后阅读','验证码','付费解锁','展开全文','内容节选','subscribe to read','captcha'])await test(`restricted_or_truncated_${marker}_never_full`,async()=>{
 const result=await validate(payload([read(1,{visible_text:`${title}\n${body}\n阅读 123\n${marker}`})]),stamp),lead=result.leads[0];assert.equal(lead.body,'');assert.equal(lead.body_sha256,null);assert.equal(lead.body_evidence,null);assert.match(lead.exclusion,/访问限制或节选/);
});
await test('missing_date_is_lead_non_entertainment_is_observation_only',async()=>{
 const missing=await validate(payload([read(1,{published_at:null})]),stamp);assert.equal(missing.articles.length,0);assert.match(missing.leads[0].exclusion,/发布时间/);
 const neutral='离线合成交通设施样本';const neutralBody='这是仅供测试的交通设施报告，讨论道路照明和步行路线，不涉及任何真实事件。'.repeat(5);
 const result=await validate(payload([read(1,{title:neutral,body:neutralBody,category:'娱乐',visible_text:`${neutral}\n${neutralBody}\n阅读 8`})]),stamp);assert.equal(result.articles.length,0);assert.equal(result.leads.length,0);assert.equal(result.observations.length,1);assert.match(result.observations[0].outcome,/尚未确认属于文娱/);assert.match(result.notice,/1篇未确认文娱内容已排除/);assert.match(result.notice,/阅读1篇、点赞1篇、评论1篇/);assert.match(result.coverage,/实际提交1个/);
});
await test('non_entertainment_search_leads_cannot_fill_candidate_slots',async()=>{
 const financeTitle='离线合成理财利率分析样本',financeText='仅用于测试储蓄利率与家庭预算的合成摘录，不代表投资建议。';
 const finance=Array.from({length:4},(_,i)=>read(i+3,{title:financeTitle,body:null,category:'财经',method:'indexed_search',visible_text:`${financeTitle}\n${financeText}`,full_text_read:false}));
 const result=await validate(payload([read(1,{method:'indexed_search'}),...finance]),stamp);
 assert.equal(result.articles.length,0);assert.deepEqual(plain(result.leads.map(item=>item.url)),[url(1)]);assert.equal(result.observations.length,5);assert.match(result.notice,/4篇未确认文娱内容已排除/);assert.match(result.notice,/全部5篇实际读取结果/);assert.match(result.coverage,/实际提交5个/);
});
await test('public_browser_is_supported_but_full_flag_is_required',async()=>{
 const good=await validate(payload([read(1,{method:'public_browser'})]),stamp);assert.equal(good.status,'ready');assert.equal(good.articles[0].acquisition.method,'public_browser');
 const bad=await validate(payload([read(1,{method:'public_browser',full_text_read:false})]),stamp);assert.equal(bad.leads[0].body_sha256,null);
});
await test('full_body_length_bounds',async()=>{
 for(const count of [99,100,30000]){
  const bounded='X'.repeat(count),result=await validate(payload([read(1,{body:bounded,visible_text:`${title}\n${bounded}\n阅读 100000`,metric_html:metricHTML()})]),stamp);
  assert.equal(result.articles.length,count>=100?1:0);
 }
 await assert.rejects(validate(payload([read(1,{body:'X'.repeat(30001),visible_text:`${title}\n${'X'.repeat(30001)}`})]),stamp),/正文.*范围/);
});
await test('unknown_fields_and_bad_types_are_rejected',async()=>{
 for(const invalid of [null,[],{...payload(),extra:true},payload([read(1,{extra:true})]),payload([read(1,{full_text_read:'true'})]),payload([read(1,{method:'authenticated_session'})]),payload([read(1,{body:2})]),payload([read(1,{category:2})]),payload([read(1,{title:'other'})])])await assert.rejects(validate(invalid,stamp));
});
await test('only_exact_canonical_public_article_urls_no_alias_private_query_or_auth',async()=>{
 for(const invalid of ['/article/9999999999999999991/',url(1).slice(0,-1),url(1)+'?source=1',url(1)+'#comment','http://www.toutiao.com/article/9999999999999999991/','https://m.toutiao.com/article/9999999999999999991/','https://elsewhere.example/article/9999999999999999991/','https://127.0.0.1/article/9999999999999999991/','https://www.toutiao.com@127.0.0.1/article/9999999999999999991/','https://a:b@www.toutiao.com/article/9999999999999999991/','https://www.toutiao.com:443/article/9999999999999999991/'])await assert.rejects(validate(payload([read(1,{url:invalid})]),stamp));
 await assert.rejects(validate(payload([read(),read()]),stamp),/重复/);
});
await test('times_are_strict_and_future_publication_is_not_accepted',async()=>{
 for(const invalid of ['2026-10-08','2026-02-30T00:00:00Z','2026-10-08T25:00:00Z','2026-10-08T00:00:00+15:00','not a time'])await assert.rejects(validate(payload([read(1,{observed_at:invalid})]),stamp));
 await assert.rejects(validate(payload([read(1,{observed_at:'2026-10-08T02:05:00.001Z'})]),stamp),/五分钟/);
 await assert.rejects(validate(payload([read(1,{published_at:'2026-10-08T02:00:00.001Z'})]),stamp),/发布时间/);
 const edge=await validate(payload([read(1,{observed_at:'2026-10-08T10:05:00+08:00'})]),stamp);assert.equal(edge.articles[0].reads.evidence.observed_at,'2026-10-08T02:05:00.000Z');
});
await test('bounded_aggregate_utf8_queries_and_read_count',async()=>{
 await assert.rejects(validate(payload([], {queries:Array.from({length:5},(_,i)=>'query '+i)}),stamp),/四条/);
 await assert.rejects(validate(payload(Array.from({length:13},(_,i)=>read(i))),stamp),/十二/);
 await assert.rejects(validate(payload([],{queries:['same','same']}),stamp),/重复/);
 await assert.rejects(validate(payload([read(1,{visible_text:`${title}\n${'字'.repeat(34000)}`})]),stamp),/100KB/);
 const empty=await validate(payload([],{queries:[]}),stamp);assert.equal(empty.status,'insufficient');assert.equal(empty.leads.length,0);assert.match(empty.coverage,/未执行搜索/);
});
await test('qualified_first_and_stable_total_five_without_lead_heat_ranking',async()=>{
 const inputs=[read(9,{method:'indexed_search'}),read(8,{method:'indexed_search',published_at:null}),read(4,{method:'indexed_search'}),read(3,{method:'indexed_search'}),read(1),read(2)];
 const result=await validate(payload(inputs),stamp),reverse=await validate(payload([...inputs].reverse()),stamp);
 assert.equal(result.articles.length,2);assert.equal(result.leads.length,3);assert.equal(result.articles.length+result.leads.length,5);
 assert.deepEqual(plain(result.articles.map(item=>item.url)),plain(reverse.articles.map(item=>item.url)));
 assert.deepEqual(plain(result.leads.map(item=>item.url)),[url(3),url(4),url(9)]);assert.deepEqual(plain(result.leads.map(item=>item.url)),plain(reverse.leads.map(item=>item.url)));
 const six=await validate(payload(Array.from({length:6},(_,i)=>read(i))),stamp);assert.equal(six.articles.length,5);assert.equal(six.leads.length,0);
});
await test('old_observation_is_only_an_unverified_lead_even_with_metrics',async()=>{
 for(const method of ['public_web_read','public_browser','indexed_search']){
  const result=await validate(payload([read(1,{method,observed_at:'2020-01-01T00:00:00Z'})]),stamp),lead=result.leads[0];
  assert.equal(result.status,'insufficient');assert.equal(result.articles.length,0);assert.equal(lead.heat_state,'unverified');
  assert.equal(lead.body,'');assert.equal(lead.body_sha256,null);assert.equal(lead.body_evidence,null);
  for(const field of ['reads','likes','comments']){assert.equal(lead[field].value,null);assert.equal(lead[field].evidence,null);}
  assert.match(lead.exclusion,/观察时间.*认领窗口/);assert.match(result.coverage,/0个公开页面读查/);
 }
});
await test('observation_window_follows_current_claim_and_has_exact_lower_bound',async()=>{
 const claim='2026-10-08T01:50:00.000Z',lower='2026-10-08T01:45:00.000Z';
 assert.equal((await validate(payload([read(1,{observed_at:lower})]),stamp,claim)).status,'ready');
 assert.equal((await validate(payload([read(1,{observed_at:'2026-10-08T01:44:59.999Z'})]),stamp,claim)).status,'insufficient');
 // A new claim must not reuse observations from an earlier claim in the batch.
 assert.equal((await validate(payload([read(1,{observed_at:lower})]),stamp,'2026-10-08T01:55:00.000Z')).status,'insufficient');
 // An old claim-start argument cannot make years-old observations current.
 assert.equal((await validate(payload([read(1,{observed_at:'2026-10-08T01:40:00.000Z'})]),stamp,'2020-01-01T00:00:00Z')).status,'ready');
 assert.equal((await validate(payload([read(1,{observed_at:'2026-10-08T01:39:59.999Z'})]),stamp,'2020-01-01T00:00:00Z')).status,'insufficient');
});
await test('old_publication_with_current_observation_remains_qualified',async()=>{
 const published_at='2020-01-01T00:00:00Z',result=await validate(payload([read(1,{published_at})]),stamp);
 assert.equal(result.status,'ready');assert.equal(result.articles[0].published_at,'2020-01-01T00:00:00.000Z');
});
await test('observation_future_tolerance_does_not_expand',async()=>{
 assert.equal((await validate(payload([read(1,{observed_at:'2026-10-08T02:05:00.000Z'})]),stamp)).status,'ready');
 await assert.rejects(validate(payload([read(1,{observed_at:'2026-10-08T02:05:00.001Z'})]),stamp),/观察时间/);
});
await test('minimum_reads_99999_rejected_100000_accepted_with_identity',async()=>{
 for(const value of [0,99999,100000]){const result=await validate(payload([read(1,{metric_html:metricHTML(1,value)})]),stamp);assert.equal(result.articles.length,value>=100000?1:0);const article=[...result.articles,...result.leads][0];assert.equal(article.reads.value,value);assert.equal(article.reads.evidence.observed_at,stamp);}
 const highLikes=await validate(payload([read(1,{metric_html:metricHTML(1,null,999999,999999)})]),stamp);assert.equal(highLikes.articles.length,0);assert.equal(highLikes.leads[0].reads.value,null);
});
await test('whole_page_sidebar_counts_never_become_article_reads',async()=>{
 const result=await validate(payload([read(1,{visible_text:`${title}\n${body}\n14赞\n3评论\n推荐另一篇文章\n29阅读\n9阅读\n票房 1000000`})]),stamp);
 assert.equal(result.articles.length,0);for(const field of ['reads','likes','comments'])assert.equal(result.leads[0][field].value,null);
 const unrelated=await validate(payload([read(1,{metric_html:metricHTML(2,999999)})]),stamp);assert.equal(unrelated.leads[0].reads.value,null);
 const wrongTitle=await validate(payload([read(1,{metric_html:metricHTML(1,999999,0,null,{headline:'另一篇文章'})})]),stamp);assert.equal(wrongTitle.leads[0].reads.value,null);
});
await test('raw_metric_html_is_optional_bounded_and_restricted',async()=>{
 for(const metric_html of [undefined,'',metricHTML(1,999999,0,null,{isAccessibleForFree:false})]){const result=await validate(payload([read(1,{metric_html})]),stamp);assert.equal(result.articles.length,0);assert.equal(result.leads[0].reads.value,null);}
 await assert.rejects(validate(payload([read(1,{metric_html:123})]),stamp));
 await assert.rejects(validate(payload([read(1,{metric_html:'字'.repeat(34000)})]),stamp),/100KB/);
});
assert.equal(networkCalls,0);
console.log(JSON.stringify({test_scope:'entirely_synthetic_offline',case_count:cases.length,cases,network_requests:0,provider_requests:0}));
console.log('PASS public acquisition evidence validator: no indexed full-text/metric claims, exact source/body binding, real zero versus null, prior-day retention, identity-bound metrics, minimum100000 reads, leads and qualified ranking; all fixtures synthetic');
