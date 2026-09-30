// Exercise the separated image-review board with a minimal DOM and mocked requests.
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=readFileSync(join(__dirname,'../article_hub/console_page.html'),'utf8');
assert.match(html,/data-topic-import-plan[\s\S]*importTopicImagePlan\(/);
assert.equal((html.match(/id="save-image-text"/g)||[]).length,1,'The image model has its own save button');
assert.equal((html.match(/id="save-image-layout"/g)||[]).length,1,'The layout model has its own save button');
assert.doesNotMatch(html,/id="model-images"|image-role-vision|id="image-mode"/,'Duplicate and retired visual model controls are removed');
assert.doesNotMatch(html,/image-collaboration-advanced|自定义服务或型号|image-role-(text|layout)-custom/,'Business pages do not expose the advanced custom service/model editor');
assert.match(html,/<section id="image-tab-images"[\s\S]*?<select id="image-role-text"/,'The image model control is inside the image tab');
assert.match(html,/<section id="image-tab-layout"[\s\S]*?<select id="image-role-layout"/,'The layout model control is inside the layout tab');
for(const id of ['topic-image-workflow','legacy-image-workflow']){
  const tag=html.match(new RegExp('<details id="'+id+'"[^>]*>'));
  assert.ok(tag, id+' exists as an independent workflow');
  assert.doesNotMatch(tag[0],/\bopen\b/, id+' starts collapsed');
}
const script=html.split('<script>')[1].split('</script>')[0];
class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.value='';this.disabled=false;this.open=false;this.textContent='';this.className='';this.innerHTML='';this.options=[];}
  append(...items){this.children.push(...items);}
  appendChild(item){this.append(item);item.isConnected=true;return item;}
  prepend(item){this.children.unshift(item);}
  cloneNode(){const copy=new Element(this.tagName);copy.className=this.className;copy.textContent=this.textContent;copy.style={...this.style};copy.attributes={...this.attributes};return copy;}
  replaceChildren(...items){this.children=items;}
  setAttribute(name,value){this.attributes[name]=value;}
  addEventListener(name,listener){this.listeners=this.listeners||{};this.listeners[name]=listener;}
  querySelectorAll(){return [];}
  querySelector(selector){if(selector==='select[data-layout-word-choice]'){return walk(this).find(node=>node.tagName==='select'&&node.dataset&&node.dataset.layoutWordChoice);}if(selector==='[data-keyword-save]'){if(!this.keywordSaveNode)this.keywordSaveNode=new Element('button');return this.keywordSaveNode;}if(selector==='.source-options'){if(!this.sourceOptions)this.sourceOptions=new Element();return this.sourceOptions;}if(selector==='select'){if(!this.selectNode)this.selectNode=new Element('select');return this.selectNode;}return null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const elements=new Map();
const element=id=>{if(!elements.has(id)){const existing=allNodes().find(node=>node.id===id);if(existing)return existing;elements.set(id,new Element());}return elements.get(id);};
const walk=node=>[node,...node.children.flatMap(child=>child && typeof child==='object'?walk(child):[])];
const allNodes=()=>Array.from(elements.values()).flatMap(walk);
const select=selector=>{
  if(selector==='input[name="image-source"]:checked')return [{value:'豆瓣'}];
  const attribute=selector.match(/^\[data-([a-z-]+)\]$/);
  if(attribute){const key=attribute[1].replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());return allNodes().filter(node=>Object.prototype.hasOwnProperty.call(node.dataset,key));}
  return [];
};
let calls=[];
let reviewRequests=0,holdFirstReview=false,releaseFirstReview=null;
const context=vm.createContext({
  document:{createElement:tag=>new Element(tag),createTextNode:text=>{const node=new Element();node.textContent=text;return node;},getElementById:element,
    querySelector:selector=>selector==='#topic-recommendations .section-head'?Object.assign(new Element(),{isConnected:true}):selector.startsWith('#topic-sources ')?new Element():null,querySelectorAll:select},
  localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{setItem(){}},
  setTimeout,clearTimeout,clearInterval(){},AbortSignal,AbortController,console,
  fetch:async(url,options)=>{calls.push({url,options});const requestBody=options&&options.body?JSON.parse(options.body):{};if(url==='/api/image-review'){reviewRequests++;if(holdFirstReview&&reviewRequests===1){await new Promise(resolve=>{releaseFirstReview=resolve;});}}const data=url==='/api/image-action'?{job:{id:12,task:'配图',status:'running',topic:requestBody.topic,lines:[]}}:url==='/api/topic-image-folder-open'?{folder_path:'D:/临时/重复标题'}:url==='/api/topic-final-open'?{filename:'重复标题.docx'}:{ok:true,revision:3,export_sync:{ok:true,count:Object.values(requestBody.states||{}).includes('approved')?1:0,folder_name:'重复标题',folder_path:'D:/临时/重复标题'}};return {ok:true,json:async()=>data};}
});
vm.runInContext(script.slice(0,script.lastIndexOf('var buttons = document.querySelectorAll')),context);
context.modelConfig={image_collaboration:{mode:'single',roles:{}}};
context.renderImageCollaboration();
context.refresh=()=>{};context.render=()=>{};
const makePlan=(id,order,query)=>({position_id:id,purpose:'body',order,query,section_id:'',scene:'',exclude:[],heading:''});
const a={topic:'TP-20260924-aaaaaaaa',topic_id:'TP-20260924-aaaaaaaa',title:'重复标题',topic_package:true,
  plan_ready:true,has_word:false,phase:'review',target_count:2,unfilled_plan_count:1,
  image_progress:{stage:'相关性筛选',round:2,searches_done:2,searches_total:4,model_roles:{
    text:{provider:'DeepSeek',model:'ds-text-v2',duty:'筛选来源文字',status:'已完成',detail:'已检查 2/2 条',completed:2,total:2,elapsed_seconds:3.2,result:'放行 1 条'},
    vision:{provider:'GPT',model:'gpt-vision-test',duty:'检查实际画面',status:'运行中',detail:'已检查 3 张',completed:3,total:null,elapsed_seconds:5.1,result:'正在比较构图'},
    layout:{provider:'豆包',model:'doubao-layout-test',duty:'排版时匹配段落',status:'未调用',detail:'待点击排版后执行',completed:0,total:null,elapsed_seconds:0,result:''}}},
  image_plan:[makePlan('p1',0,'喜人奇妙夜'),makePlan('p2',1,'吕严')],images:[
    {name:'a-1.jpg',title:'A候选1',review_status:'pending',mtime:1,plan_position:'p1',query:'喜人奇妙夜'},
    {name:'a-2.jpg',title:'A候选2',review_status:'rejected',mtime:1,plan_position:'p2',query:'吕严'}]};
const b={topic:'TP-20260924-bbbbbbbb',topic_id:'TP-20260924-bbbbbbbb',title:'重复标题',topic_package:true,
  plan_ready:true,has_word:false,phase:'collecting',target_count:1,unfilled_plan_count:1,
  image_plan:[makePlan('b1',0,'李川')],images:[
    {name:'b-1.jpg',title:'B候选1',review_status:'pending',mtime:1,plan_position:'b1',query:'李川'}]};
const old={topic:'旧版文章目录',title:'旧版文章',topic_package:false,target_count:2,images:[
  {name:'old-1.jpg',title:'旧版图片',review_status:'approved',mtime:1,context:'原稿小节'}]};
const job={id:9,task:'配图',status:'running',topic:b.topic,lines:[]};
const state={busy:false,topics:[],image_review:[a,b,old],sourcing_status:{},jobs:{images:job}};
context.latestState=state;
context.renderImageReview(state);
context.currentTab=2;context.renderProgress(state);context.renderBanner(job);
assert.equal(element('progress').style.display,'none','The shared module progress bar does not mix old and new image tasks');
assert.equal(element('banner').style.display,'none','Task completion/error details remain inside the matching workflow');
const topicBox=element('topic-image-review'),legacyBox=element('legacy-image-review');
assert.deepEqual(walk(topicBox).filter(node=>node.dataset && node.dataset.topic).map(node=>node.dataset.topic),[a.topic,b.topic]);
assert.deepEqual(walk(legacyBox).filter(node=>node.dataset && node.dataset.topic).map(node=>node.dataset.topic),[old.topic]);
assert.equal(walk(topicBox).filter(node=>node.tagName==='details'&&node.className==='review-topic').every(node=>!node.open),true,'Article cards start collapsed');
assert.equal(findText(topicBox,'重复标题 · '+a.topic+' · 0 已保留 / 1 待选 / 1 已去掉')!==undefined,true,'Same-title articles are distinguished by stable IDs');
assert.ok(findText(topicBox,'本篇正在搜图；本篇候选正在写入，其他文章仍可继续选图。'));
assert.ok(findText(topicBox,'文本相关性检查 · 已完成'));
assert.ok(findText(topicBox,'DeepSeek · ds-text-v2'));
assert.equal(findText(topicBox,'图片视觉检查 · 运行中'),undefined,'视觉检查角色已下线，进度卡不再渲染 vision');
assert.ok(findText(topicBox,'排版匹配 · 未调用'));
assert.ok(findText(topicBox,'待点击排版后执行'));
const historicalProgress=new Element();context.appendTopicImageProgress(historicalProgress,{stage:'本轮结束'},null);
assert.ok(findText(historicalProgress,'这条旧进度没有保存模型分工快照；不会用当前设置伪造当时的模型状态。'));
assert.equal(walk(topicBox).filter(node=>node.tagName==='progress').length>=1,true,'Known model totals get a real progress bar; unknown totals do not get invented percentages');
const decisionGroups=walk(topicBox).concat(walk(legacyBox)).filter(node=>node.className==='image-decisions');
assert.equal(decisionGroups.length,4,'Every visible candidate shows its keep/remove controls');
decisionGroups.forEach(group=>assert.deepEqual(group.children.map(button=>button.textContent),['保留','去掉']));
assert.equal(walk(topicBox).concat(walk(legacyBox)).some(node=>['设为封面','换一张','换图'].includes(node.textContent)),false);
assert.ok(html.includes('正在记录选图并同步标题文件夹…'),'An optimistic syncing state must not claim that the choice is already saved');
assert.ok(!html.includes('图片选择已记录，正在同步标题文件夹…'));
assert.ok(findText(topicBox,'按此词搜图'),'A removed plan position can be searched again with its own keyword');
assert.ok(findText(topicBox,'继续搜图（本轮目标20张）'),'An article can continue searching after all plan positions have candidates');
assert.equal(findText(topicBox,'补 AI 配图'),undefined);
assert.equal(findText(findLayoutTopic(element('legacy-layout-review'),old.topic),'确认选图并排版（1 张）')!==undefined,true,'Legacy Word layout action stays in its own section');

function findText(root,text){return walk(root).find(node=>node.textContent===text);}
function nodeText(root){return walk(root).map(node=>node.textContent).join(' ');}
function findArticle(root,topic){return walk(root).find(node=>node.dataset&&node.dataset.topic===topic&&node.tagName==='details');}
function findLayoutTopic(root,topic){return walk(root).find(node=>node.dataset&&node.dataset.topic===topic&&node.className==='review-topic layout-topic');}
// Refresh must not open either top-level panel or move results between boards.
const articleA=findArticle(topicBox,a.topic);articleA.open=true;articleA.ontoggle();
context.renderImageReview({...state,sourcing_status:{状态:'运行中',文章:[]}});
assert.equal(findArticle(topicBox,a.topic).open,true,'An article’s own open state survives polling');
assert.equal(findArticle(topicBox,b.topic).open,false);

(async()=>{
  context.updateControls();
  const aKeep=walk(findArticle(topicBox,a.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='keep');
  const aRemove=walk(findArticle(topicBox,a.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='remove'&&node.attributes['aria-label']==='去掉：A候选1');
  const bKeep=walk(findArticle(topicBox,b.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='keep');
  assert.equal(aKeep.disabled,false,'Article A remains selectable while article B searches');
  assert.equal(aRemove.disabled,false);
  assert.equal(bKeep.disabled,true,'Only the article currently being written is locked');
  const bRemove=walk(findArticle(topicBox,b.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='remove');
  assert.equal(bRemove.disabled,true,'The busy article’s remove control is disabled too');
  await context.chooseImageAction(a.topic,'a-2.jpg','keep');
  await context.chooseImageAction(a.topic,'a-1.jpg','remove');
  assert.equal(calls.filter(call=>call.url==='/api/image-review').length,2);
  assert.equal(a.images[0].review_status,'rejected');
  assert.equal(a.images[1].review_status,'approved','A rejected candidate can be corrected back to keep');
  assert.ok(findText(findArticle(topicBox,a.topic),'已确认去掉；源候选保留，标题文件夹已同步。'),'A successful choice has persistent per-article feedback');
  calls.length=0;reviewRequests=0;holdFirstReview=true;
  const rapidKeep=context.setImageDecision(a.topic,'a-1.jpg','approved');
  const rapidRemove=context.setImageDecision(a.topic,'a-1.jpg','rejected');
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(reviewRequests,1,'Same-article decisions are serialized while an earlier save is in flight');
  const pendingKeep=walk(findArticle(element('topic-image-review'),a.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='keep');
  assert.equal(pendingKeep.disabled,false,'Keep/remove stay clickable so quick decisions queue instead of disappearing');
  releaseFirstReview();await Promise.all([rapidKeep,rapidRemove]);holdFirstReview=false;
  assert.deepEqual(calls.filter(call=>call.url==='/api/image-review').map(call=>JSON.parse(call.options.body).states['a-1.jpg']),['approved','rejected']);
  assert.equal(a.images[0].review_status,'rejected','The latest rapid decision remains visible after older requests finish');
  assert.equal(reviewRequests,2,'Every queued choice is sent in order');
  const polled={...state,jobs:{images:{...job,lines:['B 的进度更新']}}};
  context.latestState=polled;context.renderImageReview(polled);
  assert.equal(a.images[0].review_status,'rejected','Polling another article does not overwrite A’s saved decision');
  assert.equal(a.images[1].review_status,'approved');
  calls.length=0;
  assert.equal(calls.filter(call=>call.url==='/api/image-selection').length,0,'Decisions no longer require manual export');
  assert.ok(calls.every(call=>call.url==='/api/image-review'),'Each decision synchronizes from the review endpoint');
  assert.equal(a.export_folder,'D:/临时/重复标题');
  assert.equal(b.images[0].review_status,'pending','Saving A never changes B');
  assert.ok(findText(findLayoutTopic(element('topic-layout-review'),a.topic),'打开图片文件夹'));
  await context.openTopicImageFolder(a);
  assert.ok(findText(findLayoutTopic(element('topic-layout-review'),a.topic),'打开文件夹请求已发送：D:/临时/重复标题。系统已接受请求，但无法确认桌面窗口是否显示。'));
  assert.equal(findText(findLayoutTopic(element('topic-layout-review'),a.topic),'文件夹已打开'),undefined,'Desktop open is not falsely reported as visible');
  const finalRow={...a,final_docx:'D:/临时/重复标题/重复标题.docx'};
  context.latestState={image_review:[finalRow,b,old],jobs:{images:null}};context.renderImageReview(context.latestState);
  await context.openTopicFinalDocument(finalRow);
  assert.ok(findText(findLayoutTopic(element('topic-layout-review'),a.topic),'打开最终文稿请求已发送：重复标题.docx。系统已接受请求，但无法确认 Word 窗口是否显示。'));
  assert.equal(findText(topicBox,'保存已选图片（1 张）'),undefined);
  context.latestState={image_review:[a,b,old],jobs:{images:null}};context.renderImageReview(context.latestState);
  context.latestState={image_review:[a],jobs:{images:null}};
   context.modelConfig.image_collaboration={mode:'collaborative',roles:{text:{provider:'deepseek',model:'fixture-model'},layout:{provider:'doubao',model:'layout-fixture'}}};
   context.renderImageCollaboration();
  context.moduleBusy=()=>false;context.searchImageChoice=()=>({provider:'deepseek',model:'fixture-model'});
  context.selectedImageSources=()=>['豆瓣'];context.beginAction=()=>true;context.endAction=()=>{};
  assert.deepEqual(JSON.parse(JSON.stringify(context.imageCollaborationForTask())),{image_mode:'collaborative',collaboration:{mode:'collaborative',roles:{text:{provider:'deepseek',model:'fixture-model'},layout:{provider:'doubao',model:'layout-fixture'}}}});
  await context.fillImagesToFive(a);
  const continued=calls.find(call=>call.url==='/api/image-action');
  assert.ok(continued,JSON.stringify(calls));
  assert.deepEqual(JSON.parse(continued.options.body),{topic:a.topic,mode:'search',image:'',count:20,provider:'deepseek',model:'fixture-model',query:'',sources:['豆瓣'],image_mode:'collaborative',collaboration:{mode:'collaborative',roles:{text:{provider:'deepseek',model:'fixture-model'},layout:{provider:'doubao',model:'layout-fixture'}}}});
  assert.ok(findText(findArticle(topicBox,a.topic),'搜图任务已提交，等待本篇任务开始；具体进度显示在下方。'));
  const wordRow={...a,images:a.images.map(item=>({...item})),has_word:false,approved_count:1,
    folder_word_status:{doc_count:2,docx_names:['稿甲.docx','稿乙.docx'],legacy_doc_count:0}};
  wordRow.images[0].review_status='approved';wordRow.images[1].review_status='rejected';
  context.latestState={image_review:[wordRow],jobs:{images:null}};context.renderImageReview(context.latestState);
  const wordArticle=findArticle(element('topic-image-review'),wordRow.topic),wordLayout=findLayoutTopic(element('topic-layout-review'),wordRow.topic);
  assert.ok(findText(wordLayout,'排版生成定稿（1 张已保留）'),'A kept image enables article-specific final layout');
  const wordPicker=walk(wordLayout).find(node=>node.tagName==='select'&&node.dataset.layoutWordChoice);
  assert.deepEqual(wordPicker.children.map(option=>option.value),['稿甲.docx','稿乙.docx'],'Multiple Word files require explicit choice');
  wordPicker.value='稿乙.docx';let layoutCall=null;context.run=(...args)=>{layoutCall=args;};
  walk(wordLayout).find(node=>node.dataset&&node.dataset.reviewAction==='topic-layout').onclick();
  assert.deepEqual(layoutCall,['排版',wordRow.topic,'稿乙.docx']);
  const none={topic:'TP-20260924-cccccccc',title:'没有结果',topic_package:true,plan_ready:true,
    image_plan:[makePlan('c1',0,'周边词')],target_count:1,unfilled_plan_count:1,images:[]};
  const noImageJob={id:10,task:'配图',status:'ok',topic:none.topic,summary:'',lines:['[无图] 没有合格候选']};
  context.latestState={image_review:[none],sourcing_status:{},jobs:{images:noImageJob}};
  context.renderImageReview(context.latestState);
  assert.ok(findText(topicBox,'本轮没有找到合格图片；可查看失败原因后继续搜图。'));
  const partialJob={...job,status:'ok',summary:'',lines:[]};
  context.latestState={image_review:[b],sourcing_status:{},jobs:{images:partialJob}};
  context.renderImageReview(context.latestState);
  assert.ok(findText(topicBox,'本轮搜图已结束；候选数量以本篇结果为准。'));
  const layoutJob={id:11,task:'排版',status:'running',topic:a.topic,lines:[]};
  context.latestState={image_review:[a,b,old],sourcing_status:{},jobs:{images:job,layouts:null}};
  context.renderImageReview(context.latestState);context.updateControls();
  const layoutAButton=walk(findLayoutTopic(element('topic-layout-review'),a.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='topic-layout');
  assert.ok(layoutAButton,'One approved image shows the per-article layout action');
  assert.equal(layoutAButton.disabled,false,'Article A can start layout while unrelated article B searches');
  context.latestState={image_review:[a,b,old],sourcing_status:{},jobs:{images:job,['layout:'+a.topic]:layoutJob}};
  context.renderImageReview(context.latestState);context.updateControls();
  const oldKeep=walk(findArticle(legacyBox,old.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='keep');
  const packageKeep=walk(findArticle(topicBox,a.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='keep');
  assert.equal(oldKeep.disabled,false,'The old Word workflow is unaffected by the new article layout');
  assert.equal(packageKeep.disabled,true,'An article is protected while its own layout is writing');
  const bKeepWhileALayouts=walk(findArticle(topicBox,b.topic)).find(node=>node.dataset&&node.dataset.reviewAction==='keep');
  assert.equal(bKeepWhileALayouts.disabled,true,'Article B stays locked by its own search');
  assert.equal(findText(legacyBox,'本篇正在排版；期间暂不能修改选图，其他文章仍可继续处理。'),undefined);
  assert.ok(findText(findArticle(topicBox,a.topic),'本篇正在排版；期间暂不能修改选图，其他文章仍可继续处理。'));
  assert.ok(findText(findArticle(topicBox,b.topic),'本篇正在搜图；本篇候选正在写入，其他文章仍可继续选图。'));
  const roles={text:{provider:'deepseek',model:'deepseek-new-text'},
    layout:{provider:'doubao',model:'doubao-new-layout'}};
  const options=[];for(const role of ['text','layout'])for(const [provider,model] of Object.entries({deepseek:roles.text.model,doubao:roles.layout.model})){options.push({role,provider,model,label:provider+' · '+model});}
  const providers=[{id:'deepseek',name:'DeepSeek',configured:true},{id:'gpt',name:'GPT',configured:true},{id:'doubao',name:'豆包',configured:true}];
  const savedCollab={mode:'collaborative',roles:{text:{provider:'deepseek',model:'deepseek-old'},layout:{provider:'doubao',model:'doubao-old'}}};
  context.modelConfig={providers,collaboration_models:options,image_collaboration:savedCollab};
  context.renderImageCollaboration();
  assert.equal(element('image-role-text').value,JSON.stringify(savedCollab.roles.text),'A saved custom image model stays selected when absent from the menu');
  assert.equal(element('image-role-layout').value,JSON.stringify(savedCollab.roles.layout),'A saved custom layout model stays selected when absent from the menu');
  assert.ok(nodeText(element('image-role-text')).includes('deepseek-old（当前自定义）'));
  element('image-role-text').value=JSON.stringify(roles.text);
  context.updateImageCollaborationDraft('text');
  context.renderImageCollaboration();
  assert.equal(element('image-role-text').value,JSON.stringify(roles.text),'Polling/rerender keeps the unsaved role selection instead of restoring an old model');
  assert.ok(nodeText(element('image-collab-text-status')).includes('有未保存修改'));
  assert.ok(nodeText(element('image-collab-layout-status')).includes('doubao-old'),'The layout summary remains separate and unchanged');
  const callsBeforeTabSwitch=calls.length;
  context.showImageWorkflowTab('layout');context.showImageWorkflowTab('images');
  assert.equal(element('image-role-text').value,JSON.stringify(roles.text),'Tab switching preserves the unsaved image model');
  assert.equal(element('image-role-layout').value,JSON.stringify(savedCollab.roles.layout),'Tab switching preserves the selected layout model');
  assert.equal(calls.length,callsBeforeTabSwitch,'Tab switching does not make a request or start an AI/image action');
  const response=(status,payload,raw)=>({ok:status>=200&&status<300,status,json:async()=>{if(raw!==undefined)throw new SyntaxError('Unexpected token <');return payload;},text:async()=>raw===undefined?JSON.stringify(payload):raw});
  let serverConfig={providers,collaboration_models:options,image_collaboration:savedCollab};
  let postedCollaboration=null;
  context.fetch=async(url,request)=>{
    if(url==='/api/models-config')return response(200,serverConfig);
    postedCollaboration=JSON.parse(request.body);serverConfig={...serverConfig,image_collaboration:postedCollaboration};return response(200,serverConfig);
  };
  await context.saveImageCollaboration('text');
  assert.deepEqual(JSON.parse(JSON.stringify(postedCollaboration.roles)),{text:roles.text,layout:savedCollab.roles.layout},'Saving image settings preserves the server-saved layout model');
  assert.ok(nodeText(element('image-collab-text-status')).includes('deepseek-new-text'),'Image status reflects the server-confirmed assignment');
  assert.ok(nodeText(element('image-collab-text-status')).includes('已保存'));
  assert.ok(nodeText(element('image-collab-layout-status')).includes('doubao-old'),'Image save leaves the layout summary unchanged');
  element('image-role-layout').value=JSON.stringify(roles.layout);context.updateImageCollaborationDraft('layout');
  await context.saveImageCollaboration('layout');
  assert.deepEqual(JSON.parse(JSON.stringify(postedCollaboration.roles)),roles,'Saving layout settings preserves the server-saved image model');
  assert.ok(nodeText(element('image-collab-layout-status')).includes('doubao-new-layout'),'Layout status reflects the server-confirmed assignment');
  context.imageCollaborationDraft=null;context.imageCollaborationDirty=false;context.renderImageCollaboration();
  assert.equal(element('image-role-text').value,JSON.stringify(roles.text),'Reloading model settings restores the saved image model');
  assert.equal(element('image-role-layout').value,JSON.stringify(roles.layout),'Reloading model settings restores the saved layout model');
  assert.deepEqual(JSON.parse(JSON.stringify(context.imageCollaborationForTask().collaboration.roles)),roles,'The next task snapshot uses the latest saved assignment');

  const originalConfig=JSON.parse(JSON.stringify(serverConfig));
  function setLayoutDraft(suffix){
    const value={provider:'doubao',model:'layout-'+suffix};
    element('image-role-layout').value=JSON.stringify(value);
    context.updateImageCollaborationDraft('layout');return value;
  }
  const failedSaves=[
    {name:'validation',status:400,body:{error:'invalid model ID'},expected:'invalid model ID'},
    {name:'busy',status:409,body:{error:'task is busy'},expected:'task is busy'},
    {name:'server failure',status:500,body:{error:'server temporarily failed'},expected:'server temporarily failed'},
    {name:'invalid JSON',status:502,raw:'<html>bad gateway</html>',expected:'502'},
  ];
  for(const item of failedSaves){
    const draft=setLayoutDraft(item.name);
    context.fetch=async(url)=>url==='/api/image-collaboration'
      ?response(item.status,item.body,item.raw)
      :response(200,originalConfig);
    await context.saveImageCollaboration('layout');
    assert.ok(nodeText(element('image-collab-layout-status')).includes(item.expected),item.name+' remains visible in the layout settings area');
    assert.ok(nodeText(element('image-collab-layout-status')).includes('保存排版设置失败'),item.name+' is not reported as saved');
    assert.equal(element('save-image-layout').disabled,false,item.name+' always restores the layout save button');
    assert.equal(element('image-role-layout').value,JSON.stringify(draft),item.name+' preserves the draft');
    assert.equal(context.imageCollaborationDirty,true,item.name+' leaves the draft unsaved');
  }
  const timeoutDraft=setLayoutDraft('timeout');
  context.IMAGE_COLLAB_SAVE_TIMEOUT_MS=4;
  context.fetch=(url,options)=>url==='/api/image-collaboration'
    ?new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))
    :Promise.resolve(response(200,originalConfig));
  await context.saveImageCollaboration('layout');
  assert.ok(nodeText(element('image-collab-layout-status')).includes('超时'),'Timeout is reconciled and displayed as a save failure when the old config remains');
  assert.equal(element('image-role-layout').value,JSON.stringify(timeoutDraft));
  assert.equal(element('save-image-layout').disabled,false);

  const lostResponseDraft=setLayoutDraft('response-lost');serverConfig=originalConfig;
  context.fetch=async(url,options)=>{
    if(url==='/api/image-collaboration'){
      const submitted=JSON.parse(options.body);
      serverConfig={...originalConfig,image_collaboration:submitted};
      throw new TypeError('connection reset after server commit');
    }
    return response(200,serverConfig);
  };
  await context.saveImageCollaboration('layout');
  assert.ok(nodeText(element('image-collab-layout-status')).includes('已保存'));
  assert.equal(context.imageCollaborationDirty,false,'A lost response is reconciled against the read-only server value');
  assert.deepEqual(JSON.parse(JSON.stringify(context.modelConfig.image_collaboration.roles)),{text:originalConfig.image_collaboration.roles.text,layout:lostResponseDraft});
  assert.equal(element('save-image-layout').disabled,false);

  setLayoutDraft('late-response');let finishLateResponse,latePayload;
  context.fetch=(url,options)=>url==='/api/models-config'?Promise.resolve(response(200,originalConfig)):new Promise(resolve=>{
    latePayload=JSON.parse(options.body);
    finishLateResponse=()=>resolve(response(200,{...originalConfig,image_collaboration:latePayload}));
  });
  const lateSave=context.saveImageCollaboration('layout');
  await new Promise(resolve=>setTimeout(resolve,0));
  const newerDraft=setLayoutDraft('edited-while-saving');
  finishLateResponse();await lateSave;
  assert.equal(context.modelConfig.image_collaboration.roles.layout.model,'layout-late-response');
  assert.equal(element('image-role-layout').value,JSON.stringify(newerDraft),'A late response does not overwrite edits made while the save was in flight');
  assert.equal(context.imageCollaborationDirty,true);
  assert.ok(nodeText(element('image-collab-layout-status')).includes('有未保存修改'));

  const topicId='TP-20260925-11111111',chosenRows=[{query:'郭宇欣',keyword_type:'core',enabled:true},{query:'郭宇欣 声明',keyword_type:'scene',enabled:true}];
  const rowNodes=chosenRows.map(item=>({querySelector(selector){return selector==='[data-keyword-query]'?{value:item.query}:selector==='[data-keyword-type]'?{value:item.keyword_type}:{checked:item.enabled};}}));
  const visibleEditor=new Element();visibleEditor.dataset.topicKeywordsBox=topicId;visibleEditor.querySelectorAll=selector=>selector==='[data-keyword-row]'?rowNodes:[];
  const saveButton=new Element('button');saveButton.closest=()=>visibleEditor;saveButton.dataset.topicKeywordSave=topicId;
  context.document.querySelector=()=>{throw new Error('A hidden first-board editor must not be queried globally');};
   let keywordMessage='';context.updateControls=()=>{saveButton.disabled=false;};context.showTab=()=>{};context.refresh=()=>{};context.message=text=>{keywordMessage=text;};
  let postedKeywords=null;
  context.fetch=async(url,request)=>{postedKeywords=JSON.parse(request.body);return {ok:true,json:async()=>({ok:true,topic_id:topicId,keywords:['郭宇欣','郭宇欣 声明'],image_count:2,keyword_version:4})};};
  await context.confirmTopicKeywords(topicId,saveButton,false);
  assert.deepEqual(JSON.parse(JSON.stringify(postedKeywords)),{topic_id:topicId,keywords:chosenRows.map(item=>({...item,subject_query:'',scene_term:''}))},'Saving reads the clicked article editor, including its latest unblurred value');
  assert.equal(saveButton.disabled,false);
   assert.ok(chosenRows.every(item=>keywordMessage.includes(item.query)) && keywordMessage.includes('4'),'Keyword save feedback immediately echoes the persisted terms and version');
  assert.doesNotMatch(html.match(/<details id="topic-image-workflow"[^>]*>/)[0],/\sopen(?:\s|>)/);
  console.log('PASS: separated workflows, independent keyword editor saves, persisted model-role selection, per-article decisions, explicit Word choice, and layout action');
})().catch(error=>{console.error(error);process.exitCode=1;});

