/** Executed in the official Cua REPL, never in the website's server process.
 * Only documented Browser/Tab/Playwright methods are used. DOM evaluate is read-only.
 * The external authenticated MCP bridge exchanges non-secret requests and responses;
 * lease credentials belong only to that bridge and never to checkpoints/audits.
 */
/** Self-contained callback for the official read-only DOM evaluation scope.
 * Draft.js text is extracted from actual textContent, never visual innerText.
 * Frozen paragraphs disambiguate real LF boundaries; no text is rewritten.
 */
export function inspectObservedDraftJs(el, profile) {
  const rows = [], captions = [];
  let expectedIndex = 0, firstText = true, placeholderCount = 0;
  const classes = node => String(node.className || '').split(/\s+/);
  const attr = (node, name) => node.getAttribute(name);
  const unknown = (text, reason) => rows.push({kind: 'unclassified_text', text: text || reason});
  const placeholderText = '添加图片注释，不超过 140 字（可选）';
  const blockSelector = 'div.Editable-unstyled[data-block="true"],h2.Editable-styled[data-block="true"]';
  const figureSelector = 'figure.Editable-styled[data-block="true"][contenteditable="false"]';
  if (!el.matches('div.public-DraftEditor-content[contenteditable="true"][role="textbox"]') || !Array.isArray(profile.frozen_paragraphs)) {
    unknown('', 'Unexpected Draft.js root or missing frozen paragraph contract'); return {rows, captions, placeholderCount};
  }
  const inlineSafe = node => {
    if (node.nodeType === 3) return true;
    if (node.nodeType !== 1) return true;
    if (!['SPAN','B','I','STRONG','EM','U','S','A','CODE','BR'].includes(node.tagName) && !(node.tagName === 'DIV' && classes(node).includes('public-DraftStyleDefault-block'))) return false;
    return [...node.childNodes].every(inlineSafe);
  };
  const textBlock = node => {
    if (![...node.childNodes].every(inlineSafe)) { unknown(node.textContent, 'Unknown content inside a Draft.js text block'); return; }
    const raw = node.textContent.trim();
    if (!raw) return; // Observed empty layout block, not a frozen body paragraph.
    if (firstText && raw === profile.frozen_title) {
      rows.push({kind: 'paragraph', text: raw, tag: node.tagName, list: false}); firstText = false; return;
    }
    firstText = false;
    let cursor = 0;
    // Consume only exact, ordered frozen paragraphs with actual LF separators.
    // A paragraph itself may contain LF; it is matched whole before separators.
    while (cursor < raw.length) {
      const expected = profile.frozen_paragraphs[expectedIndex];
      if (typeof expected !== 'string' || !expected || raw.slice(cursor, cursor + expected.length) !== expected) { unknown(raw.slice(cursor), 'Draft block differs from frozen paragraph order'); return; }
      rows.push({kind: 'paragraph', text: raw.slice(cursor, cursor + expected.length), tag: node.tagName, list: false});
      cursor += expected.length; expectedIndex++;
      if (cursor === raw.length) break;
      if (raw[cursor] !== '\n' && raw[cursor] !== '\r') { unknown(raw.slice(cursor), 'No real paragraph delimiter'); return; }
      while (raw[cursor] === '\n' || raw[cursor] === '\r') cursor++;
    }
  };
  const image = node => {
    if (!node.matches(profile.image_css)) { unknown('', 'Unknown image in Draft.js body'); return; }
    rows.push({kind: 'image', src: node.currentSrc || node.src, loaded: node.complete && node.naturalWidth > 0, width: node.naturalWidth, height: node.naturalHeight});
  };
  const caption = (node, figure) => {
    const text = node.textContent.trim(), names = classes(node);
    const safeTree = [...node.childNodes].every(inlineSafe);
    if (!safeTree) {
      // textContent does not include input values or image content. Recursively
      // collect those fields, and reject all non-inline caption structure even
      // if its visible text happens to be empty.
      const inspectChildren = child => {
        if (child.nodeType !== 1) return;
        if (child.tagName === 'INPUT' || child.tagName === 'TEXTAREA') {
          captions.push(child.value?.trim() || ''); unknown('', 'Form control inside image caption');
        } else if (child.tagName === 'IMG') {
          image(child); unknown('', 'Extra image inside image caption');
        } else if (!inlineSafe(child)) unknown(child.textContent, 'Unknown image-caption subtree');
        for (const nested of child.childNodes) inspectChildren(nested);
      };
      for (const child of node.childNodes) inspectChildren(child);
      unknown(text, 'Image caption contains unsupported non-inline structure');
      captions.push(text); return;
    }
    const exactPlaceholder = node.tagName === 'FIGCAPTION' && names.includes('Image-caption') && names.includes('Image-captionV2') && names.includes('is-placeholder') && text === placeholderText && node.closest(figureSelector) === figure && safeTree;
    if (exactPlaceholder) { captions.push(''); placeholderCount++; return; }
    // No exemption for non-empty real captions, fake class, input values or
    // a placeholder string outside the exact observed figure/caption structure.
    captions.push(text);
    if (text) unknown(text, 'Non-empty or unrecognized image caption');
  };
  const figureWalk = (node, figure) => {
    if (node.nodeType === 3) { if (node.textContent.trim()) unknown(node.textContent, 'Unknown figure text outside caption'); return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'FIGCAPTION') { caption(node, figure); return; }
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') { const value = node.value?.trim() || ''; captions.push(value); if (value) unknown(value, 'Non-empty embedded editor'); return; }
    if (node.tagName === 'IMG') { image(node); return; }
    for (const child of node.childNodes) figureWalk(child, figure);
  };
  const walk = node => {
    if (node.nodeType === 3) { if (node.textContent.trim()) unknown(node.textContent, 'Unknown body text outside Draft.js blocks'); return; }
    if (node.nodeType !== 1) return;
    if (node.matches(blockSelector)) { textBlock(node); return; }
    if (node.matches(figureSelector)) { figureWalk(node, node); return; }
    if (node === el || node.parentElement === el && node.tagName === 'DIV' && !attr(node, 'data-block') && !node.className) {
      for (const child of node.childNodes) walk(child); return;
    }
    if (node.tagName === 'TEXTAREA' || node.tagName === 'INPUT') { const value = node.value?.trim() || ''; captions.push(value); if (value) unknown(value, 'Unexpected body input'); }
    unknown(node.textContent, 'Unknown Draft.js node cannot be omitted');
  };
  walk(el);
  // An untouched empty editor is valid for preflight; full-readback bodyAnalysis
  // still rejects empty/incomplete bodies against the frozen paragraph array.
  if (expectedIndex > 0 && expectedIndex !== profile.frozen_paragraphs.length) unknown('', 'Incomplete frozen Draft.js body');
  return {rows, captions, placeholderCount};
}

// Raw browser errors are retained only in this module-private WeakMap. Neither
// the public Error, a session, an event, nor a checkpoint receives a raw cause.
const uploadDiagnosticRecords = new WeakMap();
const uploadDiagnosticSubsteps = new Set([
  'runtime_operation','account_scope','account_binding','account_binding_count',
  'account_binding_visible','account_binding_href','account_editor_url',
  'account_navigation','account_page_url',
  'account_page_blockers','account_menu_binding','account_menu_count',
  'account_menu_visible','account_menu_enabled','account_menu_wait',
  'account_menu_label','account_menu_identity','account_menu_click',
  'account_link_binding','account_link_count','account_link_visible',
  'account_link_wait','account_link_href','account_final_url',
  'account_live_read','account_result_validation','word_evidence',
  'editor_title_read','editor_body_read','editor_caption_read',
  'draft_list_readback','chooser_prepare','native_prepare','native_inspect','native_submit'
]);
const uploadDiagnosticStages = new Set(['file_handoff','chooser_wait','file_submission','platform_import','draft_readback']);
const uploadDiagnosticKinds = new Set(['login','account_read_failure','captcha','permission_approval','browser_crash','picker_failure','submission_unknown','platform_import_failure','import_pending','result_unknown','explicit_failure','title_over_limit','format_missing_images','readback_mismatch','duplicate_draft','lease_lost','cancelled']);
const uploadDiagnosticNames = new Set(['Error','TypeError','ReferenceError','RangeError','SyntaxError','TimeoutError']);
const uploadDiagnosticSummaries = new Map([
  'Independent Zhihu account tab required','Zhihu account page changed',
  'Zhihu account read blocked','Observed Zhihu account binding required',
  'Unsupported Zhihu account binding','Zhihu avatar menu unavailable',
  'Unsafe Zhihu account menu control','Zhihu avatar control identity changed',
  'Authenticated Zhihu profile link unavailable','Zhihu account page navigated',
  'Invalid bounded account readiness configuration',
  'Account readiness wait unavailable in this execution context',
  'Awaitable account readiness wait adapter required',
  'Invalid account readiness observation',
  'Fresh named Word evidence in this browser session is required',
  'Exact same-browser download and fresh source/named CUA byte evidence are required'
].map(value => [value, value]));
const uploadDiagnosticFallback = 'Upload operation failed; private diagnostic retained.';
function uploadErrorField(error, field) {
  try { const value = typeof error === 'string' && field === 'message' ? error : error?.[field]; return typeof value === 'string' ? value : ''; }
  catch { return ''; } // Poisoned getters must never replace the actual failure.
}
function uploadDiagnosticTime(now) {
  try { const value = now(); return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null; }
  catch { return null; }
}
function uploadDiagnosticCopy(subject) {
  try { const safe = uploadDiagnosticRecords.get(subject)?.safe; return safe ? {...safe} : null; }
  catch { return null; }
}
function retainUploadCause(subject, error) {
  const inherited = error && (typeof error === 'object' || typeof error === 'function') ? uploadDiagnosticRecords.get(error) : null;
  uploadDiagnosticRecords.set(subject, {raw:inherited ? inherited.raw : error, ...(inherited?.safe ? {safe:inherited.safe} : {})});
}
function rememberUploadDiagnostic(subject, error, detail = {}) {
  const inherited = error && (typeof error === 'object' || typeof error === 'function') ? uploadDiagnosticRecords.get(error) : null;
  const raw = inherited ? inherited.raw : error;
  const value = {...detail, ...(inherited?.safe || {}),
    stage: detail.stage ?? inherited?.safe.stage ?? null,
    kind: detail.kind ?? inherited?.safe.kind ?? null,
    failed_at: detail.failed_at ?? inherited?.safe.failed_at ?? null};
  const time = key => typeof value[key] === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value[key]) && Number.isFinite(Date.parse(value[key])) ? value[key] : null;
  const rawName = uploadErrorField(raw, 'name'), rawMessage = uploadErrorField(raw, 'message'), rawDetail = uploadErrorField(raw, 'detail');
  const safe = {
    version: 1,
    source: value.source === 'account_reader' ? 'account_reader' : 'draft_runtime',
    stage: uploadDiagnosticStages.has(value.stage) ? value.stage : null,
    substep: uploadDiagnosticSubsteps.has(value.substep) ? value.substep : 'runtime_operation',
    kind: uploadDiagnosticKinds.has(value.kind) ? value.kind : null,
    error_name: uploadDiagnosticNames.has(rawName) ? rawName : 'Error',
    // Only exact fixed summaries survive. No unknown message, stack, URL,
    // locator, argument, credential, or exception property is serialized.
    summary: (uploadDiagnosticSummaries.get(value.summary) || uploadDiagnosticSummaries.get(rawMessage) || uploadDiagnosticSummaries.get(rawDetail) || uploadDiagnosticFallback).slice(0, 160),
    count: Number.isSafeInteger(value.count) && value.count >= 0 && value.count <= 1000000 ? value.count : 'not_checked',
    visible: typeof value.visible === 'boolean' ? value.visible : 'not_checked',
    enabled: typeof value.enabled === 'boolean' ? value.enabled : 'not_checked',
    checks: Number.isSafeInteger(value.checks) && value.checks >= 0 && value.checks <= 100 ? value.checks : 0,
    checked_at: time('checked_at'), failed_at: time('failed_at')
  };
  uploadDiagnosticRecords.set(subject, {raw, safe});
  return safe;
}

/** A separate, same-browser tab reads the CURRENT authenticated avatar menu.
 * Bindings come from real observations of that page, never example selectors.
 * Navigation and menu clicks use supported browser tools; editor/picker untouched.
 */
export function createZhihuAccountReader({verificationTab, menu, accountLink, now = () => new Date().toISOString(),
  waitForReadiness, readinessTimeoutMs = 5000, readinessIntervalMs = 100, readinessMaxChecks = 20}) {
  const home = 'https://www.zhihu.com/';
  const bindings = JSON.parse(JSON.stringify({menu, accountLink}));
  if (!Number.isSafeInteger(readinessTimeoutMs) || readinessTimeoutMs < 1 || readinessTimeoutMs > 15000 ||
      !Number.isSafeInteger(readinessIntervalMs) || readinessIntervalMs < 1 || readinessIntervalMs > 1000 ||
      !Number.isSafeInteger(readinessMaxChecks) || readinessMaxChecks < 1 || readinessMaxChecks > 100 ||
      waitForReadiness !== undefined && typeof waitForReadiness !== 'function') throw Error('Invalid bounded account readiness configuration');
  // Retain standard timers and explicitly validated awaitable delay adapters.
  // A timerless host uses the documented locator visible condition below.
  const wait = waitForReadiness || (typeof setTimeout === 'function' ? milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) : null);
  return {diagnostic: uploadDiagnosticCopy, async inspect(context) {
    const state = {source:'account_reader',substep:'account_scope',count:'not_checked',visible:'not_checked',enabled:'not_checked',checks:0,checked_at:null};
    const step = substep => { state.substep = substep; };
    const readAt = () => { state.checked_at = uploadDiagnosticTime(now); };
    try {
      if (!verificationTab || verificationTab.id === context.tab_id || context.platform !== 'zhihu') throw Error('Independent Zhihu account tab required');
      const read_started_at = now(), started = Date.parse(read_started_at);
      if (!Number.isFinite(started)) throw Error('Invalid bounded account readiness configuration');
      const deadline = started + readinessTimeoutMs;
      step('account_navigation'); await verificationTab.goto(home); readAt();
      const page = async () => {
        step('account_page_url'); const url = await verificationTab.url(); readAt();
        if (url !== home) throw Error('Zhihu account page changed');
        step('account_page_blockers'); const visible = await verificationTab.playwright.domSnapshot(); readAt();
        if (/请先登录|登录后继续|Sign in to continue|验证码|滑块验证|Verify you are human|人机验证|approval required|需要授权|权限不足/.test(visible)) throw Error('Zhihu account read blocked');
      };
      const locate = (binding, substep) => {
        step(substep);
        if (!binding?.observed_at || binding.observed_url !== home) throw Error('Observed Zhihu account binding required');
        const p = verificationTab.playwright;
        if (binding.css) return p.locator(binding.css);
        if (binding.role) return p.getByRole(binding.role, {name:binding.name, exact:true});
        if (binding.text) return p.getByText(binding.text, {exact:true});
        throw Error('Unsupported Zhihu account binding');
      };
      const ready = async (control, prefix, requireEnabled, unavailable) => {
        let conditionWaited = false;
        for (let check = 1; check <= readinessMaxChecks; check++) {
          const beforeCheck = Date.parse(now());
          if (!Number.isFinite(beforeCheck) || beforeCheck >= deadline) throw Error(unavailable);
          state.count = state.visible = state.enabled = 'not_checked'; state.checks = check;
          await page();
          step(`account_${prefix}_count`); const count = await control.count(); readAt();
          if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid account readiness observation');
          state.count = count;
          if (count > 1) throw Error(unavailable); // Ambiguity is never a loading state.
          if (count === 1) {
            step(`account_${prefix}_visible`); const visible = await control.isVisible(); readAt();
            if (typeof visible !== 'boolean') throw Error('Invalid account readiness observation');
            state.visible = visible;
            if (visible) {
              if (!requireEnabled) { if (Date.parse(now()) >= deadline) throw Error(unavailable); return; }
              step('account_menu_enabled'); const enabled = await control.isEnabled(); readAt();
              if (typeof enabled !== 'boolean') throw Error('Invalid account readiness observation');
              state.enabled = enabled; if (enabled) { if (Date.parse(now()) >= deadline) throw Error(unavailable); return; }
              // Visible is already satisfied: there is no documented enabled
              // condition to await in a timerless host.
              if (!wait) throw Error(unavailable);
            }
          }
          const current = Date.parse(now());
          if (check === readinessMaxChecks || !Number.isFinite(current) || current >= deadline) throw Error(unavailable);
          step(`account_${prefix}_wait`);
          if (wait) {
            const waiting = wait(Math.min(readinessIntervalMs, deadline - current));
            if (!waiting || typeof waiting.then !== 'function') throw Error('Awaitable account readiness wait adapter required');
            await waiting;
          } else {
            if (conditionWaited) throw Error(unavailable);
            if (typeof control.waitFor !== 'function') throw Error('Account readiness wait unavailable in this execution context');
            conditionWaited = true;
            // No guessed defaults, zero timeout, exception type or cancellation.
            // A thrown condition wait is preserved by the private error boundary.
            await control.waitFor({state:'visible',timeoutMs:Math.floor(deadline - current)});
          }
          // Recheck the page and actual control observations after every await;
          // a returned wait does not establish uniqueness, identity or readiness.
        }
      };
      const control = locate(bindings.menu, 'account_menu_binding');
      await ready(control, 'menu', true, 'Zhihu avatar menu unavailable');
      step('account_menu_label');
      const label = await control.innerText(); readAt();
      const aria = await control.getAttribute('aria-label'); readAt();
      const title = await control.getAttribute('title'); readAt();
      if (/发布|发表|定时|删除|退出|登出|切换|Publish|Schedule|Delete|Log out|Sign out|Switch/i.test([label,aria,title,bindings.menu.name,bindings.menu.text].filter(Boolean).join(' '))) throw Error('Unsafe Zhihu account menu control');
      step('account_menu_identity');
      const identity = await control.evaluate(el => ({tag:el.tagName,type:el.getAttribute('type'),aria_label:el.getAttribute('aria-label'),title:el.getAttribute('title')})); readAt();
      if (!bindings.menu.identity || !Object.keys(bindings.menu.identity).length || Object.entries(bindings.menu.identity).some(([key,value]) => identity[key] !== value)) throw Error('Zhihu avatar control identity changed');
      // Reads above may have yielded while the control changed. This last guard
      // never waits again and leaves every observation marked until actually read.
      state.count = state.visible = state.enabled = 'not_checked';
      step('account_menu_count'); const finalCount = await control.count(); readAt();
      if (!Number.isSafeInteger(finalCount) || finalCount < 0) throw Error('Invalid account readiness observation');
      state.count = finalCount; if (finalCount !== 1) throw Error('Zhihu avatar menu unavailable');
      step('account_menu_visible'); const finalVisible = await control.isVisible(); readAt();
      if (typeof finalVisible !== 'boolean') throw Error('Invalid account readiness observation');
      state.visible = finalVisible; if (!finalVisible) throw Error('Zhihu avatar menu unavailable');
      step('account_menu_enabled'); const finalEnabled = await control.isEnabled(); readAt();
      if (typeof finalEnabled !== 'boolean') throw Error('Invalid account readiness observation');
      state.enabled = finalEnabled; if (!finalEnabled) throw Error('Zhihu avatar menu unavailable');
      await page();
      const beforeClick = Date.parse(now());
      if (!Number.isFinite(beforeClick) || beforeClick >= deadline) throw Error('Zhihu avatar menu unavailable');
      step('account_menu_click'); await control.click(); readAt();
      const link = locate(bindings.accountLink, 'account_link_binding');
      await ready(link, 'link', false, 'Authenticated Zhihu profile link unavailable');
      step('account_link_href'); const profile_href = await link.getAttribute('href'); readAt();
      step('account_final_url'); const finalUrl = await verificationTab.url(); readAt();
      if (finalUrl !== home) throw Error('Zhihu account page navigated');
      return {...context,source:'fresh_account_menu',verification_tab_id:verificationTab.id,verification_url:home,
        authenticated_account_menu:true,profile_href,read_started_at,checked_at:now()};
    } catch (error) {
      const safeError = new Error(uploadDiagnosticSummaries.get(uploadErrorField(error, 'message')) || uploadDiagnosticFallback);
      rememberUploadDiagnostic(safeError, error, {...state,kind:'account_read_failure',failed_at:uploadDiagnosticTime(now)});
      throw safeError;
    }
  }};
}

export function createDraftUploadRuntime({browser, nativeFilePicker, accountReader, now = () => new Date().toISOString()}) {
  const runtimeVersion=createDraftUploadRuntime.runtimeVersion||'2026-10-10-platform-methods-5';
  const accounts = {toutiao: '61556093362', zhihu: 'ren-zhe-ai-chi-yu-52'};
  const platformPickers = {toutiao:'browser',zhihu:'native'};
  const platformMethods = {toutiao:'codex',zhihu:'coordinate'};
  // This is the project's adapter contract, not an invented official tool API.
  const coordinateContract = 'screenshot-single-click-open-v1';
  const active = new Set();
  const known = new Map();
  const approvedFiles = new WeakMap();
  // The official tool host supplies native GUI actions. Website code cannot
  // create a cloud desktop, invent its tool API, or attest window observations.
  const pickerModes = new WeakMap(), nativePickers = new WeakMap();
  const usedNativeHandles = new Set();
  // Continuations are private, same-runtime records, never background Promises
  // or checkpoint grants. An ID correlates observations; it grants no action.
  const nativeContinuations = new WeakMap(), nativeInFlight = new WeakMap(), nativeUnknown = new WeakMap();
  const nativeEpoch = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  let nativeSerial = 0;
  let chooserOwner = null;
  let accountReadSerial = 0;
  const diagnosticStates = new WeakMap();
  const diagnosticStep = (s, substep) => {
    diagnosticStates.set(s, {source:'draft_runtime',substep,count:'not_checked',visible:'not_checked',enabled:'not_checked',checks:0,checked_at:null});
    return diagnosticStates.get(s);
  };
  const diagnostic = s => uploadDiagnosticCopy(s);
  const rules = {
    login: ['stop_for_signin', 'No credentials, account switch, or retry import'],
    account_read_failure: ['stop_retain_evidence', 'A fresh supported same-browser account read is required; no cached identity, disabled check or guessed API'],
    captcha: ['stop_for_confirmation', 'No challenge attempt without specific approval'],
    permission_approval: ['stop_for_confirmation', 'No acceptance or alternate permission route'],
    browser_crash: ['reload_same_page_once_readonly', 'No new editor, network/CDP workaround, or reimport'],
    picker_failure: ['retain_evidence_stop', 'No file submission occurred in this chooser call; do not infer a fresh grant or retry blindly'],
    submission_unknown: ['reconcile_known_urls_readonly', 'Open or setFiles began; never replay it or restore a consumed grant'],
    platform_import_failure: ['retain_attempt_stop', 'Visible platform rejection; linked reimport only under existing manual-task authorization and actual executor end'],
    import_pending: ['observe_same_page', 'No second file submission'],
    result_unknown: ['reconcile_known_urls_readonly', 'Blank editor/empty list is not permission'],
    explicit_failure: ['retain_attempt_stop', 'No reset, delete, new attempt, or reimport'],
    title_over_limit: ['stop_preserve_original', 'No shortening frozen title'],
    format_missing_images: ['repair_owned_new_draft_only', 'No rewrite, unchecked focus, or whole-body replace'],
    readback_mismatch: ['stop_preserve_evidence', 'No completion or changing user-edited draft'],
    duplicate_draft: ['report_all_urls_readonly', 'No deletion or choosing an unverified draft'],
    lease_lost: ['request_exact_owner_recovery', 'No lease clear/reset or permission replay'],
    cancelled: ['stop_retain_fence', 'Cancellation never restores consumed import permission'],
  };
  class Halt extends Error {
    constructor(kind, detail = '', error) { super(kind); this.kind = kind; this.detail = detail; this.recovery = rules[kind]; if (error !== undefined) retainUploadCause(this, error); }
  }
  const halt = (kind, detail, error) => { throw new Halt(kind, detail, error); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const asset = value => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) halt('readback_mismatch', 'Unsafe image resource');
    u.search = ''; u.hash = ''; return u.href;
  };
  const editorUrl = (platform, value) => {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) halt('result_unknown', 'Unsafe editor identity');
    if (platform === 'toutiao' && u.hostname === 'mp.toutiao.com' && u.pathname === '/profile_v4/graphic/publish' && [...u.searchParams.keys()].length === 1 && /^\d+$/.test(u.searchParams.get('pgc_id') || '')) return u.href;
    if (platform === 'zhihu' && u.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d+\/edit$/.test(u.pathname) && !u.search) return u.href;
    return null;
  };
  const record = (s, event, data = {}) => {
    // No raw exception, DOM, tool response, or credential is retained.
    s.events.push({at: now(), event, ...data});
  };
  const locate = (tab, binding) => {
    if (!binding || !binding.observed_at || !binding.observed_url) halt('result_unknown', 'Missing observed UI binding');
    if (/发布|发表|定时|删除|Publish|Schedule|Delete/i.test([binding.name, binding.text, binding.placeholder].filter(Boolean).join(' '))) halt('permission_approval', 'Public publishing/scheduling/deletion control prohibited');
    const p = tab.playwright;
    if (binding.css) return p.locator(binding.css);
    if (binding.role) return p.getByRole(binding.role, {name: binding.name, exact: true});
    if (binding.text) return p.getByText(binding.text, {exact: true});
    if (binding.placeholder) return p.getByPlaceholder(binding.placeholder, {exact: true});
    halt('result_unknown', 'Unsupported UI binding');
  };
  const one = async (tab, binding) => {
    const l = locate(tab, binding);
    if (await l.count() !== 1) halt('result_unknown', 'UI binding must resolve exactly once');
    return l;
  };
  const safeControl = async (s, tab, binding) => {
    assertLive(s); await assertNoLivePending(s, tab);
    const l = await one(tab, binding);
    if (!await l.isVisible() || !await l.isEnabled()) halt('result_unknown', 'Control unavailable');
    const label = await l.innerText();
    const aria = await l.getAttribute('aria-label'), title = await l.getAttribute('title');
    if (/发布|发表|定时|删除|Publish|Schedule|Delete/i.test([label, aria, title].filter(Boolean).join(' '))) halt('permission_approval', 'Public publishing/scheduling/deletion control prohibited');
    const identity = await l.evaluate(el => ({tag: el.tagName, type: el.getAttribute('type'), aria_label: el.getAttribute('aria-label'), title: el.getAttribute('title')}));
    if (!binding.identity || !Object.keys(binding.identity).length || Object.entries(binding.identity).some(([key,value]) => identity[key] !== value)) halt('permission_approval', 'Observed control identity is missing or changed');
    if (identity.type !== 'file' && ![label, aria, title].some(value => value?.trim())) halt('permission_approval', 'Unlabelled action control cannot be safely identified');
    return l;
  };
  const click = async (s, tab, binding) => {
    const l = await safeControl(s, tab, binding);
    assertLive(s); await l.click(); return tab.playwright.domSnapshot();
  };
  const assertLive = s => { if (s.cancelled) halt('cancelled'); if (s.blocked) halt(s.blocked); };
  async function checkBlockers(tab) {
    const visible = await tab.playwright.domSnapshot();
    // Positive visible UI evidence only. These labels never cause an interaction.
    if (/验证码|滑块验证|Verify you are human|人机验证/.test(visible)) halt('captcha');
    if (/ERR_BLOCKED_BY_ADMINISTRATOR|Permission denied|approval required|需要授权|权限不足/.test(visible)) halt('permission_approval');
    if (/请先登录|登录后继续|Sign in to continue/.test(visible)) halt('login');
    // A title-length publishing hint does not prove private-draft save failure.
    // Preserve the complete frozen title; saved() and full readback still decide.
    return visible;
  }
  async function assertNoLivePending(s, tab) {
    const visible = await checkBlockers(tab);
    if (/文档导入中|正在导入|Importing/.test(visible)) { s.phase = 'import_pending'; halt('import_pending', 'Live editor is still importing; writing is prohibited'); }
    if (/导入失败|不支持的文件|文件格式错误|保存失败|未能保存|无法保存(?:草稿|文档)|Import failed|Save failed|Failed to save/i.test(visible)) { s.phase = 'result_unknown'; s.diagnostic_stage='platform_import'; s.readonly_fenced = true; s.document_imported_this_session = false; halt('platform_import_failure', 'Live editor shows an import or save failure; writing is prohibited'); }
  }
  async function account(s, tab) {
    const observedState = diagnosticStep(s, 'account_scope');
    if (s.target_account !== accounts[s.platform]) halt('login', 'Target account scope changed');
    observedState.substep = 'account_binding';
    const l = locate(tab, s.ui.account);
    observedState.substep = 'account_binding_count'; const count = await l.count();
    observedState.count = count; observedState.checked_at = uploadDiagnosticTime(now);
    let visible = count === 1;
    if (visible && s.platform === 'zhihu') {
      observedState.substep = 'account_binding_visible'; visible = await l.isVisible();
      observedState.visible = visible; observedState.checked_at = uploadDiagnosticTime(now);
    }
    if ((count === 0 || count === 1 && !visible) && s.platform === 'zhihu' && accountReader) {
      if (typeof accountReader.inspect !== 'function') halt('account_read_failure', 'Live account reader unavailable');
      const bounded = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
      if (![s.article_id,s.browser_session,s.executor_id,tab.id].every(bounded)) halt('account_read_failure', 'Live account read scope missing');
      diagnosticStep(s, 'account_editor_url');
      const context = {article_id:s.article_id,platform:s.platform,target_account:s.target_account,browser_session:s.browser_session,
        executor_id:s.executor_id,tab_id:tab.id,editor_url:await tab.url(),purpose:'account_identity',request_id:`account-${++accountReadSerial}`,requested_at:now()};
      let observed;
      diagnosticStep(s, 'account_live_read');
      try { observed = await accountReader.inspect(Object.freeze({...context})); }
      catch (error) { halt('account_read_failure', 'Live authenticated account read unavailable', error); }
      diagnosticStep(s, 'account_result_validation');
      assertLive(s);
      const fields = [...Object.keys(context),'source','verification_tab_id','verification_url','authenticated_account_menu','profile_href','read_started_at','checked_at'];
      diagnosticStep(s, 'account_editor_url');
      const current = {article_id:s.article_id,platform:s.platform,target_account:s.target_account,browser_session:s.browser_session,
        executor_id:s.executor_id,tab_id:tab.id,editor_url:await tab.url(),purpose:'account_identity'};
      diagnosticStep(s, 'account_result_validation');
      if (!observed || typeof observed !== 'object' || Array.isArray(observed) || Object.keys(observed).some(key => !fields.includes(key)) ||
          Object.entries(context).some(([key,value]) => observed[key] !== value) || Object.entries(current).some(([key,value]) => context[key] !== value) ||
          observed.source !== 'fresh_account_menu' || observed.authenticated_account_menu !== true || !bounded(observed.verification_tab_id) ||
          observed.verification_tab_id === tab.id || observed.verification_url !== 'https://www.zhihu.com/' ||
          !Number.isFinite(Date.parse(observed.checked_at)) || Date.parse(now()) - Date.parse(observed.checked_at) > 60000 || Date.parse(observed.checked_at) > Date.parse(now()) || !Number.isFinite(Date.parse(observed.read_started_at)) ||
          Date.parse(observed.read_started_at) < Date.parse(context.requested_at) || Date.parse(observed.checked_at) < Date.parse(observed.read_started_at)) halt('account_read_failure', 'Fresh scoped authenticated account evidence required');
      let profile;
      try { profile = new URL(observed.profile_href, 'https://www.zhihu.com'); } catch { halt('login', 'Invalid authenticated profile link'); }
      if (profile.protocol !== 'https:' || profile.hostname !== 'www.zhihu.com' || profile.username || profile.password || profile.port || profile.search || profile.hash ||
          profile.pathname.match(/^\/people\/([^/]+)\/?$/)?.[1] !== accounts[s.platform]) halt('login', 'Stable target account ID did not match');
      return accounts[s.platform];
    }
    // A visible mismatch or ambiguous binding must never fall back to another tab.
    if (count !== 1 || !visible) halt('result_unknown', 'UI binding must be uniquely visible; a disappearing Zhihu menu requires a live accountReader');
    diagnosticStep(s, 'account_binding_href');
    let observed = s.ui.account.attribute ? await l.getAttribute(s.ui.account.attribute) : await l.innerText();
    if (s.ui.account.encoding === 'toutiao_profile_href') {
      const profile = new URL(observed, 'https://www.toutiao.com');
      observed = profile.hostname === 'www.toutiao.com' ? profile.pathname.match(/^\/c\/user\/(\d+)\/$/)?.[1] : null;
    }
    if (s.ui.account.encoding === 'zhihu_profile_href') {
      const profile = new URL(observed, 'https://www.zhihu.com');
      observed = profile.hostname === 'www.zhihu.com' ? profile.pathname.match(/^\/people\/([^/]+)\/?$/)?.[1] : null;
    }
    if (observed !== accounts[s.platform]) halt('login', 'Stable target account ID did not match');
    return observed;
  }
  async function read(s, tab) {
    const visible=await checkBlockers(tab); await account(s, tab);
    if(!s.title_length_warning_observed&&/标题.{0,12}(超出|超过|过长)|title.{0,12}too long/i.test(visible)){
      s.title_length_warning_observed=true;record(s,'title_length_warning_observed');
    }
    diagnosticStep(s, 'editor_title_read');
    const title = await (await one(tab, s.ui.title)).evaluate(el => 'value' in el ? el.value : el.textContent);
    diagnosticStep(s, 'editor_body_read');
    if (!s.ui.body.image_css) halt('readback_mismatch', 'Observed article-only image selector required; toolbar images cannot be counted');
    let body, captions;
    if (s.ui.body.dom_kind === 'zhihu_draftjs_v1') {
      if (s.platform !== 'zhihu') halt('readback_mismatch', 'Draft.js profile is Zhihu-only');
      const evidence = await (await one(tab, s.ui.body)).evaluate(inspectObservedDraftJs, {
        image_css: s.ui.body.image_css, frozen_title: s.baseline.title, frozen_paragraphs: s.baseline.paragraphs,
      });
      body = evidence.rows; captions = evidence.captions;
    } else {
      body = await (await one(tab, s.ui.body)).evaluate((el, profile) => {
      const rows = [];
      // Paragraph/list/heading structure is observed, never mutated in evaluate.
      const walk = node => {
        if (node.nodeType === 3) { if (node.textContent.trim()) rows.push({kind: 'unclassified_text', text: node.textContent}); return; }
        if (node.nodeType !== 1) return;
        if (profile.chrome_css && node.matches(profile.chrome_css)) return;
        if (node.tagName === 'IMG') { if (!node.matches(profile.image_css)) return; rows.push({kind: 'image', src: node.currentSrc || node.src, loaded: node.complete && node.naturalWidth > 0, width: node.naturalWidth, height: node.naturalHeight}); return; }
        if (node.matches('p,h1,h2,h3,h4,h5,h6,li')) {
          const text = [...node.childNodes].filter(n => n.nodeType === 3 || n.nodeType === 1 && !n.matches('img,figure,ol,ul,p')).map(n => n.textContent).join('').trim();
          if (text) rows.push({kind: 'paragraph', text, tag: node.tagName, list: node.parentElement?.tagName === 'OL'});
          for (const child of node.children) if (child.matches('img,figure,ol,ul,p')) walk(child);
          return;
        }
        for (const child of node.childNodes) walk(child);
      };
      walk(el); return rows;
    }, {image_css: s.ui.body.image_css, chrome_css: s.ui.body.chrome_css || null});
      diagnosticStep(s, 'editor_caption_read');
      captions = await (await one(tab, s.ui.body)).evaluate(el => [...el.querySelectorAll('figcaption,textarea,input,[data-caption],[contenteditable=\"true\"][role=\"textbox\"]')].map(node => ('value' in node ? node.value : node.textContent || '').trim()));
    }
    return {title, rows: body, captions, url: await tab.url()};
  }
  function bodyAnalysis(s, observed) {
    // Current Word/ledger baseline has no independent caption contract. Any
    // extra caption is frozen-text content and cannot be silently omitted.
    if (observed.rows.some(row => !['paragraph','image'].includes(row.kind))) halt('readback_mismatch', 'Unclassified visible body text cannot be omitted');
    if (!Array.isArray(observed.captions) || observed.captions.some(text => text !== '')) halt('readback_mismatch', 'Unexpected non-empty image caption or embedded editor text');
    let ps = observed.rows.filter(r => r.kind === 'paragraph').map(r => r.text);
    const duplicateTitle = ps[0] === s.baseline.title;
    if (duplicateTitle) ps = ps.slice(1);
    const numbering = [];
    const validText = ps.length === s.baseline.paragraphs.length && ps.every((p, i) => {
      if (p === s.baseline.paragraphs[i]) {
        const row = observed.rows.filter(r => r.kind === 'paragraph')[i + Number(duplicateTitle)];
        if (/^\d+[.、．]\s*/.test(p) && row.list) numbering.push(i);
        return true;
      }
      const expected = s.baseline.paragraphs[i];
      const stripped = expected.replace(/^\d+[.、．]\s*/, '');
      const row = observed.rows.filter(r => r.kind === 'paragraph')[i + Number(duplicateTitle)];
      if (stripped !== expected && p === stripped && row.list) { numbering.push(i); return true; }
      return false;
    });
    if (!validText || observed.title !== s.baseline.title) halt('readback_mismatch', 'Frozen title/body mismatch or user edit');
    let count = 0; const images = [];
    for (const row of observed.rows) {
      if (row.kind === 'paragraph') count++;
      else images.push({...row, after_paragraph: Math.max(0, count - Number(duplicateTitle))});
    }
    return {duplicateTitle, numbering, images};
  }
  function createSession(input) {
    if (!accounts[input.platform] || input.target_account !== accounts[input.platform]) halt('login');
    const pickerMode=input.picker_mode===undefined?platformPickers[input.platform]:input.picker_mode;
    // Website defaults use the two named methods. An explicitly selected picker
    // without a method retains the existing independent-test adapter contract;
    // it cannot claim either official method name or silently switch channels.
    const uploadMethod=input.upload_method===undefined?(input.picker_mode===undefined?platformMethods[input.platform]:null):input.upload_method;
    if(!['browser','native'].includes(pickerMode)||(input.upload_method!==undefined&&(pickerMode!==platformPickers[input.platform]||uploadMethod!==platformMethods[input.platform])))halt('picker_failure','Upload method differs from the fixed platform route');
    const key = `${input.article_id}:${input.platform}`;
    const legacy=input.import_mode==='owner_confirmed_legacy_reimport',continuation=input.import_mode==='continue_unconsumed';
    const sessionKey = input.checkpoint?`${key}:reconcile:${input.checkpoint.attempt_id||'unknown'}`:input.import_mode==='owner_confirmed_reimport'||legacy||continuation ? `${key}:${input.reimport?.authorization_key || 'missing'}` : key;
    if (known.has(sessionKey)) {
      const existing=known.get(sessionKey),route=pickerModes.get(existing);
      if(route.mode!==pickerMode||route.method!==uploadMethod)halt('picker_failure','File picker channel changed');
      return existing; // One session per authorized action; never change its selected channel.
    }
    if (!input.checkpoint&&input.import_mode==='owner_confirmed_reimport' && (!input.reimport?.authorization_key || !input.reimport.previous_attempt_id)) halt('permission_approval','A new linked action with exact previous attempt is required');
    if (!input.checkpoint&&legacy&&(!input.reimport?.authorization_key||input.reimport.expected_attempt_id!==null||input.reimport.confirm_unrecorded_history!==true||Object.hasOwn(input.reimport,'previous_attempt_id'))) halt('permission_approval','An exact owner-authorized legacy action with unrecorded history and no fabricated previous attempt is required');
    if(!input.checkpoint&&continuation&&(!input.reimport?.authorization_key||!input.reimport.previous_attempt_id||!input.reimport.expected_recovery_fingerprint||input.reimport.confirm_unconsumed_recovery!==true))halt('permission_approval','Exact unconsumed recovery approval and snapshot are required');
    if (!input.baseline?.title || !Array.isArray(input.baseline.paragraphs) || !Array.isArray(input.baseline.images)) halt('readback_mismatch');
    const s = {...input, key, baseline: clone(input.baseline), ui: clone(input.ui), phase: 'preflight', events: [], editor_urls: [], submitted: false, cancelled: false, blocked: null};
    pickerModes.set(s,{platform:input.platform,mode:pickerMode,method:uploadMethod});
    Object.defineProperty(s,'picker_mode',{value:pickerMode,enumerable:true,writable:false,configurable:false});
    Object.defineProperty(s,'upload_method',{value:uploadMethod,enumerable:true,writable:false,configurable:false});
    if(legacy)s.reimport={...(input.reimport?clone(input.reimport):{}),authorization_scope:input.reimport?.authorization_scope??'exact_reimport'};
    if (input.checkpoint) {
      const c = input.checkpoint;
      if (c.article_id !== input.article_id || c.platform !== input.platform || c.word_sha256 !== input.word_sha256 || c.target_account !== input.target_account) halt('readback_mismatch');
      // A disk checkpoint is never an import grant. Any restart is reconciliation-only.
      s.phase = 'reconcile'; s.submitted = true; s.readonly_fenced = true; s.attempt_id = c.attempt_id;
      s.editor_urls = [...new Set(c.editor_urls.map(value => {const url = editorUrl(input.platform, value); if (!url) halt('result_unknown'); return url;}))];
      s.previous_editor_urls=[...new Set((c.previous_editor_urls||[]).map(value=>{const url=editorUrl(input.platform,value);if(!url)halt('result_unknown');return url;}))];
      s.saved_at = c.saved_at; // Only retain known-safe typed audit fields from a persisted file.
      s.diagnostic_stage=['file_handoff','chooser_wait','file_submission','platform_import','draft_readback'].includes(c.diagnostic_stage)?c.diagnostic_stage:null;
      s.failure_kind=Object.hasOwn(rules,c.failure_kind)?c.failure_kind:null;
      for(const field of ['submission_started_at','submission_returned_at'])s[field]=typeof c[field]==='string'&&Number.isFinite(Date.parse(c[field]))?new Date(c[field]).toISOString():null;
      s.events = (c.events || []).map(e => ({at: Number.isFinite(Date.parse(e.at)) ? new Date(e.at).toISOString() : now(), event: typeof e.event === 'string' && /^[a-z_]{1,80}$/.test(e.event) ? e.event : 'restored_event',...(e.event==='blocked'?{kind:Object.hasOwn(rules,e.kind)?e.kind:'result_unknown',stage:['file_handoff','chooser_wait','file_submission','platform_import','draft_readback'].includes(e.stage)?e.stage:null,cause:['timeout','tool_unavailable','permission_denied','browser_disconnected','platform_rejected','unknown'].includes(e.cause)?e.cause:'unknown'}:{})}));
    }
    known.set(sessionKey, s); return s;
  }
  const checkpoint = s => ({version: 1, article_id: s.article_id, platform: s.platform, target_account: s.target_account,
    word_sha256: s.word_sha256, readonly_fenced: !!s.readonly_fenced, attempt_id: s.attempt_id || null, phase: s.phase,
    submitted: s.submitted, diagnostic_stage:s.diagnostic_stage||null,failure_kind:s.failure_kind||null,
    submission_started_at:s.submission_started_at||null,submission_returned_at:s.submission_returned_at||null,
    previous_editor_urls: [...(s.previous_editor_urls||[])], editor_urls: [...s.editor_urls], saved_at: s.saved_at || null, events: clone(s.events)});
  function releaseChooser(s){
    // A returned pending observation, an unreturned input, or an unknown GUI
    // outcome still owns the chooser. Cancellation alone proves no closure.
    if(nativeContinuations.has(s)||nativeInFlight.has(s)||nativeUnknown.has(s)||nativePickers.has(s)&&!nativePickers.get(s).submitted)return;
    s.chooser=null;
    nativePickers.delete(s);
    // A pending browser waiter or native prepare can still receive a late window.
    // Keep its session as owner until settlement, including cancel/error paths.
    if(s.chooser_waiting){s.chooser_wait_abandoned=true;return;}
    if(chooserOwner===s)chooserOwner=null;
  }
  function registerChooserWait(s,tab){
    const waiting=tab.playwright.waitForEvent('filechooser',{timeoutMs:15000});
    s.chooser_waiting=true;s.chooser_wait_abandoned=false;
    const settled=()=>{s.chooser_waiting=false;if(s.cancelled||s.chooser_wait_abandoned)releaseChooser(s);};
    waiting.then(settled,settled);
    return waiting;
  }
  function cancel(s) { s.cancelled = true; s.grant=false;releaseChooser(s);s.phase = 'cancelled'; record(s, 'cancelled'); }
  function diagnosticRequest(s,{operation_id,executor_id}){
    const last=[...s.events].reverse().find(e=>e.event==='blocked');
    if(!last||!['file_handoff','chooser_wait','file_submission','platform_import','draft_readback'].includes(last.stage))return null;
    return {status:'bridge_required',operation:'record_article_upload_diagnostic',args:{article_id:s.article_id,platform:s.platform,operation_id,executor_id,...(s.attempt_id?{attempt_id:s.attempt_id}:{}),stage:last.stage,outcome:'failed',cause:last.kind==='platform_import_failure'?'platform_rejected':last.kind==='permission_approval'?'permission_denied':last.cause,observed_at:last.at},checkpoint:checkpoint(s)};
  }
  async function exclusive(s, work) {
    if (active.has(s.key)) halt('result_unknown', 'Concurrent/reentrant execution is prohibited');
    active.add(s.key);
    try { assertLive(s); return await work(); }
    catch (e) {
      const raw = uploadDiagnosticRecords.get(e)?.raw ?? e;
      const errorText = uploadErrorField(raw, 'message');
      const cause=/permission|approval|denied/i.test(errorText)?'permission_denied':/timeout/i.test(errorText)?'timeout':/unavailable|AT-SPI/i.test(errorText)?'tool_unavailable':/error.?9|CDP|Target closed|transport|disconnect/i.test(errorText)?'browser_disconnected':'unknown';
      const kind = e instanceof Halt ? e.kind : cause==='permission_denied'?'permission_approval':s.diagnostic_stage==='chooser_wait'?'picker_failure':s.diagnostic_stage==='file_submission'?'submission_unknown':['timeout','browser_disconnected'].includes(cause)?'browser_crash':'result_unknown';
      if (!s.blocked || !uploadDiagnosticRecords.has(s)) rememberUploadDiagnostic(s, e, {...(diagnosticStates.get(s) || {}),stage:s.diagnostic_stage || null,kind,failed_at:uploadDiagnosticTime(now)});
      releaseChooser(s);s.grant=false;
      // A visible loading/saving state is not a terminal failure. Allow another
      // observation of this same session without restoring any import permit.
      if (kind === 'import_pending') {
        s.phase = 'import_pending';
        s.failure_kind = null;
        record(s, 'waiting', {kind, stage:s.diagnostic_stage||null});
        return {status:'waiting', kind, recovery:rules[kind], checkpoint:checkpoint(s)};
      }
      if (['browser_crash','picker_failure','submission_unknown','permission_approval'].includes(kind)) { s.readonly_fenced = true; s.document_imported_this_session = false; }
      s.blocked = kind; s.failure_kind=kind; record(s, 'blocked', {kind,cause,stage:s.diagnostic_stage||null});
      return {status: 'blocked', kind, recovery: rules[kind], checkpoint: checkpoint(s)};
    } finally { active.delete(s.key); }
  }
  const fresh = timestamp => Number.isFinite(Date.parse(timestamp)) && Date.parse(now()) - Date.parse(timestamp) <= 15 * 60000 && Date.parse(timestamp) <= Date.parse(now()) + 60000;
  function pickerMode(s){
    const route=pickerModes.get(s);
    if(!route||s.platform!==route.platform||s.picker_mode!==route.mode||s.upload_method!==route.method)halt('picker_failure','File picker channel changed');
    if(route.mode==='native'&&(!nativeFilePicker||(route.method==='coordinate'&&nativeFilePicker.coordinate_contract!==coordinateContract)||['prepare','inspect','submit'].some(method=>typeof nativeFilePicker[method]!=='function')))halt('picker_failure','Native file picker tool unavailable',Error('Native file picker tool unavailable'));
    return route.mode;
  }
  const nativeScopeFields=['article_id','platform','target_account','browser_session','executor_id','tab_id','editor_url','purpose'];
  function nativeContext(s,tab,binding,purpose){
    const bounded=value=>typeof value==='string'&&value.length>0&&value.length<=180&&!/[\u0000-\u001f\u007f]/.test(value);
    if(pickerMode(s)!=='native'||!bounded(s.executor_id)||!bounded(s.browser_session)||!bounded(tab.id)||!binding||!fresh(binding.observed_at))halt('picker_failure','Fresh native picker scope and observed control are required');
    const context={article_id:s.article_id,platform:s.platform,target_account:s.target_account,browser_session:s.browser_session,executor_id:s.executor_id,tab_id:tab.id,editor_url:purpose==='document'?s.initial_url:s.editor_urls[0],purpose,binding:clone(binding),
      ...(s.upload_method==='coordinate'?{coordinate_actions:{contract:coordinateContract,document_stages:purpose==='document'?clone(s.ui.importStages):[],file_selection:purpose==='document'?'single_click_exact_word':'single_click_exact_existing_image',confirmation:'single_click_open',settle_after_each_action:true,relocate_on_window_change:true}}:{})};
    if(binding.observed_url!==context.editor_url)halt('picker_failure','Native file control was not observed in this exact editor');
    if(context.coordinate_actions){
      for(const step of context.coordinate_actions.document_stages){Object.freeze(step.binding.identity);Object.freeze(step.binding);Object.freeze(step);}
      Object.freeze(context.coordinate_actions.document_stages);Object.freeze(context.coordinate_actions);
    }
    Object.freeze(context.binding.identity);Object.freeze(context.binding);
    return Object.freeze(context);
  }
  function nativeReady(context,value,expectedHandle){
    if(Date.parse(value?.checked_at)>Date.parse(now()))halt('picker_failure','Native observation cannot be from the future');
    if(!value||typeof value!=='object'||Array.isArray(value)||value.ready!==true||value.window_count!==1||value.files_selected!==false||value.submitted!==false||!fresh(value.checked_at)||Date.parse(now())-Date.parse(value.checked_at)>60000||typeof value.window_handle!=='string'||!value.window_handle||value.window_handle.length>180||/[\u0000-\u001f\u007f]/.test(value.window_handle)||nativeScopeFields.some(key=>value[key]!==context[key])||(expectedHandle!==undefined&&value.window_handle!==expectedHandle))halt('picker_failure','A fresh unique empty native Open File window in the exact scope is required');
    return value.window_handle;
  }
  const actualNativeTime = (observed,started) => typeof observed==='string'&&Number.isFinite(Date.parse(observed))&&Date.parse(observed)>=Date.parse(started)&&Date.parse(observed)<=Date.parse(now())&&Date.parse(now())-Date.parse(observed)<=60000;
  const nativeHandle = handle => typeof handle==='string'&&handle.length>0&&handle.length<=180&&!/[\u0000-\u001f\u007f]/.test(handle);
  const nativeRefusal = s => ({status:'blocked',kind:'picker_failure',recovery:rules.picker_failure,checkpoint:checkpoint(s)});
  function nativePendingResult(s,p){
    return {status:'native_pending',request:{runtimeVersion,request_id:p.request_id,request_version:p.request_version,method:p.method,
      ...Object.fromEntries(nativeScopeFields.map(key=>[key,p.context[key]])),window_handle:p.handle,observed_at:p.observed_at,actions_settled:true},checkpoint:checkpoint(s)};
  }
  async function invokeNative(s,method,context,extra,finish){
    if(nativeContinuations.has(s)||nativeInFlight.has(s)||nativeUnknown.has(s))halt('picker_failure','Native operation is still owned');
    const request_version=++nativeSerial,p={request_id:`native-${nativeEpoch}-${request_version}`,request_version,method,context,
      started_at:now(),handle:extra?.window_handle,finish};
    diagnosticStep(s,`native_${method}`);
    nativeInFlight.set(s,p);
    let result;
    try{result=await nativeFilePicker[method](Object.freeze({...context,...extra,runtimeVersion,request_id:p.request_id,request_version,method}));}
    catch(error){nativeUnknown.set(s,p);throw error;}
    finally{nativeInFlight.delete(s);}
    p.returned_at=now();
    if(method==='prepare'&&nativeHandle(result?.window_handle)&&nativeScopeFields.every(key=>result[key]===context[key]))p.handle=result.window_handle;
    if(s.cancelled||s.chooser_wait_abandoned){nativeUnknown.set(s,p);assertLive(s);halt('picker_failure','Native action was abandoned');}
    if(result?.status==='native_pending'){
      const allowed=['status','runtimeVersion','request_id','request_version','method','actions_settled','observed_at','checked_at','window_handle',...nativeScopeFields];
      if(Object.keys(result).some(key=>!allowed.includes(key))||result.runtimeVersion!==runtimeVersion||result.request_id!==p.request_id||result.request_version!==request_version||result.method!==method||
        result.actions_settled!==true||result.checked_at!==result.observed_at||!actualNativeTime(result.observed_at,p.started_at)||!nativeHandle(result.window_handle)||
        nativeScopeFields.some(key=>result[key]!==context[key])||(p.handle!==undefined&&result.window_handle!==p.handle)){
        nativeUnknown.set(s,p);halt('picker_failure','Settled scoped native observation required before returning pending');
      }
      p.handle=result.window_handle;p.observed_at=result.observed_at;
      nativeContinuations.set(s,p);record(s,'native_observation_pending',{method});
      return nativePendingResult(s,p);
    }
    // Official mouse actions may resolve with no value. Preserve that existing
    // adapter contract, but never turn an explicit failed/unknown/unfinished
    // response into an observed successful import or release its window owner.
    if(method==='submit'&&result&&typeof result==='object'&&(
      Object.hasOwn(result,'submitted')&&result.submitted!==true||
      Object.hasOwn(result,'window_closed')&&result.window_closed!==true||
      Object.hasOwn(result,'window_count')&&result.window_count!==0||
      result.isError===true||result.success===false||
      typeof result.status==='string'&&/error|failed|failure|unknown|cancelled|blocked|timeout/i.test(result.status))){
      nativeUnknown.set(s,p);halt('submission_unknown','The native host did not confirm a completed Open action');
    }
    if(method!=='submit'&&!actualNativeTime(result?.checked_at,p.started_at)){nativeUnknown.set(s,p);halt('picker_failure','A current actual native observation is required');}
    if(method!=='submit')p.observed_at=result.checked_at;
    try{return await finish(result,{action_returned_at:p.returned_at,operation:p});}
    catch(error){if(method!=='submit'&&!nativeUnknown.has(s))nativeUnknown.set(s,p);throw error;}
  }
  async function resumeNative(s,evidence){
    const p=nativeContinuations.get(s);
    // Invalid/late receipts do not enter exclusive's destructive error path.
    // Keep the valid pending record and owner available for an exact receipt.
    const allowed=['runtimeVersion','request_id','request_version','method','actions_settled','observed_at','receipt'];
    const r=evidence?.receipt,receiptFields=[...nativeScopeFields,'window_handle','checked_at','ready','window_count','files_selected','submitted','window_closed'];
    if(!p||s.cancelled||s.blocked||s.checkpoint||s.readonly_fenced||active.has(s.key)||!evidence||typeof evidence!=='object'||Array.isArray(evidence)||Object.keys(evidence).some(key=>!allowed.includes(key))||
      evidence.runtimeVersion!==runtimeVersion||evidence.request_id!==p.request_id||evidence.request_version!==p.request_version||evidence.method!==p.method||evidence.actions_settled!==true||Date.parse(evidence.observed_at)<Date.parse(p.observed_at)||!actualNativeTime(evidence.observed_at,p.started_at)||
      !r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(key=>!receiptFields.includes(key))||r.checked_at!==evidence.observed_at||r.window_handle!==p.handle||nativeScopeFields.some(key=>r[key]!==p.context[key]))return nativeRefusal(s);
    if(p.method==='submit'?(r.submitted!==true||r.window_closed!==true||r.window_count!==0):(r.ready!==true||r.window_count!==1||r.files_selected!==false||r.submitted!==false))return nativeRefusal(s);
    return exclusive(s,async()=>{
      const binding=p.context.purpose==='document'?(s.chooser_binding||s.ui.importFile):s.ui.coverFile;
      const current=nativeContext(s,s.editorTab,binding,p.context.purpose);
      const liveUrl=await s.editorTab.url(),sameUrl=liveUrl===p.context.editor_url;
      const submittedDraft=p.method==='submit'&&p.context.purpose==='document'&&editorUrl(s.platform,liveUrl);
      if(chooserOwner!==s||JSON.stringify(current)!==JSON.stringify(p.context)||!sameUrl&&!submittedDraft)return nativeRefusal(s);
      nativeContinuations.delete(s);
      try{return await p.finish(clone(r),{action_returned_at:p.returned_at,operation:p});}
      catch(error){if(p.method!=='submit'&&!nativeContinuations.has(s)&&!nativeUnknown.has(s))nativeUnknown.set(s,p);throw error;}
      finally{if(p.method==='submit')releaseChooser(s);}
    });
  }
  function settleNative(s,evidence){
    const p=nativeContinuations.get(s)||nativeUnknown.get(s)||nativePickers.get(s)?.operation,r=evidence?.receipt;
    const allowed=['runtimeVersion','request_id','request_version','method','actions_settled','observed_at','receipt'];
    const receiptFields=[...nativeScopeFields,'window_handle','checked_at','window_closed','window_count','submitted','all_open_file_windows'];
    const exactClosedHandle=p&&(nativeHandle(p.handle)?r?.window_handle===p.handle:p.method==='prepare'&&r?.window_handle===null&&r?.all_open_file_windows===0);
    // Only a real fresh closure observation can clear a cancelled/unknown owner.
    // Never infer closure from an exception, callback, timeout or kernel reset.
    if(!p||nativeInFlight.has(s)||active.has(s.key)||chooserOwner!==s||!exactClosedHandle||!evidence||typeof evidence!=='object'||Array.isArray(evidence)||Object.keys(evidence).some(key=>!allowed.includes(key))||
      evidence.runtimeVersion!==runtimeVersion||evidence.request_id!==p.request_id||evidence.request_version!==p.request_version||evidence.method!==p.method||evidence.actions_settled!==true||!actualNativeTime(evidence.observed_at,p.started_at)||p.observed_at&&Date.parse(evidence.observed_at)<Date.parse(p.observed_at)||
      !r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(key=>!receiptFields.includes(key))||r.checked_at!==evidence.observed_at||r.window_closed!==true||r.window_count!==0||typeof r.submitted!=='boolean'||r.all_open_file_windows!==undefined&&r.all_open_file_windows!==0||nativeScopeFields.some(key=>r[key]!==p.context[key]))return nativeRefusal(s);
    nativeContinuations.delete(s);nativeUnknown.delete(s);nativePickers.delete(s);if(nativeHandle(p.handle))usedNativeHandles.add(p.handle);
    s.grant=false;s.pending=null;s.readonly_fenced=true;s.document_imported_this_session=false;
    s.phase=s.cancelled?'cancelled':'reconcile';releaseChooser(s);record(s,'native_window_closed',{method:p.method});
    return {status:'reconcile_only',native_outcome:'closed',checkpoint:checkpoint(s)};
  }
  const guardNative = fn => (s,...args) => nativeContinuations.has(s)||nativeUnknown.has(s)||nativeInFlight.has(s)?Promise.resolve(nativeRefusal(s)):fn(s,...args);
  async function prepareNativePicker(s,tab,binding,purpose,finish=async()=>undefined){
    const context=nativeContext(s,tab,binding,purpose);
    // No path/filename is given to prepare: it opens and observes, never selects.
    s.chooser_waiting=true;s.chooser_wait_abandoned=false;
    try{return await invokeNative(s,'prepare',context,{},async(prepared,metadata)=>{
    const handle=nativeReady(context,prepared);
    if(usedNativeHandles.has(handle))halt('picker_failure','Native window handle was already used; never reuse an abandoned picker');
    usedNativeHandles.add(handle);
    assertLive(s);
    if(chooserOwner!==s)halt('picker_failure','Prepared native chooser ownership changed');
    nativePickers.set(s,{context,handle,submitted:false,observed_at:prepared.checked_at,operation:metadata.operation});
    record(s,'native_filechooser_ready');
    return finish();
    });}finally{s.chooser_waiting=false;if(s.cancelled||s.chooser_wait_abandoned)releaseChooser(s);}
  }
  function preparedPicker(s){return chooserOwner===s&&(pickerMode(s)==='native'?nativePickers.has(s):typeof s.chooser?.setFiles==='function');}
  async function inspectNativePicker(s,tab,binding,purpose,finish=async saved=>saved){
    const saved=nativePickers.get(s),context=nativeContext(s,tab,binding,purpose);
    if(!saved||saved.submitted||chooserOwner!==s||JSON.stringify(context)!==JSON.stringify(saved.context))halt('picker_failure','Prepared native picker scope changed');
    return invokeNative(s,'inspect',context,{window_handle:saved.handle},async(observation,metadata)=>{
    assertLive(s);nativeReady(context,observation,saved.handle);
    if(nativePickers.get(s)!==saved||chooserOwner!==s)halt('picker_failure','Prepared native chooser ownership changed');
    saved.operation=metadata.operation;saved.observed_at=observation.checked_at;
    return finish(saved);
    });
  }
  async function submitNativePicker(s,saved,file,finish=async()=>undefined){
    if(nativePickers.get(s)!==saved||saved.submitted||chooserOwner!==s)halt('submission_unknown','Native submission cannot be replayed');
    const current=nativeContext(s,s.editorTab,saved.context.binding,saved.context.purpose);
    if(JSON.stringify(current)!==JSON.stringify(saved.context))halt('submission_unknown','Native picker scope changed before submission');
    if(!file||typeof file.absolute_path!=='string'||!file.absolute_path.startsWith('/')||file.absolute_path.length>1024||file.absolute_path.split('/').includes('..')||/[\u0000-\u001f\u007f]/.test(file.absolute_path)||!fresh(file.checked_at)||file.browser_session!==s.browser_session||!/^([a-f0-9]{64})$/.test(file.sha256)||!Number.isSafeInteger(file.size)||file.size<1)halt('submission_unknown','Native picker requires fresh exact file evidence');
    saved.submitted=true;nativePickers.delete(s);
    // The host must perform ONE normal Open on this inspected window. A thrown
    // tool call/timeout is unknown, even if the GUI already accepted the file.
    return invokeNative(s,'submit',saved.context,{window_handle:saved.handle,file:clone(file)},finish);
  }
  function namedWordEvidence(s, file, prepared = false) {
    if (!file.filename?.endsWith('.docx') || !file.absolute_path?.startsWith('/') || file.absolute_path.split('/').pop() !== file.filename || file.sha256 !== s.word_sha256 || file.size !== s.word_size || file.browser_session !== s.browser_session || !fresh(file.checked_at)) halt('result_unknown', 'Fresh named Word evidence in this browser session is required');
    const common = {filename: file.filename, absolute_path: file.absolute_path, browser_session: file.browser_session,
      sha256: file.sha256, size: file.size, visible_in_browser: file.visible_in_browser, checked_at: file.checked_at};
    if (file.visible_in_browser === true) {
      if (Object.hasOwn(file, 'handoff') || Object.hasOwn(file, 'visibility_unproven')) halt('result_unknown', 'Browser visibility evidence cannot also claim unproven download visibility');
      return common;
    }
    // The official chooser has no path-inspection API. This branch records an
    // actual same-browser download and fresh CUA byte checks, without asserting
    // that the browser can resolve the path before the single authorized setFiles.
    const h = file.handoff, fields = ['kind','download_path','download_browser_session','executor_id','source_sha256','source_size','verified_in_cua','copied_in_same_executor','chooser_prepared','chooser_prepared_at'];
    const bounded = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
    const absolute = value => typeof value === 'string' && value.startsWith('/') && value.length <= 1024 && !value.split('/').includes('..') && !/[\u0000-\u001f\u007f]/.test(value);
    if (file.visible_in_browser !== false || file.visibility_unproven !== true || !h || typeof h !== 'object' || Array.isArray(h) || Object.keys(h).some(key => !fields.includes(key)) || h.kind !== 'same_browser_download' || !absolute(h.download_path) || !absolute(file.absolute_path) || h.download_browser_session !== s.browser_session || !bounded(h.executor_id) || h.executor_id !== s.executor_id || h.source_sha256 !== file.sha256 || h.source_size !== file.size || h.verified_in_cua !== true || h.copied_in_same_executor !== true) halt('result_unknown', 'Exact same-browser download and fresh source/named CUA byte evidence are required');
    if (prepared && (h.chooser_prepared !== true || !fresh(h.chooser_prepared_at) || Date.parse(h.chooser_prepared_at) + 60000 < Date.parse(file.checked_at))) halt('picker_failure', 'A fresh chooser prepared after the byte checks is required');
    return {...common, visibility_unproven: true, handoff: Object.fromEntries(fields.filter(key => !key.startsWith('chooser_') || prepared).map(key => [key, h[key]]))};
  }
  function bindApprovedFile(s) {
    const file = clone(s.file);
    if (file.handoff) Object.freeze(file.handoff);
    Object.freeze(file);
    if (s.file.handoff) Object.freeze(s.file.handoff);
    Object.freeze(s.file);
    approvedFiles.set(s, {reference: s.file, file, serialized: JSON.stringify(file)});
  }
  function approvedWord(s) {
    const approved = approvedFiles.get(s);
    if (!approved || s.file !== approved.reference || JSON.stringify(s.file) !== approved.serialized) {
      s.readonly_fenced = true; s.document_imported_this_session = false;
      halt('readback_mismatch', 'The file approved during this preflight was replaced or changed');
    }
    namedWordEvidence(s, approved.file, true);
    return approved.file;
  }
  const request = (s, operation, args) => {
    assertLive(s);
    s.pending = operation; record(s, 'bridge_request', {operation});
    return {status: 'bridge_required', operation,...(s.upload_method?{upload_method:s.upload_method}:{}),picker_mode:s.picker_mode,args: {article_id: s.article_id, ...(operation === 'record_article_status' ? {} : {platform: s.platform}), ...args}, checkpoint: checkpoint(s)};
  };
  async function preflight(s, {editorTab, listTab, fileEvidence, history}) {
    return exclusive(s, async () => {
      if (s.phase !== 'preflight') halt('result_unknown', 'Session is recovery-only');
      s.diagnostic_stage='file_handoff';
      await account(s, listTab);
      diagnosticStep(s, 'word_evidence');
      const file = namedWordEvidence(s, clone(fileEvidence));
      const observed = await read(s, editorTab);
      diagnosticStep(s, 'draft_list_readback');
      const rows = await (await one(listTab, s.ui.draftList)).evaluate(el => [...el.querySelectorAll('a[href]')].map(a => ({title: (a.textContent || '').trim(), url: a.href})));
      const matches = rows.filter(r => r.title === s.baseline.title).map(r => editorUrl(s.platform, r.url)).filter(Boolean);
      const current = editorUrl(s.platform, observed.url);
      if (observed.title === s.baseline.title && current) matches.push(current);
      const urls = [...new Set(matches)];
      const legacy=s.import_mode==='owner_confirmed_legacy_reimport',linked=s.import_mode==='owner_confirmed_reimport',continuation=s.import_mode==='continue_unconsumed',authorizedReimport=linked||legacy||continuation;
      if(authorizedReimport){
        const r=s.reimport;
        if(continuation&&(r.confirm_unconsumed_recovery!==true||r.prior_executor_stopped!==true||r.preserve_existing_draft!==true||r.confirm_new_draft!==true||!r.prior_executor_end_reference||!r.confirmation_message_id||!r.current_task_id||!r.expected_recovery_fingerprint||!Number.isSafeInteger(r.expected_attempt_revision)))halt('permission_approval','Exact unconsumed recovery approval and stopped executor are required');
        if(!continuation&&(r.confirm_reimport!==true||r.confirm_new_draft!==true||r.preserve_existing_draft!==true||r.prior_executor_stopped!==true||!r.prior_executor_end_reference||!r.confirmation_message_id||!r.current_task_id||!['exact_reimport','duplicate_tolerant_task'].includes(r.authorization_scope)||r.authorization_scope==='duplicate_tolerant_task'&&r.confirm_duplicate_tolerant_task!==true))halt('permission_approval','Exact owner reimport scope and actual executor end are required');
        if(legacy&&(r.expected_attempt_id!==null||r.confirm_unrecorded_history!==true||Object.hasOwn(r,'previous_attempt_id')||!['known_editor_url','unknown_without_editor_url'].includes(r.prior_draft_identity)))halt('permission_approval','Legacy history must stay unrecorded and explicitly owner-authorized');
        if(observed.title||observed.rows.length||observed.captions.some(text=>text!=='' )||current)halt('duplicate_draft','Linked import requires a new empty private editor');
        if((legacy||continuation)&&observed.url!==(s.platform==='toutiao'?'https://mp.toutiao.com/profile_v4/graphic/publish':'https://zhuanlan.zhihu.com/write'))halt('readback_mismatch','Legacy import requires the exact new private editor');
        // Old drafts remain historical evidence; they are never this child's active draft.
        const retained=[...new Set([...(r.retained_editor_urls||[]),...urls])];
        for(const value of retained)if(!editorUrl(s.platform,value))halt('readback_mismatch');
        if(r.prior_draft_identity==='known_editor_url'&&!retained.includes(r.existing_editor_url))halt('readback_mismatch','Retain the exact previous draft');
        if(r.prior_draft_identity==='unknown_without_editor_url'&&r.existing_editor_url!==undefined)halt('readback_mismatch','Unknown prior draft cannot invent a URL');
        s.previous_editor_urls=retained;
      }
      // Only explicit execution-history proof can classify never_attempted.
      // Missing ledger, empty editor, and empty list never provide this proof.
      const prior = urls.length ? 'verified_existing' : history?.prior_submission === 'never_attempted' && history?.evidence_reference ? 'never_attempted' : 'submitted_unknown';
      s.file = file;
      s.editorTab = editorTab; s.listTab = listTab; s.initial_url = observed.url;
      s.editor_urls = authorizedReimport?[]:urls;
      if (!authorizedReimport&&urls.length > 1) halt('duplicate_draft');
      if (s.import_mode === 'owner_confirmed_first_import' && !s.owner_confirmation_reference) halt('permission_approval', 'Exact owner first-import approval is missing');
      const prepareImport = authorizedReimport || prior === 'never_attempted' && s.import_mode !== 'verify_existing';
      // Check the actual documented host capability before any upload control,
      // reservation or consume. Never change channels after a failed wait.
      if(prepareImport){const mode=pickerMode(s);if(mode==='browser'&&typeof editorTab?.playwright?.waitForEvent!=='function')halt('picker_failure','Browser file chooser tool unavailable',Error('Browser file chooser tool unavailable'));}
      if (file.visible_in_browser === false && !prepareImport) halt('result_unknown', 'Download provenance does not authorize an import or replace unknown history');
      const finishPreflight=async()=>{
      if(prepareImport){
        // Re-read after a suspended observation without clicking/re-preparing.
        await assertInitialImport(s);
        await safeControl(s,s.editorTab,s.chooser_binding||s.ui.importFile);
        await account(s,s.listTab);
        const currentRows=await (await one(s.listTab,s.ui.draftList)).evaluate(el=>[...el.querySelectorAll('a[href]')].map(a=>({title:(a.textContent||'').trim(),url:a.href})));
        const currentMatches=[...new Set(currentRows.filter(r=>r.title===s.baseline.title).map(r=>editorUrl(s.platform,r.url)).filter(Boolean))].sort();
        if(JSON.stringify(currentMatches)!==JSON.stringify([...urls].sort()))halt('duplicate_draft','Draft list changed during native preparation');
        if (file.visible_in_browser === false) {
          if (!preparedPicker(s)) halt('picker_failure', 'An actual documented file chooser is required');
          s.file.handoff.chooser_prepared = true;
          s.file.handoff.chooser_prepared_at = nativePickers.get(s)?.observed_at||now();
          s.file = namedWordEvidence(s, s.file, true);
        }
      }
      assertLive(s);
      bindApprovedFile(s);
      s.reserve_mode = authorizedReimport?s.import_mode:prior === 'never_attempted' ? s.import_mode || 'new_import' : 'verify_existing';
      s.phase = 'reserve';
      return request(s, continuation?'recover_article_unconsumed_upload':'reserve_article_upload', {target_account: s.target_account, word_sha256: s.word_sha256, word_size: s.word_size,
        ...(continuation?{}:{mode:s.reserve_mode}),
        ...(authorizedReimport?Object.fromEntries([...(continuation?['expected_recovery_fingerprint','expected_attempt_revision','confirm_unconsumed_recovery']:[]),...(legacy?['expected_attempt_id','confirm_unrecorded_history']:['previous_attempt_id']),'existing_editor_url','prior_draft_identity','authorization_scope','current_task_id','authorization_key','confirmation_message_id','prior_executor_end_reference','confirm_reimport','confirm_new_draft','preserve_existing_draft','prior_executor_stopped','confirm_duplicate_tolerant_task'].filter(key=>s.reimport[key]!==undefined&&(!continuation||['previous_attempt_id','expected_recovery_fingerprint','expected_attempt_revision','confirm_unconsumed_recovery','current_task_id','authorization_key','confirmation_message_id','prior_executor_end_reference','confirm_new_draft','preserve_existing_draft','prior_executor_stopped'].includes(key))).map(key=>[key,s.reimport[key]])):{}),
        ...(authorizedReimport&&!continuation?{current_word_sha256:s.word_sha256}:{}),
        ...(s.import_mode === 'owner_confirmed_first_import' ? {confirm_never_submitted: true} : {}),
        preflight: {file: s.file, existing_drafts: {account: s.target_account, current_editor_url: observed.url,
          prior_submission: continuation?s.reimport.prior_submission:authorizedReimport?'submitted_unknown':prior, editor_checked: true, draft_list_checked: true, matching_editor_urls: authorizedReimport?s.previous_editor_urls:urls, checked_at: now(),...(authorizedReimport?{editor_empty:true,private_draft:true}:{})}}});
      };
      // The pending branch returns this cell. Only the correlated resume invokes
      // finishPreflight; it does not retain this async call as a background task.
      if(prepareImport)diagnosticStep(s,'chooser_prepare');
      return prepareImport?prepareDocumentChooser(s,finishPreflight):finishPreflight();
    });
  }
  async function acceptReserve(s, response) {
    return exclusive(s, async () => {
      if (!['reserve_article_upload','recover_article_unconsumed_upload'].includes(s.pending) || s.phase !== 'reserve') halt('result_unknown');
      s.pending = null;
      const a = response.attempt;
      if (!a || a.article_id !== s.article_id || a.platform !== s.platform || a.target_account !== s.target_account || a.word_sha256 !== s.word_sha256) halt('readback_mismatch');
      s.attempt_id = a.attempt_id; s.editor_urls = [...new Set([...s.editor_urls, ...a.editor_urls])];
      if (s.editor_urls.length > 1) halt('duplicate_draft');
      if (s.reserve_mode === 'verify_existing' || a.state !== 'reserved' || a.authorization_kind === 'verify_existing' || s.editor_urls.length) {
        releaseChooser(s);
        s.phase = 'reconcile'; s.submitted = true; return {status: 'reconcile_only', checkpoint: checkpoint(s)};
      }
      if((s.import_mode==='continue_unconsumed'||a.authorization_kind==='unconsumed_continuation')&&(s.import_mode!=='continue_unconsumed'||a.authorization_kind!=='unconsumed_continuation'||a.previous_attempt_id!==s.reimport.previous_attempt_id||a.word_size!==s.word_size||response.reserved!==true||response.unconsumed_continuation_permission_ready!==true||response.old_permit_fenced!==true))halt('lease_lost','New exact unconsumed continuation permission is required');
      if(a.authorization_kind==='owner_confirmed_reimport'&&(s.import_mode!=='owner_confirmed_reimport'||a.previous_attempt_id!==s.reimport.previous_attempt_id||response.reimport_permission_ready!==true))halt('lease_lost','New linked permission is unavailable; retain and reconcile');
      if((s.import_mode==='owner_confirmed_legacy_reimport'||a.authorization_kind==='owner_confirmed_legacy_reimport')&&(s.import_mode!=='owner_confirmed_legacy_reimport'||a.authorization_kind!=='owner_confirmed_legacy_reimport'||a.previous_attempt_id!==null||a.word_size!==s.word_size||response.reserved!==true||response.legacy_reimport_permission_ready!==true))halt('lease_lost','New legacy permission is unavailable; retain and reconcile');
      if (!preparedPicker(s)) halt('picker_failure', 'A prepared chooser in this session is required before consuming import permission');
      const file = approvedWord(s);
      s.phase = 'consume';
      return request(s, 'consume_article_upload', {attempt_id: s.attempt_id, target_account: s.target_account, file_confirmation: file,...(['unconsumed_continuation','owner_confirmed_reimport','owner_confirmed_legacy_reimport'].includes(a.authorization_kind)?{reimport_editor_confirmation:{target_account:s.target_account,current_editor_url:s.initial_url,editor_empty:true,private_draft:true,checked_at:now()}}:{})});
    });
  }
  async function acceptConsume(s, response) {
    return exclusive(s, async () => {
      if (s.pending !== 'consume_article_upload' || s.phase !== 'consume') halt('result_unknown');
      approvedWord(s);
      s.pending = null; s.phase = 'reconcile'; s.submitted = true;
      const a = response.attempt;
      if (!a || a.attempt_id !== s.attempt_id || a.target_account !== s.target_account || a.word_sha256 !== s.word_sha256) halt('readback_mismatch');
      if(s.import_mode==='owner_confirmed_legacy_reimport'&&(a.article_id!==s.article_id||a.platform!==s.platform||a.authorization_kind!=='owner_confirmed_legacy_reimport'||a.previous_attempt_id!==null||a.word_size!==s.word_size||response.execute_import===true&&(a.state!=='outcome_unknown'||!fresh(a.consumed_at))))halt('lease_lost','Exact newly consumed legacy permission is required');
      if(s.import_mode==='continue_unconsumed'&&(a.article_id!==s.article_id||a.platform!==s.platform||a.authorization_kind!=='unconsumed_continuation'||a.previous_attempt_id!==s.reimport.previous_attempt_id||a.word_size!==s.word_size||response.execute_import===true&&(a.state!=='outcome_unknown'||!fresh(a.consumed_at))))halt('lease_lost','Exact newly consumed continuation permission is required');
      s.consumed_at = a.consumed_at;
      if (response.execute_import !== true) {releaseChooser(s);return {status: 'reconcile_only', checkpoint: checkpoint(s)};}
      // The grant is transient, session-local and consumed before any UI work.
      s.grant = true; s.phase = 'saving_bridge';
      return request(s, s.platform === 'toutiao' ? 'record_article_status' : 'record_article_delivery',
        {state: s.platform === 'toutiao' ? 'toutiao_saving' : 'saving'});
    });
  }
  async function assertInitialImport(s) {
    assertLive(s);
    if (s.readonly_fenced || await s.editorTab.url() !== s.initial_url) halt('readback_mismatch', 'Import editor identity changed');
    await assertNoLivePending(s, s.editorTab);
    const observed = await read(s, s.editorTab);
    await assertNoLivePending(s, s.editorTab);
    if (observed.title || observed.rows.length || observed.captions.some(text => text !== '') || editorUrl(s.platform, observed.url)) halt('duplicate_draft', 'Import editor is no longer empty');
    if (await s.editorTab.url() !== s.initial_url) halt('readback_mismatch', 'Import editor changed during inspection');
  }
  async function prepareDocumentChooser(s,finish=async()=>undefined){
    s.diagnostic_stage='chooser_wait';
    const mode=pickerMode(s); // Fix capability and channel before clicking any menu.
    if(chooserOwner)halt('picker_failure','Another chooser is being prepared');
    chooserOwner=s;
    try{
      s.diagnostic_stage='chooser_wait';
      const steps=s.ui.importStages;
      const coordinate=s.upload_method==='coordinate';
      if(s.platform==='zhihu'&&!steps)halt('picker_failure','Observe menu, import dialog and actual local-document button before waiting');
      if(steps){
        if(steps.length!==3||steps.map(step=>step.stage).join(',')!=='menu,dialog,file')halt('picker_failure','Import stages must be menu, dialog, file');
        for(const step of steps){
          if(step.browser_session!==s.browser_session||step.tab_id!==s.editorTab.id)halt('picker_failure','Import control and waiter must belong to the same browser session/tab');
          if(coordinate){
            if(!step.binding||!fresh(step.binding.observed_at)||step.binding.observed_url!==s.initial_url)halt('picker_failure','Import controls require current exact editor observations');
            if(!step.binding.identity||!Object.keys(step.binding.identity).length)halt('permission_approval','Observed control identity is missing or changed');
            if(/发布|发表|定时|删除|Publish|Schedule|Delete/i.test([step.binding.name,step.binding.text,step.binding.placeholder,step.binding.identity.aria_label,step.binding.identity.title].filter(Boolean).join(' ')))halt('permission_approval','Public publishing/scheduling/deletion control prohibited');
          }
        }
        // The coordinate host owns screenshot positioning, each real single
        // mouse click and stability wait, including the menu/dialog controls.
        // A DOM click here would perform the same action a second time.
        if(!coordinate)for(const step of steps.slice(0,2)){
          await assertInitialImport(s);await click(s,s.editorTab,step.binding);
        }
      }else for(const binding of s.ui.importOpen||[]){await assertInitialImport(s);await click(s,s.editorTab,binding);}
      // Waiting starts at the actual file-selection control, never at a toolbar menu.
      await assertInitialImport(s);
      const final=steps?.[2];
      if(final&&(final.browser_session!==s.browser_session||final.tab_id!==s.editorTab.id))halt('picker_failure','Import control and waiter must belong to the same browser session/tab');
      const binding=final?.binding||s.ui.importFile;
      if(s.platform==='zhihu'&&![binding.name,binding.text,...(coordinate?[]:[await (await one(s.editorTab,binding)).innerText()])].some(label=>/^点击选择本地文档(?:或拖动文件到窗口上传)?$/.test(label||'')))halt('picker_failure','The import-dialog opener is not the local-document selection button');
      s.chooser_binding=binding;
      if(mode==='native'){
        if(!coordinate)await safeControl(s,s.editorTab,binding);
        return await prepareNativePicker(s,s.editorTab,binding,'document',async()=>{s.diagnostic_stage='file_handoff';return finish();});
      }else{
        const input=await safeControl(s,s.editorTab,binding);
        const waiting=registerChooserWait(s,s.editorTab);
        record(s,'filechooser_wait_started');assertLive(s);await input.click();
        const chooser=await waiting;assertLive(s);
        if(chooserOwner!==s)halt('picker_failure','Prepared chooser ownership changed');
        if(typeof chooser?.setFiles!=='function')halt('picker_failure','The official file chooser submission capability is unavailable',Error('File chooser submission tool unavailable'));
        s.chooser=chooser;record(s,'filechooser_ready');
      }
      s.diagnostic_stage='file_handoff';
      return finish();
    }finally{if(!s.chooser&&!nativePickers.has(s))releaseChooser(s);}
  }
  async function submitAfterSaving(s, response) {
    return exclusive(s, async () => {
      if (s.phase !== 'saving_bridge' || !s.grant || !s.pending || response?.state !== (s.platform === 'toutiao' ? 'toutiao_saving' : 'saving')) halt('lease_lost');
      s.grant = false; s.pending = null; s.phase = 'reconcile';
      if (chooserOwner!==s) halt('picker_failure', 'Prepared chooser ownership changed; import grant will not be replayed');
      try {
        const file = approvedWord(s);
        assertLive(s); approvedWord(s); // assertInitialImport below reads the live account.
        await checkBlockers(s.editorTab); approvedWord(s);
        await assertInitialImport(s);
        approvedWord(s);
        await safeControl(s,s.editorTab,s.chooser_binding||s.ui.importFile);
        approvedWord(s);
        const mode=pickerMode(s);
        if(mode==='native')return await inspectNativePicker(s,s.editorTab,s.chooser_binding||s.ui.importFile,'document',native=>continueDocumentSubmission(s,file,mode,native));
        return await continueDocumentSubmission(s,file,mode,null);
      } finally { releaseChooser(s); }
    });
  }
  async function continueDocumentSubmission(s,file,mode,native){
      try{
        const chooser=s.chooser;s.chooser=null;
        if(mode==='browser'&&!chooser)halt('picker_failure','Prepared chooser is unavailable; consumed permission is retained');
        await assertInitialImport(s);
        approvedWord(s);
        s.diagnostic_stage='file_submission';s.submission_started_at=now();
        record(s, mode==='native'?'document_native_open_started':'document_setFiles_started');
        assertLive(s); approvedWord(s);
        const finish=async(_result,metadata)=>{
        s.document_imported_this_session = true;
        s.submission_returned_at=metadata?.action_returned_at||now();s.diagnostic_stage='platform_import';
        record(s, mode==='native'?'document_native_open_returned':'document_setFiles_returned');
        return observe(s, {withinExclusive: true});
        };
        if(mode==='native')return await submitNativePicker(s,native,file,finish);
        else await chooser.setFiles(file.absolute_path, {timeoutMs: 30000}); // Exactly one submission, using the private approved path.
        return finish();
      } finally { releaseChooser(s); }
  }
  async function observe(s, options = {}) {
    const work = async () => {
      const tab = s.editorTab;
      if (!tab) halt('result_unknown', 'Bind the existing editor for recovery');
      const visible = await checkBlockers(tab); await account(s, tab);
      const url = editorUrl(s.platform, await tab.url());
      if(url&&s.previous_editor_urls?.includes(url))halt('readback_mismatch','Linked attempt must preserve historical drafts and obtain a different new draft URL');
      if (url && !s.editor_urls.includes(url)) s.editor_urls.push(url);
      if (s.editor_urls.length > 1) halt('duplicate_draft');
      if (/文档导入中|正在导入|Importing/.test(visible)) { s.phase = 'import_pending'; return {status: 'import_pending', recovery: rules.import_pending, checkpoint: checkpoint(s)}; }
      if (/导入失败|不支持的文件|文件格式错误|保存失败|未能保存|无法保存(?:草稿|文档)|Import failed|Save failed|Failed to save/i.test(visible)) {s.diagnostic_stage='platform_import';s.readonly_fenced=true;s.document_imported_this_session=false;halt('platform_import_failure');}
      if (!url) { s.phase = 'result_unknown'; return {status: 'result_unknown', recovery: rules.result_unknown, checkpoint: checkpoint(s)}; }
      s.phase = 'draft_observed';
      return request(s, 'record_article_upload', {attempt_id: s.attempt_id, state: 'draft_observed', editor_url: url});
    };
    return options.withinExclusive ? work() : exclusive(s, work);
  }
  async function acceptObserved(s, response) {
    return exclusive(s, async () => {
      if (s.pending !== 'record_article_upload' || s.phase !== 'draft_observed' || response.recorded !== true) halt('lease_lost');
      s.pending = null; s.phase = 'inspect';
      const observed = await read(s, s.editorTab); const analysis = bodyAnalysis(s, observed);
      return {status: 'inspect', observed, analysis, checkpoint: checkpoint(s)};
    });
  }
  async function bindRecovery(s, editorTab) {
    return exclusive(s, async () => {
      const url = editorUrl(s.platform, await editorTab.url());
      if (!url || s.editor_urls.length !== 1 || !s.editor_urls.includes(url)) halt('result_unknown', 'Recovery must bind the one already recorded URL');
      s.editorTab = editorTab; s.readonly_fenced = true; s.document_imported_this_session = false; s.phase = 'inspect';
      const observed = await read(s, editorTab);
      return {status: 'inspect_readonly', observed, analysis: bodyAnalysis(s, observed), checkpoint: checkpoint(s)};
    });
  }
  async function reconcileExisting(s, {editorTab, listTab}) {
    return exclusive(s, async () => {
      if (!s.attempt_id || !s.submitted) halt('result_unknown', 'Read the same durable attempt first');
      await checkBlockers(editorTab); await account(s, editorTab); await checkBlockers(listTab); await account(s, listTab);
      const rows = await (await one(listTab, s.ui.draftList)).evaluate(el => [...el.querySelectorAll('a[href]')].map(a => ({title: (a.textContent || '').trim(), url: a.href})));
      const matching = rows.filter(r => r.title === s.baseline.title).map(r => editorUrl(s.platform, r.url)).filter(Boolean);
      const observed = await read(s, editorTab), current = editorUrl(s.platform, observed.url);
      if (current && observed.title === s.baseline.title) matching.push(current);
      s.editor_urls = [...new Set([...s.editor_urls, ...matching])];
      if (s.editor_urls.length > 1) halt('duplicate_draft');
      if (!s.editor_urls.length) return {status: 'result_unknown', recovery: rules.result_unknown, checkpoint: checkpoint(s)};
      // Open only a real existing identity. Never create a new article/editor.
      const same = current === s.editor_urls[0] ? editorTab : await browser.tabs.new();
      if (same !== editorTab) await same.goto(s.editor_urls[0]);
      if (await same.url() !== s.editor_urls[0]) halt('readback_mismatch');
      const content = await read(s, same); bodyAnalysis(s, content);
      s.editorTab = same; s.readonly_fenced = true; s.document_imported_this_session = false; s.phase = 'draft_observed';
      return request(s, 'record_article_upload', {attempt_id: s.attempt_id, state: 'draft_observed', editor_url: s.editor_urls[0]});
    });
  }
  async function recoverBrowser(s) {
    // Sole automatic crash recovery: same tab, one read-only reload, observe only.
    if (!['browser_crash','submission_unknown'].includes(s.blocked) || !s.editorTab || s.reloaded) return {status: 'blocked', kind: s.blocked || 'result_unknown'};
    s.reloaded = true; s.readonly_fenced = true; s.document_imported_this_session = false; s.grant = false; s.blocked = null;
    return exclusive(s, async () => {
      const before = await s.editorTab.url(); await s.editorTab.reload();
      if (await s.editorTab.url() !== before) halt('result_unknown');
      record(s, 'same_page_readonly_reload'); return observe(s, {withinExclusive: true});
    });
  }
  function ownedNew(s) {
    if (!s.owned_new_draft || !s.document_imported_this_session || s.checkpoint || s.readonly_fenced || s.editor_urls.length !== 1) halt('readback_mismatch', 'Existing/user-edited/recovered drafts are read-only');
  }
  async function assertSameDraft(s, tab) {
    ownedNew(s);
    if (s.phase !== 'inspect' || editorUrl(s.platform, await tab.url()) !== s.editor_urls[0]) halt('readback_mismatch', 'Current editor is not the recorded inspected draft');
    await assertNoLivePending(s, tab);
    const observed = await read(s, tab), analysis = bodyAnalysis(s, observed);
    await assertNoLivePending(s, tab);
    if (analysis.duplicateTitle || analysis.numbering.length) halt('format_missing_images', 'Frozen body still has unresolved structural differences');
    // Navigation can occur while DOM inspection is awaited: check again.
    if (editorUrl(s.platform, await tab.url()) !== s.editor_urls[0]) halt('readback_mismatch', 'Editor identity changed while inspecting');
    return observed;
  }
  async function repairParagraph(s) {
    return exclusive(s, async () => {
      ownedNew(s);
      halt('format_missing_images', 'Automatic paragraph editing is disabled: exact persistent selection and ownership cannot be safely guaranteed');
    });
  }
  async function selectFileAtControl(s, tab, binding, path, event, fileEvidence,finish=async()=>undefined) {
    const mode=pickerMode(s);
    if (chooserOwner) halt('result_unknown', 'File chooser is busy');
    chooserOwner = s;
    try {
      assertLive(s); await assertSameDraft(s, tab); await checkBlockers(tab);
      const input = await safeControl(s, tab, binding);
      const afterSubmit=async()=>{
        s.diagnostic_stage='draft_readback';
        await tab.playwright.domSnapshot();record(s,`${event}_${mode==='native'?'native_open':'setFiles'}_returned`);
        return finish();
      };
      const afterInspect=async native=>{
        try{
          assertLive(s);await assertSameDraft(s,tab);
          if(chooserOwner!==s)halt('result_unknown','Prepared chooser ownership changed');
          s.diagnostic_stage='file_submission';record(s,`${event}_native_open_started`);
          return await submitNativePicker(s,native,fileEvidence,afterSubmit);
        }finally{releaseChooser(s);}
      };
      let chooser;
      if(mode==='native'){
        return await prepareNativePicker(s,tab,binding,event,async()=>{
          await assertSameDraft(s,tab);
          return inspectNativePicker(s,tab,binding,event,afterInspect);
        });
      }else{
        const waiting = registerChooserWait(s,tab);
        assertLive(s); await input.click(); chooser = await waiting;
      }
      assertLive(s); await assertSameDraft(s, tab);
      assertLive(s);if(chooserOwner!==s)halt('result_unknown','Prepared chooser ownership changed');
      s.diagnostic_stage='file_submission';
      record(s, `${event}_${mode==='native'?'native_open':'setFiles'}_started`);
      await chooser.setFiles(path, {timeoutMs: 30000});
      return afterSubmit();
    } finally { releaseChooser(s); }
  }
  async function repairMissingImage(s) {
    return exclusive(s, async () => {
      ownedNew(s);
      halt('format_missing_images', 'Automatic missing-image insertion is disabled: paragraph-end caret across text nodes cannot be safely guaranteed');
    });
  }
  async function setZhihuCover(s, {fileEvidence,coverInspection}) {
    const coverFile=fileEvidence?clone(fileEvidence):fileEvidence;
    return exclusive(s, async () => {
      ownedNew(s);
      if (s.platform !== 'zhihu') halt('format_missing_images', 'Independent cover is Zhihu-only');
      await assertSameDraft(s,s.editorTab);
      if(s.ui.coverImage&&coverInspection?.inspected===true&&fresh(coverInspection.checked_at)&&s.baseline.images.some(r=>r.sha256===coverInspection.reference_sha256)){
        const current=await (await one(s.editorTab,s.ui.coverImage)).evaluate(el=>({src:el.currentSrc||el.src,loaded:el.complete&&el.naturalWidth>0}));
        if(current.loaded&&asset(current.src)===coverInspection.observed_url){
          s.cover_reference_sha256=coverInspection.reference_sha256;record(s,'existing_cover_verified');
          return {status:'cover_already_verified',checkpoint:checkpoint(s)};
        }
      }
      if (s.cover_submitted) halt('result_unknown', 'Cover outcome unknown; never automatically resubmit');
      if (!coverFile || !s.baseline.images.some(r => r.sha256 === coverFile.sha256) || !fresh(coverFile.checked_at) || coverFile.visible_in_browser !== true || coverFile.browser_session !== s.browser_session) halt('format_missing_images', 'Cover must be a verified frozen Word image');
      if (!s.ui.coverOpen || !s.ui.coverFile || !s.ui.coverImage) halt('format_missing_images', 'No observed private-draft cover UI; publishing is prohibited');
      s.diagnostic_stage='chooser_wait';pickerMode(s); // Capability check precedes every cover opening action.
      await assertSameDraft(s, s.editorTab); s.cover_submitted = true;
      for (const control of s.ui.coverOpen) { await assertSameDraft(s, s.editorTab); await click(s, s.editorTab, control); }
      await assertSameDraft(s, s.editorTab);
      return selectFileAtControl(s, s.editorTab, s.ui.coverFile, coverFile.absolute_path, 'zhihu_cover', coverFile,async()=>{
      for (const control of s.ui.coverConfirm || []) { await assertSameDraft(s, s.editorTab); await click(s, s.editorTab, control); }
      await assertSameDraft(s, s.editorTab);
      s.cover_reference_sha256 = coverFile.sha256;
      return {status: 'cover_requires_inspection', checkpoint: checkpoint(s)};
      });
    });
  }
  async function loadImages(s, tab = s.editorTab) {
    return exclusive(s, async () => {
      const allLoaded=observed=>{
        const images=observed.rows.filter(r=>r.kind==='image');
        return images.length===s.baseline.images.length&&images.every(r=>r.loaded&&r.width>0&&r.height>0);
      };
      const current=await read(s,tab);
      if(allLoaded(current))return {status:'images_observed',observed:current};
      const body = await one(tab, s.ui.body);
      await body.press('Control+Home');
      // Scroll via supported keypress, never DOM scrolling/mutation.
      // Bound by actual document size; incomplete lazy loading remains pending.
      for (let i = 0; i < s.baseline.paragraphs.length + s.baseline.images.length + 1; i++) {
        const observed = await read(s, tab);
        if (allLoaded(observed)) return {status: 'images_observed', observed};
        await body.press('PageDown');
      }
      return {status: 'images_pending', recovery: rules.format_missing_images};
    });
  }
  function imageMap(s, observed, bindings, allowMissing = false) {
    if (!Array.isArray(bindings)) halt('readback_mismatch', 'Image identity inspection evidence required');
    const result = observed.map(r => {
      if (!r.loaded || r.width <= 0 || r.height <= 0) halt('format_missing_images', 'An image is not loaded');
      const url = asset(r.src);
      const evidence = bindings.find(b => b.observed_url === url && fresh(b.checked_at) && b.inspected === true);
      if (!evidence || !s.baseline.images.some(b => b.sha256 === evidence.reference_sha256)) halt('readback_mismatch', 'Image was not independently associated with the frozen Word');
      if (!(evidence.reference_width > 0 && evidence.reference_height > 0) || Math.abs((r.width / r.height) / (evidence.reference_width / evidence.reference_height) - 1) > 0.02) halt('readback_mismatch', 'Image aspect ratio differs from the inspected frozen image');
      return {reference_sha256: evidence.reference_sha256, observed_url: url, after_paragraph: r.after_paragraph};
    });
    // Preserve full image sequence and Word-title-index-0 anchors.
    let cursor = 0;
    for (const item of result) {
      while (allowMissing && cursor < s.baseline.images.length && s.baseline.images[cursor].sha256 !== item.reference_sha256) cursor++;
      const expected = s.baseline.images[cursor++];
      if (!expected || expected.sha256 !== item.reference_sha256 || expected.after_paragraph !== item.after_paragraph) halt('readback_mismatch', 'Image order/anchor mismatch');
    }
    if (!allowMissing && result.length !== s.baseline.images.length) halt('format_missing_images', 'Missing image');
    return result;
  }
  async function saved(s, tab) {
    await assertNoLivePending(s, tab); await account(s, tab);
    const indicator = locate(tab, s.ui.saved), count = await indicator.count();
    if (count === 0) halt('import_pending', 'Save indicator has not appeared');
    if (count !== 1) halt('readback_mismatch', 'Save indicator must resolve exactly once');
    if (!await indicator.isVisible()) halt('import_pending', 'Save indicator not visible');
    const label = await indicator.innerText();
    if (!s.ui.saved.allowed_texts?.includes(label.trim())) halt('import_pending', 'No exact observed saved indicator');
  }
  async function verify(s, {inspectedBindings, coverInspection}) {
    return exclusive(s, async () => {
      s.diagnostic_stage='draft_readback';
      if (s.editor_urls.length !== 1 || !s.editorTab || !s.attempt_id) halt('result_unknown');
      const url = s.editor_urls[0];
      let reopened = s.reopenedTab;
      if (!reopened) {
        if (editorUrl(s.platform, await s.editorTab.url()) !== url) halt('readback_mismatch');
        await saved(s, s.editorTab);
        s.saved_at ||= now(); record(s, 'saved_indicator_observed', {draft_url: url});
        if (s.consumed_at && Date.parse(s.saved_at) < Date.parse(s.consumed_at)) halt('readback_mismatch');
        // The private exit and independent navigation happen only once. Later
        // verify calls observe the same reopened page if its save UI was delayed.
        if(s.ui.saveExit&&!s.save_exit_attempted){s.save_exit_attempted=true;await account(s,s.editorTab);await click(s,s.editorTab,s.ui.saveExit);record(s,'save_exit_clicked',{draft_url:url});}
        reopened = await browser.tabs.new(); s.reopenedTab = reopened;
        await reopened.goto(url); s.reopened_at = now();
      }
      if (await reopened.url() !== url || reopened.id === s.editorTab.id) halt('readback_mismatch');
      await saved(s, reopened);
      for (const binding of [s.ui.title, s.ui.body]) {
        const count = await locate(reopened, binding).count();
        if (count === 0) halt('import_pending', 'Reopened draft editor has not appeared');
        if (count !== 1) halt('readback_mismatch', 'Reopened editor binding must resolve exactly once');
      }
      const observed = await read(s, reopened);
      if (!observed.rows.length && !observed.captions.some(Boolean)) halt('import_pending', 'Reopened draft body has not loaded');
      const analysis = bodyAnalysis(s, observed);
      if (analysis.duplicateTitle || analysis.numbering.length) halt('format_missing_images');
      if (analysis.images.length === s.baseline.images.length && analysis.images.some(r => !r.loaded || r.width <= 0 || r.height <= 0)) halt('import_pending', 'Reopened draft images are still loading');
      const images = imageMap(s, analysis.images, inspectedBindings);
      let cover;
      if (s.platform === 'zhihu') {
        const image = await (await one(reopened, s.ui.coverImage)).evaluate(el => ({src: el.currentSrc || el.src, loaded: el.complete && el.naturalWidth > 0}));
        if (!image.loaded || coverInspection?.inspected !== true || !fresh(coverInspection.checked_at) || coverInspection.observed_url !== asset(image.src) || !s.baseline.images.some(r => r.sha256 === coverInspection.reference_sha256)) halt('readback_mismatch', 'Independent cover readback not proven');
        cover = {loaded: true, reference_sha256: coverInspection.reference_sha256, observed_url: asset(image.src)};
      }
      const readback = {verification_method: 'agent_readback', word_sha256: s.word_sha256, target_account: s.target_account,
        draft_url: url, independently_reopened: true, saved_indicator_observed: true, images_loaded: true,
        title: observed.title, paragraphs: observed.rows.filter(r => r.kind === 'paragraph').map(r => r.text), images,
        ...(cover ? {cover} : {}), saved_at: s.saved_at, reopened_at: s.reopened_at, read_at: now()};
      if (!(Date.parse(readback.saved_at) <= Date.parse(readback.reopened_at) && Date.parse(readback.reopened_at) <= Date.parse(readback.read_at))) halt('readback_mismatch');
      s.readback = readback; s.phase = 'verified_bridge'; record(s, 'independent_readback_verified', {draft_url: url});
      return request(s, 'record_article_upload', {attempt_id: s.attempt_id, state: 'verified', editor_url: url, readback});
    });
  }
  async function acceptVerified(s, response) {
    return exclusive(s, async () => {
      if (s.pending !== 'record_article_upload' || s.phase !== 'verified_bridge' || response.recorded !== true || response.attempt?.state !== 'verified' || response.attempt?.attempt_id !== s.attempt_id) halt('lease_lost');
      s.pending = null; s.phase = 'complete_bridge';
      const r = s.readback;
      // Legacy completion input uses its narrower schema; full receipt is ledger-owned.
      const readback = {verification_method: r.verification_method, word_sha256: r.word_sha256, title: r.title, paragraphs: r.paragraphs, images: r.images, read_at: r.read_at};
      return request(s, s.platform === 'toutiao' ? 'record_article_status' : 'record_article_delivery', {state: s.platform === 'toutiao' ? 'completed' : 'saved', draft_url: r.draft_url, readback});
    });
  }
  async function acceptCompleted(s, response) {
    return exclusive(s, async () => {
      if (s.phase !== 'complete_bridge' || response.state !== (s.platform === 'toutiao' ? 'completed' : 'saved')) halt('lease_lost');
      s.pending = null; s.phase = 'done'; record(s, 'completed');
      return {status: 'done', readback: clone(s.readback), checkpoint: checkpoint(s)};
    });
  }
  return {runtime_version:'native_file_picker_v1',native_protocol_version:2,createSession,resumeNative,settleNative,
    preflight:guardNative(preflight),acceptReserve:guardNative(acceptReserve),acceptConsume:guardNative(acceptConsume),submitAfterSaving:guardNative(submitAfterSaving),observe:guardNative(observe),
    acceptObserved:guardNative(acceptObserved),bindRecovery:guardNative(bindRecovery),reconcileExisting:guardNative(reconcileExisting),recoverBrowser:guardNative(recoverBrowser),repairParagraph:guardNative(repairParagraph),repairMissingImage:guardNative(repairMissingImage),setZhihuCover:guardNative(setZhihuCover),
    loadImages:guardNative(loadImages),verify:guardNative(verify),acceptVerified:guardNative(acceptVerified),acceptCompleted:guardNative(acceptCompleted),checkpoint,cancel,diagnosticRequest,diagnostic,recoveryRules:clone(rules)};
}
