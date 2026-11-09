using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Haoduoyu.OriginalUi.Policy;

var root = Path.Combine(Path.GetTempPath(), "haoduoyu-host-policy-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
int passed = 0;
void Check(bool condition, string label) { if (!condition) throw new Exception("FAIL: " + label); passed++; Console.WriteLine("PASS " + label); }
void Reject(Action action, string label) { try { action(); } catch (Exception ex) when (ex is IOException or InvalidDataException or JsonException or UnauthorizedAccessException) { Check(true, label); return; } throw new Exception("FAIL accepted: " + label); }
(byte[] manifest, string site) Fixture(string name)
{
    var dir = Path.Combine(root, name); Directory.CreateDirectory(dir);
    File.WriteAllText(Path.Combine(dir, "index.html"), "<!doctype html><script src='/app.js'></script>");
    File.WriteAllText(Path.Combine(dir, "app.js"), "document.title='synthetic';");
    return (Manifest(dir), dir);
}
byte[] Manifest(string dir) => JsonSerializer.SerializeToUtf8Bytes(new { schemaVersion = 1, bundleId = "synthetic-host-policy-v1", entryPoint = "index.html",
    assets = Directory.GetFiles(dir).Order().Select(f => new { path = Path.GetFileName(f), size = new FileInfo(f).Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(f))) }) });
var valid = Fixture("valid"); var catalog = AssetCatalog.Load(valid.site, valid.manifest);
Check(catalog.Paths.Count == 2, "loads pinned synthetic assets");
Check(RequestPolicy.IsDocumentNavigation(RequestPolicy.StartUrl), "local document query allowed");
Check(RequestPolicy.IsDocumentNavigation(RequestPolicy.Origin + "/index.html?page=memos#draft"), "same document routes allowed");
Check(RequestPolicy.TryAssetRequest(RequestPolicy.Origin + "/app.js?__shell=abc", "GET", catalog, out _), "query not interpreted as asset path");
foreach (var url in new[] { "https://example.com/", "http://haoduoyu.original-ui.invalid/", "file:///C:/Windows/win.ini", "javascript:alert(1)", "data:text/html,x", "about:blank", "mailto:a@b", "ms-settings:", "blob:" + RequestPolicy.Origin + "/1", RequestPolicy.Origin + ":443/", "https://haoduoyu.original-ui.invalid.evil/", "https://user@haoduoyu.original-ui.invalid/", RequestPolicy.Origin + "/../index.html", RequestPolicy.Origin + "/%2e%2e/index.html", RequestPolicy.Origin + "/%69ndex.html", RequestPolicy.Origin + "/./index.html", RequestPolicy.Origin + "/foo\\index.html", RequestPolicy.Origin + "//index.html", RequestPolicy.Origin + "/index.html\n" })
    Check(!RequestPolicy.IsDocumentNavigation(url), "reject URL " + url.Replace("\n", "\\n"));
Check(!RequestPolicy.TryAssetRequest(RequestPolicy.Origin + "/sw.js", "GET", catalog, out _), "no service worker file");
Check(!RequestPolicy.TryAssetRequest(RequestPolicy.Origin + "/app.js", "POST", catalog, out _), "no asset write methods");
Check(!RequestPolicy.TryAssetRequest(RequestPolicy.Origin + "/.env", "GET", catalog, out _), "unknown asset denied");
Check(!RequestPolicy.IsDocumentNavigation(RequestPolicy.Origin + "/app.js"), "script not document destination");
File.WriteAllText(Path.Combine(valid.site, "app.js"), "modified after load");
Check(catalog.TryGet("app.js", out var held) && Encoding.UTF8.GetString(held!.Bytes.Span) == "document.title='synthetic';", "immutable served bytes survive disk modification");
Reject(() => AssetCatalog.Load(valid.site, valid.manifest), "tampered asset fails load");
var missing = Fixture("missing"); File.Delete(Path.Combine(missing.site, "app.js")); Reject(() => AssetCatalog.Load(missing.site, missing.manifest), "missing asset fails load");
var extra = Fixture("extra"); File.WriteAllText(Path.Combine(extra.site, "secret.txt"), "not for webview"); Reject(() => AssetCatalog.Load(extra.site, extra.manifest), "unlisted asset rejected");
var nested = Fixture("nested"); Directory.CreateDirectory(Path.Combine(nested.site, "unexpected")); Reject(() => AssetCatalog.Load(nested.site, nested.manifest), "unlisted directory rejected");
var malformed = Fixture("malformed");
Reject(() => AssetCatalog.Load(malformed.site, "[]"u8), "non-object manifest rejected");
Reject(() => AssetCatalog.Load(malformed.site, Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(malformed.manifest).Replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1"))), "duplicate manifest members rejected");
Reject(() => AssetCatalog.Load(malformed.site, Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(malformed.manifest).Replace("\"schemaVersion\":1", "\"schemaVersion\":2"))), "future schema rejected");
Reject(() => AssetCatalog.Load(malformed.site, Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(malformed.manifest).Replace("\"path\":\"app.js\"", "\"path\":\"../app.js\""))), "manifest traversal rejected");
Reject(() => AssetCatalog.Load(malformed.site, Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(malformed.manifest).Replace("\"sha256\":\"", "\"sha256\":\"G"))), "malformed digest rejected");
var sym = Fixture("symlink"); var outside = Path.Combine(root, "outside.js"); File.Move(Path.Combine(sym.site, "app.js"), outside); File.CreateSymbolicLink(Path.Combine(sym.site, "app.js"), outside);
Reject(() => AssetCatalog.Load(sym.site, sym.manifest), "asset symlink rejected even with valid bytes");
var rootLink = Path.Combine(root, "root-link"); Directory.CreateSymbolicLink(rootLink, malformed.site); Reject(() => AssetCatalog.Load(rootLink, malformed.manifest), "bundle root symlink rejected");
if (OperatingSystem.IsLinux())
{
    var hard = Fixture("hardlink"); using var proc = Process.Start(new ProcessStartInfo("ln") { ArgumentList = { Path.Combine(hard.site, "app.js"), Path.Combine(root, "hardlink-copy.js") }, UseShellExecute = false })!; proc.WaitForExit();
    Check(proc.ExitCode == 0, "hardlink fixture prepared"); Reject(() => AssetCatalog.Load(hard.site, hard.manifest), "asset hardlink rejected even with valid bytes");
}
var local = Path.Combine(root, "local-app-data"); Directory.CreateDirectory(local);
var legacy = Path.Combine(local, "Haoduoyu", "NativeWorkbench", "v1"); Directory.CreateDirectory(legacy); File.WriteAllText(Path.Combine(legacy, "sentinel"), "KEEP");
var profile = FileSystemTrust.PrepareProfile(local);
Check(profile == Path.Combine(local, "Haoduoyu", "OriginalWebWorkbench", "v1", "WebView2"), "fixed independent profile namespace");
Check(File.ReadAllText(Path.Combine(legacy, "sentinel")) == "KEEP", "legacy data unchanged");
File.WriteAllText(Path.Combine(profile, "sentinel"), "KEEP PROFILE"); FileSystemTrust.PrepareProfile(local);
Check(File.ReadAllText(Path.Combine(profile, "sentinel")) == "KEEP PROFILE", "profile not cleared on repeat preparation");
var linkedApp = Path.Combine(root, "linked-appdata"); Directory.CreateSymbolicLink(linkedApp, local);
Reject(() => FileSystemTrust.PrepareProfile(linkedApp), "profile parent symlink rejected");
var blob = "blob:" + RequestPolicy.Origin + "/" + Guid.NewGuid().ToString();
Check(RequestPolicy.AllowedExportExtension(blob, "application/json;charset=utf-8", 40) == ".json", "local JSON blob eligible for explicit save");
Check(RequestPolicy.AllowedExportExtension(blob, "text/plain", 40) == ".txt", "local TXT blob eligible for explicit save");
foreach (var (uri, mime, size) in new[] { ("https://example.com/a.json", "application/json", 40L), (blob, "application/json", -1L), (blob, "application/json", 11L*1024*1024), (blob, "application/x-msdownload", 40L), ("blob:https://other.invalid/"+Guid.NewGuid(), "application/json", 40L) })
    Check(RequestPolicy.AllowedExportExtension(uri, mime, size) is null, "unsafe/unknown export rejected");
foreach (var area in new[] {
    (Left:0d, Top:0d, Width:1920d, Height:1040d),
    (Left:0d, Top:0d, Width:1366d, Height:728d),
    (Left:0d, Top:0d, Width:1024d, Height:576d),
    (Left:0d, Top:0d, Width:768d, Height:432d),
    (Left:-1280d, Top:40d, Width:1280d, Height:680d),
    (Left:0d, Top:0d, Width:320d, Height:240d) })
{
    var bounds = StartupWindowBounds.Fit(area.Left, area.Top, area.Width, area.Height);
    Check(bounds.Left >= area.Left && bounds.Top >= area.Top && bounds.Left + bounds.Width <= area.Left + area.Width
        && bounds.Top + bounds.Height <= area.Top + area.Height, "complete startup frame fits work area " + area);
    Check(bounds.MinWidth > 0 && bounds.MinHeight > 0 && bounds.MinWidth <= bounds.Width
        && bounds.MinHeight <= bounds.Height && bounds.Width <= 1280 && bounds.Height <= 850,
        "minimum size remains reachable on small/scaled desktop " + area);
}
foreach (var size in new[] { 0d, -1d, double.NaN, double.PositiveInfinity })
{
    try { StartupWindowBounds.Fit(0, 0, size, 768); throw new Exception("Invalid work area accepted."); }
    catch (ArgumentOutOfRangeException) { Check(true, "invalid work area rejected: " + size); }
}
Console.WriteLine($"PASS total={passed}; synthetic fixtures retained at {root}");
