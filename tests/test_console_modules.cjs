const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html=readFileSync(join(__dirname,'../article_hub/console_page.html'),'utf8');
const script=html.split('<script>')[1].split('</script>')[0];
new vm.Script(script);
function fixture(){
  const elements=new Map();
  const el=id=>{if(!elements.has(id))elements.set(id,{style:{},textContent:'',innerHTML:''});return elements.get(id);};
  const c=vm.createContext({document:{getElementById:el},currentTab:1,pendingActions:{},latestState:null,escapeHtml:x=>x});
  vm.runInContext(script.slice(script.indexOf('function pageScope('),script.indexOf('async function clearImages(')),c);
  vm.runInContext(script.slice(script.indexOf('function isArticleImageJob('),script.indexOf('function imageStatus(')),c);
  vm.runInContext(script.slice(script.indexOf('function renderProgress('),script.indexOf('var recommendationData')),c);
  return {c,el};
}
test('image progress stays inside its workflow and both modules retain task state',()=>{
  const {c,el}=fixture();
  const images={id:1,task:'配图',title:'图片',status:'running',started:'10:00'};
  c.latestState={jobs:{images},module_progress:{images:{percent:30,label:'图片进度'}}};
  assert.equal(c.moduleBusy(1),false);
  assert.equal(c.moduleBusy(2),true);
  c.renderProgress(c.latestState);
  assert.equal(el('progress').style.display,'none');
  c.latestState.jobs.topics={id:2,task:'选题',title:'选题',status:'running',started:'10:01'};
  c.latestState.module_progress.topics={percent:50,label:'选题进度'};
  c.renderProgress(c.latestState);
  assert.equal(el('plabel').textContent,'选题进度');
  c.currentTab=2;c.renderProgress(c.latestState);
  assert.equal(el('progress').style.display,'none','Image task progress is shown inside the matching folded section');
  assert.equal(c.pageJob(c.latestState,1).id,2);
  assert.equal(c.pageJob(c.latestState,2).id,1);
});
test('pending requests lock their own module only',()=>{
  const {c}=fixture();
  c.latestState={jobs:{}};c.pendingActions[2]=true;
  assert.equal(c.moduleBusy(1),false);
  assert.equal(c.moduleBusy(2),true);
});
