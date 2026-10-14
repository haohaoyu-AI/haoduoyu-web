import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import * as parse5 from 'parse5';
/** Compile actual product modules; substitute only explicit external test seams. */
export function loadTS(file,overrides={},globals={}){
 const cache=new Map();
 function load(filename){
  if(cache.has(filename))return cache.get(filename);
  const evaluated={exports:{}};cache.set(filename,evaluated.exports);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(source,{module:evaluated,exports:evaluated.exports,require:name=>{
   if(name in overrides)return overrides[name];
   if(name==='parse5')return parse5;
   if(name.startsWith('.'))return load(path.resolve(path.dirname(filename),name+(name.endsWith('.ts')?'':'.ts')));
   throw Error('Unexpected dependency '+name);
  },URL,Date,Intl,Error,TypeError,RangeError,crypto,Response,Request,TextEncoder,TextDecoder,AbortSignal,AbortController,setInterval,clearInterval,setTimeout,clearTimeout,...globals},{filename});
  return evaluated.exports;
 }
 return load(path.resolve(file));
}
