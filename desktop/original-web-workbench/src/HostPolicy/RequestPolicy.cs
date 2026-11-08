namespace Haoduoyu.OriginalUi.Policy;

public static class RequestPolicy
{
    public const string Origin = "https://haoduoyu.original-ui.invalid";
    public const string StartUrl = Origin + "/?page=todos";
    // Inline style is used by the original UI. Inline/eval scripts and network transports remain forbidden.
    public const string ContentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; manifest-src 'self'";
    public const string SecurityHeaders = "Content-Security-Policy: " + ContentSecurityPolicy + "\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCache-Control: no-store\r\nPermissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=()\r\n";

    public static bool TryLocalPath(string? rawUrl, out string path)
    {
        path = "";
        if (rawUrl is null || rawUrl.Length > 8192 || !rawUrl.StartsWith(Origin + "/", StringComparison.Ordinal)
            || rawUrl.Any(c => c is '\\' || char.IsControl(c)) || !Uri.TryCreate(rawUrl, UriKind.Absolute, out var uri)
            || uri.Scheme != "https" || uri.Host != "haoduoyu.original-ui.invalid" || !uri.IsDefaultPort || uri.UserInfo.Length != 0) return false;
        // Inspect the raw path before Uri's dot-segment/escape normalization.
        var tail = rawUrl[(Origin.Length + 1)..];
        var stop = tail.IndexOfAny(['?', '#']);
        var rawPath = stop < 0 ? tail : tail[..stop];
        if (rawPath.Any(c => !(char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.')) || rawPath is "." or "..") return false;
        path = rawPath == "" ? "index.html" : rawPath;
        return true;
    }
    public static bool IsDocumentNavigation(string? url) => TryLocalPath(url, out var path) && path == "index.html";
    public static bool TryAssetRequest(string? url, string? method, AssetCatalog catalog, out BundledAsset? asset)
    {
        asset = null;
        return method == "GET" && TryLocalPath(url, out var path) && catalog.TryGet(path, out asset);
    }
    public static string? AllowedExportExtension(string? downloadUrl, string? mimeType, long totalBytes)
    {
        if (downloadUrl is null || !downloadUrl.StartsWith("blob:" + Origin + "/", StringComparison.Ordinal)
            || !Guid.TryParseExact(downloadUrl[("blob:" + Origin + "/").Length..], "D", out _)
            || totalBytes < 0 || totalBytes > 10 * 1024 * 1024) return null;
        var mime = mimeType?.Split(';')[0].Trim().ToLowerInvariant();
        return mime switch { "application/json" => ".json", "text/plain" => ".txt", _ => null };
    }
}
