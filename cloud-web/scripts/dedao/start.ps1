param([switch]$Acceptance)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$bundleRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $bundleRoot
try {
  $nodeExe = $null
  $candidate = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($candidate) {
    $version = & $candidate.Source -p 'process.versions.node'
    if ([version]$version -ge [version]'22.13.0') {
      $actualNode = (& $candidate.Source -p 'process.execPath') | Select-Object -Last 1
      if ($actualNode -and (Test-Path $actualNode)) {
        $actualNpm = Join-Path (Split-Path -Parent $actualNode) 'node_modules\npm\bin\npm-cli.js'
        if (Test-Path $actualNpm) { $nodeExe = $actualNode }
      }
    }
  }
  if (-not $nodeExe) {
    Write-Host 'Installing official Node.js LTS in the current user folder. No administrator or global PATH change.'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object { $_.lts -and [version]$_.version.TrimStart('v') -ge [version]'22.13.0' } | Select-Object -First 1
    if (-not $release -or $release.version -notmatch '^v\d+\.\d+\.\d+$') { throw 'Official Node.js version could not be verified.' }
    $archiveName = "node-$($release.version)-win-$architecture.zip"
    $runtimeRoot = Join-Path $env:LOCALAPPDATA 'HaoduoyuDedao\node'
    $installedRoot = Join-Path $runtimeRoot ([IO.Path]::GetFileNameWithoutExtension($archiveName))
    $nodeExe = Join-Path $installedRoot 'node.exe'
    if (-not (Test-Path $nodeExe)) {
      New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
      $tempZip = Join-Path $env:TEMP (([guid]::NewGuid().ToString()) + '.zip')
      try {
        $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$($release.version)/SHASUMS256.txt").Content
        $match = [regex]::Match($checksums, '(?m)^([a-f0-9]{64})\s+' + [regex]::Escape($archiveName) + '\r?$')
        if (-not $match.Success) { throw 'Official Node.js checksum was not found.' }
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$($release.version)/$archiveName" -OutFile $tempZip
        if ((Get-FileHash -Algorithm SHA256 $tempZip).Hash.ToLowerInvariant() -ne $match.Groups[1].Value) { throw 'Node.js checksum failed; installation stopped.' }
        Expand-Archive -Path $tempZip -DestinationPath $runtimeRoot -Force
      } finally { Remove-Item $tempZip -ErrorAction SilentlyContinue }
    }
  }
  $nodeFolder = Split-Path -Parent $nodeExe
  $env:PATH = "$nodeFolder;$env:PATH"
  $env:DEDAO_NPM_CLI = Join-Path $nodeFolder 'node_modules\npm\bin\npm-cli.js'
  if (-not (Test-Path $env:DEDAO_NPM_CLI)) { throw 'The official Node.js npm CLI is missing.' }
  & $nodeExe $env:DEDAO_NPM_CLI ci --omit=dev --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
  $arguments = @('scripts/dedao/setup.mjs')
  if ($Acceptance) { $arguments += '--acceptance' }
  & $nodeExe @arguments
} catch {
  Write-Host ('Connection not completed: ' + $_.Exception.Message)
  exit 1
}
