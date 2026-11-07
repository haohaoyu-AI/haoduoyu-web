using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

internal static class TodoNoteMutationVerifier
{
    private const long MaxSafe = 9_007_199_254_740_991;
    internal static void ValidateRequest(string path, string? bodyJson)
    {
        try
        {
            _ = new UTF8Encoding(false, true).GetByteCount(bodyJson ?? "null");
            _ = Request(path, JsonNode.Parse(bodyJson ?? "null") as JsonObject);
        }
        catch (Exception error) when (error is JsonException or InvalidDataException or InvalidOperationException or ArgumentException or FormatException or OverflowException)
        { throw new ArgumentException("待办备注请求需要原 UUID、正安全整数版本和原样备注，且仅含 note/version。", nameof(bodyJson), error); }
    }
    internal static void Validate(string method, string path, JsonObject body, JsonObject response)
    {
        try
        {
            var (id, version, note) = Request(path, body);
            if (method != "PATCH") throw new JsonException();
            TodoNotes.ValidateRecord(response, id);
            if (Integer(response["version"]) != version + 1) throw new JsonException();
            if (response.ContainsKey("note"))
            {
                if (response["note"] is not JsonValue value || !value.TryGetValue<string>(out var actual) || actual != note) throw new JsonException();
            }
            else if (note.Length != 0) throw new JsonException();
        }
        catch (Exception error) when (error is InvalidDataException or InvalidOperationException or ArgumentException or FormatException or OverflowException)
        { throw new JsonException("待办备注响应与原请求或完整待办结构不一致。", error); }
    }
    private static (string Id, long Version, string Note) Request(string path, JsonObject? body)
    {
        var parts = path.Split('/');
        if (parts.Length != 6 || parts[0] != "" || parts[1] != "api" || parts[2] != "v1" || parts[3] != "todos" || parts[5] != "note" ||
            TodoNotes.Path(parts[4]) != path.ToLowerInvariant() || body is null || body.Count != 2 || !body.ContainsKey("version") ||
            body["note"] is not JsonValue value || !value.TryGetValue<string>(out var note)) throw new JsonException();
        var version = Integer(body["version"]); if (version < 1 || version >= MaxSafe) throw new JsonException();
        return (parts[4], version, TodoNotes.ValidateText(note));
    }
    private static long Integer(JsonNode? node)
    {
        if (node is not JsonValue value || value.GetValueKind() != JsonValueKind.Number ||
            !decimal.TryParse(value.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ||
            number != decimal.Truncate(number) || number < 0 || number > MaxSafe) throw new JsonException();
        return (long)number;
    }
}
