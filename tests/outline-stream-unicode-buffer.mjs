// Pure synthetic SSE safety regression. No fetch, paid provider, persistence, or build.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const modules = {}, calls = {network: 0, paid: 0, storage: 0};
function load(name) {
 if (modules[name]) return modules[name]; const ex = {}; modules[name] = ex;
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports: ex, require: item => {assert.ok(item.startsWith('./')); return load(item.slice(2));}, TextEncoder, TextDecoder, Uint8Array, Error, Date, Set,
  fetch: () => {calls.network++; throw Error('Network prohibited');},
 }); return ex;
}
const {OutlineMessageStream} = load('claude-outline-stream');
const {inspectStreamCredentialValue: inspect} = load('stream-credential-buffer');
const old = load('editorial-credential-text').editorialCredentialInspection;
const known = ['opaque.synthetic.credential.for-buffer-test', '01234567-89ab-cdef-0123-456789abcdef', '密钥🧪syntheticprivateabcdef'];
const percent = text => [...new TextEncoder().encode(text)].map(byte => '%' + byte.toString(16).padStart(2, '0')).join('');
const unicode = text => text.split('').map(char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const v2 = (extra = {}) => new OutlineMessageStream({inspectionVersion: 'buffered_v2', inspect: (value, options) => inspect(value, known, options), ...extra});
const frame = p => 'event: ' + p.type + '\ndata: ' + JSON.stringify(p) + '\n\n';
const start = frame({type: 'message_start', message: {id: 'synthetic', type: 'message', role: 'assistant', model: 'claude-opus-synthetic', content: [], stop_reason: null, stop_sequence: null, usage: {input_tokens: 40, output_tokens: 0}}});
const block = (kind = 'text', index = 0, initial = '') => frame({type: 'content_block_start', index, content_block: kind === 'text' ? {type: kind, text: initial} : {type: kind, thinking: initial}});
const delta = (text, kind = 'text', index = 0) => frame({type: 'content_block_delta', index, delta: kind === 'text' ? {type: 'text_delta', text} : {type: 'thinking_delta', thinking: text}});
const close = (index = 0) => frame({type: 'content_block_stop', index});
const end = frame({type: 'message_delta', delta: {stop_reason: 'end_turn', stop_sequence: null}, usage: {output_tokens: 90, output_tokens_details: {thinking_tokens: 4}}}) + frame({type: 'message_stop'});
function run(parts, kind = 'text') {const s = v2(); s.push(start + block(kind)); for (const part of parts) {s.push(delta(part, kind)); assert.equal(s.text, ''); assert.equal(s.model, null);} s.push(close() + end); assert.equal(s.text, ''); s.push('', true); return s;}
assert.equal(old({delta: {type: 'text_delta', text: '\\u4'}}, []), true, 'root false-positive reproduced with unchanged old boundary');
assert.equal(old({delta: {type: 'text_delta', text: '\\u4e00'}}, []), false);
assert.equal(inspect('\\u4', []).status, 'unsafe');
assert.equal(inspect('\\u4', [], {allowIncompleteEscape: true}).status, 'pending');
assert.equal(inspect('\\u4e00', []).status, 'safe');
for (const parts of [['{"title":"\\u4', 'e00"}'], ['{"title":"\\', 'u4e', '00"}'], ['{"title":"\\uD83D', '\\uDE00"}'], ['{"title":"\\', '\\u4', 'e00"}'], ['标题：', '中文🧪内容']]) {
 const s = run(parts); assert.equal(s.unsafe, false, parts.join('')); assert.equal(s.text, parts.join('')); assert.equal(s.safetyEvidence.complete, true); assert.equal(s.safetyEvidence.subcause, null); assert.equal(s.model, 'claude-opus-synthetic'); assert.equal(s.usage.output_tokens, 90);
}
// Byte split transport decoding and UTF-8 Unicode content stay private until EOF.
const wire = start + block() + delta('{"title":"\\u4') + delta('e00，🧪"}') + close() + end;
for (const size of [1, 2, 7, 64]) {
 const s = v2(), decoder = new TextDecoder('utf-8', {fatal: true}), bytes = new TextEncoder().encode(wire);
 for (let at = 0; at < bytes.length; at += size) {s.push(decoder.decode(bytes.slice(at, at + size), {stream: true})); assert.equal(s.text, '');}
 s.push(decoder.decode(), true); assert.equal(s.unsafe, false); assert.equal(s.text, '{"title":"\\u4e00，🧪"}');
}
// Start-block text may also end in a split Unicode escape. Raw serialized SSE
// deliberately remains unacceptable to the old boundary and is never returned.
const initial = v2(); initial.push(start + block('text', 0, '{"title":"\\u4')); initial.push(delta('e00"}') + close() + end); initial.push('', true); assert.equal(initial.text, '{"title":"\\u4e00"}');
assert.equal(old({raw_response: wire}, []), true, 'serialized raw SSE contains the isolated escape suffix and must be omitted');
assert.equal(initial.safetyEvidence.raw_retained, false);
const evidence = JSON.stringify(initial.safetyEvidence); assert.equal(evidence.includes('title'), false); assert.equal(evidence.includes('claude-opus-synthetic'), false);
const large = run(['安全文字'.repeat(165000)]); assert.equal(large.unsafe, false, '660k benign text must not exhaust a budget by duplicate aggregate copies'); assert.equal(large.text.length, 660000);
console.log('PASS legitimate Unicode escape, double-encoded slash, surrogate pair and byte-split UTF-8; no author/model exposure before final EOF');
for (const secret of known) for (const attack of [secret, unicode(secret), percent(secret), unicode(unicode(secret)), percent(percent(secret))]) for (const kind of ['text', 'thinking']) {
 const at = Math.max(1, Math.floor(attack.length / 2)), s = run([attack.slice(0, at), attack.slice(at)], kind);
 assert.equal(s.unsafe, true, kind + ' encoded credential'); assert.equal(s.text, ''); assert.equal(s.model, null); assert.equal(s.safetyEvidence.subcause, 'credential_match'); assert.equal(s.safetyEvidence.complete, false);
}
for (const attack of ['sk-ant-' + 'a'.repeat(32), 'ghp_' + 'a'.repeat(35), '-----BEGIN PRIVATE KEY-----', 'authorization: Bearer syntheticvaluelong12345', '{"api\\u005fkey":"syntheticvaluelong12345"}', '{"secret":"' + percent('syntheticvaluelong12345') + '"}']) {
 const s = run([attack.slice(0, 5), attack.slice(5)]); assert.equal(s.unsafe, true, attack); assert.equal(s.safetyEvidence.subcause, 'credential_match');
}
assert.equal(run([known[1].toUpperCase()]).safetyEvidence.subcause, 'credential_match');
// A token split across separate content types/blocks is also detected by the
// private all-content aggregate. Safe thinking is never returned as author text.
const cross = v2(); cross.push(start + block('thinking') + delta(known[0].slice(0, 17), 'thinking') + close()); cross.push(block('text', 1) + delta(known[0].slice(17), 'text', 1) + close(1) + end); cross.push('', true); assert.equal(cross.unsafe, true); assert.equal(cross.text, '');
const thinking = v2(); thinking.push(start + block('thinking') + delta('仅私有思考片段\\u4', 'thinking') + delta('e00', 'thinking') + close() + block('text', 1) + delta('安全正文', 'text', 1) + close(1) + end); thinking.push('', true); assert.equal(thinking.text, '安全正文'); assert.equal(thinking.text.includes('私有'), false);
console.log('PASS captured key/token, generic credential, escaped field key, Unicode/percent/double encoding and cross-content fragment attack suppression');
// Provider metadata is forward-compatible at every supported frame level. Only
// the validated text/thinking field is masked for private cumulative buffering.
const extended = v2();
extended.push(frame({type: 'message_start', container: {id: 'benign-container'}, message: {type: 'message', role: 'assistant', model: 'claude-opus-synthetic', content: [], service_tier: 'standard', container: null, usage: {input_tokens: 40, service_tier: 'standard'}}}));
extended.push(frame({type: 'content_block_start', index: 0, extension: {revision: 2}, content_block: {type: 'text', text: '', extension: {note: 'benign'}}}));
extended.push(frame({type: 'content_block_delta', index: 0, extension: 'safe', delta: {type: 'text_delta', text: '{"title":"\\u4', service_tier: 'standard', extension: {note: 'safe'}}}));
extended.push(frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'e00"}', extension: {note: 'safe'}}}));
extended.push(frame({type: 'future_accounting_event', extension: {count: 1, note: 'benign'}})); assert.equal(extended.stopped, false); assert.equal(extended.text, '');
extended.push(close() + frame({type: 'message_delta', extension: {status: 'normal'}, delta: {stop_reason: 'end_turn', extension: 'benign'}, usage: {output_tokens: 90}}) + frame({type: 'message_stop', extension: {status: 'normal'}})); extended.push('', true); assert.equal(extended.unsafe, false); assert.equal(extended.text, '{"title":"\\u4e00"}');
// Unknown event types cannot manufacture completion, even with fields that look
// like message_stop and a valid terminal reason.
const futureOnly = v2(); futureOnly.push(start + block() + delta('安全正文') + close() + frame({type: 'future_terminal', stopped: true, message_stop: true, stop_reason: 'end_turn'})); assert.equal(futureOnly.stopped, false); assert.throws(() => futureOnly.push('', true), /outline_stream_incomplete/); assert.equal(futureOnly.text, '');
for (const encoded of [known[0], unicode(known[0]), percent(known[0]), unicode(unicode(known[0])), percent(percent(known[0]))]) for (const attackFrame of [
 frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'safe', unknown: encoded}}),
 frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'safe'}, unknown: {nested: encoded}}),
 frame({type: 'unknown_event', note: encoded}),
 frame({type: 'message_delta', delta: {extension: encoded}}),
]) {
 const s = v2(); s.push(start + block()); if (attackFrame.startsWith('event: message_delta')) s.push(close()); s.push(attackFrame); assert.equal(s.text, ''); assert.equal(s.unsafe, true); assert.equal(s.safetyEvidence.subcause, 'credential_match');
}
for (const encoded of [unicode(known[0]), percent(known[0])]) {const s = v2(); s.push(start + block()); s.push(frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'safe', [encoded]: 'benign'}})); assert.equal(s.safetyEvidence.subcause, 'credential_match'); assert.equal(s.text, '');}
const metadataSplit = v2(); metadataSplit.push(start + block() + frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'safe', extension: known[0].slice(0, 17)}}) + frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'safe', extension: known[0].slice(17)}}) + close() + end); metadataSplit.push('', true); assert.equal(metadataSplit.safetyEvidence.subcause, 'credential_match'); assert.equal(metadataSplit.text, '');
const contentWithMetadata = v2(); contentWithMetadata.push(start + block('thinking') + frame({type: 'content_block_delta', index: 0, delta: {type: 'thinking_delta', thinking: known[0].slice(0, 17), extension: 'benign metadata'}}) + close()); contentWithMetadata.push(block('text', 1) + delta(known[0].slice(17), 'text', 1) + close(1) + end); contentWithMetadata.push('', true); assert.equal(contentWithMetadata.safetyEvidence.subcause, 'credential_match'); assert.equal(contentWithMetadata.text, '');
const escapedUnknown = v2(); escapedUnknown.push(start + block()); escapedUnknown.push(frame({type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'safe', unknown: '\\u4'}})); assert.equal(escapedUnknown.unsafe, true); assert.equal(escapedUnknown.safetyEvidence.subcause, 'incomplete_escape');
for (const invalidType of [frame({type: 'content_block_delta', index: 0, delta: {type: 'future_delta', text: 'safe'}}), frame({type: 'content_block_start', index: 1, content_block: {type: 'future_block', text: 'safe'}})]) {const s = v2(); s.push(start + block()); assert.throws(() => s.push(invalidType), /outline_invalid_stream/); assert.equal(s.text, '');}
for (const comment of [known[0], percent(known[0]), unicode(known[0])]) {const s = v2(); s.push(':' + comment + '\n\n' + wire); s.push('', true); assert.equal(s.unsafe, true); assert.equal(s.text, '');}
const commentSplit = v2(); commentSplit.push(':' + known[0].slice(0, 17) + '\n\n:' + known[0].slice(17) + '\n\n' + wire); commentSplit.push('', true); assert.equal(commentSplit.unsafe, true);
const safeComment = v2(); safeComment.push(': benign keepalive\n\n' + wire); safeComment.push('', true); assert.equal(safeComment.unsafe, false);
const unknownLine = v2(); unknownLine.push('id: harmless\nretry: 1000\n\n' + wire); unknownLine.push('', true); assert.equal(unknownLine.unsafe, false); assert.equal(unknownLine.text, '{"title":"\\u4e00，🧪"}');
const unsafeLine = v2(); unsafeLine.push('id: ' + percent(known[0]) + '\n\n' + wire); unsafeLine.push('', true); assert.equal(unsafeLine.safetyEvidence.subcause, 'credential_match'); assert.equal(unsafeLine.text, '');
// A previously short value under a sensitive metadata field becomes a generic
// credential only when assembled. Final audit retains key/value association.
const pairedMetadata = v2(); pairedMetadata.push(start + block() + delta('安全正文') + close()); pairedMetadata.push(frame({type: 'message_delta', delta: {stop_reason: 'end_turn'}, usage: {output_tokens: 90, secret: 'firstpart'}})); pairedMetadata.push(frame({type: 'message_delta', delta: {}, usage: {secret: 'secondpart'}})); pairedMetadata.push(frame({type: 'message_stop'})); pairedMetadata.push('', true); assert.equal(pairedMetadata.safetyEvidence.subcause, 'credential_match'); assert.equal(pairedMetadata.text, '');
console.log('PASS safe metadata/container/service-tier extensions accepted; unknown metadata/SSE lines strictly audited and encoded credentials suppressed; unknown events never grant completion and unknown block/delta types rejected');
for (const incompleteText of ['\\u', '\\u4', '\\u4e', '\\u4e0', '%E4%B8', '%A']) {const s = run([incompleteText]); assert.equal(s.unsafe, true); assert.equal(s.safetyEvidence.subcause, 'incomplete_escape'); assert.equal(s.text, '');}
for (const invalid of ['%C0%AF', '%ED%A0%80', '\\uD800', '\\uDC00']) {const s = run([invalid]); assert.equal(s.unsafe, true); assert.equal(s.safetyEvidence.subcause, 'invalid_utf8');}
const interrupted = v2(); interrupted.push(start + block() + delta('{"title":"\\u4')); assert.throws(() => interrupted.push('', true), /outline_stream_incomplete/); assert.equal(interrupted.text, ''); assert.equal(interrupted.safetyEvidence.subcause, 'stream_incomplete');
const utf8 = v2(); utf8.push(start + block() + delta('private unfinished')); utf8.abort('invalid_utf8'); assert.equal(utf8.text, ''); assert.equal(utf8.safetyEvidence.subcause, 'invalid_utf8');
const tooLarge = v2({maxBufferedCharacters: 100}); assert.throws(() => tooLarge.push(wire), /outline_stream_inspection_budget/); assert.equal(tooLarge.safetyEvidence.subcause, 'budget_exceeded'); assert.equal(tooLarge.text, '');
const thrown = v2({inspect: () => {throw Error('synthetic inspection unavailable');}}); thrown.push(wire); thrown.push('', true); assert.equal(thrown.safetyEvidence.subcause, 'budget_exceeded'); assert.equal(thrown.text, '');
const malformed = v2({inspect: () => true}); malformed.push(wire); malformed.push('', true); assert.equal(malformed.safetyEvidence.subcause, 'budget_exceeded'); assert.equal(malformed.text, '');
assert.equal(inspect('benign'.repeat(20), [], {maxCharacters: 10}).subcause, 'budget_exceeded');
const nested = {}; nested.cycle = nested; assert.equal(inspect(nested, []).subcause, 'budget_exceeded');
let deep = 'safe'; for (let at = 0; at < 20; at++) deep = JSON.stringify(deep); assert.equal(inspect(deep, []).subcause, 'budget_exceeded');
console.log('PASS incomplete escape, invalid encoding, interruption, unavailable/malformed inspector and bounded inspection/buffer exhaustion suppress all text with enum-only subcauses');
const legacy = new OutlineMessageStream(value => old(value, [])); legacy.push(start + block() + delta('\\u4') + delta('e00') + close() + end); legacy.push('', true); assert.equal(legacy.unsafe, true, 'function constructor preserves old per-frame inspection'); assert.equal(legacy.text, '\\u4e00', 'legacy text getter behavior unchanged');
assert.deepEqual(calls, {network: 0, paid: 0, storage: 0});
console.log('PASS legacy function constructor unchanged; all tests synthetic with fee/network/storage zero');
