// Inspect an existing local build; never builds, uploads or reads a hosted archive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const reportArg=process.argv.indexOf('--report'),reportPath=reportArg<0?null:process.argv[reportArg+1];
if(reportArg>=0&&!reportPath)throw Error('--report requires a filename');
const sha=value=>createHash('sha256').update(value).digest('hex');
const report={started_at:new Date().toISOString(),scope:'Existing current local build and temporary tar only',checks:[],
 limits:['Not the V160 archive consumed by Sites.','A source/build match does not establish deployment transformation or hosted migration state.']};
const built=path.join(root,'dist/.openai/drizzle');
assert.ok(fs.existsSync(built),'existing build required; run the normal build only if inputs changed');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-artifact-audit-'));
function files(base){return fs.readdirSync(base,{recursive:true,withFileTypes:true}).filter(item=>item.isFile()).map(item=>path.relative(base,path.join(item.parentPath,item.name))).sort();}
function check(name,action){const evidence=action();report.checks.push({name,passed:true,evidence});console.log('PASS '+name);}
try{
 const source=path.join(root,'drizzle'),paths=files(source),journal=JSON.parse(fs.readFileSync(path.join(source,'meta/_journal.json')));
 check('journal tags, file naming, monotonic timestamps and snapshot identity chain are consistent',()=>{
  assert.equal(journal.entries.length,54);assert.equal(new Set(journal.entries.map(entry=>entry.tag)).size,54);
  let previousId='00000000-0000-0000-0000-000000000000',previousWhen=-Infinity;
  for(const [index,entry]of journal.entries.entries()){
   assert.equal(entry.idx,index);assert.match(entry.tag,new RegExp('^'+String(index).padStart(4,'0')+'_[a-z0-9_]+$'));
   assert.ok(Number.isSafeInteger(entry.when)&&entry.when>previousWhen);previousWhen=entry.when;
   const snapshot=JSON.parse(fs.readFileSync(path.join(source,'meta',String(index).padStart(4,'0')+'_snapshot.json')));
   assert.equal(snapshot.prevId,previousId);previousId=snapshot.id;
   assert.ok(fs.readFileSync(path.join(source,entry.tag+'.sql')).length>0);
  }
  assert.deepEqual(paths.filter(name=>name.endsWith('.sql')),journal.entries.map(entry=>entry.tag+'.sql').sort());
  return {sql_files:54,snapshots:54,journal:1,duplicate_tags:0,missing_files:0};
 });
 check('all migration bytes and filenames survive the existing build without truncation or newline conversion',()=>{
  assert.deepEqual(files(built),paths);
  report.files=paths.map(name=>{
   const original=fs.readFileSync(path.join(source,name)),output=fs.readFileSync(path.join(built,name));
   assert.deepEqual(output,original,name);return {path:name,size_bytes:original.length,sha256:sha(original)};
  });
  return {compared_files:paths.length,exact_matches:paths.length};
 });
 check('a tar round trip preserves the exact build migration members and bytes',()=>{
  const archive=path.join(tmp,'local-migration-subtree.tar');
  const result=spawnSync('tar',['-cf',archive,'-C',path.join(root,'dist'),'.openai/hosting.json','.openai/drizzle'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const extracted=path.join(tmp,'extracted');fs.mkdirSync(extracted);
  const extraction=spawnSync('tar',['-xf',archive,'-C',extracted],{encoding:'utf8'});assert.equal(extraction.status,0,extraction.stderr);
  const actual=path.join(extracted,'.openai/drizzle');assert.deepEqual(files(actual),paths);
  for(const name of paths)assert.deepEqual(fs.readFileSync(path.join(actual,name)),fs.readFileSync(path.join(source,name)),name);
  assert.deepEqual(fs.readFileSync(path.join(extracted,'.openai/hosting.json')),fs.readFileSync(path.join(root,'dist/.openai/hosting.json')));
  return {compared_migration_members:paths.length,exact_matches:paths.length,local_subtree_archive_sha256:sha(fs.readFileSync(archive)),v160_archive_equivalent:false};
 });
 report.passed=true;
}catch(error){report.passed=false;report.failure={message:error.message};throw error;
}finally{fs.rmSync(tmp,{recursive:true,force:true});report.finished_at=new Date().toISOString();report.check_count=report.checks.length;if(reportPath)fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');}
