import test from 'node:test';
import assert from 'node:assert/strict';
import {compareChartSamples} from './style-evidence.mjs';
const row=()=>({name:'synthetic',width:390,bars:[{height:'12.5px',width:'12px',background:'rgb(26, 102, 179)',rectHeight:12.5,rectWidth:12,title:'Synthetic bar'}],
  legend:[{height:'8px',width:'8px',background:'rgb(26, 102, 179)',rectHeight:8,rectWidth:8,title:''}],
  svg:[{tag:'circle',stroke:'none',fill:'rgb(26, 102, 179)',geometry:[null,null,null,null,'45','12','4']}]});
const states=[['synthetic',390]];
test('computed evidence comparison rejects missing, duplicate and mismatched state coverage',()=>{
  assert.equal(compareChartSamples([row()],[row()],states).passed,true);
  for(const rows of [[],[row(),row()],[{...row(),name:'wrong-state'}]]) {
    const report=compareChartSamples([row()],rows,states);
    assert.equal(report.passed,false);assert.ok(report.coverage_errors.length);
  }
});
test('comparison checks actual heights, geometry, colors, legends, SVG and hidden state without tolerance',()=>{
  const mutations=[value=>value.bars[0].height='12.5001px',value=>value.bars[0].rectHeight=12.5001,
    value=>value.bars[0].background='rgb(26, 102, 178)',value=>value.legend[0].width='9px',
    value=>value.svg[0].geometry[5]='13',value=>value.svg[0].fill='none',value=>value.hidden=true];
  for(const mutate of mutations){const changed=row();mutate(changed);const report=compareChartSamples([row()],[changed],states);
    assert.equal(report.passed,false);assert.equal(report.coverage_errors.length,0);assert.equal(report.differences.length,1);}
});
