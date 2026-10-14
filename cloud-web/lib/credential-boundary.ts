// Pure, bounded inspection for untrusted model/agent payloads. Never log input.
export type CredentialInspection = {value: unknown; hit: boolean; suppressed: boolean};
const removed = '[unsafe credential content removed]';
const generic = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,})\b/i;
const fieldText = /["']?(?:api[_-]?key|authorization|access[_-]?token|password|secret)["']?\s*[:=]\s*["']?(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{12,}/i;
const fieldName = /^(?:api[_-]?key|authorization|access[_-]?token|password|secret)$/i;
const credentialValue = /^(?:Bearer\s+)?[A-Za-z0-9._~+/=-]{12,}$/i;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
// Zero-width matching also visits UUIDs whose hex tail overlaps another UUID.
const uuidInText = /(?=([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}))/gi;
// Each caller first matches one complete JSON escape. Decode its code unit
// directly instead of parsing a separate JSON document for every character.
export function decodeCredentialJsonEscape(escape:string):string {
 if(escape[1]==='u'&&/^\\u[0-9a-fA-F]{4}$/.test(escape))return String.fromCharCode(parseInt(escape.slice(2),16));
 if(escape.length!==2||escape[0]!=='\\')throw Error('uninspectable');
 switch(escape[1]){case '"':return '"';case '\\':return '\\';case '/':return '/';case 'b':return '\b';case 'f':return '\f';case 'n':return '\n';case 'r':return '\r';case 't':return '\t';default:throw Error('uninspectable');}
}
const unescape = (text: string) => text.replace(/\\(?:u[0-9a-fA-F]{4}|["\\/bfnrt])/g, decodeCredentialJsonEscape);
function decodedMatch(text: string, pattern: RegExp) {
 for (let i = 0; i < 16; i++) {
  if (pattern.test(text)) return true;
  let next = unescape(text);
  // Only a JSON string can replace next. Other prefixes cannot produce a
  // string, so preserve unescape without throwing for ordinary field names.
  if(/^\s*"/.test(text))try {const parsed: unknown = JSON.parse(text); if (typeof parsed === 'string') next = parsed;} catch { /* Not a JSON string. */ }
  if (next === text) return false;
  text = next;
 }
 return true; // Uninspectable nesting fails closed.
}

export function inspectCredentialValue(input: unknown, known: string[] = []): CredentialInspection {
 const secrets = known.filter(Boolean);
 // UUID matching has always ignored case. Match every textual candidate once
 // against the known set; opaque keys retain their exact matching semantics.
 const stringSecrets=secrets.every(key=>typeof key==='string');
 const uuids=new Set(stringSecrets?secrets.filter(key=>uuid.test(key)).map(key=>key.toLowerCase()):[]);
 const opaque=stringSecrets?[...new Set(secrets.filter(key=>!uuid.test(key)))]:[];
 let nodes = 0, characters = 0;
 const blocked = (): CredentialInspection => ({value: removed, hit: true, suppressed: true});
 const direct = (text: string) => {
  if(generic.test(text)||fieldText.test(text))return true;
  if(!stringSecrets)return secrets.some(key=>text.includes(key)||(uuid.test(key)&&text.toLowerCase().includes(key.toLowerCase())));
  if(opaque.some(key=>text.includes(key)))return true;
  if(!uuids.size||text.length<36)return false;
  for(const match of text.matchAll(uuidInText))if(uuids.has(match[1].toLowerCase()))return true;return false;
 };
 function visit(value: unknown, depth: number): CredentialInspection {
  if (++nodes > 20000 || depth > 32) return blocked();
  if (typeof value === 'string') {
   let decoded = value;
   for (let layer = 0; layer < 16; layer++) {
    characters += decoded.length;
    if (characters > 2000000 || direct(decoded)) return blocked();
    // Parsing embedded JSON preserves key/value association (including escaped keys).
    if (/^\s*[\[{\"]/.test(decoded)) {
     try {
      const nested: unknown = JSON.parse(decoded);
      if (nested !== decoded && visit(nested, depth + 1).hit) return blocked();
     } catch { /* Plain prose need not be valid JSON. Inspect its escape layers below. */ }
    }
    if (/\\u(?![0-9a-fA-F]{4})/.test(decoded)) return blocked();
    const next = unescape(decoded);
    if (next === decoded) return {value, hit: false, suppressed: false};
    decoded = next;
   }
   return blocked();
  }
  if (Array.isArray(value)) {
   const entries = value.map(item => visit(item, depth + 1));
   return {value: entries.map(item => item.value), hit: entries.some(item => item.hit), suppressed: entries.some(item => item.suppressed)};
  }
  if (value && typeof value === 'object') {
   const entries: [string, unknown][] = [], names = new Set<string>();
   let hit = false, suppressed = false;
   for (const [key, item] of Object.entries(value)) {
    const name = visit(key, depth + 1), content = visit(item, depth + 1);
    const pairHit = decodedMatch(key, fieldName) && typeof item === 'string' && decodedMatch(item, credentialValue);
    let safeKey = name.hit ? removed : key;
    while (names.has(safeKey)) safeKey += '_';
    names.add(safeKey);
    entries.push([safeKey, pairHit ? removed : content.value]);
    hit ||= name.hit || content.hit || pairHit;
    suppressed ||= name.suppressed || content.suppressed || pairHit;
   }
   return {value: Object.fromEntries(entries), hit, suppressed};
  }
  return {value, hit: false, suppressed: false};
 }
 return visit(input, 0);
}

export function numericCredentialSafeUsage(value: unknown) {
 if (!value || typeof value !== 'object') return null;
 const source = value as Record<string, unknown>;
 const safe = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
 return {input_tokens: safe(source.input_tokens), output_tokens: safe(source.output_tokens), thinking_tokens: safe(source.thinking_tokens)};
}
