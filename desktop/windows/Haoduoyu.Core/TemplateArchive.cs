using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Core;

public sealed class TemplateArchiveList
{
    private readonly JsonObject data;
    internal TemplateArchiveList(bool archived, JsonObject value, DateOnly today, DateOnly start)
        => (Archived, data, Today, WindowStart) = (archived, (JsonObject)value.DeepClone(), today, start);
    public bool Archived { get; }
    public DateOnly Today { get; }
    public DateOnly WindowStart { get; }
    public JsonObject Data => (JsonObject)data.DeepClone();
    public IReadOnlyList<JsonObject> Items => System.Array.AsReadOnly(data["items"]!.AsArray().Select(row => (JsonObject)row!.DeepClone()).ToArray());
}

/// <summary>Owner-scoped template archive reports and detached previews; list reads are never mutation receipts.</summary>
public static class TemplateArchive
{
    public const int MaximumSourceBytes = 1024 * 1024;
    public const int MaximumLocalBytes = 8 * 1024 * 1024;
    public const int MaximumItems = 10000;
    private const long MaxSafe = 9_007_199_254_740_991;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly Regex StampPattern = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);
    public static string ListPath(bool archived) => "/api/v1/todo-templates" + (archived ? "?archived=1" : "");
    public static bool ParseListPath(string path) => path switch
    {
        "/api/v1/todo-templates" => false,
        "/api/v1/todo-templates?archived=1" => true,
        _ => throw new ArgumentException("模板列表仅支持活动列表及 archived=1 归档列表。", nameof(path))
    };
    public static void ValidateList(string path, string envelopeJson, string? expectedScope = null) => _ = ParseList(path, envelopeJson, expectedScope);
    public static TemplateArchiveList ParseList(string path, string envelopeJson, string? expectedScope = null)
    {
        var archived = ParseListPath(path);
        try
        {
            var root = Envelope(envelopeJson, expectedScope); RejectLocal(root, true); var data = Object(root["data"]); RejectLocal(data);
            var today = Date(data["today"]); var start = Date(data["window_start"]);
            if (today.DayNumber - start.DayNumber != 29) throw Invalid("模板统计窗口不是完整 30 个自然日");
            var rows = Array(data["items"]); if (rows.Count > MaximumItems) throw Invalid("模板列表行数超过预算");
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var node in rows)
            { var row = Object(node); ValidateRecord(row, archived); if (!ids.Add(Text(row["id"]))) throw Invalid("模板 UUID 重复"); }
            if (root["_local_template_archive"] is { } metadata)
            {
                var meta = Object(metadata); var scope = Text(meta["scope_id"]);
                if (ParseListPath(Text(meta["query_path"])) != archived || scope.Length == 0 || expectedScope != null && scope != expectedScope ||
                    root["_local_scope_id"] != null && Text(root["_local_scope_id"]) != scope || Stamp(meta["observed_at_utc"]).Offset != TimeSpan.Zero) throw Invalid("模板列表来源标记不一致");
            }
            using var document = JsonDocument.Parse(envelopeJson);
            var source = document.RootElement.EnumerateObject().Where(property => property.Name is not ("_local_scope_id" or "_local_template_archive")).ToArray();
            if (2 + source.Sum(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)) + Math.Max(0, source.Length - 1) > MaximumSourceBytes) throw Invalid("模板源响应超过 1MiB 协议预算");
            return new(archived, data, today, start);
        }
        catch (Exception error) when (error is JsonException or ArgumentException or InvalidOperationException or FormatException or OverflowException)
        { throw Invalid("模板完整列表结构无效", error); }
    }
    public static void ValidateRecord(JsonObject record, bool? archived = null, bool requireExplicitArchive = false)
    {
        ArgumentNullException.ThrowIfNull(record);
        try
        {
            RejectLocal(record); Uuid(Text(record["id"])); var text = Text(record["text"]); _ = Utf8.GetByteCount(text);
            if (text.Length is < 1 or > 500 || string.IsNullOrWhiteSpace(text) || text != text.Trim() || text.Contains('\0')) throw Invalid("模板正文无效");
            _ = Integer(record["version"], 1); _ = Stamp(record["created_at"]); _ = Stamp(record["updated_at"]);
            var days = Integer(record["completed_days"], 0); if (days > 30 || Text(record["habit_status"]) != (days >= 21 ? "habit" : "todo")) throw Invalid("模板习惯统计无效");
            if (record.ContainsKey("deleted_at") || record.ContainsKey("deleted")) throw Invalid("模板归档对象不能混入软删除收据");
            if (requireExplicitArchive && !record.ContainsKey("archived_at")) throw Invalid("归档动作收据缺少明确状态");
            var actual = record["archived_at"] != null; if (actual) _ = Stamp(record["archived_at"]);
            if (archived != null && actual != archived) throw Invalid("模板归档状态与请求范围不一致");
        }
        catch (Exception error) when (error is JsonException or ArgumentException or InvalidOperationException or FormatException or OverflowException)
        { throw Invalid("模板完整记录结构无效", error); }
    }

    // Downloaded active snapshots can mark their completeness, but that marker never expands
    // their authority to the independent archived collection. Projected/partial rows are not baselines.
    internal static bool CompleteList(JsonObject envelope, bool archived)
    {
        try
        {
            var copy = (JsonObject)envelope.DeepClone();
            if (copy.Remove("_local_complete", out var complete) && !Boolean(complete)) return false;
            _ = ParseList(ListPath(archived), copy.ToJsonString()); return true;
        }
        catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException) { return false; }
    }

    public static JsonObject? ProjectList(bool archived, WorkspaceState state)
    {
        ArgumentNullException.ThrowIfNull(state); if (string.IsNullOrWhiteSpace(state.ScopeId)) throw Invalid("缺少当前工作区身份");
        long bytes = 0; int rows = 0; var cache = new Dictionary<string, string>(StringComparer.Ordinal); var revisions = new Dictionary<string, long>(StringComparer.Ordinal);
        var lookup = new Dictionary<string, PendingOperation>(StringComparer.Ordinal); foreach (var operation in state.Outbox) if (!lookup.TryAdd(operation.Id, operation)) throw Invalid("同步操作标识重复");
        var keep = new HashSet<string>(state.Outbox.Where(operation => TemplatePath(operation.Path) || TodoLink(operation.Path, out _)).Select(operation => operation.Id), StringComparer.Ordinal);
        var queue = new Queue<string>(keep);
        while (queue.TryDequeue(out var id)) if (lookup.TryGetValue(id, out var operation))
            foreach (var dependency in operation.DependencyIds.Concat(operation.SupersededById == null ? [] : [operation.SupersededById]).Concat(operation.VersionFromDependencyId == null ? [] : [operation.VersionFromDependencyId]))
                if (keep.Add(dependency)) queue.Enqueue(dependency);
        var operations = state.Outbox.Where(operation => keep.Contains(operation.Id)).ToList();
        var growth = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase); long expanded = 0;
        var linkedTodoIds = operations.Select(operation => TodoLink(operation.Path, out var id) ? id : "").Where(id => id.Length > 0).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var (path, raw) in state.Cache)
        {
            if (path == ListPath(false) || path == ListPath(true) || TemplateDetail(path))
            {
                Read(raw); var root = Envelope(raw, state.ScopeId); var data = Object(root["data"]);
                if (root["_local_template_archive"] is { } metadata)
                {
                    var meta = Object(metadata);
                    if (Text(meta["scope_id"]) != state.ScopeId || Text(meta["query_path"]) != path || Stamp(meta["observed_at_utc"]).Offset != TimeSpan.Zero)
                        throw Invalid("模板缓存来源身份或查询不一致");
                }
                expanded += Utf8.GetByteCount(root.ToJsonString());
                if (data["items"] is JsonArray items) { Count(items.Count); foreach (var item in items) Estimate("template:", Object(item)); }
                else { Count(1); Estimate("template:", data); }
                cache[path] = raw; revisions[path] = state.CacheRevisions.GetValueOrDefault(path);
            }
            else if (linkedTodoIds.Count > 0 && path.StartsWith("/api/v1/todos", StringComparison.Ordinal) && linkedTodoIds.Any(id => raw.Contains(id, StringComparison.OrdinalIgnoreCase)))
            {
                Read(raw); var root = Envelope(raw, state.ScopeId); var data = Object(root["data"]);
                var candidates = data["items"] is JsonArray items ? items.Select(Object) : [data];
                foreach (var row in candidates.Where(row => linkedTodoIds.Contains(TextOrEmpty(row["id"]))))
                {
                    Count(1); var key = "/api/v1/todos/" + Text(row["id"]);
                    cache[key] = new JsonObject { ["data"] = row.DeepClone(), ["_local_scope_id"] = state.ScopeId }.ToJsonString(); revisions[key] = state.CacheRevisions.GetValueOrDefault(path);
                    expanded += Utf8.GetByteCount(cache[key]); Estimate("todo:", row);
                }
            }
        }
        if (expanded > 64L * 1024 * 1024) throw Invalid("模板基线展开超过 64MiB 预算");
        foreach (var operation in operations)
        {
            Read(operation.RequestBodyJson); _ = ParseObject(operation.RequestBodyJson);
            if (operation.RemoteJson != null) { Read(operation.RemoteJson); _ = Envelope(operation.RemoteJson, state.ScopeId); }
            Count(1);
            if (operation.Status == PendingStatus.Superseded) continue;
            var body = ParseObject(operation.RequestBodyJson); var parts = operation.Path.Split('/');
            var resource = parts.Length >= 5 && parts[3] == "todo-templates" ? "template:" + parts[4].ToLowerInvariant() :
                operation.Path == ListPath(false) ? "template:" + Text(body["id"]).ToLowerInvariant() :
                TodoLink(operation.Path, out var todoId) ? "todo:" + todoId.ToLowerInvariant() : operation.Path;
            Increase(resource);
            if (TodoLink(operation.Path, out _) && body["template_id"] != null) Increase("template:" + Text(body["template_id"]).ToLowerInvariant());
            void Increase(string identity)
            {
                var size = growth.GetValueOrDefault(identity, 8192);
                var next = checked(size * 2 + Utf8.GetByteCount(operation.RequestBodyJson) * 6L + (operation.RemoteJson == null ? 0 : Utf8.GetByteCount(operation.RemoteJson) * 6L) + 2048);
                expanded = checked(expanded + next - growth.GetValueOrDefault(identity));
                if (expanded > 64L * 1024 * 1024) throw Invalid("模板全部本机意图的预览展开超过 64MiB 总预算"); growth[identity] = next;
            }
        }
        var pathForRead = ListPath(archived); var projected = WorkspaceProjection.Project(pathForRead, cache.GetValueOrDefault(pathForRead), state with { Cache = cache, CacheRevisions = revisions, Outbox = operations });
        if (projected != null && Utf8.GetByteCount(projected) > MaximumLocalBytes) throw Invalid("模板本机预览输出超过 8MiB 总预算");
        return projected == null ? null : Object(JsonNode.Parse(projected));
        void Read(string raw) { bytes += Utf8.GetByteCount(raw); if (bytes > MaximumLocalBytes) throw Invalid("模板本机预览读取超过 8MiB 总预算"); }
        void Count(int count) { rows = checked(rows + count); if (rows > MaximumItems) throw Invalid("模板本机预览超过 10000 行预算"); }
        void Estimate(string prefix, JsonObject row)
        { var key = prefix + Text(row["id"]).ToLowerInvariant(); growth[key] = Math.Max(growth.GetValueOrDefault(key), Utf8.GetByteCount(row.ToJsonString())); }
    }

    private static bool TemplatePath(string path) => path == ListPath(false) || TemplateDetail(path) ||
        path.StartsWith("/api/v1/todo-templates/", StringComparison.Ordinal) && path.Split('/').Length == 6 && path.Split('/')[5] is "archive" or "restore";
    private static bool TemplateDetail(string path) => path.StartsWith("/api/v1/todo-templates/", StringComparison.Ordinal) && path.Split('/').Length == 5 && Guid.TryParseExact(path.Split('/')[4], "D", out _);
    private static bool TodoLink(string path, out string id)
    { var parts = path.Split('/'); id = parts.Length == 6 && parts[1] == "api" && parts[2] == "v1" && parts[3] == "todos" && parts[5] == "template" && Guid.TryParseExact(parts[4], "D", out _) ? parts[4] : ""; return id.Length > 0; }
    private static JsonObject Envelope(string raw, string? scope)
    {
        if (Utf8.GetByteCount(raw) > MaximumLocalBytes) throw Invalid("模板本机 JSON 超过 8MiB 预算"); var root = ParseObject(raw);
        if (root.ContainsKey("_local_scope_id") && (Text(root["_local_scope_id"]).Length == 0 || scope != null && Text(root["_local_scope_id"]) != scope)) throw Invalid("模板数据属于其他工作区"); return root;
    }
    private static JsonObject ParseObject(string raw)
    { using var doc = JsonDocument.Parse(raw); CheckJson(doc.RootElement); return Object(JsonNode.Parse(raw)); }
    private static void CheckJson(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object) { var names = new HashSet<string>(StringComparer.Ordinal); foreach (var property in value.EnumerateObject()) { _ = Utf8.GetByteCount(property.Name); if (!names.Add(property.Name)) throw Invalid("模板 JSON 字段重复"); CheckJson(property.Value); } }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckJson(item);
        else if (value.ValueKind == JsonValueKind.String) _ = Utf8.GetByteCount(value.GetString()!);
    }
    private static void RejectLocal(JsonObject value, bool root = false)
    { if (value.Any(pair => pair.Key.StartsWith("_local_", StringComparison.Ordinal) && !(root && pair.Key is "_local_scope_id" or "_local_template_archive") || pair.Key == "_operation_id")) throw Invalid("本机投影不能充当模板服务器基线"); }
    private static void Uuid(string id) { if (!Guid.TryParseExact(id, "D", out _) || id[14] is < '1' or > '8' || !"89abAB".Contains(id[19])) throw Invalid("模板 UUID 无效"); }
    private static long Integer(JsonNode? value, long minimum)
    {
        if (value is JsonValue number)
        {
            long n; if (number.TryGetValue<long>(out var wide)) n = wide; else if (number.TryGetValue<int>(out var small)) n = small; else throw Invalid("模板版本或数值无效");
            if (n >= minimum && n <= MaxSafe) return n;
        }
        throw Invalid("模板版本或数值无效");
    }
    private static bool Boolean(JsonNode? value) => value is JsonValue flag && flag.TryGetValue<bool>(out var b) ? b : throw Invalid("模板布尔标记无效");
    private static DateOnly Date(JsonNode? value) => DateOnly.TryParseExact(Text(value), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : throw Invalid("模板日期无效");
    private static DateTimeOffset Stamp(JsonNode? value) { var text = Text(value); return StampPattern.IsMatch(text) && DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var stamp) ? stamp : throw Invalid("模板时间无效"); }
    private static string Text(JsonNode? value) => value is JsonValue item && item.TryGetValue<string>(out var text) ? text : throw Invalid("模板文字字段缺失");
    private static string TextOrEmpty(JsonNode? value) => value is JsonValue item && item.TryGetValue<string>(out var text) ? text : "";
    private static JsonObject Object(JsonNode? value) => value as JsonObject ?? throw Invalid("模板对象缺失");
    private static JsonArray Array(JsonNode? value) => value as JsonArray ?? throw Invalid("模板列表缺失");
    private static long WireBytes(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => 2 + value.EnumerateObject().Sum(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)) + Math.Max(0, value.EnumerateObject().Count() - 1),
        JsonValueKind.Array => 2 + value.EnumerateArray().Sum(WireBytes) + Math.Max(0, value.GetArrayLength() - 1), JsonValueKind.String => QuotedBytes(value.GetString()!),
        JsonValueKind.True => 4, JsonValueKind.False => 5, JsonValueKind.Null => 4, _ => Utf8.GetByteCount(value.GetRawText())
    };
    private static long QuotedBytes(string value) { long count = Utf8.GetByteCount(value) + 2; foreach (var c in value) if (c is '"' or '\\') count++; else if (c < 32) count += c is '\b' or '\f' or '\n' or '\r' or '\t' ? 1 : 5; return count; }
    private static InvalidDataException Invalid(string message, Exception? inner = null) => new(message + "；原缓存、草稿及同步队列未改变。", inner);
}
