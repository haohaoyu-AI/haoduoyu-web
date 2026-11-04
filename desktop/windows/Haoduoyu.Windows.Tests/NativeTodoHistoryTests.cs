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
    private static IReadOnlyList<(string Name, Action Run)> TodoHistoryCases =>
    [
        ("Shown native todo calendar distinguishes empty read days missing baselines and pending results across week month restart and private profiles", () => RunWithDispatcher(TodoHistoryOfflineAsync)),
        ("Shown native todo calendar refresh stages seven complete days atomically and retains the old range and local work after a middle-day failure", () => RunWithDispatcher(TodoHistoryRefreshFailureAsync))
    ];

    private static async Task TodoHistoryOfflineAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            const string firstUser = "10000000-0000-4000-8000-000000000701", secondUser = "10000000-0000-4000-8000-000000000702";
            var firstIdentity = "user:" + firstUser + ":" + firstScope; var secondIdentity = "user:" + secondUser + ":" + secondScope;
            var open = CalendarTodo("2026-11-01", "甲原有未完成待办", false);
            var done = CalendarTodo("2026-11-01", "甲原有已完成待办", true);
            var deleted = CalendarTodo("2026-11-01", "甲已软删不能计入活动日历", false, deleted: true);
            var uncertain = CalendarTodo("2026-11-03", "甲结果待核对的待办", false);
            var queuedId = Guid.NewGuid().ToString(); var unknownId = Guid.NewGuid().ToString();
            var queuedPath = "/api/v1/todos/" + queuedId; var unknownPath = "/api/v1/todos/" + uncertain["id"]!.GetValue<string>();
            var queued = new PendingOperation { ResourceKey = queuedPath, Path = "/api/v1/todos", Method = "POST",
                BodyJson = Object(("id", queuedId), ("date", "2026-11-02"), ("text", "甲仅本机排队待办")).ToJsonString() };
            var unknown = new PendingOperation { Id = unknownId, ResourceKey = unknownPath, Path = unknownPath, Method = "PATCH", Status = PendingStatus.Unknown,
                SendAttempts = 1, BodyJson = Object(("version", 3), ("completed", true)).ToJsonString(),
                RemoteJson = Wrap(Object(("id", uncertain["id"]!.DeepClone()), ("version", 4), ("text", "尚不能确认原操作的远端证据"))) };
            var draft = AppDraft("history", "synthetic-calendar-draft", new JsonObject(), Object(("text", "甲日历只读流程不能改写的中文草稿 🐟")));
            var cache = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["/api/v1/todos?date=2026-10-31"] = CalendarDay("2026-10-31"),
                ["/api/v1/todos?date=2026-11-01"] = CalendarDay("2026-11-01", open, done, deleted),
                ["/api/v1/todos?date=2026-11-03"] = CalendarDay("2026-11-03", uncertain),
                ["/api/v1/todos?date=2026-11-04"] = CalendarDay("2026-11-04")
            };
            var firstPath = await SeedCalendarWorkspaceAsync(root, firstIdentity, cache, draft, queued, unknown);
            var secondPath = await SeedCalendarWorkspaceAsync(root, secondIdentity, new Dictionary<string, string>(StringComparer.Ordinal)
            { ["/api/v1/todos?date=" + Day] = CalendarDay(Day, CalendarTodo(Day, "乙独立账号的当日待办", false)) });
            var firstBytes = await File.ReadAllBytesAsync(firstPath); var secondBytes = await File.ReadAllBytesAsync(secondPath);
            RememberProfiles(root, new string('a', 64), firstUser, firstScope, secondUser, secondScope, firstIdentity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "待办日历");
                await SetCalendarAnchorAsync(window, new DateTime(2026, 11, 1)); await ClickAsync(window, "周视图");
                Check(CalendarDays(window).Select(button => button.Tag!.ToString()).SequenceEqual(Enumerable.Range(0, 7).Select(offset =>
                    new DateTime(2026, 10, 26).AddDays(offset).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture))),
                    "native week calendar omitted cross-month dates or changed chronological order");
                Check(CalendarCoverageText(window, 2, 7), "read empty and non-empty days were not counted separately from five missing service baselines");
                Check(CalendarTileText(window, "2026-10-31").Contains("0", StringComparison.Ordinal) &&
                    UnknownCalendarCoverage(CalendarTileText(window, "2026-10-30")),
                    "the native calendar confused a valid empty day with an unread day");
                await ClickAsync(window, "下一周");
                var missingPending = CalendarTileText(window, "2026-11-02"); var unknownPending = CalendarTileText(window, "2026-11-03");
                Check(missingPending.Contains("甲仅本机排队待办", StringComparison.Ordinal) && UnknownCalendarCoverage(missingPending),
                    "a local queued-only day was hidden or advertised as a complete zero/complete service baseline");
                Check(unknownPending.Contains("甲结果待核对的待办", StringComparison.Ordinal) &&
                    new[] { "待核", "未知", "未确认" }.Any(value => unknownPending.Contains(value, StringComparison.Ordinal)),
                    "the calendar presented an attempted unknown completion as a confirmed result");
                await ClickAsync(window, "月视图"); await ClickAsync(window, "上一月");
                Check(CalendarDays(window).Any(button => button.Tag?.ToString() == "2026-10-31"), "native month navigation lost the previous month's cached empty day");
                await ClickAsync(window, "下一月");
                SetCalendarStatus(window, "done"); await ClickAsync(window, "应用日历筛选");
                var doneOnly = CalendarTileText(window, "2026-11-01");
                Check(doneOnly.Contains("甲原有已完成待办", StringComparison.Ordinal) && !doneOnly.Contains("甲原有未完成待办", StringComparison.Ordinal) &&
                    !doneOnly.Contains("甲已软删不能计入活动日历", StringComparison.Ordinal),
                    "the done filter inherited hide-completed preferences, retained deleted rows, or ignored the selected status");
                SetCalendarStatus(window, "open"); await ClickAsync(window, "应用日历筛选");
                Check(CalendarTileText(window, "2026-11-01").Contains("甲原有未完成待办", StringComparison.Ordinal) &&
                    !CalendarTileText(window, "2026-11-01").Contains("甲原有已完成待办", StringComparison.Ordinal),
                    "native calendar open filtering did not preserve the independent completion distinction");
                await ClickCalendarDayAsync(window, "2026-11-01");
                Check(Field<string>(window, "currentPage") == "待办" && Field<DatePicker>(window, "date").SelectedDate == new DateTime(2026, 11, 1) &&
                    VisibleText(window).Contains("甲原有未完成待办", StringComparison.Ordinal) && !VisibleText(window).Contains("甲已软删不能计入活动日历", StringComparison.Ordinal),
                    "selecting a calendar day did not return to that exact existing native todo list without deleted records");
                Check(Engine(window).Snapshot.Drafts[draft.Key].Text == draft.Text && JsonSerializer.Serialize(Engine(window).Snapshot.Outbox) ==
                    JsonSerializer.Serialize(new[] { queued, unknown }) && (await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBytes),
                    "readonly calendar navigation changed the unrelated draft, immutable pending requests or encrypted workspace");
                await CloseAsync(window); window = await ShowAsync(root, handler); await ClickAsync(window, "待办日历");
                await SetCalendarAnchorAsync(window, new DateTime(2026, 11, 1)); SetCalendarStatus(window, "done"); await ClickAsync(window, "应用日历筛选");
                Check(CalendarTileText(window, "2026-11-01").Contains("甲原有已完成待办", StringComparison.Ordinal) &&
                    Engine(window).Snapshot.Outbox.Single(operation => operation.Id == unknown.Id).Status == PendingStatus.Unknown,
                    "reopening a calendar lost the cached completion or its separate unknown-result fence");
                SaveEvidence(window, "todo-calendar-private-history.png");
                await InvokeAsync(window, "OpenOfflineProfileAsync", secondIdentity); await ClickAsync(window, "待办日历");
                Check(CalendarStatus(window) == "all" && CalendarAnchor(window).SelectedDate == DateTime.ParseExact(Day, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) &&
                    CalendarText(window).Contains("乙独立账号的当日待办", StringComparison.Ordinal) && !CalendarText(window).Contains("甲原有", StringComparison.Ordinal) &&
                    !CalendarText(window).Contains("甲仅本机", StringComparison.Ordinal),
                    "switching private calendar profiles retained the former anchor/filter or leaked another user's tasks");
                Check((await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBytes) && (await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBytes),
                    "readonly calendar viewing or account switching rewrote private business files");
                Check(handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0,
                    "offline calendar navigation filtering profile switching or restart requested HTTP or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task TodoHistoryRefreshFailureAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TodoHistoryOrigin();
            var dates = Enumerable.Range(0, 7).Select(index => new DateTime(2026, 10, 26).AddDays(index).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture)).ToArray();
            foreach (var date in dates) origin.Responses["/api/v1/todos?date=" + date] = CalendarDay(date);
            origin.Responses["/api/v1/todos?date=" + dates[0]] = CalendarDay(dates[0],
                CalendarTodo(dates[0], "完整范围中未完成的合成待办", false), CalendarTodo(dates[0], "完整范围中已完成的合成待办", true));
            var identity = "public:" + origin.Scope;
            var draft = AppDraft("history", "synthetic-calendar-refresh-draft", new JsonObject(), Object(("text", "范围刷新失败必须保留的本机中文稿 🐟")));
            var unknownId = Guid.NewGuid().ToString(); var unknownPath = "/api/v1/note-entries/" + Guid.NewGuid().ToString();
            var unknown = new PendingOperation { Id = unknownId, ResourceKey = unknownPath, Path = unknownPath, Method = "PUT", Status = PendingStatus.Unknown,
                SendAttempts = 1, BodyJson = Object(("version", 2), ("save_id", unknownId), ("category", "life"), ("date", Day), ("text", "不能因日历刷新而重放的未知请求")).ToJsonString() };
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal)
            { ["/api/v1/todos?date=" + dates[0]] = CalendarDay(dates[0], CalendarTodo(dates[0], "旧范围原件", false)) }, draft, unknown);
            RememberProfiles(root, origin.Scope, "10000000-0000-4000-8000-000000000703", new string('b', 64),
                "10000000-0000-4000-8000-000000000704", new string('c', 64), identity);
            var window = await ShowTodoHistoryWindowAsync(root, origin);
            try
            {
                await ClickAsync(window, "待办日历"); await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected"), "synthetic allowed public scope did not bind before a calendar refresh");
                await SetCalendarAnchorAsync(window, new DateTime(2026, 11, 1)); await ClickAsync(window, "周视图");
                await ClickAsync(window, "刷新当前范围");
                var before = Engine(window).Snapshot;
                Check(CalendarCoverageText(window, 7, 7) && CalendarTileText(window, dates[0]).Contains("完整范围中未完成", StringComparison.Ordinal),
                    "native calendar did not show all seven complete validated service days after refresh");
                var paths = dates.Select(date => "/api/v1/todos?date=" + date).ToArray();
                Check(paths.All(path => before.Cache.ContainsKey(path)) && paths.Select(path => before.CacheRevisions[path]).Distinct().Count() == 1,
                    "a successful calendar range was not committed as one atomic cache revision");
                var metas = paths.Select(path => JsonNode.Parse(before.Cache[path])!["_local_todo_history"]!.AsObject()).ToArray();
                Check(metas.Select(meta => meta["batch_id"]!.GetValue<string>()).Distinct().Count() == 1 &&
                    metas.All(meta => meta["scope_id"]?.GetValue<string>() == origin.Scope && meta["range_start"]?.GetValue<string>() == dates[0] &&
                        meta["range_end"]?.GetValue<string>() == dates[^1] && meta["read_revision"]?.GetValue<long>() == 7),
                    "the calendar range lost its shared observed scope, batch, date bounds or revision evidence");
                var cached = before.Cache.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
                var previousCalls = origin.Paths.Count;
                origin.Responses[paths[0]] = CalendarDay(dates[0], CalendarTodo(dates[0], "坏批次的早日正文不能部分覆盖", false));
                origin.Responses[paths[3]] = Wrap(Object(("date", dates[3]), ("today", Day), ("completed_mode", "hide"), ("preferences_version", 2), ("items", true)));
                await ClickAsync(window, "刷新当前范围");
                var after = Engine(window).Snapshot;
                Check(after.Cache.Count == cached.Count && cached.All(pair => after.Cache.GetValueOrDefault(pair.Key) == pair.Value),
                    "a malformed middle day partly replaced the last complete cached range");
                Check(after.Drafts[draft.Key].Text == before.Drafts[draft.Key].Text && JsonSerializer.Serialize(after.Outbox) == JsonSerializer.Serialize(before.Outbox) &&
                    after.Outbox.Single().Status == PendingStatus.Unknown && after.Outbox.Single().SendAttempts == 1,
                    "rejecting a calendar range changed its local draft or attempted unknown request fence");
                Check(origin.Paths.Skip(previousCalls).Contains(paths[0], StringComparer.Ordinal) && origin.Paths.Skip(previousCalls).Contains(paths[3], StringComparer.Ordinal) &&
                    CalendarCoverageText(window, 7, 7) && !CalendarText(window).Contains("坏批次的早日正文", StringComparison.Ordinal),
                    "the native test did not exercise a mid-batch failure after earlier reads, or the invalid batch replaced its displayed range");
                Check(origin.WriteCalls == 0 && sockets.Connects == 0, "calendar range refresh issued a business write or opened a real socket");
                await CloseAsync(window); var callsAfterFailure = origin.Paths.Count;
                window = await ShowTodoHistoryWindowAsync(root, origin); await ClickAsync(window, "待办日历");
                await SetCalendarAnchorAsync(window, new DateTime(2026, 11, 1)); await ClickAsync(window, "周视图");
                Check(paths.All(path => Engine(window).Snapshot.Cache[path] == cached[path]) && CalendarCoverageText(window, 7, 7) && origin.Paths.Count == callsAfterFailure,
                    "restart lost the accepted calendar range or silently retried a rejected download");
                Check(Engine(window).Snapshot.Drafts[draft.Key].Text == before.Drafts[draft.Key].Text &&
                    Engine(window).Snapshot.Outbox.Single().Id == unknown.Id && Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown,
                    "restart after a failed calendar range lost draft text or revived attempted work");
                SaveEvidence(window, "todo-calendar-midrange-failure-keeps-cache.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static JsonObject CalendarTodo(string date, string text, bool completed, bool deleted = false) => Object(
        ("id", Guid.NewGuid().ToString()), ("date", date), ("text", text), ("completed", completed), ("version", 3),
        ("created_at", "2026-10-26T00:00:00.000Z"), ("updated_at", "2026-10-26T01:00:00.000Z"),
        ("deleted_at", deleted ? JsonValue.Create("2026-10-26T02:00:00.000Z") : null));
    private static string CalendarDay(string date, params JsonObject[] rows) => Wrap(Object(("date", date), ("today", Day), ("completed_mode", "hide"),
        ("preferences_version", 2), ("items", new JsonArray(rows.Select(row => row.DeepClone()).ToArray()))));
    private static async Task<string> SeedCalendarWorkspaceAsync(string root, string identity, IReadOnlyDictionary<string, string> cache,
        LocalDraft? draft = null, params PendingOperation[] operations)
    {
        using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector());
        var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
        foreach (var pair in cache) { state.Cache[pair.Key] = pair.Value; state.CacheRevisions[pair.Key] = 1; }
        if (draft != null) state.Drafts[draft.Key] = draft; state.Outbox.AddRange(operations);
        await store.SaveAsync(state); return store.FilePath;
    }

    private static DatePicker CalendarAnchor(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<DatePicker>()
        .Single(control => control.Tag?.ToString() == "todo-history-anchor");
    private static async Task SetCalendarAnchorAsync(MainWindow window, DateTime anchor)
    {
        CalendarAnchor(window).SelectedDate = anchor; await window.WaitForIdleAsync();
        await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static ComboBox CalendarStatusControl(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<ComboBox>()
        .Single(control => control.Tag?.ToString() == "todo-history-status");
    private static void SetCalendarStatus(MainWindow window, string value) => CalendarStatusControl(window).SelectedValue = value;
    private static string CalendarStatus(MainWindow window) => CalendarStatusControl(window).SelectedValue?.ToString() ?? "";
    private static Button[] CalendarDays(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<Button>()
        .Where(button => button.Tag is string date && DateOnly.TryParseExact(date, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _))
        .OrderBy(button => button.Tag!.ToString(), StringComparer.Ordinal).ToArray();
    private static string CalendarTileText(MainWindow window, string date)
    {
        var button = CalendarDays(window).Single(button => button.Tag?.ToString() == date);
        return string.Join("\n", Descendants(button).OfType<TextBlock>().Select(block => block.Text).Append(button.Content as string ?? ""));
    }
    private static async Task ClickCalendarDayAsync(MainWindow window, string date)
    {
        var button = CalendarDays(window).Single(button => button.Tag?.ToString() == date);
        Check(button.IsEnabled, "calendar day navigation was disabled"); button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static string CalendarText(MainWindow window) => string.Join("\n", Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Select(block => block.Text)
        .Concat(Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Select(box => box.Text))
        .Concat(CalendarDays(window).Select(button => button.Content as string ?? "")));
    private static bool CalendarCoverageText(MainWindow window, int covered, int total)
    {
        var text = CalendarText(window).Replace(" ", "", StringComparison.Ordinal);
        return text.Contains(covered + "/" + total, StringComparison.Ordinal);
    }
    private static bool UnknownCalendarCoverage(string text) => new[] { "未知", "未完整", "未下载", "尚无", "缺少" }.Any(value => text.Contains(value, StringComparison.Ordinal));

    private static async Task<MainWindow> ShowTodoHistoryWindowAsync(string root, TodoHistoryOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "shown calendar requires the guarded synthetic app host");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningTodoHistoryOrigin(origin))) { Title = "好多鱼 · 纯合成待办日历验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "synthetic calendar window did not initialize");
        await window.WaitForIdleAsync(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero &&
            ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 && Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root),
            "calendar test escaped guarded startup, the injected private directory, or an actual shown native window");
        return window;
    }
    private sealed class NonOwningTodoHistoryOrigin(TodoHistoryOrigin origin) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request);
    }
    private sealed class TodoHistoryOrigin : HttpMessageHandler
    {
        internal string Scope { get; } = new('d', 64);
        internal Dictionary<string, string> Responses { get; } = new(StringComparer.Ordinal);
        internal List<string> Paths { get; } = [];
        internal int WriteCalls { get; private set; }
        internal Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request)
        {
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz", "calendar transport escaped the fixed origin");
            var path = request.RequestUri!.PathAndQuery; Paths.Add(path);
            if (request.Method != HttpMethod.Get) WriteCalls++;
            Check(request.Method == HttpMethod.Get, "readonly calendar requested a business write");
            string json;
            if (path == "/api/v1/workbench-snapshot/index?version=2")
                json = Wrap(Object(("snapshot_format", "haoduoyu-workbench-snapshot-v2"), ("projection", "current"), ("complete", true), ("scope_id", Scope),
                    ("timezone", "Asia/Shanghai"), ("generated_at", "2026-11-04T20:00:00.000Z"), ("manifest_hash", new string('a', 64)),
                    ("global_content_hash", new string('b', 64)), ("index_hash", new string('a', 64)), ("entities", new JsonArray()), ("dates", new JsonArray())));
            else if (path is "/api/v1/review/articles?offset=0" or "/api/v1/review/articles?offset=0&read_revision=7")
                json = Wrap(Object(("items", new JsonArray()), ("has_more", false), ("read_revision", 7)));
            else json = Responses.GetValueOrDefault(path) ?? throw new InvalidOperationException("Unexpected synthetic todo-history path: " + path);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request);
    }
}
