import {db} from './test-store';
import {bucket} from './articles';
import {parseArticle} from './article-format';
import {hashText} from './writing-input';
import {protectPreparedArticleForOwner} from './claude';

// Adopts an already-approved external final draft. Never generates or dispatches.
export const preparedArticleTools = [{
 name: 'register_prepared_article',
 description: 'Register the owner-approved final title and exact paragraphs once for attachment of an already-made illustrated Word. Does not call a model, search images, dispatch an event, or publish. Returns queued for a single normal claim_article processor to reuse existing artifacts. Manual-import legacy verification applies; no fabricated provider or image manifest.',
 inputSchema: {type: 'object', properties: {title: {type: 'string', maxLength: 120}, paragraphs: {type: 'array', minItems: 1, maxItems: 200, items: {type: 'string', maxLength: 1000}}, expected_original_sha256: {type: 'string', pattern: '^[a-f0-9]{64}$'}, confirm: {type: 'boolean', const: true}}, required: ['title', 'paragraphs', 'expected_original_sha256', 'confirm'], additionalProperties: false},
 annotations: {readOnlyHint: false, openWorldHint: false, destructiveHint: false},
}];
export async function registerPreparedArticle(owner: string, value: unknown) {
 if (!owner || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['title', 'paragraphs', 'expected_original_sha256', 'confirm'].includes(k))) throw Error('已定稿导入参数无效');
 const input = value as Record<string, unknown>;
 if (input.confirm !== true) throw Error('需要确认导入已经定稿的原文');
 const {title, paragraphs} = input;
 if (typeof title !== 'string' || !title.trim() || title.length > 120 || /[\r\n]/.test(title) || !Array.isArray(paragraphs) || !paragraphs.length || paragraphs.length > 200 || paragraphs.some(p => typeof p !== 'string' || !p.trim() || p.length > 1000 || /[\r\n]/.test(p))) throw Error('已定稿导入参数无效');
 const texts = [title, ...paragraphs] as string[];
 // Already-made final drafts are not subject to generated-writing length targets.
 if ((await protectPreparedArticleForOwner(owner, texts)).hit) throw Error('定稿安全校验未通过');
 const originalHash = await hashText(JSON.stringify(texts));
 if (originalHash !== input.expected_original_sha256) throw Error('定稿校验值不一致，未导入');
 const source = texts.join('\n'), bytes = new TextEncoder().encode(source);
 if (JSON.stringify(parseArticle(bytes, 'prepared.txt')) !== JSON.stringify(texts)) throw Error('原文含不兼容格式，未自动改文');
 const digest = await hashText(JSON.stringify(['approved-final-import-v1', owner, originalHash]));
 const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
 const sourceKey = `articles/${id}/source`;
 const deleted = () => db().prepare('SELECT 1 AS deleted FROM article_deletions WHERE id=? AND owner=?').bind(id,owner).first();
 if(await deleted())throw Error('此原文已永久删除，不能重新导入原文章编号');
 const read = () => db().prepare('SELECT id,title,paragraphs,source_key,state FROM articles WHERE id=? AND owner=?').bind(id, owner).first<{id: string; title: string; paragraphs: string; source_key: string; state: string}>();
 const existing = await read();
 if (existing) {
  if (existing.title !== title || existing.paragraphs !== JSON.stringify(texts) || existing.source_key !== sourceKey || existing.state === 'deleting') throw Error('既有定稿记录不一致，未覆盖');
  return {article_id: id, state: existing.state, cached: true, read_only: true, original_sha256: originalHash, event_dispatched: false, model_request_sent: false, verification: 'legacy_unverified'};
 }
 // Concurrent identical imports write identical bytes. Never delete a shared
 // deterministic object after an uncertain DB outcome; retry reads the same id.
 await bucket().put(sourceKey, bytes, {httpMetadata: {contentType: 'text/plain; charset=utf-8'}});
 if(await deleted()){await bucket().delete(sourceKey);throw Error('此原文已永久删除，已移除迟到的本站副本');}
 let inserted;
 try {
 inserted = await db().prepare("INSERT OR IGNORE INTO articles(id,owner,title,filename,source_key,paragraphs,created,state,error) VALUES(?,?,?,?,?,?,?,'queued',?)").bind(id, owner, title, `${title}.txt`, sourceKey, JSON.stringify(texts), new Date().toISOString(), '已接收用户确认的定稿；复用已有配图Word，不重新写作或搜图。等待单一处理者绑定成品。').run();
 } catch(error) {if(await deleted())await bucket().delete(sourceKey);throw error;}
 const saved = await read();
 if (!saved || saved.title !== title || saved.paragraphs !== JSON.stringify(texts) || saved.source_key !== sourceKey) throw Error('导入状态待核验，请只读现有记录，勿另建任务');
 return {article_id: id, state: saved.state, cached: !inserted.meta.changes, read_only: !inserted.meta.changes, original_sha256: originalHash, event_dispatched: false, model_request_sent: false, verification: 'legacy_unverified', next_action: 'claim_article_and_attach_existing_word'};
}
