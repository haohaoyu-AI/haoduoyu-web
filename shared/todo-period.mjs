// A future to-do may carry a rough time instead of a day: an ISO week ("2026-W47") or a month ("2026-12").
// It is stored as that concrete week or month, so "下周" turns into "本周" by itself when the week comes.
const DAY = 86400000;
const parse = date => Date.parse(date + 'T00:00:00Z');
const iso = time => new Date(time).toISOString().slice(0, 10);

/** The ISO week of a YYYY-MM-DD day, as "YYYY-Www". */
export function weekOf(date) {
  const time = parse(date), weekday = (new Date(time).getUTCDay() + 6) % 7; // Monday 0
  const thursday = new Date(time + (3 - weekday) * DAY), year = thursday.getUTCFullYear();
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
export const monthOf = date => date.slice(0, 7);
/** The Monday of an ISO week. */
export function weekStart(period) {
  const [year, week] = [Number(period.slice(0, 4)), Number(period.slice(6))];
  const jan4 = Date.UTC(year, 0, 4), weekday = (new Date(jan4).getUTCDay() + 6) % 7;
  return iso(jan4 - weekday * DAY + (week - 1) * 7 * DAY);
}
/** True for a real ISO week or month; anything else is refused. */
export function validPeriod(value) {
  if (typeof value !== 'string') return false;
  if (/^\d{4}-W\d{2}$/.test(value)) return Number(value.slice(6)) >= 1 && weekOf(weekStart(value)) === value;
  if (/^\d{4}-\d{2}$/.test(value)) return Number(value.slice(5)) >= 1 && Number(value.slice(5)) <= 12 && value >= '2000-01';
  return false;
}
const nextMonth = month => {
  const [year, value] = [Number(month.slice(0, 4)), Number(month.slice(5))];
  return value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`;
};
/** The period each choice stands for on a given day. */
export function periodChoices(today) {
  return {
    week: weekOf(today), next_week: weekOf(iso(parse(today) + 7 * DAY)),
    month: monthOf(today), next_month: nextMonth(monthOf(today)),
  };
}
export const PERIOD_GROUPS = [['week', '本周'], ['next_week', '下周'], ['month', '本月'], ['next_month', '下个月'], ['none', '不定']];
/** Which group a stored period falls in today. A week or month already past stays in 本周 / 本月 until it is done or moved. */
export function periodGroup(period, today) {
  if (!validPeriod(period)) return 'none';
  const choices = periodChoices(today);
  if (period.includes('W')) return period <= choices.week ? 'week' : period === choices.next_week ? 'next_week' : 'month';
  return period <= choices.month ? 'month' : 'next_month';
}
/** True when the period is already over: last week, last month. */
export function periodPast(period, today) {
  if (!validPeriod(period)) return false;
  return period.includes('W') ? period < weekOf(today) : period < monthOf(today);
}
export const RECURRENCES = ['week', 'month'];
/** True when a period fits a repeat: a week for 每周, a month for 每月. */
export const periodFits = (period, recurrence) => validPeriod(period) && (recurrence === 'week') === period.includes('W');
/** The period the next one of a repeating to-do goes to: after this one, and never before the week or month after today's. */
export function nextPeriod(period, recurrence, today) {
  if (recurrence === 'week') {
    const now = weekOf(today), base = validPeriod(period) && period.includes('W') && period > now ? period : now;
    return weekOf(iso(parse(weekStart(base)) + 7 * DAY));
  }
  const now = monthOf(today), base = validPeriod(period) && !period.includes('W') && period > now ? period : now;
  return nextMonth(base);
}
/** Days from today to a due date: 0 on the day, negative once it has passed. */
export const daysUntil = (due, today) => Math.round((parse(due) - parse(today)) / DAY);
export const DUE_LEAD = 3;
/** From three days before its due date, until it is done, a future to-do is shown on 今日. */
export const dueSoon = (due, today) => typeof due === 'string' && daysUntil(due, today) <= DUE_LEAD;
export function dueLabel(due, today) {
  const days = daysUntil(due, today), day = `${Number(due.slice(5, 7))}/${Number(due.slice(8))}`;
  return days > 0 ? `${day} 截止 · 还剩 ${days} 天` : days === 0 ? `今天截止` : `${day} 截止 · 已过期 ${-days} 天`;
}
/** The group a due date falls in: the week it is in when that is this or next week, otherwise its month. */
export function dueGroup(due, today) {
  const choices = periodChoices(today), week = weekOf(due);
  if (week <= choices.week) return 'week';
  if (week === choices.next_week) return 'next_week';
  return monthOf(due) <= choices.month ? 'month' : 'next_month';
}
