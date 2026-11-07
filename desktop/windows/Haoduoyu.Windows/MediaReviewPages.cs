using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Data;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string? mediaReviewIdentity;
    private int mediaReviewTab;
    private string mediaReviewAccount = "", mediaReviewPeriod = "yesterday", mediaReviewTopN = "5", mediaReviewTopPlatform = "";
    private string mediaReviewFrom = "", mediaReviewTo = "", mediaReviewArticleId = "";
    private long mediaReviewEpoch;
    private MediaReviewView? activeMediaReviewView;
    private static readonly (string Key, string Label)[] MediaReviewMetrics =
    [("reads", "阅读"), ("impressions", "展现"), ("likes", "点赞"), ("comments", "评论"), ("favorites", "收藏"), ("shares", "分享"), ("approvals", "赞同"), ("reading_users", "阅读人数")];
    private sealed record MediaReviewDisplayRow(MediaReviewRow Source, IReadOnlyDictionary<string, string> Cells, string? ArticleId);

    private void ResetMediaReviewView()
    {
        mediaReviewIdentity = null; mediaReviewTab = 0; mediaReviewAccount = ""; mediaReviewPeriod = "yesterday";
        mediaReviewTopN = "5"; mediaReviewTopPlatform = ""; mediaReviewFrom = ""; mediaReviewTo = ""; mediaReviewArticleId = "";
        activeMediaReviewView = null; mediaReviewEpoch = checked(mediaReviewEpoch + 1);
    }

    private MediaReviewQuery CurrentMediaReviewQuery() => BuildMediaReviewQuery(mediaReviewTab, mediaReviewAccount,
        mediaReviewPeriod, mediaReviewTopN, mediaReviewTopPlatform, mediaReviewFrom, mediaReviewTo, mediaReviewArticleId);

    private static MediaReviewQuery BuildMediaReviewQuery(int tab, string account, string period, string topN, string topPlatform, string from, string to, string articleId)
    {
        var path = tab switch { 0 => "/api/v1/overview", 1 => "/api/v1/due-reviews", 2 => "/api/v1/observations", 3 => "/api/v1/daily-metrics", _ => throw new InvalidOperationException("请选择有效复盘页面。") };
        var query = new List<KeyValuePair<string, string>>();
        void Add(string key, string value) { if (value.Length > 0) query.Add(new(key, value)); }
        Add("account_id", account);
        if (tab == 0) { Add("period", period); Add("top_n", topN); Add("top_platform", topPlatform); }
        else if (tab == 2) Add("article_id", articleId);
        else if (tab == 3) { Add("from", from); Add("to", to); }
        if (tab == 0 && (period.Length == 0 || topN.Length == 0)) throw new InvalidOperationException("请选择总览周期并填写 Top N。原查询保留。");
        if (query.Count > 0) path += "?" + string.Join("&", query.Select(pair => pair.Key + "=" + Uri.EscapeDataString(pair.Value)));
        return MediaReviewQuery.Parse(path);
    }

    private async Task MediaReviewAsync()
    {
        await FlushEditorAsync();
        if (mediaReviewIdentity != currentIdentity) { ResetMediaReviewView(); mediaReviewIdentity = currentIdentity; }
        var target = Engine; var workspace = store; var identity = currentIdentity; var state = target.Snapshot; var scope = state.ScopeId;
        var query = CurrentMediaReviewQuery(); var before = mediaReviewEpoch;
        MediaReviewView? view = null; string? cacheError = null;
        if (state.Cache.TryGetValue(query.Path, out var cached))
        {
            try { view = await Task.Run(() => MediaReview.Parse(query.Path, cached, scope)); }
            catch (Exception error) when (error is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
            { cacheError = "此精确查询的本机副本未能通过完整校验，原缓存保留。可连接后显式读取；不会使用其他查询或不完整资料补齐。"; }
        }
        NetworkToken.ThrowIfCancellationRequested(); EnsureMediaReviewOwner(identity, scope, target, workspace);
        if (before != mediaReviewEpoch) throw new InvalidOperationException("复盘页面已变化，本次旧结果未替换当前视图。");
        var epoch = mediaReviewEpoch = checked(mediaReviewEpoch + 1); activeMediaReviewView = view;
        void Guard() { EnsureMediaReviewOwner(identity, scope, target, workspace); if (epoch != mediaReviewEpoch || currentPage != "数据复盘") throw new InvalidOperationException("此复盘页面已变化，请重新打开当前查询。"); }
        currentPage = "数据复盘"; ClearPage(); heading.Text = "数据复盘"; page.Children.Add(heading);
        page.Children.Add(Label("只读数据复盘 · 每个页面独立读取自己的精确查询。切换页面仅查看本机已保存副本；点击应用查询或刷新才联网，不会写入业务记录。"));
        var tabs = new TabControl { SelectedIndex = mediaReviewTab, Margin = new Thickness(0, 4, 0, 14) };
        AutomationProperties.SetAutomationId(tabs, "media-review-tabs");
        foreach (var title in new[] { "自媒体总览", "到期观察", "文章快照", "每日数据" }) tabs.Items.Add(new TabItem { Header = title });
        tabs.SelectedIndex = mediaReviewTab; page.Children.Add(tabs);
        tabs.SelectionChanged += (_, args) =>
        {
            if (args.Source != tabs || tabs.SelectedIndex < 0 || tabs.SelectedIndex == mediaReviewTab) return;
            var selected = tabs.SelectedIndex; Run(async () => { Guard(); mediaReviewTab = selected; await MediaReviewAsync(); });
        };
        var body = new StackPanel(); ((TabItem)tabs.Items[mediaReviewTab]).Content = body;
        var filters = new WrapPanel(); body.Children.Add(filters);
        var accounts = MediaReviewAccountChoices(state, view);
        var accountPanel = MediaReviewField(filters, "运营账号", 230);
        var account = new ComboBox { ItemsSource = accounts, DisplayMemberPath = "Value", SelectedValuePath = "Key", SelectedValue = mediaReviewAccount };
        AutomationProperties.SetAutomationId(account, "media-review-account"); accountPanel.Children.Add(account);
        ComboBox? period = null, topPlatform = null; TextBox? topN = null, from = null, to = null, articleId = null;
        if (mediaReviewTab == 0)
        {
            var periodPanel = MediaReviewField(filters, "每日新增周期（北京）", 170);
            period = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", ItemsSource = new[]
            { new KeyValuePair<string, string>("yesterday", "昨天"), new("7d", "近7个完整自然日"), new("30d", "近30个完整自然日") }, SelectedValue = mediaReviewPeriod };
            AutomationProperties.SetAutomationId(period, "media-review-period"); periodPanel.Children.Add(period);
            var topPanel = MediaReviewField(filters, "累计榜 Top N（1–100）", 165); topN = new TextBox { Text = mediaReviewTopN, MaxLength = 3 };
            AutomationProperties.SetAutomationId(topN, "media-review-top-n"); topPanel.Children.Add(topN);
            var platformPanel = MediaReviewField(filters, "仅累计榜平台", 190);
            topPlatform = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", ItemsSource = new[]
            { new KeyValuePair<string, string>("", "累计榜全部平台"), new("toutiao", "今日头条"), new("zhihu", "知乎"), new("wechat", "微信公众号"), new("other", "其他平台") }, SelectedValue = mediaReviewTopPlatform };
            AutomationProperties.SetAutomationId(topPlatform, "media-review-top-platform"); platformPanel.Children.Add(topPlatform);
        }
        else if (mediaReviewTab == 2)
        {
            var articlePanel = MediaReviewField(filters, "文章标识（留空为全部）", 350); articleId = new TextBox { Text = mediaReviewArticleId, MaxLength = 180 };
            AutomationProperties.SetAutomationId(articleId, "media-review-article-id"); articlePanel.Children.Add(articleId);
        }
        else if (mediaReviewTab == 3)
        {
            var fromPanel = MediaReviewField(filters, "开始日期 YYYY-MM-DD", 195); from = new TextBox { Text = mediaReviewFrom, MaxLength = 10 };
            AutomationProperties.SetAutomationId(from, "media-review-from"); fromPanel.Children.Add(from);
            var toPanel = MediaReviewField(filters, "结束日期 YYYY-MM-DD", 195); to = new TextBox { Text = mediaReviewTo, MaxLength = 10 };
            AutomationProperties.SetAutomationId(to, "media-review-to"); toPanel.Children.Add(to);
        }
        var selectedTab = mediaReviewTab;
        var actionsBar = new WrapPanel(); body.Children.Add(actionsBar);
        actionsBar.Children.Add(MediaReviewButton("应用查询", "media-review-apply", async () =>
        {
            Guard();
            var nextAccount = account.SelectedValue?.ToString() ?? "";
            var nextPeriod = period?.SelectedValue?.ToString() ?? mediaReviewPeriod; var nextTopN = topN?.Text ?? mediaReviewTopN;
            var nextPlatform = topPlatform?.SelectedValue?.ToString() ?? mediaReviewTopPlatform;
            var nextFrom = from?.Text ?? mediaReviewFrom; var nextTo = to?.Text ?? mediaReviewTo; var nextArticle = articleId?.Text ?? mediaReviewArticleId;
            // Parse the entire route before changing the applied query or allowing HTTP.
            var requested = BuildMediaReviewQuery(selectedTab, nextAccount, nextPeriod, nextTopN, nextPlatform, nextFrom, nextTo, nextArticle);
            mediaReviewAccount = nextAccount; mediaReviewPeriod = nextPeriod; mediaReviewTopN = nextTopN; mediaReviewTopPlatform = nextPlatform;
            mediaReviewFrom = nextFrom; mediaReviewTo = nextTo; mediaReviewArticleId = nextArticle;
            await MediaReviewAsync();
            if (connected) await RefreshMediaReviewAsync(requested);
            else Message("已应用精确查询，仅显示本机已有副本。请核对原身份后连接并显式刷新。");
        }));
        actionsBar.Children.Add(MediaReviewButton("刷新当前查询", "media-review-refresh", () => { Guard(); return RefreshMediaReviewAsync(query); }));
        actionsBar.Children.Add(MediaReviewButton("刷新账号列表", "media-review-accounts-refresh", () => { Guard(); return RefreshMediaReviewAccountsAsync(); }));
        var export = MediaReviewButton("导出此查询只读副本", "media-review-export", () =>
        { Guard(); if (view is null) throw new InvalidOperationException("本机尚无此精确查询的有效资料。"); return ExportTextAsync("好多鱼数据复盘.txt", MediaReviewReadonlyCopy(view).ToJsonString(ArticleReadableJson)); });
        export.IsEnabled = view is not null; actionsBar.Children.Add(export);
        var source = Label("当前查询：" + query.Path + " · 仅此工作区 · " + (view is null ? "本机尚无有效副本" : "本机已保存副本，可能已过时"));
        AutomationProperties.SetAutomationId(source, "media-review-source"); body.Children.Add(source);
        if (cacheError is not null) body.Children.Add(Label(cacheError));
        if (view is null) { body.Children.Add(Label("此查询尚未保存到本机。可以调整查询后应用，或连接原工作区后显式刷新；不会借用其他账号、周期或路由的结果。")); return; }
        body.Children.Add(Label(MediaReviewObservedText(view)));
        body.Children.Add(Label("“未取得”与真实0分别显示。缺少日期或指标时不补零、不插值、不合成趋势，也不把本次独立读取称为跨页面同一事务快照。"));
        if (view.Overview is { } overview) RenderMediaReviewOverview(body, overview, identity, scope, Guard);
        else
        {
            if (mediaReviewTab == 1) body.Children.Add(Label("同一文章可同时到期D1、D3、D7三个观察节点；每个节点分别保留，不按文章去重。"));
            else if (mediaReviewTab == 2) body.Children.Add(Label("快照是指定截至时点的累计数据，保留原始来源、截至时间和采集时间；不是每日新增。"));
            else body.Children.Add(Label("账号整体日数据与文章明细分行展示，两者不能相加为账号总量；此处不做加总。日期范围来自当前精确查询，留空的边界以本机已读取行日期为准。"));
            if (mediaReviewTab == 3)
            {
                var dates = view.Rows.Where(row => row.Date.HasValue).Select(row => row.Date!.Value).ToArray();
                body.Children.Add(Label(dates.Length == 0 ? "此响应没有已读取的日数据日期。" :
                    $"此响应实际已录日期：{dates.Min():yyyy-MM-dd} 至 {dates.Max():yyyy-MM-dd}；未出现在清单中的日期不补零，未指定的查询边界不代表已读取完整历史。"));
            }
            else if (mediaReviewTab == 2)
            {
                var instants = view.Rows.Where(row => row.AsOf.HasValue).Select(row => row.AsOf!.Value).ToArray();
                body.Children.Add(Label(instants.Length == 0 ? "此响应没有已读取的快照截至时间。" :
                    "此响应快照截至范围：" + instants.Min().ToString("O", CultureInfo.InvariantCulture) + " 至 " + instants.Max().ToString("O", CultureInfo.InvariantCulture) + "，不是每日新增统计窗口。"));
            }
            MediaReviewTable(body, "读取结果", "media-review-rows", view.Rows.Select(row => MediaReviewDisplay(row, mediaReviewTab == 1)),
                mediaReviewTab == 1 ? ["title", "account", "kind", "due_at"] : mediaReviewTab == 2 ?
                ["article_id", "kind", "as_of", "collected_at", "source", .. MediaReviewMetrics.Select(metric => metric.Key)] :
                ["date", "account", "scope", "article_id", .. MediaReviewMetrics.Select(metric => metric.Key), "source", "updated_at"], identity, scope, Guard);
        }
    }

    private void RenderMediaReviewOverview(Panel owner, MediaOverview overview, string? identity, string scope, Action guard)
    {
        var window = overview.Window;
        var windowLabel = Label($"每日新增窗口：{window.From:yyyy-MM-dd} 至 {window.To:yyyy-MM-dd}（{window.Days}日，{window.Timezone}） · 上期：{window.PreviousFrom:yyyy-MM-dd} 至 {window.PreviousTo:yyyy-MM-dd}。" +
            (window.TodayIncomplete ? "本次来源标记今天尚未完整。" : "本期不包含尚未结束的今天。"));
        AutomationProperties.SetAutomationId(windowLabel, "media-review-window"); owner.Children.Add(windowLabel);
        owner.Children.Add(Label("累计最近快照与本期每日新增分别展示；累计榜的平台筛选只影响累计榜，不缩小账号表现、关注、趋势或累计总览。"));
        MediaReviewTitle(owner, "累计最近快照（各篇截至时间可能不同）");
        var cards = new WrapPanel(); owner.Children.Add(cards);
        foreach (var metric in MediaReviewMetrics) MediaReviewCard(cards, "累计" + metric.Label, MediaReviewMetricText(overview.Cumulative.Metrics[metric.Key]), "media-review-cumulative-" + metric.Key);
        var cumulative = overview.Cumulative.Data;
        owner.Children.Add(Label("已记录文章 " + MediaReviewValue(cumulative["article_count"]) + " · 有快照 " + MediaReviewValue(cumulative["snapshot_count"]) +
            " · 无快照 " + MediaReviewValue(cumulative["no_snapshot_count"]) + " · 阅读均值 " + MediaReviewValue(cumulative["mean_reads"]) + " · 阅读中位数 " + MediaReviewValue(cumulative["median_reads"])));
        owner.Children.Add(Label("累计快照截至：" + MediaReviewValue(cumulative["earliest_as_of"]) + " 至 " + MediaReviewValue(cumulative["as_of"]) + " · 最近采集：" + MediaReviewValue(cumulative["collected_at"])));
        owner.Children.Add(Label(Text(cumulative, "metric_note")));
        var metricCoverage = cumulative["metric_coverage"] as JsonObject;
        if (metricCoverage is not null) owner.Children.Add(Label("累计指标覆盖：" + string.Join("；", MediaReviewMetrics.Select(metric => metric.Label + "已录 " + MediaReviewValue(metricCoverage[metric.Key]?["recorded"]) + " / 缺失 " + MediaReviewValue(metricCoverage[metric.Key]?["missing"])))));
        MediaReviewTitle(owner, "本期每日新增 · 账号表现与覆盖");
        owner.Children.Add(Label("以下是来源给出的各账号本期值，不是累计快照。覆盖口径、每项覆盖天数、缺失日期和上期可比原因可点击行只读查看。"));
        MediaReviewTable(owner, "账号表现", "media-review-accounts", overview.Accounts.Select(row => MediaReviewDisplay(row)),
            ["account", "platform", .. MediaReviewMetrics.Select(metric => metric.Key), "coverage", "missing_dates", "last_updated"], identity, scope, guard);
        owner.Children.Add(Label("资料状态：最近更新 " + MediaReviewValue(overview.DataStatus["last_updated"]) + " · 完整账号 " + MediaReviewValue(overview.DataStatus["complete_accounts"]) + " · 缺失账号 " + MediaReviewValue(overview.DataStatus["missing_accounts"])));
        MediaReviewTable(owner, "累计阅读 Top 榜（仅此榜应用平台筛选）", "media-review-top", overview.TopArticles.Select(row => MediaReviewDisplay(row, true)),
            ["title", "account", "platform", .. MediaReviewMetrics.Select(metric => metric.Key), "as_of"], identity, scope, guard);
        MediaReviewTable(owner, "需要关注的文章（保留来源判断与原因）", "media-review-attention", overview.AttentionArticles.Select(row => MediaReviewDisplay(row, true)),
            ["title", "account", "attention", "reason", "baseline", "coverage", "missing_dates"], identity, scope, guard);
        MediaReviewTable(owner, "待观察节点", "media-review-due", overview.DueReviews.Select(row => MediaReviewDisplay(row, true)),
            ["title", "account", "kind", "due_at"], identity, scope, guard);
        MediaReviewTable(owner, "累计资料缺失或日期待核实的文章", "media-review-missing", overview.MissingArticles.Select(row => MediaReviewDisplay(row, true)),
            ["title", "account", "platform", "date_status", "missing_metrics"], identity, scope, guard);
        var trend = overview.Trend.SelectMany(day => day.Accounts.Select(row => MediaReviewDisplay(row, false, day.Date))).ToArray();
        MediaReviewTable(owner, "真实每日新增趋势（按日、按账号，不补缺失）", "media-review-trend", trend,
            ["date", "account", .. MediaReviewMetrics.Select(metric => metric.Key), "coverage", "missing_dates"], identity, scope, guard);
        var publication = overview.PublicationTrend.SelectMany(day => day.Accounts.Select(row => MediaReviewDisplay(row, false, day.Date))).ToArray();
        MediaReviewTable(owner, "已记录发布日期趋势", "media-review-publication", publication,
            ["date", "account", "count"], identity, scope, guard);
        owner.Children.Add(Label(Text(overview.Data, "publication_note")));
        MediaReviewTitle(owner, "各平台累计口径");
        var platforms = new StackPanel(); AutomationProperties.SetAutomationId(platforms, "media-review-platforms"); owner.Children.Add(platforms);
        foreach (var platform in overview.PlatformComparison)
            platforms.Children.Add(Label(MediaReviewPlatform(platform.Platform ?? "") + " · " + string.Join(" · ", MediaReviewMetrics.Select(metric => metric.Label + " " + MediaReviewMetricText(platform.Metrics[metric.Key])))));
        MediaReviewTitle(owner, "已记录文章生产概况（不是本期发布量）");
        owner.Children.Add(Label("文章数 " + MediaReviewValue(overview.Totals["article_count"]) + " · 自动生产 " + MediaReviewValue(overview.Totals["automatic_count"]) +
            " · 未标注生产方式 " + MediaReviewValue(overview.Totals["unknown_mode_count"]) + " · 耗时中位数（秒） " + MediaReviewValue(overview.Totals["median_duration_seconds"])));
        if (overview.Series.Count > 0) owner.Children.Add(Label("系列记录：" + Text(overview.Series, "name") + " · 计划 " + MediaReviewValue(overview.Series["planned"]) +
            " · 已录 " + MediaReviewValue(overview.Series["recorded_count"]) + " · 最高已录编号 " + MediaReviewValue(overview.Series["highest_recorded"])));
    }

    private void MediaReviewTable(Panel owner, string title, string id, IEnumerable<MediaReviewDisplayRow> rows, string[] columns,
        string? identity, string scope, Action guard)
    {
        var items = rows.ToArray(); MediaReviewTitle(owner, title + " · " + items.Length + " 行");
        var grid = new DataGrid { ItemsSource = items, IsReadOnly = true, AutoGenerateColumns = false, CanUserAddRows = false, CanUserDeleteRows = false,
            SelectionMode = DataGridSelectionMode.Single, SelectionUnit = DataGridSelectionUnit.FullRow, Height = Math.Clamp(65 + items.Length * 35, 130, 360),
            MinHeight = 130, MaxHeight = 420, EnableRowVirtualization = true, EnableColumnVirtualization = true,
            HeadersVisibility = DataGridHeadersVisibility.Column, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        foreach (var column in columns) grid.Columns.Add(new DataGridTextColumn { Header = MediaReviewName(column), Binding = new Binding("Cells[" + column + "]"),
            Width = column is "title" or "reason" or "baseline" or "coverage" or "missing_dates" ? 260 : 150 });
        VirtualizingPanel.SetIsVirtualizing(grid, true); VirtualizingPanel.SetVirtualizationMode(grid, VirtualizationMode.Recycling);
        AutomationProperties.SetAutomationId(grid, id); owner.Children.Add(grid);
        grid.SelectionChanged += (_, _) =>
        { if (grid.SelectedItem is MediaReviewDisplayRow row) Run(async () => { guard(); await OpenMediaReviewRowAsync(row, identity, scope); }); };
        if (items.Length == 0) owner.Children.Add(Label("本次已保存的精确查询返回空清单；这不推断其他查询、账号或路由也为空。"));
    }

    private static MediaReviewDisplayRow MediaReviewDisplay(MediaReviewRow row, bool articleIdentityIsId = false, DateOnly? dateOverride = null)
    {
        var data = row.Data; var cells = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var key in new[] { "title", "account", "platform", "article_id", "kind", "due_at", "as_of", "collected_at", "source", "updated_at", "date", "scope", "coverage", "missing_dates", "last_updated", "attention", "reason", "baseline", "date_status", "missing_metrics", "count" }) cells[key] = "未取得";
        foreach (var pair in data.Where(pair => pair.Value is JsonValue || pair.Value is null)) cells[pair.Key] = MediaReviewValue(pair.Value);
        cells["title"] = row.Title; cells["article_id"] = row.ArticleId ?? (articleIdentityIsId ? row.Id : "账号整体，无文章标识");
        cells["account"] = Text(data, "account_name") is { Length: > 0 } name ? name : Text(data, "name") is { Length: > 0 } accountName ? accountName :
            row.AccountId ?? "由服务端查询筛选，响应未附账号字段";
        cells["platform"] = MediaReviewPlatform(Text(data, "platform")); cells["kind"] = MediaReviewKindName(row.Kind ?? Text(data, "due_kind"));
        cells["date"] = dateOverride?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? row.Date?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "未取得";
        cells["scope"] = row.ArticleId is null ? "账号整体日数据" : "文章明细（不与账号整体相加）";
        if (!data.ContainsKey("as_of") && data.ContainsKey("latest_as_of")) cells["as_of"] = MediaReviewValue(data["latest_as_of"]);
        var metrics = data["period_metrics"] is JsonObject ? row.PeriodMetrics : row.Metrics;
        foreach (var metric in MediaReviewMetrics) cells[metric.Key] = MediaReviewMetricText(metrics[metric.Key]);
        cells["coverage"] = row.Coverage is { } coverage ? coverage.Label + $" · 已读{coverage.Days}/" + (coverage.ExpectedDays?.ToString(CultureInfo.InvariantCulture) ?? "未给出") + "日" : "此来源未给出覆盖说明";
        cells["missing_dates"] = row.Coverage is { } cov ? string.Join("、", cov.MissingDates) : "未取得覆盖日期";
        cells["missing_metrics"] = data["missing_metrics"] is JsonArray missing ? string.Join("、", missing.Select(value => MediaReviewName(value?.ToString() ?? ""))) : "未取得";
        var attention = data["attention"] as JsonObject;
        cells["attention"] = Text(attention, "kind") switch { "up" => "高于历史同龄窗口", "down" => "低于历史同龄窗口", "normal" => "历史常见范围", "insufficient" => "样本或资料不足", _ => "未取得来源判断" };
        cells["reason"] = MediaReviewValue(attention?["reason"]); cells["baseline"] = MediaReviewValue(attention?["baseline"]);
        var articleId = articleIdentityIsId ? row.Id : row.ArticleId;
        return new(row, cells, articleId);
    }

    private async Task OpenMediaReviewRowAsync(MediaReviewDisplayRow row, string? identity, string scope)
    {
        EnsureMediaReviewOwner(identity, scope); await FlushEditorAsync(); EnsureMediaReviewOwner(identity, scope);
        var target = Engine; var workspace = store; var epoch = mediaReviewEpoch;
        void Guard() { EnsureMediaReviewOwner(identity, scope, target, workspace); if (epoch != mediaReviewEpoch || currentPage != "数据复盘") throw new InvalidOperationException("此只读详情所属查询已变化，请重新打开。"); }
        ClearPage(); heading.Text = "数据复盘 · 只读详情"; page.Children.Add(heading);
        page.Children.Add(Label("仅展示已读取资料。来源摘要没有完整文章可写版本，不会直接进入编辑器；链接、路径仅作文字显示。"));
        var text = new StringBuilder();
        foreach (var cell in row.Cells) text.Append(MediaReviewName(cell.Key)).Append("：").AppendLine(cell.Value);
        foreach (var metric in MediaReviewMetrics)
        {
            text.Append(metric.Label).Append("：本期 ").Append(MediaReviewMetricText(row.Source.PeriodMetrics[metric.Key]))
                .Append(" · 上期 ").Append(MediaReviewMetricText(row.Source.PreviousMetrics[metric.Key]));
            if (row.Source.Coverage is { } coverage) text.Append(" · 本期覆盖 ").Append(coverage.MetricDays.GetValueOrDefault(metric.Key)).Append('/').Append(coverage.ExpectedDays?.ToString(CultureInfo.InvariantCulture) ?? "未给出").Append(" 日");
            if (row.Source.Comparisons.TryGetValue(metric.Key, out var comparison))
                text.Append(" · 差值 ").Append(comparison.Delta?.ToString(CultureInfo.InvariantCulture) ?? "不可比较").Append(" · 增幅 ")
                    .Append(comparison.Percent?.ToString("0.##", CultureInfo.InvariantCulture) is { } percent ? percent + "%" : "无定义或不可比较")
                    .Append(" · ").Append(comparison.Comparable ? "来源判定可比较" : "来源判定不可比较").Append(" · ").Append(comparison.Reason);
            text.AppendLine();
        }
        if (row.Source.Coverage is { } currentCoverage) text.AppendLine("本期口径：" + currentCoverage.Source + " · " + currentCoverage.Label + " · 缺失日期：" + string.Join("、", currentCoverage.MissingDates));
        if (row.Source.PreviousCoverage is { } previousCoverage) text.AppendLine("上期口径：" + previousCoverage.Source + " · " + previousCoverage.Label + " · 缺失日期：" + string.Join("、", previousCoverage.MissingDates));
        text.AppendLine().AppendLine("保留的来源字段（只读摘要，不能作为可写原稿或请求重放）：").Append(row.Source.Data.ToJsonString(ArticleReadableJson));
        var detail = new TextBox { Text = text.ToString(), IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Height = 470, MaxHeight = 650 };
        AutomationProperties.SetAutomationId(detail, "media-review-detail-text"); page.Children.Add(detail);
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        if (row.ArticleId is { Length: > 0 }) actionsBar.Children.Add(MediaReviewButton("读取原文章完整详情", "media-review-open-article", async () =>
        { Guard(); await OpenMediaReviewArticleAsync(row.ArticleId, identity, scope); }));
        actionsBar.Children.Add(MediaReviewButton("导出此条只读副本", "media-review-row-export", () =>
        { Guard(); return ExportTextAsync("好多鱼复盘只读条目.txt", detail.Text); }));
        actionsBar.Children.Add(MediaReviewButton("返回数据复盘", "media-review-back", () => { Guard(); return MediaReviewAsync(); }));
    }

    private async Task OpenMediaReviewArticleAsync(string articleId, string? identity, string scope)
    {
        EnsureMediaReviewOwner(identity, scope);
        var target = Engine; var workspace = store; var epoch = mediaReviewEpoch; var cancellation = NetworkToken;
        var checkedId = MediaReviewQuery.Parse("/api/v1/observations?article_id=" + Uri.EscapeDataString(articleId)).ArticleId;
        var key = "/api/v1/articles/" + checkedId;
        if (await HandleMediaReviewArticlePendingAsync(key)) return;
        if (connected)
        {
            var expectedScope = api.ExpectedScopeId;
            if (expectedScope is null || MediaReviewServerScope(identity) != expectedScope || MediaReviewTransportIdentity(expectedScope) != identity)
                throw new InvalidOperationException("请先核对原工作区身份；复盘摘要不能作为完整文章原稿。");
            var result = await target.ReadRemoteAsync(key, cancellation);
            if (!result.IsSuccess) throw new InvalidOperationException($"读取完整文章失败 HTTP {result.StatusCode}。原缓存和稿件保留。");
            if (Data(result.Json) is not JsonObject raw || !MediaReviewFullArticle(raw, articleId))
                throw new InvalidDataException("完整文章缺少真实版本或身份不符，复盘摘要仍只读。");
            await VerifyMediaReviewRemoteOwnerAsync(identity, scope, target, workspace, expectedScope, epoch, cancellation);
            await target.CacheBatchAsync(new Dictionary<string, string> { [key] = result.Json }, cancellation);
        }
        var state = target.Snapshot;
        if (!state.Cache.TryGetValue(key, out var cached) || Data(cached) is not JsonObject original || !MediaReviewFullArticle(original, articleId))
            throw new InvalidOperationException("本机没有独立读取且带真实版本的完整文章。请连接后显式读取；原草稿和待核请求保留。");
        var projectionState = state with { Cache = new Dictionary<string, string> { [key] = cached } };
        var projected = await Task.Run(() => WorkspaceProjection.Project(key, cached, projectionState));
        cancellation.ThrowIfCancellationRequested(); EnsureMediaReviewOwner(identity, scope, target, workspace);
        if (epoch != mediaReviewEpoch || projected is null || Data(projected) is not JsonObject full || !MediaReviewFullArticle(full, articleId))
            throw new InvalidOperationException("完整文章当前无法核实，原缓存和稿件保留。");
        if (await HandlePendingRecordAsync(full) || await HandleMediaReviewArticlePendingAsync(key)) return;
        await ArticlePipelineDetailAsync(full, key);
    }

    private async Task<bool> HandleMediaReviewArticlePendingAsync(string key)
    {
        var pending = Engine.Snapshot.Outbox.LastOrDefault(operation => operation.ResourceKey == key && operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        return pending is not null && await HandlePendingRecordAsync(Obj(("_operation_id", pending.Id)));
    }
    private static bool MediaReviewFullArticle(JsonObject row, string id) => !Flag(row, "_local_incomplete") && Text(row, "id") == id &&
        row["version"] is JsonValue version && version.TryGetValue<long>(out var value) && value > 0 &&
        row["title"] is JsonValue title && title.TryGetValue<string>(out _) && row["account_id"] is JsonValue account && account.TryGetValue<string>(out _);

    private async Task RefreshMediaReviewAsync(MediaReviewQuery query)
    {
        await FlushEditorAsync();
        query = MediaReviewQuery.Parse(query.Path);
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null) throw new InvalidOperationException("请连接原工作区并核对身份后再读取此查询。原缓存和本机工作保留。");
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        var expectedScope = api.ExpectedScopeId; var epoch = mediaReviewEpoch; var cancellation = NetworkToken;
        if (MediaReviewServerScope(identity) != expectedScope || MediaReviewTransportIdentity(expectedScope) != identity || CurrentMediaReviewQuery().Path != query.Path)
            throw new InvalidOperationException("此查询或工作区身份已变化，未读取其他范围。");
        var result = await target.ReadRemoteAsync(query.Path, cancellation);
        if (!result.IsSuccess) throw new InvalidOperationException($"此查询读取失败 HTTP {result.StatusCode}。原缓存、草稿与未确认请求完整保留。");
        MediaReviewResponse.Validate(query.Path, result.Json, expectedScope);
        await VerifyMediaReviewRemoteOwnerAsync(identity, scope, target, workspace, expectedScope, epoch, cancellation);
        if (CurrentMediaReviewQuery().Path != query.Path) throw new InvalidOperationException("读取期间查询已变化，旧结果未写入其他查询缓存。");
        var envelope = JsonNode.Parse(result.Json)!.AsObject();
        envelope["_local_scope_id"] = scope;
        envelope["_local_media_review"] = Obj(("observed_at_utc", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture)), ("scope_id", scope), ("query_path", query.Path));
        var cache = envelope.ToJsonString(); MediaReview.Parse(query.Path, cache, scope);
        cancellation.ThrowIfCancellationRequested(); EnsureMediaReviewOwner(identity, scope, target, workspace);
        await target.CacheBatchAsync(new Dictionary<string, string> { [query.Path] = cache }, cancellation);
        EnsureMediaReviewOwner(identity, scope, target, workspace);
        if (epoch != mediaReviewEpoch) throw new InvalidOperationException("页面已变化；已核实副本保留在原查询下，请重新打开。");
        await MediaReviewAsync(); Message("已保存此精确查询的只读副本，未发送业务写入；其他页面仍保留各自读取来源和时间。");
    }

    private async Task RefreshMediaReviewAccountsAsync()
    {
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null) throw new InvalidOperationException("请先连接原工作区，再显式刷新账号列表。");
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        var expectedScope = api.ExpectedScopeId; var epoch = mediaReviewEpoch; var cancellation = NetworkToken;
        if (MediaReviewServerScope(identity) != expectedScope || MediaReviewTransportIdentity(expectedScope) != identity) throw new InvalidOperationException("当前身份尚未核实。");
        var result = await target.ReadRemoteAsync("/api/v1/accounts", cancellation);
        if (!result.IsSuccess || Data(result.Json) is not JsonArray) throw new InvalidDataException("账号列表未完整读取，旧列表保留。");
        await VerifyMediaReviewRemoteOwnerAsync(identity, scope, target, workspace, expectedScope, epoch, cancellation);
        await target.CacheBatchAsync(new Dictionary<string, string> { ["/api/v1/accounts"] = result.Json }, cancellation);
        EnsureMediaReviewOwner(identity, scope, target, workspace);
        if (epoch != mediaReviewEpoch) throw new InvalidOperationException("页面已变化；账号副本已保留在原工作区。");
        await MediaReviewAsync(); Message("账号列表已单独更新；当前复盘数据仍是原精确查询的已保存副本。");
    }

    private async Task VerifyMediaReviewRemoteOwnerAsync(string? identity, string scope, SyncEngine target, AtomicWorkspaceStore? workspace,
        string expectedScope, long epoch, CancellationToken cancellation)
    {
        string returnedScope;
        try { returnedScope = await api.ReadScopeIdAsync(cancellation); }
        catch (ScopeGuardException) { connected = false; throw; }
        cancellation.ThrowIfCancellationRequested(); EnsureMediaReviewOwner(identity, scope, target, workspace);
        if (returnedScope != expectedScope || MediaReviewTransportIdentity(returnedScope) != identity) connected = false;
        if (returnedScope != expectedScope || MediaReviewTransportIdentity(returnedScope) != identity || api.ExpectedScopeId != expectedScope || epoch != mediaReviewEpoch || currentPage != "数据复盘")
            throw new InvalidOperationException("读取期间工作区或页面已变化，此响应未替换旧缓存，草稿和请求保留。");
    }
    private void EnsureMediaReviewOwner(string? identity, string scope, SyncEngine? target = null, AtomicWorkspaceStore? workspace = null)
    {
        if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope || target is not null && !ReferenceEquals(target, engine) ||
            workspace is not null && !ReferenceEquals(workspace, store)) throw new InvalidOperationException("工作区已变化，本次复盘资料未用于其他身份。");
    }
    private static string? MediaReviewServerScope(string? identity) => identity?.Split(':').LastOrDefault();
    private string MediaReviewTransportIdentity(string scope) => api.PublicMode ? "public:" + scope : "user:" + api.UserId + ":" + scope;
    private List<KeyValuePair<string, string>> MediaReviewAccountChoices(WorkspaceState state, MediaReviewView? view)
    {
        var choices = new Dictionary<string, string>(StringComparer.Ordinal);
        if (state.Cache.TryGetValue("/api/v1/accounts", out var cached))
        {
            try
            {
                var envelope = JsonNode.Parse(cached) as JsonObject;
                if (envelope is not null && (!envelope.ContainsKey("_local_scope_id") || Text(envelope, "_local_scope_id") == state.ScopeId))
                    foreach (var row in Rows(envelope["data"])) if (Text(row, "id") is { Length: > 0 } id) choices[id] = Text(row, "name") + " · " + MediaReviewPlatform(Text(row, "platform"));
            }
            catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException) { /* Original catalog retained; exact read results remain usable. */ }
        }
        if (view?.Overview is { } overview) foreach (var row in overview.Accounts) if (row.Id.Length > 0) choices.TryAdd(row.Id, Text(row.Data, "name") + " · " + MediaReviewPlatform(Text(row.Data, "platform")));
        if (mediaReviewAccount.Length > 0) choices.TryAdd(mediaReviewAccount, "当前筛选 · 本机账号名称未核实 · " + mediaReviewAccount);
        var result = choices.OrderBy(pair => pair.Value, StringComparer.Ordinal).Select(pair => new KeyValuePair<string, string>(pair.Key, pair.Value)).ToList(); result.Insert(0, new("", "全部授权账号")); return result;
    }

    private static JsonObject MediaReviewReadonlyCopy(MediaReviewView view) => Obj(
        ("source", "当前工作区精确查询的只读数据复盘副本；不是原始备份，不能导入或重放。缺失不补零，各路由不构成同一事务。"),
        ("query_path", view.Query.Path), ("readonly", true), ("original_response", view.Original.DeepClone()));
    private static string MediaReviewObservedText(MediaReviewView view)
    {
        var local = view.Original["_local_media_review"] as JsonObject;
        return local is null ? "此旧副本未记录读取时间，不能推断为刚刚取得。" : "本机保存读取时间：" + Text(local, "observed_at_utc") + " · 响应来源：" + view.Query.Path + "，与其他页面读取相互独立。";
    }
    private static string MediaReviewMetricText(MediaMetric metric) => !metric.Present ? "未取得（未提供）" : metric.IsNull || metric.Value is null ? "未取得（空值）" : metric.Value.Value.ToString(CultureInfo.InvariantCulture);
    private static string MediaReviewValue(JsonNode? value) => value switch { null => "未取得", JsonArray array => array.Count == 0 ? "已取得空清单" : string.Join("、", array.Select(item => item?.ToString() ?? "未取得")), _ => value.ToString() };
    private static string MediaReviewPlatform(string platform) => platform switch { "toutiao" => "今日头条", "zhihu" => "知乎", "wechat" => "微信公众号", "other" => "其他平台", "" => "平台未取得", _ => platform };
    private static string MediaReviewKindName(string kind) => kind switch { "d1" => "D1观察", "d3" => "D3观察", "d7" => "D7观察", "latest" => "最新快照", "" => "未取得", _ => kind };
    private static string MediaReviewName(string key) => MediaReviewMetrics.FirstOrDefault(metric => metric.Key == key).Label ?? key switch
    {
        "title" => "文章标题", "account" or "account_name" => "运营账号", "account_id" => "账号标识", "platform" => "平台", "article_id" => "文章标识", "date" => "日期（北京）",
        "kind" => "观察节点", "due_kind" => "到期节点", "due_at" => "到期时间", "as_of" => "数据截至", "collected_at" => "采集时间", "source" => "原始来源", "updated_at" => "记录更新",
        "scope" => "日数据口径", "coverage" => "本期覆盖与口径", "missing_dates" => "缺失日期", "last_updated" => "资料最近更新", "attention" => "来源判断", "reason" => "来源原因", "baseline" => "比较基线",
        "date_status" => "发布日期状态", "missing_metrics" => "缺失指标", "count" => "已录发布量", _ => key
    };
    private static void MediaReviewTitle(Panel owner, string title) => owner.Children.Add(new TextBlock { Text = title, FontSize = 18, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 18, 0, 7), TextWrapping = TextWrapping.Wrap });
    private static void MediaReviewCard(Panel owner, string title, string value, string id)
    {
        var panel = new StackPanel { Width = 170, Margin = new Thickness(0, 0, 12, 10) }; panel.Children.Add(Label(title));
        var number = new TextBlock { Text = value, FontSize = 22, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap }; AutomationProperties.SetAutomationId(number, id); panel.Children.Add(number); owner.Children.Add(panel);
    }
    private static StackPanel MediaReviewField(Panel owner, string title, double width)
    { var panel = new StackPanel { Width = width, Margin = new Thickness(0, 0, 12, 8) }; panel.Children.Add(Label(title)); owner.Children.Add(panel); return panel; }
    private Button MediaReviewButton(string label, string id, Func<Task> action)
    { var button = Button(label, action); AutomationProperties.SetAutomationId(button, id); return button; }
}
