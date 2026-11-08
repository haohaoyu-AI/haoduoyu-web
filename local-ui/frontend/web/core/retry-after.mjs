export const DEFAULT_RETRY_AFTER = 60000;
export const MAX_TIMER_DELAY = 2147483647;

// Retry-After is either whole seconds or an HTTP date. Never shorten a valid
// long server wait to the platform's maximum single setTimeout interval.
export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string') return DEFAULT_RETRY_AFTER;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isFinite(seconds) ? Math.min(Number.MAX_SAFE_INTEGER, seconds * 1000) : Number.MAX_SAFE_INTEGER;
  }
  // HTTP dates contain textual day/month names; reject loose numeric inputs
  // which Date.parse may otherwise interpret as surprising calendar dates.
  if (!/[a-z]/i.test(text) || !/^(?:[a-z]{3},|[a-z]+,|[a-z]{3}\s)/i.test(text)) return DEFAULT_RETRY_AFTER;
  const at = Date.parse(text);
  return Number.isFinite(at) && Number.isFinite(now) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, at - now)) : DEFAULT_RETRY_AFTER;
}

export function retryAfterDelay(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ?
    Math.min(Number.MAX_SAFE_INTEGER, Math.max(DEFAULT_RETRY_AFTER, Math.ceil(value))) : DEFAULT_RETRY_AFTER;
}

export function retryUntil(now, delay) {
  return Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(0, now) + retryAfterDelay(delay));
}
