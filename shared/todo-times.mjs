// 每周 N 次 / 每月 N 次 (2026-11-24, Claude): no new column. "每周 2 次" is kept as two identical 每周 to-dos;
// the page shows them as one row with 本周 1/2. Ticking one moves it to 今日 as before, and the existing repeat
// leaves its next one in next week, so a copy whose period is after this week counts as done this week.
import {monthOf, periodChoices, validPeriod} from './todo-period.mjs';

export const MAX_TIMES = 7;
const DIGIT = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7};
const SPAN = '(一周|一个?礼拜|一个?星期|每周|每个?礼拜|每个?星期|一个?月|每个?月)?';
const TIMES = new RegExp(`${SPAN}\\s*([2-7两二三四五六七])\\s*(?:次|回|遍)`);
const EDGE = /^[\s,，.。、;；:：!！~～-]+|[\s,，.。、;；:：!！~～-]+$/g;

/** {times, every, text} when the sentence says how many times ("每周两次总结数据"), otherwise null.
 * every is every_week / every_month when the sentence itself says the span; text drops "两次" (and a bare "一周"). */
export function readTimes(sentence) {
  const source = String(sentence ?? ''), match = TIMES.exec(source);
  if (!match) return null;
  const span = match[1] || '', every = !span ? null : /月/.test(span) ? 'every_month' : 'every_week';
  const keep = span.startsWith('每') ? span : ''; // 每周 stays in the text like a plain 每周 to-do; 一周 goes
  const text = (source.slice(0, match.index) + keep + source.slice(match.index + match[0].length)).replace(/\s+/g, ' ').replace(EDGE, '').trim();
  return {times: DIGIT[match[2]], every, text: text || source.trim()};
}

/** The week or month a repeat counts in today. */
export const currentPeriod = (recurrence, today) => recurrence === 'week' ? periodChoices(today).week : monthOf(today);
const live = item => item && !item.deleted_at && !item.deleted && ['week', 'month'].includes(item.recurrence) && validPeriod(item.period);

// 多做 (2026-11-24): once a week is done enough, a tick still counts. It saves a finished one-off to-do with the same text
// in this week (kept, not moved to 今日), shown as 本周 3/2; past weeks' extras are hidden.
const extraOf=(item,recurrence)=>item && !item.deleted_at && !item.deleted && !item.recurrence && (item.completed===true||item.completed===1) &&
  validPeriod(item.period) && (recurrence==='week'?/W/.test(item.period):!/W/.test(item.period));
/** Repeating to-dos with the same text and repeat, gathered: copies, open (still to do, oldest first), done and extra. */
export function repeatGroups(items, today) {
  const groups = new Map();
  for (const item of items) {
    if (!live(item)) continue;
    const key = item.recurrence + '|' + item.text.trim();
    if (!groups.has(key)) groups.set(key, {key, text: item.text.trim(), recurrence: item.recurrence, copies: []});
    groups.get(key).copies.push(item);
  }
  for (const group of groups.values()) {
    const now = currentPeriod(group.recurrence, today);
    group.current = now;
    group.done = group.copies.filter(item => item.period > now);
    group.open = group.copies.filter(item => item.period <= now).sort((a, b) => a.period < b.period ? -1 : a.period > b.period ? 1 : 0);
    group.times = group.copies.length;
    group.extras = items.filter(item => extraOf(item, group.recurrence) && item.text.trim() === group.text);
    group.extra = group.extras.filter(item => item.period === now).length;
  }
  return [...groups.values()];
}

/** Days left in this week (Sunday 1) or this month (last day 1), today included. */
export function daysLeft(recurrence, today) {
  const date = new Date(today + 'T00:00:00Z');
  if (recurrence === 'week') return 7 - (date.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return last - date.getUTCDate() + 1;
}
/** Shown on 今日 when the week (or month) is nearly over and it is not done enough:
 * from Saturday (the last three days of a month), or earlier once the days left are no more than the times left. */
export function needsNudge(group, today) {
  const left = group.open.length, days = daysLeft(group.recurrence, today);
  return left > 0 && (days <= (group.recurrence === 'week' ? 2 : 3) || left >= days);
}
export const timesLabel = group => {
  const span = group.recurrence === 'week' ? '本周' : '本月', extra = group.extra || 0;
  if (group.open.length) return `${span} ${group.done.length}/${group.times}`;
  return extra ? `${span} ${group.times + extra}/${group.times}，多做了 ${extra} 次` : `${span}做够了 ${group.times}/${group.times}`;
};
export const leftLabel = group => `${group.recurrence === 'week' ? '本周' : '本月'}还差 ${group.open.length} 次`;
