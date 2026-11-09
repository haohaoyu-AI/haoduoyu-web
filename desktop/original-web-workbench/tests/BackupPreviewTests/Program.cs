using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Haoduoyu.OriginalUi.Policy;

if (args.Length != 1) throw new ArgumentException("Pass the synthetic fixture directory.");
var fixtures=Path.GetFullPath(args[0]); var passed=0;
void Check(bool condition, string label) { if (!condition) throw new Exception("FAIL " + label); passed++; Console.WriteLine("PASS " + label); }
byte[] Read(string name) => File.ReadAllBytes(Path.Combine(fixtures,name+".json"));
void Reject(string name)
{
    try { BackupPreview.Inspect(Read(name)); throw new Exception("FAIL accepted " + name); }
    catch (InvalidDataException ex) { Check(!ex.Message.Contains("SYNTHETIC",StringComparison.Ordinal), "reject " + name + " without source details"); }
}
var bytes=Read("valid"); var result=BackupPreview.Inspect(bytes);
using var manifest=JsonDocument.Parse(Read("manifest"));
Check(result.PayloadSha256==manifest.RootElement.GetProperty("validPayloadSha256").GetString(), "C# checksum matches JavaScript exporter fixture including Unicode and escaping");
Check(result.FileSha256==Convert.ToHexStringLower(SHA256.HashData(bytes)) && result.FileSha256!=result.PayloadSha256,"raw file and canonical payload hashes distinct");
Check(result.Format==BackupPreview.SupportedFormat && result.SourceRevision==42 && result.OwnerCount==1,"explicit format/revision/identity metadata");
Check(!result.CanImport,"read-only preview never grants import capability");
Check(result.Tables.Count==19 && result.Tables.Single(v=>v.Name=="todos").Count==2,"19 exact table names and counts");
Check(result.Tables.Single(v=>v.Name=="todos").DeletedCount==1,"tombstone count retained, not called empty data");
Check(result.Tables.Where(v=>v.ExcludedFromFutureImport).Select(v=>v.Name).Order().SequenceEqual(new[]{"api_keys","audit","idempotency","users"}),"security and history tables explicitly excluded");
var summary=JsonSerializer.Serialize(result);
Check(!summary.Contains("SYNTHETIC",StringComparison.Ordinal) && !summary.Contains("password_hash",StringComparison.Ordinal)
    && !summary.Contains("token_hash",StringComparison.Ordinal) && !summary.Contains("中文",StringComparison.Ordinal),"summary DTO contains no source values or credential fields");
var empty=BackupPreview.Inspect(Read("empty"));
Check(empty.Tables.All(v=>v.Count==0) && empty.OwnerCount==0 && !empty.CanImport,"empty known-format input inspected without full-data claim");
Check(BackupPreview.Inspect(Read("multiple-owners")).OwnerCount==2,"multiple owners reported, never silently remapped");
Check(BackupPreview.Inspect(Read("full")).Tables.All(v=>v.Count>0),"all 19 tables with real contract columns and nullable article link");
Check(BackupPreview.Inspect(Read("safe-integer-boundary")).SourceRevision==9007199254740989,"safe integer boundaries canonicalize like JavaScript");
Check(BackupPreview.Inspect(Read("max-string")).Tables.Single(v=>v.Name=="todos").Count==2,"exact string limit accepted");
Check(!BackupPreview.Inspect(Read("all-controls")).CanImport,"all JSON control escapes match JavaScript checksum, not import semantics");
Check(!BackupPreview.Inspect(Read("structure-only")).CanImport,"structural preview deliberately does not claim record semantic validation");
foreach(var name in new[]{"newer-format","older-format","missing-table","unknown-table","unknown-column","missing-column","wrong-row-type","wrong-table-type",
    "nested-value","fraction","unsafe-integer","negative-revision","revision-overflow","bad-export-time","duplicate-identity","unknown-owner","invalid-id",
    "oversize-string","bad-checksum","duplicate-envelope","duplicate-row-key","unpaired-surrogate","invalid-utf8","bom","trailing",
    "unknown-account","unknown-article","unknown-group","unknown-template","cross-owner-link","duplicate-composite","too-many-rows",
    "decimal-spelling","exponent-spelling","excess-depth"}) Reject(name);
try { BackupPreview.Inspect(new byte[BackupPreview.MaxBytes+1]); throw new Exception("oversized accepted"); }
catch(InvalidDataException) {Check(true,"oversized bytes rejected before parse");}
var temp=Path.Combine(Path.GetTempPath(),"HaoduoyuBackupPreviewTest-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(temp);
foreach(var forbidden in new[]{@"\\server\share\backup.json",@"\\?\C:\backup.json",@"\\.\pipe\backup.json","//server/share/backup.json","https://example.invalid/backup.json"})
{
    try {await BackupPreview.InspectFileAsync(forbidden);throw new Exception("network/device path accepted");}
    catch(InvalidDataException) {Check(true,"remote/device namespace rejected before file access");}
}
var input=Path.Combine(temp,"source.json"); await File.WriteAllBytesAsync(input,bytes);
var sentinel=Path.Combine(temp,"existing-profile-sentinel"); await File.WriteAllTextAsync(sentinel,"SYNTHETIC KEEP EXISTING DATA");
var filesBefore=Directory.GetFiles(temp).Order().ToArray(); var before=SHA256.HashData(await File.ReadAllBytesAsync(input));
for(var i=0;i<3;i++) {var preview=await BackupPreview.InspectFileAsync(input);Check(preview.PayloadSha256==result.PayloadSha256,"repeat handle-based read "+i);}
var after=SHA256.HashData(await File.ReadAllBytesAsync(input));
Check(before.SequenceEqual(after),"input file bytes unchanged");
Check(Directory.GetFiles(temp).Order().SequenceEqual(filesBefore) && await File.ReadAllTextAsync(sentinel)=="SYNTHETIC KEEP EXISTING DATA","no created/deleted files and existing sentinel unchanged");
using(var cancel=new CancellationTokenSource())
{
    cancel.Cancel();
    try {await BackupPreview.InspectFileAsync(input,cancel.Token);throw new Exception("cancel ignored");}
    catch(OperationCanceledException) {Check(true,"cancelled read does not produce a successful preview");}
}
if(OperatingSystem.IsLinux())
{
    var alias=Path.Combine(temp,"alias.json"); File.CreateSymbolicLink(alias,input);
    try {await BackupPreview.InspectFileAsync(alias);throw new Exception("symlink accepted");}
    catch(InvalidDataException) {Check(true,"symlink source refused");}
    using var p=System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("ln") {ArgumentList={input,Path.Combine(temp,"hardlink.json")},UseShellExecute=false})!;p.WaitForExit();
    Check(p.ExitCode==0,"synthetic hardlink created");
    try {await BackupPreview.InspectFileAsync(input);throw new Exception("hardlink accepted");}
    catch(InvalidDataException) {Check(true,"hardlinked source refused by open-handle inspection");}
}
after=SHA256.HashData(await File.ReadAllBytesAsync(input));
Check(before.SequenceEqual(after),"source still unchanged after rejected and cancelled reads");
Console.WriteLine("PASS backup preview checks="+passed+"; synthetic inputs only; no import/database adapter.");
