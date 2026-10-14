import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {webcrypto,createHash} from 'node:crypto';
import path from 'node:path';
const root=process.env.TEST_SOURCE||path.resolve(import.meta.dirname,'..'),fixtures=process.env.TEST_V87_FIXTURE_ROOT||'/workspace/shared';
const ts=createRequire(root+'/package.json')('typescript'),mods={};
function load(name){if(mods[name])return mods[name];const exports={};mods[name]=exports;
 const code=ts.transpileModule(fs.readFileSync(root+'/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,TextEncoder,TextDecoder,URL,Date,crypto:webcrypto,require:p=>p==='./writing-input'?{hashText:async value=>createHash('sha256').update(value).digest('hex')}:load(p.slice(2))},{filename:name+'.ts'});return exports;
}
const repair=load('editorial-output-repair-v3'),round=load('editorial-round-contract'),json=load('editorial-contract'),raw=fs.readFileSync(fixtures+'/claude-v3-fact-revision-returned.txt','utf8'),snapshot=JSON.parse(fs.readFileSync(fixtures+'/editorial-v81-original-snapshot.json')),input=JSON.parse(fs.readFileSync(fixtures+'/claude-v3-second-fact-input.json')),report=JSON.parse(fs.readFileSync(fixtures+'/claude-v3-second-fact-review.json'));
const context={validation_version:3,sources:snapshot.sources,facts:snapshot.facts,input_article:input.input_article,input_binding:input.input_binding,bound_input_binding:input.input_binding,previous_report:report};
let passed=0;async function test(name,run){await run();passed++;console.log('PASS '+name);}
const derived=await repair.deriveInvalidWriterOutputRepair('fact_revision',raw,context);
await test('real malformed receipt only inserts 30 escapes and locks exact original prose',()=>{
 const extracted=repair.extractInvalidWriterOutput(raw);assert.equal(extracted.inserted_backslashes,30);assert.equal(derived.candidate_article_sha256,'6f11d2a420531e6b3907e67bcf99453dfff58460495fc32b42037a874a042ee1');
 assert.equal(derived.source_text_sha256,'6393744007bcde195c8dd9f2eed9c96c4df046b2565f50bfe949dc522943cad7');assert.equal(derived.feedback.original_output_text,raw);assert.equal(derived.candidate_article.paragraphs.length,56);
 assert.deepEqual(Array.from(derived.feedback.actual_changed_positions),[35,46,50,51]);assert.deepEqual(Array.from(derived.feedback.ledger_errors,e=>[e.code,e.paragraph]),[['before_not_exact',46],['change_not_listed',35]]);
 assert.throws(()=>round.parseRoundArtifact('fact_revision',JSON.stringify(extracted.value),context),/变更记录/);
});
const synthetic=json.parseEditorialJSONForFormat(JSON.stringify(repair.extractInvalidWriterOutput(raw).value));
synthetic.changes.find(change=>change.paragraph===46).before=input.input_article.paragraphs[45];
synthetic.changes.push({paragraph:35,before:input.input_article.paragraphs[34],after:synthetic.article.paragraphs[34],reason:'Synthetic offline test author ledger; never stored as production output.'});
await test('synthetic author can satisfy unchanged complete contract without changing body',async()=>{
 const artifact=round.parseRoundArtifact('fact_revision',JSON.stringify(synthetic),context);assert.equal(createHash('sha256').update(JSON.stringify(artifact.article)).digest('hex'),derived.candidate_article_sha256);
 await repair.assertInvalidWriterOutputRepairBody({output_repair:{recovery_kind:'invalid_output_repair',candidate_article_sha256:derived.candidate_article_sha256,candidate_article:derived.candidate_article}},artifact);
});
await test('already valid revision is not eligible for output repair',async()=>assert.rejects(repair.deriveInvalidWriterOutputRepair('fact_revision',JSON.stringify(synthetic),context)));
await test('feedback is server-derived exact hash and input includes full original business context',()=>{
 const binding={recovery_kind:'invalid_output_repair',source_stage_id:input.stage_id,source_input_sha256:'a'.repeat(64),...derived};
 const next=repair.buildInvalidWriterOutputRepairInput(input,{id:'11111111-1111-4111-8111-111111111111',round:7,sequence:14},binding),user=JSON.parse(next.user_prompt);
 assert.equal(next.system_prompt,input.system_prompt);assert.equal(next.model,input.model);assert.deepEqual(JSON.parse(JSON.stringify(user.output_repair)),JSON.parse(JSON.stringify(binding)));
 assert.equal(createHash('sha256').update(JSON.stringify(derived.feedback)).digest('hex'),derived.feedback_sha256);assert.notEqual(next.user_prompt,input.user_prompt);
});
await test('output body mutation including whitespace or quote change is rejected',async()=>{
 for(const mutate of [a=>a.title+=' ',a=>a.paragraphs[34]+=' ',a=>a.paragraphs[34]=a.paragraphs[34].replace('"','“')]){const article=JSON.parse(JSON.stringify(derived.candidate_article));mutate(article);await assert.rejects(repair.assertInvalidWriterOutputRepairBody({output_repair:{recovery_kind:'invalid_output_repair',candidate_article_sha256:derived.candidate_article_sha256,candidate_article:derived.candidate_article}},{article}));}
});
for(const [name,bad] of [
 ['ambiguous structural quote',raw.replace('害怕失去时做错选择',',害怕失去时做错选择')],
 ['unknown malformed field',raw.replace('"reason":','"issue_id":')],
 ['malformed unicode escape',raw.replace('林珑','\\uZZZZ')],
 ['duplicate article field',raw.replace('"article": {','"article": {}, "article": {')],
 ['injected second value structure',raw.replace('"title": "','"title": "a", "extra": "')],
 ['unsupported multilined literal',raw.replace('岗位和职责','岗位\n和职责')],
])await test(name,async()=>{await assert.rejects(repair.deriveInvalidWriterOutputRepair('fact_revision',bad,context));});
await test('unknown writer kind and invalid report/binding are rejected',async()=>{
 await assert.rejects(repair.deriveInvalidWriterOutputRepair('body',raw,context));await assert.rejects(repair.deriveInvalidWriterOutputRepair('fact_revision',raw,{...context,bound_input_binding:{...context.input_binding,sha256:'0'.repeat(64)}}));
 await assert.rejects(repair.deriveInvalidWriterOutputRepair('fact_revision',raw,{...context,previous_report:{...report,coverage:[]}}));
});
await test('underlength or changed schema cannot become a billable locked candidate',async()=>{
 const value=JSON.parse(JSON.stringify(synthetic));value.article.paragraphs=['短稿'];await assert.rejects(repair.deriveInvalidWriterOutputRepair('fact_revision',JSON.stringify(value),context));value.article={...synthetic.article,extra:'x'};await assert.rejects(repair.deriveInvalidWriterOutputRepair('fact_revision',JSON.stringify(value),context));
});
console.log(JSON.stringify({passed,provider_calls:0,production_writes:0,real_source_file_has_one_saved_trailing_newline:true,candidate_article_sha256:derived.candidate_article_sha256}));
