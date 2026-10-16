import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const module = {exports: {}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/credential-boundary.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {exports: module.exports});
const {inspectCredentialValue: inspect, numericCredentialSafeUsage: usage} = module.exports;
const opaque = 'opaque.configured.secret.X7Y9Z2', token = 'f702e0fa-bac8-4a1c-bb89-687c70da39ec', generic = 'sk-' + 'q'.repeat(32);
const unicode = text => [...text].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
const unsafe = ['说明：{\"api_key\":\"ABCDEFGHIJKLMNOP\"}', '{\"api_key\":\"ABCDEFGHIJKLMNOP\",\"api_key\":\"safe\"}', opaque, token.toUpperCase(), generic, unicode(generic), unicode(unicode(generic)), {usage: {nested: [{[generic]: 'x'}]}}, {api_key: 'A'.repeat(32)}, {'api_\\u006bey': unicode('A'.repeat(32))}, JSON.stringify({status: 'failed', api_key: 'A'.repeat(32)}), JSON.stringify(JSON.stringify({authorization: 'Bearer ' + 'a'.repeat(32)})), {problem: JSON.stringify({api_key: 'A'.repeat(32)})}, {raw: '{"text":"' + unicode(generic) + '\\u00'}, {secret: JSON.stringify('a'.repeat(32))}];
for (const input of unsafe) {
 const result = inspect(input, [opaque, token]);
 assert.equal(result.hit, true, 'missed credential variant');
 const serialized = JSON.stringify(result.value);
 assert.ok(!serialized.includes(opaque) && !serialized.includes(token) && !serialized.includes(generic));
}
const safe = {text: '第一段\n第二段', usage: {input_tokens: 15}, metadata: {authorization_key: '2026-10-05-stepwise-text-pair'}};
const original = JSON.stringify(safe);
assert.equal(inspect(safe, [opaque, token]).hit, false);
assert.equal(JSON.stringify(inspect(safe).value), original);
assert.equal(inspect(JSON.stringify(safe)).value, JSON.stringify(safe));
assert.deepEqual(JSON.parse(JSON.stringify(usage({input_tokens: Infinity, output_tokens: 21.9, thinking_tokens: 'secret', nested: generic}))), {input_tokens: 0, output_tokens: 21, thinking_tokens: 0});
console.log('PASS bounded decoded credentials, key/value association, safe raw preservation, numeric diagnostics');
