// Shared pure time calculations. Distinct legacy coercion and midpoint policies
// are intentional: callers must not silently exchange these adapters.
export const DAY = 86_400_000;
export const BEIJING_OFFSET = 8 * 3_600_000;
export const validStamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const beijingDate = value => validStamp(value) ? new Date(Date.parse(value) + BEIJING_OFFSET).toISOString().slice(0, 10) : null;
export const beijingDay = stamp => new Date(Number(stamp) + BEIJING_OFFSET).toISOString().slice(0, 10);

// Template coercion and concatenation coercion differ for custom primitives.
export function shiftDay(day, amount) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
}
export const shift = (day, count) => new Date(Date.parse(day + 'T00:00:00Z') + count * DAY).toISOString().slice(0, 10);
export const distance = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / DAY);
export const dates = (from, to) => Array.from({ length: Math.max(0, distance(from, to) + 1) }, (_, i) => shift(from, i));

// Overview's overflow-resistant midpoint; copies and sorts the original values.
export const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
};
// Dashboard and cumulative summaries already sorted their arrays and historically
// add before dividing. Preserve that arithmetic, including overflow and NaN.
export function sortedMedian(values) {
  const middle = Math.floor(values.length / 2);
  return values.length ? values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 : null;
}
