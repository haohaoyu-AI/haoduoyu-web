// Load the actual presentation source and its local imports for synthetic tests.
// This does not contact an API or replace a production state model.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';

const nativeRequire=createRequire(import.meta.url);
export function loadUiSource(filename){
 const cache=new Map();
 function load(file){
  file=path.resolve(file);
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,Date,Intl,URL,require:name=>{
   if(!name.startsWith('.'))return nativeRequire(name);
   const base=path.resolve(path.dirname(file),name);
   const source=[base,`${base}.ts`,`${base}.tsx`].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
   if(!source)throw Error(`Missing source dependency: ${name}`);
   return load(source);
  }});
  return exports;
 }
 return load(filename);
}
