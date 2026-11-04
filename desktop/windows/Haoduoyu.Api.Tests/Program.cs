using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json;
using Haoduoyu.Api;

if (args is ["--worker-contract", var fixturePath])
{
    await WorkerContract.RunAsync(fixturePath);
    return;
}
if (args is ["--review-form-command"])
{
    await ReviewFormContract.BuildCommandAsync();
    return;
}
if (args is ["--review-form-contract", var reviewFixturePath])
{
    await ReviewFormContract.RunAsync(reviewFixturePath);
    return;
}
if (args is ["--ai-report-contract", var aiFixturePath])
{
    await AiReportTests.ReplayAsync(aiFixturePath);
    return;
}
if (args is ["--unicode-receipt-contract", var unicodeFixturePath])
{
    await UnicodeReceiptContract.RunAsync(unicodeFixturePath);
    return;
}
if (args is ["--article-pipeline-form-command"])
{
    await ArticlePipelineContract.BuildCommandAsync();
    return;
}
if (args is ["--article-pipeline-form-contract", var articlePipelineFixturePath])
{
    await ArticlePipelineContract.RunAsync(articlePipelineFixturePath);
    return;
}

var passed = 0;
var scope = new string('a', 64);
var otherScope = new string('b', 64);
var id = "123e4567-e89b-42d3-a456-426614174000";
var saveId = "123e4567-e89b-42d3-a456-426614174001";
void Check(bool condition, string name)
{
    if (!condition) throw new Exception("FAIL: " + name);
    Console.WriteLine("PASS " + name); passed++;
}
async Task<T> Throws<T>(Func<Task> action, string name) where T : Exception
{
    try { await action(); }
    catch (T error) { Check(true, name); return error; }
    throw new Exception("Expected " + typeof(T).Name + ": " + name);
}
HttpResponseMessage Json(string value, HttpStatusCode code = HttpStatusCode.OK) => new(code) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
string Index(string value) => "{\"data\":{\"complete\":true,\"scope_id\":\"" + value + "\"}}";

var calls = new List<string>();
using (var api = new WorkbenchApi(new FakeHandler(async request =>
{
    calls.Add(request.Method + " " + request.RequestUri!.PathAndQuery);
    Check(request.RequestUri.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz", "fixed HTTPS origin");
    Check(request.Headers.GetValues("Origin").Single() == "https://haoduoyu.xyz", "exact Origin");
    Check(!request.Headers.Contains("Authorization"), "no Authorization header");
    if (request.RequestUri.AbsolutePath.EndsWith("/index")) return Json(Index(scope));
    Check(request.Headers.GetValues("X-Public-Business").Single() == "1", "explicit public mode");
    Check(request.Headers.GetValues("Idempotency-Key").Single() == saveId, "stable idempotency key");
    Check((await request.Content!.ReadAsStringAsync()).Contains("original"), "original body sent");
    return Json("{\"data\":{\"id\":\"" + id + "\",\"date\":\"2026-11-04\",\"text\":\"original\",\"version\":1}}");
})))
{
    await Throws<ScopeGuardException>(() => api.SendAsync("POST", "/api/v1/todos", "{\"text\":\"original\"}", saveId), "unbound write is blocked");
    Check(calls.Count == 0, "unbound write does not contact server");
    api.BindScope(scope);
    var response = await api.SendAsync("POST", "/api/v1/todos", ApiRequests.CreateTodo(id, "2026-11-04", "original").BodyJson, saveId);
    Check(response.IsSuccess && calls.Count == 2 && calls[0].Contains("index?version=2"), "scope read precedes write");
}

using (var api = new WorkbenchApi(new FakeHandler(request => Task.FromResult(Json(Index(otherScope))))))
{
    api.BindScope(scope);
    await Throws<ScopeGuardException>(() => api.SendAsync("POST", "/api/v1/todos", "{}", saveId), "changed scope blocks write");
}
using (var api = new WorkbenchApi(new FakeHandler(request => Task.FromResult(Json("{\"data\":{\"complete\":false,\"scope_id\":\"" + scope + "\"}}")))))
    await Throws<ScopeGuardException>(() => api.ReadScopeIdAsync(), "incomplete scope cannot bind");

var rejected = new[]
{
    "https://evil.test/api/v1/todos", "//evil.test/api/v1/todos", "/api/v1/../auth/me", "/api/v1/articles/../../backup",
    "/api/v1/todos#fragment", "/api/v1/backup", "/api/v1/todos?date=2026-11-04&date=2026-11-05",
    "/api/v1/todos?url=https%3A%2F%2Fevil.test", "/api/v1/todos?date=%0D%0Asecret", "/api/v1/todos?",
    "/api/v1/articles/%2e%2e", "/api/v1/todos\\backup"
};
using (var api = new WorkbenchApi(new FakeHandler(_ => throw new Exception("Rejected paths must not send"))))
{
    foreach (var path in rejected) await Throws<ArgumentException>(() => api.GetDataAsync(path), "reject route " + path);
    await Throws<ArgumentException>(() => api.SendAsync("POST", "/api/v1/auth/login", "{}", saveId), "credentials cannot enter outbox");
    await Throws<ArgumentException>(() => api.SendAsync("POST", "/api/v1/todos", "{}", "bad-key"), "reject invalid operation key");
}

foreach (var payload in new[] { "null", "{}", "{\"data\":null}", "{\"data\":\"ok\"}", "<html>wrong proxy</html>" })
{
    using var api = new WorkbenchApi(new FakeHandler(_ => Task.FromResult(Json(payload))));
    await Throws<ApiCallException>(() => api.GetDataAsync("/api/v1/todos"), "malformed success never confirms: " + payload);
}
using (var api = new WorkbenchApi(new FakeHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.Found) { Headers = { Location = new Uri("https://evil.test/") } }))))
    await Throws<ApiCallException>(() => api.GetDataAsync("/api/v1/todos"), "redirect stopped");
using (var api = new WorkbenchApi(new FakeHandler(_ => Task.FromResult(Json("{\"data\":{\"text\":\"" + new string('x', WorkbenchApi.MaximumResponseBytes) + "\"}}")))))
    await Throws<ApiCallException>(() => api.GetDataAsync("/api/v1/todos"), "oversized response rejected");
using (var api = new WorkbenchApi(new FakeHandler(_ => throw new HttpRequestException("credential-value-must-not-leak"))))
{
    var error = await Throws<ApiCallException>(() => api.GetDataAsync("/api/v1/todos"), "network error safely wrapped");
    Check(!error.ToString().Contains("credential-value"), "underlying network message not exposed");
}

var authCalls = 0;
using (var api = new WorkbenchApi(new FakeHandler(async request =>
{
    authCalls++;
    if (request.RequestUri!.AbsolutePath.EndsWith("/login"))
    {
        Check(!request.Headers.Contains("X-Public-Business") && !request.Headers.Contains("X-CSRF-Token"), "login has no public or stale CSRF headers");
        Check((await request.Content!.ReadAsStringAsync()).Contains("synthetic-password"), "password only in login request");
        var response = Json("{\"data\":{\"username\":\"synthetic\"}}");
        response.Headers.Add("Set-Cookie", "matrix_session=" + new string('c', 64) + "; Path=/; HttpOnly; Secure; Max-Age=604800");
        return response;
    }
    if (request.RequestUri.AbsolutePath.EndsWith("/me"))
    {
        Check(request.Headers.GetValues("Cookie").Single().Contains("matrix_session="), "session cookie returned to same origin");
        return Json("{\"data\":{\"id\":\"synthetic-owner\",\"username\":\"synthetic\",\"csrfToken\":\"synthetic-csrf\"}}");
    }
    if (request.RequestUri.AbsolutePath.EndsWith("/index")) return Json(Index(scope));
    Check(request.Headers.GetValues("X-CSRF-Token").Single() == "synthetic-csrf" && !request.Headers.Contains("X-Public-Business"), "session writes use CSRF without public fallback");
    return Json("{\"data\":{\"id\":\"" + id + "\",\"date\":\"2026-11-04\",\"text\":\"synthetic\",\"version\":1}}");
})))
{
    var me = await api.LoginAsync("synthetic", "synthetic-password");
    Check(!api.PublicMode && me.UserId == "synthetic-owner", "actual auth/me identity selected");
    var material = api.ExportSession();
    Check(material is not null && material.ExpiresAt > DateTimeOffset.UtcNow && !material.ToString().Contains("synthetic-password") && !material.ToString().Contains(new string('c', 64)), "session material string has no password or cookie");
    api.BindScope(scope);
    await api.SendAsync("POST", "/api/v1/todos", ApiRequests.CreateTodo(id, "2026-11-04", "synthetic").BodyJson, saveId);
    api.UsePublicMode();
    Check(api.PublicMode && api.ExportSession() is null && api.ExpectedScopeId is null, "public mode clears cookie/CSRF/scope binding");
    Check(authCalls == 4, "auth lifecycle has expected fixed requests");
}

using (var api = new WorkbenchApi(new FakeHandler(request =>
{
    Check(request.Headers.GetValues("X-Note-Labels-Version").Single() == "3", "full note label protocol requested");
    return Task.FromResult(Json("{\"data\":{\"category\":\"life\",\"date\":\"2026-11-04\",\"can_edit\":true,\"labels_version\":3,\"entries\":[]}}"));
}))) await api.GetDataAsync(ApiRequests.Notes("life", "2026-11-04"));

using (var api = new WorkbenchApi(new FakeHandler(request =>
{
    Check(request.RequestUri!.AbsolutePath == "/api/v1/note-entries/labels" &&
        request.Headers.GetValues("X-Note-Labels-Version").Single() == "3" &&
        request.Headers.GetValues("X-Note-Labels-Archive").Single() == "1", "actual mounted labels path sends full version/archive protocol");
    return Task.FromResult(Json("{\"data\":{\"labels_version\":3,\"labels\":[],\"archived_labels\":[]}}"));
}))) await api.GetDataAsync("/api/v1/note-entries/labels");
using (var api = new WorkbenchApi(new FakeHandler(_ => Task.FromResult(Json("{\"data\":{\"format\":\"haoduoyu-note-month-v1\",\"month\":\"2026-11\",\"complete\":true,\"labels_version\":3,\"days\":[]}}")))))
{
    await api.GetDataAsync("/api/v1/note-entries/month?month=2026-11");
    Check(true, "actual mounted month path allowed");
    await Throws<ArgumentException>(() => api.GetDataAsync("/api/v1/note-labels"), "unmounted labels alias rejected");
    await Throws<ArgumentException>(() => api.GetDataAsync("/api/v1/note-month?month=2026-11"), "unmounted month alias rejected");
}

Check(ApiRequests.CreateTodo(id, "2026-11-04", "  synthetic  ").Body["text"]!.GetValue<string>() == "synthetic", "todo builder canonical trim");
Check(ApiRequests.SaveNote(id, "life", "2026-11-04", "a\r\nb", 0, saveId).Body["text"]!.GetValue<string>() == "a\nb", "note builder LF normalization");
Check(!ApiRequests.SaveNote(id, "life", "2026-11-04", "text", 1, saveId).Body.ContainsKey("labels"), "omitted labels preserve existing labels");
Check(ApiRequests.MoveUnscheduledTodo(id, 1, "2026-11-04", true).Path.EndsWith("/complete-today"), "future todo completion route");
await Throws<ArgumentException>(() => Task.FromResult(ApiRequests.Date("2026-02-30")), "invalid calendar date rejected");
await Throws<ArgumentException>(() => Task.FromResult(ApiRequests.SaveNote(id, "life", "2026-11-04", "\0", 1, saveId)), "control character rejected");
await Throws<ArgumentException>(() => Task.FromResult(ApiRequests.SaveNote(id, "life", "2026-11-04", "text", 1, saveId, ["same", "same"])), "duplicate labels rejected");

var remote = JsonNode.Parse("{\"id\":\"" + id + "\",\"category\":\"life\",\"date\":\"2026-11-04\",\"text\":\"测试\\ntext\",\"version\":2,\"change_seq\":3,\"created_at\":\"2026-11-04T00:00:00.000Z\",\"updated_at\":\"2026-11-04T01:00:00.000Z\",\"deleted_at\":null}")!;
var requestBody = ApiRequests.SaveNote(id, "life", "2026-11-04", "测试\ntext", 1, saveId).Body;
// Independently produced by the existing server's stable+digest functions (see fixture comment in README).
const string noteHash = "3acfe7edf7497079fe0d520502bcef54eb32f8f5b4e5dd4f820b66186ee3ec76";
var receipt = new JsonObject { ["found"] = true, ["id"] = id, ["version"] = 2, ["change_seq"] = 3, ["deleted_at"] = null, ["content_hash"] = noteHash };
var outcome = ReceiptVerifier.Verify("PUT", "/api/v1/note-entries/" + id, requestBody, receipt, remote, "{}");
Check(outcome.Outcome == ReconciliationOutcome.Confirmed, "exact receipt/entity/hash/body confirms unknown note");
remote["text"] = "other";
Check(ReceiptVerifier.Verify("PUT", "/api/v1/note-entries/" + id, requestBody, receipt, remote, "{}").Outcome == ReconciliationOutcome.Conflict, "mismatched entity hash never confirms");
receipt["found"] = false;
Check(ReceiptVerifier.Verify("PUT", "/api/v1/note-entries/" + id, requestBody, receipt, remote, "{}").Outcome == ReconciliationOutcome.Unconfirmed, "missing receipt never authorizes retry");

var reconcileCalls = 0;
using (var api = new WorkbenchApi(new FakeHandler(request =>
{
    reconcileCalls++;
    Check(request.Method == HttpMethod.Get, "reconciliation only reads");
    return Task.FromResult(request.RequestUri!.AbsolutePath.EndsWith("/index") ? Json(Index(scope)) : Json("{\"data\":{\"found\":false}}"));
})))
{
    api.BindScope(scope);
    var result = await api.ReconcileAsync("PUT", "/api/v1/note-entries/" + id, requestBody.ToJsonString());
    Check(result.Outcome == ReconciliationOutcome.Unconfirmed && reconcileCalls == 2, "missing receipt stops read-only reconciliation without replay");
}

var todoBody = ApiRequests.CreateTodo(id, "2026-11-04", "text").BodyJson;
await Throws<JsonException>(() => { MutationVerifier.Validate("POST", "/api/v1/todos", todoBody, new JsonObject()); return Task.CompletedTask; }, "2xx empty entity never confirms a mutation");
await Throws<JsonException>(() => { MutationVerifier.Validate("POST", "/api/v1/todos", todoBody, JsonNode.Parse("{\"id\":\"" + id + "\",\"version\":1,\"date\":\"2026-11-04\",\"text\":\"other\"}")); return Task.CompletedTask; }, "2xx different body never confirms a mutation");
await Throws<JsonException>(() => { MutationVerifier.Validate("POST", "/api/v1/todos", todoBody, JsonNode.Parse("{\"id\":\"" + id + "\",\"version\":2,\"date\":\"2026-11-04\",\"text\":\"text\"}")); return Task.CompletedTask; }, "newer replay response stays unconfirmed");
MutationVerifier.Validate("DELETE", "/api/v1/todo-templates/" + id, "{\"version\":1}", JsonNode.Parse("{\"id\":\"" + id + "\",\"deleted\":true}"));
Check(true, "template delete legitimate success has no version");
MutationVerifier.Validate("PUT", "/api/v1/work-reminders/" + id, "{\"date\":\"2026-11-04\",\"source_key\":\"synthetic\",\"summary\":\"same\",\"version\":2,\"save_id\":\"" + saveId + "\"}", JsonNode.Parse("{\"id\":\"" + id + "\",\"date\":\"2026-11-04\",\"source_key\":\"synthetic\",\"summary\":\"same\",\"version\":2}"));
Check(true, "reminder unchanged-content no-op version accepted");
MutationVerifier.Validate("POST", "/api/v1/todos/" + id + "/template", "{\"date\":\"2026-11-04\",\"version\":1,\"template_id\":\"" + saveId + "\",\"template_version\":0}", JsonNode.Parse("{\"todo\":{\"id\":\"" + id + "\",\"date\":\"2026-11-04\",\"version\":2,\"text\":\"text\",\"template_id\":\"" + saveId + "\",\"template_version\":1,\"template_active\":true},\"template\":{\"id\":\"" + saveId + "\",\"version\":1,\"text\":\"text\"}}"));
Check(true, "add-template validates actual nested response");
MutationVerifier.Validate("PUT", "/api/v1/articles/" + id,
    "{\"version\":1,\"title\":\" title \",\"summary\":\" summary \",\"notes\":\" notes \",\"url\":\"https://EXAMPLE.test:443/path#frag\",\"published_at\":\"2026-11-04T08:00:00.1234567+08:00\"}",
    JsonNode.Parse("{\"id\":\"" + id + "\",\"version\":2,\"title\":\"title\",\"summary\":\"summary\",\"notes\":\"notes\",\"url\":\"https://example.test/path\",\"published_at\":\"2026-11-04T00:00:00.123Z\"}"));
Check(true, "article timestamps/url/trim follow server normalization");

var reviewLists = new Dictionary<string, string>
{
    ["overview"] = "account=V%E5%AD%97&range=7d&week=this",
    ["articles"] = "offset=0&read_revision=4&account=V%E5%AD%97&from=2026-11-01&to=2026-11-04&verdict=pending",
    ["snapshots"] = "offset=0&read_revision=4&account=V%E5%AD%97&article_id=" + id,
    ["reports"] = "offset=0&read_revision=4&account=V%E5%AD%97&period_type=weekly&from=2026-11-01&to=2026-11-04",
    ["playbooks"] = "offset=0&read_revision=4&account=V%E5%AD%97",
    ["benchmark-accounts"] = "offset=0&read_revision=4&include_deleted=0&account=V%E5%AD%97&platform=toutiao",
    ["benchmark-articles"] = "offset=0&read_revision=4&include_deleted=0&account=V%E5%AD%97&benchmark_account_id=" + id + "&collected_on=2026-11-04&sort=reads",
    ["notes"] = "offset=0&read_revision=4&include_deleted=0&account=V%E5%AD%97&from=2026-11-01&to=2026-11-04&kind=insight",
    ["account-health"] = "offset=0&read_revision=4&include_deleted=0&account=V%E5%AD%97&platform=toutiao&from=2026-11-01&to=2026-11-04"
};
using (var api = new WorkbenchApi(new FakeHandler(request =>
{
    var route = request.RequestUri!.AbsolutePath;
    var payload = route.EndsWith("/overview", StringComparison.Ordinal) ? "{\"data\":{\"account\":\"V字\",\"current\":{},\"changes\":{},\"trend\":[],\"summary\":\"synthetic\"}}" :
        route.Split('/').Length == 6 ? ReadSchemaTests.CapturedReviewDetail(route.Split('/')[4], id, scope) : "{\"data\":{\"items\":[],\"has_more\":false,\"read_revision\":0}}";
    return Task.FromResult(Json(payload));
})))
{
    foreach (var pair in reviewLists)
    {
        await api.GetDataAsync("/api/v1/review/" + pair.Key + "?" + pair.Value);
        Check(true, "review exact list query allowed: " + pair.Key);
        if (pair.Key != "overview")
        {
            await api.GetDataAsync("/api/v1/review/" + pair.Key + "/" + id);
            Check(true, "review stable UUID detail allowed: " + pair.Key);
        }
    }
    foreach (var wrong in new[] { "articles?include_deleted=1", "snapshots?from=2026-11-04", "reports?verdict=pending", "playbooks?period_type=weekly", "notes?platform=toutiao", "overview?offset=0", "articles/" + id + "?account=wrong" })
        await Throws<ArgumentException>(() => api.GetDataAsync("/api/v1/review/" + wrong), "reject review query outside resource contract: " + wrong);
    await Throws<ArgumentException>(() => api.SendAsync("DELETE", "/api/v1/review/articles/" + id, "{}", saveId), "permanent review delete is not exposed");
    await Throws<ArgumentException>(() => api.SendAsync("PUT", "/api/v1/review/snapshots:batch", "{}", saveId), "review batch is not exposed");
    await Throws<ArgumentException>(() => api.SendAsync("PATCH", "/api/v1/review/rules/rule1", "{}", saveId), "review rule mutation is not exposed");
    await Throws<ArgumentException>(() => api.SendAsync("PUT", "/api/v1/review/articles/" + id.ToUpperInvariant(), "{}", saveId), "review IDs require exact lowercase UUID");
    await Throws<Haoduoyu.Core.RequestNotSentException>(() => api.SendAsync("PATCH", "/api/v1/review/articles/" + id, "{\"title\":\"text\"}", saveId), "review patch missing expected hash blocked before request");
}

var reviewBody = new JsonObject { ["title"] = " title ", ["account"] = "V字", ["platform"] = "toutiao", ["url"] = "https://EXAMPLE.test/path#kept", ["published_at"] = "2026-11-04T08:00:00+08:00" };
var reviewResponse = new JsonObject { ["id"] = id, ["title"] = "title", ["account"] = "V字", ["platform"] = "toutiao", ["url"] = "https://EXAMPLE.test/path#kept", ["published_at"] = "2026-11-04T00:00:00.000Z", ["content_hash"] = scope };
MutationVerifier.Validate("PUT", "/api/v1/review/articles/" + id, reviewBody.ToJsonString(), reviewResponse);
Check(true, "review stable UUID create verifies normalized text/time and preserves source URL");
reviewBody["expected_hash"] = scope;
MutationVerifier.Validate("PATCH", "/api/v1/review/articles/" + id, reviewBody.ToJsonString(), reviewResponse);
Check(true, "review hash CAS accepts documented unchanged-content no-op without version increment");
reviewResponse["id"] = saveId;
await Throws<JsonException>(() => { MutationVerifier.Validate("PATCH", "/api/v1/review/articles/" + id, reviewBody.ToJsonString(), reviewResponse); return Task.CompletedTask; }, "review wrong response entity never confirms");
reviewResponse["id"] = id; reviewResponse["content_hash"] = "bad-hash";
await Throws<JsonException>(() => { MutationVerifier.Validate("PATCH", "/api/v1/review/articles/" + id, reviewBody.ToJsonString(), reviewResponse); return Task.CompletedTask; }, "review missing valid content hash never confirms");
reviewResponse["content_hash"] = scope; reviewResponse["title"] = "other";
await Throws<JsonException>(() => { MutationVerifier.Validate("PATCH", "/api/v1/review/articles/" + id, reviewBody.ToJsonString(), reviewResponse); return Task.CompletedTask; }, "review mismatched saved field never confirms");
await Throws<JsonException>(() => { MutationVerifier.Validate("PUT", "/api/v1/review/notes/" + id, "{\"title\":\"text\"}", new JsonObject { ["id"] = id, ["title"] = "text", ["content_hash"] = scope, ["deleted_at"] = "2026-11-04T00:00:00.000Z" }); return Task.CompletedTask; }, "review deleted resource never confirms a save");

var labelTime = "2026-11-04T00:00:00.000Z";
MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"synthetic\",\"action\":\"archive\"}", new JsonObject { ["name"] = "synthetic", ["archived_at"] = labelTime });
Check(true, "label archive requires a returned archive timestamp");
MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"synthetic\",\"action\":\"restore\"}", new JsonObject { ["name"] = "synthetic", ["archived_at"] = null });
Check(true, "label restore requires explicit cleared archive timestamp");
MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"synthetic\",\"action\":\"delete\"}", new JsonObject { ["name"] = "synthetic", ["deleted"] = true, ["mode"] = "deleted" });
Check(true, "custom label delete checks deleted result and mode");
MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"生活\",\"action\":\"delete\"}", new JsonObject { ["name"] = "生活", ["deleted"] = true, ["mode"] = "builtin-hidden" });
Check(true, "built-in label delete checks hidden mode");
await Throws<JsonException>(() => { MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"synthetic\",\"action\":\"archive\"}", new JsonObject { ["name"] = "synthetic", ["archived_at"] = null }); return Task.CompletedTask; }, "label name alone cannot confirm archive");
await Throws<JsonException>(() => { MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"synthetic\",\"action\":\"restore\"}", new JsonObject { ["name"] = "synthetic" }); return Task.CompletedTask; }, "missing archive state cannot confirm restore");
await Throws<JsonException>(() => { MutationVerifier.Validate("POST", "/api/v1/note-entries/labels", "{\"name\":\"synthetic\",\"action\":\"delete\"}", new JsonObject { ["name"] = "synthetic", ["deleted"] = false, ["mode"] = "deleted" }); return Task.CompletedTask; }, "label name alone cannot confirm delete");

passed += await ReadSchemaTests.RunAsync();
passed += await AiReportTests.RunAsync();
Console.WriteLine($"API transport: {passed} assertions passed; all HTTP handlers synthetic, no production data requests.");

sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> respond) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => respond(request);
}
