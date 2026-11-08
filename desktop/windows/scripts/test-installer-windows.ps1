[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$CandidateMsi,
    [Parameter(Mandatory)][string]$CandidateInput,
    [Parameter(Mandatory)][string]$OlderMsi,
    [Parameter(Mandatory)][string]$OlderInput,
    [Parameter(Mandatory)][string]$SameVersionMsi,
    [Parameter(Mandatory)][string]$EvidenceRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Installation is deliberately unavailable on a developer or user's computer, even Windows.
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:RUNNER_OS -ne 'Windows') {
    throw 'Installation QA only runs on a disposable GitHub-hosted Windows runner. No real user-device installation is allowed.'
}
$CandidateMsi = (Resolve-Path -LiteralPath $CandidateMsi).Path
$OlderMsi = (Resolve-Path -LiteralPath $OlderMsi).Path
$SameVersionMsi = (Resolve-Path -LiteralPath $SameVersionMsi).Path
$EvidenceRoot = (Resolve-Path -LiteralPath $EvidenceRoot).Path
$candidate = Get-Content -LiteralPath $CandidateInput -Raw | ConvertFrom-Json
$older = Get-Content -LiteralPath $OlderInput -Raw | ConvertFrom-Json
if ($candidate.fixture -or -not $older.fixture -or $older.fixture_identity -ne 'synthetic-older' -or $candidate.source_commit -ne $env:GITHUB_SHA) {
    throw 'Candidate/fixture identities do not match the exact CI source.'
}
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs\Haoduoyu\NativeWorkbench'
$vendorRoot = Split-Path $installRoot -Parent
$dataRoot = Join-Path $env:LOCALAPPDATA 'Haoduoyu\NativeWorkbench\v1'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Haoduoyu Native Workbench\Haoduoyu Native Workbench.lnk'
$menuRoot = Split-Path $shortcut -Parent
$outsideRoot = Join-Path $env:RUNNER_TEMP ('haoduoyu-installer-outside-{0}' -f [Guid]::NewGuid().ToString('N'))
$outsideMarker = Join-Path $outsideRoot 'Haoduoyu.Workbench.exe'
$marker = Join-Path $dataRoot ('synthetic-installer-data-{0}.txt' -f [Guid]::NewGuid().ToString('N'))
$nonOwnedFile = Join-Path $installRoot ('synthetic-not-installer-owned-{0}.txt' -f [Guid]::NewGuid().ToString('N'))
$evidencePath = Join-Path $EvidenceRoot 'installer-windows-tests.json'
$steps = [Collections.Generic.List[object]]::new()
$report = [ordered]@{
    schema = 'haoduoyu-windows-installer-tests-v1'
    source_commit = $candidate.source_commit
    runner = 'disposable_github_hosted_windows'
    install_root = $installRoot
    data_root = $dataRoot
    data_marker = (Split-Path $marker -Leaf)
    application_launched = $false
    status = 'running'
    steps = $steps
    cleanup = 'not_run'
    limitations = @('Synthetic older/same-version fixtures reuse the exact candidate payload and change MSI metadata only. They do not validate real older-client binaries, user-data migration or compatibility with different payloads. Cross-version newly introduced filenames colliding with existing non-installer-owned files are not covered.', 'Unsigned candidate, not a trusted release.', 'Hosted Windows Installer tests are not physical-device or interactive SmartScreen acceptance.', 'Cancellation is at the first MSI progress callback, not every possible interrupted upgrade or power loss.', 'No live application/file-lock shutdown test; close the workbench yourself before maintenance.', 'Embedded native guard checks ownership and stable directory/file links at several transaction gates; no claim to eliminate every malicious replacement race between gates. Redirected/aliased AppData may be conservatively refused.')
    error = $null
}
function Save-Evidence { $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidencePath -Encoding utf8NoBOM }
function Product-Key([string]$Code) { return "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{$Code}" }
function Is-Registered([string]$Code) { return Test-Path -LiteralPath (Product-Key $Code) }
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Assert-Data {
    Assert-True (Test-Path -LiteralPath $marker -PathType Leaf) 'Installer deleted the synthetic user-data marker.'
    Assert-True ((Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash -eq $markerHash) 'Installer changed the synthetic user-data marker.'
    Assert-True (@(Get-Process -Name 'Haoduoyu.Workbench' -ErrorAction SilentlyContinue).Count -eq 0) 'Installer unexpectedly launched the workbench.'
}
function Assert-Payload {
    Assert-True (Test-Path -LiteralPath $installRoot -PathType Container) 'Installed program directory is missing.'
    $actual = @(Get-ChildItem -LiteralPath $installRoot -File -Recurse | Where-Object { $_.FullName -ne $nonOwnedFile } | ForEach-Object { $_.FullName.Substring($installRoot.Length + 1).Replace('\', '/') } | Sort-Object)
    $expected = @($candidate.files.path | Sort-Object)
    Assert-True (@(Compare-Object -ReferenceObject $expected -DifferenceObject $actual).Count -eq 0) 'Installed file inventory differs from the complete publish manifest.'
    foreach ($file in $candidate.files) {
        $path = Join-Path $installRoot $file.path
        Assert-True ((Get-Item -LiteralPath $path).Length -eq $file.bytes) "Installed size differs: $($file.path)"
        Assert-True ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -eq $file.sha256) "Installed hash differs: $($file.path)"
    }
    Assert-True (Test-Path -LiteralPath $shortcut -PathType Leaf) 'Installed Start Menu shortcut is missing.'
    Assert-Data
}
function Assert-NoPayload {
    foreach ($file in $candidate.files) { Assert-True (-not (Test-Path -LiteralPath (Join-Path $installRoot $file.path))) "Program file remains: $($file.path)" }
    Assert-True (-not (Test-Path -LiteralPath $shortcut)) 'Uninstall left the installer-owned shortcut.'
    Assert-Data
}
function Invoke-Msi {
    param([string]$Operation, [string]$Target, [string]$Name, [int]$ExpectedExit = 0, [string[]]$Properties = @(), [string]$ExpectedMessage = '')
    $log = Join-Path $EvidenceRoot ("installer-msi-$Name.log")
    $arguments = @($Operation, ('"{0}"' -f $Target), '/qn', '/norestart', '/l*v', ('"{0}"' -f $log), 'REBOOT=ReallySuppress') + $Properties
    $process = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\msiexec.exe') -ArgumentList $arguments -Wait -PassThru
    $steps.Add([ordered]@{ name = $Name; exit_code = $process.ExitCode; expected_exit_code = $ExpectedExit; log = (Split-Path $log -Leaf) })
    Save-Evidence
    Assert-True ($process.ExitCode -eq $ExpectedExit) "MSI $Name returned $($process.ExitCode), expected $ExpectedExit. See $log."
    if ($ExpectedMessage) { Assert-True ((Get-Content -LiteralPath $log -Raw).Contains($ExpectedMessage)) "MSI $Name did not fail for the expected version/scope reason." }
    Assert-Data
}
function New-Junction([string]$Link, [string]$Target) {
    & $env:ComSpec /d /c (('mklink /J "{0}" "{1}"' -f $Link, $Target))
    Assert-True ($LASTEXITCODE -eq 0) 'Cannot create synthetic directory-junction fixture.'
    Assert-True (([IO.File]::GetAttributes($Link) -band [IO.FileAttributes]::ReparsePoint) -ne 0) 'Fixture is not a junction.'
}
function Remove-Junction([string]$Link) {
    Assert-True (([IO.File]::GetAttributes($Link) -band [IO.FileAttributes]::ReparsePoint) -ne 0) 'Refuse to remove a fixture that is no longer a junction.'
    # rmdir without /s removes the junction itself; never recursively remove its target.
    & $env:ComSpec /d /c (('rmdir "{0}"' -f $Link))
    Assert-True ($LASTEXITCODE -eq 0) 'Cannot detach synthetic junction safely.'
}
function Assert-Outside {
    Assert-True ((Get-FileHash -LiteralPath $outsideMarker -Algorithm SHA256).Hash -eq $outsideHash) 'MSI modified an external junction-target file.'
}
function Read-MsiProperty {
    param($Database, [string]$Name, [switch]$Optional)
    $view = $Database.OpenView(('SELECT `Value` FROM `Property` WHERE `Property` = ''{0}''' -f $Name))
    try {
        $null = $view.Execute()
        $record = $view.Fetch()
        if ($null -eq $record) {
            if ($Optional) { return '' }
            throw "Required MSI property '$Name' is missing."
        }
        # StringData is an indexed COM property, not a method. Request PROPERTYGET explicitly
        # instead of relying on PowerShell's method-style COM dispatch.
        $value = $record.GetType().InvokeMember('StringData', [Reflection.BindingFlags]::GetProperty, $null, $record, @([int]1))
        if ($value -isnot [string]) { throw "MSI property '$Name' did not return a string." }
        if (-not $Optional -and $value.Length -eq 0) { throw "Required MSI property '$Name' is empty." }
        return $value
    }
    finally { $null = $view.Close() }
}
Save-Evidence
try {
    # These preflight failures never clean up unrelated installation/data directories or registrations.
    Assert-True (-not (Test-Path -LiteralPath $installRoot)) 'Pre-existing installation path: refuse to touch it.'
    Assert-True (-not (Test-Path -LiteralPath $menuRoot)) 'Pre-existing Start Menu folder: refuse to touch it.'
    Assert-True (-not (Test-Path -LiteralPath $vendorRoot)) 'Pre-existing synthetic vendor-program root: refuse to alter it.'
    Assert-True (-not (Is-Registered $candidate.product_code)) 'Candidate is already registered: refuse to touch it.'
    Assert-True (-not (Is-Registered $older.product_code)) 'Fixture is already registered: refuse to touch it.'
    Assert-True (-not (Test-Path -LiteralPath 'HKCU:\Software\Haoduoyu\NativeWorkbench\Installer')) 'Pre-existing component state: refuse to touch it.'
    Assert-True (@(Get-Process -Name 'Haoduoyu.Workbench' -ErrorAction SilentlyContinue).Count -eq 0) 'Workbench process exists: refuse to install or close it.'
    $null = New-Item -ItemType Directory -Path $dataRoot -Force
    [IO.File]::WriteAllText($marker, 'Synthetic installer test data. This must survive install, cancellation, upgrade and uninstall.')
    $markerHash = (Get-FileHash -LiteralPath $marker -Algorithm SHA256).Hash
}
catch {
    $report.status = 'failed_preflight'
    $report.error = $_.Exception.Message
    $report.cleanup = 'not_attempted_preflight_safety_boundary'
    Save-Evidence
    throw
}
try {
    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $installer.OpenDatabase($CandidateMsi, 0)
    Assert-True ((Read-MsiProperty $database 'ProductCode').Trim('{}') -eq $candidate.product_code) 'MSI ProductCode does not match source evidence.'
    Assert-True ((Read-MsiProperty $database 'UpgradeCode').Trim('{}') -eq $candidate.upgrade_code) 'MSI UpgradeCode does not match source evidence.'
    Assert-True ((Read-MsiProperty $database 'ProductVersion') -eq $candidate.version) 'MSI version does not match source evidence.'
    Assert-True ((Read-MsiProperty $database 'ALLUSERS' -Optional) -eq '') 'MSI unexpectedly requests per-machine installation.'
    Assert-True ((Read-MsiProperty $database 'MSIRESTARTMANAGERCONTROL') -eq 'Disable') 'MSI may automatically close an application.'
    Assert-True ((Read-MsiProperty $database 'REBOOT') -eq 'ReallySuppress') 'MSI may automatically reboot.'
    $steps.Add(@{ name = 'msi-database-identity-and-scope'; result = 'passed' })
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($database)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($installer)

    $null = New-Item -ItemType Directory -Path $outsideRoot
    [IO.File]::WriteAllText($outsideMarker, 'Synthetic external target. An installer must never replace or remove this file.')
    $outsideHash = (Get-FileHash -LiteralPath $outsideMarker -Algorithm SHA256).Hash

    # Exercise the real embedded MSI guard, not just this script's own preflight.
    $null = New-Item -ItemType Directory -Path $installRoot
    $unowned = Join-Path $installRoot 'synthetic-unowned-portable.txt'
    [IO.File]::WriteAllText($unowned, 'Existing portable program tree must not be adopted by MSI.')
    try {
        Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-unowned-program-directory' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-True (Test-Path -LiteralPath $unowned -PathType Leaf) 'MSI removed a pre-existing portable file.'
        Assert-True (-not (Is-Registered $candidate.product_code)) 'Unowned-directory rejection registered a product.'
    } finally { Remove-Item -LiteralPath $unowned; [IO.Directory]::Delete($installRoot); [IO.Directory]::Delete($vendorRoot) }

    $null = New-Item -ItemType Directory -Path $menuRoot
    [IO.File]::WriteAllText($shortcut, 'Existing unrelated shortcut; must not be overwritten.')
    $existingShortcutHash = (Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash
    try {
        Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-unowned-startmenu-shortcut' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-True ((Get-FileHash -LiteralPath $shortcut -Algorithm SHA256).Hash -eq $existingShortcutHash) 'MSI overwrote an unrelated Start Menu shortcut.'
    } finally { Remove-Item -LiteralPath $shortcut; [IO.Directory]::Delete($menuRoot) }

    New-Junction -Link $vendorRoot -Target $outsideRoot
    try {
        Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-program-ancestor-junction' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-Outside
    } finally { Remove-Junction $vendorRoot }
    $null = New-Item -ItemType Directory -Path $vendorRoot
    New-Junction -Link $installRoot -Target $outsideRoot
    try {
        Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-program-final-junction' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-Outside
    } finally { Remove-Junction $installRoot; [IO.Directory]::Delete($vendorRoot) }
    New-Junction -Link $menuRoot -Target $outsideRoot
    try {
        Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-startmenu-final-junction' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-Outside
    } finally { Remove-Junction $menuRoot }

    Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'reject-machine-scope' -ExpectedExit 1603 -Properties @('ALLUSERS=1') -ExpectedMessage 'This package only supports installation for the current user.'
    Assert-NoPayload
    Assert-True (-not (Is-Registered $candidate.product_code)) 'Rejected machine-scope install registered a product.'

    Add-Type -Path (Join-Path $PSScriptRoot '../installer/Fixtures/MsiCancellation.cs')
    $cancelExit = [NativeInstallerCancellation]::CancelAtFirstProgress($CandidateMsi)
    $steps.Add(@{ name = 'cancel-first-msi-progress'; exit_code = $cancelExit; progress_callbacks = [NativeInstallerCancellation]::ProgressCallbacks })
    Assert-True ($cancelExit -eq 1602 -and [NativeInstallerCancellation]::ProgressCallbacks -gt 0) 'MSI cancellation did not return ERROR_INSTALL_USEREXIT.'
    Assert-True (-not (Is-Registered $candidate.product_code)) 'Cancelled install left product registration.'
    Assert-NoPayload

    Invoke-Msi -Operation '/i' -Target $OlderMsi -Name 'install-synthetic-older'
    Assert-True (Is-Registered $older.product_code) 'Older synthetic fixture is not registered for the current user.'
    Assert-Payload
    [IO.File]::WriteAllText($nonOwnedFile, 'Synthetic file not owned by the installer; never recursively clean program directories.')

    Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'upgrade-to-candidate'
    Assert-True (Is-Registered $candidate.product_code) 'Candidate is not registered for the current user.'
    Assert-True (-not (Is-Registered $older.product_code)) 'Upgrade did not remove the old product registration.'
    Assert-True (Test-Path -LiteralPath $nonOwnedFile -PathType Leaf) 'Upgrade recursively removed a non-owned file.'
    Assert-Payload

    Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'repeat-exact-candidate'
    Assert-Payload
    Invoke-Msi -Operation '/i' -Target $OlderMsi -Name 'reject-downgrade' -ExpectedExit 1603 -ExpectedMessage 'A newer Native Workbench is installed.'
    Assert-Payload
    Invoke-Msi -Operation '/i' -Target $SameVersionMsi -Name 'reject-same-version-other-source' -ExpectedExit 1603 -ExpectedMessage 'This version is already installed from another source.'
    Assert-Payload

    $linkedChild = Join-Path $installRoot 'synthetic-linked-descendant'
    New-Junction -Link $linkedChild -Target $outsideRoot
    try {
        Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-owned-tree-descendant-junction' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-Outside
    } finally { Remove-Junction $linkedChild }
    Assert-Payload

    $hardlinkTarget = Join-Path $env:LOCALAPPDATA ('synthetic-installer-external-hardlink-{0}.txt' -f [Guid]::NewGuid().ToString('N'))
    $hardlink = Join-Path $installRoot 'synthetic-hardlinked-file.txt'
    [IO.File]::WriteAllText($hardlinkTarget, 'Synthetic external hardlink target; MSI must not touch its content.')
    $hardlinkHash = (Get-FileHash -LiteralPath $hardlinkTarget -Algorithm SHA256).Hash
    & $env:ComSpec /d /c (('mklink /H "{0}" "{1}"' -f $hardlink, $hardlinkTarget))
    Assert-True ($LASTEXITCODE -eq 0) 'Cannot create synthetic file-hardlink fixture.'
    try {
        Invoke-Msi -Operation '/x' -Target ('{' + $candidate.product_code + '}') -Name 'guard-reject-owned-program-file-hardlink' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
        Assert-True ((Get-FileHash -LiteralPath $hardlinkTarget -Algorithm SHA256).Hash -eq $hardlinkHash) 'MSI changed external hardlink content.'
        Assert-True (Is-Registered $candidate.product_code) 'Rejected hardlink uninstall removed product registration.'
    } finally { Remove-Item -LiteralPath $hardlink; Remove-Item -LiteralPath $hardlinkTarget }
    Assert-Payload

    $preservedMenu = $menuRoot + '.synthetic-preserved-' + [Guid]::NewGuid().ToString('N')
    Move-Item -LiteralPath $menuRoot -Destination $preservedMenu
    try {
        New-Junction -Link $menuRoot -Target $outsideRoot
        try {
            Invoke-Msi -Operation '/i' -Target $CandidateMsi -Name 'guard-reject-owned-startmenu-junction' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
            Assert-Outside
        } finally { Remove-Junction $menuRoot }
    } finally { Move-Item -LiteralPath $preservedMenu -Destination $menuRoot }
    Assert-Payload

    $preservedProgram = $installRoot + '.synthetic-preserved-' + [Guid]::NewGuid().ToString('N')
    Move-Item -LiteralPath $installRoot -Destination $preservedProgram
    try {
        New-Junction -Link $installRoot -Target $outsideRoot
        try {
            Invoke-Msi -Operation '/x' -Target ('{' + $candidate.product_code + '}') -Name 'guard-reject-uninstall-redirected-program' -ExpectedExit 1603 -ExpectedMessage 'HDY_INSTALL_GUARD'
            Assert-Outside
            Assert-True (Is-Registered $candidate.product_code) 'Rejected redirected uninstall removed product registration.'
        } finally { Remove-Junction $installRoot }
    } finally { Move-Item -LiteralPath $preservedProgram -Destination $installRoot }
    Assert-Payload

    Invoke-Msi -Operation '/x' -Target ('{' + $candidate.product_code + '}') -Name 'uninstall-candidate'
    Assert-True (-not (Is-Registered $candidate.product_code)) 'Uninstall left product registration.'
    Assert-NoPayload
    Assert-True (Test-Path -LiteralPath $nonOwnedFile -PathType Leaf) 'Uninstall recursively removed a non-owned file.'
    Assert-True (-not (Test-Path -LiteralPath 'HKCU:\Software\Haoduoyu\NativeWorkbench\Installer')) 'Uninstall left component key-path registry state.'
    $steps.Add(@{ name = 'uninstall-owned-files-only-and-retain-user-data'; result = 'passed'; compared_payload_files = $candidate.files.Count; retained_data_sha256 = $markerHash.ToLowerInvariant() })
    $report.status = 'passed'
}
catch { $report.status = 'failed'; $report.error = $_.Exception.Message; throw }
finally {
    # Only remove products this test found absent initially and explicitly attempted to install. Never force-delete payloads.
    $cleanupErrors = [Collections.Generic.List[string]]::new()
    foreach ($code in @($candidate.product_code, $older.product_code)) {
        if (Is-Registered $code) {
            try { Invoke-Msi -Operation '/x' -Target ('{' + $code + '}') -Name ('cleanup-' + $code) }
            catch { $cleanupErrors.Add($_.Exception.Message) }
        }
    }
    $report.cleanup = if ($cleanupErrors.Count -eq 0) { 'completed_or_not_needed' } else { 'failed' }
    if ($cleanupErrors.Count -gt 0) { $report.cleanup_errors = @($cleanupErrors) }
    # Keep synthetic data/non-owned markers until this disposable runner is destroyed, proving no recursive cleanup.
    Save-Evidence
    if ($cleanupErrors.Count -gt 0 -and $report.status -eq 'passed') { throw 'MSI cleanup failed; see installer-windows-tests.json.' }
}
