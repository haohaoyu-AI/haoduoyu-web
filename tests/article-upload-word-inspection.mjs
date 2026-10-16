// Real parsing/raster/manifest checks, synthetic DOCX only; no DB or network.
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
class Clock extends Date {constructor(...args){super(...(args.length?args:['2026-10-10T00:00:00.000Z']));}}
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
async function legacyBaseline(m,original,b){
 const parsed=format.parseArticle(b,'checked.docx',true);let frozen=original;
 if(!frozen.length){if(!m)throw Error('Historical text was cleaned without a frozen digest; read existing results only');frozen=parsed.filter(p=>p.trim());}
 format.assertOriginalText(frozen,parsed);
 if(m)await manifestTools.verifyWordManifest(m,frozen,b,hash(b));
 return {text:(m?frozen:parsed).filter(p=>p.trim()),images:await manifestTools.inspectWordImages(b)};
}
reset();const old=await legacyBaseline(manifest,source,bytes);
assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:4,textParses:2,rasterChecks:4});
reset();const current=await manifestTools.inspectUploadWord(manifest,source,bytes,wordSha);
assert.deepEqual(plain(current),plain(old));
assert.deepEqual({zipScans,textParses,rasterChecks},{zipScans:2,textParses:1,rasterChecks:2});
for(const m of [null,manifest])for(const original of [source,m?[]:source]){
 assert.deepEqual(plain(await manifestTools.inspectUploadWord(m,original,bytes,wordSha)),plain(await legacyBaseline(m,original,bytes)));
}
const receipt=await manifestTools.verifyWordManifest(manifest,source,bytes,wordSha);
assert.deepEqual(Object.keys(receipt).sort(),['original_sha256','layout_sha256','word_sha256','image_count','verified_at'].sort());
assert.deepEqual(plain(receipt),{original_sha256:manifest.original_sha256,layout_sha256:manifest.layout.sha256,word_sha256:wordSha,image_count:2,verified_at:new Clock().toISOString()});
await assert.rejects(manifestTools.inspectUploadWord(null,[],bytes,wordSha),/cleaned without a frozen digest/);
await assert.rejects(manifestTools.inspectUploadWord({...manifest,original_sha256:'0'.repeat(64)},[],bytes,wordSha),/冻结正文/);
await assert.rejects(manifestTools.inspectUploadWord(manifest,source,word([source[0],'被修改正文',source[2]]),wordSha),/保留标题、正文和段落顺序/);
const spaced=word([source[0],'第一段 原文。',source[2]]);
await assert.rejects(manifestTools.inspectUploadWord(manifest,source,spaced,hash(spaced)),/成稿文字与冻结原文不一致/);
assert.deepEqual(plain(await manifestTools.inspectUploadWord(null,source,spaced,hash(spaced))),plain(await legacyBaseline(null,source,spaced)));
const blankSource=[source[0],'',...source.slice(1)];
const blankManifest={...manifest,original_sha256:hash(JSON.stringify(blankSource))};
assert.deepEqual(plain((await manifestTools.inspectUploadWord(blankManifest,blankSource,bytes,wordSha)).text),source);
await assert.rejects(manifestTools.inspectUploadWord(blankManifest,[],bytes,wordSha),/冻结正文/);
for(const change of [m=>m.layout.images[0].sha256='0'.repeat(64),m=>m.layout.images[0].after_paragraph=1,m=>m.layout.images.reverse()]){
 const changed=plain(manifest);change(changed);await assert.rejects(manifestTools.inspectUploadWord(changed,source,bytes,wordSha),/Word配图缺失/);
}
const corrupt=unzipSync(bytes);corrupt['word/media/image0.png'][corrupt['word/media/image0.png'].length-5]^=1;
await assert.rejects(manifestTools.inspectUploadWord(manifest,source,zipSync(corrupt),wordSha),/Word包含无效或不支持的图片/);
await assert.rejects(manifestTools.inspectUploadWord({...manifest,output_mode:'text_only'},source,bytes,wordSha),/文字稿已完成/);
await assert.rejects(manifestTools.inspectUploadWord({...manifest,layout:null},source,bytes,wordSha),/待补配图/);
console.log('PASS upload Word inspection: identical legacy results, one text parse/one full image inspection (ZIP scans 4→2), strict/frozen/cleaned text, raster corruption, image SHA/order/anchors, unchanged public receipt fields; external calls=0.');
