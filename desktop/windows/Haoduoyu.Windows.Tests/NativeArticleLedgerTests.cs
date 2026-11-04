using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ArticleLedgerCases =>
    [
        ("Shown native article ledger filters a complete private inventory and recomputes queued facts without changing original work or crossing profiles", () => RunWithDispatcher(ArticleLedgerOfflineAsync)),
        ("Shown native article ledger keeps raw server pagination separate from partial local projection and retains good data after invalid queries or responses", () => RunWithDispatcher(ArticleLedgerServerAsync))
    ];

    private static async Task ArticleLedgerOfflineAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            const string firstUser = "10000000-0000-4000-8000-000000000801", secondUser = "10000000-0000-4000-8000-000000000802";
            var firstIdentity = "user:" + firstUser + ":" + firstScope; var secondIdentity = "user:" + secondUser + ":" + secondScope;
            var articles = Enumerable.Range(0, 16).Select(index => LedgerArticle("local-ledger-" + index.ToString("D2", System.Globalization.CultureInfo.InvariantCulture),
                "甲本机文章" + index.ToString("D2", System.Globalization.CultureInfo.InvariantCulture), "synthetic-ledger-a", index + 10)).ToArray();
            articles[1]["title"] = "甲本机零阅读"; articles[1]["latest_metrics"]!["reads"] = 0;
            articles[1]["published_at"] = "2026-11-04T03:00:00.000Z";
            articles[2]["title"] = "甲本机未知阅读"; articles[2]["latest_metrics"]!["reads"] = null; articles[2]["missing_metrics"] = new JsonArray("reads");
            articles[3]["title"] = "甲本机待核未知零"; articles[3]["latest_metrics"]!["reads"] = 0;
            articles[3]["verify_items"] = null; articles[3]["has_pending_verify"] = null; articles[3]["verify_state"] = "unknown";
            articles[0]["verify_items"] = new JsonArray(Object(("field", "draft_ref"), ("done", false)));
            articles[0]["has_pending_verify"] = true; articles[0]["verify_state"] = "pending";
            articles[14]["status"] = "draft_saved"; articles[14]["url"] = null; articles[14]["published_at"] = null;
            articles[15]["status"] = null; articles[15]["title"] = "甲未知状态不能混为已发布";
            var key = "/api/v1/articles/" + articles[0]["id"]!.GetValue<string>();
            var values = (JsonObject)articles[0].DeepClone();
            values["title"] = "甲离线改题待核"; values["notes"] = "本机离线备注口令，保存原请求后仍可核对";
            values["status"] = "draft_saved"; values["url"] = ""; values["published_at"] = ""; values["char_count"] = "0"; values["image_count"] = "0";
            var draft = AppDraft("article", key, articles[0], values);
            var queued = PreparedOperation(key, PrepareAppSave("article", articles[0], values));
            var firstPath = await SeedLedgerWorkspaceAsync(root, firstIdentity, "synthetic-ledger-a", articles, true, draft, queued);
            var secondPath = await SeedLedgerWorkspaceAsync(root, secondIdentity, "synthetic-ledger-b",
                [LedgerArticle("local-ledger-b", "乙部分本机文章", "synthetic-ledger-b", 0)], false);
            var firstBytes = await File.ReadAllBytesAsync(firstPath); var secondBytes = await File.ReadAllBytesAsync(secondPath);
            RememberProfiles(root, new string('a', 64), firstUser, firstScope, secondUser, secondScope, firstIdentity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "文章台账");
                Check(LedgerText(window, "article-ledger-coverage").Contains("本机完整范围", StringComparison.Ordinal),
                    "a verified canonical private ledger was not labelled as a complete local inventory");
                SetLedgerFilter(window, "q", "甲本机"); SetLedgerFilter(window, "account_id", "synthetic-ledger-a");
                SetLedgerFilter(window, "slot", "tt1"); SetLedgerFilter(window, "writer", "dedao");
                SetLedgerFilter(window, "from", "2026-11-04"); SetLedgerFilter(window, "to", "2026-11-04");
                SetLedgerFilter(window, "sort", "reads"); SetLedgerFilter(window, "order", "asc"); SetLedgerFilter(window, "page_size", "10");
                await ClickAsync(window, "应用台账筛选");
                Check(LedgerText(window, "article-ledger-page-summary").Contains("筛选已知 13 条", StringComparison.Ordinal) &&
                    LedgerTitles(window).Count == 10 && LedgerTitles(window)[0] == "甲本机零阅读",
                    "combined native filters lost local pagination, included unknown/nonpublished states, or sorted missing reads as zero");
                await ClickAsync(window, "下一页");
                Check(LedgerText(window, "article-ledger-page-summary").Contains("第 2 页", StringComparison.Ordinal) &&
                    LedgerTitles(window).Count == 3 && LedgerTitles(window)[^1] == "甲本机未知阅读",
                    "the second local page lost known records or failed to keep a missing metric after genuine numbers");
                SetLedgerFilter(window, "data_status", "zero_reads"); await ClickAsync(window, "应用台账筛选");
                Check(LedgerTitles(window).Count == 2 && !LedgerTitles(window).Contains("甲本机未知阅读", StringComparer.Ordinal),
                    "zero-read filtering treated missing reads as a measured zero");
                SetLedgerFilter(window, "has_pending_verify", "false"); await ClickAsync(window, "应用台账筛选");
                Check(LedgerTitles(window).SequenceEqual(["甲本机零阅读"]), "explicitly verified filtering silently accepted unknown verification metadata");
                await ClickAsync(window, "清空台账筛选"); await ClickLedgerStatusAsync(window, "草稿已存");
                SetLedgerFilter(window, "q", "备注口令"); SetLedgerFilter(window, "has_warnings", "true"); SetLedgerFilter(window, "has_pending_verify", "true");
                await ClickAsync(window, "应用台账筛选");
                Check(LedgerTitles(window).SequenceEqual(["甲离线改题待核"]),
                    "queued title/notes/status and numeric changes did not recompute search, warnings, and pending facts in the local ledger");
                Check(Engine(window).Snapshot.Drafts[key].Text == draft.Text && Engine(window).Snapshot.Outbox.Single().BodyJson == queued.BodyJson &&
                    Engine(window).Snapshot.Outbox.Single().Id == queued.Id && (await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBytes),
                    "local ledger filtering or fact derivation changed the original encrypted draft or immutable request");
                SaveEvidence(window, "article-ledger-complete-local-filtered.png");
                await ClickAsync(window, "清空台账筛选"); await ClickLedgerStatusAsync(window, "已发布");
                SetLedgerFilter(window, "q", "甲本机"); SetLedgerFilter(window, "page_size", "10");
                await ClickAsync(window, "应用台账筛选"); await ClickAsync(window, "下一页");
                await InvokeAsync(window, "OpenOfflineProfileAsync", secondIdentity); await ClickAsync(window, "文章台账");
                Check(LedgerText(window, "article-ledger-coverage").Contains("本机局部范围", StringComparison.Ordinal) &&
                    LedgerTitles(window).Contains("乙部分本机文章", StringComparer.Ordinal) && !LedgerAllText(window).Contains("甲离线", StringComparison.Ordinal),
                    "a different profile's partial raw page was presented as a complete inventory or retained A's results");
                foreach (var field in new[] { "q", "account_id", "slot", "writer", "from", "to", "has_warnings", "has_pending_verify", "data_status" })
                    Check(LedgerFilterValue(window, field) == "", "profile switch retained a foreign ledger filter: " + field);
                Check(LedgerFilterValue(window, "sort") == "published_at" && LedgerFilterValue(window, "order") == "desc" &&
                    LedgerFilterValue(window, "page_size") == "50" && LedgerText(window, "article-ledger-page-summary").Contains("第 1 页", StringComparison.Ordinal),
                    "profile switch retained a foreign ledger sort, page size or page number");
                Check((await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBytes) && (await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBytes) &&
                    handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0,
                    "readonly private ledger filtering or profile switching changed business files or requested a network");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ArticleLedgerServerAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new ArticleLedgerOrigin();
            var window = await ShowArticleLedgerWindowAsync(root, origin);
            try
            {
                await ClickAsync(window, "文章台账"); await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected"), "the synthetic ledger origin was not bound before online filtering");
                SetLedgerFilter(window, "account_id", "synthetic-ledger-server"); SetLedgerFilter(window, "platform", "toutiao");
                SetLedgerFilter(window, "q", "服务甲"); SetLedgerFilter(window, "from", "2026-11-04"); SetLedgerFilter(window, "to", "2026-11-04");
                SetLedgerFilter(window, "mode", "mixed"); SetLedgerFilter(window, "topic", "entertainment");
                SetLedgerFilter(window, "slot", "tt1"); SetLedgerFilter(window, "writer", "dedao");
                SetLedgerFilter(window, "has_warnings", "true"); SetLedgerFilter(window, "has_pending_verify", "true");
                SetLedgerFilter(window, "sort", "reads"); SetLedgerFilter(window, "order", "desc"); SetLedgerFilter(window, "page_size", "10");
                await ClickAsync(window, "应用台账筛选");
                var pagePath = origin.Paths.Last(path => path.StartsWith("/api/v1/articles?", StringComparison.Ordinal));
                var query = LedgerDecodeQuery(pagePath);
                foreach (var expected in new Dictionary<string, string> { ["account_id"] = "synthetic-ledger-server", ["platform"] = "toutiao", ["q"] = "服务甲",
                    ["from"] = "2026-11-04", ["to"] = "2026-11-04", ["mode"] = "mixed", ["topic"] = "entertainment",
                    ["slot"] = "tt1", ["writer"] = "dedao", ["has_warnings"] = "true", ["has_pending_verify"] = "true",
                    ["sort"] = "reads", ["order"] = "desc", ["page_size"] = "10", ["page"] = "1", ["status"] = "published" })
                    Check(query.GetValueOrDefault(expected.Key) == expected.Value, "native server query omitted or changed a visible filter: " + expected.Key);
                Check(LedgerText(window, "article-ledger-page-summary").Contains("服务端筛选共 27 条", StringComparison.Ordinal) &&
                    LedgerText(window, "article-ledger-page-summary").Contains("服务端总量 100 条", StringComparison.Ordinal) && LedgerTitles(window).Count == 10,
                    "native server pagination substituted ten locally visible rows for authoritative server totals");
                var original = origin.Article(0); var key = "/api/v1/articles/" + original["id"]!.GetValue<string>();
                var values = (JsonObject)original.DeepClone(); values["title"] = "本机待同步标题不可混入服务器页";
                var draft = AppDraft("article", key, original, values); await Engine(window).SaveDraftAsync(draft);
                var operation = PreparedOperation(key, PrepareAppSave("article", original, values)); await Engine(window).QueueAsync(operation);
                await ClickAsync(window, "读取服务端筛选结果");
                Check(LedgerTitles(window).Contains("服务甲合成文章00", StringComparer.Ordinal) &&
                    !LedgerTitles(window).Contains("本机待同步标题不可混入服务器页", StringComparer.Ordinal),
                    "the raw server page was silently mixed with a pending local title");
                AssertRawLedgerMeta(Engine(window).Snapshot.Cache[pagePath], 1, 10, 27, 100);
                await ClickAsync(window, "下一页");
                var secondPath = origin.Paths.Last(path => path.StartsWith("/api/v1/articles?", StringComparison.Ordinal));
                AssertRawLedgerMeta(Engine(window).Snapshot.Cache[secondPath], 2, 10, 27, 100);
                Check(LedgerTitles(window).Count == 10 && LedgerText(window, "article-ledger-page-summary").Contains("第 2 页", StringComparison.Ordinal),
                    "native server navigation ignored its unmodified next-page metadata");
                await ClickAsync(window, "上一页");
                var beforeInvalid = Engine(window).Snapshot;
                var cached = beforeInvalid.Cache.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
                var requests = origin.Paths.Count;
                SetLedgerFilter(window, "from", "2026-02-30"); await ClickAsync(window, "应用台账筛选");
                Check(origin.Paths.Count == requests && cached.All(pair => Engine(window).Snapshot.Cache.GetValueOrDefault(pair.Key) == pair.Value) &&
                    LedgerTitles(window).Contains("服务甲合成文章00", StringComparer.Ordinal),
                    "an impossible visible query issued HTTP, erased a valid server page, or changed the cached source");
                SetLedgerFilter(window, "from", "2026-11-04"); origin.InvalidPage = true;
                await ClickAsync(window, "应用台账筛选");
                Check(cached.All(pair => Engine(window).Snapshot.Cache.GetValueOrDefault(pair.Key) == pair.Value) &&
                    LedgerTitles(window).Contains("服务甲合成文章00", StringComparer.Ordinal),
                    "a malformed successful page replaced cached server evidence or discarded the last readable page");
                origin.InvalidPage = false;
                await ClickAsync(window, "查看本机筛选结果");
                Check(LedgerText(window, "article-ledger-coverage").Contains("本机局部范围", StringComparison.Ordinal) &&
                    Engine(window).Snapshot.Cache[pagePath] == cached[pagePath],
                    "switching to local projection promoted raw pages to a full inventory or rewrote server pagination");
                await ClickAsync(window, "读取服务端筛选结果"); await SelectListItemAsync(window, "服务甲合成文章00");
                Check(origin.Paths.Contains(key, StringComparer.Ordinal) && PipelineValue(window, "title") == "本机待同步标题不可混入服务器页" &&
                    Engine(window).Snapshot.Drafts[key].BaseVersion == 8 && SavedAppDraft(Engine(window), key)["original"]?["version"]?.GetValue<long>() == 8,
                    "clicking a raw row skipped its full detail read, lost its original draft identity, or used a summary as an editable version");
                Check(Engine(window).Snapshot.Outbox.Single().Id == operation.Id && Engine(window).Snapshot.Outbox.Single().BodyJson == operation.BodyJson &&
                    Engine(window).Snapshot.Outbox.Single().SendAttempts == 0 && origin.WriteCalls == 0 && sockets.Connects == 0,
                    "ledger modes or detail navigation changed the pending request, sent business data, or opened a socket");
                SaveEvidence(window, "article-ledger-raw-page-preserves-local-draft.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static JsonObject LedgerArticle(string id, string title, string account, long? reads)
    {
        var row = PipelineArticle(title, 8); row["id"] = id; row["account_id"] = account; row["account_name"] = "好多鱼"; row["platform"] = "toutiao";
        row["verify_items"] = new JsonArray(); row["has_pending_verify"] = false; row["verify_state"] = "complete"; row["warnings"] = new JsonArray();
        row["topic"] = "entertainment"; row["topic_source"] = "inferred"; row["date_status"] = "recorded"; row["snapshot_status"] = "collected";
        row["latest_metrics"] = Object(("reads", reads.HasValue ? JsonValue.Create(reads.Value) : null), ("impressions", 0), ("likes", 0), ("comments", 0),
            ("favorites", 0), ("shares", 0), ("approvals", 0), ("reading_users", 0));
        row["latest_as_of"] = "2026-11-04T04:00:00.000Z"; row["latest_collected_at"] = "2026-11-04T04:01:00.000Z"; row["duration_seconds"] = 3600;
        row["missing_metrics"] = reads.HasValue ? new JsonArray() : new JsonArray("reads");
        return row;
    }
    private static JsonArray LedgerAccounts(string id) => new(Object(("id", id), ("name", id == "synthetic-ledger-b" ? "乙合成账号" : "好多鱼"), ("platform", "toutiao")));
    private static async Task<string> SeedLedgerWorkspaceAsync(string root, string identity, string account, IReadOnlyList<JsonObject> rows, bool complete,
        LocalDraft? draft = null, PendingOperation? operation = null)
    {
        using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector());
        var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
        state.Cache["/api/v1/accounts"] = Wrap(LedgerAccounts(account));
        if (complete) state.Cache["/api/v1/articles"] = Object(("data", new JsonArray(rows.Select(row => row.DeepClone()).ToArray())),
            ("meta", Object(("total", rows.Count), ("has_more", false))), ("_local_complete", true)).ToJsonString();
        else state.Cache["/api/v1/articles?page=1&page_size=1&status=published"] = RawLedgerPage(rows, 1, 1, 100, 100);
        foreach (var row in rows) state.Cache["/api/v1/articles/" + row["id"]!.GetValue<string>()] = Wrap(row.DeepClone());
        foreach (var path in state.Cache.Keys) state.CacheRevisions[path] = 1;
        if (draft != null) state.Drafts[draft.Key] = draft; if (operation != null) state.Outbox.Add(operation);
        await store.SaveAsync(state); return store.FilePath;
    }
    private static string RawLedgerPage(IReadOnlyList<JsonObject> rows, int page, int size, int total, int unfiltered) =>
        Object(("data", new JsonArray(rows.Select(row => row.DeepClone()).ToArray())), ("meta", Object(("total", total), ("unfiltered_total", unfiltered),
            ("page", page), ("page_size", size), ("offset", (page - 1) * size), ("has_more", page * size < total), ("pagination", "offset")))).ToJsonString();

    private static FrameworkElement LedgerFilter(MainWindow window, string key) => Descendants(Field<StackPanel>(window, "page")).OfType<FrameworkElement>()
        .Single(control => control.Tag?.ToString() == key && control is TextBox or ComboBox);
    private static void SetLedgerFilter(MainWindow window, string key, string value)
    { if (LedgerFilter(window, key) is TextBox box) box.Text = value; else if (LedgerFilter(window, key) is ComboBox combo) combo.SelectedValue = value; }
    private static string LedgerFilterValue(MainWindow window, string key) => LedgerFilter(window, key) switch
    { TextBox box => box.Text, ComboBox combo => combo.SelectedValue?.ToString() ?? "", _ => throw new InvalidOperationException("Expected a native ledger filter.") };
    private static string LedgerText(MainWindow window, string tag) => Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Single(block => block.Tag?.ToString() == tag).Text;
    private static string LedgerAllText(MainWindow window) => string.Join("\n", Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Select(block => block.Text)
        .Concat(Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Select(box => box.Text)));
    private static IReadOnlyList<string> LedgerTitles(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<ListBox>()
        .SelectMany(list => list.Items.Cast<object>()).OfType<WorkspaceListItem>().Select(row => row.Title).ToArray();
    private static async Task ClickLedgerStatusAsync(MainWindow window, string label)
    {
        var button = Descendants(window).OfType<Button>().Single(value => value.Content is string text && text.TrimStart('●', ' ') == label);
        Check(button.IsEnabled, "native ledger status tab is disabled"); button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static Dictionary<string, string> LedgerDecodeQuery(string path) => path.Split('?', 2).ElementAtOrDefault(1)?.Split('&').ToDictionary(
        field => Uri.UnescapeDataString(field.Split('=', 2)[0]), field => Uri.UnescapeDataString(field.Split('=', 2)[1].Replace('+', ' ')), StringComparer.Ordinal) ?? new(StringComparer.Ordinal);
    private static void AssertRawLedgerMeta(string json, int page, int size, int total, int unfiltered)
    {
        var root = JsonNode.Parse(json)!.AsObject(); var meta = root["meta"]!;
        Check(meta["total"]?.GetValue<long>() == total && meta["unfiltered_total"]?.GetValue<long>() == unfiltered &&
            meta["page"]?.GetValue<long>() == page && meta["page_size"]?.GetValue<long>() == size && meta["offset"]?.GetValue<long>() == (page - 1) * size &&
            root["_local_projection"] == null && root["data"]!.AsArray().Count == Math.Min(size, Math.Max(0, total - (page - 1) * size)),
            "raw service page lost authoritative pagination or was stored as a local projection");
    }

    private static async Task<MainWindow> ShowArticleLedgerWindowAsync(string root, ArticleLedgerOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "ledger shown test requires guarded startup");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningArticleLedgerOrigin(origin))) { Title = "好多鱼 · 纯合成台账验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "synthetic ledger window did not initialize");
        await window.WaitForIdleAsync(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero && ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 &&
            Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "ledger shown test escaped the guarded native app or its injected temporary root");
        return window;
    }
    private sealed class NonOwningArticleLedgerOrigin(ArticleLedgerOrigin origin) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request); }
    private sealed class ArticleLedgerOrigin : HttpMessageHandler
    {
        internal List<string> Paths { get; } = [];
        internal int WriteCalls { get; private set; }
        internal bool InvalidPage { get; set; }
        internal JsonObject Article(int index)
        {
            var row = LedgerArticle("server-ledger-" + index.ToString("D2", System.Globalization.CultureInfo.InvariantCulture),
                (index < 27 ? "服务甲合成文章" : "其他合成服务文章") + index.ToString("D2", System.Globalization.CultureInfo.InvariantCulture), "synthetic-ledger-server", 100 - index);
            if (index < 27)
            {
                row["image_count"] = 0; row["warnings"] = new JsonArray("ENTERTAINMENT_IMAGES_TOO_FEW");
                row["verify_items"] = new JsonArray(Object(("field", "image_count"), ("done", false))); row["has_pending_verify"] = true; row["verify_state"] = "pending";
            }
            return row;
        }
        internal Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request)
        {
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz", "ledger request escaped its fixed origin");
            var path = request.RequestUri!.PathAndQuery; Paths.Add(path); if (request.Method != HttpMethod.Get) WriteCalls++;
            Check(request.Method == HttpMethod.Get, "ledger inspection attempted a business write");
            string json;
            if (path == "/api/v1/workbench-snapshot/index?version=2") json = Wrap(Object(("complete", true), ("scope_id", new string('d', 64))));
            else if (path == "/api/v1/accounts") json = Wrap(LedgerAccounts("synthetic-ledger-server"));
            else if (path.StartsWith("/api/v1/articles?", StringComparison.Ordinal))
            {
                var query = LedgerDecodeQuery(path); var page = int.Parse(query.GetValueOrDefault("page", "1"), System.Globalization.CultureInfo.InvariantCulture);
                var size = int.Parse(query.GetValueOrDefault("page_size", "50"), System.Globalization.CultureInfo.InvariantCulture); var offset = (page - 1) * size;
                var total = query.Any(pair => pair.Key is not ("page" or "page_size" or "status" or "sort" or "order") && pair.Value.Length > 0) ? 27 : 100;
                var rows = Enumerable.Range(offset, Math.Min(size, Math.Max(0, total - offset))).Select(Article).ToArray();
                json = RawLedgerPage(rows, page, size, InvalidPage ? 0 : total, 100);
            }
            else if (path.StartsWith("/api/v1/articles/server-ledger-", StringComparison.Ordinal))
                json = Wrap(Article(int.Parse(path.Split('-').Last(), System.Globalization.CultureInfo.InvariantCulture)));
            else throw new InvalidOperationException("Unexpected synthetic ledger request: " + path);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request);
    }
}
