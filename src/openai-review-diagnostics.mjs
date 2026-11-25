// Deliberately excludes raw errors, messages, headers, prompts and model output.
const phases=new Set(['prepare_request','before_dispatch','fetch','read_body','decode_body','response_status','tool_lookup','validate_output','completed']);
const statuses=new Set(['completed','failed','in_progress','cancelled','queued','incomplete']);
const reasons=new Set(['max_output_tokens','max_messages','content_filter','steered']);
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;
const safeId=(value,prefix,key)=>typeof value==='string'&&value.length<=200&&
  (prefix==='resp_'?/^resp_[A-Za-z0-9_-]+$/:/^(?:req_[A-Za-z0-9_-]+|[a-f0-9-]{16,64})$/).test(value)&&
  !/sk-|bearer/i.test(value)&&!(key&&value.includes(key));
export function safeReviewDiagnostics(items,key='') {
  if(!Array.isArray(items))return [];
  return items.slice(0,4).flatMap(item=>{
    if(!item||!Number.isInteger(item.round)||item.round<1||item.round>4||!phases.has(item.phase))return [];
    const result={round:item.round,phase:item.phase};
    if(typeof item.timeout==='boolean')result.timeout=item.timeout;
    if(Number.isInteger(item.http_status)&&item.http_status>=100&&item.http_status<=599)result.http_status=item.http_status;
    if(safeId(item.request_id,'req_',key))result.request_id=item.request_id;
    if(safeId(item.response_id,'resp_',key))result.response_id=item.response_id;
    if(statuses.has(item.response_status))result.response_status=item.response_status;
    if(reasons.has(item.incomplete_reason))result.incomplete_reason=item.incomplete_reason;
    const usage={};
    for(const field of ['input_tokens','output_tokens','total_tokens'])if(count(item.usage?.[field]))usage[field]=item.usage[field];
    for(const [group,field] of [['input_tokens_details','cached_tokens'],['output_tokens_details','reasoning_tokens']])
      if(count(item.usage?.[group]?.[field]))usage[group]={[field]:item.usage[group][field]};
    if(Object.keys(usage).length)result.usage=usage;
    return [result];
  });
}
export const lastReviewResponseId=items=>[...(items||[])].reverse().find(item=>item.response_id)?.response_id??null;
