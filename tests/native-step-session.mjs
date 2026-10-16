// OFFLINE ONLY: raw tool values, images, model observations and public handoffs
// below are synthetic. No browser, Word, credentials, HTTP or platform writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createNativeStepSession} from '../scripts/browser-upload/coordinate/src/native-step-session.js';
import {createNativeActionLedger} from '../scripts/browser-upload/coordinate/src/native-action-ledger.js';

const START = Date.parse('2026-10-11T00:00:00.000Z');
const accounts = {toutiao: '61556093362', zhihu: 'ren-zhe-ai-chi-yu-52'};
const geometry = {screenshot_width: 1200, screenshot_height: 900, mouse_width: 1800,
  mouse_height: 1350, mouse_origin_x: 30, mouse_origin_y: 40,
  documented_mapping_ref: 'synthetic-documented-coordinate-mapping'};
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function fixture(options = {}) {
  const platform = options.platform || 'toutiao';
  const scope = Object.freeze({article_id: 'synthetic-native-step-article', platform,
    target_account: accounts[platform], browser_session: 'synthetic-step-session',
    executor_id: 'synthetic-step-executor', tab_id: 'synthetic-step-tab', host_id: 'synthetic-step-host',
    ...options.scope});
  const artifact = Object.freeze({absolute_path: '/synthetic-host/original-fixture.docx',
    sha256: 'a'.repeat(64), size_bytes: 2048, host_id: scope.host_id, ...options.artifact});
  const baseline = [101, 102, 103, 104].map((id, index) => Object.freeze({id,
    app: 'Synthetic X11', focused: index === 0, modal: false,
    geometry: {x: 0, y: 0, width: 1200, height: 900}}));
  const events = [], clicks = [], typed = [];
  let time = START, frame = 'synthetic-img-before-prepare', windowId = 999, nativePresent = false;
  let extraWindows = [], currentGeometry = {...geometry}, mimeType = 'image/png', latestSnapshot = null,
    validatedHandoff = null;
  let tab = {id: scope.tab_id, url: platform === 'toutiao'
    ? 'https://mp.toutiao.com/profile_v4/graphic/publish' : 'https://zhuanlan.zhihu.com/write'};
  let f;
  const now = () => new Date(time).toISOString();
  const windows = () => [
    ...baseline.map(value => ({...value, focused: nativePresent ? false : value.focused})),
    ...(nativePresent ? [{id: windowId, app: 'Synthetic Native File Picker', focused: true,
      modal: true, geometry: {x: 200, y: 150, width: 800, height: 600}}] : []),
    ...extraWindows,
  ];
  const implementations = {
    inspectFile: async () => ({...artifact}),
    readTab: async () => ({...tab}),
    readWindows: async () => windows(),
    captureScreenshot: async () => ({image: {data: frame, mimeType}, geometry: {...currentGeometry}}),
    click: async input => {clicks.push(input);}, // Actual documented call completion may be void.
    typeFilename: async input => {typed.push(input);}, // Void never proves the path was entered.
  };
  const host = Object.fromEntries(Object.entries(implementations).map(([method, operation]) =>
    [method, async input => {
      time++;
      const event = {method, input, started_at: now()};
      events.push(event);
      try {
        return await (options.overrides?.[method]
          ? options.overrides[method](input, operation, f) : operation(input));
      } finally { event.finished_at = now(); }
    }]));
  const session = createNativeStepSession({scope, artifact, host, now,
    instanceId: options.instanceId || 'synthetic-native-step-instance',
    confirmCompletion: options.confirmCompletion || ((_label, outcome) => outcome.kind === 'fulfilled')});
  async function step(operation, authorization) {
    const before = events.length;
    const sideEffectsBefore = clicks.length + typed.length;
    try {
      const value = await session.step({operation, ...(authorization ? {authorization} : {})});
      if (value.snapshot_id) latestSnapshot = value.snapshot_id;
      if (value.status === 'dispatch_ready') {
        // Read the actor's real returned timestamp; the fixture never creates a
        // readiness report or substitutes a parent receipt timestamp.
        assert.equal(typeof value.observed_at, 'string');
        assert.equal(Number.isFinite(Date.parse(value.observed_at)), true);
        const lastActualCall = events.at(-1);
        assert.equal(lastActualCall.method, 'captureScreenshot');
        assert.equal(Number.isFinite(Date.parse(lastActualCall.finished_at)), true);
        assert.ok(Date.parse(value.observed_at) >= Date.parse(lastActualCall.finished_at),
          'dispatch readiness follows the completed actual validation screenshot');
        assert.equal(value.observed_at, now(), 'the actor records readiness in the current host clock');
        validatedHandoff = authorization || null;
      }
      return value;
    } finally {
      assert.ok(clicks.length + typed.length - sideEffectsBefore <= 1,
        operation + ' dispatches at most one mouse or filename input action');
      const maxCalls = ['observe', 'validate'].includes(operation) ? 4 : 1;
      assert.ok(events.length - before <= maxCalls, operation + ' ends every current callback before returning');
    }
  }
  const visual = (semantic, extra = {}) => ({snapshot_id: latestSnapshot,
    source: 'model_visual_observation', semantic, bounds: {x: 80, y: 120, width: 60, height: 30},
    evidence_ref: 'synthetic-model-visible-' + semantic,
    unique: true, visible: true, enabled: true, unobscured: true, center_unobscured: true,
    observed_editor_url: tab.url,
    ...(session.diagnostic().prepared ? {observed_window_id: session.diagnostic().prepared.window_id} : {}), ...extra});
  async function confirm(semantic, review = {}) {
    const reviewed = session.review(visual(semantic, review));
    assert.equal(reviewed.next, 'validate');
    const matched = await validate();
    assert.equal(matched.status, 'dispatch_ready');
    return matched;
  }
  async function validate(authorization) {
    const current = session.diagnostic().prepared;
    return step('validate', authorization || (current ? handoff(current) : undefined));
  }
  async function begin() {
    return step('observe');
  }
  async function prepareStep(semantic, state, nextSemantic) {
    if (!latestSnapshot) await begin();
    await confirm(semantic);
    await step('click_prepare');
    frame = 'synthetic-img-after-' + semantic;
    if (state === 'native_dialog') nativePresent = true;
    await step('observe');
    return session.acceptPrepareObservation({snapshot_id: latestSnapshot,
      source: 'model_visual_observation', evidence_ref: 'synthetic-model-after-' + semantic,
      state, ...(nextSemantic ? {next_semantic: nextSemantic} : {}),
      ...(state === 'native_dialog' ? {window_id: String(windowId), files_selected: false,
        submitted: false, native_dialog_semantics_confirmed: true} : {})});
  }
  async function prepare() {
    if (platform === 'zhihu') {
      await prepareStep('open_document_menu', 'document_menu', 'import_document');
      await step('observe');
    }
    await prepareStep('import_document', 'document_modal', 'choose_document');
    await step('observe');
    return (await prepareStep('choose_document', 'native_dialog')).prepared;
  }
  const handoff = (prepared, extra = {}) => ({...scope, channel: 'native_file_dialog',
    prepared_id: prepared.prepared_id, window_id: prepared.window_id, cycle: prepared.cycle,
    attempt_id: 'synthetic-original-parent-attempt', sha256: artifact.sha256,
    size_bytes: artifact.size_bytes, execute_import: true, delivery_status: 'saving',
    checked_at: now(), ...extra});
  async function focusForTyping(prepared) {
    const authorization = handoff(prepared);
    const accepted = session.acceptParentHandoff(authorization);
    assert.equal(accepted.semantic, 'native_filename');
    await step('observe');
    await confirm('native_filename');
    await step('click_filename', validatedHandoff);
    frame = 'synthetic-img-filename-field-focused';
    await step('observe');
    const focused = session.review(visual('native_filename', {filename_field_focused: true}));
    assert.equal(focused.next, 'validate');
    const ready = await validate();
    assert.equal(ready.status, 'dispatch_ready'); assert.equal(ready.operation, 'type_filename');
    return authorization;
  }
  async function focusAndType(prepared) {
    const authorization = await focusForTyping(prepared);
    await step('type_filename', validatedHandoff);
    frame = 'synthetic-img-literal-full-path-visible';
    await step('observe');
    return authorization;
  }
  async function verifyFilenameAndReviewOpen(prepared) {
    const checked = session.review(visual('native_filename', {
      observed_filename: artifact.absolute_path, filename_evidence_ref: 'synthetic-full-path-visual-evidence'}));
    assert.equal(checked.semantic, 'native_open');
    assert.equal(checked.next, 'model_review');
    await confirm('native_open');
    return prepared;
  }
  async function readyOpen() {
    const prepared = await prepare();
    await focusAndType(prepared);
    await verifyFilenameAndReviewOpen(prepared);
    return prepared;
  }
  f = {scope, artifact, host, session, events, clicks, typed, baseline, now, windows,
    step, visual, confirm, validate, begin, prepareStep, prepare, handoff, focusForTyping, focusAndType,
    verifyFilenameAndReviewOpen, readyOpen,
    advance: ms => {time += ms;},
    setFrame: value => {frame = value;}, setGeometry: value => {currentGeometry = value;},
    setMimeType: value => {mimeType = value;},
    setNativePresent: value => {nativePresent = value;},
    setExtraWindows: value => {extraWindows = value;},
    setTab: value => {tab = value;}, setNativeWindow: value => {windowId = value;},
    get snapshotId() {return latestSnapshot;},
    get validatedHandoff() {return validatedHandoff;},
  };
  return f;
}

for (const platform of Object.keys(accounts)) {
  await test(platform + ': per-call reads are awaited, titleless native window, literal path and single Open', async () => {
    const f = fixture({platform, overrides: {captureScreenshot: async (input, original, state) => {
      const image = await original(input);
      state.advance(5); // Distinguish actual screenshot completion from call entry.
      return image;
    }}});
    const prepared = await f.readyOpen();
    assert.equal(prepared.channel, 'native_file_dialog');
    assert.equal(prepared.window_id, '999');
    assert.equal(prepared.cycle, 1);
    assert.deepEqual(prepared.association.baseline_window_ids, ['101', '102', '103', '104']);
    assert.equal(prepared.association.source, 'project_tool_call_correlation');
    assert.equal(Object.hasOwn(prepared, 'owner_tab_id'), false);
    assert.equal(Object.hasOwn(prepared, 'title'), false);
    assert.equal(Object.hasOwn(prepared, 'official_receipt'), false);
    assert.equal(f.clicks.length, (platform === 'zhihu' ? 3 : 2) + 1);
    assert.deepEqual(f.typed, [{text: f.artifact.absolute_path, press_enter: false}]);
    const result = await f.step('click_open', f.validatedHandoff);
    assert.equal(result.call_record.source, 'project_awaited_tool_call');
    assert.equal(result.open_issued, true);
    assert.equal(f.clicks.length, (platform === 'zhihu' ? 3 : 2) + 2);
    for (const click of f.clicks) {
      assert.deepEqual(click, {x: 195, y: 242.5, button: 'left', click_count: 1});
    }
    f.setNativePresent(false);
    const closed = await f.step('read_windows');
    assert.equal(closed.status, 'native_closed_observed');
    assert.equal(closed.windows.length, 4);
    assert.equal(closed.windows.every(value => !Object.hasOwn(value, 'title')), true);
    const settled = f.session.settlement();
    assert.equal(settled.actions_settled, true);
    assert.equal(settled.native_dialog_closed, true);
    assert.equal(settled.chooser_closed, true);
    assert.equal(settled.closure.source, 'project_correlated_exact_window_absence');
    assert.equal(f.session.diagnostic().pending_actions, 0);
    assert.equal(f.session.diagnostic().unknown_actions, 0);
    assert.equal(f.session.diagnostic().settled_actions, f.events.length,
      'every actual raw host call has one completed ledger record');
    for (const [index, event] of f.events.entries()) {
      if (['click', 'typeFilename'].includes(event.method)) {
        assert.deepEqual(f.events.slice(index - 4, index).map(value => value.method),
          ['inspectFile', 'readTab', 'readWindows', 'captureScreenshot'],
          'current-call validation reads immediately precede one real side effect');
      }
    }
    assert.equal(Object.hasOwn(settled, 'verified'), false);
    assert.equal(Object.hasOwn(settled, 'completed'), false);
    await assert.rejects(f.step('click_open', f.validatedHandoff), /explicit_current_dispatch_ready_required|single_expected_native_click_required|native_execution_fenced/);
    assert.equal(f.clicks.length, (platform === 'zhihu' ? 3 : 2) + 2);
  });
}

await test('model review and prepare observation dispatch no actual host callback', async () => {
  const f = fixture();
  await f.begin();
  const before = f.events.length;
  f.session.review(f.visual('import_document'));
  assert.equal(f.events.length, before);
  await f.validate();
  await f.step('click_prepare');
  f.setFrame('synthetic-document-modal');
  await f.step('observe');
  const after = f.events.length;
  f.session.acceptPrepareObservation({snapshot_id: f.snapshotId, source: 'model_visual_observation',
    evidence_ref: 'synthetic-modal', state: 'document_modal', next_semantic: 'choose_document'});
  assert.equal(f.events.length, after);
});

for (const [name, scope] of [
  ['wrong platform account', {target_account: 'foreign-account'}],
  ['missing host identity', {host_id: ''}], ['unknown platform', {platform: 'other'}],
  ['overlong tab identity', {tab_id: 'x'.repeat(181)}],
]) await test(name + ' cannot initialize a native actor', () => {
  assert.throws(() => fixture({scope}), /native_scope_required/);
});

for (const [name, artifact] of [
  ['relative path', {absolute_path: 'original.docx'}],
  ['path traversal', {absolute_path: '/synthetic-host/../original.docx'}],
  ['path control characters', {absolute_path: '/synthetic-host/new\noriginal.docx'}],
  ['wrong host Word', {host_id: 'foreign-host'}], ['invalid SHA', {sha256: 'bad'}],
  ['zero size', {size_bytes: 0}], ['non Word path', {absolute_path: '/synthetic-host/original.txt'}],
]) await test(name + ' cannot initialize a native actor', () => {
  assert.throws(() => fixture({artifact}), /native_word_required/);
});

await test('the frozen Chen Chusheng Word cannot be replaced or regenerated', () => {
  assert.throws(() => fixture({scope: {article_id: 'd29d424a-c09d-4db2-af4d-213ec41716d2'}}), /original_word_must_be_preserved/);
  const f = fixture({scope: {article_id: 'd29d424a-c09d-4db2-af4d-213ec41716d2'}, artifact: {
    sha256: '1166925f3585033cf77741d1de594b2681d36260763c7ecc7e8aa35087b296e0', size_bytes: 11947179}});
  assert.equal(f.artifact.size_bytes, 11947179);
});

for (const [name, decorate] of [
  ['secret extra field', value => ({...value, credential: 'synthetic-secret'})],
  ['symbol extra field', value => ({...value, [Symbol('foreign')]: true})],
  ['hidden extra field', value => Object.defineProperty({...value}, 'hidden', {value: true})],
  ['getter field', value => Object.defineProperty({...value}, 'host_id', {enumerable: true, get: () => value.host_id})],
  ['inherited identities', value => Object.create(value)],
]) await test('constructor scope rejects ' + name, () => {
  const f = fixture();
  assert.throws(() => createNativeStepSession({scope: decorate(f.scope), artifact: f.artifact,
    host: f.host, instanceId: 'synthetic-other', now: f.now, confirmCompletion: () => true}), /native_scope_required/);
});

for (const [name, raw] of [
  ['missing actual image', {geometry}],
  ['empty image bytes', {image: {data: '', mimeType: 'image/png'}, geometry}],
  ['missing MIME', {image: {data: 'synthetic-img'}, geometry}],
  ['missing documented mapping', {image: {data: 'synthetic-img', mimeType: 'image/png'},
    geometry: {...geometry, documented_mapping_ref: undefined}}],
  ['zero screenshot width', {image: {data: 'synthetic-img', mimeType: 'image/png'},
    geometry: {...geometry, screenshot_width: 0}}],
  ['nonfinite mouse origin', {image: {data: 'synthetic-img', mimeType: 'image/png'},
    geometry: {...geometry, mouse_origin_x: Infinity}}],
]) await test(name + ' cannot become a model screenshot', async () => {
  const f = fixture({overrides: {captureScreenshot: async () => raw}});
  await assert.rejects(f.step('observe'), /actual_image_and_documented_mapping_required/);
  assert.equal(f.clicks.length, 0);
});

await test('a changed same-host Word identity is rejected before any prepare click', async () => {
  const f = fixture({overrides: {inspectFile: async (input, original) => ({...(await original(input)), sha256: 'b'.repeat(64)})}});
  await assert.rejects(f.step('observe'), /same_host_word_identity_changed/);
  assert.equal(f.clicks.length, 0);
});

for (const [name, change] of [
  ['fake official model source', {source: 'official_host_observation'}],
  ['old epoch snapshot', {snapshot_id: 'old-cancelled-instance:image:1'}],
  ['wrong platform semantic', {semantic: 'open_document_menu'}],
  ['unreviewed target identity', {unique: false}], ['invisible target', {visible: false}],
  ['disabled target', {enabled: false}], ['obscured target', {unobscured: false}],
  ['covered target center', {center_unobscured: false}], ['missing semantic evidence', {evidence_ref: ''}],
  ['blind fixed coordinate extras', {x: 100, y: 100}],
  ['foreign scope extras', {tab_id: 'foreign-tab'}],
]) await test(name + ' is rejected without mouse dispatch', async () => {
  const f = fixture(); await f.begin();
  assert.throws(() => f.session.review(f.visual('import_document', change)), /current_external_model_review_required|semantic_visible_target_required/);
  assert.equal(f.clicks.length, 0);
});

for (const [name, bounds] of [
  ['missing bounds', undefined], ['negative x', {x: -1, y: 1, width: 20, height: 20}],
  ['zero width', {x: 1, y: 1, width: 0, height: 20}],
  ['outside image', {x: 1195, y: 1, width: 20, height: 20}],
  ['nonfinite target', {x: NaN, y: 1, width: 20, height: 20}],
]) await test(name + ' cannot create a mouse decision', async () => {
  const f = fixture(); await f.begin();
  assert.throws(() => f.session.review(f.visual('import_document', {bounds})), /native_target_bounds_invalid/);
  assert.equal(f.clicks.length, 0);
});

await test('a model review expires before it can authorize a click', async () => {
  const f = fixture(); await f.begin(); f.advance(15001);
  assert.throws(() => f.session.review(f.visual('import_document')), /current_external_model_review_required/);
  assert.equal(f.clicks.length, 0);
});

await test('a changed screenshot requires a new model review and prevents the old click', async () => {
  const f = fixture(); await f.begin(); f.session.review(f.visual('import_document'));
  f.setFrame('synthetic-img-changed-after-model-review');
  const changed = await f.validate();
  assert.equal(changed.next, 'model_review');
  assert.equal(changed.frame_changed, true);
  await assert.rejects(f.step('click_prepare'), /explicit_current_dispatch_ready_required/);
  assert.equal(f.clicks.length, 0);
});

for (const [name, change] of [
  ['mouse width', {mouse_width: 2400}], ['mouse origin', {mouse_origin_x: 90}],
  ['screenshot height', {screenshot_height: 1000}],
  ['mapping provenance', {documented_mapping_ref: 'foreign-coordinate-map'}],
]) await test('same image bytes with changed ' + name + ' cannot retain the old model decision', async () => {
  const f = fixture(); await f.begin(); f.session.review(f.visual('import_document'));
  f.setGeometry({...geometry, ...change});
  const changed = await f.validate();
  assert.equal(changed.next, 'model_review');
  await assert.rejects(f.step('click_prepare'), /explicit_current_dispatch_ready_required/);
  assert.equal(f.clicks.length, 0);
});

await test('same image data with changed MIME cannot retain the old model decision', async () => {
  const f = fixture(); await f.begin(); f.session.review(f.visual('import_document'));
  f.setMimeType('image/jpeg');
  const changed = await f.validate();
  assert.equal(changed.next, 'model_review');
  assert.equal(f.clicks.length, 0);
});

await test('the actual tab must remain associated with the reviewed visible editor URL', async () => {
  const f = fixture(); await f.begin(); f.session.review(f.visual('import_document'));
  f.setTab({id: f.scope.tab_id, url: 'https://synthetic-other-editor.invalid/'});
  await assert.rejects(f.validate(), /actual_owned_tab_required/);
  assert.equal(f.clicks.length, 0);
});

await test('an actual foreign tab ID cannot become an owned tab observation', async () => {
  const f = fixture({overrides: {readTab: async () => ({id: 'foreign-tab', url: 'https://synthetic.invalid/'})}});
  await assert.rejects(f.step('observe'), /actual_owned_tab_required/);
});

for (const [name, windows] of [
  ['missing app', [{id: 1, focused: true, modal: false}]],
  ['missing focused', [{id: 1, app: 'Synthetic', modal: false}]],
  ['missing modal', [{id: 1, app: 'Synthetic', focused: true}]],
  ['duplicate normalized IDs', [{id: 1, app: 'Synthetic', focused: true, modal: false},
    {id: '1', app: 'Synthetic', focused: false, modal: false}]],
]) await test(name + ' is not a raw Sky window observation', async () => {
  const f = fixture({overrides: {readWindows: async () => windows}});
  await assert.rejects(f.step('read_windows'), /actual_sky_windows_required/);
});

await test('two actual foreground windows prevent mouse dispatch', async () => {
  const f = fixture(); await f.begin();
  f.setExtraWindows([{id: 888, app: 'Synthetic Other', focused: true, modal: false}]);
  await assert.rejects(f.confirm('import_document'), /unique_actual_foreground_window_required/);
  assert.equal(f.clicks.length, 0);
});

await test('a new actor cannot treat an existing titleless modal as harmless baseline history', async () => {
  const f = fixture({overrides: {readWindows: async (_input, original) => (await original()).map(
    (window, index) => ({...window, modal: index === 0}))}});
  await assert.rejects(f.begin(), /fresh_native_session_without_existing_modal_required/);
  assert.equal(f.clicks.length, 0); assert.equal(f.typed.length, 0);
  assert.equal(f.session.diagnostic().prepared, null);
});

for (const platform of ['toutiao', 'zhihu']) {
  await test(platform + ': a native-looking model observation cannot skip the remaining prepare actions', async () => {
    const f = fixture({platform}); await f.begin();
    await f.confirm(platform === 'zhihu' ? 'open_document_menu' : 'import_document');
    await f.step('click_prepare'); f.setNativePresent(true); f.setFrame('synthetic-premature-native');
    await f.step('observe');
    assert.throws(() => f.session.acceptPrepareObservation({snapshot_id: f.snapshotId,
      source: 'model_visual_observation', evidence_ref: 'synthetic-premature-native', state: 'native_dialog',
      window_id: '999', files_selected: false, submitted: false, native_dialog_semantics_confirmed: true}),
    /document_dialog_unconfirmed|document_prepare_steps_incomplete|native_prepare_sequence_required/);
    assert.equal(f.session.diagnostic().prepared, null);
  });
}

await test('Zhihu must observe the document menu after the menu action, then the modal', async () => {
  const f = fixture({platform: 'zhihu'}); await f.begin(); await f.confirm('open_document_menu');
  await f.step('click_prepare'); f.setFrame('synthetic-wrong-modal-stage'); await f.step('observe');
  assert.throws(() => f.session.acceptPrepareObservation({snapshot_id: f.snapshotId,
    source: 'model_visual_observation', evidence_ref: 'synthetic-wrong-modal-stage', state: 'document_modal',
    next_semantic: 'import_document'}), /document_dialog_unconfirmed|prepare_sequence_incomplete|native_prepare_sequence_required/);
});

for (const [name, extra, pattern] of [
  ['foreign new window', {window_id: '888'}, /precise_native_window_association_required/],
  ['selected file already exists', {files_selected: true}, /precise_native_window_association_required/],
  ['already submitted window', {submitted: true}, /precise_native_window_association_required/],
  ['unconfirmed native semantics', {native_dialog_semantics_confirmed: false}, /precise_native_window_association_required/],
  ['foreign snapshot epoch', {snapshot_id: 'old-instance:image:1'}, /post_click_visual_observation_required/],
  ['fake official source', {source: 'official_native_dialog_observation'}, /post_click_visual_observation_required/],
]) await test(name + ' cannot bind prepared native identity', async () => {
  const f = fixture(); await f.prepareStep('import_document', 'document_modal', 'choose_document');
  await f.step('observe'); await f.confirm('choose_document'); await f.step('click_prepare');
  f.setNativePresent(true); f.setFrame('synthetic-new-native'); await f.step('observe');
  assert.throws(() => f.session.acceptPrepareObservation({snapshot_id: f.snapshotId,
    source: 'model_visual_observation', evidence_ref: 'synthetic-new-native', state: 'native_dialog',
    window_id: '999', files_selected: false, submitted: false, native_dialog_semantics_confirmed: true,
    ...extra}), pattern);
  assert.equal(f.session.diagnostic().prepared, null);
});

await test('an extra new titleless modal prevents native ownership association', async () => {
  const f = fixture(); await f.prepareStep('import_document', 'document_modal', 'choose_document');
  await f.step('observe'); await f.confirm('choose_document'); await f.step('click_prepare');
  f.setNativePresent(true); f.setExtraWindows([{id: 888, app: 'Synthetic Unknown', focused: false, modal: true}]);
  f.setFrame('synthetic-ambiguous-native'); await f.step('observe');
  assert.throws(() => f.session.acceptPrepareObservation({snapshot_id: f.snapshotId,
    source: 'model_visual_observation', evidence_ref: 'synthetic-native', state: 'native_dialog', window_id: '999',
    files_selected: false, submitted: false, native_dialog_semantics_confirmed: true}), /ambiguous_new_window_scope/);
});

for (const [name, extra] of [
  ['wrong account', {target_account: 'foreign-account'}], ['wrong host', {host_id: 'foreign-host'}],
  ['wrong prepared identity', {prepared_id: 'old-instance:native:999:1'}], ['wrong native window', {window_id: '888'}],
  ['wrong cycle', {cycle: 2}], ['wrong channel', {channel: 'browser_filechooser'}],
  ['wrong Word SHA', {sha256: 'b'.repeat(64)}], ['wrong Word size', {size_bytes: 2049}],
  ['execute import false', {execute_import: false}], ['missing saving', {delivery_status: 'reserved'}],
  ['empty attempt', {attempt_id: ''}], ['expired handoff', {checked_at: '2026-10-10T23:59:00.000Z'}],
  ['fake parent boolean', {parent_authorized: true}], ['secret extra field', {claim_token: 'synthetic-secret'}],
]) await test(name + ' cannot authorize filename or Open', async () => {
  const f = fixture(); const prepared = await f.prepare();
  assert.throws(() => f.session.acceptParentHandoff(f.handoff(prepared, extra)), /parent_public_handoff_mismatch/);
  assert.equal(f.typed.length, 0);
});

await test('a handoff missing an exact field cannot be replaced by execute_import true', async () => {
  const f = fixture(); const prepared = await f.prepare(); const handoff = f.handoff(prepared);
  delete handoff.checked_at;
  assert.throws(() => f.session.acceptParentHandoff(handoff), /parent_public_handoff_mismatch/);
});

await test('a changed original attempt is rejected before any file input', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.acceptParentHandoff(f.handoff(prepared));
  assert.throws(() => f.session.acceptParentHandoff(f.handoff(prepared, {attempt_id: 'synthetic-other-attempt'})), /original_attempt_changed/);
  assert.equal(f.typed.length, 0);
});

await test('missing parent handoff cannot be bypassed with a click command boolean', async () => {
  const f = fixture(); await f.prepare(); await f.step('observe'); f.session.review(f.visual('native_filename'));
  await assert.rejects(f.step('validate', {execute_import: true}), /parent_public_handoff_mismatch|parent_handoff_required/);
  assert.equal(f.typed.length, 0);
});

await test('void filename completion is not evidence that the literal path is visible', async () => {
  const f = fixture(); const prepared = await f.prepare(); await f.focusAndType(prepared);
  assert.throws(() => f.session.review(f.visual('native_filename')), /actual_filename_unconfirmed/);
  assert.equal(f.session.diagnostic().open_issued, false);
  assert.equal(f.typed.length, 1);
});

await test('a pre-input focus screenshot cannot be relabelled as the completed literal filename', async () => {
  const f = fixture(); const prepared = await f.prepare(); await f.focusForTyping(prepared);
  await f.step('type_filename', f.validatedHandoff);
  assert.throws(() => f.session.review(f.visual('native_filename', {observed_filename: f.artifact.absolute_path,
    filename_evidence_ref: 'synthetic-pre-input-image'})), /post_input_filename_capture_required|actual_filename_capture_required|actual_filename_unconfirmed/);
  assert.equal(f.session.diagnostic().open_issued, false);
});

await test('the filename focus click cannot be replayed after a complete focused-field observation', async () => {
  const f = fixture(); const prepared = await f.prepare(); await f.focusForTyping(prepared);
  const before = f.clicks.length;
  f.session.review(f.visual('native_filename', {filename_field_focused: true}));
  await f.validate();
  await assert.rejects(f.step('click_filename', f.validatedHandoff), /explicit_current_dispatch_ready_required|filename_focus_once_required/);
  assert.equal(f.clicks.length, before);
});

await test('void filename click cannot prove the field is actually focused', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.acceptParentHandoff(f.handoff(prepared));
  await f.step('observe'); await f.confirm('native_filename'); await f.step('click_filename', f.validatedHandoff);
  await assert.rejects(f.step('type_filename', f.validatedHandoff), /explicit_current_dispatch_ready_required|filename_input_once_required/);
  f.setFrame('synthetic-focus-not-confirmed'); await f.step('observe');
  assert.throws(() => f.session.review(f.visual('native_filename')), /actual_filename_focus_unconfirmed/);
  assert.equal(f.typed.length, 0);
});

await test('a pre-click screenshot cannot be relabelled as a post-click focused field observation', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.acceptParentHandoff(f.handoff(prepared));
  await f.step('observe'); await f.confirm('native_filename'); await f.step('click_filename', f.validatedHandoff);
  assert.throws(() => f.session.review(f.visual('native_filename', {filename_field_focused: true})),
    /actual_filename_focus_unconfirmed|post_click_filename_focus_capture_required|current_observed_filename_focus_required/);
  assert.equal(f.typed.length, 0);
});

await test('a filename focus observation must bind the original actual native window', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.acceptParentHandoff(f.handoff(prepared));
  await f.step('observe'); await f.confirm('native_filename'); await f.step('click_filename', f.validatedHandoff);
  f.setFrame('synthetic-focused-native-window'); await f.step('observe');
  assert.throws(() => f.session.review(f.visual('native_filename', {observed_window_id: '888', filename_field_focused: true})), /model_native_window_association_required/);
  assert.equal(f.typed.length, 0);
});

await test('a changed frame after field focus returns for a new focus observation before typing', async () => {
  const f = fixture(); const prepared = await f.prepare(); await f.focusForTyping(prepared);
  f.setFrame('synthetic-focus-has-changed-before-type');
  const changed = await f.validate();
  assert.equal(changed.next, 'model_review'); assert.equal(changed.semantic, 'native_filename');
  assert.equal(f.typed.length, 0);
  assert.throws(() => f.session.review(f.visual('native_filename')), /actual_filename_focus_unconfirmed/);
});

await test('every prepared model review must bind the actual native window', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.acceptParentHandoff(f.handoff(prepared));
  await f.step('observe'); const review = f.visual('native_filename'); delete review.observed_window_id;
  assert.throws(() => f.session.review(review), /model_native_window_association_required/);
});

for (const [name, extra] of [
  ['different literal filename', {observed_filename: '/synthetic-host/different.docx', filename_evidence_ref: 'synthetic'}],
  ['missing filename evidence', {observed_filename: '/synthetic-host/original-fixture.docx'}],
]) await test(name + ' prevents Open', async () => {
  const f = fixture(); const prepared = await f.prepare(); await f.focusAndType(prepared);
  assert.throws(() => f.session.review(f.visual('native_filename', extra)), /actual_filename_unconfirmed/);
  assert.equal(f.session.diagnostic().open_issued, false);
});

await test('Open requires a separate explicit visible Open review after filename verification', async () => {
  const f = fixture(); const prepared = await f.prepare(); await f.focusAndType(prepared);
  const verified = f.session.review(f.visual('native_filename', {observed_filename: f.artifact.absolute_path,
    filename_evidence_ref: 'synthetic-literal-path'}));
  assert.equal(verified.next, 'model_review');
  await assert.rejects(f.step('click_open', f.validatedHandoff), /explicit_current_dispatch_ready_required/);
  assert.equal(f.session.diagnostic().open_issued, false);
});

await test('changed native foreground identity after review prevents the filename click', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.acceptParentHandoff(f.handoff(prepared));
  await f.step('observe'); f.session.review(f.visual('native_filename')); f.setNativeWindow(888);
  await assert.rejects(f.validate(), /same_active_native_window_required/);
  assert.equal(f.typed.length, 0);
});

await test('explicit validation refreshes an expired earlier file observation before Open', async () => {
  const f = fixture(); const prepared = await f.readyOpen(); f.advance(15001);
  await f.step('observe'); f.session.review(f.visual('native_open'));
  const before = f.events.filter(value => value.method === 'inspectFile').length;
  await f.validate();
  const opened = await f.step('click_open', f.validatedHandoff);
  assert.equal(opened.open_issued, true);
  assert.equal(f.events.filter(value => value.method === 'inspectFile').length, before + 1);
});

await test('a changed final Open frame returns for fresh filename and Open review before dispatch', async () => {
  const f = fixture(); const prepared = await f.readyOpen(); const before = f.clicks.length;
  f.setFrame('synthetic-final-frame-path-has-changed');
  const changed = await f.validate();
  assert.equal(changed.next, 'model_review');
  assert.equal(changed.semantic, 'native_filename');
  assert.equal(changed.frame_changed, true);
  assert.equal(changed.open_issued, false); assert.equal(f.clicks.length, before);
  assert.throws(() => f.session.review(f.visual('native_filename', {
    observed_filename: '/synthetic-host/different.docx', filename_evidence_ref: 'synthetic-new-path'})), /actual_filename_unconfirmed/);
});

await test('an explicit changed observation also invalidates the old literal filename verification', async () => {
  const f = fixture(); const prepared = await f.readyOpen(); const before = f.clicks.length;
  f.setFrame('synthetic-changed-observation-path-is-different');
  const changed = await f.step('observe');
  assert.equal(changed.next, 'model_review'); assert.equal(changed.semantic, 'native_filename');
  assert.equal(f.clicks.length, before); assert.equal(f.session.diagnostic().open_issued, false);
  assert.throws(() => f.session.review(f.visual('native_filename', {
    observed_filename: '/synthetic-host/different.docx', filename_evidence_ref: 'synthetic-new-literal-path'})), /actual_filename_unconfirmed/);
});

await test('the final Open command rechecks the unchanged frozen Word in its current invocation', async () => {
  let changed = false;
  const f = fixture({overrides: {inspectFile: async (input, original) => ({...(await original(input)),
    ...(changed ? {size_bytes: 2049} : {})})}});
  const prepared = await f.readyOpen(); changed = true; const before = f.clicks.length;
  await assert.rejects(f.validate(), /same_host_word_identity_changed/);
  assert.equal(f.clicks.length, before); assert.equal(f.session.diagnostic().open_issued, false);
});

await test('an old authorization timestamp is rejected at the final Open command', async () => {
  const f = fixture(); const prepared = await f.readyOpen();
  await assert.rejects(f.step('click_open', f.handoff(prepared, {checked_at: '2026-10-10T23:59:00.000Z'})), /exact_validated_parent_handoff_required|parent_public_handoff_mismatch/);
  assert.equal(f.session.diagnostic().open_issued, false);
});

for (const extra of [
  {id: 888, app: 'Synthetic New Titleless Modal', focused: false, modal: true},
  {id: 888, app: 'Synthetic New Foreground', focused: true, modal: false},
]) await test('exact native disappearance cannot hide new titleless or foreground windows ' + extra.id + '-' + extra.modal, async () => {
  const f = fixture(); const prepared = await f.readyOpen(); await f.step('click_open', f.validatedHandoff);
  f.setNativePresent(false); f.setExtraWindows([extra]); await f.step('read_windows');
  assert.equal(f.session.settlement().actions_settled, true);
  assert.equal(f.session.settlement().native_dialog_closed, false);
  assert.equal(f.session.settlement().chooser_closed, false);
});

await test('an unchanged original native window cannot be declared closed', async () => {
  const f = fixture(); const prepared = await f.readyOpen(); await f.step('click_open', f.validatedHandoff);
  await f.step('read_windows'); assert.equal(f.session.settlement().native_dialog_closed, false);
});

await test('a new titleless nonmodal unfocused window also blocks exact native closure', async () => {
  const f = fixture(); const prepared = await f.readyOpen(); await f.step('click_open', f.validatedHandoff);
  f.setNativePresent(false);
  f.setExtraWindows([{id: 888, app: 'Synthetic New Window', focused: false, modal: false,
    geometry: {x: 0, y: 0, width: 600, height: 400}}]);
  await f.step('read_windows');
  assert.equal(f.session.settlement().actions_settled, true);
  assert.equal(f.session.settlement().native_dialog_closed, false);
  assert.equal(f.session.settlement().chooser_closed, false);
});

await test('a later real window read cannot reuse old absence evidence after the native window returns', async () => {
  const f = fixture(); const prepared = await f.readyOpen(); await f.step('click_open', f.validatedHandoff);
  const clicks = f.clicks.length;
  f.setNativePresent(false); await f.step('read_windows');
  assert.equal(f.session.settlement().native_dialog_closed, true);
  f.setNativePresent(true); await f.step('read_windows');
  assert.equal(f.session.settlement().native_dialog_closed, false);
  assert.equal(f.session.settlement().chooser_closed, false);
  assert.equal(Object.hasOwn(f.session.settlement(), 'closure'), false);
  assert.equal(f.clicks.length, clicks);
});

await test('cancelled prepared window needs an independent exact disappearance observation before clean settlement', async () => {
  const f = fixture(); const prepared = await f.prepare(); f.session.cancel();
  assert.equal(f.session.settlement().native_dialog_closed, false);
  f.setNativePresent(false);
  const closed = await f.step('read_windows');
  assert.equal(closed.status, 'native_closed_observed');
  const settled = f.session.settlement();
  assert.equal(settled.window_id, prepared.window_id); assert.equal(settled.actions_settled, true);
  assert.equal(settled.native_dialog_closed, true); assert.equal(settled.chooser_closed, true);
  assert.equal(settled.closure.open_call_id, null);
  assert.equal(f.typed.length, 0); assert.equal(f.session.diagnostic().open_issued, false);
});

await test('unknown Open retains one attempted dispatch and survives cancel plus exact window absence', async () => {
  let rejectOpen = false;
  const f = fixture({overrides: {click: async (input, operation) => {
    await operation(input); if (rejectOpen) throw Error('synthetic lost Open completion');
  }}});
  const prepared = await f.readyOpen(); rejectOpen = true;
  const before = f.clicks.length;
  await assert.rejects(f.step('click_open', f.validatedHandoff), /lost Open completion/);
  assert.equal(f.clicks.length, before + 1); assert.equal(f.session.diagnostic().open_issued, true);
  assert.equal(f.session.diagnostic().unknown_actions, 1);
  await assert.rejects(f.step('click_open', f.validatedHandoff), /native_execution_fenced/);
  f.session.cancel(); f.setNativePresent(false); await f.step('read_windows');
  assert.equal(f.session.settlement().actions_settled, false);
  assert.equal(f.session.settlement().native_dialog_closed, false);
  assert.equal(f.session.diagnostic().unknown_actions, 1);
});

await test('an unconfirmed fulfilled host result permanently fences the actor', async () => {
  const f = fixture({confirmCompletion: () => false});
  await assert.rejects(f.step('observe'), /native_action_completion_unknown/);
  assert.equal(f.session.diagnostic().unknown_actions, 1);
  const before = f.events.length;
  await assert.rejects(f.step('observe'), /native_execution_fenced/);
  assert.equal(f.events.length, before);
});

for (const method of ['inspectFile', 'readTab', 'readWindows', 'captureScreenshot']) {
  await test('cancel during observation waiting for ' + method + ' awaits its ticket and prevents the next command', async () => {
    const wait = deferred(), reached = deferred();
    const f = fixture({overrides: {[method]: async (input, original) => {
      reached.resolve(); await wait.promise; return original(input);
    }}});
    const running = f.step('observe'); const rejection = assert.rejects(running, /native_execution_fenced/);
    await reached.promise;
    const cancelled = f.session.cancel();
    assert.equal(cancelled.cancelled, true); assert.equal(cancelled.pending_actions, 1);
    assert.equal(f.session.settlement().actions_settled, false);
    await assert.rejects(f.step('observe'), /single_native_step_required/);
    wait.resolve(); await rejection;
    assert.equal(f.session.diagnostic().pending_actions, 0);
    assert.equal(f.session.diagnostic().unknown_actions, 0);
    assert.equal(f.session.diagnostic().settled_actions, f.events.length);
    await assert.rejects(f.step('observe'), /native_execution_fenced/);
    assert.equal(f.clicks.length, 0);
  });
}

for (const method of ['inspectFile', 'readTab', 'readWindows', 'captureScreenshot']) {
  await test('cancel while Open validation waits for ' + method + ' prevents Open dispatch', async () => {
    const wait = deferred(), reached = deferred(); let finalWait = false;
    const f = fixture({overrides: {[method]: async (input, original) => {
      if (finalWait) {reached.resolve(); await wait.promise;}
      return original(input);
    }}});
    const prepared = await f.readyOpen(); finalWait = true;
    const before = f.clicks.length, settledBefore = f.session.diagnostic().settled_actions;
    const running = f.validate();
    const rejection = assert.rejects(running, /native_execution_fenced/);
    await reached.promise;
    const cancelled = f.session.cancel(); assert.equal(cancelled.pending_actions, 1);
    assert.equal(cancelled.open_issued, false); assert.equal(f.session.settlement().actions_settled, false);
    wait.resolve(); await rejection;
    assert.equal(f.session.diagnostic().pending_actions, 0);
    assert.equal(f.session.diagnostic().unknown_actions, 0);
    assert.ok(f.session.diagnostic().settled_actions > settledBefore);
    assert.equal(f.session.diagnostic().open_issued, false); assert.equal(f.clicks.length, before);
  });
}

await test('cancel after native Open was dispatched retains its complete call and allows only read-only closure', async () => {
  const wait = deferred(), reached = deferred(); let delayOpen = false;
  const f = fixture({overrides: {click: async (input, original) => {
    await original(input); if (delayOpen) {reached.resolve(); await wait.promise;}
  }}});
  const prepared = await f.readyOpen(); delayOpen = true;
  const running = f.step('click_open', f.validatedHandoff); const rejection = assert.rejects(running, /native_execution_fenced/);
  await reached.promise; const count = f.clicks.length;
  const cancelled = f.session.cancel(); assert.equal(cancelled.open_issued, true);
  assert.equal(cancelled.pending_actions, 1); assert.equal(f.session.settlement().actions_settled, false);
  wait.resolve(); await rejection;
  assert.equal(f.session.diagnostic().pending_actions, 0); assert.equal(f.session.diagnostic().unknown_actions, 0);
  f.setNativePresent(false); await f.step('read_windows');
  assert.equal(f.session.settlement().native_dialog_closed, true);
  await assert.rejects(f.step('click_open', f.validatedHandoff), /native_execution_fenced/);
  assert.equal(f.clicks.length, count);
});

await test('cancel during a dispatched filename input retains its completed ticket and prevents Open', async () => {
  const wait = deferred(), reached = deferred();
  const f = fixture({overrides: {typeFilename: async (input, original) => {
    await original(input); reached.resolve(); await wait.promise;
  }}});
  const prepared = await f.prepare(); await f.focusForTyping(prepared);
  const running = f.step('type_filename', f.validatedHandoff);
  const rejection = assert.rejects(running, /native_execution_fenced/);
  await reached.promise;
  assert.equal(f.session.cancel().pending_actions, 1); assert.equal(f.typed.length, 1);
  wait.resolve(); await rejection;
  assert.equal(f.session.diagnostic().pending_actions, 0); assert.equal(f.session.diagnostic().unknown_actions, 0);
  assert.equal(f.session.diagnostic().open_issued, false);
  await assert.rejects(f.step('type_filename', f.validatedHandoff), /native_execution_fenced/);
  assert.equal(f.typed.length, 1);
});

await test('cancel during an issued prepare click retains the call without inventing a native window identity', async () => {
  const wait = deferred(), reached = deferred();
  const f = fixture({overrides: {click: async (input, original) => {
    await original(input); reached.resolve(); await wait.promise;
  }}});
  await f.begin(); await f.confirm('import_document');
  const running = f.step('click_prepare'); const rejection = assert.rejects(running, /native_execution_fenced/);
  await reached.promise; f.session.cancel(); f.setNativePresent(true); wait.resolve(); await rejection;
  assert.equal(f.clicks.length, 1); assert.equal(f.session.diagnostic().prepared, null);
  assert.equal(f.session.diagnostic().unknown_actions, 0);
  await f.step('read_windows');
  assert.equal(f.session.settlement().native_dialog_closed, false);
  assert.equal(Object.hasOwn(f.session.settlement(), 'window_id'), false);
});

await test('cancel before any click fences model review and public parent handoff', async () => {
  const f = fixture(); await f.begin(); f.session.cancel();
  assert.throws(() => f.session.review(f.visual('import_document')), /native_execution_fenced/);
  assert.throws(() => f.session.acceptParentHandoff({execute_import: true}), /native_execution_fenced/);
  await f.step('read_windows'); assert.equal(f.clicks.length, 0);
  assert.equal(f.session.settlement().native_dialog_closed, false);
});

await test('public commands reject symbols, arbitrary callbacks and unsupported operations', async () => {
  const f = fixture();
  await assert.rejects(f.session.step({operation: 'capture', [Symbol('foreign')]: true}), /public_native_command_required/);
  await assert.rejects(f.session.step({operation: 'capture', callback: () => {}}), /public_native_command_required/);
  await assert.rejects(f.step('set_files'), /native_operation_invalid/);
  assert.equal(f.events.length, 0);
});

await test('ledger registers before real dispatch and exposes honest project call records for void completion', async () => {
  let ledger;
  ledger = createNativeActionLedger({now: () => new Date(START).toISOString(),
    confirmCompletion: (_label, outcome) => outcome.kind === 'fulfilled'});
  const {value, record} = await ledger.run('synthetic-void-click', async () => {
    assert.equal(ledger.diagnostic().pending_actions, 1);
  });
  assert.equal(value, undefined); assert.equal(record.source, 'project_awaited_tool_call');
  assert.equal(record.state, 'settled'); assert.equal(Object.hasOwn(record, 'epoch'), false);
  assert.equal(Object.hasOwn(record, 'official_receipt'), false); assert.equal(Object.isFrozen(record), true);
  assert.deepEqual(ledger.diagnostic(), {history_complete: true, pending_actions: 0, unknown_actions: 0, settled_actions: 1});
});

for (const [name, classifier] of [
  ['false completion', () => false], ['throwing completion', () => {throw Error('synthetic classifier failure');}],
  ['a parent boolean object', () => ({confirmed: true})], ['an unresolved completion promise', () => Promise.resolve(true)],
]) await test('ledger ' + name + ' is unknown and cannot be cleared by a later settled observation', async () => {
  let reject = true;
  const ledger = createNativeActionLedger({now: () => new Date(START).toISOString(),
    confirmCompletion: (label, outcome) => reject ? classifier(label, outcome) : outcome.kind === 'fulfilled'});
  await assert.rejects(ledger.run('synthetic-unknown', async () => undefined), /native_action_completion_unknown/);
  reject = false; await ledger.run('synthetic-read-only-later', async () => []);
  assert.equal(ledger.diagnostic().unknown_actions, 1); assert.equal(ledger.diagnostic().settled_actions, 1);
  assert.equal(Object.hasOwn(ledger, 'restore'), false); assert.equal(Object.hasOwn(ledger, 'finishAction'), false);
});

await test('a thrown host call is retained as unknown even if later ledger reads complete', async () => {
  const ledger = createNativeActionLedger({now: () => new Date(START).toISOString(),
    confirmCompletion: (_label, outcome) => outcome.kind === 'fulfilled'});
  await assert.rejects(ledger.run('synthetic-lost-reply', async () => {throw Error('synthetic lost reply');}), /lost reply/);
  await ledger.run('synthetic-observe', async () => []);
  assert.equal(ledger.diagnostic().unknown_actions, 1); assert.equal(ledger.diagnostic().pending_actions, 0);
});

await test('old ledger project IDs carry no externally reusable epoch or completion API', async () => {
  const options = {now: () => new Date(START).toISOString(), confirmCompletion: () => true};
  const first = createNativeActionLedger(options), second = createNativeActionLedger(options);
  const previous = await first.run('synthetic-old', async () => undefined);
  assert.equal(Object.hasOwn(previous.record, 'epoch'), false);
  assert.equal(Object.hasOwn(second, 'acceptRecord'), false); assert.equal(Object.hasOwn(second, 'restore'), false);
  assert.equal(second.diagnostic().settled_actions, 0);
});
