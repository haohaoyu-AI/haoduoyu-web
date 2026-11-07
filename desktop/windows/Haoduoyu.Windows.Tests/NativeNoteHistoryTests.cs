using System.IO;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> NoteHistoryCases =>
    [
        ("Shown native note month distinguishes full empty days from partial local history and preserves private offline work through filters navigation and restart", () => RunWithDispatcher(NoteHistoryOfflineAsync)),
        ("Shown native note month validates real transport headers scope and whole-month responses before atomic cache replacement and preserves work on rejection cancellation or scope drift", () => RunWithDispatcher(NoteHistoryRefreshAsync)),
        ("Shown native note month summaries remain readonly and require a complete versioned original before continuing the same draft without releasing unknown or recovered requests", () => RunWithDispatcher(NoteHistoryReadonlyAsync))
    ];

    private static async Task NoteHistoryOfflineAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var scope = new string('b', 64); var otherScope = new string('c', 64);
            const string owner = "10000000-0000-4000-8000-000000000801", other = "10000000-0000-4000-8000-000000000802";
            var identity = "user:" + owner + ":" + scope; var otherIdentity = "user:" + other + ":" + otherScope;
            var life = MonthNote("2026-11-01", "life", "甲服务器生活原文", "生活", "旅行");
            var work = MonthNote("2026-11-03", "work", "甲服务器工作原文", "工作");
            var draftSource = MonthNote("2026-11-04", "life", "甲草稿对应的服务原文", "生活");
            var legacy = MonthLegacy("2026-11-05", "life", "甲旧版日页原文");
            var deletedSource = MonthNote("2026-11-07", "life", "甲删除结果待核的服务原文", "生活");
            var original = FullMonthNote(draftSource, "2026-11-04", 4);
            var draftValues = (JsonObject)original.DeepClone(); draftValues["text"] = "甲月历独立展示的未排队草稿 🐟";
            var draft = AppDraft("note", MonthKey(draftSource), original, draftValues);
            var queuedId = Guid.NewGuid().ToString(); var queuedKey = "/api/v1/note-entries/" + queuedId; var queuedSaveId = Guid.NewGuid().ToString();
            var queued = new PendingOperation { Id = queuedSaveId, ResourceKey = queuedKey, Path = queuedKey, Method = "PUT",
                BodyJson = Object(("version", 0), ("save_id", queuedSaveId), ("category", "life"), ("date", "2026-11-02"),
                    ("text", "甲仅本机排队的新碎碎念"), ("labels", new JsonArray("生活", "旅行"))).ToJsonString() };
            var unknownId = Guid.NewGuid().ToString();
            var unknown = new PendingOperation { Id = unknownId, ResourceKey = MonthKey(life), Path = MonthKey(life), Method = "PUT", Status = PendingStatus.Unknown,
                SendAttempts = 1, BodyJson = Object(("version", 3), ("save_id", unknownId), ("category", "life"), ("date", "2026-11-01"),
                    ("text", "甲结果待核的本机原请求"), ("labels", new JsonArray("生活", "旅行"))).ToJsonString() };
            var deleteId = Guid.NewGuid().ToString();
            var unknownDelete = new PendingOperation { Id = deleteId, ResourceKey = MonthKey(deletedSource), Path = MonthKey(deletedSource), Method = "DELETE",
                Status = PendingStatus.Unknown, SendAttempts = 1, BodyJson = Object(("version", 3), ("save_id", deleteId)).ToJsonString() };
            var partial = FullMonthNote(MonthNote("2026-10-31", "life", "甲十月局部已知记录", "生活"), "2026-10-31", 2);
            var cache = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                [MonthPath("2026-11")] = MonthResponse("2026-11", ("2026-11-01", life), ("2026-11-03", work), ("2026-11-04", draftSource), ("2026-11-05", legacy), ("2026-11-07", deletedSource)),
                ["/api/v1/note-entries?category=life&date=2026-10-31"] = Wrap(Object(("date", "2026-10-31"), ("category", "life"), ("can_edit", true),
                    ("labels_version", 3), ("entries", new JsonArray(partial))))
            };
            var path = await SeedCalendarWorkspaceAsync(root, identity, cache, draft, queued, unknown, unknownDelete);
            var otherMonth = Day[..7]; var otherNote = MonthNote(Day, "work", "乙账号的独立月历原文", "工作");
            var otherPath = await SeedCalendarWorkspaceAsync(root, otherIdentity, new Dictionary<string, string>(StringComparer.Ordinal)
            { [MonthPath(otherMonth)] = MonthResponse(otherMonth, (Day, otherNote)) });
            var bytes = await File.ReadAllBytesAsync(path); var otherBytes = await File.ReadAllBytesAsync(otherPath);
            RememberProfiles(root, new string('a', 64), owner, scope, other, otherScope, identity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11");
                Check(NoteMonthDays(window).Length == 30 && NoteMonthTile(window, "2026-11-30").Contains("0", StringComparison.Ordinal) &&
                    !UnknownCalendarCoverage(NoteMonthTile(window, "2026-11-30")), "a fully read month did not distinguish an authoritative empty day from unread history");
                Check(!NoteMonthItems(window).Any(item => item.EntityId == deletedSource["entity_id"]!.GetValue<string>()) &&
                    !NoteMonthTile(window, "2026-11-07").Contains("已完整读取的空日", StringComparison.Ordinal) && NoteMonthTile(window, "2026-11-07").Contains("待核", StringComparison.Ordinal),
                    "an attempted unknown deletion was rendered as a confirmed complete empty day instead of retaining its unresolved intent");
                Check(NoteMonthItems(window).Any(item => item.Text == "甲仅本机排队的新碎碎念" && item.LocalStatus == "Queued") &&
                    NoteMonthItems(window).Any(item => item.Text == "甲结果待核的本机原请求" && item.LocalStatus == "Unknown") &&
                    NoteMonthItems(window).Any(item => item.EntityId == draftSource["entity_id"]!.GetValue<string>() && item.HasDraft && item.Text == "甲草稿对应的服务原文") &&
                    NoteMonthControl<Button>(window, "note-history-local-draft-" + draft.Key).IsEnabled,
                    "the monthly native view hid queued unknown or draft-only provenance or replaced a server original with draft text");
                NoteMonthControl<ComboBox>(window, "note-history-label").SelectedValue = "旅行";
                await NoteMonthClickAsync(window, "note-history-apply");
                Check(NoteMonthItems(window).Count == 2 && NoteMonthItems(window).All(item => item.Labels.Contains("旅行", StringComparer.Ordinal)),
                    "the native month label filter omitted local rows or retained unrelated labels");
                var filteredSummary = NoteMonthControl<TextBlock>(window, "note-history-summary").Text.Replace(" ", "", StringComparison.Ordinal);
                Check(filteredSummary.Contains("当前已知记录5", StringComparison.Ordinal) && filteredSummary.Contains("月基线记录5", StringComparison.Ordinal) &&
                    filteredSummary.Contains("当前筛选2条", StringComparison.Ordinal), "a month filter silently changed the whole-month or source-only count denominator");
                NoteMonthControl<TextBox>(window, "note-history-query").Text = "结果待核";
                await NoteMonthClickAsync(window, "note-history-apply");
                Check(NoteMonthItems(window).Count == 1 && NoteMonthItems(window)[0].LocalStatus == "Unknown", "monthly text filtering erased uncertain-result provenance");
                NoteMonthControl<TextBox>(window, "note-history-query").Clear(); NoteMonthControl<ComboBox>(window, "note-history-label").SelectedValue = "";
                NoteMonthControl<ComboBox>(window, "note-history-source").SelectedValue = "work";
                await NoteMonthClickAsync(window, "note-history-apply");
                Check(NoteMonthItems(window).Count == 1 && NoteMonthItems(window)[0].Text == "甲服务器工作原文", "monthly life/work source filtering mixed categories");
                await NoteMonthClickAsync(window, "note-history-previous");
                NoteMonthControl<ComboBox>(window, "note-history-source").SelectedValue = "all"; await NoteMonthClickAsync(window, "note-history-apply");
                Check(NoteMonthText(window).Contains("甲十月局部已知记录", StringComparison.Ordinal) && UnknownCalendarCoverage(NoteMonthTile(window, "2026-10-30")),
                    "a daily cache was promoted to a complete monthly baseline or its known record was hidden");
                await NoteMonthClickAsync(window, "note-history-next"); await NoteMonthClickAsync(window, "note-history-day-2026-11-03");
                Check(NoteMonthItems(window).Single().Date == new DateOnly(2026, 11, 3) && Field<string>(window, "currentPage") == "碎碎念月历",
                    "selecting a month day did not narrow the local month list without a network read");
                await SelectNoteMonthItemAsync(window, item => item.Category == "work"); await NoteMonthClickAsync(window, "note-history-open-day");
                Check(Field<string>(window, "currentPage") == "工作记录" && Field<DatePicker>(window, "date").SelectedDate == new DateTime(2026, 11, 3),
                    "selecting the work-only monthly day did not open the exact existing native day list");
                Check(JsonSerializer.Serialize(Engine(window).Snapshot.Outbox) == JsonSerializer.Serialize(new[] { queued, unknown, unknownDelete }) &&
                    Engine(window).Snapshot.Drafts[draft.Key].Text == draft.Text && (await File.ReadAllBytesAsync(path)).SequenceEqual(bytes),
                    "readonly monthly navigation changed a private business file draft or immutable request");
                await CloseAsync(window); window = await ShowAsync(root, handler); await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11");
                Check(NoteMonthItems(window).Any(item => item.LocalStatus == "Unknown") && NoteMonthItems(window).Any(item => item.HasDraft),
                    "restart lost the local month draft or unknown-result marker");
                SaveEvidence(window, "note-month-private-offline-history.png");
                await InvokeAsync(window, "OpenOfflineProfileAsync", otherIdentity); await ClickAsync(window, "碎碎念月历");
                Check(NoteMonthControl<TextBox>(window, "note-history-month").Text == otherMonth &&
                    NoteMonthControl<ComboBox>(window, "note-history-source").SelectedValue?.ToString() == "all" &&
                    NoteMonthControl<TextBox>(window, "note-history-query").Text.Length == 0 &&
                    NoteMonthItems(window).Single().Text == "乙账号的独立月历原文" && !NoteMonthText(window).Contains("甲", StringComparison.Ordinal),
                    "profile switching leaked monthly filters anchors source text or local drafts");
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(bytes) && (await File.ReadAllBytesAsync(otherPath)).SequenceEqual(otherBytes) &&
                    handler.Calls == 0 && handler.WriteCalls == 0 && sockets.Connects == 0,
                    "offline monthly history filtering restart or profile switching changed business files requested HTTP or opened a socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task NoteHistoryRefreshAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new NoteMonthOrigin();
            var identity = "public:" + origin.Scope; var path = MonthPath("2026-11");
            var old = MonthNote("2026-11-01", "life", "刷新前完整原件", "生活");
            var draft = AppDraft("history", "month-refresh-protected-draft", new JsonObject(), Object(("text", "月刷新不能改写的中文草稿 🐟")));
            var pendingId = Guid.NewGuid().ToString(); var pendingKey = "/api/v1/note-entries/" + Guid.NewGuid().ToString();
            var pending = new PendingOperation { Id = pendingId, ResourceKey = pendingKey, Path = pendingKey, Method = "PUT", Status = PendingStatus.Unknown,
                SendAttempts = 1, BodyJson = Object(("version", 2), ("save_id", pendingId), ("text", "月刷新不能重放的请求")).ToJsonString() };
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal) { [path] = MonthResponse("2026-11", ("2026-11-01", old)) }, draft, pending);
            RememberProfiles(root, origin.Scope, "10000000-0000-4000-8000-000000000803", new string('b', 64), "10000000-0000-4000-8000-000000000804", new string('c', 64), identity);
            var window = await ShowNoteMonthWindowAsync(root, origin);
            try
            {
                await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11"); await ClickAsync(window, "连接并刷新");
                Check(Field<bool>(window, "connected") && origin.MonthCalls == 0, "entering or connecting the month view implicitly downloaded history");
                origin.MonthJson = MonthResponse("2026-11", ("2026-11-04", MonthNote("2026-11-04", "life", "已完整核对的新月原件", "生活", "旅行")),
                    ("2026-11-05", MonthLegacy("2026-11-05", "work", "完整核对的旧版工作日页")));
                await NoteMonthClickAsync(window, "note-history-refresh");
                var accepted = Engine(window).Snapshot; var acceptedCache = accepted.Cache[path];
                Check(origin.MonthCalls == 1 && NoteMonthItems(window).Count == 2 && !NoteMonthText(window).Contains("刷新前完整原件", StringComparison.Ordinal) &&
                    accepted.CacheRevisions[path] > 1 && accepted.Drafts[draft.Key].Text == draft.Text && JsonSerializer.Serialize(accepted.Outbox) == JsonSerializer.Serialize(new[] { pending }),
                    "a validated complete month was not atomically cached with its separate local work intact");
                var acceptedBytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                var duplicate = MonthNote("2026-11-04", "life", "重复摘要不能覆盖", "生活");
                foreach (var invalid in new[]
                {
                    MonthResponse("2026-12"),
                    MonthResponse("2026-11", ("2026-11-04", duplicate), ("2026-11-04", duplicate))
                })
                {
                    origin.MonthJson = invalid; await NoteMonthClickAsync(window, "note-history-refresh");
                    AssertMonthRetained(window, path, acceptedCache, draft, pending, "invalid month or duplicate source");
                    Check((await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(acceptedBytes), "a rejected month rewrote its encrypted workspace");
                }
                origin.MonthStatus = HttpStatusCode.RequestEntityTooLarge;
                origin.MonthJson = "{\"error\":{\"code\":\"NOTES_MONTH_LIMIT\",\"message\":\"synthetic bounded month\"}}";
                await NoteMonthClickAsync(window, "note-history-refresh"); AssertMonthRetained(window, path, acceptedCache, draft, pending, "whole-month 413");
                Check((await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(acceptedBytes), "a whole-month limit rejection rewrote the accepted encrypted workspace");
                origin.MonthStatus = HttpStatusCode.OK; origin.MonthJson = MonthResponse("2026-11"); origin.HoldMonth = new(TaskCreationOptions.RunContinuationsAsynchronously);
                var beforeCancelCalls = origin.MonthCalls; NoteMonthStartClick(window, "note-history-refresh");
                await UntilAsync(() => origin.MonthCalls > beforeCancelCalls, "cancellation fixture did not begin its real month transport");
                var cancel = Descendants(window).OfType<Button>().Single(button => button.Content?.ToString() == "取消当前操作"); cancel.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                await window.WaitForIdleAsync(); origin.HoldMonth.TrySetResult(true); origin.HoldMonth = null;
                AssertMonthRetained(window, path, acceptedCache, draft, pending, "cancelled month");
                Check(origin.CancelledMonth > 0, "the shown cancel button did not cancel the pending WorkbenchApi read");
                Check((await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(acceptedBytes), "cancelling a month read rewrote the accepted encrypted workspace");
                await NoteMonthClickAsync(window, "note-history-refresh");
                Check(NoteMonthItems(window).Count == 0 && !UnknownCalendarCoverage(NoteMonthTile(window, "2026-11-30")) &&
                    Engine(window).Snapshot.Cache[path] != acceptedCache, "a valid complete empty month was rejected or rendered as unread");
                var emptyCache = Engine(window).Snapshot.Cache[path];
                var emptyBytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                origin.MonthJson = MonthResponse("2026-11", ("2026-11-01", MonthNote("2026-11-01", "life", "异账号迟到响应不能写入", "生活")));
                origin.ChangeScopeAfterMonth = true; await NoteMonthClickAsync(window, "note-history-refresh");
                AssertMonthRetained(window, path, emptyCache, draft, pending, "late foreign scope");
                Check((await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(emptyBytes), "a late foreign-scope month response rewrote the original encrypted partition");
                Check(!Field<bool>(window, "connected") && !NoteMonthText(window).Contains("异账号迟到响应", StringComparison.Ordinal), "scope drift was accepted into the old month or left the connection trusted");
                Check(origin.MonthCalls >= 7 && origin.NoteHeaders >= origin.MonthCalls && origin.ScopeCalls >= 4 && origin.WriteCalls == 0 && sockets.Connects == 0,
                    "native month refresh bypassed labels-v3 fixed-origin scope reads or opened a real transport/business write");
                SaveEvidence(window, "note-month-refresh-rejections-keep-cache.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task NoteHistoryReadonlyAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var origin = new NoteMonthOrigin();
            var identity = "public:" + origin.Scope;
            var summary = MonthNote("2026-11-04", "life", "月摘要不是完整原稿", "生活", "旅行"); var key = MonthKey(summary);
            var full = FullMonthNote(summary, "2026-11-04", 7); full["text"] = "独立详情读取的完整服务正文";
            var original = (JsonObject)full.DeepClone(); original["version"] = 4; original["text"] = "原草稿版本四正文";
            var values = (JsonObject)original.DeepClone(); values["text"] = "已有草稿不能被月摘要或较新详情覆盖 🐟";
            var draft = AppDraft("note", key, original, values);
            var unknownSource = MonthNote("2026-11-06", "life", "未知原请求的月摘要", "生活"); var unknownKey = MonthKey(unknownSource);
            var unknownId = Guid.NewGuid().ToString();
            var unknown = new PendingOperation { Id = unknownId, ResourceKey = unknownKey, Path = unknownKey, Method = "PUT", Status = PendingStatus.Unknown,
                SendAttempts = 1, BodyJson = Object(("version", 3), ("save_id", unknownId), ("date", "2026-11-06"), ("category", "life"),
                    ("text", "恢复备份中的精确未知请求"), ("labels", new JsonArray("生活"))).ToJsonString() };
            var legacy = MonthLegacy("2026-11-05", "work", "缺少版本的旧日页摘要");
            await SeedCalendarWorkspaceAsync(root, identity, new Dictionary<string, string>(StringComparer.Ordinal)
            { [MonthPath("2026-11")] = MonthResponse("2026-11", ("2026-11-04", summary), ("2026-11-05", legacy), ("2026-11-06", unknownSource)) }, draft, unknown);
            using (var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector()))
            {
                var oldState = await store.LoadAsync();
                await store.SaveAsync(oldState with { LocalRevision = 2, Outbox = [unknown with { Status = PendingStatus.Confirmed,
                    ConfirmedRevision = 2, RemoteJson = Wrap(FullMonthNote(unknownSource, "2026-11-06", 4)) }] });
            }
            RememberProfiles(root, origin.Scope, "10000000-0000-4000-8000-000000000805", new string('b', 64), "10000000-0000-4000-8000-000000000806", new string('c', 64), identity);
            origin.Responses[key] = Wrap(full);
            origin.Responses["/api/v1/note-entries/labels"] = Wrap(Object(("labels_version", 3), ("labels", new JsonArray()), ("archived_labels", new JsonArray())));
            var window = await ShowNoteMonthWindowAsync(root, origin);
            try
            {
                Check(Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Confirmed, "the month restore fixture lacks its newer saved receipt");
                await InvokeAsync(window, "RestoreWorkspaceBackupAsync");
                var recoveryRevision = Engine(window).Snapshot.BackupRecoveryRevision;
                Check(recoveryRevision > 0 && Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown &&
                    Engine(window).Snapshot.Outbox.Single().RecoveredAtRevision == recoveryRevision &&
                    Engine(window).Snapshot.Drafts[key].RecoveredAtRevision == recoveryRevision,
                    "actual encrypted backup restore did not establish the native month request and draft recovery fence");
                await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11");
                var untouched = Engine(window).Snapshot; var bytes = await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath);
                await SelectNoteMonthItemAsync(window, item => item.EntityId == summary["entity_id"]!.GetValue<string>());
                Check(NoteMonthControl<TextBox>(window, "note-history-readonly-text").IsReadOnly &&
                    NoteMonthControl<TextBox>(window, "note-history-readonly-text").Text == "月摘要不是完整原稿" && origin.Paths.Count == 0,
                    "selecting a monthly summary edited text or implicitly requested detail");
                await NoteMonthClickAsync(window, "note-history-edit-prepare");
                Check(!Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Any(box => box.AcceptsReturn && !box.IsReadOnly) &&
                    Engine(window).Snapshot.Drafts[draft.Key].Text == draft.Text && origin.Paths.Count == 0 && Engine(window).Snapshot.Outbox.Count == 1,
                    "an offline summary guessed a version-zero editor or changed the existing draft");
                await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11");
                await SelectNoteMonthItemAsync(window, item => item.Source == "legacy_daily_note"); await NoteMonthClickAsync(window, "note-history-edit-prepare");
                Check(!Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Any(box => box.AcceptsReturn && !box.IsReadOnly) &&
                    Engine(window).Snapshot.Drafts.Count == untouched.Drafts.Count && origin.WriteCalls == 0,
                    "a legacy monthly summary without a version became a guessed zero-version daily-note write");
                await NoteMonthClickAsync(window, "note-history-open-day");
                var legacyCopy = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                _ = window.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
                {
                    Window? dialog = null;
                    try
                    {
                        dialog = Application.Current.Windows.OfType<Window>().Single(candidate => candidate != window && candidate.IsVisible && candidate.Owner == window);
                        var body = Descendants(dialog).OfType<TextBox>().Single();
                        Check(dialog.Title == "旧版日页 · 只读摘要" && body.IsReadOnly && body.Text.Contains("缺少版本的旧日页摘要", StringComparison.Ordinal) &&
                            body.Text.Contains("不会使用猜测版本0", StringComparison.Ordinal), "the native legacy summary dialog omitted readonly original text or its missing-version fence");
                        legacyCopy.SetResult();
                    }
                    catch (Exception error) { legacyCopy.SetException(error); }
                    finally { if (dialog?.IsVisible == true) dialog.Close(); }
                });
                await ClickAsync(window, "打开旧版日页"); await legacyCopy.Task;
                Check(Field<string>(window, "currentPage") == "工作记录" && !Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Any(box => box.AcceptsReturn && !box.IsReadOnly) &&
                    Engine(window).Snapshot.Drafts.Count == untouched.Drafts.Count && Engine(window).Snapshot.Outbox.Count == 1 && origin.Paths.Count == 0,
                    "the existing daily-page entry bypassed the month summary's missing-version guard or guessed a version-zero legacy save");
                Check((await File.ReadAllBytesAsync(Field<AtomicWorkspaceStore>(window, "store").FilePath)).SequenceEqual(bytes), "readonly failed summary preparation altered encrypted business data");
                await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11"); await ClickAsync(window, "连接并刷新");
                await SelectNoteMonthItemAsync(window, item => item.EntityId == summary["entity_id"]!.GetValue<string>()); await NoteMonthClickAsync(window, "note-history-edit-prepare");
                Check(origin.Paths.Contains(key, StringComparer.Ordinal) && BodyEditor(window).Text == "已有草稿不能被月摘要或较新详情覆盖 🐟" &&
                    Engine(window).Snapshot.Drafts[key].BaseVersion == 4 && JsonTestValue.Integer(SavedAppDraft(Engine(window), key)["original"]?["version"]) == 4 &&
                    Engine(window).Snapshot.Drafts.Keys.Count(value => value == key) == 1 && origin.WriteCalls == 0,
                    "full detail preparation forked the draft key rebased version four onto version seven or overwrote the local text");
                await ClickAsync(window, "碎碎念月历"); await SetNoteMonthAsync(window, "2026-11");
                await SelectNoteMonthItemAsync(window, item => item.EntityId == unknownSource["entity_id"]!.GetValue<string>());
                var inspectedUnknown = false;
                ExerciseOwnedDialog(window, "读取完整记录后编辑", dialog =>
                {
                    var description = string.Join("\n", Descendants(dialog).OfType<TextBlock>().Select(block => block.Text));
                    var options = Descendants(dialog).OfType<Button>().Select(button => button.Content?.ToString()).ToArray();
                    Check(dialog.Title == "同步操作" && description.Contains(unknownKey, StringComparison.Ordinal) && description.Contains("结果未知", StringComparison.Ordinal) &&
                        options.Contains("只读核对保存回执", StringComparer.Ordinal) && options.Contains("查看原请求和响应", StringComparer.Ordinal) &&
                        !options.Contains("取消尚未发送的操作", StringComparer.Ordinal), "the recovered month request did not show its original unknown-result inspector and readonly evidence options");
                    inspectedUnknown = true;
                });
                await window.WaitForIdleAsync();
                var stillUnknown = Engine(window).Snapshot.Outbox.Single();
                Check(inspectedUnknown && stillUnknown.Id == unknown.Id && stillUnknown.BodyJson == unknown.BodyJson && stillUnknown.Status == PendingStatus.Unknown &&
                    stillUnknown.SendAttempts == 1 && stillUnknown.RecoveredAtRevision == recoveryRevision && !stillUnknown.CanEditQueued && origin.WriteCalls == 0,
                    "monthly summary preparation released a restored unknown-result fence or changed its exact attempted request");
                var retryRefused = false;
                try { await Engine(window).RetryUnchangedAsync(unknown.Id, Wrap(FullMonthNote(unknownSource, "2026-11-06", 4))); }
                catch (InvalidOperationException) { retryRefused = true; }
                Check(retryRefused && Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown && origin.WriteCalls == 0,
                    "viewing a monthly summary allowed a recovered request to be requeued from a merely matching current record");
                SaveEvidence(window, "note-month-readonly-detail-same-draft-fence.png");
                await CloseAsync(window); window = await ShowNoteMonthWindowAsync(root, origin);
                Check(Engine(window).Snapshot.Outbox.Single().BodyJson == unknown.BodyJson && Engine(window).Snapshot.Outbox.Single().RecoveredAtRevision == recoveryRevision &&
                    Engine(window).Snapshot.Drafts[key].BaseVersion == 4 && DraftText(Engine(window).Snapshot, key) == "已有草稿不能被月摘要或较新详情覆盖 🐟" && sockets.Connects == 0,
                    "restart after summary preparation lost the original draft or restored unknown operation");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static string MonthPath(string month) => "/api/v1/note-entries/month?month=" + month;
    private static string MonthKey(JsonObject summary) => "/api/v1/note-entries/" + summary["entity_id"]!.GetValue<string>()["note-entry:".Length..];
    private static JsonObject MonthNote(string day, string category, string text, params string[] labels) => Object(
        ("entity_id", "note-entry:" + Guid.NewGuid()), ("source", "note_entry"), ("category", category), ("text", text),
        ("labels", new JsonArray(labels.Select(label => (JsonNode?)JsonValue.Create(label)).ToArray())),
        ("created_at", day + "T00:00:00.000Z"), ("updated_at", day + "T01:00:00.000Z"));
    private static JsonObject MonthLegacy(string day, string category, string text) => Object(("entity_id", "legacy-" + category + ":" + day),
        ("source", "legacy_daily_note"), ("category", category), ("text", text), ("labels", new JsonArray(category == "work" ? "工作" : "生活")),
        ("created_at", null), ("updated_at", day + "T01:00:00.000Z"));
    private static JsonObject FullMonthNote(JsonObject summary, string day, int version)
    {
        var full = (JsonObject)summary.DeepClone(); full.Remove("entity_id"); full.Remove("source");
        full["id"] = MonthKey(summary).Split('/')[4]; full["date"] = day; full["version"] = version; full["can_edit"] = true;
        full["deleted"] = false; full["deleted_at"] = null; full["content_hash"] = new string('e', 64); return full;
    }
    private static string MonthResponse(string month, params (string Date, JsonObject Item)[] items) => Wrap(Object(
        ("format", "haoduoyu-note-month-v1"), ("month", month), ("complete", true), ("labels_version", 3),
        ("days", new JsonArray(items.GroupBy(pair => pair.Date, StringComparer.Ordinal).OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => (JsonNode?)Object(("date", group.Key), ("items", new JsonArray(group.Select(pair => pair.Item.DeepClone()).ToArray())))).ToArray()))));
    private static T NoteMonthControl<T>(MainWindow window, string id) where T : FrameworkElement => Descendants(Field<StackPanel>(window, "page")).OfType<T>()
        .Single(control => AutomationProperties.GetAutomationId(control) == id);
    private static void NoteMonthStartClick(MainWindow window, string id)
    {
        var button = NoteMonthControl<Button>(window, id); Check(button.IsEnabled, "monthly native action disabled: " + id);
        button.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
    }
    private static async Task NoteMonthClickAsync(MainWindow window, string id)
    {
        NoteMonthStartClick(window, id); await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static async Task SetNoteMonthAsync(MainWindow window, string month)
    { NoteMonthControl<TextBox>(window, "note-history-month").Text = month; await NoteMonthClickAsync(window, "note-history-go"); }
    private static IReadOnlyList<NoteHistoryItem> NoteMonthItems(MainWindow window) => NoteMonthControl<ListBox>(window, "note-history-records").Items.Cast<NoteHistoryItem>().ToArray();
    private static Button[] NoteMonthDays(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<Button>()
        .Where(button => AutomationProperties.GetAutomationId(button).StartsWith("note-history-day-", StringComparison.Ordinal)).ToArray();
    private static string NoteMonthTile(MainWindow window, string day)
    {
        var tile = NoteMonthControl<Button>(window, "note-history-day-" + day);
        return string.Join("\n", Descendants(tile).OfType<TextBlock>().Select(block => block.Text).Append(tile.Content as string ?? ""));
    }
    private static string NoteMonthText(MainWindow window) => string.Join("\n", Descendants(Field<StackPanel>(window, "page")).OfType<TextBlock>().Select(block => block.Text)
        .Concat(Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Select(box => box.Text)));
    private static async Task SelectNoteMonthItemAsync(MainWindow window, Func<NoteHistoryItem, bool> predicate)
    {
        var list = NoteMonthControl<ListBox>(window, "note-history-records"); var item = list.Items.Cast<NoteHistoryItem>().Single(predicate);
        list.ScrollIntoView(item); window.UpdateLayout(); list.SelectedItem = item;
        await window.WaitForIdleAsync(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
    }
    private static void AssertMonthRetained(MainWindow window, string path, string json, LocalDraft draft, PendingOperation pending, string reason)
    {
        var state = Engine(window).Snapshot;
        Check(state.Cache[path] == json && state.Drafts[draft.Key].Text == draft.Text && JsonSerializer.Serialize(state.Outbox) == JsonSerializer.Serialize(new[] { pending }),
            reason + " changed the last accepted month, local draft, exact unknown request or recovery fence");
    }
    private static async Task<MainWindow> ShowNoteMonthWindowAsync(string root, NoteMonthOrigin origin)
    {
        Check(Application.Current is SyntheticTestApplication, "shown note history requires the guarded synthetic app host");
        var window = new MainWindow(root, new WorkbenchApi(new NonOwningNoteMonthOrigin(origin))) { Title = "好多鱼 · 纯合成碎碎念月历验收", ShowInTaskbar = false };
        Application.Current.MainWindow = window; window.Show();
        await UntilAsync(() => window.IsLoaded && Field<SyncEngine?>(window, "engine") != null, "synthetic month window did not initialize");
        await window.WaitForIdleAsync(); window.UpdateLayout(); await Dispatcher.Yield(DispatcherPriority.ApplicationIdle); window.UpdateLayout();
        Check(window.IsVisible && new WindowInteropHelper(window).Handle != IntPtr.Zero && ((SyntheticTestApplication)Application.Current).GuardedStartupCalls == 1 &&
            Path.GetFullPath(Field<string>(window, "root")) == Path.GetFullPath(root), "month test escaped guarded startup the private root or an actual shown native window");
        return window;
    }
    private sealed class NonOwningNoteMonthOrigin(NoteMonthOrigin origin) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => origin.ReplyAsync(request, cancellationToken);
    }
    private sealed class NoteMonthOrigin : HttpMessageHandler
    {
        internal string Scope { get; private set; } = new('d', 64);
        internal string MonthJson { get; set; } = MonthResponse("2026-11");
        internal HttpStatusCode MonthStatus { get; set; } = HttpStatusCode.OK;
        internal TaskCompletionSource<bool>? HoldMonth { get; set; }
        internal bool ChangeScopeAfterMonth { get; set; }
        internal Dictionary<string, string> Responses { get; } = new(StringComparer.Ordinal);
        internal List<string> Paths { get; } = [];
        internal int WriteCalls { get; private set; }
        internal int MonthCalls { get; private set; }
        internal int ScopeCalls { get; private set; }
        internal int NoteHeaders { get; private set; }
        internal int CancelledMonth { get; private set; }
        internal async Task<HttpResponseMessage> ReplyAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Check(request.RequestUri?.Scheme == "https" && request.RequestUri.Host == "haoduoyu.xyz", "monthly history transport escaped its fixed HTTPS origin");
            var path = request.RequestUri!.PathAndQuery; Paths.Add(path);
            if (request.Method != HttpMethod.Get) WriteCalls++;
            Check(request.Method == HttpMethod.Get, "readonly month history attempted a business write");
            if (path.StartsWith("/api/v1/note-", StringComparison.Ordinal))
            {
                Check(request.Headers.TryGetValues("X-Note-Labels-Version", out var labels) && labels.SequenceEqual(new[] { "3" }), "month or detail read omitted its labels v3 contract");
                NoteHeaders++;
            }
            string json; var status = HttpStatusCode.OK;
            if (path == "/api/v1/workbench-snapshot/index?version=2")
            {
                ScopeCalls++;
                json = Wrap(Object(("snapshot_format", "haoduoyu-workbench-snapshot-v2"), ("projection", "current"), ("complete", true), ("scope_id", Scope),
                    ("timezone", "Asia/Shanghai"), ("generated_at", "2026-11-04T20:00:00.000Z"), ("manifest_hash", new string('a', 64)),
                    ("global_content_hash", new string('b', 64)), ("index_hash", new string('a', 64)), ("entities", new JsonArray()), ("dates", new JsonArray())));
            }
            else if (path == MonthPath("2026-11"))
            {
                MonthCalls++;
                if (HoldMonth != null)
                    try { await HoldMonth.Task.WaitAsync(cancellationToken); }
                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { CancelledMonth++; throw; }
                json = MonthJson; status = MonthStatus;
                if (ChangeScopeAfterMonth) { Scope = new string('f', 64); ChangeScopeAfterMonth = false; }
            }
            else if (path is "/api/v1/review/articles?offset=0" or "/api/v1/review/articles?offset=0&read_revision=7")
                json = Wrap(Object(("items", new JsonArray()), ("has_more", false), ("read_revision", 7)));
            else json = Responses.GetValueOrDefault(path) ?? throw new InvalidOperationException("Unexpected synthetic note-month path: " + path);
            return new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => ReplyAsync(request, cancellationToken);
    }
}
