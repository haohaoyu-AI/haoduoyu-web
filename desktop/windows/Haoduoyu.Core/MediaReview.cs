using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Core;

public enum MediaReviewKind { Overview, Due, Observations, Daily }

public sealed class MediaReviewQuery
{
    private MediaReviewQuery(MediaReviewKind kind, Dictionary<string, string> query)
    {
        Kind = kind; AccountId = query.GetValueOrDefault("account_id"); ArticleId = query.GetValueOrDefault("article_id");
        Period = query.GetValueOrDefault("period", "yesterday"); TopN = query.ContainsKey("top_n") ? int.Parse(query["top_n"], CultureInfo.InvariantCulture) : 5;
        TopPlatform = query.GetValueOrDefault("top_platform");
        From = query.ContainsKey("from") ? MediaReview.Date(query["from"]) : null; To = query.ContainsKey("to") ? MediaReview.Date(query["to"]) : null;
        var keys = kind switch { MediaReviewKind.Overview => new[] { "account_id", "period", "top_n", "top_platform" }, MediaReviewKind.Due => ["account_id"],
            MediaReviewKind.Observations => ["account_id", "article_id"], _ => ["account_id", "from", "to"] };
        var fields = keys.Where(key => query.ContainsKey(key) && !(key == "period" && Period == "yesterday") && !(key == "top_n" && TopN == 5))
            .Select(key => key + "=" + Uri.EscapeDataString(key == "top_n" ? TopN.ToString(CultureInfo.InvariantCulture) : query[key])).ToArray();
        Path = "/api/v1/" + (kind switch { MediaReviewKind.Overview => "overview", MediaReviewKind.Due => "due-reviews", MediaReviewKind.Observations => "observations", _ => "daily-metrics" }) +
            (fields.Length > 0 ? "?" + string.Join('&', fields) : "");
    }
    public MediaReviewKind Kind { get; }
    public string? AccountId { get; }
    public string? ArticleId { get; }
    public string Period { get; }
    public int TopN { get; }
    public string? TopPlatform { get; }
    public DateOnly? From { get; }
    public DateOnly? To { get; }
    public string Path { get; }
    public static MediaReviewQuery Parse(string path)
    {
        try { return ParseCore(path); }
        catch (Exception error) when (error is InvalidDataException or FormatException)
        { throw new ArgumentException("旧复盘查询参数无效。", nameof(path), error); }
    }
    private static MediaReviewQuery ParseCore(string path)
    {
        if (path == null || path.Length > 4096 || path.Contains('#') || path.Contains('\\')) throw new ArgumentException("旧复盘查询路径无效。", nameof(path));
        _ = MediaReview.Utf8.GetByteCount(path); var parts = path.Split('?', 2);
        if (parts.Length == 2 && parts[1].Length == 0) throw new ArgumentException("查询参数不能为空。", nameof(path));
        var kind = parts[0] switch { "/api/v1/overview" => MediaReviewKind.Overview, "/api/v1/due-reviews" => MediaReviewKind.Due,
            "/api/v1/observations" => MediaReviewKind.Observations, "/api/v1/daily-metrics" => MediaReviewKind.Daily,
            _ => throw new ArgumentException("旧复盘只支持四个正式只读路径。", nameof(path)) };
        string[] allowed = kind switch { MediaReviewKind.Overview => ["account_id", "period", "top_n", "top_platform"], MediaReviewKind.Due => ["account_id"],
            MediaReviewKind.Observations => ["account_id", "article_id"], _ => ["account_id", "from", "to"] };
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        if (parts.Length == 2 && parts[1].Length > 0) foreach (var field in parts[1].Split('&'))
        {
            var pair = field.Split('=', 2); if (pair.Length != 2) throw new ArgumentException("查询参数必须有明确值。", nameof(path));
            var key = Uri.UnescapeDataString(pair[0]); var value = Uri.UnescapeDataString(pair[1].Replace('+', ' '));
            if (!allowed.Contains(key, StringComparer.Ordinal) || value.Length == 0 || !query.TryAdd(key, value)) throw new ArgumentException("查询含重复、空值或未支持的参数。", nameof(path));
            if (key is "account_id" or "article_id") MediaReview.Id(value);
            else if (key == "period" && value is not ("yesterday" or "7d" or "30d")) throw new ArgumentException("周期仅支持 yesterday、7d、30d。", nameof(path));
            else if (key == "top_platform" && !MediaReview.Platforms.Contains(value, StringComparer.Ordinal)) throw new ArgumentException("榜单平台无效。", nameof(path));
            else if (key == "top_n" && (value.Length > 3 || value.Any(c => !char.IsAsciiDigit(c)) || !int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var n) || n is < 1 or > 100)) throw new ArgumentException("Top N 必须为 1–100。", nameof(path));
            else if (key is "from" or "to") _ = MediaReview.Date(value);
        }
        var result = new MediaReviewQuery(kind, query); if (result.From > result.To) throw new ArgumentException("开始日期不能晚于结束日期。", nameof(path)); return result;
    }
}

public sealed record MediaMetric(bool Present, long? Value) { public bool IsNull => Present && Value == null; }
public sealed record MediaComparison(long? Current, long? Previous, long? Delta, double? Percent, bool Comparable, string Reason);
public sealed record MediaReviewWindow(DateOnly From, DateOnly To, DateOnly PreviousFrom, DateOnly PreviousTo, int Days, string Period, string Timezone, bool TodayIncomplete);

public sealed class MediaCoverage
{
    internal MediaCoverage(string source, int days, int? expected, DateOnly[] missing, Dictionary<string, int> metricDays, string label)
    { Source = source; Days = days; ExpectedDays = expected; MissingDates = System.Array.AsReadOnly(missing); MetricDays = new ReadOnlyDictionary<string, int>(metricDays); Label = label; }
    public string Source { get; }
    public int Days { get; }
    public int? ExpectedDays { get; }
    public IReadOnlyList<DateOnly> MissingDates { get; }
    public IReadOnlyDictionary<string, int> MetricDays { get; }
    public string Label { get; }
    public bool IsPartial => Source != "account" || MissingDates.Count > 0 || Days < (ExpectedDays ?? 1) || MediaReview.MetricKeys.Any(key => MetricDays.GetValueOrDefault(key) < (ExpectedDays ?? 1));
}

public sealed class MediaReviewRow
{
    private readonly JsonObject data;
    internal MediaReviewRow(JsonObject source, string id, string title, string? accountId = null, string? articleId = null,
        IReadOnlyDictionary<string, MediaMetric>? metrics = null, IReadOnlyDictionary<string, MediaMetric>? periodMetrics = null,
        IReadOnlyDictionary<string, MediaMetric>? previousMetrics = null, MediaCoverage? coverage = null, MediaCoverage? previousCoverage = null,
        IReadOnlyDictionary<string, MediaComparison>? comparisons = null)
    {
        data = (JsonObject)source.DeepClone(); data["_local_incomplete"] = true;
        Id = id; Title = title; AccountId = accountId; ArticleId = articleId;
        Kind = MediaReview.OptionalText(source["due_kind"]) ?? MediaReview.OptionalText(source["kind"]);
        Date = source["date"] == null ? null : MediaReview.Date(MediaReview.Text(source["date"]));
        AsOf = source["as_of"] == null ? null : MediaReview.Stamp(source["as_of"]);
        Metrics = metrics ?? MediaReview.Metrics(null); PeriodMetrics = periodMetrics ?? MediaReview.Metrics(null); PreviousMetrics = previousMetrics ?? MediaReview.Metrics(null);
        Coverage = coverage; PreviousCoverage = previousCoverage; Comparisons = comparisons ?? new ReadOnlyDictionary<string, MediaComparison>(new Dictionary<string, MediaComparison>());
    }
    public string Id { get; }
    public string Title { get; }
    public string? AccountId { get; }
    public string? ArticleId { get; }
    public string? Kind { get; }
    public DateOnly? Date { get; }
    public DateTimeOffset? AsOf { get; }
    public IReadOnlyDictionary<string, MediaMetric> Metrics { get; }
    public IReadOnlyDictionary<string, MediaMetric> PeriodMetrics { get; }
    public IReadOnlyDictionary<string, MediaMetric> PreviousMetrics { get; }
    public MediaCoverage? Coverage { get; }
    public MediaCoverage? PreviousCoverage { get; }
    public IReadOnlyDictionary<string, MediaComparison> Comparisons { get; }
    public JsonObject Data => (JsonObject)data.DeepClone();
}

public sealed class MediaTrendDay
{
    internal MediaTrendDay(DateOnly date, MediaReviewRow[] accounts) { Date = date; Accounts = System.Array.AsReadOnly(accounts); }
    public DateOnly Date { get; }
    public IReadOnlyList<MediaReviewRow> Accounts { get; }
}

public sealed class MediaReviewSummary
{
    private readonly JsonObject data;
    internal MediaReviewSummary(JsonObject value) { data = (JsonObject)value.DeepClone(); Metrics = MediaReview.Metrics(value["totals"]); Platform = MediaReview.OptionalText(value["platform"]); }
    public string? Platform { get; }
    public IReadOnlyDictionary<string, MediaMetric> Metrics { get; }
    public JsonObject Data => (JsonObject)data.DeepClone();
}

public sealed class MediaOverview
{
    private readonly JsonObject data;
    internal MediaOverview(JsonObject value, MediaReviewWindow window, MediaReviewRow[] accounts, MediaTrendDay[] trend, MediaTrendDay[] publication,
        MediaReviewRow[] attention, MediaReviewRow[] top, MediaReviewRow[] due, MediaReviewRow[] missing, MediaReviewSummary cumulative, MediaReviewSummary[] platforms)
    {
        data = (JsonObject)value.DeepClone(); Window = window; Accounts = System.Array.AsReadOnly(accounts); Trend = System.Array.AsReadOnly(trend);
        PublicationTrend = System.Array.AsReadOnly(publication); AttentionArticles = System.Array.AsReadOnly(attention); TopArticles = System.Array.AsReadOnly(top);
        DueReviews = System.Array.AsReadOnly(due); MissingArticles = System.Array.AsReadOnly(missing); Cumulative = cumulative; PlatformComparison = System.Array.AsReadOnly(platforms);
    }
    public MediaReviewWindow Window { get; }
    public IReadOnlyList<MediaReviewRow> Accounts { get; }
    public IReadOnlyList<MediaTrendDay> Trend { get; }
    public IReadOnlyList<MediaTrendDay> PublicationTrend { get; }
    public IReadOnlyList<MediaReviewRow> AttentionArticles { get; }
    public IReadOnlyList<MediaReviewRow> TopArticles { get; }
    public IReadOnlyList<MediaReviewRow> DueReviews { get; }
    public IReadOnlyList<MediaReviewRow> MissingArticles { get; }
    public MediaReviewSummary Cumulative { get; }
    public IReadOnlyList<MediaReviewSummary> PlatformComparison { get; }
    public JsonObject Series => (JsonObject)data["series"]!.DeepClone();
    public JsonObject Totals => (JsonObject)data["totals"]!.DeepClone();
    public JsonObject DataStatus => (JsonObject)data["data_status"]!.DeepClone();
    public JsonObject Data => (JsonObject)data.DeepClone();
}

public sealed class MediaReviewView
{
    private readonly JsonObject original;
    internal MediaReviewView(MediaReviewQuery query, JsonObject root, MediaReviewRow[] rows, MediaOverview? overview)
    { Query = query; original = (JsonObject)root.DeepClone(); Rows = System.Array.AsReadOnly(rows); Overview = overview; }
    public MediaReviewQuery Query { get; }
    public JsonObject Original => (JsonObject)original.DeepClone();
    public JsonNode Data => original["data"]!.DeepClone();
    public IReadOnlyList<MediaReviewRow> Rows { get; }
    public MediaOverview? Overview { get; }
}

/// <summary>Validated, detached server reports. No daily increment or business aggregate is synthesized locally.</summary>
public static class MediaReview
{
    public const int MaximumSourceBytes = 1024 * 1024;
    public const int MaximumLocalBytes = 8 * 1024 * 1024;
    public const int MaximumRows = 10000;
    internal static readonly UTF8Encoding Utf8 = new(false, true);
    public static IReadOnlyList<string> MetricKeys { get; } = System.Array.AsReadOnly(new[] { "reads", "impressions", "likes", "comments", "favorites", "shares", "approvals", "reading_users" });
    internal static readonly string[] Platforms = ["toutiao", "zhihu", "wechat", "other"];
    private const long MaxSafe = 9_007_199_254_740_991;
    private static readonly Regex StampPattern = new(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);

    public static void ValidateSource(string path, string envelopeJson, string? expectedScope = null) => _ = Parse(path, envelopeJson, expectedScope);
    public static MediaReviewView Parse(string path, string envelopeJson, string? expectedScope = null)
    {
        var query = MediaReviewQuery.Parse(path);
        try
        {
            if (Utf8.GetByteCount(envelopeJson) > MaximumLocalBytes) throw Invalid("旧复盘本机 JSON 超过 8MiB 预算");
            using var document = JsonDocument.Parse(envelopeJson); CheckJson(document.RootElement);
            var root = Object(JsonNode.Parse(envelopeJson));
            if (root.ContainsKey("_local_scope_id") && (Text(root["_local_scope_id"]).Length == 0 || expectedScope != null && Text(root["_local_scope_id"]) != expectedScope)) throw Invalid("旧复盘缓存属于其他工作区");
            RejectLocal(root, true);
            if (!root.ContainsKey("data") || root["data"] == null || SourceWireBytes(document.RootElement) > MaximumSourceBytes) throw Invalid("旧复盘源数据缺失或超过 1MiB 协议预算");
            if (root["_local_media_review"] is { } metadata)
            {
                var meta = Object(metadata); var scope = Text(meta["scope_id"]);
                if (scope.Length == 0 || expectedScope != null && scope != expectedScope || root["_local_scope_id"] != null && Text(root["_local_scope_id"]) != scope ||
                    MediaReviewQuery.Parse(Text(meta["query_path"])).Path != query.Path || Stamp(meta["observed_at_utc"]).Offset != TimeSpan.Zero) throw Invalid("旧复盘缓存来源标记不一致");
            }
            if (query.Kind == MediaReviewKind.Overview)
            { var overview = ParseOverview(Object(root["data"]), query); return new(query, root, overview.Accounts.ToArray(), overview); }
            var data = Array(root["data"]); if (data.Count > MaximumRows) throw Invalid("旧复盘列表超过读取行数预算");
            var ids = new HashSet<string>(StringComparer.Ordinal); var dimensions = new HashSet<string>(StringComparer.Ordinal); var rows = new List<MediaReviewRow>();
            foreach (var node in data)
            {
                var row = Object(node); RejectLocal(row); var id = Id(Text(row["id"])); MediaReviewRow item;
                if (query.Kind == MediaReviewKind.Due) item = Due(row, query.AccountId);
                else if (query.Kind == MediaReviewKind.Observations)
                {
                    var article = Id(Text(row["article_id"])); if (query.ArticleId != null && article != query.ArticleId) throw Invalid("快照响应与文章筛选不一致");
                    var account = OptionalId(row, "account_id"); MatchAccount(account, query.AccountId, false);
                    var asOf = Stamp(row["as_of"]); var collected = Stamp(row["collected_at"]); if (asOf > collected) throw Invalid("快照截止时间晚于采集时间");
                    _ = Stamp(row["created_at"]); var kind = Text(row["kind"]); if (kind is not ("latest" or "d1" or "d3" or "d7")) throw Invalid("快照类型无效");
                    _ = RequiredText(row["source"]); _ = Text(row["note"]); item = new(row, id, article, account, article, Metrics(row["metrics"], true));
                }
                else
                {
                    var account = Id(Text(row["account_id"])); MatchAccount(account, query.AccountId, true);
                    if (!row.ContainsKey("article_id")) throw Invalid("日指标缺少账号整体与文章明细区分"); var article = OptionalId(row, "article_id");
                    var date = Date(Text(row["date"])); if (date < query.From || date > query.To) throw Invalid("日指标日期不在请求范围");
                    if (!dimensions.Add(account + "\0" + (article ?? "") + "\0" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))) throw Invalid("日指标口径维度重复");
                    _ = RequiredText(row["source"]); _ = Stamp(row["updated_at"]); item = new(row, id, article ?? "账号整体日数据", account, article, Metrics(row["metrics"], true));
                }
                var identity = query.Kind == MediaReviewKind.Due ? id + "\0" + item.Kind : id;
                if (!ids.Add(identity)) throw Invalid("旧复盘响应标识重复"); rows.Add(item);
            }
            return new(query, root, rows.ToArray(), null);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or OverflowException or FormatException)
        { throw Invalid("旧复盘响应未通过结构校验", error); }
    }

    private static MediaOverview ParseOverview(JsonObject data, MediaReviewQuery query)
    {
        RejectLocal(data); var windowData = Object(data["window"]); var from = Date(Text(windowData["from"])); var to = Date(Text(windowData["to"]));
        var previousFrom = Date(Text(windowData["previous_from"])); var previousTo = Date(Text(windowData["previous_to"]));
        var expectedDays = query.Period == "30d" ? 30 : query.Period == "7d" ? 7 : 1;
        var days = Count(windowData["days"], 30); var period = Text(windowData["period"]); var timezone = Text(windowData["timezone"]); var todayIncomplete = Bool(windowData["todayIncomplete"]);
        if (period != query.Period || days != expectedDays || timezone != "Asia/Shanghai" || todayIncomplete ||
            to.DayNumber - from.DayNumber + 1 != days || previousTo.DayNumber != from.DayNumber - 1 || previousTo.DayNumber - previousFrom.DayNumber + 1 != days ||
            to >= TodoHistory.BeijingToday(DateTimeOffset.UtcNow)) throw Invalid("总览完整自然日窗口与请求周期不一致");
        var window = new MediaReviewWindow(from, to, previousFrom, previousTo, days, period, timezone, todayIncomplete);
        var accountNodes = Rows(data["accounts"]); var accounts = new List<MediaReviewRow>(); var accountIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in accountNodes)
        {
            var id = Id(Text(row["id"])); if (!accountIds.Add(id)) throw Invalid("总览账号重复"); MatchAccount(id, query.AccountId, true);
            _ = Platform(row["platform"]); _ = Integer(row["article_count"]); NullableStamp(row, "last_updated");
            accounts.Add(PeriodRow(row, id, RequiredText(row["name"]), id, null, window));
        }
        if (query.AccountId != null && accounts.Count != 1) throw Invalid("总览未返回所请求的精确账号");
        var trend = Trend(data["trend"], window, accountIds, false); var publication = Trend(data["publication_trend"], window, accountIds, true);
        _ = RequiredText(data["publication_note"]);
        var attention = ArticleRows(data["attention_articles"], accountIds, query, window, true);
        var top = ArticleRows(data["top_articles"], accountIds, query, window, false);
        var missing = ArticleRows(data["missing_articles"], accountIds, query, window, false);
        var topMeta = Object(data["top"]);
        if (!topMeta.ContainsKey("platform") || Integer(topMeta["limit"]) != query.TopN || OptionalText(topMeta["platform"]) != query.TopPlatform || top.Length > query.TopN ||
            query.TopPlatform != null && top.Any(row => Text(row.Data["platform"]) != query.TopPlatform)) throw Invalid("Top 榜单响应与榜单参数不一致");
        var dueIds = new HashSet<string>(StringComparer.Ordinal); var due = Rows(data["due_reviews"]).Select(row =>
        { var item = Due(row, query.AccountId); if (!accountIds.Contains(item.AccountId!) || !dueIds.Add(item.Id + "\0" + item.Kind)) throw Invalid("总览待复盘账号或事件重复"); return item; }).ToArray();
        var cumulative = Summary(Object(data["cumulative"]), accountIds); _ = RequiredText(cumulative.Data["metric_note"]);
        var platformIds = new HashSet<string>(StringComparer.Ordinal); var platforms = Rows(data["platform_comparison"]).Select(row =>
        { var platform = Platform(row["platform"]); if (!platformIds.Add(platform)) throw Invalid("平台汇总重复"); return Summary(row, accountIds, platform); }).ToArray();
        var series = Object(data["series"]); _ = RequiredText(series["name"]); var planned = Count(series["planned"], 1000000); _ = Integer(series["recorded_count"]);
        if (!series.ContainsKey("highest_recorded") || series["highest_recorded"] != null && (Integer(series["highest_recorded"]) < 1 || Integer(series["highest_recorded"]) > planned)) throw Invalid("系列最高编号越界或缺少状态");
        var numbers = new HashSet<long>(); foreach (var node in Array(series["numbers"])) { var n = Integer(node); if (n < 1 || n > planned || !numbers.Add(n)) throw Invalid("系列编号无效或重复"); }
        var totals = Object(data["totals"]); foreach (var key in new[] { "article_count", "automatic_count", "unknown_mode_count" }) _ = Integer(totals[key]); _ = NullableNumber(totals, "median_duration_seconds");
        var status = Object(data["data_status"]); NullableStamp(status, "last_updated"); var statusIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var key in new[] { "complete_accounts", "missing_accounts" }) foreach (var node in Array(status[key]))
        { var id = Id(Text(node)); if (!accountIds.Contains(id) || !statusIds.Add(id)) throw Invalid("覆盖状态账号不在总览中或重复"); }
        if (!statusIds.SetEquals(accountIds)) throw Invalid("覆盖状态未说明全部已返回账号");
        return new(data, window, accounts.ToArray(), trend, publication, attention, top, due, missing, cumulative, platforms);
    }

    private static MediaReviewRow PeriodRow(JsonObject row, string id, string title, string? account, string? article, MediaReviewWindow window)
    {
        RejectLocal(row); var current = Metrics(row["period_metrics"], true); var previous = Metrics(row["previous_metrics"], true);
        var coverage = Coverage(row["coverage"], window.From, window.To, true); var previousCoverage = Coverage(row["previous_coverage"], window.PreviousFrom, window.PreviousTo, true);
        var comparisons = Object(row["comparisons"]); var values = new Dictionary<string, MediaComparison>(StringComparer.Ordinal);
        foreach (var key in MetricKeys)
        {
            var value = Object(comparisons[key]); var a = NullableInteger(value, "current"); var b = NullableInteger(value, "previous");
            var delta = NullableInteger(value, "delta", true); var percent = NullableNumber(value, "percent", true); var comparable = Bool(value["comparable"]); var reason = RequiredText(value["reason"]);
            if (comparable && (a == null || b == null || delta == null || b != 0 && percent == null || b == 0 && percent != null) || !comparable && (delta != null || percent != null)) throw Invalid("比较值的空值与可比状态不一致");
            values[key] = new(a, b, delta, percent, comparable, reason);
        }
        return new(row, id, title, account, article, Metrics(row["latest_metrics"]), current, previous, coverage, previousCoverage, new ReadOnlyDictionary<string, MediaComparison>(values));
    }
    private static MediaReviewRow[] ArticleRows(JsonNode? node, HashSet<string> accounts, MediaReviewQuery query, MediaReviewWindow window, bool attention)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal); var result = new List<MediaReviewRow>();
        foreach (var row in Rows(node))
        {
            RejectLocal(row); var id = Id(Text(row["id"])); var account = Id(Text(row["account_id"]));
            if (!ids.Add(id) || !accounts.Contains(account)) throw Invalid("文章摘要身份重复或不属于所请求账号"); MatchAccount(account, query.AccountId, true);
            _ = Platform(row["platform"]); _ = RequiredText(row["account_name"]); var title = RequiredText(row["title"]);
            if (!row.ContainsKey("published_at")) throw Invalid("文章摘要缺少发布日期状态"); if (row["published_at"] != null) _ = Stamp(row["published_at"]);
            var metrics = Metrics(row["latest_metrics"]);
            if (attention)
            {
                var finding = Object(row["attention"]); if (Text(finding["kind"]) is not ("up" or "down" or "normal" or "insufficient")) throw Invalid("关注状态无效");
                _ = RequiredText(finding["reason"]); _ = RequiredText(finding["baseline"]); _ = Integer(finding["sample_size"]); _ = Integer(finding["minimum_samples"]);
                if (finding["metric"] != null && !MetricKeys.Contains(Text(finding["metric"]), StringComparer.Ordinal)) throw Invalid("关注指标无效");
                _ = NullableNumber(finding, "median"); _ = NullableInteger(finding, "current"); _ = NullableNumber(finding, "ratio", maximum: MaxSafe * 2d);
                result.Add(PeriodRow(row, id, title, account, id, window));
            }
            else result.Add(new(row, id, title, account, id, metrics));
        }
        return result.ToArray();
    }
    private static MediaTrendDay[] Trend(JsonNode? node, MediaReviewWindow window, HashSet<string> accounts, bool publication)
    {
        var dates = new HashSet<DateOnly>(); var result = new List<MediaTrendDay>();
        foreach (var day in Rows(node))
        {
            var date = Date(Text(day["date"])); if (date < window.From || date > window.To || !dates.Add(date)) throw Invalid("趋势日期越界或重复");
            var ids = new HashSet<string>(StringComparer.Ordinal); var rows = new List<MediaReviewRow>();
            foreach (var row in Rows(day["accounts"]))
            {
                var id = Id(Text(row["account_id"])); if (!accounts.Contains(id) || !ids.Add(id)) throw Invalid("趋势账号越界或重复");
                if (publication) { _ = Integer(row["count"]); rows.Add(new(row, id, id, id)); }
                else rows.Add(new(row, id, id, id, metrics: Metrics(row["metrics"], true), coverage: Coverage(row["coverage"], date, date, false)));
            }
            if (!ids.SetEquals(accounts)) throw Invalid("趋势未说明全部返回账号"); result.Add(new(date, rows.ToArray()));
        }
        if (dates.Count != window.Days) throw Invalid("趋势缺少请求周期日期"); return result.OrderBy(day => day.Date).ToArray();
    }
    private static MediaCoverage Coverage(JsonNode? node, DateOnly from, DateOnly to, bool aggregate)
    {
        var value = Object(node); var source = Text(value["source"]); if (source is not ("account" or "articles" or "mixed" or "missing")) throw Invalid("数据覆盖来源无效");
        var maximum = to.DayNumber - from.DayNumber + 1; var expected = aggregate ? Count(value["expected_days"], maximum) : (int?)null;
        var days = Count(value["days"], expected ?? 1); var missing = new HashSet<DateOnly>();
        foreach (var day in Array(value["missing_dates"])) { var date = Date(Text(day)); if (date < from || date > to || !missing.Add(date)) throw Invalid("覆盖缺失日期越界或重复"); }
        if (days + missing.Count != (expected ?? 1)) throw Invalid("覆盖日期数无法核对");
        var metricDays = new Dictionary<string, int>(StringComparer.Ordinal); foreach (var (key, item) in Object(value["metric_days"]))
        { if (!MetricKeys.Contains(key, StringComparer.Ordinal)) continue; metricDays[key] = Count(item, expected ?? 1); }
        if (value["missing_metrics"] != null) foreach (var item in Array(value["missing_metrics"])) if (!MetricKeys.Contains(Text(item), StringComparer.Ordinal)) throw Invalid("缺失指标名称无效");
        if (value["article_count"] != null) _ = Integer(value["article_count"]);
        return new(source, days, expected, missing.Order().ToArray(), metricDays, RequiredText(value["label"]));
    }
    private static MediaReviewSummary Summary(JsonObject value, HashSet<string> accounts, string? platform = null)
    {
        foreach (var key in new[] { "article_count", "snapshot_count", "data_article_count", "no_snapshot_count", "missing_reads_count", "unverified_date_count" }) _ = Integer(value[key]);
        var metrics = Metrics(value["totals"], true); foreach (var key in MetricKeys) if (!metrics[key].Present) throw Invalid("累计汇总缺少指标状态");
        var metricCoverage = Object(value["metric_coverage"]); foreach (var key in MetricKeys) { var row = Object(metricCoverage[key]); _ = Integer(row["recorded"]); _ = Integer(row["missing"]); }
        foreach (var key in new[] { "coverage", "mean_reads", "median_reads" }) { var number = NullableNumber(value, key); if (key == "coverage" && number > 1) throw Invalid("累计覆盖比例越界"); }
        foreach (var key in new[] { "as_of", "earliest_as_of", "collected_at" }) NullableStamp(value, key);
        if (!value.ContainsKey("best_article")) throw Invalid("累计汇总缺少最佳文章状态");
        if (value["best_article"] is { } article)
        {
            var row = Object(article); RejectLocal(row); _ = Id(Text(row["id"])); _ = RequiredText(row["title"]); _ = Metrics(row["latest_metrics"], true);
            if (!accounts.Contains(Id(Text(row["account_id"]))) || platform != null && Platform(row["platform"]) != platform) throw Invalid("汇总最佳文章不属于请求账号或平台");
        }
        return new(value);
    }
    private static MediaReviewRow Due(JsonObject row, string? accountFilter)
    {
        RejectLocal(row); var id = Id(Text(row["id"])); var account = Id(Text(row["account_id"])); MatchAccount(account, accountFilter, true);
        var kind = Text(row["due_kind"]); if (kind is not ("d1" or "d3" or "d7")) throw Invalid("待复盘节点无效");
        _ = Stamp(row["due_at"]); _ = RequiredText(row["account_name"]); return new(row, id, RequiredText(row["title"]), account, id);
    }
    internal static IReadOnlyDictionary<string, MediaMetric> Metrics(JsonNode? node, bool required = false)
    {
        if (node == null && required) throw Invalid("指标对象缺失"); var value = node == null ? null : Object(node);
        if (value != null && value.Any(pair => !MetricKeys.Contains(pair.Key, StringComparer.Ordinal))) throw Invalid("指标对象包含未支持的指标名称");
        var result = new Dictionary<string, MediaMetric>(StringComparer.Ordinal);
        foreach (var key in MetricKeys) result[key] = value?.ContainsKey(key) == true ? new(true, value[key] == null ? null : Integer(value[key])) : new(false, null);
        return new ReadOnlyDictionary<string, MediaMetric>(result);
    }
    private static void MatchAccount(string? actual, string? expected, bool required)
    { if (required && actual == null || expected != null && actual != null && actual != expected) throw Invalid("复盘响应与账号筛选不一致"); }
    private static string? OptionalId(JsonObject row, string field) => row[field] == null ? null : Id(Text(row[field]));
    internal static string Id(string value)
    { if (value.Length is < 1 or > 200 || value.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))) throw Invalid("复盘标识无效"); return value; }
    internal static DateOnly Date(string value) => value.Length == 10 && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : throw Invalid("复盘日期须为真实 YYYY-MM-DD");
    internal static DateTimeOffset Stamp(JsonNode? node)
    { var value = Text(node); return StampPattern.IsMatch(value) && DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var stamp) ? stamp : throw Invalid("复盘时间无效"); }
    private static void NullableStamp(JsonObject row, string key) { if (!row.ContainsKey(key)) throw Invalid("复盘缺少时间状态"); if (row[key] != null) _ = Stamp(row[key]); }
    private static long Integer(JsonNode? node, bool signed = false) => node is JsonValue value && value.TryGetValue<long>(out var n) && n >= (signed ? -MaxSafe : 0) && n <= MaxSafe ? n : throw Invalid("复盘整数无效或越界");
    private static int Count(JsonNode? node, int maximum) { var n = Integer(node); return n <= maximum ? (int)n : throw Invalid("复盘计数越界"); }
    private static long? NullableInteger(JsonObject row, string field, bool signed = false)
    { if (!row.ContainsKey(field)) throw Invalid("复盘缺少数值状态"); return row[field] == null ? null : Integer(row[field], signed); }
    private static double? NullableNumber(JsonObject row, string field, bool signed = false, double maximum = MaxSafe)
    {
        if (!row.ContainsKey(field)) throw Invalid("复盘缺少数值状态"); if (row[field] == null) return null;
        if (row[field] is not JsonValue scalar || !scalar.TryGetValue<double>(out var n) || !double.IsFinite(n) || n < (signed ? -MaxSafe * 100d : 0) || n > (signed ? MaxSafe * 100d : maximum)) throw Invalid("复盘数值不是有效有限值"); return n;
    }
    internal static string Text(JsonNode? node) => node is JsonValue value && value.TryGetValue<string>(out var text) ? text : throw Invalid("复盘文字字段缺失");
    internal static string? OptionalText(JsonNode? node) => node == null ? null : Text(node);
    private static string RequiredText(JsonNode? node) => Text(node) is var value && !string.IsNullOrWhiteSpace(value) ? value : throw Invalid("复盘文字不能为空");
    private static string Platform(JsonNode? node) => Text(node) is var value && Platforms.Contains(value, StringComparer.Ordinal) ? value : throw Invalid("复盘平台无效");
    private static bool Bool(JsonNode? node) => node is JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : throw Invalid("复盘布尔值无效");
    private static JsonObject Object(JsonNode? node) => node as JsonObject ?? throw Invalid("复盘对象缺失");
    private static JsonArray Array(JsonNode? node) => node as JsonArray ?? throw Invalid("复盘数组缺失");
    private static JsonObject[] Rows(JsonNode? node)
    { var rows = Array(node); if (rows.Count > MaximumRows) throw Invalid("复盘行数超过预算"); return rows.Select(Object).ToArray(); }
    private static void RejectLocal(JsonObject node, bool root = false)
    { if (node.Any(pair => pair.Key.StartsWith("_local_", StringComparison.Ordinal) && !(root && pair.Key is "_local_scope_id" or "_local_media_review") || pair.Key == "_operation_id")) throw Invalid("本机投影不能充当只读服务器报表"); }
    private static void CheckJson(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        { var names = new HashSet<string>(StringComparer.Ordinal); foreach (var property in value.EnumerateObject()) { _ = Utf8.GetByteCount(property.Name); if (!names.Add(property.Name)) throw Invalid("JSON 字段重复"); CheckJson(property.Value); } }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckJson(item);
        else if (value.ValueKind == JsonValueKind.String) _ = Utf8.GetByteCount(value.GetString()!);
    }
    private static long WireBytes(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Object => 2 + value.EnumerateObject().Select(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)).Sum() + Math.Max(0, value.EnumerateObject().Count() - 1),
        JsonValueKind.Array => 2 + value.EnumerateArray().Select(WireBytes).Sum() + Math.Max(0, value.GetArrayLength() - 1),
        JsonValueKind.String => QuotedBytes(value.GetString()!), JsonValueKind.True => 4, JsonValueKind.False => 5, JsonValueKind.Null => 4, _ => Utf8.GetByteCount(value.GetRawText())
    };
    private static long SourceWireBytes(JsonElement root)
    {
        var properties = root.EnumerateObject().Where(property => property.Name is not ("_local_scope_id" or "_local_media_review")).ToArray();
        return 2 + properties.Sum(property => QuotedBytes(property.Name) + 1 + WireBytes(property.Value)) + Math.Max(0, properties.Length - 1);
    }
    private static long QuotedBytes(string text)
    { long result = Utf8.GetByteCount(text) + 2; foreach (var c in text) if (c is '"' or '\\') result++; else if (c < 32) result += c is '\b' or '\f' or '\n' or '\r' or '\t' ? 1 : 5; return result; }
    private static InvalidDataException Invalid(string message, Exception? inner = null) => new(message + "；原始缓存、草稿及同步队列未改变。", inner);
}
