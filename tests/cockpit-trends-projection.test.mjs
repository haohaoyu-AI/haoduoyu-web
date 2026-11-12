import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {cockpitRestoreAssets,cockpitRestoreFixtures,cockpitRestoreSources,cockpitRestoreHashes,cockpitRestoreBefore,
  verifyCockpitRestoreSources,projectCockpitRestore} from './cockpit-trends-projection.mjs';
import {projectQuietSync} from './oct28-small-fix-projection.mjs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
test('cockpit inverse accepts only four exact generated assets and composes to the existing historical boundary',()=>{
  assert.deepEqual(cockpitRestoreAssets,['public/app.js','public/index.html','public/sw.js','.ci/public-assets.json']);
  verifyCockpitRestoreSources();
  for(const file of cockpitRestoreAssets) {
    const current=read(file),before=cockpitRestoreBefore(file);
    assert.equal(hash(current),cockpitRestoreHashes[file]);
    assert.equal(projectCockpitRestore(file,current),before);
    assert.equal(projectCockpitRestore(file,before),before);
    assert.equal(projectQuietSync(file,current),projectQuietSync(file,before));
    for(const changed of [current+'\n',current.slice(1)]) {
      assert.equal(projectCockpitRestore(file,changed),changed,'unapproved bytes are not hidden');
      assert.notEqual(projectQuietSync(file,changed),projectQuietSync(file,before));
    }
  }
});
test('cockpit inverse rejects drift in either source and never projects sources or unrelated paths',()=>{
  for(const file of cockpitRestoreSources) {
    assert.throws(()=>verifyCockpitRestoreSources(path=>read(path)+(path===file?'\n':'')),/exact approved cockpit restoration source/);
    assert.equal(projectCockpitRestore(file,read(file)),read(file));
  }
  for(const file of ['src/worker.mjs','public/review.css','/public/app.js','public/../public/app.js'])
    assert.equal(projectCockpitRestore(file,read('public/app.js')),read('public/app.js'));
});
test('cockpit source delta preserves six cards and date controls; shared plot only changes its aria table note',()=>{
  const file='web/pages/content-review.mjs',before=cockpitRestoreBefore(file);
  const expected=before.replace("import {renderCockpitCharts} from './review-cockpit-charts.mjs';",
    "import {renderCockpitTrends} from './review-trends.mjs';")
    .replace('${renderCockpitCharts(current.series)}','${renderCockpitTrends(data,vm,current.window)}');
  assert.equal(read(file),expected,'only import and lower chart renderer change');
  const trends='web/pages/review-trends.mjs';
  const original=cockpitRestoreBefore(trends),current=read(trends);
  const addition=current.match(/\/\*\* Restore the v101 article plots[\s\S]*?(?=export function renderReviewTrends)/)?.[0];
  assert.ok(addition);
  const reverted=current.replace(addition,'').replace('threshold,daily = true})','threshold})')
    .replace("  const curveLabel = latest ? `最新近 ${result.rolling.days} 天中位数 ${format(latest[rolling])}` : '样本不足以画出走势线';\n",'')
    .replace("${curveLabel}。${daily ? '逐日数字见下方表格。' : ''}",
      "${latest ? `最新近 ${result.rolling.days} 天中位数 ${format(latest[rolling])}` : '样本不足以画出走势线'}。逐日数字见下方表格。");
  assert.equal(reverted,original,'no other plotting, statistics, controls or legacy renderer bytes change');
});

test('the sole pinned test fixture changes only VM counter identifiers, never assertions or product behavior',()=>{
  assert.deepEqual(cockpitRestoreFixtures,['tests/daily-todos-ui.test.mjs']);
  for(const file of cockpitRestoreFixtures) {
    const current=read(file),before=cockpitRestoreBefore(file);
    assert.equal(current.replaceAll('testApiReads','reads'),before);
    assert.equal(projectCockpitRestore(file,current),before);
    assert.equal(projectQuietSync(file,current),projectQuietSync(file,before));
    assert.equal(projectCockpitRestore(file,current+'\n'),current+'\n');
  }
});
