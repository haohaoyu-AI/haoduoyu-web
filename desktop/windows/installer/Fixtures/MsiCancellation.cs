// CI-only Windows Installer client. This is NOT embedded in the MSI or product.
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public enum NativeInstallerRegistrationState { Absent, Advertised, Installed }

// Read-only QA probe, not an ownership/authorization check for the real MSI guard.
public static class NativeInstallerRegistration
{
    private const uint UserUnmanaged = 2; // MSIINSTALLCONTEXT_USERUNMANAGED
    private const uint UnknownProduct = 1605; // ERROR_UNKNOWN_PRODUCT
    [DllImport("msi.dll", CharSet = CharSet.Unicode, ExactSpelling = true, EntryPoint = "MsiGetProductInfoExW")]
    private static extern uint GetProductInfo(string productCode, string userSid, uint context,
        string property, StringBuilder value, ref uint characters);
    internal delegate uint ProductInfoReader(string productCode, string userSid, uint context,
        string property, StringBuilder value, ref uint characters);

    public static NativeInstallerRegistrationState GetState(string productCode)
    {
        return GetState(productCode, GetProductInfo);
    }

    // The injectable reader is internal and used only by cross-platform synthetic regressions.
    internal static NativeInstallerRegistrationState GetState(string productCode, ProductInfoReader read)
    {
        Guid parsed;
        if (productCode == null ||
            !(Guid.TryParseExact(productCode, "D", out parsed) || Guid.TryParseExact(productCode, "B", out parsed)) ||
            parsed == Guid.Empty ||
            !(String.Equals(productCode, parsed.ToString("D"), StringComparison.OrdinalIgnoreCase) ||
              String.Equals(productCode, parsed.ToString("B"), StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException("Expected an exact non-empty MSI ProductCode GUID.", "productCode");
        string code = parsed.ToString("B").ToUpperInvariant();
        // NULL SID means the current user; do not search machine/managed/other-user contexts.
        // INSTALLPROPERTY_PRODUCTSTATE is "State": success returns "1" (advertised) or "5" (installed).
        // https://learn.microsoft.com/en-us/windows/win32/api/msi/nf-msi-msigetproductinfoexw
        var value = new StringBuilder(2); // One state character plus the terminating NUL.
        uint characters = (uint)value.Capacity;
        uint result = read(code, null, UserUnmanaged, "State", value, ref characters);
        if (result == UnknownProduct) return NativeInstallerRegistrationState.Absent;
        if (result != 0)
            throw new Win32Exception((int)result, "MsiGetProductInfoExW failed for " + code +
                " in current-user USERUNMANAGED context (error " + result + ").");
        string state = value.ToString();
        if (characters == 1 && state == "5") return NativeInstallerRegistrationState.Installed;
        if (characters == 1 && state == "1") return NativeInstallerRegistrationState.Advertised;
        throw new InvalidOperationException("Unexpected MSI State '" + state + "' (length " + characters +
            ") for " + code + " in current-user USERUNMANAGED context.");
    }
}

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
