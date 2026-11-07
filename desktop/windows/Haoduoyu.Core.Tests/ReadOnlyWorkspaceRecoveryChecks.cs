using System.Security.Cryptography;
using System.Text;
using Haoduoyu.Core;

internal static class ReadOnlyWorkspaceRecoveryChecks
{
    private static readonly string Scope = new('a', 64);
    private static readonly string OtherScope = new('b', 64);
    internal static async Task<int> RunAsync()
    {
        var tests = new (string Name, Func<string, Task> Run)[]
        {
            ("Read-only recovery preserves exact original unknown JSON and salvages non-executable operation graphs without touching a locked workspace", OriginalJsonAsync),
            ("Read-only recovery rejects invalid partition names, headers, JSON and foreign or duplicate scope without writing", InvalidInputsAsync),
            ("Read-only recovery bounds ciphertext and rejects oversized plaintext while clearing all returned plaintext", SizeBoundsAsync),
            ("Read-only recovery accepts the exact 32 MiB boundary but limits Unicode preview to 256 Ki characters", PreviewBoundaryAsync),
            ("Read-only recovery cancellation before and after decrypt never changes source and clears plaintext", CancellationAsync),
            ("Read-only recovery actual stream rejects growth and truncation with bounded reads", StreamMutationAsync),
            ("Read-only discovery has a 1000-entry budget and never claims an overflow is complete", DiscoveryBudgetAsync),
            ("Read-only discovery reports root errors and leaves an absent root absent", MissingRootAsync),
            ("Read-only recovery rejects root, partition and final-file links, including dangling final links", LinksAsync)
        };
        var failures = 0; var skipped = 0;
        foreach (var (name, run) in tests)
        {
            var root = Path.Combine(Path.GetTempPath(), "haoduoyu-readonly-recovery-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try { await run(root); Console.WriteLine("PASS " + name); }
            catch (SkipCheckException error) { skipped++; Console.WriteLine("SKIP " + name + ": " + error.Message); }
            catch (Exception error) { failures++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
            finally { Directory.Delete(root, recursive: true); }
        }
        Console.WriteLine($"Read-only recovery safety checks: {tests.Length - failures - skipped}/{tests.Length - skipped} passed; {skipped} skipped");
        return failures;
    }

    private static async Task OriginalJsonAsync(string root)
    {
        var protector = new TrackingProtector();
        using var owner = new AtomicWorkspaceStore(root, "https://synthetic.invalid/", "synthetic", protector);
        // The reader must not acquire this already-held workspace.lock or feed the salvage JSON to
        // WorkspaceState/OperationGraph. These broken unknown queue rows are deliberately not executable.
        var json = " \n{\"ScopeId\":\"" + owner.ScopeId + "\",\"Schema\":999,\"Drafts\":{\"raw\":\"原始中文 🐟\"},\"Outbox\":[{\"unknown_broken_graph\":true}],\"future\": {\"x\": 1.00}}\r\n";
        await WriteAsync(owner.FilePath, json);
        var before = await ManifestAsync(root);
        var found = ReadOnlyWorkspaceRecovery.Discover(root);
        Check(found.Complete && found.Partitions.Single().ScopeId == owner.ScopeId && found.Partitions.Single().Error is null, "valid locked partition not discovered");
        var read = await ReadOnlyWorkspaceRecovery.ReadAsync(root, owner.ScopeId, protector);
        Check(read.OriginalJson == json && read.Preview == json && !read.PreviewTruncated, "original whitespace, unknown fields or Unicode lost");
        Check(protector.Clear is not null && protector.Clear.All(b => b == 0), "decrypted original was not cleared");
        Check(await ManifestAsync(root) == before, "read/discovery changed source, created files or acquired persistent lock");
        // The same complete raw text is suitable for the existing atomic text writer, not a typed re-export.
        var export = Path.Combine(root, "chosen-copy.txt");
        await AtomicTextExport.WriteAsync(export, read.OriginalJson);
        Check(await File.ReadAllTextAsync(export) == json, "full original JSON did not survive export");
    }

    private static async Task InvalidInputsAsync(string root)
    {
        var path = Prepare(root); var protector = new TrackingProtector();
        foreach (var scope in new[] { "../" + Scope, new string('A', 64), new string('x', 64), "", Scope[..63] })
            await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, scope, protector));
        Check(protector.Calls == 0, "invalid scope reached decryption");
        var invalid = new[] { "[]", "null", "{", "{}", "{\"ScopeId\":null}", "{\"ScopeId\":\"" + OtherScope + "\"}",
            "{\"ScopeId\":\"" + Scope + "\",\"ScopeId\":\"" + Scope + "\"}", "{\"ScopeId\":\"" + Scope + "\"}{}" };
        foreach (var json in invalid)
        {
            await WriteAsync(path, json); var before = await ManifestAsync(root);
            await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
            Check(await ManifestAsync(root) == before && protector.Clear!.All(b => b == 0), "invalid JSON changed sources or leaked plaintext");
        }
        await File.WriteAllBytesAsync(path, "HDYWS2\nnot the supported header"u8.ToArray());
        var calls = protector.Calls;
        await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
        Check(protector.Calls == calls, "unknown header reached protector");
        await File.WriteAllBytesAsync(path, "HDYWS1\n"u8.ToArray());
        await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
        await File.WriteAllBytesAsync(path, "HDYWS1\nx"u8.ToArray());
        protector.Error = new CryptographicException("synthetic decrypt failure");
        await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
        Check(File.Exists(path), "decrypt failure removed original");
    }

    private static async Task SizeBoundsAsync(string root)
    {
        var path = Prepare(root); var protector = new TrackingProtector();
        using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write)) stream.SetLength(ReadOnlyWorkspaceRecovery.MaxBytes + 8L);
        var before = await ManifestAsync(root);
        await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
        Check(protector.Calls == 0 && await ManifestAsync(root) == before, "oversized ciphertext decrypted or source changed");
        await WriteAsync(path, "x");
        protector.Output = new byte[ReadOnlyWorkspaceRecovery.MaxBytes + 1]; Array.Fill(protector.Output, (byte)42);
        await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
        Check(protector.Output.All(b => b == 0), "oversized decrypted buffer was not cleared");
        protector.Output = [];
        await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector));
    }

    private static async Task PreviewBoundaryAsync(string root)
    {
        var path = Prepare(root); var prefix = "{\"ScopeId\":\"" + Scope + "\",\"unknown_body\":\"";
        var json = prefix + new string('x', ReadOnlyWorkspaceRecovery.MaxPreviewCharacters - prefix.Length - 1) + "🐟";
        json += new string('x', ReadOnlyWorkspaceRecovery.MaxBytes - Encoding.UTF8.GetByteCount(json) - 2) + "\"}";
        Check(Encoding.UTF8.GetByteCount(json) == ReadOnlyWorkspaceRecovery.MaxBytes, "fixture is not exact byte budget");
        await WriteAsync(path, json);
        var protector = new TrackingProtector();
        var read = await ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector);
        Check(read.OriginalJson == json && read.PreviewTruncated && read.Preview.Length == ReadOnlyWorkspaceRecovery.MaxPreviewCharacters - 1,
            "boundary-sized original rejected or preview split the surrogate pair");
        Check(!char.IsHighSurrogate(read.Preview[^1]) && protector.Clear!.All(b => b == 0), "preview has unmatched surrogate or plaintext not cleared");
        foreach (var whitespace in new[] { "\n", "\r", "\r\n", "\r\n\n\r " })
        {
            var dense = new StringBuilder();
            while (dense.Length <= ReadOnlyWorkspaceRecovery.MaxPreviewCharacters) dense.Append(whitespace);
            var denseJson = dense.ToString() + Json();
            await WriteAsync(path, denseJson);
            var lines = await ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector);
            var worstCaseDisplay = lines.Preview.Replace("\r\n", "\n", StringComparison.Ordinal)
                .Replace('\r', '\n').Replace("\n", "\r\n", StringComparison.Ordinal);
            Check(lines.OriginalJson == denseJson && lines.PreviewTruncated &&
                denseJson.StartsWith(lines.Preview, StringComparison.Ordinal) &&
                worstCaseDisplay.Length <= ReadOnlyWorkspaceRecovery.MaxPreviewCharacters,
                "dense CR/LF preview exceeded the WPF display budget or altered the original JSON");
            if (whitespace is "\n" or "\r")
                Check(lines.Preview.Length == ReadOnlyWorkspaceRecovery.MaxPreviewCharacters / 2, "single CR/LF was not budgeted as two display characters");
            if (whitespace == "\r\n")
                Check(lines.Preview.Length == ReadOnlyWorkspaceRecovery.MaxPreviewCharacters, "an existing CRLF pair was budgeted more than once");
            Check(protector.Clear!.All(b => b == 0), "dense-newline decrypted buffer was not cleared");
        }
    }

    private static async Task CancellationAsync(string root)
    {
        var path = Prepare(root); await WriteAsync(path, Json()); var before = await ManifestAsync(root);
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var protector = new TrackingProtector();
        await Throws<OperationCanceledException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector, cancellation.Token));
        await Throws<OperationCanceledException>(() => Task.Run(() => ReadOnlyWorkspaceRecovery.Discover(root, cancellation.Token)));
        Check(protector.Calls == 0, "pre-cancelled recovery decrypted");
        using var during = new CancellationTokenSource(); protector.AfterDecrypt = () => during.Cancel();
        await Throws<OperationCanceledException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, protector, during.Token));
        Check(protector.Clear!.All(b => b == 0) && await ManifestAsync(root) == before, "late cancellation leaked plaintext or changed source");
    }

    private static async Task StreamMutationAsync(string root)
    {
        _ = root;
        var bytes = "HDYWS1\nx"u8.ToArray();
        using (var growing = new SyntheticStream(bytes.Concat(new byte[] { 1 }).ToArray(), bytes.Length))
        {
            await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadPayloadAsync(growing, default));
            Check(growing.TotalRead <= bytes.Length + 1, "growth caused an unbounded read");
        }
        using (var shrinking = new SyntheticStream(bytes, bytes.Length + 1))
            await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadPayloadAsync(shrinking, default));
        using (var enormous = new SyntheticStream(bytes, ReadOnlyWorkspaceRecovery.MaxBytes + 8L))
        {
            await Throws<InvalidDataException>(() => ReadOnlyWorkspaceRecovery.ReadPayloadAsync(enormous, default));
            Check(enormous.TotalRead == 0, "oversized stream was actually read");
        }
        using var cancellation = new CancellationTokenSource();
        using var interrupted = new SyntheticStream(bytes, bytes.Length) { AfterRead = () => cancellation.Cancel() };
        await Throws<OperationCanceledException>(() => ReadOnlyWorkspaceRecovery.ReadPayloadAsync(interrupted, cancellation.Token));
        Check(interrupted.TotalRead <= 7, "read continued after cancellation");
    }

    private static async Task DiscoveryBudgetAsync(string root)
    {
        for (var i = 0; i < ReadOnlyWorkspaceRecovery.MaxPartitions; i++)
            Directory.CreateDirectory(Path.Combine(root, i.ToString("x64")));
        var exact = ReadOnlyWorkspaceRecovery.Discover(root);
        Check(exact.Complete && exact.ExaminedEntries == ReadOnlyWorkspaceRecovery.MaxPartitions, "exact directory budget incomplete");
        await File.WriteAllTextAsync(Path.Combine(root, "one-extra-unrelated-file"), "unchanged");
        var exceeded = ReadOnlyWorkspaceRecovery.Discover(root);
        Check(!exceeded.Complete && exceeded.ExaminedEntries == ReadOnlyWorkspaceRecovery.MaxPartitions && exceeded.Error!.Contains("1000", StringComparison.Ordinal),
            "budget overflow was silently treated as full discovery");
        Check(Directory.GetFileSystemEntries(root).Length == ReadOnlyWorkspaceRecovery.MaxPartitions + 1, "discovery changed entries");
    }

    private static async Task MissingRootAsync(string root)
    {
        var absent = Path.Combine(root, "missing");
        var found = ReadOnlyWorkspaceRecovery.Discover(absent);
        Check(found.Complete && found.Partitions.Count == 0 && !Directory.Exists(absent), "discovery created a missing root");
        await Throws<IOException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(absent, Scope, new TrackingProtector()));
        var fileRoot = Path.Combine(root, "file-root"); await File.WriteAllTextAsync(fileRoot, "not directory");
        var failed = ReadOnlyWorkspaceRecovery.Discover(fileRoot);
        Check(!failed.Complete && failed.Error != null && await File.ReadAllTextAsync(fileRoot) == "not directory", "root error hidden or source changed");
    }

    private static async Task LinksAsync(string root)
    {
        var actual = Path.Combine(root, "actual"); Directory.CreateDirectory(actual);
        var path = Prepare(actual); await WriteAsync(path, Json());
        var link = Path.Combine(root, "linked-root");
        try { Directory.CreateSymbolicLink(link, actual); }
        catch (Exception error) when (OperatingSystem.IsWindows() &&
            (error is IOException or UnauthorizedAccessException) && (error.HResult & 0xffff) == 1314)
        { throw new SkipCheckException("Windows runner cannot create synthetic symbolic links: ERROR_PRIVILEGE_NOT_HELD (1314)."); }
        var before = await File.ReadAllBytesAsync(path);
        await Throws<IOException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(link, Scope, new TrackingProtector()));
        Check(!ReadOnlyWorkspaceRecovery.Discover(link).Complete, "linked root presented as a complete empty directory");
        Directory.Delete(link);
        Directory.CreateSymbolicLink(Path.Combine(root, Scope), Path.Combine(actual, Scope));
        var partition = ReadOnlyWorkspaceRecovery.Discover(root).Partitions.Single();
        Check(partition.ScopeId == Scope && partition.Error != null, "linked partition silently eligible");
        await Throws<IOException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, new TrackingProtector()));
        Directory.Delete(Path.Combine(root, Scope));
        Directory.CreateDirectory(Path.Combine(root, Scope));
        var fileLink = Path.Combine(root, Scope, "workspace.bin"); File.CreateSymbolicLink(fileLink, path);
        await Throws<IOException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, new TrackingProtector()));
        Check(ReadOnlyWorkspaceRecovery.Discover(root).Partitions.Single().Error != null, "linked final file silently eligible");
        File.Delete(fileLink); File.CreateSymbolicLink(fileLink, Path.Combine(root, "absent.bin"));
        await Throws<IOException>(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, Scope, new TrackingProtector()));
        Check(ReadOnlyWorkspaceRecovery.Discover(root).Partitions.Single().Error != null, "dangling final link silently hidden");
        Check((await File.ReadAllBytesAsync(path)).SequenceEqual(before), "link target changed");
    }

    private static string Prepare(string root)
    {
        var partition = Path.Combine(root, Scope); Directory.CreateDirectory(partition);
        return Path.Combine(partition, "workspace.bin");
    }
    private static string Json() => "{\"ScopeId\":\"" + Scope + "\",\"raw\":\"中文 🐟\"}";
    private static Task WriteAsync(string path, string json) => File.WriteAllBytesAsync(path, "HDYWS1\n"u8.ToArray().Concat(Encoding.UTF8.GetBytes(json)).ToArray());
    private static async Task<string> ManifestAsync(string root)
    {
        var rows = new List<string>();
        foreach (var path in Directory.EnumerateFileSystemEntries(root, "*", SearchOption.AllDirectories).Order(StringComparer.Ordinal))
        {
            var relative = Path.GetRelativePath(root, path);
            rows.Add(Directory.Exists(path) ? relative + "/" : path.EndsWith(".lock", StringComparison.Ordinal) ? relative + ":lock" : relative + ":" + Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(path))));
        }
        return string.Join("\n", rows);
    }
    private sealed class SkipCheckException(string message) : Exception(message) { }
    private static void Check(bool condition, string error) { if (!condition) throw new Exception(error); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception
    {
        try { await action(); } catch (T) { return; }
        throw new Exception("Expected " + typeof(T).Name);
    }
    private sealed class TrackingProtector : IStateProtector
    {
        internal int Calls; internal byte[]? Clear; internal byte[]? Output; internal Action? AfterDecrypt; internal Exception? Error;
        public byte[] Protect(byte[] clear) => clear.ToArray();
        public byte[] Unprotect(byte[] ciphertext)
        {
            Calls++; if (Error != null) throw Error;
            Clear = Output ?? ciphertext.ToArray(); AfterDecrypt?.Invoke(); return Clear;
        }
    }
    private sealed class SyntheticStream(byte[] bytes, long reportedLength) : MemoryStream(bytes, writable: false)
    {
        internal int TotalRead; internal Action? AfterRead;
        public override long Length => reportedLength;
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var count = base.Read(buffer.Span); TotalRead += count; AfterRead?.Invoke();
            return ValueTask.FromResult(count);
        }
    }
}
