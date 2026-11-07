using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Core;

public sealed record TodoNoteValue(string Note, bool Known, string Source, string? BaselineNote, bool BaselineKnown);

public sealed class TodoNoteDraft
{
    private readonly JsonObject original;
    internal TodoNoteDraft(string key, string id, DateOnly date, long version, string note, bool known, JsonObject value)
        => (Key, Id, Date, BaseVersion, Note, NoteKnown, original) = (key, id, date, version, note, known, (JsonObject)value.DeepClone());
    public string Key { get; }
    public string Id { get; }
    public string ResourceKey => TodoNotes.ResourceKey(Id);
    public DateOnly Date { get; }
    public long BaseVersion { get; }
    public string Note { get; }
    public bool NoteKnown { get; }
    public JsonObject Original => (JsonObject)original.DeepClone();
}

/// <summary>Exact private todo-note text and detached local provenance. Missing legacy fields are not proof of an empty note.</summary>
public static class TodoNotes
{
    public const int MaximumLength = 4000;
    public const int MaximumLocalBytes = 8 * 1024 * 1024;
    public const int MaximumSourceBytes = 1024 * 1024;
    private const long MaxSafe = 9_007_199_254_740_991;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly Regex StampPattern = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);
    public static string ValidateText(string note)
    {
        ArgumentNullException.ThrowIfNull(note); _ = Utf8.GetByteCount(note);
        if (note.Length > MaximumLength || note.Any(c => c < 32 && c is not ('\t' or '\n' or '\r') || c == 127)) throw Invalid("待办备注超过 4000 个 UTF-16 字元或含不允许的控制符");
        return note;
    }
    public static string ResourceKey(string id) => "/api/v1/todos/" + Id(id);
    public static string Path(string id) => ResourceKey(id) + "/note";
    public static string DraftKey(string id) => "/local/todo-note/" + Id(id);
    public static void ValidateRecord(JsonObject record, string? expectedId = null, DateOnly? expectedDate = null, bool allowMissingNote = true)
    {
        ArgumentNullException.ThrowIfNull(record);
        try
        {
            if (record.Any(pair => pair.Key.StartsWith("_local_", StringComparison.Ordinal) || pair.Key == "_operation_id")) throw Invalid("本机投影不是可写待办基线");
            var id = Id(Text(record["id"])); var date = Date(record["date"]);
            if (expectedId != null && !id.Equals(Id(expectedId), StringComparison.OrdinalIgnoreCase) || expectedDate != null && date != expectedDate) throw Invalid("待办备注基线身份或日期不一致");
            var text = Text(record["text"]); _ = Utf8.GetByteCount(text);
            if (text.Length is < 1 or > 500 || string.IsNullOrWhiteSpace(text) || text.Trim() != text || text.Contains('\0')) throw Invalid("待办正文无效");
            _ = Boolean(record["completed"]); _ = Integer(record["version"], 1); _ = Stamp(record["created_at"]); _ = Stamp(record["updated_at"]);
            if (!record.ContainsKey("deleted_at") || record["deleted_at"] != null || record["deleted"] != null && Boolean(record["deleted"])) throw Invalid("备注不能写入已删除或删除状态不明的待办");
            if (record.ContainsKey("note")) _ = ValidateText(Text(record["note"])); else if (!allowMissingNote) throw Invalid("待办备注字段缺失");
            var link = new[] { "template_id", "template_version", "template_active" }.Count(record.ContainsKey);
            if (link != 0) { if (link != 3) throw Invalid("待办模板关联资料不完整"); _ = Id(Text(record["template_id"])); _ = Integer(record["template_version"], 1); _ = Boolean(record["template_active"]); }
        }
        catch (Exception error) when (error is JsonException or ArgumentException or InvalidOperationException or FormatException or OverflowException)
        { throw Invalid("待办备注基线结构无效", error); }
    }
    public static void ValidateList(string path, string envelopeJson, string? expectedScope = null)
    {
        const string prefix = "/api/v1/todos?date=";
        if (!path.StartsWith(prefix, StringComparison.Ordinal) || path.Length != prefix.Length + 10) throw new ArgumentException("待办备注核对必须读取原日期的正式待办列表。", nameof(path));
        var expected = Date(JsonValue.Create(path[prefix.Length..])); var root = Envelope(envelopeJson, expectedScope);
        using var document = JsonDocument.Parse(envelopeJson);
        var properties = document.RootElement.EnumerateObject().Where(property => !property.Name.StartsWith("_local_", StringComparison.Ordinal)).ToArray();
        if (2 + properties.Sum(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)) + Math.Max(0, properties.Length - 1) > MaximumSourceBytes) throw Invalid("待办原响应超过 1MiB 协议预算");
        if (root.Any(pair => pair.Key.StartsWith("_local_", StringComparison.Ordinal) && pair.Key != "_local_scope_id")) throw Invalid("本机投影不能充当待办备注原日核对");
        var data = Object(root["data"]); if (Date(data["date"]) != expected) throw Invalid("待办原日响应日期不一致");
        var day = TodoHistory.ParseDay(root.ToJsonString(WorkspaceJson.Options), expected, expectedScope);
        foreach (var row in day.Items) ValidateRecord(row, expectedDate: expected);
    }
    public static TodoNoteDraft ParseDraft(LocalDraft draft)
    {
        ArgumentNullException.ThrowIfNull(draft); var root = Envelope(draft.Text, null);
        if (Text(root["kind"]) != "todo-note" || Text(root["key"]) != draft.Key || !draft.Key.StartsWith("/local/todo-note/", StringComparison.Ordinal)) throw Invalid("待办备注草稿来源无效");
        var id = Id(draft.Key[17..]); if (DraftKey(id) != draft.Key) throw Invalid("待办备注草稿键无效");
        var original = Object(root["original"]); ValidateRecord(original, id); var version = Integer(original["version"], 1);
        if (draft.BaseVersion != version) throw Invalid("待办备注草稿与原版本不一致");
        var values = Object(root["values"]); var note = Text(values["note"]); _ = Utf8.GetByteCount(note);
        var known = !values.ContainsKey("note_known") || Boolean(values["note_known"]);
        // Invalid length/control input remains an editable local draft; formal writes call ValidateText.
        return new(draft.Key, id, Date(original["date"]), version, note, known, original);
    }
    public static TodoNoteValue ReadNote(JsonObject row)
    {
        ArgumentNullException.ThrowIfNull(row); var known = row.ContainsKey("note"); var note = known ? ValidateText(Text(row["note"])) : "";
        var source = row["_local_note_source"] == null ? known ? "cached" : "unknown" : Text(row["_local_note_source"]);
        var baselineKnown = row["_local_note_baseline_known"] == null ? known : Boolean(row["_local_note_baseline_known"]);
        var baseline = row.ContainsKey("_local_note_baseline") ? row["_local_note_baseline"] == null ? null : Text(row["_local_note_baseline"]) : known ? note : null;
        return new(note, known, source, baseline, baselineKnown);
    }
    public static JsonObject? ProjectDay(WorkspaceState state, DateOnly date)
    {
        ArgumentNullException.ThrowIfNull(state); if (string.IsNullOrWhiteSpace(state.ScopeId)) throw Invalid("缺少待办备注工作区身份");
        var path = "/api/v1/todos?date=" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        long bytes = 0, expanded = 0; var count = 0; var cache = new Dictionary<string, string>(StringComparer.Ordinal); var revisions = new Dictionary<string, long>(StringComparer.Ordinal);
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var sizes = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        var readCache = new HashSet<string>(StringComparer.Ordinal); var readBodies = new HashSet<string>(StringComparer.Ordinal);
        var hasExactDay = state.Cache.TryGetValue(path, out var exactDay);
        if (hasExactDay)
        {
            Read(exactDay!); readCache.Add(path); var exactData = Object(Envelope(exactDay!, state.ScopeId)["data"]);
            if (Date(exactData["date"]) != date) throw Invalid("待办整日缓存日期不一致");
            foreach (var row in exactData["items"] as JsonArray ?? throw Invalid("待办整日缓存缺少条目")) ids.Add(Text(Object(row)["id"]));
        }
        foreach (var (key, raw) in state.Cache)
        {
            var detail = key.StartsWith("/api/v1/todos/", StringComparison.Ordinal) && key.Split('/').Length == 5;
            if (key != path && !detail && key != TemplateArchive.ListPath(false) && key != TemplateArchive.ListPath(true)) continue;
            if (detail && hasExactDay && !ids.Contains(key.Split('/')[4])) continue;
            if (readCache.Add(key)) Read(raw); var root = Envelope(raw, state.ScopeId); var data = Object(root["data"]);
            if (detail && Date(data["date"]) != date) continue;
            var rows = data["items"] is JsonArray array ? array.Select(node => Object(node)).ToArray() : [data];
            foreach (var row in rows)
            {
                Count(); var id = Text(row["id"]); var prefix = key.StartsWith("/api/v1/todo-templates", StringComparison.Ordinal) ? "template:" : "todo:";
                sizes[prefix + id.ToLowerInvariant()] = Math.Max(sizes.GetValueOrDefault(prefix + id.ToLowerInvariant()), Utf8.GetByteCount(row.ToJsonString()));
                if (prefix == "todo:") { if (Date(row["date"]) != date) throw Invalid("待办缓存条目日期不一致"); ids.Add(id); if (row.ContainsKey("note")) _ = ValidateText(Text(row["note"])); }
            }
            if (key == path && (root.ContainsKey("_local_incomplete") || root.ContainsKey("_local_projection") || rows.Any(row => row.ContainsKey("_local_status") || row.ContainsKey("_local_incomplete"))))
            {
                foreach (var row in rows) { var detailPath = ResourceKey(Text(row["id"])); cache[detailPath] = new JsonObject { ["data"] = row.DeepClone(), ["_local_scope_id"] = state.ScopeId }.ToJsonString(); revisions[detailPath] = state.CacheRevisions.GetValueOrDefault(key); expanded += Utf8.GetByteCount(cache[detailPath]); }
            }
            else { cache[key] = raw; revisions[key] = state.CacheRevisions.GetValueOrDefault(key); expanded += Utf8.GetByteCount(root.ToJsonString()); }
        }
        var lookup = new Dictionary<string, PendingOperation>(StringComparer.Ordinal); foreach (var operation in state.Outbox) if (!lookup.TryAdd(operation.Id, operation)) throw Invalid("待办操作 ID 重复");
        var keep = new HashSet<string>(StringComparer.Ordinal);
        foreach (var operation in state.Outbox)
        {
            if (operation.Path.StartsWith("/api/v1/todo-templates", StringComparison.Ordinal)) { keep.Add(operation.Id); continue; }
            if (!operation.Path.StartsWith("/api/v1/todos", StringComparison.Ordinal)) continue;
            if (operation.TodoNoteDate != null && Date(JsonValue.Create(operation.TodoNoteDate)) != date) continue;
            Read(operation.RequestBodyJson); readBodies.Add(operation.Id); var body = Envelope(operation.RequestBodyJson, null); var parts = operation.Path.Split('/');
            var id = parts.Length >= 5 ? parts[4] : body["id"] == null ? "" : Text(body["id"]);
            DateOnly? requested = operation.TodoNoteDate == null ? body["date"] == null ? null : Date(body["date"]) : Date(JsonValue.Create(operation.TodoNoteDate));
            if (requested == date || requested == null && ids.Contains(id)) keep.Add(operation.Id);
        }
        var queue = new Queue<string>(keep);
        while (queue.TryDequeue(out var id)) if (lookup.TryGetValue(id, out var operation))
            foreach (var related in operation.DependencyIds.Concat(operation.SupersededById == null ? [] : [operation.SupersededById]).Concat(operation.VersionFromDependencyId == null ? [] : [operation.VersionFromDependencyId]))
                if (keep.Add(related)) queue.Enqueue(related);
        var operations = state.Outbox.Where(operation => keep.Contains(operation.Id)).ToList();
        foreach (var operation in operations)
        {
            if (readBodies.Add(operation.Id)) Read(operation.RequestBodyJson);
            var body = Envelope(operation.RequestBodyJson, null); if (operation.RemoteJson != null) { Read(operation.RemoteJson); _ = Envelope(operation.RemoteJson, state.ScopeId); } Count();
            if (operation.Status == PendingStatus.Superseded) continue;
            var parts = operation.Path.Split('/'); var kind = parts.Length >= 4 && parts[3] == "todo-templates" ? "template:" : "todo:";
            var identity = kind + (parts.Length >= 5 ? parts[4] : body["id"] == null ? operation.Path : Text(body["id"])).ToLowerInvariant();
            var old = sizes.GetValueOrDefault(identity, 1024); var next = checked(old * 2 + Utf8.GetByteCount(operation.RequestBodyJson) * 6L + (operation.RemoteJson == null ? 0 : Utf8.GetByteCount(operation.RemoteJson) * 6L) + 2048);
            expanded = checked(expanded + next - sizes.GetValueOrDefault(identity)); sizes[identity] = next;
            if (expanded > 64L * 1024 * 1024) throw Invalid("待办备注全部本机预览展开超过 64MiB 预算");
        }
        if (expanded > 64L * 1024 * 1024) throw Invalid("待办备注基线展开超过 64MiB 预算");
        var projected = WorkspaceProjection.Project(path, cache.GetValueOrDefault(path), state with { Cache = cache, CacheRevisions = revisions, Outbox = operations });
        if (projected == null) return null; if (Utf8.GetByteCount(projected) > MaximumLocalBytes) throw Invalid("待办备注预览输出超过 8MiB 预算");
        return Object(JsonNode.Parse(projected));
        void Read(string raw) { bytes += Utf8.GetByteCount(raw); if (bytes > MaximumLocalBytes) throw Invalid("待办备注本机输入超过 8MiB 总预算"); }
        void Count() { if (++count > 10000) throw Invalid("待办备注本机条目超过 10000 行预算"); }
    }
    internal static JsonObject Envelope(string raw, string? scope)
    {
        if (Utf8.GetByteCount(raw) > MaximumLocalBytes) throw Invalid("待办备注本机资料超过 8MiB 预算");
        using var document = JsonDocument.Parse(raw); CheckJson(document.RootElement); var root = Object(JsonNode.Parse(raw));
        if (root.ContainsKey("_local_scope_id") && (Text(root["_local_scope_id"]).Length == 0 || scope != null && Text(root["_local_scope_id"]) != scope)) throw Invalid("待办备注来源属于其他工作区");
        return root;
    }
    internal static string Id(string id)
    { if (!Guid.TryParseExact(id, "D", out _) || id[14] is < '1' or > '8' || !"89abAB".Contains(id[19])) throw Invalid("待办 UUID 无效"); return id.ToLowerInvariant(); }
    internal static DateOnly Date(JsonNode? value) => DateOnly.TryParseExact(Text(value), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : throw Invalid("待办原日期无效");
    internal static long Integer(JsonNode? value, long min)
    { if (value is JsonValue scalar) { long n; if (scalar.TryGetValue<long>(out var wide)) n = wide; else if (scalar.TryGetValue<int>(out var small)) n = small; else throw Invalid("待办版本无效"); if (n >= min && n <= MaxSafe) return n; } throw Invalid("待办版本无效"); }
    internal static string Text(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text : throw Invalid("待办备注文字字段缺失");
    private static bool Boolean(JsonNode? value) => value is JsonValue scalar && scalar.TryGetValue<bool>(out var flag) ? flag : throw Invalid("待办备注标记无效");
    private static DateTimeOffset Stamp(JsonNode? value) { var text = Text(value); return StampPattern.IsMatch(text) && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var at) ? at : throw Invalid("待办时间无效"); }
    private static JsonObject Object(JsonNode? value) => value as JsonObject ?? throw Invalid("待办备注对象缺失");
    private static void CheckJson(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object) { var names = new HashSet<string>(StringComparer.Ordinal); foreach (var property in value.EnumerateObject()) { _ = Utf8.GetByteCount(property.Name); if (!names.Add(property.Name)) throw Invalid("待办备注 JSON 字段重复"); CheckJson(property.Value); } }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckJson(item);
        else if (value.ValueKind == JsonValueKind.String) _ = Utf8.GetByteCount(value.GetString()!);
    }
    private static long WireBytes(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => 2 + value.EnumerateObject().Sum(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)) + Math.Max(0, value.EnumerateObject().Count() - 1),
        JsonValueKind.Array => 2 + value.EnumerateArray().Sum(WireBytes) + Math.Max(0, value.GetArrayLength() - 1), JsonValueKind.String => QuotedBytes(value.GetString()!),
        JsonValueKind.True => 4, JsonValueKind.False => 5, JsonValueKind.Null => 4, _ => Utf8.GetByteCount(value.GetRawText())
    };
    private static long QuotedBytes(string value) { long count = Utf8.GetByteCount(value) + 2; foreach (var c in value) if (c is '"' or '\\') count++; else if (c < 32) count += c is '\b' or '\f' or '\n' or '\r' or '\t' ? 1 : 5; return count; }
    private static InvalidDataException Invalid(string message, Exception? inner = null) => new(message + "；原缓存、草稿及同步队列未改变。", inner);
}
