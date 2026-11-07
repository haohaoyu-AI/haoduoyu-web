using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace Haoduoyu.Core;

public sealed record RecoveryPartition(string ScopeId, string? Error);
public sealed record RecoveryPartitionDiscovery(IReadOnlyList<RecoveryPartition> Partitions, int ExaminedEntries, bool Complete, string? Error);
public sealed record RecoverySnapshot(string ScopeId, string OriginalJson, string Preview, bool PreviewTruncated);

/// <summary>Reads original JSON only. Never opens a workspace lock, creates paths, or instantiates an engine.</summary>
public static class ReadOnlyWorkspaceRecovery
{
    public const int MaxBytes = 32 * 1024 * 1024;
    public const int MaxPartitions = 1000;
    public const int MaxPreviewCharacters = 256 * 1024;
    private static readonly byte[] Header = "HDYWS1\n"u8.ToArray();
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    // The entry budget includes unrelated files/directories, so a hostile directory cannot force an
    // unbounded traversal just by giving entries invalid names. An extra MoveNext only detects overflow.
    public static RecoveryPartitionDiscovery Discover(string rootDirectory, CancellationToken cancellationToken = default)
    {
        var entries = new List<RecoveryPartition>(); var examined = 0; var opened = false;
        cancellationToken.ThrowIfCancellationRequested();
        var root = Path.GetFullPath(rootDirectory);
        try
        {
            using var rootHandle = OpenDirectory(root);
            opened = true;
            using var paths = Directory.EnumerateFileSystemEntries(root).GetEnumerator();
            while (paths.MoveNext())
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (examined == MaxPartitions)
                    return new(entries, examined, false, "历史分区发现达到 1000 项读取上限；清单不完整，未读取的分区不能视为不存在。原件保留。");
                examined++;
                var scope = Path.GetFileName(paths.Current);
                if (!IsScope(scope)) continue;
                try
                {
                    using var partition = OpenDirectory(paths.Current, rootHandle, scope);
                    var path = Path.Combine(paths.Current, "workspace.bin");
                    // Missing primary is not a recoverable primary snapshot; never substitute its backup.
                    if (!File.Exists(path) && new FileInfo(path).LinkTarget is null) continue;
                    using var file = OpenFile(path, partition);
                    entries.Add(new(scope, null));
                }
                catch (Exception error) when (IsReadFailure(error)) { entries.Add(new(scope, Failure(error))); }
            }
            VerifyDirectory(root, rootHandle);
            return new(entries, examined, true, null);
        }
        catch (Exception error) when (!opened && (error is FileNotFoundException or DirectoryNotFoundException) &&
            !Directory.Exists(root) && new DirectoryInfo(root).LinkTarget is null)
        { return new(entries, examined, true, null); }
        catch (Exception error) when (IsReadFailure(error)) { return new(entries, examined, false, Failure(error)); }
    }

    public static async Task<RecoverySnapshot> ReadAsync(string rootDirectory, string scopeId, IStateProtector protector,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(protector);
        if (!IsScope(scopeId)) throw new InvalidDataException("历史分区名必须是小写 64 位 scope 哈希；原件保留。");
        cancellationToken.ThrowIfCancellationRequested();
        var root = Path.GetFullPath(rootDirectory); var directory = Path.Combine(root, scopeId);
        using var rootHandle = OpenDirectory(root);
        using var partitionHandle = OpenDirectory(directory, rootHandle, scopeId);
        using var handle = OpenFile(Path.Combine(directory, "workspace.bin"), partitionHandle);
        await using var stream = new FileStream(handle, FileAccess.Read, 65536, isAsync: false);
        byte[]? clear = null;
        try
        {
            var ciphertext = await ReadPayloadAsync(stream, cancellationToken).ConfigureAwait(false);
            VerifyDirectory(root, rootHandle); VerifyDirectory(directory, partitionHandle);
            cancellationToken.ThrowIfCancellationRequested();
            clear = protector.Unprotect(ciphertext);
            cancellationToken.ThrowIfCancellationRequested();
            if (clear.Length == 0 || clear.Length > MaxBytes)
                throw new InvalidDataException("解密后的历史分区超过 32 MiB 或为空；原件保留。");
            ValidateJson(clear, scopeId, cancellationToken);
            var json = StrictUtf8.GetString(clear);
            cancellationToken.ThrowIfCancellationRequested();
            // WPF may normalize lone CR/LF to CRLF when loading TextBox.Text. Budget the
            // worst-case displayed UTF-16 length while retaining an exact original prefix.
            var length = 0; var displayedLength = 0;
            while (length < json.Length)
            {
                var first = json[length];
                var pair = length + 1 < json.Length &&
                    (first == '\r' && json[length + 1] == '\n' ||
                     char.IsHighSurrogate(first) && char.IsLowSurrogate(json[length + 1]));
                var sourceUnits = pair ? 2 : 1;
                var displayedUnits = first is '\r' or '\n' ? 2 : sourceUnits;
                if (displayedLength + displayedUnits > MaxPreviewCharacters) break;
                displayedLength += displayedUnits; length += sourceUnits;
            }
            // Do not pretty-print the whole document: the raw copy preserves unknown fields and exact text.
            return new(scopeId, json, json[..length], length < json.Length);
        }
        catch (Exception error) when (error is JsonException or CryptographicException or DecoderFallbackException)
        { throw new InvalidDataException("无法解密或读取历史分区 JSON；原文件与备份均已保留。", error); }
        finally { if (clear is not null) CryptographicOperations.ZeroMemory(clear); }
    }

    // Stream checks, not FileInfo alone, bound the allocation and every actual read. Internal for
    // deterministic growth/truncation/cancellation checks without racing a real filesystem writer.
    internal static async Task<byte[]> ReadPayloadAsync(Stream stream, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var length = stream.Length;
        if (length <= Header.Length || length > MaxBytes + Header.Length)
            throw new InvalidDataException("历史分区文件大小异常（密文上限 32 MiB）；原件保留。");
        var header = new byte[Header.Length];
        await stream.ReadExactlyAsync(header, cancellationToken).ConfigureAwait(false);
        if (!header.AsSpan().SequenceEqual(Header)) throw new InvalidDataException("历史分区格式损坏或版本不受支持；原件保留。");
        var payload = new byte[checked((int)length - Header.Length)];
        var offset = 0;
        while (offset < payload.Length)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var count = await stream.ReadAsync(payload.AsMemory(offset, Math.Min(65536, payload.Length - offset)), cancellationToken).ConfigureAwait(false);
            if (count == 0) throw new InvalidDataException("历史分区读取期间缩短；原件保留，请重新只读检查。");
            offset += count;
        }
        var extra = new byte[1];
        if (await stream.ReadAsync(extra, cancellationToken).ConfigureAwait(false) != 0 || stream.Length != length)
            throw new InvalidDataException("历史分区读取期间大小变化；原件保留，请重新只读检查。");
        return payload;
    }

    private static void ValidateJson(ReadOnlySpan<byte> clear, string scopeId, CancellationToken cancellationToken)
    {
        var reader = new Utf8JsonReader(clear, new JsonReaderOptions { MaxDepth = 128 });
        if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject) throw new InvalidDataException("历史分区 JSON 必须是对象；原件保留。");
        var scopes = 0; var tokens = 0;
        while (reader.Read())
        {
            if ((++tokens & 255) == 0) cancellationToken.ThrowIfCancellationRequested();
            if (reader.CurrentDepth == 1 && reader.TokenType == JsonTokenType.PropertyName && reader.ValueTextEquals("ScopeId"))
            {
                if (++scopes != 1 || !reader.Read() || reader.TokenType != JsonTokenType.String || !reader.ValueTextEquals(scopeId))
                    throw new InvalidDataException("历史分区内容的 ScopeId 与所选分区不匹配或重复；原件保留。");
            }
        }
        if (scopes != 1) throw new InvalidDataException("历史分区缺少明确的 ScopeId；原件保留。");
        cancellationToken.ThrowIfCancellationRequested();
    }

    private static bool IsScope(string value) => value.Length == 64 && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    private static bool IsReadFailure(Exception error) => error is IOException or UnauthorizedAccessException or Win32Exception;
    private static string Failure(Exception error) => "只读检查失败，原件保留：" + error.Message;

    private static void CheckAttributes(string path, bool directory)
    {
        var attributes = File.GetAttributes(path);
        if ((attributes & FileAttributes.ReparsePoint) != 0 ||
            (directory ? new DirectoryInfo(path).LinkTarget : new FileInfo(path).LinkTarget) is not null)
            throw new IOException("历史分区根目录、分区及最终文件不能是符号链接或重解析点。");
        if (((attributes & FileAttributes.Directory) != 0) != directory)
            throw new IOException("历史分区路径类型异常；原件保留。");
    }

    private static SafeFileHandle OpenDirectory(string path, SafeFileHandle? parent = null, string? name = null)
    {
        CheckAttributes(path, directory: true);
        if (OperatingSystem.IsWindows()) return OpenWindows(path, directory: true);
        if (OperatingSystem.IsLinux())
        {
            // Relative no-follow opens pin the actual root and selected partition, not a racing pathname.
            var fd = parent is null ? LinuxOpen(path, 0xB0000) : LinuxOpenAt(parent, name!, 0xB0000);
            if (fd < 0) throw NativeError("无法只读打开历史分区目录");
            return new SafeFileHandle((IntPtr)fd, ownsHandle: true);
        }
        throw new PlatformNotSupportedException("历史分区安全只读恢复目前仅支持 Windows 和 Linux 检查环境。");
    }

    private static SafeFileHandle OpenFile(string path, SafeFileHandle partition)
    {
        CheckAttributes(path, directory: false);
        if (OperatingSystem.IsWindows()) return OpenWindows(path, directory: false);
        var fd = LinuxOpenAt(partition, "workspace.bin", 0xA0800); // O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK | O_RDONLY
        if (fd < 0) throw NativeError("无法只读打开历史分区原件");
        return new SafeFileHandle((IntPtr)fd, ownsHandle: true);
    }

    private static void VerifyDirectory(string path, SafeFileHandle handle)
    {
        CheckAttributes(path, directory: true);
        if (OperatingSystem.IsWindows()) VerifyWindowsHandle(path, handle, directory: true);
    }

    private static SafeFileHandle OpenWindows(string path, bool directory)
    {
        // No DELETE share pins directories against rename/link replacement. No WRITE share on the
        // final file refuses concurrent writers rather than presenting a possibly mixed snapshot.
        var handle = CreateFile(path, directory ? 0u : 0x80000000u, directory ? 3u : 1u, IntPtr.Zero, 3,
            0x00200000u | (directory ? 0x02000000u : 0x08000000u), IntPtr.Zero);
        if (handle.IsInvalid) { handle.Dispose(); throw NativeError("无法只读打开历史分区（文件可能正在保存）"); }
        try { VerifyWindowsHandle(path, handle, directory); return handle; }
        catch { handle.Dispose(); throw; }
    }

    private static void VerifyWindowsHandle(string path, SafeFileHandle handle, bool directory)
    {
        if (!GetFileInformationByHandleEx(handle, 9, out var info, 8)) throw NativeError("无法核对历史分区句柄");
        if ((info.Attributes & 0x400) != 0 || ((info.Attributes & 0x10) != 0) != directory)
            throw new IOException("拒绝历史分区链接、重解析点或异常路径类型；原件保留。");
        var buffer = new StringBuilder(32768);
        var length = GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0 || length >= buffer.Capacity) throw NativeError("无法核对历史分区最终路径");
        var actual = buffer.ToString();
        if (actual.StartsWith("\\\\?\\UNC\\", StringComparison.OrdinalIgnoreCase)) actual = "\\\\" + actual[8..];
        else if (actual.StartsWith("\\\\?\\", StringComparison.Ordinal)) actual = actual[4..];
        if (!string.Equals(Path.TrimEndingDirectorySeparator(Path.GetFullPath(actual)), Path.TrimEndingDirectorySeparator(Path.GetFullPath(path)), StringComparison.OrdinalIgnoreCase))
            throw new IOException("历史分区实际路径被链接或重命名改变；原件保留。");
    }

    private static IOException NativeError(string message) => new(message + "；原件保留。", new Win32Exception(Marshal.GetLastWin32Error()));
    [StructLayout(LayoutKind.Sequential)] private struct AttributeTagInfo { public uint Attributes; public uint Tag; }
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int infoClass, out AttributeTagInfo info, uint size);
    [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, uint size, uint flags);
    [DllImport("libc", EntryPoint = "open", SetLastError = true)] private static extern int LinuxOpen(string path, int flags);
    [DllImport("libc", EntryPoint = "openat", SetLastError = true)] private static extern int LinuxOpenAt(SafeFileHandle directory, string path, int flags);
}
