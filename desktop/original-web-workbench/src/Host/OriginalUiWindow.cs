using System.ComponentModel;
using System.Text.Json;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Haoduoyu.OriginalUi.Policy;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Haoduoyu.OriginalUi;

internal sealed class OriginalUiWindow : Window
{
    private readonly AssetCatalog assets;
    private readonly string profileDirectory;
    private readonly WebView2 browser = new() { AllowExternalDrop = false, AllowDrop = false };
    private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    internal Task Ready => ready.Task;
    internal CoreWebView2 Core => browser.CoreWebView2;
    internal string? LastFailure { get; private set; }
    internal int BlockedRequests { get; private set; }
    internal int BlockedNavigations { get; private set; }
    internal int BlockedPopups { get; private set; }
    internal int BlockedPermissions { get; private set; }
    internal int BlockedDownloads { get; private set; }
    private bool failed;
    private bool closeAuthorized;
    private bool flushingClose;
    internal string? CloseFailure { get; private set; }
    // Observable to the integration harness; it does not authorize or trigger a close.
    internal bool CloseInProgress => flushingClose;


    internal OriginalUiWindow(AssetCatalog assets, string profileDirectory)
    {
        this.assets = assets; this.profileDirectory = profileDirectory;
        Title = "好多鱼 · 本机网页工作台";
        // Use Windows' own caption, system menu and minimize/restore/close controls.
        // Never start maximized or borderless, and fit the OUTER window to the
        // usable desktop in DIPs so high scaling cannot hide the caption.
        WindowStyle = WindowStyle.SingleBorderWindow;
        ResizeMode = ResizeMode.CanResize;
        WindowState = WindowState.Normal;
        ShowInTaskbar = true;
        SizeToContent = SizeToContent.Manual;
        var workArea = SystemParameters.WorkArea;
        var bounds = StartupWindowBounds.Fit(workArea.Left, workArea.Top, workArea.Width, workArea.Height);
        Width = bounds.Width; Height = bounds.Height;
        MinWidth = bounds.MinWidth; MinHeight = bounds.MinHeight;
        Left = bounds.Left; Top = bounds.Top;
        WindowStartupLocation = WindowStartupLocation.Manual;
        // Native local-file selection stays outside the unchanged shared website.
        // Only allowlisted aggregate metadata is shown; no file content enters WebView2.
        var menu = new Menu();
        var dataMenu = new MenuItem { Header="本机数据" };
        var inspect = new MenuItem { Header="检查网站备份（只读，不导入）" };
        inspect.Click += (_, _) => new BackupPreviewWindow(this).ShowDialog();
        dataMenu.Items.Add(inspect); menu.Items.Add(dataMenu);
        var layout = new DockPanel(); DockPanel.SetDock(menu, Dock.Top);
        layout.Children.Add(menu); layout.Children.Add(browser); Content=layout;
        Loaded += async (_, _) => await InitializeAsync();
        Closing += OnClosing;
        Closed += (_, _) => browser.Dispose();
    }
    private async Task InitializeAsync()
    {
        try
        {
            RejectEnvironmentOverrides();
            FileSystemTrust.RejectLinksInExistingPath(profileDirectory);
            // These flags reduce runtime background activity, but are not a process-level firewall.
            var options = new CoreWebView2EnvironmentOptions(
                "--disable-background-networking --disable-component-update --disable-sync --no-pings --host-resolver-rules=\"MAP * ~NOTFOUND\"")
            { AllowSingleSignOnUsingOSPrimaryAccount = false, ExclusiveUserDataFolderAccess = true, EnableTrackingPrevention = true };
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString(); // No auto-install fallback.
            var environment = await CoreWebView2Environment.CreateAsync(null, profileDirectory, options);
            await browser.EnsureCoreWebView2Async(environment);
            var core = Core;
            var settings = core.Settings;
            settings.AreHostObjectsAllowed = false; settings.IsWebMessageEnabled = false;
            settings.AreDevToolsEnabled = false; settings.AreDefaultContextMenusEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = false; settings.IsStatusBarEnabled = false;
            settings.IsPasswordAutosaveEnabled = false; settings.IsGeneralAutofillEnabled = false;
            settings.IsBuiltInErrorPageEnabled = false; settings.IsSwipeNavigationEnabled = false;
            // Preserve the existing web app's explicit deletion confirmations.
            settings.AreDefaultScriptDialogsEnabled = true;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            core.WebResourceRequested += (_, args) =>
            {
                // Always respond. Neither missing files nor unexpected requests ever fall through to networking.
                try
                {
                    if (RequestPolicy.TryAssetRequest(args.Request.Uri, args.Request.Method, assets, out var asset))
                        args.Response = environment.CreateWebResourceResponse(new MemoryStream(asset!.Bytes.ToArray(), false), 200, "OK",
                            "Content-Type: " + asset.MimeType + "\r\n" + RequestPolicy.SecurityHeaders);
                    else { BlockedRequests++; args.Response = Denied(environment); }
                }
                catch { BlockedRequests++; args.Response = Denied(environment); }
            };
            core.NavigationStarting += (_, args) => { if (!RequestPolicy.IsDocumentNavigation(args.Uri)) { args.Cancel = true; BlockedNavigations++; } };
            core.FrameNavigationStarting += (_, args) => { args.Cancel = true; BlockedNavigations++; };
            core.NewWindowRequested += (_, args) => { args.Handled = true; BlockedPopups++; };
            core.LaunchingExternalUriScheme += (_, args) => { args.Cancel = true; BlockedNavigations++; };
            core.PermissionRequested += (_, args) => { args.State = CoreWebView2PermissionState.Deny; args.SavesInProfile = false; args.Handled = true; BlockedPermissions++; };
            core.ServerCertificateErrorDetected += (_, args) => args.Action = CoreWebView2ServerCertificateErrorAction.Cancel;
            core.BasicAuthenticationRequested += (_, args) => args.Cancel = true;
            core.ClientCertificateRequested += (_, args) => { args.Cancel = true; args.Handled = true; };
            core.DownloadStarting += OnDownloadStarting;
            core.ProcessFailed += (_, _) => Fail("网页运行进程已停止。请关闭后重新打开此应用；已提交的本机数据会保留。没有自动重置或清除缓存。未完成保存的编辑可能需要恢复。");
            core.NavigationCompleted += (_, args) =>
            {
                if (args.IsSuccess && RequestPolicy.IsDocumentNavigation(core.Source)) ready.TrySetResult();
                else if (!ready.Task.IsCompleted) Fail("离线页面加载失败。请保留此安装与本机数据目录，重新打开或使用完整离线构建包。此应用不会改为连接线上网站。");
            };
            core.Navigate(RequestPolicy.StartUrl);
        }
        catch (WebView2RuntimeNotFoundException)
        { Fail("缺少 Microsoft Edge WebView2 Runtime。请手动从 Microsoft 官方网站安装 Evergreen WebView2 Runtime 后重开。本程序不会自动下载或安装运行时，也未清除已有数据。官方地址：https://developer.microsoft.com/microsoft-edge/webview2/"); }
        catch (Exception ex) { Fail("无法初始化离线网页运行环境。已有数据未清除。\n" + ex.Message); }
    }
    private static CoreWebView2WebResourceResponse Denied(CoreWebView2Environment environment) =>
        environment.CreateWebResourceResponse(new MemoryStream(Encoding.UTF8.GetBytes("This offline application blocks this request.")), 403, "Blocked",
            "Content-Type: text/plain; charset=utf-8\r\n" + RequestPolicy.SecurityHeaders);

    private void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs args)
    {
        args.Cancel = true; args.Handled = true; BlockedDownloads++;
        MessageBox.Show(this,
            "此测试版本尚未启用安全的本机文件导出，文件没有保存。页面里的已保存内容仍保留在独立本机数据库中。\n\n请勿因此删除本机记录；正式导出需要完成临时文件校验及原子保存测试后才能开放。",
            "导出尚未开放", MessageBoxButton.OK, MessageBoxImage.Information);
    }
    private async void OnClosing(object? sender, CancelEventArgs args)
    {
        if (closeAuthorized || failed || !ready.Task.IsCompletedSuccessfully) return;
        args.Cancel = true;
        if (flushingClose) return;
        flushingClose = true;
        var id = Guid.NewGuid().ToString("N");
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try
        {
            var accepted = await Core.ExecuteScriptAsync("Boolean(window.haoduoyuLocalLifecycle && window.haoduoyuLocalLifecycle.requestFlush('" + id + "'))").WaitAsync(deadline.Token);
            if (accepted != "true") throw new InvalidOperationException("页面没有确认保存请求。");
            for (var n = 0; n < 100; n++)
            {
                await Task.Delay(100, deadline.Token);
                if (failed) throw new InvalidOperationException("页面进程已中断。");
                var reply = await Core.ExecuteScriptAsync("window.haoduoyuLocalLifecycle.status('" + id + "')").WaitAsync(deadline.Token);
                using var state = JsonDocument.Parse(reply);
                var value = state.RootElement.ValueKind == JsonValueKind.String ? state.RootElement.GetString()
                    : state.RootElement.ValueKind == JsonValueKind.Object && state.RootElement.TryGetProperty("state", out var field) ? field.GetString() : null;
                if (value == "complete") { closeAuthorized = true; Close(); return; }
                if (value != "pending") throw new InvalidOperationException("页面未能确认全部编辑已保存。");
            }
            throw new TimeoutException("等待本机保存超过 10 秒。");
        }
        catch (Exception ex)
        {
            CloseFailure = ex.Message;
            // Resume is narrowly scoped to this request token. Queue it even after a renderer timeout.
            try { await Core.ExecuteScriptAsync("window.haoduoyuLocalLifecycle?.resume('" + id + "')").WaitAsync(TimeSpan.FromSeconds(2)); }
            catch { /* A failed renderer may be unreachable. Never clear its profile to recover. */ }
            MessageBox.Show(this, "尚未确认全部编辑已保存，窗口已保留。请检查页面保存提示后重试关闭。不会清除或重置任何本机数据。\n\n" + ex.Message,
                "暂未关闭", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        finally { flushingClose = false; }
    }
    private void Fail(string message)
    {
        if (failed) return;
        failed = true; LastFailure = message;
        ready.TrySetException(new InvalidOperationException(message));
        browser.Visibility = Visibility.Collapsed;
        Content = new TextBox { Text = message, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(32),
            BorderThickness = new Thickness(0), Background = Brushes.Transparent, FontSize = 16, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        browser.Dispose();
    }
    private static void RejectEnvironmentOverrides()
    {
        foreach (var key in new[] { "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", "WEBVIEW2_USER_DATA_FOLDER", "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "WEBVIEW2_PIPE_FOR_SCRIPT_DEBUGGER", "WEBVIEW2_WAIT_FOR_SCRIPT_DEBUGGER", "WEBVIEW2_RELEASE_CHANNEL_PREFERENCE" })
            if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key))) throw new InvalidOperationException("WebView2 环境覆盖设置不受此隔离版本支持：" + key);
    }
}
