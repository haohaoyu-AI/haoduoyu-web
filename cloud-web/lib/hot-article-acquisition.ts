import {publicArticleURL,sortPublicArticles,hotArticleRankingBasis,parsePublicArticle,hotReadEligibilityReason} from './hot-article-public';
import type {HotArticle,HotCollection,HotMetric} from './hot-article-public';

/** Data returned by an authenticated, public-only collection executor. The
 * caller supplies its server clock; this validator performs no network/model
 * request and does not treat the executor's attestation as platform proof. */
export type HotPublicRead = {
 url:string;title:string;published_at:string|null;category:string|null;
 method:'indexed_search'|'public_web_read'|'public_browser';observed_at:string;
 visible_text:string;body:string|null;full_text_read:boolean;metric_html?:string;
};
export type HotPublicAcquisition = {queries:string[];reads:HotPublicRead[];notice:string};
const methods=['indexed_search','public_web_read','public_browser'] as const;
const fields=['reads','likes','comments'] as const;
const labels={reads:'阅读',likes:'点赞',comments:'评论'};
const emptyMetric=():HotMetric=>({value:null,evidence:null});
const normalize=(value:string)=>value.replace(/\s+/gu,' ').trim();
const compact=(value:string)=>value.replace(/\s+/gu,'');
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const entertainment=/(电影|电视剧|影视|剧集|演员|导演|艺人|明星|综艺|音乐|歌手|演唱|演出|舞台|戏曲|话剧|票房|院线|上映|剧场|文娱|娱乐)/u;
const restricted=/(登录后(?:阅读|查看)|(?:请|需要|必须)登录|验证码|人机验证|安全验证|请完成验证|付费(?:阅读|解锁)|订阅后(?:阅读|查看)|阅读全文|展开全文|内容节选|(?:仅供|全文)预览|此为节选|剩余内容|sign\s+in\s+to\s+(?:continue|read)|subscribe\s+to\s+read|captcha|read\s+more)/iu;

function object(value:unknown,allowed:string[],name:string,optional:string[]=[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.prototype.toString.call(value)!=='[object Object]')throw Error(`${name}必须为普通对象`);
 const proto=Object.getPrototypeOf(value),constructor=proto===null?null:Object.getOwnPropertyDescriptor(proto,'constructor')?.value;
 // A different realm has a different Object.prototype identity. Check its
 // shape/native constructor instead, while still rejecting class instances.
 if(proto!==null&&(Object.getPrototypeOf(proto)!==null||typeof constructor!=='function'||Function.prototype.toString.call(constructor)!==Function.prototype.toString.call(Object)))throw Error(`${name}必须为普通对象`);
 const data=value as Record<string,unknown>;
 if(Object.keys(data).some(key=>!allowed.includes(key))||allowed.some(key=>!optional.includes(key)&&!Object.prototype.hasOwnProperty.call(data,key)))throw Error(`${name}字段不完整或含未支持字段`);
 return data;
}
function text(value:unknown,max:number,name:string,allowEmpty=false):string{
 if(typeof value!=='string'||value.length>max||(!allowEmpty&&!value.trim()))throw Error(`${name}无效或超出范围`);
 return value;
}
function timestamp(value:unknown,name:string):{iso:string;time:number}{
 if(typeof value!=='string')throw Error(`${name}无效`);
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
 if(!match)throw Error(`${name}必须为带时区的完整时间`);
 const [,year,month,day,hour,minute,second,zone,,offsetHour,offsetMinute]=match;
 const days=new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
 if(Number(month)<1||Number(month)>12||Number(day)<1||Number(day)>days||Number(hour)>23||Number(minute)>59||Number(second)>59||(zone!=='Z'&&(Number(offsetHour)>14||Number(offsetMinute)>59||(Number(offsetHour)===14&&Number(offsetMinute)!==0))))throw Error(`${name}无效`);
 const time=Date.parse(value);if(!Number.isFinite(time))throw Error(`${name}无效`);
 return {iso:new Date(time).toISOString(),time};
}
/** Whole-page text can contain recommendation counters. Only original public
 * HTML with article-identity-bound JSON-LD establishes metrics here. Missing
 * HTML or unsupported layouts remain null; callers must never fabricate HTML. */
async function articleMetrics(read:HotPublicRead):Promise<Pick<HotArticle,'reads'|'likes'|'comments'>> {
 const empty={reads:emptyMetric(),likes:emptyMetric(),comments:emptyMetric()};
 if(read.method==='indexed_search'||!read.metric_html||restricted.test(read.metric_html))return empty;
 const parsed=await parsePublicArticle(read.metric_html,read.url,read.observed_at);
 if(normalize(parsed.title)!==normalize(read.title))return empty;
 return {reads:parsed.reads,likes:parsed.likes,comments:parsed.comments};
}

export async function validateHotPublicAcquisition(value:unknown,stamp:string,claimStartedAt=stamp):Promise<HotCollection>{
 const now=timestamp(stamp,'采集时间');
 // The current claim starts at the server-held batch.updated timestamp. Keep
 // the existing five-minute clock tolerance, with a maximum 20-minute age
 // even if a caller supplies an older claim start. Publication age is separate.
 const observationStart=Math.max(timestamp(claimStartedAt,'公开采集认领时间').time,now.time-15*60000)-300000;
 const data=object(value,['queries','reads','notice'],'公开采集结果');
 if(!Array.isArray(data.queries)||data.queries.length>4||!Array.isArray(data.reads)||data.reads.length>12)throw Error('公开采集最多四条查询和十二个文章读取结果');
 const queries=data.queries.map(query=>text(query,500,'公开查询'));
 if(new Set(queries).size!==queries.length)throw Error('公开查询不能重复');
 const notice=text(data.notice,2000,'采集说明');
 const serialized=JSON.stringify(value);if(new TextEncoder().encode(serialized).byteLength>100000)throw Error('公开采集证据超过100KB');
 const urls=new Set<string>();
 const reads=data.reads.map((value):HotPublicRead=>{
  const read=object(value,['url','title','published_at','category','method','observed_at','visible_text','body','full_text_read','metric_html'],'公开文章读取',['metric_html']);
  const url=text(read.url,3000,'文章链接'),canonical=publicArticleURL(url);
  if(!canonical||canonical!==url)throw Error('只接受规范的今日头条公开文章链接');
  if(urls.has(url))throw Error('文章链接不能重复');urls.add(url);
  const title=text(read.title,300,'文章标题'),visible_text=text(read.visible_text,150000,'公开可见文本');
  if(!normalize(visible_text).includes(normalize(title)))throw Error('文章标题不在实际公开可见文本中');
  const observed=timestamp(read.observed_at,'观察时间');if(observed.time>now.time+300000)throw Error('观察时间不能超出采集时钟五分钟');
  const published=read.published_at===null?null:timestamp(read.published_at,'发布时间');if(published&&published.time>now.time)throw Error('文章发布时间不能在采集时钟之后');
  const category=read.category===null?null:text(read.category,100,'文章分类');
  if(typeof read.method!=='string'||!methods.includes(read.method as HotPublicRead['method']))throw Error('不支持的公开采集方式');
  if(typeof read.full_text_read!=='boolean')throw Error('必须明确是否实际读到全文');
  const body=read.body===null?null:text(read.body,30000,'公开正文',true);
  const metric_html=read.metric_html===undefined?undefined:text(read.metric_html,90000,'公开原始指标HTML',true);
  return {url,title,published_at:published?.iso??null,category,method:read.method as HotPublicRead['method'],observed_at:observed.iso,visible_text,body,full_text_read:read.full_text_read,...(metric_html===undefined?{}:{metric_html})};
 });
 const qualified:HotArticle[]=[],leads:HotArticle[]=[];
 const observations:HotCollection['observations']=[];
 const metricPresence={reads:0,likes:0,comments:0};
 let sourceVerified=0,excluded=0;
 for(const read of reads){
  const reasons:string[]=[];
  const indexed=read.method==='indexed_search',sourceBody=read.body??'',fresh=Date.parse(read.observed_at)>=observationStart;
  const bodyBound=!!sourceBody&&compact(read.visible_text).includes(compact(sourceBody));
  const limited=restricted.test(read.visible_text)||/[.…]{3,}$|…$/u.test(sourceBody.trim());
  const full=fresh&&!indexed&&read.full_text_read&&sourceBody.length>=100&&sourceBody.length<=30000&&bodyBound&&!limited;
  const metrics=fresh?await articleMetrics(read):{reads:emptyMetric(),likes:emptyMetric(),comments:emptyMetric()},count=fields.filter(field=>metrics[field].value!==null).length;
  for(const field of fields)if(metrics[field].value!==null)metricPresence[field]++;
  const entertainmentEvidence=entertainment.test(`${read.title}\n${full?sourceBody:read.visible_text}`);
  if(!fresh)reasons.push('观察时间早于本次公开采集认领窗口，仅保留未核验线索，正文与当前热度尚未核验');
  if(indexed)reasons.push('仅取得搜索索引线索，尚未核验当前文章页与全文');
  else if(!full){if(limited)reasons.push('公开页面带有访问限制或节选标记');else if(read.full_text_read&&sourceBody&&!bodyBound)reasons.push('所称正文无法与实际可见文本绑定');else reasons.push('尚未读到可绑定的完整公开正文');}
  if(!entertainmentEvidence)reasons.push('实际标题与内容尚未确认属于文娱');
  if(!read.published_at)reasons.push('缺少可核验发布时间');
  const readGate=hotReadEligibilityReason({url:read.url,reads:metrics.reads});if(readGate)reasons.push(readGate);
  const article:HotArticle={
   id:read.url.split('/')[4],url:read.url,title:read.title,published_at:read.published_at,collected_at:now.iso,
   category:read.category,...metrics,body_state:full?'readable_full':'unreadable',
   body_evidence:full?{kind:'authenticated_public_read',url:read.url,observed_at:read.observed_at}:null,
   body_sha256:full?await digest(sourceBody):null,body:full?sourceBody:'',exclusion:reasons.length?reasons.join('；'):null,
   acquisition:{method:read.method,source_content_sha256:await digest(read.visible_text),...(read.metric_html?{metric_source_sha256:await digest(read.metric_html)}:{}),verification:'authenticated_collection_executor_attested_not_platform_verified'},
   heat_state:count>=2?'multi_metric':count===1?'partial_metric':'unverified',
  };
  if(fresh&&!indexed)sourceVerified++;
  if(!entertainmentEvidence)excluded++;else if(!reasons.length)qualified.push(article);else leads.push(article);
  observations.push({url:read.url,status:null,outcome:article.exclusion??'已取得真实公开正文与本篇可核验阅读至少10万'});
 }
 const articles=sortPublicArticles(qualified);
 const visibleLeads=leads.sort((a,b)=>(Date.parse(b.published_at??'')||0)-(Date.parse(a.published_at??'')||0)||a.url.localeCompare(b.url)).slice(0,5-articles.length);
 const methodCounts=methods.map(method=>`${method} ${reads.filter(read=>read.method===method).length}篇`).join('，');
 const missing=Object.fromEntries(fields.map(field=>[labels[field],reads.length-metricPresence[field]]));
 return {
  version:'hot-article-public-1',status:articles.length?'ready':'insufficient',collected_at:now.iso,source_url:'https://www.toutiao.com/',
  coverage:`认证公开采集执行器本次实际提交${reads.length}个今日头条文章链接（${methodCounts}）；${sourceVerified}个公开页面读查；实际查询${queries.length}条：${queries.length?queries.join('；'):'未执行搜索查询'}。仅覆盖这些公开样本，保留旧发布日期文章，不代表全站最热门或前五。`,
  sorting_basis:articles.length?hotArticleRankingBasis(articles):'没有取得同时具备可绑定完整正文、文娱证据、发布时间和本篇可核验阅读至少10万的文章，未进行热度排序。',
  articles,leads:visibleLeads,acquisition_needed:!articles.length,observations,
  notice:`${notice} 本次${qualified.length}篇达到本篇阅读10万门槛的合格文章、${leads.length}篇未核验或资料不全文娱线索、${excluded}篇未确认文娱内容已排除，页面合计最多展示5篇。按全部${reads.length}篇实际读取结果统计指标缺失并保留null（阅读${missing.阅读}篇、点赞${missing.点赞}篇、评论${missing.评论}篇）；0为实际零值。搜索索引仅为线索；执行器身份仅认证采集声明，并非平台签名或平台热榜证明。`,
 };
}
