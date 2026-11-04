using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

internal static class ArticleVerificationContract
{
    private static (JsonObject Original, JsonObject Changes, JsonArray Selections, JsonObject Values) Form(JsonObject input)
    {
        var original = input["original"]?.DeepClone().AsObject() ?? throw new InvalidDataException("Verification form original is required.");
        var changes = input["changes"]?.DeepClone().AsObject() ?? new JsonObject();
        var selections = input["selections"]?.DeepClone().AsArray() ?? new JsonArray();
        var values = ArticlePipelineFormLogic.FormValues(original);
        foreach (var pair in changes) values[pair.Key] = pair.Value?.DeepClone();
        foreach (var entry in selections)
        {
            var selection = entry?.AsObject() ?? throw new InvalidDataException("Verification selection is required.");
            values = ArticleVerificationFormLogic.SetDone(values, selection["index"]!.GetValue<int>(), selection["done"]!.GetValue<bool>());
        }
        return (original, changes, selections, values);
    }

    internal static async Task BuildCommandAsync()
    {
        var input = JsonNode.Parse(await Console.In.ReadToEndAsync())!.AsObject();
        JsonObject output;
        try
        {
            var form = Form(input);
            var command = ArticlePipelineFormLogic.Build(form.Original, form.Values);
            output = new JsonObject { ["ok"] = true, ["original"] = form.Original, ["changes"] = form.Changes,
                ["selections"] = form.Selections, ["values"] = form.Values, ["method"] = command.Method,
                ["path"] = command.Path, ["body"] = command.Body };
        }
        catch (Exception error) when (IsFormError(error))
        {
            output = new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
        Console.WriteLine(output.ToJsonString());
    }

    private static bool IsFormError(Exception error) => error is InvalidOperationException or InvalidDataException or ArgumentException or FormatException or OverflowException or JsonException;

    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        var passed = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new InvalidDataException("Verification contract failed: " + name);
            passed++; Console.WriteLine("PASS verification " + name);
        }
        Check(fixture["source_commit"]?.GetValue<string>() == "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" &&
            fixture["synthetic_only"]?.GetValue<bool>() == true && fixture["external_fetch_attempts"]?.GetValue<int>() == 0 &&
            fixture["production_business_requests"]?.GetValue<int>() == 0 &&
            fixture["commands_from"]?.GetValue<string>() == "Actual shared native ArticleVerificationFormLogic.SetDone and ArticlePipelineFormLogic.FormValues/Build",
            "exact source and isolation");
        var reads = 0; var success = 0; var conflicts = 0; var denied = 0; var invalid = 0;
        var names = new HashSet<string>(StringComparer.Ordinal);
        var successfulBodies = new List<(JsonObject Sample, JsonObject Body)>();
        JsonNode? committed = null; JsonNode? beforeDenied = null; JsonNode? committedDetail = null;
        foreach (var entry in fixture["samples"]!.AsArray())
        {
            var sample = entry!.AsObject(); var name = sample["name"]!.GetValue<string>();
            var method = sample["method"]!.GetValue<string>(); var resource = sample["path"]!.GetValue<string>();
            var status = sample["status"]!.GetValue<int>(); var responseJson = sample["response_json"]!.GetValue<string>();
            var response = JsonNode.Parse(responseJson)!.AsObject(); var data = response["data"];
            if (!names.Add(name)) throw new InvalidDataException("Duplicate verification sample.");
            RoutePolicy.Validate(method, resource, allowAuthWrite: false);
            if (method == "GET")
            {
                Check(status == 200, name + " is successful read");
                BusinessReadSchema.Validate(resource, new ApiResult(status, responseJson));
                if (name == "verification-read-committed-same-content-not-a-receipt") { committedDetail = data?.DeepClone(); }
                if (name == "verification-after-conflicts-preserves-committed-detail")
                    Check(committedDetail is not null && JsonNode.DeepEquals(committedDetail, data), "real conflicts never change complete server detail");
                if (name == "verification-read-before-permission-rejections") beforeDenied = data?.DeepClone();
                if (name == "verification-denials-preserve-original-detail")
                    Check(beforeDenied is not null && JsonNode.DeepEquals(beforeDenied, data), "real permission and size denials retain complete server detail");
                reads++;
            }
            else
            {
                var captured = sample["form"]?.AsObject() ?? throw new InvalidDataException("Actual native form vector is missing.");
                var form = Form(captured);
                Check(JsonNode.DeepEquals(form.Values, captured["values"]), name + " rebuilds actual shared verification values");
                var built = ArticlePipelineFormLogic.Build(form.Original, form.Values);
                JsonObject body = sample["body_mode"]?.GetValue<string>() == "verification-only"
                    ? new JsonObject { ["version"] = built.Body["version"]?.DeepClone(), ["verify_items"] = built.Body["verify_items"]?.DeepClone() }
                    : built.Body;
                Check(built.Method == method && built.Path == resource && JsonNode.DeepEquals(body, sample["body"]), name + " uses actual shared native command");
                if (status is >= 200 and < 300)
                {
                    MutationVerifier.Validate(method, resource, body.ToJsonString(), data);
                    successfulBodies.Add((sample, body)); success++;
                    if (name == "verification-native-merged-scalar-save")
                    {
                        committed = data?.DeepClone();
                        Check(data?["title"]?.GetValue<string>() == "合成同稿标题修改" && data?["notes"]?.GetValue<string>() == "合成同稿备注修改" &&
                            data?["writer"]?.GetValue<string>() == "human", "scalar draft edits accompany checklist save");
                        var expected = form.Original["verify_items"]!.DeepClone().AsArray(); expected[0]!["done"] = true;
                        Check(JsonNode.DeepEquals(expected, data?["verify_items"]), "unknown item metadata and unselected done values preserved");
                        Check(data?["verify_state"]?.GetValue<string>() == "unknown" && data?["has_pending_verify"] is null,
                            "unknown completion values never become false or complete");
                        foreach (var field in new[] { "sample", "reruns", "blockers", "draft_ref", "timings" })
                            Check(JsonNode.DeepEquals(form.Original[field], data?[field]), "unrelated " + field + " retained");
                    }
                    if (name == "verification-original-key-body-replay")
                    {
                        Check(committed is not null && JsonNode.DeepEquals(committed, data), "original key and body return identical historical success");
                        Check(JsonNode.DeepEquals(sample["before"], sample["after"]), "idempotency replay does not increment revision audit or receipts");
                    }
                    if (name == "verification-only-body-preserves-omitted-scalars")
                        Check(committed is not null && data?["title"]?.GetValue<string>() == committed["title"]?.GetValue<string>() &&
                            data?["notes"]?.GetValue<string>() == committed["notes"]?.GetValue<string>() && data?["has_pending_verify"]?.GetValue<bool>() == true,
                            "documented minimal verify body retains omitted scalar changes");
                    if (name == "verification-session-csrf-save")
                        Check(data?["verify_state"]?.GetValue<string>() == "complete" && data?["has_pending_verify"]?.GetValue<bool>() == false,
                            "session authenticated explicit choices complete the unchanged item list");
                }
                else
                {
                    Check(JsonNode.DeepEquals(sample["before"], sample["after"]), name + " changes no revision audit or idempotency record");
                    if (status == 409)
                    {
                        var expectedCode = name == "verification-same-key-different-body-rejected" ? "IDEMPOTENCY_CONFLICT" : "VERSION_CONFLICT";
                        Check(response["error"]?["code"]?.GetValue<string>() == expectedCode, name + " has exact conflict code"); conflicts++;
                    }
                    else { Check(status is 403 or 404 or 413, name + " is a contract permission or body denial"); denied++; }
                }
            }
        }
        foreach (var entry in fixture["invalid_forms"]!.AsArray())
        {
            var vector = entry!.AsObject(); var rejected = false;
            try { var form = Form(vector); _ = ArticlePipelineFormLogic.Build(form.Original, form.Values); }
            catch (Exception error) when (IsFormError(error)) { rejected = true; }
            Check(rejected, "actual shared form rejects " + vector["name"]!.GetValue<string>()); invalid++;
        }
        // GET may show the desired content after a lost response, but articles have no exact operation receipt endpoint.
        var committedSample = successfulBodies.Single(x => x.Sample["name"]!.GetValue<string>() == "verification-native-merged-scalar-save");
        var calls = new List<string>(); var writes = 0; var scope = new string('a', 64);
        var originalRequestId = committedSample.Sample["idempotency_key"]!.GetValue<string>();
        var originalBodyJson = committedSample.Body.ToJsonString();
        using (var api = new WorkbenchApi(new FakeHandler(async request =>
        {
            calls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
            if (request.RequestUri.AbsolutePath.EndsWith("/index", StringComparison.Ordinal))
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(new JsonObject
                { ["data"] = new JsonObject { ["complete"] = true, ["scope_id"] = scope } }.ToJsonString(), Encoding.UTF8, "application/json") };
            if (request.Method == HttpMethod.Put)
            {
                writes++;
                if (request.Headers.GetValues("Idempotency-Key").Single() != originalRequestId ||
                    await request.Content!.ReadAsStringAsync() != originalBodyJson)
                    throw new InvalidDataException("Lost-response synthetic request lost the original key or bytes.");
                // The readback below models the captured real committed response; delivery of this HTTP response is lost.
                throw new HttpRequestException("Synthetic successful commit response was lost.");
            }
            return new HttpResponseMessage(HttpStatusCode.OK)
            { Content = new StringContent(new JsonObject { ["data"] = committedDetail?.DeepClone() }.ToJsonString(), Encoding.UTF8, "application/json") };
        })))
        {
            api.BindScope(scope);
            var store = new DetachedMemoryStore(scope);
            var engine = new SyncEngine(store, api); await engine.InitializeAsync();
            var pending = new PendingOperation { Id = originalRequestId, ResourceKey = "article:" + committedSample.Sample["path"]!.GetValue<string>().Split('/').Last(),
                Method = "PUT", Path = committedSample.Sample["path"]!.GetValue<string>(), BodyJson = originalBodyJson };
            await engine.QueueAsync(pending); var report = await engine.SyncAsync();
            Check(report.Unknown == 1 && writes == 1 && engine.Snapshot.Outbox.Single().Status == PendingStatus.Unknown,
                "lost response after synthetic commit leaves original operation Unknown");
            var current = await api.GetDataAsync(committedSample.Sample["path"]!.GetValue<string>());
            Check(JsonNode.DeepEquals(current?["verify_items"], committedSample.Body["verify_items"]), "lost-response readback can coincidentally equal desired checklist");
            var count = calls.Count;
            var result = await api.ReconcileAsync("PUT", committedSample.Sample["path"]!.GetValue<string>(), committedSample.Body.ToJsonString());
            Check(result.Outcome == ReconciliationOutcome.Unconfirmed, "similar current article is never exact original-request confirmation");
            Check(calls.Count == count && writes == 1, "article reconciliation performs no unsupported receipt query or automatic write");
            await engine.SyncAsync();
            var retained = engine.Snapshot.Outbox.Single();
            Check(writes == 1 && retained.Status == PendingStatus.Unknown && retained.Id == originalRequestId && retained.BodyJson == originalBodyJson,
                "later sync retains Unknown key and bytes without resending");
            var reopened = new SyncEngine(store, api); await reopened.InitializeAsync(); await reopened.SyncAsync();
            Check(writes == 1 && reopened.Snapshot.Outbox.Single().Status == PendingStatus.Unknown,
                "reopening saved synthetic Unknown does not replay or infer success");
        }
        Check(reads == 7 && success == 5 && conflicts == 2 && denied == 7 && invalid == 9 && names.Count == 21,
            "all required real request and rejection categories present");
        Check(new[] { "verification-native-merged-scalar-save", "verification-original-key-body-replay", "verification-same-key-different-body-rejected", "verification-stale-cas-rejected",
            "verification-read-only-token-cannot-write", "verification-write-token-outside-account-cannot-write", "verification-session-missing-csrf-cannot-write",
            "verification-public-header-required", "verification-public-foreign-origin-rejected", "verification-public-foreign-record-hidden", "verification-public-body-budget-rejected" }.All(names.Contains),
            "CAS idempotency public session token scope CSRF and budget paths captured");
        Console.WriteLine($"Article verification source contract: {names.Count} actual Worker requests ({reads} reads/{success} successful save responses including one replay/{conflicts} CAS or idempotency conflicts/{denied} permission or size denials), {invalid} actual native form rejections, {passed} checks passed; synthetic temporary D1 only, zero external fetch attempts. Matching GET never confirms an unknown original request.");
    }

    private sealed class DetachedMemoryStore(string scope) : IWorkspaceStore
    {
        public string ScopeId => scope;
        private WorkspaceState state = new() { ScopeId = scope };
        private static WorkspaceState Copy(WorkspaceState value) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(value))!;
        public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(Copy(state));
        public Task SaveAsync(WorkspaceState value, CancellationToken cancellationToken = default)
        { state = Copy(value); return Task.CompletedTask; }
    }
}
