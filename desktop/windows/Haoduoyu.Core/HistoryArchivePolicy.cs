using System.Collections.ObjectModel;
using System.Text.Json;

namespace Haoduoyu.Core;

internal static class HistoryArchivePolicy
{
    internal const int DefaultMaxOperations = 500;
    internal const int MaxOperations = 1000;
    internal const int MaxBytes = 4 * 1024 * 1024;

    internal static HistoryArchivePlan Plan(WorkspaceState state, int maxOperations, int maxBytes)
    {
        if (maxOperations < 1 || maxOperations > MaxOperations)
            throw new ArgumentOutOfRangeException(nameof(maxOperations), "每批历史归档最多 1000 条、4 MiB 编码原文。");
        if (maxBytes < 1 || maxBytes > MaxBytes)
            throw new ArgumentOutOfRangeException(nameof(maxBytes), "每批历史归档最多 4 MiB 编码原文。");
        OperationGraph.Validate(state);
        var byId = state.Outbox.ToDictionary(operation => operation.Id, StringComparer.Ordinal);
        // The durable append order, rather than a clock or UUID, determines the latest operation.
        var latest = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var operation in state.Outbox) latest[operation.ResourceKey] = operation.Id;
        var retained = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var operation in state.Outbox)
        {
            if (operation.Status == PendingStatus.Confirmed) retained[operation.Id] = "Confirmed";
            else if (operation.Status != PendingStatus.Superseded) retained[operation.Id] = "Unresolved";
            else if (!Eligible(operation)) retained[operation.Id] = "PreviouslySentOrRecovered";
            else if (latest[operation.ResourceKey] == operation.Id) retained[operation.Id] = "LatestForResource";
        }
        RetainClosure(retained, byId);

        var selected = new HashSet<string>(StringComparer.Ordinal);
        var bytesById = new Dictionary<string, int>(StringComparer.Ordinal);
        long bytes = 0;
        foreach (var operation in state.Outbox)
        {
            if (retained.ContainsKey(operation.Id)) continue;
            var encoded = JsonSerializer.SerializeToUtf8Bytes(operation, WorkspaceJson.Options).Length;
            bytesById[operation.Id] = encoded;
            if (selected.Count < maxOperations && bytes + encoded <= maxBytes)
            {
                selected.Add(operation.Id); bytes += encoded;
            }
            else retained[operation.Id] = encoded > maxBytes ? "OperationExceedsByteBudget" : "BatchBudget";
        }
        // Budget-retained records can reference an earlier selected record. Include their entire closure too.
        RetainClosure(retained, byId);
        selected.ExceptWith(retained.Keys);
        var ids = state.Outbox.Where(operation => selected.Contains(operation.Id)).Select(operation => operation.Id).ToArray();
        var reasons = retained.Values.GroupBy(reason => reason, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        return new HistoryArchivePlan
        {
            ScopeId = state.ScopeId, BaseRevision = state.LocalRevision, MaxOperations = maxOperations, MaxBytes = maxBytes,
            CandidateIds = Array.AsReadOnly(ids), EncodedBytes = ids.Sum(id => (long)bytesById[id]),
            RetainedReasons = new ReadOnlyDictionary<string, int>(reasons)
        };
    }

    internal static bool Eligible(PendingOperation operation) => operation.Status == PendingStatus.Superseded &&
        operation.SendAttempts == 0 && operation.PreparedBodyJson == null && operation.RemoteJson == null &&
        operation.RecoveredAtRevision == 0 && operation.ConfirmedRevision == 0;

    private static void RetainClosure(Dictionary<string, string> retained, IReadOnlyDictionary<string, PendingOperation> operations)
    {
        var pending = new Queue<string>(retained.Keys);
        while (pending.TryDequeue(out var id))
        {
            var operation = operations[id];
            foreach (var dependency in operation.DependencyIds) Keep(dependency);
            if (operation.VersionFromDependencyId != null) Keep(operation.VersionFromDependencyId);
            if (operation.SupersededById != null) Keep(operation.SupersededById);
        }
        void Keep(string id)
        {
            if (retained.TryAdd(id, "ReferencedByRetained")) pending.Enqueue(id);
        }
    }
}
