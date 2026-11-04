using System.Globalization;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

internal static class HistoryDownloadChecks
{
    internal static async Task<int> RunAsync()
    {
        var checks = 0; var scope = new string('a', 64);
        var at = DateTimeOffset.Parse("2026-11-04T12:00:00Z", CultureInfo.InvariantCulture);
        var range = TodoHistory.Week(new DateOnly(2026, 11, 4));
        void Check(bool condition, string name)
        { if (!condition) throw new InvalidDataException(name); Console.WriteLine("PASS history download " + name); checks++; }
        async Task Reject(Func<Task> action, string name, Type? expected = null, int? status = null)
        {
            try { await action(); }
            catch (Exception error) when (error is InvalidDataException or IOException or RequestNotSentException or OperationCanceledException or ArgumentException)
            {
                if (expected != null && !expected.IsInstanceOfType(error)) throw;
                if (status != null && (error is not ApiCallException apiError || apiError.StatusCode != status)) throw;
                Check(true, name); return;
            }
            throw new InvalidDataException("Expected rejection: " + name);
        }
        Task<TodoHistoryDownloadResult> Fetch(HistoryRemote remote, TodoHistoryDownloadLimits? budget = null,
            Func<DateTimeOffset>? now = null, CancellationToken token = default)
            => new TodoHistoryDownload(remote, budget, now ?? (() => at)).FetchAsync(scope, range, token);
        var remote = new HistoryRemote(scope); var result = await Fetch(remote);
        Check(result.Dates == 7 && result.Rows == 7 && result.CacheEntries.Count == 7, "one complete seven-date batch returned");
        Check(result.ReadRevision == 7 && result.ScopeId == scope && result.ObservedAtUtc == at && result.WireBytes > 0 && result.CacheBytes > 0,
            "batch reports actual revision scope time and bounded bytes");
        Check(remote.Calls.Count == 11 && remote.Calls[0].Path == "/api/v1/workbench-snapshot/index?version=2" &&
            remote.Calls[1].Path == "/api/v1/review/articles?offset=0" && remote.Calls[^2].Path == "/api/v1/review/articles?offset=0&read_revision=7" &&
            remote.Calls[^1].Path == "/api/v1/workbench-snapshot/index?version=2", "scope and global revision bookends surround all daily reads");
        Check(remote.Calls.All(call => call.Method == "GET" && call.Body == null && call.Operation == ""), "all requests are read-only with no operation ID");
        Check(result.CacheEntries.All(pair =>
        {
            var envelope = JsonNode.Parse(pair.Value)!.AsObject(); var data = envelope["data"]!.AsObject();
            var date = DateOnly.ParseExact(data["date"]!.GetValue<string>(), "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var day = TodoHistory.ParseDay(pair.Value, date); var metadata = envelope["_local_todo_history"]!.AsObject();
            return pair.Key == "/api/v1/todos?date=" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) && day.CompletedMode == "hide" && day.Items.Count == 1 &&
                metadata["scope_id"]!.GetValue<string>() == scope && metadata["batch_id"]!.GetValue<string>() == result.BatchId &&
                metadata["range_start"]!.GetValue<string>() == range.Start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) &&
                metadata["range_end"]!.GetValue<string>() == range.End.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) && metadata["read_revision"]!.GetValue<long>() == 7 &&
                !data.ContainsKey("scope_id") && !data.ContainsKey("read_revision");
        }), "cache metadata remains outside unchanged daily business data, including hidden completed items");
        var empty = await Fetch(new HistoryRemote(scope) { Empty = true });
        Check(empty.Rows == 0 && empty.Dates == 7 && empty.CacheEntries.Count == 7, "verified empty dates are distinct from missing dates");
        var leapRange = TodoHistory.Month(new DateOnly(2028, 2, 4)); var leapRemote = new HistoryRemote(scope);
        var leap = await new TodoHistoryDownload(leapRemote, clock: () => at).FetchAsync(scope, leapRange);
        Check(leap.Dates == 29 && leap.Rows == 29 && leapRemote.Calls.Count == 33 &&
            leap.CacheEntries.ContainsKey("/api/v1/todos?date=2028-02-29"), "leap-month capture includes every real date exactly once");

        var broken = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("date=2026-11-04", StringComparison.Ordinal) ? Edit(response, data => data.Remove("items")) : response };
        await Reject(() => Fetch(broken), "missing middle-date items returns no batch", typeof(InvalidDataException));
        var duplicate = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("date=2026-11-03", StringComparison.Ordinal) ? Edit(response, data => data["items"]![0]!["id"] = HistoryRemote.Id(range.Start)) : response };
        await Reject(() => Fetch(duplicate), "same UUID across dates returns no batch", typeof(InvalidDataException));
        var changedToday = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("date=2026-11-04", StringComparison.Ordinal) ? Edit(response, data => data["today"] = "2026-11-05") : response };
        await Reject(() => Fetch(changedToday), "server today change returns no mixed-date batch", typeof(InvalidDataException));
        var changedPreferences = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("date=2026-11-04", StringComparison.Ordinal) ? Edit(response, data => data["preferences_version"] = 8) : response };
        await Reject(() => Fetch(changedPreferences), "preference revision change returns no mixed batch", typeof(InvalidDataException));
        var limited = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("date=2026-11-04", StringComparison.Ordinal) ? new ApiResult(429, "{\"error\":{\"code\":\"RATE_LIMITED\"}}") : response };
        await Reject(() => Fetch(limited), "429 stops without retry or partial batch", typeof(ApiCallException), 429);
        Check(limited.Calls.Count == 5, "rate-limited date is not retried and no later date is read");
        var rejectedRevision = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("read_revision=", StringComparison.Ordinal) ? new ApiResult(409, "{\"error\":{\"code\":\"READ_REVISION_CHANGED\"}}") : response };
        await Reject(() => Fetch(rejectedRevision), "global revision 409 returns no batch", typeof(ApiCallException), 409);
        var wrongRevision = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("read_revision=", StringComparison.Ordinal) ? Edit(response, data => data["read_revision"] = 8) : response };
        await Reject(() => Fetch(wrongRevision), "unexpected successful revision mismatch returns no batch", typeof(InvalidDataException));
        var changedScope = new HistoryRemote(scope) { Change = (path, count, response) =>
            path.Contains("workbench-snapshot", StringComparison.Ordinal) && count > 1 ? Edit(response, data => data["scope_id"] = new string('b', 64)) : response };
        await Reject(() => Fetch(changedScope), "final foreign scope returns no batch", typeof(ScopeGuardException));
        using (var cancellation = new CancellationTokenSource())
        {
            var cancelled = new HistoryRemote(scope) { OnCall = path => { if (path.Contains("date=2026-11-04", StringComparison.Ordinal)) cancellation.Cancel(); } };
            await Reject(() => Fetch(cancelled, token: cancellation.Token), "cancellation after a partial read returns no batch", typeof(OperationCanceledException));
            Check(cancelled.Calls.Count == 5, "cancelled range performs no later read");
        }
        var ticks = 0;
        await Reject(() => Fetch(new HistoryRemote(scope), now: () => ++ticks == 1 ?
            DateTimeOffset.Parse("2026-11-04T15:59:59Z", CultureInfo.InvariantCulture) : DateTimeOffset.Parse("2026-11-04T16:00:01Z", CultureInfo.InvariantCulture)),
            "crossing Beijing midnight returns no batch", typeof(InvalidDataException));
        await Reject(() => Fetch(new HistoryRemote(scope), new(MaxWireBytes: 1)), "total wire budget returns no batch", typeof(InvalidDataException));
        await Reject(() => Fetch(new HistoryRemote(scope), new(MaxCacheBytes: 1)), "encoded cache budget returns no batch", typeof(InvalidDataException));
        await Reject(() => Fetch(new HistoryRemote(scope), new(MaxRows: 1)), "total row budget returns no batch", typeof(InvalidDataException));
        var oversized = new HistoryRemote(scope) { Change = (path, count, response) => path.Contains("/todos?", StringComparison.Ordinal) ?
            response with { Json = new string('x', WorkbenchApi.MaximumResponseBytes + 1) } : response };
        await Reject(() => Fetch(oversized), "single daily wire limit remains one MiB", typeof(InvalidDataException));
        var untouched = new HistoryRemote(scope);
        await Reject(() => new TodoHistoryDownload(untouched).FetchAsync("invalid-scope", range), "invalid expected scope never starts reads", typeof(ArgumentException));
        Check(untouched.Calls.Count == 0, "invalid scope made zero API calls");
        Console.WriteLine($"Todo history download: {checks} checks passed; bounded synthetic GET-only ranges, no engine/store or production requests.");
        return checks;
    }

    private static ApiResult Edit(ApiResult response, Action<JsonObject> edit)
    { var root = JsonNode.Parse(response.Json)!.AsObject(); edit(root["data"]!.AsObject()); return response with { Json = root.ToJsonString() }; }
    private sealed class HistoryRemote(string scope) : IRemoteApi
    {
        internal bool Empty { get; init; }
        internal Func<string, int, ApiResult, ApiResult>? Change { get; init; }
        internal Action<string>? OnCall { get; init; }
        internal List<(string Method, string Path, string? Body, string Operation)> Calls { get; } = [];
        internal static string Id(DateOnly date) => "00000000-0000-4000-8000-" + date.DayNumber.ToString("x12", CultureInfo.InvariantCulture);
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        {
            Calls.Add((method, path, bodyJson, operationId)); OnCall?.Invoke(path); JsonObject data;
            if (path == "/api/v1/workbench-snapshot/index?version=2") data = new() { ["complete"] = true, ["scope_id"] = scope };
            else if (path.StartsWith("/api/v1/review/articles?offset=0", StringComparison.Ordinal))
                data = new() { ["items"] = new JsonArray(), ["has_more"] = false, ["read_revision"] = 7 };
            else if (path.StartsWith("/api/v1/todos?date=", StringComparison.Ordinal))
            {
                var day = DateOnly.ParseExact(path.Split('=')[1], "yyyy-MM-dd", CultureInfo.InvariantCulture);
                var items = new JsonArray();
                if (!Empty) items.Add(new JsonObject { ["id"] = Id(day), ["date"] = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    ["text"] = "合成日期待办 🐟", ["completed"] = day.DayNumber % 2 == 0, ["version"] = 1,
                    ["created_at"] = "2026-11-04T12:00:00.000Z", ["updated_at"] = "2026-11-04T12:00:00.000Z", ["deleted_at"] = null });
                data = new() { ["date"] = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), ["today"] = "2026-11-04",
                    ["completed_mode"] = "hide", ["preferences_version"] = 7, ["items"] = items };
            }
            else throw new InvalidOperationException("Unexpected history read " + path);
            var result = new ApiResult(200, new JsonObject { ["data"] = data }.ToJsonString());
            return Task.FromResult(Change?.Invoke(path, Calls.Count, result) ?? result);
        }
    }
}
