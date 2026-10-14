// Tests import production sources directly; no review-copy module is exercised.
// OFFLINE ONLY. Generic short text, synthetic receipts and in-memory hosts.
// node:vm loads the reviewed plain core and cleanup definitions in this local
// process. This is never a browser/CUA loader, platform call or publication.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {ACCOUNTS, NATIVE_CHANNEL, SCOPE_FIELDS} from '../../scripts/browser-upload/coordinate/src/coordinate-contract.js';
import {createNativeCoordinateCleanup} from '../../scripts/browser-upload/coordinate/src/native-coordinate-adapter.js';
import {createV155NativeParentBridge} from '../../scripts/browser-upload/coordinate/src/v155-native-parent-bridge.js';
import {createTrackedParentObservations} from '../../scripts/browser-upload/coordinate/src/tracked-observations.js';

const plainCore = readFileSync(new URL('../../scripts/browser-upload/private-draft-transfer.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
const plainCleanup = readFileSync(new URL('../../scripts/browser-upload/coordinate/reviewed-cleanup/reviewed-cleanup.js', import.meta.url), 'utf8');
const cleanupContext = vm.createContext({});
vm.runInContext(plainCleanup + '\nthis.factory = createChooserCleanupAdapter;', cleanupContext,
  {filename: 'offline-reviewed-cleanup.js'});
const INITIAL_TIME = Date.parse('2026-10-11T00:00:00.000Z');
const BLANK = 'https://mp.toutiao.com/profile_v4/graphic/publish';
const DRAFT = BLANK + '?pgc_id=10000000001';
const CORE_FIELDS = SCOPE_FIELDS.filter(field => field !== 'host_id');
const completed = value => ({...value, fixture_action_completed: true});
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise(done => {resolve = done;});
  return {promise, resolve};
}

function fixture(options = {}) {
  const platform = options.platform || 'toutiao';
  const blankUrl = platform === 'toutiao' ? BLANK : 'https://zhuanlan.zhihu.com/write';
  const draftUrl = platform === 'toutiao' ? DRAFT : 'https://zhuanlan.zhihu.com/p/10000000001/edit';
  const savingState = platform === 'toutiao' ? 'toutiao_saving' : 'saving';
  const statusTool = platform === 'toutiao' ? 'record_article_status' : 'record_article_delivery';
  const completeState = platform === 'toutiao' ? 'completed' : 'saved';
  const scope = Object.freeze({article_id: 'synthetic-short-bridge-article', platform,
    target_account: ACCOUNTS[platform], browser_session: 'synthetic-bridge-session-' + platform,
    executor_id: 'synthetic-bridge-executor', tab_id: 'synthetic-bridge-tab-' + platform, host_id: 'synthetic-bridge-host'});
  const coreScope = Object.freeze(Object.fromEntries(CORE_FIELDS.map(key => [key, scope[key]])));
  const artifact = Object.freeze({absolute_path: '/synthetic-host/original-fixture.docx',
    sha256: 'a'.repeat(64), size_bytes: 2048, host_id: scope.host_id});
  const word = Object.freeze({output_id: 'synthetic-word-output', sha256: artifact.sha256, size: artifact.size_bytes});
  const baseline = Object.freeze({title: '完整离线桥测试标题',
    paragraphs: ['离线合成第一段。', '离线合成第二段。'],
    images: [{sha256: 'b'.repeat(64), after_paragraph: 1, natural_width: 600, natural_height: 400}]});
  const file = Object.freeze({filename: 'original-fixture.docx', absolute_path: artifact.absolute_path,
    browser_session: scope.browser_session, sha256: artifact.sha256, size: artifact.size_bytes,
    visible_in_browser: true, checked_at: new Date(INITIAL_TIME).toISOString()});
  const events = [], observationInputs = [], mouseCalls = [], authenticationInputs = [], parentReceipts = {};
  let clock = INITIAL_TIME, sequence = 0, filename = '', title = '', picker = null,
    canonicalPrepared = null, bridge, f, nativePresent = false;
  const now = () => new Date(clock).toISOString();
  const advance = millis => {clock += millis;};
  const windowId = 'synthetic-bridge-native-window';
  const geometry = Object.freeze({source: 'documented_host_coordinate_mapping', screenshot_width: 1000,
    screenshot_height: 800, mouse_width: 1000, mouse_height: 800, mouse_origin_x: 0, mouse_origin_y: 0});
  const snapshot = kind => completed({...scope, source: 'official_host_screenshot', kind,
    screenshot_id: 'synthetic-bridge-shot-' + (++sequence), screenshot_ref: {synthetic: sequence},
    scene_id: 'synthetic-bridge-scene-' + sequence, observed_at: now(), geometry,
    ...(kind === 'page' ? {account_verified: true, account_evidence_ref: 'synthetic-account-evidence',
      is_new_draft: true, body_empty: true, title: '', editor_url: blankUrl}
      : {channel: NATIVE_CHANNEL, window_id: windowId, owner_tab_id: scope.tab_id,
        active: true, active_window_id: windowId, modal: true, title: 'Open File',
        filename, files_selected: false, submitted: false})});
  const coordinateOperations = {
    inspectFile: async () => completed({...scope, ...artifact, source: 'same_host_file_observation', observed_at: now()}),
    capturePage: async () => snapshot('page'),
    identifyTarget: async ({snapshot: observed, semantic}) => completed({snapshot: observed, semantic,
      unique: true, visible: true, unobscured: true, center_unobscured: true,
      enabled: true, reviewed: true, evidence_kind: 'visible_text', evidence_ref: 'synthetic-visible-control',
      bounds: {x: 60 + sequence * 20, y: 100 + sequence * 15, width: 50, height: 30}}),
    confirmScene: async ({snapshot: observed}) => completed({...scope, source: 'official_host_scene_observation',
      scene_id: observed.scene_id, screenshot_id: observed.screenshot_id,
      window_id: observed.window_id, active: true, active_window_id: observed.window_id,
      unchanged: true, observed_at: now()}),
    clickOnce: async args => {
      mouseCalls.push(args);
      if (args.semantic === 'native_open') nativePresent = false;
      return completed({...scope, source: 'official_host_mouse_receipt', scene_id: args.snapshot.scene_id,
        screenshot_id: args.snapshot.screenshot_id, ...args.coordinates, observed_at: now()});
    },
    observeNativeDialog: async ({after_click}) => {
      nativePresent = true;
      return completed({...scope, source: 'official_native_dialog_observation', state: 'native_dialog',
        channel: NATIVE_CHANNEL, owner_tab_id: scope.tab_id, creation_click: after_click,
        window_id: windowId, modal: true, title: 'Open File', active: true, active_window_id: windowId,
        files_selected: false, submitted: false, observed_at: now()});
    },
    captureNativeDialog: async () => snapshot('native_dialog'),
    enterNativeFilename: async ({window_id, absolute_path, submit}) => {
      assert.equal(submit, false);
      filename = absolute_path;
      return completed({...scope, source: 'official_native_filename_receipt', window_id,
        absolute_path, submitted: false, enter_pressed: false, observed_at: now()});
    },
    observeNativeClosure: async ({epoch, window_id, cycle, open_click, creation_click}) => {
      nativePresent = false;
      return completed({...scope, source: 'documented_native_window_closure', channel: NATIVE_CHANNEL,
        epoch, window_id, cycle, open_click, creation_click, closed: true, observed_at: now()});
    },
  };
  const coordinateHost = Object.fromEntries(Object.entries(coordinateOperations).map(([method, operation]) => [method, async args => {
    events.push({method: 'coordinate.' + method, args});
    return options.coordinate?.[method] ? options.coordinate[method](args, operation, f) : operation(args);
  }]));
  const cleanup = createNativeCoordinateCleanup({scope, now, makeCleanupAdapter: cleanupContext.factory,
    readWindows: async () => {
      events.push({method: 'window.read'});
      return nativePresent ? [{modal: true, title: 'Open File', id: windowId}]
        : [{modal: false, title: 'Synthetic Chromium', id: 'synthetic-browser-window'}];
    }});
  const body = () => ({paragraphs: clone(baseline.paragraphs), images: [{reference_sha256: baseline.images[0].sha256,
    after_paragraph: 1, inspected: true, inspected_at: now(), loaded: true,
    natural_width: 600, natural_height: 400, display_width: 300, display_height: 200,
    observed_url: 'https://synthetic-image.invalid/one.png'}], captions: [], unclassified: []});
  const page = context => {
    const empty = ['preflight', 'prepared', 'consume', 'submit'].includes(context.purpose);
    const independent = context.purpose === 'independent_readback';
    return {...coreScope, ...(independent ? {tab_id: 'synthetic-independent-readback-tab'} : {}),
      source: 'documented_host_observation', checked_at: now(), editor_url: empty ? blankUrl : draftUrl,
      account_url: platform === 'toutiao' ? 'https://www.toutiao.com/c/user/' + scope.target_account + '/'
        : 'https://www.zhihu.com/people/' + scope.target_account, account_menu_observed: true,
      login_blocked: false, private_draft: true, pending: false, save_failed: false,
      title: empty ? '' : title, body: empty ? {paragraphs: [], images: [], captions: [], unclassified: []} : body(),
      file: clone(file), existing_drafts: {account: scope.target_account, current_editor_url: blankUrl,
        editor_checked: true, editor_empty: true, private_draft: true, draft_list_checked: true,
        prior_submission: 'never_attempted', checked_at: now(), matching_editor_urls: [],
        evidence_reference: 'synthetic-history-evidence'},
      ...(picker ? {import_channel: NATIVE_CHANNEL, native_dialog_owned: nativePresent,
        prepared_id: picker.prepared_id, window_id: picker.window_id, cycle: picker.cycle} : {}),
      title_control: {editor_url: draftUrl, checked_at: now(), unique: true, visible: true, enabled: true,
        tag: 'INPUT', type: 'text', label: '标题'},
      ...(platform === 'zhihu' ? {cover: {loaded: true, inspected: true, inspected_at: now(),
        reference_sha256: baseline.images[0].sha256, observed_url: 'https://synthetic-image.invalid/cover.png'}} : {}),
      saved_indicator_observed: true, saved_at: now(), ...(independent ? {reopened_at: now()} : {})};
  };
  const observations = {
    async inspect(input) {
      observationInputs.push({method: 'inspect', input});
      events.push({method: 'observations.inspect', args: input});
      const value = input.purpose === 'settlement' ? await bridge.settlement() : page(input);
      return options.inspect ? options.inspect(value, input, f) : value;
    },
    async writeTitle(input) {
      observationInputs.push({method: 'writeTitle', input, receiver: this, argument_count: arguments.length});
      events.push({method: 'observations.writeTitle', args: input});
      title = input.title;
      return options.writeTitle ? options.writeTitle(input, f) : undefined;
    },
    async reopenAndInspect(input) {
      observationInputs.push({method: 'reopenAndInspect', input, receiver: this, argument_count: arguments.length});
      events.push({method: 'observations.reopenAndInspect', args: input});
      const value = page(input);
      return options.reopen ? options.reopen(value, input, f) : value;
    },
  };
  async function authenticateCurrentChain(input) {
    events.push({method: 'parent.authenticateCurrentChain', args: input});
    authenticationInputs.push(input);
    if (canonicalPrepared === null) canonicalPrepared = input.prepared;
    assert.equal(input.prepared, canonicalPrepared);
    assert.equal(input.prepared.channel, NATIVE_CHANNEL);
    assert.equal(input.prepared.ready, true);
    assert.equal(input.prepared.files_selected, false);
    assert.equal(input.prepared.submitted, false);
    assert.equal(input.prepared.window_id, windowId);
    assert.equal(input.prepared.cycle, 1);
    assert.equal(input.prepared.sha256, artifact.sha256);
    assert.equal(input.prepared.size_bytes, artifact.size_bytes);
    const chain = {...scope, source: 'authenticated_parent_current_chain', channel: NATIVE_CHANNEL,
      prepared: input.prepared, execute_import: parentReceipts.consumed?.execute_import === true,
      delivery_status: parentReceipts.saving?.state === savingState &&
        CORE_FIELDS.every(key => parentReceipts.saving[key] === scope[key]) ? 'saving' : 'not_saving',
      claim_confirmed: parentReceipts.claim?.claimed === true,
      reserved: parentReceipts.reserved?.reserved === true,
      consumed: parentReceipts.consumed?.execute_import === true,
      current: parentReceipts.current !== false, artifact_sha256: artifact.sha256, artifact_size_bytes: artifact.size_bytes,
      attempt_id: parentReceipts.consumed?.attempt.attempt_id,
      claimed_at: parentReceipts.claim?.claimed_at, reserved_at: parentReceipts.reserved_at,
      consumed_at: parentReceipts.consumed?.attempt.consumed_at, saving_at: parentReceipts.saving_at};
    return options.authenticate ? options.authenticate(chain, input, f) : chain;
  }
  // The fixture callbacks above each contain ONE local synthetic operation.
  // Their completion classifier applies only to that documented fixture; real
  // callbacks must register their individual official operations independently.
  const confirmCompletion = (label, outcome) => outcome.kind === 'fulfilled' &&
    (label.startsWith('parent.') || outcome.value?.fixture_action_completed === true);
  const trackedObservations = createTrackedParentObservations({scope, cleanup, confirmCompletion,
    build: ({runOfficialAction}) => options.buildObservations ? options.buildObservations({runOfficialAction, observations}) : ({
      inspect: input => runOfficialAction('inspect', () => observations.inspect(input)),
      writeTitle: input => runOfficialAction('writeTitle', () => observations.writeTitle(input)),
      reopenAndInspect: input => runOfficialAction('reopenAndInspect', () => observations.reopenAndInspect(input)),
    })});
  const bridgeArgs = {scope, artifact, coordinateHost, cleanup, observations: trackedObservations, authenticateCurrentChain,
    preparePlan: ['import_document'], instanceId: 'synthetic-v155-native-bridge', now,
    confirmCompletion};
  bridge = createV155NativeParentBridge(bridgeArgs);
  const coreContext = vm.createContext({URL});
  vm.runInContext(plainCore + '\nthis.factory = createPrivateDraftTransfer;', coreContext,
    {filename: 'offline-reviewed-v155-native-core.js'});
  const host = {...bridge.host, preparePicker: async input => {
    picker = await bridge.host.preparePicker(input);
    events.push({method: 'parent.actualNativePrepareReturned', value: picker});
    return picker;
  }};
  const api = coreContext.factory({scope: coreScope, word, baseline, host, importChannel: NATIVE_CHANNEL, now});
  const attempt = (state, extras = {}) => ({article_id: scope.article_id, platform: scope.platform,
    target_account: scope.target_account, word_sha256: word.sha256, word_size: word.size,
    authorization_kind: 'new_word', attempt_id: 'synthetic-original-attempt', state,
    consumed_at: state === 'reserved' ? null : now(), editor_urls: [],
    reservation_token: 'synthetic-private-parent-reservation-secret', ...extras});
  async function prepare() {
    const result = await api.prepare();
    assert.equal(result.operation, 'reserve_article_upload');
    return result;
  }
  async function ready() {
    await prepare();
    advance(100);
    parentReceipts.claim = {...coreScope, claimed: true, claimed_at: now(), claim_token: 'synthetic-private-claim-secret'};
    events.push({method: 'parent.claim', value: parentReceipts.claim});
    advance(100);
    parentReceipts.reserved_at = now();
    parentReceipts.reserved = {reserved: true, execute_import: false, attempt: attempt('reserved'),
      reservation_token: 'synthetic-private-parent-reservation-secret'};
    events.push({method: 'parent.reserve', value: parentReceipts.reserved});
    assert.equal((await api.acceptReserved(parentReceipts.reserved)).operation, 'consume_article_upload');
    advance(100);
    parentReceipts.consumed = {execute_import: true, attempt: attempt('outcome_unknown'),
      consume_token: 'synthetic-private-parent-consume-secret'};
    events.push({method: 'parent.consume', value: parentReceipts.consumed});
    const saving = await api.acceptConsumed(parentReceipts.consumed);
    assert.equal(saving.operation, statusTool);
    assert.equal(saving.args.state, savingState);
    advance(100);
    parentReceipts.saving_at = now();
    parentReceipts.saving = {...coreScope, state: savingState, parent_credential: 'synthetic-private-status-secret'};
    events.push({method: 'parent.saving', value: parentReceipts.saving});
    assert.equal((await api.acceptSaving(parentReceipts.saving)).status, 'ready_to_submit');
  }
  const publicFacts = () => ({...coreScope, import_channel: NATIVE_CHANNEL,
    prepared_id: picker.prepared_id, window_id: picker.window_id, cycle: picker.cycle,
    attempt_id: 'synthetic-original-attempt',
    sha256: artifact.sha256, size: artifact.size_bytes, execute_import: true, delivery_status: 'saving'});
  const count = method => events.filter(event => event.method === method).length;
  const openCount = () => mouseCalls.filter(call => call.semantic === 'native_open').length;
  const prepareNative = async () => {
    picker = await bridge.host.preparePicker({...coreScope, import_channel: NATIVE_CHANNEL});
    return picker;
  };
  f = {scope, coreScope, artifact, word, baseline, file, coordinateHost, observations, trackedObservations, bridge, bridgeArgs, api,
    cleanup, events, observationInputs, mouseCalls, authenticationInputs, parentReceipts,
    now, advance, prepare, prepareNative, ready, attempt, publicFacts, count, openCount,
    blankUrl, draftUrl, savingState, statusTool, completeState,
    get picker() {return picker;}, get canonicalPrepared() {return canonicalPrepared;}};
  return f;
}

function assertPublic(value) {
  const seen = new Set();
  function walk(current) {
    assert.notEqual(typeof current, 'function');
    if (!current || typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    for (const key of Reflect.ownKeys(current)) {
      assert.equal(typeof key, 'string');
      assert.equal(/token|credential|password|nonce|native_dialog/i.test(key), false, 'private/function handle key: ' + key);
      walk(current[key]);
    }
  }
  walk(value);
  assert.equal(JSON.stringify(value).includes('synthetic-private-'), false);
}

await test('the original core joins native prepare, same parent chain and one literal-path Open', async () => {
  const f = fixture();
  await f.ready();
  assert.equal(f.openCount(), 0);
  assert.equal(f.count('coordinate.enterNativeFilename'), 0);
  assert.equal(f.count('parent.authenticateCurrentChain'), 0);
  assert.equal((await f.api.submit()).status, 'submitted');
  assert.equal(f.openCount(), 1);
  assert.equal(f.count('coordinate.enterNativeFilename'), 1);
  assert.equal(f.count('parent.authenticateCurrentChain'), 4);
  for (const {prepared} of f.authenticationInputs) assert.equal(prepared, f.canonicalPrepared);
  assert.notEqual(f.canonicalPrepared, f.picker);
  assert.equal(f.canonicalPrepared.prepared_id, f.picker.prepared_id);
  assert.equal(f.canonicalPrepared.window_id, f.picker.window_id);
  assert.equal(f.canonicalPrepared.cycle, f.picker.cycle);
  assert.equal(Object.isFrozen(f.canonicalPrepared), true);
  const input = f.events.find(event => event.method === 'coordinate.enterNativeFilename').args;
  assert.equal(input.absolute_path, f.artifact.absolute_path);
  assert.equal(input.submit, false);
  for (const call of f.mouseCalls) assert.equal(call.coordinates.click_count, 1);
  assert.deepEqual(['parent.claim', 'parent.reserve', 'parent.consume', 'parent.saving'].map(f.count), [1, 1, 1, 1]);
  const prepareIndex = f.events.findIndex(event => event.method === 'parent.actualNativePrepareReturned');
  const claimIndex = f.events.findIndex(event => event.method === 'parent.claim');
  const authenticateIndex = f.events.findIndex(event => event.method === 'parent.authenticateCurrentChain');
  assert.ok(prepareIndex < claimIndex && claimIndex < authenticateIndex);
  const settlement = await f.bridge.settlement();
  assert.equal(settlement.actions_settled, true);
  assert.equal(settlement.chooser_closed, true);
  assert.equal(settlement.native_dialog_closed, true);
  for (const key of ['prepared_id', 'window_id', 'cycle']) assert.equal(settlement[key], f.picker[key]);
  assert.equal(Object.hasOwn(settlement, 'saved'), false);
  assert.equal(Object.hasOwn(settlement, 'verified'), false);
  assert.equal((await f.api.submit()).error_code, 'phase_invalid');
  assert.equal(f.openCount(), 1);
});

await test('original parent secrets stay out of coordinate calls and inspector contexts', async () => {
  const f = fixture();
  await f.ready();
  await f.api.submit();
  assert.ok(f.parentReceipts.claim.claim_token);
  assert.ok(f.parentReceipts.reserved.reservation_token);
  assert.ok(f.parentReceipts.consumed.consume_token);
  for (const event of f.events.filter(event => event.method.startsWith('coordinate.'))) assertPublic(event.args);
  for (const event of f.observationInputs) assertPublic(event.input);
  for (const event of f.observationInputs.filter(event => ['prepared', 'consume', 'submit'].includes(event.input.purpose))) {
    assert.equal(event.input.prepared_id, f.picker.prepared_id);
    assert.equal(event.input.window_id, f.picker.window_id);
    assert.equal(event.input.cycle, f.picker.cycle);
    assert.equal(event.input.import_channel, NATIVE_CHANNEL);
  }
});

for (const [field, value] of [
  ...CORE_FIELDS.map(key => [key, 'foreign-scope']), ['host_id', 'foreign-host'],
]) {
  await test('bridge entry rejects changed ' + field + ' before observation or native prepare', async () => {
    const f = fixture();
    const context = {...f.coreScope, [field]: value, purpose: 'document', import_channel: NATIVE_CHANNEL};
    await assert.rejects(f.bridge.host.preparePicker(context), /original_core_scope_required/);
    await assert.rejects(f.bridge.host.inspect(context), /original_core_scope_required/);
    assert.equal(f.events.length, 0);
  });
}

for (const [field, value] of [
  ...CORE_FIELDS.map(key => [key, 'foreign-scope']),
  ['prepared_id', 'foreign-prepared'], ['window_id', 'foreign-window'], ['cycle', 2],
  ['sha256', 'c'.repeat(64)], ['size', 2047], ['import_channel', 'browser_filechooser'],
  ['execute_import', false], ['delivery_status', 'ready'],
]) {
  await test('native open refuses changed public core fact ' + field, async () => {
    const f = fixture();
    await f.ready();
    await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, {...f.publicFacts(), [field]: value}),
      /original_core_scope_required|original_core_native_permission_required/);
    assert.equal(f.count('parent.authenticateCurrentChain'), 0);
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
    await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /single_parent_native_open_required/);
  });
}

await test('the fixed original path cannot be replaced even with valid public facts', async () => {
  const f = fixture();
  await f.ready();
  await assert.rejects(f.picker.nativeDialog.open('/synthetic-host/rebuilt.docx', f.publicFacts()), /original_core_native_permission_required/);
  assert.equal(f.count('parent.authenticateCurrentChain'), 0);
  assert.equal(f.count('coordinate.enterNativeFilename'), 0);
  assert.equal(f.openCount(), 0);
});

for (const [name, change] of [
  ['raw claim token', value => ({...value, claim_token: 'synthetic-private-secret'})],
  ['raw consume receipt', value => ({...value, consumed: {execute_import: true, token: 'synthetic-private-secret'}})],
  ['explicit extra host field', value => ({...value, host_id: 'synthetic-bridge-host'})],
  ['enumerable symbol', value => Object.assign(value, {[Symbol('synthetic-private-secret')]: 'synthetic-private-secret'})],
  ['nonenumerable symbol', value => Object.defineProperty(value, Symbol('synthetic-private-secret'), {value: 'synthetic-private-secret'})],
  ['hidden claim token', value => Object.defineProperty(value, 'claim_token', {value: 'synthetic-private-secret'})],
  ['missing core fact', value => {delete value.delivery_status; return value;}],
]) {
  await test(name + ' is rejected before authenticating or entering the filename', async () => {
    const f = fixture();
    await f.ready();
    await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, change({...f.publicFacts()})), /public_core_import_facts_required/);
    assert.equal(f.count('parent.authenticateCurrentChain'), 0);
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
  });
}

await test('saving strings without the original consumed parent chain never authorize native open', async () => {
  const f = fixture();
  await f.prepare();
  await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /real_consumed_saving_chain_required/);
  assert.equal(f.count('coordinate.enterNativeFilename'), 0);
  assert.equal(f.openCount(), 0);
  await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /single_parent_native_open_required/);
});

await test('a foreign parent attempt after issue is blocked without consuming or replaying anything', async () => {
  let reads = 0;
  const f = fixture({authenticate: chain => ++reads === 1 ? chain : {...chain, attempt_id: 'foreign-parent-attempt'}});
  await f.ready();
  const value = await f.api.submit();
  assert.equal(value.error_code, 'host_operation_unknown');
  assert.equal(value.phase, 'unknown');
  assert.equal(f.count('coordinate.enterNativeFilename'), 0);
  assert.equal(f.openCount(), 0);
  assert.equal(f.count('parent.consume'), 1);
});

await test('concurrent calls to the same native handle cannot race the first parent authentication', async () => {
  const waiting = deferred(), reached = deferred();
  let first = true;
  const f = fixture({authenticate: async chain => {
    if (first) {first = false; reached.resolve(); await waiting.promise;}
    return chain;
  }});
  await f.ready();
  const original = f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts());
  await reached.promise;
  await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /single_parent_native_open_required/);
  waiting.resolve();
  const value = await original;
  assert.equal(value.prepared_id, f.picker.prepared_id);
  assert.equal(value.window_id, f.picker.window_id);
  assert.equal(value.cycle, f.picker.cycle);
  assert.equal(f.openCount(), 1);
});

await test('unknown Open completion remains fenced through both original core and bridge handle', async () => {
  const f = fixture({coordinate: {clickOnce: async (args, original) => {
    const value = await original(args);
    if (args.semantic === 'native_open') throw Error('synthetic lost Open reply');
    return value;
  }}});
  await f.ready();
  assert.equal((await f.api.submit()).error_code, 'host_operation_unknown');
  assert.equal(f.bridge.diagnostic().phase, 'unknown');
  assert.equal(f.bridge.diagnostic().unknown_actions, 1);
  assert.equal(f.openCount(), 1);
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
  await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /single_parent_native_open_required/);
  f.bridge.cancelLocal();
  await f.bridge.observeClosureForSettlement();
  const settled = await f.bridge.settlement();
  assert.equal(settled.native_dialog_closed, true);
  assert.equal(settled.actions_settled, false);
  assert.equal(settled.chooser_closed, false);
  assert.equal(f.bridge.diagnostic().unknown_actions, 1);
  assert.equal(f.openCount(), 1);
});

await test('unknown prepare cannot be reset or repeated through the bridge', async () => {
  const f = fixture({coordinate: {observeNativeDialog: async (args, original) => ({...(await original(args)), title: undefined})}});
  const context = {...f.coreScope, import_channel: NATIVE_CHANNEL};
  await assert.rejects(f.bridge.host.preparePicker(context), /native_prepare_unconfirmed/);
  await assert.rejects(f.bridge.host.preparePicker(context), /single_explicit_native_prepare_required/);
  assert.equal(f.count('coordinate.observeNativeDialog'), 1);
  assert.equal(f.count('coordinate.enterNativeFilename'), 0);
  assert.equal((await f.bridge.settlement()).chooser_closed, false);
});

await test('inspector receives only scope and exact-window identifiers, never raw native handles or credentials', async () => {
  const f = fixture();
  await f.prepare();
  await f.bridge.host.inspect({...f.coreScope, purpose: 'consume', import_channel: NATIVE_CHANNEL,
    native_dialog: f.picker.nativeDialog, chooser: {setFiles() {}},
    prepared_id: 'foreign-request', window_id: 'foreign-window', cycle: 900,
    claim_token: 'synthetic-private-secret', raw_credential: {token: 'synthetic-private-secret'}});
  const input = f.observationInputs.at(-1).input;
  assertPublic(input);
  assert.equal(input.prepared_id, f.picker.prepared_id);
  assert.equal(input.window_id, f.picker.window_id);
  assert.equal(input.cycle, f.picker.cycle);
  assert.equal(Object.isFrozen(input), true);
});

for (const purpose of ['prepared', 'consume', 'submit']) {
  for (const [field, value] of [['native_dialog_owned', false], ['import_channel', 'browser_filechooser'],
    ['prepared_id', 'foreign-prepared'], ['window_id', 'foreign-window'], ['cycle', 2]]) {
    await test('bridge rejects actual ' + purpose + ' observation with changed ' + field, async () => {
      const f = fixture({inspect: (observed, input) => input.purpose === purpose ? {...observed, [field]: value} : observed});
      // Use direct prepare so this test can independently inspect every stage.
      await f.prepareNative();
      await assert.rejects(f.bridge.host.inspect({...f.coreScope, purpose, import_channel: NATIVE_CHANNEL}),
        /actual_native_ownership_observation_required/);
      assert.equal(f.count('coordinate.enterNativeFilename'), 0);
      assert.equal(f.openCount(), 0);
    });
  }
}

for (const purpose of ['preflight', 'observe', 'saved']) {
  await test(purpose + ' observation is returned unchanged without manufacturing ownership or save facts', async () => {
    const original = Object.freeze({synthetic: true, source: 'documented_host_observation',
      native_dialog_owned: false, saved_indicator_observed: false, pending: true,
      chooser_closed: false, actions_settled: false});
    const f = fixture({inspect: () => original});
    const value = await f.bridge.host.inspect({...f.coreScope, purpose});
    assert.equal(value, original);
    assert.equal(value.native_dialog_owned, false);
    assert.equal(value.saved_indicator_observed, false);
    assert.equal(Object.hasOwn(value, 'verified'), false);
    assert.equal(Object.hasOwn(value, 'completed'), false);
  });
}

await test('original core settlement independently reads the same ledger without registering itself as pending', async () => {
  const f = fixture({inspect: (value, input) => {
    assert.notEqual(input.purpose, 'settlement', 'the old observation callback cannot manufacture cleanup facts');
    return value;
  }});
  await f.prepare();
  f.api.cancel();
  f.bridge.cancelLocal();
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  assert.equal(f.bridge.diagnostic().native_phase, 'open');
  await f.bridge.observeClosureForSettlement();
  const before = f.bridge.diagnostic();
  assert.equal((await f.api.settleClosed()).status, 'settled');
  const after = f.bridge.diagnostic();
  assert.equal(after.pending_actions, 0);
  assert.equal(after.unknown_actions, 0);
  assert.equal(after.settled_actions, before.settled_actions);
  assert.equal(f.observationInputs.some(call => call.input.purpose === 'settlement'), false);
  assert.equal(f.openCount(), 0);
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
});

await test('a parent attempt different from the original core attempt is rejected before any native input', async () => {
  const f = fixture({authenticate: chain => ({...chain, attempt_id: 'synthetic-other-parent-attempt'})});
  await f.ready();
  const value = await f.api.submit();
  assert.equal(value.error_code, 'host_operation_unknown');
  assert.equal(value.phase, 'unknown');
  assert.equal(f.count('parent.authenticateCurrentChain'), 1);
  assert.equal(f.count('coordinate.enterNativeFilename'), 0);
  assert.equal(f.openCount(), 0);
});

await test('the core attempt identifier remains parent-only and is absent from coordinate arguments', async () => {
  const f = fixture();
  await f.ready();
  assert.equal((await f.api.submit()).status, 'submitted');
  for (const event of f.events.filter(event => event.method.startsWith('coordinate.'))) {
    assert.equal(JSON.stringify(event.args).includes('synthetic-original-attempt'), false);
    assert.equal(Object.hasOwn(event.args, 'attempt_id'), false);
  }
});

for (const value of ['', null, 100]) {
  await test('bridge refuses invalid core attempt identifier ' + String(value), async () => {
    const f = fixture();
    await f.ready();
    await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, {...f.publicFacts(), attempt_id: value}),
      /original_core_attempt_required/);
    assert.equal(f.count('parent.authenticateCurrentChain'), 0);
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
  });
}

await test('direct untracked observation callbacks cannot be installed into the bridge', () => {
  const f = fixture();
  assert.throws(() => createV155NativeParentBridge({...f.bridgeArgs, observations: f.observations}),
    /same_ledger_tracked_parent_observations_required/);
  assert.equal(f.events.length, 0);
});

await test('tracked observation callbacks bound to a different ledger are refused', () => {
  const f = fixture();
  const otherCleanup = createNativeCoordinateCleanup({scope: f.scope, now: f.now,
    makeCleanupAdapter: cleanupContext.factory, readWindows: async () => []});
  const other = createTrackedParentObservations({scope: f.scope, cleanup: otherCleanup,
    confirmCompletion: () => true, build: ({runOfficialAction}) => ({
      inspect: context => runOfficialAction('synthetic', async () => context),
      writeTitle: context => runOfficialAction('synthetic', async () => context),
      reopenAndInspect: context => runOfficialAction('synthetic', async () => context),
    })});
  assert.throws(() => createV155NativeParentBridge({...f.bridgeArgs, observations: other}),
    /same_ledger_tracked_parent_observations_required/);
  assert.equal(f.events.length, 0);
});

await test('tracked observation callbacks bound to a different scope are refused', () => {
  const f = fixture();
  const other = createTrackedParentObservations({scope: {...f.scope, tab_id: 'synthetic-other-tab'}, cleanup: f.cleanup,
    confirmCompletion: () => true, build: ({runOfficialAction}) => ({
      inspect: context => runOfficialAction('synthetic', async () => context),
      writeTitle: context => runOfficialAction('synthetic', async () => context),
      reopenAndInspect: context => runOfficialAction('synthetic', async () => context),
    })});
  assert.throws(() => createV155NativeParentBridge({...f.bridgeArgs, observations: other}), /scope_changed/);
  assert.equal(f.events.length, 0);
});

await test('an observation with no registered operation leaves its outer action unknown and fences all callbacks', async () => {
  const f = fixture();
  const untracked = createTrackedParentObservations({scope: f.scope, cleanup: f.cleanup,
    confirmCompletion: () => true, build: () => ({inspect: async () => ({synthetic: true}),
      writeTitle: async () => undefined, reopenAndInspect: async () => ({synthetic: true})})});
  await assert.rejects(untracked.inspect(f.scope), /all_official_observation_actions_must_be_registered_and_awaited/);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  await assert.rejects(untracked.writeTitle(f.scope), /single_tracked_parent_observation_required/);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  assert.equal((await f.bridge.settlement()).actions_settled, false);
});

await test('an unawaited registered operation cannot make its callback appear settled', async () => {
  const f = fixture(), wait = deferred();
  let running;
  const value = Object.freeze({synthetic: 'early-observation'});
  const observations = createTrackedParentObservations({scope: f.scope, cleanup: f.cleanup,
    confirmCompletion: () => true, build: ({runOfficialAction}) => ({
      inspect: () => {running = runOfficialAction('synthetic_unawaited', () => wait.promise); running.catch(() => {}); return value;},
      writeTitle: context => runOfficialAction('synthetic', async () => context),
      reopenAndInspect: context => runOfficialAction('synthetic', async () => context),
    })});
  await assert.rejects(observations.inspect(f.scope), /all_official_observation_actions_must_be_registered_and_awaited/);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  assert.equal(f.cleanup.diagnostic().pending_actions, 1);
  wait.resolve(value);
  await running;
  assert.equal(f.cleanup.diagnostic().pending_actions, 0);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  assert.equal((await f.bridge.settlement()).actions_settled, false);
  await assert.rejects(observations.inspect(f.scope), /single_tracked_parent_observation_required/);
});

await test('registered and awaited observation operations preserve the exact original result', async () => {
  const f = fixture();
  const value = Object.freeze({synthetic: true, native_dialog_owned: false, saved_indicator_observed: false});
  let escaped;
  const tracked = createTrackedParentObservations({scope: f.scope, cleanup: f.cleanup,
    confirmCompletion: () => true, build: ({runOfficialAction}) => {
      escaped = runOfficialAction;
      return {
        inspect: async () => {
          await runOfficialAction('synthetic_capture', async () => ({synthetic: 'screenshot'}));
          return runOfficialAction('synthetic_read', async () => value);
        },
        writeTitle: context => runOfficialAction('synthetic', async () => context),
        reopenAndInspect: context => runOfficialAction('synthetic', async () => context),
      };
    }});
  assert.equal(await tracked.inspect(f.scope), value);
  assert.equal(f.cleanup.diagnostic().settled_actions, 3);
  assert.equal(f.cleanup.diagnostic().pending_actions, 0);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 0);
  await assert.rejects(escaped('synthetic_late', async () => value), /official_action_inside_observation_required/);
  assert.equal(f.cleanup.diagnostic().settled_actions, 3);
});

await test('catching an unknown official action cannot let an observation report success or continue the chain', async () => {
  const f = fixture();
  const tracked = createTrackedParentObservations({scope: f.scope, cleanup: f.cleanup,
    confirmCompletion: (label, outcome) => !label.includes('synthetic_unknown') && outcome.kind === 'fulfilled',
    build: ({runOfficialAction}) => ({
      inspect: async () => {
        try {await runOfficialAction('synthetic_unknown', async () => ({synthetic: 'unconfirmed-command'}));} catch {}
        return {synthetic: 'must-not-report-as-confirmed'};
      },
      writeTitle: context => runOfficialAction('synthetic', async () => context),
      reopenAndInspect: context => runOfficialAction('synthetic', async () => context),
    })});
  await assert.rejects(tracked.inspect(f.scope), /all_official_observation_actions_must_be_registered_and_awaited|unknown_official_observation_action/);
  assert.ok(f.cleanup.diagnostic().unknown_actions >= 1);
  await assert.rejects(tracked.writeTitle(f.scope), /single_tracked_parent_observation_required/);
  assert.equal((await f.bridge.settlement()).actions_settled, false);
});

for (const path of ['/synthetic-host/../original-fixture.docx', '/synthetic-host/./original-fixture.docx',
  '/synthetic-host/new\nname.docx', '/synthetic-host/new\rname.docx', '/synthetic-host/new\tname.docx',
  '/synthetic-host/new\\name.docx']) {
  await test('native bridge refuses an unsafe literal path ' + JSON.stringify(path), () => {
    const f = fixture();
    assert.throws(() => createV155NativeParentBridge({...f.bridgeArgs,
      artifact: {...f.artifact, absolute_path: path}}), /frozen_same_host_word_required/);
    assert.equal(f.events.length, 0);
  });
}

await test('writeTitle remains a single original object callback and preserves its control and return value', async () => {
  const output = Object.freeze({synthetic: 'original-title-callback-return'});
  const f = fixture({writeTitle: () => output});
  const control = Object.freeze({tag: 'INPUT', type: 'text', label: '标题', unique: true});
  const value = await f.bridge.host.writeTitle({...f.coreScope, editor_url: DRAFT,
    title: baselineTitle(), control, native_dialog: {open() {}}, claim_token: 'synthetic-private-secret'});
  const call = f.observationInputs.at(-1);
  assert.equal(value, output);
  assert.equal(call.method, 'writeTitle');
  assert.equal(call.argument_count, 1);
  assert.equal(call.receiver, f.observations);
  assert.equal(call.input.control, control);
  assert.equal(call.input.title, baselineTitle());
  assert.equal(call.input.editor_url, DRAFT);
  assert.equal(Object.isFrozen(call.input), true);
  assertPublic(call.input);
});
function baselineTitle() {return '完整离线桥测试标题';}

await test('reopenAndInspect preserves the original observation and independent reuse identifier', async () => {
  const original = Object.freeze({synthetic: true, private_draft: true, saved_indicator_observed: false,
    body: {paragraphs: ['离线合成原始观察。'], images: []}});
  const f = fixture({reopen: () => original});
  const value = await f.bridge.host.reopenAndInspect({...f.coreScope, purpose: 'independent_readback',
    editor_url: DRAFT, reuse_tab_id: 'synthetic-independent-tab', native_dialog: {open() {}},
    reservation_token: 'synthetic-private-secret'});
  assert.equal(value, original);
  const call = f.observationInputs.at(-1);
  assert.equal(call.argument_count, 1);
  assert.equal(call.receiver, f.observations);
  assert.equal(call.input.reuse_tab_id, 'synthetic-independent-tab');
  assertPublic(call.input);
});

await test('original core can observe its real draft URL and use the unchanged title callback after one Open', async () => {
  const f = fixture();
  await f.ready();
  await f.api.submit();
  const observed = await f.api.observe();
  assert.equal(observed.operation, 'record_article_upload');
  assert.equal(observed.args.editor_url, DRAFT);
  assert.equal((await f.api.acceptObserved({recorded: true, attempt: f.attempt('draft_observed',
    {editor_urls: [DRAFT]})})).phase, 'inspect');
  assert.equal((await f.api.fillTitle()).status, 'title_exact');
  const call = f.observationInputs.find(event => event.method === 'writeTitle');
  assert.equal(call.argument_count, 1);
  assert.equal(call.input.title, f.baseline.title);
  assert.equal(call.input.control.label, '标题');
  assert.equal(f.openCount(), 1);
  assertPublic(call.input);
});

for (const platform of Object.keys(ACCOUNTS)) {
  await test(platform + ': production core and bridge use the actual platform saving contract and single native Open', async () => {
    const f = fixture({platform});
    await f.ready();
    assert.equal(f.picker.editor_url, f.blankUrl);
    assert.equal(f.scope.target_account, ACCOUNTS[platform]);
    const saved = f.events.find(event => event.method === 'parent.saving').value;
    assert.equal(saved.state, f.savingState);
    assert.equal(saved.platform, platform);
    assert.equal((await f.api.submit()).status, 'submitted');
    assert.equal(f.openCount(), 1);
    assert.equal(f.count('coordinate.enterNativeFilename'), 1);
    assert.equal(f.authenticationInputs.length, 4);
    const observed = await f.api.observe();
    assert.equal(observed.args.editor_url, f.draftUrl);
    assert.equal((await f.api.acceptObserved({recorded: true, attempt: f.attempt('draft_observed',
      {editor_urls: [f.draftUrl]})})).phase, 'inspect');
    assert.equal((await f.api.fillTitle()).status, 'title_exact');
    const verified = await f.api.verify();
    assert.equal(verified.operation, 'record_article_upload');
    assert.equal(verified.args.state, 'verified');
    assert.equal(verified.args.readback.draft_url, f.draftUrl);
    assert.equal(verified.args.readback.independently_reopened, true);
    if (platform === 'zhihu') assert.equal(verified.args.readback.cover.reference_sha256, f.baseline.images[0].sha256);
    const completed = await f.api.acceptVerified({recorded: true,
      attempt: f.attempt('verified', {editor_urls: [f.draftUrl]})});
    assert.equal(completed.operation, f.statusTool);
    assert.equal(completed.args.state, f.completeState);
    // Actual completion API facts: the article/platform plus the verified URL.
    // No browser session, executor or account field is invented for this reply.
    assert.equal((await f.api.acceptCompleted({article_id: f.scope.article_id, platform: f.scope.platform,
      state: f.completeState, draft_url: f.draftUrl})).status, 'done');
    assert.equal(f.openCount(), 1);
  });

  await test(platform + ': saving receipt from the other platform cannot authenticate the prepared import', async () => {
    const f = fixture({platform});
    await f.ready();
    f.parentReceipts.saving = {...f.parentReceipts.saving,
      platform: platform === 'toutiao' ? 'zhihu' : 'toutiao',
      state: platform === 'toutiao' ? 'saving' : 'toutiao_saving'};
    assert.equal((await f.api.submit()).error_code, 'host_operation_unknown');
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
  });

  await test(platform + ': saving receipt for a different article cannot authenticate the prepared import', async () => {
    const f = fixture({platform});
    await f.ready();
    f.parentReceipts.saving = {...f.parentReceipts.saving, article_id: 'synthetic-other-article'};
    assert.equal((await f.api.submit()).error_code, 'host_operation_unknown');
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
  });

  await test(platform + ': public facts for a different platform and account are refused without parent authentication', async () => {
    const f = fixture({platform});
    await f.ready();
    const other = platform === 'toutiao' ? 'zhihu' : 'toutiao';
    await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path,
      {...f.publicFacts(), platform: other, target_account: ACCOUNTS[other]}), /original_core_scope_required/);
    assert.equal(f.count('parent.authenticateCurrentChain'), 0);
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
  });
}

async function readyForZhihuCompletion() {
  const f = fixture({platform: 'zhihu'});
  await f.ready();
  assert.equal((await f.api.submit()).status, 'submitted');
  const observed = await f.api.observe();
  assert.equal(observed.args.editor_url, f.draftUrl);
  await f.api.acceptObserved({recorded: true, attempt: f.attempt('draft_observed', {editor_urls: [f.draftUrl]})});
  assert.equal((await f.api.fillTitle()).status, 'title_exact');
  const verified = await f.api.verify();
  assert.equal(verified.args.readback.draft_url, f.draftUrl);
  const completion = await f.api.acceptVerified({recorded: true,
    attempt: f.attempt('verified', {editor_urls: [f.draftUrl]})});
  assert.equal(completion.operation, 'record_article_delivery');
  assert.equal(completion.args.state, 'saved');
  assert.equal(completion.args.draft_url, f.draftUrl);
  return f;
}

for (const [name, mutate] of [
  ['missing draft URL', value => {delete value.draft_url; return value;}],
  ['different draft URL', value => ({...value, draft_url: 'https://zhuanlan.zhihu.com/p/20000000002/edit'})],
  ['missing article id', value => {delete value.article_id; return value;}],
  ['different article id', value => ({...value, article_id: 'synthetic-other-article'})],
  ['missing platform', value => {delete value.platform; return value;}],
  ['different platform', value => ({...value, platform: 'toutiao'})],
]) {
  await test('zhihu: completion refuses ' + name + ' and preserves the single Open attempt', async () => {
    const f = await readyForZhihuCompletion();
    const reply = mutate({article_id: f.scope.article_id, platform: f.scope.platform,
      state: 'saved', draft_url: f.draftUrl});
    const result = await f.api.acceptCompleted(reply);
    assert.equal(result.error_code, 'completion_unconfirmed');
    assert.equal(result.phase, 'unknown');
    assert.notEqual(result.status, 'done');
    assert.equal(f.openCount(), 1);
    assert.equal(f.count('coordinate.enterNativeFilename'), 1);
    assert.equal((await f.api.submit()).error_code, 'execution_fenced');
    assert.equal(f.openCount(), 1);
  });
}

// Every paused operation below has already been dispatched and has produced a
// synthetic documented response. Cancellation must await that response, keep
// its original ledger ticket, and prevent the next actual host operation.
for (const platform of Object.keys(ACCOUNTS)) {
  for (const checkpoint of [
    {name: 'first parent authentication', auth: 1},
    {name: 'final parent authentication', auth: 4},
    {name: 'the native filename screenshot', method: 'captureNativeDialog', when: (_args, f) => f.count('coordinate.captureNativeDialog') === 1},
    {name: 'the literal filename input', method: 'enterNativeFilename'},
    {name: 'the full filename Open screenshot', method: 'captureNativeDialog', when: (_args, f) => f.count('coordinate.captureNativeDialog') === 2},
    {name: 'Open target identification', method: 'identifyTarget', when: args => args.semantic === 'native_open'},
    {name: 'the first Open scene read', method: 'confirmScene', when: (args, f) => args.snapshot.filename === f.artifact.absolute_path},
    {name: 'the scene read after final authentication', method: 'confirmScene', when: (args, f) => args.snapshot.filename === f.artifact.absolute_path &&
      f.events.filter(event => event.method === 'coordinate.confirmScene' && event.args.snapshot.filename === f.artifact.absolute_path).length === 2},
  ]) {
    await test(platform + ': cancellation while waiting for ' + checkpoint.name + ' prevents Open and replay', async () => {
      const reached = deferred(), release = deferred();
      let authReads = 0;
      const options = {platform};
      if (checkpoint.auth) options.authenticate = async chain => {
        if (++authReads === checkpoint.auth) {reached.resolve(); await release.promise;}
        return chain;
      };
      else options.coordinate = {[checkpoint.method]: async (args, operation, f) => {
        const value = await operation(args);
        if (!checkpoint.when || checkpoint.when(args, f)) {reached.resolve(); await release.promise;}
        return value;
      }};
      const f = fixture(options);
      await f.ready();
      const submitting = f.api.submit();
      await reached.promise;
      const beforeCancel = f.bridge.diagnostic();
      assert.equal(f.openCount(), 0);
      assert.ok(beforeCancel.pending_parent_operations > 0);
      const cancelled = f.api.cancel();
      assert.equal(cancelled.status, 'cancelled');
      assert.equal(cancelled.cancellation_propagated, true);
      const local = f.bridge.cancelLocal();
      assert.equal(local.cancelled, true);
      assert.equal(local.open_issued, false);
      assert.equal(typeof local.then, 'undefined');
      assert.equal(local.pending_actions, beforeCancel.pending_actions);
      assert.equal(local.pending_parent_operations, beforeCancel.pending_parent_operations);
      assert.throws(() => f.bridge.settlement(), /parent_actions_still_running/);
      assert.throws(() => f.bridge.observeClosureForSettlement(), /parent_actions_still_running/);
      const eventCount = f.events.length;
      release.resolve();
      assert.equal((await submitting).status, 'blocked');
      assert.equal(f.events.length, eventCount);
      assert.equal(f.openCount(), 0);
      assert.equal(f.bridge.diagnostic().open_issued, false);
      assert.equal(f.bridge.diagnostic().phase, 'cancelled');
      assert.equal(f.bridge.diagnostic().pending_actions, 0);
      assert.equal(f.bridge.diagnostic().pending_parent_operations, 0);
      assert.equal(f.bridge.diagnostic().unknown_actions, 0);
      assert.equal((await f.api.submit()).error_code, 'execution_fenced');
      await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /native_bridge_cancelled/);
      assert.equal(f.events.length, eventCount);
      assert.equal((await f.bridge.settlement()).chooser_closed, false);
    });
  }

  for (const unknown of [false, true]) {
    await test(platform + ': cancelling after Open dispatch preserves its ' + (unknown ? 'unknown' : 'settled') + ' ticket and exact closure identity', async () => {
      const reached = deferred(), release = deferred();
      let issuedArgs;
      const f = fixture({platform, coordinate: {clickOnce: async (args, operation) => {
        const value = await operation(args);
        if (args.semantic === 'native_open') {
          issuedArgs = args;
          reached.resolve();
          await release.promise;
          if (unknown) throw Error('synthetic lost already-issued Open response after cancellation');
        }
        return value;
      }}});
      await f.ready();
      const submitting = f.api.submit();
      await reached.promise;
      assert.equal(f.openCount(), 1);
      assert.equal(f.bridge.diagnostic().open_issued, true);
      assert.equal(f.bridge.diagnostic().pending_actions, 1);
      assert.equal(f.api.cancel().cancellation_propagated, true);
      const cancelled = f.bridge.cancelLocal();
      assert.equal(cancelled.open_issued, true);
      assert.equal(cancelled.pending_actions, 1);
      assert.equal(cancelled.cancelled, true);
      const eventCount = f.events.length;
      release.resolve();
      assert.equal((await submitting).status, 'blocked');
      assert.equal(f.events.length, eventCount);
      assert.equal(f.count('coordinate.observeNativeClosure'), 0);
      assert.equal(f.bridge.diagnostic().pending_actions, 0);
      assert.equal(f.bridge.diagnostic().unknown_actions, unknown ? 1 : 0);
      assert.equal(f.bridge.diagnostic().open_issued, true);
      assert.equal(f.bridge.diagnostic().window_id, issuedArgs.snapshot.window_id);
      assert.equal(f.bridge.diagnostic().phase, 'cancelled');
      assert.equal((await f.api.submit()).error_code, 'execution_fenced');
      await assert.rejects(f.picker.nativeDialog.open(f.artifact.absolute_path, f.publicFacts()), /native_bridge_cancelled/);
      assert.equal(f.openCount(), 1);
      await f.bridge.observeClosureForSettlement();
      const closureArgs = f.events.findLast(event => event.method === 'coordinate.observeNativeClosure').args;
      assert.equal(closureArgs.window_id, issuedArgs.snapshot.window_id);
      if (unknown) assert.equal(closureArgs.open_click, null);
      else {
        assert.equal(closureArgs.open_click.source, 'official_host_mouse_receipt');
        assert.equal(closureArgs.open_click.scene_id, issuedArgs.snapshot.scene_id);
        assert.equal(closureArgs.open_click.screenshot_id, issuedArgs.snapshot.screenshot_id);
      }
      const settled = await f.bridge.settlement();
      assert.equal(settled.native_dialog_closed, true);
      assert.equal(settled.actions_settled, !unknown);
      assert.equal(settled.chooser_closed, !unknown);
      assert.equal(f.bridge.diagnostic().unknown_actions, unknown ? 1 : 0);
      assert.equal(f.openCount(), 1);
    });
  }

  await test(platform + ': cancellation while a real prepare window observation returns retains that exact window without claiming readiness', async () => {
    const reached = deferred(), release = deferred();
    const f = fixture({platform, coordinate: {observeNativeDialog: async (args, operation) => {
      const value = await operation(args);
      reached.resolve();
      await release.promise;
      return value;
    }}});
    const preparing = f.api.prepare();
    await reached.promise;
    const before = f.bridge.diagnostic();
    assert.equal(before.pending_actions, 1);
    assert.equal(f.api.cancel().cancellation_propagated, true);
    assert.equal(f.bridge.cancelLocal().cancelled, true);
    release.resolve();
    assert.equal((await preparing).status, 'blocked');
    assert.equal(f.picker, null);
    assert.equal(f.bridge.diagnostic().native_phase, 'open');
    assert.equal(f.bridge.diagnostic().window_id, 'synthetic-bridge-native-window');
    assert.equal(f.bridge.diagnostic().pending_actions, 0);
    assert.equal(f.bridge.diagnostic().unknown_actions, 0);
    assert.equal(f.count('coordinate.enterNativeFilename'), 0);
    assert.equal(f.openCount(), 0);
    assert.equal((await f.api.prepare()).error_code, 'execution_fenced');
    await f.bridge.observeClosureForSettlement();
    assert.equal((await f.bridge.settlement()).native_dialog_closed, true);
    // The parent core never received an authentic prepared identity, so this
    // native closure alone cannot authorize its formal settlement/release.
    assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  });

  await test(platform + ': cancellation while the actual Open closure response returns retains closure without saved or completed claims', async () => {
    const reached = deferred(), release = deferred();
    const f = fixture({platform, coordinate: {observeNativeClosure: async (args, operation) => {
      const value = await operation(args);
      reached.resolve();
      await release.promise;
      return value;
    }}});
    await f.ready();
    const submitting = f.api.submit();
    await reached.promise;
    assert.equal(f.openCount(), 1);
    assert.equal(f.bridge.diagnostic().pending_actions, 1);
    assert.equal(f.api.cancel().cancellation_propagated, true);
    f.bridge.cancelLocal();
    release.resolve();
    const result = await submitting;
    assert.equal(result.status, 'blocked');
    assert.notEqual(result.status, 'saved');
    assert.notEqual(result.status, 'done');
    assert.equal(f.bridge.diagnostic().phase, 'cancelled');
    assert.equal(f.bridge.diagnostic().native_phase, 'closed_confirmed');
    assert.equal(f.bridge.diagnostic().pending_actions, 0);
    assert.equal(f.bridge.diagnostic().unknown_actions, 0);
    assert.equal(f.count('coordinate.observeNativeClosure'), 1);
    assert.equal(f.openCount(), 1);
    assert.equal((await f.bridge.settlement()).chooser_closed, true);
    assert.equal((await f.api.settleClosed()).status, 'settled');
    assert.equal(f.openCount(), 1);
  });
}

await test('cancellation inside a tracked observation forbids its second real operation even if the callback catches the fence', async () => {
  const reached = deferred(), release = deferred();
  let firstDispatches = 0, secondDispatches = 0;
  const f = fixture({buildObservations: ({runOfficialAction, observations}) => ({
    inspect: async input => {
      if (input.purpose !== 'submit') return runOfficialAction('inspect', () => observations.inspect(input));
      try {
        await runOfficialAction('first_paused_read', async () => {
          firstDispatches++;
          reached.resolve();
          await release.promise;
          return {synthetic: 'documented read completed'};
        });
      } catch {}
      return runOfficialAction('second_must_not_dispatch', async () => {secondDispatches++; return observations.inspect(input);});
    },
    writeTitle: input => runOfficialAction('writeTitle', () => observations.writeTitle(input)),
    reopenAndInspect: input => runOfficialAction('reopenAndInspect', () => observations.reopenAndInspect(input)),
  })});
  await f.ready();
  const submitting = f.api.submit();
  await reached.promise;
  assert.equal(f.bridge.diagnostic().pending_actions, 2);
  assert.equal(f.api.cancel().cancellation_propagated, true);
  assert.equal(f.bridge.cancelLocal().pending_actions, 2);
  release.resolve();
  assert.equal((await submitting).status, 'blocked');
  assert.equal(firstDispatches, 1);
  assert.equal(secondDispatches, 0);
  assert.equal(f.openCount(), 0);
  assert.equal(f.bridge.diagnostic().pending_actions, 0);
  assert.equal(f.bridge.diagnostic().unknown_actions, 1);
  assert.equal((await f.bridge.settlement()).actions_settled, false);
});

await test('catching an unknown registered action cannot dispatch a second real operation', async () => {
  const f = fixture();
  let secondDispatches = 0;
  const observations = createTrackedParentObservations({scope: f.scope, cleanup: f.cleanup,
    confirmCompletion: (label, outcome) => !label.includes('synthetic_first_unknown') && outcome.kind === 'fulfilled',
    build: ({runOfficialAction}) => ({
      inspect: async () => {
        try {await runOfficialAction('synthetic_first_unknown', async () => ({synthetic: 'unconfirmed'}));} catch {}
        return runOfficialAction('synthetic_second_must_not_dispatch', async () => {secondDispatches++; return {synthetic: 'must not execute'};});
      },
      writeTitle: input => runOfficialAction('writeTitle', async () => input),
      reopenAndInspect: input => runOfficialAction('reopenAndInspect', async () => input),
    })});
  await assert.rejects(observations.inspect(f.scope), /official_action_history_unresolved/);
  assert.equal(secondDispatches, 0);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 2);
  assert.equal(f.cleanup.diagnostic().settled_actions, 0);
  assert.equal(f.cleanup.diagnostic().pending_actions, 0);
});

for (const platform of Object.keys(ACCOUNTS)) {
  for (const [name, mutate] of [
    ['distorted actual natural geometry', image => ({...image, natural_width: 800})],
    ['distorted actual displayed geometry', image => ({...image, display_width: 400})],
    ['observer-provided matching square reference with a square natural image', image => ({...image,
      natural_width: 400, natural_height: 400, display_width: 200, display_height: 200,
      reference_width: 400, reference_height: 400})],
    ['legacy width and height', image => ({...image, width: 600, height: 400})],
    ['missing natural dimensions', image => {delete image.natural_width; delete image.natural_height; return image;}],
    ['missing display dimensions', image => {delete image.display_width; delete image.display_height; return image;}],
  ]) {
    await test(platform + ': verification refuses ' + name + ' against the frozen source image ratio', async () => {
      const f = fixture({platform, inspect: (value, input) => {
        if (input.purpose === 'saved') value.body.images[0] = mutate(value.body.images[0]);
        return value;
      }});
      await f.ready();
      assert.equal((await f.api.submit()).status, 'submitted');
      await f.api.observe();
      await f.api.acceptObserved({recorded: true, attempt: f.attempt('draft_observed', {editor_urls: [f.draftUrl]})});
      assert.equal((await f.api.fillTitle()).status, 'title_exact');
      const verification = await f.api.verify();
      assert.equal(verification.error_code, 'image_mismatch');
      assert.notEqual(verification.operation, 'record_article_upload');
      assert.equal(f.openCount(), 1);
      assert.equal((await f.api.submit()).error_code, 'execution_fenced');
      assert.equal(f.openCount(), 1);
    });
  }

  for (const [name, change] of [
    ['natural', {natural_width: 800}],
    ['displayed', {display_height: 300}],
  ]) {
    await test(platform + ': independently reopened ' + name + ' image geometry is checked against the frozen Word after a valid saved view', async () => {
      const f = fixture({platform, reopen: value => {
        value.body.images[0] = {...value.body.images[0], ...change};
        return value;
      }});
      await f.ready();
      assert.equal((await f.api.submit()).status, 'submitted');
      await f.api.observe();
      await f.api.acceptObserved({recorded: true, attempt: f.attempt('draft_observed', {editor_urls: [f.draftUrl]})});
      assert.equal((await f.api.fillTitle()).status, 'title_exact');
      const verification = await f.api.verify();
      assert.equal(verification.error_code, 'image_mismatch');
      assert.equal(f.observationInputs.filter(call => call.method === 'reopenAndInspect').length, 1);
      assert.notEqual(verification.operation, 'record_article_upload');
      assert.equal(f.openCount(), 1);
      assert.equal((await f.api.submit()).error_code, 'execution_fenced');
    });
  }
}
