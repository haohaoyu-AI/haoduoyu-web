import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const CHART_STATES=[...[375,390,768,1440].map(width=>['visual-7d',width]),
  ['period-7d',1440],['period-30d',1440],['period-yesterday',1440],['period-7d',1440],
  ['metric-likes',1440],['metric-reads',1440],['publication-tab',1440],['date-change',1440],
  ['return-after-navigation',1440]];
const key=row=>JSON.stringify([row.name,row.width]);
function group(rows) {
  const result=new Map();
  for(const row of rows){const name=key(row);if(!result.has(name))result.set(name,[]);result.get(name).push(row);}
  return result;
}
export function compareChartSamples(baseline,candidate,states=CHART_STATES) {
  const expected=group(states.map(([name,width])=>({name,width}))),old=group(baseline),next=group(candidate);
  const coverage=[],differences=[],pairs=[];
  for(const [side,actual]of [['baseline',old],['candidate',next]]) {
    for(const name of new Set([...expected.keys(),...actual.keys()])) {
      const wanted=expected.get(name)?.length||0,found=actual.get(name)?.length||0;
      if(found!==wanted)coverage.push({side,state:JSON.parse(name),expected:wanted,actual:found});
    }
  }
  for(const [name,occurrences]of expected)for(let index=0;index<occurrences.length;index++) {
    const left=old.get(name)?.[index],right=next.get(name)?.[index];if(!left||!right)continue;
    const changed=[];
    for(const field of ['bars','legend','svg','hidden']) {
      const a=field==='hidden'?Boolean(left[field]):left[field],b=field==='hidden'?Boolean(right[field]):right[field];
      if(!isDeepStrictEqual(a,b)){changed.push(field);differences.push({state:JSON.parse(name),occurrence:index+1,field,baseline:a,candidate:b});}
    }
    pairs.push({state:JSON.parse(name),occurrence:index+1,matched:!changed.length,
      bars:left.bars?.length,legend:left.legend?.length,svg:left.svg?.length});
  }
  return {passed:!coverage.length&&!differences.length,comparison:'exact; no rounding or tolerance',
    fields:['bars(height,width,background,rectHeight,rectWidth,title)','legend(same fields)',
      'svg(tag,stroke,fill,all captured geometry)','hidden'],expected_pairs:states.length,
    pairs,coverage_errors:coverage,differences};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>
    [process.argv[2+i*2].replace(/^--/,''),process.argv[3+i*2]]));
  for(const name of ['baseline-visual','baseline-style','candidate','output'])assert.ok(args[name],name+' required');
  const load=async name=>JSON.parse(await readFile(args[name],'utf8'));
  const visual=await load('baseline-visual'),style=await load('baseline-style'),candidate=await load('candidate');
  const report=compareChartSamples([
    ...visual.chart_samples.filter(row=>row.variant==='baseline'&&row.name==='visual-7d'),
    ...style.chart_samples.filter(row=>row.variant==='baseline')],candidate.chart_samples.filter(row=>row.variant==='candidate'));
  report.inputs=Object.fromEntries(['baseline-visual','baseline-style','candidate'].map(name=>[name,args[name]]));
  report.run_statuses={baseline_original:visual.status,baseline_style:style.status,candidate:candidate.status};
  await writeFile(args.output,JSON.stringify(report,null,2)+'\n');
  assert.equal(style.status,'complete','baseline supplemental style run did not complete');
  assert.equal(candidate.status,'complete','candidate run did not complete');
  assert.equal(report.passed,true,JSON.stringify({coverage:report.coverage_errors,differences:report.differences}));
  console.log(`Exact computed-style equality: ${report.pairs.length}/${report.expected_pairs} state/width pairs; all captured fields match.`);
}
