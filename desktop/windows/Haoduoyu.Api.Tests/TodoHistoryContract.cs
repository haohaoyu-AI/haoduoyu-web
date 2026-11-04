using System.Globalization;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class TodoHistoryContract
{
    internal static async Task RunAsync(string path)
    {
        var fixture = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
        if (fixture["source_commit"]?.GetValue<string>() != "c30a8a956715b6ea809db4b87c0f4fcddf8f61de" ||
            fixture["synthetic_only"]?.GetValue<bool>() != true || fixture["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Todo history fixture source/isolation mismatch.");
        var checks = 0; var successful = 0; var rejected = 0;
        void Check(bool condition, string name)
        { if (!condition) throw new InvalidDataException(name); Console.WriteLine("PASS todo history contract " + name); checks++; }
        var samples = fixture["samples"]!.AsArray().Select(value => value!.AsObject()).ToArray();
        foreach (var sample in samples)
        {
            var route = sample["path"]!.GetValue<string>(); var status = sample["status"]!.GetValue<int>();
            var name = sample["name"]!.GetValue<string>(); var json = sample["response_json"]!.GetValue<string>();
            if (status == 400)
            {
                if (sample["local_query_rejection"]!.GetValue<bool>())
                {
                    var denied = false;
                    try { RoutePolicy.Validate("GET", route, allowAuthWrite: false); }
                    catch (ArgumentException) { denied = true; }
                    Check(denied, "duplicate query rejected before native request and by real Worker");
                }
                else Check(name == "invalid-real-calendar-date-rejected", "real Worker rejects invalid calendar date");
                rejected++; continue;
            }
            if (status != 200) throw new InvalidDataException(name);
            RoutePolicy.Validate("GET", route, allowAuthWrite: false);
            BusinessReadSchema.Validate(route, new ApiResult(status, json));
            if (route.StartsWith("/api/v1/todos", StringComparison.Ordinal))
            {
                var data = JsonNode.Parse(json)!["data"]!;
                var date = DateOnly.ParseExact(data["date"]!.GetValue<string>(), "yyyy-MM-dd", CultureInfo.InvariantCulture);
                _ = TodoHistory.ParseDay(json, date);
            }
            Check(true, "actual Worker " + name); successful++;
        }
        Check(successful == 12 && rejected == 2 && samples.Length == 14, "all fourteen real GET responses covered");
        var wanted = fixture["batch_sample_names"]!.AsArray().Select(name => name!.GetValue<string>()).ToArray();
        var batch = wanted.Select(name => samples.Single(sample => sample["name"]!.GetValue<string>() == name)).ToArray();
        var replay = new CapturedRange(batch);
        var anchor = DateOnly.ParseExact(fixture["range_anchor"]!.GetValue<string>(), "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var range = TodoHistory.Week(anchor);
        var observed = DateTimeOffset.Parse(fixture["generated_at"]!.GetValue<string>(), CultureInfo.InvariantCulture);
        var result = await new TodoHistoryDownload(replay, clock: () => observed).FetchAsync(fixture["expected_scope_id"]!.GetValue<string>(), range);
        Check(replay.Consumed == wanted.Length && replay.Consumed == 11 && result.Dates == 7 && result.CacheEntries.Count == 7,
            "actual source scope/revision/day responses form one complete bounded native batch");
        Check(result.Rows == fixture["expected_rows"]!.GetValue<int>() && result.ReadRevision == fixture["expected_read_revision"]!.GetValue<long>(),
            "native batch retains actual row total and global revision");
        foreach (var date in range.Dates)
        {
            var route = "/api/v1/todos?date=" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var source = samples.Single(sample => sample["path"]!.GetValue<string>() == route);
            var day = TodoHistory.ParseDay(result.CacheEntries[route], date);
            Check(JsonNode.DeepEquals(day.Data, JsonNode.Parse(source["response_json"]!.GetValue<string>())!["data"]), "cache business payload is unchanged for " + date);
        }
        var populated = DateOnly.ParseExact(fixture["populated_date"]!.GetValue<string>(), "yyyy-MM-dd", CultureInfo.InvariantCulture);
        var populatedKey = "/api/v1/todos?date=" + populated.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var filled = TodoHistory.ParseDay(result.CacheEntries[populatedKey], populated);
        var expectedIds = fixture["active_ids"]!.AsArray().Select(id => id!.GetValue<string>()).ToHashSet(StringComparer.Ordinal);
        Check(filled.CompletedMode == "hide" && filled.Items.Count == 2 && filled.Items.Any(row => row["completed"]!.GetValue<bool>()) &&
            filled.Items.Any(row => !row["completed"]!.GetValue<bool>()) && filled.Items.Select(row => row["id"]!.GetValue<string>()).ToHashSet(StringComparer.Ordinal).SetEquals(expectedIds) &&
            filled.Items.All(row => row["id"]!.GetValue<string>() != fixture["deleted_id"]!.GetValue<string>()),
            "hide preference preserves all active completion states while source soft deletions stay excluded");
        Console.WriteLine($"Todo history source contract: {samples.Length} actual GET-only Worker requests ({successful} successful reads/{rejected} invalid-query responses), 11-response native range replay, {checks} checks passed; temporary synthetic D1 only, zero external fetch attempts.");
    }

    private sealed class CapturedRange(IReadOnlyList<JsonObject> samples) : IRemoteApi
    {
        internal int Consumed { get; private set; }
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (Consumed >= samples.Count || method != "GET" || bodyJson != null || operationId.Length != 0)
                throw new InvalidDataException("Native history loader issued an unexpected or non-read-only request.");
            var expected = samples[Consumed++];
            if (path != expected["path"]!.GetValue<string>()) throw new InvalidDataException("Native history loader request order differs from captured actual source contract.");
            return Task.FromResult(new ApiResult(expected["status"]!.GetValue<int>(), expected["response_json"]!.GetValue<string>()));
        }
    }
}
