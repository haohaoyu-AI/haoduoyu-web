using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Haoduoyu.Core;

/// <summary>Detached, current-partition offline view. No cache, draft, intent or server version is mutated.</summary>
public static class WorkspaceProjection
{
    private sealed record Read(string Kind, string Mode, string Id, Dictionary<string, string> Query)
    {
        public string Q(string name) => Query.GetValueOrDefault(name, "");
    }
    private sealed record Entity(string Kind, string Id, JsonObject Row, long Revision);
    private sealed record Authority(Read Read, long Revision, HashSet<string> Members, bool IncludesDeleted);
    private sealed record Command(string Kind, string Id, JsonObject Body, Read Route);

    public static string? Project(string readPath, string? cachedJson, WorkspaceState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        if (string.IsNullOrWhiteSpace(state.ScopeId)) throw new InvalidDataException("离线投影缺少明确工作区身份。");
        var read = Parse(readPath);
        var exact = ParseEnvelope(cachedJson, state.ScopeId);
        if (read.Mode == "unsupported") return cachedJson;
        var entities = new Dictionary<string, Entity>(StringComparer.Ordinal);
        var authorities = new List<Authority>();
        var envelopes = new List<(Read Read, JsonObject Envelope, long Revision)>();
        foreach (var (path, json) in state.Cache)
        {
            var spec = Parse(path);
            if (spec.Mode == "unsupported") continue;
            var envelope = ParseEnvelope(path == readPath && cachedJson != null ? cachedJson : json, state.ScopeId);
            if (envelope == null) continue;
            var revision = state.CacheRevisions.GetValueOrDefault(path);
            envelopes.Add((spec, envelope, revision));
            Seed(spec, envelope, revision, entities, authorities);
        }
        if (exact != null && !state.Cache.ContainsKey(readPath))
        {
            envelopes.Add((read, exact, state.CacheRevisions.GetValueOrDefault(readPath)));
            Seed(read, exact, state.CacheRevisions.GetValueOrDefault(readPath), entities, authorities);
        }
        // A newer complete read is deletion evidence within its exact filter scope. Partial pages never are.
        foreach (var (key, entity) in entities.ToArray())
            if (authorities.Any(a => a.Revision > entity.Revision && Covers(a, entity.Kind, entity.Row, entities) && !a.Members.Contains(key)))
                entities.Remove(key);

        foreach (var operation in OrderedOperations(state.Outbox))
        {
            var command = GetCommand(operation);
            if (command == null) continue;
            if (command.Kind == "unscheduled" && command.Route.Mode is "move" or "complete-today")
            {
                ApplyMove(operation, command, entities, authorities, state);
                continue;
            }
            if (command.Kind == "todo" && command.Route.Mode == "template")
            {
                ApplyTodoTemplate(operation, command, entities, authorities, state);
                continue;
            }
            Apply(operation, command, entities, authorities, state);
        }
        ApplyLabelVisibility(entities);
        return Render(read, exact, envelopes, entities, authorities, state);
    }

    private static IEnumerable<PendingOperation> OrderedOperations(IReadOnlyList<PendingOperation> operations)
    {
        var lookup = operations.ToDictionary(operation => operation.Id, StringComparer.Ordinal);
        var complete = new HashSet<string>(StringComparer.Ordinal); var active = new HashSet<string>(StringComparer.Ordinal);
        var ordered = new List<PendingOperation>();
        PendingOperation? Resolve(string id)
        {
            var visited = new HashSet<string>(StringComparer.Ordinal);
            while (lookup.TryGetValue(id, out var found))
            {
                if (!visited.Add(id)) throw new InvalidDataException("离线操作替换关系形成循环。");
                if (found.Status != PendingStatus.Superseded) return found;
                if (found.SupersededById == null) return null;
                id = found.SupersededById;
            }
            return null;
        }
        void Visit(PendingOperation operation)
        {
            if (complete.Contains(operation.Id)) return;
            if (!active.Add(operation.Id)) throw new InvalidDataException("离线操作依赖形成循环。");
            foreach (var id in operation.DependencyIds) if (Resolve(id) is { } dependency) Visit(dependency);
            active.Remove(operation.Id); complete.Add(operation.Id); ordered.Add(operation);
        }
        foreach (var operation in operations.Select((value, index) => (value, index))
            .Where(x => x.value.Status != PendingStatus.Superseded).OrderBy(x => x.value.CreatedAt).ThenBy(x => x.index).Select(x => x.value)) Visit(operation);
        return ordered;
    }

    private static Read Parse(string path)
    {
        if (!path.StartsWith("/api/v1/", StringComparison.Ordinal) || path.Contains('#') || path.Contains('\\'))
            return new("", "unsupported", "", new());
        var parts = path.Split('?', 2); var query = new Dictionary<string, string>(StringComparer.Ordinal);
        if (parts.Length == 2) foreach (var field in parts[1].Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pair = field.Split('=', 2);
            var name = Uri.UnescapeDataString(pair[0]);
            if (!query.TryAdd(name, pair.Length == 2 ? Uri.UnescapeDataString(pair[1].Replace('+', ' ')) : ""))
                throw new ArgumentException("离线查询含重复参数。", nameof(path));
        }
        var segments = parts[0][8..].Split('/'); var resource = segments[0];
        var mode = segments.Length == 1 ? "list" : "detail";
        var id = segments.Length > 1 ? segments[1] : "";
        if (resource == "memos") return segments.Length == 1 ? new("memos", "memos", "", query) :
            segments.Length >= 3 && segments[1] is "groups" or "notes" ? new(segments[1] == "groups" ? "memo-group" : "memo-note", segments.Length > 3 ? segments[3] : "detail", segments[2], query) : new("", "unsupported", "", query);
        if (resource == "review") return segments.Length >= 2 && segments[1] != "overview" ?
            new("review:" + segments[1], segments.Length > 2 ? segments.Length > 3 ? segments[3] : "detail" : "list", segments.Length > 2 ? segments[2] : "", query) : new("", "unsupported", "", query);
        var kind = resource switch { "todos" => "todo", "unscheduled-todos" => "unscheduled", "todo-templates" => "template", "todo-preferences" => "preference", "note-entries" => "note", "daily-notes" => "legacy", "work-reminders" => "reminder", "articles" => "article", _ => "" };
        if (kind.Length == 0) return new("", "unsupported", "", query);
        if (kind == "preference") mode = "singleton";
        if (kind == "legacy" && segments.Length == 1) { mode = "detail"; id = query.GetValueOrDefault("date", ""); }
        if (kind == "note" && id == "labels") { kind = "label"; mode = "labels"; id = ""; }
        else if (kind == "note" && id == "month") { mode = "month"; id = ""; }
        else if ((kind is "note" or "legacy") && id == "dates") { mode = "dates"; id = ""; }
        else if (segments.Length > 2) mode = segments[2];
        if (id == "operations") mode = "unsupported";
        return new(kind, mode, id, query);
    }

    private static JsonObject? ParseEnvelope(string? json, string scope)
    {
        if (json == null) return null;
        var root = JsonNode.Parse(json) as JsonObject ?? throw new InvalidDataException("缓存响应不是对象。");
        if (root["_local_scope_id"] is JsonValue value && value.GetValue<string>() != scope)
            throw new InvalidDataException("离线响应属于其他工作区。");
        return root;
    }
    private static void Seed(Read read, JsonObject envelope, long revision, Dictionary<string, Entity> entities, List<Authority> authorities)
    {
        var data = envelope["data"];
        var members = new HashSet<string>(StringComparer.Ordinal);
        void Add(string kind, JsonObject row, string? forcedId = null)
        {
            if (kind is not ("legacy" or "preference") && !ValidIdentity(row, kind == "label" ? "name" : "id")) return;
            var id = forcedId ?? Text(row, kind == "label" ? "name" : "id");
            if (kind == "legacy") id = Category(read) + ":" + (Text(row, "date") is { Length: > 0 } day ? day : read.Id);
            if (kind == "preference") id = "preferences";
            if (id.Length == 0) return;
            var copy = (JsonObject)row.DeepClone();
            if (kind == "legacy") { copy["category"] = Category(read); if (Text(copy, "date").Length == 0) copy["date"] = read.Id; }
            var key = Key(kind, id); members.Add(key);
            var candidate = new Entity(kind, id, copy, revision);
            if (!entities.TryGetValue(key, out var current) || Prefer(candidate, current))
            {
                if (current != null && SameServerVersion(candidate.Row, current.Row))
                    foreach (var (name, value) in current.Row) if (!copy.ContainsKey(name)) copy[name] = value?.DeepClone();
                entities[key] = candidate;
            }
        }
        if (read.Mode == "memos" && data is JsonObject memos)
        {
            foreach (var row in Rows(memos["groups"])) Add("memo-group", row);
            foreach (var row in Rows(memos["notes"])) Add("memo-note", row);
        }
        else if (read.Mode == "labels" && data is JsonObject labels)
        {
            foreach (var row in Rows(labels["labels"])) Add("label", row);
            foreach (var row in Rows(labels["archived_labels"])) Add("label", row);
        }
        else if (read.Mode == "month" && data is JsonObject month)
        {
            foreach (var day in Rows(month["days"])) foreach (var item in Rows(day["items"]))
            {
                var row = (JsonObject)item.DeepClone(); row["date"] = Text(day, "date");
                // Month exports contain display summaries, never the versioned entity used by CAS editors.
                row["_local_incomplete"] = true;
                var identity = Text(row, "entity_id");
                if (identity.StartsWith("note-entry:", StringComparison.Ordinal)) { row["id"] = identity[11..]; Add("note", row); }
                else if (identity.StartsWith("legacy-", StringComparison.Ordinal) && identity.IndexOf(':') is var colon && colon > 7)
                {
                    var category = identity[7..colon]; row["category"] = category;
                    var key = Key("legacy", category + ":" + Text(day, "date"));
                    var candidate = new Entity("legacy", category + ":" + Text(day, "date"), row, revision);
                    if (!entities.TryGetValue(key, out var current) || Prefer(candidate, current)) entities[key] = candidate;
                }
            }
        }
        else if (read.Mode is "detail" or "singleton" && data is JsonObject detail && ValidDetail(read, detail)) Add(read.Kind, detail, read.Id.Length > 0 && read.Kind != "legacy" ? read.Id : null);
        else if (read.Mode == "list") foreach (var row in Rows(data is JsonArray ? data : data?[read.Kind == "note" ? "entries" : "items"])) Add(read.Kind, row);
        if (Complete(read, envelope)) authorities.Add(new(read, revision, members, Flag(envelope, "_local_complete") || read.Q("include_deleted") == "1" || read.Mode is "memos" or "labels"));
    }
    private static bool Complete(Read read, JsonObject envelope)
    {
        if (read.Mode is not ("list" or "memos" or "labels" or "singleton" or "detail")) return false;
        if (read.Mode == "detail") return false;
        var data = envelope["data"] as JsonObject;
        // Even a marked download must have the collection shape before absence is deletion evidence.
        if (read.Mode == "memos") return ValidCollection(data?["groups"]) && ValidCollection(data?["notes"]);
        if (read.Mode == "labels") return ValidCollection(data?["labels"], "name") && ValidCollection(data?["archived_labels"], "name");
        if (read.Kind == "preference") return data != null && ValidDetail(read, data);
        if (read.Kind == "note") return ValidCollection(data?["entries"]) && Text(data, "date") == read.Q("date") && Text(data, "category") == Category(read);
        if (read.Kind is "todo" or "reminder") return ValidCollection(data?["items"]) && Text(data, "date") == read.Q("date");
        if (read.Kind is "unscheduled" or "template") return ValidCollection(data?["items"]);
        if (read.Kind.StartsWith("review:", StringComparison.Ordinal)) return data != null && ValidCollection(data["items"]) &&
            (Flag(envelope, "_local_complete") || Number(read.Q("offset")) == 0 && Number(read.Q("page")) <= 1 && data.ContainsKey("has_more") && !Flag(data, "has_more"));
        return read.Kind == "article" && (ValidCollection(envelope["data"]) && read.Query.Count == 0 ||
            Flag(envelope, "_local_complete") && (ValidCollection(envelope["data"]) || ValidCollection(data?["items"])));
    }
    private static bool ValidCollection(JsonNode? node, string identity = "id")
    {
        if (node is not JsonArray rows) return false;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        return rows.All(row => row is JsonObject item && ValidIdentity(item, identity) && ids.Add(Text(item, identity)));
    }
    private static bool ValidIdentity(JsonObject row, string identity) => row[identity] is JsonValue value &&
        value.TryGetValue<string>(out var id) && !string.IsNullOrWhiteSpace(id) && id == id.Trim();
    private static bool ValidDetail(Read read, JsonObject data) => read.Kind switch
    {
        "legacy" => data.ContainsKey("text") && data.ContainsKey("version") && Text(data, "date") == read.Id,
        "preference" => data.ContainsKey("completed_mode") && data.ContainsKey("version"),
        _ => Text(data, "id").Length > 0 && (read.Id.Length == 0 || Text(data, "id") == read.Id)
    };
    private static bool Prefer(Entity candidate, Entity current)
    {
        var cv = Version(candidate.Row); var ov = Version(current.Row);
        if (cv.HasValue && ov.HasValue && cv != ov) return cv > ov;
        if (candidate.Revision == current.Revision && Flag(candidate.Row, "_local_incomplete") != Flag(current.Row, "_local_incomplete"))
            return !Flag(candidate.Row, "_local_incomplete");
        return candidate.Revision >= current.Revision;
    }
    private static bool SameServerVersion(JsonObject a, JsonObject b) => Version(a) is { } version && Version(b) == version ||
        Text(a, "content_hash") is { Length: > 0 } hash && Text(b, "content_hash") == hash;
    private static bool Covers(Authority authority, string kind, JsonObject row, Dictionary<string, Entity> entities)
    {
        var read = authority.Read;
        if (Deleted(row) && !authority.IncludesDeleted) return false;
        if (read.Mode == "memos") return kind is "memo-group" or "memo-note";
        if (read.Kind != kind) return false;
        return Matches(read, row, entities, includeDeleted: true);
    }

    private static Command? GetCommand(PendingOperation operation)
    {
        var route = Parse(operation.Path);
        if (route.Mode == "unsupported" || JsonNode.Parse(operation.RequestBodyJson) is not JsonObject body) return null;
        var id = route.Id;
        if (route.Kind == "preference") id = "preferences";
        else if (route.Kind == "label") id = Text(body, "name").Normalize(NormalizationForm.FormC);
        else if (route.Kind == "legacy") id = Category(route) + ":" + id;
        else if (id.Length == 0) id = Text(body, "id");
        if (id.Length == 0 && route.Kind == "article") id = operation.ResourceKey.Split('/').Last().Replace("new:", "", StringComparison.Ordinal);
        return id.Length == 0 ? null : new(route.Kind, id, body, route);
    }
    private static void Apply(PendingOperation operation, Command command, Dictionary<string, Entity> entities, List<Authority> authorities, WorkspaceState state)
    {
        var remote = Remote(operation);
        var id = operation.Status == PendingStatus.Confirmed && command.Kind == "article" && Text(remote, "id").Length > 0 ? Text(remote, "id") : command.Id;
        var key = Key(command.Kind, id); entities.TryGetValue(key, out var existing);
        var baseline = existing?.Row;
        var authorityRevision = authorities.Where(a => Covers(a, command.Kind, baseline ?? Identity(command.Kind, id, command.Body, command.Route), entities))
            .Select(a => a.Revision).DefaultIfEmpty(0).Max();
        if (operation.Status == PendingStatus.Confirmed)
        {
            if (operation.ConfirmedRevision == 0 || operation.ConfirmedRevision <= Math.Max(existing?.Revision ?? 0, authorityRevision) || remote == null) return;
            if (Version(baseline) is { } current && Version(remote) is { } saved && current > saved) return;
            if (Text(baseline, "content_hash") is { Length: > 0 } currentHash && Text(remote, "content_hash") is { Length: > 0 } savedHash && currentHash != savedHash &&
                Text(command.Body, "expected_hash") != currentHash && Version(baseline) == null) return;
            var confirmed = baseline == null ? Identity(command.Kind, id, command.Body, command.Route) : (JsonObject)baseline.DeepClone();
            foreach (var field in confirmed.Select(kv => kv.Key).Where(k => k.StartsWith("_local_", StringComparison.Ordinal) || k == "_operation_id").ToArray()) confirmed.Remove(field);
            foreach (var (name, value) in command.Body)
                if (!RequestControl(name)) confirmed[name] = value?.DeepClone();
            foreach (var (name, value) in remote) confirmed[name] = value?.DeepClone();
            if (command.Kind == "legacy") confirmed["category"] = Category(command.Route);
            if (command.Kind == "label") ApplyLabelAction(confirmed, command.Body, operation, confirmedResponse: true);
            if (operation.Method == "DELETE") confirmed["_local_deleted"] = true;
            else if (command.Route.Mode == "restore") confirmed["_local_deleted"] = false;
            if (!FullReceipt(command, remote))
            {
                confirmed["_local_incomplete"] = true; confirmed["_local_receipt_only"] = true;
                confirmed["_local_status"] = operation.Status.ToString(); confirmed["_operation_id"] = operation.Id;
                confirmed["_local_request"] = command.Body.DeepClone(); confirmed["_local_remote"] = remote.DeepClone();
            }
            entities[key] = new(command.Kind, id, confirmed, operation.ConfirmedRevision);
            return;
        }
        var local = baseline == null ? Identity(command.Kind, id, command.Body, command.Route) : (JsonObject)baseline.DeepClone();
        var isNew = baseline != null && Flag(baseline, "_local_new") || baseline == null &&
            (operation.Method == "POST" && command.Route.Mode == "list" || command.Body.ContainsKey("version") && Version(command.Body) == 0 ||
             command.Kind.StartsWith("review:", StringComparison.Ordinal) && operation.Method == "PUT" && !command.Body.ContainsKey("expected_hash"));
        foreach (var (name, value) in command.Body)
            if (!RequestControl(name)) local[name] = value?.DeepClone();
        if (baseline == null && command.Body.ContainsKey("version") && !command.Kind.StartsWith("review:", StringComparison.Ordinal)) local["version"] = command.Body["version"]?.DeepClone();
        if (operation.Method == "DELETE") local["_local_deleted"] = true;
        else if (command.Route.Mode == "restore") local["_local_deleted"] = false;
        else if (isNew) local["_local_deleted"] = false;
        if (command.Kind == "label") ApplyLabelAction(local, command.Body, operation, confirmedResponse: false);
        local["_local_status"] = operation.Status.ToString(); local["_operation_id"] = operation.Id; local["_local_new"] = isNew;
        local["_local_request"] = command.Body.DeepClone();
        if (baseline == null && !isNew) local["_local_incomplete"] = true;
        if (operation.Status is PendingStatus.Unknown or PendingStatus.Conflict or PendingStatus.Blocked)
            local["_local_remote"] = (remote ?? baseline)?.DeepClone();
        else if (baseline != null) local["_local_remote"] = baseline.DeepClone();
        entities[key] = new(command.Kind, id, local, existing?.Revision ?? 0);
    }
    private static bool RequestControl(string name) => name is "save_id" or "expected_hash" or "version" or "template_version" or "confirm_title" or "confirm_note_count" or "action";
    private static bool FullReceipt(Command command, JsonObject remote)
    {
        string[] required = command.Kind switch
        {
            "legacy" => ["date", "text", "version"], "preference" => ["completed_mode", "version"],
            "label" => ["name"], "todo" => ["id", "date", "text", "completed", "version"],
            "unscheduled" => ["id", "text", "completed", "version"], "note" => ["id", "category", "date", "text", "version"],
            "memo-group" => ["id", "title", "version"], "memo-note" => ["id", "title", "group_id", "body", "version"],
            "reminder" => ["id", "date", "summary", "version"], "template" => ["id", "text", "version"],
            "article" => ["id", "title", "version"], _ => ["id", "content_hash"]
        };
        return required.All(remote.ContainsKey) && command.Body.All(pair => RequestControl(pair.Key) || remote.ContainsKey(pair.Key));
    }
    private static JsonObject Identity(string kind, string id, JsonObject body, Read route)
    {
        var value = new JsonObject();
        if (kind == "legacy") { value["date"] = id[(id.IndexOf(':') + 1)..]; value["category"] = Category(route); }
        else if (kind == "label") value["name"] = id;
        else if (kind != "preference") value["id"] = id;
        if (kind is "todo" or "unscheduled") value["completed"] = false;
        foreach (var name in new[] { "date", "category", "group_id" }) if (body.ContainsKey(name)) value[name] = body[name]?.DeepClone();
        return value;
    }
    private static void ApplyMove(PendingOperation operation, Command command, Dictionary<string, Entity> entities, List<Authority> authorities, WorkspaceState state)
    {
        var remote = Remote(operation); var sourceKey = Key("unscheduled", command.Id);
        entities.TryGetValue(sourceKey, out var source);
        var sourceBody = (JsonObject)command.Body.DeepClone(); sourceBody.Remove("date");
        var sourceOp = operation with { Method = "DELETE", RemoteJson = remote?["source"] is JsonObject row ? new JsonObject { ["data"] = row.DeepClone() }.ToJsonString() : operation.RemoteJson };
        Apply(sourceOp, command with { Body = sourceBody, Route = command.Route with { Mode = "detail" } }, entities, authorities, state);
        var todoBody = source == null ? new JsonObject() : (JsonObject)source.Row.DeepClone();
        foreach (var key in todoBody.Select(kv => kv.Key).Where(k => k.StartsWith('_')).ToArray()) todoBody.Remove(key);
        todoBody.Remove("version"); todoBody.Remove("deleted_at"); todoBody["date"] = command.Body["date"]?.DeepClone(); todoBody["id"] = command.Id;
        if (command.Route.Mode == "complete-today") todoBody["completed"] = true;
        var targetOp = operation with { Method = "POST", RemoteJson = remote?["todo"] is JsonObject todo ? new JsonObject { ["data"] = todo.DeepClone() }.ToJsonString() : null };
        Apply(targetOp, new("todo", command.Id, todoBody, new("todo", "list", "", new())), entities, authorities, state);
    }
    private static void ApplyTodoTemplate(PendingOperation operation, Command command, Dictionary<string, Entity> entities, List<Authority> authorities, WorkspaceState state)
    {
        var remote = Remote(operation);
        var body = (JsonObject)command.Body.DeepClone(); body["template_active"] = true;
        var todoOp = operation with { RemoteJson = remote?["todo"] is JsonObject todo ? new JsonObject { ["data"] = todo.DeepClone() }.ToJsonString() : null };
        Apply(todoOp, command with { Body = body }, entities, authorities, state);
        if (Text(command.Body, "template_id") is not { Length: > 0 } templateId) return;
        entities.TryGetValue(Key("todo", command.Id), out var source);
        var templateBody = new JsonObject { ["id"] = templateId, ["text"] = source?.Row["text"]?.DeepClone() };
        var templateOp = operation with { Method = "POST", RemoteJson = remote?["template"] is JsonObject template ? new JsonObject { ["data"] = template.DeepClone() }.ToJsonString() : null };
        Apply(templateOp, new("template", templateId, templateBody, new("template", "list", "", new())), entities, authorities, state);
    }
    private static void ApplyLabelAction(JsonObject row, JsonObject body, PendingOperation operation, bool confirmedResponse)
    {
        var action = Text(body, "action");
        if (action == "delete") row["_local_deleted"] = true;
        else if (action is "archive" or "restore") row["_local_archived"] = action == "archive";
        else if (!confirmedResponse) row["_local_archived"] = false;
        if (!confirmedResponse) row["_local_action_at"] = operation.CreatedAt.ToString("O");
    }
    private static void ApplyLabelVisibility(Dictionary<string, Entity> entities)
    {
        var deleted = entities.Values.Where(e => e.Kind == "label" && Deleted(e.Row)).Select(e => e.Id).ToHashSet(StringComparer.Ordinal);
        if (deleted.Count == 0) return;
        foreach (var note in entities.Values.Where(e => e.Kind == "note" && e.Row["labels"] is JsonArray))
        {
            var labels = note.Row["labels"]!.AsArray().Where(value => value != null && !deleted.Contains(value.ToString())).Select(value => value?.DeepClone()).ToArray();
            if (labels.Length == note.Row["labels"]!.AsArray().Count) continue;
            note.Row["_local_labels"] = new JsonArray(labels);
            // The server hash/version still describes the cached server entity, never a fabricated rewrite.
        }
    }

    private static string? Render(Read read, JsonObject? exact, List<(Read Read, JsonObject Envelope, long Revision)> envelopes,
        Dictionary<string, Entity> entities, List<Authority> authorities, WorkspaceState state)
    {
        var relevant = entities.Values.Where(e => read.Mode == "memos" ? e.Kind is "memo-group" or "memo-note" : e.Kind == read.Kind).ToArray();
        var baseline = exact ?? envelopes.Where(e => CompatibleBaseline(read, e.Read))
            .OrderByDescending(e => e.Revision).Select(e => e.Envelope).FirstOrDefault();
        if (baseline == null && relevant.Length == 0) return null;
        var envelope = baseline == null ? new JsonObject() : (JsonObject)baseline.DeepClone();
        var dataObject = envelope["data"] as JsonObject;
        JsonNode? output;
        if (read.Mode == "detail" || read.Mode == "singleton")
        {
            var id = read.Kind == "legacy" ? Category(read) + ":" + read.Id : read.Kind == "preference" ? "preferences" : read.Id;
            if (!entities.TryGetValue(Key(read.Kind, id), out var value)) return null;
            output = value.Row.DeepClone();
            if (read.Kind == "memo-note" && !output.AsObject().ContainsKey("body")) output["_local_incomplete"] = true;
            if (read.Kind == "memo-note" && entities.TryGetValue(Key("memo-group", Text(output, "group_id")), out var group) && Deleted(group.Row)) output["_local_parent_deleted"] = true;
        }
        else if (read.Mode == "memos")
        {
            var groups = relevant.Where(e => e.Kind == "memo-group").OrderBy(e => Number(Text(e.Row, "position"))).ThenBy(e => e.Id).ToArray();
            var notes = relevant.Where(e => e.Kind == "memo-note" &&
                (!entities.TryGetValue(Key("memo-group", Text(e.Row, "group_id")), out var parent) || !Deleted(parent.Row))).ToArray();
            output = dataObject?.DeepClone().AsObject() ?? new JsonObject();
            foreach (var group in groups)
            {
                group.Row["_local_active_note_count"] = notes.Count(n => Text(n.Row, "group_id") == group.Id && !Deleted(n.Row));
            }
            output["groups"] = Array(groups.Select(e => e.Row)); output["notes"] = Array(notes.Select(e => e.Row));
        }
        else if (read.Mode == "labels")
        {
            output = dataObject?.DeepClone().AsObject() ?? new JsonObject();
            var active = relevant.Where(e => !Deleted(e.Row) && !Archived(e.Row)).OrderBy(e => e.Id).Select(e => e.Row);
            var archived = relevant.Where(e => !Deleted(e.Row) && Archived(e.Row)).OrderBy(e => e.Id).Select(e => e.Row);
            output["labels"] = Array(active); output["archived_labels"] = Array(archived);
        }
        else if (read.Mode == "dates")
        {
            output = dataObject?.DeepClone().AsObject() ?? new JsonObject();
            var dates = RowsForDates(read, relevant, dataObject, entities).Distinct(StringComparer.Ordinal).OrderDescending(StringComparer.Ordinal).ToArray();
            var count = (int)Math.Clamp(Number(read.Q("page_size"), 30), 1, 100);
            output["dates"] = new JsonArray(dates.Take(count).Select(day => (JsonNode?)JsonValue.Create(day)).ToArray());
            output["has_more"] = dates.Length > count || Flag(dataObject, "has_more"); output["next_before"] = dates.Length > count ? dates[count - 1] : dataObject?["next_before"]?.DeepClone();
        }
        else if (read.Mode == "month") return RenderMonth(read, envelope, entities, state);
        else
        {
            var filtered = relevant.Where(e => Matches(read, e.Row, entities, includeDeleted: false)).Select(e => e.Row).ToArray();
            var sorted = Sort(read, filtered).ToArray();
            if (read.Kind == "article" && read.Query.Count == 0 && (baseline?["data"] is JsonArray || baseline == null)) output = Array(sorted);
            else
            {
                output = dataObject?.DeepClone().AsObject() ?? new JsonObject();
                var pageSize = read.Kind == "article" ? (int)Math.Clamp(Number(read.Q("page_size"), 50), 1, 100) : 100;
                var page = Math.Clamp(Number(read.Q("page"), 1), 1, int.MaxValue / 100);
                var offset = read.Kind == "article" ? (int)((page - 1) * pageSize) : read.Kind.StartsWith("review:", StringComparison.Ordinal) ? (int)Math.Clamp(Number(read.Q("offset"), (page - 1) * 100), 0, int.MaxValue) : 0;
                var rows = read.Kind is "article" || read.Kind.StartsWith("review:", StringComparison.Ordinal) ? sorted.Skip(offset).Take(pageSize) : sorted;
                output[read.Kind == "note" ? "entries" : "items"] = Array(rows);
                if (read.Kind == "todo")
                {
                    output["date"] = read.Q("date") is { Length: > 0 } day ? day : dataObject?["date"]?.DeepClone();
                    if (entities.TryGetValue(Key("preference", "preferences"), out var preference))
                    {
                        output["completed_mode"] = preference.Row["completed_mode"]?.DeepClone(); output["preferences_version"] = preference.Row["version"]?.DeepClone();
                        if (preference.Row["_local_status"] != null) output["_local_preference_status"] = preference.Row["_local_status"]?.DeepClone();
                    }
                }
                if (read.Kind is "note" or "reminder") output["date"] = read.Q("date");
                if (read.Kind == "note") output["category"] = Category(read);
                if (read.Kind == "article" || read.Kind.StartsWith("review:", StringComparison.Ordinal))
                {
                    output["has_more"] = sorted.Length > offset + pageSize || (!authorities.Any(a => a.Read.Kind == read.Kind && a.Read.Query.Count == 0) && Flag(dataObject, "has_more"));
                    output["_local_known_count"] = sorted.Length;
                    if (read.Kind == "article") { output["page"] = Math.Max(1, Number(read.Q("page"), 1)); output["page_size"] = pageSize; }
                }
            }
        }
        var complete = read.Mode is "detail" or "singleton" ? output is JsonObject detail && !Flag(detail, "_local_incomplete") :
            authorities.Any(a => CompleteCovers(read, a.Read));
        envelope["data"] = output; Stamp(envelope, state, !complete); return envelope.ToJsonString();
    }
    private static bool CompatibleBaseline(Read target, Read source)
    {
        if (target.Kind != source.Kind || target.Mode != source.Mode) return false;
        if (target.Mode == "detail") return target.Id == source.Id && (target.Kind != "legacy" || Category(target) == Category(source));
        if (target.Mode == "dates") return Category(target) == Category(source);
        if (target.Mode == "month") return target.Q("month") == source.Q("month");
        if (target.Kind is "todo" or "note" or "reminder") return target.Q("date") == source.Q("date") && (target.Kind != "note" || Category(target) == Category(source));
        return true;
    }
    private static bool CompleteCovers(Read target, Read source)
    {
        if (!CompatibleBaseline(target, source)) return false;
        // An unfiltered complete canonical dataset can answer every filtered/paged query.
        if (source.Query.Count == 0) return true;
        foreach (var (name, value) in source.Query)
            if (name is not ("offset" or "page" or "page_size" or "include_deleted") && target.Q(name) != value) return false;
        return true;
    }
    private static IEnumerable<string> RowsForDates(Read read, Entity[] relevant, JsonObject? baseline, Dictionary<string, Entity> entities)
    {
        var known = relevant.Where(e => CategoryOf(e.Row) == Category(read)).GroupBy(e => Text(e.Row, "date")).ToDictionary(g => g.Key, g => g.ToArray());
        var dates = (baseline?["dates"] as JsonArray)?.Select(v => v?.ToString() ?? "").ToHashSet(StringComparer.Ordinal) ?? new();
        foreach (var (date, rows) in known)
        {
            if (rows.Any(e => !Deleted(e.Row) && (read.Kind != "legacy" || Text(e.Row, "text").Length > 0))) dates.Add(date);
            else if (rows.All(e => e.Row["_local_status"] != null || Deleted(e.Row))) dates.Remove(date);
        }
        return dates.Where(date => date.Length > 0 && (read.Q("before").Length == 0 || StringComparer.Ordinal.Compare(date, read.Q("before")) < 0));
    }
    private static string? RenderMonth(Read read, JsonObject envelope, Dictionary<string, Entity> entities, WorkspaceState state)
    {
        var month = read.Q("month"); var items = new Dictionary<string, List<JsonObject>>(StringComparer.Ordinal);
        foreach (var entity in entities.Values.Where(e => e.Kind is "note" or "legacy" && !Deleted(e.Row) && Text(e.Row, "date").StartsWith(month + "-", StringComparison.Ordinal)))
        {
            if (entity.Kind == "legacy" && Text(entity.Row, "text").Length == 0) continue;
            var row = (JsonObject)entity.Row.DeepClone(); var day = Text(row, "date");
            row["entity_id"] = entity.Kind == "note" ? "note-entry:" + entity.Id : "legacy-" + CategoryOf(row) + ":" + day;
            row["source"] = entity.Kind == "note" ? "note_entry" : "legacy_daily_note";
            if (!items.TryGetValue(day, out var list)) items[day] = list = new(); list.Add(row);
        }
        var data = envelope["data"]?.DeepClone().AsObject() ?? new JsonObject { ["format"] = "haoduoyu-note-month-v1" };
        data["month"] = month; data["days"] = new JsonArray(items.OrderBy(kv => kv.Key).Select(kv => (JsonNode?)new JsonObject { ["date"] = kv.Key, ["items"] = Array(kv.Value) }).ToArray());
        // Keep the server's completeness only when this exact month's complete response was present.
        var complete = Text(data, "month") == month && Flag(data, "complete");
        data["complete"] = complete; envelope["data"] = data; Stamp(envelope, state, !complete); return envelope.ToJsonString();
    }
    private static IEnumerable<JsonObject> Sort(Read read, IEnumerable<JsonObject> rows)
    {
        var field = read.Q("sort"); var descending = read.Q("order") != "asc";
        if (field.Length == 0)
        {
            field = read.Kind switch { "article" or "review:articles" => "published_at", "review:snapshots" => "snapshot_date", "review:reports" => "period_start", "review:playbooks" => "version", "review:notes" => "note_date", "review:account-health" => "observed_on", "review:benchmark-articles" => "reads", "review:benchmark-accounts" => "name", "memo-group" or "memo-note" => "position", _ => "created_at" };
            descending = read.Kind is "article" || read.Kind.StartsWith("review:", StringComparison.Ordinal) && read.Kind != "review:benchmark-accounts";
        }
        var numeric = field is "version" or "reads" or "position";
        IOrderedEnumerable<JsonObject> ordered = numeric ? descending ? rows.OrderByDescending(r => Number(Text(r, field))) : rows.OrderBy(r => Number(Text(r, field))) :
            descending ? rows.OrderByDescending(r => Text(r, field), StringComparer.Ordinal) : rows.OrderBy(r => Text(r, field), StringComparer.Ordinal);
        return ordered.ThenBy(r => Text(r, "id"), StringComparer.Ordinal);
    }
    private static bool Matches(Read read, JsonObject row, Dictionary<string, Entity> entities, bool includeDeleted)
    {
        if (!includeDeleted && Deleted(row) && read.Q("include_deleted") != "1") return false;
        if (read.Kind == "legacy" && CategoryOf(row) != Category(read)) return false;
        if (read.Kind == "note" && read.Mode is not ("detail" or "month") && CategoryOf(row) != Category(read)) return false;
        foreach (var name in new[] { "date", "category", "account_id", "platform", "status", "article_id", "benchmark_account_id", "collected_on", "period_type", "kind" })
            if (read.Q(name) is { Length: > 0 } expected && Text(row, name) != expected) return false;
        if (read.Q("account") is { Length: > 0 } account)
        {
            var actual = Text(row, "account");
            if (actual.Length == 0 && Text(row, "article_id") is { Length: > 0 } articleId && entities.TryGetValue(Key("review:articles", articleId), out var article)) actual = Text(article.Row, "account");
            if (actual.Length == 0 && Text(row, "benchmark_account_id") is { Length: > 0 } parentId && entities.TryGetValue(Key("review:benchmark-accounts", parentId), out var parent)) actual = Text(parent.Row, "account");
            if (actual != account) return false;
        }
        var date = Text(row, read.Kind switch { "review:notes" => "note_date", "review:account-health" => "observed_on", "review:reports" => "period_start", _ => "published_at" });
        if (read.Q("from") is { Length: > 0 } from && StringComparer.Ordinal.Compare(date, from) < 0 || read.Q("to") is { Length: > 0 } to && StringComparer.Ordinal.Compare(date.Length > 10 ? date[..10] : date, to) > 0) return false;
        if (read.Q("q") is { Length: > 0 } q && !Text(row, "title").Contains(q, StringComparison.OrdinalIgnoreCase) && !Text(row, "notes").Contains(q, StringComparison.OrdinalIgnoreCase)) return false;
        if (read.Q("verdict") is { Length: > 0 } verdict && (verdict == "pending" ? Text(row, "verdict").Length > 0 : Text(row, "verdict") != verdict)) return false;
        return true;
    }
    private static JsonObject? Remote(PendingOperation operation)
    {
        if (operation.RemoteJson == null) return null;
        try { return (JsonNode.Parse(operation.RemoteJson)?["data"] as JsonObject)?.DeepClone().AsObject(); }
        catch (JsonException) { return null; }
    }
    private static void Stamp(JsonObject envelope, WorkspaceState state, bool incomplete)
    { envelope["_local_projection"] = true; envelope["_local_scope_id"] = state.ScopeId; envelope["_local_incomplete"] = incomplete; }
    private static bool Deleted(JsonObject row) => row.ContainsKey("_local_deleted") ? Flag(row, "_local_deleted") : Flag(row, "deleted") || row["deleted_at"] != null;
    private static bool Archived(JsonObject row) => row.ContainsKey("_local_archived") ? Flag(row, "_local_archived") : row["archived_at"] != null;
    private static string Category(Read read) => read.Q("category") is { Length: > 0 } value ? value : "life";
    private static string CategoryOf(JsonNode row) => Text(row, "category") is { Length: > 0 } value ? value : "life";
    private static long? Version(JsonObject? row) => row?["version"] is JsonValue value && value.TryGetValue<long>(out var version) ? version : null;
    private static string Key(string kind, string id) => kind + "\0" + id;
    private static string Text(JsonNode? row, string name) => row?[name]?.ToString() ?? "";
    private static bool Flag(JsonNode? row, string name) => Text(row, name) is "true" or "True" or "1";
    private static long Number(string value, long fallback = 0) => long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) ? number : fallback;
    private static IEnumerable<JsonObject> Rows(JsonNode? node) => node is JsonArray array ? array.OfType<JsonObject>() : [];
    private static JsonArray Array(IEnumerable<JsonObject> rows) => new(rows.Select(row => row.DeepClone()).ToArray());
}
