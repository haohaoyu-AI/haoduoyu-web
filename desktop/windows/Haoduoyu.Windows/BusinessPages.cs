using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private static JsonObject NewRecord(params (string, JsonNode?)[] values)
    {
        var record = Obj(("id", Guid.NewGuid().ToString()), ("version", 0));
        foreach (var (key, value) in values) record[key] = value;
        return record;
    }
    private string? Choose(string title, string description, params string[] options)
    {
        var panel = new StackPanel { Margin = new Thickness(24) }; panel.Children.Add(Label(description));
        var dialog = Dialog(title, panel, 600, Math.Min(650, 220 + options.Length * 55)); string? result = null;
        foreach (var option in options)
        {
            var button = new Button { Content = option, HorizontalAlignment = HorizontalAlignment.Stretch };
            button.Click += (_, _) => { result = option; dialog.DialogResult = true; }; panel.Children.Add(button);
        }
        dialog.ShowDialog(); return result;
    }
    private Task NewEditorAsync(string kind, JsonObject record, string prefix) => EditAsync(kind, record, prefix + Text(record, "id"));

    private async Task TodosAsync(WrapPanel bar)
    {
        var day = Day;
        bar.Children.Add(Button("查看周/月历史", OpenTodoHistoryFromDayAsync));
        bar.Children.Add(Button("＋ 新待办", () => NewEditorAsync("todo", NewRecord(("date", day), ("text", "")), "/api/v1/todos/")));
        bar.Children.Add(Button("常用事项", TemplatesAsync));
        var data = await ReadAsync("/api/v1/todos?date=" + day); Missing(data);
        var mode = Text(data, "completed_mode");
        bar.Children.Add(Button(mode == "hide" ? "完成项：已隐藏" : "完成项：划线显示", async () =>
        {
            if (data == null) throw new InvalidOperationException("先读取偏好后才能修改。");
            await QueueAsync("PATCH", "/api/v1/todo-preferences", Obj(("completed_mode", mode == "hide" ? "strike" : "hide"),
                ("version", data["preferences_version"]?.DeepClone() ?? JsonValue.Create(0))), "/api/v1/todo-preferences");
        }));
        var items = Rows(data?["items"]).Where(r => mode != "hide" || !Flag(r, "completed")).ToArray();
        List(items.Select(row => ((Flag(row, "completed") ? "✓ " : "○ ") + Text(row, "text"), $"{day} · v{Version(row)}" + LocalSuffix(row) + " · " + TodoNotePreview(row), (Func<Task>)(async () =>
        {
            var option = Choose("待办", Text(row, "text") + "\n" + TodoNotePreview(row), "查看或编辑备注", Flag(row, "completed") ? "标为未完成" : "标为完成", "删除此条", "添加为常用");
            if (option == "查看或编辑备注") { await TodoNoteAsync(row); return; }
            if (option is null || await HandlePendingRecordAsync(row)) return;
            var path = "/api/v1/todos/" + Text(row, "id");
            if (option is "标为完成" or "标为未完成") await SetTodoCompletionAsync(row, option == "标为完成");
            else if (option == "删除此条" && Confirm("只软删除当前日期的此条待办？原记录可按版本恢复。"))
            {
                if (!await CancelUnsentCreationAsync(row)) await QueueAsync("DELETE", path, Obj(("date", day), ("version", Version(row))), path);
            }
            else if (option == "添加为常用")
            {
                if (Text(row, "template_id").Length > 0 && (Flag(row, "_local_template_archived") || Text(row, "_local_template_status") is "Queued" or "InFlight" or "Unknown" or "Conflict" or "Blocked" ||
                    row["template_active"] is JsonValue templateState && templateState.TryGetValue<bool>(out var active) && !active))
                    throw new InvalidOperationException("此待办关联的模板已归档或停用。请到常用事项核对并恢复原模板；不会换一个标识绕开状态。历史关联已保留。");
                await QueueVersionedRecordAsync("POST", path + "/template", Obj(("date", day),
                    ("template_id", Text(row, "template_id") is { Length: > 0 } template ? template : Guid.NewGuid().ToString()),
                    ("template_version", row["template_version"]?.DeepClone() ?? JsonValue.Create(0))), row, "todo-template");
            }
        }))));
    }
    private Task TemplatesAsync() => TemplateArchiveAsync();
    private async Task NotesAsync(WrapPanel bar, string category)
    {
        var day = Day;
        bar.Children.Add(Button("查看碎碎念月历史", OpenNoteHistoryFromDayAsync));
        if (day == BeijingNow().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture))
            bar.Children.Add(Button("＋ 新记录", () => NewEditorAsync("note", NewRecord(("category", category), ("date", day), ("text", "")), "/api/v1/note-entries/")));
        else page.Children.Add(Label("此日期可阅读、编辑已有记录；现服务规则只允许在北京时间当天新增碎碎念。历史新稿会保留，不会自动挪到今天。"));
        _ = await ReadAsync("/api/v1/note-entries/labels");
        var data = await ReadAsync($"/api/v1/note-entries?category={category}&date={day}"); Missing(data);
        if (data != null && !Flag(data, "can_edit")) page.Children.Add(Label("当前服务身份只允许阅读。离线草稿可保留，服务器会独立检查写权限。"));
        List(Rows(data?["entries"]).Select(row => (Text(row, "text")[..Math.Min(100, Text(row, "text").Length)], Text(row, "updated_at") + " · v" + Version(row) + LocalSuffix(row),
            (Func<Task>)(() => NoteActionsAsync(row)))));
        var legacy = await ReadAsync($"/api/v1/daily-notes?date={day}&category={category}");
        if (!string.IsNullOrEmpty(Text(legacy, "text")))
        {
            legacy!["category"] = category;
            page.Children.Add(Label("旧版日期日页（独立来源，保留原文）"));
            page.Children.Add(Button("打开旧版日页", () => OpenLegacyNoteFromDayAsync(legacy!.AsObject(), day, category)));
        }
    }
    private async Task NoteActionsAsync(JsonObject row)
    {
        if (await HandlePendingRecordAsync(row)) return;
        var path = "/api/v1/note-entries/" + Text(row, "id");
        var choice = Choose("碎碎念", Text(row, "text"), "编辑本机草稿", "导出文字", "软删除");
        if (choice == "编辑本机草稿") await EditAsync("note", row, path);
        else if (choice == "导出文字") await ExportTextAsync("碎碎念.txt", Text(row, "text"));
        else if (choice == "软删除" && Confirm("软删除此条记录？原内容和删除请求会保留在本机历史中。"))
        {
            if (!await CancelUnsentCreationAsync(row)) await QueueAsync("DELETE", path, Obj(("version", Version(row)), ("save_id", Guid.NewGuid().ToString())), path);
        }
    }
    private async Task MemosAsync(WrapPanel bar)
    {
        bar.Children.Add(Button("＋ 新分组", () => NewEditorAsync("group", NewRecord(("title", ""), ("position", 0)), "/api/v1/memos/groups/")));
        var data = await ReadAsync("/api/v1/memos"); Missing(data);
        List(Rows(data?["groups"]).Select(group => (Text(group, "title") + (!EffectiveDeleted(group) ? "" : "（回收站）"),
            MemoGroupCounts.Read(group).Description + " · v" + Version(group) + LocalSuffix(group), (Func<Task>)(async () =>
            {
                if (await HandlePendingRecordAsync(group)) return;
                await FlushEditorAsync(); ClearPage(); page.Children.Add(Label(Text(group, "title")));
                page.Children.Add(Label(MemoGroupCounts.Read(group).Description + "。本机已知数量不是实时服务端总数，未确认操作仍显示为本机意图。"));
                var path = "/api/v1/memos/groups/" + Text(group, "id");
                if (EffectiveDeleted(group))
                {
                    page.Children.Add(Button("恢复分组", () => QueueAsync("POST", path + "/restore", Obj(("version", Version(group)), ("save_id", Guid.NewGuid().ToString())), path)));
                }
                else
                {
                    page.Children.Add(Button("＋ 新笔记", () => NewEditorAsync("memo", NewRecord(("title", ""), ("body", ""), ("group_id", Text(group, "id")), ("position", 0)), "/api/v1/memos/notes/")));
                    page.Children.Add(Button("分组改名", () => EditAsync("group", group, path)));
                    page.Children.Add(Button("软删除分组", async () =>
                    {
                        var counts = MemoGroupCounts.Read(group);
                        var localNew = Flag(group, "_local_new") && Version(group) == 0;
                        var serverCount = localNew ? (long?)null : counts.RequireServerDeleteCount();
                        var question = localNew ? "取消尚未发送的新分组“" + Text(group, "title") + "”？原稿和子笔记保留，依赖它的笔记会等待处理。" :
                            "软删除分组“" + Text(group, "title") + "”及服务端副本中的 " + serverCount + " 篇活动笔记？" + counts.Description +
                            "。未决改动和其他设备可能使数量变化，服务器将重新核对并拒绝过时确认；已有单独删除的笔记不会随分组恢复。";
                        if (Confirm(question))
                        {
                            await DeleteMemoGroupConfirmedAsync(group);
                        }
                    }));
                }
                List(Rows(data?["notes"]).Where(n => Text(n, "group_id") == Text(group, "id")).Select(note =>
                    (Text(note, "title") + (!EffectiveDeleted(note) ? "" : "（回收站）"), "v" + Version(note) + LocalSuffix(note), (Func<Task>)(async () =>
                    {
                        var notePath = "/api/v1/memos/notes/" + Text(note, "id");
                        if (EffectiveDeleted(note))
                        {
                            if (Confirm("恢复这篇笔记？其父分组需要先恢复。")) await QueueAsync("POST", notePath + "/restore", Obj(("version", Version(note)), ("save_id", Guid.NewGuid().ToString())), notePath);
                            return;
                        }
                        var full = await ReadAsync(notePath);
                        if (full == null) throw new InvalidOperationException("本机没有此篇正文。请连接后读取，不能用空正文覆盖。");
                        if (await HandlePendingRecordAsync(full)) return;
                        var choice = Choose("备忘录", Text(full, "title"), "编辑", "导出文字", "软删除");
                        if (choice == "编辑") await EditAsync("memo", full.AsObject(), notePath);
                        else if (choice == "导出文字") await ExportTextAsync("备忘录.txt", Text(full, "title") + "\n\n" + Text(full, "body"));
                        else if (choice == "软删除" && Confirm("软删除此篇笔记？"))
                        { if (!await CancelUnsentCreationAsync(full)) await QueueAsync("DELETE", notePath, Obj(("version", Version(full)), ("save_id", Guid.NewGuid().ToString())), notePath); }
                    }))));
            }))));
    }
    private async Task DeleteMemoGroupConfirmedAsync(JsonObject group)
    {
        if (await CancelUnsentCreationAsync(group)) return;
        var path = "/api/v1/memos/groups/" + Text(group, "id");
        var count = MemoGroupCounts.Read(group).RequireServerDeleteCount();
        await QueueAsync("DELETE", path, Obj(("version", Version(group)), ("save_id", Guid.NewGuid().ToString()),
            ("confirm_title", Text(group, "title")), ("confirm_note_count", count)), path);
    }
    private async Task RemindersAsync(WrapPanel bar)
    {
        var day = Day;
        bar.Children.Add(Button("＋ 新提醒", () => NewEditorAsync("reminder", NewRecord(("date", day), ("source_key", "desktop:" + Guid.NewGuid().ToString()), ("summary", "")), "/api/v1/work-reminders/")));
        var data = await ReadAsync("/api/v1/work-reminders?date=" + day); Missing(data);
        List(Rows(data?["items"]).Select(row => (Text(row, "summary"), Text(row, "source_key") + " · v" + Version(row) + LocalSuffix(row), (Func<Task>)(async () =>
        {
            if (await HandlePendingRecordAsync(row)) return;
            var path = "/api/v1/work-reminders/" + Text(row, "id");
            var choice = Choose("工作提醒", Text(row, "summary"), "编辑", "软删除");
            if (choice == "编辑") await EditAsync("reminder", row, path);
            else if (choice == "软删除" && Confirm("软删除此提醒？"))
            { if (!await CancelUnsentCreationAsync(row)) await QueueAsync("DELETE", path, Obj(("version", Version(row)), ("save_id", Guid.NewGuid().ToString())), path); }
        }))));
    }
    private Task ReviewsAsync(WrapPanel bar) => MediaReviewAsync();

}
