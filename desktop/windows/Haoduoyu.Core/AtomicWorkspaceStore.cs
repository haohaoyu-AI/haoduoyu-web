using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Haoduoyu.Core;

// One store owns a lifetime lock for one service + identity partition. Existing app data is untouched.
public sealed class AtomicWorkspaceStore : IWorkspaceStore, IDisposable
{
    private const int MaxBytes = 32 * 1024 * 1024;
    private static readonly byte[] Header = "HDYWS1\n"u8.ToArray();
    private readonly IStateProtector protector;
    private readonly FileStream scopeLock;
    private readonly SemaphoreSlim io = new(1, 1);
    private bool disposed;
    public string ScopeId { get; }
    public string FilePath { get; }
    public string BackupPath => FilePath + ".bak";

    public AtomicWorkspaceStore(string rootDirectory, string serviceOrigin, string identity, IStateProtector protector)
    {
        ArgumentNullException.ThrowIfNull(protector);
        if (!Uri.TryCreate(serviceOrigin, UriKind.Absolute, out var origin) ||
            !(origin.Scheme == "https" || origin.Scheme == "http" && origin.IsLoopback) ||
            !string.IsNullOrEmpty(origin.UserInfo) || origin.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(origin.Query) || !string.IsNullOrEmpty(origin.Fragment))
            throw new ArgumentException("服务必须是 HTTPS 站点源，或回环测试地址。", nameof(serviceOrigin));
        if (string.IsNullOrWhiteSpace(identity)) throw new ArgumentException("必须指定明确身份分区。", nameof(identity));
        this.protector = protector;
        var canonical = origin.GetLeftPart(UriPartial.Authority).ToLowerInvariant();
        ScopeId = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical + "\0" + identity)));
        var directory = Path.Combine(Path.GetFullPath(rootDirectory), ScopeId);
        Directory.CreateDirectory(directory);
        FilePath = Path.Combine(directory, "workspace.bin");
        scopeLock = new FileStream(Path.Combine(directory, "workspace.lock"), FileMode.OpenOrCreate,
            FileAccess.ReadWrite, FileShare.None);
    }

    public async Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        await io.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(FilePath))
            {
                if (File.Exists(BackupPath)) throw new InvalidDataException("主工作区缺失但备份存在。请先恢复备份；不会创建空工作区覆盖数据。");
                return new WorkspaceState { ScopeId = ScopeId };
            }
            return await ReadFileAsync(FilePath, cancellationToken);
        }
        finally { io.Release(); }
    }

    public async Task SaveAsync(WorkspaceState state, CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        Validate(state);
        await io.WaitAsync(cancellationToken);
        string? temp = null;
        try
        {
            // Refuse to overwrite corrupt, unsupported or foreign state even when called directly.
            if (File.Exists(FilePath))
            {
                var existing = await ReadFileAsync(FilePath, cancellationToken);
                if (existing.Schema == 2 && state.Schema == 1)
                    throw new InvalidDataException("工作区已使用新版历史归档格式，不能降级写回；请使用新版客户端。");
            }
            else if (File.Exists(BackupPath)) throw new InvalidDataException("必须先恢复缺失的主工作区。");
            temp = await WriteTemporaryAsync(state, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            if (File.Exists(FilePath)) File.Replace(temp, FilePath, BackupPath, ignoreMetadataErrors: false);
            else File.Move(temp, FilePath);
            temp = null;
        }
        finally
        {
            if (temp != null) try { File.Delete(temp); } catch (IOException) { }
            io.Release();
        }
    }

    // Explicit recovery only. A backup's unresolved status cannot prove that its request was never sent:
    // the newer damaged primary may have contained InFlight or Confirmed. Fence before installing it.
    public async Task RestoreBackupAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        await io.WaitAsync(cancellationToken);
        string? temp = null;
        try
        {
            var backup = await ReadFileAsync(BackupPath, cancellationToken);
            var revision = checked(backup.LocalRevision + 1);
            var recovered = backup with
            {
                LocalRevision = revision,
                BackupRecoveryRevision = revision,
                BackupRecoveredAt = DateTimeOffset.UtcNow,
                Drafts = backup.Drafts.ToDictionary(entry => entry.Key,
                    entry => entry.Value with { RecoveredAtRevision = revision }, StringComparer.Ordinal),
                Outbox = backup.Outbox.Select(operation => operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded)
                    ? operation with
                    {
                        Status = PendingStatus.Unknown,
                        RecoveredAtRevision = revision,
                        Error = "已从较旧备份恢复，不能确定此请求之后是否已经发送。请先只读核对远端，再处理原请求。" +
                            (string.IsNullOrEmpty(operation.Error) ? "" : " 原记录：" + operation.Error)
                    } : operation).ToList()
            };
            Validate(recovered);
            temp = await WriteTemporaryAsync(recovered, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            // Keep both the original backup and the exact newer primary. Never replace either with a partial recovery.
            if (File.Exists(FilePath)) File.Replace(temp, FilePath,
                FilePath + ".damaged-" + Guid.NewGuid().ToString("N"), false);
            else File.Move(temp, FilePath);
            temp = null;
        }
        finally
        {
            if (temp != null) try { File.Delete(temp); } catch (IOException) { }
            io.Release();
        }
    }

    private async Task<string> WriteTemporaryAsync(WorkspaceState state, CancellationToken cancellationToken)
    {
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(state, WorkspaceJson.Options);
        byte[] encrypted;
        try
        {
            if (plaintext.Length > MaxBytes) throw new InvalidDataException("本机工作区超过 32 MiB；原文件已保留。");
            encrypted = protector.Protect(plaintext);
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
        if (encrypted.Length > MaxBytes) throw new InvalidDataException("加密工作区超过容量限制；原文件已保留。");
        var temp = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(Header, cancellationToken);
                await stream.WriteAsync(encrypted, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }
            return temp;
        }
        catch
        {
            try { File.Delete(temp); } catch (IOException) { }
            throw;
        }
    }

    private async Task<WorkspaceState> ReadFileAsync(string path, CancellationToken cancellationToken)
    {
        var info = new FileInfo(path);
        if (info.Length < Header.Length || info.Length > MaxBytes + Header.Length)
            throw new InvalidDataException("工作区文件大小异常；已保留原文件。");
        var bytes = await File.ReadAllBytesAsync(path, cancellationToken);
        if (!bytes.AsSpan(0, Header.Length).SequenceEqual(Header))
            throw new InvalidDataException("工作区格式损坏或版本不受支持；已保留原文件。");
        byte[]? plaintext = null;
        try
        {
            plaintext = protector.Unprotect(bytes[Header.Length..]);
            var state = JsonSerializer.Deserialize<WorkspaceState>(plaintext, WorkspaceJson.Options)
                ?? throw new InvalidDataException("工作区没有有效数据。");
            Validate(state);
            return state;
        }
        catch (Exception error) when (error is JsonException or CryptographicException)
        {
            throw new InvalidDataException("无法解密或读取本机工作区；原文件与备份均已保留。", error);
        }
        finally { if (plaintext != null) CryptographicOperations.ZeroMemory(plaintext); }
    }

    private void Validate(WorkspaceState state)
    {
        if (state.Schema is not (1 or 2)) throw new InvalidDataException("不支持此工作区版本；禁止降级写入。");
        if (state.ScopeId != ScopeId) throw new InvalidDataException("工作区与服务或登录身份不匹配。");
        if (state.Cache == null || state.Drafts == null || state.Outbox == null || state.CacheRevisions == null)
            throw new InvalidDataException("工作区字段缺失。");
        if (state.LocalRevision < 0 || state.CacheRevisions.Any(entry => entry.Value < 0 || entry.Value > state.LocalRevision || !state.Cache.ContainsKey(entry.Key)))
            throw new InvalidDataException("工作区本机序列无效。 ");
        if (state.Outbox.Any(x => x == null || !Guid.TryParse(x.Id, out var id) || id == Guid.Empty ||
            !Enum.IsDefined(x.Status) || string.IsNullOrWhiteSpace(x.ResourceKey)))
            throw new InvalidDataException("工作区存在无效待同步操作。");
        if (state.Outbox.Where(x => x.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded))
            .GroupBy(x => x.ResourceKey, StringComparer.Ordinal).Any(group => group.Count() > 1))
            throw new InvalidDataException("同一内容存在多个未决操作，请保留原文件并检查。");
        if (state.Outbox.Select(x => x.Id).Distinct(StringComparer.Ordinal).Count() != state.Outbox.Count)
            throw new InvalidDataException("工作区存在重复操作标识。");
        OperationGraph.Validate(state);
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        scopeLock.Dispose();
        io.Dispose();
    }
}
