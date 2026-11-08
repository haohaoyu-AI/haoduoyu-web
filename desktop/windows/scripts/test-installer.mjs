// Cross-platform source/inventory tests only. They do not execute WiX, Windows Installer, or the application.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
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

test('MSI property reads use an indexed property getter and keep identity/scope checks mandatory', () => {
  const qa = readFileSync(join(desktopRoot, 'scripts/test-installer-windows.ps1'), 'utf8');
  assert.match(qa, /InvokeMember\('StringData', \[Reflection.BindingFlags\]::GetProperty,/);
  assert.doesNotMatch(qa, /\$record\.StringData\(/);
  assert.equal((qa.match(/Read-MsiProperty \$database '[^']+' -Optional/g) || []).length, 1);
  assert.match(qa, /\(Read-MsiProperty \$database 'ALLUSERS' -Optional\) -eq ''/);
  for (const property of ['ProductCode', 'UpgradeCode', 'ProductVersion', 'MSIRESTARTMANAGERCONTROL', 'REBOOT']) {
    assert.ok(qa.includes(`Read-MsiProperty $database '${property}')`), property);
  }
});

test('MSI registration checks use the exact current-user API before preflight, not an ARP registry key', () => {
  const qa = readFileSync(join(desktopRoot, 'scripts/test-installer-windows.ps1'), 'utf8');
  const helper = readFileSync(join(desktopRoot, 'installer/Fixtures/MsiCancellation.cs'), 'utf8');
  assert.doesNotMatch(qa, /function Product-Key|CurrentVersion\\Uninstall|Win32_Product|MsiQueryProductState/);
  assert.match(qa, /function Get-RegistrationState\(\[string\]\$Code\) \{ return \[NativeInstallerRegistration\]::GetState\(\$Code\) \}/);
  assert.equal((qa.match(/Add-Type -Path/g) || []).length, 1);
  assert.ok(qa.indexOf('Add-Type -Path') < qa.indexOf('(Is-Registered $candidate.product_code)'));
  assert.match(helper, /EntryPoint = "MsiGetProductInfoExW"/);
  assert.match(helper, /return GetState\(productCode, GetProductInfo\);/);
  assert.match(helper, /read\(code, null, UserUnmanaged, "State", value, ref characters\)/);
  assert.doesNotMatch(helper, /RegistryKey|MsiEnumProducts|MsiQueryProductState/);
});

test('PowerShell compiles and exercises exact MSI registration states and cleanup with no Windows APIs', t => {
  // Compile the actual helper with an internal synthetic reader. Never call its native entry point,
  // and extract only parsed functions/finally code rather than executing the installation script.
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$source = Get-Content -LiteralPath $env:HDY_INSTALLER_HELPER -Raw
Add-Type -TypeDefinition ($source + @'
public static class SyntheticRegistrationRegression {
    private const string Code = "{12345678-90AB-CDEF-1234-567890ABCDEF}";
    private static uint Result;
    private static string Value;
    private static uint Length;
    private static int Calls;
    private static bool ThrowRead;
    private static uint Read(string code, string sid, uint context, string property, StringBuilder value, ref uint characters) {
        Calls++;
        if (code != Code || sid != null || context != 2 || property != "State" || characters != 2 || value.Capacity != 2)
            throw new Exception("Query changed the exact product, current user, USERUNMANAGED context, property or bounded buffer.");
        if (ThrowRead) throw new InvalidOperationException("Synthetic native reader failure.");
        value.Append(Value); characters = Length;
        return Result;
    }
    private static void Set(uint result, string value, uint length) { Result = result; Value = value; Length = length; Calls = 0; ThrowRead = false; }
    private static NativeInstallerRegistrationState Query(string code) { return NativeInstallerRegistration.GetState(code, Read); }
    public static void Run() {
        foreach (string code in new [] { Code, Code.ToLowerInvariant(), Code.Substring(1, 36), Code.Substring(1, 36).ToLowerInvariant() }) {
            Set(0, "5", 1);
            if (Query(code) != NativeInstallerRegistrationState.Installed || Calls != 1) throw new Exception("Installed/canonical GUID regression.");
        }
        Set(0, "1", 1);
        if (Query(Code) != NativeInstallerRegistrationState.Advertised || Calls != 1) throw new Exception("Advertised is not installed or absent.");
        Set(1605, "5", 1);
        if (Query(Code) != NativeInstallerRegistrationState.Absent || Calls != 1) throw new Exception("Only ERROR_UNKNOWN_PRODUCT proves absence.");
        foreach (uint error in new uint[] { 5, 87, 234, 1608, 1610, 1612, 1627, 9999 }) {
            Set(error, "5", 1);
            try { Query(Code); throw new Exception("API error was accepted: " + error); }
            catch (Win32Exception ex) {
                if (ex.NativeErrorCode != error || !ex.Message.Contains(Code) || !ex.Message.Contains("current-user USERUNMANAGED")) throw;
            }
            if (Calls != 1) throw new Exception("API error caused a retry/context fallback.");
        }
        foreach (string value in new [] { "", "0", "2", "3", "4", "-1", "05", " 5", "5 ", "500" }) {
            Set(0, value, (uint)value.Length);
            try { Query(Code); throw new Exception("Unexpected state was accepted."); }
            catch (InvalidOperationException ex) { if (!ex.Message.Contains("Unexpected MSI State")) throw; }
        }
        foreach (uint length in new uint[] { 0, 2, uint.MaxValue }) {
            Set(0, "5", length);
            try { Query(Code); throw new Exception("Invalid state length was accepted."); }
            catch (InvalidOperationException ex) { if (!ex.Message.Contains("Unexpected MSI State")) throw; }
        }
        foreach (string code in new [] { null, "", " ", Guid.Empty.ToString("D"), Guid.Empty.ToString("B"), Code + " ", " " + Code, Code.Replace("-", ""), "(" + Code.Substring(1, 36) + ")", "not-a-product", Code + Code }) {
            Set(0, "5", 1);
            try { Query(code); throw new Exception("Invalid/ambiguous product GUID was accepted."); }
            catch (ArgumentException ex) { if (ex.ParamName != "productCode") throw; }
            if (Calls != 0) throw new Exception("Invalid identity reached native reader.");
        }
        Set(0, "5", 1); ThrowRead = true;
        try { Query(Code); throw new Exception("Native exception was swallowed."); }
        catch (InvalidOperationException ex) { if (ex.Message != "Synthetic native reader failure.") throw; }
        var native = typeof(NativeInstallerRegistration).GetMethod("GetProductInfo", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        var import = (DllImportAttribute)Attribute.GetCustomAttribute(native, typeof(DllImportAttribute));
        if (import.Value != "msi.dll" || import.EntryPoint != "MsiGetProductInfoExW" || import.CharSet != CharSet.Unicode || !import.ExactSpelling)
            throw new Exception("Incorrect native API binding.");
    }
}
'@)
[SyntheticRegistrationRegression]::Run()
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:HDY_INSTALLER_TEST_SCRIPT, [ref]$tokens, [ref]$errors)
if (@($errors).Count) { throw ($errors | Out-String) }
foreach ($name in @('Is-Registered', 'Assert-True')) {
    $functions = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $false))
    if ($functions.Count -ne 1) { throw "Expected exactly one $name function." }
    . ([scriptblock]::Create($functions[0].Extent.Text))
}
$candidate = @{ product_code = '12345678-90AB-CDEF-1234-567890ABCDEF' }
$older = @{ product_code = '22345678-90AB-CDEF-1234-567890ABCDEF' }
function Get-RegistrationState([string]$Code) {
    if (-not $script:states.ContainsKey($Code)) { throw 'Queried a product outside the exact test identities.' }
    $script:queries.Add($Code)
    if ($script:states[$Code] -eq 'error') { throw 'Synthetic registration query failure.' }
    return [NativeInstallerRegistrationState]$script:states[$Code]
}
function Invoke-Msi {
    param([string]$Operation, [string]$Target, [string]$Name)
    if ($Operation -ne '/x' -or $Target -notin @(('{' + $candidate.product_code + '}'), ('{' + $older.product_code + '}'))) { throw 'Cleanup requested an unexpected operation/product.' }
    $code = $Target.Substring(1, 36)
    if ($Name -cne ('cleanup-' + $code)) { throw 'Cleanup changed the exact product identity.' }
    $script:uninstalls.Add($code)
    if ($script:uninstallFailure -eq $code) { throw 'Synthetic uninstall failure.' }
    if ($script:leaveRegistered -ne $code) { $script:states[$code] = 'Absent' }
}
function Save-Evidence { $script:saved = $true }
function Reset-SyntheticState([string]$CandidateState, [string]$OlderState) {
    $script:states = @{ $candidate.product_code = $CandidateState; $older.product_code = $OlderState }
    $script:queries = [Collections.Generic.List[string]]::new()
    $script:uninstalls = [Collections.Generic.List[string]]::new()
    $script:uninstallFailure = ''; $script:leaveRegistered = ''; $script:saved = $false
    $script:report = [ordered]@{ status = 'failed'; cleanup = 'not_run' }
}
foreach ($state in @('Absent', 'Installed')) {
    Reset-SyntheticState $state 'Absent'
    $actual = Is-Registered $candidate.product_code
    if ($actual -isnot [bool] -or $actual -ne ($state -eq 'Installed')) { throw 'Registration boolean conflated absence and installation.' }
}
foreach ($state in @('Advertised', 'error')) {
    Reset-SyntheticState $state 'Absent'
    try { $null = Is-Registered $candidate.product_code; throw 'Registration assertion treated advertisement/query error as absence or success.' }
    catch {
        $expected = if ($state -eq 'Advertised') { 'advertised, not installed' } else { 'Synthetic registration query failure.' }
        if (-not $_.Exception.Message.Contains($expected)) { throw }
    }
}
$lifecycle = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] -and $null -ne $_.Finally })
if ($lifecycle.Count -ne 1) { throw 'Expected one top-level lifecycle cleanup.' }
$finally = $lifecycle[0].Finally.Extent.Text
$cleanup = [scriptblock]::Create($finally.Substring(1, $finally.Length - 2))
Reset-SyntheticState 'Installed' 'Advertised'
. $cleanup
if ($script:uninstalls.Count -ne 2 -or $script:queries.Count -ne 4 -or $report.cleanup -ne 'completed_or_not_needed' -or -not $saved) { throw ('Cleanup missed an installed/advertised exact test product or failed to verify absence: ' + ($report | ConvertTo-Json)) }
Reset-SyntheticState 'Absent' 'Absent'
. $cleanup
if ($script:uninstalls.Count -ne 0 -or $report.cleanup -ne 'completed_or_not_needed') { throw 'Cleanup tried uninstalling absent products.' }
foreach ($failure in @('query', 'uninstall', 'still-registered')) {
    Reset-SyntheticState 'Installed' 'Installed'
    if ($failure -eq 'query') { $script:states[$candidate.product_code] = 'error' }
    elseif ($failure -eq 'uninstall') { $script:uninstallFailure = $candidate.product_code }
    else { $script:leaveRegistered = $candidate.product_code }
    . $cleanup
    if ($report.cleanup -ne 'failed' -or $report.cleanup_errors.Count -ne 1 -or -not $saved) { throw 'Cleanup concealed registration/uninstall failure or did not save evidence.' }
    if ($script:uninstalls -notcontains $older.product_code -or $script:states[$older.product_code] -ne 'Absent') { throw 'One product failure skipped cleanup of the other exact product.' }
    if ($failure -eq 'query' -and $script:uninstalls -contains $candidate.product_code) { throw 'Unknown registration allowed an uninstall.' }
}
Reset-SyntheticState 'error' 'Absent'
$report.status = 'passed'
try { . $cleanup; throw 'Cleanup failure left a successful run.' }
catch { if (-not $_.Exception.Message.Contains('MSI cleanup failed')) { throw } }
if (-not $saved) { throw 'Cleanup failed without saving evidence.' }
'MSI registration and cleanup synthetic regression passed; no Windows API or installation was run.'
`;
  const result = spawnSync(process.env.HDY_PWSH || 'pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding:'utf8', timeout:60_000,
    env:{...process.env, HDY_INSTALLER_TEST_SCRIPT:join(desktopRoot, 'scripts/test-installer-windows.ps1'), HDY_INSTALLER_HELPER:join(desktopRoot, 'installer/Fixtures/MsiCancellation.cs')},
  });
  if (result.error?.code === 'ENOENT' && !process.env.HDY_PWSH && process.platform !== 'win32') {
    t.skip('PowerShell unavailable; set HDY_PWSH to an official PowerShell 7 executable. Runtime regression not counted as passed.');
    return;
  }
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /MSI registration and cleanup synthetic regression passed/);
});

test('PowerShell executes the real MSI property reader against synthetic indexed properties without Windows APIs', t => {
  // Extract only the reader's parsed function definition. Never dot-source the installation script.
  const script = String.raw`
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:HDY_INSTALLER_TEST_SCRIPT, [ref]$tokens, [ref]$errors)
if (@($errors).Count) { throw ($errors | Out-String) }
$functions = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Read-MsiProperty' }, $false))
if ($functions.Count -ne 1) { throw 'Expected exactly one MSI property reader.' }
. ([scriptblock]::Create($functions[0].Extent.Text))
Add-Type -TypeDefinition @'
using System;
using System.Runtime.CompilerServices;
public sealed class SyntheticMsiRecord {
    public string Value;
    public bool ReturnNull;
    public bool FailRead;
    public int LastIndex;
    [IndexerName("StringData")]
    public string this[int index] {
        get {
            LastIndex = index;
            if (index != 1) throw new Exception("Wrong field index.");
            if (FailRead) throw new Exception("Synthetic property read failure.");
            return ReturnNull ? null : Value;
        }
    }
}
public sealed class SyntheticMsiView {
    public SyntheticMsiRecord Record;
    public string FailAt;
    public int Executions;
    public int Closes;
    public void Execute() { Executions++; if (FailAt == "Execute") throw new Exception("Synthetic execute failure."); }
    public SyntheticMsiRecord Fetch() { if (FailAt == "Fetch") throw new Exception("Synthetic fetch failure."); return Record; }
    public void Close() { Closes++; }
}
public sealed class SyntheticMsiDatabase {
    public SyntheticMsiView View = new SyntheticMsiView();
    public string LastQuery;
    public SyntheticMsiView OpenView(string query) { LastQuery = query; return View; }
}
'@
function New-SyntheticDatabase($Value, [switch]$Missing) {
    $database = [SyntheticMsiDatabase]::new()
    if (-not $Missing) {
        $database.View.Record = [SyntheticMsiRecord]::new()
        $database.View.Record.ReturnNull = $null -eq $Value
        $database.View.Record.Value = $Value
    }
    return $database
}
function Assert-Closed($Database) {
    if ($Database.View.Executions -ne 1 -or $Database.View.Closes -ne 1) { throw 'View must execute once and close once, including failures.' }
}
function Assert-ReadFailure($Database, [string]$Name, [string]$Expected, [switch]$Optional) {
    try { $null = Read-MsiProperty $Database $Name -Optional:$Optional; throw 'Reader unexpectedly accepted invalid evidence.' }
    catch { if (-not $_.Exception.Message.Contains($Expected)) { throw } }
    Assert-Closed $Database
}
$values = [ordered]@{
    ProductCode = '{11111111-1111-1111-1111-111111111111}'
    UpgradeCode = '{22222222-2222-2222-2222-222222222222}'
    ProductVersion = '0.19.0'
    MSIRESTARTMANAGERCONTROL = 'Disable'
    REBOOT = 'ReallySuppress'
}
foreach ($name in $values.Keys) {
    $database = New-SyntheticDatabase $values[$name]
    $value = Read-MsiProperty $database $name
    if ($value -isnot [string] -or $value -cne $values[$name]) { throw "Wrong property value: $name" }
    if ($name -in @('ProductCode', 'UpgradeCode') -and $value.Trim('{}') -cne $values[$name].Substring(1, 36)) { throw 'Identity cannot be compared.' }
    if ($database.View.Record.LastIndex -ne 1) { throw 'Did not read MSI field 1.' }
    $expectedQuery = 'SELECT ' + [char]96 + 'Value' + [char]96 + ' FROM ' + [char]96 + 'Property' + [char]96 + ' WHERE ' + [char]96 + 'Property' + [char]96 + " = '$name'"
    if ($database.LastQuery -cne $expectedQuery) { throw 'Wrong property query.' }
    Assert-Closed $database
    Assert-ReadFailure (New-SyntheticDatabase -Missing) $name "Required MSI property '$name' is missing."
    Assert-ReadFailure (New-SyntheticDatabase '') $name "Required MSI property '$name' is empty."
    Assert-ReadFailure (New-SyntheticDatabase $null) $name "MSI property '$name' did not return a string."
}
# Only absence/empty string is optional; a present machine-scope value must survive for the caller to reject.
foreach ($value in @('', '1', '2')) {
    $database = New-SyntheticDatabase $value
    if ((Read-MsiProperty $database 'ALLUSERS' -Optional) -cne $value) { throw 'Optional property was replaced by a default.' }
    Assert-Closed $database
}
$database = New-SyntheticDatabase -Missing
if ((Read-MsiProperty $database 'ALLUSERS' -Optional) -cne '') { throw 'Missing ALLUSERS is not empty.' }
Assert-Closed $database
Assert-ReadFailure (New-SyntheticDatabase -Missing) 'ALLUSERS' "Required MSI property 'ALLUSERS' is missing."
Assert-ReadFailure (New-SyntheticDatabase $null) 'ALLUSERS' "MSI property 'ALLUSERS' did not return a string." -Optional
foreach ($failure in @('Execute', 'Fetch')) {
    $database = New-SyntheticDatabase 'unused'
    $database.View.FailAt = $failure
    Assert-ReadFailure $database 'ProductCode' ("Synthetic " + $failure.ToLowerInvariant() + ' failure.')
}
$database = New-SyntheticDatabase 'unused'
$database.View.Record.FailRead = $true
Assert-ReadFailure $database 'ProductCode' 'Synthetic property read failure.'
'MSI property reader synthetic regression passed; no COM, Windows API or installation was run.'
`;
  const result = spawnSync(process.env.HDY_PWSH || 'pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding:'utf8', timeout:60_000,
    env:{...process.env, HDY_INSTALLER_TEST_SCRIPT:join(desktopRoot, 'scripts/test-installer-windows.ps1')},
  });
  if (result.error?.code === 'ENOENT' && !process.env.HDY_PWSH && process.platform !== 'win32') {
    t.skip('PowerShell unavailable; set HDY_PWSH to an official PowerShell 7 executable. Runtime regression not counted as passed.');
    return;
  }
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /MSI property reader synthetic regression passed/);
});
