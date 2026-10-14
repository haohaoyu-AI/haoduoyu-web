// Tests import production sources directly; no review-copy module is exercised.
// OFFLINE ONLY. All scenes, dialogs, file receipts and parent grants are synthetic.
// node:vm loads the unchanged reviewed cleanup definitions in this local process.
// This is not a CUA loader, an approval request or a platform action.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  ACCOUNTS, NATIVE_CHANNEL, bindScope, coordinateFromDecision, publicImportPermission,
  titleWriteDecision, verifyPrivateDraft,
} from '../../scripts/browser-upload/coordinate/src/coordinate-contract.js';
import {createNativeCoordinateAdapter, createNativeCoordinateCleanup} from '../../scripts/browser-upload/coordinate/src/native-coordinate-adapter.js';
import {createParentImportGate} from '../../scripts/browser-upload/coordinate/src/parent-import-gate.js';

const cleanupSource = readFileSync(new URL('../../scripts/browser-upload/coordinate/reviewed-cleanup/reviewed-cleanup.js', import.meta.url), 'utf8');
const cleanupContext = vm.createContext({});
vm.runInContext(cleanupSource + '\nthis.createReviewedCleanup = createChooserCleanupAdapter;', cleanupContext,
  {filename: 'offline-reviewed-cleanup.js'});
const createReviewedCleanup = cleanupContext.createReviewedCleanup;

const INITIAL_TIME = Date.parse('2026-10-11T00:00:00.000Z');
const WORD_SHA = '1166925f3585033cf77741d1de594b2681d36260763c7ecc7e8aa35087b296e0';
const OTHER_SHA = 'a'.repeat(64);
const WORD_SIZE = 11947179;
const clearWindows = () => [{id: 'synthetic-browser', modal: false, title: 'Synthetic Chromium'}];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
const completed = value => ({...value, fixture_action_completed: true});

function fixture(options = {}) {
  const platform = options.platform || 'toutiao';
  const scope = Object.freeze({article_id: 'd29d424a-c09d-4db2-af4d-213ec41716d2',
    platform, target_account: ACCOUNTS[platform], browser_session: 'synthetic-session',
    executor_id: 'synthetic-executor', tab_id: 'synthetic-tab', host_id: 'synthetic-host'});
  const artifact = Object.freeze({absolute_path: '/synthetic-host/existing-original.docx',
    sha256: WORD_SHA, size_bytes: WORD_SIZE, host_id: scope.host_id});
  const events = [];
  const captures = [];
  const clicks = [];
  let time = INITIAL_TIME, captureSequence = 0, filename = '', nativeWindow = 'synthetic-native-window';
  let authHook = options.authHook, nativeObservations = 0, rawCleanup;
  let windowReader = options.readWindows || (async () => clearWindows());
  const now = () => new Date(time).toISOString();
  const cleanup = createNativeCoordinateCleanup({scope, readWindows: () => windowReader(), now,
    makeCleanupAdapter: args => {
      rawCleanup = createReviewedCleanup({...args, freshInstance: options.freshInstance !== false});
      return rawCleanup;
    }});
  const geometry = Object.freeze({source: 'documented_host_coordinate_mapping',
    screenshot_width: 1200, screenshot_height: 900, mouse_width: 1800, mouse_height: 1350,
    mouse_origin_x: 40, mouse_origin_y: 30});
  const editorUrl = platform === 'toutiao'
    ? 'https://mp.toutiao.com/profile_v4/graphic/publish?from=synthetic'
    : 'https://zhuanlan.zhihu.com/write';
  const snapshot = (kind, rest = {}) => {
    const sequence = ++captureSequence;
    const value = completed({...scope, source: 'official_host_screenshot', kind,
      screenshot_id: 'synthetic-screenshot-' + sequence, screenshot_ref: {synthetic: sequence},
      scene_id: 'synthetic-scene-' + sequence, observed_at: now(), geometry,
      ...(kind === 'page' ? {account_verified: true, account_evidence_ref: 'synthetic-account-evidence',
        is_new_draft: true, body_empty: true, title: '', editor_url: editorUrl}
        : {channel: NATIVE_CHANNEL, window_id: nativeWindow, owner_tab_id: scope.tab_id,
          modal: true, title: 'Open File', active: true, active_window_id: nativeWindow, filename,
          files_selected: false, submitted: false}), ...rest});
    captures.push(value);
    return value;
  };
  const decision = ({snapshot: value, semantic}) => completed({snapshot: value, semantic,
    unique: true, visible: true, unobscured: true, enabled: true, reviewed: true,
    center_unobscured: true, evidence_kind: 'visible_text', evidence_ref: 'synthetic-visible-control',
    // Positions change with every observed scene. No static coordinate is stored.
    bounds: {x: 80 + captureSequence * 19, y: 150 + captureSequence * 11, width: 60, height: 28}});
  const implementations = {
    inspectFile: async () => completed({...scope, ...artifact, source: 'same_host_file_observation', observed_at: now()}),
    capturePage: async () => snapshot('page'),
    identifyTarget: async args => decision(args),
    confirmScene: async ({snapshot: value}) => completed({...scope,
      source: 'official_host_scene_observation', scene_id: value.scene_id,
      screenshot_id: value.screenshot_id, window_id: value.window_id,
      active: true, active_window_id: value.window_id, unchanged: true, observed_at: now()}),
    clickOnce: async args => {
      const receipt = completed({...scope, source: 'official_host_mouse_receipt',
        scene_id: args.snapshot.scene_id, screenshot_id: args.snapshot.screenshot_id,
        ...args.coordinates, observed_at: now()});
      clicks.push({args, receipt});
      return receipt;
    },
    observeNativeDialog: async ({after_click}) => {
      if (++nativeObservations === 1 && options.preparePlan?.length === 2) {
        return completed({...scope, source: 'official_document_modal_observation', state: 'document_modal',
          ready_for_next: 'choose_document', creation_click: after_click,
          screenshot_ref: {synthetic: 'document-modal'}, scene_id: 'synthetic-document-modal-scene', observed_at: now()});
      }
      return completed({...scope, source: 'official_native_dialog_observation', state: 'native_dialog', channel: NATIVE_CHANNEL,
        owner_tab_id: scope.tab_id, creation_click: after_click, window_id: nativeWindow,
        modal: true, title: 'Open File', active: true, active_window_id: nativeWindow, files_selected: false,
        submitted: false, observed_at: now()});
    },
    captureNativeDialog: async () => snapshot('native_dialog'),
    enterNativeFilename: async ({window_id, absolute_path, submit}) => {
      assert.equal(submit, false);
      filename = absolute_path;
      return completed({...scope, source: 'official_native_filename_receipt',
        window_id, absolute_path, submitted: false, enter_pressed: false, observed_at: now()});
    },
    observeNativeClosure: async ({epoch, window_id, cycle, open_click, creation_click}) => completed({...scope,
      source: 'documented_native_window_closure', channel: NATIVE_CHANNEL, epoch,
      window_id, cycle, open_click, creation_click, closed: true, observed_at: now()}),
  };
  const host = Object.fromEntries(Object.entries(implementations).map(([method, operation]) => [method, async args => {
    events.push({method, args});
    const override = options.overrides?.[method];
    return override ? override(args, operation, {now, snapshot, decision, cleanup, scope, artifact}) : operation(args);
  }]));
  const syntheticChain = prepared => {
    const preparedAt = Date.parse(prepared.observed_at);
    return {...scope, source: 'authenticated_parent_current_chain', channel: NATIVE_CHANNEL,
      execute_import: true, delivery_status: 'saving', prepared,
      claim_confirmed: true, reserved: true, consumed: true, current: true,
      artifact_sha256: artifact.sha256, artifact_size_bytes: artifact.size_bytes,
      attempt_id: 'synthetic-attempt-1',
      claimed_at: new Date(preparedAt + 100).toISOString(),
      reserved_at: new Date(preparedAt + 200).toISOString(),
      consumed_at: new Date(preparedAt + 300).toISOString(),
      saving_at: new Date(preparedAt + 400).toISOString()};
  };
  const gate = createParentImportGate({scope, artifact, authenticateCurrentChain: async ({prepared}) => {
    events.push({method: 'parent.authenticateCurrentChain', prepared});
    const chain = syntheticChain(prepared);
    return authHook ? authHook(chain, prepared) : chain;
  }});
  const adapter = createNativeCoordinateAdapter({scope, artifact, host, cleanup, now,
    preparePlan: options.preparePlan || ['import_document'], instanceId: options.instanceId || 'synthetic-fresh-instance',
    authorizeSubmission: options.authorizeSubmission || gate.authorizeSubmission,
    confirmCompletion: options.confirmCompletion || ((label, outcome) =>
      outcome.kind === 'fulfilled' && outcome.value?.fixture_action_completed === true)});
  const count = method => events.filter(event => event.method === method).length;
  const clicked = semantic => clicks.filter(click => click.args.semantic === semantic);
  async function preparedAndPermitted() {
    const prepared = await adapter.prepare(scope);
    time += 1000;
    const permission = await gate.issue(prepared);
    return {prepared, permission};
  }
  return {scope, artifact, host, cleanup, rawCleanup, gate, adapter, events, captures, clicks, count, clicked,
    snapshot, decision, syntheticChain, preparedAndPermitted, now,
    setTime: next => {time = typeof next === 'string' ? Date.parse(next) : next;},
    advance: millis => {time += millis;},
    setAuthHook: hook => {authHook = hook;},
    setWindowReader: reader => {windowReader = reader;},
    setNativeWindow: value => {nativeWindow = value;}};
}

function preparedReceipt(platform = 'toutiao') {
  const f = fixture({platform});
  return {f, prepared: Object.freeze({...f.scope, channel: NATIVE_CHANNEL,
    prepared_id: 'synthetic-fresh-instance:synthetic-native-window:1', ready: true,
    files_selected: false, submitted: false, editor_url: f.snapshot('page').editor_url,
    window_id: 'synthetic-native-window', cycle: 1,
    sha256: f.artifact.sha256, size_bytes: f.artifact.size_bytes, observed_at: f.now()})};
}

function constructAdapter(f, cleanup, scope = f.scope) {
  return createNativeCoordinateAdapter({scope, artifact: f.artifact, host: f.host, cleanup,
    now: f.now, preparePlan: ['import_document'], instanceId: 'synthetic-other-fresh-instance',
    authorizeSubmission: f.gate.authorizeSubmission,
    confirmCompletion: (label, outcome) => outcome.kind === 'fulfilled' && outcome.value?.fixture_action_completed === true});
}

for (const platform of Object.keys(ACCOUNTS)) {
  await test(platform + ': prepare, parent chain, literal filename, one Open, exact closure and settlement', async () => {
    const f = fixture({platform, preparePlan: ['import_document', 'choose_document']});
    const {prepared, permission} = await f.preparedAndPermitted();
    assert.equal(prepared.channel, NATIVE_CHANNEL);
    assert.equal(prepared.files_selected, false);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal(f.clicked('native_open').length, 0);
    assert.equal(permission.execute_import, true);
    assert.equal(permission.delivery_status, 'saving');
    assert.equal(Object.keys(permission).some(key => /token|credential|nonce|password/i.test(key)), false);
    const submitted = await f.adapter.submit(f.scope, permission);
    assert.equal(submitted.submitted, true);
    assert.equal(f.count('enterNativeFilename'), 1);
    assert.equal(f.clicked('native_filename').length, 1);
    assert.equal(f.clicked('native_open').length, 1);
    assert.equal(f.clicked('native_open')[0].args.snapshot.window_id, prepared.window_id);
    assert.equal(f.events.find(event => event.method === 'enterNativeFilename').args.absolute_path, f.artifact.absolute_path);
    assert.equal(f.events.find(event => event.method === 'enterNativeFilename').args.submit, false);
    for (const {args} of f.clicks) {
      assert.equal(args.coordinates.button, 'left');
      assert.equal(args.coordinates.click_count, 1);
    }
    assert.ok(f.events.findIndex(event => event.method === 'observeNativeDialog') <
      f.events.findIndex(event => event.method === 'parent.authenticateCurrentChain'));
    assert.ok(f.events.findIndex(event => event.method === 'parent.authenticateCurrentChain') <
      f.events.findIndex(event => event.method === 'enterNativeFilename'));
    const settlement = await f.adapter.settlement(f.scope);
    assert.equal(settlement.actions_settled, true);
    assert.equal(settlement.chooser_closed, true);
    assert.equal(settlement.native_dialog_closed, true);
    assert.equal(f.adapter.diagnostic().native_phase, 'closed_confirmed');
    assert.equal(f.cleanup.diagnostic().unknown_actions, 0);
    // A native dialog never creates a browser chooser in the reused ledger.
    assert.equal(f.cleanup.diagnostic().chooser_phase, 'never_created');
  });
}

await test('dynamic target movement maps the current screenshot and documented coordinate scale', async () => {
  const f = fixture({preparePlan: ['import_document', 'choose_document']});
  await f.adapter.prepare(f.scope);
  assert.equal(f.clicks.length, 2);
  assert.notEqual(f.clicks[0].args.coordinates.x, f.clicks[1].args.coordinates.x);
  assert.notEqual(f.clicks[0].args.coordinates.y, f.clicks[1].args.coordinates.y);
  for (const {args} of f.clicks) {
    const sequence = Number(args.snapshot.screenshot_id.split('-').at(-1));
    assert.equal(args.coordinates.x, 40 + (80 + sequence * 19 + 30) * 1.5);
    assert.equal(args.coordinates.y, 30 + (150 + sequence * 11 + 14) * 1.5);
  }
});

await test('a native window observed after the first click stops a two-step prepare plan', async () => {
  const f = fixture({preparePlan: ['import_document', 'choose_document'], overrides: {
    observeNativeDialog: async ({after_click}, original, {scope, now}) => completed({...scope,
      source: 'official_native_dialog_observation', state: 'native_dialog', channel: NATIVE_CHANNEL,
      owner_tab_id: scope.tab_id, creation_click: after_click, window_id: 'synthetic-native-window',
      modal: true, title: 'Open File', active: true, active_window_id: 'synthetic-native-window',
      files_selected: false, submitted: false, observed_at: now()}),
  }});
  await f.adapter.prepare(f.scope);
  assert.equal(f.count('capturePage'), 1);
  assert.equal(f.count('observeNativeDialog'), 1);
  assert.equal(f.clicked('choose_document').length, 0);
});

await test('mutating the caller prepare plan does not change the reviewed plan', async () => {
  const preparePlan = ['import_document', 'choose_document'];
  const f = fixture({preparePlan});
  preparePlan[1] = 'foreign-unreviewed-action';
  await f.adapter.prepare(f.scope);
  assert.equal(f.clicked('choose_document').length, 1);
  assert.equal(f.clicked('foreign-unreviewed-action').length, 0);
});

for (const [name, makePlan] of [
  ['first step hole', () => new Array(1)],
  ['second step hole', () => {const value = ['import_document']; value.length = 2; return value;}],
  ['inherited second step', () => {
    const value = ['import_document']; value.length = 2;
    Object.setPrototypeOf(value, Object.assign(Object.create(Array.prototype), {1: 'choose_document'}));
    return value;
  }],
]) {
  await test('prepare plan refuses ' + name + ' before any host operation', () => {
    assert.throws(() => fixture({preparePlan: makePlan()}), /reviewed_prepare_plan_required/);
  });
}

for (const [name, changes, expected] of [
  ['no next document modal', {state: 'unknown'}, /document_dialog_unconfirmed/],
  ['document modal has no screenshot', {screenshot_ref: null}, /document_dialog_unconfirmed/],
  ['document modal authorizes a different semantic', {ready_for_next: 'foreign-action'}, /document_dialog_unconfirmed/],
  ['document modal has no documented observation', {source: 'guessed_modal'}, /document_dialog_unconfirmed/],
  ['document modal names another creation click', {creation_click: {}}, /matching_prepare_click_required/],
]) {
  await test(name + ' stops before the second prepare click', async () => {
    const f = fixture({preparePlan: ['import_document', 'choose_document'], overrides: {
      observeNativeDialog: async (args, original) => ({...(await original(args)), ...changes}),
    }});
    await assert.rejects(f.adapter.prepare(f.scope), expected);
    assert.equal(f.count('capturePage'), 1);
    assert.equal(f.clicked('choose_document').length, 0);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
  });
}

for (const [field, value] of [['sha256', OTHER_SHA], ['size_bytes', WORD_SIZE - 1], ['host_id', 'foreign-host'], ['absolute_path', '/foreign/rebuilt.docx']]) {
  await test('prepare refuses changed final Word ' + field + ' before any mouse action', async () => {
    const f = fixture({overrides: {inspectFile: async (args, original) => ({...(await original(args)), [field]: value})}});
    await assert.rejects(f.adapter.prepare(f.scope), field === 'host_id' ? /scope_changed/ : /word_identity_changed/);
    assert.equal(f.count('clickOnce'), 0);
    assert.equal(f.count('observeNativeDialog'), 0);
  });
  await test('submit refuses changed final Word ' + field + ' before filename or Open', async () => {
    let reads = 0;
    const f = fixture({overrides: {inspectFile: async (args, original) => {
      const valueReceipt = await original(args);
      return ++reads === 1 ? valueReceipt : {...valueReceipt, [field]: value};
    }}});
    const {permission} = await f.preparedAndPermitted();
    await assert.rejects(f.adapter.submit(f.scope, permission), field === 'host_id' ? /scope_changed/ : /word_identity_changed/);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal(f.clicked('native_open').length, 0);
  });
}

await test('an otherwise fresh file receipt from before this prepare read is rejected', async () => {
  const f = fixture({overrides: {inspectFile: async (args, original, {now}) => ({...(await original(args)),
    observed_at: new Date(Date.parse(now()) - 1).toISOString()})}});
  await assert.rejects(f.adapter.prepare(f.scope), /current_file_observation_required/);
  assert.equal(f.count('clickOnce'), 0);
});

await test('an otherwise fresh cached file receipt cannot stand in for the submit identity read', async () => {
  let reads = 0;
  const f = fixture({overrides: {inspectFile: async (args, original, {now}) => {
    const value = await original(args);
    return ++reads === 1 ? value : {...value, observed_at: new Date(Date.parse(now()) - 1).toISOString()};
  }}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /current_file_observation_required/);
  assert.equal(f.count('enterNativeFilename'), 0);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('unsupported account cannot construct a usable scoped adapter', () => {
  assert.throws(() => bindScope({...fixture().scope, target_account: 'foreign-account'}), /target_account_mismatch/);
});
for (const field of ['article_id', 'target_account', 'browser_session', 'executor_id', 'tab_id', 'host_id']) {
  await test('prepare rejects changed scope ' + field + ' before host actions', async () => {
    const f = fixture();
    await assert.rejects(f.adapter.prepare({...f.scope, [field]: 'foreign'}), /scope_changed/);
    assert.equal(f.events.length, 0);
  });
}

await test('wrong account in the current screenshot is rejected before click', async () => {
  const f = fixture({overrides: {capturePage: async (args, original) => ({...(await original(args)), target_account: 'foreign-account'})}});
  await assert.rejects(f.adapter.prepare(f.scope), /scope_changed/);
  assert.equal(f.count('clickOnce'), 0);
});

for (const [name, change, expected] of [
  ['old screenshot', value => ({...value, observed_at: '2026-10-10T23:59:30.000Z'}), /fresh_observation_required/],
  ['missing screenshot', value => ({...value, screenshot_ref: null}), /real_screenshot_required/],
  ['guessed DPI mapping', value => ({...value, geometry: {...value.geometry, source: 'guessed_dpi'}}), /coordinate_mapping_required/],
  ['existing nonempty body', value => ({...value, body_empty: false}), /new_empty_editor_required/],
  ['old editor', value => ({...value, is_new_draft: false}), /new_empty_editor_required/],
]) {
  await test(name + ' cannot authorize an import mouse click', async () => {
    const f = fixture({overrides: {capturePage: async (args, original) => change(await original(args))}});
    await assert.rejects(f.adapter.prepare(f.scope), expected);
    assert.equal(f.count('clickOnce'), 0);
  });
}

for (const [name, changes] of [
  ['scene id changed', {scene_id: 'foreign-scene'}],
  ['screenshot id changed', {screenshot_id: 'foreign-screenshot'}],
  ['scene explicitly changed', {unchanged: false}],
]) {
  await test(name + ' between observation and action is rejected before click', async () => {
    const f = fixture({overrides: {confirmScene: async (args, original) => ({...(await original(args)), ...changes})}});
    await assert.rejects(f.adapter.prepare(f.scope), /scene_changed_before_click/);
    assert.equal(f.count('clickOnce'), 0);
  });
}

for (const [name, changes, expected] of [
  ['unique SVG without semantic evidence', {evidence_kind: 'svg_path'}, /semantic_visible_target_required/],
  ['sidebar-obscured target', {unobscured: false}, /semantic_visible_target_required/],
  ['obscured target center', {center_unobscured: false}, /target_center_obscured/],
  ['unreviewed target', {reviewed: false}, /semantic_visible_target_required/],
  ['nonunique target', {unique: false}, /semantic_visible_target_required/],
  ['target outside current screenshot', {bounds: {x: 1195, y: 1, width: 20, height: 20}}, /target_bounds_invalid/],
]) {
  await test(name + ' is not converted into a coordinate click', async () => {
    const f = fixture({overrides: {identifyTarget: async (args, original) => ({...(await original(args)), ...changes})}});
    await assert.rejects(f.adapter.prepare(f.scope), expected);
    assert.equal(f.count('clickOnce'), 0);
    assert.equal(f.count('observeNativeDialog'), 0);
  });
}

await test('a copied snapshot cannot stand in for the exact target observation', () => {
  const f = fixture();
  const shot = f.snapshot('page');
  assert.throws(() => coordinateFromDecision(f.decision({snapshot: {...shot}, semantic: 'import_document'}), shot,
    'import_document', f.now), /semantic_visible_target_required/);
});

for (const [name, change] of [
  ['double click receipt', value => ({...value, click_count: 2})],
  ['right mouse receipt', value => ({...value, button: 'right'})],
  ['different mouse coordinate', value => ({...value, x: value.x + 1})],
  ['wrong screenshot receipt', value => ({...value, screenshot_id: 'foreign-click-scene'})],
]) {
  await test(name + ' does not justify a successful prepare or a replay', async () => {
    const f = fixture({overrides: {clickOnce: async (args, original) => change(await original(args))}});
    await assert.rejects(f.adapter.prepare(f.scope), /single_real_mouse_click_unconfirmed/);
    assert.equal(f.count('clickOnce'), 1);
    assert.equal(f.count('observeNativeDialog'), 0);
    await assert.rejects(f.adapter.prepare(f.scope), /single_execution_chain_required/);
    assert.equal(f.count('clickOnce'), 1);
    assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
  });
}

await test('an otherwise fresh mouse receipt from before its screenshot cannot authorize prepare', async () => {
  const f = fixture({overrides: {clickOnce: async (args, original) => ({...(await original(args)),
    observed_at: new Date(Date.parse(args.snapshot.observed_at) - 1).toISOString()})}});
  await assert.rejects(f.adapter.prepare(f.scope), /current_action_mouse_receipt_required/);
  assert.equal(f.count('clickOnce'), 1);
  assert.equal(f.count('observeNativeDialog'), 0);
  await assert.rejects(f.adapter.prepare(f.scope), /single_execution_chain_required/);
});

await test('a mouse receipt newer than its screenshot but older than the scene check is rejected', async () => {
  let f;
  f = fixture({overrides: {
    confirmScene: async (args, original) => {f.advance(1000); return original(args);},
    clickOnce: async (args, original) => ({...(await original(args)),
      observed_at: new Date(Date.parse(f.now()) - 500).toISOString()}),
  }});
  await assert.rejects(f.adapter.prepare(f.scope), /current_action_mouse_receipt_required/);
  assert.equal(f.count('clickOnce'), 1);
  assert.equal(f.count('observeNativeDialog'), 0);
});

await test('a mouse receipt newer than screenshot and scene but older than the real dispatch is rejected', async () => {
  let f, checks = 0;
  f = fixture({authHook: chain => {if (++checks === 4) f.advance(1000); return chain;}, overrides: {
    clickOnce: async (args, original) => {
      const value = await original(args);
      return args.semantic === 'native_open' ? {...value,
        observed_at: new Date(Date.parse(f.now()) - 500).toISOString()} : value;
    },
  }});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /current_action_mouse_receipt_required/);
  assert.equal(f.clicked('native_open').length, 1);
  assert.equal(f.adapter.diagnostic().open_issued, true);
  assert.equal(f.count('observeNativeClosure'), 0);
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
});

for (const preparePlan of [['import_document'], ['import_document', 'choose_document']]) {
  await test('prepare dialog observation must follow its creation click in a ' + preparePlan.length + '-step plan', async () => {
    const f = fixture({preparePlan, overrides: {observeNativeDialog: async (args, original) => ({...(await original(args)),
      observed_at: new Date(Date.parse(args.after_click.observed_at) - 1).toISOString()})}});
    await assert.rejects(f.adapter.prepare(f.scope), /matching_prepare_click_required/);
    assert.equal(f.count('clickOnce'), 1);
    assert.equal(f.count('capturePage'), 1);
    assert.equal(f.count('enterNativeFilename'), 0);
  });
}

for (const [name, changes] of [
  ['no confirmed native dialog', {modal: false}],
  ['missing native dialog title', {title: undefined}],
  ['foreign native owner', {owner_tab_id: 'foreign-tab'}],
  ['browser chooser channel', {channel: 'browser_filechooser'}],
  ['prepare selected a file', {files_selected: true}],
  ['prepare submitted a file', {submitted: true}],
  ['inactive native dialog', {active: false}],
  ['wrong active native window', {active_window_id: 'foreign-active-window'}],
]) {
  await test(name + ' remains unknown and never grants a prepare', async () => {
    const f = fixture({overrides: {observeNativeDialog: async (args, original) => ({...(await original(args)), ...changes})}});
    await assert.rejects(f.adapter.prepare(f.scope), /native_prepare_unconfirmed/);
    assert.equal(f.adapter.diagnostic().phase, 'unknown');
    assert.equal(f.adapter.diagnostic().native_phase, 'unknown');
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
  });
}

await test('prepare cannot be repeated on the same instance or accidentally create a second dialog', async () => {
  const f = fixture();
  await f.adapter.prepare(f.scope);
  const before = f.events.length;
  await assert.rejects(f.adapter.prepare(f.scope), /prepare_once_required/);
  assert.equal(f.events.length, before);
  assert.equal(f.count('observeNativeDialog'), 1);
});

await test('concurrent prepare is rejected and busy cancellation fences the pending screenshot', async () => {
  const wait = deferred();
  const reached = deferred();
  const f = fixture({overrides: {capturePage: async (args, original) => {
    reached.resolve(); await wait.promise; return original(args);
  }}});
  const preparing = f.adapter.prepare(f.scope);
  await reached.promise;
  assert.equal(f.cleanup.diagnostic().pending_actions, 1);
  await assert.rejects(f.adapter.prepare(f.scope), /single_execution_chain_required/);
  await assert.rejects(f.adapter.settlement(f.scope), /actions_still_running/);
  const cancelled = f.adapter.cancelLocal();
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.busy, true);
  assert.equal(cancelled.pending_actions, 1);
  wait.resolve();
  await assert.rejects(preparing, /native_adapter_cancelled/);
  assert.equal(f.count('capturePage'), 1);
  assert.equal(f.count('identifyTarget'), 0);
  assert.equal(f.clicked('import_document').length, 0);
  assert.equal(f.adapter.diagnostic().native_phase, 'never_created');
  assert.equal(f.adapter.diagnostic().pending_actions, 0);
  assert.equal(f.adapter.diagnostic().unknown_actions, 0);
  assert.equal(f.adapter.diagnostic().phase, 'cancelled');
  await assert.rejects(f.adapter.prepare(f.scope), /native_adapter_cancelled/);
});

for (const [name, change, expected] of [
  ['execute_import false', value => ({...value, execute_import: false}), /native_import_permission_required/],
  ['status not saving', value => ({...value, delivery_status: 'ready'}), /native_import_permission_required/],
  ['browser channel', value => ({...value, channel: 'browser_filechooser'}), /native_import_permission_required/],
  ['foreign prepared id', value => ({...value, prepared_id: 'other-prepared'}), /native_import_permission_required/],
  ['static claim token', value => ({...value, claim_token: 'synthetic-secret-never-forward'}), /secret_or_unrecognized_import_field/],
  ['static reservation token', value => ({...value, reservation_token: 'synthetic-secret-never-forward'}), /secret_or_unrecognized_import_field/],
  ['foreign Word SHA', value => ({...value, sha256: OTHER_SHA}), /native_import_permission_required/],
  ['foreign Word size', value => ({...value, size_bytes: WORD_SIZE - 1}), /native_import_permission_required/],
  ['changed account', value => ({...value, target_account: 'foreign-account'}), /scope_changed/],
]) {
  await test(name + ' refuses permission before filename input or Open', async () => {
    const f = fixture();
    const {permission} = await f.preparedAndPermitted();
    await assert.rejects(f.adapter.submit(f.scope, change(permission)), expected);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal(f.count('captureNativeDialog'), 0);
    assert.equal(f.clicked('native_open').length, 0);
  });
}

for (const [name, addExtra] of [
  ['enumerable symbol', value => Object.assign(value, {[Symbol('synthetic-private-secret')]: 'synthetic-secret'})],
  ['nonenumerable symbol', value => Object.defineProperty(value, Symbol('synthetic-private-secret'), {value: 'synthetic-secret'})],
  ['nonenumerable token', value => Object.defineProperty(value, 'claim_token', {value: 'synthetic-secret'})],
]) {
  await test(name + ' cannot be forwarded in public import permission', async () => {
    const f = fixture();
    const {permission} = await f.preparedAndPermitted();
    await assert.rejects(f.adapter.submit(f.scope, addExtra({...permission})), /secret_or_unrecognized_import_field/);
    assert.equal(f.count('captureNativeDialog'), 0);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal(f.clicked('native_open').length, 0);
  });
  await test('parent gate directly refuses a permit containing ' + name, async () => {
    const {f, prepared} = preparedReceipt();
    const permission = await f.gate.issue(prepared);
    const before = f.count('parent.authenticateCurrentChain');
    await assert.rejects(f.gate.authorizeSubmission({prepared, permission: addExtra({...permission})}), /matching_parent_permit_required/);
    assert.equal(f.count('parent.authenticateCurrentChain'), before);
  });
}

await test('public permission is rebuilt with only own whitelisted fields', async () => {
  const f = fixture();
  const {prepared, permission} = await f.preparedAndPermitted();
  const input = Object.assign(Object.create({inherited_secret: 'synthetic-secret'}), permission);
  Object.defineProperty(input, 'execute_import', {value: true, enumerable: false});
  const output = publicImportPermission(input, prepared, f.scope, f.artifact);
  assert.deepEqual(Reflect.ownKeys(output).sort(), Reflect.ownKeys(permission).sort());
  assert.equal(Object.getPrototypeOf(output), Object.prototype);
  assert.equal('inherited_secret' in output, false);
  assert.equal(Object.getOwnPropertyDescriptor(output, 'execute_import').enumerable, true);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(await f.gate.authorizeSubmission({prepared, permission: output}), true);
});

await test('public saving fields alone cannot substitute for parent authentication', async () => {
  const f = fixture({authorizeSubmission: async () => false});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /parent_consumed_saving_authorization_required/);
  assert.equal(f.count('enterNativeFilename'), 0);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('expired parent chain is rejected before native filename input', async () => {
  const f = fixture();
  const {permission} = await f.preparedAndPermitted();
  f.setAuthHook(chain => ({...chain, current: false}));
  await assert.rejects(f.adapter.submit(f.scope, permission), /parent_permission_no_longer_current/);
  assert.equal(f.count('enterNativeFilename'), 0);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('permission revoked between literal filename input and Open prevents Open', async () => {
  let checks = 0;
  const f = fixture({authHook: chain => (++checks < 3 ? chain : {...chain, current: false})});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /parent_permission_no_longer_current/);
  assert.equal(f.count('enterNativeFilename'), 1);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('permission revoked during Open scene confirmation prevents the immediate mouse dispatch', async () => {
  let checks = 0;
  const f = fixture({authHook: chain => (++checks < 4 ? chain : {...chain, current: false})});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /parent_permission_no_longer_current/);
  assert.equal(f.count('enterNativeFilename'), 1);
  assert.equal(f.clicked('native_open').length, 0);
  assert.equal(f.adapter.diagnostic().open_issued, false);
});

for (const [name, changes] of [
  ['scene identity', {scene_id: 'synthetic-scene-changed-during-parent-await'}],
  ['active window', {active_window_id: 'synthetic-other-active-window'}],
]) {
  await test('a changed ' + name + ' during the final parent await prevents Open without replay', async () => {
    const reached = deferred(), release = deferred();
    let checks = 0, afterAuthorization = false;
    const f = fixture({
      authHook: async chain => {
        if (++checks === 4) {
          reached.resolve();
          await release.promise;
          afterAuthorization = true;
        }
        return chain;
      },
      overrides: {confirmScene: async (args, original) => ({...(await original(args)),
        ...(afterAuthorization ? changes : {})})},
    });
    const {permission} = await f.preparedAndPermitted();
    const submitting = f.adapter.submit(f.scope, permission);
    await reached.promise;
    assert.equal(f.clicked('native_open').length, 0);
    assert.equal(f.adapter.diagnostic().open_issued, false);
    release.resolve();
    await assert.rejects(submitting, /scene_changed_before_click/);
    assert.equal(f.events.filter(event => event.method === 'confirmScene' &&
      event.args.snapshot.filename === f.artifact.absolute_path).length, 2);
    assert.equal(f.clicked('native_open').length, 0);
    assert.equal(f.adapter.diagnostic().open_issued, false);
    const eventCount = f.events.length;
    await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
    assert.equal(f.events.length, eventCount);
  });
}

await test('the scene observation after final authorization must remain fresh before Open', async () => {
  let afterAuthorization = false, checks = 0;
  const f = fixture({
    authHook: chain => {if (++checks === 4) afterAuthorization = true; return chain;},
    overrides: {confirmScene: async (args, original, {now}) => ({...(await original(args)),
      ...(afterAuthorization ? {observed_at: new Date(Date.parse(now()) - 15001).toISOString()} : {})})},
  });
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /fresh_observation_required/);
  assert.equal(f.events.filter(event => event.method === 'confirmScene' &&
    event.args.snapshot.filename === f.artifact.absolute_path).length, 2);
  assert.equal(f.clicked('native_open').length, 0);
  assert.equal(f.adapter.diagnostic().open_issued, false);
  const eventCount = f.events.length;
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
  assert.equal(f.events.length, eventCount);
});

await test('the final scene read is awaited and recorded after parent authorization before the one Open', async () => {
  const completedLabels = [];
  let f;
  f = fixture({confirmCompletion: (label, outcome) => {
    completedLabels.push(label);
    if (label === 'native_open.scene_after_authorization') {
      assert.equal(f.cleanup.diagnostic().pending_actions, 1);
      assert.equal(outcome.kind, 'fulfilled');
      assert.equal(outcome.value.source, 'official_host_scene_observation');
    }
    return outcome.kind === 'fulfilled' && outcome.value?.fixture_action_completed === true;
  }});
  const {permission} = await f.preparedAndPermitted();
  await f.adapter.submit(f.scope, permission);
  const lastAuthIndex = f.events.findLastIndex(event => event.method === 'parent.authenticateCurrentChain');
  const lastSceneIndex = f.events.findLastIndex(event => event.method === 'confirmScene');
  const openIndex = f.events.findIndex(event => event.method === 'clickOnce' && event.args.semantic === 'native_open');
  assert.ok(lastAuthIndex < lastSceneIndex && lastSceneIndex < openIndex);
  assert.equal(f.count('parent.authenticateCurrentChain'), 4);
  assert.equal(f.events.filter(event => event.method === 'confirmScene' &&
    event.args.snapshot.filename === f.artifact.absolute_path).length, 2);
  assert.equal(completedLabels.filter(label => label === 'native_open.scene_after_authorization').length, 1);
  assert.equal(f.clicked('native_open').length, 1);
  assert.equal(f.cleanup.diagnostic().settled_actions, completedLabels.length);
  assert.equal(f.cleanup.diagnostic().pending_actions, 0);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 0);
  assert.equal((await f.adapter.settlement(f.scope)).actions_settled, true);
});

for (const [name, changes] of [
  ['a replacement window', {window_id: 'foreign-window'}],
  ['missing title', {title: undefined}],
  ['selected file before allowed input', {files_selected: true}],
  ['already submitted window', {submitted: true}],
  ['inactive native window', {active: false}],
  ['another active native window', {active_window_id: 'foreign-active-window'}],
]) {
  await test(name + ' cannot be used for this prepared native filename entry', async () => {
    const f = fixture({overrides: {captureNativeDialog: async (args, original) => ({...(await original(args)), ...changes})}});
    const {permission} = await f.preparedAndPermitted();
    await assert.rejects(f.adapter.submit(f.scope, permission), /same_unsubmitted_native_dialog_required|matching_native_dialog_required/);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal(f.clicked('native_open').length, 0);
  });
}

await test('typing must not press Enter or report file submission', async () => {
  const f = fixture({overrides: {enterNativeFilename: async (args, original) => ({...(await original(args)), enter_pressed: true})}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /native_filename_input_unconfirmed/);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('the filename input receipt must follow the actual filename field click', async () => {
  const f = fixture({overrides: {enterNativeFilename: async (args, original, {now}) => ({...(await original(args)),
    observed_at: new Date(Date.parse(now()) - 1).toISOString()})}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /current_filename_receipt_required/);
  assert.equal(f.count('enterNativeFilename'), 1);
  assert.equal(f.count('captureNativeDialog'), 1);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('a filename receipt after its field click but before the actual input began is rejected', async () => {
  let f;
  f = fixture({overrides: {
    clickOnce: async (args, original) => {
      const value = await original(args);
      if (args.semantic === 'native_filename') f.advance(1000);
      return value;
    },
    enterNativeFilename: async (args, original) => ({...(await original(args)),
      observed_at: new Date(Date.parse(f.now()) - 500).toISOString()}),
  }});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /current_filename_receipt_required/);
  assert.equal(f.count('enterNativeFilename'), 1);
  assert.equal(f.count('captureNativeDialog'), 1);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('the full-path Open screenshot must be observed after the actual filename input', async () => {
  let f, captures = 0;
  f = fixture({overrides: {
    enterNativeFilename: async (args, original) => {f.advance(1000); return original(args);},
    captureNativeDialog: async (args, original) => {
      const value = await original(args);
      return ++captures === 2 ? {...value, observed_at: new Date(Date.parse(f.now()) - 500).toISOString()} : value;
    },
  }});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /native_filename_changed/);
  assert.equal(f.count('enterNativeFilename'), 1);
  assert.equal(f.count('captureNativeDialog'), 2);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('the complete literal path must be reobserved before Open', async () => {
  let captures = 0;
  const f = fixture({overrides: {captureNativeDialog: async (args, original) => {
    const value = await original(args);
    return ++captures === 2 ? {...value, filename: '/synthetic-host/wrong.docx'} : value;
  }}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /native_filename_changed/);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('a changed native window between screenshot and mouse is rejected', async () => {
  const f = fixture({overrides: {confirmScene: async (args, original) => {
    const value = await original(args);
    return args.snapshot.kind === 'native_dialog' ? {...value, window_id: 'foreign-window'} : value;
  }}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /scene_changed_before_click/);
  assert.equal(f.count('enterNativeFilename'), 0);
});

await test('Open cannot repeat after a successful submission', async () => {
  const f = fixture();
  const {permission} = await f.preparedAndPermitted();
  await f.adapter.submit(f.scope, permission);
  const before = f.events.length;
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_native_submission_required/);
  assert.equal(f.events.length, before);
  assert.equal(f.clicked('native_open').length, 1);
});

await test('a concurrent submit cannot race the single Open attempt', async () => {
  const wait = deferred(), reached = deferred();
  const f = fixture({overrides: {enterNativeFilename: async (args, original) => {
    reached.resolve(); await wait.promise; return original(args);
  }}});
  const {permission} = await f.preparedAndPermitted();
  const submitting = f.adapter.submit(f.scope, permission);
  await reached.promise;
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
  wait.resolve();
  await submitting;
  assert.equal(f.count('enterNativeFilename'), 1);
  assert.equal(f.clicked('native_open').length, 1);
});

await test('lost Open reply remains unknown, cannot retry and survives local cancellation', async () => {
  const f = fixture({overrides: {clickOnce: async (args, original) => {
    if (args.semantic !== 'native_open') return original(args);
    // The dispatch really occurred in the fixture, but its completion is unknown.
    await original(args);
    throw Error('synthetic lost Open reply');
  }}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /lost Open reply/);
  assert.equal(f.adapter.diagnostic().open_issued, true);
  assert.equal(f.adapter.diagnostic().phase, 'unknown');
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
  const cancelled = f.adapter.cancelLocal();
  assert.equal(cancelled.phase, 'cancelled');
  assert.equal(cancelled.unknown_actions, 1);
  assert.equal(cancelled.window_id, 'synthetic-native-window');
  assert.equal(cancelled.native_phase, 'open');
  const receipt = await f.adapter.settlement(f.scope);
  assert.equal(receipt.actions_settled, false);
  assert.equal(receipt.chooser_closed, false);
  assert.equal(f.clicked('native_open').length, 1);
  assert.equal(f.count('observeNativeClosure'), 0);
});

await test('unconfirmed fulfilled command is also unknown and not replayable', async () => {
  const f = fixture({overrides: {clickOnce: async (args, original) => {
    const value = await original(args);
    return args.semantic === 'import_document' ? {...value, fixture_action_completed: false} : value;
  }}});
  await assert.rejects(f.adapter.prepare(f.scope), /Action completion unconfirmed/);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  await assert.rejects(f.adapter.prepare(f.scope), /single_execution_chain_required/);
  assert.equal(f.count('clickOnce'), 1);
});

for (const [name, changes] of [
  ['foreign epoch', value => ({...value, epoch: Symbol('foreign-native-epoch')})],
  ['foreign window', value => ({...value, window_id: 'foreign-window'})],
  ['foreign cycle', value => ({...value, cycle: value.cycle + 1})],
  ['copied Open receipt', value => ({...value, open_click: {...value.open_click}})],
  ['closure not observed', value => ({...value, closed: false})],
  ['setFiles returned source', value => ({...value, source: 'setFiles_returned'})],
]) {
  await test(name + ' cannot confirm exact native closure', async () => {
    const f = fixture({overrides: {observeNativeClosure: async (args, original) => changes(await original(args))}});
    const {permission} = await f.preparedAndPermitted();
    await assert.rejects(f.adapter.submit(f.scope, permission), /actual_native_closure_required/);
    assert.equal(f.adapter.diagnostic().native_phase, 'open');
    assert.equal(f.adapter.diagnostic().open_issued, true);
    assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
    await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
    assert.equal(f.clicked('native_open').length, 1);
  });
}

await test('missing native window title blocks settlement despite successful exact closure', async () => {
  const f = fixture({readWindows: async () => [{modal: false}]});
  const {permission} = await f.preparedAndPermitted();
  await f.adapter.submit(f.scope, permission);
  const receipt = await f.adapter.settlement(f.scope);
  assert.equal(receipt.actions_settled, true);
  assert.equal(receipt.native_dialog_closed, true);
  assert.equal(receipt.chooser_closed, false);
});

await test('ledger changes while windows are read make otherwise clear settlement stale', async () => {
  const f = fixture();
  const {permission} = await f.preparedAndPermitted();
  await f.adapter.submit(f.scope, permission);
  const wait = deferred(), reached = deferred();
  f.setWindowReader(() => {reached.resolve(); return wait.promise;});
  const reading = f.adapter.settlement(f.scope);
  await reached.promise;
  const ticket = f.rawCleanup.beginAction('synthetic-other-observation-during-read');
  f.rawCleanup.finishAction(ticket, 'settled');
  wait.resolve(clearWindows());
  const receipt = await reading;
  assert.equal(receipt.actions_settled, true);
  assert.equal(receipt.chooser_closed, false);
});

await test('incomplete old ledger cannot be promoted into a native adapter', () => {
  assert.throws(() => fixture({freshInstance: false}), /new_complete_empty_cleanup_required/);
});

await test('the same native ledger cannot be bound to a second adapter instance', () => {
  const f = fixture();
  assert.throws(() => constructAdapter(f, f.cleanup), /new_native_only_cleanup_instance_required/);
});

await test('the same reviewed raw ledger cannot receive a fresh second native brand', () => {
  const f = fixture();
  assert.throws(() => createNativeCoordinateCleanup({scope: f.scope, readWindows: async () => clearWindows(),
    makeCleanupAdapter: () => f.rawCleanup, now: f.now}), /unused_reviewed_cleanup_required/);
});

await test('a native ledger scope cannot be changed before its first adapter binding', () => {
  const f = fixture();
  const unused = createNativeCoordinateCleanup({scope: f.scope, readWindows: async () => clearWindows(),
    makeCleanupAdapter: createReviewedCleanup, now: f.now});
  assert.throws(() => constructAdapter(f, unused, {...f.scope, tab_id: 'foreign-tab'}), /scope_changed/);
});

await test('raw browser-cleanup ledgers are refused by the native adapter boundary', () => {
  const f = fixture();
  assert.throws(() => constructAdapter(f, f.rawCleanup), /new_native_only_cleanup_instance_required/);
});

await test('native cleanup exposes no browser chooser creation or ledger reset capability', () => {
  assert.deepEqual(Object.keys(fixture().cleanup).sort(), ['diagnostic', 'readSettlement', 'runAwaited']);
});

await test('read-only terminal closure can settle a known prepared window without submitting a file', async () => {
  const f = fixture();
  const {permission} = await f.preparedAndPermitted();
  f.setAuthHook(chain => ({...chain, current: false}));
  await assert.rejects(f.adapter.submit(f.scope, permission), /parent_permission_no_longer_current/);
  assert.equal(f.count('enterNativeFilename'), 0);
  const closure = await f.adapter.observeClosureForSettlement(f.scope);
  assert.equal(closure.native_dialog_closed, true);
  const terminal = f.events.filter(event => event.method === 'observeNativeClosure').at(-1);
  assert.equal(terminal.args.purpose, 'settlement');
  assert.equal(terminal.args.window_id, 'synthetic-native-window');
  assert.equal(terminal.args.open_click, null);
  assert.equal(terminal.args.creation_click.source, 'official_host_mouse_receipt');
  const settled = await f.adapter.settlement(f.scope);
  assert.equal(settled.actions_settled, true);
  assert.equal(settled.chooser_closed, true);
  assert.equal(f.adapter.diagnostic().phase, 'unknown');
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
  assert.equal(f.clicked('native_open').length, 0);
});

await test('read-only exact closure after lost Open reply never clears the unknown action', async () => {
  const f = fixture({overrides: {clickOnce: async (args, original) => {
    if (args.semantic !== 'native_open') return original(args);
    await original(args);
    throw Error('synthetic lost Open reply');
  }}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /lost Open reply/);
  f.adapter.cancelLocal();
  const closure = await f.adapter.observeClosureForSettlement(f.scope);
  assert.equal(closure.native_dialog_closed, true);
  assert.equal(f.adapter.diagnostic().phase, 'cancelled');
  assert.equal(f.adapter.diagnostic().unknown_actions, 1);
  const settled = await f.adapter.settlement(f.scope);
  assert.equal(settled.native_dialog_closed, true);
  assert.equal(settled.actions_settled, false);
  assert.equal(settled.chooser_closed, false);
  assert.equal(f.clicked('native_open').length, 1);
  assert.equal(f.count('enterNativeFilename'), 1);
});

await test('terminal observation never invents a window identity when prepare did not confirm one', async () => {
  const f = fixture({overrides: {observeNativeDialog: async (args, original) => ({...(await original(args)), title: undefined})}});
  await assert.rejects(f.adapter.prepare(f.scope), /native_prepare_unconfirmed/);
  await assert.rejects(f.adapter.observeClosureForSettlement(f.scope), /known_native_window_required/);
  assert.equal(f.count('observeNativeClosure'), 0);
  assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
});

for (const [name, change] of [
  ['foreign epoch', value => ({...value, epoch: Symbol('foreign-terminal-instance')})],
  ['foreign window', value => ({...value, window_id: 'foreign-terminal-window'})],
  ['foreign cycle', value => ({...value, cycle: value.cycle + 1})],
  ['copied creation click', value => ({...value, creation_click: {...value.creation_click}})],
  ['invented Open click', value => ({...value, open_click: {synthetic: 'foreign-click'}})],
  ['window still open', value => ({...value, closed: false})],
]) {
  await test('read-only terminal ' + name + ' cannot settle the exact native lifecycle', async () => {
    const f = fixture({overrides: {observeNativeClosure: async (args, original) => change(await original(args))}});
    await f.adapter.prepare(f.scope);
    f.adapter.cancelLocal();
    await assert.rejects(f.adapter.observeClosureForSettlement(f.scope), /actual_native_closure_required/);
    assert.equal(f.adapter.diagnostic().native_phase, 'open');
    assert.equal(f.adapter.diagnostic().phase, 'cancelled');
    assert.equal(f.clicked('native_open').length, 0);
    assert.equal(f.count('enterNativeFilename'), 0);
    assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
  });
}

await test('terminal closure binds the acknowledged original Open click even after a failed business observation', async () => {
  let reads = 0;
  const f = fixture({overrides: {observeNativeClosure: async (args, original) => {
    const value = await original(args);
    if (++reads === 1) return {...value, closed: false};
    return value;
  }}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /actual_native_closure_required/);
  const firstObserve = f.events.find(event => event.method === 'observeNativeClosure');
  await f.adapter.observeClosureForSettlement(f.scope);
  const terminalObserve = f.events.filter(event => event.method === 'observeNativeClosure').at(-1);
  assert.equal(terminalObserve.args.open_click, firstObserve.args.open_click);
  assert.equal(Object.isFrozen(terminalObserve.args.open_click), true);
  assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, true);
  assert.equal(f.adapter.diagnostic().phase, 'unknown');
  await assert.rejects(f.adapter.submit(f.scope, permission), /single_execution_chain_required/);
  assert.equal(f.clicked('native_open').length, 1);
});

await test('an unknown terminal observation itself remains in the ledger after cancellation', async () => {
  const f = fixture({overrides: {observeNativeClosure: async () => {throw Error('synthetic lost terminal observation');}}});
  await f.adapter.prepare(f.scope);
  f.adapter.cancelLocal();
  await assert.rejects(f.adapter.observeClosureForSettlement(f.scope), /lost terminal observation/);
  assert.equal(f.cleanup.diagnostic().unknown_actions, 1);
  assert.equal(f.adapter.diagnostic().phase, 'cancelled');
  const settlement = await f.adapter.settlement(f.scope);
  assert.equal(settlement.actions_settled, false);
  assert.equal(settlement.chooser_closed, false);
});

await test('closure older than its real Open click cannot be inferred from a fresh-looking window read', async () => {
  let f;
  f = fixture({overrides: {
    clickOnce: async (args, original) => {
      if (args.semantic === 'native_open') f.advance(1000);
      return original(args);
    },
    observeNativeClosure: async (args, original) => ({...(await original(args)),
      observed_at: new Date(Date.parse(f.now()) - 500).toISOString()}),
  }});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /actual_native_closure_required/);
  assert.equal(f.clicked('native_open').length, 1);
  assert.equal((await f.adapter.settlement(f.scope)).chooser_closed, false);
});

await test('a slow final parent authorization makes the old Open screenshot unusable', async () => {
  let f, checks = 0;
  f = fixture({authHook: chain => {if (++checks === 4) f.advance(15001); return chain;}});
  const {permission} = await f.preparedAndPermitted();
  await assert.rejects(f.adapter.submit(f.scope, permission), /fresh_observation_required/);
  assert.equal(f.clicked('native_open').length, 0);
  assert.equal(f.adapter.diagnostic().open_issued, false);
});

for (const [name, mutate, expected] of [
  ['claim before prepare', value => ({...value, claimed_at: '2026-10-10T23:59:59.000Z'}), /prepare_claim_reserve_consume_saving_order_required/],
  ['reserve before claim', value => ({...value, reserved_at: value.prepared.observed_at}), /prepare_claim_reserve_consume_saving_order_required/],
  ['consume before reserve', value => ({...value, consumed_at: value.claimed_at}), /prepare_claim_reserve_consume_saving_order_required/],
  ['saving before consume', value => ({...value, saving_at: value.reserved_at}), /prepare_claim_reserve_consume_saving_order_required/],
  ['claim not confirmed', value => ({...value, claim_confirmed: false}), /real_consumed_saving_chain_required/],
  ['reservation not confirmed', value => ({...value, reserved: false}), /real_consumed_saving_chain_required/],
  ['consume not confirmed', value => ({...value, consumed: false}), /real_consumed_saving_chain_required/],
  ['saving not confirmed', value => ({...value, delivery_status: 'ready'}), /real_consumed_saving_chain_required/],
  ['copied prepare object', value => ({...value, prepared: {...value.prepared}}), /real_consumed_saving_chain_required/],
  ['foreign artifact SHA', value => ({...value, artifact_sha256: OTHER_SHA}), /real_consumed_saving_chain_required/],
  ['foreign artifact size', value => ({...value, artifact_size_bytes: WORD_SIZE - 1}), /real_consumed_saving_chain_required/],
  ['foreign account chain', value => ({...value, target_account: 'foreign-account'}), /scope_changed/],
]) {
  await test('parent gate refuses ' + name + ' without issuing a public permission', async () => {
    const {f, prepared} = preparedReceipt();
    f.setAuthHook(mutate);
    await assert.rejects(f.gate.issue(prepared), expected);
    assert.equal(f.count('enterNativeFilename'), 0);
  });
}

await test('parent permission binds the exact prepared object and cannot authorize a copy', async () => {
  const {f, prepared} = preparedReceipt();
  const permission = await f.gate.issue(prepared);
  await assert.rejects(f.gate.authorizeSubmission({prepared: {...prepared}, permission}), /matching_parent_permit_required/);
  await assert.rejects(f.gate.issue(prepared), /permit_once_required/);
});

await test('a permission from another prepared native attempt cannot be used by this adapter', async () => {
  const a = fixture({instanceId: 'synthetic-instance-A'}), b = fixture({instanceId: 'synthetic-instance-B'});
  const {permission} = await a.preparedAndPermitted();
  await b.adapter.prepare(b.scope);
  await assert.rejects(b.adapter.submit(b.scope, permission), /native_import_permission_required/);
  assert.equal(b.count('enterNativeFilename'), 0);
  assert.equal(b.clicked('native_open').length, 0);
});

await test('parent gate refuses a changed attempt even when the public prepare object is unchanged', async () => {
  const {f, prepared} = preparedReceipt();
  const permission = await f.gate.issue(prepared);
  f.setAuthHook(chain => ({...chain, attempt_id: 'synthetic-foreign-attempt'}));
  await assert.rejects(f.gate.authorizeSubmission({prepared, permission}), /parent_permission_no_longer_current|parent_chain_changed|original_parent_attempt_chain_required/);
});

await test('parent gate rechecks authorization order before each submission decision', async () => {
  const {f, prepared} = preparedReceipt();
  const permission = await f.gate.issue(prepared);
  f.setAuthHook(chain => ({...chain, consumed_at: chain.claimed_at}));
  await assert.rejects(f.gate.authorizeSubmission({prepared, permission}), /prepare_claim_reserve_consume_saving_order_required|parent_chain_changed|original_parent_attempt_chain_required/);
});

await test('concurrent parent issue calls cannot both issue a once-only permission', async () => {
  const {f, prepared} = preparedReceipt();
  const wait = deferred(), reached = deferred();
  let reads = 0;
  f.setAuthHook(async chain => {reads++; reached.resolve(); await wait.promise; return chain;});
  const first = f.gate.issue(prepared);
  await reached.promise;
  // Attach the rejection observer immediately so node sees no unhandled promise.
  const second = f.gate.issue(prepared).then(value => ({value}), error => ({error}));
  wait.resolve();
  await first;
  const result = await second;
  assert.match(String(result.error), /permit_once_required|parent_issue_in_progress/);
  assert.equal(reads, 1);
});

await test('a parent authentication failure cannot reset the once-only issue gate', async () => {
  const {f, prepared} = preparedReceipt();
  f.setAuthHook(() => {throw Error('synthetic lost parent authentication reply');});
  await assert.rejects(f.gate.issue(prepared), /lost parent authentication/);
  f.setAuthHook(chain => chain);
  await assert.rejects(f.gate.issue(prepared), /permit_once_required/);
  assert.equal(f.count('parent.authenticateCurrentChain'), 1);
});

await test('only an empty title in a verified new draft can receive the complete original title', () => {
  const original_title = '完整原标题：陈楚生的故事、音乐与时间';
  assert.deepEqual(titleWriteDecision({is_new_draft: true, observed_title: '', original_title}), {write: true, value: original_title});
  assert.deepEqual(titleWriteDecision({is_new_draft: true, observed_title: original_title, original_title}), {write: false, value: original_title});
  assert.throws(() => titleWriteDecision({is_new_draft: false, observed_title: '', original_title}), /existing_title_must_not_be_overwritten/);
  assert.throws(() => titleWriteDecision({is_new_draft: true, observed_title: '已有标题', original_title}), /existing_title_must_not_be_overwritten/);
});

function draftFixture(platform = 'toutiao') {
  const f = fixture({platform});
  const source = {article_id: f.scope.article_id, host_id: f.artifact.host_id,
    word_sha256: f.artifact.sha256, word_size_bytes: f.artifact.size_bytes,
    original_title: '完整原标题：陈楚生的故事', full_body_sha256: OTHER_SHA,
    images: Array.from({length: 22}, (_, index) => ({id: 'original-image-' + index,
      before_anchor: '完整正文前锚点-' + index, after_anchor: '完整正文后锚点-' + index,
      ratio: 1.5, ratio_tolerance: 0.01}))};
  const draft_url = platform === 'toutiao'
    ? 'https://mp.toutiao.com/profile_v4/graphic/edit?draft=synthetic-draft-1'
    : 'https://zhuanlan.zhihu.com/p/synthetic-draft-1/edit';
  const saved = {...f.scope, source: 'official_saved_draft_observation', saved: true,
    private: true, published: false, channel: NATIVE_CHANNEL,
    draft_id: 'synthetic-draft-1', draft_url, pass_id: 'synthetic-save-pass',
    url_identity_verified: true, url_identity_evidence_ref: 'synthetic-saved-url-identity',
    observed_at: '2026-10-11T00:00:02.000Z'};
  const readback = {...f.scope, source: 'official_saved_draft_full_readback',
    independent: true, reopened: true, pass_id: 'synthetic-reopen-pass',
    draft_id: saved.draft_id, draft_url, private: true, published: false,
    url_identity_verified: true, url_identity_evidence_ref: 'synthetic-reopened-url-identity',
    account_verified: true, account_evidence_ref: 'synthetic-reopened-account-evidence',
    observed_at: '2026-10-11T00:00:03.000Z', title: source.original_title,
    full_body_sha256: source.full_body_sha256, coverage: 'full',
    text_evidence_ref: 'synthetic-entire-body-evidence',
    images: source.images.map((image, index) => ({index, source_image_id: image.id,
      identity_match: true, identity_evidence_ref: 'synthetic-image-evidence-' + index,
      loaded: true, natural_width: 900, natural_height: 600, display_width: 450, display_height: 300,
      before_anchor: image.before_anchor, after_anchor: image.after_anchor}))};
  return {scope: f.scope, artifact: f.artifact, source, saved, readback};
}

for (const platform of Object.keys(ACCOUNTS)) {
  await test(platform + ': full independent private readback verifies all 22 image identities', () => {
    const input = draftFixture(platform);
    const result = verifyPrivateDraft(input);
    assert.equal(result.body_images_verified, true);
    assert.equal(result.verification_scope, 'title_full_body_inline_images');
    assert.equal(result.platform_verified, false);
    assert.equal(Object.hasOwn(result, 'verified'), false);
    assert.equal(result.image_count, 22);
    assert.equal(result.draft_url, input.saved.draft_url);
  });
}
for (const [name, mutate, expected] of [
  ['same verification pass', value => {value.readback.pass_id = value.saved.pass_id;}, /independent_same_private_draft_readback_required/],
  ['body truncated', value => {value.readback.coverage = 'first-and-last';}, /full_text_and_image_coverage_required/],
  ['body changed', value => {value.readback.full_body_sha256 = 'b'.repeat(64);}, /full_text_and_image_coverage_required/],
  ['title truncated', value => {value.readback.title = '陈楚生';}, /full_text_and_image_coverage_required/],
  ['wrong image identity at position 21', value => {value.readback.images[21].source_image_id = 'foreign-image';}, /individual_image_verification_failed/],
  ['two images exchanged', value => {[value.readback.images[5], value.readback.images[6]] = [value.readback.images[6], value.readback.images[5]];}, /individual_image_verification_failed/],
  ['anchor changed', value => {value.readback.images[11].before_anchor = 'wrong-anchor';}, /individual_image_verification_failed/],
  ['image unloaded', value => {value.readback.images[15].loaded = false;}, /individual_image_verification_failed/],
  ['ratio changed', value => {value.readback.images[10].natural_width = 1200;}, /individual_image_verification_failed/],
  ['display ratio changed', value => {value.readback.images[10].display_width = 600;}, /individual_image_verification_failed/],
  ['sparse 22-image source list', value => {delete value.source.images[10];}, /complete_dense_image_manifest_required/],
  ['sparse 22-image readback list', value => {delete value.readback.images[10];}, /complete_dense_image_manifest_required/],
  ['only image count proves identity', value => {value.readback.images[0].identity_match = false;}, /individual_image_verification_failed/],
  ['readback image evidence whitespace', value => {value.readback.images[0].identity_evidence_ref = '   ';}, /individual_image_verification_failed/],
  ['source from another Word', value => {value.source.word_sha256 = 'b'.repeat(64);}, /frozen_full_source_required/],
  ['source from another article', value => {value.source.article_id = 'other-article';}, /frozen_full_source_required/],
  ['URL does not bind the saved draft id', value => {value.saved.draft_url = 'https://mp.toutiao.com/profile_v4/graphic/edit?draft=other-draft';}, /url_draft_identity_mismatch/],
  ['URL identity observation missing', value => {value.saved.url_identity_verified = false;}, /observed_url_draft_identity_required/],
  ['draft was published', value => {value.saved.published = true;}, /saved_private_draft_required/],
  ['placeholder URL', value => {value.saved.draft_url = 'https://example.test/expected-draft';}, /real_draft_url_required/],
  ['readback before save', value => {value.readback.observed_at = '2026-10-11T00:00:01.000Z';}, /post_save_readback_required/],
]) {
  await test(name + ' cannot mark the website verified', () => {
    const input = draftFixture();
    mutate(input);
    assert.throws(() => verifyPrivateDraft(input), expected);
  });
}
