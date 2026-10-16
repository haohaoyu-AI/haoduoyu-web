import {NATIVE_CHANNEL, bindScope, bindArtifact, assertScope, assertFile, assertFresh, assertSnapshot, coordinateFromDecision, publicImportPermission, requireCondition} from './coordinate-contract.js';

const nativeCleanupInstances = new WeakMap();
const reviewedRawLedgers = new WeakSet();
export function createNativeCoordinateCleanup({scope: inputScope, readWindows, makeCleanupAdapter, now}) {
  const scope = bindScope(inputScope);
  requireCondition(typeof readWindows === 'function' && typeof makeCleanupAdapter === 'function', 'reviewed_same_host_cleanup_factory_required');
  // A NEW complete native-only ledger. Browser chooser creation/wait/submission
  // methods are deliberately not exposed. Never wrap an old/cancelled ledger.
  const raw = makeCleanupAdapter({scope, freshInstance: true, readWindows, ...(now ? {now} : {})});
  requireCondition(raw && !reviewedRawLedgers.has(raw), 'unused_reviewed_cleanup_required');
  const initial = raw.diagnostic();
  requireCondition(initial.history_complete === true && initial.chooser_phase === 'never_created' && initial.chooser_cycle === 0 && initial.pending_actions === 0 && initial.unknown_actions === 0 && initial.settled_actions === 0, 'new_complete_empty_cleanup_required');
  reviewedRawLedgers.add(raw);
  const wrapper = Object.freeze({runAwaited: raw.runAwaited, readSettlement: raw.readSettlement, diagnostic: raw.diagnostic});
  nativeCleanupInstances.set(wrapper, {scope, bound: false});
  return wrapper;
}

// Deprecated reviewed compatibility boundary. Normal first imports use the
// native step session; this cancellation fix does not authorize migration/retry.
// Project integration boundary only. host methods below MUST wrap the current
// documented official CUA methods after review by the ONE original host.
// Nothing here is an invented official API or an installed browser adapter.
export function createNativeCoordinateAdapter({scope: inputScope, artifact: inputArtifact, host, cleanup, confirmCompletion, now = () => new Date().toISOString(), preparePlan, authorizeSubmission, instanceId}) {
  const scope = bindScope(inputScope), artifact = bindArtifact(inputArtifact, scope);
  const methods = ['inspectFile', 'capturePage', 'identifyTarget', 'confirmScene', 'clickOnce', 'observeNativeDialog', 'captureNativeDialog', 'enterNativeFilename', 'observeNativeClosure'];
  requireCondition(host && methods.every(key => typeof host[key] === 'function') && cleanup && typeof cleanup.runAwaited === 'function' && typeof cleanup.readSettlement === 'function' && typeof confirmCompletion === 'function' && typeof authorizeSubmission === 'function' && typeof now === 'function', 'documented_native_host_capabilities_required');
  const cleanupBinding = nativeCleanupInstances.get(cleanup);
  requireCondition(cleanupBinding && !cleanupBinding.bound, 'new_native_only_cleanup_instance_required');
  assertScope(cleanupBinding.scope, scope);
  requireCondition(Array.isArray(preparePlan) && preparePlan.length > 0 && preparePlan.length <= 2 && Array.from(preparePlan).every((value, index) => Object.hasOwn(preparePlan, index) && ['import_document', 'choose_document'].includes(value) && preparePlan.indexOf(value) === index) && preparePlan[0] === 'import_document', 'reviewed_prepare_plan_required');
  requireCondition(typeof instanceId === 'string' && instanceId.length > 0 && instanceId.length <= 180, 'fresh_parent_instance_identity_required');
  cleanupBinding.bound = true;
  const plan = Object.freeze([...preparePlan]);
  // These are locally bound adapter identities, never credentials or grants.
  const epoch = Symbol('native-coordinate-instance');
  let phase = 'fresh', busy = false, cancelled = false, prepared = null, native = {phase: 'never_created', cycle: 0, window_id: null}, openIssued = false, creationClick = null, issuedOpenClick = null;
  const assertActive = () => requireCondition(!cancelled, 'native_adapter_cancelled');
  async function awaited(label, operation, retainObservation, terminalRead = false) {
    if (!terminalRead) assertActive();
    const value = await cleanup.runAwaited(label, () => {
      // Check at actual dispatch as well as entry. An already dispatched action
      // still awaits the documented completion classifier and keeps its ticket.
      if (!terminalRead) assertActive();
      return operation();
    }, outcome => confirmCompletion(label, outcome));
    if (retainObservation) retainObservation(value);
    if (!terminalRead) assertActive();
    return value;
  }
  async function authenticate(permission) {
    assertActive();
    const allowed = await authorizeSubmission({prepared, permission});
    assertActive();
    requireCondition(allowed === true, 'parent_consumed_saving_authorization_required');
  }
  async function inspectFile(label) {
    const startedAt = Date.parse(now());
    const receipt = await awaited(label, () => host.inspectFile({scope, artifact}));
    assertScope(receipt, scope); assertFresh(receipt, now); assertFile(receipt, artifact);
    requireCondition(Number.isFinite(startedAt) && Date.parse(receipt.observed_at) >= startedAt, 'current_file_observation_required');
  }
  async function exclusive(operation) {
    assertActive();
    requireCondition(!busy && phase !== 'unknown' && phase !== 'cancelled', 'single_execution_chain_required');
    busy = true;
    try { const value = await operation(); assertActive(); return value; } catch (error) { if (!cancelled) phase = 'unknown'; throw error; } finally { busy = false; }
  }
  async function clickObserved(snapshot, semantic, beforeDispatch) {
    const decision = await awaited(semantic + '.identify', () => host.identifyTarget({scope, snapshot, semantic}));
    const coordinates = coordinateFromDecision(decision, snapshot, semantic, now);
    const readCurrentScene = async label => {
      const current = await awaited(label, () => host.confirmScene({scope, snapshot}));
      assertScope(current, scope); assertFresh(current, now);
      requireCondition(current.source === 'official_host_scene_observation' && current.scene_id === snapshot.scene_id && current.screenshot_id === snapshot.screenshot_id && current.unchanged === true && (snapshot.kind !== 'native_dialog' || (current.window_id === snapshot.window_id && current.active === true && current.active_window_id === snapshot.window_id)), 'scene_changed_before_click');
      return current;
    };
    let current = await readCurrentScene(semantic + '.scene');
    if (beforeDispatch) {
      await beforeDispatch();
      assertActive();
      // Parent authentication can await a real tool response. Recheck the scene
      // afterwards so layout/window changes during that wait cannot cause Open.
      current = await readCurrentScene(semantic + '.scene_after_authorization');
    }
    assertFresh(snapshot, now);
    // Identity and attempt are recorded BEFORE dispatch. No retry on any error.
    const dispatchStartedAt = Date.parse(now());
    requireCondition(Number.isFinite(dispatchStartedAt), 'actual_dispatch_time_required');
    let click;
    await awaited(semantic + '.click', () => {
      // These irreversible facts begin at dispatch, never at an earlier target
      // identification wait. Cancellation cannot erase an issued action.
      if (semantic === 'native_open') openIssued = true;
      else if (plan.includes(semantic) && native.phase === 'never_created') native = {phase: 'unknown', cycle: 1, window_id: null};
      return host.clickOnce({scope, snapshot, semantic, coordinates});
    }, rawClick => {
      click = Object.freeze({...rawClick});
      assertScope(click, scope); assertFresh(click, now);
      requireCondition(Date.parse(click.observed_at) >= Math.max(dispatchStartedAt, Date.parse(snapshot.observed_at), Date.parse(current.observed_at)), 'current_action_mouse_receipt_required');
      requireCondition(click.source === 'official_host_mouse_receipt' && click.scene_id === snapshot.scene_id && click.screenshot_id === snapshot.screenshot_id && click.button === 'left' && click.click_count === 1 && click.x === coordinates.x && click.y === coordinates.y, 'single_real_mouse_click_unconfirmed');
      if (semantic === 'native_open') issuedOpenClick = click;
      else if (plan.includes(semantic)) creationClick = click;
    });
    return click;
  }
  async function prepare(context) {
    return exclusive(async () => {
      assertScope(context, scope); requireCondition(phase === 'fresh', 'prepare_once_required');
      phase = 'preparing';
      await inspectFile('word.prepare_identity');
      assertActive();
      let editorUrl = null, lastClick = null, dialog = null;
      for (const [index, semantic] of plan.entries()) {
        const rawScreenshot = await awaited(semantic + '.screenshot', () => host.capturePage({scope, semantic}));
        const screenshot = Object.freeze({...rawScreenshot, geometry: Object.freeze({...rawScreenshot?.geometry})});
        assertSnapshot(screenshot, scope, now, 'page');
        if (editorUrl === null) editorUrl = screenshot.editor_url;
        requireCondition(screenshot.editor_url === editorUrl, 'editor_url_changed');
        lastClick = await clickObserved(screenshot, semantic);
        assertActive();
        creationClick = lastClick;
        dialog = await awaited('native.prepare_observe.' + index, () => host.observeNativeDialog({scope, after_click: lastClick}), observed => {
          assertScope(observed, scope); assertFresh(observed, now);
          requireCondition(observed.creation_click === lastClick && Date.parse(observed.observed_at) >= Date.parse(lastClick.observed_at), 'matching_prepare_click_required');
          if (observed.state === 'native_dialog') {
            requireCondition(observed.source === 'official_native_dialog_observation' && observed.channel === NATIVE_CHANNEL && observed.owner_tab_id === scope.tab_id && observed.files_selected === false && observed.submitted === false && observed.modal === true && typeof observed.title === 'string' && observed.title.length > 0 && typeof observed.window_id === 'string' && observed.window_id && observed.active === true && observed.active_window_id === observed.window_id, 'native_prepare_unconfirmed');
            native = {phase: 'open', cycle: native.cycle, window_id: observed.window_id};
          }
        });
        assertActive();
        if (dialog.state === 'native_dialog') break;
        requireCondition(index + 1 < plan.length && dialog.state === 'document_modal' && dialog.source === 'official_document_modal_observation' && dialog.ready_for_next === plan[index + 1] && dialog.screenshot_ref != null && typeof dialog.scene_id === 'string' && dialog.scene_id, 'document_dialog_unconfirmed');
      }
      requireCondition(dialog.state === 'native_dialog' && dialog.source === 'official_native_dialog_observation' && dialog.channel === NATIVE_CHANNEL && dialog.owner_tab_id === scope.tab_id && dialog.creation_click === lastClick && dialog.files_selected === false && dialog.submitted === false && dialog.modal === true && typeof dialog.title === 'string' && dialog.title.length > 0 && typeof dialog.window_id === 'string' && dialog.window_id && dialog.active === true && dialog.active_window_id === dialog.window_id, 'native_prepare_unconfirmed');
      native = {phase: 'open', cycle: native.cycle, window_id: dialog.window_id};
      prepared = Object.freeze({...scope, channel: NATIVE_CHANNEL, prepared_id: instanceId + ':' + dialog.window_id + ':' + native.cycle, ready: true, files_selected: false, submitted: false, editor_url: editorUrl, window_id: dialog.window_id, cycle: native.cycle, sha256: artifact.sha256, size_bytes: artifact.size_bytes, observed_at: now()});
      assertActive();
      phase = 'prepared';
      return prepared;
    });
  }
  async function submit(context, permission) {
    return exclusive(async () => {
      assertScope(context, scope);
      requireCondition(phase === 'prepared' && native.phase === 'open' && !openIssued, 'single_native_submission_required');
      const safePermission = publicImportPermission(permission, prepared, scope, artifact);
      // Runs in parent memory. Must authenticate real consumed + saving receipts;
      // presence of execute_import/status strings alone never grants permission.
      await authenticate(safePermission);
      assertActive();
      await inspectFile('word.submit_identity');
      assertActive();
      const rawBefore = await awaited('native.filename_screenshot', () => host.captureNativeDialog({scope, window_id: native.window_id}));
      const before = Object.freeze({...rawBefore, geometry: Object.freeze({...rawBefore?.geometry})});
      assertSnapshot(before, scope, now, 'native_dialog');
      requireCondition(before.window_id === native.window_id && before.files_selected === false && before.submitted === false, 'same_unsubmitted_native_dialog_required');
      const filenameClick = await clickObserved(before, 'native_filename');
      assertActive();
      // This documented host input operation must TYPE the literal path into the
      // focused native filename field. No Enter, setFiles, upload or JS injection.
      const inputStartedAt = Date.parse(now());
      const input = await awaited('native.filename_input', () => host.enterNativeFilename({scope, window_id: native.window_id, absolute_path: artifact.absolute_path, submit: false}));
      assertScope(input, scope); assertFresh(input, now);
      requireCondition(Number.isFinite(inputStartedAt) && Date.parse(input.observed_at) >= Math.max(inputStartedAt, Date.parse(filenameClick.observed_at)), 'current_filename_receipt_required');
      requireCondition(input.source === 'official_native_filename_receipt' && input.window_id === native.window_id && input.absolute_path === artifact.absolute_path && input.submitted === false && input.enter_pressed === false, 'native_filename_input_unconfirmed');
      const rawScreenshot = await awaited('native.open_screenshot', () => host.captureNativeDialog({scope, window_id: native.window_id}));
      const screenshot = Object.freeze({...rawScreenshot, geometry: Object.freeze({...rawScreenshot?.geometry})});
      assertSnapshot(screenshot, scope, now, 'native_dialog');
      requireCondition(screenshot.window_id === native.window_id && screenshot.filename === artifact.absolute_path && screenshot.submitted === false && Date.parse(screenshot.observed_at) >= Date.parse(input.observed_at), 'native_filename_changed');
      await authenticate(safePermission);
      assertActive();
      // Set before dispatch; unknown outcomes are permanently non-replayable.
      phase = 'submitting';
      const openClick = await clickObserved(screenshot, 'native_open', async () => {
        await authenticate(safePermission);
      });
      assertActive();
      issuedOpenClick = openClick;
      const closure = await awaited('native.closure_observe', () => host.observeNativeClosure({scope, epoch, window_id: native.window_id, cycle: native.cycle, open_click: openClick}), observed => {
        assertScope(observed, scope); assertFresh(observed, now);
        requireCondition(observed.source === 'documented_native_window_closure' && observed.epoch === epoch && observed.channel === NATIVE_CHANNEL && observed.window_id === native.window_id && observed.cycle === native.cycle && observed.open_click === openClick && observed.closed === true && Date.parse(observed.observed_at) >= Date.parse(openClick.observed_at), 'actual_native_closure_required');
        native = {...native, phase: 'closed_confirmed'};
      });
      assertActive();
      phase = 'submitted';
      // Submitted/closed is only a host fact. This NEVER means saved/verified.
      return Object.freeze({...scope, channel: NATIVE_CHANNEL, prepared_id: prepared.prepared_id, submitted: true, window_id: native.window_id, cycle: native.cycle, observed_at: closure.observed_at});
    });
  }
  async function settlement(context) {
    requireCondition(!busy, 'actions_still_running');
    assertScope(context, scope);
    const nativeAtStart = native;
    const receipt = await cleanup.readSettlement({...context, purpose: 'settlement'});
    const nativeClear = nativeAtStart === native && !busy && ['never_created', 'closed_confirmed'].includes(native.phase);
    return {...receipt, ...scope, channel: NATIVE_CHANNEL, ...(prepared ? {prepared_id: prepared.prepared_id, window_id: prepared.window_id, cycle: prepared.cycle} : {}), chooser_closed: receipt.chooser_closed === true && nativeClear, native_dialog_closed: nativeClear};
  }
  async function observeClosureForSettlement(context) {
    requireCondition(!busy && native.window_id !== null && native.cycle > 0 && creationClick, 'known_native_window_required');
    assertScope(context, scope);
    busy = true;
    try {
      // Read-only recovery observation. Never repeats Open, changes channel or
      // erases an unknown action. Missing official closure capability stays false.
      const receipt = await awaited('native.terminal_closure_observe', () => host.observeNativeClosure({scope, epoch, purpose: 'settlement', window_id: native.window_id, cycle: native.cycle, creation_click: creationClick, open_click: issuedOpenClick}), null, true);
      assertScope(receipt, scope); assertFresh(receipt, now);
      requireCondition(receipt.source === 'documented_native_window_closure' && receipt.epoch === epoch && receipt.channel === NATIVE_CHANNEL && receipt.window_id === native.window_id && receipt.cycle === native.cycle && receipt.creation_click === creationClick && receipt.open_click === issuedOpenClick && receipt.closed === true && Date.parse(receipt.observed_at) >= Date.parse((issuedOpenClick || creationClick).observed_at), 'actual_native_closure_required');
      native = {...native, phase: 'closed_confirmed'};
      return {...scope, channel: NATIVE_CHANNEL, source: 'documented_native_window_closure', native_dialog_closed: true, observed_at: receipt.observed_at};
    } finally { busy = false; }
  }
  function cancelLocal() {
    // No host operation, no pointer erasure, no formal server release.
    // Call actual formal end only in parent AFTER authentic settlement evidence.
    cancelled = true;
    phase = 'cancelled';
    return diagnostic();
  }
  function diagnostic() { return {...cleanup.diagnostic(), phase, busy, cancelled, channel: NATIVE_CHANNEL, native_phase: native.phase, native_cycle: native.cycle, window_id: native.window_id, open_issued: openIssued}; }
  return Object.freeze({prepare, submit, settlement, observeClosureForSettlement, cancelLocal, diagnostic});
}
