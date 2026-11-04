using System.Text.Json;
using System.Text;
using System.Text.Json.Nodes;
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
            ("Cancelling an unsent parent never dispatches its still-queued child", CancelledParent),
            ("Unscheduled create complete move chains derive distinct source and destination versions", CompositeVersionSources),
            ("Composite version preparation rejects wrong paths resources identities and nested proofs", InvalidCompositeProof),
            ("Composite-derived actual request stays immutable through restart and explicit retry", CompositePreparedRestart),
            ("Todo create template association completion derives actual versions without changing link fields", TemplateVersionChain),
            ("Template composite versions require exact active identity and version associations", InvalidTemplateVersionProof),
            ("Structural snapshots detach all mutable containers and nested dependency lists", SnapshotIsolation),
            ("Encrypted old escaped JSON loads and rewrites as compact Unicode without changing values", LegacyJsonCompatibility),
            ("Legacy restore dependent edits use only the exact category and date's real version", LegacyRestoreVersion),
            ("Legacy restore proof rejects wrong date category method and incomplete restored state", InvalidLegacyRestoreVersion)
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
        var state = JsonSerializer.Deserialize<WorkspaceState>("{\"Schema\":1,\"ScopeId\":\"scope\",\"Drafts\":{\"legacy\":{\"Key\":\"legacy\",\"Text\":\"old draft\"}},\"Outbox\":[{\"Id\":\"" + id + "\",\"ResourceKey\":\"legacy\",\"Method\":\"PUT\",\"Path\":\"/api/v1/memos/groups/" + id + "\",\"BodyJson\":\"{}\",\"Status\":5}]}")!;
        var engine = await Engine(new Store { State = state }, new Api());
        Check(engine.Snapshot.LocalRevision == 0 && engine.Snapshot.CacheRevisions.Count == 0 &&
            engine.Snapshot.Outbox.Single().DependencyIds.Count == 0 && engine.Snapshot.Outbox.Single().ConfirmedRevision == 0 &&
            engine.Snapshot.Drafts["legacy"].BaselineConfirmedRevision == 0,
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
    private static async Task CompositeVersionSources()
    {
        foreach (var action in new[] { "move", "complete-today" })
        {
            var id = Guid.NewGuid().ToString();
            var create = new PendingOperation { ResourceKey = "future-create:" + id, Method = "POST", Path = "/api/v1/unscheduled-todos",
                BodyJson = "{\"id\":\"" + id + "\",\"text\":\"合成未安排事项\"}" };
            var complete = Derived("/api/v1/unscheduled-todos/" + id, "PATCH", "{\"completed\":true}", create.Id, "future-completed:" + id);
            var move = Derived("/api/v1/unscheduled-todos/" + id + "/" + action, "POST", "{\"date\":\"2026-11-04\"}", complete.Id, "future-move:" + id);
            var todo = Derived("/api/v1/todos/" + id, "PATCH", "{\"completed\":false}", move.Id, "moved-todo:" + id);
            var restore = Derived("/api/v1/unscheduled-todos/" + id + "/restore", "POST", "{}", move.Id, "restore-source:" + id);
            var replies = new Dictionary<string, string>
            {
                [create.Id] = DirectEntity(id, 1), [complete.Id] = DirectEntity(id, 2), [move.Id] = CompositeReceipt(id, 3, 8),
                [todo.Id] = DirectEntity(id, 9), [restore.Id] = DirectEntity(id, 4)
            };
            var api = new Api { Reply = (operationId, _) => new ApiResult(200, replies[operationId]) };
            var engine = await Engine(new Store(), api);
            foreach (var operation in new[] { create, complete, move, todo, restore }) await engine.QueueAsync(operation);
            var report = await engine.SyncAsync();
            Check(report.Confirmed == 5 && api.Sent.Select(sent => sent.Id).SequenceEqual(new[] { create.Id, complete.Id, move.Id, todo.Id, restore.Id }),
                "unscheduled dependency chain dispatched out of confirmation order");
            Check(SentVersion(api, complete.Id) == 1 && SentVersion(api, move.Id) == 2 &&
                SentVersion(api, todo.Id) == 8 && SentVersion(api, restore.Id) == 3,
                "composite source and destination versions were guessed or interchanged");
            Check(engine.Snapshot.Outbox.Single(operation => operation.Id == move.Id).BodyJson == "{\"date\":\"2026-11-04\"}",
                "preparing an action-suffix route mutated its logical body");
        }
    }

    private static async Task InvalidCompositeProof()
    {
        var id = Guid.NewGuid().ToString(); var other = Guid.NewGuid().ToString(); var valid = CompositeReceipt(id, 3, 8);
        var cases = new List<(PendingOperation Parent, string ChildPath)>();
        var parent = ConfirmedMove(id, "move", valid);
        cases.Add((parent with { Path = "/api/v1/unscheduled-todos/" + other + "/move" }, "/api/v1/todos/" + id));
        cases.Add((parent with { Path = "/api/v1/todos/" + id, Method = "PATCH" }, "/api/v1/todos/" + id));
        cases.Add((parent with { Method = "PUT" }, "/api/v1/todos/" + id));
        cases.Add((parent, "/api/v1/memos/notes/" + id));
        cases.Add((parent, "/api/v1/todos/" + id + "/template"));
        cases.Add((parent with { RemoteJson = "{\"data\":{\"unrelated\":{\"id\":\"" + id + "\",\"version\":8}}}" }, "/api/v1/todos/" + id));
        foreach (var (branch, field, value) in new (string, string, JsonNode?)[]
            { ("source", "id", JsonValue.Create(other)), ("todo", "id", JsonValue.Create(other)),
              ("source", "version", JsonValue.Create(0)), ("todo", "version", JsonValue.Create("8")) })
        {
            var changed = JsonNode.Parse(valid)!.AsObject(); changed["data"]![branch]![field] = value;
            cases.Add((parent with { RemoteJson = changed.ToJsonString() }, "/api/v1/todos/" + id));
        }
        foreach (var (proof, path) in cases)
        {
            var api = new Api(); var store = new Store { State = new WorkspaceState { ScopeId = "scope", LocalRevision = 1, Outbox = [proof] } };
            var engine = await Engine(store, api); var child = Derived(path, "PATCH", "{\"completed\":false}", proof.Id, "child:" + Guid.NewGuid());
            await engine.QueueAsync(child); var report = await engine.SyncAsync();
            var actual = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
            Check(api.Sent.Count == 0 && report.Blocked == 1 && actual.Status == PendingStatus.Blocked && actual.PreparedBodyJson == null,
                "mismatched composite proof prepared or dispatched a child request");
        }
    }

    private static async Task CompositePreparedRestart()
    {
        var id = Guid.NewGuid().ToString(); var parent = ConfirmedMove(id, "complete-today", CompositeReceipt(id, 3, 8));
        var child = Derived("/api/v1/todos/" + id, "PATCH", "{\"completed\":false}", parent.Id, "moved-todo:" + id);
        var store = new Store { State = new WorkspaceState { ScopeId = "scope", LocalRevision = 1, Outbox = [parent] } };
        var api = new Api { ThrowOperationId = child.Id }; var engine = await Engine(store, api); await engine.QueueAsync(child); await engine.SyncAsync();
        var actual = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id).RequestBodyJson;
        Check(SentVersion(api, child.Id) == 8, "first composite request used the wrong branch version");
        store.State = store.State with { Outbox = store.State.Outbox.Select(operation => operation.Id == parent.Id
            ? operation with { RemoteJson = CompositeReceipt(id, 13, 18) } : operation).ToList() };
        var restarted = await Engine(store, api); await restarted.RetryUnchangedAsync(child.Id, DirectEntity(id, 18));
        api.ThrowOperationId = null; await restarted.SyncAsync();
        Check(api.Sent.Where(sent => sent.Id == child.Id).All(sent => sent.Body == actual) &&
            restarted.Snapshot.Outbox.Single(operation => operation.Id == child.Id).SendAttempts == 2,
            "restarting regenerated an unknown request from newer composite versions");
    }
    private static async Task TemplateVersionChain()
    {
        var id = Guid.NewGuid().ToString(); var templateId = Guid.NewGuid().ToString(); var create = TodoCreate(id);
        var linkBody = JsonSerializer.Serialize(new { date = "2026-11-04", template_id = templateId, template_version = 20 });
        var link = Derived("/api/v1/todos/" + id + "/template", "POST", linkBody, create.Id, "link-template:" + id);
        var complete = TodoCompletion(id, link.Id);
        var api = new Api { Reply = (operationId, _) => new ApiResult(200, operationId == create.Id ? DirectEntity(id, 3) :
            operationId == link.Id ? TemplateReceipt(id, templateId) : DirectEntity(id, 5)) };
        var engine = await Engine(new Store(), api); await engine.QueueAsync(create); await engine.QueueAsync(link); await engine.QueueAsync(complete);
        var result = await engine.SyncAsync();
        Check(result.Confirmed == 3 && SentVersion(api, link.Id) == 3 && SentVersion(api, complete.Id) == 4,
            "template association/completion versions were guessed or taken from template.version instead of todo.version");
        using var actual = JsonDocument.Parse(api.Sent.Single(sent => sent.Id == link.Id).Body);
        Check(actual.RootElement.GetProperty("template_id").GetString() == templateId &&
            actual.RootElement.GetProperty("template_version").GetInt32() == 20 && actual.RootElement.GetProperty("date").GetString() == "2026-11-04" &&
            engine.Snapshot.Outbox.Single(operation => operation.Id == link.Id).BodyJson == linkBody,
            "version preparation changed the date/template fields or immutable logical request");
    }

    private static async Task InvalidTemplateVersionProof()
    {
        var id = Guid.NewGuid().ToString(); var templateId = Guid.NewGuid().ToString(); var otherId = Guid.NewGuid().ToString();
        var response = TemplateReceipt(id, templateId);
        var parent = new PendingOperation { Path = "/api/v1/todos/" + id + "/template", Method = "POST", ResourceKey = "confirmed-link:" + id,
            BodyJson = JsonSerializer.Serialize(new { date = "2026-11-04", version = 3, template_id = templateId, template_version = 20 }),
            Status = PendingStatus.Confirmed, RemoteJson = response, ConfirmedRevision = 1, SendAttempts = 1 };
        var cases = new List<PendingOperation>
        {
            parent with { Path = "/api/v1/todos/" + otherId + "/template" }, parent with { Method = "PUT" },
            parent with { RemoteJson = DirectEntity(id, 4) },
            parent with { BodyJson = JsonSerializer.Serialize(new { template_id = otherId }) }
        };
        foreach (var (branch, field, value) in new (string, string, JsonNode?)[]
            { ("todo", "id", JsonValue.Create(otherId)), ("template", "id", JsonValue.Create(otherId)),
              ("todo", "template_id", JsonValue.Create(otherId)), ("todo", "template_version", JsonValue.Create(20)),
              ("todo", "template_version", JsonValue.Create("21")), ("todo", "template_active", JsonValue.Create(false)),
              ("template", "version", JsonValue.Create(0)) })
        {
            var changed = JsonNode.Parse(response)!.AsObject(); changed["data"]![branch]![field] = value;
            cases.Add(parent with { RemoteJson = changed.ToJsonString() });
        }
        foreach (var proof in cases)
        {
            var api = new Api(); var store = new Store { State = new WorkspaceState { ScopeId = "scope", LocalRevision = 1, Outbox = [proof] } };
            var engine = await Engine(store, api); var child = TodoCompletion(id, proof.Id); await engine.QueueAsync(child); var result = await engine.SyncAsync();
            Check(result.Blocked == 1 && api.Sent.Count == 0 && engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id).PreparedBodyJson == null,
                "invalid template association proof dispatched a dependent request");
        }
        var wrongResource = await Engine(new Store { State = new WorkspaceState { ScopeId = "scope", LocalRevision = 1, Outbox = [parent] } }, new Api());
        var wrongChild = Derived("/api/v1/unscheduled-todos/" + id, "PATCH", "{\"completed\":true}", parent.Id, "wrong-child");
        await wrongResource.QueueAsync(wrongChild); await wrongResource.SyncAsync();
        Check(wrongResource.Snapshot.Outbox.Single(operation => operation.Id == wrongChild.Id).Status == PendingStatus.Blocked,
            "template todo proof was confused with an unscheduled record sharing its UUID");
    }
    private static string TemplateReceipt(string id, string templateId) => JsonSerializer.Serialize(new
    {
        data = new
        {
            todo = new { id, version = 4, text = "合成待办", date = "2026-11-04", completed = false, template_id = templateId, template_version = 21, template_active = true },
            template = new { id = templateId, version = 21, text = "合成待办" }
        }
    });

    private static async Task SnapshotIsolation()
    {
        var engine = await Engine(new Store(), new Api()); var parent = Operation("parent");
        var child = Operation("child") with { DependencyIds = [parent.Id] };
        await engine.QueueAsync(parent); await engine.QueueAsync(child);
        await engine.SaveDraftAsync(new LocalDraft { Key = "draft", Text = "本机原稿", BaseVersion = 3 });
        await engine.CacheAsync("cache", "{\"data\":\"<标签> & 中文 🐟\"}");
        var detached = engine.Snapshot; var revision = detached.CacheRevisions["cache"];
        detached.Cache["cache"] = "changed"; detached.CacheRevisions["cache"] = -1;
        detached.Drafts["draft"] = detached.Drafts["draft"] with { Text = "changed" };
        var dependency = detached.Outbox.Single(operation => operation.Id == child.Id).DependencyIds;
        if (dependency is string[] array) array[0] = Guid.NewGuid().ToString();
        else if (dependency is IList<string> list) list[0] = Guid.NewGuid().ToString();
        else throw new InvalidOperationException("snapshot dependency test could not mutate the detached collection");
        detached.Outbox[0] = detached.Outbox[0] with { BodyJson = "{}" };
        var actual = engine.Snapshot;
        Check(actual.Cache["cache"].Contains("中文") && actual.CacheRevisions["cache"] == revision && actual.Drafts["draft"].Text == "本机原稿" &&
            actual.Outbox.Single(operation => operation.Id == child.Id).DependencyIds.Single() == parent.Id && actual.Outbox[0].BodyJson == parent.BodyJson,
            "a public snapshot mutated live durable state through a shared dictionary/list");
    }

    private static async Task LegacyJsonCompatibility()
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-json-compat-" + Guid.NewGuid().ToString("N"));
        var protector = new TestProtector();
        try
        {
            using var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", "synthetic-json-compat", protector);
            var text = "中文 🐟 <script>只作原样文字</script> & \"引号\" \\ 末尾";
            var original = new WorkspaceState { ScopeId = store.ScopeId, Cache = { ["synthetic"] = JsonSerializer.Serialize(new { data = text }) },
                Drafts = { ["draft"] = new LocalDraft { Key = "draft", Text = text } } };
            var oldPlaintext = JsonSerializer.SerializeToUtf8Bytes(original);
            Check(Encoding.UTF8.GetString(oldPlaintext).Contains("\\u"), "fixture did not use the previous escaped writer");
            var oldFile = "HDYWS1\n"u8.ToArray().Concat(protector.Protect(oldPlaintext)).ToArray();
            await File.WriteAllBytesAsync(store.FilePath, oldFile);
            var loaded = await store.LoadAsync(); Check(loaded.Drafts["draft"].Text == text && loaded.Cache["synthetic"] == original.Cache["synthetic"], "old escaped Unicode JSON changed on load");
            await store.SaveAsync(loaded);
            var newFile = await File.ReadAllBytesAsync(store.FilePath); var rewritten = protector.Unprotect(newFile[7..]);
            Check(Encoding.UTF8.GetString(rewritten).Contains("中文") && Encoding.UTF8.GetString(rewritten).Contains("<script>"), "local encrypted writer still expands Unicode/HTML characters");
            var reloaded = await store.LoadAsync();
            Check(reloaded.Drafts["draft"].Text == text && reloaded.Cache["synthetic"] == original.Cache["synthetic"] &&
                (await File.ReadAllBytesAsync(store.BackupPath)).SequenceEqual(oldFile), "compact encrypted rewrite lost data or previous backup bytes");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    private static async Task LegacyRestoreVersion()
    {
        foreach (var category in new[] { "life", "work" })
        {
            var parent = LegacyRestore(category); var api = new Api();
            var engine = await Engine(new Store { State = new WorkspaceState { ScopeId = "scope", LocalRevision = 1, Outbox = [parent] } }, api);
            var child = Derived("/api/v1/daily-notes/2026-11-04?category=" + category, "PUT",
                JsonSerializer.Serialize(new { text = "恢复后离线续编", save_id = Guid.NewGuid().ToString() }), parent.Id, "legacy-child:" + category);
            await engine.QueueAsync(child); var result = await engine.SyncAsync();
            Check(result.Confirmed == 1 && SentVersion(api, child.Id) == 7 && engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id).BodyJson == child.BodyJson,
                "legacy continuation guessed a version or changed its original logical draft");
        }
    }
    private static async Task InvalidLegacyRestoreVersion()
    {
        var valid = LegacyRestore("work");
        var cases = new List<PendingOperation>
        {
            valid with { Path = "/api/v1/daily-notes/2026-11-03/restore?category=work" },
            valid with { Path = "/api/v1/daily-notes/2026-11-04/restore?category=life" },
            valid with { Path = "/api/v1/daily-notes/2026-11-04/restore" },
            valid with { Method = "PUT" },
            valid with { RemoteJson = JsonSerializer.Serialize(new { data = new { date = "2026-11-03", version = 7, text = "恢复", deleted = false } }) },
            valid with { RemoteJson = JsonSerializer.Serialize(new { data = new { date = "2026-11-04", version = 7, text = "恢复", deleted = false, category = "life" } }) },
            valid with { RemoteJson = JsonSerializer.Serialize(new { data = new { date = "2026-11-04", version = 0, text = "恢复", deleted = false } }) },
            valid with { RemoteJson = JsonSerializer.Serialize(new { data = new { date = "2026-11-04", version = 7, text = "恢复", deleted = true } }) },
            valid with { RemoteJson = JsonSerializer.Serialize(new { data = new { date = "2026-11-04", version = 7 } }) }
        };
        foreach (var parent in cases)
        {
            var api = new Api(); var engine = await Engine(new Store { State = new WorkspaceState { ScopeId = "scope", LocalRevision = 1, Outbox = [parent] } }, api);
            var child = Derived("/api/v1/daily-notes/2026-11-04?category=work", "PUT", "{\"text\":\"离线续编\",\"save_id\":\"synthetic\"}", parent.Id, "legacy-invalid");
            await engine.QueueAsync(child); var result = await engine.SyncAsync();
            Check(api.Sent.Count == 0 && result.Blocked == 1 && engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id).PreparedBodyJson == null,
                "wrong legacy date/category or incomplete restore proof dispatched a write");
        }
    }
    private static PendingOperation LegacyRestore(string category) => new()
    {
        Path = "/api/v1/daily-notes/2026-11-04/restore?category=" + category, Method = "POST", ResourceKey = "legacy-parent:" + category,
        BodyJson = "{\"version\":6,\"save_id\":\"synthetic-parent\"}", Status = PendingStatus.Confirmed, ConfirmedRevision = 1, SendAttempts = 1,
        RemoteJson = JsonSerializer.Serialize(new { data = new { date = "2026-11-04", text = "已恢复合成正文", version = 7, deleted = false, can_edit = true } })
    };

    private static PendingOperation Derived(string path, string method, string body, string parent, string key) => new()
    { Path = path, Method = method, BodyJson = body, ResourceKey = key, DependencyIds = [parent], VersionFromDependencyId = parent };
    private static PendingOperation ConfirmedMove(string id, string action, string response) => new()
    { Path = "/api/v1/unscheduled-todos/" + id + "/" + action, Method = "POST", BodyJson = "{\"date\":\"2026-11-04\",\"version\":2}",
        ResourceKey = "confirmed-move:" + id, Status = PendingStatus.Confirmed, RemoteJson = response, ConfirmedRevision = 1, SendAttempts = 1 };
    private static string DirectEntity(string id, int version) => JsonSerializer.Serialize(new { data = new { id, version } });
    private static string CompositeReceipt(string id, int sourceVersion, int todoVersion) => JsonSerializer.Serialize(new
    {
        data = new
        {
            source = new { id, version = sourceVersion, text = "合成未安排事项", completed = true, deleted_at = "2026-11-04T12:00:00Z" },
            todo = new { id, version = todoVersion, text = "合成未安排事项", completed = true, date = "2026-11-04", deleted_at = (string?)null }
        }
    });
    private static long SentVersion(Api api, string operationId)
    { using var body = JsonDocument.Parse(api.Sent.First(sent => sent.Id == operationId).Body); return body.RootElement.GetProperty("version").GetInt64(); }

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
