import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execute=promisify(execFile);
const root=fileURLToPath(new URL('../../',import.meta.url));
export const approvedSourceCommits=Object.freeze([
  '947bc782ea70e7808f6e7de523e5977818b292df',
  '16ff80ef2d857676d81b7c219110c820de5af72b'
]);
export const reviewedBadgeSourceCommit='3a87479d30ac4cf2b9bc484a51106713fa4c510f';

export async function currentSourceCommit() {
  const {stdout}=await execute('git',['rev-parse','HEAD'],{cwd:root,timeout:10000});
  return stdout.trim();
}

export async function buildApprovedWorker(commit) {
  assert.ok(approvedSourceCommits.includes(commit),'Only the two fixed approved source commits are executable fixtures');
  return buildHistoricalWorker(commit);
}

export async function buildReviewedBadgeWorker() {
  return buildHistoricalWorker(reviewedBadgeSourceCommit);
}

async function buildHistoricalWorker(commit) {
  assert.ok([...approvedSourceCommits,reviewedBadgeSourceCommit].includes(commit),
    'Only the fixed approved releases and independently reviewed badge checkpoint are executable fixtures');
  const temporary=await mkdtemp(join(tmpdir(),'haoduoyu-release-fixture-'));
  try {
    const source=join(temporary,'source'),archive=join(temporary,'source.tar');
    await mkdir(source);
    // No checkout or fetch: CI retains full history. Build the actual approved
    // tracked source in isolation, leaving today's source and dist untouched.
    await execute('git',['archive','--format=tar',`--output=${archive}`,commit],{cwd:root,timeout:10000});
    await execute('tar',['-xf',archive,'-C',source],{timeout:10000});
    await symlink(join(root,'node_modules'),join(source,'node_modules'),'dir');
    // Do not pass release credentials or arbitrary Node hooks into old fixtures.
    await execute(process.execPath,['scripts/build.mjs'],{cwd:source,timeout:60000,
      env:{PATH:process.env.PATH},maxBuffer:1024*1024});
    return await readFile(join(source,'dist/server/index.js'));
  }finally {
    await rm(temporary,{recursive:true,force:true});
  }
}
