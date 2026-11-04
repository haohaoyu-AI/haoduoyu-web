// Static source observations only. This is not runtime security or Windows UI evidence.
import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import {resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const base = process.argv[2] || '6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c';
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const changes = new Set([
  ...git('diff', '--name-only', base).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean));
const permitted = path => path.startsWith('desktop/windows/') ||
  /^docs\/windows-desktop[^/]*(?:\/.*)?$/.test(path) ||
  path === '.github/workflows/windows-desktop.yml';
const failures = [];
for (const path of changes) if (!permitted(path)) failures.push(`Unexpected changed path: ${path}`);

function sourceFiles(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(item => {
    if (['bin', 'obj', 'artifacts', '.vs'].includes(item.name)) return [];
    const path = resolve(dir, item.name);
    return item.isDirectory() ? sourceFiles(path) : /\.(cs|xaml|csproj)$/.test(path) ? [path] : [];
  });
}
const sources = sourceFiles(resolve(root, 'desktop/windows'));
const productSources = sources.filter(path => !relative(root, path).split(/[\\/]/).some(part => part.endsWith('.Tests')));
const source = productSources.map(path => readFileSync(path, 'utf8')).join('\n');
if (!sources.some(path => path.endsWith('.csproj'))) failures.push('No native project source found');
if (!source.includes('<UseWPF>true</UseWPF>')) failures.push('Native WPF project declaration missing');
if (!source.includes('https://haoduoyu.xyz')) failures.push('Expected production service origin missing');
const forbidden = [
  [/\b(?:WebView2?|WebBrowser)\b/i, 'Embedded web renderer reference'],
  [/ServerCertificateCustomValidationCallback|DangerousAcceptAnyServerCertificateValidator/, 'TLS certificate validation override'],
  [/ServicePointManager\.ServerCertificateValidationCallback/, 'Global TLS validation override'],
  [/\bProcess\.Start\s*\(\s*"https?:/i, 'Browser launched as product UI'],
];
for (const path of productSources) {
  const body = readFileSync(path, 'utf8');
  for (const [pattern, label] of forbidden) if (pattern.test(body)) failures.push(`${label}: ${relative(root, path)}`);
}

const workflowPath = resolve(root, '.github/workflows/windows-desktop.yml');
let workflow;
try { workflow = readFileSync(workflowPath, 'utf8'); } catch { failures.push('Windows build workflow missing'); }
if (workflow) {
  for (const pattern of [/\bdeploy\b/i, /\bgh\s+release\b/i, /wrangler\s+(?:deploy|publish)/i,
    /CLOUDFLARE_API_TOKEN/, /contents:\s*write/, /id-token:\s*write/]) {
    if (pattern.test(workflow)) failures.push(`Windows build workflow includes forbidden publication/credential capability: ${pattern}`);
  }
}
if (failures.length) {
  console.error(JSON.stringify({kind: 'static-boundaries', base, failures}, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    kind: 'static-boundaries', base, sourceFileCount: sources.length, productSourceFileCount: productSources.length,
    changedPaths: [...changes].sort(),
    observations: ['Native WPF source declared', 'No embedded web renderer reference found',
      'Fixed expected service origin present', 'No TLS validation override found',
      'Changes isolated from website, Android, and production release controls',
      'Windows workflow has no publication permission or production credential reference'],
    limitations: ['Pattern scan covers product projects; test projects may contain forbidden strings as negative assertions',
      'Source pattern checks do not establish runtime request confinement, persistence safety, or Windows UI behavior'],
  }, null, 2));
}
