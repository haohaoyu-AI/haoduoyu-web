import {NATIVE_CHANNEL, bindScope, bindArtifact, assertScope, assertFresh, requireCondition} from './coordinate-contract.js';
import {createParentImportGate} from './parent-import-gate.js';

// PARENT MEMORY ONLY. transport is the original owner's reviewed proxy for one
// genuinely initialized persistent official host. It is not a CUA API. Its
// acceptsCurrentSession function must authenticate the actual initialization and
// current tool receipts; booleans or project source labels cannot replace it.
// No parent callback, receipt, token, baseline or executable source is serialized.
export function createParentNativeStepBridge({scope: inputScope, artifact: inputArtifact, transport, authenticateCurrentChain, now = () => new Date().toISOString()}) {
  const scope = bindScope(inputScope), artifact = bindArtifact(inputArtifact, scope);
  requireCondition(transport && typeof transport.call === 'function' && typeof transport.acceptsCurrentSession === 'function' && typeof transport.instance_id === 'string' && transport.instance_id.length > 0 && typeof now === 'function', 'authenticated_original_host_transport_required');
  const instanceId = transport.instance_id;
  const gate = createParentImportGate({scope, artifact, authenticateCurrentChain});
  let initializationReceipt = null, initializedInstance = null, prepared = null, permit = null, publicHandoff = null;
  let busy = false, cancelled = false, pendingCancel = false, actorCancelConfirmed = false, uncertain = false, currentCommand = null, readyCommit = null;
  const physicalOperations = new Set(['click_prepare', 'click_filename', 'type_filename', 'click_open']);
  const forbidden = /token|nonce|credential|execution_claim|claim_token|delivery_token|baseline|paragraphs|source_text|full_body|authenticate|callback/i;

  function publicData(value, depth = 0) {
    requireCondition(depth <= 12 && value !== undefined && typeof value !== 'function' && typeof value !== 'symbol' && typeof value !== 'bigint', 'serializable_public_command_required');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') { requireCondition(Number.isFinite(value), 'finite_public_command_required'); return value; }
    requireCondition(typeof value === 'object' && (Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), 'plain_public_command_required');
    requireCondition(Reflect.ownKeys(value).every(key => typeof key === 'string' && !forbidden.test(key)), 'secret_or_executable_command_field');
    requireCondition(Reflect.ownKeys(value).every(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value') && (descriptor.enumerable || Array.isArray(value) && key === 'length');
    }), 'plain_visible_public_values_required');
    if (Array.isArray(value)) {
      requireCondition(Reflect.ownKeys(value).every(key => key === 'length' || /^(0|[1-9][0-9]*)$/.test(key)) && Array.from(value).every((_, index) => Object.hasOwn(value, index)), 'dense_public_array_required');
      return Object.freeze(value.map(item => publicData(item, depth + 1)));
    }
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, publicData(item, depth + 1)])));
  }

  async function authenticateTransport(result) {
    if (result !== undefined) requireCondition(result && typeof result === 'object' && result.tool_result && typeof result.tool_result === 'object' && result.parent_report && typeof result.parent_report === 'object', 'actual_host_tool_result_and_canonical_report_required');
    const binding = await transport.acceptsCurrentSession({scope, instance_id: instanceId, ...(result ? {tool_result: result.tool_result, parent_report: result.parent_report} : {})});
    requireCondition(binding && typeof binding === 'object' && binding.initialized === true && binding.current === true && binding.instance_id === instanceId && binding.initialization_receipt && typeof binding.initialization_receipt === 'object' && binding.initialized_instance && typeof binding.initialized_instance === 'object', 'genuine_current_initialized_host_binding_required');
    assertScope(binding.scope, scope);
    requireCondition(binding.initialized_instance.instance_id === instanceId, 'original_initialized_instance_required');
    if (initializationReceipt === null) { initializationReceipt = binding.initialization_receipt; initializedInstance = binding.initialized_instance; }
    requireCondition(binding.initialization_receipt === initializationReceipt && binding.initialized_instance === initializedInstance, 'original_host_initialization_must_not_change');
    if (result) requireCondition(binding.tool_result === result.tool_result && binding.parent_report === result.parent_report, 'canonical_actual_tool_report_binding_required');
  }

  function retainPrepared(report) {
    const value = report.prepared?.ready === true ? report.prepared : report.ready === true ? report : null;
    if (!value) return;
    assertScope(value.scope || value, scope); assertFresh(value, now);
    requireCondition(value.channel === NATIVE_CHANNEL && value.instance_id === instanceId && typeof value.prepared_id === 'string' && value.prepared_id && typeof value.window_id === 'string' && value.window_id && value.cycle === 1 && value.ready === true && value.files_selected === false && value.submitted === false && value.sha256 === artifact.sha256 && value.size_bytes === artifact.size_bytes && value.association && typeof value.association === 'object', 'genuine_original_native_prepared_report_required');
    if (prepared) {
      requireCondition(['prepared_id', 'window_id', 'cycle', 'observed_at'].every(key => value[key] === prepared[key]), 'canonical_native_prepared_identity_changed');
      return;
    }
    // This parent canonical object is linked to a genuinely authenticated tool
    // report above. The host retains its own private window/snapshot identities.
    prepared = Object.freeze({...scope, channel: NATIVE_CHANNEL, instance_id: instanceId, prepared_id: value.prepared_id, window_id: value.window_id, cycle: value.cycle, ready: true, files_selected: false, submitted: false, sha256: artifact.sha256, size_bytes: artifact.size_bytes, observed_at: value.observed_at});
  }

  function cancelledResult() { return Object.freeze({status: 'cancelled', pending_cancel: pendingCancel, dispatched: false}); }
  function externalObservation(value, allowed, code) {
    const data = publicData(value);
    requireCondition(data && !Array.isArray(data) && Reflect.ownKeys(data).every(key => allowed.includes(key)), code);
    if (data.bounds) requireCondition(Reflect.ownKeys(data.bounds).every(key => ['x', 'y', 'width', 'height'].includes(key)), 'public_target_bounds_required');
    return data;
  }
  function makeCommand(method, argument) {
    const command = Object.freeze({instance_id: instanceId, method, argument: publicData(argument)});
    requireCondition(new TextEncoder().encode(JSON.stringify(command)).length <= 24000, 'public_command_budget_exceeded');
    return command;
  }
  function retainReady(result, command) {
    const report = result.parent_report;
    if (command.method !== 'step' || command.argument.operation !== 'validate' || report.status !== 'dispatch_ready') return;
    requireCondition(report.instance_id === instanceId && physicalOperations.has(report.operation) && typeof report.snapshot_id === 'string' && report.snapshot_id && report.snapshot_id.length <= 180, 'actual_native_dispatch_ready_required');
    assertFresh(report, now);
    requireCondition(report.operation === 'click_prepare' ? !prepared && !command.argument.authorization : prepared && command.argument.authorization, 'validated_native_stage_mismatch');
    // Only a genuinely authenticated current validate result can arm commit.
    // Its exact public authorization timestamp is retained, never refreshed.
    readyCommit = Object.freeze({operation: report.operation, snapshot_id: report.snapshot_id, observed_at: report.observed_at, authorization: command.argument.authorization || null, actual_report: report, initialization_receipt: initializationReceipt, initialized_instance: initializedInstance, transport_call: transport.call, transport_authentication: transport.acceptsCurrentSession});
  }
  async function acceptToolResult(result, command) {
    await authenticateTransport(result);
    retainPrepared(result.parent_report);
    if (!cancelled && !uncertain) retainReady(result, command);
    return result.parent_report;
  }
  async function dispatch(method, argument, {allowCancelled = false, allowUncertainRead = false, authorize = false} = {}) {
    requireCondition(!busy && (!uncertain || allowUncertainRead), 'single_known_parent_host_call_required');
    if (cancelled && !allowCancelled) return cancelledResult();
    readyCommit = null; // Any intervening command invalidates the last frame.
    busy = true;
    let dispatched = false;
    try {
      await authenticateTransport();
      if (cancelled && !allowCancelled) return cancelledResult();
      if (authorize) {
        requireCondition(prepared && permit, 'genuine_parent_handoff_required');
        await gate.authorizeSubmission({prepared, permission: permit});
        // Cancellation during either read-only authentication never falls
        // through to a filename write or Open dispatch.
        if (cancelled) return cancelledResult();
      }
      const command = makeCommand(method, authorize ? {...argument, authorization: {...publicHandoff, checked_at: now()}} : argument);
      dispatched = true;
      currentCommand = command;
      const result = await transport.call(command);
      return await acceptToolResult(result, command);
    } catch (error) {
      // Lost/unknown dispatched replies cannot be replayed through another
      // command. This bridge never guesses completion or resets a lifetime.
      if (dispatched) { uncertain = true; cancelled = true; pendingCancel = true; }
      throw error;
    } finally { busy = false; currentCommand = null; }
  }

  function commit(operation) {
    // Intentionally synchronous until transport.call: no gate, session read,
    // model callback or promise precedes the physical dispatch. validate has
    // already authenticated the parent and read the real current host frame.
    requireCondition(!busy && !uncertain, 'single_known_parent_host_call_required');
    if (cancelled) return cancelledResult();
    const ready = readyCommit;
    requireCondition(ready && ready.operation === operation && ready.initialization_receipt === initializationReceipt && ready.initialized_instance === initializedInstance && ready.transport_call === transport.call && ready.transport_authentication === transport.acceptsCurrentSession && ready.actual_report.instance_id === instanceId && ['operation', 'snapshot_id', 'observed_at'].every(key => ready.actual_report[key] === ready[key]), 'matching_native_dispatch_ready_required');
    assertFresh(ready, now);
    if (operation !== 'click_prepare') {
      requireCondition(prepared && permit && publicHandoff && ready.authorization && Object.keys(publicHandoff).every(key => key === 'checked_at' || ready.authorization[key] === publicHandoff[key]), 'exact_validated_parent_handoff_required');
      assertFresh({observed_at: ready.authorization.checked_at}, now);
    }
    const command = makeCommand('step', {operation, ...(ready.authorization ? {authorization: ready.authorization} : {})});
    readyCommit = null; // Burn before dispatch, including synchronous failure.
    busy = true; currentCommand = command;
    let pending;
    try { pending = transport.call(command); }
    catch (error) {
      uncertain = true; cancelled = true; pendingCancel = true;
      busy = false; currentCommand = null;
      throw error;
    }
    return (async () => {
      try { return await acceptToolResult(await pending, command); }
      catch (error) { uncertain = true; cancelled = true; pendingCancel = true; throw error; }
      finally { busy = false; currentCommand = null; }
    })();
  }

  async function acceptParentHandoff(expectedAttemptId) {
    requireCondition(!busy && !cancelled && !uncertain && prepared && !permit, 'one_original_prepared_parent_handoff_required');
    requireCondition(typeof expectedAttemptId === 'string' && expectedAttemptId.length > 0, 'original_parent_attempt_required');
    busy = true;
    try {
      await authenticateTransport();
      if (cancelled) return cancelledResult();
      permit = await gate.issue(prepared, expectedAttemptId);
      if (cancelled) return cancelledResult();
    } finally { busy = false; }
    publicHandoff = Object.freeze({...permit, attempt_id: expectedAttemptId, window_id: prepared.window_id, cycle: prepared.cycle, checked_at: now()});
    return dispatch('acceptParentHandoff', publicHandoff);
  }

  function cancel() {
    cancelled = true; pendingCancel = true; readyCommit = null;
    // Always synchronous/nonthenable, including idle. Core cancelLocal must
    // never start a hidden host command or falsely retract an issued action.
    return Object.freeze({status: 'cancelled', cancelled: true, pending_cancel: true, call_in_flight: busy, host_command_issued: currentCommand !== null, issued_operation: currentCommand?.argument?.operation || null, actor_cancel_confirmed: actorCancelConfirmed, outcome_unknown: uncertain});
  }
  function flushCancel() {
    requireCondition(cancelled && pendingCancel && !busy, 'pending_local_cancel_flush_required');
    if (uncertain || actorCancelConfirmed) return Object.freeze({status: 'cancelled', cancelled: true, pending_cancel: true, actor_cancel_confirmed: actorCancelConfirmed, outcome_unknown: uncertain});
    return dispatch('cancel', {}, {allowCancelled: true}).then(report => {
      requireCondition(report.cancelled === true || report.phase === 'cancelled', 'actual_host_cancel_fence_unconfirmed');
      actorCancelConfirmed = true;
      // A delivered actor fence is not an action-lifetime or window-closure
      // receipt. Keep pending until independently authenticated settlement.
      return Object.freeze({...report, pending_cancel: true, actor_cancel_confirmed: true});
    });
  }

  async function settlement() {
    const report = await dispatch('settlement', {}, {allowCancelled: true, allowUncertainRead: true});
    if (!uncertain && actorCancelConfirmed && prepared && report.actions_settled === true && report.native_dialog_closed === true && report.chooser_closed === true && ['prepared_id', 'window_id', 'cycle'].every(key => report[key] === prepared[key])) {
      assertScope(report, scope);
      pendingCancel = false;
    }
    // Genuine actor facts cannot erase an unknown parent transport lifetime.
    // Preserve physical native closure, but conservatively withhold aggregate
    // settlement/release flags while that lifetime is unresolved.
    return Object.freeze({...report, parent_transport_settled: !uncertain, actions_settled: report.actions_settled === true && !uncertain, chooser_closed: report.chooser_closed === true && !uncertain});
  }

  return Object.freeze({
    step: argument => {
      requireCondition(argument && ['observe', 'validate', 'read_windows', ...physicalOperations].includes(argument.operation) && Reflect.ownKeys(argument).length === 1, 'public_step_operation_required');
      if (physicalOperations.has(argument.operation)) return commit(argument.operation);
      const nativeValidation = argument.operation === 'validate' && prepared !== null;
      return dispatch('step', argument, {authorize: nativeValidation, allowCancelled: argument.operation === 'read_windows', allowUncertainRead: argument.operation === 'read_windows'});
    },
    review: observation => {
      const data = externalObservation(observation, ['snapshot_id', 'source', 'semantic', 'bounds', 'evidence_ref', 'unique', 'visible', 'enabled', 'unobscured', 'center_unobscured', 'observed_editor_url', 'observed_filename', 'filename_evidence_ref', 'observed_window_id', 'filename_field_focused'], 'public_model_review_fields_required');
      return dispatch('review', data);
    },
    acceptPrepareObservation: observation => {
      const data = externalObservation(observation, ['snapshot_id', 'source', 'evidence_ref', 'state', 'next_semantic', 'window_id', 'files_selected', 'submitted', 'native_dialog_semantics_confirmed'], 'public_prepare_observation_fields_required');
      return dispatch('acceptPrepareObservation', data);
    },
    acceptParentHandoff,
    cancel,
    cancelLocal: cancel,
    flushCancel,
    prepared: () => prepared,
    diagnostic: () => Object.freeze({instance_id: instanceId, busy, cancelled, host_command_issued: currentCommand !== null, issued_operation: currentCommand?.argument?.operation || null, pending_cancel: pendingCancel, actor_cancel_confirmed: actorCancelConfirmed, outcome_unknown: uncertain, prepared_id: prepared?.prepared_id || null, dispatch_ready: readyCommit !== null}),
    hostDiagnostic: () => dispatch('diagnostic', {}, {allowCancelled: true, allowUncertainRead: true}),
    settlement,
  });
}
