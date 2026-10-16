/** Tool-owning authenticated bridge. Credentials stay only in this volatile closure. */
export function createArticleUploadBridge({call, currentClaim, approvedScope, executionStopped, priorExecutionStopped, summarizeToolError}) {
  // Tool arguments/results are JSON. Some normal tool hosts lack structuredClone.
  const clone = value => typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  const allowed = new Set(['reserve_article_upload','recover_article_unconsumed_upload','consume_article_upload','record_article_upload','record_article_status','record_article_delivery','record_article_upload_diagnostic','read_article_upload','preview_article_claim_recovery','recover_article_claim','record_article_upload_executor_end','finish_article_upload_execution','preview_article_unconsumed_upload_recovery']);
  const claims = new Map(), permits = new Map(), closed = new Set(), active = new Set();
  const passive = new Set(['record_article_upload_diagnostic','read_article_upload','preview_article_claim_recovery','preview_article_unconsumed_upload_recovery']);
  const discardPermits = platform => { for (const [id, permit] of permits) if (permit.platform === platform) permits.delete(id); };
  const close = platform => { closed.add(platform); claims.delete(platform); discardPermits(platform); };
  const finishError = () => Object.assign(Error('Execution finish was not confirmed; this bridge is closed. Read current state before any continuation.'), {status:'execution_finish_unknown',new_platform_upload_allowed:false});
  const requireApproval = (args, approval, fields, message) => {
    if (!approval || fields.some(key => args[key] !== approval[key])) throw Error(message);
  };
  // A verified download in this executor is a distinct handoff basis, not proof
  // that the browser has read the path. Freeze the exact host-inspected bytes
  // and paths; only the real runner supplies the fresh chooser timestamp.
  const fileScopes = clone(approvedScope.file_handoff || {});
  const unconsumedRecoveryScopes = clone(approvedScope.unconsumed_recovery || {});
  const fileFields = ['filename','absolute_path','browser_session','visible_in_browser','visibility_unproven','sha256','size','checked_at'];
  const handoffFields = ['kind','download_path','download_browser_session','executor_id','source_sha256','source_size','verified_in_cua','copied_in_same_executor'];
  const requireFileHandoff = (file, platform) => {
    const approval = fileScopes[platform];
    if (!approval && file?.visible_in_browser !== false && !file?.handoff) return;
    const handoff = file?.handoff, expected = approval?.handoff;
    if (!approval || !file || file.visible_in_browser !== false || file.visibility_unproven !== true ||
        fileFields.some(key => file[key] !== approval[key]) || !handoff || !expected ||
        handoffFields.some(key => handoff[key] !== expected[key]) ||
        Object.keys(handoff).some(key => ![...handoffFields,'chooser_prepared','chooser_prepared_at'].includes(key)) ||
        handoff.kind !== 'same_browser_download' || handoff.download_browser_session !== file.browser_session ||
        handoff.source_sha256 !== file.sha256 || handoff.source_size !== file.size ||
        handoff.verified_in_cua !== true || handoff.copied_in_same_executor !== true ||
        handoff.chooser_prepared !== true || !Number.isFinite(Date.parse(handoff.chooser_prepared_at)))
      throw Error('Exact inspected same-browser download handoff differs from the host scope');
  };
  return async function execute(request, onDiagnostic) {
    const mark=stage=>{try{const pending=onDiagnostic?.({stage});if(pending&&typeof pending.then==='function')Promise.resolve(pending).catch(()=>{});}catch{/* Fixed non-secret diagnostics never affect execution. */}};
    let callStarted=false,callReturned=false;mark('bridge_guard_start');
    try {
    if (request.status !== 'bridge_required' || !allowed.has(request.operation)) throw Error('Unsupported upload bridge operation');
    const {operation} = request, args = clone(request.args), reservation=operation==='reserve_article_upload'||operation==='recover_article_unconsumed_upload';
    if(operation==='recover_article_unconsumed_upload')args.mode='continue_unconsumed';
    const platform = operation === 'record_article_status' ? 'toutiao' : args.platform;
    const account = platform === 'toutiao' ? '61556093362' : platform === 'zhihu' ? 'ren-zhe-ai-chi-yu-52' : null;
    if (!account || args.article_id !== approvedScope.article_id || !approvedScope.platforms.includes(platform)) throw Error('Upload bridge scope differs from the owner-authorized task');
    if(operation==='record_article_status'&&Object.hasOwn(args,'platform')&&args.platform!=='toutiao')throw Error('Upload bridge scope differs from the owner-authorized task');
    // Routing fields stay outside authenticated tool args. Named website methods
    // bind platform + picker; a bare explicit picker preserves the pre-existing
    // independent-test adapter path without changing platform authorization.
    const method=platform==='toutiao'?'codex':'coordinate',picker=platform==='toutiao'?'browser':'native';
    if((Object.hasOwn(request,'picker_mode')&&!['browser','native'].includes(request.picker_mode))||(Object.hasOwn(request,'upload_method')&&(request.upload_method!==method||(Object.hasOwn(request,'picker_mode')&&request.picker_mode!==picker))))throw Error('Upload method differs from the fixed platform route');
    if (args.target_account && args.target_account !== account) throw Error('Target account mismatch');
    if (['claim_token','delivery_token','execution_claim','consume_token'].some(key=>Object.hasOwn(args,key))) throw Error('Browser request cannot supply credentials');
    if (reservation) {
      requireFileHandoff(args.preflight?.file, platform);
      if (fileScopes[platform] && (args.word_sha256 !== fileScopes[platform].sha256 || args.word_size !== fileScopes[platform].size)) throw Error('Inspected Word differs from the reserved handoff');
    }
    if (operation === 'consume_article_upload') requireFileHandoff(args.file_confirmation, platform);
    if (reservation && args.mode === 'owner_confirmed_first_import' && approvedScope.owner_confirmed_first_import?.[platform] !== true) throw Error('Exact owner first-import confirmation missing');
    if (reservation && args.mode === 'owner_confirmed_reimport') {
      const approval=approvedScope.reimport?.[platform];
      requireApproval(args,approval,['authorization_scope','current_task_id','confirmation_message_id','current_word_sha256','word_size'],'Exact owner manual-task reimport authorization missing');
      if (approval.confirm_reimport !== true || args.confirm_reimport !== true || args.authorization_scope==='duplicate_tolerant_task'&&approval.confirm_duplicate_tolerant_task!==true) throw Error('Exact owner manual-task reimport authorization missing');
      if(args.authorization_scope==='exact_reimport')requireApproval(args,approval,['previous_attempt_id','prior_draft_identity','existing_editor_url','prior_executor_end_reference','authorization_key'],'Exact owner reimport action differs from approval');
    }
    if (reservation && args.mode === 'owner_confirmed_legacy_reimport') {
      const approval=approvedScope.reimport?.[platform];
      args.authorization_scope??='exact_reimport';
      const exactApproval=approval?{...approval,authorization_scope:approval.authorization_scope??'exact_reimport'}:null;
      requireApproval(args,exactApproval,['authorization_scope','current_task_id','confirmation_message_id','current_word_sha256','word_size','expected_attempt_id','confirm_unrecorded_history','prior_draft_identity','existing_editor_url','prior_executor_end_reference','authorization_key','confirm_reimport','confirm_new_draft','preserve_existing_draft','prior_executor_stopped'],'Exact owner legacy reimport action differs from approval');
      if(args.expected_attempt_id!==null||args.confirm_unrecorded_history!==true||Object.hasOwn(args,'previous_attempt_id')||!['exact_reimport','duplicate_tolerant_task'].includes(args.authorization_scope)||['confirm_reimport','confirm_new_draft','preserve_existing_draft','prior_executor_stopped'].some(key=>args[key]!==true)||args.current_word_sha256!==args.word_sha256||!args.current_task_id||!args.authorization_key||!args.confirmation_message_id||!args.prior_executor_end_reference)throw Error('Exact owner legacy reimport authorization missing');
      if(args.authorization_scope==='duplicate_tolerant_task'&&(args.confirm_duplicate_tolerant_task!==true||approval.confirm_duplicate_tolerant_task!==true))throw Error('Exact owner legacy reimport authorization missing');
      if(!['known_editor_url','unknown_without_editor_url'].includes(args.prior_draft_identity)||args.prior_draft_identity==='unknown_without_editor_url'&&Object.hasOwn(args,'existing_editor_url'))throw Error('Legacy history must preserve the actual prior draft identity');
    }
    if(reservation&&args.mode==='continue_unconsumed'){
      const approval=unconsumedRecoveryScopes[platform];
      requireApproval(args,approval,['previous_attempt_id','expected_attempt_revision','expected_recovery_fingerprint','target_account','word_sha256','word_size','current_task_id','authorization_key','confirmation_message_id','prior_executor_end_reference','confirm_unconsumed_recovery','prior_executor_stopped','preserve_existing_draft','confirm_new_draft'],'Exact owner unconsumed-recovery authorization missing');
      if(['confirm_unconsumed_recovery','prior_executor_stopped','preserve_existing_draft','confirm_new_draft'].some(k=>args[k]!==true))throw Error('Exact owner unconsumed-recovery authorization missing');
      let stopped=false;try{const value=priorExecutionStopped?.({platform,attempt_id:args.previous_attempt_id,recovery_fingerprint:args.expected_recovery_fingerprint});stopped=value===true;if(value&&typeof value.then==='function')Promise.resolve(value).catch(()=>{});}catch{/* fixed summary only */}
      if(!stopped)throw Error('Exact original upload execution must be stopped and settled');
    }
    if (operation === 'recover_article_claim') {
      requireApproval(args,approvedScope.claim_recovery?.[platform],['expected_lease_fingerprint','confirm_article_id','confirm_prior_executor_ended','confirm_read_only_recovery','confirm_existing_results_checked'],'Exact owner claim-recovery authorization missing');
      if (args.confirm_article_id!==args.article_id || ['confirm_prior_executor_ended','confirm_read_only_recovery','confirm_existing_results_checked'].some(key=>args[key]!==true)) throw Error('Exact owner claim-recovery authorization missing');
    }
    // Acquire before any await, including currentClaim. Do not queue a delayed mutation
    // behind a lease change. Keep the lock until the actual tool response settles.
    const guarded=!passive.has(operation), finishing=operation==='finish_article_upload_execution';
    if(guarded&&active.has(platform))throw Object.assign(Error('A platform bridge operation is still pending; do not repeat or overlap it.'),{status:'bridge_operation_pending',new_platform_upload_allowed:false});
    if(guarded)active.add(platform);
    let finishStarted=false;
    try {
    const withoutClaim=passive.has(operation)||operation==='recover_article_claim'||operation==='recover_article_unconsumed_upload';
    let credential=null;
    if (!withoutClaim) {
      if(closed.has(platform))throw Object.assign(Error('This execution bridge is closed; use a normal successor claim or an already authorized exact recovery.'),{status:'execution_closed',new_platform_upload_allowed:false});
      // The host must cancel/settle its runtime first. Browser args alone cannot attest
      // that an already-returned grant or pending browser/file/status action stopped.
      let stopped=false;
      if(finishing){try{
        const probe=typeof executionStopped==='function'?executionStopped(platform):false;
        stopped=probe===true;
        if(probe&&typeof probe.then==='function')Promise.resolve(probe).catch(()=>{}); // Refuse async attestations without leaking an unhandled rejection.
      }catch{/* Never expose host errors or credentials. */}}
      if(finishing&&(args.executor_stopped!==true||!stopped))throw Object.assign(Error('The host must stop and settle this execution before finishing its lease.'),{status:'execution_not_stopped',new_platform_upload_allowed:false});
      const cachedClaim=claims.get(platform);
      if(finishing){close(platform);finishStarted=true;}
      try {credential = cachedClaim || await currentClaim(platform);}
      catch {throw Object.assign(Error('Current execution lease lookup failed; retain state and reconcile.'),{status:'lease_lookup_failed',new_platform_upload_allowed:false});}
      if (typeof credential !== 'string' || !credential) {
        const error=Error('Current execution lease unavailable; preview exact owner recovery');
        Object.assign(error,{status:'owner_recovery_required',next_request:{status:'bridge_required',operation:'preview_article_claim_recovery',args:{article_id:approvedScope.article_id,platform}},requires_owner_termination_confirmation:true,wait_for_expiry_required:false,new_platform_upload_allowed:false});
        throw error;
      }
      if (operation === 'record_article_status') args.claim_token=credential;
      else if (operation === 'record_article_delivery') args.delivery_token=credential;
      else args.execution_claim=credential;
      if(operation==='consume_article_upload'&&permits.has(args.attempt_id)&&!args.reimport_editor_confirmation)throw Error('Fresh empty private editor confirmation required for the new reimport permission');
      if (operation==='consume_article_upload'&&args.reimport_editor_confirmation) {
        const permit=permits.get(args.attempt_id);
        if (!permit) throw Error('New reimport permission unavailable; retain attempt and reconcile');
        if (permit.platform !== platform || permit.executionClaim !== credential) throw Error('New reimport permission differs from platform or execution lease; retain attempt and reconcile');
        args.consume_token=permit.token;
        permits.delete(args.attempt_id); // Ambiguous consume never restores a permit.
      }
    }
    let response;
    try { const toolArgs={...args};if(operation==='recover_article_unconsumed_upload')delete toolArgs.mode;callStarted=true;mark('bridge_call_before');response=await call(operation,toolArgs,onDiagnostic);callReturned=true;mark('bridge_call_returned'); }
    catch(error) { if(finishing)throw finishError(); let summary={code:'UPLOAD_OPERATION_FAILED',summary:'Authenticated upload operation failed; retain state and reconcile.'};
      if(typeof summarizeToolError==='function'){try{summary=summarizeToolError(error);}catch{/* fixed fallback */}}
      if(typeof summary?.summary!=='string'||typeof summary?.code!=='string'||[credential,args.consume_token].filter(Boolean).some(token=>summary.summary.includes(token)||summary.code.includes(token)))summary={code:'UPLOAD_OPERATION_FAILED',summary:'Authenticated upload operation failed; retain state and reconcile.'};
      throw Object.assign(Error(summary.summary),{code:summary.code}); }
    if (!response || typeof response !== 'object') {if(finishing)throw finishError();throw Error('Authenticated MCP response required');}
    const clean=clone(response), secrets=[credential].filter(Boolean);
    if (reservation && fileScopes[platform] && clean.reserved === true) requireFileHandoff(clean.attempt?.preflight?.file, platform);
    let nextClaim=null,nextPermit=null;
    if(finishing) {
      if(clean.article_id!==args.article_id||clean.platform!==platform||clean.released!==true||clean.execute_import!==false||clean.new_upload_allowed!==false||clean.unconsumed_permits_fenced!==true||clean.history_preserved!==true)throw finishError();
    } else if (operation==='recover_article_claim') {
      const key=platform==='toutiao'?'claim_token':'delivery_token',token=clean[key];
      if (clean.article_id!==args.article_id||clean.platform!==platform||clean.old_claim_fenced!==true||clean.new_upload_allowed!==false||typeof token!=='string'||!token) throw Error('Unsafe recovery response');
      secrets.push(token); delete clean[key]; nextClaim=token;
    } else if(reservation&&args.mode==='continue_unconsumed'&&clean.reserved===true){
      const {execution_claim:token,consume_token:permit}=clean,a=clean.attempt;
      if(clean.unconsumed_continuation_permission_ready!==true||clean.old_permit_fenced!==true||a?.article_id!==args.article_id||a?.platform!==platform||a?.target_account!==account||a?.word_sha256!==args.word_sha256||a?.word_size!==args.word_size||a?.previous_attempt_id!==args.previous_attempt_id||a?.authorization_kind!=='unconsumed_continuation'||a?.state!=='reserved'||typeof token!=='string'||!token||token===credential||typeof permit!=='string'||!permit||permit===credential||permit===token)throw Error('Unsafe unconsumed continuation response');
      secrets.push(token,permit);delete clean.execution_claim;delete clean.consume_token;nextClaim=token;nextPermit=permit;
    } else if (reservation&&args.mode==='owner_confirmed_reimport'&&clean.reserved===true) {
      const {execution_claim:token,consume_token:permit}=clean;
      if(clean.attempt?.article_id!==args.article_id||clean.attempt?.platform!==platform||clean.attempt?.previous_attempt_id!==args.previous_attempt_id||clean.attempt?.authorization_kind!=='owner_confirmed_reimport'||typeof token!=='string'||!token||typeof permit!=='string'||!permit)throw Error('Unsafe reimport response');
      secrets.push(token,permit); delete clean.execution_claim; delete clean.consume_token;
      nextClaim=token;nextPermit=permit;clean.reimport_permission_ready=true;
    } else if (reservation&&args.mode==='owner_confirmed_legacy_reimport'&&clean.reserved===true) {
      const {execution_claim:token,consume_token:permit}=clean,a=clean.attempt;
      if(clean.legacy_reimport_permission_ready!==true||a?.article_id!==args.article_id||a?.platform!==platform||a?.target_account!==account||a?.word_sha256!==args.word_sha256||a?.word_size!==args.word_size||a?.previous_attempt_id!==null||a?.authorization_kind!=='owner_confirmed_legacy_reimport'||a?.state!=='reserved'||typeof token!=='string'||!token||token===credential||typeof permit!=='string'||!permit||permit===credential||permit===token)throw Error('Unsafe legacy reimport response');
      secrets.push(token,permit);delete clean.execution_claim;delete clean.consume_token;
      nextClaim=token;nextPermit=permit;
    }
    const encoded=JSON.stringify(clean);
    if(secrets.some(secret=>encoded.includes(secret))||/"(?:claim_token|delivery_token|execution_claim|consume_token|cookie|authorization)"\s*:/i.test(encoded)){if(finishing)throw finishError();throw Error('Unsafe bridge response');}
    if(nextClaim){discardPermits(platform);claims.set(platform,nextClaim);closed.delete(platform);}
    if(nextPermit)permits.set(clean.attempt.attempt_id,{token:nextPermit,platform,executionClaim:nextClaim});
    mark('bridge_response_validated');
    return clean;
    } catch(error) {if(finishStarted)throw finishError();throw error;}
    finally {if(guarded)active.delete(platform);}
    } catch(error) {mark(callReturned?'bridge_response_rejected':callStarted?'bridge_call_failed':'bridge_guard_failed');throw error;}
  };
}
