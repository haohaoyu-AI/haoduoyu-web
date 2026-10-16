import type {ArtifactManifest} from './article-manifest';

type InspectedUploadWord={text:string[];images:{sha256:string;after_paragraph:number}[]};
const digest=/^[a-f0-9]{64}$/;
const receiptFields=['original_sha256','layout_sha256','word_sha256','image_count','verified_at'];
const imageFields=['sha256','source_url','source_title','after_paragraph'];
const hash=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
function dataObject(value:unknown):value is Record<string,unknown>{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor=>!descriptor.get&&!descriptor.set);
}
function exactFields(value:Record<string,unknown>,fields:string[]){return Object.keys(value).length===fields.length&&fields.every(field=>Object.hasOwn(value,field));}
function checkedDate(value:unknown){return typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()+60000;}
function sourceUrl(value:unknown){
 if(typeof value!=='string'||value.length>2048)return false;
 const url=new URL(value);
 return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.hash&&url.href===value
  &&![...url.searchParams.keys()].some(key=>/^(?:token|access_token|api_key|apikey|secret|authorization|signature|sig|x-amz-(?:credential|signature|security-token|algorithm)|x-goog-(?:credential|signature|algorithm))$/i.test(key));
}

// Call only after reading the actual Word and verifying its whole-file SHA/size.
// verification must be the server-owned finalize receipt from that exact output,
// never an executor/caller-supplied receipt. Owner/artifact/lease CAS remains with
// the upload operation. Missing historical evidence requires full inspection.
export async function reuseVerifiedUploadWord(manifest:ArtifactManifest|null,original:string[],wordSha:string,verification:unknown):Promise<InspectedUploadWord|null>{
 try{
  if(!dataObject(manifest)||manifest.contract_version!==1||manifest.output_mode!==undefined
   ||!Array.isArray(original)||!original.length||original.some(paragraph=>typeof paragraph!=='string')
   ||!digest.test(wordSha)||!dataObject(verification)||!exactFields(verification,receiptFields)
   ||!checkedDate(verification.verified_at)||!digest.test(String(manifest.original_sha256)))return null;
  const source=original.slice(),text=source.filter(paragraph=>paragraph.trim());
  if(!text.length)return null;
  const layout=manifest.layout;
  if(!dataObject(layout)||!exactFields(layout,['images','sha256','recorded_at'])||!checkedDate(layout.recorded_at)
   ||typeof layout.sha256!=='string'||!digest.test(layout.sha256)||!Array.isArray(layout.images)
   ||layout.images.length<1||layout.images.length>30)return null;
  const layoutJson=JSON.stringify(layout.images),originalSha=manifest.original_sha256,layoutSha=layout.sha256;
  let previous=-1;
  const images:{sha256:string;after_paragraph:number}[]=[];
  for(const image of layout.images){
   if(!dataObject(image)||!exactFields(image,imageFields)||typeof image.sha256!=='string'||!digest.test(image.sha256)
    ||typeof image.source_title!=='string'||!image.source_title.trim()||image.source_title.length>300||!sourceUrl(image.source_url)
    ||!Number.isSafeInteger(image.after_paragraph)||typeof image.after_paragraph!=='number'||image.after_paragraph<previous
    ||image.after_paragraph<0||image.after_paragraph>=text.length)return null;
   previous=image.after_paragraph;images.push({sha256:image.sha256,after_paragraph:image.after_paragraph});
  }
  if(verification.word_sha256!==wordSha||verification.original_sha256!==originalSha||verification.layout_sha256!==layoutSha
   ||!Number.isSafeInteger(verification.image_count)||verification.image_count!==images.length)return null;
  const [sourceSha,actualLayoutSha]=await Promise.all([hash(JSON.stringify(source)),hash(layoutJson)]);
  if(sourceSha!==originalSha||actualLayoutSha!==layoutSha)return null;
  return {text,images};
 }catch{return null;}
}
