using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private void DraftsPage()
    {
        page.Children.Add(Label("草稿保存在当前 Windows 用户的独立加密分区。服务器已保存并不自动删除本机草稿。"));
        List(Engine.Snapshot.Drafts.Values.OrderByDescending(x => x.UpdatedAt).Select(draft =>
            (string.IsNullOrEmpty(draft.Title) ? "未命名草稿" : draft.Title, draft.Key + " · " + draft.UpdatedAt.ToLocalTime().ToString("g"),
                (Func<Task>)(async () =>
                {
                    var data = JsonNode.Parse(draft.Text)?.AsObject() ?? throw new InvalidDataException("草稿格式无法读取，已保留原文件。");
                    var choice = Choose("本机草稿", draft.Title, "继续编辑", "导出完整副本");
                    if (choice == "继续编辑")
                    {
                        if (Text(data, "kind") == "todo" && draft.BaseVersion > 0)
                        { ShowText("已保存的创建稿", data["values"]?.ToJsonString(new() { WriteIndented = true }) ?? draft.Text); return; }
                        if (Text(data, "kind") is "unscheduled" or "label-create") await PlanningDraftAsync(Text(data, "kind"), draft.Key);
                        else if (Text(data, "kind").StartsWith("review:", StringComparison.Ordinal)) await ReviewDraftAsync(Text(data, "kind"), draft.Key);
                        else if (Text(data, "kind") == "history") ShowText("保留的本机历史稿", data["values"]?.ToJsonString(new() { WriteIndented = true }) ?? draft.Text);
                        else await EditAsync(Text(data, "kind"), data["original"]!.DeepClone().AsObject(), draft.Key);
                    }
                    else if (choice == "导出完整副本") await ExportTextAsync("好多鱼本机草稿.txt", draft.Text);
                }))));
    }
    private static string StatusLabel(PendingStatus value) => value switch
    {
        PendingStatus.Queued => "待同步", PendingStatus.InFlight => "发送中", PendingStatus.Unknown => "结果未知",
        PendingStatus.Conflict => "版本冲突", PendingStatus.Blocked => "受阻", PendingStatus.Confirmed => "服务器已确认", _ => "已保留历史"
    };
    private void SyncPage()
    {
        page.Children.Add(Label("原请求、版本和保存 ID 已落盘。未知结果先只读核对；冲突需要明确选择，程序不会自动覆盖其他设备的改动。"));
        List(Engine.Snapshot.Outbox.OrderByDescending(x => x.CreatedAt).Select(operation =>
            (StatusLabel(operation.Status) + " · " + operation.Method + " " + operation.Path,
                (operation.Error ?? operation.CreatedAt.ToLocalTime().ToString("g")) + " · " + operation.Id,
                (Func<Task>)(() => InspectOperationAsync(operation)))));
    }
    private async Task InspectOperationAsync(PendingOperation operation)
    {
        var options = operation.Status switch
        {
            PendingStatus.Unknown when operation.Path == "/api/v1/articles" && operation.Method == "POST" =>
                new[] { "只读核对保存回执", "查看原请求和响应", "导出原请求" },
            PendingStatus.Unknown when operation.Path == "/api/v1/note-labels" =>
                new[] { "只读核对保存回执", "查看原请求和响应", "导出原请求" },
            PendingStatus.Unknown => new[] { "只读核对保存回执", "查看远端并保留原请求历史", "查看原请求和响应", "导出原请求" },
            PendingStatus.Conflict => new[] { "读取远端并处理冲突", "查看原请求和响应", "导出原请求" },
            PendingStatus.Blocked => new[] { "核对后重试同一请求", "查看原请求和响应", "导出原请求" },
            PendingStatus.Confirmed when operation.Method == "DELETE" => new[] { "恢复软删除记录", "查看原请求和响应", "导出原请求" },
            _ => new[] { "查看原请求和响应", "导出原请求" }
        };
        var choice = Choose("同步操作", StatusLabel(operation.Status) + "\n" + operation.Path, options);
        if (choice == "查看原请求和响应") ShowText("保存原件", operation.BodyJson + "\n\n服务器响应\n" + operation.RemoteJson);
        else if (choice == "导出原请求") await ExportTextAsync("好多鱼保存请求.txt", JsonSerializer.Serialize(operation, new JsonSerializerOptions { WriteIndented = true }));
        else if (choice == "只读核对保存回执")
        {
            if (!connected) throw new InvalidOperationException("先连接原工作区后才能核对。原请求保留。");
            var result = await api.ReconcileAsync(operation.Method, operation.Path, operation.BodyJson);
            if (result.Outcome == ReconciliationOutcome.Confirmed && result.RemoteJson != null)
            {
                await Engine.ConfirmReconciledAsync(operation.Id, result.RemoteJson);
                await RebaseConfirmedDraftsAsync();
                await NavigateAsync("同步中心"); Message("保存回执与当前实体一致，已确认原保存。" );
            }
            else
            {
                ShowText("尚未确认原保存", result.Message + "\n\n" + result.RemoteJson);
                Message("原结果仍未确认，未重复写入。可导出原请求和草稿，待核实后继续。" );
            }
        }
        else if (choice == "读取远端并处理冲突") await ResolveConflictAsync(operation);
        else if (choice == "查看远端并保留原请求历史")
        {
            if (!connected) throw new InvalidOperationException("先连接原工作区后再只读核对。");
            var remote = await ReadOperationEntityAsync(operation);
            ShowText("远端当前状态（不证明原请求未完成）", remote);
            if (Confirm("保留原请求和本地草稿为历史，并采用刚读取的远端状态？原请求仍可能迟到完成，本操作不会重发、取消或新建远端记录。"))
            {
                await Engine.ResolveAsync(operation.Id, remote);
                await NavigateAsync("同步中心");
            }
        }
        else if (choice == "核对后重试同一请求")
        {
            if (!connected) throw new InvalidOperationException("先连接原工作区后才能核对。");
            var remote = await ReadOperationEntityAsync(operation);
            ShowText("核对远端", remote);
            if (Confirm("此操作此前被明确拒绝或尚未发送。保留原保存 ID、正文和版本重新排队？若版本已变化，服务端仍会拒绝覆盖。"))
            {
                await Engine.RetryUnchangedAsync(operation.Id, remote);
                await NavigateAsync("同步中心"); Message("同一原请求已重新排队，请显式同步。" );
            }
        }
        else if (choice == "恢复软删除记录") await RestoreDeletedAsync(operation);
    }
    private async Task<string> ReadOperationEntityAsync(PendingOperation operation)
    {
        var path = operation.Path.EndsWith("/restore", StringComparison.Ordinal) ? operation.Path[..^8] : operation.Path;
        if (path.EndsWith("/template", StringComparison.Ordinal)) path = path[..^9];
        var id = operation.ResourceKey.Split('/').Last();
        string? collection = null;
        string FindDate()
        {
            var input = JsonNode.Parse(operation.BodyJson);
            if (!string.IsNullOrEmpty(Text(input, "date"))) return Text(input, "date");
            if (Engine.Snapshot.Drafts.TryGetValue(operation.ResourceKey, out var draft))
            {
                var saved = JsonNode.Parse(draft.Text)?["original"];
                if (!string.IsNullOrEmpty(Text(saved, "date"))) return Text(saved, "date");
            }
            foreach (var cached in Engine.Snapshot.Cache.Values)
            {
                var data = Data(cached);
                var row = Rows(data?["items"]).FirstOrDefault(r => Text(r, "id") == id);
                if (row != null && !string.IsNullOrEmpty(Text(row, "date"))) return Text(row, "date");
            }
            throw new InvalidOperationException("无法核实原记录日期，已保留原稿。请返回原日期清单读取，不能猜测今天。");
        }
        if (path.StartsWith("/api/v1/todos/", StringComparison.Ordinal))
        {
            path = "/api/v1/todos?date=" + FindDate(); collection = "items";
        }
        else if (path.StartsWith("/api/v1/work-reminders/", StringComparison.Ordinal)) { path = "/api/v1/work-reminders?date=" + FindDate(); collection = "items"; }
        else if (path.StartsWith("/api/v1/todo-templates/", StringComparison.Ordinal)) { path = "/api/v1/todo-templates"; collection = "items"; }
        else if (path.StartsWith("/api/v1/memos/groups/", StringComparison.Ordinal)) { path = "/api/v1/memos"; collection = "groups"; }
        else if (path.StartsWith("/api/v1/daily-notes/", StringComparison.Ordinal))
        {
            var parts = path.Split('?', 2);
            path = "/api/v1/daily-notes?date=" + parts[0].Split('/').Last() + (parts.Length > 1 ? "&" + parts[1] : "");
        }
        var result = await Engine.ReadRemoteAsync(path);
        if (!result.IsSuccess) throw new InvalidOperationException("远端读取未成功，不能处理冲突。原稿保留。HTTP " + result.StatusCode);
        await Engine.CacheAsync(path, result.Json);
        if (collection != null)
        {
            var entity = Rows(Data(result.Json)?[collection]).FirstOrDefault(r => Text(r, "id") == id);
            return Obj(("data", entity?.DeepClone()), ("present_in_current_list", entity != null)).ToJsonString();
        }
        return result.Json;
    }
    private async Task ResolveConflictAsync(PendingOperation operation)
    {
        if (!connected) throw new InvalidOperationException("先连接原工作区后才能读取最新版本。");
        var remoteJson = await ReadOperationEntityAsync(operation);
        var remote = Data(remoteJson);
        if (remote?["items"] is JsonArray rows)
        {
            var id = operation.ResourceKey.Split('/').Last();
            remote = rows.OfType<JsonObject>().FirstOrDefault(r => Text(r, "id") == id);
        }
        var panel = new StackPanel { Margin = new Thickness(20) };
        panel.Children.Add(Label("本地原请求（完整保留）"));
        panel.Children.Add(new TextBox { Text = operation.BodyJson, IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 180, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        panel.Children.Add(Label("远端当前记录"));
        panel.Children.Add(new TextBox { Text = remoteJson, IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 180, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        Dialog("本地与远端核对", panel).ShowDialog();
        var choice = Choose("处理冲突", "原稿、原请求和最新远端都会保留在本机历史中。", "采用远端，保留本地历史", "以远端当前版本重提本地原稿", "暂不处理");
        if (choice == "采用远端，保留本地历史")
        {
            await PreserveAndAdoptDraftAsync(operation, remote);
            await Engine.ResolveAsync(operation.Id, remoteJson);
        }
        else if (choice == "以远端当前版本重提本地原稿")
        {
            var body = JsonNode.Parse(operation.BodyJson)?.AsObject() ?? throw new InvalidDataException("原请求格式无效。");
            var review = operation.Path.StartsWith("/api/v1/review/", StringComparison.Ordinal);
            if (remote == null || (review ? Text(remote, "content_hash").Length != 64 || !body.ContainsKey("expected_hash") : Version(remote) < 1 || !body.ContainsKey("version")) || operation.Method is "POST" or "DELETE")
                throw new InvalidOperationException("此操作无法安全重提。请保留原稿，在清单中读取最新记录后重新编辑。");
            if (!Confirm("将本地原稿按刚读取的远端版本创建一个新保存请求？这会用本地原稿取代该版本的远端正文。")) return;
            var id = Guid.NewGuid().ToString();
            if (review) body["expected_hash"] = Text(remote, "content_hash"); else body["version"] = Version(remote);
            if (body.ContainsKey("save_id")) body["save_id"] = id;
            await Engine.ResolveAsync(operation.Id, remoteJson, new PendingOperation { Id = id, ResourceKey = operation.ResourceKey,
                Method = operation.Method, Path = operation.Path, BodyJson = body.ToJsonString() });
        }
        await NavigateAsync("同步中心");
    }
    private async Task PreserveAndAdoptDraftAsync(PendingOperation operation, JsonNode? remote)
    {
        if (remote is not JsonObject || !Engine.Snapshot.Drafts.TryGetValue(operation.ResourceKey, out var draft)) return;
        var saved = JsonNode.Parse(draft.Text)?.AsObject();
        if (saved == null) return;
        var history = (JsonObject)saved.DeepClone();
        var historyKey = "/local/history/" + Guid.NewGuid().ToString();
        history["kind"] = "history"; history["key"] = historyKey; history["source_key"] = draft.Key;
        await SaveLocalDraftAsync(draft with { Key = historyKey, Text = history.ToJsonString(), Title = "历史稿 · " + draft.Title });
        var original = (JsonObject)remote.DeepClone();
        if (Text(saved, "kind") == "legacy") original["category"] = saved["original"]?["category"]?.DeepClone();
        saved["original"] = original.DeepClone(); saved["values"] = original.DeepClone();
        await SaveLocalDraftAsync(draft with { Text = saved.ToJsonString(), BaseVersion = Version(remote) });
    }
    private async Task RestoreDeletedAsync(PendingOperation operation)
    {
        var result = Data(operation.RemoteJson ?? "{}");
        if (result == null || Version(result) < 1) throw new InvalidOperationException("原删除响应没有可核实版本，请从对应回收站恢复。");
        if (!Confirm("恢复此条已软删除的记录？原删除历史仍保留。")) return;
        var body = Obj(("version", Version(result)));
        if (operation.Path.StartsWith("/api/v1/todos/", StringComparison.Ordinal)) body["date"] = Text(JsonNode.Parse(operation.BodyJson), "date");
        else if (operation.Path.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal) || operation.Path.StartsWith("/api/v1/memos/", StringComparison.Ordinal) || operation.Path.StartsWith("/api/v1/work-reminders/", StringComparison.Ordinal)) body["save_id"] = Guid.NewGuid().ToString();
        else throw new InvalidOperationException("此接口没有已验证的软删除恢复能力。");
        await QueueAsync("POST", operation.Path + "/restore", body, operation.ResourceKey);
    }
    private void RecoveryPage()
    {
        page.Children.Add(Label("独立数据目录：" + root));
        page.Children.Add(Label("本候选版本使用 Windows 当前用户 DPAPI 加密。请在应用退出后保全整个 NativeWorkbench/v1 目录。加密副本通常只能由同一 Windows 用户解密；迁移电脑前请逐份导出需要的文字。"));
        page.Children.Add(Label("每次原子保存保留上一个 workspace.bin.bak。遇到损坏或未知格式会停止，不会清空。恢复会保留损坏原件。旧客户端和 Android 的数据目录均不会读取或覆盖。"));
        page.Children.Add(Button("从上一份本机备份恢复", async () =>
        {
            await FlushEditorAsync();
            if (!Confirm("恢复上一份加密快照？当前损坏或较新的主文件会保留为 damaged 副本。请先退出并复制整个目录；没有有效备份会停止。")) return;
            var identity = failedIdentity ?? currentIdentity ?? "public:" + (settings.PublicScope ?? "unbound");
            connected = false; store?.Dispose(); store = null; engine = null; currentIdentity = null;
            using (var recovery = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, protector)) await recovery.RestoreBackupAsync();
            await OpenWorkspaceAsync(identity); await NavigateAsync("本机草稿");
            Message("已显式恢复上一份本机快照，损坏原件保留。旧在途操作按结果未知恢复，尚未联网写入。" );
        }));
        page.Children.Add(Label("历史分区只读恢复（含首次未绑定的离线草稿）："));
        if (Directory.Exists(root)) foreach (var directory in Directory.GetDirectories(root))
        {
            var path = Path.Combine(directory, "workspace.bin");
            if (!File.Exists(path)) continue;
            var label = Path.GetFileName(directory);
            page.Children.Add(Button("只读查看 " + label[..Math.Min(12, label.Length)], async () =>
            {
                var bytes = await File.ReadAllBytesAsync(path);
                if (bytes.Length < 7 || !bytes.AsSpan(0, 7).SequenceEqual("HDYWS1\n"u8)) throw new InvalidDataException("分区格式不受支持，原文件保留。");
                var clear = protector.Unprotect(bytes[7..]);
                try
                {
                    var data = JsonNode.Parse(clear)?.AsObject() ?? throw new InvalidDataException("分区无法读取。");
                    ShowText("历史分区（只读，不会发送其队列）", data.ToJsonString(new() { WriteIndented = true }));
                    if (Confirm("将该历史分区导出为未加密的纯文本恢复副本？不会自动导入或发送旧队列。")) await ExportTextAsync("好多鱼历史分区.txt", data.ToJsonString(new() { WriteIndented = true }));
                }
                finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(clear); }
            }));
        }
        page.Children.Add(Label("版本 0.1.0 开发候选。尚未安装到用户电脑；尚未验证旧版覆盖升级、实机中文输入法、断电恢复或正式签名分发。"));
    }
}
