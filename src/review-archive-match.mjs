import {matchPublishedDraft} from '../shared/review-draft-match.mjs';

const scope = row => row?.account === 'V字' && row.platform === 'toutiao';
const contentKinds = new Set(['article', 'micro']);
const referenceKinds = new Set(['draft', 'publication']);
const unpublishedStates = new Set(['unpublished', 'pending', 'scheduled']);

function validId(value) {
  return typeof value === 'string' && value.length <= 240 ? value.trim() : '';
}

function references(row) {
  const refs = Array.isArray(row.refs) ? row.refs : [];
  const supplied = referenceKinds.has(row.ref_kind) ? [{kind:row.ref_kind, platform_id:row.platform_id}] : [];
  return [...refs, ...supplied].flatMap(ref => {
    const id = validId(ref?.platform_id);
    return id && referenceKinds.has(ref.kind) ? [{...ref, platform_id:id}] : [];
  });
}

function publicationIds(refs) {
  return new Set(refs.filter(ref => ref.kind === 'publication').map(ref => ref.platform_id));
}

function candidateIds(items) {
  return [...new Set(items.map(item => item.id))].sort();
}

function unresolved(kind, reason, items = []) {
  return {kind, confidence:'pending', ...(items.length ? {candidates:candidateIds(items)} : {}), evidence:{reason}};
}

function draftArtifact(item, refs) {
  return Boolean(item.original_title || item.original_body || refs.some(ref => ref.kind === 'draft') ||
    unpublishedStates.has(item.publication_status));
}

function legacyArtifact(item, preferFinal) {
  const supplied = item.match_evidence ?? {};
  const sources = Array.isArray(item.sources) ? item.sources.map(source => source?.url).filter(Boolean) : [];
  const body = preferFinal ? item.published_body ?? item.original_body : item.original_body ?? item.published_body;
  const title = preferFinal ? item.published_title ?? item.original_title : item.original_title ?? item.published_title;
  return {
    id:item.id, account:item.account, platform:item.platform, title, publish_status:'pending',
    match_evidence:{...supplied, body:body ?? supplied.body, source_urls:sources.length ? sources : supplied.source_urls,
      cover_fingerprint:item.cover?.fingerprint ?? supplied.cover_fingerprint},
  };
}

function exactResult(matches, incomingRefs, incomingKind) {
  const exactItems = matches.map(match => match.item);
  if (exactItems.some(item => item.kind !== incomingKind)) return unresolved('conflict', 'content_kind', exactItems);
  if (exactItems.length > 1) return unresolved('ambiguous', 'platform_id', exactItems);
  const [{item, refs, matching}] = matches;
  const existingPublications = publicationIds(refs);
  const incomingPublications = publicationIds(incomingRefs);
  if (existingPublications.size && [...incomingPublications].some(id => !existingPublications.has(id))) {
    return unresolved('conflict', 'different_publication_id', [item]);
  }
  const exactIds = new Set(matching.map(ref => ref.platform_id));
  const relevant = [...matching, ...incomingRefs.filter(ref => exactIds.has(ref.platform_id))];
  return {kind:'id', item, confidence:'exact', evidence:{identifier:true,
    draft_reference:relevant.some(ref => ref.kind === 'draft'),
    publication_reference:relevant.some(ref => ref.kind === 'publication'),
    primary_draft:matching.some(ref => ref.kind === 'draft' && ref.role === 'primary')}};
}

/** Classifies one archive import within the V字 scope without changing any record. */
export function matchArchiveItem(items, incoming) {
  if (!scope(incoming) || !contentKinds.has(incoming.kind) || !referenceKinds.has(incoming.ref_kind)) {
    return unresolved('none', 'unsupported_scope_or_kind');
  }
  const incomingRefs = references(incoming);
  if (publicationIds(incomingRefs).size > 1) return unresolved('conflict', 'multiple_publication_ids');
  const incomingIds = new Set(incomingRefs.map(ref => ref.platform_id));
  const scoped = (Array.isArray(items) ? items : []).filter(item => scope(item) && !item.merged_into)
    .map(item => ({item, refs:references(item)}));
  const exactMatches = scoped.flatMap(({item, refs}) => {
    const matching = refs.filter(ref => incomingIds.has(ref.platform_id));
    return matching.length ? [{item, refs, matching}] : [];
  });
  if (exactMatches.length) return exactResult(exactMatches, incomingRefs, incoming.kind);

  const fromPublication = incoming.ref_kind === 'publication';
  const candidates = scoped.filter(({item, refs}) => item.kind === incoming.kind && item.publication_status !== 'deleted' &&
    (!fromPublication || (item.publication_status !== 'published' && draftArtifact(item, refs) && !publicationIds(refs).size)));
  const match = matchPublishedDraft(candidates.map(({item}) => legacyArtifact(item, false)), legacyArtifact(incoming, fromPublication));
  if (match.kind === 'ambiguous') return unresolved('ambiguous', 'article_evidence', match.rows);
  if (match.kind === 'corroborated') {
    return {kind:'corroborated', item:candidates.find(({item}) => item.id === match.row.id).item,
      confidence:'strong', evidence:match.evidence};
  }
  return unresolved('none', 'insufficient_evidence');
}
