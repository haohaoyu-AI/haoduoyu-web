// Inspection-only canonicalization for private streamed fields. No decoded text is
// returned. Legacy credential inspection and its matching scope remain unchanged.
export type StreamSafetySubcause = 'credential_match' | 'incomplete_escape' | 'invalid_utf8' | 'budget_exceeded' | 'protocol_invalid' | 'stream_incomplete';
export type StreamCredentialInspection = {status: 'safe' | 'pending' | 'unsafe'; subcause: StreamSafetySubcause | null};
export type StreamCredentialInspectionOptions = {allowIncompleteEscape?: boolean; maxCharacters?: number; maxNodes?: number; maxDepth?: number; maxLayers?: number};
export type StreamCredentialInspector = (value: unknown, options: {allowIncompleteEscape: boolean}) => StreamCredentialInspection;
const generic = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,})\b/i;
const fieldText = /["']?(?:api[_-]?key|authorization|access[_-]?token|password|secret)["']?\s*[:=]\s*["']?(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{12,}/i;
const fieldName = /^(?:api[_-]?key|authorization|access[_-]?token|password|secret)$/i;
const credentialValue = /^(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{12,}$/i;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const unescape = (text: string) => text.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/g, escape => JSON.parse('"' + escape + '"'));
const bounded = (requested: number | undefined, maximum: number) => requested === undefined ? maximum : Number.isSafeInteger(requested) && requested > 0 && requested <= maximum ? requested : 0;

function utf8Sequence(bytes: number[]): 'complete' | 'incomplete' | 'invalid' {
 for (let at = 0; at < bytes.length;) {
  const first = bytes[at++]; if (first <= 0x7f) continue;
  const needed = first >= 0xc2 && first <= 0xdf ? 1 : first >= 0xe0 && first <= 0xef ? 2 : first >= 0xf0 && first <= 0xf4 ? 3 : -1;
  if (needed < 0) return 'invalid';
  for (let i = 0; i < needed; i++) {
   if (at >= bytes.length) return 'incomplete';
   const next = bytes[at++];
   if (next < 0x80 || next > 0xbf || (i === 0 && ((first === 0xe0 && next < 0xa0) || (first === 0xed && next > 0x9f) || (first === 0xf0 && next < 0x90) || (first === 0xf4 && next > 0x8f)))) return 'invalid';
  }
 }
 return 'complete';
}

/** The only pending result is an incomplete encoding suffix in a private field.
 * Call without allowIncompleteEscape at a closed block and at final EOF. Budget
 * exhaustion, invalid encoding, unknown objects, or inspector errors fail closed. */
export function inspectStreamCredentialValue(input: unknown, known: string[] = [], options: StreamCredentialInspectionOptions = {}): StreamCredentialInspection {
 const limits = {characters: bounded(options.maxCharacters, 2000000), nodes: bounded(options.maxNodes, 20000), depth: bounded(options.maxDepth, 32), layers: bounded(options.maxLayers, 16)};
 let characters = 0, nodes = 0, pending = false, failure: StreamSafetySubcause | null = null;
 const secrets = Array.isArray(known) ? known.filter(key => typeof key === 'string' && !!key) : [], seen = new Set<object>();
 const fail = (cause: StreamSafetySubcause) => {failure ||= cause;};
 const direct = (text: string) => generic.test(text) || fieldText.test(text) || secrets.some(key => text.includes(key) || (uuid.test(key) && text.toLowerCase().includes(key.toLowerCase())));
 const incomplete = () => {if (options.allowIncompleteEscape) pending = true; else fail('incomplete_escape');};
 type StringFlags = {field: boolean; value: boolean};
 function inspectString(source: string, depth: number): StringFlags {
  const flags = {field: false, value: false}; let text = source;
  for (let layer = 0; layer < limits.layers && !failure; layer++) {
   characters += text.length; if (characters > limits.characters) {fail('budget_exceeded'); break;}
   if (direct(text)) {fail('credential_match'); break;}
   flags.field ||= fieldName.test(text); flags.value ||= credentialValue.test(text);
   // Embedded JSON must retain key/value association, including escaped keys.
   if (/^\s*[\[{\"]/.test(text)) {
    try {const nested: unknown = JSON.parse(text); if (nested !== text) visit(nested, depth + 1);} catch { /* Prose need not be JSON. */ }
    if (failure) break;
   }
   let prepared = text;
   const broken = /\\u(?![0-9a-fA-F]{4})/.exec(prepared);
   if (broken) {
    const suffix = prepared.slice(broken.index);
    if (/^\\u[0-9a-fA-F]{0,3}$/.test(suffix)) {incomplete(); prepared = prepared.slice(0, broken.index);}
    else {fail('incomplete_escape'); break;}
   }
   // An odd trailing backslash may begin another encoded layer. Keep it private
   // while open, but ordinary literal backslashes are legal in complete prose.
   const trailing = /\\+$/.exec(prepared);
   if (options.allowIncompleteEscape && trailing && trailing[0].length % 2) {pending = true; prepared = prepared.slice(0, -1);}
   let next = unescape(prepared);
   next = next.replace(/(?:%[0-9a-fA-F]{2})+/g, (part, at: number) => {
    const bytes = part.match(/[0-9a-fA-F]{2}/g)!.map(hex => parseInt(hex, 16)), state = utf8Sequence(bytes);
    if (state !== 'complete') {
     if (state === 'incomplete' && at + part.length === next.length && options.allowIncompleteEscape) {pending = true; return '';}
     fail(state === 'incomplete' ? 'incomplete_escape' : 'invalid_utf8'); return '';
    }
    try {return decodeURIComponent(part);} catch {fail('invalid_utf8'); return '';}
   });
   // A percent sign alone is ordinary prose. A trailing hex nibble is an
   // incomplete encoded byte; it can be completed only inside a private buffer.
   const percentTail = /%[0-9a-fA-F]$/.exec(next);
   if (percentTail) {incomplete(); next = next.slice(0, percentTail.index);}
   if (failure) break;
   // JSON escapes may produce a surrogate pair across consecutive deltas. The
   // complete accumulated field is checked only after both pieces are present.
   for (let at = 0; at < next.length; at++) {
    const unit = next.charCodeAt(at);
    if (unit >= 0xd800 && unit <= 0xdbff) {
     const low = next.charCodeAt(at + 1);
     if (low >= 0xdc00 && low <= 0xdfff) {at++; continue;}
     if (at === next.length - 1 && options.allowIncompleteEscape) {pending = true; next = next.slice(0, -1); break;}
     fail('invalid_utf8'); break;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {fail('invalid_utf8'); break;}
   }
   if (failure || next === text) return flags;
   text = next;
  }
  if (!failure) fail('budget_exceeded'); // No unbounded canonicalization layers.
  return flags;
 }
 function visit(value: unknown, depth: number): StringFlags | null {
  if (failure) return null;
  if (++nodes > limits.nodes || depth > limits.depth) {fail('budget_exceeded'); return null;}
  if (typeof value === 'string') return inspectString(value, depth);
  if (Array.isArray(value)) {
   if (seen.has(value)) {fail('budget_exceeded'); return null;} seen.add(value);
   for (const item of value) visit(item, depth + 1);
   seen.delete(value); return null;
  }
  if (value && typeof value === 'object') {
   if (Object.prototype.toString.call(value) !== '[object Object]') {fail('protocol_invalid'); return null;}
   if (seen.has(value)) {fail('budget_exceeded'); return null;} seen.add(value);
   for (const [key, item] of Object.entries(value)) {
    const name = visit(key, depth + 1), content = visit(item, depth + 1);
    if (name?.field && typeof item === 'string' && content?.value) fail('credential_match');
   }
   seen.delete(value);
  } else if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) fail('protocol_invalid');
  return null;
 }
 try {
  if (Object.values(limits).some(n => !n) || !Array.isArray(known) || known.some(key => typeof key !== 'string') || known.join('').length > 2000000) fail('budget_exceeded');
  else visit(input, 0);
 } catch {fail('budget_exceeded');}
 return failure ? {status: 'unsafe', subcause: failure} : pending ? {status: 'pending', subcause: 'incomplete_escape'} : {status: 'safe', subcause: null};
}
