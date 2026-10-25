// Only old objects that omit status entirely receive legacy published semantics.
// An explicit null/undefined or any other lifecycle must never be published.
export function isPublishedArticle(row) {
  return row !== null && typeof row === 'object' && !Array.isArray(row) &&
    (!Object.hasOwn(row, 'status') || row.status === 'published');
}
