import assert from 'node:assert/strict';
// The sole D5 header contract change is the removal of this legacy token.
// Historical comparisons still assert the entire policy, not an ignored header.
const STRICT="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const LEGACY=STRICT.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'");
export function stylePolicyHeaders(headers) {
  const result=new Headers(headers),policy=result.get('Content-Security-Policy');
  assert.ok(policy===STRICT||policy===LEGACY,'Unexpected security policy outside the single approved D5 change');
  result.set('Content-Security-Policy',STRICT);
  return result;
}
