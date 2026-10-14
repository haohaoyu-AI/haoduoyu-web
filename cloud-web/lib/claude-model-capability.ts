/** Explicit gateway limits plus one provenance-labelled documentary exception; no paid probe. */
export const CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED = '无法确认当前YYLX模型的真实输出上限；未发起生成';
export const CLAUDE_OUTLINE_CONFIGURATION_CHANGED = 'Claude配置已变化或未启用，本次停止';
export const CLAUDE_OUTLINE_INPUT_INVALID = 'Claude框架生成输入无效，未发起生成';
export const CLAUDE_OUTLINE_INPUT_UNSAFE = 'Claude框架资料安全校验未通过，未发起生成';
export const CLAUDE_OUTLINE_RESPONSE_UNSAFE = 'Claude本次返回含凭证或无法安全解析；内容已隐藏，不能重试';
export const CLAUDE_OUTLINE_REQUEST_FAILED = 'Claude本次请求未完成；实际安全返回已保留，不能重试';
export const CLAUDE_OUTLINE_PARAMETERS_REJECTED = 'Claude中转站拒绝了本次参数；模型输出上界可能不受支持，不能重试';
export const CLAUDE_OUTLINE_OUTPUT_TRUNCATED = 'Claude本次输出被截断；当前请求上界或中转输出能力未满足要求，不能重试';

export type ClaudeOutputCapability = {
 model: string;
 max_output_tokens: number;
 source_url: string;
 checked_at: string;
 capability_sha256: string;
 relay_limit_verified: boolean;
 evidence_kind: 'relay_metadata' | 'documented_upstream_bound';
 metadata_source_url: string;
 provider_mapping_source_url?: string;
 provider_base_source_url?: string;
};
export type OutlineClaudeSnapshot = {model: string; max_output_tokens: number; system_prompt: string; user_prompt: string};
export type OutlineClaudeUsage = {input_tokens: number; output_tokens: number; thinking_tokens: number};
export type OutlineClaudeProgress = {
 requested_model: string;
 returned_model: string | null;
 usage: OutlineClaudeUsage;
 diagnostic: {transport_version?: 'anthropic_sse_v1'; request_stream?: true; stage: 'provider_usage_received'; http_status: number | null; response_bytes: number};
};
export type OutlineClaudeProgressCallback = (progress: OutlineClaudeProgress) => void | Promise<void>;

export function isClaudeModelId(value: unknown): value is string {
 return typeof value === 'string' && /^claude-[a-zA-Z0-9._-]{1,100}$/.test(value);
}
export function isOutputTokenLimit(value: unknown): value is number {
 return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Reject duplicate decoded JSON keys, including escaped spellings of the same key. */
export function parseUnambiguousClaudeJSON(raw: string): unknown {
 const value: unknown = JSON.parse(raw);
 const stack: (Set<string> | null)[] = [];
 for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '{') stack.push(new Set());
  else if (raw[i] === '[') stack.push(null);
  else if (raw[i] === '}' || raw[i] === ']') stack.pop();
  else if (raw[i] === '"') {
   const start = i++;
   while (i < raw.length && raw[i] !== '"') {if (raw[i] === '\\') i++; i++;}
   let next = i + 1; while (/\s/.test(raw[next] || '') && next < raw.length) next++;
   if (raw[next] === ':') {
    const keys = stack.at(-1), key: string = JSON.parse(raw.slice(start, i + 1));
    if (!keys || keys.has(key)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
    keys.add(key);
   }
  }
 }
 return value;
}

/** Exact ID membership is required for metadata and the one documented fallback. */
function exactCatalogRow(payload: unknown, expectedModel: string): Record<string, unknown> {
 if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
 const catalog = payload as {data?: unknown; has_more?: unknown};
 if (!Array.isArray(catalog.data) || catalog.data.length > 4096 || (catalog.has_more !== undefined && catalog.has_more !== false)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
 const matches = catalog.data.filter(row => row && typeof row === 'object' && !Array.isArray(row) && row.id === expectedModel);
 if (matches.length !== 1) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
 return matches[0];
}

/** The supported relay contract is data[].id + data[].max_output_tokens, both explicit. */
export function exactClaudeOutputLimit(payload: unknown, expectedModel: string): number {
 const model = exactCatalogRow(payload, expectedModel);
 if (!Object.hasOwn(model, 'max_output_tokens') || !isOutputTokenLimit(model.max_output_tokens)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
 return model.max_output_tokens;
}

/**
 * A caller-approved documentary fallback is intentionally not a verified relay limit.
 * It applies only when that exact documented API ID is present and its cap is absent.
 * A present but invalid value is evidence of ambiguity, never permission to fall back.
 */
export function claudeOutputLimitEvidence(payload: unknown, expectedModel: string, metadataSource: string) {
 const model = exactCatalogRow(payload, expectedModel);
 if (Object.hasOwn(model, 'max_output_tokens')) {
  if (!isOutputTokenLimit(model.max_output_tokens)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
  return {max_output_tokens: model.max_output_tokens, relay_limit_verified: true, evidence_kind: 'relay_metadata' as const, source_url: metadataSource, metadata_source_url: metadataSource};
 }
 const mentionsOtherOutputLimit = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([name, child]) => /^(?:max_?tokens|max_?output_?tokens|output_?token_?limit|max_?completion_?tokens)$/i.test(name) || mentionsOtherOutputLimit(child));
 };
 if (expectedModel !== 'claude-opus-5-5' || mentionsOtherOutputLimit(model)) throw Error(CLAUDE_OUTPUT_CAPABILITY_UNCONFIRMED);
 // These three fixed public documents were verified for this exact model mapping.
 // 128000 is the documented upstream request bound, not a claim of relay support.
 return {
  max_output_tokens: 128000,
  relay_limit_verified: false,
  evidence_kind: 'documented_upstream_bound' as const,
  source_url: 'https://platform.claude.com/docs/en/models/opus-5-5/overview',
  metadata_source_url: metadataSource,
  provider_mapping_source_url: 'https://yylx.io/blog/2026/09/23/claude-opus-5-5-vs-opus-5-vs-fable-5/',
  provider_base_source_url: 'https://docs.yylx.io/access/claude-code',
 };
}

/** Only actual JSON numbers are accounting data; never coerce provider text. */
export function outlineNumericUsage(value: unknown): OutlineClaudeUsage | null {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
 const source = value as Record<string, unknown>;
 const integer = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
 const details = source.output_tokens_details && typeof source.output_tokens_details === 'object' && !Array.isArray(source.output_tokens_details) ? source.output_tokens_details as Record<string, unknown> : {};
 if (!integer(source.input_tokens) && !integer(source.output_tokens) && !integer(details.thinking_tokens)) return null;
 return {input_tokens: integer(source.input_tokens) ? source.input_tokens : 0, output_tokens: integer(source.output_tokens) ? source.output_tokens : 0, thinking_tokens: integer(details.thinking_tokens) ? details.thinking_tokens : 0};
}

/** Read only a complete top-level usage member from a possibly interrupted JSON body. */
export function partialOutlineUsage(raw: string): OutlineClaudeUsage | null {
 let at = 0;
 const whitespace = () => {while (at < raw.length && /\s/.test(raw[at])) at++;};
 const quoted = (): string | null => {
  if (raw[at] !== '"') return null;
  const start = at++;
  while (at < raw.length) {if (raw[at] === '\\') {at += 2; continue;} if (raw[at++] === '"') {try {return JSON.parse(raw.slice(start, at));} catch {return null;}}}
  return null;
 };
 whitespace(); if (raw[at++] !== '{') return null;
 const names = new Set<string>(); let found: OutlineClaudeUsage | null = null;
 while (at < raw.length) {
  whitespace(); if (raw[at] === '}') return found;
  const name = quoted(); if (name === null || names.has(name)) return null; names.add(name);
  whitespace(); if (raw[at++] !== ':') return null; whitespace();
  const start = at; let depth = 0, inString = false, complete = false;
  for (; at < raw.length; at++) {
   const ch = raw[at];
   if (inString) {if (ch === '\\') at++; else if (ch === '"') inString = false; continue;}
   if (ch === '"') {inString = true; continue;}
   if (ch === '{' || ch === '[') depth++;
   else if (ch === '}' || ch === ']') {if (!depth) {complete = true; break;} depth--;}
   else if (ch === ',' && !depth) {complete = true; break;}
  }
  if (!complete) return found;
  if (name === 'usage') {
   try {found = outlineNumericUsage(parseUnambiguousClaudeJSON(raw.slice(start, at)));} catch {return null;}
  }
  whitespace(); if (raw[at] === '}') return found;
  if (raw[at++] !== ',') return null;
 }
 return found;
}
