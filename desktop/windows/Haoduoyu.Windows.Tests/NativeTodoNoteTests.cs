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
    private static IReadOnlyList<(string Name, Action Run)> TodoNoteCases =>
    [
        ("Shown private todo notes retain untouched raw CRLF whitespace independent drafts and same-key search continuation across restart and profiles", () => RunWithDispatcher(TodoNoteOfflineAsync)),
        ("Shown private todo note transport accepts source CAS replay and omitted clear responses, preserves conflicts and unknown requests, and explicitly requeues an unsent expired-session request", () => RunWithDispatcher(TodoNoteTransportAsync)),
        ("Shown todo note public guards and failed cancelled foreign-scope reads preserve private work and recovered unknown completion and delete fences", () => RunWithDispatcher(TodoNotePreservationAsync))
    ];

    private static async Task TodoNoteOfflineAsync()
    {
        var fixture = ReadTodoNoteFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var identity = "user:" + fixture.Owner + ":" + new string('d', 64); var otherIdentity = "user:" + fixture.Other + ":" + new string('e', 64);
            var raw = fixture.Row("owner-after-save-get")["note"]!.GetValue<string>();
            var original = fixture.Row("owner-after-save-get"); var key = TodoNoteDraftKey(fixture.Todo); var createKey = TodoNoteBase(fixture.Todo);
            var createOriginal = fixture.Row("owner-baseline-get"); createOriginal["version"] = 0;
            var createValues = (JsonObject)createOriginal.DeepClone(); createValues["text"] = "必须独立保留的待办原创建稿";
            var creationDraft = AppDraft("todo", createKey, createOriginal, createValues);
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [fixture.ListPath] = fixture.Sample("owner-after-save-get").Json }, creationDraft);
            var whitespaceRow = fixture.Row("owner-after-whitespace-get"); var whitespace = whitespaceRow["note"]!.GetValue<string>();
            var secondDraft = TodoNoteAppDraft(fixture, whitespaceRow, whitespace);
            await SeedCalendarWorkspaceAsync(root, otherIdentity, new Dictionary<string, string>(), secondDraft);
            RememberTodoNoteProfiles(root, fixture, identity); var window = await ShowAsync(root, handler);
            try
            {
                await InvokeAsync(window, "TodoNoteAsync", original); await TodoNoteLayoutAsync(window);
                Check(TodoNoteControl<TextBox>(window, "todo-note-text") is { IsReadOnly: false }, "a known private offline profile could not continue a full todo-note baseline");
                await TodoNoteClickAsync(window, "todo-note-save-local");
                Check(TodoNoteDraftText(Engine(window).Snapshot, key) == raw && raw.Contains("\r\n", StringComparison.Ordinal) && raw.Contains("e\u0301", StringComparison.Ordinal) &&
                    Engine(window).Snapshot.Drafts[createKey].Text == creationDraft.Text && Engine(window).Snapshot.Drafts.Count == 2 && Engine(window).Snapshot.Outbox.Count == 0,
                    "untouched native editing normalized raw CRLF Unicode or whitespace, or reused the separate original todo creation draft");
                await CloseAsync(window); window = await ShowAsync(root, handler);
                await InvokeAsync(window, "ContinueDraftAsync", key);
                Check(TodoNoteDraftText(Engine(window).Snapshot, key) == raw && TodoNoteControl<TextBox>(window, "todo-note-text").Text.Contains("合成未完成原因", StringComparison.Ordinal),
                    "restarting or the normal draft dispatcher lost the original raw todo note");
                await ClickAsync(window, "本机检索"); SearchInput(window).Text = "合成未完成原因"; await ClickAsync(window, "检索本机资料");
                var hit = SearchRows(window).Single(row => row.Subtitle.Contains("待办备注", StringComparison.Ordinal) && row.Subtitle.Contains("本机草稿", StringComparison.Ordinal));
                var list = Descendants(Field<StackPanel>(window, "page")).OfType<ListBox>().Single(); list.ScrollIntoView(hit); await TodoNoteLayoutAsync(window);
                Check(list.ItemContainerGenerator.ContainerFromItem(hit) is ListBoxItem && VisibleText(window).Contains("待办备注", StringComparison.Ordinal),
                    "the actual native search did not render the independently typed todo-note draft");
                list.SelectedItem = hit; await window.WaitForIdleAsync(); await TodoNoteLayoutAsync(window);
                Check(Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single().IsReadOnly, "search bypassed the readonly source preview");
                await ClickAsync(window, "继续此本机草稿"); await TodoNoteClickAsync(window, "todo-note-save-local");
                Check(TodoNoteDraftText(Engine(window).Snapshot, key) == raw && Engine(window).Snapshot.Drafts[createKey].Text == creationDraft.Text,
                    "search continuation changed raw original content or wrote to the todo creation draft key");
                await TodoNoteClickAsync(window, "todo-note-save-queue"); var queued = Engine(window).Snapshot.Outbox.Single();
                Check(queued.Status == PendingStatus.Queued && queued.ResourceKey == createKey && queued.TodoNoteDate == fixture.Date && queued.Path == createKey + "/note" &&
                    JsonNode.Parse(queued.RequestBodyJson)!["note"]!.GetValue<string>() == raw && Engine(window).Snapshot.Cache[fixture.ListPath] == fixture.Sample("owner-after-save-get").Json,
                    "the private offline native save changed raw note bytes the original dated baseline or the shared todo resource fence");
                SaveEvidence(window, "todo-note-private-raw-search.png");
                await InvokeAsync(window, "OpenOfflineProfileAsync", otherIdentity); await InvokeAsync(window, "ContinueDraftAsync", key);
                await TodoNoteClickAsync(window, "todo-note-save-local");
                Check(TodoNoteDraftText(Engine(window).Snapshot, key) == whitespace && whitespace == " \t\r\n " && Engine(window).Snapshot.Drafts.Count == 1 &&
                    !VisibleText(window).Contains("合成未完成原因", StringComparison.Ordinal), "changing profiles trimmed a whitespace-only note or exposed the previous owner's draft");
                await ClickAsync(window, "本机检索"); Check(SearchInput(window).Text.Length == 0, "a previous private owner's note query crossed into another profile");
                SearchInput(window).Text = "合成未完成原因"; await ClickAsync(window, "检索本机资料");
                Check(SearchRows(window).Length == 0 && Engine(window).Snapshot.Drafts.Count == 1 && TodoNoteDraftText(Engine(window).Snapshot, key) == whitespace,
                    "the second private profile's search included the first private owner's note");
                await InvokeAsync(window, "OpenOfflineProfileAsync", identity); await InvokeAsync(window, "ContinueDraftAsync", key);
                Check(TodoNoteDraftText(Engine(window).Snapshot, key) == raw && Engine(window).Snapshot.Drafts[createKey].Text == creationDraft.Text &&
                    Engine(window).Snapshot.Outbox.Single().Id == queued.Id && Engine(window).Snapshot.Outbox.Single().RequestBodyJson == queued.RequestBodyJson &&
                    handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0, "offline restart search or private profile navigation changed note identity or opened transport");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task TodoNoteTransportAsync()
    {
        var fixture = ReadTodoNoteFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TodoNoteOrigin(fixture);
            var identity = "user:" + fixture.Owner + ":" + origin.Scope; var key = TodoNoteDraftKey(fixture.Todo);
            var raw = JsonNode.Parse(fixture.Sample("owner-save-v1").Body!)!["note"]!.GetValue<string>();
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [fixture.ListPath] = fixture.Sample("owner-baseline-get").Json },
                TodoNoteAppDraft(fixture, fixture.Row("owner-baseline-get"), raw));
            RememberTodoNoteProfiles(root, fixture, identity); var window = await ShowTodoNoteWindowAsync(root, origin);
            try
            {
                await SetTodoNoteDayAsync(window, fixture); await TodoNoteLoginAsync(window); await InvokeAsync(window, "ContinueDraftAsync", key);
                origin.ExpectWrite("owner-save-v1", "owner-after-save-get"); await TodoNoteClickAsync(window, "todo-note-save-queue");
                var first = Engine(window).Snapshot.Outbox.Single();
                Check(first.Status == PendingStatus.Confirmed && first.ResourceKey == TodoNoteBase(fixture.Todo) && first.TodoNoteDate == fixture.Date &&
                    JsonNode.DeepEquals(JsonNode.Parse(first.RequestBodyJson), JsonNode.Parse(fixture.Sample("owner-save-v1").Body!)) &&
                    JsonNode.Parse(first.RequestBodyJson)!["note"]!.GetValue<string>() == raw, "native note save changed exact raw content metadata or the same-todo CAS resource fence");
                origin.ExpectWrite("owner-replay-v1"); var replay = TodoNoteIntent(fixture, "owner-replay-v1"); await Engine(window).QueueAsync(replay); var report = await Engine(window).SyncAsync();
                Check(report.Confirmed == 1 && Engine(window).Snapshot.Outbox.Single(op => op.Id == replay.Id).Status == PendingStatus.Confirmed &&
                    JsonNode.Parse(fixture.Sample("owner-replay-v1").Json)!["data"]!["version"]!.GetValue<long>() == 2,
                    "a valid exact-source conditional version-plus-one replay was rejected or confused with archive same-version no-op semantics");
                await InvokeAsync(window, "ContinueDraftAsync", key); origin.ExpectWrite("owner-same-text-current-v2");
                await TodoNoteClickAsync(window, "todo-note-save-queue");
                Check(Engine(window).Snapshot.Outbox.Last().Status == PendingStatus.Confirmed && Engine(window).Snapshot.Drafts[key].BaseVersion == 3,
                    "same text at the current todo-note version failed to advance its verified baseline exactly once");
                await InvokeAsync(window, "ContinueDraftAsync", key); await TodoNoteLayoutAsync(window);
                Check(TodoNoteControl<TextBox>(window, "todo-note-text").IsLoaded, "the actual native note editor did not load before its clear input was edited");
                TodoNoteControl<TextBox>(window, "todo-note-text").Text = "";
                await TodoNoteClickAsync(window, "todo-note-save-local"); origin.ExpectWrite("owner-clear-v3", "owner-after-clear-get");
                // Invoke the real save button's post-clear-confirmation body; accepting a Win32 MessageBox is deliberately not automated.
                await InvokeAsync(window, "QueueTodoNoteDraftAsync", key);
                var clear = Engine(window).Snapshot.Outbox.Last(); var clearData = JsonNode.Parse(clear.RemoteJson!)!["data"]!.AsObject();
                var state = Engine(window).Snapshot; var projected = JsonNode.Parse(WorkspaceProjection.Project(fixture.ListPath, state.Cache[fixture.ListPath], state)!)!["data"]!["items"]!.AsArray()
                    .OfType<JsonObject>().Single(row => row["id"]!.GetValue<string>() == fixture.Todo);
                Check(clear.Status == PendingStatus.Confirmed && !clearData.ContainsKey("note") && TodoNotes.ReadNote(projected) is { Known: true, Note: "" } &&
                    TodoNoteDraftText(state, key) == "" && projected["text"]!.GetValue<string>() == fixture.Row("owner-baseline-get")["text"]!.GetValue<string>() &&
                    !projected["completed"]!.GetValue<bool>() && projected["template_id"]!.GetValue<string>() == fixture.Template,
                    "a successful omitted-note clear resurrected old text, remained unknown, or changed the original todo date completion or template history");
                Check(origin.ExpectedWrites.Count == 0 && origin.StrictBodyChecks == origin.Writes.Count && origin.Writes.Select(write => write.Id).Distinct(StringComparer.Ordinal).Count() == 4 && sockets.Connects == 0,
                    "native todo-note writes bypassed strict captured request checking or reused an operation identity");
                SaveEvidence(window, "todo-note-cas-replay-clear.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TodoNoteOrigin(fixture); origin.SetGet("unknown-before-get");
            var identity = "user:" + fixture.Owner + ":" + origin.Scope; var key = TodoNoteDraftKey(fixture.Todo);
            var unknownSample = fixture.Sample("unknown-note-v12-simulated-response-loss");
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [fixture.ListPath] = fixture.Sample("unknown-before-get").Json },
                TodoNoteAppDraft(fixture, fixture.Row("unknown-before-get"), JsonNode.Parse(unknownSample.Body!)!["note"]!.GetValue<string>()));
            RememberTodoNoteProfiles(root, fixture, identity); var window = await ShowTodoNoteWindowAsync(root, origin);
            try
            {
                await SetTodoNoteDayAsync(window, fixture); await TodoNoteLoginAsync(window); await InvokeAsync(window, "ContinueDraftAsync", key);
                origin.ExpectWrite(unknownSample.Name, "unknown-current-get", loseResponse: true); await TodoNoteClickAsync(window, "todo-note-save-queue");
                var unknown = Engine(window).Snapshot.Outbox.Single(); var request = unknown.RequestBodyJson; var originalDraft = Engine(window).Snapshot.Drafts[key];
                Check(unknown.Status == PendingStatus.Unknown && unknown.SendAttempts == 1 && unknown.TodoNoteDate == fixture.Date, "lost acknowledgement did not retain one dated unknown note request");
                await InspectTodoNoteAsync(window, unknown, readDate: true, expectReadDialog: true);
                var after = Engine(window).Snapshot.Outbox.Single();
                Check(after.Status == PendingStatus.Unknown && after.Id == unknown.Id && after.BodyJson == unknown.BodyJson && after.RequestBodyJson == request && after.SendAttempts == 1 && origin.Writes.Count == 1,
                    "matching current-date text confirmed rewrote or automatically resent a particular lost note request");
                var observedTodo = JsonNode.Parse(Engine(window).Snapshot.Cache[fixture.ListPath])!["data"]!["items"]!.AsArray().OfType<JsonObject>()
                    .Single(row => row["id"]!.GetValue<string>() == fixture.Todo);
                Check(Engine(window).Snapshot.Drafts[key].Text == originalDraft.Text && Engine(window).Snapshot.Drafts[key].BaseVersion == originalDraft.BaseVersion &&
                    originalDraft.BaseVersion == JsonNode.Parse(unknownSample.Body!)!["version"]!.GetValue<long>() && observedTodo["completed"]!.GetValue<bool>() &&
                    observedTodo["date"]!.GetValue<string>() == fixture.Date && observedTodo["template_id"]!.GetValue<string>() == fixture.Template &&
                    observedTodo["text"]!.GetValue<string>() == fixture.Row("unknown-before-get")["text"]!.GetValue<string>(),
                    "reading matching current text adopted a new write baseline or changed the completed original todo history without an exact receipt");
                var refused = false; try { await Engine(window).RetryUnchangedAsync(unknown.Id, fixture.Sample("unknown-current-get").Json); } catch (InvalidOperationException) { refused = true; }
                Check(refused && origin.Writes.Count == 1 && sockets.Connects == 0, "the dedicated todo-note unknown fence accepted generic unchanged retry or opened a real socket");
                SaveEvidence(window, "todo-note-unknown-original-date.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TodoNoteOrigin(fixture); origin.SetGet("owner-after-save-get");
            var identity = "user:" + fixture.Owner + ":" + origin.Scope; var key = TodoNoteDraftKey(fixture.Todo);
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [fixture.ListPath] = fixture.Sample("owner-baseline-get").Json },
                TodoNoteAppDraft(fixture, fixture.Row("owner-baseline-get"), JsonNode.Parse(fixture.Sample("owner-stale-version-v1-same-text").Body!)!["note"]!.GetValue<string>()));
            RememberTodoNoteProfiles(root, fixture, identity); var window = await ShowTodoNoteWindowAsync(root, origin);
            try
            {
                await SetTodoNoteDayAsync(window, fixture); await TodoNoteLoginAsync(window); await InvokeAsync(window, "ContinueDraftAsync", key);
                origin.ExpectWrite("owner-stale-version-v1-same-text"); await TodoNoteClickAsync(window, "todo-note-save-queue"); var conflict = Engine(window).Snapshot.Outbox.Single();
                Check(conflict.Status == PendingStatus.Conflict && conflict.RemoteJson == fixture.Sample("owner-stale-version-v1-same-text").Json &&
                    JsonNode.DeepEquals(JsonNode.Parse(conflict.RequestBodyJson), JsonNode.Parse(fixture.Sample("owner-stale-version-v1-same-text").Body!)),
                    "the real stale same-text CAS conflict was treated as a successful conditional replay or lost its original evidence");
                await InspectTodoNoteAsync(window, conflict, readDate: false, expectReadDialog: false);
                Check(Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Conflict && origin.Writes.Count == 1 && sockets.Connects == 0,
                    "the private note conflict inspector released a version conflict or exposed generic overwrite");
            }
            finally { await CloseIfOpenAsync(window); }
        });
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TodoNoteOrigin(fixture);
            var identity = "user:" + fixture.Owner + ":" + origin.Scope; var key = TodoNoteDraftKey(fixture.Todo);
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [fixture.ListPath] = fixture.Sample("owner-baseline-get").Json },
                TodoNoteAppDraft(fixture, fixture.Row("owner-baseline-get"), JsonNode.Parse(fixture.Sample("owner-save-v1").Body!)!["note"]!.GetValue<string>()));
            RememberTodoNoteProfiles(root, fixture, identity); var window = await ShowTodoNoteWindowAsync(root, origin);
            try
            {
                await SetTodoNoteDayAsync(window, fixture); await TodoNoteLoginAsync(window); await InvokeAsync(window, "ContinueDraftAsync", key);
                var api = Field<WorkbenchApi>(window, "api"); origin.ExpireOnMe = true;
                await api.RestoreSessionAsync(new SessionMaterial(new string('a', 64), DateTimeOffset.UtcNow.AddHours(1), fixture.Owner, "synthetic-todo-note-owner"));
                origin.ExpireOnMe = false; api.BindScope(origin.Scope); var callsBeforeSave = origin.Calls;
                Check(!api.PublicMode && api.UserId == fixture.Owner && api.ExportSession() is null, "the isolated session-expiry scenario did not actually expire its authenticated synthetic cookie");
                await TodoNoteClickAsync(window, "todo-note-save-queue"); var blocked = Engine(window).Snapshot.Outbox.Single();
                Check(blocked.Status == PendingStatus.Blocked && blocked.RemoteJson is null && blocked.SendAttempts == 1 && origin.Calls == callsBeforeSave && origin.Writes.Count == 0,
                    "the expired private session performed HTTP, fabricated remote rejection evidence, or lost its explicitly unsent blocked note intent");
                var request = blocked.RequestBodyJson; var draft = Engine(window).Snapshot.Drafts[key];
                await TodoNoteLoginAsync(window); await ClickAsync(window, "同步中心");
                await InspectTodoNoteAsync(window, blocked, readDate: true, expectReadDialog: true, allowBlockedRetry: true);
                Check(Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Blocked && origin.Writes.Count == 0,
                    "a current-date read automatically confirmed or resent an expired-session note request");
                var checkedDate = Engine(window).Snapshot.Cache[fixture.ListPath]; var callsBeforeRetry = origin.Calls;
                // Invoke the real inspector's post-confirmation body after its actual readonly date check; Win32 confirmation acceptance is not automated.
                await InvokeAsync(window, "RetryBlockedTodoNoteAfterCheckAsync", blocked.Id, checkedDate);
                var requeued = Engine(window).Snapshot.Outbox.Single();
                Check(requeued.Status == PendingStatus.Queued && requeued.Id == blocked.Id && requeued.ResourceKey == blocked.ResourceKey && requeued.Method == blocked.Method &&
                    requeued.Path == blocked.Path && requeued.BodyJson == blocked.BodyJson && requeued.RequestBodyJson == request && requeued.TodoNoteDate == blocked.TodoNoteDate &&
                    requeued.SendAttempts == blocked.SendAttempts && Engine(window).Snapshot.Drafts[key].Text == draft.Text &&
                    origin.Calls == callsBeforeRetry && origin.Writes.Count == 0 && sockets.Connects == 0,
                    "explicit requeue changed the original unsent note identity bytes date or draft, or sent it automatically before a separate sync action");
                SaveEvidence(window, "todo-note-expired-session-explicit-requeue.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task TodoNotePreservationAsync()
    {
        var fixture = ReadTodoNoteFixture();
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new TodoNoteOrigin(fixture); origin.SetGet("unknown-before-get");
            var identity = "user:" + fixture.Owner + ":" + origin.Scope; var publicIdentity = "public:" + new string('a', 64); var key = TodoNoteDraftKey(fixture.Todo);
            var row = fixture.Row("unknown-before-get"); var note = row["note"]!.GetValue<string>();
            var draft = TodoNoteAppDraft(fixture, row, note + "；保留未排队的后来原稿");
            var operation = TodoNoteIntent(fixture, "unknown-note-v12-simulated-response-loss") with { Status = PendingStatus.Unknown, SendAttempts = 1 };
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string> { [fixture.ListPath] = fixture.Sample("unknown-before-get").Json }, draft, operation);
            await SeedCalendarWorkspaceAsync(root, publicIdentity, new Dictionary<string, string>());
            RememberTodoNoteProfiles(root, fixture, publicIdentity); var window = await ShowTodoNoteWindowAsync(root, origin);
            try
            {
                await InvokeAsync(window, "TodoNoteAsync", row); await TodoNoteLayoutAsync(window);
                Check(!Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Any(box => !box.IsReadOnly) &&
                    !Descendants(Field<StackPanel>(window, "page")).OfType<Button>().Any(button => AutomationProperties.GetAutomationId(button) == "todo-note-save-queue") &&
                    Engine(window).Snapshot.Drafts.Count == 0, "the public note view created an editable private draft or exposed queue submission");
                var refused = false;
                try { await Field<WorkbenchApi>(window, "api").SendAsync("PATCH", operation.Path, operation.BodyJson, operation.Id); } catch (ScopeGuardException) { refused = true; }
                var queueRefused = false; try { await InvokeAsync(window, "QueueTodoNoteDraftAsync", key); } catch (InvalidOperationException) { queueRefused = true; }
                Check(refused && queueRefused && origin.Calls == 0 && origin.Writes.Count == 0 && Engine(window).Snapshot.Outbox.Count == 0 && Engine(window).Snapshot.Drafts.Count == 0,
                    "public todo-note submission created local private work or performed HTTP before rejecting its missing original private profile and session");
                await InvokeAsync(window, "OpenOfflineProfileAsync", identity); await SetTodoNoteDayAsync(window, fixture); await TodoNoteLoginAsync(window);
                await ClickAsync(window, "同步中心");
                var accepted = Engine(window).Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                foreach (var replacement in new[] { (HttpStatusCode.OK, "{\"data\":{}}"), (HttpStatusCode.ServiceUnavailable, "{\"error\":\"synthetic-unavailable\"}"),
                    (HttpStatusCode.OK, new string(' ', WorkbenchApi.MaximumResponseBytes + 1)) })
                {
                    origin.ReadOverride = replacement; await InspectTodoNoteAsync(window, operation, readDate: true, expectReadDialog: false);
                    await AssertTodoNotePreservedAsync(window, accepted, bytes, "a rejected original-date note response");
                    origin.ReadOverride = null;
                }
                origin.Hold = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously); var reads = origin.BusinessReads.Count;
                var inspect = InspectTodoNoteAsync(window, operation, readDate: true, expectReadDialog: false);
                await UntilAsync(() => origin.BusinessReads.Count > reads, "note cancellation did not reach its explicit original-date GET");
                Descendants(window).OfType<Button>().Single(button => button.Content?.ToString() == "取消当前操作").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await inspect; origin.Hold.TrySetResult(true); origin.Hold = null;
                Check(origin.CancelledReads == 1, "native cancellation did not reach the in-flight original-date note read");
                await AssertTodoNotePreservedAsync(window, accepted, bytes, "a cancelled original-date note read");
                var completeRefused = false;
                try { await InvokeAsync(window, "SetTodoCompletionAsync", (JsonObject)row.DeepClone(), false); } catch (InvalidOperationException) { completeRefused = true; }
                var deleteRefused = false;
                try { await Engine(window).QueueAsync(new PendingOperation { ResourceKey = TodoNoteBase(fixture.Todo), Method = "DELETE", Path = TodoNoteBase(fixture.Todo),
                    BodyJson = Object(("date", fixture.Date), ("version", row["version"]!.DeepClone())).ToJsonString() }); } catch (InvalidOperationException) { deleteRefused = true; }
                Check(completeRefused && deleteRefused, "a pending note's same-todo resource fence allowed a completion or deletion to overtake the unknown write");
                await AssertTodoNotePreservedAsync(window, accepted, bytes, "same-todo completion and deletion refusal");
                origin.ChangeScopeAfterRead = true; await InspectTodoNoteAsync(window, operation, readDate: true, expectReadDialog: false);
                await AssertTodoNotePreservedAsync(window, accepted, bytes, "a foreign-scope original-date note response");
                Check(!Field<bool>(window, "connected") && origin.Writes.Count == 0 && sockets.Connects == 0, "scope drift retained write trust or private note inspection opened transport");
                SaveEvidence(window, "todo-note-guards-preservation.png");
                // Run the existing recovery button's post-confirmation body against the actual temporary DPAPI backup, never a synthetic restore DTO.
                await InvokeAsync(window, "RestoreWorkspaceBackupAsync"); var restored = Engine(window).Snapshot.Outbox.Single(item => item.Id == operation.Id);
                Check(restored.Status == PendingStatus.Unknown && restored.RecoveredAtRevision == Engine(window).Snapshot.BackupRecoveryRevision && restored.RecoveredAtRevision > 0 &&
                    restored.ResourceKey == operation.ResourceKey && restored.Method == operation.Method && restored.Path == operation.Path && restored.TodoNoteDate == operation.TodoNoteDate &&
                    restored.RequestBodyJson == operation.RequestBodyJson && !restored.CanEditQueued && Engine(window).Snapshot.Drafts[key].Text == draft.Text,
                    "backup recovery lost note provenance original date bytes or original later draft, or released its unknown fence");
                await InspectTodoNoteAsync(window, restored, readDate: false, expectReadDialog: false);
                var retryRefused = false; try { await Engine(window).RetryUnchangedAsync(restored.Id, fixture.Sample("unknown-current-get").Json); } catch (InvalidOperationException) { retryRefused = true; }
                await CloseAsync(window); window = await ShowTodoNoteWindowAsync(root, origin);
                Check(retryRefused && Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown && Engine(window).Snapshot.Outbox.Single().TodoNoteDate == fixture.Date &&
                    Engine(window).Snapshot.Outbox.Single().RequestBodyJson == operation.RequestBodyJson && Engine(window).Snapshot.Drafts[key].Text == draft.Text && origin.Writes.Count == 0,
                    "native restart or generic retry lost the recovered unknown note's exact original request or separate draft");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static LocalDraft TodoNoteAppDraft(TodoNoteFixture fixture, JsonObject original, string note) => AppDraft("todo-note", TodoNoteDraftKey(fixture.Todo), original,
        Object(("note", note), ("note_known", true))) with { Title = "待办备注 · 纯合成本机原稿" };
    private static async Task SetTodoNoteDayAsync(MainWindow window, TodoNoteFixture fixture)
    {
        Field<DatePicker>(window, "date").SelectedDate = DateTime.ParseExact(fixture.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        await window.WaitForIdleAsync(); await TodoNoteLayoutAsync(window);
    }
    private static async Task InspectTodoNoteAsync(MainWindow window, PendingOperation operation, bool readDate, bool expectReadDialog, bool allowBlockedRetry = false)
    {
        var choice = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); Task? resultModal = null;
        _ = window.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            Window? dialog = null;
            try
            {
                dialog = Application.Current.Windows.OfType<Window>().Single(candidate => candidate != window && candidate.IsVisible && candidate.Owner == window);
                var text = string.Join("\n", Descendants(dialog).OfType<TextBlock>().Select(block => block.Text));
                var buttons = Descendants(dialog).OfType<Button>().ToArray(); var labels = buttons.Select(button => button.Content?.ToString() ?? "").ToArray();
                Check(dialog.Title == "待办备注请求" && text.Contains(operation.Path, StringComparison.Ordinal) && text.Contains(operation.TodoNoteDate!, StringComparison.Ordinal) &&
                    labels.Contains("只读核对原日期") && labels.Any(label => label.Contains("原请求", StringComparison.Ordinal)) &&
                    labels.Contains("核对后重试同一备注请求") == allowBlockedRetry && (!allowBlockedRetry || operation is { Status: PendingStatus.Blocked, RecoveredAtRevision: 0, RemoteJson: null }) &&
                    !labels.Any(label => label.Contains("重试", StringComparison.Ordinal) && label != "核对后重试同一备注请求" || label.Contains("冲突", StringComparison.Ordinal) || label.Contains("取消", StringComparison.Ordinal) || label.Contains("采纳", StringComparison.Ordinal)),
                    "attempted recovered or conflicting note intent exposed generic mutation resolution or lacked its original dated request evidence");
                if (readDate)
                {
                    if (expectReadDialog) resultModal = ArmTodoNoteDateDialog(window, operation);
                    buttons.Single(button => button.Content?.ToString() == "只读核对原日期").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                }
                choice.SetResult();
            }
            catch (Exception error) { choice.SetException(error); }
            finally { if (dialog?.IsVisible == true) dialog.Close(); }
        });
        // Use the sync center's normal route and Run action so cancellation, exception reporting and readonly dispatch are exercised together.
        var method = typeof(MainWindow).GetMethod("InspectOperationAsync", Private)!;
        Func<Task> action = () => (Task)method.Invoke(window, [operation])!;
        typeof(MainWindow).GetMethod("Run", Private)!.Invoke(window, [action]);
        await window.WaitForIdleAsync(); await choice.Task; if (resultModal != null) await resultModal; await TodoNoteLayoutAsync(window);
    }
    private static Task ArmTodoNoteDateDialog(MainWindow owner, PendingOperation operation)
    {
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var started = DateTimeOffset.UtcNow;
        var timer = new DispatcherTimer(DispatcherPriority.Background, owner.Dispatcher) { Interval = TimeSpan.FromMilliseconds(15) };
        timer.Tick += (_, _) =>
        {
            var dialog = Application.Current.Windows.OfType<Window>().SingleOrDefault(candidate => candidate != owner && candidate.IsVisible && candidate.Owner == owner);
            if (dialog == null)
            {
                if (DateTimeOffset.UtcNow - started > TimeSpan.FromSeconds(15)) { timer.Stop(); completed.TrySetException(new TimeoutException("The native readonly todo-note date dialog did not appear.")); }
                return;
            }
            timer.Stop();
            try
            {
                var box = Descendants(dialog).OfType<TextBox>().Single();
                Check(dialog.Title == "待办备注原日期 · 只读核对" && box.IsReadOnly && box.Text.Contains(operation.TodoNoteDate!, StringComparison.Ordinal) && box.Text.Contains("Unknown", StringComparison.Ordinal),
                    "the original-date inspection omitted readonly provenance or its unknown-result limitation"); completed.SetResult();
            }
            catch (Exception error) { completed.SetException(error); }
            finally { dialog.Close(); }
        };
        timer.Start(); return completed.Task;
    }

    private static string TodoNoteBase(string id) => "/api/v1/todos/" + id;
    private static string TodoNoteDraftKey(string id) => "/local/todo-note/" + id;
    private static T TodoNoteControl<T>(MainWindow window, string id) where T : FrameworkElement => Descendants(Field<StackPanel>(window, "page")).OfType<T>()
        .Single(control => AutomationProperties.GetAutomationId(control) == id);
    private static async Task TodoNoteLayoutAsync(MainWindow window)
    { window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout(); }
    private static async Task TodoNoteClickAsync(MainWindow window, string id)
    {
        var button = TodoNoteControl<Button>(window, id); Check(button.IsEnabled, "disabled native todo-note action: " + id);
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); await window.WaitForIdleAsync(); await TodoNoteLayoutAsync(window);
    }
    private static string TodoNoteDraftText(WorkspaceState state, string key) => JsonNode.Parse(state.Drafts[key].Text)!["values"]!["note"]!.GetValue<string>();
    private static PendingOperation TodoNoteIntent(TodoNoteFixture fixture, string sample) => new()
    {
        Id = Guid.NewGuid().ToString(), ResourceKey = TodoNoteBase(fixture.Todo), Path = fixture.Sample(sample).Path, Method = "PATCH",
        BodyJson = fixture.Sample(sample).Body!, TodoNoteDate = fixture.Date
    };
    private static void RememberTodoNoteProfiles(string root, TodoNoteFixture fixture, string selected) => RememberProfiles(root, new string('a', 64),
        fixture.Owner, new string('d', 64), fixture.Other, new string('e', 64), selected);
    private static async Task AssertTodoNotePreservedAsync(MainWindow window, WorkspaceState before, byte[] bytes, string reason)
    {
        var after = Engine(window).Snapshot;
        Check(JsonSerializer.Serialize(after.Cache) == JsonSerializer.Serialize(before.Cache) && JsonSerializer.Serialize(after.CacheRevisions) == JsonSerializer.Serialize(before.CacheRevisions) &&
            JsonSerializer.Serialize(after.Drafts) == JsonSerializer.Serialize(before.Drafts) && JsonSerializer.Serialize(after.Outbox) == JsonSerializer.Serialize(before.Outbox) &&
            (await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(bytes), reason + " changed caches independent drafts original intents or encrypted bytes");
    }
    private static async Task TodoNoteLoginAsync(MainWindow window)
    {
        // Only the existing owned WPF login dialog is driven. Credentials and session below are synthetic and never leave the fake handler.
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = window.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            Window? dialog = null;
            try
            {
                dialog = Application.Current.Windows.OfType<Window>().Single(candidate => candidate != window && candidate.IsVisible && candidate.Owner == window);
                Check(dialog.Title == "所有者登录", "todo-note transport did not use the existing native login form");
                Descendants(dialog).OfType<TextBox>().Single().Text = "synthetic-todo-note-owner";
                Descendants(dialog).OfType<PasswordBox>().Single().Password = "synthetic-only-password";
                Descendants(dialog).OfType<Button>().Single(button => button.Content?.ToString() == "登录").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                completed.SetResult();
            }
            catch (Exception error) { completed.SetException(error); }
            finally { if (dialog?.IsVisible == true) dialog.Close(); }
        });
        Descendants(window).OfType<Button>().Single(button => button.Content?.ToString() == "所有者登录").RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await window.WaitForIdleAsync(); await completed.Task; await TodoNoteLayoutAsync(window);
        Check(Field<bool>(window, "connected") && !Field<WorkbenchApi>(window, "api").PublicMode, "synthetic native login did not establish the original private session and scope");
    }
    private static async Task<MainWindow> ShowTodoNoteWindowAsync(string root, TodoNoteOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "native todo-note tests require guarded synthetic startup");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningTodoNoteOrigin(origin))) { Title = "好多鱼 · 纯合成原生待办备注验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "todo-note window did not initialize its injected workspace");
        await window.WaitForIdleAsync(); await TodoNoteLayoutAsync(window);
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero && ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 &&
            Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "todo-note test escaped actual Show guarded startup or the synthetic private directory");
        return window;
    }
    private sealed record TodoNoteSample(string Name, string Path, string Method, string? Body, string Json, int Status);
    private sealed class TodoNoteFixture(JsonObject root)
    {
        internal Dictionary<string, TodoNoteSample> Samples { get; } = root["samples"]!.AsArray().OfType<JsonObject>().ToDictionary(sample => sample["name"]!.GetValue<string>(),
            sample => new TodoNoteSample(sample["name"]!.GetValue<string>(), sample["path"]!.GetValue<string>(), sample["method"]!.GetValue<string>(), sample["body_json"]?.GetValue<string>(), sample["response_json"]!.GetValue<string>(), sample["status"]!.GetValue<int>()), StringComparer.Ordinal);
        internal string Todo => root["ids"]!["todo"]!.GetValue<string>();
        internal string Template => root["ids"]!["template"]!.GetValue<string>();
        internal string Owner => root["users"]!["owner"]!.GetValue<string>();
        internal string Other => root["users"]!["other"]!.GetValue<string>();
        internal string Date => root["date"]!.GetValue<string>();
        internal string ListPath => "/api/v1/todos?date=" + Date;
        internal TodoNoteSample Sample(string name) => Samples.GetValueOrDefault(name) ?? throw new InvalidDataException("Missing exact-source native todo-note sample: " + name);
        internal JsonObject Row(string sample)
        {
            var data = JsonNode.Parse(Sample(sample).Json)!["data"]!;
            return (JsonObject)(data["items"] is JsonArray items ? items.OfType<JsonObject>().Single(row => row["id"]!.GetValue<string>() == Todo) : data).DeepClone();
        }
    }
    private static TodoNoteFixture ReadTodoNoteFixture()
    {
        var root = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "todo-note-contract-34bff302.json")))!.AsObject();
        Check(root["source_commit"]?.GetValue<string>() == "34bff302e128c92f46f00e76d59f9b44b9b7242e" && root["synthetic_only"]?.GetValue<bool>() == true && root["external_fetch_attempts"]?.GetValue<int>() == 0 && root["production_business_requests"]?.GetValue<int>() == 0,
            "native todo-note tests require exact isolated source and no external requests");
        return new(root);
    }
    private sealed class NonOwningTodoNoteOrigin(TodoNoteOrigin origin) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request, cancellationToken); }
    private sealed class TodoNoteOrigin(TodoNoteFixture fixture) : HttpMessageHandler
    {
        internal string Scope { get; private set; } = new('d', 64);
        internal List<string> BusinessReads { get; } = [];
        internal List<(string Path, string Body, string Id)> Writes { get; } = [];
        internal Queue<(TodoNoteSample Sample, string? GetSample, bool Lose)> ExpectedWrites { get; } = new();
        internal (HttpStatusCode Status, string Json)? ReadOverride { get; set; }
        internal TaskCompletionSource<bool>? Hold { get; set; }
        internal bool ChangeScopeAfterRead { get; set; }
        internal bool ExpireOnMe { get; set; }
        internal int Calls { get; private set; }
        internal int StrictBodyChecks { get; private set; }
        internal int CancelledReads { get; private set; }
        private string getSample = "owner-baseline-get";
        internal void SetGet(string name) => getSample = name;
        internal void ExpectWrite(string name, string? afterGet = null, bool loseResponse = false) => ExpectedWrites.Enqueue((fixture.Sample(name), afterGet, loseResponse));
        internal async Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz" && request.RequestUri.IsDefaultPort &&
                request.Headers.TryGetValues("Origin", out var origins) && origins.SequenceEqual(new[] { "https://haoduoyu.xyz" }), "todo-note transport escaped its fixed HTTPS origin");
            var path = request.RequestUri!.PathAndQuery; string json; var status = HttpStatusCode.OK;
            if (path == "/api/v1/auth/login")
            {
                Check(request.Method == HttpMethod.Post, "native login changed its formal method");
                var login = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Wrap(Object(("csrfToken", "synthetic-todo-note-csrf"))), Encoding.UTF8, "application/json") };
                login.Headers.TryAddWithoutValidation("Set-Cookie", "matrix_session=" + new string('a', 64) + "; Path=/; Secure; HttpOnly; Max-Age=3600");
                return login;
            }
            if (path == "/api/v1/auth/me")
            {
                Check(request.Method == HttpMethod.Get, "native session verification changed its formal method");
                var me = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(Wrap(Object(("id", fixture.Owner),
                    ("username", "synthetic-todo-note-owner"), ("csrfToken", "synthetic-todo-note-csrf"))), Encoding.UTF8, "application/json") };
                if (ExpireOnMe) me.Headers.TryAddWithoutValidation("Set-Cookie", "matrix_session=; Path=/; Secure; HttpOnly; Expires=Sat, 01 Jan 2000 00:00:00 GMT");
                return me;
            }
            else if (path == "/api/v1/workbench-snapshot/index?version=2")
            {
                Check(request.Method == HttpMethod.Get, "todo-note scope probe became a mutation");
                json = Wrap(Object(("snapshot_format", "haoduoyu-workbench-snapshot-v2"), ("projection", "current"), ("complete", true), ("scope_id", Scope),
                    ("timezone", "Asia/Shanghai"), ("generated_at", "2026-11-07T20:00:00.000Z"), ("manifest_hash", new string('a', 64)),
                    ("global_content_hash", new string('b', 64)), ("index_hash", new string('a', 64)), ("entities", new JsonArray()), ("dates", new JsonArray())));
            }
            else if (request.Method == HttpMethod.Get)
            {
                Check(path == fixture.ListPath, "todo-note inspection guessed a record or another date route: " + path);
                BusinessReads.Add(path);
                if (Hold != null)
                    try { await Hold.Task.WaitAsync(cancellationToken); } catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { CancelledReads++; throw; }
                if (ReadOverride is { } replacement) (status, json) = replacement; else json = fixture.Sample(getSample).Json;
                if (ChangeScopeAfterRead) { Scope = new string('f', 64); ChangeScopeAfterRead = false; }
            }
            else
            {
                Check(ExpectedWrites.Count > 0, "unexpected mutation during native todo-note workflow: " + path);
                var expected = ExpectedWrites.Dequeue(); var body = await request.Content!.ReadAsStringAsync(cancellationToken); var parsed = JsonNode.Parse(body)!.AsObject();
                Check(request.Method.Method == expected.Sample.Method && path == expected.Sample.Path && parsed.Count == 2 && parsed.ContainsKey("note") && parsed.ContainsKey("version") &&
                    JsonNode.DeepEquals(parsed, JsonNode.Parse(expected.Sample.Body!)) && !request.Headers.Contains("X-Public-Business") &&
                    request.Headers.TryGetValues("Cookie", out var cookies) && cookies.Single().Contains("matrix_session=", StringComparison.Ordinal) &&
                    request.Headers.TryGetValues("X-CSRF-Token", out var csrf) && csrf.SequenceEqual(new[] { "synthetic-todo-note-csrf" }),
                    "native todo-note write changed exact raw note/version body or omitted private session and CSRF protections");
                var id = request.Headers.TryGetValues("Idempotency-Key", out var keys) ? keys.Single() : "";
                Check(Guid.TryParseExact(id, "D", out _), "todo-note write lost its durable local operation UUID");
                StrictBodyChecks++; Writes.Add((path, body, id)); if (expected.GetSample != null) SetGet(expected.GetSample);
                if (expected.Lose) throw new HttpRequestException("Synthetic exact-source todo note committed but acknowledgement lost; no socket was opened.");
                json = expected.Sample.Json; status = (HttpStatusCode)expected.Sample.Status;
            }
            return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request, cancellationToken);
    }
}
