// Offline-review helper. No browser API, submission or cancellation is invoked.
// Enable complete history ONLY on a new adapter instance, before its first action.
// An old/cancelled instance without a complete ledger must keep the default false.
function makeChooserCleanupState({freshInstance = false} = {}) {
  return Object.freeze({
    epoch: Symbol('chooser-cleanup-instance'),
    historyComplete: freshInstance === true,
    actions: Object.freeze([]),
    chooser: Object.freeze({
      phase: freshInstance === true ? 'never_created' : 'unknown',
      cycle: 0,
      ref: null
    })
  });
}
function validChooserCleanupState(state) {
  if (!state || typeof state.epoch !== 'symbol' || typeof state.historyComplete !== 'boolean' ||
      !Array.isArray(state.actions)) return false;
  const ids = new Set();
  for (const action of state.actions) {
    if (!action || typeof action.id !== 'string' || !action.id || ids.has(action.id) ||
        !['pending', 'settled', 'unknown'].includes(action.state)) return false;
    ids.add(action.id);
  }
  const chooser = state.chooser;
  if (!chooser || !Number.isSafeInteger(chooser.cycle) || chooser.cycle < 0) return false;
  if (chooser.phase === 'never_created') return chooser.cycle === 0 && chooser.ref === null;
  if (chooser.phase === 'unknown') return true;
  return ['open', 'closed_confirmed'].includes(chooser.phase) && chooser.cycle > 0 &&
    chooser.ref !== null && ['object', 'function'].includes(typeof chooser.ref);
}
// Pure reducer. Keep every action record; cancellation/null pointers never erase it.
function updateChooserCleanupState(state, event) {
  if (!validChooserCleanupState(state) || !event) throw Error('Invalid cleanup history');
  if (event.epoch !== state.epoch) throw Error('Matching adapter epoch required');
  let actions = state.actions;
  let chooser = state.chooser;
  if (event.type === 'action_started') {
    if (typeof event.id !== 'string' || !event.id || actions.some(action => action.id === event.id)) {
      throw Error('Unique action identity required');
    }
    actions = [...actions, Object.freeze({id: event.id, state: 'pending'})];
  } else if (['action_settled', 'action_unknown'].includes(event.type)) {
    const action = actions.find(value => value.id === event.id);
    if (!action || action.state !== 'pending') throw Error('Matching pending action required');
    // action_settled requires actual awaited completion under the real host contract.
    // A timeout, lost reply or local cancellation with unknown host completion
    // is action_unknown. A business save result of "unknown" alone is not.
    actions = actions.map(value => value === action
      ? Object.freeze({id: value.id, state: event.type === 'action_settled' ? 'settled' : 'unknown'})
      : value);
  } else if (event.type === 'chooser_creation_started') {
    if (!['never_created', 'closed_confirmed'].includes(chooser.phase)) throw Error('Chooser state unresolved');
    // Mark uncertainty BEFORE waiting/clicking anything that may create a chooser.
    chooser = {phase: 'unknown', cycle: chooser.cycle + 1, ref: null};
  } else if (event.type === 'chooser_created') {
    if (chooser.phase !== 'unknown' || chooser.cycle < 1 || chooser.ref !== null ||
        event.cycle !== chooser.cycle || event.chooser === null ||
        !['object', 'function'].includes(typeof event.chooser)) throw Error('Matching real chooser required');
    chooser = {...chooser, phase: 'open', ref: event.chooser};
  } else if (event.type === 'browser_chooser_closed_observed') {
    // This event is allowed only for an ACTUAL supported browser-close observation.
    // No such API is invented here. Without it, leave the chooser unresolved.
    // setFiles returning, chooserSubmitted, null and no system modal are not evidence.
    if (chooser.phase !== 'open' || event.cycle !== chooser.cycle ||
        event.chooser !== chooser.ref || event.closed !== true) throw Error('Actual matching closure observation required');
    chooser = {...chooser, phase: 'closed_confirmed'};
  } else {
    throw Error('Unsupported cleanup event');
  }
  // Freeze our containers, never the opaque browser chooser object itself.
  return Object.freeze({epoch: state.epoch, historyComplete: state.historyComplete,
    actions: Object.freeze(actions), chooser: Object.freeze(chooser)});
}
// Pure decision. Window absence can block/pass the native-window check only;
// it NEVER changes a browser chooser's known/unknown lifecycle.
function chooserCleanupFlags(state, windows, stateAtWindowReadStart) {
  if (!validChooserCleanupState(state)) return {actions_settled: false, chooser_closed: false};
  const actionsSettled = state.historyComplete === true && state.actions.every(action => action.state === 'settled');
  const browserClosed = state.chooser.phase === 'never_created' || state.chooser.phase === 'closed_confirmed';
  // The existing window read must start after actions have ended. Any ledger
  // change during that awaited read makes its observation stale for cleanup.
  const nativeClear = stateAtWindowReadStart === state && Array.isArray(windows) && Array.from(windows).every(window => window &&
    typeof window === 'object' && window.modal === false && typeof window.title === 'string' &&
    !/Open File/i.test(window.title));
  return {actions_settled: actionsSettled, chooser_closed: actionsSettled && browserClosed && nativeClear};
}


// Project adapter plumbing, not an official browser API. No UI action is issued
// during definition/initialization. Never use this to replace an old ledger.
function createChooserCleanupAdapter({scope, freshInstance = false, readWindows, now = () => new Date().toISOString()}) {
  const scopeFields = ['article_id','platform','target_account','browser_session','executor_id','tab_id'];
  if (!scope || scopeFields.some(key => typeof scope[key] !== 'string' || !scope[key] || scope[key].length > 180) || typeof readWindows !== 'function' || typeof now !== 'function') throw Error('Cleanup adapter scope/capability required');
  const boundScope = Object.freeze(Object.fromEntries(scopeFields.map(key => [key,scope[key]])));
  let state = makeChooserCleanupState({freshInstance});
  let serial = 0, creation = null;
  const actionTickets = new Set();
  const apply = event => { state = updateChooserCleanupState(state,event); };
  function beginAction(label) {
    if (typeof label !== 'string' || !label || label.length > 100) throw Error('Action label required');
    const ticket = Object.freeze({epoch:state.epoch,id:'action-'+(++serial)+'-'+label});
    apply({epoch:ticket.epoch,type:'action_started',id:ticket.id});
    actionTickets.add(ticket);
    return ticket;
  }
  function finishAction(ticket, completion) {
    if (!actionTickets.has(ticket) || ticket.epoch !== state.epoch || !['settled','unknown'].includes(completion)) throw Error('Actual matching action ticket required');
    apply({epoch:ticket.epoch,type:completion === 'settled'?'action_settled':'action_unknown',id:ticket.id});
    actionTickets.delete(ticket);
  }
  async function runAwaited(label, operation, confirmCompletion) {
    if (typeof operation !== 'function' || typeof confirmCompletion !== 'function') throw Error('Actual operation and documented completion classifier required');
    const ticket = beginAction(label);
    let value, rejected = false, failure;
    try { value = await operation(); } catch (error) { rejected = true; failure = error; }
    // The classifier must be synchronous and based on the CURRENT official
    // completion contract/receipt. Fulfilment or business success alone is
    // not a generic guarantee. An unconfirmed lifetime stays unknown.
    let confirmed = false;
    try { confirmed = confirmCompletion(rejected?{kind:'rejected',error:failure}:{kind:'fulfilled',value}) === true; } catch {}
    finishAction(ticket,confirmed?'settled':'unknown');
    if (rejected) throw failure;
    if (!confirmed) throw Error('Action completion unconfirmed');
    return value;
  }
  function beginChooserCreation() {
    const startedAt = now();
    if (!Number.isFinite(Date.parse(startedAt))) throw Error('Actual creation time required');
    apply({epoch:state.epoch,type:'chooser_creation_started'});
    creation = Object.freeze({epoch:state.epoch,cycle:state.chooser.cycle,started_at:startedAt});
    return creation;
  }
  function recordChooserCreated(ticket, chooser) {
    if (!ticket || ticket !== creation || ticket.epoch !== state.epoch) throw Error('Matching creation ticket required');
    apply({epoch:ticket.epoch,type:'chooser_created',cycle:ticket.cycle,chooser});
  }
  function recordChooserClosed(receipt) {
    const ticket = receipt?.ticket;
    const observed = Date.parse(receipt?.observed_at),current = Date.parse(now());
    if (!ticket || ticket !== creation || receipt.epoch !== ticket.epoch || receipt.cycle !== ticket.cycle || receipt.source !== 'documented_host_observation' || !Number.isFinite(observed) || !Number.isFinite(current) || observed < Date.parse(ticket.started_at) || observed > current || current-observed > 60000) throw Error('Fresh matching official closure observation required');
    // This is only a receipt binding. It does NOT invent a close/isClosed API.
    apply({epoch:receipt.epoch,type:'browser_chooser_closed_observed',cycle:receipt.cycle,chooser:receipt.chooser,closed:receipt.closed});
  }
  async function readSettlement(context) {
    if (!context || context.purpose !== 'settlement' || scopeFields.some(key => context[key] !== boundScope[key])) throw Error('Matching settlement scope required');
    const start = state;
    const windows = await readWindows(); // e.g. the existing sky.list_windows()
    const flags = chooserCleanupFlags(state,windows,start);
    return {...boundScope,source:'documented_host_observation',checked_at:now(),...flags};
  }
  function diagnostic() {
    return {history_complete:state.historyComplete,chooser_phase:state.chooser.phase,chooser_cycle:state.chooser.cycle,pending_actions:state.actions.filter(action=>action.state==='pending').length,unknown_actions:state.actions.filter(action=>action.state==='unknown').length,settled_actions:state.actions.filter(action=>action.state==='settled').length};
  }
  // No raw event stamper, mutable state, reset, checkpoint restoration or SDK
  // chooser serialization. A late foreign callback keeps its original ticket.
  return Object.freeze({beginAction,finishAction,runAwaited,beginChooserCreation,recordChooserCreated,recordChooserClosed,readSettlement,diagnostic});
}
