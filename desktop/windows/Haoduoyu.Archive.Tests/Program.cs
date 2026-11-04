using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Haoduoyu.Core;

var tests = new (string Name, Func<Task> Run)[]
{
    ("Authenticated encryption preserves every original Unicode/history field", async () =>
    {
        using var fixture = new Fixture();
        var dependency = Guid.NewGuid().ToString();
        var operation = Operation() with { BodyJson = "{ \"text\" : \"中文👩‍💻 Café\\n原稿\", \"zero\":0,\"missing\":null }",
            Error = "用户取消\r\n原错误：中文🪷", DependencyIds = [dependency], VersionFromDependencyId = dependency,
            SupersededById = Guid.NewGuid().ToString(), CreatedAt = new DateTimeOffset(2026, 11, 4, 12, 34, 56, TimeSpan.FromHours(8)) };
        var document = Document(fixture.Scope, operation);
        var reference = await fixture.Store.WriteAsync(document);
        var path = fixture.PathFor(document.Id);
        var encrypted = await File.ReadAllBytesAsync(path);
        Check(!Encoding.UTF8.GetString(encrypted).Contains("原稿"), "plaintext leaked into file");
        Check(encrypted.AsSpan(0, 9).SequenceEqual("HDYHIST1\n"u8), "distinct archive header");
        Check(reference.Sha256 == Convert.ToHexStringLower(SHA256.HashData(encrypted)) && reference.Bytes == encrypted.Length,
            "digest must cover complete encrypted file");
        Check(reference.Count == 1 && reference.Id == document.Id && reference.FileName == document.Id + ".bin" &&
            reference.CreatedAt.EqualsExact(document.CreatedAt), "reference metadata");
        var loaded = await fixture.Store.ReadAsync(reference);
        Check(Json(loaded) == Json(document), "immutable history fields changed");
        Check(loaded.Operations[0].BodyJson == operation.BodyJson && loaded.Operations[0].Error == operation.Error &&
            loaded.Operations[0].CreatedAt.EqualsExact(operation.CreatedAt), "raw evidence or offset rewritten");
    }),
    ("Unindexed files remain readable without creating workspace or indexes", async () =>
    {
        using var fixture = new Fixture();
        var document = Document(fixture.Scope);
        var reference = await fixture.Store.WriteAsync(document);
        var before = await File.ReadAllBytesAsync(fixture.PathFor(document.Id));
        var unindexed = await fixture.Store.ReadUnindexedAsync(document.Id);
        var files = await fixture.Store.ListAsync();
        Check(Json(unindexed.Reference) == Json(reference) && Json(unindexed.Document) == Json(document), "orphan read diverged");
        Check(files.Count == 1 && files[0].Id == document.Id && files[0].Error == null, "orphan not discovered");
        Check((await File.ReadAllBytesAsync(fixture.PathFor(document.Id))).SequenceEqual(before) &&
            !File.Exists(Path.Combine(fixture.Directory, "workspace.bin")) &&
            Directory.GetFileSystemEntries(fixture.Directory).Length == 1, "readonly discovery changed data");
    }),
    ("Empty discovery creates no directories", async () =>
    {
        using var fixture = new Fixture();
        Check((await fixture.Store.ListAsync()).Count == 0 && !Directory.Exists(fixture.Directory), "list created storage");
    }),
    ("Duplicate immutable file ID never replaces first evidence", async () =>
    {
        using var fixture = new Fixture();
        var document = Document(fixture.Scope);
        var reference = await fixture.Store.WriteAsync(document);
        var original = await File.ReadAllBytesAsync(fixture.PathFor(document.Id));
        await Throws<IOException>(() => fixture.Store.WriteAsync(document with { Operations = [Operation()] }));
        Check((await File.ReadAllBytesAsync(fixture.PathFor(document.Id))).SequenceEqual(original), "duplicate overwrote history");
        Check(Json(await fixture.Store.ReadAsync(reference)) == Json(document), "first history changed");
        Check(!Directory.EnumerateFiles(fixture.History).Any(path => path.EndsWith(".tmp")), "temporary file left");
    }),
    ("Two stores racing one immutable ID publish exactly one complete file", async () =>
    {
        using var fixture = new Fixture();
        var other = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope, fixture.Protector);
        var document = Document(fixture.Scope);
        var tasks = new[] { fixture.Store.WriteAsync(document), other.WriteAsync(document) };
        var success = 0;
        foreach (var task in tasks) try { _ = await task; success++; } catch (IOException) { }
        Check(success == 1 && Json((await fixture.Store.ReadUnindexedAsync(document.Id)).Document) == Json(document), "non-atomic publication");
        Check(Directory.EnumerateFiles(fixture.History).Count() == 1, "race leaked temporary file");
    }),
    ("Publication failure cleans only its temporary file and retains competing evidence", async () =>
    {
        using var fixture = new Fixture(); var document = Document(fixture.Scope);
        var store = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope,
            new CallbackProtector(fixture.Protector, () =>
            {
                Directory.CreateDirectory(fixture.History);
                File.WriteAllText(fixture.PathFor(document.Id), "synthetic competing retained evidence");
            }));
        await Throws<IOException>(() => store.WriteAsync(document));
        Check(await File.ReadAllTextAsync(fixture.PathFor(document.Id)) == "synthetic competing retained evidence" &&
            Directory.EnumerateFiles(fixture.History).Count() == 1, "failed move deleted evidence or retained temp");
    }),
    ("Canceled write/read/list do not publish or modify existing files", async () =>
    {
        using var fixture = new Fixture();
        var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        await Throws<OperationCanceledException>(() => fixture.Store.WriteAsync(Document(fixture.Scope), cancellation.Token));
        await Throws<OperationCanceledException>(() => fixture.Store.ReadAsync(reference, cancellation.Token));
        await Throws<OperationCanceledException>(() => fixture.Store.ReadUnindexedAsync(reference.Id, cancellation.Token));
        await Throws<OperationCanceledException>(() => fixture.Store.ListAsync(cancellation.Token));
        Check(Directory.EnumerateFiles(fixture.History).Count() == 1, "cancellation changed existing history");
    }),
    ("Cancellation immediately after protection publishes nothing", async () =>
    {
        using var fixture = new Fixture();
        using var cancellation = new CancellationTokenSource();
        var store = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope,
            new CallbackProtector(fixture.Protector, cancellation.Cancel));
        await Throws<OperationCanceledException>(() => store.WriteAsync(Document(fixture.Scope), cancellation.Token));
        Check(!Directory.Exists(fixture.History), "canceled protection created/published file");
    }),
    ("Protect failure leaves no history or temp file", async () =>
    {
        using var fixture = new Fixture();
        var store = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope, new FailingProtector());
        await Throws<CryptographicException>(() => store.WriteAsync(Document(fixture.Scope)));
        Check(!Directory.Exists(fixture.History), "protect failure changed storage");
    }),
    ("Original caller containers are captured before asynchronous write", async () =>
    {
        using var fixture = new Fixture();
        var dependency = Guid.NewGuid().ToString(); var dependencies = new List<string> { dependency };
        var rows = new List<PendingOperation> { Operation() with { DependencyIds = dependencies } };
        var document = Document(fixture.Scope) with { Operations = rows };
        var pending = fixture.Store.WriteAsync(document);
        dependencies.Clear(); rows.Clear();
        var loaded = await fixture.Store.ReadAsync(await pending);
        Check(loaded.Operations.Count == 1 && loaded.Operations[0].DependencyIds.Single() == dependency, "mutable input aliased");
    }),
    ("Ciphertext corruption is rejected with source retained", async () =>
    {
        using var fixture = new Fixture(); var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        var path = fixture.PathFor(reference.Id); var bytes = await File.ReadAllBytesAsync(path); bytes[^1] ^= 0x7F;
        await File.WriteAllBytesAsync(path, bytes);
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference));
        await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(reference.Id));
        Check((await File.ReadAllBytesAsync(path)).SequenceEqual(bytes), "corrupt evidence deleted/rewritten");
    }),
    ("Wrong protector cannot read and never rewrites ciphertext", async () =>
    {
        using var fixture = new Fixture(); var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        var other = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope, new AesProtector());
        var original = await File.ReadAllBytesAsync(fixture.PathFor(reference.Id));
        await Throws<InvalidDataException>(() => other.ReadAsync(reference));
        Check((await File.ReadAllBytesAsync(fixture.PathFor(reference.Id))).SequenceEqual(original), "wrong protector rewrote file");
    }),
    ("Reference digest, byte length, count and creation time are all checked", async () =>
    {
        using var fixture = new Fixture(); var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference with { Sha256 = new string('0', 64) }));
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference with { Bytes = reference.Bytes + 1 }));
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference with { Count = 2 }));
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference with { CreatedAt = reference.CreatedAt.AddTicks(1) }));
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference with { CreatedAt = reference.CreatedAt.ToOffset(TimeSpan.FromHours(8)) }));
        Check(Json(await fixture.Store.ReadAsync(reference with { Sha256 = reference.Sha256.ToUpperInvariant() })) ==
            Json((await fixture.Store.ReadUnindexedAsync(reference.Id)).Document), "hex case should not invalidate hash");
    }),
    ("Scope directory and document scope are enforced independently", async () =>
    {
        using var fixture = new Fixture(); var foreignScope = new string('b', 64);
        ThrowsSync<ArgumentException>(() => new EncryptedHistoryArchiveStore(fixture.Directory, foreignScope, fixture.Protector));
        ThrowsSync<ArgumentException>(() => new EncryptedHistoryArchiveStore(fixture.Directory, "not-a-partition", fixture.Protector));
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(foreignScope)));
        var foreign = Document(foreignScope); await fixture.RawWrite(foreign);
        await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(foreign.Id));
        Check(File.Exists(fixture.PathFor(foreign.Id)), "foreign evidence deleted");
    }),
    ("An encrypted archive copied from another account is not accepted", async () =>
    {
        using var fixture = new Fixture(); using var other = new Fixture(new string('b', 64), fixture.Protector);
        var reference = await other.Store.WriteAsync(Document(other.Scope));
        Directory.CreateDirectory(fixture.History);
        File.Copy(other.PathFor(reference.Id), fixture.PathFor(reference.Id));
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference));
        Check((await fixture.Store.ListAsync()).Single().Error != null, "foreign file reported valid");
    }),
    ("Paths and noncanonical archive UUIDs are rejected", async () =>
    {
        using var fixture = new Fixture();
        foreach (var id in new[] { "../workspace", Guid.Empty.ToString(), Guid.NewGuid().ToString("N"), "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF", "/tmp/history", "a\\b" })
        {
            await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(id));
            await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope) with { Id = id }));
        }
        var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        foreach (var name in new[] { "../workspace.bin", "/tmp/evil.bin", reference.Id + ".bin.", "other.bin" })
            await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference with { FileName = name }));
    }),
    ("Unknown schema and file header are rejected and retained", async () =>
    {
        using var fixture = new Fixture();
        var document = Document(fixture.Scope) with { Schema = 2 };
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(document));
        await fixture.RawWrite(document);
        await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(document.Id));
        var known = Document(fixture.Scope); await fixture.RawWrite(known, "HDYWS1\n"u8.ToArray());
        await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(known.Id));
        Check(Directory.EnumerateFiles(fixture.History).Count() == 2, "unsupported files not retained");
    }),
    ("Only never-sent superseded rows may be archived on either read or write", async () =>
    {
        using var fixture = new Fixture();
        var unsafeRows = new[]
        {
            Operation() with { Status = PendingStatus.Queued }, Operation() with { Status = PendingStatus.InFlight },
            Operation() with { Status = PendingStatus.Unknown }, Operation() with { Status = PendingStatus.Conflict },
            Operation() with { Status = PendingStatus.Blocked }, Operation() with { Status = PendingStatus.Confirmed },
            Operation() with { SendAttempts = 1 }, Operation() with { SendAttempts = -1 },
            Operation() with { PreparedBodyJson = "{}" }, Operation() with { RemoteJson = "{}" },
            Operation() with { RecoveredAtRevision = 1 }, Operation() with { ConfirmedRevision = 1 }
        };
        foreach (var row in unsafeRows)
        {
            var document = Document(fixture.Scope, row);
            await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(document));
            await fixture.RawWrite(document);
            await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(document.Id));
        }
        Check(Directory.EnumerateFiles(fixture.History).Count() == unsafeRows.Length, "unsafe file deleted or write admitted");
    }),
    ("Duplicate operations and invalid dependency metadata are rejected", async () =>
    {
        using var fixture = new Fixture(); var row = Operation(); var dep = Guid.NewGuid().ToString();
        foreach (var document in new[]
        {
            Document(fixture.Scope) with { Operations = [row, row] },
            Document(fixture.Scope) with { Operations = [row, row with { Id = row.Id.ToUpperInvariant() }] },
            Document(fixture.Scope, row with { Id = "bad" }),
            Document(fixture.Scope, row with { DependencyIds = [dep, dep] }),
            Document(fixture.Scope, row with { DependencyIds = ["../bad"] }),
            Document(fixture.Scope, row with { DependencyIds = [row.Id] }),
            Document(fixture.Scope, row with { VersionFromDependencyId = dep }),
            Document(fixture.Scope, row with { SupersededById = row.Id }),
            Document(fixture.Scope, row with { SupersededById = "invalid" }),
            Document(fixture.Scope, row with { BodyJson = "{" }),
            Document(fixture.Scope) with { SourceRevision = -1 },
            Document(fixture.Scope) with { Operations = [] }
        })
        {
            await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(document));
            await fixture.RawWrite(document);
            await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(document.Id));
        }
    }),
    ("Invalid UTF16 is refused instead of rewriting original evidence", async () =>
    {
        using var fixture = new Fixture();
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope,
            Operation() with { BodyJson = "{\"text\":\"\ud800\"}" })));
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope,
            Operation() with { Error = "\ud800" })));
        Check(!Directory.Exists(fixture.History), "invalid Unicode published");
    }),
    ("External dependency IDs are preserved without promoting archive to a queue", async () =>
    {
        using var fixture = new Fixture(); var dep = Guid.NewGuid().ToString();
        var document = Document(fixture.Scope, Operation() with { DependencyIds = [dep], VersionFromDependencyId = dep,
            SupersededById = Guid.NewGuid().ToString() });
        var reference = await fixture.Store.WriteAsync(document);
        Check(Json(await fixture.Store.ReadAsync(reference)) == Json(document), "external references lost");
        Check(!File.Exists(Path.Combine(fixture.Directory, "workspace.bin")), "archive imported into queue");
    }),
    ("Oversize plaintext and ciphertext fail without publishing or deleting evidence", async () =>
    {
        using var fixture = new Fixture();
        var huge = Document(fixture.Scope, Operation() with { BodyJson = "{\"text\":\"" + new string('x', EncryptedHistoryArchiveStore.MaximumFileBytes) + "\"}" });
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(huge));
        Check(!Directory.Exists(fixture.History), "oversize plaintext published");
        var store = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope, new ExpandingProtector());
        await Throws<InvalidDataException>(() => store.WriteAsync(Document(fixture.Scope)));
        Check(!Directory.Exists(fixture.History), "oversize cipher published");
        Directory.CreateDirectory(fixture.History); var id = Guid.NewGuid().ToString();
        using (var file = File.Create(fixture.PathFor(id))) file.SetLength(EncryptedHistoryArchiveStore.MaximumFileBytes + 1L);
        await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(id));
        Check(new FileInfo(fixture.PathFor(id)).Length == EncryptedHistoryArchiveStore.MaximumFileBytes + 1L, "oversize evidence lost");
    }),
    ("Decrypted payload size is bounded independently of ciphertext size", async () =>
    {
        using var fixture = new Fixture(); var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        var store = new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope, new ExpandingProtector());
        await Throws<InvalidDataException>(() => store.ReadAsync(reference));
    }),
    ("Combined fields and JSON escaping cannot expand beyond the plaintext cap", async () =>
    {
        using var fixture = new Fixture();
        var rows = Enumerable.Range(0, 10).Select(_ => Operation() with { BodyJson = "{\"text\":\"" + new string('x', 1024 * 1024) + "\"}" }).ToArray();
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope) with { Operations = rows }));
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope,
            Operation() with { Error = new string('\0', 2 * 1024 * 1024) })));
        Check(!Directory.Exists(fixture.History), "escaped or combined oversize history published");
    }),
    ("Archive identity inside encrypted document must match filename", async () =>
    {
        using var fixture = new Fixture(); var document = Document(fixture.Scope);
        await fixture.RawWrite(document); var movedId = Guid.NewGuid().ToString();
        File.Move(fixture.PathFor(document.Id), fixture.PathFor(movedId));
        await Throws<InvalidDataException>(() => fixture.Store.ReadUnindexedAsync(movedId));
        Check(File.Exists(fixture.PathFor(movedId)), "renamed evidence lost");
    }),
    ("Malformed encrypted JSON is reported without affecting independent good archive", async () =>
    {
        using var fixture = new Fixture(); var reference = await fixture.Store.WriteAsync(Document(fixture.Scope));
        var malformed = Guid.NewGuid().ToString(); await fixture.RawWriteBytes(malformed, "{"u8.ToArray());
        var files = await fixture.Store.ListAsync();
        Check(files.Count == 2 && files.Single(file => file.Id == reference.Id).Error == null &&
            files.Single(file => file.Id == malformed).Error != null, "bad file suppressed good archive");
        Check(File.Exists(fixture.PathFor(malformed)), "malformed evidence deleted");
    }),
    ("Unknown files and directories are retained and reported separately", async () =>
    {
        using var fixture = new Fixture(); Directory.CreateDirectory(fixture.History);
        var unknown = Path.Combine(fixture.History, "unknown.txt"); await File.WriteAllTextAsync(unknown, "synthetic evidence");
        var temporary = Path.Combine(fixture.History, Guid.NewGuid().ToString() + ".partial.tmp"); await File.WriteAllTextAsync(temporary, "partial");
        Directory.CreateDirectory(Path.Combine(fixture.History, "unexpected"));
        var files = await fixture.Store.ListAsync();
        Check(files.Count == 3 && files.All(file => file.Error != null) && File.ReadAllText(unknown) == "synthetic evidence" &&
            File.Exists(temporary), "unknown items removed or misreported");
    }),
    ("A file occupying the history directory is reported and preserved", async () =>
    {
        using var fixture = new Fixture(); Directory.CreateDirectory(fixture.Directory);
        await File.WriteAllTextAsync(fixture.History, "synthetic retained evidence");
        await Throws<InvalidDataException>(() => fixture.Store.ListAsync());
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope)));
        Check(await File.ReadAllTextAsync(fixture.History) == "synthetic retained evidence", "unexpected history path changed");
    }),
    ("Discovery file budget explicitly reports an incomplete scan and retains all files", async () =>
    {
        using var fixture = new Fixture(); Directory.CreateDirectory(fixture.History);
        for (var index = 0; index <= EncryptedHistoryArchiveStore.MaximumDiscoveryFiles; index++)
            await File.WriteAllTextAsync(Path.Combine(fixture.History, "synthetic-" + index + ".unknown"), "retained");
        var files = await fixture.Store.ListAsync();
        Check(files.Count == EncryptedHistoryArchiveStore.MaximumDiscoveryFiles + 1 &&
            files.Any(file => file.Error?.Contains("扫描已达到 1000 项上限", StringComparison.Ordinal) == true) &&
            Directory.EnumerateFiles(fixture.History).Count() == EncryptedHistoryArchiveStore.MaximumDiscoveryFiles + 1,
            "file budget silently complete or deleted files");
    }),
    ("Discovery byte budget explicitly reports unread files and retains all files", async () =>
    {
        using var fixture = new Fixture(); Directory.CreateDirectory(fixture.History);
        for (var index = 0; index < 9; index++)
        {
            using var file = File.Create(fixture.PathFor(Guid.NewGuid().ToString()));
            file.SetLength(EncryptedHistoryArchiveStore.MaximumFileBytes);
        }
        var files = await fixture.Store.ListAsync();
        Check(files.Count == 9 && files.Any(file => file.Error?.Contains("扫描已达到 64 MiB 读取上限", StringComparison.Ordinal) == true) &&
            Directory.EnumerateFiles(fixture.History).Count() == 9, "byte budget silently complete or deleted files");
    }),
    ("A history directory link cannot redirect reads or writes", async () =>
    {
        using var fixture = new Fixture(); using var target = new Fixture();
        Directory.CreateDirectory(fixture.Directory); Directory.CreateDirectory(target.History);
        CreateDirectoryLink(fixture.History, target.History);
        await Throws<InvalidDataException>(() => fixture.Store.WriteAsync(Document(fixture.Scope)));
        await Throws<InvalidDataException>(() => fixture.Store.ListAsync());
        Check(Directory.GetFileSystemEntries(target.History).Length == 0, "write followed directory link");
    }),
    ("A scope directory link is refused before use", () =>
    {
        using var fixture = new Fixture(); using var target = new Fixture();
        Directory.CreateDirectory(Path.GetDirectoryName(fixture.Directory)!); Directory.CreateDirectory(target.Directory);
        CreateDirectoryLink(fixture.Directory, target.Directory);
        ThrowsSync<InvalidDataException>(() => new EncryptedHistoryArchiveStore(fixture.Directory, fixture.Scope, fixture.Protector));
        return Task.CompletedTask;
    }),
    ("A file link is reported but never followed", async () =>
    {
        using var fixture = new Fixture(); using var target = new Fixture(fixture.Scope, fixture.Protector);
        var reference = await target.Store.WriteAsync(Document(target.Scope));
        Directory.CreateDirectory(fixture.History);
        try { File.CreateSymbolicLink(fixture.PathFor(reference.Id), target.PathFor(reference.Id)); }
        catch (Exception error) when (LinkPermissionDenied(error))
        { throw new SkippedCheckException("Windows runner does not grant symbolic-link creation; Linux runs this check."); }
        await Throws<InvalidDataException>(() => fixture.Store.ReadAsync(reference));
        Check((await fixture.Store.ListAsync()).Single().Error != null && Json(await target.Store.ReadAsync(reference)) ==
            Json((await target.Store.ReadUnindexedAsync(reference.Id)).Document), "link followed or target changed");
    })
};

var failed = 0; var skipped = 0;
foreach (var (name, run) in tests)
{
    try { await run(); Console.WriteLine("PASS " + name); }
    catch (SkippedCheckException error) { skipped++; Console.WriteLine("SKIP " + name + ": " + error.Message); }
    catch (Exception error) { failed++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
}
Console.WriteLine($"{tests.Length - failed - skipped}/{tests.Length - skipped} encrypted archive checks passed; {skipped} skipped");
return failed == 0 ? 0 : 1;

static PendingOperation Operation() => new() { ResourceKey = "/api/v1/note-entries/synthetic", Path = "/api/v1/note-entries/synthetic",
    Status = PendingStatus.Superseded, BodyJson = "{ \"text\" : \"只用于隔离测试\", \"version\":1 }", Error = "用户替代了未发送操作。" };
static HistoryArchiveDocument Document(string scope, PendingOperation? operation = null) => new()
{ Id = Guid.NewGuid().ToString(), ScopeId = scope, CreatedAt = DateTimeOffset.UtcNow, SourceRevision = 7, Operations = [operation ?? Operation()] };
static string Json<T>(T value) => JsonSerializer.Serialize(value);
static void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
static async Task Throws<T>(Func<Task> action) where T : Exception
{
    try { await action(); } catch (T) { return; }
    throw new InvalidOperationException("Expected " + typeof(T).Name);
}
static void ThrowsSync<T>(Action action) where T : Exception
{
    try { action(); } catch (T) { return; }
    throw new InvalidOperationException("Expected " + typeof(T).Name);
}
static void CreateDirectoryLink(string path, string target)
{
    try { Directory.CreateSymbolicLink(path, target); }
    catch (Exception error) when (LinkPermissionDenied(error))
    { throw new SkippedCheckException("Windows runner does not grant symbolic-link creation; Linux runs this check."); }
}
static bool LinkPermissionDenied(Exception error) => OperatingSystem.IsWindows() &&
    (error is UnauthorizedAccessException || error is IOException && (error.HResult & 0xFFFF) == 1314);

sealed class SkippedCheckException(string message) : Exception(message);

sealed class Fixture : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "haoduoyu-synthetic-archive-" + Guid.NewGuid().ToString("N"));
    private static readonly JsonSerializerOptions options = new() { Converters = { new JsonStringEnumConverter<PendingStatus>() } };
    public string Scope { get; }
    public string Directory => Path.Combine(root, Scope);
    public string History => Path.Combine(Directory, "history");
    public AesProtector Protector { get; }
    public EncryptedHistoryArchiveStore Store { get; }
    public Fixture(string? scope = null, AesProtector? protector = null)
    {
        Scope = scope ?? new string('a', 64); Protector = protector ?? new();
        Store = new(Directory, Scope, Protector);
    }
    public string PathFor(string id) => Path.Combine(History, id + ".bin");
    public Task RawWrite(HistoryArchiveDocument document, byte[]? header = null) =>
        RawWriteBytes(document.Id, JsonSerializer.SerializeToUtf8Bytes(document, options), header);
    public async Task RawWriteBytes(string id, byte[] plaintext, byte[]? header = null)
    {
        System.IO.Directory.CreateDirectory(History);
        var bytes = (header ?? "HDYHIST1\n"u8.ToArray()).Concat(Protector.Protect(plaintext)).ToArray();
        await File.WriteAllBytesAsync(PathFor(id), bytes);
    }
    public void Dispose() { if (System.IO.Directory.Exists(root)) System.IO.Directory.Delete(root, recursive: true); }
}

sealed class AesProtector : IStateProtector
{
    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    public byte[] Protect(byte[] plaintext)
    {
        var output = new byte[12 + 16 + plaintext.Length]; RandomNumberGenerator.Fill(output.AsSpan(0, 12));
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(output.AsSpan(0, 12), plaintext, output.AsSpan(28), output.AsSpan(12, 16)); return output;
    }
    public byte[] Unprotect(byte[] ciphertext)
    {
        if (ciphertext.Length < 28) throw new CryptographicException("Synthetic truncated ciphertext");
        var result = new byte[ciphertext.Length - 28]; using var aes = new AesGcm(key, 16);
        aes.Decrypt(ciphertext.AsSpan(0, 12), ciphertext.AsSpan(28), ciphertext.AsSpan(12, 16), result); return result;
    }
}
sealed class CallbackProtector(IStateProtector inner, Action callback) : IStateProtector
{
    public byte[] Protect(byte[] plaintext) { var result = inner.Protect(plaintext); callback(); return result; }
    public byte[] Unprotect(byte[] ciphertext) => inner.Unprotect(ciphertext);
}
sealed class FailingProtector : IStateProtector
{
    public byte[] Protect(byte[] plaintext) => throw new CryptographicException("Synthetic protection failure");
    public byte[] Unprotect(byte[] ciphertext) => throw new CryptographicException("Synthetic unprotection failure");
}
sealed class ExpandingProtector : IStateProtector
{
    public byte[] Protect(byte[] plaintext) => new byte[EncryptedHistoryArchiveStore.MaximumFileBytes + 1];
    public byte[] Unprotect(byte[] ciphertext) => new byte[EncryptedHistoryArchiveStore.MaximumFileBytes + 1];
}
