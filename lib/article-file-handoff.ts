export const wordContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// The same name is used by the download response and the executor handoff.
export function articleWordFilename(title:string,id:string){
 let base=String(title||'文章').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/g,'').replace(/\.docx$/i,'');
 const chars=Array.from(base||'文章');
 while(new TextEncoder().encode(chars.join('')).length>160)chars.pop();
 return `${chars.join('')||'文章'}-${id.slice(0,8)}.docx`;
}

export function wordDownloadDescriptor(row:any,head:{size:number}|null){
 let meta:any=null;try{meta=row.result_meta?JSON.parse(row.result_meta):null;}catch{}
 const ready=!!row.result_key&&!!head&&head.size>0;
 const sha256=ready&&head.size===meta?.size&&/^[a-f0-9]{64}$/.test(meta?.sha256||'')?meta.sha256:null;
 return {ready,output_id:ready?meta?.output_id||null:null,size:ready?head!.size:null,sha256,
  verification:sha256?meta?.verification||null:null,safe_filename:ready?articleWordFilename(row.title,row.id):null,
  download_path:ready?`/api/articles/${encodeURIComponent(row.id)}/download`:null,
  authentication_required:true,browser_visibility_proven:false};
}
