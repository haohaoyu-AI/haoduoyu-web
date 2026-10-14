import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const temporary=new URL(`./.article-file-handoff-${process.pid}.mjs`,import.meta.url);
const harness=fs.readFileSync(new URL('./upload-attempt-guards.mjs',import.meta.url),'utf8').split('let cases = 0, failures = 0;')[0];
const checks=String.raw`
const item=await fixture('handoff');
const before=JSON.stringify(sql.prepare('SELECT * FROM articles').all());
const handoff=await call(item,'read_article_handoff');
assert.equal(handoff.execute_import,false);assert.equal(handoff.word.browser_visibility_proven,false);
assert.equal(handoff.word.authentication_required,true);assert.equal(handoff.word.sha256,item.hash);assert.equal(handoff.word.size,item.bytes.length);
assert.ok(handoff.word.safe_filename.endsWith('.docx'));assert.equal(handoff.frozen_text.length,item.paragraphs.length+1);
assert.equal(handoff.target_accounts.toutiao,item.account);assert.equal(handoff.upload_progress.length,2);
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles').all()),before);
assert.equal(JSON.stringify(handoff).includes(item.claim),false);assert.equal(JSON.stringify(handoff).includes('articles/'+item.id+'/output'),false);
await assert.rejects(tools.articleCall('different-owner','read_article_handoff',{article_id:item.id}));
const fileHelper=load('article-file-handoff');
for(const title of ['中文标题','../../CON:坏文件\r\n名?*','你好'.repeat(150)]){
 const name=fileHelper.articleWordFilename(title,item.id);assert.ok(name.endsWith('.docx'));assert.ok(new TextEncoder().encode(name).length<200);assert.equal(/[<>:"/\\|?*\x00-\x1f]/.test(name),false);
}
// Load the actual route with only its owner adapter replaced by a synthetic header.
const route={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/articles/[id]/download/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:route,require:n=>n.endsWith('/test-store')?{owner:r=>r.headers.get('x-test-owner')}:n.endsWith('/articles')?articles:fileHelper,Response,Request,TextEncoder,URL,encodeURIComponent});
assert.equal((await route.GET(new Request('https://site.test/'),{params:Promise.resolve({id:item.id})})).status,401);
const response=await route.GET(new Request('https://site.test/',{headers:{'x-test-owner':item.owner}}),{params:Promise.resolve({id:item.id})});
assert.equal(response.status,200);assert.equal(decodeURIComponent(response.headers.get('content-disposition').split("filename*=UTF-8''")[1]),handoff.word.safe_filename);
assert.equal(response.headers.get('content-length'),String(item.bytes.length));assert.equal(response.headers.get('x-word-sha256'),item.hash);assert.equal(digest(new Uint8Array(await response.arrayBuffer())),item.hash);
assert.equal((await route.GET(new Request('https://site.test/',{headers:{'x-test-owner':'other-owner'}}),{params:Promise.resolve({id:item.id})})).status,404);
const diag={platform:'toutiao',operation_id:crypto.randomUUID(),executor_id:crypto.randomUUID(),stage:'chooser_wait',outcome:'failed',cause:'timeout',observed_at:instant()};
const ledgerBefore=JSON.stringify(sql.prepare('SELECT * FROM article_upload_attempts').all()),articleBefore=JSON.stringify(sql.prepare('SELECT * FROM articles').all());
await call(item,'record_article_upload_diagnostic',diag);await call(item,'record_article_upload_diagnostic',diag);
assert.equal(sql.prepare('SELECT count(*) AS n FROM article_upload_diagnostics').get().n,1);
assert.equal(JSON.stringify(sql.prepare('SELECT * FROM article_upload_attempts').all()),ledgerBefore);assert.equal(JSON.stringify(sql.prepare('SELECT * FROM articles').all()),articleBefore);
await assert.rejects(call(item,'record_article_upload_diagnostic',{...diag,cause:'permission_denied'}));
await assert.rejects(call(item,'record_article_upload_diagnostic',{...diag,operation_id:crypto.randomUUID(),executor_id:item.claim}));
const oldClaim=crypto.randomUUID();await load('article-claim-credentials').rememberArticleClaimHashes(item.owner,oldClaim);
await assert.rejects(call(item,'record_article_upload_diagnostic',{...diag,operation_id:oldClaim}));
await assert.rejects(call(item,'record_article_upload_diagnostic',{...diag,operation_id:crypto.randomUUID(),attempt_id:crypto.randomUUID()}));
await assert.rejects(call(item,'record_article_upload_diagnostic',{...diag,operation_id:crypto.randomUUID(),cause:'platform_rejected'}));
assert.throws(()=>sql.prepare('UPDATE article_upload_diagnostics SET cause=?').run('unknown'));
assert.throws(()=>sql.prepare('DELETE FROM article_upload_diagnostics').run());
const reservation=await reserve(item),snapshot=JSON.stringify(attemptRow(item));
// An unbound observation before the current attempt is retained in history,
// but is no longer this new attempt's current error.
const oldObservation=await fixture('old-unbound-observation');
await call(oldObservation,'record_article_upload_diagnostic',{...diag,operation_id:crypto.randomUUID()});tick+=1000;
await reserve(oldObservation);
assert.equal((await call(oldObservation,'read_article_handoff')).upload_progress[0].diagnostic,null);
assert.ok(sql.prepare('SELECT count(*) AS n FROM article_upload_diagnostics WHERE article_id=?').get(oldObservation.id).n);
const boundDiag={...diag,operation_id:crypto.randomUUID(),attempt_id:reservation.attempt.attempt_id};
await call(item,'record_article_upload_diagnostic',boundDiag);assert.equal(JSON.stringify(attemptRow(item)),snapshot);
const consumeCredential=crypto.randomUUID(),syntheticAttempt={...attemptRow(item),id:crypto.randomUUID(),platform:'zhihu',target_account:guards.authorizedUploadAccounts.zhihu,consume_token_sha256:digest(consumeCredential.toLowerCase())};
const columns=Object.keys(syntheticAttempt);sql.prepare('INSERT INTO article_upload_attempts('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').run(...columns.map(c=>syntheticAttempt[c]));
await assert.rejects(call(item,'record_article_upload_diagnostic',{...diag,operation_id:crypto.randomUUID(),executor_id:consumeCredential}));
tick+=1000;await consume(item,reservation);
assert.equal((await call(item,'read_article_handoff')).upload_progress[0].diagnostic_superseded,false,'outcome_unknown does not erase a picker fault');
await call(item,'record_article_upload',{platform:'toutiao',execution_claim:item.claim,attempt_id:reservation.attempt.attempt_id,state:'draft_observed',editor_url:editor('toutiao')});
const progress=(await call(item,'read_article_handoff')).upload_progress[0];assert.equal(progress.attempt.state,'draft_observed');assert.equal(progress.diagnostic_superseded,true);
tick+=1000;await call(item,'record_article_upload_diagnostic',{...boundDiag,operation_id:crypto.randomUUID(),stage:'draft_readback',cause:'permission_denied',observed_at:instant()});
assert.equal((await call(item,'read_article_handoff')).upload_progress[0].diagnostic_superseded,false);
const listed=(await articles.articleList(item.owner)).find(r=>r.id===item.id);assert.equal(listed.upload_progress[0].diagnostic.cause,'permission_denied');
const claimDenied=await call(item,'claim_article');assert.equal(claimDenied.claimed,false);assert.equal(claimDenied.recovery.next_tool,'preview_article_claim_recovery');assert.equal(claimDenied.recovery.wait_for_expiry_required,false);assert.equal(claimDenied.recovery.new_platform_upload_allowed,false);assert.equal('claim_token' in claimDenied,false);
const current=sql.prepare('SELECT * FROM articles WHERE id=?').get(item.id);objects.delete(current.result_key);assert.equal((await call(item,'read_article_handoff')).word.ready,false);
const plain=await articles.createArticle('plain-owner',new File(['纯正文'], 'source.txt'));assert.equal((await tools.articleCall('plain-owner','read_article_handoff',{article_id:plain.id})).word.ready,false);
assert.equal(networkCalls,0);console.log('PASS read-only final Word handoff, real download contract, owner/credential isolation, immutable idempotent diagnostics before/after reserve, unchanged fences and superseded picker fault; platform calls=0.');
`;
try{fs.writeFileSync(temporary,harness+'\n'+checks,{flag:'wx'});const r=spawnSync(process.execPath,[fileURLToPath(temporary)],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exitCode=r.status??1;}finally{fs.unlinkSync(temporary);}
