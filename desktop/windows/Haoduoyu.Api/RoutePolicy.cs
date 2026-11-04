using System.Text.RegularExpressions;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

internal static class RoutePolicy
{
    private const string Id = "[A-Za-z0-9_-]{1,160}";
    private const string Uuid = "[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}";
    private const string ReviewUuid = "[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}";
    private const string ReviewResources = "(articles|snapshots|reports|playbooks|benchmark-accounts|benchmark-articles|notes|account-health)";
    private static readonly (string Method, string Pattern, string[] Query)[] Rules =
    [
        ("GET", "/auth/me", []),
        ("POST", "/auth/(login|logout)", []),
        ("GET", "/todos", ["date"]), ("POST", "/todos", []),
        ("PATCH", "/todos/" + Uuid, []), ("DELETE", "/todos/" + Uuid, []),
        ("POST", "/todos/" + Uuid + "/(restore|template)", []),
        ("GET", "/unscheduled-todos", []), ("GET", "/unscheduled-todos/" + Uuid, []),
        ("POST", "/unscheduled-todos", []), ("PATCH", "/unscheduled-todos/" + Uuid, []),
        ("DELETE", "/unscheduled-todos/" + Uuid, []),
        ("POST", "/unscheduled-todos/" + Uuid + "/(restore|move|complete-today)", []),
        ("GET", "/todo-templates", []), ("POST", "/todo-templates", []),
        ("PATCH", "/todo-templates/" + Uuid, []), ("DELETE", "/todo-templates/" + Uuid, []),
        ("GET", "/todo-preferences", []), ("PATCH", "/todo-preferences", []),
        ("GET", "/note-entries", ["category", "date"]),
        ("GET", "/note-entries/dates", ["category", "before", "page_size"]),
        ("GET", "/note-entries/labels", []), ("POST", "/note-entries/labels", []), ("GET", "/note-entries/month", ["month"]),
        ("GET", "/note-entries/(operations/)?" + Uuid, []),
        ("PUT", "/note-entries/" + Uuid, []), ("DELETE", "/note-entries/" + Uuid, []),
        ("POST", "/note-entries/" + Uuid + "/restore", []),
        ("GET", "/daily-notes", ["date", "category"]),
        ("GET", "/daily-notes/dates", ["category", "before", "page_size"]),
        ("PUT", "/daily-notes/[0-9]{4}-[0-9]{2}-[0-9]{2}", ["category"]),
        ("DELETE", "/daily-notes/[0-9]{4}-[0-9]{2}-[0-9]{2}", ["category"]),
        ("POST", "/daily-notes/[0-9]{4}-[0-9]{2}-[0-9]{2}/restore", ["category"]),
        ("GET", "/memos", []), ("GET", "/memos/(notes|operations)/" + Uuid, []),
        ("PUT", "/memos/(groups|notes)/" + Uuid, []), ("DELETE", "/memos/(groups|notes)/" + Uuid, []),
        ("POST", "/memos/(groups|notes)/" + Uuid + "/restore", []),
        ("GET", "/work-reminders", ["date"]),
        ("PUT", "/work-reminders/" + Uuid, []), ("DELETE", "/work-reminders/" + Uuid, []),
        ("POST", "/work-reminders/" + Uuid + "/restore", []),
        ("GET", "/(accounts|account-profiles)", []),
        ("GET", "/ai-reports", ["offset"]),
        ("PUT", "/ai-reports/" + ReviewUuid, []),
        ("GET", "/articles", ["page", "page_size", "limit", "offset", "account_id", "status", "q", "from", "to", "sort", "order", "platform", "fields", "mode", "topic", "data_status", "slot", "writer", "has_warnings", "has_pending_verify", "series_no_min", "series_no_max"]),
        ("POST", "/articles", []), ("PATCH", "/articles", []),
        ("GET", "/articles/" + Id, []), ("PUT", "/articles/" + Id, []),
        ("GET", "/article-reconciliation", []),
        ("GET", "/(overview|due-reviews|observations|daily-metrics)",
            ["account_id", "article_id", "from", "to", "date", "period", "days", "stage", "status", "page", "page_size", "sort", "order"]),
        ("POST", "/(observations|daily-metrics|review-logs)", []),
        ("GET", "/review/overview", ["account", "range", "week"]),
        ("GET", "/review/articles", ["offset", "read_revision", "page", "verdict", "account", "from", "to"]),
        ("GET", "/review/snapshots", ["offset", "read_revision", "account", "article_id"]),
        ("GET", "/review/reports", ["offset", "read_revision", "account", "period_type", "from", "to"]),
        ("GET", "/review/playbooks", ["offset", "read_revision", "account"]),
        ("GET", "/review/benchmark-accounts", ["offset", "read_revision", "include_deleted", "account", "platform"]),
        ("GET", "/review/benchmark-articles", ["offset", "read_revision", "include_deleted", "account", "benchmark_account_id", "collected_on", "sort"]),
        ("GET", "/review/notes", ["offset", "read_revision", "include_deleted", "account", "from", "to", "kind"]),
        ("GET", "/review/account-health", ["offset", "read_revision", "include_deleted", "account", "platform", "from", "to"]),
        ("GET", "/review/" + ReviewResources + "/" + ReviewUuid, []),
        ("PUT", "/review/" + ReviewResources + "/" + ReviewUuid, []),
        ("PATCH", "/review/" + ReviewResources + "/" + ReviewUuid, []),
        ("GET", "/workbench-snapshot/index", ["version"]), ("GET", "/workbench-snapshot", ["date", "version"]),
        ("GET", "/snapshot/index", ["notes"]), ("GET", "/snapshot", ["date", "notes"])
    ];

    internal static void Validate(string method, string path, bool allowAuthWrite)
    {
        var articleQuery = method == "GET" && path.Split('?')[0] == "/api/v1/articles";
        if (path.Length > (articleQuery ? 8192 : 2048) || !path.StartsWith("/api/v1/", StringComparison.Ordinal) ||
            path.Any(char.IsControl) || path.Contains('#') || path.Contains('\\') || path.Contains(' '))
            throw new ArgumentException("该地址不在桌面业务接口范围内。", nameof(path));
        var split = path.Split('?', 2);
        var route = split[0][7..];
        if (!allowAuthWrite && method != "GET" && route.StartsWith("/auth/", StringComparison.Ordinal))
            throw new ArgumentException("登录操作不能加入业务待同步队列。", nameof(path));
        var rule = Rules.FirstOrDefault(rule => rule.Method == method && Regex.IsMatch(route, "\\A(?:" + rule.Pattern + ")\\z", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking));
        if (rule.Pattern is null) throw new ArgumentException("该操作不在桌面业务接口范围内。", nameof(path));
        if (split.Length == 1) { if (articleQuery) _ = ArticleLedgerQuery.Parse(path); return; }
        if (split[1].Length == 0) throw new ArgumentException("查询参数不完整。", nameof(path));
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var field in split[1].Split('&'))
        {
            var pair = field.Split('=', 2);
            if (pair.Length != 2 || pair[1].Length == 0 || !rule.Query.Contains(pair[0]) || !names.Add(pair[0]))
                throw new ArgumentException("查询参数不在已核对的接口契约中。", nameof(path));
            try
            {
                var value = Uri.UnescapeDataString(pair[1]);
                if ((!articleQuery || pair[0] != "q") && value.Any(char.IsControl)) throw new ArgumentException("查询参数含无效字符。", nameof(path));
                if (route == "/ai-reports" && !Regex.IsMatch(value, "\\A(?:0|[1-9][0-9]{0,8})\\z", RegexOptions.CultureInvariant | RegexOptions.NonBacktracking))
                    throw new ArgumentException("汇报偏移须为规范的非负分页整数。", nameof(path));
            }
            catch (UriFormatException) { throw new ArgumentException("查询参数编码无效。", nameof(path)); }
        }
        if (articleQuery) _ = ArticleLedgerQuery.Parse(path);
    }
}
