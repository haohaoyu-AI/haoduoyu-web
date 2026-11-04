using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Core;

public sealed class ArticleLedgerPage
{
    private readonly JsonArray data;
    private readonly JsonObject meta;
    internal ArticleLedgerPage(JsonArray data, JsonObject meta, int total, int unfilteredTotal, int unknownCount)
        => (this.data, this.meta, Total, UnfilteredTotal, UnknownCount) = (data, meta, total, unfilteredTotal, unknownCount);
    public JsonArray Data => (JsonArray)data.DeepClone();
    public JsonObject Meta => (JsonObject)meta.DeepClone();
    public int Total { get; }
    public int UnfilteredTotal { get; }
    public int UnknownCount { get; }
}

/// <summary>The website's article query contract, applied to detached current-partition rows.</summary>
public sealed class ArticleLedgerQuery
{
    private const long MaxSafe = 9_007_199_254_740_991;
    private const long DayMs = 86_400_000;
    private static readonly string[] Statuses = ["drafting", "illustrated", "draft_saved", "published", "failed"];
    private static readonly string[] Slots = ["zh1", "zh2", "tt1", "tt2", "zh3", "tt3", "gzh"];
    private static readonly string[] Writers = ["dedao", "gemini_web", "human", "other"];
    private static readonly string[] MetricKeys = ["reads", "impressions", "likes", "comments", "favorites", "shares", "approvals", "reading_users"];
    private static readonly string[] QueryKeys = ["account_id", "platform", "status", "q", "from", "to", "mode", "topic", "data_status", "slot", "writer",
        "has_warnings", "has_pending_verify", "series_no_min", "series_no_max", "sort", "order", "page", "page_size", "limit", "offset", "fields"];
    private static readonly string[] FullFields = ["account_id", "platform", "account_name", "status", "title", "url", "published_at", "started_at", "production_mode", "summary", "notes",
        "latest_metrics", "latest_as_of", "slot", "writer", "series_no", "char_count", "subheading_count", "image_count", "draft_ref", "verify_items"];
    private static readonly char[] JsWhitespace = ['\u0009', '\u000a', '\u000b', '\u000c', '\u000d', '\u0020', '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'];
    private static readonly Regex DayPattern = new(@"^([0-9]{4})-([0-9]{2})-([0-9]{2})$", RegexOptions.CultureInvariant);
    private static readonly Regex StampPattern = new(@"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,9}))?)?(Z|([+-])([0-9]{2}):([0-9]{2}))$", RegexOptions.CultureInvariant);
    private static readonly Regex DateUnverified = new(@"(?:日期|发布日期|发布时间|发布日|时间)待(?:核实|确认)|\[date-unverified\]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly CompareInfo Collation = CultureInfo.GetCultureInfo("en-US").CompareInfo;
    private readonly ReadOnlyDictionary<string, string> values;
    private readonly string? lower, upper;
    private readonly bool upperExclusive;
    private ArticleLedgerQuery(Dictionary<string, string> values, string? lower, string? upper, bool upperExclusive,
        long page, int? size, long offset, bool paginated)
        => (this.values, this.lower, this.upper, this.upperExclusive, Page, PageSize, Offset, Paginated) =
            (new(values), lower, upper, upperExclusive, page, size, offset, paginated);

    public string Status => values.GetValueOrDefault("status", "published");
    public long Page { get; }
    public int? PageSize { get; }
    public long Offset { get; }
    public bool Paginated { get; }
    public IReadOnlyDictionary<string, string> Values => values;

    public static ArticleLedgerQuery Parse(string path)
    {
        if (path is null || path.Length > 8192 || path.Contains('#') || path.Contains('\\') || path.Any(char.IsControl)) throw Invalid("文章查询地址无效");
        var split = path.Split('?', 2); if (split[0] != "/api/v1/articles") throw Invalid("文章查询地址无效");
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        if (split.Length == 2)
        {
            if (split[1].Length == 0) throw Invalid("文章查询参数不完整");
            foreach (var item in split[1].Split('&'))
            {
                var pair = item.Split('=', 2); if (pair.Length != 2 || !ValidEncoding(pair[0]) || !ValidEncoding(pair[1])) throw Invalid("文章查询编码无效");
                var name = Uri.UnescapeDataString(pair[0].Replace('+', ' ')); var value = Uri.UnescapeDataString(pair[1].Replace('+', ' '));
                if (!values.TryAdd(name, value)) throw Invalid("文章查询参数重复");
            }
        }
        return Parse(values);
    }

    public static ArticleLedgerQuery Parse(IReadOnlyDictionary<string, string> input)
    {
        ArgumentNullException.ThrowIfNull(input);
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, value) in input)
        {
            if (!QueryKeys.Contains(key, StringComparer.Ordinal) || value is null || !WellFormed(value)) throw Invalid("文章查询参数不在已核对契约中");
            if (value.Length > (key == "q" ? 300 : 512) || value.Any(c => c is <= '\b' or '\v' or '\f' or >= '\u000e' and <= '\u001f')) throw Invalid("文章查询文字无效或超过预算");
            values.Add(key, value);
        }
        Choice("status", Statuses, supplied: true); Choice("slot", Slots, supplied: true); Choice("writer", Writers, supplied: true);
        Choice("platform", ["toutiao", "zhihu", "wechat", "other"]); Choice("mode", ["manual", "automatic", "mixed", "unknown"]);
        Choice("topic", ["entertainment", "insurance", "unknown"]);
        Choice("data_status", ["no_snapshot", "missing_reads", "missing_likes", "missing_comments", "incomplete", "zero_reads", "date_unverified"]);
        Choice("sort", ["published_at", "reads", "likes", "comments", "approvals", "latest_as_of", "duration"]); Choice("order", ["asc", "desc"]);
        Choice("fields", ["index"], supplied: true);
        foreach (var key in new[] { "has_warnings", "has_pending_verify" }) Choice(key, ["true", "false"], supplied: true);
        if (values.TryGetValue("q", out var query) && query.Length != 0)
        { query = JsTrim(query); if (query.Length == 0) throw Invalid("搜索内容不能为空白"); values["q"] = query; }
        long? minimum = null, maximum = null;
        if (values.TryGetValue("series_no_min", out var min)) minimum = Unsigned(min, 1);
        if (values.TryGetValue("series_no_max", out var max)) maximum = Unsigned(max, 1);
        if (minimum > maximum) throw Invalid("保险序号下界不能大于上界");
        string? lower = null, upper = null; var upperExclusive = false;
        if (Nonempty("from") is { } fromDay && Nonempty("to") is { } toDay && DayPattern.IsMatch(fromDay) && DayPattern.IsMatch(toDay) &&
            string.CompareOrdinal(fromDay, toDay) > 0) throw Invalid("开始日期不能晚于结束日期");
        if (Nonempty("from") is { } from) lower = CanonicalFilterDate(from, false, out _);
        if (Nonempty("to") is { } to) upper = CanonicalFilterDate(to, true, out upperExclusive);
        if (lower != null && upper != null && string.CompareOrdinal(lower, upper) > 0) throw Invalid("开始日期不能晚于结束日期");
        var pageMode = values.ContainsKey("page") || values.ContainsKey("page_size"); var offsetMode = values.ContainsKey("limit") || values.ContainsKey("offset");
        if (pageMode && offsetMode) throw Invalid("页码与偏移分页不能混用");
        var paginated = pageMode || offsetMode; int? size = null; long offset = 0, page = 1;
        if (paginated)
        {
            size = checked((int)(values.TryGetValue(pageMode ? "page_size" : "limit", out var rawSize) ? Unsigned(rawSize, 1, 200) : 20));
            page = values.TryGetValue("page", out var rawPage) ? Unsigned(rawPage, 1) : 1;
            try { offset = pageMode ? checked((page - 1) * size.Value) : values.TryGetValue("offset", out var rawOffset) ? Unsigned(rawOffset, 0) : 0; }
            catch (OverflowException) { throw Invalid("分页偏移超过安全整数范围"); }
            if (offset > MaxSafe) throw Invalid("分页偏移超过安全整数范围");
            page = offset / size.Value + 1;
        }
        if (Nonempty("fields") == "index" && (new[] { "reads", "likes", "comments", "approvals", "latest_as_of" }.Contains(Nonempty("sort")) ||
            Nonempty("data_status") is { } dataStatus && dataStatus != "date_unverified")) throw Invalid("文章索引不支持依赖快照的排序或数据状态");
        // Empty optional values have no server predicate. Never remove a supplied strict enum.
        foreach (var key in values.Where(pair => pair.Value.Length == 0).Select(pair => pair.Key).ToArray()) values.Remove(key);
        values.TryAdd("status", "published");
        return new(values, lower, upper, upperExclusive, page, size, offset, paginated);

        string? Nonempty(string key) => values.TryGetValue(key, out var value) && value.Length != 0 ? value : null;
        void Choice(string key, string[] choices, bool supplied = false)
        { if (values.TryGetValue(key, out var value) && (supplied || value.Length != 0) && !choices.Contains(value, StringComparer.Ordinal)) throw Invalid("文章筛选项 " + key + " 无效"); }
    }

    public string ToPath() => "/api/v1/articles?" + string.Join('&', values.OrderBy(pair => Array.IndexOf(QueryKeys, pair.Key))
        .Select(pair => Uri.EscapeDataString(pair.Key) + "=" + Uri.EscapeDataString(pair.Value)));

    public ArticleLedgerPage Apply(IEnumerable<JsonObject> source)
    {
        ArgumentNullException.ThrowIfNull(source);
        var input = source.Take(50001).ToArray();
        if (input.Length > 50000) throw new InvalidDataException("本机文章筛选超过安全预算。");
        var rows = input.Select(Recompute).Where(row => !Deleted(row)).ToArray();
        var statusRows = rows.Where(row => Text(row, "status") == Status).ToArray();
        var filtered = statusRows.Where(Matches).ToArray(); Array.Sort(filtered, Compare);
        var page = !Paginated ? filtered : Offset > int.MaxValue ? [] : filtered.Skip((int)Offset).Take(PageSize!.Value).ToArray();
        var data = new JsonArray(page.Select(row => (JsonNode?)IndexFields(row)).ToArray());
        var meta = new JsonObject { ["total"] = filtered.Length, ["unfiltered_total"] = statusRows.Length, ["page"] = Page,
            ["page_size"] = PageSize, ["offset"] = Offset, ["has_more"] = Paginated && Offset + PageSize!.Value < filtered.Length,
            ["pagination"] = Paginated ? "offset" : "legacy" };
        return new(data, meta, filtered.Length, statusRows.Length, rows.Count(row => Flag(row, "_local_ledger_unknown")));
    }

    public static JsonObject Recompute(JsonObject source)
    {
        var row = (JsonObject)source.DeepClone(); var unknown = FullFields.Any(field => !row.ContainsKey(field)) || Flag(row, "_local_incomplete");
        var platform = Text(row, "platform"); var account = Text(row, "account_id"); var name = Text(row, "account_name");
        var topic = platform == "wechat" && (name == "小鱼儿真保鲜" || account == "wechat-xiaoyuer") ? "insurance" :
            platform is "toutiao" or "zhihu" && (name == "好多鱼" || account is "toutiao-haoduoyu" or "zhihu-haoduoyu") ? "entertainment" : "unknown";
        row["topic"] = topic; row["topic_source"] = topic == "unknown" ? "unknown" : "inferred";
        var published = !row.ContainsKey("status") || Text(row, "status") == "published";
        if (!published)
        { row["date_status"] = "not_published"; row["snapshot_status"] = "not_applicable"; row["missing_metrics"] = new JsonArray(); row["duration_seconds"] = null; }
        else
        {
            var validPublication = TryLooseStamp(Text(row, "published_at"), out var publication);
            row["date_status"] = !row.ContainsKey("published_at") ? "unknown" : !validPublication || DateUnverified.IsMatch(Text(row, "notes")) ? "unverified" : "recorded";
            row["snapshot_status"] = !row.ContainsKey("latest_metrics") ? "unknown" : row["latest_metrics"] is null ? "not_collected" : "collected";
            row["missing_metrics"] = new JsonArray(MetricKeys.Where(key => !KnownNumber(Metric(row, key), out _)).Select(key => (JsonNode?)JsonValue.Create(key)).ToArray());
            row["duration_seconds"] = validPublication && TryLooseStamp(Text(row, "started_at"), out var started) ? JsonValue.Create(Math.Floor((publication - started) / 1000d + .5)) : null;
        }
        var warnings = new List<string>(); var slot = Text(row, "slot");
        var toutiao = platform == "toutiao" || row["platform"] == null && slot is "tt1" or "tt2" or "tt3";
        if (toutiao && Text(row, "title").EnumerateRunes().Count() > 30) warnings.Add("TOUTIAO_TITLE_TOO_LONG");
        if (NonnegativeInteger(row["char_count"], out var chars) && (chars < 2000 || chars > 2300)) warnings.Add("CHAR_COUNT_OUT_OF_RANGE");
        if (NonnegativeInteger(row["subheading_count"], out var headings) && (headings < 5 || headings > 7)) warnings.Add("SUBHEADING_COUNT_OUT_OF_RANGE");
        if (slot is "zh1" or "zh2" or "zh3" or "tt1" or "tt2" or "tt3" && NonnegativeInteger(row["image_count"], out var images) && images < 25) warnings.Add("ENTERTAINMENT_IMAGES_TOO_FEW");
        if (Text(row, "status") == "draft_saved" && !DraftCredential(row)) warnings.Add("DRAFT_CREDENTIAL_MISSING");
        row["warnings"] = new JsonArray(warnings.Select(warning => (JsonNode?)JsonValue.Create(warning)).ToArray());
        var verify = Pipeline(row, "verify_items");
        if (verify is not JsonArray items) { row["has_pending_verify"] = null; row["verify_state"] = "unknown"; }
        else if (items.Any(item => item is JsonObject value && value["done"] is JsonValue scalar && scalar.TryGetValue<bool>(out var done) && !done))
        { row["has_pending_verify"] = true; row["verify_state"] = "pending"; }
        else if (items.Any(item => item is not JsonObject value || value["done"] is not JsonValue scalar || !scalar.TryGetValue<bool>(out var done) || !done))
        { row["has_pending_verify"] = null; row["verify_state"] = "unknown"; }
        else { row["has_pending_verify"] = false; row["verify_state"] = "complete"; }
        row["_local_ledger_unknown"] = unknown; row["_local_ledger_derived"] = true;
        return row;
    }

    private bool Matches(JsonObject row)
    {
        foreach (var key in new[] { "account_id", "platform", "slot", "writer" }) if (Get(key) is { } expected && Text(row, key) != expected) return false;
        if (Get("mode") is { } mode && Text(row, "production_mode") != mode) return false;
        if (Get("q") is { } query && !new[] { "title", "url", "summary", "notes" }.Any(key => AsciiContains(Text(row, key), query))) return false;
        var date = row["published_at"] is JsonValue published && published.TryGetValue<string>(out var dateText) ? dateText : null;
        if (lower != null && (date == null || string.CompareOrdinal(date, lower) < 0) || upper != null &&
            (date == null || (upperExclusive ? string.CompareOrdinal(date, upper) >= 0 : string.CompareOrdinal(date, upper) > 0))) return false;
        if (Get("series_no_min") is { } min && (!KnownNumber(row["series_no"], out var minimumSeries) || minimumSeries < Unsigned(min, 1))) return false;
        if (Get("series_no_max") is { } max && (!KnownNumber(row["series_no"], out var maximumSeries) || maximumSeries > Unsigned(max, 1))) return false;
        if (Get("topic") is { } topic && Text(row, "topic") != topic) return false;
        if (Get("data_status") is { } dataStatus)
        {
            var missing = row["missing_metrics"] as JsonArray;
            if (!(dataStatus switch
            {
                "no_snapshot" => Text(row, "snapshot_status") == "not_collected",
                "date_unverified" => Text(row, "date_status") == "unverified",
                "zero_reads" => KnownNumber(Metric(row, "reads"), out var reads) && reads == 0,
                "incomplete" => row.ContainsKey("latest_metrics") && new[] { "reads", "likes", "comments" }.Any(key => missing?.Any(value => value?.ToString() == key) == true),
                _ => row.ContainsKey("latest_metrics") && missing?.Any(value => value?.ToString() == dataStatus[8..]) == true
            })) return false;
        }
        if (Get("has_warnings") is { } hasWarnings)
        {
            var has = row["warnings"]!.AsArray().Count != 0;
            if (has != (hasWarnings == "true") || !has && Flag(row, "_local_ledger_unknown")) return false;
        }
        if (Get("has_pending_verify") is { } pending && (row["has_pending_verify"] is not JsonValue value ||
            !value.TryGetValue<bool>(out var actual) || actual != (pending == "true"))) return false;
        return true;
    }
    private int Compare(JsonObject a, JsonObject b)
    {
        var field = Get("sort") ?? "published_at"; var descending = (Get("order") ?? "desc") == "desc";
        var left = SortValue(a, field); var right = SortValue(b, field);
        if (left == null && right != null) return 1; if (right == null && left != null) return -1;
        var difference = left == null ? 0 : left is double number && right is double other ? number.CompareTo(other) : string.CompareOrdinal((string)left, (string)right!);
        if (difference != 0) return descending ? -difference : difference;
        var aDate = a["published_at"] is null ? null : Text(a, "published_at"); var bDate = b["published_at"] is null ? null : Text(b, "published_at");
        if (aDate == null && bDate != null) return 1; if (bDate == null && aDate != null) return -1;
        var dateOrder = -Collation.Compare(aDate ?? "", bDate ?? "", CompareOptions.None);
        return dateOrder != 0 ? dateOrder : Collation.Compare(Text(a, "id"), Text(b, "id"), CompareOptions.None);
    }
    private static object? SortValue(JsonObject row, string field) => field is "reads" or "likes" or "comments" or "approvals" ?
        KnownNumber(Metric(row, field), out var metric) ? metric : null : field == "duration" ?
        KnownNumber(row["duration_seconds"], out var duration) ? duration : null : row[field == "latest_as_of" ? field : "published_at"] is null ? null : Text(row, field == "latest_as_of" ? field : "published_at");
    private JsonObject IndexFields(JsonObject row)
    {
        if (Get("fields") != "index") return row;
        return new JsonObject(new[] { "id", "title", "account_id", "platform", "published_at" }.Select(key => KeyValuePair.Create(key, row[key]?.DeepClone())));
    }
    private string? Get(string key) => values.TryGetValue(key, out var value) && value.Length != 0 ? value : null;
    private static bool DraftCredential(JsonObject row)
    {
        if (Pipeline(row, "draft_ref") is not JsonObject reference) return false;
        var platform = row["platform"] == null ? Text(row, "slot") is "tt1" or "tt2" or "tt3" ? "toutiao" : Text(row, "slot") is "zh1" or "zh2" or "zh3" ? "zhihu" : Text(row, "slot") == "gzh" ? "wechat" : "other" : Text(row, "platform");
        var key = platform == "toutiao" ? "pgc_id" : platform == "wechat" ? "appmsgid" : "editor_url";
        var value = Text(reference, key);
        return key != "editor_url" ? JsTrim(value).Length != 0 :
            (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || value.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) &&
            !value.Any(c => Array.IndexOf(JsWhitespace, c) >= 0 || c is <= '\u001f' or '\u007f') &&
            Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && uri.Host.Length != 0 && uri.UserInfo.Length == 0;
    }
    private static JsonNode? Pipeline(JsonObject row, string key)
    {
        if (row.ContainsKey(key)) return row[key];
        try { return row[key + "_json"] is JsonValue raw && raw.TryGetValue<string>(out var json) ? JsonNode.Parse(json) : null; }
        catch (System.Text.Json.JsonException) { return null; }
    }
    private static bool AsciiContains(string text, string query)
    {
        var nul = text.IndexOf('\0'); var length = nul < 0 ? text.Length : nul;
        for (var start = 0; start <= length - query.Length; start++)
        {
            var same = true;
            for (var i = 0; i < query.Length; i++) if (AsciiLower(text[start + i]) != AsciiLower(query[i])) { same = false; break; }
            if (same) return true;
        }
        return false;
    }
    private static char AsciiLower(char c) => c is >= 'A' and <= 'Z' ? (char)(c + 32) : c;
    private static string JsTrim(string text) => text.Trim(JsWhitespace);
    private static long Unsigned(string text, long min, long max = MaxSafe) => text.Length != 0 && text.All(char.IsAsciiDigit) && long.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number >= min && number <= max ? number : throw Invalid("文章分页或序号须为范围内的安全整数");
    private static bool WellFormed(string value)
    { for (var i = 0; i < value.Length; i++) if (char.IsSurrogate(value[i]) && (!char.IsHighSurrogate(value[i]) || ++i >= value.Length || !char.IsLowSurrogate(value[i]))) return false; return true; }
    private static bool ValidEncoding(string value)
    { for (var i = 0; i < value.Length; i++) if (value[i] == '%' && (i + 2 >= value.Length || !char.IsAsciiHexDigit(value[++i]) || !char.IsAsciiHexDigit(value[++i]))) return false; return true; }
    private static bool KnownNumber(JsonNode? value, out double number)
    {
        number = 0; if (value is not JsonValue scalar) return false;
        if (scalar.TryGetValue<double>(out number)) return double.IsFinite(number);
        if (scalar.TryGetValue<long>(out var integer)) { number = integer; return true; }
        if (scalar.TryGetValue<int>(out var small)) { number = small; return true; }
        if (scalar.TryGetValue<decimal>(out var exact)) { number = (double)exact; return double.IsFinite(number); }
        return false;
    }
    private static bool NonnegativeInteger(JsonNode? value, out long number)
    { number = 0; if (!KnownNumber(value, out var raw) || raw < 0 || raw > MaxSafe || Math.Truncate(raw) != raw) return false; number = (long)raw; return true; }
    private static JsonNode? Metric(JsonObject row, string key) => row["latest_metrics"] is JsonObject metrics ? metrics[key] : null;
    private static string Text(JsonObject row, string key) => row[key] is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text : "";
    private static bool Flag(JsonObject row, string key) => row[key] is JsonValue scalar && scalar.TryGetValue<bool>(out var flag) && flag;
    private static bool Deleted(JsonObject row) => row.ContainsKey("_local_deleted") ? Flag(row, "_local_deleted") : row["deleted_at"] != null;

    private static string CanonicalFilterDate(string value, bool upper, out bool exclusive)
    {
        var day = DayPattern.Match(value); exclusive = day.Success && upper;
        if (day.Success)
        {
            var (year, month, date) = ReadDay(day, strict: true);
            return FormatIso(DaysFromCivil(year, month, date) * DayMs - 8 * 3_600_000 + (upper ? DayMs : 0));
        }
        if (!TryTimestamp(value, strict: true, out var millis)) throw Invalid("文章筛选日期或时间无效");
        return FormatIso(millis);
    }
    private static bool TryLooseStamp(string value, out long millis)
    {
        if (TryTimestamp(value, strict: false, out millis)) return true;
        var day = DayPattern.Match(value);
        if (day.Success)
        {
            try { var (year, month, date) = ReadDay(day, strict: false); millis = DaysFromCivil(year, month, date) * DayMs; return true; }
            catch (ArgumentException) { return false; }
        }
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)) { millis = parsed.ToUnixTimeMilliseconds(); return true; }
        millis = 0; return false;
    }
    private static bool TryTimestamp(string value, bool strict, out long millis)
    {
        millis = 0; var match = StampPattern.Match(value); if (!match.Success) return false;
        try
        {
            var (year, month, date) = ReadDay(match, strict); var hour = int.Parse(match.Groups[4].Value, CultureInfo.InvariantCulture);
            var minute = int.Parse(match.Groups[5].Value, CultureInfo.InvariantCulture); var second = match.Groups[6].Success ? int.Parse(match.Groups[6].Value, CultureInfo.InvariantCulture) : 0;
            var offsetHour = match.Groups[10].Success ? int.Parse(match.Groups[10].Value, CultureInfo.InvariantCulture) : 0;
            var offsetMinute = match.Groups[11].Success ? int.Parse(match.Groups[11].Value, CultureInfo.InvariantCulture) : 0;
            if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return false;
            var fraction = match.Groups[7].Value; var ms = fraction.Length == 0 ? 0 : int.Parse(fraction.PadRight(3, '0')[..3], CultureInfo.InvariantCulture);
            var offset = (offsetHour * 60L + offsetMinute) * 60000 * (match.Groups[9].Value == "-" ? -1 : 1);
            millis = DaysFromCivil(year, month, date) * DayMs + hour * 3_600_000L + minute * 60000L + second * 1000L + ms - offset; return true;
        }
        catch (ArgumentException) { return false; }
    }
    private static (int Year, int Month, int Day) ReadDay(Match match, bool strict)
    {
        var year = int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture); var month = int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture); var day = int.Parse(match.Groups[3].Value, CultureInfo.InvariantCulture);
        var leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        if (month is < 1 or > 12 || day < 1 || day > (strict ? month == 2 ? leap ? 29 : 28 : month is 4 or 6 or 9 or 11 ? 30 : 31 : 31)) throw Invalid("文章日期不存在");
        return (year, month, day);
    }
    private static long DaysFromCivil(int year, int month, int day)
    {
        year -= month <= 2 ? 1 : 0; var era = (year >= 0 ? year : year - 399) / 400;
        var yearOfEra = year - era * 400; var dayOfYear = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
        return era * 146097L + yearOfEra * 365L + yearOfEra / 4 - yearOfEra / 100 + dayOfYear - 719468;
    }
    private static string FormatIso(long millis)
    {
        var days = (long)Math.Floor(millis / (double)DayMs); var rest = millis - days * DayMs; var z = days + 719468;
        var era = (z >= 0 ? z : z - 146096) / 146097; var doe = z - era * 146097;
        var yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; var year = yoe + era * 400;
        var doy = doe - (365 * yoe + yoe / 4 - yoe / 100); var mp = (5 * doy + 2) / 153;
        var date = doy - (153 * mp + 2) / 5 + 1; var month = mp + (mp < 10 ? 3 : -9); year += month <= 2 ? 1 : 0;
        var y = year is >= 0 and <= 9999 ? year.ToString("D4", CultureInfo.InvariantCulture) : (year < 0 ? "-" : "+") + Math.Abs(year).ToString("D6", CultureInfo.InvariantCulture);
        return FormattableString.Invariant($"{y}-{month:D2}-{date:D2}T{rest / 3600000:D2}:{rest / 60000 % 60:D2}:{rest / 1000 % 60:D2}.{rest % 1000:D3}Z");
    }
    private static ArgumentException Invalid(string message) => new(message + "。", "query");
}
