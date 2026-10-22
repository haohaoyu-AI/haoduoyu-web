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
    assert.deepEqual(normalized(declarations(parseWeb(await canonical(await current(file))))),
      normalized(declarations(parseWeb(await canonical(old(file))))),file);
  }
  const collect=source=>{const rows=[];visitWeb(parseWeb(source),node=>{if(node.type==='TemplateLiteral')rows.push(node.quasis.map(q=>q.value.cooked));});return rows;};
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
  }finally {await rm(directory,{recursive:true,force:true});}
});
