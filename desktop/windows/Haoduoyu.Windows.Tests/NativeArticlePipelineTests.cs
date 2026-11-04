using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ArticlePipelineCases =>
    [
        ("Shown native article pipeline preserves offline unfinished input exact typed metadata and read-only evidence across restart", () => RunWithDispatcher(ArticlePipelineOfflineAsync)),
        ("Shown native article pipeline retains conflict timeout and later drafts behind the original request fence after restart", () => RunWithDispatcher(ArticlePipelineUncertainResultsAsync))
    ];

    private static async Task ArticlePipelineOfflineAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var original = PipelineArticle("原有完整合成流水线文章", 7);
            var key = "/api/v1/articles/" + original["id"]!.GetValue<string>();
            await SeedPipelineProfileAsync(root, original);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "文章台账");
                await SelectListItemAsync(window, "原有完整合成流水线文章");
                Check(PipelineValue(window, "char_count") == "2200" && PipelineValue(window, "image_count") == "26", "the actual article editor omitted saved pipeline counters");
                SetPipelineValue(window, "title", "离线流水线中文新标题 🐟");
                SetPipelineValue(window, "slot", "tt2");
                SetPipelineValue(window, "writer", "human");
                SetPipelineValue(window, "illustrator", "codex");
                SetPipelineValue(window, "run_dir", "runs/native_pipeline/synthetic");
                SetPipelineValue(window, "run_date", "2026-02-30");
                SetPipelineValue(window, "series_no", "");
                SetPipelineValue(window, "char_count", "0");
                SetPipelineValue(window, "subheading_count", "");
                SetPipelineValue(window, "image_count", "0");
                SetPipelineValue(window, "cover_desc", "中文封面说明：这是合成资料，不打开路径或发布。");
                SetPipelineValue(window, "draft_pgc_id", "合成草稿凭证-甲");
                SetPipelineValue(window, "draft_appmsgid", "");
                SetPipelineValue(window, "draft_editor_url", "https://example.com/synthetic-editor");
                SetPipelineValue(window, "finished_at", "2026-11-04T20:01:02+08:00");
                await ClickAsync(window, "保存本机草稿");
                var unfinished = SavedAppDraft(Engine(window), key);
                Check(unfinished["values"]?["run_date"]?.GetValue<string>() == "2026-02-30" && Engine(window).Snapshot.Drafts[key].BaseVersion == 7,
                    "unfinished pipeline input was discarded or replaced its original server version during local save");
                await ClickAsync(window, "保存到待同步队列");
                Check(Engine(window).Snapshot.Outbox.Count == 0 && Field<TextBlock>(window, "status").Text.StartsWith("操作未完成", StringComparison.Ordinal),
                    "an impossible calendar date entered the executable queue or failed without an explanation");
                await CloseAsync(window);
                window = await ShowAsync(root, handler);
                await ClickAsync(window, "文章台账");
                await SelectListItemAsync(window, "原有完整合成流水线文章");
                Check(PipelineValue(window, "title") == "离线流水线中文新标题 🐟" && PipelineValue(window, "run_date") == "2026-02-30" &&
                    PipelineValue(window, "char_count") == "0" && PipelineValue(window, "series_no") == "" && PipelineValue(window, "finished_at") == "2026-11-04T20:01:02+08:00",
                    "reopening the real editor lost exact unfinished pipeline fields, zero, empty, or explicit time-zone input");
                Check(SavedAppDraft(Engine(window), key)["original"]?["version"]?.GetValue<long>() == 7,
                    "reopening a pipeline draft silently rebased its original CAS version");
                SetPipelineValue(window, "run_date", "2026-11-04");
                await ClickAsync(window, "查看流水线详情");
                AssertPipelineDetail(window);
                Check(Engine(window).Snapshot.Outbox.Count == 0, "viewing read-only pipeline evidence queued a mutation");
                await ClickAsync(window, "返回原稿编辑");
                Check(PipelineValue(window, "title") == "离线流水线中文新标题 🐟" && PipelineValue(window, "char_count") == "0",
                    "returning from details forked or reset the current article draft");
                await ClickAsync(window, "保存到待同步队列");
                var operation = Engine(window).Snapshot.Outbox.Single();
                var body = JsonNode.Parse(operation.BodyJson)!.AsObject();
                Check(operation.Method == "PUT" && operation.Path == key && operation.ResourceKey == key && operation.Status == PendingStatus.Queued &&
                    body["version"]?.GetValue<long>() == 7 && body["title"]?.GetValue<string>() == "离线流水线中文新标题 🐟",
                    "offline pipeline edit did not retain one immutable version-protected update to its original server entity");
                Check(body["char_count"]?.GetValue<long>() == 0 && body["image_count"]?.GetValue<long>() == 0 && body.ContainsKey("series_no") && body["series_no"] == null &&
                    body.ContainsKey("subheading_count") && body["subheading_count"] == null,
                    "native pipeline save confused genuine zero, unknown null, or typed numeric fields");
                Check(body["slot"]?.GetValue<string>() == "tt2" && body["writer"]?.GetValue<string>() == "human" && body["illustrator"]?.GetValue<string>() == "codex" &&
                    body["run_date"]?.GetValue<string>() == "2026-11-04" && body["run_dir"]?.GetValue<string>() == "runs/native_pipeline/synthetic",
                    "pipeline scalar controls were not included in the real queued request");
                Check(body["draft_ref"]?["pgc_id"]?.GetValue<string>() == "合成草稿凭证-甲" && body["draft_ref"]?["appmsgid"] == null &&
                    body["draft_ref"]?["editor_url"]?.GetValue<string>() == "https://example.com/synthetic-editor" &&
                    JsonNode.DeepEquals(body["draft_ref"]?["future_vendor"], original["draft_ref"]?["future_vendor"]) &&
                    JsonNode.DeepEquals(body["timings"]?["future_clock"], original["timings"]?["future_clock"]),
                    "editing native draft credentials or finish time discarded unknown nested vendor metadata");
                Check(DateTimeOffset.Parse(body["timings"]!["finished_at"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture).ToUnixTimeSeconds() ==
                    DateTimeOffset.Parse("2026-11-04T20:01:02+08:00", System.Globalization.CultureInfo.InvariantCulture).ToUnixTimeSeconds(),
                    "native finish-time conversion changed the explicit instant");
                foreach (var field in new[] { "sample", "reruns", "blockers", "verify_items" })
                    Check(JsonNode.DeepEquals(body[field], original[field]), "pipeline form changed preserved structured evidence: " + field);
                Check(!body.ContainsKey("draft_pgc_id") && !body.ContainsKey("draft_editor_url") && !body.ContainsKey("finished_at"),
                    "private flattened editor keys leaked into the server entity contract");
                SaveEvidence(window, "article-pipeline-offline-queued.png");
                await CloseAsync(window);
                window = await ShowAsync(root, handler);
                var reopened = Engine(window).Snapshot.Outbox.Single();
                Check(reopened.Id == operation.Id && reopened.BodyJson == operation.BodyJson && reopened.Status == PendingStatus.Queued,
                    "restart changed the pipeline request ID, exact bytes, or unsent status");
                Check(handler.Calls == 0 && sockets.Connects == 0, "offline pipeline fields, details, or restart requested HTTP or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ArticlePipelineUncertainResultsAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var conflictOriginal = PipelineArticle("合成冲突流水线文章", 4); var unknownOriginal = PipelineArticle("合成超时流水线文章", 6);
            var conflictKey = "/api/v1/articles/" + conflictOriginal["id"]!.GetValue<string>();
            var unknownKey = "/api/v1/articles/" + unknownOriginal["id"]!.GetValue<string>();
            await SeedPipelineProfileAsync(root, conflictOriginal, unknownOriginal);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "文章台账"); await SelectListItemAsync(window, "合成冲突流水线文章");
                SetPipelineValue(window, "cover_desc", "遇到409前的中文封面原稿");
                SetPipelineValue(window, "image_count", "0");
                await ClickAsync(window, "保存到待同步队列");
                await SelectListItemAsync(window, "合成超时流水线文章");
                SetPipelineValue(window, "draft_pgc_id", "结果未知前的合成凭证");
                SetPipelineValue(window, "finished_at", "2026-11-04T20:02:03+08:00");
                await ClickAsync(window, "保存到待同步队列");
                var before = Engine(window).Snapshot;
                var first = before.Outbox.Single(operation => operation.ResourceKey == conflictKey);
                var second = before.Outbox.Single(operation => operation.ResourceKey == unknownKey);
                var remoteBody = Wrap(Object(("code", "VERSION_CONFLICT"), ("current", Object(("id", conflictOriginal["id"]!.DeepClone()),
                    ("version", 5), ("cover_desc", "另一设备的中文封面，不可被覆盖"), ("sample", conflictOriginal["sample"]!.DeepClone())))));
                var outcomes = new PipelineOutcomeRemote(remoteBody);
                // Keep the actual current-user encrypted store; only transport is a deterministic synthetic outcome source.
                var engine = new SyncEngine(Field<AtomicWorkspaceStore>(window, "store"), outcomes);
                await engine.InitializeAsync(); typeof(MainWindow).GetField("engine", Private)!.SetValue(window, engine);
                typeof(MainWindow).GetField("connected", Private)!.SetValue(window, true);
                await ClickAsync(window, "同步已排队操作");
                var after = engine.Snapshot;
                var conflict = after.Outbox.Single(operation => operation.Id == first.Id);
                var unknown = after.Outbox.Single(operation => operation.Id == second.Id);
                Check(conflict.Status == PendingStatus.Conflict && conflict.BodyJson == first.BodyJson && conflict.RemoteJson == remoteBody && conflict.SendAttempts == 1,
                    "a pipeline 409 lost its exact original request or remote conflict evidence");
                Check(unknown.Status == PendingStatus.Unknown && unknown.BodyJson == second.BodyJson && unknown.SendAttempts == 1 && unknown.RemoteJson == null,
                    "a pipeline timeout changed original bytes, invented a receipt, or became safe to retry");
                Check(after.Drafts[conflictKey].Text == before.Drafts[conflictKey].Text && after.Drafts[unknownKey].Text == before.Drafts[unknownKey].Text &&
                    VisibleText(window).Contains("版本冲突", StringComparison.Ordinal) && VisibleText(window).Contains("结果未知", StringComparison.Ordinal),
                    "the actual native sync view lost the local pipeline drafts or did not distinguish conflict from unknown");
                Check(outcomes.Requests.Count == 2 && outcomes.Requests[0] == ("PUT", conflictKey, first.BodyJson, first.Id) &&
                    outcomes.Requests[1] == ("PUT", unknownKey, second.BodyJson, second.Id),
                    "native synchronization altered exact typed pipeline bytes, resource identity, order, or persisted operation IDs");
                await ClickAsync(window, "同步已排队操作");
                Check(outcomes.Requests.Count == 2, "explicit sync blindly replayed the pipeline timeout or unresolved conflict");
                await InvokeAsync(window, "EditAsync", "article", unknownOriginal, unknownKey);
                SetPipelineValue(window, "cover_desc", "超时后仍可继续本机中文编辑，原请求不得换ID重放 🐟");
                await ClickAsync(window, "保存并同步");
                Check(engine.Snapshot.Outbox.Count == 2 && engine.Snapshot.Outbox.Single(operation => operation.Id == second.Id).BodyJson == second.BodyJson &&
                    engine.Snapshot.Outbox.Single(operation => operation.Id == second.Id).Status == PendingStatus.Unknown && outcomes.Requests.Count == 2,
                    "saving a later pipeline draft replaced an already attempted unknown request or sent a new operation");
                Check(SavedAppDraft(engine, unknownKey)["values"]?["cover_desc"]?.GetValue<string>() == "超时后仍可继续本机中文编辑，原请求不得换ID重放 🐟",
                    "an attempted pipeline request prevented the later editable draft from being safely persisted");
                SaveEvidence(window, "article-pipeline-unknown-keeps-later-draft.png");
                await CloseAsync(window); window = await ShowAsync(root, handler);
                var reopened = Engine(window).Snapshot;
                Check(reopened.Outbox.Single(operation => operation.Id == first.Id).RemoteJson == remoteBody &&
                    reopened.Outbox.Single(operation => operation.Id == second.Id).Status == PendingStatus.Unknown &&
                    reopened.Outbox.Single(operation => operation.Id == second.Id).BodyJson == second.BodyJson &&
                    SavedAppDraft(Engine(window), unknownKey)["values"]?["cover_desc"]?.GetValue<string>() == "超时后仍可继续本机中文编辑，原请求不得换ID重放 🐟",
                    "restart lost pipeline conflict evidence, the original timeout fence, or the later local draft");
                Check(handler.Calls == 0 && sockets.Connects == 0, "pipeline outcome isolation contacted HTTP or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static JsonObject PipelineArticle(string title, int version) => Object(
        ("id", Guid.NewGuid().ToString()), ("account_id", "synthetic-pipeline-account"), ("account_name", "合成流水线账号"), ("platform", "toutiao"),
        ("title", title), ("version", version), ("status", "published"), ("production_mode", "mixed"),
        ("url", "https://example.com/synthetic-pipeline"), ("published_at", "2026-11-04T02:00:00.000Z"), ("started_at", "2026-11-04T01:00:00.000Z"),
        ("summary", "合成摘要"), ("notes", "保持旧平台元数据与真实零值"), ("slot", "tt1"), ("writer", "dedao"), ("illustrator", "human"),
        ("run_dir", "runs/synthetic/original"), ("run_date", "2026-11-04"), ("series_no", 27), ("char_count", 2200), ("subheading_count", 5), ("image_count", 26),
        ("cover_desc", "原封面说明"), ("draft_ref", Object(("pgc_id", "synthetic-original"), ("appmsgid", "synthetic-original-appmsgid"),
            ("editor_url", "https://example.com/synthetic-original-editor"), ("future_vendor", Object(("identity", "必须保留的未知凭证字段"), ("count", 0))))),
        ("timings", Object(("finished_at", "2026-11-04T01:30:00.000Z"), ("future_clock", Object(("source", "必须保留的未知时间来源"), ("raw", 0))))),
        ("sample", Object(("title", "只读合成样文凭证，不能打开或执行"), ("url", "https://example.com/synthetic-sample"), ("future_sample", true))),
        ("reruns", Object(("watchdog", 2), ("future_retries", new JsonArray(0, "保留")))),
        ("blockers", new JsonArray(Object(("type", "合成阻塞记录"), ("detail", "原始阻塞内容不可丢失")))),
        ("verify_items", new JsonArray(Object(("id", "synthetic-verification"), ("field", "image_count"), ("status", "pending"), ("reason", "只读待核证据")))),
        ("warnings", new JsonArray("synthetic-warning-only")),
        ("observations", new JsonArray(Object(("id", "synthetic-observation"), ("as_of", "2026-11-04T03:00:00.000Z"), ("metrics", Object(("reads", 0)))))));

    private static async Task SeedPipelineProfileAsync(string root, params JsonObject[] articles)
    {
        var publicScope = new string('a', 64); var privateScope = new string('b', 64); var otherScope = new string('c', 64);
        const string owner = "10000000-0000-4000-8000-000000000501", other = "10000000-0000-4000-8000-000000000502";
        var identity = "user:" + owner + ":" + privateScope;
        using (var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector()))
        {
            var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
            state.Cache["/api/v1/accounts"] = Wrap(new JsonArray(Object(("id", "synthetic-pipeline-account"), ("name", "合成流水线账号"), ("platform", "toutiao"))));
            state.Cache["/api/v1/articles?page=1&page_size=50&status=published"] = Wrap(new JsonArray(articles.Select(article => article.DeepClone()).ToArray()));
            foreach (var article in articles) state.Cache["/api/v1/articles/" + article["id"]!.GetValue<string>()] = Wrap(article.DeepClone());
            foreach (var path in state.Cache.Keys) state.CacheRevisions[path] = 1;
            await store.SaveAsync(state);
        }
        RememberProfiles(root, publicScope, owner, privateScope, other, otherScope, identity);
    }

    private static FrameworkElement PipelineControl(MainWindow window, string name)
    {
        var controls = Descendants(Field<StackPanel>(window, "page")).OfType<FrameworkElement>()
            .Where(control => control.Tag?.ToString() == name && control is TextBox or ComboBox).ToArray();
        Check(controls.Length == 1, "article pipeline editor control is absent or ambiguous: " + name);
        return controls[0];
    }
    private static void SetPipelineValue(MainWindow window, string name, string value)
    {
        var control = PipelineControl(window, name);
        if (control is TextBox box) box.Text = value;
        else if (control is ComboBox combo) combo.SelectedValue = value;
    }
    private static string PipelineValue(MainWindow window, string name) => PipelineControl(window, name) switch
    {
        TextBox box => box.Text,
        ComboBox combo => combo.SelectedValue?.ToString() ?? "",
        _ => throw new InvalidOperationException("Pipeline test expected a native text or choice field.")
    };
    private static void AssertPipelineDetail(MainWindow window)
    {
        Check(Field<TextBlock>(window, "heading").Text == "文章流水线详情", "actual article detail action did not open the native pipeline page");
        var page = Field<StackPanel>(window, "page");
        var text = string.Join("\n", Descendants(page).OfType<TextBlock>().Select(block => block.Text)
            .Concat(Descendants(page).OfType<TextBox>().Select(box => box.Text)));
        foreach (var evidence in new[] { "只读合成样文凭证", "合成阻塞记录", "只读待核证据", "必须保留的未知凭证字段", "必须保留的未知时间来源", "synthetic-warning-only", "synthetic-observation" })
            Check(text.Contains(evidence, StringComparison.Ordinal), "native detail omitted complete pipeline evidence: " + evidence);
        Check(Descendants(page).OfType<TextBox>().All(box => box.IsReadOnly), "pipeline evidence detail exposed writable raw source controls");
    }

    private sealed class PipelineOutcomeRemote(string conflictJson) : IRemoteApi
    {
        internal List<(string Method, string Path, string? Body, string Id)> Requests { get; } = [];
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        {
            Check(method == "PUT" && path.StartsWith("/api/v1/articles/", StringComparison.Ordinal), "pipeline outcome test attempted an unexpected read or mutation");
            Requests.Add((method, path, bodyJson, operationId));
            if (Requests.Count == 1) return Task.FromResult(new ApiResult(409, conflictJson));
            if (Requests.Count == 2) throw new TaskCanceledException("Synthetic pipeline request outcome is unknown; no HTTP or socket exists.");
            throw new InvalidOperationException("An already attempted pipeline request was sent again.");
        }
    }
}
