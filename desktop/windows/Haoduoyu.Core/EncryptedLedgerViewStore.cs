using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Haoduoyu.Core;

public sealed record LedgerViewSnapshot(LedgerViewPreferences Preferences, string? ETag);

// A separate presentation-only file. No workspace, cache, draft, outbox or settings-schema mutation.
public sealed class EncryptedLedgerViewStore
{
    public const int MaximumFileBytes = 512 * 1024;
    private static readonly byte[] Header = "HDYVIEW1\n"u8.ToArray();
    private static readonly JsonSerializerOptions Options = new()
    {
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        MaxDepth = 16
    };
    private readonly string directory;
    private readonly IStateProtector protector;
    public string ScopeId { get; }
    public string FilePath { get; }
    public string BackupPath => FilePath + ".bak";

    private sealed record Envelope
    {
        [JsonRequired] public int Schema { get; init; } = 1;
        [JsonRequired] public string ScopeId { get; init; } = "";
        [JsonRequired] public string Generation { get; init; } = "";
        [JsonRequired] public LedgerViewPreferences Preferences { get; init; } = new();
    }

    public EncryptedLedgerViewStore(string scopeDirectory, string scopeId, IStateProtector protector)
    {
        ArgumentNullException.ThrowIfNull(protector); ArgumentException.ThrowIfNullOrWhiteSpace(scopeDirectory);
        if (scopeId is null || scopeId.Length != 64 || scopeId.Any(c => !char.IsAsciiHexDigit(c) || char.IsAsciiLetterUpper(c)))
            throw new ArgumentException("台账视图须使用明确的本机身份分区。", nameof(scopeId));
        directory = Path.TrimEndingDirectorySeparator(Path.GetFullPath(scopeDirectory));
        if (Path.GetFileName(directory) != scopeId) throw new ArgumentException("台账视图目录与身份分区不匹配。", nameof(scopeDirectory));
        ScopeId = scopeId; this.protector = protector; FilePath = Path.Combine(directory, "ledger-views.bin");
    }

    // A read of an absent configuration never creates directories or files.
    public LedgerViewSnapshot Read()
    {
        CheckPaths();
        if (File.Exists(FilePath)) return ReadFile(FilePath);
        if (File.Exists(BackupPath)) throw Invalid("台账视图主文件缺失，但备份仍在；请显式恢复，不能创建空配置覆盖。");
        return new(ArticleLedgerViews.CloneAndValidate(new()), null);
    }

    // The caller supplies the exact encrypted-file ETag it read. New generations prevent restore ABA.
    public LedgerViewSnapshot Write(LedgerViewPreferences preferences, string? expectedETag)
    {
        var captured = ArticleLedgerViews.CloneAndValidate(preferences);
        ValidateETag(expectedETag); CheckPaths(); Directory.CreateDirectory(directory); CheckPaths();
        using var held = new FileStream(FilePath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var before = Read();
        if (before.ETag != expectedETag) throw Invalid("台账视图配置已变化，请重新读取后再明确保存；原配置保留。");
        string? temporary = null;
        try
        {
            temporary = WriteTemporary(captured);
            // Recheck after protection and durable write too; a noncooperating change is not overwritten.
            if (Read().ETag != before.ETag) throw Invalid("保存期间台账视图已变化，原配置保留。");
            var exact = ReadFile(temporary);
            if (File.Exists(FilePath)) File.Replace(temporary, FilePath, BackupPath, false); else File.Move(temporary, FilePath);
            temporary = null;
            var saved = ReadFile(FilePath);
            if (saved.ETag != exact.ETag) throw Invalid("写入后台账视图又有变化，请重新读取核对；未自动覆盖。");
            return saved;
        }
        finally { DeleteTemporary(temporary); }
    }

    // Only this explicit operation replaces a damaged/missing primary. Preserve exact primary and backup.
    public LedgerViewSnapshot RestoreBackup()
    {
        CheckPaths();
        if (!File.Exists(BackupPath)) throw Invalid("没有可核实的台账视图备份。");
        using var held = new FileStream(FilePath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var backup = ReadFile(BackupPath); var backupTag = backup.ETag;
        var primaryTag = File.Exists(FilePath) ? HashFile(FilePath) : null;
        string? temporary = null;
        try
        {
            temporary = WriteTemporary(backup.Preferences);
            if (ReadFile(BackupPath).ETag != backupTag || (File.Exists(FilePath) ? HashFile(FilePath) : null) != primaryTag)
                throw Invalid("恢复期间台账视图或备份已变化，原文件均已保留。");
            var exact = ReadFile(temporary);
            if (File.Exists(FilePath)) File.Replace(temporary, FilePath, FilePath + ".damaged-" + Guid.NewGuid().ToString("N"), false);
            else File.Move(temporary, FilePath);
            temporary = null;
            var restored = ReadFile(FilePath);
            if (restored.ETag != exact.ETag) throw Invalid("恢复后台账视图又有变化，请重新读取；原件和备份保留。");
            return restored;
        }
        finally { DeleteTemporary(temporary); }
    }

    private string WriteTemporary(LedgerViewPreferences preferences)
    {
        var document = new Envelope { ScopeId = ScopeId, Generation = Guid.NewGuid().ToString("D"), Preferences = preferences };
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(document, Options);
        byte[] encrypted;
        try
        {
            if (plaintext.Length > MaximumFileBytes - Header.Length) throw Invalid("台账视图配置超过512KiB限制，原文件保留。");
            encrypted = protector.Protect(plaintext) ?? throw Invalid("台账视图保护失败，原文件保留。");
            if (ReferenceEquals(plaintext, encrypted)) encrypted = encrypted.ToArray();
        }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
        if (encrypted.Length == 0 || encrypted.Length > MaximumFileBytes - Header.Length)
            throw Invalid("加密台账视图超过512KiB限制，原文件保留。");
        var temporary = FilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            { stream.Write(Header); stream.Write(encrypted); stream.Flush(true); }
            _ = ReadFile(temporary);
            return temporary;
        }
        catch { DeleteTemporary(temporary); throw; }
    }

    private LedgerViewSnapshot ReadFile(string path)
    {
        CheckPaths(); CheckFile(path);
        var bytes = BoundedFile(path);
        if (bytes.Length <= Header.Length || !bytes.AsSpan(0, Header.Length).SequenceEqual(Header))
            throw Invalid("台账视图格式损坏或版本不受支持；原文件保留。");
        byte[]? plaintext = null;
        try
        {
            plaintext = protector.Unprotect(bytes[Header.Length..]) ?? throw Invalid("无法读取台账视图，原文件保留。");
            if (plaintext.Length == 0 || plaintext.Length > MaximumFileBytes - Header.Length) throw Invalid("台账视图正文超过容量限制。");
            RejectDuplicateProperties(plaintext);
            var document = JsonSerializer.Deserialize<Envelope>(plaintext, Options) ?? throw Invalid("台账视图正文缺失。");
            if (document.Schema != 1) throw Invalid("不支持此台账视图版本，禁止降级覆盖。");
            if (document.ScopeId != ScopeId) throw Invalid("台账视图不属于当前身份分区，原件保留。");
            if (!Guid.TryParseExact(document.Generation, "D", out var generation) || generation == Guid.Empty || document.Generation != generation.ToString("D"))
                throw Invalid("台账视图保存代次无效，原件保留。");
            return new(ArticleLedgerViews.CloneAndValidate(document.Preferences), Convert.ToHexStringLower(SHA256.HashData(bytes)));
        }
        catch (Exception error) when (error is JsonException or CryptographicException or ArgumentException or InvalidOperationException or FormatException or OverflowException)
        { throw Invalid("无法解密或读取台账视图；原件与备份保留，请显式核对或恢复。"); }
        finally { if (plaintext is not null) CryptographicOperations.ZeroMemory(plaintext); }
    }

    private static byte[] BoundedFile(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length is < 1 or > MaximumFileBytes) throw Invalid("台账视图文件大小异常；原文件保留。");
        var bytes = new byte[(int)stream.Length]; stream.ReadExactly(bytes);
        if (stream.ReadByte() != -1) throw Invalid("台账视图读取期间大小变化，原文件保留。");
        return bytes;
    }
    private static string HashFile(string path) => Convert.ToHexStringLower(SHA256.HashData(BoundedFile(path)));
    private static void RejectDuplicateProperties(ReadOnlySpan<byte> json)
    {
        var reader = new Utf8JsonReader(json, new JsonReaderOptions { MaxDepth = 16 });
        var objects = new Stack<HashSet<string>>();
        while (reader.Read())
        {
            if (reader.TokenType == JsonTokenType.StartObject) objects.Push(new(StringComparer.Ordinal));
            else if (reader.TokenType == JsonTokenType.EndObject) objects.Pop();
            else if (reader.TokenType == JsonTokenType.PropertyName && !objects.Peek().Add(reader.GetString()!))
                throw Invalid("台账视图包含重复JSON字段，不能猜测采用哪份值；原文件保留。");
        }
    }
    private void CheckPaths()
    {
        foreach (var path in new[] { directory, Path.GetDirectoryName(directory)! })
            if (Directory.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw Invalid("台账视图目录不能是链接或重解析点。");
        foreach (var path in new[] { FilePath, BackupPath, FilePath + ".lock" }) CheckFile(path);
    }
    private static void CheckFile(string path)
    {
        if (Directory.Exists(path) || File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw Invalid("台账视图文件不能是目录、链接或重解析点，原件保留。");
    }
    private static void ValidateETag(string? tag)
    {
        if (tag is not null && (tag.Length != 64 || tag.Any(c => !char.IsAsciiHexDigit(c) || char.IsAsciiLetterUpper(c))))
            throw new ArgumentException("台账视图保存必须使用原读取摘要。", nameof(tag));
    }
    private static void DeleteTemporary(string? path)
    { if (path is not null) try { File.Delete(path); } catch (IOException) { } }
    private static InvalidDataException Invalid(string message) => new(message);
}
