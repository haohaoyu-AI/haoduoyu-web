/** Anonymous, bounded public HTML collection. No topic-board, hidden API,
 * cookies, script execution, retries, login or challenge handling. */
export type HotMetric = {value:number|null; evidence:{url:string;observed_at:string;label:string}|null};
export type HotDiagnosticState = 'not_run'|'passed'|'failed';
export type HotDiagnosticStage = 'network'|'http'|'body_load'|'public_access'|'link_discovery'|'jsonld'|'identity'|'body_consistency'|'full_text'|'title'|'date'|'category'|'metrics'|'qualification';
type MetricField = 'reads'|'likes'|'comments';
type MetricDiagnostic = {state:'not_run'|'absent_in_supported_metadata'|'invalid_count'|'verified';recognized_count:number;invalid_count:number};
/** Diagnostic counts/hashes describe this supported parser, not everything on
 * the public page. No original full text or arbitrary error/URL payload is logged. */
export type HotPublicDiagnostics = {
 version:'hot-article-diagnostics-1';stages:Record<HotDiagnosticStage,HotDiagnosticState>;rejection_reasons:string[];
 transport:{http_status:number|null;response_bytes:number|null;html_sha256:string|null;failure_code:string|null};
 links:{href_count:number;supported_unique_count:number;scanned_count:number}|null;
 jsonld:{evaluation_scope:'until_first_public_match_per_script';script_count:number;parse_error_count:number;article_node_count:number;identity_match_count:number;public_node_count:number;identity_missing_count:number;identity_mismatch_count:number;identity_url_unsupported_count:number;access_not_public_count:number};
 body:{structured_chars:number|null;structured_sha256:string|null;visible_article_count:number;visible_sample_count:number;visible_paragraph_counts:number[];visible_chars:number[];visible_sha256:string[];consistent:boolean|null;length_accepted:boolean|null;restricted_or_preview_marker:boolean|null};
 metrics:{public_metric_count:number|null;fields:Record<MetricField,MetricDiagnostic>};
};
export type HotArticle = {id:string;url:string;title:string;published_at:string|null;collected_at:string;category:string|null;reads:HotMetric;likes:HotMetric;comments:HotMetric;body_state:'readable_full'|'unreadable';body_evidence:{kind:'identity_bound_public_dom_and_jsonld'|'authenticated_public_read';url:string;observed_at:string}|null;body_sha256:string|null;body:string;exclusion:string|null;heat_state?:'multi_metric'|'partial_metric'|'unverified';acquisition?:{method:'indexed_search'|'public_web_read'|'public_browser';source_content_sha256:string;metric_source_sha256?:string;verification:'authenticated_collection_executor_attested_not_platform_verified'};diagnostics?:HotPublicDiagnostics};
export type HotCollection = {version:'hot-article-public-1';status:'ready'|'insufficient'|'blocked';collected_at:string;source_url:string;coverage:string;sorting_basis:string;articles:HotArticle[];leads?:HotArticle[];acquisition_needed?:boolean;observations:{url:string;status:number|null;outcome:string;diagnostics?:HotPublicDiagnostics}[];notice:string};
const home='https://www.toutiao.com/';
const metric=():HotMetric=>({value:null,evidence:null});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export function publicArticleURL(value:string):string|null {try{const u=new URL(value,home);return u.protocol==='https:'&&u.hostname==='www.toutiao.com'&&!u.username&&!u.password&&!u.port&&/^\/article\/\d{10,24}\/?$/.test(u.pathname)&&!u.search&&!u.hash?`https://www.toutiao.com/article/${u.pathname.split('/')[2]}/`:null;}catch{return null;}}
/** Owner-required minimum. Measured likes/comments never substitute for reads. */
export const hotReadMinimum=100000;
type ReadGateArticle=Pick<HotArticle,'url'|'reads'>;
export function hotReadEligibilityReason(article:ReadGateArticle):string|null {
 if(!article||!article.reads||typeof article.url!=='string')return '未取得本篇可核验阅读数，仅保留线索';
 const {value,evidence}=article.reads;
 if(value===null)return '未取得本篇可核验阅读数，仅保留线索';
 if(!Number.isSafeInteger(value)||value<0||!evidence||publicArticleURL(article.url)!==article.url||evidence.url!==article.url||!Number.isFinite(Date.parse(evidence.observed_at))||evidence.label!==`JSON-LD ViewAction userInteractionCount=${value}`)return '阅读数缺少本篇身份绑定的公开来源证据，仅保留线索';
 if(value<hotReadMinimum)return '本篇阅读数不足10万，仅保留线索';
 return null;
}
export function isHighReadHotArticle(article:Pick<HotArticle,'url'|'reads'|'body_state'|'exclusion'>):boolean {
 return !!article&&article.body_state==='readable_full'&&!article.exclusion&&hotReadEligibilityReason(article)===null;
}
export function shanghaiDate(value:string){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}
function plain(value:string){return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|#160);/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();}
function date(value:unknown):string|null {if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T|\s)/.test(value))return null;const parsed=Date.parse(value);return Number.isFinite(parsed)?new Date(parsed).toISOString():null;}
function objects(value:unknown):Record<string,unknown>[] {if(Array.isArray(value))return value.flatMap(objects);if(!value||typeof value!=='object')return [];const v=value as Record<string,unknown>;return [v,...objects(v['@graph'])];}
export function diagnostics():HotPublicDiagnostics {
 const field=():MetricDiagnostic=>({state:'not_run',recognized_count:0,invalid_count:0});
 return {version:'hot-article-diagnostics-1',stages:{network:'not_run',http:'not_run',body_load:'not_run',public_access:'not_run',link_discovery:'not_run',jsonld:'not_run',identity:'not_run',body_consistency:'not_run',full_text:'not_run',title:'not_run',date:'not_run',category:'not_run',metrics:'not_run',qualification:'not_run'},rejection_reasons:[],transport:{http_status:null,response_bytes:null,html_sha256:null,failure_code:null},links:null,jsonld:{evaluation_scope:'until_first_public_match_per_script',script_count:0,parse_error_count:0,article_node_count:0,identity_match_count:0,public_node_count:0,identity_missing_count:0,identity_mismatch_count:0,identity_url_unsupported_count:0,access_not_public_count:0},body:{structured_chars:null,structured_sha256:null,visible_article_count:0,visible_sample_count:0,visible_paragraph_counts:[],visible_chars:[],visible_sha256:[],consistent:null,length_accepted:null,restricted_or_preview_marker:null},metrics:{public_metric_count:null,fields:{reads:field(),likes:field(),comments:field()}}};
}
function reject(diag:HotPublicDiagnostics,reason:string){if(!diag.rejection_reasons.includes(reason))diag.rejection_reasons.push(reason);}
/** Only complete public NewsArticle/Article JSON-LD body is accepted. Search
 * snippets/abstracts/DOM previews are deliberately not full-text substitutes. */
export async function parsePublicArticle(html:string,url:string,collected_at:string,diag:HotPublicDiagnostics=diagnostics()):Promise<HotArticle> {
 const canonical=publicArticleURL(url);if(!canonical)throw Error('invalid_article_url');
 const article:HotArticle={id:canonical.split('/')[4],url:canonical,title:'',published_at:null,collected_at,category:null,reads:metric(),likes:metric(),comments:metric(),body_state:'unreadable',body_evidence:null,body_sha256:null,body:'',exclusion:'没有读到可确认完整的公开正文',diagnostics:diag};
 diag.transport.html_sha256??=await digest(html);
 const visible=[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(match=>[...match[1].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(p=>plain(p[1])));
 const visibleText=visible.map(paragraphs=>paragraphs.join(' '));
 diag.body.visible_article_count=visible.length;diag.body.visible_sample_count=Math.min(visible.length,20);diag.body.visible_paragraph_counts=visible.slice(0,20).map(p=>p.length);diag.body.visible_chars=visibleText.slice(0,20).map(text=>text.length);diag.body.visible_sha256=await Promise.all(visibleText.slice(0,20).map(digest));
 const metricValues:Record<MetricField,Set<number>>={reads:new Set(),likes:new Set(),comments:new Set()};
 const identityFailures=new Set<string>();let finalBodyReasons:string[]=[];
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  diag.jsonld.script_count++;
  let parsed:unknown;try{parsed=JSON.parse(match[1]);}catch{diag.jsonld.parse_error_count++;continue;}
  for(const data of objects(parsed)) {
   const kinds=Array.isArray(data['@type'])?data['@type']:[data['@type']];if(!kinds.some(x=>['NewsArticle','Article','BlogPosting'].includes(String(x))))continue;
   diag.jsonld.article_node_count++;
   const entry=typeof data.mainEntityOfPage==='object'&&data.mainEntityOfPage?data.mainEntityOfPage as Record<string,unknown>:null;
   const identified=data.url??entry?.['@id']??(typeof data.mainEntityOfPage==='string'?data.mainEntityOfPage:undefined);
   if(!identified){diag.jsonld.identity_missing_count++;identityFailures.add('identity_missing');continue;}
   const identifiedURL=publicArticleURL(String(identified));
   if(!identifiedURL){diag.jsonld.identity_url_unsupported_count++;identityFailures.add('identity_url_unsupported');continue;}
   if(identifiedURL!==canonical){diag.jsonld.identity_mismatch_count++;identityFailures.add('identity_mismatch');continue;}
   diag.jsonld.identity_match_count++;
   if(data.isAccessibleForFree===false||JSON.stringify(data.hasPart??{}).includes('"isAccessibleForFree":false')){diag.jsonld.access_not_public_count++;identityFailures.add('access_not_public');continue;}
   diag.jsonld.public_node_count++;
   article.title=typeof data.headline==='string'?plain(data.headline).slice(0,300):'';
   article.published_at=date(data.datePublished);article.category=typeof data.articleSection==='string'?plain(data.articleSection).slice(0,100):null;
   const body=typeof data.articleBody==='string'?plain(data.articleBody):'';
   const complete=visibleText.some(text=>text.replace(/\s/g,'')===body.replace(/\s/g,''));
   const lengthAccepted=body.length>=600&&body.length<=30000,preview=/(阅读全文|展开全文|登录后阅读|请登录|验证码|内容节选|仅供预览|\.\.\.$|…$)/.test(body.slice(-150));
   const accepted=lengthAccepted&&complete&&!preview;
   // Keep the same accepted-body behavior across multiple scripts. Diagnostics
   // describe the retained body when accepted, otherwise the last evaluated body.
   if(accepted||article.body_state!=='readable_full'){
    diag.body.structured_chars=body.length;diag.body.structured_sha256=body?await digest(body):null;diag.body.consistent=complete;diag.body.length_accepted=lengthAccepted;diag.body.restricted_or_preview_marker=preview;
    finalBodyReasons=[];if(!body)finalBodyReasons.push('body_missing');if(!lengthAccepted)finalBodyReasons.push('body_length_unsupported');if(!visible.length||!visible.some(p=>p.length))finalBodyReasons.push('unsupported_visible_dom');else if(!complete)finalBodyReasons.push('body_mismatch');if(preview)finalBodyReasons.push('body_preview_marker');
   }
   if(accepted) {article.body=body;article.body_state='readable_full';article.body_evidence={kind:'identity_bound_public_dom_and_jsonld',url:canonical,observed_at:collected_at};article.body_sha256=await digest(body);article.exclusion=null;}
   for(const stat of objects(data.interactionStatistic)) {
    const type=typeof stat.interactionType==='object'&&stat.interactionType?(stat.interactionType as Record<string,unknown>)['@type']:stat.interactionType;
    const kind=typeof type==='string'&&/^(?:(?:https?:\/\/schema\.org[\/#])?)(ViewAction|LikeAction|CommentAction)$/.test(type)?type.split(/[\/#]/).at(-1):null;const field=kind==='ViewAction'?'reads':kind==='LikeAction'?'likes':kind==='CommentAction'?'comments':null;
    const count=stat.userInteractionCount;if(field){const info=diag.metrics.fields[field];info.recognized_count++;if(typeof count==='number'&&Number.isSafeInteger(count)&&count>=0){metricValues[field].add(count);}else{info.invalid_count++;}}
   }
   break;
  }
 }
 for(const field of ['reads','likes','comments'] as const){
  const info=diag.metrics.fields[field],values=metricValues[field];
  if(values.size===1&&!info.invalid_count){const count=[...values][0],kind=field==='reads'?'ViewAction':field==='likes'?'LikeAction':'CommentAction';article[field]={value:count,evidence:{url:canonical,observed_at:collected_at,label:`JSON-LD ${kind} userInteractionCount=${count}`}};info.state='verified';}
  else if(info.recognized_count)info.state='invalid_count';
 }
 diag.stages.jsonld=diag.jsonld.article_node_count?'passed':'failed';
 if(!diag.jsonld.script_count)reject(diag,'jsonld_absent');
 else if(!diag.jsonld.article_node_count){if(diag.jsonld.parse_error_count)reject(diag,'jsonld_parse_error');reject(diag,'article_jsonld_absent');}
 if(diag.jsonld.article_node_count){diag.stages.identity=diag.jsonld.public_node_count?'passed':'failed';if(!diag.jsonld.public_node_count)for(const reason of identityFailures)reject(diag,reason);}
 const evaluated=diag.jsonld.public_node_count>0;
 if(evaluated){
  diag.stages.body_consistency=diag.body.consistent?'passed':'failed';diag.stages.full_text=article.body_state==='readable_full'?'passed':'failed';
  if(article.body_state!=='readable_full')for(const reason of finalBodyReasons)reject(diag,reason);
  diag.stages.title=article.title?'passed':'failed';diag.stages.date=article.published_at&&Date.parse(article.published_at)<=Date.parse(collected_at)+300000?'passed':'failed';
  diag.stages.category=article.category&&/(娱乐|影视|电影|电视剧|文娱|明星|entertainment)/i.test(article.category)?'passed':'failed';
  diag.metrics.public_metric_count=[article.reads,article.likes,article.comments].filter(x=>x.value!==null).length;
  diag.stages.metrics=diag.metrics.public_metric_count>0?'passed':'failed';
  for(const field of ['reads','likes','comments'] as const)if(diag.metrics.fields[field].state==='not_run')diag.metrics.fields[field].state='absent_in_supported_metadata';
 }
 // Retain the legacy single exclusion/outcome for older consumers, while every
 // failed qualification gate is preserved in the additive reason array.
 if(!article.title)reject(diag,evaluated?'title_missing':'title_unverified');
 if(!article.published_at)reject(diag,evaluated?'published_at_missing_or_invalid':'published_at_unverified');
 else if(Date.parse(article.published_at)>Date.parse(collected_at)+300000)reject(diag,'future_publication_unverified');
 if(!article.category||!/(娱乐|影视|电影|电视剧|文娱|明星|entertainment)/i.test(article.category))reject(diag,'entertainment_category_unverified');
 const measured=[article.reads,article.likes,article.comments].filter(x=>x.value!==null).length;article.heat_state=measured>=2?'multi_metric':measured?'partial_metric':'unverified';if(!measured)reject(diag,evaluated?'public_metrics_unavailable':'public_metrics_unverified');if(hotReadEligibilityReason(article))reject(diag,article.reads.value===null?'article_read_count_unverified':'article_read_threshold_not_met');
 if(article.body_state!=='readable_full')reject(diag,'body_unverified');
 if(!article.title)article.exclusion='缺少可核验文章标题';
 if(!article.published_at)article.exclusion='缺少可核验发布时间';
 else if(Date.parse(article.published_at)>Date.parse(collected_at)+300000)article.exclusion='发表时间晚于本次采集，尚未核验';
 if(!article.category||!/(娱乐|影视|电影|电视剧|文娱|明星|entertainment)/i.test(article.category))article.exclusion='来源未确认文章属于文娱分类';
 const readGate=hotReadEligibilityReason(article);if(readGate)article.exclusion=readGate;
 if(article.body_state!=='readable_full')article.exclusion='没有读到可确认完整的公开正文';
 diag.stages.qualification=article.exclusion?'failed':'passed';
 return article;
}
export function discoverPublicArticleLinks(html:string):string[]{return [...new Set([...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].map(m=>publicArticleURL(m[1])).filter((x):x is string=>!!x))].slice(0,12);}
const rankingFields = ['reads','likes','comments'] as const;
function rankingDimensions(items:HotArticle[]) {
 const shared = rankingFields.filter(field => items.length > 0 && items.every(item => item[field].value !== null));
 return shared.length >= 2 ? shared : rankingFields.filter(field => items.some(item => item[field].value !== null));
}
export function hotArticleRankingBasis(items:HotArticle[]) {
 const labels = {reads:'阅读',likes:'点赞',comments:'评论'}, fields = rankingDimensions(items);
 if (!items.length) return '未取得可按文章指标排序的样本；真实文章仍可显示为未核验线索，缺失指标保留null。今日头条是平台名，不限定今天发表。';
 if(!fields.length)return '所有文章指标均缺失，未进行热度排序；仅按链接稳定展示未核验线索，缺失不是0。';
 const shared = fields.every(field => items.every(item => item[field].value !== null));
 return `${fields.length===1?'仅取得单项文章指标，尚不能做多维比较。':''}${shared?'按全部候选共同可见的':'候选没有两项共同可见指标，按实际取得的'}${fields.map(field=>labels[field]).join('、')}等权评分。每项使用log(1+指标值)并除以本批次该项最大值的log(1+值)，再取平均；缺失项仅不贡献评分，原始指标仍为null。${shared?'':'不同候选的指标覆盖不齐，排序可比性有限。'}同分按已取得的指标种类数、文章链接稳定排序。仅为达到本篇可核验阅读10万门槛的公开样本排序，不代表全站前五。`;
}
export function sortPublicArticles(items:HotArticle[]) {
 const fields = rankingDimensions(items);
 const maximum = Object.fromEntries(fields.map(field => [field, Math.max(0,...items.map(item => Math.log1p(item[field].value ?? 0)))]));
 const score = (item:HotArticle) => fields.reduce((sum,field) => {
  const value = item[field].value, max = maximum[field];
  return sum + (value === null || !max ? 0 : Math.log1p(value) / max);
 },0) / Math.max(1,fields.length);
 const observed = (item:HotArticle) => rankingFields.filter(field => item[field].value !== null).length;
 return [...items].sort((a,b) => score(b)-score(a) || observed(b)-observed(a) || a.url.localeCompare(b.url)).slice(0,5);
}
function errorInfo(error:unknown):{message:string;name:string;status:number|null;code:unknown;cause_code:unknown}{
 const e=error&&typeof error==='object'?error as Record<string,unknown>:{};
 const cause=e.cause&&typeof e.cause==='object'?e.cause as Record<string,unknown>:{};
 return {message:typeof e.message==='string'?e.message:'',name:typeof e.name==='string'?e.name:'',status:typeof e.status==='number'?e.status:null,code:e.code,cause_code:cause.code};
}
function transportFailure(error:unknown,phase:'fetch'|'body',batchSignal:AbortSignal,signal:AbortSignal){
 const e=errorInfo(error);if(batchSignal.aborted)return 'batch_timeout';
 if(signal.aborted||e.name==='TimeoutError'||e.name==='AbortError')return phase==='fetch'?'fetch_timeout':'body_timeout';
 if([e.code,e.cause_code].some(code=>['EACCES','EPERM','WSAEACCES',10013,'10013'].includes(code as string|number)))return 'socket_permission';
 return phase==='fetch'?'network_unavailable':'body_read_error';
}
export async function publicHTML(url:string,fetcher:typeof fetch,batchSignal:AbortSignal,diag:HotPublicDiagnostics){
 const signal=AbortSignal.any([batchSignal,AbortSignal.timeout(12000)]);let phase:'fetch'|'body'='fetch';
 try{
  const response=await fetcher(url,{redirect:'manual',credentials:'omit',headers:{Accept:'text/html'},signal});
  diag.stages.network='passed';diag.transport.http_status=response.status;diag.stages.http=response.ok?'passed':'failed';
  if(!response.ok){
   const reason=[401,403,429].includes(response.status)?'access_restricted':response.status>=300&&response.status<400?'redirect_unverified':'http_error';
   diag.transport.failure_code=reason;reject(diag,reason);
   // A failed cleanup must not erase a known access restriction or HTTP result.
   try{await response.body?.cancel();}catch{/* preserve the known HTTP failure */}
   throw Object.assign(Error(reason),{status:response.status});
  }
  phase='body';const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('text/html')){diag.stages.body_load='failed';diag.transport.failure_code='not_public_html';reject(diag,'not_public_html');try{await response.body?.cancel();}catch{/* preserve the content-type failure */}throw Object.assign(Error('not_public_html'),{status:response.status});}
  const reader=response.body?.getReader();if(!reader){diag.stages.body_load='failed';diag.transport.failure_code='empty_response';reject(diag,'empty_response');throw Error('empty_response');}
  let bytes=0;const chunks:Uint8Array[]=[];diag.transport.response_bytes=0;
  try{for(;;){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.length;diag.transport.response_bytes=bytes;if(bytes>1500000){diag.transport.failure_code='response_too_large';reject(diag,'response_too_large');try{await reader.cancel();}catch{/* preserve the bounded-read failure */}throw Error('response_too_large');}chunks.push(value);}}finally{reader.releaseLock();}
  const body=new Uint8Array(bytes);let at=0;for(const chunk of chunks){body.set(chunk,at);at+=chunk.length;}const html=new TextDecoder().decode(body);
  diag.stages.body_load='passed';diag.transport.html_sha256=await digest(html);
  if(/(?:captcha|verify-center|安全验证|访问频繁|请完成验证)/i.test(html)||(/<title[^>]*>[^<]*(?:登录|login)/i.test(html))){diag.stages.public_access='failed';diag.transport.failure_code='access_restricted';reject(diag,'access_restricted');throw Object.assign(Error('access_restricted'),{status:response.status});}
  diag.stages.public_access='passed';return {html,status:response.status};
 }catch(error){
  if(diag.stages.network==='not_run')diag.stages.network='failed';
  else if(phase==='body'&&diag.stages.body_load==='not_run')diag.stages.body_load='failed';
  const reason=diag.transport.failure_code??transportFailure(error,phase,batchSignal,signal);diag.transport.failure_code=reason;reject(diag,reason);throw error;
 }
}
export async function collectPublicHotArticles(fetcher:typeof fetch=fetch,stamp=new Date().toISOString()):Promise<HotCollection>{
 const batchSignal=AbortSignal.timeout(45000);
 const homeDiagnostics=diagnostics();
 const result:HotCollection={version:'hot-article-public-1',status:'insufficient',collected_at:stamp,source_url:home,coverage:'仅正常公开首页实际链接中的文娱文章样本，最多检查12篇；不限今日发表，不是全站绝对最热榜。',sorting_basis:hotArticleRankingBasis([]),articles:[],leads:[],acquisition_needed:false,observations:[],notice:''};
 try{
  const page=await publicHTML(home,fetcher,batchSignal,homeDiagnostics);result.observations.push({url:home,status:page.status,outcome:'public_html',diagnostics:homeDiagnostics});
  const links=discoverPublicArticleLinks(page.html),hrefs=[...page.html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)];homeDiagnostics.links={href_count:hrefs.length,supported_unique_count:new Set(hrefs.map(m=>publicArticleURL(m[1])).filter(Boolean)).size,scanned_count:links.length};homeDiagnostics.stages.link_discovery=links.length?'passed':'failed';
  if(!links.length){reject(homeDiagnostics,'no_supported_article_links');if(/(?:JavaScript required|需要允许本站执行\s*JavaScript)/i.test(page.html))reject(homeDiagnostics,'js_shell');result.acquisition_needed=true;result.notice='公开首页没有可确认的文章链接，需由正常公开搜索与阅读执行器在本批次补充；没有猜测接口或补造榜单。';}
  for(const url of links){
   if(batchSignal.aborted){result.notice='本批次45秒采集窗口结束，仅保留已核验公开样本。';break;}
   const articleDiagnostics=diagnostics();let parsing=false;
   try{const page=await publicHTML(url,fetcher,batchSignal,articleDiagnostics);parsing=true;const article=await parsePublicArticle(page.html,url,stamp,articleDiagnostics);result.observations.push({url,status:page.status,outcome:article.exclusion??'qualified',diagnostics:articleDiagnostics});if(!article.exclusion)result.articles.push(article);else if(article.title&&article.diagnostics?.jsonld.public_node_count&&article.diagnostics.stages.category==='passed'){result.leads!.push(article);result.acquisition_needed=true;}}
   catch(error){const e=errorInfo(error);if(parsing){articleDiagnostics.stages.qualification='failed';reject(articleDiagnostics,'parser_error');}result.observations.push({url,status:e.status,outcome:['access_restricted','redirect_unverified','http_error','not_public_html','response_too_large','empty_response'].includes(e.message)?e.message:'network_unavailable',diagnostics:articleDiagnostics});if(e.message==='access_restricted'){result.status='blocked';result.notice='公开访问受限，已停止本批次采集。';break;}}
  }
 }catch(error){const e=errorInfo(error);result.status='blocked';result.observations.push({url:home,status:e.status,outcome:e.message==='access_restricted'?'access_restricted':'public_access_unavailable',diagnostics:homeDiagnostics});result.notice='公开来源当前无法正常读取，未取得真实精选。';}
 const inspected=result.observations.filter(item=>item.url!==home).length,qualified=result.articles.length;result.sorting_basis=hotArticleRankingBasis(result.articles);result.articles=sortPublicArticles(result.articles);result.leads=result.leads!.sort((a,b)=>a.url.localeCompare(b.url)).slice(0,5-result.articles.length);result.coverage=`仅正常公开首页实际发现的文章链接；本批次实际检查${inspected}篇，其中${qualified}篇取得文娱完整正文与本篇可核验阅读至少10万，另展示${result.leads.length}篇未核验线索，合计最多5篇。不限今日发表；采样上限12篇、总窗口45秒，不代表全站最热榜。`;if(result.status!=='blocked'&&result.articles.length)result.status='ready';if(result.status==='blocked')result.acquisition_needed=false;else if(!result.articles.length)result.acquisition_needed=true;if(!result.notice)result.notice=`取得${result.articles.length}篇可排序公开样本和${result.leads.length}篇未核验线索；没有补造文章或缺失指标。`;return result;
}
