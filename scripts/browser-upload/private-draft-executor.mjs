/** First-import program: passive DOM reads, bridge permits, real native input. */
const copy = value => JSON.parse(JSON.stringify(value));
const safeCopy = value => { try { return copy(value); } catch { return null; } };
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const bounded = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
const absolute = value => typeof value === 'string' && value.startsWith('/') && value.length <= 1024 && !value.split('/').includes('..') && !/[\u0000-\u001f\u007f]/.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positiveSize = value => Number.isSafeInteger(value) && value > 0;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const pick = (value, fields) => Object.fromEntries(fields.map(key => [key,value[key]]));
const same = (value, reference, fields = Object.keys(reference)) => object(value) && fields.every(key => value[key] === reference[key]);
const only = (value, fields) => object(value) && Object.keys(value).every(key => fields.includes(key));
const dangerous = /发布|发表|定时|删除|Publish|Schedule|Delete/i;
function observedLocator(tab,binding) {
  if (!binding?.observed_at || !binding.observed_url) throw Error('Observed UI binding required');
  const p = tab.playwright;
  if (binding.css) return p.locator(binding.css);
  if (binding.role) return p.getByRole(binding.role,{name:binding.name,exact:true});
  if (binding.text) return p.getByText(binding.text,{exact:true});
  if (binding.placeholder) return p.getByPlaceholder(binding.placeholder,{exact:true});
  throw Error('Unsupported UI binding');
}
const controlIdentity = control => control.evaluate(el => ({tag:el.tagName,type:el.getAttribute('type'),aria_label:el.getAttribute('aria-label'),title:el.getAttribute('title')}));
const controlLabels = control => Promise.all([control.innerText(),control.getAttribute('aria-label'),control.getAttribute('title')]);
const diagnostics = new WeakMap();
const diagnosticCopy = subject => diagnostics.has(subject) ? {...diagnostics.get(subject)} : null;

export function inspectObservedDraftJs(el,profile) {
  const rows = [], captions = [];
  let index = 0, first = true, placeholderCount = 0;
  const generic = profile.generic === true;
  const chrome = n => n.nodeType === 1 && profile.chrome_css && n.matches(profile.chrome_css) &&
    (n.matches('templ,a.editor-image-menu-item') || n.matches('span.syl-placeholder.ProseMirror-widget[ignoreel="true"][contenteditable="false"]') && !n.children.length && n.textContent === '请输入正文');
  if (generic) captions.push(...[...el.querySelectorAll('figcaption,textarea,input,[data-caption],[contenteditable="true"][role="textbox"]')].map(n => ('value' in n ? n.value : n.textContent || '').trim()));
  const block = 'div.Editable-unstyled[data-block="true"],h2.Editable-styled[data-block="true"]';
  const figure = 'figure.Editable-styled[data-block="true"][contenteditable="false"]';
  const unknown = text => rows.push({kind:'unclassified_text',text:text || 'Unsupported Draft.js structure'});
  const inline = node => node.nodeType !== 1 || (['SPAN','B','I','STRONG','EM','U','S','A','CODE','BR'].includes(node.tagName) || node.tagName === 'DIV' && String(node.className).split(/\s+/).includes('public-DraftStyleDefault-block')) && [...node.childNodes].every(inline);
  if (!generic && !el.matches('div.public-DraftEditor-content[contenteditable="true"][role="textbox"]') || !Array.isArray(profile.frozen_paragraphs)) {
    unknown(); return {rows,captions,placeholderCount};
  }
  const textBlock = node => {
    if (generic) {
      const nested = [];
      const content = n => {
        if (n.nodeType === 3) return n.textContent;
        if (n.nodeType !== 1 || chrome(n)) return '';
        if (n.matches('img,figure,ol,ul,p,input,textarea')) { nested.push(n); return ''; }
        return [...n.childNodes].map(content).join('');
      };
      const text = [...node.childNodes].map(content).join('').trim();
      if (text) rows.push({kind:'paragraph',text,tag:node.tagName,list:node.parentElement?.tagName === 'OL'});
      for (const child of nested) walk(child);
      return;
    }
    if (![...node.childNodes].every(inline)) { unknown(node.textContent); return; }
    const raw = node.textContent.trim(); if (!raw) return;
    if (first && raw === profile.frozen_title) {
      rows.push({kind:'paragraph',text:raw,tag:node.tagName,list:false}); first = false; return;
    }
    first = false;
    for (let cursor = 0; cursor < raw.length;) {
      const expected = profile.frozen_paragraphs[index];
      if (!expected || raw.slice(cursor,cursor + expected.length) !== expected) { unknown(raw.slice(cursor)); return; }
      rows.push({kind:'paragraph',text:expected,tag:node.tagName,list:false}); cursor += expected.length; index++;
      if (cursor === raw.length) break;
      if (!/[\r\n]/.test(raw[cursor])) { unknown(raw.slice(cursor)); return; }
      while (raw[cursor] === '\r' || raw[cursor] === '\n') cursor++;
    }
  };
  const walk = (node,owner = null) => {
    if (node.nodeType === 3) { if (node.textContent.trim()) unknown(node.textContent); return; }
    if (node.nodeType !== 1) return;
    if (generic && chrome(node)) return;
    if (!owner && node.matches(generic ? 'p,h1,h2,h3,h4,h5,h6,li' : block)) { textBlock(node); return; }
    if (node.tagName === 'IMG') {
      if (!generic && !owner || !node.matches(profile.image_css)) unknown();
      else rows.push({kind:'image',src:node.currentSrc || node.src,loaded:node.complete && node.naturalWidth > 0,width:node.naturalWidth,height:node.naturalHeight});
      return;
    }
    if (!generic && owner && node.tagName === 'FIGCAPTION') {
      const text = node.textContent.trim(), safe = [...node.childNodes].every(inline);
      const names = String(node.className).split(/\s+/);
      if (safe && names.includes('Image-caption') && names.includes('Image-captionV2') && names.includes('is-placeholder') && text === '添加图片注释，不超过 140 字（可选）' && node.closest(figure) === owner) {
        captions.push(''); placeholderCount++; return;
      }
      captions.push(text); if (text || !safe) unknown(text);
      if (!safe) for (const child of node.childNodes) walk(child,owner);
      return;
    }
    if (['INPUT','TEXTAREA'].includes(node.tagName)) {
      const value = node.value?.trim() || ''; captions.push(value);
      if (value || !owner) unknown(value); return;
    }
    if (!owner && node.matches(figure)) owner = node;
    else if (!generic && !owner && node !== el && !(node.parentElement === el && node.tagName === 'DIV' && !node.getAttribute('data-block') && !node.className)) { unknown(node.textContent); return; }
    for (const child of node.childNodes) walk(child,owner);
  };
  walk(el);
  if (!generic && index && index !== profile.frozen_paragraphs.length) unknown();
  return {rows,captions,placeholderCount};
}

export function createZhihuAccountReader({verificationTab,menu,accountLink,now = () => new Date().toISOString(),waitForReadiness,readinessTimeoutMs = 5000,readinessIntervalMs = 100,readinessMaxChecks = 20}) {
  const home = 'https://www.zhihu.com/', bindings = freeze(copy({menu,accountLink}));
  const valid = (n,max) => Number.isSafeInteger(n) && n > 0 && n <= max;
  if (!valid(readinessTimeoutMs,15000) || !valid(readinessIntervalMs,1000) || !valid(readinessMaxChecks,100) || waitForReadiness !== undefined && typeof waitForReadiness !== 'function') throw Error('Invalid bounded account readiness configuration');
  const wait = waitForReadiness || (typeof setTimeout === 'function' ? ms => new Promise(resolve => setTimeout(resolve,ms)) : null);
  return {diagnostic:diagnosticCopy, async inspect(context) {
    try {
      if (!verificationTab || verificationTab.id === context.tab_id || context.platform !== 'zhihu' || [bindings.menu,bindings.accountLink].some(b => b?.observed_url !== home)) throw Error('Independent account tab required');
      const read_started_at = now(), deadline = Date.parse(read_started_at) + readinessTimeoutMs;
      if (!Number.isFinite(deadline)) throw Error('Invalid clock');
      const page = async () => {
        if (await verificationTab.url() !== home || /请先登录|登录后继续|Sign in to continue|验证码|滑块验证|Verify you are human|人机验证|approval required|需要授权|权限不足/.test(await verificationTab.playwright.domSnapshot())) throw Error('Account page blocked');
      };
      const ready = async (control,enabled) => {
        let waited = false;
        for (let check = 0; check < readinessMaxChecks; check++) {
          await page();
          const remaining = deadline - Date.parse(now()), count = await control.count();
          if (!(remaining > 0) || !Number.isSafeInteger(count) || count < 0 || count > 1) throw Error('Account control unavailable');
          if (count === 1 && await control.isVisible() === true && (!enabled || await control.isEnabled() === true)) return;
          if (check + 1 === readinessMaxChecks) break;
          if (wait) {
            const waiting = wait(Math.min(readinessIntervalMs,remaining));
            if (!waiting || typeof waiting.then !== 'function') throw Error('Awaitable wait required');
            await waiting;
          } else {
            if (waited || typeof control.waitFor !== 'function') break;
            waited = true; await control.waitFor({state:'visible',timeoutMs:Math.floor(remaining)});
          }
        }
        throw Error('Account control unavailable');
      };
      await verificationTab.goto(home);
      const control = observedLocator(verificationTab,bindings.menu); await ready(control,true);
      const labels = await controlLabels(control);
      if (/发布|发表|定时|删除|退出|登出|切换|Publish|Schedule|Delete|Log out|Sign out|Switch/i.test([...labels,bindings.menu.name,bindings.menu.text].join(' '))) throw Error('Unsafe account menu');
      const identity = await controlIdentity(control);
      if (!object(bindings.menu.identity) || !Object.keys(bindings.menu.identity).length || !same(identity,bindings.menu.identity) || await control.count() !== 1 || await control.isVisible() !== true || await control.isEnabled() !== true) throw Error('Account control changed');
      await page(); if (!(Date.parse(now()) < deadline)) throw Error('Account menu timed out');
      await control.click(); const link = observedLocator(verificationTab,bindings.accountLink); await ready(link,false);
      const profile_href = await link.getAttribute('href'); await page();
      return {...context,source:'fresh_account_menu',verification_tab_id:verificationTab.id,verification_url:home,authenticated_account_menu:true,profile_href,read_started_at,checked_at:now()};
    } catch {
      const error = Error('Account read unavailable');
      diagnostics.set(error,{version:1,source:'account_reader',kind:'account_read_failure',summary:error.message,failed_at:now()});
      throw error;
    }
  }};
}

export function createPrivateDraftExecutor({browser, nativeFilePicker, accountReader, now = () => new Date().toISOString()}) {
  const runtimeVersion = createPrivateDraftExecutor.runtimeVersion || '2026-10-10-private-draft-executor-8';
  const accounts = {toutiao:'61556093362',zhihu:'ren-zhe-ai-chi-yu-52'};
  const defaults = {toutiao:{mode:'browser',method:'codex'},zhihu:{mode:'native',method:'coordinate'}};
  const coordinateContract = 'screenshot-single-click-open-v1';
  const delivery = s => s.platform === 'toutiao' ? ['record_article_status','toutiao_saving','completed'] : ['record_article_delivery','saving','saved'];
  const expect = (s,phase,operation) => { if (s.phase !== phase || s.pending !== operation) halt('lease_lost'); };
  const sessions = new WeakMap(), known = new Map(), active = new Set(), usedHandles = new Set();
  const scopeFields = ['article_id','platform','target_account','browser_session','executor_id','tab_id','editor_url','purpose'];
  const taskFields = ['article_id','platform','target_account','browser_session','executor_id'];
  const wordFields = ['word_sha256','word_size'];
  const nativeKeys = ['request_id','request_version','method'];
  const envelopeFields = ['runtimeVersion',...nativeKeys,'actions_settled','observed_at','receipt'];
  const requestFields = ['status','runtimeVersion',...nativeKeys,'actions_settled','observed_at','checked_at','window_handle',...scopeFields];
  const receiptFields = [...scopeFields,'window_handle','checked_at','ready','window_count','files_selected','submitted','window_closed'];
  const closedFields = [...scopeFields,'window_handle','checked_at','window_closed','window_count','submitted','all_open_file_windows'];
  const rules = {login:['stop_for_signin'],captcha:['stop_for_confirmation'],permission_approval:['stop_for_confirmation'],account_read_failure:['stop_retain_evidence'],picker_failure:['retain_evidence_stop'],submission_unknown:['observe_same_page_readonly'],platform_import_failure:['retain_attempt_stop'],import_pending:['observe_same_page'],result_unknown:['observe_same_page_readonly'],readback_mismatch:['stop_preserve_evidence'],format_missing_images:['stop_preserve_evidence'],duplicate_draft:['report_all_urls_readonly'],lease_lost:['retain_attempt_stop'],cancelled:['stop_retain_fence'],unsupported_recovery:['read_only_use_separately_supported_workflow']};
  const epoch = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let chooserOwner = null, nativeSerial = 0, accountSerial = 0;
  class Halt extends Error { constructor(kind) { super(kind); this.kind = kind; } }
  const halt = kind => { throw new Halt(kind); };
  const state = session => { const value = sessions.get(session); if (!value) halt('permission_approval'); return value; };
  const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const fresh = (value, age = 15 * 60000) => time(value) && time(now()) && Date.parse(value) <= Date.parse(now()) && Date.parse(now()) - Date.parse(value) <= age;
  const fence = s => { s.grant = false; s.readonly_fenced = true; s.document_imported = false; };
  const nativeBusy = s => s.nativePending || s.nativeInFlight || s.nativeUnknown;
  const pickerReady = s => chooserOwner === s && (s.picker_mode === 'native' ? !!s.nativePicker : typeof s.chooser?.setFiles === 'function');
  const references = (s,sha) => s.baseline.images.some(i => i.sha256 === sha);
  const imageShape = (s,images) => {
    if (images.length !== s.baseline.images.length) halt('format_missing_images');
    if (images.some((r,i) => r.after_paragraph !== s.baseline.images[i].after_paragraph)) halt('readback_mismatch');
  };
  const live = s => { if (s.cancelled) halt('cancelled'); if (s.unsupported) halt('unsupported_recovery'); if (s.blocked) halt(s.blocked); };
  const record = (s,event,data = {}) => { s.events.push({at:now(),event,...data}); };
  const url = (value,base,kind) => {
    let parsed; try { parsed = new URL(value,base); } catch { halt(kind); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) halt(kind);
    return parsed;
  };
  const asset = value => { const u = url(value,undefined,'readback_mismatch'); u.search = ''; u.hash = ''; return u.href; };
  const blankUrl = platform => platform === 'toutiao' ? 'https://mp.toutiao.com/profile_v4/graphic/publish' : 'https://zhuanlan.zhihu.com/write';
  const editorUrl = (platform,value) => {
    const u = url(value,undefined,'result_unknown');
    if (u.hash) halt('result_unknown');
    if (platform === 'toutiao' && u.hostname === 'mp.toutiao.com' && u.pathname === '/profile_v4/graphic/publish' && [...u.searchParams.keys()].length === 1 && /^\d+$/.test(u.searchParams.get('pgc_id') || '')) return u.href;
    if (platform === 'zhihu' && u.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d+\/edit$/.test(u.pathname) && !u.search) return u.href;
    return null;
  };
  const checkpointState = s => ({version:1,...pick(s,['article_id','platform','target_account','word_sha256','phase','submitted','readonly_fenced']),attempt_id:s.attempt_id || null,diagnostic_stage:s.stage || null,failure_kind:s.blocked || null,submission_started_at:s.submission_started_at || null,submission_returned_at:s.submission_returned_at || null,editor_urls:[...s.editor_urls],previous_editor_urls:[],saved_at:s.saved_at || null,events:copy(s.events)});
  const checkpoint = session => checkpointState(state(session));
  const result = (s,status,fields = {}) => ({status,...fields,checkpoint:checkpointState(s)});
  const refusal = s => result(s,'blocked',{kind:'picker_failure',recovery:rules.picker_failure});
  const releaseChooser = s => {
    if (nativeBusy(s) || s.nativePicker && !s.nativePicker.submitted || s.chooserWaiting || s.browserInFlight || s.browserUnknown) return;
    s.chooser = null; s.nativePicker = null;
    if (chooserOwner === s) chooserOwner = null;
  };
  const request = (s,operation,args) => {
    live(s); s.pending = operation; record(s,'bridge_request',{operation});
    return {status:'bridge_required',operation,picker_mode:s.picker_mode,...(s.upload_method ? {upload_method:s.upload_method} : {}),args:{article_id:s.article_id,...(operation === 'record_article_status' ? {} : {platform:s.platform}),...args},checkpoint:checkpointState(s)};
  };
  async function exclusive(session, work, readonly = false) {
    const s = state(session);
    if (active.has(s.key)) return result(s,'blocked',{kind:'result_unknown'});
    if (nativeBusy(s)) return refusal(s);
    active.add(s.key);
    try {
      if (readonly) { if (s.cancelled || s.unsupported) live(s); }
      else live(s);
      return await work(s);
    } catch (error) {
      const kind = error instanceof Halt ? error.kind : s.stage === 'file_submission' ? 'submission_unknown' : s.stage === 'chooser_wait' ? 'picker_failure' : 'result_unknown';
      const cause = kind === 'permission_approval' ? 'permission_denied' : kind === 'platform_import_failure' ? 'platform_rejected' : 'unknown';
      s.grant = false;
      diagnostics.set(session,{version:1,source:'draft_runtime',stage:s.stage || null,substep:s.substep || 'runtime_operation',kind,error_name:'Error',summary:'Upload operation failed.',failed_at:now()});
      if (kind === 'import_pending') { s.phase = 'import_pending'; record(s,'waiting',{kind,stage:s.stage || null}); return result(s,'waiting',{kind,recovery:rules[kind]}); }
      s.blocked = kind; fence(s);
      record(s,'blocked',{kind,cause,stage:s.stage || null}); releaseChooser(s);
      return result(s,'blocked',{kind,recovery:rules[kind]});
    } finally { active.delete(s.key); }
  }
  function createSession(input) {
    if (!input || !accounts[input.platform] || input.target_account !== accounts[input.platform]) halt('login');
    if (![input.article_id,input.browser_session,input.executor_id].every(bounded) || !hash(input.word_sha256) || !positiveSize(input.word_size) || input.word_size > 20000000) halt('readback_mismatch');
    const route = defaults[input.platform], mode = input.picker_mode === undefined ? route.mode : input.picker_mode;
    const method = input.upload_method === undefined ? input.picker_mode === undefined ? route.method : null : input.upload_method;
    if (!['browser','native'].includes(mode) || input.upload_method !== undefined && (method !== route.method || mode !== route.mode)) halt('picker_failure');
    const baseline = copy(input.baseline), ui = copy(input.ui);
    if (!baseline?.title || !Array.isArray(baseline.paragraphs) || !baseline.paragraphs.length || baseline.paragraphs.some(p => typeof p !== 'string' || !p) || !Array.isArray(baseline.images) || baseline.images.some(i => !hash(i.sha256) || !Number.isSafeInteger(i.after_paragraph) || i.after_paragraph < 0 || i.after_paragraph > baseline.paragraphs.length) || new Set(baseline.images.map(i => i.sha256)).size !== baseline.images.length) halt('readback_mismatch');
    const key = `${input.article_id}:${input.platform}`, importMode = input.import_mode || 'new_import';
    const unsupported = !!input.checkpoint || !['new_import','owner_confirmed_first_import'].includes(importMode) || !!input.reimport;
    const scope = pick(input,[...taskFields,...wordFields]);
    const identity = JSON.stringify({scope,mode,method,baseline,ui,importMode,unsupported});
    if (known.has(key)) {
      const existing = known.get(key); if (state(existing).identity !== identity) halt('permission_approval'); return existing;
    }
    if (importMode === 'owner_confirmed_first_import' && !bounded(input.owner_confirmation_reference)) halt('permission_approval');
    const s = {...scope,key,identity,picker_mode:mode,upload_method:method,import_mode:importMode,baseline:freeze(baseline),ui:freeze(ui),owned_new_draft:input.owned_new_draft === true,phase:unsupported ? 'reconcile' : 'preflight',unsupported,readonly_fenced:unsupported,events:[],editor_urls:[],submitted:unsupported,cancelled:false,blocked:null,grant:false};
    const session = {};
    for (const field of [...taskFields,...wordFields,'picker_mode','upload_method','import_mode','baseline','ui','phase','grant','file','attempt_id','pending','submitted','cancelled','blocked','readonly_fenced','submission_started_at','submission_returned_at']) Object.defineProperty(session,field,{enumerable:field !== 'grant',get:() => s[field]});
    sessions.set(session,s); known.set(key,session); return Object.freeze(session);
  }
  const locate = (tab,binding) => {
    if (dangerous.test([binding?.name,binding?.text,binding?.placeholder].join(' '))) halt('permission_approval');
    return observedLocator(tab,binding);
  };
  const one = async (tab,binding) => { const l = locate(tab,binding); if (await l.count() !== 1) halt('result_unknown'); return l; };
  async function blockers(tab, prohibitPending = false) {
    const visible = await tab.playwright.domSnapshot();
    if (/验证码|滑块验证|Verify you are human|人机验证/.test(visible)) halt('captcha');
    if (/ERR_BLOCKED_BY_ADMINISTRATOR|Permission denied|approval required|需要授权|权限不足/.test(visible)) halt('permission_approval');
    if (/请先登录|登录后继续|Sign in to continue/.test(visible)) halt('login');
    if (prohibitPending && /文档导入中|正在导入|Importing/.test(visible)) halt('import_pending');
    if (/导入失败|不支持的文件|文件格式错误|保存失败|未能保存|无法保存(?:草稿|文档)|Import failed|Save failed|Failed to save/i.test(visible)) halt('platform_import_failure');
    return visible;
  }
  async function account(s,tab) {
    s.substep = 'account_scope';
    const l = locate(tab,s.ui.account), count = await l.count();
    const visible = count === 1 && (s.platform !== 'zhihu' || await l.isVisible() === true);
    if ((count === 0 || count === 1 && !visible) && s.platform === 'zhihu' && accountReader) {
      if (typeof accountReader.inspect !== 'function' || !bounded(tab.id)) halt('account_read_failure');
      const context = {...pick(s,taskFields),tab_id:tab.id,editor_url:await tab.url(),purpose:'account_identity',request_id:`account-${++accountSerial}`,requested_at:now()};
      let observed; try { observed = safeCopy(await accountReader.inspect(freeze(copy(context)))); } catch { halt('account_read_failure'); }
      const allowed = [...Object.keys(context),'source','verification_tab_id','verification_url','authenticated_account_menu','profile_href','read_started_at','checked_at'];
      if (!only(observed,allowed) || !same(observed,context) || await tab.url() !== context.editor_url || observed.source !== 'fresh_account_menu' || observed.authenticated_account_menu !== true || !bounded(observed.verification_tab_id) || observed.verification_tab_id === tab.id || observed.verification_url !== 'https://www.zhihu.com/' || !fresh(observed.checked_at,60000) || !time(observed.read_started_at) || Date.parse(observed.read_started_at) < Date.parse(context.requested_at) || Date.parse(observed.checked_at) < Date.parse(observed.read_started_at)) halt('account_read_failure');
      const profile = url(observed.profile_href,'https://www.zhihu.com','login');
      if (profile.hostname !== 'www.zhihu.com' || profile.search || profile.hash || profile.pathname.match(/^\/people\/([^/]+)\/?$/)?.[1] !== accounts.zhihu) halt('login');
      return;
    }
    if (count !== 1 || !visible) halt('account_read_failure');
    let value = s.ui.account.attribute ? await l.getAttribute(s.ui.account.attribute) : await l.innerText();
    const encoding = s.ui.account.encoding;
    if (encoding) {
      const profile = url(value,s.platform === 'toutiao' ? 'https://www.toutiao.com' : 'https://www.zhihu.com','login');
      if (profile.hash || profile.search && (encoding !== 'toutiao_profile_href' || profile.search !== '?enter_from=mp_profile')) halt('login');
      if (encoding === 'toutiao_profile_href') value = profile.hostname === 'www.toutiao.com' ? profile.pathname.match(/^\/c\/user\/(\d+)\/$/)?.[1] : null;
      else if (encoding === 'zhihu_profile_href') value = profile.hostname === 'www.zhihu.com' ? profile.pathname.match(/^\/people\/([^/]+)\/?$/)?.[1] : null;
      else halt('login');
    }
    if (value !== accounts[s.platform]) halt('login');
  }
  async function read(s,tab) {
    await blockers(tab); await account(s,tab);
    const title = await (await one(tab,s.ui.title)).evaluate(el => 'value' in el ? el.value : el.textContent);
    if (!s.ui.body.image_css) halt('readback_mismatch');
    const generic = s.ui.body.dom_kind !== 'zhihu_draftjs_v1';
    if (!generic && s.platform !== 'zhihu') halt('readback_mismatch');
    const {rows,captions} = await (await one(tab,s.ui.body)).evaluate(inspectObservedDraftJs,{
      generic,image_css:s.ui.body.image_css,chrome_css:s.ui.body.chrome_css || null,
      frozen_title:s.baseline.title,frozen_paragraphs:s.baseline.paragraphs
    });
    return {title,rows,captions,url:await tab.url()};
  }
  function bodyAnalysis(s,observed) {
    if (!Array.isArray(observed.rows) || observed.rows.some(r => !['paragraph','image'].includes(r.kind)) || !Array.isArray(observed.captions) || observed.captions.some(text => text !== '') || observed.title !== s.baseline.title) halt('readback_mismatch');
    const paragraphs = observed.rows.filter(r => r.kind === 'paragraph'), duplicateTitle = paragraphs[0]?.text === s.baseline.title;
    const body = paragraphs.slice(Number(duplicateTitle)), numbering = [];
    if (body.length !== s.baseline.paragraphs.length || body.some((r,i) => {
      const expected = s.baseline.paragraphs[i];
      if (r.text === expected) { if (/^\d+[.、．]\s*/.test(expected) && r.list) numbering.push(i); return false; }
      if (r.list && expected.replace(/^\d+[.、．]\s*/,'') === r.text && expected !== r.text) { numbering.push(i); return false; }
      return true;
    })) halt('readback_mismatch');
    let count = 0; const images = [];
    for (const row of observed.rows) { if (row.kind === 'paragraph') count++; else images.push({...row,after_paragraph:Math.max(0,count - Number(duplicateTitle))}); }
    return {duplicateTitle,numbering,images};
  }
  async function safeControl(s,tab,binding) {
    live(s); await blockers(tab,true);
    if (!fresh(binding?.observed_at) || binding.observed_url !== await tab.url()) halt('permission_approval');
    const l = await one(tab,binding);
    if (await l.isVisible() !== true || await l.isEnabled() !== true) halt('result_unknown');
    const [label,aria,title] = await controlLabels(l);
    if (dangerous.test([label,aria,title].filter(Boolean).join(' '))) halt('permission_approval');
    const identity = await controlIdentity(l);
    if (!object(binding.identity) || !Object.keys(binding.identity).length || !same(identity,binding.identity) || identity.type !== 'file' && ![label,aria,title].some(v => v?.trim())) halt('permission_approval');
    live(s); if (await tab.url() !== binding.observed_url || await l.count() !== 1 || await l.isVisible() !== true || await l.isEnabled() !== true) halt('permission_approval');
    return l;
  }
  async function click(s,tab,binding) { const l = await safeControl(s,tab,binding); live(s); await l.click(); return tab.playwright.domSnapshot(); }
  function capability(s) {
    if (typeof browser?.tabs?.new !== 'function') halt('picker_failure');
    if (s.picker_mode === 'native') {
      if (!nativeFilePicker || s.upload_method === 'coordinate' && nativeFilePicker.coordinate_contract !== coordinateContract || ['prepare','inspect','submit'].some(name => typeof nativeFilePicker[name] !== 'function')) halt('picker_failure');
    } else if (typeof s.editorTab?.playwright?.waitForEvent !== 'function') halt('picker_failure');
  }
  function namedWord(s,input,prepared = false) {
    if (!input || !absolute(input.absolute_path) || typeof input.filename !== 'string' || !input.filename.endsWith('.docx') || input.absolute_path.split('/').pop() !== input.filename || input.sha256 !== s.word_sha256 || input.size !== s.word_size || input.browser_session !== s.browser_session || !fresh(input.checked_at)) halt('result_unknown');
    const file = pick(input,['filename','absolute_path','sha256','size','browser_session','visible_in_browser','checked_at']);
    if (input.visible_in_browser === true) { if (Object.hasOwn(input,'handoff') || Object.hasOwn(input,'visibility_unproven')) halt('result_unknown'); return file; }
    const h = input.handoff, fields = ['kind','download_path','download_browser_session','executor_id','source_sha256','source_size','verified_in_cua','copied_in_same_executor','chooser_prepared','chooser_prepared_at'];
    if (input.visible_in_browser !== false || input.visibility_unproven !== true || !only(h,fields) || h.kind !== 'same_browser_download' || !absolute(h.download_path) || h.download_browser_session !== s.browser_session || h.executor_id !== s.executor_id || h.source_sha256 !== input.sha256 || h.source_size !== input.size || h.verified_in_cua !== true || h.copied_in_same_executor !== true) halt('result_unknown');
    if (prepared && (h.chooser_prepared !== true || !fresh(h.chooser_prepared_at) || Date.parse(h.chooser_prepared_at) + 60000 < Date.parse(input.checked_at))) halt('picker_failure');
    return {...file,visibility_unproven:true,handoff:Object.fromEntries(fields.filter(k => prepared || !k.startsWith('chooser_')).map(k => [k,h[k]]))};
  }
  function approvedWord(s) {
    if (!s.file) halt('readback_mismatch');
    namedWord(s,s.file,true); return s.file;
  }
  async function assertInitial(s) {
    live(s); if (s.readonly_fenced || await s.editorTab.url() !== s.initial_url || s.initial_url !== blankUrl(s.platform)) halt('readback_mismatch');
    await blockers(s.editorTab,true); const observed = await read(s,s.editorTab); await blockers(s.editorTab,true);
    if (observed.url !== s.initial_url || observed.title || observed.rows.length || observed.captions.some(v => v !== '') || await s.editorTab.url() !== s.initial_url) halt('duplicate_draft');
  }
  async function draftMatches(s) {
    await blockers(s.listTab); await account(s,s.listTab);
    const rows = await (await one(s.listTab,s.ui.draftList)).evaluate(el => [...el.querySelectorAll('a[href]')].map(a => ({title:(a.textContent || '').trim(),url:a.href})));
    return [...new Set(rows.filter(r => r.title === s.baseline.title).map(r => editorUrl(s.platform,r.url)).filter(Boolean))];
  }
  async function checkImport(s) {
    await assertInitial(s); await safeControl(s,s.editorTab,s.chooser_binding);
    if ((await draftMatches(s)).length) halt('duplicate_draft');
  }
  function nativeContext(s,binding,purpose) {
    capability(s);
    const editor_url = purpose === 'document' ? s.initial_url : s.editor_urls[0];
    if (!bounded(s.editorTab.id) || !fresh(binding?.observed_at) || binding.observed_url !== editor_url || !object(binding.identity) || !Object.keys(binding.identity).length || dangerous.test([binding.name,binding.text,binding.placeholder,...Object.values(binding.identity)].join(' '))) halt('picker_failure');
    const context = {...pick(s,taskFields),tab_id:s.editorTab.id,editor_url,purpose,binding:copy(binding)};
    if (s.upload_method === 'coordinate') context.coordinate_actions = {
      contract:coordinateContract,document_stages:purpose === 'document' ? copy(s.ui.importStages) : [],
      file_selection:purpose === 'document' ? 'single_click_exact_word' : 'single_click_exact_existing_image',
      confirmation:'single_click_open',settle_after_each_action:true,relocate_on_window_change:true
    };
    return freeze(context);
  }
  const actualTime = (value,started) => fresh(value,60000) && Date.parse(value) >= Date.parse(started);
  function nativeWindow(p,r,closed = false) {
    if (!same(r,p.context,scopeFields) || !actualTime(r.checked_at,p.started_at)) return false;
    if (closed) return r.window_closed === true && r.window_count === 0 && typeof r.submitted === 'boolean';
    return r.ready === true && r.window_count === 1 && r.files_selected === false && r.submitted === false && bounded(r.window_handle) && (p.handle === undefined || r.window_handle === p.handle);
  }
  function nativeEvidence(p,e,closed = false) {
    if (!only(e,envelopeFields) || e.runtimeVersion !== runtimeVersion || !same(e,p,nativeKeys) || e.actions_settled !== true || !actualTime(e.observed_at,p.started_at) || p.observed_at && Date.parse(e.observed_at) < Date.parse(p.observed_at)) return false;
    const r = e.receipt;
    return only(r,closed ? closedFields : receiptFields) && r.checked_at === e.observed_at && same(r,p.context,scopeFields);
  }
  const pendingResult = (s,p) => ({status:'native_pending',request:{runtimeVersion,...pick(p,nativeKeys),...pick(p.context,scopeFields),window_handle:p.handle,observed_at:p.observed_at,actions_settled:true},checkpoint:checkpointState(s)});
  async function nativeInvoke(s,method,context,extra,finish) {
    if (nativeBusy(s)) halt('picker_failure');
    const request_version = ++nativeSerial;
    const p = {request_id:`native-${epoch}-${request_version}`,request_version,method,context,started_at:now(),handle:extra.window_handle,finish};
    s.nativeInFlight = p; s.substep = `native_${method}`;
    let value;
    try { value = await nativeFilePicker[method](freeze({...context,...extra,runtimeVersion,...pick(p,nativeKeys)})); }
    catch (error) { s.nativeUnknown = p; throw error; }
    finally { s.nativeInFlight = null; }
    p.returned_at = now();
    if (method === 'prepare' && bounded(value?.window_handle) && same(value,context,scopeFields)) p.handle = value.window_handle;
    const unknown = kind => { s.nativeUnknown = p; halt(kind); };
    if (s.cancelled || s.blocked) unknown(s.cancelled ? 'cancelled' : s.blocked);
    if (value?.status === 'native_pending') {
      if (!only(value,requestFields) || value.runtimeVersion !== runtimeVersion || !same(value,p,nativeKeys) || value.actions_settled !== true || value.checked_at !== value.observed_at || !actualTime(value.observed_at,p.started_at) || !bounded(value.window_handle) || !same(value,context,scopeFields) || p.handle !== undefined && value.window_handle !== p.handle) unknown('picker_failure');
      p.handle = value.window_handle; p.observed_at = value.observed_at; s.nativePending = p;
      record(s,'native_observation_pending',{method}); return pendingResult(s,p);
    }
    if (method === 'submit' && object(value)) {
      const bad = [['submitted',true],['window_closed',true],['window_count',0]].some(([key,expected]) => Object.hasOwn(value,key) && value[key] !== expected);
      if (bad || value.isError === true || value.success === false || /error|failed|failure|unknown|cancelled|blocked|timeout/i.test(value.status || '')) unknown('submission_unknown');
    }
    if (method !== 'submit' && !actualTime(value?.checked_at,p.started_at)) unknown('picker_failure');
    p.observed_at = value?.checked_at;
    try { return await finish(value,{action_returned_at:p.returned_at,operation:p}); }
    catch (error) { if (method !== 'submit') s.nativeUnknown ||= p; throw error; }
  }
  async function nativeAction(s,method,binding,purpose,file,done) {
    const context = nativeContext(s,binding,purpose), previous = s.nativePicker;
    if (chooserOwner !== s || method !== 'prepare' && (!previous || previous.submitted || JSON.stringify(context) !== JSON.stringify(previous.context))) halt('picker_failure');
    const extra = method === 'prepare' ? {} : {window_handle:previous.handle};
    if (method === 'submit') {
      if (purpose === 'document' && !fresh(s.consumed_at,60000)) halt('lease_lost');
      if (!absolute(file?.absolute_path) || !hash(file.sha256) || !positiveSize(file.size) || !fresh(file.checked_at) || file.browser_session !== s.browser_session) halt('submission_unknown');
      previous.submitted = true; s.nativePicker = null; extra.file = copy(file);
    }
    return nativeInvoke(s,method,context,extra,async (r,meta) => {
      let picker = previous;
      if (method !== 'submit') {
        if (!nativeWindow(meta.operation,r)) halt('picker_failure');
        live(s); if (chooserOwner !== s) halt('picker_failure');
        if (method === 'prepare') {
          if (usedHandles.has(r.window_handle)) halt('picker_failure');
          usedHandles.add(r.window_handle); picker = {context,handle:r.window_handle,submitted:false};
          s.nativePicker = picker; record(s,'native_filechooser_ready');
        } else if (s.nativePicker !== previous) halt('picker_failure');
        picker.observed_at = r.checked_at; picker.operation = meta.operation;
      }
      return done(method === 'submit' ? r : picker,meta);
    });
  }
  const nativePrepare = (s,binding,purpose,done) => nativeAction(s,'prepare',binding,purpose,null,done);
  const nativeInspect = (s,binding,purpose,done) => nativeAction(s,'inspect',binding,purpose,null,done);
  const nativeSubmit = (s,picker,file,done) => {
    if (s.nativePicker !== picker || picker.submitted) halt('submission_unknown');
    return nativeAction(s,'submit',picker.context.binding,picker.context.purpose,file,done);
  };
  async function resumeNative(session,e) {
    e = safeCopy(e);
    const s = state(session), p = s.nativePending;
    if (!p || s.cancelled || s.blocked || s.unsupported || s.readonly_fenced || active.has(s.key) || !nativeEvidence(p,e) || e.receipt.window_handle !== p.handle || (p.method === 'submit' ? !nativeWindow(p,e.receipt,true) || e.receipt.submitted !== true : !nativeWindow(p,e.receipt))) return refusal(s);
    active.add(s.key);
    try {
      const context = nativeContext(s,p.context.binding,p.context.purpose), url = await s.editorTab.url();
      if (chooserOwner !== s || JSON.stringify(context) !== JSON.stringify(p.context) || url !== p.context.editor_url && !(p.method === 'submit' && p.context.purpose === 'document' && editorUrl(s.platform,url))) return refusal(s);
      s.nativePending = null;
      try { return await p.finish(copy(e.receipt),{action_returned_at:p.returned_at,operation:p}); }
      catch (error) { if (p.method !== 'submit') s.nativeUnknown ||= p; throw error; }
      finally { if (p.method === 'submit') releaseChooser(s); }
    } catch (error) {
      fence(s); s.blocked = error instanceof Halt ? error.kind : p.method === 'submit' ? 'submission_unknown' : 'picker_failure';
      return result(s,'blocked',{kind:s.blocked});
    } finally { active.delete(s.key); }
  }
  function settleNative(session,e) {
    e = safeCopy(e);
    const s = state(session), p = s.nativePending || s.nativeUnknown || s.nativePicker?.operation, r = e?.receipt;
    const handle = p && (bounded(p.handle) ? r?.window_handle === p.handle : p.method === 'prepare' && r?.window_handle === null && r?.all_open_file_windows === 0);
    if (!p || s.nativeInFlight || active.has(s.key) || chooserOwner !== s || !handle || !nativeEvidence(p,e,true) || !nativeWindow(p,r,true) || r.all_open_file_windows !== undefined && r.all_open_file_windows !== 0) return refusal(s);
    s.nativePending = null; s.nativeUnknown = null; s.nativePicker = null;
    if (bounded(p.handle)) usedHandles.add(p.handle);
    fence(s); s.pending = null;
    s.phase = s.cancelled ? 'cancelled' : 'reconcile'; releaseChooser(s); record(s,'native_window_closed',{method:p.method});
    return result(s,'reconcile_only',{native_outcome:'closed'});
  }
  async function browserPrepare(s,binding,finish) {
    const control = await safeControl(s,s.editorTab,binding);
    // Register before clicking; handle rejection while click is awaiting.
    const waiting = s.editorTab.playwright.waitForEvent('filechooser',{timeoutMs:15000});
    s.chooserWaiting = true;
    waiting.catch(() => {});
    let clickFailed = false;
    try { live(s); record(s,'filechooser_wait_started'); await control.click(); }
    catch { clickFailed = true; }
    let chooser;
    try { chooser = await waiting; }
    catch (error) { s.browserUnknown = true; throw error; }
    finally { s.chooserWaiting = false; }
    if (clickFailed || s.cancelled || chooserOwner !== s || typeof chooser?.setFiles !== 'function') { s.browserUnknown = true; halt(s.cancelled ? 'cancelled' : 'picker_failure'); }
    s.chooser = chooser; record(s,'filechooser_ready'); return finish();
  }
  async function browserSubmit(s,file,finish,purpose = 'document') {
    if (purpose === 'document' && !fresh(s.consumed_at,60000)) halt('lease_lost');
    const chooser = s.chooser; s.chooser = null;
    if (!chooser || typeof chooser.setFiles !== 'function') halt('picker_failure');
    s.browserInFlight = true;
    try { await chooser.setFiles(file.absolute_path,{timeoutMs:30000}); }
    catch (error) { s.browserUnknown = true; throw error; }
    finally { s.browserInFlight = false; }
    return finish();
  }
  async function prepareDocument(s,finish) {
    s.stage = 'chooser_wait'; capability(s);
    if (chooserOwner) halt('picker_failure'); chooserOwner = s;
    const steps = s.ui.importStages, coordinate = s.upload_method === 'coordinate';
    if (s.platform === 'zhihu' && !steps) halt('picker_failure');
    if (steps) {
      if (!Array.isArray(steps) || steps.length !== 3 || steps.map(step => step.stage).join(',') !== 'menu,dialog,file') halt('picker_failure');
      for (const step of steps) if (step.browser_session !== s.browser_session || step.tab_id !== s.editorTab.id || !fresh(step.binding?.observed_at) || step.binding.observed_url !== s.initial_url || !step.binding.identity || !Object.keys(step.binding.identity).length || dangerous.test([step.binding.name,step.binding.text,...Object.values(step.binding.identity)].filter(v => typeof v === 'string').join(' '))) halt('picker_failure');
      if (!coordinate) for (const step of steps.slice(0,2)) { await assertInitial(s); await click(s,s.editorTab,step.binding); }
    } else for (const binding of s.ui.importOpen || []) { await assertInitial(s); await click(s,s.editorTab,binding); }
    await assertInitial(s); s.chooser_binding = steps?.[2].binding || s.ui.importFile;
    if (s.platform === 'zhihu' && ![s.chooser_binding.name,s.chooser_binding.text,...(coordinate ? [] : [await (await one(s.editorTab,s.chooser_binding)).innerText()])].some(label => /^点击选择本地文档(?:或拖动文件到窗口上传)?$/.test(label || ''))) halt('picker_failure');
    if (s.picker_mode === 'native') { if (!coordinate) await safeControl(s,s.editorTab,s.chooser_binding); return nativePrepare(s,s.chooser_binding,'document',finish); }
    return browserPrepare(s,s.chooser_binding,finish);
  }
  async function preflight(session,{editorTab,listTab,fileEvidence,history}) {
    // Snapshot caller evidence before any await.
    const fileInput = safeCopy(fileEvidence), historyInput = history ? copy(history) : null;
    return exclusive(session,async s => {
      if (s.phase !== 'preflight') halt('result_unknown');
      s.stage = 'file_handoff'; s.editorTab = editorTab; s.listTab = listTab;
      if (!editorTab || !listTab || !bounded(editorTab.id) || !bounded(listTab.id)) halt('result_unknown');
      const file = namedWord(s,fileInput); capability(s); s.initial_url = await editorTab.url();
      await assertInitial(s); const matches = await draftMatches(s);
      if (matches.length) { s.editor_urls = matches; halt('duplicate_draft'); }
      if (historyInput?.prior_submission !== 'never_attempted' || !bounded(historyInput.evidence_reference)) halt('result_unknown');
      s.file = file;
      const finish = async () => {
        await checkImport(s);
        if (!pickerReady(s)) halt('picker_failure');
        if (file.visible_in_browser === false) { file.handoff.chooser_prepared = true; file.handoff.chooser_prepared_at = s.nativePicker?.observed_at || now(); }
        s.file = freeze(namedWord(s,file,true));
        s.phase = 'reserve'; s.stage = 'file_handoff';
        return request(s,'reserve_article_upload',{target_account:s.target_account,word_sha256:s.word_sha256,word_size:s.word_size,mode:s.import_mode,...(s.import_mode === 'owner_confirmed_first_import' ? {confirm_never_submitted:true} : {}),preflight:{file:s.file,existing_drafts:{account:s.target_account,current_editor_url:s.initial_url,prior_submission:'never_attempted',editor_checked:true,draft_list_checked:true,matching_editor_urls:[],checked_at:now()}}});
      };
      return prepareDocument(s,finish);
    });
  }
  function exactAttempt(s,a,requireId = true) {
    const kind = s.import_mode === 'owner_confirmed_first_import' ? 'owner_confirmed_never_submitted' : 'new_word';
    if (!same(a,s,[...taskFields.slice(0,3),...wordFields]) || !bounded(a.attempt_id) || requireId && a.attempt_id !== s.attempt_id || a.authorization_kind !== kind) halt('readback_mismatch');
  }
  const receiptHandler = work => async (session,response) => {
    const receipt = safeCopy(response);
    return exclusive(session,s => work(s,receipt));
  };
  const acceptReserve = receiptHandler(async (s,receipt) => {
      expect(s,'reserve','reserve_article_upload');
      s.pending = null; const a = receipt?.attempt; exactAttempt(s,a,false);
      if (receipt?.reserved !== true) { s.phase = 'reconcile'; fence(s); s.submitted = true; releaseChooser(s); return result(s,'reconcile_only'); }
      if (!Array.isArray(a.editor_urls) || a.editor_urls.length || a.state !== 'reserved' || a.consumed_at !== null || receipt?.execute_import !== false) halt('lease_lost');
      if (!pickerReady(s)) halt('picker_failure');
      const file = approvedWord(s); await checkImport(s); approvedWord(s);
      s.attempt_id = a.attempt_id; s.phase = 'consume';
      return request(s,'consume_article_upload',{attempt_id:s.attempt_id,target_account:s.target_account,file_confirmation:file});
  });
  const acceptConsume = receiptHandler(async (s,receipt) => {
      expect(s,'consume','consume_article_upload');
      s.pending = null; s.phase = 'reconcile'; s.submitted = true; approvedWord(s); exactAttempt(s,receipt?.attempt);
      if (receipt?.execute_import !== true) { fence(s); releaseChooser(s); return result(s,'reconcile_only'); }
      if (receipt?.attempt.state !== 'outcome_unknown' || !fresh(receipt?.attempt.consumed_at,60000) || !Array.isArray(receipt?.attempt.editor_urls) || receipt?.attempt.editor_urls.length) halt('lease_lost');
      s.consumed_at = receipt?.attempt.consumed_at; s.grant = true; s.phase = 'saving_bridge';
      return request(s,delivery(s)[0],{state:delivery(s)[1]});
  });
  async function observeState(s) {
    s.stage = 'platform_import';
    if (!s.editorTab || !s.attempt_id || !s.submitted) halt('result_unknown');
    const visible = await blockers(s.editorTab); await account(s,s.editorTab);
    const url = editorUrl(s.platform,await s.editorTab.url());
    if (url && !s.editor_urls.includes(url)) s.editor_urls.push(url);
    if (s.editor_urls.length > 1) halt('duplicate_draft');
    if (/文档导入中|正在导入|Importing/.test(visible)) { s.phase = 'import_pending'; return result(s,'import_pending'); }
    if (!url) { s.phase = 'result_unknown'; return result(s,'result_unknown'); }
    s.phase = 'draft_observed'; return request(s,'record_article_upload',{attempt_id:s.attempt_id,state:'draft_observed',editor_url:url});
  }
  const submitAfterSaving = receiptHandler(async (s,receipt) => {
      expect(s,'saving_bridge',delivery(s)[0]);
      if (!s.grant || receipt?.state !== delivery(s)[1]) halt('lease_lost');
      // Spend the grant before UI awaits; never restore it.
      s.grant = false; s.pending = null; s.phase = 'reconcile';
      if (chooserOwner !== s || !fresh(s.consumed_at,60000)) halt('lease_lost');
      const file = approvedWord(s); await checkImport(s); approvedWord(s);
      const submit = async picker => {
        await assertInitial(s); approvedWord(s); live(s);
        s.stage = 'file_submission'; s.submission_started_at = now(); record(s,s.picker_mode === 'native' ? 'document_native_open_started' : 'document_setFiles_started');
        const finish = async (_value,meta) => { s.document_imported = true; s.submission_returned_at = meta?.action_returned_at || now(); record(s,'document_submission_returned'); return observeState(s); };
        if (s.picker_mode === 'native') return nativeSubmit(s,picker,file,finish);
        return browserSubmit(s,file,finish);
      };
      try { return s.picker_mode === 'native' ? await nativeInspect(s,s.chooser_binding,'document',submit) : await submit(); }
      finally { releaseChooser(s); }
  });
  const observe = session => exclusive(session,observeState,true);
  function acknowledgeReadback(s,receipt,phase,expectedState) {
    expect(s,phase,'record_article_upload');
    if (receipt?.recorded !== true) halt('lease_lost');
    exactAttempt(s,receipt.attempt);
    if (receipt.attempt.state !== expectedState || JSON.stringify(receipt.attempt.editor_urls) !== JSON.stringify(s.editor_urls)) halt('readback_mismatch');
    s.pending = null;
  }
  const acceptObserved = receiptHandler(async (s,receipt) => {
      acknowledgeReadback(s,receipt,'draft_observed','draft_observed'); s.phase = 'inspect';
      const observed = await read(s,s.editorTab), analysis = bodyAnalysis(s,observed);
      return result(s,'inspect',{observed,analysis});
  });
  async function sameOwnedDraft(s) {
    live(s);
    if (!s.owned_new_draft || !s.document_imported || s.readonly_fenced || s.phase !== 'inspect' || s.editor_urls.length !== 1 || await s.editorTab.url() !== s.editor_urls[0]) halt('readback_mismatch');
    await blockers(s.editorTab,true); const observed = await read(s,s.editorTab); imageShape(s,bodyAnalysis(s,observed).images);
    if (await s.editorTab.url() !== s.editor_urls[0]) halt('readback_mismatch');
  }
  async function coverEvidence(s,tab,proof) {
    if (!s.ui.coverImage || proof?.inspected !== true || !fresh(proof.checked_at) || !references(s,proof.reference_sha256)) return null;
    const image = await (await one(tab,s.ui.coverImage)).evaluate(el => ({src:el.currentSrc || el.src,loaded:el.complete && el.naturalWidth > 0}));
    if (!image.loaded || asset(image.src) !== proof.observed_url) return null;
    return {loaded:true,reference_sha256:proof.reference_sha256,observed_url:asset(image.src)};
  }
  async function setZhihuCover(session,{fileEvidence,coverInspection} = {}) {
    const file = freeze(safeCopy(fileEvidence)), proof = safeCopy(coverInspection);
    return exclusive(session,async s => {
      await sameOwnedDraft(s);
      if (s.platform !== 'zhihu' || !s.ui.coverImage) halt('format_missing_images');
      if (await coverEvidence(s,s.editorTab,proof)) return result(s,'cover_already_verified');
      if (s.cover_submitted || chooserOwner || !file || !absolute(file.absolute_path) || file.absolute_path.split('/').pop() !== file.filename || !references(s,file.sha256) || !positiveSize(file.size) || file.visible_in_browser !== true || file.browser_session !== s.browser_session || !fresh(file.checked_at) || !s.ui.coverOpen || !s.ui.coverFile) halt('format_missing_images');
      capability(s); s.cover_submitted = true; s.stage = 'chooser_wait'; chooserOwner = s;
      for (const binding of s.ui.coverOpen) { await sameOwnedDraft(s); await click(s,s.editorTab,binding); }
      const finish = async () => {
        for (const binding of s.ui.coverConfirm || []) { await sameOwnedDraft(s); await click(s,s.editorTab,binding); }
        await sameOwnedDraft(s); return result(s,'cover_requires_inspection');
      };
      const submit = async picker => {
        await sameOwnedDraft(s); s.stage = 'file_submission';
        if (s.picker_mode === 'native') return nativeSubmit(s,picker,file,finish);
        return browserSubmit(s,file,finish,'zhihu_cover');
      };
      try {
        if (s.picker_mode === 'native') return await nativePrepare(s,s.ui.coverFile,'zhihu_cover',() => nativeInspect(s,s.ui.coverFile,'zhihu_cover',submit));
        return await browserPrepare(s,s.ui.coverFile,submit);
      } finally { releaseChooser(s); }
    });
  }
  async function loadImages(session,tab) {
    return exclusive(session,async s => {
      const target = tab || s.editorTab;
      if (!target || !s.editor_urls.includes(await target.url())) halt('readback_mismatch');
      const loaded = observed => { const images = observed.rows.filter(i => i.kind === 'image'); return images.length === s.baseline.images.length && images.every(i => i.loaded && i.width > 0 && i.height > 0); };
      const current = await read(s,target); if (loaded(current)) return {status:'images_observed',observed:current};
      const body = await one(target,s.ui.body); await body.press('Control+Home');
      for (let i = 0; i < s.baseline.paragraphs.length + s.baseline.images.length + 1; i++) {
        const observed = await read(s,target); if (loaded(observed)) return {status:'images_observed',observed}; await body.press('PageDown');
      }
      return {status:'images_pending',recovery:rules.format_missing_images};
    },true);
  }
  function imageMap(s,observed,bindings) {
    if (!Array.isArray(bindings)) halt('readback_mismatch');
    imageShape(s,observed);
    return observed.map((r,i) => {
      if (!r.loaded || !(r.width > 0 && r.height > 0)) halt('format_missing_images');
      const url = asset(r.src), proof = bindings.find(b => b.observed_url === url && fresh(b.checked_at) && b.inspected === true), expected = s.baseline.images[i];
      if (!proof || !expected || proof.reference_sha256 !== expected.sha256 || !(proof.reference_width > 0 && proof.reference_height > 0) || Math.abs((r.width / r.height) / (proof.reference_width / proof.reference_height) - 1) > 0.02) halt('readback_mismatch');
      return {reference_sha256:proof.reference_sha256,observed_url:url,after_paragraph:r.after_paragraph};
    });
  }
  async function saved(s,tab) {
    await blockers(tab,true); await account(s,tab);
    const indicator = locate(tab,s.ui.saved), count = await indicator.count();
    if (count === 0) halt('import_pending'); if (count !== 1) halt('readback_mismatch');
    if (await indicator.isVisible() !== true || !s.ui.saved.allowed_texts?.includes((await indicator.innerText()).trim())) halt('import_pending');
  }
  async function verify(session,{inspectedBindings,coverInspection} = {}) {
    const bindings = inspectedBindings ? freeze(copy(inspectedBindings)) : null, coverProof = coverInspection ? freeze(copy(coverInspection)) : null;
    return exclusive(session,async s => {
      s.stage = 'draft_readback';
      if (!['inspect','import_pending'].includes(s.phase) || s.readonly_fenced || !s.document_imported || s.editor_urls.length !== 1 || !s.attempt_id || !s.editorTab) halt('result_unknown');
      const url = s.editor_urls[0];
      if (!s.reopenedTab) {
        if (await s.editorTab.url() !== url || typeof browser?.tabs?.new !== 'function') halt('readback_mismatch');
        await saved(s,s.editorTab); s.saved_at = now();
        if (!fresh(s.saved_at) || Date.parse(s.saved_at) < Date.parse(s.consumed_at)) halt('readback_mismatch');
        if (s.ui.saveExit && !s.save_exit_attempted) { s.save_exit_attempted = true; await click(s,s.editorTab,s.ui.saveExit); }
        const reopened = await browser.tabs.new();
        if (!reopened || !bounded(reopened.id) || reopened.id === s.editorTab.id || typeof reopened.goto !== 'function') halt('readback_mismatch');
        s.reopenedTab = reopened; await reopened.goto(url); s.reopened_at = now();
      }
      const reopened = s.reopenedTab;
      if (await reopened.url() !== url || reopened.id === s.editorTab.id) halt('readback_mismatch');
      await saved(s,reopened);
      for (const binding of [s.ui.title,s.ui.body]) { const count = await locate(reopened,binding).count(); if (!count) halt('import_pending'); if (count !== 1) halt('readback_mismatch'); }
      const observed = await read(s,reopened);
      if (!observed.rows.length && !observed.captions.some(Boolean)) halt('import_pending');
      const analysis = bodyAnalysis(s,observed);
      if (analysis.duplicateTitle || analysis.numbering.length) halt('format_missing_images');
      if (analysis.images.length === s.baseline.images.length && analysis.images.some(i => !i.loaded || i.width <= 0 || i.height <= 0)) halt('import_pending');
      const images = imageMap(s,analysis.images,bindings); let cover;
      if (s.platform === 'zhihu') {
        cover = await coverEvidence(s,reopened,coverProof);
        if (!cover) halt('readback_mismatch');
      }
      const readback = {verification_method:'agent_readback',...pick(s,['word_sha256','target_account']),draft_url:url,independently_reopened:true,saved_indicator_observed:true,images_loaded:true,title:observed.title,paragraphs:observed.rows.filter(r => r.kind === 'paragraph').map(r => r.text),images,...(cover ? {cover} : {}),saved_at:s.saved_at,reopened_at:s.reopened_at,read_at:now()};
      if (!time(readback.read_at) || !(Date.parse(readback.saved_at) <= Date.parse(readback.reopened_at) && Date.parse(readback.reopened_at) <= Date.parse(readback.read_at)) || await reopened.url() !== url) halt('readback_mismatch');
      s.readback = freeze(readback); s.phase = 'verified_bridge'; record(s,'independent_readback_verified');
      return request(s,'record_article_upload',{attempt_id:s.attempt_id,state:'verified',editor_url:url,readback});
    });
  }
  const acceptVerified = receiptHandler(async (s,receipt) => {
      acknowledgeReadback(s,receipt,'verified_bridge','verified'); s.phase = 'complete_bridge'; const r = s.readback;
      const readback = pick(r,['verification_method','word_sha256','title','paragraphs','images','read_at']);
      return request(s,delivery(s)[0],{state:delivery(s)[2],draft_url:r.draft_url,readback});
  });
  const acceptCompleted = receiptHandler(async (s,receipt) => {
      expect(s,'complete_bridge',delivery(s)[0]);
      if (receipt?.state !== delivery(s)[2] || !s.readback) halt('lease_lost');
      s.pending = null; s.phase = 'done'; record(s,'completed'); releaseChooser(s);
      return result(s,'done',{readback:copy(s.readback)});
  });
  function cancel(session) { const s = state(session); s.cancelled = true; fence(s); s.phase = 'cancelled'; record(s,'cancelled'); releaseChooser(s); }
  function diagnosticRequest(session,{operation_id,executor_id}) {
    const s = state(session), last = [...s.events].reverse().find(e => e.event === 'blocked');
    if (!last || !bounded(operation_id) || executor_id !== s.executor_id || !['file_handoff','chooser_wait','file_submission','platform_import','draft_readback'].includes(last.stage)) return null;
    return {status:'bridge_required',operation:'record_article_upload_diagnostic',args:{article_id:s.article_id,platform:s.platform,operation_id,executor_id,...(s.attempt_id ? {attempt_id:s.attempt_id} : {}),stage:last.stage,outcome:'failed',cause:last.cause,observed_at:last.at},checkpoint:checkpointState(s)};
  }
  const unsupported = session => { const s = state(session); return Promise.resolve(result(s,'blocked',{kind:'unsupported_recovery',recovery:rules.unsupported_recovery})); };
  return {runtime_version:'private_draft_executor_v1',native_protocol_version:2,createSession,preflight,acceptReserve,acceptConsume,submitAfterSaving,observe,acceptObserved,setZhihuCover,loadImages,verify,acceptVerified,acceptCompleted,resumeNative,settleNative,checkpoint,cancel,diagnosticRequest,diagnostic:diagnosticCopy,recoveryRules:copy(rules),bindRecovery:unsupported,reconcileExisting:unsupported,recoverBrowser:unsupported,repairParagraph:unsupported,repairMissingImage:unsupported};
}
