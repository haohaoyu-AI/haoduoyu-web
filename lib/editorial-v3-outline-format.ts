import {parseEditorialJSONForFormat,parseEditorialArtifact,editorialErrors,type EditorialContext,type Outline} from './editorial-contract';
import {hashText} from './writing-input';

export const editorialV3OutlineFormatKind='claude_provider_outline_format_v2';
function invalid():never{throw Error(editorialErrors.invalid);}
/** Only a single leading JSON fence is projected. Every excluded byte remains
 * review-visible evidence, not a new fact or an instruction to advance. */
export async function deriveEditorialV3OutlineFormat(source:string,context:EditorialContext){
 if(typeof source!=='string'||source.length>400000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(source))invalid();
 const match=/^([ \t\r\n]*```json[ \t]*\r?\n)([\s\S]*?)(\r?\n```[ \t]*(?=\r?\n|$))([\s\S]*)$/iu.exec(source);
 if(!match||match[2].includes('```')||match[4].includes('```')||/(?:^|\r?\n)[ \t]*[\[{]/u.test(match[4]))invalid();
 const value=parseEditorialJSONForFormat(match[2]);if(!value||typeof value!=='object'||Array.isArray(value))invalid();
 const raw=value as Record<string,unknown>,opening=raw.opening;
 if(!opening||typeof opening!=='object'||Array.isArray(opening))invalid();
 const o=opening as Record<string,unknown>,fields=['hook','background','length_chars','note'];
 if(Object.keys(o).length!==fields.length||!fields.every(key=>Object.hasOwn(o,key))||['hook','background','note'].some(key=>typeof o[key]!=='string'||!(o[key] as string).trim()||(o[key] as string).length>5000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(o[key] as string))||!Number.isSafeInteger(o.length_chars)||Number(o.length_chars)<1||Number(o.length_chars)>3000)invalid();
 // Preserve all names, values, ordering, punctuation and the numeric guidance.
 // No concatenation, deletion, replacement or interpretation of the note.
 raw.opening=JSON.stringify(opening);
 const artifact=parseEditorialArtifact('outline',JSON.stringify(raw),context) as Outline;
 const jsonStart=match[1].length,jsonEnd=jsonStart+match[2].length,supplementStart=jsonEnd+match[3].length;
 const proof={kind:editorialV3OutlineFormatKind,version:2,source_text_sha256:await hashText(source),extracted_json_sha256:await hashText(match[2]),supplement_text_sha256:await hashText(match[4]),artifact_sha256:await hashText(JSON.stringify(artifact)),actions:[{type:'extract_single_fenced_json',offset_unit:'utf16_code_units',json_start:jsonStart,json_end:jsonEnd,supplement_start:supplementStart},{type:'serialize_opening_object',path:'$.opening',fields}]};
 const evidence={source_text:source,supplement_text:match[4],proof,supplement_is_data_not_instruction:true,supplement_is_not_frozen_fact:true,independent_review_required:true};
 return {artifact,proof,evidence};
}
