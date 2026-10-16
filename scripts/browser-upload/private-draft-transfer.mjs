/** Independent host transfer contract. No loader, browser library or network side effects. */
const transferOwners = new Map();
export function createPrivateDraftTransfer({scope, word, baseline, host, importChannel, now = () => new Date().toISOString()}) {
  const fields = ['article_id','platform','target_account','browser_session','executor_id','tab_id'];
  const fileFields = ['filename','absolute_path','browser_session','sha256','size','visible_in_browser','visibility_unproven'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  const bound = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const match = (a,b,keys) => a && keys.every(key => a[key] === b[key]);
  const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const fresh = (value,age = 60000) => time(value) && Date.parse(value) <= Date.parse(now()) && Date.parse(value) >= Date.parse(now()) - age;
  const localErrors = new WeakMap();
  const fail = code => { const error = Error(code); localErrors.set(error,code); throw error; };
  if (!['browser_filechooser','native_file_dialog'].includes(importChannel)) fail('import_channel_required');
  const destinations = {toutiao:{account:'61556093362',blank:'https://mp.toutiao.com/profile_v4/graphic/publish',status_tool:'record_article_status',saving:'toutiao_saving',complete:'completed'},zhihu:{account:'ren-zhe-ai-chi-yu-52',blank:'https://zhuanlan.zhihu.com/write',status_tool:'record_article_delivery',saving:'saving',complete:'saved'}};
  if (!scope || !fields.every(key => bound(scope[key])) || !Object.hasOwn(destinations,scope.platform) || scope.target_account !== destinations[scope.platform].account) fail('scope_invalid');
  const destination = destinations[scope.platform];
  if (!word || !digest(word.sha256) || !Number.isSafeInteger(word.size) || word.size <= 0 || !bound(word.output_id)) fail('word_invalid');
  // Original image dimensions must come from SHA-matched embedded Word bytes
  // or their actual pixel-verification receipt in the same importing host.
  // The website's layout/Word receipt contains only hashes and anchors; missing
  // natural dimensions cannot be inferred from a platform screenshot or URL.
  if (!baseline || typeof baseline.title !== 'string' || !baseline.title || !Array.isArray(baseline.paragraphs) || !baseline.paragraphs.length || baseline.paragraphs.some(x => typeof x !== 'string' || !x) || !Array.isArray(baseline.images) || !baseline.images.length || baseline.images.length > 30 || baseline.images.some((x,i) => !digest(x.sha256) || !Number.isSafeInteger(x.after_paragraph) || x.after_paragraph < 0 || x.after_paragraph > baseline.paragraphs.length || ![x.natural_width,x.natural_height].every(n => Number.isSafeInteger(n) && n > 0) || i > 0 && x.after_paragraph < baseline.images[i-1].after_paragraph)) fail('baseline_invalid');
  if (!host || ['inspect','preparePicker','reopenAndInspect','writeTitle'].some(name => typeof host[name] !== 'function')) fail('host_unavailable');
  if (importChannel === 'native_file_dialog' && typeof host.cancelLocal !== 'function') fail('host_unavailable');
  const s = freeze(Object.fromEntries(fields.map(key => [key,scope[key]]))), w = freeze({output_id:word.output_id,sha256:word.sha256,size:word.size}), b = freeze({title:baseline.title,paragraphs:clone(baseline.paragraphs),images:baseline.images.map(image => ({sha256:image.sha256,after_paragraph:image.after_paragraph,natural_width:image.natural_width,natural_height:image.natural_height,ratio:image.natural_width/image.natural_height}))});
  const key = JSON.stringify([s.browser_session,s.tab_id]);
  let phase = 'new', busy = false, cancelled = false, cancellationPropagated = false, chooser = null, nativeDialog = null, nativePrepared = null, nativeOpen = null, file = null, preparedAt = null, attempt = null, consumedAt = null, grant = false, submitted = false, draftUrl = null, titleAttempted = false, titleWrittenAt = null, savedAt = null, reopen = null, readback = null;
  const blank = destination.blank;
  const result = status => ({status,phase,submitted,attempt_id:attempt?.attempt_id || null,execute_import:false,import_channel:importChannel});
  // Project bridge only: a native dialog is never a browser chooser. The original
  // Existing website contracts map Toutiao to record_article_status and Zhihu
  // to record_article_delivery, including its frozen-image cover acceptance.
  const pickerContext = purpose => ({...s,...(purpose === 'settlement' ? {} : {editor_url:blank}),purpose,import_channel:importChannel,...(importChannel === 'browser_filechooser' ? {chooser} : {native_dialog:nativeDialog,...nativePrepared})});
  const ownedPicker = value => {
    if (importChannel === 'browser_filechooser') { if (value.chooser_owned !== true) fail('picker_invalid'); }
    else if (value.import_channel !== importChannel || value.native_dialog_owned !== true || !nativePrepared || !match(value,nativePrepared,['prepared_id','window_id','cycle'])) fail('picker_invalid');
  };
  const live = () => { if (cancelled || phase === 'blocked' || phase === 'unknown') fail('execution_fenced'); if (transferOwners.get(key) !== api) fail('picker_owned_elsewhere'); };
  const run = async work => {
    if (busy) return {...result('blocked'),error_code:'concurrent_operation'};
    busy = true;
    try { if (cancelled || phase === 'blocked' || phase === 'unknown') fail('execution_fenced'); return await work(); }
    catch (error) { grant = false; phase = submitted ? 'unknown' : 'blocked'; return {...result('blocked'),error_code:localErrors.get(error) || 'host_operation_unknown'}; }
    finally { busy = false; }
  };
  const expect = value => { if (phase !== value) fail('phase_invalid'); live(); };
  const observeHost = async (context, independent = false) => {
    const started = now(), observed = clone(await (independent ? host.reopenAndInspect(context) : host.inspect(context)));
    if (!fresh(observed?.checked_at) || Date.parse(observed.checked_at) < Date.parse(started)) fail('observation_stale');
    return freeze(observed);
  };
  const safeUrl = value => {
    if (typeof value !== 'string' || value.length > 1024) fail('url_invalid');
    let u; try { u = new URL(value); } catch { fail('url_invalid'); }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) fail('url_invalid');
    if (s.platform === 'toutiao' ? u.hostname !== 'mp.toutiao.com' || u.pathname !== '/profile_v4/graphic/publish' || [...u.searchParams.keys()].some(k => k !== 'pgc_id') || u.searchParams.getAll('pgc_id').length !== 1 || !/^\d+$/.test(u.searchParams.get('pgc_id')) : u.hostname !== 'zhuanlan.zhihu.com' || !/^\/p\/[0-9]+\/edit$/.test(u.pathname) || u.search) fail('url_invalid');
    return u.href;
  };
  function page(value, url, independent = false, allowPending = false) {
    if (!value || !match(value,s,fields.filter(k => !independent || k !== 'tab_id')) || independent && (!bound(value.tab_id) || value.tab_id === s.tab_id) || value.editor_url !== url || !fresh(value.checked_at) || value.source !== 'documented_host_observation' || value.login_blocked !== false || value.private_draft !== true || (allowPending ? typeof value.pending !== 'boolean' : value.pending !== false) || value.save_failed !== false) fail('page_scope_invalid');
    let account; try { account = new URL(value.account_url,s.platform === 'toutiao' ? 'https://www.toutiao.com' : 'https://www.zhihu.com'); } catch { fail('account_invalid'); }
    if (account.protocol !== 'https:' || account.username || account.password || account.port || account.hash || value.account_menu_observed !== true) fail('account_invalid');
    if (s.platform === 'toutiao' ? account.hostname !== 'www.toutiao.com' || account.pathname !== '/c/user/' + s.target_account + '/' || account.search && account.search !== '?enter_from=mp_profile' : account.hostname !== 'www.zhihu.com' || !['/people/'+s.target_account,'/people/'+s.target_account+'/'].includes(account.pathname) || account.search) fail('account_invalid');
    if (typeof value.title !== 'string' || !value.body || ['paragraphs','images','captions','unclassified'].some(k => !Array.isArray(value.body[k])) || value.body.captions.some(x => x !== '') || value.body.unclassified.length) fail('body_unclassified');
    return value;
  }
  function checkedFile(value) {
    if (value && Object.keys(value).some(key => ![...fileFields,'checked_at','handoff'].includes(key))) fail('file_invalid');
    if (!value || !match(value,{browser_session:s.browser_session,sha256:w.sha256,size:w.size},['browser_session','sha256','size']) || !fresh(value.checked_at,900000) || typeof value.absolute_path !== 'string' || !value.absolute_path.startsWith('/') || value.absolute_path.length > 1024 || value.absolute_path.split('/').includes('..') || /[\u0000-\u001f\u007f]/.test(value.absolute_path) || typeof value.filename !== 'string' || !value.filename.endsWith('.docx') || value.filename.includes('/') || value.filename.includes('\\') || /[\u0000-\u001f\u007f]/.test(value.filename) || value.absolute_path.split('/').at(-1) !== value.filename) fail('file_invalid');
    if (value.visible_in_browser === true) { if (value.visibility_unproven !== undefined || value.handoff !== undefined) fail('file_invalid'); }
    else {
      const h = value.handoff;
      if (value.visible_in_browser !== false || value.visibility_unproven !== true || !h || Object.keys(h).some(key => !['kind','download_path','download_browser_session','executor_id','source_sha256','source_size','verified_in_cua','copied_in_same_executor','chooser_prepared','chooser_prepared_at'].includes(key)) || h.kind !== 'same_browser_download' || h.download_browser_session !== s.browser_session || h.executor_id !== s.executor_id || h.source_sha256 !== w.sha256 || h.source_size !== w.size || h.verified_in_cua !== true || h.copied_in_same_executor !== true || typeof h.download_path !== 'string' || !h.download_path.startsWith('/') || h.download_path.split('/').some(part => part === '..' || part === '.') || !h.download_path.split('/').at(-1) || /[\u0000-\u001f\u007f\\]/.test(h.download_path)) fail('file_invalid');
    }
    return clone(value);
  }
  const unchangedFile = value => {
    const v = checkedFile(value);
    if (!match(v,file,fileFields) || JSON.stringify(v.handoff && {...v.handoff,chooser_prepared:undefined,chooser_prepared_at:undefined}) !== JSON.stringify(file.handoff && {...file.handoff,chooser_prepared:undefined,chooser_prepared_at:undefined})) fail('file_changed');
  };
  function empty(value) { if (value.title !== '' || value.body.paragraphs.length || value.body.images.length) fail('editor_not_empty'); }
  function exactAttempt(value, state) {
    if (!value || !match(value,{...s,word_sha256:w.sha256,word_size:w.size},['article_id','platform','target_account','word_sha256','word_size']) || value.authorization_kind !== 'new_word' || !bound(value.attempt_id) || attempt && value.attempt_id !== attempt.attempt_id || value.state !== state) fail('attempt_invalid');
  }
  const request = (operation,args) => ({...result('tool_required'),operation,args:{article_id:s.article_id,...(operation === 'record_article_status' ? {} : {platform:s.platform}),...args}});
  const safeImageId = value => {
    if (typeof value !== 'string' || value.length > 2048) return false;
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash; } catch { return false; }
  };
  // Four machine-epsilon units cover arithmetic rounding at the inclusive 2%
  // boundary, not any material additional image distortion.
  const imageRatioMatches = (width,height,ratio) => Math.abs(width/height/ratio-1) <= 0.02 + Number.EPSILON*4;
  function exactBody(value, loaded) {
    const body = value.body, texts = body.paragraphs[0] === b.title ? body.paragraphs.slice(1) : body.paragraphs;
    if (JSON.stringify(texts) !== JSON.stringify(b.paragraphs) || body.images.length !== b.images.length) fail('readback_mismatch');
    body.images.forEach((image,i) => {
      const planned = b.images[i];
      if (!match(image,planned,['after_paragraph']) || image.reference_sha256 !== planned.sha256 || image.inspected !== true || !fresh(image.inspected_at,900000) || loaded && image.loaded !== true || ['width','height','reference_width','reference_height'].some(key => key in image) || ![image.natural_width,image.natural_height].every(n => Number.isSafeInteger(n) && n > 0) || ![image.display_width,image.display_height].every(n => Number.isFinite(n) && n > 0) || !imageRatioMatches(image.natural_width,image.natural_height,planned.ratio) || !imageRatioMatches(image.display_width,image.display_height,planned.ratio) || !safeImageId(image.observed_url)) fail('image_mismatch');
    });
    return texts;
  }
  function exactCover(value) {
    if (s.platform !== 'zhihu') return null;
    const cover = value.cover;
    if (!cover || !b.images.some(image => image.sha256 === cover.reference_sha256) || cover.loaded !== true || cover.inspected !== true || !fresh(cover.inspected_at,900000) || !safeImageId(cover.observed_url)) fail('cover_mismatch');
    return {loaded:true,reference_sha256:cover.reference_sha256,observed_url:cover.observed_url};
  }
  const bodyIdentity = value => JSON.stringify({paragraphs:value.body.paragraphs,images:value.body.images.map(image => ({reference_sha256:image.reference_sha256,after_paragraph:image.after_paragraph,observed_url:image.observed_url})),captions:value.body.captions,unclassified:value.body.unclassified,...(s.platform === 'zhihu' ? {cover:value.cover && {reference_sha256:value.cover.reference_sha256,observed_url:value.cover.observed_url}} : {})});
  const api = {
    status:() => result(phase),
    prepare:() => run(async () => {
      if (phase !== 'new' || transferOwners.has(key)) fail('picker_owned_elsewhere');
      transferOwners.set(key,api); phase = 'preparing';
      const initial = page(await observeHost({...s,editor_url:blank,purpose:'preflight'}),blank); live(); empty(initial);
      file = freeze(checkedFile(initial.file));
      const history = initial.existing_drafts;
      if (!history || history.account !== s.target_account || history.current_editor_url !== blank || history.editor_checked !== true || history.editor_empty !== true || history.private_draft !== true || history.draft_list_checked !== true || history.prior_submission !== 'never_attempted' || !fresh(history.checked_at) || !Array.isArray(history.matching_editor_urls) || history.matching_editor_urls.length || !bound(history.evidence_reference)) fail('history_unknown');
      const started = now();
      const picker = await host.preparePicker({...s,editor_url:blank,purpose:'document',import_channel:importChannel}); live();
      if (!picker || !match(picker,s,fields) || picker.channel !== importChannel || picker.editor_url !== blank || picker.ready !== true || picker.files_selected !== false || picker.submitted !== false || !fresh(picker.checked_at) || Date.parse(picker.checked_at) < Date.parse(started)) fail('picker_invalid');
      if (importChannel === 'browser_filechooser') {
        if ('nativeDialog' in Object(picker) || typeof picker.chooser?.setFiles !== 'function') fail('picker_invalid');
        chooser = picker.chooser;
      } else {
        const dialog = picker.nativeDialog;
        if ('chooser' in Object(picker) || !dialog || typeof dialog.open !== 'function' || !bound(picker.prepared_id) || !bound(picker.window_id) || !Number.isSafeInteger(picker.cycle) || picker.cycle < 1 || dialog.ready !== true || dialog.window_id !== picker.window_id || dialog.cycle !== picker.cycle) fail('picker_invalid');
        nativeDialog = dialog; nativeOpen = dialog.open;
        nativePrepared = freeze({prepared_id:picker.prepared_id,window_id:picker.window_id,cycle:picker.cycle});
      }
      preparedAt = picker.checked_at;
      const current = page(await observeHost(pickerContext('prepared')),blank); live(); empty(current); unchangedFile(current.file); ownedPicker(current);
      if (!fresh(history.checked_at) || !fresh(preparedAt)) fail('picker_invalid');
      const preparedFile = clone(file);
      if (preparedFile.handoff) Object.assign(preparedFile.handoff,{chooser_prepared:true,chooser_prepared_at:preparedAt});
      file = freeze(preparedFile); phase = 'reserve';
      // Keep the richer real host history check above; send only the published
      // reservation schema fields, never adapter evidence or unrecognized data.
      const publicHistory = Object.fromEntries(['current_editor_url','prior_submission','account','editor_checked','draft_list_checked','matching_editor_urls','checked_at','editor_empty','private_draft'].map(key => [key,history[key]]));
      return request('reserve_article_upload',{mode:'new_import',target_account:s.target_account,word_sha256:w.sha256,word_size:w.size,preflight:{file:clone(file),existing_drafts:clone(publicHistory)}});
    }),
    acceptReserved:response => run(async () => {
      expect('reserve'); const r = clone(response); exactAttempt(r.attempt,'reserved');
      if (r.reserved !== true || r.execute_import !== false || r.attempt.consumed_at !== null || !Array.isArray(r.attempt.editor_urls) || r.attempt.editor_urls.length) fail('reserve_not_fresh');
      attempt = freeze(r.attempt);
      const value = page(await observeHost(pickerContext('consume')),blank); live(); empty(value); unchangedFile(value.file); ownedPicker(value);
      if (!fresh(preparedAt)) fail('picker_invalid');
      phase = 'consume'; return request('consume_article_upload',{attempt_id:attempt.attempt_id,target_account:s.target_account,file_confirmation:clone(file)});
    }),
    acceptConsumed:response => run(async () => {
      expect('consume'); const r = clone(response); exactAttempt(r.attempt,'outcome_unknown');
      if (r.execute_import !== true || !fresh(r.attempt.consumed_at) || !Array.isArray(r.attempt.editor_urls) || r.attempt.editor_urls.length) fail('consume_not_fresh');
      consumedAt = r.attempt.consumed_at; grant = true; phase = 'saving';
      return request(destination.status_tool,{state:destination.saving});
    }),
    acceptSaving:response => run(async () => { expect('saving'); if (response?.state !== destination.saving || s.platform === 'zhihu' && !match(response,s,['article_id','platform']) || !grant || !fresh(consumedAt)) fail('saving_unconfirmed'); phase = 'ready'; return result('ready_to_submit'); }),
    submit:() => run(async () => {
      expect('ready'); if (!grant || (importChannel === 'browser_filechooser' ? !chooser : !nativeDialog) || !fresh(consumedAt)) fail('grant_expired');
      grant = false; phase = 'checking_submission';
      const value = page(await observeHost(pickerContext('submit')),blank); live(); empty(value); unchangedFile(value.file); ownedPicker(value);
      if (!fresh(consumedAt)) fail('grant_expired');
      if (importChannel === 'native_file_dialog' && (nativeDialog.open !== nativeOpen || nativeDialog.ready !== true || nativeDialog.window_id !== nativePrepared.window_id || nativeDialog.cycle !== nativePrepared.cycle)) fail('picker_invalid');
      const submissionStarted = now();
      submitted = true; phase = 'submitting';
      // Fixed original path and whitelisted public facts only. Actual parent
      // receipts/tokens stay in this closure; no raw response is passed to CUA.
      const outcome = importChannel === 'browser_filechooser'
        ? await chooser.setFiles(file.absolute_path)
        : await nativeOpen.call(nativeDialog,file.absolute_path,freeze({...s,import_channel:importChannel,...nativePrepared,attempt_id:attempt.attempt_id,sha256:w.sha256,size:w.size,execute_import:true,delivery_status:'saving'})); live();
      if (outcome === false || outcome?.isError === true || outcome?.success === false || /error|failed|unknown|cancelled|timeout/i.test(outcome?.status || '')) fail('submission_unknown');
      if (importChannel === 'native_file_dialog' && (!outcome || !match(outcome,s,fields) || outcome.channel !== importChannel || !match(outcome,nativePrepared,['prepared_id','window_id','cycle']) || outcome.submitted !== true || !fresh(outcome.observed_at) || Date.parse(outcome.observed_at) < Date.parse(submissionStarted))) fail('submission_unknown');
      phase = 'submitted'; return result('submitted');
    }),
    observe:() => run(async () => {
      expect('submitted');
      const value = await observeHost({...s,purpose:'observe'}); live();
      if (value?.pending === true) { if (value.editor_url !== blank) safeUrl(value.editor_url); page(value,value.editor_url,false,true); return result('waiting'); }
      const url = safeUrl(value?.editor_url); page(value,url); draftUrl = url; phase = 'observed_bridge';
      return request('record_article_upload',{attempt_id:attempt.attempt_id,state:'draft_observed',editor_url:url});
    }),
    acceptObserved:response => run(async () => {
      expect('observed_bridge'); const r = clone(response); exactAttempt(r.attempt,'draft_observed');
      if (r.recorded !== true || JSON.stringify(r.attempt.editor_urls) !== JSON.stringify([draftUrl])) fail('observed_unconfirmed');
      phase = 'inspect'; return result('inspect');
    }),
    fillTitle:() => run(async () => {
      expect('inspect');
      const before = page(await observeHost({...s,editor_url:draftUrl,purpose:'title'}),draftUrl); live();
      if (before.body.images.some(image => image.loaded === false)) return result('waiting');
      exactBody(before,false);
      if (before.title === b.title) return result('title_already_exact');
      if (before.title !== '' || titleAttempted || typeof host.writeTitle !== 'function') fail('title_mismatch');
      const control = before.title_control;
      if (!control || control.editor_url !== draftUrl || !fresh(control.checked_at) || control.unique !== true || control.visible !== true || control.enabled !== true || !['INPUT','TEXTAREA'].includes(control.tag) || control.tag === 'INPUT' && control.type !== 'text' || !bound(control.label) || !/标题|title/i.test(control.label) || /发布|发表|定时|删除|Publish|Schedule|Delete/i.test(control.label)) fail('title_control_invalid');
      titleAttempted = true;
      await host.writeTitle({...s,editor_url:draftUrl,title:b.title,control:clone(control)}); live(); titleWrittenAt = now();
      const after = page(await observeHost({...s,editor_url:draftUrl,purpose:'title_readback'}),draftUrl); live(); exactBody(after,false);
      if (after.title !== b.title || bodyIdentity(before) !== bodyIdentity(after)) fail('title_write_unknown');
      return result('title_exact');
    }),
    verify:() => run(async () => {
      expect('inspect');
      const saved = page(await observeHost({...s,editor_url:draftUrl,purpose:'saved'}),draftUrl); live();
      if (saved.body.images.some(image => image.loaded === false) || s.platform === 'zhihu' && saved.cover?.loaded === false || saved.saved_indicator_observed === false || titleWrittenAt && time(saved.saved_at) && Date.parse(saved.saved_at) < Date.parse(titleWrittenAt)) return result('waiting');
      exactBody(saved,true); const savedCover = exactCover(saved);
      if (saved.title !== b.title || saved.saved_indicator_observed !== true || !fresh(saved.saved_at) || Date.parse(saved.saved_at) < Date.parse(consumedAt)) fail('save_unconfirmed');
      savedAt ||= saved.saved_at;
      const started = now(), reopened = page(await observeHost({...s,editor_url:draftUrl,purpose:'independent_readback',...(reopen?{reuse_tab_id:reopen.tab_id}:{})},true),draftUrl,true); live();
      if (!fresh(reopened.reopened_at,900000) || Date.parse(reopened.reopened_at) < Date.parse(reopen? savedAt:started) || Date.parse(reopened.checked_at) < Date.parse(reopened.reopened_at) || reopen && (reopened.tab_id !== reopen.tab_id || reopened.reopened_at !== reopen.reopened_at)) fail('reopen_unconfirmed');
      reopen ||= freeze({tab_id:reopened.tab_id,reopened_at:reopened.reopened_at});
      if (reopened.body.images.some(image => image.loaded === false) || s.platform === 'zhihu' && reopened.cover?.loaded === false || reopened.saved_indicator_observed === false) return result('waiting');
      if (reopened.title !== b.title || reopened.saved_indicator_observed !== true) fail('reopen_unconfirmed');
      const paragraphs = exactBody(reopened,true), cover = exactCover(reopened);
      if (JSON.stringify(cover) !== JSON.stringify(savedCover)) fail('cover_mismatch');
      readback = freeze({verification_method:'agent_readback',word_sha256:w.sha256,target_account:s.target_account,draft_url:draftUrl,independently_reopened:true,saved_indicator_observed:true,images_loaded:true,title:b.title,paragraphs:clone(paragraphs),images:reopened.body.images.map(image => ({reference_sha256:image.reference_sha256,after_paragraph:image.after_paragraph,observed_url:image.observed_url})),saved_at:savedAt,reopened_at:reopened.reopened_at,read_at:reopened.checked_at,...(cover ? {cover} : {})});
      phase = 'verified_bridge';
      return request('record_article_upload',{attempt_id:attempt.attempt_id,state:'verified',editor_url:draftUrl,readback:clone(readback)});
    }),
    acceptVerified:response => run(async () => { expect('verified_bridge'); const r = clone(response); exactAttempt(r.attempt,'verified'); if (r.recorded !== true || JSON.stringify(r.attempt.editor_urls) !== JSON.stringify([draftUrl])) fail('verified_unconfirmed'); phase = 'complete_bridge'; return request(destination.status_tool,{state:destination.complete,draft_url:draftUrl,readback:{verification_method:'agent_readback',word_sha256:w.sha256,title:b.title,paragraphs:clone(readback.paragraphs),images:clone(readback.images),read_at:readback.read_at}}); }),
    acceptCompleted:response => run(async () => { expect('complete_bridge'); if (response?.state !== destination.complete || s.platform === 'zhihu' && (!match(response,s,['article_id','platform']) || response.draft_url !== draftUrl) || response.draft_url !== undefined && response.draft_url !== draftUrl) fail('completion_unconfirmed'); phase = 'done'; chooser = null; nativeDialog = null; transferOwners.delete(key); return result('done'); }),
    cancel:() => {
      const first = !cancelled;
      cancelled = true; grant = false; // Irreversible, including while busy.
      if (first && importChannel === 'native_file_dialog') {
        // Synchronous project-local fence, not an official tool abort, a window
        // close or evidence that an already-issued Open has been withdrawn.
        try { const receipt = host.cancelLocal({...s,import_channel:importChannel,...nativePrepared}); cancellationPropagated = !!receipt && typeof receipt.then !== 'function' && receipt.cancelled === true; } catch { cancellationPropagated = false; }
      }
      return {...result('cancelled'),cancellation_propagated:importChannel === 'native_file_dialog' ? cancellationPropagated : false,...(importChannel === 'native_file_dialog' && !cancellationPropagated ? {error_code:'native_cancel_unconfirmed'} : {})};
    },
    settleClosed:async () => {
      if (busy || !cancelled) return {...result('blocked'),error_code:'settlement_unconfirmed'};
      try { const value = await observeHost(pickerContext('settlement')); if (!value || !match(value,s,fields) || value.source !== 'documented_host_observation' || value.actions_settled !== true || value.chooser_closed !== true || importChannel === 'native_file_dialog' && (value.channel !== importChannel || value.native_dialog_closed !== true || !nativePrepared || !match(value,nativePrepared,['prepared_id','window_id','cycle']))) fail('settlement_unconfirmed'); chooser = null; if (transferOwners.get(key) === api) transferOwners.delete(key); return result('settled'); }
      catch { return {...result('blocked'),error_code:'settlement_unconfirmed'}; }
    },
  };
  return Object.freeze(api);
}
