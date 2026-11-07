using System.Reflection;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> DayRolloverCases =>
    [
        ("Shown native Beijing rollover preserves original editor date drafts queue and cache until explicit today navigation", () => RunWithDispatcher(BeijingRolloverAsync)),
        ("Shown native today navigation stays on the original date and editor when draft persistence fails", () => RunWithDispatcher(BeijingRolloverSaveFailureAsync))
    ];

    private sealed class WindowClock(DateTimeOffset now) : TimeProvider
    {
        internal DateTimeOffset Now = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static async Task BeijingRolloverAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin();
            var clock = new WindowClock(new DateTimeOffset(2026, 12, 31, 15, 59, 59, TimeSpan.Zero));
            var window = await ShowAsync(root, handler, clock);
            try
            {
                Check(Field<DatePicker>(window, "date").SelectedDate == new DateTime(2026, 12, 31), "injected clock did not set the Beijing initial day");
                Check(Field<DateTime>(window, "aiReportDay") == new DateTime(2026, 12, 31), "AI report initial date ignored the same window clock");
                await ClickAsync(window, "生活记录");
                var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
                var original = Object(("id", id), ("version", 0), ("category", "life"), ("date", "2026-12-31"), ("text", ""));
                await InvokeAsync(window, "EditAsync", "note", original, key);
                BodyEditor(window).Text = "跨年前的合成原稿 🐟";
                await ClickAsync(window, "保存到待同步队列");
                var request = Engine(window).Snapshot.Outbox.Single();
                await InvokeAsync(window, "EditAsync", "note", original, key);
                const string latest = "跨年前的合成原稿 🐟\n尚在原日期继续输入。";
                BodyEditor(window).Text = latest;
                var cache = System.Text.Json.JsonSerializer.Serialize(Engine(window).Snapshot.Cache);
                // Observe with the UI connected flag set as well: observation must never use the transport.
                // No synthetic login or business write is granted by this flag.
                typeof(MainWindow).GetField("connected", Private)!.SetValue(window, true);
                var dayTimer = Field<DispatcherTimer>(window, "dayTimer");
                Check(dayTimer.IsEnabled && dayTimer.Interval == TimeSpan.FromSeconds(30), "native day observation timer was not started with its bounded polling interval");
                dayTimer.Interval = TimeSpan.FromMilliseconds(20);
                clock.Now = new DateTimeOffset(2026, 12, 31, 16, 0, 0, TimeSpan.Zero);
                var notice = Field<Border>(window, "dayNotice");
                await UntilAsync(() => notice.Visibility == Visibility.Visible, "native dispatcher timer did not observe the new Beijing day");
                dayTimer.Interval = TimeSpan.FromSeconds(30);
                Check(notice.Visibility == Visibility.Visible && Field<TextBlock>(window, "dayNoticeText").Text.Contains("2027-01-01", StringComparison.Ordinal), "Beijing midnight did not show an independent visible notice");
                Check(Field<DatePicker>(window, "date").SelectedDate == new DateTime(2026, 12, 31) && Field<string>(window, "currentPage") == "生活记录" && BodyEditor(window).Text == latest,
                    "day observation changed the editor its selected date or unfinished input");
                Check(System.Text.Json.JsonSerializer.Serialize(Engine(window).Snapshot.Cache) == cache && SameDayRequest(Engine(window).Snapshot.Outbox.Single(), request) && handler.Calls == 0 && sockets.Connects == 0,
                    "observing a new day refreshed cache altered or sent an immutable queued request");
                Check(Field<bool>(window, "connected"), "read-only day observation changed the connected state");
                typeof(MainWindow).GetField("connected", Private)!.SetValue(window, false);
                await ClickAsync(window, "继续原日期");
                RefreshDay(window);
                Check(notice.Visibility == Visibility.Collapsed && BodyEditor(window).Text == latest, "same-day polling re-opened a dismissed notice or changed the editor");
                clock.Now = clock.Now.AddDays(3);
                // Exercise the exact activation handler; no operating-system clock or physical sleep is changed.
                typeof(MainWindow).GetMethod("OnWindowActivated", Private)!.Invoke(window, [window, EventArgs.Empty]);
                Check(notice.Visibility == Visibility.Visible && Field<TextBlock>(window, "dayNoticeText").Text.Contains("2027-01-04", StringComparison.Ordinal), "activation after several missed days did not observe the latest Beijing day");
                await ClickAsync(window, "打开今天待办");
                Check(DraftText(Engine(window).Snapshot, key) == latest && DraftValues(Engine(window).Snapshot, key)?["text"]?.GetValue<string>() == latest,
                    "explicit today navigation failed to flush the original note draft");
                Check(JsonNode.Parse(Engine(window).Snapshot.Drafts[key].Text)?["original"]?["date"]?.GetValue<string>() == "2026-12-31" && SameDayRequest(Engine(window).Snapshot.Outbox.Single(), request),
                    "today navigation relabeled the original draft date or rewrote the original queued request");
                Check(Field<DatePicker>(window, "date").SelectedDate == new DateTime(2027, 1, 4) && Field<string>(window, "currentPage") == "待办" && notice.Visibility == Visibility.Collapsed,
                    "explicit today navigation did not update the date and dismiss its own notice");
                Check(handler.Calls == 0 && sockets.Connects == 0, "offline today navigation issued a network request");
                SaveEvidence(window, "beijing-day-explicit-today.png");
            }
            finally
            {
                await CloseIfOpenAsync(window);
                Check(!Field<DispatcherTimer>(window, "dayTimer").IsEnabled, "closed native window retained its day polling timer");
            }
        });
    }

    private static async Task BeijingRolloverSaveFailureAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin();
            var clock = new WindowClock(new DateTimeOffset(2026, 11, 7, 15, 59, 59, TimeSpan.Zero));
            var window = await ShowAsync(root, handler, clock);
            Func<Task>? saver = null;
            try
            {
                await ClickAsync(window, "生活记录");
                var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
                await InvokeAsync(window, "EditAsync", "note", Object(("id", id), ("version", 0), ("category", "life"), ("date", "2026-11-07"), ("text", "")), key);
                BodyEditor(window).Text = "保存受阻时仍应留在原日期的中文";
                saver = Field<Func<Task>>(window, "saveEditor");
                typeof(MainWindow).GetField("saveEditor", Private)!.SetValue(window, (Func<Task>)(async () =>
                {
                    await Task.Delay(30);
                    throw new System.IO.IOException("synthetic draft persistence unavailable");
                }));
                clock.Now = clock.Now.AddSeconds(2);
                RefreshDay(window);
                await ClickAsync(window, "打开今天待办");
                Check(Field<DatePicker>(window, "date").SelectedDate == new DateTime(2026, 11, 7) && Field<string>(window, "currentPage") == "生活记录" && BodyEditor(window).Text == "保存受阻时仍应留在原日期的中文",
                    "failed flush navigated away changed the selected day or discarded input");
                Check(Field<Border>(window, "dayNotice").Visibility == Visibility.Visible && Field<bool>(window, "draftDirty") && Engine(window).Snapshot.Outbox.Count == 0 && handler.Calls == 0 && sockets.Connects == 0,
                    "failed today navigation hid the recovery notice cleared the dirty flag or sent a request");
                typeof(MainWindow).GetField("saveEditor", Private)!.SetValue(window, saver);
                await ClickAsync(window, "打开今天待办");
                Check(DraftText(Engine(window).Snapshot, key) == "保存受阻时仍应留在原日期的中文" && Field<DatePicker>(window, "date").SelectedDate == new DateTime(2026, 11, 8),
                    "retry after restoring persistence lost the original draft or failed to open today");
            }
            finally
            {
                if (saver != null && window.IsVisible && Field<string>(window, "currentPage") == "生活记录") typeof(MainWindow).GetField("saveEditor", Private)!.SetValue(window, saver);
                await CloseIfOpenAsync(window);
            }
        });
    }

    private static void RefreshDay(MainWindow window) => typeof(MainWindow).GetMethod("RefreshBeijingDayNotice", Private)!.Invoke(window, null);
    private static bool SameDayRequest(PendingOperation first, PendingOperation second) =>
        System.Text.Json.JsonSerializer.Serialize(first) == System.Text.Json.JsonSerializer.Serialize(second);
}
