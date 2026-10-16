/** Free discovery only. Card evidence does not authorize writing or attest full text. */
import {diagnostics,publicHTML,publicArticleURL} from './hot-article-public';
import {parse as parseHTML} from 'parse5';
import type {DefaultTreeAdapterMap} from 'parse5';
import type {ResponseDiagnosticSummary} from './hot-response-diagnostics';
import {entertainmentArticleTitle} from './hot-article-genre';

export type BenchmarkAccount={id:string;name:string;url:string;created:string};
export type CardMetric={display:string|null;exact:number|null;lower_bound:number|null;upper_bound:number|null};
export type DiscoveryArticle={id:string;url:string;title:string;account_id:string;published_at:string;reads:CardMetric;likes:CardMetric;comments:CardMetric;evidence:{account_url:string;article_url:string;observed_at:string;page_sha256:string;card_sha256:string;card_html:string;date_display:string;date_precision:'day'|'minute'|'second';method:'public_account_card'}};
export type AccountObservation={account_id:string;url:string;outcome:'checked'|'unverifiable'|'blocked'|'unavailable'|'not_scanned';http_status:number|null;page_sha256:string|null;cards:number;qualified:number;reason:string;failure_code?:string|null;response_diagnostic?:ResponseDiagnosticSummary};
export type DiscoveryResult={version:'hot-account-discovery-1';status:'ready'|'empty'|'incomplete'|'blocked';observed_at:string;articles:DiscoveryArticle[];observations:AccountObservation[]};
export const accountLimit=10;
export function publicAccountURL(value:string):string|null{
 try{const u=new URL(value);if(u.protocol!=='https:'||!['www.toutiao.com','toutiao.com'].includes(u.hostname)||u.username||u.password||u.port||u.hash)return null;
  if(!/^\/(?:c\/user|user)\/(?:token\/[A-Za-z0-9_-]{16,200}|\d{5,24})\/?$/.test(u.pathname))return null;
  if([...u.searchParams.keys()].some(key=>!['source','entrance_gid'].includes(key)))return null;
  return `https://www.toutiao.com${u.pathname.replace(/^\/user\//,'/c/user/').replace(/\/?$/,'/')}`;
 }catch{return null;}
}
export function accountInput(value:unknown){
 const v=value as Record<string,unknown>;if(!v||typeof v.name!=='string'||typeof v.url!=='string')throw Error('请填写账号名称和公开主页链接');
 const name=v.name.trim(),url=publicAccountURL(v.url.trim());
 if(!name||name.length>80||/[\u0000-\u001f]/.test(name))throw Error('账号名称须为1至80字');
 if(!url)throw Error('请填写今日头条公开账号主页链接（www.toutiao.com/c/user/…）');
 return {name,url};
}
const missing=():CardMetric=>({display:null,exact:null,lower_bound:null,upper_bound:null});
/** Rounded values remain ranges, never exact integers. Around 10万 is insufficient. */
export function cardMetric(text:string,kind:'reads'|'likes'|'comments'):CardMetric{
 const labels={reads:'阅读',likes:'赞|点赞',comments:'评论'};
 const match=text.trim().match(new RegExp(`^(?:(${labels[kind]})\\s*([0-9]+(?:\\.[0-9]+)?)(万|亿)?(\\+)?|([0-9]+(?:\\.[0-9]+)?)(万|亿)?(\\+)?\\s*(${labels[kind]}))$`));
 if(!match)return missing();
 const raw=match[2]??match[5],unit=match[3]??match[6],plus=!!(match[4]??match[7]),factor=unit==='亿'?1e8:unit==='万'?1e4:1,number=Number(raw)*factor;
 if(!Number.isSafeInteger(number)||number<0||(!unit&&raw.includes('.')))return missing();
 const step=factor/10**(raw.split('.')[1]?.length??0);
 // One full displayed unit on either side covers ordinary round/floor/ceiling
 // conventions. The platform convention itself has not been live-verified.
 if(unit){return {display:text.trim(),exact:null,lower_bound:plus?number:Math.max(0,Math.floor(number-step)),upper_bound:plus?null:Math.ceil(number+step)};}
 return {display:text.trim(),exact:plus?null:number,lower_bound:number,upper_bound:plus?null:number};
}
type Node={tag:string;attrs:Record<string,string>;children:Node[];content:string;start:number;end:number;parent?:Node};
const inertTags=new Set(['script','style','template','textarea','title','xmp','iframe','noembed','noframes','noscript','plaintext','aside','nav','footer']);
function tree(html:string):Node{
 const document=parseHTML(html,{sourceCodeLocationInfo:true,scriptingEnabled:true});let count=0;
 function convert(source:DefaultTreeAdapterMap['node'],parent?:Node,depth=0):Node{
  if(++count>60000||depth>150)throw Error('unsupported_dom');
  const element='tagName'in source?source:null,location=source.sourceCodeLocation;
  const node:Node={tag:element?.tagName??source.nodeName,attrs:Object.fromEntries(element?.attrs.map(a=>[a.name,a.value])??[]),children:[],content:'value'in source?source.value:'',start:location?.startOffset??0,end:location?.endOffset??0,parent};
  // Raw-text/RCDATA remain text nodes in parse5; inert subtrees are excluded.
  if(!inertTags.has(node.tag)&&'childNodes'in source)node.children=source.childNodes.map(child=>convert(child,node,depth+1));
  return node;
 }
 return convert(document);
}
function hidden(n:Node):boolean{
 const closedDetailsBody=n.parent?.tag==='details'&&!('open'in n.parent.attrs)&&n!==n.parent.children.find(child=>child.tag==='summary');
 return inertTags.has(n.tag)||(n.tag==='dialog'&&!('open'in n.attrs))||closedDetailsBody||'hidden'in n.attrs||n.attrs['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs.style??'')||/(?:^|\s)(?:articleBody|description)(?:\s|$)/i.test(n.attrs.itemprop??'')||/(?:^|\s)(?:sidebar|recommendations|recommended|follow-suggestion|article-body|article-content)(?:\s|$)/.test(n.attrs.class??'')||!!(n.parent&&hidden(n.parent));
}
function descendants(n:Node):Node[]{return n.children.flatMap(c=>[c,...descendants(c)]);}
function text(n:Node):string{return [n.content,...n.children.filter(c=>!hidden(c)).map(text)].join(' ').replace(/\s+/g,' ').trim();}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
function publication(n:Node,now:number):{at:string;display:string;earliest:number;precision:'day'|'minute'|'second'}|null{
 const display=text(n),raw=n.attrs.datetime;
 if(n.tag!=='time'||!raw||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)||!display||!/\d/.test(display))return null;
 const at=Date.parse(raw);if(!Number.isFinite(at)||at>now)return null;
 // A relative date or mismatched visible absolute date cannot substantiate recency.
 const visible=display.match(/^(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
 if(!visible)return null;
 const zone=raw.endsWith('Z')?0:(raw.at(-6)==='-'?-1:1)*(Number(raw.slice(-5,-3))*60+Number(raw.slice(-2)));
 const local=new Date(at+zone*60000);
 if(local.getUTCFullYear()!==Number(visible[1])||local.getUTCMonth()+1!==Number(visible[2])||local.getUTCDate()!==Number(visible[3]))return null;
 if(visible[4]!==undefined&&(local.getUTCHours()!==Number(visible[4])||local.getUTCMinutes()!==Number(visible[5])))return null;
 if(visible[6]!==undefined&&local.getUTCSeconds()!==Number(visible[6]))return null;
 const precision=visible[6]!==undefined?'second':visible[4]!==undefined?'minute':'day';
 const earliest=precision==='day'?Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-zone*60000:precision==='minute'?Math.floor(at/60000)*60000:Math.floor(at/1000)*1000;
 return {at:new Date(earliest).toISOString(),display,earliest,precision};
}
/** Conservative DOM adapter: one article URL/title/time/read group plus a matching
 * author link inside one visible article/li in main. No body/sidebar digit scrape. */
export async function parseAccountCards(html:string,account:BenchmarkAccount,stamp:string){
 const root=tree(html),page_sha256=await hash(html),all=descendants(root);
 const cards=all.filter(n=>['li','article'].includes(n.tag)&&!hidden(n)&&(()=>{let p=n.parent;while(p){if(p.tag==='main')return true;p=p.parent;}return false;})());
 let inspected=0,verifiable=0;
 const unique=new Map<string,DiscoveryArticle>(),signatures=new Map<string,Set<string>>(),conflicts=new Set<string>();
 const remember=(url:string,fingerprint:string)=>{const seen=signatures.get(url)??new Set<string>();seen.add(fingerprint);signatures.set(url,seen);if(seen.size>1)conflicts.add(url);};
 for(const card of cards.slice(0,100)){
  const nodes=descendants(card).filter(n=>!hidden(n));
  // A wrapper without its own article URL is not a card. A nested-card
  // container with its own article URL is unsupported, never checked empty.
  if(nodes.some(n=>['li','article'].includes(n.tag))){
   const own=nodes.filter(n=>{let p=n.parent;while(p&&p!==card){if(['li','article'].includes(p.tag))return false;p=p.parent;}return true;});
   const ownURLs=[...new Set(own.filter(n=>n.tag==='a').map(n=>publicArticleURL(n.attrs.href??'')).filter((u):u is string=>u!==null))];
   if(ownURLs.length){inspected++;for(const url of ownURLs)remember(url,JSON.stringify({unsupported:'nested_article_card'}));}
   continue;
  }
  inspected++;
  const links=nodes.filter(n=>n.tag==='a'),urls=[...new Set(links.map(n=>publicArticleURL(n.attrs.href??'')).filter((u):u is string=>u!==null))];
  if(urls.length!==1){for(const url of urls)conflicts.add(url);continue;}
  const url=urls[0];
  // Only explicit author semantics bind this article. A generic user-name or
  // follow recommendation cannot establish authorship.
  const authors=nodes.filter(n=>(n.tag==='a'&&/(?:^|\s)author(?:\s|$)/.test(n.attrs.rel??''))||/(?:^|\s)author(?:\s|$)/.test(n.attrs.itemprop??''));
  // Non-link author semantics (including Person containers) are unsupported.
  // Their presence rejects the card rather than allowing a matching link to win.
  const authorURLs=authors.map(n=>n.tag==='a'?publicAccountURL(n.attrs.href??''):null);
  const titles=links.filter(n=>publicArticleURL(n.attrs.href??'')===url&&(/(?:^|\s)(?:title|article-title)(?:\s|$)/.test(n.attrs.class??'')||['h2','h3'].includes(n.parent?.tag??''))).map(text);
  const timeNodes=nodes.filter(n=>n.tag==='time'),dates=timeNodes.map(n=>publication(n,Date.parse(stamp)));
  const metricFor=(kind:'reads'|'likes'|'comments')=>{
   const values=nodes.filter(n=>{
    if(!['span','b','em','div'].includes(n.tag)||n.children.some(c=>c.tag!=='#text'))return false;
    let p:Node|undefined=n;let dedicated=false;
    while(p&&p!==card){if(['p','blockquote','h1','h2','h3','a'].includes(p.tag))return false;if(/(?:^|\s)(?:article-stats|feed-card-footer)(?:\s|$)/.test(p.attrs.class??''))dedicated=true;p=p.parent;}
    return dedicated;
   }).map(n=>cardMetric(text(n),kind)).filter(m=>m.display!==null);
   return values.length===1?values[0]:missing();
  };
  const reads=metricFor('reads'),likes=metricFor('likes'),comments=metricFor('comments');
  // Register every visible version before qualification, including low reads,
  // stale dates, invalid dates/authors and unavailable metrics.
  remember(url,JSON.stringify({titles,authorURLs,dates:timeNodes.map(n=>({raw:n.attrs.datetime,display:text(n)})),reads,likes,comments}));
  if(!authors.length||authorURLs.some(u=>u!==account.url))continue;
  if(new Set(titles).size!==1||!titles[0]||titles[0].length>300||dates.length!==1||!dates[0]||reads.lower_bound===null)continue;
  const card_html=html.slice(card.start,card.end);if(!card_html||card_html.length>20000)continue;
  verifiable++;
  if(reads.lower_bound<10000||dates[0].earliest<Date.parse(stamp)-3*86400000||!entertainmentArticleTitle(titles[0]))continue;
  unique.set(url,{id:url.split('/')[4],url,title:titles[0],account_id:account.id,published_at:dates[0].at,reads,likes,comments,evidence:{account_url:account.url,article_url:url,observed_at:stamp,page_sha256,card_sha256:await hash(card_html),card_html,date_display:dates[0].display,date_precision:dates[0].precision,method:'public_account_card'}});
 }
 return {articles:[...unique.values()].filter(a=>!conflicts.has(a.url)),inspected,verifiable,conflicts:conflicts.size,conflicting_urls:[...conflicts],signatures:[...signatures].map(([url,seen])=>({url,fingerprints:[...seen]})),truncated:cards.length>100,page_sha256};
}
export async function scanBenchmarkAccounts(accounts:BenchmarkAccount[],fetcher:typeof fetch=fetch,stamp=new Date().toISOString(),capture?:(account:BenchmarkAccount,html:string,status:number)=>void):Promise<DiscoveryResult>{
 const result:DiscoveryResult={version:'hot-account-discovery-1',status:'empty',observed_at:stamp,articles:[],observations:[]},signal=AbortSignal.timeout(45000);
 const globalSignatures=new Map<string,Set<string>>(),conflicts=new Set<string>(),accountURLs=new Map<string,string[]>();
 for(const account of accounts){
  if(signal.aborted){result.observations.push({account_id:account.id,url:account.url,outcome:'not_scanned',http_status:null,page_sha256:null,cards:0,qualified:0,reason:'本次45秒扫描窗口已结束'});continue;}
  const diag=diagnostics();
  try{
   const page=await publicHTML(account.url,fetcher,signal,diag);
   // Production callback only queues responses in memory; never awaits R2.
   if(capture)try{void Promise.resolve(capture(account,page.html,page.status)).catch(()=>{});}catch{}
   const parsed=await parseAccountCards(page.html,account,stamp);
   result.articles.push(...parsed.articles);
   accountURLs.set(account.id,parsed.signatures.map(s=>s.url));
   for(const url of parsed.conflicting_urls)conflicts.add(url);
   for(const {url,fingerprints}of parsed.signatures){const seen=globalSignatures.get(url)??new Set<string>();for(const f of fingerprints)seen.add(f);globalSignatures.set(url,seen);if(seen.size>1)conflicts.add(url);}
   // Unsupported/missing cards are never reported as a successfully empty account.
   const checked=parsed.inspected>0&&parsed.verifiable===parsed.inspected&&!parsed.conflicts&&!parsed.truncated;
   result.observations.push({account_id:account.id,url:account.url,outcome:checked?'checked':'unverifiable',http_status:page.status,page_sha256:parsed.page_sha256,cards:parsed.inspected,qualified:parsed.articles.length,reason:checked?'已核验本次公开页面内的文章卡片；不含未公开加载的分页':parsed.truncated?'页面超过100张卡片，本次只核验前100张':parsed.conflicts?'同一篇文章的卡片信息冲突，已排除冲突文章':'未取得所有文章同时绑定标题、作者、日期和阅读的公开卡片；可能为动态页面或字段缺失'});
  }catch{
   const code=diag.transport.failure_code??'unsupported_dom';
   const reasons:Record<string,string>={access_restricted:'公开访问被拒绝或需验证，已停止访问该账号',network_unavailable:'网络连接失败，未读到公开页面',socket_permission:'网络访问被环境拒绝，未读到公开页面',fetch_timeout:'读取公开页面超时',body_timeout:'读取公开页面超时',batch_timeout:'本次扫描时间已用完',redirect_unverified:'主页发生跳转，尚未核验目标页面',not_public_html:'主页未返回可读的公开网页',response_too_large:'页面过大，无法在本次读取范围内核验',unsupported_dom:'未能解析公开页面中的文章卡片'};
   result.observations.push({account_id:account.id,url:account.url,outcome:code==='access_restricted'?'blocked':'unavailable',http_status:diag.transport.http_status,page_sha256:diag.transport.html_sha256,cards:0,qualified:0,failure_code:code,reason:reasons[code]??'公开页面读取失败，未核验文章'});
  }
 }
 for(const observation of result.observations)if((accountURLs.get(observation.account_id)??[]).some(url=>conflicts.has(url))){observation.outcome='unverifiable';observation.reason='同一文章URL的卡片信息冲突，已排除冲突文章';}
 const byURL=new Map<string,DiscoveryArticle>();for(const a of result.articles)if(!conflicts.has(a.url)&&!byURL.has(a.url))byURL.set(a.url,a);
 for(const observation of result.observations)observation.qualified=[...byURL.values()].filter(a=>a.account_id===observation.account_id).length;
 result.articles=[...byURL.values()].sort((a,b)=>(b.reads.lower_bound??0)-(a.reads.lower_bound??0)||b.published_at.localeCompare(a.published_at)||a.url.localeCompare(b.url)).slice(0,100);
 const incomplete=result.observations.some(o=>o.outcome!=='checked');
 const fullyUnavailable=result.observations.length>0&&result.observations.every(o=>['blocked','unavailable','not_scanned'].includes(o.outcome));
 result.status=incomplete?(fullyUnavailable?'blocked':'incomplete'):result.articles.length?'ready':'empty';return result;
}
