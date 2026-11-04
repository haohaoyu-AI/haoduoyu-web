using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Haoduoyu.Core;

internal static class HistoryArchiveChecks
{
    internal static int Run()
    {
        var tests = new (string, Func<Task>)[]
        {
            ("Archiving a replacement chain preserves latest intent, drafts and projection without retaining every alias", ReplacementChain),
            ("Archive eligibility excludes every unsettled, confirmed, attempted, prepared and recovered record", Eligibility),
            ("Retained dependency and alias closure protects original proofs, including after batch selection", ReferenceClosure),
            ("Archive batches honor actual Unicode operation encoding bytes and bounded operation counts", ExactBudgets),
            ("Stale forged cross-scope and empty archive plans never remove active records", InvalidPlans),
            ("Write readback and state-save failures preserve active originals and leave readable orphan archives", FailedCommit),
            ("Archive commit serializes concurrent draft mutation and exposes no removal before durable state save", ConcurrentCommit),
            ("Archived identifiers cannot be reused through queue replacement or conflict resolution, including GUID case aliases", IdReuse),
            ("Archive schema upgrade prevents silent legacy downgrade and validates every archive index binding", SchemaAndIndex)
        };
        var failed = 0;
        foreach (var (name, run) in tests)
        {
            try { run().GetAwaiter().GetResult(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failed++; Console.Error.WriteLine($"FAIL {name}: {error}"); }
        }
        Console.WriteLine($"History archive policy checks: {tests.Length - failed}/{tests.Length} passed");
        return failed;
    }

    private static async Task ReplacementChain()
    {
        var store = new MemoryStore(); var engine = await Engine(store); var current = New("memo");
        await engine.QueueAsync(current);
        await engine.SaveDraftAsync(new LocalDraft { Key = "memo", Text = "归档前后继续保留的正文", BaseVersion = 0 });
        for (var index = 0; index < 6; index++)
        {
            var replacement = current with { Id = Guid.NewGuid().ToString(), BodyJson = JsonSerializer.Serialize(new { title = "合成改写" + index, version = 0 }),
                CreatedAt = current.CreatedAt.AddDays(-1) }; // Deliberate clock rollback: persisted append order still wins.
            await engine.ReplaceQueuedAsync(current.Id, replacement); current = replacement;
        }
        var before = engine.Snapshot; var projected = WorkspaceProjection.Project("/api/v1/memos", null, before);
        var plan = engine.CreateHistoryArchivePlan();
        Check(plan.CandidateIds.Count == 6 && !plan.CandidateIds.Contains(current.Id) && plan.RetainedReasons["Unresolved"] == 1,
            "global alias-target retention kept an otherwise removable chain or clock order replaced durable latest order");
        var archives = new Archives(); var reference = await engine.ArchiveSupersededHistoryAsync(plan, archives);
        var after = engine.Snapshot; var document = await archives.ReadAsync(reference!);
        Check(reference != null && after.Schema == 2 && after.Outbox.Count == 1 && after.Outbox.Single().Id == current.Id &&
            after.ArchivedOperationIds.Count == 6 && after.HistoryArchives.Single() == reference,
            "successful archive lost the latest operation or its durable archive binding");
        Check(document.SourceRevision == before.LocalRevision && document.ScopeId == before.ScopeId && document.Operations.Count == 6 &&
            document.Operations.Select(Encode).SequenceEqual(before.Outbox.Take(6).Select(Encode)), "archive changed original operation fields or order");
        Check(after.Drafts["memo"] == before.Drafts["memo"] && WorkspaceProjection.Project("/api/v1/memos", null, after) == projected,
            "archiving changed active offline projection or drafts");
        var detached = engine.Snapshot; detached.HistoryArchives.Clear(); detached.ArchivedOperationIds.Clear();
        Check(engine.Snapshot.HistoryArchives.Count == 1 && engine.Snapshot.ArchivedOperationIds.Count == 6, "snapshot containers mutated the archive ledger");
        var restart = await Engine(store);
        Check(restart.Snapshot.Schema == 2 && restart.Snapshot.ArchivedOperationIds.Count == 6, "restart lost schema upgrade or archived IDs");
    }

    private static async Task Eligibility()
    {
        var confirmed = New("confirmed") with { Status = PendingStatus.Confirmed, ConfirmedRevision = 1, RemoteJson = "{\"data\":{\"version\":3}}" };
        var candidates = new List<PendingOperation> { New("plain") with { Status = PendingStatus.Superseded } };
        candidates.AddRange(Enum.GetValues<PendingStatus>().Where(status => status != PendingStatus.Superseded)
            .Select(status => New("status:" + status) with { Status = status }));
        candidates.AddRange(new[]
        {
            New("attempted") with { Status = PendingStatus.Superseded, SendAttempts = 1 },
            New("remote") with { Status = PendingStatus.Superseded, RemoteJson = "" },
            New("recovered") with { Status = PendingStatus.Superseded, RecoveredAtRevision = 1 },
            New("old-confirmation") with { Status = PendingStatus.Superseded, ConfirmedRevision = 1 },
            New("prepared") with { Status = PendingStatus.Superseded, BodyJson = "{\"completed\":true}", PreparedBodyJson = "{\"completed\":true,\"version\":3}",
                DependencyIds = [confirmed.Id], VersionFromDependencyId = confirmed.Id }
        });
        var operations = new List<PendingOperation> { confirmed };
        foreach (var old in candidates) { operations.Add(old); operations.Add(New(old.ResourceKey)); }
        var engine = await Engine(new MemoryStore { State = new WorkspaceState { ScopeId = "test", LocalRevision = 2, Outbox = operations } });
        var plan = engine.CreateHistoryArchivePlan();
        Check(plan.CandidateIds.SequenceEqual(new[] { candidates[0].Id }), "an attempted, recovered, confirmed or unsettled operation was eligible");
        await Throws<ArgumentOutOfRangeException>(() => Task.FromResult(engine.CreateHistoryArchivePlan(1001)));
        await Throws<ArgumentOutOfRangeException>(() => Task.FromResult(engine.CreateHistoryArchivePlan(maxBytes: 4 * 1024 * 1024 + 1)));
    }

    private static async Task ReferenceClosure()
    {
        var last = New("chain"); var middle = New("chain") with { Status = PendingStatus.Superseded, SupersededById = last.Id };
        var first = New("chain") with { Status = PendingStatus.Superseded, SupersededById = middle.Id };
        var dependent = New("dependent") with { DependencyIds = [first.Id], VersionFromDependencyId = first.Id };
        var engine = await Engine(new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = [first, middle, last, dependent] } });
        var plan = engine.CreateHistoryArchivePlan();
        Check(plan.CandidateIds.Count == 0 && plan.RetainedReasons["ReferencedByRetained"] == 2,
            "dependency, real-version source or complete replacement alias closure was removed");

        var early = New("early") with { Status = PendingStatus.Superseded };
        var later = New("later") with { Status = PendingStatus.Superseded, DependencyIds = [early.Id] };
        var independent = await Engine(new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = [early, later, New("early"), New("later")] } });
        Check(independent.CreateHistoryArchivePlan(1).CandidateIds.Count == 0,
            "budget-retained history kept a dependency pointing into the selected archive");
        Check(independent.CreateHistoryArchivePlan(2).CandidateIds.Count == 2,
            "references between two removed records incorrectly kept the entire removable history");
    }

    private static async Task ExactBudgets()
    {
        var old = New("bytes") with { Status = PendingStatus.Superseded, BodyJson = "{\"title\":\"中文\\n\\\"正文\",\"unknown\":{\"escaped\":\"<>&\\\\\"},\"version\":0}" };
        var engine = await Engine(new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = [old, New("bytes")] } });
        var plan = engine.CreateHistoryArchivePlan(); var encoded = JsonSerializer.SerializeToUtf8Bytes(old, Options()).Length;
        Check(plan.EncodedBytes == encoded && plan.EncodedBytes > Encoding.UTF8.GetByteCount(old.BodyJson), "budget omitted operation metadata or used raw character counts");
        Check(engine.CreateHistoryArchivePlan(maxBytes: encoded - 1).CandidateIds.Count == 0 &&
            engine.CreateHistoryArchivePlan(maxBytes: encoded).CandidateIds.Count == 1, "encoded byte boundary is inaccurate");
        var store = new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = Enumerable.Range(0, 1002).Select(index => New("many") with
            { Status = index == 1001 ? PendingStatus.Queued : PendingStatus.Superseded }).ToList() } };
        var many = await Engine(store);
        Check(many.CreateHistoryArchivePlan().CandidateIds.Count == 500 && many.CreateHistoryArchivePlan(1000).CandidateIds.Count == 1000,
            "default or hard operation batch limits were ignored");
    }

    private static async Task InvalidPlans()
    {
        var store = new MemoryStore { State = Pair() }; var engine = await Engine(store); var plan = engine.CreateHistoryArchivePlan(); var archives = new Archives();
        foreach (var forged in new[]
        {
            plan with { ScopeId = "other" }, plan with { BaseRevision = plan.BaseRevision + 1 }, plan with { CandidateIds = [Guid.NewGuid().ToString()] },
            plan with { EncodedBytes = plan.EncodedBytes + 1 }, plan with { RetainedReasons = new Dictionary<string, int>() }
        }) await Throws<InvalidOperationException>(() => engine.ArchiveSupersededHistoryAsync(forged, archives));
        await Throws<InvalidOperationException>(() => engine.ArchiveSupersededHistoryAsync(plan, new Archives { ScopeId = "other" }));
        await engine.SaveDraftAsync(new LocalDraft { Key = "later", Text = "预览之后继续编辑" });
        await Throws<InvalidOperationException>(() => engine.ArchiveSupersededHistoryAsync(plan, archives));
        Check(archives.Writes == 0 && engine.Snapshot.Outbox.Count == 2, "invalid plan touched storage or removed original records");
        var empty = await Engine(new MemoryStore()); var revision = empty.Snapshot.LocalRevision;
        Check(await empty.ArchiveSupersededHistoryAsync(empty.CreateHistoryArchivePlan(), archives) == null && archives.Writes == 0 &&
            empty.Snapshot.LocalRevision == revision && empty.Snapshot.Schema == 1, "an empty plan created an archive or changed schema/revision");
    }

    private static async Task FailedCommit()
    {
        foreach (var stage in new[] { "write", "read", "body", "scope", "reference", "state" })
        {
            var stateStore = new MemoryStore { State = Pair() }; var engine = await Engine(stateStore); var before = StateBytes(engine.Snapshot);
            var archives = new Archives { FailWrite = stage == "write", FailRead = stage == "read" };
            if (stage == "body") archives.Transform = document => document with { Operations = document.Operations.Select(operation => operation with { BodyJson = " " + operation.BodyJson }).ToArray() };
            if (stage == "scope") archives.Transform = document => document with { ScopeId = "other" };
            if (stage == "reference") archives.TransformReference = reference => reference with { Count = reference.Count + 1 };
            if (stage == "state") stateStore.FailNextSave = true;
            await Throws<Exception>(() => engine.ArchiveSupersededHistoryAsync(engine.CreateHistoryArchivePlan(), archives));
            Check(StateBytes(engine.Snapshot) == before && StateBytes(stateStore.State!) == before,
                "archive failure exposed an early removal or modified immutable original data");
            Check(stage == "write" || archives.Documents.Count == 1, "a written orphan archive was automatically deleted after a later failure");
            if (stage == "state")
            {
                var orphan = archives.Documents.Keys.Single();
                var committed = await engine.ArchiveSupersededHistoryAsync(engine.CreateHistoryArchivePlan(), archives);
                Check(archives.Documents.Count == 2 && committed!.Id != orphan && engine.Snapshot.HistoryArchives.Single().Id == committed.Id,
                    "state-save retry deleted its orphan or bound an unverified previous archive");
            }
        }
    }

    private static async Task ConcurrentCommit()
    {
        var stateStore = new MemoryStore { State = Pair() }; var engine = await Engine(stateStore);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var archives = new Archives { OnWrite = async () => { entered.SetResult(); await release.Task; } };
        var archiving = engine.ArchiveSupersededHistoryAsync(engine.CreateHistoryArchivePlan(), archives); await entered.Task;
        var drafting = engine.SaveDraftAsync(new LocalDraft { Key = "concurrent", Text = "归档时继续保留" });
        Check(!drafting.IsCompleted && engine.Snapshot.Outbox.Count == 2 && engine.Snapshot.HistoryArchives.Count == 0,
            "archive I/O exposed early removal or escaped the state commit lock");
        release.SetResult(); await archiving; await drafting;
        Check(engine.Snapshot.Outbox.Count == 1 && engine.Snapshot.HistoryArchives.Count == 1 && engine.Snapshot.Drafts["concurrent"].Text == "归档时继续保留",
            "serialized archive and draft commit lost either result");
    }

    private static async Task IdReuse()
    {
        var old = New("case") with { Id = "ABCDEF00-1111-4222-8333-ABCDEF001122", Status = PendingStatus.Superseded };
        var latest = New("case"); var conflict = New("conflict") with { Status = PendingStatus.Conflict, RemoteJson = "{\"data\":{\"version\":4}}" };
        var engine = await Engine(new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = [old, latest, conflict] } });
        await engine.ArchiveSupersededHistoryAsync(engine.CreateHistoryArchivePlan(), new Archives());
        var canonical = Guid.Parse(old.Id).ToString("D");
        Check(engine.Snapshot.ArchivedOperationIds.ContainsKey(canonical), "old uppercase operation did not receive a canonical durable tombstone");
        await Throws<ArgumentException>(() => engine.QueueAsync(New("reuse") with { Id = old.Id }));
        await Throws<InvalidOperationException>(() => engine.QueueAsync(New("reuse") with { Id = canonical }));
        await Throws<InvalidOperationException>(() => engine.ReplaceQueuedAsync(latest.Id, latest with { Id = canonical }));
        await Throws<InvalidOperationException>(() => engine.ResolveAsync(conflict.Id, conflict.RemoteJson!, New("conflict") with { Id = canonical }));
        Check(engine.Snapshot.Outbox.Single(operation => operation.Id == latest.Id).Status == PendingStatus.Queued &&
            engine.Snapshot.Outbox.Single(operation => operation.Id == conflict.Id).Status == PendingStatus.Conflict,
            "rejected ID reuse partially superseded an active or conflicted request");
        await Throws<InvalidDataException>(() => Engine(new MemoryStore { State = new WorkspaceState { ScopeId = "test", Outbox = [old, old with { Id = canonical }] } }));
    }

    private static async Task SchemaAndIndex()
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector(); using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "archive-synthetic", protector);
            var initial = Pair() with { ScopeId = store.ScopeId }; await store.SaveAsync(initial);
            var engine = new SyncEngine(store, new FakeApi()); await engine.InitializeAsync();
            var archives = new EncryptedHistoryArchiveStore(Path.GetDirectoryName(store.FilePath)!, store.ScopeId, protector);
            await engine.ArchiveSupersededHistoryAsync(engine.CreateHistoryArchivePlan(), archives); var upgraded = await store.LoadAsync();
            Check(upgraded.Schema == 2 && upgraded.HistoryArchives.Count == 1, "first archive did not switch the durable workspace to the old-reader rejection format");
            var original = await File.ReadAllBytesAsync(store.FilePath);
            await Throws<InvalidDataException>(() => store.SaveAsync(upgraded with { Schema = 1 }));
            await Throws<InvalidDataException>(() => store.SaveAsync(initial));
            Check((await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(original), "legacy schema save replaced newer archive tombstones");
            var reference = upgraded.HistoryArchives.Single(); var operationId = upgraded.ArchivedOperationIds.Keys.Single();
            var archivedDocument = await archives.ReadAsync(reference);
            Check(Encode(archivedDocument.Operations.Single()) == Encode(initial.Outbox.First()) &&
                !Encoding.UTF8.GetString(await File.ReadAllBytesAsync(Path.Combine(Path.GetDirectoryName(store.FilePath)!, "history", reference.FileName))).Contains("原文"),
                "real encrypted archive did not preserve original bytes through the schema-2 state commit");
            var wrongArchive = upgraded with { ArchivedOperationIds = new Dictionary<string, string> { [operationId] = Guid.NewGuid().ToString() } };
            var wrongCount = upgraded with { HistoryArchives = [reference with { Count = reference.Count + 1 }] };
            var activeCollision = upgraded with { Outbox = [.. upgraded.Outbox, New("collision") with { Id = operationId }] };
            var unsafeName = upgraded with { HistoryArchives = [reference with { FileName = "../outside.bin" }] };
            foreach (var invalid in new[] { wrongArchive, wrongCount, activeCollision, unsafeName })
                await Throws<InvalidDataException>(() => store.SaveAsync(invalid));
            Check((await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(original), "invalid archive binding changed the durable workspace");
            // Recovery is explicit and preserves the newer schema-2 primary; the older schema-1 backup contains the original full bodies.
            await store.RestoreBackupAsync(); var restored = await store.LoadAsync();
            Check(restored.Schema == 1 && restored.Outbox.Count == initial.Outbox.Count && restored.Outbox.Any(operation => operation.Id == operationId),
                "explicit rollback lost the original history or failed to preserve the older compatible backup");
            var damaged = Directory.GetFiles(Path.GetDirectoryName(store.FilePath)!, "*.damaged-*").Single();
            Check((await File.ReadAllBytesAsync(damaged)).SequenceEqual(original), "explicit rollback did not preserve the exact newer schema-2 primary");
        });
    }

    private static PendingOperation New(string key) => new() { ResourceKey = key, Method = "PUT", Path = "/api/v1/memos/groups/" + Guid.NewGuid(), BodyJson = "{\"title\":\"原文\\n中文\",\"version\":0}" };
    private static WorkspaceState Pair()
    {
        var old = New("pair") with { Status = PendingStatus.Superseded }; var latest = New("pair") with { Path = old.Path };
        return new WorkspaceState { ScopeId = "test", Outbox = [old, latest] };
    }
    private static async Task<SyncEngine> Engine(MemoryStore store) { var engine = new SyncEngine(store, new FakeApi()); await engine.InitializeAsync(); return engine; }
    private static JsonSerializerOptions Options() => (JsonSerializerOptions)typeof(SyncEngine).Assembly.GetType("Haoduoyu.Core.WorkspaceJson")!
        .GetField("Options", BindingFlags.Static | BindingFlags.NonPublic)!.GetValue(null)!;
    private static string Encode(PendingOperation operation) => JsonSerializer.Serialize(operation, Options());
    private static string StateBytes(WorkspaceState state) => JsonSerializer.Serialize(state, Options());
    private static void Check(bool value, string reason) { if (!value) throw new InvalidOperationException(reason); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception
    { try { await action(); } catch (T) { return; } throw new InvalidOperationException("Expected " + typeof(T).Name); }
    private static async Task WithDirectory(Func<string, Task> action)
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-archive-policy-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try { await action(root); } finally { Directory.Delete(root, recursive: true); }
    }
    private sealed class Archives : IHistoryArchiveStore
    {
        public string ScopeId { get; init; } = "test";
        internal bool FailWrite, FailRead;
        internal int Writes;
        internal Func<Task>? OnWrite;
        internal Func<HistoryArchiveDocument, HistoryArchiveDocument>? Transform;
        internal Func<HistoryArchiveReference, HistoryArchiveReference>? TransformReference;
        internal Dictionary<string, HistoryArchiveDocument> Documents { get; } = new(StringComparer.Ordinal);
        public async Task<HistoryArchiveReference> WriteAsync(HistoryArchiveDocument document, CancellationToken cancellationToken = default)
        {
            Writes++; if (FailWrite) throw new IOException("synthetic archive write failure"); if (OnWrite != null) await OnWrite();
            var encoded = JsonSerializer.SerializeToUtf8Bytes(document, Options());
            Documents.Add(document.Id, JsonSerializer.Deserialize<HistoryArchiveDocument>(encoded, Options())!);
            var reference = new HistoryArchiveReference { Id = document.Id, FileName = "history-" + document.Id + ".bin", Count = document.Operations.Count,
                CreatedAt = document.CreatedAt, Bytes = encoded.Length, Sha256 = Convert.ToHexStringLower(SHA256.HashData(encoded)) };
            return TransformReference?.Invoke(reference) ?? reference;
        }
        public Task<HistoryArchiveDocument> ReadAsync(HistoryArchiveReference reference, CancellationToken cancellationToken = default)
        {
            if (FailRead) throw new IOException("synthetic archive read failure");
            var document = JsonSerializer.Deserialize<HistoryArchiveDocument>(JsonSerializer.Serialize(Documents[reference.Id], Options()), Options())!;
            return Task.FromResult(Transform?.Invoke(document) ?? document);
        }
    }
}
