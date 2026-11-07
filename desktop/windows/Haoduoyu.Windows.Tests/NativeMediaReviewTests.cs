using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> MediaReviewCases =>
    [
        ("Shown native media review sends exact scoped read queries and separates true zero missing coverage daily increments snapshots and distinct due nodes", () => RunWithDispatcher(MediaReviewTransportAsync)),
        ("Shown native media review isolates private exact-query offline copies and retains cache drafts and immutable requests after invalid input malformed bounded cancelled or foreign-scope reads", () => RunWithDispatcher(MediaReviewPreservationAsync)),
        ("Shown native media review summaries export readonly provenance and require a complete article before continuing the original draft without releasing unknown requests", () => RunWithDispatcher(MediaReviewArticleAsync))
    ];

    private static async Task MediaReviewTransportAsync()
    {
        var fixture = ReadMediaReviewFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new MediaReviewOrigin(fixture);
            var identity = "public:" + origin.Scope;
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal) { ["/api/v1/accounts"] = fixture.AccountsJson });
            RememberMediaPublicProfile(root, origin.Scope, identity);
            var window = await ShowMediaReviewWindowAsync(root, origin);
            try
            {
                await ClickAsync(window, "数据复盘"); await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected") && origin.BusinessPaths.Count == 0, "opening or connecting native media review implicitly fetched a report");
                var seven = fixture.Sample("overview-7d-all"); await SetMediaReviewQueryAsync(window, seven.Path);
                Check(origin.BusinessPaths.SequenceEqual(new[] { seven.Path }) && MediaControl<DataGrid>(window, "media-review-accounts").IsReadOnly,
                    "the shown overview did not use its one exact canonical GET or exposed writable results");
                var sevenView = Field<MediaReviewView>(window, "activeMediaReviewView");
                var sevenAccountRows = MediaGridRows(window, "media-review-accounts");
                Check(sevenView.Query.Path == seven.Path && sevenAccountRows.Count > 1 && MediaReviewPageText(window).Contains("覆盖", StringComparison.Ordinal),
                    "the native overview lost its exact query distinct accounts or coverage presentation");
                var raw = sevenView.Data;
                var tt = raw["accounts"]!.AsArray().OfType<JsonObject>().Single(row => row["id"]!.GetValue<string>() == fixture.Tt);
                Check(JsonTestValue.Integer(tt["period_metrics"]?["reads"]) == 60 && tt["coverage"]?["source"]?.GetValue<string>() == "account" &&
                    MediaCells(sevenAccountRows.Single(row => MediaSource(row).AccountId == fixture.Tt))["likes"] == "0",
                    "the native overview replaced an account's true zero with its article-detail increments or rendered zero as missing");
                var zh = raw["accounts"]!.AsArray().OfType<JsonObject>().Single(row => row["id"]!.GetValue<string>() == fixture.Zh);
                Check(JsonTestValue.Integer(zh["period_metrics"]?["approvals"]) == 0 && zh["period_metrics"]?["likes"] == null,
                    "the source-derived native overview conflated separate approval and like metrics");
                var zhCells = MediaCells(sevenAccountRows.Single(row => MediaSource(row).AccountId == fixture.Zh));
                Check(zhCells["likes"].StartsWith("未取得", StringComparison.Ordinal) && zhCells["approvals"] == "0",
                    "the native overview silently filled a missing metric with a numeric zero");
                var trendRows = MediaGridRows(window, "media-review-trend");
                Check(trendRows.Count > 0 && trendRows.Any(row => MediaCells(row).Values.Any(value => value.Contains("未取得", StringComparison.Ordinal))),
                    "the native daily trend synthesized zero for absent recorded daily data");
                Check(trendRows.Where(row => MediaSource(row).Coverage?.Source == "missing").All(row => MediaCells(row)["reads"].StartsWith("未取得", StringComparison.Ordinal)) &&
                    trendRows.Any(row => MediaSource(row).Coverage?.Source == "missing"), "an absent daily source was displayed as a synthesized numeric trend point");
                var trueZeroDay = trendRows.Single(row => MediaSource(row).AccountId == fixture.Tt && MediaCells(row)["date"] == fixture.LastCompleteDay);
                Check(MediaCells(trueZeroDay)["reads"] == "0" && MediaSource(trueZeroDay).Coverage?.Source == "account",
                    "the recorded account-wide zero was replaced by its same-day article increments in the native daily trend");
                await SetMediaReviewQueryAsync(window, fixture.Sample("overview-30d-all").Path);
                Check(Field<MediaReviewView>(window, "activeMediaReviewView").Data["window"]?["days"]?.GetValue<int>() == 30,
                    "the native overview narrowed a valid thirty-day response or reused its seven-day cache");
                await SetMediaReviewQueryAsync(window, fixture.Sample("overview-7d-zhihu-top1-only").Path);
                var topView = Field<MediaReviewView>(window, "activeMediaReviewView");
                Check(topView.Data["accounts"]!.AsArray().Count == raw["accounts"]!.AsArray().Count &&
                    JsonTestValue.Integer(topView.Data["cumulative"]?["article_count"]) == JsonTestValue.Integer(raw["cumulative"]?["article_count"]) &&
                    MediaGridRows(window, "media-review-top").Count == 1 && MediaSource(MediaGridRows(window, "media-review-top").Single()).Data["platform"]?.GetValue<string>() == "zhihu" &&
                    topView.Overview!.PlatformComparison.Count > 1,
                    "a Top-platform selection filtered whole-workspace account totals or platform comparisons instead of only its ranking");
                await SetMediaReviewQueryAsync(window, fixture.Sample("due-all-three-targets").Path);
                var due = MediaGridRows(window, "media-review-rows").Where(row => MediaSource(row).ArticleId == fixture.Candidate).ToArray();
                Check(due.Length == 3 && due.Select(row => MediaSource(row).Kind).Order(StringComparer.Ordinal).SequenceEqual(new[] { "d1", "d3", "d7" }),
                    "the native due list collapsed three distinct observation nodes for the same article");
                await SetMediaReviewQueryAsync(window, fixture.Sample("observations-account-and-article").Path);
                Check(MediaGridRows(window, "media-review-rows").All(row => MediaSource(row).ArticleId == fixture.Candidate) &&
                    MediaGridRows(window, "media-review-rows").Any(row => MediaCells(row).Values.Any(value => value.Contains("未取得", StringComparison.Ordinal))),
                    "the native snapshot query lost its article constraint or filled sparse snapshot metrics");
                await SetMediaReviewQueryAsync(window, fixture.Sample("daily-tt-seven-range").Path);
                var daily = MediaGridRows(window, "media-review-rows");
                Check(daily.Any(row => MediaSource(row).ArticleId == null) && daily.Any(row => MediaSource(row).ArticleId == fixture.Candidate) &&
                    daily.Any(row => MediaCells(row).Values.Any(value => value.Contains("账号整体", StringComparison.Ordinal))) &&
                    daily.Any(row => MediaCells(row).Values.Any(value => value.Contains("文章", StringComparison.Ordinal))),
                    "the native daily table merged account-wide records with article detail or omitted their distinct source labels");
                Check(daily.Any(row => MediaSource(row).ArticleId == fixture.Candidate && MediaSource(row).Date?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) == fixture.LastCompleteDay &&
                    MediaCells(row)["reads"] == "900") && daily.Any(row => MediaSource(row).ArticleId == null &&
                    MediaSource(row).Date?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) == fixture.LastCompleteDay && MediaCells(row)["reads"] == "0"),
                    "the real account-zero/article-900 fixture was not separately retained in the native daily table");
                Check(origin.BusinessPaths.Count == 6 && origin.ScopeCalls >= origin.BusinessPaths.Count + 1 && origin.HeaderChecks >= origin.BusinessPaths.Count &&
                    origin.WriteCalls == 0 && sockets.Connects == 0, "native media review skipped scope checks changed its fixed-origin read headers wrote business data or opened a socket");
                SaveEvidence(window, "media-review-native-queries-null-zero-coverage.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task MediaReviewPreservationAsync()
    {
        var fixture = ReadMediaReviewFixture(); var seven = fixture.Sample("overview-7d-all");
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            const string owner = "10000000-0000-4000-8000-000000000901", other = "10000000-0000-4000-8000-000000000902";
            var scope = new string('b', 64); var otherScope = new string('c', 64); var identity = "user:" + owner + ":" + scope; var otherIdentity = "user:" + other + ":" + otherScope;
            var firstJson = MediaWithFirstAccountName(seven.Json, "甲账号仅本机复盘"); var secondJson = MediaWithFirstAccountName(seven.Json, "乙账号独立复盘");
            var draft = AppDraft("history", "media-private-unrelated-draft", new JsonObject(), Object(("text", "复盘只读不能改写的私有中文草稿 🐟")));
            var pending = MediaUnknown(fixture.Candidate);
            var path = await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal)
            { ["/api/v1/accounts"] = fixture.AccountsJson, [seven.Path] = firstJson }, draft, pending);
            var otherPath = await SeedCalendarWorkspaceAsync(root, otherIdentity, new Dictionary<string, string>(StringComparer.Ordinal)
            { ["/api/v1/accounts"] = fixture.AccountsJson, [seven.Path] = secondJson });
            var bytes = await File.ReadAllBytesAsync(path); var otherBytes = await File.ReadAllBytesAsync(otherPath);
            RememberProfiles(root, new string('a', 64), owner, scope, other, otherScope, identity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "数据复盘"); await SetMediaReviewQueryAsync(window, seven.Path);
                Check(MediaReviewPageText(window).Contains("甲账号仅本机复盘", StringComparison.Ordinal), "private offline media review failed to use its exact cached query");
                await SetMediaReviewQueryAsync(window, fixture.Sample("overview-30d-all").Path);
                Check(Field<MediaReviewView?>(window, "activeMediaReviewView") == null && !MediaReviewPageText(window).Contains("甲账号仅本机复盘", StringComparison.Ordinal),
                    "an uncached exact thirty-day query reused unrelated seven-day rows as complete results");
                await SetMediaReviewQueryAsync(window, seven.Path); await CloseAsync(window); window = await ShowAsync(root, handler);
                await ClickAsync(window, "数据复盘"); await SetMediaReviewQueryAsync(window, seven.Path);
                Check(MediaReviewPageText(window).Contains("甲账号仅本机复盘", StringComparison.Ordinal), "reopening lost a private exact-query media copy");
                await InvokeAsync(window, "OpenOfflineProfileAsync", otherIdentity); await ClickAsync(window, "数据复盘");
                Check(MediaControl<ComboBox>(window, "media-review-period").SelectedValue?.ToString() == "yesterday" &&
                    !MediaReviewPageText(window).Contains("甲账号仅本机复盘", StringComparison.Ordinal), "switching private profiles retained a foreign report or its period selection");
                await SetMediaReviewQueryAsync(window, seven.Path);
                Check(MediaReviewPageText(window).Contains("乙账号独立复盘", StringComparison.Ordinal) && !MediaReviewPageText(window).Contains("甲账号仅本机复盘", StringComparison.Ordinal) &&
                    Engine(window).Snapshot.Drafts.Count == 0 && Engine(window).Snapshot.Outbox.Count == 0 &&
                    (await File.ReadAllBytesAsync(path)).SequenceEqual(bytes) && (await File.ReadAllBytesAsync(otherPath)).SequenceEqual(otherBytes) &&
                    handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0,
                    "offline filters restart or profile selection mixed private rows changed a business file or requested transport");
                SaveEvidence(window, "media-review-private-offline-exact-query.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new MediaReviewOrigin(fixture);
            var identity = "public:" + origin.Scope; var draft = AppDraft("history", "media-failure-protected-draft", new JsonObject(), Object(("text", "所有读取失败仍保留原中文稿 🐟")));
            var pending = MediaUnknown(fixture.Candidate);
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal) { ["/api/v1/accounts"] = fixture.AccountsJson, [seven.Path] = seven.Json }, draft, pending);
            RememberMediaPublicProfile(root, origin.Scope, identity); var window = await ShowMediaReviewWindowAsync(root, origin);
            try
            {
                await ClickAsync(window, "数据复盘"); await ClickAsync(window, "连接并刷新"); await SetMediaReviewQueryAsync(window, seven.Path);
                var accepted = Engine(window).Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                var calls = origin.BusinessPaths.Count;
                MediaControl<TextBox>(window, "media-review-top-n").Text = "0"; await MediaClickAsync(window, "media-review-apply");
                Check(origin.BusinessPaths.Count == calls && Field<MediaReviewView>(window, "activeMediaReviewView").Query.Path == seven.Path,
                    "an invalid native Top N triggered transport or replaced the last accepted query");
                MediaControl<TextBox>(window, "media-review-top-n").Text = "10";
                foreach (var rejected in new[] { "{\"data\":{}}", "{\"data\":" + new string(' ', 1024 * 1024 + 32) + "{}}" })
                {
                    origin.Overrides[seven.Path] = (HttpStatusCode.OK, rejected); await MediaClickAsync(window, "media-review-refresh");
                    await AssertMediaRetainedAsync(window, accepted, bytes, draft, pending, "malformed or over-budget response");
                }
                origin.Overrides[seven.Path] = (HttpStatusCode.ServiceUnavailable, "{\"error\":{\"code\":\"SYNTHETIC_OFFLINE\",\"message\":\"isolated failure\"}}");
                await MediaClickAsync(window, "media-review-refresh"); await AssertMediaRetainedAsync(window, accepted, bytes, draft, pending, "failed service read");
                origin.Overrides.Remove(seven.Path); origin.HoldPath = seven.Path; origin.Hold = new(TaskCreationOptions.RunContinuationsAsynchronously);
                var beforeCancel = origin.BusinessPaths.Count; MediaStartClick(window, "media-review-refresh");
                await UntilAsync(() => origin.BusinessPaths.Count > beforeCancel, "native media cancellation did not reach the synthetic transport");
                Descendants(window).OfType<Button>().Single(button => button.Content?.ToString() == "取消当前操作").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await window.WaitForIdleAsync(); origin.Hold.TrySetResult(true); origin.Hold = null; origin.HoldPath = null;
                Check(origin.CancelledReads > 0, "shown media cancel did not cancel the real WorkbenchApi token");
                await AssertMediaRetainedAsync(window, accepted, bytes, draft, pending, "cancelled report");
                origin.ChangeScopeAfterPath = seven.Path; await MediaClickAsync(window, "media-review-refresh");
                await AssertMediaRetainedAsync(window, accepted, bytes, draft, pending, "late foreign workspace");
                Check(!Field<bool>(window, "connected") && origin.WriteCalls == 0 && sockets.Connects == 0,
                    "scope drift left media reads trusted performed a business write or opened a real socket");
                SaveEvidence(window, "media-review-read-failures-preserve-work.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task MediaReviewArticleAsync()
    {
        var fixture = ReadMediaReviewFixture(); var due = fixture.Sample("due-all-three-targets"); var detail = fixture.Sample("candidate-detail");
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new MediaReviewOrigin(fixture); var identity = "public:" + origin.Scope;
            var key = "/api/v1/articles/" + fixture.Candidate; var full = JsonNode.Parse(detail.Json)!["data"]!.AsObject();
            var original = (JsonObject)full.DeepClone(); original["version"] = 4;
            var values = (JsonObject)original.DeepClone(); values["title"] = "复盘入口继续同一份中文文章草稿 🐟";
            var draft = AppDraft("article", key, original, values);
            var newer = (JsonObject)full.DeepClone(); newer["version"] = 7;
            origin.Overrides[key] = (HttpStatusCode.OK, Wrap(newer));
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal) { ["/api/v1/accounts"] = fixture.AccountsJson, [due.Path] = due.Json }, draft);
            RememberMediaPublicProfile(root, origin.Scope, identity); var window = await ShowMediaReviewWindowAsync(root, origin);
            var unknown = MediaUnknown(fixture.Candidate);
            try
            {
                await ClickAsync(window, "数据复盘"); await SetMediaReviewQueryAsync(window, due.Path);
                var view = Field<MediaReviewView>(window, "activeMediaReviewView");
                var copyMethod = typeof(MainWindow).GetMethod("MediaReviewReadonlyCopy", BindingFlags.Static | BindingFlags.NonPublic) ?? throw new MissingMethodException("MediaReviewReadonlyCopy");
                var copy = (JsonObject)(copyMethod.Invoke(null, [view]) ?? throw new InvalidOperationException("media readonly export returned no copy"));
                Check(copy["query_path"]?.GetValue<string>() == due.Path && copy["readonly"]?.GetValue<bool>() == true &&
                    copy["source"]?.GetValue<string>().Contains("只读", StringComparison.Ordinal) == true && copy["original_response"] is JsonObject,
                    "the actual export builder omitted readonly provenance or the exact source query");
                var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                await SelectMediaRowAsync(window, "media-review-rows", row => row.ArticleId == fixture.Candidate && row.Kind == "d1");
                AssertMediaReadonlyDetail(window);
                Check(origin.BusinessPaths.Count == 0 && Engine(window).Snapshot.Drafts[key].Text == draft.Text &&
                    (await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(bytes),
                    "selecting a due summary fetched detail changed an article draft or persisted write intent");
                await ClickAsync(window, "数据复盘"); await ClickAsync(window, "连接并刷新"); await SetMediaReviewQueryAsync(window, due.Path);
                await SelectMediaRowAsync(window, "media-review-rows", row => row.ArticleId == fixture.Candidate && row.Kind == "d3");
                await MediaClickAsync(window, "media-review-open-article");
                Check(origin.BusinessPaths.Contains(key, StringComparer.Ordinal) && Field<TextBlock>(window, "heading").Text == "文章流水线详情" &&
                    Engine(window).Snapshot.Drafts[key].BaseVersion == 4 && SavedAppDraft(Engine(window), key)["values"]?["title"]?.GetValue<string>() == values["title"]!.GetValue<string>() &&
                    origin.WriteCalls == 0, "a media summary bypassed the full article read rebased the draft or wrote business data");
                await ClickAsync(window, "返回原稿编辑");
                Check(PipelineValue(window, "title") == values["title"]!.GetValue<string>() && Engine(window).Snapshot.Drafts[key].BaseVersion == 4 &&
                    JsonTestValue.Integer(SavedAppDraft(Engine(window), key)["original"]?["version"]) == 4 && Engine(window).Snapshot.Outbox.Count == 0,
                    "media detail continuation forked the original draft key discarded its Chinese input or changed its original CAS version");
                SaveEvidence(window, "media-review-summary-full-article-same-draft.png");
                await CloseAsync(window);
                using (var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector()))
                {
                    var state = await store.LoadAsync(); await store.SaveAsync(state with { LocalRevision = state.LocalRevision + 1, Outbox = [unknown] });
                }
                var beforeReopen = origin.BusinessPaths.Count; window = await ShowMediaReviewWindowAsync(root, origin);
                await ClickAsync(window, "数据复盘"); await SetMediaReviewQueryAsync(window, due.Path);
                await SelectMediaRowAsync(window, "media-review-rows", row => row.ArticleId == fixture.Candidate && row.Kind == "d7");
                AssertMediaReadonlyDetail(window);
                var inspected = false;
                ExerciseOwnedDialog(window, "读取原文章完整详情", dialog =>
                {
                    var description = string.Join("\n", Descendants(dialog).OfType<TextBlock>().Select(block => block.Text));
                    var options = Descendants(dialog).OfType<Button>().Select(button => button.Content?.ToString()).ToArray();
                    Check(dialog.Title == "同步操作" && description.Contains(key, StringComparison.Ordinal) && description.Contains("结果未知", StringComparison.Ordinal) &&
                        options.Contains("只读核对保存回执", StringComparer.Ordinal) && options.Contains("查看原请求和响应", StringComparer.Ordinal) &&
                        !options.Contains("取消尚未发送的操作", StringComparer.Ordinal),
                        "the unknown media article did not show its original guarded request inspector");
                    inspected = true;
                });
                await window.WaitForIdleAsync();
                var retained = Engine(window).Snapshot.Outbox.Single();
                Check(inspected && retained.Id == unknown.Id && retained.BodyJson == unknown.BodyJson && retained.Status == PendingStatus.Unknown && retained.SendAttempts == 1 &&
                    origin.BusinessPaths.Count == beforeReopen && origin.WriteCalls == 0 && Engine(window).Snapshot.Drafts[key].BaseVersion == 4 &&
                    SavedAppDraft(Engine(window), key)["values"]?["title"]?.GetValue<string>() == values["title"]!.GetValue<string>() && sockets.Connects == 0,
                    "opening a media summary released the original unknown request fetched over its evidence or lost the existing draft");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static T MediaControl<T>(MainWindow window, string id) where T : FrameworkElement => Descendants(Field<StackPanel>(window, "page")).OfType<T>()
        .Single(control => AutomationProperties.GetAutomationId(control) == id);
    private static void MediaStartClick(MainWindow window, string id)
    { var button = MediaControl<Button>(window, id); Check(button.IsEnabled, "native media action disabled: " + id); button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); }
    private static async Task MediaClickAsync(MainWindow window, string id)
    { MediaStartClick(window, id); await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout(); }
    private static async Task SetMediaReviewQueryAsync(MainWindow window, string path)
    {
        var query = MediaReviewQuery.Parse(path); var route = path.Split('?')[0];
        MediaControl<TabControl>(window, "media-review-tabs").SelectedIndex = route switch { "/api/v1/overview" => 0, "/api/v1/due-reviews" => 1, "/api/v1/observations" => 2, _ => 3 };
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle);
        MediaControl<ComboBox>(window, "media-review-account").SelectedValue = query.AccountId ?? "";
        if (route == "/api/v1/overview")
        {
            MediaControl<ComboBox>(window, "media-review-period").SelectedValue = query.Period;
            MediaControl<TextBox>(window, "media-review-top-n").Text = query.TopN.ToString(System.Globalization.CultureInfo.InvariantCulture);
            MediaControl<ComboBox>(window, "media-review-top-platform").SelectedValue = query.TopPlatform ?? "";
        }
        else if (route == "/api/v1/observations") MediaControl<TextBox>(window, "media-review-article-id").Text = query.ArticleId ?? "";
        else if (route == "/api/v1/daily-metrics")
        {
            MediaControl<TextBox>(window, "media-review-from").Text = query.From?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) ?? "";
            MediaControl<TextBox>(window, "media-review-to").Text = query.To?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) ?? "";
        }
        await MediaClickAsync(window, "media-review-apply");
    }
    private static IReadOnlyList<object> MediaGridRows(MainWindow window, string id) => MediaControl<DataGrid>(window, id).Items.Cast<object>().ToArray();
    private static MediaReviewRow MediaSource(object row) => (MediaReviewRow)(row.GetType().GetProperty("Source")?.GetValue(row) ?? throw new MissingMemberException("MediaReviewDisplayRow.Source"));
    private static IReadOnlyDictionary<string, string> MediaCells(object row) => (IReadOnlyDictionary<string, string>)(row.GetType().GetProperty("Cells")?.GetValue(row) ?? throw new MissingMemberException("MediaReviewDisplayRow.Cells"));
    private static string MediaReviewPageText(MainWindow window) => string.Join("\n", Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Select(block => block.Text)
        .Concat(Descendants(Field<StackPanel>(window, "page")).OfType<DataGrid>().SelectMany(grid => grid.Items.Cast<object>()).SelectMany(row => MediaCells(row).Values)));
    private static async Task SelectMediaRowAsync(MainWindow window, string gridId, Func<MediaReviewRow, bool> predicate)
    {
        var grid = MediaControl<DataGrid>(window, gridId); var item = grid.Items.Cast<object>().Single(row => predicate(MediaSource(row)));
        grid.ScrollIntoView(item); window.UpdateLayout(); grid.SelectedItem = item;
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static void AssertMediaReadonlyDetail(MainWindow window)
    {
        Check(MediaControl<TextBox>(window, "media-review-detail-text").IsReadOnly && !Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Any(box => box.AcceptsReturn && !box.IsReadOnly) &&
            !Descendants(Field<StackPanel>(window, "page")).OfType<Button>().Any(button => new[] { "删除", "排队", "同步", "保存" }.Any(word => (button.Content?.ToString() ?? "").Contains(word, StringComparison.Ordinal))),
            "a native media summary exposed an editable body or direct mutation action");
    }
    private static async Task AssertMediaRetainedAsync(MainWindow window, WorkspaceState before, byte[] bytes, LocalDraft draft, PendingOperation pending, string reason)
    {
        var after = Engine(window).Snapshot;
        var shown = Field<MediaReviewView?>(window, "activeMediaReviewView");
        Check(before.Cache.Count == after.Cache.Count && before.Cache.All(pair => after.Cache.GetValueOrDefault(pair.Key) == pair.Value) &&
            shown != null && before.Cache.TryGetValue(shown.Query.Path, out var accepted) && JsonNode.DeepEquals(shown.Original, JsonNode.Parse(accepted)) &&
            after.Drafts[draft.Key].Text == draft.Text && JsonSerializer.Serialize(after.Outbox) == JsonSerializer.Serialize(new[] { pending }) &&
            (await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(bytes), reason + " changed a complete media cache draft request or encrypted business file");
    }
    private static PendingOperation MediaUnknown(string articleId)
    {
        var id = Guid.NewGuid().ToString(); var path = "/api/v1/articles/" + articleId;
        return new PendingOperation { Id = id, ResourceKey = path, Path = path, Method = "PUT", Status = PendingStatus.Unknown, SendAttempts = 1,
            BodyJson = Object(("version", 4), ("title", "必须保留精确字节与标识的未知中文文章请求 🐟")).ToJsonString() };
    }
    private static string MediaWithFirstAccountName(string json, string name)
    { var root = JsonNode.Parse(json)!.AsObject(); root["data"]!["accounts"]![0]!["name"] = name; return root.ToJsonString(); }
    private static void RememberMediaPublicProfile(string root, string scope, string identity) => RememberProfiles(root, scope,
        "10000000-0000-4000-8000-000000000903", new string('b', 64), "10000000-0000-4000-8000-000000000904", new string('c', 64), identity);
    private sealed record MediaSample(string Path, string Json);
    private sealed class MediaFixture(JsonObject root)
    {
        internal Dictionary<string, MediaSample> Samples { get; } = root["samples"]!.AsArray().OfType<JsonObject>().Where(sample => sample["status"]!.GetValue<int>() == 200)
            .ToDictionary(sample => sample["name"]!.GetValue<string>(), sample => new MediaSample(sample["path"]!.GetValue<string>(), sample["response_json"]!.GetValue<string>()), StringComparer.Ordinal);
        internal string Tt { get; } = root["accounts"]!["tt"]!.GetValue<string>();
        internal string Zh { get; } = root["accounts"]!["zh"]!.GetValue<string>();
        internal string Candidate { get; } = root["ids"]!["candidate"]!.GetValue<string>();
        internal string LastCompleteDay { get; } = root["last_complete_day"]!.GetValue<string>();
        internal MediaSample Sample(string name) => Samples.GetValueOrDefault(name) ?? throw new InvalidDataException("Missing isolated media fixture: " + name);
        internal string AccountsJson => Wrap(new JsonArray(JsonNode.Parse(Sample("overview-7d-all").Json)!["data"]!["accounts"]!.AsArray().OfType<JsonObject>()
            .Select(row => (JsonNode?)Object(("id", row["id"]!.DeepClone()), ("name", row["name"]!.DeepClone()), ("platform", row["platform"]!.DeepClone()))).ToArray()));
    }
    private static MediaFixture ReadMediaReviewFixture()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "media-review-contract-c30a8a9.json");
        var root = JsonNode.Parse(File.ReadAllText(path))!.AsObject();
        Check(root["synthetic_only"]?.GetValue<bool>() == true, "native media tests require only the isolated source-derived fixture");
        return new(root);
    }
    private static async Task<MainWindow> ShowMediaReviewWindowAsync(string root, MediaReviewOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "shown media review requires guarded application startup");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningMediaReviewOrigin(origin))) { Title = "好多鱼 · 纯合成原生数据复盘验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "synthetic media review window did not initialize");
        await window.WaitForIdleAsync(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero && ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 &&
            Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "native media regression escaped actual Show guarded startup or private data root");
        return window;
    }
    private sealed class NonOwningMediaReviewOrigin(MediaReviewOrigin origin) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request, cancellationToken); }
    private sealed class MediaReviewOrigin(MediaFixture fixture) : HttpMessageHandler
    {
        internal string Scope { get; private set; } = new('d', 64);
        internal List<string> BusinessPaths { get; } = [];
        internal int ScopeCalls { get; private set; }
        internal int HeaderChecks { get; private set; }
        internal int WriteCalls { get; private set; }
        internal int CancelledReads { get; private set; }
        internal Dictionary<string, (HttpStatusCode Status, string Json)> Overrides { get; } = new(StringComparer.Ordinal);
        internal string? HoldPath { get; set; }
        internal TaskCompletionSource<bool>? Hold { get; set; }
        internal string? ChangeScopeAfterPath { get; set; }
        internal async Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz" && request.RequestUri.IsDefaultPort &&
                request.Headers.TryGetValues("Origin", out var origins) && origins.SequenceEqual(new[] { "https://haoduoyu.xyz" }) &&
                request.Headers.TryGetValues("X-Public-Business", out var publicMode) && publicMode.SequenceEqual(new[] { "1" }) &&
                !request.Headers.Contains("Idempotency-Key") && !request.Headers.Contains("X-CSRF-Token"), "native media transport escaped its fixed public origin or GET header contract");
            HeaderChecks++; var path = request.RequestUri!.PathAndQuery;
            if (request.Method != HttpMethod.Get) WriteCalls++;
            Check(request.Method == HttpMethod.Get && request.Content == null, "readonly native media flow attempted a business mutation");
            string json; var status = HttpStatusCode.OK;
            if (path == "/api/v1/workbench-snapshot/index?version=2")
            {
                ScopeCalls++; json = Wrap(Object(("snapshot_format", "haoduoyu-workbench-snapshot-v2"), ("projection", "current"), ("complete", true), ("scope_id", Scope),
                    ("timezone", "Asia/Shanghai"), ("generated_at", "2026-11-07T20:00:00.000Z"), ("manifest_hash", new string('a', 64)),
                    ("global_content_hash", new string('b', 64)), ("index_hash", new string('a', 64)), ("entities", new JsonArray()), ("dates", new JsonArray())));
            }
            else
            {
                BusinessPaths.Add(path);
                if (path == HoldPath && Hold != null)
                    try { await Hold.Task.WaitAsync(cancellationToken); }
                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { CancelledReads++; throw; }
                if (Overrides.TryGetValue(path, out var alternate)) (status, json) = alternate;
                else json = fixture.Samples.Values.SingleOrDefault(sample => sample.Path == path)?.Json ?? throw new InvalidOperationException("Unexpected synthetic media read: " + path);
                if (path == ChangeScopeAfterPath) { Scope = new string('f', 64); ChangeScopeAfterPath = null; }
            }
            return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request, cancellationToken);
    }
}
