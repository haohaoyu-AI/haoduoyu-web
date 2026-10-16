// Real wordBaseline body, SHA, parsing and raster checks; synthetic R2/DOCX only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {zipSync,strToU8,unzipSync,Unzip} from 'fflate';
const nativeRequire=createRequire(import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let zipScans=0,textParses=0,rasterChecks=0;
class CountedUnzip extends Unzip {constructor(...args){zipScans++;super(...args);}}
const modules={};
class Clock extends Date {constructor(...args){super(...(args.length?args:['2026-10-10T00:00:00.000Z']));}static now(){return Date.parse('2026-10-10T00:00:00.000Z');}}
function load(name){
 if(modules[name])return modules[name];
 const exports={};modules[name]=exports;
 const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:specifier=>{
  // Writing configuration is outside this pure inspection test. Its SHA helper
  // uses the same normal SHA256; source URLs are unused by these entrypoints.
  if(specifier==='./writing-input')return {hashText:async value=>hash(value),publicSourceUrl:value=>value};
  if(specifier==='fflate')return {...nativeRequire('fflate'),Unzip:CountedUnzip};
  return specifier.startsWith('./')?load(specifier.slice(2)):nativeRequire(specifier);
 },crypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Set,Map,Error,URL,Date:Clock});
 return exports;
}
const format=load('article-format'),integrity=load('image-integrity');
const parse=format.parseArticle;format.parseArticle=(...args)=>{textParses++;return parse(...args);};
const raster=integrity.assertRasterImage;integrity.assertRasterImage=(...args)=>{rasterChecks++;return raster(...args);};
const manifestTools=load('article-manifest');
const images=[
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNg+A8AAQIBAEK+vGgAAAAASUVORK5CYII=',
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=',
].map(value=>new Uint8Array(Buffer.from(value,'base64')));
const source=['合成标题','第一段原文。','第二段原文。'];
const plan=images.map((image,index)=>({sha256:hash(image),source_url:'https://example.com/'+index,source_title:'合成图'+index,after_paragraph:index===0?0:2}));
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function word(text=source){
 const body=text.flatMap((paragraph,index)=>[
  '<w:p><w:r><w:t xml:space="preserve">'+escape(paragraph)+'</w:t></w:r></w:p>',
  ...plan.flatMap((image,imageIndex)=>image.after_paragraph===index?['<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId'+imageIndex+'"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>']:[]),
 ]).join('');
 return zipSync({
  '[Content_Types].xml':strToU8('<Types><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels':strToU8('<Relationships><Relationship Id="main" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+'</w:body></w:document>'),
  'word/_rels/document.xml.rels':strToU8('<Relationships>'+images.map((_,index)=>'<Relationship Id="rId'+index+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image'+index+'.png"/>').join('')+'</Relationships>'),
  'word/media/image0.png':images[0],'word/media/image1.png':images[1],
 });
}
const bytes=word(),wordSha=hash(bytes);
const manifest={contract_version:1,author:'synthetic',input_sha256:'1'.repeat(64),prompt_sha256:'2'.repeat(64),original_sha256:hash(JSON.stringify(source)),sources_sha256:hash('[]'),sources:[],frozen_at:new Clock().toISOString(),layout:{images:plan,sha256:hash(JSON.stringify(plan)),recorded_at:new Clock().toISOString()}};
const plain=value=>JSON.parse(JSON.stringify(value));
const reset=()=>{zipScans=textParses=rasterChecks=0;};

const reuse=load('article-upload-word').reuseVerifiedUploadWord;
const receipt=await manifestTools.verifyWordManifest(manifest,source,bytes,wordSha);
const expected={title:source[0],paragraphs:source.slice(1),images:plan.map(({sha256,after_paragraph})=>({sha256,after_paragraph}))};

// Extract the production private function and its actual SHA/credential helpers.
// A fake owner-scoped R2 bucket is the only substitution on this execution path.
const uploadSource=ts.createSourceFile('article-upload-attempts.ts',fs.readFileSync('lib/article-upload-attempts.ts','utf8'),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
function productionNode(name){
 const node=uploadSource.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text===name
  ||ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text===name));
 assert.ok(node,'Production helper '+name+' must exist');return node.getText(uploadSource);
}
let stored=bytes,headReads=0,byteReads=0;
const rootExports={};
const rootCode=ts.transpileModule([productionNode('sha'),productionNode('safe'),productionNode('wordBaseline'),'exports.wordBaseline=wordBaseline;'].join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(rootCode,{exports:rootExports,crypto,TextEncoder,Uint8Array,Error,Date:Clock,
 MAX_FILE:format.MAX_FILE,inspectCredentialValue:load('credential-boundary').inspectCredentialValue,
 parseArtifactManifest:manifestTools.parseArtifactManifest,inspectUploadWord:manifestTools.inspectUploadWord,reuseVerifiedUploadWord:reuse,
 bucket:()=>({head:async()=>{headReads++;return {size:stored.length};},get:async()=>{byteReads++;return {arrayBuffer:async()=>stored.slice().buffer};}}),
});
const row=(changes={})=>({id:'00000000-0000-4000-8000-000000000001',result_key:'articles/00000000-0000-4000-8000-000000000001/result-'+wordSha+'.docx',
 result_meta:JSON.stringify({output_id:'00000000-0000-4000-8000-000000000002',sha256:wordSha,size:bytes.length,verification:receipt}),
 paragraphs:JSON.stringify(source),artifact_manifest:JSON.stringify(manifest),claim_token:null,...changes});
const run=article=>rootExports.wordBaseline(article,wordSha,bytes.length);
reset();assert.deepEqual(plain(await run(row())),expected);
assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:0,textParses:0,rasterChecks:0});
assert.deepEqual({headReads,byteReads},{headReads:1,byteReads:1},'Fast path still reads actual Word bytes');

// Same-size corruption must fail the production SHA check before reuse/parsing.
const sameSize=bytes.slice();sameSize[sameSize.length-1]^=1;stored=sameSize;
reset();await assert.rejects(run(row()),/Word checksum failed/);
assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:0,textParses:0,rasterChecks:0});stored=bytes;

// No receipt and legacy Word retain the full actual parse/image inspection.
for(const verification of [undefined,null]){
 reset();assert.deepEqual(plain(await run(row({result_meta:JSON.stringify({sha256:wordSha,size:bytes.length,verification})}))),expected);
 assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:2,textParses:1,rasterChecks:2});
}
reset();assert.deepEqual(plain(await run(row({artifact_manifest:null}))),expected);
assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:2,textParses:1,rasterChecks:2});
reset();assert.deepEqual(plain(await run(row({paragraphs:'[]'}))),expected);
assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:2,textParses:1,rasterChecks:2});

// Any missing/incorrect public receipt field disables reuse without suppressing full verification.
for(const key of Object.keys(receipt)){
 const missing={...receipt};delete missing[key];
 const incorrect={...receipt,[key]:key==='image_count'?1:key==='verified_at'?'invalid':'0'.repeat(64)};
 for(const verification of [missing,incorrect]){
  assert.equal(await reuse(manifest,source,wordSha,verification),null,key);
  reset();assert.deepEqual(plain(await run(row({result_meta:JSON.stringify({sha256:wordSha,size:bytes.length,verification})}))),expected);
  assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:2,textParses:1,rasterChecks:2});
 }
}
assert.equal(await reuse(manifest,source,wordSha,{...receipt,extra:'untrusted'}),null);
assert.equal(await reuse(manifest,source,wordSha,{...receipt,verified_at:'2099-01-01T00:00:00.000Z'}),null);
assert.equal(await reuse(null,source,wordSha,receipt),null);
assert.equal(await reuse(manifest,[],wordSha,receipt),null);
assert.equal(await reuse(manifest,[''],wordSha,receipt),null);
assert.equal(await reuse(manifest,[...source,2],wordSha,receipt),null);

const changedSource=[source[0],'被修改正文。',source[2]];
assert.equal(await reuse(manifest,changedSource,wordSha,receipt),null);
reset();await assert.rejects(run(row({paragraphs:JSON.stringify(changedSource)})),/保留标题、正文和段落顺序/);
assert.equal(textParses,1,'Original mismatch falls back to actual text parse');
for(const change of [m=>m.layout.images.reverse(),m=>m.layout.images[0].after_paragraph=1,m=>m.layout.images[0].sha256='0'.repeat(64)]){
 const changed=plain(manifest);change(changed);
 assert.equal(await reuse(changed,source,wordSha,receipt),null);
 reset();await assert.rejects(run(row({artifact_manifest:JSON.stringify(changed)})),/Word配图缺失/);
 assert.equal(textParses,1);assert.equal(rasterChecks,2);
 // Even an updated layout checksum cannot use the old finalize receipt.
 changed.layout.sha256=hash(JSON.stringify(changed.layout.images));
 assert.equal(await reuse(changed,source,wordSha,receipt),null);
}
for(const change of [m=>m.output_mode='text_only',m=>m.layout=null,m=>m.layout.images[0].after_paragraph=-1,m=>m.layout.images[0].source_url='https://example.com/?token=secret',m=>m.layout.images[0].source_title='',m=>m.layout.recorded_at='invalid']){
 const changed=plain(manifest);change(changed);assert.equal(await reuse(changed,source,wordSha,receipt),null);
}
const accessor={...receipt};Object.defineProperty(accessor,'word_sha256',{get(){throw Error('secret');},enumerable:true});
assert.equal(await reuse(manifest,source,wordSha,accessor),null);

// Raw blanks remain in the frozen digest, but public baseline omits blank paragraphs.
const blanks=[source[0],'',...source.slice(1)],blankManifest={...manifest,original_sha256:hash(JSON.stringify(blanks))};
const blankReceipt=await manifestTools.verifyWordManifest(blankManifest,blanks,bytes,wordSha);
assert.deepEqual(plain(await reuse(blankManifest,blanks,wordSha,blankReceipt)),{text:source,images:expected.images});
assert.equal(await reuse(blankManifest,source,wordSha,blankReceipt),null);
const copied=await reuse(manifest,source,wordSha,receipt);copied.text[0]='local mutation';copied.images[0].after_paragraph=1;
assert.deepEqual(plain(await reuse(manifest,source,wordSha,receipt)),{text:source,images:expected.images});

// Corrupt embedded PNG with a new declared digest cannot reuse an old receipt;
// the production fallback then rejects the actual PNG integrity failure.
const pngCorrupt=unzipSync(bytes);pngCorrupt['word/media/image0.png'][pngCorrupt['word/media/image0.png'].length-5]^=1;
stored=zipSync(pngCorrupt);const corruptSha=hash(stored);
assert.equal(await reuse(manifest,source,corruptSha,receipt),null);
await assert.rejects(rootExports.wordBaseline(row({result_meta:JSON.stringify({sha256:corruptSha,size:stored.length,verification:receipt})}),corruptSha,stored.length),/Word包含无效或不支持的图片/);
stored=bytes;
assert.deepEqual(Object.keys(receipt).sort(),['original_sha256','layout_sha256','word_sha256','image_count','verified_at'].sort());
console.log('PASS actual wordBaseline receipt reuse: real bytes SHA/size kept, matching receipt parse/raster/ZIP checks 1/2/2→0/0/0, same-size corruption rejected before reuse, original/image order/anchor/SHA mutations fall back and reject, every receipt field checked, legacy/cleaned text full inspection, fresh copies and original receipt fields retained; external calls=0.');
