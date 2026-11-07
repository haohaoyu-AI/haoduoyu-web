using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Encodings.Web;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class NoteHistoryContract
{
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0 ||
            fixture["production_business_requests"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Note history fixture source/isolation mismatch.");
        var checks = 0; var accepted = 0; var serverErrors = 0; var oldProtocols = 0; var localRejections = 0;
        void Check(bool condition, string name)
        { if (!condition) throw new InvalidDataException(name); checks++; Console.WriteLine("PASS note history contract " + name); }
        var samples = fixture["samples"]!.AsArray().Select(value => value!.AsObject()).ToArray();
        foreach (var sample in samples)
        {
            var route = sample["path"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            var name = sample["name"]!.GetValue<string>(); var json = sample["response_json"]!.GetValue<string>();
            Check(sample["method"]!.GetValue<string>() == "GET" && sample["business_data_unchanged"]!.GetValue<bool>(),
                "actual read preserved synthetic business data: " + name);
            var handler = new ReadOnlyCapture(route, json, status);
            using var api = new WorkbenchApi(handler);
            if (sample["local_query_rejection"]!.GetValue<bool>())
            {
                var denied = false;
                try { await api.SendAsync("GET", route, null, ""); }
                catch (ArgumentException) { denied = true; }
                Check(status == 400 && denied && handler.Calls == 0, "invalid query is rejected locally and by actual Worker: " + name);
                localRejections++; serverErrors++; continue;
            }
            if (sample["native_response_rejection"]!.GetValue<bool>())
            {
                var denied = false;
                try { await api.SendAsync("GET", route, null, ""); }
                catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
                Check(status == 200 && denied && handler.Calls == 1, "older real label protocol cannot replace complete labels3 cache: " + name);
                oldProtocols++; continue;
            }
            var result = await api.SendAsync("GET", route, null, "");
            Check(handler.Calls == 1 && result.Json == json && result.StatusCode == status, "fixed-origin GET replays exact actual response: " + name);
            if (status >= 400)
            {
                Check(!result.IsSuccess && JsonNode.Parse(json)!["data"] is null, "failed whole-month read has no partial business payload: " + name);
                serverErrors++; continue;
            }
            if (route.StartsWith("/api/v1/note-entries/month?", StringComparison.Ordinal))
            {
                NoteHistoryResponse.Validate(route, result.Json);
                var month = Uri.UnescapeDataString(route.Split('=')[1]);
                var baseline = NoteHistory.ParseBaseline(result.Json, month);
                Check(JsonNode.DeepEquals(baseline.Data, JsonNode.Parse(json)!["data"]), "shared baseline retains original month DTO: " + name);
            }
            accepted++;
        }
        Check(samples.Length == 19 && accepted == 9 && oldProtocols == 2 && serverErrors == 8 && localRejections == 2,
            "all nineteen actual source responses covered");
        var full = samples.Single(sample => sample["name"]!.GetValue<string>() == "leap-month-four-sources-labels3");
        var original = full["response_json"]!.GetValue<string>(); var fullPath = full["path"]!.GetValue<string>();
        var baselineMonth = NoteHistory.ParseBaseline(original, "2024-02");
        var raw = JsonNode.Parse(original)!; var days = raw["data"]!["days"]!.AsArray();
        var rows = days.SelectMany(day => day!["items"]!.AsArray().Select(item => item!.AsObject())).ToArray();
        var lifeId = fixture["ids"]!["life"]!.GetValue<string>();
        var lifeSummary = rows.Single(row => row["entity_id"]!.GetValue<string>() == "note-entry:" + lifeId);
        var detail = JsonNode.Parse(samples.Single(sample => sample["name"]!.GetValue<string>() == "single-entry-detail-for-edit-baseline")["response_json"]!.GetValue<string>())!["data"]!;
        Check(baselineMonth.Month == "2024-02" && baselineMonth.Items.Count == fixture["expected_month_rows"]!.GetValue<int>() &&
            days[0]!["date"]!.GetValue<string>() == "2024-02-28" && days[1]!["date"]!.GetValue<string>() == "2024-02-29", "real leap-month dates and all four sources retained");
        Check(JsonNode.DeepEquals(lifeSummary["labels"], detail["labels"]) && lifeSummary["text"]!.GetValue<string>() == detail["text"]!.GetValue<string>() &&
            rows.All(row => !row.ContainsKey("version") && !row.ContainsKey("content_hash") && !row.ContainsKey("can_edit")) && detail["version"]!.GetValue<int>() == 1,
            "month summaries match detailed content and labels without inventing edit versions or permissions");
        Check(rows.Any(row => row["text"]!.GetValue<string>() == "") && rows.Any(row => row["labels"]!.AsArray().Any(label => label!.GetValue<string>() == "已归档")) &&
            rows.All(row => row["entity_id"]!.GetValue<string>() != "note-entry:" + fixture["ids"]!["deleted"]!.GetValue<string>()),
            "blank note and archived labels survive while soft-deleted entries remain absent");
        Check(rows.Single(row => row["entity_id"]!.GetValue<string>() == "note-entry:" + fixture["ids"]!["blank"]!.GetValue<string>())["labels"]!.AsArray().Count == 0 &&
            rows.Single(row => row["entity_id"]!.GetValue<string>() == "note-entry:" + fixture["ids"]!["work"]!.GetValue<string>())["labels"]!.AsArray().Single()!.GetValue<string>() == "兴趣",
            "valid labels3 empty sets and custom work labels are not replaced with category defaults");
        var empty = samples.Single(sample => sample["name"]!.GetValue<string>() == "complete-empty-month");
        Check(NoteHistory.ParseBaseline(empty["response_json"]!.GetValue<string>(), "2024-01").Items.Count == 0, "complete empty source month remains valid");
        var state = new WorkspaceState { ScopeId = new string('a', 64), Cache = new() { [fullPath] = original, ["/api/v1/articles"] = "unrelated corrupt synthetic cache" } };
        var beforeState = JsonSerializer.Serialize(state);
        var view = NoteHistory.Build(state, "2024-02");
        var archivedView = NoteHistory.Build(state, "2024-02", new NoteHistoryFilter(Label: "已归档"));
        Check(view.Complete && view.Days.Count == 29 && view.Total == 6 && archivedView.FilteredCount == 1 &&
            view.Items.All(item => item.Data["_local_incomplete"]!.GetValue<bool>() && !item.Data.ContainsKey("version")),
            "actual source drives complete detached month and archived-label filtering without fabricating edit versions");
        Check(JsonSerializer.Serialize(state) == beforeState && state.Outbox.Count == 0 && state.Drafts.Count == 0,
            "real-response model replay does not mutate cache or generate drafts and queued work");

        var mutations = new List<(string Name, Action<JsonNode> Change)>
        {
            ("missing labels version", node => node["data"]!.AsObject().Remove("labels_version")),
            ("string labels version", node => node["data"]!["labels_version"] = "3"),
            ("incomplete month", node => node["data"]!["complete"] = false),
            ("wrong format", node => node["data"]!["format"] = "future-incomplete"),
            ("wrong month", node => node["data"]!["month"] = "2024-03"),
            ("duplicate day", node => node["data"]!["days"]!.AsArray().Add(node["data"]!["days"]![0]!.DeepClone())),
            ("invalid leap date", node => node["data"]!["days"]![0]!["date"] = "2024-02-30"),
            ("duplicate entity", node => node["data"]!["days"]![1]!["items"]!.AsArray().Add(node["data"]!["days"]![1]!["items"]![0]!.DeepClone())),
            ("invalid item identity", node => node["data"]!["days"]![1]!["items"]![0]!["entity_id"] = "note-entry:invalid"),
            ("mismatched legacy category", node => node["data"]!["days"]![1]!["items"]![0]!["category"] = "work"),
            ("invalid source", node => node["data"]!["days"]![1]!["items"]![0]!["source"] = "invented"),
            ("invalid timestamp", node => node["data"]!["days"]![1]!["items"]![0]!["updated_at"] = "2024-02-30T00:00:00Z"),
            ("non-string body", node => node["data"]!["days"]![1]!["items"]![0]!["text"] = 1),
            ("duplicate labels", node => node["data"]!["days"]![1]!["items"]![0]!["labels"] = new JsonArray("生活", "生活")),
            ("non-string label", node => node["data"]!["days"]![1]!["items"]![0]!["labels"] = new JsonArray(1)),
            ("projected partial month", node => node["data"]!["_local_incomplete"] = true)
        };
        foreach (var (name, change) in mutations)
        {
            var changed = JsonNode.Parse(original)!; change(changed); var denied = false;
            using var api = new WorkbenchApi(new ReadOnlyCapture(fullPath, changed.ToJsonString(), 200));
            try { await api.SendAsync("GET", fullPath, null, ""); }
            catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
            Check(denied, "malformed success rejected by actual native transport: " + name);
        }
        var unknown = JsonNode.Parse(original)!;
        unknown["data"]!["future_metadata"] = new JsonObject { ["keep"] = "合成 🐟" };
        unknown["future_root"] = new JsonArray("preserve");
        var withUnknown = unknown.ToJsonString();
        NoteHistoryResponse.Validate(fullPath, withUnknown);
        Check(JsonNode.DeepEquals(NoteHistory.ParseBaseline(withUnknown, "2024-02").Data, unknown["data"]), "legal unknown metadata retained by shared validation");
        await CheckUnicodeBudgetAsync(Check, lifeSummary);
        Check(original == full["response_json"]!.GetValue<string>() && baselineMonth.Items.Count == 6,
            "validation never changes source fixture or retained baseline");
        Console.WriteLine($"Note history source contract: {samples.Length} actual GET-only Worker requests ({accepted} accepted reads/{oldProtocols} older-protocol native rejections/{serverErrors} server errors), {mutations.Count} malformed-success transport rejections, {checks} checks passed; temporary synthetic D1 only, zero external fetch attempts.");
    }

    private static async Task CheckUnicodeBudgetAsync(Action<bool, string> check, JsonObject template)
    {
        var items = new JsonArray();
        for (var i = 0; i < 15; i++)
        {
            var row = template.DeepClone(); row["entity_id"] = "note-entry:" + $"00000000-0000-0000-0000-{i + 1:000000000000}";
            row["text"] = new string('中', 21_800); items.Add(row);
        }
        var envelope = new JsonObject { ["data"] = new JsonObject { ["format"] = "haoduoyu-note-month-v1", ["month"] = "2024-02", ["complete"] = true,
            ["labels_version"] = 3, ["days"] = new JsonArray(new JsonObject { ["date"] = "2024-02-29", ["items"] = items }) } };
        var wire = envelope.ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        var cached = envelope.ToJsonString();
        check(Encoding.UTF8.GetByteCount(wire) < WorkbenchApi.MaximumResponseBytes && Encoding.UTF8.GetByteCount(cached) > WorkbenchApi.MaximumResponseBytes,
            "legal Unicode month is under unchanged wire budget while encoded cache exceeds 1MiB");
        check(NoteHistory.ParseBaseline(cached, "2024-02").Items.Count == 15, "legal Unicode cache encoding round-trips under local cache budget");
        const string route = "/api/v1/note-entries/month?month=2024-02";
        using (var api = new WorkbenchApi(new ReadOnlyCapture(route, wire, 200)))
            check((await api.SendAsync("GET", route, null, "")).Json == wire, "legal Unicode wire response passes actual fixed-origin transport unchanged");
        var rejected = false;
        using (var api = new WorkbenchApi(new ReadOnlyCapture(route, cached, 200)))
        {
            try { await api.SendAsync("GET", route, null, ""); }
            catch (ApiCallException) { rejected = true; }
        }
        check(rejected, "network response remains limited to 1MiB despite larger local cache encoding budget");
    }

    private sealed class ReadOnlyCapture(string path, string json, int status) : HttpMessageHandler
    {
        internal int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested(); Calls++;
            if (request.Method != HttpMethod.Get || request.Content is not null || request.RequestUri!.GetLeftPart(UriPartial.Authority) != WorkbenchApi.ServiceOrigin.GetLeftPart(UriPartial.Authority) ||
                request.Headers.Contains("Authorization") || request.Headers.Contains("Idempotency-Key") ||
                !request.Headers.TryGetValues("X-Public-Business", out var modes) || modes.Single() != "1" ||
                request.RequestUri.PathAndQuery != path || path.StartsWith("/api/v1/note-", StringComparison.Ordinal) &&
                (!request.Headers.TryGetValues("X-Note-Labels-Version", out var versions) || versions.Single() != "3"))
                throw new InvalidDataException("Unexpected request outside read-only native note contract.");
            return Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
    }
}
