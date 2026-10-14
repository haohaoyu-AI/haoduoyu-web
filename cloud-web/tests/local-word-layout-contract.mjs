// Synthetic, offline DOCX contract tests. Validators below are actual source modules.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {zipSync,unzipSync,strToU8,zlibSync} from 'fflate';

const nativeRequire=createRequire(import.meta.url),modules=new Map();
const actual=new Set(['local-word-layout','article-format','image-integrity']);
function load(name){
  assert.ok(actual.has(name),'Unexpected validator dependency: '+name);
  if(modules.has(name))return modules.get(name);
  const exports={};modules.set(name,exports);
  const js=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:request=>request.startsWith('./')?load(request.slice(2)):nativeRequire(request),TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,Set,Map,Error,URL,crypto,Buffer},{filename:'lib/'+name+'.ts'});
  return exports;
}
const layout=load('local-word-layout'),format=load('article-format'),integrity=load('image-integrity');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const source=['OFFLINE MOCK layout contract','Synthetic body.','Required section','Final body.'];
const headings=[1];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(kind,data){const bytes=new Uint8Array(data.length+12),view=new DataView(bytes.buffer);view.setUint32(0,data.length);bytes.set(strToU8(kind),4);bytes.set(data,8);view.setUint32(data.length+8,crc32(bytes.subarray(4,data.length+8)));return bytes;}
function png(width=2,height=1){const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=2;const rows=new Uint8Array(height*(1+width*3));for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*(1+width*3)+1+x*3;rows.set(x%2?[30,30,220]:[220,30,30],at);}const parts=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlibSync(rows)),chunk('IEND',new Uint8Array())],bytes=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}integrity.assertRasterImage(bytes);return bytes;}
const normal='<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>';
const heading1='<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>';
function build({leading=0,width=2,height=1,cx=2743200*width,cy=2743200*height}={}){
  const full=[...Array(leading).fill(''),...source],required=leading+2;
  const picture=`<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="OFFLINE MOCK raster"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="OFFLINE MOCK raster"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  const paragraphs=full.map((text,index)=>`<w:p>${index===required?'<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>':''}${text?`<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r>`:''}</w:p>${index===required?picture:''}`).join('');
  return {source:full,headings,leading,files:{
    '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
    '_rels/.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml':strToU8(`<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`),
    'word/_rels/document.xml.rels':strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/synthetic.png"/><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'word/styles.xml':strToU8(`<w:styles xmlns:w="${W}">${normal}${heading1}</w:styles>`),
    'word/media/synthetic.png':png(width,height),
  }};
}
const xml=(fixture,part)=>new TextDecoder().decode(fixture.files[part]);
function patch(fixture,part,mutate){const files={...fixture.files};files[part]=strToU8(mutate(xml(fixture,part)));return {...fixture,files};}
const doc=(fixture,mutate)=>patch(fixture,'word/document.xml',mutate);
const styles=(fixture,mutate)=>patch(fixture,'word/styles.xml',mutate);
function paragraph(fixture,role,pPr){return doc(fixture,text=>{let found=false;const changed=text.replace(/<w:p>[\s\S]*?<\/w:p>/g,(p,index)=>{void index;let match=false;if(role==='image')match=p.includes('<w:drawing>');else if(role==='leading')match=!found&&p==='<w:p></w:p>';else match=p.includes(escape(role==='title'?source[0]:role==='body'?source[1]:source[2]));if(!match)return p;found=true;return p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/,'').replace('<w:p>','<w:p>'+pPr);});assert.equal(found,true,'Fixture paragraph '+role);return changed;});}
const pStyle=name=>`<w:pPr><w:pStyle w:val="${name}"/></w:pPr>`;
function setStyle(fixture,id,mutate){return styles(fixture,text=>{const pattern=new RegExp('<w:style\\b[^>]*w:styleId="'+id+'"[^>]*>[\\s\\S]*?<\\/w:style>');assert.match(text,pattern);return text.replace(pattern,mutate);});}
const addStyle=(fixture,definition)=>styles(fixture,text=>text.replace('</w:styles>',definition+'</w:styles>'));
const headingStyle=level=>`<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="${level-1}"/></w:pPr></w:style>`;
const frame=(fixture,outer,inner=outer)=>doc(fixture,text=>text.replace(/<wp:extent\b[^>]*\/>/,`<wp:extent cx="${outer[0]}" cy="${outer[1]}"/>`).replace(/<a:ext\b[^>]*\/>/,`<a:ext cx="${inner[0]}" cy="${inner[1]}"/>`));
const transform=(fixture,attributes)=>doc(fixture,text=>text.replace('<a:xfrm>','<a:xfrm '+attributes+'>'));
const cases=[];
function add(name,accept,fixture){cases.push({name,accept,fixture});}
const base=build(),leading=build({leading:2});
add('baseline native Heading1 and real 2x1 PNG',true,base);
add('two leading blanks preserved',true,leading);
add('native alternate allowed Heading1 name',true,setStyle(base,'Heading1',s=>s.replace('w:val="heading 1"','w:val="Heading1"')));
for(const name of ['Heading 1','HEADING1'])add('native case-insensitive allowed name '+name,true,setStyle(base,'Heading1',s=>s.replace('w:val="heading 1"',`w:val="${name}"`)));
add('native Heading1 basedOn omitted is allowed',true,setStyle(base,'Heading1',s=>s.replace('<w:basedOn w:val="Normal"/>','')));
for(const value of ['0','false'])add('native customStyle '+value+' is false',true,setStyle(base,'Heading1',s=>s.replace('w:type="paragraph"',`w:type="paragraph" w:customStyle="${value}"`)));
add('valid styles namespace with different prefix',true,styles(base,s=>s.replaceAll('w:','s:').replace('xmlns:w=','xmlns:s=')));
add('title uses valid Title style',true,paragraph(addStyle(base,'<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>'),'title',pStyle('Title')));
add('ordinary style and basedOn chain without outline',true,paragraph(addStyle(addStyle(base,'<w:style w:type="paragraph" w:styleId="PlainParent"><w:name w:val="Plain parent"/><w:basedOn w:val="Normal"/></w:style>'),'<w:style w:type="paragraph" w:customStyle="1" w:styleId="PlainBody"><w:name w:val="Plain body"/><w:basedOn w:val="PlainParent"/></w:style>'),'body',pStyle('PlainBody')));
add('unused Heading2 through Heading9 definitions allowed',true,addStyle(base,Array.from({length:8},(_,i)=>headingStyle(i+2)).join('')));
for(const role of ['title','body','image','leading'])add('extra native Heading1 on '+role,false,paragraph(role==='leading'?leading:base,role,pStyle('Heading1')));
for(let level=2;level<=9;level++)for(const role of ['body','required'])add(`Heading${level} on ${role}`,false,paragraph(addStyle(base,headingStyle(level)),role,pStyle('Heading'+level)));
add('custom inherited Heading1 cannot replace literal native Heading1',false,paragraph(addStyle(base,'<w:style w:type="paragraph" w:customStyle="1" w:styleId="UserHeading"><w:name w:val="User heading"/><w:basedOn w:val="Heading1"/></w:style>'),'required',pStyle('UserHeading')));
add('lowercase style ID cannot replace literal native Heading1',false,paragraph(setStyle(base,'Heading1',s=>s.replace('w:styleId="Heading1"','w:styleId="heading1"')),'required',pStyle('heading1')));
add('custom direct clone cannot replace literal native Heading1',false,paragraph(addStyle(base,heading1.replace('w:styleId="Heading1"','w:styleId="UserHeading"')),'required',pStyle('UserHeading')));
add('direct outline0 cannot replace required literal Heading1',false,paragraph(base,'required','<w:pPr><w:outlineLvl w:val="0"/></w:pPr>'));
for(let level=0;level<=9;level++){
  add('ordinary direct outline '+level,false,paragraph(base,'body',`<w:pPr><w:outlineLvl w:val="${level}"/></w:pPr>`));
  add('ordinary inherited outline '+level,false,paragraph(addStyle(addStyle(base,`<w:style w:type="paragraph" w:styleId="OutlineParent"><w:name w:val="Outline parent"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="${level}"/></w:pPr></w:style>`),'<w:style w:type="paragraph" w:styleId="InheritedBody"><w:name w:val="Inherited body"/><w:basedOn w:val="OutlineParent"/></w:style>'),'body',pStyle('InheritedBody')));
}
for(const role of ['title','image','leading'])add('outline9 on '+role,false,paragraph(role==='leading'?leading:base,role,'<w:pPr><w:outlineLvl w:val="9"/></w:pPr>'));
add('default paragraph style outline9',false,setStyle(base,'Normal',s=>s.replace('</w:style>','<w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>')));
add('docDefaults outline9',false,styles(base,s=>s.replace('</w:styles>','<w:docDefaults><w:pPrDefault><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>')));
add('ordinary run direct outline9',false,doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1],'<w:r><w:rPr><w:outlineLvl w:val="9"/></w:rPr><w:t xml:space="preserve">'+source[1])));
add('ordinary run style pointing to Heading1',false,doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1],'<w:r><w:rPr><w:rStyle w:val="Heading1"/></w:rPr><w:t xml:space="preserve">'+source[1])));
add('required paragraph outline9 overrides native Heading1',false,paragraph(base,'required','<w:pPr><w:pStyle w:val="Heading1"/><w:outlineLvl w:val="9"/></w:pPr>'));
for(const flag of ['vanish','webHidden']){
  add('ordinary run hidden node '+flag+' even val0',false,doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1],`<w:r><w:rPr><w:${flag} w:val="0"/></w:rPr><w:t xml:space="preserve">`+source[1])));
  add('applied default style hidden node '+flag+' even val0',false,setStyle(base,'Normal',s=>s.replace('</w:style>',`<w:rPr><w:${flag} w:val="0"/></w:rPr></w:style>`)));
  add('docDefaults hidden node '+flag+' even val0',false,styles(base,s=>s.replace('</w:styles>',`<w:docDefaults><w:rPrDefault><w:rPr><w:${flag} w:val="0"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`)));
  add('unused hidden style '+flag+' allowed',true,addStyle(base,`<w:style w:type="character" w:styleId="UnusedHidden"><w:name w:val="Unused hidden"/><w:rPr><w:${flag}/></w:rPr></w:style>`));
}
const missingStyles={...base,files:{...base.files}};delete missingStyles.files['word/styles.xml'];add('missing styles.xml',false,missingStyles);
add('styles.xml exists but styles relationship missing',false,patch(base,'word/_rels/document.xml.rels',s=>s.replace(/<Relationship Id="rIdStyles"[^>]*\/>/,'')));
add('stylesWithEffects part forbidden',false,{...base,files:{...base.files,'word/stylesWithEffects.xml':base.files['word/styles.xml']}});
add('missing Heading1 definition',false,setStyle(base,'Heading1',()=>''));
add('wrong styles root namespace',false,styles(base,s=>s.replace(W,'urn:offline-invalid-word-namespace')));
add('wrong Heading1 node namespace',false,setStyle(base,'Heading1',s=>s.replace('<w:style ','<w:style xmlns:w="urn:offline-invalid-word-namespace" ')));
for(const type of ['character','table'])add('native Heading1 wrong type '+type,false,setStyle(base,'Heading1',s=>s.replace('w:type="paragraph"',`w:type="${type}"`)));
for(const value of ['1','true'])add('native Heading1 customStyle '+value,false,setStyle(base,'Heading1',s=>s.replace('w:type="paragraph"',`w:type="paragraph" w:customStyle="${value}"`)));
for(const name of ['Fake Heading','heading  1',' heading 1','heading1 ','标题1'])add('native Heading1 wrong name '+name,false,setStyle(base,'Heading1',s=>s.replace('w:val="heading 1"',`w:val="${name}"`)));
add('native Heading1 missing name',false,setStyle(base,'Heading1',s=>s.replace('<w:name w:val="heading 1"/>','')));
add('native Heading1 missing direct outline0',false,setStyle(base,'Heading1',s=>s.replace('<w:pPr><w:outlineLvl w:val="0"/></w:pPr>','')));
for(const value of ['1','9','-1','0.5'])add('native Heading1 wrong direct outline '+value,false,setStyle(base,'Heading1',s=>s.replace('<w:outlineLvl w:val="0"/>',`<w:outlineLvl w:val="${value}"/>`)));
add('duplicate native Heading1 definition',false,addStyle(base,heading1));
add('Heading1 missing basedOn reference',false,setStyle(base,'Heading1',s=>s.replace('w:val="Normal"','w:val="Absent"')));
add('Heading1 empty basedOn reference',false,setStyle(base,'Heading1',s=>s.replace('<w:basedOn w:val="Normal"/>','<w:basedOn/>')));
add('Heading1 basedOn self cycle',false,setStyle(base,'Heading1',s=>s.replace('w:val="Normal"','w:val="Heading1"')));
add('Heading1 basedOn two-node cycle',false,addStyle(setStyle(base,'Heading1',s=>s.replace('w:val="Normal"','w:val="CycleParent"')),'<w:style w:type="paragraph" w:styleId="CycleParent"><w:name w:val="Cycle parent"/><w:basedOn w:val="Heading1"/></w:style>'));
add('inherited outline0 is not direct native definition',false,setStyle(setStyle(base,'Normal',s=>s.replace('</w:style>','<w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>')),'Heading1',s=>s.replace('<w:pPr><w:outlineLvl w:val="0"/></w:pPr>','')));
for(const rect of ['<a:srcRect/>','<a:srcRect l="0" t="0" r="0" b="0"/>','<a:srcRect l="1000"/>'])add('any srcRect forbidden '+rect,false,doc(base,s=>s.replace('<a:stretch>',rect+'<a:stretch>')));
for(const [name,mutate] of [
  ['missing outer extent',s=>s.replace(/<wp:extent\b[^>]*\/>/,'')],
  ['missing inner extent',s=>s.replace(/<a:ext\b[^>]*\/>/,'')],
  ['missing xfrm',s=>s.replace(/<a:xfrm>[\s\S]*?<\/a:xfrm>/,'')],
  ['missing outer cx',s=>s.replace(/<wp:extent\b[^>]*\/>/,'<wp:extent cy="2743200"/>')],
  ['missing inner cy',s=>s.replace(/<a:ext\b[^>]*\/>/,'<a:ext cx="5486400"/>')],
])add(name,false,doc(base,mutate));
for(const value of ['0','-1','1.5','1e6','9007199254740992','NaN','Infinity'])for(const outer of [true,false])add((outer?'outer':'inner')+' invalid integer '+value,false,frame(base,outer?[value,'2743200']:['5486400','2743200'],outer?['5486400','2743200']:[value,'2743200']));
add('outer and inner width differ by two EMU',false,frame(base,['5486400','2743200'],['5486402','2743200']));
add('each frame ratio valid but heights differ by two EMU',false,frame(base,['5486400','2743201'],['5486400','2743199']));
for(const [name,outer,inner] of [
  ['outer width rounds by one EMU',['5486401','2743200'],['5486400','2743200']],
  ['inner height rounds by one EMU',['5486400','2743200'],['5486400','2743201']],
  ['ratio formula exact boundary',['5486403','2743200'],['5486403','2743200']],
])add(name,true,frame(base,outer,inner));
add('ratio above exact boundary',false,frame(base,['5486404','2743200']));
add('0.1 percent width distortion',false,frame(base,['5491886','2743200']));
const large=build({width:3,height:2,cx:'9007199254740991',cy:'6004799503160659'});
assert.equal(BigInt('9007199254740991')*2n-BigInt('6004799503160659')*3n,5n);
add('BigInt product boundary beyond Number precision',true,large);
add('BigInt product above boundary despite floating rounding',false,frame(large,['9007199254740990','6004799503160662']));
add('integer rotation zero allowed',true,transform(base,'rot="0"'));
for(const value of ['0','false','off'])for(const axis of ['flipH','flipV'])add(axis+' identity '+value,true,transform(base,`${axis}="${value}"`));
for(const attributes of ['rot="60000"','rot="1"','rot="0.5"','rot="NaN"','flipH="1"','flipV="true"','flipH="on"','flipV="yes"'])add('actual/invalid transform '+attributes,false,transform(base,attributes));
add('document wrong Word namespace',false,doc(base,s=>s.replace(W,'urn:offline-invalid-word-namespace')));
add('correct document namespace with different prefix',true,doc(base,s=>s.replaceAll('w:','d:').replace('xmlns:w=','xmlns:d=')));
for(const [name,fragment] of [
  ['field instruction','<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'],
  ['field begin','<w:r><w:fldChar w:fldCharType="begin"/></w:r>'],
  ['simple field','<w:fldSimple w:instr="PAGE"/>'],
])add(name,false,doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1],fragment+'<w:r><w:t xml:space="preserve">'+source[1])));
for(const name of ['ins','del'])add('revision wrapper '+name,false,doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1]+'</w:t></w:r>',`<w:${name} w:id="1"><w:r><w:t xml:space="preserve">${source[1]}</w:t></w:r></w:${name}>`)));
add('empty body table forbidden',false,doc(base,s=>s.replace('<w:sectPr/>','<w:tbl/><w:sectPr/>')));
add('direct body run forbidden',false,doc(base,s=>s.replace('<w:sectPr/>','<w:r><w:t/></w:r><w:sectPr/>')));
add('nested paragraph forbidden',false,doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1]+'</w:t></w:r>',`<w:p><w:r><w:t xml:space="preserve">${source[1]}</w:t></w:r></w:p>`)));
const controls=doc(base,s=>s.replace('<w:r><w:t xml:space="preserve">'+source[1]+'</w:t></w:r>','<w:r><w:t>Synthetic</w:t><w:tab/><w:t>body.</w:t><w:br/><w:t>Next</w:t><w:cr/><w:t>Final</w:t></w:r>'));
controls.source=[source[0],'Synthetic\tbody.\nNext\nFinal',source[2],source[3]];add('tab br cr preserve exact frozen control text',true,controls);

const sharedPath=path.resolve('tests/fixtures/local_word_contract_v2/manifest.json');
const sharedRaw=fs.readFileSync(sharedPath),sharedManifest=JSON.parse(new TextDecoder().decode(sharedRaw));
assert.equal(digest(sharedRaw),'9b0fe906ed96e142ea0bebcae08b72ff8d28b1542f417d4d026e9c27ae2a36be','Expected shared synthetic matrix bytes');
assert.equal(sharedManifest.synthetic_only,true);assert.equal(sharedManifest.schema_version,2);
assert.ok(Array.isArray(sharedManifest.text_sequence)&&sharedManifest.text_sequence.every(p=>typeof p==='string'));
assert.deepEqual(sharedManifest.text_sequence,[...Array(sharedManifest.frozen.leading_blank_paragraphs).fill(''),sharedManifest.frozen.title,...sharedManifest.frozen.paragraphs]);
assert.equal(sharedManifest.cases.length,39);
for(const item of sharedManifest.cases){
  assert.ok(['accept','reject'].includes(item.expected));assert.match(item.sha256,/^[a-f0-9]{64}$/);
  const filePath=path.resolve(path.dirname(sharedPath),item.file),relative=path.relative(path.dirname(sharedPath),filePath);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));assert.match(filePath,/\.docx$/i);
  const bytes=fs.readFileSync(filePath);assert.equal(digest(bytes),item.sha256,item.name+' exact shared DOCX bytes');
  cases.push({name:'shared: '+item.name,accept:item.expected==='accept',bytes,shared:true,fixture:{source:sharedManifest.text_sequence,headings:sharedManifest.frozen.subheading_indices,leading:sharedManifest.frozen.leading_blank_paragraphs}});
}

const profileParityNames=new Set(['wrong styles root namespace','wrong Heading1 node namespace','valid styles namespace with different prefix','document wrong Word namespace','correct document namespace with different prefix','field instruction','field begin','simple field','revision wrapper ins','revision wrapper del','empty body table forbidden','direct body run forbidden','nested paragraph forbidden','tab br cr preserve exact frozen control text']);
const outcomes=[],failures=[],profileParity=[];
for(const item of cases){
  const bytes=item.bytes||zipSync(item.fixture.files),args=[bytes,item.fixture.source,item.fixture.headings,item.fixture.leading];
  let passed=true;try{if(item.accept){const parsed=format.parseArticle(bytes,'offline-layout.docx',true);assert.deepEqual(Array.from(parsed).filter(p=>p.trim()),item.fixture.source.filter(p=>p.trim()),item.name+' immutable text');const result=await layout.verifyLocalWordLayout(...args);assert.equal(result.blank_paragraphs_preserved,true);assert.equal(result.heading1_count,1);assert.equal(result.image_count,1);}else await assert.rejects(layout.verifyLocalWordLayout(...args),undefined,item.name);}catch(error){passed=false;failures.push(item.name);console.error('FAIL '+item.name+': '+String(error?.message||error));}
  outcomes.push({name:item.name,expected:item.accept?'accept':'reject',passed,size:bytes.length,sha256:digest(bytes),...(item.shared?{shared:true}:{})});
  if(profileParityNames.has(item.name))profileParity.push({item,bytes});
}
fs.mkdirSync('.local-word-test-output',{recursive:true});
fs.writeFileSync('.local-word-test-output/layout-contract-results.json',JSON.stringify({scope:'OFFLINE MOCK real DOCX fixtures; actual layout/article-format/image-integrity; no cloud, model or renderer',count:outcomes.length,accepted:outcomes.filter(item=>item.expected==='accept').length,rejected:outcomes.filter(item=>item.expected==='reject').length,shared_manifest_sha256:digest(sharedRaw),shared_count:outcomes.filter(item=>item.shared).length,cases:outcomes},null,2)+'\n');
assert.equal(failures.length,0,failures.join('; '));
assert.equal(profileParity.length,profileParityNames.size);
const profileDirectory='.local-word-test-output/backend-profile-parity';
fs.mkdirSync(profileDirectory,{recursive:true});
const profileManifest={schema_version:1,synthetic_only:true,scope:'OFFLINE MOCK; bytes exported from the successful actual backend layout run; no cloud/model/render run',cases:profileParity.map(({item,bytes},index)=>{const file=String(index+1).padStart(2,'0')+'_'+item.name.replace(/[^A-Za-z0-9]+/g,'_').toLowerCase()+'.docx';fs.writeFileSync(path.join(profileDirectory,file),bytes);return {name:item.name,file,sha256:digest(bytes),expected:item.accept?'accept':'reject',source:item.fixture.source,subheading_indices:item.fixture.headings,leading_blank_paragraphs:item.fixture.leading};})};
fs.writeFileSync(path.join(profileDirectory,'manifest.json'),JSON.stringify(profileManifest,null,2)+'\n');
console.log(`PASS ${outcomes.length} actual-DOCX layout contract cases (${outcomes.filter(item=>item.expected==='accept').length} positive, ${outcomes.filter(item=>item.expected==='reject').length} negative); validators are actual source modules; no cloud/model/render run.`);
console.log(`EXPORTED ${profileParity.length} identical-byte synthetic profile parity DOCX fixtures: ${profileDirectory}/manifest.json`);
