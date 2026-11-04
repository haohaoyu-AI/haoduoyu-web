using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Windows;

internal static class ArticlePipelineContract
{
    private static (JsonObject Original, JsonObject Changes, JsonObject Values) Form(JsonObject input)
    {
        var original = input["original"]?.DeepClone().AsObject() ?? throw new InvalidDataException("Article form original is required.");
        var changes = input["changes"]?.DeepClone().AsObject() ?? new JsonObject();
        var values = ArticlePipelineFormLogic.FormValues(original);
        foreach (var pair in changes) values[pair.Key] = pair.Value?.DeepClone();
        return (original, changes, values);
    }

    internal static async Task BuildCommandAsync()
    {
        var input = JsonNode.Parse(await Console.In.ReadToEndAsync())!.AsObject();
        JsonObject output;
        try
        {
            var form = Form(input);
            var command = ArticlePipelineFormLogic.Build(form.Original, form.Values);
            output = new JsonObject { ["ok"] = true, ["original"] = form.Original, ["changes"] = form.Changes,
                ["values"] = form.Values, ["method"] = command.Method, ["path"] = command.Path, ["body"] = command.Body };
        }
        catch (Exception error) when (error is InvalidOperationException or InvalidDataException or ArgumentException or FormatException or OverflowException or System.Text.Json.JsonException)
        {
            // Invalid UTF-16 evidence may intentionally be unreadable; never serialize it again in the error response.
            output = new JsonObject { ["ok"] = false, ["error"] = error.Message };
        }
        Console.WriteLine(output.ToJsonString());
    }

    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0 ||
            fixture["commands_from"]?.GetValue<string>() != "Actual shared native ArticlePipelineFormLogic.FormValues/Build")
            throw new InvalidDataException("Article pipeline fixture source/isolation does not match.");
        var successful = 0; var creates = 0; var updates = 0; var conflicts = 0; var reads = 0; var rejected = 0;
        JsonNode? beforeConflict = null; var verifiedConflictReadback = false;
        foreach (var entry in fixture["samples"]!.AsArray())
        {
            var sample = entry!.AsObject(); var name = sample["name"]!.GetValue<string>();
            var method = sample["method"]!.GetValue<string>(); var resource = sample["path"]!.GetValue<string>();
            var status = sample["status"]!.GetValue<int>();
            var responseJson = sample["response_json"]!.GetValue<string>(); var data = JsonNode.Parse(responseJson)!["data"];
            RoutePolicy.Validate(method, resource, allowAuthWrite: false);
            if (method == "GET")
            {
                if (status != 200) throw new InvalidDataException(name);
                BusinessReadSchema.Validate(resource, new Haoduoyu.Core.ApiResult(status, responseJson));
                if (name == "before-real-cas-conflict") beforeConflict = data?.DeepClone();
                if (name == "after-real-cas-conflict")
                {
                    if (beforeConflict == null || !JsonNode.DeepEquals(beforeConflict, data))
                        throw new InvalidDataException("A real stale native save changed the server article.");
                    verifiedConflictReadback = true;
                }
                reads++;
            }
            else
            {
                var captured = sample["form"]!.AsObject(); var form = Form(captured);
                if (!JsonNode.DeepEquals(form.Values, captured["values"]))
                    throw new InvalidDataException("Captured values differ from actual native form initialization: " + name);
                var built = ArticlePipelineFormLogic.Build(form.Original, form.Values);
                if (built.Method != method || built.Path != resource || !JsonNode.DeepEquals(built.Body, sample["body"]))
                    throw new InvalidDataException("Captured command differs from actual native article form: " + name);
                if (status is >= 200 and < 300)
                {
                    MutationVerifier.Validate(method, resource, built.Body.ToJsonString(), data);
                    if (method == "POST")
                    {
                        if (built.Body.ContainsKey("id") || built.Body.ContainsKey("version") ||
                            data?["id"]?.GetValue<string>() == form.Original["id"]?.GetValue<string>())
                            throw new InvalidDataException("Article create guessed or reused its local draft ID as server identity.");
                        creates++;
                    }
                    else
                    {
                        if (method != "PUT" || resource != "/api/v1/articles/" + form.Original["id"]!.GetValue<string>() ||
                            built.Body["version"]?.GetValue<long>() != form.Original["version"]?.GetValue<long>())
                            throw new InvalidDataException("Article edit lost the server-assigned ID or its original CAS version.");
                        updates++;
                    }
                    successful++;
                }
                else if (status == 409) conflicts++;
                else throw new InvalidDataException($"Unexpected actual article Worker status {status}: {name}");
            }
            Console.WriteLine($"PASS actual native article pipeline/Worker {name} (HTTP {status})");
        }
        foreach (var entry in fixture["invalid_forms"]!.AsArray())
        {
            var invalid = entry!.AsObject();
            try { var form = Form(invalid); _ = ArticlePipelineFormLogic.Build(form.Original, form.Values); }
            catch (Exception error) when (error is InvalidOperationException or InvalidDataException or ArgumentException or FormatException or OverflowException or System.Text.Json.JsonException)
            {
                rejected++; Console.WriteLine("PASS native article form rejects " + invalid["name"]!.GetValue<string>()); continue;
            }
            throw new InvalidDataException("Invalid native article form was accepted: " + invalid["name"]!.GetValue<string>());
        }
        if (creates < 2 || updates < 3 || conflicts < 1 || reads < 4 || rejected < 15 || !verifiedConflictReadback)
            throw new InvalidDataException("Native article pipeline coverage is incomplete.");
        Console.WriteLine($"Actual shared native article pipeline contract: {successful} successful saves ({creates} creates/{updates} updates), {conflicts} real version CAS conflicts with unchanged readback, {reads} reads, {rejected} invalid forms rejected; synthetic temporary Miniflare D1 only, zero external fetch attempts.");
    }
}
