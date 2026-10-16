// A read-only view of the existing attempt. Never grants permission for another request.
export function generationProgress(state:string|undefined,saved:boolean,created?:string,diagnostic?:unknown){
 const age=created?Date.now()-Date.parse(created):Infinity;
 const detail=diagnostic&&typeof diagnostic==='object'?diagnostic as {stage?:string;http_status?:number|null}:{};
 const providerUnknown=state==='failed'&&detail.stage==='failed'&&(detail.http_status==null||detail.http_status>=500);
 const outcome=!state?'not_requested':state==='completed'?(saved?'saved':'ready_to_save'):state==='requested'?(age<=300000?'running':'outcome_unknown'):providerUnknown?'outcome_unknown':'failed';
 return {outcome,resume_action:outcome==='ready_to_save'?'save_existing':'read_only',automatic_retry:false};
}
