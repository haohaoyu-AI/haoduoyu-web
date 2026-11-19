import {apiNetwork} from './core/api.mjs';
import {state,runtime} from './core/state.mjs';
import {acceptArchivePage,archivePath,archiveQuery,canAccessReviewArchive,isReviewArchiveRoute} from './core/review-archive-state.mjs';
import {
  renderArchiveFrame,renderArchiveItems,renderArchiveDetail,renderArchiveCompleteness,renderArchiveLegacyPage
} from './pages/review-archive.mjs';
import {readArchiveItemEditor,readArchiveVerification,renderArchiveDetailEditor,renderArchiveItemEditor} from './pages/review-archive-editor.mjs';
import {readArchiveImportFile,renderArchiveImports} from './pages/review-archive-import.mjs';
import {renderArchiveReports} from './pages/review-archive-reports.mjs';

const emptyPage = () => ({items:[],revision:null,offset:0,more:false});
const tabs = ['items','completeness','imports','reports'];
const nullable = value => typeof value==='string' && value.trim() ? value.trim() : null;
const uuid = value => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);

export function reviewArchiveActive() {
  return state.page==='review' && isReviewArchiveRoute(globalThis.location?.search || '');
}

function createView() {
  return {tab:'items',page:emptyPage(),filters:{},loading:true,overview:null,error:'',notice:'',detail:null,
    editor:'',createId:null,createDefaults:null,editRef:null,legacy:null,completeness:null,runs:[],checkpoint:null,
    preview:null,pendingPage:null,reconcile:null,
    reportType:'review',reports:[],reportDetail:null,reportOffset:0,reportRevision:null,reportMore:false,reportConfirm:false};
}

function archiveView(vm) {
  if (vm.detail) return renderArchiveDetail(vm.detail,renderArchiveDetailEditor(vm.editor,vm.detail,vm.editRef));
  if (vm.editor==='create') return renderArchiveItemEditor(vm.createDefaults || {});
  if (vm.legacy) return renderArchiveLegacyPage(vm.legacy);
  if (vm.tab==='completeness') return renderArchiveCompleteness(vm.completeness);
  if (vm.tab==='imports') return renderArchiveImports(vm);
  if (vm.tab==='reports') return renderArchiveReports(vm);
  return renderArchiveItems({...vm.page,overview:vm.overview,filters:vm.filters,loading:vm.loading});
}

function protectedTransport(context,live) {
  return async (path,options={}) => {
    if (!live()) throw new DOMException('档案页面已关闭。','AbortError');
    const data = await apiNetwork(archivePath+path,{context,cache:'no-store',signal:context?.controller.signal,...options});
    if (!live()) throw new DOMException('档案页面已关闭。','AbortError');
    return data;
  };
}

function refreshFeeds(vm,request) {
  return Promise.all([
    request('/items?'+archiveQuery(vm.filters)).then(page=>{vm.page=acceptArchivePage(page,emptyPage());}),
    request('/overview').then(value=>{vm.overview=value;}).catch(error=>{
      if (error.status===401||error.status===403) throw error;
      vm.overview=null;
    })
  ]);
}

function updateItems(vm,request,reset) {
  if (reset) return refreshFeeds(vm,request);
  const query = archiveQuery(vm.filters,vm.page.offset,vm.page.revision);
  return request('/items?'+query).then(page=>{vm.page=acceptArchivePage(page,vm.page);});
}

function reportPath(vm,id,query='') {
  return `/reports/${vm.reportType}/${encodeURIComponent(id)}${query ? '?' + query : ''}`;
}

async function reportList(vm,request,reset) {
  const params = new URLSearchParams({type:vm.reportType,offset:String(reset?0:vm.reportOffset)});
  if (!reset&&vm.reportRevision!=null) params.set('read_revision',String(vm.reportRevision));
  const data = await request('/reports?'+params);
  vm.reports = reset ? data.items : [...vm.reports,...data.items];
  vm.reportOffset = data.next_offset;
  vm.reportMore = data.has_more;
  vm.reportRevision = data.read_revision;
}

async function openReport(vm,request,id,confirm=false) {
  if (!uuid(id)) throw new Error('请输入有效的汇报标识。');
  vm.reportDetail = await request(reportPath(vm,id,confirm?'confirm_v_account=1':''));
  vm.reportConfirm = confirm;
}

async function moreReportVersions(vm,request) {
  const prior = vm.reportDetail;
  const query = new URLSearchParams({history_offset:String(prior.next_history_offset)});
  if(prior.read_revision!=null)query.set('read_revision',String(prior.read_revision));
  if (vm.reportConfirm) query.set('confirm_v_account','1');
  const data = await request(reportPath(vm,prior.id,query));
  if (data.content_hash!==prior.content_hash) throw new Error('报告已更新，请重新读取版本历史。');
  vm.reportDetail = {...data,history:[...prior.history,...data.history]};
}

async function saveReport(vm,request,fields) {
  const row = vm.reportDetail;
  const keys = vm.reportType==='ai'?['author','content']:['summary_md'];
  const changes = Object.fromEntries(keys.map(key=>[key,fields[key]]).filter(([key,value])=>row[key]!==value));
  const confirmation = fields.confirm_v_account==='on';
  if (!Object.keys(changes).length && !confirmation) throw new Error('没有需要修订的内容。');
  vm.reportDetail = await request(reportPath(vm,row.id),{method:'PATCH',body:{
    expected_hash:row.content_hash,changes,...(confirmation?{confirm_v_account:true}:{})
  }});
  vm.notice = '已保存报告修订，并保留旧版本。';
  if(confirmation) {
    try {await reportList(vm,request,true);}
    catch(error) {
      if(error.name==='AbortError'||error.status===401||error.status===403)throw error;
      vm.notice+=' 报告列表可重新读取。';
    }
  }
}

async function selectTab(vm,request,tab) {
  if (!tabs.includes(tab)) return;
  vm.tab=tab;
  vm.detail=null;
  vm.legacy=null;
  resetLocalEditor(vm);
  vm.loading=false;
  if (tab==='items') await updateItems(vm,request,true);
  else if (tab==='completeness') vm.completeness=await request('/completeness');
  else if (tab==='imports') vm.runs=(await request('/imports')).items;
  else await reportList(vm,request,true);
}

async function selectDetail(vm,request,id) {
  if (!uuid(id)) throw new Error('档案标识无效。');
  vm.detail=await request('/items/'+id);
  resetLocalEditor(vm);
}

async function readBack(vm,request,id,notice) {
  resetLocalEditor(vm);
  vm.notice=notice;
  try {await selectDetail(vm,request,id);}
  catch(error) {
    if(error.name==='AbortError'||error.status===401||error.status===403)throw error;
    vm.notice=notice+' 详情尚未重新读取。';
  }
}

async function saveArchiveItem(vm,request,fields) {
  const changes = readArchiveItemEditor(fields,vm.detail || {});
  const verify = readArchiveVerification(fields);
  if (vm.detail && !Object.keys(changes).length && !verify.length) throw new Error('没有需要保存的修改。');
  if (vm.detail) {
    const path = '/items/'+encodeURIComponent(vm.detail.id);
    vm.detail = await request(path,{method:'PATCH',body:{expected_version:vm.detail.version,changes,verify}});
  } else {
    const source = vm.createDefaults;
    const linked = source ? {legacy_id:source.legacy_id,association_status:source.association_status} : {};
    vm.detail = await request('/items',{method:'POST',body:{id:vm.createId,...changes,...linked}});
  }
  await readBack(vm,request,vm.detail.id,'档案已保存。');
}

function detailRequest(form,fields,version,existing) {
  if (form==='reference') {
    const ref = Object.fromEntries(['kind','role','platform_id','title','url','saved_at','state'].map(key=>[key,nullable(fields[key])]));
    if(existing)ref.id=existing.id;
    const correction = existing ? {reason:nullable(fields.reason)} : {};
    return {path:'references',body:{expected_version:version,ref,...correction}};
  }
  if (form==='associate') return {path:'association',body:{expected_version:version,status:fields.status,reason:nullable(fields.reason)}};
  return {path:'merge',body:{expected_version:version,other_id:fields.other_id,other_version:Number(fields.other_version),
    action:fields.action,reason:nullable(fields.reason)}};
}

async function saveDetailAction(vm,request,form,fields) {
  const id=vm.detail.id, operation=detailRequest(form,fields,vm.detail.version,vm.editRef);
  await request('/items/'+encodeURIComponent(id)+'/'+operation.path,{method:'POST',body:operation.body});
  await readBack(vm,request,id,'档案关系已保存。');
}

async function loadLegacy(vm,request,reset) {
  const previous=reset?emptyPage():vm.legacy;
  const page=await request('/legacy?'+archiveQuery({},previous.offset,previous.revision));
  vm.legacy=acceptArchivePage({...page,items:page.items.map(row=>({...row,id:row.legacy_id}))},previous);
}

function chooseLegacy(vm,id) {
  const row=vm.legacy?.items.find(item=>item.legacy_id===id);
  if(!row)throw new Error('请先重新读取现有复盘。');
  const {id:ignored,...defaults}=row;
  vm.createDefaults=defaults;
  vm.createId=crypto.randomUUID();
  vm.editor='create';
}

async function previewImport(vm,request,form) {
  const file = form.elements.page_file?.files?.[0];
  const resume = vm.checkpoint && !vm.checkpoint.closed && !vm.checkpoint.completed_at ? vm.checkpoint : null;
  const input = await readArchiveImportFile(file,resume?.id);
  if (resume && input.page!==resume.next_page) throw new Error('请选择此批次的下一页文件。');
  const result = await request('/imports/preview',{method:'POST',body:input});
  vm.pendingPage=input;
  vm.preview=result;
  vm.reconcile=null;
}

async function importCheckpoint(vm,request,id) {
  vm.checkpoint=await request('/imports/'+encodeURIComponent(id));
  vm.reconcile=null;
}

async function applyImport(vm,request) {
  if (!vm.pendingPage || !vm.preview?.preview_hash) return;
  const body={...vm.pendingPage,preview_hash:vm.preview.preview_hash};
  const result=await request('/imports/apply',{method:'POST',body});
  vm.notice=result.replayed?'此页与已登记结果一致。':'本页结果与检查点已保存。';
  await importCheckpoint(vm,request,result.run_id);
  vm.preview=null;
  vm.pendingPage=null;
  vm.runs=(await request('/imports')).items;
}

const formActions = {
  async filter(vm,request,fields) {
    if (fields.from && fields.to && fields.from>fields.to) throw new Error('起始日期不可晚于结束日期。');
    vm.filters=fields;
    vm.page=emptyPage();
    await updateItems(vm,request,true);
  },
  item:saveArchiveItem,
  reference:(vm,request,fields)=>saveDetailAction(vm,request,'reference',fields),
  associate:(vm,request,fields)=>saveDetailAction(vm,request,'associate',fields),
  merge:(vm,request,fields)=>saveDetailAction(vm,request,'merge',fields),
  import:(vm,request,fields,form)=>previewImport(vm,request,form),
  async 'report-list'(vm,request,fields) {
    vm.reportType=fields.report_type==='ai'?'ai':'review';
    vm.reportDetail=null;
    await reportList(vm,request,true);
  },
  'report-lookup':(vm,request,fields)=>openReport(vm,request,fields.report_id,true),
  'report-edit':saveReport
};

function resetLocalEditor(vm) {
  vm.editor='';
  vm.createId=null;
  vm.createDefaults=null;
  vm.editRef=null;
}

const clickActions = {
  view:(vm,request,target)=>selectTab(vm,request,target.dataset.archiveView),
  detail:(vm,request,target)=>selectDetail(vm,request,target.dataset.archiveId),
  async back(vm,request) {vm.detail=null;vm.legacy=null;resetLocalEditor(vm);if(vm.tab==='items')await updateItems(vm,request,true);},
  create(vm) {resetLocalEditor(vm);vm.createId=crypto.randomUUID();vm.editor='create';},
  edit(vm) {vm.editor='item';},
  reference(vm) {vm.editRef=null;vm.editor='reference';},
  'edit-ref'(vm,request,target) {
    vm.editRef=vm.detail.refs.find(ref=>ref.id===target.dataset.archiveId&&ref.item_id===vm.detail.id);
    if(!vm.editRef)throw new Error('请到所属档案更正此标识。');
    vm.editor='reference';
  },
  associate(vm) {vm.editor='associate';},
  merge(vm) {vm.editor='merge';},
  cancel:resetLocalEditor,
  refresh:(vm,request)=>updateItems(vm,request,true),
  more:(vm,request)=>updateItems(vm,request,false),
  legacy:(vm,request)=>loadLegacy(vm,request,true),
  'legacy-more':(vm,request)=>loadLegacy(vm,request,false),
  'legacy-select':(vm,request,target)=>chooseLegacy(vm,target.dataset.archiveId),
  async 'reset-filters'(vm,request) {vm.filters={};vm.page=emptyPage();await updateItems(vm,request,true);},
  async 'import-detail'(vm,request,target) {
    await importCheckpoint(vm,request,target.dataset.archiveId);
    vm.preview=null;
    vm.pendingPage=null;
  },
  'import-apply':applyImport,
  async reconcile(vm,request) { vm.reconcile=await request('/imports/'+encodeURIComponent(vm.checkpoint.id)+'/reconcile'); },
  'report-detail':(vm,request,target)=>openReport(vm,request,target.dataset.archiveId),
  'report-more':(vm,request)=>reportList(vm,request,false),
  'report-history-more':moreReportVersions,
  'report-close'(vm) {vm.reportDetail=null;}
};

function bindArchive(root,vm,request,live,context,lock) {
  let running=false;
  const paint=()=>{if(live())root.innerHTML=renderArchiveFrame(vm.tab,archiveView(vm),vm);};
  const wipe=()=>{
    lock.active=false;
    root.replaceChildren();
    root.removeEventListener('click',click);
    root.removeEventListener('submit',submit);
    Object.assign(vm,createView());
  };
  async function run(operation,{form,target}={}) {
    if(running||!live())return;
    running=true;
    vm.notice='';vm.error='';
    const status=form?.querySelector('[data-archive-status]');
    const control=target||form?.querySelector('button[type="submit"]');
    if(control)control.disabled=true;
    if(status)status.textContent='处理中…';
    try {await operation();paint();}
    catch(error) {
      if(!live()||error.name==='AbortError')return;
      if(error.status===401||error.status===403) {
        wipe();
        root.textContent='此档案仅对站点所有者开放。';
      } else if(status) status.textContent=error.message||'操作失败，请重新读取。';
      else {vm.error=error.message||'操作失败，请重新读取。';paint();}
    } finally {running=false;if(control?.isConnected)control.disabled=false;}
  }
  const click=event=>{
    const target=event.target.closest?.('[data-archive-action]');
    const handler=target&&clickActions[target.dataset.archiveAction];
    if(handler&&root.contains(target))void run(()=>handler(vm,request,target),{target});
  };
  const submit=event=>{
    const form=event.target;
    const handler=formActions[form.dataset.archiveForm];
    if(!handler)return;
    event.preventDefault();
    void run(()=>handler(vm,request,Object.fromEntries(new FormData(form)),form),{form});
  };
  root.addEventListener('click',click);
  root.addEventListener('submit',submit);
  const show=event=>{if(event.persisted&&reviewArchiveActive())location.reload();};
  window.addEventListener('pagehide',wipe,{once:true});
  window.addEventListener('pageshow',show);
  context?.controller.signal.addEventListener('abort',()=>{
    window.removeEventListener('pagehide',wipe);
    window.removeEventListener('pageshow',show);
    wipe();
  },{once:true});
  return {paint,run};
}

export async function loadReviewArchive(context) {
  if (!canAccessReviewArchive(state.me,state.account)) return;
  const root=document.getElementById('review-archive');
  if (!root) return;
  const epoch=runtime.sessionEpoch,identity=state.me.id;
  const lock={active:true};
  const live=()=>lock.active && root.isConnected && runtime.sessionEpoch===epoch && state.me?.id===identity &&
    reviewArchiveActive() && canAccessReviewArchive(state.me,state.account) && !context?.controller.signal.aborted;
  const vm=createView(),request=protectedTransport(context,live);
  const {paint,run}=bindArchive(root,vm,request,live,context,lock);
  paint();
  await run(async()=>{try{await updateItems(vm,request,true);}finally{vm.loading=false;}});
}
