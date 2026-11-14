import {e} from '../core/dom.mjs';
import {renderSafeMarkdown} from '../core/safe-markdown.mjs';
import {visibleWorkReminders} from '../core/work-reminders-state.mjs';

// 待拍板: only the "待你拍板" part of Grok's daily reminder, so the questions waiting for a reply are not buried.
// Replies still happen in the chat with Grok; this page only shows what is waiting.
const DECISION_HEADING = /待你拍板/;
const plain = line => line.replace(/^[\s#>*_]+|[\s*_:：]+$/g, '').trim();
// A heading is a Markdown heading, a line that is only bold text, or a short line ending in a colon.
const isHeading = line => /^#{1,6}\s/.test(line) || /^\s*\*\*[^*]+\*\*\s*[:：]?\s*$/.test(line) || /^\s*[^\s\d-].{0,12}[:：]\s*$/.test(line);
const ENDS_SECTION = /^\s*(已按你的决定执行|已执行)/;

/** The "待你拍板" items of one reminder: null when the reminder has no such heading, [] when the heading is empty. */
export function decisionsFrom(summary) {
  const lines = String(summary ?? '').split(/\r?\n/);
  const start = lines.findIndex(line => DECISION_HEADING.test(line) && (isHeading(line) || plain(line).length <= 12));
  if (start < 0) return null;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (isHeading(line) || ENDS_SECTION.test(line)) break;
    const item = /^\s*(?:\d{1,2}[.、)]|[-*•])\s+(.*)$/.exec(line);
    if (item) items.push(item[1]);
    else if (line.trim() && items.length) items[items.length - 1] += line.trim(); // a wrapped line continues its item
    else if (line.trim()) items.push(line.trim());
  }
  return items;
}

/** Every visible reminder of one day, reduced to its decisions; a reminder without the heading is shown whole. */
export function dayDecisions(items = []) {
  return visibleWorkReminders(items).map(row => ({row, decisions: decisionsFrom(row.summary)}));
}
export function decisionCount(items = []) {
  return dayDecisions(items).reduce((sum, {decisions}) => sum + (decisions?.length || 0), 0);
}

const list = decisions => `<ol class="ai-decision-list">${decisions.map(text =>
  `<li class="ai-report-markdown">${renderSafeMarkdown(text)}</li>`).join('')}</ol>`;
/** One day's cards; a reminder written in another shape is kept whole, folded, so nothing is lost. */
export function decisionCards(items = []) {
  return dayDecisions(items).map(({row, decisions}) => {
    if (decisions === null) return `<article class="card field-spaced ai-decision-card" style="overflow-wrap:anywhere">` +
      `<div class="ai-report-markdown">${renderSafeMarkdown(row.summary)}</div></article>`;
    return `<article class="card field-spaced ai-decision-card">${decisions.length ? list(decisions) : '<p class="muted">这次没有要你拍板的事。</p>'}` +
      `<details class="ai-decision-full"><summary>看完整提醒</summary><div class="ai-report-markdown">${renderSafeMarkdown(row.summary)}</div></details></article>`;
  }).join('');
}
/** Earlier days, newest first; days without reminders are left out. */
export function decisionHistory(days = [], titleFor = date => date) {
  const rows = days.filter(day => visibleWorkReminders(day.items).length).map(day => {
    const count = decisionCount(day.items);
    return `<section class="ai-decision-day"><h4>${e(titleFor(day.date))}<span class="muted"> · ${count ? `${count} 件` : '无'}</span></h4>` +
      decisionCards(day.items) + '</section>';
  });
  return rows.length ? rows.join('') : '<p class="muted">前 7 天没有提醒。</p>';
}
