import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import {exportBackup,restoreIntoEmptyDatabase} from '../src/backup.mjs';
import {digest,stable} from '../src/security.mjs';
import {createSourceInventory,verifyBackupInventory,verifyRestoredInventory} from '../scripts/migration-inventory.mjs';
const stamp='2026-11-10T00:00:00.000Z';
const sign=data=>({data,sha256:digest(JSON.stringify(stable(data)))});
const prompt=user=>({user_id:user,id:randomUUID(),prompt_key:'review-main_v2',scope:'global',version:1,status:'active',title:'合成标题',content_md:'合成正文\n第二行',changelog_md:'',created_at:stamp,updated_at:stamp});
async function insert(db,row){const fields=Object.keys(row);await db.prepare(`INSERT INTO matrix_review_prompt_versions(${fields}) VALUES(${fields.map(()=>'?')})`).bind(...Object.values(row)).run();}
test('v17 exact prompt history round trip, user-scoped export and independent all-user inventory',async t=>{
 const src=await fixture(t),owner=(await src.db.prepare('SELECT id FROM matrix_users').first()).id,other=randomUUID();
 await src.db.prepare('INSERT INTO matrix_users VALUES(?,?,?,?)').bind(other,'other','synthetic',stamp).run();
 for(const user of [owner,other])for(const scope of ['global','toutiao','vzi','yujian','wechat'])for(const [version,status] of [[1,'archived'],[2,'active'],[3,'draft']])await insert(src.db,{...prompt(user),scope,version,status});
 const full=await exportBackup(src.db),scoped=await exportBackup(src.db,{todoUserId:owner}),inventory=await createSourceInventory(src.db);
 assert.equal(full.data.format,'haoduoyu-matrix-d1-v18');assert.equal(full.data.tables.review_prompt_versions.length,30);
 assert.equal(scoped.data.tables.review_prompt_versions.length,15);assert.ok(scoped.data.tables.review_prompt_versions.every(row=>row.user_id===owner));
 assert.equal(inventory.tables.review_prompt_versions.count,30);assert.throws(()=>verifyBackupInventory(scoped,inventory),/MIGRATION_INVENTORY_MISMATCH/);
 const target=await fixture(t,{bootstrap:false});await restoreIntoEmptyDatabase(target.db,full,{allowEmptyRestore:true});
 assert.deepEqual(await verifyRestoredInventory(target.db,full,inventory),{verified:true,restored_tables:38,reset_tables:3});
 assert.deepEqual((await exportBackup(target.db)).data.tables,full.data.tables);
});
test('exact v16 restores into v17 with an empty prompt table and preserves review history',async t=>{
 const src=await fixture(t,{migrationCount:21});
 // The historical source lacks only the additive prompt table. Derive its exact
 // v16 export from the current source after applying the new migration separately.
 const owner=(await src.db.prepare('SELECT id FROM matrix_users').first()).id;
 await src.db.prepare('INSERT INTO matrix_review_articles(user_id,id,title,created_at,updated_at) VALUES(?,?,?,?,?)').bind(owner,randomUUID(),'retained v16 article',stamp,stamp).run();
 const inventory=await createSourceInventory(src.db);
 const {applyLocalSchemaMigrations}=await import('../scripts/migration-contract.mjs');await applyLocalSchemaMigrations(src.db);
 const data=(await exportBackup(src.db)).data;delete data.tables.review_prompt_versions;delete data.tables.daily_scores;data.format='haoduoyu-matrix-d1-v16';
 const backup=sign(data),target=await fixture(t,{bootstrap:false});
 await restoreIntoEmptyDatabase(target.db,backup,{allowEmptyRestore:true});
 assert.deepEqual(await verifyRestoredInventory(target.db,backup,inventory),{verified:true,restored_tables:36,reset_tables:3});
 const restored=(await exportBackup(target.db)).data.tables;
 assert.deepEqual(restored.review_prompt_versions,[]);assert.deepEqual(restored.review_articles,data.tables.review_articles);
});
test('malformed prompt backups are rejected before any database access or writes',async t=>{
 const src=await fixture(t),data=(await exportBackup(src.db)).data,owner=data.tables.users[0].id;
 data.tables.review_prompt_versions=[prompt(owner)];
 const changes=[
  row=>row.id='ABCDEF00-0000-0000-0000-000000000000',row=>row.user_id=randomUUID(),row=>row.user_id=owner.toUpperCase(),
  row=>row.prompt_key='Bad',row=>row.prompt_key='a__b',row=>row.prompt_key='a'.repeat(65),row=>row.scope='unknown',
  row=>row.version=0,row=>row.version=1.5,row=>row.version=Number.MAX_SAFE_INTEGER+1,row=>row.status='published',
  row=>row.title=' ',row=>row.title='中'.repeat(167),row=>row.content_md='',row=>row.content_md='x'.repeat(131073),
  row=>row.changelog_md='x'.repeat(131073),row=>row.title='x\u0000',row=>row.content_md='\ud800',
  row=>row.changelog_md='\u007f',row=>row.created_at='2026-02-30T00:00:00.000Z',row=>row.updated_at='2026-11-09T00:00:00.000Z',
  row=>row.updated_at='2026-11-10T00:00:00Z',row=>delete row.changelog_md,row=>row.extra='bad',
 ];
 const untouched={prepare(){assert.fail('invalid backup must not access target');},batch(){assert.fail('invalid backup must not write target');}};
 for(const change of changes){const bad=structuredClone(data);change(bad.tables.review_prompt_versions[0]);await assert.rejects(restoreIntoEmptyDatabase(untouched,sign(bad),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');}
 for(const extra of [row=>({...row}),row=>({...row,id:randomUUID()}),row=>({...row,id:randomUUID(),version:2})]){
  const bad=structuredClone(data);bad.tables.review_prompt_versions.push(extra(bad.tables.review_prompt_versions[0]));
  await assert.rejects(restoreIntoEmptyDatabase(untouched,sign(bad),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
 }
 const missing=structuredClone(data);delete missing.tables.review_prompt_versions;
 await assert.rejects(restoreIntoEmptyDatabase(untouched,sign(missing),{allowEmptyRestore:true}),e=>e.code==='INVALID_BACKUP');
});
