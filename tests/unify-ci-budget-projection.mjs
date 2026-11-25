import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const root=new URL('../',import.meta.url);
export const ciBudgetBaseline='6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';
export const ciBudgetPath='.github/workflows/ci.yml';
const label='exact approved workbench delta (CI test budget)';
const originalBlock='  build-test:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n';
const reviewedBlock='  build-test:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 30\n';
let original;
export function ciBudgetBefore() {
  original??=execFileSync('git',['show',ciBudgetBaseline+':'+ciBudgetPath],{cwd:root,encoding:'utf8'});
  assert.equal(original.split(originalBlock).length,2,label+' one fixed original build-test block');
  return original;
}
export function ciBudgetAfter() {
  return ciBudgetBefore().replace(originalBlock,reviewedBlock);
}
// Only the existing serial test job gets more time. Every other workflow byte
// and every other path remains visible to the existing historical boundaries.
export function projectUnifyCIBudget(file,source) {
  if(file!==ciBudgetPath)return source;
  const before=ciBudgetBefore();
  if(source===before)return source;
  assert.equal(source,ciBudgetAfter(),label+' exact workflow bytes');
  return before;
}
