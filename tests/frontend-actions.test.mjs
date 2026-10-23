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
// Routing and page lifecycle intentionally changed; their behavior is covered by
// the daily-todo UI/browser tests. Other modules retain their historical checks
// after projecting only the exact added field, branch or dashboard wrapper.
const todoIntegration=new Set(['controller.mjs','core/router.mjs']);
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
const snippet=source=>parseWeb(source).body[0];
const variable=(ast,name)=>ast.body.flatMap(node=>node.declarations||[]).find(node=>node.id.name===name);
function stripTodoProperty(ast,declaration,key,expected) {
  const object=variable(ast,declaration).init;
  const found=object.properties.filter(property=>(property.key.name??property.key.value)===key);
  assert.equal(found.length,1,`${declaration}.${key} has exactly one bounded addition`);
  assert.deepEqual(normalized(found[0]),normalized(snippet(`const expected={${expected}}`).declarations[0].init.properties[0]));
  object.properties=object.properties.filter(property=>property!==found[0]);
}
function projectPeriodTable(ast) {
  const table=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='renderPeriodAccounts');
  let classes=0,cells=0;
  visitWeb(table,node=>{
    if(node.type==='TemplateLiteral'&&node.quasis[0].value.cooked.startsWith('<div class="table-scroll"><table class="data-table period-table">')) {
      node.quasis[0].value.cooked=node.quasis[0].value.cooked.replace('class="data-table period-table"','class="data-table"');
      classes++;
    }
    if(node.type!=='ArrowFunctionExpression'||node.body.type!=='TemplateLiteral'||node.body.quasis[0].value.cooked!=='<td data-label="')return;
    assert.deepEqual(normalized(node.params),normalized(snippet('const f=([key,label])=>0').declarations[0].init.params));
    assert.deepEqual(normalized(node.body.expressions[0]),normalized(snippet('e(label);').expression));
    assert.equal(node.body.quasis[1].value.cooked,'">');
    node.params[0].elements.pop();node.body.expressions.shift();node.body.quasis.shift();
    node.body.quasis[0].value.cooked='<td>';cells++;
  });
  assert.deepEqual({classes,cells},{classes:1,cells:1},'only the period-table class and escaped responsive metric label are projected');
}
function projectTodoIntegration(ast,file) {
  if(file==='web/core/constants.mjs') {
    const list=variable(ast,'nav').init;
    const extra=list.elements.filter(element=>element.properties.some(property=>property.key.name==='id'&&property.value.value==='todos'));
    const expected=snippet('const nav=[{id:"todos",label:"每日待办",icon:"check"}]').declarations[0].init.elements;
    assert.deepEqual(normalized(extra),normalized(expected));
    list.elements=list.elements.filter(element=>element!==extra[0]);
  }
  if(file==='web/core/dom.mjs') stripTodoProperty(ast,'icons','check',
    'check:\'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/>\'');
  if(file==='web/core/state.mjs') stripTodoProperty(ast,'state','todoDate','todoDate:""');
  if(file==='web/ui/components.mjs') {
    const header=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='headerActions');
    const extra=header.body.body.filter(node=>node.type==='IfStatement'&&node.test.right?.value==='todos');
    const expected=snippet('function headerActions(){if(state.page==="todos")return "";}').body.body;
    assert.deepEqual(normalized(extra),normalized(expected));
    header.body.body=header.body.body.filter(node=>node!==extra[0]);
    const page=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='pageHeader');
    const title=page.body.body.filter(node=>node.type==='IfStatement'&&node.test.right?.value==='todos');
    assert.deepEqual(normalized(title),normalized(snippet(`function pageHeader(){if(state.page==="todos")return '<div class="heading-left"><h1>每日待办</h1></div>';}`).body.body));
    page.body.body=page.body.body.filter(node=>node!==title[0]);
  }
  if(file==='web/pages/dashboard.mjs') {
    const wrapper=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='renderDashboard');
    const expected=snippet('function renderDashboard(data){return renderDashboardSummary(data);}');
    assert.deepEqual(normalized(wrapper),normalized(expected));
    ast.body=ast.body.filter(node=>node!==wrapper);
    const summary=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='renderDashboardSummary');
    assert.ok(summary,'the original dashboard body remains present');
    summary.id.name='renderDashboard';
    projectPeriodTable(ast);
  }
  return ast;
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
  const additions=new Set(['todo-template-use','todo-template-edit','todo-template-delete','todo-template-cancel',
    'todo-calendar-prev','todo-calendar-next','todo-calendar-date','todo-prev','todo-next','todo-today','todo-reload']);
  if(name==='actions') {
    const expected=snippet('const actions={"todo-template-use":({id})=>useTodoTemplate(id),"todo-template-edit":({id})=>editTodoTemplate(id),"todo-template-delete":({id})=>writeTodoTemplate(id,undefined,true),"todo-template-cancel":cancelTodoTemplateEdit,"todo-calendar-prev":()=>moveTodoMonth(-1),"todo-calendar-next":()=>moveTodoMonth(1),"todo-calendar-date":({target})=>selectTodoDate(target.dataset.date),"todo-prev":()=>moveTodoDate(-1),"todo-next":()=>moveTodoDate(1),"todo-today":()=>selectTodoDate(bjtDate()),"todo-reload":refreshTodos}');
    const extra=declaration.init.properties.filter(item=>additions.has(item.key.value));
    assert.deepEqual(normalized(extra),normalized(expected.declarations[0].init.properties));
  }
  return new Map(declaration.init.properties.filter(item=>!additions.has(item.key.value))
    .map(item=>[item.key.value,normalized(functions.get(item.value.name).body.body)]));
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
  for(const file of files.filter(file=>!changed.has(file.slice(4))&&!todoIntegration.has(file.slice(4)))) {
    const canonical=async source=>(await transform(source,{format:'esm',charset:'utf8',target:'esnext',minify:false,treeShaking:false})).code;
    let candidate=projectTodoIntegration(parseWeb(await canonical(await current(file))),file);
    if(file==='web/ui/entry.mjs')candidate=normalizedEntry(candidate);
    const changed=normalizeChartMarkup(candidate);
    assert.equal(changed,file==='web/pages/dashboard.mjs'?2:0);
    assert.deepEqual(normalized(declarations(candidate)),
      normalized(declarations(parseWeb(await canonical(old(file))))),file);
  }
  const collect=(source,file,project=false)=>{const rows=[],ast=project?projectTodoIntegration(parseWeb(source),file):parseWeb(source);normalizeChartMarkup(ast);
    ast.body=ast.body.filter(node=>!(node.type==='FunctionDeclaration'&&node.id.name==='applyChartStyles'));
    visitWeb(ast,node=>{if(node.type==='TemplateLiteral')rows.push(node.quasis.map(q=>q.value.cooked));});return rows;};
  const integrationBase='89ca9dd0ddca8b4e8866fbeb812b11a3d46ab222';
  const templateFiles=execFileSync('git',['ls-tree','-r','--name-only',integrationBase,'web'],{cwd:root,encoding:'utf8'})
    .trim().split('\n').filter(file=>!todoIntegration.has(file.slice(4)));
  const previous=templateFiles.flatMap(file=>collect(execFileSync('git',['show',integrationBase+':'+file],{cwd:root,encoding:'utf8'}),file));
  const next=(await Promise.all(templateFiles.map(async file=>collect(await current(file),file,true)))).flat();
  const sorted=rows=>rows.map(row=>JSON.stringify(row)).sort();
  assert.deepEqual(sorted(next),sorted(previous),'unchanged module template cooked text and whitespace remain exact');
});
test('event bindings retain all nine original positions and capture options',async()=>{
  const ast=parseWeb(await current('web/events.mjs'));
  const next=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='registerEvents');
  const hook=next.body.body.filter(statement=>statement.expression?.callee?.name==='registerTodosClock');
  assert.deepEqual(normalized(hook),normalized(snippet('function register(){registerTodosClock();}').body.body));
  const signature=node=>node.body.body.filter(statement=>statement.expression?.callee?.name!=='registerTodosClock').map(statement=>{
    const call=statement.expression;
    return {target:call.callee.object.name,event:call.arguments[0].value,capture:call.arguments[2]?.value??false};
  });
  assert.deepEqual(signature(next),signature(register));
});
test('web style checks every function type and rejects long fixture lines/functions',async()=>{
  const report=await webStyle();assert.deepEqual(report.violations,[]);assert.equal(report.files,34);
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
  const click=structuredClone(functions.get('handleClick').body),navCalls=[];
  visitWeb(click,node=>{if(node.type==='CallExpression'&&node.callee.name==='navigateLink')navCalls.push(node);});
  assert.deepEqual(normalized(navCalls),normalized([snippet('navigateLink(target.dataset.nav);').expression]));
  navCalls[0].callee.name='navigate';
  assert.deepEqual(normalized(beforeTry(click.body)),normalized(beforeTry(callbacks[0].body.body)));
  for(const [index,name] of [[1,'handleChange'],[2,'handleToggle'],[3,'handleInput'],[4,'handleFilterSubmit'],
    [5,'handleKeydown'],[7,'handleResize'],[8,'handlePopstate']]) {
    const body=structuredClone(functions.get(name).body);
    if(name==='handleChange') {
      const expected=snippet('function change(){if(el.dataset?.todoId){toggleTodo(el);return;}if(el.id==="todo-date"){selectTodoDate(el.value);return;}}').body.body;
      assert.deepEqual(normalized(body.body.slice(1,3)),normalized(expected));
      body.body.splice(1,2);
    }
    if(name==='handleInput') {
      assert.deepEqual(normalized(body.body.slice(1,3)),normalized(parseWeb('inputTodo(el);inputTodoTemplate(el);').body));
      body.body.splice(1,2);
    }
    if(name==='handleToggle') {
      assert.deepEqual(normalized(body.body[0]),normalized(snippet('if(event.target.id==="todo-templates"&&event.target.isConnected&&event.target.open)loadTodoTemplates();')));
      body.body.splice(0,1);
    }
    assert.deepEqual(normalized(body),normalized(callbacks[index].body),name);
  }
});
