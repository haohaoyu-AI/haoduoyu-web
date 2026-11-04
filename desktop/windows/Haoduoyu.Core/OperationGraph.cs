namespace Haoduoyu.Core;

// Dependencies refer only to durable operations in this exact workspace, never another account's queue.
internal static class OperationGraph
{
    internal static void Validate(WorkspaceState state)
    {
        if (state.Schema is not (1 or 2) || state.LocalRevision < 0 || state.Outbox == null || state.BackupRecoveryRevision < 0 ||
            state.BackupRecoveryRevision > state.LocalRevision ||
            (state.BackupRecoveryRevision == 0) != (state.BackupRecoveredAt == null))
            throw new InvalidDataException("工作区操作或备份恢复序列无效。");
        if (state.Drafts == null || state.Drafts.Values.Any(draft => draft == null || draft.RecoveredAtRevision < 0 || draft.RecoveredAtRevision > state.LocalRevision))
            throw new InvalidDataException("草稿的备份恢复序列无效。");
        var operations = new Dictionary<string, PendingOperation>(StringComparer.Ordinal);
        var semanticOperationIds = new HashSet<Guid>();
        foreach (var operation in state.Outbox)
        {
            if (operation == null || !Guid.TryParseExact(operation.Id, "D", out var id) || id == Guid.Empty ||
                !operations.TryAdd(operation.Id, operation) || !semanticOperationIds.Add(id) || !Enum.IsDefined(operation.Status) || string.IsNullOrWhiteSpace(operation.ResourceKey) || operation.DependencyIds == null ||
                operation.DependencyIds.Count > 64 || operation.DependencyIds.Any(dependency => !Guid.TryParseExact(dependency, "D", out _)) ||
                operation.ConfirmedRevision < 0 || operation.ConfirmedRevision > state.LocalRevision || operation.RecoveredAtRevision < 0 ||
                operation.RecoveredAtRevision > state.LocalRevision || operation.SendAttempts < 0)
                throw new InvalidDataException("工作区操作或依赖标识无效。");
            if (operation.DependencyIds.Distinct(StringComparer.Ordinal).Count() != operation.DependencyIds.Count ||
                operation.DependencyIds.Contains(operation.Id, StringComparer.Ordinal))
                throw new InvalidDataException("操作依赖不能重复或指向自身。");
            if (operation.VersionFromDependencyId != null && !operation.DependencyIds.Contains(operation.VersionFromDependencyId, StringComparer.Ordinal))
                throw new InvalidDataException("真实版本来源必须属于当前操作的依赖。");
            if (operation.PreparedBodyJson != null)
            {
                try
                {
                    var original = System.Text.Json.Nodes.JsonNode.Parse(operation.BodyJson) as System.Text.Json.Nodes.JsonObject;
                    var prepared = System.Text.Json.Nodes.JsonNode.Parse(operation.PreparedBodyJson) as System.Text.Json.Nodes.JsonObject;
                    if (operation.VersionFromDependencyId == null || original == null || prepared == null ||
                        prepared["version"] is not System.Text.Json.Nodes.JsonValue versionNode || !versionNode.TryGetValue<long>(out var version) || version < 1)
                        throw new InvalidDataException("已准备请求的真实版本无效。");
                    prepared.Remove("version");
                    if (!System.Text.Json.Nodes.JsonNode.DeepEquals(original, prepared)) throw new InvalidDataException("已准备请求改变了原始逻辑内容。");
                }
                catch (System.Text.Json.JsonException error) { throw new InvalidDataException("已准备请求格式损坏。", error); }
            }
            if (operation.SupersededById != null && operation.Status != PendingStatus.Superseded)
                throw new InvalidDataException("只有已明确替换的历史操作可指向新操作。");
        }
        ValidateArchives(state, semanticOperationIds);
        foreach (var operation in operations.Values)
        {
            foreach (var dependency in operation.DependencyIds)
                if (!operations.ContainsKey(dependency)) throw new InvalidDataException("依赖操作不在当前工作区，禁止排队或发送。");
            if (operation.SupersededById is { } replacement)
            {
                if (!operations.TryGetValue(replacement, out var target) || target.ResourceKey != operation.ResourceKey)
                    throw new InvalidDataException("替换操作必须存在于相同工作区与资源。 ");
            }
        }
        // Iterative cycle detection also handles a long history of explicit replacements without recursion.
        var counts = operations.Keys.ToDictionary(id => id, _ => 0, StringComparer.Ordinal);
        var dependants = operations.Keys.ToDictionary(id => id, _ => new List<string>(), StringComparer.Ordinal);
        foreach (var operation in operations.Values)
        {
            foreach (var dependency in operation.DependencyIds) AddEdge(operation.Id, dependency);
            if (operation.SupersededById is { } replacement) AddEdge(operation.Id, replacement);
        }
        var ready = new Queue<string>(counts.Where(pair => pair.Value == 0).Select(pair => pair.Key));
        var visited = 0;
        while (ready.TryDequeue(out var id))
        {
            visited++;
            foreach (var dependant in dependants[id]) if (--counts[dependant] == 0) ready.Enqueue(dependant);
        }
        if (visited != operations.Count) throw new InvalidDataException("操作依赖或替换关系形成循环，禁止发送。");
        void AddEdge(string dependant, string dependency)
        { counts[dependant]++; dependants[dependency].Add(dependant); }
    }

    private static void ValidateArchives(WorkspaceState state, IReadOnlySet<Guid> operationIds)
    {
        if (state.HistoryArchives == null || state.ArchivedOperationIds == null)
            throw new InvalidDataException("工作区历史归档索引缺失。");
        if (state.Schema == 1 && (state.HistoryArchives.Count != 0 || state.ArchivedOperationIds.Count != 0))
            throw new InvalidDataException("含历史归档的工作区必须使用新版格式；禁止旧版读取后丢失操作标识。");
        var references = new Dictionary<string, HistoryArchiveReference>(StringComparer.Ordinal);
        var fileNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var reference in state.HistoryArchives)
        {
            HistoryArchiveValidation.Reference(reference);
            if (!references.TryAdd(reference.Id, reference) || !fileNames.Add(reference.FileName) || operationIds.Contains(Guid.Parse(reference.Id)))
                throw new InvalidDataException("工作区历史归档标识或文件名重复。");
        }
        var counts = references.Keys.ToDictionary(id => id, _ => 0, StringComparer.Ordinal);
        foreach (var (operationId, archiveId) in state.ArchivedOperationIds)
        {
            if (!Guid.TryParseExact(operationId, "D", out var id) || id == Guid.Empty || operationId != id.ToString("D") || operationIds.Contains(id) || references.ContainsKey(operationId) ||
                archiveId == null || !references.ContainsKey(archiveId))
                throw new InvalidDataException("历史操作标识重复、仍在活动队列或缺少归档文件引用。");
            counts[archiveId]++;
        }
        if (references.Values.Any(reference => counts[reference.Id] != reference.Count))
            throw new InvalidDataException("历史归档索引与原操作数量不一致。");
    }

    internal static bool DependenciesConfirmed(WorkspaceState state, PendingOperation operation) =>
        operation.DependencyIds.All(id => ResolveConfirmed(state, id) != null);

    internal static PendingOperation? ResolveConfirmed(WorkspaceState state, string id)
    {
        var operations = state.Outbox.ToDictionary(x => x.Id, StringComparer.Ordinal);
        var visited = new HashSet<string>(StringComparer.Ordinal);
        while (visited.Add(id) && operations.TryGetValue(id, out var dependency))
        {
            if (dependency.Status == PendingStatus.Confirmed) return dependency;
            if (dependency.Status != PendingStatus.Superseded || dependency.SupersededById is not { } replacement) return null;
            id = replacement;
        }
        return null;
    }
}
