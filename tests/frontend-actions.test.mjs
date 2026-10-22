import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {transform} from 'esbuild';
import {parseWeb, visitWeb, webStyle} from '../scripts/check-web.mjs';

const root=new URL('../',import.meta.url);
const CHECKPOINT='2e12147b700ac604d7cccf8e034374644ac99a03';
const old=path=>execFileSync('git',['show',CHECKPOINT+':'+path],{cwd:root,encoding:'utf8',maxBuffer:1024*1024});
const current=path=>readFile(new URL(path,root),'utf8');
function normalized(value) {
  if(Array.isArray(value))return value.map(normalized);
  if(!value||typeof value!=='object')return value;
  const result={};
  for(const [key,item] of Object.entries(value)) {
    if(['start','end','loc','raw'].includes(key))continue;
    result[key]=normalized(item);
  }
  if(result.type==='BreakStatement'&&!result.label)return {type:'ReturnStatement',argument:null};
  return result;
}
// D5 permits exactly the two parser-style to data-attribute substitutions.
// All other cooked text, expressions, declarations and event bodies stay locked.
function normalizeChartMarkup(ast) {
  let substitutions=0;
  visitWeb(ast,node=>{
    if(node.type!=='TemplateLiteral')return;
    const quasis=node.quasis;
    if(quasis[0].value.cooked==='<i data-chart-height="') {
      assert.equal(quasis[1].value.cooked,'" data-chart-color="');
      quasis[0].value.cooked='<i style="height:';
      quasis[1].value.cooked='px;background:';substitutions++;
    }else if(quasis[0].value.cooked==='<span><i class="legend-dot" data-chart-color="') {
      quasis[0].value.cooked='<span><i class="legend-dot" style="background:';substitutions++;
    }
  });
  return substitutions;
}
function normalizedEntry(ast) {
  const helper=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='applyChartStyles');
  assert.ok(helper,'D5 CSSOM helper must be present');
  ast.body=ast.body.filter(node=>node!==helper);
  const replace=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='replacePageContent');
  const hooks=replace.body.body.filter(node=>node.expression?.callee?.name==='applyChartStyles');
  assert.equal(hooks.length,1);
  assert.deepEqual(normalized(hooks[0].expression.arguments),[{type:'Identifier',name:'content'}]);
  const index=replace.body.body.indexOf(hooks[0]);
  assert.equal(replace.body.body[index-1].expression.left.property.name,'innerHTML');
  replace.body.body.splice(index,1);
  return ast;
}
function declarations(ast) {
  return ast.body.filter(node=>['FunctionDeclaration','VariableDeclaration'].includes(node.type));
}
const oldEvents=parseWeb(old('web/events.mjs'));
const register=oldEvents.body.find(node=>node.type==='FunctionDeclaration');
const callbacks=register.body.body.map(node=>node.expression.arguments[1]);
function switchCases(callback) {
  const statement=callback.body.body.find(node=>node.type==='TryStatement').block.body[0];
  const result=new Map();let keys=[];
  for(const item of statement.cases) {
    keys.push(item.test.value);if(!item.consequent.length)continue;
    const body=item.consequent[0].type==='BlockStatement'?item.consequent[0].body:item.consequent;
    for(const key of keys)result.set(key,normalized(body));keys=[];
  }
  return result;
}
async function registry(path,name) {
  const ast=parseWeb(await current(path));
  const functions=new Map(ast.body.filter(node=>node.type==='FunctionDeclaration').map(node=>[node.id.name,node]));
  const declaration=ast.body.flatMap(node=>node.declarations||[]).find(node=>node.id.name===name);
  return new Map(declaration.init.properties.map(item=>[item.key.value,normalized(functions.get(item.value.name).body.body)]));
}
test('all original action/form case bodies are preserved in their named registry handlers',async()=>{
  const actions=await registry('web/actions.mjs','actions'),forms=await registry('web/forms.mjs','forms');
  const oldActions=switchCases(callbacks[0]);
  const filtered=actions.get('article-filter');
  assert.equal(filtered[0].expression.callee.name,'cancelModalRequests');
  actions.set('article-filter',filtered.slice(1));
  assert.deepEqual(actions,oldActions);
  assert.deepEqual(forms,switchCases(callbacks[6]));
  assert.equal(actions.has('toString'),false);
});
test('formatting preserves declarations in otherwise unchanged modules and every cooked template string',async()=>{
  const files=execFileSync('git',['ls-tree','-r','--name-only',CHECKPOINT,'web'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  const changed=new Set(['controller.mjs','events.mjs','core/api.mjs','core/article-index.mjs',
    'core/modal-request.mjs','core/session-index-state.mjs','pages/articles.mjs','pages/detail.mjs','pages/reviews.mjs','ui/modal.mjs']);
  for(const file of files.filter(file=>!changed.has(file.slice(4)))) {
    const canonical=async source=>(await transform(source,{format:'esm',charset:'utf8',target:'esnext',minify:false,treeShaking:false})).code;
    let candidate=parseWeb(await canonical(await current(file)));
    if(file==='web/ui/entry.mjs')candidate=normalizedEntry(candidate);
    const changed=normalizeChartMarkup(candidate);
    assert.equal(changed,file==='web/pages/dashboard.mjs'?2:0);
    assert.deepEqual(normalized(declarations(candidate)),
      normalized(declarations(parseWeb(await canonical(old(file))))),file);
  }
  const collect=source=>{const rows=[],ast=parseWeb(source);normalizeChartMarkup(ast);
    ast.body=ast.body.filter(node=>!(node.type==='FunctionDeclaration'&&node.id.name==='applyChartStyles'));
    visitWeb(ast,node=>{if(node.type==='TemplateLiteral')rows.push(node.quasis.map(q=>q.value.cooked));});return rows;};
  const previous=files.flatMap(file=>collect(old(file)));
  const nextFiles=files.concat(['web/actions.mjs','web/forms.mjs','web/core/requests.mjs']);
  const next=(await Promise.all(nextFiles.map(async file=>collect(await current(file))))).flat();
  const sorted=rows=>rows.map(row=>JSON.stringify(row)).sort();
  assert.deepEqual(sorted(next),sorted(previous),'all template cooked text and whitespace remain exact');
});
test('event bindings retain all nine original positions and capture options',async()=>{
  const ast=parseWeb(await current('web/events.mjs'));
  const next=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='registerEvents');
  const signature=node=>node.body.body.map(statement=>{
    const call=statement.expression;
    return {target:call.callee.object.name,event:call.arguments[0].value,capture:call.arguments[2]?.value??false};
  });
  assert.deepEqual(signature(next),signature(register));
});
test('web style checks every function type and rejects long fixture lines/functions',async()=>{
  const report=await webStyle();assert.deepEqual(report.violations,[]);assert.equal(report.files,30);
  const directory=await mkdtemp(join(tmpdir(),'synthetic-web-style-'));
  try {
    await mkdir(join(directory,'nested'));
    await writeFile(join(directory,'nested/invalid.mjs'),`const tooLong='${'x'.repeat(170)}';\nconst arrow=()=>{\n${'\n'.repeat(81)}};\n`);
    const invalid=await webStyle(directory);
    assert.ok(invalid.violations.some(row=>row.rule==='line'));
    assert.ok(invalid.violations.some(row=>row.rule==='function'));
    await writeFile(join(directory,'word.mjs'),"const action='all-to\\\np';\n");
    assert.ok((await webStyle(directory)).violations.some(row=>row.rule==='word-continuation'));
  }finally {await rm(directory,{recursive:true,force:true});}
});
test('the click prelude and remaining event callback bodies keep their original order and semantics',async()=>{
  const ast=parseWeb(await current('web/events.mjs'));
  const functions=new Map(ast.body.filter(node=>node.type==='FunctionDeclaration').map(node=>[node.id.name,node]));
  const beforeTry=body=>body.slice(0,body.findIndex(node=>node.type==='TryStatement'));
  assert.deepEqual(normalized(beforeTry(functions.get('handleClick').body.body)),normalized(beforeTry(callbacks[0].body.body)));
  for(const [index,name] of [[1,'handleChange'],[2,'handleToggle'],[3,'handleInput'],[4,'handleFilterSubmit'],
    [5,'handleKeydown'],[7,'handleResize'],[8,'handlePopstate']]) {
    assert.deepEqual(normalized(functions.get(name).body),normalized(callbacks[index].body),name);
  }
});
