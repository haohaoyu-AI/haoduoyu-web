import { api } from "./api.mjs";
import { runtime, state } from "./state.mjs";
import { articleIndexes } from "./session-index-state.mjs";
const ledgerStatuses = ["drafting", "illustrated", "draft_saved", "published", "failed"];
const ledgerWriters = ["dedao", "gemini_web", "human", "other"];
const ledgerLimits = { pageSize: 200, maxRequests: 20, maxRows: 2000 };
function ledgerReadError() {
  return Object.assign(new Error("文章台账读取未完成，请重新加载。"), { code: "LEDGER_INCOMPLETE" });
}
function summarizeArticleLedger(rows) {
  if (!Array.isArray(rows)) throw ledgerReadError();
  const counts = Object.fromEntries(ledgerStatuses.map((status) => [status, 0]));
  const writers = [...ledgerWriters, "unknown"].map((writer) => ({ writer, unpublished: 0, published: 0, total: 0 }));
  for (const row of rows) {
    if (!row || !ledgerStatuses.includes(row.status)) throw ledgerReadError();
    counts[row.status]++;
    const writer = writers.find((item) => item.writer === (ledgerWriters.includes(row.writer) ? row.writer : "unknown"));
    writer[row.status === "published" ? "published" : "unpublished"]++;
    writer.total++;
  }
  return { verified: true, total: rows.length, unpublished: rows.length - counts.published, published: counts.published,
    draft_saved: counts.draft_saved, counts, writers: writers.filter((writer) => writer.total > 0), consistency: "paged_not_atomic" };
}
function validateLedgerPage(payload, status, accountId, page, expectedTotal, seen) {
  const rows = payload?.data, meta = payload?.meta, offset = (page - 1) * ledgerLimits.pageSize;
  if (!Array.isArray(rows) || !meta || !Number.isSafeInteger(meta.total) || meta.total < 0 || meta.total > ledgerLimits.maxRows ||
    meta.page !== page || meta.page_size !== ledgerLimits.pageSize || meta.offset !== offset || typeof meta.has_more !== "boolean" ||
    expectedTotal !== undefined && expectedTotal !== meta.total || rows.length > ledgerLimits.pageSize ||
    rows.length !== Math.min(ledgerLimits.pageSize, Math.max(0, meta.total - offset)) ||
    meta.has_more !== (offset + rows.length < meta.total)) throw ledgerReadError();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id || row.status !== status || typeof row.account_id !== "string" ||
      accountId && row.account_id !== accountId || seen.has(row.id)) throw ledgerReadError();
    seen.add(row.id);
  }
  return { rows, meta };
}
async function loadArticleLedgerSummary(context, { accountId = "", request = api } = {}) {
  const rows = [], seen = new Set();
  let requests = 0;
  for (const status of ledgerStatuses) {
    let total;
    for (let page = 1; ; page++) {
      if (++requests > ledgerLimits.maxRequests) throw ledgerReadError();
      const query = new URLSearchParams({ status, page: String(page), page_size: String(ledgerLimits.pageSize) });
      if (accountId) query.set("account_id", accountId);
      const payload = await request(`/articles?${query}`, { envelope: true, context });
      const result = validateLedgerPage(payload, status, accountId, page, total, seen);
      if (rows.length + result.rows.length > ledgerLimits.maxRows) throw ledgerReadError();
      total = result.meta.total;
      rows.push(...result.rows);
      if (!result.meta.has_more) break;
    }
  }
  return { ...summarizeArticleLedger(rows), requests };
}
const catalogLimits = { maxInventory: 4000, maxRequests: 100 };
const catalogCachePrefix = "catalog:", catalogCacheTtl = 10000, catalogCacheSize = 8;
function catalogCacheKey(accountId, allowed) {
  return catalogCachePrefix + JSON.stringify([runtime.sessionEpoch, runtime.articleIndexGeneration, state.me?.id ?? null,
    allowed === null ? null : [...allowed].sort(), accountId]);
}
function catalogCacheEntries() {
  return [...articleIndexes].filter(([key, value]) => typeof key === "string" && key.startsWith(catalogCachePrefix) &&
    value?.kind === "article-catalog");
}
function sweepCatalogCache(now) {
  for (const [key, value] of catalogCacheEntries()) if (value.expiresAt <= now) articleIndexes.delete(key);
}
function readCatalogCache(key, reader) {
  reader.active();
  sweepCatalogCache(Date.now());
  const entry = articleIndexes.get(key);
  return entry?.kind === "article-catalog" ? entry.catalog : null;
}
function writeCatalogCache(key, catalog, reader) {
  reader.active();
  const now = Date.now();
  sweepCatalogCache(now);
  articleIndexes.set(key, { kind: "article-catalog", expiresAt: now + catalogCacheTtl, catalog });
  const entries = catalogCacheEntries();
  for (let index = 0; index < entries.length - catalogCacheSize; index++) articleIndexes.delete(entries[index][0]);
}
function catalogReader(context, request) {
  const identity = state.me?.id, epoch = runtime.sessionEpoch, generation = runtime.articleIndexGeneration;
  let requests = 0;
  function active() {
    if (context?.controller?.signal?.aborted || identity !== state.me?.id || epoch !== runtime.sessionEpoch ||
      generation !== runtime.articleIndexGeneration) throw new DOMException("文章目录请求已失效", "AbortError");
  }
  return { get requests() { return requests; }, active, async read(path, envelope = false) {
    active();
    if (requests >= catalogLimits.maxRequests) throw ledgerReadError();
    requests++;
    let result;
    try { result = await request(path, { envelope, context }); } catch (error) { active(); throw error; }
    active();
    return result;
  } };
}
function catalogSummary(rows) {
  const counts = Object.fromEntries([...ledgerStatuses, "unknown"].map((status) => [status, 0]));
  const writers = [...ledgerWriters, "unknown"].map((writer) => ({ writer, unpublished: 0, published: 0, total: 0 }));
  for (const row of rows) {
    counts[ledgerStatuses.includes(row.status) ? row.status : "unknown"]++;
    const writer = writers.find((item) => item.writer === (ledgerWriters.includes(row.writer) ? row.writer : "unknown"));
    writer[row.status === "published" ? "published" : "unpublished"]++;
    writer.total++;
  }
  return { verified: true, total: rows.length, unpublished: rows.length - counts.published, published: counts.published,
    draft_saved: counts.draft_saved, counts, writers: writers.filter((writer) => writer.total > 0), consistency: "paged_not_atomic" };
}
function catalogScope(accountId, allowedAccountIds) {
  if (typeof accountId !== "string" || allowedAccountIds !== undefined &&
    !(Array.isArray(allowedAccountIds) || allowedAccountIds instanceof Set)) throw ledgerReadError();
  const allowed = allowedAccountIds === undefined ? null : new Set(allowedAccountIds);
  if (allowed && ([...allowed].some((id) => typeof id !== "string" || !id) || accountId && !allowed.has(accountId))) {
    throw ledgerReadError();
  }
  return allowed;
}
function catalogInventory(value, accountId, allowed) {
  const rows = value?.rows, seen = new Set();
  if (value?.complete !== true || !Array.isArray(rows) || rows.length > catalogLimits.maxInventory ||
    value.total !== rows.length || !value.counts) throw ledgerReadError();
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id || typeof row.account_id !== "string" || !row.account_id ||
      !Object.hasOwn(row, "status") || row.status !== null && typeof row.status !== "string" || seen.has(row.id) ||
      allowed && !allowed.has(row.account_id)) throw ledgerReadError();
    seen.add(row.id);
  }
  const counts = catalogSummary(rows).counts;
  if (Object.keys(counts).some((key) => value.counts[key] !== counts[key])) throw ledgerReadError();
  const scoped = rows.filter((row) => !accountId || row.account_id === accountId);
  if (scoped.length > ledgerLimits.maxRows) throw ledgerReadError();
  return scoped;
}
async function catalogKnownRows(reader, inventory, accountId) {
  const expected = new Map(inventory.map((row) => [row.id, row])), rows = [], seen = new Set();
  const counts = catalogSummary(inventory).counts;
  const pages = ledgerStatuses.reduce((total, status) => total + Math.max(1, Math.ceil(counts[status] / ledgerLimits.pageSize)), 0);
  if (pages > ledgerLimits.maxRequests || 1 + pages + counts.unknown > catalogLimits.maxRequests) throw ledgerReadError();
  for (const status of ledgerStatuses) {
    for (let page = 1; ; page++) {
      const query = new URLSearchParams({ status, page: String(page), page_size: String(ledgerLimits.pageSize) });
      if (accountId) query.set("account_id", accountId);
      const payload = await reader.read(`/articles?${query}`, true);
      const result = validateLedgerPage(payload, status, accountId, page, counts[status], seen);
      for (const row of result.rows) {
        const original = expected.get(row.id);
        if (!original || original.account_id !== row.account_id || original.status !== row.status) throw ledgerReadError();
      }
      rows.push(...result.rows);
      if (!result.meta.has_more) break;
    }
  }
  return { rows, seen, expected };
}
async function catalogCompleteRows(reader, inventory, accountId) {
  const { rows, seen, expected } = await catalogKnownRows(reader, inventory, accountId);
  for (const original of inventory.filter((row) => !ledgerStatuses.includes(row.status))) {
    const row = await reader.read(`/articles/${encodeURIComponent(original.id)}`);
    if (!row || row.id !== original.id || row.account_id !== original.account_id || row.status !== original.status ||
      seen.has(row.id)) throw ledgerReadError();
    seen.add(row.id);
    rows.push(row);
  }
  if (seen.size !== expected.size || [...expected.keys()].some((id) => !seen.has(id))) throw ledgerReadError();
  return rows;
}
function catalogReconciliation(rows, counts) {
  const dates = new Map(), numbers = new Map(), insurance = rows.filter((row) => row.slot === "gzh");
  for (const row of rows) {
    const date = row.run_date ?? null, key = date ?? "unknown";
    dates.set(key, { date, count: (dates.get(key)?.count ?? 0) + 1 });
  }
  for (const row of insurance) if (Number.isSafeInteger(row.series_no) && row.series_no > 0) {
    const entries = numbers.get(row.series_no) || [];
    entries.push(row.id);
    numbers.set(row.series_no, entries);
  }
  const ordered = [...numbers.keys()].sort((a, b) => a - b), gap_ranges = [];
  for (let index = 1; index < ordered.length; index++) if (ordered[index] > ordered[index - 1] + 1) {
    gap_ranges.push({ from: ordered[index - 1] + 1, to: ordered[index] - 1 });
  }
  return { complete: true, total: rows.length, counts, rows,
    dates: [...dates.values()].sort((a, b) => (a.date ?? "z").localeCompare(b.date ?? "z")),
    schedule: { configured: false, expected: null, missing: null, overdue: null },
    insurance: { basis: "explicit_gzh_slot", recorded: insurance.length, numbered: insurance.filter((row) => row.series_no != null).length,
      unique_count: ordered.length, highest: ordered.at(-1) ?? null, lowest: ordered[0] ?? null,
      duplicate_numbers: ordered.filter((number) => numbers.get(number).length > 1)
        .map((number) => ({ number, article_ids: numbers.get(number) })),
      observed_gap_ranges: gap_ranges, start: null, target: null, sample_mapping: "unknown", counts: catalogSummary(insurance).counts } };
}
function catalogFilterError() {
  return Object.assign(new Error("文章筛选条件无效，请重新选择。"), { code: "VALIDATION_ERROR" });
}
function catalogDate(value, end = false) {
  if (typeof value !== "string") throw catalogFilterError();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value), date = value.slice(0, 10);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date + "T00:00:00Z")) &&
    new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date;
  const clock = value.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/), offset = value.match(/[+-](\d{2}):(\d{2})$/);
  if (!validDay || !day && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    Number(clock?.[1]) > 23 || Number(clock?.[2]) > 59 || Number(clock?.[3] || 0) > 59 ||
    offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59))) throw catalogFilterError();
  const stamp = Date.parse(day ? value + "T00:00:00+08:00" : value);
  if (!Number.isFinite(stamp)) throw catalogFilterError();
  return { value: new Date(stamp + (day && end ? 86400000 : 0)).toISOString(), exclusive: day && end };
}
function catalogFilters(filters) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw catalogFilterError();
  const values = filters instanceof URLSearchParams ? Object.fromEntries(filters) : { ...filters };
  const choices = { status: ["all", "unknown", ...ledgerStatuses], platform: ["toutiao", "zhihu", "wechat", "other"],
    mode: ["manual", "automatic", "mixed", "unknown"], topic: ["entertainment", "insurance", "unknown"],
    data_status: ["no_snapshot", "missing_reads", "missing_likes", "missing_comments", "incomplete", "zero_reads", "date_unverified"],
    slot: ["zh1", "zh2", "tt1", "tt2", "zh3", "tt3", "gzh"], writer: ledgerWriters,
    sort: ["published_at", "reads", "likes", "comments", "approvals", "latest_as_of", "duration"], order: ["asc", "desc"] };
  for (const [key, options] of Object.entries(choices)) if (values[key] && !options.includes(values[key])) throw catalogFilterError();
  for (const key of ["has_warnings", "has_pending_verify"]) if (values[key] !== undefined && values[key] !== "") {
    if (!["true", "false"].includes(values[key])) throw catalogFilterError();
  }
  for (const key of ["series_no_min", "series_no_max"]) if (values[key] !== undefined && values[key] !== "") {
    if (!/^\d+$/.test(String(values[key])) || !Number.isSafeInteger(Number(values[key])) || Number(values[key]) < 1) throw catalogFilterError();
    values[key] = Number(values[key]);
  }
  if (values.series_no_min && values.series_no_max && values.series_no_min > values.series_no_max) throw catalogFilterError();
  if (values.q) {
    if (typeof values.q !== "string" || values.q.length > 300 || !values.q.trim() ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(values.q)) throw catalogFilterError();
    values.q = values.q.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(values.from || "") && /^\d{4}-\d{2}-\d{2}$/.test(values.to || "") &&
    values.from > values.to) throw catalogFilterError();
  values.from = values.from ? catalogDate(values.from) : null;
  values.to = values.to ? catalogDate(values.to, true) : null;
  if (values.from && values.to && values.from.value > values.to.value) throw catalogFilterError();
  return values;
}
function catalogMatches(row, filters) {
  if (filters.status && filters.status !== "all" &&
    (filters.status === "unknown" ? ledgerStatuses.includes(row.status) : row.status !== filters.status)) return false;
  for (const [key, field] of [["platform", "platform"], ["mode", "production_mode"], ["topic", "topic"], ["slot", "slot"], ["writer", "writer"]]) {
    if (filters[key] && row[field] !== filters[key]) return false;
  }
  if (filters.q && ![row.title, row.url, row.summary, row.notes].some((value) => typeof value === "string" &&
    value.replace(/[A-Z]/g, (letter) => letter.toLowerCase()).includes(filters.q))) return false;
  if (filters.from && (row.published_at == null || row.published_at < filters.from.value)) return false;
  if (filters.to && (row.published_at == null || (filters.to.exclusive ? row.published_at >= filters.to.value :
    row.published_at > filters.to.value))) return false;
  if (filters.series_no_min && (row.series_no == null || row.series_no < filters.series_no_min) ||
    filters.series_no_max && (row.series_no == null || row.series_no > filters.series_no_max)) return false;
  if (filters.has_warnings && (Array.isArray(row.warnings) && row.warnings.length > 0) !== (filters.has_warnings === "true")) return false;
  if (filters.has_pending_verify && row.has_pending_verify !== (filters.has_pending_verify === "true")) return false;
  return catalogDataStatus(row, filters.data_status);
}
function catalogDataStatus(row, status) {
  if (!status) return true;
  if (status === "no_snapshot") return row.snapshot_status === "not_collected";
  if (status === "date_unverified") return row.date_status === "unverified";
  if (status === "zero_reads") return row.latest_metrics?.reads === 0;
  const missing = Array.isArray(row.missing_metrics) ? row.missing_metrics : [];
  return status === "incomplete" ? ["reads", "likes", "comments"].some((key) => missing.includes(key)) : missing.includes(status.slice(8));
}
function catalogCompare(filters) {
  const sort = filters.sort || "published_at", direction = filters.order === "asc" ? 1 : -1;
  const value = (row) => ["reads", "likes", "comments", "approvals"].includes(sort) ? row.latest_metrics?.[sort] ?? null :
    sort === "duration" ? row.duration_seconds ?? null : sort === "latest_as_of" ? row.latest_as_of ?? null : row.published_at ?? null;
  return (a, b) => {
    const left = value(a), right = value(b), publicationA = a.published_at ?? null, publicationB = b.published_at ?? null;
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    const difference = left === right ? 0 : left > right ? 1 : -1;
    if (difference) return direction * difference;
    if (publicationA === null && publicationB !== null) return 1;
    if (publicationB === null && publicationA !== null) return -1;
    return String(publicationB ?? "").localeCompare(String(publicationA ?? "")) || a.id.localeCompare(b.id);
  };
}
async function loadArticleCatalog(context, { accountId = "", filters = {}, request = api, allowedAccountIds } = {}) {
  const allowed = catalogScope(accountId, allowedAccountIds), selected = catalogFilters(filters), reader = catalogReader(context, request);
  reader.active();
  const key = request === api ? catalogCacheKey(accountId, allowed) : null;
  let catalog = key ? readCatalogCache(key, reader) : null;
  if (!catalog) {
    const inventory = catalogInventory(await reader.read("/article-reconciliation"), accountId, allowed);
    const rows = await catalogCompleteRows(reader, inventory, accountId), summary = catalogSummary(rows);
    reader.active();
    catalog = { data: rows, meta: { total: rows.length, unfiltered_total: rows.length }, complete: true,
      summary, reconciliation: catalogReconciliation(inventory, summary.counts) };
    if (key) writeCatalogCache(key, catalog, reader);
  }
  const data = catalog.data.filter((row) => catalogMatches(row, selected)).sort(catalogCompare(selected));
  reader.active();
  return { ...catalog, data, meta: { ...catalog.meta, total: data.length }, requests: reader.requests };
}
function paginateArticleCatalog(catalog, { page = 1, pageSize = 20 } = {}) {
  if (catalog?.complete !== true || !Array.isArray(catalog.data) || catalog.meta?.total !== catalog.data.length) throw ledgerReadError();
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 200) throw catalogFilterError();
  const current = Math.min(page, Math.max(1, Math.ceil(catalog.data.length / pageSize))), offset = (current - 1) * pageSize;
  return { ...catalog, data: catalog.data.slice(offset, offset + pageSize), meta: { ...catalog.meta, page: current,
    page_size: pageSize, offset, has_more: offset + pageSize < catalog.data.length, pagination: "client" } };
}
export { ledgerLimits, ledgerStatuses, loadArticleLedgerSummary, summarizeArticleLedger, loadArticleCatalog, paginateArticleCatalog };
