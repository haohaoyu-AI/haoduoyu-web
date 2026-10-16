import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {DatabaseSync} from 'node:sqlite';import {zipSync,strToU8} from 'fflate';import {createHash} from 'node:crypto';const nativeRequire=createRequire(import.meta.url);
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={prepare:s=>({bind:(...v)=>({first:async()=>sql.prepare(s).get(...v)||null,all:async()=>({results:sql.prepare(s).all(...v)}),run:async()=>({meta:{changes:Number(sql.prepare(s).run(...v).changes)}})})})};
const objects=new Map();const bucket={async list({prefix}){return {truncated:false,objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key,size:objects.get(key).length}))};},async put(k,b){objects.set(k,new Uint8Array(b));},async delete(k){objects.delete(k)},async head(k){return objects.has(k)?{size:objects.get(k).length}:null},async get(k,opts){if(!objects.has(k))return null;const b=objects.get(k);const cut=opts?.range?b.slice(opts.range.offset,opts.range.offset+opts.range.length):b;return {arrayBuffer:async()=>cut.buffer.slice(cut.byteOffset,cut.byteOffset+cut.byteLength),body:new ReadableStream({start(c){c.enqueue(cut);c.close()}})};}};
const modules={};function load(name){if(modules[name])return modules[name];const ex={};modules[name]=ex;const src=fs.readFileSync('lib/'+name+'.ts','utf8');const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports:ex,require:n=>n==='cloudflare:workers'?{env:{DB:db,BUCKET:bucket}}:n.startsWith('./')?load(n.slice(2)):nativeRequire(n),crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Error,URL,btoa,atob,Date,File,ReadableStream});return ex;}
const a=load('articles'),t=load('article-tools');
const created=await a.createArticle('owner-a',new File(['标题\n\n001\n中文正文'],'sample.txt'));assert.equal(created.paragraph_count,4);await assert.rejects(t.articleCall('owner-b','read_article',{article_id:created.id}));assert.equal((await t.articleCall('owner-a','read_article',{article_id:created.id})).paragraphs[2],'001');
sql.prepare('UPDATE articles SET state=? WHERE id=?').run('queued',created.id);const c=await t.articleCall('owner-a','claim_article',{article_id:created.id});assert.equal(c.claimed,true);assert.equal((await t.articleCall('owner-a','claim_article',{article_id:created.id})).claimed,false);
const out=zipSync({'[Content_Types].xml':strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'_rels/.rels':strToU8('<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>标题</w:t></w:r></w:p><w:p><w:r><w:t>001</w:t></w:r></w:p><w:p><w:r><w:t>中文正文</w:t></w:r></w:p></w:body></w:document>')});const sha=createHash('sha256').update(out).digest('hex');const base={article_id:created.id,claim_token:c.claim_token};
const m=await t.articleCall('owner-a','begin_article_output',{...base,size:out.length,sha256:sha,chunks:1});await assert.rejects(t.articleCall('owner-a','finalize_article_output',{...base,output_id:m.output_id}));
await assert.rejects(t.articleCall('owner-a','put_article_output_chunk',{...base,output_id:m.output_id,index:1,data_base64:Buffer.from(out).toString('base64')}));
const p={...base,output_id:m.output_id,index:0,data_base64:Buffer.from(out).toString('base64')};await t.articleCall('owner-a','put_article_output_chunk',p);assert.equal((await t.articleCall('owner-a','put_article_output_chunk',p)).duplicate,true);await assert.rejects(t.articleCall('owner-a','put_article_output_chunk',{...p,data_base64:btoa('different')}));
const done=await t.articleCall('owner-a','finalize_article_output',{...base,output_id:m.output_id});assert.equal(done.ready,true);assert.equal((await a.article('owner-a',created.id)).state,'word_ready');assert.equal(objects.size,3);await assert.rejects(t.articleCall('owner-a','record_article_status',{...base,state:'completed'}));await assert.rejects(t.articleCall('owner-b','finalize_article_output',{...base,output_id:m.output_id}));console.log('Real SQLite, in-memory R2: owner isolation, immutable text, claim dedup, chunk order/conflict, incomplete output, SHA finalize and draft completion guard passed');
// Legacy status calls cannot authorize browser upload or manufacture a saved result.
await assert.rejects(t.articleCall('owner-a','record_article_status',{...base,state:'toutiao_saving'}),/gate/);
await assert.rejects(t.articleCall('owner-a','record_article_status',{...base,state:'completed',draft_url:'https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123'}),/readback/);
const stamp=()=>new Date().toISOString();
const destination={article_id:created.id,platform:'toutiao'};
const account='61556093362';
const prep={...destination,execution_claim:c.claim_token,mode:'new_import',target_account:account,word_sha256:sha,word_size:out.length,preflight:{file:{absolute_path:'/mock/checked.docx',browser_session:'offline-browser',filename:'checked.docx',visible_in_browser:true,sha256:sha,size:out.length,checked_at:stamp()},existing_drafts:{current_editor_url:'https://mp.toutiao.com/profile_v4/graphic/publish',prior_submission:'never_attempted',account,editor_checked:true,draft_list_checked:true,matching_editor_urls:[],checked_at:stamp()}}};
const reservation=await t.articleCall('owner-a','reserve_article_upload',prep);assert.equal(reservation.reserved,true);
const upload={...destination,attempt_id:reservation.attempt.attempt_id};
assert.equal((await t.articleCall('owner-a','consume_article_upload',{...upload,execution_claim:c.claim_token,target_account:account,file_confirmation:prep.preflight.file})).execute_import,true);
await t.articleCall('owner-a','record_article_status',{...base,state:'toutiao_saving'});
sql.prepare('UPDATE articles SET claim_expires=? WHERE id=?').run('2000-01-01T00:00:00.000Z',created.id);
const recover=await t.articleCall('owner-a','claim_article',{article_id:created.id});assert.equal(recover.state,'needs_verification');
assert.equal((await t.articleCall('owner-a','consume_article_upload',{...upload,execution_claim:c.claim_token,target_account:account,file_confirmation:prep.preflight.file})).execute_import,false);
const recovered={article_id:created.id,claim_token:recover.claim_token};
const draft='https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=123';
const receipt={verification_method:'agent_readback',word_sha256:sha,target_account:account,draft_url:draft,independently_reopened:true,saved_indicator_observed:true,images_loaded:true,title:'标题',paragraphs:['001','中文正文'],images:[],saved_at:stamp(),reopened_at:stamp(),read_at:stamp()};
await t.articleCall('owner-a','record_article_upload',{...upload,execution_claim:recover.claim_token,state:'verified',editor_url:draft,readback:receipt});
await t.articleCall('owner-a','record_article_status',{...recovered,state:'completed',draft_url:draft});
assert.equal((await t.articleCall('owner-a','claim_article',{article_id:created.id})).claimed,false);
await assert.rejects(t.articleCall('owner-a','record_article_status',{...recovered,state:'failed'}));
const fresh=await a.createArticle('owner-a',new File(['incomplete'], 'fresh.txt'));
await assert.rejects(t.articleCall('owner-a','cleanup_article_workfiles',{article_id:created.id,expected_word_sha256:sha,confirm_permanent:false}));
await assert.rejects(t.articleCall('owner-b','preview_article_cleanup',{article_id:created.id}));
await assert.rejects(t.articleCall('owner-a','preview_article_cleanup',{article_id:fresh.id}));
await assert.rejects(t.articleCall('owner-a','cleanup_article_workfiles',{article_id:created.id,expected_word_sha256:'a'.repeat(64),confirm_permanent:true}));
const preview=await t.articleCall('owner-a','preview_article_cleanup',{article_id:created.id});assert.equal(preview.article_id,created.id);
const before=objects.size;const cleaned=await t.articleCall('owner-a','cleanup_article_workfiles',{article_id:created.id,expected_word_sha256:sha,confirm_permanent:true});assert.equal(cleaned.cleaned,true);assert.equal(objects.size,before-2);
const result=await a.article('owner-a',created.id);assert.deepEqual(JSON.parse(result.paragraphs),[]);assert.equal(result.state,'completed');assert.equal(objects.get(result.result_key).length,out.length);
assert.equal((await t.articleCall('owner-a','cleanup_article_workfiles',{article_id:created.id,expected_word_sha256:sha,confirm_permanent:true})).already_cleaned,true);
const historical=await a.createArticle('owner-a',new File(['Historical'], 'old.txt'));
sql.prepare('UPDATE articles SET state=?,result_key=?,draft_url=? WHERE id=?').run('completed','old-word',draft,historical.id);
const historicBefore=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(historical.id));
assert.equal((await t.articleCall('owner-a','read_article',{article_id:historical.id})).state,'completed');
assert.equal((await t.articleCall('owner-a','read_article_upload',{article_id:historical.id,platform:'toutiao'})).attempt,null);
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(historical.id)),historicBefore);
console.log('Guarded completion, stale lease recovery without reimport, historical read-only and confirmed cleanup checks passed');

const {assertOriginalText}=load('article-format');
assertOriginalText(['标题','','一 段','二段'],['标题','一段','','二段']);
for(const changed of [['标题','一段'],['新标题','一段','二段'],['标题','二段','一段'],['标题','一段','二段','新增']])assert.throws(()=>assertOriginalText(['标题','一段','二段'],changed));
console.log('Final text guard rejects omissions, additions, title changes and reordered paragraphs');

// Automatic text articles cannot enter image, Word or destination processing,
// even if a stale/legacy row still says uploaded or processing.
for(const state of ['text_saved','uploaded','processing']){
 const generated=await a.createArticle('automatic-owner',new File(['合成标题\n合成正文'],'automatic.txt'));
 sql.prepare('UPDATE articles SET state=?,artifact_manifest=? WHERE id=?').run(state,JSON.stringify({contract_version:1,output_mode:'text_only'}),generated.id);
 const before=JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(generated.id)),objectsBefore=objects.size;
 for(const name of ['claim_article','record_article_images','begin_article_output','claim_article_delivery','reserve_article_upload'])await assert.rejects(t.articleCall('automatic-owner',name,{article_id:generated.id}),/仅保存网站文字稿/);
 const read=await t.articleCall('automatic-owner','read_article',{article_id:generated.id});assert.equal(read.output_mode,'text_only');assert.equal((await t.articleCall('automatic-owner','read_article_manifest',{article_id:generated.id})).word.state,'not_required');
 assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles WHERE id=?').get(generated.id)),before);assert.equal(objects.size,objectsBefore);
}
