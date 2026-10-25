import {projectReconciliation,reconciliationModules} from './reconciliation-ui-projection.mjs';
import assert from 'node:assert/strict';
import {workbenchAddedModules} from './workbench-ui-projection.mjs';
import {round4AddedModules,projectWorkbenchRound4} from './workbench-round4-projection.mjs';
import {projectPublicNoteFrontend} from './public-note-ui-projection.mjs';
import {execFileSync} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {frontendBundle} from '../scripts/frontend-build.mjs';
import {parseWeb, visitWeb} from '../scripts/check-web.mjs';

export const MEMO_PRODUCTION_BASE='fe8efa479c0c2865970b43053db4deb62a3380c9';
export const MEMO_SOURCE_BASE='0bff743cc6951a6fb51ffa47dd8cdcc4c55bcbb6';
export const memoAddedModules=['web/core/memos-state.mjs','web/memos-controller.mjs','web/memos-recovery.mjs','web/pages/memos.mjs'];
export const memoSharedFiles=['web/core/constants.mjs','web/ui/components.mjs','web/controller.mjs'];
const root=new URL('../',import.meta.url),cache=new Map();
export function memoBaseline(file,commit=MEMO_PRODUCTION_BASE) {
  const key=commit+':'+file;
  if(!cache.has(key))cache.set(key,execFileSync('git',['show',key],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}));
  return cache.get(key);
}
function normalized(value) {
  if(Array.isArray(value))return value.map(normalized);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['start','end','loc','raw'].includes(key))
    .map(([key,item])=>[key,normalized(item)]));
}
const snippet=source=>parseWeb(source).body[0];
const variable=(ast,name)=>ast.body.flatMap(node=>node.declarations||[]).find(node=>node.id.name===name);
// Strip only the reviewed memo integration, then compare every remaining AST
// node with the exact released article-frontend base. New memo modules remain fully subject
// to style, behavior, security and generated artifact checks.
function projectMemoIntegration(ast,file) {
  if(file==='web/core/constants.mjs') {
    const list=variable(ast,'nav').init;
    const extra=list.elements.filter(element=>element.properties.some(property=>property.key.name==='id'&&property.value.value==='memos'));
    const expected=snippet('const nav=[{id:"memos",label:"备忘录",icon:"articles"}]').declarations[0].init.elements;
    assert.deepEqual(normalized(extra),normalized(expected),'one exact memo navigation item');
    list.elements=list.elements.filter(element=>element!==extra[0]);
  }
  if(file==='web/ui/components.mjs') {
    const fn=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='pageHeader');
    const extra=fn.body.body.filter(node=>node.type==='IfStatement'&&node.test.right?.value==='memos');
    const expected=snippet(`function pageHeader(){if(state.page==="memos")return '<div class="heading-left"><h1>备忘录</h1></div>';}`).body.body;
    assert.deepEqual(normalized(extra),normalized(expected),'one exact memo page heading');
    fn.body.body=fn.body.body.filter(node=>node!==extra[0]);
  }
  if(file==='web/controller.mjs') projectMemoController(ast);
  return ast;
}
function projectMemoController(ast) {
  const sources=new Set(['./pages/memos.mjs','./memos-controller.mjs']);
  const additions=ast.body.filter(node=>node.type==='ImportDeclaration'&&sources.has(node.source.value));
  const imports=parseWeb('import {renderMemos} from "./pages/memos.mjs";import {loadMemos,paintMemosPage} from "./memos-controller.mjs";').body;
  assert.deepEqual(normalized(additions),normalized(imports),'only two exact memo imports');
  ast.body=ast.body.filter(node=>!additions.includes(node));
  const fn=name=>ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);
  const mobile=fn('mobileNavigation').body.body[0].argument.quasis[0];
  assert.equal(mobile.value.cooked,'<nav class="mobile-nav notes-navigation memos-navigation" aria-label="切换模块">');
  mobile.value.cooked='<nav class="mobile-nav notes-navigation" aria-label="切换模块">';
  const loading=fn('pageLoading').body.body;
  const extra=loading.filter(node=>node.type==='IfStatement'&&node.test.right?.value==='memos');
  assert.deepEqual(normalized(extra),normalized(snippet('function pageLoading(){if(page==="memos")return renderMemos();}').body.body));
  fn('pageLoading').body.body=loading.filter(node=>node!==extra[0]);
  const chain=fn('setPageBody').body.body[0].alternate;
  const expected=snippet('if(page==="memos")paintMemosPage();else replacePageContent(html,true);');
  assert.deepEqual(normalized(chain.alternate),normalized(expected),'only the memo paint branch');
  chain.alternate=chain.alternate.alternate;
  const cases=[];
  visitWeb(fn('renderPage'),node=>{
    if(node.type!=='SwitchStatement')return;
    for(const item of node.cases.filter(row=>row.test?.value==='memos'))cases.push(item);
    node.cases=node.cases.filter(row=>row.test?.value!=='memos');
  });
  const expectedCase=snippet('async function renderPage(){switch(page){case "memos":await loadMemos();break;}}').body.body[0].cases;
  assert.deepEqual(normalized(cases),normalized(expectedCase),'only the memo loading switch case');
}

export async function projectMemoFrontend(file,source) {
  const original=source;
  source=await projectPublicNoteFrontend(file,source);
  if(workbenchAddedModules.includes(file))return source;
  if(memoAddedModules.includes(file)) {
    assert.equal(source,memoBaseline(file,MEMO_SOURCE_BASE),'exact accepted memo module bytes: '+file);
    return '';
  }
  if(memoSharedFiles.includes(file)) {
    const projected=projectMemoIntegration(parseWeb(source),file),before=memoBaseline(file);
    assert.deepEqual(normalized(projected),normalized(parseWeb(before)),
      'exact memo additions retain every released article frontend AST node: '+file);
    return before;
  }
  if(file==='public/app.js') {
    await verifyMemoFrontendBoundary();
    assert.equal(original,Buffer.from(await frontendBundle(fileURLToPath(root))).toString('utf8'),
      'combined memo/article bundle is the exact readable source build');
    return memoBaseline(file);
  }
  return source;
}
export async function verifyMemoFrontendBoundary() {
  const production=execFileSync('git',['ls-tree','-r','--name-only',MEMO_PRODUCTION_BASE,'web'],{cwd:root,encoding:'utf8'})
    .trim().split('\n').filter(file=>file.endsWith('.mjs'));
  const files=(await readdir(new URL('../web/',import.meta.url),{recursive:true})).filter(file=>file.endsWith('.mjs'))
    .map(file=>'web/'+file).sort();
  for(const file of reconciliationModules)assert.equal(projectReconciliation(file,await readFile(new URL('../'+file,import.meta.url),'utf8')),'');
  for(const file of round4AddedModules)assert.equal(projectWorkbenchRound4(file,await readFile(new URL('../'+file,import.meta.url),'utf8')),'');
  const existing=files.filter(file=>![...reconciliationModules,...round4AddedModules].includes(file));
  assert.deepEqual(existing,[...production,...memoAddedModules,...workbenchAddedModules].sort(),'released modules plus reviewed memo and workbench modules');
  for(const file of existing) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    if(workbenchAddedModules.includes(file)){assert.equal(await projectPublicNoteFrontend(file,source),'');continue;}
    if(memoAddedModules.includes(file)||memoSharedFiles.includes(file))await projectMemoFrontend(file,source);
    else assert.equal(await projectPublicNoteFrontend(file,source),memoBaseline(file),'every other released frontend source byte remains unchanged: '+file);
  }
}
