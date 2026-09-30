// Unit tests with a fake DOM and mocked network; no real task endpoints are called.
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync(join(__dirname, '../article_hub/console_page.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
new vm.Script(script); // Check the complete page script, including initialization.
const elements = new Map();
const makeElement = tag => ({
  tagName:String(tag || 'div').toUpperCase(), style:{}, dataset:{}, children:[],
  textContent:'', value:'', checked:false, disabled:false, className:'', open:false,
  append(...items){this.children.push(...items);},
  appendChild(item){this.children.push(item);return item;},
  prepend(item){this.children.unshift(item);},
  replaceChildren(...items){this.children=[...items];},
  addEventListener(){},
});
const element = id => {
  if (!elements.has(id)) elements.set(id, makeElement(id));
  return elements.get(id);
};
const context = vm.createContext({
  document:{getElementById:element, querySelectorAll:()=>[], createElement:makeElement},
  sessionStorage:{setItem(){}}, setTimeout, clearInterval(){}, AbortSignal,
  fetch:async()=>({ok:false,status:500,json:async()=>({error:'模拟服务错误'})})
});
vm.runInContext(script.slice(0, script.lastIndexOf('var buttons = document.querySelectorAll')), context);
context.latestState = {busy:false,topics:[]};
context.refresh = ()=>{};
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
  context.document.querySelectorAll = selector => selector === 'input[name="topic-source"]' ? [{checked:true,value:'微博'}] : [];
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
  context.renderBanner({...job,id:'login-2',status:'running'});
  assert.equal(element('banner').style.display, 'block');
  showTab(5);
  context.renderBanner({...job,id:'login-2',status:'running'});
  assert.equal(element('banner').style.display, 'none', 'Running status belongs to its task page');
  context.document.querySelectorAll = ()=>[{checked:true,value:'今日头条'},{checked:false,value:'小红书'}];
  assert.equal(decodeURIComponent(context.imageSourceQuery()), '&sources=全网&allow_ai_images=1');
  assert.deepEqual(Array.from(context.selectedImageSources()), ['全网'], 'The image workflow exposes one full-web source instead of platform checkboxes');
  context.document.querySelectorAll = selector=>selector.includes('topic-category') ? [] : [{checked:true,value:'微博'},{checked:false,value:'今日头条'}];
  assert.equal(decodeURIComponent(context.topicSourceQuery()), '&sources=微博&categories=');
  context.document.querySelectorAll = ()=>[];
  assert.throws(()=>context.topicSourceQuery(), /至少选择/);
  element('manual-topics').value = '1. 班主任体罚学生被调岗\n2、外卖骑手深夜送单后猝死；班主任体罚学生被调岗\n\n';
  assert.deepEqual(Array.from(context.manualTopicTitles()), ['班主任体罚学生被调岗','外卖骑手深夜送单后猝死'], 'Manual input takes one topic per line, strips numbering and dedupes');
  context.updateManualCount();
  assert.equal(element('manual-count').textContent, '2/6 条');
  element('manual-topics').value = Array.from({length:8},(_,index)=>'选题'+(index+1)).join('\n');
  context.updateManualCount();
  assert.match(element('manual-count').textContent, /8\/6 条（超出上限/);
  context.completedJob='saved-1';
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
