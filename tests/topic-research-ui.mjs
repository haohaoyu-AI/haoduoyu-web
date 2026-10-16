import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
const root = process.cwd();
const requireRoot = Module.createRequire(root + '/package.json');
const ts = requireRoot('typescript');
const React = requireRoot('react');
const { renderToStaticMarkup } = requireRoot('react-dom/server');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject}; };
const stamp = new Date().toISOString();
const makeRun = (id='a',generation=1,state='queued') => ({id,generation,state,created:stamp,updated:stamp,input_hash:'hash-'+id,input:{frozen_at:stamp,boards:[{platform:{status:'ok',fetched_at:stamp},candidates:[{id:'c1',title:'本轮真实候选'}]},{platform:{status:'stale',fetched_at:stamp},candidates:[{id:'old',title:'旧缓存候选'}]}],history:{entries:[]}},result:state==='completed'?{featured:[],additional:[],coverage:{notice:'已实际检查，无充分证据',checked_at:stamp},shortfall:'没有证据足够的条目'}:null,error:null,dispatch_state:'pending',claimable:state==='queued',claim_expires:state==='researching'?new Date(Date.now()+60000).toISOString():null});
function harness(file, realReact = false, props = {}) {
 const slots=[],effects=[],timers=new Map(),listeners=new Map(),calls=[];
 let cursor=0, dirty=false, tree, nextTimer=0, ended=false, currentFetch=()=>Promise.reject(new Error('unhandled fetch'));
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const hooks={...React,
  useState(initial){const i=cursor++;if(!slots[i])slots[i]={v:typeof initial==='function'?initial():initial};return [slots[i].v,(next)=>{slots[i].v=typeof next==='function'?next(slots[i].v):next;dirty=true;}];},
  useRef(initial){const i=cursor++;return (slots[i]??={current:initial});},
  useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!same(old.deps,deps)){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
  useCallback(fn,deps){return this.useMemo(()=>fn,deps);},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,v:fn()};return slots[i].v;}
 };
 hooks.useCallback=hooks.useCallback.bind(hooks);
 const cache=new Map();
 function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const mod=new Module(file);cache.set(file,mod);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file));
  mod.require=(name)=>{
   if(name==='react')return realReact ? React : hooks;
   if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({}, {get:(_,k)=>String(k)})};
   if(name.startsWith('.')){let dest=path.resolve(path.dirname(file),name);for(const suffix of ['','.tsx','.ts'])if(fs.existsSync(dest+suffix)&&fs.statSync(dest+suffix).isFile())return load(dest+suffix);}
   return requireRoot(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,file);
  return mod.exports;
 }
 const Component=load(root+'/'+file);
 const fn=Component.default||Component.ResearchPanel;
 global.window={setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id)},location:{search:''},addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn)},removeEventListener(name,fn){listeners.get(name)?.delete(fn)}};
 global.document={visibilityState:'visible',addEventListener:window.addEventListener,removeEventListener:window.removeEventListener};
 global.fetch=async (url,options)=>{calls.push({url,options,body:options.body?JSON.parse(options.body):null});return currentFetch(url,options)};
 const nativeSetTimeout=global.setTimeout,nativeClearTimeout=global.clearTimeout;
 global.setTimeout=window.setTimeout;global.clearTimeout=window.clearTimeout;
 function render(){if(ended)return;cursor=0;dirty=false;tree=fn(props);for(const run of effects.splice(0))run();}
 async function flush(){for(let i=0;i<50;i++){await Promise.resolve();if(dirty)render();}}
 function nodes(){const found=[];function visit(value){if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(visit);return;}if(value.type){found.push(value);visit(value.props.children);}}visit(tree);return found;}
 function content(value){if(value==null||typeof value==='boolean')return '';if(Array.isArray(value))return value.map(content).join('');if(typeof value==='object')return content(value.props?.children);return String(value);}
 function button(text){const node=nodes().find(n=>n.type==='button'&&content(n).includes(text));assert.ok(node,'button exists: '+text);return node;}
 function mainButton(){const buttons=nodes().filter(n=>n.type==='button');assert.equal(buttons.length,1,'the research panel exposes one main action');assert.equal(buttons[0].props['aria-label'],'刷新文娱榜','main action keeps a stable accessible name');return buttons[0];}
 return {Component, load, calls, nodes, content, button, mainButton, timers,
  setFetch(fn){currentFetch=fn;},json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});},
  render,flush,
  async start(search=''){window.location.search=search;render();const starts=[...timers].filter(([,t])=>t.delay===0);for(const[id,t]of starts){timers.delete(id);t.fn();}await flush();},
  async click(text){const b=button(text);assert.ok(!b.props.disabled,'button enabled: '+text);b.props.onClick?.();await flush();},
  async refresh(){const b=mainButton();assert.ok(!b.props.disabled,'main refresh is enabled');b.props.onClick?.();await flush();},
  async tick(delay){const match=[...timers].find(([,timer])=>timer.delay===delay);assert.ok(match,'poll timer exists: '+delay);timers.delete(match[0]);void match[1].fn();await flush();},
  async change(name,value,checkbox=false){const n=nodes().find(n=>n.props.name===name||(checkbox&&n.type==='input'&&n.props.type==='checkbox'));assert.ok(n,'field exists: '+name);n.props.onChange({target:checkbox?{checked:value}:{value}});await flush();},
  async submit(index=0){const forms=nodes().filter(n=>n.type==='form');assert.ok(forms[index],'form '+index);forms[index].props.onSubmit({preventDefault(){}});await flush();},
  async event(name){for(const fn of listeners.get(name)||[])fn();await flush();},
  async stop(){ended=true;for(const slot of slots)slot?.cleanup?.();global.setTimeout=nativeSetTimeout;global.clearTimeout=nativeClearTimeout;await Promise.resolve();},
  get tree(){return tree}
 };
}
(async()=>{
 const panelSource = fs.readFileSync(path.join(root, 'components/topics/ResearchPanel.tsx'), 'utf8');
 const helperSource = fs.readFileSync(path.join(root, 'app/topics/research-helper/page.tsx'), 'utf8');
 const pageSource = fs.readFileSync(path.join(root, 'app/topics/page.tsx'), 'utf8');
 assert.match(panelSource, /'x-topic-research': '1'/);
 assert.match(helperSource, /heldClaims\.current = \{ \.\.\.heldClaims\.current/);
 assert.match(helperSource, /const latest = await read\(target\.id\)/);
 assert.match(helperSource, /latest\.state === 'completed'/);
 assert.match(helperSource, /ownerScope\.current !== response\.owner_scope/);
 assert.match(helperSource, /heldClaims\.current = \{\}/);
 assert.match(helperSource, /!run\.claimable/);
 assert.match(pageSource, /<details[^>]*><summary>原始榜单线索（未核验）<\/summary>/);
 assert.match(pageSource, /open=\{!hasVerifiedResearchResult\}/, 'unverified source leads are visible when no verified result is available');
 assert.match(pageSource, /onResultAvailabilityChange=\{setHasVerifiedResearchResult\}/);
 assert.doesNotMatch(panelSource + helperSource, /localStorage|sessionStorage/);
 const forbiddenControls = /研究助手|只刷新研究状态|刷新并核验|重试同一请求|等待认领|认领任务|自动化设置|第 \d+ 次|PRIVATE-CLAIM/;
 for (const file of ['components/topics/ResearchPanel.tsx', 'app/topics/research-helper/page.tsx', 'app/topics/page.tsx']) {
  const ssr = harness(file, true);
  const component = ssr.Component.default || ssr.Component.ResearchPanel;
  const markup = renderToStaticMarkup(React.createElement(component));
  assert.equal(ssr.calls.length, 0, 'SSR does not create or read a task');
  assert.doesNotMatch(markup, /data-researched-topic=/, 'empty SSR never fabricates researched cards');
  assert.doesNotMatch(markup, /PRIVATE-CLAIM/);
  if (!file.includes('research-helper')) {
   assert.equal((markup.match(/aria-label="刷新文娱榜"/g) || []).length, 1, 'normal page has one refresh action');
   assert.match(markup, /🎬\s*文娱热榜/, 'normal page leads with the daily entertainment brief');
   assert.doesNotMatch(markup, forbiddenControls, 'helper workflow is absent from the normal page');
   assert.doesNotMatch(markup, /href="[^"]*(?:research-helper|automation)/, 'normal page does not link to setup or helper work');
   if (file.endsWith('app/topics/page.tsx')) assert.match(markup, /<details[^>]*open=""[^>]*data-unverified-board="true"/, 'empty page opens explicitly unverified source leads');
  }
  await ssr.stop();
 }
 console.log('PASS SSR and static contract: one refresh, no helper actions or fabricated cards, protected POST, memory-only claim, owner and lease guards');
 const resultSsr = harness('components/topics/ResearchPanel.tsx', true);
 const elapsedNow = Date.parse('2026-10-07T02:43:00.000Z');
 assert.equal(resultSsr.Component.researchElapsed('2026-10-07T00:57:36.118Z', elapsedNow), '1 小时 45 分钟');
 assert.equal(resultSsr.Component.researchElapsed('2026-10-07T02:42:59.000Z', elapsedNow), '不足 1 分钟');
 assert.equal(resultSsr.Component.researchElapsed('2026-10-07T02:39:00.000Z', elapsedNow), '4 分钟');
 assert.equal(resultSsr.Component.researchElapsed('2026-10-07T03:00:00.000Z', elapsedNow), '不足 1 分钟');
 assert.equal(resultSsr.Component.researchElapsed('invalid', elapsedNow), '时间未知');
 const completed = makeRun('rendered', 1, 'completed');
 const frozenAt = '2026-10-06T16:30:00.000Z';
 completed.input.frozen_at = frozenAt;
 completed.result.coverage.checked_at = frozenAt;
 completed.updated = frozenAt;
 completed.result.featured = Array.from({ length: 6 }, (_, index) => ({
  event_key: `event-${index}`, title: `已研究条目 ${index}`, event_time: '已确认的事件时间', summary: `摘要第一段 ${index}\n\n摘要第二段 ${index}`, analysis: `具体爆点判断 ${index}`, angle: `可写角度 ${index}`, candidate_ids: [`candidate-${index}`],
  facts: [{ text: '<script>fact</script>', source_ids: ['source'] }],
  sources: [{ id: 'source', url: 'javascript:alert(1)', title: '不安全链接', published_at: null, accessed_at: stamp }],
 }));
 const signal = (platform, rank, metric) => ({ platform, rank, metric, provider: 'fixture', fetched_at: frozenAt, upstream_updated_at: null, url: null });
 completed.input.boards = [{
  platform: { platform: 'toutiao', status: 'ok', fetched_at: frozenAt },
  rows: [{ candidate_id: 'candidate-0', rank: 9998, metric: 'DO-NOT-USE-BOARD-ROW' }],
  candidates: [
   { id: 'candidate-0', title: '候选零', rank: 9997, metric: 'DO-NOT-USE-CANDIDATE-METRIC', signals: [signal('toutiao', 7, '583万'), signal('weibo', 12, '87万'), signal('douyin', 1, 'DO-NOT-USE-DOUYIN'), signal('zhihu', 2, 'DO-NOT-USE-ZHIHU')] },
   { id: 'candidate-1', title: '候选一', signals: [signal('weibo', 3, null)] },
   { id: 'candidate-2', title: '候选二', signals: [] },
   { id: 'unrelated', title: '无关候选', signals: [signal('toutiao', 9996, 'DO-NOT-USE-UNLINKED')] },
  ],
 }];
 completed.result.additional = [{ title: '未核验线索', url: null, note: '证据待补' }];
 const resultElement = React.createElement(resultSsr.Component.ResearchResultView, { run: completed });
 const resultMarkup = renderToStaticMarkup(resultElement);
 const cards = [...resultMarkup.matchAll(/<article\b[^>]*data-researched-topic="[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map(match => match[1]);
 assert.equal(cards.length, 5, 'a completed brief renders at most five verified articles');
 assert.equal(resultSsr.Component.researchBriefDate(new Date(frozenAt)), '2026年10月7日', 'brief date uses Beijing time across a UTC day boundary');
 assert.equal(resultSsr.Component.researchBriefDate(new Date('2026-10-06T15:59:00Z')), '2026年10月6日');
 assert.match(fs.readFileSync(path.join(root, 'components/topics/research-brief.module.css'), 'utf8'), /\.summary[^}]*white-space: pre-line/, 'brief keeps summary paragraph breaks');
 for (const [index, ordinal] of ['①', '②', '③', '④', '⑤'].entries()) {
  assert.ok(cards[index].includes(ordinal), 'brief card uses ordinal ' + ordinal);
  assert.match(cards[index], /💥\s*爆点分析/);
  assert.match(cards[index], new RegExp(`<p[^>]*>摘要第一段 ${index}\\s+摘要第二段 ${index}<\\/p>`), 'summary is a readable paragraph with original breaks');
  assert.match(cards[index], new RegExp(`<details[^>]*>[\\s\\S]*可写角度 ${index}[\\s\\S]*<\\/details>`), 'writing angle is folded with evidence');
 }
 assert.doesNotMatch(resultMarkup, /<details[^>]*\sopen(?:=|\s|>)/, 'evidence is collapsed by default');
 assert.match(cards[0], /头条[^<]*(?:榜位|第|TOP|#)?\s*7/);
 assert.match(cards[0], /583万/);
 assert.match(cards[0], /微博[^<]*(?:榜位|第|TOP|#)?\s*12/);
 assert.match(cards[0], /87万/);
 assert.match(cards[1], /微博[^<]*(?:榜位|第|TOP|#)?\s*3/);
 assert.doesNotMatch(resultMarkup, /DO-NOT-USE-|999[678]|抖音|知乎/, 'heat uses only linked frozen candidates.signals from Toutiao and Weibo');
 assert.match(resultMarkup, /📌\s*附加文娱热点速览/);
 assert.match(resultMarkup, /未核验|未完成核验/);
 assert.doesNotMatch(resultMarkup, /href="javascript:|<script>/, 'source URLs and text are safely rendered');
 assert.equal(renderToStaticMarkup(React.createElement(resultSsr.Component.ResearchResultView, { run: { ...completed, state: 'queued' } })), '');
 const noHeat = structuredClone(completed);
 noHeat.input.boards = [];
 const noHeatMarkup = renderToStaticMarkup(React.createElement(resultSsr.Component.ResearchResultView, { run: noHeat }));
 assert.doesNotMatch(noHeatMarkup, /583万|87万|头条[^<]*7|微博[^<]*12/, 'missing frozen signals do not invent heat');
 await resultSsr.stop();
 console.log('PASS brief: Beijing date, five numbered cards, paragraph summaries, real frozen two-source heat, collapsed angle and evidence, explicit unverified extras');

 let h=harness('components/topics/ResearchPanel.tsx');
 let run=null,owner='owner-a',postAttempt=0;
 const resultNodes = () => h.nodes().filter(n => n.type === h.Component.ResearchResultView);
 const assertSimplePanel = () => {
  h.mainButton();
  assert.doesNotMatch(h.content(h.tree), forbiddenControls);
  assert.ok(!h.nodes().some(n => n.type === 'textarea' || (n.type === 'a' && /research-helper|automation/.test(n.props.href || ''))), 'no helper payload or settings action');
 };
 h.setFetch(async (url,opts)=>{if(opts.method==='POST'){postAttempt++;if(postAttempt===1)throw Error('offline');run={...makeRun('a'),dispatch_state:'accepted'};return h.json({run,connected:true,owner_scope:owner});}return h.json(url.includes('?id=')?{run,connected:true,owner_scope:owner}:{current:run,connected:true,owner_scope:owner});});
 await h.start();assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.method,'GET');assertSimplePanel();assert.equal(h.content(h.mainButton()),'刷新文娱榜');
 await h.refresh();assert.equal(postAttempt,1);assert.match(h.content(h.tree),/点击刷新|刷新文娱榜/);assertSimplePanel();assert.ok(!h.mainButton().props.disabled);
 await h.refresh();assert.equal(postAttempt,2);const postCalls=h.calls.filter(x=>x.body);assert.equal(postCalls[0].body.action,'create');assert.equal(postCalls[0].body.request_key,postCalls[1].body.request_key,'uncertain create retries reuse the exact request key');assert.ok(h.mainButton().props.disabled);assert.equal(h.content(h.mainButton()),'等待接手');assertSimplePanel();
 run=makeRun('b',2,'completed');await h.event('focus');assert.ok(resultNodes().some(n=>n.props.run.id==='b'),'focus automatically reads back completed work');assert.equal(postAttempt,2,'automatic readback never creates work');assert.equal(h.content(h.mainButton()),'刷新文娱榜');
 // A read issued before create must not replace the new run; retain the old brief with an explicit label.
 const waiting=deferred(),creating=deferred();let oldRead=true;
 h.setFetch(async (url,opts)=>{if(opts.method==='POST'){run={...makeRun('c',3),dispatch_state:'accepted'};return creating.promise;}if(oldRead){oldRead=false;return waiting.promise;}return h.json({current:run,connected:true,owner_scope:owner});});
 await h.event('focus');await h.refresh();assert.ok(h.mainButton().props.disabled);assert.equal(h.content(h.mainButton()),'正在刷新…');assert.match(h.content(h.tree),/上次已核验结果/);assert.match(h.content(h.tree),/批次 2/);assert.ok(resultNodes().some(n=>n.props.run.id==='b'),'previous result remains while create is in flight');
 creating.resolve(h.json({run,connected:true,owner_scope:owner}));await h.flush();waiting.resolve(h.json({current:makeRun('b',2,'completed'),connected:true,owner_scope:owner}));await h.flush();assert.equal(h.tree.props['data-research-state'],'queued');assert.match(h.content(h.tree),/上次已核验结果/);assert.match(h.content(h.tree),/批次 2/);assert.ok(h.nodes().some(n=>n.props['data-previous-research-result']));assert.ok(resultNodes().some(n=>n.props.run.id==='b'));assertSimplePanel();
 // Account change accepts a lower generation and clears every previous-owner result.
 owner='owner-b';run=makeRun('new-owner',1,'completed');h.setFetch(async(url)=>h.json(url.includes('?id=')?{run:makeRun('c',3),connected:true,owner_scope:'owner-a'}:{current:run,connected:true,owner_scope:owner}));await h.event('focus');assert.ok(resultNodes().some(n=>n.props.run.id==='new-owner'));assert.ok(!resultNodes().some(n=>n.props.run.id==='b'));assert.ok(!h.nodes().some(n=>n.props['data-previous-research-result']));assertSimplePanel();
 h.setFetch(async()=>h.json({error:'unauthorized'},401));await h.event('focus');assert.equal(resultNodes().length,0);assert.ok(h.content(h.tree).includes('重新登录'));assert.ok(h.mainButton().props.disabled);assert.ok(!h.nodes().some(n=>n.props['data-previous-research-result']));
 await h.stop();
 console.log('PASS panel: single action, read-only mount/focus, same-key retry, in-flight/accepted lock, labelled old result, stale-response ordering, owner/auth clearing');

 h=harness('components/topics/ResearchPanel.tsx');run=makeRun('existing-pending',4);let dispatchAttempts=0;
 h.setFetch(async(url,opts)=>{
  if(opts.method==='POST'){
   dispatchAttempts++;
   assert.deepEqual(JSON.parse(opts.body),{action:'dispatch',research_id:'existing-pending'},'pending work is dispatched without creating another run');
   if(dispatchAttempts===1)throw Error('dispatch response lost');
   run={...run,dispatch_state:'accepted'};return h.json({run,connected:true,owner_scope:'owner-a'});
  }
  return h.json(url.includes('?id=')?{run,connected:true,owner_scope:'owner-a'}:{current:run,connected:true,owner_scope:'owner-a'});
 });
 await h.start();assertSimplePanel();assert.equal(h.calls.filter(call=>call.body).length,0);assert.ok(!h.mainButton().props.disabled);
 await h.refresh();assert.equal(dispatchAttempts,1);assert.ok(!h.mainButton().props.disabled);assertSimplePanel();
 await h.refresh();assert.equal(dispatchAttempts,2);assert.ok(h.mainButton().props.disabled);assert.equal(h.content(h.mainButton()),'等待接手');
 run={...makeRun('existing-pending',4,'completed'),dispatch_state:'accepted'};await h.tick(6000);assert.ok(resultNodes().some(n=>n.props.run.id==='existing-pending'),'timer readback reveals completion without a second action');assert.equal(dispatchAttempts,2);assert.ok(!h.mainButton().props.disabled);assertSimplePanel();
 await h.stop();console.log('PASS pending recovery: same-button dispatch retry preserves research id, accepted run locks, polling shows completion without creation');

 const availability=[];
 h=harness('components/topics/ResearchPanel.tsx', false, {onResultAvailabilityChange:value=>availability.push(value)});
 run={...makeRun('waiting',5),created:new Date(Date.now()-2*3600000).toISOString(),dispatch_state:'accepted'};
 h.setFetch(async(url)=>h.json(url.includes('?id=')?{run,connected:true,owner_scope:'owner-a'}:{current:run,connected:true,owner_scope:'owner-a'}));
 const icon = () => h.nodes().find(node=>node.props.size===15 && node.props['aria-hidden']==='true');
 await h.start();assert.equal(h.content(h.mainButton()),'等待接手');assert.ok(h.mainButton().props.disabled);assert.match(h.content(h.tree),/尚未接手核验/);assert.match(h.content(h.tree),/已等待 2 小时/);assert.doesNotMatch(h.content(h.tree),/无需其他操作|结果会自动更新|正在准备核实/);assert.equal(icon().props.className,undefined);assert.equal(availability.at(-1),false);
 await h.tick(6000);assert.equal(h.calls.filter(call=>call.body).length,0,'long accepted waits only read progress; no automatic dispatch, claim or new run');
 run={...run,state:'researching',claimable:false,claim_expires:new Date(Date.now()+60000).toISOString()};await h.event('focus');assert.equal(h.content(h.mainButton()),'正在核验…');assert.equal(icon().props.className,'spinning');assert.match(h.content(h.tree),/正在阅读公开来源/);assert.doesNotMatch(h.content(h.tree),/尚未接手核验/);
 run={...run,claimable:true,claim_expires:new Date(Date.now()-1000).toISOString()};await h.event('focus');assert.equal(h.content(h.mainButton()),'核验待接续');assert.equal(icon().props.className,undefined);assert.match(h.content(h.tree),/本次接手已到期/);assert.ok(h.mainButton().props.disabled);
 run={...run,state:'queued',dispatch_state:'unknown',claimable:true};await h.event('focus');assert.equal(h.content(h.mainButton()),'派送待确认');assert.doesNotMatch(h.content(h.tree),/通知已接收/);
 run=makeRun('verified',6,'completed');await h.event('focus');assert.equal(availability.at(-1),true);assert.equal(h.calls.filter(call=>call.body).length,0);
 h.setFetch(async()=>h.json({error:'unauthorized'},401));await h.event('focus');assert.equal(availability.at(-1),false);
 await h.stop();console.log('PASS truthful status: accepted waiting duration, active/expired research distinction, unconfirmed delivery, verified availability, GET-only wait and no completion promise');

 h=harness('app/topics/research-helper/page.tsx');run=makeRun('a');owner='owner-a';let saves=0,readError=false,unknownSave=false;
 h.setFetch(async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):null;
  if(body?.action==='claim'){run={...run,state:'researching',claimable:false,claim_expires:new Date(Date.now()+60000).toISOString()};return h.json({run,connected:false,owner_scope:owner,claim_token:'PRIVATE-CLAIM',claimed:true});}
  if(body?.action==='save'){saves++;run={...run,state:'completed',result:body.result};if(unknownSave)throw Error('save response lost');return h.json({run,connected:false,owner_scope:owner});}
  if(readError)throw Error('read offline');
  return h.json(url.includes('?id=')?{run,connected:false,owner_scope:owner}:{current:run,connected:false,owner_scope:owner});
 });
 await h.start('?id=a');assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.method,'GET');const template=h.nodes().find(n=>n.props.name==='research_result').props.value;assert.ok(template.includes('本轮真实候选'));assert.ok(!template.includes('旧缓存候选'));
 await h.click('认领这一个任务');assert.equal(h.nodes().find(n=>n.props.name==='research_claim_token').props.value,'PRIVATE-CLAIM');assert.ok(!h.content(h.tree).includes('PRIVATE-CLAIM'));for(const ta of h.nodes().filter(n=>n.type==='textarea'))assert.ok(!ta.props.value.includes('PRIVATE-CLAIM'));
 readError=true;await h.submit(0);assert.equal(h.nodes().find(n=>n.props.name==='research_claim_token').props.value,'PRIVATE-CLAIM');readError=false;
 assert.ok(h.button('认领这一个任务').props.disabled, 'an active lease cannot be stolen');
 run = { ...run, claimable: true, claim_expires: new Date(Date.now() - 1000).toISOString() };
 await h.submit(0);assert.ok(!h.button('重新认领已到期任务').props.disabled);
 await h.click('重新认领已到期任务');assert.ok(h.button('认领这一个任务').props.disabled);
 await h.change('',true,true);await h.submit(1);assert.equal(saves,0);assert.ok(h.content(h.tree).includes('模板尚未填写'));
 const result=JSON.parse(template);result.coverage.notice='实际访问公开来源但没有证据充分的候选';result.shortfall='候选事件时间与公开证据无法相互确认';await h.change('research_result',JSON.stringify(result));await h.change('',true,true);
 unknownSave=true;await h.submit(1);assert.equal(saves,1);assert.ok(h.content(h.tree).includes('已读回确认研究结果保存成功'));assert.ok(h.nodes().some(n=>n.props['aria-label']==='完整研究任务读取结果'&&n.props.value.includes('completed')));
 owner='owner-b';run=makeRun('new-owner',1);await h.click('读取最新任务');assert.equal(h.nodes().find(n=>n.props.name==='research_claim_token').props.value,'');assert.ok(!h.content(h.tree).includes('PRIVATE-CLAIM'));
 await h.click('认领这一个任务');
 h.setFetch(async()=>h.json({error:'unauthorized'},401));await h.click('读取最新任务');
 assert.ok(!h.nodes().some(n=>n.props.name==='research_claim_token'), 'confirmed auth failure clears held claim and old run');
 assert.ok(!h.nodes().some(n=>n.props.name==='research_result'));
 await h.stop();console.log('PASS helper: full input, genuine template, no token output, read-error token retention, untouched-template block, unknown-save readback, expired lease reclaim, owner/auth isolation');

 h=harness('app/topics/research-helper/page.tsx');run=makeRun('retry');saves=0;let readbackBlocked=false;
 h.setFetch(async(url,opts)=>{
  const body=opts.body?JSON.parse(opts.body):null;
  if(body?.action==='claim'){run={...run,state:'researching',claimable:false,claim_expires:new Date(Date.now()+60000).toISOString()};return h.json({run,connected:true,owner_scope:'owner-a',claim_token:'RETRY-CLAIM'});}
  if(body?.action==='save'){saves++;run={...run,state:'completed',result:body.result};readbackBlocked=true;throw Error('lost save response');}
  if(readbackBlocked)throw Error('readback unavailable');
  return h.json(url.includes('?id=')?{run,connected:true,owner_scope:'owner-a'}:{current:run,connected:true,owner_scope:'owner-a'});
 });
 await h.start('?id=retry');await h.click('认领这一个任务');
 const retryResult=JSON.parse(h.nodes().find(n=>n.props.name==='research_result').props.value);
 retryResult.coverage.notice='实际查阅后证据不足';retryResult.shortfall='无法确认具体事件时间';
 await h.change('research_result',JSON.stringify(retryResult));await h.change('',true,true);await h.submit(1);
 assert.equal(saves,1);assert.ok(h.nodes().find(n=>n.props.name==='research_result').props.disabled);
 assert.equal(h.nodes().find(n=>n.props.name==='research_claim_token').props.value,'RETRY-CLAIM');
 readbackBlocked=false;await h.submit(1);assert.equal(saves,1,'a completed readback prevents retransmission after an unknown save');
 assert.ok(h.content(h.tree).includes('没有再次提交'));
 await h.stop();console.log('PASS uncertain save recovery: retain token and exact payload across failed readback, read the same id before retry, never resend completed work');
})().catch(error=>{console.error(error);process.exitCode=1});
