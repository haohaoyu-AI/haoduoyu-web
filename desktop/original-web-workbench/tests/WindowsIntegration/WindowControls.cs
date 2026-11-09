using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using Haoduoyu.OriginalUi;

internal static class WindowControls
{
    internal static async Task Verify(OriginalUiWindow window, string root, string phase)
    {
        if (window.WindowStyle != WindowStyle.SingleBorderWindow || window.ResizeMode != ResizeMode.CanResize
            || window.WindowState != WindowState.Normal || !window.ShowInTaskbar)
            throw new InvalidOperationException("Shipping window must start as a normal, resizable taskbar window.");
        var handle = new WindowInteropHelper(window).Handle;
        var style = GetWindowLongPtr(handle, -16).ToInt64();
        const long required = 0x00CF0000; // WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX
        if ((style & required) != required)
            throw new InvalidOperationException("Native caption, system menu, resize frame or minimize/maximize buttons are missing.");
        var area = SystemParameters.WorkArea;
        var initial = new Rect(window.Left, window.Top, window.Width, window.Height);
        if (initial.Left < area.Left - 1 || initial.Top < area.Top - 1
            || initial.Right > area.Right + 1 || initial.Bottom > area.Bottom + 1)
            throw new InvalidOperationException("The initial OUTER window does not fit the desktop work area.");
        SystemCommands.MinimizeWindow(window);
        await Task.Delay(250);
        if (!IsIconic(handle)) throw new InvalidOperationException("Native minimize did not take effect.");
        SystemCommands.RestoreWindow(window);
        await Task.Delay(250);
        if (IsIconic(handle) || window.WindowState != WindowState.Normal)
            throw new InvalidOperationException("Window did not restore from minimized state.");
        SystemCommands.MaximizeWindow(window);
        await Task.Delay(250);
        if (!IsZoomed(handle)) throw new InvalidOperationException("Native maximize did not take effect.");
        CaptureFrame(handle, Path.Combine(root, phase + "-window-maximized-frame.png"));
        SystemCommands.RestoreWindow(window);
        await Task.Delay(250);
        if (IsZoomed(handle) || window.WindowState != WindowState.Normal)
            throw new InvalidOperationException("Window did not return to windowed mode.");
        var narrower = Math.Max(window.MinWidth, initial.Width - 100);
        window.Width = narrower;
        await Task.Delay(150);
        if (Math.Abs(window.ActualWidth - narrower) > 1)
            throw new InvalidOperationException("Window resize did not take effect.");
        window.Width = initial.Width; window.Height = initial.Height;
        window.Left = initial.Left; window.Top = initial.Top;
        // Capture the normal frame AFTER native restore and the final page paint.
        // An early NavigationCompleted capture can show an empty WebView surface.
        await Task.Delay(400);
        CaptureFrame(handle, Path.Combine(root, phase + "-window-frame.png"));
        File.WriteAllText(Path.Combine(root, phase + "-window-controls.json"), JsonSerializer.Serialize(new {
            passed=true, nativeCaption=true, systemMenu=true, minimize=true, restore=true, maximize=true,
            resize=true, initialFitsWorkArea=true, initial, workArea=area,
            close="Existing graceful-close suite exercises the same native Window.Closing path.",
            evidence="Synthetic test window only. PrintWindow captures the outer HWND, not other desktop windows."
        }, new JsonSerializerOptions { WriteIndented=true }));
        Console.WriteLine("PASS native window caption/buttons; work-area fit; minimize/restore/maximize/resize");
    }

    internal static void CaptureFrame(nint window, string path)
    {
        if (!GetWindowRect(window, out var bounds)) throw new InvalidOperationException("Native window rectangle unavailable.");
        var width = bounds.Right - bounds.Left; var height = bounds.Bottom - bounds.Top;
        if (width <= 0 || height <= 0 || width > 16384 || height > 16384)
            throw new InvalidOperationException("Native frame dimensions are invalid.");
        var source = GetWindowDC(window);
        if (source == 0) throw new InvalidOperationException("Native window DC unavailable.");
        nint memory = 0, bitmap = 0, previous = 0;
        try
        {
            memory = CreateCompatibleDC(source); bitmap = CreateCompatibleBitmap(source, width, height);
            if (memory == 0 || bitmap == 0) throw new InvalidOperationException("Native capture allocation failed.");
            previous = SelectObject(memory, bitmap);
            if (previous == 0 || previous == (nint)(-1))
            {
                previous = 0;
                throw new InvalidOperationException("Native capture bitmap selection failed.");
            }
            if (!PrintWindow(window, memory, 2)) throw new InvalidOperationException("Whole-window PrintWindow failed.");
            var pixels = Imaging.CreateBitmapSourceFromHBitmap(bitmap, 0, Int32Rect.Empty, BitmapSizeOptions.FromEmptyOptions());
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(pixels));
            using var file = new FileStream(path, FileMode.CreateNew);
            encoder.Save(file); Program.ValidatePng(file);
        }
        finally
        {
            if (previous != 0 && memory != 0) SelectObject(memory, previous);
            if (bitmap != 0) DeleteObject(bitmap);
            if (memory != 0) DeleteDC(memory);
            ReleaseDC(window, source);
        }
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Bounds { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] private static extern nint GetWindowLongPtr(nint window, int index);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsIconic(nint window);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsZoomed(nint window);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool GetWindowRect(nint window, out Bounds bounds);
    [DllImport("user32.dll")] private static extern nint GetWindowDC(nint window);
    [DllImport("user32.dll")] private static extern int ReleaseDC(nint window, nint dc);
    [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool PrintWindow(nint window, nint dc, uint flags);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleDC(nint dc);
    [DllImport("gdi32.dll")] private static extern nint CreateCompatibleBitmap(nint dc, int width, int height);
    [DllImport("gdi32.dll")] private static extern nint SelectObject(nint dc, nint item);
    [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DeleteObject(nint item);
    [DllImport("gdi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool DeleteDC(nint dc);
}
