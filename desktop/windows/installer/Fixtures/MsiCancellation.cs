// CI-only Windows Installer client. This is NOT embedded in the MSI or product.
using System;
using System.Runtime.InteropServices;

public static class NativeInstallerCancellation
{
    [UnmanagedFunctionPointer(CallingConvention.Winapi, CharSet = CharSet.Unicode)]
    private delegate int InstallUi(IntPtr context, uint messageType, string message);
    [DllImport("msi.dll", CharSet = CharSet.Unicode, EntryPoint = "MsiSetExternalUIW")]
    private static extern IntPtr SetExternalUi(InstallUi handler, uint filter, IntPtr context);
    [DllImport("msi.dll", EntryPoint = "MsiSetInternalUI")]
    private static extern uint SetInternalUi(uint level, IntPtr window);
    [DllImport("msi.dll", CharSet = CharSet.Unicode, EntryPoint = "MsiInstallProductW")]
    private static extern uint InstallProduct(string packagePath, string commandLine);
    public static int ProgressCallbacks { get; private set; }
    private static readonly InstallUi Callback = OnMessage;
    private static int OnMessage(IntPtr context, uint messageType, string message)
    {
        if ((messageType & 0xff000000u) == 0x0a000000u)
        {
            ProgressCallbacks++;
            return 2; // IDCANCEL, a real Windows Installer cancellation response.
        }
        return 0;
    }
    public static uint CancelAtFirstProgress(string packagePath)
    {
        ProgressCallbacks = 0;
        uint oldLevel = SetInternalUi(2, IntPtr.Zero); // INSTALLUILEVEL_NONE
        SetExternalUi(Callback, 1u << 10, IntPtr.Zero); // INSTALLLOGMODE_PROGRESS
        try { return InstallProduct(packagePath, "REBOOT=ReallySuppress"); }
        finally
        {
            SetExternalUi(null, 0, IntPtr.Zero);
            SetInternalUi(oldLevel, IntPtr.Zero);
            GC.KeepAlive(Callback);
        }
    }
}
