using System.Globalization;
using System.Text;
using System.Text.Json;

namespace Haoduoyu.Core;

/// <summary>A read-only view of one local source. SourceText is the original string, never an editable server entity.</summary>
public sealed record WorkspaceSearchHit
{
    public string Kind { get; init; } = "";
    public string Title { get; init; } = "";
    public string Snippet { get; init; } = "";
    public string SourcePath { get; init; } = "";
    public string RecordId { get; init; } = "";
    public string? Date { get; init; }
    public string? Category { get; init; }
    public string Origin { get; init; } = "cache";
    public string? OperationId { get; init; }
    public PendingStatus? PendingStatus { get; init; }
    public string? LocalDraftKey { get; init; }
    public string SourceText { get; init; } = "";
    public bool HasFullBody { get; init; }
    public bool Deleted { get; init; }
    public long SourceRevision { get; init; }
}

/// <summary>Complete refers only to the eligible local sources, never to coverage of server data.</summary>
public sealed record WorkspaceSearchPage
{
    public IReadOnlyList<WorkspaceSearchHit> Items { get; init; } = [];
    public int Offset { get; init; }
    public int PageSize { get; init; }
    // Matches among scanned sources. A partial scan may miss a newer duplicate, so this is not a final total or lower bound.
    public int TotalMatches { get; init; }
    public bool HasMore { get; init; }
    public bool Complete { get; init; }
    public IReadOnlyList<string> Limitations { get; init; } = [];
    public int ScannedRecords { get; init; }
}

/// <summary>Limits can only reduce the hard bounds. Partial scans are explicitly reported.</summary>
public sealed record WorkspaceSearchLimits
{
    public long MaxSourceBytes { get; init; } = 32 * 1024 * 1024;
    public int MaxRecords { get; init; } = 50_000;
    public int MaxMatches { get; init; } = 10_000;
}

/// <summary>Pure, bounded search of the supplied workspace's business cache, drafts and immutable request history.</summary>
public static class WorkspaceSearch
{
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private static readonly HashSet<string> ReviewKinds = new(StringComparer.Ordinal)
    { "articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health" };
    private static readonly HashSet<string> DraftKinds = new(StringComparer.Ordinal)
    { "todo", "todo-note", "unscheduled", "template", "note", "legacy", "memo", "group", "reminder", "article", "ai-report", "label", "label-create" };
    private sealed record Route(string Kind, string Id, string Mode, string? Date, string? Category);
    private sealed record Candidate(WorkspaceSearchHit Hit, string Text, long Version);

    public static WorkspaceSearchPage Search(WorkspaceState state, string query, int offset = 0, int pageSize = 50,
        CancellationToken cancellationToken = default, WorkspaceSearchLimits? limits = null)
    {
        ArgumentNullException.ThrowIfNull(state); ArgumentNullException.ThrowIfNull(query);
        if (string.IsNullOrWhiteSpace(state.ScopeId)) throw new ArgumentException("搜索缺少当前工作区身份。", nameof(state));
        if (offset is < 0 or > 10_000) throw new ArgumentOutOfRangeException(nameof(offset));
        if (pageSize is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(pageSize));
        if (query.Length > 512) throw new ArgumentException("搜索词最多 256 个 Unicode 字符。", nameof(query));
        try { _ = StrictUtf8.GetByteCount(query); }
        catch (EncoderFallbackException error) { throw new ArgumentException("搜索词含无效 Unicode。", nameof(query), error); }
        if (query.EnumerateRunes().Count() > 256) throw new ArgumentException("搜索词最多 256 个 Unicode 字符。", nameof(query));
        limits ??= new();
        if (limits.MaxSourceBytes is < 1 or > 32 * 1024 * 1024 || limits.MaxRecords is < 1 or > 50_000 || limits.MaxMatches is < 1 or > 10_000)
            throw new ArgumentOutOfRangeException(nameof(limits));
        cancellationToken.ThrowIfCancellationRequested();
        var terms = query.Normalize().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        if (terms.Length == 0) return new() { Offset = offset, PageSize = pageSize, Complete = true };
        return new Scanner(state, terms, offset, pageSize, limits, cancellationToken).Run();
    }

    private sealed class Scanner(WorkspaceState state, string[] terms, int offset, int pageSize,
        WorkspaceSearchLimits limits, CancellationToken cancellationToken)
    {
        private readonly Dictionary<string, Candidate> cache = new(StringComparer.Ordinal);
        private readonly List<Candidate> others = [];
        private readonly HashSet<string> limitations = new(StringComparer.Ordinal);
        private long sourceBytes;
        private int scanned;
        private int textValues;
        private int previewValues;
        private int sourceCount;
        private bool stopped;

        public WorkspaceSearchPage Run()
        {
            foreach (var (path, text) in state.Cache.OrderBy(pair => pair.Key, StringComparer.Ordinal))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var route = ParseRoute(path, cacheRead: true);
                if (route == null) continue;
                using var document = ParseSource(text);
                if (stopped) break;
                if (document == null || !OwnScope(document.RootElement)) continue;
                var root = document.RootElement;
                if (!Property(root, "data", out var data)) { limitations.Add("invalid-local-source"); continue; }
                if (!ValidData(route, data)) { limitations.Add("invalid-local-source"); continue; }
                var revision = state.CacheRevisions.GetValueOrDefault(path);
                foreach (var (kind, row, summary) in Rows(route, data))
                {
                    if (!Record()) break;
                    var candidate = Make(kind, row, path, route, "cache", revision, summary: summary);
                    if (candidate == null) continue;
                    var key = kind + "\0" + candidate.Hit.RecordId;
                    if (!cache.TryGetValue(key, out var old) || Prefer(candidate, old)) cache[key] = candidate;
                }
                if (stopped) break;
            }
            if (!stopped) foreach (var (key, draft) in state.Drafts.OrderBy(pair => pair.Key, StringComparer.Ordinal))
            {
                cancellationToken.ThrowIfCancellationRequested();
                // Never infer a business draft from arbitrary local configuration text.
                var route = DraftRoute(key);
                if (route == null || draft.Key != key) continue;
                using var document = ParseSource(draft.Text);
                if (stopped) break;
                if (document == null || !OwnScope(document.RootElement) || !Record()) continue;
                var root = document.RootElement;
                var kind = String(root, "kind");
                if (kind == "todo-note")
                {
                    try { var noteDraft = TodoNotes.ParseDraft(draft); route = route with { Date = noteDraft.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) }; }
                    catch (Exception error) when (error is InvalidDataException or ArgumentException or JsonException or InvalidOperationException) { limitations.Add("invalid-todo-note-draft"); continue; }
                }
                if (kind == "label-create") kind = "label";
                if (!(kind == "history" || DraftKinds.Contains(kind) || kind.StartsWith("review:", StringComparison.Ordinal) && ReviewKinds.Contains(kind[7..])) || kind != route.Kind)
                { limitations.Add("invalid-local-source"); continue; }
                if (Property(root, "key", out var payloadKey) && (payloadKey.ValueKind != JsonValueKind.String || String(root, "key") != key))
                { limitations.Add("invalid-local-source"); continue; }
                if (!Property(root, "values", out var values) || values.ValueKind != JsonValueKind.Object)
                { limitations.Add("invalid-local-source"); continue; }
                var original = Property(root, "original", out var origin) && origin.ValueKind == JsonValueKind.Object ? origin : default;
                var candidate = Make(kind, values, key, route, "draft", draft.BaselineConfirmedRevision,
                    sourceText: draft.Text, fallback: original, title: draft.Title);
                if (candidate != null) others.Add(candidate with { Hit = candidate.Hit with { LocalDraftKey = key } });
                if (stopped) break;
            }
            if (!stopped) foreach (var operation in state.Outbox.OrderBy(value => value.CreatedAt).ThenBy(value => value.Id, StringComparer.Ordinal))
            {
                cancellationToken.ThrowIfCancellationRequested();
                var route = ParseRoute(operation.Path, cacheRead: false);
                if (route == null) continue;
                if (route.Kind == "todo-note" && operation.TodoNoteDate != null) route = route with { Date = operation.TodoNoteDate };
                AddOperation(operation, route, operation.BodyJson, "request");
                if (!stopped && operation.PreparedBodyJson is { } prepared && prepared != operation.BodyJson)
                    AddOperation(operation, route, prepared, "prepared-request");
                if (!stopped && operation.RemoteJson is { } remote) AddOperation(operation, route, remote, "remote-evidence");
                if (stopped) break;
            }
            var matches = new List<WorkspaceSearchHit>();
            foreach (var candidate in cache.Values.Concat(others).OrderBy(value => value.Hit.Kind, StringComparer.Ordinal)
                .ThenBy(value => value.Hit.RecordId, StringComparer.Ordinal).ThenBy(value => value.Hit.Origin, StringComparer.Ordinal)
                .ThenBy(value => value.Hit.SourcePath, StringComparer.Ordinal).ThenBy(value => value.Hit.OperationId, StringComparer.Ordinal))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!terms.All(term => candidate.Text.Contains(term, StringComparison.OrdinalIgnoreCase))) continue;
                if (matches.Count >= limits.MaxMatches) { limitations.Add("match-budget"); break; }
                matches.Add(candidate.Hit with { Snippet = Snippet(candidate.Text, terms) });
            }
            return new()
            {
                Items = matches.Skip(offset).Take(pageSize).ToArray(), Offset = offset, PageSize = pageSize,
                TotalMatches = matches.Count, HasMore = matches.Count > offset + pageSize || limitations.Contains("match-budget"),
                Complete = limitations.Count == 0, Limitations = limitations.Order(StringComparer.Ordinal).ToArray(), ScannedRecords = scanned
            };
        }

        private JsonDocument? ParseSource(string text)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (stopped) return null;
            if (++sourceCount > 50_000) { Stop("source-count-budget"); return null; }
            // Count all original inputs, including rejected JSON; no source is silently sampled.
            if (text.Length > limits.MaxSourceBytes - sourceBytes) { Stop("source-byte-budget"); return null; }
            int bytes;
            try { bytes = StrictUtf8.GetByteCount(text); }
            catch (EncoderFallbackException) { limitations.Add("invalid-local-source"); return null; }
            if (bytes > limits.MaxSourceBytes - sourceBytes) { Stop("source-byte-budget"); return null; }
            sourceBytes += bytes;
            try
            {
                var document = JsonDocument.Parse(text, new() { MaxDepth = 64 });
                try
                {
                    if (SafePreview(document.RootElement)) return document;
                    document.Dispose(); return null;
                }
                catch { document.Dispose(); throw; }
            }
            catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException)
            { limitations.Add("invalid-local-source"); return null; }
        }

        private bool SafePreview(JsonElement value)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (++previewValues > 500_000) { Stop("text-value-budget"); return false; }
            if (value.ValueKind == JsonValueKind.Object)
            {
                if (!OwnScope(value)) return false;
                foreach (var property in value.EnumerateObject())
                {
                    // Whole original previews must be safe, including a draft's hidden baseline and request evidence.
                    if (ControlField(property.Name)) { limitations.Add("sensitive-local-source-excluded"); return false; }
                    if (!SafePreview(property.Value)) return false;
                }
            }
            else if (value.ValueKind == JsonValueKind.Array)
                foreach (var row in value.EnumerateArray()) if (!SafePreview(row)) return false;
            return true;
        }

        private bool OwnScope(JsonElement root)
        {
            if (root.ValueKind != JsonValueKind.Object) { limitations.Add("invalid-local-source"); return false; }
            if (!Property(root, "_local_scope_id", out var scope)) return true;
            if (scope.ValueKind == JsonValueKind.String && String(root, "_local_scope_id") == state.ScopeId) return true;
            limitations.Add("foreign-local-source-excluded"); return false;
        }

        private bool Record()
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (stopped) return false;
            if (scanned >= limits.MaxRecords) { Stop("record-budget"); return false; }
            scanned++; return true;
        }
        private void Stop(string reason) { limitations.Add(reason); stopped = true; }

        private void AddOperation(PendingOperation operation, Route route, string text, string origin)
        {
            using var document = ParseSource(text);
            if (document == null || !OwnScope(document.RootElement) || !Record()) return;
            var row = document.RootElement;
            if (origin == "remote-evidence" && Property(row, "data", out var data) && data.ValueKind == JsonValueKind.Object) row = data;
            var candidate = Make(route.Kind, row, operation.Path, route, origin, operation.ConfirmedRevision,
                sourceText: text, allowMissingId: true);
            if (candidate != null) others.Add(candidate with { Hit = candidate.Hit with
            { OperationId = operation.Id, PendingStatus = operation.Status, RecordId = candidate.Hit.RecordId.Length > 0 ? candidate.Hit.RecordId : operation.ResourceKey } });
        }

        private Candidate? Make(string kind, JsonElement row, string path, Route route, string origin, long revision,
            bool summary = false, string? sourceText = null, JsonElement fallback = default, string? title = null, bool allowMissingId = false)
        {
            try { return MakeCore(kind, row, path, route, origin, revision, summary, sourceText, fallback, title, allowMissingId); }
            catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or InvalidDataException)
            { limitations.Add("invalid-local-source"); return null; }
        }

        private Candidate? MakeCore(string kind, JsonElement row, string path, Route route, string origin, long revision,
            bool summary, string? sourceText, JsonElement fallback, string? title, bool allowMissingId)
        {
            if (row.ValueKind != JsonValueKind.Object) { limitations.Add("invalid-local-source"); return null; }
            if (!OwnScope(row)) return null;
            var id = String(row, kind == "label" ? "name" : "id");
            if (id.Length == 0) id = String(fallback, kind == "label" ? "name" : "id");
            if (id.Length == 0) id = route.Id;
            var date = First(String(row, "date"), String(row, "report_date"), String(row, "snapshot_date"), String(row, "published_on"),
                String(row, "observed_on"), String(row, "collected_on"), String(row, "period_start"), String(fallback, "date"), route.Date);
            var category = First(String(row, "category"), String(fallback, "category"), route.Category);
            if (kind == "legacy") id = (category ?? "life") + ":" + date;
            if (id.Length == 0 && origin == "draft") id = path;
            if (id.Length == 0 && !allowMissingId) { limitations.Add("invalid-local-source"); return null; }
            var fields = new List<string>();
            CollectText(row, fields, () =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (++textValues <= 250_000) return true;
                Stop("text-value-budget"); return false;
            });
            var displayTitle = First(String(row, "title"), String(row, "name"), title, String(row, "text"),
                String(row, "summary"), String(row, "author"), String(fallback, "title"), kind) ?? kind;
            // Draft matching uses current editor values, never a hidden old baseline as if it were the current draft.
            var text = string.Join('\n', new[] { displayTitle, id, date, category }.Where(value => value != null).Concat(fields)).Normalize();
            var hasBody = !summary && HasBody(kind, row);
            return new(new()
            {
                Kind = kind, Title = Truncate(displayTitle, 100), SourcePath = path, RecordId = id,
                Date = date, Category = category, Origin = origin, SourceText = sourceText ?? row.GetRawText(),
                SourceRevision = revision, HasFullBody = hasBody,
                Deleted = Boolean(row, "deleted") || Property(row, "deleted_at", out var deletedAt) && deletedAt.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined)
            }, text, Property(row, "version", out var version) && version.ValueKind == JsonValueKind.Number && version.TryGetInt64(out var integer) ? integer : -1);
        }
    }

    private static bool Prefer(Candidate candidate, Candidate current)
    {
        var revision = candidate.Hit.SourceRevision.CompareTo(current.Hit.SourceRevision);
        if (revision != 0) return revision > 0;
        var version = candidate.Version.CompareTo(current.Version);
        if (version != 0) return version > 0;
        if (candidate.Hit.HasFullBody != current.Hit.HasFullBody) return candidate.Hit.HasFullBody;
        return string.CompareOrdinal(candidate.Hit.SourcePath, current.Hit.SourcePath) < 0;
    }

    private static IEnumerable<(string Kind, JsonElement Row, bool Summary)> Rows(Route route, JsonElement data)
    {
        if (route.Mode == "memos")
        {
            foreach (var row in Array(data, "groups")) yield return ("group", row, false);
            foreach (var row in Array(data, "notes")) yield return ("memo", row, true);
        }
        else if (route.Mode == "labels")
        {
            foreach (var row in Array(data, "labels")) yield return ("label", row, false);
            foreach (var row in Array(data, "archived_labels")) yield return ("label", row, false);
        }
        else if (route.Mode == "list")
        {
            if (data.ValueKind == JsonValueKind.Array) foreach (var row in data.EnumerateArray()) yield return (route.Kind, row, false);
            else foreach (var row in Array(data, route.Kind == "note" ? "entries" : "items")) yield return (route.Kind, row, false);
        }
        else yield return (route.Kind, data, false);
    }

    private static bool ValidData(Route route, JsonElement data)
    {
        bool HasArray(string key) => Property(data, key, out var field) && field.ValueKind == JsonValueKind.Array;
        return route.Mode switch
        {
            "memos" => HasArray("groups") && HasArray("notes"),
            "labels" => HasArray("labels") && HasArray("archived_labels"),
            "list" when route.Kind == "article" => data.ValueKind == JsonValueKind.Array,
            "list" => HasArray(route.Kind == "note" ? "entries" : "items"),
            _ => data.ValueKind == JsonValueKind.Object
        };
    }

    private static Route? ParseRoute(string path, bool cacheRead)
    {
        if (path.Length > 2048 || !path.StartsWith("/api/v1/", StringComparison.Ordinal) || path.Any(char.IsControl) || path.Contains(' ') || path.Contains('#') || path.Contains('\\')) return null;
        var parts = path.Split('?', 2);
        if (parts[0].Contains('%') || parts[0].Contains("..", StringComparison.Ordinal)) return null;
        var segments = parts[0][8..].Split('/');
        var query = new Dictionary<string, string>(StringComparer.Ordinal);
        if (parts.Length == 2) foreach (var field in parts[1].Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = field.Split('=', 2);
            try { if (!query.TryAdd(Uri.UnescapeDataString(pair[0]), pair.Length == 2 ? Uri.UnescapeDataString(pair[1].Replace('+', ' ')) : "")) return null; }
            catch (UriFormatException) { return null; }
        }
        var date = query.GetValueOrDefault("date");
        if (date != null && !DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return null;
        var category = query.GetValueOrDefault("category");
        if (category != null && category is not ("life" or "work")) return null;
        var kind = segments[0] switch
        {
            "todos" => "todo", "unscheduled-todos" => "unscheduled", "todo-templates" => "template",
            "note-entries" => "note", "daily-notes" => "legacy", "work-reminders" => "reminder",
            "articles" => "article", "ai-reports" => "ai-report", _ => ""
        };
        if (segments[0] == "memos")
        {
            if (query.Count != 0) return null;
            if (segments.Length == 1) return new("memo", "", "memos", date, category);
            if (segments.Length is >= 3 and <= 4 && segments[1] is "notes" or "groups" && SafeId(segments[2]) &&
                (!cacheRead || segments[1] == "notes" && segments.Length == 3) &&
                (segments.Length == 3 || !cacheRead && segments[3] is "restore" or "move"))
                return new(segments[1] == "notes" ? "memo" : "group", segments[2], "detail", date, category);
            return null;
        }
        if (segments[0] == "review")
        {
            if (segments.Length is < 2 or > 3 || !ReviewKinds.Contains(segments[1]) || segments.Length == 3 && !SafeId(segments[2])) return null;
            var allowed = segments.Length == 3 ? [] : segments[1] switch
            {
                "articles" => new[] { "offset", "read_revision", "page", "verdict", "account", "from", "to" },
                "snapshots" => ["offset", "read_revision", "account", "article_id"],
                "reports" => ["offset", "read_revision", "account", "period_type", "from", "to"],
                "playbooks" => ["offset", "read_revision", "account"],
                "benchmark-accounts" => ["offset", "read_revision", "include_deleted", "account", "platform"],
                "benchmark-articles" => ["offset", "read_revision", "include_deleted", "account", "benchmark_account_id", "collected_on", "sort"],
                "notes" => ["offset", "read_revision", "include_deleted", "account", "from", "to", "kind"],
                _ => ["offset", "read_revision", "include_deleted", "account", "platform", "from", "to"]
            };
            if (query.Keys.Any(name => !allowed.Contains(name, StringComparer.Ordinal))) return null;
            return new("review:" + segments[1], segments.Length == 3 ? segments[2] : "", segments.Length == 2 ? "list" : "detail", date, category);
        }
        if (kind.Length == 0 || segments.Length > (cacheRead ? 2 : 3)) return null;
        var allowedQuery = kind switch
        {
            "todo" when segments.Length == 1 => new[] { "date" },
            "note" when segments.Length == 1 => ["category", "date"],
            "legacy" => segments.Length == 1 ? ["category", "date"] : new[] { "category" },
            "reminder" when segments.Length == 1 => ["date"],
            "article" when segments.Length == 1 => ["page", "page_size", "account_id", "status", "q", "from", "to", "sort", "order", "platform", "fields"],
            "ai-report" when segments.Length == 1 => ["offset"],
            _ => []
        };
        if (query.Keys.Any(name => !allowedQuery.Contains(name, StringComparer.Ordinal))) return null;
        if (!cacheRead && kind == "todo" && segments.Length == 3 && segments[2] == "note" && Guid.TryParseExact(segments[1], "D", out _)) return new("todo-note", segments[1], "detail", date, null);
        if (cacheRead && segments.Length > 1 && kind is "todo" or "template" or "legacy" or "reminder" or "ai-report") return null;
        if (segments.Length == 2 && kind == "note" && segments[1] == "labels") return new("label", "", "labels", date, category);
        if (segments.Length == 2 && segments[1] is "dates" or "month" or "operations") return null;
        if (segments.Length > 1 && (!SafeId(segments[1]) || cacheRead && segments[1].Contains(':'))) return null;
        if (segments.Length == 3 && segments[2] is not ("restore" or "move" or "complete-today" or "template")) return null;
        if (kind == "legacy")
        {
            var day = segments.Length >= 2 ? segments[1] : date;
            if (day == null || !DateOnly.TryParseExact(day, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return null;
            return new(kind, day, "detail", day, category ?? "life");
        }
        return new(kind, segments.Length > 1 ? segments[1] : "", segments.Length > 1 ? "detail" : "list", date, category);
    }

    private static Route? DraftRoute(string key)
    {
        if (key.StartsWith("/local/todo-note/", StringComparison.Ordinal) && Guid.TryParseExact(key[17..], "D", out _))
            return new("todo-note", key[17..], "detail", null, null);
        if (key.StartsWith("/local/label-create/", StringComparison.Ordinal) && Guid.TryParseExact(key[20..], "D", out _))
            return new("label", "", "detail", null, null);
        if (key.StartsWith("/local/history/", StringComparison.Ordinal) && Guid.TryParseExact(key[15..], "D", out _))
            return new("history", "", "detail", null, null);
        return ParseRoute(key, cacheRead: false);
    }

    private static bool SafeId(string id) => id.Length is > 0 and <= 160 && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or ':');
    private static bool Property(JsonElement value, string key, out JsonElement result)
    { result = default; return value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out result); }
    private static string String(JsonElement value, string key)
    {
        try { return Property(value, key, out var field) && field.ValueKind == JsonValueKind.String ? field.GetString()! : ""; }
        catch (InvalidOperationException) { return ""; }
    }
    private static bool Boolean(JsonElement value, string key) => Property(value, key, out var field) && field.ValueKind == JsonValueKind.True;
    private static string? First(params string?[] values) => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
    private static IEnumerable<JsonElement> Array(JsonElement value, string key) => Property(value, key, out var rows) && rows.ValueKind == JsonValueKind.Array ? rows.EnumerateArray() : [];
    private static bool HasBody(string kind, JsonElement row) => kind switch
    {
        "memo" => Property(row, "body", out var body) && body.ValueKind == JsonValueKind.String,
        "note" or "legacy" or "todo" or "unscheduled" or "template" => Property(row, "text", out var text) && text.ValueKind == JsonValueKind.String,
        "ai-report" => Property(row, "content", out var content) && content.ValueKind == JsonValueKind.String,
        "reminder" => Property(row, "summary", out var summary) && summary.ValueKind == JsonValueKind.String,
        "article" => new[] { "body", "content", "content_md" }.Any(key => Property(row, key, out var field) && field.ValueKind == JsonValueKind.String),
        _ => new[] { "body", "content", "content_md", "summary_md", "note", "text" }.Any(key => Property(row, key, out var field) && field.ValueKind == JsonValueKind.String)
    };

    private static bool CollectText(JsonElement row, List<string> fields, Func<bool> budget)
    {
        if (!budget()) return false;
        // Include actual user-facing values (including zero and explicit null), not arbitrary object member names.
        if (row.ValueKind == JsonValueKind.Object)
            foreach (var property in row.EnumerateObject())
            {
                // Preserve original preview bytes rather than redacting/rebuilding a source. Exclude any contaminated record.
                if (ControlField(property.Name))
                    throw new InvalidDataException("业务来源含控制凭据字段，不能进入搜索预览。");
                if (property.Name is "original" or "_local_scope_id") continue;
                if (!CollectText(property.Value, fields, budget)) return false;
            }
        else if (row.ValueKind == JsonValueKind.Array)
        {
            foreach (var value in row.EnumerateArray()) if (!CollectText(value, fields, budget)) return false;
        }
        else if (row.ValueKind == JsonValueKind.String) fields.Add(row.GetString()!);
        else if (row.ValueKind is JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False or JsonValueKind.Null) fields.Add(row.GetRawText());
        return true;
    }

    private static bool ControlField(string name) => name.ToLowerInvariant() is
        "csrftoken" or "csrf_token" or "token" or "password" or "secret" or "authorization" or "cookie" or "set-cookie" or "access_token" or "refresh_token" or "api_key" or "apikey";

    private static string Truncate(string text, int maxRunes)
    {
        var runes = text.EnumerateRunes().Take(maxRunes + 1).ToArray();
        if (runes.Length <= maxRunes) return text;
        return string.Concat(runes.Take(maxRunes).Select(rune => rune.ToString())) + "…";
    }
    private static string Snippet(string text, string[] terms)
    {
        var first = terms.Select(term => text.IndexOf(term, StringComparison.OrdinalIgnoreCase)).Where(index => index >= 0).DefaultIfEmpty(0).Min();
        // Move the window only at Unicode scalar boundaries. The full original source remains available separately.
        var start = 0; var before = new Queue<int>(); var position = 0;
        foreach (var rune in text.EnumerateRunes())
        {
            if (position >= first) break;
            before.Enqueue(position); if (before.Count > 35) before.Dequeue(); position += rune.Utf16SequenceLength;
        }
        if (before.Count > 0) start = before.Peek();
        return (start > 0 ? "…" : "") + Truncate(text[start..].Replace('\r', ' ').Replace('\n', ' '), 180);
    }
}
