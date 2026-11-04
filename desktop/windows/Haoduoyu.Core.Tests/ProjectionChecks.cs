using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

internal static class ProjectionChecks
{
    public static int Run()
    {
        var checks = new (string Name, Action Run)[]
        {
            ("projection creates offline entities without inventing confirmation", OfflineCreate),
            ("canonical review cache answers filtered reordered paged queries", CanonicalReview),
            ("new complete cache prevents receipts and detail resurrection", NoResurrection),
            ("confirmed receipt overlays only older server data", ConfirmedVersions),
            ("unscheduled move updates source and destination date", MoveAcrossDates),
            ("dependent offline todo toggle retains actual version", DependentTodo),
            ("replaced parent projects before its older dependent child", ReplacedParent),
            ("minimal confirmed receipt retains request and marks incomplete", MinimalReceipt),
            ("preferences overlay date list without fake preference version", Preferences),
            ("label intent preserves note hash and server associations", Labels),
            ("memo hierarchy hides group children and permits restoration", MemoHierarchy),
            ("unknown and conflict retain immutable local and remote copies", ConflictAndPurity),
            ("prepared dependency body is displayed without mutating original", PreparedBody),
            ("cached month preserves independent legacy categories", MonthAndDates),
            ("month summaries remain incomplete until full entity is cached", MonthSummaryCompleteness),
            ("malformed collection never proves deletion", PartialResponses),
            ("malformed collection identities never authorize deletion", MalformedCollectionIdentities),
            ("old articles canonical data supports paging and filters", ArticlePaging),
            ("all review resources retain hashes and tombstone filtering", ReviewResources),
            ("AI report canonical pages follow server time and ID ordering", AiReportPaging),
            ("AI report queued replacement and unknown remain honest local creates", AiReportLocalCreate),
            ("AI report raw confirmation requires matching immutable content", AiReportReceipts),
            ("AI report fresh canonical state defeats stale receipt and immutable edits", AiReportCanonicalSafety),
            ("scope-marked cache cannot enter another partition", ScopeIsolation)
        };
        var failed = 0;
        foreach (var check in checks)
        {
            try { check.Run(); Console.WriteLine("PASS " + check.Name); }
            catch (Exception error) { failed++; Console.WriteLine("FAIL " + check.Name + ": " + error.Message); }
        }
        Console.WriteLine($"Projection checks: {checks.Length - failed}/{checks.Length} passed.");
        return failed;
    }

    private static void OfflineCreate()
    {
        var state = NewState();
        state.Outbox.Add(Op("PUT", "/api/v1/note-entries/n1", """{"category":"work","date":"2026-11-05","text":"离线正文","version":0,"save_id":"stable-save","labels":["工作"]}"""));
        var row = Items(Data("/api/v1/note-entries?date=2026-11-05&category=work", state), "entries").Single();
        Equal("离线正文", Text(row, "text")); Equal("Queued", Text(row, "_local_status")); True(Bool(row, "_local_new"));
        Equal("0", Text(row, "version")); True(row["content_hash"] == null); Equal("stable-save", Text(row["_local_request"], "save_id"));
        Equal(0, Items(Data("/api/v1/note-entries?category=life&date=2026-11-05", state), "entries").Count());
    }
    private static void CanonicalReview()
    {
        var state = NewState();
        Cache(state, "/api/v1/review/articles", """{"_local_complete":true,"data":{"items":[{"id":"r1","account":"A","title":"甲","published_at":"2026-11-03","content_hash":"hash-a"},{"id":"r2","account":"B","title":"乙","published_at":"2026-11-04","content_hash":"hash-b"},{"id":"r3","account":"A","title":"丙","published_at":"2026-11-05","content_hash":"hash-c"}],"has_more":false,"read_revision":"7"}}""", 3);
        var data = Data("/api/v1/review/articles?offset=0&account=A", state);
        Equal("r3,r1", string.Join(',', Items(data).Select(r => Text(r, "id"))));
        Equal("hash-c", Text(Items(data).First(), "content_hash")); Equal("7", Text(data, "read_revision"));
        var reversed = Data("/api/v1/review/articles?account=A&offset=0", state);
        Equal(data.ToJsonString(), reversed.ToJsonString());
        var envelope = Project("/api/v1/review/articles?account=A&offset=100", state);
        Equal(0, Items(envelope["data"]!).Count()); True(!Bool(envelope, "_local_incomplete"));
    }
    private static void NoResurrection()
    {
        var state = NewState();
        Cache(state, "/api/v1/review/articles/r1", """{"data":{"id":"r1","account":"A","title":"旧记录","content_hash":"old"}}""", 2);
        Cache(state, "/api/v1/review/articles", """{"_local_complete":true,"data":{"items":[],"has_more":false,"read_revision":"new"}}""", 9);
        state.Outbox.Add(Op("PUT", "/api/v1/review/articles/r1", """{"account":"A","title":"旧确认"}""", PendingStatus.Confirmed) with
        { ConfirmedRevision = 4, RemoteJson = """{"data":{"id":"r1","account":"A","title":"旧确认","content_hash":"old-receipt"}}""" });
        Equal(0, Items(Data("/api/v1/review/articles?account=A&offset=0", state)).Count());
        True(WorkspaceProjection.Project("/api/v1/review/articles/r1", state.Cache["/api/v1/review/articles/r1"], state) == null);
        // Legacy schema-1 receipts without a revision are deliberately not inferred to be newer.
        state.Outbox[0] = state.Outbox[0] with { ConfirmedRevision = 0 };
        Equal(0, Items(Data("/api/v1/review/articles?account=A", state)).Count());
    }
    private static void ConfirmedVersions()
    {
        var state = NewState();
        Cache(state, "/api/v1/todos?date=2026-11-05", """{"data":{"date":"2026-11-05","items":[{"id":"t1","date":"2026-11-05","text":"服务端","completed":false,"version":5}]}}""", 3);
        state.Outbox.Add(Op("PATCH", "/api/v1/todos/t1", """{"version":4,"completed":true}""", PendingStatus.Confirmed) with
        { ConfirmedRevision = 8, RemoteJson = """{"data":{"id":"t1","date":"2026-11-05","completed":true,"version":5}}""" });
        True(Bool(Items(Data("/api/v1/todos?date=2026-11-05", state)).Single(), "completed"));
        Cache(state, "/api/v1/todos?date=2026-11-05", """{"data":{"date":"2026-11-05","items":[{"id":"t1","date":"2026-11-05","text":"较新","completed":false,"version":6}]}}""", 12);
        var latest = Items(Data("/api/v1/todos?date=2026-11-05", state)).Single();
        Equal("6", Text(latest, "version")); True(!Bool(latest, "completed")); Equal("较新", Text(latest, "text"));
    }
    private static void MoveAcrossDates()
    {
        var state = NewState();
        Cache(state, "/api/v1/unscheduled-todos", """{"_local_complete":true,"data":{"items":[{"id":"t1","text":"移动我","completed":false,"version":7}]}}""", 2);
        Cache(state, "/api/v1/todos?date=2026-11-05", """{"data":{"date":"2026-11-05","items":[]}}""", 2);
        state.Outbox.Add(Op("POST", "/api/v1/unscheduled-todos/t1/complete-today", """{"date":"2026-11-05","version":7}"""));
        Equal(0, Items(Data("/api/v1/unscheduled-todos", state)).Count());
        var target = Items(Data("/api/v1/todos?date=2026-11-05", state)).Single();
        Equal("t1", Text(target, "id")); Equal("移动我", Text(target, "text")); True(Bool(target, "completed"));
        True(target["version"] == null); Equal("Queued", Text(target, "_local_status"));
        Equal(0, Items(Data("/api/v1/todos?date=2026-11-06", state)).Count());
    }
    private static void DependentTodo()
    {
        var state = NewState();
        var parent = Op("POST", "/api/v1/todos", """{"id":"t1","date":"2026-11-05","text":"新建后勾选"}""");
        state.Outbox.Add(parent);
        state.Outbox.Add(Op("PATCH", "/api/v1/todos/t1", """{"completed":true}""", at: 2) with
        { ResourceKey = "/local/todo-after-create/t1", DependencyIds = [parent.Id], VersionFromDependencyId = parent.Id });
        var row = Items(Data("/api/v1/todos?date=2026-11-05", state)).Single();
        True(Bool(row, "completed")); Equal("新建后勾选", Text(row, "text")); True(row["version"] == null); True(Bool(row, "_local_new"));
        state.Outbox[0] = parent with { Status = PendingStatus.Confirmed, ConfirmedRevision = 3,
            RemoteJson = """{"data":{"id":"t1","date":"2026-11-05","text":"新建后勾选","completed":false,"version":11}}""" };
        row = Items(Data("/api/v1/todos?date=2026-11-05", state)).Single();
        Equal("11", Text(row, "version")); True(Bool(row, "completed"));
    }
    private static void Preferences()
    {
        var state = NewState();
        Cache(state, "/api/v1/todos?date=2026-11-05", """{"data":{"date":"2026-11-05","completed_mode":"hide","preferences_version":8,"items":[]}}""", 1);
        Cache(state, "/api/v1/todo-preferences", """{"data":{"completed_mode":"hide","version":8}}""", 1);
        state.Outbox.Add(Op("PUT", "/api/v1/todo-preferences", """{"completed_mode":"bottom","version":8}"""));
        var data = Data("/api/v1/todos?date=2026-11-05", state);
        Equal("bottom", Text(data, "completed_mode")); Equal("8", Text(data, "preferences_version")); Equal("Queued", Text(data, "_local_preference_status"));
    }
    private static void ReplacedParent()
    {
        var state = NewState();
        var original = Op("POST", "/api/v1/todos", """{"id":"t1","date":"2026-11-05","text":"旧标题"}""");
        var replacement = Op("POST", "/api/v1/todos", """{"id":"t1","date":"2026-11-05","text":"替换后标题"}""", at: 3);
        var child = Op("PATCH", "/api/v1/todos/t1", """{"completed":true}""", at: 2) with
        { DependencyIds = [original.Id], VersionFromDependencyId = original.Id, ResourceKey = "/local/todo-after-create/t1" };
        state.Outbox.Add(original with { Status = PendingStatus.Superseded, SupersededById = replacement.Id });
        state.Outbox.Add(child); state.Outbox.Add(replacement);
        var row = Items(Data("/api/v1/todos?date=2026-11-05", state)).Single();
        True(Bool(row, "completed")); True(Bool(row, "_local_new")); Equal("替换后标题", Text(row, "text")); Equal(child.Id, Text(row, "_operation_id"));
        True(row["version"] == null);
    }
    private static void MinimalReceipt()
    {
        var state = NewState();
        state.Outbox.Add(Op("PUT", "/api/v1/memos/notes/m1", """{"group_id":"g1","title":"本地标题","body":"本地正文","version":0,"save_id":"stable"}""", PendingStatus.Confirmed) with
        { ConfirmedRevision = 3, RemoteJson = """{"data":{"id":"m1","version":7}}""" });
        var row = Data("/api/v1/memos/notes/m1", state);
        Equal("本地正文", Text(row, "body")); Equal("本地标题", Text(row, "title")); Equal("7", Text(row, "version"));
        True(Bool(row, "_local_receipt_only")); True(Bool(row, "_local_incomplete"));
        Equal("stable", Text(row["_local_request"], "save_id")); True(row["content_hash"] == null);
    }
    private static void Labels()
    {
        var state = NewState();
        Cache(state, "/api/v1/note-entries/labels", """{"_local_complete":true,"data":{"labels":[{"name":"生活"},{"name":"临时"}],"archived_labels":[],"labels_version":3}}""", 1);
        Cache(state, "/api/v1/note-entries?category=life&date=2026-11-05", """{"data":{"date":"2026-11-05","category":"life","entries":[{"id":"n1","date":"2026-11-05","category":"life","text":"原文","version":9,"content_hash":"server-hash","labels":["生活","临时"]}],"labels_version":3}}""", 1);
        state.Outbox.Add(Op("POST", "/api/v1/note-entries/labels", """{"name":"临时","action":"delete","save_id":"same"}"""));
        Equal("生活", Text(Items(Data("/api/v1/note-entries/labels", state), "labels").Single(), "name"));
        var row = Items(Data("/api/v1/note-entries?date=2026-11-05&category=life", state), "entries").Single();
        Equal("server-hash", Text(row, "content_hash")); Equal("9", Text(row, "version")); Equal(2, row["labels"]!.AsArray().Count); Equal("生活", row["_local_labels"]![0]!.ToString());
        state.Outbox.Add(Op("POST", "/api/v1/note-entries/labels", """{"name":"生活","action":"archive","save_id":"archive"}""", at: 2));
        Equal("生活", Text(Items(Data("/api/v1/note-entries/labels", state), "archived_labels").Single(), "name"));
    }
    private static void MemoHierarchy()
    {
        var state = NewState();
        var create = Op("PUT", "/api/v1/memos/groups/g1", """{"title":"离线组","version":0,"position":0,"save_id":"g"}""");
        state.Outbox.Add(create);
        state.Outbox.Add(Op("PUT", "/api/v1/memos/notes/m1", """{"group_id":"g1","title":"离线笔记","body":"中文正文","version":0,"position":0,"save_id":"m"}""", at: 2) with { DependencyIds = [create.Id] });
        Equal(1, Items(Data("/api/v1/memos", state), "notes").Count());
        Equal("中文正文", Text(Data("/api/v1/memos/notes/m1", state), "body"));
        state.Outbox.Add(Op("DELETE", "/api/v1/memos/groups/g1", """{"version":0,"confirm_title":"离线组","confirm_note_count":1,"save_id":"d"}""", at: 3));
        var deleted = Data("/api/v1/memos", state); Equal(1, Items(deleted, "groups").Count()); Equal(0, Items(deleted, "notes").Count());
        True(Bool(Data("/api/v1/memos/notes/m1", state), "_local_parent_deleted"));
        state.Outbox.Add(Op("POST", "/api/v1/memos/groups/g1/restore", """{"version":0,"save_id":"r"}""", at: 4));
        Equal(1, Items(Data("/api/v1/memos", state), "notes").Count());
    }
    private static void ConflictAndPurity()
    {
        var state = NewState();
        Cache(state, "/api/v1/note-entries/n1", """{"data":{"id":"n1","date":"2026-11-05","category":"life","text":"云端正文","version":4,"content_hash":"real-hash","labels":["生活"]}}""", 2);
        var operation = Op("PUT", "/api/v1/note-entries/n1", """{"category":"life","date":"2026-11-05","text":"冲突本地","version":3,"save_id":"unchanged"}""", PendingStatus.Conflict) with
        { RemoteJson = """{"error":{"code":"VERSION_CONFLICT"},"request_id":"synthetic"}""" };
        state.Outbox.Add(operation); state.Drafts["/api/v1/note-entries/n1"] = new() { Key = "/api/v1/note-entries/n1", Text = "未发送稿" };
        var before = JsonSerializer.Serialize(state);
        var row = Data("/api/v1/note-entries/n1", state);
        Equal("冲突本地", Text(row, "text")); Equal("云端正文", Text(row["_local_remote"], "text")); Equal("real-hash", Text(row, "content_hash")); Equal("4", Text(row, "version"));
        Equal("unchanged", Text(row["_local_request"], "save_id")); Equal(operation.Id, Text(row, "_operation_id"));
        Equal(before, JsonSerializer.Serialize(state));
        state.Outbox[0] = operation with { Status = PendingStatus.Unknown };
        Equal("Unknown", Text(Data("/api/v1/note-entries/n1", state), "_local_status"));
    }
    private static void PreparedBody()
    {
        var state = NewState();
        state.Outbox.Add(Op("PATCH", "/api/v1/todos/t1", """{"completed":false}""", PendingStatus.Unknown) with
        { PreparedBodyJson = """{"completed":true,"version":12}""", VersionFromDependencyId = "parent" });
        var row = Data("/api/v1/todos/t1", state); True(Bool(row, "completed")); Equal("12", Text(row["_local_request"], "version"));
        Equal("""{"completed":false}""", state.Outbox[0].BodyJson);
    }
    private static void MonthAndDates()
    {
        var state = NewState();
        Cache(state, "/api/v1/note-entries/month?month=2026-11", """{"data":{"format":"haoduoyu-note-month-v1","month":"2026-11","complete":true,"labels_version":3,"days":[{"date":"2026-11-05","items":[{"entity_id":"legacy-life:2026-11-05","source":"legacy_daily_note","category":"life","text":"生活日页"},{"entity_id":"legacy-work:2026-11-05","source":"legacy_daily_note","category":"work","text":"工作日页"},{"entity_id":"note-entry:n1","source":"note_entry","category":"life","text":"记录"}]}]}}""", 1);
        var data = Data("/api/v1/note-entries/month?month=2026-11", state);
        Equal(3, data["days"]![0]!["items"]!.AsArray().Count); True(Bool(data, "complete"));
        state.Outbox.Add(Op("PUT", "/api/v1/daily-notes/2026-11-05?category=work", """{"text":"新工作日页","version":2,"save_id":"s"}"""));
        var items = Items(Data("/api/v1/note-entries/month?month=2026-11", state)["days"]![0]!, "items").ToArray();
        Equal("新工作日页", Text(items.Single(r => Text(r, "entity_id") == "legacy-work:2026-11-05"), "text"));
        Equal("生活日页", Text(items.Single(r => Text(r, "entity_id") == "legacy-life:2026-11-05"), "text"));
        Equal("2026-11-05", Data("/api/v1/daily-notes/dates?category=work", state)["dates"]![0]!.ToString());
    }
    private static void PartialResponses()
    {
        var state = NewState();
        Cache(state, "/api/v1/memos/notes/m1", """{"data":{"id":"m1","group_id":"g1","title":"保留","body":"正文","version":4}}""", 1);
        Cache(state, "/api/v1/memos", """{"_local_complete":true,"data":{}}""", 8);
        Equal("正文", Text(Data("/api/v1/memos/notes/m1", state), "body"));
        var projected = Project("/api/v1/memos", state); Equal(1, Items(projected["data"]!, "notes").Count()); True(Bool(projected, "_local_incomplete"));
        Cache(state, "/api/v1/memos/notes/m1", """{"data":{}}""", 9);
        True(WorkspaceProjection.Project("/api/v1/memos/notes/m1", state.Cache["/api/v1/memos/notes/m1"], state) == null);
    }
    private static void MonthSummaryCompleteness()
    {
        const string month = """{"data":{"format":"haoduoyu-note-month-v1","month":"2026-11","complete":true,"days":[{"date":"2026-11-05","items":[{"entity_id":"note-entry:n1","category":"life","text":"摘要正文"},{"entity_id":"legacy-life:2026-11-05","category":"life","text":"日页摘要"}]}]}}""";
        var state = NewState(); Cache(state, "/api/v1/note-entries/month?month=2026-11", month, 3);
        var detail = Project("/api/v1/note-entries/n1", state);
        True(Bool(detail, "_local_incomplete")); True(Bool(detail["data"], "_local_incomplete"));
        True(detail["data"]!["version"] == null); True(detail["data"]!["content_hash"] == null);
        True(Bool(Items(Data("/api/v1/note-entries?date=2026-11-05&category=life", state), "entries").Single(), "_local_incomplete"));
        True(Bool(Data("/api/v1/daily-notes?category=life&date=2026-11-05", state), "_local_incomplete"));
        // Cache enumeration order must not let a same-download summary erase a complete CAS entity.
        var complete = NewState();
        Cache(complete, "/api/v1/note-entries/n1", """{"data":{"id":"n1","category":"life","date":"2026-11-05","text":"摘要正文","version":8,"content_hash":"actual-hash"}}""", 3);
        Cache(complete, "/api/v1/note-entries/month?month=2026-11", month, 3);
        var full = Project("/api/v1/note-entries/n1", complete);
        True(!Bool(full, "_local_incomplete")); True(!Bool(full["data"], "_local_incomplete"));
        Equal("8", Text(full["data"], "version")); Equal("actual-hash", Text(full["data"], "content_hash"));
    }
    private static void MalformedCollectionIdentities()
    {
        foreach (var malformed in new[] { "[{}]", "[{\"id\":null}]", "[{\"id\":17}]", "[{\"id\":\" \"}]", "[{\"id\":\"dup\"},{\"id\":\"dup\"}]", "[null]", "[\"invalid\"]" })
        {
            var state = NewState();
            Cache(state, "/api/v1/review/articles/r1", """{"data":{"id":"r1","account":"A","title":"已知正文","content_hash":"known-hash"}}""", 1);
            Cache(state, "/api/v1/review/articles", "{\"_local_complete\":true,\"data\":{\"items\":" + malformed + ",\"has_more\":false}}", 9);
            var view = Project("/api/v1/review/articles?account=A", state);
            Equal("已知正文", Text(Items(view["data"]!).Single(), "title")); True(Bool(view, "_local_incomplete"));
        }
        var memos = NewState();
        Cache(memos, "/api/v1/memos/notes/m1", """{"data":{"id":"m1","group_id":"g1","title":"保留笔记","body":"不可因残缺集合消失","version":5}}""", 1);
        Cache(memos, "/api/v1/memos", """{"_local_complete":true,"data":{"groups":[],"notes":[{}]}}""", 9);
        var memoView = Project("/api/v1/memos", memos);
        Equal("m1", Text(Items(memoView["data"]!, "notes").Single(), "id")); True(Bool(memoView, "_local_incomplete"));
        var todos = NewState();
        Cache(todos, "/api/v1/unscheduled-todos/t1", """{"data":{"id":"t1","text":"保留待办","version":4,"completed":false}}""", 1);
        Cache(todos, "/api/v1/unscheduled-todos", """{"data":{"items":[{}]}}""", 9);
        Equal("t1", Text(Items(Data("/api/v1/unscheduled-todos", todos)).Single(), "id"));
    }
    private static void ArticlePaging()
    {
        var state = NewState();
        var rows = new JsonArray(Enumerable.Range(0, 6).Select(i => (JsonNode?)new JsonObject { ["id"] = "a" + i, ["title"] = "标题" + i, ["account_id"] = i % 2 == 0 ? "A" : "B", ["status"] = "draft", ["published_at"] = $"2026-11-{i + 1:00}", ["version"] = 7 }).ToArray());
        Cache(state, "/api/v1/articles", new JsonObject { ["_local_complete"] = true, ["data"] = rows, ["meta"] = new JsonObject { ["total"] = 6 } }.ToJsonString(), 4);
        var data = Data("/api/v1/articles?status=draft&account_id=A&page=2&page_size=2", state);
        Equal(1, Items(data).Count()); Equal("a0", Text(Items(data).Single(), "id")); True(!Bool(data, "has_more"));
        Equal(6, Data("/api/v1/articles", state).AsArray().Count);
    }
    private static void ReviewResources()
    {
        var state = NewState();
        foreach (var kind in new[] { "articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health" })
        {
            Cache(state, "/api/v1/review/" + kind, """{"_local_complete":true,"data":{"items":[{"id":"r1","account":"A","title":"原内容","content_hash":"known","version":3},{"id":"trash","account":"A","deleted_at":"2026-11-01","content_hash":"trash-hash"}],"has_more":false}}""", 1);
            state.Outbox.Add(Op("PATCH", "/api/v1/review/" + kind + "/r1", """{"title":"本地修改","expected_hash":"known"}""", PendingStatus.Blocked));
            var row = Items(Data("/api/v1/review/" + kind + "?account=A", state)).Single();
            Equal("本地修改", Text(row, "title")); Equal("known", Text(row, "content_hash")); Equal("3", Text(row, "version")); Equal("Blocked", Text(row, "_local_status"));
            Equal(2, Items(Data("/api/v1/review/" + kind + "?include_deleted=1", state)).Count());
        }
    }
    private static void ScopeIsolation()
    {
        var state = NewState();
        Cache(state, "/api/v1/unscheduled-todos", """{"_local_scope_id":"another-user","data":{"items":[{"id":"foreign"}]}}""", 1);
        try { _ = Data("/api/v1/unscheduled-todos", state); throw new Exception("foreign partition accepted"); }
        catch (InvalidDataException) { }
        var blank = new WorkspaceState();
        try { _ = WorkspaceProjection.Project("/api/v1/unscheduled-todos", null, blank); throw new Exception("blank partition accepted"); }
        catch (InvalidDataException) { }
    }

    private static void AiReportPaging()
    {
        var state = NewState(); Cache(state, "/api/v1/ai-reports", AiReportCanonical(), 8);
        var original = state.Cache["/api/v1/ai-reports"];
        var first = Data("/api/v1/ai-reports?offset=0", state);
        var second = Data("/api/v1/ai-reports?offset=100", state);
        var third = Data("/api/v1/ai-reports?offset=200", state);
        Equal(100, Items(first).Count()); Equal(100, Items(second).Count()); Equal(5, Items(third).Count());
        // The newest timestamp belongs to the smallest ID; timestamp must dominate ID ordering.
        Equal(ReportId(0), Text(Items(first).First(), "id"));
        Equal(string.Join(',', new[] { 0, 3, 2, 1, 6, 5, 4 }.Select(ReportId)), string.Join(',', Items(first).Take(7).Select(row => Text(row, "id"))));
        Equal(ReportId(102), Text(Items(second).First(), "id"));
        Equal(string.Join(',', new[] { 200, 199, 204, 203, 202 }.Select(ReportId)), string.Join(',', Items(third).Select(row => Text(row, "id"))));
        True(Bool(first, "has_more")); True(Bool(second, "has_more")); True(!Bool(third, "has_more"));
        var ids = new[] { first, second, third }.SelectMany(page => Items(page).Select(row => Text(row, "id"))).ToArray();
        Equal(205, ids.Distinct(StringComparer.Ordinal).Count());
        Equal(original, state.Cache["/api/v1/ai-reports"]);
        Equal(205, JsonNode.Parse(original)!["data"]!["items"]!.AsArray().Count);
    }
    private static void AiReportLocalCreate()
    {
        var state = NewState(); Cache(state, "/api/v1/ai-reports", AiReportCanonical(), 8);
        var path = "/api/v1/ai-reports/" + ReportId(9001);
        var old = Op("PUT", path, """{"author":"初稿署名","content":"旧本地稿"}""");
        var replacement = Op("PUT", path, """{"author":"合成署名","content":"修改后的真实工作内容"}""", at: 2);
        state.Outbox.Add(old with { Status = PendingStatus.Superseded, SupersededById = replacement.Id });
        state.Outbox.Add(replacement);
        var before = JsonSerializer.Serialize(state);
        var row = Items(Data("/api/v1/ai-reports?offset=0", state)).First();
        Equal(ReportId(9001), Text(row, "id")); Equal("修改后的真实工作内容", Text(row, "content")); Equal("合成署名", Text(row, "author"));
        Equal(replacement.Id, Text(row, "_operation_id")); Equal("Queued", Text(row, "_local_status")); True(Bool(row, "_local_new"));
        True(Text(row, "_local_created_at").Length > 0); NoInventedReportReceipt(row);
        Equal(before, JsonSerializer.Serialize(state));
        var remote = new JsonObject { ["id"] = ReportId(9001), ["author"] = "待核实远端署名", ["content"] = "待核实远端正文", ["created_at"] = "2026-11-04T00:00:03.456Z" };
        state.Outbox[1] = replacement with { Status = PendingStatus.Unknown, RemoteJson = new JsonObject { ["data"] = remote }.ToJsonString() };
        var unknownBefore = JsonSerializer.Serialize(state);
        row = Items(Data("/api/v1/ai-reports?offset=0", state)).First();
        Equal(ReportId(9001), Text(row, "id")); Equal("Unknown", Text(row, "_local_status")); True(Bool(row, "_local_new"));
        Equal("修改后的真实工作内容", Text(row, "content")); Equal("修改后的真实工作内容", Text(row["_local_request"], "content"));
        Equal("待核实远端正文", Text(row["_local_remote"], "content")); Equal(replacement.Id, Text(row, "_operation_id")); NoInventedReportReceipt(row);
        Equal(unknownBefore, JsonSerializer.Serialize(state)); Equal(replacement.BodyJson, state.Outbox[1].BodyJson);
    }
    private static void AiReportReceipts()
    {
        var state = NewState(); var path = "/api/v1/ai-reports/" + ReportId(9100);
        var operation = Op("PUT", path, """{"author":"合成署名","content":"确认的工作正文"}""", PendingStatus.Confirmed) with { ConfirmedRevision = 4 };
        const string created = "2026-11-04T01:02:03.456Z";
        var receipt = new JsonObject { ["id"] = ReportId(9100), ["author"] = "合成署名", ["content"] = "确认的工作正文", ["created_at"] = created };
        state.Outbox.Add(operation with { RemoteJson = new JsonObject { ["data"] = receipt }.ToJsonString() });
        var row = Items(Data("/api/v1/ai-reports?offset=0", state)).Single();
        True(Bool(row, "_local_confirmed_preview")); Equal("Confirmed", Text(row, "_local_status")); Equal(created, Text(row, "created_at"));
        Equal("确认的工作正文", Text(row, "content")); True(!Bool(row, "_local_incomplete")); True(row["content_hash"] == null); True(row["version"] == null);
        var originalReceipt = state.Outbox[0].RemoteJson;
        _ = Project("/api/v1/ai-reports?offset=0", state); Equal(originalReceipt, state.Outbox[0].RemoteJson);
        var wrong = new JsonObject { ["id"] = ReportId(9100), ["author"] = "合成署名", ["content"] = "不匹配的远端正文", ["created_at"] = created };
        state.Outbox[0] = operation with { RemoteJson = new JsonObject { ["data"] = wrong }.ToJsonString() };
        row = Items(Data("/api/v1/ai-reports?offset=0", state)).Single();
        True(Bool(row, "_local_incomplete")); True(!Bool(row, "_local_confirmed_preview"));
        Equal("确认的工作正文", Text(row, "content")); Equal("确认的工作正文", Text(row["_local_request"], "content")); Equal("不匹配的远端正文", Text(row["_local_remote"], "content"));
        True(row["content_hash"] == null); True(row["version"] == null);
    }
    private static void AiReportCanonicalSafety()
    {
        var state = NewState(); var kept = ReportId(9200); var removed = ReportId(9201);
        var raw = new JsonObject { ["id"] = kept, ["author"] = "真实服务端署名", ["content"] = "真实服务端正文", ["created_at"] = "2026-11-04T01:02:03.456Z", ["content_hash"] = new string('a', 64) };
        Cache(state, "/api/v1/ai-reports", new JsonObject { ["_local_complete"] = true, ["data"] = new JsonObject { ["items"] = new JsonArray(raw), ["has_more"] = false } }.ToJsonString(), 12);
        var oldRow = new JsonObject { ["id"] = removed, ["author"] = "旧署名", ["content"] = "已删除正文", ["created_at"] = "2026-11-03T01:02:03.456Z", ["content_hash"] = new string('b', 64) };
        Cache(state, "/api/v1/ai-reports?offset=0", new JsonObject { ["data"] = new JsonObject { ["items"] = new JsonArray(oldRow), ["has_more"] = false } }.ToJsonString(), 2);
        state.Outbox.Add(Op("PUT", "/api/v1/ai-reports/" + removed, """{"author":"旧署名","content":"已删除正文"}""", PendingStatus.Confirmed) with
        { ConfirmedRevision = 4, RemoteJson = new JsonObject { ["data"] = oldRow.DeepClone() }.ToJsonString() });
        state.Outbox.Add(Op("PUT", "/api/v1/ai-reports/" + kept, """{"author":"旧署名","content":"旧回执正文"}""", PendingStatus.Confirmed) with
        { ConfirmedRevision = 4, RemoteJson = new JsonObject { ["data"] = new JsonObject { ["id"] = kept, ["author"] = "旧署名", ["content"] = "旧回执正文", ["created_at"] = "2026-11-01T00:00:00.123Z" } }.ToJsonString() });
        var row = Items(Data("/api/v1/ai-reports?offset=0", state)).Single();
        Equal(kept, Text(row, "id")); Equal("真实服务端正文", Text(row, "content")); Equal(new string('a', 64), Text(row, "content_hash")); True(!Bool(row, "_local_confirmed_preview"));
        var attempt = Op("PUT", "/api/v1/ai-reports/" + kept, """{"author":"改写尝试署名","content":"不得覆盖已存在正文"}""", at: 2);
        state.Outbox.Add(attempt);
        var immutableView = Data("/api/v1/ai-reports?offset=0", state);
        row = Items(immutableView).Single(); Equal("真实服务端署名", Text(row, "author")); Equal("真实服务端正文", Text(row, "content")); Equal(new string('a', 64), Text(row, "content_hash"));
        True(Bool(row, "_local_immutable_conflict")); Equal("不得覆盖已存在正文", Text(row["_local_request"], "content")); Equal(attempt.Id, Text(row, "_operation_id"));
        var beforeDelete = immutableView.ToJsonString();
        state.Outbox.Add(Op("DELETE", "/api/v1/ai-reports/" + kept, """{"expected_hash":"synthetic-only","save_id":"unsupported-delete"}""", at: 3));
        state.Outbox.Add(Op("DELETE", "/api/v1/ai-reports/" + removed, "{}", at: 4));
        Equal(beforeDelete, Data("/api/v1/ai-reports?offset=0", state).ToJsonString());
        Equal(1, JsonNode.Parse(state.Cache["/api/v1/ai-reports"])!["data"]!["items"]!.AsArray().Count);
    }

    private static string ReportId(int number) => "00000000-0000-4000-8000-" + number.ToString("D12");
    private static string AiReportCanonical()
    {
        var epoch = DateTimeOffset.Parse("2026-11-03T00:00:00Z");
        var rows = new JsonArray(Enumerable.Range(0, 205).Select(i => (JsonNode?)new JsonObject
        {
            ["id"] = ReportId(204 - i), ["author"] = "合成服务端署名", ["content"] = "合成服务端工作内容" + i,
            ["created_at"] = epoch.AddSeconds(i / 3).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"), ["content_hash"] = i.ToString("x64")
        }).ToArray());
        return new JsonObject { ["_local_complete"] = true, ["data"] = new JsonObject { ["items"] = rows, ["has_more"] = false } }.ToJsonString();
    }
    private static void NoInventedReportReceipt(JsonObject row)
    { True(!row.ContainsKey("created_at")); True(!row.ContainsKey("content_hash")); True(!row.ContainsKey("version")); }

    private static WorkspaceState NewState() => new() { ScopeId = "synthetic-partition", LocalRevision = 20 };
    private static void Cache(WorkspaceState state, string path, string json, long revision)
    { state.Cache[path] = json; state.CacheRevisions[path] = revision; }
    private static PendingOperation Op(string method, string path, string body, PendingStatus status = PendingStatus.Queued, int at = 1) => new()
    { Method = method, Path = path, ResourceKey = path, BodyJson = body, Status = status, CreatedAt = DateTimeOffset.Parse("2026-11-04T00:00:00Z").AddSeconds(at) };
    private static JsonObject Project(string path, WorkspaceState state) => JsonNode.Parse(WorkspaceProjection.Project(path, state.Cache.GetValueOrDefault(path), state)
        ?? throw new Exception("projection unexpectedly unavailable: " + path))!.AsObject();
    private static JsonNode Data(string path, WorkspaceState state) => Project(path, state)["data"] ?? throw new Exception("missing data");
    private static IEnumerable<JsonObject> Items(JsonNode data, string name = "items") => (data[name] as JsonArray ?? throw new Exception("missing " + name)).OfType<JsonObject>();
    private static string Text(JsonNode? node, string name) => node?[name]?.ToString() ?? "";
    private static bool Bool(JsonNode? node, string name) => Text(node, name) is "true" or "True";
    private static void True(bool condition) { if (!condition) throw new Exception("condition was false"); }
    private static void Equal<T>(T expected, T actual) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"expected {expected}, actual {actual}"); }
}
