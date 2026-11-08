// Pure source/inventory generation. Running this on Linux is NOT MSI build or installation evidence.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, readdirSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import {resolve, dirname, join, relative, isAbsolute, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const upgradeCode = 'E13CC61A-A22B-4C8A-A8D2-8EAB92679C50';
export const wixVersion = '4.0.6';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const xml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[ch]));
const id = (prefix, path) => prefix + sha(path.toLowerCase()).slice(0, 32);
const guid = seed => {
  const chars = sha(seed).slice(0, 32).split('');
  chars[12] = '5'; chars[16] = '8';
  const hex = chars.join('').toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export function checkVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw Error('MSI version must have exactly three non-negative numeric fields.');
  const [major, minor, build] = version.split('.').map(Number);
  if (major > 255 || minor > 255 || build > 65535) throw Error('Version exceeds Windows Installer numeric limits.');
  return version;
}
function safePath(value) {
  // Portable manifests produced before the installer normalized Windows separators incorrectly; read both safely.
  if (typeof value !== 'string') throw Error('Inventory path must be a string.');
  const path = value.replaceAll('\\', '/');
  if (!path || isAbsolute(path) || path.split('/').some(p => !p || p === '.' || p === '..' ||
      /[\x00-\x1f<>:"|?*]/.test(p) || /[$!]\(/.test(p) || /[. ]$/.test(p) || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))) {
    throw Error(`Unsafe inventory path: ${value}`);
  }
  // These are never legitimate self-contained publish payload directories.
  if (path.split('/').some(p => /^(?:v1|workspace|workspaces|partitions|userdata)$/i.test(p))) throw Error(`User data is forbidden in payload: ${value}`);
  return path;
}
function filesUnder(root, prefix = '') {
  return readdirSync(join(root, prefix), {withFileTypes:true}).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) throw Error(`Linked publish payload: ${path}`);
    if (stat.isDirectory()) return filesUnder(root, path);
    if (!stat.isFile()) throw Error(`Non-file publish payload: ${path}`);
    return [path];
  });
}
export function generateInstaller({publishRoot, outputRoot, version, fixtureIdentity = ''}) {
  checkVersion(version);
  if (fixtureIdentity && !/^synthetic-(?:older|same-version)$/.test(fixtureIdentity)) throw Error('Unknown test fixture identity.');
  publishRoot = resolve(publishRoot); outputRoot = resolve(outputRoot);
  if (lstatSync(publishRoot).isSymbolicLink()) throw Error('Publish root cannot be a link.');
  if (realpathSync(publishRoot) !== publishRoot) throw Error('Publish root must be its real, non-linked path.');
  const outRelative = relative(publishRoot, outputRoot);
  if (!outRelative || (!outRelative.startsWith(`..${sep}`) && outRelative !== '..' && !isAbsolute(outRelative))) throw Error('Installer output must be outside publish root.');
  const manifestBytes = readFileSync(join(publishRoot, 'build-manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schema !== 'haoduoyu-windows-build-v1' || !/^[0-9a-f]{40}$/.test(manifest.source_commit) ||
      manifest.runtime !== 'win-x64' || manifest.self_contained !== true || manifest.windows_publish !== 'passed' ||
      !Array.isArray(manifest.files) || !manifest.files.length ||
      JSON.stringify(manifest.inventory_excludes) !== '["build-manifest.json"]') throw Error('Invalid exact-source publish manifest.');
  const seen = new Set();
  const files = manifest.files.map(file => {
    const path = safePath(file.path);
    if (seen.has(path.toLowerCase()) || path.toLowerCase() === 'build-manifest.json') throw Error(`Duplicate inventory path: ${path}`);
    seen.add(path.toLowerCase());
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/.test(file.sha256)) throw Error(`Invalid hash/length: ${path}`);
    return {path, bytes:file.bytes, sha256:file.sha256};
  });
  const diskFiles = filesUnder(publishRoot).map(safePath).sort();
  if (JSON.stringify(diskFiles) !== JSON.stringify([...files.map(f => f.path), 'build-manifest.json'].sort())) throw Error('Publish directory differs from the complete source manifest.');
  for (const file of files) {
    const bytes = readFileSync(join(publishRoot, file.path));
    if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw Error(`Publish hash mismatch: ${file.path}`);
  }
  if (!seen.has('haoduoyu.workbench.exe')) throw Error('Native executable missing.');
  files.push({path:'build-manifest.json', bytes:manifestBytes.length, sha256:sha(manifestBytes)});
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const productCode = guid(`haoduoyu-native-product:${manifest.source_commit}:${version}:${sha(JSON.stringify(files))}:${fixtureIdentity}`);
  const directories = new Set(['']);
  for (const file of files) {
    let dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    while (dir) { directories.add(dir); dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : ''; }
  }
  const dirId = path => path ? id('D_', path) : 'HdyInstallFolder';
  const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">', '  <Fragment>'];
  const childDirs = parent => [...directories].filter(dir => dir && (dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '') === parent).sort();
  function directoryNodes(parent, depth) {
    for (const dir of childDirs(parent)) {
      lines.push(`${' '.repeat(depth)}<Directory Id="${dirId(dir)}" Name="${xml(dir.slice(dir.lastIndexOf('/') + 1))}">`);
      directoryNodes(dir, depth + 2);
      lines.push(`${' '.repeat(depth)}</Directory>`);
    }
  }
  lines.push('    <DirectoryRef Id="HdyInstallFolder">');
  directoryNodes('', 6);
  lines.push('    </DirectoryRef>', '    <ComponentGroup Id="PublishPayload">');
  for (const file of files) {
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    const componentId = id('C_', file.path);
    // Per-user components use HKCU key paths (ICE38); stable path-based identity across major versions.
    lines.push(`      <Component Id="${componentId}" Guid="${guid(`haoduoyu-native-file:${file.path.toLowerCase()}`)}" Directory="${dirId(dir)}" Bitness="always64">`,
      `        <File Id="${id('F_', file.path)}" Source="${xml(join(publishRoot, file.path))}" Name="${xml(file.path.slice(file.path.lastIndexOf('/') + 1))}" />`,
      `        <RegistryValue Root="HKCU" Key="Software\\Haoduoyu\\NativeWorkbench\\Installer" Name="${componentId}" Type="integer" Value="1" KeyPath="yes" />`,
      '      </Component>');
  }
  // RemoveFolder removes only EMPTY program folders. No wildcard RemoveFile or data-folder cleanup.
  lines.push('      <Component Id="ProgramDirectories" Guid="A5FC3DC9-55AF-4C5B-9093-6578E194BAF9" Directory="HdyInstallFolder" Bitness="always64">',
    '        <RegistryValue Root="HKCU" Key="Software\\Haoduoyu\\NativeWorkbench\\Installer" Name="Directories" Type="integer" Value="1" KeyPath="yes" />');
  for (const dir of [...directories].sort()) lines.push(`        <RemoveFolder Id="${id('R_', dir)}" Directory="${dirId(dir)}" On="uninstall" />`);
  lines.push('        <RemoveFolder Id="RemoveVendorProgramsDirectory" Directory="HdyVendorProgramsFolder" On="uninstall" />',
    '        <RemoveFolder Id="RemoveEmptyProgramsDirectory" Directory="HdyProgramsFolder" On="uninstall" />',
    '      </Component>', '    </ComponentGroup>', '  </Fragment>', '</Wix>', '');
  const inventory = {
    schema:'haoduoyu-windows-installer-input-v1', source_commit:manifest.source_commit,
    version, product_code:productCode, upgrade_code:upgradeCode, wix_version:wixVersion,
    fixture:!!fixtureIdentity, fixture_identity:fixtureIdentity || null,
    install_directory:'%LOCALAPPDATA%\\Programs\\Haoduoyu\\NativeWorkbench',
    data_directory:'%LOCALAPPDATA%\\Haoduoyu\\NativeWorkbench\\v1', data_directory_owned:false,
    files,
  };
  mkdirSync(outputRoot, {recursive:true});
  writeFileSync(join(outputRoot, 'Payload.wxs'), lines.join('\n'));
  writeFileSync(join(outputRoot, 'installer-input.json'), JSON.stringify(inventory, null, 2) + '\n');
  return inventory;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [publishRoot, outputRoot, version, fixtureIdentity = ''] = process.argv.slice(2);
  if (!publishRoot || !outputRoot || !version) throw Error('Usage: node generate-installer.mjs publish-root output-root version [synthetic-older|synthetic-same-version]');
  const result = generateInstaller({publishRoot, outputRoot, version, fixtureIdentity});
  console.log(JSON.stringify({source_commit:result.source_commit, version:result.version, product_code:result.product_code, payload_files:result.files.length, fixture:result.fixture}));
}
