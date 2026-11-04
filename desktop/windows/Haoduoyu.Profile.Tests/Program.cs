using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Haoduoyu.Core;
using Haoduoyu.Windows;

var checks = 0;
var syntheticRoot = Path.Combine(Path.GetTempPath(), "haoduoyu-profile-synthetic-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(syntheticRoot);
try
{
    Catalog();
    Persistence();
    LegacyMigration();
    InvalidManifests();
    Console.WriteLine($"PASS {checks} synthetic offline profile checks; no server requests or real user files.");
}
finally { Directory.Delete(syntheticRoot, recursive: true); }

void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
    checks++;
}

void Reject(Action action, string message)
{
    try { action(); }
    catch (Exception error) when (error is InvalidDataException or IOException) { checks++; return; }
    throw new InvalidOperationException(message);
}

string Case(string name)
{
    var path = Path.Combine(syntheticRoot, name);
    Directory.CreateDirectory(path);
    return path;
}

void Catalog()
{
    var a = new string('a', 64); var b = new string('b', 64);
    var empty = new LocalSettings();
    Check(OfflineProfiles.InitialIdentity(empty) == "public:unbound" && empty.Profiles.Count == 0, "fresh profile guessed a user");
    Reject(() => OfflineProfiles.Select(empty, "user:guessed:" + a), "unknown user became editable");
    Reject(() => OfflineProfiles.RememberUser(empty, "name:scope", "synthetic", a), "separator was accepted in user id");
    Reject(() => OfflineProfiles.RememberUser(empty, "synthetic-user", "synthetic", "unbound"), "unverified private scope was accepted");
    var settings = OfflineProfiles.RememberPublic(empty, a);
    var publicIdentity = "public:" + a;
    Check(OfflineProfiles.InitialIdentity(settings) == publicIdentity, "confirmed public selection was not recorded");
    settings = OfflineProfiles.RememberUser(settings, "synthetic-owner-a", "合成账户甲", a);
    var ownerIdentity = "user:synthetic-owner-a:" + a;
    Check(OfflineProfiles.InitialIdentity(settings) == ownerIdentity, "verified owner was not recorded");
    var owner = OfflineProfiles.Get(settings, ownerIdentity)!;
    Check(!owner.IsPublic && owner.DisplayName == "合成账户甲", "owner display is not from auth/me");
    Check(OfflineProfiles.MatchesLive(owner, "https://HAODUOYU.xyz/", false, "synthetic-owner-a", a), "exact verified owner did not match");
    Check(!OfflineProfiles.MatchesLive(owner, "https://haoduoyu.xyz/", false, "synthetic-owner-b", a), "different account could send owner's queue");
    Check(!OfflineProfiles.MatchesLive(owner, "https://haoduoyu.xyz/", false, "synthetic-owner-a", b), "changed scope could send original queue");
    Check(!OfflineProfiles.MatchesLive(owner, "https://haoduoyu.xyz/", true, null, a), "public session could send private queue");
    Check(!OfflineProfiles.MatchesLive(owner, "https://other.example/", false, "synthetic-owner-a", a), "foreign origin could send queue");
    Check(!OfflineProfiles.MatchesLive(owner, "https://haoduoyu.xyz/other", false, "synthetic-owner-a", a), "path was accepted as service origin");
    Check(!OfflineProfiles.MatchesLive(null, "https://haoduoyu.xyz/", false, "synthetic-owner-a", a), "unregistered identity could send queue");
    var publicProfile = OfflineProfiles.Get(settings, publicIdentity)!;
    Check(OfflineProfiles.MatchesLive(publicProfile, "https://haoduoyu.xyz/", true, null, a), "public scope did not match");
    Check(!OfflineProfiles.MatchesLive(publicProfile, "https://haoduoyu.xyz/", true, "synthetic-owner-a", a), "ambiguous public identity matched");
    settings = OfflineProfiles.RememberUser(settings, "synthetic-owner-b", "合成账户乙", a);
    settings = OfflineProfiles.RememberUser(settings, "synthetic-owner-a", "合成账户甲", b);
    Check(settings.Profiles.Count == 4, "different owner or scope overwrote an earlier profile");
    settings = OfflineProfiles.Select(settings, ownerIdentity);
    Check(OfflineProfiles.InitialIdentity(settings) == ownerIdentity && settings.Profiles.Count == 4, "offline selection changed the manifest");
    settings = OfflineProfiles.Select(settings, publicIdentity);
    Check(OfflineProfiles.InitialIdentity(settings) == publicIdentity, "public offline selection failed");
    settings = OfflineProfiles.Select(settings, "public:unbound");
    Check(OfflineProfiles.InitialIdentity(settings) == "public:unbound" && settings.PublicScope == a, "unbound workspace silently migrated");
}

void Persistence()
{
    var root = Case("persist"); var path = Path.Combine(root, "settings.bin");
    var protector = new SyntheticProtector(37);
    var publicOnly = OfflineProfiles.RememberPublic(new(), new string('a', 64));
    SettingsFile.Write(root, publicOnly, protector);
    Check(protector.LastInput!.All(x => x == 0), "serialized plaintext was not cleared");
    var first = File.ReadAllBytes(path);
    var owner = OfflineProfiles.RememberUser(publicOnly, "synthetic-owner", "合成账户", new string('b', 64));
    SettingsFile.Write(root, owner, protector);
    Check(File.ReadAllBytes(path + ".bak").SequenceEqual(first), "atomic replacement lost the previous encrypted manifest");
    Check(!Encoding.UTF8.GetString(File.ReadAllBytes(path)).Contains("synthetic-owner", StringComparison.Ordinal), "profile was saved as plaintext");
    var reopened = SettingsFile.Read(root, protector);
    Check(OfflineProfiles.InitialIdentity(reopened) == owner.LastActiveIdentity && reopened.Profiles.Count == 2, "offline owner did not survive process restart");
    Check(reopened.Profiles.Single(x => !x.IsPublic).UserId == "synthetic-owner", "restored user id changed");
    var json = JsonSerializer.Serialize(reopened);
    Check(!json.Contains("Cookie", StringComparison.OrdinalIgnoreCase) && !json.Contains("Password", StringComparison.OrdinalIgnoreCase) &&
        !json.Contains("csrf", StringComparison.OrdinalIgnoreCase), "manifest contains credential fields");
    Reject(() => SettingsFile.Read(root, new SyntheticProtector(91)), "foreign OS-user protector opened the settings");
    var current = File.ReadAllBytes(path);
    Reject(() => SettingsFile.Write(root, publicOnly, protector), "stale instance erased a private profile");
    Check(File.ReadAllBytes(path).SequenceEqual(current), "stale write modified the primary");
    using (var heldLock = new FileStream(path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
        Reject(() => SettingsFile.Write(root, owner, protector), "simultaneous setting write ignored lifetime lock");
    Check(File.ReadAllBytes(path).SequenceEqual(current), "blocked concurrent write changed data");
    Reject(() => SettingsFile.Write(root, owner, new FailingProtector()), "failed encryption was committed");
    Check(File.ReadAllBytes(path).SequenceEqual(current) && Directory.GetFiles(root, "*.tmp").Length == 0, "failed write damaged settings or left temp file");

    var damaged = current.ToArray(); damaged[^1] ^= 1; File.WriteAllBytes(path, damaged);
    Reject(() => SettingsFile.Read(root, protector), "damaged settings reset to empty");
    Reject(() => SettingsFile.Write(root, owner, protector), "damaged primary was overwritten");
    Check(File.ReadAllBytes(path).SequenceEqual(damaged) && File.ReadAllBytes(path + ".bak").SequenceEqual(first), "refusal changed primary or backup");
    var recovered = SettingsFile.RestoreBackup(root, protector);
    Check(recovered.Profiles.Count == 1 && recovered.Profiles.All(x => x.IsPublic), "recovery did not use the validated backup");
    Check(Directory.GetFiles(root, "settings.bin.damaged-*").Single() is var preserved && File.ReadAllBytes(preserved).SequenceEqual(damaged), "recovery discarded corrupt evidence");
    File.Delete(path);
    Reject(() => SettingsFile.Read(root, protector), "missing primary with backup reset to empty");
    Reject(() => SettingsFile.Write(root, new(), protector), "missing primary with backup was overwritten");
    SettingsFile.RestoreBackup(root, protector);
    Check(SettingsFile.Read(root, protector).Profiles.Count == 1, "explicit missing-primary recovery failed");
}

void LegacyMigration()
{
    var root = Case("legacy"); var path = Path.Combine(root, "settings.bin");
    var protector = new SyntheticProtector(37); var scope = new string('c', 64);
    var encrypted = protector.Protect(Encoding.UTF8.GetBytes("{\"PublicScope\":\"" + scope + "\"}"));
    File.WriteAllBytes(path, encrypted);
    var historicalDirectory = Path.Combine(root, new string('d', 64)); Directory.CreateDirectory(historicalDirectory);
    File.WriteAllText(Path.Combine(historicalDirectory, "workspace.bin"), "synthetic unknown legacy file");
    var settings = SettingsFile.Read(root, protector);
    Check(settings.Schema == 2 && settings.Profiles.Count == 1 && settings.Profiles[0].IsPublic, "legacy public settings invented private profiles");
    Check(OfflineProfiles.InitialIdentity(settings) == "public:" + scope, "legacy public partition changed");
    SettingsFile.Write(root, settings, protector);
    Check(File.ReadAllBytes(path + ".bak").SequenceEqual(encrypted), "migration did not preserve old settings backup");
    Check(File.ReadAllText(Path.Combine(historicalDirectory, "workspace.bin")) == "synthetic unknown legacy file", "manifest discovery migrated an unknown directory");
    Check(SettingsFile.Read(root, protector).Schema == 2, "rewritten legacy settings did not reopen");
    var nullRoot = Case("legacy-null");
    File.WriteAllBytes(Path.Combine(nullRoot, "settings.bin"), protector.Protect("{\"PublicScope\":null}"u8.ToArray()));
    Check(OfflineProfiles.InitialIdentity(SettingsFile.Read(nullRoot, protector)) == "public:unbound", "legacy null scope was assigned an owner");
}

void InvalidManifests()
{
    var root = Case("invalid"); var path = Path.Combine(root, "settings.bin"); var protector = new SyntheticProtector(37);
    var settings = OfflineProfiles.RememberUser(new(), "synthetic-owner", "合成账户", new string('e', 64));
    var valid = JsonSerializer.Serialize(settings);
    var invalid = new[]
    {
        "null", "{", "{\"Password\":\"synthetic-only\"}",
        valid.Replace("\"Schema\":2", "\"Schema\":99", StringComparison.Ordinal),
        valid.Replace("\"Schema\":2", "\"Schema\":2,\"Schema\":2", StringComparison.Ordinal),
        valid.Replace("\"Profiles\":", "\"UnknownProfiles\":", StringComparison.Ordinal),
        JsonSerializer.Serialize(settings with { LastActiveIdentity = "user:guessed:" + new string('e', 64) }),
        JsonSerializer.Serialize(settings with { Profiles = [settings.Profiles[0], settings.Profiles[0]] }),
        JsonSerializer.Serialize(settings with { Profiles = [settings.Profiles[0] with { ServiceOrigin = "https://other.example" }] }),
        JsonSerializer.Serialize(settings with { Profiles = [settings.Profiles[0] with { Scope = new string('f', 64) }] }),
        JsonSerializer.Serialize(settings with { Profiles = [settings.Profiles[0] with { UserId = "different-owner" }] }),
        JsonSerializer.Serialize(settings with { PublicScope = new string('f', 64) })
    };
    foreach (var value in invalid)
    {
        var encrypted = protector.Protect(Encoding.UTF8.GetBytes(value)); File.WriteAllBytes(path, encrypted);
        Reject(() => SettingsFile.Read(root, protector), "malformed or foreign manifest was opened");
        Reject(() => SettingsFile.Write(root, settings, protector), "malformed or foreign manifest was replaced");
        Check(File.ReadAllBytes(path).SequenceEqual(encrypted), "rejected invalid manifest changed");
    }
    var badBackup = new byte[] { 1, 2, 3 };
    File.WriteAllBytes(path + ".bak", badBackup);
    var original = File.ReadAllBytes(path);
    Reject(() => SettingsFile.RestoreBackup(root, protector), "invalid backup restored");
    Check(File.ReadAllBytes(path).SequenceEqual(original) && File.ReadAllBytes(path + ".bak").SequenceEqual(badBackup), "failed recovery changed evidence");
}

// This fake tests caller boundaries and corruption handling; production uses Windows current-user DPAPI.
sealed class SyntheticProtector(byte key) : IStateProtector
{
    public byte[]? LastInput { get; private set; }
    public byte[] Protect(byte[] plaintext)
    {
        LastInput = plaintext;
        return SHA256.HashData(plaintext).Concat(plaintext.Select(x => (byte)(x ^ key))).ToArray();
    }
    public byte[] Unprotect(byte[] ciphertext)
    {
        if (ciphertext.Length < 32) throw new CryptographicException("synthetic corrupt ciphertext");
        var plaintext = ciphertext[32..].Select(x => (byte)(x ^ key)).ToArray();
        if (!SHA256.HashData(plaintext).SequenceEqual(ciphertext[..32])) throw new CryptographicException("synthetic wrong user or corrupt ciphertext");
        return plaintext;
    }
}

sealed class FailingProtector : IStateProtector
{
    public byte[] Protect(byte[] plaintext) => throw new IOException("synthetic failed save");
    public byte[] Unprotect(byte[] ciphertext) => new SyntheticProtector(37).Unprotect(ciphertext);
}
