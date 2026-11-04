using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;

internal static class WorkerContract
{
    internal static async Task RunAsync(string path)
    {
        var document = JsonNode.Parse(await File.ReadAllTextAsync(path))?.AsObject()
            ?? throw new InvalidDataException("Worker contract fixture is missing.");
        if (document["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            document["synthetic_only"]?.GetValue<bool>() != true || document["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Worker contract source or isolation evidence does not match.");
        var samples = document["samples"]?.AsArray() ?? throw new InvalidDataException("No Worker samples.");
        var writes = 0; var conflicts = 0; var reads = 0;
        foreach (var sample in samples)
        {
            var name = sample!["name"]!.GetValue<string>();
            var method = sample["method"]!.GetValue<string>();
            var resource = sample["path"]!.GetValue<string>();
            var status = sample["status"]!.GetValue<int>();
            var bodyJson = sample["body_json"]?.GetValue<string>();
            var responseJson = sample["response_json"]!.GetValue<string>();
            RoutePolicy.Validate(method, resource, allowAuthWrite: false);
            var response = JsonNode.Parse(responseJson)?.AsObject() ?? throw new InvalidDataException(name);
            if (status is >= 200 and < 300)
            {
                if (response["data"] is not (JsonObject or JsonArray)) throw new InvalidDataException(name + " lacks data");
                if (method == "GET") reads++;
                else
                {
                    if (resource.StartsWith("/api/v1/review/", StringComparison.Ordinal)) ReviewMutationVerifier.ValidateRequest(method, bodyJson);
                    MutationVerifier.Validate(method, resource, bodyJson, response["data"]);
                    writes++;
                }
            }
            else if (status == 409 && response["error"] is JsonObject) conflicts++;
            else throw new InvalidDataException($"Unexpected Worker status in {name}: {status}");
            Console.WriteLine($"PASS Worker contract {name} (HTTP {status})");
        }
        var receipts = 0;
        foreach (var sample in document["reconciliations"]?.AsArray() ?? [])
        {
            var method = sample!["method"]!.GetValue<string>(); var resource = sample["path"]!.GetValue<string>();
            var body = JsonNode.Parse(sample["body_json"]!.GetValue<string>())!.AsObject();
            var receipt = JsonNode.Parse(sample["receipt_json"]!.GetValue<string>())!["data"];
            var entityJson = sample["entity_json"]!.GetValue<string>();
            var entity = JsonNode.Parse(entityJson)!["data"];
            if (ReceiptVerifier.Verify(method, resource, body, receipt, entity, entityJson).Outcome != ReconciliationOutcome.Confirmed)
                throw new InvalidDataException("Real Worker receipt did not confirm: " + sample["name"]!.GetValue<string>());
            receipts++; Console.WriteLine("PASS Worker receipt " + sample["name"]!.GetValue<string>());
        }
        if (writes < 30 || conflicts < 2 || reads < 3 || receipts != 2) throw new InvalidDataException("Worker contract coverage is incomplete.");
        Console.WriteLine($"Actual Worker contract: {writes} successful mutation responses validated, {conflicts} real CAS rejections, {reads} reads, {receipts} actual receipt/hash confirmations; source c30a8a9, synthetic temporary Miniflare D1 only, zero external fetch attempts.");
    }
}
