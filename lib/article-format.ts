import {Unzip,UnzipInflate} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
export const MAX_FILE=20_000_000,MAX_TEXT=100_000;
const MAIN='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const WORD_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const DECORATION_ERROR='暂不支持宏、页眉页脚或脚注内容';
const decorationName=(name:string)=>/^word\/(header|footer)\d*\.xml$/.exec(name)?.[1];
const stylePart=(name:string)=>name==='word/styles.xml'||name==='word/stylesWithEffects.xml';
const activeContent=(value:string)=>/vbaProject|vbaData|macroEnabled|activeX|oleObject/i.test(value);
function xmlTree(xml:string,ordered=false,removeNSPrefix=true){if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw Error('Word XML结构无效或包含实体声明');return new XMLParser({preserveOrder:ordered,ignoreAttributes:false,removeNSPrefix,trimValues:false,processEntities:true,parseTagValue:false,parseAttributeValue:false}).parse(xml);}
const array=(v:any)=>v===undefined?[]:Array.isArray(v)?v:[v];

// Package metadata has unqualified attributes. Validate before normalizing
// names so an extension attribute cannot overwrite ContentType or Type.
function packageTree(xml:string,rootName:'Types'|'Relationships'){
 type Node=Record<string,unknown>;type Attributes=Record<string,string>;
 const expectedNamespace=`http://schemas.openxmlformats.org/package/2006/${rootName==='Types'?'content-types':'relationships'}`;
 const attributes:Record<string,string[]>={Types:[],Default:['Extension','ContentType'],Override:['PartName','ContentType'],Relationships:[],Relationship:['Id','Type','Target','TargetMode']};
 const children:Record<string,Attributes[]>={};let roots=0;
 const fail=():never=>{throw Error('文档关系无效');};
 function read(nodes:Node[],parent:string,scope:Attributes,rootNamespace:string){
  for(const node of nodes)for(const rawName of Object.keys(node)){
   if(rawName===':@')continue;
   if(rawName==='#text'){if(String(node[rawName]).trim())fail();continue;}
   if(rawName==='?xml'&&!parent)continue;
   const attrs=(node[':@']||{}) as Attributes,ns={...scope};
   for(const key of Object.keys(attrs))if(key==='@_xmlns')ns['']=attrs[key];else if(key.startsWith('@_xmlns:'))ns[key.slice(8)]=attrs[key];
   const split=rawName.split(':'),tag=split.pop()!,prefix=split.join(':'),uri=ns[prefix]||'';if(prefix&&!Object.hasOwn(ns,prefix))fail();
   if(!parent){if(++roots!==1||tag!==rootName||(uri!==expectedNamespace&&uri!==''))fail();rootNamespace=uri;}
   else if(parent!==rootName||uri!==rootNamespace||!(rootName==='Types'?['Default','Override']:['Relationship']).includes(tag))fail();
   const values:Attributes={};
   for(const [raw,value] of Object.entries(attrs)){
    if(raw==='@_xmlns'||raw.startsWith('@_xmlns:'))continue;
    const key=raw.slice(2);if(key.includes(':')||!attributes[tag]?.includes(key))fail();values['@_'+key]=value;
   }
   if(parent)(children[tag]??=[]).push(values);
   read(node[rawName] as Node[],tag,ns,rootNamespace);
  }
 }
 read(xmlTree(xml,true,false) as Node[],'',{},'');if(roots!==1)fail();
 return {[rootName]:children};
}

// Never evaluate a Word field. The only nonempty decoration we accept is an
// exact PAGE field, with an optional numeric cached result. Every other node
// must be known inert formatting; a lack of w:t alone does not mean "empty".
function assertPageDecoration(xml:string,kind:string){
 type Node=Record<string,unknown>;type Namespaces=Record<string,string>;
 const tree=xmlTree(xml,true,false) as Node[];
 const fail=():never=>{throw Error(DECORATION_ERROR);};
 const allowed:Record<string,string[]>={
  hdr:['p'],ftr:['p'],p:['pPr','r','fldSimple'],pPr:['pStyle','jc','spacing','ind'],
  r:['rPr','t','fldChar','instrText'],rPr:['rFonts','b','bCs','i','iCs','u','color','sz','szCs','lang'],
  fldSimple:['r'],t:[],instrText:[],fldChar:[],
  pStyle:[],jc:[],spacing:[],ind:[],rFonts:[],b:[],bCs:[],i:[],iCs:[],u:[],color:[],sz:[],szCs:[],lang:[],
 };
 const attributes:Record<string,string[]>={
  p:['rsidR','rsidRDefault','rsidP'],r:['rsidR','rsidRPr'],fldSimple:['instr','dirty','fldLock'],fldChar:['fldCharType','dirty','fldLock'],
  pStyle:['val'],jc:['val'],spacing:['before','after','line','lineRule','beforeAutospacing','afterAutospacing'],
  ind:['left','right','start','end','firstLine','hanging'],rFonts:['ascii','hAnsi','eastAsia','cs','asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme','hint'],
  b:['val'],bCs:['val'],i:['val'],iCs:['val'],u:['val','color'],color:['val','themeColor','themeTint','themeShade'],sz:['val'],szCs:['val'],lang:['val','eastAsia','bidi'],
 };
 let field:null|{code:string;result:boolean}=null,simple=false,roots=0;const styles=new Set<string>();
 const isPage=(value:string)=>value.trim()==='PAGE';
 function read(nodes:Node[],parent:string,scope:Namespaces):string{
  let text='';
  for(const node of nodes||[])for(const rawName of Object.keys(node)){
   if(rawName===':@')continue;
   if(rawName==='#text'){
    const value=String(node[rawName]);
    if(parent==='t'||parent==='instrText')text+=value;else if(value.trim())fail();
    continue;
   }
   if(rawName==='?xml'&&!parent)continue;
   const attrs=(node[':@']||{}) as Record<string,string>,ns={...scope};
   for(const key of Object.keys(attrs))if(key==='@_xmlns')ns['']=attrs[key];else if(key.startsWith('@_xmlns:'))ns[key.slice(8)]=attrs[key];
   const split=rawName.split(':'),tag=split.pop()!,prefix=split.join(':');
   if(ns[prefix]!==WORD_NS||!Object.hasOwn(allowed,tag))fail();
   if(!parent){if(++roots!==1||tag!==(kind==='header'?'hdr':'ftr'))fail();}
   else if(!allowed[parent]?.includes(tag))fail();
   const values:Record<string,string>={},expandedAttributes=new Set<string>();
   for(const [raw,value] of Object.entries(attrs)){
    if(raw==='@_xmlns'||raw.startsWith('@_xmlns:'))continue;
    const pieces=raw.slice(2).split(':'),key=pieces.pop()!,ap=pieces.join(':'),uri=ns[ap];
    const expanded=`${uri||ap}:${key}`;if(expandedAttributes.has(expanded))fail();expandedAttributes.add(expanded);
    if(ap==='xml'&&key==='space'&&['t','instrText'].includes(tag)&&['preserve','default'].includes(String(value)))continue;
    if(!parent&&uri==='http://schemas.openxmlformats.org/markup-compatibility/2006'&&key==='Ignorable')continue;
    if(!ap||uri!==WORD_NS||!attributes[tag]?.includes(key))fail();
    values[key]=String(value);
   }
   if(tag==='pStyle'){if(!values.val)fail();styles.add(values.val);}
   if(tag==='fldSimple'){
    if(field||simple||!isPage(values.instr||''))fail();
    simple=true;read(node[rawName] as Node[],tag,ns);simple=false;
   }else if(tag==='fldChar'){
    if(simple)fail();
    if(values.fldCharType==='begin'){if(field)fail();field={code:'',result:false};}
    else if(values.fldCharType==='separate'){const current=field;if(!current||current.result||!isPage(current.code))return fail();current.result=true;}
    else if(values.fldCharType==='end'){if(!field||!isPage(field.code))fail();field=null;}
    else fail();
    read(node[rawName] as Node[],tag,ns);
   }else if(tag==='instrText'){
    const current=field;if(!current||current.result||simple)return fail();current.code+=read(node[rawName] as Node[],tag,ns);
    if(current.code.length>64)fail();
   }else if(tag==='t'){
    const value=read(node[rawName] as Node[],tag,ns);
    if(simple||field?.result){if(!/^[0-9\s]*$/.test(value))fail();}
    else if(value.trim())fail();
   }else{
    read(node[rawName] as Node[],tag,ns);
    if(tag==='p'&&field)fail();
   }
  }
  return text;
 }
 read(tree,'',{});if(roots!==1||field||simple)fail();return styles;
}

// An apparently empty paragraph can inherit generated numbering text from a
// style. Check only decoration styles, their parents and paragraph defaults;
// unrelated body list styles remain supported. Nothing is rendered/evaluated.
type DecorationStyle={type:string;basedOn:string|null;numbered:boolean;isDefault:boolean};
function decorationStyles(xml:string){
 type Node=Record<string,unknown>;type Attributes=Record<string,string>;
 const styles=new Map<string,DecorationStyle>();let defaultNumbered=false,roots=0;
 const fail=():never=>{throw Error(DECORATION_ERROR);};
 function read(nodes:Node[],scope:Attributes,path:string[],current:DecorationStyle|null){
  for(const node of nodes)for(const rawName of Object.keys(node)){
   if(rawName===':@'||(rawName==='?xml'&&!path.length))continue;
   if(rawName==='#text'){if(String(node[rawName]).trim())fail();continue;}
   const attrs=(node[':@']||{}) as Attributes,ns={...scope};
   for(const key of Object.keys(attrs))if(key==='@_xmlns')ns['']=attrs[key];else if(key.startsWith('@_xmlns:'))ns[key.slice(8)]=attrs[key];
   const pieces=rawName.split(':'),local=pieces.pop()!,prefix=pieces.join(':');if(prefix&&!Object.hasOwn(ns,prefix))fail();
   const tag=ns[prefix]===WORD_NS?local:`{${ns[prefix]||''}}${local}`;
   if(!path.length&&(++roots!==1||tag!=='styles'))fail();
   if(path.length===1&&!['docDefaults','latentStyles','style'].includes(tag))fail();
   if(tag==='{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent')fail();
   const values:Attributes={},expanded=new Set<string>();
   for(const [raw,value] of Object.entries(attrs)){
    if(raw==='@_xmlns'||raw.startsWith('@_xmlns:'))continue;
    const parts=raw.slice(2).split(':'),key=parts.pop()!,ap=parts.join(':'),uri=ap==='xml'?'http://www.w3.org/XML/1998/namespace':ns[ap];
    if(ap&&!uri)fail();const identity=`${uri||''}:${key}`;if(expanded.has(identity))fail();expanded.add(identity);
    if(uri==='http://schemas.openxmlformats.org/markup-compatibility/2006'&&key!=='Ignorable')fail();
    if(ap&&uri===WORD_NS)values[key]=value;
   }
   const here=[...path,tag],full=here.join('/');let style=current;
   if(full==='styles/style'){
    if(!values.styleId||styles.has(values.styleId))fail();
    if(values.default!==undefined&&!['0','false','off','1','true','on'].includes(values.default))fail();
    style={type:values.type||'',basedOn:null,numbered:false,isDefault:['1','true','on'].includes(values.default)};styles.set(values.styleId,style);
   }
   if(style&&full==='styles/style/basedOn'){if(style.basedOn!==null||!values.val)fail();style.basedOn=values.val;}
   if(style&&tag==='numPr')style.numbered=true;
   if(tag==='numPr'&&full.startsWith('styles/docDefaults/'))defaultNumbered=true;
   read(node[rawName] as Node[],ns,here,style);
  }
 }
 read(xmlTree(xml,true,false) as Node[],{},[],null);if(roots!==1)fail();return {styles,defaultNumbered};
}
function assertDecorationStyles(required:Set<string>,primary:ReturnType<typeof decorationStyles>|null,effects:ReturnType<typeof decorationStyles>|null){
 const fail=():never=>{throw Error(DECORATION_ERROR);};
 if(!primary){if(required.size||effects)fail();return;}
 for(const view of [primary,effects?{styles:new Map([...primary.styles,...effects.styles]),defaultNumbered:primary.defaultNumbered||effects.defaultNumbered}:null]){
  if(!view)continue;if(view.defaultNumbered)fail();
  const wanted=new Set([...required,...[...view.styles].filter(([id,style])=>style.type==='paragraph'&&(style.isDefault||id==='Normal')).map(([id])=>id)]);
  for(const id of wanted){const visited=new Set<string>();let at:string|null=id;
   while(at!==null){if(visited.has(at))fail();visited.add(at);const style=view.styles.get(at);if(!style||style.type!=='paragraph'||style.numbered)return fail();at=style.basedOn;}
  }
 }
}
export function parseArticle(bytes:Uint8Array,filename:string,allowImages=false){let paragraphs:string[]=[];
if(/\.txt$/i.test(filename)){const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);paragraphs=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');}
else if(/\.docx$/i.test(filename)){
 if(bytes[0]!==80||bytes[1]!==75)throw Error('不是有效的Word文档');
 let count=0,total=0,failure:Error|null=null;const names=new Set<string>(),selected=new Map<string,{chunks:Uint8Array[],size:number,done:boolean}>();
 const unzip=new Unzip(f=>{if(++count>2000||names.has(f.name)||f.name.startsWith('/')||f.name.includes('\\')||f.name.split('/').includes('..'))throw Error('文档结构无效');names.add(f.name);if(activeContent(f.name)||/word\/(?:footnotes|endnotes|embeddings)/i.test(f.name)||(/word\/(?:header|footer)/i.test(f.name)&&!decorationName(f.name)))throw Error(DECORATION_ERROR);
  if(f.name!=='word/document.xml'&&f.name!=='[Content_Types].xml'&&!f.name.endsWith('.rels')&&!decorationName(f.name)&&!stylePart(f.name))return;
  if(selected.size>=40)throw Error('文档关系过于复杂');const max=f.name==='word/document.xml'||stylePart(f.name)?2_000_000:128_000;if((f.originalSize||0)>max)throw Error('正文或关系文件过大');const part={chunks:[] as Uint8Array[],size:0,done:false};selected.set(f.name,part);
  f.ondata=(err,data,final)=>{if(err){failure=err;f.terminate();return;}part.size+=data.length;total+=data.length;if(part.size>max||total>3_000_000){failure=Error('正文或关系文件过大');f.terminate();return;}part.chunks.push(data);if(final)part.done=true;};f.start();});unzip.register(UnzipInflate);
 for(let i=0;i<bytes.length;i+=16384){unzip.push(bytes.subarray(i,i+16384),i+16384>=bytes.length);if(failure)throw failure;}
 function text(name:string){const p=selected.get(name);if(!p?.done)throw Error('缺少完整Word结构');const all=new Uint8Array(p.size);let at=0;for(const c of p.chunks){all.set(c,at);at+=c.length;}return new TextDecoder('utf-8',{fatal:true}).decode(all);}
 const types=packageTree(text('[Content_Types].xml'),'Types');if(!array(types.Types?.Override).some((x:any)=>x['@_PartName']==='/word/document.xml'&&x['@_ContentType']===MAIN))throw Error('缺少Word正文类型声明');
 const hasDecoration=[...selected.keys()].some(name=>decorationName(name));const requiredStyles=new Set<string>();
 for(const item of [...array(types.Types?.Override),...array(types.Types?.Default)]){
  const type=String(item['@_ContentType']||'');if(activeContent(type)||/wordprocessingml\.(?:footnotes|endnotes)\+xml/i.test(type))throw Error(DECORATION_ERROR);
  if(/wordprocessingml\.(?:header|footer)\+xml$/.test(type)&&!decorationName(String(item['@_PartName']||'').slice(1)))throw Error(DECORATION_ERROR);
  if(hasDecoration&&/(?:wordprocessingml\.styles|ms-word\.stylesWithEffects)\+xml$/.test(type)&&!stylePart(String(item['@_PartName']||'').slice(1)))throw Error(DECORATION_ERROR);
 }
 for(const name of selected.keys()){const kind=decorationName(name);if(!kind)continue;
  const declarations=array(types.Types?.Override).filter((x:Record<string,string>)=>x['@_PartName']==='/'+name);
  if(declarations.length!==1||declarations[0]['@_ContentType']!==`application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml`)throw Error(DECORATION_ERROR);
  for(const style of assertPageDecoration(text(name),kind))requiredStyles.add(style);
 }
 if(hasDecoration)assertDecorationStyles(requiredStyles,selected.has('word/styles.xml')?decorationStyles(text('word/styles.xml')):null,selected.has('word/stylesWithEffects.xml')?decorationStyles(text('word/stylesWithEffects.xml')):null);
 let rootMain=false;const documentRels=new Set<string>();
 for(const name of selected.keys()){if(!name.endsWith('.rels'))continue;const parsed=packageTree(text(name),'Relationships');if(!parsed.Relationships)throw Error('文档关系无效');const source=name==='_rels/.rels'?'':name.replace(/(^|\/)\_rels\//,'$1').replace(/\.rels$/,'');const base='https://package.invalid/'+(source.includes('/')?source.slice(0,source.lastIndexOf('/')+1):'');const ids=new Set<string>();
  for(const r of array(parsed.Relationships.Relationship)){const id=r['@_Id'],target=r['@_Target'],type=r['@_Type'];if(typeof id!=='string'||ids.has(id)||typeof target!=='string'||typeof type!=='string')throw Error('文档关系无效');if(activeContent(type)||/\/(?:footnotes|endnotes)$/.test(type)||decorationName(source))throw Error(DECORATION_ERROR);ids.add(id);if(name==='word/_rels/document.xml.rels')documentRels.add(id);
   if(r['@_TargetMode']==='External'){if(!type.endsWith('/hyperlink'))throw Error('不支持外部图片或嵌入内容');continue;}
   const resolved=new URL(target,base);if(resolved.origin!=='https://package.invalid'||resolved.search||resolved.hash||!names.has(decodeURIComponent(resolved.pathname.slice(1))))throw Error('文档内部关系目标缺失');if(/\/(header|footer)$/.test(type)&&decorationName(decodeURIComponent(resolved.pathname.slice(1)))!==type.split('/').pop())throw Error(DECORATION_ERROR);if(hasDecoration&&/\/(styles|stylesWithEffects)$/.test(type)&&!stylePart(decodeURIComponent(resolved.pathname.slice(1))))throw Error(DECORATION_ERROR);if(name==='_rels/.rels'&&type.endsWith('/officeDocument')&&resolved.pathname==='/word/document.xml')rootMain=true;
  }
 }
 if(!rootMain)throw Error('缺少主文档关系');if(!allowImages&&[...names].some(n=>n.startsWith('word/media/')))throw Error('当前只接收纯正文Word，请移除原图后上传');
 const xml=text('word/document.xml');if(!xml.includes('http://schemas.openxmlformats.org/wordprocessingml/2006/main'))throw Error('不支持此Word命名空间');const tree=xmlTree(xml,true);const doc=tree.find((n:any)=>n.document)?.document;const body=doc?.find((n:any)=>n.body)?.body;if(!body)throw Error('缺少Word正文');
 function check(nodes:any[]){for(const n of nodes||[])for(const k of Object.keys(n)){if(['tbl','txbxContent','altChunk','ins','del','moveFrom','moveTo','footnoteReference','endnoteReference','fldSimple','instrText'].includes(k))throw Error('暂不支持表格、文本框、修订或动态域，请上传纯正文');if(!allowImages&&['drawing','pict','object'].includes(k))throw Error('当前只接收纯正文Word，请移除原图后上传');for(const ref of ['@_embed','@_link'])if(n[':@']?.[ref]&&!documentRels.has(n[':@'][ref]))throw Error('图片关系缺失');if(k!==':@'&&Array.isArray(n[k]))check(n[k]);}}check(body);
 function texts(nodes:any[]):string{let out='';for(const n of nodes||[])for(const k of Object.keys(n)){if(k==='t')out+=(n[k]||[]).map((x:any)=>String(x['#text']??'')).join('');else if(k==='tab')out+='\t';else if(k==='br'||k==='cr')out+='\n';else if(k!==':@'&&Array.isArray(n[k]))out+=texts(n[k]);}return out;}
 function walk(nodes:any[]){for(const n of nodes||[])for(const k of Object.keys(n)){if(k==='p'){paragraphs.push(texts(n[k]));if(paragraphs.length>5000)throw Error('段落过多');}else if(k!==':@'&&Array.isArray(n[k]))walk(n[k]);}}walk(body);
}else throw Error('请上传DOCX或UTF-8 TXT');
if(!paragraphs.some(p=>p.trim()))throw Error('没有找到正文');if(paragraphs.join('\n').length>MAX_TEXT)throw Error('文章超过10万字上限');return paragraphs;}

export function assertOriginalText(source:string[],output:string[]){const normalize=(ps:string[])=>ps.map(p=>p.replace(/\s/g,'')).filter(Boolean);if(JSON.stringify(normalize(source))!==JSON.stringify(normalize(output)))throw Error('成稿文字与原文不一致，请保留标题、正文和段落顺序');}
