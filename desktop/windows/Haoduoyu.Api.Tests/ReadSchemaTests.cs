using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Haoduoyu.Api;

internal static class ReadSchemaTests
{
    internal static string CapturedReviewDetail(string kind, string id, string hash)
    {
        var fixture = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "review-form-contract-c30a8a9.json")))!;
        var sample = fixture["samples"]!.AsArray().First(row => row?["name"]?.GetValue<string>() == kind + "-actual-form-load-detail")!;
        var root = JsonNode.Parse(sample["response_json"]!.GetValue<string>())!;
        root["data"]!["id"] = id; root["data"]!["content_hash"] = hash;
        return root.ToJsonString();
    }
    internal static async Task<int> RunAsync()
    {
        const string id = "123e4567-e89b-42d3-a456-426614174000";
        var count = 0;
        var todo = new JsonObject { ["date"] = "2026-11-04", ["today"] = "2026-11-04", ["completed_mode"] = "strike", ["preferences_version"] = 0, ["items"] = new JsonArray() };
        var note = new JsonObject { ["category"] = "life", ["date"] = "2026-11-04", ["can_edit"] = true, ["labels_version"] = 3, ["entries"] = new JsonArray() };
        var malformed = new List<(string Path, JsonNode Data)>
        {
            ("/api/v1/todos?date=2026-11-04", new JsonObject()),
            ("/api/v1/todos?date=2026-11-04", todo.DeepClone()),
            ("/api/v1/todos?date=2026-11-04", todo.DeepClone()),
            ("/api/v1/todos?date=2026-11-04", todo.DeepClone()),
            ("/api/v1/todos?date=2026-11-04", todo.DeepClone()),
            ("/api/v1/todo-templates", new JsonObject { ["items"] = new JsonArray() }),
            ("/api/v1/unscheduled-todos", new JsonObject { ["items"] = new JsonObject() }),
            ("/api/v1/note-entries?category=life&date=2026-11-04", note.DeepClone()),
            ("/api/v1/note-entries?category=life&date=2026-11-04", note.DeepClone()),
            ("/api/v1/note-entries/labels", new JsonObject { ["labels_version"] = 3, ["labels"] = new JsonArray() }),
            ("/api/v1/daily-notes?date=2026-11-04&category=work", new JsonObject { ["date"] = "2026-11-04", ["text"] = "", ["version"] = "0", ["can_edit"] = true, ["deleted"] = false }),
            ("/api/v1/memos", new JsonObject { ["can_edit"] = true, ["groups"] = new JsonArray() }),
            ("/api/v1/memos/notes/" + id, new JsonObject { ["id"] = id, ["version"] = 1 }),
            ("/api/v1/work-reminders?date=2026-11-04", new JsonObject { ["date"] = "2026-11-04", ["can_edit"] = true, ["items"] = new JsonObject() }),
            ("/api/v1/articles?page=1&page_size=50", new JsonArray()),
            ("/api/v1/accounts", new JsonArray(new JsonObject { ["name"] = "synthetic", ["platform"] = "toutiao" })),
            ("/api/v1/review/articles?offset=0", new JsonObject { ["items"] = new JsonArray(), ["has_more"] = false }),
            ("/api/v1/review/articles/" + id, new JsonObject { ["id"] = id, ["content_hash"] = "bad" }),
            ("/api/v1/workbench-snapshot/index?version=2", new JsonObject { ["complete"] = true, ["scope_id"] = new string('a', 64) }),
            ("/api/v1/overview", new JsonObject()),
            ("/api/v1/due-reviews", new JsonObject { ["items"] = new JsonArray() })
        };
        malformed[1].Data["items"] = new JsonObject();
        malformed[2].Data["date"] = "2026-02-30";
        malformed[3].Data["date"] = "2026-11-05";
        malformed[4].Data["items"] = new JsonArray(new JsonObject { ["id"] = "invalid-id", ["version"] = 0, ["date"] = "2026-11-04", ["text"] = "synthetic", ["completed"] = false, ["deleted_at"] = null });
        malformed[7].Data["entries"] = new JsonObject();
        malformed[8].Data["category"] = "work";
        foreach (var badVersion in new JsonNode?[] { JsonValue.Create(0), JsonValue.Create(9_007_199_254_740_992L), JsonValue.Create("1") })
        {
            var data = todo.DeepClone();
            data["items"] = new JsonArray(new JsonObject { ["id"] = id, ["version"] = badVersion, ["date"] = "2026-11-04", ["text"] = "synthetic", ["completed"] = false, ["deleted_at"] = null });
            malformed.Add(("/api/v1/todos?date=2026-11-04", data));
        }
        malformed.Add(("/api/v1/review/articles/" + id, new JsonObject { ["id"] = id, ["content_hash"] = new string('a', 64) }));
        malformed.Add(("/api/v1/accounts", new JsonArray(new JsonObject { ["id"] = "   ", ["name"] = "synthetic", ["platform"] = "toutiao" })));
        foreach (var (path, data) in malformed)
        {
            using var api = new WorkbenchApi(new SchemaHandler(new JsonObject { ["data"] = data }.ToJsonString()));
            try { await api.SendAsync("GET", path, null, ""); }
            catch (ApiCallException error) when (error.StatusCode == 200)
            { count++; Console.WriteLine("PASS incomplete successful read is rejected before cache: " + path); continue; }
            throw new InvalidDataException("Malformed successful read was accepted: " + path);
        }
        var valid = new[]
        {
            (Path:"/api/v1/todos?date=2026-11-04", Data:(JsonNode)todo),
            (Path:"/api/v1/note-entries?category=life&date=2026-11-04", Data:(JsonNode)note),
            (Path:"/api/v1/memos", Data:(JsonNode)new JsonObject { ["can_edit"] = false, ["groups"] = new JsonArray(), ["notes"] = new JsonArray() }),
            (Path:"/api/v1/accounts", Data:(JsonNode)new JsonArray()),
            (Path:"/api/v1/daily-notes?date=2026-11-04", Data:(JsonNode)new JsonObject { ["date"] = "2026-11-04", ["text"] = "", ["version"] = 0, ["deleted"] = false, ["can_edit"] = false }),
            (Path:"/api/v1/review/notes?offset=0", Data:(JsonNode)new JsonObject { ["items"] = new JsonArray(), ["has_more"] = false, ["read_revision"] = 0 })
        };
        foreach (var (path, data) in valid)
        {
            var original = new JsonObject { ["data"] = data.DeepClone(), ["unknown_root"] = new JsonObject { ["preserve"] = true } }.ToJsonString();
            using var api = new WorkbenchApi(new SchemaHandler(original));
            var result = await api.SendAsync("GET", path, null, "");
            if (result.Json != original) throw new InvalidDataException("Read validation altered unknown fields.");
            count++; Console.WriteLine("PASS complete empty collection remains valid and preserves unknown fields: " + path);
        }
        var page = new JsonObject { ["data"] = new JsonArray(), ["meta"] = new JsonObject { ["total"] = 0, ["unfiltered_total"] = 0, ["page"] = 1, ["page_size"] = 50, ["offset"] = 0, ["has_more"] = false, ["pagination"] = "offset", ["unknown_meta"] = "preserved" } }.ToJsonString();
        using (var api = new WorkbenchApi(new SchemaHandler(page)))
        {
            if ((await api.SendAsync("GET", "/api/v1/articles?page=1&page_size=50", null, "")).Json != page) throw new InvalidDataException("Pagination metadata was altered.");
            count++; Console.WriteLine("PASS complete empty article page preserves original pagination metadata");
        }
        return count;
    }

    private sealed class SchemaHandler(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
    }
}
