/** Older rows with a null state are already published. */
export function reviewPublishState(row) {
  if (row?.publish_status === 'pending') return 'pending';
  if (row?.publish_status === 'unmatched') return 'unmatched';
  return 'published';
}

export function reviewPublishLabel(row) {
  return {pending:'待发布', published:'已发布', unmatched:'未能对上'}[reviewPublishState(row)];
}
