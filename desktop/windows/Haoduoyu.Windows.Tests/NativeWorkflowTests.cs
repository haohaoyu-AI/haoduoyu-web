using System.Diagnostics;
using System.Diagnostics.Tracing;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    internal static IReadOnlyList<(string Name, Action Run)> Cases =>
    [
        ("Shown native window edits Chinese offline, projects queued content, and restores it after close", () => RunWithDispatcher(OfflineChineseLifecycleAsync)),
        ("Shown native window preserves its cached list after fake service disconnect and restart", () => RunWithDispatcher(ConnectedCacheFallbackAsync)),
        ("Shown native window rejects malformed successful collections without erasing cache, draft or queued intent", () => RunWithDispatcher(MalformedReadPreservesStateAsync)),
        ("Shown native window resumes known private profiles offline without crossing public or other-user drafts", () => RunWithDispatcher(OfflineProfilesAsync)),
        ("Shown native memo list projects queued parent/child operations, replacements and cancellation", () => RunWithDispatcher(QueuedDependencyWorkflowAsync)),
        ("Shown offline todo edits replace an unsent completion dependency after its create was confirmed", () => RunWithDispatcher(DerivedTodoCompletionReplacementAsync)),
        ("Shown native review sub-entry restores unfinished Chinese input and fences server queue until confirmation", () => RunWithDispatcher(ReviewPendingSubentryAsync)),
        ("Shown native offline label creation is selectable in a new note and cancellation keeps dependent work unsent", () => RunWithDispatcher(OfflineLabelNoteDependencyAsync)),
        ("Shown native list virtualizes 5000 data rows and can select and render the last row", () => RunWithDispatcher(VirtualizedNativeListAsync)),
        .. BaselineCases,
        .. RecoveryCases,
        .. SearchCases
    ];

    private static readonly BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    private static readonly string Day = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);

    private static async Task OfflineChineseLifecycleAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe();
            using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var id = Guid.NewGuid().ToString();
            var key = "/api/v1/note-entries/" + id;
            const string text = "合成离线记录：关机前继续写作。\n中文、emoji 🐟 与具体数字 2026 都必须原样保留。";
            var record = Object(("id", id), ("version", 0), ("category", "life"), ("date", Day), ("text", ""));
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "生活记录");
                await InvokeAsync(window, "EditAsync", "note", record, key);
                BodyEditor(window).Text = text;
                await UntilAsync(() => DraftText(Engine(window).Snapshot, key) == text, "350 ms native draft timer did not persist exact Chinese input");
                await ClickAsync(window, "保存到待同步队列");
                var queued = Engine(window).Snapshot.Outbox.Single();
                Check(queued.Status == PendingStatus.Queued && queued.ResourceKey == key, "offline native save did not retain one durable queued intent");
                Check(JsonNode.Parse(queued.BodyJson)?["text"]?.GetValue<string>() == text, "queued native request changed the user's Unicode text");
                Check(JsonNode.Parse(queued.BodyJson)?["save_id"]?.GetValue<string>() == queued.Id, "native queue changed its persisted save identity");
                await ClickAsync(window, "生活记录");
                Check(VisibleText(window).Contains(text[..30], StringComparison.Ordinal), "queued offline note is absent from the native list projection");
                SaveEvidence(window, "offline-note-queued.png");
                await CloseAsync(window);
                Check(handler.Calls == 0 && sockets.Connects == 0, "offline editing contacted a service or opened a socket");

                window = await ShowAsync(root, handler);
                Check(Engine(window).Snapshot.Outbox.Single().Id == queued.Id, "close/reopen changed the queued operation ID");
                Check(DraftText(Engine(window).Snapshot, key) == text, "close/reopen lost the local Chinese draft");
                await ClickAsync(window, "生活记录");
                Check(VisibleText(window).Contains(text[..30], StringComparison.Ordinal), "restart did not restore the projected native list");
                await InvokeAsync(window, "EditAsync", "note", record, key);
                Check(BodyEditor(window).Text == text, "reopening the native editor failed to restore exact text");
                var latest = text + "\n再次打开后的新一行。";
                BodyEditor(window).Text = latest;
                // Closing immediately exercises flush-before-close, rather than waiting for the autosave timer.
                await CloseAsync(window);
                using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), "public:unbound", new WindowsProtector());
                var state = await store.LoadAsync();
                Check(DraftText(state, key) == latest && state.Outbox.Single().Id == queued.Id,
                    "immediate native close lost later edits or altered the original unsent request");
                Check(handler.Calls == 0 && sockets.Connects == 0, "restoring an offline native window issued a network request");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ConnectedCacheFallbackAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe();
            using var handler = new SyntheticOrigin();
            var todo = Object(("id", Guid.NewGuid().ToString()), ("date", Day), ("text", "合成线上读取后保留的中文待办"), ("completed", false), ("version", 4),
                ("created_at", "2026-10-30T00:00:00.000Z"), ("updated_at", "2026-10-30T01:00:00.000Z"), ("deleted_at", null));
            handler.Responses["/api/v1/todos?date=" + Day] = Wrap(Object(("date", Day), ("today", Day), ("completed_mode", "strike"), ("preferences_version", 0), ("items", new JsonArray(todo))));
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected"), "synthetic connect did not bind the expected public workspace");
                Check(VisibleText(window).Contains("合成线上读取后保留的中文待办", StringComparison.Ordinal), "native view did not render the fake service's list");
                var cached = Engine(window).Snapshot.Cache["/api/v1/todos?date=" + Day];
                handler.Offline = true;
                await ClickAsync(window, "待办");
                Check(!Field<bool>(window, "connected"), "native read did not enter offline mode after a fake disconnect");
                Check(Engine(window).Snapshot.Cache["/api/v1/todos?date=" + Day] == cached, "failed read replaced a complete cache with an empty/error response");
                Check(VisibleText(window).Contains("合成线上读取后保留的中文待办", StringComparison.Ordinal), "fake disconnect hid the native cached list");
                SaveEvidence(window, "cached-todos-after-disconnect.png");
                await CloseAsync(window);
                var previousCalls = handler.Calls;
                window = await ShowAsync(root, handler);
                Check(Field<string>(window, "currentIdentity") == "public:" + handler.Scope,
                    "offline restart opened a different identity than the remembered synthetic public workspace");
                Check(Field<string>(window, "currentPage") == "待办" && Field<DatePicker>(window, "date").SelectedDate?.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) == Day,
                    "offline restart selected a different native route or date than the cached synthetic todo path");
                Check(Engine(window).Snapshot.Cache.TryGetValue("/api/v1/todos?date=" + Day, out var restoredCache) && restoredCache == cached,
                    "offline restart did not restore the exact cached response in its expected identity and path");
                Check(VisibleText(window).Contains("合成线上读取后保留的中文待办", StringComparison.Ordinal), "offline restart failed to open the remembered public cache");
                Check(handler.Calls == previousCalls, "restart silently retried network requests");
                Check(handler.WriteCalls == 0 && sockets.Connects == 0, "synthetic read workflow performed a write or opened a real socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task OfflineProfilesAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe();
            using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var publicScope = new string('a', 64); var oneScope = new string('b', 64); var twoScope = new string('c', 64);
            const string oneUser = "10000000-0000-4000-8000-000000000001", twoUser = "10000000-0000-4000-8000-000000000002";
            var one = "user:" + oneUser + ":" + oneScope; var two = "user:" + twoUser + ":" + twoScope; var publicIdentity = "public:" + publicScope;
            var noteId = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + noteId;
            var original = Object(("id", noteId), ("version", 2), ("category", "life"), ("date", Day), ("text", ""));
            await SeedDraftAsync(root, one, key, "甲账号的合成中文草稿", original);
            await SeedDraftAsync(root, two, key, "乙账号的合成中文草稿", original);
            await SeedDraftAsync(root, publicIdentity, key, "公开分区的合成中文草稿", original);
            RememberProfiles(root, publicScope, oneUser, oneScope, twoUser, twoScope, one);
            var window = await ShowAsync(root, handler);
            try
            {
                Check(Field<string?>(window, "currentIdentity") == one && !Field<bool>(window, "connected"), "known private profile was not resumed offline");
                Check(DraftText(Engine(window).Snapshot, key) == "甲账号的合成中文草稿", "startup loaded another profile's private draft");
                await InvokeAsync(window, "EditAsync", "note", original, key);
                BodyEditor(window).Text = "甲账号切换前即时输入，必须先落盘。";
                await InvokeAsync(window, "OpenOfflineProfileAsync", two);
                Check(DraftText(Engine(window).Snapshot, key) == "乙账号的合成中文草稿", "switching identities copied draft A into user B");
                await InvokeAsync(window, "OpenOfflineProfileAsync", publicIdentity);
                Check(DraftText(Engine(window).Snapshot, key) == "公开分区的合成中文草稿", "private draft crossed into the public profile");
                await InvokeAsync(window, "OpenOfflineProfileAsync", one);
                Check(DraftText(Engine(window).Snapshot, key) == "甲账号切换前即时输入，必须先落盘。", "switching profiles lost the latest un-timed edit");
                Check(!Field<bool>(window, "connected") && handler.Calls == 0 && sockets.Connects == 0,
                    "offline profile selection authenticated, sent queued work, or opened a socket");
                SaveEvidence(window, "private-profile-offline-resume.png");
                await CloseAsync(window);
                window = await ShowAsync(root, handler);
                Check(Field<string?>(window, "currentIdentity") == one && DraftText(Engine(window).Snapshot, key).Contains("即时输入", StringComparison.Ordinal),
                    "restart did not resume the selected private profile without network access");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task MalformedReadPreservesStateAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe();
            using var handler = new SyntheticOrigin();
            var id = Guid.NewGuid().ToString(); var path = "/api/v1/todos?date=" + Day;
            var item = Object(("id", id), ("date", Day), ("text", "完整服务读取的合成待办"), ("completed", false), ("version", 3),
                ("created_at", "2026-10-30T00:00:00.000Z"), ("updated_at", "2026-10-30T01:00:00.000Z"), ("deleted_at", null));
            handler.Responses[path] = Wrap(Object(("date", Day), ("today", Day), ("completed_mode", "strike"), ("preferences_version", 0), ("items", new JsonArray(item))));
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "连接并刷新");
                var engine = Engine(window);
                var draftJson = Object(("kind", "history"), ("key", "synthetic-malformed-read-draft"), ("original", new JsonObject()),
                    ("values", Object(("text", "必须保留的合成草稿")))).ToJsonString();
                await engine.SaveDraftAsync(new LocalDraft { Key = "synthetic-malformed-read-draft", Text = draftJson });
                var operation = new PendingOperation { ResourceKey = "/api/v1/todos/" + id, Method = "PATCH", Path = "/api/v1/todos/" + id,
                    BodyJson = Object(("completed", true), ("version", 3)).ToJsonString() };
                await engine.QueueAsync(operation);
                var before = engine.Snapshot;
                handler.Responses[path] = "{\"data\":{}}";
                await ClickAsync(window, "待办");
                var after = engine.Snapshot;
                Check(!Field<bool>(window, "connected") && after.Cache[path] == before.Cache[path], "malformed successful read replaced the cached complete collection");
                Check(after.Drafts["synthetic-malformed-read-draft"].Text == draftJson &&
                    after.Outbox.Single().Id == operation.Id && after.Outbox.Single().Status == PendingStatus.Queued,
                    "malformed successful read altered local work or its persisted intent");
                Check(VisibleText(window).Contains("完整服务读取的合成待办", StringComparison.Ordinal), "malformed read was treated as an authoritative empty/deleted list");
                await InvokeEngineAsync(engine, "CancelQueuedAsync", operation.Id, CancellationToken.None);
                handler.Responses[path] = Wrap(Object(("date", Day), ("today", Day), ("completed_mode", "strike"), ("preferences_version", 0), ("items", new JsonArray())));
                await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected") && !VisibleText(window).Contains("完整服务读取的合成待办", StringComparison.Ordinal),
                    "a well-formed empty list was incorrectly rejected or failed to replace old cached rows");
                Check(handler.WriteCalls == 0 && sockets.Connects == 0, "malformed-read safety check sent local work or opened a real socket");
                SaveEvidence(window, "well-formed-empty-after-rejected-read.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task QueuedDependencyWorkflowAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe();
            using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                var groupId = Guid.NewGuid().ToString(); var noteId = Guid.NewGuid().ToString();
                var parentId = Guid.NewGuid().ToString(); var childId = Guid.NewGuid().ToString();
                var parent = new PendingOperation { Id = parentId, ResourceKey = "/api/v1/memos/groups/" + groupId, Path = "/api/v1/memos/groups/" + groupId,
                    BodyJson = Object(("title", "离线新建合成分组"), ("position", 0), ("version", 0), ("save_id", parentId)).ToJsonString() };
                var child = WithDependencies(new PendingOperation { Id = childId, ResourceKey = "/api/v1/memos/notes/" + noteId, Path = "/api/v1/memos/notes/" + noteId,
                    BodyJson = Object(("group_id", groupId), ("title", "依赖分组的合成笔记"), ("body", "尚未联网，正文仍应可见。"), ("position", 0), ("version", 0), ("save_id", childId)).ToJsonString() }, parent.Id);
                await Engine(window).QueueAsync(parent); await Engine(window).QueueAsync(child);
                await ClickAsync(window, "备忘录");
                Check(VisibleText(window).Contains("离线新建合成分组", StringComparison.Ordinal), "native memo view did not project a queued group without a server cache");
                var replacementId = Guid.NewGuid().ToString();
                var replacement = parent with { Id = replacementId, BodyJson = Object(("title", "离线修改后的合成分组"), ("position", 0), ("version", 0), ("save_id", replacementId)).ToJsonString() };
                await InvokeEngineAsync(Engine(window), "ReplaceQueuedAsync", parent.Id, replacement, CancellationToken.None);
                await ClickAsync(window, "备忘录");
                Check(VisibleText(window).Contains("离线修改后的合成分组", StringComparison.Ordinal) && !VisibleText(window).Contains("离线新建合成分组", StringComparison.Ordinal),
                    "replacing a queued intent left the obsolete title in the native projection");
                Check(Engine(window).Snapshot.Outbox.Single(o => o.Id == child.Id).BodyJson == child.BodyJson,
                    "replacing the parent silently rewrote its child's immutable request");
                await SelectListItemAsync(window, "离线修改后的合成分组");
                Check(VisibleText(window).Contains("依赖分组的合成笔记", StringComparison.Ordinal),
                    "the queued child was not visible inside its projected offline parent");
                await InvokeEngineAsync(Engine(window), "CancelQueuedAsync", child.Id, CancellationToken.None);
                await InvokeEngineAsync(Engine(window), "CancelQueuedAsync", replacement.Id, CancellationToken.None);
                await ClickAsync(window, "备忘录");
                Check(!VisibleText(window).Contains("离线修改后的合成分组", StringComparison.Ordinal), "cancelled queued content remained as an active native list item");
                await ClickAsync(window, "同步中心");
                Check(Engine(window).Snapshot.Outbox.All(o => o.Status == PendingStatus.Superseded), "native cancellation discarded history or left an eligible write");
                SaveEvidence(window, "cancelled-offline-dependency-history.png");
                Check(handler.Calls == 0 && sockets.Connects == 0, "editing or cancelling queued dependencies sent a request");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static PendingOperation WithDependencies(PendingOperation operation, string dependency)
    {
        var json = JsonSerializer.SerializeToNode(operation)!.AsObject(); json["DependencyIds"] = new JsonArray(dependency);
        var restored = json.Deserialize<PendingOperation>()!;
        Check(typeof(PendingOperation).GetProperty("DependencyIds") != null, "dependency metadata is missing from the durable operation contract");
        return restored;
    }
    private static async Task OfflineLabelNoteDependencyAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                const string name = "离线新建合成标签";
                await ClickAsync(window, "标签"); await ClickAsync(window, "＋ 新标签");
                Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single().Text = name;
                await ClickAsync(window, "存入本机待同步队列");
                var parent = Engine(window).Snapshot.Outbox.Single();
                Check(parent.Path == "/api/v1/note-entries/labels" && parent.Method == "POST" && JsonNode.Parse(parent.BodyJson)?["name"]?.GetValue<string>() == name,
                    "native label form did not persist the expected local create intent");
                await ClickAsync(window, "生活记录"); await ClickAsync(window, "＋ 新记录");
                var checkbox = Descendants(Field<StackPanel>(window, "page")).OfType<CheckBox>().SingleOrDefault(choice => choice.Content?.ToString() == name);
                Check(checkbox != null, "a newly queued offline label was absent from the native note editor's choices");
                checkbox!.IsChecked = true; BodyEditor(window).Text = "使用刚离线创建标签的中文合成记录。";
                await ClickAsync(window, "保存到待同步队列");
                var child = Engine(window).Snapshot.Outbox.Single(operation => operation.Path.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal) && operation.Path != parent.Path);
                Check(child.DependencyIds.Contains(parent.Id, StringComparer.Ordinal) && JsonNode.Parse(child.BodyJson)?["labels"] is JsonArray labels && labels.Any(label => label?.GetValue<string>() == name),
                    "saving a note omitted its selected queued label or failed to retain the label-create dependency");
                await Engine(window).CancelQueuedAsync(parent.Id);
                var report = await Engine(window).SyncAsync();
                Check(report.Confirmed == 0 && Engine(window).Snapshot.Outbox.Single(operation => operation.Id == child.Id).Status == PendingStatus.Queued && handler.Calls == 0,
                    "cancelling an unsent label allowed its dependent note to reach the transport");
                Check(Engine(window).Snapshot.Outbox.Single(operation => operation.Id == child.Id).BodyJson == child.BodyJson,
                    "cancelling a label silently rewrote or removed the dependent note's original content");

                // Existing todo versions also need the post-template receipt before a dependent completion can choose its true CAS version.
                var todoId = Guid.NewGuid().ToString(); var templateId = Guid.NewGuid().ToString();
                var todo = Object(("id", todoId), ("date", Day), ("text", "已有版本的合成待办"), ("version", 3), ("completed", false), ("deleted_at", null));
                await Engine(window).CacheAsync("/api/v1/todos?date=" + Day, Wrap(Object(("date", Day), ("today", Day), ("completed_mode", "strike"), ("preferences_version", 0), ("items", new JsonArray(todo.DeepClone())))));
                var link = new PendingOperation { Method = "POST", Path = "/api/v1/todos/" + todoId + "/template", ResourceKey = "/api/v1/todos/" + todoId,
                    BodyJson = Object(("date", Day), ("version", 3), ("template_id", templateId), ("template_version", 0)).ToJsonString() };
                await Engine(window).QueueAsync(link); todo["_operation_id"] = link.Id;
                await InvokeAsync(window, "SetTodoCompletionAsync", todo, true);
                var completion = Engine(window).Snapshot.Outbox.Single(operation => operation.Method == "PATCH" && operation.Path == "/api/v1/todos/" + todoId);
                Check(completion.DependencyIds.Contains(link.Id, StringComparer.Ordinal) && completion.VersionFromDependencyId == link.Id &&
                    !JsonNode.Parse(completion.BodyJson)!.AsObject().ContainsKey("version"), "completion after an unsent template link reused a stale positive todo version");
                Check(handler.Calls == 0 && sockets.Connects == 0, "offline label/note and template/completion workflow performed a real request");
                SaveEvidence(window, "offline-label-note-dependency.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }
    private static async Task DerivedTodoCompletionReplacementAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var id = Guid.NewGuid().ToString(); var parentId = Guid.NewGuid().ToString(); var childId = Guid.NewGuid().ToString();
            var row = Object(("id", id), ("date", Day), ("text", "已确认创建、尚未同步完成状态的合成待办"), ("completed", false), ("version", 1),
                ("created_at", "2026-10-30T00:00:00.000Z"), ("updated_at", "2026-10-30T00:00:00.000Z"), ("deleted_at", null));
            var parent = new PendingOperation { Id = parentId, Method = "POST", Path = "/api/v1/todos", ResourceKey = "/api/v1/todos/" + id,
                BodyJson = Object(("id", id), ("date", Day), ("text", row["text"]?.DeepClone())).ToJsonString(), Status = PendingStatus.Confirmed,
                RemoteJson = Wrap(row.DeepClone()), ConfirmedRevision = 1, SendAttempts = 1 };
            var child = new PendingOperation { Id = childId, Method = "PATCH", Path = "/api/v1/todos/" + id, ResourceKey = "/local/todo-after-create/" + id,
                BodyJson = "{\"completed\":true}", DependencyIds = [parentId], VersionFromDependencyId = parentId };
            using (var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), "public:unbound", new WindowsProtector()))
                await store.SaveAsync(new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1, Outbox = [parent, child] });
            var window = await ShowAsync(root, handler);
            try
            {
                var projection = WorkspaceProjection.Project("/api/v1/todos?date=" + Day, null, Engine(window).Snapshot);
                var projectedItems = JsonNode.Parse(projection ?? throw new InvalidOperationException("Confirmed create and queued completion were absent from the offline projection."))?["data"]?["items"] as JsonArray
                    ?? throw new InvalidOperationException("The projected native todo list could not be read.");
                var projected = projectedItems.OfType<JsonObject>().Single(todo => todo["id"]?.GetValue<string>() == id);
                Check(projected["completed"]?.GetValue<bool>() == true, "initial offline completion intent was not visible before editing");
                await InvokeAsync(window, "SetTodoCompletionAsync", projected, false);
                var outbox = Engine(window).Snapshot.Outbox;
                var pending = outbox.Where(operation => operation.Status == PendingStatus.Queued).ToArray();
                Check(pending.Length == 1 && pending[0].Path == child.Path && pending[0].ResourceKey == child.ResourceKey &&
                    JsonNode.Parse(pending[0].BodyJson)?["completed"]?.GetValue<bool>() == false,
                    "editing the projected todo left two conflicting pending PATCH operations for one server record");
                Check(pending[0].DependencyIds.SequenceEqual(child.DependencyIds) && pending[0].VersionFromDependencyId == parentId &&
                    outbox.Single(operation => operation.Id == childId).Status == PendingStatus.Superseded,
                    "changing an unsent completion silently discarded its version dependency or original history");
                Check(outbox.Single(operation => operation.Id == parentId).RemoteJson == parent.RemoteJson,
                    "editing a completion changed the earlier confirmed create receipt");
                Check(handler.Calls == 0 && sockets.Connects == 0, "offline completion edit sent a request instead of updating its durable local intent");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }
    private static async Task ReviewPendingSubentryAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe();
            using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var id = Guid.NewGuid().ToString(); var key = "/api/v1/review/notes/" + id;
            var record = ReviewFormLogic.New("notes", id, "合成复盘账号", Day);
            record["kind"] = "insight"; record["title"] = "合成复盘笔记";
            const string unfinished = "尚未确认的中文标签 🐟";
            var window = await ShowAsync(root, handler);
            try
            {
                await InvokeAsync(window, "EditReviewAsync", "notes", record, key);
                ExerciseOwnedDialog(window, "新增条目", dialog =>
                {
                    Descendants(dialog).OfType<TextBox>().Single().Text = unfinished;
                    dialog.Close(); // Closing the child editor must preserve its unconfirmed text.
                });
                await UntilAsync(() => DraftValues(Engine(window).Snapshot, key)?["__native_pending_tags"]?["text"]?.GetValue<string>() == unfinished,
                    "closing the native sub-entry editor discarded unfinished Chinese text");
                var values = DraftValues(Engine(window).Snapshot, key)!;
                var rejected = false;
                try { _ = ReviewFormLogic.Build("notes", record, values); }
                catch (InvalidOperationException) { rejected = true; }
                Check(rejected && Engine(window).Snapshot.Outbox.Count == 0, "unfinished native sub-entry entered the server queue");
                await CloseAsync(window);

                window = await ShowAsync(root, handler);
                await InvokeAsync(window, "EditReviewAsync", "notes", record, key);
                Check(DraftValues(Engine(window).Snapshot, key)?["__native_pending_tags"]?["text"]?.GetValue<string>() == unfinished,
                    "restarting the main window lost its unfinished nested draft");
                ExerciseOwnedDialog(window, "恢复未确认编辑", dialog =>
                {
                    var input = Descendants(dialog).OfType<TextBox>().Single();
                    Check(input.Text == unfinished, "native restore dialog did not restore the original unconfirmed input");
                    input.Text = "确认后的中文标签";
                    Descendants(dialog).OfType<Button>().Single(button => button.Content?.ToString() == "确定")
                        .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                });
                await UntilAsync(() => DraftValues(Engine(window).Snapshot, key)?["__native_pending_tags"] == null &&
                    DraftValues(Engine(window).Snapshot, key)?["tags"] is JsonArray tags && tags.Any(tag => tag?.GetValue<string>() == "确认后的中文标签"),
                    "confirming the restored sub-entry failed to commit the native parent draft");
                SaveEvidence(window, "restored-review-subentry.png");
                await ClickAsync(window, "存入本机待同步队列");
                var queued = Engine(window).Snapshot.Outbox.Single();
                Check(queued.Status == PendingStatus.Queued && queued.Path == key && JsonNode.Parse(queued.BodyJson)?["tags"] is JsonArray savedTags &&
                    savedTags.Single()?.GetValue<string>() == "确认后的中文标签", "confirmed native sub-entry did not enter the exact stable-identity request");
                Check(handler.Calls == 0 && sockets.Connects == 0, "nested native editing contacted a production service or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }
    private static JsonObject? DraftValues(WorkspaceState state, string key) => state.Drafts.TryGetValue(key, out var draft) ? JsonNode.Parse(draft.Text)?["values"] as JsonObject : null;
    private static void ExerciseOwnedDialog(MainWindow owner, string buttonLabel, Action<Window> edit)
    {
        var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = owner.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            Window? dialog = null;
            try
            {
                dialog = Application.Current.Windows.OfType<Window>().Single(window => window != owner && window.IsVisible && window.Owner == owner);
                edit(dialog); finished.SetResult();
            }
            catch (Exception error) { finished.SetException(error); }
            finally { if (dialog?.IsVisible == true) dialog.Close(); }
        });
        Descendants(Field<StackPanel>(owner, "page")).OfType<Button>().Single(button => button.Content?.ToString() == buttonLabel)
            .RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        if (!finished.Task.IsCompleted) throw new InvalidOperationException("Native modal editor did not run its isolated dispatcher callback.");
        finished.Task.GetAwaiter().GetResult();
    }
    private static async Task SeedDraftAsync(string root, string identity, string key, string text, JsonObject original)
    {
        using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector());
        var values = (JsonObject)original.DeepClone(); values["text"] = text;
        var draft = new LocalDraft { Key = key, Text = Object(("kind", "note"), ("key", key), ("original", original.DeepClone()), ("values", values)).ToJsonString(), Title = text, BaseVersion = 2 };
        await store.SaveAsync(new WorkspaceState { ScopeId = store.ScopeId, Drafts = { [key] = draft } });
    }
    private static void RememberProfiles(string root, string publicScope, string firstUser, string firstScope, string secondUser, string secondScope, string selected)
    {
        var assembly = typeof(MainWindow).Assembly;
        var settingsType = assembly.GetType("Haoduoyu.Windows.LocalSettings", throwOnError: true)!;
        var helper = assembly.GetType("Haoduoyu.Windows.OfflineProfiles", throwOnError: true)!;
        object settings = JsonSerializer.Deserialize("{}", settingsType)!;
        object Apply(string name, params object?[] arguments) => helper.GetMethod(name, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(null, arguments)!;
        settings = Apply("RememberPublic", settings, publicScope);
        settings = Apply("RememberUser", settings, firstUser, "合成账号甲", firstScope);
        settings = Apply("RememberUser", settings, secondUser, "合成账号乙", secondScope);
        settings = Apply("Select", settings, selected);
        assembly.GetType("Haoduoyu.Windows.SettingsFile", throwOnError: true)!.GetMethod("Write", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(null, [root, settings, new WindowsProtector()]);
    }
    private static async Task<MainWindow> ShowAsync(string root, SyntheticOrigin handler)
    {
        Check(Application.Current is SyntheticTestApplication, "shown-window tests require the guarded application startup host");
        var api = new WorkbenchApi(new NonOwningHandler(handler));
        var window = new MainWindow(root, api) { Title = "好多鱼 · 纯合成原生验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window;
        window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "synthetic native window did not initialize its injected workspace");
        await window.WaitForIdleAsync();
        window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero, "workflow did not show an actual native window");
        Check(((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1, "production app startup was not intercepted by the synthetic host");
        Check(Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "shown window escaped the injected synthetic data root");
        return window;
    }
    private static async Task ClickAsync(MainWindow window, string label)
    {
        var button = Descendants(window).OfType<Button>().Single(b => b.Content?.ToString() == label);
        Check(button.IsEnabled, "native action is unexpectedly disabled: " + label);
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
        await window.WaitForIdleAsync();
        await Dispatcher.Yield(DispatcherPriority.ApplicationIdle);
    }
    private static TextBox BodyEditor(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single(box => box.AcceptsReturn && !box.IsReadOnly);
    private static async Task SelectListItemAsync(MainWindow window, string text)
    {
        var page = Field<StackPanel>(window, "page");
        var candidates = Descendants(page).OfType<ListBox>().SelectMany(list => list.Items.Cast<object>()
            .Where(item => item is WorkspaceListItem row ? row.Title.Contains(text, StringComparison.Ordinal) :
                item is ListBoxItem container && Descendants(container).OfType<TextBlock>().Any(block => block.Text.Contains(text, StringComparison.Ordinal)))
            .Select(item => (List: list, Item: item))).ToArray();
        Check(candidates.Length == 1, "native list item cannot be selected unambiguously: " + text);
        candidates[0].List.ScrollIntoView(candidates[0].Item);
        window.UpdateLayout();
        candidates[0].List.SelectedItem = candidates[0].Item;
        await window.WaitForIdleAsync();
        window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static SyncEngine Engine(MainWindow window) => Field<SyncEngine>(window, "engine");
    private static T Field<T>(object instance, string name)
    {
        var field = instance.GetType().GetField(name, Private) ?? throw new MissingFieldException(instance.GetType().Name, name);
        var value = field.GetValue(instance);
        return value is null ? default! : (T)value;
    }
    private static async Task InvokeAsync(MainWindow window, string name, params object?[] arguments)
    {
        var method = typeof(MainWindow).GetMethod(name, Private) ?? throw new MissingMethodException("MainWindow." + name);
        try { await ((Task?)method.Invoke(window, arguments) ?? throw new InvalidOperationException("Native action did not return Task: " + name)); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
        await window.WaitForIdleAsync();
    }
    private static async Task InvokeEngineAsync(SyncEngine engine, string name, params object?[] arguments)
    {
        var method = typeof(SyncEngine).GetMethod(name) ?? throw new MissingMethodException("SyncEngine." + name);
        try { await ((Task?)method.Invoke(engine, arguments) ?? throw new InvalidOperationException("Engine action did not return Task: " + name)); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
    }
    private static string DraftText(WorkspaceState state, string key) => state.Drafts.TryGetValue(key, out var draft) ? JsonNode.Parse(draft.Text)?["values"]?["text"]?.GetValue<string>() ?? "" : "";
    private static string VisibleText(MainWindow window) => string.Join("\n", Descendants(window).OfType<TextBlock>().Select(block => block.Text));
    private static IEnumerable<DependencyObject> Descendants(DependencyObject root)
    {
        var stack = new Stack<DependencyObject>(); var visited = new HashSet<DependencyObject>(ReferenceEqualityComparer.Instance); stack.Push(root);
        while (stack.TryPop(out var current))
        {
            if (!visited.Add(current)) continue;
            yield return current;
            foreach (var child in LogicalTreeHelper.GetChildren(current).OfType<DependencyObject>()) stack.Push(child);
            if (current is Visual or System.Windows.Media.Media3D.Visual3D)
                for (var index = 0; index < VisualTreeHelper.GetChildrenCount(current); index++) stack.Push(VisualTreeHelper.GetChild(current, index));
        }
    }

    private static async Task VirtualizedNativeListAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                typeof(MainWindow).GetMethod("ClearPage", Private)!.Invoke(window, null);
                const int count = 5000; var opened = -1;
                var rows = Enumerable.Range(0, count).Select(index => ("合成虚拟清单 " + (index + 1), "只生成可见的原生行容器", (Func<Task>)(() => { opened = index; return Task.CompletedTask; })));
                var list = (ListBox)(typeof(MainWindow).GetMethod("List", Private)!.Invoke(window, [rows])
                    ?? throw new InvalidOperationException("Native list construction returned no ListBox."));
                window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
                Check(list.Items.Count == count && list.Items.Cast<object>().All(item => item is WorkspaceListItem && item is not UIElement),
                    "native list still preconstructed a UIElement for every data row");
                var generated = Enumerable.Range(0, count).Count(index => list.ItemContainerGenerator.ContainerFromIndex(index) is ListBoxItem);
                Check(generated > 0 && generated < count / 10, $"native virtualization generated {generated} row containers for {count} data rows before scrolling");
                var last = list.Items[count - 1]; list.ScrollIntoView(last);
                window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
                await UntilAsync(() => list.ItemContainerGenerator.ContainerFromIndex(count - 1) is ListBoxItem &&
                    VisibleText(window).Contains("合成虚拟清单 5000", StringComparison.Ordinal), "the last virtualized data row did not produce actual rendered native text");
                list.SelectedItem = last; await window.WaitForIdleAsync();
                Check(opened == count - 1, "selecting the last virtualized row did not execute that row's own native action");
                var after = Enumerable.Range(0, count).Count(index => list.ItemContainerGenerator.ContainerFromIndex(index) is ListBoxItem);
                Check(after > 0 && after < count / 10, $"scrolling to the end expanded the native list to {after} containers");
                Check(handler.Calls == 0 && sockets.Connects == 0, "rendering or scrolling a local synthetic list contacted a service");
                SaveEvidence(window, "list-5000-virtualized-last-row.png");
                Console.WriteLine($"Native list evidence: {count} data rows, {generated} initially generated containers, {after} after scrolling; no timing/framerate or real-user performance claim.");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }
    private static async Task CloseAsync(MainWindow window)
    {
        var closed = false; window.Closed += (_, _) => closed = true; window.Close();
        await UntilAsync(() => closed, "native close did not flush and settle the synthetic workspace");
    }
    private static Task CloseIfOpenAsync(MainWindow window) => window.IsVisible ? CloseAsync(window) : Task.CompletedTask;
    private static async Task UntilAsync(Func<bool> condition, string failure)
    {
        var watch = Stopwatch.StartNew();
        while (!condition())
        {
            if (watch.Elapsed > TimeSpan.FromSeconds(20)) throw new TimeoutException(failure);
            await Task.Delay(15);
        }
    }
    private static void RunWithDispatcher(Func<Task> action)
    {
        var context = SynchronizationContext.Current;
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext(Dispatcher.CurrentDispatcher));
        try
        {
            var task = action(); var frame = new DispatcherFrame();
            var timeout = new DispatcherTimer { Interval = TimeSpan.FromSeconds(90) }; var expired = false;
            timeout.Tick += (_, _) => { expired = true; frame.Continue = false; };
            _ = task.ContinueWith(_ => Dispatcher.CurrentDispatcher.BeginInvoke(() => frame.Continue = false), CancellationToken.None, TaskContinuationOptions.None, TaskScheduler.FromCurrentSynchronizationContext());
            timeout.Start();
            if (!task.IsCompleted) Dispatcher.PushFrame(frame);
            timeout.Stop();
            if (expired) throw new TimeoutException("Shown native workflow exceeded its isolated 90-second budget.");
            task.GetAwaiter().GetResult();
        }
        finally { SynchronizationContext.SetSynchronizationContext(context); }
    }
    private static async Task WithDirectoryAsync(Func<string, Task> action)
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-shown-native-synthetic-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try { await action(root); }
        finally { Directory.Delete(root, recursive: true); }
    }
    private static JsonObject Object(params (string Name, JsonNode? Value)[] fields)
    {
        var value = new JsonObject(); foreach (var field in fields) value[field.Name] = field.Value; return value;
    }
    private static string Wrap(JsonNode? data) => Object(("data", data)).ToJsonString();
    private static void SaveEvidence(MainWindow window, string name)
    {
        var directory = Environment.GetEnvironmentVariable("HDY_WINDOWS_TEST_EVIDENCE");
        if (string.IsNullOrEmpty(directory)) return;
        if (!Path.IsPathFullyQualified(directory) || !Directory.Exists(directory)) throw new InvalidOperationException("Native evidence requires an existing explicit absolute output directory.");
        window.UpdateLayout();
        var bitmap = new RenderTargetBitmap((int)Math.Ceiling(window.ActualWidth), (int)Math.Ceiling(window.ActualHeight), 96, 96, PixelFormats.Pbgra32); bitmap.Render(window);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var stream = new FileStream(Path.Combine(directory, "synthetic-native-" + name), FileMode.CreateNew, FileAccess.Write); encoder.Save(stream);
    }
    private static void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }

    private sealed class SyntheticOrigin(bool denyEveryRequest = false) : HttpMessageHandler
    {
        private int calls, writeCalls;
        internal bool Offline { get; set; }
        internal string Scope { get; } = new('d', 64);
        internal int Calls => Volatile.Read(ref calls);
        internal int WriteCalls => Volatile.Read(ref writeCalls);
        internal Dictionary<string, string> Responses { get; } = new(StringComparer.Ordinal);
        internal Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request)
        {
            Interlocked.Increment(ref calls);
            if (request.Method != HttpMethod.Get) Interlocked.Increment(ref writeCalls);
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz", "test transport changed the fixed production-origin contract");
            if (denyEveryRequest) throw new InvalidOperationException("Offline native test unexpectedly requested HTTP.");
            if (Offline) throw new HttpRequestException("synthetic disconnect; no socket opened");
            var path = request.RequestUri!.PathAndQuery;
            var json = path == "/api/v1/workbench-snapshot/index?version=2" ? Wrap(Object(("complete", true), ("scope_id", Scope))) :
                Responses.GetValueOrDefault(path) ?? throw new InvalidOperationException("Unexpected synthetic native request: " + request.Method + " " + path);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request);
    }
    private sealed class NonOwningHandler(SyntheticOrigin origin) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request);
    }
    private sealed class SocketProbe : EventListener
    {
        private int connects;
        internal int Connects => Volatile.Read(ref connects);
        protected override void OnEventSourceCreated(EventSource source) { if (source.Name == "System.Net.Sockets") EnableEvents(source, EventLevel.Informational); }
        protected override void OnEventWritten(EventWrittenEventArgs args) { if (args.EventName == "ConnectStart") Interlocked.Increment(ref connects); }
    }
}
