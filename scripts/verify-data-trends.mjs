// Reproducible synthetic evidence. Does not call any API or read production data.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {reviewTrends} from '../web/core/review-trends.mjs';
const now='2026-11-10T04:00:00Z',account='V字';
const cases=[
  {name:'missing reads remain null',article:{published_at:'2026-11-07'},snapshot:{reads:null,age_hours:24},
    expected:{records:1,average:null,samples:0,published:null,undated:0,future:0}},
  {name:'real zero is a valid sample',article:{published_at:'2026-11-07'},snapshot:{reads:0,age_hours:24},
    expected:{records:1,average:0,samples:1,published:null,undated:0,future:0}},
  {name:'future publication is excluded',article:{published_at:'2026-11-11'},snapshot:{reads:1000,age_hours:24},
    expected:{records:0,average:null,samples:0,published:0,undated:0,future:1}},
  {name:'unknown publication date is excluded',article:{published_at:null},snapshot:{reads:1000,age_hours:24},
    expected:{records:0,average:null,samples:0,published:0,undated:1,future:0}},
  {name:'UTC instant belongs to next Beijing day',article:{published_at:'2026-11-03T16:15:00Z'},snapshot:{reads:150,age_hours:24},
    expected:{records:1,average:150,samples:1,published:null,undated:0,future:0,first_day:'2026-11-04',first_day_records:1}},
  {name:'explicit draft is not published',article:{published_at:'2026-11-07',status:'draft_saved'},snapshot:{reads:1000,age_hours:24},
    expected:{records:0,average:null,samples:0,published:0,undated:0,future:0,unpublished:1}},
];
const rows=cases.map(({name,article,snapshot,expected})=>{
  const input={articles:[{id:'synthetic-article',account,title:'Synthetic validation only',...article}],
    snapshots:[{id:'synthetic-snapshot',article_id:'synthetic-article',snapshot_date:'2026-11-08',...snapshot}]};
  const result=reviewTrends(input,{account,now,range:'7d'}),s=result.summary;
  const actual={records:s.record_count,average:s.average_reads,samples:s.coverage.average_reads,
    published:s.published_count,undated:result.excluded.undated,future:result.excluded.future};
  if('first_day' in expected)Object.assign(actual,{first_day:result.series[0].date,first_day_records:result.series[0].record_count});
  if('unpublished' in expected)actual.unpublished=result.excluded.unpublished;
  assert.deepEqual(actual,expected,name);
  return {name,input,expected,actual,status:'passed'};
});
const report={synthetic:true,now,timezone:'Asia/Shanghai',source:'reviewTrends pure function',cases:rows,
  production_data_read:false,browser_qa:'not completed: Chromium Unix socket restriction; separate browser cannot reach localhost',
  note:'Published zero on an empty date means no confirmed published records in this complete synthetic input, not a platform-wide census.'};
await mkdir(new URL('../artifacts/data-trends/',import.meta.url),{recursive:true});
await writeFile(new URL('../artifacts/data-trends/inputs-expected-actual.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
