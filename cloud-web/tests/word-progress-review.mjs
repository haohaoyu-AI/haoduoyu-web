// Independent review regressions. Everything is synthetic and in-memory.
// The generated contract fixture is documentation, not real image/page research,
// a real DOCX, a production acceptance test, or permission to execute a task.
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash, webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';

const nativeRequire = createRequire(import.meta.url);
const sql = new DatabaseSync(':memory:');
for (const file of fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
  sql.exec(fs.readFileSync('drizzle/' + file, 'utf8'));
}
const hash = value => createHash('sha256').update(value).digest('hex');
const stamp = () => new Date().toISOString();
const owner = 'SYNTHETIC-independent-word-review';
const objects = new Map();
const runtimeTokens = new Set();
let readRace = null;
let writeRace = null;
let networkCalls = 0;
let checks = 0;
const bucket = {
  async head(key) {
    const stored = objects.get(key);
    return stored ? {size: stored.bytes.length, version: stored.version, etag: stored.version} : null;
  },
  async get(key) {
    const stored = objects.get(key);
    if (!stored) return null;
    return {
      size: stored.bytes.length, version: stored.version, etag: stored.version,
      arrayBuffer: async () => stored.bytes.buffer.slice(stored.bytes.byteOffset, stored.bytes.byteOffset + stored.bytes.byteLength),
    };
  },
};
const database = {
  prepare(source) {
    return {bind: (...values) => ({
      async first() {
        const result = sql.prepare(source).get(...values) || null;
        if (source.startsWith('SELECT * FROM word_progress_events') && readRace) {
          const hook = readRace;
          readRace = null;
          await hook();
        }
        return result;
      },
      async all() { return {results: sql.prepare(source).all(...values)}; },
      async run() {
        if (source.startsWith('INSERT OR IGNORE INTO word_progress_events') && writeRace) {
          const hook = writeRace;
          writeRace = null;
          await hook();
        }
        return {meta: {changes: Number(sql.prepare(source).run(...values).changes)}};
      },
    })};
  },
};
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const source = fs.readFileSync('lib/' + name + '.ts', 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code, {
    exports,
    require: name => name === 'cloudflare:workers' ? {env: {DB: database, BUCKET: bucket}}
      : name.startsWith('./') ? load(name.slice(2)) : nativeRequire(name),
    crypto: webcrypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Set, Map,
    Error, URL, btoa, atob, Date, File, ReadableStream, structuredClone, setTimeout, clearTimeout,
    fetch: () => { networkCalls++; throw Error('External calls forbidden in synthetic review'); },
  });
  return exports;
}
const progress = load('word-progress');
const contract = load('word-progress-contract');
const fixture = {
  fixture_kind: 'SYNTHETIC_PROTOCOL_DOCUMENTATION_ONLY',
  warning: '全部为独立内存数据库中的合成任务和合成观察，不含真实稿件或有效凭据；没有进行真实图片研究、页面渲染、平台操作或生产验收。保存示例的字节也是显式合成测试数据，不是可交付的 Word 文件。',
  generated_at: stamp(),
  claim_policy: 'Runtime-only randomly generated claims are replaced by <SYNTHETIC_RUNTIME_CLAIM_REDACTED>; this placeholder cannot authorize execution.',
  tools: load('word-progress-tools').wordProgressTools,
  stages: contract.wordStages,
  six_stage_sequence: [],
  examples: {},
};
function makeArticle() {
  const id = webcrypto.randomUUID();
  const token = webcrypto.randomUUID();
  runtimeTokens.add(token);
  const paragraphs = JSON.stringify(['SYNTHETIC REVIEW TITLE', 'SYNTHETIC BODY ONE', 'SYNTHETIC BODY TWO']);
  sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, owner, 'SYNTHETIC REVIEW TITLE', 'synthetic-review.txt', 'articles/' + id + '/source', paragraphs, stamp(), 'processing', token, new Date(Date.now() + 3600000).toISOString());
  return {id, token, input: hash(paragraphs), kind: 'article'};
}
async function read(job, eventId) {
  return progress.wordProgressCall(owner, 'read_word_progress', {
    target_kind: job.kind, target_id: job.id, ...(eventId ? {event_id: eventId} : {}),
  });
}
async function record(job, stage, state, observation, sequence) {
  const before = await read(job);
  const request = {target_kind: job.kind, target_id: job.id, claim_token: job.token,
    input_sha256: job.input, expected_version: before.word_progress.version,
    event_id: webcrypto.randomUUID(), stage, state, observation};
  const response = await progress.recordWordProgress(owner, request);
  if (sequence) sequence.push({operation: 'record_word_progress', request, response});
  return {request, response};
}
async function check(label, action) {
  await action();
  checks++;
  console.log('PASS ' + label);
}
function freezeOutput(job, text, timestamp = true) {
  const bytes = new TextEncoder().encode(text);
  const output = {output_id: webcrypto.randomUUID(), sha256: hash(bytes), size: bytes.length,
    chunks: 1, bytes: 0, parts: [], progress_input_sha256: job.input,
    ...(timestamp ? {progress_updated_at: new Date(Date.now() - 1000).toISOString()} : {})};
  sql.prepare('UPDATE articles SET result_meta=? WHERE id=?').run(JSON.stringify(output), job.id);
  return {output, bytes};
}
function freezeImages(job, images) {
  const manifest = {contract_version: 1, original_sha256: job.input,
    layout: {sha256: hash(JSON.stringify(images)), images, recorded_at: stamp()}};
  sql.prepare('UPDATE articles SET artifact_manifest=? WHERE id=?').run(JSON.stringify(manifest), job.id);
}

await check('candidate URLs reject local addresses and encoded live credentials before persistence', async () => {
  const job = makeArticle();
  await record(job, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  const encoded = [...job.token].map(char => '%' + char.charCodeAt(0).toString(16)).join('');
  for (const candidate of [
    'https://127.0.0.1/private-image', 'https://2130706433/private-image',
    'https://10.0.0.1/private-image', 'https://192.168.0.1/private-image',
    'https://images.example.org/picture?q=' + encoded,
    'https://images.example.org/' + encoded + '/picture',
    'https://images.example.org/picture#' + encoded,
  ]) {
    await assert.rejects(record(job, 'collect_images', 'running', {
      action: 'search_public_images', reason: 'none', candidate_urls: [candidate],
    }));
  }
  assert.equal((await read(job)).word_progress.version, 1);
  await record(job, 'collect_images', 'running', {
    action: 'search_public_images', reason: 'none', candidate_urls: ['https://images.example.org/synthetic-public-image'],
  });
});

await check('legacy output without native timestamp preserves current executor page inspection', async () => {
  const job = makeArticle();
  const {output} = freezeOutput(job, 'SYNTHETIC LEGACY OUTPUT', false);
  fixture.examples.legacy_frozen_output = await read(job);
  const {response} = await record(job, 'inspect_pages', 'running', {
    action: 'check_pages', reason: 'none', word_sha256: output.sha256, rendered_pages: 3, checked_pages: [1],
  });
  assert.equal(response.word_progress.steps[4].state, 'current');
  assert.equal(response.word_progress.steps[4].counts.completed, 1);
  fixture.examples.legacy_resumed_inspection = await read(job);
});

await check('action-only legacy image resume cannot relabel frozen-plan counts as pixel inspection', async () => {
  const job = makeArticle();
  freezeImages(job, [{sha256: 'a'.repeat(64), after_paragraph: 1}]);
  const before = await read(job);
  const {response} = await record(job, 'confirm_images', 'running', {action: 'compress_images', reason: 'none'});
  const step = response.word_progress.steps[2];
  assert.ok(step.counts === null || step.evidence === 'site_record');
  assert.equal((await read(job)).observations.confirm_images.inspected_images, undefined);
  fixture.examples.legacy_image_plan_resume = {before, after: await read(job)};
});

await check('concurrent append never mixes progress version/count with another event observation', async () => {
  const job = makeArticle();
  await record(job, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  await record(job, 'collect_images', 'running', {action: 'search_public_images', reason: 'none', candidate_urls: ['https://images.example.org/synthetic-one']});
  readRace = async () => record(job, 'collect_images', 'running', {
    action: 'search_public_images', reason: 'none',
    candidate_urls: ['https://images.example.org/synthetic-one', 'https://images.example.org/synthetic-two'],
  });
  const response = await read(job);
  const count = response.observations.collect_images.candidate_urls.length;
  assert.equal(response.word_progress.steps[1].counts.completed, count);
  assert.equal(response.word_progress.version, count + 1);
  assert.equal((await read(job)).word_progress.version, 3);
  fixture.examples.concurrent_consistent_read = response;
});

await check('replacement output invalidates prior page observations and rejects old Word evidence', async () => {
  const job = makeArticle();
  await record(job, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'});
  const old = freezeOutput(job, 'SYNTHETIC OLD WORD');
  await record(job, 'inspect_pages', 'completed', {
    action: 'check_pages', reason: 'none', word_sha256: old.output.sha256, rendered_pages: 2, checked_pages: [1, 2],
  });
  const before = await read(job);
  const replacement = freezeOutput(job, 'SYNTHETIC NEW WORD', false);
  const after = await read(job);
  assert.equal(after.word_progress.steps[0].state, 'completed');
  assert.equal(after.word_progress.steps[4].counts, null);
  assert.equal(after.observations.inspect_pages, undefined);
  await assert.rejects(record(job, 'inspect_pages', 'completed', {
    action: 'check_pages', reason: 'none', word_sha256: old.output.sha256, rendered_pages: 2, checked_pages: [1, 2],
  }));
  await assert.rejects(record(job, 'inspect_pages', 'completed', {
    action: 'check_pages', reason: 'none', rendered_pages: 2, checked_pages: [1, 2],
  }));
  await record(job, 'inspect_pages', 'running', {
    action: 'check_pages', reason: 'none', word_sha256: replacement.output.sha256, rendered_pages: 4, checked_pages: [1],
  });
  const resumed = await read(job);
  assert.equal(resumed.word_progress.steps[4].state, 'current');
  assert.equal(resumed.word_progress.steps[4].counts.total, 4);
  fixture.examples.replacement_output = {before, after, resumed};
});

await check('full six-stage synthetic sequence preserves partial and recovery evidence', async () => {
  const job = makeArticle();
  const sequence = fixture.six_stage_sequence;
  fixture.examples.legacy_no_history = await read(job);
  const first = await record(job, 'read_source', 'running', {action: 'read_frozen_source', reason: 'none'}, sequence);
  await record(job, 'read_source', 'completed', {action: 'read_frozen_source', reason: 'none'}, sequence);
  await record(job, 'collect_images', 'running', {action: 'search_public_images', reason: 'none', candidate_urls: ['https://images.example.org/synthetic-one']}, sequence);
  await record(job, 'collect_images', 'waiting', {action: 'search_public_images', reason: 'waiting_for_images'}, sequence);
  fixture.examples.waiting = await read(job);
  await record(job, 'collect_images', 'failed', {action: 'search_public_images', reason: 'network_unavailable'}, sequence);
  fixture.examples.failed = await read(job);
  await record(job, 'collect_images', 'recovering', {action: 'search_public_images', reason: 'none'}, sequence);
  fixture.examples.recovering = await read(job);
  await record(job, 'collect_images', 'completed', {action: 'search_public_images', reason: 'none', candidate_urls: ['https://images.example.org/synthetic-one', 'https://images.example.org/synthetic-two']}, sequence);
  const images = [{sha256: 'a'.repeat(64), width: 1200, height: 800, after_paragraph: 1}, {sha256: 'b'.repeat(64), width: 800, height: 800, after_paragraph: 2}];
  await record(job, 'confirm_images', 'running', {action: 'check_pixels', reason: 'none', inspected_images: [images[0]], images_total: 2}, sequence);
  fixture.examples.partial_images = await read(job);
  freezeImages(job, images.map(({sha256, after_paragraph}) => ({sha256, after_paragraph})));
  await progress.observeNativeWordProgress(owner, job.kind, job.id, job.token, 'image_plan_recorded');
  sequence.push({operation: 'SYNTHETIC_SITE_IMAGE_PLAN_SEED_AND_NATIVE_HOOK', response: await read(job)});
  await record(job, 'confirm_images', 'completed', {action: 'place_images', reason: 'none', inspected_images: images, images_total: 2}, sequence);
  await record(job, 'generate_word', 'running', {action: 'build_docx', reason: 'none'}, sequence);
  const {output, bytes} = freezeOutput(job, 'SYNTHETIC STORAGE TEST BYTES; NOT A REAL WORD DOCUMENT');
  await progress.observeNativeWordProgress(owner, job.kind, job.id, job.token, 'output_frozen');
  sequence.push({operation: 'SYNTHETIC_SITE_OUTPUT_DECLARATION_SEED_AND_NATIVE_HOOK', response: await read(job)});
  await record(job, 'generate_word', 'completed', {action: 'build_docx', reason: 'none', word_sha256: output.sha256}, sequence);
  await record(job, 'inspect_pages', 'running', {action: 'check_pages', reason: 'none', word_sha256: output.sha256, rendered_pages: 3, checked_pages: [1]}, sequence);
  fixture.examples.partial_pages = await read(job);
  await record(job, 'inspect_pages', 'completed', {action: 'check_pages', reason: 'none', word_sha256: output.sha256, rendered_pages: 3, checked_pages: [1, 2, 3]}, sequence);
  await record(job, 'save_final', 'running', {action: 'upload_output', reason: 'none', word_sha256: output.sha256}, sequence);
  await assert.rejects(record(job, 'save_final', 'completed', {action: 'finalize_output', reason: 'none', word_sha256: output.sha256}));
  const key = 'synthetic-review/' + job.id + '/result.docx';
  const completed = {...output, bytes: bytes.length, parts: [{sha256: output.sha256, size: bytes.length}], progress_updated_at: stamp(), completed_at: stamp()};
  objects.set(key, {bytes, version: webcrypto.randomUUID()});
  sql.prepare("UPDATE articles SET result_meta=?,result_key=?,state='word_ready' WHERE id=?").run(JSON.stringify(completed), key, job.id);
  await progress.observeNativeWordProgress(owner, job.kind, job.id, job.token, 'output_finalized');
  const saved = await read(job);
  assert.equal(saved.word_progress.save.independently_confirmed, true);
  assert.equal(saved.word_progress.save.desktop_saved, null);
  assert.equal(saved.word_progress.steps[5].state, 'completed');
  fixture.examples.cloud_ready = saved;
  sequence.push({operation: 'SYNTHETIC_SITE_FINALIZE_SEED_AND_NATIVE_HOOK_THEN_INDEPENDENT_READ', response: saved});
  fixture.examples.unknown_event_recorded = await read(job, first.request.event_id);
  fixture.examples.unknown_event_not_recorded = await read(job, webcrypto.randomUUID());
  assert.equal(fixture.examples.unknown_event_recorded.event_receipt.state, 'recorded');
  assert.equal(fixture.examples.unknown_event_not_recorded.event_receipt.state, 'not_recorded');
  assert.equal(fixture.examples.unknown_event_not_recorded.new_execution_grant, false);
  objects.set(key, {bytes: new Uint8Array(bytes.length), version: webcrypto.randomUUID()});
  fixture.examples.corrupt_readback_pending = await read(job);
  assert.equal(fixture.examples.corrupt_readback_pending.word_progress.save.independently_confirmed, false);
});

await check('explicit executor-ended example is distinct from timeout and recoverable', async () => {
  const job = makeArticle();
  await assert.rejects(record(job, 'read_source', 'executor_lost', {action: 'read_frozen_source', reason: 'unknown'}));
  await record(job, 'read_source', 'executor_lost', {action: 'read_frozen_source', reason: 'executor_ended'});
  fixture.examples.executor_lost = await read(job);
  await record(job, 'read_source', 'recovering', {action: 'read_frozen_source', reason: 'none'});
  fixture.examples.executor_recovered = await read(job);
});

await check('late image/output/claim changes cannot append or mutate business rows', async () => {
  for (const mutation of ['manifest', 'output', 'claim']) {
    const job = makeArticle();
    const before = await read(job);
    writeRace = () => {
      if (mutation === 'manifest') freezeImages(job, [{sha256: 'c'.repeat(64), after_paragraph: 1}]);
      if (mutation === 'output') freezeOutput(job, 'SYNTHETIC CONCURRENT OUTPUT');
      if (mutation === 'claim') sql.prepare('UPDATE articles SET claim_token=? WHERE id=?').run(webcrypto.randomUUID(), job.id);
    };
    await assert.rejects(record(job, 'read_source', 'running', {action: 'read_frozen_source', reason: 'none'}));
    assert.equal((await read(job)).word_progress.version, before.word_progress.version);
  }
});

assert.equal(networkCalls, 0);
const serialized = JSON.stringify(fixture, (key, value) => key === 'claim_token' && typeof value === 'string'
  ? '<SYNTHETIC_RUNTIME_CLAIM_REDACTED>' : value, 2) + '\n';
for (const token of runtimeTokens) assert.equal(serialized.includes(token), false, 'runtime claim must never enter fixture');
assert.equal(serialized.includes('result_key'), false, 'no storage-key field in public fixture');
fs.mkdirSync('evidence/word-progress', {recursive: true});
fs.writeFileSync('evidence/word-progress/reviewer-contract-fixture.json', serialized);
console.log(`PASS ${checks} independent review regression groups; zero external calls; synthetic contract fixture written with complete tool schemas and redacted runtime claims.`);
sql.close();
