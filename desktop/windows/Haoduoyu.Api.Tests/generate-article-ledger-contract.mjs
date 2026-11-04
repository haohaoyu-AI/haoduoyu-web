// Exact Worker/D1 oracle for current native article filtering and sorting. No production calls.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-article-ledger-contract.mjs <isolated-source-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const {countingDb}=await import(pathToFileURL(resolve(root,'tests/counting-d1.mjs')));
const app=await fixture();const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in native ledger oracle');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const accounts=['toutiao-haoduoyu','zhihu-haoduoyu','wechat-xiaoyuer','synthetic-ledger-other'];
  for(const [id,platform,name] of [['wechat-xiaoyuer','wechat','小鱼儿真保鲜'],['synthetic-ledger-other','other','Synthetic Unknown Topic'],['synthetic-ledger-private','other','Synthetic private scope']])
    await app.db.prepare('INSERT OR IGNORE INTO matrix_accounts(id,platform,name,active,created_at) VALUES(?,?,?,1,?)').bind(id,platform,name,'2026-10-01T00:00:00Z').run();
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(accounts),DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const stamp='2026-10-01T00:00:00.000Z';
  const rows=[
    ['ledger-a01',0,'Alpha 100%_! literal','2026-10-01T15:59:59.999Z','manual'],
    ['ledger-a02',0,'alpha boundary start','2026-10-01T16:00:00.000Z','automatic'],
    ['ledger-a03',1,'Beta 日界','2026-10-02T15:59:59.999Z','mixed'],
    ['ledger-a04',2,'保险记录','2026-10-02T16:00:00.000Z','manual'],
    ['ledger-a05',0,'ASCII Case','2026-10-02T01:00:00.000Z','unknown'],
    ['ledger-a06',3,'lower à unicode','2026-10-02T01:00:00.000Z','manual'],
    ['ledger-a07',0,'upper À unicode','2026-10-02T01:00:00.000Z','manual'],
    ['ledger-a08',3,'Legacy null publication',null,'unknown'],
    ['ledger-a09',1,'Legacy raw calendar date','2026-10-02','mixed'],
    ['ledger-a10',0,'Legacy explicit raw offset','2026-10-02T08:00:00+08:00','manual'],
    ['ledger-A',3,'Legacy uppercase identifier','2026-10-02T01:00:00.000Z','manual'],
    ['ledger_a',3,'Legacy underscore identifier','2026-10-02T01:00:00.000Z','manual']
  ];
  for(const [index,[id,account,title,published,mode]] of rows.entries()) {
    await app.db.prepare(`INSERT INTO matrix_articles(id,account_id,title,url,published_at,started_at,production_mode,summary,notes,status,
      slot,writer,run_date,series_no,char_count,subheading_count,image_count,draft_ref_json,verify_items_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,'published',?,?,?,?,?,?,?,?,?,?,?)`).bind(id,accounts[account],title,'https://example.invalid/'+(id==='ledger-a06'?'url-only-token':id),published,
      index===3?'2026-10-01T00:00:01.500Z':index%3===0?'2026-10-01T00:00:00.000Z':null,mode,index===0?'summary NeedleXYZ':'',index===2?'[date-unverified]':index===6?'literal backslash \\ proof':'',
      account===2?'gzh':index%2?'tt1':'zh2',index%2?'dedao':'human','2026-10-'+String(index+1).padStart(2,'0'),index+1,index%3===0?0:2200,6,index%3===0?0:25,
      JSON.stringify({pgc_id:'synthetic-'+id}),index%3===0?null:JSON.stringify([{done:index%2===0}]),stamp,stamp).run();
  }
  for(const [index,status] of ['drafting','illustrated','draft_saved','failed',null].entries())
    await app.db.prepare(`INSERT INTO matrix_articles(id,account_id,title,status,slot,writer,run_date,series_no,char_count,subheading_count,image_count,verify_items_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind('ledger-d'+index,accounts[index%accounts.length],'合成草稿 '+status,status,'tt1','dedao','2026-11-'+String(index+1).padStart(2,'0'),100+index,0,0,0,
        index===2?JSON.stringify([{done:false}]):null,stamp,stamp).run();
  await app.db.prepare('INSERT INTO matrix_articles(id,account_id,title,status,url,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind('ledger-private','synthetic-ledger-private','SYNTHETIC-PRIVATE-CANARY','published','https://example.invalid/private',stamp,stamp,stamp).run();
  const metrics={
    'ledger-a02':{reads:0,likes:0,comments:0,approvals:0},'ledger-a03':{reads:10,likes:2,comments:1,approvals:5},
    'ledger-a05':{likes:0},'ledger-a06':{reads:10,likes:2,comments:1,approvals:0},'ledger-a07':{reads:10,likes:2,comments:1,approvals:0},
    'ledger-A':{reads:10,likes:2,comments:1,approvals:0},'ledger_a':{reads:10,likes:2,comments:1,approvals:0}
  };
  for(const [id,values] of Object.entries(metrics))await app.db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind('obs-'+id,id,'2026-10-05T00:00:00.000Z','2026-10-05T01:00:00.000Z','latest',JSON.stringify(values),'manual','合成最新整份快照',stamp).run();
  await app.db.prepare('INSERT INTO matrix_observations(id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind('older-ledger-a05','ledger-a05','2026-10-04T00:00:00.000Z','2026-10-04T01:00:00.000Z','latest',JSON.stringify({reads:999,comments:999}),'manual','不可回填新快照缺项',stamp).run();
  const samples=[],inventory=[];
  async function get(name,path,expected=200,{oracle=false}={}) {
    // Respect the source's normal public-read quota; do not replace actors or disable its limiter.
    if(samples.length)await new Promise(resolve=>setTimeout(resolve,1100));
    const db=countingDb(app.db);
    const response=await worker.fetch(new Request(app.origin+path,{headers:{Origin:app.origin,'X-Public-Business':'1'}}),{...env,DB:db});
    const responseJson=await response.text();assert.equal(response.status,expected,name+' returned '+responseJson);
    const sample={name,method:'GET',path,status:response.status,response_json:responseJson,
      sql_fast_path:db.entries.some(entry=>/ORDER BY a\.published_at COLLATE BINARY/.test(entry.sql)),oracle};
    samples.push(sample);return JSON.parse(responseJson);
  }
  for(const status of ['drafting','illustrated','draft_saved','published','failed']) {
    const result=await get('inventory-'+status,'/api/v1/articles?'+new URLSearchParams({status,page:'1',page_size:'200'}));
    assert.equal(result.meta.has_more,false);inventory.push(...result.data);
  }
  inventory.push((await get('inventory-null-status-detail','/api/v1/articles/ledger-d4')).data);
  assert.equal(inventory.length,17);assert.ok(!inventory.some(row=>row.id==='ledger-private'));
  const cases=[
    ['default-legacy',{}],
    ...['drafting','illustrated','draft_saved','published','failed'].map(status=>['status-'+status,{status}]),
    ['sql-fast-account',{account_id:accounts[0]}],['platform-zhihu',{platform:'zhihu'}],['platform-wechat',{platform:'wechat'}],['platform-other',{platform:'other'}],
    ...['manual','automatic','mixed','unknown'].map(mode=>['mode-'+mode,{mode}]),
    ...['entertainment','insurance','unknown'].map(topic=>['topic-'+topic,{topic}]),
    ...['no_snapshot','missing_reads','missing_likes','missing_comments','incomplete','zero_reads','date_unverified'].map(data_status=>['data-'+data_status,{data_status}]),
    ...['ALPHA','À','à','%_!','NeedleXYZ','url-only-token','\\','  ALPHA\t\n'].map((q,index)=>['literal-search-'+index,{q}]),
    ['beijing-natural-day',{from:'2026-10-02',to:'2026-10-02'}],
    ['explicit-time-inclusive',{from:'2026-10-02T00:00:00Z',to:'2026-10-02T01:00:00Z'}],
    ['mixed-date-to-time',{from:'2026-10-02',to:'2026-10-02T01:00:00Z'}],
    ['slot-gzh',{slot:'gzh'}],['writer-human',{writer:'human'}],
    ['warning-true',{has_warnings:'true'}],['warning-false',{has_warnings:'false'}],
    ['pending-true',{has_pending_verify:'true'}],['pending-false',{has_pending_verify:'false'}],
    ['series-range',{series_no_min:'2',series_no_max:'7'}],['series-minimum-only',{series_no_min:'10'}],
    ['combined-draft-pipeline',{status:'draft_saved',account_id:accounts[2],slot:'tt1',writer:'dedao',has_warnings:'true',has_pending_verify:'true',series_no_min:'100',series_no_max:'105'}],
    ...['published_at','reads','likes','comments','approvals','latest_as_of','duration'].flatMap(sort=>['asc','desc'].map(order=>['sort-'+sort+'-'+order,{sort,order}])),
    ['page-two',{page:'2',page_size:'2'}],['out-of-range-empty',{page:'9999',page_size:'2'}],['offset-alias',{limit:'2',offset:'3'}],
    ['index-summary',{fields:'index',page:'1',page_size:'2'}],['index-pipeline',{fields:'index',has_warnings:'true',page:'1',page_size:'200'}]
  ];
  for(const [name,values] of cases) {
    const query={page:'1',page_size:'200',...values};if(name==='default-legacy'){delete query.page;delete query.page_size;}
    if(name==='offset-alias'){delete query.page;delete query.page_size;}
    await get(name,'/api/v1/articles'+(Object.keys(query).length?'?'+new URLSearchParams(query):''),200,{oracle:true});
  }
  for(const [name,values] of [
    ['invalid-status',{status:'all'}],['invalid-boolean',{has_pending_verify:'FALSE'}],['unsafe-series',{series_no_min:'9007199254740992'}],
    ['reversed-series',{series_no_min:'9',series_no_max:'2'}],['mixed-pagination',{page:'1',offset:'0'}],
    ['unqualified-time',{from:'2026-10-02T00:00:00'}],['index-metric-sort',{fields:'index',sort:'reads'}],['zero-page-size',{page_size:'0'}]
  ])await get(name,'/api/v1/articles?'+new URLSearchParams(values),400);
  const oracle=samples.filter(sample=>sample.oracle);assert.ok(oracle.some(sample=>sample.sql_fast_path));assert.ok(oracle.some(sample=>!sample.sql_fast_path));
  const accountPage=JSON.parse(oracle.find(sample=>sample.name==='sql-fast-account').response_json);
  assert.ok(accountPage.meta.unfiltered_total>accountPage.meta.total,'account query incorrectly shrank actor-scope unfiltered total');
  assert.equal(externalFetchAttempts,0);await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:0,generated_at:new Date().toISOString(),
    fixture:'Exact compiled c30 Worker.fetch and temporary Miniflare D1 with synthetic setup only; captured requests GET-only; counting-D1 records SQL fast-path evidence; no database constraints changed; all runtimes disposed',
    allowed_accounts:accounts,canonical_rows:inventory,samples},null,2)+'\n');
  console.log(`Generated ${samples.length} actual GET contracts, ${oracle.length} native-projection oracle pages (${oracle.filter(x=>x.sql_fast_path).length} SQL fast paths); filters, raw dates, null/tie sorting, metrics, index summaries and invalid queries; zero external fetch attempts.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
