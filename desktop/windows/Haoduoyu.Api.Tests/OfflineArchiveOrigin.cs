using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Testing;

// Shared by Linux transport checks and shown-WPF checks. Every request ends here, never at a socket.
// Template records and list windows are unchanged 34bff302 samples. Other modules use empty
// synthetic collections / existing captured read-only reports, not a claimed Worker transaction.
internal sealed class OfflineArchiveOrigin : HttpMessageHandler
{
    private readonly JsonObject templates = Fixture("template-archive-contract-34bff302.json");
    internal string Scope { get; } = new('d', 64);
    internal string Date => templates["date"]!.GetValue<string>();
    internal DateTimeOffset At => DateTimeOffset.Parse(Date + "T04:00:00Z", CultureInfo.InvariantCulture);
    internal string ArchivedId => templates["ids"]!["template"]!.GetValue<string>();
    internal string ActiveId => templates["ids"]!["keep_active"]!.GetValue<string>();
    internal List<string> Calls { get; } = [];
    internal bool Offline { get; set; }
    internal Func<string, int, ApiResult, ApiResult>? Alter { get; set; }
    internal string? HoldPath { get; set; }
    internal int HoldOccurrence { get; set; } = 1;
    internal TaskCompletionSource? Hold { get; set; }
    // Keep the held reply and HttpClient's linked token, not just its arrival count:
    // a timeout/cancellation must not look like a still-pending late response.
    internal Task<HttpResponseMessage>? HeldRequest { get; private set; }
    internal CancellationToken HeldCancellationToken { get; private set; }
    internal string Template(bool archived) => Sample(templates, archived ? "owner-paired-archived" : "owner-paired-active");
    internal async Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (request.Method != HttpMethod.Get || request.Content != null || request.Headers.Contains("Idempotency-Key") ||
            request.RequestUri?.GetLeftPart(UriPartial.Authority) != "https://haoduoyu.xyz" ||
            !request.Headers.TryGetValues("Origin", out var origins) || !origins.SequenceEqual(new[] { "https://haoduoyu.xyz" }))
            throw new InvalidOperationException("Complete-offline synthetic transport rejects writes, bodies, operation IDs and other origins.");
        if (Offline) throw new InvalidOperationException("Offline native view unexpectedly requested HTTP.");
        var path = request.RequestUri!.PathAndQuery; Calls.Add(path); var occurrence = Calls.Count(value => value == path);
        if (path == HoldPath && occurrence == HoldOccurrence && Hold != null)
        {
            HeldCancellationToken = cancellationToken;
            var reply = ReplyAfterHoldAsync(Hold.Task, path, occurrence, cancellationToken);
            HeldRequest = reply;
            return await reply;
        }
        return Response(path, occurrence);
    }
    private async Task<HttpResponseMessage> ReplyAfterHoldAsync(Task hold, string path, int occurrence, CancellationToken cancellationToken)
    {
        await hold.WaitAsync(cancellationToken);
        return Response(path, occurrence);
    }
    private HttpResponseMessage Response(string path, int occurrence)
    {
        var result = new ApiResult(200, Build(path)); result = Alter?.Invoke(path, occurrence, result) ?? result;
        return new((HttpStatusCode)result.StatusCode) { Content = new StringContent(result.Json, Encoding.UTF8, "application/json") };
    }
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request, cancellationToken);
    private string Build(string path)
    {
        var route = path.Split('?')[0]; var today = Date;
        if (route == "/api/v1/workbench-snapshot/index") return Wrap(Index());
        if (route == "/api/v1/workbench-snapshot")
        {
            var data = new JsonObject();
            foreach (var key in new[] { "todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos", "unscheduled_todos", "note_labels" }) data[key] = new JsonArray();
            var snapshot = Index(); snapshot.Remove("index_hash"); snapshot.Remove("dates"); snapshot["date"] = today;
            snapshot["date_content_hash"] = snapshot["global_content_hash"]!.DeepClone(); snapshot["data"] = data;
            snapshot["content_hash"] = Hash(new JsonObject { ["snapshot_format"] = "haoduoyu-workbench-snapshot-v2", ["scope_id"] = Scope,
                ["date"] = today, ["timezone"] = "Asia/Shanghai", ["data"] = data.DeepClone() });
            return Wrap(snapshot);
        }
        if (path == TemplateArchive.ListPath(false)) return Template(false);
        if (path == TemplateArchive.ListPath(true)) return Template(true);
        if (route == TemplateArchive.ListPath(false)) throw new InvalidOperationException("No template pagination or other query exists.");
        if (route == "/api/v1/article-reconciliation") return Sample(Fixture("article-reconciliation-contract-c30a8a9.json"), "complete-empty-public-inventory");
        if (route == "/api/v1/overview") return Sample(Fixture("media-review-contract-c30a8a9.json"), "overview-yesterday-all");
        if (route.StartsWith("/api/v1/review/", StringComparison.Ordinal)) return "{\"data\":{\"items\":[],\"has_more\":false,\"read_revision\":7}}";
        if (route == "/api/v1/ai-reports") return "{\"data\":{\"items\":[],\"has_more\":false}}";
        if (route == "/api/v1/articles") return "{\"data\":[],\"meta\":{\"total\":0,\"unfiltered_total\":0,\"page\":1,\"page_size\":100,\"offset\":0,\"has_more\":false,\"pagination\":\"offset\"}}";
        if (route is "/api/v1/accounts" or "/api/v1/account-profiles" or "/api/v1/observations" or "/api/v1/daily-metrics" or "/api/v1/due-reviews") return "{\"data\":[]}";
        if (route == "/api/v1/todos") return Wrap(new JsonObject { ["date"] = today, ["today"] = today, ["completed_mode"] = "strike", ["preferences_version"] = 0, ["items"] = new JsonArray() });
        if (route == "/api/v1/unscheduled-todos") return "{\"data\":{\"items\":[]}}";
        if (route == "/api/v1/work-reminders") return Wrap(new JsonObject { ["date"] = today, ["can_edit"] = true, ["items"] = new JsonArray() });
        if (route == "/api/v1/note-entries/labels") return "{\"data\":{\"labels\":[],\"archived_labels\":[],\"labels_version\":3}}";
        if (route == "/api/v1/note-entries") return Wrap(new JsonObject { ["date"] = today, ["category"] = path.Contains("category=life", StringComparison.Ordinal) ? "life" : "work",
            ["can_edit"] = true, ["labels_version"] = 3, ["entries"] = new JsonArray() });
        if (route == "/api/v1/daily-notes") return Wrap(new JsonObject { ["date"] = today, ["can_edit"] = true, ["version"] = 0, ["text"] = "", ["deleted"] = false });
        if (route == "/api/v1/todo-preferences") return "{\"data\":{\"completed_mode\":\"strike\",\"version\":0}}";
        if (route == "/api/v1/memos") return "{\"data\":{\"can_edit\":true,\"groups\":[],\"notes\":[]}}";
        throw new InvalidOperationException("Unexpected complete-offline fixture request: " + path);
    }
    private JsonObject Index()
    {
        var manifest = Hash(new JsonObject { ["snapshot_format"] = "haoduoyu-workbench-snapshot-v2", ["scope_id"] = Scope, ["entities"] = new JsonArray() });
        return new JsonObject { ["snapshot_format"] = "haoduoyu-workbench-snapshot-v2", ["projection"] = "current", ["complete"] = true,
            ["scope_id"] = Scope, ["timezone"] = "Asia/Shanghai", ["generated_at"] = At.ToString("O", CultureInfo.InvariantCulture),
            ["manifest_hash"] = manifest, ["index_hash"] = manifest, ["global_content_hash"] = Hash(new JsonObject { ["scope_id"] = Scope, ["entities"] = new JsonArray() }),
            ["entities"] = new JsonArray(), ["dates"] = new JsonArray() };
    }
    private static string Wrap(JsonObject data) => new JsonObject { ["data"] = data }.ToJsonString();
    private static JsonObject Fixture(string filename)
    {
        var root = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", filename)))!.AsObject();
        if (root["synthetic_only"]?.GetValue<bool>() != true || root["external_fetch_attempts"]?.GetValue<int>() != 0)
            throw new InvalidDataException("Only isolated synthetic source captures are supported.");
        return root;
    }
    private static string Sample(JsonObject fixture, string name) => fixture["samples"]!.AsArray().Single(row => row!["name"]!.GetValue<string>() == name)!["response_json"]!.GetValue<string>();
    private static string Hash(JsonNode node) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Sort(node)!.ToJsonString())));
    private static JsonNode? Sort(JsonNode? node) => node switch
    {
        JsonObject obj => new JsonObject(obj.OrderBy(pair => pair.Key, StringComparer.Ordinal).Select(pair => KeyValuePair.Create(pair.Key, Sort(pair.Value)))),
        JsonArray array => new JsonArray(array.Select(Sort).ToArray()), _ => node?.DeepClone()
    };
}
