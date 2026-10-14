import { db } from './test-store';
import { bucket } from './articles';
import { ArticleDeletionError, assertStoredKeysAreArticleScoped, validArticleObjectKey } from './article-deletion';
import { stepwiseTextAuthorizationKey } from './stepwise-text';

// This is an explicit, owner-confirmed content purge, separate from clearing the
// five recent rows. Only content-free identities survive the operation.
type Row = Record<string, string | number | null>;
type File = { key: string; size: number; etag: string | null };
type DedaoPair = { batch_id: string; ordinal: number; article_id: string };
type Selector = { table: string; where: string; values: Array<string | number | null> };
type Fence = { entity_kind: string; entity_key: string; article_id: string };
type Safety = { article_id: string; claim_sha256: string | null; execution_sha256: string | null; input_sha256: string | null; grant_request_key: string | null;
  token_sha256: string | null; epoch: number | null; acquisition_request_key: string | null; holder_mode: 'mapped_executor' | 'manual_help' | 'unknown' };
type Ref = { table: string; keys: string[]; values: Array<string | number | null>; fingerprint: string; article_id: string; action: 'delete' | 'scrub' };
type Target = { id: string; fingerprint: string; had_article: boolean; files: File[]; file_count: number; bytes: number;
  graph?: Ref[]; selectors?: Selector[]; fences?: Fence[]; include_dedao_articles?: boolean; excluded_dedao_article_count?: number; dedao_pairs?: DedaoPair[];
  safety?: Safety[] };
type Operation = Row & { id: string; owner: string; state: string; scope: string; snapshot_json: string; snapshot_sha256: string; expires: string; lock_token: string | null; lock_expires: string | null };
type Spec = { keys: string[]; direct?: boolean; word?: boolean; parent?: string; scrub?: string; clean?: string };
const specs: Record<string, Spec> = {
  writing_runs: { keys: ['id'], direct: true, scrub: "state='permanently_deleted',token=NULL,expires=NULL,topic=NULL,sources=NULL,input_snapshot=NULL,error=NULL", clean: "state='permanently_deleted' AND token IS NULL AND expires IS NULL AND topic IS NULL AND sources IS NULL AND input_snapshot IS NULL AND error IS NULL" },
  daily_editorial_drafts: { keys: ['run_id'], direct: true },
  outline_flows: { keys: ['id'], direct: true }, editorial_flows: { keys: ['id'], direct: true },
  editorial_runs_v3: { keys: ['id'], direct: true, scrub: "state='permanently_deleted',input_json='{}',snapshot_json='{}',error=NULL", clean: "state='permanently_deleted' AND input_json='{}' AND snapshot_json='{}' AND error IS NULL" },
  article_deliveries: { keys: ['id'], direct: true }, article_upload_attempts: { keys: ['id'], direct: true },
  article_upload_executor_ends: { keys: ['attempt_id'], direct: true }, article_upload_diagnostics: { keys: ['id'], direct: true },
  article_handoffs: { keys: ['id'], direct: true }, article_output_restarts: { keys: ['id'], direct: true },
  article_help_queue_claims: { keys: ['request_key'], direct: true }, article_word_executor_ends: { keys: ['request_key'], direct: true },
  article_word_claim_recoveries: { keys: ['request_key'], direct: true },
  outline_flow_stages: { keys: ['id'], parent: 'outline_flows' }, editorial_stages: { keys: ['id'], parent: 'editorial_flows' },
  editorial_stages_v3: { keys: ['id'], parent: 'editorial_runs_v3' }, editorial_body_continuations_v3: { keys: ['id'], parent: 'editorial_runs_v3' },
  editorial_cloud_delegations_v3: { keys: ['stage_id'], parent: 'editorial_runs_v3' }, editorial_revision_cloud_delegations_v3: { keys: ['stage_id'], parent: 'editorial_runs_v3' },
  editorial_revision_continuations_v3: { keys: ['id'], parent: 'editorial_runs_v3' }, editorial_failed_writer_continuations_v3: { keys: ['id'], parent: 'editorial_runs_v3' },
  editorial_failed_writer_cloud_delegations_v3: { keys: ['stage_id'], parent: 'editorial_runs_v3' }, editorial_agent_claim_recoveries_v3: { keys: ['id'], parent: 'editorial_runs_v3' },
  editorial_daily_cloud_delegations_v3: { keys: ['stage_id'], parent: 'editorial_runs_v3' },
  editorial_requests: { keys: ['id'] }, editorial_request_outbox: { keys: ['request_id'] }, workflow_controls: { keys: ['scope', 'run_id'] },
  manual_writing_batches: { keys: ['id'], scrub: "snapshot='{}'", clean: "snapshot='{}'" },
  claude_attempts: { keys: ['id'], scrub: "state='permanently_deleted',response='{}'", clean: "state='permanently_deleted' AND (response IS NULL OR response='{}')" },
  word_progress_events: { keys: ['target_kind', 'target_id', 'version'], word: true }, word_recovery: { keys: ['target_kind', 'target_id'], word: true },
  word_checkpoints: { keys: ['target_kind', 'target_id', 'asset_id'], word: true }, word_image_candidates: { keys: ['target_kind', 'target_id', 'candidate_id'], word: true },
  word_execution_receipts: { keys: ['request_key'], word: true }, word_execution_queue: { keys: ['request_key'], word: true }, word_execution_requests: { keys: ['request_key'], word: true },
  word_attempts: { keys: ['target_kind', 'target_id', 'attempt_id'], word: true }, word_attempt_requests: { keys: ['request_key'], word: true },
  word_claim_origins: { keys: ['target_kind', 'target_id', 'claim_hash'], word: true }, word_serial_slots: { keys: ['target_kind', 'target_id'], word: true },
  dedao_items: { keys: ['batch_id', 'ordinal'] }, dedao_actions: { keys: ['batch_id', 'ordinal', 'action'] }, dedao_chunks: { keys: ['batch_id', 'ordinal', 'offset'] },
};
const validId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v);
const now = () => new Date().toISOString();
const until = () => new Date(Date.now() + 30 * 60_000).toISOString();
const json = (value: unknown): Record<string, unknown> => { try { return typeof value === 'string' ? JSON.parse(value) : {}; } catch { return {}; } };
const strings = (values: unknown[]) => [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))].sort();
async function shaText(value: string) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join(''); }
const hash = (value: unknown) => shaText(JSON.stringify(value));
const contains = (column: string) => `${column} IN (SELECT value FROM json_each(?))`;
const valuesOf = (rows: Row[], column: string) => strings(rows.map(r => r[column]));
const rowOwner = (table: string) => ['dedao_actions', 'dedao_chunks'].includes(table)
  ? `EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=${table}.batch_id AND b.owner=?)` : 'owner=?';
async function ownedRows(table: string, owner: string) {
  const rows = (await db().prepare(`SELECT * FROM ${table} WHERE ${rowOwner(table)} ORDER BY rowid LIMIT 5001`).bind(owner).all<Row>()).results;
  if (rows.length > 5000) throw new ArticleDeletionError('关联记录超过单次核验上限，未生成可确认预览', 503);
  return rows;
}
const validDedaoPair = (pair: DedaoPair) => validId(pair.batch_id) && validId(pair.article_id) && Number.isSafeInteger(pair.ordinal) && pair.ordinal > 0;
const dedaoPrefix = (pair: DedaoPair) => `dedao/${pair.batch_id}/${pair.ordinal}/`;
function validDedaoObjectKey(pair: DedaoPair, key: string) {
  if (!validDedaoPair(pair) || !key.startsWith(dedaoPrefix(pair))) return false;
  const match = /^chunk-(0|[1-9][0-9]*)-([a-f0-9]{64})$/.exec(key.slice(dedaoPrefix(pair).length));
  return !!match && Number.isSafeInteger(Number(match[1]));
}
async function scopedObjectFiles(prefix: string, valid: (key: string) => boolean) {
  const out: File[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  do {
    // R2 list returns the actual object's size and ETag. One HEAD per file would
    // exhaust the Worker request budget for a legitimate 1,000-object article.
    const page = await bucket().list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page.objects) {
      if (!valid(object.key) || !Number.isSafeInteger(object.size) || object.size < 0) throw new ArticleDeletionError('发现无法确认身份的文章文件，未生成预览', 503);
      if (!seen.has(object.key)) { seen.add(object.key); out.push({ key: object.key, size: object.size, etag: object.etag || null }); }
      if (out.length > 1000) throw new ArticleDeletionError('单篇关联文件超出核验上限，未生成完整预览', 503);
    }
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw new ArticleDeletionError('文件清单读取未完成，未生成完整预览', 503);
    cursor = page.cursor;
  } while (true);
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
const objectFiles = (id: string) => scopedObjectFiles(`articles/${id}/`, key => validArticleObjectKey(id, key));
async function targetObjects(target: Target, includeDedao: boolean) {
  const files = await objectFiles(target.id);
  if (includeDedao) for (const pair of target.dedao_pairs || []) {
    if (!validDedaoPair(pair) || pair.article_id !== target.id) throw new ArticleDeletionError('得到副本冻结配对无效，已暂停', 503);
    files.push(...await scopedObjectFiles(dedaoPrefix(pair), key => validDedaoObjectKey(pair, key)));
  }
  if (files.length > 1000) throw new ArticleDeletionError('单篇关联文件超出核验上限，未生成完整预览', 503);
  return files.sort((a, b) => a.key.localeCompare(b.key));
}
async function assertDedaoBindings(owner: string, targets: Target[]) {
  if (targets[0].include_dedao_articles !== true) return;
  const pairs = targets.flatMap(t => t.dedao_pairs || []), batchIds = strings(pairs.map(p => p.batch_id));
  if (!pairs.length) return;
  const batches = (await db().prepare(`SELECT id FROM dedao_batches WHERE owner=? AND ${contains('id')}`).bind(owner, JSON.stringify(batchIds)).all<Row>()).results;
  if (batches.length !== batchIds.length) throw new ArticleDeletionError('得到副本批次归属已变化，已暂停', 409);
  const items = (await db().prepare('SELECT owner,batch_id,ordinal,article_id FROM dedao_items WHERE json_array(batch_id,ordinal) IN (SELECT value FROM json_each(?))').bind(JSON.stringify(pairs.map(p => [p.batch_id, p.ordinal]))).all<Row>()).results;
  for (const item of items) {
    const pair = pairs.find(p => p.batch_id === item.batch_id && p.ordinal === item.ordinal);
    if (!pair || item.owner !== owner || item.article_id !== pair.article_id) throw new ArticleDeletionError('得到永久配对与当前文章或owner不一致，已暂停', 409);
  }
}

// One bounded read per owned table, then explicit joins in memory. It never
// persists bodies, snapshots, claims, tokens or provider responses in the preview.
async function collect(owner: string, includeDedao = true) {
  const articles = await ownedRows('articles', owner);
  const tombs = await ownedRows('article_deletions', owner);
  const ids = strings([...articles.map(r => r.id), ...tombs.map(r => r.id)]);
  if (ids.length > 200 || !ids.every(validId)) throw new ArticleDeletionError('文章集合超过安全核验范围', 503);
  if (!ids.length) throw new ArticleDeletionError('没有需要删除或核验残留的文章', 409);
  const all: Record<string, Row[]> = {};
  for (const table of Object.keys(specs)) if (includeDedao || !table.startsWith('dedao_')) all[table] = await ownedRows(table, owner);
  const existingFences = await ownedRows('article_content_fences', owner);
  const selected: Record<string, Row[]> = {}, origins = new Map<Row, string>(), selectors: Selector[] = [];
  const idSet = new Set(ids);
  const select = (table: string, rows: Row[], where: string, values: Selector['values'], origin: (r: Row) => string) => {
    selected[table] = rows; selectors.push({ table, where, values });
    for (const row of rows) origins.set(row, origin(row));
  };
  for (const [table, spec] of Object.entries(specs)) {
    if (spec.direct) select(table, all[table].filter(r => idSet.has(String(r.article_id))), contains('article_id'), [JSON.stringify(ids)], r => String(r.article_id));
    if (spec.word) select(table, all[table].filter(r => r.target_kind === 'article' && idSet.has(String(r.target_id))), `target_kind='article' AND ${contains('target_id')}`, [JSON.stringify(ids)], r => String(r.target_id));
  }
  const dedaoPairs: DedaoPair[] = [];
  if (includeDedao) {
    const batches = await ownedRows('dedao_batches', owner);
    const batchIds = new Set(batches.map(b => String(b.id)));
    const boundItems = all.dedao_items.filter(r => idSet.has(String(r.article_id)));
    for (const item of boundItems) {
      const pair = { batch_id: String(item.batch_id), ordinal: Number(item.ordinal), article_id: String(item.article_id) };
      if (!validDedaoPair(pair) || !batchIds.has(pair.batch_id) || !validId(item.id)) throw new ArticleDeletionError('文章关联得到条目的批次归属或配对身份不一致，未生成预览', 503);
      dedaoPairs.push(pair);
    }
    for (const stored of existingFences.filter(f => f.entity_kind === 'dedao_items.batch_ordinal' && idSet.has(String(f.article_id)))) {
      let value: unknown; try { value = JSON.parse(String(stored.entity_key)); } catch { value = null; }
      const pair = { batch_id: Array.isArray(value) ? value[0] : '', ordinal: Array.isArray(value) ? value[1] : 0, article_id: String(stored.article_id) } as DedaoPair;
      if (!validDedaoPair(pair) || JSON.stringify([pair.batch_id, pair.ordinal]) !== stored.entity_key || !batchIds.has(pair.batch_id)) throw new ArticleDeletionError('既有得到副本永久配对无法核验，未生成预览', 503);
      const current = all.dedao_items.find(i => i.batch_id === pair.batch_id && i.ordinal === pair.ordinal);
      if (current && current.article_id !== pair.article_id) throw new ArticleDeletionError('得到永久配对与当前文章绑定不一致，未生成预览', 503);
      dedaoPairs.push(pair);
    }
    const unique = [...new Map(dedaoPairs.map(p => [JSON.stringify([p.batch_id, p.ordinal]), p])).values()].sort((a, b) => `${a.batch_id}:${a.ordinal}`.localeCompare(`${b.batch_id}:${b.ordinal}`));
    dedaoPairs.splice(0, dedaoPairs.length, ...unique);
    const pairValues = JSON.stringify(dedaoPairs.map(p => [p.batch_id, p.ordinal]));
    const allPairItems = (await db().prepare('SELECT owner,batch_id,ordinal,article_id FROM dedao_items WHERE json_array(batch_id,ordinal) IN (SELECT value FROM json_each(?))').bind(pairValues).all<Row>()).results;
    if (allPairItems.some(i => i.owner !== owner || i.article_id !== dedaoPairs.find(p => p.batch_id === i.batch_id && p.ordinal === i.ordinal)?.article_id)) throw new ArticleDeletionError('得到永久配对被不同owner或文章占用，未生成预览', 409);
    const pairOrigin = (r: Row) => dedaoPairs.find(p => p.batch_id === r.batch_id && p.ordinal === r.ordinal)!.article_id;
    select('dedao_items', all.dedao_items.filter(r => dedaoPairs.some(p => p.batch_id === r.batch_id && p.ordinal === r.ordinal)), `(${contains('article_id')} OR json_array(batch_id,ordinal) IN (SELECT value FROM json_each(?))) AND EXISTS(SELECT 1 FROM dedao_batches b WHERE b.id=dedao_items.batch_id AND b.owner=dedao_items.owner)`, [JSON.stringify(ids), pairValues], pairOrigin);
    for (const table of ['dedao_actions', 'dedao_chunks']) select(table, all[table].filter(r => dedaoPairs.some(p => p.batch_id === r.batch_id && p.ordinal === r.ordinal)), 'json_array(batch_id,ordinal) IN (SELECT value FROM json_each(?))', [pairValues], pairOrigin);
    for (const chunk of selected.dedao_chunks) {
      const pair = dedaoPairs.find(p => p.batch_id === chunk.batch_id && p.ordinal === chunk.ordinal)!;
      if (!Number.isSafeInteger(chunk.offset) || Number(chunk.offset) < 0 || !Number.isSafeInteger(chunk.size) || Number(chunk.size) < 1 || !/^[a-f0-9]{64}$/.test(String(chunk.sha256))
        || chunk.object_key !== `${dedaoPrefix(pair)}chunk-${chunk.offset}-${chunk.sha256}`) throw new ArticleDeletionError('文章关联得到分块身份无法核验，未生成预览', 503);
    }
  }
  const manualIds = new Set<string>();
  const stepwiseBindings = selected.writing_runs.filter(r => String(r.run_kind).startsWith('stepwise_text:')).map(r => ({ run_id: String(r.run_kind).slice(14), writer: String(r.writer), article_id: String(r.article_id) }));
  const batchOrigins = new Map<string, string>();
  for (const draft of selected.daily_editorial_drafts) if (draft.revision_flow_id) manualIds.add(String(draft.revision_flow_id));
  for (const article of articles) {
    const manifest = json(article.artifact_manifest), revision = manifest.text_revision as Record<string, unknown> | undefined;
    if (typeof revision?.flow_id === 'string') manualIds.add(revision.flow_id);
  }
  // A dual-writer batch is shared only when every existing writer run points to
  // this confirmed article set. Independent unfinished plans remain excluded.
  for (const batch of all.manual_writing_batches) {
    const runs = all.writing_runs.filter(r => r.run_kind === `manual:${batch.id}`);
    const snapshot = json(batch.snapshot), writers = snapshot.writers && typeof snapshot.writers === 'object' ? Object.keys(snapshot.writers) : [];
    if (runs.length && runs.every(r => idSet.has(String(r.article_id))) && writers.every(writer => runs.some(r => r.writer === writer))) manualIds.add(String(batch.id));
    const stepwise = stepwiseBindings.filter(b => b.run_id === batch.id);
    if (stepwise.length && !writers.every(writer => stepwise.some(r => r.writer === writer)) && snapshot.results && typeof snapshot.results === 'object'
      && Object.keys(snapshot.results).some(writer => stepwise.some(r => r.writer === writer))) throw new ArticleDeletionError('共享旧批次包含文章成果且仍有独立作者任务，不能完整清除或扩大范围，请先核清该批次', 409);
    if (stepwise.length && writers.length && writers.every(writer => stepwise.some(r => r.writer === writer))) { manualIds.add(String(batch.id)); batchOrigins.set(String(batch.id), stepwise[0].article_id); }
    const derived = snapshot.namespace_version === 1 && snapshot.flow_id === batch.id ? stepwiseBindings.find(b => b.run_id === snapshot.run_id && b.writer === snapshot.writer) : undefined;
    if (derived) { manualIds.add(String(batch.id)); batchOrigins.set(String(batch.id), derived.article_id); }
    const source = snapshot.daily_source as Record<string, unknown> | undefined;
    const bound = manualIds.has(String(batch.id)) || idSet.has(String(source?.article_id));
    if (bound && runs.some(r => !idSet.has(String(r.article_id)))) throw new ArticleDeletionError('文章关联批次还被独立任务共用，不能将该任务加入永久删除范围', 409);
    if (idSet.has(String(source?.article_id))) manualIds.add(String(batch.id));
  }
  const batchRows = all.manual_writing_batches.filter(r => manualIds.has(String(r.id)));
  const batchOrigin = (r: Row) => {
    const source = json(r.snapshot).daily_source as Record<string, unknown> | undefined;
    return batchOrigins.get(String(r.id)) || (idSet.has(String(source?.article_id)) ? String(source?.article_id)
      : String(selected.daily_editorial_drafts.find(d => d.revision_flow_id === r.id)?.article_id
        || articles.find(a => (json(a.artifact_manifest).text_revision as Record<string, unknown> | undefined)?.flow_id === r.id)?.id
        || selected.writing_runs.find(w => w.run_kind === `manual:${r.id}`)?.article_id || ids[0]));
  };
  select('manual_writing_batches', batchRows, `${contains('id')} OR (json_valid(snapshot) AND (${contains("json_extract(snapshot,'$.daily_source.article_id')")} OR (json_extract(snapshot,'$.namespace_version')=1 AND json_extract(snapshot,'$.flow_id')=id AND EXISTS(SELECT 1 FROM json_each(?) b WHERE json_extract(snapshot,'$.run_id')=json_extract(b.value,'$.run_id') AND json_extract(snapshot,'$.writer')=json_extract(b.value,'$.writer')))))`, [JSON.stringify([...manualIds].sort()), JSON.stringify(ids), JSON.stringify(stepwiseBindings)], batchOrigin);
  const revisionRuns = all.writing_runs.filter(r => [...manualIds].some(id => String(r.run_kind).startsWith(`text_revision:${id}:`)));
  const writingSet = new Set([...selected.writing_runs, ...revisionRuns]);
  selected.writing_runs = all.writing_runs.filter(r => writingSet.has(r));
  for (const run of revisionRuns) origins.set(run, batchOrigin(batchRows.find(b => String(run.run_kind).startsWith(`text_revision:${b.id}:`))!));
  const writingSelector = selectors.find(s => s.table === 'writing_runs')!;
  writingSelector.where += ` OR ${contains('id')}`; writingSelector.values.push(JSON.stringify(valuesOf(revisionRuns, 'id')));
  for (const [table, spec] of Object.entries(specs)) if (spec.parent) {
    const parent = selected[spec.parent], parentIds = valuesOf(parent, 'id');
    const rows = all[table].filter(r => parentIds.includes(String(r.run_id)) || (r.article_id && idSet.has(String(r.article_id))));
    const directArticle = table === 'editorial_revision_cloud_delegations_v3';
    select(table, rows, `${contains('run_id')}${directArticle ? ` OR ${contains('article_id')}` : ''}`,
      [JSON.stringify(parentIds), ...(directArticle ? [JSON.stringify(ids)] : [])], r => String(r.article_id || origins.get(parent.find(p => p.id === r.run_id)!)));
  }
  const flowIds = valuesOf(selected.editorial_flows, 'id');
  select('editorial_requests', all.editorial_requests.filter(r => flowIds.includes(String(r.flow_id))), contains('flow_id'), [JSON.stringify(flowIds)], r => origins.get(selected.editorial_flows.find(p => p.id === r.flow_id)!)!);
  const requestIds = valuesOf(selected.editorial_requests, 'id');
  select('editorial_request_outbox', all.editorial_request_outbox.filter(r => requestIds.includes(String(r.request_id))), contains('request_id'), [JSON.stringify(requestIds)], r => origins.get(selected.editorial_requests.find(p => p.id === r.request_id)!)!);
  const controls = all.workflow_controls.filter(r => (r.scope === 'outline_flow' && valuesOf(selected.outline_flows, 'id').includes(String(r.run_id)))
    || (r.scope === 'editorial_v2' && flowIds.includes(String(r.run_id))) || (r.scope === 'editorial_v3' && valuesOf(selected.editorial_runs_v3, 'id').includes(String(r.run_id))));
  select('workflow_controls', controls, `(scope='outline_flow' AND ${contains('run_id')}) OR (scope='editorial_v2' AND ${contains('run_id')}) OR (scope='editorial_v3' AND ${contains('run_id')})`,
    [JSON.stringify(valuesOf(selected.outline_flows, 'id')), JSON.stringify(flowIds), JSON.stringify(valuesOf(selected.editorial_runs_v3, 'id'))], r => origins.get(selected[r.scope === 'outline_flow' ? 'outline_flows' : r.scope === 'editorial_v2' ? 'editorial_flows' : 'editorial_runs_v3'].find(p => p.id === r.run_id)!)!);
  const receipts = new Map<string, string>();
  const receipt = (id: unknown, article: string) => { if (typeof id === 'string' && id) receipts.set(id, article); };
  for (const draft of selected.daily_editorial_drafts) receipt(draft.provider_attempt_id, origins.get(draft)!);
  for (const table of ['editorial_stages', 'editorial_stages_v3']) for (const stage of selected[table]) receipt(stage.receipt_id, origins.get(stage)!);
  for (const run of selected.writing_runs) {
    const article = origins.get(run)!;
    if (run.writer === 'claude' && run.run_kind === 'daily') receipt(`${owner}:${run.day}`, article);
    if (run.writer === 'claude' && run.run_kind === 'workflow_test') for (const prefix of ['workflow-test', 'workflow-test-retry', 'workflow-test-extended']) receipt(`${prefix}:${owner}:${run.day}`, article);
    if (run.writer === 'claude' && run.run_kind === 'workflow_rewrite_v2') for (const prefix of ['workflow-rewrite-v2', 'workflow-rewrite-v2-confirmed-retry']) receipt(`${prefix}:${owner}:${run.day}`, article);
    if (run.writer === 'claude' && String(run.run_kind).startsWith('manual:')) receipt(`manual:${owner}:${String(run.run_kind).slice(7)}:claude`, article);
    if (String(run.run_kind).startsWith('stepwise_text:')) receipt(`stepwise_text:${owner}:${String(run.run_kind).slice(14)}:${run.writer}`, article);
  }
  for (const flow of selected.outline_flows) for (const stage of ['outline', 'body']) receipt(`outline_flow:${owner}:${flow.id}:${stage}`, origins.get(flow)!);
  for (const batch of batchRows) {
    receipt(`text_revision:${owner}:${batch.id}`, origins.get(batch)!);
    const root = all.claude_attempts.find(r => r.id === `text_revision:${owner}:${batch.id}`);
    const results = (json(root?.response).text_revision as Record<string, unknown> | undefined)?.results;
    if (results && typeof results === 'object') for (const result of Object.values(results)) if (result && typeof result === 'object') receipt(`text_revision:receipt:${owner}:${(result as Record<string, unknown>).execution_id}`, origins.get(batch)!);
  }
  const stages = [...selected.editorial_stages, ...selected.editorial_stages_v3, ...selected.outline_flow_stages];
  const stageMap = new Map(stages.map(r => [String(r.id), origins.get(r)!]));
  const runMap = new Map([...selected.outline_flows, ...selected.editorial_flows, ...selected.editorial_runs_v3, ...batchRows].map(r => [String(r.id), origins.get(r)!]));
  const attemptRows = all.claude_attempts.filter(r => {
    const response = json(r.response), snapshot = response.snapshot as Record<string, unknown> | undefined, revision = response.text_revision_receipt as Record<string, unknown> | undefined;
    const daily = response.daily_source as Record<string, unknown> | undefined;
    const article = receipts.get(String(r.id)) || (idSet.has(String(response.article_id)) ? String(response.article_id) : undefined)
      || (idSet.has(String(snapshot?.article_id)) ? String(snapshot?.article_id) : undefined) || stageMap.get(String(response.stage_id))
      || (idSet.has(String(daily?.article_id)) ? String(daily?.article_id) : undefined) || runMap.get(String(snapshot?.run_id))
      || (manualIds.has(String(revision?.flow_id)) ? batchOrigin(batchRows.find(b => b.id === revision?.flow_id)!) : undefined);
    if (article) { origins.set(r, article); receipts.set(String(r.id), article); return true; } return false;
  });
  select('claude_attempts', attemptRows, `${contains('id')} OR (json_valid(response) AND (${contains("json_extract(response,'$.article_id')")} OR ${contains("json_extract(response,'$.snapshot.article_id')")} OR ${contains("json_extract(response,'$.daily_source.article_id')")} OR ${contains("json_extract(response,'$.snapshot.run_id')")} OR ${contains("json_extract(response,'$.stage_id')")} OR ${contains("json_extract(response,'$.text_revision_receipt.flow_id')")}))`,
    [JSON.stringify([...receipts.keys()].sort()), JSON.stringify(ids), JSON.stringify(ids), JSON.stringify(ids), JSON.stringify([...runMap.keys()].sort()), JSON.stringify([...stageMap.keys()].sort()), JSON.stringify([...manualIds].sort())], r => receipts.get(String(r.id))!);
  const graph: Ref[] = [], fences: Fence[] = [], safety: NonNullable<Target['safety']> = [];
  const fence = (kind: string, key: unknown, article: string) => { if (key != null) fences.push({ entity_kind: kind, entity_key: String(key), article_id: article }); };
  for (const [table, rows] of Object.entries(selected)) for (const row of rows) {
    const article = origins.get(row)!;
    if (!idSet.has(article)) throw new ArticleDeletionError(`关联${table}记录无法精确绑定文章，未生成预览`, 503);
    graph.push({ table, keys: specs[table].keys, values: specs[table].keys.map(k => row[k]), fingerprint: await hash(row), article_id: article, action: specs[table].scrub ? 'scrub' : 'delete' });
    if (table === 'dedao_items') fence(table, row.id, article);
    else if (!table.startsWith('dedao_')) fence(table, specs[table].word ? row.target_id : table === 'workflow_controls' ? `${row.scope}|${row.run_id}` : row[specs[table].keys[0]], article);
    if (table === 'writing_runs') fence('writing_runs.scope', JSON.stringify([row.day, row.writer, row.run_kind]), article);
    if (['manual_writing_batches', 'outline_flows', 'editorial_flows'].includes(table)) fence(`${table}.authorization_key`, row.authorization_key, article);
    if (table === 'editorial_requests') fence('editorial_requests.request_key', row.request_key, article);
    if (table === 'editorial_runs_v3') {
      fence('editorial_runs_v3.request_key', row.request_key, article); fence('editorial_runs_v3.test_intent_key', row.test_intent_key, article);
      if (row.run_kind === 'daily') fence('editorial_runs_v3.daily_slot', JSON.stringify([row.day, row.writer]), article);
    }
  }
  for (const pair of dedaoPairs) fence('dedao_items.batch_ordinal', JSON.stringify([pair.batch_id, pair.ordinal]), pair.article_id);
  for (const [id, article] of receipts) fence('claude_attempts', id, article);
  for (const binding of stepwiseBindings) {
    fence('manual_writing_batches.authorization_key', `text_revision:${stepwiseTextAuthorizationKey}:${binding.run_id}:${binding.writer}`, binding.article_id);
    fence('manual_writing_batches.source_writer', JSON.stringify([binding.run_id, binding.writer]), binding.article_id);
    fence('writing_runs.source_writer', JSON.stringify([binding.run_id, binding.writer]), binding.article_id);
  }
  for (const article of articles) {
    const slot = selected.word_serial_slots.find(r => r.target_id === article.id);
    const control = selected.word_recovery.find(r => r.target_id === article.id);
    const claim = typeof article.claim_token === 'string' ? await shaText(article.claim_token) : null;
    const currentAttempt = control?.attempt_id && selected.word_attempts.find(r => r.target_id === article.id && r.attempt_id === control.attempt_id);
    const settled = control?.execution_id && (selected.article_word_executor_ends.some(r => r.article_id === article.id && r.claim_hash === control.claim_hash && r.execution_id === control.execution_id && json(r.proof_json).confirm_all_actions_settled === true)
      || selected.article_word_claim_recoveries.some(r => r.article_id === article.id && r.old_claim_hash === control.claim_hash && json(r.termination_json).execution_id === control.execution_id && json(r.termination_json).confirm_all_actions_settled === true));
    const knownUnstarted = selected.word_claim_origins.some(r => r.target_id === article.id && r.claim_hash === article.word_claim_origin_hash && r.origin === 'fresh_claim')
      || (control && selected.article_word_claim_recoveries.some(r => r.article_id === article.id && r.next_claim_hash === control.claim_hash && r.next_claim_hash === article.word_claim_origin_hash && json(r.termination_json).confirm_all_actions_settled === true));
    const isWordPending = article.state === 'processing' && article.result_key == null;
    const hasWritingSource = ['writing_runs', 'outline_flows', 'editorial_flows', 'editorial_runs_v3'].some(table => selected[table].some(r => r.article_id === article.id));
    const legacyUnknown = isWordPending && claim && !currentAttempt && !knownUnstarted && !hasWritingSource;
    const legacyGrant = isWordPending && control && control.attempt_id == null && !settled && selected.word_execution_receipts.some(r => r.target_id === article.id && r.claim_hash === control.claim_hash && r.execution_id === control.execution_id);
    const activeAttempt = currentAttempt && (['running', 'stop_requested', 'waiting_safe_stop'].includes(String(currentAttempt.state)) || (currentAttempt.state === 'blocked' && currentAttempt.started_at != null && currentAttempt.ended_at == null));
    // Completed Word output and a retained platform-upload claim do not imply
    // a live Word holder. These match the existing serial execution contract.
    if (slot || activeAttempt || legacyGrant || legacyUnknown) {
      const source = slot || control;
      const grant = selected.word_execution_receipts.find(r => r.target_id === article.id && r.claim_hash === source?.claim_hash && r.execution_id === source?.execution_id
        && r.input_sha256 === source?.input_sha256 && r.request_key === (slot?.grant_request_key || control?.request_key)
        && (!slot || (r.token_hash === slot.token_hash && r.epoch === slot.epoch)));
      const help = selected.article_help_queue_claims.find(r => r.article_id === article.id && r.claim_hash === claim && selected.article_handoffs.some(h => h.id === r.handoff_id && h.event_id === r.event_id && h.article_id === r.article_id));
      const mapped = !!grant && typeof grant.token_hash === 'string' && typeof grant.input_sha256 === 'string' && typeof grant.execution_id === 'string' && typeof grant.epoch === 'number' && grant.epoch > 0;
      const manual = !mapped && !!help && !slot && control?.execution_id == null && control?.token_hash == null && (!control || control.claim_hash === claim) && !selected.word_execution_receipts.some(r => r.target_id === article.id);
      let input: string | null = typeof source?.input_sha256 === 'string' ? source.input_sha256 : null;
      if (!input || manual) { try { input = await hash(JSON.parse(String(article.paragraphs))); } catch { input = null; /* Incomplete history cannot authorize settlement. */ } }
      safety.push({ article_id: String(article.id), claim_sha256: typeof grant?.claim_hash === 'string' ? grant.claim_hash : typeof source?.claim_hash === 'string' ? source.claim_hash : claim,
        execution_sha256: typeof grant?.execution_id === 'string' ? await shaText(grant.execution_id) : typeof source?.execution_id === 'string' ? await shaText(source.execution_id) : null,
        input_sha256: input, grant_request_key: mapped ? String(grant.request_key) : null, token_sha256: mapped ? String(grant.token_hash) : null,
        epoch: mapped ? Number(grant.epoch) : null, acquisition_request_key: help ? String(help.request_key) : null, holder_mode: mapped ? 'mapped_executor' : manual && input && claim ? 'manual_help' : 'unknown' });
    }
  }
  graph.sort((a, b) => `${a.table}:${JSON.stringify(a.values)}`.localeCompare(`${b.table}:${JSON.stringify(b.values)}`));
  const uniqueFences = [...new Map(fences.map(f => [`${f.entity_kind}|${f.entity_key}`, f])).values()].sort((a, b) => `${a.entity_kind}|${a.entity_key}`.localeCompare(`${b.entity_kind}|${b.entity_key}`));
  if (includeDedao) for (const pair of dedaoPairs) {
    const old = existingFences.find(f => f.entity_kind === 'dedao_items.batch_ordinal' && f.entity_key === JSON.stringify([pair.batch_id, pair.ordinal]));
    if (old && graph.some(r => r.table.startsWith('dedao_') && r.values[0] === pair.batch_id && r.values[1] === pair.ordinal)) throw new ArticleDeletionError('既有得到副本删除操作尚有正文待清，请先回读并续接原操作', 409);
  }
  for (const ref of graph.filter(r => r.action === 'scrub')) {
    const fence = existingFences.find(f => f.entity_kind === ref.table && f.entity_key === String(ref.values[0]));
    if (!fence) continue;
    const selectedRow = selected[ref.table].find(r => specs[ref.table].keys.every((k, i) => r[k] === ref.values[i]))!;
    const clean = ref.table === 'writing_runs' ? selectedRow.state === 'permanently_deleted' && ['token', 'expires', 'topic', 'sources', 'input_snapshot', 'error'].every(k => selectedRow[k] == null)
      : ref.table === 'editorial_runs_v3' ? selectedRow.state === 'permanently_deleted' && selectedRow.input_json === '{}' && selectedRow.snapshot_json === '{}' && selectedRow.error == null
      : ref.table === 'claude_attempts' ? selectedRow.state === 'permanently_deleted' && (selectedRow.response == null || selectedRow.response === '{}') : selectedRow.snapshot === '{}';
    if (!clean) throw new ArticleDeletionError('既有删除操作尚有正文待清，请先回读并续接原操作；不会改绑永久源标记', 409);
  }
  const targets: Target[] = [];
  for (const id of ids) {
    const article = articles.find(r => r.id === id), tomb = tombs.find(r => r.id === id);
    if (article) assertStoredKeysAreArticleScoped(article as unknown as Parameters<typeof assertStoredKeysAreArticleScoped>[0], id);
    const targetPairs = dedaoPairs.filter(p => p.article_id === id);
    const files = await targetObjects({ id, dedao_pairs: targetPairs } as Target, includeDedao);
    targets.push({ id, had_article: !!article, fingerprint: await hash({ article: article || null, tomb: tomb || null, graph: graph.filter(r => r.article_id === id) }), files, file_count: files.length, bytes: files.reduce((n, f) => n + f.size, 0), ...(includeDedao ? { dedao_pairs: targetPairs } : {}) });
  }
  const dedao = (await db().prepare(`SELECT count(*) AS n FROM dedao_items WHERE owner=? AND ${contains('article_id')}`).bind(owner, JSON.stringify(ids)).first<{ n: number }>())?.n || 0;
  Object.assign(targets[0], { graph, selectors, fences: uniqueFences, safety, include_dedao_articles: includeDedao, excluded_dedao_article_count: includeDedao ? 0 : dedao });
  if (new TextEncoder().encode(JSON.stringify(targets)).length > 1_000_000) throw new ArticleDeletionError('完整删除快照超过安全存储上限，未生成可确认预览', 503);
  return { targets, articles, tombs, selected };
}

async function operation(owner: string, id: string) {
  if (!validId(id)) throw new ArticleDeletionError('操作编号无效', 400);
  const op = await db().prepare("SELECT * FROM article_list_deletions WHERE owner=? AND (id=? OR request_key=?) AND scope='all_articles'").bind(owner, id, id).first<Operation>();
  if (!op) throw new ArticleDeletionError('操作不存在或无权访问', 404);
  return op;
}
const targetsOf = (op: Operation) => JSON.parse(op.snapshot_json) as Target[];
const endMatchesBlock = (e = 'e', b = 'b') => ['owner', 'article_id', 'operation_id', 'claim_sha256', 'execution_sha256', 'input_sha256', 'grant_request_key', 'token_sha256', 'epoch', 'acquisition_request_key', 'holder_mode'].map(k => `${e}.${k} IS ${b}.${k}`).join(' AND ');
async function remainingRows(owner: string, targets: Target[]) {
  let count = 0;
  const article = await db().prepare(`SELECT count(*) AS n FROM articles WHERE owner=? AND ${contains('id')}`).bind(owner, JSON.stringify(targets.map(t => t.id))).first<{ n: number }>();
  count += article?.n || 0;
  for (const selector of targets[0].selectors || []) {
    const clean = specs[selector.table].clean;
    const row = await db().prepare(`SELECT count(*) AS n FROM ${selector.table} WHERE ${rowOwner(selector.table)} AND (${selector.where})${clean ? ` AND NOT (${clean})` : ''}`).bind(owner, ...selector.values).first<{ n: number }>();
    count += row?.n || 0;
  }
  return count;
}
export async function readArticleContentDeletion(owner: string, operationId: string) {
  const op = await operation(owner, operationId), targets = targetsOf(op);
  const includeDedao = targets[0].include_dedao_articles === true;
  await assertDedaoBindings(owner, targets);
  let remaining = 0, remainingDedaoObjects = 0;
  const listedDedaoPairs = new Set<string>();
  const marks = await ownedRows('article_deletions', owner), current = await ownedRows('articles', owner);
  const items = [];
  for (const target of targets) {
    const objects = await targetObjects(target, includeDedao); remaining += objects.length;
    const dedaoObjects = objects.filter(o => o.key.startsWith('dedao/')).length; remainingDedaoObjects += dedaoObjects;
    if (includeDedao) for (const pair of target.dedao_pairs || []) listedDedaoPairs.add(JSON.stringify([pair.batch_id, pair.ordinal]));
    const mark = marks.find(m => m.id === target.id), row = current.find(a => a.id === target.id);
    const priorOperation = typeof mark?.operation_id === 'string' && mark.operation_id !== op.id ? mark.operation_id : null;
    const superseded = op.confirmed_at != null ? priorOperation : null;
    const state = mark?.operation_id === op.id ? mark.state : op.state === 'deleted' && mark?.state === 'deleted' && !row ? 'deleted' : superseded && mark?.state === 'deleting' ? 'superseded_deleting' : op.state === 'previewed' ? 'previewed' : 'changed';
    items.push({ article_id: target.id, state, superseded_by: superseded, prior_deletion_operation_id: op.confirmed_at == null ? priorOperation : null, file_count: target.file_count, bytes: target.bytes, remaining_object_count: objects.length, remaining_dedao_object_count: dedaoObjects, article_record_present: !!row });
  }
  const contentRows = await remainingRows(owner, targets);
  // Old confirmations retain their exact scope, but the read result separately
  // discloses today's linked website copies instead of implying global zero.
  const currentDedao = (await ownedRows('dedao_items', owner)).filter(i => i.article_id != null);
  const batches = await ownedRows('dedao_batches', owner), batchIds = new Set(batches.map(b => String(b.id)));
  const consistentDedao = currentDedao.filter(i => batchIds.has(String(i.batch_id)));
  const inconsistentDedaoCount = currentDedao.length - consistentDedao.length;
  const currentPairMap = new Map<string, DedaoPair>();
  for (const item of consistentDedao) {
    const pair = { batch_id: String(item.batch_id), ordinal: Number(item.ordinal), article_id: String(item.article_id) };
    currentPairMap.set(JSON.stringify([pair.batch_id, pair.ordinal]), pair);
  }
  for (const fence of (await ownedRows('article_content_fences', owner)).filter(f => f.entity_kind === 'dedao_items.batch_ordinal')) {
    let value: unknown; try { value = JSON.parse(String(fence.entity_key)); } catch { value = null; }
    const pair = { batch_id: Array.isArray(value) ? value[0] : '', ordinal: Array.isArray(value) ? value[1] : 0, article_id: String(fence.article_id) } as DedaoPair;
    if (!validDedaoPair(pair) || JSON.stringify([pair.batch_id, pair.ordinal]) !== fence.entity_key || !batchIds.has(pair.batch_id)) throw new ArticleDeletionError('得到永久配对当前归属无法核验，未宣称全站清空', 503);
    const currentPair = currentPairMap.get(String(fence.entity_key));
    if (currentPair && currentPair.article_id !== pair.article_id) throw new ArticleDeletionError('得到永久配对已被其他文章占用，未宣称全站清空', 503);
    currentPairMap.set(String(fence.entity_key), pair);
  }
  const currentPairs = [...currentPairMap.values()].map(p => [p.batch_id, p.ordinal]);
  let currentDedaoRows = currentDedao.length, currentDedaoObjects = remainingDedaoObjects;
  for (const table of ['dedao_actions', 'dedao_chunks']) {
    const row = await db().prepare(`SELECT count(*) AS n FROM ${table} WHERE ${rowOwner(table)} AND json_array(batch_id,ordinal) IN (SELECT value FROM json_each(?))`).bind(owner, JSON.stringify(currentPairs)).first<{ n: number }>();
    currentDedaoRows += row?.n || 0;
  }
  for (const pair of currentPairMap.values()) {
    if (!validDedaoPair(pair)) throw new ArticleDeletionError('当前得到副本身份无法核验，未宣称全站清空', 503);
    if (!listedDedaoPairs.has(JSON.stringify([pair.batch_id, pair.ordinal]))) currentDedaoObjects += (await scopedObjectFiles(dedaoPrefix(pair), key => validDedaoObjectKey(pair, key))).length;
  }
  const includedDedaoCount = includeDedao ? (targets[0].graph || []).filter(r => r.table === 'dedao_items').length : 0;
  const includedDedaoFiles = includeDedao ? targets.flatMap(t => t.files).filter(f => f.key.startsWith('dedao/')) : [];
  const unresolved = (await db().prepare(`SELECT count(*) AS n FROM article_purge_serial_blocks b WHERE b.owner=? AND ${contains('b.article_id')} AND NOT EXISTS(SELECT 1 FROM article_purge_executor_ends e WHERE ${endMatchesBlock()} AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0)`).bind(owner, JSON.stringify(targets.map(t => t.id))).first<{ n: number }>())?.n || 0;
  const complete = op.state === 'deleted' && remaining === 0 && contentRows === 0 && items.every(i => i.state === 'deleted');
  const superseded = strings(items.map(i => i.superseded_by));
  return { operation_id: op.id, request_key: op.request_key, owner, scope: 'all_articles' as const, state: op.state === 'deleted' && !complete ? 'needs_verification' : op.state,
    snapshot_sha256: op.snapshot_sha256, expires: op.expires, count: targets.length, article_count: targets.filter(t => t.had_article).length, owner_article_count: targets.filter(t => t.had_article).length,
    prior_deleted_count: targets.filter(t => !t.had_article).length, file_count: targets.reduce((n, t) => n + t.file_count, 0), bytes: targets.reduce((n, t) => n + t.bytes, 0),
    items, content_deleted: complete, remaining_object_count: remaining, remaining_content_rows: contentRows, current_owner_article_count: current.length,
    new_article_count: current.filter(a => !targets.some(t => t.id === a.id)).length, all_owner_articles_empty: complete && current.length === 0 && currentDedaoRows === 0 && currentDedaoObjects === 0 && inconsistentDedaoCount === 0,
    pending_count: current.filter(a => !['completed', 'text_saved', 'deleting'].includes(String(a.state))).length,
    external_actions_revoked: false, external_stop_confirmed: false, unconfirmed_external_executor_count: op.state === 'previewed' ? Math.max(unresolved, targets[0].safety?.length || 0) : unresolved,
    superseded_operation_ids: superseded, requires_superseding_operation: !complete && superseded.length > 0,
    resume_required: !complete && superseded.length === 0 && op.confirmed_at != null && (op.lock_token == null || (typeof op.lock_expires === 'string' && op.lock_expires <= now())),
    waiting_for_deletion_executor: !complete && op.lock_token != null && !(typeof op.lock_expires === 'string' && op.lock_expires <= now()),
    waiting_reason: !complete && op.lock_token != null ? '当前删除执行者仍持有处理权，先只读核验' : null,
    include_dedao_articles: includeDedao, included_dedao_article_count: includedDedaoCount, included_dedao_file_count: includedDedaoFiles.length, included_dedao_bytes: includedDedaoFiles.reduce((n, f) => n + f.size, 0),
    current_bound_dedao_article_count: currentDedao.length, current_bound_dedao_content_rows: currentDedaoRows, current_bound_dedao_object_count: currentDedaoObjects,
    current_bound_dedao_pair_count: currentPairMap.size,
    current_scope_bound_dedao_article_count: currentDedao.filter(i => targets.some(t => t.id === i.article_id)).length,
    remaining_dedao_object_count: remainingDedaoObjects, inconsistent_dedao_binding_count: inconsistentDedaoCount,
    excluded_dedao_article_count: includeDedao ? currentDedao.filter(i => !targets.some(t => t.id === i.article_id)).length : currentDedao.length,
    excluded_unimported_dedao_article_count: currentDedao.filter(i => !current.some(a => a.id === i.article_id) && !marks.some(m => m.id === i.article_id)).length,
    dedao_scope: includeDedao ? '包括冻结文章集合绑定的本站得到条目、动作、分块及完整分块文件前缀；保留批次和未绑定条目' : '旧确认范围未包含得到副本；当前关联残留另行显示，续接不会扩大范围', permanent: true,
    retained_metadata: '仅保留操作快照的文章ID、源记录主键、哈希、文件身份、数量、时间、已清空的配额身份，以及无内容的永久防复活标记；未知外部执行者保留串行安全阻止标记，不宣称已停止。',
    file_scope: '确认文章所属本站原文、全部配图Word、图片、checkpoint与文章关联正文历史和任务记录；不涉及独立任务、账号、订阅、外平台草稿、Library或电脑文件。' };
}
export async function previewArticleContentDeletion(owner: string, requestKey: string) {
  if (!validId(requestKey)) throw new ArticleDeletionError('请求编号无效', 400);
  const prior = await db().prepare('SELECT id,scope FROM article_list_deletions WHERE owner=? AND request_key=?').bind(owner, requestKey).first<{ id: string; scope: string }>();
  if (prior) { if (prior.scope !== 'all_articles') throw new ArticleDeletionError('请求编号已绑定其他范围', 409); return readArticleContentDeletion(owner, prior.id); }
  const { targets } = await collect(owner), id = crypto.randomUUID(), digest = await hash(targets);
  await db().prepare("INSERT OR IGNORE INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires) VALUES(?,?,'all_articles',?,'previewed',?,?,?,?)")
    .bind(id, owner, requestKey, JSON.stringify(targets), digest, now(), until()).run();
  return readArticleContentDeletion(owner, requestKey);
}

export type ConfirmArticleContentDeletion = { operation_id: string; confirm_owner: string; confirm_scope: 'all_articles'; confirm_ids: string[]; snapshot_sha256: string; confirm_permanent: boolean };
function opGuard() { return "EXISTS(SELECT 1 FROM article_list_deletions o WHERE o.owner=? AND o.id=? AND o.scope='all_articles' AND o.state='deleting' AND o.confirmed_at IS NOT NULL AND o.lock_token=? AND o.lock_expires>?)"; }
function markGuard() { return "EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=? AND x.id=? AND x.operation_id=? AND x.lock_token=? AND x.lock_expires>?)"; }
async function release(owner: string, id: string, token: string) {
  await db().batch([
    db().prepare('UPDATE article_deletions SET lock_token=NULL,lock_expires=NULL WHERE owner=? AND operation_id=? AND lock_token=?').bind(owner, id, token),
    db().prepare('UPDATE article_list_deletions SET lock_token=NULL,lock_expires=NULL WHERE owner=? AND id=? AND lock_token=?').bind(owner, id, token),
  ]);
}
async function renew(owner: string, id: string, token: string) {
  const time = now(), expires = until();
  const result = await db().batch([
    db().prepare("UPDATE article_list_deletions SET lock_expires=? WHERE owner=? AND id=? AND state='deleting' AND lock_token=? AND lock_expires>?").bind(expires, owner, id, token, time),
    db().prepare('UPDATE article_deletions SET lock_expires=? WHERE owner=? AND operation_id=? AND lock_token=?').bind(expires, owner, id, token),
  ]);
  if (!result[0].meta.changes) throw new ArticleDeletionError('删除处理权已变化，请回读原操作', 409);
}
export async function confirmArticleContentDeletion(owner: string, args: ConfirmArticleContentDeletion) {
  let op = await operation(owner, args.operation_id);
  const targets = targetsOf(op);
  if (args.confirm_owner !== owner || args.confirm_scope !== 'all_articles' || args.confirm_permanent !== true || args.snapshot_sha256 !== op.snapshot_sha256
    || !Array.isArray(args.confirm_ids) || JSON.stringify(args.confirm_ids) !== JSON.stringify(targets.map(t => t.id))) throw new ArticleDeletionError('必须明确确认原预览的owner、永久范围、文章集合和快照哈希', 400);
  if (op.state === 'deleted') {
    const result = await readArticleContentDeletion(owner, op.id);
    if (result.content_deleted) return result;
    if (result.requires_superseding_operation) return result;
    // The exact previously authorized article namespaces cover delayed uploads,
    // including another valid hash key. Re-open this operation, never its scope.
    await db().prepare("UPDATE article_list_deletions SET state='deleting' WHERE owner=? AND id=? AND state='deleted' AND (lock_token IS NULL OR lock_expires<=?)").bind(owner, op.id, now()).run();
    op = await operation(owner, op.id);
  }
  if (op.confirmed_at != null && op.state !== 'deleted') {
    const moved = await db().prepare(`SELECT id FROM article_deletions WHERE owner=? AND ${contains('id')} AND operation_id IS NOT ? LIMIT 1`).bind(owner, JSON.stringify(targets.map(t => t.id)), op.id).first();
    if (moved) return readArticleContentDeletion(owner, op.id);
  }
  const token = crypto.randomUUID(), time = now(), expires = until();
  if (op.state === 'previewed') {
    if (op.expires <= time) throw new ArticleDeletionError('预览已过期，请重新预览', 409);
    const fresh = await collect(owner, targets[0].include_dedao_articles === true);
    if (await hash(fresh.targets) !== op.snapshot_sha256) throw new ArticleDeletionError('文章集合、正文记录或文件已变化，请重新预览', 409);
    const commands: D1PreparedStatement[] = [db().prepare("UPDATE article_list_deletions SET state='deleting',confirmed_at=?,lock_token=?,lock_expires=? WHERE owner=? AND id=? AND state='previewed' AND expires>?").bind(time, token, expires, owner, op.id, time)];
    // Recheck the whole owner target set and every selected row in the same
    // transaction as the fence; preflight alone is not a concurrency boundary.
    commands.push(db().prepare("SELECT CASE WHEN (SELECT json_group_array(id) FROM (SELECT id FROM articles WHERE owner=? UNION SELECT id FROM article_deletions WHERE owner=? ORDER BY id))=? THEN 1 ELSE json('owner_set_changed') END").bind(owner, owner, JSON.stringify(targets.map(t => t.id))));
    if (targets[0].include_dedao_articles === true) {
      const pairs = targets.flatMap(t => t.dedao_pairs || []), batchIds = strings(pairs.map(p => p.batch_id));
      commands.push(db().prepare(`SELECT CASE WHEN (SELECT count(*) FROM dedao_batches WHERE owner=? AND ${contains('id')})=? THEN 1 ELSE json('dedao_batch_owner_changed') END`).bind(owner, JSON.stringify(batchIds), batchIds.length));
      commands.push(db().prepare('SELECT CASE WHEN (SELECT count(*) FROM dedao_items WHERE json_array(batch_id,ordinal) IN (SELECT value FROM json_each(?)))=? THEN 1 ELSE json(\'dedao_pair_changed\') END').bind(JSON.stringify(pairs.map(p => [p.batch_id, p.ordinal])), fresh.selected.dedao_items.length));
    }
    for (const selector of targets[0].selectors || []) {
      const rows = fresh.selected[selector.table], columns = Object.keys(rows[0] || {});
      commands.push(db().prepare(`SELECT CASE WHEN (SELECT count(*) FROM ${selector.table} WHERE ${rowOwner(selector.table)} AND (${selector.where}))=? THEN 1 ELSE json('source_graph_changed') END`).bind(owner, ...selector.values, rows.length));
      // Partition real full-column comparisons below D1's value-size limit.
      // The count fence above also rejects a concurrently inserted new UUID.
      let part: Row[] = [], bytes = 0;
      const partitions: Row[][] = [];
      for (const row of rows) {
        const size = new TextEncoder().encode(JSON.stringify(columns.map(c => row[c]))).length;
        if (part.length && bytes + size > 512_000) { partitions.push(part); part = []; bytes = 0; }
        part.push(row); bytes += size;
      }
      if (part.length) partitions.push(part);
      for (const partition of partitions) {
        const keys = specs[selector.table].keys;
        if (partition.length === 1 && new TextEncoder().encode(JSON.stringify(columns.map(c => partition[0][c]))).length > 1_000_000) {
          // A large JSON row may repeat several body copies. Compare each actual
          // column directly, with a shallow expression and no aggregate value.
          for (const column of columns) commands.push(db().prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM ${selector.table} WHERE ${rowOwner(selector.table)} AND json_array(${keys.join(',')})=? AND ${column} IS ?) THEN 1 ELSE json('source_row_changed') END`).bind(owner, JSON.stringify(keys.map(k => partition[0][k])), partition[0][column]));
        } else commands.push(db().prepare(`SELECT CASE WHEN (SELECT json_group_array(json_array(${columns.join(',')})) FROM (SELECT * FROM ${selector.table} WHERE ${rowOwner(selector.table)} AND json_array(${keys.join(',')}) IN (SELECT value FROM json_each(?)) ORDER BY rowid))=? THEN 1 ELSE json('source_row_changed') END`).bind(owner, JSON.stringify(partition.map(row => keys.map(k => row[k]))), JSON.stringify(partition.map(row => columns.map(c => row[c])))));
      }
    }
    for (const target of targets) {
      const row = fresh.articles.find(a => a.id === target.id), mark = fresh.tombs.find(t => t.id === target.id);
      if (mark?.lock_token && (!mark.lock_expires || String(mark.lock_expires) > time)) throw new ArticleDeletionError('另一个删除执行者仍持有处理权，请回读该操作', 409);
      if (row) {
        const columns = Object.keys(row);
        const rowJson = JSON.stringify(columns.map(c => row[c])), largeRow = new TextEncoder().encode(rowJson).length > 1_000_000;
        if (largeRow) for (const column of columns) commands.push(db().prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND ${column} IS ?) THEN 1 ELSE json('article_changed') END`).bind(owner, target.id, row[column]));
        if (mark) {
          if (row.state !== 'deleting' || row.claim_token != null || row.claim_expires != null) throw new ArticleDeletionError('既有永久删除标记与文章状态不一致，请回读原删除操作', 409);
          if (!largeRow) commands.push(db().prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND json_array(${columns.join(',')})=?) THEN 1 ELSE json('article_changed') END`).bind(owner, target.id, rowJson));
        } else commands.push(db().prepare(`UPDATE articles SET state='deleting',claim_token=NULL,claim_expires=NULL WHERE owner=? AND id=?${largeRow ? '' : ` AND json_array(${columns.join(',')})=?`} AND ${opGuard()}`).bind(owner, target.id, ...(!largeRow ? [rowJson] : []), owner, op.id, token, time));
        commands.push(db().prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM articles WHERE owner=? AND id=? AND state='deleting' AND claim_token IS NULL AND claim_expires IS NULL) THEN 1 ELSE json('article_changed') END").bind(owner, target.id));
        if (!mark) commands.push(db().prepare(`UPDATE word_recovery SET desired='cancelled',version=version+1,epoch=epoch+1,token_hash=NULL,lease_until=NULL,status='blocked',reason='content_deleted',updated=? WHERE owner=? AND target_kind='article' AND target_id=? AND ${opGuard()}`).bind(time, owner, target.id, owner, op.id, token, time));
      }
      if (mark) {
        const columns = Object.keys(mark);
        commands.push(db().prepare(`UPDATE article_deletions SET state='deleting',operation_id=?,lock_token=?,lock_expires=? WHERE owner=? AND id=? AND json_array(${columns.join(',')})=? AND ${opGuard()}`).bind(op.id, token, expires, owner, target.id, JSON.stringify(columns.map(c => mark[c])), owner, op.id, token, time));
      } else commands.push(db().prepare(`INSERT INTO article_deletions(id,owner,state,started_at,operation_id,lock_token,lock_expires) SELECT ?,?,'deleting',?,?,?,? WHERE ${opGuard()}`).bind(target.id, owner, time, op.id, token, expires, owner, op.id, token, time));
    }
    commands.push(db().prepare("SELECT CASE WHEN (SELECT count(*) FROM article_deletions WHERE owner=? AND operation_id=? AND lock_token=? AND state='deleting')=? THEN 1 ELSE json('fence_changed') END").bind(owner, op.id, token, targets.length));
    for (const block of targets[0].safety || []) commands.push(db().prepare(`INSERT OR IGNORE INTO article_purge_serial_blocks(owner,article_id,operation_id,reason,claim_sha256,execution_sha256,input_sha256,grant_request_key,token_sha256,epoch,acquisition_request_key,holder_mode,created) SELECT ?,?,?,'external_end_unconfirmed',?,?,?,?,?,?,?,?,? WHERE ${opGuard()} AND ${markGuard()}`)
      .bind(owner, block.article_id, op.id, block.claim_sha256, block.execution_sha256, block.input_sha256, block.grant_request_key, block.token_sha256, block.epoch, block.acquisition_request_key, block.holder_mode, time, owner, op.id, token, time, owner, block.article_id, op.id, token, time));
    commands.push(db().prepare(`INSERT OR IGNORE INTO article_content_fences(owner,entity_kind,entity_key,article_id,operation_id,created)
      SELECT ?,json_extract(j.value,'$.entity_kind'),json_extract(j.value,'$.entity_key'),json_extract(j.value,'$.article_id'),?,? FROM json_each(?) j WHERE ${opGuard()}
      AND EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=? AND x.id=json_extract(j.value,'$.article_id') AND x.operation_id=? AND x.lock_token=? AND x.lock_expires>?)`)
      .bind(owner, op.id, time, JSON.stringify(targets[0].fences || []), owner, op.id, token, time, owner, op.id, token, time));
    try { await db().batch(commands); } catch {
      // A lost batch response may follow a real commit. Read our exact lease;
      // never claim rollback or start another operation on that uncertainty.
      const actual = await operation(owner, op.id);
      if (actual.state === 'deleting' && actual.lock_token === token) {
        await release(owner, op.id, token);
        throw new ArticleDeletionError('删除确认已保存，返回中断；请回读并续接原操作', 503);
      }
      throw new ArticleDeletionError('文章或关联记录在确认期间改变，未执行文件删除，请重新预览', 409);
    }
  } else if (op.state === 'deleting') {
    const commands = [
      db().prepare("UPDATE article_list_deletions SET lock_token=?,lock_expires=? WHERE owner=? AND id=? AND state='deleting' AND (lock_token IS NULL OR lock_expires<=?)").bind(token, expires, owner, op.id, time),
      db().prepare(`UPDATE article_deletions SET lock_token=?,lock_expires=? WHERE owner=? AND operation_id=? AND ${opGuard()}`).bind(token, expires, owner, op.id, owner, op.id, token, time),
    ];
    await db().batch(commands);
  } else throw new ArticleDeletionError('原操作状态不支持继续删除', 409);
  if ((await operation(owner, op.id)).lock_token !== token) return readArticleContentDeletion(owner, op.id);
  try {
    await assertDedaoBindings(owner, targets);
    const marks = await ownedRows('article_deletions', owner);
    let handled = 0, deletedFiles = 0;
    for (const target of targets) {
      const mark = marks.find(m => m.id === target.id);
      if (mark?.operation_id !== op.id) throw new ArticleDeletionError('永久删除标记不一致，已暂停', 503);
      // Previously completed targets still get real prefix reconciliation.
      const objects = await targetObjects(target, targets[0].include_dedao_articles === true);
      if (mark.state === 'deleted' && !objects.length) continue;
      if (handled++ >= 8) break;
      await renew(owner, op.id, token);
      for (const object of objects) {
        if (deletedFiles >= 128) break;
        if (deletedFiles > 0 && deletedFiles % 32 === 0) await renew(owner, op.id, token);
        await bucket().delete(object.key); deletedFiles++;
      }
      if (deletedFiles >= 128 && (await targetObjects(target, targets[0].include_dedao_articles === true)).length) break;
      if ((await targetObjects(target, targets[0].include_dedao_articles === true)).length) throw new ArticleDeletionError('文件残留尚未归零，请续接原操作', 503);
      const guardBindings = [owner, target.id, op.id, token, now()];
      const commands: D1PreparedStatement[] = [], byTable = new Map<string, Ref[]>();
      for (const ref of (targets[0].graph || []).filter(r => r.article_id === target.id)) {
        byTable.set(ref.table, [...(byTable.get(ref.table) || []), ref]);
      }
      // The event DELETE guard requires the main article already absent and the
      // tombstone deleted, while the operation still holds its live lock.
      // Delete an outline parent and its revision children in one statement,
      // after their stage rows, so immediate foreign keys remain valid.
      const tables = [...byTable.keys()].filter(t => t !== 'word_progress_events').sort((a, b) => (a === 'outline_flows' ? 1 : 0) - (b === 'outline_flows' ? 1 : 0));
      for (const table of tables) {
        const refs = byTable.get(table)!, spec = specs[table];
        commands.push(db().prepare(`${spec.scrub ? `UPDATE ${table} SET ${spec.scrub}` : `DELETE FROM ${table}`} WHERE ${rowOwner(table)} AND json_array(${spec.keys.join(',')}) IN (SELECT value FROM json_each(?))${spec.clean ? ` AND NOT (${spec.clean})` : ''} AND ${markGuard()} AND ${opGuard()}`)
          .bind(owner, JSON.stringify(refs.map(ref => ref.values)), ...guardBindings, owner, op.id, token, now()));
      }
      commands.push(db().prepare(`UPDATE article_deletions SET state='deleted',deleted_at=?,object_count=? WHERE owner=? AND id=? AND operation_id=? AND lock_token=? AND lock_expires>? AND ${opGuard()}`).bind(now(), target.file_count, owner, target.id, op.id, token, now(), owner, op.id, token, now()));
      commands.push(db().prepare(`DELETE FROM articles WHERE owner=? AND id=? AND state='deleting' AND ${markGuard()} AND ${opGuard()}`).bind(owner, target.id, ...guardBindings, owner, op.id, token, now()));
      const delayed = byTable.get('word_progress_events');
      if (delayed?.length) commands.push(db().prepare(`DELETE FROM word_progress_events WHERE owner=? AND json_array(${specs.word_progress_events.keys.join(',')}) IN (SELECT value FROM json_each(?)) AND ${markGuard()} AND ${opGuard()}`).bind(owner, JSON.stringify(delayed.map(ref => ref.values)), ...guardBindings, owner, op.id, token, now()));
      await db().batch(commands);
    }
    const remaining = await remainingRows(owner, targets);
    let objectCount = 0;
    for (const target of targets) objectCount += (await targetObjects(target, targets[0].include_dedao_articles === true)).length;
    if (remaining === 0 && objectCount === 0) await db().prepare(`UPDATE article_list_deletions SET state='deleted',deleted_at=? WHERE owner=? AND id=? AND lock_token=? AND lock_expires>? AND NOT EXISTS(SELECT 1 FROM article_deletions WHERE owner=? AND operation_id=? AND state<>'deleted')`).bind(now(), owner, op.id, token, now(), owner, op.id).run();
  } catch (error) {
    if (error instanceof ArticleDeletionError) throw error;
    throw new ArticleDeletionError('永久删除在文件或记录处理时中断；请回读并续接同一个已确认操作', 503);
  } finally { await release(owner, op.id, token); }
  return readArticleContentDeletion(owner, op.id);
}

type PurgeBlock = Row & Safety & { owner: string; operation_id: string; created: string };
async function purgeBlock(owner: string, articleId: string) {
  if (!validId(articleId)) throw new ArticleDeletionError('文章编号无效', 400);
  return db().prepare('SELECT * FROM article_purge_serial_blocks WHERE owner=? AND article_id=?').bind(owner, articleId).first<PurgeBlock>();
}
export async function readArticlePurgeExecutorEnd(owner: string, articleId: string) {
  const block = await purgeBlock(owner, articleId);
  if (!block) return { article_id: articleId, owner, safety_block_present: false, serial_safety_block_resolved: true, server_verified: false, external_stop_confirmed: false };
  const end = await db().prepare(`SELECT e.request_key,e.created,e.evidence_kind FROM article_purge_executor_ends e JOIN article_purge_serial_blocks b ON ${endMatchesBlock()} WHERE b.owner=? AND b.article_id=? AND e.all_actions_stopped=1 AND e.all_actions_settled=1 AND e.server_verified=0 ORDER BY e.created,e.request_key LIMIT 1`).bind(owner, articleId).first<{ request_key: string; created: string; evidence_kind: string }>();
  return { article_id: articleId, owner, operation_id: block.operation_id, safety_block_present: true, holder_mode: block.holder_mode,
    serial_safety_block_resolved: !!end, end_request_key: end?.request_key || null, end_recorded_at: end?.created || null,
    settlement_possible: block.holder_mode !== 'unknown', requires_original_holder: !end, input_sha256: block.input_sha256,
    grant_request_key: block.grant_request_key, original_acquisition_request_key: block.acquisition_request_key, epoch: block.epoch,
    evidence_kind: end?.evidence_kind || null, server_verified: false, external_stop_confirmed: false,
    reason: end ? end.evidence_kind === 'owner_observed_codex_terminal' ? '已保存本人核验的精确原领取、执行终态及动作结清工具观察；服务器未独立认证外部进程终态' : '原持有者凭据和领取映射已核对并保存全部动作结束回执；服务器未独立验证外部进程终态' : block.holder_mode === 'unknown' ? '缺少可信原执行映射，不能通过时间、owner声明或新凭据解除串行保护' : '需原持有者实际结清，或经支持协议核验精确原领取映射和真实终态；不会重新领取任务' };
}
export type SettleArticlePurgeExecutor = {
  article_id: string; operation_id: string; request_key: string; claim_token: string; input_sha256: string; execution_id: string;
  execution_token?: string; epoch?: number; grant_request_key?: string; original_acquisition_request_key?: string;
  evidence_kind?: 'holder_acknowledgement'; confirm_all_actions_stopped: boolean; confirm_all_actions_settled: boolean;
  end_reference: string; settled_reference: string;
};
export async function settleArticlePurgeExecutor(owner: string, args: SettleArticlePurgeExecutor) {
  const allowed = ['article_id', 'operation_id', 'request_key', 'claim_token', 'input_sha256', 'execution_id', 'execution_token', 'epoch', 'grant_request_key', 'original_acquisition_request_key', 'evidence_kind', 'confirm_all_actions_stopped', 'confirm_all_actions_settled', 'end_reference', 'settled_reference'];
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !allowed.includes(k))
    || ![args.article_id, args.operation_id, args.request_key, args.claim_token, args.execution_id].every(validId) || !/^[a-f0-9]{64}$/.test(args.input_sha256)
    || args.confirm_all_actions_stopped !== true || args.confirm_all_actions_settled !== true || (args.evidence_kind != null && args.evidence_kind !== 'holder_acknowledgement')) throw new ArticleDeletionError('必须提供原执行身份及真实全部动作停止、结清确认', 400);
  for (const reference of [args.end_reference, args.settled_reference]) if (typeof reference !== 'string' || !reference.trim() || reference.length > 240 || /[\x00-\x1f\x7f]/.test(reference)) throw new ArticleDeletionError('需要简短的真实结束与动作结清回执引用', 400);
  const block = await purgeBlock(owner, args.article_id);
  if (!block || block.operation_id !== args.operation_id) throw new ArticleDeletionError('没有找到本人原删除操作的执行保护记录', 404);
  if (block.holder_mode === 'unknown' || block.claim_sha256 == null || block.input_sha256 == null) throw new ArticleDeletionError('缺少可信原领取或执行映射，不能解除串行保护', 409);
  const claim = await shaText(args.claim_token), execution = await shaText(args.execution_id);
  if (claim !== block.claim_sha256 || args.input_sha256 !== block.input_sha256 || (args.original_acquisition_request_key ?? null) !== block.acquisition_request_key) throw new ArticleDeletionError('原持有者凭据、冻结输入或领取映射不匹配', 409);
  if (block.holder_mode === 'mapped_executor') {
    if (!validId(args.execution_token) || !Number.isSafeInteger(args.epoch) || !validId(args.grant_request_key)
      || await shaText(args.execution_token) !== block.token_sha256 || args.epoch !== block.epoch || args.grant_request_key !== block.grant_request_key || execution !== block.execution_sha256) throw new ArticleDeletionError('必须匹配原Word token、epoch、grant和执行身份', 409);
  } else if (block.holder_mode === 'manual_help') {
    if (!validId(args.original_acquisition_request_key) || block.execution_sha256 != null || block.token_sha256 != null || block.epoch != null || block.grant_request_key != null
      || args.execution_token != null || args.epoch != null || args.grant_request_key != null) throw new ArticleDeletionError('本记录只接受原人工队列领取者确认，不能补造Word grant映射', 409);
  } else throw new ArticleDeletionError('执行保护身份不可核验', 409);
  const endHash = await shaText(args.end_reference), settledHash = await shaText(args.settled_reference);
  const payload = await hash({ owner, article_id: block.article_id, operation_id: block.operation_id, request_key: args.request_key,
    claim_sha256: claim, execution_sha256: block.execution_sha256, observed_execution_sha256: execution, input_sha256: args.input_sha256,
    grant_request_key: block.grant_request_key, token_sha256: block.token_sha256, epoch: block.epoch, acquisition_request_key: block.acquisition_request_key,
    holder_mode: block.holder_mode, evidence_kind: 'holder_acknowledgement', end_reference_sha256: endHash, settled_reference_sha256: settledHash, all_actions_stopped: 1, all_actions_settled: 1, server_verified: 0 });
  const prior = await db().prepare('SELECT payload_sha256 FROM article_purge_executor_ends WHERE owner=? AND request_key=?').bind(owner, args.request_key).first<{ payload_sha256: string }>();
  if (prior && prior.payload_sha256 !== payload) throw new ArticleDeletionError('结束回执请求键已绑定不同执行或证据', 409);
  if (!prior) {
    const fields = ['owner', 'article_id', 'operation_id', 'claim_sha256', 'execution_sha256', 'input_sha256', 'grant_request_key', 'token_sha256', 'epoch', 'acquisition_request_key', 'holder_mode'];
    await db().prepare(`INSERT OR IGNORE INTO article_purge_executor_ends(owner,article_id,operation_id,request_key,payload_sha256,claim_sha256,execution_sha256,input_sha256,grant_request_key,token_sha256,epoch,acquisition_request_key,holder_mode,observed_execution_sha256,evidence_kind,end_reference_sha256,settled_reference_sha256,all_actions_stopped,all_actions_settled,server_verified,created)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'holder_acknowledgement',?,?,1,1,0,? WHERE EXISTS(SELECT 1 FROM article_purge_serial_blocks WHERE ${fields.map(k => `${k} IS ?`).join(' AND ')})`)
      .bind(owner, block.article_id, block.operation_id, args.request_key, payload, block.claim_sha256, block.execution_sha256, block.input_sha256, block.grant_request_key, block.token_sha256, block.epoch, block.acquisition_request_key, block.holder_mode, execution, endHash, settledHash, now(), ...fields.map(k => block[k])).run();
  }
  const saved = await db().prepare('SELECT payload_sha256 FROM article_purge_executor_ends WHERE owner=? AND request_key=?').bind(owner, args.request_key).first<{ payload_sha256: string }>();
  if (saved?.payload_sha256 !== payload) throw new ArticleDeletionError('结束回执尚未独立读回，请用原请求键核验', 503);
  return { ...await readArticlePurgeExecutorEnd(owner, args.article_id), end_recorded: true, duplicate: !!prior, all_actions_stopped: true, all_actions_settled: true };
}
