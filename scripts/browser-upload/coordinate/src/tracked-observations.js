import {bindScope, assertScope, requireCondition} from './coordinate-contract.js';

const trackedObservationBindings = new WeakMap();
// Project factory, not an official host API. The original host must rewrite each
// observation callback so EVERY official operation calls runOfficialAction and
// is awaited. Passing old callbacks unchanged is deliberately unsupported.
export function createTrackedParentObservations({scope: inputScope, cleanup, confirmCompletion, build}) {
  const scope = bindScope(inputScope);
  requireCondition(cleanup && typeof cleanup.runAwaited === 'function' && typeof confirmCompletion === 'function' && typeof build === 'function', 'per_action_parent_observation_factory_required');
  let invocation = null, fenced = false;
  const binding = {scope, cleanup, cancellationCheck: null, started: false};
  const assertNotCancelled = () => { if (binding.cancellationCheck) binding.cancellationCheck(); };
  const runOfficialAction = async (label, operation) => {
    assertNotCancelled();
    requireCondition(invocation && !invocation.closed && typeof label === 'string' && label.length > 0 && typeof operation === 'function', 'official_action_inside_observation_required');
    const current = invocation;
    requireCondition(!current.invariantFailure, 'official_action_history_unresolved');
    current.count++;
    const pending = {};
    current.pending.add(pending);
    let value;
    try {
      value = await cleanup.runAwaited('parent.' + label, () => {
        assertNotCancelled();
        return operation();
      }, outcome => confirmCompletion('parent.' + label, outcome));
    }
    catch (error) { current.invariantFailure = true; throw error; }
    finally { current.pending.delete(pending); }
    // A local cancellation after a documented complete response is not an
    // unknown official action. Keep that settled ticket, then stop the callback.
    assertNotCancelled();
    return value;
  };
  const callbacks = build(Object.freeze({runOfficialAction}));
  const methods = ['inspect', 'writeTitle', 'reopenAndInspect'];
  requireCondition(callbacks && methods.every(key => typeof callbacks[key] === 'function'), 'complete_tracked_observations_required');
  const wrapped = Object.fromEntries(methods.map(method => [method, async context => {
    assertNotCancelled();
    assertScope(context, scope);
    requireCondition(!fenced && invocation === null, 'single_tracked_parent_observation_required');
    const current = {count: 0, pending: new Set(), closed: false, invariantFailure: false};
    binding.started = true;
    invocation = current;
    try {
      return await cleanup.runAwaited('parent.observation.' + method, async () => {
        try {
          assertNotCancelled();
          const value = await callbacks[method](context);
          assertNotCancelled();
          if (current.invariantFailure || current.count === 0 || current.pending.size !== 0) {
            current.invariantFailure = true;
            throw Error('all_official_observation_actions_must_be_registered_and_awaited');
          }
          return value;
        } finally { current.closed = true; }
      }, outcome => !current.invariantFailure && confirmCompletion('parent.observation.' + method, outcome));
    } catch (error) { fenced = true; throw error; }
    finally { current.closed = true; invocation = null; }
  }]));
  const result = Object.freeze(wrapped);
  trackedObservationBindings.set(result, binding);
  return result;
}
export function assertTrackedParentObservations(observations, scope, cleanup) {
  const binding = trackedObservationBindings.get(observations);
  requireCondition(binding && binding.cleanup === cleanup, 'same_ledger_tracked_parent_observations_required');
  assertScope(binding.scope, scope);
}
// Install once, before this original bridge's first callback. This supplies a
// synchronous local dispatch fence only; it cannot settle, erase or restore any
// action ticket and is not an official host API or cancellation operation.
export function bindTrackedObservationCancellation(observations, scope, cleanup, cancellationCheck) {
  assertTrackedParentObservations(observations, scope, cleanup);
  const binding = trackedObservationBindings.get(observations);
  requireCondition(!binding.started && binding.cancellationCheck === null && typeof cancellationCheck === 'function', 'fresh_same_bridge_cancellation_binding_required');
  binding.cancellationCheck = cancellationCheck;
}
