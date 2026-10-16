import {NATIVE_CHANNEL, SCOPE_FIELDS, bindScope, bindArtifact, requireCondition} from './coordinate-contract.js';
import {createParentImportGate} from './parent-import-gate.js';
import {createNativeCoordinateAdapter} from './native-coordinate-adapter.js';
import {assertTrackedParentObservations, bindTrackedObservationCancellation} from './tracked-observations.js';

// Deprecated reviewed compatibility bridge; normal first imports use the parent
// native-step bridge. Cancellation safety does not authorize old-instance reuse.
// PARENT MEMORY ONLY. This joins the reviewed two-platform core to the common native
// adapter. All callbacks remain project boundaries awaiting real host review.
// No genuine claim/reservation/consume response is sent to nativeDialog.open.
export function createV155NativeParentBridge({scope: inputScope, artifact: inputArtifact, coordinateHost, cleanup, confirmCompletion, authenticateCurrentChain, observations, preparePlan, instanceId, now}) {
  const scope = bindScope(inputScope), artifact = bindArtifact(inputArtifact, scope);
  requireCondition(observations && ['inspect', 'writeTitle', 'reopenAndInspect'].every(key => typeof observations[key] === 'function'), 'reviewed_original_host_observations_required');
  assertTrackedParentObservations(observations, scope, cleanup);
  const gate = createParentImportGate({scope, artifact, authenticateCurrentChain});
  const native = createNativeCoordinateAdapter({scope, artifact, host: coordinateHost, cleanup, confirmCompletion, preparePlan, instanceId, ...(now ? {now} : {}), authorizeSubmission: gate.authorizeSubmission});
  const coreScopeFields = SCOPE_FIELDS.filter(key => key !== 'host_id');
  let preparing = false, prepared = null, opening = false, cancelled = false, pendingParentOperations = 0;
  const assertActive = () => requireCondition(!cancelled, 'native_bridge_cancelled');
  bindTrackedObservationCancellation(observations, scope, cleanup, assertActive);
  function cancelLocal() {
    cancelled = true;
    return {...native.cancelLocal(), pending_parent_operations: pendingParentOperations};
  }
  async function activeObservation(operation) {
    assertActive();
    pendingParentOperations++;
    try {
      const value = await operation();
      assertActive();
      return value;
    } finally { pendingParentOperations--; }
  }
  function settlement() {
    requireCondition(pendingParentOperations === 0, 'parent_actions_still_running');
    return native.settlement(scope);
  }
  function observeClosureForSettlement() {
    requireCondition(pendingParentOperations === 0, 'parent_actions_still_running');
    return native.observeClosureForSettlement(scope);
  }
  const checkCoreScope = context => requireCondition(context && coreScopeFields.every(key => context[key] === scope[key]) && (context.host_id === undefined || context.host_id === scope.host_id), 'original_core_scope_required');
  const observationContext = context => {
    checkCoreScope(context);
    // Do not forward the function-bearing native_dialog handle into CUA. These
    // identifiers only ask the original inspector to observe this exact window.
    return Object.freeze({...scope, purpose: context.purpose, ...(context.editor_url !== undefined ? {editor_url: context.editor_url} : {}), ...(context.reuse_tab_id !== undefined ? {reuse_tab_id: context.reuse_tab_id} : {}), ...(context.import_channel !== undefined ? {import_channel: NATIVE_CHANNEL} : {}), ...(prepared ? {prepared_id: prepared.prepared_id, window_id: prepared.window_id, cycle: prepared.cycle} : {})});
  };
  async function inspect(context) {
    const input = observationContext(context);
    requireCondition(context.import_channel === undefined || context.import_channel === NATIVE_CHANNEL, 'native_channel_must_be_explicit');
    // The reviewed readSettlement path snapshots the ledger before/after its
    // read-only window observation. Registering itself as pending would make
    // all valid settlement impossible. It cannot clear unknown action tickets.
    if (context.purpose === 'settlement') return settlement();
    const value = await activeObservation(() => observations.inspect(input));
    assertActive();
    if (['prepared', 'consume', 'submit'].includes(context.purpose)) {
      requireCondition(prepared && value?.import_channel === NATIVE_CHANNEL && value.native_dialog_owned === true && ['prepared_id', 'window_id', 'cycle'].every(key => value[key] === prepared[key]), 'actual_native_ownership_observation_required');
    }
    // Pass genuine observations through unchanged; never synthesize ownership,
    // body, saving, closure or website completion from adapter phase alone.
    return value;
  }
  async function preparePicker(context) {
    assertActive();
    checkCoreScope(context);
    requireCondition(context.import_channel === NATIVE_CHANNEL && !preparing && !prepared, 'single_explicit_native_prepare_required');
    preparing = true; // Unknown or failed preparation cannot reset this bridge.
    const actualPrepared = await native.prepare(scope);
    assertActive();
    prepared = actualPrepared;
    const identity = Object.freeze({prepared_id: prepared.prepared_id, window_id: prepared.window_id, cycle: prepared.cycle});
    const nativeDialog = Object.freeze({...identity, ready: true, open: (absolutePath, facts) => activeObservation(async () => {
      assertActive();
      requireCondition(!opening, 'single_parent_native_open_required');
      opening = true; // Before any async authentication or possible dispatch.
      const allowed = [...coreScopeFields, 'import_channel', 'prepared_id', 'window_id', 'cycle', 'attempt_id', 'sha256', 'size', 'execute_import', 'delivery_status'];
      requireCondition(facts && Reflect.ownKeys(facts).length === allowed.length && Reflect.ownKeys(facts).every(key => typeof key === 'string' && allowed.includes(key)), 'public_core_import_facts_required');
      checkCoreScope(facts);
      requireCondition(absolutePath === artifact.absolute_path && facts.import_channel === NATIVE_CHANNEL && facts.execute_import === true && facts.delivery_status === 'saving' && facts.sha256 === artifact.sha256 && facts.size === artifact.size_bytes && Object.keys(identity).every(key => facts[key] === identity[key]), 'original_core_native_permission_required');
      // The original core has already obtained its actual consume + saving
      // responses. The gate authenticates that same chain, without reissuing it.
      requireCondition(typeof facts.attempt_id === 'string' && facts.attempt_id.length > 0, 'original_core_attempt_required');
      const permission = await gate.issue(prepared, facts.attempt_id);
      assertActive();
      return native.submit(scope, permission);
    })});
    return Object.freeze({...scope, channel: NATIVE_CHANNEL, ...identity, nativeDialog, editor_url: prepared.editor_url, ready: true, files_selected: false, submitted: false, checked_at: prepared.observed_at});
  }
  return Object.freeze({
    host: Object.freeze({inspect, preparePicker: context => activeObservation(() => preparePicker(context)), cancelLocal, writeTitle: context => activeObservation(() => observations.writeTitle(Object.freeze({...observationContext(context), title: context.title, control: context.control}))), reopenAndInspect: context => activeObservation(() => observations.reopenAndInspect(observationContext(context)))}),
    // Parent cleanup is explicit and read-only here. No browser cancellation,
    // replay, claim release or execution-end write is performed by this bridge.
    cancelLocal,
    settlement,
    observeClosureForSettlement,
    diagnostic: () => ({...native.diagnostic(), pending_parent_operations: pendingParentOperations}),
  });
}
