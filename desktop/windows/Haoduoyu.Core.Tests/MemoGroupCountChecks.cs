using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

internal static class MemoGroupCountChecks
{
    internal static int Run()
    {
        var tests = new (string Name, Action Run)[]
        {
            ("Memo group real zero stays distinct from missing counts", () =>
            {
                var counts = MemoGroupCounts.Read(new JsonObject { ["_local_active_note_count"] = 2, ["active_note_count"] = 0 });
                Check(counts.LocalKnown == 2 && counts.ServerCopy == 0 && counts.RequireServerDeleteCount() == 0);
                Check(counts.Description.Contains("本机已知活动数 2 篇", StringComparison.Ordinal) && counts.Description.Contains("服务端副本活动数 0 篇", StringComparison.Ordinal));
            }),
            ("Missing server count is never filled from a known local zero", () =>
            {
                var counts = MemoGroupCounts.Read(new JsonObject { ["_local_active_note_count"] = 0 });
                Check(counts.LocalKnown == 0 && counts.ServerCopy is null && counts.Description.Contains("服务端副本活动数 未取得", StringComparison.Ordinal));
                RejectDelete(counts);
            }),
            ("Missing local count is not filled from the server observation", () =>
            {
                var counts = MemoGroupCounts.Read(new JsonObject { ["active_note_count"] = 7L });
                Check(counts.LocalKnown is null && counts.ServerCopy == 7 && counts.RequireServerDeleteCount() == 7 && counts.Description.Contains("本机已知活动数 未取得", StringComparison.Ordinal));
            }),
            ("JSON integer int and long counts preserve valid safe-integer limits", () =>
            {
                foreach (var row in new[] { new JsonObject { ["active_note_count"] = 3 }, new JsonObject { ["active_note_count"] = 3L },
                    JsonNode.Parse("{\"active_note_count\":3}")!.AsObject(), JsonNode.Parse("{\"active_note_count\":9007199254740991}")!.AsObject() })
                { var value = MemoGroupCounts.Read(row); Check(value.ServerCopy is >= 0 && value.RequireServerDeleteCount() == value.ServerCopy); }
            }),
            ("Malformed negative fractional and unsafe counts remain unknown and block destructive confirmation", () =>
            {
                foreach (var json in new[] { "null", "-1", "1.5", "\"0\"", "true", "[]", "{}", "9007199254740992" })
                {
                    var value = JsonNode.Parse(json); var counts = MemoGroupCounts.Read(new JsonObject { ["active_note_count"] = value, ["_local_active_note_count"] = 9 });
                    Check(counts.ServerCopy is null && counts.LocalKnown == 9); RejectDelete(counts);
                }
            }),
            ("Memo count presentation never mutates original version title count or request evidence", () =>
            {
                var row = new JsonObject { ["id"] = "synthetic-group", ["title"] = "原分组", ["version"] = 4, ["active_note_count"] = 1,
                    ["_local_active_note_count"] = 2, ["_local_request"] = new JsonObject { ["save_id"] = "immutable-proof" } };
                var before = row.ToJsonString(); var counts = MemoGroupCounts.Read(row); _ = counts.Description; _ = counts.RequireServerDeleteCount();
                Check(row.ToJsonString() == before && counts.ServerCopy == 1 && counts.LocalKnown == 2);
            }),
            ("Memo count observations do not share static state across groups", () =>
            {
                var first = MemoGroupCounts.Read(new JsonObject { ["active_note_count"] = 5, ["_local_active_note_count"] = 1 });
                var second = MemoGroupCounts.Read(new JsonObject { ["active_note_count"] = 2, ["_local_active_note_count"] = 8 });
                Check(first.ServerCopy == 5 && first.LocalKnown == 1 && second.ServerCopy == 2 && second.LocalKnown == 8);
            }),
            ("Actual memo projection counts queued and cancelled child intents without rewriting server count", ProjectionCounts)
        };
        var failures = 0;
        foreach (var (name, run) in tests)
            try { run(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failures++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
        Console.WriteLine($"Memo group count checks: {tests.Length - failures}/{tests.Length} passed"); return failures;
    }

    private static void ProjectionCounts()
    {
        var group = Guid.NewGuid().ToString(); var old = Guid.NewGuid().ToString(); var added = Guid.NewGuid().ToString();
        var state = new WorkspaceState { ScopeId = "memo-count-synthetic" };
        state.Cache["/api/v1/memos"] = new JsonObject { ["data"] = new JsonObject
        {
            ["groups"] = new JsonArray(new JsonObject { ["id"] = group, ["title"] = "合成组", ["version"] = 3, ["position"] = 0, ["active_note_count"] = 5, ["deleted_at"] = null }),
            ["notes"] = new JsonArray(new JsonObject { ["id"] = old, ["group_id"] = group, ["title"] = "已知笔记", ["version"] = 2, ["position"] = 0, ["deleted_at"] = null })
        } }.ToJsonString();
        var operation = new PendingOperation { ResourceKey = "/api/v1/memos/notes/" + added, Path = "/api/v1/memos/notes/" + added,
            BodyJson = new JsonObject { ["group_id"] = group, ["title"] = "本机新笔记", ["body"] = "未确认原文", ["version"] = 0, ["save_id"] = Guid.NewGuid().ToString() }.ToJsonString() };
        state.Outbox.Add(operation);
        var before = JsonSerializer.Serialize(state);
        MemoGroupCounts Read() => MemoGroupCounts.Read(JsonNode.Parse(WorkspaceProjection.Project("/api/v1/memos", state.Cache["/api/v1/memos"], state)!)!["data"]!["groups"]![0]!.AsObject());
        var counts = Read(); Check(counts.LocalKnown == 2 && counts.ServerCopy == 5 && counts.RequireServerDeleteCount() == 5);
        Check(before == JsonSerializer.Serialize(state));
        state.Outbox[0] = operation with { Status = PendingStatus.Superseded };
        counts = Read(); Check(counts.LocalKnown == 1 && counts.ServerCopy == 5);
    }
    private static void RejectDelete(MemoGroupCounts counts)
    {
        try { _ = counts.RequireServerDeleteCount(); }
        catch (InvalidOperationException) { return; }
        throw new Exception("Unknown server count was accepted for deletion");
    }
    private static void Check(bool condition) { if (!condition) throw new Exception("Memo count source mismatch"); }
}
