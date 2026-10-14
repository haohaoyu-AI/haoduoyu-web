// Actual chunk/Word calls, SQLite and synthetic R2. No network or platform calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
const native=createRequire(import.meta.url),sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const db={
 prepare(query){return {bind(...args){return {
  first:async()=>sql.prepare(query).get(...args)||null,
  all:async()=>({results:sql.prepare(query).all(...args)}),
  run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}})
 };}};},
 async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}
};
const objects=new Map(),hash=bytes=>createHash('sha256').update(bytes).digest('hex');let putHook=null;
const bucket={
 async put(key,bytes){const fail=putHook?await putHook(key):false;objects.set(key,new Uint8Array(bytes));if(fail)throw Error('lost R2 put response');},
 async delete(key){objects.delete(key);},
 async head(key){const bytes=objects.get(key);return bytes?{size:bytes.length,etag:hash(bytes)}:null;},
 async list({prefix}){return {truncated:false,objects:[...objects].filter(([key])=>key.startsWith(prefix)).map(([key,bytes])=>({key,size:bytes.length}))};},
 async get(key){const bytes=objects.get(key);return bytes?{arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;}
};
const modules={};
function load(name){if(modules[name])return modules[name];const exports={};modules[name]=exports;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:name=>name==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket}}:name.startsWith('./')?load(name.slice(2)):native(name),crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Map,Error,URL,btoa,atob,Date,File,ReadableStream,Response,Request,AbortSignal,setTimeout,clearTimeout,
  fetch:()=>{throw Error('Network forbidden');}
 });return exports;
}
const articles=load('articles'),tools=load('article-tools'),deletion=load('article-list-deletion');
const bytes=zipSync({
 '[Content_Types].xml':strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
 '_rels/.rels':strToU8('<Relationships><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
 'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>原题</w:t></w:r></w:p><w:p><w:r><w:t>正文</w:t></w:r></w:p></w:body></w:document>')
});
const sibling=await articles.createArticle('unrelated-owner',new File(['保留原文'],'preserved.txt'));
for(const operation of ['chunk','word'])for(const ambiguous of [false,true]){
 const owner=`late-${operation}-${ambiguous}`,item=await articles.createArticle(owner,new File(['原题\n正文'],'source.txt'));
 sql.prepare("UPDATE articles SET state='queued' WHERE id=?").run(item.id);
 const claim=await tools.articleCall(owner,'claim_article',{article_id:item.id}),base={article_id:item.id,claim_token:claim.claim_token};
 const output=await tools.articleCall(owner,'begin_article_output',{...base,size:bytes.length,sha256:hash(bytes),chunks:1});
 const chunk=()=>tools.articleCall(owner,'put_article_output_chunk',{...base,output_id:output.output_id,index:0,data_base64:Buffer.from(bytes).toString('base64')});
 const word=()=>tools.articleCall(owner,'finalize_article_output',{...base,output_id:output.output_id});
 if(operation==='word')await chunk();
 let release,reached;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{reached=resolve;});
 putHook=async key=>{assert.ok(key.includes(operation==='chunk'?'/output/':'/result-'));putHook=null;reached();await gate;return ambiguous;};
 const slow=(operation==='chunk'?chunk():word()).then(()=>({saved:true}),error=>({error:error.message}));
 await entered;
 try{
  if(operation==='chunk')await chunk();await word();
  // Synthetic independent delivery receipts make the twin's actual output terminal.
  sql.prepare("UPDATE articles SET state='completed',claim_expires=?,draft_url=? WHERE owner=? AND id=?").run('2000-01-01T00:00:00.000Z','https://example.test/toutiao',owner,item.id);
  sql.prepare("INSERT INTO article_deliveries(id,owner,article_id,platform,state,draft_url,updated) VALUES(?,?,?,'zhihu','saved',?,?)").run(crypto.randomUUID(),owner,item.id,'https://example.test/zhihu',new Date().toISOString());
  const preview=await deletion.previewListDeletion(owner,'publish',crypto.randomUUID(),[item.id]);
  const done=await deletion.confirmListDeletion(owner,{operation_id:preview.operation_id,confirm_owner:owner,confirm_scope:'publish',confirm_ids:[item.id],snapshot_sha256:preview.snapshot_sha256,confirm_permanent:true});
  assert.equal(done.content_deleted,true);release();assert.match((await slow).error,/永久删除/);
  assert.equal([...objects.keys()].some(key=>key.startsWith(`articles/${item.id}/`)),false);
  assert.equal((await deletion.readListDeletion(owner,preview.operation_id)).content_deleted,true);
  assert.ok(objects.has(`articles/${sibling.id}/source`));
 }finally{putHook=null;release();await slow;}
}
console.log('PASS actual chunk and Word writers paused after claim: twin completes, exact deletion confirms, delayed successful/ambiguous puts cannot resurrect bytes; unrelated article source unchanged. Remote calls=0.');
