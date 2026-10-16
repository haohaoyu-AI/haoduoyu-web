import {parseEditorialJSONForFormat,parseEditorialArtifact,editorialErrors,type EditorialContext,type Outline} from './editorial-contract';
import {hashText} from './writing-input';

export const outlineFormatKind='claude_provider_outline_format_v1';
const invalid=()=>{throw Error(editorialErrors.invalid);};
const proseKeys=new Set(['title','core_argument','hook','background','heading','argument','turn','ending','claim','missing_evidence']);

/** No grammar guessing: only quotes that cannot terminate a JSON string on a
 * single known prose-property line may be escaped. Structural-looking boundaries
 * fail closed. Everything else, including whitespace/fences, stays byte-for-byte.
 */
function escapeForcedQuotes(source:string){
 if(source.length>400000)invalid();
 const offsets:number[]=[];let start=0;
 for(const line of source.split('\n')){
  const match=/^[ \t]*"([a-z_]+)"[ \t]*:[ \t]*("[^\r\n]*")[ \t]*,?[ \t]*\r?$/.exec(line);
  if(match&&proseKeys.has(match[1])){
   const token=match[2],tokenAt=line.indexOf(token,line.indexOf(':')+1);
   try{JSON.parse(token);}catch{
    const forced:number[]=[];
    for(let i=1;i<token.length-1;i++)if(token[i]==='"'){
     let slashes=0;for(let at=i-1;at>=0&&token[at]==='\\';at--)slashes++;
     if(slashes%2)continue;
     const before=token.slice(1,i).trimEnd().at(-1),after=token.slice(i+1,-1).trimStart()[0];
     // A quote adjacent to JSON punctuation/another quote or at the end of
     // an unfinished string admits a structural interpretation: never repair.
     if(!before||!after||/[,:{}\[\]"]/.test(before)||/[,:{}\[\]"]/.test(after))invalid();
     forced.push(start+tokenAt+i);
    }
    if(!forced.length||forced.length%2)invalid();offsets.push(...forced);
   }
  }
  start+=line.length+1;
 }
 let escaped='',at=0;for(const offset of offsets){escaped+=source.slice(at,offset)+'\\';at=offset;}escaped+=source.slice(at);
 return {escaped,offsets};
}

export async function deriveOutlineFormat(source:string,context:EditorialContext){
 const {escaped,offsets}=escapeForcedQuotes(source),value=parseEditorialJSONForFormat(escaped);
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 const raw=value as Record<string,unknown>,opening=raw.opening;let serializedOpening=false;
 if(opening&&typeof opening==='object'&&!Array.isArray(opening)){
  const o=opening as Record<string,unknown>;
  if(Object.keys(o).length!==3||!['hook','background','chars_limit'].every(key=>Object.hasOwn(o,key))||typeof o.hook!=='string'||!o.hook.trim()||typeof o.background!=='string'||!o.background.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(o.hook+o.background)||!Number.isSafeInteger(o.chars_limit)||Number(o.chars_limit)<1||Number(o.chars_limit)>3000)invalid();
  // JSON text in the string preserves both original prose fields and the numeric
  // instruction. Concatenation would lose field names/limit and is forbidden.
  raw.opening=JSON.stringify(opening);serializedOpening=true;
 }
 if(!offsets.length&&!serializedOpening)invalid();
 const artifact=parseEditorialArtifact('outline',JSON.stringify(raw),context) as Outline;
 const actions=[...(offsets.length?[{type:'escape_inline_quotes',offset_unit:'utf16_code_units',offsets}]:[]),...(serializedOpening?[{type:'serialize_opening_object',path:'$.opening',fields:['hook','background','chars_limit']}]:[])];
 const proof={kind:outlineFormatKind,version:1,source_text_sha256:await hashText(source),escaped_text_sha256:await hashText(escaped),artifact_sha256:await hashText(JSON.stringify(artifact)),actions};
 return {artifact,proof};
}
