// Offline comparison of the two genuine pure scanner modules. No provider,
// database, network, input scanner, or hash implementation is stubbed here.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const workspace=path.dirname(new URL(import.meta.url).pathname);
const baseRoot=process.env.TEST_BASE_SOURCE;
const candidateRoot=process.env.TEST_SOURCE||path.resolve(workspace,'..');
const dependencyRoot=process.env.TEST_DEPENDENCY_ROOT||candidateRoot;
const ts=createRequire(path.join(dependencyRoot,'package.json'))('typescript');
const names=['credential-boundary','editorial-credential-text'];
const exactBaseSha={
 'credential-boundary':'f6dfe8632c40860a6718cd10e3e47d74a1be31fed64941d332974fdf9aa34a74',
 'editorial-credential-text':'0f4aabfcffa841bec5e3bef8ef152ad231a1865c07d8627b58801850cff061c3'
};
const sourceShas={};
function loadPure(root,label){
 const modules=new Map();
 function load(name){
  assert.ok(names.includes(name),'Only the two genuine pure modules may load');
  if(modules.has(name))return modules.get(name);
  const filename=label==='base'&&!root?path.join(workspace,'fixtures',name+'-v84.ts.txt'):path.join(root,'lib',name+'.ts'),source=fs.readFileSync(filename,'utf8');
  const sha=createHash('sha256').update(source).digest('hex');
  sourceShas[label+':'+name]=sha;
  if(label==='base')assert.equal(sha,exactBaseSha[name],'Exact HEAD 394abe17 base source fixture');
  if(label==='candidate'&&name==='credential-boundary'&&process.env.TEST_CANDIDATE_CREDENTIAL_SHA)assert.equal(sha,process.env.TEST_CANDIDATE_CREDENTIAL_SHA,'Frozen final credential source');
  const module={exports:{}};modules.set(name,module.exports);
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const wrapper=vm.runInThisContext('(function(exports,require,module){\n'+compiled+'\n})',{filename});
  wrapper(module.exports,specifier=>{
   assert.equal(specifier,'./credential-boundary','No external dependency may run');
   return load('credential-boundary');
  },module);
  return module.exports;
 }
 return {...load('credential-boundary'),...load('editorial-credential-text')};
}
const base=loadPure(baseRoot,'base'),candidate=loadPure(candidateRoot,'candidate');
const counts={},started=performance.now();
function count(group,n=1){counts[group]=(counts[group]||0)+n;}
function outcome(work){try{return {returned:true,value:work()};}catch(error){return {returned:false,name:error?.name,message:error?.message};}}
function same(group,label,value,known=[],expected){
 const before=outcome(()=>base.inspectCredentialValue(value,known));
 const after=outcome(()=>candidate.inspectCredentialValue(value,known));
 assert.deepEqual(after,before,label+' complete value/hit/suppressed or exception');
 if(expected!==undefined){assert.equal(before.returned,true,label+' inspect returns');assert.equal(before.value.hit,expected,label+' base hit expectation');}
 count(group);
 const oldVariants=outcome(()=>base.editorialCredentialVariants(value));
 const newVariants=outcome(()=>candidate.editorialCredentialVariants(value));
 assert.deepEqual(newVariants,oldVariants,label+' exact original/decoded variants or exception');
 count(group);
 const oldEditorial=outcome(()=>base.editorialCredentialInspection(value,known));
 const newEditorial=outcome(()=>candidate.editorialCredentialInspection(value,known));
 assert.deepEqual(newEditorial,oldEditorial,label+' editorial fail-closed outcome');
 count(group);
 return {boundary:before,editorial:oldEditorial,variants:oldVariants};
}
function expectedEditorial(group,label,value,known,expected){
 const result=same(group,label,value,known);
 assert.deepEqual(result.editorial,{returned:true,value:expected},label+' base editorial expectation');
}
const opaque='Synthetic.Configured.Opaque.X7Y9Z2';
const unicodeOpaque='合成密钥🧪.CaseSensitive.X7Y9Z2';
const nonce='Synthetic.Nonce.ExactCase.N7R4';
const uuid='f702e0fa-bac8-4a1c-bb89-687c70da39ec';
const hash=createHash('sha256').update('synthetic claim token only').digest('hex');
const generic='sk-'+ 'q'.repeat(32);
const known=[opaque,unicodeOpaque,nonce,uuid,hash];
const unicode=text=>text.split('').map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
const percent=text=>[...new TextEncoder().encode(text)].map(b=>'%'+b.toString(16).padStart(2,'0')).join('');
const jsonEscape=text=>JSON.stringify(text).slice(1,-1);
function jsonLayers(text,n){for(let i=0;i<n;i++)text=JSON.stringify(text);return text;}

// The changed scalar decoder is checked against its exact previous operation
// for every UTF-16 code unit, including NUL and both lone surrogate ranges.
for(let unit=0;unit<(process.env.TEST_SKIP_UTF16_EXHAUSTIVE==='1'?0:65536);unit++){
 const escape='\\u'+unit.toString(16).padStart(4,'0');
 const old=JSON.parse('"'+escape+'"'),next=candidate.decodeCredentialJsonEscape(escape);
 assert.equal(next,old,'Scalar JSON Unicode escape '+unit);count('utf16_scalar');
 const value='unit:'+escape+':end',key='unit:'+String.fromCharCode(unit)+':end';
 assert.deepEqual(outcome(()=>candidate.inspectCredentialValue(value,[key])),outcome(()=>base.inspectCredentialValue(value,[key])),'Unicode unit full scan '+unit);
 count('utf16_boundary');
 assert.deepEqual(outcome(()=>candidate.editorialCredentialVariants(value)),outcome(()=>base.editorialCredentialVariants(value)),'Unicode unit variants '+unit);
 count('utf16_variants');
}
if(process.env.TEST_SKIP_UTF16_EXHAUSTIVE==='1')console.log('REUSE prior exhaustive UTF-16 proof; rerun changed boundary behavior against final source');
else console.log('PASS every UTF-16 code unit: scalar decoder, full boundary result, exact editorial variants');

const simple=['\\"','\\\\','\\/','\\b','\\f','\\n','\\r','\\t'];
for(const escape of simple){
 assert.equal(candidate.decodeCredentialJsonEscape(escape),JSON.parse('"'+escape+'"'));count('simple_scalar');
 same('simple_escapes','Simple '+JSON.stringify(escape),'before:'+escape+':after',['before:'+JSON.parse('"'+escape+'"')+':after']);
 same('simple_escapes','Embedded simple JSON '+JSON.stringify(escape),JSON.stringify('before:'+escape+':after'),[]);
}
for(const value of ['\\uD83E\\uDDEA','\\ud800\\udc00','\\udc00\\ud800','\\u0000\\ud800','\\uFFFF\\uFFFE','\\u0130\\u0069','\\ud800','\\udfff'])same('surrogates_and_case','UTF16 sequence '+value,value,[JSON.parse('"'+value+'"')]);
for(const escape of ['', 'u0000','\\u000','\\u00000','\\uZZZZ','\\v','\\x41','\\U0041','\\"x']){
 assert.throws(()=>candidate.decodeCredentialJsonEscape(escape),/uninspectable/);count('decoder_invalid');
}
console.log('PASS simple JSON escapes, surrogate pairs/lone surrogates, and invalid decoder input');

const genericForms=[generic,'sk-proj-'+'Q'.repeat(30),'sk-ant-'+'K'.repeat(30),...['p','o','u','s','r'].map(kind=>'gh'+kind+'_'+'A'.repeat(35)),...['','RSA ','EC ','OPENSSH '].map(kind=>'-----BEGIN '+kind+'PRIVATE KEY-----')];
for(const secret of [...known,...genericForms]){
 const transformations=[['raw',secret],['unicode',unicode(secret)],['unicode twice',unicode(unicode(secret))],['percent',percent(secret)],['percent twice',percent(percent(secret))],['percent unicode',percent(unicode(secret))],['unicode percent',unicode(percent(secret))],['JSON',JSON.stringify(secret)],['JSON four',jsonLayers(secret,4)]];
 for(const [form,value] of transformations){
  expectedEditorial('credential_forms',form+' synthetic credential',value,known,true);
  expectedEditorial('credential_forms',form+' synthetic object key',{[value]:'safe'},known,true);
  expectedEditorial('credential_forms',form+' truncated JSON','prefix {"note":"'+value+'",',known,true);
 }
}
same('exact_known_semantics','Uppercase UUID',uuid.toUpperCase(),known,true);
same('exact_known_semantics','Uppercase known UUID',uuid,[uuid.toUpperCase()],true);
same('exact_known_semantics','Lowercase opaque',opaque.toLowerCase(),[opaque],false);
same('exact_known_semantics','Uppercase opaque',opaque.toUpperCase(),[opaque],false);
same('exact_known_semantics','Uppercase nonce',nonce.toUpperCase(),[nonce],false);
same('exact_known_semantics','Uppercase hash',hash.toUpperCase(),[hash],false);
same('exact_known_semantics','Unicode opaque case',unicodeOpaque.toLowerCase(),[unicodeOpaque],false);
same('exact_known_semantics','Duplicate known values',[opaque,uuid.toUpperCase()],[opaque,opaque,uuid,uuid.toUpperCase(),'',nonce],true);
same('exact_known_semantics','Empty known list',opaque,[],false);
same('exact_known_semantics','New token absent',nonce,[opaque],false);
same('exact_known_semantics','New token present',nonce,[opaque,nonce],true);
same('exact_known_semantics','New token removed',nonce,[opaque],false);
for(const end of ['\n','\r','\r\n','\u2028','\u2029']){
 const opaqueUuid=uuid+end;
 same('exact_known_semantics','UUID-shaped newline remains exact opaque '+JSON.stringify(end),opaqueUuid,[opaqueUuid],true);
 same('exact_known_semantics','UUID-shaped newline uppercase remains different '+JSON.stringify(end),opaqueUuid.toUpperCase(),[opaqueUuid],false);
 same('exact_known_semantics','UUID-shaped newline absent suffix '+JSON.stringify(end),uuid,[opaqueUuid],false);
 same('exact_known_semantics','UUID plus opaque newline mixed pool '+JSON.stringify(end),uuid.toUpperCase(),[opaqueUuid,uuid],true);
}
const known512=Array.from({length:512},(_,i)=>i%2?'Synthetic.Opaque.'+i+'.ExactCase.N7R4':`f702e0fa-bac8-4a1c-bb89-${String(i+1).padStart(12,'0')}`);
for(const index of [0,1,255,256,510,511]){
 same('known_512','512 known hit '+index,'公开合成文字 '+known512[index],known512,true);
 expectedEditorial('known_512','512 escaped known hit '+index,unicode(known512[index]),known512,true);
}
same('known_512','512 known miss','公开合成文字不含任何凭证',known512,false);
same('known_512','512 known duplicate mixed array',{notes:['public',known512[510].toUpperCase()]},[...known512,...known512],true);
for(const shift of [28,29,30,31,32,33,34,35]){
 // The second UUID begins inside the first UUID's final hex run. Populate
 // the tail from the second value so both 36-character spans remain valid.
 const first='aaaaaaaa-aaaa-aaaa-aaaa-'+ 'a'.repeat(12),second='bbbbbbbb-bbbb-bbbb-bbbb-'+ 'b'.repeat(12);
 const text=first.slice(0,shift)+second;
 const earlier=text.slice(0,36),later=text.slice(shift,shift+36);
 assert.match(earlier,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
 assert.match(later,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
 for(const version of [text,text.toUpperCase()]){
  same('uuid_overlap','Overlapping later UUID shift '+shift,version,[later],true);
  same('uuid_overlap','Overlapping first UUID shift '+shift,version,[earlier],true);
  same('uuid_overlap','Overlapping both UUIDs shift '+shift,version,[earlier,later],true);
  same('uuid_overlap','Overlapping UUID reverse pool shift '+shift,version,[later.toUpperCase(),earlier],true);
  for(const prefix of ['f','0123456789abcdef','leading prose ',uuid])same('uuid_overlap','Embedded overlap shift '+shift+' prefix '+prefix,prefix+version+'fedcba9876543210',[later],true);
 }
}
for(let call=0;call<12;call++){
 same('uuid_regex_state','Repeated UUID hit '+call,uuid.toUpperCase(),[uuid],true);
 same('uuid_regex_state','Repeated UUID miss '+call,'public and '+uuid.replace(/^f/,'e'),[uuid],false);
 same('uuid_regex_state','Repeated embedded UUID '+call,'0123'+uuid+'ABCD',[uuid],true);
}
console.log('PASS opaque/nonces/hash/UUID/generic raw and layered credentials, exact case, duplicate/new tokens, 512 known scale');

for(const field of ['api_key','API-KEY','authorization','access_token','access-token','password','secret']){
 for(const key of [field,unicode(field),JSON.stringify(field),jsonLayers(field,3)]){
  for(const value of ['A'.repeat(12),'Bearer '+'A'.repeat(24),unicode('A'.repeat(24)),JSON.stringify('A'.repeat(24))]){
   expectedEditorial('field_association','Synthetic association '+field,{[key]:value},[],true);
   expectedEditorial('field_association','Synthetic serialized association '+field,JSON.stringify({[key]:value}),[],true);
  }
 }
 same('field_association','Short field safe '+field,{[field]:'abc'},[],false);
}
same('field_association','Safe resembling fields',{authorization_key:'2026-10-05-stepwise-text-pair',secretary:'A'.repeat(32)},[],false);
same('field_association','Sanitized key collisions',{[opaque]:'first',[nonce]:'second','[unsafe credential content removed]':'third'},known,true);
same('field_association','Original raw safe preservation',{text:'第一段\n第二段\\n第三段',usage:{input_tokens:15},nested:[true,null,3]},known,false);

// decodedMatch only adopts JSON.parse results when the result is a string.
// Cover all prefixes before relying on the candidate's string-prefix guard.
const whitespaces=['',' ','\t','\r','\n',' \t\r\n','\u00a0','\u1680','\u2000','\u2028','\u2029','\u3000','\ufeff'];
const matchInputs=['api_key','authorization','A'.repeat(16),JSON.stringify('api_key'),JSON.stringify('A'.repeat(16)),unicode('api_key'),unicode(JSON.stringify('api_key')),jsonEscape(JSON.stringify('api_key')),'12','-12','1.5','1e3','true','false','null','{}','[]','{"api_key":"'+ 'A'.repeat(16)+'"}','["api_key"]','"unterminated','"api_key" trailing'];
for(const space of whitespaces)for(const text of matchInputs){
 same('decoded_match_prefixes','decodedMatch key prefix '+JSON.stringify(space)+' '+JSON.stringify(text),{[space+text]:'A'.repeat(16)},[]);
 same('decoded_match_prefixes','decodedMatch value prefix '+JSON.stringify(space)+' '+JSON.stringify(text),{api_key:space+text},[]);
}
console.log('PASS decodedMatch plain/quoted/escaped quote, ASCII/Unicode/BOM whitespace, numeric/object/array/null prefixes');

// editorial scanner chunks advance 60000 but include 64096 code units.
// These placements straddle both boundaries in the serialized variants.
for(const at of [59980,59999,60000,60001,64075,64095,64096,64097,119980,120000]){
 for(const [form,text] of [['raw',opaque],['Unicode',unicode(opaque)],['percent',percent(opaque)],['percent UUID',percent(uuid.toUpperCase())]]){
  expectedEditorial('chunk_overlap',form+' credential across chunk '+at,'x'.repeat(at)+text+'x'.repeat(64096),known,true);
 }
}
expectedEditorial('chunk_overlap','Long safe chunks','公开字x'.repeat(150000),known,false);
for(const at of [59999,64095])expectedEditorial('chunk_overlap','Encoded generic boundary '+at,'x'.repeat(at)+' '+unicode(generic)+' x',[],true);
console.log('PASS field association, sanitized collisions, original safe values, 60000/64096 chunk overlap');

for(const bad of ['\\u','\\u0','\\u00','\\u000','\\uGGGG','\\u123Z','public \\u00 tail','\\\\u00','%5Cu00','%255Cu00'])expectedEditorial('fail_closed','Malformed Unicode '+bad,bad,known,true);
for(const value of ['\\x41','\\v','\\U0041','truncated {"safe":','"safe" tail','%GG','%FF%FE','%E0%A4%A','%ED%A0%80','%F0%9F'])same('malformed_parity','Malformed plain or percent '+value,value,known);
same('budgets','Exact direct character budget','x'.repeat(2000000),[],false);
same('budgets','Over direct character budget','x'.repeat(2000001),[],true);
expectedEditorial('budgets','JSON raw length overflow','x'.repeat(1999999),[],true);
const cumulativeVariants=same('budgets','Editorial cumulative variant budget',jsonLayers('x'.repeat(600000),14),[]);
assert.deepEqual(cumulativeVariants.variants,{returned:false,name:'Error',message:'uninspectable'},'Original editorial 8000000 cumulative character budget fails closed');
assert.deepEqual(cumulativeVariants.editorial,{returned:true,value:true});
same('budgets','Node budget exact',Array.from({length:19999},()=>0),[],false);
same('budgets','Node budget overflow',Array.from({length:20000},()=>0),[],true);
for(const depth of [31,32,33,40]){
 let value='public';for(let i=0;i<depth;i++)value=[value];
 same('budgets','Depth '+depth,value,[],depth>32);
}
for(const depth of [14,15,16,17,18])same('budgets','Layered JSON depth '+depth,jsonLayers('\\n',depth),[]);
expectedEditorial('budgets','Uninspectable JSON escape layers',jsonLayers('\\n',18),[],true);
let cyclic={};cyclic.self=cyclic;
same('budgets','Cyclic depth/serialization failure',cyclic,[],true);
same('budgets','BigInt serialization fail-closed',{value:1n},[]);
console.log('PASS fail-closed malformed Unicode, character/node/depth/layer limits, cyclic and BigInt inputs');

let seed=0x6b7c8d9e;
function random(max){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)%max;}
const alphabet=['公开','plain','\\n','\\t','\\\\','\\"','\\u0000','\\ud800','\\udc00','\\uD83E\\uDDEA','%41','%FF','%E0%A4%A','%5C','\\u00','api_\\u006bey','secret: abc',opaque,uuid.toUpperCase(),unicode(generic),percent(nonce),unicode(percent(hash))];
for(let trial=0;trial<1200;trial++){
 let text='';for(let part=0,n=1+random(12);part<n;part++)text+=alphabet[random(alphabet.length)]+String.fromCharCode(random(65536));
 const layers=random(5);
 for(let layer=0;layer<layers;layer++){
  const choice=random(4);text=choice===0?jsonEscape(text):choice===1?percent(text):choice===2?unicode(text):JSON.stringify(text);
  if(text.length>12000)break;
 }
 const value=random(3)===0?{note:text,nested:[null,true,random(100)]}:text;
 same('random_layered','Deterministic mixed escape trial '+trial,value,trial%3?known:known512);
}
console.log('PASS 1200 reproducible randomized Unicode/JSON/percent layered payloads');

// Fresh factories preserve stateful access/coercion traces. Comparing only a
// pre-serialized value would hide changed getter/toJSON timing and call count.
function statefulCompare(label,method,make){
 const run=api=>{
  const trace=[],fixture=make(trace),result=outcome(()=>api[method](fixture.value,fixture.known||known));
  // Variant[0] is the original object and can include methods/accessors. Its
  // exact identity is verified separately; decoded variants compare directly.
  if(method==='editorialCredentialVariants'&&result.returned){assert.equal(result.value[0],fixture.value);result.value=result.value.slice(1);}
  function project(value){
   if(typeof value==='function')return {function_name:value.name};
   if(Array.isArray(value))return value.map(project);
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,project(item)]));
   return value;
  }
  // inspect preserves function-valued members by reference. Check that
  // relation within each fresh fixture before projecting function identity.
  if(method==='inspectCredentialValue'&&result.returned&&result.value.value&&typeof result.value.value==='object'){
   for(const [key,descriptor] of Object.entries(Object.getOwnPropertyDescriptors(fixture.value))){
    if(typeof descriptor.value==='function')assert.equal(result.value.value[key],descriptor.value,label+' preserves function member identity');
   }
  }
  return {result:project(result),trace};
 };
 assert.deepEqual(run(candidate),run(base),label+' stateful full result and call trace');count('stateful_and_coercion');
}
const inputFactories=[
 ['getter changes',trace=>{let n=0;return {value:{get note(){trace.push('get:'+ ++n);return n===1?'public':opaque;}}};}],
 ['toJSON changes',trace=>{let n=0;return {value:{note:'public',toJSON(){trace.push('json:'+ ++n);return {note:n===1?'public':opaque};}}};}],
 ['getter and toJSON',trace=>{let get=0,json=0;return {value:{get note(){trace.push('get:'+ ++get);return get===1?'public':nonce;},toJSON(){trace.push('json:'+ ++json);return {note:this.note};}}};}],
 ['getter throws',trace=>({value:{get note(){trace.push('getter throws');throw Error('synthetic getter failure');}}})],
 ['toJSON throws',trace=>({value:{note:'public',toJSON(){trace.push('toJSON throws');throw Error('synthetic serialization failure');}}})],
 ['toJSON getter',trace=>({value:{note:'public',get toJSON(){trace.push('read toJSON');return function(){trace.push('call toJSON');return {note:opaque};};}}})]
];
for(const [label,make] of inputFactories)for(const method of ['inspectCredentialValue','editorialCredentialVariants','editorialCredentialInspection'])statefulCompare(label+' '+method,method,make);
const knownFactories=[
 ['number coercion',trace=>({value:'public 123 public',known:[123]})],
 ['boolean coercion',trace=>({value:'public true public',known:[true,false]})],
 ['nullish filter',trace=>({value:'public',known:[null,undefined,'',0,false]})],
 ['boxed string',trace=>({value:opaque,known:[new String(opaque)]})],
 ['symbol includes throws',trace=>({value:'public',known:[Symbol('synthetic')]})],
 ['UUID object without lowercase',trace=>({value:uuid.toUpperCase(),known:[{toString(){trace.push('known stringify');return uuid;}}]})],
 ['opaque stateful coercion',trace=>{let n=0;return {value:'public',known:[{toString(){trace.push('known:'+ ++n);return n===1?'absent':opaque;}}]};}],
 ['UUID stateful coercion',trace=>{let n=0;return {value:uuid.toUpperCase(),known:[{toString(){trace.push('known:'+ ++n);return n===1?'absent':uuid;},toLowerCase(){trace.push('known lowercase');return uuid;}}]};}],
 ['throwing known coercion',trace=>({value:'public',known:[{toString(){trace.push('known throws');throw Error('synthetic coercion failure');}}]})]
];
for(const [label,make] of knownFactories)for(const method of ['inspectCredentialValue','editorialCredentialInspection'])statefulCompare(label+' '+method,method,make);
console.log('PASS stateful getter/toJSON call parity and original non-string known coercion/exception path');

for(const value of [null,undefined,0,false,NaN,Infinity,{}, {input_tokens:Infinity,output_tokens:21.9,thinking_tokens:'unsafe'}, {input_tokens:-2,output_tokens:0,thinking_tokens:10.8}]){
 assert.deepEqual(candidate.numericCredentialSafeUsage(value),base.numericCredentialSafeUsage(value));count('numeric_usage');
}
for(const name of names)assert.equal(createHash('sha256').update(fs.readFileSync(path.join(candidateRoot,'lib',name+'.ts'))).digest('hex'),sourceShas['candidate:'+name],'Candidate source remained frozen: '+name);
const report={result:'passed',source_shas:sourceShas,counts,total_asserted_outcomes:Object.values(counts).reduce((a,b)=>a+b,0),elapsed_ms:Math.round(performance.now()-started),reused_utf16_proof:process.env.TEST_SKIP_UTF16_EXHAUSTIVE==='1',synthetic_only:true,provider_calls:0,db_calls:0};
fs.writeFileSync(process.env.TEST_V85_REPORT_FILE||path.join(workspace,'scanner-differential-result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
