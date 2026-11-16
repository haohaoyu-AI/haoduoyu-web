// 未来待办: the rough time said in the sentence itself ("下个礼拜看电影") is read here, with a fixed word list and no AI.
// A phrase that names a weekday ("下周五", "这礼拜三") is a concrete day, not a period, so it is left alone.
const WORDS = {
  week: ['本周', '这周', '这个周', '本礼拜', '这礼拜', '这个礼拜', '本星期', '这星期', '这个星期', '这一周', '这一个礼拜', '这一个星期',
    '周末', '这周末', '本周末', '这个周末', '这礼拜末'],
  // 每周 / 每月 are repeating plans, not this week or this month: the words stay in the text.
  every_week: ['每周', '每一周', '每个周', '每礼拜', '每个礼拜', '每一个礼拜', '每星期', '每个星期', '每一个星期', '每周末', '每个周末'],
  next_week: ['下周', '下个周', '下一周', '下礼拜', '下个礼拜', '下一个礼拜', '下星期', '下个星期', '下一个星期', '下周内', '下礼拜内',
    '下周末', '下个周末'],
  month: ['本月', '这月', '这个月', '这一个月', '月底', '月末', '这个月底', '本月底', '这个月末', '本月末', '月中', '中旬', '下旬',
    '这个月中旬', '本月中旬', '这个月下旬', '本月下旬'],
  every_month: ['每月', '每个月', '每一个月', '每月底', '每个月底', '每月末', '每个月末', '每月初', '每个月初'],
  next_month: ['下月', '下个月', '下一个月', '下月初', '下个月初', '下月底', '下个月底', '下月末', '下个月末',
    '下月中', '下个月中', '下月中旬', '下个月中旬', '下月下旬', '下个月下旬', '下个月上旬', '下月上旬'],
};
export const PERIOD_WORDS = WORDS;
const ENTRIES = Object.entries(WORDS).flatMap(([key, words]) => words.map(word => [word, key])).sort((a, b) => b[0].length - a[0].length);
// "前", "之前", "内", "之内" right after a phrase belong to it: 月底前, 下周之内.
const PATTERN = new RegExp(`(${ENTRIES.map(([word]) => word).join('|')})(?:之前|以前|之内|以内|前|内)?`, 'g');
const DAY_AFTER = /^[一二三四五六日天1-7]/;
const EDGE = /^[\s,，.。、;；:：!！~～-]+|[\s,，.。、;；:：!！~～-]+$/g;

/** {period, text} when the sentence says a rough time, otherwise null. text is the sentence without that phrase. */
export function readPeriodWords(sentence) {
  const source = String(sentence ?? '');
  for (const match of source.matchAll(PATTERN)) {
    const after = source.slice(match.index + match[0].length);
    if (DAY_AFTER.test(after) && !/^一(起|下|趟|次|个|些|块|直)/.test(after)) continue; // 下周五 is a day; 下周一起 is not
    if (/(上|上个|上一个|前)$/.test(source.slice(0, match.index))) continue; // 上个月底, 上周末 are past
    const key = ENTRIES.find(([word]) => word === match[1])[1];
    const rest = (source.slice(0, match.index) + ' ' + source.slice(match.index + match[0].length)).replace(/\s+/g, ' ').replace(EDGE, '').trim();
    return {period: key, text: key.startsWith('every_') ? source.trim() : rest || source.trim()};
  }
  return null;
}
