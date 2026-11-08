using System.Net;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class TemplateArchiveContract
{
    private const string Scope = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string OperationId = "123e4567-e89b-42d3-a456-426614174001";
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        var checks = 0; var reads = 0; var mutations = 0; var denials = 0; var localRejections = 0; var archiveResponses = 0;
        void Check(bool condition, string name)
        { if (!condition) throw new InvalidDataException(name); checks++; Console.WriteLine("PASS template archive contract " + name); }
        Check(fixture["source_commit"]?.GetValue<string>() == "34bff302e128c92f46f00e76d59f9b44b9b7242e" &&
            fixture["synthetic_only"]?.GetValue<bool>() == true && fixture["production_business_requests"]?.GetValue<int>() == 0 &&
            fixture["external_fetch_attempts"]?.GetValue<int>() == 0, "exact reviewed candidate source and isolated synthetic database");
        var samples = fixture["samples"]!.AsArray().Select(item => item!.AsObject()).ToArray();
        JsonObject Sample(string name) => samples.Single(row => row["name"]!.GetValue<string>() == name);
        JsonObject Envelope(string name) => JsonNode.Parse(Sample(name)["response_json"]!.GetValue<string>())!.AsObject();
        JsonObject Data(string name) => Envelope(name)["data"]!.AsObject();
        foreach (var sample in samples)
        {
            var name = sample["name"]!.GetValue<string>(); var method = sample["method"]!.GetValue<string>();
            var route = sample["path"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            var body = sample["body_json"]?.GetValue<string>(); var json = sample["response_json"]!.GetValue<string>();
            if (sample["expected_no_change"]!.GetValue<bool>())
                Check(JsonNode.DeepEquals(sample["before"], sample["after"]), "real GET, denial or replay preserves business/control/audit/receipt state: " + name);
            var handler = new CapturedTransport(method, route, body, json, status);
            using var api = new WorkbenchApi(handler); api.BindScope(Scope);
            var allowed = true;
            try { RoutePolicy.Validate(method, route, allowAuthWrite: false); }
            catch (ArgumentException) { allowed = false; }
            if (!allowed)
            {
                var rejected = false;
                try { await api.SendAsync(method, route, body, method == "GET" ? "" : OperationId); }
                catch (ArgumentException) { rejected = true; }
                Check(status == 400 && rejected && handler.Calls == 0, "invalid native query/path is stopped before HTTP; source independently returned 400: " + name);
                localRejections++; continue;
            }
            var result = await api.SendAsync(method, route, body, method == "GET" ? "" : OperationId);
            Check(result.StatusCode == status && result.Json == json && handler.BusinessCalls == 1 && handler.Calls == (method == "GET" ? 1 : 2),
                "captured source envelope passes actual fixed-origin desktop transport unchanged: " + name);
            if (status is >= 200 and < 300)
            {
                if (method == "GET")
                {
                    reads++;
                    if (route.Split('?')[0] == TemplateArchive.ListPath(false))
                    {
                        var list = TemplateArchive.ParseList(route, json);
                        Check(JsonNode.DeepEquals(list.Data, JsonNode.Parse(json)!["data"]), "shared template parser retains complete source list: " + name);
                    }
                }
                else
                {
                    mutations++;
                    if (route.EndsWith("/archive", StringComparison.Ordinal) || route.EndsWith("/restore", StringComparison.Ordinal))
                    {
                        var request = JsonNode.Parse(body!)!.AsObject(); var id = route.Split('/')[4];
                        var command = ApiRequests.TemplateArchive(id, request["version"]!.GetValue<long>(), route.EndsWith("/archive", StringComparison.Ordinal));
                        Check(command.Method == method && command.Path == route && JsonNode.DeepEquals(command.Body, request) && command.Body.Count == 1,
                            "actual strict builder regenerates captured version-only request: " + name);
                        archiveResponses++;
                    }
                }
            }
            else
            {
                Check(JsonNode.Parse(json)?["error"] is JsonObject, "captured source denial remains an error, not a success or empty list: " + name);
                denials++;
            }
        }
        Check(samples.Length == 89 && localRejections == 6 && reads >= 20 && archiveResponses >= 12 && denials >= 30,
            "all 89 exact-source responses covered, including native pre-HTTP query/path restrictions");
        var target = fixture["ids"]!["template"]!.GetValue<string>();
        var keep = fixture["ids"]!["keep_active"]!.GetValue<string>(); var todo = fixture["ids"]!["todo"]!.GetValue<string>();
        var active = Data("owner-paired-active"); var archived = Data("owner-paired-archived");
        Check(active["items"]!.AsArray().Any(row => row!["id"]!.GetValue<string>() == keep) && active["items"]!.AsArray().All(row => row!["id"]!.GetValue<string>() != target) &&
            archived["items"]!.AsArray().Single()!["id"]!.GetValue<string>() == target, "independent active and archived memberships retain different templates");
        foreach (var name in new[] { "owner-paired-active", "owner-paired-archived", "owner-archived-before" })
        {
            var sample = Sample(name); var listPath = sample["path"]!.GetValue<string>(); var cached = Envelope(name);
            cached["_local_complete"] = true; cached["_local_scope_id"] = "synthetic-local-partition";
            cached["_local_template_archive"] = new JsonObject { ["query_path"] = listPath, ["scope_id"] = "synthetic-local-partition",
                ["service_scope_id"] = Scope, ["observed_at_utc"] = "2026-11-07T03:00:00.000Z" };
            Check(JsonNode.DeepEquals(TemplateArchive.ParseCachedList(listPath, cached.ToJsonString(), "synthetic-local-partition").Data, Data(name)),
                "separate cached parser retains exact-source full or empty membership and distinct local/service provenance: " + name);
            var denied = false;
            using (var api = new WorkbenchApi(new CapturedTransport("GET", listPath, null, cached.ToJsonString(), 200)))
                try { await api.SendAsync("GET", listPath, null, ""); } catch (ApiCallException) { denied = true; }
            Check(denied, "actual transport does not accept cached completeness metadata from the network: " + name);
        }
        var history = Data("owner-history-after-archive")["items"]!.AsArray().Single(row => row!["id"]!.GetValue<string>() == todo)!;
        Check(history["template_id"]!.GetValue<string>() == target && history["template_active"]!.GetValue<bool>() == false &&
            history["completed"]!.GetValue<bool>() && history["text"]!.GetValue<string>() == "必须保留的合成历史正文", "archive retains completed history text and inactive original link");
        var snapshot = Data("owner-daily-snapshot-excludes-archive")["data"]!;
        Check(snapshot["templates"]!.AsArray().All(row => row!["id"]!.GetValue<string>() != target) &&
            snapshot["todos"]!.AsArray().Any(row => row!["id"]!.GetValue<string>() == todo), "snapshot omits archived template and retains history; omission is not a delete receipt");
        foreach (var name in new[] { "owner-archive-noop-old-v1", "owner-archive-noop-current-v2", "owner-restore-noop-old-v2", "owner-restore-noop-current-v3" })
            Check(JsonNode.DeepEquals(Sample(name)["before"], Sample(name)["after"]) && !Data(name).ContainsKey("deleted_at"), "same-status version replay is read-only and distinct from soft delete: " + name);
        Check(Data("owner-archive-noop-current-v2")["version"]!.GetValue<int>() == 2 && Data("owner-restore-noop-current-v3")["version"]!.GetValue<int>() == 3,
            "successful unchanged-version archive and restore responses pass dedicated mutation verifier");
        Check(fixture["concurrent_archive"]!["after"]!["revision"]!.GetValue<long>() == fixture["concurrent_archive"]!["before"]!["revision"]!.GetValue<long>() + 1 &&
            Data("concurrent-archive-a")["version"]!.GetValue<int>() == 6 && JsonNode.DeepEquals(Data("concurrent-archive-a"), Data("concurrent-archive-b")),
            "two concurrent identical source archives commit once and return the same full record");
        Check(fixture["public_requests"]!.GetValue<int>() == 10 && fixture["public_write_attempts"]!.GetValue<int>() == 8 &&
            fixture["checks"]!.AsArray().Count == 13, "normal permission and limiter contract retained without quota or constraint changes");

        foreach (var version in new long[] { -1, 0, 9_007_199_254_740_991, long.MaxValue })
        {
            var denied = false; try { _ = ApiRequests.TemplateArchive(target, version); } catch (ArgumentException) { denied = true; }
            Check(denied, "strict native builder rejects invalid version " + version);
        }
        foreach (var id in new[] { "00000000-0000-0000-0000-000000000000", target.Replace("-", ""), "not-a-uuid" })
        {
            var denied = false; try { _ = ApiRequests.TemplateArchive(id, 1); } catch (ArgumentException) { denied = true; }
            Check(denied, "strict native builder rejects unsupported UUID shape " + id);
        }
        Check(ApiRequests.TemplateArchive(target.ToUpperInvariant(), 9_007_199_254_740_990).Body["version"]!.GetValue<long>() == 9_007_199_254_740_990,
            "highest source-accepted request version is retained exactly with canonical UUID");
        Check(ApiRequests.DeleteTemplate(target, 1).Method == "DELETE" && ApiRequests.DeleteTemplate(target, 1).Path == "/api/v1/todo-templates/" + target,
            "legacy soft delete remains a separate explicitly selected operation");

        var malformed = new List<(string Name, string Source, JsonObject Envelope)>();
        void Change(string name, string source, Action<JsonObject> change)
        { var envelope = Envelope(source); change(envelope["data"]!.AsObject()); malformed.Add((name, source, envelope)); }
        Change("wrong entity UUID", "owner-archive-v1", row => row["id"] = keep);
        Change("wrong archive target state", "owner-archive-v1", row => row["archived_at"] = null);
        Change("wrong restore target state", "owner-restore-v2", row => row["archived_at"] = Data("owner-archive-v1")["archived_at"]!.DeepClone());
        Change("missing explicit archive state", "owner-archive-v1", row => row.Remove("archived_at"));
        Change("missing explicit restore state", "owner-restore-v2", row => row.Remove("archived_at"));
        Change("version jumps twice", "owner-archive-v1", row => row["version"] = 3);
        Change("version regresses", "owner-archive-noop-current-v2", row => row["version"] = 1);
        Change("missing version", "owner-archive-v1", row => row.Remove("version"));
        Change("string version", "owner-archive-v1", row => row["version"] = "2");
        Change("fractional version", "owner-archive-v1", row => row["version"] = 1.5);
        Change("soft-delete marker masquerading as archive", "owner-archive-v1", row => row["deleted_at"] = row["archived_at"]!.DeepClone());
        Change("partial record missing text", "owner-archive-v1", row => row.Remove("text"));
        Change("partial record missing created stamp", "owner-archive-v1", row => row.Remove("created_at"));
        Change("invalid habit statistics", "owner-archive-v1", row => row["habit_status"] = "habit");
        Change("invalid real calendar timestamp", "owner-archive-v1", row => row["archived_at"] = "2026-02-30T00:00:00Z");
        Change("local projection cannot become an action response", "owner-archive-v1", row => row["_local_incomplete"] = true);
        foreach (var bad in malformed)
        {
            var source = Sample(bad.Source); var method = source["method"]!.GetValue<string>(); var route = source["path"]!.GetValue<string>();
            var handler = new CapturedTransport(method, route, source["body_json"]!.GetValue<string>(), bad.Envelope.ToJsonString(), 200);
            using var api = new WorkbenchApi(handler); api.BindScope(Scope); var denied = false;
            try { await api.SendAsync(method, route, source["body_json"]!.GetValue<string>(), OperationId); }
            catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
            Check(denied && handler.BusinessCalls == 1, "malformed HTTP 200 action remains unconfirmed: " + bad.Name);
        }
        var badLists = new List<(string Name, string Source, JsonObject Envelope)>();
        void BadList(string name, string source, Action<JsonObject> change)
        { var root = Envelope(source); change(root); badLists.Add((name, source, root)); }
        BadList("missing complete calendar window", "owner-paired-active", root => root["data"]!.AsObject().Remove("window_start"));
        BadList("duplicate UUID", "owner-paired-active", root => root["data"]!["items"]!.AsArray().Add(root["data"]!["items"]![0]!.DeepClone()));
        BadList("archive row in active membership", "owner-paired-active", root => root["data"]!["items"]![0]!["archived_at"] = Data("owner-archive-v1")["archived_at"]!.DeepClone());
        BadList("active row in archived membership", "owner-paired-archived", root => root["data"]!["items"]![0]!["archived_at"] = null);
        BadList("local projected list is not a source baseline", "owner-paired-active", root => root["_local_incomplete"] = true);
        foreach (var bad in badLists)
        {
            var route = Sample(bad.Source)["path"]!.GetValue<string>(); using var api = new WorkbenchApi(new CapturedTransport("GET", route, null, bad.Envelope.ToJsonString(), 200));
            var denied = false; try { await api.SendAsync("GET", route, null, ""); } catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
            Check(denied, "invalid successful list cannot replace existing caller cache: " + bad.Name);
        }
        var unknown = fixture["unknown_operation"]!.AsObject(); var unknownBody = unknown["body_json"]!.GetValue<string>();
        var unknownPath = unknown["path"]!.GetValue<string>(); var unknownId = unknown["operation_id"]!.GetValue<string>();
        var unknownHandler = new CapturedTransport("GET", TemplateArchive.ListPath(false), null, Sample("unknown-active")["response_json"]!.GetValue<string>(), 200);
        using (var api = new WorkbenchApi(unknownHandler))
        {
            var outcome = await api.ReconcileAsync("POST", unknownPath, unknownBody);
            Check(outcome.Outcome == ReconciliationOutcome.Unconfirmed && outcome.RemoteJson is null && unknownHandler.Calls == 0 &&
                unknown["operation_id"]!.GetValue<string>() == unknownId && unknown["body_json"]!.GetValue<string>() == unknownBody && unknown["retries"]!.GetValue<int>() == 0,
                "archive Unknown has no exact-operation receipt; automatic reconciliation sends no request and preserves original identity/body");
        }
        Check(Sample("unknown-archive-v3-simulated-response-loss")["simulated_response_not_delivered_to_caller"]!.GetValue<bool>() &&
            Data("unknown-active")["items"]!.AsArray().All(row => row!["id"]!.GetValue<string>() != target) &&
            Data("unknown-archived")["items"]!.AsArray().Any(row => row!["id"]!.GetValue<string>() == target && row["version"]!.GetValue<int>() == 4),
            "simulated lost delivery requires both list observations; current-state match is not proof of the original operation");
        var detached = TemplateArchive.ParseList(TemplateArchive.ListPath(false), Sample("owner-paired-active")["response_json"]!.GetValue<string>());
        var clone = detached.Items[0]; clone["text"] = "detached";
        Check(detached.Items[0]["text"]!.GetValue<string>() != "detached", "shared list items are detached and cannot mutate cached baseline");
        await UnicodeBudgetAsync(Check, Envelope("owner-paired-active"));
        Console.WriteLine($"Template archive source contract: {samples.Length} actual Worker requests, {reads} accepted reads, {mutations} accepted mutations ({archiveResponses} dedicated archive/restore responses), {denials} captured source denials, {localRejections} pre-HTTP restrictions, {malformed.Count} malformed action and {badLists.Count} malformed list rejections, {checks} checks passed; exact candidate 34bff302, temporary synthetic D1 only, zero external fetch attempts.");
    }

    private static async Task UnicodeBudgetAsync(Action<bool, string> check, JsonObject source)
    {
        var row = source["data"]!["items"]![0]!.DeepClone(); var items = new JsonArray();
        for (var i = 0; i < 1000; i++)
        {
            var item = row.DeepClone(); item["id"] = i.ToString("x8", System.Globalization.CultureInfo.InvariantCulture) + "-0000-4000-8000-000000000000";
            item["text"] = new string('中', 180); items.Add(item);
        }
        source["data"]!["items"] = items;
        var wire = source.ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }); var cached = source.ToJsonString();
        check(Encoding.UTF8.GetByteCount(wire) < WorkbenchApi.MaximumResponseBytes && Encoding.UTF8.GetByteCount(cached) > WorkbenchApi.MaximumResponseBytes,
            "legal Unicode source fits unchanged network budget while escaped local JSON is larger");
        TemplateArchive.ValidateList(TemplateArchive.ListPath(false), cached);
        check(TemplateArchive.ParseList(TemplateArchive.ListPath(false), cached).Items.Count == 1000, "semantic budget reopens valid escaped Unicode local cache");
        using (var api = new WorkbenchApi(new CapturedTransport("GET", TemplateArchive.ListPath(false), null, wire, 200)))
            check((await api.SendAsync("GET", TemplateArchive.ListPath(false), null, "")).Json == wire, "fixed-origin transport preserves Unicode source unchanged");
        using (var api = new WorkbenchApi(new CapturedTransport("GET", TemplateArchive.ListPath(false), null, cached, 200)))
        {
            var denied = false; try { await api.SendAsync("GET", TemplateArchive.ListPath(false), null, ""); } catch (ApiCallException) { denied = true; }
            check(denied, "network body above original 1MiB ceiling is rejected whole");
        }
    }

    private sealed class CapturedTransport(string method, string path, string? body, string json, int status) : HttpMessageHandler
    {
        internal int Calls { get; private set; }
        internal int BusinessCalls { get; private set; }
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested(); Calls++;
            if (request.RequestUri!.GetLeftPart(UriPartial.Authority) != WorkbenchApi.ServiceOrigin.GetLeftPart(UriPartial.Authority) ||
                request.Headers.GetValues("Origin").Single() != "https://haoduoyu.xyz" || request.Headers.Contains("Authorization") ||
                request.Headers.GetValues("X-Public-Business").Single() != "1") throw new InvalidDataException("Unexpected transport origin or credential type.");
            if (request.RequestUri.PathAndQuery == "/api/v1/workbench-snapshot/index?version=2")
            {
                if (request.Method != HttpMethod.Get || request.Content != null || request.Headers.Contains("Idempotency-Key")) throw new InvalidDataException("Unsafe scope check.");
                return Json("{\"data\":{\"complete\":true,\"scope_id\":\"" + Scope + "\"}}", 200);
            }
            BusinessCalls++;
            if (request.Method.Method != method || request.RequestUri.PathAndQuery != path ||
                (request.Content == null ? null : await request.Content.ReadAsStringAsync(cancellationToken)) != body ||
                (method == "GET" ? request.Headers.Contains("Idempotency-Key") : request.Headers.GetValues("Idempotency-Key").Single() != OperationId))
                throw new InvalidDataException("Captured template request changed method, path, exact body or operation identity.");
            return Json(json, status);
        }
        private static HttpResponseMessage Json(string value, int code) => new((HttpStatusCode)code) { Content = new StringContent(value, Encoding.UTF8, "application/json") };
    }
}
