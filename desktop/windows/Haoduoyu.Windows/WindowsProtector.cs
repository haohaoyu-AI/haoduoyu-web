using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

// Current Windows user's DPAPI. No machine-wide flag; no external crypto package or stored key.
public sealed class WindowsProtector : IStateProtector
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref Blob input, string? description, IntPtr entropy,
        IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, IntPtr entropy,
        IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);
    public byte[] Protect(byte[] plaintext) => Transform(plaintext, true);
    public byte[] Unprotect(byte[] ciphertext) => Transform(ciphertext, false);
    private static byte[] Transform(byte[] bytes, bool protect)
    {
        var input = new Blob { Length = bytes.Length, Data = Marshal.AllocHGlobal(bytes.Length) };
        Blob output = default;
        try
        {
            Marshal.Copy(bytes, 0, input.Data, bytes.Length);
            var success = protect ? CryptProtectData(ref input, "Haoduoyu Native Workspace v1", IntPtr.Zero,
                IntPtr.Zero, IntPtr.Zero, 1, out output) : CryptUnprotectData(ref input, IntPtr.Zero,
                IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!success) throw new CryptographicException("Windows 无法保护此工作区。", new Win32Exception(Marshal.GetLastWin32Error()));
            var result = new byte[output.Length];
            Marshal.Copy(output.Data, result, 0, result.Length);
            return result;
        }
        finally
        {
            if (input.Data != IntPtr.Zero)
            {
                for (var i = 0; i < input.Length; i++) Marshal.WriteByte(input.Data, i, 0);
                Marshal.FreeHGlobal(input.Data);
            }
            if (output.Data != IntPtr.Zero)
            {
                if (!protect) for (var i = 0; i < output.Length; i++) Marshal.WriteByte(output.Data, i, 0);
                LocalFree(output.Data);
            }
        }
    }
}

internal static class SettingsFile
{
    private const int MaxBytes = 1024 * 1024;
    private static readonly JsonSerializerOptions Options = new()
    {
        UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow
    };

    public static LocalSettings Read(string root, IStateProtector protector)
    {
        var path = Path.Combine(root, "settings.bin");
        if (File.Exists(path)) return ReadFile(path, protector);
        if (File.Exists(path + ".bak"))
            throw new InvalidDataException("本机配置主文件缺失，但备份仍在。请先恢复备份，禁止创建空配置覆盖。");
        return new();
    }

    public static void Write(string root, LocalSettings settings, IStateProtector protector)
    {
        OfflineProfiles.Validate(settings);
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "settings.bin");
        using var settingsLock = new FileStream(path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        if (File.Exists(path))
        {
            var previous = ReadFile(path, protector);
            // A stale second instance may not erase another instance's known owner partitions.
            if (previous.Profiles.Any(old => !settings.Profiles.Any(next => old.Identity == next.Identity &&
                old.ServiceOrigin == next.ServiceOrigin && old.UserId == next.UserId && old.Scope == next.Scope)))
                throw new InvalidDataException("本机身份列表已变化，请重新打开后再保存；现有配置和所有分区均已保留。");
        }
        else if (File.Exists(path + ".bak"))
            throw new InvalidDataException("必须先恢复缺失的本机配置主文件。");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(settings, Options);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            if (bytes.Length > MaxBytes) throw new InvalidDataException("本机配置超过容量限制，原文件已保留。");
            var encrypted = protector.Protect(bytes);
            if (encrypted.Length > MaxBytes) throw new InvalidDataException("加密配置超过容量限制，原文件已保留。");
            using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                4096, FileOptions.WriteThrough)) { stream.Write(encrypted); stream.Flush(true); }
            if (File.Exists(path)) File.Replace(temp, path, path + ".bak"); else File.Move(temp, path);
        }
        finally { CryptographicOperations.ZeroMemory(bytes); if (File.Exists(temp)) File.Delete(temp); }
    }

    // Recovery is explicit. Validate the backup before preserving/replacing a damaged primary.
    public static LocalSettings RestoreBackup(string root, IStateProtector protector)
    {
        var path = Path.Combine(root, "settings.bin");
        using var settingsLock = new FileStream(path + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var settings = ReadFile(path + ".bak", protector);
        var temp = path + ".recovery-" + Guid.NewGuid().ToString("N");
        try
        {
            using (var source = new FileStream(path + ".bak", FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var target = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                4096, FileOptions.WriteThrough)) { source.CopyTo(target); target.Flush(true); }
            if (File.Exists(path)) File.Replace(temp, path, path + ".damaged-" + Guid.NewGuid().ToString("N"));
            else File.Move(temp, path);
            return settings;
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }

    private static LocalSettings ReadFile(string path, IStateProtector protector)
    {
        var size = new FileInfo(path).Length;
        if (size < 1 || size > MaxBytes) throw new InvalidDataException("本机配置大小异常，原文件已保留。");
        byte[]? bytes = null;
        try
        {
            bytes = protector.Unprotect(File.ReadAllBytes(path));
            if (bytes.Length > MaxBytes) throw new InvalidDataException("本机配置超过容量限制。");
            using var document = JsonDocument.Parse(bytes);
            var value = document.RootElement;
            if (value.ValueKind != JsonValueKind.Object || value.EnumerateObject().GroupBy(x => x.Name, StringComparer.Ordinal).Any(x => x.Count() != 1))
                throw new InvalidDataException("本机配置结构无效，原文件已保留。");
            LocalSettings settings;
            if (!value.TryGetProperty("Schema", out _))
            {
                if (value.EnumerateObject().Any(x => x.Name != "PublicScope"))
                    throw new InvalidDataException("旧本机配置字段无效，不能推测账户身份。");
                var legacy = JsonSerializer.Deserialize<LegacySettings>(bytes, Options)
                    ?? throw new InvalidDataException("旧本机配置无效。");
                settings = OfflineProfiles.MigrateLegacy(legacy.PublicScope);
            }
            else
            {
                if (!value.TryGetProperty("Profiles", out _) || !value.TryGetProperty("LastActiveIdentity", out _) || !value.TryGetProperty("PublicScope", out _))
                    throw new InvalidDataException("本机配置字段缺失，原文件已保留。");
                settings = JsonSerializer.Deserialize<LocalSettings>(bytes, Options)
                    ?? throw new InvalidDataException("本机配置无效。");
            }
            OfflineProfiles.Validate(settings);
            return settings;
        }
        catch (Exception error) when (error is JsonException or CryptographicException)
        {
            throw new InvalidDataException("无法解密或读取本机配置；原文件与备份均已保留。", error);
        }
        finally { if (bytes is not null) CryptographicOperations.ZeroMemory(bytes); }
    }

    private sealed record LegacySettings(string? PublicScope = null);
}
