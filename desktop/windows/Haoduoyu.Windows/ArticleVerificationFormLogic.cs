using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Haoduoyu.Windows;

// The native editor and isolated contract checks share this detached, I/O-free checklist model.
// Checklist positions belong to one exact article baseline; only an explicit done boolean can change.
public static class ArticleVerificationFormLogic
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly JsonSerializerOptions SemanticJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    public static JsonArray? Snapshot(JsonObject values)
    {
        ArgumentNullException.ThrowIfNull(values);
        if (values["verify_items"] is null) return null;
        if (values["verify_items"] is not JsonArray items || items.Any(item => item is not JsonObject))
            throw Invalid("待核清单不是可安全编辑的对象数组；原件保留，请先核对。");
        Validate(items);
        return (JsonArray)items.DeepClone();
    }

    public static JsonArray? Snapshot(JsonObject original, JsonObject values) => Merge(original, values) as JsonArray;

    public static JsonObject SetDone(JsonObject values, int index, bool done)
    {
        var items = Snapshot(values) ?? throw Invalid("尚未取得待核清单，不能猜测条目或处理状态。");
        if (index < 0 || index >= items.Count || items[index] is not JsonObject selected)
            throw Invalid("所选待核项不属于这份清单；原稿保留。");
        selected["done"] = done;
        Validate(items);
        var next = (JsonObject)values.DeepClone();
        next["verify_items"] = items;
        return next;
    }

    public static JsonNode? Merge(JsonObject original, JsonObject values)
    {
        ArgumentNullException.ThrowIfNull(original); ArgumentNullException.ThrowIfNull(values);
        var before = Snapshot(original);
        if (!values.ContainsKey("verify_items")) return before;
        var after = Snapshot(values);
        if (after is null)
        {
            if (before is not null) throw Invalid("不能用空值移除已取得的待核清单；原稿保留。");
            return null;
        }
        if (before is null || before.Count != after.Count)
            throw Invalid("待核清单只能明确修改已有项的处理状态，不能新增、删除或替换未取得的条目。");
        for (var index = 0; index < before.Count; index++)
        {
            var oldItem = before[index]!.AsObject(); var nextItem = after[index]!.AsObject();
            var oldMetadata = (JsonObject)oldItem.DeepClone(); oldMetadata.Remove("done");
            var nextMetadata = (JsonObject)nextItem.DeepClone(); nextMetadata.Remove("done");
            if (!JsonNode.DeepEquals(oldMetadata, nextMetadata))
                throw Invalid("待核项的顺序、内容与来源必须保留，只能修改明确的处理状态。");
            var unchanged = oldItem.ContainsKey("done") == nextItem.ContainsKey("done") && JsonNode.DeepEquals(oldItem["done"], nextItem["done"]);
            if (!unchanged && (nextItem["done"] is not JsonValue state || !state.TryGetValue<bool>(out _)))
                throw Invalid("新的处理状态必须明确选择已处理或待处理，不能清除或猜测状态。");
        }
        return after;
    }

    private static void Validate(JsonArray items)
    {
        var pending = new Stack<(JsonNode? Value, int ParentDepth)>(); pending.Push((items, 0)); var nodes = 0;
        while (pending.Count > 0)
        {
            var current = pending.Pop(); if (++nodes > 4096) throw Invalid("待核清单 JSON 节点数量超限；原稿保留。");
            try
            {
                if (current.Value is JsonValue scalar && scalar.TryGetValue<string>(out var text)) _ = StrictUtf8.GetByteCount(text);
                if (current.Value is JsonValue numeric && numeric.GetValueKind() == JsonValueKind.Number && numeric.TryGetValue<double>(out var number) && !double.IsFinite(number))
                    throw Invalid("待核清单 JSON 数值必须有限；原稿保留。");
            }
            catch (EncoderFallbackException) { throw Invalid("待核清单含无效 Unicode；原稿保留，不能替换字符后保存。"); }
            if (current.Value is not (JsonObject or JsonArray)) continue;
            var depth = current.ParentDepth + 1; if (depth > 12) throw Invalid("待核清单 JSON 嵌套层级超限；原稿保留。");
            if (current.Value is JsonObject obj)
                foreach (var pair in obj)
                {
                    try { _ = StrictUtf8.GetByteCount(pair.Key); }
                    catch (EncoderFallbackException) { throw Invalid("待核清单键含无效 Unicode；原稿保留。"); }
                    if (pair.Key is "__proto__" or "constructor" or "prototype") throw Invalid("待核清单含不安全 JSON 键；原稿保留。");
                    pending.Push((pair.Value, depth));
                }
            else foreach (var entry in (JsonArray)current.Value) pending.Push((entry, depth));
        }
        if (StrictUtf8.GetByteCount(items.ToJsonString(SemanticJson)) > 65536)
            throw Invalid("待核清单超过文章流水线 JSON 的 64 KiB 上限；原稿保留。");
    }

    private static InvalidOperationException Invalid(string message) => new(message);
}
