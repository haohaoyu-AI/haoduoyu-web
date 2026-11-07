using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Core;

public sealed class NoteHistoryRange
{
    internal NoteHistoryRange(DateOnly anchor)
    {
        Start = new(anchor.Year, anchor.Month, 1);
        End = new(anchor.Year, anchor.Month, DateTime.DaysInMonth(anchor.Year, anchor.Month));
        Month = Start.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        Dates = Array.AsReadOnly(Enumerable.Range(Start.DayNumber, End.DayNumber - Start.DayNumber + 1).Select(DateOnly.FromDayNumber).ToArray());
    }
    public string Month { get; }
    public DateOnly Start { get; }
    public DateOnly End { get; }
    public IReadOnlyList<DateOnly> Dates { get; }
    public NoteHistoryRange? Shift(int steps)
    { try { return new(Start.AddMonths(steps)); } catch (ArgumentOutOfRangeException) { return null; } }
}

public sealed record NoteHistoryFilter(string Source = "all", string Label = "", string Query = "");

public sealed class NoteHistoryItem
{
    private readonly JsonObject data;
    internal NoteHistoryItem(DateOnly date, JsonObject row, string? draftKey = null)
    {
        Date = date; data = (JsonObject)row.DeepClone(); data["date"] = date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        // A month row is always a read-only summary, including when a separate full receipt supplied it.
        data["_local_incomplete"] = true;
        EntityId = NoteHistory.String(row["entity_id"]); Source = NoteHistory.String(row["source"]);
        Category = NoteHistory.String(row["category"]); Text = NoteHistory.String(row["text"]);
        Labels = Array.AsReadOnly(NoteHistory.Labels(row["labels"]));
        LocalStatus = row["_local_status"] is JsonValue status && status.TryGetValue<string>(out var value) ? value : null;
        DraftKey = draftKey;
    }
    public DateOnly Date { get; }
    public string EntityId { get; }
    public string Source { get; }
    public string Category { get; }
    public string Text { get; }
    public IReadOnlyList<string> Labels { get; }
    public string? LocalStatus { get; }
    public string? DraftKey { get; }
    public bool HasDraft => DraftKey != null;
    public JsonObject Data => (JsonObject)data.DeepClone();
}

public sealed class NoteHistoryBaseline
{
    private readonly JsonObject data;
    private readonly NoteHistoryItem[] items;
    internal NoteHistoryBaseline(string month, JsonObject value, NoteHistoryItem[] rows)
        => (Month, data, items) = (month, (JsonObject)value.DeepClone(), rows);
    public string Month { get; }
    public JsonObject Data => (JsonObject)data.DeepClone();
    public IReadOnlyList<NoteHistoryItem> Items => Array.AsReadOnly(items);
}

public sealed record NoteHistoryDraft(string Key, DateOnly? Date, string? Category, string Text, string Title);

public sealed class NoteHistoryDayView
{
    internal NoteHistoryDayView(DateOnly date, bool hasBaseline, bool complete, string? issue, NoteHistoryItem[] all,
        NoteHistoryItem[] filtered, int baselineTotal, int uncertainCount)
    {
        Date = date; HasBaseline = hasBaseline; Complete = complete; Issue = issue;
        Total = all.Length; FilteredCount = filtered.Length; BaselineTotal = baselineTotal; UncertainCount = uncertainCount;
        Items = Array.AsReadOnly(filtered.Take(NoteHistory.MaximumDayPreview).ToArray());
    }
    public DateOnly Date { get; }
    public bool HasBaseline { get; }
    public bool Complete { get; }
    public string? Issue { get; }
    public IReadOnlyList<NoteHistoryItem> Items { get; }
    public int Total { get; }
    public int FilteredCount { get; }
    public int BaselineTotal { get; }
    public int UncertainCount { get; }
}

public sealed class NoteHistoryView
{
    internal NoteHistoryView(NoteHistoryRange range, NoteHistoryDayView[] days, NoteHistoryItem[] filtered,
        string[] labels, NoteHistoryDraft[] drafts, int unattributed, string[] issues)
    {
        Range = range; Days = Array.AsReadOnly(days); Items = Array.AsReadOnly(filtered);
        KnownLabels = Array.AsReadOnly(labels); LocalDrafts = Array.AsReadOnly(drafts); Issues = Array.AsReadOnly(issues);
        Total = days.Sum(day => day.Total); BaselineTotal = days.Sum(day => day.BaselineTotal);
        FilteredCount = filtered.Length; ActiveDays = days.Count(day => day.Total > 0); CoveredDays = days.Count(day => day.Complete);
        UnattributedOperationCount = unattributed; UncertainCount = days.Sum(day => day.UncertainCount) + unattributed;
    }
    public NoteHistoryRange Range { get; }
    public IReadOnlyList<NoteHistoryDayView> Days { get; }
    public IReadOnlyList<NoteHistoryItem> Items { get; }
    public IReadOnlyList<string> KnownLabels { get; }
    public IReadOnlyList<NoteHistoryDraft> LocalDrafts { get; }
    public IReadOnlyList<string> Issues { get; }
    public int Total { get; }
    public int BaselineTotal { get; }
    public int FilteredCount { get; }
    public int ActiveDays { get; }
    public int CoveredDays { get; }
    public bool Complete => CoveredDays == Days.Count;
    public int UncertainCount { get; }
    public int UnattributedOperationCount { get; }
}

/// <summary>Detached month summaries. Coverage requires the exact validated month response; no write version is inferred.</summary>
public static class NoteHistory
{
    public const int MaximumSourceItems = 2000;
    public const int MaximumSourceBytes = 1024 * 1024;
    public const int MaximumLocalBytes = 8 * 1024 * 1024;
    public const int MaximumLocalItems = 10000;
    public const int MaximumDayPreview = 100;
    private const long MaxSafe = 9_007_199_254_740_991;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly Regex StampPattern = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);
    private sealed record Route(string Kind, string Mode, string Id, DateOnly? Date, string? Category);
    private sealed record DraftInfo(NoteHistoryDraft View, string Identity, string[] Labels);
    private sealed class Budget
    {
        private long bytes;
        private int rows;
        private bool rowLimitExceeded;
        public void Read(string raw)
        { bytes += Utf8.GetByteCount(raw); if (bytes > MaximumLocalBytes) throw Invalid("本月本机资料超过 8MiB 读取预算"); }
        public void Rows(int count)
        { rows = checked(rows + count); if (rows > MaximumLocalItems) { rowLimitExceeded = true; throw Invalid("本月本机资料超过 10000 行预算"); } }
        public void Ensure() { if (rowLimitExceeded) throw Invalid("本月本机资料超过 10000 行预算"); }
    }

    public static NoteHistoryRange Month(DateOnly anchor) => new(anchor);
    public static DateOnly BeijingToday(DateTimeOffset at) => TodoHistory.BeijingToday(at);
    public static void ValidateSource(string envelopeJson, string expectedMonth, string? expectedScope = null)
        => _ = ParseBaseline(envelopeJson, expectedMonth, expectedScope);

    public static NoteHistoryBaseline ParseBaseline(string envelopeJson, string expectedMonth, string? expectedScope = null)
    {
        try
        {
            var range = ParseMonth(expectedMonth); var root = ParseEnvelope(envelopeJson, expectedScope);
            RejectProjection(root, true); var data = Object(root["data"]); RejectProjection(data);
            if (String(data["format"]) != "haoduoyu-note-month-v1" || String(data["month"]) != expectedMonth ||
                !Boolean(data["complete"]) || Integer(data["labels_version"], 0) != 3) throw Invalid("碎碎念完整月份或标签协议不一致");
            var days = Array(data["days"]); if (days.Count > range.Dates.Count) throw Invalid("月响应日数无效");
            var dates = new HashSet<DateOnly>(); var identities = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var items = new List<NoteHistoryItem>();
            foreach (var node in days)
            {
                var day = Object(node); RejectProjection(day); var date = Date(day["date"]);
                if (date < range.Start || date > range.End || !dates.Add(date)) throw Invalid("月响应日期越界或重复");
                foreach (var value in Array(day["items"]))
                {
                    var row = Object(value); ValidateSummary(row, date, true);
                    if (!identities.Add(String(row["entity_id"]))) throw Invalid("月响应实体重复");
                    if (items.Count >= MaximumSourceItems) throw Invalid("月响应超过 2000 条源记录");
                    items.Add(new(date, row));
                }
            }
            // Cache JSON may escape non-ASCII/HTML characters. Count the equivalent JSON.stringify({data})
            // bytes, not the expanded encrypted-cache representation. HTTP retains its separate raw 1MiB cap.
            using var document = JsonDocument.Parse(envelopeJson);
            if (WireBytes(document.RootElement.GetProperty("data")) + 9 > MaximumSourceBytes) throw Invalid("月响应超过 1MiB 源协议预算");
            return new(expectedMonth, data, items.ToArray());
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or FormatException or OverflowException)
        { throw Invalid("碎碎念月资料未通过完整结构校验", error); }
    }

    public static NoteHistoryView Build(WorkspaceState state, string month, NoteHistoryFilter? filter = null)
    {
        ArgumentNullException.ThrowIfNull(state);
        if (string.IsNullOrWhiteSpace(state.ScopeId)) throw Invalid("缺少当前工作区身份");
        var range = ParseMonth(month); filter ??= new();
        if (filter.Source is not ("all" or "life" or "work") || filter.Label == null || filter.Query == null || filter.Query.Length > 500)
            throw new ArgumentException("月份筛选条件无效。", nameof(filter));
        _ = Utf8.GetByteCount(filter.Query); if (filter.Label.Length > 128) throw new ArgumentException("标签筛选超过预算。", nameof(filter));
        var budget = new Budget(); var issues = new List<string>(); var dayIssues = new Dictionary<DateOnly, string>();
        var cache = new Dictionary<string, string>(StringComparer.Ordinal); var revisions = new Dictionary<string, long>(StringComparer.Ordinal);
        var knownDates = new Dictionary<string, DateOnly>(StringComparer.OrdinalIgnoreCase); var knownDays = new HashSet<DateOnly>();
        var exactPath = MonthPath(month); NoteHistoryBaseline? baseline = null;
        if (state.Cache.TryGetValue(exactPath, out var exact))
        {
            budget.Read(exact);
            try
            {
                baseline = ParseBaseline(exact, month, state.ScopeId); budget.Rows(baseline.Items.Count);
                Keep(exactPath, exact); foreach (var item in baseline.Items) knownDates[item.EntityId] = item.Date;
            }
            catch (InvalidDataException) { issues.Add("该月缓存未通过月份、工作区或完整协议校验，完整情况未知"); }
        }
        foreach (var (path, raw) in state.Cache)
        {
            var route = ParseRoute(path); if (path == exactPath || route == null || route.Mode is "month" or "restore") continue;
            if (route.Date is { } date && (date < range.Start || date > range.End)) continue;
            // Only note/legacy/label routes are parsed. Broken or huge article/memo caches cannot block this view.
            budget.Read(raw);
            try
            {
                var root = ParseEnvelope(raw, state.ScopeId); var data = Object(root["data"]);
                if (route.Kind == "label") { ValidateLabelCache(data); Keep(path, raw); continue; }
                if (route.Kind == "legacy")
                {
                    var row = ValidateLegacy(data, route); budget.Rows(1); knownDays.Add(route.Date!.Value);
                    knownDates["legacy-" + route.Category + ":" + DateText(route.Date.Value)] = route.Date.Value;
                    Keep(path, root.ToJsonString()); continue;
                }
                if (route.Mode == "list")
                {
                    var rows = Array(data["entries"]); budget.Rows(rows.Count);
                    var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var safe = new List<JsonObject>();
                    foreach (var node in rows)
                    {
                        var row = Object(node); var rowDate = ValidateFull(row);
                        if (rowDate != route.Date || String(row["category"]) != route.Category || !ids.Add(String(row["id"]))) throw Invalid("日记录日期、来源或实体重复");
                        safe.Add(row);
                    }
                    knownDays.Add(route.Date!.Value);
                    foreach (var row in safe) knownDates["note-entry:" + String(row["id"])] = route.Date.Value;
                    // Partial cached lists are evidence of these rows, never deletion authority.
                    if (HasProjection(root) || HasProjection(data) || safe.Any(HasProjection))
                    { foreach (var row in safe) SeedDetail(row, path); dayIssues[route.Date.Value] = "该日仅有部分缓存记录"; }
                    else Keep(path, raw);
                }
                else
                {
                    var dateFromRow = ValidateFull(data);
                    if (!String(data["id"]).Equals(route.Id, StringComparison.OrdinalIgnoreCase)) throw Invalid("实体缓存标识不一致");
                    if (dateFromRow < range.Start || dateFromRow > range.End) continue;
                    budget.Rows(1); knownDays.Add(dateFromRow); knownDates["note-entry:" + route.Id] = dateFromRow; Keep(path, raw);
                }
            }
            catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
            {
                var message = "部分碎碎念缓存未通过结构或工作区校验"; issues.Add(message);
                if (route.Date is { } invalidDate) dayIssues[invalidDate] = message;
            }
        }
        budget.Ensure();
        var drafts = new List<DraftInfo>();
        foreach (var (key, draft) in state.Drafts)
        {
            var route = ParseRoute(key); if (route == null || route.Kind is not ("note" or "legacy") || route.Mode != "detail") continue;
            if (route.Date is { } routeDraftDate && (routeDraftDate < range.Start || routeDraftDate > range.End)) continue;
            budget.Read(draft.Text);
            try
            {
                var value = ParseObject(draft.Text); var values = Object(value["values"]);
                if (String(value["kind"]) != (route.Kind == "note" ? "note" : "legacy") || String(value["key"]) != key || draft.Key != key) throw Invalid("草稿来源不一致");
                var original = Object(value["original"]); var date = TryDate(values["date"], out var draftDate) ? draftDate : route.Date;
                var category = route.Kind == "legacy" ? route.Category : Category(values["category"]);
                var identity = route.Kind == "legacy" ? "legacy-" + category + ":" + DateText(route.Date!.Value) : "note-entry:" + route.Id;
                if (route.Kind == "note" && (StringOrEmpty(values["id"]) is { Length: > 0 } id && !id.Equals(route.Id, StringComparison.OrdinalIgnoreCase) ||
                    StringOrEmpty(original["id"]) is { Length: > 0 } originalId && !originalId.Equals(route.Id, StringComparison.OrdinalIgnoreCase))) throw Invalid("草稿实体不一致");
                var labels = route.Kind == "legacy" ? new[] { category == "work" ? "工作" : "生活" } : Labels(values["labels"]);
                drafts.Add(new(new(key, date, category, String(values["text"]), draft.Title), identity, labels)); budget.Rows(1);
                if (date is { } knownDraftDate) knownDates.TryAdd(identity, knownDraftDate);
            }
            catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
            { issues.Add("有本机碎碎念草稿无法核实来源或日期，原稿已保留"); }
        }
        budget.Ensure();
        var operations = Operations(state.Outbox, knownDates, state.ScopeId, range, budget, out var pendingDays, out var unattributed);
        var projectionState = state with { Cache = cache, CacheRevisions = revisions, Outbox = operations };
        GuardProjection(projectionState);
        var draftKeys = drafts.GroupBy(value => value.Identity, StringComparer.OrdinalIgnoreCase).ToDictionary(group => group.Key, group => group.First().View.Key, StringComparer.OrdinalIgnoreCase);
        var allItems = new List<NoteHistoryItem>(); var baselineItems = baseline?.Items.ToArray() ?? [];
        var projectionOk = true;
        try
        {
            var projected = WorkspaceProjection.Project(exactPath, cache.GetValueOrDefault(exactPath), projectionState);
            if (projected != null) allItems.AddRange(ProjectedItems(projected, month, state.ScopeId, draftKeys));
            if (baseline == null)
            {
                var cachedOnly = WorkspaceProjection.Project(exactPath, null, projectionState with { Outbox = [] });
                if (cachedOnly != null) baselineItems = ProjectedItems(cachedOnly, month, state.ScopeId, new()).ToArray();
            }
        }
        catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
        { projectionOk = false; issues.Add("本机碎碎念投影无法完整核实；原缓存、草稿和同步队列已保留"); allItems.Clear(); }
        if (allItems.Count > MaximumLocalItems) throw Invalid("月投影超过 10000 行预算");
        var filtered = allItems.Where(item => Matches(item.Category, item.Labels, item.Text, filter)).ToArray();
        var catalogLabels = KnownCatalogLabels(projectionState);
        var knownLabels = allItems.SelectMany(item => item.Labels).Concat(catalogLabels).Concat(drafts.Where(d => d.View.Date >= range.Start && d.View.Date <= range.End).SelectMany(d => d.Labels))
            .Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        var days = range.Dates.Select(date =>
        {
            var complete = baseline != null && projectionOk && !dayIssues.ContainsKey(date);
            var hasBaseline = baseline != null || knownDays.Contains(date);
            var issue = dayIssues.GetValueOrDefault(date) ?? (!complete ? "只有本机已知记录，该日完整情况未知" : null);
            return new NoteHistoryDayView(date, hasBaseline, complete, issue, allItems.Where(row => row.Date == date).ToArray(),
                filtered.Where(row => row.Date == date).ToArray(), baselineItems.Count(row => row.Date == date), pendingDays.GetValueOrDefault(date)?.Count ?? 0);
        }).ToArray();
        var localDrafts = drafts.Where(d => (d.View.Date == null || d.View.Date >= range.Start && d.View.Date <= range.End) &&
            Matches(d.View.Category ?? "", d.Labels, d.View.Text, filter)).Select(d => d.View).ToArray();
        return new(range, days, filtered, knownLabels, localDrafts, unattributed, issues.Distinct(StringComparer.Ordinal).ToArray());

        void Keep(string path, string raw)
        { cache[path] = raw; revisions[path] = state.CacheRevisions.GetValueOrDefault(path); }
        void SeedDetail(JsonObject row, string originalPath)
        {
            var path = "/api/v1/note-entries/" + String(row["id"]); var revision = state.CacheRevisions.GetValueOrDefault(originalPath);
            if (cache.TryGetValue(path, out var old))
            {
                var prior = Object(ParseEnvelope(old, state.ScopeId)["data"]);
                if (Integer(prior["version"], 0) > Integer(row["version"], 0) || Integer(prior["version"], 0) == Integer(row["version"], 0) && revisions.GetValueOrDefault(path) > revision) return;
            }
            cache[path] = new JsonObject { ["data"] = row.DeepClone(), ["_local_scope_id"] = state.ScopeId }.ToJsonString(); revisions[path] = revision;
        }
    }

    private static List<PendingOperation> Operations(List<PendingOperation> source, Dictionary<string, DateOnly> known,
        string scope, NoteHistoryRange range, Budget budget, out Dictionary<DateOnly, HashSet<string>> byDay, out int unattributed)
    {
        var keep = new HashSet<string>(StringComparer.Ordinal); byDay = new(); var unknown = new HashSet<string>(StringComparer.Ordinal);
        var readReceipts = new HashSet<string>(StringComparer.Ordinal);
        var lookup = new Dictionary<string, PendingOperation>(StringComparer.Ordinal);
        foreach (var operation in source) if (!lookup.TryAdd(operation.Id, operation)) throw Invalid("同步操作标识重复");
        // Local creates provide evidence for a subsequent text-only update/delete with the same identity.
        foreach (var operation in source)
        {
            var route = ParseRoute(operation.Path); if (route == null || route.Kind is not ("note" or "legacy")) continue;
            budget.Read(operation.RequestBodyJson); var body = TryBody(operation.RequestBodyJson);
            if (body != null) ValidateIntent(body);
            var identity = Identity(route, body);
            if (TryDate(body?["date"], out var date)) known.TryAdd(identity, date);
        }
        foreach (var operation in source)
        {
            var route = ParseRoute(operation.Path); if (route == null) continue;
            if (route.Kind == "label") { keep.Add(operation.Id); continue; }
            var body = TryBody(operation.RequestBodyJson); var identity = Identity(route, body);
            var found = TryDate(body?["date"], out var date) || route.Date is { } routeDate && Assign(routeDate, out date) || known.TryGetValue(identity, out date);
            if (!found && operation.RemoteJson != null)
            {
                budget.Read(operation.RemoteJson); readReceipts.Add(operation.Id);
                try
                {
                    var remote = Object(ParseEnvelope(operation.RemoteJson, scope)["data"]);
                    if (route.Kind == "note" && StringOrEmpty(remote["id"]).Equals(route.Id, StringComparison.OrdinalIgnoreCase)) found = TryDate(remote["date"], out date);
                }
                catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException) { }
            }
            var relevant = !found || date >= range.Start && date <= range.End || known.TryGetValue(identity, out var oldDate) && oldDate >= range.Start && oldDate <= range.End;
            if (relevant) keep.Add(operation.Id);
            if (operation.Status is PendingStatus.Confirmed or PendingStatus.Superseded) continue;
            if (!found) { unknown.Add(operation.Id); continue; }
            if (date < range.Start || date > range.End) continue;
            if (!byDay.TryGetValue(date, out var ids)) byDay[date] = ids = new(StringComparer.Ordinal); ids.Add(operation.Id);
        }
        var pending = new Queue<string>(keep);
        while (pending.TryDequeue(out var id))
        {
            if (!lookup.TryGetValue(id, out var operation)) continue;
            foreach (var related in operation.DependencyIds.Concat(operation.SupersededById == null ? [] : [operation.SupersededById]))
                if (keep.Add(related)) pending.Enqueue(related);
        }
        var result = source.Where(operation => keep.Contains(operation.Id)).ToList();
        foreach (var operation in result)
        {
            // Closure may include a label or other dependency: retain it without parsing unrelated bodies up front.
            if (ParseRoute(operation.Path)?.Kind is not ("note" or "legacy")) budget.Read(operation.RequestBodyJson);
            if (operation.RemoteJson != null && readReceipts.Add(operation.Id)) budget.Read(operation.RemoteJson);
            if (operation.RemoteJson != null) _ = ParseEnvelope(operation.RemoteJson, scope);
            budget.Rows(1);
        }
        unattributed = unknown.Count; return result;
    }

    private static void ValidateIntent(JsonObject body)
    {
        if (body.ContainsKey("date")) _ = Date(body["date"]);
        if (body.ContainsKey("category")) _ = Category(body["category"]);
        if (body.ContainsKey("text")) _ = String(body["text"]);
        if (body.ContainsKey("labels")) _ = Labels(body["labels"]);
        if (body.ContainsKey("version")) _ = Integer(body["version"], 0);
        RejectProjection(body);
    }

    private static string[] KnownCatalogLabels(WorkspaceState state)
    {
        const string path = "/api/v1/note-entries/labels";
        if (!state.Cache.ContainsKey(path) && !state.Outbox.Any(operation => ParseRoute(operation.Path)?.Kind == "label")) return [];
        var projected = WorkspaceProjection.Project(path, state.Cache.GetValueOrDefault(path), state);
        if (projected == null) return [];
        var data = Object(ParseEnvelope(projected, state.ScopeId, false)["data"]);
        return Array(data["labels"]).Select(node => String(Object(node)["name"])).ToArray();
    }

    // WorkspaceProjection retains each operation's prior row as provenance. Repeated edits of the
    // same entity can nest those copies. Refuse an excessive preview before allocating that tree;
    // the original intents stay in the outbox and can still be reviewed/synchronized individually.
    private static void GuardProjection(WorkspaceState state)
    {
        const long maximum = 64L * 1024 * 1024;
        var sizes = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        foreach (var (path, raw) in state.Cache)
        {
            var route = ParseRoute(path); if (route == null) continue;
            var data = Object(ParseEnvelope(raw, state.ScopeId)["data"]);
            if (route.Mode == "month")
            {
                foreach (var day in Array(data["days"])) foreach (var node in Array(Object(day)["items"]))
                { var row = Object(node); Add(String(row["entity_id"]), row); }
            }
            else if (route.Kind == "label")
            {
                foreach (var key in new[] { "labels", "archived_labels" }) if (data[key] is JsonArray rows)
                    foreach (var node in rows) { var row = Object(node); Add("label:" + String(row["name"]), row); }
            }
            else if (route.Mode == "list")
            { foreach (var node in Array(data["entries"])) { var row = Object(node); Add("note-entry:" + String(row["id"]), row); } }
            else Add(Identity(route, data), data);
        }
        long total = sizes.Values.Sum(); if (total > maximum) throw Invalid("月预览展开超过 64MiB 安全预算");
        foreach (var operation in state.Outbox.Where(operation => operation.Status != PendingStatus.Superseded))
        {
            var route = ParseRoute(operation.Path); var body = TryBody(operation.RequestBodyJson);
            var identity = route?.Kind == "label" ? "label:" + StringOrEmpty(body?["name"]) : route != null ? Identity(route, body) : operation.ResourceKey;
            var prior = sizes.GetValueOrDefault(identity, 256);
            var next = checked(prior * 2 + Utf8.GetByteCount(operation.RequestBodyJson) * 6L + (operation.RemoteJson == null ? 0 : Utf8.GetByteCount(operation.RemoteJson) * 6L) + 2048);
            total = checked(total - sizes.GetValueOrDefault(identity) + next); sizes[identity] = next;
            if (total > maximum) throw Invalid("连续本机修改的月预览展开超过 64MiB 安全预算，请先在同步队列核对");
        }
        void Add(string identity, JsonObject row)
        { sizes[identity] = Math.Max(sizes.GetValueOrDefault(identity), Utf8.GetByteCount(row.ToJsonString())); }
    }

    private static IEnumerable<NoteHistoryItem> ProjectedItems(string raw, string month, string scope, Dictionary<string, string> drafts)
    {
        var data = Object(ParseEnvelope(raw, scope, false)["data"]); if (String(data["month"]) != month) throw Invalid("本机投影月份不一致");
        var identities = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var count = 0;
        foreach (var node in Array(data["days"]))
        {
            var day = Object(node); var date = Date(day["date"]); if (DateText(date)[..7] != month) throw Invalid("本机投影日期不一致");
            foreach (var value in Array(day["items"]))
            {
                var row = Object(value); if (++count > MaximumLocalItems) throw Invalid("本机月记录超过预算");
                if (row["labels"] == null && String(row["source"]) == "legacy_daily_note") row["labels"] = new JsonArray(String(row["category"]) == "work" ? "工作" : "生活");
                ValidateSummary(row, date, false); var identity = String(row["entity_id"]);
                if (!identities.Add(identity)) throw Invalid("本机月投影实体重复");
                yield return new(date, row, drafts.GetValueOrDefault(identity));
            }
        }
    }
    private static bool Matches(string category, IEnumerable<string> labels, string text, NoteHistoryFilter filter)
        => (filter.Source == "all" || filter.Source == category) && (filter.Label.Length == 0 || labels.Contains(filter.Label, StringComparer.Ordinal)) &&
            text.Contains(filter.Query, StringComparison.OrdinalIgnoreCase);
    private static void ValidateSummary(JsonObject row, DateOnly date, bool source)
    {
        if (source) RejectProjection(row);
        var identity = String(row["entity_id"]); var kind = String(row["source"]); var category = Category(row["category"]);
        _ = String(row["text"]); _ = Labels(row["labels"]);
        if (row.ContainsKey("date") && Date(row["date"]) != date) throw Invalid("月记录日期不一致");
        if (kind == "note_entry") { if (!identity.StartsWith("note-entry:", StringComparison.Ordinal)) throw Invalid("记录身份与来源不一致"); Uuid(identity[11..]); }
        else if (kind == "legacy_daily_note")
        {
            if (identity != "legacy-" + category + ":" + DateText(date) || String(row["text"]).Length == 0) throw Invalid("旧日页身份、来源或正文不一致");
            if (source && (row["created_at"] != null || !row.ContainsKey("created_at") || !Labels(row["labels"]).SequenceEqual(new[] { category == "work" ? "工作" : "生活" })))
                throw Invalid("旧日页标签或创建时间不一致");
        }
        else throw Invalid("月记录来源无效");
        if (source) { if (kind == "note_entry") Stamp(row["created_at"]); Stamp(row["updated_at"]); }
    }
    private static DateOnly ValidateFull(JsonObject row)
    {
        Uuid(String(row["id"])); var date = Date(row["date"]); _ = Category(row["category"]); _ = String(row["text"]); _ = Labels(row["labels"]);
        _ = Integer(row["version"], 0); Stamp(row["created_at"]); Stamp(row["updated_at"]);
        if (!row.ContainsKey("deleted_at")) throw Invalid("完整记录缺少删除状态"); if (row["deleted_at"] != null) Stamp(row["deleted_at"]);
        return date;
    }
    private static JsonObject ValidateLegacy(JsonObject row, Route route)
    {
        if (Date(row["date"]) != route.Date) throw Invalid("旧日页日期不一致"); _ = String(row["text"]); var version = Integer(row["version"], 0);
        if (row.ContainsKey("category") && Category(row["category"]) != route.Category) throw Invalid("旧日页来源不一致");
        if (version > 0 || row["updated_at"] != null) Stamp(row["updated_at"]);
        if (row.ContainsKey("deleted")) _ = Boolean(row["deleted"]);
        return row;
    }
    private static void ValidateLabelCache(JsonObject data)
    {
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var key in new[] { "labels", "archived_labels" })
        {
            if (data[key] == null) continue;
            var rows = Array(data[key]); if (rows.Count > 202) throw Invalid("标签缓存超过预算");
            foreach (var node in rows) { var row = Object(node); var name = String(row["name"]); ValidateLabel(name); if (!names.Add(name)) throw Invalid("标签缓存重复"); }
        }
    }
    private static NoteHistoryRange ParseMonth(string month)
        => month != null && month.Length == 7 && DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            ? Month(date) : throw Invalid("月份必须为真实的 YYYY-MM");
    private static string MonthPath(string month) => "/api/v1/note-entries/month?month=" + month;
    private static string DateText(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static Route? ParseRoute(string path)
    {
        if (!path.StartsWith("/api/v1/", StringComparison.Ordinal) || path.Contains('#') || path.Contains('\\')) return null;
        var parts = path.Split('?', 2); var segments = parts[0][8..].Split('/');
        if (segments[0] is not ("note-entries" or "daily-notes") || segments.Length > 3) return null;
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        if (parts.Length == 2) foreach (var field in parts[1].Split('&'))
        {
            var pair = field.Split('=', 2); if (pair.Length != 2 || !query.TryAdd(pair[0], pair[1])) return null;
        }
        if (segments[0] == "note-entries")
        {
            if (segments.Length == 2 && segments[1] == "labels" && query.Count == 0) return new("label", "labels", "", null, null);
            if (segments.Length == 2 && segments[1] == "month") return new("note", "month", "", null, null);
            if (segments.Length == 1 && query.Count == 2 && query.TryGetValue("date", out var raw) && TryDate(JsonValue.Create(raw), out var date) && query.GetValueOrDefault("category") is "life" or "work")
                return new("note", "list", "", date, query["category"]);
            if ((segments.Length == 2 || segments.Length == 3 && segments[2] == "restore") && Guid.TryParseExact(segments[1], "D", out _) && query.Count == 0)
                return new("note", segments.Length == 3 ? "restore" : "detail", segments[1], null, null);
        }
        else if (query.Keys.All(key => key is "date" or "category") && query.GetValueOrDefault("category", "life") is "life" or "work")
        {
            var raw = segments.Length == 1 ? query.GetValueOrDefault("date", "") : segments[1];
            if ((segments.Length <= 2 || segments.Length == 3 && segments[2] == "restore") && TryDate(JsonValue.Create(raw), out var date) && (segments.Length == 1 || !query.ContainsKey("date")))
                return new("legacy", segments.Length == 3 ? "restore" : "detail", raw, date, query.GetValueOrDefault("category", "life"));
        }
        return null;
    }
    private static string Identity(Route route, JsonObject? body)
        => route.Kind == "legacy" ? "legacy-" + route.Category + ":" + DateText(route.Date!.Value) : "note-entry:" + (route.Id.Length > 0 ? route.Id : StringOrEmpty(body?["id"]));
    private static bool Assign(DateOnly value, out DateOnly date) { date = value; return true; }
    private static JsonObject? TryBody(string raw)
    { try { return ParseObject(raw); } catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException) { return null; } }
    private static JsonObject ParseEnvelope(string raw, string? scope, bool bounded = true)
    {
        if (bounded && Utf8.GetByteCount(raw) > MaximumLocalBytes) throw Invalid("本机缓存超过 8MiB 预算");
        var root = ParseObject(raw);
        if (root.ContainsKey("_local_scope_id") && (String(root["_local_scope_id"]).Length == 0 || scope != null && String(root["_local_scope_id"]) != scope)) throw Invalid("月资料属于其他工作区");
        return root;
    }
    private static JsonObject ParseObject(string raw)
    { using var document = JsonDocument.Parse(raw); CheckDocument(document.RootElement); return Object(JsonNode.Parse(raw)); }
    private static void CheckDocument(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject()) { _ = Utf8.GetByteCount(property.Name); if (!names.Add(property.Name)) throw Invalid("JSON 字段重复"); CheckDocument(property.Value); }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckDocument(item);
        else if (value.ValueKind == JsonValueKind.String) _ = Utf8.GetByteCount(value.GetString()!);
    }
    // Exact compact JSON byte counting, with JS's literal Unicode (including emoji) and HTML handling.
    private static long WireBytes(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => 2 + value.EnumerateObject().Select(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)).Sum() + Math.Max(0, value.EnumerateObject().Count() - 1),
        JsonValueKind.Array => 2 + value.EnumerateArray().Select(WireBytes).Sum() + Math.Max(0, value.GetArrayLength() - 1),
        JsonValueKind.String => QuotedBytes(value.GetString()!),
        JsonValueKind.True => 4,
        JsonValueKind.False => 5,
        JsonValueKind.Null => 4,
        _ => Utf8.GetByteCount(value.GetRawText())
    };
    private static long QuotedBytes(string text)
    {
        long result = Utf8.GetByteCount(text) + 2;
        foreach (var character in text) if (character is '"' or '\\') result++; else if (character < 32) result += character is '\b' or '\f' or '\n' or '\r' or '\t' ? 1 : 5;
        return result;
    }
    private static bool HasProjection(JsonObject row) => row.Any(pair => pair.Key.StartsWith("_local_", StringComparison.Ordinal) && pair.Key != "_local_scope_id" || pair.Key == "_operation_id");
    private static void RejectProjection(JsonObject row, bool allowRootScope = false)
    { if (row.Any(pair => pair.Key.StartsWith("_local_", StringComparison.Ordinal) && !(allowRootScope && pair.Key == "_local_scope_id") || pair.Key == "_operation_id")) throw Invalid("本机投影不能充当完整服务端月基线"); }
    internal static string[] Labels(JsonNode? value)
    {
        var labels = Array(value); if (labels.Count > 202) throw Invalid("标签数量超过协议上限");
        var names = labels.Select(String).ToArray(); var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in names) { ValidateLabel(name); if (!seen.Add(name)) throw Invalid("标签重复"); }
        return names;
    }
    private static void ValidateLabel(string name)
    { if (name.Length == 0 || name.Trim() != name || !name.IsNormalized(NormalizationForm.FormC) || name.EnumerateRunes().Count() > 32 || name.Any(c => c < 32 || c == 127)) throw Invalid("标签名称无效"); _ = Utf8.GetByteCount(name); }
    private static string Category(JsonNode? value) => String(value) is var category && category is "life" or "work" ? category : throw Invalid("记录来源无效");
    private static void Uuid(string value) { if (!Guid.TryParseExact(value, "D", out _)) throw Invalid("记录 UUID 无效"); }
    private static DateOnly Date(JsonNode? value) => TryDate(value, out var date) ? date : throw Invalid("记录日期无效");
    private static bool TryDate(JsonNode? value, out DateOnly date) => DateOnly.TryParseExact(StringOrEmpty(value), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    private static void Stamp(JsonNode? value)
    { var text = String(value); if (!StampPattern.IsMatch(text) || !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw Invalid("记录时间无效"); }
    private static long Integer(JsonNode? value, long min) => value is JsonValue scalar && scalar.TryGetValue<long>(out var number) && number >= min && number <= MaxSafe ? number : throw Invalid("记录版本或数值无效");
    private static bool Boolean(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<bool>(out var flag) ? flag : throw Invalid("布尔字段无效");
    internal static string String(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text : throw Invalid("文字字段缺失");
    private static string StringOrEmpty(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text : "";
    private static JsonObject Object(JsonNode? value) => value as JsonObject ?? throw Invalid("对象字段缺失");
    private static JsonArray Array(JsonNode? value) => value as JsonArray ?? throw Invalid("列表字段缺失");
    private static InvalidDataException Invalid(string message, Exception? inner = null) => new(message + "；原缓存、草稿和同步队列未改变。", inner);
}
