using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ArticleLedgerViewCases =>
    [
        ("Shown native ledger saves encrypted views and column layouts across restart while retaining business bytes and page-scoped account groups", () => RunWithDispatcher(ArticleLedgerViewLifecycleAsync)),
        ("Shown native ledger presentation changes preserve raw server pagination without new requests and grouped rows retain their original editor identity", () => RunWithDispatcher(ArticleLedgerViewServerAsync)),
        ("Shown native ledger rejects stale profile controls and recovers only damaged view preferences without changing unknown business requests", () => RunWithDispatcher(ArticleLedgerViewRecoveryAsync))
    ];

    private static async Task ArticleLedgerViewLifecycleAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new SyntheticOrigin(denyEveryRequest: true);
            const string owner = "10000000-0000-4000-8000-000000001001", other = "10000000-0000-4000-8000-000000001002";
            var scope = new string('b', 64); var otherScope = new string('c', 64); var identity = "user:" + owner + ":" + scope;
            const string secret = "云端偏好私有关键字 🐟";
            var rows = Enumerable.Range(0, 24).Select(index => LedgerArticle("view-row-" + index.ToString("D2", System.Globalization.CultureInfo.InvariantCulture),
                secret + " " + index.ToString("D2", System.Globalization.CultureInfo.InvariantCulture), index % 2 == 0 ? "view-account-a" : "view-account-b", index == 1 ? null : index)).ToArray();
            var businessPath = await SeedLedgerViewWorkspaceAsync(root, identity, rows);
            await SeedLedgerViewWorkspaceAsync(root, "user:" + other + ":" + otherScope,
                [LedgerArticle("view-row-00", "乙账户独有文章", "view-account-a", 1)]);
            RememberProfiles(root, new string('a', 64), owner, scope, other, otherScope, identity);
            var originalBusiness = await File.ReadAllBytesAsync(businessPath);
            var preferences = LedgerViewStoreFor(businessPath);
            var window = await ShowAsync(root, origin);
            try
            {
                await ClickAsync(window, "文章台账");
                SetLedgerFilter(window, "q", secret); SetLedgerFilter(window, "page_size", "10");
                await ClickAsync(window, "应用台账筛选");
                await ConfigureLedgerViewAsync(window, ["title", "reads", "account"], "account", 420, 128);
                var table = LedgerViewTable(window); var grid = (GridView)table.View;
                Check(grid.Columns.Count == 3 && grid.Columns.Select(column => ((GridViewColumnHeader)column.Header).Content?.ToString()).SequenceEqual(
                    new[] { "title", "reads", "account" }.Select(key => ArticleLedgerViews.ColumnCatalog.Single(column => column.Key == key).Label)),
                    "the actual column panel failed to preserve selected visible column order");
                Check(Math.Abs(grid.Columns[0].Width - 420) < 0.1 && Math.Abs(grid.Columns[1].Width - 128) < 0.1,
                    "bounded native column widths were not applied to the actual GridView");
                var items = table.Items.Cast<WorkspaceListItem>().ToArray();
                Check(items.Single(item => item.Title.EndsWith(" 00", StringComparison.Ordinal)).LedgerCells["reads"] == "0" &&
                    items.Single(item => item.Title.EndsWith(" 01", StringComparison.Ordinal)).LedgerCells["reads"] == "未取得",
                    "native visible metric cells confused missing data with genuine zero");
                await AssertLedgerMetricCellAsync(window, " 00", "0");
                await AssertLedgerMetricCellAsync(window, " 01", "未取得");
                AssertLedgerPageGroups(window, 2, 10);
                Check(LedgerText(window, "article-ledger-page-summary").Contains("筛选已知 24 条", StringComparison.Ordinal),
                    "page grouping replaced the complete known matching count with visible rows");
                await ClickAsync(window, "下一页");
                Check(LedgerText(window, "article-ledger-page-summary").Contains("第 2 页", StringComparison.Ordinal), "the fixture did not reach a non-first page before saving its view");
                LedgerViewControl<TextBox>(window, "article-ledger-view-name").Text = "我的中文筛选 🐟";
                await ClickLedgerViewAsync(window, "article-ledger-view-save-new");
                var first = preferences.Read(); var saved = first.Preferences.Views.Single();
                Check(saved.Name == "我的中文筛选 🐟" && saved.Query.GetValueOrDefault("q") == secret && saved.Query.GetValueOrDefault("page_size") == "10" &&
                    !saved.Query.ContainsKey("page") && !saved.Query.ContainsKey("offset") && !saved.Query.ContainsKey("fields") &&
                    saved.Layout.Columns.Select(column => column.Key).SequenceEqual(["title", "reads", "account"]),
                    "saved view omitted its applied query/layout or persisted a transient page or summary mode");
                var encrypted = await File.ReadAllBytesAsync(preferences.FilePath);
                Check(encrypted.AsSpan().IndexOf(Encoding.UTF8.GetBytes(secret)) < 0 && encrypted.AsSpan().IndexOf(Encoding.UTF8.GetBytes(saved.Name)) < 0,
                    "the real current-user view preference file exposed the private search or view name in plaintext");
                await ClickLedgerViewAsync(window, "article-ledger-view-save-new");
                Check((await File.ReadAllBytesAsync(preferences.FilePath)).SequenceEqual(encrypted) && preferences.Read().Preferences.Views.Single().Id == saved.Id,
                    "a duplicate view name silently overwrote the existing encrypted preference file");
                LedgerViewControl<TextBox>(window, "article-ledger-view-name").Text = "另一份保留视图";
                await ClickLedgerViewAsync(window, "article-ledger-view-save-new");
                var retained = preferences.Read().Preferences.Views.Single(view => view.Id != saved.Id);
                var beforeDuplicateUpdate = await File.ReadAllBytesAsync(preferences.FilePath);
                LedgerViewControl<ComboBox>(window, "article-ledger-view-select").SelectedValue = saved.Id;
                LedgerViewControl<TextBox>(window, "article-ledger-view-name").Text = retained.Name;
                await ClickLedgerViewAsync(window, "article-ledger-view-update");
                Check((await File.ReadAllBytesAsync(preferences.FilePath)).SequenceEqual(beforeDuplicateUpdate) && preferences.Read().Preferences.Views.Count == 2,
                    "renaming a selected view to another existing name overwrote either view");
                LedgerViewControl<ComboBox>(window, "article-ledger-view-select").SelectedValue = saved.Id;
                LedgerViewControl<TextBox>(window, "article-ledger-view-name").Text = "更新后的中文视图 🐟";
                await ClickLedgerViewAsync(window, "article-ledger-view-update");
                Check(preferences.Read().Preferences.Views.Count == 2 && preferences.Read().Preferences.Views.Single(view => view.Id == saved.Id).Name == "更新后的中文视图 🐟" &&
                    preferences.Read().Preferences.Views.Single(view => view.Id == retained.Id).Name == retained.Name,
                    "explicitly updating a selected view created a duplicate ID or ignored its requested name");
                grid = (GridView)LedgerViewTable(window).View; grid.Columns[0].Width = 510; grid.Columns[1].Width = 144;
                window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
                await ClickLedgerViewAsync(window, "article-ledger-widths-save");
                Check(Math.Abs(preferences.Read().Preferences.Layout.Columns[0].Width - 510) < 0.1 &&
                    Math.Abs(preferences.Read().Preferences.Layout.Columns[1].Width - 144) < 0.1,
                    "explicitly saving resized GridView widths did not read the current native columns");
                Check((await File.ReadAllBytesAsync(businessPath)).SequenceEqual(originalBusiness) && origin.Calls == 0 && sockets.Connects == 0,
                    "saving, rejecting or updating local views changed business data or requested a network");
                await CloseAsync(window); window = await ShowAsync(root, origin); await ClickAsync(window, "文章台账");
                Check(LedgerFilterValue(window, "q") == "" && LedgerFilterValue(window, "page_size") == "50" &&
                    Math.Abs(((GridView)LedgerViewTable(window).View).Columns[0].Width - 510) < 0.1,
                    "restart either lost the saved layout or automatically applied a saved business filter");
                LedgerViewControl<ComboBox>(window, "article-ledger-view-select").SelectedValue = saved.Id;
                await ClickLedgerViewAsync(window, "article-ledger-view-apply");
                Check(LedgerFilterValue(window, "q") == secret && LedgerFilterValue(window, "page_size") == "10" &&
                    LedgerText(window, "article-ledger-page-summary").Contains("第 1 页", StringComparison.Ordinal) &&
                    LedgerText(window, "article-ledger-coverage").Contains("本机完整范围", StringComparison.Ordinal) &&
                    Math.Abs(((GridView)LedgerViewTable(window).View).Columns[0].Width - 420) < 0.1,
                    "explicit view application retained a stale page, changed source mode, or lost the view's own layout");
                AssertLedgerPageGroups(window, 2, 10);
                await ShowLedgerViewTableAsync(window);
                SaveEvidence(window, "ledger-saved-view-columns-account-groups.png");
                LedgerViewControl<ComboBox>(window, "article-ledger-view-select").SelectedValue = saved.Id;
                await ClickLedgerViewAsync(window, "article-ledger-view-delete");
                Check(preferences.Read().Preferences.Views.Single().Id == retained.Id && preferences.Read().Preferences.Layout.GroupBy == "account" &&
                    (await File.ReadAllBytesAsync(businessPath)).SequenceEqual(originalBusiness) && origin.Calls == 0 && sockets.Connects == 0,
                    "deleting a saved view erased the active layout, changed business bytes, or issued HTTP");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ArticleLedgerViewServerAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new ArticleLedgerOrigin();
            var window = await ShowArticleLedgerWindowAsync(root, origin);
            try
            {
                await ClickAsync(window, "文章台账"); await ClickAsync(window, "连接并刷新");
                SetLedgerFilter(window, "q", "服务甲"); SetLedgerFilter(window, "page_size", "10");
                await ClickAsync(window, "应用台账筛选");
                var pagePath = origin.Paths.Last(path => path.StartsWith("/api/v1/articles?", StringComparison.Ordinal));
                var article = origin.Article(0); var key = "/api/v1/articles/" + article["id"]!.GetValue<string>();
                var values = (JsonObject)article.DeepClone(); values["title"] = "原文章本机草稿不可被列配置覆盖 🐟";
                var draft = AppDraft("article", key, article, values); var pending = PreparedOperation(key, PrepareAppSave("article", article, values));
                await Engine(window).SaveDraftAsync(draft); await Engine(window).QueueAsync(pending);
                var businessPath = Field<AtomicWorkspaceStore>(window, "store").FilePath;
                var businessBytes = await File.ReadAllBytesAsync(businessPath); var raw = Engine(window).Snapshot.Cache[pagePath];
                var beforeRequests = origin.Paths.Count;
                await ConfigureLedgerViewAsync(window, ["title", "reads", "account"], "account", 400, 132);
                LedgerViewControl<TextBox>(window, "article-ledger-view-name").Text = "服务端已应用筛选";
                await ClickLedgerViewAsync(window, "article-ledger-view-save-new");
                Check(origin.Paths.Count == beforeRequests && origin.WriteCalls == 0 && Engine(window).Snapshot.Cache[pagePath] == raw &&
                    (await File.ReadAllBytesAsync(businessPath)).SequenceEqual(businessBytes),
                    "column/group/view preferences requested data, rewrote a raw server page, or changed pending work");
                AssertRawLedgerMeta(raw, 1, 10, 27, 100); AssertLedgerPageGroups(window, 1, 10);
                Check(LedgerText(window, "article-ledger-page-summary").Contains("服务端筛选共 27 条", StringComparison.Ordinal) &&
                    LedgerText(window, "article-ledger-page-summary").Contains("服务端总量 100 条", StringComparison.Ordinal),
                    "page-only grouping altered authoritative server totals");
                await SelectListItemAsync(window, "服务甲合成文章00");
                Check(origin.Paths.Contains(key, StringComparer.Ordinal) && PipelineValue(window, "title") == values["title"]!.GetValue<string>() &&
                    SavedAppDraft(Engine(window), key)["original"]?["version"]?.GetValue<long>() == 8 &&
                    Engine(window).Snapshot.Outbox.Single().Id == pending.Id && Engine(window).Snapshot.Outbox.Single().BodyJson == pending.BodyJson &&
                    Engine(window).Snapshot.Outbox.Single().SendAttempts == 0 && origin.WriteCalls == 0 && sockets.Connects == 0,
                    "a grouped GridView row lost its separate full detail, original article draft, version, or immutable pending request");
                SaveEvidence(window, "ledger-grouped-server-row-original-draft.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ArticleLedgerViewRecoveryAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new SyntheticOrigin(denyEveryRequest: true);
            const string first = "10000000-0000-4000-8000-000000001021", second = "10000000-0000-4000-8000-000000001022";
            var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            var firstIdentity = "user:" + first + ":" + firstScope; var secondIdentity = "user:" + second + ":" + secondScope;
            var row = LedgerArticle("same-view-record", "甲恢复清单与未决原稿", "view-account-a", 0);
            var key = "/api/v1/articles/" + row["id"]!.GetValue<string>(); var values = (JsonObject)row.DeepClone(); values["notes"] = "甲尚未确认的原正文";
            var draft = AppDraft("article", key, row, values);
            var unknown = PreparedOperation(key, PrepareAppSave("article", row, values)) with { Status = PendingStatus.Unknown, SendAttempts = 1, Error = "合成结果尚未确认" };
            var firstPath = await SeedLedgerViewWorkspaceAsync(root, firstIdentity, [row], draft, unknown);
            var secondPath = await SeedLedgerViewWorkspaceAsync(root, secondIdentity,
                [LedgerArticle("same-view-record", "乙同ID独立文章", "view-account-a", 100)]);
            RememberProfiles(root, new string('a', 64), first, firstScope, second, secondScope, firstIdentity);
            var preferences = LedgerViewStoreFor(firstPath); var otherPreferences = LedgerViewStoreFor(secondPath);
            var query = new Dictionary<string, string>(StringComparer.Ordinal) { ["q"] = "甲恢复", ["status"] = "published", ["sort"] = "published_at", ["order"] = "desc", ["page_size"] = "10" };
            var seeded = ArticleLedgerViews.SaveView(new LedgerViewPreferences { Layout = ArticleLedgerViews.DefaultLayout() }, "首份恢复视图", query, ArticleLedgerViews.DefaultLayout());
            var firstSaved = preferences.Write(seeded, null);
            var grouped = ArticleLedgerViews.WithLayout(firstSaved.Preferences, new LedgerLayout { GroupBy = "account", Columns = firstSaved.Preferences.Layout.Columns });
            _ = preferences.Write(grouped, firstSaved.ETag);
            var otherSeeded = ArticleLedgerViews.SaveView(new LedgerViewPreferences { Layout = new LedgerLayout { Columns = [new LedgerColumn("title", 640)] } },
                "乙身份独立视图", new Dictionary<string, string> { ["q"] = "乙同ID" }, new LedgerLayout { Columns = [new LedgerColumn("title", 640)] });
            _ = otherPreferences.Write(otherSeeded, null);
            var otherPreferenceBytes = await File.ReadAllBytesAsync(otherPreferences.FilePath);
            var expectedBackup = await File.ReadAllBytesAsync(preferences.BackupPath);
            var firstBusiness = await File.ReadAllBytesAsync(firstPath); var secondBusiness = await File.ReadAllBytesAsync(secondPath);
            var window = await ShowAsync(root, origin);
            try
            {
                await ClickAsync(window, "文章台账");
                var staleSave = LedgerViewControl<Button>(window, "article-ledger-view-save-new");
                LedgerViewControl<TextBox>(window, "article-ledger-view-name").Text = "旧甲控件不能写到乙";
                var beforeSwitch = await File.ReadAllBytesAsync(preferences.FilePath);
                await InvokeAsync(window, "OpenOfflineProfileAsync", secondIdentity); await ClickAsync(window, "文章台账");
                Check(LedgerTitles(window).SequenceEqual(["乙同ID独立文章"]) &&
                    LedgerViewControl<ComboBox>(window, "article-ledger-view-select").Items.Cast<KeyValuePair<string, string>>().Single().Value == "乙身份独立视图" &&
                    ((GridView)LedgerViewTable(window).View).Columns.Count == 1 && Math.Abs(((GridView)LedgerViewTable(window).View).Columns[0].Width - 640) < 0.1,
                    "switching identity reused another owner's saved views or column layout for the same business record ID");
                await ClickDetachedLedgerViewAsync(window, staleSave);
                Check((await File.ReadAllBytesAsync(preferences.FilePath)).SequenceEqual(beforeSwitch) &&
                    (await File.ReadAllBytesAsync(otherPreferences.FilePath)).SequenceEqual(otherPreferenceBytes) &&
                    (await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBusiness) && (await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBusiness),
                    "a detached old-owner preference control changed either identity's preferences or business workspace");
                await InvokeAsync(window, "OpenOfflineProfileAsync", firstIdentity); await ClickAsync(window, "文章台账");
                await CloseAsync(window);
                var damaged = Encoding.UTF8.GetBytes("SYNTHETIC-DAMAGED-LEDGER-PREFERENCES");
                await File.WriteAllBytesAsync(preferences.FilePath, damaged);
                window = await ShowAsync(root, origin); await ClickAsync(window, "文章台账");
                Check(!LedgerViewControl<Button>(window, "article-ledger-view-save-new").IsEnabled &&
                    (await File.ReadAllBytesAsync(preferences.FilePath)).SequenceEqual(damaged) &&
                    (await File.ReadAllBytesAsync(preferences.BackupPath)).SequenceEqual(expectedBackup) && LedgerTitles(window).Count == 1,
                    "damaged view preferences were silently replaced with defaults or made the business ledger unreadable");
                await ClickLedgerViewAsync(window, "article-ledger-views-restore");
                var restored = preferences.Read();
                Check(restored.Preferences.Views.Single().Name == "首份恢复视图" && restored.Preferences.Layout.GroupBy == "none" &&
                    Directory.EnumerateFiles(Path.GetDirectoryName(preferences.FilePath)!, Path.GetFileName(preferences.FilePath) + ".damaged-*")
                        .Any(path => File.ReadAllBytes(path).SequenceEqual(damaged)) &&
                    (await File.ReadAllBytesAsync(preferences.BackupPath)).SequenceEqual(expectedBackup),
                    "explicit view-only backup recovery lost the original bad file, backup, or exact saved view");
                Check((await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBusiness) && (await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBusiness) &&
                    Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown && Engine(window).Snapshot.Outbox.Single().Id == unknown.Id &&
                    Engine(window).Snapshot.Outbox.Single().BodyJson == unknown.BodyJson && Engine(window).Snapshot.Drafts[key].Text == draft.Text,
                    "restoring view preferences restored business state, changed an Unknown request, or erased its local draft");
                LedgerViewControl<Expander>(window, "article-ledger-view-settings").BringIntoView();
                window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle);
                SaveEvidence(window, "ledger-preferences-only-damage-recovery.png");
                await CloseAsync(window);
                var missingEvidence = preferences.FilePath + ".missing-evidence"; File.Move(preferences.FilePath, missingEvidence);
                window = await ShowAsync(root, origin); await ClickAsync(window, "文章台账");
                Check(!File.Exists(preferences.FilePath) && File.Exists(preferences.BackupPath) &&
                    !LedgerViewControl<Button>(window, "article-ledger-view-save-new").IsEnabled,
                    "a missing view primary with an existing backup was silently recreated as empty preferences");
                await ClickLedgerViewAsync(window, "article-ledger-views-restore");
                Check(preferences.Read().Preferences.Views.Single().Name == "首份恢复视图" && File.Exists(missingEvidence) &&
                    Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown && origin.Calls == 0 && sockets.Connects == 0 &&
                    (await File.ReadAllBytesAsync(firstPath)).SequenceEqual(firstBusiness) && (await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBusiness) &&
                    (await File.ReadAllBytesAsync(otherPreferences.FilePath)).SequenceEqual(otherPreferenceBytes),
                    "explicit restoration of a missing preference file changed original evidence, business data, or network behavior");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task<string> SeedLedgerViewWorkspaceAsync(string root, string identity, IReadOnlyList<JsonObject> rows,
        LocalDraft? draft = null, PendingOperation? operation = null)
    {
        using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector());
        var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
        var accounts = rows.Select(row => row["account_id"]!.GetValue<string>()).Distinct(StringComparer.Ordinal).Select(id =>
            (JsonNode?)Object(("id", id), ("name", "同名好多鱼"), ("platform", "toutiao"))).ToArray();
        state.Cache["/api/v1/accounts"] = Wrap(new JsonArray(accounts));
        state.Cache["/api/v1/articles"] = Object(("data", new JsonArray(rows.Select(row => row.DeepClone()).ToArray())),
            ("meta", Object(("total", rows.Count), ("has_more", false))), ("_local_complete", true)).ToJsonString();
        foreach (var row in rows) state.Cache["/api/v1/articles/" + row["id"]!.GetValue<string>()] = Wrap(row.DeepClone());
        foreach (var path in state.Cache.Keys) state.CacheRevisions[path] = 1;
        if (draft != null) state.Drafts[draft.Key] = draft; if (operation != null) state.Outbox.Add(operation);
        await store.SaveAsync(state); return store.FilePath;
    }

    private static EncryptedLedgerViewStore LedgerViewStoreFor(string businessPath)
    {
        var directory = Path.GetDirectoryName(businessPath)!;
        return new EncryptedLedgerViewStore(directory, Path.GetFileName(directory), new WindowsProtector());
    }
    private static T LedgerViewControl<T>(MainWindow window, string id) where T : FrameworkElement
    {
        var page = Field<StackPanel>(window, "page");
        var settings = Descendants(page).OfType<Expander>().Single(control => AutomationProperties.GetAutomationId(control) == "article-ledger-view-settings");
        settings.IsExpanded = true;
        return Descendants(page).OfType<T>().Single(control => AutomationProperties.GetAutomationId(control) == id);
    }
    private static ListView LedgerViewTable(MainWindow window) => LedgerViewControl<ListView>(window, "article-ledger-table");
    private static async Task ClickLedgerViewAsync(MainWindow window, string id) => await ClickDetachedLedgerViewAsync(window, LedgerViewControl<Button>(window, id));
    private static async Task ClickDetachedLedgerViewAsync(MainWindow window, Button button)
    {
        Check(button.IsEnabled, "native ledger preference action is unexpectedly disabled: " + AutomationProperties.GetAutomationId(button));
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static async Task ConfigureLedgerViewAsync(MainWindow window, string[] keys, string group, double titleWidth, double readsWidth)
    {
        LedgerViewControl<Expander>(window, "article-ledger-view-settings").IsExpanded = true;
        Descendants(Field<StackPanel>(window, "page")).OfType<Expander>().Single(expander => expander.Header?.ToString() == "列的显示、顺序与宽度").IsExpanded = true;
        window.UpdateLayout();
        var columns = LedgerViewControl<ListBox>(window, "article-ledger-columns");
        foreach (var item in columns.Items.Cast<ListBoxItem>())
        {
            var key = item.Tag!.ToString()!;
            LedgerViewControl<CheckBox>(window, "article-ledger-column-visible-" + key).IsChecked = keys.Contains(key, StringComparer.Ordinal);
        }
        for (var target = 0; target < keys.Length; target++)
        {
            var selected = columns.Items.Cast<ListBoxItem>().Single(item => item.Tag?.ToString() == keys[target]); columns.SelectedItem = selected;
            for (var attempt = 0; columns.Items.IndexOf(selected) > target && attempt < ArticleLedgerViews.ColumnCatalog.Count; attempt++)
                await ClickLedgerViewAsync(window, "article-ledger-column-up");
            Check(columns.Items.IndexOf(selected) == target, "the actual native column move action did not move the selected column into position");
        }
        LedgerViewControl<TextBox>(window, "article-ledger-column-width-title").Text = titleWidth.ToString(System.Globalization.CultureInfo.InvariantCulture);
        LedgerViewControl<TextBox>(window, "article-ledger-column-width-reads").Text = readsWidth.ToString(System.Globalization.CultureInfo.InvariantCulture);
        LedgerViewControl<ComboBox>(window, "article-ledger-group").SelectedValue = group;
        await ClickLedgerViewAsync(window, "article-ledger-layout-apply");
    }
    private static async Task ShowLedgerViewTableAsync(MainWindow window)
    {
        LedgerViewControl<Expander>(window, "article-ledger-view-settings").IsExpanded = false;
        Descendants(Field<StackPanel>(window, "page")).OfType<Expander>().Single(expander => expander.Tag?.ToString() == "article-ledger-filters").IsExpanded = false;
        var table = LedgerViewTable(window);
        LedgerViewControl<Expander>(window, "article-ledger-view-settings").IsExpanded = false;
        table.BringIntoView(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(table.IsVisible && table.ActualHeight > 0, "ledger screenshot did not expose the native table in a shown window");
    }
    private static async Task AssertLedgerMetricCellAsync(MainWindow window, string titleSuffix, string expected)
    {
        var table = LedgerViewTable(window);
        var item = table.Items.Cast<WorkspaceListItem>().Single(row => row.Title.EndsWith(titleSuffix, StringComparison.Ordinal));
        table.BringIntoView(); table.ScrollIntoView(item); window.UpdateLayout();
        await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        var container = table.ItemContainerGenerator.ContainerFromItem(item) as ListViewItem;
        Check(container is not null && Descendants(container).OfType<TextBlock>().Any(cell => cell.Text == expected),
            "the actual bound native metric cell did not display the expected zero or missing-data label: " + expected);
    }
    private static void AssertLedgerPageGroups(MainWindow window, int count, int rows)
    {
        var table = LedgerViewTable(window); var view = CollectionViewSource.GetDefaultView(table.ItemsSource);
        var groups = view.Groups?.Cast<CollectionViewGroup>().ToArray() ?? [];
        Check(view.GroupDescriptions.Count == 1 && groups.Length == count && groups.Sum(group => group.ItemCount) == rows && table.Items.Count == rows &&
            groups.Select(group => group.Name?.ToString()).Distinct(StringComparer.Ordinal).Count() == count,
            "native account grouping merged same-name account IDs, counted the whole inventory, or lost current-page rows");
        Check(VisibleText(window).Contains("本页", StringComparison.Ordinal), "page-only account groups were not explicitly labelled as current-page counts");
    }
}
