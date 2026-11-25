import {renderReviewMarkdown} from '../core/review-markdown.mjs';
import {e} from '../core/dom.mjs';
import {parseJson} from '../core/review-data.mjs';

/** Review notes of this kind are an article's 备注: special cases such as a takedown, written by Grok through the notes API. */
export const ARTICLE_REMARK_KIND = 'article_note';
const linked = (note, id) => {
  const ids = Array.isArray(note.related_article_ids) ? note.related_article_ids : parseJson(note.related_article_ids, []);
  return Array.isArray(ids) && ids.some(value => String(value) === String(id));
};
export function articleRemarks(notes = [], id) {
  return notes.filter(note => note && note.kind === ARTICLE_REMARK_KIND && !note.deleted_at && linked(note, id))
    .sort((a, b) => String(b.note_date).localeCompare(String(a.note_date)) || String(b.created_at).localeCompare(String(a.created_at)));
}
const shortDate = date => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日` : '';
/** The 备注 block of the article drawer; nothing is shown when the article has none. */
export function renderArticleRemarks(row, notes) {
  const items = articleRemarks(notes, row.id);
  if (!items.length) return '';
  return `<section class="review-remarks" aria-label="备注"><h3>备注</h3><ul>${items.map(note =>
    `<li><p class="review-remark-head"><span class="review-note">${e(shortDate(note.note_date))}</span><strong>${e(note.title)}</strong></p>` +
    `${note.body_md ? `<div class="review-remark-body">${renderReviewMarkdown(note.body_md)}</div>` : ''}</li>`).join('')}</ul></section>`;
}
