// PARENT MEMORY ONLY: compose and measure source data. Never load or execute it.
// A passing byte measurement grants no host approval, capability or upload right.
export const COMPLETE_CALL_BUDGET = Object.freeze({
  strict_max_utf8_bytes: 64000,
  definition_max_utf8_bytes: 28000,
  adapter_max_utf8_bytes: 20000,
  initialization_max_utf8_bytes: 8000,
  planned_transport_reserve_utf8_bytes: 8000,
});
// Internal composition policy, not a change to the strict original-host limit.
// Preserve the earlier actual rejection; a revised bound never approves a call.
export const COMPLETE_CALL_BUDGET_REVISION = Object.freeze({
  previous_definition_max_utf8_bytes: 24000,
  definition_max_utf8_bytes: 28000,
  strict_limit_changed: false,
  reason: 'Retain validate -> ready -> single physical commit so parent cancellation cannot auto-send Open after awaited preflight reads.',
  previous_definition_failure: Object.freeze({source: 'compiled_native_step_host_definition', measured_utf8_bytes: 24101, limit_utf8_bytes: 24000, exceeded_utf8_bytes: 101, complete_call_budget_verified: false, actual_adapter_initialization_and_tool_request_provided: false}),
  planned_transport_reserve_is_hard_limit: false,
});
const sourceFields = ['definition_source', 'adapter_source', 'initialization_source'];
const inputFields = new Set([...sourceFields, 'tool_args', 'code_field', 'known_wrapper_extra_utf8_bytes']);
const secretFields = new Set([
  'token', 'tokens', 'claimtoken', 'deliverytoken', 'executiontoken', 'executionclaim', 'reservationtoken', 'consumetoken',
  'accesstoken', 'refreshtoken', 'authtoken', 'sessiontoken', 'credential', 'credentials', 'secret', 'secrets',
  'password', 'passwords', 'authorization', 'apikey', 'cookie', 'cookies',
  'privatebaseline', 'baseline', 'frozenbaseline', 'frozenbody', 'frozentext', 'frozenparagraphs', 'articlebody',
  'articletext', 'bodyparagraphs', 'paragraphs', 'images', 'manifest', 'articlemanifest', 'body', 'content', 'text', 'title',
  'grant', 'grants', 'importpermission', 'executeimport', 'claimconfirmed', 'reserved', 'consumed', 'deliverystatus',
]);
const safeTokenCountFields = new Set(['maxoutputtokens', 'maxtokens']);
const bytes = value => new TextEncoder().encode(value).length;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export class CompleteCallBudgetError extends Error {
  constructor(code, report) {
    super(code); this.name = 'CompleteCallBudgetError'; this.code = code;
    this.report = freeze(report || {complete_call_budget_verified: false, rejection: code});
  }
}
function reject(code, field) {
  throw new CompleteCallBudgetError(code, {complete_call_budget_verified: false, rejection: code, ...(field ? {field} : {})});
}
function readInput(input) {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) reject('plain_budget_input_required');
  const values = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== 'string' || !inputFields.has(key)) reject('unrecognized_budget_input');
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) reject('plain_visible_budget_input_required', key);
    values[key] = descriptor.value;
  }
  for (const field of sourceFields) if (values[field] !== undefined && typeof values[field] !== 'string') reject('source_string_required', field);
  if (values.code_field !== undefined && (typeof values.code_field !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(values.code_field))) reject('actual_code_field_required');
  if (values.known_wrapper_extra_utf8_bytes !== undefined && values.known_wrapper_extra_utf8_bytes !== null && (!Number.isSafeInteger(values.known_wrapper_extra_utf8_bytes) || values.known_wrapper_extra_utf8_bytes < 0)) reject('known_wrapper_extra_bytes_required');
  return values;
}
function plainToolRequest(value) {
  const active = new Set(); let nodes = 0;
  function copy(input, depth) {
    if (++nodes > 20000 || depth > 64) reject('bounded_plain_tool_request_required');
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') { if (!Number.isFinite(input)) reject('finite_tool_request_number_required'); return input; }
    if (typeof input !== 'object') reject('json_data_tool_request_required');
    if (active.has(input)) reject('acyclic_tool_request_required');
    active.add(input);
    const array = Array.isArray(input), prototype = Object.getPrototypeOf(input);
    if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) reject('plain_tool_request_object_required');
    const result = array ? [] : Object.create(null);
    const keys = Reflect.ownKeys(input);
    if (array && (!Number.isSafeInteger(input.length) || keys.length !== input.length + 1)) reject('dense_plain_tool_request_array_required');
    for (const key of keys) {
      if (array && key === 'length') continue;
      if (typeof key !== 'string') reject('visible_string_tool_request_keys_required');
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) reject('plain_visible_tool_request_fields_required');
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) reject('dense_plain_tool_request_array_required');
      if (!array && !/^[A-Za-z_][A-Za-z0-9_\-]{0,99}$/.test(key)) reject('ordinary_tool_request_key_required');
      const normalized = key.replace(/[_\-]/g, '').toLowerCase();
      if (safeTokenCountFields.has(normalized)) {
        if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 0) reject('public_token_count_required');
      } else if (secretFields.has(normalized) || /token|credential|password|secret|cookie|authorization|apikey|baseline|manifest|paragraph|body|claim|reserv|consum|grant/.test(normalized) || /(?:full|frozen|private|original|article)(?:text|content|title|images)/.test(normalized)) reject('private_parent_field_prohibited');
      if (/force|bypass|approv|permission|sandbox|danger|unsafe|override|escalat|skipreview|disablereview|disablesafety/.test(normalized)) reject('permission_or_bypass_flag_prohibited');
      // Copy data only after inspecting the descriptor. No getter/toJSON runs,
      // no source or secret value is removed, normalized or logged.
      result[key] = copy(descriptor.value, depth + 1);
    }
    if (array) for (let index = 0; index < input.length; index++) if (!Object.hasOwn(input, index)) reject('dense_plain_tool_request_array_required');
    active.delete(input); return result;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('complete_tool_request_object_required');
  return copy(value, 0);
}
const compose = values => sourceFields.map(field => values[field]).join('\n\n');
export function composeCompleteOrdinaryCode(input) {
  const values = readInput(input);
  if (!sourceFields.every(field => typeof values[field] === 'string' && values[field].trim().length > 0)) reject('all_actual_ordinary_sources_required');
  return compose(values); // Exact original source bytes, with explicit separators.
}
export function measureCompleteCallBudget(input) {
  const values = readInput(input), missing = [], violations = [];
  const limits = [COMPLETE_CALL_BUDGET.definition_max_utf8_bytes, COMPLETE_CALL_BUDGET.adapter_max_utf8_bytes, COMPLETE_CALL_BUDGET.initialization_max_utf8_bytes];
  const components = Object.fromEntries(sourceFields.map((field, index) => {
    const source = values[field], provided = typeof source === 'string' && source.trim().length > 0;
    if (!provided) missing.push(field);
    const size = typeof source === 'string' ? bytes(source) : null;
    if (size !== null && size > limits[index]) violations.push(field + '_too_large');
    return [field, {provided, utf8_bytes: size, json_quoted_utf8_bytes: typeof source === 'string' ? bytes(JSON.stringify(source)) : null, max_utf8_bytes: limits[index], remaining_utf8_bytes: size === null ? null : limits[index] - size}];
  }));
  const code = sourceFields.every(field => components[field].provided) ? compose(values) : null;
  const codeBytes = code === null ? null : bytes(code);
  if (codeBytes !== null && codeBytes > COMPLETE_CALL_BUDGET.strict_max_utf8_bytes) violations.push('complete_ordinary_code_too_large');
  const requestProvided = values.tool_args !== undefined;
  if (!requestProvided) missing.push('tool_args');
  if (values.code_field === undefined) missing.push('code_field');
  const wrapperKnown = values.known_wrapper_extra_utf8_bytes !== undefined && values.known_wrapper_extra_utf8_bytes !== null;
  if (!wrapperKnown) missing.push('known_wrapper_extra_utf8_bytes');
  const request = requestProvided ? plainToolRequest(values.tool_args) : null;
  if (request && values.code_field !== undefined) {
    if (!Object.hasOwn(request, values.code_field) || typeof request[values.code_field] !== 'string') reject('actual_top_level_code_string_required');
    if (code !== null && request[values.code_field] !== code) reject('actual_code_must_match_complete_ordinary_sources');
  }
  const requestBytes = request === null ? null : bytes(JSON.stringify(request));
  const exactPayloadBytes = requestBytes !== null && wrapperKnown ? BigInt(requestBytes) + BigInt(values.known_wrapper_extra_utf8_bytes) : null;
  const payloadBytes = exactPayloadBytes !== null && exactPayloadBytes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exactPayloadBytes) : null;
  const exactTransportBytes = exactPayloadBytes !== null && codeBytes !== null && request && values.code_field !== undefined ? exactPayloadBytes - BigInt(codeBytes) : null;
  const transportBytes = exactTransportBytes !== null && exactTransportBytes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(exactTransportBytes) : null;
  if (requestBytes !== null && requestBytes > COMPLETE_CALL_BUDGET.strict_max_utf8_bytes) violations.push('complete_json_tool_request_too_large');
  if (exactPayloadBytes !== null && exactPayloadBytes > BigInt(COMPLETE_CALL_BUDGET.strict_max_utf8_bytes)) violations.push('complete_payload_with_wrapper_too_large');
  const report = freeze({
    parent_memory_only: true, cua_submission_prohibited: true,
    strict_limit_utf8_bytes: COMPLETE_CALL_BUDGET.strict_max_utf8_bytes, components, internal_budget_revision: COMPLETE_CALL_BUDGET_REVISION,
    planned_transport_reserve_utf8_bytes: COMPLETE_CALL_BUDGET.planned_transport_reserve_utf8_bytes,
    planned_transport_reserve_is_hard_limit: false,
    complete_ordinary_code_utf8_bytes: codeBytes,
    complete_ordinary_code_json_quoted_utf8_bytes: code === null ? null : bytes(JSON.stringify(code)),
    actual_tool_request_json_utf8_bytes: requestBytes,
    known_wrapper_extra_utf8_bytes: wrapperKnown ? values.known_wrapper_extra_utf8_bytes : null,
    actual_complete_payload_utf8_bytes: payloadBytes,
    actual_complete_payload_utf8_bytes_exact: exactPayloadBytes === null ? null : String(exactPayloadBytes),
    actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes: transportBytes,
    actual_json_arguments_escaping_and_wrapper_extra_utf8_bytes_exact: exactTransportBytes === null ? null : String(exactTransportBytes),
    remaining_planned_transport_reserve_utf8_bytes: transportBytes === null ? null : COMPLETE_CALL_BUDGET.planned_transport_reserve_utf8_bytes - transportBytes,
    remaining_code_utf8_bytes: codeBytes === null ? null : COMPLETE_CALL_BUDGET.strict_max_utf8_bytes - codeBytes,
    remaining_payload_utf8_bytes: payloadBytes === null || !Number.isSafeInteger(payloadBytes) ? null : COMPLETE_CALL_BUDGET.strict_max_utf8_bytes - payloadBytes,
    missing_inputs: missing, violations,
    complete_call_budget_verified: missing.length === 0 && violations.length === 0,
    normal_host_approval_granted: false, current_official_host_acceptance_required: true,
    capability_verified: false, platform_verified: false,
    measurement_scope: 'this_complete_input_snapshot_only',
    instruction: 'Parent-only byte measurement of this supplied actual source/request snapshot and the entire ordinary JSON tool request plus known wrapper bytes. Definition/adapter/initialization bounds are internal composition policy; the 8000-byte transport reserve is a plan, not an additional hard limit. Actual JSON arguments, escaping and wrapper overhead are counted in the strict 64000-byte complete request. Any change to code, arguments or wrapper requires a new complete measurement immediately before submission. Source thresholds alone never verify a call. Submit the complete readable call for normal approval only through the original documented host; this report grants no action, upload, retry or approval. Structured field checks do not classify the contents of source strings.',
  });
  if (violations.length) throw new CompleteCallBudgetError('complete_call_budget_exceeded', report);
  return report;
}
