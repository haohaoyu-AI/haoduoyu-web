import {Unzip,UnzipInflate} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {MAX_FILE} from './article-format';
import {assertRasterImage} from './image-integrity';

type Node=Record<string,any>;
const WORD='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const DRAW='http://schemas.openxmlformats.org/drawingml/2006/main';
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const DOCUMENT_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function invalid():never{throw Error('Word layout contract verification failed');}
function xml(bytes:Uint8Array){
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)invalid();
 const tree=new XMLParser({preserveOrder:true,ignoreAttributes:false,removeNSPrefix:false,trimValues:false,parseTagValue:false,parseAttributeValue:false,processEntities:true}).parse(text) as Node[];
 function native(nodes:Node[],scope:Record<string,string>):Node[]{return nodes.map(node=>{
  const attributes=node[':@']||{},ns={...scope};
  for(const [name,value] of Object.entries(attributes)){if(name==='@_xmlns')ns['']=String(value);else if(name.startsWith('@_xmlns:'))ns[name.slice(8)]=String(value);}
  function expanded(name:string,attribute=false){const colon=name.indexOf(':'),prefix=colon<0?'':name.slice(0,colon),local=colon<0?name:name.slice(colon+1);return {local,uri:colon<0&&attribute?'':ns[prefix]||''};}
  const transformed:Node={};
  for(const [name,children] of Object.entries(node)){
   if(name===':@')continue;
   if(name.startsWith('#')||name.startsWith('?')){transformed[name]=children;continue;}
   const {local,uri}=expanded(name);
   const known=uri===WORD||uri===WP&&['inline','anchor','extent'].includes(local)||uri===DRAW&&['srcRect','blip','xfrm','ext'].includes(local)||uri===REL&&['Relationship','Relationships'].includes(local);
   const tag=known?local:`{${uri}}${local}`;
   if(Object.hasOwn(transformed,tag))invalid();
   transformed[tag]=Array.isArray(children)?native(children,ns):children;
   const values:Record<string,unknown>={};
   for(const [raw,value] of Object.entries(attributes)){
    if(raw==='@_xmlns'||raw.startsWith('@_xmlns:'))continue;
    const a=expanded(raw.slice(2),true);
    // Word attributes must actually be in the Word namespace. Drawing/relationship
    // coordinates use unqualified attributes; a:blip uses native r:embed.
    const valid=a.uri===WORD||a.uri===DOCUMENT_REL||!a.uri&&uri!==WORD;
    const key='@_'+(valid?a.local:`{${a.uri}}${a.local}`);
    if(Object.hasOwn(values,key))invalid();values[key]=value;
   }
   if(Object.keys(values).length)transformed[':@']=values;
  }
  return transformed;
 });}
 return native(tree,{});
}
function child(nodes:Node[],name:string):Node[]{return nodes.find(n=>Array.isArray(n[name]))?.[name]||[];}
function nodesNamed(nodes:Node[],name:string):Node[]{const found:Node[]=[];for(const node of nodes)for(const [key,value] of Object.entries(node)){if(key===name)found.push(node);if(key!==':@'&&Array.isArray(value))found.push(...nodesNamed(value,name));}return found;}
function one(nodes:Node[],name:string){const found=nodes.filter(node=>Object.hasOwn(node,name));if(found.length>1)invalid();return found[0];}
function allowedChildren(nodes:Node[],allowed:string[]){for(const node of nodes)for(const [name,value] of Object.entries(node)){if(name===':@')continue;if(name==='#text'){if(typeof value!=='string'||value.trim())invalid();}else if(!allowed.includes(name))invalid();}}
function text(nodes:Node[]):string{let value='';for(const node of nodes)for(const [key,children] of Object.entries(node)){if(key==='t')value+=(children as Node[]).map(n=>String(n['#text']??'')).join('');else if(key==='tab')value+='\t';else if(key==='br'||key==='cr')value+='\n';else if(key!==':@'&&Array.isArray(children))value+=text(children);}return value;}
export function dimensions(bytes:Uint8Array){assertRasterImage(bytes);const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),letters=(at:number,n:number)=>String.fromCharCode(...bytes.subarray(at,at+n));
 if(bytes[0]===137)return {width:v.getUint32(16),height:v.getUint32(20)};
 if(bytes[0]===255){let at=2;while(at<bytes.length){if(bytes[at++]!==255)invalid();while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217)break;if(marker>=208&&marker<=215)continue;const size=v.getUint16(at);if([192,193,194].includes(marker))return {height:v.getUint16(at+3),width:v.getUint16(at+5)};if(marker===218)break;at+=size;}return invalid();}
 let at=12;while(at+8<=bytes.length){const kind=letters(at,4),size=v.getUint32(at+4,true),p=at+8;
  if(kind==='VP8 ')return {width:v.getUint16(p+6,true)&0x3fff,height:v.getUint16(p+8,true)&0x3fff};
  if(kind==='VP8L'){const bits=v.getUint32(p+1,true);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
  at+=8+size+(size%2);
 }return invalid();
}

type Style={id:string;type:string;name:string;parent:string|null;outline:string|null;custom:boolean;isDefault:boolean;hidden:boolean;references:{id:string;type:string}[]};
function styles(bytes:Uint8Array){
 const tree=xml(bytes),root=one(tree,'styles');if(!root)invalid();
 const content=root!.styles as Node[],definitions=new Map<string,Style>();
 const defaultNode=one(content,'docDefaults'),defaults=defaultNode?.docDefaults||[];
 const unsupported=['outlineLvl','vanish','webHidden','ins','del','moveFrom','moveTo','pPrChange','rPrChange','sectPrChange','fldSimple','fldChar','instrText','delText'];
 if(unsupported.some(name=>nodesNamed(defaults,name).length))invalid();
 allowedChildren(defaults,['pPrDefault','rPrDefault']);
 for(const [wrapper,property] of [['pPrDefault','pPr'],['rPrDefault','rPr']]){const node=one(defaults,wrapper);if(node){allowedChildren(node[wrapper],[property]);if(!one(node[wrapper],property))invalid();}}
 function references(nodes:Node[],parent=''): {id:string;type:string}[]{const found:{id:string;type:string}[]=[];for(const node of nodes)for(const [name,value] of Object.entries(node)){
  if(name==='pStyle'||name==='rStyle'){if(parent!==(name==='pStyle'?'pPr':'rPr'))invalid();const id=node[':@']?.['@_val'];if(typeof id!=='string'||!id)invalid();found.push({id,type:name==='pStyle'?'paragraph':'character'});}
  if(name!==':@'&&Array.isArray(value))found.push(...references(value,name));
 }return found;}

 let paragraphDefault:string|null=null,characterDefault:string|null=null;
 for(const node of content.filter(node=>Object.hasOwn(node,'style'))){
  const a=node[':@']||{},children=node.style as Node[],id=a['@_styleId'];
  if(typeof id!=='string'||!id||definitions.has(id))invalid();
  const name=one(children,'name'),parent=one(children,'basedOn'),pPr=one(children,'pPr'),outline=pPr?one(pPr.pPr,'outlineLvl'):undefined;
  const allOutlines=nodesNamed(children,'outlineLvl');if(allOutlines.length!==(outline?1:0))invalid();
  const level=outline?.[':@']?.['@_val'];if(outline&&(typeof level!=='string'||!/^[0-9]$/.test(level)))invalid();
  const base=parent?.[':@']?.['@_val'];if(parent&&(typeof base!=='string'||!base))invalid();
  for(const flag of ['@_customStyle','@_default'])if(a[flag]!==undefined&&!['0','false','off','1','true','on'].includes(String(a[flag])))invalid();
  const style:Style={id,type:a['@_type']||'',name:name?.[':@']?.['@_val']||'',parent:base||null,outline:level??null,custom:['1','true','on'].includes(String(a['@_customStyle'])),isDefault:['1','true','on'].includes(String(a['@_default'])),hidden:unsupported.filter(name=>name!=='outlineLvl').some(name=>nodesNamed(children,name).length>0),references:references(children)};
  definitions.set(id,style);
  if(style.isDefault&&style.type==='paragraph'){if(paragraphDefault)invalid();paragraphDefault=id;}
  if(style.isDefault&&style.type==='character'){if(characterDefault)invalid();characterDefault=id;}
 }
 const looksHeading=(style:Style)=>/^heading/i.test(style.id)||/^heading/i.test(style.name.trim());
 function chain(id:string,type:string,allowNativeHeading=false){
  const active=new Set<string>(),visited=new Set<string>();
  function visit(at:string,expected:string,allow=false){
   const key=expected+':'+at;if(active.has(key))invalid();
   const style=definitions.get(at);if(!style||style.type!==expected||style.hidden)invalid();
   if(allow){if(style!.id!=='Heading1'||style!.custom||! /^(?:heading 1|Heading1)$/i.test(style!.name)||style!.outline!=='0'||style!.isDefault)invalid();}
   else if(looksHeading(style!)||style!.outline!==null)invalid();
   if(visited.has(key))return;active.add(key);
   if(style!.parent)visit(style!.parent,expected);
   for(const ref of style!.references)visit(ref.id,ref.type);
   active.delete(key);visited.add(key);
  }
  visit(id,type,allowNativeHeading);
 }
 for(const reference of references(defaults))chain(reference.id,reference.type);
 if(paragraphDefault)chain(paragraphDefault,'paragraph');
 if(characterDefault)chain(characterDefault,'character');
 return {definitions,paragraphDefault,characterDefault,chain};
}
function coordinate(value:unknown){if(typeof value!=='string'||!/^\d+$/.test(value))invalid();const n=BigInt(value);if(n<=BigInt(0)||n>BigInt(Number.MAX_SAFE_INTEGER))invalid();return n;}
const abs=(n:bigint)=>n<BigInt(0)?-n:n;
function extent(node:Node|undefined,width:number,height:number){if(!node)invalid();const cx=coordinate(node![':@']?.['@_cx']),cy=coordinate(node![':@']?.['@_cy']),w=BigInt(width),h=BigInt(height);if(w<=BigInt(0)||h<=BigInt(0)||abs(cx*h-cy*w)>w+h)invalid();return {cx,cy};}

/** Verify actual OOXML roles/styles and images against the immutable Word-only source. */
export async function verifyLocalWordLayout(bytes:Uint8Array,source:string[],subheadingIndices:number[],leadingBlankParagraphs=0){
 if(!Number.isSafeInteger(leadingBlankParagraphs)||leadingBlankParagraphs<0||leadingBlankParagraphs>4998||source.length>5000||source.slice(0,leadingBlankParagraphs).some(p=>p!==''))invalid();
 const headings=new Set(subheadingIndices.map(i=>i+1+leadingBlankParagraphs));
 if(headings.size!==subheadingIndices.length||subheadingIndices.some(i=>!Number.isSafeInteger(i)||i<0||i+1+leadingBlankParagraphs>=source.length||!source[i+1+leadingBlankParagraphs].trim()))invalid();
 const parts=new Map<string,Uint8Array>(),names=new Set<string>();let total=0,failure:Error|null=null;
 const unzip=new Unzip(file=>{
  if(file.name==='word/stylesWithEffects.xml')invalid();
  if(!['word/document.xml','word/styles.xml','word/_rels/document.xml.rels'].includes(file.name)&&!file.name.startsWith('word/media/'))return;
  if(names.has(file.name)||names.size>=80)invalid();names.add(file.name);
  const chunks:Uint8Array[]=[];let size=0;
  file.ondata=(error,data,final)=>{if(error){failure=error;file.terminate();return;}size+=data.length;total+=data.length;if(total>MAX_FILE){failure=Error('Word content exceeds limit');file.terminate();return;}chunks.push(data);if(final){const all=new Uint8Array(size);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.length;}parts.set(file.name,all);}};file.start();
 });unzip.register(UnzipInflate);
 for(let at=0;at<bytes.length;at+=16384){unzip.push(bytes.subarray(at,at+16384),at+16384>=bytes.length);if(failure)throw failure;}
 const document=parts.get('word/document.xml'),rels=parts.get('word/_rels/document.xml.rels'),stylePart=parts.get('word/styles.xml');if(!document||!rels||!stylePart)invalid();
 const graph=styles(stylePart!);
 if(headings.size)graph.chain('Heading1','paragraph',true);
 const relationRoot=one(xml(rels!),'Relationships');if(!relationRoot)invalid();allowedChildren(relationRoot!.Relationships,['Relationship']);
 const relationshipNodes=relationRoot!.Relationships.filter((node:Node)=>Object.hasOwn(node,'Relationship')),images=new Map<string,string>(),relationshipIDs=new Set<string>();let stylesRelationship=false;
 for(const node of relationshipNodes){const attrs=node[':@']||{},type=attrs['@_Type'],id=attrs['@_Id'],target=attrs['@_Target'],mode=attrs['@_TargetMode'];
  if(typeof id!=='string'||!id||relationshipIDs.has(id))invalid();relationshipIDs.add(id);
  if(type===DOCUMENT_REL+'/styles'){if(stylesRelationship||mode!==undefined&&mode!=='Internal'||target!=='styles.xml')invalid();stylesRelationship=true;}
  if(type===DOCUMENT_REL+'/image'){if(mode!==undefined&&mode!=='Internal'||typeof target!=='string'||!/^media\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(target))invalid();const path='word/'+target;if(!parts.has(path))invalid();images.set(id,path);}
 }
 if(!stylesRelationship)invalid();
 const tree=xml(document!),doc=one(tree,'document');if(!doc)invalid();const bodyNode=one(doc!.document,'body');if(!bodyNode)invalid();const body=bodyNode!.body as Node[];allowedChildren(body,['p','sectPr']);const paragraphs=body.filter(node=>Object.hasOwn(node,'p')),actual:string[]=[];let imageCount=0;
 if(['srcRect','ins','del','moveFrom','moveTo','pPrChange','rPrChange','sectPrChange','fldSimple','fldChar','instrText','delText','object','footnoteReference','endnoteReference','vanish','webHidden','imagedata'].some(name=>nodesNamed(body,name).length))invalid();
 for(const p of paragraphs){
  const content=p.p as Node[];allowedChildren(content,['pPr','r']);const inline=nodesNamed(content,'inline'),pPr=one(content,'pPr'),properties=pPr?.pPr||[],pStyle=one(properties,'pStyle'),outline=one(properties,'outlineLvl');
  if(nodesNamed(content,'anchor').length||nodesNamed(content,'pict').length||nodesNamed(content,'object').length)invalid();
  if(nodesNamed(content,'outlineLvl').length!==(outline?1:0)||nodesNamed(content,'pStyle').length!==(pStyle?1:0)||['vanish','webHidden'].some(name=>nodesNamed(content,name).length))invalid();
  const wanted=!inline.length&&headings.has(actual.length),id=pStyle?.[':@']?.['@_val'];
  if(pStyle&&(typeof id!=='string'||!id))invalid();
  if(wanted){if(id!=='Heading1'||outline&&outline[':@']?.['@_val']!=='0')invalid();graph.chain(id,'paragraph',true);}
  else{if(outline)invalid();const applied=id||graph.paragraphDefault||(graph.definitions.has('Normal')?'Normal':null);if(applied)graph.chain(applied,'paragraph');}
  for(const run of content.filter(node=>Object.hasOwn(node,'r'))){
   allowedChildren(run.r,['rPr','t','tab','br','cr','drawing']);
   for(const drawing of (run.r as Node[]).filter(node=>Object.hasOwn(node,'drawing'))){allowedChildren(drawing.drawing,['inline']);if(!one(drawing.drawing,'inline'))invalid();}
   const rPr=one(run.r,'rPr'),rStyle=rPr?one(rPr.rPr,'rStyle'):undefined;if(nodesNamed(run.r,'rStyle').length!==(rStyle?1:0))invalid();
   const explicitCharacter=rStyle?.[':@']?.['@_val'];if(rStyle&&(typeof explicitCharacter!=='string'||!explicitCharacter))invalid();const character=explicitCharacter||graph.characterDefault;if(character)graph.chain(character,'character');
  }
  if(!inline.length){actual.push(text(content));continue;}
  if(text(content).trim())invalid();
  for(const image of inline){imageCount++;const imageContent=image.inline as Node[],blips=nodesNamed(imageContent,'blip');if(blips.length!==1)invalid();
   const ref=blips[0][':@']?.['@_embed'],path=images.get(ref);if(!path)invalid();const shape=dimensions(parts.get(path!)!);
   const outer=extent(one(imageContent,'extent'),shape.width,shape.height),transforms=nodesNamed(imageContent,'xfrm');if(transforms.length!==1)invalid();const transform=transforms[0],attributes=transform[':@']||{};
   if(attributes['@_rot']!==undefined&&(typeof attributes['@_rot']!=='string'||!/^[-+]?\d+$/.test(attributes['@_rot'])||BigInt(attributes['@_rot'])!==BigInt(0)))invalid();
   for(const key of ['@_flipH','@_flipV'])if(attributes[key]!==undefined&&!['0','false','off'].includes(String(attributes[key])))invalid();
   const inner=extent(one(transform.xfrm,'ext'),shape.width,shape.height);if(abs(inner.cx-outer.cx)>BigInt(1)||abs(inner.cy-outer.cy)>BigInt(1))invalid();
  }
 }
 if(JSON.stringify(actual)!==JSON.stringify(source)||!imageCount)invalid();
 return {heading1_count:headings.size,image_count:imageCount,uncropped:true,aspect_ratio_verified:true,blank_paragraphs_preserved:true,native_heading1_verified:true,extra_headings_rejected:true};
}
