// Native-only action history. Every actual tool call ends in this invocation.
// Correlation tickets are project records, never official tool receipts.
export function createNativeActionLedger({now, confirmCompletion}) {
  if (typeof now !== 'function' || typeof confirmCompletion !== 'function') throw Error('native_completion_contract_required');
  const epoch = Symbol('fresh-native-action-ledger');
  const actions = [];
  let serial = 0;
  async function run(label, operation) {
    if (typeof operation !== 'function' || typeof label !== 'string' || !label) throw Error('native_action_required');
    const record = {id: 'native-action-' + (++serial), epoch, label, state: 'pending', started_at: now()};
    actions.push(record); // Register before dispatch; never remove unknown records.
    let value, failure, rejected = false;
    try { value = await operation(); } catch (error) { failure = error; rejected = true; }
    let confirmed = false;
    try { confirmed = confirmCompletion(label, rejected ? {kind: 'rejected', error: failure} : {kind: 'fulfilled', value}) === true; } catch {}
    record.state = confirmed ? 'settled' : 'unknown';
    record.finished_at = now();
    if (rejected) throw failure;
    if (!confirmed) throw Error('native_action_completion_unknown');
    return {value, record: Object.freeze({id: record.id, label, started_at: record.started_at, finished_at: record.finished_at, state: record.state, source: 'project_awaited_tool_call'})};
  }
  function diagnostic() {
    return Object.freeze({history_complete: true, pending_actions: actions.filter(x => x.state === 'pending').length, unknown_actions: actions.filter(x => x.state === 'unknown').length, settled_actions: actions.filter(x => x.state === 'settled').length});
  }
  return Object.freeze({run, diagnostic});
}
