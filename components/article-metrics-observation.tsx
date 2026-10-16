import type {MetricsObservation,MetricsSnapshot} from '../lib/article-history';
const time=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未核验';
const count=(value:number|null)=>value===null?'不可获取':String(value);
export default function ArticleMetricsObservation({observation:o}:{observation:MetricsObservation&{snapshot:MetricsSnapshot}}){
 const publicVerified=o.snapshot.public_verified;
 const sources={creator_work_management:'作品管理',article_page:'文章页面',explicit_platform_state:'平台明确状态'};
 return <div>
  <a href={o.published_url} target="_blank" rel="noreferrer">{o.platform==='toutiao'?'头条':'知乎'}{publicVerified?'公开文章':o.snapshot.state==='scheduled'?'定时预览页面':'文章页面（公开状态未核验）'}</a>
  <small>{o.publication?.status_text||'平台状态未核验'} · {o.snapshot.label}</small>
  <small>发布时间 {publicVerified?time(o.published_at):'尚未核验公开发布'} · 采集 {time(o.observed_at)}</small>
  {o.publication?.time_sources?.map((source,index)=><small key={index}>{sources[source.source]}：{source.raw_text}（{source.timezone||'时区未核验'}）</small>)}
  {publicVerified&&<><small>平台统计截止 {time(o.platform_data_through)}</small><span>{o.snapshot.state==='exact_24h'?'24小时区间':'当时累计'}：展现 {count(o.exposures)} / 阅读 {count(o.reads)} / 评论 {count(o.comments)} / 赞 {count(o.likes)}</span></>}
  {o.unavailable_reason&&<small>{o.unavailable_reason}</small>}
 </div>;
}
