using System.Runtime.CompilerServices;
using System.Text;

[assembly: InternalsVisibleTo("Haoduoyu.Core.Tests")]

namespace Haoduoyu.Core;

/// <summary>Exports plain text without truncating an existing destination before commit.</summary>
public static class AtomicTextExport
{
    public const int MaxUtf8Bytes = 64 * 1024 * 1024;
    private static readonly UTF8Encoding StrictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    public static Task WriteAsync(string destinationPath, string text, CancellationToken cancellationToken = default) =>
        WriteCheckedAsync(destinationPath, text, cancellationToken, beforeCommit: null);

    // The callback is an internal deterministic fault boundary for synthetic safety checks only.
    internal static async Task WriteCheckedAsync(string destinationPath, string text, CancellationToken cancellationToken,
        Func<string, Task>? beforeCommit)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(destinationPath);
        ArgumentNullException.ThrowIfNull(text);
        cancellationToken.ThrowIfCancellationRequested();
        var destination = Path.GetFullPath(destinationPath);
        var original = InspectDestination(destination);
        // Every UTF-16 code unit requires at least one UTF-8 byte (a surrogate pair requires four).
        // This also prevents GetByteCount overflowing on enormous inputs.
        if (text.Length > MaxUtf8Bytes || StrictUtf8.GetByteCount(text) > MaxUtf8Bytes)
            throw new InvalidDataException("纯文本导出不得超过 64 MiB（按实际 UTF-8 字节计算）。");
        cancellationToken.ThrowIfCancellationRequested();
        string? temporary = null;
        try
        {
            var candidate = Path.Combine(Path.GetDirectoryName(destination)!, ".haoduoyu-export-" + Guid.NewGuid().ToString("N") + ".tmp");
            await using (var stream = new FileStream(candidate, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                bufferSize: 65536, FileOptions.Asynchronous))
            {
                // Own the name only after CreateNew succeeds. Never clean up somebody else's collision.
                temporary = candidate;
                await using (var writer = new StreamWriter(stream, StrictUtf8, bufferSize: 16384, leaveOpen: true))
                {
                    await writer.WriteAsync(text.AsMemory(), cancellationToken).ConfigureAwait(false);
                    await writer.FlushAsync(cancellationToken).ConfigureAwait(false);
                }
                cancellationToken.ThrowIfCancellationRequested();
                stream.Flush(flushToDisk: true);
            }
            if (beforeCommit is not null) await beforeCommit(temporary).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            var current = InspectDestination(destination);
            if (original != current)
                throw new IOException("导出目标在准备期间发生变化。原目标未被本次导出覆盖，请重新选择并确认。");
            cancellationToken.ThrowIfCancellationRequested();
            // Never upgrade an initially new export to an overwrite. A racing creator wins and Move fails.
            // There is intentionally no delete-then-move or non-atomic fallback.
            if (original is null) File.Move(temporary, destination, overwrite: false);
            else File.Replace(temporary, destination, destinationBackupFileName: null, ignoreMetadataErrors: false);
            temporary = null;
            // Commit is the success boundary. Cancellation arriving after it must not claim no export occurred.
        }
        catch (Exception failure)
        {
            if (temporary is not null)
            {
                try { File.Delete(temporary); }
                catch (Exception cleanupFailure)
                {
                    throw new IOException("导出未完成，且无法清理临时纯文本，文件可能残留：" + temporary,
                        new AggregateException(failure, cleanupFailure));
                }
            }
            throw;
        }
    }

    private static DestinationSnapshot? InspectDestination(string path)
    {
        FileAttributes attributes;
        try { attributes = File.GetAttributes(path); }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        if ((attributes & FileAttributes.ReparsePoint) != 0)
            throw new IOException("导出目标不能是符号链接或重解析点。请选择普通文件。");
        if ((attributes & FileAttributes.Directory) != 0)
            throw new IOException("导出目标是目录，请选择文件路径。");
        if ((attributes & FileAttributes.ReadOnly) != 0)
            throw new UnauthorizedAccessException("导出目标为只读文件，未覆盖原文件。");
        if (!OperatingSystem.IsWindows() &&
            (File.GetUnixFileMode(path) & (UnixFileMode.UserWrite | UnixFileMode.GroupWrite | UnixFileMode.OtherWrite)) == 0)
            throw new UnauthorizedAccessException("导出目标不可写，未覆盖原文件。");
        // Check write access without writing/truncating. Atomic rename alone can otherwise replace a
        // non-writable Unix file when its parent directory is writable.
        using (File.OpenHandle(path, FileMode.Open, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete)) { }
        var info = new FileInfo(path);
        // Detect ordinary concurrent edits/replacements. This is not an inode-level compare-and-swap:
        // managed cross-platform APIs cannot fence a hostile directory mutation after this check.
        return new DestinationSnapshot(info.Length, info.LastWriteTimeUtc, info.CreationTimeUtc);
    }

    private sealed record DestinationSnapshot(long Length, DateTime LastWriteUtc, DateTime CreatedUtc);
}
