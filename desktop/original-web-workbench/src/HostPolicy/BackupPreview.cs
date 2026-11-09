using System.Collections.ObjectModel;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Haoduoyu.OriginalUi.Policy;

public sealed record BackupTablePreview(string Name, int Count, int? DeletedCount, bool ExcludedFromFutureImport);
public sealed record BackupPreviewResult(string Format, long SourceRevision, string ExportedAt, string FileSha256,
    string PayloadSha256, int OwnerCount, IReadOnlyList<BackupTablePreview> Tables)
{
    // A checksum is not a signature. Preview does not grant permission to write.
    public bool CanImport => false;
}

/// <summary>Bounded, local, read-only inspection of the pinned server v9 backup contract.</summary>
public static class BackupPreview
{
    public const int MaxBytes = 20 * 1024 * 1024;
    public const int MaxRows = 100000;
    public const string SupportedFormat = "haoduoyu-matrix-d1-v9";
    private const long MaxSafeInteger = 9007199254740991;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly HashSet<string> Excluded = new(StringComparer.Ordinal) { "users", "api_keys", "audit", "idempotency" };
    private static readonly IReadOnlyDictionary<string, string[]> Columns = new ReadOnlyDictionary<string, string[]>(
        new Dictionary<string, string[]>(StringComparer.Ordinal) {
            ["accounts"] = Fields("id platform name active created_at"),
            ["users"] = Fields("id username password_hash created_at"),
            ["todos"] = Fields("user_id id date text completed version created_at updated_at deleted_at"),
            ["todo_templates"] = Fields("user_id id text version created_at updated_at deleted_at"),
            ["todo_template_links"] = Fields("user_id todo_id template_id created_with_todo"),
            ["todo_preferences"] = Fields("user_id completed_mode version updated_at"),
            ["daily_notes"] = Fields("user_id date text version change_seq created_at updated_at deleted_at"),
            ["daily_work_notes"] = Fields("user_id date text version change_seq created_at updated_at deleted_at"),
            ["articles"] = Fields("id account_id title url platform_article_id published_at started_at production_mode summary notes version created_at updated_at status slot run_dir run_date series_no writer illustrator sample_json char_count subheading_count image_count cover_desc draft_ref_json timings_json reruns_json blockers_json verify_items_json"),
            ["observations"] = Fields("id article_id as_of collected_at kind metrics_json source note created_at"),
            ["daily_metrics"] = Fields("id account_id article_id date metrics_json source updated_at"),
            ["api_keys"] = Fields("id name token_hash account_ids_json permissions_json created_at revoked_at last_used_at"),
            ["audit"] = Fields("id actor action entity_id detail_json created_at"),
            ["idempotency"] = Fields("actor key request_hash response_json status created_at"),
            ["memo_groups"] = Fields("user_id id title position version change_seq created_at updated_at deleted_at"),
            ["memo_notes"] = Fields("user_id id group_id title body position version change_seq created_at updated_at deleted_at"),
            ["note_entries"] = Fields("user_id id category date text version change_seq created_at updated_at deleted_at"),
            ["work_reminders"] = Fields("user_id id date source_key summary version change_seq created_at updated_at deleted_at"),
            ["account_profiles"] = Fields("account_id profile_url platform_identity created_at updated_at"),
        });
    private static string[] Fields(string value) => value.Split(' ');
    private static InvalidDataException Invalid() => new("备份未通过只读检查。请保留原文件和本机数据；没有导入、覆盖或清空任何记录。");

    public static async Task<BackupPreviewResult> InspectFileAsync(string path, CancellationToken cancellationToken = default)
    {
        // Reject remote/device namespaces before any filesystem probe. In the
        // shipping Windows host, mapped network drives are also rejected using
        // the operating system's drive classification, not a network read.
        if (string.IsNullOrWhiteSpace(path) || path.StartsWith("\\\\", StringComparison.Ordinal)
            || path.StartsWith("//", StringComparison.Ordinal) || path.Contains("://", StringComparison.Ordinal)) throw Invalid();
        var fullPath = Path.GetFullPath(path);
        if (OperatingSystem.IsWindows())
        {
            var root=Path.GetPathRoot(fullPath);
            if (root is null || fullPath.AsSpan(root.Length).Contains(':')) throw Invalid();
            var type=new DriveInfo(root).DriveType;
            if (type is not (DriveType.Fixed or DriveType.Removable or DriveType.CDRom or DriveType.Ram)) throw Invalid();
        }
        if (!string.Equals(Path.GetExtension(fullPath), ".json", StringComparison.OrdinalIgnoreCase)) throw Invalid();
        FileSystemTrust.RejectLinksInExistingPath(fullPath);
        await using var input = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read,
            65536, FileOptions.Asynchronous | FileOptions.SequentialScan);
        FileLinkCount.RequireSingleLink(input.SafeFileHandle);
        if (input.Length is < 2 or > MaxBytes) throw Invalid();
        var bytes = new byte[(int)input.Length];
        try
        {
            await input.ReadExactlyAsync(bytes, cancellationToken);
            var extra = new byte[1];
            if (await input.ReadAsync(extra, cancellationToken) != 0) throw Invalid();
            FileLinkCount.RequireSingleLink(input.SafeFileHandle);
            FileSystemTrust.RejectLinksInExistingPath(fullPath);
            cancellationToken.ThrowIfCancellationRequested();
            return Inspect(bytes);
        }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }

    public static BackupPreviewResult Inspect(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length is < 2 or > MaxBytes) throw Invalid();
        try
        {
            // Strict decoding rejects invalid UTF-8; BOM, trailing JSON and comments are not accepted.
            var text = Utf8.GetString(bytes);
            using var document = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            ValidateTree(root);
            Exact(root, "data", "sha256");
            var data = root.GetProperty("data"); Exact(data, "format", "source_revision", "exported_at", "tables");
            if (data.GetProperty("format").GetString() != SupportedFormat) throw Invalid();
            var revision = Integer(data.GetProperty("source_revision"));
            if (revision < 0 || revision > MaxSafeInteger - 2) throw Invalid();
            var exportedAt = data.GetProperty("exported_at").GetString() ?? throw Invalid();
            if (!DateTimeOffset.TryParseExact(exportedAt, "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out _)) throw Invalid();
            var suppliedHash = root.GetProperty("sha256").GetString();
            if (suppliedHash is null || suppliedHash.Length != 64 || suppliedHash.Any(c => !char.IsAsciiHexDigitLower(c))) throw Invalid();
            var canonical = Canonical(data);
            byte[] payloadBytes = Utf8.GetBytes(canonical);
            string payloadHash;
            try { payloadHash = Convert.ToHexStringLower(SHA256.HashData(payloadBytes)); }
            finally { CryptographicOperations.ZeroMemory(payloadBytes); }
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(suppliedHash), Encoding.ASCII.GetBytes(payloadHash))) throw Invalid();
            var tables = data.GetProperty("tables"); Exact(tables, Columns.Keys.ToArray());
            var summary = new List<BackupTablePreview>(); var total = 0;
            foreach (var (name, fields) in Columns)
            {
                var rows = tables.GetProperty(name);
                if (rows.ValueKind != JsonValueKind.Array) throw Invalid();
                total = checked(total + rows.GetArrayLength()); if (total > MaxRows) throw Invalid();
                var identities = new HashSet<string>(StringComparer.Ordinal);
                foreach (var row in rows.EnumerateArray())
                {
                    Exact(row, fields);
                    foreach (var field in row.EnumerateObject())
                        if (field.Value.ValueKind is not (JsonValueKind.String or JsonValueKind.Number or JsonValueKind.Null)) throw Invalid();
                    if (!identities.Add(Identity(name, row))) throw Invalid();
                }
                int? deleted = fields.Contains("deleted_at", StringComparer.Ordinal)
                    ? rows.EnumerateArray().Count(row => row.GetProperty("deleted_at").ValueKind != JsonValueKind.Null) : null;
                summary.Add(new(name, rows.GetArrayLength(), deleted, Excluded.Contains(name)));
            }
            CheckRelations(tables);
            return new(SupportedFormat, revision, exportedAt, Convert.ToHexStringLower(SHA256.HashData(bytes)),
                payloadHash, tables.GetProperty("users").GetArrayLength(), summary.AsReadOnly());
        }
        catch (Exception ex) when (ex is JsonException or DecoderFallbackException or InvalidOperationException
            or FormatException or OverflowException or ArgumentException or InvalidDataException)
        { throw Invalid(); } // Never expose supplied paths, data, credentials or parser diagnostics.
    }

    private static string Identity(string table, JsonElement row)
    {
        var fields = table switch {
            "daily_notes" or "daily_work_notes" => Fields("user_id date"),
            "todo_template_links" => Fields("user_id todo_id template_id"),
            "todo_preferences" => Fields("user_id"),
            "account_profiles" => Fields("account_id"),
            "idempotency" => Fields("actor key"),
            "todos" or "todo_templates" or "memo_groups" or "memo_notes" or "note_entries" or "work_reminders" => Fields("user_id id"),
            _ => Fields("id") };
        return string.Join("|", fields.Select(f => {
            var value = row.GetProperty(f);
            if (value.ValueKind == JsonValueKind.Number && table is "audit" or "daily_metrics" or "observations") return "n:" + Integer(value);
            var text = value.GetString(); if (string.IsNullOrWhiteSpace(text) || text.Length > 256 || text.Contains('|')) throw Invalid();
            return "s:" + text;
        }));
    }

    private static void CheckRelations(JsonElement tables)
    {
        HashSet<string> Ids(string table) => tables.GetProperty(table).EnumerateArray().Select(row => Identity(table, row)).ToHashSet(StringComparer.Ordinal);
        var users = Ids("users"); var accounts = Ids("accounts"); var articles = Ids("articles");
        var todos = Ids("todos"); var templates = Ids("todo_templates"); var groups = Ids("memo_groups");
        string Text(JsonElement row, string field) => row.GetProperty(field).GetString() ?? throw Invalid();
        bool Has(HashSet<string> ids, params string[] values) => ids.Contains(string.Join('|', values.Select(v => "s:" + v)));
        foreach (var table in Columns.Keys)
        foreach (var row in tables.GetProperty(table).EnumerateArray())
        {
            if (row.TryGetProperty("user_id", out _) && !Has(users, Text(row, "user_id"))) throw Invalid();
            if (row.TryGetProperty("account_id", out _) && !Has(accounts, Text(row, "account_id"))) throw Invalid();
            if (row.TryGetProperty("article_id", out var article) && article.ValueKind != JsonValueKind.Null && !Has(articles, Text(row, "article_id"))) throw Invalid();
            if (table == "memo_notes" && !Has(groups, Text(row, "user_id"), Text(row, "group_id"))) throw Invalid();
            if (table == "todo_template_links" && (!Has(todos, Text(row, "user_id"), Text(row, "todo_id"))
                || !Has(templates, Text(row, "user_id"), Text(row, "template_id")))) throw Invalid();
        }
    }

    private static void Exact(JsonElement value, params string[] keys)
    {
        if (value.ValueKind != JsonValueKind.Object || !value.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal)
            .SequenceEqual(keys.Order(StringComparer.Ordinal))) throw Invalid();
    }
    private static long Integer(JsonElement value)
    {
        if (!value.TryGetInt64(out var result) || result is < -MaxSafeInteger or > MaxSafeInteger) throw Invalid();
        return result;
    }
    private static void ValidateTree(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in node.EnumerateObject())
            {
                if (!names.Add(property.Name) || property.Name is "__proto__" or "constructor" or "prototype") throw Invalid();
                ValidateString(property.Name); ValidateTree(property.Value);
            }
        }
        else if (node.ValueKind == JsonValueKind.Array) foreach (var child in node.EnumerateArray()) ValidateTree(child);
        else if (node.ValueKind == JsonValueKind.Number) _ = Integer(node);
        else if (node.ValueKind == JsonValueKind.String) ValidateString(node.GetString()!);
    }
    private static void ValidateString(string value)
    {
        if (value.Length > 262144) throw Invalid();
        for (var i = 0; i < value.Length; i++)
        {
            if (char.IsHighSurrogate(value[i])) { if (++i == value.Length || !char.IsLowSurrogate(value[i])) throw Invalid(); }
            else if (char.IsLowSurrogate(value[i])) throw Invalid();
        }
    }
    private static string Canonical(JsonElement value)
    {
        var result = new StringBuilder();
        void Quote(string text)
        {
            result.Append('"');
            foreach (var character in text) result.Append(character switch {
                '"' => "\\\"", '\\' => "\\\\", '\b' => "\\b", '\f' => "\\f", '\n' => "\\n", '\r' => "\\r", '\t' => "\\t",
                < ' ' => "\\u" + ((int)character).ToString("x4", CultureInfo.InvariantCulture), _ => character.ToString() });
            result.Append('"');
        }
        void Write(JsonElement item)
        {
            switch (item.ValueKind)
            {
                case JsonValueKind.Object:
                    result.Append('{'); var firstProperty = true;
                    foreach (var property in item.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal)) {
                        if (!firstProperty) result.Append(','); firstProperty = false; Quote(property.Name); result.Append(':'); Write(property.Value);
                    }
                    result.Append('}'); break;
                case JsonValueKind.Array:
                    result.Append('['); var firstItem = true;
                    foreach (var child in item.EnumerateArray()) { if (!firstItem) result.Append(','); firstItem = false; Write(child); }
                    result.Append(']'); break;
                case JsonValueKind.String: Quote(item.GetString()!); break;
                case JsonValueKind.Number: result.Append(Integer(item).ToString(CultureInfo.InvariantCulture)); break;
                case JsonValueKind.True: result.Append("true"); break;
                case JsonValueKind.False: result.Append("false"); break;
                case JsonValueKind.Null: result.Append("null"); break;
                default: throw Invalid();
            }
        }
        Write(value); return result.ToString();
    }
}
