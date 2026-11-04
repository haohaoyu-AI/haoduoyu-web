using System.Text.Json;
using System.Text.Json.Serialization;

namespace Haoduoyu.Core;

public enum PendingStatus { Queued, InFlight, Unknown, Conflict, Blocked, Confirmed, Superseded }

public sealed record LocalDraft
{
    public string Key { get; init; } = "";
    public string Text { get; init; } = "";
    public string Title { get; init; } = "";
    public long BaseVersion { get; init; }
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}

// The original request body and operation ID are never changed by the engine.
public sealed record PendingOperation
{
    public string Id { get; init; } = Guid.NewGuid().ToString();
    public string ResourceKey { get; init; } = "";
    public string Method { get; init; } = "PUT";
    public string Path { get; init; } = "";
    public string BodyJson { get; init; } = "{}";
    public PendingStatus Status { get; init; } = PendingStatus.Queued;
    public string? RemoteJson { get; init; }
    public string? Error { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public IReadOnlyList<string> DependencyIds { get; init; } = [];
    public string? SupersededById { get; init; }
    public long ConfirmedRevision { get; init; }
    public int SendAttempts { get; init; }
    public string? VersionFromDependencyId { get; init; }
    public string? PreparedBodyJson { get; init; }
    [JsonIgnore] public string RequestBodyJson => PreparedBodyJson ?? BodyJson;
    [JsonIgnore] public bool CanEditQueued => Status == PendingStatus.Queued && SendAttempts == 0 &&
        PreparedBodyJson == null && RemoteJson == null && Error == null;
}

public sealed record WorkspaceState
{
    public int Schema { get; init; } = 1;
    public string ScopeId { get; init; } = "";
    public long LocalRevision { get; init; }
    public Dictionary<string, long> CacheRevisions { get; init; } = new();
    public Dictionary<string, string> Cache { get; init; } = new();
    public Dictionary<string, LocalDraft> Drafts { get; init; } = new();
    public List<PendingOperation> Outbox { get; init; } = new();
}

public sealed record ApiResult(int StatusCode, string Json, string? RequestId = null)
{
    public bool IsSuccess => StatusCode is >= 200 and < 300;
}

public interface IRemoteApi
{
    Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId,
        CancellationToken cancellationToken = default);
}

public interface IStateProtector
{
    byte[] Protect(byte[] plaintext);
    byte[] Unprotect(byte[] ciphertext);
}

public interface IWorkspaceStore
{
    string ScopeId { get; }
    Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default);
    Task SaveAsync(WorkspaceState state, CancellationToken cancellationToken = default);
}

internal static class WorkspaceJson
{
    internal static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = false,
        Converters = { new JsonStringEnumConverter<PendingStatus>() }
    };
    internal static WorkspaceState Clone(WorkspaceState state) =>
        JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.SerializeToUtf8Bytes(state, Options), Options)
        ?? throw new InvalidDataException("无法复制本机工作区。");
}

// Only transport preflight checks that have definitely issued no request may throw this exception.
public class RequestNotSentException(string message) : IOException(message);
