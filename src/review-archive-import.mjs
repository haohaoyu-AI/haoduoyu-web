import { bodyFor, digest, fail, stable } from './security.mjs';
import { archiveItems } from './review-archive-store.mjs';
import { archiveInstant } from './review-archive-model.mjs';
import { applyImportPlans, planImportRows } from './review-archive-import-plan.mjs';

// The page bounds keep the business writes, checkpoint and audit inside a
// single D1 batch. No saved page contains a source body, image or raw file.
const pageSize = 8;
const maxPages = 400;
const kinds = new Set(['directory','drafts','metrics']);
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const fingerprint = /^[a-f0-9]{64}$/u;
const actions = ['new','update','unchanged','conflict','unrecognized'];
const privateHeaders = {'Cache-Control':'private, no-store',Vary:'Cookie, Authorization'};
const json = (data,status=200) => Response.json({data},{status,headers:privateHeaders});
const hash = value => digest(JSON.stringify(stable(value)));
const error = (status,code,message) => { throw fail(status,code,message); };
const invalid = () => error(400,'ARCHIVE_IMPORT_INPUT','档案导入参数无效');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shape = (value,fields) => object(value) && Object.keys(value).every(key=>fields.includes(key));
const integer = (value,min,max) => Number.isSafeInteger(value) && value >= min && value <= max;
const text = (value,max) => typeof value === 'string' && value.length <= max &&
  value.length > 0 && value.trim() === value && value.isWellFormed() && !/[\x00-\x1f\x7f]/u.test(value);

function day(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return invalid();
  const stamp = Date.parse(value+'T00:00:00.000Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== value) return invalid();
  return value;
}

function scopeFor(value) {
  if (!shape(value,['account','platform','kind','collected_at','from','to']) ||
    value.account !== 'V字' || value.platform !== 'toutiao' || !['article','micro'].includes(value.kind)) return invalid();
  const from = day(value.from), to = day(value.to);
  if (from !== null && to !== null && from > to) return invalid();
  return {...value,collected_at:archiveInstant(value.collected_at),from,to};
}

function coverageFor(value) {
  if (!shape(value,['last_page','total_rows','whole_scope']) ||
    ['last_page','whole_scope'].some(key=>Object.hasOwn(value,key) && typeof value[key] !== 'boolean') ||
    Object.hasOwn(value,'total_rows') && !integer(value.total_rows,0,pageSize*maxPages)) return invalid();
  return {last_page:value.last_page??false,whole_scope:value.whole_scope??null,total_rows:value.total_rows??null};
}

function checkComplexity(value) {
  const waiting = [[value,0]];
  let nodes = 0;
  while (waiting.length) {
    const [part,depth] = waiting.pop();
    if (++nodes > 12000 || depth > 16) return invalid();
    if (part !== null && typeof part === 'object') {
      for (const key of Object.keys(part)) {
        if (['__proto__','constructor','prototype'].includes(key)) return invalid();
        waiting.push([part[key],depth+1]);
      }
    }
  }
}

function inputFor(input,apply) {
  if (!shape(input,['run_id','kind','source','source_key','scope','page','coverage','rows',...(apply?['preview_hash']:[])]) ||
    typeof input.run_id !== 'string' || !uuid.test(input.run_id) || !kinds.has(input.kind) ||
    !text(input.source,100) || !text(input.source_key,200) || !integer(input.page,1,maxPages) ||
    !Array.isArray(input.rows) || input.rows.length > pageSize ||
    apply && (typeof input.preview_hash !== 'string' || !fingerprint.test(input.preview_hash))) return invalid();
  checkComplexity(input.rows);
  const totalRefs = input.rows.reduce((count,row)=>count+(Array.isArray(row?.refs)?row.refs.length:0),0);
  if (totalRefs > 16) return invalid();
  const coverage = coverageFor(input.coverage);
  if (!coverage.last_page && (!input.rows.length || input.page === maxPages)) return invalid();
  return {...input,scope:scopeFor(input.scope),coverage};
}

const runFields = 'id,kind,source,source_key,scope_json,started_at,completed_at';
const viewRun = ({scope_json,...row}) => ({...row,scope:JSON.parse(scope_json)});

async function importState(store,owner,runId) {
  const row = await store.get('SELECT '+runFields+' FROM matrix_review_archive_imports WHERE user_id=? AND id=?',owner,runId);
  if (!row) return {run:null,pages:[],rows:0,closed:false,next:1,total:null,whole:null};
  const pages = (await store.all('SELECT page,request_hash,result_json FROM matrix_review_archive_import_pages WHERE user_id=? AND run_id=? ORDER BY page',owner,runId))
    .map(({result_json,...page})=>({...page,result:JSON.parse(result_json)}));
  const last = pages.at(-1);
  const coverage = last?.result.coverage;
  return {run:viewRun(row),pages,rows:coverage?.rows_seen??0,closed:coverage?.last_page??false,next:last?.result.next_page??1,
    total:coverage?.total_rows??null,whole:coverage?.whole_scope??null};
}

async function checkRun(store,owner,state,input) {
  if (!state.run) {
    const existing = await store.get('SELECT id FROM matrix_review_archive_imports WHERE user_id=? AND kind=? AND source=? AND source_key=?',
      owner,input.kind,input.source,input.source_key);
    if (existing) return error(409,'ARCHIVE_IMPORT_RUN_CONFLICT','此来源批次已有检查点，请使用原导入编号');
    return;
  }
  if (['kind','source','source_key'].some(key=>state.run[key] !== input[key]) ||
    hash(state.run.scope) !== hash(input.scope)) return error(409,'ARCHIVE_IMPORT_RUN_CONFLICT','导入编号与原采集范围不一致');
}

function checkPage(state,input,requestHash) {
  const saved = state.pages.find(page=>page.page===input.page);
  if (saved) {
    if (saved.request_hash !== requestHash) return error(409,'ARCHIVE_IMPORT_PAGE_CONFLICT','此页已提交，不同内容不能覆盖原回执');
    return {...saved.result,replayed:true};
  }
  if (state.closed || input.page !== state.next) return error(409,'ARCHIVE_IMPORT_PAGE_ORDER','请从保存的下一页继续，已结束的批次不能追加');
  if (state.total !== null && input.coverage.total_rows !== null && input.coverage.total_rows !== state.total ||
    state.whole !== null && input.coverage.whole_scope !== null && input.coverage.whole_scope !== state.whole)
    return error(409,'ARCHIVE_IMPORT_COVERAGE_CONFLICT','采集总数或范围声明与检查点不一致');
  return null;
}

function projectedCoverage(state,input,rows) {
  const totalRows = input.coverage.total_rows ?? state.total;
  const rowsSeen = state.rows + input.rows.length;
  const incomplete = state.pages.at(-1)?.result.coverage.issues??0;
  const issues = incomplete + rows.filter(row=>row.action==='conflict'||row.action==='unrecognized'||row.coverage_unverified).length;
  const {last_page} = input.coverage;
  const whole_scope = input.coverage.whole_scope??state.whole;
  return {last_page,whole_scope,total_rows:totalRows,rows_seen:rowsSeen,issues,
    complete:whole_scope && last_page && totalRows !== null && totalRows === rowsSeen && issues === 0};
}

function resultFor(input,state,rows,previewHash) {
  const coverage = projectedCoverage(state,input,rows);
  return {run_id:input.run_id,page:input.page,preview_hash:previewHash,rows,
    counts:Object.fromEntries(actions.map(action=>[action,rows.filter(row=>row.action===action).length])),
    next_page:coverage.last_page?null:input.page+1,coverage};
}

function saveCheckpoint(store,owner,actor,state,input,requestHash,result) {
  const stamp = new Date().toISOString();
  const completedAt = result.coverage.complete ? stamp : null;
  if (!state.run) store.queue('INSERT INTO matrix_review_archive_imports(user_id,id,kind,source,source_key,scope_json,started_at,completed_at) VALUES(?,?,?,?,?,?,?,?)',
    owner,input.run_id,input.kind,input.source,input.source_key,JSON.stringify(stable(input.scope)),stamp,completedAt);
  else if (completedAt) store.queue('UPDATE matrix_review_archive_imports SET completed_at=? WHERE user_id=? AND id=?',
    completedAt,owner,input.run_id);
  store.queue('INSERT INTO matrix_review_archive_import_pages(user_id,run_id,page,request_hash,result_json,committed_at) VALUES(?,?,?,?,?,?)',
    owner,input.run_id,input.page,requestHash,JSON.stringify(result),stamp);
  store.audit(actor.actor,'review.archive.import_page',input.run_id,{page:input.page,counts:result.counts,complete:result.coverage.complete});
}

async function planPage(store,owner,state,input,requestHash) {
  const plans = await planImportRows(store,owner,input,state.pages.map(page=>page.result));
  const previewHash = hash({requestHash,plans});
  return {plans,previewHash,preview:resultFor(input,state,plans.map(plan=>plan.view),previewHash)};
}

async function previewPage(read,owner,input) {
  const requestHash = hash(input);
  return read(async store=>{
    const state = await importState(store,owner,input.run_id);
    await checkRun(store,owner,state,input);
    const replay = checkPage(state,input,requestHash);
    if (replay) return json(replay);
    const {preview} = await planPage(store,owner,state,input,requestHash);
    return json(preview);
  });
}

async function applyPage(write,owner,input) {
  const {preview_hash:expectedPreview,...page} = input;
  const requestHash = hash(page);
  return write(async (store,actor)=>{
    const state = await importState(store,owner,input.run_id);
    await checkRun(store,owner,state,input);
    const replay = checkPage(state,input,requestHash);
    if (replay) {
      if (expectedPreview !== replay.preview_hash) return error(409,'ARCHIVE_IMPORT_PREVIEW_CHANGED','请使用此页原预览凭据');
      return {replayed:true,response:json(replay)};
    }
    const {plans,previewHash} = await planPage(store,owner,state,page,requestHash);
    if (previewHash !== expectedPreview) return error(409,'ARCHIVE_IMPORT_PREVIEW_CHANGED','档案或提交内容已改变，请重新预览');
    const outcomes = await applyImportPlans(store,owner,actor,plans);
    const result = resultFor(page,state,outcomes,previewHash);
    saveCheckpoint(store,owner,actor,state,page,requestHash,result);
    return {response:json(result)};
  });
}

function reconciledScope(item,ref,scope) {
  if (!scope.from && !scope.to) return true;
  const stamp = ref.kind==='draft'?ref.saved_at??(ref.role==='primary'?item.draft_saved_at:null):item.published_at;
  const date = typeof stamp === 'string' && stamp.length === 10 ? stamp :
    stamp ? new Date(Date.parse(stamp)+8*3600000).toISOString().slice(0,10) : null;
  return date && (!scope.from || date>=scope.from) && (!scope.to || date<=scope.to);
}

function reconcile(rows,items,state,coverage) {
  const report = {platform_only:[],site_only:[],suspected_duplicate:[],status_conflict:[],
    site_only_assessed:Boolean(coverage.complete && state.run.kind!=='metrics'),coverage};
  const refKind = state.run.kind==='drafts'?'draft':'publication';
  const seen = new Set(rows.flatMap(row=>row.observed??[]).filter(ref=>ref.kind===refKind).map(ref=>ref.platform_id));
  const scopeItems = items.filter(item=>item.kind===state.run.scope.kind);
  const known = new Map(scopeItems.flatMap(item=>item.refs.filter(ref=>ref.kind===refKind && ref.state!=='disputed')
    .map(ref=>[ref.platform_id,{item,ref}])));
  for (const row of rows) {
    const issue = {key:row.key,item_id:row.item_id,code:row.code};
    if (row.reconciliation==='suspected_duplicate') report.suspected_duplicate.push(issue);
    const observations = (row.observed??[]).filter(ref=>ref.kind===refKind);
    const statusDiffers = row.observed_status && observations.some(ref=>{
      const actual = known.get(ref.platform_id)?.item.publication_status;
      return actual && row.observed_status!==actual;
    });
    if (row.reconciliation==='status_conflict' || statusDiffers) report.status_conflict.push(issue);
    for (const ref of observations) if (!known.has(ref.platform_id)) report.platform_only.push({...issue,platform_id:ref.platform_id});
  }
  if (report.site_only_assessed) for (const [id,{item,ref}] of known) {
    if (!seen.has(id) && reconciledScope(item,ref,state.run.scope)) report.site_only.push({platform_id:id,item_id:item.id});
  }
  report.platform_only = [...new Map(report.platform_only.map(entry=>[entry.platform_id,entry])).values()];
  return report;
}

export async function handleArchiveImport({request,route,url,owner,read,write}) {
  const match = /^\/review\/archive\/imports(?:\/([a-f0-9-]+)(\/reconcile)?)?$/u.exec(route);
  if (url.search) return error(400,'ARCHIVE_IMPORT_INPUT','导入接口不接受查询参数');
  if (request.method==='POST' && ['/review/archive/imports/preview','/review/archive/imports/apply'].includes(route)) {
    const apply = route.endsWith('/apply');
    const input = inputFor(await bodyFor(request),apply);
    return apply ? applyPage(write,owner,input) : previewPage(read,owner,input);
  }
  if (request.method!=='GET' || !match || match[1] && !uuid.test(match[1])) return error(404,'NOT_FOUND','导入接口不存在');
  return read(async store=>{
    if (!match[1]) {
      const items = await store.all('SELECT '+runFields+' FROM matrix_review_archive_imports WHERE user_id=? ORDER BY started_at DESC,id LIMIT 100',owner);
      return json({items:items.map(viewRun)});
    }
    const state = await importState(store,owner,match[1]);
    if (!state.run) return error(404,'NOT_FOUND','导入批次不存在');
    const pages = state.pages.map(page=>page.result);
    const coverage = pages.at(-1)?.coverage??{complete:false};
    if (match[2]) return json(reconcile(pages.flatMap(page=>page.rows),await archiveItems(store,owner),state,coverage));
    return json({...state.run,next_page:state.closed?null:state.next,closed:state.closed,coverage,pages});
  });
}
