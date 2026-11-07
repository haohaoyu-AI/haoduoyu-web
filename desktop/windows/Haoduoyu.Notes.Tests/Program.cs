using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var checks = 0;
void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
    checks++;
}
void Reject(Action action, string message)
{
    try { action(); }
    catch (InvalidDataException) { checks++; return; }
    throw new InvalidOperationException(message);
}
const string Scope = "synthetic-notes-partition";
const string Month = "2024-02";
const string First = "2024-02-01";
const string Stamp = "2024-02-01T01:02:03.000Z";
string Id(int n) => "00000000-0000-4000-8000-" + n.ToString("D12", CultureInfo.InvariantCulture);
string MonthPath(string month = Month) => "/api/v1/note-entries/month?month=" + month;
string NotePath(int n) => "/api/v1/note-entries/" + Id(n);
string DayPath(string day, string category = "life") => "/api/v1/note-entries?category=" + category + "&date=" + day;
string LegacyPath(string day, string category = "life") => "/api/v1/daily-notes?date=" + day + "&category=" + category;
JsonObject Item(int n, string text = "合成月记录😀", string category = "life", params string[] labels) => new()
{
    ["entity_id"] = "note-entry:" + Id(n), ["source"] = "note_entry", ["category"] = category,
    ["labels"] = new JsonArray((labels.Length == 0 ? new[] { category == "life" ? "生活" : "工作" } : labels).Select(label => (JsonNode?)JsonValue.Create(label)).ToArray()),
    ["text"] = text, ["created_at"] = Stamp, ["updated_at"] = Stamp
};
JsonObject Legacy(string date = First, string text = "旧日页合成文字", string category = "life") => new()
{
    ["entity_id"] = "legacy-" + category + ":" + date, ["source"] = "legacy_daily_note", ["category"] = category,
    ["labels"] = new JsonArray(category == "life" ? "生活" : "工作"), ["text"] = text, ["created_at"] = null, ["updated_at"] = Stamp
};
JsonObject Day(string date, params JsonObject[] rows) => new()
{
    ["date"] = date, ["items"] = new JsonArray(rows.Select(row => (JsonNode?)row).ToArray())
};
JsonObject Envelope(string month = Month, params JsonObject[] days) => new()
{
    ["data"] = new JsonObject { ["format"] = "haoduoyu-note-month-v1", ["month"] = month,
        ["complete"] = true, ["labels_version"] = 3, ["days"] = new JsonArray(days.Select(day => (JsonNode?)day).ToArray()) },
    ["_local_scope_id"] = Scope
};
JsonObject FullRow(int n, string date = First, string text = "每日合成条目", string category = "life") => new()
{
    ["id"] = Id(n), ["date"] = date, ["category"] = category, ["text"] = text,
    ["version"] = 7, ["content_hash"] = new string('a', 64), ["change_seq"] = 19,
    ["labels_version"] = 3, ["labels"] = new JsonArray(category == "life" ? "生活" : "工作"),
    ["created_at"] = Stamp, ["updated_at"] = Stamp, ["deleted_at"] = null, ["deleted"] = false, ["can_edit"] = true
};
JsonObject FullDay(string date, string category, params JsonObject[] rows) => new()
{
    ["data"] = new JsonObject { ["date"] = date, ["category"] = category, ["labels_version"] = 3,
        ["entries"] = new JsonArray(rows.Select(row => (JsonNode?)row).ToArray()), ["can_edit"] = true },
    ["_local_scope_id"] = Scope
};
WorkspaceState State(JsonObject? envelope = null) => new()
{
    ScopeId = Scope, LocalRevision = 23,
    Cache = envelope == null ? new() : new() { [MonthPath()] = envelope.ToJsonString() },
    CacheRevisions = envelope == null ? new() : new() { [MonthPath()] = 20 }
};
PendingOperation Operation(int n, string method, JsonObject body, PendingStatus status = PendingStatus.Queued, string? date = null) => new()
{
    Id = "synthetic-note-op-" + n.ToString(CultureInfo.InvariantCulture), ResourceKey = NotePath(n), Method = method, Path = NotePath(n),
    BodyJson = body.ToJsonString(), Status = status,
    CreatedAt = DateTimeOffset.Parse(date ?? Stamp, CultureInfo.InvariantCulture)
};
JsonObject Save(string date, string text, string category = "life", long version = 7) => new()
{
    ["date"] = date, ["category"] = category, ["text"] = text, ["version"] = version,
    ["save_id"] = Id(9000), ["labels"] = new JsonArray(category == "life" ? "生活" : "工作")
};
NoteHistoryItem Find(NoteHistoryView view, int n) => view.Days.SelectMany(day => day.Items).Single(item => item.EntityId == "note-entry:" + Id(n));

var leap = NoteHistory.Month(new DateOnly(2024, 2, 29));
Check(leap.Month == Month && leap.Start == new DateOnly(2024, 2, 1) && leap.End == new DateOnly(2024, 2, 29) && leap.Dates.Count == 29,
    "leap month range did not preserve the real calendar");
Check(NoteHistory.Month(new DateOnly(2025, 2, 28)).Dates.Count == 28 && NoteHistory.Month(new DateOnly(2024, 4, 30)).Dates.Count == 30 &&
    NoteHistory.Month(new DateOnly(2024, 12, 31)).Shift(1)!.Month == "2025-01" && leap.Shift(-2)!.Month == "2023-12",
    "nonleap month, thirty-day month or cross-year shift failed");
Check(NoteHistory.Month(DateOnly.MinValue).Month == "0001-01" && NoteHistory.Month(DateOnly.MinValue).Shift(-1) == null &&
    NoteHistory.Month(DateOnly.MaxValue).Month == "9999-12" && NoteHistory.Month(DateOnly.MaxValue).Shift(1) == null && leap.Shift(int.MaxValue) == null,
    "month navigation wrapped outside years 0001–9999");
Check(NoteHistory.BeijingToday(DateTimeOffset.Parse("2026-11-07T15:59:59Z", CultureInfo.InvariantCulture)) == new DateOnly(2026, 11, 7) &&
    NoteHistory.BeijingToday(DateTimeOffset.Parse("2026-11-07T16:00:00Z", CultureInfo.InvariantCulture)) == new DateOnly(2026, 11, 8) &&
    NoteHistory.BeijingToday(DateTimeOffset.MaxValue) == DateOnly.MaxValue, "Beijing calendar used UTC or overflowed");

var note = Item(1, "中文😀\n第二行 <正文>", "life", "生活", "随笔");
note["future_metadata"] = new JsonObject { ["zero"] = 0, ["nullable"] = null, ["flag"] = true };
var blank = Item(2, "", "work"); blank["labels"] = new JsonArray();
var source = Envelope(Month, Day(First, Legacy(), note, blank), Day("2024-02-29", Legacy("2024-02-29", "闰日工作", "work")));
source["data"]!["future_month_metadata"] = new JsonArray("保留", 0, false);
var parsed = NoteHistory.ParseBaseline(source.ToJsonString(), Month, Scope);
Check(parsed.Month == Month && parsed.Items.Count == 4 && parsed.Items.Any(item => item.Text == "中文😀\n第二行 <正文>" && item.Labels.Contains("随笔")) &&
    parsed.Items.Any(item => item.Text == "" && item.Source == "note_entry" && item.Labels.Count == 0),
    "month baseline lost Unicode, multiple labels, legacy rows or an empty valid note");
var detached = parsed.Data; detached["days"]!.AsArray().Clear();
var itemData = parsed.Items.Single(item => item.EntityId == "note-entry:" + Id(1)).Data;
itemData["future_metadata"]!["zero"] = 98;
Check(parsed.Data["days"]!.AsArray().Count == 2 && parsed.Data["future_month_metadata"]!.AsArray().Count == 3 &&
    parsed.Items.Single(item => item.EntityId == "note-entry:" + Id(1)).Data["future_metadata"]!["zero"]!.GetValue<int>() == 0,
    "baseline returned shared mutable nodes or discarded legal unknown metadata");
NoteHistory.ValidateSource(source.ToJsonString(), Month, Scope);
Check(true, "shared source validator rejected its own legal baseline");

void Bad(Action<JsonObject> mutate, string message)
{
    var changed = (JsonObject)source.DeepClone(); mutate(changed);
    Reject(() => NoteHistory.ParseBaseline(changed.ToJsonString(), Month, Scope), message);
}
Bad(root => root["data"]!["month"] = "2024-03", "late response for a different month was accepted");
Bad(root => root["data"]!["complete"] = false, "partial source claimed exact full-month completeness");
Bad(root => root["data"]!["labels_version"] = 2, "non-v3 labels were silently interpreted as the current contract");
Bad(root => root["data"]!.AsObject().Remove("labels_version"), "missing labels_version was accepted");
Bad(root => root["_local_scope_id"] = "other-partition", "foreign scope was accepted");
Bad(root => root["_local_projection"] = true, "local projection was accepted as original network source");
Bad(root => root["data"]!["days"]![0]!["date"] = "2024-02-30", "impossible calendar day was accepted");
Bad(root => root["data"]!["days"]![0]!["date"] = "2024-03-01", "outside-month day was accepted");
Bad(root => root["data"]!["days"]!.AsArray().Add(Day(First)), "duplicate source day was accepted");
Bad(root => root["data"]!["days"]![1]!["items"]!.AsArray().Add(Item(1)), "duplicate cross-day note identity was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![0]!["entity_id"] = "legacy-work:" + First, "legacy identity/category mismatch was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![0]!["entity_id"] = "legacy-life:2024-02-02", "legacy identity/day mismatch was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![0]!["text"] = "", "empty legacy source should have been excluded by the server");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["source"] = "legacy_daily_note", "note identity with legacy source was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["category"] = "unknown", "unknown source category was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["created_at"] = null, "note source without creation timestamp was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![0]!["created_at"] = Stamp, "legacy source invented creation timestamp was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["updated_at"] = "2024-02-01", "date-only source timestamp was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["text"] = 12, "nonstring source text was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["labels"] = new JsonArray("随笔", "随笔"), "duplicate labels were accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["labels"] = new JsonArray(" 未规范 "), "noncanonical label was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["labels"] = new JsonArray("控制\n符"), "control characters in source label were accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["labels"] = new JsonArray("e\u0301"), "non-NFC source label was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["entity_id"] = "note-entry:not-an-id", "malformed note identity was accepted");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["_local_status"] = "Queued", "local source rows were accepted as authoritative baseline");
Bad(root => root["data"]!["_local_scope_id"] = Scope, "nested month data scope marker was accepted as untouched source");
Bad(root => root["data"]!["days"]![0]!["_local_scope_id"] = Scope, "nested day scope marker was accepted as untouched source");
Bad(root => root["data"]!["days"]![0]!["items"]![1]!["_local_scope_id"] = Scope, "nested item scope marker was accepted as untouched source");
Reject(() => NoteHistory.ParseBaseline("{\"data\":{},\"data\":{}}", Month), "duplicate JSON property was accepted");
Reject(() => NoteHistory.ParseBaseline(source.ToJsonString().Replace("\"complete\":true", "\"complete\":true,\"complete\":true", StringComparison.Ordinal), Month),
    "nested duplicate JSON property was accepted");
Reject(() => NoteHistory.ParseBaseline(source.ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping })
    .Replace("中文", "\\uD800", StringComparison.Ordinal), Month), "unpaired UTF-16 surrogate was accepted");
Reject(() => NoteHistory.ParseBaseline(source.ToJsonString(), "0000-02"), "year zero was accepted");
Reject(() => NoteHistory.ParseBaseline(source.ToJsonString(), "2024-2"), "noncanonical month was accepted");
Check(NoteHistory.ParseBaseline(Envelope("0001-01").ToJsonString(), "0001-01").Items.Count == 0 &&
    NoteHistory.ParseBaseline(Envelope("9999-12").ToJsonString(), "9999-12").Items.Count == 0,
    "valid first or last calendar month was rejected by source parsing");

var emptyState = State(Envelope()); var empty = NoteHistory.Build(emptyState, Month);
Check(empty.Complete && empty.CoveredDays == 29 && empty.Days.Count == 29 && empty.Total == 0 && empty.BaselineTotal == 0 &&
    empty.Days.All(day => day.HasBaseline && day.Complete && day.Total == 0), "exact complete empty month became an unknown month");
var unknown = NoteHistory.Build(State(), Month);
Check(!unknown.Complete && unknown.CoveredDays == 0 && unknown.Total == 0 && unknown.Days.All(day => !day.Complete && !day.HasBaseline),
    "unread month was claimed to contain complete empty days");
var known = NoteHistory.Build(State(source), Month);
Check(known.Complete && known.Total == 4 && known.BaselineTotal == 4 && known.ActiveDays == 2 && known.KnownLabels.Contains("随笔") &&
    known.KnownLabels.Contains("生活") && known.KnownLabels.Contains("工作"), "month totals or known labels were not based on all source rows");
var filtered = NoteHistory.Build(State(source), Month, new(Source: "life", Label: "随笔", Query: "😀"));
Check(filtered.Total == 4 && filtered.BaselineTotal == 4 && filtered.FilteredCount == 1 && filtered.Days[0].Total == 3 && filtered.Days[0].FilteredCount == 1 &&
    filtered.Days[0].Items.Single().EntityId == "note-entry:" + Id(1), "filters changed all-month totals or missed exact label/Unicode body match");
Check(NoteHistory.Build(State(source), Month, new(Source: "work")).FilteredCount == 2 &&
    NoteHistory.Build(State(source), Month, new(Label: "随")).FilteredCount == 0 &&
    NoteHistory.Build(State(source), Month, new(Query: "future_metadata")).FilteredCount == 0,
    "source filter, exact label matching or body-only search was broadened");
Check(known.Days.SelectMany(day => day.Items).All(item => item.Data["_local_incomplete"]?.GetValue<bool>() == true &&
    !item.Data.ContainsKey("version") && !item.Data.ContainsKey("content_hash")), "month summary was promoted to an editable CAS entity");

var fallback = State();
fallback.Cache[DayPath(First)] = FullDay(First, "life", FullRow(10), FullRow(11, text: "第二条😀")).ToJsonString();
fallback.CacheRevisions[DayPath(First)] = 21;
fallback.Cache[LegacyPath(First)] = new JsonObject { ["data"] = new JsonObject { ["date"] = First, ["text"] = "日页合成旧数据", ["version"] = 4, ["updated_at"] = Stamp }, ["_local_scope_id"] = Scope }.ToJsonString();
fallback.CacheRevisions[LegacyPath(First)] = 21;
var partial = FullDay("2024-02-02", "work", FullRow(12, "2024-02-02", "部分缓存", "work")); partial["_local_incomplete"] = true;
fallback.Cache[DayPath("2024-02-02", "work")] = partial.ToJsonString();
fallback.Cache["/api/v1/articles/" + Id(500)] = "this is unrelated bad JSON";
fallback.Cache["/api/v1/memos"] = new string('x', 9 * 1024 * 1024);
var fallbackBefore = JsonSerializer.Serialize(fallback);
var fallbackView = NoteHistory.Build(fallback, Month);
Check(!fallbackView.Complete && fallbackView.Total == 4 && fallbackView.Days[0].Total == 3 && fallbackView.Days[1].Total == 1 &&
    !fallbackView.Days[2].Complete && fallbackView.Days[2].Total == 0, "daily/partial caches disappeared or unrelated broken caches poisoned the month");
Check(JsonSerializer.Serialize(fallback) == fallbackBefore, "fallback projection modified original cache, drafts, outbox or revision");

var pendingState = State(Envelope(Month, Day(First, Item(20, "服务端原文"), Item(21, "将被本机删除"))));
pendingState.Outbox.Add(Operation(20, "PUT", Save(First, "本机新文😀")));
pendingState.Outbox.Add(Operation(21, "DELETE", new JsonObject { ["version"] = 7, ["save_id"] = Id(9001) }, PendingStatus.Unknown));
pendingState.Outbox.Add(Operation(22, "PUT", Save("2024-02-03", "本机新增", version: 0), PendingStatus.Blocked));
var pendingView = NoteHistory.Build(pendingState, Month);
Check(pendingView.BaselineTotal == 2 && pendingView.Total == 2 && pendingView.UncertainCount == 3 && pendingView.Days[0].UncertainCount == 2 &&
    pendingView.Days[0].BaselineTotal == 2 && pendingView.Days[0].Total == 1 && Find(pendingView, 20).Text == "本机新文😀" &&
    Find(pendingView, 20).LocalStatus == "Queued" && Find(pendingView, 22).LocalStatus == "Blocked",
    "pending edits, blocked creates, hidden deletes or baseline totals lost their local provenance");
pendingState.Outbox.Add(Operation(23, "DELETE", new JsonObject { ["version"] = 4, ["save_id"] = Id(9002) }, PendingStatus.Conflict));
pendingState.Outbox.Add(Operation(24, "PUT", Save("2024-03-01", "不同月已知请求"), PendingStatus.Unknown));
pendingState.Outbox.Add(new PendingOperation { Id = "unrelated-bad-article", Method = "PUT", Path = "/api/v1/articles/" + Id(500), BodyJson = "not-json", Status = PendingStatus.Unknown });
var orphanView = NoteHistory.Build(pendingState, Month);
Check(orphanView.UnattributedOperationCount == 1 && orphanView.UncertainCount == 4 && orphanView.Days.Sum(day => day.UncertainCount) == 3 &&
    orphanView.Total == 2, "undated operation was guessed into today, outside-month intent was counted or unrelated JSON broke notes");
Check(NoteHistory.Build(pendingState, Month, new(Query: "不会命中")).UncertainCount == 4,
    "filtering hid unresolved operations, including nonvisible deletes");
var foreignReceiptState = State(Envelope(Month, Day(First, Item(60, "当前身份基线"))));
foreignReceiptState.Outbox.Add(Operation(60, "PUT", Save(First, "已有日期的本机意图"), PendingStatus.Unknown) with
    { RemoteJson = new JsonObject { ["data"] = FullRow(60, text: "跨身份不可渲染的远端正文"), ["_local_scope_id"] = "foreign-receipt-partition" }.ToJsonString() });
var foreignReceiptBefore = JsonSerializer.Serialize(foreignReceiptState);
Reject(() => NoteHistory.Build(foreignReceiptState, Month), "foreign response scope bypassed validation because body date and baseline identity were already known");
Check(JsonSerializer.Serialize(foreignReceiptState) == foreignReceiptBefore, "rejected foreign receipt modified current-scope baseline or original requests");
var invalidIntentState = State(Envelope(Month, Day(First, Item(61, "有效月基线"))));
invalidIntentState.Outbox.Add(Operation(61, "PUT", Save("2024-02-30", "无效日期的本机请求"), PendingStatus.Unknown));
var invalidIntentBefore = JsonSerializer.Serialize(invalidIntentState);
Reject(() => NoteHistory.Build(invalidIntentState, Month), "impossible local intent date was silently hidden while complete monthly coverage survived");
Check(JsonSerializer.Serialize(invalidIntentState) == invalidIntentBefore, "invalid intent rejection modified baseline or queued body");
var catalogState = State(Envelope(Month, Day(First, Item(62, "标签目录不改变数量"))));
catalogState.Cache["/api/v1/note-entries/labels"] = new JsonObject { ["data"] = new JsonObject
    { ["labels"] = new JsonArray(new JsonObject { ["name"] = "现有未用标签", ["created_at"] = Stamp }), ["archived_labels"] = new JsonArray() }, ["_local_scope_id"] = Scope }.ToJsonString();
var catalogView = NoteHistory.Build(catalogState, Month);
Check(catalogView.KnownLabels.Contains("现有未用标签") && catalogView.Total == 1 && catalogView.BaselineTotal == 1 && catalogView.Complete,
    "unused active catalog label was lost or label cache changed record totals and month coverage");
var chainState = State(Envelope());
chainState.Outbox.Add(Operation(50, "PUT", Save("2024-02-06", "已被替换的本机版本", version: 0), PendingStatus.Superseded) with
    { Id = "superseded-note", SupersededById = "replacement-note" });
chainState.Outbox.Add(Operation(50, "PUT", Save("2024-02-06", "替换后的本机版本", version: 0)) with { Id = "replacement-note" });
chainState.Outbox.Add(Operation(51, "PUT", Save("2024-02-07", "依赖替换后的本机版本", version: 0)) with
    { Id = "dependent-note", DependencyIds = new[] { "superseded-note" } });
var chainView = NoteHistory.Build(chainState, Month);
Check(chainView.Total == 2 && chainView.UncertainCount == 2 && Find(chainView, 50).Text == "替换后的本机版本" &&
    Find(chainView, 51).Text == "依赖替换后的本机版本", "dependency and supersession closure duplicated or lost local intentions");
var restoreState = State(Envelope()); var deletedNote = FullRow(80, text: "软删除后恢复的合成条目");
deletedNote["deleted_at"] = Stamp; deletedNote["deleted"] = true;
restoreState.Cache[NotePath(80)] = new JsonObject { ["data"] = deletedNote, ["_local_scope_id"] = Scope }.ToJsonString();
restoreState.CacheRevisions[NotePath(80)] = 21;
restoreState.Cache[LegacyPath(First, "work")] = new JsonObject { ["data"] = new JsonObject { ["date"] = First, ["text"] = "恢复的旧工作日页",
    ["version"] = 8, ["updated_at"] = Stamp, ["deleted_at"] = Stamp, ["deleted"] = true }, ["_local_scope_id"] = Scope }.ToJsonString();
restoreState.CacheRevisions[LegacyPath(First, "work")] = 21;
restoreState.Outbox.Add(Operation(80, "POST", new JsonObject { ["version"] = 7, ["save_id"] = Id(9080) }, PendingStatus.Unknown) with
    { Path = NotePath(80) + "/restore" });
restoreState.Outbox.Add(new PendingOperation { Id = "synthetic-legacy-restore", ResourceKey = "/api/v1/daily-notes/" + First + "?category=work",
    Method = "POST", Path = "/api/v1/daily-notes/" + First + "/restore?category=work", Status = PendingStatus.Queued,
    BodyJson = new JsonObject { ["version"] = 8, ["save_id"] = Id(9081) }.ToJsonString() });
var restoreView = NoteHistory.Build(restoreState, Month);
Check(restoreView.BaselineTotal == 0 && restoreView.Total == 2 && restoreView.UncertainCount == 2 &&
    Find(restoreView, 80).LocalStatus == "Unknown" && restoreView.Items.Single(item => item.Source == "legacy_daily_note").LocalStatus == "Queued",
    "note/legacy restore routes lost local recovery intent, visibility or unresolved status");

var draftState = State(Envelope(Month, Day(First, Item(30, "基线正文"))));
var draftKey = NotePath(30); var draftValues = FullRow(30, text: "本机草稿不等于已保存");
draftState.Drafts[draftKey] = new LocalDraft { Key = draftKey, Text = new JsonObject { ["kind"] = "note", ["key"] = draftKey,
    ["original"] = FullRow(30), ["values"] = draftValues }.ToJsonString(), Title = "合成未排队草稿", BaseVersion = 7 };
var newDraftKey = NotePath(31); var newValues = FullRow(31, "2024-02-05", "只在草稿中的新增"); newValues["version"] = 0;
draftState.Drafts[newDraftKey] = new LocalDraft { Key = newDraftKey, Text = new JsonObject { ["kind"] = "note", ["key"] = newDraftKey,
    ["original"] = newValues.DeepClone(), ["values"] = newValues }.ToJsonString(), Title = "合成新草稿", BaseVersion = 0 };
var draftsBefore = JsonSerializer.Serialize(draftState); var draftView = NoteHistory.Build(draftState, Month);
Check(draftView.BaselineTotal == 1 && draftView.Total == 1 && Find(draftView, 30).Text == "基线正文" && Find(draftView, 30).HasDraft &&
    Find(draftView, 30).DraftKey == draftKey && draftView.LocalDrafts.Any(draft => draft.Key == newDraftKey && draft.Date == new DateOnly(2024, 2, 5)),
    "draft source vanished, overwrote server baseline text or changed server totals");
var output = Find(draftView, 30).Data; output["text"] = "试图改写返回副本";
Check(JsonSerializer.Serialize(draftState) == draftsBefore && Find(NoteHistory.Build(draftState, Month), 30).Text == "基线正文",
    "history returned shared nodes or modified the original workspace");
var draftDateState = State(Envelope());
foreach (var draftId in new[] { 95, 96 })
{
    var key = NotePath(draftId); var values = FullRow(draftId, "2024-02-08", "草稿日期证据 " + draftId.ToString(CultureInfo.InvariantCulture));
    if (draftId == 96) values.Remove("date");
    draftDateState.Drafts[key] = new LocalDraft { Key = key, Text = new JsonObject { ["kind"] = "note", ["key"] = key,
        ["original"] = values.DeepClone(), ["values"] = values }.ToJsonString(), Title = "合成草稿来源",
        UpdatedAt = DateTimeOffset.Parse("2024-02-08T01:00:00Z", CultureInfo.InvariantCulture), BaseVersion = 7 };
    draftDateState.Outbox.Add(Operation(draftId, "DELETE", new JsonObject { ["version"] = 7, ["save_id"] = Id(9095 + draftId) }, PendingStatus.Unknown));
}
var draftDateView = NoteHistory.Build(draftDateState, Month);
Check(draftDateView.Days.Single(day => day.Date == new DateOnly(2024, 2, 8)).UncertainCount == 1 && draftDateView.UnattributedOperationCount == 1 &&
    draftDateView.UncertainCount == 2 && draftDateView.LocalDrafts.Single(draft => draft.Key == NotePath(96)).Date == null,
    "known draft date was ignored for undated delete, or UpdatedAt was guessed as an entity date");

var foreignState = State(source); foreignState.Cache[MonthPath()] = source.ToJsonString().Replace(Scope, "foreign-scope", StringComparison.Ordinal);
foreignState.Cache[DayPath(First)] = FullDay(First, "life", FullRow(40, text: "跨身份不可泄漏")).ToJsonString().Replace(Scope, "foreign-scope", StringComparison.Ordinal);
var foreignView = NoteHistory.Build(foreignState, Month);
Check(!foreignView.Complete && foreignView.Total == 0 && foreignView.Issues.Count > 0 &&
    !JsonSerializer.Serialize(foreignView).Contains("跨身份不可泄漏", StringComparison.Ordinal), "foreign scope data leaked through a fallback cache");
var lateState = State(Envelope("2024-03", Day("2024-03-01", Item(41, "迟来的三月")))); var lateView = NoteHistory.Build(lateState, Month);
Check(!lateView.Complete && lateView.Total == 0 && lateView.Issues.Count > 0, "late different-month body was relabeled as a complete requested month");
var badDailyState = State(); var badDaily = FullDay(First, "life", FullRow(42)); badDaily["data"]!["entries"]![0]!.AsObject().Remove("labels");
badDailyState.Cache[DayPath(First)] = badDaily.ToJsonString(); var badDailyBefore = JsonSerializer.Serialize(badDailyState);
var badDailyView = NoteHistory.Build(badDailyState, Month);
Check(!badDailyView.Complete && badDailyView.Total == 0 && badDailyView.Issues.Count > 0 && badDailyView.Days[0].Issue != null &&
    JsonSerializer.Serialize(badDailyState) == badDailyBefore, "corrupt relevant daily row silently became complete empty data or modified its source");

var escaped = Envelope(Month, Day(First, Enumerable.Range(100, 16).Select(n => Item(n, new string('<', 60000))).ToArray()));
var escapedJson = escaped.ToJsonString();
var semanticJson = escaped.ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
Check(Encoding.UTF8.GetByteCount(escapedJson) > 5 * 1024 * 1024 && Encoding.UTF8.GetByteCount(semanticJson) < 1024 * 1024 &&
    NoteHistory.ParseBaseline(escapedJson, Month, Scope).Items.Count == 16, "local JSON escaping was mistaken for the source network byte budget");
var oversizedText = Envelope(Month, Day(First, Item(120, new string('a', 65537))));
Check(NoteHistory.ParseBaseline(oversizedText.ToJsonString(), Month).Items.Single().Text.Length == 65537,
    "month read incorrectly applied the write-only single-note byte limit to historical source text");
var tooMany = Envelope(Month, Day(First, Enumerable.Range(1000, 2001).Select(n => Item(n, "")).ToArray()));
Reject(() => NoteHistory.ParseBaseline(tooMany.ToJsonString(), Month), "source row limit was silently truncated or ignored");
var atLimit = Envelope(Month, Enumerable.Range(0, 10).Select(day => Day("2024-02-" + (day + 1).ToString("D2", CultureInfo.InvariantCulture),
    Enumerable.Range(10000 + day * 200, 200).Select(n => Item(n, "")).ToArray())).ToArray());
Check(NoteHistory.ParseBaseline(atLimit.ToJsonString(), Month).Items.Count == 2000, "exact source row budget was rejected");
var tooLarge = Envelope(Month, Day(First, Enumerable.Range(2000, 18).Select(n => Item(n, new string('a', 60000))).ToArray()));
Reject(() => NoteHistory.ParseBaseline(tooLarge.ToJsonString(), Month), "whole-source semantic UTF-8 byte limit was ignored");
var tooLargeLocal = Envelope(); tooLargeLocal["future_cache_metadata"] = new string('a', 8 * 1024 * 1024);
Reject(() => NoteHistory.ParseBaseline(tooLargeLocal.ToJsonString(), Month), "raw local cache parser ignored the eight-MiB ceiling");
var previewState = State(Envelope(Month, Day(First, Enumerable.Range(3000, 150).Select(n => Item(n, "有界预览")).ToArray())));
var preview = NoteHistory.Build(previewState, Month);
Check(preview.Total == 150 && preview.FilteredCount == 150 && preview.Days[0].Items.Count <= 100 && preview.Days[0].Items.Count > 0,
    "bounded day preview silently changed known or filtered totals");
Check(preview.Items.Count == 150, "bounded day previews also truncated the explicit full filtered result");
var byteBudgetState = State();
byteBudgetState.Outbox.Add(Operation(70, "PUT", Save(First, new string('a', 8 * 1024 * 1024))));
var byteBudgetBefore = JsonSerializer.Serialize(byteBudgetState);
Reject(() => NoteHistory.Build(byteBudgetState, Month), "aggregate local request parsing exceeded the byte ceiling without a clear error");
Check(JsonSerializer.Serialize(byteBudgetState) == byteBudgetBefore, "budget failure modified original requests or workspace state");
var rowBudgetState = State();
rowBudgetState.Outbox.AddRange(Enumerable.Range(20000, 10001).Select(n => Operation(n, "PUT", Save(First, "", version: 0))));
Reject(() => NoteHistory.Build(rowBudgetState, Month), "aggregate local row budget silently truncated unresolved operations");
var receiptBudgetState = State();
receiptBudgetState.Outbox.Add(Operation(90, "PUT", Save(First, "已有请求日期"), PendingStatus.Unknown) with
    { RemoteJson = new JsonObject { ["data"] = new JsonObject { ["id"] = Id(90), ["date"] = First, ["future_metadata"] = new string('a', 8 * 1024 * 1024) } }.ToJsonString() });
var receiptBefore = JsonSerializer.Serialize(receiptBudgetState);
Reject(() => NoteHistory.Build(receiptBudgetState, Month), "retained receipt bytes escaped the total budget when the request already supplied its date");
Check(JsonSerializer.Serialize(receiptBudgetState) == receiptBefore, "receipt budget failure modified raw requests or remote receipt");
var expansionState = State(Envelope(Month, Day(First, Item(91, "多次待同步修改的原始合成基线"))));
expansionState.Outbox.AddRange(Enumerable.Range(0, 50).Select(index => Operation(91, "PUT", Save(First, "本机连续修改 " + index.ToString(CultureInfo.InvariantCulture))) with
    { Id = "synthetic-expansion-" + index.ToString(CultureInfo.InvariantCulture) }));
var expansionBefore = JsonSerializer.Serialize(expansionState);
Reject(() => NoteHistory.Build(expansionState, Month), "nested projection expansion was not rejected before allocating unbounded local provenance");
Check(JsonSerializer.Serialize(expansionState) == expansionBefore, "projection expansion guard modified original cache or queue");

Console.WriteLine($"PASS {checks} isolated native note history model checks; real calendar/month scope, strict v3 source, read-only summary, partial cache, local drafts/intents and budgets; no sockets or real user data.");
