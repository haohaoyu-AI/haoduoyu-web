using System.Globalization;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

internal static class TemplateArchiveMutationVerifier
{
    private const long MaximumSafeInteger = 9_007_199_254_740_991L;

    internal static void Validate(string method, string path, JsonObject body, JsonObject response)
    {
        try
        {
            var segments = path.Split('/');
            var requestedId = Guid.Empty; long requestedVersion = 0;
            if (method != "POST" || path.Contains('?') || segments.Length != 6 || segments[0].Length != 0 ||
                segments[1] != "api" || segments[2] != "v1" || segments[3] != "todo-templates" ||
                segments[5] is not ("archive" or "restore") || !Guid.TryParseExact(segments[4], "D", out requestedId) ||
                body.Count != 1 || !Integer(body["version"], out requestedVersion) || requestedVersion < 1 || requestedVersion >= MaximumSafeInteger)
                Invalid();
            TemplateArchive.ValidateRecord(response, segments[5] == "archive", requireExplicitArchive: true);
            if (!Guid.TryParseExact(response["id"]?.GetValue<string>(), "D", out var returnedId) || returnedId != requestedId ||
                !Integer(response["version"], out var returnedVersion) || returnedVersion != requestedVersion && returnedVersion != requestedVersion + 1)
                Invalid();
        }
        catch (Exception error) when (error is InvalidDataException or InvalidOperationException or ArgumentException or FormatException or OverflowException)
        { throw new JsonException("Template archive response does not match the original request.", error); }
    }

    // Number.isSafeInteger accepts JSON numeric 1.0/1e0 too; strings and fractional numbers remain invalid.
    private static bool Integer(JsonNode? node, out long value)
    {
        value = 0;
        if (node is not JsonValue number || number.GetValueKind() != JsonValueKind.Number ||
            !decimal.TryParse(number.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ||
            parsed != decimal.Truncate(parsed) || parsed < 0 || parsed > MaximumSafeInteger) return false;
        value = (long)parsed; return true;
    }
    [DoesNotReturn]
    private static void Invalid() => throw new JsonException("Template archive response does not match the original request.");
}
