using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); checks++; }
void Reject(Action action, string message)
{ try { action(); } catch (Exception error) when (error is InvalidDataException or ArgumentException) { checks++; return; } throw new InvalidOperationException(message); }
const string Scope = "synthetic-template-owner";
const string Stamp = "2026-11-07T02:00:00.000Z";
const string Today = "2026-11-07";
const string TodoPath = "/api/v1/todos?date=2026-11-07";
const long MaxSafe = 9_007_199_254_740_991;
string Id(int n) => "00000000-0000-4000-8000-" + n.ToString("D12", CultureInfo.InvariantCulture);
string Path(int n) => "/api/v1/todo-templates/" + Id(n);
JsonObject Record(int n, bool archived = false, long version = 1, bool explicitNull = false) => new()
{
    ["id"] = Id(n), ["text"] = "同名常用事项😀", ["version"] = version, ["created_at"] = Stamp, ["updated_at"] = Stamp,
    ["completed_days"] = 21, ["habit_status"] = "habit", ["archived_at"] = archived ? JsonValue.Create(Stamp) : null,
    ["future_metadata"] = new JsonObject { ["zero"] = 0, ["unknown"] = new JsonArray("保留😀", null, false) }
};
JsonObject Active(int n, long version = 1) { var value = Record(n, version: version); value.Remove("archived_at"); return value; }
JsonObject Envelope(JsonObject data) => new() { ["data"] = data, ["_local_scope_id"] = Scope };
string List(bool archived, params JsonObject[] rows) => Envelope(new JsonObject { ["today"] = Today, ["window_start"] = "2026-10-09",
    ["items"] = new JsonArray(rows.Select(row => (JsonNode?)row).ToArray()) }).ToJsonString();
WorkspaceState State(bool reverse = false)
{
    var cache = new Dictionary<string, string>();
    if (reverse) { cache[TemplateArchive.ListPath(true)] = List(true, Record(3, true)); cache[TemplateArchive.ListPath(false)] = List(false, Active(1), Active(2)); }
    else { cache[TemplateArchive.ListPath(false)] = List(false, Active(1), Active(2)); cache[TemplateArchive.ListPath(true)] = List(true, Record(3, true)); }
    return new() { ScopeId = Scope, LocalRevision = 50, Cache = cache, CacheRevisions = new() { [TemplateArchive.ListPath(false)] = 1, [TemplateArchive.ListPath(true)] = 2 } };
}
JsonObject[] Items(JsonObject? root) => root?["data"]?["items"] is JsonArray rows ? rows.Select(row => row!.AsObject()).ToArray() : [];
JsonObject Project(bool archived, WorkspaceState state) => TemplateArchive.ProjectList(archived, state) ?? throw new InvalidOperationException("missing preview");
PendingOperation Action(int n, string action, PendingStatus status = PendingStatus.Queued, long version = 1) => new()
{
    Id = "synthetic-" + n + "-" + action, ResourceKey = Path(n), Path = Path(n) + "/" + action, Method = "POST",
    BodyJson = new JsonObject { ["version"] = version }.ToJsonString(), Status = status, CreatedAt = DateTimeOffset.Parse(Stamp, CultureInfo.InvariantCulture)
};
JsonObject Todo(int templateId = 1, bool? active = true, long templateVersion = 1)
{
    var row = new JsonObject { ["id"] = Id(100), ["date"] = Today, ["text"] = "历史正文不得改写", ["note"] = "历史备注",
        ["completed"] = true, ["version"] = 8, ["created_at"] = Stamp, ["updated_at"] = Stamp, ["deleted_at"] = null,
        ["template_id"] = Id(templateId), ["template_version"] = templateVersion };
    if (active != null) row["template_active"] = active.Value; return row;
}
void AddTodo(WorkspaceState state, JsonObject row, long revision = 1)
{
    state.Cache[TodoPath] = Envelope(new JsonObject { ["date"] = Today, ["items"] = new JsonArray(row) }).ToJsonString(); state.CacheRevisions[TodoPath] = revision;
}
JsonObject TodoPreview(WorkspaceState state) => JsonNode.Parse(WorkspaceProjection.Project(TodoPath, state.Cache[TodoPath], state)!)!["data"]!["items"]![0]!.AsObject();

Check(!TemplateArchive.ParseListPath(TemplateArchive.ListPath(false)) && TemplateArchive.ParseListPath(TemplateArchive.ListPath(true)), "canonical list paths failed");
foreach (var path in new[] { "/api/v1/todo-templates?", "/api/v1/todo-templates?archived=0", "/api/v1/todo-templates?archived=true", "/api/v1/todo-templates?archived=1&archived=1", "/api/v1/todo-templates?archived=1&page=1" })
    Reject(() => TemplateArchive.ParseListPath(path), "invalid archive query accepted");
var source = List(false, Active(1)); var parsed = TemplateArchive.ParseList(TemplateArchive.ListPath(false), source, Scope);
Check(parsed.Today.ToString("yyyy-MM-dd") == Today && parsed.WindowStart == new DateOnly(2026, 10, 9) && !parsed.Archived && parsed.Items.Count == 1,
    "source list window or scope lost");
Check(!parsed.Items[0].ContainsKey("archived_at") && parsed.Items[0]["future_metadata"]!["unknown"]![0]!.GetValue<string>() == "保留😀", "active omission or unknown metadata was changed");
parsed.Items[0]["text"] = "detached"; parsed.Data["items"]!.AsArray().Clear();
Check(parsed.Items.Count == 1 && parsed.Items[0]["text"]!.GetValue<string>() != "detached", "parsed list exposed shared mutable nodes");
TemplateArchive.ValidateRecord(Record(1), false, true); TemplateArchive.ValidateRecord(Record(1, true, MaxSafe), true, true); checks++;
void Bad(Action<JsonObject> change, string message)
{ var root = JsonNode.Parse(source)!.AsObject(); change(root); Reject(() => TemplateArchive.ParseList(TemplateArchive.ListPath(false), root.ToJsonString(), Scope), message); }
Bad(root => root["_local_scope_id"] = "foreign", "foreign source scope accepted");
Bad(root => root["_local_projection"] = true, "projected source claimed full archive list");
Bad(root => root["data"]!["window_start"] = "2026-10-10", "incorrect statistics window accepted");
Bad(root => root["data"]!["items"]!.AsArray().Add(Active(1)), "duplicate UUID accepted");
Bad(root => root["data"]!["items"]![0]!["archived_at"] = Stamp, "archived source entered active list");
Bad(root => root["data"]!["items"]![0]!["version"] = 0, "zero version accepted as server entity");
Bad(root => root["data"]!["items"]![0]!["version"] = MaxSafe + 1, "unsafe response version accepted");
Bad(root => root["data"]!["items"]![0]!["completed_days"] = 31, "out-of-window completed days accepted");
Bad(root => root["data"]!["items"]![0]!["habit_status"] = "todo", "contradictory habit status accepted");
Bad(root => root["data"]!["items"]![0]!["created_at"] = null, "missing creation time accepted");
Bad(root => root["data"]!["items"]![0]!["deleted_at"] = null, "soft delete shape mixed into archive source");
Bad(root => root["data"]!["items"]![0]!["id"] = "00000000-0000-0000-0000-000000000001", "invalid UUID variant/version accepted");
Reject(() => TemplateArchive.ValidateRecord(Active(1), false, true), "restore receipt without explicit null accepted");
Reject(() => TemplateArchive.ParseList(TemplateArchive.ListPath(true), List(true, Active(1)), Scope), "archive list accepted missing timestamp");
Reject(() => TemplateArchive.ParseList(TemplateArchive.ListPath(false), source.Replace("\"version\":1", "\"version\":1,\"version\":1", StringComparison.Ordinal)), "duplicate JSON key accepted");

foreach (var reverse in new[] { false, true })
{
    var state = State(reverse); var before = JsonSerializer.Serialize(state);
    Check(Items(Project(false, state)).Select(row => row["id"]!.GetValue<string>()).Order().SequenceEqual(new[] { Id(1), Id(2) }), "archive authority erased active templates");
    Check(Items(Project(true, state)).Single()["id"]!.GetValue<string>() == Id(3), "active authority erased archived template");
    Check(!Project(false, state)["_local_incomplete"]!.GetValue<bool>() && !Project(true, state)["_local_incomplete"]!.GetValue<bool>(), "separate full baselines lost completeness");
    Check(JsonSerializer.Serialize(state) == before, "preview changed original state");
}
var onlyActive = State(); onlyActive.Cache.Remove(TemplateArchive.ListPath(true));
Check(TemplateArchive.ProjectList(true, onlyActive)?["_local_incomplete"]?.GetValue<bool>() != false, "active cache incorrectly proves archived list completeness");
var snapshot = State(); var activeSnapshot = JsonNode.Parse(List(false))!.AsObject(); activeSnapshot["_local_complete"] = true;
snapshot.Cache[TemplateArchive.ListPath(false)] = activeSnapshot.ToJsonString(); snapshot.CacheRevisions[TemplateArchive.ListPath(false)] = 999;
Check(Items(Project(true, snapshot)).Single()["id"]!.GetValue<string>() == Id(3), "active snapshot absence deleted archived template");
var moved = State(); moved.Cache[TemplateArchive.ListPath(true)] = List(true, Record(1, true, 2)); moved.CacheRevisions[TemplateArchive.ListPath(false)] = 999;
Check(!Items(Project(false, moved)).Any(row => row["id"]!.GetValue<string>() == Id(1)) && Items(Project(true, moved)).Any(row => row["id"]!.GetValue<string>() == Id(1)),
    "newer archive version lost to a later active cache revision");
var partial = State(); partial.Cache[Path(1)] = Envelope(Active(1)).ToJsonString(); partial.CacheRevisions[Path(1)] = 1;
var partialActive = JsonNode.Parse(List(false))!.AsObject(); partialActive["_local_incomplete"] = true;
partial.Cache[TemplateArchive.ListPath(false)] = partialActive.ToJsonString(); partial.CacheRevisions[TemplateArchive.ListPath(false)] = 100;
Check(Items(Project(false, partial)).Any(row => row["id"]!.GetValue<string>() == Id(1)) && Project(false, partial)["_local_incomplete"]!.GetValue<bool>(), "partial cache became deletion authority");

foreach (var status in new[] { PendingStatus.Queued, PendingStatus.InFlight, PendingStatus.Unknown, PendingStatus.Conflict, PendingStatus.Blocked })
{
    var state = State(); state.Outbox.Add(Action(1, "archive", status)); var before = JsonSerializer.Serialize(state);
    var row = Items(Project(true, state)).Single(row => row["id"]!.GetValue<string>() == Id(1));
    Check(!Items(Project(false, state)).Any(row => row["id"]!.GetValue<string>() == Id(1)) && row["_local_archived"]!.GetValue<bool>() && row["_local_status"]!.GetValue<string>() == status.ToString(), "archive intent not visible separately from source");
    Check(row["archived_at"] == null && !row.ContainsKey("_local_deleted"), "local archive fabricated a server timestamp or soft delete");
    Check(JsonSerializer.Serialize(state) == before && state.Outbox.Single().Status == status, "list read confirmed or changed an unconfirmed request");
}
var restored = State(); restored.Outbox.Add(Action(3, "restore", PendingStatus.Unknown)); AddTodo(restored, Todo(3, false));
var restoreRow = Items(Project(false, restored)).Single(row => row["id"]!.GetValue<string>() == Id(3)); var todo = TodoPreview(restored);
Check(!restoreRow["_local_archived"]!.GetValue<bool>() && restoreRow["archived_at"] != null && !restoreRow.ContainsKey("_local_deleted"), "restore intent cleared server archival evidence or deletion history");
Check(!todo["template_active"]!.GetValue<bool>() && todo["_local_template_archived"]!.GetValue<bool>() && todo["completed"]!.GetValue<bool>() && todo["text"]!.GetValue<string>() == "历史正文不得改写" && todo["template_version"]!.GetValue<long>() == 1,
    "unknown restore reopened a template or rewrote linked history");
var stale = State(); AddTodo(stale, Todo(1, false, 5), 9); stale.CacheRevisions[TemplateArchive.ListPath(false)] = 1;
Check(!TodoPreview(stale)["template_active"]!.GetValue<bool>(), "stale active cache reopened a newer server unavailable link");
var confirmed = State(); AddTodo(confirmed, Todo(1, false, 1), 3);
confirmed.Outbox.Add(Action(1, "restore", PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Envelope(Record(1, false, 2)).ToJsonString() });
Check(TodoPreview(confirmed)["template_active"]!.GetValue<bool>(), "newer full confirmed restore did not update derived availability");
foreach (var savedVersion in new long[] { 1, 2 })
{
    var state = State(); state.Outbox.Add(Action(1, "archive", PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Envelope(Record(1, true, savedVersion)).ToJsonString() });
    var row = Items(Project(true, state)).Single(row => row["id"]!.GetValue<string>() == Id(1));
    Check(row["version"]!.GetValue<long>() == savedVersion && row["archived_at"] != null && !row.ContainsKey("_local_status"), "same-version no-op or +1 confirmed archive receipt rejected");
}
var invalidReceipt = State(); invalidReceipt.Outbox.Add(Action(1, "archive", PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Envelope(Active(1, 2)).ToJsonString() });
Check(Items(Project(false, invalidReceipt)).Single(row => row["id"]!.GetValue<string>() == Id(1))["_local_incomplete"]!.GetValue<bool>(), "invalid archive receipt became a writable server record");
var legacyDelete = State(); legacyDelete.Outbox.Add(new PendingOperation { Id = "old-delete", ResourceKey = Path(1), Path = Path(1), Method = "DELETE", BodyJson = "{\"version\":1}" });
legacyDelete.Outbox.Add(Action(1, "restore")); AddTodo(legacyDelete, Todo());
Check(!Items(Project(false, legacyDelete)).Concat(Items(Project(true, legacyDelete))).Any(row => row["id"]!.GetValue<string>() == Id(1)) && !TodoPreview(legacyDelete)["template_active"]!.GetValue<bool>(),
    "archive restoration revived a soft-deleted template");
Check(legacyDelete.Outbox[0].Method == "DELETE" && legacyDelete.Outbox[0].BodyJson == "{\"version\":1}", "legacy DELETE semantics changed");
var dependent = State(); dependent.Outbox.Add(new PendingOperation { Id = "create-first", ResourceKey = Path(20), Method = "POST", Path = TemplateArchive.ListPath(false),
    BodyJson = new JsonObject { ["id"] = Id(20), ["text"] = "依赖创建的事项" }.ToJsonString() });
dependent.Outbox.Add(Action(20, "archive") with { Id = "archive-after-create", BodyJson = "{}", DependencyIds = ["create-first"], VersionFromDependencyId = "create-first" });
var dependentBefore = JsonSerializer.Serialize(dependent); var dependentRow = Items(Project(true, dependent)).Single(row => row["id"]!.GetValue<string>() == Id(20));
Check(dependentRow["_local_dependency_pending"]!.GetValue<bool>() && dependentRow["_local_incomplete"]!.GetValue<bool>() && dependentRow["version"] == null,
    "unprepared dependency intent vanished or guessed a server version");
Check(JsonSerializer.Serialize(dependent) == dependentBefore && dependent.Outbox.Last().PreparedBodyJson == null, "preview prepared or mutated the dependency request");
var badPrepared = State(); badPrepared.Outbox.Add(Action(1, "archive") with { BodyJson = "{}", PreparedBodyJson = "{\"version\":0}", VersionFromDependencyId = "prior" });
Reject(() => Project(true, badPrepared), "invalid frozen prepared body was mistaken for an unprepared dependency");
var archiveLinked = State(); AddTodo(archiveLinked, Todo()); archiveLinked.Outbox.Add(Action(1, "archive"));
var linkedBefore = JsonSerializer.Serialize(archiveLinked); var archivedTodo = TodoPreview(archiveLinked);
Check(!archivedTodo["template_active"]!.GetValue<bool>() && archivedTodo["_local_template_archived"]!.GetValue<bool>() && archivedTodo["text"]!.GetValue<string>() == "历史正文不得改写" && archivedTodo["note"]!.GetValue<string>() == "历史备注" && archivedTodo["completed"]!.GetValue<bool>(),
    "archive intent changed linked todo history or failed to disable availability");
Check(JsonSerializer.Serialize(archiveLinked) == linkedBefore, "derived linked template state mutated original cached history");

var unrelated = State(); unrelated.Cache["/api/v1/articles"] = "bad JSON"; unrelated.Cache["/api/v1/memos"] = new string('x', 9 * 1024 * 1024);
Check(Items(Project(false, unrelated)).Length == 2, "unrelated corrupt/huge caches blocked template preview");
var foreign = State(); var other = JsonNode.Parse(foreign.Cache[TemplateArchive.ListPath(true)])!.AsObject(); other["_local_scope_id"] = "foreign"; foreign.Cache[TemplateArchive.ListPath(true)] = other.ToJsonString();
var foreignBefore = JsonSerializer.Serialize(foreign); Reject(() => Project(false, foreign), "foreign cached archive scope accepted"); Check(JsonSerializer.Serialize(foreign) == foreignBefore, "foreign cache rejection changed state");
var escaped = Record(1); escaped["future_large"] = new string('<', 960000); var escapedRaw = List(false, escaped);
Check(escapedRaw.Length > TemplateArchive.MaximumSourceBytes && TemplateArchive.ParseList(TemplateArchive.ListPath(false), escapedRaw).Items.Count == 1, "legal source HTML escaping enlarged network semantic budget or was rejected");
var tooLarge = Active(1); tooLarge["future_large"] = new string('a', TemplateArchive.MaximumSourceBytes);
Reject(() => TemplateArchive.ParseList(TemplateArchive.ListPath(false), List(false, tooLarge)), "semantic source budget was bypassed");
var receiptBudget = State(); receiptBudget.Outbox.Add(Action(1, "archive", PendingStatus.Unknown) with { RemoteJson = new string('x', TemplateArchive.MaximumLocalBytes) });
Reject(() => Project(false, receiptBudget), "retained receipt bytes bypassed aggregate local budget");
var multiGrowth = State();
for (var n = 1; n <= 2; n++) for (var i = 0; i < 14; i++) multiGrowth.Outbox.Add(new PendingOperation { Id = "growth-" + n + "-" + i, ResourceKey = "different-key-" + i,
    Path = Path(n), Method = "PATCH", BodyJson = "{\"version\":1,\"text\":\"modified\"}", CreatedAt = DateTimeOffset.Parse(Stamp, CultureInfo.InvariantCulture).AddSeconds(i) });
var growthBefore = JsonSerializer.Serialize(multiGrowth); Reject(() => Project(false, multiGrowth), "multiple resource growth bypassed global projection budget");
Check(JsonSerializer.Serialize(multiGrowth) == growthBefore, "growth rejection changed original queue");
var outputBudget = State(); var largeItem = Active(1); largeItem["future_large"] = new string('<', 710000);
outputBudget.Cache[TemplateArchive.ListPath(false)] = List(false, largeItem);
outputBudget.Outbox.Add(Action(1, "archive", PendingStatus.Unknown) with { RemoteJson = Envelope((JsonObject)largeItem.DeepClone()).ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) });
var outputBefore = JsonSerializer.Serialize(outputBudget); Reject(() => Project(true, outputBudget), "expanded preview over 8MiB was parsed and returned");
Check(JsonSerializer.Serialize(outputBudget) == outputBefore, "output budget failure changed cached source or original remote receipt");

Console.WriteLine("PASS " + checks.ToString(CultureInfo.InvariantCulture));
