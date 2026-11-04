using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ArticleVerificationCases =>
    [
        ("Shown native article verification joins the original offline draft and only replaces a provably unsent request without crossing profiles", () => RunWithDispatcher(ArticleVerificationDraftAsync)),
        ("Shown native article verification sends exact merged CAS bytes and retains unknown outcomes despite matching current details or later edits", () => RunWithDispatcher(ArticleVerificationTransportAsync)),
        ("Shown native article verification backup recovery preserves later drafts and forbids replay of the old checklist request", () => RunWithDispatcher(ArticleVerificationRecoveryAsync))
    ];

    private static async Task ArticleVerificationDraftAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var offline = new SyntheticOrigin(denyEveryRequest: true);
            var original = VerificationArticle("原有合成待核文章", 7); var key = VerificationKey(original);
            await SeedPipelineProfileAsync(root, original);
            const string otherIdentity = "user:10000000-0000-4000-8000-000000000502:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
            var otherArticle = (JsonObject)original.DeepClone(); otherArticle["title"] = "乙账号独有待核文章";
            string otherPath;
            using (var other = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), otherIdentity, new WindowsProtector()))
            {
                otherPath = other.FilePath;
                var otherState = new WorkspaceState { ScopeId = other.ScopeId, LocalRevision = 1 };
                otherState.Drafts[key] = AppDraft("article", key, otherArticle, otherArticle);
                await other.SaveAsync(otherState);
            }
            var otherBytes = await File.ReadAllBytesAsync(otherPath);
            var window = await ShowAsync(root, offline);
            try
            {
                await InvokeAsync(window, "EditAsync", "article", original, key);
                var initialDraft = Engine(window).Snapshot.Drafts[key].Text;
                SelectVerificationItem(window, 2);
                Check(VerificationDone(window) == "unknown" && !VerificationDetail(window).Contains("\"done\"", StringComparison.Ordinal),
                    "a missing done marker was silently interpreted as completed or inserted on inspection");
                SetVerificationDone(window, true);
                Check(VerificationDone(window) == "true", "explicit native choice did not set a missing state to true");
                await ClickAsync(window, "撤销本次条目修改");
                Check(VerificationDone(window) == "unknown" && !VerificationDetail(window).Contains("\"done\"", StringComparison.Ordinal) &&
                    !VerificationControl<Button>(window, "article-verify-undo").IsEnabled,
                    "undo failed to restore the original missing done marker and disabled state");
                SelectVerificationItem(window, 3);
                Check(VerificationDone(window) == "unknown" && JsonNode.Parse(VerificationDetail(window))?["done"]?.GetValue<string>() == "source-unknown",
                    "a nonboolean done value was normalized before the user explicitly chose a state");
                SetVerificationDone(window, false); await ClickAsync(window, "撤销本次条目修改");
                Check(VerificationDone(window) == "unknown" && JsonNode.Parse(VerificationDetail(window))?["done"]?.GetValue<string>() == "source-unknown",
                    "undo normalized a nonboolean source state instead of restoring its exact value");
                await ClickAsync(window, "保存本机草稿");
                Check(Engine(window).Snapshot.Drafts[key].Text == initialDraft,
                    "selecting and inspecting a checklist item changed its original values or draft payload");
                var boundary = VerificationArticle("合法64KiB清单选择不能崩溃", 9); var boundaryKey = VerificationKey(boundary);
                var edgeItems = new JsonArray(Object(("text", "容量边界"), ("padding", "")));
                var semantic = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
                edgeItems[0]!["padding"] = new string('a', 65536 - Encoding.UTF8.GetByteCount(edgeItems.ToJsonString(semantic)));
                boundary["verify_items"] = edgeItems;
                await InvokeAsync(window, "EditAsync", "article", boundary, boundaryKey);
                var boundaryDraft = Engine(window).Snapshot.Drafts[boundaryKey].Text;
                SetVerificationDone(window, false);
                Check(window.IsVisible && VerificationDone(window) == "unknown" && !VerificationDetail(window).Contains("\"done\"", StringComparison.Ordinal) &&
                    VerificationControl<TextBlock>(window, "article-verify-status").Text.Contains("此次选择未应用", StringComparison.Ordinal) &&
                    Engine(window).Snapshot.Drafts[boundaryKey].Text == boundaryDraft && Engine(window).Snapshot.Outbox.Count == 0 &&
                    !VerificationControl<Button>(window, "article-verify-undo").IsEnabled,
                    "a rejected checklist size-boundary choice crashed, changed original state, dirtied a draft, or queued work");
                await InvokeAsync(window, "EditAsync", "article", original, key);
                SetPipelineValue(window, "title", "离线中文合并标题 🐟");
                SelectVerificationItem(window, 0); SetVerificationDone(window, true);
                await ClickAsync(window, "保存本机草稿");
                var saved = SavedAppDraft(Engine(window), key);
                Check(saved["values"]?["title"]?.GetValue<string>() == "离线中文合并标题 🐟" &&
                    saved["values"]?["verify_items"]?[0]?["done"]?.GetValue<bool>() == true &&
                    Engine(window).Snapshot.Drafts[key].BaseVersion == 7 && JsonTestValue.Integer(saved["original"]?["version"]) == 7,
                    "the checklist forked the article draft or changed its original CAS baseline");
                AssertVerificationMetadata(original["verify_items"]!.AsArray(), saved["values"]!["verify_items"]!.AsArray(), [0]);
                await CloseAsync(window); window = await ShowAsync(root, offline);
                await InvokeAsync(window, "EditAsync", "article", original, key);
                SelectVerificationItem(window, 0);
                Check(PipelineValue(window, "title") == "离线中文合并标题 🐟" && VerificationDone(window) == "true",
                    "closing and reopening lost the shared scalar/checklist draft");
                Check(!VerificationControl<Button>(window, "article-verify-undo").IsEnabled,
                    "reopening a saved draft exposed its earlier checklist choice as an undoable new page edit");
                await ClickAsync(window, "保存到待同步队列");
                var first = Engine(window).Snapshot.Outbox.Single();
                Check(first.Path == key && first.ResourceKey == key && first.Method == "PUT" && first.CanEditQueued &&
                    JsonTestValue.Integer(JsonNode.Parse(first.BodyJson)?["version"]) == 7,
                    "native checklist editing did not create one version-protected update of its existing article");
                await InvokeAsync(window, "EditAsync", "article", original, key);
                SetPipelineValue(window, "title", "同一稿较新标题与明确待处理 🐟");
                SelectVerificationItem(window, 0); SetVerificationDone(window, false);
                SelectVerificationItem(window, 3); SetVerificationDone(window, true);
                await ClickAsync(window, "保存到待同步队列");
                var all = Engine(window).Snapshot.Outbox; var replacement = all.Single(operation => operation.Status == PendingStatus.Queued);
                var old = all.Single(operation => operation.Id == first.Id); var body = JsonNode.Parse(replacement.BodyJson)!.AsObject();
                Check(all.Count == 2 && old.Status == PendingStatus.Superseded && old.BodyJson == first.BodyJson && old.SupersededById == replacement.Id &&
                    replacement.Id != first.Id && replacement.ResourceKey == key && replacement.SendAttempts == 0 &&
                    body["title"]?.GetValue<string>() == "同一稿较新标题与明确待处理 🐟" && body["verify_items"]?[0]?["done"]?.GetValue<bool>() == false &&
                    body["verify_items"]?[3]?["done"]?.GetValue<bool>() == true && JsonTestValue.Integer(body["version"]) == 7,
                    "a later checklist choice lost scalar changes, reused an immutable request ID, or failed to replace only the unsent intent");
                AssertVerificationMetadata(original["verify_items"]!.AsArray(), body["verify_items"]!.AsArray(), [0, 3]);
                Check((await File.ReadAllBytesAsync(otherPath)).SequenceEqual(otherBytes), "editing A's checklist changed the encrypted B partition");
                SaveEvidence(window, "article-verification-shared-offline-draft.png");
                await InvokeAsync(window, "OpenOfflineProfileAsync", otherIdentity);
                await InvokeAsync(window, "EditAsync", "article", otherArticle, key);
                SelectVerificationItem(window, 0);
                Check(PipelineValue(window, "title") == "乙账号独有待核文章" && VerificationDone(window) == "false" && Engine(window).Snapshot.Outbox.Count == 0,
                    "switching profiles reused a foreign checklist choice, article input, or queued mutation");
                Check(offline.Calls == 0 && sockets.Connects == 0, "offline checklist editing or profile switching attempted HTTP or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ArticleVerificationTransportAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var offline = new SyntheticOrigin(denyEveryRequest: true);
            var firstArticle = VerificationArticle("合成待核成功回执", 4); var secondArticle = VerificationArticle("合成待核丢失回执", 6);
            var firstKey = VerificationKey(firstArticle); var secondKey = VerificationKey(secondArticle);
            await SeedPipelineProfileAsync(root, firstArticle, secondArticle);
            var window = await ShowAsync(root, offline);
            try
            {
                foreach (var article in new[] { firstArticle, secondArticle })
                {
                    await InvokeAsync(window, "EditAsync", "article", article, VerificationKey(article));
                    SetPipelineValue(window, "title", article["title"]!.GetValue<string>() + "：同稿修改");
                    SelectVerificationItem(window, 0); SetVerificationDone(window, true);
                    await ClickAsync(window, "保存到待同步队列");
                }
                var queued = Engine(window).Snapshot.Outbox.ToArray();
                using var origin = new VerificationOrigin(); using var api = new WorkbenchApi(origin);
                await api.LoginAsync("synthetic-verification", "synthetic-only-password"); api.BindScope(origin.Scope);
                var engine = new SyncEngine(Field<AtomicWorkspaceStore>(window, "store"), api);
                await engine.InitializeAsync(); typeof(MainWindow).GetField("engine", Private)!.SetValue(window, engine);
                var report = await engine.SyncAsync();
                var first = engine.Snapshot.Outbox.Single(operation => operation.ResourceKey == firstKey);
                var unknown = engine.Snapshot.Outbox.Single(operation => operation.ResourceKey == secondKey);
                Check(report.Confirmed == 1 && report.Unknown == 1 && first.Status == PendingStatus.Confirmed && unknown.Status == PendingStatus.Unknown &&
                    first.SendAttempts == 1 && unknown.SendAttempts == 1 && unknown.BodyJson == queued[1].BodyJson && unknown.Id == queued[1].Id,
                    "successful or lost checklist receipts did not retain the exact attempted request and appropriate outcome");
                Check(origin.Writes.Count == 2 && origin.Writes[0] == ("PUT", firstKey, queued[0].BodyJson, queued[0].Id) &&
                    origin.Writes[1] == ("PUT", secondKey, queued[1].BodyJson, queued[1].Id),
                    "actual WorkbenchApi changed merged body bytes, version, target, or persisted Idempotency-Key");
                var current = await api.GetDataAsync(secondKey);
                Check(current?["verify_items"]?[0]?["done"]?.GetValue<bool>() == true && JsonTestValue.Integer(current?["version"]) == 7,
                    "the ambiguous-delivery fixture failed to expose matching newer server content");
                var callsBeforeReceipt = origin.Calls;
                var reconciliation = await api.ReconcileAsync(unknown.Method, unknown.Path, unknown.RequestBodyJson);
                Check(reconciliation.Outcome == ReconciliationOutcome.Unconfirmed && reconciliation.RemoteJson == null && origin.Calls == callsBeforeReceipt &&
                    engine.Snapshot.Outbox.Single(operation => operation.Id == unknown.Id).Status == PendingStatus.Unknown,
                    "matching checklist content was treated as an exact article save receipt");
                await engine.SyncAsync();
                Check(origin.Writes.Count == 2, "an explicit sync automatically replayed an article with unknown checklist outcome");
                await InvokeAsync(window, "EditAsync", "article", secondArticle, secondKey);
                SetPipelineValue(window, "title", "结果未知后继续本机写，不能覆盖原请求");
                SelectVerificationItem(window, 1); SetVerificationDone(window, false);
                await ClickAsync(window, "保存到待同步队列");
                var later = SavedAppDraft(engine, secondKey);
                Check(engine.Snapshot.Outbox.Count == 2 && engine.Snapshot.Outbox.Single(operation => operation.Id == unknown.Id).BodyJson == unknown.BodyJson &&
                    engine.Snapshot.Outbox.Single(operation => operation.Id == unknown.Id).Status == PendingStatus.Unknown && origin.Writes.Count == 2 &&
                    later["values"]?["title"]?.GetValue<string>() == "结果未知后继续本机写，不能覆盖原请求" &&
                    later["values"]?["verify_items"]?[1]?["done"]?.GetValue<bool>() == false,
                    "a later checklist draft replaced the attempted request, sent new intent, or failed to persist locally");
                // A response with the wrong checklist is not a valid save acknowledgement even if HTTP is 200.
                origin.ReturnWrongChecklist = true;
                var invalidId = Guid.NewGuid().ToString(); var invalidResponseRejected = false;
                try { await api.SendAsync("PUT", firstKey, queued[0].BodyJson, invalidId); }
                catch (ApiCallException) { invalidResponseRejected = true; }
                Check(invalidResponseRejected, "HTTP success with different verification choices bypassed the actual mutation-response verifier");
                SaveEvidence(window, "article-verification-unknown-keeps-later-draft.png");
                await CloseAsync(window); window = await ShowAsync(root, offline);
                var reopened = Engine(window).Snapshot.Outbox.Single(operation => operation.Id == unknown.Id);
                Check(reopened.Status == PendingStatus.Unknown && reopened.BodyJson == unknown.BodyJson && reopened.Id == unknown.Id &&
                    SavedAppDraft(Engine(window), secondKey)["values"]?["verify_items"]?[1]?["done"]?.GetValue<bool>() == false,
                    "restart lost the checklist unknown fence, exact original body, or later draft");
                Check(offline.Calls == 0 && sockets.Connects == 0, "synthetic verification transport or restart opened a real socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ArticleVerificationRecoveryAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var offline = new SyntheticOrigin(denyEveryRequest: true);
            const string owner = "10000000-0000-4000-8000-000000000501", other = "10000000-0000-4000-8000-000000000502";
            var scope = new string('b', 64); var identity = "user:" + owner + ":" + scope;
            var article = VerificationArticle("合成旧备份待核稿", 7); var key = VerificationKey(article);
            var values = ArticleVerificationFormLogic.SetDone(article, 0, true); values["title"] = "旧备份中合并的标题与待核选择";
            var prepared = PrepareAppSave("article", article, values); var queued = PreparedOperation(key, prepared);
            using (var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector()))
            {
                var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
                state.Drafts[key] = AppDraft("article", key, article, values); state.Outbox.Add(queued);
                await store.SaveAsync(state);
                var receipt = (JsonObject)prepared.Body.DeepClone(); receipt["id"] = article["id"]!.DeepClone(); receipt["version"] = 8;
                var newerDrafts = new Dictionary<string, LocalDraft>(state.Drafts, StringComparer.Ordinal)
                {
                    [key] = AppDraft("article", key, receipt, values) with { BaselineConfirmedRevision = 2 }
                };
                await store.SaveAsync(state with { LocalRevision = 2, Drafts = newerDrafts, Outbox = [queued with { Status = PendingStatus.Confirmed,
                    SendAttempts = 1, ConfirmedRevision = 2, RemoteJson = Wrap(receipt) }] });
            }
            RememberProfiles(root, new string('a', 64), owner, scope, other, new string('c', 64), identity);
            var window = await ShowAsync(root, offline);
            try
            {
                Check(Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Confirmed, "the recovery fixture lacks its newer saved acknowledgement");
                await InvokeAsync(window, "RestoreWorkspaceBackupAsync");
                var recovered = Engine(window).Snapshot; var operation = recovered.Outbox.Single();
                Check(operation.Id == queued.Id && operation.Status == PendingStatus.Unknown && operation.BodyJson == queued.BodyJson &&
                    operation.RecoveredAtRevision == recovered.BackupRecoveryRevision && operation.RecoveredAtRevision > 0 && !operation.CanEditQueued &&
                    recovered.Drafts[key].RecoveredAtRevision == recovered.BackupRecoveryRevision,
                    "restoring the old checklist backup revived its queued status or lost immutable request/recovery provenance");
                await InvokeAsync(window, "EditAsync", "article", article, key);
                Check(PipelineValue(window, "title") == "旧备份中合并的标题与待核选择" && VerificationDone(window) == "true",
                    "opening the recovered article lost its shared checklist/scalar draft");
                SelectVerificationItem(window, 1); SetVerificationDone(window, false);
                SetPipelineValue(window, "title", "恢复后仍可继续本机清单稿");
                await ClickAsync(window, "保存到待同步队列");
                Check(Engine(window).Snapshot.Outbox.Count == 1 && Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown &&
                    Engine(window).Snapshot.Outbox.Single().BodyJson == queued.BodyJson &&
                    SavedAppDraft(Engine(window), key)["values"]?["verify_items"]?[1]?["done"]?.GetValue<bool>() == false,
                    "the recovered checklist draft bypassed its unknown fence or failed to save later local choices");
                var retryRejected = false;
                try { await Engine(window).RetryUnchangedAsync(operation.Id, Wrap(article.DeepClone())); }
                catch (InvalidOperationException error) when (error.Message.Contains("备份", StringComparison.Ordinal)) { retryRejected = true; }
                Check(retryRejected, "an old backup's checklist request was directly made executable again");
                await Engine(window).SyncAsync();
                SaveEvidence(window, "article-verification-backup-unknown-fence.png");
                await CloseAsync(window); window = await ShowAsync(root, offline);
                var reopened = Engine(window).Snapshot;
                Check(reopened.Outbox.Single().Status == PendingStatus.Unknown && reopened.Outbox.Single().BodyJson == queued.BodyJson &&
                    reopened.Outbox.Single().RecoveredAtRevision == operation.RecoveredAtRevision &&
                    reopened.Drafts[key].RecoveredAtRevision == operation.RecoveredAtRevision &&
                    SavedAppDraft(Engine(window), key)["values"]?["title"]?.GetValue<string>() == "恢复后仍可继续本机清单稿",
                    "restart erased restored-checklist provenance or the continued local draft");
                Check(offline.Calls == 0 && sockets.Connects == 0, "checklist backup recovery or sync sent a request or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static JsonObject VerificationArticle(string title, int version)
    {
        var value = PipelineArticle(title, version);
        var future = Object(("source", "未识别来源必须保留"), ("nested", new JsonArray(0, "原始证据", null)));
        var pending = Object(("id", "verify-pending"), ("label", "逐项核对图片 🐟"), ("done", false), ("field", "image_count"), ("future", future));
        value["verify_items"] = new JsonArray(
            pending,
            Object(("id", "verify-done"), ("label", "原已处理项"), ("done", true), ("reason", "不能被其他条目覆盖")),
            Object(("id", "verify-missing"), ("label", "来源未写处理状态"), ("note", "缺失不等于已核")),
            Object(("id", "verify-nonbool"), ("label", "来源保留的未知状态"), ("done", "source-unknown"), ("source_flags", new JsonArray(true, 0))));
        return value;
    }
    private static string VerificationKey(JsonObject article) => "/api/v1/articles/" + article["id"]!.GetValue<string>();
    private static T VerificationControl<T>(MainWindow window, string id) where T : FrameworkElement =>
        Descendants(Field<StackPanel>(window, "page")).OfType<T>().Single(control => AutomationProperties.GetAutomationId(control) == id);
    private static void SelectVerificationItem(MainWindow window, int index)
    {
        var list = VerificationControl<ListBox>(window, "article-verify-items");
        Check(index >= 0 && index < list.Items.Count, "checklist test selection is outside the displayed native list");
        list.SelectedIndex = index; list.ScrollIntoView(list.Items[index]); window.UpdateLayout();
    }
    private static string VerificationDone(MainWindow window) => VerificationControl<ComboBox>(window, "article-verify-done").SelectedValue?.ToString() ?? "";
    private static void SetVerificationDone(MainWindow window, bool done) => VerificationControl<ComboBox>(window, "article-verify-done").SelectedValue = done ? "true" : "false";
    private static string VerificationDetail(MainWindow window)
    {
        var box = VerificationControl<TextBox>(window, "article-verify-item-detail");
        Check(box.IsReadOnly, "the raw checklist evidence became writable"); return box.Text;
    }
    private static void AssertVerificationMetadata(JsonArray before, JsonArray after, IReadOnlyList<int> changed)
    {
        Check(before.Count == after.Count, "checklist edit added or removed an original item");
        for (var index = 0; index < before.Count; index++)
        {
            var expected = before[index]!.DeepClone().AsObject(); var actual = after[index]!.DeepClone().AsObject();
            if (changed.Contains(index)) { expected.Remove("done"); actual.Remove("done"); }
            Check(JsonNode.DeepEquals(expected, actual), "checklist edit reordered items, normalized untouched done, or lost metadata at index " + index);
        }
    }

    private sealed class VerificationOrigin : HttpMessageHandler
    {
        internal string Scope { get; } = new('b', 64);
        internal int Calls { get; private set; }
        internal bool ReturnWrongChecklist { get; set; }
        internal List<(string Method, string Path, string? Body, string Key)> Writes { get; } = [];
        private readonly Dictionary<string, JsonObject> current = new(StringComparer.Ordinal);
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz", "verification fake transport changed fixed origin");
            var path = request.RequestUri!.PathAndQuery;
            if (path == "/api/v1/auth/login" && request.Method == HttpMethod.Post)
            {
                var login = Reply(Object(("ok", true)));
                login.Headers.Add("Set-Cookie", "matrix_session=synthetic-verification-session; Path=/; Secure; HttpOnly"); return login;
            }
            if (path == "/api/v1/auth/me" && request.Method == HttpMethod.Get)
                return Reply(Object(("id", "10000000-0000-4000-8000-000000000501"), ("username", "synthetic-verification"), ("csrfToken", "synthetic-verification-csrf")));
            if (path == "/api/v1/workbench-snapshot/index?version=2" && request.Method == HttpMethod.Get)
                return Reply(Object(("complete", true), ("scope_id", Scope)));
            if (request.Method == HttpMethod.Get && current.TryGetValue(path, out var article)) return Reply(article.DeepClone());
            Check(request.Method == HttpMethod.Put && path.StartsWith("/api/v1/articles/", StringComparison.Ordinal), "unexpected synthetic checklist transport request");
            Check(request.Headers.GetValues("Origin").Single() == "https://haoduoyu.xyz" &&
                request.Headers.GetValues("X-CSRF-Token").Single() == "synthetic-verification-csrf" &&
                !request.Headers.Contains("X-Public-Business") && request.Headers.GetValues("Cookie").Single().Contains("matrix_session=synthetic-verification-session", StringComparison.Ordinal),
                "native verification save lost its original session/CSRF/origin headers or fell back to public mode");
            var bytes = await request.Content!.ReadAsStringAsync(cancellationToken); var key = request.Headers.GetValues("Idempotency-Key").Single();
            Writes.Add((request.Method.Method, path, bytes, key));
            var body = JsonNode.Parse(bytes)!.AsObject();
            var saved = (JsonObject)body.DeepClone(); saved["id"] = path.Split('/').Last(); saved["platform"] = "toutiao";
            saved["version"] = JsonTestValue.Integer(body["version"]) + 1; current[path] = (JsonObject)saved.DeepClone();
            if (Writes.Count == 2) throw new TaskCanceledException("Synthetic delivery completed before response loss; no socket exists.");
            if (ReturnWrongChecklist) saved["verify_items"]![0]!["done"] = false;
            return Reply(saved);
        }
        private static HttpResponseMessage Reply(JsonNode value) => new(HttpStatusCode.OK) { Content = new StringContent(Wrap(value), Encoding.UTF8, "application/json") };
    }
}
