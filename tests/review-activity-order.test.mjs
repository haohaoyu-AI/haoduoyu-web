import test from 'node:test';
import assert from 'node:assert/strict';
import {activityArticles, activityTime, recentArticles} from '../shared/review-analytics.mjs';

// Synthetic rows only. Pending drafts are placed by when they were saved, published ones by publication.
const rows = [
  {id: 'a', publish_status: 'published', published_at: '2026-11-18T22:25:00.000Z', draft_saved_at: '2026-11-17T17:45:23.000Z'},
  {id: 'b', publish_status: 'pending', published_at: null, draft_saved_at: '2026-11-18T12:35:13.000Z'},
  {id: 'c', publish_status: null, published_at: '2026-10-22T13:32:00.000Z'},
  {id: 'd', publish_status: 'pending', published_at: null, draft_saved_at: '2026-11-10T18:01:59.000Z'},
  {id: 'e', publish_status: 'pending', published_at: null, draft_saved_at: null, created_at: '2026-11-01T03:00:00.000Z'},
  {id: 'f', publish_status: 'published', published_at: '2026-11-18'},
  {id: 'g', publish_status: 'published', published_at: null},
];

test('pending drafts sort by draft save time among published articles', () => {
  assert.deepEqual([...rows].sort(activityArticles).map(row => row.id), ['a', 'b', 'f', 'd', 'e', 'c', 'g']);
  assert.equal(activityTime(rows[1]), '2026-11-18T12:35:13.000Z');
  assert.equal(activityTime(rows[4]), '2026-11-01T03:00:00.000Z');
  assert.equal(activityTime(rows[0]), '2026-11-18T22:25:00.000Z');
});

test('the Recent30 cohort order still uses publication time only', () => {
  assert.deepEqual([...rows].sort(recentArticles).map(row => row.id).slice(0, 3), ['a', 'f', 'c']);
});
