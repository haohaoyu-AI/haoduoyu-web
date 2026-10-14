// Offline source-write compensation. No network, provider or production state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';

const sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const objects=new Map();let puts=0,deletes=0,beforePut=null,failAfterPut=false;
const db={prepare:query=>({bind:(...args)=>({first:async()=>sql.prepare(query).get(...args)||null})})};
const bucket={
 async put(key,bytes,options){puts++;if(beforePut)await beforePut(key);objects.set(key,{bytes:new Uint8Array(bytes),options});if(failAfterPut)throw Error('lost put response');},
 async delete(key){deletes++;objects.delete(key);}
};
const modules={};
function load(file){
 if(modules[file])return modules[file];const exports={};modules[file]=exports;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,Error,require:name=>name==='./test-store'?{db:()=>db}:name==='./articles'?{bucket:()=>bucket}:name.startsWith('./')?load(name.slice(2)):(()=>{throw Error('Unexpected dependency '+name);})()
 });
 return exports;
}
const exports=load('article-source-write');
const {writeArticleSource}=exports,bytes=new TextEncoder().encode('原文必须逐字保留。');
function item(prefix='writing'){const id=randomUUID();return {id,key:`articles/${id}/${prefix}-${'a'.repeat(64)}.txt`};}
function tombstone(owner,id,state='deleted'){
 sql.prepare('INSERT INTO article_deletions(id,owner,state,started_at) VALUES(?,?,?,?)').run(id,owner,state,new Date().toISOString());
}

for(const kind of ['writing','editorial','editorial-v2','editorial-v3']){
 const r=item(kind);await Promise.all([writeArticleSource('owner',r.id,r.key,bytes),writeArticleSource('owner',r.id,r.key,bytes)]);
 assert.deepEqual(objects.get(r.key).bytes,bytes);assert.equal(objects.get(r.key).options.httpMetadata.contentType,'text/plain; charset=utf-8');
}
assert.equal(deletes,0);

const already=item();tombstone('owner',already.id);const before=puts;
await assert.rejects(writeArticleSource('owner',already.id,already.key,bytes),/永久删除/);assert.equal(puts,before);

for(const state of ['deleting','deleted']){
 const r=item();beforePut=async()=>{beforePut=null;tombstone('owner',r.id,state);};
 await assert.rejects(writeArticleSource('owner',r.id,r.key,bytes),/永久删除/);assert.equal(objects.has(r.key),false);
}

const ambiguous=item();beforePut=async()=>{beforePut=null;tombstone('owner',ambiguous.id);};failAfterPut=true;
await assert.rejects(writeArticleSource('owner',ambiguous.id,ambiguous.key,bytes),/永久删除/);assert.equal(objects.has(ambiguous.key),false);

const legitimate=item();await assert.rejects(writeArticleSource('owner',legitimate.id,legitimate.key,bytes),/lost put response/);
assert.deepEqual(objects.get(legitimate.key).bytes,bytes);failAfterPut=false;

const other=item();tombstone('different-owner',other.id);await writeArticleSource('owner',other.id,other.key,bytes);assert.deepEqual(objects.get(other.key).bytes,bytes);
const invalid=item(),attempted=puts;
for(const key of [`articles/${randomUUID()}/writing-${'a'.repeat(64)}.txt`,`articles/${invalid.id}/source`,`articles/${invalid.id}/writing-bad.txt`])await assert.rejects(writeArticleSource('owner',invalid.id,key,bytes),/位置/);
assert.equal(puts,attempted);
console.log('PASS source-write fence: four real source namespaces, unchanged concurrent identical writes, owner isolation, pre-put deletion, late put in deleting/deleted state, ambiguous put response cleanup, valid-source retention on unrelated failure, and exact-key boundary. Remote calls=0.');
