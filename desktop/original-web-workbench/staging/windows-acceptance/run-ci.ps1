param([ValidatePattern('^$|^\d+\.\d+\.\d+\.\d+$')][string]$ExpectedWebView2Version = '')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
$evidence = Join-Path $root 'artifacts/windows-acceptance/evidence'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
Start-Transcript -Path (Join-Path $evidence 'runner-log.txt') -Force | Out-Null
try {
    if (-not $IsWindows -or -not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 required.' }
    @{ userInteractive=[Environment]::UserInteractive; processSessionId=[Diagnostics.Process]::GetCurrentProcess().SessionId; os=[Environment]::OSVersion.VersionString } | ConvertTo-Json | Tee-Object -FilePath (Join-Path $evidence 'runner-session-result.json') | Write-Output
    $expectedSdk = (Get-Content global.json -Raw | ConvertFrom-Json).sdk.version
    $actualSdk = (dotnet --version).Trim()
    if ($LASTEXITCODE -ne 0 -or $actualSdk -ne $expectedSdk) { throw "Official SDK $expectedSdk required; actual: $actualSdk." }
    if (-not (Test-Path bundle/host-assets.manifest.json)) { throw 'Verified frozen phase 2 bundle missing.' }
    $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
    $env:DOTNET_SKIP_FIRST_TIME_EXPERIENCE = '1'
    $env:DOTNET_GENERATE_ASPNET_CERTIFICATE = 'false'
    node tests/BackupPreviewTests/generate-fixtures.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Synthetic backup fixture generation failed.' }
    dotnet restore tests/BackupPreviewTests/BackupPreviewTests.csproj --locked-mode
    if ($LASTEXITCODE -ne 0) { throw 'Locked preview test restore failed.' }
    dotnet run --project tests/BackupPreviewTests/BackupPreviewTests.csproj -c Release --no-restore -- tests/BackupPreviewTests/fixtures
    if ($LASTEXITCODE -ne 0) { throw 'Read-only backup preview tests failed.' }
    dotnet restore tests/WindowsIntegration/WindowsIntegration.csproj --locked-mode
    if ($LASTEXITCODE -ne 0) { throw 'Locked restore failed.' }
    dotnet build tests/WindowsIntegration/WindowsIntegration.csproj -c Release --no-restore -m:1 -p:UseSharedCompilation=false
    if ($LASTEXITCODE -ne 0) { throw 'Acceptance build failed.' }
    $exe = Join-Path $root 'tests/WindowsIntegration/bin/Release/net10.0-windows/win-x64/Haoduoyu.OriginalUi.IntegrationTests.exe'
    $queryRoot = Join-Path ([IO.Path]::GetTempPath()) ('HaoduoyuOriginalUiTest-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $queryRoot | Out-Null
    & $exe runtime-query $queryRoot (Join-Path $root 'tests/fixtures')
    $queryExit = $LASTEXITCODE
    foreach ($name in @('runtime-query-result.json','runtime-query-failure.txt')) {
        $file = Join-Path $queryRoot $name
        if (Test-Path -LiteralPath $file -PathType Leaf) { Copy-Item -LiteralPath $file -Destination (Join-Path $evidence $name) }
    }
    if ($queryExit -ne 0) { throw 'Installed WebView2 discovery failed or runtime missing. No runtime was installed or system setting changed.' }
    $actualRuntime = (Get-Content (Join-Path $queryRoot 'runtime-query-result.json') -Raw | ConvertFrom-Json).runtime
    if ($actualRuntime -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "Expected stable installed WebView2 version; actual: $actualRuntime" }
    if ($ExpectedWebView2Version -and $actualRuntime -ne $ExpectedWebView2Version) { throw "Installed runtime differs from explicit requested version: $ExpectedWebView2Version vs $actualRuntime" }
    # First approved run queries the installed official runtime, then pins this exact value
    # for every process in the same job. Nothing downloads/installs or upgrades WebView2.
    Write-Output "Discovered installed stable WebView2; using exact same-job expectation: $actualRuntime"
    pwsh -NoProfile -File scripts/test-windows.ps1 -ReviewedSite bundle/site -ExpectedWebView2Version $actualRuntime -EvidenceDirectory $evidence -SkipBuild
    if ($LASTEXITCODE -ne 0) { throw 'Shown Windows acceptance failed; inspect the allowlisted synthetic evidence.' }
}
finally { Stop-Transcript | Out-Null }
