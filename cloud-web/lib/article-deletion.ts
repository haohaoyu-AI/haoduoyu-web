import { db } from './test-store';
import { bucket } from './articles';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const activeArticleStates = ['processing', 'toutiao_saving'];
const MAX_OBJECTS = 1000;
const DELETION_LOCK_MS = 30 * 60 * 1000;

type ArticleRow = {
  id: string;
  owner: string;
  title: string;
  filename: string;
  source_key: string;
  state: string;
  claim_token: string | null;
  claim_expires: string | null;
  result_key: string | null;
  result_meta: string | null;
  artifact_manifest: string | null;
  draft_url: string | null;
  draft_readback: string | null;
};

type DeletionRow = {
  id: string;
  owner: string;
  state: string;
  started_at: string;
  deleted_at: string | null;
  object_count: number | null;
  lock_token: string | null;
  lock_expires: string | null;
  operation_id: string | null;
};

export type DeleteArticleRequest = {
  article_id: string;
  confirm_article_id: string;
  confirm_title: string;
  confirm_permanent: boolean;
};

export class ArticleDeletionError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = 'ArticleDeletionError';
    this.status = status;
  }
}

function validId(id: unknown): id is string {
  return typeof id === 'string' && uuid.test(id);
}

function hasBlockingClaim(row: ArticleRow) {
  // queued is only a notification state. Only a never-claimed queue item can be removed.
  if (row.state === 'queued') return row.claim_token != null || row.claim_expires != null;
  return row.claim_token != null && (typeof row.claim_expires !== 'string'
    || !Number.isFinite(Date.parse(row.claim_expires)) || Date.parse(row.claim_expires) > Date.now());
}

function articlePrefix(id: string) {
  return `articles/${id}/`;
}

export function validArticleObjectKey(id: string, key: string) {
  const base = articlePrefix(id);
  if (!key.startsWith(base)) return false;
  const relative = key.slice(base.length);
  return /^checkpoints\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/[0-9]+-[a-f0-9]{64}$/.test(relative)
    || relative === 'source'
    || /^(?:writing|editorial|editorial-v2|editorial-v3)-[a-f0-9]{64}\.txt$/.test(relative)
    || /^result-[a-f0-9]{64}\.docx$/.test(relative)
    || /^output\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9]+-[a-f0-9]{64}$/.test(relative);
}

async function getArticle(owner: string, id: string) {
  return await db().prepare('SELECT * FROM articles WHERE id=? AND owner=?').bind(id, owner).first() as ArticleRow | null;
}

async function getTombstone(owner: string, id: string) {
  return await db().prepare('SELECT id,owner,state,started_at,deleted_at,object_count,lock_token,lock_expires,operation_id FROM article_deletions WHERE id=? AND owner=?').bind(id, owner).first() as DeletionRow | null;
}

export async function listArticleObjects(id: string) {
  const prefix = articlePrefix(id);
  const result: Array<{ key: string; size?: number }> = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await bucket().list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const item of page.objects) {
      if (typeof item.key !== 'string' || !validArticleObjectKey(id, item.key)) {
        throw new ArticleDeletionError('发现无法确认归属的文件，删除已暂停，需要人工核对', 503);
      }
      if (!seen.has(item.key)) {
        seen.add(item.key);
        result.push({ key: item.key, size: item.size });
        if (result.length > MAX_OBJECTS) throw new ArticleDeletionError('关联文件数量超出安全上限，删除已暂停，需要人工核对', 503);
      }
    }
    if (!page.truncated) break;
    if (!page.cursor || page.cursor === cursor) throw new ArticleDeletionError('文件清单未能完整读取，删除已暂停', 503);
    cursor = page.cursor;
  } while (true);
  return result;
}

export function assertStoredKeysAreArticleScoped(row: ArticleRow, id: string) {
  if (typeof row.source_key !== 'string' || !validArticleObjectKey(id, row.source_key)) {
    throw new ArticleDeletionError('原文文件位置无法确认，删除已暂停，需要人工核对', 503);
  }
  if (row.result_key != null && (typeof row.result_key !== 'string' || !validArticleObjectKey(id, row.result_key))) {
    throw new ArticleDeletionError('成稿文件位置无法确认，删除已暂停，需要人工核对', 503);
  }
  if (row.result_meta != null) {
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(row.result_meta); } catch { throw new ArticleDeletionError('文件清单无法读取，删除已暂停，需要人工核对', 503); }
    const parts = meta.parts;
    if (parts != null) {
      if (!Array.isArray(parts) || parts.length > 400 || typeof meta.output_id !== 'string' || !uuid.test(meta.output_id)) {
        throw new ArticleDeletionError('临时文件清单无法确认，删除已暂停，需要人工核对', 503);
      }
      for (const candidate of parts) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          throw new ArticleDeletionError('临时文件清单无法确认，删除已暂停，需要人工核对', 503);
        }
        const part = candidate as Record<string, unknown>;
        if (typeof part.key !== 'string' || !validArticleObjectKey(id, part.key)
          || !part.key.startsWith(`${articlePrefix(id)}output/${meta.output_id}/`)) {
          throw new ArticleDeletionError('临时文件位置无法确认，删除已暂停，需要人工核对', 503);
        }
      }
    }
  }
}

async function assertOnlyUploadedSourceObject(row: ArticleRow, id: string) {
  const expected = `articles/${id}/source`;
  if (row.source_key !== expected) throw new ArticleDeletionError('本入口只支持人工上传的原始文件，已暂停删除', 409);
  const objects = await listArticleObjects(id);
  if (objects.some(object => object.key !== expected)) {
    throw new ArticleDeletionError('发现成稿或临时处理文件；本入口只支持尚未生成成稿的上传稿', 409);
  }
  return objects;
}

async function beginDeletion(owner: string, id: string, row: ArticleRow): Promise<{ row: ArticleRow; lockToken: string }> {
  const now = new Date().toISOString();
  const lockToken = crypto.randomUUID();
  const lockExpires = new Date(Date.now() + DELETION_LOCK_MS).toISOString();
  const result = await db().batch([
    db().prepare(`UPDATE articles
      SET state='deleting', claim_token=NULL, claim_expires=NULL
      WHERE id=? AND owner=? AND title=? AND state=?
        AND state IN ('uploaded','failed','queued')
        AND source_key=? AND claim_token IS ? AND claim_expires IS ?
        AND (state<>'queued' OR (claim_token IS NULL AND claim_expires IS NULL))
        AND (claim_token IS NULL OR (claim_expires IS NOT NULL AND claim_expires<=?))
        AND result_key IS NULL AND result_meta IS NULL AND artifact_manifest IS NULL AND draft_url IS NULL AND draft_readback IS NULL
        AND NOT EXISTS (SELECT 1 FROM article_deliveries d WHERE d.article_id=? AND d.owner=?)
        AND NOT EXISTS (SELECT 1 FROM writing_runs w WHERE w.article_id=? AND w.owner=?)
        AND NOT EXISTS (SELECT 1 FROM article_upload_attempts u WHERE u.article_id=articles.id AND u.owner=articles.owner)
        AND NOT EXISTS (SELECT 1 FROM editorial_runs_v3 w WHERE w.article_id=articles.id AND w.owner=articles.owner)
        AND NOT EXISTS (SELECT 1 FROM editorial_flows w WHERE w.article_id=articles.id AND w.owner=articles.owner)
        AND NOT EXISTS (SELECT 1 FROM outline_flows w WHERE w.article_id=articles.id AND w.owner=articles.owner)`)
      .bind(id, owner, row.title, row.state, `articles/${id}/source`, row.claim_token, row.claim_expires, now, id, owner, id, owner),
    db().prepare(`INSERT OR IGNORE INTO article_deletions(id,owner,state,started_at,lock_token,lock_expires)
      SELECT id,owner,'deleting',?,?,? FROM articles WHERE id=? AND owner=? AND state='deleting'`)
      .bind(now, lockToken, lockExpires, id, owner),
  ]);
  const fresh = await getArticle(owner, id);
  const tombstone = await getTombstone(owner, id);
  if (Number(result[0]?.meta?.changes || 0) > 0 && fresh?.state === 'deleting' && tombstone?.state === 'deleting' && tombstone.lock_token === lockToken) return { row: fresh, lockToken };
  if (fresh?.state === 'deleting' && tombstone?.state === 'deleting') throw new ArticleDeletionError('这篇文章已在删除处理中，请先刷新核对状态', 409);
  if (!fresh) throw new ArticleDeletionError('文章已变化或不存在，请刷新后核对', 404);
  if (activeArticleStates.includes(fresh.state) || hasBlockingClaim(fresh)) {
    throw new ArticleDeletionError('文章仍在处理中，暂不能删除', 409);
  }
  await assertNoActiveWriters(owner, id);
  throw new ArticleDeletionError('文章状态已变化，请刷新后重新核对', 409);
}

async function acquireDeletionLock(owner: string, id: string) {
  const now = new Date().toISOString();
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + DELETION_LOCK_MS).toISOString();
  const result = await db().prepare(`UPDATE article_deletions SET lock_token=?,lock_expires=?
    WHERE id=? AND owner=? AND state='deleting' AND (lock_token IS NULL OR lock_expires IS NULL OR lock_expires<=?)`)
    .bind(token, expires, id, owner, now).run();
  if (!result.meta.changes) throw new ArticleDeletionError('这篇文章已在删除处理中，请稍后刷新核对', 409);
  return token;
}

export async function renewDeletionLock(owner: string, id: string, token: string) {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + DELETION_LOCK_MS).toISOString();
  const result = await db().prepare(`UPDATE article_deletions SET lock_expires=?
    WHERE id=? AND owner=? AND state='deleting' AND lock_token=? AND lock_expires>?`)
    .bind(expires, id, owner, token, now).run();
  if (!result.meta.changes) throw new ArticleDeletionError('删除处理权已变化，请刷新核对状态后重试', 409);
}

async function releaseDeletionLock(owner: string, id: string, token: string) {
  await db().prepare(`UPDATE article_deletions SET lock_token=NULL,lock_expires=NULL
    WHERE id=? AND owner=? AND state='deleting' AND lock_token=?`).bind(id, owner, token).run();
}

async function assertNoActiveWriters(owner: string, id: string) {
  const delivery = await db().prepare('SELECT 1 AS related FROM article_deliveries WHERE article_id=? AND owner=? LIMIT 1').bind(id, owner).first();
  if (delivery) throw new ArticleDeletionError('此稿已有平台交付记录；本入口只支持尚未投递的上传稿', 409);
  const writing = await db().prepare('SELECT 1 AS related FROM writing_runs WHERE article_id=? AND owner=? LIMIT 1').bind(id, owner).first();
  if (writing) throw new ArticleDeletionError('此稿关联写作配额或生成记录；本入口只支持人工上传稿', 409);
  const upload = await db().prepare('SELECT 1 AS related FROM article_upload_attempts WHERE article_id=? AND owner=? LIMIT 1').bind(id, owner).first();
  if (upload) throw new ArticleDeletionError('此稿已有平台上传尝试；本入口只支持尚未投递的上传稿', 409);
  const generated = await db().prepare(`SELECT 1 AS related WHERE
    EXISTS(SELECT 1 FROM editorial_runs_v3 WHERE article_id=? AND owner=?)
    OR EXISTS(SELECT 1 FROM editorial_flows WHERE article_id=? AND owner=?)
    OR EXISTS(SELECT 1 FROM outline_flows WHERE article_id=? AND owner=?)`).bind(id, owner, id, owner, id, owner).first();
  if (generated) throw new ArticleDeletionError('此稿关联生成记录；本入口只支持人工上传稿', 409);
}

async function deletionEligibility(owner: string, id: string, row: ArticleRow) {
  if (activeArticleStates.includes(row.state) || hasBlockingClaim(row)) {
    return '文章仍在处理中，暂不能删除';
  }
  if (!['uploaded', 'failed', 'queued', 'deleting'].includes(row.state)) return '本入口只支持尚未开始生成成稿的上传稿';
  if (row.source_key !== `articles/${id}/source`) return '本入口只支持人工上传的原始文件';
  if (row.result_key != null || row.result_meta != null || row.artifact_manifest != null || row.draft_url != null || row.draft_readback != null) {
    return '此稿已生成或准备成稿/平台交付；本入口只支持未制作成稿的上传稿';
  }
  try { await assertNoActiveWriters(owner, id); }
  catch (error) {
    if (error instanceof ArticleDeletionError) return error.message;
    throw error;
  }
  return null;
}

export async function previewArticleDeletion(owner: string, id: string) {
  if (!validId(id)) throw new ArticleDeletionError('文章编号无效', 400);
  const row = await getArticle(owner, id);
  const listOperation=await getTombstone(owner,id);
  if(listOperation?.operation_id)return {article_id:id,deletion_supported:false,operation_id:listOperation.operation_id,unsupported_reason:'此稿属于已确认的列表清空，请回读原操作'};
  if (!row) {
    const prior = await getTombstone(owner, id);
    if (prior?.state === 'deleted') {
      const remaining = (await listArticleObjects(id)).length;
      return { article_id: id, deleted: remaining === 0, already_deleted: remaining === 0, remaining_object_count: remaining, ...(remaining ? { cleanup_required: true } : {}) };
    }
    throw new ArticleDeletionError('文章不存在或无权访问', 404);
  }
  const [delivery, writing, objects, eligibility] = await Promise.all([
    db().prepare('SELECT count(*) AS n FROM article_deliveries WHERE article_id=? AND owner=?').bind(id, owner).first() as Promise<{ n: number } | null>,
    db().prepare('SELECT count(*) AS n FROM writing_runs WHERE article_id=? AND owner=?').bind(id, owner).first() as Promise<{ n: number } | null>,
    row.state === 'deleting' ? listArticleObjects(id) : Promise.resolve(null),
    deletionEligibility(owner, id, row),
  ]);
  let unsupported = eligibility;
  if (!unsupported) {
    try { await assertOnlyUploadedSourceObject(row, id); }
    catch (error) {
      if (error instanceof ArticleDeletionError) unsupported = error.message;
      else throw error;
    }
  }
  return {
    article_id: id,
    title: row.title,
    filename: row.filename,
    state: row.state,
    delivery_records: Number(delivery?.n || 0),
    writing_runs: Number(writing?.n || 0),
    ...(objects ? { remaining_object_count: objects.length } : {}),
    deletion_supported: !unsupported,
    ...(unsupported ? { unsupported_reason: unsupported } : {}),
    permanent: true,
  };
}

export async function deleteArticlePermanently(owner: string, args: DeleteArticleRequest) {
  const id = args?.article_id;
  if (!validId(id)) throw new ArticleDeletionError('文章编号无效', 400);
  if (args.confirm_permanent !== true || args.confirm_article_id !== id) {
    throw new ArticleDeletionError('请核对完整文章编号并明确确认永久删除', 400);
  }

  const listOperation=await getTombstone(owner,id);
  if(listOperation?.operation_id)throw new ArticleDeletionError('此稿属于已确认的列表清空，请回读原操作',409);
  let row = await getArticle(owner, id);
  if (!row) {
    const prior = await getTombstone(owner, id);
    if (prior?.state === 'deleted') {
      if (typeof args.confirm_title !== 'string' || !args.confirm_title.trim()) throw new ArticleDeletionError('请重新核对文章标题与完整编号', 400);
      const leftovers = await listArticleObjects(id);
      if (leftovers.some(object => object.key !== `articles/${id}/source`)) throw new ArticleDeletionError('发现无法归入原始上传稿的文件，删除已暂停', 503);
      for (const object of leftovers) await bucket().delete(object.key);
      if ((await listArticleObjects(id)).length) throw new ArticleDeletionError('本站仍有文件未确认删除，请按同一编号重试', 503);
      return { article_id: id, deleted: true, already_deleted: true, files_deleted: leftovers.length };
    }
    throw new ArticleDeletionError('文章不存在或无权访问', 404);
  }
  if (typeof args.confirm_title !== 'string' || args.confirm_title !== row.title) {
    throw new ArticleDeletionError('文章标题已变化或不匹配，请重新核对目标', 409);
  }
  const unsupported = await deletionEligibility(owner, id, row);
  if (unsupported) throw new ArticleDeletionError(unsupported, 409);
  assertStoredKeysAreArticleScoped(row, id);
  await assertOnlyUploadedSourceObject(row, id);
  let tombstone = await getTombstone(owner, id);
  if (tombstone?.state === 'deleted') throw new ArticleDeletionError('删除记录与文章数据不一致，已暂停，需要人工核对', 503);
  let lockToken: string;
  if (row.state !== 'deleting') {
    const begun = await beginDeletion(owner, id, row);
    row = begun.row;
    lockToken = begun.lockToken;
  } else {
    if (!tombstone) {
      await db().prepare(`INSERT OR IGNORE INTO article_deletions(id,owner,state,started_at)
        SELECT id,owner,'deleting',? FROM articles WHERE id=? AND owner=? AND state='deleting'`)
        .bind(new Date().toISOString(), id, owner).run();
      tombstone = await getTombstone(owner, id);
      if (tombstone?.state !== 'deleting') throw new ArticleDeletionError('删除状态无法恢复，请人工核对', 503);
    }
    lockToken = await acquireDeletionLock(owner, id);
  }

  try {
    await assertNoActiveWriters(owner, id);
    await assertOnlyUploadedSourceObject(row, id);
    let removed = 0;
    // Re-list after marking the row. This catches upload parts created just before the fence.
    for (let pass = 0; pass < 3; pass++) {
      await renewDeletionLock(owner, id, lockToken);
      const objects = await listArticleObjects(id);
      if (!objects.length) break;
      if (objects.some(object => object.key !== row.source_key || object.key !== `articles/${id}/source`)) {
        throw new ArticleDeletionError('检测到非原始上传文件，删除已暂停', 503);
      }
      for (const object of objects) {
        if (object.key !== row.source_key || object.key !== `articles/${id}/source`) {
          throw new ArticleDeletionError('检测到非原始上传文件，删除已暂停', 503);
        }
        await bucket().delete(object.key);
        removed++;
      }
    }
    const remaining = await listArticleObjects(id);
    if (remaining.length) throw new ArticleDeletionError('部分本站文件尚未确认删除；文章记录已封锁，请刷新后按同一编号重试', 503);

    const completedAt = new Date().toISOString();
    await db().batch([
    db().prepare(`UPDATE article_deletions SET state='deleted', deleted_at=?, object_count=?,lock_token=NULL,lock_expires=NULL
      WHERE id=? AND owner=? AND state='deleting' AND lock_token=? AND lock_expires>?
        AND EXISTS (SELECT 1 FROM articles a WHERE a.id=? AND a.owner=? AND a.state='deleting'
          AND a.result_key IS NULL AND a.result_meta IS NULL AND a.artifact_manifest IS NULL AND a.draft_url IS NULL AND a.draft_readback IS NULL)
        AND NOT EXISTS (SELECT 1 FROM article_deliveries d WHERE d.article_id=? AND d.owner=?)
        AND NOT EXISTS (SELECT 1 FROM writing_runs w WHERE w.article_id=? AND w.owner=?)
        AND NOT EXISTS (SELECT 1 FROM article_upload_attempts u WHERE u.article_id=? AND u.owner=?)
        AND NOT EXISTS (SELECT 1 FROM editorial_runs_v3 w WHERE w.article_id=? AND w.owner=?)
        AND NOT EXISTS (SELECT 1 FROM editorial_flows w WHERE w.article_id=? AND w.owner=?)
        AND NOT EXISTS (SELECT 1 FROM outline_flows w WHERE w.article_id=? AND w.owner=?)`)
      .bind(completedAt, removed, id, owner, lockToken, new Date().toISOString(), id, owner, id, owner, id, owner, id, owner, id, owner, id, owner, id, owner),
    db().prepare(`DELETE FROM articles WHERE id=? AND owner=? AND state='deleting'
      AND EXISTS (SELECT 1 FROM article_deletions t WHERE t.id=? AND t.owner=? AND t.state='deleted')`)
      .bind(id, owner, id, owner),
    ]);
    const finalArticle = await getArticle(owner, id);
    const finalTombstone = await getTombstone(owner, id);
    if (finalArticle || finalTombstone?.state !== 'deleted') {
      throw new ArticleDeletionError('文件清理完成，但本站记录删除尚未确认；请刷新后按同一编号重试', 503);
    }
    return {
      article_id: id,
      deleted: true,
      already_deleted: false,
      files_deleted: removed,
      delivery_records_removed: 0,
      writing_runs_removed: 0,
    };
  } catch (error) {
    try { await releaseDeletionLock(owner, id, lockToken); } catch { /* A crashed request can be retried after its lease expires. */ }
    throw error;
  }
}

const articleId = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const deletionTool = (name: string, description: string, properties: Record<string, unknown>, required: string[], readOnlyHint: boolean) => ({
  name,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  annotations: { readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false },
});

export const articleDeletionTools = [
  deletionTool('preview_article_deletion', 'Read the exact owner-scoped article and whether it qualifies as an unprocessed manual upload eligible for permanent deletion. No state change.', { article_id: articleId }, ['article_id'], true),
  deletionTool('delete_article_permanently', 'Permanently remove exactly one owner-owned manual upload only when no Word output, delivery record, or writing run exists. Generated articles and already delivered articles are deliberately unsupported. Requires exact article ID, exact current title, and explicit confirmation.', {
    article_id: articleId,
    confirm_article_id: articleId,
    confirm_title: { type: 'string', minLength: 1, maxLength: 120 },
    confirm_permanent: { type: 'boolean', const: true },
  }, ['article_id', 'confirm_article_id', 'confirm_title', 'confirm_permanent'], false),
];

export async function articleDeletionCall(owner: string, name: string, args: unknown) {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {};
  if (name === 'preview_article_deletion') return previewArticleDeletion(owner, input.article_id as string);
  if (name === 'delete_article_permanently') return deleteArticlePermanently(owner, input as unknown as DeleteArticleRequest);
  throw new ArticleDeletionError('未知删除操作', 400);
}
