using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Haoduoyu.Core;

public sealed record LedgerColumn([property: JsonRequired] string Key, [property: JsonRequired] double Width);
public sealed record LedgerColumnDefinition(string Key, string Label, double DefaultWidth);
public sealed record LedgerLayout
{
    [JsonRequired] public string GroupBy { get; init; } = "none";
    [JsonRequired] public IReadOnlyList<LedgerColumn> Columns { get; init; } = ArticleLedgerViews.DefaultColumns();
}
public sealed record SavedLedgerView
{
    [JsonRequired] public string Id { get; init; } = "";
    [JsonRequired] public string Name { get; init; } = "";
    [JsonRequired] public IReadOnlyDictionary<string, string> Query { get; init; } = new ReadOnlyDictionary<string, string>(new Dictionary<string, string>());
    [JsonRequired] public LedgerLayout Layout { get; init; } = new();
}
public sealed record LedgerViewPreferences
{
    [JsonRequired] public LedgerLayout Layout { get; init; } = new();
    [JsonRequired] public IReadOnlyList<SavedLedgerView> Views { get; init; } = Array.AsReadOnly(Array.Empty<SavedLedgerView>());
}

// Presentation settings only. This model has no cache, outbox, credentials, file or HTTP dependency.
public static class ArticleLedgerViews
{
    public const int MaximumViews = 20;
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly string[] QueryKeys = ["account_id", "platform", "status", "q", "from", "to", "mode", "topic", "data_status", "slot", "writer",
        "has_warnings", "has_pending_verify", "series_no_min", "series_no_max", "sort", "order", "page_size"];
    public static IReadOnlyList<LedgerColumnDefinition> ColumnCatalog { get; } = Array.AsReadOnly(new[]
    {
        new LedgerColumnDefinition("title", "文章标题", 300), new("account", "运营账号", 190), new("status", "状态", 110),
        new("platform", "平台", 110), new("slot", "槽位", 100), new("writer", "写作者", 110), new("run_date", "存稿日期", 130),
        new("series_no", "系列编号", 100), new("published_at", "发布时间（原记录）", 220), new("reads", "阅读", 100),
        new("likes", "点赞", 100), new("comments", "评论", 100), new("approvals", "赞同", 100),
        new("latest_as_of", "指标截止（原记录）", 220), new("duration", "生产耗时（秒）", 140),
        new("verification", "待核状态", 140), new("warnings", "警告", 220), new("local_state", "本机状态", 140)
    });

    public static IReadOnlyList<LedgerColumn> DefaultColumns() => Array.AsReadOnly(new[]
    {
        new LedgerColumn("title", 300), new("account", 190), new("status", 110), new("slot", 100),
        new("reads", 100), new("likes", 100), new("comments", 100), new("verification", 140), new("local_state", 140)
    });
    public static LedgerLayout DefaultLayout() => new();

    public static IReadOnlyDictionary<string, string> NormalizeQuery(IReadOnlyDictionary<string, string> input)
    {
        ArgumentNullException.ThrowIfNull(input);
        if (input.Any(pair => !QueryKeys.Contains(pair.Key, StringComparer.Ordinal)))
            throw Invalid("视图只能保存已核实的筛选与排序，不能保存地址、页码、来源模式或业务资料。");
        var values = input.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        values.TryAdd("status", "published"); values.TryAdd("sort", "published_at"); values.TryAdd("order", "desc"); values.TryAdd("page_size", "50");
        var parsed = ArticleLedgerQuery.Parse(values);
        // The same bounded transport URI remains the final authority when the view is explicitly applied.
        if (Encoding.UTF8.GetByteCount(parsed.ToPath()) > 8192) throw Invalid("保存视图的筛选地址超过既有预算。");
        var canonical = parsed.Values.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        canonical.TryAdd("sort", "published_at"); canonical.TryAdd("order", "desc"); canonical.TryAdd("page_size", "50");
        return new ReadOnlyDictionary<string, string>(canonical);
    }

    public static LedgerViewPreferences CloneAndValidate(LedgerViewPreferences preferences)
    {
        ArgumentNullException.ThrowIfNull(preferences);
        if (preferences.Views is null || preferences.Views.Count > MaximumViews) throw Invalid("命名视图最多20项，原配置保留。");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase); var ids = new HashSet<string>(StringComparer.Ordinal);
        var views = new List<SavedLedgerView>();
        foreach (var view in preferences.Views)
        {
            if (view is null || !Guid.TryParseExact(view.Id, "D", out var id) || id == Guid.Empty || view.Id != id.ToString("D") || !ids.Add(view.Id))
                throw Invalid("保存视图的身份无效或重复，原配置保留。");
            var name = NormalizeName(view.Name);
            if (name != view.Name || !names.Add(name)) throw Invalid("保存视图名称不是规范形式或已重复。");
            views.Add(view with { Query = NormalizeQuery(view.Query), Layout = CloneLayout(view.Layout) });
        }
        return new() { Layout = CloneLayout(preferences.Layout), Views = views.AsReadOnly() };
    }

    public static LedgerViewPreferences WithLayout(LedgerViewPreferences preferences, LedgerLayout layout)
    {
        var current = CloneAndValidate(preferences);
        return current with { Layout = CloneLayout(layout) };
    }
    public static LedgerViewPreferences SaveView(LedgerViewPreferences preferences, string name, IReadOnlyDictionary<string, string> query,
        LedgerLayout layout, string? viewId = null)
    {
        var current = CloneAndValidate(preferences); var normalized = NormalizeName(name);
        if (viewId is not null && !current.Views.Any(view => view.Id == viewId)) throw Invalid("所选视图不属于当前配置，不能覆盖。");
        if (current.Views.Any(view => view.Id != viewId && string.Equals(view.Name, normalized, StringComparison.OrdinalIgnoreCase)))
            throw Invalid("已有同名视图；请明确选择更新该视图，不能静默覆盖。");
        if (viewId is null && current.Views.Count >= MaximumViews) throw Invalid("命名视图最多20项，请先明确删除不再需要的视图。");
        var next = new SavedLedgerView { Id = viewId ?? Guid.NewGuid().ToString("D"), Name = normalized, Query = NormalizeQuery(query), Layout = CloneLayout(layout) };
        var views = current.Views.ToList(); var index = views.FindIndex(view => view.Id == viewId);
        if (index < 0) views.Add(next); else views[index] = next;
        return CloneAndValidate(current with { Views = views.AsReadOnly() });
    }
    public static LedgerViewPreferences DeleteView(LedgerViewPreferences preferences, string viewId)
    {
        var current = CloneAndValidate(preferences);
        if (!current.Views.Any(view => view.Id == viewId)) throw Invalid("所选视图不属于当前配置，不能删除。");
        return current with { Views = current.Views.Where(view => view.Id != viewId).ToList().AsReadOnly() };
    }

    public static LedgerLayout CloneLayout(LedgerLayout layout)
    {
        if (layout is null || layout.GroupBy is not ("none" or "account") || layout.Columns is null || layout.Columns.Count is < 1 or > 18)
            throw Invalid("台账列或本页分组选项无效，原配置保留。");
        var keys = new HashSet<string>(StringComparer.Ordinal); var columns = new List<LedgerColumn>();
        foreach (var column in layout.Columns)
        {
            if (column is null || !ColumnCatalog.Any(known => known.Key == column.Key) || !keys.Add(column.Key) ||
                !double.IsFinite(column.Width) || column.Width is < 64 or > 1200)
                throw Invalid("台账列重复、未知或宽度超出64–1200范围，原配置保留。");
            columns.Add(column with { });
        }
        if (!keys.Contains("title")) throw Invalid("文章标题列必须保留，便于核对和打开原记录。");
        return layout with { Columns = columns.AsReadOnly() };
    }

    public static string NormalizeName(string name)
    {
        if (name is null) throw Invalid("请填写视图名称。");
        try { _ = StrictUtf8.GetByteCount(name); }
        catch (EncoderFallbackException) { throw Invalid("视图名称含无效Unicode，原配置保留。"); }
        if (name.Any(char.IsControl)) throw Invalid("视图名称不能包含控制字符。");
        var value = name.Trim().Normalize(NormalizationForm.FormC);
        if (value.Length == 0 || value.EnumerateRunes().Count() > 60 || StrictUtf8.GetByteCount(value) > 240)
            throw Invalid("视图名称须为1–60个字符，UTF-8最多240字节。");
        return value;
    }

    public static string AccountGroupKey(JsonObject row)
    {
        ArgumentNullException.ThrowIfNull(row);
        return row["account_id"] is JsonValue scalar && scalar.TryGetValue<string>(out var id) && id.Length > 0 ? "account:" + id : "unknown:";
    }
    public static IReadOnlyDictionary<string, string> Cells(JsonObject row)
    {
        ArgumentNullException.ThrowIfNull(row);
        var cells = new Dictionary<string, string>(StringComparer.Ordinal);
        string Value(string key) => Text(row, key) is { Length: > 0 } value ? value : "未取得";
        foreach (var key in new[] { "title", "status", "platform", "slot", "writer", "run_date", "series_no", "published_at", "latest_as_of" }) cells[key] = Value(key);
        cells["status"] = cells["status"] switch { "published" => "已发布", "drafting" => "起草中", "illustrated" => "已配图", "draft_saved" => "草稿已存", "failed" => "受阻", var value => value };
        cells["platform"] = cells["platform"] switch { "toutiao" => "今日头条", "zhihu" => "知乎", "wechat" => "微信公众号", "other" => "其他平台", var value => value };
        cells["slot"] = cells["slot"] switch { "zh1" => "知乎 1", "zh2" => "知乎 2", "zh3" => "知乎 3", "tt1" => "头条 1", "tt2" => "头条 2", "tt3" => "头条 3", "gzh" => "公众号", var value => value };
        cells["writer"] = cells["writer"] switch { "dedao" => "得到大脑", "gemini_web" => "Gemini", "human" => "本人", "other" => "其他", var value => value };
        var id = Text(row, "account_id"); var name = Text(row, "account_name");
        cells["account"] = id.Length == 0 ? "账号未取得" : name.Length == 0 ? id : name + " · " + id;
        foreach (var metric in new[] { "reads", "likes", "comments", "approvals" })
            cells[metric] = Number(row["latest_metrics"] is JsonObject metrics ? metrics[metric] : null);
        cells["duration"] = Number(row["duration_seconds"]);
        cells["verification"] = row["has_pending_verify"] is JsonValue flag && flag.TryGetValue<bool>(out var pending)
            ? pending ? "有明确待处理项" : "明确已核" : "未知";
        cells["warnings"] = row["warnings"] is JsonArray warnings ? warnings.Count == 0 ? "无已记录警告" :
            string.Join("；", warnings.Select(item => item is JsonValue scalar && scalar.TryGetValue<string>(out var value) ? value : "未知警告")) : "未取得";
        cells["local_state"] = Text(row, "_local_status") switch
        {
            "Queued" => "待同步", "InFlight" => "发送中", "Unknown" => "结果待核对", "Conflict" => "版本冲突", "Blocked" => "同步受阻",
            "Confirmed" => "已收到回执", "Superseded" => "已替代", "" => "未标本机状态", var value => value
        };
        return new ReadOnlyDictionary<string, string>(cells);
        static string Number(JsonNode? value)
        {
            if (value is not JsonValue scalar) return "未取得";
            try
            {
                if (scalar.GetValueKind() != System.Text.Json.JsonValueKind.Number) return "未取得";
                var text = scalar.ToJsonString();
                using var document = System.Text.Json.JsonDocument.Parse(text);
                return document.RootElement.TryGetDouble(out var number) && double.IsFinite(number) ? text : "未取得";
            }
            catch (Exception error) when (error is System.Text.Json.JsonException or ArgumentException or InvalidOperationException)
            { return "未取得"; }
        }
    }
    private static string Text(JsonObject row, string key) => row[key] is JsonValue scalar && scalar.TryGetValue<string>(out var text) ? text :
        row[key] is JsonValue number && number.GetValueKind() == System.Text.Json.JsonValueKind.Number ? number.ToJsonString() : "";
    private static InvalidDataException Invalid(string message) => new(message);
}
