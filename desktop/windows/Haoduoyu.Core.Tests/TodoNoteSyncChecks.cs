using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

internal static class TodoNoteSyncChecks
{
    private const string Day = "2026-11-07";
    private const string Exact = "  原样中文 🐟\r\nTAB\t组合 e\u0301 与空白  ";
    internal static int Run()
    {
        var tests = new (string Name, Func<Task> Run)[]
        {
            ("Todo note versions derive from complete confirmed same-date create completion restore and note receipts", ParentVersions),
            ("Todo note confirmation checks expected date UUID complete row exact text and strictly next version before accepting HTTP success", BadSuccess),
            ("Todo note missing invalid or body-injected date context fails closed before transport and old queue JSON remains compatible", InvalidMetadata),
            ("Todo notes retain the base resource fence and cannot replace immutable date metadata", SameResourceFence),
            ("Todo note dependency preparation rejects foreign incomplete or invented parent proofs without sending", BadParentProofs),
            ("Todo note definitely-unsent retry preserves frozen version text bytes ID and date after a newer parent receipt", FrozenRetry),
            ("Todo note lost reply and restart preserve immutable request and cannot be resolved confirmed or retried from matching current state", UnknownEvidence),
            ("Encrypted todo-note backup recovery preserves date metadata independent drafts and all unknown-request fences", Recovery),
            ("Todo note unknown guards preserve ordinary todo behavior while explicit conflict resolution still creates a new CAS intent", Compatibility)
        };
        var failed = 0;
        foreach (var (name, run) in tests)
            try { run().GetAwaiter().GetResult(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failed++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
        Console.WriteLine($"Todo note sync checks: {tests.Length - failed}/{tests.Length} passed"); return failed;
    }

    private static async Task ParentVersions()
    {
        foreach (var kind in new[] { "create", "complete", "restore-same", "restore-next", "note" })
        {
            var id = Guid.NewGuid().ToString(); var parent = Parent(id, kind); var version = kind is "create" or "restore-same" ? 7 : 8;
            var parentNote = kind == "note" ? "父原文\r\n" : "已有旧备注";
            var complete = kind == "complete"; var store = Confirmed(parent, Receipt(id, version, parentNote, completed: complete));
            var child = Deferred(id, parent.Id, kind == "note" ? "" : Exact);
            var api = new Api((_, _, body, operationId) =>
            {
                var durable = store.State!.Outbox.Single(operation => operation.Id == operationId);
                Check(durable.Status == PendingStatus.InFlight && durable.RequestBodyJson == body && durable.TodoNoteDate == Day,
                    "todo-note transport ran before the exact frozen request and original date were durable");
                return Task.FromResult(new ApiResult(200, Receipt(id, version + 1, kind == "note" ? "" : Exact, completed: complete)));
            });
            var engine = await Engine(store, api); await engine.QueueAsync(child); var report = await engine.SyncAsync();
            var saved = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id); var body = JsonNode.Parse(api.Sent.Single().Body)!.AsObject();
            Check(report.Confirmed == 1 && saved.Status == PendingStatus.Confirmed && saved.BodyJson == child.BodyJson && saved.TodoNoteDate == Day &&
                body.Count == 2 && body["version"]!.GetValue<long>() == version && body["note"]!.GetValue<string>() == (kind == "note" ? "" : Exact) &&
                !body.ContainsKey("date") && !body.ContainsKey("TodoNoteDate") && saved.RemoteJson == Receipt(id, version + 1, kind == "note" ? "" : Exact, completed: complete),
                "todo-note preparation guessed a version normalized text included date in HTTP or rejected legitimate empty-field omission: " + kind);
        }
        var maximum = 9_007_199_254_740_991L; var maxId = Guid.NewGuid().ToString();
        var maxEngine = await Engine(new Store(), new Api((_, _, _, _) => Task.FromResult(new ApiResult(200, Receipt(maxId, maximum, Exact)))));
        await maxEngine.QueueAsync(Note(maxId, maximum - 1));
        Check((await maxEngine.SyncAsync()).Confirmed == 1, "the valid final safe-integer receipt was rejected although the request was below the exclusive upper bound");
    }

    private static async Task BadSuccess()
    {
        var id = Guid.NewGuid().ToString(); var original = JsonNode.Parse(Receipt(id, 8, Exact))!.AsObject();
        var replies = new List<string>();
        foreach (var (field, value) in new (string, JsonNode?)[]
        {
            ("id", JsonValue.Create(Guid.NewGuid().ToString())), ("date", JsonValue.Create("2026-11-08")), ("date", JsonValue.Create("2026-02-30")),
            ("version", JsonValue.Create(7)), ("version", JsonValue.Create(9)), ("version", JsonValue.Create("8")), ("note", null),
            ("note", JsonValue.Create(Exact.Replace("\r\n", "\n", StringComparison.Ordinal))), ("completed", JsonValue.Create("false")),
            ("deleted_at", JsonValue.Create("2026-11-07T02:00:00.000Z")), ("template_id", JsonValue.Create(Guid.NewGuid().ToString())), ("_local_incomplete", JsonValue.Create(true))
        })
        { var changed = (JsonObject)original.DeepClone(); changed["data"]![field] = value; replies.Add(changed.ToJsonString()); }
        foreach (var field in new[] { "note", "created_at", "deleted_at", "text" })
        { var changed = (JsonObject)original.DeepClone(); changed["data"]!.AsObject().Remove(field); replies.Add(changed.ToJsonString()); }
        var foreign = (JsonObject)original.DeepClone(); foreign["_local_scope_id"] = "foreign-private-scope"; replies.Add(foreign.ToJsonString());
        replies.Add("not-json"); replies.Add("{\"data\":{}}");
        foreach (var json in replies)
        {
            var operation = Note(id, 7); var api = new Api((_, _, _, _) => Task.FromResult(new ApiResult(200, json))); var engine = await Engine(new Store(), api);
            await engine.SaveDraftAsync(new LocalDraft { Key = TodoNotes.DraftKey(id), Text = Exact, BaseVersion = 7 }); await engine.QueueAsync(operation);
            var report = await engine.SyncAsync(); var unknown = engine.Snapshot.Outbox.Single(); await engine.SyncAsync();
            Check(report.Unknown == 1 && report.Confirmed == 0 && api.Sent.Count == 1 && unknown.Status == PendingStatus.Unknown && unknown.Id == operation.Id &&
                unknown.BodyJson == operation.BodyJson && unknown.TodoNoteDate == Day && unknown.RemoteJson == json && unknown.ConfirmedRevision == 0 &&
                engine.Snapshot.Drafts[TodoNotes.DraftKey(id)].Text == Exact, "an invalid successful todo-note body confirmed or replayed the original request: " + json);
        }
    }

    private static async Task InvalidMetadata()
    {
        var id = Guid.NewGuid().ToString(); var valid = Note(id, 7);
        foreach (var date in new string?[] { null, "", "2026-02-30", "2026-11-7", "2026-11-07 " })
        {
            var store = new Store(); var api = new Api(); var engine = await Engine(store, api);
            await Throws<InvalidDataException>(() => engine.QueueAsync(valid with { TodoNoteDate = date }));
            Check(engine.Snapshot.Outbox.Count == 0 && store.Saves == 0 && api.Sent.Count == 0, "invalid new date metadata partly queued or sent a note");
            var legacy = new Store { State = new WorkspaceState { ScopeId = "todo-note-scope", Outbox = [valid with { TodoNoteDate = date }] } };
            var reopened = await Engine(legacy, api); var report = await reopened.SyncAsync();
            Check(report.Blocked == 1 && reopened.Snapshot.Outbox.Single().BodyJson == valid.BodyJson && reopened.Snapshot.Outbox.Single().SendAttempts == 0 && api.Sent.Count == 0,
                "loaded missing or invalid date context failed open or lost its original request");
        }
        foreach (var body in new[] { "{\"note\":\"x\",\"version\":7,\"date\":\"2026-11-07\"}", "{\"note\":\"x\",\"version\":7,\"save_id\":\"invented\"}",
            "{\"note\":null,\"version\":7}", "{\"note\":\"x\",\"version\":0}", "{\"note\":\"x\",\"version\":9007199254740991}",
            new JsonObject { ["note"] = new string('中', 4001), ["version"] = 7 }.ToJsonString(), "{\"note\":\"\\u0000\",\"version\":7}" })
        {
            var api = new Api(); var engine = await Engine(new Store(), api);
            await Throws<InvalidDataException>(() => engine.QueueAsync(valid with { BodyJson = body }));
            Check(engine.Snapshot.Outbox.Count == 0 && api.Sent.Count == 0, "invalid note fields text or version reached durable queue or HTTP");
        }
        Check(!JsonSerializer.Serialize(new PendingOperation()).Contains("TodoNoteDate", StringComparison.Ordinal), "new optional date metadata changed old queue JSON shape");
    }

    private static async Task SameResourceFence()
    {
        var id = Guid.NewGuid().ToString();
        foreach (var pending in new[] { Parent(id, "create"), Parent(id, "complete"), Parent(id, "restore-next"),
            new PendingOperation { Method = "DELETE", Path = Key(id), ResourceKey = Key(id), BodyJson = "{\"date\":\"2026-11-07\",\"version\":7}" },
            Note(id, 7) with { Status = PendingStatus.Unknown, SendAttempts = 1 } })
        {
            var api = new Api(); var store = new Store { State = new WorkspaceState { ScopeId = "todo-note-scope", Outbox = [pending] } }; var engine = await Engine(store, api);
            var before = JsonSerializer.Serialize(engine.Snapshot); await Throws<InvalidOperationException>(() => engine.QueueAsync(Note(id, 7)));
            Check(JsonSerializer.Serialize(engine.Snapshot) == before && api.Sent.Count == 0, "a todo note bypassed a same-resource create completion delete restore or unknown fence");
        }
        var valid = Note(id, 7); var own = await Engine(new Store(), new Api()); await own.QueueAsync(valid);
        await Throws<InvalidOperationException>(() => own.ReplaceQueuedAsync(valid.Id, valid with { Id = Guid.NewGuid().ToString(), TodoNoteDate = "2026-11-08" }));
        await Throws<InvalidOperationException>(() => own.QueueAsync(valid with { TodoNoteDate = "2026-11-08" }));
        await Throws<InvalidDataException>(() => own.QueueAsync(valid with { Id = Guid.NewGuid().ToString(), ResourceKey = TodoNotes.DraftKey(id) }));
        Check(own.Snapshot.Outbox.Single().TodoNoteDate == Day && own.Snapshot.Outbox.Single().BodyJson == valid.BodyJson, "a replacement duplicate ID or draft key changed note resource/date identity");
    }

    private static async Task BadParentProofs()
    {
        var id = Guid.NewGuid().ToString(); var parent = Parent(id, "create"); var full = JsonNode.Parse(Receipt(id, 7, "old"))!.AsObject();
        var missing = (JsonObject)full.DeepClone(); missing["data"]!.AsObject().Remove("completed"); var foreign = (JsonObject)full.DeepClone(); foreign["_local_scope_id"] = "another-scope";
        var deleted = (JsonObject)full.DeepClone(); deleted["data"]!["deleted_at"] = "2026-11-07T00:00:00.000Z";
        var complete = Parent(id, "complete"); var priorNote = Parent(id, "note");
        var cases = new (PendingOperation Parent, string Json)[]
        {
            (parent, Receipt(Guid.NewGuid().ToString(), 7, "old")), (parent, Receipt(id, 7, "old", date: "2026-11-08")), (parent, missing.ToJsonString()), (parent, foreign.ToJsonString()),
            (parent, deleted.ToJsonString()), (parent, Receipt(id, 9_007_199_254_740_991L, "old")),
            (parent with { ResourceKey = "/local/create/" + id }, Receipt(id, 7, "old")),
            (parent with { Path = "/api/v1/unscheduled-todos" }, Receipt(id, 7, "old")),
            (parent with { Method = "GET", Path = Key(id) }, Receipt(id, 7, "old")),
            (parent with { BodyJson = parent.BodyJson.Replace(Day, "2026-11-08", StringComparison.Ordinal) }, Receipt(id, 7, "old")),
            (complete, Receipt(id, 7, "old", completed: true)), (complete, Receipt(id, 8, "old", completed: false)),
            (priorNote, Receipt(id, 8, "different")), (priorNote with { TodoNoteDate = null }, Receipt(id, 8, "父原文\r\n")),
            (priorNote with { TodoNoteDate = "2026-11-08" }, Receipt(id, 8, "父原文\r\n")),
            (parent, new JsonObject { ["data"] = new JsonObject { ["todo"] = full["data"]!.DeepClone() } }.ToJsonString())
        };
        foreach (var proof in cases)
        {
            var api = new Api(); var engine = await Engine(Confirmed(proof.Parent, proof.Json), api); var child = Deferred(id, proof.Parent.Id, Exact);
            await engine.QueueAsync(child); var result = await engine.SyncAsync(); var saved = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
            Check(result.Blocked == 1 && api.Sent.Count == 0 && saved.PreparedBodyJson == null && saved.BodyJson == child.BodyJson && saved.SendAttempts == 0 &&
                engine.Snapshot.Outbox.Single(operation => operation.Id == proof.Parent.Id).RemoteJson == proof.Json, "an invalid parent proof derived or sent todo-note version bytes");
        }
    }

    private static async Task FrozenRetry()
    {
        var id = Guid.NewGuid().ToString(); var parent = Parent(id, "create"); var child = Deferred(id, parent.Id, Exact); var store = Confirmed(parent, Receipt(id, 7, "old")); var first = true;
        var api = new Api((_, _, _, _) => first ? throw new RequestNotSentException("synthetic known no-send scope guard") : Task.FromResult(new ApiResult(200, Receipt(id, 8, Exact))));
        var engine = await Engine(store, api); await engine.QueueAsync(child); await engine.SyncAsync(); var frozen = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
        store.State = store.State! with { Outbox = store.State.Outbox.Select(operation => operation.Id == parent.Id ? operation with { RemoteJson = Receipt(id, 9, "later") } : operation).ToList() };
        var restarted = await Engine(store, api); await restarted.RetryUnchangedAsync(child.Id, Receipt(id, 9, "later")); first = false; await restarted.SyncAsync();
        var saved = restarted.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
        Check(api.Sent.Count == 2 && api.Sent[0].Body == api.Sent[1].Body && saved.RequestBodyJson == frozen.RequestBodyJson && saved.BodyJson == child.BodyJson &&
            saved.Id == child.Id && saved.TodoNoteDate == Day && saved.SendAttempts == 2 && saved.Status == PendingStatus.Confirmed,
            "a definitely-unsent retry recalculated from a newer receipt or changed frozen todo-note context");
    }

    private static async Task UnknownEvidence()
    {
        var id = Guid.NewGuid().ToString(); var parent = Parent(id, "create"); var child = Deferred(id, parent.Id, Exact); var store = Confirmed(parent, Receipt(id, 7, "old"));
        var api = new Api((method, _, _, _) => method == "GET" ? Task.FromResult(new ApiResult(200, Receipt(id, 8, Exact))) : throw new HttpRequestException("synthetic note reply lost"));
        var engine = await Engine(store, api); await engine.SaveDraftAsync(new LocalDraft { Key = Key(id), Text = "独立创建稿不能覆盖", BaseVersion = 0 });
        await engine.SaveDraftAsync(new LocalDraft { Key = TodoNotes.DraftKey(id), Text = Exact, BaseVersion = 7 }); await engine.QueueAsync(child); await engine.SyncAsync();
        var frozen = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id); var restarted = await Engine(store, api); var before = JsonSerializer.Serialize(restarted.Snapshot);
        await restarted.ReadRemoteAsync("/api/v1/todos?date=" + Day);
        await Throws<InvalidOperationException>(() => restarted.RetryUnchangedAsync(child.Id, Receipt(id, 8, Exact)));
        await Throws<InvalidOperationException>(() => restarted.ConfirmReconciledAsync(child.Id, Receipt(id, 8, Exact)));
        await Throws<InvalidOperationException>(() => restarted.ResolveAsync(child.Id, Receipt(id, 8, Exact)));
        await Throws<InvalidOperationException>(() => restarted.ResolveAsync(child.Id, Receipt(id, 8, Exact), Note(id, 8)));
        await restarted.SyncAsync();
        Check(JsonSerializer.Serialize(restarted.Snapshot) == before && api.Sent.Count(sent => sent.Method != "GET") == 1 && frozen.Status == PendingStatus.Unknown &&
            frozen.TodoNoteDate == Day && frozen.RequestBodyJson != child.BodyJson && frozen.BodyJson == child.BodyJson &&
            restarted.Snapshot.Drafts[Key(id)].Text == "独立创建稿不能覆盖" && restarted.Snapshot.Drafts[TodoNotes.DraftKey(id)].Text == Exact,
            "matching current todo content released a note unknown fence changed frozen bytes/date or merged separate draft identities");
    }

    private static async Task Recovery()
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-todo-note-sync-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try
        {
            var id = Guid.NewGuid().ToString(); var operation = Note(id, 7);
            using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "synthetic-note-owner", new TestProtector());
            var old = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1, Outbox = [operation], Drafts =
            { [Key(id)] = new LocalDraft { Key = Key(id), Text = "原待办创建稿", BaseVersion = 0 }, [TodoNotes.DraftKey(id)] = new LocalDraft { Key = TodoNotes.DraftKey(id), Text = Exact, BaseVersion = 7 } } };
            await store.SaveAsync(old); await store.SaveAsync(old with { LocalRevision = 2, Outbox = [operation with { Status = PendingStatus.Confirmed, SendAttempts = 1,
                ConfirmedRevision = 2, RemoteJson = Receipt(id, 8, Exact) }] }); await store.RestoreBackupAsync();
            var api = new Api(); var engine = await Engine(store, api); var restored = engine.Snapshot.Outbox.Single(); var bytes = await File.ReadAllBytesAsync(store.FilePath);
            await Throws<InvalidOperationException>(() => engine.RetryUnchangedAsync(operation.Id, Receipt(id, 8, Exact)));
            await Throws<InvalidOperationException>(() => engine.ConfirmReconciledAsync(operation.Id, Receipt(id, 8, Exact)));
            await Throws<InvalidOperationException>(() => engine.ResolveAsync(operation.Id, Receipt(id, 8, Exact))); await engine.SyncAsync();
            var reopened = await Engine(store, api); var saved = reopened.Snapshot.Outbox.Single();
            Check(saved.Status == PendingStatus.Unknown && saved.Id == operation.Id && saved.BodyJson == operation.BodyJson && saved.TodoNoteDate == Day &&
                saved.RecoveredAtRevision == restored.RecoveredAtRevision && saved.RecoveredAtRevision > 0 && !saved.CanEditQueued && api.Sent.Count == 0 &&
                reopened.Snapshot.Drafts[TodoNotes.DraftKey(id)].Text == Exact && reopened.Snapshot.Drafts[Key(id)].Text == "原待办创建稿" &&
                (await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(bytes), "backup recovery lost note date provenance exact bytes independent drafts or restored unknown fencing");
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    private static async Task Compatibility()
    {
        var id = Guid.NewGuid().ToString(); var ordinary = Parent(id, "complete") with { Status = PendingStatus.Unknown, SendAttempts = 1 };
        var existing = await Engine(new Store { State = new WorkspaceState { ScopeId = "todo-note-scope", Outbox = [ordinary] } }, new Api());
        await existing.RetryUnchangedAsync(ordinary.Id, Receipt(id, 8, "old", completed: true));
        Check(existing.Snapshot.Outbox.Single().Status == PendingStatus.Queued && existing.Snapshot.Outbox.Single().BodyJson == ordinary.BodyJson,
            "the note-specific unknown restriction changed ordinary completion retry behavior");
        var conflict = Note(id, 7) with { Status = PendingStatus.Conflict, SendAttempts = 1 }; var replacement = Note(id, 8);
        var api = new Api((_, _, _, _) => Task.FromResult(new ApiResult(200, Receipt(id, 9, Exact))));
        var engine = await Engine(new Store { State = new WorkspaceState { ScopeId = "todo-note-scope", Outbox = [conflict] } }, api);
        await engine.ResolveAsync(conflict.Id, Receipt(id, 8, "remote"), replacement); await engine.SyncAsync();
        Check(engine.Snapshot.Outbox.Single(operation => operation.Id == conflict.Id).Status == PendingStatus.Superseded &&
            engine.Snapshot.Outbox.Single(operation => operation.Id == conflict.Id).BodyJson == conflict.BodyJson &&
            engine.Snapshot.Outbox.Single(operation => operation.Id == replacement.Id).Status == PendingStatus.Confirmed && api.Sent.Single().Id == replacement.Id,
            "explicit todo-note conflict resolution reused an old request or lost existing new-CAS semantics");
    }

    private static string Key(string id) => "/api/v1/todos/" + id;
    private static PendingOperation Note(string id, long version, string note = Exact) => new() { Path = Key(id) + "/note", Method = "PATCH", ResourceKey = Key(id), TodoNoteDate = Day,
        BodyJson = new JsonObject { ["note"] = note, ["version"] = version }.ToJsonString() };
    private static PendingOperation Deferred(string id, string parent, string note) => Note(id, 7, note) with { BodyJson = new JsonObject { ["note"] = note }.ToJsonString(), DependencyIds = [parent], VersionFromDependencyId = parent };
    private static PendingOperation Parent(string id, string kind) => kind switch
    {
        "create" => new() { Method = "POST", Path = "/api/v1/todos", ResourceKey = Key(id), BodyJson = new JsonObject { ["id"] = id, ["date"] = Day, ["text"] = "原有待办正文" }.ToJsonString() },
        "complete" => new() { Method = "PATCH", Path = Key(id), ResourceKey = Key(id), BodyJson = "{\"completed\":true,\"version\":7}" },
        "restore-same" or "restore-next" => new() { Method = "POST", Path = Key(id) + "/restore", ResourceKey = Key(id), BodyJson = "{\"date\":\"2026-11-07\",\"version\":7}" },
        _ => Note(id, 7, "父原文\r\n")
    };
    private static string Receipt(string id, long version, string note, string date = Day, bool completed = false)
    {
        var row = new JsonObject { ["id"] = id, ["date"] = date, ["text"] = "原有待办正文", ["completed"] = completed, ["version"] = version,
            ["created_at"] = "2026-11-07T00:00:00.000Z", ["updated_at"] = "2026-11-07T01:00:00.000Z", ["deleted_at"] = null };
        if (note.Length > 0) row["note"] = note; return new JsonObject { ["data"] = row }.ToJsonString();
    }
    private static Store Confirmed(PendingOperation parent, string json) => new() { State = new WorkspaceState { ScopeId = "todo-note-scope", LocalRevision = 1,
        Outbox = [parent with { Status = PendingStatus.Confirmed, ConfirmedRevision = 1, RemoteJson = json }] } };
    private static async Task<SyncEngine> Engine(IWorkspaceStore store, IRemoteApi api) { var engine = new SyncEngine(store, api); await engine.InitializeAsync(); return engine; }
    private static void Check(bool condition, string reason) { if (!condition) throw new InvalidOperationException(reason); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception { try { await action(); } catch (T) { return; } throw new InvalidOperationException("Expected " + typeof(T).Name); }
    private sealed class Store : IWorkspaceStore
    {
        public string ScopeId => "todo-note-scope"; internal WorkspaceState? State { get; set; } internal int Saves { get; private set; }
        public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(Clone(State ?? new WorkspaceState { ScopeId = ScopeId }));
        public Task SaveAsync(WorkspaceState state, CancellationToken cancellationToken = default) { State = Clone(state); Saves++; return Task.CompletedTask; }
        private static WorkspaceState Clone(WorkspaceState state) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(state))!;
    }
    private sealed class Api(Func<string, string, string?, string, Task<ApiResult>>? response = null) : IRemoteApi
    {
        internal List<(string Method, string Path, string Body, string Id)> Sent { get; } = [];
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        { Sent.Add((method, path, bodyJson ?? "", operationId)); return response?.Invoke(method, path, bodyJson, operationId) ?? Task.FromResult(new ApiResult(200, "{\"data\":{}}")); }
    }
}
