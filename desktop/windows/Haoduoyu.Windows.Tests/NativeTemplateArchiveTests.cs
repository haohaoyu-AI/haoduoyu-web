using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
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
    private static IReadOnlyList<(string Name, Action Run)> TemplateArchiveCases =>
    [
        ("Shown native template lists preserve distinct private active archived history draft queued and unknown intents through offline restart and profile changes", () => RunWithDispatcher(TemplateArchiveOfflineAsync)),
        ("Shown native template archive uses exact source request bodies and CAS no-op responses while lost acknowledgements remain unknown after reading both lists", () => RunWithDispatcher(TemplateArchiveTransportAsync)),
        ("Shown native template checks retain both original lists draft recovered unknown and legacy delete after invalid cancelled or foreign-scope responses", () => RunWithDispatcher(TemplateArchivePreservationAsync))
    ];

    private static async Task TemplateArchiveOfflineAsync()
    {
        var fixture = ReadTemplateArchiveFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            const string user = "10000000-0000-4000-8000-000000001301", other = "10000000-0000-4000-8000-000000001302";
            var scope = new string('b', 64); var otherScope = new string('c', 64);
            var identity = "user:" + user + ":" + scope; var otherIdentity = "user:" + other + ":" + otherScope;
            var keep = fixture.Row("owner-paired-active", fixture.KeepActive);
            var archived = fixture.Row("owner-paired-archived", fixture.Template);
            var key = TemplateKey(fixture.KeepActive); var values = (JsonObject)keep.DeepClone(); values["text"] = "甲独立保留的中文常用事项稿 🐟";
            var draft = AppDraft("template", key, keep, values);
            var queued = TemplateIntent(fixture.KeepActive, true, TemplateVersion(keep));
            var unknown = TemplateIntent(fixture.Template, false, TemplateVersion(archived)) with { Status = PendingStatus.Unknown, SendAttempts = 1 };
            var history = fixture.Sample("owner-history-after-archive");
            var path = await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal)
            { [TemplateList(false)] = fixture.Sample("owner-paired-active").Json, [TemplateList(true)] = fixture.Sample("owner-paired-archived").Json,
                [history.Path] = history.Json }, draft, queued, unknown);
            var otherPath = await SeedCalendarWorkspaceAsync(root, otherIdentity, new Dictionary<string, string>());
            var bytes = await File.ReadAllBytesAsync(path); var otherBytes = await File.ReadAllBytesAsync(otherPath);
            RememberProfiles(root, new string('a', 64), user, scope, other, otherScope, identity);
            var window = await ShowAsync(root, handler);
            try
            {
                await OpenTemplatePageAsync(window);
                var active = TemplateRows(window);
                Check(active.Any(row => TemplateId(row) == fixture.Template && row["_local_status"]?.GetValue<string>() == "Unknown") &&
                    !active.Any(row => TemplateId(row) == fixture.KeepActive), "offline restore intent did not move only its own archived template into the active view");
                await SetTemplateTabAsync(window, true);
                Check(TemplateRows(window).Any(row => TemplateId(row) == fixture.KeepActive && row["_local_status"]?.GetValue<string>() == "Queued") &&
                    !TemplateRows(window).Any(row => TemplateId(row) == fixture.Template), "the active and archived authorities erased one another or lost their separate local intents");
                Check(Engine(window).Snapshot.Cache[history.Path] == history.Json && Engine(window).Snapshot.Drafts[key].Text == draft.Text &&
                    JsonSerializer.Serialize(Engine(window).Snapshot.Outbox) == JsonSerializer.Serialize(new[] { queued, unknown }),
                    "opening native template lists changed historical todos, the original draft or immutable queue");
                Field<DatePicker>(window, "date").SelectedDate = DateTime.ParseExact(fixture.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
                await window.WaitForIdleAsync(); await InvokeAsync(window, "NavigateAsync", "待办");
                var historyTodo = JsonNode.Parse(history.Json)!["data"]!["items"]![0]!;
                var historyState = Engine(window).Snapshot;
                var projectedHistory = WorkspaceProjection.Project(history.Path, historyState.Cache[history.Path], historyState)
                    ?? throw new InvalidOperationException("The dated history did not produce a current-partition projection.");
                var displayedTodo = JsonNode.Parse(projectedHistory)!["data"]!["items"]!.AsArray().OfType<JsonObject>()
                    .Single(row => row["id"]!.GetValue<string>() == fixture.Todo);
                Check(Field<string>(window, "currentPage") == "待办" && Field<DatePicker>(window, "date").SelectedDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) == fixture.Date &&
                    displayedTodo["text"]!.GetValue<string>() == historyTodo["text"]!.GetValue<string>() && displayedTodo["completed"]!.GetValue<bool>() &&
                    displayedTodo["template_id"]!.GetValue<string>() == fixture.Template, "the shown history selected a different dated todo or changed its completed original and template link");
                var historyList = Descendants(Field<StackPanel>(window, "page")).OfType<ListBox>().Single();
                var historyItem = historyList.Items.Cast<WorkspaceListItem>().Single(item => item.Title == "✓ " + displayedTodo["text"]!.GetValue<string>());
                Check(historyItem.Subtitle.StartsWith(fixture.Date + " · ", StringComparison.Ordinal), "the native history item does not represent the projected todo date");
                // Reading Items is immediate; its recycled visual container is created only after layout. Do not select it, which opens the todo action menu.
                historyList.ScrollIntoView(historyItem); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
                Check(historyList.ItemContainerGenerator.ContainerFromItem(historyItem) is ListBoxItem &&
                    VisibleText(window).Contains(historyTodo["text"]!.GetValue<string>(), StringComparison.Ordinal) && historyTodo["completed"]!.GetValue<bool>() &&
                    historyTodo["template_id"]!.GetValue<string>() == fixture.Template && Engine(window).Snapshot.Cache[history.Path] == history.Json &&
                    JsonSerializer.Serialize(Engine(window).Snapshot.Outbox) == JsonSerializer.Serialize(new[] { queued, unknown }) &&
                    (await File.ReadAllBytesAsync(path)).SequenceEqual(bytes),
                    "the shown dated todo history lost its completed original text or linked template when template archive state changed locally");
                await OpenTemplatePageAsync(window); await SetTemplateTabAsync(window, true);
                SaveEvidence(window, "template-archive-private-offline.png");
                await CloseAsync(window); window = await ShowAsync(root, handler); await OpenTemplatePageAsync(window); await SetTemplateTabAsync(window, true);
                Check(TemplateRows(window).Any(row => TemplateId(row) == fixture.KeepActive) && Engine(window).Snapshot.Outbox.Single(op => op.Id == unknown.Id).Status == PendingStatus.Unknown,
                    "native restart lost archived local intent or released unknown status");
                await InvokeAsync(window, "OpenOfflineProfileAsync", otherIdentity); await OpenTemplatePageAsync(window);
                Check(TemplateRows(window).Count == 0 && !Field<bool>(window, "templateArchiveArchived") && Engine(window).Snapshot.Outbox.Count == 0 &&
                    Engine(window).Snapshot.Drafts.Count == 0 && !TemplatePageText(window).Contains("甲独立", StringComparison.Ordinal),
                    "profile selection carried private template records drafts requests or view state into another owner");
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(bytes) && (await File.ReadAllBytesAsync(otherPath)).SequenceEqual(otherBytes) &&
                    handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0, "offline template navigation changed business files or opened transport");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task TemplateArchiveTransportAsync()
    {
        var fixture = ReadTemplateArchiveFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TemplateArchiveOrigin(fixture);
            origin.SetLists("owner-active-before", "owner-archived-before");
            var identity = "public:" + origin.Scope;
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>()); RememberTemplatePublic(root, origin.Scope, identity);
            var window = await ShowTemplateWindowAsync(root, origin);
            try
            {
                await OpenTemplatePageAsync(window); await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected") && origin.BusinessReads.Count == 0, "opening or connecting templates implicitly fetched a business list");
                await TemplateClickAsync(window, "template-archive-check-both", pairDialog: true);
                Check(origin.BusinessReads.SequenceEqual(new[] { TemplateList(false), TemplateList(true) }) && TemplateRows(window).Any(row => TemplateId(row) == fixture.Template),
                    "the explicit pair check did not read exactly the two formal template queries");
                var before = (JsonObject)TemplateRows(window).Single(row => TemplateId(row) == fixture.Template).DeepClone();
                origin.ExpectWrite("owner-archive-v1", "owner-active-after-archive", "owner-archived-after-archive");
                // Exercise the real button's post-confirmation body. Native Win32 MessageBox acceptance is deliberately not automated.
                await InvokeAsync(window, "QueueTemplateArchiveStateAsync", before, true);
                var first = Engine(window).Snapshot.Outbox.Single();
                Check(first.Status == PendingStatus.Confirmed && first.Path == TemplateKey(fixture.Template) + "/archive" &&
                    JsonNode.DeepEquals(JsonNode.Parse(first.RequestBodyJson), JsonNode.Parse(fixture.Sample("owner-archive-v1").Body!)),
                    "the shown archive action changed its source-derived CAS body or failed to confirm a valid response");
                await InvokeAsync(window, "TemplateArchiveAsync"); await TemplateClickAsync(window, "template-archive-check-both", pairDialog: true); await SetTemplateTabAsync(window, true);
                Check(TemplateRows(window).Any(row => TemplateId(row) == fixture.Template), "a confirmed archive was missing from the separately refreshed archive view");
                var noOp = fixture.Sample("owner-archive-noop-current-v2");
                var repeat = TemplateIntent(fixture.Template, true, JsonNode.Parse(noOp.Body!)!["version"]!.GetValue<long>());
                origin.ExpectWrite(noOp.Name); await Engine(window).QueueAsync(repeat); var repeatReport = await Engine(window).SyncAsync();
                Check(repeatReport.Confirmed == 1 && Engine(window).Snapshot.Outbox.Single(op => op.Id == repeat.Id).Status == PendingStatus.Confirmed &&
                    JsonNode.Parse(noOp.Json)!["data"]!["version"]!.GetValue<long>() == JsonNode.Parse(noOp.Body!)!["version"]!.GetValue<long>(),
                    "the actual same-status same-version response was rejected or represented as a fabricated version increment");
                origin.ExpectWrite("owner-restore-v2", "owner-active-after-restore", "owner-archived-after-restore");
                await InvokeAsync(window, "QueueTemplateArchiveStateAsync", (JsonObject)TemplateRows(window).Single(row => TemplateId(row) == fixture.Template).DeepClone(), false);
                Check(Engine(window).Snapshot.Outbox.Last().Status == PendingStatus.Confirmed && JsonNode.Parse(Engine(window).Snapshot.Outbox.Last().RemoteJson!)!["data"]!.AsObject().ContainsKey("archived_at") &&
                    JsonNode.Parse(Engine(window).Snapshot.Outbox.Last().RemoteJson!)!["data"]!["archived_at"] is null,
                    "template restoration expected soft-delete metadata or failed to accept the formal explicit-null archive response");
                var lost = fixture.Sample("unknown-archive-v3-simulated-response-loss");
                origin.ExpectWrite(lost.Name, "unknown-active", "unknown-archived", loseResponse: true);
                await SetTemplateTabAsync(window, false);
                await InvokeAsync(window, "QueueTemplateArchiveStateAsync", (JsonObject)TemplateRows(window).Single(row => TemplateId(row) == fixture.Template).DeepClone(), true);
                var unknown = Engine(window).Snapshot.Outbox.Last();
                Check(unknown.Status == PendingStatus.Unknown && unknown.SendAttempts == 1 && unknown.Path.EndsWith("/archive", StringComparison.Ordinal), "lost acknowledgement did not persist an attempted unknown archive");
                var writes = origin.Writes.Count; var raw = unknown.RequestBodyJson; var reads = origin.BusinessReads.Count;
                await InspectTemplateOperationAsync(window, unknown, chooseBoth: true);
                var stillUnknown = Engine(window).Snapshot.Outbox.Single(op => op.Id == unknown.Id);
                Check(origin.BusinessReads.Skip(reads).SequenceEqual(new[] { TemplateList(false), TemplateList(true) }) && origin.Writes.Count == writes &&
                    stillUnknown.Status == PendingStatus.Unknown && stillUnknown.RequestBodyJson == raw && stillUnknown.SendAttempts == 1,
                    "reading both current lists confirmed or resent a specific lost archive request");
                var refused = false;
                try { await Engine(window).RetryUnchangedAsync(unknown.Id, lost.Json); } catch (InvalidOperationException) { refused = true; }
                Check(refused && origin.Writes.Count == writes && origin.ExpectedWrites.Count == 0 && origin.StrictBodyChecks == writes && sockets.Connects == 0,
                    "a matching current archive record released the unknown fence or a fake response bypassed strict request-body checking");
                SaveEvidence(window, "template-archive-cas-noop-unknown.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TemplateArchiveOrigin(fixture);
            origin.SetLists("owner-active-after-restore", "owner-archived-after-restore");
            var identity = "public:" + origin.Scope;
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal)
            { [TemplateList(false)] = fixture.Sample("owner-active-before").Json, [TemplateList(true)] = fixture.Sample("owner-archived-before").Json });
            RememberTemplatePublic(root, origin.Scope, identity); var window = await ShowTemplateWindowAsync(root, origin);
            try
            {
                await OpenTemplatePageAsync(window); await ClickAsync(window, "连接并刷新");
                var stale = (JsonObject)TemplateRows(window).Single(row => TemplateId(row) == fixture.Template).DeepClone();
                origin.ExpectWrite("owner-stale-archive-v1");
                await InvokeAsync(window, "QueueTemplateArchiveStateAsync", stale, true);
                var conflict = Engine(window).Snapshot.Outbox.Single();
                Check(conflict.Status == PendingStatus.Conflict && conflict.BodyJson == fixture.Sample("owner-stale-archive-v1").Body &&
                    conflict.RemoteJson == fixture.Sample("owner-stale-archive-v1").Json && origin.Writes.Count == 1,
                    "a real stale-version archive response did not retain its exact original request and CAS conflict evidence");
                await InspectTemplateOperationAsync(window, conflict, chooseBoth: false);
                Check(Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Conflict && origin.Writes.Count == 1 && sockets.Connects == 0,
                    "the archive conflict inspector exposed generic overwrite or retried a stale request");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task TemplateArchivePreservationAsync()
    {
        var fixture = ReadTemplateArchiveFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TemplateArchiveOrigin(fixture);
            origin.SetLists("owner-paired-active", "owner-paired-archived");
            var identity = "public:" + origin.Scope; var row = fixture.Row("owner-paired-active", fixture.KeepActive);
            var key = TemplateKey(fixture.KeepActive); var values = (JsonObject)row.DeepClone(); values["text"] = "失败和恢复后仍保留的中文常用事项原稿 🐟";
            var draft = AppDraft("template", key, row, values);
            var recovered = TemplateIntent(fixture.Template, true, 3) with { Status = PendingStatus.Unknown, SendAttempts = 1, RecoveredAtRevision = 1 };
            var legacy = new PendingOperation { Id = Guid.NewGuid().ToString(), ResourceKey = TemplateKey(fixture.DeletedTemplate), Path = TemplateKey(fixture.DeletedTemplate),
                Method = "DELETE", BodyJson = Object(("version", 1)).ToJsonString() };
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal)
            { [TemplateList(false)] = fixture.Sample("owner-paired-active").Json, [TemplateList(true)] = fixture.Sample("owner-paired-archived").Json }, draft, recovered, legacy);
            RememberTemplatePublic(root, origin.Scope, identity); var window = await ShowTemplateWindowAsync(root, origin);
            try
            {
                await OpenTemplatePageAsync(window); await ClickAsync(window, "连接并刷新"); await TemplateClickAsync(window, "template-archive-check-both", pairDialog: true);
                await ClickAsync(window, "同步中心");
                var beforeRecoveryCheck = Engine(window).Snapshot;
                await InspectTemplateOperationAsync(window, recovered, chooseBoth: true);
                Check(JsonSerializer.Serialize(Engine(window).Snapshot.Outbox) == JsonSerializer.Serialize(beforeRecoveryCheck.Outbox) && origin.Writes.Count == 0,
                    "checking both lists from the sync-center inspector changed a recovered request or sent a legacy delete");
                await OpenTemplatePageAsync(window);
                var accepted = Engine(window).Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                foreach (var invalid in new[] { "{\"data\":{}}", "{\"data\":" + new string(' ', 1024 * 1024 + 20) + "{}}" })
                {
                    origin.Overrides[TemplateList(true)] = (HttpStatusCode.OK, invalid); await TemplateClickAsync(window, "template-archive-check-both");
                    await AssertTemplatePreservedAsync(window, accepted, bytes, "a malformed or over-budget second list");
                }
                origin.Overrides[TemplateList(true)] = (HttpStatusCode.ServiceUnavailable, "{\"error\":{\"code\":\"SYNTHETIC_FAILURE\"}}");
                await TemplateClickAsync(window, "template-archive-check-both"); await AssertTemplatePreservedAsync(window, accepted, bytes, "a failed second list");
                origin.Overrides.Clear(); origin.HoldPath = TemplateList(true); origin.Hold = new(TaskCreationOptions.RunContinuationsAsynchronously);
                var calls = origin.BusinessReads.Count; TemplateStartClick(window, "template-archive-check-both");
                await UntilAsync(() => origin.BusinessReads.Count > calls + 1, "the pair cancellation did not reach its second formal GET");
                Descendants(window).OfType<Button>().Single(button => button.Content?.ToString() == "取消当前操作").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await window.WaitForIdleAsync(); origin.Hold.TrySetResult(true); origin.Hold = null; origin.HoldPath = null;
                Check(origin.CancelledReads > 0, "the shown cancel action did not cancel template transport");
                await AssertTemplatePreservedAsync(window, accepted, bytes, "a cancelled pair");
                await ClickAsync(window, "同步中心"); await InspectTemplateOperationAsync(window, recovered, chooseBoth: false);
                await AssertTemplatePreservedAsync(window, accepted, bytes, "a recovered unknown inspector");
                Check(Engine(window).Snapshot.Outbox.Single(op => op.Id == legacy.Id).Method == "DELETE" &&
                    Engine(window).Snapshot.Outbox.Single(op => op.Id == legacy.Id).Path == legacy.Path && !legacy.Path.EndsWith("/archive", StringComparison.Ordinal),
                    "the new archive inspector rewrote a legacy soft-delete operation");
                await OpenTemplatePageAsync(window); origin.ChangeScopeAfterPath = TemplateList(true); await TemplateClickAsync(window, "template-archive-check-both");
                await AssertTemplatePreservedAsync(window, accepted, bytes, "a foreign-scope pair");
                Check(!Field<bool>(window, "connected") && origin.Writes.Count == 0 && sockets.Connects == 0, "scope drift left writes trusted or template inspection opened a real socket");
                SaveEvidence(window, "template-archive-failures-recovery-preserve.png");
                // Execute the recovery button's existing post-confirmation body against the real temporary DPAPI backup.
                await InvokeAsync(window, "RestoreWorkspaceBackupAsync");
                var recoveryRevision = Engine(window).Snapshot.BackupRecoveryRevision;
                var restoredUnknown = Engine(window).Snapshot.Outbox.Single(op => op.Id == recovered.Id);
                var restoredDelete = Engine(window).Snapshot.Outbox.Single(op => op.Id == legacy.Id);
                Check(recoveryRevision > 1 && restoredUnknown.Status == PendingStatus.Unknown && restoredUnknown.RecoveredAtRevision == recoveryRevision &&
                    restoredUnknown.RequestBodyJson == recovered.RequestBodyJson && restoredDelete.Status == PendingStatus.Unknown && restoredDelete.Method == "DELETE" &&
                    restoredDelete.Path == legacy.Path && restoredDelete.RequestBodyJson == legacy.RequestBodyJson && !restoredDelete.CanEditQueued && origin.Writes.Count == 0,
                    "actual backup recovery released a lost archive intent or converted a legacy soft-delete into a new archive request");
                await InspectTemplateOperationAsync(window, restoredUnknown, chooseBoth: false);
                await CloseAsync(window); window = await ShowTemplateWindowAsync(root, origin);
                Check(Engine(window).Snapshot.Outbox.Single(op => op.Id == recovered.Id).RecoveredAtRevision == recoveryRevision &&
                    Engine(window).Snapshot.Outbox.Single(op => op.Id == recovered.Id).Status == PendingStatus.Unknown && Engine(window).Snapshot.Drafts[key].Text == draft.Text,
                    "native restart after refused reads lost recovered provenance or the original draft");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static string TemplateList(bool archived) => "/api/v1/todo-templates" + (archived ? "?archived=1" : "");
    private static string TemplateKey(string id) => "/api/v1/todo-templates/" + id;
    private static string TemplateId(JsonObject row) => row["id"]!.GetValue<string>();
    private static long TemplateVersion(JsonObject row) => row["version"]!.GetValue<long>();
    private static PendingOperation TemplateIntent(string id, bool archived, long version) => new()
    { Id = Guid.NewGuid().ToString(), ResourceKey = TemplateKey(id), Path = TemplateKey(id) + (archived ? "/archive" : "/restore"), Method = "POST", BodyJson = Object(("version", version)).ToJsonString() };
    private static T TemplateControl<T>(MainWindow window, string id) where T : FrameworkElement => Descendants(Field<StackPanel>(window, "page")).OfType<T>().Single(control => AutomationProperties.GetAutomationId(control) == id);
    private static IReadOnlyList<JsonObject> TemplateRows(MainWindow window) => TemplateControl<ListBox>(window, "template-archive-records").Items.Cast<JsonObject>().ToArray();
    private static string TemplatePageText(MainWindow window) => string.Join("\n", Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Select(block => block.Text));
    private static async Task OpenTemplatePageAsync(MainWindow window)
    {
        // Enter through the daily page's real button when present; the formal navigation case also supports reopening from inspectors/profiles.
        if (Descendants(window).OfType<Button>().Any(button => button.Content?.ToString() == "常用事项")) await ClickAsync(window, "常用事项");
        else await InvokeAsync(window, "NavigateAsync", "常用事项");
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static void TemplateStartClick(MainWindow window, string id) { var button = TemplateControl<Button>(window, id); Check(button.IsEnabled, "disabled native template action: " + id); button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); }
    private static async Task TemplateClickAsync(MainWindow window, string id, bool pairDialog = false)
    {
        var modal = pairDialog ? ArmTemplatePairDialog(window) : Task.CompletedTask;
        TemplateStartClick(window, id); await window.WaitForIdleAsync(); await modal;
        await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static async Task SetTemplateTabAsync(MainWindow window, bool archived)
    { TemplateControl<TabControl>(window, "template-archive-tabs").SelectedIndex = archived ? 1 : 0; await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout(); }
    private static void RememberTemplatePublic(string root, string scope, string identity) => RememberProfiles(root, scope,
        "10000000-0000-4000-8000-000000001303", new string('b', 64), "10000000-0000-4000-8000-000000001304", new string('c', 64), identity);
    private static async Task AssertTemplatePreservedAsync(MainWindow window, WorkspaceState before, byte[] bytes, string reason)
    {
        var after = Engine(window).Snapshot;
        Check(JsonSerializer.Serialize(after.Cache) == JsonSerializer.Serialize(before.Cache) && JsonSerializer.Serialize(after.CacheRevisions) == JsonSerializer.Serialize(before.CacheRevisions) &&
            JsonSerializer.Serialize(after.Drafts) == JsonSerializer.Serialize(before.Drafts) && JsonSerializer.Serialize(after.Outbox) == JsonSerializer.Serialize(before.Outbox) &&
            (await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(bytes), reason + " changed pair caches drafts original requests or encrypted bytes");
    }
    private static async Task InspectTemplateOperationAsync(MainWindow window, PendingOperation operation, bool chooseBoth)
    {
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Task? pairModal = null;
        _ = window.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            Window? dialog = null;
            try
            {
                dialog = Application.Current.Windows.OfType<Window>().Single(candidate => candidate != window && candidate.IsVisible && candidate.Owner == window);
                var text = string.Join("\n", Descendants(dialog).OfType<TextBlock>().Select(block => block.Text));
                var options = Descendants(dialog).OfType<Button>().ToArray(); var labels = options.Select(button => button.Content?.ToString() ?? "").ToArray();
                Check(dialog.Title == "模板归档请求" && text.Contains(operation.Path, StringComparison.Ordinal) &&
                    labels.Any(label => label.Contains("两列表", StringComparison.Ordinal)) && labels.Any(label => label.Contains("原请求", StringComparison.Ordinal)) &&
                    !labels.Any(label => label.Contains("重试", StringComparison.Ordinal) || label.Contains("冲突", StringComparison.Ordinal) || label.Contains("取消", StringComparison.Ordinal) || label.Contains("采纳", StringComparison.Ordinal)),
                    "attempted or recovered template intent exposed generic retry resolution cancellation or lacked readonly original evidence");
                if (chooseBoth)
                {
                    pairModal = ArmTemplatePairDialog(window);
                    options.Single(button => (button.Content?.ToString() ?? "").Contains("两列表", StringComparison.Ordinal)).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                }
                completed.SetResult();
            }
            catch (Exception error) { completed.SetException(error); }
            finally { if (dialog?.IsVisible == true) dialog.Close(); }
        });
        // Use the sync center's normal dispatcher, so a missing dedicated archive branch cannot pass via direct helper invocation.
        await InvokeAsync(window, "InspectOperationAsync", operation); await completed.Task;
        if (pairModal != null) await pairModal;
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static Task ArmTemplatePairDialog(MainWindow owner)
    {
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = DateTimeOffset.UtcNow;
        var timer = new DispatcherTimer(DispatcherPriority.Background, owner.Dispatcher) { Interval = TimeSpan.FromMilliseconds(15) };
        timer.Tick += (_, _) =>
        {
            var dialog = Application.Current.Windows.OfType<Window>().SingleOrDefault(candidate => candidate != owner && candidate.IsVisible && candidate.Owner == owner && candidate.Title == "模板两列表 · 只读核对");
            if (dialog == null)
            {
                if (DateTimeOffset.UtcNow - started > TimeSpan.FromSeconds(15)) { timer.Stop(); completed.TrySetException(new TimeoutException("The native readonly template pair dialog did not appear.")); }
                return;
            }
            timer.Stop();
            try
            {
                var boxes = Descendants(dialog).OfType<TextBox>().ToArray(); var text = string.Join("\n", boxes.Select(box => box.Text));
                Check(boxes.Length == 1 && boxes[0].IsReadOnly && text.Contains("active", StringComparison.Ordinal) && text.Contains("archived", StringComparison.Ordinal) &&
                    text.Contains("Unknown", StringComparison.Ordinal), "the pair inspection did not show two distinct readonly sources and its unknown-result limitation");
                completed.SetResult();
            }
            catch (Exception error) { completed.SetException(error); }
            finally { dialog.Close(); }
        };
        timer.Start(); return completed.Task;
    }
    private sealed record TemplateSample(string Name, string Path, string Method, string? Body, string Json, int Status);
    private sealed class TemplateFixture(JsonObject root)
    {
        internal Dictionary<string, TemplateSample> Samples { get; } = root["samples"]!.AsArray().OfType<JsonObject>().ToDictionary(sample => sample["name"]!.GetValue<string>(),
            sample => new TemplateSample(sample["name"]!.GetValue<string>(), sample["path"]!.GetValue<string>(), sample["method"]!.GetValue<string>(), sample["body_json"]?.GetValue<string>(), sample["response_json"]!.GetValue<string>(), sample["status"]!.GetValue<int>()), StringComparer.Ordinal);
        internal string Template => root["ids"]!["template"]!.GetValue<string>();
        internal string Todo => root["ids"]!["todo"]!.GetValue<string>();
        internal string KeepActive => root["ids"]!["keep_active"]!.GetValue<string>();
        internal string DeletedTemplate => root["ids"]!["deleted_template"]!.GetValue<string>();
        internal string Date => root["date"]!.GetValue<string>();
        internal TemplateSample Sample(string name) => Samples.GetValueOrDefault(name) ?? throw new InvalidDataException("Missing exact-source native template sample: " + name);
        internal JsonObject Row(string sample, string id) => (JsonObject)JsonNode.Parse(Sample(sample).Json)!["data"]!["items"]!.AsArray().OfType<JsonObject>().Single(row => TemplateId(row) == id).DeepClone();
    }
    private static TemplateFixture ReadTemplateArchiveFixture()
    {
        var root = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "template-archive-contract-34bff302.json")))!.AsObject();
        Check(root["source_commit"]?.GetValue<string>() == "34bff302e128c92f46f00e76d59f9b44b9b7242e" && root["synthetic_only"]?.GetValue<bool>() == true && root["external_fetch_attempts"]?.GetValue<int>() == 0 && root["production_business_requests"]?.GetValue<int>() == 0,
            "native template tests require exact isolated source and no external requests");
        return new(root);
    }
    private static async Task<MainWindow> ShowTemplateWindowAsync(string root, TemplateArchiveOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "native template tests require guarded synthetic startup");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningTemplateOrigin(origin))) { Title = "好多鱼 · 纯合成原生常用待办归档验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "template window did not initialize its injected workspace");
        await window.WaitForIdleAsync(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero && ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 &&
            Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "template test escaped actual Show guarded startup or its synthetic private directory");
        return window;
    }
    private sealed class NonOwningTemplateOrigin(TemplateArchiveOrigin origin) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request, cancellationToken); }
    private sealed class TemplateArchiveOrigin(TemplateFixture fixture) : HttpMessageHandler
    {
        internal string Scope { get; private set; } = new('d', 64);
        internal List<string> BusinessReads { get; } = [];
        internal List<(string Path, string Body, string Id)> Writes { get; } = [];
        internal Queue<(TemplateSample Sample, string? Active, string? Archived, bool Lose)> ExpectedWrites { get; } = new();
        internal Dictionary<string, (HttpStatusCode Status, string Json)> Overrides { get; } = new(StringComparer.Ordinal);
        internal string? HoldPath { get; set; }
        internal TaskCompletionSource<bool>? Hold { get; set; }
        internal string? ChangeScopeAfterPath { get; set; }
        internal int StrictBodyChecks { get; private set; }
        internal int CancelledReads { get; private set; }
        private string active = "owner-active-before", archived = "owner-archived-before";
        internal void SetLists(string activeName, string archivedName) { active = activeName; archived = archivedName; }
        internal void ExpectWrite(string name, string? activeName = null, string? archivedName = null, bool loseResponse = false) => ExpectedWrites.Enqueue((fixture.Sample(name), activeName, archivedName, loseResponse));
        internal async Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz" && request.RequestUri.IsDefaultPort &&
                request.Headers.TryGetValues("Origin", out var origins) && origins.SequenceEqual(new[] { "https://haoduoyu.xyz" }), "template transport escaped its fixed HTTPS origin");
            var path = request.RequestUri!.PathAndQuery; string json; var status = HttpStatusCode.OK;
            if (path == "/api/v1/workbench-snapshot/index?version=2")
            {
                Check(request.Method == HttpMethod.Get, "scope probe became a mutation");
                json = Wrap(Object(("snapshot_format", "haoduoyu-workbench-snapshot-v2"), ("projection", "current"), ("complete", true), ("scope_id", Scope),
                    ("timezone", "Asia/Shanghai"), ("generated_at", "2026-11-07T20:00:00.000Z"), ("manifest_hash", new string('a', 64)),
                    ("global_content_hash", new string('b', 64)), ("index_hash", new string('a', 64)), ("entities", new JsonArray()), ("dates", new JsonArray())));
            }
            else if (request.Method == HttpMethod.Get)
            {
                Check(path == TemplateList(false) || path == TemplateList(true), "template view guessed a detail or unsupported query route: " + path);
                BusinessReads.Add(path);
                if (path == HoldPath && Hold != null)
                    try { await Hold.Task.WaitAsync(cancellationToken); } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { CancelledReads++; throw; }
                if (Overrides.TryGetValue(path, out var replacement)) (status, json) = replacement;
                else json = fixture.Sample(path == TemplateList(true) ? archived : active).Json;
                if (path == ChangeScopeAfterPath) { Scope = new string('f', 64); ChangeScopeAfterPath = null; }
            }
            else
            {
                Check(ExpectedWrites.Count > 0, "unexpected mutation during native template inspection: " + path);
                var expected = ExpectedWrites.Dequeue(); var body = await request.Content!.ReadAsStringAsync(cancellationToken); var parsed = JsonNode.Parse(body)!.AsObject();
                Check(request.Method.Method == expected.Sample.Method && path == expected.Sample.Path && parsed.Count == 1 && parsed["version"] is JsonValue version &&
                    version.TryGetValue<long>(out var number) && number > 0 && number < 9_007_199_254_740_991L && JsonNode.DeepEquals(parsed, JsonNode.Parse(expected.Sample.Body!)) &&
                    request.Headers.TryGetValues("X-Public-Business", out var marker) && marker.SequenceEqual(new[] { "1" }), "native template write differed from exact-source single-version body or original write protections");
                var id = request.Headers.TryGetValues("Idempotency-Key", out var keys) ? keys.Single() : "";
                Check(Guid.TryParseExact(id, "D", out _), "native template request lost its durable UUID header");
                StrictBodyChecks++; Writes.Add((path, body, id));
                if (expected.Active != null && expected.Archived != null) SetLists(expected.Active, expected.Archived);
                if (expected.Lose) throw new HttpRequestException("Synthetic exact-source response lost after commit; no socket was opened.");
                json = expected.Sample.Json; status = (HttpStatusCode)expected.Sample.Status;
            }
            return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request, cancellationToken);
    }
}
