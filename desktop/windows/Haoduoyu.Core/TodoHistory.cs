using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Core;

public enum TodoHistoryPeriod { Month, Week }

public sealed class TodoHistoryRange
{
    internal TodoHistoryRange(TodoHistoryPeriod period, DateOnly anchor, DateOnly start, DateOnly end, bool clipped)
    {
        Period = period; Anchor = anchor; Start = start; End = end; IsClipped = clipped;
        Dates = Array.AsReadOnly(Enumerable.Range(start.DayNumber, end.DayNumber - start.DayNumber + 1).Select(DateOnly.FromDayNumber).ToArray());
    }
    public TodoHistoryPeriod Period { get; }
    public DateOnly Anchor { get; }
    public DateOnly Start { get; }
    public DateOnly End { get; }
    public bool IsClipped { get; }
    public IReadOnlyList<DateOnly> Dates { get; }
    public TodoHistoryRange? Shift(int steps)
    {
        try { return Period == TodoHistoryPeriod.Month ? TodoHistory.Month(Anchor.AddMonths(steps)) : TodoHistory.Week(Anchor.AddDays(checked(steps * 7))); }
        catch (Exception error) when (error is ArgumentOutOfRangeException or OverflowException) { return null; }
    }
}

public sealed class TodoHistoryDay
{
    private readonly JsonObject data;
    internal TodoHistoryDay(JsonObject data, DateOnly date, DateOnly today, string completedMode, long preferencesVersion)
        => (this.data, Date, Today, CompletedMode, PreferencesVersion) = ((JsonObject)data.DeepClone(), date, today, completedMode, preferencesVersion);
    public DateOnly Date { get; }
    public DateOnly Today { get; }
    public string CompletedMode { get; }
    public long PreferencesVersion { get; }
    public JsonObject Data => (JsonObject)data.DeepClone();
    public IReadOnlyList<JsonObject> Items => Array.AsReadOnly(data["items"]!.AsArray().Select(row => (JsonObject)row!.DeepClone()).ToArray());
}

public sealed record TodoHistoryFilter(string Query = "", bool? Completed = null);

public sealed class TodoHistoryDayView
{
    private readonly JsonObject[] items;
    internal TodoHistoryDayView(DateOnly date, bool hasBaseline, bool complete, string? issue, JsonObject[] allItems,
        JsonObject[] filteredItems, JsonObject[] baseline, int uncertainCount, DateTimeOffset? observedAt)
    {
        Date = date; HasBaseline = hasBaseline; Complete = complete; Issue = issue; items = filteredItems;
        Total = allItems.Length; Done = allItems.Count(row => TodoHistory.Completed(row)); Open = Total - Done;
        BaselineTotal = baseline.Length; BaselineDone = baseline.Count(row => TodoHistory.Completed(row)); BaselineOpen = BaselineTotal - BaselineDone;
        UncertainCount = uncertainCount; ObservedAtUtc = observedAt;
    }
    public DateOnly Date { get; }
    public bool HasBaseline { get; }
    public bool Complete { get; }
    public string? Issue { get; }
    public IReadOnlyList<JsonObject> Items => Array.AsReadOnly(items.Select(row => (JsonObject)row.DeepClone()).ToArray());
    public int Total { get; }
    public int Done { get; }
    public int Open { get; }
    public int FilteredCount => items.Length;
    public int BaselineTotal { get; }
    public int BaselineDone { get; }
    public int BaselineOpen { get; }
    public int UncertainCount { get; }
    public DateTimeOffset? ObservedAtUtc { get; }
}

public sealed class TodoHistoryView
{
    internal TodoHistoryView(TodoHistoryRange range, TodoHistoryDayView[] days, int unattributed)
    {
        Range = range; Days = Array.AsReadOnly(days);
        Total = days.Sum(day => day.Total); Done = days.Sum(day => day.Done); Open = Total - Done;
        ActiveDays = days.Count(day => day.Total > 0); FilteredCount = days.Sum(day => day.FilteredCount);
        CoveredDays = days.Count(day => day.Complete); MissingDates = Array.AsReadOnly(days.Where(day => !day.Complete).Select(day => day.Date).ToArray());
        UnattributedOperationCount = unattributed; UncertainCount = days.Sum(day => day.UncertainCount) + unattributed;
    }
    public TodoHistoryRange Range { get; }
    public IReadOnlyList<TodoHistoryDayView> Days { get; }
    public int Total { get; }
    public int Done { get; }
    public int Open { get; }
    public int ActiveDays { get; }
    public int FilteredCount { get; }
    public int CoveredDays { get; }
    public IReadOnlyList<DateOnly> MissingDates { get; }
    public bool Complete => MissingDates.Count == 0;
    // Counts unconfirmed operations, including deletes that no longer have a visible row.
    public int UncertainCount { get; }
    public int UnattributedOperationCount { get; }
}

/// <summary>Read-only history of known local items. Coverage describes exact validated day baselines, not a server transaction.</summary>
public static class TodoHistory
{
    public const int MaximumDayCacheBytes = 4 * 1024 * 1024;
    public const int MaximumItemsPerDay = 10000;
    public const int MaximumRangeItems = 50000;
    private const long MaxSafe = 9_007_199_254_740_991;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly Regex TimestampPattern = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);

    public static TodoHistoryRange Month(DateOnly anchor) => new(TodoHistoryPeriod.Month, anchor,
        new(anchor.Year, anchor.Month, 1), new(anchor.Year, anchor.Month, DateTime.DaysInMonth(anchor.Year, anchor.Month)), false);
    public static TodoHistoryRange Week(DateOnly anchor)
    {
        var first = anchor.DayNumber - ((int)anchor.DayOfWeek + 6) % 7; var last = first + 6;
        return new(TodoHistoryPeriod.Week, anchor, DateOnly.FromDayNumber(Math.Max(0, first)),
            DateOnly.FromDayNumber(Math.Min(DateOnly.MaxValue.DayNumber, last)), first < 0 || last > DateOnly.MaxValue.DayNumber);
    }
    public static DateOnly BeijingToday(DateTimeOffset at) => DateOnly.FromDateTime(new DateTime(
        Math.Clamp(at.UtcTicks + TimeSpan.TicksPerHour * 8, DateTime.MinValue.Ticks, DateTime.MaxValue.Ticks), DateTimeKind.Unspecified));

    public static TodoHistoryDay ParseDay(string envelopeJson, DateOnly expectedDate, string? expectedWorkspaceScope = null)
    {
        try
        {
            var root = ParseEnvelope(envelopeJson, expectedWorkspaceScope); var data = Object(root["data"]);
            var date = Date(data["date"]); var today = Date(data["today"]);
            if (date != expectedDate) throw Invalid("待办缓存日期不一致");
            var mode = Text(data["completed_mode"]); if (mode is not ("strike" or "hide")) throw Invalid("完成显示偏好无效");
            var preferencesVersion = Integer(data["preferences_version"], 0); var rows = ArrayNode(data["items"]);
            if (rows.Count > MaximumItemsPerDay) throw Invalid("单日待办数量超过预算");
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var value in rows)
            {
                var row = Object(value); ValidateRow(row, date);
                if (!ids.Add(Text(row["id"]))) throw Invalid("待办标识重复");
            }
            return new(data, date, today, mode, preferencesVersion);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or OverflowException or FormatException)
        { throw Invalid("待办历史缓存损坏", error); }
    }

    public static TodoHistoryView Build(WorkspaceState state, TodoHistoryRange range, TodoHistoryFilter? filter = null)
    {
        ArgumentNullException.ThrowIfNull(state); ArgumentNullException.ThrowIfNull(range);
        if (string.IsNullOrWhiteSpace(state.ScopeId)) throw Invalid("缺少当前工作区身份");
        filter ??= new(); if (filter.Query is null || filter.Query.Length > 500) throw new ArgumentException("筛选文字超过预算。", nameof(filter));
        var baselines = new Dictionary<DateOnly, TodoHistoryDay>(); var complete = new HashSet<DateOnly>();
        var issues = new Dictionary<DateOnly, string>(); var observations = new Dictionary<DateOnly, DateTimeOffset?>();
        var safeCache = new Dictionary<string, string>(StringComparer.Ordinal); var revisions = new Dictionary<string, long>(StringComparer.Ordinal);
        var knownDates = new Dictionary<string, DateOnly>(StringComparer.OrdinalIgnoreCase);
        foreach (var date in range.Dates)
        {
            var path = Path(date);
            if (!state.Cache.TryGetValue(path, out var raw)) { issues[date] = "尚未读取该日，完整情况未知"; continue; }
            try
            {
                var day = ParseDay(raw, date, state.ScopeId); var root = ParseEnvelope(raw, state.ScopeId);
                baselines[date] = day; observations[date] = ObservedAt(root, date);
                foreach (var row in day.Items) knownDates[Text(row["id"])] = date;
                if (!Flag(root, "_local_incomplete") && !Flag(root, "_local_projection") &&
                    !day.Items.Any(row => Flag(row, "_local_incomplete") || row["_local_status"] != null))
                {
                    complete.Add(date); safeCache[path] = raw; revisions[path] = state.CacheRevisions.GetValueOrDefault(path);
                }
                else
                {
                    issues[date] = "该日只有部分或本机投影资料，完整情况未知";
                    // Complete() in the existing projection recognizes list shape, not the
                    // original incomplete flag. Seed partial rows as details, with no list authority.
                    foreach (var row in day.Items) SeedDetail(row, state.CacheRevisions.GetValueOrDefault(path));
                }
            }
            catch (InvalidDataException) { issues[date] = "该日缓存未通过日期、工作区或完整结构校验"; }
        }
        // Retain valid newer detail receipts and the source text for an unscheduled-to-day move.
        // Unrelated or invalid cache entries never enter this history projection.
        foreach (var (path, raw) in state.Cache)
        {
            try
            {
                if (path.StartsWith("/api/v1/todos/", StringComparison.Ordinal) && !path.Contains('?') && path.Split('/').Length == 5)
                {
                    var root = ParseEnvelope(raw, state.ScopeId); var row = Object(root["data"]); var date = Date(row["date"]);
                    ValidateRow(row, date); if (Text(row["id"]) != path.Split('/')[4] || !range.Dates.Contains(date)) continue;
                    knownDates[Text(row["id"])] = date; SeedDetail(row, state.CacheRevisions.GetValueOrDefault(path));
                }
                else if (path == "/api/v1/unscheduled-todos")
                {
                    var root = ParseEnvelope(raw, state.ScopeId); var rows = ArrayNode(Object(root["data"])["items"]);
                    if (rows.Count > MaximumItemsPerDay) continue;
                    var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var value in rows) { var row = Object(value); ValidateRow(row, null); if (!ids.Add(Text(row["id"]))) throw Invalid("重复未来待办"); }
                    safeCache[path] = raw; revisions[path] = state.CacheRevisions.GetValueOrDefault(path);
                }
            }
            catch (Exception error) when (error is InvalidDataException or JsonException or InvalidOperationException or ArgumentException) { }
        }
        var projectionState = state with { Cache = safeCache, CacheRevisions = revisions, Outbox = HistoryOperations(state.Outbox) };
        var (pendingByDay, unattributed) = PendingDates(state, knownDates);
        var days = new List<TodoHistoryDayView>(); var rangeItems = 0;
        foreach (var date in range.Dates)
        {
            var all = new List<JsonObject>(); var path = Path(date); var baseline = baselines.GetValueOrDefault(date);
            var originalRows = baseline?.Items.ToArray() ?? [];
            var baselineIds = originalRows.Select(row => Text(row["id"])).ToHashSet(StringComparer.OrdinalIgnoreCase);
            try
            {
                var projected = WorkspaceProjection.Project(path, safeCache.GetValueOrDefault(path), projectionState);
                if (projected != null)
                {
                    var rows = ArrayNode(Object(ParseEnvelope(projected, state.ScopeId)["data"])["items"]);
                    if (rows.Count > MaximumItemsPerDay) throw Invalid("单日本机投影超过预算");
                    foreach (var value in rows)
                    {
                        var row = Object(value);
                        if (Deleted(row)) continue;
                        try
                        {
                            Uuid(row["id"]); if (Date(row["date"]) != date) throw Invalid("本机条目日期不一致"); ValidateText(row["text"]); _ = Completed(row);
                            if (Flag(row, "_local_incomplete")) { issues[date] = "本机条目资料尚不完整，仅列出已知部分"; complete.Remove(date); }
                            var copy = (JsonObject)row.DeepClone();
                            copy["_history_has_baseline"] = baselineIds.Contains(Text(row["id"]));
                            all.Add(copy);
                        }
                        catch (InvalidDataException) { issues[date] = "部分本机条目资料不全，仅列出可核实条目"; complete.Remove(date); }
                    }
                }
            }
            catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
            { issues[date] = "本机待办投影无法核实"; complete.Remove(date); }
            rangeItems = checked(rangeItems + all.Count); if (rangeItems > MaximumRangeItems) throw Invalid("历史范围条目超过预算");
            var filtered = all.Where(row => (filter.Completed is null || Completed(row) == filter.Completed) &&
                Text(row["text"]).Contains(filter.Query, StringComparison.OrdinalIgnoreCase)).ToArray();
            var baselineRows = originalRows.Where(row => !Deleted(row)).ToArray();
            days.Add(new(date, baseline != null, complete.Contains(date), issues.GetValueOrDefault(date), all.ToArray(), filtered, baselineRows,
                pendingByDay.GetValueOrDefault(date)?.Count ?? 0, observations.GetValueOrDefault(date)));
        }
        return new(range, days.ToArray(), unattributed);

        void SeedDetail(JsonObject row, long revision)
        {
            var key = "/api/v1/todos/" + Text(row["id"]);
            if (safeCache.TryGetValue(key, out var old))
            {
                var prior = Object(JsonNode.Parse(old)?["data"]);
                if (Integer(prior["version"], 1) > Integer(row["version"], 1) ||
                    Integer(prior["version"], 1) == Integer(row["version"], 1) && revisions.GetValueOrDefault(key) > revision) return;
            }
            safeCache[key] = new JsonObject { ["data"] = row.DeepClone(), ["_local_scope_id"] = state.ScopeId }.ToJsonString(); revisions[key] = revision;
        }
    }

    private static (Dictionary<DateOnly, HashSet<string>> Dates, int Unattributed) PendingDates(WorkspaceState state, Dictionary<string, DateOnly> knownDates)
    {
        var dates = new Dictionary<DateOnly, HashSet<string>>(); var unknown = new HashSet<string>(StringComparer.Ordinal);
        // A local create can supply the date for a later completion that has no date field.
        foreach (var operation in state.Outbox)
            if (TodoOperation(operation, out var id) && TryDate(Body(operation.RequestBodyJson)?["date"], out var date)) knownDates.TryAdd(id, date);
        foreach (var operation in state.Outbox.Where(op => op.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)))
        {
            if (!TodoOperation(operation, out var id)) continue;
            var body = Body(operation.RequestBodyJson); DateOnly date;
            var found = TryDate(body?["date"], out date) || knownDates.TryGetValue(id, out date) ||
                TryRemoteDate(operation.RemoteJson, id, state.ScopeId, out date) ||
                state.Drafts.TryGetValue(operation.ResourceKey, out var draft) && TryDate(Body(draft.Text)?["date"], out date) ||
                TryCachedDate(state, id, out date);
            if (!found) { unknown.Add(operation.Id); continue; }
            if (!dates.TryGetValue(date, out var ids)) dates[date] = ids = new(StringComparer.Ordinal);
            ids.Add(operation.Id);
        }
        return (dates, unknown.Count);
    }
    private static List<PendingOperation> HistoryOperations(List<PendingOperation> operations)
    {
        static bool Related(string path) => new[] { "todos", "unscheduled-todos", "todo-templates", "todo-preferences" }
            .Any(resource => path == "/api/v1/" + resource || path.StartsWith("/api/v1/" + resource + "/", StringComparison.Ordinal));
        var lookup = operations.ToDictionary(operation => operation.Id, StringComparer.Ordinal);
        var keep = new HashSet<string>(operations.Where(operation => Related(operation.Path)).Select(operation => operation.Id), StringComparer.Ordinal);
        var pending = new Queue<string>(keep);
        while (pending.TryDequeue(out var id))
        {
            if (!lookup.TryGetValue(id, out var operation)) continue;
            foreach (var dependency in operation.DependencyIds.Concat(operation.SupersededById == null ? [] : [operation.SupersededById]))
                if (keep.Add(dependency)) pending.Enqueue(dependency);
        }
        return operations.Where(operation => keep.Contains(operation.Id)).ToList();
    }
    private static bool TryCachedDate(WorkspaceState state, string id, out DateOnly date)
    {
        date = default;
        if (id.Length == 0) return false;
        foreach (var (path, raw) in state.Cache)
        {
            try
            {
                if (path.StartsWith("/api/v1/todos?date=", StringComparison.Ordinal) && path.Length == 29 &&
                    TryDate(JsonValue.Create(path[19..]), out var cachedDate) && raw != null && raw.Contains(id, StringComparison.OrdinalIgnoreCase))
                {
                    var day = ParseDay(raw, cachedDate, state.ScopeId);
                    if (day.Items.Any(row => Text(row["id"]).Equals(id, StringComparison.OrdinalIgnoreCase))) { date = cachedDate; return true; }
                }
                else if (path.Equals("/api/v1/todos/" + id, StringComparison.OrdinalIgnoreCase))
                {
                    var row = Object(ParseEnvelope(raw, state.ScopeId)["data"]); var cachedDateFromDetail = Date(row["date"]);
                    ValidateRow(row, cachedDateFromDetail);
                    if (Text(row["id"]).Equals(id, StringComparison.OrdinalIgnoreCase)) { date = cachedDateFromDetail; return true; }
                }
            }
            catch (Exception error) when (error is InvalidDataException or JsonException or InvalidOperationException or ArgumentException) { }
        }
        return false;
    }
    private static bool TodoOperation(PendingOperation operation, out string id)
    {
        id = ""; var path = operation.Path.Split('?')[0]; var parts = path.Split('/');
        if (path == "/api/v1/todos") id = Body(operation.RequestBodyJson)?["id"]?.ToString() ?? "";
        else if (parts.Length is 5 or 6 && parts[1] == "api" && parts[2] == "v1" &&
            (parts[3] == "todos" || parts[3] == "unscheduled-todos" && parts.Length == 6 && parts[5] is "move" or "complete-today")) id = parts[4];
        else return false;
        // Even a corrupt identity remains an unattributed unconfirmed todo operation.
        return true;
    }
    private static bool TryRemoteDate(string? raw, string id, string scope, out DateOnly date)
    {
        date = default;
        if (raw == null) return false;
        try
        {
            var data = ParseEnvelope(raw, scope)["data"] as JsonObject;
            if (data?["todo"] is JsonObject todo) data = todo;
            return data != null && TextOrEmpty(data["id"]) == id && TryDate(data["date"], out date);
        }
        catch (Exception error) when (error is InvalidDataException or JsonException or InvalidOperationException or ArgumentException) { return false; }
    }
    private static JsonObject? Body(string? raw)
    { try { return raw == null || Utf8.GetByteCount(raw) > MaximumDayCacheBytes ? null : JsonNode.Parse(raw) as JsonObject; } catch (Exception error) when (error is JsonException or ArgumentException) { return null; } }
    private static DateTimeOffset? ObservedAt(JsonObject root, DateOnly date)
    {
        try
        {
            if (root["_local_todo_history"] is not JsonObject meta) return null;
            var scope = Text(meta["scope_id"]); if (scope.Length != 64 || scope.Any(c => !char.IsAsciiHexDigit(c))) return null;
            Uuid(meta["batch_id"]); _ = Integer(meta["read_revision"], 0);
            if (Date(meta["range_start"]) > date || Date(meta["range_end"]) < date) return null;
            var at = Stamp(meta["observed_at_utc"]); return at.Offset == TimeSpan.Zero ? at : null;
        }
        catch (InvalidDataException) { return null; }
    }
    private static JsonObject ParseEnvelope(string? raw, string? expectedScope)
    {
        if (raw is null || Utf8.GetByteCount(raw) > MaximumDayCacheBytes) throw Invalid("待办缓存大小超过预算");
        using var document = JsonDocument.Parse(raw); CheckDocument(document.RootElement);
        var root = Object(JsonNode.Parse(raw));
        if (root.ContainsKey("_local_scope_id") && (Text(root["_local_scope_id"]).Length == 0 || expectedScope != null && Text(root["_local_scope_id"]) != expectedScope))
            throw Invalid("待办缓存属于其他工作区");
        foreach (var flag in new[] { "_local_incomplete", "_local_projection", "_local_complete" }) if (root.ContainsKey(flag)) _ = Boolean(root[flag]);
        return root;
    }
    private static void ValidateRow(JsonObject row, DateOnly? date)
    {
        Uuid(row["id"]); if (date != null && Date(row["date"]) != date) throw Invalid("待办条目日期不一致");
        ValidateText(row["text"]); _ = Completed(row); _ = Integer(row["version"], 1);
        _ = Stamp(row["created_at"]); _ = Stamp(row["updated_at"]);
        if (!row.ContainsKey("deleted_at")) throw Invalid("待办删除状态缺失");
        if (row["deleted_at"] != null) _ = Stamp(row["deleted_at"]);
        if (row.ContainsKey("_local_deleted")) _ = Boolean(row["_local_deleted"]);
        if (row.ContainsKey("_local_incomplete")) _ = Boolean(row["_local_incomplete"]);
        var templateFields = new[] { "template_id", "template_version", "template_active" }.Count(row.ContainsKey);
        if (templateFields != 0) { if (templateFields != 3) throw Invalid("模板关联资料不完整"); Uuid(row["template_id"]); _ = Integer(row["template_version"], 1); _ = Boolean(row["template_active"]); }
    }
    private static void CheckDocument(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var fields = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject()) { if (!fields.Add(property.Name)) throw Invalid("JSON字段重复"); CheckDocument(property.Value); }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckDocument(item);
        else if (value.ValueKind == JsonValueKind.String) _ = Utf8.GetByteCount(value.GetString()!);
    }
    private static void ValidateText(JsonNode? value)
    { var text = Text(value); if (text.Length is < 1 or > 500 || string.IsNullOrWhiteSpace(text) || text.Contains('\0')) throw Invalid("待办文字无效"); }
    private static void Uuid(JsonNode? value)
    { var id = Text(value); if (!Guid.TryParseExact(id, "D", out _) || id[14] is < '1' or > '8' || !"89abAB".Contains(id[19])) throw Invalid("待办UUID无效"); }
    private static DateOnly Date(JsonNode? value) => DateOnly.TryParseExact(Text(value), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : throw Invalid("待办日期无效");
    private static bool TryDate(JsonNode? value, out DateOnly date) => DateOnly.TryParseExact(TextOrEmpty(value), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    private static DateTimeOffset Stamp(JsonNode? value)
    { var text = Text(value); return TimestampPattern.IsMatch(text) && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var at) ? at : throw Invalid("待办时间无效"); }
    private static long Integer(JsonNode? value, long minimum) => value is JsonValue scalar && scalar.TryGetValue<long>(out var number) && number >= minimum && number <= MaxSafe ? number : throw Invalid("待办版本或数值无效");
    private static bool Boolean(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<bool>(out var flag) ? flag : throw Invalid("待办布尔状态无效");
    internal static bool Completed(JsonObject row) => Boolean(row["completed"]);
    private static bool Deleted(JsonObject row) => row.ContainsKey("_local_deleted") ? Boolean(row["_local_deleted"]) : row["deleted_at"] != null;
    private static bool Flag(JsonObject row, string field) => row.ContainsKey(field) && Boolean(row[field]);
    private static string Text(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text : throw Invalid("待办文字字段缺失");
    private static string TextOrEmpty(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text : "";
    private static JsonObject Object(JsonNode? value) => value as JsonObject ?? throw Invalid("待办对象缺失");
    private static JsonArray ArrayNode(JsonNode? value) => value as JsonArray ?? throw Invalid("待办列表缺失");
    private static string Path(DateOnly date) => "/api/v1/todos?date=" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static InvalidDataException Invalid(string message, Exception? inner = null) => new(message + "；原缓存、草稿和同步队列未改变。", inner);
}
