using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Data;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string? templateArchiveIdentity;
    private bool templateArchiveArchived;
    private long templateArchiveEpoch;
    private void ResetTemplateArchiveView()
    { templateArchiveIdentity = null; templateArchiveArchived = false; templateArchiveEpoch = checked(templateArchiveEpoch + 1); }

    private async Task TemplateArchiveAsync()
    {
        await FlushEditorAsync();
        if (templateArchiveIdentity != currentIdentity) { ResetTemplateArchiveView(); templateArchiveIdentity = currentIdentity; }
        var target = Engine; var workspace = store; var identity = currentIdentity; var state = target.Snapshot; var scope = state.ScopeId;
        var archived = templateArchiveArchived; var path = TemplateArchive.ListPath(archived); var before = templateArchiveEpoch;
        JsonObject? projected = null; string? error = null;
        try { projected = await Task.Run(() => TemplateArchive.ProjectList(archived, state)); }
        catch (Exception failure) when (failure is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
        { error = "此本机列表未能完整核实，原缓存、草稿和请求保留。连接原工作区后可显式刷新；不会借用另一张列表补成空清单。"; }
        NetworkToken.ThrowIfCancellationRequested(); EnsureTemplateArchiveOwner(identity, scope, target, workspace);
        if (before != templateArchiveEpoch) throw new InvalidOperationException("常用事项页面已变化，旧投影未替换当前视图。");
        var epoch = templateArchiveEpoch = checked(templateArchiveEpoch + 1);
        void Guard()
        { EnsureTemplateArchiveOwner(identity, scope, target, workspace); if (epoch != templateArchiveEpoch || currentPage != "常用事项") throw new InvalidOperationException("此模板页面已变化，请重新打开当前列表。"); }
        currentPage = "常用事项"; ClearPage(); heading.Text = "常用事项"; page.Children.Add(heading);
        page.Children.Add(Label("常用事项手动加入指定日期，不会自动生成。活动与归档列表各自独立读取；归档保留待办历史和关联，恢复归档不恢复软删除。"));
        var tabs = new TabControl { Margin = new Thickness(0, 4, 0, 12) };
        tabs.Items.Add(new TabItem { Header = "活动模板" }); tabs.Items.Add(new TabItem { Header = "归档模板" }); tabs.SelectedIndex = archived ? 1 : 0;
        AutomationProperties.SetAutomationId(tabs, "template-archive-tabs"); page.Children.Add(tabs);
        var body = new StackPanel(); ((TabItem)tabs.SelectedItem).Content = body;
        tabs.SelectionChanged += (_, args) =>
        { if (args.Source != tabs || tabs.SelectedIndex < 0 || (tabs.SelectedIndex == 1) == templateArchiveArchived) return;
            var selected = tabs.SelectedIndex == 1; Run(async () => { Guard(); templateArchiveArchived = selected; await TemplateArchiveAsync(); }); };
        var commands = new WrapPanel(); body.Children.Add(commands);
        if (!archived) commands.Children.Add(TemplateArchiveButton("＋ 新常用事项", "template-archive-new", () =>
        { Guard(); return NewEditorAsync("template", NewRecord(("text", "")), "/api/v1/todo-templates/"); }));
        commands.Children.Add(TemplateArchiveButton("刷新当前列表", "template-archive-refresh", () => { Guard(); return RefreshTemplateArchiveAsync(archived); }));
        commands.Children.Add(TemplateArchiveButton("两列表只读核对", "template-archive-check-both", () => { Guard(); return CheckTemplateArchiveListsAsync(); }));
        commands.Children.Add(TemplateArchiveButton("返回每日待办", "template-archive-todos", () => { Guard(); return NavigateAsync("待办"); }));
        body.Children.Add(Label("当前来源：" + path + " · " + (connected ? "已连接；本页仍显示本机已知副本，需显式刷新" : "离线本机副本")));
        if (error is not null) body.Children.Add(Label(error));
        var data = projected?["data"] as JsonObject;
        var rows = Rows(data?["items"]).Select(row => (JsonObject)row.DeepClone()).ToArray();
        var incomplete = projected is null || Flag(projected, "_local_incomplete") || data is null || Flag(data, "_local_incomplete");
        var statusLine = Label((incomplete ? "当前列表尚未完整读取" : "当前列表已有独立完整来源") + $" · 本机可见 {rows.Length} 项 · 本机意图不代表服务端确认。");
        AutomationProperties.SetAutomationId(statusLine, "template-archive-source"); body.Children.Add(statusLine);
        if (state.Cache.TryGetValue(path, out var raw))
        {
            try
            {
                TemplateArchive.ValidateList(path, raw, scope);
                var source = JsonNode.Parse(raw) as JsonObject; var meta = source?["_local_template_archive"] as JsonObject;
                body.Children.Add(Label(meta is null ? "此旧副本未记录读取时间，不能推断为刚刚取得。" : "本机读取时间：" + Text(meta, "observed_at_utc") + "；两列表可能来自不同时间。"));
                body.Children.Add(Label("来源统计窗口：" + Text(source?["data"], "window_start") + " 至 " + Text(source?["data"], "today") + "；完成天数由来源记录，未取得时不补零。"));
            }
            catch (Exception failure) when (failure is InvalidDataException or JsonException or ArgumentException or InvalidOperationException)
            { /* Source data stays preserved; the safe model above determines usability. */ }
        }
        if (archived) body.Children.Add(Label("归档模板不能用于新待办。旧待办的原文、完成状态、模板标识和历史关联保持不变。"));
        if (incomplete) body.Children.Add(Label("未知或局部列表不能当成服务端空清单。可继续已有本机草稿，或显式读取当前列表；不会因另一列表或快照缺席就删除模板。"));
        var list = new ListBox { ItemsSource = rows, Height = 390, MinHeight = 160, MaxHeight = 490, SelectionMode = SelectionMode.Single };
        ScrollViewer.SetCanContentScroll(list, true); ScrollViewer.SetVerticalScrollBarVisibility(list, ScrollBarVisibility.Auto);
        VirtualizingPanel.SetIsVirtualizing(list, true); VirtualizingPanel.SetVirtualizationMode(list, VirtualizationMode.Recycling);
        var template = new DataTemplate(typeof(JsonObject)); var label = new FrameworkElementFactory(typeof(TextBlock));
        label.SetBinding(TextBlock.TextProperty, new Binding { Converter = new TemplateArchiveDisplayConverter() });
        label.SetValue(TextBlock.TextWrappingProperty, TextWrapping.Wrap); label.SetValue(FrameworkElement.MarginProperty, new Thickness(4, 8, 4, 8));
        template.VisualTree = label; list.ItemTemplate = template;
        AutomationProperties.SetAutomationId(list, "template-archive-records"); body.Children.Add(list);
        list.SelectionChanged += (_, _) => { if (list.SelectedItem is JsonObject row) Run(async () => { Guard(); await OpenTemplateArchiveRowAsync(row, identity, scope); }); };
        if (rows.Length == 0) body.Children.Add(Label(incomplete ? "本机尚无此列表的已知条目。" : "此独立列表当前已读取为空；不推断另一列表也为空。"));
    }

    private async Task OpenTemplateArchiveRowAsync(JsonObject row, string? identity, string scope)
    {
        EnsureTemplateArchiveOwner(identity, scope); await FlushEditorAsync(); EnsureTemplateArchiveOwner(identity, scope);
        var target = Engine; var workspace = store; var epoch = templateArchiveEpoch;
        void Guard() { EnsureTemplateArchiveOwner(identity, scope, target, workspace); if (epoch != templateArchiveEpoch || currentPage != "常用事项") throw new InvalidOperationException("此模板记录所属页面已变化。"); }
        var copy = (JsonObject)row.DeepClone(); var archived = TemplateArchiveEffectiveArchived(copy); var key = TemplateArchiveRecordKey(copy);
        ClearPage(); heading.Text = archived ? "归档模板 · 只读详情" : "活动模板 · 只读详情"; page.Children.Add(heading);
        page.Children.Add(Label("标识：" + Text(copy, "id") + " · 原版本 " + (copy.ContainsKey("version") ? Text(copy, "version") : "未取得") + LocalSuffix(copy)));
        page.Children.Add(Label("归档状态：" + (archived ? "归档（可能包含本机未确认意图）" : "活动（以当前本机已知来源为准）") + "。本机状态、服务器归档时间和原始字段分别保留。"));
        if (target.Snapshot.Drafts.ContainsKey(key)) page.Children.Add(Label("此模板有同键本机草稿。归档不应用草稿正文，也不重置草稿原版本；恢复或其他设备修改后，继续保存旧稿仍使用原版本并接受冲突检查。"));
        var text = new TextBox { Text = Text(copy, "text") + "\n\n保留字段（只读，不是可导入请求）：\n" + copy.ToJsonString(ArticleReadableJson),
            IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = 330, MaxHeight = 600, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        AutomationProperties.SetAutomationId(text, "template-archive-detail-text"); page.Children.Add(text);
        var buttons = new WrapPanel(); page.Children.Add(buttons);
        if (!archived) buttons.Children.Add(TemplateArchiveButton("加入 " + Day, "template-archive-add-todo", async () =>
        { Guard(); await AddTemplateArchiveTodoAsync(copy); }));
        buttons.Children.Add(TemplateArchiveButton("改名或继续原草稿", "template-archive-rename", async () =>
        { Guard(); await RenameTemplateArchiveAsync(copy); }));
        var stateButton = TemplateArchiveButton(archived ? "恢复归档" : "归档此模板", archived ? "template-archive-restore" : "template-archive-archive", async () =>
        {
            Guard();
            if (Confirm(archived ? "恢复此模板到活动列表？保留原标识、历史关联和原版本；这不会恢复已软删除的模板。" : "归档此模板？以后不能用它新增待办；已有待办历史与关联完整保留。"))
                await QueueTemplateArchiveStateAsync(copy, !archived);
        }); buttons.Children.Add(stateButton);
        buttons.Children.Add(TemplateArchiveButton("软删除常用模板", "template-archive-delete", async () =>
        {
            Guard(); if (await GuardTemplateArchivePendingAsync(key, allowEditable: false)) return;
            if (!TemplateArchiveSafeRecord(copy)) throw new InvalidOperationException("尚无完整且带真实版本的模板，原副本保留。");
            if (Confirm("软删除此模板？这是原有删除操作，会保留本机请求历史；归档与删除含义不同。"))
                await QueueAsync("DELETE", key, ApiRequests.DeleteTemplate(Text(copy, "id"), Version(copy)).Body, key);
        }));
        if (!TemplateArchiveSafeRecord(copy)) page.Children.Add(Label("此副本尚无可归档或恢复的完整正版本。已有同键草稿可核实后继续；归档和恢复须等待完整来源或创建确认，不猜测版本0。"));
        if (target.Snapshot.Outbox.Any(operation => operation.ResourceKey == key && operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)))
            buttons.Children.Add(TemplateArchiveButton("查看原待同步请求", "template-archive-pending", async () =>
            { Guard(); var operation = Engine.Snapshot.Outbox.Last(item => item.ResourceKey == key && item.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)); await InspectOperationAsync(operation); }));
        buttons.Children.Add(TemplateArchiveButton("导出此条只读副本", "template-archive-export", () =>
        { Guard(); return ExportTextAsync("好多鱼常用模板.txt", "本机已知模板只读副本；不是原始备份，不能导入或重放。\n" + copy.ToJsonString(ArticleReadableJson)); }));
        buttons.Children.Add(TemplateArchiveButton("返回常用事项", "template-archive-back", () => { Guard(); return TemplateArchiveAsync(); }));
    }

    private async Task QueueTemplateArchiveStateAsync(JsonObject row, bool archived)
    {
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        var epoch = templateArchiveEpoch; var cancellation = NetworkToken;
        var key = TemplateArchiveRecordKey(row);
        if (await GuardTemplateArchivePendingAsync(key, allowEditable: false)) return;
        if (!TemplateArchiveSafeRecord(row)) throw new InvalidOperationException("归档或恢复需要完整模板及真实正版本。原草稿保留；请显式刷新，创建未确认时先处理原创建请求。");
        if (TemplateArchiveEffectiveArchived(row) == archived) throw new InvalidOperationException("此本机副本已处于目标状态，未创建重复请求。请显式刷新或只读核对两列表。");
        var command = ApiRequests.TemplateArchive(Text(row, "id"), Version(row), archive: archived);
        await FlushEditorAsync();
        cancellation.ThrowIfCancellationRequested(); EnsureTemplateArchiveOwner(identity, scope, target, workspace);
        if (epoch != templateArchiveEpoch) throw new InvalidOperationException("模板页面已变化，未排入旧页面的归档请求。");
        await QueuePreparedAsync(new PendingOperation { Method = command.Method, Path = command.Path, ResourceKey = key, BodyJson = command.BodyJson });
        EnsureTemplateArchiveOwner(identity, scope, target, workspace);
        if (connected) await SyncToPageAsync("常用事项"); else { await TemplateArchiveAsync(); Message((archived ? "归档" : "恢复归档") + "意图已保存到同一模板的待同步请求中；尚未服务端确认。旧稿、版本和历史关联保留。"); }
    }

    private async Task RenameTemplateArchiveAsync(JsonObject row)
    {
        var key = TemplateArchiveRecordKey(row);
        if (await GuardTemplateArchivePendingAsync(key, allowEditable: true)) return;
        if (Engine.Snapshot.Drafts.TryGetValue(key, out var draft))
        {
            var saved = JsonNode.Parse(draft.Text) as JsonObject;
            if (saved is null || Text(saved, "kind") != "template" || Text(saved, "key") != key || saved["original"] is not JsonObject original ||
                Text(original, "id") != Text(row, "id") || original["version"] is not JsonValue version || !version.TryGetValue<long>(out var number) || number < 0 || number != draft.BaseVersion ||
                Flag(original, "_local_incomplete") || saved["values"] is not JsonObject values || values["text"] is not JsonValue text || !text.TryGetValue<string>(out _))
                throw new InvalidDataException("原模板草稿的标识或版本无法核实，原件保留，不会用摘要重建版本0。");
            if (await HandlePendingRecordAsync(original)) return;
            await EditAsync("template", (JsonObject)original.DeepClone(), key); return;
        }
        if (!TemplateArchiveSafeRecord(row)) throw new InvalidOperationException("尚无完整且带真实版本的模板。请刷新原列表；本机摘要不能作为新模板或猜测版本0。");
        if (await HandlePendingRecordAsync(row)) return;
        await EditAsync("template", (JsonObject)row.DeepClone(), key);
    }

    private async Task AddTemplateArchiveTodoAsync(JsonObject row)
    {
        var key = TemplateArchiveRecordKey(row);
        if (await GuardTemplateArchivePendingAsync(key, allowEditable: true)) return;
        if (TemplateArchiveEffectiveArchived(row) || !(TemplateArchiveSafeRecord(row) || TemplateArchiveEditableCreation(row)))
            throw new InvalidOperationException("只有已核实的活动模板能用于新待办。归档、未知或来源未核实的模板不会换标识绕开限制。");
        var command = ApiRequests.CreateTodo(Guid.NewGuid().ToString(), Day, Text(row, "text"), Text(row, "id"));
        await QueueAsync(command.Method, command.Path, command.Body, "/api/v1/todos/" + Text(command.Body, "id"));
    }

    private async Task<bool> GuardTemplateArchivePendingAsync(string key, bool allowEditable)
    {
        var operation = Engine.Snapshot.Outbox.LastOrDefault(item => item.ResourceKey == key && item.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        if (operation is null) return false;
        if (allowEditable && operation.CanEditQueued && !IsTemplateArchiveOperation(operation) && operation.Method != "DELETE") return false;
        await InspectOperationAsync(operation); return true;
    }

    private async Task RefreshTemplateArchiveAsync(bool archived)
    {
        await ReadTemplateArchiveListsAsync([archived], requireTemplatePage: true);
        await TemplateArchiveAsync(); Message("已保存当前列表的独立完整来源。另一列表未被补空；草稿和未决请求保留，未发送业务写入。");
    }
    private async Task CheckTemplateArchiveListsAsync()
    {
        var pair = await ReadTemplateArchiveListsAsync([false, true], requireTemplatePage: false);
        var copy = Obj(("source", "活动与归档列表分别只读取得，不是同一事务；列表相同状态不证明任何丢失请求已经提交。不会自动确认、重试或替换Unknown。"),
            ("active", JsonNode.Parse(pair[TemplateArchive.ListPath(false)])), ("archived", JsonNode.Parse(pair[TemplateArchive.ListPath(true)])));
        ShowText("模板两列表 · 只读核对", copy.ToJsonString(ArticleReadableJson));
        if (currentPage == "常用事项") await TemplateArchiveAsync();
    }
    private async Task<Dictionary<string, string>> ReadTemplateArchiveListsAsync(bool[] archivedLists, bool requireTemplatePage)
    {
        await FlushEditorAsync();
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null) throw new InvalidOperationException("请先连接或登录原工作区并核对身份，再读取模板列表。旧缓存和未决请求保留。");
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        var expectedScope = api.ExpectedScopeId; var epoch = templateArchiveEpoch; var cancellation = NetworkToken;
        if (TemplateArchiveTransportIdentity(expectedScope) != identity) throw new InvalidOperationException("原工作区归属尚未核实，未读取其他身份。");
        var entries = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var archived in archivedLists)
        {
            var path = TemplateArchive.ListPath(archived); var result = await target.ReadRemoteAsync(path, cancellation);
            if (!result.IsSuccess) throw new InvalidOperationException($"模板列表读取失败 HTTP {result.StatusCode}。已读取但未核实完的列表不替换旧缓存，原稿和原请求保留。");
            TemplateArchive.ValidateList(path, result.Json, expectedScope);
            cancellation.ThrowIfCancellationRequested(); EnsureTemplateArchiveOwner(identity, scope, target, workspace);
            if (epoch != templateArchiveEpoch || requireTemplatePage && currentPage != "常用事项") throw new InvalidOperationException("读取期间模板页面已变化，旧缓存保留。");
            var envelope = JsonNode.Parse(result.Json)!.AsObject(); envelope["_local_scope_id"] = scope;
            envelope["_local_template_archive"] = Obj(("query_path", path), ("observed_at_utc", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture)), ("scope_id", scope));
            var cached = envelope.ToJsonString(); TemplateArchive.ValidateList(path, cached, scope); entries.Add(path, cached);
        }
        string returnedScope;
        try { returnedScope = await api.ReadScopeIdAsync(cancellation); }
        catch (ScopeGuardException) { connected = false; throw; }
        cancellation.ThrowIfCancellationRequested(); EnsureTemplateArchiveOwner(identity, scope, target, workspace);
        if (returnedScope != expectedScope || TemplateArchiveTransportIdentity(returnedScope) != identity) connected = false;
        if (returnedScope != expectedScope || TemplateArchiveTransportIdentity(returnedScope) != identity || api.ExpectedScopeId != expectedScope ||
            epoch != templateArchiveEpoch || requireTemplatePage && currentPage != "常用事项") throw new InvalidOperationException("读取期间工作区或模板页面已变化，旧列表和未决请求保留。");
        await target.CacheBatchAsync(entries, cancellation);
        cancellation.ThrowIfCancellationRequested(); EnsureTemplateArchiveOwner(identity, scope, target, workspace);
        if (epoch != templateArchiveEpoch) throw new InvalidOperationException("页面已变化，已核实列表保留在原工作区。");
        return entries;
    }

    private static bool IsTemplateArchiveOperation(PendingOperation operation)
    {
        var parts = operation.Path.Split('/');
        return operation.Method == "POST" && parts.Length == 6 && parts[1] == "api" && parts[2] == "v1" && parts[3] == "todo-templates" && parts[5] is "archive" or "restore";
    }
    private async Task InspectTemplateArchiveOperationAsync(PendingOperation operation)
    {
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var epoch = templateArchiveEpoch;
        var canCancel = operation.CanEditQueued && operation.RecoveredAtRevision == 0;
        var choices = new List<string> { "两列表只读核对", "查看原请求和响应", "导出原请求" };
        if (canCancel) choices.Add("取消尚未发送的操作");
        var choice = Choose("模板归档请求", StatusLabel(operation.Status) + " · " + operation.Path + "\n原模板键：" + operation.ResourceKey +
            "\n归档没有按保存ID查询的精确收据接口。两列表的当前状态不能证明丢失请求已经完成；此处不会自动确认、重排、解除冲突或换标识。", choices.ToArray());
        EnsureTemplateArchiveOwner(identity, scope, target, workspace);
        if (epoch != templateArchiveEpoch) throw new InvalidOperationException("此请求检查器所属工作区或页面已变化，原请求保留。");
        if (choice == "两列表只读核对") await CheckTemplateArchiveListsAsync();
        else if (choice == "查看原请求和响应") ShowText("模板归档原件（只读）", "本机原始意图\n" + operation.BodyJson + "\n\n冻结请求\n" + operation.RequestBodyJson + "\n\n服务器响应\n" + operation.RemoteJson);
        else if (choice == "导出原请求") await ExportTextAsync("好多鱼模板归档原请求.txt", JsonSerializer.Serialize(operation, ArticleReadableJson));
        else if (choice == "取消尚未发送的操作" && canCancel && Confirm("只取消此尚未尝试发送的归档意图？保留原请求历史和草稿，不会发送恢复请求。"))
        {
            var current = Engine.Snapshot.Outbox.Single(item => item.Id == operation.Id);
            if (!current.CanEditQueued || current.RecoveredAtRevision > 0) throw new InvalidOperationException("原请求状态已变化，不能取消或换键；原件保留。");
            await Engine.CancelQueuedAsync(current.Id);
            await NavigateAsync(currentPage); Message("仅取消尚未发送的本机意图，原历史与草稿保留。");
        }
    }

    private static bool TemplateArchiveEffectiveArchived(JsonObject row) => row.ContainsKey("_local_archived") ? Flag(row, "_local_archived") : row["archived_at"] is not null;
    private static string TemplateArchiveRecordKey(JsonObject row)
    {
        var id = Text(row, "id"); if (!Guid.TryParseExact(id, "D", out _)) throw new InvalidDataException("模板标识未核实，原副本保留。");
        return "/api/v1/todo-templates/" + id;
    }
    private static bool TemplateArchiveSafeRecord(JsonObject row)
    {
        if (Flag(row, "_local_incomplete") || Flag(row, "_local_deleted") || Flag(row, "deleted") || row["deleted_at"] is not null) return false;
        var source = (JsonObject)row.DeepClone();
        foreach (var key in source.Select(pair => pair.Key).Where(key => key.StartsWith("_local_", StringComparison.Ordinal) || key == "_operation_id").ToArray()) source.Remove(key);
        try { TemplateArchive.ValidateRecord(source); return source["version"] is JsonValue version && version.TryGetValue<long>(out var number) && number is > 0 and < 9_007_199_254_740_991; }
        catch (Exception error) when (error is InvalidDataException or ArgumentException or InvalidOperationException or JsonException) { return false; }
    }
    private bool TemplateArchiveEditableCreation(JsonObject row)
    {
        if (!Flag(row, "_local_new") || Flag(row, "_local_incomplete") || TemplateArchiveEffectiveArchived(row) ||
            row["version"] is not JsonValue version || !version.TryGetValue<long>(out var number) || number != 0) return false;
        var key = TemplateArchiveRecordKey(row);
        var creation = Engine.Snapshot.Outbox.LastOrDefault(operation => operation.ResourceKey == key && operation.Method == "POST" &&
            operation.Path == "/api/v1/todo-templates" && operation.CanEditQueued);
        if (creation is null) return false;
        var body = JsonNode.Parse(creation.BodyJson) as JsonObject;
        if (body is null || Text(body, "id") != Text(row, "id") || Text(body, "text") != Text(row, "text")) return false;
        try { _ = ApiRequests.CreateTemplate(Text(body, "id"), Text(body, "text")); return true; }
        catch (ArgumentException) { return false; }
    }
    private void EnsureTemplateArchiveOwner(string? identity, string scope, SyncEngine? target = null, AtomicWorkspaceStore? workspace = null)
    {
        if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope || target is not null && !ReferenceEquals(target, engine) || workspace is not null && !ReferenceEquals(workspace, store))
            throw new InvalidOperationException("工作区已变化，此模板资料未用于其他身份。");
    }
    private string TemplateArchiveTransportIdentity(string scope) => api.PublicMode ? "public:" + scope : "user:" + api.UserId + ":" + scope;
    private Button TemplateArchiveButton(string label, string id, Func<Task> action)
    { var button = Button(label, action); AutomationProperties.SetAutomationId(button, id); return button; }
    private sealed class TemplateArchiveDisplayConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => value is JsonObject row ?
            Text(row, "text") + "\n" + (TemplateArchiveEffectiveArchived(row) ? "归档" : "活动") + " · v" + (row.ContainsKey("version") ? Text(row, "version") : "未取得") +
            " · 近30天完成 " + (row.ContainsKey("completed_days") ? Text(row, "completed_days") : "未取得") + " 天 · " + Text(row, "habit_status") + LocalSuffix(row) : "";
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
}
