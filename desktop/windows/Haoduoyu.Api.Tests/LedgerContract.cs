using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class LedgerContract
{
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Article ledger fixture source/isolation mismatch.");
        var allowed = fixture["allowed_accounts"]!.AsArray().Select(id => id!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
        var rows = fixture["canonical_rows"]!.AsArray(); var scope = new string('a', 64);
        var canonical = new JsonObject { ["data"] = rows.DeepClone(), ["meta"] = new JsonObject { ["total"] = rows.Count, ["has_more"] = false },
            ["_local_complete"] = true, ["_local_scope_id"] = scope }.ToJsonString();
        var state = new WorkspaceState { ScopeId = scope, LocalRevision = 7 };
        state.Cache["/api/v1/articles"] = canonical; state.CacheRevisions["/api/v1/articles"] = 7;
        var cases = 0; var reads = 0; var rejected = 0; var checks = 0; var fast = 0; var fallback = 0;
        JsonObject? summarySample = null; JsonObject? fullSample = null;
        void Check(bool value, string name)
        { if (!value) throw new InvalidDataException(name); checks++; Console.WriteLine("PASS ledger " + name); }
        void Reject(Action action, string name)
        {
            try { action(); }
            catch (Exception error) when (error is ArgumentException or InvalidDataException or ApiCallException or InvalidOperationException or FormatException or OverflowException)
            { Check(true, name); return; }
            throw new InvalidDataException("Expected rejection: " + name);
        }
        static void EqualPage(JsonObject actual, JsonObject expected, string name)
        {
            var wanted = expected["data"]!.AsArray(); var obtained = actual["data"]!.AsArray();
            if (!wanted.Select(row => row!["id"]!.GetValue<string>()).SequenceEqual(obtained.Select(row => row!["id"]!.GetValue<string>()), StringComparer.Ordinal))
                throw new InvalidDataException(name + " IDs/order expected " + string.Join(',', wanted.Select(row => row!["id"]!.GetValue<string>())) + " actual " + string.Join(',', obtained.Select(row => row!["id"]!.GetValue<string>())));
            for (var i = 0; i < wanted.Count; i++) foreach (var field in wanted[i]!.AsObject())
                if (!JsonNode.DeepEquals(obtained[i]![field.Key], field.Value))
                    throw new InvalidDataException(name + " field " + field.Key + " differs for " + wanted[i]!["id"] + ": expected " + field.Value?.ToJsonString() + ", actual " + obtained[i]![field.Key]?.ToJsonString());
            foreach (var field in new[] { "total", "unfiltered_total", "page", "page_size", "offset", "has_more", "pagination" })
                if (!JsonNode.DeepEquals(actual["meta"]?[field], expected["meta"]?[field]))
                    throw new InvalidDataException(name + " meta." + field + " expected " + expected["meta"]?[field] + " actual " + actual["meta"]?[field]);
        }
        foreach (var value in fixture["samples"]!.AsArray())
        {
            var sample = value!.AsObject(); var resource = sample["path"]!.GetValue<string>(); var name = sample["name"]!.GetValue<string>();
            var status = sample["status"]!.GetValue<int>(); var json = sample["response_json"]!.GetValue<string>();
            if (status == 400)
            {
                Reject(() => RoutePolicy.Validate("GET", resource, allowAuthWrite: false), "actual Worker and native query reject " + name); rejected++; continue;
            }
            if (status != 200) throw new InvalidDataException(name);
            RoutePolicy.Validate("GET", resource, allowAuthWrite: false);
            BusinessReadSchema.Validate(resource, new ApiResult(status, json)); reads++;
            if (resource.Split('?')[0] == "/api/v1/articles") _ = ArticleLedgerResponse.Validate(resource, json, allowed);
            if (sample["oracle"]?.GetValue<bool>() != true) continue;
            var source = JsonNode.Parse(json)!.AsObject(); var query = ArticleLedgerQuery.Parse(resource);
            var pure = query.Apply(rows.Select(row => row!.DeepClone().AsObject()));
            EqualPage(new JsonObject { ["data"] = pure.Data.DeepClone(), ["meta"] = pure.Meta.DeepClone() }, source, "pure " + name);
            var projectedJson = WorkspaceProjection.Project(resource, null, state) ?? throw new InvalidDataException("Projection missing: " + name);
            var projected = JsonNode.Parse(projectedJson)!.AsObject(); EqualPage(projected, source, "projection " + name);
            Check(projected["_local_ledger"]?["complete"]?.GetValue<bool>() == true, "complete canonical oracle " + name);
            if (sample["sql_fast_path"]!.GetValue<bool>()) fast++; else fallback++;
            if (name == "index-summary") summarySample = sample;
            if (name == "sql-fast-account") fullSample = sample;
            if (resource.Contains("fields=index", StringComparison.Ordinal))
                Check(projected["data"]!.AsArray().All(row => row!.AsObject().Where(pair => !pair.Key.StartsWith('_')).Select(pair => pair.Key)
                    .ToHashSet(StringComparer.Ordinal).SetEquals(["id", "title", "account_id", "platform", "published_at"])), "index remains five-field summary " + name);
            cases++;
        }
        Check(cases >= 50 && fast > 0 && fallback > 0 && rejected == 8, "all source filters, both SQL/fallback paths and query guards covered");
        Check(state.Cache["/api/v1/articles"] == canonical && state.Outbox.Count == 0 && state.Drafts.Count == 0, "oracle projection never changes cached source or creates work");
        if (summarySample == null || fullSample == null) throw new InvalidDataException("Required ledger pages missing.");
        var summaryPath = summarySample["path"]!.GetValue<string>(); var summaryJson = summarySample["response_json"]!.GetValue<string>();
        var partialState = new WorkspaceState { ScopeId = scope, LocalRevision = 1 };
        partialState.Cache[summaryPath] = summaryJson; partialState.CacheRevisions[summaryPath] = 1;
        var partial = JsonNode.Parse(WorkspaceProjection.Project(summaryPath, summaryJson, partialState)!)!.AsObject();
        Check(partial["_local_ledger"]?["complete"]?.GetValue<bool>() == false && partial["meta"]?["total"] is null && partial["meta"]?["unfiltered_total"] is null,
            "isolated index page never becomes complete inventory or invented total");
        var raw = ArticleLedgerResponse.Validate(summaryPath, summaryJson, allowed);
        Check(JsonNode.DeepEquals(raw["meta"], JsonNode.Parse(summaryJson)!["meta"]), "raw server page preserves its original server counts");
        Reject(() => ArticleLedgerResponse.Validate(summaryPath, partial.ToJsonString(), allowed), "local projection cannot masquerade as raw server page");
        var fullPath = fullSample["path"]!.GetValue<string>(); var fullJson = fullSample["response_json"]!.GetValue<string>();
        void Bad(string name, Action<JsonObject> mutate)
        { var data = JsonNode.Parse(fullJson)!.AsObject(); mutate(data); Reject(() => ArticleLedgerResponse.Validate(fullPath, data.ToJsonString(), allowed), name); }
        Bad("mismatched page offset rejected", page => page["meta"]!["offset"] = 1);
        Bad("mismatched complete page count rejected", page => page["meta"]!["total"] = page["meta"]!["total"]!.GetValue<int>() + 1);
        Bad("duplicate returned article ID rejected", page => page["data"]![1]!["id"] = page["data"]![0]!["id"]!.DeepClone());
        Reject(() => ArticleLedgerResponse.Validate(fullPath, fullJson, new HashSet<string>(["synthetic-foreign"])), "foreign-account server page rejected");
        RoutePolicy.Validate("GET", "/api/v1/articles?q=" + Uri.EscapeDataString(new string('中', 300)), allowAuthWrite: false);
        Check(true, "legal 300-CJK query remains allowed beyond old 2048-byte URI cap");
        var prefix = "/api/v1/articles?q=";
        Reject(() => RoutePolicy.Validate("GET", prefix + new string('a', 8193 - prefix.Length), allowAuthWrite: false), "article URI above 8192 rejected");
        Reject(() => RoutePolicy.Validate("GET", "/api/v1/articles?group=account", allowAuthWrite: false), "local grouping is not sent as API filter");
        using (var api = new WorkbenchApi(new NoCalls()))
        {
            try { await api.GetDataAsync("/api/v1/articles?has_warnings=maybe"); }
            catch (ArgumentException) { Check(true, "invalid query fails before any HTTP"); }
        }
        Console.WriteLine($"Article ledger contract: {reads} actual successful Worker reads, {cases} exact Core query/projection oracle pages ({fast} SQL fast/{fallback} fallback), {rejected} real invalid-query responses, {checks} checks; synthetic temporary D1/fake HTTP only, zero external fetch attempts.");
    }
    private sealed class NoCalls : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => throw new InvalidDataException("An invalid article query reached HTTP.");
    }
}
