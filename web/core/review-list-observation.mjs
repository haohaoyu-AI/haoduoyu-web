import {day, finiteNumber} from './review-data.mjs';

// Date-only fields cannot establish an observation age or a rolling age.
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !day(value)) return null;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? stamp : null;
}
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;

/** List-only fallback; never changes the samples used for metrics or verdicts. */
export function reviewListObservation(row, snapshots = [], now = new Date().toISOString()) {
  if (row.sample24h) return {kind:'sample', snapshot:row.sample24h, reads:row.reads_24h, hours:finiteNumber(row.sample24h.age_hours)};
  const published = instant(row.published_at);
  const candidates = (Array.isArray(snapshots) ? snapshots : []).filter(snapshot => String(snapshot?.article_id) === String(row.id)).map(snapshot => {
    const explicitAge = finiteNumber(snapshot.age_hours);
    const observed = instant(snapshot.observed_at) ?? instant(snapshot.snapshot_date);
    const computedAge = published !== null && observed !== null ? (observed - published) / 3600000 : null;
    const hours = explicitAge !== null && Number.isInteger(explicitAge) && explicitAge >= 0 ? explicitAge : explicitAge === null ? computedAge : null;
    const reads = finiteNumber(snapshot.reads);
    return {snapshot,hours,observed,reads:reads !== null && reads >= 0 ? reads : null};
  }).filter(candidate => candidate.hours !== null && candidate.hours > 72)
    .sort((a,b) => a.hours - b.hours || (a.observed ?? Infinity) - (b.observed ?? Infinity) || compare(String(a.snapshot.id ?? ''),String(b.snapshot.id 
      ?? '')));
  // A later observation with a real reading is the first collected reading if earlier records contain none.
  const first = candidates.find(candidate => candidate.reads !== null) || candidates[0];
  if (first) return {kind:'longtail', snapshot:first.snapshot, reads:first.reads, hours:first.hours};
  const nowMs = instant(now);
  if (published !== null && nowMs !== null && nowMs >= published && nowMs - published < 12 * 3600000) return {kind:'immature', snapshot:null, reads:null, 
    hours:null};
  return {kind:'missing', snapshot:null, reads:null, hours:null};
}

export function reviewObservationHours(value) {
  const hours = finiteNumber(value);
  return hours === null ? '' : String(Number(hours.toFixed(4)));
}
