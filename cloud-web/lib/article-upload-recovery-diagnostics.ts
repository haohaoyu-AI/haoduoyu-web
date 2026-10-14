// Metadata-only observation. These digests classify the effective schema; they
// are never consulted by reserve/consume and cannot grant recovery permission.
const expected:Record<string,{type:string;sha256:string}>={
 article_upload_scope_version:{type:'index',sha256:'1b061f848b7bf075fe5c4b9a23a9e270059efec341a8fbe61d306aa299314659'},
 article_upload_root_scope:{type:'index',sha256:'907bbf6e0922d1355bd6ff6802323cc3e633f1a01bd746e0b1b29d9e42142463'},
 article_upload_source_once:{type:'index',sha256:'32afe99e262e171ba0fd68d766e293817f13eb8dee1033e12406c3169e79246a'},
 article_upload_owner_authorization:{type:'index',sha256:'5d6ee3d64d9f3e8ec5972e179b17dbe15cfdbdf2c0f5b4d61277c3968e05cfde'},
 article_upload_consume_token:{type:'index',sha256:'fc4a6b2046e9cf03d1a691ed26268de142616aa1bc4096ec23372f8976270e68'},
 article_upload_scope_confirmation:{type:'index',sha256:'83b731f77000a8d4e3479a18da221fdc945eb4a82bd36723637b23affc391278'},
 article_upload_ended_immutable:{type:'trigger',sha256:'fc3822d022b58958ffa26e876b6879e09a5372df0c396d82fc7d67578c3f430e'},
 article_upload_history_no_delete:{type:'trigger',sha256:'0a67144b47054e06e076a10d53efab312cc85fc46190b5c534c84c363822b3c1'},
 article_upload_executor_end_no_update:{type:'trigger',sha256:'27ac7c44460a9d3ffadc8fa72f82fa792d930c0fdab29c6e66b7797857f6d01b'},
 article_upload_executor_end_no_delete:{type:'trigger',sha256:'24e4294f4658238dba39a8d0d34cb7d9474b23d4495b7269628beb3591f2f473'},
 article_upload_identity_immutable:{type:'trigger',sha256:'ba84994f15808de8f7e970a218dfaf418f537f6fbbc162104474d75d6ba38471'},
 article_upload_child_lineage:{type:'trigger',sha256:'be3601d9905cdeb38016fa0b799248c17d144f15635bf8196fb3f12fd5209d01'},
};
const legacyChildDigest='3ec5052fa1a3183f31a0b6d4ff41230217168d96abb4fb9df9e7e0336d792654';
const migrationDigest='0b14ecefc9c81420c3741887bed8e2278eb6c2b36813d4ae79baab59572d2070';
const migrationCreated=1791487200000;
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
type ObjectStatus='expected'|'missing'|'different'|'unavailable';
type ChildStatus='unconsumed_v0037'|'consumed_only_v0026'|'missing'|'unrecognized'|'unavailable';
type JournalStatus='recorded_exact_drizzle_entry'|'not_recorded_exact_drizzle_entry'|'not_observed_drizzle_journal'|'unavailable';
export async function readUploadRecoverySchema(binding:D1Database){
 const objects:Record<string,ObjectStatus>=Object.fromEntries(Object.keys(expected).map(name=>[name,'unavailable']));
 let child:ChildStatus='unavailable',journal:JournalStatus='unavailable';
 try{
  const names=Object.keys(expected),rows=await binding.prepare(`SELECT type,name,sql FROM sqlite_master WHERE name IN (${names.map(()=>'?').join(',')})`).bind(...names).all<{type:string;name:string;sql:string|null}>();
  for(const name of names){
   const matches=rows.results.filter(row=>row.name===name),row=matches.length===1?matches[0]:null,definition=row&&typeof row.sql==='string'?await digest(row.sql.replace(/\r\n/g,'\n').trim().replace(/;$/,'')):null;
   objects[name]=!matches.length?'missing':row&&row.type===expected[name].type&&definition===expected[name].sha256?'expected':'different';
   if(name==='article_upload_child_lineage')child=!matches.length?'missing':objects[name]==='expected'?'unconsumed_v0037':row?.type==='trigger'&&definition===legacyChildDigest?'consumed_only_v0026':'unrecognized';
  }
 }catch{
  // Partial metadata observation does not become a clean schema report.
  for(const name of Object.keys(expected))objects[name]='unavailable';child='unavailable';
 }
 try{
  const table=await binding.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'").bind().first<{present:number}>();
  if(!table)journal='not_observed_drizzle_journal';
  else{
   const entry=await binding.prepare('SELECT 1 AS present FROM __drizzle_migrations WHERE hash=? AND created_at=? LIMIT 1').bind(migrationDigest,migrationCreated).first<{present:number}>();
   journal=entry?'recorded_exact_drizzle_entry':'not_recorded_exact_drizzle_entry';
  }
 }catch{/* Only a fixed unavailable status. No raw SQL/exception/body retained. */}
 return {child_lineage:child,guard_objects:objects,schema_checks_match_expected:Object.values(objects).every(status=>status==='expected'),migration_0037_drizzle_record:journal,
  migration_record_is_not_effective_schema_proof:true,current_observation_only:true};
}
