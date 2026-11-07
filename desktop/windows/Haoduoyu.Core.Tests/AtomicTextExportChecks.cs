using System.Text;
using Haoduoyu.Core;

internal static class AtomicTextExportChecks
{
    internal static async Task<int> RunAsync()
    {
        var tests = new (string Name, Func<string, Task> Run)[]
        {
            ("New text export is exact strict UTF-8 without BOM", async root =>
            {
                var path = Path.Combine(root, "新文件.txt");
                const string text = "中文、emoji 🐟\nsecond line\r\n";
                await AtomicTextExport.WriteAsync(path, text);
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(new UTF8Encoding(false, true).GetBytes(text)), "UTF-8 bytes differ");
                NoTemporaryFiles(root);
            }),
            ("Existing and empty text exports commit without leftovers", async root =>
            {
                var path = Path.Combine(root, "existing.txt");
                await File.WriteAllTextAsync(path, "old export that must not be truncated on failures");
                await AtomicTextExport.WriteAsync(path, "替换 🐟");
                Check(await File.ReadAllTextAsync(path) == "替换 🐟", "replacement missing");
                await AtomicTextExport.WriteAsync(path, "");
                Check(new FileInfo(path).Length == 0, "empty replacement invalid");
                await AtomicTextExport.WriteAsync(Path.Combine(root, "empty-new.txt"), "");
                Check(new FileInfo(Path.Combine(root, "empty-new.txt")).Length == 0, "empty new export invalid");
                NoTemporaryFiles(root);
            }),
            ("Pre-cancelled export preserves old file and creates no new file", async root =>
            {
                var old = await OldFile(root);
                using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
                await Throws<OperationCanceledException>(() => AtomicTextExport.WriteAsync(old, "new", cancelled.Token));
                var absent = Path.Combine(root, "absent.txt");
                await Throws<OperationCanceledException>(() => AtomicTextExport.WriteAsync(absent, "new", cancelled.Token));
                Check(!File.Exists(absent), "cancelled export created file");
                await OldFileUnchanged(old); NoTemporaryFiles(root);
            }),
            ("Unpaired UTF-16 surrogates fail without replacement characters", async root =>
            {
                var old = await OldFile(root);
                foreach (var invalid in new[] { "before\ud800after", "\udfff", "\ud800" })
                    await Throws<EncoderFallbackException>(() => AtomicTextExport.WriteAsync(old, invalid));
                await OldFileUnchanged(old); NoTemporaryFiles(root);
            }),
            ("64 MiB limit measures actual UTF-8 rather than character count", async root =>
            {
                var old = await OldFile(root);
                await Throws<InvalidDataException>(() => AtomicTextExport.WriteAsync(old, new string('中', AtomicTextExport.MaxUtf8Bytes / 3 + 1)));
                await OldFileUnchanged(old); NoTemporaryFiles(root);
                var exact = Path.Combine(root, "exact-limit.txt");
                await AtomicTextExport.WriteAsync(exact, new string('x', AtomicTextExport.MaxUtf8Bytes));
                Check(new FileInfo(exact).Length == 64L * 1024 * 1024, "exact limit was not accepted");
                NoTemporaryFiles(root);
            }),
            ("Directory destination and missing parent fail without creating paths", async root =>
            {
                var directory = Path.Combine(root, "directory"); Directory.CreateDirectory(directory);
                await Throws<IOException>(() => AtomicTextExport.WriteAsync(directory, "new"));
                var parent = Path.Combine(root, "missing");
                await Throws<DirectoryNotFoundException>(() => AtomicTextExport.WriteAsync(Path.Combine(parent, "new.txt"), "new"));
                Check(Directory.Exists(directory) && !Directory.Exists(parent), "destination directory changed"); NoTemporaryFiles(root);
            }),
            ("Read-only destination is never atomically replaced", async root =>
            {
                var old = await OldFile(root);
                File.SetAttributes(old, File.GetAttributes(old) | FileAttributes.ReadOnly);
                try
                {
                    await Throws<UnauthorizedAccessException>(() => AtomicTextExport.WriteAsync(old, "new"));
                    await OldFileUnchanged(old); NoTemporaryFiles(root);
                }
                finally { File.SetAttributes(old, FileAttributes.Normal); }
            }),
            ("Final file and dangling symbolic links are refused", async root =>
            {
                var protectedFile = Path.Combine(root, "protected.txt"); await File.WriteAllTextAsync(protectedFile, "protected");
                var link = Path.Combine(root, "link.txt");
                CreateLinkOrSkip(link, protectedFile);
                await Throws<IOException>(() => AtomicTextExport.WriteAsync(link, "new"));
                Check(await File.ReadAllTextAsync(protectedFile) == "protected", "symlink target changed");
                Check(new FileInfo(link).LinkTarget is not null, "symlink replaced");
                var dangling = Path.Combine(root, "dangling.txt"); var missing = Path.Combine(root, "missing.txt");
                File.CreateSymbolicLink(dangling, missing);
                await Throws<IOException>(() => AtomicTextExport.WriteAsync(dangling, "new"));
                Check(!File.Exists(missing) && new FileInfo(dangling).LinkTarget is not null, "dangling link followed/replaced");
                var old = await OldFile(root);
                await Throws<IOException>(() => AtomicTextExport.WriteCheckedAsync(old, "prepared", default, _ =>
                {
                    File.Delete(old); File.CreateSymbolicLink(old, protectedFile); return Task.CompletedTask;
                }));
                Check(new FileInfo(old).LinkTarget is not null && await File.ReadAllTextAsync(protectedFile) == "protected", "late symbolic link followed/replaced");
                NoTemporaryFiles(root);
            }),
            ("Cancellation after durable preparation preserves old file and cleans plaintext", async root =>
            {
                var old = await OldFile(root); using var cancellation = new CancellationTokenSource();
                await Throws<OperationCanceledException>(() => AtomicTextExport.WriteCheckedAsync(old, "prepared 🐟", cancellation.Token, async temporary =>
                {
                    Check(Path.GetDirectoryName(temporary) == root, "temporary not in destination directory");
                    Check(await File.ReadAllTextAsync(temporary) == "prepared 🐟", "temporary incomplete before commit");
                    cancellation.Cancel();
                }));
                await OldFileUnchanged(old); NoTemporaryFiles(root);
            }),
            ("Preparation failure preserves old file and cleans temporary plaintext", async root =>
            {
                var old = await OldFile(root);
                await Throws<IOException>(() => AtomicTextExport.WriteCheckedAsync(old, "prepared", default,
                    _ => throw new IOException("synthetic precommit failure")));
                await OldFileUnchanged(old); NoTemporaryFiles(root);
            }),
            ("Concurrent creator keeps its new destination without overwrite approval", async root =>
            {
                var path = Path.Combine(root, "concurrent-new.txt");
                await Throws<IOException>(() => AtomicTextExport.WriteCheckedAsync(path, "prepared", default,
                    _ => File.WriteAllTextAsync(path, "other program won")));
                Check(await File.ReadAllTextAsync(path) == "other program won", "concurrent new destination overwritten"); NoTemporaryFiles(root);
            }),
            ("Ordinary concurrent edit of existing destination is preserved", async root =>
            {
                var old = await OldFile(root);
                await Throws<IOException>(() => AtomicTextExport.WriteCheckedAsync(old, "prepared", default,
                    _ => File.WriteAllTextAsync(old, "another program edited this file; different length")));
                Check(await File.ReadAllTextAsync(old) == "another program edited this file; different length", "concurrent edit lost"); NoTemporaryFiles(root);
            }),
            ("Commit failure never deletes existing target or leaks temporary text", async root =>
            {
                var path = Path.Combine(root, "new-target.txt");
                await Throws<IOException>(() => AtomicTextExport.WriteCheckedAsync(path, "prepared", default, _ =>
                {
                    Directory.CreateDirectory(path); return Task.CompletedTask;
                }));
                Check(Directory.Exists(path), "racing destination directory deleted"); NoTemporaryFiles(root);
            }),
            ("Cleanup failure reports possible plaintext residue and both causes", async root =>
            {
                var old = await OldFile(root); string? residue = null;
                var error = await Throws<IOException>(() => AtomicTextExport.WriteCheckedAsync(old, "prepared", default, temporary =>
                {
                    residue = temporary;
                    File.Delete(temporary); Directory.CreateDirectory(temporary);
                    File.WriteAllText(Path.Combine(temporary, "synthetic-blocker"), "synthetic");
                    throw new IOException("synthetic original failure");
                }));
                Check(residue is not null && error.Message.Contains(residue, StringComparison.Ordinal) &&
                    error.Message.Contains("可能残留", StringComparison.Ordinal), "cleanup failure falsely claimed cleanup");
                Check(error.InnerException is AggregateException { InnerExceptions.Count: 2 }, "one of the failures was hidden");
                await OldFileUnchanged(old);
                Directory.Delete(residue!, recursive: true); NoTemporaryFiles(root);
            })
        };
        var failures = 0; var skipped = 0;
        foreach (var (name, run) in tests)
        {
            var root = Path.Combine(Path.GetTempPath(), "haoduoyu-export-synthetic-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try { await run(root); Console.WriteLine("PASS " + name); }
            catch (SkipCheckException error) { skipped++; Console.WriteLine("SKIP " + name + ": " + error.Message); }
            catch (Exception error) { failures++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
            finally { Directory.Delete(root, recursive: true); }
        }
        Console.WriteLine($"Atomic text export checks: {tests.Length - failures - skipped}/{tests.Length - skipped} passed; {skipped} skipped");
        return failures;
    }

    private static async Task<string> OldFile(string root)
    {
        var path = Path.Combine(root, "old.txt"); await File.WriteAllTextAsync(path, "original export 🐟"); return path;
    }
    private static async Task OldFileUnchanged(string path) => Check(await File.ReadAllTextAsync(path) == "original export 🐟", "old destination changed");
    private static void NoTemporaryFiles(string root) => Check(Directory.GetFileSystemEntries(root, ".haoduoyu-export-*.tmp").Length == 0, "temporary plaintext leaked");
    private static void CreateLinkOrSkip(string path, string target)
    {
        try { File.CreateSymbolicLink(path, target); }
        catch (Exception error) when (OperatingSystem.IsWindows() &&
            (error is UnauthorizedAccessException or PlatformNotSupportedException || error is IOException && (error.HResult & 0xffff) == 1314))
        {
            throw new SkipCheckException("Windows runner cannot create synthetic symbolic links (" + error.GetType().Name + ").");
        }
    }
    private sealed class SkipCheckException(string message) : Exception(message) { }
    private static async Task<T> Throws<T>(Func<Task> action) where T : Exception
    {
        try { await action(); } catch (T error) { return error; }
        throw new Exception("Expected " + typeof(T).Name);
    }
    private static void Check(bool condition, string reason) { if (!condition) throw new Exception(reason); }
}
