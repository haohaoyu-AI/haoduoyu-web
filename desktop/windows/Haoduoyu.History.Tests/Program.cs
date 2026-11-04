using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var checks = 0;
void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); checks++; }
void Reject(Action action, string message)
{
    try { action(); } catch (InvalidDataException) { checks++; return; }
    throw new InvalidOperationException(message);
}
var anchor = new DateOnly(2026, 10, 30); var week = TodoHistory.Week(anchor);
string Id(int n) => "00000000-0000-4000-8000-" + n.ToString("D12", System.Globalization.CultureInfo.InvariantCulture);
string Path(DateOnly date) => "/api/v1/todos?date=" + date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
JsonObject Row(int n, DateOnly date, string text = "合成待办", bool done = false) => new()
{
    ["id"] = Id(n), ["date"] = date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), ["text"] = text,
    ["completed"] = done, ["version"] = 3, ["created_at"] = "2026-10-27T01:00:00.000Z", ["updated_at"] = "2026-10-27T02:00:00.000Z", ["deleted_at"] = null
};
JsonObject Envelope(DateOnly date, params JsonObject[] rows) => new()
{
    ["data"] = new JsonObject { ["date"] = date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture), ["today"] = "2026-11-04",
        ["completed_mode"] = "hide", ["preferences_version"] = 4, ["items"] = new JsonArray(rows.Select(row => (JsonNode?)row).ToArray()) },
    ["_local_scope_id"] = "synthetic-history-partition"
};
PendingOperation Operation(string method, int id, JsonObject body, PendingStatus status = PendingStatus.Queued, string? route = null) => new()
{
    Id = "synthetic-operation-" + id, ResourceKey = "/api/v1/todos/" + Id(id), Method = method,
    Path = route ?? "/api/v1/todos/" + Id(id), BodyJson = body.ToJsonString(), Status = status,
    CreatedAt = DateTimeOffset.Parse("2026-11-04T01:00:00Z", System.Globalization.CultureInfo.InvariantCulture)
};

Check(TodoHistory.Month(new(2024, 2, 29)).Dates.Count == 29 && TodoHistory.Month(new(2025, 2, 28)).Dates.Count == 28 &&
    TodoHistory.Month(new(2026, 4, 3)).Dates.Count == 30 && TodoHistory.Month(new(2026, 10, 31)).Dates.Count == 31,
    "calendar month lengths or leap day were inferred incorrectly");
Check(week.Start == new DateOnly(2026, 10, 26) && week.End == new DateOnly(2026, 11, 1) && week.Dates.Count == 7 &&
    week.Start.DayOfWeek == DayOfWeek.Monday && week.End.DayOfWeek == DayOfWeek.Sunday, "natural week was split at the month boundary");
Check(TodoHistory.Week(DateOnly.MaxValue).IsClipped && TodoHistory.Week(DateOnly.MaxValue).Dates.Count == 5 &&
    TodoHistory.Week(DateOnly.MaxValue).Shift(1) == null && TodoHistory.Month(DateOnly.MinValue).Shift(-1) == null &&
    TodoHistory.Month(DateOnly.MaxValue).Shift(int.MaxValue) == null && week.Shift(1)!.Start == week.Start.AddDays(7), "range navigation overflowed or hid clipped dates");
Check(TodoHistory.BeijingToday(DateTimeOffset.Parse("2026-11-04T16:00:00Z", System.Globalization.CultureInfo.InvariantCulture)) == new DateOnly(2026, 11, 5) &&
    TodoHistory.BeijingToday(DateTimeOffset.MaxValue) == DateOnly.MaxValue, "Beijing today used UTC or overflowed at the date boundary");

var template = Row(1, week.Start, "原始合成😀\n第二行"); template["template_id"] = Id(50); template["template_version"] = 2; template["template_active"] = false;
template["future_nested"] = new JsonObject { ["zero"] = 0, ["missing"] = null };
var valid = Envelope(week.Start, template); var parsed = TodoHistory.ParseDay(valid.ToJsonString(), week.Start, "synthetic-history-partition");
var detached = parsed.Data; detached["items"]!.AsArray().Clear();
Check(parsed.Date == week.Start && parsed.Today == new DateOnly(2026, 11, 4) && parsed.CompletedMode == "hide" && parsed.PreferencesVersion == 4 &&
    parsed.Items.Single()["text"]!.GetValue<string>() == "原始合成😀\n第二行" && parsed.Items.Single()["future_nested"]!["zero"]!.GetValue<int>() == 0,
    "strict day parsing changed original Unicode, metadata or detached DTOs");
var absent = Envelope(week.Start); absent["data"]!.AsObject().Remove("today");
Reject(() => TodoHistory.ParseDay(absent.ToJsonString(), week.Start), "day without a real today field was accepted");
var wrong = Envelope(week.Start, Row(2, week.Start)); wrong["data"]!["items"]![0]!["created_at"] = "2026-10-27";
Reject(() => TodoHistory.ParseDay(wrong.ToJsonString(), week.Start), "date-only string was accepted as an original timestamp");
var partialTemplate = Envelope(week.Start, Row(3, week.Start)); partialTemplate["data"]!["items"]![0]!["template_id"] = Id(50);
Reject(() => TodoHistory.ParseDay(partialTemplate.ToJsonString(), week.Start), "partial template linkage was accepted");
Reject(() => TodoHistory.ParseDay(valid.ToJsonString(), week.Start, "other-partition"), "foreign partition cache was accepted");
Reject(() => TodoHistory.ParseDay("{\"data\":{},\"data\":{}}", week.Start), "duplicate JSON properties were accepted");

var first = week.Start; var second = first.AddDays(1); var third = first.AddDays(2); var fourth = first.AddDays(3);
var removed = Row(12, first, "服务端已删除的合成条目"); removed["deleted_at"] = "2026-10-27T03:00:00Z";
var firstEnvelope = Envelope(first, Row(10, first, "alpha 合成事项"), Row(11, first, "完成😀", true), removed);
firstEnvelope["_local_todo_history"] = new JsonObject { ["scope_id"] = new string('a', 64), ["batch_id"] = Id(400),
    ["range_start"] = week.Start.ToString("yyyy-MM-dd"), ["range_end"] = week.End.ToString("yyyy-MM-dd"), ["read_revision"] = 7,
    ["observed_at_utc"] = "2026-11-04T01:00:00.000Z" };
var state = new WorkspaceState { ScopeId = "synthetic-history-partition", LocalRevision = 9,
    Cache = new() { [Path(first)] = firstEnvelope.ToJsonString(),
        [Path(second)] = Envelope(second).ToJsonString() },
    CacheRevisions = new() { [Path(first)] = 6, [Path(second)] = 7 },
    Drafts = new() { ["unrelated"] = new() { Key = "unrelated", Text = "原始草稿" } } };
var baseline = TodoHistory.Build(state, week);
Check(baseline.CoveredDays == 2 && baseline.MissingDates.Count == 5 && !baseline.Complete && baseline.Total == 2 && baseline.Done == 1 &&
    baseline.Open == 1 && baseline.ActiveDays == 1 && baseline.Days[1].Complete && baseline.Days[1].Total == 0 && !baseline.Days[2].Complete &&
    baseline.Days[0].ObservedAtUtc == DateTimeOffset.Parse("2026-11-04T01:00:00Z", System.Globalization.CultureInfo.InvariantCulture),
    "missing days became confirmed empty days, hide removed completed rows, or soft deletes were counted");
var filtered = TodoHistory.Build(state, week, new(Query: "😀", Completed: true));
Check(filtered.Total == 2 && filtered.FilteredCount == 1 && filtered.Days[0].Items.Single()["id"]!.GetValue<string>() == Id(11),
    "filtering changed overall known totals or lost Unicode search");
state.Outbox.Add(Operation("POST", 20, new JsonObject { ["id"] = Id(20), ["date"] = third.ToString("yyyy-MM-dd"), ["text"] = "缺日仍可见的本机新增" }, route: "/api/v1/todos"));
state.Outbox.Add(Operation("DELETE", 10, new JsonObject { ["date"] = first.ToString("yyyy-MM-dd"), ["version"] = 3 }, PendingStatus.Unknown));
var pending = TodoHistory.Build(state, week);
Check(pending.Total == 2 && pending.Done == 1 && pending.CoveredDays == 2 && !pending.Days[2].Complete && pending.Days[2].Items.Single()["_local_status"]!.GetValue<string>() == "Queued" &&
    pending.Days[0].Total == 1 && pending.Days[0].BaselineTotal == 2 && pending.Days[0].UncertainCount == 1 && pending.UncertainCount == 2,
    "pending-only day became complete or hidden unknown delete became server-confirmed zero");
state.Outbox.Add(Operation("PATCH", 90, new JsonObject { ["completed"] = true, ["version"] = 1 }, PendingStatus.Unknown));
var outside = new DateOnly(2026, 11, 4); state.Cache[Path(outside)] = Envelope(outside, Row(91, outside)).ToJsonString();
state.Outbox.Add(Operation("PATCH", 91, new JsonObject { ["completed"] = true, ["version"] = 3 }, PendingStatus.Unknown));
state.Outbox.Add(new PendingOperation { Id = "unrelated-malformed-article", Path = "/api/v1/articles/" + Id(92), BodyJson = "not-json", Status = PendingStatus.Unknown });
var orphan = TodoHistory.Build(state, week);
Check(orphan.UnattributedOperationCount == 1 && orphan.UncertainCount == 3 && orphan.Days.Sum(day => day.UncertainCount) == 2,
    "date-unverified completion was discarded, outside-range completion was miscounted, or unrelated JSON affected todos");
var partial = Envelope(fourth, Row(30, fourth, "已知部分条目")); partial["_local_incomplete"] = true;
state.Cache[Path(fourth)] = partial.ToJsonString();
var incomplete = TodoHistory.Build(state, week);
var incompleteItem = Row(60, first, "可读但部分资料未知"); incompleteItem["_local_incomplete"] = true;
var incompleteState = state with { Cache = new Dictionary<string, string>(state.Cache) { ["/api/v1/todos/" + Id(60)] = new JsonObject { ["data"] = incompleteItem }.ToJsonString() },
    CacheRevisions = new Dictionary<string, long>(state.CacheRevisions) { ["/api/v1/todos/" + Id(60)] = 9 } };
var incompleteProjection = TodoHistory.Build(incompleteState, week);
Check(incomplete.CoveredDays == 2 && !incomplete.Days[3].Complete && incomplete.Days[3].Total == 1 && incomplete.Days[3].Issue != null &&
    !incompleteProjection.Days[0].Complete && incompleteProjection.Days[0].Items.Any(row => row["id"]!.GetValue<string>() == Id(60)),
    "the projection washed a partial cached day into complete authority");
var foreign = Envelope(first.AddDays(4), Row(40, first.AddDays(4), "不可泄漏的跨工作区文字")); foreign["_local_scope_id"] = "foreign-partition";
state.Cache[Path(first.AddDays(4))] = foreign.ToJsonString();
var bad = Envelope(first.AddDays(5)); bad["data"]!["items"] = null; state.Cache[Path(first.AddDays(5))] = bad.ToJsonString();
var rejectedCaches = TodoHistory.Build(state, week);
Check(rejectedCaches.CoveredDays == 2 && rejectedCaches.Days[4].Total == 0 && !rejectedCaches.Days[4].Complete &&
    rejectedCaches.Days[5].Issue != null && !JsonSerializer.Serialize(rejectedCaches).Contains("不可泄漏", StringComparison.Ordinal),
    "bad or foreign day caches leaked into history or implied empty coverage");
var before = JsonSerializer.Serialize(state); var returned = TodoHistory.Build(state, week); returned.Days[2].Items.Single()["text"] = "返回对象试图改写";
Check(JsonSerializer.Serialize(state) == before && TodoHistory.Build(state, week).Days[2].Items.Single()["text"]!.GetValue<string>() == "缺日仍可见的本机新增",
    "history mutated original cache, revision, draft, outbox or returned shared row references");

var large = Envelope(first, Enumerable.Range(1000, 500).Select(n => Row(n, first, string.Concat(Enumerable.Repeat("😀", 250)))).ToArray()).ToJsonString();
Check(Encoding.UTF8.GetByteCount(large) > 1024 * 1024 && Encoding.UTF8.GetByteCount(large) < TodoHistory.MaximumDayCacheBytes &&
    TodoHistory.ParseDay(large, first).Items.Count == 500, "legitimate encrypted-cache emoji escaping was limited to the one-MiB wire ceiling");
var tooMany = Envelope(first); tooMany["data"]!["items"] = new JsonArray(Enumerable.Range(0, TodoHistory.MaximumItemsPerDay + 1).Select(_ => (JsonNode?)new JsonObject()).ToArray());
Reject(() => TodoHistory.ParseDay(tooMany.ToJsonString(), first), "single-day item budget was ignored");

Console.WriteLine($"PASS {checks} synthetic todo history model checks; calendar boundaries, exact-day coverage, pending/delete provenance, Unicode and immutable state; no sockets or real user data.");
var downloadChecks = await HistoryDownloadChecks.RunAsync();
Console.WriteLine($"PASS {checks + downloadChecks} total isolated todo history checks ({checks} model + {downloadChecks} download).");
