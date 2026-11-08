[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PublishRoot,
    [Parameter(Mandatory)][string]$DeliveryRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { throw 'MSI build requires Windows and PowerShell 7. Linux is not installation evidence.' }
$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$PublishRoot = (Resolve-Path -LiteralPath $PublishRoot).Path
$DeliveryRoot = (Resolve-Path -LiteralPath $DeliveryRoot).Path
$runRoot = Split-Path $PublishRoot -Parent
$installerRoot = Join-Path $runRoot 'installer'
$null = New-Item -ItemType Directory -Path $installerRoot
$manifestPath = Join-Path $DeliveryRoot 'installer-manifest.json'
$wixVersion = '4.0.6'
$state = [ordered]@{
    schema = 'haoduoyu-windows-installer-package-v1'
    delivery_kind = 'unsigned_per_user_msi_candidate'
    source_commit = $null
    version = $null
    wix = @{ package = 'wix'; version = $wixVersion; source = 'https://api.nuget.org/v3/index.json'; tool_target = 'net6.0'; host_roll_forward = 'explicit_dotnet_tool_allow_roll_forward' }
    install_directory = '%LOCALAPPDATA%\Programs\Haoduoyu\NativeWorkbench'
    data_directory = '%LOCALAPPDATA%\Haoduoyu\NativeWorkbench\v1'
    data_directory_owned = $false
    signed = $false
    published = $false
    automatic_updates = $false
    build = 'not_run'
    synthetic_hosted_windows_installation = 'not_run'
    interactive_installation = 'not_run'
    physical_device_acceptance = 'not_run'
    trust_and_signing_acceptance = 'not_run'
    fixture_validation_limits = 'Synthetic older/same-version fixtures reuse the exact candidate payload and change MSI metadata only. They do not validate real older-client binaries, user-data migration or compatibility with different payloads. Cross-version newly introduced filenames colliding with existing non-installer-owned files are not covered.'
    safety_gate = 'Embedded read-only native MSI gates validate current-user registered family ownership, fixed program/menu paths, reparse points and descendant links before file changes; no deletion or elevation. Check-to-use races are not claimed eliminated.'
    maintenance = 'Close the workbench yourself first. No Restart Manager application shutdown or automatic reboot.'
    version_policy = 'Three-field numeric MSI version; upgrades use a rollback transaction; downgrade and different-source same-version installs are blocked. The exact same MSI supports maintenance. No background updates.'
    error = $null
}
function Save-State { $state | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM }
function Invoke-Logged {
    param([string]$Command, [string[]]$Arguments, [string]$LogName)
    & $Command @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $DeliveryRoot $LogName)
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE. See $LogName." }
}
function Build-Msi {
    param([string]$SourceRoot, [string]$OutputPath, [string]$LogName)
    $inputManifest = Get-Content -LiteralPath (Join-Path $SourceRoot 'installer-input.json') -Raw | ConvertFrom-Json
    # Keep WiX's normal Windows Installer/ICE validation enabled. No -sval or suppressed ICE list.
    Invoke-Logged -Command $wix -Arguments @('build', (Join-Path $desktopRoot 'installer/NativeWorkbench.wxs'), (Join-Path $SourceRoot 'Payload.wxs'), '-arch', 'x64', '-d', "ProductVersion=$($inputManifest.version)", '-d', "ProductCode=$($inputManifest.product_code)", '-d', "GuardDll=$guardDll", '-pdbtype', 'none', '-intermediateFolder', (Join-Path $SourceRoot 'obj'), '-out', $OutputPath) -LogName $LogName
}
Save-State
try {
    $source = (& git -C $desktopRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $source -notmatch '^[0-9a-f]{40}$') { throw 'Cannot establish exact source commit.' }
    if ($env:GITHUB_SHA -and $env:GITHUB_SHA -ne $source) { throw 'GitHub source does not match checkout.' }
    $repositoryRoot = (& git -C $desktopRoot rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read repository root.' }
    $changes = @(& git -C $repositoryRoot status --porcelain --untracked-files=normal -- desktop/windows .github/workflows/windows-desktop.yml)
    if ($LASTEXITCODE -ne 0 -or $changes.Count -gt 0) { throw 'Installer source must be committed before packaging.' }
    $buildManifest = Get-Content -LiteralPath (Join-Path $PublishRoot 'build-manifest.json') -Raw | ConvertFrom-Json
    if ($buildManifest.source_commit -ne $source) { throw 'Publish output belongs to another source commit.' }
    [xml]$project = Get-Content -LiteralPath (Join-Path $desktopRoot 'Haoduoyu.Windows/Haoduoyu.Windows.csproj') -Raw
    $version = [string]$project.Project.PropertyGroup.Version
    $state.source_commit = $source
    $state.version = $version
    Invoke-Logged -Command 'node' -Arguments @('--test', (Join-Path $PSScriptRoot 'test-installer.mjs')) -LogName 'installer-source-tests.log'
    $toolRoot = Join-Path $installerRoot 'tools'
    # Official NuGet only, fixed version, isolated tool path. Do not install .NET 6 onto users' devices.
    Invoke-Logged -Command 'dotnet' -Arguments @('tool', 'install', 'wix', '--version', $wixVersion, '--tool-path', $toolRoot, '--configfile', (Join-Path $desktopRoot 'installer/NuGet.Config'), '--allow-roll-forward') -LogName 'installer-tool-restore.log'
    $wix = Join-Path $toolRoot 'wix.exe'
    Invoke-Logged -Command $wix -Arguments @('--version') -LogName 'installer-tool-version.log'
    $actualWix = (Get-Content -LiteralPath (Join-Path $DeliveryRoot 'installer-tool-version.log') -Raw).Trim()
    if ($actualWix -notmatch '^4\.0\.6(?:\+[^\s]+)?$') { throw "Unexpected WiX version: $actualWix" }
    # Build only the read-only MSI guard with the hosted runner's official Visual Studio/Windows SDK.
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
    if (-not (Test-Path -LiteralPath $vswhere -PathType Leaf)) { throw 'Official Visual Studio locator is missing.' }
    $vsRoot = (& $vswhere -latest -version '[17.0,18.0)' -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $vsRoot) { throw 'Official x64 Visual C++/Windows SDK toolchain is missing.' }
    $devShell = Join-Path $vsRoot 'Common7/Tools/Launch-VsDevShell.ps1'
    & $devShell -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
    $guardDll = Join-Path $installerRoot 'NativeWorkbench.InstallerGuard.dll'
    Invoke-Logged -Command 'cl.exe' -Arguments @('/nologo', '/LD', '/MT', '/O2', '/W4', '/WX', '/EHsc', '/std:c++17', '/permissive-', '/guard:cf', '/DUNICODE', '/D_UNICODE', (Join-Path $desktopRoot 'installer/Guard/InstallerGuard.cpp'), ("/Fo" + (Join-Path $installerRoot 'InstallerGuard.obj')), ("/Fe" + $guardDll), '/link', '/INCREMENTAL:NO', '/MACHINE:X64', ('/IMPLIB:' + (Join-Path $installerRoot 'InstallerGuard.lib')), '/MANIFEST:EMBED', '/Brepro', '/DYNAMICBASE', '/NXCOMPAT', '/GUARD:CF') -LogName 'installer-guard-build.log'
    $state.guard = @{ kind = 'readonly_native_msi_safety_gate'; sha256 = (Get-FileHash -LiteralPath $guardDll -Algorithm SHA256).Hash.ToLowerInvariant(); bytes = (Get-Item -LiteralPath $guardDll).Length; compiler = (Get-Command cl.exe).Source; compiler_file_version = (Get-Item (Get-Command cl.exe).Source).VersionInfo.FileVersion; compiler_family = 'Visual Studio 2022'; runner_image_version = $env:ImageVersion; runtime = 'static_msvc'; no_elevation = $true; concurrent_path_replacement_eliminated = $false }
    $candidateSource = Join-Path $installerRoot 'candidate'
    Invoke-Logged -Command 'node' -Arguments @((Join-Path $PSScriptRoot 'generate-installer.mjs'), $PublishRoot, $candidateSource, $version) -LogName 'installer-source-generation.log'
    Copy-Item -LiteralPath (Join-Path $candidateSource 'installer-input.json') -Destination (Join-Path $DeliveryRoot 'installer-input.json')
    $candidateInput = Get-Content -LiteralPath (Join-Path $candidateSource 'installer-input.json') -Raw | ConvertFrom-Json
    $state.product_code = $candidateInput.product_code
    $state.upgrade_code = $candidateInput.upgrade_code
    $msiName = 'Haoduoyu.NativeWorkbench-{0}-win-x64-{1}.msi' -f $version, $source.Substring(0, 12)
    $msiPath = Join-Path $DeliveryRoot $msiName
    Build-Msi -SourceRoot $candidateSource -OutputPath $msiPath -LogName 'installer-build.log'
    $state.build = 'passed'
    $state.artifact = $msiName
    $state.bytes = (Get-Item -LiteralPath $msiPath).Length
    $state.sha256 = (Get-FileHash -LiteralPath $msiPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $state.built_at_utc = [DateTimeOffset]::UtcNow.ToString('O')
    Save-State
    # Fixtures reuse exactly the candidate payload; only MSI metadata identity/version differs. Never deliver them.
    $olderSource = Join-Path $installerRoot 'synthetic-older'
    $sameSource = Join-Path $installerRoot 'synthetic-same-version'
    Invoke-Logged -Command 'node' -Arguments @((Join-Path $PSScriptRoot 'generate-installer.mjs'), $PublishRoot, $olderSource, '0.0.0', 'synthetic-older') -LogName 'installer-older-fixture-source.log'
    Invoke-Logged -Command 'node' -Arguments @((Join-Path $PSScriptRoot 'generate-installer.mjs'), $PublishRoot, $sameSource, $version, 'synthetic-same-version') -LogName 'installer-same-version-fixture-source.log'
    $olderMsi = Join-Path $olderSource 'synthetic-older.msi'
    $sameMsi = Join-Path $sameSource 'synthetic-same-version.msi'
    Build-Msi -SourceRoot $olderSource -OutputPath $olderMsi -LogName 'installer-older-fixture-build.log'
    Build-Msi -SourceRoot $sameSource -OutputPath $sameMsi -LogName 'installer-same-version-fixture-build.log'
    & (Join-Path $PSScriptRoot 'test-installer-windows.ps1') -CandidateMsi $msiPath -CandidateInput (Join-Path $candidateSource 'installer-input.json') -OlderMsi $olderMsi -OlderInput (Join-Path $olderSource 'installer-input.json') -SameVersionMsi $sameMsi -EvidenceRoot $DeliveryRoot
    $state.synthetic_hosted_windows_installation = 'passed'
    Save-State
    Write-Output "Unsigned per-user MSI candidate: $msiPath"
}
catch {
    $state.error = $_.Exception.Message
    if ($state.build -eq 'not_run') { $state.build = 'failed_or_not_completed' }
    elseif ($state.synthetic_hosted_windows_installation -eq 'not_run') { $state.synthetic_hosted_windows_installation = 'failed_or_not_completed' }
    Save-State
    throw
}
finally {
    # Add independent evidence hashes without changing or deleting the portable ZIP or its manifest.
    $hashes = @(Get-ChildItem -LiteralPath $DeliveryRoot -File | Where-Object { $_.Name -like 'installer-*' -or $_.Extension -eq '.msi' } | Sort-Object Name | ForEach-Object {
        '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
    })
    $hashes | Set-Content -LiteralPath (Join-Path $DeliveryRoot 'INSTALLER-SHA256SUMS.txt') -Encoding ascii
}
