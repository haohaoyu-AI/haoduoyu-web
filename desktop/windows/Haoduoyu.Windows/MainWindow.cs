using System.ComponentModel;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Microsoft.Win32;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow : Window
{
    private readonly string root;
    private readonly WindowsProtector protector = new();
    private readonly WorkbenchApi api;
    private readonly DockPanel shell = new();
    private readonly StackPanel page = new() { Margin = new Thickness(24) };
    private readonly TextBlock status = new() { TextWrapping = TextWrapping.Wrap, Margin = new Thickness(20, 10, 20, 10) };
    private readonly TextBlock heading = new() { FontSize = 26, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 0, 0, 16) };
    private readonly DatePicker date = new() { SelectedDate = BeijingNow().Date, MinWidth = 160, Margin = new Thickness(0, 0, 8, 8) };
    private readonly SemaphoreSlim actions = new(1, 1);
    private readonly DispatcherTimer draftTimer = new() { Interval = TimeSpan.FromMilliseconds(350) };
    private AtomicWorkspaceStore? store;
    private SyncEngine? engine;
    private LocalSettings settings = new();
    private Func<Task>? saveEditor;
    private string currentPage = "待办";
    private bool connected, closing, draftDirty, suppressDate;
    private string? currentIdentity, failedIdentity;
    private Task draftWrites = Task.CompletedTask;
    private int articlePage = 1;
    private string articleStatus = "published";
    private CancellationTokenSource? actionCancellation;
    private bool closeRequested;
    private CancellationToken NetworkToken => actionCancellation?.Token ?? CancellationToken.None;

    public MainWindow() : this(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Haoduoyu", "NativeWorkbench", "v1"), new WorkbenchApi()) { }

    internal MainWindow(string dataRoot, WorkbenchApi transport)
    {
        if (!Path.IsPathFullyQualified(dataRoot)) throw new ArgumentException("工作区目录必须为明确的绝对路径。", nameof(dataRoot));
        root = Path.GetFullPath(dataRoot);
        api = transport ?? throw new ArgumentNullException(nameof(transport));
        Title = "好多鱼 · 独立工作台（开发候选）";
        Width = 1280; Height = 850; MinWidth = 940; MinHeight = 620;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var top = new WrapPanel { Margin = new Thickness(20, 16, 20, 8) };
        top.Children.Add(new TextBlock { Text = "好多鱼", FontSize = 24, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 24, 8) });
        top.Children.Add(Button("连接并刷新", ConnectAsync));
        top.Children.Add(Button("同步已排队操作", SyncAsync));
        top.Children.Add(Button("所有者登录", LoginAsync));
        top.Children.Add(Button("回到公开工作区", PublicAsync));
        top.Children.Add(Button("本机工作区", ChooseOfflineProfileAsync));
        top.Children.Add(Button("准备离线资料", PrepareOfflineAsync));
        var cancelNetwork = new Button { Content = "取消当前操作" };
        cancelNetwork.Click += (_, _) => { actionCancellation?.Cancel(); Message("正在停止当前操作；已落盘的稿件和未确认请求会保留。"); };
        top.Children.Add(cancelNetwork);
        DockPanel.SetDock(top, Dock.Top); shell.Children.Add(top);
        DockPanel.SetDock(status, Dock.Bottom); shell.Children.Add(status);
        var nav = new StackPanel { Width = 170, Margin = new Thickness(16, 8, 0, 8) };
        foreach (var name in new[] { "待办", "待办日历", "未安排", "生活记录", "工作记录", "碎碎念月历", "标签", "备忘录", "工作提醒", "AI汇报", "文章台账", "发布对账", "内容复盘", "数据复盘", "回收站", "本机草稿", "本机检索", "同步中心", "历史档案", "本机与恢复" })
        {
            var target = name;
            nav.Children.Add(Button(name, () => NavigateAsync(target)));
        }
        var navigation = new ScrollViewer { Content = nav, Width = 190, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };
        DockPanel.SetDock(navigation, Dock.Left); shell.Children.Add(navigation);
        shell.Children.Add(new ScrollViewer { Content = page, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Content = shell;
        draftTimer.Tick += async (_, _) => { draftTimer.Stop(); await SaveDraftSafelyAsync(); };
        date.SelectedDateChanged += (_, _) => { if (!suppressDate) Run(() => NavigateAsync(currentPage)); };
        Closing += OnClosing;
        Loaded += (_, _) => Run(InitializeAsync);
        CommandBindings.Add(new CommandBinding(ApplicationCommands.Save, (_, _) => Run(SaveDraftSafelyAsync)));
        InputBindings.Add(new KeyBinding(ApplicationCommands.Save, Key.S, ModifierKeys.Control));
        InputBindings.Add(new KeyBinding(new RelayCommand(() => Run(ConnectAsync)), Key.F5, ModifierKeys.None));
        InputBindings.Add(new KeyBinding(new RelayCommand(() => Run(() => NavigateAsync("本机检索"))), Key.F, ModifierKeys.Control));
    }

    internal async Task WaitForIdleAsync()
    {
        await actions.WaitAsync();
        actions.Release();
        await draftWrites;
    }

    private static DateTimeOffset BeijingNow() => DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
    private string Day => (date.SelectedDate ?? BeijingNow().Date).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private SyncEngine Engine => engine ?? throw new InvalidOperationException("本机工作区尚未打开。");
    private static string Text(JsonNode? node, string key) => node?[key]?.ToString() ?? "";
    private static long Version(JsonNode? node) => long.TryParse(Text(node, "version"), out var n) ? n : 0;
    private static bool Flag(JsonNode? node, string key) => Text(node, key) is "true" or "True" or "1";
    private static JsonObject Obj(params (string, JsonNode?)[] values) { var o = new JsonObject(); foreach (var (k, v) in values) o[k] = v; return o; }
    private static JsonNode? Data(string json) => JsonNode.Parse(json)?["data"]?.DeepClone();
    private static IEnumerable<JsonObject> Rows(JsonNode? node) => node is JsonArray a ? a.OfType<JsonObject>() : [];
    private void Message(string value) => status.Text = value;
    private static TextBlock Label(string value) => new() { Text = value, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 8) };
    private Button Button(string label, Func<Task> action)
    {
        var b = new Button { Content = label };
        b.Click += (_, _) => Run(action);
        return b;
    }
    private async void Run(Func<Task> action)
    {
        if (!await actions.WaitAsync(0)) { Message("上一项操作尚未结束，请稍候。"); return; }
        using var cancellation = new CancellationTokenSource();
        actionCancellation = cancellation;
        page.IsEnabled = false;
        try { await action(); }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        { Message("当前操作已取消。已落盘的草稿和未确认请求保留，未自动重放。"); }
        catch (Exception error) { Message("操作未完成：" + SafeError(error)); }
        finally
        {
            actionCancellation = null; page.IsEnabled = true; actions.Release();
            if (closeRequested) _ = Dispatcher.BeginInvoke(Close);
        }
    }
    private static string SafeError(Exception error) => error switch
    {
        HttpRequestException => "网络不可用，本机副本和未确认操作已保留。",
        TaskCanceledException => "网络请求超时，已保留本机状态。",
        _ => error.Message
    };

    private async Task InitializeAsync()
    {
        settings = SettingsFile.Read(root, protector);
        await OpenWorkspaceAsync(OfflineProfiles.InitialIdentity(settings));
        await NavigateAsync("待办");
        Message("离线打开 · 已保存的页面可查看，本机草稿可继续编辑。连接后核对服务身份，才会发送排队操作。");
    }
    private async Task OpenWorkspaceAsync(string identity)
    {
        await FlushEditorAsync();
        if (identity == currentIdentity && engine != null) return;
        ResetReconciliationView();
        ResetTodoHistoryView();
        ResetNoteHistoryView();
        ResetMediaReviewView();
        ResetTemplateArchiveView();
        ResetArticleLedgerView();
        ClearPage();
        failedIdentity = identity;
        store?.Dispose(); store = null; engine = null;
        var next = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, protector);
        try
        {
            var candidate = new SyncEngine(next, api);
            await Task.Run(() => candidate.InitializeAsync());
            store = next; engine = candidate; currentIdentity = identity; failedIdentity = null;
            await RebaseConfirmedDraftsAsync();
        }
        catch { next.Dispose(); store = null; engine = null; currentIdentity = null; failedIdentity = identity; throw; }
    }
    private async Task ConnectAsync()
    {
        await FlushEditorAsync();
        connected = false;
        var profile = currentIdentity == null ? null : OfflineProfiles.Get(settings, currentIdentity);
        if (profile is { IsPublic: false } && (api.PublicMode || api.UserId != profile.UserId))
            throw new InvalidOperationException("此私有工作区可以离线续编。请先使用它的原账号登录，再连接同步；不会把它切到其他身份或发送旧队列。");
        var scope = await api.ReadScopeIdAsync(NetworkToken);
        var old = settings.PublicScope;
        if (api.PublicMode)
        {
            await OpenWorkspaceAsync("public:" + scope);
            settings = OfflineProfiles.RememberPublic(settings, scope);
        }
        else
        {
            await OpenWorkspaceAsync("user:" + (api.UserId ?? throw new InvalidOperationException("登录身份缺失，请重新登录。")) + ":" + scope);
            settings = OfflineProfiles.RememberUser(settings, api.UserId!, api.Username ?? throw new InvalidOperationException("登录身份缺失。"), scope);
        }
        SettingsFile.Write(root, settings, protector);
        api.BindScope(scope);
        connected = true;
        await NavigateAsync(currentPage);
        if (!connected) { Message("工作区身份已核对；本次资料读取中断，当前显示本机副本。请恢复连接后再同步。"); return; }
        Message(old != null && old != scope && api.PublicMode
            ? "服务工作区身份已变化，已打开独立分区。旧本机文件完整保留，旧队列不会发送到新工作区。"
            : "已连接 haoduoyu.xyz · 已核对工作区身份。保存先落本机，再按原版本同步。");
    }
    private async Task PublicAsync()
    {
        await FlushEditorAsync();
        // Do not invalidate a server session merely to view public data. Transport drops local cookies.
        api.UsePublicMode(); connected = false;
        var identity = OfflineProfiles.PublicIdentity(settings);
        settings = OfflineProfiles.Select(settings, identity);
        SettingsFile.Write(root, settings, protector);
        await OpenWorkspaceAsync(identity);
        await NavigateAsync("待办");
        Message("已打开公开工作区的本机分区。原账户草稿和操作保留；点击连接后核对身份。");
    }
    private async Task LoginAsync()
    {
        await FlushEditorAsync();
        var panel = new StackPanel { Margin = new Thickness(24) };
        panel.Children.Add(Label("使用现有所有者账号。密码仅用于本次登录，不保存到本机文件。"));
        panel.Children.Add(Label("账号")); var user = new TextBox(); panel.Children.Add(user);
        panel.Children.Add(Label("密码")); var password = new PasswordBox { Padding = new Thickness(10), Margin = new Thickness(0, 4, 0, 16) }; panel.Children.Add(password);
        var submit = new Button { Content = "登录" }; panel.Children.Add(submit);
        var dialog = Dialog("所有者登录", panel, 480, 340);
        submit.Click += (_, _) => dialog.DialogResult = true;
        if (dialog.ShowDialog() != true) return;
        var loginPassword = password.Password; password.Clear();
        try
        {
            var session = await api.LoginAsync(user.Text.Trim(), loginPassword, NetworkToken);
            connected = false;
            var scope = await api.ReadScopeIdAsync(NetworkToken);
            await OpenWorkspaceAsync("user:" + session.UserId + ":" + scope);
            settings = OfflineProfiles.RememberUser(settings, session.UserId, session.Username, scope);
            SettingsFile.Write(root, settings, protector);
            api.BindScope(scope); connected = true;
            await NavigateAsync("待办");
            if (!connected) { Message("账号已核对，资料读取中断。当前可继续本机编辑；恢复连接后再同步。"); return; }
            Message("已登录 " + session.Username + " · 下次无网也可继续本机编辑；联网发送前仍需原账号登录并核对服务身份。");
        }
        catch
        {
            api.UsePublicMode(); connected = false;
            // Failed authentication never selects another profile or moves its drafts/outbox.
            throw;
        }
        finally { loginPassword = ""; }
    }

    private async Task<JsonNode?> ReadAsync(string path)
    {
        var local = await ProjectedDataAsync(path);
        if (local is JsonObject && Flag(local, "_local_new")) return local;
        if (connected)
        {
            try
            {
                var result = await ReadBoundAsync(path);
                if (!result.IsSuccess) throw new InvalidOperationException($"读取失败 HTTP {result.StatusCode}。请求号：{result.RequestId ?? "未返回"}。原缓存保留。");
                var parsed = await Task.Run(() => Data(result.Json)) ?? throw new InvalidDataException("服务响应没有 data，原缓存保留。");
                await Task.Run(() => Engine.CacheAsync(path, result.Json));
                return await ProjectedDataAsync(path, result.Json) ?? parsed;
            }
            catch (ScopeGuardException error) { connected = false; Message(error.Message); }
            catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException)
            { connected = false; Message("连接中断，显示本机已保存副本。" ); }
        }
        return local;
    }
    private Task<JsonNode?> ProjectedDataAsync(string path, string? cached = null)
    {
        var target = Engine;
        return Task.Run(() =>
        {
            var snapshot = target.Snapshot;
            var projected = WorkspaceProjection.Project(path, cached ?? snapshot.Cache.GetValueOrDefault(path), snapshot);
            return projected == null ? null : Data(projected);
        });
    }
    private async Task<ApiResult> ReadBoundAsync(string path)
    {
        var result = await Engine.ReadRemoteAsync(path, NetworkToken);
        if (!result.IsSuccess) return result;
        var returnedScope = await api.ReadScopeIdAsync(NetworkToken);
        var returnedIdentity = api.PublicMode ? "public:" + returnedScope : "user:" + api.UserId + ":" + returnedScope;
        if (returnedIdentity != currentIdentity)
        {
            connected = false;
            throw new ScopeGuardException("读取期间工作区归属已变化；该响应未写入旧分区。请重新连接，旧缓存和草稿保留。");
        }
        return result;
    }
    private async Task NavigateAsync(string name)
    {
        await FlushEditorAsync(); currentPage = name;
        ClearPage(); heading.Text = name; page.Children.Add(heading);
        var bar = new WrapPanel(); page.Children.Add(bar);
        if (new[] { "待办", "生活记录", "工作记录", "工作提醒", "数据复盘", "AI汇报", "回收站" }.Contains(name))
        {
            if (date.Parent is Panel old) old.Children.Remove(date);
            bar.Children.Add(date); bar.Children.Add(Button("今天（北京）", async () =>
            {
                suppressDate = true;
                try { date.SelectedDate = BeijingNow().Date; } finally { suppressDate = false; }
                await NavigateAsync(currentPage);
            }));
        }
        switch (name)
        {
            case "待办": await TodosAsync(bar); break;
            case "常用事项": await TemplatesAsync(); break;
            case "待办日历": await TodoHistoryAsync(); break;
            case "碎碎念月历": await NoteHistoryAsync(); break;
            case "未安排": await UnscheduledAsync(); break;
            case "标签": await LabelsAsync(); break;
            case "生活记录": case "工作记录": await NotesAsync(bar, name == "生活记录" ? "life" : "work"); break;
            case "备忘录": await MemosAsync(bar); break;
            case "工作提醒": await RemindersAsync(bar); break;
            case "文章台账": await ArticlesAsync(bar); break;
            case "发布对账": await ArticleReconciliationAsync(); break;
            case "数据复盘": await ReviewsAsync(bar); break;
            case "内容复盘": await ContentReviewAsync(); break;
            case "AI汇报": await AiReportsAsync(); break;
            case "回收站": await RecycleAsync(); break;
            case "本机草稿": DraftsPage(); break;
            case "本机检索": await LocalSearchAsync(); break;
            case "同步中心": SyncPage(); break;
            case "历史档案": await HistoryArchivesAsync(); break;
            case "本机与恢复": RecoveryPage(); break;
        }
    }
    private void Missing(JsonNode? data)
    {
        if (data == null) page.Children.Add(Label("本机尚未保存此页面。连接后刷新可获取；本机草稿和已排队操作可离线继续查看。"));
        else if (!connected) page.Children.Add(Label("本机已保存副本 · 列表可能落后于其他设备，写入将由服务端检查版本。"));
    }
    private async Task QueueAsync(string method, string path, JsonObject body, string resource)
    {
        await FlushEditorAsync();
        if (method == "POST" && path == "/api/v1/articles" && Engine.Snapshot.Drafts.TryGetValue(resource, out var recoveredArticle) && recoveredArticle.RecoveredAtRevision > 0)
            throw new InvalidOperationException("此文章稿来自回退备份，可能缺少后来已创建文章的回执。原稿可编辑和导出；请先从文章台账核对并打开服务器记录，不能再次创建。");
        if (method == "POST" && path == "/api/v1/articles" && Engine.Snapshot.Outbox.Any(o => o.ResourceKey == resource && o.Method == "POST" && o.Path == path && o.Status == PendingStatus.Confirmed))
            throw new InvalidOperationException("这份文章创建请求已确认。请从文章清单打开其服务器记录继续编辑；原稿已保留，不能再次创建。");
        var id = Guid.NewGuid().ToString();
        if (body.ContainsKey("save_id")) body["save_id"] = id;
        if (path.StartsWith("/api/v1/articles", StringComparison.Ordinal) && body["status"] is JsonValue) articleStatus = Text(body, "status");
        var related = Engine.Snapshot.Outbox.LastOrDefault(o => o.Path == path && o.Method == method &&
            o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        var pathParts = path.Split('?', 2);
        var restorePath = pathParts[0] + "/restore" + (pathParts.Length == 2 ? "?" + pathParts[1] : "");
        var restoring = Engine.Snapshot.Outbox.LastOrDefault(o => o.Path == restorePath && o.Method == "POST" &&
            o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        string? versionFrom = null;
        IReadOnlyList<string> dependencies = CreationDependencies(path, body);
        if (related?.VersionFromDependencyId is { } existingVersion)
        {
            resource = related.ResourceKey; versionFrom = existingVersion;
            dependencies = related.DependencyIds; body.Remove("version");
        }
        else if (restoring != null && (method is "PUT" or "PATCH") && body.ContainsKey("version"))
        {
            resource = "/local/after-restore/" + resource;
            dependencies = [restoring.Id]; versionFrom = restoring.Id; body.Remove("version");
        }
        var pending = new PendingOperation { Id = id, Method = method, Path = path, BodyJson = body.ToJsonString(), ResourceKey = resource,
            DependencyIds = dependencies, VersionFromDependencyId = versionFrom };
        await QueuePreparedAsync(pending);
        Message("已安全存入本机待同步队列。" );
        if (connected) await SyncToPageAsync(currentPage); else await NavigateAsync(currentPage);
    }
    private async Task SyncAsync()
        => await SyncToPageAsync("同步中心");

    private async Task SyncToPageAsync(string targetPage)
    {
        await FlushEditorAsync();
        if (!connected) throw new InvalidOperationException("请先连接并核对工作区身份。离线队列已保留。");
        var report = await Task.Run(() => Engine.SyncAsync(NetworkToken));
        await RebaseConfirmedDraftsAsync();
        await NavigateAsync(report.Conflicts + report.Blocked + report.Unknown > 0 ? "同步中心" : targetPage);
        Message($"本轮确认 {report.Confirmed} 项；冲突 {report.Conflicts}；受阻 {report.Blocked}；结果未知 {report.Unknown}；仍排队 {report.Queued}。未知请求不会自动再次发送。" );
    }

    private async Task RebaseConfirmedDraftsAsync()
    {
        foreach (var operation in Engine.Snapshot.Outbox.Where(o => o.Status == PendingStatus.Confirmed && o.RemoteJson != null).OrderBy(o => o.ConfirmedRevision))
        {
            if (!Engine.Snapshot.Drafts.TryGetValue(operation.ResourceKey, out var draft)) continue;
            if (operation.ConfirmedRevision <= draft.BaselineConfirmedRevision) continue;
            var saved = JsonNode.Parse(draft.Text)?.AsObject();
            if (saved == null || saved["original"] is not JsonObject original || saved["values"] is not JsonObject values) continue;
            var kind = Text(saved, "kind");
            if (kind is not ("todo" or "template" or "note" or "legacy" or "memo" or "group" or "reminder" or "article")) continue;
            var target = DraftTarget(kind, original);
            var queuedBody = JsonNode.Parse(operation.RequestBodyJson)?.AsObject();
            var targetParts = target.Path.Split('?', 2);
            var ownRestore = operation.Method == "POST" && operation.Path == targetParts[0] + "/restore" + (targetParts.Length == 2 ? "?" + targetParts[1] : "");
            if ((!ownRestore && (target.Method != operation.Method || target.Path != operation.Path)) || queuedBody == null || Version(original) != Version(queuedBody)) continue;
            var remote = Data(operation.RemoteJson!);
            if (remote is not JsonObject || Version(remote) <= Version(original)) continue;
            var serverAssignedArticle = kind == "article" && operation.Method == "POST" && operation.Path == "/api/v1/articles" && Version(original) == 0;
            if (kind != "legacy" && !serverAssignedArticle && Text(remote, "id") != Text(original, "id")) continue;
            if (kind == "legacy" && Text(remote, "date") != Text(original, "date")) continue;
            var baseline = (JsonObject)remote.DeepClone();
            if (kind == "legacy") baseline["category"] = Text(original, "category");
            saved["original"] = baseline;
            // The current baseline must equal our confirmed request's exact base. Retain later
            // unsent values; an old receipt cannot roll a newer baseline back.
            await SaveLocalDraftAsync(draft with { Text = saved.ToJsonString(), BaseVersion = Version(remote), BaselineConfirmedRevision = operation.ConfirmedRevision });
        }
        await RebaseReviewDraftsAsync();
    }

    private static (string Method, string Path) DraftTarget(string kind, JsonObject original)
    {
        var id = Text(original, "id");
        return kind switch
        {
            "todo" => ("POST", "/api/v1/todos"),
            "template" when Version(original) == 0 => ("POST", "/api/v1/todo-templates"),
            "template" => ("PATCH", "/api/v1/todo-templates/" + id),
            "note" => ("PUT", "/api/v1/note-entries/" + id),
            "legacy" => ("PUT", "/api/v1/daily-notes/" + Text(original, "date") + "?category=" + Text(original, "category")),
            "group" => ("PUT", "/api/v1/memos/groups/" + id),
            "memo" => ("PUT", "/api/v1/memos/notes/" + id),
            "reminder" => ("PUT", "/api/v1/work-reminders/" + id),
            "article" when Version(original) == 0 => ("POST", "/api/v1/articles"),
            "article" => ("PUT", "/api/v1/articles/" + id),
            _ => ("", "")
        };
    }

    private Task SaveLocalDraftAsync(LocalDraft draft)
    {
        var target = Engine;
        var previous = draftWrites;
        var next = PersistInOrderAsync(previous, target, draft);
        draftWrites = next;
        return next;
    }
    private static async Task PersistInOrderAsync(Task previous, SyncEngine target, LocalDraft draft)
    {
        try { await previous; }
        catch (Exception) { /* A subsequent explicit save may recover from a previous failed disk attempt. */ }
        if (target.Snapshot.Drafts.TryGetValue(draft.Key, out var previousDraft))
        {
            if (draft.BaselineConfirmedRevision < previousDraft.BaselineConfirmedRevision)
            {
                var saved = JsonNode.Parse(draft.Text)?.AsObject();
                var confirmed = JsonNode.Parse(previousDraft.Text)?.AsObject();
                if (saved == null || confirmed?["original"] is not JsonObject baseline || Text(saved, "kind") != Text(confirmed, "kind"))
                    throw new InvalidDataException("较早编辑稿与已确认基线不匹配，原稿保留，未覆盖。");
                saved["original"] = baseline.DeepClone();
                draft = draft with { Text = saved.ToJsonString(), BaseVersion = previousDraft.BaseVersion, BaselineConfirmedRevision = previousDraft.BaselineConfirmedRevision };
            }
        }
        await Task.Run(() => target.SaveDraftAsync(draft));
    }

    private ListBox List(IEnumerable<(string title, string subtitle, Func<Task> open)> rows)
    {
        var items = rows.Select(row => new WorkspaceListItem(row.title, row.subtitle, row.open)).ToArray();
        var list = new ListBox { MinHeight = 160, MaxHeight = 490, ItemsSource = items };
        list.SelectionChanged += (_, _) => { if (list.SelectedItem is WorkspaceListItem selected) Run(selected.Open); };
        page.Children.Add(list);
        if (items.Length == 0) page.Children.Add(Label("当前清单为空。"));
        return list;
    }
    private static Window Dialog(string title, UIElement content, double width = 850, double height = 650) => new()
    { Title = title, Content = new ScrollViewer { Content = content, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }, Width = width, Height = height,
        WindowStartupLocation = WindowStartupLocation.CenterOwner, Owner = Application.Current.MainWindow };
    private void ShowText(string title, string value)
    {
        var box = new TextBox { Text = value, IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(20), VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Dialog(title, box).ShowDialog();
    }
    private bool Confirm(string text) => MessageBox.Show(this, text, "请核对", MessageBoxButton.YesNo, MessageBoxImage.Question) == MessageBoxResult.Yes;
    private Task ExportTextAsync(string name, string value)
    {
        var dialog = new SaveFileDialog { FileName = name, Filter = "纯文本 (*.txt)|*.txt", AddExtension = true, OverwritePrompt = true };
        if (dialog.ShowDialog(this) == true) { File.WriteAllText(dialog.FileName, value, new System.Text.UTF8Encoding(false)); Message("已按所选路径导出纯文本。文件未加密，请自行保管。" ); }
        return Task.CompletedTask;
    }
    private async Task FlushEditorAsync()
    {
        draftTimer.Stop();
        while (saveEditor != null && draftDirty) await saveEditor();
    }
    private void ClearPage()
    {
        saveEditor = null; draftDirty = false; draftTimer.Stop(); page.Children.Clear();
    }
    private async Task SaveDraftSafelyAsync()
    {
        try { if (saveEditor != null && draftDirty) { await saveEditor(); if (!draftDirty) Message("本机草稿已保存 · 尚未表示服务器已保存。" ); } }
        catch (Exception error) { Message("本机草稿未落盘：" + SafeError(error) + "。请保持窗口打开或导出文字。" ); }
    }
    private async void OnClosing(object? sender, CancelEventArgs e)
    {
        if (closing) return;
        e.Cancel = true;
        if (!await actions.WaitAsync(0))
        {
            closeRequested = true; actionCancellation?.Cancel();
            Message("正在结束当前联网并保全未确认请求，随后保存草稿并关闭。"); return;
        }
        closeRequested = false;
        try
        {
            await FlushEditorAsync();
            closing = true; store?.Dispose(); api.Dispose(); _ = Dispatcher.BeginInvoke(Close);
        }
        catch (Exception error) { Message("关闭前未能保存草稿：" + SafeError(error) + "。原窗口保留，请导出文字后处理。" ); }
        finally { actions.Release(); }
    }
    private sealed class RelayCommand(Action action) : ICommand
    {
        public bool CanExecute(object? parameter) => true;
        public void Execute(object? parameter) => action();
        public event EventHandler? CanExecuteChanged { add { } remove { } }
    }
}
