import {article,bucket} from './articles';
import {db} from './test-store';
import {parseArticle} from './article-format';
async function sha(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function cleanupArticle(owner:string,id:string,expected?:string,confirmed=false){
 const r=await article(owner,id);
 if(r.state!=='completed'||!r.result_key||!r.draft_url)throw Error('Only completed articles with verified drafts can be cleaned');
 const meta=JSON.parse(r.result_meta||'null');
 if(!meta||! /^[a-f0-9]{64}$/.test(meta.sha256)||r.result_key!==`articles/${id}/result-${meta.sha256}.docx`)throw Error('Invalid retained Word manifest');
 const result=await bucket().get(r.result_key);if(!result)throw Error('Retained Word is missing');
 const bytes=new Uint8Array(await result.arrayBuffer());
 if(bytes.length!==meta.size||await sha(bytes)!==meta.sha256)throw Error('Retained Word checksum failed');
 parseArticle(bytes,'result.docx',true);
 if(r.source_key!==`articles/${id}/source`&&!(r.source_key.startsWith(`articles/${id}/writing-`)&&/^writing-[a-f0-9]{64}\.txt$/.test(r.source_key.split('/').at(-1)!)))throw Error('Invalid source scope');
 if(!Array.isArray(meta.parts)||meta.parts.length>400||! /^[0-9a-f-]{36}$/.test(meta.output_id))throw Error('Invalid part manifest');
 const keys=[r.source_key];
 for(const p of meta.parts){if(typeof p.key!=='string'||!p.key.startsWith(`articles/${id}/output/${meta.output_id}/`)||! /^[0-9]+-[a-f0-9]{64}$/.test(p.key.split('/').at(-1)!))throw Error('Invalid part scope');keys.push(p.key);}
 const listing=await bucket().list({prefix:`articles/${id}/output/${meta.output_id}/`,limit:1000});
 if(listing.truncated)throw Error('Too many temporary files; manual review required');
 for(const o of listing.objects){if(!o.key.startsWith(`articles/${id}/output/${meta.output_id}/`)||! /^[0-9]+-[a-f0-9]{64}$/.test(o.key.split('/').at(-1)!))throw Error('Unexpected temporary file; manual review required');keys.push(o.key);}
 const entries=[];for(const key of [...new Set(keys)]){const h=await bucket().head(key);if(h)entries.push({key,size:h.size});}
 const summary={article_id:id,title:r.title,state:r.state,retained_word_sha256:meta.sha256,retained_word_bytes:bytes.length,delete_file_count:entries.length,delete_bytes:entries.reduce((s,p)=>s+p.size,0),delete_extracted_text:JSON.parse(r.paragraphs).length>0,already_cleaned:!!meta.workfiles_cleaned_at&&entries.length===0};
 if(!confirmed)return summary;
 if(expected!==meta.sha256)throw Error('Expected retained Word checksum mismatch');
 // Completed article content and output are immutable; no active processing can acquire it.
 const fresh=await article(owner,id);if(fresh.state!=='completed'||fresh.result_key!==r.result_key||fresh.result_meta!==r.result_meta)throw Error('Article changed; preview again');
 for(const e of entries)await bucket().delete(e.key);
 for(const e of entries){if(await bucket().head(e.key))throw Error('Cleanup incomplete; retained Word is safe');}
 const next={...meta,workfiles_cleaned_at:meta.workfiles_cleaned_at||new Date().toISOString()};
 const change=await db().prepare('UPDATE articles SET paragraphs=?,result_meta=? WHERE id=? AND owner=? AND state=? AND result_key=? AND result_meta=?').bind('[]',JSON.stringify(next),id,owner,'completed',r.result_key,r.result_meta).run();
 if(!change.meta.changes)throw Error('Cleanup metadata changed; verify before retry');
 const kept=await bucket().head(r.result_key);if(!kept||kept.size!==bytes.length)throw Error('Retained Word verification required');
 return {...summary,cleaned:true,extracted_text_removed:true};
}
