// A narrow absence fixture for legacy-cap bridge regressions. Never authorizes
// a generic failed-writer grant or hides one that unexpectedly exists in DB.
import assert from 'node:assert/strict';
export function failedWriterNoGrantHttpFixture(db) {
 const denied = async () => {throw Error('This legacy-cap fixture has no generic failed-writer grant');};
 return Object.freeze({
  hasEditorialFailedWriterContinuation: async (owner, stageId) => {
   const row = await db.prepare('SELECT id FROM editorial_failed_writer_continuations_v3 WHERE owner=? AND new_stage_id=?').bind(owner, stageId).first();
   assert.equal(row, null, 'Legacy fixture must not bypass an existing generic continuation');
   return false;
  },
  hasEditorialFailedWriterHttpDelegation: async stageId => {
   const row = await db.prepare('SELECT stage_id FROM editorial_failed_writer_cloud_delegations_v3 WHERE stage_id=?').bind(stageId).first();
   assert.equal(row, null, 'Legacy fixture must not bypass an existing generic HTTP delegation');
   return false;
  },
  delegateEditorialV3FailedWriterHttpOnce: denied,
  readEditorialV3FailedWriterHttpStage: denied,
  probeEditorialV3FailedWriterHttpStage: denied,
  executeEditorialV3FailedWriterHttpStage: denied,
  editorialFailedWriterHttpPublicError: () => '云失败主笔结果待对账，只读同一阶段，不重复请求',
 });
}
