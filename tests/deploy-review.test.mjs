import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs,readRemoteSnapshot} from '../scripts/deploy-review.mjs';

const commit='b'.repeat(40),version='11111111-1111-4111-8111-111111111111';
const args=[commit,'--expected-current-version',version];
test('parameter route accepts any full commit, defaults to read-only, and rejects ambiguous inputs',()=>{
  assert.deepEqual(parseArgs(args),{commit,expectedCurrentVersion:version,mode:'preflight'});
  assert.equal(parseArgs([...args,'--mode','deploy']).mode,'deploy');
  assert.equal(parseArgs([...args,'--evidence-dir','/private/release']).evidenceDir,'/private/release');
  for(const input of [[],['bbbbbbb',...args.slice(1)],[commit],
    [...args,'--mode','upload'],[...args,'--mode','deploy','--mode','preflight'],
    [...args,'--unknown','value'],[...args,'--evidence-dir'],[...args,'unexpected']])
    assert.throws(()=>parseArgs(input));
});

test('preflight only reads and requires expected version to be active and latest',async()=>{
  let latest=version,active=version;const methods=[];
  const config={accountId:'a'.repeat(32),workerName:'haoduoyu-prod',token:'synthetic-never-print',expectedCurrentVersion:version};
  const request=async(url,init)=>{
    methods.push(init.method);assert.equal(init.redirect,'error');
    const path=new URL(url).pathname;
    const result=path.endsWith('/deployments')?{deployments:[{id:version,strategy:'percentage',versions:[{version_id:active,percentage:100}]}]}:
      path.endsWith('/versions')?{items:[{id:latest}]}:
      path.endsWith('/versions/'+version)?{id:version,resources:{bindings:[],script:{etag:'synthetic',handlers:['fetch']},
        script_runtime:{compatibility_date:'2026-07-30'}}}:{};
    return Response.json({success:true,result});
  };
  assert.equal((await readRemoteSnapshot(config,{request})).currentVersion.id,version);
  latest='22222222-2222-4222-8222-222222222222';
  await assert.rejects(readRemoteSnapshot(config,{request}),{message:'LATEST_VERSION_MISMATCH'});
  latest=version;active='22222222-2222-4222-8222-222222222222';
  await assert.rejects(readRemoteSnapshot(config,{request}),{message:'CURRENT_VERSION_MISMATCH'});
  assert.ok(methods.length>0&&methods.every(method=>method==='GET'));
});
