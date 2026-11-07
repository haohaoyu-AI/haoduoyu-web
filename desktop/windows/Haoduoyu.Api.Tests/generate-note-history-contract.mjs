// Actual exact-source GET responses; all setup is confined to a fresh temporary D1.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-note-history-contract.mjs <isolated-source-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit);
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();const originalFetch=globalThis.fetch;let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){externalFetchAttempts++;throw new Error('External fetch disabled in synthetic note history contract');}
  return originalFetch(input,options);
};
try {
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner};
  const time='2024-02-29T08:00:00.000Z',later='2024-02-29T08:30:00.000Z';
  const ids={life:randomUUID(),second:randomUUID(),work:randomUUID(),blank:randomUUID(),deleted:randomUUID(),outside:randomUUID()};
  const insertNote=(id,category,date,text,deleted=null)=>app.db.prepare(`INSERT INTO matrix_note_entries
    (user_id,id,category,date,text,version,change_seq,created_at,updated_at,deleted_at) VALUES(?,?,?,?,?,1,1,?,?,?)`)
    .bind(owner,id,category,date,text,time,later,deleted);
  const statements=[];
  for(const [table,date,text] of [['matrix_daily_notes','2024-02-29','合成旧生活 🐟'],
    ['matrix_daily_work_notes','2024-02-29','合成旧工作'],['matrix_daily_notes','2024-02-28','']])
    statements.push(app.db.prepare('INSERT INTO '+table+'(user_id,date,text,version,change_seq,created_at,updated_at) VALUES(?,?,?,1,1,?,?)')
      .bind(owner,date,text,time,later));
  statements.push(insertNote(ids.life,'life','2024-02-29','合成多标签 🐟 👩‍💻 é " \\ \u2028\u2029\n\t'),
    insertNote(ids.second,'life','2024-02-29','同日第二条'),insertNote(ids.work,'work','2024-02-29','新工作记录'),
    insertNote(ids.blank,'life','2024-02-28',''),insertNote(ids.deleted,'life','2024-02-29','已删除合成记录',later),
    insertNote(ids.outside,'life','2024-03-01','下个月合成记录'));
  for(const label of ['兴趣','已归档'])statements.push(app.db.prepare('INSERT INTO matrix_note_labels(user_id,name,created_at) VALUES(?,?,?)').bind(owner,label,time));
  statements.push(app.db.prepare('INSERT INTO matrix_note_label_archives(user_id,name,archived_at) VALUES(?,?,?)').bind(owner,'已归档',later));
  statements.push(app.db.prepare('INSERT INTO matrix_note_entry_labels(user_id,entry_id,label) VALUES(?,?,?)').bind(owner,ids.life,'兴趣'));
  statements.push(app.db.prepare('INSERT INTO matrix_note_entry_label_sets(user_id,entry_id,labels_json) VALUES(?,?,?)').bind(owner,ids.life,JSON.stringify(['生活','兴趣','已归档'])));
  statements.push(app.db.prepare('INSERT INTO matrix_note_entry_label_sets(user_id,entry_id,labels_json) VALUES(?,?,?)').bind(owner,ids.blank,'[]'));
  statements.push(app.db.prepare('INSERT INTO matrix_note_entry_label_sets(user_id,entry_id,labels_json) VALUES(?,?,?)').bind(owner,ids.work,'["兴趣"]'));
  // All records respect existing schemas; no constraint, permission or limiter is modified.
  await app.db.batch(statements);
  const samples=[];
  const tables=['matrix_note_entries','matrix_daily_notes','matrix_daily_work_notes','matrix_note_labels',
    'matrix_note_entry_labels','matrix_note_entry_label_sets','matrix_note_label_archives'];
  async function businessDigest() {
    const rows=await Promise.all(tables.map(async table=>[table,(await app.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()).results]));
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  async function get(name,path,{status=200,version='3',nativeReject=false,localQueryReject=false}={}) {
    assert.ok(samples.length<50,'contract stays below normal public read request budget');
    const before=await businessDigest();
    const headers={Origin:app.origin,'X-Public-Business':'1','X-Note-Labels-Archive':'1'};
    if(version!==null)headers['X-Note-Labels-Version']=version;
    const response=await worker.fetch(new Request(app.origin+path,{headers}),env),responseJson=await response.text();
    assert.equal(response.status,status,name+' returned '+responseJson.slice(0,400));
    assert.equal(await businessDigest(),before,name+' unexpectedly changed business data');
    const body=JSON.parse(responseJson);
    if(status===413){assert.equal(body.error.code,'NOTES_MONTH_LIMIT');assert.equal(body.data,undefined);}
    samples.push({name,method:'GET',path,status:response.status,labels_header:version,response_json:responseJson,
      native_response_rejection:nativeReject,local_query_rejection:localQueryReject,business_data_unchanged:true});
    return body.data;
  }
  const month=await get('leap-month-four-sources-labels3','/api/v1/note-entries/month?month=2024-02');
  assert.equal(month.labels_version,3);assert.equal(month.complete,true);
  assert.deepEqual(month.days.map(day=>day.date),['2024-02-28','2024-02-29']);
  const items=month.days.flatMap(day=>day.items);
  assert.equal(items.length,6);assert.equal(items.find(item=>item.entity_id==='note-entry:'+ids.blank).text,'');
  assert.deepEqual(items.find(item=>item.entity_id==='note-entry:'+ids.blank).labels,[]);
  assert.deepEqual(items.find(item=>item.entity_id==='note-entry:'+ids.work).labels,['兴趣']);
  assert.deepEqual(items.find(item=>item.entity_id==='note-entry:'+ids.life).labels,['兴趣','已归档','生活']);
  assert.equal(items.find(item=>item.entity_id==='legacy-life:2024-02-29').created_at,null);
  assert.equal(items.find(item=>item.entity_id==='legacy-work:2024-02-29').updated_at,later);
  assert.ok(items.every(item=>!Object.hasOwn(item,'version')&&!Object.hasOwn(item,'id')&&!Object.hasOwn(item,'content_hash')&&!Object.hasOwn(item,'can_edit')));
  const dayLife=await get('day-life-detail-contains-versions','/api/v1/note-entries?category=life&date=2024-02-29');
  const dayWork=await get('day-work-detail-contains-versions','/api/v1/note-entries?category=work&date=2024-02-29');
  assert.equal(dayLife.entries.length,2);assert.equal(dayWork.entries.length,1);
  const detail=await get('single-entry-detail-for-edit-baseline','/api/v1/note-entries/'+ids.life);
  assert.equal(detail.version,1);assert.equal(detail.deleted,false);assert.equal(typeof detail.content_hash,'string');
  await get('legacy-life-detail-has-version','/api/v1/daily-notes?category=life&date=2024-02-29');
  await get('legacy-work-detail-has-version','/api/v1/daily-notes?category=work&date=2024-02-29');
  const labels=await get('labels-archive-catalog','/api/v1/note-entries/labels');
  assert.ok(labels.archived_labels.some(label=>label.name==='已归档'));
  assert.deepEqual((await get('complete-empty-month','/api/v1/note-entries/month?month=2024-01')).days,[]);
  assert.equal((await get('labels2-is-not-labels3','/api/v1/note-entries/month?month=2024-02',{version:'2',nativeReject:true})).labels_version,2);
  const fallback=await get('omitted-label-header-is-not-labels3','/api/v1/note-entries/month?month=2024-02',{version:null,nativeReject:true});
  assert.notEqual(fallback.labels_version,3);
  for(const [name,path,localQueryReject] of [
    ['missing-month','/api/v1/note-entries/month',false],
    ['zero-year','/api/v1/note-entries/month?month=0000-02',false],
    ['invalid-month','/api/v1/note-entries/month?month=2024-13',false],
    ['duplicate-month','/api/v1/note-entries/month?month=2024-02&month=2024-01',true],
    ['extra-category','/api/v1/note-entries/month?month=2024-02&category=life',true]])
    await get(name,path,{status:400,localQueryReject});
  await app.db.prepare(`WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<2001)
    INSERT INTO matrix_note_entries(user_id,id,category,date,text,version,change_seq,created_at,updated_at)
    SELECT ?,printf('00000000-0000-0000-0000-%012d',x),CASE WHEN x<=1001 THEN 'life' ELSE 'work' END,'2024-04-01','x',1,1,?,? FROM n`)
    .bind(owner,time,later).run();
  await get('row-budget-2001-rejects-whole-month','/api/v1/note-entries/month?month=2024-04',{status:413});
  await app.db.prepare('DELETE FROM matrix_note_entries WHERE user_id=? AND id=?').bind(owner,'00000000-0000-0000-0000-000000002001').run();
  const full=await get('row-budget-2000-complete','/api/v1/note-entries/month?month=2024-04');
  assert.equal(full.days[0].items.length,2000);assert.equal(full.complete,true);
  // Each body is legal <=64KiB. 16*65536 hits the raw-text budget exactly but
  // the complete serialized envelope exceeds 1MiB; 17 also exceeds raw bytes.
  for(const [date,count] of [['2024-05-01',16],['2024-06-01',17]]) {
    const batch=Array.from({length:count},()=>insertNote(randomUUID(),'life',date,'x'.repeat(65536)));
    await app.db.batch(batch);
  }
  await get('serialized-byte-budget-rejects-whole-month','/api/v1/note-entries/month?month=2024-05',{status:413});
  await get('raw-text-byte-budget-rejects-whole-month','/api/v1/note-entries/month?month=2024-06',{status:413});
  assert.equal(externalFetchAttempts,0);
  const sourceHashes={};
  for(const name of ['src/note-month.mjs','src/note-entries.mjs','src/note-entry-validation.mjs','dist/server/index.js'])
    sourceHashes[name]=createHash('sha256').update(await readFile(resolve(root,name))).digest('hex');
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,external_fetch_attempts:0,
    production_business_requests:0,generated_at:new Date().toISOString(),source_hashes:sourceHashes,
    fixture:'Exact c30 compiled Worker.fetch; existing harness synthetic bootstrap/login, fresh temporary Miniflare D1 setup; all captured business requests GET-only and business tables unchanged by each read; no constraints, permissions or limiter changed; runtime disposed',
    month:'2024-02',empty_month:'2024-01',ids,expected_month_rows:6,samples},null,2)+'\n');
  console.log(`Generated ${samples.length} actual GET-only note history contracts; source and byte/row boundaries verified, business data unchanged on every GET, zero external fetch attempts.`);
} finally {globalThis.fetch=originalFetch;await app.mf.dispose();}
