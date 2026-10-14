// Focused offline regression gate for the two private-draft delivery methods.
// Fixtures are synthetic; passing does not establish real platform success.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const suites = [
  'private-draft-transfer-integration',
  'private-draft-executor',
  'private-draft-executor-integration',
  'cua-platform-method-routing',
  'cua-draft-runner',
  'cua-draft-runner-negative',
  'cua-draft-runner-native',
  'cua-draft-runner-native-continuation',
  'cua-draft-runner-diagnostics',
  'cua-zhihu-account-readiness',
  'draftjs-dom-readback',
  'cua-runtime-standalone-local',
  'article-upload-runtime',
  'article-upload-runtime-mcp',
  'browser-upload-bridge',
  'browser-upload-bridge-finish',
  'browser-upload-host',
  'browser-upload-file-handoff-bridge',
  'browser-upload-integration',
  'browser-upload-legacy-bridge',
  'browser-upload-tool-diagnostics',
  'browser-upload-server-diagnostics',
  'browser-upload-error-sources',
  'article-upload-word-reuse',
  'word-recovery-source-url',
  'article-upload-word-inspection',
  'article-upload-consume-query',
  'article-upload-consume-diagnostics',
  'article-upload-file-handoff',
  'article-upload-reimport',
  'article-upload-legacy-reimport',
  'article-upload-unconsumed-continuation',
  'article-upload-unconsumed-concurrency',
  'article-upload-reimport-migration',
  'article-upload-unconsumed-migration',
  'article-upload-execution-end',
  'upload-attempt-guards',
  'upload-readback-schema',
  'prepared-article',
];

let failures=0;
for (const name of suites) {
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(`./${name}.mjs`,import.meta.url))],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',timeout:120000,
  });
  const passed=result.status===0&&!result.error;
  console.log(`${passed?'PASS':'FAIL'} ${name}`);
  if (!passed) { failures++;console.error(result.error?.message||result.stderr||result.stdout); }
}
console.log(`${suites.length-failures}/${suites.length} offline suites passed; no real platform acceptance or GUI capability asserted.`);
process.exitCode=failures?1:0;
