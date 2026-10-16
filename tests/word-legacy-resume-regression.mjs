// Actual isolated workerd D1 + native TypeScript APIs, synthetic Word/raster/R2 only.
// No production, credentials, image downloads, external services, or rendering claims.
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {drizzle} from 'drizzle-orm/d1';
import {migrate} from 'drizzle-orm/d1/migrator';
import {unzipSync, zipSync, strFromU8, strToU8, zlibSync} from 'fflate';
import {createSyntheticHarness, barrier, withDeadline} from './word-recovery-harness.mjs';
import {docx, png} from './word-recovery-artifact-fixture.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const rawSource = JSON.stringify(['Synthetic title', 'Synthetic body']);
// Locally generated 1x1 RGB JPEG / lossless WebP; no real article image.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z', 'base64');
const WEBP = Buffer.from('UklGRhwAAABXRUJQVlA4TA8AAAAvAAAAAAcQ/Y/+ByKi/wEA', 'base64');
function rasterWord(image, extension) {
  const files = unzipSync(docx(image));
  // The local native validator requires an actual styles part/relationship.
  files['word/styles.xml'] = strToU8('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
  files['word/_rels/document.xml.rels'] = strToU8(strFromU8(files['word/_rels/document.xml.rels']).replace('</Relationships>', '<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'));
  files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('</Types>', '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'));
  if (extension !== 'png') {
    files[`word/media/synthetic.${extension}`] = files['word/media/synthetic.png'];
    delete files['word/media/synthetic.png'];
    files['word/_rels/document.xml.rels'] = strToU8(strFromU8(files['word/_rels/document.xml.rels']).replace('synthetic.png', `synthetic.${extension}`));
    files['[Content_Types].xml'] = strToU8(strFromU8(files['[Content_Types].xml']).replace('Extension="png" ContentType="image/png"', `Extension="${extension}" ContentType="image/${extension === 'jpg' ? 'jpeg' : extension}"`));
  }
  return zipSync(files);
}
function badPng() {
  // Valid signature, dimensions, chunk CRCs and zlib; impossible row filter 255.
  const good = png(), compressed = zlibSync(Uint8Array.from([255, 1, 2, 3]));
  const chunk = Buffer.alloc(compressed.length + 12);
  chunk.writeUInt32BE(compressed.length); chunk.write('IDAT', 4); chunk.set(compressed, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, -4)) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ ((crc & 1) ? 0xedb88320 : 0); }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return Buffer.concat([good.subarray(0, 33), chunk, good.subarray(-12)]);
}

// Interpose deterministic races immediately before actual D1 statements/batches.
// Every mutation and transaction still executes in workerd D1, not SQLite emulation.
function interposedD1(real) {
  const hooks = [];
  async function fire(method, context) {
    for (const hook of [...hooks]) if (hook.method === method && hook.match(context)) {
      hooks.splice(hooks.indexOf(hook), 1); await hook.action(context);
    }
  }
  function prepare(source, values = []) {
    const statement = real.prepare(source).bind(...values);
    return {source, values, real: statement, bind: (...bound) => prepare(source, bound),
      async first(column) { await fire('first', {source, values}); return statement.first(column); },
      async all() { await fire('all', {source, values}); return statement.all(); },
      async run() { await fire('run', {source, values}); return statement.run(); }};
  }
  return {prepare, exec: source => real.exec(source),
    async batch(statements) { await fire('batch', {source: statements.map(s => s.source).join('\n'), statements}); return real.batch(statements.map(s => s.real)); },
    on(method, match, action) { const hook = {method, match, action}; hooks.push(hook); return () => { const at = hooks.indexOf(hook); if (at >= 0) hooks.splice(at, 1); }; },
    get pendingHooks() { return hooks.length; }};
}

const mf = new Miniflare({cf: false, modules: true,
  script: 'export default {fetch(){return new Response("SYNTHETIC LEGACY RESUME")}}',
  compatibilityDate: '2026-05-22', d1Databases: {DB: 'synthetic-word-legacy-resume-regression'}});
const h = createSyntheticHarness({projectRoot: process.cwd(), migrate: false, globals: {Response}});
let passed = 0;
try {
  const real = await mf.getD1Database('DB');
  await migrate(drizzle(real), {migrationsFolder: 'drizzle'});
  const d1 = interposedD1(real); h.env.DB = d1;
  const load = h.loader(), w = load('word-recovery'), p = load('word-progress');
  const article = load('article-tools'), local = load('local-word-jobs'), attempts=load('word-attempts');
  const table = job => job.kind === 'article' ? 'articles' : 'local_word_jobs';
  const outputColumn = job => job.kind === 'article' ? 'result_meta' : 'output_meta';
  const scope = job => ({target_kind: job.kind, target_id: job.id});
  const base = (job, lease = job.lease) => ({...scope(job), claim_token: job.claim, input_sha256: job.inputSha, execution_token: lease?.token});
  const row = job => real.prepare(`SELECT * FROM ${table(job)} WHERE owner=? AND id=?`).bind(job.owner, job.id).first();
  const control = job => real.prepare('SELECT * FROM word_recovery WHERE owner=? AND target_kind=? AND target_id=?').bind(job.owner, job.kind, job.id).first();
  const receipts = job => real.prepare('SELECT COUNT(*) n FROM word_execution_receipts WHERE owner=? AND target_kind=? AND target_id=?').bind(job.owner, job.kind, job.id).first('n');
  async function native(job, operation, extra = {}, lease = job.lease) {
    const args = {...(job.kind === 'article' ? {article_id: job.id} : {job_id: job.id}), claim_token: job.claim,
      ...(lease ? {execution_token: lease.token} : {}), ...extra};
    return job.kind === 'article' ? article.articleCall(job.owner, `${operation}_article_output`, args)
      : local.localWordCall(job.owner, `${operation}_local_word_output`, args);
  }
  async function putChunk(job, index, lease = job.lease) {
    const args = {...(job.kind === 'article' ? {article_id: job.id} : {job_id: job.id}), claim_token: job.claim,
      ...(lease ? {execution_token: lease.token} : {}), output_id: job.outputId, index, data_base64: Buffer.from(job.parts[index]).toString('base64')};
    return job.kind === 'article' ? article.articleCall(job.owner, 'put_article_output_chunk', args)
      : local.localWordCall(job.owner, 'put_local_word_output_chunk', args);
  }
  async function finalize(job, lease = job.lease) {
    const extra = {output_id: job.outputId};
    if (job.kind === 'local_word') extra.execution = {executor: 'xiaoyu_agent', execution_id: lease.executionId,
      model: 'synthetic-test-model', rendered_pages: 1, verification_summary: 'Synthetic protocol fixture; no actual page rendering.'};
    return native(job, 'finalize', extra, lease);
  }
  async function acquire(job, lease = {token: randomUUID(), executionId: randomUUID(), requestKey: randomUUID()}) {
    const result = await w.wordRecoveryCall(job.owner, 'acquire_word_execution', {...base(job, lease), execution_id: lease.executionId, request_key: lease.requestKey});
    assert.equal(result.acquired, true); lease.epoch = result.epoch; job.lease = lease; return lease;
  }
  async function acknowledgeSettled(job) {
    if (!job.lease) return;
    const view=await attempts.wordAttemptView(job.owner,job.kind,job.id);
    if (!view || view.state==='saved') return;
    // All awaited fixture actions have settled; no external executor was run.
    await attempts.wordAttemptCall(job.owner,'acknowledge_word_attempt_stopped',{
      ...scope(job),input_sha256:job.inputSha,attempt_id:view.attempt_id,
      claim_token:job.claim,execution_token:job.lease.token,execution_id:job.lease.executionId,
      epoch:job.lease.epoch,request_key:randomUUID(),confirm_all_actions_settled:true,
      settled_reference:'synthetic-await-all-d1-r2-actions-settled',confirm_executor_ended:true,
      terminal_reference:'synthetic-holder-fixture-execution-ended',state:'paused_safe'});
  }
  async function intent(job, desired) {
    const current = await control(job);
    return w.setWordIntent(job.owner, {...scope(job), input_sha256: job.inputSha, expected_version: current?.version || 0, intent: desired});
  }
  async function seed({kind = 'article', image = JPEG, extension = 'jpg', manifest = true, prefix = 1, declare = true, layout = true} = {}) {
    const owner = `synthetic-legacy-${randomUUID()}`, bytes = rasterWord(image, extension);
    const images = [{source_url: `https://public.example.org/synthetic.${extension}`, source_title: 'Synthetic legacy image', after_paragraph: 1, sha256: hash(image)}];
    let id, claim, inputSha;
    if (kind === 'article') {
      id = randomUUID(); claim = randomUUID(); inputSha = hash(rawSource);
      const frozen = manifest ? JSON.stringify({contract_version: 1, author: 'synthetic_manual_frozen_source', input_sha256: inputSha,
        prompt_sha256: hash('synthetic prompt'), original_sha256: inputSha, sources_sha256: hash('[]'), sources: [], frozen_at: new Date().toISOString(),
        layout: layout ? {images, sha256: hash(JSON.stringify(images)), recorded_at: new Date().toISOString()} : null}) : null;
      await real.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,artifact_manifest,created,state,claim_token,claim_expires) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, owner, 'Synthetic title', 'synthetic.docx', `articles/${id}/source`, rawSource, frozen, new Date().toISOString(), 'queued', null, null).run();
      const freshClaim=await article.articleCall(owner,'claim_article',{article_id:id});
      assert.equal(freshClaim.claimed,true);claim=freshClaim.claim_token;
    } else {
      const created = await local.createLocalWordJob(owner, {request_key: randomUUID(), filename: 'synthetic.docx', source_sha256: hash('synthetic desktop bytes'),
        title: 'Synthetic title', leading_blank_paragraphs: 0, paragraphs: ['Synthetic body'], subheading_indices: [], original_sha256: hash(rawSource)});
      id = created.job.id; inputSha = created.job.input_sha256;
      const claimed = await local.localWordCall(owner, 'claim_local_word_job', {job_id: id});
      assert.equal(claimed.claimed, true); claim = claimed.claim_token;
      if (layout) {
        // Historical layout fixture, before adoption; no current ungranted API write.
        const legacy=JSON.parse((await real.prepare('SELECT artifact_manifest FROM local_word_jobs WHERE id=?').bind(id).first()).artifact_manifest);
        legacy.layout={images,sha256:hash(JSON.stringify(images)),recorded_at:new Date().toISOString()};
        await real.prepare('UPDATE local_word_jobs SET artifact_manifest=? WHERE id=?').bind(JSON.stringify(legacy),id).run();
      }
    }
    const chunkLength = Math.ceil(bytes.length / 3), parts = [bytes.slice(0, chunkLength), bytes.slice(chunkLength, chunkLength * 2), bytes.slice(chunkLength * 2)];
    assert.ok(parts.every(part => part.length > 0 && part.length <= 65536));
    const job = {kind, owner, id, claim, inputSha, image, images, bytes, parts, sha: hash(bytes), outputId: null, lease: null};
    if (declare) {
      // Seed verifiable historical native bytes directly in isolated D1/R2.
      // The current API correctly refuses all writes before an actual Word grant.
      job.outputId=randomUUID();const accepted=[];
      for(let index=0;index<prefix;index++){const part=parts[index],key=`synthetic-historical/${id}/${job.outputId}/${index}-${hash(part)}`;await h.bucket.put(key,part);accepted.push({key,sha256:hash(part),size:part.length});}
      const historical={progress_input_sha256:inputSha,progress_updated_at:new Date().toISOString(),output_id:job.outputId,size:bytes.length,sha256:job.sha,chunks:parts.length,parts:accepted,bytes:accepted.reduce((n,p)=>n+p.size,0)};
      await real.prepare(`UPDATE ${table(job)} SET ${outputColumn(job)}=? WHERE owner=? AND id=?`).bind(JSON.stringify(historical),owner,id).run();
    }
    assert.equal(await control(job), null); return job;
  }
  async function assertBinding(job, prefix) {
    const r = await row(job), c = await control(job), m = JSON.parse(r[outputColumn(job)]), binding = JSON.parse(c.legacy_output_binding);
    assert.deepEqual(binding, {contract_version: 1, output_id_sha256: hash(job.outputId), sha256: job.sha,
      size: job.bytes.length, chunks: job.parts.length, manifest_sha256: hash(JSON.stringify(r.artifact_manifest ?? null)),
      prefix_chunks: prefix, prefix_sha256: hash(JSON.stringify(m.parts.slice(0, prefix)))});
    assert.equal(c.legacy_output_binding.includes(job.outputId), false);
    return c.legacy_output_binding;
  }
  async function complete(job) {
    const existing = JSON.parse((await row(job))[outputColumn(job)]).parts.length;
    for (let index = existing; index < job.parts.length; index++) await putChunk(job, index);
    await finalize(job);
  }
  async function readWhole(job, legacy = true) {
    const saved = await row(job), m = JSON.parse(saved[outputColumn(job)]);
    assert.equal(m.output_id, job.outputId); assert.equal(m.sha256, job.sha); assert.equal(m.size, job.bytes.length);
    assert.equal(saved.state, job.kind === 'article' ? 'word_ready' : 'word_completed'); assert.ok(saved.result_key);
    const object = await h.bucket.get(saved.result_key), bytes = Buffer.from(await object.arrayBuffer());
    assert.equal(hash(bytes), job.sha); assert.deepEqual(bytes, Buffer.from(job.bytes));
    const readChunks = [];
    for (let index = 0; index < job.parts.length; index++) {
      const read = await w.readNativeOutputChunk(job.owner, {...scope(job), output_id: job.outputId, index});
      assert.equal(read.read_only, true); readChunks.push(Buffer.from(read.data_base64, 'base64'));
    }
    assert.equal(hash(Buffer.concat(readChunks)), job.sha);
    const progress = await p.readWordProgress(job.owner, job.kind, job.id);
    assert.equal(progress.save.independently_confirmed, true); assert.equal(progress.save.state, 'cloud_ready');
    if (legacy) {
      assert.deepEqual({...m.recovery_verification}, {contract: 'legacy_declared_output_v1', pixel_history: 'unrecorded'});
      assert.equal(progress.steps[2].state, 'unrecorded'); assert.equal(progress.steps[2].counts, null);
      assert.equal(progress.steps[1].counts, null); assert.equal(progress.steps[4].counts, null);
    } else assert.equal(m.recovery_verification, undefined);
    if (job.kind === 'local_word') {
      const downloaded = await local.downloadLocalWord(job.owner, job.id);
      assert.equal(downloaded.headers.get('X-Word-SHA256'), job.sha);
      assert.equal(hash(Buffer.from(await downloaded.arrayBuffer())), job.sha);
    }
    const recovery = await w.wordRecoveryCall(job.owner, 'read_word_recovery', scope(job));
    assert.equal(recovery.image_materials.ready_images, legacy ? 0 : 1);
    assert.equal(recovery.image_checkpoint_profile.format, 'png'); return {m, progress};
  }
  async function checkpoint(job, bytes, kind = 'image', finalizeNow = true) {
    const assetId = randomUUID(), common = {...base(job), asset_id: assetId};
    await w.checkpointCall(job.owner, 'begin_word_checkpoint', {...common, kind, sha256: hash(bytes), size: bytes.length,
      chunks: Math.ceil(bytes.length / 65536), metadata: kind === 'image' ? {source_url: job.images[0].source_url, source_title: job.images[0].source_title, after_paragraph: 1} : {}});
    for (let index = 0; index < Math.ceil(bytes.length / 65536); index++) await w.checkpointCall(job.owner, 'put_word_checkpoint_chunk',
      {...common, index, data_base64: Buffer.from(bytes.slice(index * 65536, (index + 1) * 65536)).toString('base64')});
    if (finalizeNow) await w.checkpointCall(job.owner, 'finalize_word_checkpoint', common);
    return {assetId, common};
  }
  async function group(name, test) { await test(); passed++; console.log(`PASS ${name}`); }

  for (const [extension, image, adoption] of [['jpg', JPEG, 'acquire'], ['webp', WEBP, 'intent']]) {
    for (const kind of ['article', 'local_word']) await group(`${kind} ${extension}: actual ${adoption} adoption, exact same output, whole read`, async () => {
      const prefix = adoption === 'intent' ? 0 : 1, job = await seed({kind, image, extension, prefix});
      if (adoption === 'intent') { await intent(job, 'paused'); await assertBinding(job, prefix); await intent(job, 'run'); }
      await acquire(job); const binding = await assertBinding(job, prefix);
      const resumed = await native(job, 'begin', {size: job.bytes.length, sha256: job.sha, chunks: 3});
      assert.equal(resumed.output_id, job.outputId); await complete(job); await readWhole(job);
      assert.equal((await control(job)).legacy_output_binding, binding);
    });
  }
  await group('article without historical manifest resumes original JPEG output', async () => {
    const job = await seed({manifest: false}); await acquire(job); await assertBinding(job, 1);
    await complete(job); await readWhole(job); assert.equal((await row(job)).artifact_manifest, null);
  });
  await group('old bad ready checkpoint stays unchanged, JPEG/WebP new checkpoints fail, zero ready count', async () => {
    const job = await seed(); await acquire(job); const bytes = badPng(), assetId = randomUUID(), key = `synthetic-old-checkpoint/${assetId}`;
    assert.doesNotThrow(() => load('image-integrity').assertRasterImage(bytes));
    await h.bucket.put(key, bytes);
    await real.prepare("INSERT INTO word_checkpoints(owner,target_kind,target_id,input_sha256,asset_id,kind,sha256,size,chunks,metadata_json,verification_json,parts_json,state,created) VALUES(?,?,?,?,?,'image',?,?,1,?,?,?,'ready',?)")
      .bind(job.owner, job.kind, job.id, job.inputSha, assetId, hash(bytes), bytes.length, JSON.stringify({source_url: job.images[0].source_url, source_title: job.images[0].source_title, after_paragraph: 1}),
        JSON.stringify({width: 1, height: 1}), JSON.stringify([{key, size: bytes.length, sha256: hash(bytes)}]), new Date().toISOString()).run();
    const old = await real.prepare('SELECT * FROM word_checkpoints WHERE asset_id=?').bind(assetId).first();
    await assert.rejects(w.checkpointCall(job.owner, 'finalize_word_checkpoint', {...base(job), asset_id: assetId}), /Word配图像素解码失败/);
    assert.deepEqual(await real.prepare('SELECT * FROM word_checkpoints WHERE asset_id=?').bind(assetId).first(), old);
    for (const image of [JPEG, WEBP]) {
      const cp = await checkpoint(job, image, 'image', false);
      await assert.rejects(w.checkpointCall(job.owner, 'finalize_word_checkpoint', cp.common), /Word配图像素解码仅支持/);
      assert.equal((await real.prepare('SELECT state FROM word_checkpoints WHERE asset_id=?').bind(cp.assetId).first()).state, 'incomplete');
    }
    const view = await w.wordRecoveryCall(job.owner, 'read_word_recovery', scope(job));
    assert.equal(view.image_materials.ready_images, 0);
    assert.equal(view.checkpoints.find(cp => cp.asset_id === assetId).needs_pixel_verification, true);
    await assert.rejects(w.requireCheckpointImages(job.owner, job.kind, job.id, job.images));
    await complete(job); await readWhole(job);
  });
  await group('new output cannot acquire legacy exception or null-to-bound transition', async () => {
    const job = await seed({declare: false}); await acquire(job);
    assert.equal((await control(job)).legacy_output_binding, null);
    await assert.rejects(native(job, 'begin', {size: job.bytes.length, sha256: job.sha, chunks: 3}));
    // Attack fixture: bypass begin by inserting a newly declared output directly.
    // Adoption itself above used the real API. Native finalizer must still fail closed.
    job.outputId = randomUUID(); const meta = {output_id: job.outputId, size: job.bytes.length, sha256: job.sha, chunks: 3, parts: [], bytes: 0};
    await real.prepare('UPDATE articles SET result_meta=? WHERE owner=? AND id=?').bind(JSON.stringify(meta), job.owner, job.id).run();
    for (let index = 0; index < 3; index++) await putChunk(job, index);
    await intent(job, 'paused'); await acknowledgeSettled(job); await intent(job, 'run'); await acquire(job);
    assert.equal((await control(job)).legacy_output_binding, null);
    await assert.rejects(finalize(job)); assert.equal((await row(job)).result_key, null);
    await assert.rejects(real.prepare('UPDATE word_recovery SET legacy_output_binding=? WHERE owner=? AND target_id=?').bind('{}', job.owner, job.id).run(), /immutable_word_legacy_binding/);
  });
  await group('new PNG protocol requires actual image/Word checkpoints and retains strict verified count', async () => {
    const job = await seed({image: png(), extension: 'png', declare: false, layout: false}); await acquire(job);
    await w.declareImageFloor(job.owner, {...base(job), minimum_images: 1});
    await assert.rejects(native(job, 'begin', {size: job.bytes.length, sha256: job.sha, chunks: 3}));
    await checkpoint(job, job.image);
    const pixelProof = await real.prepare("SELECT verification_json FROM word_checkpoints WHERE owner=? AND target_id=? AND kind='image'").bind(job.owner, job.id).first();
    assert.deepEqual(JSON.parse(pixelProof.verification_json), {pixel_decode_verified: true, decode_version: 1, format: 'png', width: 1, height: 1});
    await article.articleCall(job.owner, 'record_article_images', {article_id: job.id, claim_token: job.claim, execution_token: job.lease.token, images: job.images});
    await assert.rejects(native(job, 'begin', {size: job.bytes.length, sha256: job.sha, chunks: 3}));
    await checkpoint(job, job.bytes, 'word');
    job.outputId = (await native(job, 'begin', {size: job.bytes.length, sha256: job.sha, chunks: 3})).output_id;
    await complete(job); await readWhole(job, false); assert.equal((await control(job)).legacy_output_binding, null);
  });
  await group('binding immutable; every identity/manifest/prefix field is exact, suffix append allowed', async () => {
    const job = await seed({prefix: 2}); await acquire(job); const binding = await assertBinding(job, 2), original = await row(job), meta = JSON.parse(original.result_meta);
    await assert.rejects(real.prepare('UPDATE word_recovery SET legacy_output_binding=? WHERE owner=? AND target_id=?').bind('{}', job.owner, job.id).run(), /immutable_word_legacy_binding/);
    const mutations = [m => { m.output_id = randomUUID(); }, m => { m.sha256 = hash('different'); }, m => { m.size++; }, m => { m.chunks++; },
      m => { m.parts[0].key += '-alias'; }, m => { m.parts[0].size++; }, m => { m.parts[0].sha256 = hash('different part'); }, m => { m.parts.reverse(); }, m => { m.parts.shift(); }];
    for (const mutation of mutations) {
      const changed = structuredClone(meta); mutation(changed);
      await real.prepare('UPDATE articles SET result_meta=? WHERE owner=? AND id=?').bind(JSON.stringify(changed), job.owner, job.id).run();
      await assert.rejects(w.requireNativeFinalizeImages(job.owner, job.kind, job.id, await row(job)), /续接绑定/);
    }
    await real.prepare('UPDATE articles SET result_meta=?,artifact_manifest=? WHERE owner=? AND id=?').bind(original.result_meta, JSON.stringify(JSON.parse(original.artifact_manifest), null, 2), job.owner, job.id).run();
    await assert.rejects(w.requireNativeFinalizeImages(job.owner, job.kind, job.id, await row(job)), /续接绑定/);
    await real.prepare('UPDATE articles SET artifact_manifest=? WHERE owner=? AND id=?').bind(original.artifact_manifest, job.owner, job.id).run();
    // Same part bytes and SHA under a different key still violate bound prefix.
    const alias = structuredClone(meta); alias.parts[0].key += '-alias'; await h.bucket.put(alias.parts[0].key, job.parts[0]);
    await real.prepare('UPDATE articles SET result_meta=? WHERE owner=? AND id=?').bind(JSON.stringify(alias), job.owner, job.id).run();
    await putChunk(job, 2); await assert.rejects(finalize(job), /续接绑定/); assert.equal((await row(job)).result_key, null);
    const restored = JSON.parse((await row(job)).result_meta); restored.parts[0] = meta.parts[0];
    await real.prepare('UPDATE articles SET result_meta=? WHERE owner=? AND id=?').bind(JSON.stringify(restored), job.owner, job.id).run();
    await finalize(job); await readWhole(job); assert.equal((await control(job)).legacy_output_binding, binding);
  });
  await group('malformed stored non-null bindings fail closed instead of using strict fallback', async () => {
    for (const bad of ['null', 'false', '{bad-json', '[]', '{}']) {
      const job = await seed();
      // Deliberately corrupt storage at INSERT, not a positive adoption fixture.
      await real.prepare("INSERT INTO word_recovery(owner,target_kind,target_id,input_sha256,claim_hash,version,epoch,desired,status,reason,retry_count,legacy_output_binding,updated) VALUES(?,?,?,?,?,1,1,'run','await_executor','user_intent',0,?,?)")
        .bind(job.owner, job.kind, job.id, job.inputSha, hash(job.claim), bad, new Date().toISOString()).run();
      await assert.rejects(w.requireNativeFinalizeImages(job.owner, job.kind, job.id, await row(job)), /续接绑定/);
    }
  });
  await group('pause during native R2 chunk write fences old lease; new lease resumes exact prefix', async () => {
    const job = await seed(); const oldLease = await acquire(job), binding = await assertBinding(job, 1), gate = barrier();
    h.on({method: 'bucket.put', phase: 'after', match: ({key}) => key.includes(`/output/${job.outputId}/1-`), action: () => gate.arrive()});
    const pending = putChunk(job, 1, oldLease); const rejected = assert.rejects(pending); await withDeadline(gate.ready, 10000);
    await intent(job, 'paused'); gate.release(); await rejected;
    assert.equal(JSON.parse((await row(job)).result_meta).parts.length, 1);
    await assert.rejects(putChunk(job, 1, oldLease)); await acknowledgeSettled(job); await intent(job, 'run'); await acquire(job);
    await assert.rejects(putChunk(job, 1, oldLease)); await complete(job); await readWhole(job);
    assert.equal((await control(job)).legacy_output_binding, binding);
  });
  await group('expired lease and late duplicate receipts cannot revive; new grant preserves binding', async () => {
    const job = await seed(); const old = await acquire(job), binding = await assertBinding(job, 1);
    await real.prepare('UPDATE word_recovery SET lease_until=? WHERE owner=? AND target_id=?').bind('2000-01-01T00:00:00.000Z', job.owner, job.id).run();
    await assert.rejects(putChunk(job, 1, old));
    await assert.rejects(w.wordRecoveryCall(job.owner, 'acquire_word_execution', {...base(job, old), execution_id: old.executionId, request_key: old.requestKey}));
    // Expiry alone cannot release the old serial holder.
    const waitingLease={token:randomUUID(),executionId:randomUUID(),requestKey:randomUUID()};
    assert.equal((await w.wordRecoveryCall(job.owner,'acquire_word_execution',{...base(job,waitingLease),execution_id:waitingLease.executionId,request_key:waitingLease.requestKey})).acquired,false);
    await acknowledgeSettled(job); await acquire(job,waitingLease); await assert.rejects(putChunk(job, 1, old)); await complete(job); await readWhole(job);
    assert.equal((await control(job)).legacy_output_binding, binding); assert.equal(await receipts(job), 2);
  });
  for (const kind of ['article', 'local_word']) await group(`${kind}: final manifest CAS rejects change after native validation/R2 write`, async () => {
    const job = await seed({kind}); await acquire(job); for (let index = 1; index < 3; index++) await putChunk(job, index);
    const original = await row(job), mutated = JSON.parse(original.artifact_manifest); mutated.author = 'changed-after-validation';
    h.on({method: 'bucket.put', phase: 'after', match: ({key}) => key.includes(job.id) && key.endsWith(`result-${job.sha}.docx`),
      action: () => real.prepare(`UPDATE ${table(job)} SET artifact_manifest=? WHERE owner=? AND id=?`).bind(JSON.stringify(mutated), job.owner, job.id).run()});
    await assert.rejects(finalize(job)); const failed = await row(job);
    assert.equal(failed.result_key, null); assert.equal(failed[outputColumn(job)], original[outputColumn(job)]); assert.equal(failed.state, 'processing');
    await real.prepare(`UPDATE ${table(job)} SET artifact_manifest=? WHERE owner=? AND id=?`).bind(original.artifact_manifest, job.owner, job.id).run();
    await finalize(job); await readWhole(job);
  });
  for (const kind of ['article', 'local_word']) await group(`${kind}: legacy helper verifies finalizer snapshot across prefix ABA`, async () => {
    const job = await seed({kind}); await acquire(job); for (let index = 1; index < 3; index++) await putChunk(job, index);
    const original = await row(job), originalMeta = JSON.parse(original[outputColumn(job)]), changed = structuredClone(originalMeta);
    changed.parts[0].key += '-same-bytes-alias'; await h.bucket.put(changed.parts[0].key, job.parts[0]);
    const changedRaw = JSON.stringify(changed);
    await real.prepare(`UPDATE ${table(job)} SET ${outputColumn(job)}=? WHERE owner=? AND id=?`).bind(changedRaw, job.owner, job.id).run();
    let restoredBeforeHelper = 0, revertedAfterFinalPut = 0;
    // Outer native row and assembled bytes belong to changedRaw. Restore the
    // original row immediately before helper control lookup. A helper re-read
    // would validate the wrong row, then a second flip could satisfy outer CAS.
    h.on({method: 'bucket.get', phase: 'after', match: ({key}) => key === originalMeta.parts[2].key,
      action: () => d1.on('first', ({source}) => source.startsWith('SELECT * FROM word_recovery '), async () => {
        restoredBeforeHelper++;
        await real.prepare(`UPDATE ${table(job)} SET ${outputColumn(job)}=? WHERE owner=? AND id=?`).bind(original[outputColumn(job)], job.owner, job.id).run();
      })});
    const removeLateFlip = h.on({method: 'bucket.put', phase: 'after', match: ({key}) => key.includes(job.id) && key.endsWith(`result-${job.sha}.docx`),
      action: async () => { revertedAfterFinalPut++; await real.prepare(`UPDATE ${table(job)} SET ${outputColumn(job)}=? WHERE owner=? AND id=?`).bind(changedRaw, job.owner, job.id).run(); }});
    try {
      await assert.rejects(finalize(job), /续接绑定/);
      assert.equal(restoredBeforeHelper, 1); assert.equal(revertedAfterFinalPut, 0);
      assert.equal((await row(job)).result_key, null);
      assert.equal((await row(job))[outputColumn(job)], original[outputColumn(job)]);
    } finally { removeLateFlip(); }
    await finalize(job); await readWhole(job);
  });

  function onAdoption(method, action) {
    return d1.on(method === 'acquire' ? 'batch' : 'run', ({source}) => source.includes('INSERT OR IGNORE INTO word_recovery('), action);
  }
  async function adopt(job, method) { return method === 'acquire' ? acquire(job) : intent(job, 'run'); }
  for (const method of ['acquire', 'intent']) await group(`${method}: first adoption CAS rejects output/manifest/claim/input/completed races with no receipt`, async () => {
    for (const mutation of ['output', 'manifest', 'claim', 'input', 'completed']) {
      const job = await seed(), original = await row(job);
      onAdoption(method, async () => {
        if (mutation === 'output') { const meta = JSON.parse(original.result_meta); meta.progress_updated_at = '2000-01-01T00:00:00.000Z'; await real.prepare('UPDATE articles SET result_meta=? WHERE id=?').bind(JSON.stringify(meta), job.id).run(); }
        if (mutation === 'manifest') await real.prepare('UPDATE articles SET artifact_manifest=? WHERE id=?').bind(JSON.stringify(JSON.parse(original.artifact_manifest), null, 2), job.id).run();
        if (mutation === 'claim') await real.prepare('UPDATE articles SET claim_token=? WHERE id=?').bind(randomUUID(), job.id).run();
        if (mutation === 'input') await real.prepare('UPDATE articles SET paragraphs=? WHERE id=?').bind(JSON.stringify(['changed source']), job.id).run();
        if (mutation === 'completed') await real.prepare("UPDATE articles SET state='word_ready',result_key=? WHERE id=?").bind(`synthetic-completed/${job.id}`, job.id).run();
      });
      await assert.rejects(adopt(job, method)); assert.equal(await control(job), null); assert.equal(await receipts(job), 0);
    }
  });
  for (const method of ['acquire', 'intent']) await group(`${method}: local first adoption eligibility flips leave no control/receipt`, async () => {
    for (const [field, value] of [['source_kind', 'other_source'], ['output_mode', 'text_only'], ['destinations_json', '["external"]']]) {
      const job = await seed({kind: 'local_word'});
      onAdoption(method, () => real.prepare(`UPDATE local_word_jobs SET ${field}=? WHERE id=?`).bind(value, job.id).run());
      await assert.rejects(adopt(job, method)); assert.equal(await control(job), null); assert.equal(await receipts(job), 0);
    }
  });
  for (const kind of ['article', 'local_word']) for (const method of ['acquire', 'intent']) {
    await group(`${kind}/${method}: ungranted historical writer cannot win before adoption CAS`, async () => {
      const job=await seed({kind});onAdoption(method,async()=>{await assert.rejects(putChunk(job,1,null));});
      await adopt(job,method);await assertBinding(job,1);
      assert.equal(JSON.parse((await row(job))[outputColumn(job)]).parts.length,1);
      if(method==='intent')await acquire(job);
      await complete(job);await readWhole(job);
    });
    await group(`${kind}/${method}: ungranted native write rejects before any R2 upload`, async () => {
      const job=await seed({kind}),before=h.counts['bucket.put']||0;
      await assert.rejects(putChunk(job,1,null));assert.equal(h.counts['bucket.put']||0,before);
      await adopt(job,method);await assertBinding(job,1);
      if(method==='intent')await acquire(job);
      await complete(job);await readWhole(job);
    });
  }
  await group('concurrent first acquire/setIntent preserve one exact stable binding', async () => {
    const job = await seed(), results = await Promise.allSettled([acquire(job), intent(job, 'run')]);
    assert.ok(results.some(result => result.status === 'fulfilled')); const binding = await assertBinding(job, 1);
    assert.ok((await receipts(job)) <= 1); await intent(job, 'paused'); await acknowledgeSettled(job); await intent(job, 'run'); await acquire(job);
    await complete(job); await readWhole(job); assert.equal((await control(job)).legacy_output_binding, binding);
  });
  assert.equal(d1.pendingHooks, 0); assert.equal(h.externalCalls, 0);
  console.log(`RESULT ${passed} groups PASS; actual local workerd D1; synthetic images/Word/R2 only; zero external calls`);
} finally { h.close(); await mf.dispose(); }
