namespace Haoduoyu.Windows;

// The manifest remembers only identities returned by auth/me and a complete server snapshot.
// It contains no password, session cookie, CSRF token or permission to send an offline outbox.
internal sealed record OfflineProfile(string Identity, string ServiceOrigin, string? UserId,
    string DisplayName, string Scope, DateTimeOffset ConfirmedAt)
{
    public bool IsPublic => UserId is null;
}

internal sealed record LocalSettings(string? PublicScope = null)
{
    public int Schema { get; init; } = OfflineProfiles.CurrentSchema;
    public string? LastActiveIdentity { get; init; }
    public IReadOnlyList<OfflineProfile> Profiles { get; init; } = [];
}

internal static class OfflineProfiles
{
    public const int CurrentSchema = 2;
    public const string ServiceOrigin = "https://haoduoyu.xyz";
    public const string UnboundPublicIdentity = "public:unbound";
    private const int MaxProfiles = 512;

    public static string InitialIdentity(LocalSettings settings)
    {
        Validate(settings);
        return settings.LastActiveIdentity ?? PublicIdentity(settings);
    }

    public static string PublicIdentity(LocalSettings settings)
    {
        Validate(settings);
        return settings.PublicScope is null ? UnboundPublicIdentity : "public:" + settings.PublicScope;
    }

    public static OfflineProfile? Get(LocalSettings settings, string identity)
    {
        Validate(settings);
        return settings.Profiles.SingleOrDefault(x => x.Identity == identity);
    }

    // Call only after the live, complete snapshot supplied this scope.
    public static LocalSettings RememberPublic(LocalSettings settings, string scope)
    {
        ValidateScope(scope);
        var profile = new OfflineProfile("public:" + scope, ServiceOrigin, null,
            "公开工作区", scope, DateTimeOffset.UtcNow);
        return Remember(settings, profile) with { PublicScope = scope };
    }

    // userId and displayName must come from the successful auth/me response, never login input.
    // This records an offline editing identity; a later session still needs live verification.
    public static LocalSettings RememberUser(LocalSettings settings, string userId, string displayName, string scope)
    {
        ValidateUserId(userId);
        ValidateDisplayName(displayName);
        ValidateScope(scope);
        return Remember(settings, new OfflineProfile("user:" + userId + ":" + scope,
            ServiceOrigin, userId, displayName, scope, DateTimeOffset.UtcNow));
    }

    public static LocalSettings Select(LocalSettings settings, string identity)
    {
        Validate(settings);
        if (identity != UnboundPublicIdentity && !settings.Profiles.Any(x => x.Identity == identity))
            throw new InvalidDataException("此本机身份未经过服务端确认，不能打开为可编辑工作区。");
        return settings with { LastActiveIdentity = identity };
    }

    public static bool MatchesLive(OfflineProfile? profile, string origin, bool publicMode, string? userId, string scope)
    {
        if (profile is null) return false;
        try
        {
            ValidateProfile(profile);
            return CanonicalOrigin(origin) == profile.ServiceOrigin && scope == profile.Scope &&
                publicMode == profile.IsPublic && (publicMode ? userId is null : userId == profile.UserId);
        }
        catch (Exception error) when (error is InvalidDataException or ArgumentException) { return false; }
    }

    internal static LocalSettings MigrateLegacy(string? publicScope)
    {
        if (publicScope is null) return new();
        ValidateScope(publicScope);
        // Old settings recorded only a public scope. Never infer private owners from directories.
        var identity = "public:" + publicScope;
        return new(publicScope)
        {
            LastActiveIdentity = identity,
            Profiles = [new(identity, ServiceOrigin, null, "公开工作区", publicScope, DateTimeOffset.MinValue)]
        };
    }

    internal static void Validate(LocalSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        if (settings.Schema != CurrentSchema) throw new InvalidDataException("不支持此本机配置版本，禁止降级覆盖。");
        if (settings.Profiles is null || settings.Profiles.Count > MaxProfiles)
            throw new InvalidDataException("本机身份列表缺失或超过容量限制，原文件已保留。");
        foreach (var profile in settings.Profiles) ValidateProfile(profile);
        if (settings.Profiles.Select(x => x.Identity).Distinct(StringComparer.Ordinal).Count() != settings.Profiles.Count)
            throw new InvalidDataException("本机身份列表有重复分区，原文件已保留。");
        if (settings.PublicScope is not null)
        {
            ValidateScope(settings.PublicScope);
            if (!settings.Profiles.Any(x => x.IsPublic && x.Scope == settings.PublicScope))
                throw new InvalidDataException("公开工作区没有对应的已确认身份资料。");
        }
        if (settings.LastActiveIdentity is not null && settings.LastActiveIdentity != UnboundPublicIdentity &&
            !settings.Profiles.Any(x => x.Identity == settings.LastActiveIdentity))
            throw new InvalidDataException("上次打开的本机身份不在已确认列表中，原文件已保留。");
    }

    private static LocalSettings Remember(LocalSettings settings, OfflineProfile profile)
    {
        Validate(settings);
        ValidateProfile(profile);
        var profiles = settings.Profiles.Where(x => x.Identity != profile.Identity).Append(profile).ToArray();
        var result = settings with { Profiles = profiles, LastActiveIdentity = profile.Identity };
        Validate(result);
        return result;
    }

    private static void ValidateProfile(OfflineProfile profile)
    {
        if (profile is null) throw new InvalidDataException("本机身份资料缺失。");
        if (profile.ServiceOrigin != ServiceOrigin) throw new InvalidDataException("本机身份绑定了不同的服务源。");
        ValidateScope(profile.Scope);
        ValidateDisplayName(profile.DisplayName);
        if (profile.UserId is not null) ValidateUserId(profile.UserId);
        var expected = profile.UserId is null ? "public:" + profile.Scope : "user:" + profile.UserId + ":" + profile.Scope;
        if (profile.Identity != expected) throw new InvalidDataException("本机身份与账户或服务分区不匹配。");
        if (profile.ConfirmedAt.Offset != TimeSpan.Zero)
            throw new InvalidDataException("本机身份确认时间不是 UTC。");
    }

    private static void ValidateScope(string scope)
    {
        if (scope is null || scope.Length != 64 || scope.Any(c => !Uri.IsHexDigit(c)))
            throw new InvalidDataException("工作区身份必须来自完整的服务端 scope。");
    }

    private static void ValidateUserId(string userId)
    {
        // The API owns user ID syntax. This only excludes separators and unsafe local labels.
        if (string.IsNullOrWhiteSpace(userId) || userId.Length > 160 || userId.Any(c => char.IsWhiteSpace(c) || char.IsControl(c) || c == ':'))
            throw new InvalidDataException("账户身份必须使用 auth/me 返回的有效 ID。");
    }

    private static void ValidateDisplayName(string displayName)
    {
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 160 || displayName.Any(char.IsControl))
            throw new InvalidDataException("账户显示名无效。");
    }

    private static string CanonicalOrigin(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var value) || value.Scheme != "https" ||
            value.UserInfo.Length != 0 || value.AbsolutePath != "/" || value.Query.Length != 0 || value.Fragment.Length != 0)
            throw new ArgumentException("必须使用完整的 HTTPS 服务源。", nameof(origin));
        return value.GetLeftPart(UriPartial.Authority).ToLowerInvariant();
    }
}
