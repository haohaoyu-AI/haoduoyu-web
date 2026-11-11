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
  commit:'b35dd510aec0fe67a88aa02edabcd73bfda9b33f',
  tree:'6b3daff954b41ce78654d3832863dab800a1494a',
  baseline:'3bd46508-c1fd-4845-af7d-93afc85b7d31',
  bytes:2680619,sha256:'f5271840e542b7d133b5e996a198e1c0a8387ef3ca6c4d45cdb5193dbfffa2eb',
  label:'production-review-collapse-20261108'});
// The exact previous artifact is available from the independently verified mobile release.
export const previousProductionRelease=Object.freeze({
  commit:'2627fc1f52e426169a5c8bc9939c5d74e8c7a24d',
  tree:'449c3df468d03f9ee1534451fcf4b7f8d8bf4b82',
  baseline:'d0a6a92b-9047-44aa-8e1f-36f7d01aed54',
  originalBaseline:'808dbbdd-1a51-428d-9d92-54954dc05526',
  bytes:2675441,sha256:'cc810985a976267f027bfc917477e8994c9577cdeea43e224a5805ba86ac241a',
  label:'production-mobile-review-20261108'});
// Exact feature source; its additive D1 schema was applied separately before release.
export const openaiReviewRelease=Object.freeze({
  commit:'5044ed66af80f9593879453d23c88c3851a06f12',
  tree:'a80a139cc4d71bc24a246c6805cd449d8842a882',
  baseline:'aa6a7a87-4a7a-4765-902a-ae727d6ed259',
  bytes:2783657,sha256:'231a4fd783cf05611290b74d9fbc45c3be6903f7ec73749ad96eae3017cf16f0',
  label:'production-ai-diagnosis-runtime-repair-20261108'});
// Exact remote candidate/tree verified against isolated browser acceptance.
// Fixed production v95 entrypoint bytes independently match source 1c7b8b0:
// 2818733 bytes, SHA256 256722179e6ba26a4bc6c98e1dd6608eaae7acee3780d687d3fc86fbb988056a.
// The existing runtime guard still rechecks the active version and inherited bindings.
export const dataTrendsRelease=Object.freeze({
  commit:'334e00d676452cc47e044cb4f88f8209b1c411b0',
  tree:'b369353b7932880d80bae5b28e1a880b34929f0c',
  baseline:'4d874ca9-ede5-4e03-a7e5-ef3c1bc0babd',
  bytes:2844076,sha256:'f6ca099166856484fcff442aa56b5904cebb76b323b10978b8f38bc50fa56325',
  label:'production-data-trends-20261110'});
// Robots-only patch on the exact current data-trends production source.
// Runtime bindings, authentication, database and Cloudflare settings are unchanged.
export const claudeRobotsRelease=Object.freeze({
  commit:'52f5f32f29526b302e0f58bf3272f2d636f782a4',
  tree:'1f6a81efb262487d0051258179e643ea1ebb6393',
  baseline:'a9dde039-ee54-4b54-9eb6-495cdcee3956',
  bytes:2844394,sha256:'76650eec2aa59bc5ab5d4ccb7d5c1681718859b4b8118d02886abafa790e10b4',
  label:'production-claude-public-robots-20261110'});
// Exact PR46 presentation-only source; inherits existing production bindings and guards.
export const claudeTrendsRelease=Object.freeze({
  commit:'e993885c752e97532214ef14a2fcf32b324bc08c',
  tree:'c1cde2cf59de1dddc28cc9e5a3401b72bea2871f',
  baseline:'c0b4f9c0-810f-45dd-ab1b-17ca3a54f750',
  bytes:2852117,sha256:'e2d26a1967a346c9a6d78f088945467359fee3dddede6f48027a307470de2651',
  label:'production-claude-review-trends-20261111'});
// Exact daily-notes retained-draft fix on top of the deployed PR46 source; frontend only, inherits bindings and guards.
export const claudeNotesDraftsRelease=Object.freeze({
  commit:'bc8449887e6b88f11b05ccbed13613f2f34e9b57',
  tree:'7c7f9bd1345db9cfa8b6e47e218c5f0390389d69',
  baseline:'b0d087c9-0713-45b0-bbed-2cde9e100c16',
  bytes:2857206,sha256:'62994011a7d233ce396248ca9a610f0b1eaa6a374aef9c3d56c157df0cfac2fb',
  label:'production-claude-notes-drafts-20261111'});
const acceptedRelease=commit=>commit===claudeNotesDraftsRelease.commit?claudeNotesDraftsRelease:
  commit===claudeTrendsRelease.commit?claudeTrendsRelease:
  commit===claudeRobotsRelease.commit?claudeRobotsRelease:
  commit===dataTrendsRelease.commit?dataTrendsRelease:
  commit===openaiReviewRelease.commit?openaiReviewRelease:
  commit===productionRestore.commit?productionRestore:
  commit===previousProductionRelease.commit?previousProductionRelease:releases[commit];
function requirePinnedSource(release) {
  if(release.tree&&(!/^[0-9a-f]{40}$/.test(release.commit||'')||!/^[0-9a-f]{40}$/.test(release.tree)))
    deny('The exact verified remote production source commit and tree must be pinned before release.');
  return release;
}
export function validateRequest(env) {
  if(env.GITHUB_REPOSITORY!==repository||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch')
    deny('Release requires this repository, main branch and manual workflow_dispatch.');
  if(env.LOCAL_UPLOAD_STOPPED!=='true')deny('Confirm local uploads have stopped and uncertain results have been reconciled.');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.EXPECTED_CURRENT_VERSION||''))
    deny('An explicitly verified current production version UUID is required.');
  const release=acceptedRelease(env.TARGET_COMMIT);
  if(!release)deny('Target commit is not an explicitly approved release or rollback.');
  requirePinnedSource(release);
  if(release.tree&&!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(release.baseline||''))
    deny('The exact production rollback baseline must be pinned before this release can run.');
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
  requirePinnedSource(release);
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
  requirePinnedSource(release);
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
