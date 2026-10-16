// Real SQLite policy/HTTP test. No provider, browser or real network is allowed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+file,'utf8'));
let writes=0,events=0,readinessCalls=0;
const db={prepare:query=>({bind:(...args)=>({first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>{writes++;return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}})}),batch:async statements=>{sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const store={db:()=>db,owner:request=>request.headers.get('oai-authenticated-user-id')};
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};vm.runInNewContext(compile('lib/article-output-mode.ts'),{exports:policy,require:()=>store,Error,JSON});
const recovery={};vm.runInNewContext(compile('lib/article-recovery-view.ts'),{exports:recovery,Date});
const handoff={};vm.runInNewContext(compile('lib/article-handoff.ts'),{exports:handoff,crypto,Date,Error,require:name=>name==='./article-output-mode'?policy:name==='./article-recovery-view'?recovery:name==='./test-store'?store:name==='./articles'?{article:async(owner,id)=>{const row=sql.prepare('SELECT * FROM articles WHERE id=? AND owner=?').get(id,owner);if(!row)throw Error('没有找到此任务');return row;}}:{readiness:async()=>{readinessCalls++;return {connected:true};},dispatch:async()=>{events++;return '事件已送达';}}});
const route={};
vm.runInNewContext(compile('app/api/articles/[id]/submit/route.ts'),{
 exports:route,Request,Response,URL,Error,
 require:name=>name.endsWith('/article-handoff')?handoff:store,
});
const owner='offline-owner',day='2026-10-07',time='2026-10-07T00:00:00.000Z';
function article(state='uploaded',manifest=null){const id=crypto.randomUUID();sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,artifact_manifest) VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,'合成文章','source.txt','articles/'+id+'/source','["合成文章","原文"]',time,state,manifest);return id;}
function writing(id,kind){sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),owner,day,'xiaoyu',kind,'ready',id,time,time);}
const submit=(id,user=owner)=>route.POST(new Request('https://site.test/api/articles/'+id+'/submit',{method:'POST',headers:{origin:'https://site.test','x-xiaoyu-upload':'1','oai-authenticated-user-id':user}}),{params:Promise.resolve({id})});
for(const kind of ['daily','workflow_test','workflow_rewrite_v2','manual:'+crypto.randomUUID(),'editorial_v3:'+crypto.randomUUID()]){
 const id=article();writing(id,kind);const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(id)),count=writes;
 assert.equal((await submit(id)).status,409,kind);assert.equal(writes,count);assert.equal(events,0);assert.equal(readinessCalls,0);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(id)),before);
}
for(const id of [article('text_saved'),article('uploaded',JSON.stringify({contract_version:1,output_mode:'text_only'}))])assert.equal((await submit(id)).status,409);
const uploaded=article();assert.equal((await submit(uploaded,'')).status,401);assert.equal((await submit(uploaded,'foreign-owner')).status,400);
assert.equal((await submit(uploaded)).status,200);assert.equal(events,1);assert.equal(sql.prepare('SELECT state FROM articles WHERE id=?').get(uploaded).state,'queued');
const foreign=article();sql.prepare('INSERT INTO writing_runs(id,owner,day,writer,run_kind,state,article_id,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'foreign-owner',day,'xiaoyu','daily','ready',foreign,time,time);
assert.equal((await submit(foreign)).status,200,'a foreign owner writing row must not change this owner manual-upload policy');assert.equal(events,2);
console.log('PASS automatic scopes/state/manifest blocked before any write/readiness/event; ordinary owner uploads retain processing; owner isolation enforced.');
