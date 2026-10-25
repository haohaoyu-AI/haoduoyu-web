import {reconciliationModules,projectReconciliation} from './reconciliation-ui-projection.mjs';
import {workbenchAddedModules} from './workbench-ui-projection.mjs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile, readdir} from 'node:fs/promises';
import {parseWeb} from '../scripts/check-web.mjs';
import {memoAddedModules,projectMemoFrontend} from './memos-ui-projection.mjs';

export const PHASE7_BASELINE='37a1e4f2618e1fea6ded05911b2a73572968442a';
const root=new URL('../',import.meta.url);
const baselineCache=new Map();
export function phase7Baseline(file) {
  if(!baselineCache.has(file))baselineCache.set(file,execFileSync('git',['show',PHASE7_BASELINE+':'+file],
    {cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}));
  return baselineCache.get(file);
}
export const phase7Hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function phase7Normalized(value) {
  if(Array.isArray(value))return value.map(phase7Normalized);
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!['start','end','loc','raw'].includes(key))
    .map(([key,item])=>[key,phase7Normalized(item)]));
}

// Every top-level declaration is independently identified. Object variables are
// split into a declaration shell and individual properties, so an article state
// addition cannot authorize any other state field or action registry entry.
export function phase7Nodes(source) {
  const nodes=new Map(),counts=new Map();
  const put=(key,value)=>{assert.ok(!nodes.has(key),'unique frontend AST key: '+key);nodes.set(key,phase7Normalized(value));};
  for(const node of parseWeb(source).body) {
    if(node.type==='FunctionDeclaration')put('function:'+node.id.name,node);
    else if(node.type==='VariableDeclaration')for(const declaration of node.declarations) {
      assert.equal(declaration.id.type,'Identifier','top-level variables retain explicit names');
      const key='variable:'+declaration.id.name,shell=structuredClone(declaration);
      if(declaration.init?.type==='ObjectExpression') {
        shell.init.properties=[];put(key,{kind:node.kind,declaration:shell});
        for(const property of declaration.init.properties) {
          assert.equal(property.type,'Property','top-level objects do not hide spread additions');
          assert.equal(property.computed,false);
          put(key+'.'+(property.key.name??property.key.value),property);
        }
      }else put(key,{kind:node.kind,declaration:shell});
    }else if(node.type==='ImportDeclaration') {
      const name='import:'+node.source.value,index=counts.get(name)||0;counts.set(name,index+1);
      const key=name+':'+index,shell=structuredClone(node);shell.specifiers=[];put(key,shell);
      for(const item of node.specifiers)put(key+'.'+item.local.name,item);
    }else if(node.type==='ExportNamedDeclaration'&&!node.declaration) {
      const name='exports:'+(node.source?.value??'local'),index=counts.get(name)||0;counts.set(name,index+1);
      const shell=structuredClone(node);shell.specifiers=[];put(name+':'+index,shell);
      for(const item of node.specifiers)put('export:'+item.exported.name,item);
    }else {
      const index=counts.get(node.type)||0;counts.set(node.type,index+1);put('statement:'+node.type+':'+index,node);
    }
  }
  // esbuild may move an unchanged dependency when a newly imported module uses
  // it earlier. The exact complete order has its own manifest hash; it is never
  // sorted away or accepted as arbitrary declaration movement.
  put('program:order',[...nodes.keys()]);
  return nodes;
}
export function phase7Changes(before,after) {
  const previous=phase7Nodes(before),next=phase7Nodes(after);
  return [...new Set([...previous.keys(),...next.keys()])].sort().flatMap(key=>{
    const before_sha256=previous.has(key)?phase7Hash(previous.get(key)):null;
    const after_sha256=next.has(key)?phase7Hash(next.get(key)):null;
    return before_sha256===after_sha256?[]:[{key,before_sha256,after_sha256}];
  });
}
export function validatePhase7Projection(before,after,changes,label) {
  const previous=phase7Nodes(before),next=phase7Nodes(after);
  assert.deepEqual(phase7Changes(before,after),changes,'exact approved Phase7 AST changes: '+label);
  // The manifest contains hashes only: replacement nodes always come from the
  // accepted commit, never from editable baseline copies or a blanket exclusion.
  for(const {key,before_sha256}of changes) {
    if(before_sha256===null)next.delete(key);else next.set(key,previous.get(key));
  }
  assert.deepEqual([...next].sort(),[...previous].sort(),'complete AST projects to the accepted frontend: '+label);
  return before;
}
let manifest;
export async function phase7Manifest() {
  if(!manifest)manifest=JSON.parse(await readFile(new URL('./article-pipeline-ui-delta.json',import.meta.url),'utf8'));
  assert.equal(manifest.baseline,PHASE7_BASELINE);return manifest;
}
export async function projectPhase7Frontend(file,source) {
  source=await projectMemoFrontend(file,source);
  const delta=await phase7Manifest();
  const changes=file==='public/app.js'?delta.bundle:delta.sources[file];
  if(!changes)return source;
  const before=delta.added_modules.includes(file)?'':phase7Baseline(file);
  return validatePhase7Projection(before,source,changes,file);
}
export async function phase7ModuleFiles() {
  return (await readdir(new URL('../web/',import.meta.url),{recursive:true})).filter(file=>file.endsWith('.mjs'))
    .map(file=>'web/'+file).sort();
}
export async function verifyPhase7FrontendBoundary() {
  const delta=await phase7Manifest(),all=await phase7ModuleFiles();
  for(const file of reconciliationModules)assert.equal(projectReconciliation(file,await readFile(new URL('../'+file,import.meta.url),'utf8')),'');
  const files=all.filter(file=>!reconciliationModules.includes(file));
  assert.deepEqual(files,[...delta.modules,...memoAddedModules,...workbenchAddedModules].sort(),'the complete article and memo module inventory is explicit');
  for(const file of files) {
    const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
    if([...memoAddedModules,...workbenchAddedModules].includes(file))assert.equal(await projectMemoFrontend(file,source),'');
    else if(Object.hasOwn(delta.sources,file))await projectPhase7Frontend(file,source);
    else assert.equal(await projectMemoFrontend(file,source),phase7Baseline(file),'unchanged frontend source remains byte-identical: '+file);
  }
  const css=await readFile(new URL('../public/style.css',import.meta.url),'utf8'),base=phase7Baseline('public/style.css');
  assert.equal(css.slice(0,base.length),base,'the complete accepted CSS prefix remains byte-identical');
  // These shared branches are protected even inside approved changed functions.
  for(const file of ['web/ui/components.mjs','web/core/router.mjs']) {
    const source=await projectMemoFrontend(file,await readFile(new URL('../'+file,import.meta.url),'utf8'));
    for(const page of ['todos','notes']) {
      const branches=text=>{
        const rows=[];
        const visit=node=>{
          if(!node||typeof node!=='object')return;
          if(node.type==='IfStatement'&&node.test.type==='BinaryExpression'&&node.test.right.value===page)
            rows.push(text.slice(node.start,node.end));
          for(const [key,value]of Object.entries(node))if(key!=='loc') {
            if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
          }
        };
        visit(parseWeb(text));return rows;
      };
      assert.deepEqual(branches(source),branches(phase7Baseline(file)),file+' '+page+' branches retain exact bytes');
    }
  }
}
