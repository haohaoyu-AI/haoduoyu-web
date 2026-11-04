using System.Text.Json;
using Haoduoyu.Core;

internal static class QueueChecks
{
    internal static int Run()
    {
        var tests = new (string, Func<Task>)[]
        {
            ("Local revisions atomically order cache batches and confirmed responses", Revisions),
            ("Schema one files default new revision and dependency fields safely", LegacySchema),
            ("Parent confirmation precedes child even when restored queue order is reversed", ParentBeforeChild),
            ("Parent conflict or permission failure never dispatches a dependent child", ParentFailure),
            ("Uncertain parent remains pending across restart without child dispatch", UnknownParentRestart),
            ("Missing and cyclic dependencies reject without committing a partial queue", InvalidDependencies),
            ("Only unsent queued work can be cancelled and its body remains in history", QueuedCancellation),
            ("Explicit parent replacement preserves child intent and sends the replacement first", ParentReplacement),
            ("Replacement cycles and reused operation IDs leave original queued intent untouched", InvalidReplacement),
            ("Failed cancellation or batch disk commit leaves original durable state intact", FailedCommit),
            ("Caller-owned dependency lists cannot mutate an already durable intent", DependenciesCaptured),
            ("Already attempted requests remain fenced after explicit retry returns them to Queued", RetriedRequestsCannotBeReplaced),
            ("Deferred todo versions come from real confirmed versions, including versions above one", PreparedRealVersion),
            ("Invalid parent entity/version proof blocks preparation without a child request", InvalidVersionProof),
            ("Prepared actual request bytes survive unknown results, restart and explicit retry", PreparedUnknownRestart),
            ("Cancelling an unsent parent never dispatches its still-queued child", CancelledParent)
        };
        var failures = 0;
        foreach (var (name, run) in tests)
        {
            try { run().GetAwaiter().GetResult(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failures++; Console.Error.WriteLine($"FAIL {name}: {error}"); }
        }
        Console.WriteLine($"Queue and revision checks: {tests.Length - failures}/{tests.Length} passed");
        return failures;
    }

    private static async Task Revisions()
    {
        var store = new Store(); var engine = await Engine(store, new Api());
        await engine.CacheAsync("/api/v1/memos", "{\"data\":{\"groups\":[],\"notes\":[]}}");
        Check(engine.Snapshot.LocalRevision == 1 && engine.Snapshot.CacheRevisions["/api/v1/memos"] == 1, "cache was not stamped");
        var operation = Operation("group"); await engine.QueueAsync(operation); await engine.SyncAsync();
        var confirmed = engine.Snapshot.Outbox.Single();
        Check(confirmed.Status == PendingStatus.Confirmed && confirmed.ConfirmedRevision == engine.Snapshot.LocalRevision && confirmed.ConfirmedRevision > 1,
            "confirmation revision was not durably ordered after cache");
        var previous = engine.Snapshot.LocalRevision; var saves = store.SaveCount;
        await engine.CacheBatchAsync(new Dictionary<string, string> { ["/api/v1/memos"] = "{\"data\":{\"groups\":[],\"notes\":[]}}", ["/api/v1/todos?date=2026-11-04"] = "{\"data\":{\"items\":[]}}" });
        var snapshot = engine.Snapshot;
        Check(snapshot.LocalRevision == previous + 1 && snapshot.CacheRevisions.Values.All(value => value == snapshot.LocalRevision) && store.SaveCount == saves + 1,
            "cache batch was split across revisions or commits");
        Check(snapshot.Outbox.Single().ConfirmedRevision < snapshot.CacheRevisions["/api/v1/memos"], "older confirmation was promoted over a newer complete read");
    }

    private static async Task LegacySchema()
    {
        var id = Guid.NewGuid().ToString();
        var state = JsonSerializer.Deserialize<WorkspaceState>("{\"Schema\":1,\"ScopeId\":\"scope\",\"Outbox\":[{\"Id\":\"" + id + "\",\"ResourceKey\":\"legacy\",\"Method\":\"PUT\",\"Path\":\"/api/v1/memos/groups/" + id + "\",\"BodyJson\":\"{}\",\"Status\":5}]}")!;
        var engine = await Engine(new Store { State = state }, new Api());
        Check(engine.Snapshot.LocalRevision == 0 && engine.Snapshot.CacheRevisions.Count == 0 &&
            engine.Snapshot.Outbox.Single().DependencyIds.Count == 0 && engine.Snapshot.Outbox.Single().ConfirmedRevision == 0,
            "old schema-one history was reinterpreted as a fresh confirmation");
    }

    private static async Task ParentBeforeChild()
    {
        var parent = Operation("parent"); var child = Operation("child") with { DependencyIds = [parent.Id] };
        var store = new Store { State = new WorkspaceState { ScopeId = "scope", Outbox = [child, parent] } }; var api = new Api();
        var engine = await Engine(store, api); var result = await engine.SyncAsync();
        Check(api.Sent.Select(x => x.Id).SequenceEqual(new[] { parent.Id, child.Id }) && result.Confirmed == 2, "child dispatched before durable parent confirmation");
        Check(engine.Snapshot.Outbox.All(x => x.ConfirmedRevision > 0), "dependent confirmations were not stamped");
    }

    private static async Task ParentFailure()
    {
        foreach (var status in new[] { 409, 403 })
        {
            var api = new Api(status); var engine = await Engine(new Store(), api);
            var parent = Operation("parent"); var child = Operation("child") with { DependencyIds = [parent.Id] };
            await engine.QueueAsync(parent); await engine.QueueAsync(child); await engine.SyncAsync();
            Check(api.Sent.Count == 1 && engine.Snapshot.Outbox.Single(x => x.Id == child.Id).Status == PendingStatus.Queued,
                "dependent child was dispatched despite parent failure");
        }
    }

    private static async Task UnknownParentRestart()
    {
        var store = new Store(); var api = new Api { ThrowNetwork = true }; var engine = await Engine(store, api);
        var parent = Operation("parent"); var child = Operation("child") with { DependencyIds = [parent.Id] };
        await engine.QueueAsync(parent); await engine.QueueAsync(child); await engine.SyncAsync();
        var afterRestart = await Engine(store, api); await afterRestart.SyncAsync();
        Check(api.Sent.Count == 1 && afterRestart.Snapshot.Outbox.Single(x => x.Id == parent.Id).Status == PendingStatus.Unknown &&
            afterRestart.Snapshot.Outbox.Single(x => x.Id == child.Id).Status == PendingStatus.Queued, "restart replayed unknown parent or dispatched its child");
    }

    private static async Task InvalidDependencies()
    {
        var store = new Store(); var engine = await Engine(store, new Api());
        await Throws<InvalidDataException>(() => engine.QueueAsync(Operation("orphan") with { DependencyIds = [Guid.NewGuid().ToString()] }));
        Check(engine.Snapshot.Outbox.Count == 0 && store.SaveCount == 0, "orphan dependency was partly committed");
        var first = Operation("first"); var second = Operation("second");
        var cyclic = new Store { State = new WorkspaceState { ScopeId = "scope", Outbox =
            [first with { DependencyIds = [second.Id] }, second with { DependencyIds = [first.Id] }] } };
        await Throws<InvalidDataException>(() => Engine(cyclic, new Api()));
        await Throws<InvalidDataException>(() => engine.QueueAsync(first with { DependencyIds = [first.Id] }));
    }

    private static async Task QueuedCancellation()
    {
        var api = new Api(); var engine = await Engine(new Store(), api); var queued = Operation("queued");
        await engine.QueueAsync(queued); await engine.CancelQueuedAsync(queued.Id); await engine.SyncAsync();
        var history = engine.Snapshot.Outbox.Single();
        Check(history.Status == PendingStatus.Superseded && history.Id == queued.Id && history.BodyJson == queued.BodyJson && api.Sent.Count == 0,
            "cancelled intent was deleted, modified or sent");
        foreach (var status in new[] { PendingStatus.InFlight, PendingStatus.Unknown, PendingStatus.Conflict, PendingStatus.Blocked, PendingStatus.Confirmed })
        {
            var operation = Operation("protected") with { Status = status };
            var other = await Engine(new Store { State = new WorkspaceState { ScopeId = "scope", Outbox = [operation] } }, api);
            await Throws<InvalidOperationException>(() => other.CancelQueuedAsync(operation.Id));
        }
    }

    private static async Task ParentReplacement()
    {
        var engine = await Engine(new Store(), new Api()); var parent = Operation("parent");
        var child = Operation("child") with { DependencyIds = [parent.Id] };
        await engine.QueueAsync(parent); await engine.QueueAsync(child);
        var replacement = parent with { Id = Guid.NewGuid().ToString(), BodyJson = "{\"title\":\"明确替换后的分组\",\"version\":0}" };
        await engine.ReplaceQueuedAsync(parent.Id, replacement);
        var stored = engine.Snapshot;
        Check(stored.Outbox[0].BodyJson == parent.BodyJson && stored.Outbox[0].Status == PendingStatus.Superseded &&
            stored.Outbox[0].SupersededById == replacement.Id && stored.Outbox[1].DependencyIds.Single() == parent.Id,
            "replacement mutated historical body or child's immutable dependencies");
        var result = await engine.SyncAsync();
        Check(result.Confirmed == 2 && engine.Snapshot.Outbox.Single(x => x.Id == child.Id).Status == PendingStatus.Confirmed,
            "replacement parent could not safely satisfy child dependency");
    }

    private static async Task InvalidReplacement()
    {
        var engine = await Engine(new Store(), new Api()); var original = Operation("original"); await engine.QueueAsync(original);
        var cycle = original with { Id = Guid.NewGuid().ToString(), DependencyIds = [original.Id] };
        await Throws<InvalidDataException>(() => engine.ReplaceQueuedAsync(original.Id, cycle));
        await Throws<InvalidOperationException>(() => engine.ReplaceQueuedAsync(original.Id, original));
        Check(engine.Snapshot.Outbox.Count == 1 && engine.Snapshot.Outbox[0].Status == PendingStatus.Queued, "failed replacement changed original intent");
    }

    private static async Task FailedCommit()
    {
        var store = new Store(); var engine = await Engine(store, new Api()); var operation = Operation("queued"); await engine.QueueAsync(operation);
        store.FailNext = true;
        await Throws<IOException>(() => engine.CancelQueuedAsync(operation.Id));
        Check(engine.Snapshot.Outbox.Single().Status == PendingStatus.Queued, "failed cancel changed visible queue");
        var revision = engine.Snapshot.LocalRevision; store.FailNext = true;
        await Throws<IOException>(() => engine.CacheBatchAsync(new Dictionary<string, string> { ["one"] = "{}", ["two"] = "{}" }));
        Check(engine.Snapshot.Cache.Count == 0 && engine.Snapshot.LocalRevision == revision, "failed cache batch partly committed");
    }

    private static async Task DependenciesCaptured()
    {
        var api = new Api(409); var engine = await Engine(new Store(), api); var parent = Operation("parent");
        var dependencies = new List<string> { parent.Id };
        var child = Operation("child") with { DependencyIds = dependencies };
        await engine.QueueAsync(parent); await engine.QueueAsync(child); dependencies.Clear();
        Check(engine.Snapshot.Outbox.Single(x => x.Id == child.Id).DependencyIds.SequenceEqual(new[] { parent.Id }), "external list mutated a durable dependency");
        await engine.SyncAsync(); Check(api.Sent.Count == 1, "mutated dependency dispatched a child after parent conflict");
    }

    private static async Task RetriedRequestsCannotBeReplaced()
    {
        var api = new Api { ThrowNetwork = true }; var engine = await Engine(new Store(), api); var operation = Operation("attempted");
        await engine.QueueAsync(operation); await engine.SyncAsync();
        await engine.RetryUnchangedAsync(operation.Id, "{\"data\":{\"version\":3}}");
        var retried = engine.Snapshot.Outbox.Single();
        Check(retried.Status == PendingStatus.Queued && retried.SendAttempts == 1 && !retried.CanEditQueued, "attempt history was erased on retry");
        await Throws<InvalidOperationException>(() => engine.CancelQueuedAsync(operation.Id));
        await Throws<InvalidOperationException>(() => engine.ReplaceQueuedAsync(operation.Id, operation with { Id = Guid.NewGuid().ToString() }));
        var legacy = operation with { Status = PendingStatus.Unknown, SendAttempts = 0, Error = "legacy unknown result" };
        var legacyEngine = await Engine(new Store { State = new WorkspaceState { ScopeId = "scope", Outbox = [legacy] } }, new Api());
        await legacyEngine.RetryUnchangedAsync(legacy.Id, "{}");
        await Throws<InvalidOperationException>(() => legacyEngine.CancelQueuedAsync(legacy.Id));
    }

    private static async Task PreparedRealVersion()
    {
        foreach (var version in new[] { 1, 3 })
        {
            var id = Guid.NewGuid().ToString(); var parent = TodoCreate(id); var child = TodoCompletion(id, parent.Id);
            var actualParentId = parent.Id;
            var api = new Api { Reply = (operationId, _) => new ApiResult(200, operationId == actualParentId
                ? "{\"data\":{\"id\":\"" + id + "\",\"version\":" + version + "}}" : "{\"data\":{}}") };
            var engine = await Engine(new Store(), api); await engine.QueueAsync(parent); await engine.QueueAsync(child);
            if (version == 3)
            {
                var replacement = parent with { Id = Guid.NewGuid().ToString(), BodyJson = parent.BodyJson.Replace("合成待办", "明确替换后的待办") };
                actualParentId = replacement.Id; await engine.ReplaceQueuedAsync(parent.Id, replacement);
            }
            await engine.SyncAsync();
            var sent = api.Sent.Single(x => x.Id == child.Id); using var body = JsonDocument.Parse(sent.Body);
            var saved = engine.Snapshot.Outbox.Single(x => x.Id == child.Id);
            Check(body.RootElement.GetProperty("version").GetInt32() == version && body.RootElement.GetProperty("completed").GetBoolean(), "child version was guessed instead of read from the parent response");
            Check(saved.BodyJson == child.BodyJson && saved.PreparedBodyJson == sent.Body && saved.SendAttempts == 1,
                "preparation changed the logical intent or did not persist exact actual bytes");
        }
    }

    private static async Task InvalidVersionProof()
    {
        foreach (var proof in new[] { "{\"data\":{}}", "{\"data\":{\"id\":\"wrong-entity\",\"version\":3}}", "[]", "42", "null", "invalid-json" })
        {
            var id = Guid.NewGuid().ToString(); var parent = TodoCreate(id); var child = TodoCompletion(id, parent.Id);
            var api = new Api { Reply = (_, _) => new ApiResult(200, proof) }; var engine = await Engine(new Store(), api);
            await engine.QueueAsync(parent); await engine.QueueAsync(child); var result = await engine.SyncAsync();
            var blocked = engine.Snapshot.Outbox.Single(x => x.Id == child.Id);
            Check(api.Sent.Count == 1 && result.Blocked == 1 && blocked.Status == PendingStatus.Blocked &&
                blocked.PreparedBodyJson == null && blocked.SendAttempts == 0, "invalid parent proof issued a child request");
        }
    }

    private static async Task PreparedUnknownRestart()
    {
        var id = Guid.NewGuid().ToString(); var parent = TodoCreate(id); var child = TodoCompletion(id, parent.Id); var store = new Store();
        var api = new Api { ThrowOperationId = child.Id, Reply = (_, _) => new ApiResult(200, "{\"data\":{\"id\":\"" + id + "\",\"version\":3}}") };
        var engine = await Engine(store, api); await engine.QueueAsync(parent); await engine.QueueAsync(child); await engine.SyncAsync();
        var attempted = engine.Snapshot.Outbox.Single(x => x.Id == child.Id); var actualBytes = attempted.RequestBodyJson;
        Check(attempted.Status == PendingStatus.Unknown && attempted.PreparedBodyJson != null, "uncertain actual request was not retained");
        // Simulate a newer verified dependency entity in restored state. The already-sent child's bytes must remain the old version.
        store.State = store.State with { Outbox = store.State.Outbox.Select(x => x.Id == parent.Id ? x with
            { RemoteJson = "{\"data\":{\"id\":\"" + id + "\",\"version\":9}}" } : x).ToList() };
        var restarted = await Engine(store, api); await restarted.RetryUnchangedAsync(child.Id, "{\"data\":{\"version\":9}}");
        api.ThrowOperationId = null; await restarted.SyncAsync();
        Check(api.Sent.Where(x => x.Id == child.Id).All(x => x.Body == actualBytes) &&
            restarted.Snapshot.Outbox.Single(x => x.Id == child.Id).SendAttempts == 2,
            "retry regenerated an already-attempted actual request from a newer dependency version");
    }

    private static async Task CancelledParent()
    {
        var id = Guid.NewGuid().ToString(); var parent = TodoCreate(id); var child = TodoCompletion(id, parent.Id); var api = new Api();
        var engine = await Engine(new Store(), api); await engine.QueueAsync(parent); await engine.QueueAsync(child);
        await engine.CancelQueuedAsync(parent.Id); await engine.SyncAsync();
        Check(api.Sent.Count == 0 && engine.Snapshot.Outbox.Single(x => x.Id == child.Id).Status == PendingStatus.Queued,
            "cancelled parent still allowed a dependent write");
    }
    private static PendingOperation TodoCreate(string id) => new()
    { ResourceKey = "/api/v1/todos/" + id, Method = "POST", Path = "/api/v1/todos", BodyJson = "{\"id\":\"" + id + "\",\"date\":\"2026-11-04\",\"text\":\"合成待办\"}" };
    private static PendingOperation TodoCompletion(string id, string parentId) => new()
    { ResourceKey = "/local/todo-after-create/" + id, Method = "PATCH", Path = "/api/v1/todos/" + id,
        BodyJson = "{\"completed\":true}", DependencyIds = [parentId], VersionFromDependencyId = parentId };

    private static PendingOperation Operation(string key) => new()
    { ResourceKey = key, Path = "/api/v1/memos/groups/" + Guid.NewGuid(), Method = "PUT", BodyJson = "{\"title\":\"合成分组\",\"version\":0}" };
    private static async Task<SyncEngine> Engine(Store store, IRemoteApi api) { var engine = new SyncEngine(store, api); await engine.InitializeAsync(); return engine; }
    private static void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception
    { try { await action(); } catch (T) { return; } throw new InvalidOperationException("Expected " + typeof(T).Name); }
    private sealed class Store : IWorkspaceStore
    {
        public string ScopeId => "scope";
        public WorkspaceState State { get; set; } = new() { ScopeId = "scope" };
        public bool FailNext; public int SaveCount;
        public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(Clone(State));
        public Task SaveAsync(WorkspaceState value, CancellationToken cancellationToken = default)
        { if (FailNext) { FailNext = false; throw new IOException("synthetic disk failure"); } State = Clone(value); SaveCount++; return Task.CompletedTask; }
        private static WorkspaceState Clone(WorkspaceState value) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(value))!;
    }
    private sealed class Api(int status = 200) : IRemoteApi
    {
        public List<(string Id, string Body)> Sent { get; } = new();
        public bool ThrowNetwork;
        public string? ThrowOperationId;
        public Func<string, string?, ApiResult>? Reply;
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        { Sent.Add((operationId, bodyJson ?? "")); if (ThrowNetwork || operationId == ThrowOperationId) throw new HttpRequestException("synthetic lost response"); return Task.FromResult(Reply?.Invoke(operationId, bodyJson) ?? new ApiResult(status, "{\"data\":{}}")); }
    }
}
