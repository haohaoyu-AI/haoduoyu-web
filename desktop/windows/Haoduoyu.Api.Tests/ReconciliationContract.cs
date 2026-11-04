using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;

internal static class ReconciliationContract
{
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Reconciliation fixture source/isolation does not match.");
        var checks = 0; var requests = 0; var invalidQueries = 0;
        string? publicJson = null; string? ownerJson = null; HashSet<string>? allowed = null;
        void Check(bool condition, string name)
        { if (!condition) throw new InvalidDataException(name); Console.WriteLine("PASS reconciliation " + name); checks++; }
        void Reject(Action action, string name)
        {
            try { action(); }
            catch (Exception error) when (error is InvalidDataException or ArgumentException or InvalidOperationException or JsonException)
            { Check(true, name); return; }
            throw new InvalidDataException("Expected rejection: " + name);
        }
        foreach (var entry in fixture["samples"]!.AsArray())
        {
            var sample = entry!.AsObject(); var name = sample["name"]!.GetValue<string>(); var route = sample["path"]!.GetValue<string>();
            var status = sample["status"]!.GetValue<int>(); var json = sample["response_json"]!.GetValue<string>();
            if (status == 400)
            {
                Reject(() => RoutePolicy.Validate("GET", route, allowAuthWrite: false), "query is rejected locally and by actual Worker");
                invalidQueries++; requests++; continue;
            }
            if (status != 200) throw new InvalidDataException(name);
            RoutePolicy.Validate("GET", route, allowAuthWrite: false);
            BusinessReadSchema.Validate(route, new Haoduoyu.Core.ApiResult(status, json));
            if (route == "/api/v1/article-reconciliation")
            {
                var accounts = sample["allowed_accounts"]!.AsArray().Select(id => id!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
                _ = ArticleReconciliation.Parse(json, accounts);
                if (name == "complete-public-inventory") { publicJson = json; allowed = accounts; }
                if (name == "complete-owner-inventory") ownerJson = json;
            }
            Console.WriteLine($"PASS actual reconciliation Worker {name} (HTTP {status})"); requests++;
        }
        if (requests != 7 || invalidQueries != 1 || publicJson == null || ownerJson == null || allowed == null)
            throw new InvalidDataException("Reconciliation Worker capture is incomplete.");
        var snapshot = ArticleReconciliation.Parse(publicJson, allowed); var original = snapshot.Data.ToJsonString();
        var filterCases = 0;
        foreach (var entry in fixture["filters"]!.AsArray())
        {
            var value = entry!.AsObject(); var filter = value["filter"]!.Deserialize<ArticleReconciliationFilter>()!;
            var result = ArticleReconciliation.Filter(snapshot, filter);
            var expected = value["expected_ids"]!.AsArray().Select(id => id!.GetValue<string>());
            Check(result.Rows.Select(row => row["id"]!.GetValue<string>()).SequenceEqual(expected, StringComparer.Ordinal) &&
                JsonNode.DeepEquals(result.Counts, value["expected_counts"]) && result.Total == result.Rows.Count && result.UnfilteredTotal == snapshot.Total,
                "source-derived local filter " + (++filterCases));
        }
        Check(filterCases == 12, "all/explicit true/explicit false/unknown filters covered");
        var future = fixture["synthetic_source_reducer_case"]!.AsObject();
        Check(future["not_an_http_response"]!.GetValue<bool>(), "future status case is honestly a source-reducer fixture");
        var futureSnapshot = ArticleReconciliation.Validate(future["data"], allowed);
        var unknown = ArticleReconciliation.Filter(futureSnapshot, new(Status: "unknown"));
        Check(unknown.Rows.Select(row => row["id"]!.GetValue<string>()).SequenceEqual(future["unknown_ids"]!.AsArray().Select(id => id!.GetValue<string>()), StringComparer.Ordinal) &&
            futureSnapshot.Rows.Any(row => row["status"]?.GetValue<string>() == "synthetic_future_status"), "future/null statuses retain original values in unknown bucket");
        var detached = snapshot.Data; detached["rows"]!.AsArray().Clear();
        var view = ArticleReconciliation.Filter(snapshot); var detachedRow = view.Rows[0]; detachedRow["title"] = "detached copy";
        Check(snapshot.Data.ToJsonString() == original && ArticleReconciliation.Filter(snapshot).Total == snapshot.Total, "read-only snapshots and filtered rows do not mutate their source");
        void InvalidCopy(string name, Action<JsonObject> mutate)
        { var data = snapshot.Data; mutate(data); Reject(() => ArticleReconciliation.Validate(data, allowed), name); }
        InvalidCopy("missing complete marker rejected", data => data.Remove("complete"));
        InvalidCopy("mismatched status counts rejected", data => data["counts"]!["drafting"] = 999);
        InvalidCopy("duplicate article identity rejected", data => { data["rows"]!.AsArray().Add(data["rows"]![0]!.DeepClone()); data["total"] = data["rows"]!.AsArray().Count; });
        InvalidCopy("missing nullable insurance key rejected", data => data["insurance"]!.AsObject().Remove("start"));
        InvalidCopy("unknown verification never equals false", data =>
        { var row = data["rows"]!.AsArray().First(row => row!["has_pending_verify"] is null)!; row["has_pending_verify"] = false; });
        Reject(() => ArticleReconciliation.Parse(ownerJson, allowed), "foreign-account inventory rejected before display or caching");
        Reject(() => ArticleReconciliation.Filter(snapshot, new(HasPendingVerify: false, PendingUnknownOnly: true)), "ambiguous verification filters rejected");
        Reject(() => ArticleReconciliation.Parse(publicJson.Replace("\"complete\":true", "\"complete\":true,\"complete\":true", StringComparison.Ordinal), allowed), "duplicate JSON members rejected");

        var budget = fixture["unicode_budget_case"]!.AsObject(); var repeats = budget["repeats"]!.GetValue<int>();
        var text = string.Concat(Enumerable.Repeat("中😀", repeats));
        var budgetData = budget["summary_without_rows"]!.DeepClone().AsObject(); var rows = new JsonArray();
        foreach (var id in budget["ids"]!.AsArray())
        {
            var row = budget["template"]!.DeepClone().AsObject(); row["id"] = id!.DeepClone();
            row["sample"] = new JsonObject { ["text"] = text, ["tiny"] = 1e-7, ["big"] = 1e20, ["zero"] = 0, ["nullable"] = null }; rows.Add(row);
        }
        budgetData["rows"] = rows;
        var cache = new JsonObject { ["data"] = budgetData }.ToJsonString();
        Check(budget["source_js_rows_bytes"]!.GetValue<int>() is > 1_000_000 and < ArticleReconciliation.MaximumRowsBytes &&
            Encoding.UTF8.GetByteCount(cache) > WorkbenchApi.MaximumResponseBytes && Encoding.UTF8.GetByteCount(cache) < WorkbenchApi.MaximumReconciliationResponseBytes,
            "legal source row budget expands above 1MiB when cache JSON escapes CJK and non-BMP text");
        var reopened = ArticleReconciliation.Parse(cache, allowed);
        Check(reopened.Total == 24 && reopened.Rows.All(row => row["sample"]!["text"]!.GetValue<string>() == text), "near-limit Unicode cache roundtrip preserves all original text and source budget");
        var tooLarge = budgetData.DeepClone().AsObject();
        foreach (var row in tooLarge["rows"]!.AsArray()) row!["sample"]!["text"] = string.Concat(Enumerable.Repeat("中😀", repeats + 300));
        Reject(() => ArticleReconciliation.Validate(tooLarge, allowed), "semantic rows over 1MiB rejected even with valid individual metadata fields");

        // Transport probes use valid inventory data plus synthetic outer metadata; they are not captured Worker responses.
        var padded = JsonNode.Parse(publicJson)!.AsObject(); padded["synthetic_transport_padding"] = new string('m', WorkbenchApi.MaximumResponseBytes + 1);
        using (var api = new WorkbenchApi(new ProbeHandler(padded.ToJsonString())))
        {
            var result = await api.SendAsync("GET", "/api/v1/article-reconciliation", null, "");
            Check(result.IsSuccess, "route-specific complete envelope above 1MiB accepted below 4MiB");
        }
        async Task RejectTransport(string route, string payload, string name)
        {
            using var api = new WorkbenchApi(new ProbeHandler(payload));
            try { _ = await api.SendAsync("GET", route, null, ""); }
            catch (ApiCallException) { Check(true, name); return; }
            throw new InvalidDataException("Expected transport rejection: " + name);
        }
        padded["synthetic_transport_padding"] = new string('m', WorkbenchApi.MaximumReconciliationResponseBytes);
        await RejectTransport("/api/v1/article-reconciliation", padded.ToJsonString(), "complete envelope over 4MiB rejected");
        var accountEnvelope = new JsonObject { ["data"] = new JsonArray(), ["synthetic_transport_padding"] = new string('m', WorkbenchApi.MaximumResponseBytes + 1) };
        await RejectTransport("/api/v1/accounts", accountEnvelope.ToJsonString(), "ordinary route retains 1MiB response limit");
        if (checks < 25) throw new InvalidDataException("Portable reconciliation coverage is incomplete.");
        Console.WriteLine($"Article reconciliation contract: {requests} actual read-only Worker requests ({requests - invalidQueries} successful reads/{invalidQueries} query rejection), {filterCases} source-derived filters, {checks} portable validation/filter/cache/transport checks; synthetic temporary D1 and fake HTTP only, zero external fetch attempts.");
    }

    private sealed class ProbeHandler(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
    }
}
