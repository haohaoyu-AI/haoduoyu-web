using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class TodoNoteContract
{
    private const string Scope = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string Cookie = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    private const string Csrf = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    private const string Operation = "123e4567-e89b-42d3-a456-426614174001";
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject(); var checks = 0;
        void Check(bool condition, string name) { if (!condition) throw new InvalidDataException(name); checks++; Console.WriteLine("PASS todo note contract " + name); }
        Check(fixture["source_commit"]!.GetValue<string>() == "34bff302e128c92f46f00e76d59f9b44b9b7242e" && fixture["synthetic_only"]!.GetValue<bool>() &&
            fixture["external_fetch_attempts"]!.GetValue<int>() == 0 && fixture["production_business_requests"]!.GetValue<int>() == 0, "exact candidate and isolated synthetic database");
        var owner = fixture["users"]!["owner"]!.GetValue<string>(); var id = fixture["ids"]!["todo"]!.GetValue<string>();
        var samples = fixture["samples"]!.AsArray().Select(value => value!.AsObject()).ToArray();
        JsonObject Sample(string name) => samples.Single(row => row["name"]!.GetValue<string>() == name);
        JsonObject Envelope(string name) => JsonNode.Parse(Sample(name)["response_json"]!.GetValue<string>())!.AsObject();
        JsonObject Data(string name) => Envelope(name)["data"]!.AsObject();
        var businessReplays = 0; var localRejections = 0; var reads = 0; var successWrites = 0; var deniedResponses = 0; var noteResponses = 0; var scopeReads = 0;
        foreach (var sample in samples)
        {
            var name = sample["name"]!.GetValue<string>(); var method = sample["method"]!.GetValue<string>(); var route = sample["path"]!.GetValue<string>();
            var body = sample["body_json"]?.GetValue<string>(); var json = sample["response_json"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            if (sample["expected_no_change"]!.GetValue<bool>()) Check(JsonNode.DeepEquals(sample["before"], sample["after"]), "real source read, denial or conditional replay preserves recorded state: " + name);
            var replayOwner = fixture["additional_runtimes"]?.AsArray().FirstOrDefault(runtime => runtime?["id"]?.GetValue<string>() == sample["source_runtime_id"]?.GetValue<string>())?["owner"]?.GetValue<string>() ?? owner;
            var handler = new Capture(replayOwner, method, route, body, json, status); using var api = new WorkbenchApi(handler);
            var validRequest = true;
            try { RoutePolicy.Validate(method, route, false); if (Note(method, route)) TodoNoteMutationVerifier.ValidateRequest(route, body); }
            catch (ArgumentException) { validRequest = false; }
            if (!validRequest)
            {
                var denied = false; try { await api.SendAsync(method, route, body, method == "GET" ? "" : Operation); } catch (ArgumentException) { denied = true; }
                Check(status is 400 or 404 && denied && handler.Calls == 0, "source independently rejects invalid input; desktop rejects before HTTP: " + name);
                localRejections++; continue;
            }
            await Authenticate(api, replayOwner); api.BindScope(Scope);
            var result = await api.SendAsync(method, route, body, method == "GET" ? "" : Operation);
            Check(result.StatusCode == status && result.Json == json && handler.BusinessCalls == 1 && handler.ScopeCalls == (method == "GET" ? 0 : 1),
                "captured source payload passes fixed-origin authenticated transport unchanged: " + name);
            businessReplays++; scopeReads += handler.ScopeCalls;
            if (status is >= 200 and < 300)
            {
                if (method == "GET")
                {
                    reads++;
                    if (route.Contains("?date=", StringComparison.Ordinal))
                    {
                        TodoNotes.ValidateList(route, json);
                        Check(JsonNode.DeepEquals(WorkbenchApi.DataOrThrow(result), JsonNode.Parse(json)!["data"]), "raw original-day inspector accepts complete source without projecting or rewriting: " + name);
                    }
                }
                else
                {
                    successWrites++;
                    if (Note(method, route))
                    {
                        var request = JsonNode.Parse(body!)!.AsObject(); var command = ApiRequests.TodoNote(route.Split('/')[4], request["version"]!.GetValue<long>(), request["note"]!.GetValue<string>());
                        Check(command.Method == method && command.Path == route && command.Body.Count == 2 && JsonNode.DeepEquals(command.Body, request), "strict shared builder preserves exact note and version: " + name);
                        noteResponses++;
                    }
                }
            }
            else { deniedResponses++; Check(JsonNode.Parse(json)?["error"] is JsonObject && !api.PublicMode && api.UserId == replayOwner, "source error remains error and does not switch local identity to public: " + name); }
        }
        Check(samples.Length == 82 && businessReplays == 49 && localRejections == 33 && reads == 11 && successWrites == 23 && deniedResponses == 15 && noteResponses == 15 && scopeReads == 38,
            "82 real captures split into 49 native business replays and 33 pre-HTTP input rejections");
        var original = Data("owner-create-linked-todo"); var saved = Data("owner-save-v1"); var clear = Data("owner-clear-v3");
        var exact = JsonNode.Parse(Sample("owner-save-v1")["body_json"]!.GetValue<string>())!["note"]!.GetValue<string>();
        Check(saved["note"]!.GetValue<string>() == exact && exact.Contains("\r\n", StringComparison.Ordinal) && exact.StartsWith("  ", StringComparison.Ordinal) && exact.Contains("e\u0301", StringComparison.Ordinal), "wire note preserves CRLF, whitespace and decomposed Unicode exactly");
        Check(!clear.ContainsKey("note") && clear["version"]!.GetValue<int>() == 4 && !Data("owner-clear-replay-v3").ContainsKey("note"), "clear and conditional clear replay omit the note field and still confirm exact empty request");
        Check(Data("owner-whitespace-v4")["note"]!.GetValue<string>() == " \t\r\n " && Data("owner-limit4000-v5")["note"]!.GetValue<string>().Length == 4000,
            "whitespace-only and 4000 UTF16 notes are valid without trimming or byte-based truncation");
        foreach (var field in new[] { "id", "text", "date", "completed", "template_id" })
            Check(JsonNode.DeepEquals(saved[field], original[field]), "normal note save preserves original " + field);
        Check(Data("owner-same-text-current-v2")["version"]!.GetValue<int>() == 3 && Data("owner-replay-v1")["version"]!.GetValue<int>() == 2 &&
            JsonNode.DeepEquals(Sample("owner-replay-v1")["before"], Sample("owner-replay-v1")["after"]), "current-version same text advances version; previous-version exact retry is a no-write response");
        var afterArchive = Data("owner-note-after-template-archive-v11");
        Check(afterArchive["template_id"]!.GetValue<string>() == fixture["ids"]!["template"]!.GetValue<string>() && afterArchive["template_active"]!.GetValue<bool>() == false && afterArchive["template_version"]!.GetValue<int>() == 2,
            "same template link remains while separately archived template status legitimately updates");
        foreach (var name in new[] { "different", "identical" })
            Check(fixture["concurrency"]![name]!["after"]!["revision"]!.GetValue<long>() == fixture["concurrency"]![name]!["before"]!["revision"]!.GetValue<long>() + 1,
                "real concurrent " + name + " note requests produce exactly one commit; per-request global digests are not misrepresented as isolated");
        var completionReplay = Data("note-replay-after-other-write");
        Check(completionReplay["completed"]!.GetValue<bool>() && completionReplay["version"]!.GetValue<int>() == 2 && JsonNode.DeepEquals(completionReplay, Data("concurrent-completion-before-note-replay")),
            "real conditional note replay accepts current completion legitimately changed by another same-resource write");
        Check(JsonNode.DeepEquals(Sample("note-replay-after-other-write")["before"], Sample("note-replay-after-other-write")["after"]),
            "that legitimate complete-record replay makes no second revision/audit/receipt/business change");

        var malformed = new List<(string Name, string Source, JsonObject Envelope)>();
        void Change(string name, string source, Action<JsonObject> change) { var root = Envelope(source); change(root["data"]!.AsObject()); malformed.Add((name, source, root)); }
        Change("wrong UUID", "owner-save-v1", row => row["id"] = fixture["ids"]!["other_todo"]!.DeepClone());
        Change("same version is not note success", "owner-save-v1", row => row["version"] = 1);
        Change("version jumps twice", "owner-save-v1", row => row["version"] = 3);
        Change("null note after clear", "owner-clear-v3", row => row["note"] = null);
        Change("missing nonempty note", "owner-save-v1", row => row.Remove("note"));
        Change("trimmed nonempty note", "owner-save-v1", row => row["note"] = exact.Trim());
        Change("normalized line endings", "owner-save-v1", row => row["note"] = exact.Replace("\r\n", "\n", StringComparison.Ordinal));
        Change("normalized Unicode", "owner-save-v1", row => row["note"] = exact.Normalize());
        Change("non-string note", "owner-save-v1", row => row["note"] = 7);
        Change("missing original date", "owner-save-v1", row => row.Remove("date"));
        Change("invalid original date", "owner-save-v1", row => row["date"] = "2026-02-30");
        Change("missing original text", "owner-save-v1", row => row.Remove("text"));
        Change("missing completion state", "owner-save-v1", row => row.Remove("completed"));
        Change("string completion state", "owner-save-v1", row => row["completed"] = "false");
        Change("missing deletion state", "owner-save-v1", row => row.Remove("deleted_at"));
        Change("deleted record", "owner-save-v1", row => row["deleted_at"] = "2026-11-07T00:00:00Z");
        Change("missing created stamp", "owner-save-v1", row => row.Remove("created_at"));
        Change("partial template link", "owner-save-v1", row => row.Remove("template_active"));
        Change("invalid template version", "owner-save-v1", row => row["template_version"] = 0);
        Change("string version", "owner-save-v1", row => row["version"] = "2");
        Change("local partial projection", "owner-save-v1", row => row["_local_incomplete"] = true);
        foreach (var bad in malformed)
        {
            var sample = Sample(bad.Source); var route = sample["path"]!.GetValue<string>(); var body = sample["body_json"]!.GetValue<string>();
            var handler = new Capture(owner, "PATCH", route, body, bad.Envelope.ToJsonString(), 200); using var api = new WorkbenchApi(handler); await Authenticate(api, owner); api.BindScope(Scope);
            var denied = false; try { await api.SendAsync("PATCH", route, body, Operation); } catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
            Check(denied && handler.BusinessCalls == 1, "malformed HTTP 200 remains unconfirmed and cannot clear pending intent: " + bad.Name);
        }
        foreach (var kind in new[] { "null", "number", "control", "overlong" })
        {
            var root = Envelope("owner-after-save-get"); var row = root["data"]!["items"]![0]!;
            row["note"] = kind switch { "null" => null, "number" => JsonValue.Create(1), "control" => JsonValue.Create("\0"), _ => JsonValue.Create(new string('中', 4001)) };
            var route = Sample("owner-after-save-get")["path"]!.GetValue<string>();
            var handler = new Capture(owner, "GET", route, null, root.ToJsonString(), 200); using var api = new WorkbenchApi(handler); await Authenticate(api, owner);
            var denied = false; try { await api.SendAsync("GET", route, null, ""); } catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
            Check(denied, "malformed dated todo note is rejected before caller cache replacement: " + kind);
        }
        var rawRoute = Sample("owner-save-v1")["path"]!.GetValue<string>(); var rawBody = Sample("owner-save-v1")["body_json"]!.GetValue<string>();
        var unknownHandler = new Capture(owner, "PATCH", rawRoute, rawBody, Sample("owner-save-v1")["response_json"]!.GetValue<string>(), 200);
        using (var api = new WorkbenchApi(unknownHandler))
        {
            var outcome = await api.ReconcileAsync("PATCH", rawRoute, rawBody);
            Check(outcome.Outcome == ReconciliationOutcome.Unconfirmed && outcome.RemoteJson is null && unknownHandler.Calls == 0, "todo note has no exact-operation receipt, performs zero HTTP and cannot auto-confirm from current content");
        }
        foreach (var scenario in new[] { "fresh public", "explicit public after session", "expired cookie after authentication", "cookie expires during scope check", "scope changed", "cancelled before send" })
        {
            var handler = new Capture(owner, "PATCH", rawRoute, rawBody, Sample("owner-save-v1")["response_json"]!.GetValue<string>(), 200); using var api = new WorkbenchApi(handler);
            if (scenario == "expired cookie after authentication") handler.ExpireOnMe = true;
            if (scenario != "fresh public") await Authenticate(api, owner);
            if (scenario == "explicit public after session") api.UsePublicMode();
            if (scenario == "cookie expires during scope check") handler.ExpireOnScope = true;
            if (scenario == "scope changed") handler.ReturnedScope = new string('b', 64);
            api.BindScope(Scope); var before = handler.Calls; var rejected = false;
            using var cancellation = new CancellationTokenSource(); if (scenario == "cancelled before send") cancellation.Cancel();
            try { await api.SendAsync("PATCH", rawRoute, rawBody, Operation, cancellation.Token); }
            catch (Exception error) when (error is RequestNotSentException or OperationCanceledException) { rejected = true; }
            Check(rejected && handler.BusinessCalls == 0 && ((scenario is "fresh public" or "explicit public after session" or "expired cookie after authentication" or "cancelled before send") ? handler.Calls == before : handler.ScopeCalls == 1),
                "private-only guard protects original request with no business write: " + scenario);
        }
        foreach (var spelling in new[] { "1.0", "1e0" })
        {
            var body = "{\"note\":" + JsonSerializer.Serialize(exact) + ",\"version\":" + spelling + "}";
            TodoNoteMutationVerifier.ValidateRequest(rawRoute, body);
            MutationVerifier.Validate("PATCH", rawRoute, body, saved);
            Check(true, "synthetic lexical compatibility follows Number.isSafeInteger for " + spelling);
        }
        var duplicate = "{\"note\":\"\",\"version\":1,\"version\":2}"; var duplicateDenied = false;
        try { TodoNoteMutationVerifier.ValidateRequest(rawRoute, duplicate); } catch (ArgumentException) { duplicateDenied = true; }
        Check(duplicateDenied, "duplicate JSON fields are rejected before HTTP");
        var malformedRaw = "{\"note\":\"" + '\ud800' + "\",\"version\":1}";
        var malformedRawHandler = new Capture(owner, "PATCH", rawRoute, malformedRaw, "{}", 200);
        using (var api = new WorkbenchApi(malformedRawHandler))
        {
            var denied = false; try { await api.SendAsync("PATCH", rawRoute, malformedRaw, Operation); } catch (ArgumentException) { denied = true; }
            Check(denied && malformedRawHandler.Calls == 0, "ill-formed raw UTF16 request is rejected before any JSON/HTTP encoder can replace its bytes");
        }
        Check(ApiRequests.TodoNote(id, 1, exact).Body["note"]!.GetValue<string>() == exact && ApiRequests.TodoNote(id, 1, "").Body["note"]!.GetValue<string>() == "", "builder keeps exact original string and explicit empty clear");
        var unknown = fixture["unknown_operation"]!;
        Check(unknown["status"]!.GetValue<string>() == "Unknown" && unknown["retries"]!.GetValue<int>() == 0 && Sample("unknown-note-v12-simulated-response-loss")["simulated_response_not_delivered_to_caller"]!.GetValue<bool>(),
            "lost acknowledgement is explicitly simulated; current GET does not change Unknown or retry identity");
        Console.WriteLine($"Todo note source contract: {samples.Length} actual Worker captures; {businessReplays} native business HTTP replays ({reads} reads/{successWrites} successful mutations/{deniedResponses} source errors), {localRejections} native pre-HTTP rejections, {noteResponses} dedicated note successes, {malformed.Count} malformed HTTP 200 rejections, {checks} checks passed; zero production or external requests.");
    }
    private static bool Note(string method, string path) => method == "PATCH" && path.EndsWith("/note", StringComparison.Ordinal);
    private static Task<SessionInfo> Authenticate(WorkbenchApi api, string owner) => api.RestoreSessionAsync(new SessionMaterial(Cookie, DateTimeOffset.UtcNow.AddDays(1), owner, "synthetic-owner"));
    private sealed class Capture(string owner, string method, string path, string? body, string json, int status) : HttpMessageHandler
    {
        internal int Calls { get; private set; }
        internal int BusinessCalls { get; private set; }
        internal int ScopeCalls { get; private set; }
        internal bool ExpireOnScope { get; set; }
        internal bool ExpireOnMe { get; set; }
        internal string ReturnedScope { get; set; } = Scope;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); Calls++;
            if (request.RequestUri!.GetLeftPart(UriPartial.Authority) != "https://haoduoyu.xyz" || request.Headers.GetValues("Origin").Single() != "https://haoduoyu.xyz" ||
                request.Headers.Contains("Authorization") || request.Headers.Contains("X-Public-Business") || request.Headers.GetValues("Cookie").Single() != "matrix_session=" + Cookie)
                throw new InvalidDataException("Unexpected origin, cookie, public fallback or Authorization in private synthetic transport.");
            if (request.RequestUri.PathAndQuery == "/api/v1/auth/me")
            {
                var response = Json(new JsonObject { ["data"] = new JsonObject { ["id"] = owner, ["username"] = "synthetic-owner", ["csrfToken"] = Csrf } }.ToJsonString(), 200);
                if (ExpireOnMe) response.Headers.Add("Set-Cookie", "matrix_session=; Path=/; Secure; HttpOnly; Expires=Sat, 01 Jan 2000 00:00:00 GMT");
                return response;
            }
            if (request.RequestUri.PathAndQuery == "/api/v1/workbench-snapshot/index?version=2")
            {
                ScopeCalls++; if (request.Method != HttpMethod.Get || request.Content != null || request.Headers.Contains("Idempotency-Key")) throw new InvalidDataException("Unsafe scope probe.");
                var response = Json("{\"data\":{\"complete\":true,\"scope_id\":\"" + ReturnedScope + "\"}}", 200);
                if (ExpireOnScope) response.Headers.Add("Set-Cookie", "matrix_session=; Path=/; Secure; HttpOnly; Expires=Sat, 01 Jan 2000 00:00:00 GMT");
                return response;
            }
            BusinessCalls++;
            if (request.Method.Method != method || request.RequestUri.PathAndQuery != path || (request.Content == null ? null : await request.Content.ReadAsStringAsync(token)) != body ||
                (method == "GET" ? request.Headers.Contains("Idempotency-Key") : request.Headers.GetValues("Idempotency-Key").Single() != Operation || request.Headers.GetValues("X-CSRF-Token").Single() != Csrf))
                throw new InvalidDataException("Original private request method/path/body/operation/CSRF changed.");
            return Json(json, status);
        }
        private static HttpResponseMessage Json(string value, int code) => new((HttpStatusCode)code) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
    }
}
