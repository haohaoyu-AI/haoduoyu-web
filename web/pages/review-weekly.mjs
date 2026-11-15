import {renderReviewMarkdown} from '../core/review-markdown.mjs';
import {e} from '../core/dom.mjs';

// 周复盘: the weekly review the bot writes as a review report with period_type "weekly".
// The newest week is open at the top of the cockpit; earlier weeks follow as a timeline.
const day = date => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日` : String(date ?? '');
const range = report => `${day(report.period_start)} 至 ${day(report.period_end)}`;
/** Weekly reports of one account, newest week first. */
export function weeklyReviews(reports = [], account) {
  return reports.filter(report => report && report.period_type === 'weekly' && report.account === account && !report.deleted_at)
    .sort((a, b) => String(b.period_end).localeCompare(String(a.period_end)) || String(b.created_at).localeCompare(String(a.created_at)));
}
/** The first sentence that is not a heading, as the one-line preview of an earlier week. */
export function weeklyPreview(markdown) {
  const line = String(markdown ?? '').split(/\r?\n/).map(text => text.trim()).find(text => text && !/^#{1,6}\s/.test(text)) || '';
  const plain = line.replace(/[*_`>#]/g, '').replace(/^[-\d.、\s]+/, '').trim();
  return plain.length > 90 ? plain.slice(0, 90) + '…' : plain;
}
const body = report => `<div class="review-markdown review-weekly-body">${renderReviewMarkdown(report.summary_md || '')}</div>`;
export function renderWeeklyReview(data, vm) {
  const [latest, ...older] = weeklyReviews(data.reports, vm.account);
  if (!latest) return '';
  const earlier = older.length ? `<h3 class="review-weekly-more">往期</h3><div class="review-weekly-tl">${older.map(report =>
    `<details class="review-weekly-week"><summary><span class="review-weekly-date">${e(range(report))}</span>` +
    `<span class="review-weekly-preview">${e(weeklyPreview(report.summary_md))}</span></summary>${body(report)}</details>`).join('')}</div>` : '';
  return `<section class="review-weekly" aria-label="周复盘"><details class="review-weekly-latest" open><summary><span class="review-weekly-title">周复盘</span>` +
    `<span class="review-weekly-date">${e(range(latest))}</span></summary>${body(latest)}</details>${earlier}</section>`;
}
