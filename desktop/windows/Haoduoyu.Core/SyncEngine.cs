using System.Text.Json;

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
            if (loaded.ScopeId != store.ScopeId || loaded.Schema != 1)
                throw new InvalidDataException("本机工作区身份或版本不匹配。");
            if (loaded.Outbox.Any(x => x.Status == PendingStatus.InFlight))
            {
                loaded = loaded with { Outbox = loaded.Outbox.Select(x => x.Status == PendingStatus.InFlight
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
        if (string.IsNullOrWhiteSpace(draft.Key) || draft.BaseVersion < 0)
            throw new ArgumentException("草稿标识或基线版本无效。");
        return MutateAsync(s => s.Drafts[draft.Key] = draft, cancellationToken);
    }

    public Task RemoveDraftAsync(string key, CancellationToken cancellationToken = default) =>
        MutateAsync(s => s.Drafts.Remove(key), cancellationToken);

    public Task CacheAsync(string key, string json, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("缓存标识不能为空。", nameof(key));
        ParseJson(json);
        return MutateAsync(s => s.Cache[key] = json, cancellationToken);
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
            var ids = Snapshot.Outbox.Where(x => x.Status == PendingStatus.Queued).Select(x => x.Id).ToArray();
            foreach (var id in ids)
            {
                cancellationToken.ThrowIfCancellationRequested();
                PendingOperation? sending = null;
                await MutateAsync(s =>
                {
                    var index = s.Outbox.FindIndex(x => x.Id == id && x.Status == PendingStatus.Queued);
                    if (index < 0) return;
                    sending = s.Outbox[index] with { Status = PendingStatus.InFlight, Error = null };
                    s.Outbox[index] = sending;
                }, cancellationToken);
                if (sending == null) continue;
                ApiResult? response = null;
                string? failure = null;
                var definitelyNotSent = false;
                try
                {
                    response = await api.SendAsync(sending.Method, sending.Path, sending.BodyJson, sending.Id, cancellationToken);
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
                var next = definitelyNotSent ? PendingStatus.Blocked : response?.IsSuccess == true ? PendingStatus.Confirmed :
                    response?.StatusCode == 409 ? PendingStatus.Conflict :
                    response?.StatusCode is >= 400 and < 500 ? PendingStatus.Blocked : PendingStatus.Unknown;
                await MutateAsync(s =>
                {
                    var index = s.Outbox.FindIndex(x => x.Id == id);
                    if (index < 0) throw new InvalidDataException("待同步操作在发送后丢失。");
                    s.Outbox[index] = s.Outbox[index] with
                    {
                        Status = next,
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
            s.Outbox[index] = s.Outbox[index] with { Status = PendingStatus.Confirmed,
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
            if (replacement != null && (replacement.Id == original.Id || replacement.ResourceKey != original.ResourceKey))
                throw new InvalidOperationException("冲突处理必须创建同一资源的新操作标识。");
            s.Outbox[index] = original with { Status = PendingStatus.Superseded, RemoteJson = remoteJson,
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
            if (s.Outbox[index].Status == PendingStatus.Conflict)
                throw new InvalidOperationException("版本冲突必须选择远端或显式新 CAS 保存，不能重试旧版本。");
            s.Outbox[index] = s.Outbox[index] with { Status = PendingStatus.Queued, RemoteJson = checkedRemoteJson,
                Error = "已明确要求重试同一不可变请求。" };
        }, cancellationToken);
    }

    private async Task MutateAsync(Action<WorkspaceState> update, CancellationToken cancellationToken)
    {
        await stateGate.WaitAsync(cancellationToken);
        try
        {
            var next = Snapshot;
            update(next);
            await store.SaveAsync(next, cancellationToken);
            // A failed disk commit must not become visible or allow a network write.
            state = next;
        }
        finally { stateGate.Release(); }
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
        var existing = s.Outbox.FirstOrDefault(x => x.Id == operation.Id);
        if (existing != null)
        {
            if (existing.ResourceKey == operation.ResourceKey && existing.Method == operation.Method &&
                existing.Path == operation.Path && existing.BodyJson == operation.BodyJson) return;
            throw new InvalidOperationException("不能重复使用操作标识提交不同内容。");
        }
        if (s.Outbox.Any(x => x.ResourceKey == operation.ResourceKey &&
            x.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)))
            throw new InvalidOperationException("此内容已有未确认操作。新草稿已保留，请先处理原操作。");
        s.Outbox.Add(operation with { Status = PendingStatus.Queued, Error = null, RemoteJson = null });
    }

    private static void Validate(PendingOperation operation)
    {
        if (!Guid.TryParse(operation.Id, out var id) || id == Guid.Empty ||
            string.IsNullOrWhiteSpace(operation.ResourceKey) ||
            operation.Method is not ("POST" or "PUT" or "PATCH" or "DELETE") ||
            !operation.Path.StartsWith("/api/v1/", StringComparison.Ordinal) ||
            operation.Path.Contains('#') || operation.Path.Contains("..", StringComparison.Ordinal) ||
            operation.Path.Contains('\\') || operation.Path.StartsWith("//", StringComparison.Ordinal))
            throw new ArgumentException("待同步操作格式无效。");
        ParseJson(operation.BodyJson);
    }

    private static void ParseJson(string json)
    {
        using var parsed = JsonDocument.Parse(json);
        if (parsed.RootElement.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            throw new ArgumentException("内容必须为有效 JSON。");
    }
}
