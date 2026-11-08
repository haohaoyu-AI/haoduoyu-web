using System.Globalization;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Testing;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> OfflineArchiveCases =>
    [
        ("Shown native one-click complete preparation includes independently sourced archived templates and reopens them offline without changing original unknown requests", () => RunWithDispatcher(OfflineArchiveLifecycleAsync)),
        ("Shown native complete preparation preserves old files drafts and template requests after invalid expired cancelled or changed archive reads", () => RunWithDispatcher(OfflineArchivePreservationAsync)),
        ("Shown native complete preparation stops when the same identity replaces its original engine or the bound service scope changes", () => RunWithDispatcher(OfflineArchiveOwnerAsync))
    ];

    private static async Task OfflineArchiveLifecycleAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new OfflineArchiveOrigin();
            var identity = "public:" + origin.Scope; var fixture = ReadTemplateArchiveFixture();
            var original = fixture.Row("owner-paired-active", fixture.KeepActive); var key = TemplateKey(fixture.KeepActive);
            var values = (JsonObject)original.DeepClone(); values["text"] = "完整准备前的独立原稿 🐟";
            var draft = AppDraft("template", key, original, values);
            var unknown = TemplateIntent(fixture.Template, true, 1) with { Status = PendingStatus.Unknown, SendAttempts = 1, RecoveredAtRevision = 1 };
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(), draft, unknown);
            RememberTemplatePublic(root, origin.Scope, identity); var window = await ShowOfflineArchiveWindowAsync(root, origin);
            try
            {
                await OpenTemplatePageAsync(window); await ClickAsync(window, "连接并刷新");
                Check(!Engine(window).Snapshot.Cache.ContainsKey(TemplateList(true)) && origin.Calls.All(path => path.Contains("workbench-snapshot/index", StringComparison.Ordinal)),
                    "archived list was already fetched before one-click preparation");
                for (var pass = 0; pass < 2; pass++)
                {
                    var revision = Engine(window).Snapshot.LocalRevision;
                    await ClickAsync(window, "准备离线资料");
                    var state = Engine(window).Snapshot;
                    Check(state.LocalRevision == revision + 1 && state.Cache.ContainsKey(TemplateList(true)) &&
                        JsonSerializer.Serialize(state.Outbox) == JsonSerializer.Serialize(new[] { unknown }) && state.Drafts[key].Text == draft.Text,
                        "full preparation was not one cache batch or changed the original draft/unknown fence");
                    foreach (var archived in new[] { false, true })
                    {
                        var path = TemplateList(archived); var raw = state.Cache[path]; var metadata = JsonNode.Parse(raw)!["_local_template_archive"]!;
                        Check(state.ScopeId != origin.Scope && metadata["scope_id"]!.GetValue<string>() == state.ScopeId &&
                            metadata["service_scope_id"]!.GetValue<string>() == origin.Scope && metadata["query_path"]!.GetValue<string>() == path &&
                            TemplateArchive.ParseCachedList(path, raw, state.ScopeId).Items.Count == 1,
                            "full preparation confused real local hash with service scope or lost membership provenance");
                    }
                }
                await SetTemplateTabAsync(window, true);
                Check(TemplateRows(window).Any(row => TemplateId(row) == fixture.Template) && TemplatePageText(window).Contains("独立完整来源", StringComparison.Ordinal) &&
                    TemplatePageText(window).Contains("本机读取时间", StringComparison.Ordinal) && TemplatePageText(window).Contains("来源统计窗口", StringComparison.Ordinal),
                    "archive list lost completeness or hidden provenance after full preparation");
                var saved = Engine(window).Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                SaveEvidence(window, "complete-offline-archived-templates.png");
                var requests = origin.Calls.Count; await CloseAsync(window); origin.Offline = true;
                window = await ShowOfflineArchiveWindowAsync(root, origin); await OpenTemplatePageAsync(window); await SetTemplateTabAsync(window, true);
                Check(TemplateRows(window).Any(row => TemplateId(row) == fixture.Template) && TemplatePageText(window).Contains("本机读取时间", StringComparison.Ordinal),
                    "offline restart failed to display the independently prepared archive and its read time");
                await AssertTemplatePreservedAsync(window, saved, bytes, "offline archive restart");
                Check(origin.Calls.Count == requests && sockets.Connects == 0, "offline archive restart opened transport or native tests escaped fake HTTP");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task OfflineArchivePreservationAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new OfflineArchiveOrigin();
            var identity = "public:" + origin.Scope; var fixture = ReadTemplateArchiveFixture();
            var record = fixture.Row("owner-paired-active", fixture.KeepActive); var draft = AppDraft("template", TemplateKey(fixture.KeepActive), record, (JsonObject)record.DeepClone());
            var unknown = TemplateIntent(fixture.Template, false, 2) with { Status = PendingStatus.Unknown, SendAttempts = 1 };
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [TemplateList(false)] = origin.Template(false), [TemplateList(true)] = origin.Template(true) }, draft, unknown);
            RememberTemplatePublic(root, origin.Scope, identity); var window = await ShowOfflineArchiveWindowAsync(root, origin);
            try
            {
                await OpenTemplatePageAsync(window); await ClickAsync(window, "连接并刷新");
                var state = Engine(window).Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                foreach (var mode in new[] { "malformed", "expired", "reread", "scope" })
                {
                    var archiveReads = origin.Calls.Count(path => path == TemplateList(true));
                    origin.Alter = (path, occurrence, result) =>
                    {
                        if (path == TemplateList(true) && mode == "malformed") return result with { Json = "{\"data\":{}}" };
                        if (path == TemplateList(true) && mode == "expired") return result with { StatusCode = 401 };
                        if (path == TemplateList(true) && occurrence == archiveReads + 2 && mode == "reread")
                        { var rootJson = JsonNode.Parse(result.Json)!; rootJson["data"]!["items"]![0]!["text"] = "changed after first archive read"; return result with { Json = rootJson.ToJsonString() }; }
                        if (path.Contains("workbench-snapshot/index", StringComparison.Ordinal) && mode == "scope" && origin.Calls.Count(call => call == TemplateList(true)) > archiveReads)
                        { var rootJson = JsonNode.Parse(result.Json)!; rootJson["data"]!["scope_id"] = new string('f', 64); return result with { Json = rootJson.ToJsonString() }; }
                        return result;
                    };
                    await ClickAsync(window, "准备离线资料"); await AssertTemplatePreservedAsync(window, state, bytes, "failed complete preparation: " + mode);
                }
                origin.Alter = null; origin.HoldPath = TemplateList(true); origin.HoldOccurrence = origin.Calls.Count(path => path == TemplateList(true)) + 1;
                origin.Hold = new(TaskCreationOptions.RunContinuationsAsynchronously);
                var button = Descendants(window).OfType<Button>().Single(item => item.Content?.ToString() == "准备离线资料");
                button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await UntilAsync(() => origin.Calls.Count(path => path == TemplateList(true)) == origin.HoldOccurrence, "complete preparation did not reach held archive");
                Descendants(window).OfType<Button>().Single(item => item.Content?.ToString() == "取消当前操作").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await window.WaitForIdleAsync(); origin.Hold.TrySetResult(); origin.Hold = null;
                await AssertTemplatePreservedAsync(window, state, bytes, "cancelled complete preparation");
                Check(sockets.Connects == 0, "failed native complete preparation opened a real socket");
            }
            finally { origin.Hold?.TrySetResult(); await CloseIfOpenAsync(window); }
        });
    }

    private static async Task OfflineArchiveOwnerAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new OfflineArchiveOrigin(); var identity = "public:" + origin.Scope;
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [TemplateList(true)] = origin.Template(true) });
            RememberTemplatePublic(root, origin.Scope, identity); var window = await ShowOfflineArchiveWindowAsync(root, origin);
            try
            {
                await OpenTemplatePageAsync(window); await ClickAsync(window, "连接并刷新");
                var original = Engine(window); var state = original.Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                var api = Field<WorkbenchApi>(window, "api"); var requests = origin.Calls.Count;
                api.BindScope(new string('e', 64)); await ClickAsync(window, "准备离线资料");
                Check(origin.Calls.Count == requests, "a mismatched bound scope began downloading another owner");
                await AssertTemplatePreservedAsync(window, state, bytes, "bound scope mismatch"); api.BindScope(origin.Scope);
                origin.HoldPath = TemplateList(true); origin.HoldOccurrence = 2; origin.Hold = new(TaskCreationOptions.RunContinuationsAsynchronously);
                Descendants(window).OfType<Button>().Single(item => item.Content?.ToString() == "准备离线资料").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await UntilAsync(() => origin.HeldRequest != null, "owner replacement did not reach final archive readback");
                var heldRequest = origin.HeldRequest!; var idle = window.WaitForIdleAsync();
                void AssertStillPending(string stage) => Check(origin.Calls.Count(path => path == TemplateList(true)) == 2 &&
                    !origin.Hold.Task.IsCompleted && !heldRequest.IsCompleted && !origin.HeldCancellationToken.IsCancellationRequested && !idle.IsCompleted,
                    "owner replacement lost the pending archive reply to timeout/cancellation or an early return: " + stage);
                AssertStillPending("before owner replacement");
                // The normal InvokeAsync helper waits for actions to become idle. Here this
                // test deliberately holds that action at transport, so inject only the owner swap.
                await ReplaceOwnerWithoutIdleAsync(window, "public:unbound");
                AssertStillPending("after leaving original owner");
                await ReplaceOwnerWithoutIdleAsync(window, identity);
                Check(!ReferenceEquals(original, Engine(window)) && Field<string>(window, "currentIdentity") == identity, "same-identity owner test did not replace the actual engine/store");
                AssertStillPending("after returning to the same identity with a new engine/store");
                origin.Hold.TrySetResult(); await idle; origin.Hold = null;
                Check(heldRequest.IsCompletedSuccessfully && !origin.HeldCancellationToken.IsCancellationRequested,
                    "owner replacement did not receive the released archive reply successfully");
                await AssertTemplatePreservedAsync(window, state, bytes, "same-identity engine/store replacement during complete preparation");
                Check(sockets.Connects == 0, "owner-boundary test opened a real socket");
            }
            finally { origin.Hold?.TrySetResult(); await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ReplaceOwnerWithoutIdleAsync(MainWindow window, string identity)
    {
        var method = typeof(MainWindow).GetMethod("OpenWorkspaceAsync", Private) ?? throw new MissingMethodException("MainWindow.OpenWorkspaceAsync");
        try { await ((Task?)method.Invoke(window, new object?[] { identity }) ?? throw new InvalidOperationException("Owner replacement did not return Task")); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
    }

    private static async Task<MainWindow> ShowOfflineArchiveWindowAsync(string root, OfflineArchiveOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "complete preparation requires guarded synthetic startup");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningOfflineArchiveOrigin(origin)), new WindowClock(origin.At))
            { Title = "好多鱼 · 纯合成完整离线归档验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "complete preparation window did not initialize injected workspace");
        await window.WaitForIdleAsync(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero && ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 &&
            Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "complete preparation escaped native Show or its synthetic root");
        return window;
    }
    private sealed class NonOwningOfflineArchiveOrigin(OfflineArchiveOrigin origin) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request, cancellationToken); }
}
