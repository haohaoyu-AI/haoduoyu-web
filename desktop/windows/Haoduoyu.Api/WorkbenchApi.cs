using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

public sealed record SessionInfo(string UserId, string Username);
// Only hand this material to the Windows DPAPI vault; never log or export it as plaintext.
public sealed record SessionMaterial(string CookieValue, DateTimeOffset ExpiresAt, string UserId, string Username)
{
    public override string ToString() => $"SessionMaterial(UserId={UserId}, ExpiresAt={ExpiresAt:O}, CookieValue=[redacted])";
}
public sealed class ScopeGuardException(string message) : RequestNotSentException(message);
public sealed class ApiCallException : IOException
{
    public int? StatusCode { get; }
    public string? RequestId { get; }
    public ApiCallException(string message, int? statusCode = null, string? requestId = null) : base(message)
        => (StatusCode, RequestId) = (statusCode, requestId);
}

/// <summary>Fixed-origin transport. No API key, arbitrary headers, redirects, or external URL proxy.</summary>
public sealed partial class WorkbenchApi : IRemoteApi, IDisposable
{
    public static Uri ServiceOrigin { get; } = new("https://haoduoyu.xyz/");
    public const int MaximumResponseBytes = 1_048_576;
    private readonly CookieContainer cookies = new();
    private readonly HttpClient client;
    private readonly SemaphoreSlim gate = new(1, 1);
    private string? csrfToken;
    private string? expectedScopeId;
    private bool disposed;
    public bool PublicMode { get; private set; } = true;
    public string? UserId { get; private set; }
    public string? Username { get; private set; }
    public string? ExpectedScopeId => expectedScopeId;

    public WorkbenchApi() : this(new HttpClientHandler
    {
        AllowAutoRedirect = false,
        UseCookies = false,
        AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
    }) { }

    // Fake handlers test requests without opening a socket; service origin stays fixed even in tests.
    internal WorkbenchApi(HttpMessageHandler handler)
    {
        client = new HttpClient(handler, disposeHandler: true) { Timeout = TimeSpan.FromSeconds(25) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("HaoduoyuDesktop/0.1");
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    public async Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId,
        CancellationToken cancellationToken = default)
    {
        RoutePolicy.Validate(method, path, allowAuthWrite: false);
        if (method != "GET" && path.StartsWith("/api/v1/review/", StringComparison.Ordinal))
            ReviewMutationVerifier.ValidateRequest(method, bodyJson);
        if (!string.IsNullOrEmpty(operationId) && !Guid.TryParseExact(operationId, "D", out _))
            throw new ArgumentException("保存标识必须为 UUID。", nameof(operationId));
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (method != "GET") await CheckWriteScopeAsync(cancellationToken);
            return await SendCoreAsync(method, path, bodyJson, operationId, cancellationToken);
        }
        finally { gate.Release(); }
    }

    public void BindScope(string scopeId)
    {
        if (scopeId.Length != 64 || scopeId.Any(c => !Uri.IsHexDigit(c)))
            throw new ArgumentException("工作区身份必须来自完整服务端快照。", nameof(scopeId));
        if (!gate.Wait(0)) throw new InvalidOperationException("请求正在进行，请稍后绑定工作区。");
        try { expectedScopeId = scopeId; }
        finally { gate.Release(); }
    }

    public async Task<string> ReadScopeIdAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try { return await ReadScopeCoreAsync(cancellationToken); }
        finally { gate.Release(); }
    }

    private async Task<string> ReadScopeCoreAsync(CancellationToken cancellationToken)
    {
        var data = DataOrThrow(await SendCoreAsync("GET", "/api/v1/workbench-snapshot/index?version=2", null, "", cancellationToken));
        var scope = data?["scope_id"]?.GetValue<string>();
        if (data?["complete"]?.GetValue<bool>() != true || scope is null || scope.Length != 64 || scope.Any(c => !Uri.IsHexDigit(c)))
            throw new ScopeGuardException("未取得完整工作区身份，待同步操作仍保留在本机。");
        return scope;
    }

    private async Task CheckWriteScopeAsync(CancellationToken cancellationToken)
    {
        if (expectedScopeId is null) throw new ScopeGuardException("请先连接并核对工作区身份，再发送待同步操作。");
        string current;
        try { current = await ReadScopeCoreAsync(cancellationToken); }
        catch (OperationCanceledException) { throw; }
        catch (ScopeGuardException) { throw; }
        catch (Exception) { throw new ScopeGuardException("无法核对当前工作区归属，尚未发送写入。请连接后再核对。"); }
        if (!string.Equals(current, expectedScopeId, StringComparison.Ordinal))
            throw new ScopeGuardException("服务端工作区归属已变化，尚未发送写入。原工作区草稿和队列已保留。");
    }

    public async Task<JsonNode?> GetDataAsync(string path, CancellationToken cancellationToken = default)
    {
        var result = await SendAsync("GET", path, null, "", cancellationToken);
        return DataOrThrow(result)?.DeepClone();
    }

    public async Task<SessionInfo> LoginAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 80 || password.Length > 256 || password.Length == 0)
            throw new ArgumentException("请输入有效账号和密码。");
        await gate.WaitAsync(cancellationToken);
        try
        {
            ResetSession();
            // Password is held only for this request. It is never part of workspace state/outbox.
            var body = JsonSerializer.Serialize(new { username, password });
            var login = await SendCoreAsync("POST", "/api/v1/auth/login", body, "", cancellationToken);
            _ = DataOrThrow(login);
            var me = DataOrThrow(await SendCoreAsync("GET", "/api/v1/auth/me", null, "", cancellationToken));
            UserId = RequiredString(me, "id");
            Username = RequiredString(me, "username");
            csrfToken = RequiredString(me, "csrfToken");
            if (cookies.GetCookies(ServiceOrigin)["matrix_session"] is null)
                throw new ApiCallException("登录响应缺少有效会话。请重新登录。");
            PublicMode = false;
            return new SessionInfo(UserId, Username);
        }
        catch { ResetSession(); throw; }
        finally { gate.Release(); }
    }

    public async Task LogoutAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            if (!PublicMode)
                _ = DataOrThrow(await SendCoreAsync("POST", "/api/v1/auth/logout", "{}", "", cancellationToken));
            ResetSession();
        }
        // A failed logout keeps the current in-memory identity; it must not silently replay its outbox as public.
        finally { gate.Release(); }
    }

    public void UsePublicMode()
    {
        if (!gate.Wait(0)) throw new InvalidOperationException("请求正在进行，请稍后切换身份。");
        try { ResetSession(); }
        finally { gate.Release(); }
    }

    public SessionMaterial? ExportSession()
    {
        if (PublicMode || UserId is null || Username is null) return null;
        var cookie = cookies.GetCookies(ServiceOrigin)["matrix_session"];
        return cookie is null ? null : new(cookie.Value, new DateTimeOffset(cookie.Expires.ToUniversalTime()), UserId, Username);
    }

    public async Task<SessionInfo> RestoreSessionAsync(SessionMaterial material, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            ResetSession();
            if (material.ExpiresAt <= DateTimeOffset.UtcNow || material.CookieValue.Length != 64 ||
                material.CookieValue.Any(c => !Uri.IsHexDigit(c))) throw new ApiCallException("本机会话已失效，请重新登录。");
            cookies.Add(ServiceOrigin, new Cookie("matrix_session", material.CookieValue, "/", ServiceOrigin.Host)
            { Secure = true, HttpOnly = true, Expires = material.ExpiresAt.UtcDateTime });
            var me = DataOrThrow(await SendCoreAsync("GET", "/api/v1/auth/me", null, "", cancellationToken));
            if (RequiredString(me, "id") != material.UserId)
                throw new ApiCallException("会话身份不一致，未载入其他账号的数据。");
            UserId = material.UserId;
            Username = RequiredString(me, "username");
            csrfToken = RequiredString(me, "csrfToken");
            PublicMode = false;
            return new SessionInfo(UserId, Username);
        }
        catch { ResetSession(); throw; }
        finally { gate.Release(); }
    }

    private async Task<ApiResult> SendCoreAsync(string method, string path, string? bodyJson, string operationId,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        RoutePolicy.Validate(method, path, allowAuthWrite: true);
        if (bodyJson is not null && Encoding.UTF8.GetByteCount(bodyJson) > MaximumResponseBytes)
            throw new ArgumentException("请求超过本机大小上限，请保留草稿。");
        using var request = new HttpRequestMessage(new HttpMethod(method), new Uri(ServiceOrigin, path));
        request.Headers.Add("Origin", ServiceOrigin.GetLeftPart(UriPartial.Authority));
        if (path.StartsWith("/api/v1/note-", StringComparison.Ordinal))
            request.Headers.Add("X-Note-Labels-Version", "3");
        if (path.Split('?')[0] == "/api/v1/note-entries/labels")
            request.Headers.Add("X-Note-Labels-Archive", "1");
        var cookieHeader = cookies.GetCookieHeader(ServiceOrigin);
        if (cookieHeader.Length > 0) request.Headers.Add("Cookie", cookieHeader);
        if (PublicMode && !path.StartsWith("/api/v1/auth/", StringComparison.Ordinal))
            request.Headers.Add("X-Public-Business", "1");
        if (method != "GET" && csrfToken is not null) request.Headers.Add("X-CSRF-Token", csrfToken);
        if (operationId.Length > 0 && method != "GET") request.Headers.Add("Idempotency-Key", operationId);
        if (bodyJson is not null) request.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if ((int)response.StatusCode is >= 300 and < 400)
                throw new ApiCallException("服务器返回重定向，已停止请求。请核对正式服务地址。", (int)response.StatusCode);
            if (response.Headers.TryGetValues("Set-Cookie", out var values))
            {
                foreach (var value in values)
                {
                    try { cookies.SetCookies(ServiceOrigin, value); }
                    catch (CookieException) { throw new ApiCallException("服务器会话响应无效。"); }
                }
            }
            if (response.Content.Headers.ContentLength > MaximumResponseBytes)
                throw new ApiCallException("响应超过完整读取上限，未替换本机内容。", (int)response.StatusCode);
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var bytes = new MemoryStream();
            var buffer = new byte[16_384];
            while (true)
            {
                var count = await stream.ReadAsync(buffer, cancellationToken);
                if (count == 0) break;
                if (bytes.Length + count > MaximumResponseBytes)
                    throw new ApiCallException("响应超过完整读取上限，未替换本机内容。", (int)response.StatusCode);
                bytes.Write(buffer, 0, count);
            }
            var json = new UTF8Encoding(false, true).GetString(bytes.GetBuffer(), 0, checked((int)bytes.Length));
            // Do not return HTML/errors containing a reverse proxy page as saved workspace data.
            try
            {
                var parsed = JsonNode.Parse(json);
                if (response.IsSuccessStatusCode && (parsed is not JsonObject root || root["data"] is not (JsonObject or JsonArray)))
                    throw new JsonException();
                if (response.IsSuccessStatusCode && method != "GET" && !path.StartsWith("/api/v1/auth/", StringComparison.Ordinal))
                    MutationVerifier.Validate(method, path, bodyJson, parsed!["data"]);
            }
            catch (JsonException) { throw new ApiCallException("服务器没有返回完整 JSON，保存状态需核对。", (int)response.StatusCode); }
            var requestId = response.Headers.TryGetValues("X-Request-Id", out var ids) ? ids.FirstOrDefault() : null;
            if (requestId?.Length > 160 || requestId?.Any(char.IsControl) == true) requestId = null;
            return new ApiResult((int)response.StatusCode, json, requestId);
        }
        catch (HttpRequestException) { throw new ApiCallException("连接失败。草稿与待同步操作保留在本机。"); }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        { throw new ApiCallException("请求超时。写入结果尚未确认，请先核对。"); }
        catch (DecoderFallbackException) { throw new ApiCallException("服务器响应编码无效，未替换本机内容。"); }
    }

    private void ResetSession()
    {
        foreach (Cookie cookie in cookies.GetCookies(ServiceOrigin)) cookie.Expired = true;
        csrfToken = null; expectedScopeId = null; UserId = null; Username = null; PublicMode = true;
    }

    public static JsonNode? DataOrThrow(ApiResult result)
    {
        if (!result.IsSuccess) throw new ApiCallException($"请求未完成（HTTP {result.StatusCode}）。本机内容已保留。", result.StatusCode, result.RequestId);
        try
        {
            var root = JsonNode.Parse(result.Json) as JsonObject;
            if (root is null || root["data"] is not (JsonObject or JsonArray)) throw new JsonException();
            return root["data"];
        }
        catch (JsonException) { throw new ApiCallException("响应缺少完整 data 字段，未替换本机内容。", result.StatusCode, result.RequestId); }
    }

    private static string RequiredString(JsonNode? node, string name)
        => node?[name]?.GetValue<string>() is { Length: > 0 } value ? value : throw new ApiCallException("会话响应不完整，请重新登录。");

    public void Dispose()
    {
        if (disposed) return;
        disposed = true; client.Dispose(); gate.Dispose();
    }
}
