// Preserve provider output except for one exact structural duplicate: a first
// body paragraph that is byte-for-byte equal to the separate title field.
// Never fuzzy-match or remove a title mention elsewhere in the body.
export function parseClaudeArticle(raw:string){
 const s=raw.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
 let data:any;let repair:string|null=null;
 try{data=JSON.parse(s);}catch(original){
  if(!s.endsWith('}')||s.endsWith(']}'))throw original;
  try{data=JSON.parse(s.slice(0,-1)+']}');repair='missing_final_paragraphs_array_bracket';}catch{throw original;}
 }
 if(!data||typeof data!=='object'||typeof data.title!=='string'||!Array.isArray(data.paragraphs)||data.paragraphs.some((p:any)=>typeof p!=='string'))throw Error('Claude结果不是标题和段落JSON');
 if(repair&&Object.keys(data).some(k=>!['title','paragraphs'].includes(k)))throw Error('不支持修复复杂JSON');
 const removedTitleDuplicate=!!data.title&&data.paragraphs.length>0&&data.paragraphs[0]===data.title;
 const article=removedTitleDuplicate?{...data,paragraphs:data.paragraphs.slice(1)}:data;
 return {article,repair,removedTitleDuplicate};
}
