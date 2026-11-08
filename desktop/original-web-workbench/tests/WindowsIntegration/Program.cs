using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;
using Haoduoyu.OriginalUi;
using Haoduoyu.OriginalUi.Policy;
using Microsoft.Web.WebView2.Core;

internal static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length != 3 || args[0] is not ("seed" or "restart" or "site" or "close-failed" or "close-pending" or "close-missing" or "runtime-override" or "runtime-query" or "site-storage-failed" or "site-review" or "site-todo-seed" or "site-todo-restart" or "site-future-seed" or "site-future-restart" or "site-note-seed" or "site-note-restart"))
        { Console.Error.WriteLine("Usage: IntegrationTests seed|restart|site|close-failed|close-pending|close-missing|runtime-override|runtime-query <dedicated temp test root> <fixture-or-reviewed-site-directory>"); return 2; }
        var root = Path.GetFullPath(args[1]);
        if (!root.StartsWith(Path.GetFullPath(Path.GetTempPath()), StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(root).StartsWith("HaoduoyuOriginalUiTest-", StringComparison.Ordinal))
        { Console.Error.WriteLine("Only a dedicated HaoduoyuOriginalUiTest-* temp directory is allowed."); return 2; }
        Directory.CreateDirectory(root);
        var phase = args[0]; var shared=phase.StartsWith("site",StringComparison.Ordinal); var site = Path.GetFullPath(args[2]);
        if (phase == "runtime-query")
        {
            try
            {
                // Read-only discovery: no WebView, profile, installation, registry or network write.
                var runtime = CoreWebView2Environment.GetAvailableBrowserVersionString();
                File.WriteAllText(Path.Combine(root, "runtime-query-result.json"), JsonSerializer.Serialize(new { runtime, queryOnly=true, os=Environment.OSVersion.VersionString }));
                Console.WriteLine(runtime); return 0;
            }
            catch (Exception ex) { File.WriteAllText(Path.Combine(root, "runtime-query-failure.txt"), ex.ToString()); Console.Error.WriteLine(ex); return 1; }
        }
        var processSessionId=System.Diagnostics.Process.GetCurrentProcess().SessionId;
        var sessionKind=Environment.UserInteractive && processSessionId!=0 ? "交互session" : "非交互session";
        var evidenceLabel="云Windows WebView测试运行（"+sessionKind+"，"+(shared?"共享原界面，合成本机数据":"SYNTHETIC HOST TEST ONLY")+"）";
        var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        app.Startup += async (_, _) =>
        {
            OriginalUiWindow? window = null;
            try
            {
                // Test-only pinned metadata generated from this explicit synthetic/reviewed input. Production uses an embedded manifest.
                var specs = Directory.GetFiles(site).Order().Select(file => new { path = Path.GetFileName(file), size = new FileInfo(file).Length,
                    sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file))) });
                var manifest = JsonSerializer.SerializeToUtf8Bytes(new { schemaVersion = 1, bundleId = "windows-visible-integration", entryPoint = "index.html", assets = specs });
                if (shared)
                {
                    using var pinned = typeof(OriginalUiWindow).Assembly.GetManifestResourceStream("HostAssetManifest")
                        ?? throw new InvalidDataException("Reviewed shared bundle was not embedded in shipping host.");
                    using var bytes = new MemoryStream(); pinned.CopyTo(bytes); manifest = bytes.ToArray();
                }
                var assets = AssetCatalog.Load(site, manifest);
                var sourceManifestSha256=shared ? Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(Path.Combine(Path.GetDirectoryName(site)!,"source-build-manifest.json")))) : null;
                if(shared && assets.BundleId!="original-ui-"+sourceManifestSha256![..20]) throw new InvalidDataException("Shared source manifest and embedded bundle identity differ.");
                var profile = FileSystemTrust.PrepareProfile(root);
                var old = Path.Combine(root, "Haoduoyu", "NativeWorkbench", "v1"); Directory.CreateDirectory(old);
                var oldFile = Path.Combine(old, "synthetic-sentinel");
                if (!File.Exists(oldFile)) File.WriteAllText(oldFile, "never touch old data");
                if (phase == "runtime-override") Environment.SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--synthetic-disallowed-override");
                window = new OriginalUiWindow(assets, profile); app.MainWindow = window; window.Show();
                if (phase == "runtime-override")
                {
                    try { await window.Ready.WaitAsync(TimeSpan.FromSeconds(30)); throw new Exception("Environment override was unexpectedly accepted."); }
                    catch (InvalidOperationException) when (window.LastFailure?.Contains("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", StringComparison.Ordinal) == true) { }
                    if (!window.IsVisible || File.ReadAllText(oldFile) != "never touch old data") throw new Exception("Runtime refusal lost shown error or legacy sentinel.");
                    File.WriteAllText(Path.Combine(root, phase+"-result.json"), JsonSerializer.Serialize(new { passed=true, phase, shown=true, error=window.LastFailure, legacyPreserved=true }));
                    window.Close(); app.Shutdown(0); return;
                }
                await window.Ready.WaitAsync(TimeSpan.FromSeconds(30));
                if (!window.IsVisible) throw new Exception("Window was not actually shown.");
                var expectedRuntime = Environment.GetEnvironmentVariable("HAODUOYU_TEST_EXPECTED_WEBVIEW2_VERSION");
                var actualRuntime = CoreWebView2Environment.GetAvailableBrowserVersionString();
                if (!string.IsNullOrEmpty(expectedRuntime) && actualRuntime != expectedRuntime)
                    throw new Exception("Installed WebView2 runtime differs from reviewed test version. Expected " + expectedRuntime + ", actual " + actualRuntime);
                Console.WriteLine("Actual WebView2 runtime: " + actualRuntime);
                if (!shared)
                {
                    await WaitFor(window, "window.fixture?.ready===true");
                    if (phase == "seed")
                    {
                        await window.Core.ExecuteScriptAsync("window.fixtureSet('synthetic-committed-before-restart')");
                        await WaitFor(window, "window.fixture.value==='synthetic-committed-before-restart'");
                    }
                    else if (phase == "restart") await WaitFor(window, "window.fixture.value==='synthetic-committed-before-restart'");
                    Console.WriteLine("PASS committed IndexedDB " + phase);
                }
                else
                {
                    await WaitFor(window, "document.querySelector('#app')?.textContent.length>30 && !document.querySelector('.initial-loading')");
                    Console.WriteLine("PASS reviewed bundle rendered; UI/data are a new empty synthetic profile, not production");
                }
                var immediateClose=shared && await SharedPageScenario.Prepare(window,phase,root);
                double? lastInputToCloseMs=null;
                if (!immediateClose)
                {
                await Capture(window, Path.Combine(root, phase + "-1280.png"));
                window.Width = 430; await Task.Delay(700); await Capture(window, Path.Combine(root, phase + "-430.png"));
                window.Width = 1280;
                // A local canary observes attempted page egress; no production endpoint is used.
                var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
                try
                {
                    var port = ((IPEndPoint)listener.LocalEndpoint).Port;
                    await window.Core.ExecuteScriptAsync("window.probeErrors=[]; const u='https://127.0.0.1:" + port + "/canary'; " +
                        "fetch(u).catch(()=>probeErrors.push('fetch'));" +
                        "const i=new Image();i.src=u;document.body.append(i);" +
                        "const s=document.createElement('script');s.src=u;document.body.append(s);" +
                        "const f=document.createElement('iframe');f.src=u;document.body.append(f);" +
                        "try{new WebSocket(u.replace('https:','wss:'))}catch{probeErrors.push('socket')}" +
                        "try{new Worker(u)}catch{probeErrors.push('worker')}" +
                        "try{navigator.sendBeacon(u,'synthetic')}catch{probeErrors.push('beacon')}" +
                        "window.open(u,'_blank');");
                    await Task.Delay(700);
                    if (listener.Pending()) throw new Exception("Page reached network canary.");
                    Console.WriteLine("PASS page fetch/image/script/frame/socket/worker/beacon blocked by CSP/interception; zero canary connections");
                }
                finally { listener.Stop(); }
                var before = window.BlockedNavigations;
                foreach (var url in new[] { "https://example.invalid/", "file:///C:/Windows/win.ini", "mailto:synthetic@example.invalid" })
                { window.Core.Navigate(url); await Task.Delay(150); }
                if (window.BlockedNavigations < before+3 || !RequestPolicy.IsDocumentNavigation(window.Core.Source)) throw new Exception("Navigation escaped local document.");
                if (window.Core.Settings.AreHostObjectsAllowed || window.Core.Settings.IsWebMessageEnabled || window.Core.Settings.AreDevToolsEnabled)
                    throw new Exception("Unexpected bridge/debugging capability enabled.");
                Console.WriteLine("PASS external/file/scheme navigation blocked; bridges disabled");
                if (File.ReadAllText(oldFile) != "never touch old data") throw new Exception("Legacy sentinel changed.");
                if (phase.StartsWith("close-", StringComparison.Ordinal)) await CloseSafety.Probe(window, phase[6..]);
                }
                // Hold the process until the exact shipping host's graceful close succeeds.
                var closed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                window.Closed += (_, _) => closed.TrySetResult();
                if(immediateClose) lastInputToCloseMs=System.Diagnostics.Stopwatch.GetElapsedTime(SharedPageScenario.LastInputAt).TotalMilliseconds;
                window.Close();
                try { await closed.Task.WaitAsync(TimeSpan.FromSeconds(15)); }
                catch (TimeoutException) when (phase.StartsWith("close-", StringComparison.Ordinal))
                {
                    string retryEvidence;
                    try { retryEvidence = await window.Core.ExecuteScriptAsync("JSON.stringify(window.retryProbe || null)").WaitAsync(TimeSpan.FromSeconds(2)); }
                    catch (Exception probeError) { retryEvidence = "unavailable: " + probeError.GetType().Name; }
                    throw new TimeoutException("Final close timed out. Visible=" + window.IsVisible +
                        "; closeInProgress=" + window.CloseInProgress + "; previousFailure=" + window.CloseFailure +
                        "; syntheticRetryProbe=" + retryEvidence);
                }
                if(lastInputToCloseMs>100) throw new Exception("Last input to native close exceeded 100 ms; do not claim before-debounce acceptance.");
                Console.WriteLine("PASS graceful close and legacy sentinel preserved");
                File.WriteAllText(Path.Combine(root, phase+"-result.json"), JsonSerializer.Serialize(new { passed = true, phase,
                    runtime = CoreWebView2Environment.GetAvailableBrowserVersionString(), source = shared ? "reviewed bundle, new local profile" : "synthetic host fixture", shown = true,
                    bundleId=assets.BundleId, evidenceLabel, userInteractive=Environment.UserInteractive, processSessionId, lastInputToCloseMs, sourceManifestSha256, os=Environment.OSVersion.VersionString, dimensions=new[]{1280,430},
                    scale=System.Windows.Media.VisualTreeHelper.GetDpi(window).DpiScaleX,
                    scope="application-content tests, not OS-wide no-egress or release readiness" }, new JsonSerializerOptions { WriteIndented = true }));
                app.Shutdown(0);
            }
            catch (Exception ex) { Console.Error.WriteLine(ex); File.WriteAllText(Path.Combine(root, phase+"-failure.txt"), ex.ToString()); app.Shutdown(1); }
        };
        return app.Run();
    }
    private static async Task WaitFor(OriginalUiWindow window, string predicate)
    {
        for (var attempt=0; attempt<200; attempt++)
        { if (await window.Core.ExecuteScriptAsync("Boolean("+predicate+")").WaitAsync(TimeSpan.FromSeconds(5)) == "true") return; await Task.Delay(50); }
        throw new TimeoutException("DOM test did not complete: " + predicate);
    }
    private static async Task Capture(OriginalUiWindow window, string path)
    { await Task.Delay(400); using var file = new FileStream(path, FileMode.CreateNew); await window.Core.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, file); ValidatePng(file); }
    internal static void ValidatePng(FileStream file)
    {
        if(file.Length<128) throw new InvalidDataException("Actual CapturePreview PNG missing or empty.");
        file.Position=0; Span<byte> signature=stackalloc byte[8]; file.ReadExactly(signature);
        if(!signature.SequenceEqual(new byte[]{137,80,78,71,13,10,26,10})) throw new InvalidDataException("Actual screenshot is not PNG.");
    }
}
