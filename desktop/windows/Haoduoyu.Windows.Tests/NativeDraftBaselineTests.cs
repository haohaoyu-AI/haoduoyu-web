using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> BaselineCases =>
    [
        ("Shown native draft keeps later edits while an earlier save advances only its confirmed baseline", () => RunWithDispatcher(LaterDraftKeepsValuesAsync)),
        ("Shown native article creation confirmation keeps unfinished later input and converts future saves to server-ID PUT", () => RunWithDispatcher(ArticleCreateBaselineAsync)),
        ("Shown native draft refuses wrong-entity and older-version confirmed receipts", () => RunWithDispatcher(WrongEntityAndOldReceiptAsync)),
        ("Shown native review hash cycles cannot replay historical baselines after the newest confirmation", () => RunWithDispatcher(ReviewHashCycleAsync)),
        ("Shown native queued article reopens its original draft and replaces one unsent create intent", () => RunWithDispatcher(QueuedArticleUsesOriginalDraftAsync)),
        ("Shown native editor keeps saving later Chinese input after a failed connection attempt", () => RunWithDispatcher(FailedConnectionKeepsEditorSavingAsync))
    ];

    private static Task LaterDraftKeepsValuesAsync() => WithBaselineWindowAsync(async (window, engine, store, remote) =>
    {
        var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
        var original = Object(("id", id), ("category", "life"), ("date", Day), ("version", 2), ("text", "原始服务文字"));
        var queuedValues = (JsonObject)original.DeepClone(); queuedValues["text"] = "第一次排队的文字";
        await engine.SaveDraftAsync(AppDraft("note", key, original, queuedValues));
        var prepared = PrepareAppSave("note", original, queuedValues);
        var operation = PreparedOperation(key, prepared);
        await engine.QueueAsync(operation);
        var later = (JsonObject)queuedValues.DeepClone(); later["text"] = "排队后继续写的较新草稿，必须保留 🐟。";
        await engine.SaveDraftAsync(AppDraft("note", key, original, later));
        var receipt = (JsonObject)queuedValues.DeepClone(); receipt["version"] = 3;
        remote.Replies.Enqueue(new ApiResult(200, Wrap(receipt)));
        await engine.SyncAsync();
        var confirmed = engine.Snapshot.Outbox.Single();
        Check(confirmed.Status == PendingStatus.Confirmed && confirmed.ConfirmedRevision > 0, "baseline fixture did not receive a real engine confirmation revision");
        await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
        var saved = SavedAppDraft(engine, key);
        Check(saved["original"]?["version"]?.GetValue<int>() == 3 && JsonNode.DeepEquals(saved["values"], later),
            "confirming an earlier queued request overwrote later unsent native values or failed to advance the base");
        Check(engine.Snapshot.Drafts[key].BaseVersion == 3 && BaselineWatermark(engine.Snapshot.Drafts[key]) == confirmed.ConfirmedRevision,
            "native baseline did not record the exact confirmed local revision");
        var saves = store.Saves;
        await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
        Check(store.Saves == saves && JsonNode.DeepEquals(SavedAppDraft(engine, key)["values"], later), "an already applied confirmation was replayed into the current draft");
    });

    private static Task ArticleCreateBaselineAsync() => WithBaselineWindowAsync(async (window, engine, unusedStore, remote) =>
    {
        var localId = Guid.NewGuid().ToString(); var serverId = Guid.NewGuid().ToString(); var key = "/api/v1/articles/new:" + localId;
        var original = Object(("id", localId), ("version", 0), ("title", "排队前的文章"), ("account_id", "synthetic-account"),
            ("status", "drafting"), ("production_mode", "manual"), ("summary", "合成摘要"), ("notes", "原备注"));
        var prepared = PrepareAppSave("article", original, original);
        var operation = PreparedOperation(key, prepared);
        await engine.QueueAsync(operation);
        var later = (JsonObject)original.DeepClone(); later["title"] = "创建请求发出后继续写的新标题"; later["started_at"] = "尚未输入完整的时间";
        await engine.SaveDraftAsync(AppDraft("article", key, original, later));
        var invalid = false;
        try { _ = PrepareAppSave("article", original, later); }
        catch (Exception error) when (error is FormatException or ArgumentException or InvalidOperationException) { invalid = true; }
        Check(invalid, "fixture must represent an unfinished later value that cannot yet be prepared for the server");
        var receipt = (JsonObject)original.DeepClone(); receipt["id"] = serverId; receipt["version"] = 1;
        remote.Replies.Enqueue(new ApiResult(201, Wrap(receipt)));
        await engine.SyncAsync();
        var revision = engine.Snapshot.Outbox.Single().ConfirmedRevision;
        await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
        var saved = SavedAppDraft(engine, key);
        Check(saved["original"]?["id"]?.GetValue<string>() == serverId && saved["original"]?["version"]?.GetValue<int>() == 1 && JsonNode.DeepEquals(saved["values"], later),
            "article create confirmation lost later unfinished input or retained the client-only identity");
        Check(BaselineWatermark(engine.Snapshot.Drafts[key]) == revision, "article draft omitted its confirmed revision watermark");
        var repairedValues = (JsonObject)later.DeepClone(); repairedValues["started_at"] = null;
        var next = PrepareAppSave("article", saved["original"]!.AsObject(), repairedValues);
        Check(next.Method == "PUT" && next.Path == "/api/v1/articles/" + serverId && next.Body["version"]?.GetValue<int>() == 1,
            "continuing a confirmed article would issue another server-generated-ID POST");
        var latest = (JsonObject)later.DeepClone(); latest["notes"] = "旧编辑器稍后落盘的新备注，不得让已确认baseline倒退。";
        var staleEditor = AppDraft("article", key, original, latest);
        await InvokeAsync(window, "SaveLocalDraftAsync", staleEditor);
        var merged = SavedAppDraft(engine, key);
        Check(merged["original"]?["id"]?.GetValue<string>() == serverId && merged["original"]?["version"]?.GetValue<int>() == 1 &&
            JsonNode.DeepEquals(merged["values"], latest) && BaselineWatermark(engine.Snapshot.Drafts[key]) == revision,
            "a stale editor save replaced a confirmed article identity/baseline or discarded its new values");
    });

    private static Task WrongEntityAndOldReceiptAsync() => WithBaselineWindowAsync(async (window, engine, store, remote) =>
    {
        foreach (var wrongEntity in new[] { true, false })
        {
            var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
            var original = Object(("id", id), ("category", "work"), ("date", Day), ("version", 2), ("text", "服务原始文字"));
            var prepared = PrepareAppSave("note", original, original);
            await engine.QueueAsync(PreparedOperation(key, prepared));
            var draftOriginal = (JsonObject)original.DeepClone();
            if (!wrongEntity) draftOriginal["version"] = 8;
            var values = (JsonObject)draftOriginal.DeepClone(); values["text"] = "较新本机稿件保持原样";
            await engine.SaveDraftAsync(AppDraft("note", key, draftOriginal, values));
            var receipt = (JsonObject)original.DeepClone(); receipt["version"] = 3;
            if (wrongEntity) receipt["id"] = Guid.NewGuid().ToString();
            remote.Replies.Enqueue(new ApiResult(200, Wrap(receipt)));
            await engine.SyncAsync();
            var before = engine.Snapshot.Drafts[key]; var saves = store.Saves;
            await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
            Check(engine.Snapshot.Drafts[key].Text == before.Text && engine.Snapshot.Drafts[key].BaseVersion == before.BaseVersion && store.Saves == saves,
                wrongEntity ? "wrong-entity receipt was accepted as the draft's own baseline" : "an older confirmed request rolled the newer draft baseline back");
        }
    });

    private static Task ReviewHashCycleAsync() => WithBaselineWindowAsync(async (window, engine, store, remote) =>
    {
        var id = Guid.NewGuid().ToString(); var articleId = Guid.NewGuid().ToString(); var key = "/api/v1/review/snapshots/" + id;
        var hashA = new string('a', 64); var hashB = new string('b', 64);
        var original = Object(("id", id), ("content_hash", hashA), ("article_id", articleId), ("snapshot_date", Day), ("source", "manual"), ("reads", 10));
        var values = (JsonObject)original.DeepClone(); values["reads"] = "30";
        await engine.SaveDraftAsync(AppDraft("review:snapshots", key, original, values));
        await engine.QueueAsync(new PendingOperation { ResourceKey = key, Method = "PATCH", Path = key,
            BodyJson = Object(("expected_hash", hashA), ("reads", 20)).ToJsonString() });
        var firstReceipt = (JsonObject)original.DeepClone(); firstReceipt["content_hash"] = hashB; firstReceipt["reads"] = 20;
        remote.Replies.Enqueue(new ApiResult(200, Wrap(firstReceipt)));
        await engine.SyncAsync(); await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
        Check(SavedAppDraft(engine, key)["original"]?["content_hash"]?.GetValue<string>() == hashB && JsonNode.DeepEquals(SavedAppDraft(engine, key)["values"], values),
            "the first review confirmation did not preserve later native values while advancing its exact hash");
        await engine.QueueAsync(new PendingOperation { ResourceKey = key, Method = "PATCH", Path = key,
            BodyJson = Object(("expected_hash", hashB), ("reads", 10)).ToJsonString() });
        remote.Replies.Enqueue(new ApiResult(200, Wrap(original.DeepClone())));
        await engine.SyncAsync(); await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
        var latest = engine.Snapshot.Outbox.Last().ConfirmedRevision;
        Check(SavedAppDraft(engine, key)["original"]?["content_hash"]?.GetValue<string>() == hashA && BaselineWatermark(engine.Snapshot.Drafts[key]) == latest &&
            JsonNode.DeepEquals(SavedAppDraft(engine, key)["values"], values), "returning to a former review hash lost the newest confirmation watermark or later values");
        var saves = store.Saves;
        await InvokeAsync(window, "RebaseConfirmedDraftsAsync");
        Check(store.Saves == saves && SavedAppDraft(engine, key)["original"]?["content_hash"]?.GetValue<string>() == hashA,
            "historical hash-cycle receipts were replayed after the newest confirmed baseline, permitting a crash-time rollback");
    });

    private static async Task QueuedArticleUsesOriginalDraftAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                await Engine(window).CacheAsync("/api/v1/accounts", Wrap(new JsonArray(Object(("id", "synthetic-account"), ("name", "合成运营账号"), ("platform", "toutiao")))));
                await ClickAsync(window, "文章台账"); await ClickAsync(window, "＋ 新文章记录");
                SetLabelledValue(window, "文章标题", "合成待同步文章的原始标题");
                SetLabelledValue(window, "运营账号 ID", "synthetic-account");
                await ClickAsync(window, "保存到待同步队列");
                var first = Engine(window).Snapshot.Outbox.Single(); var key = first.ResourceKey;
                Check(first.Method == "POST" && first.Path == "/api/v1/articles" && key.Contains("/new:", StringComparison.Ordinal), "native article create did not retain a stable local draft identity");
                await SelectListItemAsync(window, "合成待同步文章的原始标题");
                Check(Engine(window).Snapshot.Drafts.Count == 1 && Engine(window).Snapshot.Drafts.ContainsKey(key), "opening the queued article created a second draft under a projected or server-only key");
                SetLabelledValue(window, "文章标题", "从待同步清单继续编辑后的标题");
                await ClickAsync(window, "保存到待同步队列");
                var state = Engine(window).Snapshot; var active = state.Outbox.Where(operation => operation.Status == PendingStatus.Queued).ToArray();
                Check(active.Length == 1 && active[0].ResourceKey == key && active[0].Method == "POST" && active[0].Path == "/api/v1/articles" &&
                    JsonNode.Parse(active[0].BodyJson)?["title"]?.GetValue<string>() == "从待同步清单继续编辑后的标题",
                    "editing the queued native article produced a duplicate create intent or lost the new title");
                Check(state.Outbox.Single(operation => operation.Id == first.Id).Status == PendingStatus.Superseded && state.Drafts.Count == 1,
                    "replacing a never-sent article lost original request history or forked the local draft");
                Check(handler.Calls == 0 && sockets.Connects == 0, "opening a local queued article tried to fetch an imaginary server record");
                SaveEvidence(window, "queued-article-original-draft.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task FailedConnectionKeepsEditorSavingAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin { Offline = true };
            var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
            var original = Object(("id", id), ("category", "life"), ("date", Day), ("version", 0), ("text", ""));
            var window = await ShowAsync(root, handler);
            try
            {
                await InvokeAsync(window, "EditAsync", "note", original, key);
                BodyEditor(window).Text = "尝试连接前已输入的合成中文。";
                await ClickAsync(window, "连接并刷新");
                Check(!Field<bool>(window, "connected"), "failed synthetic scope read unexpectedly enabled syncing");
                var editors = Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Where(box => box.AcceptsReturn && !box.IsReadOnly && box.IsEnabled).ToArray();
                if (editors.Length == 0)
                {
                    // A safe failure view may require explicitly reopening the saved draft instead of retaining its controls.
                    await ClickAsync(window, "本机草稿");
                    await InvokeAsync(window, "EditAsync", "note", original, key);
                }
                const string later = "连接失败后仍可继续输入的新稿 🐟，关闭时必须保存。";
                BodyEditor(window).Text = later;
                await CloseAsync(window);
                using var store = new AtomicWorkspaceStore(root, Haoduoyu.Api.WorkbenchApi.ServiceOrigin.ToString(), "public:unbound", new WindowsProtector());
                var recovered = await store.LoadAsync();
                Check(DraftText(recovered, key) == later, "failed connection left an editable native surface whose later input was silently lost on close");
                Check(handler.WriteCalls == 0 && sockets.Connects == 0, "failed-connection recovery sent a write or opened a real socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static void SetLabelledValue(MainWindow window, string label, string value)
    {
        var page = Field<StackPanel>(window, "page");
        var labels = page.Children.OfType<TextBlock>().Where(block => block.Text == label).ToArray();
        Check(labels.Length == 1, "native form field label is not unique: " + label);
        var index = page.Children.IndexOf(labels[0]); var control = page.Children[index + 1];
        if (control is TextBox box) box.Text = value;
        else if (control is ComboBox combo) combo.SelectedValue = value;
        else throw new InvalidOperationException("Native form field is not a text/reference control: " + label);
    }
    private static LocalDraft AppDraft(string kind, string key, JsonObject original, JsonObject values) => new()
    {
        Key = key, Text = Object(("kind", kind), ("key", key), ("original", original.DeepClone()), ("values", values.DeepClone())).ToJsonString(),
        Title = "仅合成验收稿件", BaseVersion = original["version"]?.GetValue<int>() ?? 0
    };
    private static PendingOperation PreparedOperation(string key, (string Method, string Path, JsonObject Body) prepared)
    {
        var id = Guid.NewGuid().ToString(); var body = (JsonObject)prepared.Body.DeepClone();
        if (body.ContainsKey("save_id")) body["save_id"] = id;
        return new PendingOperation { Id = id, ResourceKey = key, Method = prepared.Method, Path = prepared.Path, BodyJson = body.ToJsonString() };
    }
    private static JsonObject SavedAppDraft(SyncEngine engine, string key) => JsonNode.Parse(engine.Snapshot.Drafts[key].Text)!.AsObject();
    private static long BaselineWatermark(LocalDraft draft)
    {
        var property = typeof(LocalDraft).GetProperty("BaselineConfirmedRevision") ?? throw new MissingMemberException("LocalDraft.BaselineConfirmedRevision");
        return (long)(property.GetValue(draft) ?? throw new InvalidDataException("Native draft confirmation watermark is missing."));
    }
    private static (string Method, string Path, JsonObject Body) PrepareAppSave(string kind, JsonObject original, JsonObject values)
    {
        var method = typeof(MainWindow).GetMethod("BuildSave", BindingFlags.Static | BindingFlags.NonPublic) ?? throw new MissingMethodException("MainWindow.BuildSave");
        try { return ((string, string, JsonObject))(method.Invoke(null, [kind, original, values]) ?? throw new InvalidOperationException("Native save preparation returned no command.")); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
    }
    private static async Task WithBaselineWindowAsync(Func<MainWindow, SyncEngine, BaselineMemoryStore, BaselineRemote, Task> action)
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            var store = new BaselineMemoryStore(); var remote = new BaselineRemote(); var engine = new SyncEngine(store, remote);
            await engine.InitializeAsync();
            typeof(MainWindow).GetField("engine", Private)!.SetValue(window, engine);
            try
            {
                await action(window, engine, store, remote);
                Check(handler.Calls == 0 && sockets.Connects == 0, "baseline reconciliation contacted an HTTP origin or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }
    private sealed class BaselineMemoryStore : IWorkspaceStore
    {
        private WorkspaceState state = new() { ScopeId = "synthetic-native-baseline-only" };
        internal int Saves { get; private set; }
        public string ScopeId => "synthetic-native-baseline-only";
        public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(Clone(state));
        public Task SaveAsync(WorkspaceState value, CancellationToken cancellationToken = default) { state = Clone(value); Saves++; return Task.CompletedTask; }
        private static WorkspaceState Clone(WorkspaceState value) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(value))!;
    }
    private sealed class BaselineRemote : IRemoteApi
    {
        internal Queue<ApiResult> Replies { get; } = new();
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        {
            Check(method is "POST" or "PUT" or "PATCH" or "DELETE", "baseline fixture unexpectedly attempted a service read");
            return Task.FromResult(Replies.Count > 0 ? Replies.Dequeue() : throw new InvalidOperationException("No synthetic response was configured for this baseline request."));
        }
    }
}
