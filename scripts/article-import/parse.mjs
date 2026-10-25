// Pure import parsing. No filesystem, HTTP, credentials, DB or mutable clock.
import {createHash} from 'node:crypto';
import {ARTICLE_PIPELINE_ENUMS,validateArticlePipelineFields} from '../../src/article-pipeline-fields.mjs';

export const IMPORT_PARSE_CONTRACT=Object.freeze({
  version:'haoduoyu-article-import-parse-v1',
  timezones:['Asia/Shanghai','UTC'],
  check_labels:['字数','小标题','小标题数','图数','图片数','watchdog 重跑次数','series_no','封面描述'],
  log_stages:['流水线','选题','写作','配图','导入'],
  saved_marker:'导入 结束：草稿已存 pgc_id=... (or appmsgid=... / editor_url=...)',
  ledger_format:'YYYY-MM-DD | 作者 | 标题 | used for 第N篇',
});
const sources=['timelog','check','title','article','used_topics','used_samples'];
const filenames={timelog:'timelog.txt',check:'check.md',title:'title.txt',article:'article.txt',used_topics:'used_topics.txt',used_samples:'used_samples.txt'};
const flatFields=['account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes',
  'status','slot','run_dir','run_date','series_no','writer','illustrator','sample','char_count','subheading_count','image_count','cover_desc',
  'draft_ref','timings','reruns','blockers','verify_items'];
const stageNames={流水线:'pipeline',选题:'topic',写作:'writing',配图:'illustration',导入:'import'};
const countNames={字数:'char_count',小标题:'subheading_count',小标题数:'subheading_count',图数:'image_count',图片数:'image_count',
  'watchdog 重跑次数':'reruns.watchdog',watchdog重跑次数:'reruns.watchdog',series_no:'series_no'};
const own=(value,key)=>Object.hasOwn(value,key);
const hash=value=>createHash('sha256').update(value,'utf8').digest('hex');
const dateValid=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const safeText=(value,max)=>typeof value==='string'&&value.length<=max&&value.isWellFormed()&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const integer=value=>typeof value==='string'&&/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;

function context() {
  const cells=new Map(),issues=[],provenance={};
  function issue(code,source,line=null,field=null,severity='error') {issues.push({code,source,line,field,severity});}
  function offer(field,value,source,line=null) {
    const ref={source,line};
    if(!provenance[field])provenance[field]=[];
    provenance[field].push(ref);
    const previous=cells.get(field);
    if(!previous){cells.set(field,{value,conflict:false});return;}
    if(previous.value===value&&!previous.conflict)issue('DUPLICATE_VALUE',source,line,field,'warning');
    else {previous.conflict=true;issue('CONFLICTING_VALUE',source,line,field);}
  }
  return {cells,issues,provenance,issue,offer,value:field=>{const cell=cells.get(field);return cell&&!cell.conflict?cell.value:null;}};
}

function sourceFiles(files,state) {
  const text={},summary={};
  for(const source of sources) {
    const value=files?.[source]??files?.[filenames[source]]??null;
    if(value===null) {text[source]=null;summary[source]={present:false,bytes:0,sha256:null};continue;}
    if(typeof value!=='string') {state.issue('SOURCE_TYPE_INVALID',source);text[source]=null;summary[source]={present:false,bytes:null,sha256:null};continue;}
    const bytes=Buffer.byteLength(value,'utf8');
    if(bytes>2097152) {state.issue('SOURCE_TOO_LARGE',source);text[source]=null;summary[source]={present:true,bytes,sha256:null};continue;}
    summary[source]={present:true,bytes,sha256:hash(value)};
    const normalized=value.replace(/^\uFEFF/,'').replaceAll('\r\n','\n');
    if(normalized.split('\n').length>5000) {state.issue('SOURCE_LINE_LIMIT',source);text[source]=null;continue;}
    text[source]=normalized;
  }
  return {text,summary};
}

function timestamp(date,clock,timezone) {
  if(!dateValid(date)||!/^\d{2}:\d{2}:\d{2}$/.test(clock))return null;
  const [h,m,s]=clock.split(':').map(Number);
  if(h>23||m>59||s>59)return null;
  const offset=timezone==='UTC'?'Z':'+08:00';
  const value=Date.parse(date+'T'+clock+offset);
  return Number.isFinite(value)?new Date(value).toISOString():null;
}
function businessDate(utc) {return new Date(Date.parse(utc)+8*3600000).toISOString().slice(0,10);}

function config(entry,state) {
  for(const field of ['account_id','run_dir','slot','run_date','series_no','writer','illustrator','status','char_count','subheading_count','image_count','cover_desc']) {
    if(!own(entry,field)||entry[field]===null)continue;
    const value=entry[field];let valid=true;
    if(field==='account_id')valid=safeText(value,100)&&value.length>0;
    else if(field==='cover_desc')valid=safeText(value,10000);
    else if(field==='status')valid=ARTICLE_PIPELINE_ENUMS.status.includes(value)&&value!=='published';
    else try{validateArticlePipelineFields({[field]:value});}catch{valid=false;}
    if(valid)state.offer(field,value,'config');else state.issue('CONFIG_FIELD_INVALID','config',null,field);
  }
  for(const field of ['account_id','run_dir'])if(state.value(field)===null)state.issue('CONFIG_FIELD_REQUIRED','config',null,field);
  if(typeof entry.platform!=='string'||!['toutiao','zhihu','wechat','other'].includes(entry.platform))state.issue('PLATFORM_REQUIRED','config',null,'platform');
  else state.offer('platform',entry.platform,'config');
}

function titleFile(text,state) {
  if(text===null){state.issue('TITLE_MISSING','title',null,'title');return;}
  const nonempty=text.split('\n').map((value,index)=>({value:value.trim(),line:index+1})).filter(row=>row.value);
  if(nonempty.length!==1||!safeText(nonempty[0]?.value,300)) {state.issue('TITLE_AMBIGUOUS_OR_INVALID','title',null,'title');return;}
  state.offer('title',nonempty[0].value,'title',nonempty[0].line);
}

function countValue(label,raw,source,line,state) {
  const name=countNames[label],value=integer(raw);
  if(value===null||name==='series_no'&&value<1) {state.issue('COUNT_INVALID',source,line,name);return;}
  state.offer(name,value,source,line);
}

function checkFile(text,state) {
  if(text===null){state.issue('CHECK_MISSING','check',null,null,'warning');return;}
  for(const [index,raw]of text.split('\n').entries()) {
    const line=raw.trim();if(!line||line.startsWith('#')||/^[-*]{3,}$/.test(line))continue;
    const match=/^(?:[-*]\s*)?(字数|小标题|小标题数|图数|图片数|watchdog\s*重跑次数|series_no|封面描述)\s*[:：=]\s*(.*?)\s*$/.exec(line);
    if(!match){state.issue('CHECK_LINE_UNRECOGNIZED','check',index+1,null,'warning');continue;}
    const label=match[1].replace(/watchdog\s*重跑次数/,'watchdog 重跑次数');
    if(label==='封面描述') {
      if(safeText(match[2],10000))state.offer('cover_desc',match[2],'check',index+1);
      else state.issue('TEXT_INVALID','check',index+1,'cover_desc');
    }else countValue(label,match[2],'check',index+1,state);
  }
}

function editorURL(value) {
  if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\s\u0000-\u001f\u007f]/u.test(value))return false;
  try{const url=new URL(value);return !!url.hostname&&!url.username&&!url.password;}catch{return false;}
}
function details(text,source,line,state) {
  const labels=/(?:^|[\s,，;；])(?:字数|小标题数?|图数|图片数|watchdog\s*重跑次数|watchdog)\s*[:：=]\s*[^\s,，;；]+/g;
  for(const match of text.matchAll(labels)) {
    const pair=/^(字数|小标题数?|图数|图片数|watchdog\s*重跑次数|watchdog)\s*[:：=]\s*(\S+)$/.exec(match[0].trim().replace(/^[,，;；]\s*/,''));
    if(!pair)continue;
    const label=pair[1].startsWith('watchdog')?'watchdog 重跑次数':pair[1];countValue(label,pair[2],source,line,state);
  }
  for(const key of ['pgc_id','appmsgid']) {
    const regex=new RegExp('(?:^|[\\s,，;；])'+key+'\\s*[:：=]\\s*([^\\s,，;；]+)','g');
    for(const match of text.matchAll(regex)) {
      if(/^[A-Za-z0-9_-]+$/.test(match[1]))state.offer('draft_ref.'+key,match[1],source,line);
      else state.issue('ID_INVALID',source,line,'draft_ref.'+key);
    }
  }
  for(const match of text.matchAll(/(?:^|[\s,，;；])(?:editor_url|知乎编辑链接|草稿编辑链接)\s*[:：=]\s*([^\s,，;；]+)/g)) {
    if(editorURL(match[1]))state.offer('draft_ref.editor_url',match[1],source,line);
    else state.issue('EDITOR_URL_INVALID',source,line,'draft_ref.editor_url');
  }
}

function logs(text,entry,state) {
  const dates=new Set(),dateLines=new Map(),markers=[],seenStages=new Set();
  if(text===null){state.issue('TIMELOG_MISSING','timelog',null,null,'warning');return {dates,dateLines,markers,seenStages};}
  const timezone=entry.source_timezone;
  if(!IMPORT_PARSE_CONTRACT.timezones.includes(timezone)) {state.issue('SOURCE_TIMEZONE_REQUIRED','config',null,'source_timezone');return {dates,dateLines,markers,seenStages};}
  let previous=null;
  for(const [index,raw]of text.split('\n').entries()) {
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const match=/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+(开始|结束)\s*[:：]\s*(.*)$/.exec(line);
    if(!match){state.issue('TIMELOG_LINE_INVALID','timelog',index+1);continue;}
    const utc=timestamp(match[1],match[2],timezone);
    if(utc===null){state.issue('TIMELOG_TIMESTAMP_INVALID','timelog',index+1);continue;}
    const day=businessDate(utc);dates.add(day);
    if(!dateLines.has(day))dateLines.set(day,[]);dateLines.get(day).push(index+1);
    if(previous!==null&&utc<previous)state.issue('TIMELOG_OUT_OF_ORDER','timelog',index+1);
    previous=utc;
    const stage=stageNames[match[3]];
    if(!stage){state.issue('TIMELOG_STAGE_UNKNOWN','timelog',index+1,null,'warning');continue;}
    seenStages.add(stage);
    const boundary=match[4]==='开始'?'started_at':'finished_at';
    state.offer('timings.'+stage+'.'+boundary,utc,'timelog',index+1);
    if(stage==='pipeline')state.offer(boundary==='started_at'?'started_at':'timings.finished_at',utc,'timelog',index+1);
    details(match[5],'timelog',index+1,state);
    if(match[4]==='结束'&&stage==='import'&&/(?:草稿已存|草稿已保存)/.test(match[5]))markers.push({status:'draft_saved',line:index+1});
    if(/(?:^|[\s,，;；])失败(?:$|[\s:：,，;；])/.test(match[5]))markers.push({status:'failed',line:index+1});
  }
  return {dates,dateLines,markers,seenStages};
}

function ledger(text,source,entry,state) {
  if(text===null)return;
  const rows=[];
  for(const [index,raw]of text.split('\n').entries()) {
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const parts=line.split('|').map(value=>value.trim());
    const number=parts.length===4?/^used for 第(\d+)篇$/.exec(parts[3]):null;
    const series=number?integer(number[1]):null;
    if(parts.length!==4||!dateValid(parts[0])||!safeText(parts[1],150)||!parts[1]||!safeText(parts[2],300)||!parts[2]||series===null||series<1) {
      state.issue('LEDGER_LINE_INVALID',source,index+1);continue;
    }
    rows.push({date:parts[0],author:parts[1],title:parts[2],series_no:series,line:index+1});
  }
  const date=state.value('run_date'),title=state.value('title'),configuredSeries=entry.series_no;
  const matched=rows.filter(row=>row.date===date&&(row.title===title||Number.isSafeInteger(configuredSeries)&&row.series_no===configuredSeries));
  const unique=new Map(matched.map(row=>[JSON.stringify([row.date,row.author,row.title,row.series_no]),row]));
  if(unique.size>1){state.issue('LEDGER_MATCH_AMBIGUOUS',source,null,'sample');return;}
  if(unique.size===0)return;
  const row=[...unique.values()][0];
  for(const candidate of matched)state.offer('series_no',candidate.series_no,source,candidate.line);
  state.offer('sample.'+source,JSON.stringify({date:row.date,author:row.author,title:row.title,series_no:row.series_no}),source,row.line);
  if(matched.length>1)state.issue('LEDGER_DUPLICATE',source,row.line,'sample','warning');
}

function materialize(state,stages) {
  const record=Object.fromEntries(flatFields.map(field=>[field,state.value(field)]));
  const proposal={};
  for(const field of flatFields)if(record[field]!==null)proposal[field]=record[field];
  for(const [field,children]of [['draft_ref',['pgc_id','appmsgid','editor_url']],['reruns',['watchdog']]]) {
    const values=Object.fromEntries(children.map(key=>[key,state.value(field+'.'+key)]));
    const known=Object.fromEntries(Object.entries(values).filter(([,value])=>value!==null));
    if(Object.keys(known).length) {
      record[field]=values;proposal[field]=known;
      state.provenance[field]=Object.keys(known).flatMap(key=>state.provenance[field+'.'+key]||[]);
    }
  }
  const timings={},timingProposal={};
  for(const stage of stages) {
    const start=state.value('timings.'+stage+'.started_at'),end=state.value('timings.'+stage+'.finished_at');
    let seconds=null;
    if(start!==null&&end!==null) {
      if(end<start)state.issue('STAGE_TIME_REVERSED','timelog',null,'timings.'+stage);
      else seconds=(Date.parse(end)-Date.parse(start))/1000;
    }else state.issue('STAGE_TIME_INCOMPLETE','timelog',null,'timings.'+stage,'warning');
    timings[stage]={started_at:start,finished_at:end,seconds};
    const proven=Object.fromEntries(Object.entries(timings[stage]).filter(([,value])=>value!==null));
    if(Object.keys(proven).length)timingProposal[stage]=proven;
    if(seconds!==null)state.provenance['timings.'+stage+'.seconds']=[...(state.provenance['timings.'+stage+'.started_at']||[]),...(state.provenance['timings.'+stage+'.finished_at']||[])];
  }
  const end=state.value('timings.finished_at');if(end!==null){timings.finished_at=end;timingProposal.finished_at=end;}
  if(Object.keys(timings).length)record.timings=timings;
  if(Object.keys(timingProposal).length) {
    proposal.timings=timingProposal;
    state.provenance.timings=Object.entries(state.provenance).filter(([key])=>key.startsWith('timings.')).flatMap(([,refs])=>refs);
  }
  const samples={};
  for(const source of ['used_topics','used_samples'])if(state.value('sample.'+source)!==null)samples[source]=JSON.parse(state.value('sample.'+source));
  if(Object.keys(samples).length) {
    record.sample=samples;proposal.sample=samples;
    state.provenance.sample=Object.keys(samples).flatMap(source=>state.provenance['sample.'+source]||[]);
  }
  return {record,proposal};
}

export function parseImportEntry({entry={},files={}}={}) {
  const state=context();
  if(!entry||typeof entry!=='object'||Array.isArray(entry)) {state.issue('CONFIG_ENTRY_INVALID','config');entry={};}
  const {text,summary}=sourceFiles(files,state);
  config(entry,state);titleFile(text.title,state);checkFile(text.check,state);
  const {dates,dateLines,markers,seenStages}=logs(text.timelog,entry,state);
  const configuredDate=state.value('run_date');
  if(configuredDate!==null&&dates.size&&!dates.has(configuredDate))state.issue('RUN_DATE_CONFLICT','timelog',null,'run_date');
  else if(configuredDate===null) {
    if(dates.size===1) {
      const date=[...dates][0],lines=dateLines.get(date);
      state.offer('run_date',date,'timelog',lines[0]);
      state.provenance.run_date.push(...lines.slice(1).map(line=>({source:'timelog',line})));
    }
    else state.issue(dates.size>1?'RUN_DATE_AMBIGUOUS':'RUN_DATE_UNKNOWN','timelog',null,'run_date');
  }
  const credentialField=entry.platform==='toutiao'?'draft_ref.pgc_id':entry.platform==='wechat'?'draft_ref.appmsgid':'draft_ref.editor_url';
  const credential=state.value(credentialField);
  for(const marker of markers) {
    const sameLine=state.provenance[credentialField]?.some(ref=>ref.source==='timelog'&&ref.line===marker.line);
    if(marker.status==='failed'||credential!==null&&sameLine)state.offer('status',marker.status,'timelog',marker.line);
    else state.issue('SAVED_WITHOUT_PLATFORM_REFERENCE','timelog',marker.line,'status');
  }
  for(const source of ['used_topics','used_samples'])ledger(text[source],source,entry,state);
  const {record,proposal}=materialize(state,seenStages);record.platform=state.value('platform');
  for(const field of ['char_count','subheading_count','image_count','status'])if(record[field]===null)
    state.issue('FIELD_UNKNOWN','parser',null,field,'warning');
  return {record,proposal,provenance:state.provenance,issues:state.issues,source_summary:summary};
}
