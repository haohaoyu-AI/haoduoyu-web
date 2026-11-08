param([string]$SharedSource = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $SharedSource) { $SharedSource = Join-Path $root '../../local-ui' }
$source = (Resolve-Path $SharedSource).Path
$evidence = Join-Path $root 'artifacts/windows-acceptance/evidence'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
Start-Transcript -Path (Join-Path $evidence 'shared-rebuild-log.txt') -Force | Out-Null
Push-Location $source
try {
    Write-Output "Node: $(node --version); npm: $(npm --version)"
    # Public lock-pinned registry dependencies only. No lifecycle install scripts,
    # audit transmission, credential setup, source rewrite or bundle adoption.
    npm ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Shared-source locked dependency installation failed.' }
    npm run verify:provenance
    if ($LASTEXITCODE -ne 0) { throw 'Original public interface provenance failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Shared frontend rebuild failed.' }
    npm run test:shared
    if ($LASTEXITCODE -ne 0) { throw 'Shared local API/runtime/lifecycle/controller tests failed.' }
    $manifest = Get-Content (Join-Path $root 'bundle/host-assets.manifest.json') -Raw | ConvertFrom-Json
    $site = Join-Path $source 'build/site'
    $files = @(Get-ChildItem -LiteralPath $site -File)
    if ($files.Count -ne 13 -or @(Get-ChildItem -LiteralPath $site -Directory).Count -ne 0 -or $manifest.assets.Count -ne 13) { throw 'Rebuilt shared asset count differs from frozen bundle.' }
    $results = @()
    foreach ($asset in $manifest.assets) {
        if ($asset.path -notmatch '^[a-z][a-z0-9.-]+$') { throw 'Unexpected asset path in pinned host manifest.' }
        $file = Get-Item -LiteralPath (Join-Path $site $asset.path)
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($file.Length -ne $asset.size -or $hash -ne $asset.sha256) { throw "Source rebuild differs from frozen shared bytes: $($asset.path)" }
        $results += @{path=$asset.path; size=$file.Length; sha256=$hash}
    }
    @{ passed=$true; scope='13 rebuilt assets exactly match adopted immutable bytes; no bundle overwritten'; node=(node --version); assets=$results } |
        ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $evidence 'shared-rebuild-result.json')
    Write-Output 'PASS shared readable source/tests and exact 13-asset rebuild verification.'
}
finally { Pop-Location; Stop-Transcript | Out-Null }
