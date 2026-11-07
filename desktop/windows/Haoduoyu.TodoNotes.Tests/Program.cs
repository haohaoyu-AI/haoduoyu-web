using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var checks = 0;
void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); checks++; }
void Reject(Action action, string message)
{ try { action(); } catch (Exception error) when (error is InvalidDataException or ArgumentException or InvalidOperationException) { checks++; return; } throw new InvalidOperationException(message); }
const string Scope = "synthetic-todo-note-partition";
const string Stamp = "2026-11-07T01:02:03.000Z";
const string Day = "2026-11-07";
const string DayPath = "/api/v1/todos?date=" + Day;
string Id(int n) => "00000000-0000-4000-8000-" + n.ToString("D12", CultureInfo.InvariantCulture);
JsonObject Row(int n = 1, string? note = "原服务端备注", long version = 1, bool completed = false) 
{
    var row = new JsonObject { ["id"] = Id(n), ["date"] = Day, ["text"] = "原待办正文", ["completed"] = completed, ["version"] = version,
        ["created_at"] = Stamp, ["updated_at"] = Stamp, ["deleted_at"] = null,
        ["template_id"] = Id(90), ["template_version"] = 1, ["template_active"] = true,
        ["future"] = new JsonObject { ["nullable"] = null, ["zero"] = 0, ["text"] = "保留😀" } };
    if (note != null) row["note"] = note; return row;
}
string Wrap(JsonObject row) => new JsonObject { ["data"] = row, ["_local_scope_id"] = Scope }.ToJsonString();
string Daily(params JsonObject[] rows) => Wrap(new JsonObject { ["date"] = Day, ["today"] = Day, ["completed_mode"] = "strike", ["preferences_version"] = 0,
    ["items"] = new JsonArray(rows.Select(row => (JsonNode?)row).ToArray()) });
WorkspaceState State(string? note = "原服务端备注") => new()
{ ScopeId = Scope, LocalRevision = 12, Cache = new() { [DayPath] = Daily(Row(note: note)) }, CacheRevisions = new() { [DayPath] = 1 } };
PendingOperation Note(string note, PendingStatus status = PendingStatus.Queued, long version = 1, int n = 1) => new()
{
    Id = "synthetic-note-" + n, ResourceKey = TodoNotes.ResourceKey(Id(n)), Path = TodoNotes.Path(Id(n)), Method = "PATCH",
    BodyJson = new JsonObject { ["note"] = note, ["version"] = version }.ToJsonString(), Status = status, TodoNoteDate = Day,
    CreatedAt = DateTimeOffset.Parse(Stamp, CultureInfo.InvariantCulture)
};
JsonObject Preview(WorkspaceState state, int n = 1) => TodoNotes.ProjectDay(state, new DateOnly(2026, 11, 7))!["data"]!["items"]!.AsArray().Select(row => row!.AsObject()).Single(row => row["id"]!.GetValue<string>() == Id(n));
LocalDraft Draft(JsonObject original, string note, bool? known = null)
{
    var values = new JsonObject { ["note"] = note }; if (known != null) values["note_known"] = known.Value;
    var key = TodoNotes.DraftKey(original["id"]!.GetValue<string>());
    return new() { Key = key, BaseVersion = original["version"]!.GetValue<long>(), Text = new JsonObject { ["kind"] = "todo-note", ["key"] = key, ["original"] = original, ["values"] = values }.ToJsonString() };
}

foreach (var text in new[] { "", " ", "\t\r\n", "  原文\r\n第二行\r第三行\n\t e\u0301 😀  ", new string('x', 4000), string.Concat(Enumerable.Repeat("😀", 2000)) })
    Check(TodoNotes.ValidateText(text) == text, "formal note text was normalized, trimmed or miscounted");
foreach (var text in new[] { new string('x', 4001), string.Concat(Enumerable.Repeat("😀", 2001)), "\0", "\u0008", "\u000b", "\u000c", "\u000e", "\u001f", "\u007f", "\ud800", "\udc00" })
    Reject(() => TodoNotes.ValidateText(text), "invalid note text accepted");
Check(TodoNotes.ResourceKey(Id(1)) != TodoNotes.DraftKey(Id(1)) && TodoNotes.Path(Id(1)) == TodoNotes.ResourceKey(Id(1)) + "/note", "draft and resource keys were conflated");
TodoNotes.ValidateRecord(Row()); TodoNotes.ValidateRecord(Row(note: null), Id(1), new DateOnly(2026, 11, 7)); checks++;
Check(!TodoNotes.ReadNote(Row(note: null)).Known && TodoNotes.ReadNote(Row(note: "")).Known && TodoNotes.ReadNote(Row(note: "")).Note == "", "legacy missing note became a known clear");
var full = Row(); var fullBefore = full.ToJsonString(); TodoNotes.ValidateRecord(full); Check(full.ToJsonString() == fullBefore, "record validator modified source");
void Bad(Action<JsonObject> mutate, string message) { var row = Row(); mutate(row); Reject(() => TodoNotes.ValidateRecord(row, Id(1), new DateOnly(2026, 11, 7)), message); }
Bad(row => row["id"] = Id(2), "wrong todo identity accepted");
Bad(row => row["date"] = "2026-11-08", "wrong original date accepted");
Bad(row => row["note"] = null, "null note accepted as clear");
Bad(row => row["note"] = 0, "numeric note accepted");
Bad(row => row["version"] = 0, "zero version accepted as a full baseline");
Bad(row => row.Remove("created_at"), "summary missing creation timestamp accepted");
Bad(row => row["deleted_at"] = Stamp, "deleted todo accepted for note edits");
Bad(row => row["_local_incomplete"] = true, "local summary accepted as write baseline");
Bad(row => row.Remove("template_active"), "partial template link accepted");
TodoNotes.ValidateList(DayPath, Daily(Row()), Scope); checks++;
Reject(() => TodoNotes.ValidateList("/api/v1/todos?date=2026-11-08", Daily(Row()), Scope), "wrong source day accepted");
Reject(() => TodoNotes.ValidateList(DayPath, Daily(Row()), "foreign"), "foreign list accepted");

var exact = "  原样\r\n备注关键字\t e\u0301 😀 "; var draft = Draft(Row(), exact); var parsed = TodoNotes.ParseDraft(draft);
Check(parsed.Note == exact && parsed.NoteKnown && parsed.ResourceKey == TodoNotes.ResourceKey(Id(1)) && parsed.Date == new DateOnly(2026, 11, 7), "draft raw text or identity changed");
parsed.Original["note"] = "mutated"; Check(TodoNotes.ParseDraft(draft).Original["note"]!.GetValue<string>() == "原服务端备注", "draft exposed original mutable nodes");
Check(!TodoNotes.ParseDraft(Draft(Row(note: null), "", false)).NoteKnown, "untouched unknown draft became an explicit clear");
Check(TodoNotes.ParseDraft(Draft(Row(), new string('z', 4001))).Note.Length == 4001 && TodoNotes.ParseDraft(Draft(Row(), "\u0001待修正")).Note == "\u0001待修正", "invalid input was lost instead of retained in a local draft");
Reject(() => TodoNotes.ParseDraft(draft with { BaseVersion = 5 }), "draft baseline version mismatch accepted");
var createKey = TodoNotes.ResourceKey(Id(1)); var draftState = State(); draftState.Drafts[createKey] = new() { Key = createKey, Text = "原创建稿未覆盖" };
draftState.Drafts[draft.Key] = draft; var draftStateBefore = JsonSerializer.Serialize(draftState);
var draftSearch = WorkspaceSearch.Search(draftState, "备注关键字");
Check(draftSearch.Items.Any(hit => hit.Kind == "todo-note" && hit.Origin == "draft" && hit.LocalDraftKey == draft.Key && hit.SourceText == draft.Text), "independent note draft was not searchable with original evidence");
Check(draftState.Drafts[createKey].Text == "原创建稿未覆盖" && JsonSerializer.Serialize(draftState) == draftStateBefore, "note draft/search overwrote create draft or state");

foreach (var status in new[] { PendingStatus.Queued, PendingStatus.InFlight, PendingStatus.Unknown, PendingStatus.Conflict, PendingStatus.Blocked })
{
    var state = State(); state.Outbox.Add(Note(exact, status)); var before = JsonSerializer.Serialize(state); var row = Preview(state); var info = TodoNotes.ReadNote(row);
    Check(info.Note == exact && info.Source == "local-intent" && info.BaselineNote == "原服务端备注" && info.BaselineKnown && row["_local_status"]!.GetValue<string>() == status.ToString(), "note intent or server origin was lost");
    Check(row["text"]!.GetValue<string>() == "原待办正文" && !row["completed"]!.GetValue<bool>() && row["template_id"]!.GetValue<string>() == Id(90) && row["date"]!.GetValue<string>() == Day,
        "note preview modified todo text/completion/link/date");
    Check(JsonSerializer.Serialize(state) == before && state.Outbox.Single().Status == status, "read-only preview changed or confirmed original requests");
}
var clearPending = State(); clearPending.Outbox.Add(Note(""));
Check(Preview(clearPending)["note"]!.GetValue<string>() == "" && TodoNotes.ReadNote(Preview(clearPending)).BaselineNote == "原服务端备注", "pending clear resurrected or discarded original note");
foreach (var reverse in new[] { false, true })
{
    var state = State(); var detail = new KeyValuePair<string, string>(TodoNotes.ResourceKey(Id(1)), Wrap(Row()));
    if (reverse) { var raw = state.Cache[DayPath]; state.Cache.Clear(); state.Cache[detail.Key] = detail.Value; state.Cache[DayPath] = raw; } else state.Cache[detail.Key] = detail.Value;
    state.CacheRevisions[detail.Key] = 1; state.Outbox.Add(Note("", PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Wrap(Row(note: null, version: 2)) });
    var row = Preview(state); Check(row["note"]!.GetValue<string>() == "" && TodoNotes.ReadNote(row).Source == "confirmed-clear" && row["version"]!.GetValue<long>() == 2,
        "confirmed omitted-empty note merged old text back from an equally valid cache");
}
var confirmedRaw = State(); confirmedRaw.Outbox.Add(Note(exact, PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Wrap(Row(note: exact, version: 2)) });
Check(TodoNotes.ReadNote(Preview(confirmedRaw)).Note == exact && TodoNotes.ReadNote(Preview(confirmedRaw)).Source == "confirmed", "confirmed exact CRLF/whitespace changed");
var conditionalReplay = State(); conditionalReplay.Outbox.Add(Note("原服务端备注", PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Wrap(Row(note: "原服务端备注", version: 2, completed: true)) });
Check(Preview(conditionalReplay)["completed"]!.GetValue<bool>() && !Preview(conditionalReplay).ContainsKey("_local_incomplete") && TodoNotes.ReadNote(Preview(conditionalReplay)).Source == "confirmed",
    "legal conditional note replay rejected a completion already changed by another successful action");
Check(!JsonNode.Parse(conditionalReplay.Cache[DayPath])!["data"]!["items"]![0]!["completed"]!.GetValue<bool>() && !JsonNode.Parse(conditionalReplay.Outbox[0].BodyJson)!.AsObject().ContainsKey("completed"),
    "note replay actively changed original completion or added it to the note request");
var refreshedClear = State(); refreshedClear.Cache[DayPath] = Daily(Row(note: null, version: 2)); refreshedClear.CacheRevisions[DayPath] = 20;
refreshedClear.Outbox.Add(Note("", PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Wrap(Row(note: null, version: 2)) });
Check(TodoNotes.ReadNote(Preview(refreshedClear)) is { Known: true, Note: "", Source: "confirmed-clear" }, "later same-version GET lost verified known-empty provenance");
refreshedClear.Cache[DayPath] = Daily(Row(note: null, version: 3));
Check(!TodoNotes.ReadNote(Preview(refreshedClear)).Known, "older clear proof was misapplied to a newer legacy field omission");
var templateChanged = State(); var changedLink = Row(note: exact, version: 2); changedLink["template_version"] = 2; changedLink["template_active"] = false;
templateChanged.Outbox.Add(Note(exact, PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Wrap(changedLink) });
Check(!Preview(templateChanged)["template_active"]!.GetValue<bool>() && Preview(templateChanged)["template_version"]!.GetValue<long>() == 2, "legal live template metadata change rejected or rewritten");
foreach (var response in new[] { Row(note: null, version: 2), Row(note: exact, version: 1), Row(2, exact, 2) })
{
    var state = State(); state.Outbox.Add(Note(exact, PendingStatus.Confirmed) with { ConfirmedRevision = 10, RemoteJson = Wrap(response) });
    Check(Preview(state)["_local_incomplete"]!.GetValue<bool>() && Preview(state)["note"]!.GetValue<string>() == "原服务端备注", "invalid confirmed receipt changed server baseline");
}
var wrongDate = State(); wrongDate.Outbox.Add(Note(exact) with { TodoNoteDate = "2026-11-08" }); var wrongBefore = JsonSerializer.Serialize(wrongDate);
Reject(() => WorkspaceProjection.Project(DayPath, wrongDate.Cache[DayPath], wrongDate), "mismatched original date applied to cached todo");
Check(JsonSerializer.Serialize(wrongDate) == wrongBefore, "wrong date rejection changed state");
var dependency = State(); dependency.Cache[DayPath] = Daily();
dependency.Outbox.Add(new PendingOperation { Id = "create-parent", ResourceKey = TodoNotes.ResourceKey(Id(1)), Path = "/api/v1/todos", Method = "POST", BodyJson = new JsonObject { ["id"] = Id(1), ["date"] = Day, ["text"] = "创建事项" }.ToJsonString() });
dependency.Outbox.Add(Note("依赖备注") with { BodyJson = "{\"note\":\"依赖备注\"}", DependencyIds = ["create-parent"], VersionFromDependencyId = "create-parent" });
var depBefore = JsonSerializer.Serialize(dependency); var dep = Preview(dependency);
Check(dep["note"]!.GetValue<string>() == "依赖备注" && dep["version"] == null && dep["_local_dependency_pending"]!.GetValue<bool>() && dep["_local_incomplete"]!.GetValue<bool>(), "dependency preview guessed version or omitted note");
Check(JsonSerializer.Serialize(dependency) == depBefore && dependency.Outbox.Last().PreparedBodyJson == null, "dependency preview prepared a write");

var historyState = State(); historyState.Outbox.Add(Note("本机历史独有字", PendingStatus.Unknown)); var historyBefore = JsonSerializer.Serialize(historyState);
var history = TodoHistory.Build(historyState, TodoHistory.Month(new DateOnly(2026, 11, 7)), new("历史独有"));
var historyDay = history.Days.Single(day => day.Date == new DateOnly(2026, 11, 7)); var entry = historyDay.Entries.Single();
Check(entry.Note == "本机历史独有字" && entry.NoteSource == "local-intent" && entry.BaselineNote == "原服务端备注" && historyDay.Total == 1 && historyDay.Done == 0 && historyDay.UncertainCount == 1,
    "history note search or provenance changed completion/counts");
Check(JsonSerializer.Serialize(historyState) == historyBefore, "history projection mutated originals");
var requestSearch = WorkspaceSearch.Search(historyState, "历史独有"); Check(requestSearch.Items.Any(hit => hit.Kind == "todo-note" && hit.Origin == "request" && hit.OperationId == historyState.Outbox[0].Id && hit.Date == Day && hit.SourceText == historyState.Outbox[0].BodyJson), "search lost note request/date/raw evidence");
var cacheSearch = WorkspaceSearch.Search(State("仅备注才有的搜索词"), "仅备注才有"); Check(cacheSearch.Items.Any(hit => hit.Origin == "cache" && hit.Kind == "todo"), "cached todo note not searched");
var noDate = State(); noDate.Cache.Clear(); noDate.Outbox.Add(Note("无日期") with { TodoNoteDate = null });
var undated = TodoHistory.Build(noDate, TodoHistory.Month(new DateOnly(2026, 11, 7))); Check(undated.Total == 0 && undated.UnattributedOperationCount == 1, "undated note intent guessed today");
var unrelated = State(); unrelated.Cache["/api/v1/articles"] = "bad JSON"; unrelated.Cache["/api/v1/memos"] = new string('x', 9 * 1024 * 1024); unrelated.Outbox.Add(new() { Id = "irrelevant", Path = "/api/v1/articles/other", BodyJson = "bad JSON" });
unrelated.Cache[TodoNotes.ResourceKey(Id(2))] = new string('x', 9 * 1024 * 1024);
unrelated.Outbox.Add(Note("other day", n: 2) with { TodoNoteDate = "2026-11-08", BodyJson = new string('x', 9 * 1024 * 1024) });
Check(Preview(unrelated)["note"]!.GetValue<string>() == "原服务端备注", "unrelated business source blocked note view");
var foreign = State(); foreign.Outbox.Add(Note("内容", PendingStatus.Unknown) with { RemoteJson = "{\"_local_scope_id\":\"foreign\",\"data\":{}}" });
Reject(() => Preview(foreign), "foreign note remote evidence accepted");
var tooLarge = State(); tooLarge.Outbox.Add(Note("内容", PendingStatus.Unknown) with { RemoteJson = new string('x', TodoNotes.MaximumLocalBytes) });
Reject(() => Preview(tooLarge), "retained note evidence bypassed total input budget");
var outputBudget = State(); var largeRow = Row(); largeRow["future_large"] = new string('<', 710000); outputBudget.Cache[DayPath] = Daily(largeRow);
outputBudget.Outbox.Add(Note("本机文字", PendingStatus.Unknown) with { RemoteJson = new JsonObject { ["data"] = largeRow.DeepClone(), ["_local_scope_id"] = Scope }.ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }) });
var outputBefore = JsonSerializer.Serialize(outputBudget); Reject(() => Preview(outputBudget), "expanded note preview output exceeded 8MiB without refusal");
Check(JsonSerializer.Serialize(outputBudget) == outputBefore, "output budget failure mutated original note sources");
Console.WriteLine("PASS " + checks.ToString(CultureInfo.InvariantCulture));
