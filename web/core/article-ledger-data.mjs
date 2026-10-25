import { api } from "./api.mjs";
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
export { ledgerLimits, ledgerStatuses, loadArticleLedgerSummary, summarizeArticleLedger };
