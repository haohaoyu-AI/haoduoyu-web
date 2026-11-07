import {createHash} from 'node:crypto';
import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

class PolicyFailure extends Error {}
const deny=message=>{throw new PolicyFailure(message);};
export const repository='haohaoyu-AI/haoduoyu-web';
export const releases=Object.freeze({
  '947bc782ea70e7808f6e7de523e5977818b292df':Object.freeze({
    ci:40291598628,bytes:1244002,sha256:'3c106a1a3bbd570d72f3784970a09af09caec653ffa9869550649d1144e43de0',label:'round6'}),
  '16ff80ef2d857676d81b7c219110c820de5af72b':Object.freeze({
    ci:40269439403,bytes:1269372,sha256:'61e30101b744f56bfe10418cb536b661e9bac5ca8270041b510f6222434c4149',label:'round5-rollback'})
});
export const productionRestore=Object.freeze({
  commit:'81cd30a2276c058668ff48198be1bc3d116d9839',
  tree:'3c2c20c6e4e80ddb09e1d5876a1925ef9679ca2c',
  baseline:'b086dec1-050d-4aeb-a59a-8a82c633d3ef',
  bytes:2668225,sha256:'c3a217454f9459bf18cd902ec7c3b758755e67811cad38ed9175d2578cd270b9',
  label:'production-reminder-markdown-20261107'});
const acceptedRelease=commit=>commit===productionRestore.commit?productionRestore:releases[commit];
export function validateRequest(env) {
  if(env.GITHUB_REPOSITORY!==repository||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')
    deny('Release requires this repository, main branch and manual workflow_dispatch.');
  if(env.LOCAL_UPLOAD_STOPPED!=='true')deny('Confirm local uploads have stopped and uncertain results have been reconciled.');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.EXPECTED_CURRENT_VERSION||''))
    deny('An explicitly verified current production version UUID is required.');
  const release=acceptedRelease(env.TARGET_COMMIT);
  if(!release)deny('Target commit is not an explicitly approved release or rollback.');
  if(release.baseline&&env.EXPECTED_CURRENT_VERSION!==release.baseline)
    deny('The production restore requires its exact independently verified baseline version.');
  return release;
}
export async function verifyCI(commit,{request=fetch,token}={}) {
  const release=releases[commit];if(!release)deny('Unknown release.');
  const response=await request(`https://api.github.com/repos/${repository}/actions/runs/${release.ci}`,{
    headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})},
    redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)deny(`Approved CI run lookup failed: HTTP ${response.status}.`);
  const data=await response.json();
  if(data.id!==release.ci||data.head_sha!==commit||data.status!=='completed'||data.conclusion!=='success'||
    data.path!=='.github/workflows/ci.yml'||data.event!=='push'||data.repository?.full_name!==repository)
    deny('The exact approved Foundation CI run has not succeeded for this commit.');
  return release;
}
// This reviewed production-source candidate uses the full-history scan and exact build
// in the release job, rather than the unrelated historical quality-test gate.
// All other releases retain their exact successful Foundation CI requirement.
export async function verifyEligibility(commit,{request=fetch,token}={}) {
  const release=acceptedRelease(commit);if(!release)deny('Unknown release.');
  if(!release.tree)return verifyCI(commit,{request,token});
  const response=await request(`https://api.github.com/repos/${repository}/git/commits/${commit}`,{
    headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})},
    redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)deny(`Pinned production source lookup failed: HTTP ${response.status}.`);
  const data=await response.json();
  if(data.sha!==commit||data.tree?.sha!==release.tree)
    deny('The exact recovered production source commit and tree are required.');
  return release;
}
export function verifyWorker(bytes,commit) {
  const release=acceptedRelease(commit);if(!release)deny('Unknown release.');
  if(bytes.byteLength!==release.bytes||createHash('sha256').update(bytes).digest('hex')!==release.sha256)
    deny('Built Worker does not match the accepted release bytes and SHA-256.');
  return release;
}
async function main() {
  const env=process.env,release=validateRequest(env);
  if(process.argv[2]==='verify') {
    await verifyEligibility(env.TARGET_COMMIT,{token:env.GITHUB_TOKEN});
    if(!env.GITHUB_OUTPUT)deny('GitHub output path is required.');
    await appendFile(env.GITHUB_OUTPUT,`target_commit=${env.TARGET_COMMIT}\nworker_sha256=${release.sha256}\nworker_bytes=${release.bytes}\n`);
    console.log(`Approved ${release.label}: ${env.TARGET_COMMIT}; ${release.tree?'in-run full-history scan and exact artifact required':`CI ${release.ci}`}.`);
  }else if(process.argv[2]==='artifact') {
    verifyWorker(await readFile('source/dist/server/index.js'),env.TARGET_COMMIT);
    console.log(`Worker verified: ${release.bytes} bytes; SHA-256 ${release.sha256}.`);
  }else deny('Unknown release policy command.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{console.error(error instanceof PolicyFailure?error.message:
    'CI lookup or file verification failed; no Cloudflare upload was attempted.');process.exitCode=1;});
