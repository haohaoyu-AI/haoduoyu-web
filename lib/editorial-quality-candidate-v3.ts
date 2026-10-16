/** Pure evidence derivation for length-invalid, otherwise ordinary V3 articles.
 * No provider, credential lookup, persistence, content repair or acceptance. */
import {
 editorialErrors, editorialHashText, editorialArticleCharCount,
 parseEditorialJSONForFormat, parseEditorialReviewCandidate,
 type Article, type EditorialQualityCandidateAnchor,
} from './editorial-contract';

export const editorialQualityCandidateKind = 'claude_provider_quality_candidate_v3' as const;
export type EditorialQualityCandidateBinding = {
 /** Values are copied from the strict owner-scoped runtime, not a model output. */
 owner: string; run_id: string; stage_id: string;
 input_json: string; input_sha256: string;
 snapshot_json: string; snapshot_sha256: string;
 receipt: {id: string; owner: string; state: string; response: string};
 receipt_sha256: string;
 model: string; max_output_tokens: number;
 system_prompt_sha256: string; user_prompt_sha256: string;
 /** The runtime must inspect the entire receipt using its credential boundary. */
 safety_checked: true;
};
export type EditorialQualityCandidateEvidence = {
 kind: typeof editorialQualityCandidateKind; contract_version: 1;
 run_id: string; stage_id: string; source_text_sha256: string;
 receipt_sha256: string; input_sha256: string; snapshot_sha256: string;
 article_sha256: string; char_count: number; quality_passed: false; reason: 'length';
};
export type BoundQualityCandidate = {
 article: Article; evidence: EditorialQualityCandidateEvidence;
 quality_candidate_anchor: EditorialQualityCandidateAnchor;
};
function fail(): never {throw Error(editorialErrors.context);}
function object(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getOwnPropertySymbols(value).length) fail();
 return value as Record<string, unknown>;
}
function text(value: unknown, max = 400000): asserts value is string {
 if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) fail();
}
function sha(value: unknown): asserts value is string {if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail();}
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value);
function hashed(raw: string, hash: string): Record<string, unknown> {
 text(raw); sha(hash);
 if (editorialHashText(raw) !== hash) fail();
 return object(parseEditorialJSONForFormat(raw));
}

/** Hash original bytes, never reserialize or alter the receipt/raw provider text.
 * The receipt row's owner and composite ID bind its otherwise ownerless packet.
 * Exact prompt/model/token checks retain the frozen paid-request business input. */
export function deriveBoundQualityCandidate(value: EditorialQualityCandidateBinding): BoundQualityCandidate {
 try {
  object(value); text(value.owner, 500); text(value.model, 150);
  if (!uuid(value.run_id) || !uuid(value.stage_id) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value.model) || value.safety_checked !== true || !Number.isSafeInteger(value.max_output_tokens) || value.max_output_tokens <= 0) fail();
  sha(value.system_prompt_sha256); sha(value.user_prompt_sha256);
  const input = hashed(value.input_json, value.input_sha256), snapshot = hashed(value.snapshot_json, value.snapshot_sha256);
  text(input.system_prompt); text(input.user_prompt);
  if (input.contract_version !== 3 || input.run_id !== value.run_id || input.stage_id !== value.stage_id || input.stage !== 'body' || input.snapshot_sha256 !== value.snapshot_sha256 || input.writer_kind !== 'claude_provider' || input.model !== value.model || input.max_output_tokens !== value.max_output_tokens || editorialHashText(input.system_prompt) !== value.system_prompt_sha256 || editorialHashText(input.user_prompt) !== value.user_prompt_sha256) fail();
  if (!uuid(input.actor_id) || !Number.isSafeInteger(input.round) || Number(input.round) < 0 || !Number.isSafeInteger(input.sequence) || Number(input.sequence) < 0) fail();
  const capability = object(snapshot.capability), instructions = object(snapshot.stage_instructions);
  text(snapshot.writing_prompt); text(instructions.body);
  if (snapshot.model !== value.model || (snapshot.writer_model !== undefined && snapshot.writer_model !== value.model) || capability.max_output_tokens !== value.max_output_tokens || input.system_prompt !== snapshot.writing_prompt + '\n\n' + instructions.body) fail();
  const receipt = object(value.receipt);
  const fields = ['id', 'owner', 'state', 'response'];
  if (Object.getOwnPropertyNames(receipt).length !== fields.length || fields.some(name => !Object.prototype.hasOwnProperty.call(receipt, name)) || receipt.owner !== value.owner || receipt.state !== 'completed' || receipt.id !== `editorial_v3:${value.owner}:${value.run_id}:${value.stage_id}`) fail();
  const packet = hashed(receipt.response as string, value.receipt_sha256), diagnostic = object(packet.diagnostic);
  if (packet.state !== 'completed' || packet.stage !== 'body' || packet.stage_id !== value.stage_id || (packet.run_id !== undefined && packet.run_id !== value.run_id) || packet.input_sha256 !== value.input_sha256 || packet.snapshot_sha256 !== value.snapshot_sha256 || packet.requested_model !== value.model || packet.returned_model !== value.model) fail();
  // A partial, unsafe, truncated, non-EOF or unknown completion is never eligible.
  if (packet.response_suppressed === true || diagnostic.response_suppressed === true || diagnostic.stage !== 'completed' || diagnostic.stop_reason !== 'end_turn' || diagnostic.eof_received !== true || diagnostic.incomplete_frame !== false || diagnostic.message_stop_received !== true || diagnostic.request_stream !== true || diagnostic.transport_version !== 'anthropic_sse_buffered_v2' || diagnostic.inspection_version !== 'buffered_v2' || diagnostic.raw_retained !== false || diagnostic.http_status !== 200 || (diagnostic.code !== undefined && diagnostic.code !== null) || (diagnostic.safety_subcause !== undefined && diagnostic.safety_subcause !== null) || (diagnostic.transport_subcause !== undefined && diagnostic.transport_subcause !== null)) fail();
  for (const key of ['partial_text', 'raw_partial_response', 'raw_response']) if (packet[key] !== undefined && packet[key] !== null) fail();
  text(packet.text);
  const article = parseEditorialReviewCandidate(packet.text), sourceTextHash = editorialHashText(packet.text), articleHash = editorialHashText(JSON.stringify(article)), charCount = editorialArticleCharCount(article);
  const evidence: EditorialQualityCandidateEvidence = {
   kind: editorialQualityCandidateKind, contract_version: 1, run_id: value.run_id, stage_id: value.stage_id,
   source_text_sha256: sourceTextHash, receipt_sha256: value.receipt_sha256,
   input_sha256: value.input_sha256, snapshot_sha256: value.snapshot_sha256,
   article_sha256: articleHash, char_count: charCount, quality_passed: false, reason: 'length',
  };
  const quality_candidate_anchor: EditorialQualityCandidateAnchor = {
   contract_version: 1, version_id: value.stage_id, sha256: articleHash,
   source_text: packet.text, source_text_sha256: sourceTextHash, receipt_sha256: value.receipt_sha256,
   input_sha256: value.input_sha256, snapshot_sha256: value.snapshot_sha256,
   char_count: charCount, quality_passed: false, reason: 'length',
  };
  return {article, evidence, quality_candidate_anchor};
 } catch {fail();}
}
