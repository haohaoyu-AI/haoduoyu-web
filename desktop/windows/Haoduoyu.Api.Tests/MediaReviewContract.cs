using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Encodings.Web;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class MediaReviewContract
{
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0 ||
            fixture["production_business_requests"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Media review fixture source/isolation mismatch.");
        var checks = 0; var accepted = 0; var serverErrors = 0;
        void Check(bool condition, string name)
        { if (!condition) throw new InvalidDataException(name); checks++; Console.WriteLine("PASS media review contract " + name); }
        var samples = fixture["samples"]!.AsArray().Select(value => value!.AsObject()).ToArray();
        JsonObject Sample(string name) => samples.Single(sample => sample["name"]!.GetValue<string>() == name);
        JsonNode Body(string name) => JsonNode.Parse(Sample(name)["response_json"]!.GetValue<string>())!;
        foreach (var sample in samples)
        {
            var route = sample["path"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            var name = sample["name"]!.GetValue<string>(); var json = sample["response_json"]!.GetValue<string>();
            Check(sample["method"]!.GetValue<string>() == "GET" && sample["business_data_unchanged"]!.GetValue<bool>(),
                "actual read preserves synthetic business/control/audit data: " + name);
            var handler = new ReadOnlyCapture(route, json, status);
            using var api = new WorkbenchApi(handler);
            if (sample["local_query_rejection"]!.GetValue<bool>())
            {
                var denied = false;
                try { await api.SendAsync("GET", route, null, ""); }
                catch (ArgumentException) { denied = true; }
                Check(status == 400 && denied && handler.Calls == 0, "invalid native query stops before HTTP and real source also returned 400: " + name);
                serverErrors++; continue;
            }
            var result = await api.SendAsync("GET", route, null, "");
            Check(handler.Calls == 1 && result.StatusCode == 200 && result.Json == json, "actual source response passes native fixed-origin GET unchanged: " + name);
            if (!route.StartsWith("/api/v1/articles/", StringComparison.Ordinal))
            {
                var query = MediaReviewQuery.Parse(route);
                MediaReviewResponse.Validate(route, json);
                MediaReview.ValidateSource(query.Path, json);
                var view = MediaReview.Parse(query.Path, json);
                Check(JsonNode.DeepEquals(view.Data, JsonNode.Parse(json)!["data"]), "shared native query/model retains actual business payload: " + name);
            }
            accepted++;
        }
        Check(samples.Length == 24 && accepted == 18 && serverErrors == 6, "all twenty-four real source responses covered");
        foreach (var item in fixture["native_only_rejected_queries"]!.AsArray())
        {
            var route = item!.GetValue<string>(); var handler = new ReadOnlyCapture(route, "{\"data\":[]}", 200);
            using var api = new WorkbenchApi(handler); var denied = false;
            try { await api.SendAsync("GET", route, null, ""); }
            catch (ArgumentException) { denied = true; }
            Check(denied && handler.Calls == 0, "unsupported/duplicate query blocked only by native policy; no server-400 claim: " + route);
        }
        Check(MediaReviewQuery.Parse("/api/v1/overview?period=yesterday&top_n=5").Path == "/api/v1/overview", "equivalent default overview query reuses established base cache key");
        var tt = fixture["accounts"]!["tt"]!.GetValue<string>(); var zh = fixture["accounts"]!["zh"]!.GetValue<string>();
        var candidate = fixture["ids"]!["candidate"]!.GetValue<string>();
        var yesterday = Body("overview-yesterday-all")["data"]!;
        var seven = Body("overview-7d-all")["data"]!; var thirty = Body("overview-30d-all")["data"]!;
        var ranked = Body("overview-7d-zhihu-top1-only")["data"]!;
        var ttAccount = yesterday["accounts"]!.AsArray().Single(row => row!["id"]!.GetValue<string>() == tt)!;
        var zhAccount = yesterday["accounts"]!.AsArray().Single(row => row!["id"]!.GetValue<string>() == zh)!;
        Check(ttAccount["period_metrics"]!["reads"]!.GetValue<int>() == 0 && ttAccount["comparisons"]!["reads"]!["delta"]!.GetValue<int>() == -10 &&
            ttAccount["comparisons"]!["reads"]!["percent"]!.GetValue<int>() == -100 && yesterday["cumulative"]!["totals"]!["reads"]!.GetValue<int>() == 3000,
            "real daily zero and negative comparison remain distinct from cumulative latest snapshots");
        Check(zhAccount["period_metrics"]!["likes"] is null && zhAccount["period_metrics"]!["approvals"]!.GetValue<int>() == 0 &&
            zhAccount["coverage"]!["missing_metrics"]!.AsArray().Any(metric => metric!.GetValue<string>() == "likes"),
            "missing likes stay missing while true-zero approvals remain separate");
        Check(thirty["window"]!["days"]!.GetValue<int>() == 30 && thirty["accounts"]!.AsArray().Single(row => row!["id"]!.GetValue<string>() == tt)!["coverage"]!["days"]!.GetValue<int>() == 30,
            "source 30-day coverage is accepted despite stale OpenAPI maximum-seven annotation");
        Check(JsonNode.DeepEquals(seven["cumulative"], ranked["cumulative"]) && JsonNode.DeepEquals(seven["accounts"], ranked["accounts"]) &&
            JsonNode.DeepEquals(seven["trend"], ranked["trend"]) && ranked["top_articles"]!.AsArray().Count == 1 &&
            ranked["top_articles"]![0]!["platform"]!.GetValue<string>() == "zhihu" && ranked["top_articles"]![0]!["latest_metrics"]!["reads"]!.GetValue<int>() == 0,
            "top platform and limit affect only ranking and retain a recorded-zero ranked article");
        var due = Body("due-all-three-targets")["data"]!.AsArray().Where(row => row!["id"]!.GetValue<string>() == candidate).ToArray();
        Check(due.Length == 3 && due.Select(row => row!["due_kind"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal).SetEquals(["d1", "d3", "d7"]),
            "one article retains three due nodes; a pre-due d1 snapshot does not complete its target");
        var daily = Body("daily-tt-seven-range")["data"]!.AsArray();
        Check(daily.Count == 8 && daily.Any(row => row!["article_id"] is null) && daily.Any(row => row!["article_id"]?.GetValue<string>() == candidate) &&
            ttAccount["coverage"]!["source"]!.GetValue<string>() == "account", "account-level day row takes precedence over overlapping article detail without double-counting");
        Check(yesterday["attention_articles"]!.AsArray().Single(row => row!["id"]!.GetValue<string>() == candidate)!["attention"]!["kind"]!.GetValue<string>() == "up" &&
            yesterday["attention_articles"]!.AsArray().All(row => row!["id"]!.GetValue<string>() != fixture["ids"]!["unverified"]!.GetValue<string>()),
            "actual historical-median attention and unverified-date exclusions remain server-derived");

        var malformed = new List<(string Name, string Route, JsonNode Body)>();
        void Change(string name, string sourceName, Action<JsonNode> change, string? requestedPath = null)
        { var body = Body(sourceName); change(body); malformed.Add((name, requestedPath ?? Sample(sourceName)["path"]!.GetValue<string>(), body)); }
        Change("missing cumulative section", "overview-yesterday-all", node => node["data"]!.AsObject().Remove("cumulative"));
        Change("wrong requested period", "overview-yesterday-all", _ => { }, Sample("overview-7d-all")["path"]!.GetValue<string>());
        Change("wrong selected account", "overview-yesterday-all", _ => { }, Sample("overview-7d-tt-account")["path"]!.GetValue<string>());
        Change("wrong requested top metadata", "overview-7d-all", _ => { }, Sample("overview-7d-zhihu-top1-only")["path"]!.GetValue<string>());
        Change("duplicate account", "overview-yesterday-all", node => node["data"]!["accounts"]!.AsArray().Add(node["data"]!["accounts"]![0]!.DeepClone()));
        Change("invalid date window", "overview-yesterday-all", node => node["data"]!["window"]!["to"] = "2026-02-30");
        Change("negative raw metric", "overview-yesterday-all", node => node["data"]!["accounts"]![0]!["period_metrics"]!["reads"] = -1);
        Change("non-boolean comparison", "overview-yesterday-all", node => node["data"]!["accounts"]![0]!["comparisons"]!["reads"]!["comparable"] = "true");
        Change("malformed attention", "overview-yesterday-all", node => node["data"]!["attention_articles"]![0]!["attention"]!["kind"] = "invented");
        Change("local projection cannot become original response", "overview-yesterday-all", node => node["data"]!["_local_incomplete"] = true);
        Change("duplicate due composite key", "due-all-three-targets", node => node["data"]!.AsArray().Add(node["data"]![0]!.DeepClone()));
        Change("due account mismatch", "due-all-three-targets", _ => { }, Sample("due-tt-account")["path"]!.GetValue<string>());
        Change("invalid due kind", "due-all-three-targets", node => node["data"]![0]!["due_kind"] = "latest");
        Change("duplicate observation", "observations-candidate-article", node => node["data"]!.AsArray().Add(node["data"]![0]!.DeepClone()));
        Change("observation article mismatch", "observations-candidate-article", node => node["data"]![0]!["article_id"] = fixture["ids"]!["zh"]!.GetValue<string>());
        Change("observation missing real source", "observations-all", node => node["data"]![0]!.AsObject().Remove("source"));
        Change("unknown raw metric", "observations-all", node => node["data"]![0]!["metrics"]!["estimated_reads"] = 100);
        Change("invalid observation instant", "observations-all", node => node["data"]![0]!["as_of"] = "2026-02-30T00:00:00Z");
        Change("daily account mismatch", "daily-tt-seven-range", node => node["data"]![0]!["account_id"] = zh);
        Change("daily outside requested dates", "daily-tt-seven-range", node => node["data"]![0]!["date"] = "1900-01-01");
        Change("daily absent article identity", "daily-all", node => node["data"]![0]!.AsObject().Remove("article_id"));
        Change("daily negative raw metric", "daily-all", node => node["data"]![0]!["metrics"]!["reads"] = -1);
        foreach (var item in malformed)
        {
            using var api = new WorkbenchApi(new ReadOnlyCapture(item.Route, item.Body.ToJsonString(), 200)); var denied = false;
            try { await api.SendAsync("GET", item.Route, null, ""); }
            catch (ApiCallException error) when (error.StatusCode == 200) { denied = true; }
            Check(denied, "malformed successful read is rejected before caller cache replacement: " + item.Name);
        }
        var unknown = Body("overview-yesterday-all"); unknown["data"]!["future_metadata"] = new JsonObject { ["preserve"] = "合成 🐟" };
        var parsed = MediaReview.Parse("/api/v1/overview", unknown.ToJsonString()); var detached = parsed.Data;
        detached!["future_metadata"]!["preserve"] = "changed detached copy";
        Check(parsed.Data!["future_metadata"]!["preserve"]!.GetValue<string>() == "合成 🐟", "unknown legal metadata preserved and returned business payload detached");
        // Synthetic compatibility only: normal metricObject writes reject null,
        // while historical stored JSON reads may still contain an explicit null.
        var historical = Body("observations-all");
        historical["data"]![0]!["metrics"]!["reads"] = null;
        historical["data"]![0]!["metrics"]!["likes"] = 0;
        historical["data"]![0]!["metrics"]!.AsObject().Remove("comments");
        var compatibility = MediaReview.Parse("/api/v1/observations", historical.ToJsonString()).Rows[0].Metrics;
        Check(compatibility["reads"].Present && compatibility["reads"].IsNull && !compatibility["comments"].Present && compatibility["likes"].Value == 0,
            "synthetic historical compatibility preserves explicit null, absent key and true zero separately; not a normal write-contract claim");
        using (var api = new WorkbenchApi(new ReadOnlyCapture("/api/v1/observations", historical.ToJsonString(), 200)))
            Check((await api.SendAsync("GET", "/api/v1/observations", null, "")).Json == historical.ToJsonString(), "historical-null compatibility read remains unchanged through actual native transport");
        await CheckUnicodeBudgetAsync(Check, Body("daily-all")["data"]![0]!.AsObject());
        Console.WriteLine($"Media review source contract: {samples.Length} actual GET-only Worker requests ({accepted} accepted reads/{serverErrors} actual invalid-query responses), 5 native-only unsupported-query rejections, {malformed.Count} malformed-success transport rejections, {checks} checks passed; temporary synthetic D1 only, zero external fetch attempts.");
    }

    private static async Task CheckUnicodeBudgetAsync(Action<bool, string> check, JsonObject template)
    {
        var items = new JsonArray();
        for (var i = 0; i < 1000; i++)
        {
            var row = template.DeepClone(); row["id"] = "synthetic-unicode-" + i;
            row["article_id"] = null; row["date"] = new DateOnly(2025, 1, 1).AddDays(-i).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            row["source"] = new string('中', 160); items.Add(row);
        }
        var envelope = new JsonObject { ["data"] = items };
        var wire = envelope.ToJsonString(new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }); var cached = envelope.ToJsonString();
        const string route = "/api/v1/daily-metrics";
        check(Encoding.UTF8.GetByteCount(wire) < WorkbenchApi.MaximumResponseBytes && Encoding.UTF8.GetByteCount(cached) > WorkbenchApi.MaximumResponseBytes,
            "valid Unicode source attribution fits wire budget while escaped local cache exceeds 1MiB");
        MediaReviewResponse.Validate(route, cached);
        check(MediaReview.Parse(route, cached).Data!.AsArray().Count == 1000, "Unicode cache reopens using semantic data budget without changing raw network limit");
        using (var api = new WorkbenchApi(new ReadOnlyCapture(route, wire, 200)))
            check((await api.SendAsync("GET", route, null, "")).Json == wire, "actual fixed-origin transport retains valid Unicode payload unchanged");
        using (var api = new WorkbenchApi(new ReadOnlyCapture(route, cached, 200)))
        {
            var denied = false;
            try { await api.SendAsync("GET", route, null, ""); }
            catch (ApiCallException) { denied = true; }
            check(denied, "network payload above unchanged 1MiB limit is rejected whole");
        }
    }

    private sealed class ReadOnlyCapture(string path, string json, int status) : HttpMessageHandler
    {
        internal int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested(); Calls++;
            if (request.Method != HttpMethod.Get || request.Content is not null || request.RequestUri!.GetLeftPart(UriPartial.Authority) != WorkbenchApi.ServiceOrigin.GetLeftPart(UriPartial.Authority) ||
                request.RequestUri.PathAndQuery != path || request.Headers.Contains("Authorization") || request.Headers.Contains("Idempotency-Key") ||
                request.Headers.GetValues("Origin").Single() != "https://haoduoyu.xyz" || request.Headers.GetValues("X-Public-Business").Single() != "1")
                throw new InvalidDataException("Unexpected request outside native read-only media contract.");
            return Task.FromResult(new HttpResponseMessage((HttpStatusCode)status) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
        }
    }
}
