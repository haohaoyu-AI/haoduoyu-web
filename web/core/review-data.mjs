// Content-review calculations deliberately use recorded snapshots. Missing values
// remain null, and coverage accompanies aggregates so partial totals can be shown.
const SNAPSHOT_NUMBERS = ["impressions", "fan_impressions", "reads", "fan_reads", "ctr", "completion_rate", "avg_read_seconds", "likes", "comments", "reposts", "shares", "favorites", "revenue"];
const SNAPSHOT_JSON = ["traffic_sources", "completion_curve", "audience"];
const SUM_FIELDS = ["impressions", "fan_impressions", "reads", "fan_reads", "likes", "comments", "reposts", "shares", "favorites", "revenue"];
const AVG_FIELDS = ["ctr", "completion_rate", "avg_read_seconds"];

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

export function finiteNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function calendarDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const stamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? date : "";
}

const shanghaiClock = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
function shanghaiParts(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !calendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59 ||
    (match[6] !== "Z" && (Number(match[6].slice(1, 3)) > 23 || Number(match[6].slice(4, 6)) > 59))) return null;
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return null;
  return Object.fromEntries(shanghaiClock.formatToParts(stamp).map(part => [part.type, part.value]));
}

/** A calendar date stays a date; an explicit instant is assigned to its Shanghai day. */
export function day(value) {
  if (typeof value !== "string") return "";
  if (calendarDate(value)) return value;
  const parts = shanghaiParts(value);
  return parts ? calendarDate(`${parts.year.padStart(4, "0")}-${parts.month}-${parts.day}`) : "";
}

/** Do not invent midnight when the source only provides a date. */
export function reviewDateTime(value) {
  if (typeof value !== "string") return "";
  if (calendarDate(value)) return value;
  const parts = shanghaiParts(value), date = day(value);
  return parts && date ? `${date} ${parts.hour}:${parts.minute}` : "";
}

export function shiftDay(value, amount) {
  const date = day(value);
  if (!date || !Number.isFinite(amount)) return "";
  return new Date(Date.parse(`${date}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
}

function list(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function rules(value) {
  return list(parseJson(value, [])).filter(rule => rule && typeof rule === "object" && typeof rule.rule_id === "string");
}

export function normalizeReviewData(input = {}) {
  return {
    articles: list(input.articles).filter(Boolean).map(article => ({ ...article, image_count: finiteNumber(article.image_count) })),
    snapshots: list(input.snapshots).filter(Boolean).map(snapshot => {
      const normalized = { ...snapshot };
      for (const field of SNAPSHOT_NUMBERS) normalized[field] = finiteNumber(snapshot[field]);
      for (const field of SNAPSHOT_JSON) normalized[field] = parseJson(snapshot[field]);
      return normalized;
    }),
    reports: list(input.reports).filter(Boolean).map(report => ({
      ...report,
      verdicts: object(parseJson(report.verdicts, {})),
      findings: object(parseJson(report.findings, {})),
      metrics: object(parseJson(report.metrics, {})),
    })),
    playbooks: list(input.playbooks).filter(Boolean).map(playbook => ({ ...playbook, rules: rules(playbook.rules) })),
  };
}

/** Last recorded snapshot on or before cutoff, keyed by article_id. */
export function latestSnapshots(snapshots = [], cutoff = "9999-12-31") {
  const result = new Map();
  for (const snapshot of list(snapshots)) {
    const date = day(snapshot.snapshot_date);
    if (!date || date > cutoff || snapshot.article_id === null || snapshot.article_id === undefined) continue;
    const key = String(snapshot.article_id);
    const previous = result.get(key);
    // ISO dates order consistently; id is a deterministic tie-breaker only.
    if (!previous || date > day(previous.snapshot_date) ||
      (date === day(previous.snapshot_date) && String(snapshot.id || "") > String(previous.id || ""))) result.set(key, snapshot);
  }
  return result;
}

/** Most recent explicit verdict up to end; no verdict is inferred from metrics. */
export function verdictMap(reports = [], { end = "9999-12-31", periodType } = {}) {
  const result = new Map();
  const ordered = list(reports).filter(report => (!periodType || report.period_type === periodType) &&
    day(report.period_end) && day(report.period_end) <= end).sort((a, b) =>
    day(a.period_end).localeCompare(day(b.period_end)) || String(a.id || "").localeCompare(String(b.id || "")));
  for (const report of ordered) {
    for (const [id, raw] of Object.entries(object(parseJson(report.verdicts, {})))) {
      const entry = typeof raw === "string" ? { verdict: raw } : object(raw);
      if (!["爆", "中", "扑"].includes(entry.verdict)) continue;
      result.set(String(id), { verdict: entry.verdict, reason: typeof entry.reason === "string" ? entry.reason : "", report_id: report.id });
    }
  }
  return result;
}

/** Article publication cohort, enriched with the latest snapshot as of end. */
export function articleRows(data = {}, { start = "", end = "9999-12-31", periodType } = {}) {
  const snapshots = latestSnapshots(data.snapshots, end);
  const verdicts = verdictMap(data.reports, { end, periodType });
  return list(data.articles).filter(article => {
    const published = day(article.published_at);
    return published && (!start || published >= start) && published <= end;
  }).map(article => ({ ...article, snapshot: snapshots.get(String(article.id)) || null,
    verdict: verdicts.get(String(article.id))?.verdict || "", reason: verdicts.get(String(article.id))?.reason || "" }))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)) || String(a.id).localeCompare(String(b.id)));
}

export function aggregate(rows = []) {
  const result = { count: rows.length, hits: 0, flops: 0, judged_count: 0, hit_rate: null, coverage: {}, partial: {} };
  for (const field of [...SUM_FIELDS, ...AVG_FIELDS]) {
    const values = rows.map(row => finiteNumber(row.snapshot?.[field])).filter(value => value !== null);
    result.coverage[field] = values.length;
    result.partial[field] = values.length > 0 && values.length < rows.length;
    result[field] = values.length ? values.reduce((sum, value) => sum + value, 0) / (AVG_FIELDS.includes(field) ? values.length : 1) : null;
  }
  for (const row of rows) {
    if (["爆", "中", "扑"].includes(row.verdict)) result.judged_count += 1;
    if (row.verdict === "爆") result.hits += 1;
    if (row.verdict === "扑") result.flops += 1;
  }
  // No recorded verdicts means there is no evidence for a zero hit/flop count.
  if (!result.judged_count) { result.hits = null; result.flops = null; }
  else result.hit_rate = result.hits / result.judged_count * 100;
  result.coverage.verdict = result.judged_count;
  result.partial.verdict = result.judged_count > 0 && result.judged_count < rows.length;
  return result;
}

export function compareMetrics(current = {}, previous = {}) {
  const result = {};
  for (const field of ["count", ...SUM_FIELDS, ...AVG_FIELDS, "hits", "flops", "hit_rate", "published_count", "total_reads", "average_ctr", "recent_hits"]) {
    const now = finiteNumber(current[field]);
    const before = finiteNumber(previous[field]);
    result[field] = { current: now, previous: before, delta: now !== null && before !== null ? now - before : null,
      percent: now !== null && before !== null && before !== 0 ? (now - before) / Math.abs(before) * 100 : null };
  }
  return result;
}

export function periodSummary(data, { start, end, periodType } = {}) {
  const duration = day(start) && day(end) ? Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1 : 0;
  const previousEnd = duration > 0 ? shiftDay(start, -1) : "";
  const previousStart = duration > 0 ? shiftDay(start, -duration) : "";
  const rows = articleRows(data, { start, end, periodType });
  const previousRows = duration > 0 ? articleRows(data, { start: previousStart, end: previousEnd, periodType }) : [];
  const current = aggregate(rows), previous = aggregate(previousRows);
  return { start, end, previousStart, previousEnd, rows, previousRows, current, previous, changes: compareMetrics(current, previous) };
}

export function dailySummary(data, date) {
  const previousDate = shiftDay(date, -1);
  const result = periodSummary(data, { start: date, end: date, periodType: "daily" });
  const recentRows = articleRows(data, { start: shiftDay(date, -2), end: date });
  const previousRecentRows = articleRows(data, { start: shiftDay(date, -3), end: previousDate });
  const recent = aggregate(recentRows), previousRecent = aggregate(previousRecentRows);
  const stats = { published_count: result.current.count, total_reads: result.current.reads, average_ctr: result.current.ctr, recent_hits: recent.hits };
  const previousStats = { published_count: result.previous.count, total_reads: result.previous.reads, average_ctr: result.previous.ctr, recent_hits: previousRecent.hits };
  return { ...result, date, previousDate, recentRows, stats, previousStats, statChanges: compareMetrics(stats, previousStats) };
}

export function groupPerformance(rows = [], field = "topic_category") {
  const groups = new Map();
  for (const row of rows) {
    const key = typeof row[field] === "string" && row[field].trim() ? row[field] : "未分类";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([name, members]) => {
    const summary = aggregate(members);
    return { name, ...summary, average_reads: summary.coverage.reads ? summary.reads / summary.coverage.reads : null, rows: members };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Daily recorded snapshot totals, rather than guessed values for missing days. */
export function dailySeries(data = {}, { start = "", end = "9999-12-31" } = {}) {
  const dates = [...new Set(list(data.snapshots).map(snapshot => day(snapshot.snapshot_date)).filter(date => date && date >= start && date <= end))].sort();
  const articles = new Map(list(data.articles).map(article => [String(article.id), article]));
  return dates.map(date => {
    const sameDay = list(data.snapshots).filter(snapshot => day(snapshot.snapshot_date) === date);
    const snapshots = latestSnapshots(sameDay, date);
    const rows = [...snapshots.entries()].filter(([id]) => articles.has(id)).map(([id, snapshot]) => ({ ...articles.get(id), snapshot }));
    return { date, ...aggregate(rows) };
  });
}

/** Compare stable rule IDs so edits are explicit deletions and additions. */
export function diffRules(previous, current) {
  const before = new Map(rules(previous?.rules ?? previous).map(rule => [rule.rule_id, rule]));
  const after = new Map(rules(current?.rules ?? current).map(rule => [rule.rule_id, rule]));
  const added = [], removed = [], unchanged = [], changed = [];
  for (const [id, rule] of before) {
    const next = after.get(id);
    if (!next) removed.push(rule);
    else if (String(rule.text || "") !== String(next.text || "") || String(rule.section || "") !== String(next.section || "")) {
      removed.push(rule); added.push(next); changed.push({ before: rule, after: next });
    } else unchanged.push(next);
  }
  for (const [id, rule] of after) if (!before.has(id)) added.push(rule);
  return { added, removed, unchanged, changed };
}

export function metricDiscrepancies(report = {}, computed = {}) {
  const metrics = object(parseJson(report.metrics, {}));
  const aliases = { total_reads: "reads", average_ctr: "ctr", avg_ctr: "ctr", total_impressions: "impressions", average_completion_rate: "completion_rate", avg_completion_rate: "completion_rate", total_revenue: "revenue", article_count: "count", published_count: "count", hit_count: "hits", flop_count: "flops" };
  return Object.entries(metrics).map(([key, value]) => {
    const field = aliases[key] || key;
    const authorValue = finiteNumber(value), calculated = finiteNumber(computed[field]);
    const comparable = authorValue !== null && calculated !== null;
    return { key, field, authorValue, computedValue: calculated, comparable,
      mismatch: comparable ? Math.abs(authorValue - calculated) > Math.max(0.005, Math.abs(calculated) * 0.000001) : false,
      partial: Boolean(computed.partial?.[field]) };
  });
}

/** Available actual report periods; snapshot dates only fill otherwise empty lists. */
export function periodsFor(data = {}, type = "daily") {
  const periods = new Map();
  for (const report of list(data.reports)) {
    if (report.period_type !== type) continue;
    const start = day(report.period_start), end = day(report.period_end);
    if (!start || !end || start > end) continue;
    periods.set(`${start}/${end}`, { start, end, label: start === end ? end : `${start} — ${end}`, report });
  }
  if (!periods.size) {
    const dates = [...new Set([...list(data.snapshots).map(snapshot => day(snapshot.snapshot_date)), ...list(data.articles).map(article => day(article.published_at))].filter(Boolean))].sort().reverse();
    const duration = type === "weekly" ? 7 : type === "three_day" ? 3 : 1;
    for (const end of dates) {
      const start = shiftDay(end, -(duration - 1));
      periods.set(`${start}/${end}`, { start, end, label: start === end ? end : `${start} — ${end}`, report: null });
    }
  }
  return [...periods.values()].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
}
