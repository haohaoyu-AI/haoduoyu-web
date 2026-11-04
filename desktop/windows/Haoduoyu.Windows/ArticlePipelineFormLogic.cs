using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Haoduoyu.Windows;

// Shared by the actual native editor and isolated Worker contract tests. No UI, I/O or network.
public static class ArticlePipelineFormLogic
{
    private const long MaxSafeInteger = 9007199254740991;
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly string[] Preserved = ["account_id", "title", "url", "published_at", "started_at", "production_mode", "summary", "notes", "status", "platform_article_id", "slot", "writer", "illustrator", "run_dir", "run_date", "series_no", "char_count", "subheading_count", "image_count", "cover_desc", "draft_ref", "timings", "sample", "reruns", "blockers", "verify_items"];
    private static readonly string[] JsonFields = ["sample", "draft_ref", "timings", "reruns", "blockers", "verify_items"];

    public static JsonObject FormValues(JsonObject original)
    {
        var value = (JsonObject)original.DeepClone();
        Add("draft_pgc_id", "draft_ref", "pgc_id"); Add("draft_appmsgid", "draft_ref", "appmsgid");
        Add("draft_editor_url", "draft_ref", "editor_url"); Add("finished_at", "timings", "finished_at");
        return value;
        void Add(string flat, string container, string member)
        {
            if (!value.ContainsKey(flat)) value[flat] = original[container] is JsonObject nested ? nested[member]?.DeepClone() : null;
        }
    }

    public static (string Method, string Path, JsonObject Body) Build(JsonObject original, JsonObject value)
    {
        ValidateJsonFields(original); ValidateJsonFields(value);
        var fields = FormValues(value);
        // Old drafts may predate flat editor fields. Fill only missing entries from the exact baseline.
        var baseline = FormValues(original);
        foreach (var name in new[] { "draft_pgc_id", "draft_appmsgid", "draft_editor_url", "finished_at" })
            if (!value.ContainsKey(name) && value[name.StartsWith("draft_", StringComparison.Ordinal) ? "draft_ref" : "timings"] is null)
                fields[name] = baseline[name]?.DeepClone();
        var body = new JsonObject();
        foreach (var name in Preserved) if (original.ContainsKey(name)) body[name] = original[name]?.DeepClone();
        body["account_id"] = Content(fields, "account_id", "运营账号", 300, required: true);
        body["title"] = Content(fields, "title", "文章标题", 300, required: true);
        var status = Choice(fields, "status", "文章状态", ["drafting", "illustrated", "draft_saved", "published", "failed"], required: true)!;
        body["status"] = status;
        body["production_mode"] = Choice(fields, "production_mode", "生产方式", ["unknown", "automatic", "manual", "mixed"], required: true);
        body["summary"] = Content(fields, "summary", "概况", 10000);
        body["notes"] = Content(fields, "notes", "备注", 20000);
        body["platform_article_id"] = NullableContent(fields, "platform_article_id", "平台文章标识", 300);
        body["slot"] = Choice(fields, "slot", "槽位", ["zh1", "zh2", "tt1", "tt2", "zh3", "tt3", "gzh"]);
        body["writer"] = Choice(fields, "writer", "写作者", ["dedao", "gemini_web", "human", "other"]);
        body["illustrator"] = Choice(fields, "illustrator", "配图者", ["codex", "pil", "human"]);
        body["run_dir"] = NullableContent(fields, "run_dir", "流水线标识", 512);
        if (body["run_dir"] is JsonValue directory && !Regex.IsMatch(directory.GetValue<string>(), @"^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$", RegexOptions.CultureInvariant))
            throw Invalid("流水线标识只能包含以斜杠分隔的字母、数字、下划线或短横线，不是可执行路径。");
        var runDate = Content(fields, "run_date", "存稿日期", 10);
        if (runDate.Length > 0 && !ValidDate(runDate)) throw Invalid("存稿日期请填写真实的 YYYY-MM-DD，未知时留空。");
        body["run_date"] = runDate.Length == 0 ? null : runDate;
        foreach (var name in new[] { "series_no", "char_count", "subheading_count", "image_count" })
            body[name] = NullableInteger(fields, name, name == "series_no" ? 1 : 0);
        var cover = TextInput(fields, "cover_desc");
        CheckText(cover, "封面描述", 10000);
        body["cover_desc"] = cover.Length == 0 ? null : cover;

        var published = Timestamp(Raw(fields, "published_at"), "实际发布时间");
        var started = Timestamp(Raw(fields, "started_at"), "流水线开始");
        var url = Content(fields, "url", "公开链接", 2048);
        if (status == "published")
        {
            if (published is null || url.Length == 0) throw Invalid("已发布文章需要真实 HTTP/HTTPS 链接及含时区的实际发布时间。");
            body["url"] = HttpUrl(url, "公开链接", canonical: true); body["published_at"] = published;
        }
        else
        {
            if (url.Length != 0 || published is not null) throw Invalid("未发布状态请明确清空公开链接和实际发布时间。");
            body["url"] = null; body["published_at"] = null;
        }
        body["started_at"] = started;
        if (started is not null && published is not null && string.CompareOrdinal(started, published) > 0)
            throw Invalid("流水线开始不能晚于实际发布时间。");
        var editorUrl = NullableContent(fields, "draft_editor_url", "草稿编辑链接", 2048);
        if (editorUrl is not null) _ = HttpUrl(editorUrl, "草稿编辑链接", canonical: false);
        body["draft_ref"] = Merge(original, value, "draft_ref", new JsonObject
        {
            ["pgc_id"] = NullableContent(fields, "draft_pgc_id", "头条草稿 pgc_id", 300),
            ["appmsgid"] = NullableContent(fields, "draft_appmsgid", "公众号草稿 appmsgid", 300),
            ["editor_url"] = editorUrl
        });
        body["timings"] = Merge(original, value, "timings", new JsonObject { ["finished_at"] = Timestamp(Raw(fields, "finished_at"), "流水线结束") });
        ValidateJsonFields(body);
        var version = Version(original);
        if (version > 0) body["version"] = version;
        var id = Raw(original, "id");
        if (version > 0 && string.IsNullOrWhiteSpace(id)) throw Invalid("原记录缺少文章标识，已保留本机稿。");
        if (StrictUtf8.GetByteCount(body.ToJsonString()) > 256 * 1024)
            throw Invalid("文章请求编码后超过服务端 256 KiB 上限，本机草稿保留，未加入同步队列。");
        return version > 0 ? ("PUT", "/api/v1/articles/" + id, body) : ("POST", "/api/v1/articles", body);
    }

    private static JsonNode? Merge(JsonObject original, JsonObject value, string name, JsonObject updates)
    {
        if (original[name] is not null and not JsonObject || value[name] is not null and not JsonObject)
            throw Invalid("原记录的 " + name + " 不是可安全编辑的对象；原件与草稿保留，请先核对。");
        var result = original[name] is JsonObject previous ? (JsonObject)previous.DeepClone() : new JsonObject();
        foreach (var pair in updates) if (pair.Value is not null || result.ContainsKey(pair.Key)) result[pair.Key] = pair.Value?.DeepClone();
        return result.Count > 0 || original[name] is not null ? result : null;
    }

    private static string Raw(JsonObject source, string name)
    {
        if (source[name] is null) return "";
        if (source[name] is JsonValue primitive)
        {
            if (primitive.TryGetValue<string>(out var text)) return text;
            return primitive.ToJsonString();
        }
        throw Invalid(name + " 原值不是可编辑的简单字段，已保留原件。");
    }
    private static string Content(JsonObject fields, string name, string label, int maximum, bool required = false)
    {
        var text = TextInput(fields, name).Trim(); CheckText(text, label, maximum);
        if (required && text.Length == 0) throw Invalid("请填写或明确选择" + label + "。");
        return text;
    }
    private static string? NullableContent(JsonObject fields, string name, string label, int maximum)
    { var value = Content(fields, name, label, maximum); return value.Length == 0 ? null : value; }
    private static string TextInput(JsonObject fields, string name)
    {
        if (fields[name] is null) return "";
        if (fields[name] is JsonValue value && value.TryGetValue<string>(out var text)) return text;
        throw Invalid(name + "原值不是文字，请明确编辑后再提交；不会把不支持的类型变成文字。");
    }
    private static void CheckText(string text, string label, int maximum)
    {
        try { _ = StrictUtf8.GetByteCount(text); }
        catch (EncoderFallbackException) { throw Invalid(label + "含有无效 Unicode，请保全草稿后修改。"); }
        if (text.Length > maximum || text.Any(character => character < 32 && character is not '\t' and not '\n' and not '\r'))
            throw Invalid(label + "超出长度或含无效控制字符，请保全草稿后修改。");
    }
    private static string? Choice(JsonObject fields, string name, string label, string[] choices, bool required = false)
    {
        var value = Content(fields, name, label, 100, required);
        if (value.Length == 0) return null;
        if (!choices.Contains(value, StringComparer.Ordinal)) throw Invalid(label + "原值不受支持，请明确选择；不会静默改成默认值。");
        return value;
    }
    private static JsonNode? NullableInteger(JsonObject fields, string name, long minimum)
    {
        var value = Raw(fields, name).Trim();
        if (value.Length == 0) return null;
        if (!Regex.IsMatch(value, "^[0-9]+$", RegexOptions.CultureInvariant) || !long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) || number < minimum || number > MaxSafeInteger)
            throw Invalid(name + "请填写安全范围内的" + (minimum == 1 ? "正" : "非负") + "整数，未知时留空。");
        return JsonValue.Create(number);
    }
    private static long Version(JsonObject original)
    {
        if (original["version"] is null) throw Invalid("原文章缺少明确版本，不能猜测创建或更新。");
        var value = Raw(original, "version");
        if (!long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var version) || version < 0 || version > MaxSafeInteger)
            throw Invalid("原文章版本无效，不能猜测创建或更新。");
        return version;
    }
    private static bool ValidDate(string raw) => Regex.IsMatch(raw, @"^\d{4}-\d{2}-\d{2}$", RegexOptions.CultureInvariant) &&
        DateOnly.TryParseExact(raw, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    // Normalize explicitly zoned input to the same millisecond UTC precision as JS Date.toISOString.
    private static string? Timestamp(string input, string label)
    {
        var value = input.Trim(); if (value.Length == 0) return null;
        var match = Regex.Match(value, @"^(?<date>\d{4}-\d{2}-\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.(?<fraction>\d{1,9}))?)?(?<zone>Z|[+-]\d{2}:\d{2})$", RegexOptions.CultureInvariant);
        if (!match.Success || !ValidDate(match.Groups["date"].Value)) throw Invalid(label + "请填写真实 ISO 8601 日期、时间和显式时区（Z 或 +08:00）；按服务端毫秒精度保存。");
        int Number(string name) => int.Parse(match.Groups[name].Value, CultureInfo.InvariantCulture);
        var hour = Number("hour"); var minute = Number("minute"); var second = match.Groups["second"].Success ? Number("second") : 0;
        var zone = match.Groups["zone"].Value; var zoneHour = zone == "Z" ? 0 : int.Parse(zone.AsSpan(1, 2), CultureInfo.InvariantCulture);
        var zoneMinute = zone == "Z" ? 0 : int.Parse(zone.AsSpan(4, 2), CultureInfo.InvariantCulture);
        if (hour > 23 || minute > 59 || second > 59 || zoneHour > 23 || zoneMinute > 59) throw Invalid(label + "时间或时区无效。");
        try
        {
            var date = DateOnly.ParseExact(match.Groups["date"].Value, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var fraction = match.Groups["fraction"].Value.PadRight(3, '0');
            var milliseconds = int.Parse(fraction.AsSpan(0, 3), CultureInfo.InvariantCulture);
            var local = new DateTime(date.Year, date.Month, date.Day, hour, minute, second, milliseconds, DateTimeKind.Utc);
            var offset = TimeSpan.FromMinutes((zoneHour * 60 + zoneMinute) * (zone.StartsWith('-') ? -1 : 1));
            return local.Subtract(offset).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }
        catch (ArgumentException) { throw Invalid(label + "日期时间超出支持范围。"); }
    }
    private static string HttpUrl(string value, string label, bool canonical)
    {
        if (value.Any(character => char.IsWhiteSpace(character) || char.IsControl(character)) ||
            !Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme is not ("http" or "https") ||
            string.IsNullOrEmpty(url.Host) || !string.IsNullOrEmpty(url.UserInfo)) throw Invalid(label + "请使用不含账号密码的完整 HTTP/HTTPS 地址。");
        return canonical ? new UriBuilder(url) { Fragment = "" }.Uri.AbsoluteUri : value;
    }
    private static void ValidateJsonFields(JsonObject body)
    {
        long totalBytes = 0;
        foreach (var name in JsonFields)
        {
            var value = body[name]; if (value is null) continue;
            var arrayField = name is "blockers" or "verify_items";
            if (arrayField ? value is not JsonArray array || array.Any(item => item is not JsonObject) : value is not JsonObject)
                throw Invalid(name + "原记录结构无法安全保留，请先核对原件。");
            var pending = new Stack<(JsonNode? Value, int ParentDepth)>(); pending.Push((value, 0)); var nodes = 0;
            while (pending.Count > 0)
            {
                var item = pending.Pop(); if (++nodes > 4096) throw Invalid("文章 JSON 节点数量超限。");
                try
                {
                    if (item.Value is JsonValue primitive && primitive.TryGetValue<string>(out var text)) _ = StrictUtf8.GetByteCount(text);
                    if (item.Value is JsonValue numeric && numeric.GetValueKind() == JsonValueKind.Number && numeric.TryGetValue<double>(out var number) && !double.IsFinite(number))
                        throw Invalid("文章 JSON 数值必须有限。");
                }
                catch (EncoderFallbackException) { throw Invalid("文章 JSON 含无效 Unicode，原文与草稿保留，不能替换字符后提交。"); }
                if (item.Value is not (JsonObject or JsonArray)) continue;
                var depth = item.ParentDepth + 1; if (depth > 12) throw Invalid("文章 JSON 嵌套层级超限。");
                if (item.Value is JsonObject obj)
                    foreach (var pair in obj)
                    {
                        try { _ = StrictUtf8.GetByteCount(pair.Key); }
                        catch (EncoderFallbackException) { throw Invalid("文章 JSON 键含无效 Unicode，原文与草稿保留。"); }
                        if (pair.Key is "__proto__" or "constructor" or "prototype") throw Invalid("文章 JSON 包含不安全键，原件保留。");
                        pending.Push((pair.Value, depth));
                    }
                else foreach (var entry in (JsonArray)item.Value) pending.Push((entry, depth));
            }
            totalBytes += StrictUtf8.GetByteCount(value.ToJsonString(new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
            if (totalBytes > 65536) throw Invalid("文章流水线 JSON 总量超过 64 KiB，原件与草稿保留。");
        }
    }
    private static InvalidOperationException Invalid(string message) => new(message);
}
