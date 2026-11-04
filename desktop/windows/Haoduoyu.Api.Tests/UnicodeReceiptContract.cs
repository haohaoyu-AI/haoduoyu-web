using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class UnicodeReceiptContract
{
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Unicode receipt fixture source/isolation mismatch.");
        var writes = 0; var reads = 0; var assertions = 0;
        foreach (var sample in fixture["samples"]!.AsArray())
        {
            var method = sample!["method"]!.GetValue<string>(); var resource = sample["path"]!.GetValue<string>();
            var json = sample["response_json"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            RoutePolicy.Validate(method, resource, allowAuthWrite: false);
            if (status is < 200 or >= 300) throw new InvalidDataException("Unexpected synthetic Worker status.");
            if (method == "GET") { BusinessReadSchema.Validate(resource, new ApiResult(status, json)); reads++; }
            else { MutationVerifier.Validate(method, resource, sample["body_json"]!.GetValue<string>(), JsonNode.Parse(json)!["data"]); writes++; }
            assertions++;
        }
        var receipts = 0;
        foreach (var sample in fixture["reconciliations"]!.AsArray())
        {
            var resource = sample!["path"]!.GetValue<string>(); var body = JsonNode.Parse(sample["body_json"]!.GetValue<string>())!.AsObject();
            var receipt = JsonNode.Parse(sample["receipt_json"]!.GetValue<string>())!["data"]!;
            var entityJson = sample["entity_json"]!.GetValue<string>(); var entity = JsonNode.Parse(entityJson)!["data"]!.AsObject();
            if (ReceiptVerifier.Verify("PUT", resource, body, receipt, entity, entityJson).Outcome != ReconciliationOutcome.Confirmed)
                throw new InvalidDataException("Actual Unicode Worker receipt failed: " + sample["name"]!.GetValue<string>());
            assertions++;
            var changed = (JsonObject)entity.DeepClone(); var textField = resource.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal) ? "text" : "title";
            changed[textField] = changed[textField]!.GetValue<string>() + " changed";
            if (ReceiptVerifier.Verify("PUT", resource, body, receipt, changed, entityJson).Outcome != ReconciliationOutcome.Conflict)
                throw new InvalidDataException("Changed Unicode content was incorrectly confirmed.");
            assertions++;
            var missing = (JsonObject)receipt.DeepClone(); missing["found"] = false;
            if (ReceiptVerifier.Verify("PUT", resource, body, missing, entity, entityJson).Outcome != ReconciliationOutcome.Unconfirmed)
                throw new InvalidDataException("Missing receipt was incorrectly confirmed.");
            assertions++; receipts++;
        }
        if (writes != 3 || reads != 7 || receipts != 3) throw new InvalidDataException("Unicode receipt coverage is incomplete.");
        Console.WriteLine($"Unicode Worker contract: {writes + reads} actual requests, {receipts} Unicode receipt/hash confirmations, {assertions} assertions passed; zero external fetch attempts.");
    }
}
