[CmdletBinding()]
param([string]$OutputRoot = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw '请使用 PowerShell 7 运行本脚本。' }
if (-not $IsWindows) { throw '此打包脚本需要 Windows；不会把 Linux 交叉构建当作 Windows 验收。' }

$desktopRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (& git -C $desktopRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw '无法读取源仓库。' }
$sourceCommit = (& git -C $repositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $sourceCommit -notmatch '^[0-9a-f]{40}$') { throw '无法确认精确源提交。' }
if ($env:GITHUB_SHA -and $env:GITHUB_SHA -ne $sourceCommit) { throw '构建源与 GitHub 事件提交不同。' }
$changes = @(& git -C $repositoryRoot status --porcelain --untracked-files=normal -- desktop/windows .github/workflows/windows-desktop.yml)
if ($LASTEXITCODE -ne 0 -or $changes.Count -gt 0) { throw '桌面源码或构建工作流尚未提交；请先保存提交再打包。' }

if (-not $OutputRoot) { $OutputRoot = Join-Path $desktopRoot 'artifacts' }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)
$runName = 'windows-{0}-{1}-{2}' -f $sourceCommit.Substring(0, 12), (Get-Date -Format 'yyyyMMddTHHmmss'), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$runRoot = Join-Path $OutputRoot $runName
$publishRoot = Join-Path $runRoot 'publish'
$deliveryRoot = Join-Path $runRoot 'delivery'
$null = New-Item -ItemType Directory -Path $publishRoot, $deliveryRoot

function Invoke-CheckedDotnet {
    param([string[]]$Arguments, [string]$LogName)
    & dotnet @Arguments 2>&1 | Tee-Object -FilePath (Join-Path $deliveryRoot $LogName)
    if ($LASTEXITCODE -ne 0) { throw "dotnet 执行失败：$LogName，退出码 $LASTEXITCODE。日志已保留。" }
}

Push-Location $desktopRoot
$previousNativeEvidence = [Environment]::GetEnvironmentVariable('HDY_WINDOWS_TEST_EVIDENCE')
try {
    $sdkVersion = (& dotnet --version).Trim()
    if ($LASTEXITCODE -ne 0) { throw '无法启动 global.json 指定的官方 .NET SDK。' }
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Core.Tests/Haoduoyu.Core.Tests.csproj', '--configuration', 'Release') -LogName 'core-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release') -LogName 'api-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--worker-contract', 'Haoduoyu.Api.Tests/Fixtures/worker-contract-c30a8a9.json') -LogName 'worker-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--worker-contract', 'Haoduoyu.Api.Tests/Fixtures/worker-contract-complete-reads-c30a8a9.json') -LogName 'complete-read-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--review-form-contract', 'Haoduoyu.Api.Tests/Fixtures/review-form-contract-c30a8a9.json') -LogName 'native-form-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--ai-report-contract', 'Haoduoyu.Api.Tests/Fixtures/ai-report-contract-c30a8a9.json') -LogName 'ai-report-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--unicode-receipt-contract', 'Haoduoyu.Api.Tests/Fixtures/unicode-receipt-contract-c30a8a9.json') -LogName 'unicode-receipt-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--article-pipeline-form-contract', 'Haoduoyu.Api.Tests/Fixtures/article-pipeline-form-contract-c30a8a9.json') -LogName 'article-pipeline-form-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--article-reconciliation-contract', 'Haoduoyu.Api.Tests/Fixtures/article-reconciliation-contract-c30a8a9.json') -LogName 'article-reconciliation-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Api.Tests/Haoduoyu.Api.Tests.csproj', '--configuration', 'Release', '--', '--todo-history-contract', 'Haoduoyu.Api.Tests/Fixtures/todo-history-contract-c30a8a9.json') -LogName 'todo-history-contract-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Profile.Tests/Haoduoyu.Profile.Tests.csproj', '--configuration', 'Release') -LogName 'offline-profile-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Offline.Tests/Haoduoyu.Offline.Tests.csproj', '--configuration', 'Release') -LogName 'offline-download-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.History.Tests/Haoduoyu.History.Tests.csproj', '--configuration', 'Release') -LogName 'todo-history-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Search.Tests/Haoduoyu.Search.Tests.csproj', '--configuration', 'Release') -LogName 'local-search-tests.log'
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Archive.Tests/Haoduoyu.Archive.Tests.csproj', '--configuration', 'Release') -LogName 'history-archive-tests.log'
    Invoke-CheckedDotnet -Arguments @('build', 'Haoduoyu.Windows/Haoduoyu.Windows.csproj', '--configuration', 'Release', '-p:ContinuousIntegrationBuild=true') -LogName 'windows-build.log'
    $env:HDY_WINDOWS_TEST_EVIDENCE = $deliveryRoot
    Invoke-CheckedDotnet -Arguments @('run', '--project', 'Haoduoyu.Windows.Tests/Haoduoyu.Windows.Tests.csproj', '--configuration', 'Release') -LogName 'windows-native-tests.log'
    Invoke-CheckedDotnet -Arguments @('publish', 'Haoduoyu.Windows/Haoduoyu.Windows.csproj', '--configuration', 'Release', '--runtime', 'win-x64', '--self-contained', 'true', '--output', $publishRoot, '-p:PublishSingleFile=false', '-p:PublishReadyToRun=false', '-p:DebugType=None', '-p:DebugSymbols=false', '-p:ContinuousIntegrationBuild=true') -LogName 'windows-publish.log'

    $exePath = Join-Path $publishRoot 'Haoduoyu.Workbench.exe'
    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) { throw '打包目录缺少原生 Windows 可执行程序。' }
    $files = @(Get-ChildItem -LiteralPath $publishRoot -File -Recurse | Sort-Object FullName | ForEach-Object {
        [ordered]@{
            path = $_.FullName.Substring($publishRoot.Length + 1).Replace('\', '/')
            bytes = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    })
    $buildManifest = [ordered]@{
        schema = 'haoduoyu-windows-build-v1'
        source_commit = $sourceCommit
        requested_sdk = '10.0.403'
        actual_sdk = $sdkVersion
        runtime = 'win-x64'
        self_contained = $true
        native_ui = 'WPF'
        synthetic_core_tests = 'passed'
        synthetic_api_tests = 'passed'
        synthetic_worker_contract_replay = 'passed'
        native_form_worker_contract = 'passed'
        immutable_ai_report_contract = 'passed'
        unicode_receipt_hash_contract = 'passed'
        article_pipeline_form_contract = 'passed'
        article_reconciliation_contract = 'passed'
        todo_history_contract = 'passed'
        offline_profile_tests = 'passed'
        offline_download_tests = 'passed'
        local_search_tests = 'passed'
        history_archive_tests = 'passed'
        todo_history_tests = 'passed'
        synthetic_windows_tests = 'passed'
        windows_build = 'passed'
        windows_publish = 'passed'
        interactive_windows_acceptance = 'not_run'
        production_api_acceptance = 'not_run'
        signed = $false
        installed = $false
        inventory_excludes = @('build-manifest.json')
        files = $files
    }
    $buildManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $publishRoot 'build-manifest.json') -Encoding utf8NoBOM
    $zipName = 'Haoduoyu.Workbench-win-x64-{0}.zip' -f $sourceCommit.Substring(0, 12)
    $zipPath = Join-Path $deliveryRoot $zipName
    [IO.Compression.ZipFile]::CreateFromDirectory($publishRoot, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $false)
    $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $packageManifest = [ordered]@{
        schema = 'haoduoyu-windows-package-v1'
        source_commit = $sourceCommit
        artifact = $zipName
        bytes = (Get-Item -LiteralPath $zipPath).Length
        sha256 = $zipHash
        actual_sdk = $sdkVersion
        built_at_utc = [DateTimeOffset]::UtcNow.ToString('O')
        delivery_kind = 'unsigned_portable_candidate'
        synthetic_windows_tests = 'passed'
        interactive_windows_acceptance = 'not_run'
        production_api_acceptance = 'not_run'
        installed = $false
        published = $false
        test_logs = @('core-tests.log', 'api-tests.log', 'worker-contract-tests.log', 'complete-read-contract-tests.log', 'native-form-contract-tests.log', 'ai-report-contract-tests.log', 'unicode-receipt-contract-tests.log', 'article-pipeline-form-contract-tests.log', 'article-reconciliation-contract-tests.log', 'todo-history-contract-tests.log', 'offline-profile-tests.log', 'offline-download-tests.log', 'todo-history-tests.log', 'local-search-tests.log', 'history-archive-tests.log', 'windows-build.log', 'windows-native-tests.log', 'windows-publish.log')
    }
    $manifestPath = Join-Path $deliveryRoot 'package-manifest.json'
    $packageManifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
    @("$zipHash  $zipName", "$manifestHash  package-manifest.json") | Set-Content -LiteralPath (Join-Path $deliveryRoot 'SHA256SUMS.txt') -Encoding ascii
    Write-Output "可移植候选包：$zipPath"
    Write-Output "源提交：$sourceCommit"
    Write-Output "SHA256：$zipHash"
    Write-Output '已完成合成测试、Windows 构建和打包；交互、真实 API、签名、安装、发布仍未执行。'
}
finally {
    if ($null -eq $previousNativeEvidence) { Remove-Item Env:HDY_WINDOWS_TEST_EVIDENCE -ErrorAction SilentlyContinue }
    else { $env:HDY_WINDOWS_TEST_EVIDENCE = $previousNativeEvidence }
    Pop-Location
}
