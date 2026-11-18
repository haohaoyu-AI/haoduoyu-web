// Match a published Toutiao row back to the draft it came from.
// The published title is not an identity: Haoyu often picks one of four alternates.
// A match needs the platform item id, or the benchmark original together with a known title.

export function normalizeReviewTitle(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}
function sameLink(left, right) {
  if (!left || !right) return false;
  try { return new URL(left).href === new URL(right).href; } catch { return left === right; }
}
function knownTitles(row) {
  const titles = [row?.title, ...(Array.isArray(row?.alternate_titles) ? row.alternate_titles : [])];
  return new Set(titles.map(normalizeReviewTitle).filter(Boolean));
}
function sampleAgrees(row, incoming) {
  const checks = [];
  if (incoming.sample_url && row.sample_url) checks.push(sameLink(incoming.sample_url, row.sample_url));
  if (incoming.sample_title && row.sample_title) checks.push(normalizeReviewTitle(incoming.sample_title) === normalizeReviewTitle(row.sample_title));
  if (incoming.reference_article_id && row.reference_article_id) checks.push(String(incoming.reference_article_id) === String(row.reference_article_id));
  if (!checks.length) return false;
  return checks.every(Boolean);
}

/** @returns {{kind:'id'|'corroborated', row:object}|{kind:'ambiguous', rows:object[], reason:string}|{kind:'none'}} */
export function matchPublishedDraft(articles, incoming) {
  const rows = (Array.isArray(articles) ? articles : []).filter(row => row && (incoming?.account == null || row.account === incoming.account));
  const platformId = typeof incoming?.platform_article_id === 'string' ? incoming.platform_article_id.trim() : '';
  if (platformId) {
    const byId = rows.filter(row => typeof row.platform_article_id === 'string' && row.platform_article_id.trim() === platformId);
    if (byId.length === 1) return {kind:'id', row:byId[0]};
    if (byId.length > 1) return {kind:'ambiguous', rows:byId, reason:'platform_article_id'};
  }
  const title = normalizeReviewTitle(incoming?.title);
  const pending = rows.filter(row => row.publish_status === 'pending');
  const corroborated = title ? pending.filter(row => {
    if (platformId && typeof row.platform_article_id === 'string' && row.platform_article_id.trim() && row.platform_article_id.trim() !== platformId) return false;
    if (!sampleAgrees(row, incoming || {})) return false;
    return knownTitles(row).has(title);
  }) : [];
  if (corroborated.length === 1) return {kind:'corroborated', row:corroborated[0]};
  if (corroborated.length > 1) return {kind:'ambiguous', rows:corroborated, reason:'sample_and_titles'};
  return {kind:'none'};
}

/** null and the explicit published value are already-published rows. Pending and unmatched stay out of read/CTR totals. */
export function reviewPublishState(row) {
  if (row?.publish_status === 'pending') return 'pending';
  if (row?.publish_status === 'unmatched') return 'unmatched';
  return 'published';
}
export function reviewPublishLabel(row) {
  return {pending:'待发布', published:'已发布', unmatched:'未能对上'}[reviewPublishState(row)];
}
