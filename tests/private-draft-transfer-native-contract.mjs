// OFFLINE ONLY: synthetic short text, one image and in-memory host callbacks.
// The production ESM definitions are imported directly in Node. Git HEAD is
// read only to verify the V155 baseline. No CUA, network or website API is called.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {createPrivateDraftTransfer} from '../scripts/browser-upload/private-draft-transfer.mjs';

const originalModule = execFileSync('git', ['show', 'HEAD:scripts/browser-upload/private-draft-transfer.mjs'], {cwd: new URL('../', import.meta.url), encoding: 'utf8'});
const baseline = Buffer.from(originalModule.replace(/^export (?=(?:async )?(?:function|const))/gm, '') + '\nObject.defineProperty(createPrivateDraftTransfer,\'runtimeVersion\',{value:"2026-10-11-host-transfer-1"});\n');
let fixtureSequence = 0;
const NATIVE = 'native_file_dialog', BROWSER = 'browser_filechooser';
const CLOCK = Date.parse('2026-10-11T00:00:00.000Z');
const BLANK = 'https://mp.toutiao.com/profile_v4/graphic/publish';
const DRAFT = BLANK + '?pgc_id=10000000001';
const clone = value => JSON.parse(JSON.stringify(value));

function makeFixture(options = {}) {
  const factory = createPrivateDraftTransfer;
  const sequence = ++fixtureSequence;
  const channel = options.channel || NATIVE;
  const scope = Object.freeze({article_id: 'synthetic-short-article-' + sequence, platform: 'toutiao',
    target_account: '61556093362', browser_session: 'synthetic-browser-session-' + sequence,
    executor_id: 'synthetic-executor', tab_id: 'synthetic-tab-' + sequence});
  const word = Object.freeze({output_id: 'synthetic-word-output', sha256: 'a'.repeat(64), size: 2048});
  const frozenBody = Object.freeze({title: '完整的离线合成标题', paragraphs: ['第一段合成正文。', '第二段合成正文。'],
    images: [{sha256: 'b'.repeat(64), after_paragraph: 1, natural_width: 600, natural_height: 400}]});
  let clock = CLOCK, title = options.title ?? '', submitted = false;
  const now = () => new Date(clock).toISOString();
  const events = [], nativeCalls = [], browserCalls = [], titleCalls = [];
  const file = {filename: 'synthetic-existing.docx', absolute_path: '/synthetic-host/synthetic-existing.docx',
    browser_session: scope.browser_session, sha256: word.sha256, size: word.size,
    visible_in_browser: true, checked_at: now()};
  if (options.handoff) {
    Object.assign(file, {visible_in_browser: false, visibility_unproven: true,
      handoff: {kind: 'same_browser_download', download_path: '/synthetic-host/original-download.docx',
        download_browser_session: scope.browser_session, executor_id: scope.executor_id,
        source_sha256: word.sha256, source_size: word.size, verified_in_cua: true, copied_in_same_executor: true}});
  }
  const prepared = {prepared_id: 'synthetic-native-prepared-1', window_id: 'synthetic-native-window-1', cycle: 1};
  const nativeDialog = {ready: true, window_id: prepared.window_id, cycle: prepared.cycle,
    async open(path, permission) {
      nativeCalls.push({path, permission, receiver: this});
      events.push({method: 'native.open'});
      submitted = true;
      if (options.open) return options.open(path, permission);
      if (options.submissionError) throw options.submissionError;
      return options.submissionOutcome === undefined ? {...scope, channel: NATIVE,
        ...prepared, submitted: true, observed_at: now(), status: 'submitted'} : options.submissionOutcome;
    }};
  const chooser = {async setFiles(path) {
    browserCalls.push({path, receiver: this});
    events.push({method: 'browser.setFiles'});
    submitted = true;
    return {status: 'submitted'};
  }};
  const body = () => ({paragraphs: clone(frozenBody.paragraphs), images: [{
    reference_sha256: frozenBody.images[0].sha256, after_paragraph: 1,
    inspected: true, inspected_at: now(), loaded: true, natural_width: 600, natural_height: 400,
    display_width: 300, display_height: 200, observed_url: 'https://synthetic-image.invalid/one.png',
  }], captions: [], unclassified: []});
  const page = (purpose, independent = false) => {
    const empty = ['preflight', 'prepared', 'consume', 'submit'].includes(purpose);
    return {...scope, ...(independent ? {tab_id: scope.tab_id + '-readback'} : {}),
      source: 'documented_host_observation', checked_at: now(), editor_url: empty ? BLANK : DRAFT,
      account_url: 'https://www.toutiao.com/c/user/' + scope.target_account + '/',
      account_menu_observed: true, login_blocked: false, private_draft: true,
      pending: false, save_failed: false, title: empty ? '' : title,
      body: empty ? {paragraphs: [], images: [], captions: [], unclassified: []} : body(),
      file: clone(file), existing_drafts: {account: scope.target_account, current_editor_url: BLANK,
        editor_checked: true, editor_empty: true, private_draft: true, draft_list_checked: true,
        prior_submission: 'never_attempted', checked_at: now(), matching_editor_urls: [],
        evidence_reference: 'synthetic-history-observation'},
      ...(channel === BROWSER ? {chooser_owned: true} : {import_channel: NATIVE, native_dialog_owned: true, ...prepared}),
      title_control: {editor_url: DRAFT, checked_at: now(), unique: true, visible: true,
        enabled: true, tag: 'INPUT', type: 'text', label: '标题'},
      saved_indicator_observed: true, saved_at: now(),
      ...(independent ? {reopened_at: now()} : {}),
    };
  };
  const host = {
    cancelLocal(request) {
      events.push({method: 'cancelLocal', request});
      return options.cancelLocal ? options.cancelLocal(request) : {cancelled: true,
        open_issued: submitted, pending_actions: submitted ? 1 : 0};
    },
    async inspect(request) {
      events.push({method: 'inspect', request});
      if (request.purpose === 'settlement') return {...scope, source: 'documented_host_observation',
        checked_at: now(), channel, ...prepared,
        native_dialog_closed: options.settlement?.chooser_closed === true,
        actions_settled: false, chooser_closed: false, ...options.settlement};
      const value = page(request.purpose);
      return options.inspect ? options.inspect(value, request, {file, prepared, now}) : value;
    },
    async preparePicker(request) {
      events.push({method: 'preparePicker', request});
      const value = {...scope, editor_url: BLANK, channel, ready: true,
        files_selected: false, submitted: false, checked_at: now(),
        ...(channel === BROWSER ? {chooser} : {...prepared, nativeDialog})};
      return options.picker ? options.picker(value) : value;
    },
    async writeTitle(request) {
      events.push({method: 'writeTitle', request});
      titleCalls.push(request);
      title = request.title;
    },
    async reopenAndInspect(request) {
      events.push({method: 'reopenAndInspect', request});
      const value = page('independent_readback', true);
      return options.reopen ? options.reopen(value, request) : value;
    },
  };
  const api = factory({scope, word, baseline: frozenBody, host, importChannel: channel, now});
  const attempt = (state, extras = {}) => ({article_id: scope.article_id, platform: scope.platform,
    target_account: scope.target_account, word_sha256: word.sha256, word_size: word.size,
    authorization_kind: 'new_word', attempt_id: 'synthetic-attempt-1', state,
    consumed_at: state === 'reserved' ? null : now(), editor_urls: [],
    // Raw receipt secrets belong only to the original parent closure. Tests
    // deliberately supply them and prove that they never reach native.open.
    reservation_token: 'synthetic-private-parent-token', ...extras});
  const reserved = () => ({reserved: true, execute_import: false, attempt: attempt('reserved'),
    claim_token: 'synthetic-private-claim-token'});
  const consumed = () => ({execute_import: true, attempt: attempt('outcome_unknown'),
    consume_token: 'synthetic-private-consume-token'});
  async function reserve() {
    const result = await api.prepare();
    assert.equal(result.operation, 'reserve_article_upload');
    return result;
  }
  async function consume() {
    await reserve();
    const result = await api.acceptReserved(reserved());
    assert.equal(result.operation, 'consume_article_upload');
    return result;
  }
  async function saving() {
    await consume();
    const result = await api.acceptConsumed(consumed());
    assert.equal(result.operation, 'record_article_status');
    assert.equal(result.args.state, 'toutiao_saving');
    return result;
  }
  async function ready() {
    await saving();
    assert.equal((await api.acceptSaving({state: 'toutiao_saving'})).status, 'ready_to_submit');
  }
  async function observed() {
    await ready();
    assert.equal((await api.submit()).status, 'submitted');
    const request = await api.observe();
    assert.equal(request.args.editor_url, DRAFT);
    assert.equal((await api.acceptObserved({recorded: true, attempt: attempt('draft_observed',
      {editor_urls: [DRAFT]})})).phase, 'inspect');
  }
  return {factory, api, scope, word, frozenBody, file, host, chooser, nativeDialog, prepared,
    now, events, nativeCalls, browserCalls, titleCalls, reserved, consumed, attempt,
    reserve, consume, saving, ready, observed,
    get submitted() {return submitted;}, advance: milliseconds => {clock += milliseconds;}};
}

test('V155 generic baseline is the exact allowed 185-line source', () => {
  assert.equal(baseline.length, 20954);
  assert.equal(createHash('sha256').update(baseline).digest('hex'),
    'ee63ca55f457f283156131d2a783f284b66716a74ab770537acfdd6cd2f4bdc2');
  assert.equal(baseline.toString().split('\n').length - 1, 185);
});

test('production core exports ordinary definitions without creating a host session', () => {
  assert.equal(typeof createPrivateDraftTransfer, 'function');
  assert.equal(makeFixture().api.status().phase, 'new');
});

for (const value of [undefined, null, '', 'native', 'browser', 'unknown']) {
  test('factory requires an explicit known import channel: ' + String(value), () => {
    const f = makeFixture();
    assert.throws(() => f.factory({scope: f.scope, word: f.word, baseline: f.frozenBody,
      host: f.host, importChannel: value, now: f.now}), /import_channel_required/);
  });
}

test('production contract supports verified Zhihu mapping and rejects a mismatched account', () => {
  const f = makeFixture();
  assert.throws(() => f.factory({scope: {...f.scope, platform: 'zhihu', target_account: 'foreign-account'},
    word: f.word, baseline: f.frozenBody, host: f.host, importChannel: NATIVE, now: f.now}), /scope_invalid/);
  const zhihu = f.factory({scope: {...f.scope, platform: 'zhihu', target_account: 'ren-zhe-ai-chi-yu-52'}, word: f.word, baseline: f.frozenBody, host: f.host, importChannel: NATIVE, now: f.now});
  assert.equal(zhihu.status().phase, 'new');
});

test('native submit uses one fixed-path open and only whitelisted public facts', async () => {
  const f = makeFixture();
  await f.ready();
  assert.equal(f.nativeCalls.length, 0);
  assert.equal(f.browserCalls.length, 0);
  const value = await f.api.submit();
  assert.equal(value.status, 'submitted');
  assert.equal(value.import_channel, NATIVE);
  assert.equal(f.nativeCalls.length, 1);
  assert.equal(f.browserCalls.length, 0);
  const call = f.nativeCalls[0];
  assert.equal(call.path, f.file.absolute_path);
  assert.equal(call.receiver, f.nativeDialog);
  assert.deepEqual(clone(call.permission), {...f.scope, import_channel: NATIVE,
    ...f.prepared, attempt_id: 'synthetic-attempt-1', sha256: f.word.sha256, size: f.word.size,
    execute_import: true, delivery_status: 'saving'});
  assert.equal(Object.isFrozen(call.permission), true);
  assert.equal(JSON.stringify(call.permission).includes('private-parent-token'), false);
  assert.equal(Reflect.ownKeys(call.permission).some(key => /token|credential|password|nonce/.test(key)), false);
  assert.equal((await f.api.submit()).error_code, 'phase_invalid');
  assert.equal(f.nativeCalls.length, 1);
});

test('browser channel retains original real-object setFiles path and never invokes native open', async () => {
  const f = makeFixture({channel: BROWSER});
  await f.ready();
  assert.equal((await f.api.submit()).status, 'submitted');
  assert.deepEqual(f.browserCalls.map(call => call.path), [f.file.absolute_path]);
  assert.equal(f.browserCalls[0].receiver, f.chooser);
  assert.equal(f.nativeCalls.length, 0);
  for (const event of f.events.filter(event => ['prepared', 'consume', 'submit'].includes(event.request?.purpose))) {
    assert.equal(event.request.chooser, f.chooser);
    assert.equal(Object.hasOwn(event.request, 'native_dialog'), false);
  }
});

test('native observations bind explicit same prepared/window/cycle without any chooser alias', async () => {
  const f = makeFixture();
  await f.ready();
  await f.api.submit();
  assert.equal(f.events.find(event => event.method === 'preparePicker').request.import_channel, NATIVE);
  for (const event of f.events.filter(event => ['prepared', 'consume', 'submit'].includes(event.request?.purpose))) {
    assert.equal(event.request.import_channel, NATIVE);
    assert.equal(event.request.native_dialog, f.nativeDialog);
    assert.equal(Object.hasOwn(event.request, 'chooser'), false);
    for (const key of ['prepared_id', 'window_id', 'cycle']) assert.equal(event.request[key], f.prepared[key]);
  }
});

const badNativePickers = {
  'missing channel': value => {delete value.channel; return value;},
  'wrong channel': value => ({...value, channel: BROWSER}),
  'browser chooser even undefined': value => ({...value, chooser: undefined}),
  'inherited browser chooser': value => Object.assign(Object.create({chooser: {setFiles() {}}}), value),
  'missing native capability': value => ({...value, nativeDialog: null}),
  'missing open capability': value => ({...value, nativeDialog: {...value.nativeDialog, open: undefined}}),
  'missing prepared identity': value => ({...value, prepared_id: ''}),
  'missing window identity': value => ({...value, window_id: ''}),
  'invalid cycle': value => ({...value, cycle: 0}),
  'dialog not ready': value => ({...value, nativeDialog: {...value.nativeDialog, ready: false}}),
  'different native window': value => ({...value, nativeDialog: {...value.nativeDialog, window_id: 'another-window'}}),
  'different native cycle': value => ({...value, nativeDialog: {...value.nativeDialog, cycle: 2}}),
  'selected files': value => ({...value, files_selected: true}),
  'already submitted': value => ({...value, submitted: true}),
  'scope change': value => ({...value, executor_id: 'other-executor'}),
};
for (const [label, picker] of Object.entries(badNativePickers)) {
  test('native prepare blocks ' + label, async () => {
    const f = makeFixture({picker});
    assert.equal((await f.api.prepare()).error_code, 'picker_invalid');
    assert.equal(f.nativeCalls.length, 0);
    assert.equal(f.browserCalls.length, 0);
    assert.equal((await f.api.prepare()).error_code, 'execution_fenced');
  });
}

for (const [label, picker] of Object.entries({
  'native capability even undefined': value => ({...value, nativeDialog: undefined}),
  'inherited native capability': value => Object.assign(Object.create({nativeDialog: {open() {}}}), value),
  'wrong channel': value => ({...value, channel: NATIVE}),
  'missing real setFiles': value => ({...value, chooser: {}}),
})) {
  test('browser prepare blocks ' + label, async () => {
    const f = makeFixture({channel: BROWSER, picker});
    assert.equal((await f.api.prepare()).error_code, 'picker_invalid');
    assert.equal(f.browserCalls.length, 0);
  });
}

for (const purpose of ['prepared', 'consume', 'submit']) {
  for (const field of ['import_channel', 'native_dialog_owned', 'prepared_id', 'window_id', 'cycle']) {
    test('native ownership at ' + purpose + ' rejects changed ' + field, async () => {
      const f = makeFixture({inspect(value, request) {
        if (request.purpose === purpose) value[field] = field === 'cycle' ? 2 : field === 'native_dialog_owned' ? false : 'changed';
        return value;
      }});
      let result;
      if (purpose === 'prepared') result = await f.api.prepare();
      else if (purpose === 'consume') {await f.reserve(); result = await f.api.acceptReserved(f.reserved());}
      else {await f.ready(); result = await f.api.submit();}
      assert.equal(result.error_code, 'picker_invalid');
      assert.equal(f.nativeCalls.length, 0);
      assert.equal(f.browserCalls.length, 0);
    });
  }
}

for (const change of ['method', 'window', 'cycle', 'ready']) {
  test('native capability mutation before submission blocks ' + change, async () => {
    const f = makeFixture();
    await f.ready();
    if (change === 'method') f.nativeDialog.open = async () => {throw Error('must not run');};
    if (change === 'window') f.nativeDialog.window_id = 'changed-window';
    if (change === 'cycle') f.nativeDialog.cycle = 2;
    if (change === 'ready') f.nativeDialog.ready = false;
    assert.equal((await f.api.submit()).error_code, 'picker_invalid');
    assert.equal(f.nativeCalls.length, 0);
  });
}

for (const stage of ['new', 'reserve', 'consume', 'saving']) {
  test('submission before authentic consume plus saving is blocked at ' + stage, async () => {
    const f = makeFixture();
    if (stage === 'reserve') await f.reserve();
    if (stage === 'consume') await f.consume();
    if (stage === 'saving') await f.saving();
    assert.equal((await f.api.submit()).error_code, 'phase_invalid');
    assert.equal(f.nativeCalls.length, 0);
  });
}

test('consume execute_import=false cannot authorize native open', async () => {
  const f = makeFixture();
  await f.consume();
  assert.equal((await f.api.acceptConsumed({...f.consumed(), execute_import: false})).error_code, 'consume_not_fresh');
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
  assert.equal(f.nativeCalls.length, 0);
});

test('saving status retains the actual original Toutiao contract', async () => {
  const f = makeFixture();
  await f.saving();
  assert.equal((await f.api.acceptSaving({state: 'zhihu_saving'})).error_code, 'saving_unconfirmed');
  assert.equal(f.nativeCalls.length, 0);
});

test('expired consumed grant is fenced before native submission', async () => {
  const f = makeFixture();
  await f.ready();
  f.advance(61000);
  assert.equal((await f.api.submit()).error_code, 'grant_expired');
  assert.equal(f.nativeCalls.length, 0);
});

for (const field of ['sha256', 'size', 'absolute_path']) {
  test('original same-host Word ' + field + ' change blocks native submission', async () => {
    const f = makeFixture();
    await f.ready();
    if (field === 'sha256') f.file.sha256 = 'c'.repeat(64);
    if (field === 'size') f.file.size++;
    if (field === 'absolute_path') {f.file.absolute_path = '/changed-host/synthetic-existing.docx';}
    assert.ok(['file_invalid', 'file_changed'].includes((await f.api.submit()).error_code));
    assert.equal(f.nativeCalls.length, 0);
  });
}

test('native prepare preserves the original verified same-host handoff metadata', async () => {
  const f = makeFixture({handoff: true});
  const result = await f.reserve();
  assert.equal(result.args.preflight.file.handoff.chooser_prepared, true);
  assert.equal(result.args.preflight.file.handoff.chooser_prepared_at, f.now());
  assert.equal(result.args.word_sha256, f.word.sha256);
  assert.equal(result.args.word_size, f.word.size);
});

for (const condition of ['old-history', 'old-account', 'nonempty-editor']) {
  test('native prepare retains preflight refusal for ' + condition, async () => {
    const f = makeFixture({inspect(value, request) {
      if (request.purpose === 'preflight') {
        if (condition === 'old-history') value.existing_drafts.prior_submission = 'unknown';
        if (condition === 'old-account') value.account_url = 'https://www.toutiao.com/c/user/999/';
        if (condition === 'nonempty-editor') value.body.paragraphs = ['已有正文'];
      }
      return value;
    }});
    assert.ok(['history_unknown', 'account_invalid', 'editor_not_empty'].includes((await f.api.prepare()).error_code));
    assert.equal(f.events.filter(event => event.method === 'preparePicker').length, 0);
    assert.equal(f.nativeCalls.length, 0);
  });
}

for (const status of ['unknown', 'timeout', 'cancelled', 'failed']) {
  test('native ' + status + ' result fences replay and does not change channel', async () => {
    const f = makeFixture({submissionOutcome: {status}});
    await f.ready();
    const result = await f.api.submit();
    assert.equal(result.phase, 'unknown');
    assert.equal(result.submitted, true);
    assert.equal(result.import_channel, NATIVE);
    assert.equal((await f.api.submit()).error_code, 'execution_fenced');
    assert.equal(f.nativeCalls.length, 1);
    assert.equal(f.browserCalls.length, 0);
  });
}

test('lost native reply remains unknown and cannot be retried', async () => {
  const f = makeFixture({submissionError: Error('synthetic lost reply')});
  await f.ready();
  const result = await f.api.submit();
  assert.equal(result.phase, 'unknown');
  assert.equal(result.error_code, 'host_operation_unknown');
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
  assert.equal(f.nativeCalls.length, 1);
});

for (const mismatch of ['undefined', 'empty', 'scope', 'channel', 'prepared_id', 'window_id', 'cycle', 'submitted', 'time']) {
  test('native open requires a real matching submission receipt: ' + mismatch, async () => {
    let f;
    f = makeFixture({open() {
      if (mismatch === 'undefined') return undefined;
      if (mismatch === 'empty') return {};
      const value = {...f.scope, channel: NATIVE, ...f.prepared, submitted: true, observed_at: f.now()};
      if (mismatch === 'scope') value.executor_id = 'foreign-executor';
      if (mismatch === 'channel') value.channel = BROWSER;
      if (mismatch === 'prepared_id') value.prepared_id = 'foreign-preparation';
      if (mismatch === 'window_id') value.window_id = 'foreign-window';
      if (mismatch === 'cycle') value.cycle++;
      if (mismatch === 'submitted') value.submitted = false;
      if (mismatch === 'time') value.observed_at = new Date(CLOCK - 1000).toISOString();
      return value;
    }});
    await f.ready();
    const result = await f.api.submit();
    assert.equal(result.error_code, 'submission_unknown');
    assert.equal(result.phase, 'unknown');
    assert.equal(result.submitted, true);
    assert.equal((await f.api.submit()).error_code, 'execution_fenced');
    assert.equal(f.nativeCalls.length, 1);
  });
}

test('single execution chain blocks a concurrent native submission', async () => {
  let resolveOpen, enteredOpen;
  const openStarted = new Promise(resolve => {enteredOpen = resolve;});
  const openReply = new Promise(resolve => {resolveOpen = resolve;});
  const f = makeFixture({open() {enteredOpen(); return openReply;}});
  await f.ready();
  const pending = f.api.submit();
  await openStarted;
  assert.equal((await f.api.submit()).error_code, 'concurrent_operation');
  resolveOpen({...f.scope, channel: NATIVE, ...f.prepared, submitted: true, observed_at: f.now(), status: 'submitted'});
  assert.equal((await pending).status, 'submitted');
  assert.equal(f.nativeCalls.length, 1);
});

test('native cancellation keeps opaque window facts and requires actual settlement before owner release', async () => {
  const f = makeFixture();
  await f.reserve();
  assert.equal(f.api.cancel().status, 'cancelled');
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  const settlement = f.events.findLast(event => event.request?.purpose === 'settlement').request;
  assert.equal(settlement.native_dialog, f.nativeDialog);
  assert.equal(Object.hasOwn(settlement, 'chooser'), false);
  assert.equal(Object.hasOwn(settlement, 'editor_url'), false);
  assert.equal(settlement.import_channel, NATIVE);
  for (const key of ['prepared_id', 'window_id', 'cycle']) assert.equal(settlement[key], f.prepared[key]);
  const other = f.factory({scope: f.scope, word: f.word, baseline: f.frozenBody,
    host: f.host, importChannel: NATIVE, now: f.now});
  assert.equal((await other.prepare()).error_code, 'picker_owned_elsewhere');
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
  assert.equal(f.nativeCalls.length, 0);
});

test('matching official settlement releases owner but never restores the cancelled instance', async () => {
  const f = makeFixture({settlement: {actions_settled: true, chooser_closed: true}});
  await f.reserve();
  f.api.cancel();
  assert.equal((await f.api.settleClosed()).status, 'settled');
  assert.equal((await f.api.prepare()).error_code, 'execution_fenced');
  const other = f.factory({scope: f.scope, word: f.word, baseline: f.frozenBody,
    host: f.host, importChannel: NATIVE, now: f.now});
  assert.equal((await other.prepare()).operation, 'reserve_article_upload');
  assert.equal(f.nativeCalls.length, 0);
});

for (const mismatch of ['channel', 'prepared_id', 'window_id', 'cycle', 'native_dialog_closed', 'actions_settled']) {
  test('native settlement cannot release the owner with mismatched ' + mismatch, async () => {
    const settlement = {actions_settled: true, chooser_closed: true};
    if (mismatch === 'channel') settlement.channel = BROWSER;
    if (mismatch === 'prepared_id') settlement.prepared_id = 'foreign-preparation';
    if (mismatch === 'window_id') settlement.window_id = 'foreign-window';
    if (mismatch === 'cycle') settlement.cycle = 2;
    if (mismatch === 'native_dialog_closed') settlement.native_dialog_closed = false;
    if (mismatch === 'actions_settled') settlement.actions_settled = false;
    const f = makeFixture({settlement});
    await f.reserve();
    f.api.cancel();
    assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
    const other = f.factory({scope: f.scope, word: f.word, baseline: f.frozenBody,
      host: f.host, importChannel: NATIVE, now: f.now});
    assert.equal((await other.prepare()).error_code, 'picker_owned_elsewhere');
    assert.equal(f.nativeCalls.length, 0);
  });
}

test('unknown native preparation is never converted into a settled known window', async () => {
  const f = makeFixture({picker() {throw Error('synthetic unconfirmed native creation');},
    settlement: {actions_settled: true, chooser_closed: true}});
  assert.equal((await f.api.prepare()).error_code, 'host_operation_unknown');
  f.api.cancel();
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  assert.equal(f.nativeCalls.length, 0);
});

for (const channel of [NATIVE, BROWSER]) {
  test(channel + ': preserved full title/save/independent body-image readback/verified/completed workflow', async () => {
    const f = makeFixture({channel});
    await f.observed();
    assert.equal((await f.api.fillTitle()).status, 'title_exact');
    assert.equal(f.titleCalls.length, 1);
    assert.equal(f.titleCalls[0].title, f.frozenBody.title);
    const verified = await f.api.verify();
    assert.equal(verified.operation, 'record_article_upload');
    assert.equal(verified.args.state, 'verified');
    assert.equal(verified.args.editor_url, DRAFT);
    assert.equal(verified.args.readback.independently_reopened, true);
    assert.equal(verified.args.readback.images_loaded, true);
    assert.deepEqual(clone(verified.args.readback.paragraphs), f.frozenBody.paragraphs);
    assert.equal(verified.args.readback.images[0].reference_sha256, f.frozenBody.images[0].sha256);
    const completed = await f.api.acceptVerified({recorded: true,
      attempt: f.attempt('verified', {editor_urls: [DRAFT]})});
    assert.equal(completed.args.state, 'completed');
    assert.equal((await f.api.acceptCompleted({state: 'completed', draft_url: DRAFT})).status, 'done');
    assert.equal(f.events.filter(event => event.method === 'reopenAndInspect').length, 1);
    assert.equal(channel === NATIVE ? f.nativeCalls.length : f.browserCalls.length, 1);
  });
}

test('an existing nonempty title is never overwritten', async () => {
  const f = makeFixture({title: '已经存在的标题'});
  await f.observed();
  assert.equal((await f.api.fillTitle()).error_code, 'title_mismatch');
  assert.equal(f.titleCalls.length, 0);
});

test('exact original title requires no second write', async () => {
  const f = makeFixture({title: '完整的离线合成标题'});
  await f.observed();
  assert.equal((await f.api.fillTitle()).status, 'title_already_exact');
  assert.equal(f.titleCalls.length, 0);
});

for (const mismatch of ['full-text', 'image-identity', 'image-anchor', 'image-ratio', 'image-loading', 'independent-tab']) {
  test('preserved independent readback rejects ' + mismatch, async () => {
    const f = makeFixture({reopen(value) {
      if (mismatch === 'full-text') value.body.paragraphs[1] = '错误正文';
      if (mismatch === 'image-identity') value.body.images[0].reference_sha256 = 'c'.repeat(64);
      if (mismatch === 'image-anchor') value.body.images[0].after_paragraph = 2;
      if (mismatch === 'image-ratio') value.body.images[0].natural_width = 900;
      if (mismatch === 'image-loading') value.body.images[0].loaded = false;
      if (mismatch === 'independent-tab') value.tab_id = value.tab_id.replace(/-readback$/, '');
      return value;
    }});
    await f.observed();
    await f.api.fillTitle();
    const result = await f.api.verify();
    if (mismatch === 'image-loading') {
      assert.equal(result.status, 'waiting');
      assert.equal(result.phase, 'inspect');
    } else {
      assert.ok(['readback_mismatch', 'image_mismatch', 'page_scope_invalid'].includes(result.error_code));
    }
    assert.notEqual(result.operation, 'record_article_upload');
  });
}

test('native factory requires the synchronous local cancellation capability', () => {
  const f = makeFixture();
  assert.throws(() => f.factory({scope: f.scope, word: f.word, baseline: f.frozenBody,
    host: {...f.host, cancelLocal: undefined}, importChannel: NATIVE, now: f.now}), /host_unavailable/);
  assert.equal(f.factory({scope: f.scope, word: f.word, baseline: f.frozenBody,
    host: {...f.host, cancelLocal: undefined}, importChannel: BROWSER, now: f.now}).status().phase, 'new');
});

for (const mode of ['throws', 'thenable', 'false', 'missing-confirmation']) {
  test('failed synchronous cancellation propagation fences core without claiming native withdrawal: ' + mode, async () => {
    const f = makeFixture({cancelLocal() {
      if (mode === 'throws') throw Error('synthetic private cancel failure');
      if (mode === 'thenable') return Promise.resolve({cancelled: true});
      return mode === 'false' ? {cancelled: false} : {};
    }});
    await f.ready();
    const result = f.api.cancel();
    assert.equal(result.status, 'cancelled');
    assert.equal(result.cancellation_propagated, false);
    assert.equal(result.error_code, 'native_cancel_unconfirmed');
    assert.equal(JSON.stringify(result).includes('private cancel failure'), false);
    assert.equal((await f.api.submit()).error_code, 'execution_fenced');
    assert.equal(f.nativeCalls.length, 0);
    f.api.cancel();
    assert.equal(f.events.filter(event => event.method === 'cancelLocal').length, 1);
  });
}

test('busy cancellation propagates synchronously during final inspection and prevents native Open', async () => {
  let entered, release;
  const started = new Promise(resolve => {entered = resolve;});
  const gate = new Promise(resolve => {release = resolve;});
  const f = makeFixture({async inspect(value, request) {
    if (request.purpose === 'submit') {entered(); await gate;}
    return value;
  }});
  await f.ready();
  const pending = f.api.submit();
  await started;
  const result = f.api.cancel();
  assert.equal(result.status, 'cancelled');
  assert.equal(result.cancellation_propagated, true);
  assert.equal(result.submitted, false);
  const cancellation = f.events.find(event => event.method === 'cancelLocal').request;
  assert.deepEqual(cancellation, {...f.scope, import_channel: NATIVE, ...f.prepared});
  assert.equal(Reflect.ownKeys(cancellation).some(key => /token|credential|password|nonce/.test(key)), false);
  assert.equal(f.nativeCalls.length, 0);
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  release();
  assert.equal((await pending).error_code, 'execution_fenced');
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
  assert.equal(f.nativeCalls.length, 0);
  assert.equal(f.browserCalls.length, 0);
});

test('busy cancellation during an issued Open retains single-call unknown facts and never reports withdrawal', async () => {
  let entered, release;
  const started = new Promise(resolve => {entered = resolve;});
  const reply = new Promise(resolve => {release = resolve;});
  const f = makeFixture({open() {entered(); return reply;}});
  await f.ready();
  const pending = f.api.submit();
  await started;
  const result = f.api.cancel();
  assert.equal(result.status, 'cancelled');
  assert.equal(result.cancellation_propagated, true);
  assert.equal(result.submitted, true);
  assert.equal(result.phase, 'submitting');
  assert.equal(Object.hasOwn(result, 'withdrawn'), false);
  assert.equal(Object.hasOwn(result, 'settled'), false);
  assert.equal(f.events.filter(event => event.method === 'cancelLocal').length, 1);
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  release({...f.scope, channel: NATIVE, ...f.prepared, submitted: true, observed_at: f.now()});
  const completed = await pending;
  assert.equal(completed.error_code, 'execution_fenced');
  assert.equal(completed.phase, 'unknown');
  assert.equal(completed.submitted, true);
  assert.equal((await f.api.submit()).error_code, 'execution_fenced');
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  assert.equal(f.nativeCalls.length, 1);
  assert.equal(f.browserCalls.length, 0);
});

test('cancellation before picker return retains unknown preparation and cannot fabricate settlement', async () => {
  let entered, release;
  const started = new Promise(resolve => {entered = resolve;});
  const gate = new Promise(resolve => {release = resolve;});
  const f = makeFixture({async picker(value) {entered(); await gate; return value;},
    settlement: {actions_settled: true, chooser_closed: true}});
  const pending = f.api.prepare();
  await started;
  assert.equal(f.api.cancel().cancellation_propagated, true);
  const context = f.events.find(event => event.method === 'cancelLocal').request;
  assert.deepEqual(context, {...f.scope, import_channel: NATIVE});
  release();
  assert.equal((await pending).error_code, 'execution_fenced');
  assert.equal((await f.api.settleClosed()).error_code, 'settlement_unconfirmed');
  assert.equal(f.nativeCalls.length, 0);
});

for (const mutation of [
  image => delete image.natural_width,
  image => delete image.natural_height,
  image => {image.natural_width = 0;},
  image => {image.natural_height = -1;},
  image => {image.natural_width = 600.5;},
  image => {image.natural_height = Number.MAX_SAFE_INTEGER + 1;},
]) {
  test('missing or invalid frozen original image dimensions stop before any host action', () => {
    const f = makeFixture(), original = clone(f.frozenBody);
    mutation(original.images[0]);
    assert.throws(() => f.factory({scope: f.scope, word: f.word, baseline: original,
      host: f.host, importChannel: NATIVE, now: f.now}), /baseline_invalid/);
    assert.equal(f.events.length, 0);
  });
}

const invalidGeometry = {
  'natural ratio wrong although display ratio correct': image => {image.natural_width = 900;},
  'display stretched although natural ratio correct': image => {image.display_width = 450;},
  'forged reference equals distorted display dimensions': image => {
    image.natural_width = 900; image.display_width = 450;
    image.reference_width = 450; image.reference_height = 200;
  },
  'legacy ambiguous reference fields even with correct ratio': image => {
    image.width = 300; image.height = 200; image.reference_width = 300; image.reference_height = 200;
  },
  'missing natural dimensions': image => {delete image.natural_width;},
  'missing display dimensions': image => {delete image.display_width;},
  'fractional natural dimensions': image => {image.natural_width = 600.5;},
  'nonfinite display dimensions': image => {image.display_height = Infinity;},
  'zero display dimensions': image => {image.display_width = 0;},
  'natural ratio just outside 2 percent': image => {image.natural_width = 612; image.natural_height = 399;},
  'display ratio just outside 2 percent': image => {image.display_width = 306.01;},
};
for (const [label, corrupt] of Object.entries(invalidGeometry)) {
  test('actual independent acceptance rejects ' + label, async () => {
    const f = makeFixture({reopen(value) {corrupt(value.body.images[0]); return value;}});
    await f.observed();
    assert.equal((await f.api.fillTitle()).status, 'title_exact');
    const result = await f.api.verify();
    assert.equal(result.error_code, 'image_mismatch');
    assert.notEqual(result.operation, 'record_article_upload');
    assert.equal(f.nativeCalls.length, 1);
    assert.equal(f.titleCalls.length, 1);
  });
}

test('distorted display is blocked before an empty title is written', async () => {
  const f = makeFixture({inspect(value, request) {
    if (request.purpose === 'title') value.body.images[0].display_width = 450;
    return value;
  }});
  await f.observed();
  assert.equal((await f.api.fillTitle()).error_code, 'image_mismatch');
  assert.equal(f.titleCalls.length, 0);
});

for (const [naturalWidth, displayWidth] of [[600, 300], [606, 303], [612, 306], [588, 294]]) {
  test('natural and display geometry accept same original ratio including inclusive 2 percent: ' + naturalWidth, async () => {
    const f = makeFixture({reopen(value) {
      value.body.images[0].natural_width = naturalWidth;
      value.body.images[0].display_width = displayWidth;
      return value;
    }});
    await f.observed(); await f.api.fillTitle();
    assert.equal((await f.api.verify()).args.state, 'verified');
  });
}

test('caller mutation cannot replace the internally frozen original image ratio', async () => {
  const f = makeFixture({reopen(value) {
    value.body.images[0].natural_width = 900;
    value.body.images[0].display_width = 450;
    return value;
  }});
  // The caller's shallow-frozen baseline still has mutable nested objects;
  // the core must copy those dimensions rather than retaining that reference.
  f.frozenBody.images[0].natural_width = 900;
  await f.observed();
  assert.equal((await f.api.fillTitle()).status, 'title_exact');
  assert.equal((await f.api.verify()).error_code, 'image_mismatch');
});
