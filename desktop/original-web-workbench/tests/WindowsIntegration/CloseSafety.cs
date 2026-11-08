using System.Runtime.InteropServices;
using System.Text;
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
        var dismissed = false;
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
        timer.Tick += (_, _) => EnumThreadWindows(GetCurrentThreadId(), (handle, _) =>
        {
            GetWindowThreadProcessId(handle, out var process);
            var title = new StringBuilder(128); GetWindowText(handle, title, title.Capacity);
            if (process == Environment.ProcessId && title.ToString() == "暂未关闭")
            { if(PostMessage(handle, 0x0111, 1, 0)) dismissed = true; }
            return true;
        }, 0);
        timer.Start();
        try
        {
            window.Close();
            // PostMessage only queues IDOK. The modal loop can continue to dispatch
            // async continuations before MessageBox.Show returns and the host's
            // finally block releases its close guard. Never substitute a sleep for
            // observing the host's actual completion of that failed attempt.
            await WaitUntil(() => dismissed && window.CloseFailure is not null && !window.CloseInProgress, TimeSpan.FromSeconds(15));
            if (!window.IsVisible) throw new Exception("Unsafe close: failure did not retain window.");
            if (mode != "missing" && await window.Core.ExecuteScriptAsync("Boolean(closeProbe.requested && closeProbe.requested===closeProbe.resumed)") != "true")
                throw new Exception("Failure did not resume the same close request.");
            Console.WriteLine("PASS actual shown host retains window for " + mode + " close, matching resume when available");
        }
        finally { timer.Stop(); }
        // Finish only after a distinct successful close handshake; no forced data cleanup.
        if(mode!="actual-storage-failed") await window.Core.ExecuteScriptAsync("window.retryProbe={requested:null,statusCalls:0}; window.haoduoyuLocalLifecycle={requestFlush(id){retryProbe.requested=id;return id!==closeProbe.requested},status(){retryProbe.statusCalls++;return {state:'complete'}},resume(){return true}}");
    }
    private static async Task WaitUntil(Func<bool> predicate, TimeSpan timeout)
    {
        var end = DateTime.UtcNow + timeout;
        while (!predicate()) { if (DateTime.UtcNow > end) throw new TimeoutException("Close failure not surfaced within bounded deadline."); await Task.Delay(50); }
    }
    private delegate bool EnumWindow(nint handle, nint param);
    [DllImport("user32.dll")] private static extern bool EnumThreadWindows(uint thread, EnumWindow callback, nint param);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out int process);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(nint window, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern bool PostMessage(nint window, uint message, nint wParam, nint lParam);
}
