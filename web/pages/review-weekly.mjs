import {renderReviewMarkdown} from '../core/review-markdown.mjs';
import {e} from '../core/dom.mjs';
import {day as bjDay, shiftDay} from '../core/review-data.mjs';

// 周复盘: the weekly review the bot writes as a review report with period_type "weekly".
// The newest week renders expanded on the cockpit so the user can read it without clicking; earlier weeks stay folded.
const day = date => /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日` : String(date ?? '');
const range = report => `${day(report.period_start)} 至 ${day(report.period_end)}`;
function currentWeekStart(now) {
  const today = bjDay(now || new Date().toISOString());
  if (!today) return '';
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return shiftDay(today, offset);
}
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
  const weekStart = currentWeekStart(vm.now);
  const isCurrentWeek = weekStart && String(latest.period_end || '') >= weekStart;
  const heading = isCurrentWeek ? '本周复盘' : '上周复盘';
  const pendingBadge = isCurrentWeek ? '' : '<span class="review-weekly-badge">本周周报待周日生成</span>';
  const earlier = older.length ? `<details class="review-weekly-older"><summary>往期周复盘（${older.length} 份）</summary>` +
    `<div class="review-weekly-tl">${older.map(report =>
    `<details class="review-weekly-week"><summary><span class="review-weekly-date">${e(range(report))}</span>` +
    `<span class="review-weekly-preview">${e(weeklyPreview(report.summary_md))}</span></summary>${body(report)}</details>`).join('')}</div></details>` : '';
  return `<section class="review-weekly" aria-label="周复盘"><div class="review-weekly-latest"><div class="review-weekly-head">` +
    `<h3 class="review-weekly-title">${e(heading)}</h3><span class="review-weekly-date">${e(range(latest))}</span>${pendingBadge}</div>` +
    `${body(latest)}${earlier}</div></section>`;
}
