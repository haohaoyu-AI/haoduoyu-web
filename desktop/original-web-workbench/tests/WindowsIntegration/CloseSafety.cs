using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Interop;
using System.Windows.Threading;
using Haoduoyu.OriginalUi;

internal static class CloseSafety
{
    // Test harness only. Dismiss the exact failure dialog owned by this synthetic test
    // process, not arbitrary dialogs, permissions, auth, or other applications.
    internal static async Task Probe(OriginalUiWindow window, string mode)
    {
        if (mode is not ("failed" or "pending" or "missing" or "actual-storage-failed")) throw new ArgumentException("Unknown close probe.");
        var state = mode == "failed" ? "failed" : "pending";
        if(mode!="actual-storage-failed") await window.Core.ExecuteScriptAsync("window.closeProbe={requested:null,resumed:null}; window.haoduoyuLocalLifecycle=" +
            (mode == "missing" ? "undefined" : "{requestFlush(id){closeProbe.requested=id;return true},status(id){return {state:'" + state + "'}},resume(id){closeProbe.resumed=id;return true}}"));
        var dismissalMessagePosted = false;
        var dialogSeen = false;
        var postAttempts = 0;
        var postFailures = 0;
        var lastPostError = 0;
        var dialogClass = "";
        var dialogOwnerMatches = false;
        var dialogBodyMatches = false;
        nint lastDialog = 0;
        var hostHandle = new WindowInteropHelper(window).Handle;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        timer.Tick += (_, _) => EnumThreadWindows(GetCurrentThreadId(), (handle, _) =>
        {
            GetWindowThreadProcessId(handle, out var process);
            var title = new StringBuilder(128); GetWindowText(handle, title, title.Capacity);
            if (process == Environment.ProcessId && title.ToString() == "暂未关闭")
            {
                dialogSeen = true; lastDialog = handle;
                var className = new StringBuilder(128); GetClassName(handle, className, className.Capacity);
                dialogClass = className.ToString();
                dialogOwnerMatches = hostHandle != 0 && GetWindow(handle, 4) == hostHandle; // GW_OWNER
                dialogBodyMatches = HasExactFailureText(handle);
                if (handle == hostHandle || dialogClass != "#32770" || !dialogOwnerMatches || !dialogBodyMatches) return true;
                // For this exact OK-only failure message box, WM_CLOSE is the normal
                // title-bar Close action and returns OK. Never send it to the host.
                // Do not guess a native button ID or destroy/end a dialog directly.
                postAttempts++;
                if (PostMessage(handle, 0x0010, 0, 0)) dismissalMessagePosted = true;
                else { postFailures++; lastPostError = Marshal.GetLastPInvokeError(); }
            }
            return true;
        }, 0);
        timer.Start();
        try
        {
            window.Close();
            // PostMessage only queues a dialog-close request. The modal loop can dispatch
            // async continuations before MessageBox.Show returns and the host's
            // finally block releases its close guard. Never substitute a sleep for
            // observing the host's actual completion of that failed attempt.
            try
            {
                await WaitUntil(() => dismissalMessagePosted && lastDialog != 0 && !IsWindow(lastDialog) &&
                    window.CloseFailure is not null && !window.CloseInProgress, TimeSpan.FromSeconds(15));
            }
            catch (TimeoutException ex)
            {
                // Report individual observations; queuing a native message does not
                // prove that the dialog was closed or that the host finished.
                var dialogExists = lastDialog != 0 && IsWindow(lastDialog);
                var dialogVisible = dialogExists && IsWindowVisible(lastDialog);
                var okButtonExists = dialogExists && GetDlgItem(lastDialog, 1) != 0;
                throw new TimeoutException("Failed-close probe timed out: messagePosted=" + dismissalMessagePosted +
                    "; failureRecorded=" + (window.CloseFailure is not null) + "; closeInProgress=" + window.CloseInProgress +
                    "; hostVisible=" + window.IsVisible + "; dialogSeen=" + dialogSeen + "; dialogExists=" + dialogExists +
                    "; dialogVisible=" + dialogVisible + "; okButtonExists=" + okButtonExists +
                    "; dialogClass=" + dialogClass + "; dialogOwnerMatches=" + dialogOwnerMatches + "; dialogBodyMatches=" + dialogBodyMatches +
                    "; postAttempts=" + postAttempts + "; postFailures=" + postFailures + "; lastPostError=" + lastPostError, ex);
            }
            if (!window.IsVisible) throw new Exception("Unsafe close: failure did not retain window.");
            if (!IsWindowEnabled(hostHandle)) throw new Exception("Failure dialog did not restore the host's enabled state.");
            if (mode != "missing" && await window.Core.ExecuteScriptAsync("Boolean(closeProbe.requested && closeProbe.requested===closeProbe.resumed)") != "true")
                throw new Exception("Failure did not resume the same close request.");
            Console.WriteLine("PASS actual shown host retains window for " + mode + " close, matching resume when available");
        }
        finally { timer.Stop(); }
        // Finish only after a distinct successful close handshake; no forced data cleanup.
        if(mode!="actual-storage-failed") await window.Core.ExecuteScriptAsync("window.retryProbe={requested:null,statusCalls:0}; window.haoduoyuLocalLifecycle={requestFlush(id){retryProbe.requested=id;return id!==closeProbe.requested},status(){retryProbe.statusCalls++;return {state:'complete'}},resume(){return true}}");
    }
    private static bool HasExactFailureText(nint dialog)
    {
        var found = false;
        EnumChildWindows(dialog, (child, _) =>
        {
            var className = new StringBuilder(128); GetClassName(child, className, className.Capacity);
            var text = new StringBuilder(2048); GetWindowText(child, text, text.Capacity);
            if (className.ToString() == "Static" && text.ToString().StartsWith(
                "尚未确认全部编辑已保存，窗口已保留。请检查页面保存提示后重试关闭。不会清除或重置任何本机数据。", StringComparison.Ordinal)) found = true;
            return true;
        }, 0);
        return found;
    }
    private static async Task WaitUntil(Func<bool> predicate, TimeSpan timeout)
    {
        var end = DateTime.UtcNow + timeout;
        while (!predicate()) { if (DateTime.UtcNow > end) throw new TimeoutException("Close failure not surfaced within bounded deadline."); await Task.Delay(50); }
    }
    private delegate bool EnumWindow(nint handle, nint param);
    [DllImport("user32.dll")] private static extern bool EnumThreadWindows(uint thread, EnumWindow callback, nint param);
    [DllImport("user32.dll")] private static extern bool EnumChildWindows(nint window, EnumWindow callback, nint param);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out int process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint window, StringBuilder text, int length);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(nint window, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern nint GetWindow(nint window, uint command);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool PostMessage(nint window, uint message, nint wParam, nint lParam);
    [DllImport("user32.dll")] private static extern bool IsWindow(nint window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern bool IsWindowEnabled(nint window);
    [DllImport("user32.dll")] private static extern nint GetDlgItem(nint window, int item);
}
