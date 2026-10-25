// Explicit local planning only. No network, credential or persistent output.
import {createHash} from 'node:crypto';
import {readImportEntry} from './files.mjs';
import {parseImportEntry} from './parse.mjs';
import {articleWarnings,verificationState} from '../../src/article-pipeline-query.mjs';
import {pipelineInput,validateArticleInputComplexity} from '../../src/article-pipeline-io.mjs';
import {ARTICLE_PIPELINE_FIELDS} from '../../src/article-pipeline-fields.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeId=value=>typeof value==='string'&&value.length<=512&&/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value);
const keys=new Set(['directory','run_dir','account_id','platform','slot','run_date','source_timezone','writer','illustrator',
  'status','series_no','char_count','subheading_count','image_count','cover_desc','used_topics','used_samples','expected']);
const expectedFields=new Set(['account_id','title','url','platform_article_id','published_at','started_at','production_mode','summary','notes',
  ...ARTICLE_PIPELINE_FIELDS.map(key=>key.endsWith('_json')?key.slice(0,-5):key)]);
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const issue=(code,field=null)=>({code,source:'config',line:null,field,severity:'error'});
const fatal=issues=>issues.some(row=>row.severity==='error');
export class ImportPlanError extends Error {constructor(code){super(code);this.name='ImportPlanError';this.code=code;}}
const fail=code=>{throw new ImportPlanError(code);};
export function validateImportConfig(config) {
  if(!object(config)||config.format!=='haoduoyu-article-import-config-v1'||
    Object.keys(config).some(key=>!['format','entries'].includes(key))||!Array.isArray(config.entries)||
    config.entries.length<1||config.entries.length>50)fail('CONFIG_INVALID');
  try{validateArticleInputComplexity(config);}catch{fail('CONFIG_UNSAFE');}
  return config;
}
function entryIssues(entry) {
  if(!object(entry))return [issue('ENTRY_INVALID')];
  const issues=[];
  if(Object.keys(entry).some(key=>!keys.has(key)))issues.push(issue('ENTRY_UNKNOWN_FIELD'));
  if(!safeId(entry.run_dir))issues.push(issue('ENTRY_ID_INVALID','run_dir'));
  if(typeof entry.account_id!=='string'||!entry.account_id||entry.account_id.length>100||/[\u0000-\u001f\u007f]/u.test(entry.account_id))
    issues.push(issue('ACCOUNT_REQUIRED','account_id'));
  if(typeof entry.directory!=='string'||entry.directory.length>4096)issues.push(issue('SOURCE_DIRECTORY_REQUIRED'));
  if(!['toutiao','zhihu','wechat','other'].includes(entry.platform))issues.push(issue('PLATFORM_REQUIRED','platform'));
  for(const key of ['used_topics','used_samples'])if(entry[key]!==undefined&&
    (typeof entry[key]!=='string'||entry[key].length>4096))issues.push(issue('SOURCE_PATH_INVALID',key));
  if(entry.expected!==undefined&&(!object(entry.expected)||Object.keys(entry.expected).some(key=>!['id','version','fields'].includes(key))||
    typeof entry.expected.id!=='string'||entry.expected.id.length>300||!Number.isSafeInteger(entry.expected.version)||entry.expected.version<1||
    !object(entry.expected.fields)||Object.keys(entry.expected.fields).some(key=>!expectedFields.has(key))))
    issues.push(issue('EXPECTED_INVALID'));
  return issues;
}
function identities(record) {
  const values=[];
  if(record.run_dir!==null&&record.run_dir!==undefined)values.push('dir:'+record.run_dir);
  if(record.slot!==null&&record.slot!==undefined&&record.run_date!==null&&record.run_date!==undefined)
    values.push('pair:'+record.slot+':'+record.run_date);
  return values;
}
function markFailed(row,code) {
  row.action='failed';row.reason=code;row.issues.push(issue(code));
}
export async function buildImportPlan({root,config,readEntry=readImportEntry}={}) {
  validateImportConfig(config);
  if(typeof root!=='string'||!root.startsWith('/'))fail('ROOT_REQUIRED');
  const entries=[];let bytesRead=0;
  for(const [index,entry]of config.entries.entries()) {
    const errors=entryIssues(entry),entryId=safeId(entry?.run_dir)?entry.run_dir:'entry-'+(index+1);
    if(fatal(errors)||bytesRead>=67108864) {
      if(bytesRead>=67108864)errors.push(issue('BATCH_INPUT_LIMIT'));
      entries.push({entry_id:entryId,action:'failed',reason:errors[0]?.code||'ENTRY_INVALID',record:null,
        proposal:null,provenance:{},issues:errors,source_summary:{},warnings:[],has_pending_verify:null,verify_state:'unknown'});
      continue;
    }
    const source=await readEntry({root,entry});bytesRead+=source.bytes_read||0;
    const parsed=parseImportEntry({entry,files:source.files}),issues=[...(source.issues||[]),...parsed.issues];
    if(bytesRead>67108864)issues.push(issue('BATCH_INPUT_LIMIT'));
    if(parsed.record.status===null)issues.push(issue('STATUS_NOT_ESTABLISHED','status'));
    try{pipelineInput(parsed.proposal,null,parsed.record.title);}catch{issues.push(issue('PROPOSAL_INVALID'));}
    let warnings=[],verification={has_pending_verify:null,verify_state:'unknown'};
    try{warnings=articleWarnings(parsed.record);verification=verificationState(parsed.record);}catch{issues.push(issue('DERIVED_FIELDS_INVALID'));}
    const failed=fatal(issues);
    entries.push({entry_id:entryId,action:failed?'failed':entry.expected?'update_candidate':'candidate',
      reason:failed?'SOURCE_OR_PROPOSAL_INVALID':entry.expected?'EXPECTED_BASELINE_UNVERIFIED':'TARGET_NOT_CONTACTED',
      record:parsed.record,proposal:parsed.proposal,provenance:parsed.provenance,issues,
      source_summary:source.source_summary||parsed.source_summary,warnings,...verification,
      ...(entry.expected?{expected:structuredClone(entry.expected)}:{})});
  }
  // Database identities are global. Preflight the whole batch before an apply
  // can write the first row, including identities assigned to different accounts.
  const byIdentity=new Map(),duplicateOf=new Map();
  for(const [index,row]of entries.entries()) {
    if(row.action==='failed')continue;
    const hash=digest({proposal:row.proposal,expected:row.expected??null});
    for(const identity of identities(row.proposal)) {
      const prior=byIdentity.get(identity);
      if(prior!==undefined) {
        const other=entries[prior],otherHash=digest({proposal:other.proposal,expected:other.expected??null});
        if(hash===otherHash)duplicateOf.set(index,prior);
        else {markFailed(other,'DUPLICATE_IDENTITY_CONFLICT');markFailed(row,'DUPLICATE_IDENTITY_CONFLICT');}
      }else byIdentity.set(identity,index);
    }
  }
  for(const [index,prior]of duplicateOf) {
    const row=entries[index];
    if(row.action==='failed')continue;
    if(entries[prior].action==='failed')markFailed(row,'DUPLICATE_OF_FAILED');
    else {row.action='skipped';row.reason='DUPLICATE_INPUT';}
  }
  const actions=['candidate','update_candidate','skipped','failed'];
  return {format:'haoduoyu-article-import-plan-v1',mode:'dry-run',network:'not_contacted',entries,
    summary:{...Object.fromEntries(actions.map(action=>[action,entries.filter(row=>row.action===action).length])),bytes_read:bytesRead}};
}

export function proposalsForApply(plan) {
  return plan.entries.filter(row=>['candidate','update_candidate'].includes(row.action))
    .map(row=>({entry_id:row.entry_id,record:row.proposal,...(row.expected?{expected:row.expected}:{})}));
}
