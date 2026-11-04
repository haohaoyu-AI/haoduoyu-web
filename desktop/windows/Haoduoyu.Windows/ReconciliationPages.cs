using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private const string ReconciliationPath = "/api/v1/article-reconciliation";
    private const int ReconciliationPageSize = 100;
    private static readonly JsonSerializerOptions ReconciliationCacheJson = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private string? reconciliationIdentity;
    private ArticleReconciliationFilter reconciliationFilter = new();
    private int reconciliationPage;

    private void ResetReconciliationView()
    { reconciliationIdentity = null; reconciliationFilter = new(); reconciliationPage = 0; }

    private async Task ArticleReconciliationAsync()
    {
        await FlushEditorAsync();
        if (reconciliationIdentity != currentIdentity)
        { ResetReconciliationView(); reconciliationIdentity = currentIdentity; }
        var state = Engine.Snapshot;
        if (!state.Cache.TryGetValue(ReconciliationPath, out var json))
        { ReconciliationUnavailable("尚无已核实完整对账快照。连接并核对当前工作区后，可显式刷新；已有文章与本机草稿继续保留。"); return; }
        ArticleReconciliationSnapshot snapshot;
        JsonObject metadata;
        try { (snapshot, metadata) = ReadReconciliationCache(json, state.ScopeId); }
        catch (Exception error) when (error is JsonException or InvalidDataException or InvalidOperationException or ArgumentException)
        {
            ReconciliationUnavailable("本机对账资料尚未完整核实，原缓存保留。请通过正常连接刷新完整快照。" + "\n" + error.Message); return;
        }
        var filter = reconciliationFilter;
        var view = ArticleReconciliation.Filter(snapshot, filter);
        var snapshotData = snapshot.Data;
        reconciliationPage = Math.Clamp(reconciliationPage, 0, Math.Max(0, (view.Total - 1) / ReconciliationPageSize));
        currentPage = "发布对账"; ClearPage(); heading.Text = "发布对账"; page.Children.Add(heading);
        var identity = currentIdentity; var scope = state.ScopeId;
        var capturedAt = DateTimeOffset.Parse(metadata["observed_at_utc"]!.GetValue<string>(), CultureInfo.InvariantCulture);
        page.Children.Add(Label("完整服务快照，读取于 " + capturedAt.ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'", CultureInfo.InvariantCulture) +
            "。此页只读，不会自动联网刷新；数字反映该次已核实服务记录，不代表服务器实时状态。"));
        var pending = state.Outbox.Count(operation => operation.Path.StartsWith("/api/v1/articles", StringComparison.Ordinal) &&
            operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        page.Children.Add(Label($"本机文章未决请求 {pending} 项；本机排队、结果未知与草稿没有并入此服务快照，也不会被这次对账确认或解除围栏。"));
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("刷新完整对账", RefreshArticleReconciliationAsync));
        actionsBar.Children.Add(Button("查看完整对账副本", () => { EnsureReconciliationOwner(identity, scope); ShowText("完整对账快照（只读）", ReadableReconciliation(json)); return Task.CompletedTask; }));
        actionsBar.Children.Add(Button("导出完整对账副本", () => { EnsureReconciliationOwner(identity, scope); return ExportTextAsync("好多鱼发布对账.txt", ReadableReconciliation(json)); }));
        page.Children.Add(Label("全快照状态数：" + ReconciliationCounts(snapshotData["counts"] as JsonObject)));
        page.Children.Add(Label("应产出：未配置 · 缺产：未配置 · 逾期：未配置。不会根据已有文章猜测排期或缺产。"));
        ReconciliationInsurance(snapshotData["insurance"]!.AsObject());

        page.Children.Add(Label("本地筛选（仅作用于此完整服务快照）"));
        var filters = new WrapPanel(); page.Children.Add(filters);
        var accountNames = ReconciliationAccountNames(state.Cache.GetValueOrDefault("/api/v1/accounts"));
        var allowed = metadata["account_ids"]!.AsArray().Select(node => node!.GetValue<string>()).ToArray();
        var account = ReconciliationChoice(filters, "运营账号", "account_id", filter.AccountId,
            allowed.Order(StringComparer.Ordinal).Select(id => (id, accountNames.GetValueOrDefault(id, id))));
        var status = ReconciliationChoice(filters, "状态", "status", filter.Status,
            new[] { ("drafting", "起草中"), ("illustrated", "已配图"), ("draft_saved", "草稿已存"), ("published", "已发布"), ("failed", "受阻"), ("unknown", "未知状态") });
        var dates = snapshotData["dates"]!.AsArray().Select(row => Text(row, "date")).Distinct(StringComparer.Ordinal).OrderDescending(StringComparer.Ordinal)
            .Select(day => (day.Length == 0 ? "unknown" : day, day.Length == 0 ? "日期未标注" : day));
        var runDate = ReconciliationChoice(filters, "存稿日期", "run_date", filter.RunDate, dates);
        var slot = ReconciliationChoice(filters, "槽位", "slot", filter.Slot,
            new[] { ("zh1", "知乎 1"), ("zh2", "知乎 2"), ("zh3", "知乎 3"), ("tt1", "头条 1"), ("tt2", "头条 2"), ("tt3", "头条 3"), ("gzh", "公众号"), ("unknown", "槽位未知") });
        var writer = ReconciliationChoice(filters, "写作者", "writer", filter.Writer,
            new[] { ("dedao", "得到大脑"), ("gemini_web", "Gemini"), ("human", "本人"), ("other", "其他"), ("unknown", "写作者未知") });
        var warnings = ReconciliationChoice(filters, "警告", "has_warnings", ReconciliationBoolean(filter.HasWarnings),
            new[] { ("true", "有已记录警告"), ("false", "无已记录警告") });
        var pendingVerify = ReconciliationChoice(filters, "待核", "has_pending_verify", filter.PendingUnknownOnly ? "unknown" : ReconciliationBoolean(filter.HasPendingVerify),
            new[] { ("true", "有明确待处理项"), ("false", "明确已核"), ("unknown", "未确认") });
        var queryPanel = new StackPanel { Width = 280, Margin = new Thickness(0, 0, 12, 8) }; filters.Children.Add(queryPanel);
        queryPanel.Children.Add(Label("标题包含"));
        var query = new TextBox { Tag = "q", Text = filter.Query, MaxLength = 300 };
        AutomationProperties.SetAutomationId(query, "reconciliation-q"); queryPanel.Children.Add(query);
        async Task ApplyFilters()
        {
            EnsureReconciliationOwner(identity, scope);
            var pendingChoice = Selected(pendingVerify);
            var next = new ArticleReconciliationFilter(Selected(account), Selected(status), Selected(runDate), Selected(slot), Selected(writer), query.Text,
                ReconciliationBoolean(Selected(warnings)), pendingChoice == "unknown" ? null : ReconciliationBoolean(pendingChoice), pendingChoice == "unknown");
            _ = ArticleReconciliation.Filter(snapshot, next); // Validate before replacing the current filter or display.
            reconciliationFilter = next; reconciliationPage = 0; await ArticleReconciliationAsync();
        }
        query.KeyDown += (_, args) => { if (args.Key == Key.Enter) { args.Handled = true; Run(ApplyFilters); } };
        var filterActions = new WrapPanel(); page.Children.Add(filterActions);
        filterActions.Children.Add(Button("筛选对账记录", ApplyFilters));
        filterActions.Children.Add(Button("清空筛选", async () => { EnsureReconciliationOwner(identity, scope); reconciliationFilter = new(); reconciliationPage = 0; await ArticleReconciliationAsync(); }));
        page.Children.Add(Label($"完整服务快照 {snapshot.Total} 条 · 当前筛选 {view.Total} 条 · 第 {reconciliationPage + 1} 页（每页最多 {ReconciliationPageSize} 条）"));
        page.Children.Add(Label("当前筛选状态数：" + ReconciliationCounts(view.Counts)));
        page.Children.Add(Label("未确认既不算明确已核，也不算有明确待处理项，可单独筛选；“全部”包含三种状态。筛选不会改变全快照的对账数字。"));
        var paging = new WrapPanel(); page.Children.Add(paging);
        if (reconciliationPage > 0) paging.Children.Add(Button("对账上一页", async () => { EnsureReconciliationOwner(identity, scope); reconciliationPage--; await ArticleReconciliationAsync(); }));
        if ((long)(reconciliationPage + 1) * ReconciliationPageSize < view.Total)
            paging.Children.Add(Button("对账下一页", async () => { EnsureReconciliationOwner(identity, scope); reconciliationPage++; await ArticleReconciliationAsync(); }));
        List(view.Rows.Skip(reconciliationPage * ReconciliationPageSize).Take(ReconciliationPageSize).Select(row =>
            (Text(row, "title"), ReconciliationRowSubtitle(row), (Func<Task>)(() => OpenReconciliationRowAsync(row, metadata, identity, scope)))));
    }

    private void ReconciliationUnavailable(string reason)
    {
        currentPage = "发布对账"; ClearPage(); heading.Text = "发布对账"; page.Children.Add(heading);
        page.Children.Add(Label(reason)); page.Children.Add(Button("刷新完整对账", RefreshArticleReconciliationAsync));
        page.Children.Add(Label("这里只读取完整服务快照；没有资料不等于零条、没有缺产或全部已核。本机草稿与未确认请求保留。"));
    }

    private async Task RefreshArticleReconciliationAsync()
    {
        await FlushEditorAsync();
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null)
            throw new InvalidOperationException("请先连接或登录原工作区并核对身份，再刷新完整对账。原快照保留。");
        var target = Engine; var identity = currentIdentity; var expectedScope = api.ExpectedScopeId; var cancellation = NetworkToken;
        if (ReconciliationServerScope(identity) != expectedScope) throw new InvalidOperationException("当前工作区身份尚未与服务核对，原快照保留。");
        // No cache or view change until both complete responses, account scope and final identity have passed.
        var accounts = await ReadBoundAsync("/api/v1/accounts");
        if (!accounts.IsSuccess) throw new InvalidOperationException("运营账号读取未成功，原对账快照保留。HTTP " + accounts.StatusCode);
        var allowed = ReconciliationAccountIds(Data(accounts.Json) as JsonArray ?? throw new InvalidDataException("运营账号清单不完整，原快照保留。"));
        var report = await ReadBoundAsync(ReconciliationPath);
        if (!report.IsSuccess) throw new InvalidOperationException("完整对账读取未成功，原快照保留。HTTP " + report.StatusCode);
        _ = ArticleReconciliation.Parse(report.Json, allowed);
        cancellation.ThrowIfCancellationRequested();
        EnsureReconciliationOwner(identity, target.Snapshot.ScopeId);
        if (!ReferenceEquals(target, engine) || api.ExpectedScopeId != expectedScope) throw new InvalidOperationException("读取期间工作区已变化，该响应未用于其他身份，原快照保留。");
        var envelope = JsonNode.Parse(report.Json)!.AsObject();
        envelope["_local_reconciliation"] = Obj(("scope_id", expectedScope),
            ("account_ids", new JsonArray(allowed.Order(StringComparer.Ordinal).Select(id => (JsonNode?)JsonValue.Create(id)).ToArray())),
            ("observed_at_utc", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture)));
        var encoded = envelope.ToJsonString(ReconciliationCacheJson);
        _ = ReadReconciliationCache(encoded, target.Snapshot.ScopeId);
        await Task.Run(() => target.CacheBatchAsync(new Dictionary<string, string>(StringComparer.Ordinal)
        { ["/api/v1/accounts"] = accounts.Json, [ReconciliationPath] = encoded }, cancellation));
        await ArticleReconciliationAsync(); Message("完整对账与运营账号已一次性保存到当前分区；本机未决请求和草稿保留，未发送业务写入。");
    }

    private (ArticleReconciliationSnapshot Snapshot, JsonObject Metadata) ReadReconciliationCache(string json, string workspaceScope)
    {
        var envelope = JsonNode.Parse(json) as JsonObject ?? throw new InvalidDataException("对账缓存不是完整对象。");
        if (envelope["_local_scope_id"] is JsonValue localScope && localScope.GetValue<string>() != workspaceScope)
            throw new InvalidDataException("对账缓存属于其他本机身份分区。");
        var metadata = envelope["_local_reconciliation"] as JsonObject ?? throw new InvalidDataException("对账缓存缺少已核实的来源与账号集合。");
        if (Text(metadata, "scope_id") != ReconciliationServerScope(currentIdentity)) throw new InvalidDataException("对账缓存的服务归属与当前身份不一致。");
        var observed = Text(metadata, "observed_at_utc");
        if (!Regex.IsMatch(observed, @"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,7})?(?:Z|\+00:00)$", RegexOptions.CultureInvariant) ||
            !DateTimeOffset.TryParse(observed, CultureInfo.InvariantCulture, DateTimeStyles.None, out var instant) || instant.Offset != TimeSpan.Zero)
            throw new InvalidDataException("对账缓存缺少有效的读取时间。");
        var ids = metadata["account_ids"] as JsonArray ?? throw new InvalidDataException("对账缓存缺少该次核实的运营账号集合。");
        var allowed = ReconciliationAccountIds(ids, metadata: true);
        return (ArticleReconciliation.Parse(json, allowed), (JsonObject)metadata.DeepClone());
    }

    private static HashSet<string> ReconciliationAccountIds(JsonArray items, bool metadata = false)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in items)
        {
            var node = metadata ? item : item is JsonObject account ? account["id"] : null;
            if (node is not JsonValue value || !value.TryGetValue<string>(out var id) || string.IsNullOrWhiteSpace(id) || id != id.Trim() || id.Length > 300 || !ids.Add(id))
                throw new InvalidDataException("运营账号集合不完整或包含重复标识，原快照保留。");
        }
        return ids;
    }
    private static Dictionary<string, string> ReconciliationAccountNames(string? json)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        if (json is null) return result;
        try { foreach (var account in Rows(Data(json))) if (Text(account, "id") is { Length: > 0 } id) result.TryAdd(id, Text(account, "name") + " · " + id); }
        catch (JsonException) { /* Names are optional labels; saved IDs remain explicit. */ }
        return result;
    }
    private static string ReconciliationServerScope(string? identity)
    {
        var scope = identity?.Split(':').LastOrDefault() ?? "";
        if (!Regex.IsMatch(scope, "^[a-f0-9]{64}$", RegexOptions.CultureInvariant)) throw new InvalidDataException("当前身份还没有已核实的服务归属。");
        return scope;
    }
    private void EnsureReconciliationOwner(string? identity, string scope)
    {
        if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope)
            throw new InvalidOperationException("工作区已变化，本次对账结果未用于其他身份。");
    }
    private static string Selected(ComboBox combo) => combo.SelectedValue?.ToString() ?? "";
    private static string ReconciliationBoolean(bool? value) => value is null ? "" : value.Value ? "true" : "false";
    private static bool? ReconciliationBoolean(string value) => value switch { "true" => true, "false" => false, "" => null, _ => throw new InvalidOperationException("请选择有效的对账筛选状态。") };
    private static ComboBox ReconciliationChoice(Panel parent, string title, string key, string selected, IEnumerable<(string Key, string Label)> options)
    {
        var box = new StackPanel { Width = 205, Margin = new Thickness(0, 0, 12, 8) }; parent.Children.Add(box); box.Children.Add(Label(title));
        var values = new List<KeyValuePair<string, string>> { new("", "全部") };
        foreach (var option in options) if (values.All(value => value.Key != option.Key)) values.Add(new(option.Key, option.Label));
        if (selected.Length > 0 && values.All(value => value.Key != selected)) values.Add(new(selected, selected + "（此快照无记录）"));
        var control = new ComboBox { Tag = key, ItemsSource = values, DisplayMemberPath = "Value", SelectedValuePath = "Key", SelectedValue = selected };
        AutomationProperties.SetAutomationId(control, "reconciliation-" + key); box.Children.Add(control); return control;
    }
    private static string ReconciliationCounts(JsonObject? counts) => counts is null ? "未取得" : string.Join(" · ", counts.Select(pair =>
        (pair.Key switch { "drafting" => "起草中", "illustrated" => "已配图", "draft_saved" => "草稿已存", "published" => "已发布", "failed" => "受阻", _ => "未知" }) + " " + pair.Value));
    private void ReconciliationInsurance(JsonObject insurance)
    {
        page.Children.Add(Label("保险编号进度（仅显式公众号槽位 gzh 的实际记录）"));
        page.Children.Add(Label("实际记录 " + Text(insurance, "recorded") + " · 已编号记录 " + Text(insurance, "numbered") + " · 去重编号 " + Text(insurance, "unique_count") +
            " · 最低编号 " + (insurance["lowest"]?.ToString() ?? "未知") + " · 最高编号 " + (insurance["highest"]?.ToString() ?? "未知")));
        var duplicates = insurance["duplicate_numbers"]!.AsArray();
        page.Children.Add(Label("重复号：" + (duplicates.Count == 0 ? "无已记录重复号" : string.Join("；", duplicates.Select(row => Text(row, "number") + "（" + row!["article_ids"]!.AsArray().Count + " 条）")))));
        var gaps = insurance["observed_gap_ranges"]!.AsArray();
        page.Children.Add(Label("已观察内部缺号候选：" + (gaps.Count == 0 ? "未观察到内部间隔" : string.Join("、", gaps.Select(row => Text(row, "from") == Text(row, "to") ? Text(row, "from") : Text(row, "from") + "–" + Text(row, "to"))))));
        page.Children.Add(Label("起点、目标与样本编号映射未知。内部间隔仅是已记录编号之间的候选，不等于应产出、缺产、逾期或真实未写文章。"));
    }
    private static string ReconciliationRowSubtitle(JsonObject row) => (row["run_date"]?.ToString() ?? "日期未标注") + " · " +
        (row["slot"]?.ToString() ?? "槽位未知") + " · " + (row["writer"]?.ToString() ?? "写作者未知") + " · " +
        (row["status"]?.ToString() ?? "状态未知") + " · " + (row["has_pending_verify"] is JsonValue boolean && boolean.TryGetValue<bool>(out var pending) ? pending ? "有待处理项" : "明确已核" : "待核状态未知") +
        " · 警告 " + row["warnings"]!.AsArray().Count;
    private static string ReadableReconciliation(string json) => JsonNode.Parse(json)!.ToJsonString(ArticleReadableJson);

    private async Task OpenReconciliationRowAsync(JsonObject row, JsonObject metadata, string? identity, string scope)
    {
        EnsureReconciliationOwner(identity, scope); await FlushEditorAsync(); ClearPage(); heading.Text = "对账记录摘要"; page.Children.Add(heading);
        page.Children.Add(Label("本条来自已核实完整服务快照，读取于 " + Text(metadata, "observed_at_utc") + "。这里只是对账摘要，没有完整正文或可写版本，不用于编辑请求。"));
        ArticleDetailSection("对账字段", row, ["id", "title", "account_id", "status", "run_date", "slot", "writer", "series_no", "verify_state"]);
        ArticleDetailSection("缺失字段", row["missing_fields"]); ArticleDetailSection("警告", row["warnings"]); ArticleDetailSection("样本来源", row["sample"]);
        var bar = new WrapPanel(); page.Children.Add(bar);
        bar.Children.Add(Button("返回发布对账", ArticleReconciliationAsync));
        var copy = Obj(("source", "已核实服务对账快照的只读摘要，不是完整文章或可写请求"), ("snapshot", metadata.DeepClone()), ("row", row.DeepClone()));
        bar.Children.Add(Button("查看此条只读原件", () => { EnsureReconciliationOwner(identity, scope); ShowText("对账摘要原件（只读）", copy.ToJsonString(ArticleReadableJson)); return Task.CompletedTask; }));
        bar.Children.Add(Button("导出此条摘要", () => { EnsureReconciliationOwner(identity, scope); return ExportTextAsync("好多鱼对账摘要.txt", copy.ToJsonString(ArticleReadableJson)); }));
        bar.Children.Add(Button("打开完整文章详情", async () =>
        {
            EnsureReconciliationOwner(identity, scope);
            var id = Text(row, "id"); var path = "/api/v1/articles/" + Uri.EscapeDataString(id);
            var full = await ReadAsync(path);
            EnsureReconciliationOwner(identity, scope);
            var state = Engine.Snapshot;
            // A separately read detail must exist; a projected list/summary alone does not grant an editor baseline.
            if (full is not JsonObject article || Text(article, "id") != id || Version(article) < 1 || Flag(article, "_local_incomplete") ||
                !state.Cache.TryGetValue(path, out var detailJson) || Data(detailJson) is not JsonObject cachedDetail || Text(cachedDetail, "id") != id || Version(cachedDetail) < 1)
                throw new InvalidOperationException("尚无单独读取并核实的完整文章。请正常连接后读取；对账摘要未用于覆盖正文。");
            // Keep this detail's server/read baseline separate from any projected local pending values.
            await ArticlePipelineDetailAsync((JsonObject)cachedDetail.DeepClone(), path);
        }));
    }
}
