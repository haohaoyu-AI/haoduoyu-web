using System.Text.Json;
using System.Text.Json.Nodes;
using System.Globalization;

namespace Haoduoyu.Api;

internal static class MutationVerifier
{
    internal static void Validate(string method, string path, string? bodyJson, JsonNode? data)
    {
        var body = JsonNode.Parse(bodyJson ?? "{}") as JsonObject;
        if (body is null || data is not JsonObject result) Invalid();
        body = (JsonObject)JsonNode.Parse(bodyJson ?? "{}")!;
        var response = data!.AsObject();
        var route = path.Split('?')[0];
        var segments = route.Split('/');
        var resource = segments[3];
        if (resource == "review")
        {
            ReviewMutationVerifier.Validate(method, path, body, response);
            return;
        }
        string? id = segments.Length > 4 ? segments[4] : body["id"]?.GetValue<string>();
        if (resource == "memos") id = segments[5];

        if (resource == "unscheduled-todos" && segments.Length > 5 && segments[5] is "move" or "complete-today")
        {
            if (response["source"] is not JsonObject source || response["todo"] is not JsonObject todo ||
                source["id"]?.GetValue<string>() != id || todo["id"]?.GetValue<string>() != id ||
                source["deleted_at"] is null || Number(source["version"]) != Number(body["version"]) + 1 ||
                !Equal(body["date"], todo["date"], "date") || !Equal(source["text"], todo["text"], "text") ||
                (segments[5] == "complete-today" ? source["completed"]?.GetValue<bool>() != true || todo["completed"]?.GetValue<bool>() != true :
                    !Equal(source["completed"], todo["completed"], "completed"))) Invalid();
            return;
        }

        if (resource == "todos" && route.EndsWith("/template", StringComparison.Ordinal))
        {
            if (response["todo"] is not JsonObject todo || response["template"] is not JsonObject template ||
                todo["id"]?.GetValue<string>() != id || !Equal(body["template_id"], todo["template_id"], "template_id") ||
                !Equal(body["template_id"], template["id"], "id") || !SameOrNext(body, todo) ||
                !Equal(body["date"], todo["date"], "date") || !Equal(template["text"], todo["text"], "text") ||
                todo["template_active"]?.GetValue<bool>() != true ||
                Number(todo["template_version"]) != Number(template["version"]) ||
                Number(template["version"]) != Number(body["template_version"]) && Number(template["version"]) != Number(body["template_version"]) + 1)
                Invalid();
            return;
        }

        if (resource == "todo-preferences")
        {
            if (!Equal(body["completed_mode"], response["completed_mode"], "completed_mode") ||
                !SameOrNext(body, response)) Invalid();
            return;
        }
        if (route == "/api/v1/note-entries/labels")
        {
            if (!Equal(body["name"], response["name"], "name", "labels")) Invalid();
            switch (body["action"]?.GetValue<string>())
            {
                case "archive":
                    if (!response.ContainsKey("archived_at") || !DateTimeOffset.TryParse(response["archived_at"]?.GetValue<string>(), CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) Invalid();
                    break;
                case "restore":
                    if (!response.ContainsKey("archived_at") || response["archived_at"] is not null) Invalid();
                    break;
                case "delete":
                    if (response["deleted"]?.GetValue<bool>() != true || response["mode"]?.GetValue<string>() != (body["name"]?.GetValue<string>() is "生活" or "工作" ? "builtin-hidden" : "deleted")) Invalid();
                    break;
                case null:
                    if (!DateTimeOffset.TryParse(response["created_at"]?.GetValue<string>(), CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) Invalid();
                    break;
                default: Invalid(); break;
            }
            return;
        }
        if (resource == "daily-notes")
        {
            if (response["date"]?.GetValue<string>() != id || !SameOrNext(body, response)) Invalid();
        }
        else
        {
            var returnedId = response["id"]?.GetValue<string>();
            if (string.IsNullOrEmpty(returnedId) || id is not null && id != returnedId) Invalid();
        }
        if (resource == "todo-templates" && method == "DELETE")
        {
            if (response["deleted"]?.GetValue<bool>() != true) Invalid();
            return;
        }
        if (resource is "todos" or "unscheduled-todos" or "todo-templates" or "note-entries" or "memos" or "work-reminders" or "articles")
        {
            var version = Number(response["version"]);
            var original = Number(body["version"]);
            if (version is null || version < 1) Invalid();
            if (original is not null)
            {
                var noOpAllowed = resource == "work-reminders" || (resource is "todos" or "unscheduled-todos") && method != "PATCH";
                var validVersion = noOpAllowed ? version == original || version == original + 1 : version == original + 1;
                if (!validVersion) Invalid();
            }
            else if (version != 1) Invalid();
        }
        if (method == "DELETE" || route.EndsWith("/restore", StringComparison.Ordinal))
        {
            if (!response.ContainsKey(resource == "daily-notes" ? "deleted" : "deleted_at")) Invalid();
            var deleted = resource == "daily-notes" ? response["deleted"]?.GetValue<bool>() == true : response["deleted_at"] is not null;
            if (deleted != (method == "DELETE")) Invalid();
            return;
        }
        foreach (var pair in body.Where(pair => pair.Key is not ("id" or "version" or "save_id" or "template_version")))
        {
            if (!response.ContainsKey(pair.Key) || !Equal(pair.Value, response[pair.Key], pair.Key, resource)) Invalid();
        }
    }

    private static bool SameOrNext(JsonObject body, JsonObject response)
    {
        var original = Number(body["version"]); var version = Number(response["version"]);
        return original is not null && version is not null && (version == original || version == original + 1);
    }

    private static long? Number(JsonNode? node)
    {
        if (node is not JsonValue value) return null;
        if (value.TryGetValue<long>(out var number)) return number;
        return value.TryGetValue<int>(out var integer) ? integer : null;
    }

    internal static bool Equal(JsonNode? expected, JsonNode? actual, string field, string resource = "")
    {
        if (resource == "articles" && field == "timings" && expected is JsonObject expectedTimings && actual is JsonObject actualTimings)
        {
            return expectedTimings.Count == actualTimings.Count && expectedTimings.All(pair => actualTimings.ContainsKey(pair.Key) &&
                (pair.Key == "finished_at" ? Equal(pair.Value, actualTimings[pair.Key], "finished_at") : JsonNode.DeepEquals(pair.Value, actualTimings[pair.Key])));
        }
        if (field == "labels" && expected is JsonArray expectedLabels && actual is JsonArray actualLabels)
        {
            static string CanonicalLabel(JsonNode? node) => (node?.GetValue<string>() ?? "").Trim().Normalize();
            return expectedLabels.Select(CanonicalLabel).Order(StringComparer.Ordinal)
                .SequenceEqual(actualLabels.Select(CanonicalLabel).Order(StringComparer.Ordinal), StringComparer.Ordinal);
        }
        if (expected is JsonValue first && actual is JsonValue second && first.TryGetValue<string>(out var text) && second.TryGetValue<string>(out var saved))
        {
            if (field == "name" && resource == "labels") return text.Trim().Normalize() == saved;
            if (field is "published_at" or "started_at" or "finished_at" or "as_of" or "collected_at" &&
                DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var firstStamp) &&
                DateTimeOffset.TryParse(saved, CultureInfo.InvariantCulture, DateTimeStyles.None, out var secondStamp))
                return firstStamp.ToUnixTimeMilliseconds() == secondStamp.ToUnixTimeMilliseconds();
            if (field == "url" && Uri.TryCreate(text.Trim(), UriKind.Absolute, out var expectedUri) &&
                Uri.TryCreate(saved, UriKind.Absolute, out var actualUri))
            {
                var left = new UriBuilder(expectedUri) { Fragment = "" }.Uri;
                var right = new UriBuilder(actualUri) { Fragment = "" }.Uri;
                return string.Equals(left.GetComponents(UriComponents.AbsoluteUri, UriFormat.UriEscaped), right.GetComponents(UriComponents.AbsoluteUri, UriFormat.UriEscaped), StringComparison.Ordinal);
            }
            if ((resource == "articles" && field is "summary" or "notes") ||
                (resource is "todos" or "unscheduled-todos" or "todo-templates" && field == "text")) return text.Trim() == saved;
            if (field is "text" or "body" or "summary") return text.Replace("\r\n", "\n").Replace('\r', '\n') == saved;
            if (field is "title" or "name" or "source" or "note") return text.Trim() == saved;
        }
        return JsonNode.DeepEquals(expected, actual);
    }
    private static void Invalid() => throw new JsonException("Mutation response does not match the original request.");
}
