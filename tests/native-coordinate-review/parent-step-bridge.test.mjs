import test from 'node:test';
import assert from 'node:assert/strict';
import {createParentNativeStepBridge} from '../../scripts/browser-upload/coordinate/src/parent-step-bridge.js';

// Offline transport/receipt fixtures only. They are not official acceptance.
const scope = Object.freeze({article_id: 'synthetic-parent-step', platform: 'toutiao', target_account: '61556093362', browser_session: 'browser', executor_id: 'executor', tab_id: 'tab', host_id: 'host'});
const artifact = Object.freeze({absolute_path: '/tmp/synthetic.docx', sha256: 'a'.repeat(64), size_bytes: 100, host_id: 'host'});
const observedAt = '2026-10-11T08:00:00.000Z';
const preparedReport = Object.freeze({...scope, channel: 'native_file_dialog', instance_id: 'instance', prepared_id: 'prepared', window_id: 'window', actual_window_id: 'window', cycle: 1, ready: true, files_selected: false, submitted: false, sha256: artifact.sha256, size_bytes: artifact.size_bytes, observed_at: observedAt, association: {creation_click_call_id: 'actual-fixture-click'}});

function fixture(options = {}) {
  const calls = [], initializationReceipt = {}, initializedInstance = {instance_id: 'instance'};
  let bridge, chainCalls = 0, nextOperation = options.next_operation || 'click_filename', snapshotSerial = 0;
  const transport = {
    instance_id: 'instance',
    call: async command => {
      calls.push(command);
      if (options.onCall) await options.onCall(command);
      let parent_report = command.method === 'acceptPrepareObservation' ? {status: 'prepared', prepared: preparedReport} : command.method === 'cancel' ? {status: 'cancelled', cancelled: true} : command.method === 'settlement' && options.settlement_report ? options.settlement_report : {status: 'native_pending', instance_id: 'instance'};
      if (command.method === 'step' && command.argument.operation === 'validate') parent_report = {status: 'dispatch_ready', instance_id: 'instance', operation: nextOperation, snapshot_id: 'actual-fixture-snapshot-' + (++snapshotSerial), observed_at: (options.now || (() => observedAt))()};
      if (command.method === 'step' && command.argument.operation === 'click_filename') nextOperation = 'type_filename';
      if (command.method === 'step' && command.argument.operation === 'type_filename') nextOperation = 'click_open';
      return {tool_result: {offline_fixture: true}, parent_report};
    },
    acceptsCurrentSession: async context => {
      if (options.onTransportCheck) await options.onTransportCheck(context);
      return {scope, initialized: true, current: true, instance_id: 'instance', initialization_receipt: initializationReceipt, initialized_instance: initializedInstance, ...(context.tool_result ? {tool_result: context.tool_result, parent_report: context.parent_report} : {})};
    },
  };
  const authenticateCurrentChain = async ({prepared}) => {
    chainCalls++;
    if (options.onChain) await options.onChain(chainCalls);
    return {...scope, source: 'authenticated_parent_current_chain', channel: 'native_file_dialog', execute_import: true, delivery_status: 'saving', prepared, claim_confirmed: true, reserved: true, consumed: true, current: options.current !== false, artifact_sha256: artifact.sha256, artifact_size_bytes: artifact.size_bytes, attempt_id: options.attempt_id || 'attempt', claimed_at: observedAt, reserved_at: observedAt, consumed_at: observedAt, saving_at: observedAt};
  };
  bridge = createParentNativeStepBridge({scope, artifact, transport, authenticateCurrentChain, now: options.now || (() => observedAt)});
  return {bridge, transport, calls, get chainCalls() { return chainCalls; }};
}
async function preparedFixture(options) {
  const value = fixture(options);
  await value.bridge.acceptPrepareObservation({state: 'native_dialog'});
  await value.bridge.acceptParentHandoff('attempt');
  return value;
}

test('native validation authenticates the canonical prepared object and current parent chain before arming each physical command', async () => {
  const value = await preparedFixture();
  const canonical = value.bridge.prepared();
  assert.equal(canonical.prepared_id, preparedReport.prepared_id);
  assert.notEqual(canonical, preparedReport);
  for (const operation of ['click_filename', 'type_filename', 'click_open']) {
    await value.bridge.step({operation: 'validate'});
    await value.bridge.step({operation});
  }
  assert.equal(value.chainCalls, 4);
  assert.deepEqual(value.calls.filter(x => x.method === 'step').map(x => x.argument.operation), ['validate', 'click_filename', 'validate', 'type_filename', 'validate', 'click_open']);
  const authorization = value.calls.at(-1).argument.authorization;
  assert.equal(authorization.attempt_id, 'attempt');
  assert.equal(authorization.window_id, 'window');
  assert.equal(authorization.checked_at, observedAt);
  assert.equal('claim_token' in authorization, false);
});

test('a boolean transport acceptance cannot authenticate an initialized original host', async () => {
  const value = fixture();
  value.transport.acceptsCurrentSession = async () => true;
  await assert.rejects(value.bridge.step({operation: 'observe'}), /genuine_current_initialized_host_binding_required/);
  assert.equal(value.calls.length, 0);
});

test('changed actual tool receipt/report association is fenced and never replayed', async () => {
  const value = fixture();
  const original = value.transport.acceptsCurrentSession;
  value.transport.acceptsCurrentSession = async context => {
    const binding = await original(context);
    return context.tool_result ? {...binding, parent_report: {status: 'invented'}} : binding;
  };
  await assert.rejects(value.bridge.step({operation: 'observe'}), /canonical_actual_tool_report_binding_required/);
  await assert.rejects(value.bridge.step({operation: 'observe'}), /single_known_parent_host_call_required/);
  assert.equal(value.calls.length, 1);
});

test('different consumed attempt is rejected before any handoff dispatch', async () => {
  const value = fixture({attempt_id: 'different-attempt'});
  await value.bridge.acceptPrepareObservation({state: 'native_dialog'});
  await assert.rejects(value.bridge.acceptParentHandoff('attempt'), /original_core_parent_attempt_mismatch/);
  assert.equal(value.calls.length, 1);
});

test('cancellation while current parent authentication awaits prevents validate and Open commands and requires explicit host flush', async () => {
  let begin, finish;
  const started = new Promise(resolve => { begin = resolve; });
  const blocked = new Promise(resolve => { finish = resolve; });
  const value = await preparedFixture({next_operation: 'click_open', onChain: async count => { if (count === 2) { begin(); await blocked; } }});
  const validation = value.bridge.step({operation: 'validate'});
  await started;
  const cancelled = value.bridge.cancel();
  assert.equal(cancelled.pending_cancel, true);
  assert.equal(cancelled.call_in_flight, true);
  assert.equal(cancelled.host_command_issued, false);
  finish();
  assert.equal((await validation).dispatched, false);
  assert.equal(value.bridge.step({operation: 'click_open'}).dispatched, false);
  assert.equal(value.calls.some(x => x.method === 'step'), false);
  assert.equal(value.calls.some(x => x.method === 'cancel'), false);
  await value.bridge.flushCancel();
  assert.equal(value.calls.at(-1).method, 'cancel');
});

test('cancellation during a dispatched call preserves its report without an automatic later Open or parallel cancel', async () => {
  let begin, finish;
  const started = new Promise(resolve => { begin = resolve; });
  const blocked = new Promise(resolve => { finish = resolve; });
  const value = await preparedFixture({next_operation: 'type_filename', onCall: async command => { if (command.method === 'step' && command.argument.operation === 'type_filename') { begin(); await blocked; } }});
  await value.bridge.step({operation: 'validate'});
  const current = value.bridge.step({operation: 'type_filename'});
  await started;
  const cancellation = value.bridge.cancel();
  assert.equal(cancellation.host_command_issued, true);
  assert.equal(cancellation.issued_operation, 'type_filename');
  assert.equal(value.calls.filter(x => x.method === 'cancel').length, 0);
  finish();
  assert.equal((await current).status, 'native_pending');
  assert.equal((await value.bridge.step({operation: 'click_open'})).dispatched, false);
  assert.equal(value.calls.filter(x => x.method === 'step' && x.argument.operation !== 'validate').length, 1);
  await value.bridge.flushCancel();
  assert.equal(value.calls.at(-1).method, 'cancel');
});

test('raw token, executable callback and caller-supplied authorization never enter a command', async () => {
  const value = fixture();
  assert.throws(() => value.bridge.review({claim_token: 'fixture-do-not-send'}), /secret_or_executable_command_field/);
  assert.throws(() => value.bridge.review({evaluate: () => {}}), /serializable_public_command_required/);
  assert.throws(() => value.bridge.review({images: [{sha256: artifact.sha256}]}), /public_model_review_fields_required/);
  assert.throws(() => value.bridge.step({operation: 'click_open', authorization: {execute_import: true}}), /public_step_operation_required/);
  assert.equal(value.calls.length, 0);
});

test('an unknown dispatch permits explicit read-only observation while preserving uncertainty and the cancel fence', async () => {
  const value = fixture({settlement_report: {...scope, actions_settled: true, native_dialog_closed: true, chooser_closed: true}, onCall: async command => { if (command.method === 'step' && command.argument.operation === 'observe') throw Error('offline fixture lost reply'); }});
  await assert.rejects(value.bridge.step({operation: 'observe'}), /lost reply/);
  assert.equal(value.bridge.cancel().pending_cancel, true);
  assert.equal(value.calls.some(x => x.method === 'cancel'), false);
  await value.bridge.step({operation: 'read_windows'});
  await value.bridge.hostDiagnostic();
  const settlement = await value.bridge.settlement();
  assert.equal(settlement.native_dialog_closed, true);
  assert.equal(settlement.parent_transport_settled, false);
  assert.equal(settlement.actions_settled, false);
  assert.equal(settlement.chooser_closed, false);
  assert.equal(value.bridge.diagnostic().outcome_unknown, true);
  assert.equal(value.bridge.diagnostic().pending_cancel, true);
  assert.throws(() => value.bridge.step({operation: 'click_open'}), /single_known_parent_host_call_required/);
  assert.equal(value.calls.some(x => x.method === 'step' && x.argument.operation === 'click_open'), false);
});

test('successful delivery of the actor cancel fence alone does not clear pending settlement', async () => {
  const value = await preparedFixture();
  const local = value.bridge.cancel();
  assert.equal(local.cancelled, true);
  assert.equal(typeof local.then, 'undefined');
  assert.equal(value.calls.some(x => x.method === 'cancel'), false);
  const cancellation = await value.bridge.flushCancel();
  assert.equal(cancellation.actor_cancel_confirmed, true);
  assert.equal(cancellation.pending_cancel, true);
  await value.bridge.settlement();
  assert.equal(value.bridge.diagnostic().pending_cancel, true);
  const callCount = value.calls.length;
  await value.bridge.flushCancel();
  assert.equal(value.calls.length, callCount);
});

test('physical commit dispatches synchronously without any preceding gate or transport authentication await and preserves exact checked_at', async () => {
  let clock = Date.parse(observedAt), commitMode = false;
  const value = await preparedFixture({now: () => new Date(clock).toISOString(), onChain: async () => { assert.equal(commitMode, false, 'parent gate must run only before validate'); }, onTransportCheck: async context => { if (commitMode) assert.ok(context.tool_result, 'commit has no pre-dispatch transport authentication'); }});
  await value.bridge.step({operation: 'validate'});
  const validatedAuthorization = value.calls.at(-1).argument.authorization;
  const callCount = value.calls.length;
  clock += 1000; commitMode = true;
  const pending = value.bridge.step({operation: 'click_filename'});
  assert.equal(value.calls.length, callCount + 1, 'transport.call starts before commit returns its promise');
  assert.deepEqual(value.calls.at(-1).argument.authorization, validatedAuthorization);
  assert.equal(value.calls.at(-1).argument.authorization.checked_at, observedAt);
  await pending;
  assert.equal(value.chainCalls, 2);
});

test('preparation clicks also require a matching genuine validate commit and burn it once', async () => {
  const value = fixture({next_operation: 'click_prepare'});
  assert.throws(() => value.bridge.step({operation: 'click_prepare'}), /matching_native_dispatch_ready_required/);
  assert.equal(value.calls.length, 0);
  await value.bridge.step({operation: 'validate'});
  const current = value.bridge.step({operation: 'click_prepare'});
  assert.throws(() => value.bridge.step({operation: 'click_prepare'}), /single_known_parent_host_call_required/);
  await current;
  assert.throws(() => value.bridge.step({operation: 'click_prepare'}), /matching_native_dispatch_ready_required/);
  assert.equal(value.chainCalls, 0);
  assert.equal(value.calls.filter(x => x.argument?.operation === 'click_prepare').length, 1);
});

test('expired or different-operation ready reports never dispatch a physical command', async () => {
  let clock = Date.parse(observedAt);
  const value = await preparedFixture({now: () => new Date(clock).toISOString()});
  await value.bridge.step({operation: 'validate'});
  const callCount = value.calls.length;
  assert.throws(() => value.bridge.step({operation: 'click_open'}), /matching_native_dispatch_ready_required/);
  clock += 15001;
  assert.throws(() => value.bridge.step({operation: 'click_filename'}), /fresh_observation_required/);
  assert.equal(value.calls.length, callCount);
});

test('changing the authenticated ready report or original transport function blocks commit locally', async () => {
  const value = await preparedFixture();
  const ready = await value.bridge.step({operation: 'validate'});
  const callCount = value.calls.length;
  ready.snapshot_id = 'different-snapshot';
  assert.throws(() => value.bridge.step({operation: 'click_filename'}), /matching_native_dispatch_ready_required/);
  assert.equal(value.calls.length, callCount);
  const another = await preparedFixture();
  await another.bridge.step({operation: 'validate'});
  const anotherCount = another.calls.length;
  another.transport.call = async () => { throw Error('must not use replaced transport'); };
  assert.throws(() => another.bridge.step({operation: 'click_filename'}), /matching_native_dispatch_ready_required/);
  assert.equal(another.calls.length, anotherCount);
});

test('cancellation during the current read-only validate call prevents any later physical dispatch', async () => {
  let begin, finish;
  const started = new Promise(resolve => { begin = resolve; });
  const blocked = new Promise(resolve => { finish = resolve; });
  const value = await preparedFixture({next_operation: 'click_open', onCall: async command => { if (command.argument?.operation === 'validate') { begin(); await blocked; } }});
  const pending = value.bridge.step({operation: 'validate'});
  await started;
  const fence = value.bridge.cancelLocal();
  assert.equal(fence.cancelled, true);
  assert.equal(typeof fence.then, 'undefined');
  assert.equal(fence.issued_operation, 'validate');
  assert.equal(value.calls.some(x => x.method === 'cancel'), false);
  finish();
  assert.equal((await pending).status, 'dispatch_ready');
  assert.equal(value.bridge.diagnostic().dispatch_ready, false);
  assert.equal(value.bridge.step({operation: 'click_open'}).dispatched, false);
  assert.equal(value.calls.some(x => x.argument?.operation === 'click_open'), false);
  await value.bridge.flushCancel();
  assert.equal(value.calls.at(-1).method, 'cancel');
});

test('cancellation during authentication of the returned ready receipt cannot arm an Open commit', async () => {
  let begin, finish;
  const started = new Promise(resolve => { begin = resolve; });
  const blocked = new Promise(resolve => { finish = resolve; });
  const value = await preparedFixture({next_operation: 'click_open', onTransportCheck: async context => { if (context.parent_report?.status === 'dispatch_ready') { begin(); await blocked; } }});
  const pending = value.bridge.step({operation: 'validate'});
  await started;
  value.bridge.cancel();
  finish(); await pending;
  assert.equal(value.bridge.diagnostic().dispatch_ready, false);
  assert.equal(value.bridge.step({operation: 'click_open'}).dispatched, false);
  assert.equal(value.calls.some(x => x.argument?.operation === 'click_open'), false);
});

test('idle core cancelLocal is synchronous and never starts an implicit host call', () => {
  const value = fixture();
  const result = value.bridge.cancelLocal();
  assert.equal(result.cancelled, true);
  assert.equal(typeof result.then, 'undefined');
  assert.equal(result.host_command_issued, false);
  assert.equal(value.calls.length, 0);
  assert.equal(value.bridge.cancel().cancelled, true);
  assert.equal(value.calls.length, 0);
});

test('an intervening observation consumes the parent frame qualification and cannot leave a stale commit armed', async () => {
  const value = await preparedFixture();
  await value.bridge.step({operation: 'validate'});
  await value.bridge.step({operation: 'observe'});
  const count = value.calls.length;
  assert.throws(() => value.bridge.step({operation: 'click_filename'}), /matching_native_dispatch_ready_required/);
  assert.equal(value.calls.length, count);
});
