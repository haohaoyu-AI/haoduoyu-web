using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var cases = new (string Name, Action Run)[]
{
    ("defaults preserve the title and source order without grouping", Defaults),
    ("saved query normalization reuses the actual safe article contract", QueryNormalization),
    ("query state excludes paging aliases source mode endpoints and credentials", QueryBoundaries),
    ("invalid date enum Boolean and numeric ranges cannot become saved views", QueryValidation),
    ("names normalize NFC while preserving valid Chinese and emoji", NameNormalization),
    ("normalized case-insensitive names cannot collide", DuplicateNames),
    ("name scalar and UTF8 limits reject corruption without altering the old list", NameLimits),
    ("explicit view updates retain identity and other views", ExplicitUpdate),
    ("delete requires an existing view identity and retains unrelated data", ExplicitDelete),
    ("twenty named views are bounded without dropping the oldest", ViewLimit),
    ("layouts preserve explicit column order and finite widths", ColumnOrder),
    ("title duplicate unknown and unsafe width selections are rejected", ColumnValidation),
    ("only current-page account grouping is accepted", GroupValidation),
    ("returned settings detach caller dictionaries and arrays", DetachedContainers),
    ("display cells preserve measured zero versus missing metrics", MetricDisplay),
    ("same-name accounts remain separate and missing account data remains unknown", AccountIdentity),
    ("an empty preference read does not create a directory", MissingRead),
    ("authenticated file roundtrip retains Unicode without plaintext leakage", EncryptedRoundTrip),
    ("layout changes never touch workspace or outbox data", WorkspaceIsolation),
    ("stale and missing ETags cannot overwrite committed settings", StaleWrite),
    ("every committed generation changes the ETag even with identical preferences", NewGeneration),
    ("damaged ciphertext is preserved and cannot be silently reset", CorruptPrimary),
    ("a foreign-scope envelope is rejected without modifying files", ForeignEnvelope),
    ("a future schema is retained and rejects read or overwrite", FutureEnvelope),
    ("missing required nested settings never become an empty replacement", MissingRequiredProperties),
    ("duplicate envelope properties reject read and exact-ETag overwrite", DuplicateEnvelopeProperty),
    ("duplicate nested query properties reject read and exact-ETag overwrite", DuplicateNestedQueryProperty),
    ("a missing primary with a backup never becomes an empty new settings file", MissingPrimaryWithBackup),
    ("explicit recovery preserves damaged primary and original backup", RecoveryPreservesEvidence),
    ("restoring a backup changes generation and fences a stale pre-restore writer", RecoveryFencesAba),
    ("invalid recovery backup leaves primary and backup exact", InvalidBackup),
    ("encryption failure retains the old primary and backup without temporary files", EncryptionFailure),
    ("oversized encrypted output cannot replace previous files", EncryptedBudget),
    ("oversized input files are rejected before decryption", InputBudget),
    ("a directory in place of settings does not prevent constructing the ledger UI", DirectoryPrimary),
    ("scope identifiers and directory ownership reject path confusion", DirectoryScope)
};
var failures = 0;
foreach (var test in cases)
{
    try { test.Run(); Console.WriteLine("PASS " + test.Name); }
    catch (Exception error) { failures++; Console.WriteLine("FAIL " + test.Name + ": " + error.Message); }
}
Console.WriteLine($"Ledger views: {cases.Length - failures}/{cases.Length} checks passed; isolated temporary files and synthetic AES protection only, no sockets or real user data.");
return failures == 0 ? 0 : 1;

static void Check(bool condition, string message = "assertion failed")
{ if (!condition) throw new InvalidOperationException(message); }
static void Reject(Action action)
{
    try { action(); }
    catch (Exception error) when (error is InvalidDataException or InvalidOperationException or ArgumentException or IOException or CryptographicException) { return; }
    throw new InvalidOperationException("unsafe operation was accepted");
}
static string Json<T>(T value) => JsonSerializer.Serialize(value);
static Dictionary<string, string> Query(string text = "中文条件 🐟") => new(StringComparer.Ordinal)
{ ["status"] = "published", ["q"] = text, ["sort"] = "reads", ["order"] = "asc", ["page_size"] = "20" };
static LedgerViewPreferences Named(string name = "常用视图 🐟") => ArticleLedgerViews.SaveView(new(), name, Query(), ArticleLedgerViews.DefaultLayout());

static void Defaults()
{
    var value = ArticleLedgerViews.CloneAndValidate(new());
    Check(value.Layout.GroupBy == "none" && value.Views.Count == 0);
    Check(value.Layout.Columns.Any(column => column.Key == "title") && value.Layout.Columns.All(column => double.IsFinite(column.Width)));
}
static void QueryNormalization()
{
    var input = Query("  中文 🐟 %_!  "); input["from"] = "2026-11-04"; input["to"] = "2026-11-04";
    var normalized = ArticleLedgerViews.NormalizeQuery(input);
    var native = ArticleLedgerQuery.Parse(normalized);
    Check(native.Status == "published" && native.Page == 1 && native.PageSize == 20 && normalized["q"] == "中文 🐟 %_!");
    Check(!normalized.ContainsKey("page") && !normalized.ContainsKey("offset") && !normalized.ContainsKey("fields"));
}
static void QueryBoundaries()
{
    foreach (var field in new[] { "page", "offset", "limit", "fields", "sourceMode", "path", "uri", "Authorization", "Cookie", "password" })
    {
        var input = Query(); input[field] = "1"; Reject(() => ArticleLedgerViews.NormalizeQuery(input));
    }
}
static void QueryValidation()
{
    foreach (var pair in new[] { ("status", "all"), ("from", "2026-02-30"), ("has_pending_verify", "unknown"), ("series_no_min", "0"), ("page_size", "201"), ("q", "\ud800") })
    { var query = Query(); query[pair.Item1] = pair.Item2; Reject(() => ArticleLedgerViews.NormalizeQuery(query)); }
    var reversed = Query(); reversed["from"] = "2026-11-05"; reversed["to"] = "2026-11-04";
    Reject(() => ArticleLedgerViews.NormalizeQuery(reversed));
}
static void NameNormalization()
{
    var value = Named("  Cafe\u0301 中文 🐟  "); Check(value.Views.Single().Name == "Café 中文 🐟");
}
static void DuplicateNames()
{
    var value = Named("Café"); var before = Json(value);
    Reject(() => ArticleLedgerViews.SaveView(value, "CAFE\u0301", Query(), value.Layout));
    Check(Json(value) == before);
}
static void NameLimits()
{
    var original = Named(); var before = Json(original);
    foreach (var name in new[] { " ", "has\nnewline", "has\u0000zero", "\ud800", new string('a', 61), string.Concat(Enumerable.Repeat("🐟", 61)) })
        Reject(() => ArticleLedgerViews.SaveView(original, name, Query(), original.Layout));
    var maximum = ArticleLedgerViews.SaveView(original, string.Concat(Enumerable.Repeat("🐟", 60)), Query(), original.Layout);
    Check(maximum.Views.Count == 2 && Json(original) == before);
}
static void ExplicitUpdate()
{
    var original = Named(); var a = original.Views[0];
    var more = ArticleLedgerViews.SaveView(original, "其他视图", Query("不应改变"), original.Layout);
    var updated = ArticleLedgerViews.SaveView(more, "更新后的视图", Query("新的条件"), new LedgerLayout { GroupBy = "account", Columns = more.Layout.Columns }, a.Id);
    Check(updated.Views.Count == 2 && updated.Views.Single(view => view.Id == a.Id).Query["q"] == "新的条件");
    Check(updated.Views.Single(view => view.Name == "其他视图").Query["q"] == "不应改变" && original.Views[0].Name == a.Name);
    Reject(() => ArticleLedgerViews.SaveView(updated, "不存在", Query(), updated.Layout, Guid.NewGuid().ToString()));
}
static void ExplicitDelete()
{
    var value = ArticleLedgerViews.SaveView(Named(), "第二视图", Query("其他"), ArticleLedgerViews.DefaultLayout());
    var remaining = ArticleLedgerViews.DeleteView(value, value.Views[0].Id);
    Check(remaining.Views.Count == 1 && remaining.Views[0].Name == "第二视图" && value.Views.Count == 2);
    Reject(() => ArticleLedgerViews.DeleteView(value, Guid.NewGuid().ToString()));
}
static void ViewLimit()
{
    var value = new LedgerViewPreferences();
    for (var index = 0; index < 20; index++) value = ArticleLedgerViews.SaveView(value, "视图" + index, Query(), value.Layout);
    var before = Json(value); Reject(() => ArticleLedgerViews.SaveView(value, "第21个", Query(), value.Layout)); Check(Json(value) == before && value.Views.Count == 20);
    Check(ArticleLedgerViews.SaveView(value, "允许更新", Query(), value.Layout, value.Views[0].Id).Views.Count == 20);
}
static void ColumnOrder()
{
    var columns = new[] { new LedgerColumn("reads", 80), new LedgerColumn("title", 1200), new LedgerColumn("account", 64) };
    var settings = ArticleLedgerViews.WithLayout(Named(), new LedgerLayout { GroupBy = "account", Columns = columns });
    Check(settings.Layout.Columns.Select(column => column.Key).SequenceEqual(new[] { "reads", "title", "account" }) && settings.Layout.Columns[1].Width == 1200);
}
static void ColumnValidation()
{
    foreach (var columns in new IReadOnlyList<LedgerColumn>[]
    {
        [], [new("reads", 100)], [new("title", 100), new("title", 200)], [new("title", 100), new("private_body", 100)],
        [new("title", double.NaN)], [new("title", double.PositiveInfinity)], [new("title", 63.9)], [new("title", 1200.1)]
    }) Reject(() => ArticleLedgerViews.WithLayout(new(), new LedgerLayout { Columns = columns }));
}
static void GroupValidation()
{
    Reject(() => ArticleLedgerViews.WithLayout(new(), new LedgerLayout { GroupBy = "entire_server_scope" }));
    Check(ArticleLedgerViews.WithLayout(new(), new LedgerLayout { GroupBy = "account" }).Layout.GroupBy == "account");
}
static void DetachedContainers()
{
    var query = Query("原条件"); var columns = new[] { new LedgerColumn("title", 100), new LedgerColumn("reads", 80) };
    var original = new LedgerViewPreferences { Layout = new LedgerLayout { Columns = columns } };
    var saved = ArticleLedgerViews.SaveView(original, "保全", query, original.Layout);
    query["q"] = "调用方后改"; columns[0] = new LedgerColumn("comments", 80);
    Check(saved.Views[0].Query["q"] == "原条件" && saved.Layout.Columns[0].Key == "title" && saved.Views[0].Layout.Columns[0].Key == "title");
}
static void MetricDisplay()
{
    var missing = new JsonObject { ["title"] = "未知指标", ["latest_metrics"] = new JsonObject { ["reads"] = null } };
    var zero = (JsonObject)missing.DeepClone(); zero["latest_metrics"]!["reads"] = 0;
    var before = missing.ToJsonString(); var unknown = ArticleLedgerViews.Cells(missing); var measured = ArticleLedgerViews.Cells(zero);
    Check(measured["reads"] == "0" && unknown["reads"] != "0" && unknown["reads"].Length > 0 && missing.ToJsonString() == before);
}
static void AccountIdentity()
{
    var a = new JsonObject { ["account_id"] = "account-a", ["account_name"] = "同名" };
    var b = new JsonObject { ["account_id"] = "account-b", ["account_name"] = "同名" };
    Check(ArticleLedgerViews.AccountGroupKey(a) != ArticleLedgerViews.AccountGroupKey(b));
    Check(ArticleLedgerViews.AccountGroupKey(new JsonObject()).Length > 0);
}
static void MissingRead()
{
    using var fixture = new Fixture(create: false); var result = fixture.Store.Read();
    Check(result.ETag is null && result.Preferences.Views.Count == 0 && !Directory.Exists(fixture.Directory));
}
static void EncryptedRoundTrip()
{
    using var fixture = new Fixture(); var value = Named("中文保密视图 🐟");
    var saved = fixture.Store.Write(value, null); var bytes = File.ReadAllBytes(fixture.Path);
    Check(bytes.AsSpan(0, Fixture.Header.Length).SequenceEqual(Fixture.Header));
    Check(!Encoding.UTF8.GetString(bytes).Contains("中文保密视图", StringComparison.Ordinal) && !Encoding.UTF8.GetString(bytes).Contains("中文条件", StringComparison.Ordinal));
    Check(saved.ETag == Convert.ToHexStringLower(SHA256.HashData(bytes)) && Json(fixture.Store.Read().Preferences) == Json(saved.Preferences));
}
static void WorkspaceIsolation()
{
    using var fixture = new Fixture(); var path = System.IO.Path.Combine(fixture.Directory, "workspace.bin");
    var original = Encoding.UTF8.GetBytes("synthetic immutable workspace/outbox body"); File.WriteAllBytes(path, original);
    var first = fixture.Store.Write(Named(), null);
    fixture.Store.Write(ArticleLedgerViews.WithLayout(first.Preferences, new LedgerLayout { GroupBy = "account" }), first.ETag);
    fixture.Store.RestoreBackup(); Check(File.ReadAllBytes(path).SequenceEqual(original));
}
static void StaleWrite()
{
    using var fixture = new Fixture(); var initial = fixture.Store.Read(); var first = fixture.Store.Write(Named(), initial.ETag);
    var second = fixture.Store.Write(ArticleLedgerViews.SaveView(first.Preferences, "新的视图", Query(), first.Preferences.Layout), first.ETag);
    var bytes = File.ReadAllBytes(fixture.Path); var backup = File.ReadAllBytes(fixture.Backup);
    Reject(() => fixture.Store.Write(first.Preferences, first.ETag)); Reject(() => fixture.Store.Write(new(), null));
    Check(File.ReadAllBytes(fixture.Path).SequenceEqual(bytes) && File.ReadAllBytes(fixture.Backup).SequenceEqual(backup) && fixture.Store.Read().ETag == second.ETag);
}
static void NewGeneration()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null); var generation = fixture.Generation();
    var second = fixture.Store.Write(first.Preferences, first.ETag);
    Check(first.ETag != second.ETag && generation != fixture.Generation() && Json(first.Preferences) == Json(second.Preferences));
}
static void CorruptPrimary()
{
    using var fixture = new Fixture(); var saved = fixture.Store.Write(Named(), null);
    var bytes = File.ReadAllBytes(fixture.Path); bytes[^1] ^= 1; File.WriteAllBytes(fixture.Path, bytes);
    Reject(() => fixture.Store.Read()); Reject(() => fixture.Store.Write(saved.Preferences, Tag(bytes)));
    Check(File.ReadAllBytes(fixture.Path).SequenceEqual(bytes) && !Directory.EnumerateFiles(fixture.Directory).Any(path => path.EndsWith(".tmp", StringComparison.Ordinal)));
}
static void ForeignEnvelope()
{
    using var fixture = new Fixture(); var saved = fixture.Store.Write(Named(), null);
    fixture.MutateEnvelope(value => Set(value, "ScopeId", new string('b', 64)));
    var bytes = File.ReadAllBytes(fixture.Path); Reject(() => fixture.Store.Read()); Reject(() => fixture.Store.Write(saved.Preferences, Tag(bytes)));
    Check(File.ReadAllBytes(fixture.Path).SequenceEqual(bytes));
}
static void FutureEnvelope()
{
    using var fixture = new Fixture(); var saved = fixture.Store.Write(Named(), null);
    fixture.MutateEnvelope(value => Set(value, "Schema", 100)); var bytes = File.ReadAllBytes(fixture.Path);
    Reject(() => fixture.Store.Read()); Reject(() => fixture.Store.Write(saved.Preferences, Tag(bytes))); Check(File.ReadAllBytes(fixture.Path).SequenceEqual(bytes));
}
static void MissingRequiredProperties()
{
    foreach (var path in new[] { new[] { "Preferences", "Views" }, new[] { "Preferences", "Layout", "Columns" } })
    {
        using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null);
        var saved = fixture.Store.Write(first.Preferences, first.ETag);
        fixture.MutateEnvelope(value =>
        {
            var current = value;
            foreach (var name in path[..^1]) current = Property(current, name)!.AsObject();
            Check(current.Remove(PropertyName(current, path[^1])));
        });
        RefuseWithoutMutation(fixture, saved.Preferences);
    }
}
static void DuplicateEnvelopeProperty()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null);
    var saved = fixture.Store.Write(first.Preferences, first.ETag);
    fixture.MutateEnvelopeText(value =>
    {
        var name = PropertyName(JsonNode.Parse(value)!.AsObject(), "Schema");
        return value.Insert(1, JsonSerializer.Serialize(name) + ":1,");
    });
    RefuseWithoutMutation(fixture, saved.Preferences);
}
static void DuplicateNestedQueryProperty()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null);
    var saved = fixture.Store.Write(first.Preferences, first.ETag);
    fixture.MutateEnvelopeText(value =>
    {
        var changed = value.Replace("\"q\":", "\"q\":\"synthetic duplicate\",\"q\":", StringComparison.Ordinal);
        Check(changed != value, "synthetic fixture must actually repeat a nested query property");
        return changed;
    });
    RefuseWithoutMutation(fixture, saved.Preferences);
}
static void RefuseWithoutMutation(Fixture fixture, LedgerViewPreferences preferences)
{
    var primary = File.ReadAllBytes(fixture.Path); var backup = File.ReadAllBytes(fixture.Backup);
    Reject(() => fixture.Store.Read()); Reject(() => fixture.Store.Write(preferences, Tag(primary)));
    Check(File.ReadAllBytes(fixture.Path).SequenceEqual(primary) && File.ReadAllBytes(fixture.Backup).SequenceEqual(backup));
}
static void MissingPrimaryWithBackup()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null); fixture.Store.Write(first.Preferences, first.ETag);
    var backup = File.ReadAllBytes(fixture.Backup); File.Delete(fixture.Path);
    Reject(() => fixture.Store.Read()); Reject(() => fixture.Store.Write(new(), null));
    Check(!File.Exists(fixture.Path) && File.ReadAllBytes(fixture.Backup).SequenceEqual(backup));
}
static void RecoveryPreservesEvidence()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named("备份中的视图"), null);
    fixture.Store.Write(Named("较新主文件"), first.ETag); var backup = File.ReadAllBytes(fixture.Backup);
    var damaged = File.ReadAllBytes(fixture.Path); damaged[^1] ^= 1; File.WriteAllBytes(fixture.Path, damaged);
    var result = fixture.Store.RestoreBackup();
    Check(result.Preferences.Views[0].Name == "备份中的视图" && File.ReadAllBytes(fixture.Backup).SequenceEqual(backup));
    var retained = Directory.EnumerateFiles(fixture.Directory, "ledger-views.bin.damaged-*").ToArray();
    Check(retained.Length == 1 && File.ReadAllBytes(retained[0]).SequenceEqual(damaged));
}
static void RecoveryFencesAba()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null); var second = fixture.Store.Write(first.Preferences, first.ETag);
    var recovered = fixture.Store.RestoreBackup(); Check(recovered.ETag != first.ETag && recovered.ETag != second.ETag);
    Reject(() => fixture.Store.Write(first.Preferences, first.ETag)); Reject(() => fixture.Store.Write(second.Preferences, second.ETag));
    Check(fixture.Store.Read().ETag == recovered.ETag);
}
static void InvalidBackup()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null); fixture.Store.Write(first.Preferences, first.ETag);
    var primary = File.ReadAllBytes(fixture.Path); var backup = File.ReadAllBytes(fixture.Backup); backup[^1] ^= 1; File.WriteAllBytes(fixture.Backup, backup);
    Reject(() => fixture.Store.RestoreBackup()); Check(File.ReadAllBytes(fixture.Path).SequenceEqual(primary) && File.ReadAllBytes(fixture.Backup).SequenceEqual(backup));
}
static void EncryptionFailure()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null); fixture.Store.Write(first.Preferences, first.ETag);
    var before = File.ReadAllBytes(fixture.Path); var backup = File.ReadAllBytes(fixture.Backup);
    var bad = new EncryptedLedgerViewStore(fixture.Directory, fixture.Scope, new OutputProtector(fixture.Protector, fail: true));
    Reject(() => bad.Write(first.Preferences, fixture.Store.Read().ETag));
    Check(File.ReadAllBytes(fixture.Path).SequenceEqual(before) && File.ReadAllBytes(fixture.Backup).SequenceEqual(backup) &&
        !Directory.EnumerateFiles(fixture.Directory).Any(path => path.EndsWith(".tmp", StringComparison.Ordinal)));
}
static void EncryptedBudget()
{
    using var fixture = new Fixture(); var first = fixture.Store.Write(Named(), null); var before = File.ReadAllBytes(fixture.Path);
    var bad = new EncryptedLedgerViewStore(fixture.Directory, fixture.Scope, new OutputProtector(fixture.Protector, fail: false));
    Reject(() => bad.Write(first.Preferences, first.ETag)); Check(File.ReadAllBytes(fixture.Path).SequenceEqual(before));
}
static void InputBudget()
{
    using var fixture = new Fixture(); File.WriteAllBytes(fixture.Path, new byte[512 * 1024 + 1]); var before = File.ReadAllBytes(fixture.Path);
    var protector = new OutputProtector(fixture.Protector, fail: true); var store = new EncryptedLedgerViewStore(fixture.Directory, fixture.Scope, protector);
    Reject(() => store.Read()); Check(protector.UnprotectCalls == 0 && File.ReadAllBytes(fixture.Path).SequenceEqual(before));
}
static void DirectoryScope()
{
    using var fixture = new Fixture();
    Reject(() => new EncryptedLedgerViewStore(fixture.Directory, new string('b', 64), fixture.Protector));
    Reject(() => new EncryptedLedgerViewStore(fixture.Directory, "../workspace", fixture.Protector));
    Reject(() => new EncryptedLedgerViewStore(fixture.Directory, new string('A', 64), fixture.Protector));
}
static void DirectoryPrimary()
{
    using var fixture = new Fixture(); Directory.CreateDirectory(fixture.Path);
    var sentinel = System.IO.Path.Combine(fixture.Path, "synthetic-keep.txt");
    var bytes = Encoding.UTF8.GetBytes("keep this unrelated synthetic file"); File.WriteAllBytes(sentinel, bytes);
    var store = new EncryptedLedgerViewStore(fixture.Directory, fixture.Scope, fixture.Protector);
    Reject(() => store.Read()); Reject(() => store.Write(new(), null));
    Check(Directory.Exists(fixture.Path) && File.ReadAllBytes(sentinel).SequenceEqual(bytes) && !File.Exists(fixture.Backup));
}
static void Set(JsonObject value, string field, JsonNode? entry)
{
    value[PropertyName(value, field)] = entry;
}
static string PropertyName(JsonObject value, string field) => value.Select(pair => pair.Key).Single(name => string.Equals(name, field, StringComparison.OrdinalIgnoreCase));
static JsonNode? Property(JsonObject value, string field) => value[PropertyName(value, field)];
static string Tag(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

sealed class Fixture : IDisposable
{
    internal static readonly byte[] Header = "HDYVIEW1\n"u8.ToArray();
    internal string Root { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "hdy-ledger-views-synthetic-" + Guid.NewGuid().ToString("N"));
    internal string Scope { get; } = new('a', 64);
    internal string Directory { get; }
    internal string Path => System.IO.Path.Combine(Directory, "ledger-views.bin");
    internal string Backup => Path + ".bak";
    internal AesProtector Protector { get; } = new();
    internal EncryptedLedgerViewStore Store { get; }
    internal Fixture(bool create = true)
    {
        Directory = System.IO.Path.Combine(Root, Scope); if (create) System.IO.Directory.CreateDirectory(Directory);
        Store = new(Directory, Scope, Protector);
    }
    internal void MutateEnvelope(Action<JsonObject> mutate)
        => MutateEnvelopeText(value => { var document = JsonNode.Parse(value)!.AsObject(); mutate(document); return document.ToJsonString(); });
    internal void MutateEnvelopeText(Func<string, string> mutate)
    {
        var bytes = File.ReadAllBytes(Path); var plaintext = Protector.Unprotect(bytes[Header.Length..]);
        try
        {
            var changed = Encoding.UTF8.GetBytes(mutate(Encoding.UTF8.GetString(plaintext))); var encrypted = Protector.Protect(changed);
            File.WriteAllBytes(Path, Header.Concat(encrypted).ToArray()); CryptographicOperations.ZeroMemory(changed);
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }
    internal string Generation()
    {
        var bytes = File.ReadAllBytes(Path); var plaintext = Protector.Unprotect(bytes[Header.Length..]);
        try
        {
            var document = JsonNode.Parse(plaintext)!.AsObject();
            var value = document.Single(pair => string.Equals(pair.Key, "Generation", StringComparison.OrdinalIgnoreCase)).Value?.GetValue<string>();
            if (!Guid.TryParse(value, out var id) || id == Guid.Empty) throw new InvalidDataException("Generation is not a real nonempty UUID.");
            return value!;
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }
    public void Dispose()
    {
        Protector.Dispose(); if (System.IO.Directory.Exists(Root)) System.IO.Directory.Delete(Root, recursive: true);
    }
}
sealed class AesProtector : IStateProtector, IDisposable
{
    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    public byte[] Protect(byte[] plaintext)
    {
        var result = new byte[12 + 16 + plaintext.Length]; RandomNumberGenerator.Fill(result.AsSpan(0, 12));
        using var aes = new AesGcm(key, 16); aes.Encrypt(result.AsSpan(0, 12), plaintext, result.AsSpan(28), result.AsSpan(12, 16)); return result;
    }
    public byte[] Unprotect(byte[] ciphertext)
    {
        if (ciphertext.Length < 28) throw new CryptographicException("Synthetic ciphertext is incomplete.");
        var result = new byte[ciphertext.Length - 28]; using var aes = new AesGcm(key, 16);
        aes.Decrypt(ciphertext.AsSpan(0, 12), ciphertext.AsSpan(28), ciphertext.AsSpan(12, 16), result); return result;
    }
    public void Dispose() => CryptographicOperations.ZeroMemory(key);
}
sealed class OutputProtector(IStateProtector inner, bool fail) : IStateProtector
{
    internal int UnprotectCalls { get; private set; }
    public byte[] Protect(byte[] plaintext) => fail ? throw new CryptographicException("Synthetic encryption failure") : new byte[512 * 1024 + 1];
    public byte[] Unprotect(byte[] ciphertext) { UnprotectCalls++; return inner.Unprotect(ciphertext); }
}
