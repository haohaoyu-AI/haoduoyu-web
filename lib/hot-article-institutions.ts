/** Conservative publisher registry, verified through the linked official pages.
 * Unknown publishers are research leads and do not count as independent institutions.
 * This identifies publishers, not proof that two reports are independent reporting. */
export const hotArticleInstitutions=[
 {id:'xinhua',name:'新华网股份有限公司',domains:['news.cn','xinhuanet.com'],evidence:['https://www.xinhuanet.com/company/intro.htm','https://www.xinhuanet.com/company/copyright.htm','https://www.news.cn/']},
 {id:'cmg_cctv',name:'央视国际网络有限公司',domains:['cctv.com','cntv.cn'],evidence:['https://www.cctv.com/special/guanyunew/PAGE13818868795101879/index.shtml','https://www.cntv.cn/cntv/04/index.shtml','https://www.cntv.cn/cntv/01/index.shtml']},
 {id:'people',name:'人民网股份有限公司',domains:['people.com.cn','people.cn'],evidence:['https://www.people.com.cn/GB/50142/420117/index.html','https://www.people.cn/']},
 {id:'nrta',name:'国家广播电视总局',domains:['nrta.gov.cn'],evidence:['https://www.nrta.gov.cn/col/col2013/index.html','https://www.nrta.gov.cn/']},
] as const;
export const hotArticleInstitutionVerification='2026-10-07T07:01:08Z official public-page read; no credentials or interaction';
export function sourceInstitution(value:string){const url=new URL(value),host=url.hostname.toLowerCase();if(/(^|\.)(blog|blogs|bbs|forum|forums|user|users|ugc|community)\./.test(host)||/^\/(blog|blogs|bbs|forum|forums|user|users|ugc|community)(\/|$)/i.test(url.pathname))return null;return hotArticleInstitutions.find(i=>i.domains.some(domain=>host===domain||host.endsWith('.'+domain)))??null;}
export function sourceArticleIdentity(value:string){const url=new URL(value),host=url.hostname.toLowerCase();if(host==='toutiao.com'||host.endsWith('.toutiao.com')){const match=url.pathname.match(/^\/(?:article\/([1-9]\d{9,23})|[ia]([1-9]\d{9,23}))\/?$/);if(match)return 'toutiao:'+(match[1]??match[2]);}const publisher=sourceInstitution(value);url.hash='';for(const key of [...url.searchParams.keys()])if(/^(utm_|spm$|from$|ref$|tracking$|timestamp$)/i.test(key))url.searchParams.delete(key);url.searchParams.sort();return (publisher?.id??host.replace(/^(www|m|mobile)\./,''))+':'+url.pathname.replace(/\/$/,'')+(url.searchParams.size?'?'+url.searchParams.toString():'');}
