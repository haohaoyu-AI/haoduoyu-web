using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace Haoduoyu.Api;

public sealed record ApiCommand(string Method, string Path, JsonObject Body)
{
    public string BodyJson => Body.ToJsonString();
}

/// <summary>Request builders preserve version/save identity and perform local shape validation.</summary>
public static class ApiRequests
{
    private const string Prefix = "/api/v1/";
    public static string Todos(string date) => Prefix + "todos?date=" + Date(date);
    public static string Notes(string category, string date) => Prefix + "note-entries?category=" + Category(category) + "&date=" + Date(date);
    public static string LegacyNotes(string category, string date) => Prefix + "daily-notes?category=" + Category(category) + "&date=" + Date(date);
    public static string Reminders(string date) => Prefix + "work-reminders?date=" + Date(date);
    public static string NoteDates(string category, string? before = null) => Prefix + "note-entries/dates?category=" + Category(category) + "&page_size=100" + (before is null ? "" : "&before=" + Date(before));
    public static string MemoNote(string id) => Prefix + "memos/notes/" + Uuid(id);

    public static ApiCommand CreateTodo(string id, string date, string text, string? templateId = null)
    {
        var body = new JsonObject { ["id"] = Uuid(id), ["date"] = Date(date), ["text"] = ShortText(text) };
        if (templateId is not null) body["template_id"] = Uuid(templateId);
        return new("POST", Prefix + "todos", body);
    }
    public static ApiCommand CompleteTodo(string id, long version, bool completed) => new("PATCH", Prefix + "todos/" + Uuid(id), new JsonObject { ["version"] = Version(version, 1), ["completed"] = completed });
    public static ApiCommand DeleteTodo(string id, string date, long version, bool restore = false) => new(restore ? "POST" : "DELETE", Prefix + "todos/" + Uuid(id) + (restore ? "/restore" : ""), new JsonObject { ["date"] = Date(date), ["version"] = Version(version, 1) });
    public static ApiCommand CreateUnscheduledTodo(string id, string text) => new("POST", Prefix + "unscheduled-todos", new JsonObject { ["id"] = Uuid(id), ["text"] = ShortText(text) });
    public static ApiCommand CompleteUnscheduledTodo(string id, long version, bool completed) => new("PATCH", Prefix + "unscheduled-todos/" + Uuid(id), new JsonObject { ["version"] = Version(version, 1), ["completed"] = completed });
    public static ApiCommand MoveUnscheduledTodo(string id, long version, string date, bool completeToday = false) => new("POST", Prefix + "unscheduled-todos/" + Uuid(id) + (completeToday ? "/complete-today" : "/move"), new JsonObject { ["date"] = Date(date), ["version"] = Version(version, 1) });
    public static ApiCommand DeleteUnscheduledTodo(string id, long version, bool restore = false) => new(restore ? "POST" : "DELETE", Prefix + "unscheduled-todos/" + Uuid(id) + (restore ? "/restore" : ""), new JsonObject { ["version"] = Version(version, 1) });
    public static ApiCommand CreateTemplate(string id, string text) => new("POST", Prefix + "todo-templates", new JsonObject { ["id"] = Uuid(id), ["text"] = ShortText(text) });
    public static ApiCommand RenameTemplate(string id, long version, string text) => new("PATCH", Prefix + "todo-templates/" + Uuid(id), new JsonObject { ["version"] = Version(version, 1), ["text"] = ShortText(text) });
    public static ApiCommand DeleteTemplate(string id, long version) => new("DELETE", Prefix + "todo-templates/" + Uuid(id), new JsonObject { ["version"] = Version(version, 1) });
    public static ApiCommand Preference(string mode, long version) => new("PATCH", Prefix + "todo-preferences", new JsonObject { ["completed_mode"] = mode is "hide" or "strike" ? mode : throw new ArgumentException("显示模式无效。"), ["version"] = Version(version) });
    public static ApiCommand SaveNote(string id, string category, string date, string text, long version, string saveId, IEnumerable<string>? labels = null)
    {
        var body = SaveBody(version, saveId);
        body["category"] = Category(category); body["date"] = Date(date); body["text"] = PlainText(text, 65_536);
        if (labels is not null)
        {
            var list = labels.Select(label => label.Trim().Normalize()).Order(StringComparer.Ordinal).ToArray();
            if (list.Length > 202 || list.Distinct(StringComparer.Ordinal).Count() != list.Length ||
                list.Any(label => label.Length == 0 || label.EnumerateRunes().Count() > 32 || label.Any(char.IsControl)))
                throw new ArgumentException("标签需要 1–32 字，不能重复。");
            body["labels"] = new JsonArray(list.Select(label => (JsonNode?)JsonValue.Create(label)).ToArray());
        }
        return new("PUT", Prefix + "note-entries/" + Uuid(id), body);
    }
    public static ApiCommand DeleteNote(string id, long version, string saveId, bool restore = false) => new(restore ? "POST" : "DELETE", Prefix + "note-entries/" + Uuid(id) + (restore ? "/restore" : ""), SaveBody(Version(version, 1), saveId));
    public static ApiCommand SaveLegacyNote(string category, string date, string text, long version, string saveId)
    {
        var body = SaveBody(version, saveId); body["text"] = PlainText(text, 65_536);
        return new("PUT", Prefix + "daily-notes/" + Date(date) + "?category=" + Category(category), body);
    }
    public static ApiCommand SaveMemoGroup(string id, string title, int position, long version, string saveId)
    {
        var body = SaveBody(version, saveId); body["title"] = Title(title); body["position"] = Position(position);
        return new("PUT", Prefix + "memos/groups/" + Uuid(id), body);
    }
    public static ApiCommand SaveMemoNote(string id, string groupId, string title, string bodyText, int position, long version, string saveId)
    {
        var body = SaveBody(version, saveId); body["group_id"] = Uuid(groupId); body["title"] = Title(title);
        body["body"] = PlainText(bodyText, 65_536); body["position"] = Position(position);
        return new("PUT", Prefix + "memos/notes/" + Uuid(id), body);
    }
    public static ApiCommand DeleteMemoNote(string id, long version, string saveId, bool restore = false) => new(restore ? "POST" : "DELETE", Prefix + "memos/notes/" + Uuid(id) + (restore ? "/restore" : ""), SaveBody(Version(version, 1), saveId));
    public static ApiCommand DeleteMemoGroup(string id, long version, string saveId, string confirmTitle, int activeCount)
    {
        if (activeCount < 0) throw new ArgumentException("笔记数量无效。");
        var body = SaveBody(Version(version, 1), saveId); body["confirm_title"] = confirmTitle; body["confirm_note_count"] = activeCount;
        return new("DELETE", Prefix + "memos/groups/" + Uuid(id), body);
    }
    public static ApiCommand RestoreMemoGroup(string id, long version, string saveId) => new("POST", Prefix + "memos/groups/" + Uuid(id) + "/restore", SaveBody(Version(version, 1), saveId));
    public static ApiCommand SaveReminder(string id, string date, string sourceKey, string summary, long version, string saveId)
    {
        if (sourceKey.Length is < 1 or > 100 || sourceKey.Any(c => !char.IsAsciiLetterOrDigit(c) && !"_.:-".Contains(c))) throw new ArgumentException("提醒来源标识无效。");
        var body = SaveBody(version, saveId); body["date"] = Date(date); body["source_key"] = sourceKey; body["summary"] = PlainText(summary, 16_384);
        return new("PUT", Prefix + "work-reminders/" + Uuid(id), body);
    }

    public static string Date(string value) => DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) && date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) == value ? value : throw new ArgumentException("日期需要有效 YYYY-MM-DD。");
    public static string Uuid(string value) => Guid.TryParseExact(value, "D", out var id) ? id.ToString("D") : throw new ArgumentException("标识需要 UUID。");
    public static long Version(long value, long minimum = 0) => value >= minimum && value < 9_007_199_254_740_991 ? value : throw new ArgumentException("版本无效，请重新读取记录。");
    private static JsonObject SaveBody(long version, string saveId) => new() { ["version"] = Version(version), ["save_id"] = Uuid(saveId) };
    private static string Category(string value) => value is "life" or "work" ? value : throw new ArgumentException("分类无效。");
    private static int Position(int value) => value is >= 0 and <= 1_000_000 ? value : throw new ArgumentException("排序无效。");
    private static string ShortText(string text) => text.Trim().Length is >= 1 and <= 500 && !text.Contains('\0') ? text.Trim() : throw new ArgumentException("内容需要 1–500 字符。");
    private static string Title(string text) => text.Trim().Length is >= 1 and <= 120 && !text.Any(char.IsControl) ? text.Trim() : throw new ArgumentException("标题需要 1–120 字符。");
    private static string PlainText(string text, int maxBytes)
    {
        text = text.Replace("\r\n", "\n").Replace('\r', '\n');
        if (text.Any(c => c < 32 && c != '\t' && c != '\n' || c == 127) || System.Text.Encoding.UTF8.GetByteCount(text) > maxBytes)
            throw new ArgumentException("正文含无效字符或超过大小上限。请保留本机草稿。");
        _ = new System.Text.UTF8Encoding(false, true).GetBytes(text);
        return text;
    }
}
