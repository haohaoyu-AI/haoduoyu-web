import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewColumnPreference} from '../web/review-controller.mjs';

test('column preferences retain an empty selection and reject invalid saved data', () => {
  assert.deepEqual(readReviewColumnPreference(null),['reads']);
  assert.deepEqual(readReviewColumnPreference('bad-json'),['reads']);
  assert.deepEqual(readReviewColumnPreference('{}'),['reads']);
  assert.deepEqual(readReviewColumnPreference('[]'),[]);
  assert.deepEqual(readReviewColumnPreference('["unknown"]'),['reads']);
  assert.deepEqual(readReviewColumnPreference('["completion_rate","reads","reads","unknown"]'),['reads','completion_rate']);
});
