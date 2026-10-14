// Offline regression: production AST, synthetic rows and local workerd/D1 only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {Miniflare} from 'miniflare';

const source=fs.readFileSync('lib/article-upload-attempts.ts','utf8');
const ast=ts.createSourceFile('upload.ts',source,ts.ScriptTarget.Latest,true);
const helpers=new Set(['balancedAnd','manualSourceFence','legacyReimportConsumeFence','reimportConsumeFence','continuationConsumeFence','consumeAttemptWhere']);
const snippets=ast.statements.filter(s=>
 ts.isFunctionDeclaration(s)&&helpers.has(s.name?.text)||
 ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(ast)==='attemptColumns')
).map(s=>s.getText(ast));
let casTemplate,probeTemplate;
function visit(node){
 if(ts.isTemplateExpression(node)){
  if(node.head.text.startsWith("UPDATE article_upload_attempts SET state='outcome_unknown'"))casTemplate=node.getText(ast);
  if(node.head.text.startsWith('SELECT 1 AS compile_ok FROM article_upload_attempts WHERE '))probeTemplate=node.getText(ast);
 }
 ts.forEachChild(node,visit);
}
visit(ast);assert.ok(casTemplate);assert.ok(probeTemplate);
function compile(linear=false){
 let code=snippets.join('\n');
 if(linear)code=code.replace(/function balancedAnd\([\s\S]*?\n\}/,"function balancedAnd(parts:readonly string[]):string{return parts.join(' AND ');}");
 const exports={};
 vm.runInNewContext(ts.transpileModule(code+`\nexport const cas=${casTemplate};export const probe=${probeTemplate};export const where=consumeAttemptWhere();export const columns=attemptColumns;`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Error});
 return exports;
}
const current=compile(),linear=compile(true);
assert.equal(current.cas.replace(/[()]/g,''),linear.cas.replace(/[()]/g,''),'Only grouping changes; all SQL predicates and their order remain identical');
assert.equal((current.cas.match(/\?/g)||[]).length,15);
assert.equal((current.probe.match(/\?/g)||[]).length,13);
assert.equal(current.probe,`SELECT 1 AS compile_ok FROM article_upload_attempts WHERE ${current.where} LIMIT 0`);

const migrated=new DatabaseSync(':memory:');
for(const name of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())migrated.exec(fs.readFileSync('drizzle/'+name,'utf8'));
const schema=migrated.prepare("SELECT type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
// This shadow database has the exact table/index schema. It intentionally has no
// triggers so a single frozen JSON field can be corrupted for predicate tests.
const shadow=new DatabaseSync(':memory:');
for(const r of schema.filter(r=>r.type==='table'))shadow.exec(r.sql);
for(const r of schema.filter(r=>r.type==='index'))shadow.exec(r.sql);
const fixtures=[];const when='2026-10-10T12:00:00.000Z',expires='2099-01-01T00:00:00.000Z';
function insert(db,table,row){const keys=Object.keys(row);db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
for(const platform of ['toutiao','zhihu'])for(const guard of [0,1]){
 const key=platform+'-'+guard,id='synthetic-article-'+key,owner='synthetic-owner-'+key,claim='synthetic-claim-'+key,account='synthetic-account-'+platform;
 const article={id,owner,title:'Synthetic title',filename:'synthetic.docx',source_key:'articles/'+id+'/source',paragraphs:'["Synthetic title","Synthetic body"]',created:when,state:'needs_verification',claim_token:claim,claim_expires:expires,result_key:'articles/'+id+'/result.docx',result_meta:'{"synthetic":true}',draft_url:null,artifact_manifest:null,draft_readback:null,upload_guard_version:guard};
 insert(shadow,'articles',article);
 if(platform==='zhihu')insert(shadow,'article_deliveries',{id:'synthetic-delivery-'+key,owner,article_id:id,platform,state:'needs_verification',claim_token:claim,claim_expires:expires,draft_url:null,readback:null,updated:when});
 const parent=Object.fromEntries(current.columns.map(k=>[k,null]));
 Object.assign(parent,{id:'synthetic-parent-'+key,revision:0,owner,article_id:id,platform,target_account:account,word_sha256:'1'.repeat(64),word_size:2,authorization_kind:guard?'new_word':'owner_confirmed_never_submitted',claim_hash:'2'.repeat(64),preflight:'{"synthetic":true}',baseline:'{"synthetic":true}',state:'reserved',editor_urls:'[]',created:when,updated:when,attempt_version:1});
 insert(shadow,'article_upload_attempts',parent);
 const auth={source_key:article.source_key,reserved_upload_guard_version:guard,artifacts:{paragraphs:article.paragraphs,artifact_manifest:article.artifact_manifest},parent_snapshot:parent,retained_destination_url:null,retained_destination_readback:null,request:{confirm_unconsumed_recovery:true,prior_executor_stopped:true,preserve_existing_draft:true,confirm_new_draft:true,previous_attempt_id:parent.id,expected_attempt_revision:0,confirmation_message_id:'synthetic-confirmation',prior_executor_end_reference:'synthetic-executor-ended'}};
 const child={...parent,id:'synthetic-child-'+key,attempt_version:2,previous_attempt_id:parent.id,authorization_kind:'unconsumed_continuation',claim_hash:'3'.repeat(64),authorization_key:'synthetic-authorization-'+key,consume_token_sha256:createHash('sha256').update('synthetic-token-'+key).digest('hex'),reimport_authorization:JSON.stringify(auth)};
 insert(shadow,'article_upload_attempts',child);
 const args=[when,when,child.id,owner,id,platform,account,child.preflight,owner,article.result_key,article.result_meta,claim,when,claim,when];
 fixtures.push({article,parent,child,args});
}
const select=where=>'SELECT 1 AS eligible FROM article_upload_attempts WHERE '+where;
for(const f of fixtures){
 const eligible=module=>shadow.prepare(select(module.where)).all(...f.args.slice(2)).length;
 assert.equal(eligible(current),1);assert.equal(eligible(linear),1);
 for(const column of current.columns){
  const auth=JSON.parse(f.child.reimport_authorization),value=auth.parent_snapshot[column];
  auth.parent_snapshot[column]=typeof value==='number'?value+1:value===null?'synthetic-changed':value+'-changed';
  shadow.prepare('UPDATE article_upload_attempts SET reimport_authorization=? WHERE id=?').run(JSON.stringify(auth),f.child.id);
  assert.equal(eligible(current),0,'Changed parent snapshot '+column+' remains blocked');
  assert.equal(eligible(linear),0,'Linear and balanced predicates agree for '+column);
 }
 shadow.prepare('UPDATE article_upload_attempts SET reimport_authorization=? WHERE id=?').run(f.child.reimport_authorization,f.child.id);
 for(const [column,value] of [['source_key','synthetic-changed'],['upload_guard_version',1-f.article.upload_guard_version],['paragraphs','["changed"]'],['artifact_manifest','{}'],...(f.child.platform==='toutiao'?[['draft_url','https://example.com/synthetic-draft'],['draft_readback','{}']]:[]),['state','deleting']]){
  shadow.prepare('UPDATE articles SET '+column+'=? WHERE id=?').run(value,f.article.id);
  assert.equal(eligible(current),0,'Changed article '+column+' remains blocked');assert.equal(eligible(linear),0);
  shadow.prepare('UPDATE articles SET '+column+'=? WHERE id=?').run(f.article[column],f.article.id);
 }
 if(f.child.platform==='zhihu')for(const [column,value] of [['draft_url','https://example.com/synthetic-draft'],['readback','{}']]){
  shadow.prepare('UPDATE article_deliveries SET '+column+'=? WHERE article_id=?').run(value,f.article.id);
  assert.equal(eligible(current),0,'Changed delivery '+column+' remains blocked');assert.equal(eligible(linear),0);
  shadow.prepare('UPDATE article_deliveries SET '+column+'=NULL WHERE article_id=?').run(f.article.id);
 }
}
console.log('PASS exact predicate order/bind count; 24 frozen parent fields and seven artifact/destination fields remain closed on both platforms/guards');

process.env.CLOUDFLARE_CF_FETCH_ENABLED='false';let network=0;
const mf=new Miniflare({cf:false,modules:true,script:'export default {fetch(){return new Response("local only")}}',compatibilityDate:'2026-05-22',d1Databases:{DB:'consume-query-regression'},outboundService:()=>{network++;return new Response('external disabled',{status:403});}});
try{
 const d1=await mf.getD1Database('DB');
 for(const r of schema.filter(r=>r.type==='table'))await d1.prepare(r.sql).run();
 for(const r of schema.filter(r=>r.type==='index'))await d1.prepare(r.sql).run();
 for(const table of ['articles','article_deliveries','article_upload_attempts'])for(const row of shadow.prepare('SELECT * FROM '+table).all()){
  const keys=Object.keys(row);await d1.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 }
 for(const r of schema.filter(r=>r.type==='trigger'))await d1.prepare(r.sql).run();
 const f=fixtures[0];
 await assert.rejects(d1.prepare('EXPLAIN '+linear.cas).bind(...f.args).all(),/Expression tree is too large \(maximum depth 100\)/);
 await d1.prepare('EXPLAIN '+current.cas).bind(...f.args).all();
 console.log('PASS original linear CAS exceeds actual D1 depth100; balanced production CAS compiles with all '+schema.filter(r=>r.type==='trigger').length+' migrated triggers');
 for(const f of fixtures){
  const before=JSON.stringify(await d1.prepare('SELECT * FROM article_upload_attempts WHERE id=?').bind(f.child.id).first());
  assert.equal(await d1.prepare(current.probe).bind(...f.args.slice(2)).first(),null);
  assert.equal(JSON.stringify(await d1.prepare('SELECT * FROM article_upload_attempts WHERE id=?').bind(f.child.id).first()),before,'Compilation probe writes nothing');
  const parentBefore=JSON.stringify(await d1.prepare('SELECT * FROM article_upload_attempts WHERE id=?').bind(f.parent.id).first());
  assert.equal((await d1.prepare(current.cas).bind(...f.args).run()).meta.changes,1);
  assert.equal((await d1.prepare(current.cas).bind(...f.args).run()).meta.changes,0,'Grant has one consume winner');
  const observed=await d1.prepare('SELECT state,consumed_at,revision FROM article_upload_attempts WHERE id=?').bind(f.child.id).first();
  assert.equal(observed.state,'outcome_unknown');assert.equal(observed.consumed_at,when);assert.equal(observed.revision,1);
  assert.equal(JSON.stringify(await d1.prepare('SELECT * FROM article_upload_attempts WHERE id=?').bind(f.parent.id).first()),parentBefore,'Parent history stays byte identical');
 }
 assert.equal(network,0);
 console.log('PASS production LIMIT0 probe is read-only; real D1 CAS consumes once for both platforms/guards, parent history preserved, external requests0');
}finally{await mf.dispose();shadow.close();migrated.close();}
