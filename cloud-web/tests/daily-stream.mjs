import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
const source = fs.readFileSync('components/daily-run-stream.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(compiled, { exports, TextDecoder, ReadableStream, JSON, Error });
const consume = exports.readDailyNdjson;

function streamFromBytes(bytes, chunkSize = bytes.length) {
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) controller.enqueue(bytes.slice(offset, offset + chunkSize));
      controller.close();
    },
  });
}

const encoder = new TextEncoder();
const complete = [
  JSON.stringify({ type: 'running', seconds: 1 }),
  JSON.stringify({ type: 'terminal', terminal: true, success: true, state: '文章已保存，🌿自动衔接待恢复' }),
].join('\n'); // Deliberately no final newline; every multi-byte character is split across chunks.
const completeBytes = encoder.encode(complete);
const received = [];
const terminal = await consume(streamFromBytes(completeBytes, 1), item => received.push(item));
assert.equal(terminal.terminal, true);
assert.equal(terminal.success, true);
assert.equal(terminal.state, '文章已保存，🌿自动衔接待恢复');
assert.equal(received.length, 2);

const falseSuccess = JSON.stringify({ type: 'result', success: true, state: '文章已保存' });
await assert.rejects(consume(streamFromBytes(encoder.encode(falseSuccess)), () => {}), /没有收到完整结果/);

const validTerminal = encoder.encode(JSON.stringify({ type: 'terminal', terminal: true, success: true }) + '\n');
const invalidUtf8Tail = new Uint8Array([...validTerminal, 0xe2, 0x82]);
await assert.rejects(consume(streamFromBytes(invalidUtf8Tail, 2), () => {}), /文本编码不完整/);

const badTail = encoder.encode(JSON.stringify({ type: 'terminal', terminal: true, success: true }) + '\n{"partial":');
await assert.rejects(consume(streamFromBytes(badTail, 3), () => {}), /长连接结果无法核验/);

console.log('Daily NDJSON reader: split UTF-8, decoder flush, unterminated tail buffer, malformed EOF and required terminal flag passed');
