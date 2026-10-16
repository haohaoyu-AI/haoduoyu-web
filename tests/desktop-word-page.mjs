import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// This executes the actual page effect and actual bridge parser. React hooks
// supply the documented setup -> cleanup -> setup lifecycle; transport is inert.
// No renderer/browser or HTTP, real batches, manuscripts or credentials are used.
const pageSource=fs.readFileSync('app/desktop-word-only/page.tsx','utf8');
const pageCode=ts.transpileModule(pageSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const bridgeCode=ts.transpileModule(fs.readFileSync('lib/desktop-word-bridge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const pureModule={exports:{}};
vm.runInNewContext(bridgeCode,{module:pureModule,exports:pureModule.exports,Error,URLSearchParams});
const validSpec={nonce:'a'.repeat(64),batch_id:'b'.repeat(32),local_origin:'http://127.0.0.1:8876'};
const fragment=spec=>'#'+new URLSearchParams(spec);
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
let cases=0;
function harness(hash=fragment(validSpec)){
  cases++;
  let effect,parseCalls=0,stateIndex=0,storageReads=0;
  const states=[],refs=[],runs=[],historyCalls=[];
  const window={location:{hash,pathname:'/desktop-word-only'},history:{replaceState(state,title,url){
    historyCalls.push({state,title,url});
    window.location.hash='';
  }}};
  for(const key of ['sessionStorage','localStorage'])Object.defineProperty(window,key,{get(){storageReads++;throw Error('Bridge capability must stay in memory');}});
  const react={
    useState(initial){const index=stateIndex++;states[index]=initial;return [initial,value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
    useRef(initial){const ref={current:initial};refs.push(ref);return ref;},
    useEffect(callback,dependencies){assert.deepEqual(Array.from(dependencies),[]);effect=callback;}
  };
  const runDesktopWordBridge=(spec,onState,signal)=>{
    let resolve,reject;
    const promise=new Promise((accept,refuse)=>{resolve=accept;reject=refuse;});
    const call={spec,onState,signal,resolve,reject,active:true};
    signal.addEventListener('abort',()=>{call.active=false;},{once:true});
    runs.push(call);
    onState('合成连接已建立');
    return promise;
  };
  const pageModule={exports:{}};
  vm.runInNewContext(pageCode,{
    module:pageModule,exports:pageModule.exports,Error,AbortController,window,
    require(name){
      if(name==='react')return react;
      if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
      if(name==='../../lib/desktop-word-bridge')return {
        parseBridgeFragment(value){parseCalls++;return pureModule.exports.parseBridgeFragment(value);},
        runDesktopWordBridge
      };
      throw Error('Unexpected import '+name);
    }
  });
  pageModule.exports.default();
  assert.equal(typeof effect,'function');
  return {window,states,refs,runs,historyCalls,setup:()=>effect(),get parseCalls(){return parseCalls;},get storageReads(){return storageReads;}};
}

// The regression: clearing the address hash cannot invalidate Strict replay.
{
  const page=harness();
  const cleanup=page.setup();
  assert.equal(page.window.location.hash,'');
  assert.equal(page.runs.length,1);
  assert.equal(page.runs[0].signal.aborted,false);
  cleanup();
  assert.equal(page.runs[0].signal.aborted,true);
  const cleanupAgain=page.setup();
  assert.equal(page.parseCalls,1,'Parse the first valid fragment only once across effect replay');
  assert.equal(page.runs.length,2,'The live replay restarts using its retained capability');
  assert.equal(page.runs[1].spec,page.runs[0].spec,'Same in-memory spec object, nonce, batch and origin');
  assert.equal(page.historyCalls.length,1);
  assert.equal(page.historyCalls[0].url,'/desktop-word-only');
  assert.equal(page.states[1],false);
  assert.equal(page.runs.filter(call=>call.active).length,1);
  assert.equal(page.storageReads,0);
  cleanupAgain();
  assert.equal(page.runs.filter(call=>call.active).length,0);
}
// More than one replay still shares that one capability and aborts each old run.
{
  const page=harness();
  for(let i=0;i<4;i++){
    const cleanup=page.setup();
    assert.equal(page.runs.filter(call=>call.active).length,1);
    cleanup();
  }
  assert.equal(page.parseCalls,1);
  assert.equal(page.historyCalls.length,1);
  assert.equal(page.runs.length,4);
  assert.equal(page.runs.every(call=>call.spec===page.runs[0].spec),true);
  assert.equal(page.runs.every(call=>call.signal.aborted),true);
}
// A stopped effect cannot overwrite the live status or mark it failed later.
{
  const page=harness();
  const cleanup=page.setup();
  cleanup();
  const liveCleanup=page.setup();
  page.runs[1].onState('live connection');
  page.runs[0].onState('stale closed connection');
  page.runs[0].reject(Error('Late aborted failure'));
  await flush();
  assert.equal(page.states[0],'live connection');
  assert.equal(page.states[1],false);
  page.runs[1].onState('live confirmed failure');
  page.runs[1].reject(Error('Live failure'));
  await flush();
  assert.equal(page.states[0],'live confirmed failure');
  assert.equal(page.states[1],true);
  liveCleanup();
}
// A page opened without a fragment cannot invent a local capability.
{
  const page=harness('');
  const cleanup=page.setup();
  assert.equal(page.runs.length,0);assert.equal(page.states[1],true);assert.equal(page.historyCalls.length,0);
  assert.equal(page.refs[0].current,null);cleanup();
}
// The old 18876 test window remains invalid; no port or nonce contract expansion.
for(const change of [
  {local_origin:'http://127.0.0.1:18876'},
  {local_origin:'http://evil.invalid:8876'},
  {local_origin:'http://127.0.0.1:8876/'},
  {nonce:'short'},
  {batch_id:'b'.repeat(31)}
]){
  const page=harness(fragment({...validSpec,...change}));
  const cleanup=page.setup();
  assert.equal(page.runs.length,0);assert.equal(page.states[1],true);
  assert.equal(page.historyCalls.length,0);assert.equal(page.refs[0].current,null);cleanup();
}
{
  const page=harness(fragment(validSpec)+'&nonce=duplicate');
  const cleanup=page.setup();
  assert.equal(page.runs.length,0);assert.equal(page.states[1],true);cleanup();
}
// The existing production allowlist boundaries remain usable.
for(const port of [8875,8884]){
  const page=harness(fragment({...validSpec,local_origin:'http://127.0.0.1:'+port}));
  const cleanup=page.setup();
  assert.equal(page.runs.length,1);
  assert.equal(page.runs[0].spec.local_origin,'http://127.0.0.1:'+port);
  assert.equal(page.states[1],false);assert.equal(page.storageReads,0);cleanup();
}
// Failed parsing never pins bad input; the first later valid parse is retained.
{
  const page=harness('');
  const cleanup=page.setup();cleanup();
  page.window.location.hash=fragment(validSpec);
  const cleanupAgain=page.setup();
  assert.equal(page.parseCalls,2);assert.equal(page.runs.length,1);assert.equal(page.states[1],false);
  assert.equal(page.refs[0].current,page.runs[0].spec);assert.equal(page.storageReads,0);cleanupAgain();
}
console.log('Desktop Word page: '+cases+' isolated effect-lifecycle cases passed; Strict replay, single in-memory capability, abort cleanup/stale callbacks, empty/invalid fragments and unchanged nonce/port allowlist. This is a hook lifecycle harness, not a live browser or paid execution.');
