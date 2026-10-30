import {digest,stable,fail} from './security.mjs';

export const reviewUuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
export const reviewHash=/^[a-f0-9]{64}$/;
const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const sections=new Set(['keep_topic','drop_topic','title','body','audience','checklist']);
function invalid(message='内容复盘字段无效') {throw fail(400,'VALIDATION_ERROR',message);}
function text(value,max,{nullable=false,multiline=false}={}) {
  if(nullable&&value===null)return null;
  if(typeof value!=='string'||!value.isWellFormed()||controls.test(value))invalid();
  value=value.replace(/\r\n?/g,'\n').trim();
  if(!value||Buffer.byteLength(value,'utf8')>max||!multiline&&/[\n\t]/.test(value))invalid();
  return value;
}
export function reviewDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)invalid('日期须为有效的 YYYY-MM-DD');
  return value;
}
function timestamp(value) {
  if(value===null)return null;
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return reviewDate(value);
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))invalid('时间须为日期或带时区的 ISO 时间');
  reviewDate(value.slice(0,10));
  return new Date(value).toISOString();
}
function url(value) {
  if(value===null)return null;
  value=text(value,4096);
  let parsed;try{parsed=new URL(value);}catch{invalid('链接须为 HTTP 或 HTTPS 地址');}
  if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)invalid('链接须为不含凭据的 HTTP 或 HTTPS 地址');
  return value;
}
function number(value,{integer=false,max=Number.MAX_SAFE_INTEGER,nullable=true,min=0}={}) {
  if(nullable&&value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isSafeInteger(value))invalid('指标须为有效的非负数；未知指标请留空');
  return value;
}
function json(value,{nullable=false,array=false}={}) {
  if(nullable&&value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)!==array)invalid('JSON 字段类型无效');
  let nodes=0;
  function visit(item,depth=0) {
    if(++nodes>10000||depth>12)invalid('JSON 字段过大或嵌套过深');
    if(item===null||typeof item==='boolean')return;
    if(typeof item==='number'){if(!Number.isFinite(item))invalid();return;}
    if(typeof item==='string'){if(!item.isWellFormed()||controls.test(item))invalid();return;}
    if(typeof item!=='object')invalid();
    for(const [key,child] of Object.entries(item)) {
      if(['__proto__','prototype','constructor'].includes(key))invalid('JSON 字段包含保留键');
      visit(child,depth+1);
    }
  }
  visit(value);
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>65536)invalid('JSON 字段最多 64 KiB');
  return stable(value);
}
function verdicts(value) {
  value=json(value);
  for(const [id,item] of Object.entries(value)) {
    if(!reviewUuid.test(id)||!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='reason,verdict'||!['爆','中','扑'].includes(item.verdict))invalid('结论须按文章 UUID 保存爆、中、扑与原因');
    item.reason=text(item.reason,8192,{multiline:true});
  }
  return value;
}
function findings(value) {
  value=json(value);
  if(Object.keys(value).sort().join(',')!=='overturned,verified'||!Array.isArray(value.verified)||!Array.isArray(value.overturned))invalid('findings 需要 verified 和 overturned 数组');
  for(const item of [...value.verified,...value.overturned]) {
    if(!item||typeof item!=='object'||Array.isArray(item))invalid();
    item.rule_id=text(item.rule_id,120);
  }
  return value;
}
function rules(value) {
  value=json(value,{array:true});const ids=new Set();
  for(const item of value) {
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).sort().join(',')!=='rule_id,section,text'||!sections.has(item.section))invalid('规则需要 rule_id、section 和 text');
    item.rule_id=text(item.rule_id,120);item.text=text(item.text,16384,{multiline:true});
    if(ids.has(item.rule_id))invalid('规则 rule_id 不可重复');ids.add(item.rule_id);
  }
  return value;
}
const nullableText=max=>value=>text(value,max,{nullable:true});
const content=value=>value===''?'':text(value,131072,{multiline:true});
const account=value=>text(value,120);
const uuid=value=>{if(typeof value!=='string'||!reviewUuid.test(value))invalid('标识须为小写 UUID');return value;};
const integer=value=>number(value,{integer:true});
const rate=value=>number(value,{max:100});
export const reviewSpecs={
  articles:{table:'matrix_review_articles',order:'published_at DESC,created_at DESC,id DESC',fields:{
    account,platform:value=>{if(value!=='toutiao')invalid('目前仅支持 toutiao');return value;},platform_article_id:nullableText(240),
    title:value=>text(value,2000),url,published_at:timestamp,topic_category:nullableText(240),title_pattern:nullableText(1000),
    sample_title:nullableText(2000),sample_url:url,image_count:integer,source_chat:nullableText(4096),
  },defaults:{account:'V字',platform:'toutiao',platform_article_id:null,url:null,published_at:null,topic_category:null,title_pattern:null,sample_title:null,sample_url:null,image_count:null,source_chat:null},required:['title'],timestamps:['created_at','updated_at']},
  snapshots:{table:'matrix_review_snapshots',order:'snapshot_date DESC,id DESC',fields:{
    article_id:uuid,snapshot_date:reviewDate,impressions:integer,fan_impressions:integer,reads:integer,fan_reads:integer,ctr:rate,completion_rate:rate,
    avg_read_seconds:value=>number(value),likes:integer,comments:integer,reposts:integer,shares:integer,favorites:integer,revenue:value=>number(value),
    traffic_sources:value=>json(value,{nullable:true}),completion_curve:value=>value===null?null:json(value,{array:Array.isArray(value)}),audience:value=>json(value,{nullable:true}),
  },defaults:Object.fromEntries(['impressions','fan_impressions','reads','fan_reads','ctr','completion_rate','avg_read_seconds','likes','comments','reposts','shares','favorites','revenue','traffic_sources','completion_curve','audience'].map(key=>[key,null])),required:['article_id','snapshot_date'],timestamps:[],json:['traffic_sources','completion_curve','audience']},
  reports:{table:'matrix_review_reports',order:'period_start DESC,created_at DESC,id DESC',fields:{
    account,period_type:value=>{if(!['daily','three_day','weekly'].includes(value))invalid('复盘周期类型无效');return value;},period_start:reviewDate,period_end:reviewDate,
    verdicts,findings,summary_md:content,metrics:value=>json(value),playbook_version:value=>number(value,{integer:true,min:1}),
  },defaults:{account:'V字',verdicts:{},findings:{verified:[],overturned:[]},summary_md:'',metrics:{},playbook_version:null},required:['period_type','period_start','period_end'],timestamps:['created_at'],json:['verdicts','findings','metrics']},
  playbooks:{table:'matrix_review_playbooks',order:'version DESC,created_at DESC,id DESC',fields:{
    account,version:value=>number(value,{integer:true,nullable:false,min:1}),published_on:reviewDate,content_md:content,rules,changelog_md:content,sent_to_gemini_at:timestamp,
  },defaults:{account:'V字',content_md:'',rules:[],changelog_md:'',sent_to_gemini_at:null},required:['version','published_on'],timestamps:['created_at'],json:['rules']},
};
export function reviewInput(kind,input,{patch=false}={}) {
  const spec=reviewSpecs[kind],keys=Object.keys(input);
  if(keys.some(key=>!Object.hasOwn(spec.fields,key))||patch&&!keys.length)invalid('存在未知字段或没有提交修改');
  if(!patch&&spec.required.some(key=>!Object.hasOwn(input,key)))invalid('缺少必填字段');
  const row=patch?{}:structuredClone(spec.defaults);
  for(const key of keys)row[key]=spec.fields[key](input[key]);
  if(kind==='reports'&&row.period_start&&row.period_end&&row.period_start>row.period_end)invalid('period_end 不可早于 period_start');
  return row;
}
export function reviewView(kind,row) {
  if(!row)return null;
  const spec=reviewSpecs[kind],data={id:row.id};
  for(const key of [...Object.keys(spec.fields),...spec.timestamps])data[key]=spec.json?.includes(key)?row[key+'_json']===null?null:JSON.parse(row[key+'_json']):row[key];
  return {...data,content_hash:reviewContentHash(data)};
}
export function reviewContentHash(row) {
  const {content_hash,...data}=row;return digest(JSON.stringify(stable(data)));
}
export function reviewEqual(kind,row,input) {
  return JSON.stringify(stable(Object.fromEntries(Object.keys(reviewSpecs[kind].fields).map(key=>[key,row[key]]))))===JSON.stringify(stable(input));
}
