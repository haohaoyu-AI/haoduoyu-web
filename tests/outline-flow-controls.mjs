import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';

const nativeRequire=createRequire(import.meta.url);
const source=fs.readFileSync('components/outline-run.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const run='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',flow='33333333-3333-4333-8333-333333333333',token='44444444-4444-4444-8444-444444444444';
const snapshotHash='a'.repeat(64),outlineHash='b'.repeat(64),inputHash='c'.repeat(64);
const snapshot=(state='outline_pending',outlineState='not_claimed',bodyState='not_claimed',id=run)=>({run_id:id,state,article_id:'article',snapshot_sha256:snapshotHash,outline_sha256:state==='outline_pending'?null:outlineHash,snapshot:{model:'claude-test',prompt_version:'V2.2',capability:{max_output_tokens:128000}},outline:null,review:null,stages:{outline:{state:outlineState,input_sha256:outlineState==='not_claimed'?null:inputHash},body:{state:bodyState,input_sha256:bodyState==='not_claimed'?null:inputHash}}});
class Input {constructor(value=''){this.value=value;this.checked=false;}focus(){this.focused=true;}}
class FormDataMock {constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}}
const formData=(values)=>({values,elements:{namedItem:()=>new Input()}});
const ok=(data)=>({ok:true,json:async()=>data});
const drain=async()=>{for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve));};
const textOf=node=>node==null||typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(textOf).join(''):textOf(node.props?.children);
function harness(view=null){
 const root={hooks:view?[view.run_id,view]:[],index:0};let active=root;
 const contexts=new Map(),requests=[],storage=[],exports={},h={reply:()=>{throw Error('No response fixture');},terminal:{success:true}};
 const stateHooks={useState(initial){const current=active,index=current.index++;if(!(index in current.hooks))current.hooks[index]=initial;return [current.hooks[index],value=>{current.hooks[index]=typeof value==='function'?value(current.hooks[index]):value;}];},useRef(initial){const current=active,index=current.index++;if(!(index in current.hooks))current.hooks[index]={current:initial};return current.hooks[index];}};
 vm.runInNewContext(compiled,{exports,require:name=>name==='react'?stateHooks:name==='./daily-run-stream'?{readDailyNdjson:async()=>{if(h.terminal instanceof Error)throw h.terminal;return h.terminal;}}:nativeRequire(name),FormData:FormDataMock,HTMLInputElement:Input,TextEncoder,fetch:(url,options={})=>{const request={url,options,payload:options.body?JSON.parse(options.body):null};requests.push(request);return Promise.resolve().then(()=>h.reply(request));},sessionStorage:{setItem:(...args)=>storage.push(args)}});
 function renderFn(fn,props,key){const previous=active;active=fn===exports.default?root:(contexts.get(key)??{hooks:[],index:0});contexts.set(key,active);active.index=0;const result=fn(props);active=previous;return expand(result,key);}
 function expand(node,path='root'){if(node==null||typeof node!=='object')return node;if(Array.isArray(node))return node.map((child,i)=>expand(child,path+':'+i));if(typeof node.type==='function')return renderFn(node.type,node.props,path+':'+(node.key||node.type.name));return {...node,key:node.key??path,props:{...node.props,children:expand(node.props.children,path+':'+String(node.key||node.type||'fragment'))}};}
 function nodes(node,result=[]){if(node&&typeof node==='object'){if(Array.isArray(node))node.forEach(child=>nodes(child,result));else{result.push(node);nodes(node.props?.children,result);}}return result;}
 h.render=()=>renderFn(exports.default,{},'root');
 h.nodes=()=>nodes(h.render());h.html=()=>renderToStaticMarkup(h.render());h.find=(type,predicate=()=>true)=>h.nodes().find(node=>node.type===type&&predicate(node));
 h.form=label=>h.find('form',node=>nodes(node).some(child=>child.type==='button'&&textOf(child)===label));
 h.submit=(label,values={confirm:'on'},existing)=>{const form=existing||h.form(label);assert.ok(form,'form exists: '+label);return form.props.onSubmit({preventDefault(){},currentTarget:formData(values)});};
 h.status=()=>textOf(h.find('p',node=>node.props.role==='status'));
 h.changeRun=id=>h.find('input',node=>node.props.value!==undefined&&!node.props.name).props.onChange({target:{value:id}});
 h.stage=value=>h.find('select').props.onChange({target:{value}});
 h.view=value=>{root.hooks[0]=value.run_id;root.hooks[1]=value;};
 h.state=()=>root.hooks.filter(item=>!item||typeof item!=='object'||!Object.hasOwn(item,'current'));
 Object.assign(h,{requests,storage,root,exports});return h;
}
const postRequests=h=>h.requests.filter(r=>r.options.method==='POST');

// Rendering is inert; all mutating forms require a fresh checkbox and explicit JSON confirm.
{
 const h=harness();assert.equal(h.requests.length,0);const form=h.form('创建框架批次');
 const textarea=h.find('textarea');assert.equal(JSON.parse(textarea.props.defaultValue).confirm,false);
 assert.throws(()=>h.exports.parseOutlineControlArguments('not-json '+token),/JSON/);
 assert.throws(()=>h.exports.parseOutlineControlArguments('[]'),/对象/);
 assert.throws(()=>h.exports.parseOutlineControlArguments('{"confirm":false}'),/confirm/);
 assert.throws(()=>h.exports.parseOutlineControlArguments('x'.repeat(120001)),/超长/);
 h.submit('创建框架批次',{arguments:'{"confirm":true}'},form);h.submit('创建框架批次',{confirm:'on',arguments:'{"confirm":false}'},form);
 await drain();assert.equal(h.requests.length,0);assert.ok(!h.html().includes(token));
 let resolve;h.reply=({options})=>options.method==='POST'?new Promise(done=>{resolve=done;}):ok(snapshot());
 const focusTarget=new Input();h.find('input',node=>node.props.value!==undefined&&!node.props.name).props.ref.current=focusTarget;
 const args={authorization_key:'authorized-once',expected_model:'claude-test',expected_prompt_version:'V2.2',topic:'topic',materials:'facts',sources:[],evidence:[],confirm:true};
 h.submit('创建框架批次',{confirm:'on',arguments:JSON.stringify(args)},form);h.submit('创建框架批次',{confirm:'on',arguments:JSON.stringify(args)},form);
 await drain();assert.equal(postRequests(h).length,1,'synchronous ref lock blocks double submit');
 const request=postRequests(h)[0];assert.equal(request.options.headers['x-xiaoyu-outline-flow'],'1');assert.deepEqual(request.payload,{action:'create',arguments:args});
 resolve(ok({run_id:run,state:'outline_pending',created:true}));await drain();
 assert.equal(h.find('input',node=>node.props.value!==undefined&&!node.props.name).props.value,run);
 assert.equal(focusTarget.focused,true,'successful create focuses the safe run identifier');assert.equal(h.storage.length,1);assert.equal(h.storage[0][1],run);assert.equal(postRequests(h).length,1,'create does not claim or generate');
}

// Atomic claim response is held in a ref before a failed GET; no secret reaches state/UI/storage/URL.
{
 const h=harness(snapshot());let resolve;h.reply=({options})=>options.method==='POST'?new Promise(done=>{resolve=done;}):Promise.reject(Error('GET unavailable'));
 const claim=h.form('认领本阶段');h.submit('认领本阶段',{},claim);assert.equal(h.requests.length,0);
 h.submit('认领本阶段',{confirm:'on'},claim);h.submit('认领本阶段',{confirm:'on'},claim);await drain();assert.equal(postRequests(h).length,1);
 resolve(ok({claimed:true,run_id:run,stage:'outline',token,input_sha256:inputHash}));await drain();
 assert.match(h.status(),/凭证已安全保留/);assert.ok(!h.html().includes(token));assert.ok(!JSON.stringify(h.state()).includes(token));assert.equal(h.storage.length,0);
 assert.ok(!h.requests.some(request=>request.url.includes(token)));assert.ok(!postRequests(h).some(request=>JSON.stringify(request.payload).includes(token)));
 h.submit('认领本阶段',{confirm:'on'},claim);await drain();assert.equal(postRequests(h).length,1,'stale not_claimed view cannot reclaim');
 // A successful readonly refresh restores eligibility, using the already-saved in-memory token.
 h.reply=()=>ok(snapshot('outline_pending','claimed'));h.submit('只读查看本批次',{});await drain();
 assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,false);
 h.stage('body');h.view(snapshot('approved','completed','claimed'));assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true,'claimed body cannot reuse the outline token, even with the same hash');
 h.view(snapshot('outline_pending','claimed'));h.stage('outline');assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,false);
 const changed=snapshot('outline_pending','claimed');changed.stages.outline.input_sha256='d'.repeat(64);h.view(changed);assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true,'changed input binding disables execution');h.view(snapshot('outline_pending','claimed'));
 h.changeRun(other);h.reply=()=>ok(snapshot('outline_pending','claimed','not_claimed',other));h.submit('只读查看本批次',{});await drain();
 assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true,'another run cannot use the old token');
 h.changeRun(run);h.reply=()=>ok(snapshot('outline_pending','claimed'));h.submit('只读查看本批次',{});await drain();
 assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,false,'same run+stage retains its token across navigation');
 // Execution consumes the token before network, even on unknown transport failure.
 let reject;h.reply=({options})=>options.method==='POST'?new Promise((_,fail)=>{reject=fail;}):ok(snapshot('outline_pending','claimed'));
 const execute=h.form('执行本阶段');const first=h.submit('执行本阶段',{confirm:'on'},execute);h.submit('执行本阶段',{confirm:'on'},execute);await drain();
 const providers=postRequests(h).filter(request=>request.url==='/api/claude/outline-run');assert.equal(providers.length,1);assert.equal(providers[0].payload.token,token);
 assert.ok(!h.html().includes(token));assert.ok(!JSON.stringify(h.state()).includes(token));reject(Error('unknown'));await first;await drain();
 h.submit('执行本阶段',{confirm:'on'},execute);await drain();assert.equal(postRequests(h).filter(request=>request.url==='/api/claude/outline-run').length,1);
 assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true);assert.match(h.status(),/不重复请求/);
 assert.deepEqual(h.storage.map(([,value])=>value),[run,other,run,run]);
}

// A remount has no secret and an already-claimed stage cannot be reclaimed.
{
 const h=harness(snapshot('outline_pending','claimed'));
 assert.equal(h.find('button',node=>textOf(node)==='认领本阶段').props.disabled,true);
 assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true);
 h.submit('认领本阶段');h.submit('执行本阶段');await drain();assert.equal(h.requests.length,0);
}

// Unknown claim outcome remains readonly, including a stale not_claimed server response.
{
 const h=harness(snapshot());h.reply=()=>Promise.reject(Error('unknown'));const form=h.form('认领本阶段');h.submit('认领本阶段',{confirm:'on'},form);await drain();h.submit('认领本阶段',{confirm:'on'},form);await drain();assert.equal(postRequests(h).length,1);assert.equal(h.find('button',node=>textOf(node)==='认领本阶段').props.disabled,true);assert.equal(h.find('button',node=>textOf(node)==='执行本阶段').props.disabled,true);
}

// Frozen evidence is available without rendering the entire response.
{
 const view=snapshot('outline_review_pending','completed');Object.assign(view.snapshot,{topic:'Frozen topic',materials:'Frozen facts',writing_prompt:'Frozen full prompt',sources:[{title:'Source title',url:'https://example.test/source',published:'2026-10-06'}],evidence:[{id:'E1',text:'Verified fact',source_ids:['S1']}],unexpected:token});
 const html=harness(view).html();for(const expected of ['冻结材料与写作要求','Frozen topic','Frozen facts','Frozen full prompt','Source title','Verified fact'])assert.ok(html.includes(expected));assert.ok(!html.includes(token));
}

// Approval binds the exact hashes. Actor/execution/model/decision/reason are never fabricated.
{
 const h=harness(snapshot('outline_review_pending','completed'));
 const template=JSON.parse(h.find('textarea',node=>JSON.parse(node.props.defaultValue).outline_version===1).props.defaultValue);
 assert.equal(template.run_id,run);assert.equal(template.expected_snapshot_sha256,snapshotHash);assert.equal(template.expected_outline_sha256,outlineHash);
 for(const name of ['actor_id','execution_id','reviewer_model','decision','reason'])assert.equal(template[name],'');assert.equal(template.confirm,false);
 let resolve;h.reply=({options})=>options.method==='POST'?new Promise(done=>{resolve=done;}):ok(snapshot('approved','completed'));
 const form=h.form('提交独立框架审核'),args={...template,actor_id:other,execution_id:flow,reviewer_model:'independent-model',decision:'pass',reason:'Actually reviewed',confirm:true};
 h.submit('提交独立框架审核',{confirm:'on',arguments:JSON.stringify({...args,run_id:other})},form);await drain();assert.equal(h.requests.length,0);
 h.submit('提交独立框架审核',{confirm:'on',arguments:JSON.stringify({...args,expected_outline_sha256:inputHash})},form);await drain();assert.equal(h.requests.length,0);
 h.submit('提交独立框架审核',{confirm:'on',arguments:JSON.stringify(args)},form);h.submit('提交独立框架审核',{confirm:'on',arguments:JSON.stringify(args)},form);await drain();assert.equal(postRequests(h).length,1);
 assert.deepEqual(postRequests(h)[0].payload,{action:'review',arguments:args});resolve(ok({run_id:run,state:'approved',saved:true}));await drain();assert.equal(postRequests(h).length,1,'approval never auto-claims body');
}

// Revision creates a separately executed workflow; only safe flow_id is shown, never response JSON.
{
 const h=harness(snapshot('body_review_pending','completed','completed'));
 const template=JSON.parse(h.find('textarea',node=>Object.hasOwn(JSON.parse(node.props.defaultValue),'writer_actor_id')).props.defaultValue);
 assert.equal(template.run_id,run);assert.equal(template.expected_prompt_version,'V2.2');assert.equal(template.writer_actor_id,'');assert.equal(template.writer_execution_id,'');
 for(const participant of Object.values(template.participants)){assert.equal(participant.actor_id,'');assert.equal(participant.model,'');}
 h.reply=()=>ok({flow_id:flow,current_phase:'review_pending',run_id:run,unexpected:token});
 h.submit('创建独立正文审改流程',{confirm:'on',arguments:JSON.stringify({...template,confirm:true})});await drain();
 assert.equal(postRequests(h).length,1);assert.equal(postRequests(h)[0].payload.action,'create_revision');assert.match(h.status(),new RegExp(flow));assert.ok(!h.html().includes(token));assert.ok(!h.status().includes('current_phase'));
}

// Completed-result recovery has its own confirmation and never uses the provider endpoint.
for(const state of ['not_claimed','claimed','requested','failed','completed']){
 const h=harness(snapshot('outline_pending',state));h.reply=({options})=>options.method==='POST'?ok({run_id:run,state:'outline_review_pending'}):ok(snapshot('outline_review_pending','completed'));
 h.submit('从已存结果恢复阶段',{});await drain();assert.equal(h.requests.length,0);
 h.submit('从已存结果恢复阶段',{confirm:'on'});await drain();
 assert.equal(postRequests(h).length,state==='completed'?1:0);
 assert.ok(!h.requests.some(request=>request.url==='/api/claude/outline-run'));
 if(state==='completed')assert.deepEqual(postRequests(h)[0].payload,{action:'recover_completed',arguments:{run_id:run,stage:'outline',confirm:true}});
}
assert.doesNotMatch(source,/localStorage|randomUUID|JSON\.stringify\(data/,'no credential persistence, invented actor identity, or raw mutation response output');
console.log('PASS outline controls: inert confirmed forms; create/review/revision bindings; duplicate locks; claim-before-read failure; credential only in memory and provider POST; run/stage isolation; token loss readonly; unknown execution no retry; completed-only recovery; zero real network/provider');
{
 const parent={...snapshot('revise','completed'),parent_run_id:null,revision_child_run_id:null,review_sha256:'c'.repeat(64)};
 const h=harness(parent),form=h.find('textarea',node=>Object.hasOwn(JSON.parse(node.props.defaultValue),'additional_materials'));
 assert.ok(form);const template=JSON.parse(form.props.defaultValue);assert.equal(template.expected_review_sha256,parent.review_sha256);assert.ok(!('writing_prompt' in template));assert.ok(!('materials' in template));assert.match(h.html(),/生成修订框架会新增一次模型请求/);
 h.submit('创建一次框架修订',{arguments:JSON.stringify({...template,confirm:true})});await drain();assert.equal(postRequests(h).length,0);
 h.reply=()=>ok({run_id:run,created:true,state:'outline_pending'});h.submit('创建一次框架修订',{confirm:'on',arguments:JSON.stringify({...template,confirm:true})});await drain();assert.equal(postRequests(h).length,1);assert.equal(postRequests(h)[0].payload.action,'create_outline_revision');assert.ok(!h.requests.some(request=>request.url==='/api/claude/outline-run'));
 const childView=harness({...snapshot('revise','completed'),parent_run_id:run});assert.ok(!childView.html().includes('创建一次框架修订'));assert.match(childView.html(),/生成修订框架会新增一次模型请求/);
}
console.log('PASS revision UI preserves separate create/claim/paid execution confirmations, exact review binding and no second child');
{
 const h=harness({...snapshot('outline_review_pending','completed'),outline:{fact_gaps:['缺口待实际处理'],nodes:[{}, {}, {}]}});
 const edited=h.find('textarea',node=>Object.hasOwn(JSON.parse(node.props.defaultValue),'approved_outline'));const template=JSON.parse(edited.props.defaultValue);
 assert.equal(template.decision,'pass');assert.equal(template.gap_resolutions[0].gap,'缺口待实际处理');assert.equal(template.gap_resolutions[0].gap_index,0);assert.equal(template.gap_resolutions[0].action,'');assert.equal(template.edit_notes[0],'');assert.equal(template.actor_id,'');
 h.submit('提交修订框架并通过',{arguments:JSON.stringify({...template,confirm:true})});await drain();assert.equal(postRequests(h).length,0);
 h.reply=()=>ok({saved:true,run_id:run,state:'approved'});h.submit('提交修订框架并通过',{confirm:'on',arguments:JSON.stringify({...template,confirm:true})});await drain();assert.equal(postRequests(h).length,1);assert.equal(postRequests(h)[0].payload.action,'review');assert.ok(!h.requests.some(r=>r.url==='/api/claude/outline-run'));
}
console.log('PASS explicit edited approval form retains real blank reviewer identity, original gap checklist and separate no-provider confirmation');
