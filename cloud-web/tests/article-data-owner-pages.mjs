// Actual candidate React component in deterministic hook/fetch harness. No browser
// or real identities. Deliberately changes owner BETWEEN page responses.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';
const source=fs.readFileSync('app/article-data/page.tsx','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario(kind){
 const states=[],refs=[],callbacks=[],effects=[],pending=[];let si=0,ri=0,ci=0,ei=0,dirty=true,tree,phase='initial',calls=[];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const hooks={...React,useState:init=>{const i=si++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;dirty=true;}];},useRef:init=>{const i=ri++;return refs[i]??(refs[i]={current:init});},useCallback:(fn,deps)=>{const i=ci++;if(!callbacks[i]||!same(callbacks[i].deps,deps))callbacks[i]={fn,deps};return callbacks[i].fn;},useEffect:(fn,deps)=>{const i=ei++;if(!effects[i]||!same(effects[i].deps,deps)){effects[i]={deps};pending.push(fn);}}};
 const record=owner=>({history_key:owner,title:'OFFLINE '+owner,topic_label:'OFFLINE',mode:'manual_word_only',status:'word_delivered',completed_at:'2026-10-13T12:00:00Z',completed_at_precision:'second',platforms:{toutiao:{draft_url:null,status:'not_requested'},zhihu:{draft_url:null,status:'not_requested'}},observations:[]});
 const history=(owner,next)=>({owner_scope:owner,items:[record(owner)],total:26,next_offset:next,summary:{processed:26,private_drafts:0,full_auto:0,semi_auto:26},notice:'OFFLINE'});
 const fetcher=async url=>{calls.push(url);if(url.includes('workspace'))return phase==='unauthorized'?new Response('',{status:401}):Response.json({owner_scope:phase==='initial'?'A':'B',items:[],total:0,offset:0,limit:100,next_offset:null});if(phase==='initial')return Response.json(history('A',25));if(phase==='recovered')return Response.json(history('B',null));if(kind==='between-pages')return Response.json(history(url.endsWith('offset=0')?'A':'B',null));if(kind==='retained-owner')return Response.json(history('B',null));return Response.json(history('A',null));};
 const exports={};vm.runInNewContext(code,{exports,require:n=>n==='react'?hooks:n==='react/jsx-runtime'?jsxRuntime:{default:()=>null},Response,Date,Array,Map,Error,AbortSignal,fetch:fetcher,window:{setTimeout:fn=>{pending.push(fn);return 1;},clearTimeout:()=>{}}});
 function render(){si=ri=ci=ei=0;dirty=false;tree=exports.default();pending.splice(0).forEach(fn=>fn());}
 async function settle(){for(let i=0;i<8;i++){if(dirty||pending.length)render();await new Promise(r=>setImmediate(r));}}
 function button(node,label){if(!React.isValidElement(node))return null;if(node.type==='button'&&node.props.children===label)return node;for(const c of React.Children.toArray(node.props.children)){const b=button(c,label);if(b)return b;}return null;}
 await settle();assert.equal(states[0].owner_scope,'A');phase=kind==='workspace-auth'?'unauthorized':'switch';calls=[];await button(tree,'加载更多历史').props.onClick();await settle();
 assert.equal(states[0],null,kind+' clears old/history mixed view');assert.equal(states[1],null,kind+' clears stale archive controls');assert.equal(refs[2].current.length,1);assert.equal(refs[2].current[0],0);assert.equal(refs[3].current,null);
 if(kind==='between-pages')assert.equal(calls.filter(u=>u.includes('workspace')).length,0,'reject before workspace commit');
 phase='recovered';calls=[];await button(tree,'刷新数据').props.onClick();await settle();assert.equal(states[0].owner_scope,'B');assert.equal(states[0].items.length,1);assert.equal(states[0].items[0].title,'OFFLINE B');assert.equal(calls.filter(u=>u.includes('article-data')).length,1,'pagination reset');
}
for(const kind of ['between-pages','retained-owner','workspace-auth','workspace-switch'])await scenario(kind);
console.log('PASS actual ArticleDataPage: every page/current-owner/inventory mismatch and workspace 401 clear entire batch/pagination/old action controls; next explicit refresh starts owner B at offset0. Deterministic offline UI harness, no production/browser/account data.');
