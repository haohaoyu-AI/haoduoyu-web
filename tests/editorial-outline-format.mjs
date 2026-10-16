import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import ts from 'typescript';import {createHash} from 'node:crypto';
const hashText=async text=>createHash('sha256').update(text).digest('hex'),cache={};
function load(name){if(cache[name])return cache[name];const ex={};cache[name]=ex;vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:ex,URL,crypto,TextEncoder,require:x=>x==='./writing-input'?{hashText}:load(x.slice(2))});return ex;}
const fmt=load('editorial-outline-format'),contract=load('editorial-contract'),source=fs.readFileSync('tests/fixtures/editorial-outline-public-format.txt','utf8');
const sources=Array.from({length:7},(_,i)=>({id:'CX-S'+(i+1),title:'Synthetic format fixture '+i,url:'https://example.com/'+i,published:'2026-10-06',event_date:'2026-10-06',accessed:'2026-10-06',context:'Offline synthetic parser context, not live evidence'}));
const facts=Array.from({length:13},(_,i)=>({id:'CX-F'+(i+1),text:'Offline synthetic parser ID binding',source_ids:['CX-S'+([6,7,8,10].includes(i+1)?4:[9,11,12,13].includes(i+1)?5:1)],context:'Offline synthetic context, not live evidence'})),context={sources,facts};
assert.equal(await hashText(source),'6080be9e1db4acbab544393bf96db7df151c54588bf855e88676b08a908b8bc2');assert.throws(()=>contract.parseEditorialArtifact('outline',source,context));
const derived=await fmt.deriveOutlineFormat(source,context),proof=derived.proof;assert.equal(proof.source_text_sha256,await hashText(source));assert.equal(proof.artifact_sha256,await hashText(JSON.stringify(derived.artifact)));
assert.equal(proof.actions.length,2);const offsets=proof.actions[0].offsets;assert.equal(offsets.length,30);
let escaped='',at=0;for(const offset of offsets){assert.equal(source[offset],'"');escaped+=source.slice(at,offset)+'\\';at=offset;}escaped+=source.slice(at);
assert.equal(await hashText(escaped),proof.escaped_text_sha256);
const original=contract.parseEditorialJSONForFormat(escaped);assert.deepEqual(JSON.parse(derived.artifact.opening),JSON.parse(JSON.stringify(original.opening)));for(const key of Object.keys(original))if(key!=='opening')assert.deepEqual(JSON.parse(JSON.stringify(derived.artifact[key])),JSON.parse(JSON.stringify(original[key])));
assert.equal(JSON.parse(derived.artifact.opening).chars_limit,100);assert.equal(derived.artifact.sections.reduce((sum,s)=>sum+s.target_chars,0),2300);assert.equal(derived.artifact.target_chars,2500);
assert.deepEqual(JSON.parse(JSON.stringify(derived)),JSON.parse(JSON.stringify(await fmt.deriveOutlineFormat(source,context))));
const valid=JSON.stringify(original,null,2);assert.equal((await fmt.deriveOutlineFormat(valid,context)).proof.actions.length,1);await assert.rejects(fmt.deriveOutlineFormat(JSON.stringify(derived.artifact),context));
for(const invalid of [
 source.replace('谁是"热门"','谁是"热门", "unknown":"注入"'),
 valid.replace('"title":','"title":"重复",\n"title":'),
 valid.replace('"title":','"ti\\u0074le":"重复",\n"title":'),
 JSON.stringify({...original,unknown:'不要丢弃未知字段'}),
 JSON.stringify({...original,title:undefined}),
 JSON.stringify({...original,opening:{...original.opening,extra:'不许丢字段'}}),
 JSON.stringify({...original,opening:{hook:original.opening.hook,chars_limit:100}}),
 JSON.stringify({...original,opening:{...original.opening,chars_limit:'100'}}),
 JSON.stringify({...original,opening:{...original.opening,chars_limit:-1}}),
 JSON.stringify({...original,opening:{...original.opening,hook:'\u0000'}}),
 JSON.stringify({...original,target_chars:2000}),
 JSON.stringify({...original,sections:[{...original.sections[0],fact_ids:['UNKNOWN']}]}),
 source.replace('谁是"热门"','谁是"'),
 source.replace('谁是"热门"','谁是\n热门'),
])await assert.rejects(fmt.deriveOutlineFormat(invalid,context));
await assert.rejects(fmt.deriveOutlineFormat(source,{sources,facts:facts.filter(f=>f.id!=='CX-F13')}));
console.log('PASS actual public author fixture: 30 forced quote escapes, complete hook/background/chars_limit retained, all other values exact, independent hashes/actions; strict parser still rejects original and duplicate/unknown/ambiguous/missing-fact/budget/content cases fail closed');
