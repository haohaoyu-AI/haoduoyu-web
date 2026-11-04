using System.Text.Json;
using System.Text.Json.Nodes;
using System.IO;

namespace Haoduoyu.Windows.Tests;

internal static class JsonTestValue
{
    // Assertions care about JSON integer values, not whether an in-memory node was backed by Int32,
    // Int64 or a parsed JsonElement. Strings, null and fractional numbers still fail this check.
    internal static long Integer(JsonNode? node)
    {
        var serialized = JsonSerializer.SerializeToElement(node);
        if (serialized.ValueKind != JsonValueKind.Number || !serialized.TryGetInt64(out var value))
            throw new InvalidDataException("Expected a JSON integer, not null, text or a fraction.");
        return value;
    }
}
