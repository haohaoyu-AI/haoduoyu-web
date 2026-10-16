// Pure module verification. No database, platform, provider or network calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const modules={};
function load(name){
 if(modules[name])return modules[name];
 const exports={};modules[name]=exports;
 const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:specifier=>{
  assert.ok(specifier.startsWith('./'),'Only pure local modules may be loaded');
  return load(specifier.slice(2));
 },Error,Set,WeakMap,Promise});
 return exports;
}
const diagnostics=load('article-upload-consume-diagnostics');
const plain=value=>JSON.parse(JSON.stringify(value));
const token='synthetic-secret-do-not-output-0123456789';
const raw=new Error('D1_ERROR SELECT private_column '+token);
const wrapped=diagnostics.consumeUploadDiagnosticError(raw,'consume_cas');
assert.equal(wrapped.message,'交付状态未确认，请只读取已有结果');
assert.equal('cause' in wrapped,false);
assert.deepEqual(plain(diagnostics.consumeUploadPublicDiagnostic(wrapped)),{stage:'consume_cas',outcome:'unconfirmed',execute_import:false,next_action:'read_existing_record'});
assert.equal(diagnostics.consumeUploadPublicDiagnostic(raw),null);
assert.equal(diagnostics.consumeUploadPublicDiagnostic({stage:'consume_cas'}),null);
const fixed=diagnostics.consumeUploadDiagnosticError(new Error('Fresh browser evidence required'),'file_confirmation_check');
assert.equal(fixed.message,'Fresh browser evidence required');
assert.equal(diagnostics.consumeUploadPublicDiagnostic(fixed).stage,'file_confirmation_check');

let independentRan=false;
const probes=await diagnostics.probeConsumeUpload([
 {stage:'word_output_check',run:()=>{throw raw;}},
 {stage:'continuation_lineage_check',run:async()=>{independentRan=true;return {private_payload:token};}},
 {stage:'file_confirmation_check',run:async()=>{throw new Error('Fresh browser evidence required');}},
]);
assert.equal(independentRan,true);
assert.deepEqual(plain(probes),[
 {stage:'word_output_check',outcome:'unconfirmed',safe_error:'交付状态未确认，请只读取已有结果'},
 {stage:'continuation_lineage_check',outcome:'verified'},
 {stage:'file_confirmation_check',outcome:'unconfirmed',safe_error:'Fresh browser evidence required'},
]);
const poisoned=diagnostics.consumeUploadDiagnosticError({get message(){throw raw;}},'word_output_check');
assert.equal(poisoned.message,'交付状态未确认，请只读取已有结果');
class D1Error extends Error {constructor(message){super(message);this.name='D1Error';}}
const expression=new D1Error('D1_ERROR: Expression tree is too large (maximum depth 100) SELECT private_column '+token+': SQLITE_ERROR');
const parser=new D1Error('D1_ERROR: parser stack overflow SELECT private_column '+token+': SQLITE_ERROR');
const expressionWrapped=diagnostics.consumeUploadDiagnosticError(expression,'consume_query_check');
const parserWrapped=diagnostics.consumeUploadDiagnosticError(parser,'consume_cas');
assert.equal(expressionWrapped.message,'交付状态未确认，请只读取已有结果');
assert.deepEqual(plain(diagnostics.consumeUploadPublicDiagnostic(expressionWrapped)),{stage:'consume_query_check',error_kind:'database_expression_limit',outcome:'unconfirmed',execute_import:false,next_action:'read_existing_record'});
assert.deepEqual(plain(diagnostics.consumeUploadPublicDiagnostic(parserWrapped)),{stage:'consume_cas',error_kind:'database_parser_limit',outcome:'unconfirmed',execute_import:false,next_action:'read_existing_record'});
assert.equal('cause' in expressionWrapped,false);
assert.equal('cause' in parserWrapped,false);
assert.equal(diagnostics.consumeUploadPublicDiagnostic(poisoned).error_kind,undefined);
assert.equal(diagnostics.consumeUploadPublicDiagnostic(fixed).error_kind,undefined);
const limitProbes=await diagnostics.probeConsumeUpload([
 {stage:'consume_query_check',run:()=>{throw expression;}},
 {stage:'consume_cas',run:()=>{throw parser;}},
 {stage:'word_output_check',run:()=>{throw raw;}},
]);
assert.deepEqual(plain(limitProbes),[
 {stage:'consume_query_check',outcome:'unconfirmed',safe_error:'交付状态未确认，请只读取已有结果',error_kind:'database_expression_limit'},
 {stage:'consume_cas',outcome:'unconfirmed',safe_error:'交付状态未确认，请只读取已有结果',error_kind:'database_parser_limit'},
 {stage:'word_output_check',outcome:'unconfirmed',safe_error:'交付状态未确认，请只读取已有结果'},
]);
for(const value of [wrapped.message,wrapped.stack,diagnostics.consumeUploadPublicDiagnostic(wrapped),probes,poisoned.message,expressionWrapped.message,expressionWrapped.stack,diagnostics.consumeUploadPublicDiagnostic(expressionWrapped),diagnostics.consumeUploadPublicDiagnostic(parserWrapped),limitProbes]){
 const encoded=JSON.stringify(value);assert.equal(encoded.includes(token),false);assert.equal(encoded.includes('SELECT private_column'),false);
}
console.log('PASS consume diagnostics: fixed phases/database limit kinds, allowlisted errors, raw D1 SQL/token suppression, no cause, independent read-only probes and discarded return payloads.');
