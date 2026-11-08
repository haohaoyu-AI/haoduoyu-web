using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private Task ChooseOfflineProfileAsync()
    {
        var choices = settings.Profiles.OrderByDescending(p => p.ConfirmedAt).Select((profile, index) =>
            (Label: $"{index + 1}. {profile.DisplayName} · {(profile.IsPublic ? "公开" : "私有")} · {profile.Scope[..8]}", profile.Identity)).ToArray();
        var option = Choose("本机工作区", "仅显示已由服务确认并在当前 Windows 用户下保存过的工作区。离线切换不会登录或发送队列。",
            choices.Select(c => c.Label).Append("首次未绑定的本机工作区").ToArray());
        if (option == null) return Task.CompletedTask;
        var identity = option == "首次未绑定的本机工作区" ? OfflineProfiles.UnboundPublicIdentity : choices.Single(c => c.Label == option).Identity;
        return OpenOfflineProfileAsync(identity);
    }

    private async Task OpenOfflineProfileAsync(string identity)
    {
        await FlushEditorAsync();
        var selected = OfflineProfiles.Select(settings, identity);
        SettingsFile.Write(root, selected, protector);
        api.UsePublicMode(); connected = false;
        await OpenWorkspaceAsync(identity);
        settings = selected;
        await NavigateAsync("待办");
        var profile = OfflineProfiles.Get(settings, identity);
        Message(profile is { IsPublic: false }
            ? "已离线打开 " + profile.DisplayName + " 的本机工作区。可继续编辑；联网发送前需原账号重新登录并核对工作区。"
            : "已打开本机公开工作区。草稿和排队操作保留，尚未联网发送。");
    }

    private async Task PrepareOfflineAsync()
    {
        await FlushEditorAsync();
        if (!connected || currentIdentity == null || api.ExpectedScopeId == null)
            throw new InvalidOperationException("请先登录或连接当前工作区并核对身份，再准备完整离线资料。");
        var target = Engine; var workspace = store; var identity = currentIdentity; var expectedScope = api.ExpectedScopeId;
        var scope = target.Snapshot.ScopeId; var cancellation = NetworkToken;
        void Guard()
        {
            cancellation.ThrowIfCancellationRequested();
            if (!connected || identity != currentIdentity || !ReferenceEquals(target, engine) || !ReferenceEquals(workspace, store) ||
                target.Snapshot.ScopeId != scope || api.ExpectedScopeId != expectedScope || TemplateArchiveTransportIdentity(expectedScope) != identity)
                throw new InvalidOperationException("工作区已变化，本次资料未用于其他分区。");
        }
        Guard();
        var progress = new Progress<OfflineDownloadProgress>(p => Message($"{p.Stage} · {p.Requests} 次读取，{p.Records} 条记录，{p.Dates} 个日期。可取消；未完成时不会替换旧资料。"));
        var downloaded = await new OfflineDownload(api, clock: () => clock.GetUtcNow()).FetchAsync(expectedScope, scope, progress, cancellation);
        Guard();
        if (downloaded.ScopeId != expectedScope)
            throw new InvalidOperationException("工作区已变化，本次资料未写入任何分区。");
        await Task.Run(() => target.CacheBatchAsync(downloaded.CacheEntries, cancellation), cancellation);
        Guard();
        await NavigateAsync(currentPage);
        Message($"离线资料已完整核对并原子保存：{downloaded.Dates} 个日期、{downloaded.Records} 条记录，含活动与归档常用事项的独立完整列表。草稿和待同步请求保留。");
    }

    private static string LocalSuffix(JsonNode? row)
    {
        var value = Text(row, "_local_status");
        return value.Length == 0 ? "" : " · " + (value switch
        {
            "Queued" => "待同步", "InFlight" => "发送中", "Unknown" => "结果待核对", "Conflict" => "版本冲突",
            "Blocked" => "同步受阻", "Confirmed" => "已收到回执", _ => value
        });
    }

    private async Task<bool> HandlePendingRecordAsync(JsonNode record)
    {
        if (Flag(record, "_local_incomplete"))
        {
            Message("本机只有此记录的摘要。请连接或准备完整离线资料后再编辑，不能用缺失字段覆盖正文。");
            return true;
        }
        var id = Text(record, "_operation_id");
        if (id.Length == 0) return false;
        var pending = Engine.Snapshot.Outbox.SingleOrDefault(o => o.Id == id);
        if (pending == null || pending.Status is PendingStatus.Confirmed or PendingStatus.Superseded) return false;
        if (pending.Method == "DELETE") { await InspectOperationAsync(pending); return true; }
        if (pending.CanEditQueued) return false;
        await InspectOperationAsync(pending);
        return true;
    }
    private static bool EffectiveDeleted(JsonObject row) => row.ContainsKey("_local_deleted") ? Flag(row, "_local_deleted") : row["deleted_at"] != null;

    private async Task QueuePreparedAsync(PendingOperation pending)
    {
        var existing = Engine.Snapshot.Outbox.LastOrDefault(o => o.ResourceKey == pending.ResourceKey &&
            o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        var target = Engine;
        if (existing != null)
        {
            if (!existing.CanEditQueued)
                throw new InvalidOperationException("原请求已经尝试发送或需要核对。最新草稿已保留，请先处理原保存，不能替换未知请求。");
            var replacement = pending with
            {
                DependencyIds = pending.DependencyIds.Count == 0 ? existing.DependencyIds : pending.DependencyIds,
                VersionFromDependencyId = pending.VersionFromDependencyId ?? existing.VersionFromDependencyId
            };
            await Task.Run(() => target.ReplaceQueuedAsync(existing.Id, replacement));
        }
        else await Task.Run(() => target.QueueAsync(pending));
    }

    private IReadOnlyList<string> CreationDependencies(string path, JsonObject body)
    {
        var dependencies = new List<string>();
        if (path == "/api/v1/todos" && Text(body, "template_id") is { Length: > 0 } template)
        {
            var parent = Engine.Snapshot.Outbox.LastOrDefault(o => o.Path == "/api/v1/todo-templates" && o.Method == "POST" &&
                Text(JsonNode.Parse(o.BodyJson), "id") == template && o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
            if (parent != null) dependencies.Add(parent.Id);
        }
        if (path.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal) && body["labels"] is JsonArray labels)
        {
            var selectedLabels = labels.Select(label => label?.ToString()).ToHashSet(StringComparer.Ordinal);
            dependencies.AddRange(Engine.Snapshot.Outbox.Where(o => o.Path == "/api/v1/note-entries/labels" && o.Method == "POST" &&
                selectedLabels.Contains(Text(JsonNode.Parse(o.BodyJson), "name")) && o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)).Select(o => o.Id));
        }
        if (path.StartsWith("/api/v1/memos/notes/", StringComparison.Ordinal) && Text(body, "group_id") is { Length: > 0 } group)
        {
            var parent = Engine.Snapshot.Outbox.LastOrDefault(o => o.Status != PendingStatus.Superseded &&
                (o.Path == "/api/v1/memos/groups/" + group && o.Method == "PUT" && Version(JsonNode.Parse(o.BodyJson)) == 0 ||
                 o.Path == "/api/v1/memos/groups/" + group + "/restore" && o.Method == "POST"));
            if (parent != null && parent.Status != PendingStatus.Confirmed) dependencies.Add(parent.Id);
        }
        if (path.StartsWith("/api/v1/review/snapshots/", StringComparison.Ordinal) && Text(body, "article_id") is { Length: > 0 } article)
        {
            var parent = Engine.Snapshot.Outbox.LastOrDefault(o => o.Path == "/api/v1/review/articles/" + article && o.Method == "PUT" && o.Status != PendingStatus.Superseded);
            if (parent != null && parent.Status != PendingStatus.Confirmed) dependencies.Add(parent.Id);
        }
        foreach (var (field, resource) in new[] { ("benchmark_account_id", "benchmark-accounts"), ("reference_article_id", "benchmark-articles") })
        {
            var value = Text(body, field);
            if (value.Length == 0) continue;
            var parent = Engine.Snapshot.Outbox.LastOrDefault(o => o.Path == "/api/v1/review/" + resource + "/" + value &&
                o.Method == "PUT" && o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
            if (parent != null) dependencies.Add(parent.Id);
        }
        return dependencies;
    }

    private async Task SetTodoCompletionAsync(JsonObject row, bool completed)
    {
        await QueueVersionedRecordAsync("PATCH", "/api/v1/todos/" + Text(row, "id"), Obj(("completed", completed)), row, "todo");
    }

    private async Task QueueVersionedRecordAsync(string method, string path, JsonObject body, JsonObject row, string resource)
    {
        var id = Text(row, "id");
        var existing = Engine.Snapshot.Outbox.LastOrDefault(o => o.Path == path && o.Method == method &&
            o.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        if (existing != null)
        {
            if (!existing.CanEditQueued) { await InspectOperationAsync(existing); return; }
            var old = JsonNode.Parse(existing.BodyJson)!.AsObject();
            if (old.ContainsKey("version")) body["version"] = old["version"]!.DeepClone();
            await FlushEditorAsync();
            await QueuePreparedAsync(new PendingOperation { Path = path, Method = method, BodyJson = body.ToJsonString(),
                ResourceKey = existing.ResourceKey, DependencyIds = existing.DependencyIds, VersionFromDependencyId = existing.VersionFromDependencyId });
            if (connected) await SyncToPageAsync(currentPage); else await NavigateAsync(currentPage);
            return;
        }
        var projectedOperation = Text(row, "_operation_id");
        var parent = Engine.Snapshot.Outbox.SingleOrDefault(o => o.Id == projectedOperation && o.Status != PendingStatus.Superseded);
        if (Version(row) > 0 && (parent == null || parent.Status == PendingStatus.Confirmed))
        {
            body["version"] = Version(row); await QueueAsync(method, path, body, path); return;
        }
        parent ??= Engine.Snapshot.Outbox.LastOrDefault(o => Text(JsonNode.Parse(o.BodyJson), "id") == id && o.Method == "POST" && o.Status != PendingStatus.Superseded);
        if (parent == null) throw new InvalidOperationException("没有可核实的本机创建请求，不能猜测版本。原内容保留。");
        await FlushEditorAsync();
        await QueuePreparedAsync(new PendingOperation
        {
            Path = path, Method = method, BodyJson = body.ToJsonString(),
            ResourceKey = "/local/" + resource + "/" + id, DependencyIds = [parent.Id], VersionFromDependencyId = parent.Id
        });
        if (connected) await SyncToPageAsync(currentPage); else { await NavigateAsync(currentPage); Message("本机状态已保存；前置记录确认后才会按真实版本同步。"); }
    }

    private async Task<bool> CancelUnsentCreationAsync(JsonNode row)
    {
        if (!Flag(row, "_local_new") || Version(row) > 0) return false;
        var entity = Text(row, "id");
        var original = Engine.Snapshot.Outbox.LastOrDefault(o => o.CanEditQueued &&
            ((o.Method == "POST" && Text(JsonNode.Parse(o.BodyJson), "id") == entity) ||
             (o.Method == "PUT" && o.Path.EndsWith("/" + entity, StringComparison.Ordinal) &&
              (Version(JsonNode.Parse(o.BodyJson)) == 0 || o.Path.StartsWith("/api/v1/review/", StringComparison.Ordinal)))));
        if (original == null) throw new InvalidOperationException("这条本机记录已有待核对请求，不能当作未发送记录取消。草稿保留。");
        await Engine.CancelQueuedAsync(original.Id);
        await NavigateAsync(currentPage);
        Message("已取消尚未发送的创建请求，原稿保留；依赖它的内容仍在本机等待处理，不会提前发送。");
        return true;
    }
}
