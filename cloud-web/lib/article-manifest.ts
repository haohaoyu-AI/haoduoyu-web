import {assertRasterImage} from './image-integrity';
import {Unzip,UnzipInflate} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {hashText,publicSourceUrl,type WritingInputSnapshot,type EvidenceSource} from './writing-input';
import {MAX_FILE,parseArticle,assertOriginalText} from './article-format';

export type PlannedImage={sha256:string;source_url:string;source_title:string;after_paragraph:number};
export type ArtifactManifest={contract_version:1;output_mode?:'text_only';author:string;input_sha256:string;prompt_sha256:string;original_sha256:string;sources_sha256:string;sources:EvidenceSource[];frozen_at:string;layout:null|{images:PlannedImage[];sha256:string;recorded_at:string}};
type ReadbackImage={reference_sha256:string;observed_url:string;after_paragraph:number};
export type DraftReadback={verification_method:'agent_readback';word_sha256:string;title:string;paragraphs:string[];images:ReadbackImage[];read_at:string;verified_at:string;original_sha256:string;layout_sha256:string};
const digest=(bytes:Uint8Array)=>crypto.subtle.digest('SHA-256',bytes as BufferSource).then(value=>Array.from(new Uint8Array(value)).map(x=>x.toString(16).padStart(2,'0')).join(''));
export async function makeArtifactManifest(input:WritingInputSnapshot,title:string,paragraphs:string[],sources:EvidenceSource[]):Promise<ArtifactManifest>{
 if(input.state!=='ready'||!input.input_sha256)throw Error('待补材料：先冻结完整写作资料');
 return {contract_version:1,author:input.writer,input_sha256:input.input_sha256,prompt_sha256:input.prompt_sha256,original_sha256:await hashText(JSON.stringify([title,...paragraphs])),sources_sha256:await hashText(JSON.stringify(sources)),sources,frozen_at:new Date().toISOString(),layout:null};
}
export function parseArtifactManifest(raw:unknown):ArtifactManifest|null{
 if(!raw)return null;try{const value=JSON.parse(String(raw));if(value.contract_version===1)return value;}catch{}throw Error('交付记录待核验，请只读取已有结果');
}
export async function planArticleImages(manifest:ArtifactManifest,value:unknown,paragraphCount:number){
 if(manifest.output_mode==='text_only')throw Error('文字稿已完成，不进入配图、Word或平台草稿流程');
 if(!Array.isArray(value)||value.length<1||value.length>30)throw Error('待补配图：需记录实际使用的图片及顺序');
 let previous=-1;const images:PlannedImage[]=value.map(image=>{
  if(!image||typeof image!=='object'||typeof image.sha256!=='string'||! /^[a-f0-9]{64}$/.test(image.sha256)||typeof image.source_title!=='string'||!image.source_title.trim()||image.source_title.length>300||!Number.isSafeInteger(image.after_paragraph)||image.after_paragraph<0||image.after_paragraph>=paragraphCount||image.after_paragraph<previous)throw Error('图片来源或位置格式无效');
  previous=image.after_paragraph;return {sha256:image.sha256,source_url:publicSourceUrl(image.source_url),source_title:image.source_title,after_paragraph:image.after_paragraph};
 });
 const layout={images,sha256:await hashText(JSON.stringify(images)),recorded_at:new Date().toISOString()};
 if(manifest.layout){if(manifest.layout.sha256!==layout.sha256)throw Error('图片清单已冻结，不能替换或重排');return manifest;}
 return {...manifest,layout};
}
function parseXml(value:string,ordered=false){if(/<!DOCTYPE|<!ENTITY/i.test(value)||XMLValidator.validate(value)!==true)throw Error('Word图片结构无效');return new XMLParser({preserveOrder:ordered,ignoreAttributes:false,removeNSPrefix:true,trimValues:false,processEntities:true,parseTagValue:false,parseAttributeValue:false}).parse(value);}
// Bounded independent inspection of actual embedded bytes and document-order anchors.
export async function inspectWordImages(bytes:Uint8Array){
 const parts=new Map<string,Uint8Array>();let total=0,failure:Error|null=null;
 const unzip=new Unzip(file=>{
  if(!['word/document.xml','word/_rels/document.xml.rels'].includes(file.name)&&!file.name.startsWith('word/media/'))return;
  if(parts.size>=80)throw Error('Word图片数量过多');const chunks:Uint8Array[]=[];let size=0;
  file.ondata=(error,data,final)=>{if(error){failure=error;file.terminate();return;}size+=data.length;total+=data.length;if(total>MAX_FILE){failure=Error('Word图片数据过大');file.terminate();return;}chunks.push(data);if(final){const value=new Uint8Array(size);let offset=0;for(const chunk of chunks){value.set(chunk,offset);offset+=chunk.length;}parts.set(file.name,value);}};file.start();
 });unzip.register(UnzipInflate);
 for(let i=0;i<bytes.length;i+=16384){unzip.push(bytes.subarray(i,i+16384),i+16384>=bytes.length);if(failure)throw failure;}
 const decoder=new TextDecoder('utf-8',{fatal:true}),rels=parts.get('word/_rels/document.xml.rels');
 const relationship=rels?parseXml(decoder.decode(rels)).Relationships?.Relationship:[];
 const entries=Array.isArray(relationship)?relationship:relationship?[relationship]:[];const images=new Map<string,string>();
 for(const entry of entries){if(typeof entry['@_Type']==='string'&&entry['@_Type'].endsWith('/image')){
  if(entry['@_TargetMode']==='External')throw Error('Word图片必须嵌入文件');const path=decodeURIComponent(new URL(entry['@_Target'],'https://package.invalid/word/').pathname.slice(1));if(!path.startsWith('word/media/')||!parts.has(path))throw Error('Word图片关系缺失');images.set(entry['@_Id'],path);
 }}
 const xml=parts.get('word/document.xml');if(!xml)throw Error('Word正文缺失');const tree=parseXml(decoder.decode(xml),true);const doc=tree.find((node:Record<string,unknown>)=>node.document)?.document;const body=doc?.find((node:Record<string,unknown>)=>node.body)?.body;if(!body)throw Error('Word正文缺失');
 let paragraph=-1;const found:{path:string;after_paragraph:number}[]=[];
 type XmlNode=Record<string,unknown>&{':@'?:Record<string,string>};
 function inspect(nodes:XmlNode[],path:string[]=[]){let text='',refs:string[]=[];for(const node of nodes||[])for(const key of Object.keys(node)){
  if(key==='t')text+=((node[key]||[]) as XmlNode[]).map((item:XmlNode)=>String(item['#text']??'')).join('');
  if(key==='AlternateContent')throw Error('Word图片需使用标准嵌入格式');
  if(key==='anchor')throw Error('Word图片必须使用独立行内图片，不能浮动定位');
  if(key==='pict'||key==='object')throw Error('Word图片需使用标准嵌入格式');
  if(key==='blip'){if(path.slice(-6).join('/')!=='drawing/inline/graphic/graphicData/pic/blipFill')throw Error('Word图片需使用标准嵌入格式');const ref=node[':@']?.['@_embed'];if(typeof ref!=='string'||!images.has(ref)||node[':@']?.['@_link'])throw Error('Word图片引用缺失');refs.push(ref);}
  if(key!==':@'&&Array.isArray(node[key])){const nested=inspect(node[key] as XmlNode[],[...path,key]);text+=nested.text;refs=refs.concat(nested.refs);}
 }return {text,refs};}
 function walk(nodes:XmlNode[]){for(const node of nodes||[])for(const key of Object.keys(node)){if(key==='p'){const detail=inspect(node[key] as XmlNode[]);if(detail.text.trim()){paragraph++;if(detail.refs.length)throw Error('图片应独立成段，正文保持原样');}for(const ref of detail.refs){if(paragraph<0)throw Error('图片不能位于标题之前');found.push({path:images.get(ref)!,after_paragraph:paragraph});}}else if(key!==':@'&&Array.isArray(node[key]))walk(node[key] as XmlNode[]);}}walk(body);
 return Promise.all(found.map(async image=>{const bytes=parts.get(image.path)!;assertRasterImage(bytes);return {sha256:await digest(bytes),after_paragraph:image.after_paragraph};}));
}
async function assertManifestSource(manifest:ArtifactManifest,source:string[]){
 if(manifest.output_mode==='text_only')throw Error('文字稿已完成，不进入配图、Word或平台草稿流程');
 if(!manifest.layout)throw Error('待补配图：请先记录图片来源和顺序');
 if(await hashText(JSON.stringify(source))!==manifest.original_sha256)throw Error('冻结正文校验未通过');
}
function assertManifestText(source:string[],output:string[]){
 if(JSON.stringify(source.filter(paragraph=>paragraph.trim()))!==JSON.stringify(output.filter(paragraph=>paragraph.trim())))throw Error('成稿文字与冻结原文不一致');
}
function checkedManifestReceipt(manifest:ArtifactManifest,images:Awaited<ReturnType<typeof inspectWordImages>>,wordSha:string){
 const expected=manifest.layout!.images.map(({sha256,after_paragraph})=>({sha256,after_paragraph}));
 if(JSON.stringify(images)!==JSON.stringify(expected))throw Error('Word配图缺失、顺序或位置与冻结清单不一致');
 return {original_sha256:manifest.original_sha256,layout_sha256:manifest.layout!.sha256,word_sha256:wordSha,image_count:images.length,verified_at:new Date().toISOString()};
}
export async function verifyWordManifest(manifest:ArtifactManifest,source:string[],bytes:Uint8Array,wordSha:string){
 await assertManifestSource(manifest,source);
 const output=parseArticle(bytes,'result.docx',true);
 assertManifestText(source,output);
 return checkedManifestReceipt(manifest,await inspectWordImages(bytes),wordSha);
}
// This inspector derives both results from the same actual bytes in this call.
// No caller-supplied parsing results or cross-request inspection cache exist.
export async function inspectUploadWord(manifest:ArtifactManifest|null,original:string[],bytes:Uint8Array,wordSha:string){
 const parsed=parseArticle(bytes,'checked.docx',true);
 let source=original;
 if(!source.length){
  if(!manifest)throw Error('Historical text was cleaned without a frozen digest; read existing results only');
  source=parsed.filter(paragraph=>paragraph.trim());
 }
 assertOriginalText(source,parsed);
 if(manifest){await assertManifestSource(manifest,source);assertManifestText(source,parsed);}
 const images=await inspectWordImages(bytes);
 if(manifest)checkedManifestReceipt(manifest,images,wordSha);
 return {text:(manifest?source:parsed).filter(paragraph=>paragraph.trim()),images};
}
export async function verifyDraftReadback(manifest:ArtifactManifest,original:string[],wordSha:string,value:unknown):Promise<DraftReadback>{
 if(manifest.output_mode==='text_only')throw Error('文字稿已完成，不进入配图、Word或平台草稿流程');
 const read=value as Partial<DraftReadback>|null;
 if(!manifest.layout||!read||read.verification_method!=='agent_readback'||read.word_sha256!==wordSha||typeof read.title!=='string'||!Array.isArray(read.paragraphs)||read.paragraphs.some(p=>typeof p!=='string')||!Array.isArray(read.images)||read.images.length!==manifest.layout.images.length||typeof read.read_at!=='string'||!Number.isFinite(Date.parse(read.read_at))||Date.parse(read.read_at)>Date.now()+60000||Date.parse(read.read_at)<Date.now()-24*3600000)throw Error('私人草稿读回证据不完整，请核对已有草稿');
 const actual=[read.title,...read.paragraphs];
 // Authorized cleanup may remove extracted text, but never the immutable frozen digest.
 // The fresh platform readback must still match that digest exactly.
 if((original.length>0&&JSON.stringify(actual)!==JSON.stringify(original))||await hashText(JSON.stringify(actual))!==manifest.original_sha256)throw Error('私人草稿正文与冻结原文不一致');
 const images=read.images.map((image,index)=>{
  const planned=manifest.layout!.images[index];if(!image||image.reference_sha256!==planned.sha256||image.after_paragraph!==planned.after_paragraph)throw Error('私人草稿配图缺失、顺序或位置不一致');
  return {reference_sha256:image.reference_sha256,observed_url:publicSourceUrl(image.observed_url),after_paragraph:image.after_paragraph};
 });
 return {verification_method:'agent_readback',word_sha256:wordSha,title:read.title,paragraphs:read.paragraphs,images,read_at:read.read_at,verified_at:new Date().toISOString(),original_sha256:manifest.original_sha256,layout_sha256:manifest.layout.sha256};
}
export const plannedImagesSchema={type:'array',minItems:1,maxItems:30,items:{type:'object',properties:{sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},source_url:{type:'string',maxLength:2048},source_title:{type:'string',maxLength:300},after_paragraph:{type:'integer',minimum:0}},required:['sha256','source_url','source_title','after_paragraph'],additionalProperties:false}};
export const draftReadbackSchema={type:'object',properties:{verification_method:{type:'string',const:'agent_readback'},word_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},title:{type:'string',maxLength:120},paragraphs:{type:'array',maxItems:160,items:{type:'string',maxLength:1000}},images:{type:'array',maxItems:30,items:{type:'object',properties:{reference_sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},observed_url:{type:'string',maxLength:2048},after_paragraph:{type:'integer',minimum:0}},required:['reference_sha256','observed_url','after_paragraph'],additionalProperties:false}},read_at:{type:'string',maxLength:40}},required:['verification_method','word_sha256','title','paragraphs','images','read_at'],additionalProperties:false};
