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
    private readonly string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Haoduoyu", "NativeWorkbench", "v1");
    private readonly WindowsProtector protector = new();
    private readonly WorkbenchApi api = new();
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

    public MainWindow()
    {
        Title = "好多鱼 · 独立工作台（开发候选）";
        Width = 1280; Height = 850; MinWidth = 940; MinHeight = 620;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        var top = new WrapPanel { Margin = new Thickness(20, 16, 20, 8) };
        top.Children.Add(new TextBlock { Text = "好多鱼", FontSize = 24, FontWeight = FontWeights.Bold, Margin = new Thickness(0, 0, 24, 8) });
        top.Children.Add(Button("连接并刷新", ConnectAsync));
        top.Children.Add(Button("同步已排队操作", SyncAsync));
        top.Children.Add(Button("所有者登录", LoginAsync));
        top.Children.Add(Button("回到公开工作区", PublicAsync));
        DockPanel.SetDock(top, Dock.Top); shell.Children.Add(top);
        DockPanel.SetDock(status, Dock.Bottom); shell.Children.Add(status);
        var nav = new StackPanel { Width = 170, Margin = new Thickness(16, 8, 0, 8) };
        foreach (var name in new[] { "待办", "未安排", "生活记录", "工作记录", "标签", "备忘录", "工作提醒", "文章台账", "内容复盘", "数据复盘", "本机草稿", "同步中心", "本机与恢复" })
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
        page.IsEnabled = false;
        try { await action(); }
        catch (Exception error) { Message("操作未完成：" + SafeError(error)); }
        finally { page.IsEnabled = true; actions.Release(); }
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
        await OpenWorkspaceAsync("public:" + (settings.PublicScope ?? "unbound"));
        await NavigateAsync("待办");
        Message("离线打开 · 已保存的页面可查看，本机草稿可继续编辑。连接后核对服务身份，才会发送排队操作。");
    }
    private async Task OpenWorkspaceAsync(string identity)
    {
        await FlushEditorAsync();
        if (identity == currentIdentity && engine != null) return;
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
        var scope = await api.ReadScopeIdAsync();
        var old = settings.PublicScope;
        if (api.PublicMode)
        {
            await OpenWorkspaceAsync("public:" + scope);
            settings = settings with { PublicScope = scope };
            SettingsFile.Write(root, settings, protector);
        }
        else await OpenWorkspaceAsync("user:" + (api.UserId ?? throw new InvalidOperationException("登录身份缺失，请重新登录。")) + ":" + scope);
        api.BindScope(scope);
        connected = true;
        await NavigateAsync(currentPage);
        Message(old != null && old != scope && api.PublicMode
            ? "服务工作区身份已变化，已打开独立分区。旧本机文件完整保留，旧队列不会发送到新工作区。"
            : "已连接 haoduoyu.xyz · 已核对工作区身份。保存先落本机，再按原版本同步。");
    }
    private async Task PublicAsync()
    {
        await FlushEditorAsync();
        // Do not invalidate a server session merely to view public data. Transport drops local cookies.
        api.UsePublicMode(); connected = false;
        await OpenWorkspaceAsync("public:" + (settings.PublicScope ?? "unbound"));
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
            var session = await api.LoginAsync(user.Text.Trim(), loginPassword);
            connected = false;
            var scope = await api.ReadScopeIdAsync();
            await OpenWorkspaceAsync("user:" + session.UserId + ":" + scope);
            api.BindScope(scope); connected = true;
            await NavigateAsync("待办");
            Message("已登录 " + session.Username + " · 独立本机分区已打开。本候选版本退出后需重新登录，账户文件保留。");
        }
        catch
        {
            api.UsePublicMode(); connected = false;
            await OpenWorkspaceAsync("public:" + (settings.PublicScope ?? "unbound"));
            throw;
        }
        finally { loginPassword = ""; }
    }

    private async Task<JsonNode?> ReadAsync(string path)
    {
        if (connected)
        {
            try
            {
                var result = await Engine.ReadRemoteAsync(path);
                if (!result.IsSuccess) throw new InvalidOperationException($"读取失败 HTTP {result.StatusCode}。请求号：{result.RequestId ?? "未返回"}。原缓存保留。");
                var parsed = Data(result.Json) ?? throw new InvalidDataException("服务响应没有 data，原缓存保留。");
                await Task.Run(() => Engine.CacheAsync(path, result.Json));
                return parsed;
            }
            catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException)
            { connected = false; Message("连接中断，显示本机已保存副本。" ); }
        }
        return Engine.Snapshot.Cache.TryGetValue(path, out var cached) ? Data(cached) : null;
    }
    private async Task NavigateAsync(string name)
    {
        await FlushEditorAsync(); currentPage = name;
        page.Children.Clear(); heading.Text = name; page.Children.Add(heading);
        var bar = new WrapPanel(); page.Children.Add(bar);
        if (new[] { "待办", "生活记录", "工作记录", "工作提醒", "数据复盘" }.Contains(name))
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
            case "未安排": await UnscheduledAsync(); break;
            case "标签": await LabelsAsync(); break;
            case "生活记录": case "工作记录": await NotesAsync(bar, name == "生活记录" ? "life" : "work"); break;
            case "备忘录": await MemosAsync(bar); break;
            case "工作提醒": await RemindersAsync(bar); break;
            case "文章台账": await ArticlesAsync(bar); break;
            case "数据复盘": await ReviewsAsync(bar); break;
            case "内容复盘": await ContentReviewAsync(); break;
            case "本机草稿": DraftsPage(); break;
            case "同步中心": SyncPage(); break;
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
        if (method == "POST" && path == "/api/v1/articles" && Engine.Snapshot.Outbox.Any(o => o.ResourceKey == resource && o.Method == "POST" && o.Path == path && o.Status == PendingStatus.Confirmed))
            throw new InvalidOperationException("这份文章创建请求已确认。请从文章清单打开其服务器记录继续编辑；原稿已保留，不能再次创建。");
        var id = Guid.NewGuid().ToString();
        if (body.ContainsKey("save_id")) body["save_id"] = id;
        var pending = new PendingOperation { Id = id, Method = method, Path = path, BodyJson = body.ToJsonString(), ResourceKey = resource };
        await Task.Run(() => Engine.QueueAsync(pending));
        Message("已安全存入本机待同步队列。" );
        if (connected) await SyncAsync(); else await NavigateAsync("同步中心");
    }
    private async Task SyncAsync()
    {
        await FlushEditorAsync();
        if (!connected) throw new InvalidOperationException("请先连接并核对工作区身份。离线队列已保留。");
        var report = await Task.Run(() => Engine.SyncAsync());
        await RebaseConfirmedDraftsAsync();
        await NavigateAsync("同步中心");
        Message($"本轮确认 {report.Confirmed} 项；冲突 {report.Conflicts}；受阻 {report.Blocked}；结果未知 {report.Unknown}；仍排队 {report.Queued}。未知请求不会自动再次发送。" );
    }

    private async Task RebaseConfirmedDraftsAsync()
    {
        foreach (var operation in Engine.Snapshot.Outbox.Where(o => o.Status == PendingStatus.Confirmed && o.RemoteJson != null))
        {
            if (!Engine.Snapshot.Drafts.TryGetValue(operation.ResourceKey, out var draft)) continue;
            var saved = JsonNode.Parse(draft.Text)?.AsObject();
            if (saved == null || saved["original"] is not JsonObject original || saved["values"] is not JsonObject values) continue;
            var kind = Text(saved, "kind");
            if (kind is not ("todo" or "template" or "note" or "legacy" or "memo" or "group" or "reminder" or "article")) continue;
            (string method, string path, JsonObject body) prepared;
            try { prepared = BuildSave(kind, original, values); }
            catch (Exception error) when (error is ArgumentException or FormatException or InvalidOperationException)
            { continue; } // An unfinished draft is preserved; invalid user input must not prevent opening the whole workspace.
            var queuedBody = JsonNode.Parse(operation.BodyJson)?.AsObject();
            prepared.body.Remove("save_id"); queuedBody?.Remove("save_id");
            if (prepared.method != operation.Method || prepared.path != operation.Path || !JsonNode.DeepEquals(prepared.body, queuedBody)) continue;
            var remote = Data(operation.RemoteJson!);
            if (remote is not JsonObject || Version(remote) < 1) continue;
            var baseline = (JsonObject)remote.DeepClone();
            if (kind == "legacy") baseline["category"] = Text(original, "category");
            saved["original"] = baseline;
            // Retain exact local values; only rebase a draft whose entire prepared save matched the confirmed request.
            await SaveLocalDraftAsync(draft with { Text = saved.ToJsonString(), BaseVersion = Version(remote) });
        }
        await RebaseReviewDraftsAsync();
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
        await Task.Run(() => target.SaveDraftAsync(draft));
    }

    private ListBox List(IEnumerable<(string title, string subtitle, Func<Task> open)> rows)
    {
        var items = rows.ToArray();
        var list = new ListBox { MinHeight = 160, MaxHeight = 490 };
        foreach (var row in items)
        {
            var panel = new StackPanel(); panel.Children.Add(new TextBlock { Text = row.title, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
            panel.Children.Add(new TextBlock { Text = row.subtitle, Foreground = Brushes.SlateGray, FontSize = 12, Margin = new Thickness(0, 4, 0, 0), TextWrapping = TextWrapping.Wrap });
            var item = new ListBoxItem { Content = panel, Tag = row.open }; list.Items.Add(item);
        }
        list.SelectionChanged += (_, _) => { if (list.SelectedItem is ListBoxItem { Tag: Func<Task> open }) Run(open); };
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
        saveEditor = null;
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
        if (!await actions.WaitAsync(0)) { Message("请等待正在进行的操作结束后再关闭。" ); return; }
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
