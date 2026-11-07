using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Haoduoyu.Core;

var tests = new (string Name, Func<Task> Run)[]
{
    ("Persist queued intent before transport, confirm only after response", async () =>
    {
        var store = new MemoryStore();
        var api = new FakeApi((_, _, _, _) =>
        {
            Check(store.State!.Outbox.Single().Status == PendingStatus.InFlight, "request sent before durable InFlight");
            return Task.FromResult(new ApiResult(200, "{\"data\":{\"version\":1}}"));
        });
        var engine = await Engine(store, api);
        var op = Operation();
        await engine.QueueAsync(op);
        Check(store.State!.Outbox.Single().Status == PendingStatus.Queued, "queue not durable");
        var report = await engine.SyncAsync();
        Check(report.Confirmed == 1 && engine.Snapshot.Outbox.Single().BodyJson == op.BodyJson, "confirmation or immutable body lost");
    }),
    ("Disk failure prevents enqueue and network send", async () =>
    {
        var store = new MemoryStore(); var api = new FakeApi(); var engine = await Engine(store, api);
        store.FailNextSave = true;
        await Throws<IOException>(() => engine.QueueAsync(Operation()));
        Check(engine.Snapshot.Outbox.Count == 0, "failed queue changed memory");
        await engine.QueueAsync(Operation());
        store.FailNextSave = true;
        await Throws<IOException>(() => engine.SyncAsync());
        Check(api.Calls == 0 && engine.Snapshot.Outbox.Single().Status == PendingStatus.Queued, "failed InFlight commit sent network");
    }),
    ("Restart transforms InFlight to Unknown and does not replay", async () =>
    {
        var store = new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = [Operation() with { Status = PendingStatus.InFlight }] } };
        var api = new FakeApi(); var engine = await Engine(store, api);
        await engine.SyncAsync();
        Check(engine.Snapshot.Outbox.Single().Status == PendingStatus.Unknown && api.Calls == 0, "unknown request replayed");
    }),
    ("Timeout preserves original intent and later drafts", async () =>
    {
        var store = new MemoryStore();
        var api = new FakeApi((_, _, _, _) => throw new TaskCanceledException());
        var engine = await Engine(store, api); var op = Operation();
        await engine.SaveDraftAsync(new LocalDraft { Key = op.ResourceKey, Text = "关机后仍保留的稿件", BaseVersion = 2 });
        await engine.QueueAsync(op); await engine.SyncAsync(); await engine.SyncAsync();
        Check(api.Calls == 1 && engine.Snapshot.Outbox.Single().Status == PendingStatus.Unknown, "automatic unknown replay");
        Check(engine.Snapshot.Drafts[op.ResourceKey].Text.Contains("关机"), "draft lost");
        await engine.RetryUnchangedAsync(op.Id, "{\"data\":{\"version\":2}}");
        Check(engine.Snapshot.Outbox.Single().BodyJson == op.BodyJson && engine.Snapshot.Outbox.Single().Id == op.Id, "retry identity changed");
    }),
    ("409 keeps both versions and explicit replacement retains history", async () =>
    {
        var store = new MemoryStore(); var api = new FakeApi((_, _, _, _) => Task.FromResult(new ApiResult(409, "{\"data\":{\"text\":\"远端文字\",\"version\":3}}")));
        var engine = await Engine(store, api); var op = Operation();
        await engine.SaveDraftAsync(new LocalDraft { Key = op.ResourceKey, Text = "本地文字", BaseVersion = 2 });
        await engine.QueueAsync(op); await engine.SyncAsync();
        var pending = engine.Snapshot.Outbox.Single();
        Check(pending.Status == PendingStatus.Conflict && pending.RemoteJson!.Contains("远端文字"), "remote conflict lost");
        Check(engine.Snapshot.Drafts[op.ResourceKey].Text == "本地文字" && pending.BodyJson == op.BodyJson, "local conflict lost");
        await Throws<InvalidOperationException>(() => engine.RetryUnchangedAsync(op.Id, pending.RemoteJson!));
        var replacement = Operation() with { ResourceKey = op.ResourceKey, BodyJson = "{\"text\":\"本地文字\",\"version\":3}" };
        await engine.ResolveAsync(op.Id, pending.RemoteJson!, replacement);
        Check(engine.Snapshot.Outbox[0].Status == PendingStatus.Superseded && engine.Snapshot.Outbox[1].Status == PendingStatus.Queued, "history discarded");
    }),
    ("Transport preflight stays Blocked; all unclassified failures stay Unknown", async () =>
    {
        foreach (var preflight in new[] { true, false })
        {
            var api = new FakeApi((_, _, _, _) => preflight
                ? throw new RequestNotSentException("身份分区不同，未发送请求。")
                : throw new InvalidOperationException("synthetic transport parse failure"));
            var engine = await Engine(new MemoryStore(), api);
            await engine.QueueAsync(Operation());
            await engine.QueueAsync(Operation() with { ResourceKey = "later" });
            await engine.SyncAsync();
            Check(api.Calls == 1 && engine.Snapshot.Outbox[1].Status == PendingStatus.Queued, "batch continued after guard/transport failure");
            Check(engine.Snapshot.Outbox[0].Status == (preflight ? PendingStatus.Blocked : PendingStatus.Unknown), "failure wrongly classified");
        }
    }),
    ("Exact reconciled confirmation preserves original request and current drafts", async () =>
    {
        var api = new FakeApi((_, _, _, _) => throw new HttpRequestException("synthetic missing response"));
        var engine = await Engine(new MemoryStore(), api); var op = Operation();
        await engine.SaveDraftAsync(new LocalDraft { Key = op.ResourceKey, Text = "请求发出后继续写的稿件" });
        await engine.QueueAsync(op); await engine.SyncAsync();
        await engine.ConfirmReconciledAsync(op.Id, "{\"data\":{\"confirmed\":true}}");
        var saved = engine.Snapshot.Outbox.Single();
        Check(saved.Status == PendingStatus.Confirmed && saved.Id == op.Id && saved.BodyJson == op.BodyJson, "reconciled identity lost");
        Check(engine.Snapshot.Drafts[op.ResourceKey].Text.Contains("继续写"), "later draft cleared on confirmation");
        await engine.SyncAsync();
        Check(api.Calls == 1, "confirmed request replayed");
    }),
    ("Scope partition and lifetime process lock isolate identities", async () =>
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector();
            using var first = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "one", protector);
            using var second = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz/", "two", protector);
            Check(first.ScopeId != second.ScopeId && first.FilePath != second.FilePath, "identity not partitioned");
            await first.SaveAsync(new WorkspaceState { ScopeId = first.ScopeId, Cache = { ["one"] = "private" } });
            Check((await second.LoadAsync()).Cache.Count == 0, "cross identity leak");
            await Throws<IOException>(() => Task.Run(() => { using var duplicate = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "one", protector); }));
            await Throws<InvalidDataException>(() => second.SaveAsync(new WorkspaceState { ScopeId = first.ScopeId }));
        });
    }),
    ("Encrypted atomic snapshots retain previous backup", async () =>
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector();
            using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "owner", protector);
            var state = new WorkspaceState { ScopeId = store.ScopeId, Cache = { ["item"] = "秘密中文-ONE" } };
            await store.SaveAsync(state);
            var first = await File.ReadAllBytesAsync(store.FilePath);
            Check(!Encoding.UTF8.GetString(first).Contains("秘密中文"), "plaintext snapshot");
            state.Cache["item"] = "秘密中文-TWO";
            await store.SaveAsync(state);
            Check((await File.ReadAllBytesAsync(store.BackupPath)).SequenceEqual(first), "backup differs from last committed snapshot");
            Check((await store.LoadAsync()).Cache["item"] == "秘密中文-TWO", "current snapshot incorrect");
            Check(Directory.GetFiles(Path.GetDirectoryName(store.FilePath)!, "*.tmp").Length == 0, "temp file leaked");
        });
    }),
    ("Corruption stops writes; explicit backup recovery preserves damaged bytes", async () =>
    {
        await WithDirectory(async root =>
        {
            using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "owner", new TestProtector());
            await store.SaveAsync(new WorkspaceState { ScopeId = store.ScopeId, Cache = { ["v"] = "one" } });
            await store.SaveAsync(new WorkspaceState { ScopeId = store.ScopeId, Cache = { ["v"] = "two" } });
            await File.WriteAllTextAsync(store.FilePath, "damaged-original");
            await Throws<InvalidDataException>(() => store.LoadAsync());
            await Throws<InvalidDataException>(() => store.SaveAsync(new WorkspaceState { ScopeId = store.ScopeId }));
            Check(await File.ReadAllTextAsync(store.FilePath) == "damaged-original", "corruption silently overwritten");
            await store.RestoreBackupAsync();
            Check((await store.LoadAsync()).Cache["v"] == "one", "explicit restore failed");
            var damaged = Directory.GetFiles(Path.GetDirectoryName(store.FilePath)!, "*.damaged-*");
            Check(damaged.Length == 1 && await File.ReadAllTextAsync(damaged[0]) == "damaged-original", "damaged evidence deleted");
        });
    }),
    ("Unknown schema rejects reads and writes without clearing data", async () =>
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector();
            using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "owner", protector);
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { Schema = 3, ScopeId = store.ScopeId }));
            var file = "HDYWS1\n"u8.ToArray().Concat(protector.Protect(bytes)).ToArray();
            await File.WriteAllBytesAsync(store.FilePath, file);
            await Throws<InvalidDataException>(() => store.LoadAsync());
            await Throws<InvalidDataException>(() => store.SaveAsync(new WorkspaceState { ScopeId = store.ScopeId }));
            Check((await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(file), "unknown schema destroyed");
        });
    }),
    ("Concurrent same-resource queue admits one; snapshots cannot mutate state", async () =>
    {
        var store = new MemoryStore(); var engine = await Engine(store, new FakeApi());
        var accepted = 0;
        await Task.WhenAll(Enumerable.Range(0, 20).Select(async _ =>
        {
            try { await engine.QueueAsync(Operation()); Interlocked.Increment(ref accepted); }
            catch (InvalidOperationException) { }
        }));
        Check(accepted == 1 && engine.Snapshot.Outbox.Count == 1, "concurrent duplicate intents");
        var snapshot = engine.Snapshot; snapshot.Outbox.Clear(); snapshot.Cache["injected"] = "value";
        Check(engine.Snapshot.Outbox.Count == 1 && engine.Snapshot.Cache.Count == 0, "snapshot mutated state");
        await engine.QueueAsync(engine.Snapshot.Outbox.Single());
        Check(engine.Snapshot.Outbox.Count == 1, "same immutable request not idempotent");
    }),
    ("Draft saves remain available while network waits; concurrent sync never duplicates", async () =>
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var api = new FakeApi(async (_, _, _, _) => { started.SetResult(); await release.Task; return new ApiResult(200, "{}"); });
        var engine = await Engine(new MemoryStore(), api);
        await engine.QueueAsync(Operation());
        var syncing = engine.SyncAsync(); await started.Task;
        await engine.SaveDraftAsync(new LocalDraft { Key = "new", Text = "继续写" }).WaitAsync(TimeSpan.FromSeconds(3));
        var second = engine.SyncAsync(); release.SetResult(); await Task.WhenAll(syncing, second);
        Check(api.Calls == 1 && engine.Snapshot.Drafts["new"].Text == "继续写", "network blocked drafts or duplicated request");
    }),
    ("401 blocks and 503 stays unknown without replaying later writes", async () =>
    {
        foreach (var status in new[] { 401, 503 })
        {
            var api = new FakeApi((_, _, _, _) => Task.FromResult(new ApiResult(status, "{}", "synthetic-request")));
            var engine = await Engine(new MemoryStore(), api);
            await engine.QueueAsync(Operation()); await engine.QueueAsync(Operation() with { ResourceKey = "other" });
            await engine.SyncAsync();
            Check(api.Calls == 1 && engine.Snapshot.Outbox[1].Status == PendingStatus.Queued, "unsafe continuation after auth/uncertain failure");
            Check(engine.Snapshot.Outbox[0].Status == (status == 401 ? PendingStatus.Blocked : PendingStatus.Unknown), "wrong failure state");
        }
    })
};

var failed = 0;
foreach (var (name, test) in tests)
{
    try { await test(); Console.WriteLine($"PASS {name}"); }
    catch (Exception error) { failed++; Console.Error.WriteLine($"FAIL {name}: {error}"); }
}
Console.WriteLine($"Core safety checks: {tests.Length - failed}/{tests.Length} passed");
var queueFailures = QueueChecks.Run();
var projectionFailures = ProjectionChecks.Run();
var recoveryFailures = RecoveryChecks.Run();
var archiveFailures = HistoryArchiveChecks.Run();
var templateArchiveSyncFailures = TemplateArchiveSyncChecks.Run();
var todoNoteSyncFailures = TodoNoteSyncChecks.Run();
var beijingDayFailures = BeijingDayChecks.Run();
return failed + queueFailures + projectionFailures + recoveryFailures + archiveFailures + templateArchiveSyncFailures + todoNoteSyncFailures + beijingDayFailures == 0 ? 0 : 1;

static void Check(bool condition, string reason) { if (!condition) throw new Exception(reason); }
static async Task Throws<T>(Func<Task> action) where T : Exception
{
    try { await action(); } catch (T) { return; }
    throw new Exception($"Expected {typeof(T).Name}");
}
static PendingOperation Operation() => new()
{
    ResourceKey = "note:one", Method = "PUT", Path = "/api/v1/note-entries/00000000-0000-4000-8000-000000000001",
    BodyJson = "{\"text\":\"本地文字\",\"version\":2,\"save_id\":\"00000000-0000-4000-8000-000000000002\"}"
};
static async Task<SyncEngine> Engine(IWorkspaceStore store, IRemoteApi api)
{
    var engine = new SyncEngine(store, api); await engine.InitializeAsync(); return engine;
}
static async Task WithDirectory(Func<string, Task> action)
{
    var root = Path.Combine(Path.GetTempPath(), "haoduoyu-core-synthetic-" + Guid.NewGuid().ToString("N"));
    Directory.CreateDirectory(root);
    try { await action(root); } finally { Directory.Delete(root, recursive: true); }
}
sealed class MemoryStore : IWorkspaceStore
{
    public string ScopeId => "test";
    public WorkspaceState? State { get; set; }
    public bool FailNextSave { get; set; }
    public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(Clone(State ?? new WorkspaceState { ScopeId = ScopeId }));
    public Task SaveAsync(WorkspaceState state, CancellationToken cancellationToken = default)
    {
        if (FailNextSave) { FailNextSave = false; throw new IOException("synthetic disk-full"); }
        State = Clone(state); return Task.CompletedTask;
    }
    private static WorkspaceState Clone(WorkspaceState state) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(state))!;
}
sealed class FakeApi(Func<string, string, string?, string, Task<ApiResult>>? handler = null) : IRemoteApi
{
    public int Calls;
    public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref Calls);
        return handler?.Invoke(method, path, bodyJson, operationId) ?? Task.FromResult(new ApiResult(200, "{}"));
    }
}
sealed class TestProtector : IStateProtector
{
    private readonly byte[] key = RandomNumberGenerator.GetBytes(32);
    public byte[] Protect(byte[] plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(12); var tag = new byte[16]; var ciphertext = new byte[plaintext.Length];
        using var aes = new AesGcm(key, 16); aes.Encrypt(nonce, plaintext, ciphertext, tag);
        return nonce.Concat(tag).Concat(ciphertext).ToArray();
    }
    public byte[] Unprotect(byte[] ciphertext)
    {
        var plaintext = new byte[ciphertext.Length - 28];
        using var aes = new AesGcm(key, 16); aes.Decrypt(ciphertext.AsSpan(0, 12), ciphertext.AsSpan(28), ciphertext.AsSpan(12, 16), plaintext);
        return plaintext;
    }
}
