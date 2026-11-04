using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Haoduoyu.Api;

public sealed class ArticleReconciliationSnapshot
{
    private readonly JsonObject data;
    internal ArticleReconciliationSnapshot(JsonObject data) => this.data = (JsonObject)data.DeepClone();
    public JsonObject Data => (JsonObject)data.DeepClone();
    public IReadOnlyList<JsonObject> Rows => Array.AsReadOnly(data["rows"]!.AsArray().Select(row => (JsonObject)row!.DeepClone()).ToArray());
    public int Total => data["rows"]!.AsArray().Count;
}

public sealed record ArticleReconciliationFilter(string AccountId = "", string Status = "", string RunDate = "",
    string Slot = "", string Writer = "", string Query = "", bool? HasWarnings = null, bool? HasPendingVerify = null, bool PendingUnknownOnly = false);

public sealed class ArticleReconciliationView
{
    private readonly JsonObject[] rows;
    private readonly JsonObject counts;
    internal ArticleReconciliationView(JsonObject[] rows, JsonObject counts, int unfilteredTotal)
        => (this.rows, this.counts, UnfilteredTotal) = (rows, counts, unfilteredTotal);
    public IReadOnlyList<JsonObject> Rows => Array.AsReadOnly(rows.Select(row => (JsonObject)row.DeepClone()).ToArray());
    public JsonObject Counts => (JsonObject)counts.DeepClone();
    public int Total => rows.Length;
    public int UnfilteredTotal { get; }
}

/// <summary>A complete, read-only server inventory; never an executable queue or a projection of pending local work.</summary>
public static class ArticleReconciliation
{
    public const int MaximumRows = 4000;
    public const int MaximumRowsBytes = 1_048_576;
    private const long MaxSafe = 9_007_199_254_740_991;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly string[] Statuses = ["drafting", "illustrated", "draft_saved", "published", "failed"];
    private static readonly string[] Slots = ["zh1", "zh2", "tt1", "tt2", "zh3", "tt3", "gzh"];
    private static readonly string[] Writers = ["dedao", "gemini_web", "human", "other"];

    public static ArticleReconciliationSnapshot Parse(string envelopeJson, IReadOnlySet<string>? allowedAccounts = null)
    {
        try
        {
            if (Utf8.GetByteCount(envelopeJson) > WorkbenchApi.MaximumReconciliationResponseBytes) throw Invalid();
            using var document = JsonDocument.Parse(envelopeJson);
            CheckDocument(document.RootElement);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("data", out var data) ||
                data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("rows", out var rows)) throw Invalid();
            // Cache JSON may escape CJK/non-BMP differently; enforce the source's JSON.stringify row budget semantically.
            var parsed = JsonNode.Parse(data.GetRawText());
            return ValidateCore(parsed, allowedAccounts, JsonBytes(parsed?["rows"], MaximumRowsBytes));
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or OverflowException)
        { throw Invalid(error); }
    }

    public static ArticleReconciliationSnapshot Validate(JsonNode? data, IReadOnlySet<string>? allowedAccounts = null)
    {
        try
        {
            var rows = data?["rows"] ?? throw Invalid();
            _ = JsonBytes(data, WorkbenchApi.MaximumReconciliationResponseBytes);
            return ValidateCore(data, allowedAccounts, JsonBytes(rows, MaximumRowsBytes));
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or OverflowException)
        { throw Invalid(error); }
    }

    private static ArticleReconciliationSnapshot ValidateCore(JsonNode? node, IReadOnlySet<string>? allowedAccounts, long rowBytes)
    {
        var data = Object(node); var rows = ArrayNode(data["rows"]);
        if (data["complete"]?.GetValue<bool>() != true || rows.Count > MaximumRows || rowBytes > MaximumRowsBytes ||
            Integer(data["total"], 0, MaximumRows) != rows.Count) throw Invalid();
        var allowed = allowedAccounts is null ? null : new HashSet<string>(allowedAccounts, StringComparer.Ordinal);
        if (allowed != null) foreach (var id in allowed) Identifier(id);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var typed = new List<JsonObject>();
        foreach (var item in rows)
        {
            var row = Object(item); var id = Text(row["id"]); Identifier(id);
            var accountId = Text(row["account_id"]); Identifier(accountId);
            if (!seen.Add(id) || allowed != null && !allowed.Contains(accountId)) throw Invalid();
            _ = Text(row["title"]);
            foreach (var name in new[] { "status", "slot", "writer" }) NullableText(row, name);
            NullableText(row, "run_date"); if (row["run_date"] is not null) Date(Text(row["run_date"]));
            if (!row.ContainsKey("series_no")) throw Invalid();
            if (row["series_no"] is not null) _ = Integer(row["series_no"], 1, MaxSafe);
            if (!row.ContainsKey("sample") || row["sample"] is not null and not JsonObject) throw Invalid();
            var warnings = Strings(row["warnings"]);
            if (warnings.Distinct(StringComparer.Ordinal).Count() != warnings.Length) throw Invalid();
            if (!row.ContainsKey("has_pending_verify")) throw Invalid();
            var state = Text(row["verify_state"]);
            var pending = row["has_pending_verify"];
            if (state == "unknown" ? pending is not null : state == "pending" ? pending?.GetValue<bool>() != true :
                state == "complete" ? pending?.GetValue<bool>() != false : true) throw Invalid();
            var missing = new[] { "run_date", "status", "slot", "writer" }.Concat(TextOrEmpty(row["slot"]) == "gzh" ? ["series_no"] : System.Array.Empty<string>())
                .Where(name => row[name] is null || TextOrEmpty(row[name]) == "unknown").ToArray();
            if (!Strings(row["missing_fields"]).SequenceEqual(missing, StringComparer.Ordinal)) throw Invalid();
            typed.Add(row);
        }
        CheckEqual(data["counts"], Counts(typed));
        CheckEqual(data["dates"], Dates(typed));
        var schedule = Object(data["schedule"]);
        if (schedule["configured"]?.GetValue<bool>() != false) throw Invalid();
        foreach (var name in new[] { "expected", "missing", "overdue" }) RequireNull(schedule, name);
        var expected = Insurance(typed); var insurance = Object(data["insurance"]);
        foreach (var field in expected)
        { if (!insurance.ContainsKey(field.Key)) throw Invalid(); CheckEqual(insurance[field.Key], field.Value); }
        // Read all original strings before any clone/serialization can normalize invalid UTF-16 evidence.
        CheckStrings(data);
        return new ArticleReconciliationSnapshot(data);
    }

    public static ArticleReconciliationView Filter(ArticleReconciliationSnapshot snapshot, ArticleReconciliationFilter? filter = null)
    {
        ArgumentNullException.ThrowIfNull(snapshot); filter ??= new();
        if (filter.AccountId is null || filter.Status is null || filter.RunDate is null || filter.Slot is null || filter.Writer is null || filter.Query is null)
            throw new ArgumentException("筛选条件不能为 null。");
        if (filter.PendingUnknownOnly && filter.HasPendingVerify.HasValue) throw new ArgumentException("未知待核状态不能与明确待核筛选同时启用。");
        if (filter.AccountId.Length > 0) Identifier(filter.AccountId);
        Choice(filter.Status, Statuses); Choice(filter.Slot, Slots); Choice(filter.Writer, Writers);
        if (filter.RunDate is not ("" or "unknown")) Date(filter.RunDate);
        var query = filter.Query.Trim();
        if (query.Length > 300 || query.Any(char.IsControl)) throw new ArgumentException("标题检索最多 300 字符，不接受控制字符。");
        _ = Utf8.GetByteCount(query); query = Fold(query);
        var rows = snapshot.Rows.Where(row =>
            (filter.AccountId.Length == 0 || Text(row["account_id"]) == filter.AccountId) &&
            MatchesChoice(row["status"], filter.Status, Statuses) && MatchesChoice(row["slot"], filter.Slot, Slots) &&
            MatchesChoice(row["writer"], filter.Writer, Writers) &&
            (filter.RunDate.Length == 0 || filter.RunDate == "unknown" ? filter.RunDate.Length == 0 || row["run_date"] is null : TextOrEmpty(row["run_date"]) == filter.RunDate) &&
            (query.Length == 0 || Fold(Text(row["title"])).Contains(query, StringComparison.Ordinal)) &&
            (!filter.HasWarnings.HasValue || (ArrayNode(row["warnings"]).Count > 0) == filter.HasWarnings.Value) &&
            (!filter.PendingUnknownOnly || row["has_pending_verify"] is null) &&
            (!filter.HasPendingVerify.HasValue || row["has_pending_verify"] is JsonValue pending && pending.TryGetValue<bool>(out var flag) && flag == filter.HasPendingVerify.Value))
            .Select(row => (JsonObject)row.DeepClone()).ToArray();
        return new(rows, Counts(rows), snapshot.Total);
    }

    private static bool MatchesChoice(JsonNode? node, string filter, string[] known)
        => filter.Length == 0 || (filter == "unknown" ? !known.Contains(TextOrEmpty(node), StringComparer.Ordinal) : TextOrEmpty(node) == filter);
    private static void Choice(string value, string[] known)
    { if (value.Length > 0 && value != "unknown" && !known.Contains(value, StringComparer.Ordinal)) throw new ArgumentException("筛选条件不受支持。"); }
    private static string Fold(string value) => string.Create(value.Length, value, (target, source) =>
    { for (var i = 0; i < source.Length; i++) target[i] = source[i] is >= 'A' and <= 'Z' ? (char)(source[i] + 32) : source[i]; });
    private static JsonObject Counts(IEnumerable<JsonObject> rows)
    {
        var counts = Statuses.Append("unknown").ToDictionary(status => status, _ => 0, StringComparer.Ordinal);
        foreach (var row in rows) { var status = TextOrEmpty(row["status"]); counts[Statuses.Contains(status, StringComparer.Ordinal) ? status : "unknown"]++; }
        return new JsonObject(counts.Select(pair => KeyValuePair.Create<string, JsonNode?>(pair.Key, JsonValue.Create(pair.Value))));
    }
    private static JsonArray Dates(IEnumerable<JsonObject> rows)
        => new(rows.GroupBy(row => row["run_date"] is null ? "" : Text(row["run_date"])).OrderBy(group => group.Key.Length == 0 ? "z" : group.Key, StringComparer.Ordinal)
            .Select(group => (JsonNode?)new JsonObject { ["date"] = group.Key.Length == 0 ? null : group.Key, ["count"] = group.Count() }).ToArray());
    private static JsonObject Insurance(IReadOnlyList<JsonObject> rows)
    {
        var selected = rows.Where(row => TextOrEmpty(row["slot"]) == "gzh").ToArray();
        var numbers = selected.Where(row => row["series_no"] is not null).GroupBy(row => Integer(row["series_no"], 1, MaxSafe)).OrderBy(group => group.Key).ToArray();
        var gaps = new JsonArray();
        for (var i = 1; i < numbers.Length; i++) if (numbers[i].Key > numbers[i - 1].Key + 1)
            gaps.Add(new JsonObject { ["from"] = numbers[i - 1].Key + 1, ["to"] = numbers[i].Key - 1 });
        return new JsonObject { ["basis"] = "explicit_gzh_slot", ["recorded"] = selected.Length,
            ["numbered"] = selected.Count(row => row["series_no"] is not null), ["unique_count"] = numbers.Length,
            ["highest"] = numbers.Length == 0 ? null : JsonValue.Create(numbers[^1].Key), ["lowest"] = numbers.Length == 0 ? null : JsonValue.Create(numbers[0].Key),
            ["duplicate_numbers"] = new JsonArray(numbers.Where(group => group.Count() > 1).Select(group => (JsonNode?)new JsonObject
            { ["number"] = group.Key, ["article_ids"] = new JsonArray(group.Select(row => (JsonNode?)JsonValue.Create(Text(row["id"]))).ToArray()) }).ToArray()),
            ["observed_gap_ranges"] = gaps, ["start"] = null, ["target"] = null, ["sample_mapping"] = "unknown", ["counts"] = Counts(selected) };
    }
    private static void CheckEqual(JsonNode? actual, JsonNode? expected)
    { if (!JsonNode.DeepEquals(actual, expected)) throw Invalid(); }
    private static void RequireNull(JsonObject value, string name)
    { if (!value.ContainsKey(name) || value[name] is not null) throw Invalid(); }
    private static JsonObject Object(JsonNode? node) => node as JsonObject ?? throw Invalid();
    private static JsonArray ArrayNode(JsonNode? node) => node as JsonArray ?? throw Invalid();
    private static string Text(JsonNode? node)
    { if (node is not JsonValue value || !value.TryGetValue<string>(out var text) || text.Length == 0) throw Invalid(); _ = Utf8.GetByteCount(text); return text; }
    private static string TextOrEmpty(JsonNode? node) => node is null ? "" : node is JsonValue value && value.TryGetValue<string>(out var text) ? text : node.ToJsonString();
    private static void NullableText(JsonObject row, string name)
    { if (!row.ContainsKey(name) || row[name] is not null && (row[name] is not JsonValue value || !value.TryGetValue<string>(out _))) throw Invalid(); }
    private static string[] Strings(JsonNode? node) => ArrayNode(node).Select(Text).ToArray();
    private static long Integer(JsonNode? node, long min, long max)
    {
        if (node is not JsonValue value) throw Invalid();
        long number; if (!value.TryGetValue<long>(out number)) { if (!value.TryGetValue<int>(out var integer)) throw Invalid(); number = integer; }
        if (number < min || number > max) throw Invalid(); return number;
    }
    private static void Identifier(string value)
    { if (string.IsNullOrWhiteSpace(value) || value.Length > 512 || value is "." or ".." || value.Any(character => char.IsControl(character) || character is '/' or '\\' or '?' or '#')) throw Invalid(); _ = Utf8.GetByteCount(value); }
    private static void Date(string value)
    { if (value.Length != 10 || !DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw Invalid(); }
    private static void CheckStrings(JsonNode? value)
    {
        if (value is JsonObject obj) foreach (var pair in obj) { _ = Utf8.GetByteCount(pair.Key); CheckStrings(pair.Value); }
        else if (value is JsonArray array) foreach (var item in array) CheckStrings(item);
        else if (value is JsonValue scalar && scalar.TryGetValue<string>(out var text)) _ = Utf8.GetByteCount(text);
    }
    private static void CheckDocument(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject()) { if (!names.Add(property.Name)) throw Invalid(); _ = Utf8.GetByteCount(property.Name); CheckDocument(property.Value); }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckDocument(item);
        else if (value.ValueKind == JsonValueKind.String) _ = Utf8.GetByteCount(value.GetString()!);
    }
    // JSON.stringify uses literal valid Unicode, short control escapes and decimal/scientific number thresholds.
    // Counting decoded values avoids treating equivalent cache escaping as additional business content.
    private static long JsonBytes(JsonNode? value, long maximum)
    {
        long count = 0;
        void Add(long bytes) { count = checked(count + bytes); if (count > maximum) throw Invalid(); }
        void Quote(string text)
        {
            _ = Utf8.GetByteCount(text); Add(2);
            for (var i = 0; i < text.Length; i++)
            {
                var character = text[i];
                if (character is '"' or '\\' or '\b' or '\f' or '\n' or '\r' or '\t') Add(2);
                else if (character < 32) Add(6);
                else if (char.IsHighSurrogate(character)) { Add(4); i++; }
                else Add(character < 128 ? 1 : character < 2048 ? 2 : 3);
            }
        }
        void Visit(JsonNode? node)
        {
            if (node is null) { Add(4); return; }
            if (node is JsonObject obj)
            {
                Add(2); var first = true;
                foreach (var pair in obj) { if (!first) Add(1); first = false; Quote(pair.Key); Add(1); Visit(pair.Value); }
            }
            else if (node is JsonArray array)
            { Add(2); for (var i = 0; i < array.Count; i++) { if (i > 0) Add(1); Visit(array[i]); } }
            else if (node is JsonValue scalar && scalar.TryGetValue<string>(out var text)) Quote(text);
            else if (node is JsonValue boolean && boolean.TryGetValue<bool>(out var flag)) Add(flag ? 4 : 5);
            else Add(Utf8.GetByteCount(JavaScriptNumber(node.ToJsonString())));
        }
        Visit(value); return count;
    }
    private static string JavaScriptNumber(string raw)
    {
        if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) || !double.IsFinite(number)) throw Invalid();
        if (number == 0) return "0";
        var negative = number < 0; var representation = Math.Abs(number).ToString("R", CultureInfo.InvariantCulture);
        var parts = representation.Split('E', 'e');
        var mantissa = parts[0]; var point = mantissa.IndexOf('.'); if (point < 0) point = mantissa.Length;
        var digits = mantissa.Replace(".", "", StringComparison.Ordinal);
        var exponent = parts.Length == 2 ? int.Parse(parts[1], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture) : 0;
        var position = point + exponent;
        while (digits.Length > 1 && digits[0] == '0') { digits = digits[1..]; position--; }
        while (digits.Length > 1 && digits[^1] == '0') digits = digits[..^1];
        string result;
        if (digits.Length <= position && position <= 21) result = digits + new string('0', position - digits.Length);
        else if (position > 0 && position <= 21) result = digits.Insert(position, ".");
        else if (position > -6 && position <= 0) result = "0." + new string('0', -position) + digits;
        else { var power = position - 1; result = digits[0] + (digits.Length > 1 ? "." + digits[1..] : "") + "e" + (power >= 0 ? "+" : "") + power.ToString(CultureInfo.InvariantCulture); }
        return negative ? "-" + result : result;
    }
    private static InvalidDataException Invalid(Exception? inner = null) => new("完整文章对账的身份、记录、计数或数据口径无法核实；原缓存保留。", inner);
}
