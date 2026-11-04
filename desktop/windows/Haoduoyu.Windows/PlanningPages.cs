using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private async Task UnscheduledAsync()
    {
        await FlushEditorAsync();
        page.Children.Clear(); heading.Text = "未安排待办"; page.Children.Add(heading);
        page.Children.Add(Label("没有指定日期的事项保留在这里。可以安排到当前所选日期，或明确选择在北京时间今天完成；安排后会保留同一事项 ID。"));
        var bar = new WrapPanel();
        bar.Children.Add(Button("＋ 新未安排事项", () => PlanningDraftAsync("unscheduled")));
        bar.Children.Add(Button("本机删除记录", DeletedUnscheduledAsync));
        page.Children.Add(bar);
        var data = await ReadAsync("/api/v1/unscheduled-todos"); Missing(data);
        List(Rows(data?["items"]).Select(row =>
            ((Flag(row, "completed") ? "✓ " : "○ ") + Text(row, "text"), "未安排日期 · v" + Version(row) + LocalSuffix(row),
                (Func<Task>)(async () =>
                {
                    if (await HandlePendingRecordAsync(row)) return;
                    var path = "/api/v1/unscheduled-todos/" + ApiRequests.Uuid(Text(row, "id"));
                    var completeLabel = Flag(row, "completed") ? "标为未完成" : "标为完成（仍不安排日期）";
                    var day = Day;
                    var choice = Choose("未安排事项", Text(row, "text"), completeLabel, "安排到 " + day, "今天完成", "软删除");
                    if (choice == completeLabel)
                    {
                        await QueueVersionedRecordAsync("PATCH", path, Obj(("completed", !Flag(row, "completed"))), row, "future-after-create");
                    }
                    else if (choice == "安排到 " + day || choice == "今天完成")
                    {
                        var completeToday = choice == "今天完成";
                        var target = completeToday ? BeijingNow().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) : day;
                        if (!Confirm(completeToday
                            ? "将该事项移到北京时间今天 " + target + " 并标为完成？未安排列表中的原项会软删除，原 ID 保留。"
                            : "将该事项安排到 " + target + "？未安排列表中的原项会软删除，原 ID 和当前完成状态保留。")) return;
                        await QueueVersionedRecordAsync("POST", path + (completeToday ? "/complete-today" : "/move"),
                            Obj(("date", target)), row, "future-move");
                    }
                    else if (choice == "软删除" && Confirm("软删除此条未安排事项？本机保留删除请求和确认响应，可从本机删除记录恢复。"))
                    {
                        if (await CancelUnsentCreationAsync(row)) return;
                        var command = ApiRequests.DeleteUnscheduledTodo(Text(row, "id"), Version(row));
                        await QueueAsync(command.Method, command.Path, command.Body, path);
                    }
                }))));
    }

    private async Task DeletedUnscheduledAsync()
    {
        await FlushEditorAsync();
        page.Children.Clear(); heading.Text = "未安排事项 · 本机删除记录"; page.Children.Add(heading);
        page.Children.Add(Label("这里只列出本机已收到成功确认的软删除。其他设备的删除、未确认删除和已经移入日期清单的事项不在此列表。恢复前会在联网时读取当前实体版本。"));
        page.Children.Add(Button("返回未安排待办", UnscheduledAsync));
        var deleted = Engine.Snapshot.Outbox.Where(op => op.Status == PendingStatus.Confirmed && op.Method == "DELETE" &&
                op.Path.StartsWith("/api/v1/unscheduled-todos/", StringComparison.Ordinal))
            .OrderByDescending(op => op.CreatedAt).GroupBy(op => op.ResourceKey, StringComparer.Ordinal).Select(group => group.First()).ToArray();
        List(deleted.Select(op =>
        {
            var saved = op.RemoteJson == null ? null : Data(op.RemoteJson);
            return (string.IsNullOrEmpty(Text(saved, "text")) ? "已删除事项" : Text(saved, "text"),
                op.CreatedAt.ToLocalTime().ToString("g") + " · 删除确认版本 " + Version(saved),
                (Func<Task>)(async () =>
                {
                    var latest = connected ? await ReadAsync(op.Path) : saved;
                    if (latest == null || Version(latest) < 1)
                        throw new InvalidOperationException("没有可核实的删除版本，原请求已保留；请连接后读取此条记录。");
                    if (latest["deleted_at"] == null) { Message("这条事项当前已恢复，未发送重复恢复请求。"); return; }
                    if (Version(latest) != Version(saved) || Text(latest, "deleted_at") != Text(saved, "deleted_at"))
                        throw new InvalidOperationException("此条事项已在原删除后变化，可能已安排到日期。旧删除入口不会恢复它，请先核对最新状态。");
                    if (!Confirm("恢复未安排事项“" + Text(latest, "text") + "”？仍使用刚读取的版本，其他设备的新变化会由服务器拒绝覆盖。")) return;
                    var command = ApiRequests.DeleteUnscheduledTodo(Text(latest, "id"), Version(latest), restore: true);
                    await QueueAsync(command.Method, command.Path, command.Body, op.ResourceKey);
                }));
        }));
    }

    private async Task LabelsAsync()
    {
        await FlushEditorAsync();
        page.Children.Clear(); heading.Text = "碎碎念标签"; page.Children.Add(heading);
        page.Children.Add(Label("标签归档会隐藏该标签，记录正文保留；可在归档列表恢复。此页面不提供永久删除。生活、工作为内置标签。"));
        page.Children.Add(Button("＋ 新标签", () => PlanningDraftAsync("label-create")));
        var data = await ReadAsync("/api/v1/note-entries/labels"); Missing(data);
        if (data == null) return;
        var archived = Rows(data["archived_labels"]).Select(row => Text(row, "name")).ToHashSet(StringComparer.Ordinal);
        var active = new[] { "生活", "工作" }.Concat(Rows(data["labels"]).Select(row => Text(row, "name")))
            .Where(name => !archived.Contains(name)).Distinct(StringComparer.Ordinal).ToArray();
        page.Children.Add(Label("当前标签"));
        List(active.Select(name => (name, "点击后可归档", (Func<Task>)(async () =>
        {
            if (Choose("标签", name, "归档标签") != "归档标签" || !Confirm("归档标签“" + name + "”？不会删除记录正文，可从归档标签恢复。")) return;
            await QueueAsync("POST", "/api/v1/note-entries/labels", Obj(("name", name), ("action", "archive"), ("save_id", Guid.NewGuid().ToString())), LabelResource(name));
        }))));
        page.Children.Add(Label("已归档标签"));
        List(archived.Order(StringComparer.Ordinal).Select(name => (name, "已归档 · 点击可恢复", (Func<Task>)(async () =>
        {
            if (Choose("已归档标签", name, "恢复标签") != "恢复标签" || !Confirm("恢复标签“" + name + "”？原记录正文保留。")) return;
            await QueueAsync("POST", "/api/v1/note-entries/labels", Obj(("name", name), ("action", "restore"), ("save_id", Guid.NewGuid().ToString())), LabelResource(name));
        }))));
    }

    private static string LabelResource(string name)
    {
        // Labels have no server UUID. This deterministic local key serializes all intents for the same NFC label.
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes("haoduoyu-note-label\0" + name.Normalize(NormalizationForm.FormC)));
        return "/local/note-label/" + new Guid(digest.AsSpan(0, 16)).ToString();
    }

    private async Task PlanningDraftAsync(string kind, string? key = null)
    {
        if (kind is not ("unscheduled" or "label-create")) throw new InvalidOperationException("不支持此计划草稿类型。");
        await FlushEditorAsync();
        var id = Guid.NewGuid().ToString();
        key ??= kind == "unscheduled" ? "/api/v1/unscheduled-todos/" + id : "/local/label-create/" + id;
        var original = Obj(("id", id), ("version", 0));
        var values = Obj((kind == "unscheduled" ? "text" : "name", ""));
        if (Engine.Snapshot.Drafts.TryGetValue(key, out var draft))
        {
            var restored = JsonNode.Parse(draft.Text)?.AsObject() ?? throw new InvalidDataException("本机草稿格式无效，原文件保留。");
            if (Text(restored, "kind") != kind || Text(restored, "key") != key)
                throw new InvalidDataException("草稿身份不一致，不能覆盖。");
            original = restored["original"]?.DeepClone().AsObject() ?? throw new InvalidDataException("本机草稿缺少原标识。");
            values = restored["values"]?.DeepClone().AsObject() ?? throw new InvalidDataException("本机草稿缺少内容。");
        }
        var stableKey = key;
        var field = kind == "unscheduled" ? "text" : "name";
        page.Children.Clear(); heading.Text = kind == "unscheduled" ? "新未安排事项" : "新标签"; page.Children.Add(heading);
        page.Children.Add(Label(kind == "unscheduled" ? "填写最多 500 字符。本机先保留稳定 ID 与草稿，再发送创建请求。" : "标签为 1–32 字，不能与生活、工作重名。修改先保存在本机草稿中。"));
        var input = new TextBox { Text = Text(values, field), MinHeight = 80, AcceptsReturn = kind == "unscheduled", TextWrapping = TextWrapping.Wrap };
        page.Children.Add(input);
        var generation = 0;
        input.TextChanged += (_, _) => { generation++; draftDirty = true; draftTimer.Stop(); draftTimer.Start(); };
        saveEditor = async () =>
        {
            var savingGeneration = generation;
            var text = input.Text;
            _ = new UTF8Encoding(false, true).GetByteCount(text);
            var payload = Obj(("kind", kind), ("key", stableKey), ("original", original.DeepClone()), ("values", Obj((field, text))));
            await SaveLocalDraftAsync(new LocalDraft { Key = stableKey, Text = payload.ToJsonString(), Title = text[..Math.Min(40, text.Length)], BaseVersion = 0 });
            draftDirty = savingGeneration != generation;
            if (draftDirty) { draftTimer.Stop(); draftTimer.Start(); }
        };
        var buttons = new WrapPanel { Margin = new Thickness(0, 16, 0, 0) };
        buttons.Children.Add(Button(connected ? "保存并同步" : "存入本机待同步队列", async () =>
        {
            var text = input.Text.Trim();
            _ = new UTF8Encoding(false, true).GetBytes(text);
            if (kind == "unscheduled")
            {
                var command = ApiRequests.CreateUnscheduledTodo(Text(original, "id"), text);
                draftDirty = true;
                await QueueAsync(command.Method, command.Path, command.Body, stableKey);
            }
            else
            {
                var name = text.Normalize(NormalizationForm.FormC);
                if (name.Length == 0 || name.EnumerateRunes().Count() > 32 || name.Any(char.IsControl) || name is "生活" or "工作")
                    throw new InvalidOperationException("标签须为 1–32 字，不含控制字符，且不能与生活或工作重名。本机草稿保留。");
                draftDirty = true;
                await QueueAsync("POST", "/api/v1/note-entries/labels", Obj(("name", name), ("save_id", Guid.NewGuid().ToString())), LabelResource(name));
            }
        }));
        buttons.Children.Add(Button("保存本机草稿", async () => { draftDirty = true; await SaveDraftSafelyAsync(); }));
        buttons.Children.Add(Button("导出文字", () => ExportTextAsync(kind == "unscheduled" ? "未安排待办草稿.txt" : "标签草稿.txt", input.Text)));
        buttons.Children.Add(Button("返回清单", kind == "unscheduled" ? UnscheduledAsync : LabelsAsync));
        page.Children.Add(buttons);
        draftDirty = true;
        await saveEditor();
    }
}
