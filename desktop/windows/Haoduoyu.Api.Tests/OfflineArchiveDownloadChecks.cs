using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Testing;

internal static class OfflineArchiveDownloadChecks
{
    internal static async Task<int> RunAsync()
    {
        var checks = 0;
        void Check(bool condition, string name) { if (!condition) throw new InvalidDataException(name); checks++; Console.WriteLine("PASS offline archive transport " + name); }
        using var origin = new OfflineArchiveOrigin(); using var api = new WorkbenchApi(origin); api.BindScope(origin.Scope);
        const string local = "synthetic-local-partition-different-from-service";
        var result = await new OfflineDownload(api, clock: () => origin.At).FetchAsync(origin.Scope, local);
        foreach (var archived in new[] { false, true })
        {
            var path = TemplateArchive.ListPath(archived); var list = TemplateArchive.ParseCachedList(path, result.CacheEntries[path], local);
            Check(JsonNode.DeepEquals(list.Data, JsonNode.Parse(origin.Template(archived))!["data"]), "unchanged exact-source membership survives actual transport and complete preparation: " + archived);
            Check(origin.Calls.Count(call => call == path) == 2, "actual fixed-origin transport read each membership and its readback: " + archived);
        }
        Check(result.Records == 4 && result.Dates == 1 && result.ScopeId == origin.Scope, "independent templates counted once outside empty manifest; only two legacy day records also exist");
        var state = new WorkspaceState { ScopeId = local, Cache = new(result.CacheEntries), CacheRevisions = result.CacheEntries.Keys.ToDictionary(key => key, _ => 1L) };
        Check(TemplateArchive.ProjectList(true, state)?["data"]?["items"]?[0]?["id"]?.GetValue<string>() == origin.ArchivedId,
            "real transport output reopens in its local partition without confusing service scope");
        await HeldTransportAsync(Check, cancel: false);
        await HeldTransportAsync(Check, cancel: true);
        return checks;
    }

    private static async Task HeldTransportAsync(Action<bool, string> check, bool cancel)
    {
        using var origin = new OfflineArchiveOrigin { HoldPath = TemplateArchive.ListPath(true), Hold = new(TaskCreationOptions.RunContinuationsAsynchronously) };
        using var api = new WorkbenchApi(origin); api.BindScope(origin.Scope);
        using var cancellation = new CancellationTokenSource();
        var reading = api.SendAsync("GET", origin.HoldPath, null, "", cancellation.Token);
        try
        {
            var heldRequest = origin.HeldRequest;
            check(origin.Calls.SequenceEqual(new[] { origin.HoldPath }) && !origin.Hold.Task.IsCompleted &&
                heldRequest is { IsCompleted: false } && origin.HeldCancellationToken.CanBeCanceled &&
                !origin.HeldCancellationToken.IsCancellationRequested && !reading.IsCompleted,
                "actual API archive reply remains pending before explicit " + (cancel ? "cancellation" : "release"));
            if (cancel)
            {
                cancellation.Cancel();
                var cancelled = false;
                try { await reading; } catch (OperationCanceledException) { cancelled = true; }
                check(cancelled && reading.IsCanceled && heldRequest!.IsCanceled && origin.HeldCancellationToken.IsCancellationRequested && !origin.Hold.Task.IsCompleted,
                    "actual API cancellation ends the held reply without releasing it or fabricating a late success");
            }
            else
            {
                origin.Hold.SetResult();
                var response = await reading;
                check(reading.IsCompletedSuccessfully && heldRequest!.IsCompletedSuccessfully && !origin.HeldCancellationToken.IsCancellationRequested &&
                    response.StatusCode == 200 && response.Json == origin.Template(true),
                    "actual API release returns the held archive reply successfully without timeout/cancellation");
            }
        }
        finally { cancellation.Cancel(); origin.Hold.TrySetResult(); }
    }
}
