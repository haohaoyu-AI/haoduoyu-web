import { db } from './test-store';
import { bucket } from './articles';
import { ArticleDeletionError, assertStoredKeysAreArticleScoped, listArticleObjects, renewDeletionLock } from './article-deletion';
import { listScopeSql, protectedArticleSql, visibleArticleSql, writingReceiptSql, type ArticleListScope } from './article-list-policy';

type Row = Record<string, string | number | null> & {
  id:string; run_kind:string; writer:string; snapshot:string; artifact_manifest:string|null;
  revision_flow_id:string|null; provider_attempt_id:string|null; receipt_id:string|null;
};
type FileIdentity = { key: string; size: number; etag: string | null };
type Target = { id: string; fingerprint: string; files: FileIdentity[]; file_count: number; bytes: number };
type Operation = { id: string; owner: string; scope: ArticleListScope; state: string; snapshot_json: string; snapshot_sha256: string; expires: string; lock_token: string | null };
// Kept separate because operation keys are normal UUIDs, unlike synthetic fixture labels.
const validId = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(x);
const instant = () => new Date().toISOString();
const expiry = () => new Date(Date.now() + 30 * 60_000).toISOString();
async function hash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
const inIds = (ids: string[]) => ids.length ? ids.map(() => '?').join(',') : 'NULL';
async function rows(table: string, owner: string, where: string, values: unknown[] = []) {
  return (await db().prepare(`SELECT * FROM ${table} WHERE owner=? AND (${where}) ORDER BY rowid`).bind(owner, ...values).all<Row>()).results;
}

// Explicit lineage only. Shared author batches, hot-source research and local desktop
// jobs are outside this graph. Quota identities are kept, content-bearing fields scrubbed.
async function graph(owner: string, id: string) {
  const g: Record<string, Row[]> = {};
  for (const table of ['writing_runs', 'daily_editorial_drafts', 'outline_flows', 'editorial_flows', 'editorial_runs_v3',
    'article_deliveries', 'article_upload_attempts', 'article_upload_executor_ends', 'article_handoffs', 'article_output_restarts', 'article_upload_diagnostics']) {
    g[table] = await rows(table, owner, 'article_id=?', [id]);
  }
  const flowIds = g.editorial_flows.map(r => r.id);
  const outlineIds = g.outline_flows.map(r => r.id);
  const v3Ids = g.editorial_runs_v3.map(r => r.id);
  const original = await articleRow(owner,id);
  const manifest = original?.artifact_manifest ? JSON.parse(original.artifact_manifest) : null;
  const revisionIds = [...g.daily_editorial_drafts.map(r => r.revision_flow_id), manifest?.text_revision?.flow_id].filter((value):value is string=>typeof value==='string'&&value.length>0);
  g.manual_writing_batches = await rows('manual_writing_batches', owner,
    `id IN (${inIds(revisionIds)}) OR (json_valid(snapshot) AND json_extract(snapshot,'$.daily_source.article_id')=?)`, [...revisionIds, id]);
  for (const b of g.manual_writing_batches) {
    const revisions = await rows('writing_runs', owner, 'substr(run_kind,1,51)=?', [`text_revision:${b.id}:`]);
    const snapshot=JSON.parse(b.snapshot);
    if(snapshot.namespace_version===1 && snapshot.run_id && snapshot.writer) revisions.push(...await rows('writing_runs',owner,'run_kind=? AND writer=?',[`stepwise_text:${snapshot.run_id}`,snapshot.writer]));
    g.writing_runs.push(...revisions.filter(r => !g.writing_runs.some(old => old.id === r.id)));
  }
  for (const [table, ids] of [['outline_flow_stages', outlineIds], ['editorial_stages', flowIds], ['editorial_stages_v3', v3Ids],
    ['editorial_body_continuations_v3', v3Ids], ['editorial_cloud_delegations_v3', v3Ids],
    ['editorial_revision_cloud_delegations_v3', v3Ids], ['editorial_revision_continuations_v3', v3Ids],
    ['editorial_failed_writer_continuations_v3', v3Ids], ['editorial_failed_writer_cloud_delegations_v3', v3Ids],
    ['editorial_agent_claim_recoveries_v3', v3Ids], ['editorial_daily_cloud_delegations_v3', v3Ids]] as Array<[string, string[]]>) {
    g[table] = await rows(table, owner, `run_id IN (${inIds(ids)})`, ids);
  }
  g.editorial_requests = await rows('editorial_requests', owner, `flow_id IN (${inIds(flowIds)})`, flowIds);
  const requestIds = g.editorial_requests.map(r => r.id);
  g.editorial_request_outbox = await rows('editorial_request_outbox', owner, `request_id IN (${inIds(requestIds)})`, requestIds);
  const receiptIds = [
    ...g.daily_editorial_drafts.map(r => r.provider_attempt_id),
    ...g.editorial_stages.map(r => r.receipt_id), ...g.editorial_stages_v3.map(r => r.receipt_id),
    ...g.manual_writing_batches.flatMap(r => {const b=JSON.parse(r.snapshot);return [`text_revision:${owner}:${r.id}`, ...(b.namespace_version===1 && b.run_id && b.writer ? [`stepwise_text:${owner}:${b.run_id}:${b.writer}`]:[])];}),
    ...g.writing_runs.filter(r => r.writer === 'claude' && r.run_kind.startsWith('manual:')).map(r => `manual:${owner}:${r.run_kind.slice(7)}:claude`),
  ].filter((value):value is string=>typeof value==='string'&&value.length>0);
  g.claude_attempts = await rows('claude_attempts', owner, `id IN (${inIds(receiptIds)})
    OR EXISTS(SELECT 1 FROM writing_runs w WHERE w.owner=claude_attempts.owner AND w.article_id=? AND ${writingReceiptSql('claude_attempts')}) OR
    (json_valid(response) AND (json_extract(response,'$.snapshot.article_id')=? OR json_extract(response,'$.article_id')=?
      OR json_extract(response,'$.stage_id') IN (${inIds([...g.editorial_stages_v3, ...g.editorial_stages].map(r => r.id))})))`,
    [...receiptIds, id, id, id, ...[...g.editorial_stages_v3, ...g.editorial_stages].map(r => r.id)]);
  g.workflow_controls=await rows('workflow_controls',owner,`(scope='outline_flow' AND run_id IN (${inIds(outlineIds)})) OR (scope='editorial_v2' AND run_id IN (${inIds(flowIds)})) OR (scope='editorial_v3' AND run_id IN (${inIds(v3Ids)}))`,[...outlineIds,...flowIds,...v3Ids]);
  return g;
}
async function articleRow(owner: string, id: string) {
  return await db().prepare('SELECT * FROM articles WHERE owner=? AND id=?').bind(owner, id).first<Row>();
}
async function fingerprint(row: Row, lineage: Record<string, Row[]>) { return hash({row, lineage}); }
async function files(id: string) {
  const out: FileIdentity[] = [];
  for (const object of await listArticleObjects(id)) {
    const head = await bucket().head(object.key);
    if (!head || head.size !== object.size) throw new ArticleDeletionError('文件清单正在变化，请重新预览', 409);
    out.push({key: object.key, size: head.size, etag: head.etag || null});
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
export async function readListDeletion(owner: string, operationId: string) {
  if (!validId(operationId)) throw new ArticleDeletionError('操作编号无效', 400);
  const op = await db().prepare('SELECT * FROM article_list_deletions WHERE owner=? AND id=?').bind(owner, operationId).first<Operation>();
  if (!op) throw new ArticleDeletionError('操作不存在或无权访问', 404);
  const targets: Target[] = JSON.parse(op.snapshot_json);
  const items = [];
  let remainingObjects=0;
  for (const target of targets) {
    const row = await articleRow(owner, target.id);
    const tombstone = await db().prepare('SELECT state,operation_id FROM article_deletions WHERE owner=? AND id=?').bind(owner, target.id).first<Row>();
    if(op.state==='deleted')remainingObjects+=(await listArticleObjects(target.id)).length;
    items.push({article_id: target.id, title: row?.title || '内容已删除', state: tombstone?.operation_id === op.id ? tombstone.state : op.state === 'previewed' ? 'previewed' : 'changed',
      file_count: target.file_count, bytes: target.bytes, files: target.files});
  }
  return {operation_id: op.id, owner: op.owner, scope: op.scope, state: remainingObjects?'needs_verification':op.state, remaining_object_count:remainingObjects, snapshot_sha256: op.snapshot_sha256,
    expires: op.expires, count: targets.length, file_count: targets.reduce((sum, t) => sum + t.file_count, 0),
    bytes: targets.reduce((sum, t) => sum + t.bytes, 0), items, permanent: true,
    content_deleted: op.state === 'deleted' && remainingObjects===0, retained_metadata: '删除完成后仅保留操作编号、owner、范围、文章ID、指纹、文件身份、数量和时间，用于防重放、核对原快照残留及配额去重；不保留原正文。',
    file_scope: '本站原文、正文、最终配图Word和该文章所属的临时图文文件。平台私人草稿、电脑和Library附件不在范围内。'};
}
export async function previewListDeletion(owner: string, scope: ArticleListScope, requestKey: string, expectedIds: string[]) {
  if (!['publish', 'writing'].includes(scope) || !validId(requestKey) || !Array.isArray(expectedIds) || expectedIds.length > 5 || !expectedIds.every(validId)
    || new Set(expectedIds).size !== expectedIds.length) throw new ArticleDeletionError('清空范围无效', 400);
  const prior = await db().prepare('SELECT id FROM article_list_deletions WHERE owner=? AND request_key=?').bind(owner, requestKey).first<{id:string}>();
  if (prior) return readListDeletion(owner, prior.id);
  const candidates = (await db().prepare(`SELECT * FROM articles WHERE owner=? AND ${listScopeSql(scope)} AND ${visibleArticleSql()}
    AND NOT ${protectedArticleSql()} ORDER BY created DESC,id DESC LIMIT 5`).bind(owner).all<Row>()).results;
  const ids = candidates.map(r => r.id);
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...expectedIds].sort())) throw new ArticleDeletionError('列表已变化，请刷新后重新预览', 409);
  if (!ids.length) throw new ArticleDeletionError('此列表没有可清空的最近文章', 409);
  const targets: Target[] = [];
  for (const row of candidates) {
    assertStoredKeysAreArticleScoped(row as Row & Parameters<typeof assertStoredKeysAreArticleScoped>[0], row.id);
    const lineage = await graph(owner, row.id);
    if (lineage.claude_attempts.some(r => r.state === 'requested')) throw new ArticleDeletionError('仍有模型执行待确认，文章已保护', 409);
    const objects = await files(row.id);
    targets.push({id: row.id, fingerprint: await fingerprint(row, lineage), files: objects, file_count: objects.length, bytes: objects.reduce((n, f) => n + f.size, 0)});
  }
  const id = crypto.randomUUID(), digest = await hash(targets);
  await db().prepare(`INSERT OR IGNORE INTO article_list_deletions(id,owner,scope,request_key,state,snapshot_json,snapshot_sha256,created,expires)
    VALUES(?,?,?,?,'previewed',?,?,?,?)`).bind(id, owner, scope, requestKey, JSON.stringify(targets), digest, instant(), expiry()).run();
  const saved = await db().prepare('SELECT id FROM article_list_deletions WHERE owner=? AND request_key=?').bind(owner, requestKey).first<{id:string}>();
  return readListDeletion(owner, saved!.id);
}

export async function cancelListDeletion(owner: string, id: string) {
  const view=await readListDeletion(owner,id);
  if(view.state==='cancelled')return view;
  const change=await db().prepare("UPDATE article_list_deletions SET state='cancelled',snapshot_json=? WHERE owner=? AND id=? AND state='previewed' AND confirmed_at IS NULL")
    .bind(JSON.stringify(view.items.map(item=>({id:item.article_id,files:[],file_count:item.files.length,bytes:item.files.reduce((sum,file)=>sum+file.size,0)}))),owner,id).run();
  if(!change.meta.changes)throw new ArticleDeletionError('原操作已经确认，必须回读并继续原操作，不能取消或扩大范围',409);
  return readListDeletion(owner,id);
}

type Confirm = {operation_id: string; confirm_owner: string; confirm_scope: ArticleListScope; confirm_ids: string[]; snapshot_sha256: string; confirm_permanent: boolean};
export async function confirmListDeletion(owner: string, args: Confirm) {
  const view = await readListDeletion(owner, args.operation_id);
  if (args.confirm_permanent !== true || args.confirm_owner !== owner || args.confirm_scope !== view.scope || args.snapshot_sha256 !== view.snapshot_sha256
    || !Array.isArray(args.confirm_ids) || JSON.stringify(args.confirm_ids) !== JSON.stringify(view.items.map(r => r.article_id))) throw new ArticleDeletionError('请明确确认原预览的owner、范围和文章编号快照', 400);
  if (view.state === 'deleted') return view;
  const op = await db().prepare('SELECT * FROM article_list_deletions WHERE owner=? AND id=?').bind(owner, view.operation_id).first<Operation>();
  const targets: Target[] = JSON.parse(op!.snapshot_json);
  if(view.state==='needs_verification' && op!.state==='deleted')return cleanConfirmedResiduals(owner,op!,targets);
  const token = crypto.randomUUID(), time = instant(), until = expiry();
  if (view.state === 'previewed') {
    if (op!.expires <= time) throw new ArticleDeletionError('预览已过期，请刷新后重新预览', 409);
    const articles: Row[] = [];
    for (const t of targets) {
      const row = await articleRow(owner, t.id);
      if (!row || await fingerprint(row, await graph(owner, t.id)) !== t.fingerprint || JSON.stringify(await files(t.id)) !== JSON.stringify(t.files)) {
        throw new ArticleDeletionError('文章或文件状态已变化，请刷新后重新预览', 409);
      }
      articles.push(row);
    }
    // D1 batch is one transaction. Each article and ALL live work are rechecked
    // inside it. A failed target aborts the whole fence before any R2 deletion.
    const statements = [db().prepare(`UPDATE article_list_deletions SET state='deleting',confirmed_at=?,lock_token=?,lock_expires=?
      WHERE owner=? AND id=? AND state='previewed' AND expires>?`).bind(time, token, until, owner, op!.id, time)];
    for (const row of articles) {
      const columns = Object.keys(row);
      statements.push(db().prepare(`UPDATE articles SET state='deleting',claim_token=NULL,claim_expires=NULL
        WHERE owner=? AND id=? AND ${columns.map(c => `${c} IS ?`).join(' AND ')} AND ${listScopeSql(view.scope)} AND ${visibleArticleSql()}
        AND NOT ${protectedArticleSql()} AND EXISTS(SELECT 1 FROM article_list_deletions o WHERE o.owner=articles.owner AND o.id=? AND o.lock_token=?)`)
        .bind(owner, row.id, ...columns.map(c => row[c]), op!.id, token));
      statements.push(db().prepare(`INSERT OR IGNORE INTO article_deletions(id,owner,state,started_at,lock_token,lock_expires,operation_id)
        SELECT id,owner,'deleting',?,?,?,? FROM articles WHERE id=? AND owner=? AND state='deleting'
        AND EXISTS(SELECT 1 FROM article_list_deletions o WHERE o.id=? AND o.owner=articles.owner AND o.lock_token=?)`)
        .bind(time, token, until, op!.id, row.id, owner, op!.id, token));
    }
    statements.push(db().prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM article_list_deletions WHERE owner=? AND id=? AND lock_token=?)
      OR (SELECT count(*) FROM article_deletions WHERE owner=? AND operation_id=? AND lock_token=? AND state='deleting')=?
      THEN 1 ELSE json('snapshot_changed') END AS fence`).bind(owner, op!.id, token, owner, op!.id, token, targets.length));
    try { await db().batch(statements); } catch { throw new ArticleDeletionError('文章进入处理或状态已变化，未执行删除，请重新预览', 409); }
  } else if (view.state === 'deleting') {
    const changed = await db().prepare(`UPDATE article_list_deletions SET lock_token=?,lock_expires=? WHERE owner=? AND id=? AND state='deleting'
      AND (lock_token IS NULL OR lock_expires<=?)`).bind(token, until, owner, op!.id, time).run();
    if (!changed.meta.changes) return readListDeletion(owner, op!.id);
    await db().prepare(`UPDATE article_deletions SET lock_token=?,lock_expires=? WHERE owner=? AND operation_id=? AND state='deleting'`).bind(token, until, owner, op!.id).run();
  } else throw new ArticleDeletionError('操作状态待核验，请回读原操作', 409);
  const held = await db().prepare('SELECT lock_token FROM article_list_deletions WHERE owner=? AND id=?').bind(owner, op!.id).first<{lock_token:string}>();
  if (held?.lock_token !== token) return readListDeletion(owner, op!.id);
  try {
    for (const target of targets) {
      const mark = await db().prepare('SELECT state,operation_id FROM article_deletions WHERE owner=? AND id=?').bind(owner, target.id).first<Row>();
      if (mark?.operation_id !== op!.id) throw new ArticleDeletionError('文章删除保护不一致，已暂停', 503);
      if (mark.state === 'deleted') continue;
      await renewOperation(owner, op!.id, token);
      await renewDeletionLock(owner, target.id, token);
      const remaining = await files(target.id);
      for (const f of remaining) if (!target.files.some(old => old.key === f.key && old.size === f.size && old.etag === f.etag)) throw new ArticleDeletionError('文件清单超出原快照，已暂停；不会扩大删除范围', 503);
      for (const f of remaining) { await renewOperation(owner, op!.id, token); await renewDeletionLock(owner, target.id, token); await bucket().delete(f.key); }
      if ((await listArticleObjects(target.id)).length) throw new ArticleDeletionError('部分文件未删除，请回读并继续原操作', 503);
      await finishArticle(owner, target.id, op!.id, token, target.file_count);
    }
    // File identities are content-free and must remain bound to this exact
    // confirmation, so late original bytes can be reconciled without new scope.
    const minimal = targets;
    await db().prepare(`UPDATE article_list_deletions SET state='deleted',deleted_at=?,snapshot_json=?,lock_token=NULL,lock_expires=NULL
      WHERE owner=? AND id=? AND lock_token=? AND lock_expires>? AND NOT EXISTS(SELECT 1 FROM article_deletions x WHERE x.owner=? AND x.operation_id=? AND x.state<>'deleted') AND (SELECT count(*) FROM article_deletions x WHERE x.owner=? AND x.operation_id=? AND x.state='deleted')=?`)
      .bind(instant(), JSON.stringify(minimal), owner, op!.id, token, instant(), owner, op!.id, owner, op!.id, targets.length).run();
    const final = await readListDeletion(owner, op!.id);
    if (!final.content_deleted) throw new ArticleDeletionError('最终结果待核验，请回读原操作', 503);
    return final;
  } catch (error) {
    await db().prepare(`UPDATE article_list_deletions SET lock_token=NULL,lock_expires=NULL WHERE owner=? AND id=? AND lock_token=?`).bind(owner, op!.id, token).run();
    await db().prepare(`UPDATE article_deletions SET lock_token=NULL,lock_expires=NULL WHERE owner=? AND operation_id=? AND lock_token=?`).bind(owner, op!.id, token).run();
    throw error;
  }
}
async function renewOperation(owner: string, id: string, token: string) {
  const change = await db().prepare(`UPDATE article_list_deletions SET lock_expires=? WHERE owner=? AND id=? AND state IN ('deleting','deleted') AND lock_token=? AND lock_expires>?`).bind(expiry(), owner, id, token, instant()).run();
  if (!change.meta.changes) throw new ArticleDeletionError('操作处理权已变化，请回读原操作', 409);
}

// Explicit continuation of the same completed confirmation. Never selects
// another article or an object whose identity was absent from the first preview.
async function cleanConfirmedResiduals(owner:string,op:Operation,targets:Target[]) {
  const token=crypto.randomUUID(),time=instant();
  const held=await db().prepare(`UPDATE article_list_deletions SET lock_token=?,lock_expires=? WHERE owner=? AND id=? AND state='deleted' AND (lock_token IS NULL OR lock_expires<=?)`).bind(token,expiry(),owner,op.id,time).run();
  if(!held.meta.changes)return readListDeletion(owner,op.id);
  try {
    const remaining:FileIdentity[]=[];
    for(const target of targets){
      await renewOperation(owner,op.id,token);
      const mark=await db().prepare('SELECT state,operation_id FROM article_deletions WHERE owner=? AND id=?').bind(owner,target.id).first<{state:string;operation_id:string}>();
      if(mark?.state!=='deleted'||mark.operation_id!==op.id||await articleRow(owner,target.id))throw new ArticleDeletionError('原删除状态不一致，已暂停',503);
      for(const file of await files(target.id)){
        if(!target.files.some(old=>old.key===file.key&&old.size===file.size&&old.etag===file.etag))throw new ArticleDeletionError('残留文件不属于原确认快照，已暂停；不会扩大删除范围',503);
        remaining.push(file);
      }
    }
    for(const file of remaining){await renewOperation(owner,op.id,token);await bucket().delete(file.key);}
    const result=await readListDeletion(owner,op.id);
    if(!result.content_deleted)throw new ArticleDeletionError('残留仍待核验，请继续回读原操作',503);
    return result;
  } finally {
    await db().prepare('UPDATE article_list_deletions SET lock_token=NULL,lock_expires=NULL WHERE owner=? AND id=? AND lock_token=?').bind(owner,op.id,token).run();
  }
}

// Exact row IDs captured through the article's schema relationships. No model,
// platform, Library or desktop operations are involved in this content purge.
async function finishArticle(owner: string, id: string, operation: string, token: string, count: number) {
  const g = await graph(owner, id);
  const commands = [];
  const guard = `EXISTS(SELECT 1 FROM article_deletions x WHERE x.id=? AND x.owner=? AND x.operation_id=? AND x.state='deleting' AND x.lock_token=? AND x.lock_expires>?)`;
  const bindings = [id, owner, operation, token, instant()];
  const assignments: Record<string, string> = {
    writing_runs: "state='permanently_deleted',token=NULL,expires=NULL,topic=NULL,sources=NULL,input_snapshot=NULL,error=NULL",
    daily_editorial_drafts: "input_snapshot='{}',initial_json='{}'",
    outline_flows: "snapshot='{}',outline_json=NULL,review_json=NULL,writing_input=NULL",
    editorial_flows: "snapshot='{}'",
    editorial_runs_v3: "input_json='{}',snapshot_json='{}',error=NULL",
    outline_flow_stages: "input_json='{}',token=''",
    editorial_stages: "input_json='{}',artifact_json=NULL,token='',error=NULL",
    editorial_stages_v3: "input_json='{}',artifact_json=NULL,token='',error=NULL",
    claude_attempts: "response='{}'",
    manual_writing_batches: "snapshot='{}'",
    workflow_controls: "state='archived',reason='content_deleted'",
    editorial_requests: "input_json='{}',progress_json='[]',claim_hash=NULL,error=NULL",
  };
  for (const [table, entries] of Object.entries(g)) {
    for (const entry of entries) {
      const primary = Object.hasOwn(entry, 'id') ? 'id' : Object.hasOwn(entry, 'stage_id') ? 'stage_id' : Object.hasOwn(entry, 'run_id') ? 'run_id' : Object.hasOwn(entry, 'attempt_id') ? 'attempt_id' : 'request_id';
      const set = assignments[table];
      commands.push(db().prepare(`${set ? `UPDATE ${table} SET ${set}` : `DELETE FROM ${table}`} WHERE owner=? AND ${primary}=? ${table==='workflow_controls'?'AND scope=?':''} AND ${guard}`).bind(owner, entry[primary], ...(table==='workflow_controls'?[entry.scope]:[]), ...bindings));
    }
  }
  commands.push(db().prepare(`UPDATE article_deletions SET state='deleted',deleted_at=?,object_count=?,lock_token=NULL,lock_expires=NULL
    WHERE id=? AND owner=? AND operation_id=? AND lock_token=? AND lock_expires>?`).bind(instant(), count, id, owner, operation, token, instant()));
  commands.push(db().prepare(`DELETE FROM articles WHERE owner=? AND id=? AND state='deleting' AND EXISTS(
    SELECT 1 FROM article_deletions x WHERE x.id=articles.id AND x.owner=articles.owner AND x.operation_id=? AND x.state='deleted')`).bind(owner, id, operation));
  await db().batch(commands);
  if (await articleRow(owner, id)) throw new ArticleDeletionError('站内记录尚未删除，请回读原操作', 503);
}
