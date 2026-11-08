// Only audited editor painters use this guard. Failed/cancelled captures retain their
// raw value against late controller paints until a real edit or identity change.
const editorGuards = new WeakMap();
const fieldIdentity = field => JSON.stringify([field.id, {...field.dataset}, field.form?.dataset?.date]);
export function localEditorPaintValue(field, proposed) {
  const guard = editorGuards.get(field);
  if (!guard) return proposed;
  if (!guard.valid()) { editorGuards.delete(field); return proposed; }
  const consumed = guard.record.consumedValue(field);
  if (consumed !== undefined) { editorGuards.delete(field); return consumed; }
  return guard.value;
}
// A close acknowledgement is a bounded, locked snapshot of CURRENT editor values.
// It is never a promise that the OS will let a paused application finish writing.
export function installLocalLifecycle({window, document, getRuntime, getReadyRuntime = null, capture = () => {}, collect = () => {},
  reportError = () => {}, timeoutMs = 8000, timers = globalThis} = {}) {
  const requests = new Map(), observedDocuments = new WeakSet();
  let active = null, backgroundSequence = 0;
  // Exact audited navigation controls. They select a view, not unsent business data.
  const navigation = Object.freeze({
    'notes-date':['date','#daily-notes'], 'notes-history-month':['month','#daily-notes'],
    'notes-month-input':['month','#notes-month-panel'], 'reminder-date':['date','#work-reminders'],
    'todo-date':['date','#daily-todos'], 'todo-calendar-month-input':['month','#daily-todos'],
  });
  const navigationOnly = field => {
    const entry = navigation[field.id];
    return Boolean(entry && field.type === entry[0] && field.closest?.(entry[1]));
  };
  const supported = field => field.type !== 'password' && (['todo-text','todo-future-text','memo-title','memo-body','notes-editor'].includes(field.id) ||
    Boolean(field.dataset?.noteEntryEditor));
  const editable = field => !field.disabled && !field.readOnly && !['button','submit','reset','hidden','checkbox','radio','range','color','file'].includes(field.type);
  function unsupportedFields(targetDocument = document, extraSupported = new Set()) {
    // Non-composer transient forms are deliberately not claimed as protected.
    // Their nonempty content blocks close rather than being silently discarded.
    return [...targetDocument.querySelectorAll('input,textarea')].filter(field => {
      if (!editable(field) || supported(field) || extraSupported.has(field) || navigationOnly(field)) return false;
      const type = field.type || 'text';
      if (['date','month','week','time','datetime-local','number','search'].includes(type))
        return Boolean(String(field.value || '')) || String(field.value || '') !== String(field.defaultValue || '');
      return Boolean(String(field.value || ''));
    }).map(field => field.id || field.name || field.getAttribute?.('aria-label') || '未命名输入框');
  }
  function freeze(record, targetDocument = document) {
    const root = targetDocument.body, inert = root?.inert;
    const controls = new Map();
    const lock = () => {
      for (const control of targetDocument.querySelectorAll('button,input,textarea,select')) {
        if (!controls.has(control)) controls.set(control, {disabled:control.disabled, readOnly:control.readOnly});
        if (!control.disabled) control.disabled = true;
        if ('readOnly' in control && !control.readOnly) control.readOnly = true;
      }
      if (root) root.inert = true;
    };
    const block = event => { if (active === record) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const types = ['beforeinput','keydown','click','submit','compositionstart'];
    for (const type of types) targetDocument.addEventListener(type, block, true);
    let observer;
    if (window.MutationObserver && root) { observer = new window.MutationObserver(lock); observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly']}); }
    lock();
    return () => {
      observer?.disconnect();
      for (const type of types) targetDocument.removeEventListener(type, block, true);
      // Controller-specific resume runs first; the outer lock restores originals last.
      for (const [control, previous] of controls) {
        control.disabled = previous.disabled;
        if ('readOnly' in control) control.readOnly = previous.readOnly;
      }
      if (root) root.inert = inert;
    };
  }
  function restore(record, preserve = true) {
    if (record.released) return;
    record.released = true;
    if (!preserve) for (const field of record.snapshots.keys()) {
      if (editorGuards.get(field)?.record === record) editorGuards.delete(field);
    }
    for (const callback of record.resumes.reverse()) { try { callback(); } catch (error) { reportError(error); } }
    for (const unlock of record.extraUnlocks.reverse()) unlock();
    record.unlock?.(); if (active === record) active = null;
    // Controller resume callbacks may paint. Restore captured originals last,
    // but never paste an old identity's text into a newly selected record.
    for (const [field, snapshot] of record.snapshots) {
      if (!record.validField(field)) continue;
      if (preserve) {
        const consumed = record.consumedValue(field);
        if (consumed !== undefined) {
          if (editorGuards.get(field)?.record === record) editorGuards.delete(field);
          field.value = consumed;
        } else field.value = snapshot.value;
        continue;
      }
      // Notes/memos/floating have controller resume painters. Todo/future do
      // not: an in-flight create may have consumed this composer while its
      // close guard held the old DOM value. Reconcile from the exact bound
      // journal, never from a possibly stale painter's proposed value.
      const kind = snapshot.id === 'todo-text' ? 'todo' : snapshot.id === 'todo-future-text' ? 'future' : null;
      if (!kind || !record.runtime?.composerDrafts) continue;
      try {
        const current = record.runtime.composerDrafts.read(kind,kind === 'todo' ? snapshot.form.dataset.date : '');
        if (typeof current !== 'string') throw new Error('本机编辑器恢复结果无效，请保持页面打开。');
        field.value = current;
      } catch (error) { reportError(error); }
    }
  }
  function failed(record,error) {
    if (record.state !== 'pending') return;
    record.state = 'failed'; record.error = String(error?.message || error);
    timers.clearTimeout(record.timer); restore(record); reportError(error);
  }
  function requestFlush(id) {
    if (typeof id !== 'string' || !id || id.length > 160) return 'unknown';
    if (requests.has(id)) return requests.get(id).state;
    const record = {id,state:'pending',resumes:[],extraUnlocks:[],lockedDocuments:new Set(),
      snapshots:new Map(),composerProofs:new Map(),stages:[],documentFields:new Map(),released:false}; requests.set(id,record);
    if (active) { record.state = 'failed'; record.error = '另一次关闭核对尚未结束。'; return record.state; }
    active = record;
    let readyRuntime = null;
    const bindComposerProof = (field, value, runtime) => {
      const journal = runtime?.composerDrafts;
      const kind = value.id === 'todo-text' ? 'todo' : value.id === 'todo-future-text' ? 'future' : null;
      if (!kind || !journal?.snapshot || !journal?.wasConsumed) return;
      const identity = kind === 'todo' ? value.form.dataset.date : '';
      const capability = journal.snapshot(kind,identity);
      if (capability.text === value.value) record.composerProofs.set(field,{journal,capability,kind,identity});
    };
    record.consumedValue = field => {
      const proof = record.composerProofs.get(field), value = record.snapshots.get(field);
      if (proof && record.runtime && record.runtime.composerDrafts !== proof.journal) return undefined;
      return proof && value?.value === proof.capability.text && proof.journal.wasConsumed(proof.capability)
        ? proof.journal.read(proof.kind,proof.identity) : undefined;
    };
    const waits = [], protectedFields = new Set(), required = [], unsupported = [], documents = new Set();
    let capturing = true; const captureErrors = [];
    record.validField = field => {
      const snapshot = record.snapshots.get(field);
      return Boolean(snapshot && field.isConnected !== false && fieldIdentity(field) === snapshot.fingerprint &&
        record.stages.filter(stage => stage.field === field).every(stage => stage.valid()));
    };
    const snapshot = field => {
      const value = record.snapshots.get(field);
      if (!value) throw new Error('当前输入不属于本次关闭快照，请保留输入后重试。');
      return value;
    };
    const detail = {localSnapshot:true, snapshot, fail:error => captureErrors.push(error),
      editors:() => Object.freeze([...record.snapshots].map(([field,value]) => Object.freeze({field,snapshot:value}))),
      captureDocument:(target, extra = []) => {
        if (!capturing) throw new Error('关闭快照登记已经结束。');
        if (!target || documents.has(target)) return;
        documents.add(target);
        record.documentFields.set(target,new Set(target.querySelectorAll('input,textarea')));
        const extras = new Set(extra);
        unsupported.push(...unsupportedFields(target,extras));
        for (const field of target.querySelectorAll('input,textarea')) {
          if (!supported(field) && !extras.has(field)) continue;
          const value = Object.freeze({id:field.id,value:String(field.value ?? ''),
            dataset:Object.freeze({...field.dataset}), form:Object.freeze({dataset:Object.freeze({...field.form?.dataset})}),
            readOnly:field.readOnly,composing:field.dataset?.composing === 'true',fingerprint:fieldIdentity(field)});
          record.snapshots.set(field,value);
          // Capture the existing unforgeable revision before the await-runtime
          // gap. Different raw tail text cannot inherit an older revision's
          // consume proof and must still be journaled as a new edit.
          if (getReadyRuntime && ['todo-text','todo-future-text'].includes(value.id) && value.value &&
              (!readyRuntime?.composerDrafts?.snapshot || !readyRuntime.composerDrafts.wasConsumed))
            throw new Error('本机草稿存储尚未就绪，无法核对原提交版本，本次未允许关闭。请保持页面打开。');
          const previous = editorGuards.get(field);
          if (previous?.valid() && previous.value === value.value && previous.record.consumedValue(field) !== undefined)
            record.composerProofs.set(field,previous.record.composerProofs.get(field));
          else bindComposerProof(field,value,readyRuntime);
          if (editable(field)) required.push(field);
        }
        // A real user edit after failure/resume retires the late-paint guard.
        const edited = event => { if (!active) editorGuards.delete(event.target); };
        if (!observedDocuments.has(target)) {
          observedDocuments.add(target);
          target.addEventListener('beforeinput',edited,true);
          target.addEventListener('input',edited,true);
        }
      },
      stage:({field,key,valid = () => true,apply,composing = false}) => {
        if (!capturing || typeof apply !== 'function' || typeof key !== 'string') throw new Error('无效的关闭采集登记。');
        const value = snapshot(field);
        record.stages.push({field,key,valid,apply,snapshot:value,composing:composing || value.composing});
        protectedFields.add(field);
      },
      protect:field => { snapshot(field); protectedFields.add(field); },
      lockDocument:target => {
        // Legacy refresh hooks may only lock documents registered synchronously.
        if (!documents.has(target)) throw new Error('浮窗没有完成同步关闭快照。');
      },
      waitUntil:work => { const promise = Promise.resolve(work); promise.catch(() => {}); waits.push(promise); },
      onFailure:callback => { if (typeof callback === 'function') record.resumes.push(callback); }
    };
    try {
      // No await, disabled, blur, store.edit, notification or paint may precede
      // this immutable capture of ALL participating documents and identities.
      readyRuntime = getReadyRuntime?.();
      detail.captureDocument(document);
      capture(detail);
      window.dispatchEvent(new window.CustomEvent('haoduoyu:capture-current-editors',{detail}));
      capturing = false;
      if (captureErrors.length) throw captureErrors[0];
      for (const [field,value] of record.snapshots)
        editorGuards.set(field,{record,value:value.value,valid:() => record.validField(field)});
      const byKey = new Map();
      for (const stage of record.stages) {
        if (!stage.valid() || !record.validField(stage.field)) throw new Error('编辑身份或页面已变化，已阻止关闭；旧原文仅在本次内存快照中，无法保证在新页面恢复。请勿刷新或退出。');
        if (stage.composing) throw new Error('输入尚未完成，请结束输入后再关闭。');
        const previous = byKey.get(stage.key);
        if (previous && previous.snapshot.value !== stage.snapshot.value)
          throw new Error('同一条草稿在主页面和浮窗中的原文不同，两份输入已保留。请核对后再关闭。');
        byKey.set(stage.key,stage);
      }
      if (record.stages.length && required.some(field => !protectedFields.has(field)))
        throw new Error('当前输入没有完成同步关闭快照，请保持页面打开：'+required.filter(field => !protectedFields.has(field)).map(field => field.id || '当前编辑器').join('、'));
      if (unsupported.length) throw new Error('以下输入尚未接入本机关窗保存，请保留输入并先完成或取消：'+unsupported.join('、'));
      for (const target of documents) {
        record.lockedDocuments.add(target);
        record.extraUnlocks.push(freeze(record,target));
      }
    } catch (error) { capturing = false; failed(record,error); return record.state; }
    record.timer = timers.setTimeout(() => failed(record,new Error('本机保存核对超时，尚未允许关闭。请保留输入后重试。')),timeoutMs);
    Promise.resolve().then(async () => {
      const runtime = await getRuntime();
      if (record.state !== 'pending') return;
      record.runtime = runtime;
      const validate = () => {
        for (const [target, original] of record.documentFields) {
          if ([...target.querySelectorAll('input,textarea')].some(field => !original.has(field) && !navigationOnly(field) &&
              (supported(field) || Boolean(String(field.value || '')))))
            throw new Error('关闭采集后页面出现了新的未采集输入，已阻止关闭。请核对当前页面后重试。');
        }
        if (record.stages.some(stage => !record.validField(stage.field)))
          throw new Error('编辑身份或页面已变化，已阻止关闭；旧原文仅在本次内存快照中，无法保证在新页面恢复。请勿刷新或退出。');
      };
      validate();
      // Validate every identity/conflict before applying ANY captured edit.
      for (const stage of record.stages) {
        // The exact captured composer revision may have committed as an item
        // while getRuntime awaited. Never re-journal that consumed raw text.
        if (record.consumedValue(stage.field) !== undefined) continue;
        detail.waitUntil(stage.apply(stage.snapshot,runtime));
        bindComposerProof(stage.field,stage.snapshot,runtime);
      }
      await collect(runtime,detail);
      if (record.state !== 'pending') return;
      validate();
      window.dispatchEvent(new window.CustomEvent('haoduoyu:collect-current-editors',{detail}));
      window.dispatchEvent(new window.CustomEvent('haoduoyu:before-refresh',{detail}));
      const missing = required.filter(field => !protectedFields.has(field)).map(field => field.id || field.dataset?.noteEntryEditor || '当前编辑器');
      if (missing.length) detail.waitUntil(Promise.reject(new Error('当前输入没有完成本机保存采集，请保持页面打开：'+missing.join('、'))));
      const settled = await Promise.allSettled(waits);
      const rejected = settled.find(row => row.status === 'rejected'); if (rejected) throw rejected.reason;
      if (record.state !== 'pending') return;
      validate();
      await runtime.flushDrafts();
      if (record.state !== 'pending') return;
      validate();
      record.state = 'complete'; timers.clearTimeout(record.timer);
      // Keep every editor locked until the host actually closes or calls resume.
    }).catch(error => failed(record,error));
    return 'pending';
  }
  function status(id) { return requests.get(id)?.state || 'unknown'; }
  function resume(id) {
    const record = requests.get(id); if (!record) return 'unknown';
    timers.clearTimeout(record.timer); const preserve = record.state !== 'complete';
    record.state = 'unknown'; restore(record,preserve); return 'unknown';
  }
  async function background() {
    if (active) return;
    const id = 'background:'+ ++backgroundSequence;
    requestFlush(id);
    // Poll only internal completion; never report background suspension as safe close.
    while (status(id) === 'pending') await new Promise(resolve => timers.setTimeout(resolve,10));
    resume(id); requests.delete(id);
  }
  const api = Object.freeze({requestFlush,status,resume});
  window.haoduoyuLocalLifecycle = api;
  window.addEventListener('haoduoyu:local-background',() => { void background(); });
  document.addEventListener('visibilitychange',() => { if (document.visibilityState === 'hidden') void background(); });
  return api;
}
