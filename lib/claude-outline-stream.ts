import {outlineNumericUsage, parseUnambiguousClaudeJSON, type OutlineClaudeUsage} from './claude-model-capability';
import type {StreamCredentialInspection, StreamCredentialInspector, StreamSafetySubcause} from './stream-credential-buffer';

export type OutlineMessageStreamOptions = {inspectionVersion: 'buffered_v2'; inspect: StreamCredentialInspector; maxBufferedCharacters?: number};

// Isolated Messages SSE decoder. No network, retries, credentials, or persistence.
// https://platform.claude.com/docs/en/build-with-claude/streaming
export class OutlineMessageStream {
 private readonly inspect: (value: unknown) => boolean;
 private readonly bufferedOptions: OutlineMessageStreamOptions | null;
 constructor(inspectOrOptions: ((value: unknown) => boolean) | OutlineMessageStreamOptions = () => false) {
  this.bufferedOptions = typeof inspectOrOptions === 'function' ? null : inspectOrOptions;
  this.inspect = typeof inspectOrOptions === 'function' ? inspectOrOptions : () => false;
  if (this.bufferedOptions && (this.bufferedOptions.inspectionVersion !== 'buffered_v2' || typeof this.bufferedOptions.inspect !== 'function')) this.suppress('protocol_invalid');
 }
 private completeSafety = false;
 private subcause: StreamSafetySubcause | null = null;
 private inspectedFrames = 0;
 private bufferedCharacters = 0;
 private readonly blockFields: Record<string, string>[] = [];
 get safetyEvidence() {
  return {inspection_version: this.bufferedOptions ? 'buffered_v2' as const : 'legacy_v1' as const, complete: this.completeSafety, response_suppressed: !!this.bufferedOptions && !this.completeSafety, subcause: this.subcause, inspected_frames: this.inspectedFrames, buffered_characters: this.bufferedCharacters, raw_retained: false as const};
 }
 private suppress(cause: StreamSafetySubcause) {this.unsafe = true; this.completeSafety = false; this.subcause ||= cause;}
 // Transport failures occur before/around the decoder, so the provider reports
 // invalid UTF-8 or read interruption explicitly. This never releases text.
 abort(cause: StreamSafetySubcause = 'stream_incomplete') {if (this.bufferedOptions) this.suppress(cause);}
 private inspectPrivate(value: unknown, allowIncompleteEscape = false): StreamCredentialInspection {
  if (!this.bufferedOptions) return {status: this.inspect(value) ? 'unsafe' : 'safe', subcause: null};
  let result: StreamCredentialInspection;
  try {result = this.bufferedOptions.inspect(value, {allowIncompleteEscape});} catch {this.suppress('budget_exceeded'); return {status: 'unsafe', subcause: 'budget_exceeded'};}
  const validCause = new Set<StreamSafetySubcause>(['credential_match', 'incomplete_escape', 'invalid_utf8', 'budget_exceeded', 'protocol_invalid', 'stream_incomplete']);
  if (!result || !['safe', 'pending', 'unsafe'].includes(result.status) || (result.status === 'safe' ? result.subcause !== null : !result.subcause || !validCause.has(result.subcause)) || (result.status === 'pending' && result.subcause !== 'incomplete_escape')) {this.suppress('budget_exceeded'); return {status: 'unsafe', subcause: 'budget_exceeded'};}
  if (result.status === 'unsafe' || (result.status === 'pending' && !allowIncompleteEscape)) this.suppress(result.subcause || 'incomplete_escape');
  return result;
 }
 private retain(value: string) {
  if (!this.bufferedOptions) return;
  this.bufferedCharacters += value.length;
  const limit = this.bufferedOptions.maxBufferedCharacters ?? 2000000;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 2000000 || this.bufferedCharacters > limit) {this.suppress('budget_exceeded'); throw Error('outline_stream_inspection_budget');}
 }
 private strictFrameView(p: Record<string, unknown>): unknown {
  const type = p.type as string, cloned = {...p};
  if (type === 'message_start') {
   const m = p.message as Record<string, unknown> | undefined;
   if (!m || typeof m !== 'object' || Array.isArray(m)) {this.inspectPrivate(p); this.invalid();}
  }
  if (type === 'content_block_start' || type === 'content_block_delta') {
   const key = type === 'content_block_start' ? 'content_block' : 'delta', d = p[key] as Record<string, unknown> | undefined;
   if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.type !== 'string') {this.inspectPrivate(p); this.invalid();}
   const knownTypes = type === 'content_block_start' ? ['text', 'thinking', 'redacted_thinking'] : ['text_delta', 'thinking_delta', 'signature_delta'];
   if (!knownTypes.includes(d.type)) {this.inspectPrivate(p); this.invalid();}
   const field = d.type === 'text' || d.type === 'text_delta' ? 'text' : d.type === 'thinking' || d.type === 'thinking_delta' ? 'thinking' : null;
   // Only protocol-validated author/thinking fields may be privately buffered.
   // Signature/redacted and all unknown metadata fields remain strictly inspected.
   if (field) {
    const index = p.index, block = typeof index === 'number' && Number.isInteger(index) ? this.blocks[index] : null;
    const validState = type === 'content_block_start' ? this.started && !this.deltaReceived && index === this.blocks.length && !this.blocks.some(b => !b.closed) : block && !block.closed && !this.deltaReceived && ((field === 'text' && block.type === 'text') || (field === 'thinking' && block.type === 'thinking'));
    if (!validState || typeof d[field] !== 'string') {this.inspectPrivate(p); this.invalid();}
    cloned[key] = {...d, [field]: ''};
   }
  }
  if (type === 'message_delta') {
   const d = p.delta as Record<string, unknown> | undefined;
   if (!d || typeof d !== 'object' || Array.isArray(d)) {this.inspectPrivate(p); this.invalid();}
  }
  // Safe provider metadata may evolve. Never mask an unknown field or infer any
  // lifecycle evidence from unknown event types. Every metadata field is strictly
  // inspected and privately audited, and no raw metadata can leave buffered_v2.
  return cloned;
 }
 unsafe = false;
 private fragments = '';
 private fragmentFields: Record<string, string> = Object.create(null);
 private providerStrings = '';
 private providerKeys = '';
 private providerFields: Record<string, string> = Object.create(null);
 private auditNodes = 0;
 private auditEvent(value: unknown, field = '', depth = 0) {
  if (this.unsafe) return;
  if (depth === 0) this.auditNodes = 0;
  if (++this.auditNodes > 20000 || depth > 32) {if (this.bufferedOptions) this.suppress('budget_exceeded'); else this.unsafe = true; return;}
  if (typeof value === 'string') {
   this.retain(value);
   this.providerStrings += value;
   this.providerFields[field] = (this.providerFields[field] || '') + value;
  } else if (Array.isArray(value)) {
   for (const item of value) this.auditEvent(item, field, depth + 1);
  } else if (value && typeof value === 'object') {
   for (const [key, item] of Object.entries(value)) {this.retain(key); this.providerKeys += key; this.auditEvent(item, key, depth + 1);}
  }
 }
 private appendFragments(value: Record<string, unknown>, index: number) {
  if (this.unsafe) return;
  const actualFields = value.type === 'text' || value.type === 'text_delta' ? ['text'] : value.type === 'thinking' ? ['thinking', 'signature'] : value.type === 'thinking_delta' ? ['thinking'] : value.type === 'signature_delta' ? ['signature'] : value.type === 'redacted_thinking' ? ['data'] : [];
  for (const [key, item] of Object.entries(value)) {
   if (this.bufferedOptions && !actualFields.includes(key)) continue;
   if (key !== 'type' && typeof item === 'string') {this.retain(item); this.fragments += item; this.fragmentFields[key] = (this.fragmentFields[key] || '') + item; if (this.bufferedOptions) {const fields = this.blockFields[index] ||= Object.create(null); fields[key] = (fields[key] || '') + item;}}
  }
 }
 private pending = '';
 private event = '';
 private data: string[] = [];
 private frameSize = 0;
 private first = true;
 private started = false;
 private deltaReceived = false;
 private blocks: {type: string; text: string; closed: boolean}[] = [];
 private privateModel: string | null = null;
 private privateStopReason: string | null = null;
 get model() {return !this.bufferedOptions || this.completeSafety ? this.privateModel : null;}
 get stopReason() {return !this.bufferedOptions || this.completeSafety ? this.privateStopReason : null;}
 usage: OutlineClaudeUsage | null = null;
 stopped = false;
 private get authorText() {return this.blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');}
 get text() {return !this.bufferedOptions || this.completeSafety ? this.authorText : '';}
 get unsafeFragments() {return this.bufferedOptions ? this.unsafe : this.inspect([this.fragments, ...Object.values(this.fragmentFields), this.providerStrings, this.providerKeys, ...Object.values(this.providerFields)]);}
 get incompleteFrame() {return !!(this.pending || this.event || this.data.length);}
 private invalid(): never {if (this.bufferedOptions) this.suppress('protocol_invalid'); throw Error('outline_invalid_stream');}
 private account(value: unknown) {
  const next = outlineNumericUsage(value); if (!next) return;
  const source = value as Record<string, unknown>, details = source.output_tokens_details as Record<string, unknown> | undefined;
  const previous = this.usage || {input_tokens: 0, output_tokens: 0, thinking_tokens: 0};
  const numeric = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  // message_delta token counts are cumulative, not additions. Omitted fields persist.
  this.usage = {input_tokens: numeric(source.input_tokens) ? next.input_tokens : previous.input_tokens, output_tokens: numeric(source.output_tokens) ? next.output_tokens : previous.output_tokens, thinking_tokens: numeric(details?.thinking_tokens) ? next.thinking_tokens : previous.thinking_tokens};
 }
 private dispatch() {
  const event = this.event, data = this.data.join('\n'); this.event = ''; this.data = []; this.frameSize = 0;
  if (!data) return;
  let decoded: unknown; try {decoded = parseUnambiguousClaudeJSON(data);} catch {this.invalid();}
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) this.invalid();
  if (!this.bufferedOptions) {this.unsafe ||= this.inspect(decoded); this.auditEvent(decoded);}
  const p = decoded as Record<string, unknown> & {message?: Record<string, unknown>; content_block?: Record<string, unknown>; delta?: Record<string, unknown>; index?: number}; // Untrusted fields are validated before use.
  if (typeof p.type !== 'string' || !event || event !== p.type) this.invalid();
  if (this.stopped) this.invalid();
  if (this.bufferedOptions) {
   if (++this.inspectedFrames > 20000) {this.suppress('budget_exceeded'); throw Error('outline_stream_inspection_budget');}
   const metadata = this.strictFrameView(p); this.inspectPrivate(metadata); this.auditEvent(metadata);
  }
  if (p.type === 'error') throw Error('outline_stream_error');
  if (p.type === 'ping') return;
  switch (p.type) {
   case 'message_start': {
    const m = p.message;
    if (this.started || !m || m.type !== 'message' || m.role !== 'assistant' || typeof m.model !== 'string' || !m.model || m.model.length > 150 || !Array.isArray(m.content) || m.content.length || m.stop_reason != null) this.invalid();
    this.started = true; this.privateModel = m.model; this.account(m.usage); break;
   }
   case 'content_block_start': {
    if (!this.started || this.deltaReceived || !(typeof p.index === 'number' && Number.isInteger(p.index)) || p.index !== this.blocks.length || this.blocks.some(b => !b.closed) || !p.content_block || typeof p.content_block.type !== 'string') this.invalid();
    const b = p.content_block;
    if (b.type !== 'text' && b.type !== 'thinking' && b.type !== 'redacted_thinking') this.invalid();
    if (b.type === 'text' && typeof b.text !== 'string') this.invalid();
    if (b.type === 'thinking' && typeof b.thinking !== 'string') this.invalid();
    if (b.type === 'redacted_thinking' && typeof b.data !== 'string') this.invalid();
    this.appendFragments(b, p.index!);
    this.blocks.push({type: b.type, text: typeof b.text === 'string' && b.type === 'text' && (!this.bufferedOptions || !this.unsafe) ? b.text : '', closed: false}); break;
   }
   case 'content_block_delta': {
    const b = (typeof p.index === 'number' && Number.isInteger(p.index)) ? this.blocks[p.index] : null;
    if (!b || b.closed || this.deltaReceived || !p.delta || typeof p.delta.type !== 'string') this.invalid();
    const d = p.delta;
    if (!((b.type === 'text' && d.type === 'text_delta' && typeof d.text === 'string') || (b.type === 'thinking' && ((d.type === 'thinking_delta' && typeof d.thinking === 'string') || (d.type === 'signature_delta' && typeof d.signature === 'string'))))) this.invalid();
    this.appendFragments(d, p.index!);
    if (p.delta.type === 'text_delta') {if (b.type !== 'text' || typeof p.delta.text !== 'string') this.invalid(); if (!this.bufferedOptions || !this.unsafe) b.text += p.delta.text;}
    break;
   }
   case 'content_block_stop': {
    const b = (typeof p.index === 'number' && Number.isInteger(p.index)) ? this.blocks[p.index] : null;
    if (!b || b.closed || this.deltaReceived) this.invalid(); if (this.bufferedOptions) this.inspectPrivate(this.blockFields[p.index!] || {}); b.closed = true; break;
   }
   case 'message_delta': {
    if (!this.started || this.blocks.some(b => !b.closed) || !p.delta || typeof p.delta !== 'object') this.invalid();
    this.deltaReceived = true;
    if (p.delta.stop_reason != null) {if (typeof p.delta.stop_reason !== 'string' || p.delta.stop_reason.length > 80 || this.privateStopReason !== null) this.invalid(); this.privateStopReason = p.delta.stop_reason;}
    // A changed serving model must not be silently attributed to message_start.
    if (p.delta.model !== undefined) {if (typeof p.delta.model !== 'string' || !p.delta.model || p.delta.model.length > 150) this.invalid(); this.privateModel = p.delta.model;}
    this.account(p.usage); break;
   }
   case 'message_stop':
    if (!this.started || !this.deltaReceived || this.privateStopReason === null || this.blocks.some(b => !b.closed)) this.invalid();
    this.stopped = true; break;
   default: break; // Forward-compatible unknown event types confer no completion evidence.
  }
 }
 private pushInternal(chunk: string, final = false) {
  if (this.bufferedOptions && this.completeSafety && chunk) this.invalid();
  if (this.first && chunk) {chunk = chunk.replace(/^\uFEFF/, ''); this.first = false;}
  this.pending += chunk;
  for (;;) {
   const at = this.pending.search(/[\r\n]/); if (at < 0) break;
   if (this.pending[at] === '\r' && at === this.pending.length - 1 && !final) break;
   const line = this.pending.slice(0, at), n = this.pending[at] === '\r' && this.pending[at + 1] === '\n' ? 2 : 1;
   this.pending = this.pending.slice(at + n); this.frameSize += line.length;
   if (this.frameSize > 1024 * 1024) throw Error('outline_stream_event_too_large');
   if (!line) {this.dispatch(); continue;}
   if (line[0] === ':') {if (this.bufferedOptions) {this.inspectPrivate(line.slice(1)); this.auditEvent(line.slice(1), 'sse_comment');} continue;}
   const colon = line.indexOf(':'), key = colon < 0 ? line : line.slice(0, colon);
   let value = colon < 0 ? '' : line.slice(colon + 1); if (value.startsWith(' ')) value = value.slice(1);
   if (key === 'event') {if (this.bufferedOptions) {this.inspectPrivate(value); this.auditEvent(value, 'sse_event');} this.event = value;}
   else if (key === 'data') this.data.push(value);
   else if (this.bufferedOptions) {const metadata = {[key]: value}; this.inspectPrivate(metadata); this.auditEvent(metadata);}
  }
  if (this.pending.length + this.frameSize > 1024 * 1024) throw Error('outline_stream_event_too_large');
  // SSE dispatch requires a blank line; EOF cannot manufacture message_stop.
  if (final && (this.incompleteFrame || !this.stopped)) {if (this.bufferedOptions) this.suppress('stream_incomplete'); throw Error('outline_stream_incomplete');}
  if (final && this.bufferedOptions) {
   // Inspect each bounded aggregate once. Keep field-name association intact,
   // and do not multiply the character budget by rescanning duplicate copies
   // inside one synthetic array. Raw SSE is never part of this safety evidence.
   for (const value of [this.fragments, this.fragmentFields, this.providerStrings, this.providerKeys, this.providerFields, this.authorText]) this.inspectPrivate(value);
   this.completeSafety = !this.unsafe;
  }
 }
 push(chunk: string, final = false) {
  try {this.pushInternal(chunk, final);} catch (error) {
   if (this.bufferedOptions) {
    const reason = error instanceof Error ? error.message : '';
    this.suppress(reason === 'outline_stream_event_too_large' || reason === 'outline_stream_inspection_budget' ? 'budget_exceeded' : reason === 'outline_stream_incomplete' ? 'stream_incomplete' : 'protocol_invalid');
   }
   throw error;
  }
 }
}
