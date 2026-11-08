using System.Collections.ObjectModel;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Haoduoyu.OriginalUi.Policy;

public sealed record AssetSpec(string Path, long Size, string Sha256);
public sealed record BundleManifest(int SchemaVersion, string BundleId, string EntryPoint, AssetSpec[] Assets);
public sealed record BundledAsset(string MimeType, ReadOnlyMemory<byte> Bytes);

/// <summary>Only digest-verified bytes are served. Disk content is never passed to WebView2.</summary>
public sealed class AssetCatalog
{
    public const long MaxAssetSize = 10 * 1024 * 1024;
    public const long MaxBundleSize = 50 * 1024 * 1024;
    public static IReadOnlyDictionary<string, string> AllowedAssetTypes { get; } = new ReadOnlyDictionary<string, string>(
        new Dictionary<string, string>(StringComparer.Ordinal) {
            ["index.html"] = "text/html; charset=utf-8", ["app.js"] = "text/javascript; charset=utf-8",
            ["favicon.svg"] = "image/svg+xml", ["manifest.webmanifest"] = "application/manifest+json",
            ["tokens.css"] = "text/css; charset=utf-8", ["style.css"] = "text/css; charset=utf-8",
            ["memos.css"] = "text/css; charset=utf-8", ["glass.css"] = "text/css; charset=utf-8",
            ["workbench.css"] = "text/css; charset=utf-8", ["mobile.css"] = "text/css; charset=utf-8",
            ["sw-update.css"] = "text/css; charset=utf-8", ["offline.css"] = "text/css; charset=utf-8",
            ["review.css"] = "text/css; charset=utf-8"
        });
    private readonly Dictionary<string, BundledAsset> assets;
    public string BundleId { get; }
    public IReadOnlyCollection<string> Paths => assets.Keys;
    private AssetCatalog(string id, Dictionary<string, BundledAsset> contents) { BundleId = id; assets = contents; }
    public bool TryGet(string path, out BundledAsset? asset) => assets.TryGetValue(path, out asset);

    // The manifest must come from the executable's embedded resource, not untrusted disk metadata.
    public static AssetCatalog Load(string directory, ReadOnlySpan<byte> pinnedManifest)
    {
        if (pinnedManifest.Length is < 10 or > 65536) throw new InvalidDataException("Invalid asset manifest size.");
        var jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = false, PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow, MaxDepth = 8 };
        using (var doc = JsonDocument.Parse(pinnedManifest.ToArray(), new JsonDocumentOptions { MaxDepth = 8 })) RejectDuplicateKeys(doc.RootElement);
        var manifest = JsonSerializer.Deserialize<BundleManifest>(pinnedManifest, jsonOptions) ?? throw new InvalidDataException("Missing manifest.");
        if (manifest.SchemaVersion != 1 || manifest.EntryPoint != "index.html" || manifest.BundleId is null || manifest.BundleId.Length is < 1 or > 128
            || manifest.BundleId.Any(c => !(char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.'))
            || manifest.Assets is null || manifest.Assets.Length is < 2 or > 32)
            throw new InvalidDataException("Unsupported asset manifest.");
        var root = Path.GetFullPath(directory);
        FileSystemTrust.RejectLinksInExistingPath(root);
        if (!Directory.Exists(root)) throw new InvalidDataException("Bundled site directory is missing.");
        var result = new Dictionary<string, BundledAsset>(StringComparer.Ordinal);
        long total = 0;
        foreach (var spec in manifest.Assets)
        {
            if (spec is null || spec.Path is null || !AllowedAssetTypes.TryGetValue(spec.Path, out var mime)
                || result.ContainsKey(spec.Path) || spec.Size is < 1 or > MaxAssetSize
                || spec.Sha256 is null || spec.Sha256.Length != 64 || spec.Sha256.Any(c => !(c is >= '0' and <= '9' or >= 'a' and <= 'f')))
                throw new InvalidDataException("Invalid or duplicate asset entry.");
            total = checked(total + spec.Size);
            if (total > MaxBundleSize) throw new InvalidDataException("Bundle too large.");
            var file = Path.GetFullPath(Path.Combine(root, spec.Path));
            if (!string.Equals(Path.GetDirectoryName(file), root, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal))
                throw new InvalidDataException("Asset escaped its directory.");
            FileSystemTrust.RejectLinksInExistingPath(file);
            using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
            FileLinkCount.RequireSingleLink(stream.SafeFileHandle);
            if (stream.Length != spec.Size) throw new InvalidDataException("Asset size mismatch: " + spec.Path);
            var bytes = new byte[(int)spec.Size]; stream.ReadExactly(bytes);
            if (stream.ReadByte() != -1 || Convert.ToHexStringLower(SHA256.HashData(bytes)) != spec.Sha256)
                throw new InvalidDataException("Asset digest mismatch: " + spec.Path);
            FileLinkCount.RequireSingleLink(stream.SafeFileHandle);
            FileSystemTrust.RejectLinksInExistingPath(file);
            result.Add(spec.Path, new BundledAsset(mime, bytes));
        }
        if (!result.ContainsKey("index.html") || !result.ContainsKey("app.js")) throw new InvalidDataException("Missing entry assets.");
        foreach (var entry in Directory.EnumerateFileSystemEntries(root))
        {
            FileSystemTrust.RejectLinksInExistingPath(entry);
            if (Directory.Exists(entry) || !result.ContainsKey(Path.GetFileName(entry))) throw new InvalidDataException("Unlisted bundle entry.");
        }
        return new AssetCatalog(manifest.BundleId, result);
    }
    private static void RejectDuplicateKeys(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in node.EnumerateObject()) { if (!names.Add(p.Name)) throw new InvalidDataException("Duplicate JSON member."); RejectDuplicateKeys(p.Value); }
        }
        else if (node.ValueKind == JsonValueKind.Array) foreach (var child in node.EnumerateArray()) RejectDuplicateKeys(child);
    }
}

public static class FileSystemTrust
{
    public static void RejectLinksInExistingPath(string path)
    {
        var full = Path.GetFullPath(path);
        for (var cursor = full; !string.IsNullOrEmpty(cursor); cursor = Path.GetDirectoryName(cursor))
        {
            try { if ((File.GetAttributes(cursor) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("Linked paths are not allowed."); }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
        }
    }
    public static string PrepareProfile(string localAppData)
    {
        // This identity is intentionally unrelated to the rejected NativeWorkbench profile/install.
        var root = Path.GetFullPath(localAppData);
        var profile = Path.Combine(root, "Haoduoyu", "OriginalWebWorkbench", "v1", "WebView2");
        RejectLinksInExistingPath(profile);
        Directory.CreateDirectory(profile);
        RejectLinksInExistingPath(profile);
        return profile;
    }
}
