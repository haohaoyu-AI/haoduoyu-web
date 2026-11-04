namespace Haoduoyu.Core;

// Archive references contain only immutable primitives. Bodies remain in the separate encrypted document.
public sealed record HistoryArchiveReference
{
    public string Id { get; init; } = "";
    public string FileName { get; init; } = "";
    public int Count { get; init; }
    public long Bytes { get; init; }
    public string Sha256 { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; }
}

public sealed record HistoryArchiveDocument
{
    public int Schema { get; init; } = 1;
    public string Id { get; init; } = "";
    public string ScopeId { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; }
    public long SourceRevision { get; init; }
    public IReadOnlyList<PendingOperation> Operations { get; init; } = [];
}

public interface IHistoryArchiveStore
{
    string ScopeId { get; }
    Task<HistoryArchiveReference> WriteAsync(HistoryArchiveDocument document, CancellationToken cancellationToken = default);
    Task<HistoryArchiveDocument> ReadAsync(HistoryArchiveReference reference, CancellationToken cancellationToken = default);
}

public sealed record HistoryArchivePlan
{
    public string ScopeId { get; init; } = "";
    public long BaseRevision { get; init; }
    public int MaxOperations { get; init; }
    public int MaxBytes { get; init; }
    public IReadOnlyList<string> CandidateIds { get; init; } = [];
    // Sum of the actual encoded PendingOperation records, including original body and all metadata.
    public long EncodedBytes { get; init; }
    public IReadOnlyDictionary<string, int> RetainedReasons { get; init; } = new Dictionary<string, int>();
}

internal static class HistoryArchiveValidation
{
    internal static void Reference(HistoryArchiveReference reference)
    {
        if (reference == null || !Guid.TryParseExact(reference.Id, "D", out var id) || id == Guid.Empty || reference.Id != id.ToString("D") ||
            string.IsNullOrEmpty(reference.FileName) || reference.FileName.Length > 160 || reference.FileName is "." or ".." ||
            reference.FileName.EndsWith('.') || reference.FileName.Any(character =>
                !(character is >= 'a' and <= 'z' or >= 'A' and <= 'Z' or >= '0' and <= '9' or '.' or '_' or '-')) ||
            reference.Count < 1 || reference.Count > 1000 || reference.Bytes < 1 || reference.Sha256 == null ||
            reference.Sha256.Length != 64 || reference.Sha256.Any(character => !Uri.IsHexDigit(character)))
            throw new InvalidDataException("本机历史归档引用无效；原记录已保留。");
    }
}
