using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string? articleLedgerIdentity;
    private Dictionary<string, string> articleLedgerFilters = NewArticleLedgerFilters();
    private int articleLedgerPageSize = 50;
    private bool? articleLedgerServerMode;

    private static Dictionary<string, string> NewArticleLedgerFilters() => new(StringComparer.Ordinal)
    { ["sort"] = "published_at", ["order"] = "desc" };
    private void ResetArticleLedgerView()
    {
        articleLedgerIdentity = null; articleLedgerFilters = NewArticleLedgerFilters();
        articleLedgerPageSize = 50; articleLedgerServerMode = null; articlePage = 1; articleStatus = "published";
        ResetArticleLedgerPreferences();
    }
    private ArticleLedgerQuery ArticleLedgerSelection(IReadOnlyDictionary<string, string>? fields = null, int? pageNumber = null, string? pageSize = null)
    {
        var values = (fields ?? articleLedgerFilters).Where(pair => pair.Value.Length > 0).ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
        values["status"] = articleStatus; values["page"] = (pageNumber ?? articlePage).ToString(CultureInfo.InvariantCulture);
        values["page_size"] = pageSize ?? articleLedgerPageSize.ToString(CultureInfo.InvariantCulture);
        return ArticleLedgerQuery.Parse(values);
    }

    private async Task ArticlesAsync(WrapPanel bar)
    {
        await FlushEditorAsync();
        if (articleLedgerIdentity != currentIdentity)
        {
            if (articleLedgerIdentity is not null) ResetArticleLedgerView();
            articleLedgerIdentity = currentIdentity;
        }
        var identity = currentIdentity; var scope = Engine.Snapshot.ScopeId;
        await LoadArticleLedgerPreferencesAsync(identity, scope);
        var query = ArticleLedgerSelection(); var path = query.ToPath();
        var serverMode = articleLedgerServerMode ?? connected;
        JsonObject? envelope; string? readError = null; var fresh = false;
        if (serverMode && connected)
        {
            var result = await ReadArticleLedgerServerPageAsync(path, identity, scope);
            envelope = result.Envelope; readError = result.Error; fresh = result.Fresh;
            if (!connected)
            {
                serverMode = false; articleLedgerServerMode = false;
                envelope = await ReadArticleLedgerLocalPageAsync(path);
            }
        }
        else
        {
            serverMode = false;
            envelope = await ReadArticleLedgerLocalPageAsync(path);
        }
        EnsureArticleLedgerOwner(identity, scope);
        var state = Engine.Snapshot;
        bar.Children.Add(Button("查看发布对账", ArticleReconciliationAsync));
        foreach (var (value, label) in new[] { ("published", "已发布"), ("drafting", "起草中"), ("illustrated", "已配图"), ("draft_saved", "草稿已存"), ("failed", "受阻") })
        {
            var status = value;
            bar.Children.Add(Button((articleStatus == value ? "● " : "") + label, async () =>
            { EnsureArticleLedgerOwner(identity, scope); articleStatus = status; articlePage = 1; await NavigateAsync("文章台账"); }));
        }
        bar.Children.Add(Button("＋ 新文章记录", () => NewEditorAsync("article", NewRecord(("title", ""), ("status", "drafting"), ("production_mode", "unknown")), "/api/v1/articles/new:")));
        var sources = new WrapPanel(); page.Children.Add(sources);
        sources.Children.Add(Button("读取服务端筛选结果", async () =>
        {
            EnsureArticleLedgerOwner(identity, scope);
            if (!connected) throw new InvalidOperationException("请先连接或登录原工作区，再读取服务端筛选页。本机资料与草稿保留。");
            articleLedgerServerMode = true; articlePage = 1; await NavigateAsync("文章台账");
        }));
        sources.Children.Add(Button("查看本机筛选结果", async () =>
        { EnsureArticleLedgerOwner(identity, scope); articleLedgerServerMode = false; articlePage = 1; await NavigateAsync("文章台账"); }));
        var pending = state.Outbox.Count(operation => operation.Path.StartsWith("/api/v1/articles", StringComparison.Ordinal) &&
            operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        page.Children.Add(Label(serverMode
            ? $"本机文章未决 {pending} 项（全台账）；本机排队、草稿及未知结果未并入服务端筛选页的统计。打开记录后仍需核对原保存，不会解除围栏。"
            : $"本机文章未决 {pending} 项（全台账）。本机视图可能包含未同步意图，不代表服务器已确认；未下载资料不作为缺失或零指标。"));
        RenderArticleLedgerFilters(state, identity, scope);
        var tableHost = new StackPanel();
        JsonObject[] presentationRows = [];
        RenderArticleLedgerViewControls(identity, scope, () => RenderArticleLedgerTable(tableHost, presentationRows, identity, scope));
        if (readError is { Length: > 0 }) page.Children.Add(Label(readError));
        if (envelope is null)
        {
            page.Children.Add(LedgerNotice(serverMode ? "服务端读取未完成，尚无此条件的已核实缓存页。" : "本机尚无此条件的可用资料；未读取不等于零条。", "article-ledger-coverage"));
            page.Children.Add(Label("可正常连接读取服务端筛选页，或准备完整离线资料。本机草稿、原请求和已有缓存保留。")); return;
        }
        var rows = envelope["data"] as JsonArray ?? throw new InvalidDataException("文章筛选结果结构不完整，原缓存保留。");
        var meta = envelope["meta"] as JsonObject ?? throw new InvalidDataException("文章筛选结果缺少分页信息，原缓存保留。");
        var more = meta["has_more"] is JsonValue moreValue && moreValue.TryGetValue<bool>(out var hasMore) && hasMore;
        if (serverMode)
        {
            page.Children.Add(LedgerNotice(fresh ? "服务端筛选结果 · 本次已读取；保留服务端分页与总量，不与本机未决意图合并。" :
                "上次服务端筛选页 · 本次读取未完成；以下为此条件的原缓存，不代表服务器实时状态。", "article-ledger-coverage"));
            page.Children.Add(LedgerNotice($"服务端筛选共 {Text(meta, "total")} 条 · 当前状态服务端总量 {Text(meta, "unfiltered_total")} 条 · 第 {articlePage} 页 · 每页最多 {articleLedgerPageSize} 条", "article-ledger-page-summary"));
            page.Children.Add(Label("当前状态总量按工作区授权范围统计，未套用账号、搜索或其他筛选；筛选数量使用服务端返回值。"));
        }
        else
        {
            var local = envelope["_local_ledger"] as JsonObject;
            var complete = local is not null && Flag(local, "complete") && !Flag(envelope, "_local_incomplete");
            var known = local is null ? rows.Count.ToString(CultureInfo.InvariantCulture) : Text(local, "known_total");
            var knownUnfiltered = local is null ? "未核实" : Text(local, "known_unfiltered_total");
            page.Children.Add(LedgerNotice(complete ? "本机完整范围 · 基于已保存资料与本机意图，不代表服务器实时状态。" :
                "本机局部范围 · 仅展示当前已知匹配，未读资料或缺失字段不能当作不存在。", "article-ledger-coverage"));
            page.Children.Add(LedgerNotice($"本机当前筛选已知 {known} 条 · 当前状态已知 {knownUnfiltered} 条 · 第 {articlePage} 页 · 每页最多 {articleLedgerPageSize} 条", "article-ledger-page-summary"));
            if (!complete) page.Children.Add(Label("这些数量不是服务端总量；本机下一页仅浏览已知记录，不能据此断言没有其他匹配。"));
            if (local is not null && long.TryParse(Text(local, "unknown_count"), out var unknown) && unknown > 0)
                page.Children.Add(Label($"有 {unknown} 条记录的筛选或排序资料尚未完整核实；未将缺失指标当作真实零。可连接读取或准备完整离线资料。"));
        }
        page.Children.Add(Label("待核“明确已核”只匹配明确 false；未知状态不算已核。需要查看未确认记录，可进入发布对账。"));
        var paging = new WrapPanel(); page.Children.Add(paging);
        var previous = Button("上一页", async () =>
        { EnsureArticleLedgerOwner(identity, scope); articlePage = Math.Max(1, articlePage - 1); await NavigateAsync("文章台账"); });
        previous.IsEnabled = articlePage > 1; paging.Children.Add(previous);
        var next = Button("下一页", async () =>
        { EnsureArticleLedgerOwner(identity, scope); articlePage = checked(articlePage + 1); await NavigateAsync("文章台账"); });
        next.IsEnabled = more && articlePage < int.MaxValue; paging.Children.Add(next);
        presentationRows = rows.OfType<JsonObject>().Select(row => (JsonObject)row.DeepClone()).ToArray();
        page.Children.Add(tableHost);
        RenderArticleLedgerTable(tableHost, presentationRows, identity, scope);
    }

    private void RenderArticleLedgerFilters(WorkspaceState state, string? identity, string scope)
    {
        var panel = new WrapPanel();
        var expander = new Expander { Header = "筛选与排序（应用后生效）", Content = panel, IsExpanded = true, Margin = new Thickness(0, 8, 0, 8) };
        expander.Tag = "article-ledger-filters"; page.Children.Add(expander);
        var text = new Dictionary<string, TextBox>(StringComparer.Ordinal); var choices = new Dictionary<string, ComboBox>(StringComparer.Ordinal);
        string Saved(string name, string fallback = "") => articleLedgerFilters.GetValueOrDefault(name, fallback);
        void Input(string name, string title, string? hint = null)
        {
            var container = new StackPanel { Width = name == "q" ? 300 : 200, Margin = new Thickness(0, 0, 12, 6) }; panel.Children.Add(container); container.Children.Add(Label(title));
            var control = new TextBox { Tag = name, Text = Saved(name), ToolTip = hint };
            AutomationProperties.SetAutomationId(control, "article-ledger-" + name); container.Children.Add(control); text[name] = control;
        }
        void Choice(string name, string title, IEnumerable<(string Key, string Label)> options, string? selected = null, bool all = true)
        {
            var container = new StackPanel { Width = 200, Margin = new Thickness(0, 0, 12, 6) }; panel.Children.Add(container); container.Children.Add(Label(title));
            var values = new List<KeyValuePair<string, string>>(); if (all) values.Add(new("", "全部"));
            foreach (var option in options) if (values.All(value => value.Key != option.Key)) values.Add(new(option.Key, option.Label));
            var current = selected ?? Saved(name);
            if (current.Length > 0 && values.All(value => value.Key != current)) values.Add(new(current, "尚未在当前列表核实 · " + current));
            var control = new ComboBox { Tag = name, ItemsSource = values, DisplayMemberPath = "Value", SelectedValuePath = "Key", SelectedValue = current };
            AutomationProperties.SetAutomationId(control, "article-ledger-" + name); container.Children.Add(control); choices[name] = control;
        }
        var accounts = ArticleLedgerAccountRows(state.Cache.GetValueOrDefault("/api/v1/accounts"));
        Choice("account_id", "运营账号", accounts.Select(account => (Text(account, "id"), Text(account, "name") + " · " + Text(account, "id"))));
        Choice("platform", "平台", new[] { ("toutiao", "今日头条"), ("zhihu", "知乎"), ("wechat", "微信公众号"), ("other", "其他平台") });
        Input("q", "标题、链接、摘要或备注包含", "最多 300 字符；% 和 _ 也按普通文字查找。");
        Input("from", "发布自", "YYYY-MM-DD 按北京时间自然日；ISO 8601 时间须带 Z 或 +08:00 等显式时区。");
        Input("to", "发布至", "自然日包含该日整天；带时区的完整时间包含该时刻。");
        Choice("mode", "生产方式", new[] { ("manual", "人工"), ("automatic", "自动化"), ("mixed", "人工与自动化"), ("unknown", "未记录") });
        Choice("topic", "旧题材推断", new[] { ("entertainment", "文娱（推断）"), ("insurance", "保险（推断）"), ("unknown", "未推断") });
        Choice("data_status", "数据状态", new[] { ("no_snapshot", "未采集"), ("missing_reads", "缺阅读数据"), ("missing_likes", "缺点赞数据"), ("missing_comments", "缺评论数据"),
            ("incomplete", "指标不完整"), ("zero_reads", "真实 0 阅读"), ("date_unverified", "日期待核实") });
        Choice("slot", "槽位", new[] { ("zh1", "知乎 1"), ("zh2", "知乎 2"), ("zh3", "知乎 3"), ("tt1", "头条 1"), ("tt2", "头条 2"), ("tt3", "头条 3"), ("gzh", "公众号") });
        Choice("writer", "写作者", new[] { ("dedao", "得到大脑"), ("gemini_web", "Gemini"), ("human", "本人"), ("other", "其他") });
        Choice("has_warnings", "已记录警告", new[] { ("true", "有警告"), ("false", "无已记录警告") });
        Choice("has_pending_verify", "明确待核状态", new[] { ("true", "有明确待处理项"), ("false", "明确已核") });
        Input("series_no_min", "系列编号自", "正安全整数；未知范围留空。"); Input("series_no_max", "系列编号至", "正安全整数，不能小于起始编号。");
        Choice("sort", "排序依据", new[] { ("published_at", "发布时间"), ("reads", "阅读"), ("likes", "点赞"), ("comments", "评论"), ("approvals", "赞同"), ("latest_as_of", "最新指标截至时间"), ("duration", "生产耗时") }, all: false);
        Choice("order", "排序方向", new[] { ("desc", "降序"), ("asc", "升序") }, all: false);
        Choice("page_size", "每页条数", new[] { ("10", "10"), ("20", "20"), ("50", "50"), ("100", "100"), ("200", "200") }, articleLedgerPageSize.ToString(CultureInfo.InvariantCulture), all: false);
        var actions = new WrapPanel(); page.Children.Add(actions);
        actions.Children.Add(Button("应用台账筛选", async () =>
        {
            EnsureArticleLedgerOwner(identity, scope);
            var next = text.ToDictionary(pair => pair.Key, pair => pair.Value.Text, StringComparer.Ordinal);
            foreach (var pair in choices.Where(pair => pair.Key != "page_size")) next[pair.Key] = pair.Value.SelectedValue?.ToString() ?? "";
            var size = choices["page_size"].SelectedValue?.ToString() ?? "";
            _ = ArticleLedgerSelection(next, pageNumber: 1, pageSize: size); // Reject invalid raw input before any request or state change.
            articleLedgerFilters = next; articleLedgerPageSize = int.Parse(size, CultureInfo.InvariantCulture); articlePage = 1;
            await NavigateAsync("文章台账");
        }));
        actions.Children.Add(Button("清空台账筛选", async () =>
        { EnsureArticleLedgerOwner(identity, scope); articleLedgerFilters = NewArticleLedgerFilters(); articleLedgerPageSize = 50; articlePage = 1; await NavigateAsync("文章台账"); }));
    }

    private sealed record ArticleLedgerPageResult(JsonObject? Envelope, bool Fresh, string? Error);
    private async Task<ArticleLedgerPageResult> ReadArticleLedgerServerPageAsync(string path, string? identity, string scope)
    {
        var target = Engine; var cancellation = NetworkToken; HashSet<string>? allowed = null; string? failure = null;
        try
        {
            var accounts = await ReadBoundAsync("/api/v1/accounts");
            if (!accounts.IsSuccess)
            {
                if (accounts.StatusCode is 401 or 403) connected = false;
                throw new InvalidOperationException("运营账号读取未完成，原筛选页缓存保留。HTTP " + accounts.StatusCode);
            }
            var accountRows = Data(accounts.Json) as JsonArray ?? throw new InvalidDataException("运营账号集合不完整，原筛选页缓存保留。");
            allowed = ReconciliationAccountIds(accountRows);
            cancellation.ThrowIfCancellationRequested(); EnsureArticleLedgerOwner(identity, scope);
            var response = await ReadBoundAsync(path);
            if (!response.IsSuccess)
            {
                if (response.StatusCode is 401 or 403) connected = false;
                throw new InvalidOperationException("服务端筛选页读取未完成，原缓存保留。HTTP " + response.StatusCode);
            }
            var envelope = ArticleLedgerResponse.Validate(path, response.Json, allowed);
            cancellation.ThrowIfCancellationRequested(); EnsureArticleLedgerOwner(identity, scope);
            if (!ReferenceEquals(target, engine)) throw new InvalidOperationException("工作区已变化，本次文章页未用于其他身份。");
            await Task.Run(() => target.CacheBatchAsync(new Dictionary<string, string>(StringComparer.Ordinal)
            { ["/api/v1/accounts"] = accounts.Json, [path] = response.Json }, cancellation));
            return new(envelope, true, null);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { throw; }
        catch (ScopeGuardException error) { connected = false; failure = error.Message; }
        catch (HttpRequestException) { connected = false; failure = "连接中断；原缓存、草稿和未决请求保留，改看本机范围。"; }
        catch (Exception error) when (error is IOException or JsonException or InvalidDataException or InvalidOperationException or ArgumentException)
        { failure = "服务端筛选未完成，原缓存保留。" + error.Message; }
        EnsureArticleLedgerOwner(identity, scope);
        if (!connected) return new(null, false, failure);
        var cached = target.Snapshot.Cache.GetValueOrDefault(path);
        if (cached is not null)
        {
            try
            {
                allowed ??= ReconciliationAccountIds(new JsonArray(ArticleLedgerAccountRows(target.Snapshot.Cache.GetValueOrDefault("/api/v1/accounts")).Select(row => (JsonNode?)row.DeepClone()).ToArray()));
                return new(ArticleLedgerResponse.Validate(path, cached, allowed), false, failure);
            }
            catch (Exception error) when (error is JsonException or InvalidDataException or InvalidOperationException or ArgumentException)
            { failure += " 该条件的缓存页也尚未完整核实。"; }
        }
        return new(null, false, failure);
    }

    private Task<JsonObject?> ReadArticleLedgerLocalPageAsync(string path)
    {
        var state = Engine.Snapshot;
        return Task.Run(() => WorkspaceProjection.Project(path, state.Cache.GetValueOrDefault(path), state) is { } json ? JsonNode.Parse(json)?.AsObject() : null);
    }
    private static JsonObject[] ArticleLedgerAccountRows(string? json)
    {
        if (json is null) return [];
        try
        {
            if (Data(json) is not JsonArray rows) return [];
            _ = ReconciliationAccountIds(rows);
            return rows.OfType<JsonObject>().Select(row => (JsonObject)row.DeepClone()).ToArray();
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or InvalidDataException or ArgumentException) { return []; }
    }
    private void EnsureArticleLedgerOwner(string? identity, string scope)
    {
        if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope)
            throw new InvalidOperationException("工作区已变化，本次文章筛选未用于其他身份。");
    }
    private static TextBlock LedgerNotice(string value, string tag)
    { var label = Label(value); label.Tag = tag; AutomationProperties.SetAutomationId(label, tag); return label; }
    private static string ArticleLedgerSubtitle(JsonObject row)
    {
        string Metric(string name) => row["latest_metrics"] is JsonObject metrics && metrics[name] is { } value ? value.ToString() : "未取得";
        return Text(row, "account_name") + " · " + Text(row, "status") + " · " + (row["slot"]?.ToString() ?? "槽位未标注") +
            " · 阅读 " + Metric("reads") + " · 点赞 " + Metric("likes") + " · 评论 " + Metric("comments") + LocalSuffix(row);
    }
    private async Task OpenArticleLedgerRowAsync(JsonObject row, string? identity, string scope)
    {
        EnsureArticleLedgerOwner(identity, scope);
        if (Flag(row, "_local_new"))
        {
            if (await HandlePendingRecordAsync(row)) return;
            var operationId = Text(row, "_operation_id"); var creation = Engine.Snapshot.Outbox.SingleOrDefault(operation => operation.Id == operationId);
            if (creation is null || !Engine.Snapshot.Drafts.TryGetValue(creation.ResourceKey, out var draft))
                throw new InvalidOperationException("本机创建原稿未找到。原请求保留，请从同步中心核对，不能再新建一条。");
            var saved = JsonNode.Parse(draft.Text)?.AsObject();
            if (saved?["original"] is not JsonObject original || Text(saved, "kind") != "article") throw new InvalidDataException("本机文章原稿格式无法核实，原件保留。");
            await EditAsync("article", (JsonObject)original.DeepClone(), draft.Key); return;
        }
        var itemPath = "/api/v1/articles/" + Text(row, "id");
        var full = await ReadAsync(itemPath);
        EnsureArticleLedgerOwner(identity, scope);
        if (full is not JsonObject article) throw new InvalidOperationException("本机没有完整文章字段。请连接后打开，避免截断原流水线信息。");
        if (await HandlePendingRecordAsync(article)) return;
        await EditAsync("article", article, itemPath);
    }
}
