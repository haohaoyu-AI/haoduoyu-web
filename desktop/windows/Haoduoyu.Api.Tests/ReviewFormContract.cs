using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Windows;

internal static class ReviewFormContract
{
    internal static async Task BuildCommandAsync()
    {
        JsonObject output;
        try
        {
            var input = JsonNode.Parse(await Console.In.ReadToEndAsync())!.AsObject();
            var kind = input["kind"]!.GetValue<string>();
            var original = input["original"]?.DeepClone().AsObject() ?? ReviewFormLogic.New(kind,
                input["id"]!.GetValue<string>(), input["account"]!.GetValue<string>(), input["date"]!.GetValue<string>());
            var values = original.DeepClone().AsObject();
            if (input["values"] is JsonObject changes) foreach (var pair in changes) values[pair.Key] = pair.Value?.DeepClone();
            var command = ReviewFormLogic.Build(kind, original, values);
            output = new JsonObject { ["ok"] = true, ["kind"] = kind, ["original"] = original, ["values"] = values,
                ["method"] = command.Method, ["path"] = command.Path, ["body"] = command.Body };
        }
        catch (Exception error) when (error is InvalidOperationException or ArgumentException or FormatException or OverflowException or System.Text.Json.JsonException)
        {
            output = new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
        Console.WriteLine(output.ToJsonString());
    }

    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0 ||
            fixture["commands_from"]?.GetValue<string>() != "Actual shared native ReviewFormLogic.New/Build")
            throw new InvalidDataException("Review form fixture source/isolation does not match.");
        var success = 0; var conflicts = 0; var reads = 0; var noOps = 0;
        var kinds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var sample in fixture["samples"]!.AsArray())
        {
            var name = sample!["name"]!.GetValue<string>(); var method = sample["method"]!.GetValue<string>();
            var resource = sample["path"]!.GetValue<string>(); var body = sample["body"] as JsonObject;
            var status = sample["status"]!.GetValue<int>(); var data = JsonNode.Parse(sample["response_json"]!.GetValue<string>())!["data"];
            RoutePolicy.Validate(method, resource, allowAuthWrite: false);
            if (method == "GET")
            {
                if (status != 200 || data is not JsonObject) throw new InvalidDataException(name);
                BusinessReadSchema.Validate(resource, new Haoduoyu.Core.ApiResult(status, sample["response_json"]!.GetValue<string>()));
                reads++;
            }
            else
            {
                var form = sample["form"]!.AsObject(); var kind = form["kind"]!.GetValue<string>();
                var original = form["original"]!.AsObject();
                var rebuilt = ReviewFormLogic.Build(kind, original, form["values"]!.AsObject());
                if (rebuilt.Method != method || rebuilt.Path != resource || !JsonNode.DeepEquals(rebuilt.Body, body))
                    throw new InvalidDataException("Captured command differs from actual native form builder: " + name);
                ReviewMutationVerifier.ValidateRequest(method, body!.ToJsonString());
                kinds.Add(kind);
                if (status is >= 200 and < 300)
                {
                    MutationVerifier.Validate(method, resource, body.ToJsonString(), data);
                    if (sample["no_op"]?.GetValue<bool>() == true)
                    {
                        if (original["content_hash"]?.GetValue<string>() != data?["content_hash"]?.GetValue<string>())
                            throw new InvalidDataException("Expected exact hash-preserving no-op: " + name);
                        noOps++;
                    }
                    success++;
                }
                else if (status == 409) conflicts++;
                else throw new InvalidDataException($"Unexpected actual Worker status {status}: {name}");
            }
            Console.WriteLine($"PASS actual native form/Worker {name} (HTTP {status})");
        }
        var rejected = 0;
        foreach (var item in fixture["invalid_forms"]!.AsArray())
        {
            var form = item!.AsObject(); var kind = form["kind"]!.GetValue<string>();
            var original = form["original"]!.AsObject();
            try { _ = ReviewFormLogic.Build(kind, original, form["values"]!.AsObject()); }
            catch (Exception error) when (error is InvalidOperationException or ArgumentException or FormatException or OverflowException)
            {
                rejected++; Console.WriteLine("PASS native form rejects " + form["name"]!.GetValue<string>()); continue;
            }
            throw new InvalidDataException("Invalid form was accepted: " + form["name"]!.GetValue<string>());
        }
        if (!kinds.SetEquals(ReviewFormLogic.Kinds) || success < 24 || conflicts < 8 || noOps < 8 || rejected < 5)
            throw new InvalidDataException("All eight native form contracts were not covered.");
        Console.WriteLine($"Actual shared native form contract: {kinds.Count} kinds, {success} successful saves, {conflicts} real hash CAS conflicts, {noOps} exact no-ops, {reads} reads, {rejected} invalid forms rejected; synthetic temporary Miniflare D1 only, zero external fetch attempts.");
    }
}
