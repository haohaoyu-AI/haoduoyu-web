using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

public enum ReconciliationOutcome { Confirmed, Unconfirmed, Conflict }
public sealed record ReconciliationResult(ReconciliationOutcome Outcome, string? RemoteJson, string Message);

public sealed partial class WorkbenchApi
{
    /// <summary>Read-only confirmation of exact original notes/memo requests. Never retries a write.</summary>
    public async Task<ReconciliationResult> ReconcileAsync(string method, string path, string bodyJson,
        CancellationToken cancellationToken = default)
    {
        RoutePolicy.Validate(method, path, allowAuthWrite: false);
        var body = JsonNode.Parse(bodyJson) as JsonObject ?? throw new ArgumentException("原请求内容无效。");
        var route = path.Split('?')[0];
        var isNote = route.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal);
        var isMemo = route.StartsWith("/api/v1/memos/notes/", StringComparison.Ordinal) || route.StartsWith("/api/v1/memos/groups/", StringComparison.Ordinal);
        if (!isNote && !isMemo)
            return new(ReconciliationOutcome.Unconfirmed, null, "此接口不提供可核验的保存收据，请读取当前记录并明确处理；不会自动重发。");
        var parts = route.Split('/');
        var id = ApiRequests.Uuid(isNote ? parts[4] : parts[5]);
        var saveId = ApiRequests.Uuid(body["save_id"]?.GetValue<string>() ?? "");
        await gate.WaitAsync(cancellationToken);
        try
        {
            await CheckWriteScopeAsync(cancellationToken);
            var receiptResult = await SendCoreAsync("GET", "/api/v1/" + (isNote ? "note-entries" : "memos") + "/operations/" + saveId, null, "", cancellationToken);
            var receipt = DataOrThrow(receiptResult);
            if (receipt?["found"]?.GetValue<bool>() != true)
                return new(ReconciliationOutcome.Unconfirmed, receiptResult.Json, "尚未找到保存收据。原请求可能仍在完成，不能据此重发或新建。");
            ApiResult remoteResult;
            JsonNode? remote;
            if (isMemo && parts[4] == "groups")
            {
                remoteResult = await SendCoreAsync("GET", "/api/v1/memos", null, "", cancellationToken);
                remote = DataOrThrow(remoteResult)?["groups"]?.AsArray().FirstOrDefault(item => item?["id"]?.GetValue<string>() == id)?.DeepClone();
                remoteResult = remoteResult with { Json = new JsonObject { ["data"] = remote?.DeepClone() }.ToJsonString() };
            }
            else
            {
                remoteResult = await SendCoreAsync("GET", isNote ? "/api/v1/note-entries/" + id : "/api/v1/memos/notes/" + id, null, "", cancellationToken);
                remote = DataOrThrow(remoteResult);
            }
            return ReceiptVerifier.Verify(method, path, body, receipt, remote, remoteResult.Json);
        }
        finally { gate.Release(); }
    }
}

internal static class ReceiptVerifier
{
    private static readonly JsonSerializerOptions CanonicalJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static readonly string[] NoteFields = ["id", "category", "date", "text", "version", "change_seq", "created_at", "updated_at", "deleted_at"];
    private static readonly string[] MemoFields = ["id", "title", "position", "version", "change_seq", "created_at", "updated_at", "deleted_at"];

    internal static ReconciliationResult Verify(string method, string path, JsonObject body, JsonNode? receipt, JsonNode? remote, string remoteJson)
    {
        var isNote = path.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal);
        var parts = path.Split('?')[0].Split('/');
        var id = isNote ? parts[4] : parts[5];
        var kind = isNote ? null : parts[4];
        var baseVersion = Long(body["version"]) ?? -1;
        if (receipt?["found"]?.GetValue<bool>() != true)
            return new(ReconciliationOutcome.Unconfirmed, remoteJson, "未找到可核验收据，原请求保留且不会自动重发。");
        if (remote is not JsonObject || receipt["id"]?.GetValue<string>() != id || remote["id"]?.GetValue<string>() != id ||
            (!isNote && receipt["kind"]?.GetValue<string>() != kind) ||
            baseVersion < 0 || Long(receipt["version"]) != baseVersion + 1 || Long(remote["version"]) != baseVersion + 1)
            return new(ReconciliationOutcome.Conflict, remoteJson, "保存收据与当前实体/版本不一致，请保留本地稿并核对远端。");
        var fields = isNote ? NoteFields : kind == "notes" ? [.. MemoFields, "group_id", "body"] : MemoFields;
        if (fields.Any(field => !remote.AsObject().ContainsKey(field)))
            return new(ReconciliationOutcome.Unconfirmed, remoteJson, "当前实体字段不完整，无法确认原保存。");
        var projection = new JsonObject(fields.Order(StringComparer.Ordinal).Select(field => new KeyValuePair<string, JsonNode?>(field, remote[field]?.DeepClone())));
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(projection.ToJsonString(CanonicalJson))));
        var receiptHash = receipt[isNote ? "content_hash" : "entity_hash"]?.GetValue<string>();
        if (hash != receiptHash || !JsonNode.DeepEquals(receipt["deleted_at"], remote["deleted_at"]) ||
            !JsonNode.DeepEquals(receipt["change_seq"], remote["change_seq"]))
            return new(ReconciliationOutcome.Conflict, remoteJson, "当前实体哈希与原保存收据不一致，请核对两份内容。");
        var shouldDelete = method == "DELETE";
        if (shouldDelete != (remote["deleted_at"] is not null))
            return new(ReconciliationOutcome.Conflict, remoteJson, "删除/恢复状态与原请求不一致。");
        if (method == "PUT")
        {
            foreach (var pair in body.Where(pair => pair.Key is not ("version" or "save_id")))
            {
                if (!JsonNode.DeepEquals(pair.Value, remote[pair.Key]))
                    return new(ReconciliationOutcome.Conflict, remoteJson, "远端保存内容与原请求不一致，本地稿已保留。");
            }
        }
        return new(ReconciliationOutcome.Confirmed, remoteJson, "已读取原保存收据，并核对同一实体、版本、状态、正文与哈希。");
    }

    private static long? Long(JsonNode? node)
    {
        if (node is not JsonValue value) return null;
        if (value.TryGetValue<long>(out var number)) return number;
        return value.TryGetValue<int>(out var integer) ? integer : null;
    }
}
