using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

internal static class ReviewMutationVerifier
{
    private const string HashPattern = "\\A[a-f0-9]{64}\\z";
    private static readonly HashSet<string> SoftDeletedKinds = ["benchmark-accounts", "benchmark-articles", "notes", "account-health"];

    internal static void ValidateRequest(string method, string? bodyJson)
    {
        JsonObject? body;
        try { body = JsonNode.Parse(bodyJson ?? "{}") as JsonObject; }
        catch (JsonException) { throw new RequestNotSentException("复盘请求格式无效，尚未发送写入。"); }
        if (body is null || method is not ("PUT" or "PATCH"))
            throw new RequestNotSentException("复盘写入只支持稳定 UUID 创建或带哈希的修改。");
        if (method == "PATCH")
        {
            var hash = body["expected_hash"] is JsonValue value && value.TryGetValue<string>(out var text) ? text : null;
            if (!IsHash(hash) || !body.Any(pair => pair.Key is not ("expected_hash" or "save_id")))
                throw new RequestNotSentException("修改需要已读取的完整 expected_hash 与明确字段，尚未发送写入。");
        }
        else if (body.ContainsKey("expected_hash"))
            throw new RequestNotSentException("新建复盘使用稳定 UUID；修改已有记录请使用 PATCH，尚未发送写入。");
    }

    internal static void Validate(string method, string path, JsonObject body, JsonObject response)
    {
        var segments = path.Split('?')[0].Split('/');
        if (segments.Length != 6 || method is not ("PUT" or "PATCH")) Invalid();
        var kind = segments[4]; var id = segments[5];
        if (response["id"]?.GetValue<string>() != id || !IsHash(response["content_hash"]?.GetValue<string>()) ||
            response["deleted_at"] is not null || response["deleted"]?.GetValue<bool>() == true ||
            SoftDeletedKinds.Contains(kind) && !response.ContainsKey("deleted_at")) Invalid();
        if (method == "PATCH" && !IsHash(body["expected_hash"]?.GetValue<string>())) Invalid();
        foreach (var pair in body.Where(pair => pair.Key is not ("expected_hash" or "save_id")))
        {
            if (!response.ContainsKey(pair.Key)) Invalid();
            if (pair.Key is "published_at" or "sent_to_gemini_at" && IsTimestamp(pair.Value, out var expected))
            {
                if (!IsTimestamp(response[pair.Key], out var actual) || expected != actual) Invalid();
            }
            else if (!JsonNode.DeepEquals(Normalize(kind, pair.Key, pair.Value), Normalize(kind, pair.Key, response[pair.Key]))) Invalid();
        }
        // PATCH may legally be an idempotent no-op with the same content hash.
    }

    private static bool IsHash(string? value) => value is not null && Regex.IsMatch(value, HashPattern, RegexOptions.CultureInvariant | RegexOptions.NonBacktracking);
    private static bool IsTimestamp(JsonNode? node, out long milliseconds)
    {
        milliseconds = 0;
        if (node is not JsonValue value || !value.TryGetValue<string>(out var text) || !text.Contains('T') ||
            !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var stamp)) return false;
        milliseconds = stamp.ToUnixTimeMilliseconds(); return true;
    }

    private static JsonNode? Normalize(string kind, string field, JsonNode? node)
    {
        if (node is JsonValue value && value.TryGetValue<string>(out var text)) return JsonValue.Create(NormalText(text));
        var result = node?.DeepClone();
        if (result is JsonArray array && field is "applied_rule_ids" or "title_patterns" or "tags" or "related_rule_ids")
            for (var i = 0; i < array.Count; i++) if (array[i] is JsonValue item && item.TryGetValue<string>(out var textValue)) array[i] = NormalText(textValue);
        if (result is JsonArray ids && kind == "benchmark-articles" && field == "used_by_article_ids")
            return new JsonArray(ids.Select(id => id?.GetValue<string>()).Order(StringComparer.Ordinal).Select(id => (JsonNode?)JsonValue.Create(id)).ToArray());
        if (result is JsonObject verdicts && kind == "reports" && field == "verdicts")
            foreach (var pair in verdicts) NormalizeMember(pair.Value, "reason");
        if (result is JsonObject findings && kind == "reports" && field == "findings")
            foreach (var group in new[] { "verified", "overturned" })
                if (findings[group] is JsonArray items) foreach (var item in items) NormalizeMember(item, "rule_id");
        if (result is JsonArray rules && kind == "playbooks" && field == "rules")
            foreach (var rule in rules)
            {
                foreach (var name in new[] { "rule_id", "text", "evidence_note" }) NormalizeMember(rule, name);
                NormalizeMember(rule?["evidence"], "metric");
                NormalizeMember(rule?["check"], "value");
                if (rule is JsonObject ruleObject && ruleObject["status"] is null) ruleObject["status"] = "candidate";
            }
        if (result is JsonObject notice && kind == "account-health" && field == "platform_notice")
        {
            NormalizeMember(notice, "text");
            if (!notice.ContainsKey("date")) notice["date"] = null;
        }
        return result;
    }
    private static void NormalizeMember(JsonNode? node, string field)
    {
        if (node is JsonObject parent && parent[field] is JsonValue value && value.TryGetValue<string>(out var text))
            parent[field] = NormalText(text);
    }
    private static string NormalText(string text) => text.Replace("\r\n", "\n").Replace('\r', '\n').Trim();
    private static void Invalid() => throw new JsonException("Review mutation response does not match the original request.");
}
