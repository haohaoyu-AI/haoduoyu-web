import {NATIVE_CHANNEL, SCOPE_FIELDS, bindScope, bindArtifact, assertScope, requireCondition} from './coordinate-contract.js';

// Parent-memory bridge, NOT CUA code. Raw normal-tool receipts/tokens belong in
// the parent's existing V155 transfer closure and must never be serialized here.
// authenticateCurrentChain must validate their genuine current grant/lease and
// single claim -> reserve -> consume -> saving chain using the existing contract.
// It must be read-only: issuing/consuming capabilities is done by the original
// transfer BEFORE this bridge, once. A supplied boolean is not authentication.
export function createParentImportGate({scope: inputScope, artifact: inputArtifact, authenticateCurrentChain}) {
  const scope = bindScope(inputScope), artifact = bindArtifact(inputArtifact, scope);
  requireCondition(typeof authenticateCurrentChain === 'function', 'actual_parent_authorization_contract_required');
  let issued = null, preparedIdentity = null, issueStarted = false, chainIdentity = null;
  const identityFields = ['attempt_id', 'claimed_at', 'reserved_at', 'consumed_at', 'saving_at'];
  async function issue(prepared, expectedAttemptId) {
    requireCondition(!issueStarted, 'permit_once_required');
    issueStarted = true; // BEFORE await; unknown/failure never resets this gate.
    requireCondition(expectedAttemptId === undefined || typeof expectedAttemptId === 'string' && expectedAttemptId.length > 0, 'original_parent_attempt_required');
    assertScope(prepared, scope);
    requireCondition(prepared.channel === NATIVE_CHANNEL && prepared.ready === true && prepared.files_selected === false && prepared.submitted === false && prepared.sha256 === artifact.sha256 && prepared.size_bytes === artifact.size_bytes && Number.isFinite(Date.parse(prepared.observed_at)), 'real_native_prepare_required');
    const chain = await authenticateCurrentChain({scope, prepared});
    assertScope(chain, scope);
    requireCondition(chain.source === 'authenticated_parent_current_chain' && chain.channel === NATIVE_CHANNEL && chain.execute_import === true && chain.delivery_status === 'saving' && chain.prepared === prepared && chain.claim_confirmed === true && chain.reserved === true && chain.consumed === true && chain.current === true && chain.artifact_sha256 === artifact.sha256 && chain.artifact_size_bytes === artifact.size_bytes && typeof chain.attempt_id === 'string' && chain.attempt_id, 'real_consumed_saving_chain_required');
    requireCondition(expectedAttemptId === undefined || chain.attempt_id === expectedAttemptId, 'original_core_parent_attempt_mismatch');
    const times = [prepared.observed_at, chain.claimed_at, chain.reserved_at, chain.consumed_at, chain.saving_at].map(Date.parse);
    requireCondition(times.every(Number.isFinite) && times.every((value, index) => index === 0 || value >= times[index - 1]), 'prepare_claim_reserve_consume_saving_order_required');
    chainIdentity = Object.freeze(Object.fromEntries(identityFields.map(key => [key, chain[key]])));
    preparedIdentity = prepared;
    issued = Object.freeze({...Object.fromEntries(SCOPE_FIELDS.map(key => [key, scope[key]])), channel: NATIVE_CHANNEL, execute_import: true, delivery_status: 'saving', prepared_id: prepared.prepared_id, sha256: artifact.sha256, size_bytes: artifact.size_bytes});
    return issued;
  }
  async function authorizeSubmission({prepared, permission}) {
    // The adapter sanitizes permission into a new object. Match all public fields
    // AND its exact prepared object; then authenticate the ORIGINAL parent chain.
    requireCondition(issued && prepared === preparedIdentity && permission && typeof permission === 'object' && Reflect.ownKeys(permission).every(key => typeof key === 'string' && Object.hasOwn(issued, key)) && Object.keys(issued).every(key => permission?.[key] === issued[key]) && Reflect.ownKeys(permission).length === Object.keys(issued).length, 'matching_parent_permit_required');
    const current = await authenticateCurrentChain({scope, prepared});
    assertScope(current, scope);
    requireCondition(identityFields.every(key => current[key] === chainIdentity[key]), 'original_parent_attempt_chain_required');
    requireCondition(current.source === 'authenticated_parent_current_chain' && current.prepared === prepared && current.current === true && current.claim_confirmed === true && current.reserved === true && current.consumed === true && current.channel === NATIVE_CHANNEL && current.execute_import === true && current.delivery_status === 'saving' && current.artifact_sha256 === artifact.sha256 && current.artifact_size_bytes === artifact.size_bytes, 'parent_permission_no_longer_current');
    return true;
  }
  return Object.freeze({issue, authorizeSubmission});
}
