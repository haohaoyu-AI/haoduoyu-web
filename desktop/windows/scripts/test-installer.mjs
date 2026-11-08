// Cross-platform source/inventory tests only. They do not execute WiX, Windows Installer, or the application.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {generateInstaller, checkVersion, wixVersion, upgradeCode} from './generate-installer.mjs';
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(run, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'haoduoyu-installer-source-test-'));
  const publishRoot = join(root, 'publish');
  const outputRoot = join(root, 'generated');
  mkdirSync(join(publishRoot, 'zh-Hans'), {recursive:true});
  const payload = {'Haoduoyu.Workbench.exe':'synthetic-not-executable', 'runtime.dll':'synthetic-runtime', 'zh-Hans/resources.dll':'合成资源'};
  for (const [path, content] of Object.entries(payload)) writeFileSync(join(publishRoot, path), content);
  const manifest = {schema:'haoduoyu-windows-build-v1', source_commit:'1'.repeat(40), runtime:'win-x64', self_contained:true, windows_publish:'passed', inventory_excludes:['build-manifest.json'], files:Object.entries(payload).map(([path, content]) => ({path, bytes:Buffer.byteLength(content), sha256:sha(content)}))};
  const save = () => writeFileSync(join(publishRoot, 'build-manifest.json'), JSON.stringify(manifest));
  save();
  try {
    mutate?.({root, publishRoot, manifest, save});
    return run({root, publishRoot, outputRoot, manifest, version:'0.19.0'});
  } finally { rmSync(root, {recursive:true, force:true}); }
}

test('complete hash-verified publish inventory produces deterministic per-file MSI sources', () => fixture(args => {
  const inventory = generateInstaller(args);
  const source = readFileSync(join(args.outputRoot, 'Payload.wxs'), 'utf8');
  assert.equal(inventory.wix_version, '4.0.6');
  assert.equal(inventory.upgrade_code, upgradeCode);
  assert.equal(inventory.files.length, args.manifest.files.length + 1);
  assert.equal(inventory.files.find(f => f.path === 'build-manifest.json').sha256, sha(readFileSync(join(args.publishRoot, 'build-manifest.json'))));
  assert.equal((source.match(/<File /g) || []).length, inventory.files.length);
  assert.equal((source.match(/KeyPath="yes"/g) || []).length, inventory.files.length + 1);
  assert.match(source, /Root="HKCU"/);
  assert.match(source, /Directory="HdyInstallFolder"/);
  assert.match(source, /<RemoveFolder .* On="uninstall"/);
  assert.match(source, /<RemoveFolder [^>]*Directory="HdyProgramsFolder" On="uninstall"/);
  assert.doesNotMatch(source, /RemoveFile|ForceDelete|CustomAction|https?:\/\/(?!wixtoolset.org)/);
  const again = generateInstaller(args);
  assert.equal(again.product_code, inventory.product_code);
  assert.equal(readFileSync(join(args.outputRoot, 'Payload.wxs'), 'utf8'), source);
  const newer = generateInstaller({...args, version:'0.20.0'});
  assert.notEqual(newer.product_code, inventory.product_code);
  assert.equal(newer.upgrade_code, inventory.upgrade_code);
  assert.deepEqual([...readFileSync(join(args.outputRoot, 'Payload.wxs'), 'utf8').matchAll(/<Component Id="[^"]+" Guid="([^"]+)"/g)].map(m => m[1]), [...source.matchAll(/<Component Id="[^"]+" Guid="([^"]+)"/g)].map(m => m[1]));
}));

test('same-version test fixture changes identity but not payload, scope or upgrade family', () => fixture(args => {
  const candidate = generateInstaller(args);
  const other = generateInstaller({...args, fixtureIdentity:'synthetic-same-version'});
  assert.notEqual(other.product_code, candidate.product_code);
  assert.equal(other.version, candidate.version);
  assert.equal(other.upgrade_code, candidate.upgrade_code);
  assert.deepEqual(other.files, candidate.files);
  assert.equal(other.fixture, true);
  assert.throws(() => generateInstaller({...args, fixtureIdentity:'unlabelled'}));
}));


test('a rebuilt source with a different verified payload gets a distinct product identity', () => fixture(args => {
  const candidate = generateInstaller(args);
  const content = 'another verified runtime build';
  writeFileSync(join(args.publishRoot, 'runtime.dll'), content);
  const file = args.manifest.files.find(f => f.path === 'runtime.dll');
  file.bytes = Buffer.byteLength(content); file.sha256 = sha(content);
  writeFileSync(join(args.publishRoot, 'build-manifest.json'), JSON.stringify(args.manifest));
  const rebuilt = generateInstaller(args);
  assert.notEqual(rebuilt.product_code, candidate.product_code);
  assert.equal(rebuilt.upgrade_code, candidate.upgrade_code);
}));

test('Windows Installer version constraints are explicit', () => {
  for (const value of ['0.0.0', '0.19.0', '255.255.65535']) assert.equal(checkVersion(value), value);
  for (const value of ['0.19.0.1', '0.19', '0.19.0-beta', '256.0.0', '0.256.0', '0.0.65536', '-1.2.3', '00.19.0']) assert.throws(() => checkVersion(value), value);
});

for (const [name, mutate] of [
  ['changed file bytes', ({publishRoot}) => writeFileSync(join(publishRoot, 'runtime.dll'), 'tampered')],
  ['extra undeclared file', ({publishRoot}) => writeFileSync(join(publishRoot, 'user-draft.json'), 'private')],
  ['missing declared file', ({publishRoot}) => rmSync(join(publishRoot, 'runtime.dll'))],
  ['case-insensitive duplicate', ({manifest, save}) => {manifest.files.push({...manifest.files[0], path:'HAODUOYU.WORKBENCH.EXE'}); save();}],
  ['traversal path', ({manifest, save}) => {manifest.files[0].path = '../private.txt'; save();}],
  ['absolute path', ({manifest, save}) => {manifest.files[0].path = 'C:\\private.txt'; save();}],
  ['reserved Windows basename', ({manifest, save}) => {manifest.files[0].path = 'NUL.txt'; save();}],
  ['alternate data stream', ({manifest, save}) => {manifest.files[0].path = 'runtime.dll:secret'; save();}],
  ['trailing dot alias', ({manifest, save}) => {manifest.files[0].path = 'runtime.dll.'; save();}],
  ['duplicate manifest itself', ({manifest, save}) => {manifest.files[0].path = 'build-manifest.json'; save();}],
  ['WiX preprocessor path injection', ({manifest, save}) => {manifest.files[0].path = '$(var.HiddenFile)'; save();}],
  ['data directory', ({manifest, save}) => {manifest.files[0].path = 'Haoduoyu/NativeWorkbench/v1/workspace.bin'; save();}],
  ['uncommitted source identity', ({manifest, save}) => {manifest.source_commit = 'dirty'; save();}],
  ['non-self-contained output', ({manifest, save}) => {manifest.self_contained = false; save();}],
  ['incomplete inventory', ({manifest, save}) => {manifest.inventory_excludes.push('private.txt'); save();}],
]) test(`rejects ${name} without trusting filenames or an incomplete inventory`, () => fixture(args => assert.throws(() => generateInstaller(args)), mutate));

test('legacy backslash paths normalize to the same safe publish inventory', () => fixture(args => {
  const output = generateInstaller(args);
  assert.ok(output.files.some(file => file.path === 'zh-Hans/resources.dll'));
}, ({manifest, save}) => {manifest.files.find(f => f.path.includes('/')).path = 'zh-Hans\\resources.dll'; save();}));

for (const kind of ['root', 'file', 'directory']) test(`rejects ${kind} links in publish payload`, t => fixture(args => {
  try {
    if (kind === 'root') {
      const link = join(args.root, 'linked-publish');
      symlinkSync(args.publishRoot, link, process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => generateInstaller({...args, publishRoot:link}));
    } else if (kind === 'file') {
      rmSync(join(args.publishRoot, 'runtime.dll'));
      symlinkSync(join(args.publishRoot, 'Haoduoyu.Workbench.exe'), join(args.publishRoot, 'runtime.dll'), 'file');
      assert.throws(() => generateInstaller(args));
    } else {
      mkdirSync(args.outputRoot);
      symlinkSync(args.outputRoot, join(args.publishRoot, 'linked-dir'), process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => generateInstaller(args));
    }
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') t.skip(`${kind} symlink creation denied by runner privilege; not counted as passed.`);
    else throw error;
  }
}));

test('installer output cannot be inserted into the publish payload', () => fixture(args => {
  for (const outputRoot of [args.publishRoot, join(args.publishRoot, 'installer')]) assert.throws(() => generateInstaller({...args, outputRoot}));
}));

test('authoring confines scope, upgrade rules and cleanup without launching processes', () => {
  const source = readFileSync(join(desktopRoot, 'installer/NativeWorkbench.wxs'), 'utf8');
  assert.match(source, /Scope="perUser"/);
  assert.match(source, /Schedule="afterInstallInitialize"/);
  assert.match(source, /AllowSameVersionUpgrades="no"/);
  assert.match(source, /HDY_SAME_VERSION/);
  assert.match(source, /Installed OR NOT HDY_SAME_VERSION/);
  assert.match(source, /Condition="NOT ALLUSERS"/);
  assert.match(source, /Id="MSIRESTARTMANAGERCONTROL" Value="Disable"/);
  assert.match(source, /Id="REBOOT" Value="ReallySuppress"/);
  assert.match(source, /Directory Id="HdyInstallFolder" Name="NativeWorkbench"/);
  assert.match(source, /<Shortcut /);
  assert.doesNotMatch(source, /<RemoveFile|<ServiceInstall|<Environment|<RegistryValue Root="HKLM"|<Directory[^>]+Name="v1"/);
  assert.equal((source.match(/<CustomAction /g) || []).length, 3);
  assert.match(source, /DllEntry="ValidateInstallOwnership"/);
  assert.match(source, /Action="HdyValidateInstallOwnership" After="CostFinalize"/);
  assert.match(source, /DllEntry="VerifyTransactionPaths" Execute="deferred" Impersonate="yes"/);
  assert.match(source, /Action="HdyGuardBeforeRemove" Before="RemoveShortcuts"/);
  assert.match(source, /Action="HdyGuardBeforeInstall" Before="InstallFiles"/);
  assert.doesNotMatch(source, /Impersonate="no"|Execute="rollback"/);
  assert.doesNotMatch(source, /<Property Id="INSTALLFOLDER"|<SetDirectory|<WixVariable|LaunchApplication|ExeCommand/);
  assert.match(readFileSync(join(desktopRoot, 'installer/NuGet.Config'), 'utf8'), /<clear\s*\/>/);
  assert.equal(wixVersion, '4.0.6');
});

test('CI keeps portable output before installer build and always preserves evidence with read-only permissions', () => {
  const workflow = readFileSync(join(desktopRoot, '../../.github/workflows/windows-desktop.yml'), 'utf8');
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write|id-token: write|gh release|CLOUDFLARE_API_TOKEN/);
  assert.ok(workflow.indexOf('run: ./scripts/package-windows.ps1') < workflow.indexOf('scripts/package-installer.ps1'));
  assert.match(workflow, /if: always\(\)/);
  const builder = readFileSync(join(desktopRoot, 'scripts/package-installer.ps1'), 'utf8');
  assert.match(builder, /'--version', \$wixVersion/);
  assert.match(builder, /'--allow-roll-forward'/);
  assert.doesNotMatch(builder, /'-sval'|'-sice|SuppressIces/);
});

test('real MSI guard validates registration, path chains and existing program/menu descendants without changing files', () => {
  const guard = readFileSync(join(desktopRoot, 'installer/Guard/InstallerGuard.cpp'), 'utf8');
  for (const required of ['MsiEnumRelatedProductsW', 'MsiGetProductInfoExW', 'MSIINSTALLCONTEXT_USERUNMANAGED', 'INSTALLPROPERTY_INSTALLLOCATION', 'FILE_FLAG_OPEN_REPARSE_POINT', 'FILE_ATTRIBUTE_REPARSE_POINT', 'GetFinalPathNameByHandleW', 'FOLDERID_Programs', 'CustomActionData', 'CheckTree(program)', 'CheckTree(menu)', 'nNumberOfLinks != 1', 'HDY_INSTALL_GUARD']) assert.ok(guard.includes(required), required);
  assert.doesNotMatch(guard, /DeleteFile|RemoveDirectory|CreateProcess|ShellExecute|WinHttp|WinInet|WriteFile/);
  const qa = readFileSync(join(desktopRoot, 'scripts/test-installer-windows.ps1'), 'utf8');
  for (const name of ['guard-reject-unowned-program-directory', 'guard-reject-unowned-startmenu-shortcut', 'guard-reject-program-ancestor-junction', 'guard-reject-program-final-junction', 'guard-reject-startmenu-final-junction', 'guard-reject-owned-tree-descendant-junction', 'guard-reject-owned-startmenu-junction', 'guard-reject-owned-program-file-hardlink', 'guard-reject-uninstall-redirected-program']) assert.ok(qa.includes(name), name);
});

test('PowerShell publish and installed inventory normalize a single separator, not a double string', () => {
  for (const file of ['scripts/package-windows.ps1', 'scripts/test-installer-windows.ps1']) {
    const source = readFileSync(join(desktopRoot, file), 'utf8');
    assert.ok(source.includes(".Replace('\\', '/')"), file);
    assert.ok(!source.includes(".Replace('\\\\', '/')"), file);
  }
});
