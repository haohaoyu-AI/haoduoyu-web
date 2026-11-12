import {day, median} from './review-analytics.mjs';

/** A trial needs this many measured articles before its numbers mean anything. */
export const EXPERIMENT_SAMPLES = 6;
export const RULE_STATUS_LABELS = {candidate:'待确认', trial:'试验中', kept:'已采纳', dropped:'已放弃', hold:'暂缓'};
const measured = row => row.reads_24h !== null && row.reads_24h !== undefined;
const mid = values => { const known = values.filter(value => value !== null && value !== undefined); return known.length ? median(known) : null; };

/** Compare articles written under one rule with the account's other articles from the same days onward. */
export function experimentEvidence(ruleId, rows = []) {
  const using = rows.filter(row => (row.applied_rule_ids || []).includes(ruleId));
  const first = using.map(row => day(row.published_at)).filter(Boolean).sort()[0] || null;
  const withRows = using.filter(measured);
  const others = first ? rows.filter(row => !(row.applied_rule_ids || []).includes(ruleId) && measured(row) && day(row.published_at) >= first) : [];
  return {rule_id: ruleId, first_day: first, tagged: using.length, n_with: withRows.length, n_without: others.length,
    reads_with: mid(withRows.map(row => row.reads_24h)), reads_without: mid(others.map(row => row.reads_24h)),
    ctr_with: mid(withRows.map(row => row.ctr_24h)), ctr_without: mid(others.map(row => row.ctr_24h)),
    hits_with: withRows.filter(row => row.verdict === '爆').length, needed: EXPERIMENT_SAMPLES, ready: withRows.length >= EXPERIMENT_SAMPLES};
}
/** Rules waiting for a yes or no, and rules on trial, across the given current playbooks, each with live evidence.
 * Reads default a missing status to "candidate", so old rules would all look like new suggestions. Only a rule whose
 * stored status is "candidate" counts as one: pass `explicit` ({playbook id: [rule ids]}) when statuses were defaulted. */
export function experiments(playbooks = [], rows = [], {explicit = null} = {}) {
  const rules = [];
  for (const book of playbooks) for (const rule of book.rules || []) {
    if (!rule || typeof rule.rule_id !== 'string' || rule.overriddenByScope) continue;
    const proposed = explicit ? (explicit[book.id] || []).includes(rule.rule_id) && (rule.status ?? 'candidate') === 'candidate' : rule.status === 'candidate';
    if (rule.status !== 'trial' && !proposed) continue;
    rules.push({...rule, status: rule.status === 'trial' ? 'trial' : 'candidate', live: experimentEvidence(rule.rule_id, rows),
      playbook: {id: book.id, account: book.account, version: book.version, content_hash: book.content_hash}});
  }
  return rules;
}
/** Reads and click rate by title pattern; an article's own pattern wins over the AI label. */
export function patternStats(rows = [], labels = {}) {
  const groups = new Map();
  for (const row of rows) {
    const pattern = row.title_pattern || labels[row.id];
    if (!pattern || !measured(row)) continue;
    if (!groups.has(pattern)) groups.set(pattern, []);
    groups.get(pattern).push(row);
  }
  return [...groups.entries()].map(([pattern, items]) => ({pattern, count: items.length, reads: mid(items.map(row => row.reads_24h)),
    ctr: mid(items.map(row => row.ctr_24h)), hits: items.filter(row => row.verdict === '爆').length}))
    .sort((a, b) => b.count - a.count || (b.reads ?? 0) - (a.reads ?? 0));
}
/** The latest Saturday-to-Friday week that ended at least two days before `today` (Beijing date): a new one each Sunday, with every article a full day old. */
export function weeklyPeriod(today) {
  const at = new Date(today + 'T00:00:00Z'), weekday = at.getUTCDay();
  let back = (weekday - 5 + 7) % 7;
  if (back < 2) back += 7;
  const end = new Date(at.getTime() - back * 86400000), start = new Date(end.getTime() - 6 * 86400000);
  return {start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10)};
}

/** A rule's first sentence, short enough to stand in for its code ("T3") wherever a person reads it. */
export function ruleShortName(text, max = 22) {
  const line = String(text ?? '').split('\n').map(part => part.replace(/[*_`#>]/g, '').replace(/^[\s\-·•\d.、)）]+/, '').trim()).find(Boolean) || '';
  const sentence = line.split(/[。；;！!？?]/)[0].trim();
  return sentence.length > max ? sentence.slice(0, max) + '…' : sentence;
}
/** Rule code → readable name, from the given playbooks. Title patterns are often recorded as bare rule codes. */
export function ruleNames(playbooks = []) {
  const names = new Map();
  for (const book of playbooks) for (const rule of book.rules || []) {
    if (!rule || typeof rule.rule_id !== 'string' || names.has(rule.rule_id)) continue;
    const name = ruleShortName(rule.text);
    if (name && name !== rule.rule_id) names.set(rule.rule_id, name);
  }
  return names;
}
/** "标题先写冲突结果（T3）" for a known code; anything else is returned as written. */
export const namedPattern = (pattern, names) => names?.has(pattern) ? `${names.get(pattern)}（${pattern}）` : pattern;
