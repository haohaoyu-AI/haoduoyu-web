// Actual shared native article form -> exact isolated Worker.fetch -> temporary real D1.
// The production transport/origin are never changed and no external URL is dereferenced.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath,formAssembly,dotnet='dotnet']=process.argv.slice(2);
if(!fixtureDirectory||!outputPath||!formAssembly)throw new Error('Usage: node generate-article-pipeline-contract.mjs <isolated-source-worktree> <output.json> <Haoduoyu.Api.Tests.dll> [dotnet-executable]');
const root=resolve(fixtureDirectory),assembly=resolve(formAssembly);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const formFile=fileURLToPath(new URL('../Haoduoyu.Windows/ArticlePipelineFormLogic.cs',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const formSourceHash=sha(await readFile(formFile)),assemblyHash=sha(await readFile(assembly));
function form(original,changes={}) {
  return JSON.parse(execFileSync(dotnet,[assembly,'--article-pipeline-form-command'],{encoding:'utf8',input:JSON.stringify({original,changes}),maxBuffer:2*1024*1024}));
}
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();
const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic article pipeline form contract');}
  return originalFetch(input,options);
};
const samples=[],invalidForms=[];
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  async function call(name,method,path,body,{expected=200,vector}={}) {
    const headers=new Headers({Origin:app.origin,'X-Public-Business':'1'});
    if(body!==undefined){headers.set('Content-Type','application/json');headers.set('Idempotency-Key',randomUUID());}
    const response=await worker.fetch(new Request(app.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}),env);
    const responseJson=await response.text();
    assert.equal(response.status,expected,name+' returned '+responseJson);
    samples.push({name,method,path,...(body===undefined?{}:{body}),...(vector?{form:{original:vector.original,changes:vector.changes,values:vector.values}}:{}),
      status:response.status,response_json:responseJson});
    return JSON.parse(responseJson).data;
  }
  function build(original,changes={}) {
    const vector=form(original,changes);assert.equal(vector.ok,true,vector.error);return vector;
  }
  async function send(name,vector,expected=200) {
    return call(name,vector.method,vector.path,vector.body,{expected,vector});
  }
  const index=await call('article-form-current-complete-scope','GET','/api/v1/workbench-snapshot/index?version=2');
  assert.equal(index.complete,true);
  const localId=randomUUID();
  const original={id:localId,version:0,title:'',account_id:'toutiao-haoduoyu',status:'drafting',production_mode:'unknown',
    sample:{synthetic_future:{zero:0,nullable:null,kept:['仅合成 🐟',true]}},reruns:{watchdog:0,synthetic_future:{kept:true}},
    blockers:[{type:'synthetic',future:{kept:true}}],verify_items:[{text:'合成待核项',done:false,future:{kept:true}},{text:'合成未知状态项',future:0}],
    cover_desc:'合成封面原文',draft_ref:{synthetic_future:{kept:true,zero:0,nullable:null}},timings:{synthetic_future:{kept:true,zero:0,nullable:null}}};
  const createdForm=build(original,{title:'原生表单合成流水线',status:'draft_saved',production_mode:'mixed',
    slot:'tt1',writer:'dedao',illustrator:'codex',run_dir:'synthetic/native_'+localId.replaceAll('-',''),run_date:'2026-11-04',
    series_no:'42',char_count:'0',subheading_count:'0',image_count:'0',platform_article_id:'synthetic-platform-id',
    draft_pgc_id:'synthetic-pgc',draft_appmsgid:'synthetic-appmsg',draft_editor_url:'https://example.invalid/synthetic-editor#kept',
    started_at:'2026-11-04T08:00:00+08:00',finished_at:'2026-11-04T08:10:00.123+08:00',summary:'合成概况',notes:'合成备注'});
  assert.equal(createdForm.method,'POST');assert.equal(createdForm.path,'/api/v1/articles');
  assert.ok(!Object.hasOwn(createdForm.body,'id'));assert.ok(!Object.hasOwn(createdForm.body,'version'));
  const created=await send('native-pipeline-create-with-zero-and-future-evidence',createdForm,201);
  assert.notEqual(created.id,localId);assert.equal(created.version,1);
  for(const field of ['sample','reruns','blockers','verify_items'])assert.deepEqual(created[field],original[field],field+' evidence changed');
  for(const field of ['draft_ref','timings'])assert.deepEqual(created[field].synthetic_future,original[field].synthetic_future);
  for(const field of ['char_count','subheading_count','image_count'])assert.equal(created[field],0);
  assert.ok(created.warnings.includes('CHAR_COUNT_OUT_OF_RANGE'));assert.ok(created.warnings.includes('ENTERTAINMENT_IMAGES_TOO_FEW'));
  const path='/api/v1/articles/'+created.id;
  const loaded=await call('native-pipeline-load-server-assigned-detail','GET',path);
  const editedForm=build(loaded,{title:'原生表单合成流水线修改',writer:'human',illustrator:'human',char_count:'2200',subheading_count:'6',image_count:'25',
    series_no:'43',draft_pgc_id:'',draft_appmsgid:'',draft_editor_url:'https://example.invalid/synthetic-editor-updated',finished_at:'2026-11-04T08:20:00+08:00'});
  assert.equal(editedForm.method,'PUT');assert.equal(editedForm.path,path);assert.equal(editedForm.body.version,1);
  assert.ok(!Object.hasOwn(editedForm.body,'warnings'));assert.ok(!Object.hasOwn(editedForm.body,'has_pending_verify'));
  const edited=await send('native-pipeline-server-id-put-retains-future-fields',editedForm);
  assert.equal(edited.id,created.id);assert.equal(edited.version,2);
  for(const field of ['sample','reruns','blockers','verify_items'])assert.deepEqual(edited[field],original[field]);
  assert.equal(edited.draft_ref.pgc_id,null);assert.equal(edited.draft_ref.appmsgid,null);
  for(const field of ['draft_ref','timings'])assert.deepEqual(edited[field].synthetic_future,original[field].synthetic_future);
  assert.ok(!edited.warnings.includes('CHAR_COUNT_OUT_OF_RANGE'));assert.ok(!edited.warnings.includes('ENTERTAINMENT_IMAGES_TOO_FEW'));
  assert.equal(edited.has_pending_verify,true);assert.equal(edited.verify_state,'pending');
  const clearedForm=build(edited,{slot:'',writer:'',illustrator:'',run_dir:'',run_date:'',series_no:'',char_count:'',subheading_count:'',image_count:'',
    draft_editor_url:'',finished_at:'',platform_article_id:''});
  const cleared=await send('native-pipeline-explicit-unknown-keeps-null-and-evidence',clearedForm);
  for(const field of ['slot','writer','illustrator','run_dir','run_date','series_no','char_count','subheading_count','image_count','platform_article_id'])assert.equal(cleared[field],null,field+' was guessed instead of unknown');
  assert.equal(cleared.draft_ref.editor_url,null);assert.equal(cleared.timings.finished_at,null);
  for(const field of ['draft_ref','timings'])assert.deepEqual(cleared[field].synthetic_future,original[field].synthetic_future);
  for(const field of ['sample','reruns','blockers','verify_items'])assert.deepEqual(cleared[field],original[field]);
  const beforeConflict=await call('before-real-cas-conflict','GET',path);
  const stale=build(loaded,{title:'过期的合成修改不得覆盖'});
  await send('native-pipeline-real-version-cas-conflict',stale,409);
  const afterConflict=await call('after-real-cas-conflict','GET',path);assert.deepEqual(afterConflict,beforeConflict);
  const publishedOriginal={id:randomUUID(),version:0,title:'',account_id:'toutiao-haoduoyu',status:'drafting',production_mode:'unknown'};
  const publishedForm=build(publishedOriginal,{title:'原生已发布合成文章',status:'published',production_mode:'manual',slot:'gzh',writer:'human',illustrator:'pil',
    series_no:'9007199254740991',char_count:'0',subheading_count:'0',image_count:'0',run_date:'2026-11-04',
    url:'https://example.invalid/synthetic-published#fragment',published_at:'2026-11-04T08:30:00+08:00',started_at:'2026-11-04T08:00:00+08:00',finished_at:'2026-11-04T08:20:00+08:00'});
  const published=await send('native-pipeline-published-with-explicit-offset',publishedForm,201);
  assert.equal(published.series_no,9007199254740991);assert.equal(published.url,'https://example.invalid/synthetic-published');
  const publishedRead=await call('native-pipeline-published-detail','GET','/api/v1/articles/'+published.id);
  const noEdit=build(publishedRead,{notes:'合成已有文章的独立备注修改'});
  const final=await send('native-pipeline-untouched-times-and-metadata-remain',noEdit);
  for(const field of ['started_at','published_at','timings','slot','writer','illustrator','series_no','char_count','subheading_count','image_count'])assert.deepEqual(final[field],publishedRead[field]);

  function invalid(name,source,changes) {
    const built=form(source,changes);assert.equal(built.ok,false,name+' was accepted by actual shared native article builder');
    invalidForms.push({name,original:source,changes,error:built.error});
  }
  invalid('invalid-real-run-date',beforeConflict,{run_date:'2026-02-30'});
  invalid('invalid-run-date-width',beforeConflict,{run_date:'2026-1-1'});
  invalid('series-number-above-js-safe-limit',beforeConflict,{series_no:'9007199254740992'});
  invalid('series-number-zero',beforeConflict,{series_no:'0'});
  invalid('negative-character-count',beforeConflict,{char_count:'-1'});
  invalid('fractional-image-count',beforeConflict,{image_count:'1.5'});
  invalid('unknown-slot-enum',beforeConflict,{slot:'synthetic-unknown'});
  invalid('unknown-writer-enum',beforeConflict,{writer:'synthetic-unknown'});
  invalid('unknown-illustrator-enum',beforeConflict,{illustrator:'synthetic-unknown'});
  invalid('invalid-run-dir-traversal',beforeConflict,{run_dir:'synthetic/../invalid'});
  invalid('invalid-run-dir-empty-segment',beforeConflict,{run_dir:'synthetic//invalid'});
  invalid('unqualified-started-time',beforeConflict,{started_at:'2026-11-04T08:00:00'});
  invalid('unqualified-finished-time',beforeConflict,{finished_at:'2026-11-04T08:00:00'});
  invalid('unqualified-published-time',publishedRead,{published_at:'2026-11-04T08:30:00'});
  invalid('invalid-real-published-day',publishedRead,{published_at:'2026-02-30T08:30:00+08:00'});
  invalid('unpublished-with-public-url',beforeConflict,{status:'draft_saved',url:'https://example.invalid/not-published',published_at:''});
  invalid('published-without-url',publishedRead,{url:''});
  invalid('started-after-publication',publishedRead,{started_at:'2026-11-04T08:31:00+08:00'});
  invalid('draft-editor-script-url',beforeConflict,{draft_editor_url:'javascript:alert(1)'});
  invalid('draft-editor-url-with-userinfo',beforeConflict,{draft_editor_url:'https://synthetic:synthetic@example.invalid/editor'});
  invalid('unknown-original-status-requires-selection',{...beforeConflict,status:null},{status:''});
  invalid('malformed-original-draft-ref-preserved-not-dropped',{...beforeConflict,draft_ref:['must-not-discard']},{});
  invalid('malformed-original-timings-preserved-not-dropped',{...beforeConflict,timings:['must-not-discard']},{});
  const withoutVersion=structuredClone(beforeConflict);delete withoutVersion.version;
  invalid('missing-original-version-cannot-be-guessed-create',withoutVersion,{});
  invalid('null-original-version-cannot-be-guessed-create',{...beforeConflict,version:null},{});
  invalid('unpaired-surrogate-in-untouched-future-evidence',{...beforeConflict,sample:{synthetic_future:'\ud800'}},{});
  invalid('final-escaped-request-over-256-kib-with-valid-individual-fields',{...beforeConflict,sample:{synthetic_future:'中'.repeat(5000)}},
    {summary:'中'.repeat(10000),notes:'中'.repeat(20000),cover_desc:'中'.repeat(10000)});
  assert.equal(externalFetchAttempts,0);
  assert.equal(sha(await readFile(formFile)),formSourceHash,'Native article form source changed during capture; rebuild and regenerate');
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,
    commands_from:'Actual shared native ArticlePipelineFormLogic.FormValues/Build',form_logic_sha256:formSourceHash,form_builder_assembly_sha256:assemblyHash,
    external_fetch_attempts:externalFetchAttempts,generated_at:new Date().toISOString(),
    fixture:'Exact c30a8a9 compiled Worker.fetch + existing temporary Miniflare D1 harness; external services/fetch disabled; example.invalid links are inert data only',samples,invalid_forms:invalidForms},null,2)+'\n');
  console.log('Generated '+samples.length+' actual native article pipeline/Worker samples and '+invalidForms.length+' local form rejections; synthetic temporary D1; zero external fetch attempts.');
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
