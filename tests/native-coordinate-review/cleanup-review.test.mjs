// Tests import production sources directly; no review-copy module is exercised.
// OFFLINE ONLY. node:vm loads plain definitions in this local test process.
// This file is never an instruction or a loader for CUA or a browser host.
// All window lists, API outcomes and closure receipts below are synthetic.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../../scripts/browser-upload/coordinate/reviewed-cleanup/reviewed-cleanup.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source + '\nthis.helpers = {makeChooserCleanupState,validChooserCleanupState,updateChooserCleanupState,chooserCleanupFlags,createChooserCleanupAdapter};', context, {filename: 'reviewed-cleanup.js'});
const {makeChooserCleanupState: make, validChooserCleanupState: valid,
  updateChooserCleanupState: update, chooserCleanupFlags: flags,
  createChooserCleanupAdapter: adapter} = context.helpers;

const scope = Object.freeze({article_id: 'offline-article', platform: 'toutiao',
  target_account: '61556093362', browser_session: 'offline-session',
  executor_id: 'offline-executor', tab_id: 'offline-tab'});
const settlement = {...scope, purpose: 'settlement'};
const clearWindows = [{modal: false, title: 'Chromium'}];
const createdAt = '2026-10-11T00:00:00.000Z';
const observedAt = '2026-10-11T00:00:01.000Z';
const currentAt = '2026-10-11T00:00:02.000Z';
const fresh = () => make({freshInstance: true});
const event = (state, type, rest = {}) => ({epoch: state.epoch, type, ...rest});
function openState() {
  let state = fresh();
  state = update(state, event(state, 'chooser_creation_started'));
  const chooser = {};
  state = update(state, event(state, 'chooser_created', {cycle: 1, chooser}));
  return {state, chooser};
}
function fixture(options = {}) {
  let time = createdAt;
  const value = adapter({scope, freshInstance: true,
    readWindows: async () => clearWindows, now: () => time, ...options});
  return {value, setTime: next => {time = next;}};
}
function openFixture() {
  const f = fixture();
  const ticket = f.value.beginChooserCreation();
  const chooser = {};
  f.value.recordChooserCreated(ticket, chooser);
  f.setTime(currentAt);
  const receipt = {ticket, epoch: ticket.epoch, cycle: ticket.cycle,
    chooser, closed: true, observed_at: observedAt,
    source: 'documented_host_observation'};
  return {...f, ticket, chooser, receipt};
}

const cases = [
  ['fresh instance starts with complete never-created history', () => {
    const s = fresh();
    assert.equal(valid(s), true);
    assert.equal(s.chooser.phase, 'never_created');
    assert.equal(flags(s, clearWindows, s).chooser_closed, true);
  }],
  ['old or cancelled instance defaults to incomplete unknown history', () => {
    const s = make();
    assert.equal(s.historyComplete, false);
    assert.equal(s.chooser.phase, 'unknown');
    assert.equal(flags(s, clearWindows, s).actions_settled, false);
    assert.equal(flags(s, clearWindows, s).chooser_closed, false);
  }],
  ['ledger containers freeze without freezing the opaque chooser', () => {
    const {state, chooser} = openState();
    assert.equal(Object.isFrozen(state), true);
    assert.equal(Object.isFrozen(state.actions), true);
    assert.equal(Object.isFrozen(state.chooser), true);
    assert.equal(Object.isFrozen(chooser), false);
  }],
  ['every instance receives a distinct epoch', () => {
    assert.notEqual(fresh().epoch, fresh().epoch);
  }],
  ['invalid history is rejected and cannot authorize cleanup', () => {
    assert.equal(valid(null), false);
    assert.equal(valid({...fresh(), epoch: 'serialized'}), false);
    assert.equal(flags(null, clearWindows, null).chooser_closed, false);
  }],
  ['duplicate action ids make a history invalid', () => {
    assert.equal(valid({...fresh(), actions: [{id: 'same', state: 'settled'}, {id: 'same', state: 'settled'}]}), false);
  }],
  ['negative or noninteger chooser cycles are invalid', () => {
    assert.equal(valid({...fresh(), chooser: {phase: 'unknown', cycle: -1, ref: null}}), false);
    assert.equal(valid({...fresh(), chooser: {phase: 'unknown', cycle: 0.5, ref: null}}), false);
  }],
  ['foreign epochs cannot be restamped into the reducer', () => {
    const s = fresh();
    assert.throws(() => update(s, {epoch: fresh().epoch, type: 'action_started', id: 'foreign'}), /Matching adapter epoch/);
  }],
  ['pending actions block both settlement flags until actual completion', () => {
    let s = fresh();
    s = update(s, event(s, 'action_started', {id: 'click'}));
    assert.equal(flags(s, clearWindows, s).actions_settled, false);
    s = update(s, event(s, 'action_settled', {id: 'click'}));
    assert.equal(flags(s, clearWindows, s).actions_settled, true);
  }],
  ['unknown actions remain recorded and cannot later be relabelled settled', () => {
    let s = fresh();
    s = update(s, event(s, 'action_started', {id: 'timeout'}));
    s = update(s, event(s, 'action_unknown', {id: 'timeout'}));
    assert.equal(s.actions.length, 1);
    assert.equal(flags(s, clearWindows, s).actions_settled, false);
    assert.throws(() => update(s, event(s, 'action_settled', {id: 'timeout'})), /Matching pending/);
  }],
  ['missing and repeated action completion are rejected', () => {
    let s = fresh();
    assert.throws(() => update(s, event(s, 'action_settled', {id: 'absent'})), /Matching pending/);
    s = update(s, event(s, 'action_started', {id: 'done'}));
    s = update(s, event(s, 'action_settled', {id: 'done'}));
    assert.throws(() => update(s, event(s, 'action_settled', {id: 'done'})), /Matching pending/);
  }],
  ['action ids cannot be reused after settlement', () => {
    let s = fresh();
    s = update(s, event(s, 'action_started', {id: 'one'}));
    s = update(s, event(s, 'action_settled', {id: 'one'}));
    assert.throws(() => update(s, event(s, 'action_started', {id: 'one'})), /Unique action/);
  }],
  ['potential creation is recorded before a chooser object exists', () => {
    let s = fresh();
    s = update(s, event(s, 'chooser_creation_started'));
    assert.equal(s.chooser.phase, 'unknown');
    assert.equal(s.chooser.cycle, 1);
    assert.equal(flags(s, clearWindows, s).chooser_closed, false);
    assert.throws(() => update(s, event(s, 'chooser_creation_started')), /unresolved/);
  }],
  ['creation requires a matching round and real nonnull object', () => {
    let s = fresh();
    s = update(s, event(s, 'chooser_creation_started'));
    assert.throws(() => update(s, event(s, 'chooser_created', {cycle: 2, chooser: {}})), /Matching real chooser/);
    assert.throws(() => update(s, event(s, 'chooser_created', {cycle: 1, chooser: null})), /Matching real chooser/);
  }],
  ['a created chooser retains its exact object identity', () => {
    const {state, chooser} = openState();
    assert.equal(state.chooser.ref, chooser);
    assert.equal(flags(state, clearWindows, state).chooser_closed, false);
  }],
  ['closure rejects a different object and a different round', () => {
    const {state, chooser} = openState();
    assert.throws(() => update(state, event(state, 'browser_chooser_closed_observed', {cycle: 1, chooser: {}, closed: true})), /matching closure/);
    assert.throws(() => update(state, event(state, 'browser_chooser_closed_observed', {cycle: 2, chooser, closed: true})), /matching closure/);
  }],
  ['closure requires the literal closed true observation', () => {
    const {state, chooser} = openState();
    assert.throws(() => update(state, event(state, 'browser_chooser_closed_observed', {cycle: 1, chooser, closed: false})), /matching closure/);
  }],
  ['setFiles fulfilment and chooserSubmitted do not imply closure', async () => {
    const f = openFixture();
    f.chooser.setFiles = async () => undefined;
    await f.value.runAwaited('setFiles', () => f.chooser.setFiles('/offline/existing.docx'), outcome => outcome.kind === 'fulfilled');
    f.chooser.chooserSubmitted = true;
    assert.equal(f.value.diagnostic().chooser_phase, 'open');
    assert.equal((await f.value.readSettlement(settlement)).chooser_closed, false);
  }],
  ['only matching closure changes the lifecycle to closed-confirmed', () => {
    let {state, chooser} = openState();
    state = update(state, event(state, 'browser_chooser_closed_observed', {cycle: 1, chooser, closed: true}));
    assert.equal(state.chooser.phase, 'closed_confirmed');
    assert.equal(flags(state, clearWindows, state).chooser_closed, true);
  }],
  ['closure cannot be invented for a never-created chooser', () => {
    const s = fresh();
    assert.throws(() => update(s, event(s, 'browser_chooser_closed_observed', {cycle: 0, chooser: {}, closed: true})), /matching closure/);
  }],
  ['a new creation round advances and invalidates the prior closure', () => {
    let {state, chooser} = openState();
    state = update(state, event(state, 'browser_chooser_closed_observed', {cycle: 1, chooser, closed: true}));
    state = update(state, event(state, 'chooser_creation_started'));
    assert.equal(state.chooser.cycle, 2);
    assert.equal(flags(state, clearWindows, state).chooser_closed, false);
  }],
  ['missing window title remains unsafe', () => {
    const s = fresh();
    assert.equal(flags(s, [{modal: false}], s).chooser_closed, false);
  }],
  ['missing or true modal remains unsafe', () => {
    const s = fresh();
    assert.equal(flags(s, [{title: 'Chromium'}], s).chooser_closed, false);
    assert.equal(flags(s, [{modal: true, title: 'Chromium'}], s).chooser_closed, false);
  }],
  ['Open File title blocks cleanup even when modal is false', () => {
    const s = fresh();
    assert.equal(flags(s, [{modal: false, title: 'OPEN FILE'}], s).chooser_closed, false);
  }],
  ['sparse or nonarray window observations remain unsafe', () => {
    const s = fresh();
    assert.equal(flags(s, Array(1), s).chooser_closed, false);
    assert.equal(flags(s, {windows: clearWindows}, s).chooser_closed, false);
  }],
  ['ledger change during a window read invalidates cleanup freshness', () => {
    const start = fresh();
    let end = update(start, event(start, 'action_started', {id: 'during-read'}));
    end = update(end, event(end, 'action_settled', {id: 'during-read'}));
    assert.equal(flags(end, clearWindows, start).actions_settled, true);
    assert.equal(flags(end, clearWindows, start).chooser_closed, false);
  }],
  ['empty native window list cannot close an unknown browser lifecycle', () => {
    let s = fresh();
    s = update(s, event(s, 'chooser_creation_started'));
    assert.equal(flags(s, [], s).chooser_closed, false);
  }],
  ['adapter requires complete nonsecret scope and actual read capability', () => {
    assert.throws(() => adapter({scope: {...scope, tab_id: ''}, readWindows: async () => []}), /scope\/capability/);
    assert.throws(() => adapter({scope, readWindows: null}), /scope\/capability/);
  }],
  ['adapter freezes its surface and copies bound scope before later mutation', async () => {
    const input = {...scope};
    const a = adapter({scope: input, freshInstance: true, readWindows: async () => clearWindows});
    input.tab_id = 'changed';
    assert.equal(Object.isFrozen(a), true);
    assert.equal((await a.readSettlement(settlement)).tab_id, scope.tab_id);
  }],
  ['adapter rejects foreign and copied action tickets', () => {
    const a = fixture().value;
    const b = fixture().value;
    const ticket = a.beginAction('click');
    assert.throws(() => b.finishAction(ticket, 'settled'), /matching action ticket/);
    assert.throws(() => a.finishAction({...ticket}, 'settled'), /matching action ticket/);
    a.finishAction(ticket, 'settled');
    assert.throws(() => a.finishAction(ticket, 'settled'), /matching action ticket/);
  }],
  ['action labels and completion states are bounded', () => {
    const a = fixture().value;
    assert.throws(() => a.beginAction(''), /label/);
    assert.throws(() => a.beginAction('x'.repeat(101)), /label/);
    const t = a.beginAction('one');
    assert.throws(() => a.finishAction(t, 'cancelled'), /matching action ticket/);
    assert.equal(a.diagnostic().pending_actions, 1);
  }],
  ['runAwaited requires a documented completion classifier', async () => {
    const a = fixture().value;
    await assert.rejects(a.runAwaited('op', async () => 1), /documented completion classifier/);
    assert.equal(a.diagnostic().settled_actions, 0);
  }],
  ['documented fulfilled completion records exactly one settled action', async () => {
    const a = fixture().value;
    assert.equal(await a.runAwaited('op', async () => 7, outcome => outcome.kind === 'fulfilled' && outcome.value === 7), 7);
    assert.equal(a.diagnostic().settled_actions, 1);
    assert.equal(a.diagnostic().pending_actions, 0);
  }],
  ['fulfilment without documented completion remains unknown', async () => {
    const a = fixture().value;
    await assert.rejects(a.runAwaited('op', async () => 'success', () => false), /completion unconfirmed/);
    assert.equal(a.diagnostic().unknown_actions, 1);
  }],
  ['timeout rejection remains unknown and preserves original error', async () => {
    const a = fixture().value;
    const timeout = Error('synthetic lost host reply');
    await assert.rejects(a.runAwaited('click', async () => {throw timeout;}, () => false), error => error === timeout);
    assert.equal(a.diagnostic().unknown_actions, 1);
  }],
  ['documented ended rejection may settle while preserving its error', async () => {
    const a = fixture().value;
    const ended = Error('synthetic documented completed rejection');
    await assert.rejects(a.runAwaited('click', async () => {throw ended;}, outcome => outcome.kind === 'rejected' && outcome.error === ended), error => error === ended);
    assert.equal(a.diagnostic().settled_actions, 1);
  }],
  ['classifier exceptions preserve unknown completion', async () => {
    const a = fixture().value;
    await assert.rejects(a.runAwaited('op', async () => 1, () => {throw Error('classifier');}), /completion unconfirmed/);
    assert.equal(a.diagnostic().unknown_actions, 1);
  }],
  ['an asynchronous classifier is never accepted as synchronous true', async () => {
    const a = fixture().value;
    await assert.rejects(a.runAwaited('op', async () => 1, async () => true), /completion unconfirmed/);
    assert.equal(a.diagnostic().unknown_actions, 1);
  }],
  ['business save unknown can be settled only by a completion contract', async () => {
    const a = fixture().value;
    const result = await a.runAwaited('save', async () => ({business_status: 'unknown', operation_ended: true}), outcome => outcome.kind === 'fulfilled' && outcome.value.operation_ended === true);
    assert.equal(result.business_status, 'unknown');
    assert.equal(a.diagnostic().settled_actions, 1);
  }],
  ['runAwaited remains pending until its awaited operation actually returns', async () => {
    const a = fixture().value;
    let resolve;
    const operation = new Promise(done => {resolve = done;});
    const running = a.runAwaited('op', () => operation, () => true);
    assert.equal(a.diagnostic().pending_actions, 1);
    resolve(1);
    await running;
    assert.equal(a.diagnostic().settled_actions, 1);
  }],
  ['chooser creation rejects invalid timestamps before changing state', () => {
    const a = fixture({now: () => 'not-a-time'}).value;
    assert.throws(() => a.beginChooserCreation(), /Actual creation time/);
    assert.equal(a.diagnostic().chooser_phase, 'never_created');
  }],
  ['creation object registration rejects foreign and copied tickets', () => {
    const a = fixture().value;
    const b = fixture().value;
    const t = a.beginChooserCreation();
    b.beginChooserCreation();
    assert.throws(() => b.recordChooserCreated(t, {}), /Matching creation ticket/);
    assert.throws(() => a.recordChooserCreated({...t}, {}), /Matching creation ticket/);
    a.recordChooserCreated(t, {});
  }],
  ['closure receipt rejects foreign epochs and copied creation tickets', () => {
    const f = openFixture();
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, epoch: Symbol('foreign')}), /Fresh matching/);
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, ticket: {...f.ticket}}), /Fresh matching/);
  }],
  ['closure receipt rejects an undocumented source', () => {
    const f = openFixture();
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, source: 'setFiles_returned'}), /Fresh matching/);
  }],
  ['closure observation cannot precede chooser creation', () => {
    const f = openFixture();
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, observed_at: '2026-10-10T23:59:59.000Z'}), /Fresh matching/);
  }],
  ['closure observation cannot come from the future', () => {
    const f = openFixture();
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, observed_at: '2026-10-11T00:00:03.000Z'}), /Fresh matching/);
  }],
  ['closure observation older than sixty seconds is stale', () => {
    const f = openFixture();
    f.setTime('2026-10-11T00:01:02.000Z');
    assert.throws(() => f.value.recordChooserClosed(f.receipt), /Fresh matching/);
  }],
  ['closure receipt requires valid observation and current times', () => {
    const f = openFixture();
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, observed_at: 'invalid'}), /Fresh matching/);
    f.setTime('invalid');
    assert.throws(() => f.value.recordChooserClosed(f.receipt), /Fresh matching/);
  }],
  ['adapter closure requires the exact chooser object and round', () => {
    const f = openFixture();
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, chooser: {}}), /matching closure/);
    assert.throws(() => f.value.recordChooserClosed({...f.receipt, cycle: 2}), /Fresh matching/);
    assert.equal(f.value.diagnostic().chooser_phase, 'open');
  }],
  ['fresh matching receipt authorizes closure but cannot be replayed', async () => {
    const f = openFixture();
    f.value.recordChooserClosed(f.receipt);
    assert.equal((await f.value.readSettlement(settlement)).chooser_closed, true);
    assert.throws(() => f.value.recordChooserClosed(f.receipt), /matching closure/);
  }],
  ['settlement rejects wrong purpose or scope before reading windows', async () => {
    let reads = 0;
    const a = fixture({readWindows: async () => {reads++; return clearWindows;}}).value;
    await assert.rejects(a.readSettlement({...settlement, purpose: 'prepare'}), /Matching settlement scope/);
    await assert.rejects(a.readSettlement({...settlement, target_account: 'other'}), /Matching settlement scope/);
    assert.equal(reads, 0);
  }],
  ['settlement detects action changes during the real awaited read', async () => {
    let finishRead;
    const waiting = new Promise(done => {finishRead = done;});
    const a = fixture({readWindows: () => waiting}).value;
    const reading = a.readSettlement(settlement);
    const t = a.beginAction('during-read');
    a.finishAction(t, 'settled');
    finishRead(clearWindows);
    const result = await reading;
    assert.equal(result.actions_settled, true);
    assert.equal(result.chooser_closed, false);
  }],
  ['missing native title and read failures cannot produce success receipts', async () => {
    const missing = fixture({readWindows: async () => [{modal: false}]}).value;
    assert.equal((await missing.readSettlement(settlement)).chooser_closed, false);
    const failed = fixture({readWindows: async () => {throw Error('synthetic read failure');}}).value;
    await assert.rejects(failed.readSettlement(settlement), /read failure/);
  }],
  ['adapter exposes no reset, raw-event stamper or ledger replacement hook', () => {
    const names = Object.keys(fixture().value).sort();
    assert.deepEqual(names, ['beginAction', 'beginChooserCreation', 'diagnostic', 'finishAction', 'readSettlement', 'recordChooserClosed', 'recordChooserCreated', 'runAwaited'].sort());
  }],
];

for (const [name, run] of cases) await test(name, run);
