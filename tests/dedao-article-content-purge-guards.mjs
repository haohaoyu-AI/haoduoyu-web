// Real SQLite and isolated workerd D1 migration/trigger checks, synthetic data
// only. These validate database guards, not external executor termination.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
const current=JSON.parse(fs.readFileSync('drizzle/meta/0048_snapshot.json','utf8'));
const previous=JSON.parse(fs.readFileSync('drizzle/meta/0047_snapshot.json','utf8'));
assert.equal(current.prevId,previous.id);assert.deepEqual(current.tables,previous.tables);
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8'));
assert.equal(journal.entries.at(-1).tag,'0048_dedao_article_content_purge');
journal.entries.forEach((e,i)=>assert.equal(e.idx,i));
const migration=fs.readFileSync('drizzle/0048_dedao_article_content_purge.sql','utf8');
assert.ok(migration.split('--> statement-breakpoint').every(v=>v.replace(/--[^\n]*(\n|$)/g,'').trim()));
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner='SYNTHETIC-DEDAO-OWNER',other='SYNTHETIC-DEDAO-OTHER';
const batch=id(1),otherBatch=id(2),sameOwnerBatch=id(3),prelaunchBatch=id(4),article=id(11),secondArticle=id(12),otherArticle=id(13),prelaunchArticle=id(14),op=id(21);
const stamp='2026-01-01T00:00:00.000Z',future='2999-01-01T00:00:00.000Z',past='2000-01-01T00:00:00.000Z';
const BODY='SYNTHETIC_DEDAO_BODY_ONLY',pair=(ordinal,article_id)=>({batch_id:batch,ordinal,article_id});
const graph=[];
for(const [ordinal,article_id] of [[1,article],[2,secondArticle]])for(const [table,values]of[
 ['dedao_items',[batch,ordinal]],['dedao_actions',[batch,ordinal,'download']],['dedao_chunks',[batch,ordinal,0]]])graph.push({table,values,article_id});
const snapshot=[{id:article,include_dedao_articles:true,dedao_pairs:[pair(1,article)],graph},
 {id:secondArticle,dedao_pairs:[pair(2,secondArticle)]},
 {id:prelaunchArticle,dedao_pairs:[{batch_id:prelaunchBatch,ordinal:1,article_id:prelaunchArticle}]}];
for(const [table,values]of[['dedao_items',[prelaunchBatch,1]],['dedao_actions',[prelaunchBatch,1,'download']],['dedao_chunks',[prelaunchBatch,1,0]]])graph.push({table,values,article_id:prelaunchArticle});
const checkNames=[];
async function suite(label,db){
 const run=(sql,...values)=>db.run(sql,values),get=(sql,...values)=>db.get(sql,values);
 const check=async(name,fn)=>{await fn();checkNames.push(`${label}: ${name}`);console.log(`PASS ${label}: ${name}`);};
 const reject=fn=>assert.rejects(fn,/ARTICLE_CONTENT_PERMANENTLY_DELETED|dedao_article_purge_|article_purge_confirmation_required|immutable/);
 for(const [b,o]of[[batch,owner],[otherBatch,other],[sameOwnerBatch,owner],[prelaunchBatch,owner]])await run("INSERT INTO dedao_batches(id,owner,request_key,total,state,created,updated) VALUES(?,?,?,4,'completed',?,?)",b,o,'req-'+b,stamp,stamp);
 await run("UPDATE dedao_batches SET state='running',executor_id='original-executor',execution_id='original-execution',claim_hash='original-claim',executor_ended=0,queue_revision='original-revision' WHERE id=?",batch);
 for(const [a,o]of[[article,owner],[secondArticle,owner],[otherArticle,other],[prelaunchArticle,owner]])await run("INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,'Synthetic','synthetic.txt',?,? ,?,'completed')",a,o,`articles/${a}/source`,JSON.stringify([BODY]),stamp);
 const itemInsert="INSERT INTO dedao_items(batch_id,owner,ordinal,id,article_id,title,download_json,created,updated) VALUES(?,?,?,?,?,'Synthetic',?,?,?)";
 for(const [b,o,n,i,a]of[[batch,owner,1,id(31),article],[batch,owner,2,id(32),secondArticle],[batch,owner,3,id(33),null],[otherBatch,other,1,id(34),otherArticle],[sameOwnerBatch,owner,1,id(35),null],[prelaunchBatch,owner,1,id(36),prelaunchArticle]]){
  await run(itemInsert,b,o,n,i,a,JSON.stringify({paragraphs:[BODY]}),stamp,stamp);
  await run("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,observation_json,created,updated) VALUES(?,?,'download',?,'confirmed',?,?,?)",b,n,'action-'+i,JSON.stringify({body:BODY}),stamp,stamp);
  await run('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,?,0,10,?,?)',b,n,'a'.repeat(64),`dedao/${b}/${n}/chunk0`);
 }
 await run("INSERT INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires) VALUES(?,?,'all_articles','SYNTHETIC-DEDAO-OP','previewed',?,?,?,?)",op,owner,JSON.stringify(snapshot),'b'.repeat(64),stamp,future);
 const insertFence=(key,a=article,kind='dedao_items.batch_ordinal')=>run("INSERT OR IGNORE INTO article_content_fences(owner,entity_kind,entity_key,article_id,operation_id,created) VALUES(?,?,?,?,?,?)",owner,kind,key,a,op,stamp);
 await check('unconfirmed preview cannot fence or delete download content',async()=>{
  await reject(()=>insertFence(JSON.stringify([batch,1])));
  for(const table of ['dedao_items','dedao_actions','dedao_chunks'])await reject(()=>run(`DELETE FROM ${table} WHERE batch_id=? AND ordinal=1`,batch));
  assert.equal((await get('SELECT count(*) n FROM dedao_items')).n,6);
 });
 await run("UPDATE article_list_deletions SET state='deleting',confirmed_at=?,lock_token='SYNTHETIC-LOCK',lock_expires=? WHERE id=?",stamp,future,op);
 for(const a of [article,secondArticle,prelaunchArticle]){
  await run("UPDATE articles SET state='deleting' WHERE owner=? AND id=?",owner,a);
  await run("INSERT INTO article_deletions(id,owner,state,started_at,operation_id,lock_token,lock_expires) VALUES(?,?,'deleting',?,?,'SYNTHETIC-LOCK',?)",a,owner,stamp,op,future);
 }
 await check('pair identity requires canonical integer key, owned batch, exact frozen pair and actual article mapping',async()=>{
  for(const key of [JSON.stringify([batch,3]),JSON.stringify([otherBatch,1]),JSON.stringify([batch,'1']),JSON.stringify([batch,1,99])])await reject(()=>insertFence(key));
  await reject(()=>insertFence(JSON.stringify([batch,2]),article));
  await insertFence(JSON.stringify([batch,1]));await insertFence(JSON.stringify([batch,2]),secondArticle);
  await insertFence(id(31),article,'dedao_items');await insertFence(id(32),secondArticle,'dedao_items');
  await insertFence(JSON.stringify([batch,1])); // exact same-key append is idempotent
  assert.equal((await get('SELECT count(*) n FROM article_content_fences')).n,4);
  await reject(()=>run("UPDATE article_content_fences SET entity_key='changed' WHERE owner=?",owner));
  await reject(()=>run('DELETE FROM article_content_fences WHERE owner=?',owner));
 });
 await check('fenced running current pair rejects regrant while original holder heartbeat and lease observations remain writable',async()=>{
  for(const [field,value]of[['claim_hash','new-claim'],['execution_id','new-execution'],['executor_id','new-executor'],['queue_revision','new-revision'],['state','launching'],['state','queued'],['current_ordinal',2]])await reject(()=>run(`UPDATE dedao_batches SET ${field}=? WHERE id=?`,value,batch));
  await run('UPDATE dedao_batches SET heartbeat=?,lease_until=?,updated=? WHERE id=?',stamp,future,stamp,batch);
  const b=await get('SELECT * FROM dedao_batches WHERE id=?',batch);
  assert.equal(b.state,'running');assert.equal(b.claim_hash,'original-claim');assert.equal(b.execution_id,'original-execution');assert.equal(b.executor_id,'original-executor');assert.equal(b.executor_ended,0);assert.equal(b.current_ordinal,1);
 });
 await check('fenced paused or completed current pair cannot resume but original pause/end bookkeeping can settle without a new grant',async()=>{
  await run("UPDATE dedao_batches SET state='paused',failure='SYNTHETIC PAUSE',updated=? WHERE id=?",stamp,batch);
  assert.equal((await get('SELECT executor_ended FROM dedao_batches WHERE id=?',batch)).executor_ended,0);
  await reject(()=>run("UPDATE dedao_batches SET state='queued',claim_hash=NULL,execution_id=NULL,executor_id=NULL,queue_revision='resumed-revision' WHERE id=?",batch));
  await reject(()=>run("UPDATE dedao_batches SET claim_hash='new-paused-claim' WHERE id=?",batch));
  await run('UPDATE dedao_batches SET executor_ended=1,updated=? WHERE id=? AND execution_id=? AND executor_id=?',stamp,batch,'original-execution','original-executor');
  await run('UPDATE dedao_batches SET claim_hash=NULL,lease_until=NULL,heartbeat=NULL WHERE id=?',batch);
  await reject(()=>run('UPDATE dedao_batches SET executor_ended=0 WHERE id=?',batch));
  await reject(()=>run("UPDATE dedao_batches SET state='running',claim_hash='new-claim' WHERE id=?",batch));
  await run("UPDATE dedao_batches SET state='completed' WHERE id=?",batch);
  await reject(()=>run("UPDATE dedao_batches SET state='queued' WHERE id=?",batch));
  assert.equal((await get('SELECT executor_ended FROM dedao_batches WHERE id=?',batch)).executor_ended,1);
 });
 await check('fenced queued prelaunch cannot reserve or claim but original process-end receipt can record its launch identity',async()=>{
  await run("UPDATE dedao_batches SET state='queued',queue_revision='prelaunch-revision' WHERE id=?",prelaunchBatch);
  await insertFence(JSON.stringify([prelaunchBatch,1]),prelaunchArticle);
  await reject(()=>run("UPDATE dedao_batches SET state='launching',executor_id='new-executor',execution_id='new-launch',claim_hash='new-claim',executor_ended=0 WHERE id=?",prelaunchBatch));
  await reject(()=>run("UPDATE dedao_batches SET state='running',executor_id='new-executor',execution_id='new-execution',claim_hash='new-claim',executor_ended=0 WHERE id=?",prelaunchBatch));
  await run("UPDATE dedao_batches SET state='paused',executor_id='original-prelaunch-executor',execution_id='original-prelaunch-id',executor_ended=1,failure='SYNTHETIC PROCESS EXIT',updated=? WHERE id=? AND state='queued' AND claim_hash IS NULL AND queue_revision='prelaunch-revision'",stamp,prelaunchBatch);
  const b=await get('SELECT * FROM dedao_batches WHERE id=?',prelaunchBatch);
  assert.equal(b.state,'paused');assert.equal(b.executor_ended,1);assert.equal(b.claim_hash,null);assert.equal(b.execution_id,'original-prelaunch-id');
  await reject(()=>run("UPDATE dedao_batches SET state='queued',queue_revision='new-prelaunch-revision' WHERE id=?",prelaunchBatch));
  await run("UPDATE dedao_batches SET state='completed' WHERE id=?",prelaunchBatch);
 });
 await check('preserved batch owner identity cannot be removed or changed to bypass ownerless child fences',async()=>{
  await reject(()=>run('DELETE FROM dedao_batches WHERE owner=? AND id=?',owner,batch));
  await reject(()=>run('UPDATE dedao_batches SET owner=? WHERE owner=? AND id=?',other,owner,batch));
  await reject(()=>run('UPDATE dedao_batches SET id=? WHERE owner=? AND id=?',id(101),owner,batch));
  await run('UPDATE dedao_batches SET heartbeat=?,updated=? WHERE owner=? AND id=?',stamp,stamp,owner,batch);
  assert.equal((await get('SELECT owner FROM dedao_batches WHERE id=?',batch)).owner,owner);
 });
 await check('frozen pair blocks item identity/owner/article changes and late body writes in all three tables',async()=>{
  await reject(()=>run('UPDATE dedao_items SET article_id=?,title=? WHERE batch_id=? AND ordinal=1',id(99),BODY,batch));
  await reject(()=>run('UPDATE dedao_items SET owner=?,batch_id=? WHERE batch_id=? AND ordinal=1',other,otherBatch,batch));
  await reject(()=>run('UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND ordinal=1',JSON.stringify({body:BODY+' late'}),batch));
  await reject(()=>run('UPDATE dedao_chunks SET object_key=? WHERE batch_id=? AND ordinal=1','late-body-key',batch));
  await reject(()=>run(itemInsert,batch,owner,1,id(39),id(98),'{}',stamp,stamp));
  await reject(()=>run(itemInsert,batch,other,4,id(40),null,'{}',stamp,stamp));
  await reject(()=>run("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,created,updated) VALUES(?,1,'late','late-action','reserved',?,?)",batch,stamp,stamp));
  await reject(()=>run('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,1,10,10,?,?)',batch,'c'.repeat(64),'late-key'));
 });
 await check('scope, preview inclusion, shared lock, expiry, pair and exact graph identity cannot be widened',async()=>{
  for(const [field,value]of[['scope','publish'],['lock_token','OTHER-LOCK'],['lock_expires',past]]){
   await run(`UPDATE article_list_deletions SET ${field}=? WHERE id=?`,value,op);
   await reject(()=>run('DELETE FROM dedao_actions WHERE batch_id=? AND ordinal=1',batch));
   await run(`UPDATE article_list_deletions SET ${field}=? WHERE id=?`,field==='scope'?'all_articles':field==='lock_token'?'SYNTHETIC-LOCK':future,op);
  }
  for(const altered of [snapshot.map((t,i)=>i? t:{...t,include_dedao_articles:false}),snapshot.map((t,i)=>i? t:{...t,dedao_pairs:[]}),snapshot.map((t,i)=>i? t:{...t,graph:graph.filter(r=>r.table!=='dedao_actions')})]){
   await run('UPDATE article_list_deletions SET snapshot_json=? WHERE id=?',JSON.stringify(altered),op);
   await reject(()=>run('DELETE FROM dedao_actions WHERE batch_id=? AND ordinal=1',batch));
  }
  await run('UPDATE article_list_deletions SET snapshot_json=? WHERE id=?',JSON.stringify(snapshot),op);
  await run('UPDATE article_deletions SET lock_expires=? WHERE owner=? AND id=?',past,owner,article);
  await reject(()=>run('DELETE FROM dedao_chunks WHERE batch_id=? AND ordinal=1',batch));
  await run('UPDATE article_deletions SET lock_expires=? WHERE owner=? AND id=?',future,owner,article);
  await reject(()=>run('DELETE FROM dedao_items WHERE batch_id=? AND ordinal=3',batch));
  await reject(()=>run('DELETE FROM dedao_actions WHERE batch_id=? AND ordinal=1',otherBatch));
 });
 await check('confirmed exact owner pair can delete its item before ownerless actions/chunks and cannot revive after item removal',async()=>{
  await run('DELETE FROM dedao_items WHERE batch_id=? AND ordinal=1',batch);
  assert.equal((await get('SELECT count(*) n FROM dedao_actions WHERE batch_id=? AND ordinal=1',batch)).n,1);
  await run('DELETE FROM dedao_actions WHERE batch_id=? AND ordinal=1',batch);
  await run('DELETE FROM dedao_chunks WHERE batch_id=? AND ordinal=1',batch);
  await reject(()=>run(itemInsert,batch,owner,1,id(41),id(97),'{}',stamp,stamp));
  await reject(()=>run(itemInsert,batch,owner,4,id(31),null,'{}',stamp,stamp));
  await reject(()=>run("INSERT INTO dedao_actions(batch_id,ordinal,action,action_id,state,created,updated) VALUES(?,1,'late-after-item','late-after-item','reserved',?,?)",batch,stamp,stamp));
  await reject(()=>run('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,1,10,10,?,?)',batch,'d'.repeat(64),'late-key-after-item'));
 });
 await check('new explicitly frozen operation can reconcile an old immutable pair without changing its fence operation',async()=>{
  const nextOp=id(22),nextSnapshot=[{id:secondArticle,include_dedao_articles:true,dedao_pairs:[pair(2,secondArticle)],graph:graph.filter(r=>r.article_id===secondArticle)}];
  await run("INSERT INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires,confirmed_at,lock_token,lock_expires) VALUES(?,?,'all_articles','SYNTHETIC-NEXT-OP','deleting',?,?,?, ?,?,'SYNTHETIC-NEXT-LOCK',?)",nextOp,owner,JSON.stringify(nextSnapshot),'e'.repeat(64),stamp,future,stamp,future);
  await run("UPDATE article_deletions SET operation_id=?,lock_token='SYNTHETIC-NEXT-LOCK' WHERE owner=? AND id=?",nextOp,owner,secondArticle);
  for(const table of ['dedao_actions','dedao_chunks','dedao_items'])await run(`DELETE FROM ${table} WHERE batch_id=? AND ordinal=2`,batch);
  const fence=await get("SELECT * FROM article_content_fences WHERE owner=? AND entity_kind='dedao_items.batch_ordinal' AND entity_key=?",owner,JSON.stringify([batch,2]));
  assert.equal(fence.operation_id,op);
 });
 await check('unbound same-batch ordinal, other owner and other batch remain writable with original body data and batch/executor state',async()=>{
  for(const [b,o,n]of[[batch,owner,3],[otherBatch,other,1],[sameOwnerBatch,owner,1]]){
   await run('UPDATE dedao_items SET title=? WHERE batch_id=? AND owner=? AND ordinal=?','Synthetic preserved',b,o,n);
   await run('UPDATE dedao_actions SET observation_json=? WHERE batch_id=? AND ordinal=?',JSON.stringify({body:BODY+' preserved'}),b,n);
   await run('INSERT INTO dedao_chunks(batch_id,ordinal,offset,size,sha256,object_key) VALUES(?,?,10,10,?,?)',b,n,'f'.repeat(64),`dedao/${b}/${n}/chunk10`);
  }
  for(const b of [otherBatch,sameOwnerBatch])await run("UPDATE dedao_batches SET state='running',queue_revision='unfenced-revision',executor_id='unfenced-executor',execution_id='unfenced-execution',claim_hash='unfenced-claim',executor_ended=0 WHERE id=?",b);
  assert.equal((await get("SELECT count(*) n FROM dedao_batches WHERE state='running' AND claim_hash='unfenced-claim'")).n,2);
  await run("UPDATE dedao_batches SET state='completed',executor_ended=1 WHERE id=?",sameOwnerBatch);
  await run('UPDATE dedao_batches SET current_ordinal=3 WHERE id=?',batch);
  await run("UPDATE dedao_batches SET state='running',queue_revision='unbound-current-revision',executor_id='unbound-current-executor',execution_id='unbound-current-execution',claim_hash='unbound-current-claim',executor_ended=0 WHERE id=?",batch);
  assert.equal((await get('SELECT claim_hash FROM dedao_batches WHERE id=?',batch)).claim_hash,'unbound-current-claim');
  assert.equal((await get('SELECT count(*) n FROM dedao_items')).n,4);
  assert.equal((await get('SELECT count(*) n FROM dedao_batches')).n,4);
  assert.equal((await get('SELECT count(*) n FROM dedao_batches WHERE executor_ended=1')).n,2);
  assert.ok((await get('SELECT download_json FROM dedao_items WHERE batch_id=? AND ordinal=3',batch)).download_json.includes(BODY));
 });
}
const sqlite=new DatabaseSync(':memory:');
try{
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 await suite('SQLite',{run:async(sql,v)=>sqlite.prepare(sql).run(...v),get:async(sql,v)=>sqlite.prepare(sql).get(...v)});
}finally{sqlite.close();}
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("SYNTHETIC DEDAO GUARDS ONLY")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'dedao-purge-guards-isolated'}});
try{
 const d1=await mf.getD1Database('DB');await migrate(drizzle(d1),{migrationsFolder:'drizzle'});await migrate(drizzle(d1),{migrationsFolder:'drizzle'});
 await suite('actual workerd D1',{run:(sql,v)=>d1.prepare(sql).bind(...v).run(),get:(sql,v)=>d1.prepare(sql).bind(...v).first()});
}finally{await mf.dispose();}
console.log(JSON.stringify({result:'PASS',checks:checkNames.length,migrations:'0000–0048',remote_calls:0,source_data:'synthetic only',external_processes_observed:false,schema_changes:false},null,2));
