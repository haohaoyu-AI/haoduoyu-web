using System.Text.Json.Nodes;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private async Task RecycleAsync()
    {
        var day = Day;
        page.Children.Add(Label("按所选日期读取正式软删除快照；分组、备忘录和未安排事项也会列出。只恢复有真实版本的记录，不提供永久删除。"));
        var snapshot = await ReadAsync("/api/v1/workbench-snapshot?date=" + day + "&version=2");
        var expected = currentIdentity == null ? null : OfflineProfiles.Get(settings, currentIdentity)?.Scope;
        if (snapshot == null && Engine.Snapshot.Cache.TryGetValue("/local/recycle/all", out var prepared))
        {
            var localTrash = Data(prepared);
            if (Text(localTrash, "format") == "native-trash-v1" && Text(localTrash, "scope_id") == expected && Flag(localTrash, "complete") && localTrash?["data"] is JsonObject all)
            {
                var filtered = new JsonObject();
                foreach (var (kind, rows) in all)
                    filtered[kind] = new JsonArray(Rows(rows).Where(row => Text(row, "date").Length == 0 || Text(row, "date") == day)
                        .Select(row => row.DeepClone()).ToArray());
                snapshot = Obj(("complete", true), ("scope_id", expected), ("data", filtered));
                page.Children.Add(Label("已准备的完整离线回收站 · 恢复仍由服务端按原版本核对。"));
            }
        }
        if (snapshot is not JsonObject || !Flag(snapshot, "complete") || Text(snapshot, "scope_id") != expected || snapshot["data"] is not JsonObject collections)
        {
            page.Children.Add(Label("本机没有这一天的完整删除快照。连接后可刷新；读取超限或权限不符时不会把缺失当成已删除，也不会猜恢复版本。"));
            return;
        }
        var removed = collections.SelectMany(p => Rows(p.Value)).Where(row => row["deleted_at"] != null).ToArray();
        List(removed.Select(row => (RecycleTitle(row), "删除于 " + Text(row, "deleted_at") + " · v" + Version(row),
            (Func<Task>)(async () =>
            {
                if (Text(row, "source") == "note_label") { await NavigateAsync("标签"); Message("请在标签管理中核对并恢复归档标签。"); return; }
                if (!Confirm("恢复“" + RecycleTitle(row) + "”？使用快照中的真实版本；其他设备若已更改该记录，服务端会拒绝覆盖。")) return;
                await RestoreSnapshotRecordAsync(row, collections);
            }))));
    }

    private static string RecycleTitle(JsonObject row)
    {
        var kind = Text(row, "source") switch
        {
            "todo" => "每日待办", "unscheduled_todo" => "未安排事项", "legacy_daily_note" => "旧版日页",
            "note_entry" => "碎碎念", "memo_group" => "备忘录分组", "memo_note" => "备忘录", "work_reminder" => "工作提醒", "note_label" => "归档标签（在标签管理中恢复）", _ => "记录"
        };
        var identity = Text(row, "source_id");
        return kind + " · " + Text(row, "date") + " · " + identity[..Math.Min(8, identity.Length)];
    }

    private async Task RestoreSnapshotRecordAsync(JsonObject row, JsonObject collections)
    {
        var version = Version(row);
        if (version < 1 || row["deleted_at"] == null) throw new InvalidOperationException("没有可核实的删除版本，未排队恢复。");
        var source = Text(row, "source"); var id = Text(row, "source_id");
        var body = Obj(("version", version)); string path;
        switch (source)
        {
            case "todo": path = "/api/v1/todos/" + ApiRequests.Uuid(id); body["date"] = ApiRequests.Date(Text(row, "date")); break;
            case "unscheduled_todo": path = "/api/v1/unscheduled-todos/" + ApiRequests.Uuid(id); break;
            case "note_entry": path = "/api/v1/note-entries/" + ApiRequests.Uuid(id); body["save_id"] = Guid.NewGuid().ToString(); break;
            case "work_reminder": path = "/api/v1/work-reminders/" + ApiRequests.Uuid(id); body["save_id"] = Guid.NewGuid().ToString(); break;
            case "memo_group": path = "/api/v1/memos/groups/" + ApiRequests.Uuid(id); body["save_id"] = Guid.NewGuid().ToString(); break;
            case "memo_note": path = "/api/v1/memos/notes/" + ApiRequests.Uuid(id); body["save_id"] = Guid.NewGuid().ToString(); break;
            case "legacy_daily_note":
                var category = Text(row, "category");
                if (category is not ("life" or "work")) throw new InvalidOperationException("旧日页分类不明，不能猜测恢复目标。");
                path = "/api/v1/daily-notes/" + ApiRequests.Date(id);
                body["save_id"] = Guid.NewGuid().ToString();
                await QueueAsync("POST", path + "/restore?category=" + category, body, path + "?category=" + category);
                return;
            default: throw new InvalidOperationException("此来源没有已核实的软删除恢复接口。");
        }
        if (source == "memo_note")
        {
            var group = Text(row, "group_id");
            var parent = Rows(collections["memo_groups"]).SingleOrDefault(g => Text(g, "source_id") == group);
            if (parent?["deleted_at"] != null)
            {
                Message("请先恢复并确认父分组，再刷新回收站。分组恢复会显示未单独删除的笔记；仅对仍留在回收站的笔记继续恢复，当前不猜测删除来源。");
                return;
            }
        }
        await QueueAsync("POST", path + "/restore", body, path);
    }
}
