using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

internal static class TemplateArchiveSyncChecks
{
    internal static int Run()
    {
        var cases = new (string Name, Func<Task> Run)[]
        {
            ("Template create archive restore derive actual confirmed versions including a same-version archive no-op", ConfirmedChain),
            ("Template version preparation rejects foreign resource scope UUID incomplete state and invented versions", InvalidProofs),
            ("Template current lists cannot confirm replace or retry an unknown archive or restore", UnknownListEvidence),
            ("Template prepared unknown bytes and IDs survive restart without freezing a newer dependency version", PreparedUnknown),
            ("Template definitely-unsent retry retains its already frozen request instead of recalculating from later proof", PreparedBlockedRetry),
            ("Encrypted template backup recovery retains unknown request and draft fences through read-only list comparison", RecoveredUnknown),
            ("Template archive guards do not alter generic note template-rename or legacy-delete retry behavior", OtherResourcesUnchanged),
            ("Existing template create or rename dependency versions still feed ordinary rename and delete without the new archive receipt contract", ExistingTemplateVersions)
        };
        var failed = 0;
        foreach (var (name, run) in cases)
            try { run().GetAwaiter().GetResult(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failed++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
        Console.WriteLine($"Template archive sync checks: {cases.Length - failed}/{cases.Length} passed"); return failed;
    }

    private static async Task ConfirmedChain()
    {
        foreach (var alreadyArchived in new[] { false, true })
        {
            var id = Guid.NewGuid().ToString(); var key = Key(id); var create = Create(id);
            var archive = Deferred(id, "archive", create.Id); var restore = Deferred(id, "restore", archive.Id);
            var archiveVersion = alreadyArchived ? 7 : 8; var store = new Store();
            var api = new Api((method, path, body, operationId) =>
            {
                var pending = store.State!.Outbox.Single(operation => operation.Id == operationId);
                Check(method == pending.Method && path == pending.Path && pending.Status == PendingStatus.InFlight && pending.RequestBodyJson == body,
                    "template transport preceded the exact durable frozen request");
                return Task.FromResult(new ApiResult(200, Receipt(id, operationId == create.Id ? 7 : operationId == archive.Id ? archiveVersion : archiveVersion + 1,
                    operationId == create.Id ? alreadyArchived : operationId == archive.Id)));
            });
            var engine = await Engine(store, api); await engine.QueueAsync(create); await engine.SyncAsync();
            await engine.QueueAsync(archive); await engine.SyncAsync(); await engine.QueueAsync(restore); var result = await engine.SyncAsync();
            Check(api.Sent.Count == 3 && result.Confirmed == 1 && engine.Snapshot.Outbox.All(operation => operation.Status == PendingStatus.Confirmed && operation.ResourceKey == key),
                "same-key confirmed template chain failed or introduced a different resource key");
            var archiveSent = api.Sent.Single(sent => sent.Id == archive.Id); var restoreSent = api.Sent.Single(sent => sent.Id == restore.Id);
            Check(Version(archiveSent.Body) == 7 && Version(restoreSent.Body) == archiveVersion && JsonNode.Parse(archiveSent.Body)!.AsObject().Count == 1 &&
                JsonNode.Parse(restoreSent.Body)!.AsObject().Count == 1 && engine.Snapshot.Outbox.Single(operation => operation.Id == archive.Id).BodyJson == "{}" &&
                engine.Snapshot.Outbox.Single(operation => operation.Id == restore.Id).BodyJson == "{}", "template child guessed +1 or changed its original logical intent instead of reading the actual receipt");
        }
    }

    private static async Task InvalidProofs()
    {
        var id = Guid.NewGuid().ToString(); var otherId = Guid.NewGuid().ToString(); var parent = Create(id);
        var receipt = JsonNode.Parse(Receipt(id, 7, false))!.AsObject();
        var wrongScope = (JsonObject)receipt.DeepClone(); wrongScope["_local_scope_id"] = "another-private-partition";
        var missingText = (JsonObject)receipt.DeepClone(); missingText["data"]!.AsObject().Remove("text");
        var softDelete = (JsonObject)receipt.DeepClone(); softDelete["data"]!["deleted_at"] = null;
        var incomplete = (JsonObject)receipt.DeepClone(); incomplete["data"]!["_local_incomplete"] = true;
        var archiveParent = parent with { Method = "POST", Path = Key(id) + "/archive", BodyJson = "{\"version\":5}" };
        var restoreParent = parent with { Method = "POST", Path = Key(id) + "/restore", BodyJson = "{\"version\":6}" };
        var missingArchive = JsonNode.Parse(Receipt(id, 7, false))!.AsObject(); missingArchive["data"]!.AsObject().Remove("archived_at");
        var proofs = new (PendingOperation Parent, string Json)[]
        {
            (parent, Receipt(otherId, 7, false)), (parent, wrongScope.ToJsonString()), (parent, missingText.ToJsonString()),
            (parent, softDelete.ToJsonString()), (parent, incomplete.ToJsonString()), (parent, Receipt(id, 9_007_199_254_740_991L, false)),
            (parent with { Path = "/api/v1/todos", BodyJson = Create(id).BodyJson }, Receipt(id, 7, false)),
            (parent with { ResourceKey = Key(otherId) }, Receipt(id, 7, false)),
            (parent with { Method = "GET", Path = Key(id) }, Receipt(id, 7, false)),
            (parent with { Path = "/api/v1/todo-templates?archived=1" }, Receipt(id, 7, false)),
            (archiveParent, Receipt(id, 7, true)), (archiveParent, Receipt(id, 6, false)),
            (restoreParent, missingArchive.ToJsonString()), (restoreParent, Receipt(id, 7, true)),
            (parent, "{\"data\":{\"items\":[" + receipt["data"]!.ToJsonString() + "]}}")
        };
        foreach (var proof in proofs)
        {
            var confirmed = proof.Parent with { Status = PendingStatus.Confirmed, ConfirmedRevision = 1, RemoteJson = proof.Json };
            var store = new Store { State = new WorkspaceState { ScopeId = "template-scope", LocalRevision = 1, Outbox = [confirmed] } };
            var api = new Api(); var engine = await Engine(store, api); var child = Deferred(id, "archive", parent.Id);
            await engine.QueueAsync(child); var result = await engine.SyncAsync(); var rejected = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
            Check(result.Blocked == 1 && api.Sent.Count == 0 && rejected.Status == PendingStatus.Blocked && rejected.SendAttempts == 0 &&
                rejected.PreparedBodyJson == null && rejected.BodyJson == child.BodyJson && engine.Snapshot.Outbox.Single(operation => operation.Id == parent.Id).RemoteJson == proof.Json,
                "invalid template proof was sent frozen or replaced: " + proof.Parent.Path + " / " + proof.Json);
        }
        // Valid parent proof cannot make an invalid non-template archive action or extra child field legal.
        foreach (var badChild in new[] { Deferred(id, "archive", parent.Id) with { BodyJson = "{\"save_id\":\"invented\"}" },
            Deferred(id, "archive", parent.Id) with { Path = "/api/v1/todos/" + id + "/archive", ResourceKey = "/api/v1/todos/" + id } })
        {
            var api = new Api(); var engine = await Engine(ConfirmedStore(parent, Receipt(id, 7, false)), api);
            await engine.QueueAsync(badChild); await engine.SyncAsync();
            Check(api.Sent.Count == 0 && engine.Snapshot.Outbox.Single(operation => operation.Id == badChild.Id).Status == PendingStatus.Blocked,
                "template version handling widened another resource's archive route or body contract");
        }
    }

    private static async Task UnknownListEvidence()
    {
        foreach (var action in new[] { "archive", "restore" })
        {
            var id = Guid.NewGuid().ToString(); var operation = Direct(id, action) with { Status = PendingStatus.Unknown, SendAttempts = 1 };
            var current = Receipt(id, 8, action == "archive"); var data = JsonNode.Parse(current)!["data"]!.DeepClone();
            var lists = new[] { "{\"data\":{\"today\":\"2026-11-07\",\"window_start\":\"2026-10-09\",\"items\":[]}}",
                new JsonObject { ["data"] = new JsonObject { ["today"] = "2026-11-07", ["window_start"] = "2026-10-09", ["items"] = new JsonArray(data) } }.ToJsonString(), current };
            var store = new Store { State = new WorkspaceState { ScopeId = "template-scope", LocalRevision = 1, Outbox = [operation],
                Drafts = { [operation.ResourceKey] = new LocalDraft { Key = operation.ResourceKey, Text = "未知结果后保留的模板中文稿 🐟", BaseVersion = 7 } } } };
            var api = new Api(); var engine = await Engine(store, api); var before = JsonSerializer.Serialize(engine.Snapshot); var saves = store.Saves;
            foreach (var evidence in lists)
            {
                await Throws<InvalidOperationException>(() => engine.RetryUnchangedAsync(operation.Id, evidence));
                await Throws<InvalidOperationException>(() => engine.ConfirmReconciledAsync(operation.Id, evidence));
                await Throws<InvalidOperationException>(() => engine.ResolveAsync(operation.Id, evidence));
                await Throws<InvalidOperationException>(() => engine.ResolveAsync(operation.Id, evidence, Direct(id, action)));
            }
            await engine.SyncAsync();
            Check(api.Sent.Count == 0 && store.Saves == saves && JsonSerializer.Serialize(engine.Snapshot) == before,
                "current template list state changed unknown status draft original bytes ID or durable state");
        }
    }

    private static async Task PreparedUnknown()
    {
        var id = Guid.NewGuid().ToString(); var parent = Create(id); var child = Deferred(id, "archive", parent.Id);
        var store = ConfirmedStore(parent, Receipt(id, 7, false));
        var api = new Api((_, _, _, _) => throw new HttpRequestException("synthetic missing archive reply"));
        var engine = await Engine(store, api); await engine.QueueAsync(child); await engine.SyncAsync();
        var original = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
        Check(original.Status == PendingStatus.Unknown && original.SendAttempts == 1 && Version(original.RequestBodyJson) == 7, "the attempted archive was not frozen at its real prior version");
        store.State = store.State! with { Outbox = store.State.Outbox.Select(operation => operation.Id == parent.Id ? operation with { RemoteJson = Receipt(id, 9, true) } : operation).ToList() };
        var reopened = await Engine(store, api); await Throws<InvalidOperationException>(() => reopened.RetryUnchangedAsync(child.Id, Receipt(id, 9, true))); await reopened.SyncAsync();
        var retained = reopened.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
        Check(api.Sent.Count == 1 && retained.Id == original.Id && retained.BodyJson == original.BodyJson && retained.PreparedBodyJson == original.PreparedBodyJson &&
            retained.Status == PendingStatus.Unknown && retained.SendAttempts == 1, "a later dependency receipt or restart changed or replayed an already attempted template archive");
    }

    private static async Task PreparedBlockedRetry()
    {
        var id = Guid.NewGuid().ToString(); var parent = Create(id); var child = Deferred(id, "archive", parent.Id);
        var store = ConfirmedStore(parent, Receipt(id, 7, false)); var preflight = true;
        var api = new Api((_, _, _, _) => preflight ? throw new RequestNotSentException("synthetic checked scope guard before send") : Task.FromResult(new ApiResult(200, Receipt(id, 8, true))));
        var engine = await Engine(store, api); await engine.QueueAsync(child); await engine.SyncAsync(); var frozen = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
        Check(frozen.Status == PendingStatus.Blocked && frozen.PreparedBodyJson != null, "definite preflight did not preserve prepared template bytes");
        store.State = store.State! with { Outbox = store.State.Outbox.Select(operation => operation.Id == parent.Id ? operation with { RemoteJson = Receipt(id, 9, false) } : operation).ToList() };
        var reopened = await Engine(store, api); await reopened.RetryUnchangedAsync(child.Id, "{\"data\":{}}"); preflight = false; await reopened.SyncAsync();
        var retried = reopened.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
        Check(api.Sent.Count == 2 && api.Sent[0].Body == api.Sent[1].Body && retried.PreparedBodyJson == frozen.PreparedBodyJson &&
            retried.BodyJson == child.BodyJson && retried.Id == child.Id && retried.SendAttempts == 2 && retried.Status == PendingStatus.Confirmed,
            "explicit retry after definite no-send recomputed a template dependency or changed its immutable request");
    }

    private static async Task RecoveredUnknown()
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-template-sync-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try
        {
            var id = Guid.NewGuid().ToString(); var operation = Direct(id, "archive");
            using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "synthetic-template-owner", new TestProtector());
            var old = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1, Outbox = [operation],
                Drafts = { [operation.ResourceKey] = new LocalDraft { Key = operation.ResourceKey, Text = "恢复前原中文模板稿 🐟", BaseVersion = 7 } } };
            await store.SaveAsync(old); await store.SaveAsync(old with { LocalRevision = 2, Outbox = [operation with { Status = PendingStatus.Confirmed, ConfirmedRevision = 2,
                SendAttempts = 1, RemoteJson = Receipt(id, 8, true) }] });
            await store.RestoreBackupAsync(); var api = new Api(); var engine = await Engine(store, api); var recovered = engine.Snapshot.Outbox.Single();
            Check(recovered.Status == PendingStatus.Unknown && recovered.RecoveredAtRevision == engine.Snapshot.BackupRecoveryRevision && recovered.RecoveredAtRevision > 0,
                "actual encrypted backup recovery revived template intent or lost recovery provenance");
            var bytes = await File.ReadAllBytesAsync(store.FilePath);
            await engine.ReadRemoteAsync("/api/v1/todo-templates"); await engine.ReadRemoteAsync("/api/v1/todo-templates?archived=1");
            await Throws<InvalidOperationException>(() => engine.RetryUnchangedAsync(operation.Id, Receipt(id, 8, true)));
            await Throws<InvalidOperationException>(() => engine.ConfirmReconciledAsync(operation.Id, Receipt(id, 8, true)));
            await Throws<InvalidOperationException>(() => engine.ResolveAsync(operation.Id, Receipt(id, 8, true))); await engine.SyncAsync();
            var retained = engine.Snapshot.Outbox.Single();
            Check(api.Sent.All(sent => sent.Method == "GET") && retained.Id == operation.Id && retained.BodyJson == operation.BodyJson && retained.Status == PendingStatus.Unknown &&
                retained.RecoveredAtRevision == recovered.RecoveredAtRevision && engine.Snapshot.Drafts[operation.ResourceKey].Text == old.Drafts[operation.ResourceKey].Text &&
                (await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(bytes), "readonly list comparison released restored template fences or rewrote the encrypted original");
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    private static async Task OtherResourcesUnchanged()
    {
        foreach (var (method, suffix) in new[] { ("PUT", "/api/v1/note-entries/" + Guid.NewGuid()), ("POST", "/api/v1/note-entries/" + Guid.NewGuid() + "/restore"),
            ("PATCH", "/api/v1/todo-templates/" + Guid.NewGuid()), ("DELETE", "/api/v1/todo-templates/" + Guid.NewGuid()) })
        {
            var operation = new PendingOperation { ResourceKey = suffix, Path = suffix, Method = method, BodyJson = "{\"version\":7}", Status = PendingStatus.Unknown, SendAttempts = 1 };
            var engine = await Engine(new Store { State = new WorkspaceState { ScopeId = "template-scope", Outbox = [operation] } }, new Api());
            await engine.RetryUnchangedAsync(operation.Id, "{\"data\":{}}"); var queued = engine.Snapshot.Outbox.Single();
            Check(queued.Status == PendingStatus.Queued && queued.Id == operation.Id && queued.BodyJson == operation.BodyJson && queued.SendAttempts == 1,
                "template archive protection changed an existing resource's explicit retry contract");
        }
    }

    private static async Task ExistingTemplateVersions()
    {
        foreach (var parentMethod in new[] { "POST", "PATCH" })
        foreach (var childMethod in new[] { "PATCH", "DELETE" })
        {
            var id = Guid.NewGuid().ToString(); var parent = Create(id);
            if (parentMethod == "PATCH") parent = parent with { Method = "PATCH", Path = Key(id), BodyJson = "{\"text\":\"合成常用模板 🐟\",\"version\":8}" };
            // This is the existing generic engine's minimum version proof; the new archive-specific
            // schema must not be imposed on established rename/delete preparation paths.
            var proof = new JsonObject { ["data"] = new JsonObject { ["id"] = id, ["version"] = 9 } }.ToJsonString();
            var api = new Api(); var engine = await Engine(ConfirmedStore(parent, proof), api);
            var child = new PendingOperation { ResourceKey = Key(id), Path = Key(id), Method = childMethod,
                BodyJson = childMethod == "PATCH" ? "{\"text\":\"继续原来的改名路径\"}" : "{}", DependencyIds = [parent.Id], VersionFromDependencyId = parent.Id };
            await engine.QueueAsync(child); await engine.SyncAsync();
            Check(api.Sent.Count == 1 && Version(api.Sent[0].Body) == 9 && engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id).BodyJson == child.BodyJson,
                "the new template archive path intercepted an existing ordinary template version dependency");
        }
    }

    private static PendingOperation Create(string id) => new() { Method = "POST", Path = "/api/v1/todo-templates", ResourceKey = Key(id),
        BodyJson = new JsonObject { ["id"] = id, ["text"] = "合成常用模板 🐟" }.ToJsonString() };
    private static PendingOperation Direct(string id, string action) => new() { Method = "POST", Path = Key(id) + "/" + action, ResourceKey = Key(id), BodyJson = "{\"version\":7}" };
    private static PendingOperation Deferred(string id, string action, string parent) => Direct(id, action) with { BodyJson = "{}", DependencyIds = [parent], VersionFromDependencyId = parent };
    private static string Key(string id) => "/api/v1/todo-templates/" + id;
    private static long Version(string json) => JsonNode.Parse(json)!["version"]!.GetValue<long>();
    private static string Receipt(string id, long version, bool archived) => new JsonObject { ["data"] = new JsonObject
    { ["id"] = id, ["text"] = "合成常用模板 🐟", ["version"] = version, ["created_at"] = "2026-11-01T00:00:00.000Z", ["updated_at"] = "2026-11-07T01:00:00.000Z",
        ["archived_at"] = archived ? JsonValue.Create("2026-11-07T01:00:00.000Z") : null, ["completed_days"] = 0, ["habit_status"] = "todo" } }.ToJsonString();
    private static Store ConfirmedStore(PendingOperation parent, string json) => new() { State = new WorkspaceState { ScopeId = "template-scope", LocalRevision = 1,
        Outbox = [parent with { Status = PendingStatus.Confirmed, ConfirmedRevision = 1, RemoteJson = json }] } };
    private static async Task<SyncEngine> Engine(IWorkspaceStore store, IRemoteApi api) { var engine = new SyncEngine(store, api); await engine.InitializeAsync(); return engine; }
    private static void Check(bool condition, string reason) { if (!condition) throw new InvalidOperationException(reason); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception
    { try { await action(); } catch (T) { return; } throw new InvalidOperationException("Expected " + typeof(T).Name); }
    private sealed class Store : IWorkspaceStore
    {
        public string ScopeId => "template-scope"; internal WorkspaceState? State { get; set; } internal int Saves { get; private set; }
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
