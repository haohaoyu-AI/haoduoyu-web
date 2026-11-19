import {similarCoverFingerprints} from './review-cover-fingerprint.mjs';

const platformFor = row => row?.platform ?? 'toutiao';
const textId = value => typeof value === 'string' ? value.trim() : '';
const bodyLimit = 16_000;
const listLimit = 16;
const shingleLength = 8;
const officialToutiaoHosts = new Set(['toutiao.com', 'www.toutiao.com', 'm.toutiao.com']);

function webUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url;
  } catch { /* ignore invalid legacy input */ }
  return null;
}

export function platformArticleId(row) {
  const canonical = textId(row?.platform_article_id);
  if (canonical) return canonical;
  const reference = row?.draft_ref ?? row?.match_evidence?.draft_ref;
  const platform = platformFor(row);
  if (platform === 'toutiao') {
    const draftId = textId(reference?.pgc_id);
    if (draftId) return draftId;
    const url = webUrl(row?.url);
    if (url && officialToutiaoHosts.has(url.hostname)) {
      return url.pathname.match(/^\/(?:article\/|i)(\d+)\/?$/u)?.[1] ?? '';
    }
  }
  return platform === 'wechat' ? textId(reference?.appmsgid) : '';
}

function normalizedTitle(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function normalizedContent(value) {
  return normalizedTitle(value).replace(/[^\p{L}\p{N}]/gu, '');
}

function corroboratingTitle(row, incoming) {
  const title = normalizedTitle(incoming.title);
  const alternatives = Array.isArray(row.alternate_titles) ? row.alternate_titles : [];
  return Boolean(title) && [row.title, ...alternatives].some(value => normalizedTitle(value) === title);
}

function setOf(values, normalize) {
  return new Set((Array.isArray(values) ? values.slice(0, listLimit) : [])
    .filter(value => typeof value === 'string').map(normalize).filter(Boolean));
}

function intersection(left, right) {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const value of small) if (large.has(value)) shared++;
  return shared;
}

const sourceHeading = /^(?:参考资料|资料来源|信息来源|参考来源|参考文献|来源说明|本文参考|sources|references)$/iu;
const urlsInText = /https?:\/\/[^\s<>()[\]"'，。；！？、）】]+/giu;

function canonicalSource(value) {
  const url = webUrl(value);
  if (!url) return '';
  url.hash = '';
  for (const name of [...url.searchParams.keys()]) {
    if (/^utm_/iu.test(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  return url.href;
}

function sourceLinks(evidence, sourceLines) {
  const supplied = Array.isArray(evidence.source_urls) ? evidence.source_urls : [];
  const links = setOf(supplied, canonicalSource);
  for (const line of sourceLines) {
    for (const url of line.matchAll(urlsInText)) {
      if (links.size >= listLimit) return links;
      const canonical = canonicalSource(url[0]);
      if (canonical) links.add(canonical);
    }
  }
  return links;
}

function textShingles(value) {
  const shingles = new Set();
  for (let i = 0; i + shingleLength <= value.length; i++) shingles.add(value.slice(i, i + shingleLength));
  return shingles;
}

function bodyPassages(lines) {
  const paragraphs = new Set(lines.map(line => normalizedContent(line
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(urlsInText, '')
    .replace(/<[^>]*>/gu, ''))).filter(line => line.length >= 24));
  const passages = [...paragraphs].map(textShingles);
  return {passages, shingles:new Set(passages.flatMap(passage => [...passage]))};
}

function matchingPassages(body, other) {
  return body.passages.filter(passage => intersection(passage, other.shingles) / passage.size >= 0.64).length;
}

function bodyAgreement(left, right) {
  const size = Math.min(left.shingles.size, right.shingles.size);
  if (size < 40) return {strong:false, conflicts:false};
  const overlap = intersection(left.shingles, right.shingles) / Math.max(left.shingles.size, right.shingles.size);
  const distinctPassages = Math.min(matchingPassages(left, right), matchingPassages(right, left));
  return {strong:(distinctPassages >= 2 && overlap >= 0.52) || (size >= 110 && overlap >= 0.88), conflicts:overlap < 0.34};
}

const quantity = /\d+(?:\.\d+)?\s*(?:%|倍|平方米|平米|平|(?:万亿|亿|万)?(?:美元|亿元|万元|元|人|名|家|台|套|件|根|辆|吨|次|年|个月|份|项|公里|米|小时|分钟|秒)|万亿|亿|万)/gu;
const groupedDigits = /(?<=\d)[,，](?=\d{3}(?!\d))/gu;

function normalizedQuantity(value) {
  return normalizedTitle(value).replace(groupedDigits, '').replace(/\s+/gu, '').replace(/(?:平米|平)$/u, '平方米');
}

function numericFacts(explicit, body) {
  const numbers = new Set(explicit);
  for (const match of body.normalize('NFKC').replace(groupedDigits, '').matchAll(quantity)) {
    if (numbers.size >= listLimit) break;
    if (!/^20\d{2}年$/u.test(match[0])) numbers.add(normalizedQuantity(match[0]));
  }
  return numbers;
}

function evidenceFor(row) {
  const evidence = row?.match_evidence ?? {};
  const body = typeof evidence.body === 'string' ? evidence.body.slice(0, bodyLimit) : '';
  const lines = body.split(/\r?\n/u);
  const footer = lines.findLastIndex(line => sourceHeading.test(normalizedContent(line)));
  const bodyLines = footer < 0 ? lines : lines.slice(0, footer);
  const sourceLines = footer < 0 ? lines.slice(Math.max(0, lines.length - 8)) : lines.slice(footer + 1);
  const explicitNumbers = setOf(evidence.numbers, value => /\d/u.test(value.normalize('NFKC')) ? normalizedQuantity(value) : '');
  return {
    body:bodyPassages(bodyLines),
    sources:sourceLinks(evidence, sourceLines),
    cover:evidence.cover_fingerprint,
    people:setOf(evidence.people, normalizedContent),
    events:setOf(evidence.events, normalizedContent),
    numbers:numericFacts(explicitNumbers, bodyLines.join('\n')),
    explicitNumbers,
  };
}

function contentCorroboration(left, right) {
  const body = bodyAgreement(left.body, right.body);
  if (body.conflicts) return null;
  if (left.explicitNumbers.size && right.explicitNumbers.size && !intersection(left.explicitNumbers, right.explicitNumbers)) return null;
  const sources = intersection(left.sources, right.sources);
  const numbers = intersection(left.numbers, right.numbers);
  const personOrEvent = intersection(left.people, right.people) > 0 || intersection(left.events, right.events) > 0;
  const facts = numbers > 0 && personOrEvent;
  const cover = similarCoverFingerprints(left.cover, right.cover);
  const rightSources = [...right.sources];
  const orderedSources = sources >= 2 && left.sources.size === right.sources.size &&
    [...left.sources].every((link, index) => link === rightSources[index]);
  if (!(body.strong && (sources > 0 || cover || facts || numbers >= 2)) && !(orderedSources && cover && facts)) return null;
  return {body:body.strong, sources, cover, facts, numbers};
}

/** Find an existing publication or a unique draft in the same account and platform. */
export function matchPublishedDraft(articles, incoming) {
  if (!incoming?.account) return {kind:'none'};
  const rows = (Array.isArray(articles) ? articles : []).filter(row =>
    row?.account === incoming.account && platformFor(row) === platformFor(incoming));
  const platformId = platformArticleId(incoming);
  const sameId = platformId ? rows.filter(row => platformArticleId(row) === platformId) : [];
  const exactDrafts = sameId.filter(row => row.publish_status === 'pending');
  const exactPublications = sameId.filter(row => row.publish_status !== 'pending' && row.publish_status !== 'unmatched');
  const exactImports = sameId.filter(row => row.publish_status === 'unmatched');
  const exactActive = [...exactDrafts, ...exactPublications];
  if (exactActive.length > 1 || exactImports.length > 1) {
    return {kind:'ambiguous', rows:sameId, reason:'platform_article_id'};
  }
  if (exactActive.length === 1) return {kind:'id', row:exactActive[0]};

  const incomingEvidence = evidenceFor(incoming);
  const candidates = rows.filter(row => row.publish_status === 'pending').flatMap(row => {
    const evidence = contentCorroboration(evidenceFor(row), incomingEvidence);
    return evidence ? [{row, evidence:{...evidence, title:corroboratingTitle(row, incoming)}}] : [];
  });
  if (candidates.length === 1) return {kind:'corroborated', ...candidates[0]};
  if (candidates.length > 1) return {kind:'ambiguous', rows:candidates.map(candidate => candidate.row), reason:'article_evidence'};
  if (exactImports.length === 1) return {kind:'unmatched-repeat', row:exactImports[0]};
  return {kind:'none'};
}
