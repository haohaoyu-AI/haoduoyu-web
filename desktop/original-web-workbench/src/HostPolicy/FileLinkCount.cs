using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Haoduoyu.OriginalUi.Policy;

internal static class FileLinkCount
{
    // Query the already-open file, not a second pathname susceptible to a swap.
    internal static void RequireSingleLink(SafeFileHandle handle)
    {
        uint count;
        if (OperatingSystem.IsWindows())
        {
            if (!GetFileInformationByHandle(handle, out var info)) throw new IOException("Cannot inspect asset links.", new Win32Exception(Marshal.GetLastWin32Error()));
            count = info.NumberOfLinks;
        }
        else if (OperatingSystem.IsLinux())
        {
            if (statx(handle.DangerousGetHandle().ToInt32(), "", 0x1000, 0x0004, out var info) != 0 || (info.Mask & 0x0004) == 0)
                throw new IOException("Cannot inspect asset links.", new Win32Exception(Marshal.GetLastWin32Error()));
            count = info.LinkCount;
        }
        else throw new PlatformNotSupportedException("Link-count validation supports Windows and Linux only.");
        if (count != 1) throw new InvalidDataException("Hard-linked bundle assets are not allowed.");
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct WindowsInfo
    {
        public uint FileAttributes, CreationTimeLow, CreationTimeHigh, LastAccessTimeLow, LastAccessTimeHigh,
            LastWriteTimeLow, LastWriteTimeHigh, VolumeSerialNumber, FileSizeHigh, FileSizeLow, NumberOfLinks, FileIndexHigh, FileIndexLow;
    }
    [StructLayout(LayoutKind.Explicit, Size = 256)]
    private struct LinuxStatx { [FieldOffset(0)] public uint Mask; [FieldOffset(16)] public uint LinkCount; }
    [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandle(SafeFileHandle hFile, out WindowsInfo info);
    [DllImport("libc", SetLastError = true)]
    private static extern int statx(int dirfd, [MarshalAs(UnmanagedType.LPUTF8Str)] string path, int flags, uint mask, out LinuxStatx result);
}
