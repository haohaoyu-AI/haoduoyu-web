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

// Grok marks earlier questions once you have answered in the chat: 已采纳, 已否决 or 待定, in brackets or at the end.
const STATUS = /\s*(?:[【（(\[]\s*(已采纳|已否决|待定)\s*[】）)\]]|[—\-→:：]\s*(已采纳|已否决|待定)\s*[。.]?\s*$)/;
const STATUS_CLASS = {已采纳: 'is-yes', 已否决: 'is-no', 待定: 'is-wait'};
/** The text of one item without its status mark, and the status if Grok wrote one. */
export function decisionStatus(text) {
  const match = STATUS.exec(text);
  if (!match) return {text, status: ''};
  return {text: (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim(), status: match[1] || match[2]};
}
const list = decisions => `<ol class="ai-decision-list">${decisions.map(item => {
  const {text, status} = decisionStatus(item);
  return `<li class="ai-report-markdown${status ? ' ' + STATUS_CLASS[status] : ''}">` +
    `${status ? `<span class="ai-decision-status">${status}</span>` : ''}${renderSafeMarkdown(text)}</li>`;
}).join('')}</ol>`;
const NONE = '<p class="muted">没有要你拍板的事。</p>';
// Details live in AI汇报; a reminder without a 待你拍板 section says so instead of being shown here.
const OTHER_SHAPE = '<p class="muted">这份提醒没有单列「待你拍板」，详细内容在「AI汇报」。</p>';
const dayBody = items => {
  const parts = dayDecisions(items).map(({decisions}) => decisions === null ? OTHER_SHAPE : decisions.length ? list(decisions) : '');
  return [...new Set(parts.filter(Boolean))].join('') || NONE; // several old-shape reminders give one note
};
/** Today's questions: only the 待你拍板 items. */
export function decisionCards(items = []) {
  return `<article class="card field-spaced ai-decision-card">${dayBody(items)}</article>`;
}
const WEEK = ['周日','周一','周二','周三','周四','周五','周六'];
/** Earlier days as a timeline, newest first; days without a reminder are left out. */
export function decisionHistory(days = []) {
  const rows = days.filter(day => visibleWorkReminders(day.items).length).map(day => {
    const count = decisionCount(day.items), week = WEEK[new Date(day.date + 'T00:00:00Z').getUTCDay()];
    return `<div class="notes-tl-day ai-decision-day"><span class="notes-tl-date"><span class="notes-tl-num">${Number(day.date.slice(8))}</span>` +
      `<span class="notes-tl-week">${week}</span></span><span class="notes-tl-dot"></span><div class="notes-tl-card">` +
      `${dayBody(day.items)}<span class="notes-tl-foot">${Number(day.date.slice(5, 7))}月${Number(day.date.slice(8))}日 · ` +
      `${count ? `${count} 件` : '无待拍板'}</span></div></div>`;
  });
  return rows.length ? `<div class="notes-tl">${rows.join('')}</div>` : '<p class="muted">前 7 天没有提醒。</p>';
}
