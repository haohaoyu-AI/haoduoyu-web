import assert from 'node:assert/strict';
export function dailyNoGrantHttpFixture(db) {
 const denied=async()=>{throw Error('This legacy fixture has no normal daily delegation');};
 return Object.freeze({
  isEditorialDailyRun:async(owner,run)=>{const row=await db.prepare("SELECT id FROM editorial_runs_v3 WHERE owner=? AND id=? AND run_kind='daily'").bind(owner,run).first();assert.equal(row,null,'Legacy fixture must not conceal a normal daily run');return false;},
  hasEditorialDailyHttpDelegation:async stage=>{const row=await db.prepare('SELECT stage_id FROM editorial_daily_cloud_delegations_v3 WHERE stage_id=?').bind(stage).first();assert.equal(row,null,'Legacy fixture must not conceal a normal daily delegation');return false;},
  delegateEditorialV3DailyHttpOnce:denied,readEditorialV3DailyHttpStage:denied,probeEditorialV3DailyHttpStage:denied,preflightEditorialV3DailyHttpStage:denied,executeEditorialV3DailyHttpStage:denied,
  editorialDailyHttpPublicError:()=> '日更主笔调用结果待对账，只读同一阶段，不重复请求',
 });
}
