using System.Text.Json;
using System.Globalization;
using System.Text.Json.Nodes;

namespace Haoduoyu.Core;

public sealed record SyncReport(int Confirmed, int Conflicts, int Blocked, int Unknown, int Queued);

public sealed class SyncEngine
{
    private readonly IWorkspaceStore store;
    private readonly IRemoteApi api;
    private readonly SemaphoreSlim stateGate = new(1, 1);
    private readonly SemaphoreSlim syncGate = new(1, 1);
    private WorkspaceState? state;

    public SyncEngine(IWorkspaceStore store, IRemoteApi api)
    {
        this.store = store;
        this.api = api;
    }

    // Every outward snapshot is detached; UI edits cannot mutate durable engine state.
    public WorkspaceState Snapshot => WorkspaceJson.Clone(state ?? throw new InvalidOperationException("工作区尚未打开。"));

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await stateGate.WaitAsync(cancellationToken);
        try
        {
            if (state != null) return;
            var loaded = await store.LoadAsync(cancellationToken);
            if (loaded.ScopeId != store.ScopeId || loaded.Schema is not (1 or 2))
                throw new InvalidDataException("本机工作区身份或版本不匹配。");
            OperationGraph.Validate(loaded);
            if (loaded.Outbox.Any(x => x.Status == PendingStatus.InFlight))
            {
                loaded = loaded with { LocalRevision = checked(loaded.LocalRevision + 1), Outbox = loaded.Outbox.Select(x => x.Status == PendingStatus.InFlight
                    ? x with { Status = PendingStatus.Unknown, Error = "上次退出时请求未确认。先核对远端，再处理原请求。" } : x).ToList() };
                await store.SaveAsync(loaded, cancellationToken);
            }
            state = WorkspaceJson.Clone(loaded);
        }
        finally { stateGate.Release(); }
    }

    public Task SaveDraftAsync(LocalDraft draft, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(draft);
        if (string.IsNullOrWhiteSpace(draft.Key) || draft.BaseVersion < 0 || draft.BaselineConfirmedRevision < 0 || draft.RecoveredAtRevision < 0)
            throw new ArgumentException("草稿标识或基线版本无效。");
        return MutateAsync(s => s.Drafts[draft.Key] = draft with
        {
            RecoveredAtRevision = Math.Max(draft.RecoveredAtRevision,
                s.Drafts.TryGetValue(draft.Key, out var existing) ? existing.RecoveredAtRevision : 0)
        }, cancellationToken);
    }

    public Task RemoveDraftAsync(string key, CancellationToken cancellationToken = default) =>
        MutateAsync(s => s.Drafts.Remove(key), cancellationToken);

    public Task CacheAsync(string key, string json, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("缓存标识不能为空。", nameof(key));
        ParseJson(json);
        return MutateAsync(s => { s.Cache[key] = json; s.CacheRevisions[key] = s.LocalRevision; }, cancellationToken);
    }

    public Task CacheBatchAsync(IReadOnlyDictionary<string, string> entries, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(entries);
        var captured = entries.ToArray();
        foreach (var (key, value) in captured)
        {
            if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("缓存标识不能为空。", nameof(entries));
            ParseJson(value);
        }
        return MutateAsync(s =>
        {
            foreach (var (key, value) in captured) { s.Cache[key] = value; s.CacheRevisions[key] = s.LocalRevision; }
        }, cancellationToken);
    }

    public HistoryArchivePlan CreateHistoryArchivePlan(int maxOperations = 500, int maxBytes = 4 * 1024 * 1024) =>
        HistoryArchivePolicy.Plan(Snapshot, maxOperations, maxBytes);

    public async Task<HistoryArchiveReference?> ArchiveSupersededHistoryAsync(HistoryArchivePlan plan, IHistoryArchiveStore archiveStore,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(plan);
        ArgumentNullException.ThrowIfNull(archiveStore);
        await stateGate.WaitAsync(cancellationToken);
        try
        {
            var current = Snapshot;
            if (plan.ScopeId != current.ScopeId || archiveStore.ScopeId != current.ScopeId || plan.BaseRevision != current.LocalRevision)
                throw new InvalidOperationException("工作区或本机序列已变化，请重新预览历史归档。");
            var fresh = HistoryArchivePolicy.Plan(current, plan.MaxOperations, plan.MaxBytes);
            if (plan.CandidateIds == null || plan.RetainedReasons == null || plan.EncodedBytes != fresh.EncodedBytes ||
                !plan.CandidateIds.SequenceEqual(fresh.CandidateIds, StringComparer.Ordinal) ||
                plan.RetainedReasons.Count != fresh.RetainedReasons.Count ||
                fresh.RetainedReasons.Any(reason => !plan.RetainedReasons.TryGetValue(reason.Key, out var count) || count != reason.Value))
                throw new InvalidOperationException("历史归档计划与当前原记录不一致，请重新预览。");
            if (fresh.CandidateIds.Count == 0) return null;
            var ids = fresh.CandidateIds.ToHashSet(StringComparer.Ordinal);
            string archiveId;
            do { archiveId = Guid.NewGuid().ToString("D"); }
            while (current.Outbox.Any(operation => operation.Id == archiveId) || current.ArchivedOperationIds.ContainsKey(archiveId) ||
                current.HistoryArchives.Any(reference => reference.Id == archiveId));
            var document = new HistoryArchiveDocument
            {
                Id = archiveId, ScopeId = current.ScopeId, CreatedAt = DateTimeOffset.UtcNow, SourceRevision = current.LocalRevision,
                Operations = current.Outbox.Where(operation => ids.Contains(operation.Id))
                    .Select(operation => operation with { DependencyIds = operation.DependencyIds.ToArray() }).ToArray()
            };
            // Keep the expected original bytes independent of a store implementation's returned objects.
            var expected = JsonSerializer.SerializeToUtf8Bytes(document, WorkspaceJson.Options);
            var reference = await archiveStore.WriteAsync(document, cancellationToken);
            HistoryArchiveValidation.Reference(reference);
            if (reference.Id != document.Id || reference.Count != document.Operations.Count || reference.CreatedAt != document.CreatedAt)
                throw new InvalidDataException("历史归档写入引用与原文不一致；活动记录未移除。");
            var readback = await archiveStore.ReadAsync(reference, cancellationToken);
            if (readback == null || !JsonSerializer.SerializeToUtf8Bytes(readback, WorkspaceJson.Options).AsSpan().SequenceEqual(expected))
                throw new InvalidDataException("历史归档回读与原始逐字段内容不一致；活动记录未移除。");
            cancellationToken.ThrowIfCancellationRequested();
            // Old clients reject schema 2 instead of silently dropping the archived-ID ledger on their next save.
            var next = WorkspaceJson.Clone(current) with { Schema = 2, LocalRevision = checked(current.LocalRevision + 1) };
            next.Outbox.RemoveAll(operation => ids.Contains(operation.Id));
            next.HistoryArchives.Add(reference);
            foreach (var id in ids) next.ArchivedOperationIds.Add(Guid.Parse(id).ToString("D"), reference.Id);
            OperationGraph.Validate(next);
            await store.SaveAsync(next, cancellationToken);
            state = next;
            return reference;
        }
        finally { stateGate.Release(); }
    }

    public Task CancelQueuedAsync(string operationId, CancellationToken cancellationToken = default) =>
        MutateAsync(s =>
        {
            var index = FindQueued(s, operationId);
            s.Outbox[index] = s.Outbox[index] with { Status = PendingStatus.Superseded,
                SupersededById = null, Error = "已明确取消尚未发出的操作；原请求保留。依赖它的操作仍需处理。" };
        }, cancellationToken);

    public Task ReplaceQueuedAsync(string operationId, PendingOperation replacement, CancellationToken cancellationToken = default)
    {
        Validate(replacement);
        return MutateAsync(s =>
        {
            var index = FindQueued(s, operationId); var original = s.Outbox[index];
            if (replacement.Id == original.Id || s.Outbox.Any(x => x.Id == replacement.Id) || replacement.ResourceKey != original.ResourceKey ||
                replacement.Method != original.Method || replacement.Path != original.Path || IsTodoNoteAction(original) && replacement.TodoNoteDate != original.TodoNoteDate)
                throw new InvalidOperationException("替换未发送操作必须使用同一资源、方法、路径与新的操作标识。");
            s.Outbox[index] = original with { Status = PendingStatus.Superseded,
                SupersededById = replacement.Id, Error = "已明确替换未发送操作；原请求完整保留。" };
            AddOperation(s, replacement);
        }, cancellationToken);
    }

    public Task QueueAsync(PendingOperation operation, CancellationToken cancellationToken = default)
    {
        Validate(operation);
        return MutateAsync(s => AddOperation(s, operation), cancellationToken);
    }

    public async Task<SyncReport> SyncAsync(CancellationToken cancellationToken = default)
    {
        await syncGate.WaitAsync(cancellationToken);
        var confirmed = 0;
        var conflicts = 0;
        var blocked = 0;
        var unknown = 0;
        try
        {
            // Freeze this run's eligible set. New user work belongs to the next explicit sync.
            var remaining = Snapshot.Outbox.Where(x => x.Status == PendingStatus.Queued).Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
            while (remaining.Count > 0)
            {
                var snapshot = Snapshot;
                var id = snapshot.Outbox.FirstOrDefault(x => remaining.Contains(x.Id) &&
                    x.Status == PendingStatus.Queued && OperationGraph.DependenciesConfirmed(snapshot, x))?.Id;
                if (id == null) break; // Parent conflicts, cancellation or unknown results leave children queued.
                remaining.Remove(id);
                cancellationToken.ThrowIfCancellationRequested();
                PendingOperation? sending = null;
                var preparationBlocked = false;
                await MutateAsync(s =>
                {
                    var index = s.Outbox.FindIndex(x => x.Id == id && x.Status == PendingStatus.Queued);
                    if (index < 0 || !OperationGraph.DependenciesConfirmed(s, s.Outbox[index])) return;
                    var candidate = s.Outbox[index];
                    try
                    {
                        if (IsTodoNoteAction(candidate)) ValidateTodoNoteOperation(candidate);
                        if (candidate.VersionFromDependencyId != null && candidate.PreparedBodyJson == null)
                            candidate = candidate with { PreparedBodyJson = PrepareVersionBody(s, candidate) };
                    }
                    catch (InvalidDataException error)
                    {
                        preparationBlocked = true;
                        s.Outbox[index] = candidate with { Status = PendingStatus.Blocked, Error = error.Message };
                        return;
                    }
                    sending = candidate with { Status = PendingStatus.InFlight, Error = null, SendAttempts = checked(candidate.SendAttempts + 1) };
                    s.Outbox[index] = sending;
                }, cancellationToken);
                if (sending == null) { if (preparationBlocked) blocked++; continue; }
                ApiResult? response = null;
                string? failure = null;
                var definitelyNotSent = false;
                var invalidTodoNoteReceipt = false;
                try
                {
                    response = await api.SendAsync(sending.Method, sending.Path, sending.RequestBodyJson, sending.Id, cancellationToken);
                    if (response.IsSuccess && IsTodoNoteAction(sending))
                    {
                        try { ValidateTodoNoteReceipt(sending, response.Json, store.ScopeId); }
                        catch (InvalidDataException)
                        { invalidTodoNoteReceipt = true; failure = "待办备注成功响应与原标识、日期、版本或原文不一致；结果尚未确认，原请求和草稿保留。"; }
                    }
                }
                catch (RequestNotSentException error)
                {
                    definitelyNotSent = true;
                    failure = error.Message;
                }
                catch (Exception error)
                {
                    // A request may have reached the server even if no response was received.
                    failure = error is OperationCanceledException ? "请求已中断，保存结果尚未确认。" : "网络中断，保存结果尚未确认。";
                }
                var next = definitelyNotSent ? PendingStatus.Blocked : response?.IsSuccess == true ? invalidTodoNoteReceipt ? PendingStatus.Unknown : PendingStatus.Confirmed :
                    response?.StatusCode == 409 ? PendingStatus.Conflict :
                    response?.StatusCode is >= 400 and < 500 ? PendingStatus.Blocked : PendingStatus.Unknown;
                await MutateAsync(s =>
                {
                    var index = s.Outbox.FindIndex(x => x.Id == id);
                    if (index < 0) throw new InvalidDataException("待同步操作在发送后丢失。");
                    s.Outbox[index] = s.Outbox[index] with
                    {
                        Status = next,
                        ConfirmedRevision = next == PendingStatus.Confirmed ? s.LocalRevision : 0,
                        RemoteJson = response?.Json,
                        Error = next == PendingStatus.Confirmed ? null : failure ??
                            $"HTTP {response?.StatusCode}，{(next == PendingStatus.Conflict ? "版本冲突，已保留本地与远端内容。" : "需要核对后处理。")}" +
                            (response?.RequestId is { Length: > 0 } requestId ? $" 请求号：{requestId}" : "")
                    };
                }, CancellationToken.None);
                switch (next)
                {
                    case PendingStatus.Confirmed: confirmed++; break;
                    case PendingStatus.Conflict: conflicts++; break;
                    case PendingStatus.Blocked: blocked++; break;
                    default: unknown++; break;
                }
                // Do not continue a batch with an uncertain transport or invalid authentication.
                if (definitelyNotSent || next == PendingStatus.Unknown || response?.StatusCode is 401 or 403) break;
            }
            return new SyncReport(confirmed, conflicts, blocked, unknown,
                Snapshot.Outbox.Count(x => x.Status == PendingStatus.Queued));
        }
        finally { syncGate.Release(); }
    }

    public Task<ApiResult> ReadRemoteAsync(string path, CancellationToken cancellationToken = default) =>
        api.SendAsync("GET", path, null, "", cancellationToken);

    // The transport caller must verify an exact receipt/content match before calling this method.
    // An absent receipt or merely similar current content is not confirmation.
    public Task ConfirmReconciledAsync(string operationId, string verifiedRemoteJson,
        CancellationToken cancellationToken = default)
    {
        ParseJson(verifiedRemoteJson);
        return MutateAsync(s =>
        {
            var index = FindUnresolved(s, operationId);
            if (s.Outbox[index].Status is not (PendingStatus.Unknown or PendingStatus.Blocked))
                throw new InvalidOperationException("只有未确认请求可由精确保存证据确认。");
            if (IsTemplateArchiveAction(s.Outbox[index]))
                throw new InvalidOperationException("模板归档接口没有精确保存收据。两张列表仅供只读核对，不能据当前状态确认原请求。");
            if (IsTodoNoteAction(s.Outbox[index]))
                throw new InvalidOperationException("待办备注没有精确保存收据。当前待办内容或版本相同，不能确认原请求已经提交。");
            s.Outbox[index] = s.Outbox[index] with { Status = PendingStatus.Confirmed, ConfirmedRevision = s.LocalRevision,
                RemoteJson = verifiedRemoteJson, Error = null };
        }, cancellationToken);
    }

    // User-directed reconciliation: retain the old request as history, never edit its body or version.
    // Callers must show/read the current entity first; replacement is an explicit new CAS intent.
    public Task ResolveAsync(string operationId, string remoteJson, PendingOperation? replacement = null,
        CancellationToken cancellationToken = default)
    {
        ParseJson(remoteJson);
        if (replacement != null) Validate(replacement);
        return MutateAsync(s =>
        {
            var index = FindUnresolved(s, operationId);
            var original = s.Outbox[index];
            if (original.Status == PendingStatus.Unknown && IsTemplateArchiveAction(original))
                throw new InvalidOperationException("模板归档结果尚未确认，当前列表不能解除原请求围栏或替换为新写入。原请求和草稿保留。");
            if (original.Status == PendingStatus.Unknown && IsTodoNoteAction(original))
                throw new InvalidOperationException("待办备注结果尚未确认，当前记录不能解除原请求围栏或替换为新保存。原请求和草稿保留。");
            if (replacement != null && (replacement.Id == original.Id || s.Outbox.Any(x => x.Id == replacement.Id) || replacement.ResourceKey != original.ResourceKey))
                throw new InvalidOperationException("冲突处理必须创建同一资源的新操作标识。");
            s.Outbox[index] = original with { Status = PendingStatus.Superseded, SupersededById = replacement?.Id, RemoteJson = remoteJson,
                Error = replacement == null ? "已明确采用远端状态；原请求保留。" : "已明确基于远端版本创建新操作；原请求保留。" };
            if (replacement != null) AddOperation(s, replacement);
        }, cancellationToken);
    }

    // Only an explicit action after inspecting server state may retry. ID/body/version remain identical.
    public Task RetryUnchangedAsync(string operationId, string checkedRemoteJson,
        CancellationToken cancellationToken = default)
    {
        ParseJson(checkedRemoteJson);
        return MutateAsync(s =>
        {
            var index = FindUnresolved(s, operationId);
            if (s.Outbox[index].RecoveredAtRevision > 0)
                throw new InvalidOperationException("此请求来自较旧备份，旧拒绝或冲突记录无法证明之后未曾保存。请先只读核对精确保存证据，不能直接重排恢复请求。");
            if (s.Outbox[index].Status == PendingStatus.Conflict)
                throw new InvalidOperationException("版本冲突必须选择远端或显式新 CAS 保存，不能重试旧版本。");
            if (s.Outbox[index].Status == PendingStatus.Unknown && IsTemplateArchiveAction(s.Outbox[index]))
                throw new InvalidOperationException("模板归档结果尚未确认，列表中的相同状态不能证明原保存结果，不能直接重排原请求。");
            if (s.Outbox[index].Status == PendingStatus.Unknown && IsTodoNoteAction(s.Outbox[index]))
                throw new InvalidOperationException("待办备注结果尚未确认，读取到相同内容和版本不能证明原保存结果，不能直接重排原请求。");
            s.Outbox[index] = s.Outbox[index] with { Status = PendingStatus.Queued, RemoteJson = checkedRemoteJson,
                Error = "已明确要求重试同一不可变请求。" };
        }, cancellationToken);
    }

    private async Task MutateAsync(Action<WorkspaceState> update, CancellationToken cancellationToken)
    {
        await stateGate.WaitAsync(cancellationToken);
        try
        {
            var current = Snapshot;
            var next = current with { LocalRevision = checked(current.LocalRevision + 1) };
            update(next);
            OperationGraph.Validate(next);
            await store.SaveAsync(next, cancellationToken);
            // A failed disk commit must not become visible or allow a network write.
            state = next;
        }
        finally { stateGate.Release(); }
    }

    private static int FindQueued(WorkspaceState s, string operationId)
    {
        var index = s.Outbox.FindIndex(x => x.Id == operationId);
        if (index < 0 || !s.Outbox[index].CanEditQueued)
            throw new InvalidOperationException("只有尚未发送的排队操作可取消或替换。已发出或未知请求必须先核对结果。");
        return index;
    }

    private static int FindUnresolved(WorkspaceState s, string operationId)
    {
        var index = s.Outbox.FindIndex(x => x.Id == operationId);
        if (index < 0 || s.Outbox[index].Status is PendingStatus.InFlight or PendingStatus.Queued or
            PendingStatus.Confirmed or PendingStatus.Superseded)
            throw new InvalidOperationException("此操作不处于可核对处理的状态。");
        return index;
    }

    private static void AddOperation(WorkspaceState s, PendingOperation operation)
    {
        if (s.ArchivedOperationIds.ContainsKey(Guid.Parse(operation.Id).ToString("D")))
            throw new InvalidOperationException("此操作标识已归档，不能重新用于排队或提交不同内容。");
        if (operation.Method == "POST" && operation.Path.Split('?', 2)[0].TrimEnd('/') == "/api/v1/articles" &&
            s.Drafts.TryGetValue(operation.ResourceKey, out var recoveredDraft) && recoveredDraft.RecoveredAtRevision > 0)
            throw new InvalidOperationException("此新建文章草稿来自较旧备份，无法确定之后是否已保存并取得服务器文章标识。请先只读核对台账，找到后更新真实记录；草稿仍可编辑或导出。");
        var existing = s.Outbox.FirstOrDefault(x => x.Id == operation.Id);
        if (existing != null)
        {
            if (existing.ResourceKey == operation.ResourceKey && existing.Method == operation.Method &&
                existing.Path == operation.Path && existing.BodyJson == operation.BodyJson &&
                existing.TodoNoteDate == operation.TodoNoteDate &&
                existing.DependencyIds.SequenceEqual(operation.DependencyIds, StringComparer.Ordinal)) return;
            throw new InvalidOperationException("不能重复使用操作标识提交不同内容。");
        }
        if (s.Outbox.Any(x => x.ResourceKey == operation.ResourceKey &&
            x.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)))
            throw new InvalidOperationException("此内容已有未确认操作。新草稿已保留，请先处理原操作。");
        s.Outbox.Add(operation with { Status = PendingStatus.Queued, Error = null, RemoteJson = null, ConfirmedRevision = 0, SupersededById = null,
            DependencyIds = operation.DependencyIds.ToArray(), SendAttempts = 0, PreparedBodyJson = null });
    }

    private static void Validate(PendingOperation operation)
    {
        if (!Guid.TryParseExact(operation.Id, "D", out var id) || id == Guid.Empty || operation.Id != id.ToString("D") ||
            operation.DependencyIds == null || operation.DependencyIds.Count > 64 || operation.SendAttempts != 0 ||
            operation.PreparedBodyJson != null || operation.ConfirmedRevision != 0 || operation.RecoveredAtRevision != 0 || operation.SupersededById != null ||
            operation.VersionFromDependencyId != null && !operation.DependencyIds.Contains(operation.VersionFromDependencyId, StringComparer.Ordinal) ||
            string.IsNullOrWhiteSpace(operation.ResourceKey) ||
            operation.Method is not ("POST" or "PUT" or "PATCH" or "DELETE") ||
            !operation.Path.StartsWith("/api/v1/", StringComparison.Ordinal) ||
            operation.Path.Contains('#') || operation.Path.Contains("..", StringComparison.Ordinal) ||
            operation.Path.Contains('\\') || operation.Path.StartsWith("//", StringComparison.Ordinal))
            throw new ArgumentException("待同步操作格式无效。");
        ParseJson(operation.BodyJson);
        if (IsTodoNoteAction(operation)) ValidateTodoNoteOperation(operation);
    }

    private static string PrepareVersionBody(WorkspaceState state, PendingOperation operation)
    {
        var dependency = OperationGraph.ResolveConfirmed(state, operation.VersionFromDependencyId!);
        if (dependency == null) throw new InvalidDataException("依赖操作尚未确认，不能生成写入版本。");
        try
        {
            var receipt = JsonNode.Parse(dependency.RemoteJson ?? "null") as JsonObject;
            var data = receipt?["data"] as JsonObject
                ?? throw new InvalidDataException("依赖保存响应没有实体数据；子操作未发送。");
            if (operation.Path.StartsWith("/api/v1/daily-notes/", StringComparison.Ordinal))
            {
                var legacy = LegacyVersionTarget(operation.Path); var restored = LegacyVersionTarget(dependency.Path);
                if (operation.Method != "PUT" || legacy == null || legacy.Restore || dependency.Method != "POST" || restored == null || !restored.Restore ||
                    legacy.Date != restored.Date || legacy.Category != restored.Category || data["date"]?.ToString() != legacy.Date ||
                    data["category"] != null && data["category"]!.ToString() != legacy.Category ||
                    data["text"] is not JsonValue text || !text.TryGetValue<string>(out _) ||
                    data["deleted"] is not JsonValue deleted || !deleted.TryGetValue<bool>(out var isDeleted) || isDeleted ||
                    data["version"] is not JsonValue legacyVersion || !legacyVersion.TryGetValue<long>(out var restoredVersion) ||
                    restoredVersion < 1 || restoredVersion >= 9_007_199_254_740_991L)
                    throw new InvalidDataException("旧日页恢复响应与原日期、分类或真实恢复版本不一致；续编请求未发送。");
                return VersionedBody(operation, restoredVersion);
            }
            var target = VersionTarget(operation.Path)
                ?? throw new InvalidDataException("待修改记录路径或动作无法核验；子操作未发送。");
            if (target.Action != null && (target is { Resource: "todos", Action: "note" } ? operation.Method != "PATCH" : operation.Method != "POST"))
                throw new InvalidDataException("依赖版本动作的方法与正式接口不一致；子操作未发送。");
            var parent = VersionTarget(dependency.Path);
            if (target is { Resource: "todos", Action: "note" })
                return PrepareTodoNoteVersionBody(state, operation, dependency, parent, receipt!, data);
            if (parent != null && parent.Id != target.Id)
                throw new InvalidDataException("依赖操作路径与待修改记录身份不匹配；子操作未发送。");
            if (target.Resource == "todo-templates" && (target.Action is "archive" or "restore" || parent is { Resource: "todo-templates", Action: "archive" or "restore" }))
                return PrepareTemplateVersionBody(state, operation, dependency, target, parent, receipt!, data);
            JsonObject remote;
            if (parent is { Resource: "todos", Action: "template" })
            {
                if (dependency.Method != "POST" || target.Resource != "todos" || parent.Id != target.Id ||
                    data["todo"] is not JsonObject linkedTodo || data["template"] is not JsonObject template ||
                    JsonNode.Parse(dependency.RequestBodyJson) is not JsonObject linkBody ||
                    linkBody["template_id"] is not JsonValue templateIdentity || !templateIdentity.TryGetValue<string>(out var templateId) ||
                    !Guid.TryParseExact(templateId, "D", out _))
                    throw new InvalidDataException("依赖响应不是已核对的待办常用关联结果；子操作未发送。");
                _ = EntityVersion(linkedTodo, parent.Id);
                var templateVersion = EntityVersion(template, templateId);
                if (linkedTodo["template_id"] is not JsonValue linkedId || !linkedId.TryGetValue<string>(out var actualId) || actualId != templateId ||
                    linkedTodo["template_version"] is not JsonValue linkedVersion || !linkedVersion.TryGetValue<long>(out var actualVersion) || actualVersion != templateVersion ||
                    linkedTodo["template_active"] is not JsonValue active || !active.TryGetValue<bool>(out var isActive) || !isActive)
                    throw new InvalidDataException("常用关联的身份、版本或启用状态不匹配；子操作未发送。");
                remote = linkedTodo;
            }
            else if (data.ContainsKey("id"))
            {
                // Direct responses belong to their exact resource. Shared UUIDs do not make todo and unscheduled versions interchangeable.
                var parentResource = parent?.Resource ?? dependency.Path.Split('?', 2)[0][8..].TrimEnd('/');
                if (parentResource != target.Resource)
                    throw new InvalidDataException("直接保存响应属于其他资源；子操作未发送。");
                remote = data;
            }
            else
            {
                // Only the documented atomic unscheduled move can produce these two entity versions.
                // Never recursively search arbitrary nested objects for a coincidentally matching UUID.
                if (dependency.Method != "POST" || parent is not { Resource: "unscheduled-todos", Action: "move" or "complete-today" } ||
                    parent.Id != target.Id || target.Resource is not ("todos" or "unscheduled-todos") ||
                    data["source"] is not JsonObject source || data["todo"] is not JsonObject todo)
                    throw new InvalidDataException("依赖响应不是已核对的未安排事项移动结果；子操作未发送。");
                _ = EntityVersion(source, parent.Id);
                _ = EntityVersion(todo, parent.Id);
                remote = target.Resource == "todos" ? todo : source;
            }
            var version = EntityVersion(remote, target.Id);
            return VersionedBody(operation, version);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException)
        { throw new InvalidDataException("依赖保存响应无法核验；子操作未发送。", error); }
    }

    private static string VersionedBody(PendingOperation operation, long version)
    {
        var body = JsonNode.Parse(operation.BodyJson) as JsonObject ?? throw new InvalidDataException("待发送内容不是对象。");
        if (body.ContainsKey("version")) throw new InvalidDataException("依赖版本请求不应自带猜测版本；子操作未发送。");
        body["version"] = version;
        return body.ToJsonString();
    }
    private static string PrepareTemplateVersionBody(WorkspaceState state, PendingOperation operation, PendingOperation dependency,
        VersionRoute target, VersionRoute? parent, JsonObject receipt, JsonObject data)
    {
        const long maximumSafeInteger = 9_007_199_254_740_991L;
        var key = "/api/v1/todo-templates/" + Guid.Parse(target.Id).ToString("D");
        if (operation.Path.Contains('?') || dependency.Path.Contains('?') || operation.ResourceKey != dependency.ResourceKey ||
            !string.Equals(operation.ResourceKey, key, StringComparison.OrdinalIgnoreCase) ||
            receipt.TryGetPropertyValue("_local_scope_id", out var scope) && (scope is not JsonValue scopeValue || !scopeValue.TryGetValue<string>(out var scopeId) || scopeId != state.ScopeId) ||
            data.ContainsKey("_local_incomplete") || data.ContainsKey("_local_scope_id"))
            throw new InvalidDataException("模板依赖不属于同一记录、工作区或完整保存收据；子操作未发送。");
        var body = JsonNode.Parse(operation.BodyJson) as JsonObject ?? throw new InvalidDataException("模板子操作内容无效。");
        if (target.Action is "archive" or "restore" ? operation.Method != "POST" || body.Count != 0 :
            target.Action != null || operation.Method is not ("PATCH" or "DELETE"))
            throw new InvalidDataException("模板依赖动作或请求字段不符合接口；子操作未发送。");
        TemplateArchive.ValidateRecord(data, parent?.Action is "archive" ? true : parent?.Action is "restore" ? false : null,
            requireExplicitArchive: parent?.Action is "archive" or "restore");
        var version = EntityVersion(data, target.Id);
        var parentBody = JsonNode.Parse(dependency.RequestBodyJson) as JsonObject ?? throw new InvalidDataException("模板前置请求缺少原始对象。");
        if (dependency.Path == "/api/v1/todo-templates" && dependency.Method == "POST")
        {
            if (parentBody.Count != 2 || parentBody["id"] is not JsonValue identity || !identity.TryGetValue<string>(out var id) ||
                !Guid.TryParseExact(id, "D", out var createdId) || createdId != Guid.Parse(target.Id) ||
                parentBody["text"] is not JsonValue text || !text.TryGetValue<string>(out var createdText) || createdText.Length > 500 || createdText.Contains('\0') ||
                data["text"]?.GetValue<string>() != createdText.Trim())
                throw new InvalidDataException("模板创建收据与原标识或正文不一致；子操作未发送。");
        }
        else
        {
            if (parent is not { Resource: "todo-templates" } || parent.Id != target.Id ||
                (parent.Action is "archive" or "restore" ? dependency.Method != "POST" || parentBody.Count != 1 :
                parent.Action != null || dependency.Method != "PATCH" || parentBody.Count != 2 || !parentBody.ContainsKey("text")))
                throw new InvalidDataException("模板版本前置操作不是已核实的创建、修改或归档动作；子操作未发送。");
            if (!TemplateVersion(parentBody["version"], out var requestedVersion) ||
                requestedVersion < 1 || requestedVersion >= maximumSafeInteger ||
                (parent!.Action is "archive" or "restore" ? version != requestedVersion && version != requestedVersion + 1 : version != requestedVersion + 1))
                throw new InvalidDataException("模板收据版本与前置请求不一致；子操作未发送。");
            if (dependency.Method == "PATCH" && (parentBody["text"] is not JsonValue text || !text.TryGetValue<string>(out var changedText) || changedText.Length > 500 || changedText.Contains('\0') || data["text"]?.GetValue<string>() != changedText.Trim()))
                throw new InvalidDataException("模板修改收据正文与前置请求不一致；子操作未发送。");
        }
        return VersionedBody(operation, version);
    }
    private static bool TemplateVersion(JsonNode? node, out long version)
    {
        version = 0;
        if (node is not JsonValue number || number.GetValueKind() != JsonValueKind.Number ||
            !decimal.TryParse(number.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ||
            value != decimal.Truncate(value) || value < 1 || value >= 9_007_199_254_740_991L) return false;
        version = (long)value; return true;
    }
    private sealed record LegacyVersionRoute(string Date, string Category, bool Restore);
    private static LegacyVersionRoute? LegacyVersionTarget(string path)
    {
        var parts = path.Split('?', 2);
        if (!parts[0].StartsWith("/api/v1/daily-notes/", StringComparison.Ordinal) || parts.Length != 2 ||
            parts[1] is not ("category=life" or "category=work")) return null;
        var segments = parts[0][20..].Split('/');
        if (segments.Length is not (1 or 2) || segments.Length == 2 && segments[1] != "restore" ||
            !DateOnly.TryParseExact(segments[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) return null;
        return new(segments[0], parts[1][9..], segments.Length == 2);
    }

    private sealed record VersionRoute(string Resource, string Id, string? Action);
    private static VersionRoute? VersionTarget(string path)
    {
        var route = path.Split('?', 2)[0];
        if (!route.StartsWith("/api/v1/", StringComparison.Ordinal)) return null;
        var segments = route[8..].Split('/');
        if (segments.Length < 2) return null;
        string? action = null;
        var index = segments.Length - 1;
        if (segments[index] is "move" or "complete-today" or "restore" or "template" or "archive" or "note") { action = segments[index]; index--; }
        if (index < 1 || !Guid.TryParseExact(segments[index], "D", out _)) return null;
        var resource = string.Join('/', segments[..index]);
        if (action is "move" or "complete-today" && resource != "unscheduled-todos") return null;
        if (action == "template" && resource != "todos") return null;
        if (action == "archive" && resource != "todo-templates") return null;
        if (action == "note" && resource != "todos") return null;
        return new VersionRoute(resource, resource == "todo-templates" ? Guid.Parse(segments[index]).ToString("D") : segments[index], action);
    }
    private static bool IsTemplateArchiveAction(PendingOperation operation) => operation.Method == "POST" &&
        VersionTarget(operation.Path) is { Resource: "todo-templates", Action: "archive" or "restore" };
    private static bool IsTodoNoteAction(PendingOperation operation)
    {
        var parts = operation.Path.Split('?', 2)[0].Split('/');
        return operation.Method == "PATCH" && parts.Length == 6 && parts[0].Length == 0 &&
            parts[1] == "api" && parts[2] == "v1" && parts[3] == "todos" && parts[5] == "note";
    }
    private sealed record TodoNoteTarget(string Id, DateOnly Date);
    private static TodoNoteTarget ValidateTodoNoteOperation(PendingOperation operation)
    {
        try
        {
            var parts = operation.Path.Split('/');
            if (!IsTodoNoteAction(operation) || operation.Path.Contains('?') || operation.Path.Contains('#') ||
                parts.Length != 6 || operation.ResourceKey != TodoNotes.ResourceKey(parts[4]) ||
                !DateOnly.TryParseExact(operation.TodoNoteDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                throw new InvalidDataException("待办备注缺少原始日期或同一待办标识；未发送写入。");
            var body = TodoNotes.Envelope(operation.BodyJson, null); var deferred = operation.VersionFromDependencyId != null;
            if (body.Count != (deferred ? 1 : 2) || !body.ContainsKey("note") ||
                !deferred && !TemplateVersion(body["version"], out _))
                throw new InvalidDataException("待办备注只接受原文及真实版本；日期和其他字段不能进入请求正文。");
            var note = TodoNotes.ValidateText(TodoNotes.Text(body["note"]));
            if (operation.PreparedBodyJson != null)
            {
                var sent = TodoNotes.Envelope(operation.PreparedBodyJson, null);
                if (sent.Count != 2 || !TemplateVersion(sent["version"], out _) || TodoNotes.Text(sent["note"]) != note)
                    throw new InvalidDataException("待办备注冻结请求与原始意图不一致；未发送写入。");
            }
            return new(parts[4].ToLowerInvariant(), date);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or FormatException or OverflowException)
        { throw new InvalidDataException("待办备注请求或原日期无法核实；原请求及草稿保留。", error); }
    }
    private static void ValidateTodoNoteReceipt(PendingOperation operation, string json, string scope)
    {
        try
        {
            var target = ValidateTodoNoteOperation(operation); var request = TodoNotes.Envelope(operation.RequestBodyJson, null);
            if (request.Count != 2 || !TemplateVersion(request["version"], out var requestedVersion))
                throw new InvalidDataException("待办备注缺少已经冻结的真实请求版本。");
            var receipt = TodoNotes.Envelope(json, scope);
            if (receipt["data"] is not JsonObject row) throw new InvalidDataException("待办备注保存响应缺少完整待办。");
            TodoNotes.ValidateRecord(row, target.Id, target.Date);
            var note = row.ContainsKey("note") ? TodoNotes.Text(row["note"]) : "";
            if (TodoNotes.Integer(row["version"], 1) != requestedVersion + 1 || note != TodoNotes.Text(request["note"]))
                throw new InvalidDataException("待办备注回执版本或精确原文不匹配。");
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException or FormatException or OverflowException)
        { throw new InvalidDataException("待办备注保存响应无法核实；原请求及草稿保留。", error); }
    }
    private static string PrepareTodoNoteVersionBody(WorkspaceState state, PendingOperation operation, PendingOperation dependency,
        VersionRoute? parent, JsonObject receipt, JsonObject data)
    {
        var target = ValidateTodoNoteOperation(operation);
        if (operation.ResourceKey != dependency.ResourceKey || dependency.Path.Contains('?') || dependency.Path.Contains('#') ||
            receipt.TryGetPropertyValue("_local_scope_id", out var markedScope) && (markedScope is not JsonValue scopeValue || !scopeValue.TryGetValue<string>(out var scopeId) || scopeId != state.ScopeId))
            throw new InvalidDataException("待办备注前置回执不属于同一资源或工作区；子操作未发送。");
        TodoNotes.ValidateRecord(data, target.Id, target.Date);
        var version = EntityVersion(data, target.Id);
        var body = TodoNotes.Envelope(dependency.RequestBodyJson, null);
        if (dependency.Method == "POST" && dependency.Path == "/api/v1/todos")
        {
            if (body.Count != (body.ContainsKey("template_id") ? 4 : 3) ||
                TodoNotes.ResourceKey(TodoNotes.Text(body["id"])) != operation.ResourceKey || TodoNotes.Date(body["date"]) != target.Date ||
                body["text"] is not JsonValue text || !text.TryGetValue<string>(out var createdText) || createdText.Length is < 1 or > 500 || createdText.Contains('\0') ||
                createdText.Trim() != TodoNotes.Text(data["text"]) ||
                body.ContainsKey("template_id") && TodoNotes.ResourceKey(TodoNotes.Text(body["template_id"])) != TodoNotes.ResourceKey(TodoNotes.Text(data["template_id"])))
                throw new InvalidDataException("待办创建回执与原标识、日期、事项或模板关联不一致；备注未发送。");
        }
        else
        {
            if (parent is not { Resource: "todos" } || !Guid.TryParseExact(parent.Id, "D", out var parentId) || parentId != Guid.Parse(target.Id))
                throw new InvalidDataException("待办备注前置路径不属于同一待办；子操作未发送。");
            if (parent.Action == "note" && dependency.Method == "PATCH")
                ValidateTodoNoteReceipt(dependency, dependency.RemoteJson!, state.ScopeId);
            else if (parent.Action == null && dependency.Method == "PATCH")
            {
                if (body.Count != 2 || !TemplateVersion(body["version"], out var priorVersion) || version != priorVersion + 1 ||
                    body["completed"] is not JsonValue completed || !completed.TryGetValue<bool>(out var expected) ||
                    data["completed"] is not JsonValue actual || !actual.TryGetValue<bool>(out var value) || value != expected)
                    throw new InvalidDataException("待办完成回执与原请求及真实版本不一致；备注未发送。");
            }
            else if (parent.Action == "restore" && dependency.Method == "POST")
            {
                if (body.Count != 2 || TodoNotes.Date(body["date"]) != target.Date || !TemplateVersion(body["version"], out var priorVersion) ||
                    version != priorVersion && version != priorVersion + 1)
                    throw new InvalidDataException("待办恢复回执与原日期或真实版本不一致；备注未发送。");
            }
            else throw new InvalidDataException("待办备注仅能依赖已核实的创建、完成、恢复或备注保存；子操作未发送。");
        }
        return VersionedBody(operation, version);
    }
    private static long EntityVersion(JsonObject entity, string expectedId)
    {
        if (entity["id"] is not JsonValue identity || !identity.TryGetValue<string>(out var id) || id != expectedId ||
            entity["version"] is not JsonValue versionNode || !versionNode.TryGetValue<long>(out var version) ||
            version < 1 || version >= 9_007_199_254_740_991L)
            throw new InvalidDataException("依赖保存响应的实体身份或真实版本无效；子操作未发送。");
        return version;
    }

    private static void ParseJson(string json)
    {
        using var parsed = JsonDocument.Parse(json);
        if (parsed.RootElement.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            throw new ArgumentException("内容必须为有效 JSON。");
    }
}
