// Unit tests with a fake DOM and mocked network; no real task endpoints are called.
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync(join(__dirname, '../article_hub/console_page.html'), 'utf8');
assert.match(html, /\/api\/article-output\?article_id=/);
assert.match(html, /var outputUrl=.*replace\(\/'\/g,'%27'\)/);
assert.match(html, /outputUrl\+"preview/);
assert.match(html, /outputUrl\+"docx/);
const script = html.split('<script>')[1].split('</script>')[0];
new vm.Script(script); // Check the complete page script, including initialization.
const elements = new Map();
const storageData = new Map();
const makeElement = tag => {
  const parent= {style:{},dataset:{},children:[],append(){},appendChild(){},prepend(){},
    querySelector(){return makeElement('div');},parentElement:{parentElement:null}};
  return {
  tagName:String(tag || 'div').toUpperCase(), style:{}, dataset:{}, children:[],
  textContent:'', value:'', checked:false, disabled:false, className:'', open:false,
  isConnected:true, parentElement:parent, classList:{toggle(){}}, setAttribute(){},
  querySelectorAll(){return [];},
  closest(){return null;},
  append(...items){this.children.push(...items);},
  appendChild(item){this.children.push(item);return item;},
  prepend(item){this.children.unshift(item);},
  replaceChildren(...items){this.children=[...items];},
  querySelector(selector){return selector==='label'?makeElement('label'):makeElement('div');},
  addEventListener(){},
  };
};
const element = id => {
  if (!elements.has(id)) elements.set(id, makeElement(id));
  return elements.get(id);
};
const context = vm.createContext({
  document:{getElementById:element, querySelectorAll:()=>[], querySelector:()=>makeElement('div'),
    createElement:makeElement, createTextNode:text=>({textContent:text})},
  sessionStorage:{setItem(key,value){storageData.set(key,String(value));},
    getItem(key){return storageData.has(key)?storageData.get(key):null;},
    removeItem(key){storageData.delete(key);}}, setTimeout, clearInterval(){}, AbortSignal,
  fetch:async()=>({ok:false,status:500,json:async()=>({error:'模拟服务错误'})})
});
vm.runInContext(script.slice(0, script.lastIndexOf('var buttons = document.querySelectorAll')), context);
context.latestState = {busy:false,topics:[]};
context.refresh = ()=>{};
context.selectionForTask = async()=>''; // Keep this test focused on the task request and error banner.
context.currentTab = 1; // Errors from topic actions are rendered on the topic page.
const showTab = context.showTab;
context.showTab = ()=>{};
(async()=>{
  await assert.rejects(context.request('/fake'), /模拟服务错误/);
  let writeOptions = null;
  context.fetch = async(url, options)=>{writeOptions=options;return {ok:true,status:200,json:async()=>({ok:true})};};
  await context.request('/fake-write',{method:'POST',headers:{'Content-Type':'application/json'}});
  assert.equal(writeOptions.headers['X-Haoduoyu-Token'],'__HAODUOYU_REQUEST_TOKEN__');
  assert.equal(writeOptions.headers['Content-Type'],'application/json');
  context.fetch = async()=>({ok:false,status:500,json:async()=>({error:'模拟服务错误'})});
  context.document.querySelectorAll = selector => selector === 'input[name="topic-source"]' ? [{checked:true,value:'微博',closest:()=>null}] : [];
  await context.run('选题');
  assert.equal(element('banner').textContent, '模拟服务错误');
  assert.equal(element('banner').style.display, 'block');
  assert.equal(context.actionPending, false);
  await context.dispatchAll({});
  assert.equal(element('banner').textContent, '模拟服务错误');
  assert.equal(context.dispatching, false);
  context.fetch = async()=>({ok:true,json:async()=>({copied:['头条：文章'],errors:['知乎失败'],skipped:[],moved:[]})});
  await context.dispatchAll({});
  assert.match(element('banner').textContent, /知乎失败/);
  assert.equal(context.notice.bad, true);
  context.fetch = async()=>({ok:true,json:async()=>({copied:['头条：文章','知乎：文章','百家号：文章'],errors:[],warnings:['文章已分发并归档，源目录待清理；不会重复分发'],skipped:[],moved:['文章'],cleanup_pending:['文章']})});
  await context.dispatchAll({});
  assert.match(element('banner').textContent, /已完成 3 项平台分发/);
  assert.match(element('banner').textContent, /源目录待清理/);
  assert.equal(context.notice.bad, false,'A Windows cleanup lock is a successful distribution with a warning');
  assert.match(context.fileLink("D:/选题/a'b.md", '打开'), /a%27b/);
  assert.doesNotMatch(context.fileLink('D:/a.md', '打开'), /file:/);
  element('clearimg').disabled = false;
  context.document.querySelectorAll = ()=>[element('clearimg')];
  context.offline();
  context.miss = 2;
  context.updateControls();
  assert.equal(element('clearimg').disabled, true);
  context.document.querySelectorAll = ()=>[];
  context.clearNotice();
  const topicControl=element('topic-control'), imageControl=element('image-control'), dispatchControl=element('dispatch-control');
  context.latestState={busy:false,topics:[]};context.miss=0;context.recommendationBusy=true;context.dispatching=false;context.actionPending=false;
  context.document.querySelectorAll = selector=>{
    if(selector.startsWith('button[data-task],')) return [topicControl,imageControl,dispatchControl];
    if(selector.includes("button[data-task='选题']")) return [topicControl];
    if(selector.includes("button[data-task='配图']")) return [imageControl];
    if(selector.includes('button[data-send-all]')) return [dispatchControl];
    return [];
  };
  context.updateControls();
  assert.equal(topicControl.disabled,true,'Recommendation work locks only topic controls');
  assert.equal(imageControl.disabled,false,'Recommendation work leaves image controls available');
  assert.equal(dispatchControl.disabled,false,'Recommendation work leaves dispatch controls available');
  context.recommendationBusy=false;context.dispatching=true;context.updateControls();
  assert.equal(topicControl.disabled,false);
  assert.equal(imageControl.disabled,false);
  assert.equal(dispatchControl.disabled,true,'Dispatch work locks only dispatch controls');
  context.dispatching=false;
  context.currentTab = 2;
  const job = {id:'login-1',task:'登录小红书',title:'登录',status:'ok',summary:'登录完成'};
  context.renderBanner(job);
  assert.equal(element('banner').style.display, 'none', 'Old completed jobs stay hidden after reload');
  context.renderBanner({...job,status:'running'});
  context.renderBanner(job);
  assert.equal(element('banner').style.display, 'block');
  const expires = context.notice.expires;
  context.renderBanner(job);
  assert.equal(context.notice.expires, expires, 'Polling must not extend notice lifetime');
  context.notice.expires = 0;
  context.renderBanner(job);
  assert.equal(element('banner').style.display, 'none');
  context.renderBanner(job);
  assert.equal(element('banner').style.display, 'none', 'Polling must not resurrect completed notices');
  context.message('已完成');
  showTab(5);
  assert.equal(element('banner').style.display, 'none');
  context.renderBanner(job);
  assert.equal(element('banner').style.display, 'none');
  showTab(2);
  context.renderBanner(job);
  assert.equal(element('banner').style.display, 'none', 'Returning to the task page keeps the result dismissed');
  // A running marker survives a page refresh even when the in-memory map is lost.
  const loginScope=context.taskJobScope(job.task,job.topic);
  const refreshJob={...job,id:'refresh-1'};
  context.renderBanner({...refreshJob,status:'running'});
  delete context.observedJobs[loginScope];
  context.renderBanner({...refreshJob,status:'ok'});
  assert.match(element('banner').textContent,/登录完成/,'A task observed before refresh reports its completion');
  assert.equal(storageData.has('haoduoyu-observed-job:'+loginScope),false,'Completion clears the persisted running marker');
  // After completion, another refresh cannot replay the same notice.
  context.pageNotices[2]=null;context.notice=null;context.completedJobs[loginScope]=undefined;
  context.renderBanner({...refreshJob,status:'ok'});
  assert.equal(element('banner').style.display,'none','A completed job is not replayed after refresh');
  // Finishing while another tab is active records completion without showing a stray banner.
  const tabJob={...job,id:'tab-1'};
  context.currentTab=2;context.renderBanner({...tabJob,status:'running'});
  context.currentTab=5;context.renderBanner({...tabJob,status:'ok'});
  assert.equal(element('banner').style.display,'none','Completion on another tab stays hidden');
  context.currentTab=2;context.renderBanner({...tabJob,status:'ok'});
  assert.equal(element('banner').style.display,'none','Changing back does not replay a cross-tab completion');
  // Exercise the real navigation/pageJob path: the image task finishes while
  // the user is on another page, then its completion appears on return.
  context.showTab=showTab;
  const navigatedJob={id:'navigated-draft',task:'一键送草稿',title:'草稿发送',status:'running',summary:'草稿任务完成'};
  context.latestState={busy:false,topics:[],jobs:{drafts:navigatedJob}};
  context.currentTab=4;showTab(4);
  showTab(2);
  context.latestState.jobs.drafts={...navigatedJob,status:'ok'};
  showTab(4);
  assert.match(element('banner').textContent,/草稿任务完成/,'Returning through showTab resolves the completed page job');
  context.showTab=()=>{};
  const crossTaskLogin={...job,id:'cross-login',status:'running'};
  const crossTaskDraft={id:'cross-draft',task:'一键送草稿',title:'草稿',status:'running',summary:'草稿任务完成'};
  context.currentTab=2;context.renderBanner(crossTaskLogin);
  context.currentTab=4;context.renderBanner(crossTaskDraft);
  const draftScope=context.taskJobScope(crossTaskDraft.task,crossTaskDraft.topic);
  assert.equal(storageData.get('haoduoyu-observed-job:'+loginScope),'cross-login');
  assert.equal(storageData.get('haoduoyu-observed-job:'+draftScope),'cross-draft');
  context.currentTab=2;context.renderBanner({...crossTaskLogin,status:'ok'});
  assert.equal(storageData.get('haoduoyu-observed-job:'+draftScope),'cross-draft','Completing one task leaves another task marker intact');
  context.currentTab=4;context.renderBanner({...crossTaskDraft,status:'ok'});
  assert.match(element('banner').textContent,/草稿任务完成/,'A different task reports its own completion');
  // Two jobs sharing one task scope retain independent IDs; a second run in
  // the same scope can notify after the first one completes.
  const firstDraft={id:'draft-1',task:'一键送草稿',title:'草稿',status:'running',summary:'第一项完成'};
  const secondDraft={...firstDraft,id:'draft-2',summary:'第二项完成'};
  context.currentTab=4;context.renderBanner(firstDraft);context.renderBanner({...firstDraft,status:'ok'});
  context.renderBanner(secondDraft);context.renderBanner({...secondDraft,status:'ok'});
  assert.match(element('banner').textContent,/第二项完成/,'A consecutive job in the same scope has its own completion');
  // Storage can be disabled by the browser; the in-memory path still works.
  context.sessionStorage={setItem(){throw Error('disabled');},getItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};
  const offlineStorageJob={id:'offline-storage',task:'登录小红书',title:'登录',status:'running',summary:'离线存储完成'};
  context.currentTab=2;context.renderBanner(offlineStorageJob);context.renderBanner({...offlineStorageJob,status:'ok'});
  assert.match(element('banner').textContent,/离线存储完成/,'Storage errors do not break same-session completion');
  context.renderBanner({...job,id:'login-2',status:'running'});
  assert.equal(element('banner').style.display, 'block');
  showTab(5);
  context.renderBanner({...job,id:'login-2',status:'running'});
  assert.equal(element('banner').style.display, 'none', 'Running status belongs to its task page');
  context.document.querySelectorAll = selector=>selector.includes('image-source') ? [{checked:true,value:'全网'},{checked:true,value:'今日头条'}] : [];
  assert.equal(decodeURIComponent(context.imageSourceQuery()), '&sources=全网,今日头条');
  assert.deepEqual(Array.from(context.selectedImageSources()), ['全网','今日头条'], 'Only explicitly selected image sources are sent');
  context.document.querySelectorAll = selector=>selector.includes('topic-category') ? [] : [{checked:true,value:'微博',closest:()=>null},{checked:false,value:'今日头条',closest:()=>null}];
  assert.equal(decodeURIComponent(context.topicSourceQuery()), '&sources=微博&categories=');
  context.document.querySelectorAll = ()=>[];
  assert.throws(()=>context.topicSourceQuery(), /至少选择/);
  element('manual-topics').value = '1. 班主任体罚学生被调岗\n2、外卖骑手深夜送单后猝死；班主任体罚学生被调岗\n3. 班主任体罚学生被调岗\n4. 新标题；共享分句\n5. 另一标题；共享分句\n\n';
  assert.deepEqual(Array.from(context.manualTopicTitles()), ['班主任体罚学生被调岗','外卖骑手深夜送单后猝死；班主任体罚学生被调岗','新标题；共享分句','另一标题；共享分句'], 'Deduplicate only complete numbered titles and preserve semicolon-separated clauses');
  context.updateManualCount();
  assert.equal(element('manual-count').textContent, '4/6 条');
  element('manual-topics').value = Array.from({length:8},(_,index)=>'选题'+(index+1)).join('\n');
  context.updateManualCount();
  assert.match(element('manual-count').textContent, /8\/6 条（超出上限/);
  context.completedJobs.drafts='saved-1';
  context.renderDraftResult({draft_status:{
    id:'saved-1',task:'一键送草稿',status:'ok',lines:[
      '[进度] 写第 1/1 个平台：百家号',
      '[发送结果] {"platform":"百家号","title":"自动发送文章","status":"saved","reason":""}'
    ]
  }});
  const savedResult=JSON.stringify(element('draft-summary'));
  assert.match(savedResult,/发送成功/);
  assert.match(savedResult,/成功 1/);
  assert.match(savedResult,/已存入草稿箱/);
  assert.doesNotMatch(savedResult,/手动发布/);
  console.log('PASS: notice expiration, navigation cleanup, completed job suppression, syntax, HTTP errors, run errors, partial dispatch, action unlock, file links, offline controls');
})().catch(error=>{console.error(error);process.exitCode=1;});
