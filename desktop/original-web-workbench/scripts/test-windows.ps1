param([string]$ReviewedSite = "", [ValidatePattern('^$|^\d+\.\d+\.\d+\.\d+$')][string]$ExpectedWebView2Version = "", [string]$EvidenceDirectory = "", [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $IsWindows -or -not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 required.' }
Write-Output ('Runner diagnostic only: UserInteractive=' + [Environment]::UserInteractive + '; SessionId=' + [Diagnostics.Process]::GetCurrentProcess().SessionId)
$expectedSdk = (Get-Content "$root/global.json" -Raw | ConvertFrom-Json).sdk.version
if ((dotnet --version).Trim() -ne $expectedSdk) { throw "Official SDK $expectedSdk required." }
$env:HAODUOYU_TEST_EXPECTED_WEBVIEW2_VERSION = $ExpectedWebView2Version
$evidence = [Collections.Generic.List[object]]::new()
if ($EvidenceDirectory) { New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null }
function New-TestRoot {
    $path = Join-Path ([IO.Path]::GetTempPath()) ('HaoduoyuOriginalUiTest-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $path | Out-Null
    return $path
}
# No runtime installers, services, scheduled tasks, registry writes or production calls.
if (-not $SkipBuild) {
    dotnet build "$root/tests/WindowsIntegration/WindowsIntegration.csproj" -c Release -m:1 -p:RestoreLockedMode=true -p:UseSharedCompilation=false
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
}
$exe = "$root/tests/WindowsIntegration/bin/Release/net10.0-windows/win-x64/Haoduoyu.OriginalUi.IntegrationTests.exe"
$fixture = "$root/tests/fixtures"
function Invoke-Phase([string]$phase, [string]$testRoot, [string]$site) {
    $stdout = Join-Path $testRoot "$phase-stdout.txt"
    $stderr = Join-Path $testRoot "$phase-stderr.txt"
    $entry = @{ phase=$phase; evidence=$testRoot; passed=$false }
    $evidence.Add($entry)
    try {
        $process = Start-Process -FilePath $exe -ArgumentList @($phase, ('"' + $testRoot + '"'), ('"' + $site + '"')) -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        if (-not $process.WaitForExit(120000)) {
            $process.Kill($true)
            throw "Synthetic $phase timed out after 120 seconds; only its process tree stopped. Evidence retained: $testRoot"
        }
        $process.WaitForExit()
        Get-Content $stdout | Write-Output
        Get-Content $stderr | Write-Output
        if ($process.ExitCode -ne 0) { throw "Actual shown-window $phase failed. Evidence retained: $testRoot" }
        $entry.passed = $true
        Write-Output "Actual shown-window $phase evidence: $testRoot"
    }
    finally {
        # Exact leaf allowlist only. Never recurse into/copy the WebView2 profile, DB,
        # cache, sentinel dirs or arbitrary files from %TEMP%.
        if ($EvidenceDirectory) {
            $dest = Join-Path $EvidenceDirectory $phase
            New-Item -ItemType Directory -Path $dest -Force | Out-Null
            foreach ($name in @("$phase-stdout.txt","$phase-stderr.txt","$phase-result.json","$phase-failure.txt","$phase-1280.png","$phase-430.png","$phase-window-controls.json","$phase-window-frame.png","$phase-window-maximized-frame.png")) {
                $file = Join-Path $testRoot $name
                if (Test-Path -LiteralPath $file -PathType Leaf) { Copy-Item -LiteralPath $file -Destination (Join-Path $dest $name) }
            }
        }
    }
}
try {
    $testRoot = New-TestRoot
    Invoke-Phase seed $testRoot $fixture
    Start-Sleep -Seconds 3
    Invoke-Phase restart $testRoot $fixture
    foreach ($phase in @('close-failed','close-pending','close-missing','runtime-override')) { Invoke-Phase $phase (New-TestRoot) $fixture }
    if ($ReviewedSite) {
        $sharedSite=(Resolve-Path $ReviewedSite).Path
        Invoke-Phase site (New-TestRoot) $sharedSite
        Invoke-Phase site-review (New-TestRoot) $sharedSite
        Invoke-Phase site-storage-failed (New-TestRoot) $sharedSite
        foreach($family in @('todo','future','note')) {
            $draftRoot=New-TestRoot
            Invoke-Phase "site-$family-seed" $draftRoot $sharedSite
            Start-Sleep -Seconds 2
            Invoke-Phase "site-$family-restart" $draftRoot $sharedSite
        }
    }
}
finally {
    $summary = Join-Path $root 'acceptance-evidence.json'
    @{ source='synthetic data only'; expectedWebView2=$ExpectedWebView2Version; executedAtUtc=[DateTime]::UtcNow.ToString('o'); phases=$evidence } | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $summary
    if ($EvidenceDirectory) { Copy-Item -LiteralPath $summary -Destination (Join-Path $EvidenceDirectory 'acceptance-evidence.json') }
}
Write-Output 'These tests do not prove OS-level network isolation, forced-kill/IME safety, floating-editor tail safety, or complete functional routes. Real Windows execution and human screenshot review remain required.'
