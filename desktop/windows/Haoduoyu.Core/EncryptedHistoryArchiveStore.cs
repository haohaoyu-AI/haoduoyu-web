using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Haoduoyu.Core;

// A file discovered here is evidence only. It is never a source for an executable outbox.
public sealed record HistoryArchiveFile
{
    public string? Id { get; init; }
    public string FileName { get; init; } = "";
    public long Bytes { get; init; }
    public string? Error { get; init; }
}

public sealed record HistoryArchiveReadResult
{
    public HistoryArchiveReference Reference { get; init; } = new();
    public HistoryArchiveDocument Document { get; init; } = new();
}

// Same-partition encrypted, immutable files. Workspace commit failures may leave an unindexed file;
// discovery and opening are explicitly read-only and never delete, import or replay it.
public sealed class EncryptedHistoryArchiveStore : IHistoryArchiveStore
{
    public const int MaximumFileBytes = 8 * 1024 * 1024;
    public const int MaximumDiscoveryFiles = 1000;
    public const long MaximumDiscoveryBytes = 64L * 1024 * 1024;
    private static readonly byte[] Header = "HDYHIST1\n"u8.ToArray();
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);
    private readonly string scopeDirectory;
    private readonly string historyDirectory;
    private readonly IStateProtector protector;
    private readonly SemaphoreSlim io = new(1, 1);
    public string ScopeId { get; }

    public EncryptedHistoryArchiveStore(string scopeDirectory, string expectedScopeId, IStateProtector protector)
    {
        ArgumentNullException.ThrowIfNull(protector);
        if (expectedScopeId == null || expectedScopeId.Length != 64 ||
            expectedScopeId.Any(c => !char.IsAsciiHexDigit(c) || char.IsAsciiLetterUpper(c)))
            throw new ArgumentException("历史档案必须使用明确的本机身份分区。", nameof(expectedScopeId));
        ArgumentException.ThrowIfNullOrWhiteSpace(scopeDirectory);
        this.scopeDirectory = Path.TrimEndingDirectorySeparator(Path.GetFullPath(scopeDirectory));
        if (!string.Equals(Path.GetFileName(this.scopeDirectory), expectedScopeId, StringComparison.Ordinal))
            throw new ArgumentException("历史档案目录与登录身份分区不匹配。", nameof(scopeDirectory));
        ScopeId = expectedScopeId;
        historyDirectory = Path.Combine(this.scopeDirectory, "history");
        this.protector = protector;
        CheckDirectories();
    }

    public async Task<HistoryArchiveReference> WriteAsync(HistoryArchiveDocument document,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(document);
        // Detach mutable containers before the first await. Original IDs, strings and value fields stay exact.
        var captured = document with { Operations = (document.Operations ?? throw Invalid("档案操作字段缺失。"))
            .Select(operation => operation == null ? throw Invalid("档案操作字段缺失。") : operation with
                { DependencyIds = operation.DependencyIds?.ToArray() ?? throw Invalid("档案依赖字段缺失。") }).ToArray() };
        ValidateDocument(captured);
        await io.WaitAsync(cancellationToken);
        string? temporary = null;
        byte[]? plaintext = null;
        try
        {
            CheckDirectories();
            var destination = PathFor(captured.Id);
            // Do not even protect again when the immutable name has already been published.
            if (File.Exists(destination) || Directory.Exists(destination)) throw new IOException("同名历史档案已存在；禁止覆盖。");
            // Bound serialized output while writing, including JSON escaping expansion, before encryption.
            using (var buffer = new LimitedMemoryStream(MaximumFileBytes - Header.Length))
            {
                JsonSerializer.Serialize(buffer, captured, WorkspaceJson.Options);
                plaintext = buffer.ToArray();
            }
            cancellationToken.ThrowIfCancellationRequested();
            var encrypted = protector.Protect(plaintext) ?? throw Invalid("历史档案加密失败。");
            if (ReferenceEquals(plaintext, encrypted)) encrypted = encrypted.ToArray();
            CryptographicOperations.ZeroMemory(plaintext);
            plaintext = null;
            if (encrypted.Length == 0 || encrypted.Length > MaximumFileBytes - Header.Length)
                throw Invalid("加密历史档案超过 8 MiB 限制。");
            cancellationToken.ThrowIfCancellationRequested();
            Directory.CreateDirectory(historyDirectory);
            CheckDirectories();
            temporary = Path.Combine(historyDirectory, captured.Id + "." + Guid.NewGuid().ToString("N") + ".tmp");
            await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(Header, cancellationToken);
                await stream.WriteAsync(encrypted, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }
            cancellationToken.ThrowIfCancellationRequested();
            // Hash the complete durable encrypted file, including its version header, before publishing it.
            var bytes = new FileInfo(temporary).Length;
            string digest;
            await using (var input = new FileStream(temporary, FileMode.Open, FileAccess.Read, FileShare.Read,
                4096, FileOptions.Asynchronous | FileOptions.SequentialScan))
                digest = Convert.ToHexStringLower(await SHA256.HashDataAsync(input, cancellationToken));
            cancellationToken.ThrowIfCancellationRequested();
            CheckDirectories();
            File.Move(temporary, destination, overwrite: false);
            temporary = null;
            return new() { Id = captured.Id, FileName = captured.Id + ".bin", Count = captured.Operations.Count,
                Bytes = bytes, Sha256 = digest, CreatedAt = captured.CreatedAt };
        }
        finally
        {
            if (plaintext != null) CryptographicOperations.ZeroMemory(plaintext);
            if (temporary != null) try { File.Delete(temporary); } catch (IOException) { } catch (UnauthorizedAccessException) { }
            io.Release();
        }
    }

    public async Task<HistoryArchiveDocument> ReadAsync(HistoryArchiveReference reference,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(reference);
        ValidateReference(reference);
        await io.WaitAsync(cancellationToken);
        try
        {
            var result = await ReadFileAsync(reference.Id, reference, cancellationToken);
            return result.Document;
        }
        finally { io.Release(); }
    }

    public async Task<HistoryArchiveReadResult> ReadUnindexedAsync(string id,
        CancellationToken cancellationToken = default)
    {
        ValidateId(id);
        await io.WaitAsync(cancellationToken);
        try { return await ReadFileAsync(id, null, cancellationToken); }
        finally { io.Release(); }
    }

    public async Task<IReadOnlyList<HistoryArchiveFile>> ListAsync(CancellationToken cancellationToken = default)
    {
        await io.WaitAsync(cancellationToken);
        try
        {
            CheckDirectories();
            if (!Directory.Exists(historyDirectory)) return Array.Empty<HistoryArchiveFile>();
            var files = new List<HistoryArchiveFile>();
            long scannedBytes = 0;
            // Do not sort the unbounded directory enumeration before applying limits.
            foreach (var path in Directory.EnumerateFileSystemEntries(historyDirectory))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (files.Count >= MaximumDiscoveryFiles)
                {
                    files.Add(new() { FileName = "（扫描未完成）", Error = "历史档案扫描已达到 1000 项上限；其余文件尚未检查，原文件均已保留。" });
                    break;
                }
                var name = Path.GetFileName(path);
                var file = new HistoryArchiveFile { FileName = name };
                try
                {
                    var attributes = File.GetAttributes(path);
                    if ((attributes & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != 0)
                        throw Invalid("历史档案不是普通文件；已保留原项。");
                    file = file with { Bytes = new FileInfo(path).Length };
                    if (!name.EndsWith(".bin", StringComparison.Ordinal)) throw Invalid("未知历史文件；已保留原文件。");
                    var id = name[..^4];
                    ValidateId(id);
                    file = file with { Id = id };
                    if (file.Bytes is > 0 and <= MaximumFileBytes)
                    {
                        if (scannedBytes + file.Bytes > MaximumDiscoveryBytes)
                        {
                            files.Add(file with { Error = "历史档案扫描已达到 64 MiB 读取上限；此文件及其余文件尚未检查，原文件均已保留。" });
                            break;
                        }
                        scannedBytes += file.Bytes;
                    }
                    _ = await ReadFileAsync(id, null, cancellationToken);
                }
                catch (Exception error) when (error is InvalidDataException or IOException or UnauthorizedAccessException or ArgumentException)
                {
                    file = file with { Error = error.Message };
                }
                files.Add(file);
            }
            return files.OrderBy(file => file.FileName, StringComparer.Ordinal).ToArray();
        }
        finally { io.Release(); }
    }

    private async Task<HistoryArchiveReadResult> ReadFileAsync(string id, HistoryArchiveReference? expected,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        CheckDirectories();
        var path = PathFor(id);
        if ((File.GetAttributes(path) & (FileAttributes.ReparsePoint | FileAttributes.Directory)) != 0)
            throw Invalid("历史档案不是普通文件；已保留原项。");
        byte[] bytes;
        await using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 4096,
            FileOptions.Asynchronous | FileOptions.SequentialScan))
        {
            // Bound both allocation and reading. A growing file cannot bypass the preflight length limit.
            var length = stream.Length;
            if (length <= Header.Length || length > MaximumFileBytes || expected != null && length != expected.Bytes)
                throw Invalid("历史档案文件大小异常；已保留原文件。");
            bytes = new byte[checked((int)length)];
            await stream.ReadExactlyAsync(bytes, cancellationToken);
            if (stream.ReadByte() != -1) throw Invalid("历史档案读取期间大小发生变化；已保留原文件。");
        }
        var digest = Convert.ToHexStringLower(SHA256.HashData(bytes));
        if (expected != null && !CryptographicOperations.FixedTimeEquals(Convert.FromHexString(digest), Convert.FromHexString(expected.Sha256)))
            throw Invalid("历史档案完整性校验失败；已保留原文件。");
        if (!bytes.AsSpan(0, Header.Length).SequenceEqual(Header))
            throw Invalid("历史档案格式损坏或版本不受支持；已保留原文件。");
        byte[]? plaintext = null;
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            plaintext = protector.Unprotect(bytes[Header.Length..]) ?? throw Invalid("无法解密历史档案。");
            if (plaintext.Length == 0 || plaintext.Length > MaximumFileBytes - Header.Length)
                throw Invalid("历史档案明文大小异常；已保留原文件。");
            var document = JsonSerializer.Deserialize<HistoryArchiveDocument>(plaintext, WorkspaceJson.Options)
                ?? throw Invalid("历史档案没有有效数据。");
            ValidateDocument(document);
            if (document.Id != id || expected != null &&
                (document.Operations.Count != expected.Count || !document.CreatedAt.EqualsExact(expected.CreatedAt)))
                throw Invalid("历史档案与保存的索引不匹配；已保留原文件。");
            cancellationToken.ThrowIfCancellationRequested();
            return new()
            {
                Document = document,
                Reference = new() { Id = id, FileName = id + ".bin", Count = document.Operations.Count,
                    Bytes = bytes.LongLength, Sha256 = digest, CreatedAt = document.CreatedAt }
            };
        }
        catch (Exception error) when (error is JsonException or CryptographicException or NotSupportedException)
        { throw new InvalidDataException("无法解密或读取历史档案；已保留原文件。", error); }
        finally { if (plaintext != null) CryptographicOperations.ZeroMemory(plaintext); }
    }

    private void ValidateDocument(HistoryArchiveDocument document)
    {
        ValidateId(document.Id);
        if (document.Schema != 1) throw Invalid("不支持此历史档案版本；禁止改写。");
        if (document.ScopeId != ScopeId) throw Invalid("历史档案与服务或登录身份不匹配。");
        if (document.SourceRevision < 0 || document.CreatedAt == default || document.Operations == null ||
            document.Operations.Count is < 1 or > 1000) throw Invalid("历史档案元数据无效。");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var semanticIds = new HashSet<Guid>();
        long textBytes = 0;
        foreach (var operation in document.Operations)
        {
            if (operation == null || !Guid.TryParseExact(operation.Id, "D", out var operationId) || operationId == Guid.Empty ||
                !ids.Add(operation.Id) || !semanticIds.Add(operationId) || string.IsNullOrWhiteSpace(operation.ResourceKey) ||
                string.IsNullOrWhiteSpace(operation.Method) || string.IsNullOrWhiteSpace(operation.Path) || operation.BodyJson == null)
                throw Invalid("历史档案存在无效操作。");
            if (operation.Status != PendingStatus.Superseded || operation.SendAttempts != 0 ||
                operation.PreparedBodyJson != null || operation.RemoteJson != null || operation.RecoveredAtRevision != 0 ||
                operation.ConfirmedRevision != 0) throw Invalid("只允许保存从未发送的已替代或已取消历史。");
            if (operation.DependencyIds == null || operation.DependencyIds.Count > 64 ||
                operation.DependencyIds.Any(dependency => !Guid.TryParseExact(dependency, "D", out var value) || value == Guid.Empty || value == operationId) ||
                operation.DependencyIds.Distinct(StringComparer.Ordinal).Count() != operation.DependencyIds.Count ||
                operation.VersionFromDependencyId != null && !operation.DependencyIds.Contains(operation.VersionFromDependencyId, StringComparer.Ordinal) ||
                operation.SupersededById != null && (!Guid.TryParseExact(operation.SupersededById, "D", out var next) || next == Guid.Empty || next == operationId))
                throw Invalid("历史档案操作依赖无效。");
            // JSON encoders replace malformed UTF-16. Reject it instead of silently changing original evidence.
            try
            {
                foreach (var text in new[] { operation.ResourceKey, operation.Method, operation.Path, operation.BodyJson, operation.Error })
                    if (text != null)
                    {
                        textBytes += StrictUtf8.GetByteCount(text);
                        if (textBytes > MaximumFileBytes - Header.Length) throw Invalid("历史档案原文字段超过 8 MiB 限制。");
                    }
            }
            catch (EncoderFallbackException error) { throw new InvalidDataException("历史档案含无效 Unicode；原始记录已保留。", error); }
            try { using var json = JsonDocument.Parse(operation.BodyJson); }
            catch (JsonException error) { throw new InvalidDataException("历史档案原始请求不是有效 JSON；已保留原文件。", error); }
        }
    }

    private static void ValidateReference(HistoryArchiveReference reference)
    {
        ValidateId(reference.Id);
        if (reference.FileName != reference.Id + ".bin" || reference.Count is < 1 or > 1000 ||
            reference.Bytes <= Header.Length || reference.Bytes > MaximumFileBytes || reference.CreatedAt == default ||
            reference.Sha256 == null || reference.Sha256.Length != 64 || reference.Sha256.Any(c => !char.IsAsciiHexDigit(c)))
            throw Invalid("历史档案索引无效；禁止读取其他路径。");
    }

    private static void ValidateId(string id)
    {
        if (!Guid.TryParseExact(id, "D", out var value) || value == Guid.Empty || id != value.ToString("D"))
            throw Invalid("历史档案标识必须是规范 UUID；禁止读取其他路径。");
    }

    private string PathFor(string id)
    {
        ValidateId(id);
        return Path.Combine(historyDirectory, id + ".bin");
    }

    private void CheckDirectories()
    {
        // Neither an account directory nor its archive directory may redirect to another location.
        foreach (var directory in new[] { scopeDirectory, historyDirectory })
        {
            FileAttributes attributes;
            try { attributes = File.GetAttributes(directory); }
            catch (FileNotFoundException) { continue; }
            catch (DirectoryNotFoundException) { continue; }
            if ((attributes & FileAttributes.Directory) == 0 || (attributes & FileAttributes.ReparsePoint) != 0)
                throw Invalid("历史档案目录必须是普通目录，不能是链接或重解析点；已保留原项。");
        }
    }

    private static InvalidDataException Invalid(string message) => new(message);

    private sealed class LimitedMemoryStream(int limit) : MemoryStream
    {
        private void CheckLength(int count)
        {
            if (count < 0 || Position + count > limit) throw Invalid("历史档案明文超过 8 MiB 限制。");
        }
        public override void Write(byte[] buffer, int offset, int count)
        { CheckLength(count); base.Write(buffer, offset, count); }
        public override void Write(ReadOnlySpan<byte> buffer)
        { CheckLength(buffer.Length); base.Write(buffer); }
        public override void WriteByte(byte value)
        { CheckLength(1); base.WriteByte(value); }
        protected override void Dispose(bool disposing)
        {
            if (disposing && TryGetBuffer(out var buffer)) CryptographicOperations.ZeroMemory(buffer.AsSpan());
            base.Dispose(disposing);
        }
    }
}
