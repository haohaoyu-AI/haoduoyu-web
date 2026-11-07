using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private long todoNoteEpoch;
    private void ResetTodoNoteView() => todoNoteEpoch = checked(todoNoteEpoch + 1);

    private async Task TodoNoteAsync(JsonObject row)
    {
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        await FlushEditorAsync(); EnsureTodoNoteOwner(identity, scope, target, workspace);
        var id = ApiRequests.Uuid(Text(row, "id")); var draftKey = TodoNotes.DraftKey(id); var resourceKey = TodoNotes.ResourceKey(id);
        var source = TodoNoteReadSafe(row);
        JsonObject? original = null; var values = Obj(("note", source.Note), ("note_known", source.Known));
        LocalDraft? savedDraft = null; string? baselineIssue = null;
        if (target.Snapshot.Drafts.TryGetValue(draftKey, out savedDraft))
        {
            var parsed = TodoNotes.ParseDraft(savedDraft); original = parsed.Original;
            values = (JsonNode.Parse(savedDraft.Text)?["values"] as JsonObject)?.DeepClone().AsObject() ?? throw new InvalidDataException("备注草稿缺少输入，原件保留。");
        }
        else
        {
            try { original = TodoNoteBaseline(row, source); }
            catch (Exception error) when (error is InvalidDataException or ArgumentException or JsonException or InvalidOperationException)
            { baselineIssue = "本机尚无此待办的完整正版本。原创建稿和摘要保留；不能猜版本0、日期或用新标识代替原待办。"; }
        }
        var rawNote = Text(values, "note"); var known = Flag(values, "note_known");
        if (savedDraft is not null && !values.ContainsKey("note_known")) known = true;
        DateOnly? originalDay = original is not null && DateOnly.TryParseExact(Text(original, "date"), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDate)
            ? parsedDate : DateOnly.TryParseExact(Text(row, "date"), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var rowDate) ? rowDate : null;
        var pending = target.Snapshot.Outbox.LastOrDefault(operation => operation.ResourceKey == resourceKey && operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        var privateProfile = TodoNotePrivateProfile();
        var canEdit = privateProfile && original is not null && (savedDraft is not null || pending is null || pending.CanEditQueued && IsTodoNoteOperation(pending));
        var epoch = todoNoteEpoch = checked(todoNoteEpoch + 1);
        void Guard()
        {
            EnsureTodoNoteOwner(identity, scope, target, workspace);
            if (epoch != todoNoteEpoch || currentPage != "待办") throw new InvalidOperationException("此备注页面已变化，请重新打开原待办。");
        }
        if (originalDay is { } day)
        { suppressDate = true; try { date.SelectedDate = day.ToDateTime(TimeOnly.MinValue); } finally { suppressDate = false; } }
        currentPage = "待办"; ClearPage(); heading.Text = canEdit ? "待办备注" : "待办备注 · 只读"; page.Children.Add(heading);
        page.Children.Add(Label("原待办：" + Text(original ?? row, "text") + " · " + (Flag(original ?? row, "completed") ? "已完成" : "未完成") + " · 原日期 " +
            (originalDay?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "未核实") + " · v" + (original?.ContainsKey("version") == true ? Text(original, "version") : "未核实")));
        var sourceLabel = Label("备注来源：" + TodoNoteSourceName(source.Source) + (known ? " · 已有明确文字（含真实空串）" : " · 未取得，不能当作空备注") + LocalSuffix(row));
        AutomationProperties.SetAutomationId(sourceLabel, "todo-note-source"); page.Children.Add(sourceLabel);
        if (!privateProfile) page.Children.Add(Label("公开工作区仅可阅读备注。此接口只支持原管理账号；不会为公开身份排入明知不可写的备注请求。"));
        if (baselineIssue is not null) page.Children.Add(Label(baselineIssue));
        if (savedDraft is not null) page.Children.Add(Label($"继续同一备注草稿 · 原版本 {savedDraft.BaseVersion}。与原待办创建稿分开保存，原稿文字、日期、完成状态和模板关联不会随备注修改。"));
        if (savedDraft?.RecoveredAtRevision > 0) page.Children.Add(Label("此稿来自回退备份，可能遗漏后来已发送的请求。可继续本机输入和导出；保存到服务器前须核对原请求，不能凭当前文字相同新排或重发。"));
        if (pending is not null) page.Children.Add(Label("同一待办仍有原请求：" + StatusLabel(pending.Status) + " · " + pending.Path + "。本机输入可独立保留，排队仍受原资源围栏保护。"));
        page.Children.Add(Label("最多4000个UTF-16字元；空格、TAB、CR和LF原样保留，不自动整理文字。超长或不符合服务器规则的输入可先保存在本机，发送前单独校验。清空输入不会自动发送。"));
        var editor = new TextBox { Text = rawNote, IsReadOnly = !canEdit, AcceptsReturn = true, AcceptsTab = true, TextWrapping = TextWrapping.Wrap,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, MinHeight = 280, Height = 340, MaxHeight = 650 };
        AutomationProperties.SetAutomationId(editor, "todo-note-text"); page.Children.Add(editor);
        var count = Label("当前输入 " + rawNote.Length.ToString(CultureInfo.InvariantCulture) + " / 4000 UTF-16字元");
        AutomationProperties.SetAutomationId(count, "todo-note-count"); page.Children.Add(count);
        var changed = 0; var suppressInput = false;
        void Changed()
        {
            changed++; draftDirty = true; count.Text = "当前输入 " + rawNote.Length.ToString(CultureInfo.InvariantCulture) + " / 4000 UTF-16字元";
            draftTimer.Stop(); draftTimer.Start();
        }
        editor.TextChanged += (_, _) =>
        {
            // Initial WPF presentation may normalize line separators. Only adopt input after
            // the actual editor is loaded; untouched saves retain the source string above.
            if (!canEdit || suppressInput || !editor.IsLoaded) return;
            rawNote = editor.Text; known = true; Changed();
        };
        void SetInput(string note, bool isKnown)
        { suppressInput = true; try { editor.Text = note; } finally { suppressInput = false; } rawNote = note; known = isKnown; Changed(); }
        if (canEdit)
        {
            saveEditor = async () =>
            {
                Guard(); var generation = changed;
                // Never let JSON serialization replace an unpaired surrogate with U+FFFD.
                _ = new UTF8Encoding(false, true).GetByteCount(rawNote);
                var input = (JsonObject)values.DeepClone(); input["note"] = rawNote; input["note_known"] = known;
                var payload = Obj(("kind", "todo-note"), ("key", draftKey), ("original", original!.DeepClone()), ("values", input));
                TodoNoteValidateLocalStrings(payload);
                var candidate = new LocalDraft { Key = draftKey, Text = payload.ToJsonString(), BaseVersion = Version(original),
                    BaselineConfirmedRevision = savedDraft?.BaselineConfirmedRevision ?? 0, Title = "待办备注 · " + TodoNoteShort(Text(original, "text"), 50) };
                _ = TodoNotes.ParseDraft(candidate); await SaveLocalDraftAsync(candidate);
                draftDirty = generation != changed;
                if (draftDirty) { draftTimer.Stop(); draftTimer.Start(); }
            };
        }
        var buttons = new WrapPanel(); page.Children.Add(buttons);
        Button? restoreClear = null;
        if (canEdit)
        {
            buttons.Children.Add(TodoNoteButton("保存本机备注草稿", "todo-note-save-local", async () => { Guard(); draftDirty = true; await SaveDraftSafelyAsync(); }));
            buttons.Children.Add(TodoNoteButton(connected ? "保存备注并同步" : "备注存入待同步队列", "todo-note-save-queue", async () =>
            {
                Guard(); draftDirty = true; await SaveDraftSafelyAsync(); Guard();
                if (!known) throw new InvalidOperationException("原副本未取得备注。请实际填写或明确点击清空输入，未取得不能当作空备注发送。");
                if (rawNote.Length == 0 && !Confirm("将此待办的服务器备注清空？待办正文、日期和完成状态不变；原版本、清空前输入及请求历史保留。")) return;
                await QueueTodoNoteDraftAsync(draftKey);
            }));
            buttons.Children.Add(TodoNoteButton("清空本机备注输入", "todo-note-clear", async () =>
            {
                Guard(); _ = new UTF8Encoding(false, true).GetByteCount(rawNote);
                if (!values.ContainsKey("note_before_clear") || rawNote.Length > 0)
                { values["note_before_clear"] = rawNote; values["note_known_before_clear"] = known; }
                SetInput("", true); await SaveDraftSafelyAsync();
                if (restoreClear is not null) restoreClear.IsEnabled = true;
                Message("已明确清空本机输入，尚未发送；可恢复清空前输入或单独排队清空服务器备注。");
            }));
            restoreClear = TodoNoteButton("恢复清空前输入", "todo-note-restore-clear", async () =>
            { Guard(); if (!values.ContainsKey("note_before_clear")) return; SetInput(Text(values, "note_before_clear"), !values.ContainsKey("note_known_before_clear") || Flag(values, "note_known_before_clear")); await SaveDraftSafelyAsync(); });
            restoreClear.IsEnabled = values["note_before_clear"] is JsonValue previous && previous.TryGetValue<string>(out _); buttons.Children.Add(restoreClear);
        }
        buttons.Children.Add(TodoNoteButton("导出原文与当前备注副本", "todo-note-export", () =>
        {
            Guard(); _ = new UTF8Encoding(false, true).GetByteCount(rawNote);
            return ExportTextAsync("好多鱼待办备注.txt", Obj(("source", "原日期待办与当前本机备注输入的只读副本；不是原始备份，不能导入或重放。链接只作文字。"),
                ("resource_key", resourceKey), ("draft_key", draftKey), ("original", original?.DeepClone() ?? row.DeepClone()), ("current_note", rawNote), ("note_known", known)).ToJsonString(ArticleReadableJson));
        }));
        if (originalDay is { } checkDay) buttons.Children.Add(TodoNoteButton("只读核对原日期", "todo-note-check-date", () => { Guard(); return CheckTodoNoteDateAsync(checkDay, id); }));
        if (pending is not null) buttons.Children.Add(TodoNoteButton("查看原待同步请求", "todo-note-pending", async () => { Guard(); await InspectOperationAsync(pending); }));
        buttons.Children.Add(TodoNoteButton("返回原日期待办", "todo-note-back", async () =>
        { Guard(); if (originalDay is not { } backDay) throw new InvalidOperationException("原日期未核实，不能猜测今天。"); await FlushEditorAsync(); suppressDate = true; try { date.SelectedDate = backDay.ToDateTime(TimeOnly.MinValue); } finally { suppressDate = false; } await NavigateAsync("待办"); }));
        if (canEdit) { draftDirty = true; await saveEditor!(); }
    }

    private async Task ContinueTodoNoteDraftAsync(string key)
    {
        if (!Engine.Snapshot.Drafts.TryGetValue(key, out var draft)) throw new InvalidOperationException("此备注草稿已变化，原件保留。");
        var parsed = TodoNotes.ParseDraft(draft);
        await TodoNoteAsync(parsed.Original);
    }

    private async Task QueueTodoNoteDraftAsync(string key)
    {
        if (!TodoNotePrivateProfile()) throw new InvalidOperationException("公开身份不可排队或发送私有待办备注；未发出HTTP，原本机工作保留。");
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var epoch = todoNoteEpoch;
        await FlushEditorAsync(); EnsureTodoNoteOwner(identity, scope, target, workspace);
        if (epoch != todoNoteEpoch) throw new InvalidOperationException("备注页面已变化，未将旧页面输入排到其他工作区。");
        if (!target.Snapshot.Drafts.TryGetValue(key, out var saved)) throw new InvalidOperationException("请先保存同一待办的备注草稿，不能从摘要创建请求。");
        var draft = TodoNotes.ParseDraft(saved); var day = draft.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var existing = target.Snapshot.Outbox.LastOrDefault(operation => operation.ResourceKey == draft.ResourceKey && operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        if (existing is not null && (!existing.CanEditQueued || !IsTodoNoteOperation(existing) || existing.RecoveredAtRevision > 0 || existing.TodoNoteDate != day))
        { await InspectOperationAsync(existing); return; }
        if (saved.RecoveredAtRevision > 0)
            throw new InvalidOperationException("此备注稿来自回退备份，可能缺少后来请求。原输入可继续和导出；请只读核对原日期与原请求，不能新建保存ID绕开未知结果。");
        if (!draft.NoteKnown) throw new InvalidOperationException("原副本没有取得备注，空输入不代表明确清空。请实际填写或点击清空本机输入后再排队。");
        var command = ApiRequests.TodoNote(draft.Id, draft.BaseVersion, draft.Note);
        var body = command.Body;
        if (existing is not null)
        {
            var old = JsonNode.Parse(existing.BodyJson) as JsonObject;
            if (old is null || old["note"] is not JsonValue oldNote || !oldNote.TryGetValue<string>(out _) ||
                old["version"] is JsonValue oldVersion && (!oldVersion.TryGetValue<long>(out var version) || version != draft.BaseVersion))
                throw new InvalidDataException("原未发送备注请求的版本或文字无法核实，原件保留。");
            if (existing.VersionFromDependencyId is not null) body.Remove("version");
            if (JsonNode.DeepEquals(old, body)) { Message("相同备注已在原请求中等待同步，保留原请求ID与字节，未重复排队。"); return; }
        }
        if (connected && (api.PublicMode || TodoNoteTransportIdentity(api.ExpectedScopeId ?? "") != identity))
            throw new InvalidOperationException("当前在线身份不是此备注的原管理账号。原草稿保留，请先使用原账号核对工作区。");
        NetworkToken.ThrowIfCancellationRequested(); EnsureTodoNoteOwner(identity, scope, target, workspace);
        if (epoch != todoNoteEpoch) throw new InvalidOperationException("备注页面已变化，未排入旧页面请求。");
        await QueuePreparedAsync(new PendingOperation { Method = command.Method, Path = command.Path, BodyJson = body.ToJsonString(), ResourceKey = draft.ResourceKey,
            TodoNoteDate = day, DependencyIds = existing?.DependencyIds ?? [], VersionFromDependencyId = existing?.VersionFromDependencyId });
        EnsureTodoNoteOwner(identity, scope, target, workspace);
        if (connected) await SyncToPageAsync("待办"); else { await NavigateAsync("待办"); Message("备注已按原UUID、日期和版本保存到同一待办的队列；未发送到其他身份。"); }
    }

    private async Task RebaseTodoNoteDraftsAsync()
    {
        var target = Engine; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var state = target.Snapshot;
        foreach (var saved in state.Drafts.Values.Where(draft => draft.Key.StartsWith("/local/todo-note/", StringComparison.Ordinal)).ToArray())
        {
            var current = saved;
            TodoNoteDraft draft;
            try { draft = TodoNotes.ParseDraft(saved); }
            catch (Exception error) when (error is InvalidDataException or ArgumentException or JsonException or InvalidOperationException) { continue; }
            var receipt = state.Outbox.Where(operation => operation.Status == PendingStatus.Confirmed && IsTodoNoteOperation(operation) && operation.Path == TodoNotes.Path(draft.Id) &&
                operation.ResourceKey == draft.ResourceKey && operation.TodoNoteDate == draft.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) &&
                operation.ConfirmedRevision > saved.BaselineConfirmedRevision && operation.RemoteJson is not null).OrderBy(operation => operation.ConfirmedRevision).ToArray();
            foreach (var operation in receipt)
            {
                JsonObject? baseline = null;
                try
                {
                    var body = JsonNode.Parse(operation.RequestBodyJson) as JsonObject; var remote = Data(operation.RemoteJson!) as JsonObject;
                    if (body is null || body.Count != 2 || body["note"] is not JsonValue note || !note.TryGetValue<string>(out var requested) ||
                        body["version"] is not JsonValue version || !version.TryGetValue<long>(out var requestedVersion) || requestedVersion != draft.BaseVersion || remote is null) continue;
                    _ = TodoNotes.ValidateText(requested); TodoNotes.ValidateRecord(remote, draft.Id, draft.Date);
                    if (Version(remote) != requestedVersion + 1 || remote.ContainsKey("note") && Text(remote, "note") != requested || !remote.ContainsKey("note") && requested.Length != 0) continue;
                    baseline = (JsonObject)remote.DeepClone(); if (requested.Length == 0 && !baseline.ContainsKey("note")) baseline["note"] = "";
                }
                catch (Exception error) when (error is InvalidDataException or ArgumentException or JsonException or InvalidOperationException or OverflowException) { /* Retain the original baseline and all unsent values. */ }
                if (baseline is null) continue;
                var wrapper = JsonNode.Parse(current.Text)!.AsObject(); wrapper["original"] = baseline;
                EnsureTodoNoteOwner(identity, scope, target);
                current = current with { Text = wrapper.ToJsonString(), BaseVersion = Version(baseline), BaselineConfirmedRevision = operation.ConfirmedRevision };
                await SaveLocalDraftAsync(current);
                draft = TodoNotes.ParseDraft(current);
            }
        }
    }

    private static bool IsTodoNoteOperation(PendingOperation operation)
    { var parts = operation.Path.Split('/'); return operation.Method == "PATCH" && parts.Length == 6 && parts[1] == "api" && parts[2] == "v1" && parts[3] == "todos" && parts[5] == "note"; }
    private async Task InspectTodoNoteOperationAsync(PendingOperation operation)
    {
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var epoch = todoNoteEpoch;
        var canCancel = operation.CanEditQueued && operation.RecoveredAtRevision == 0;
        var canRetry = CanRetryBlockedTodoNote(operation) && TodoNotePrivateProfile();
        var options = new List<string> { "只读核对原日期", "查看原请求和响应", "导出原请求" }; if (canCancel) options.Add("取消尚未发送的操作");
        if (canRetry) options.Add("核对后重试同一备注请求");
        var choice = Choose("待办备注请求", StatusLabel(operation.Status) + " · " + operation.Path + "\n原日期：" + (operation.TodoNoteDate ?? "未核实") +
            "\n此动作没有按保存ID查询的精确收据。当前备注相同不证明丢失请求已提交；不会自动确认、重试、换键或解除冲突。" +
            (canRetry ? "明确受阻且不来自回退备份的原请求，可重新登录原账号并核对后，由你确认保持同一请求重新排队。" : ""), options.ToArray());
        EnsureTodoNoteOwner(identity, scope, target, workspace); if (epoch != todoNoteEpoch) throw new InvalidOperationException("此备注请求检查器已变化，原件保留。");
        if (choice == "只读核对原日期")
        {
            if (!DateOnly.TryParseExact(operation.TodoNoteDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) throw new InvalidDataException("原请求缺少可核实日期，不能猜今天或读取其他日期。");
            var id = operation.Path.Split('/')[4]; await CheckTodoNoteDateAsync(day, id);
        }
        else if (choice == "查看原请求和响应") ShowText("待办备注原件（只读）", "原请求\n" + operation.BodyJson + "\n\n冻结请求\n" + operation.RequestBodyJson + "\n\n原日期元数据\n" + operation.TodoNoteDate + "\n\n响应\n" + operation.RemoteJson);
        else if (choice == "导出原请求") await ExportTextAsync("好多鱼待办备注原请求.txt", JsonSerializer.Serialize(operation, ArticleReadableJson));
        else if (choice == "核对后重试同一备注请求" && canRetry) await PrepareBlockedTodoNoteRetryAsync(operation);
        else if (choice == "取消尚未发送的操作" && canCancel && Confirm("仅取消尚未尝试发送的本机备注请求？保留原始历史与独立备注稿，不发送任何服务器动作。"))
        {
            var current = target.Snapshot.Outbox.Single(item => item.Id == operation.Id);
            if (!current.CanEditQueued || current.RecoveredAtRevision > 0) throw new InvalidOperationException("原请求状态已变化，不能取消或替换。");
            EnsureTodoNoteOwner(identity, scope, target, workspace);
            await target.CancelQueuedAsync(current.Id); await NavigateAsync(currentPage);
        }
    }

    private async Task CheckTodoNoteDateAsync(DateOnly day, string id)
    {
        var envelope = await ReadTodoNoteDateSourceAsync(day, id);
        ShowTodoNoteDateCopy(envelope, day, id);
    }

    private async Task<JsonObject> ReadTodoNoteDateSourceAsync(DateOnly day, string id)
    {
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var epoch = todoNoteEpoch; var cancellation = NetworkToken;
        await FlushEditorAsync(); EnsureTodoNoteOwner(identity, scope, target, workspace); id = ApiRequests.Uuid(id);
        if (epoch != todoNoteEpoch) throw new InvalidOperationException("备注页面已变化，未读取旧页面的其他日期。");
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null) throw new InvalidOperationException("请先使用原身份连接工作区，再只读核对原日期。原稿和请求保留。");
        var expectedScope = api.ExpectedScopeId;
        if (TodoNoteTransportIdentity(expectedScope) != identity) throw new InvalidOperationException("原工作区身份尚未核实，未读取其他身份的待办。");
        var path = "/api/v1/todos?date=" + day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        var result = await target.ReadRemoteAsync(path, cancellation);
        if (!result.IsSuccess) throw new InvalidOperationException($"原日期读取失败 HTTP {result.StatusCode}。原缓存、草稿与请求保留。");
        TodoNotes.ValidateList(path, result.Json, expectedScope);
        string returnedScope;
        try { returnedScope = await api.ReadScopeIdAsync(cancellation); }
        catch (ScopeGuardException) { connected = false; throw; }
        cancellation.ThrowIfCancellationRequested(); EnsureTodoNoteOwner(identity, scope, target, workspace);
        if (returnedScope != expectedScope || TodoNoteTransportIdentity(returnedScope) != identity) connected = false;
        if (returnedScope != expectedScope || TodoNoteTransportIdentity(returnedScope) != identity || api.ExpectedScopeId != expectedScope || epoch != todoNoteEpoch)
            throw new InvalidOperationException("读取期间工作区或备注页面已变化，旧缓存与原请求保留。");
        var envelope = JsonNode.Parse(result.Json)!.AsObject(); envelope["_local_scope_id"] = scope; var cached = envelope.ToJsonString(); TodoNotes.ValidateList(path, cached, scope);
        await target.CacheBatchAsync(new Dictionary<string, string> { [path] = cached }, cancellation);
        EnsureTodoNoteOwner(identity, scope, target, workspace); if (epoch != todoNoteEpoch) throw new InvalidOperationException("页面已变化，已核实副本保留在原日期。");
        return envelope;
    }
    private void ShowTodoNoteDateCopy(JsonObject envelope, DateOnly day, string id)
    {
        var found = Rows(envelope["data"]?["items"]).SingleOrDefault(row => string.Equals(Text(row, "id"), id, StringComparison.OrdinalIgnoreCase));
        ShowText("待办备注原日期 · 只读核对", Obj(("source", "只读取得原日期列表；不是精确保存收据。当前备注相同或记录缺席均不确认Unknown、不重排、不换键、不清除冲突。"),
            ("date", day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("todo_id", id), ("found_in_this_response", found is not null),
            ("observed_at_utc", DateTimeOffset.UtcNow.ToString("O", CultureInfo.InvariantCulture)), ("original_response", envelope)).ToJsonString(ArticleReadableJson));
    }

    private async Task PrepareBlockedTodoNoteRetryAsync(PendingOperation operation)
    {
        var target = Engine; var workspace = store; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var epoch = todoNoteEpoch;
        if (!TodoNotePrivateProfile() || !connected || api.PublicMode || TodoNoteTransportIdentity(api.ExpectedScopeId ?? "") != identity)
            throw new InvalidOperationException("请先使用此备注的原管理账号重新登录并连接，才能核对受阻原请求。");
        if (!CanRetryBlockedTodoNote(operation) ||
            !DateOnly.TryParseExact(operation.TodoNoteDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            throw new InvalidOperationException("只有非恢复、明确受阻且日期已核实的备注原请求可进入此流程。Unknown和冲突不能重排。");
        var id = ApiRequests.Uuid(operation.Path.Split('/')[4]); var envelope = await ReadTodoNoteDateSourceAsync(day, id);
        var found = Rows(envelope["data"]?["items"]).SingleOrDefault(row => string.Equals(Text(row, "id"), id, StringComparison.OrdinalIgnoreCase));
        if (found is null) throw new InvalidOperationException("原日期未读取到完整待办，原请求保留，不能猜测已删除或重新创建。");
        TodoNotes.ValidateRecord(found, id, day); ShowTodoNoteDateCopy(envelope, day, id);
        EnsureTodoNoteOwner(identity, scope, target, workspace);
        if (epoch != todoNoteEpoch) throw new InvalidOperationException("核对期间工作区或页面已变化，原请求保留。");
        if (Confirm("已只读核对原日期。保持原请求ID、正文、版本和日期重新排队？不会采用当前文字作收据，不会自动发送；服务端仍按原版本检查。"))
        {
            EnsureTodoNoteOwner(identity, scope, target, workspace);
            if (epoch != todoNoteEpoch) throw new InvalidOperationException("备注请求页面已变化，未将旧请求排到其他工作区。");
            await RetryBlockedTodoNoteAfterCheckAsync(operation.Id, envelope.ToJsonString());
        }
    }
    private async Task RetryBlockedTodoNoteAfterCheckAsync(string operationId, string checkedDateJson)
    {
        if (!TodoNotePrivateProfile() || !connected || api.PublicMode || TodoNoteTransportIdentity(api.ExpectedScopeId ?? "") != currentIdentity)
            throw new InvalidOperationException("请先使用原管理账号连接此工作区，原请求保持不变。");
        var target = Engine; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        var operation = target.Snapshot.Outbox.Single(item => item.Id == operationId);
        if (!CanRetryBlockedTodoNote(operation) ||
            !DateOnly.TryParseExact(operation.TodoNoteDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            throw new InvalidOperationException("Unknown、冲突或恢复请求不能通过受阻重排流程放行。");
        var id = ApiRequests.Uuid(operation.Path.Split('/')[4]); var path = "/api/v1/todos?date=" + day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        TodoNotes.ValidateList(path, checkedDateJson, scope);
        var row = Rows(JsonNode.Parse(checkedDateJson)?["data"]?["items"]).SingleOrDefault(item => string.Equals(Text(item, "id"), id, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidDataException("核对来源缺少原待办，不能以缺席猜测原请求状态。");
        TodoNotes.ValidateRecord(row, id, day); EnsureTodoNoteOwner(identity, scope, target);
        await target.RetryUnchangedAsync(operation.Id, Obj(("data", row.DeepClone()), ("_local_scope_id", scope)).ToJsonString(), NetworkToken);
        Message("仅将同一受阻原请求重新排队，原ID、正文、版本与日期保持；尚未自动发送，请显式同步。");
    }
    private static bool CanRetryBlockedTodoNote(PendingOperation operation)
    {
        if (!IsTodoNoteOperation(operation) || operation.Status != PendingStatus.Blocked || operation.RecoveredAtRevision > 0 || operation.RemoteJson is not null ||
            !DateOnly.TryParseExact(operation.TodoNoteDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return false;
        try
        {
            var id = ApiRequests.Uuid(operation.Path.Split('/')[4]);
            if (operation.Path != TodoNotes.Path(id) || operation.ResourceKey != TodoNotes.ResourceKey(id)) return false;
            var body = JsonNode.Parse(operation.RequestBodyJson) as JsonObject;
            if (body?["note"] is not JsonValue note || !note.TryGetValue<string>(out var value)) return false;
            _ = TodoNotes.ValidateText(value);
            if (body["version"] is JsonValue version && version.TryGetValue<long>(out var number))
                return body.Count == 2 && number is > 0 and < 9_007_199_254_740_991;
            return body.Count == 1 && operation.PreparedBodyJson is null && operation.VersionFromDependencyId is { } dependency && operation.DependencyIds.Contains(dependency, StringComparer.Ordinal);
        }
        catch (Exception error) when (error is InvalidDataException or ArgumentException or JsonException or InvalidOperationException) { return false; }
    }

    private bool TodoNotePrivateProfile() => currentIdentity is not null && OfflineProfiles.Get(settings, currentIdentity) is { IsPublic: false } profile &&
        currentIdentity == "user:" + profile.UserId + ":" + profile.Scope;
    private string TodoNoteTransportIdentity(string scope) => api.PublicMode ? "public:" + scope : "user:" + api.UserId + ":" + scope;
    private void EnsureTodoNoteOwner(string? identity, string scope, SyncEngine? target = null, AtomicWorkspaceStore? workspace = null)
    { if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope || target is not null && !ReferenceEquals(target, engine) || workspace is not null && !ReferenceEquals(workspace, store)) throw new InvalidOperationException("工作区已变化，此备注未用于其他身份。"); }
    private static TodoNoteValue TodoNoteReadSafe(JsonObject row)
    { try { return TodoNotes.ReadNote(row); } catch (Exception error) when (error is InvalidDataException or ArgumentException or InvalidOperationException) { return new("", false, "unknown", null, false); } }
    private static JsonObject TodoNoteBaseline(JsonObject row, TodoNoteValue note)
    {
        if (Flag(row, "_local_incomplete") || Flag(row, "_local_deleted")) throw new InvalidDataException("待办只有摘要或删除意图。");
        var baseline = row["_local_remote"] is JsonObject remote ? (JsonObject)remote.DeepClone() : (JsonObject)row.DeepClone();
        foreach (var key in baseline.Select(pair => pair.Key).Where(key => key.StartsWith("_local_", StringComparison.Ordinal) || key == "_operation_id").ToArray()) baseline.Remove(key);
        if (note.Source == "confirmed-clear" && note.Known && note.Note.Length == 0) baseline["note"] = "";
        TodoNotes.ValidateRecord(baseline, Text(row, "id")); return baseline;
    }
    private static string TodoNotePreview(JsonObject row)
    {
        var note = TodoNoteReadSafe(row); return !note.Known ? "备注未取得" : note.Note.Length == 0 ? "备注：已核实为空 · " + TodoNoteSourceName(note.Source) : "备注：" + TodoNoteShort(note.Note, 100) + " · " + TodoNoteSourceName(note.Source);
    }
    private static string TodoNoteShort(string value, int limit) => string.Concat(value.EnumerateRunes().Take(limit).Select(rune => rune.ToString())).Replace('\r', ' ').Replace('\n', ' ');
    private static void TodoNoteValidateLocalStrings(JsonNode? node)
    {
        if (node is JsonValue value && value.TryGetValue<string>(out var text)) _ = new UTF8Encoding(false, true).GetByteCount(text);
        else if (node is JsonObject obj) foreach (var child in obj) TodoNoteValidateLocalStrings(child.Value);
        else if (node is JsonArray array) foreach (var child in array) TodoNoteValidateLocalStrings(child);
    }
    private static string TodoNoteSourceName(string source) => source switch { "unknown" => "未取得", "cached" => "本机已读来源", "local-intent" => "本机未确认意图", "confirmed" => "已核实保存响应", "confirmed-clear" => "已核实清空响应", _ => source };
    private Button TodoNoteButton(string label, string id, Func<Task> action)
    { var button = Button(label, action); AutomationProperties.SetAutomationId(button, id); return button; }
}
