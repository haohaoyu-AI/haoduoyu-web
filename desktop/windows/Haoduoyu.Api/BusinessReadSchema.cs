using System.Globalization;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

/// <summary>Reject incomplete successful reads before callers can replace an existing cache.</summary>
internal static class BusinessReadSchema
{
    private const long MaxSafe = 9_007_199_254_740_991;
    internal static void Validate(string path, ApiResult result)
    {
        if (!result.IsSuccess) return;
        try
        {
            var root = Object(JsonNode.Parse(result.Json)); var data = root["data"];
            var split = path.Split('?', 2); var route = split[0];
            var query = split.Length == 1 ? new Dictionary<string, string>() : split[1].Split('&').Select(part => part.Split('=', 2))
                .ToDictionary(pair => pair[0], pair => Uri.UnescapeDataString(pair[1]), StringComparer.Ordinal);
            string? Requested(string name) => query.GetValueOrDefault(name);
            if (route == "/api/v1/auth/me")
            {
                var value = Object(data); Identifier(value["id"]); Text(value["username"]);
                if (value["publicBusiness"]?.GetValue<bool>() != true) Text(value["csrfToken"]);
            }
            else if (route == "/api/v1/todos")
            {
                var value = Object(data); Date(value["date"]); Date(value["today"]); Matches(value["date"], Requested("date"));
                Choice(value["completed_mode"], "hide", "strike"); Integer(value["preferences_version"]);
                Rows(value["items"], row => { Todo(row, dated: true); Matches(row["date"], Text(value["date"])); });
            }
            else if (route == "/api/v1/unscheduled-todos") Rows(Object(data)["items"], row => Todo(row, dated: false));
            else if (route.StartsWith("/api/v1/unscheduled-todos/", StringComparison.Ordinal))
            { var value = Object(data); Todo(value, dated: false); Matches(value["id"], route.Split('/')[4]); }
            else if (route == "/api/v1/todo-templates")
            {
                var value = Object(data); Date(value["today"]); Date(value["window_start"]);
                Rows(value["items"], row => { Uuid(row["id"]); Text(row["text"]); Version(row["version"]); Integer(row["completed_days"], 0, 30); Choice(row["habit_status"], "todo", "habit"); });
            }
            else if (route == "/api/v1/todo-preferences")
            { var value = Object(data); Choice(value["completed_mode"], "strike", "hide"); Integer(value["version"]); }
            else if (route == "/api/v1/note-entries/labels")
            {
                var value = Object(data); if (Integer(value["labels_version"]) != 3) Invalid();
                Rows(value["labels"], row => { Text(row["name"]); Stamp(row["created_at"]); });
                Rows(value["archived_labels"], row => { Text(row["name"]); Stamp(row["archived_at"]); });
            }
            else if (route == "/api/v1/note-entries/month")
            {
                var value = Object(data); Matches(value["format"], "haoduoyu-note-month-v1"); True(value["complete"]);
                var month = Text(value["month"]); if (month.Length != 7) Invalid(); Date(JsonValue.Create(month + "-01")); Matches(value["month"], Requested("month"));
                Rows(value["days"], day =>
                {
                    Date(day["date"]); if (!Text(day["date"]).StartsWith(month + "-", StringComparison.Ordinal)) Invalid();
                    Rows(day["items"], row => { Identifier(row["entity_id"]); Choice(row["source"], "note_entry", "legacy_daily_note"); Category(row["category"]); Text(row["text"], empty: true); Strings(row["labels"]); Stamp(row["updated_at"]); });
                });
            }
            else if (route is "/api/v1/note-entries/dates" or "/api/v1/daily-notes/dates") DatesPage(Object(data));
            else if (route.StartsWith("/api/v1/note-entries/operations/", StringComparison.Ordinal) || route.StartsWith("/api/v1/memos/operations/", StringComparison.Ordinal))
                Receipt(Object(data), memo: route.StartsWith("/api/v1/memos/", StringComparison.Ordinal));
            else if (route == "/api/v1/note-entries")
            {
                var value = Object(data); Category(value["category"]); Date(value["date"]); Boolean(value["can_edit"]);
                Matches(value["category"], Requested("category")); Matches(value["date"], Requested("date"));
                if (Integer(value["labels_version"]) != 3) Invalid();
                Rows(value["entries"], row => { Note(row); Matches(row["category"], Text(value["category"])); Matches(row["date"], Text(value["date"])); });
            }
            else if (route.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal))
            { var value = Object(data); Note(value); Matches(value["id"], route.Split('/')[4]); }
            else if (route == "/api/v1/daily-notes")
            {
                var value = Object(data); Date(value["date"]); Text(value["text"], empty: true); Integer(value["version"]); Boolean(value["can_edit"]); Boolean(value["deleted"]);
                Matches(value["date"], Requested("date"));
            }
            else if (route == "/api/v1/memos")
            {
                var value = Object(data); Boolean(value["can_edit"]);
                Rows(value["groups"], row => { Memo(row, body: false); Integer(row["active_note_count"]); });
                Rows(value["notes"], row => { Memo(row, body: false); Uuid(row["group_id"]); });
            }
            else if (route.StartsWith("/api/v1/memos/notes/", StringComparison.Ordinal))
            { var value = Object(data); Memo(value, body: true); Boolean(value["can_edit"]); Matches(value["id"], route.Split('/')[5]); }
            else if (route == "/api/v1/work-reminders")
            {
                var value = Object(data); Date(value["date"]); Matches(value["date"], Requested("date")); Boolean(value["can_edit"]);
                Rows(value["items"], row => { Uuid(row["id"]); Date(row["date"]); Version(row["version"]); Text(row["source_key"]); Text(row["summary"], empty: true); Matches(row["date"], Text(value["date"])); Hash(row["content_hash"]); Boolean(row["can_edit"]); });
            }
            else if (route == "/api/v1/accounts") Rows(data, row => { Identifier(row["id"]); Text(row["name"]); Text(row["platform"]); });
            else if (route == "/api/v1/ai-reports")
            {
                var value = Object(data); var more = Boolean(value["has_more"]);
                var items = Array(value["items"]); if (items.Count > 100 || more && items.Count != 100) Invalid();
                Rows(items, row => { Uuid(row["id"]); Text(row["author"]); Text(row["content"]); Stamp(row["created_at"]); Hash(row["content_hash"]); });
            }
            else if (route == "/api/v1/account-profiles") Rows(data, row => { Identifier(row["account_id"]); Text(row["profile_url"]); Text(row["platform_identity"]); });
            else if (route == "/api/v1/articles")
            {
                Rows(data, row => Article(row, index: Requested("fields") == "index"));
                var meta = Object(root["meta"]); Integer(meta["total"]); Integer(meta["unfiltered_total"]); Integer(meta["page"], 1); Integer(meta["offset"]); Boolean(meta["has_more"]);
                if (Requested("page") is not null || Requested("page_size") is not null) Integer(meta["page_size"], 1, 200);
            }
            else if (route.StartsWith("/api/v1/articles/", StringComparison.Ordinal))
            { var value = Object(data); Article(value, index: false); Matches(value["id"], route.Split('/')[4]); }
            else if (route == "/api/v1/observations") Rows(data, row => { Identifier(row["id"]); Identifier(row["article_id"]); Stamp(row["as_of"]); Object(row["metrics"]); });
            else if (route == "/api/v1/daily-metrics") Rows(data, row => { Identifier(row["id"]); Identifier(row["account_id"]); Date(row["date"]); Object(row["metrics"]); });
            else if (route == "/api/v1/due-reviews") Rows(data, row => { Identifier(row["id"]); Text(row["title"]); Choice(row["due_kind"], "d1", "d3", "d7"); Stamp(row["due_at"]); });
            else if (route == "/api/v1/overview")
            {
                var value = Object(data); var window = Object(value["window"]); Date(window["from"]); Date(window["to"]);
                Array(value["accounts"]); Array(value["trend"]); Array(value["publication_trend"]); Array(value["attention_articles"]); Array(value["due_reviews"]); Object(value["totals"]); Object(value["data_status"]);
            }
            else if (route == "/api/v1/article-reconciliation")
            { var value = Object(data); True(value["complete"]); Integer(value["total"]); Rows(value["rows"], row => { Identifier(row["id"]); Text(row["title"]); }); Object(value["counts"]); Array(value["dates"]); Object(value["insurance"]); }
            else if (route.StartsWith("/api/v1/review/", StringComparison.Ordinal)) Review(route, Object(data));
            else if (route.StartsWith("/api/v1/workbench-snapshot", StringComparison.Ordinal)) WorkbenchSnapshot(route, Object(data));
            else if (route.StartsWith("/api/v1/snapshot", StringComparison.Ordinal)) DailySnapshot(route, Object(data));
            else Invalid();
        }
        catch (Exception error) when (error is InvalidDataException or InvalidOperationException or ArgumentException or FormatException or System.Text.Json.JsonException or KeyNotFoundException)
        { throw new ApiCallException("读取响应不完整或身份、日期、版本字段无效；原缓存与本机草稿已保留。", result.StatusCode, result.RequestId); }
    }

    private static void Todo(JsonObject row, bool dated)
    { Uuid(row["id"]); Version(row["version"]); Text(row["text"]); Boolean(row["completed"]); if (dated) Date(row["date"]); NullableStamp(row, "deleted_at"); }
    private static void Note(JsonObject row)
    { Uuid(row["id"]); Version(row["version"]); Category(row["category"]); Date(row["date"]); Text(row["text"], empty: true); Boolean(row["can_edit"]); Boolean(row["deleted"]); Strings(row["labels"]); Hash(row["content_hash"]); }
    private static void Memo(JsonObject row, bool body)
    { Uuid(row["id"]); Version(row["version"]); Text(row["title"]); Integer(row["position"], 0, 1_000_000); NullableStamp(row, "deleted_at"); if (body) { Uuid(row["group_id"]); Text(row["body"], empty: true); } }
    private static void Article(JsonObject row, bool index)
    {
        Identifier(row["id"]); Identifier(row["account_id"]); Text(row["title"]); Text(row["platform"]);
        if (!index) { Version(row["version"]); if (!row.ContainsKey("status")) Invalid(); if (row["status"] is not null) Choice(row["status"], "drafting", "illustrated", "draft_saved", "published", "failed"); }
    }
    private static void DatesPage(JsonObject value)
    { foreach (var date in Array(value["dates"])) Date(date); var more = Boolean(value["has_more"]); if (!value.ContainsKey("next_before") || more && value["next_before"] is null) Invalid(); if (value["next_before"] is not null) Date(value["next_before"]); }
    private static void Receipt(JsonObject value, bool memo)
    {
        if (!Boolean(value["found"])) return;
        Uuid(value["id"]); Version(value["version"]); Integer(value["change_seq"], 1); NullableStamp(value, "deleted_at");
        Hash(value[memo ? "entity_hash" : "content_hash"]); if (memo) Choice(value["kind"], "groups", "notes");
    }
    private static void Review(string route, JsonObject value)
    {
        var parts = route.Split('/');
        if (parts[4] == "overview")
        { Text(value["account"]); Object(value["current"]); Object(value["changes"]); Array(value["trend"]); Text(value["summary"], empty: true); return; }
        void Entity(JsonObject row)
        {
            Uuid(row["id"]); Hash(row["content_hash"]);
            var fields = parts[4] switch
            {
                "articles" => "account,platform,platform_article_id,title,url,published_at,topic_category,title_pattern,sample_title,sample_url,reference_article_id,image_count,source_chat,playbook_version_used,applied_rule_ids,created_at,updated_at",
                "snapshots" => "article_id,snapshot_date,age_hours,source,impressions,fan_impressions,reads,fan_reads,ctr,completion_rate,avg_read_seconds,likes,comments,reposts,shares,favorites,revenue,traffic_sources,completion_curve,audience",
                "reports" => "account,period_type,period_start,period_end,verdicts,findings,summary_md,metrics,playbook_version,created_at",
                "playbooks" => "account,status,version,published_on,content_md,rules,changelog_md,sent_to_gemini_at,created_at",
                "benchmark-accounts" => "account,platform,name,profile_url,fans,is_featured_author,posting_cadence,topic_focus,title_patterns,structure_notes_md,created_at,updated_at,deleted_at",
                "benchmark-articles" => "benchmark_account_id,title,url,reads,published_at,title_pattern,topic,news_hook,word_count,image_count,collected_on,account,used_by_article_ids,created_at,updated_at,deleted_at",
                "notes" => "account,note_date,kind,title,body_md,tags,related_article_ids,related_rule_ids,decided_by,created_at,updated_at,deleted_at",
                "account-health" => "account,platform,observed_on,impressions_per_day,reads_per_day,ctr,since_date,platform_notice,judgement,action,resume_on,created_at,updated_at,deleted_at",
                _ => throw new InvalidDataException()
            };
            if (fields.Split(',').Any(field => !row.ContainsKey(field))) Invalid();
            switch (parts[4])
            {
                case "articles": Text(row["account"]); Text(row["title"]); Choice(row["platform"], "toutiao"); break;
                case "snapshots": Uuid(row["article_id"]); Date(row["snapshot_date"]); break;
                case "reports": Text(row["account"]); Choice(row["period_type"], "daily", "weekly", "three_day"); Date(row["period_start"]); Date(row["period_end"]); Object(row["verdicts"]); Object(row["findings"]); Object(row["metrics"]); Text(row["summary_md"], empty: true); break;
                case "playbooks": Text(row["account"]); Version(row["version"]); Date(row["published_on"]); Choice(row["status"], "draft", "active", "archived"); Array(row["rules"]); Text(row["content_md"], empty: true); Text(row["changelog_md"], empty: true); break;
                case "benchmark-accounts": Text(row["account"]); Text(row["platform"]); Text(row["name"]); break;
                case "benchmark-articles": Uuid(row["benchmark_account_id"]); Text(row["title"]); Text(row["url"]); break;
                case "notes": Text(row["account"]); Date(row["note_date"]); Choice(row["kind"], "insight", "decision", "diagnosis", "account_health"); Text(row["title"]); break;
                case "account-health": Text(row["account"]); Text(row["platform"]); Date(row["observed_on"]); break;
            }
        }
        if (parts.Length == 5)
        { Rows(value["items"], Entity); Boolean(value["has_more"]); Integer(value["read_revision"]); }
        else { Entity(value); Matches(value["id"], parts[5]); }
    }
    private static void WorkbenchSnapshot(string route, JsonObject value)
    {
        True(value["complete"]); Hash(value["scope_id"]); Hash(value["manifest_hash"]); Hash(value["global_content_hash"]);
        Choice(value["snapshot_format"], "haoduoyu-workbench-snapshot-v1", "haoduoyu-workbench-snapshot-v2");
        Rows(value["entities"], EntityMetadata);
        if (route.EndsWith("/index", StringComparison.Ordinal)) { Hash(value["index_hash"]); Rows(value["dates"], row => { Date(row["date"]); Hash(row["content_hash"]); }); }
        else
        {
            Date(value["date"]); Hash(value["content_hash"]); Hash(value["date_content_hash"]); var collections = Object(value["data"]);
            foreach (var name in new[] { "todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos" }) Rows(collections[name], SnapshotEntity);
            if (Text(value["snapshot_format"]).EndsWith("v2", StringComparison.Ordinal)) { Rows(collections["unscheduled_todos"], SnapshotEntity); Rows(collections["note_labels"], SnapshotEntity); }
        }
    }
    private static void DailySnapshot(string route, JsonObject value)
    {
        Hash(value["scope_id"]); Text(value["snapshot_format"]);
        if (route.EndsWith("/index", StringComparison.Ordinal)) { True(value["complete"]); Hash(value["index_hash"]); Rows(value["dates"], row => { Date(row["date"]); Hash(row["content_hash"]); }); }
        else
        {
            Date(value["date"]); Hash(value["content_hash"]); var collections = Object(value["data"]);
            foreach (var name in new[] { "todos", "templates", "notes", "accounts", "articles", "observations", "daily_metrics" }) Array(collections[name]);
            if (Text(value["snapshot_format"]).EndsWith("v2", StringComparison.Ordinal)) Array(collections["work_notes"]);
            Object(collections["habit30days"]);
        }
    }
    private static void EntityMetadata(JsonObject row)
    {
        Identifier(row["entity_id"]); Text(row["entity_type"]); Hash(row["content_hash"]); Stamp(row["updated_at"]); NullableStamp(row, "deleted_at");
        if (!row.ContainsKey("date")) Invalid(); if (row["date"] is not null) Date(row["date"]);
    }
    private static void SnapshotEntity(JsonObject row)
    { EntityMetadata(row); Identifier(row["source_id"]); Text(row["source"]); Version(row["version"]); }

    private static JsonObject Object(JsonNode? node) => node as JsonObject ?? throw new InvalidDataException();
    private static JsonArray Array(JsonNode? node) => node as JsonArray ?? throw new InvalidDataException();
    private static void Rows(JsonNode? node, Action<JsonObject> validate) { foreach (var row in Array(node)) validate(Object(row)); }
    private static string Text(JsonNode? node, bool empty = false)
    { if (node is not JsonValue value || !value.TryGetValue<string>(out var text) || !empty && text.Length == 0) throw new InvalidDataException(); return text; }
    private static void Identifier(JsonNode? node)
    { var text = Text(node); if (string.IsNullOrWhiteSpace(text) || text.Length > 512 || text is "." or ".." || text.Any(c => char.IsControl(c) || c is '/' or '\\' or '?' or '#')) Invalid(); }
    private static void Uuid(JsonNode? node) { var text = Text(node); if (!Guid.TryParseExact(text, "D", out var id) || id.ToString("D") != text.ToLowerInvariant()) Invalid(); }
    private static long Version(JsonNode? node) => Integer(node, 1);
    private static long Integer(JsonNode? node, long min = 0, long max = MaxSafe)
    {
        if (node is not JsonValue value) throw new InvalidDataException();
        long number; if (!value.TryGetValue<long>(out number)) { if (!value.TryGetValue<int>(out var integer)) throw new InvalidDataException(); number = integer; }
        if (number < min || number > max) Invalid(); return number;
    }
    private static bool Boolean(JsonNode? node) => node is JsonValue value && value.TryGetValue<bool>(out var result) ? result : throw new InvalidDataException();
    private static void True(JsonNode? node) { if (!Boolean(node)) Invalid(); }
    private static void Choice(JsonNode? node, params string[] choices) { if (!choices.Contains(Text(node), StringComparer.Ordinal)) Invalid(); }
    private static void Category(JsonNode? node) => Choice(node, "life", "work");
    private static void Hash(JsonNode? node) { var text = Text(node); if (text.Length != 64 || text.Any(c => !char.IsAsciiHexDigitLower(c))) Invalid(); }
    private static void Date(JsonNode? node) { if (!DateOnly.TryParseExact(Text(node), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) Invalid(); }
    private static void Stamp(JsonNode? node) { var text = Text(node); if (!text.Contains('T') || !DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) Invalid(); }
    private static void NullableStamp(JsonObject node, string key) { if (!node.ContainsKey(key)) Invalid(); if (node[key] is not null) Stamp(node[key]); }
    private static void Strings(JsonNode? node) { foreach (var value in Array(node)) Text(value); }
    private static void Matches(JsonNode? node, string? expected) { if (expected is not null && Text(node) != expected) Invalid(); }
    private static void Invalid() => throw new InvalidDataException();
}
