const action='openai-review.progress';
const actorFor=owner=>'openai-review-progress:'+owner;
const stages=new Set(['source_ready','provider_started','provider_responded','evidence_lookup','synthesizing','saving_report','completed']);
const roundStages=new Set(['provider_started','provider_responded','evidence_lookup','synthesizing']);
const limit=18;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=30000;

// Project both stored and new events through the same fixed public allowlist.
// Provider output, tool arguments, IDs and free text can never become progress.
export function safeReviewProgress(value,startedAt) {
  if(!value||!stages.has(value.stage)||typeof value.at!=='string')return null;
  const at=Date.parse(value.at),start=Date.parse(startedAt);
  if(!Number.isFinite(at)||!Number.isFinite(start)||new Date(at).toISOString()!==value.at)return null;
  const event={stage:value.stage,at:value.at,elapsed_ms:Math.max(0,at-start)};
  if(roundStages.has(value.stage)) {
    if(!Number.isInteger(value.round)||value.round<1||value.round>4)return null;
    event.round=value.round;
  }
  if(value.stage==='source_ready')for(const name of ['article_count','record_count'])if(count(value[name]))event[name]=value[name];
  return event;
}

export async function readReviewProgressForRuns(store,owner,runs) {
  const result=new Map(runs.map(row=>[row.id,[]]));if(!runs.length)return result;
  const byId=new Map(runs.map(row=>[row.id,row]));
  const events=await store.all('SELECT entity_id,detail_json FROM matrix_audit WHERE actor=? AND action=? AND entity_id IN ('+runs.map(()=>'?').join(',')+') ORDER BY rowid LIMIT ?',
    actorFor(owner),action,...runs.map(row=>row.id),runs.length*limit);
  for(const row of events) {
    const list=result.get(row.entity_id);if(!list||list.length>=limit)continue;
    let value;try{value=JSON.parse(row.detail_json);}catch{continue;}
    const event=safeReviewProgress(value,byId.get(row.entity_id).created_at);
    if(event&&!list.some(item=>item.stage===event.stage&&item.round===event.round))list.push(event);
  }
  return result;
}

export async function appendReviewProgress(store,owner,run,event) {
  const safe=safeReviewProgress(event,run.created_at);if(!safe)return;
  const existing=(await readReviewProgressForRuns(store,owner,[run])).get(run.id);
  if(existing.length>=limit||existing.some(item=>item.stage===safe.stage&&item.round===safe.round))return;
  store.audit(actorFor(owner),action,run.id,safe);
}
