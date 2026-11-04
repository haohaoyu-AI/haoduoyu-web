using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
using Haoduoyu.Api;

internal static class AiReportTests
{
    internal static async Task<int> RunAsync()
    {
        const string id = "123e4567-e89b-42d3-a456-426614174000";
        var passed = 0;
        void Check(bool condition, string name) { if (!condition) throw new InvalidDataException(name); passed++; Console.WriteLine("PASS " + name); }
        async Task Reject<T>(Func<Task> action, string name) where T : Exception
        { try { await action(); } catch (T) { Check(true, name); return; } throw new InvalidDataException(name + " was accepted"); }
        const string timestamp = "2026-11-04T00:00:00.000Z";
        var request = new JsonObject { ["author"] = "  本次合成署名  ", ["content"] = "  2026-11-04\r\n本次实际合成工作内容。  " };
        var response = new JsonObject { ["id"] = id, ["author"] = "本次合成署名", ["content"] = "2026-11-04\n本次实际合成工作内容。", ["created_at"] = timestamp };
        MutationVerifier.Validate("PUT", "/api/v1/ai-reports/" + id, request.ToJsonString(), response);
        Check(true, "immutable AI report success verifies real fields without requiring an absent PUT hash");
        response["author"] = "different";
        await Reject<JsonException>(() => { MutationVerifier.Validate("PUT", "/api/v1/ai-reports/" + id, request.ToJsonString(), response); return Task.CompletedTask; }, "AI report mismatched author never confirms");
        response["author"] = "本次合成署名"; response["content"] = "different";
        await Reject<JsonException>(() => { MutationVerifier.Validate("PUT", "/api/v1/ai-reports/" + id, request.ToJsonString(), response); return Task.CompletedTask; }, "AI report mismatched content never confirms");
        response["content"] = "2026-11-04\n本次实际合成工作内容。"; response["created_at"] = "invalid-time";
        await Reject<JsonException>(() => { MutationVerifier.Validate("PUT", "/api/v1/ai-reports/" + id, request.ToJsonString(), response); return Task.CompletedTask; }, "AI report missing server creation time never confirms");
        var command = ApiRequests.AppendAiReport(id, string.Concat(Enumerable.Repeat("🐟", 120)), "用户明确提交的合成实际内容。");
        Check(command.Body["author"]!.GetValue<string>().EnumerateRunes().Count() == 120, "AI report author length uses Unicode code points");
        await Reject<ArgumentException>(() => Task.FromResult(ApiRequests.AppendAiReport(id, "", "content")), "AI report never supplies a fabricated default author");
        await Reject<ArgumentException>(() => Task.FromResult(ApiRequests.AppendAiReport(id, "author", "  ")), "AI report requires actual nonempty work content");
        using (var api = new WorkbenchApi(new Handler("{\"data\":{\"items\":[],\"has_more\":false}}")))
        {
            await api.GetDataAsync("/api/v1/ai-reports?offset=0"); Check(true, "complete empty AI report page is valid");
            await Reject<ArgumentException>(() => api.SendAsync("DELETE", "/api/v1/ai-reports/" + id, "{}", id), "permanent AI report deletion is not exposed");
            await Reject<ArgumentException>(() => api.SendAsync("PATCH", "/api/v1/ai-reports/" + id, "{}", id), "immutable AI report editing is not exposed");
            await Reject<ArgumentException>(() => api.GetDataAsync("/api/v1/ai-reports/" + id), "unsupported AI report single GET is not invented");
            foreach (var value in new[] { "01", "-1", "1000000000" })
                await Reject<ArgumentException>(() => api.GetDataAsync("/api/v1/ai-reports?offset=" + value), "AI report offset follows exact source bound: " + value);
        }
        foreach (var malformed in new[] { "{\"data\":{}}", "{\"data\":{\"items\":[],\"has_more\":0}}", "{\"data\":{\"items\":[{\"id\":\"" + id + "\",\"author\":\"synthetic\",\"content\":\"actual synthetic content\",\"created_at\":\"" + timestamp + "\"}],\"has_more\":false}}" })
        {
            using var api = new WorkbenchApi(new Handler(malformed));
            await Reject<ApiCallException>(() => api.GetDataAsync("/api/v1/ai-reports?offset=0"), "incomplete AI report page never replaces cache");
        }
        var items = new JsonArray();
        for (var i = 0; i < 100; i++)
        {
            // Existing server stable() orders these ASCII keys the same way; all values here are ASCII.
            var row = new JsonObject { ["author"] = "synthetic-user-supplied-author", ["content"] = new string('\\', 16_384), ["created_at"] = timestamp, ["id"] = Guid.NewGuid().ToString() };
            row["content_hash"] = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(row.ToJsonString())));
            items.Add(row);
        }
        var page = new JsonObject { ["data"] = new JsonObject { ["items"] = items, ["has_more"] = true } }.ToJsonString();
        Check(Encoding.UTF8.GetByteCount(page) > 2_097_152 && Encoding.UTF8.GetByteCount(page) < WorkbenchApi.MaximumAiReportsResponseBytes, "legal fully escaped AI report page can exceed two MiB");
        using (var api = new WorkbenchApi(new Handler(page)))
            Check((await api.GetDataAsync("/api/v1/ai-reports?offset=0"))!["items"]!.AsArray().Count == 100, "route-specific bounded cap preserves the entire legal AI report page");
        using (var api = new WorkbenchApi(new Handler("{\"data\":{\"items\":[],\"has_more\":false,\"extra\":\"" + new string('x', WorkbenchApi.MaximumAiReportsResponseBytes) + "\"}}")))
            await Reject<ApiCallException>(() => api.GetDataAsync("/api/v1/ai-reports?offset=0"), "AI report page above four MiB is rejected whole");
        return passed;
    }

    internal static async Task ReplayAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!;
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" || fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Unexpected AI report fixture source/isolation.");
        var saved = 0; var conflicts = 0; var reads = 0;
        foreach (var sample in fixture["samples"]!.AsArray())
        {
            var method = sample!["method"]!.GetValue<string>(); var resource = sample["path"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            var json = sample["response_json"]!.GetValue<string>(); var data = JsonNode.Parse(json)!["data"];
            RoutePolicy.Validate(method, resource, false);
            if (method == "GET") { if (status != 200) throw new InvalidDataException(); BusinessReadSchema.Validate(resource, new(status, json)); reads++; }
            else if (status is 200 or 201) { MutationVerifier.Validate(method, resource, sample["body"]!.ToJsonString(), data); saved++; }
            else if (status == 409) conflicts++; else throw new InvalidDataException();
            Console.WriteLine("PASS actual immutable AI report Worker " + sample["name"]!.GetValue<string>());
        }
        if (saved != 2 || conflicts != 1 || reads != 3) throw new InvalidDataException("AI report fixture coverage incomplete.");
        Console.WriteLine($"Actual immutable AI report contract: {saved} create/replay saves, {conflicts} immutable UUID conflict, {reads} full page reads; synthetic temporary Miniflare D1, zero external fetch attempts, no model/provider calls.");
    }

    private sealed class Handler(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
    }
}
