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

internal sealed record LocalSettings(string? PublicScope = null);
internal static class SettingsFile
{
    public static LocalSettings Read(string root, IStateProtector protector)
    {
        var path = Path.Combine(root, "settings.bin");
        if (!File.Exists(path)) return new();
        var bytes = protector.Unprotect(File.ReadAllBytes(path));
        try { return JsonSerializer.Deserialize<LocalSettings>(bytes) ?? throw new InvalidDataException("本机配置无效。"); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    public static void Write(string root, LocalSettings settings, IStateProtector protector)
    {
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "settings.bin");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(settings);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var encrypted = protector.Protect(bytes);
            using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None,
                4096, FileOptions.WriteThrough)) { stream.Write(encrypted); stream.Flush(true); }
            if (File.Exists(path)) File.Replace(temp, path, path + ".bak"); else File.Move(temp, path);
        }
        finally { CryptographicOperations.ZeroMemory(bytes); if (File.Exists(temp)) File.Delete(temp); }
    }
}
