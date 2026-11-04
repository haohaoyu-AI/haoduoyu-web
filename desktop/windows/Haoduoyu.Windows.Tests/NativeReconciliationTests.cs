using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ReconciliationCases =>
    [
        ("Shown native publication reconciliation filters pages and reads complete offline evidence without crossing private profiles", () => RunWithDispatcher(OfflineReconciliationAsync)),
        ("Shown native publication reconciliation refresh atomically keeps its last complete snapshot and local work after an inconsistent response", () => RunWithDispatcher(ReconciliationRefreshPreservesStateAsync))
    ];

    private static async Task OfflineReconciliationAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            const string firstUser = "10000000-0000-4000-8000-000000000601", secondUser = "10000000-0000-4000-8000-000000000602";
            var firstIdentity = "user:" + firstUser + ":" + firstScope; var secondIdentity = "user:" + secondUser + ":" + secondScope;
            var draftKey = "synthetic-reconciliation-draft";
            var draft = AppDraft("history", draftKey, new JsonObject(), Object(("text", "甲只读对账不能改写的本机中文原稿 🐟")));
            var operationId = Guid.NewGuid().ToString(); var operationPath = "/api/v1/note-entries/" + Guid.NewGuid().ToString();
            var operation = new PendingOperation { Id = operationId, ResourceKey = operationPath, Path = operationPath, Method = "PUT",
                BodyJson = Object(("version", 0), ("save_id", operationId), ("category", "life"), ("date", Day), ("text", "只读对账不得同步的未发送请求")).ToJsonString() };
            var firstPath = await SeedReconciliationWorkspaceAsync(root, firstIdentity, firstScope,
                ReconciliationAccounts("synthetic-recon-a", "synthetic-recon-insurance"), ReconciliationRows("甲"), draft, operation);
            var secondPath = await SeedReconciliationWorkspaceAsync(root, secondIdentity, secondScope, ReconciliationAccounts("synthetic-recon-b"),
                [ReconciliationRow("recon-b-only", "synthetic-recon-b", "乙私有独立对账原件", "published", "tt1", "human", "2026-11-04")]);
            var firstBytes = await File.ReadAllBytesAsync(firstPath); var secondBytes = await File.ReadAllBytesAsync(secondPath);
            RememberProfiles(root, new string('a', 64), firstUser, firstScope, secondUser, secondScope, firstIdentity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "发布对账");
                Check(VisibleText(window).Contains("完整服务快照 101 条", StringComparison.Ordinal) && VisibleText(window).Contains("当前筛选 101 条", StringComparison.Ordinal),
                    "offline reconciliation confused the full service count with its local filter count");
                Check(VisibleText(window).Contains("未配置", StringComparison.Ordinal) && VisibleText(window).Contains("缺号候选", StringComparison.Ordinal),
                    "native reconciliation invented a schedule or omitted conservative insurance-gap context");
                await ClickAsync(window, "对账下一页");
                Check(VisibleText(window).Contains("第 2 页", StringComparison.Ordinal), "native reconciliation did not advance beyond its bounded first page");
                await SelectListItemAsync(window, "甲分页末尾未知记录");
                Check(ReconciliationNativeText(window).Contains("甲原始未知样本不能跨账号泄漏", StringComparison.Ordinal) &&
                    Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().All(box => box.IsReadOnly),
                    "the native summary preview omitted original unknown/sample evidence or exposed writable raw data");
                await ClickAsync(window, "返回发布对账");
                foreach (var key in new[] { "status", "run_date", "slot", "writer" }) SetReconciliationFilter(window, key, "unknown");
                SetReconciliationFilter(window, "account_id", "synthetic-recon-a");
                SetReconciliationFilter(window, "q", "末尾未知"); SetReconciliationFilter(window, "has_warnings", "false");
                SetReconciliationFilter(window, "has_pending_verify", "false");
                await ClickAsync(window, "筛选对账记录");
                Check(VisibleText(window).Contains("当前筛选 0 条", StringComparison.Ordinal), "the explicit verified filter silently treated unknown metadata as complete");
                SetReconciliationFilter(window, "has_pending_verify", "unknown"); await ClickAsync(window, "筛选对账记录");
                Check(VisibleText(window).Contains("当前筛选 1 条", StringComparison.Ordinal) && VisibleText(window).Contains("甲分页末尾未知记录", StringComparison.Ordinal),
                    "combined account/date/status/slot/writer/query filters did not retain the one unknown record");
                await ClickAsync(window, "清空筛选");
                SetReconciliationFilter(window, "has_pending_verify", "unknown"); await ClickAsync(window, "筛选对账记录");
                Check(VisibleText(window).Contains("当前筛选 1 条", StringComparison.Ordinal) && VisibleText(window).Contains("甲分页末尾未知记录", StringComparison.Ordinal),
                    "the explicit unknown verification choice behaved as all records or excluded the unknown original");
                SetReconciliationFilter(window, "has_pending_verify", ""); await ClickAsync(window, "筛选对账记录");
                Check(VisibleText(window).Contains("当前筛选 101 条", StringComparison.Ordinal), "all verification states did not restore the complete local inventory");
                SetReconciliationFilter(window, "has_warnings", "true"); SetReconciliationFilter(window, "has_pending_verify", "true");
                await ClickAsync(window, "筛选对账记录");
                Check(VisibleText(window).Contains("当前筛选 1 条", StringComparison.Ordinal) && VisibleText(window).Contains("甲保险待核一号", StringComparison.Ordinal),
                    "warning and pending filters did not select the explicitly pending insurance record");
                await ReadReconciliationCopyAsync(window, "查看完整对账副本", "甲原始未知样本不能跨账号泄漏");
                Check(Engine(window).Snapshot.Outbox.Single().Id == operation.Id && Engine(window).Snapshot.Outbox.Single().BodyJson == operation.BodyJson &&
                    Engine(window).Snapshot.Drafts[draftKey].Text == draft.Text && (await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBytes),
                    "readonly reconciliation changed local work or stored its filtered view over the full snapshot");
                SaveEvidence(window, "reconciliation-private-filtered.png");
                await CloseAsync(window); window = await ShowAsync(root, handler); await ClickAsync(window, "发布对账");
                Check(VisibleText(window).Contains("完整服务快照 101 条", StringComparison.Ordinal), "restart lost the complete offline reconciliation cache");
                SetReconciliationFilter(window, "q", "甲保险"); SetReconciliationFilter(window, "status", "draft_saved");
                await ClickAsync(window, "筛选对账记录");
                await InvokeAsync(window, "OpenOfflineProfileAsync", secondIdentity); await ClickAsync(window, "发布对账");
                Check(ReconciliationFilterValue(window, "q") == "" && ReconciliationFilterValue(window, "status") == "" &&
                    ReconciliationFilterValue(window, "account_id") == "" && VisibleText(window).Contains("乙私有独立对账原件", StringComparison.Ordinal) &&
                    !ReconciliationNativeText(window).Contains("甲保险", StringComparison.Ordinal) && !ReconciliationNativeText(window).Contains("甲原始未知样本", StringComparison.Ordinal),
                    "switching private profiles retained A's filters, results, or sample evidence in B");
                Check((await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBytes) && (await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBytes),
                    "readonly reconciliation or profile switching changed an encrypted business workspace");
                Check(handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0,
                    "offline reconciliation filtering paging preview or profile changes requested HTTP or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ReconciliationRefreshPreservesStateAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin();
            var accounts = ReconciliationAccounts("synthetic-recon-a", "synthetic-recon-insurance");
            var rows = ReconciliationRows("正常读取").Take(4).ToArray();
            handler.Responses["/api/v1/accounts"] = Wrap(accounts.DeepClone());
            handler.Responses["/api/v1/article-reconciliation"] = Wrap(ReconciliationData(rows));
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "发布对账"); await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected"), "the synthetic allowed business scope failed to connect for native reconciliation");
                var key = "synthetic-reconciliation-refresh-draft";
                var draft = AppDraft("history", key, new JsonObject(), Object(("text", "坏响应之前的中文草稿必须保留 🐟")));
                await Engine(window).SaveDraftAsync(draft);
                var path = "/api/v1/todos/" + Guid.NewGuid().ToString();
                var queued = new PendingOperation { Method = "PATCH", ResourceKey = path, Path = path,
                    BodyJson = Object(("version", 1), ("completed", true)).ToJsonString() };
                await Engine(window).QueueAsync(queued);
                await ClickAsync(window, "刷新完整对账");
                var before = Engine(window).Snapshot;
                Check(before.Cache.ContainsKey("/api/v1/article-reconciliation") && VisibleText(window).Contains("完整服务快照 4 条", StringComparison.Ordinal),
                    "a complete native reconciliation batch was not shown and durably cached");
                var cached = before.Cache["/api/v1/article-reconciliation"]; var cachedAccounts = before.Cache["/api/v1/accounts"];
                var meta = JsonNode.Parse(cached)?["_local_reconciliation"];
                Check(meta is JsonObject metadata && metadata["scope_id"]?.GetValue<string>() == handler.Scope && metadata["account_ids"] is JsonArray &&
                    !string.IsNullOrWhiteSpace(metadata["observed_at_utc"]?.GetValue<string>()),
                    "native reconciliation refresh omitted its observed scope/account evidence");
                var inconsistent = ReconciliationData(rows); inconsistent["counts"]!["published"] = 400;
                var changedAccounts = accounts.DeepClone().AsArray(); changedAccounts[0]!["name"] = "坏批次账号名称不能部分覆盖";
                handler.Responses["/api/v1/accounts"] = Wrap(changedAccounts);
                handler.Responses["/api/v1/article-reconciliation"] = Wrap(inconsistent);
                await ClickAsync(window, "刷新完整对账");
                var after = Engine(window).Snapshot;
                Check(after.Cache["/api/v1/article-reconciliation"] == cached && after.Cache["/api/v1/accounts"] == cachedAccounts,
                    "an inconsistent complete=true response partially replaced the full snapshot or its paired account catalog");
                Check(after.Drafts[key].Text == before.Drafts[key].Text && JsonSerializer.Serialize(after.Outbox) == JsonSerializer.Serialize(before.Outbox),
                    "rejecting an inconsistent reconciliation response changed the local draft or durable request");
                Check(VisibleText(window).Contains("完整服务快照 4 条", StringComparison.Ordinal) && !ReconciliationNativeText(window).Contains("坏批次账号名称", StringComparison.Ordinal),
                    "a rejected refresh discarded the last valid view or displayed inconsistent batch content");
                Check(handler.WriteCalls == 0 && sockets.Connects == 0, "reconciliation refresh sent queued work or opened a socket");
                await CloseAsync(window); var previousCalls = handler.Calls; window = await ShowAsync(root, handler);
                await ClickAsync(window, "发布对账");
                Check(Engine(window).Snapshot.Cache["/api/v1/article-reconciliation"] == cached &&
                    VisibleText(window).Contains("完整服务快照 4 条", StringComparison.Ordinal) && handler.Calls == previousCalls,
                    "restart after a rejected reconciliation batch lost the full cache or silently retried HTTP");
                Check(Engine(window).Snapshot.Drafts[key].Text == before.Drafts[key].Text && Engine(window).Snapshot.Outbox.Single().Id == queued.Id,
                    "restart after inconsistent reconciliation lost the draft or queued operation identity");
                SaveEvidence(window, "reconciliation-bad-refresh-preserves-complete-cache.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static JsonObject[] ReconciliationRows(string prefix)
    {
        var rows = Enumerable.Range(0, 100).Select(index => ReconciliationRow("recon-" + index.ToString("D4", System.Globalization.CultureInfo.InvariantCulture),
            "synthetic-recon-a", prefix + "合成文章 " + index.ToString("D4", System.Globalization.CultureInfo.InvariantCulture), "published", "tt1", "dedao", "2026-11-04")).ToList();
        rows[0] = ReconciliationRow("recon-0000", "synthetic-recon-insurance", prefix + "保险待核一号", "draft_saved", "gzh", "human", "2026-11-04", 1,
            pending: true, warnings: ["DRAFT_CREDENTIAL_MISSING"]);
        rows[1] = ReconciliationRow("recon-0001", "synthetic-recon-insurance", prefix + "保险已发布重复一号", "published", "gzh", "human", "2026-11-04", 1);
        rows[2] = ReconciliationRow("recon-0002", "synthetic-recon-insurance", prefix + "保险受阻四号", "failed", "gzh", "human", "2026-11-04", 4);
        rows.Add(ReconciliationRow("recon-0100", "synthetic-recon-a", prefix + "分页末尾未知记录", null, null, null, null, pending: null,
            sample: Object(("title", prefix + "原始未知样本不能跨账号泄漏"), ("future_sample", Object(("preserve", true), ("reads", 0))))));
        return rows.ToArray();
    }

    private static JsonObject ReconciliationRow(string id, string account, string title, string? status, string? slot, string? writer, string? date,
        long? series = null, bool? pending = false, string[]? warnings = null, JsonObject? sample = null)
    {
        var row = Object(("id", id), ("account_id", account), ("title", title), ("status", status), ("slot", slot), ("writer", writer), ("run_date", date),
            ("series_no", series.HasValue ? JsonValue.Create(series.Value) : null), ("sample", sample?.DeepClone()),
            ("warnings", new JsonArray((warnings ?? []).Select(value => (JsonNode?)JsonValue.Create(value)).ToArray())),
            ("has_pending_verify", pending.HasValue ? JsonValue.Create(pending.Value) : null), ("verify_state", pending == null ? "unknown" : pending == true ? "pending" : "complete"));
        row["missing_fields"] = new JsonArray(new[] { "run_date", "status", "slot", "writer" }.Concat(slot == "gzh" ? ["series_no"] : [])
            .Where(field => row[field] == null || row[field]!.ToString() == "unknown").Select(field => (JsonNode?)JsonValue.Create(field)).ToArray());
        return row;
    }

    // Independent source-contract fixture generation; it does not call the UI/parser implementation to manufacture expected counts.
    private static JsonObject ReconciliationData(IReadOnlyList<JsonObject> source)
    {
        var statuses = new[] { "drafting", "illustrated", "draft_saved", "published", "failed", "unknown" };
        string? Read(JsonObject row, string name) => row[name]?.GetValue<string>();
        JsonObject Counts(IEnumerable<JsonObject> rows)
        {
            var items = rows.ToArray();
            return Object(statuses.Select(status => (status, (JsonNode?)JsonValue.Create(items.Count(row => (Read(row, "status") ?? "unknown") == status)))).ToArray());
        }
        var insurance = source.Where(row => Read(row, "slot") == "gzh").ToArray();
        var numbers = insurance.Where(row => row["series_no"] != null).GroupBy(row => row["series_no"]!.GetValue<long>()).OrderBy(group => group.Key).ToArray();
        var gaps = new JsonArray();
        for (var index = 1; index < numbers.Length; index++)
            if (numbers[index].Key > numbers[index - 1].Key + 1) gaps.Add(Object(("from", numbers[index - 1].Key + 1), ("to", numbers[index].Key - 1)));
        return Object(("complete", true), ("total", source.Count), ("rows", new JsonArray(source.Select(row => row.DeepClone()).ToArray())), ("counts", Counts(source)),
            ("dates", new JsonArray(source.GroupBy(row => Read(row, "run_date") ?? "", StringComparer.Ordinal).OrderBy(group => group.Key.Length == 0 ? "z" : group.Key, StringComparer.Ordinal)
                .Select(group => (JsonNode?)Object(("date", group.Key.Length == 0 ? null : group.Key), ("count", group.Count()))).ToArray())),
            ("schedule", Object(("configured", false), ("expected", null), ("missing", null), ("overdue", null))),
            ("insurance", Object(("basis", "explicit_gzh_slot"), ("recorded", insurance.Length), ("numbered", insurance.Count(row => row["series_no"] != null)),
                ("unique_count", numbers.Length), ("highest", numbers.Length == 0 ? null : JsonValue.Create(numbers[^1].Key)),
                ("lowest", numbers.Length == 0 ? null : JsonValue.Create(numbers[0].Key)),
                ("duplicate_numbers", new JsonArray(numbers.Where(group => group.Count() > 1).Select(group => (JsonNode?)Object(("number", group.Key),
                    ("article_ids", new JsonArray(group.Select(row => (JsonNode?)JsonValue.Create(Read(row, "id"))).ToArray())))).ToArray())),
                ("observed_gap_ranges", gaps), ("start", null), ("target", null), ("sample_mapping", "unknown"), ("counts", Counts(insurance)))));
    }

    private static JsonArray ReconciliationAccounts(params string[] ids) => new(ids.Select(id => (JsonNode?)Object(("id", id),
        ("name", id == "synthetic-recon-b" ? "乙合成账号" : id.Contains("insurance", StringComparison.Ordinal) ? "甲保险账号" : "甲合成账号"),
        ("platform", id.Contains("insurance", StringComparison.Ordinal) ? "wechat" : "toutiao"))).ToArray());

    private static async Task<string> SeedReconciliationWorkspaceAsync(string root, string identity, string serverScope, JsonArray accounts,
        IReadOnlyList<JsonObject> rows, LocalDraft? draft = null, PendingOperation? operation = null)
    {
        using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector());
        var report = Object(("data", ReconciliationData(rows)), ("_local_reconciliation", Object(("scope_id", serverScope),
            ("account_ids", new JsonArray(accounts.Select(account => (JsonNode?)JsonValue.Create(account!["id"]!.GetValue<string>())).ToArray())),
            ("observed_at_utc", "2026-11-04T20:00:00.000Z"))));
        var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
        state.Cache["/api/v1/accounts"] = Wrap(accounts.DeepClone()); state.Cache["/api/v1/article-reconciliation"] = report.ToJsonString();
        foreach (var key in state.Cache.Keys) state.CacheRevisions[key] = 1;
        if (draft != null) state.Drafts[draft.Key] = draft; if (operation != null) state.Outbox.Add(operation);
        await store.SaveAsync(state); return store.FilePath;
    }

    private static FrameworkElement ReconciliationFilter(MainWindow window, string key)
    {
        var controls = Descendants(Field<StackPanel>(window, "page")).OfType<FrameworkElement>()
            .Where(control => control.Tag?.ToString() == key && control is TextBox or ComboBox).ToArray();
        Check(controls.Length == 1, "native reconciliation filter is missing or ambiguous: " + key); return controls[0];
    }
    private static void SetReconciliationFilter(MainWindow window, string key, string value)
    {
        if (ReconciliationFilter(window, key) is TextBox box) box.Text = value;
        else if (ReconciliationFilter(window, key) is ComboBox combo) combo.SelectedValue = value;
    }
    private static string ReconciliationFilterValue(MainWindow window, string key) => ReconciliationFilter(window, key) switch
    { TextBox box => box.Text, ComboBox combo => combo.SelectedValue?.ToString() ?? "", _ => throw new InvalidOperationException("Reconciliation filter is not a native editor.") };
    private static string ReconciliationNativeText(MainWindow window) => string.Join("\n", Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Select(block => block.Text)
        .Concat(Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Select(box => box.Text)));

    private static async Task ReadReconciliationCopyAsync(MainWindow owner, string action, string expectedText)
    {
        var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = owner.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            Window? dialog = null;
            try
            {
                dialog = Application.Current.Windows.OfType<Window>().Single(window => window != owner && window.IsVisible && window.Owner == owner);
                var box = Descendants(dialog).OfType<TextBox>().Single();
                Check(box.IsReadOnly && box.Text.Contains(expectedText, StringComparison.Ordinal), "native reconciliation copy omitted complete read-only evidence");
                finished.SetResult();
            }
            catch (Exception error) { finished.SetException(error); }
            finally { if (dialog?.IsVisible == true) dialog.Close(); }
        });
        await ClickAsync(owner, action); await finished.Task;
    }
}
