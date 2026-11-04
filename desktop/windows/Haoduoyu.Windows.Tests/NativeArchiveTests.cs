using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ArchiveCases =>
    [
        ("Shown encrypted history archive survives reopen with exact read-only originals and preserves drafts pending work and other profiles", () => RunWithDispatcher(PrivateHistoryArchiveAsync))
    ];

    private static async Task PrivateHistoryArchiveAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var publicScope = new string('a', 64); var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            const string firstUser = "10000000-0000-4000-8000-000000000301", secondUser = "10000000-0000-4000-8000-000000000302";
            var firstIdentity = "user:" + firstUser + ":" + firstScope; var secondIdentity = "user:" + secondUser + ":" + secondScope;
            var resource = "/api/v1/note-entries/" + Guid.NewGuid().ToString();
            var ids = Enumerable.Range(0, 3).Select(_ => Guid.NewGuid().ToString()).ToArray();
            var oldBodies = new[] { "甲已取消的中文旧历史一 🐟", "甲已取消的中文旧历史二", "甲最新历史必须保留" };
            var history = ids.Select((id, index) => new PendingOperation { Id = id, Path = resource, ResourceKey = resource,
                Method = "PUT", Status = PendingStatus.Superseded, SupersededById = index < 2 ? ids[index + 1] : null,
                Error = "合成用户明确替换或取消，原文保留", BodyJson = Object(("version", 0), ("category", "life"), ("date", Day), ("save_id", id), ("text", oldBodies[index])).ToJsonString() }).ToArray();
            var unknownId = Guid.NewGuid().ToString(); var unknownResource = "/api/v1/note-entries/" + Guid.NewGuid().ToString();
            var unknown = new PendingOperation { Id = unknownId, Path = unknownResource, ResourceKey = unknownResource,
                Status = PendingStatus.Unknown, SendAttempts = 1, Error = "结果未确认，归档不能移除",
                BodyJson = Object(("version", 0), ("category", "life"), ("date", Day), ("save_id", unknownId), ("text", "甲未决请求正文必须保留")).ToJsonString(),
                RemoteJson = Wrap(Object(("id", unknownResource.Split('/').Last()), ("version", 1), ("text", "甲未确认的远端证据"))) };
            var confirmedResource = "/api/v1/note-entries/" + Guid.NewGuid().ToString(); var confirmedId = Guid.NewGuid().ToString();
            var confirmed = new PendingOperation { Id = confirmedId, Path = confirmedResource, ResourceKey = confirmedResource,
                Status = PendingStatus.Confirmed, SendAttempts = 1, ConfirmedRevision = 1,
                BodyJson = Object(("version", 0), ("text", "甲已确认请求证据必须保留"), ("save_id", confirmedId)).ToJsonString(),
                RemoteJson = Wrap(Object(("id", confirmedResource.Split('/').Last()), ("version", 1), ("text", "甲已确认远端证据必须保留"))) };
            var draftKey = "/api/v1/note-entries/" + Guid.NewGuid().ToString();
            var draftOriginal = Object(("id", draftKey.Split('/').Last()), ("version", 2), ("category", "life"), ("date", Day), ("text", "甲草稿基线"));
            var draftValues = (JsonObject)draftOriginal.DeepClone(); draftValues["text"] = "甲草稿中文续编不可改写";
            var draft = AppDraft("note", draftKey, draftOriginal, draftValues);
            var cachedPath = "/api/v1/todos?date=" + Day;
            var cachedJson = Wrap(Object(("date", Day), ("today", Day), ("completed_mode", "strike"), ("preferences_version", 0), ("items", new JsonArray())));
            string firstPath;
            using (var first = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), firstIdentity, new WindowsProtector()))
            {
                var state = new WorkspaceState { ScopeId = first.ScopeId, LocalRevision = 1, Outbox = [.. history, unknown, confirmed] };
                state.Drafts[draftKey] = draft; state.Cache[cachedPath] = cachedJson; state.CacheRevisions[cachedPath] = 1;
                await first.SaveAsync(state); firstPath = first.FilePath;
            }
            await SeedDraftAsync(root, secondIdentity, draftKey, "乙私有草稿不可改写", draftOriginal);
            string secondPath;
            using (var second = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), secondIdentity, new WindowsProtector())) secondPath = second.FilePath;
            var secondBytes = await File.ReadAllBytesAsync(secondPath);
            RememberProfiles(root, publicScope, firstUser, firstScope, secondUser, secondScope, firstIdentity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "历史档案"); await ClickAsync(window, "预览可归档历史");
                var plan = Engine(window).CreateHistoryArchivePlan();
                Check(plan.CandidateIds.SequenceEqual(ids.Take(2)) && VisibleText(window).Contains("本轮可归档 2 条", StringComparison.Ordinal),
                    "shown archive preview did not explain the two obsolete unsent originals selected for this batch");
                Check(Engine(window).Snapshot.Schema == 1 && Engine(window).Snapshot.Outbox.Count == 5,
                    "previewing history mutated the workspace before confirmation");
                // The real button asks for confirmation; invoke its exact post-confirmation body on this synthetic owner.
                await InvokeAsync(window, "ArchiveHistoryConfirmedAsync", plan);
                var archived = Engine(window).Snapshot; var reference = archived.HistoryArchives.Single();
                Check(archived.Schema == 2 && reference.Count == 2 && ids.Take(2).All(id => archived.ArchivedOperationIds.GetValueOrDefault(id) == reference.Id),
                    "archive commit did not atomically retain its IDs behind the format barrier for old clients");
                Check(archived.Outbox.Select(operation => operation.Id).SequenceEqual(new[] { ids[2], unknownId, confirmedId }) &&
                    JsonSerializer.Serialize(archived.Outbox.Single(operation => operation.Id == unknownId)) == JsonSerializer.Serialize(unknown) &&
                    JsonSerializer.Serialize(archived.Outbox.Single(operation => operation.Id == confirmedId)) == JsonSerializer.Serialize(confirmed),
                    "archive removed the newest history, changed pending work, or altered confirmed request evidence");
                Check(archived.Drafts[draftKey].Text == draft.Text && archived.Cache[cachedPath] == cachedJson,
                    "archive changed the current local draft or cache");
                Check(File.Exists(Path.Combine(Path.GetDirectoryName(firstPath)!, "history", reference.FileName)) &&
                    Field<WindowsProtector>(window, "protector") is not null,
                    "archive did not write a real current-user encrypted file within its own identity directory");
                await CloseAsync(window);
                window = await ShowAsync(root, handler);
                Check(Engine(window).Snapshot.Schema == 2 && Engine(window).Snapshot.HistoryArchives.Single().Id == reference.Id &&
                    Engine(window).Snapshot.ArchivedOperationIds.Count == 2 && Engine(window).Snapshot.Outbox.Single(operation => operation.Id == unknownId).Status == PendingStatus.Unknown,
                    "native reopen lost archive references, its protected IDs or the pending result fence");
                await ClickAsync(window, "历史档案"); await SelectListItemAsync(window, reference.Id[..8]);
                Check(VisibleText(window).Contains("此页只读", StringComparison.Ordinal), "opened encrypted archive did not identify itself as read-only evidence");
                await ReadArchivedDialogAsync(window, oldBodies[0], history[0].BodyJson);
                await ClickAsync(window, "返回历史档案");
                Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single(box => !box.IsReadOnly).Text = reference.Id.ToUpperInvariant();
                await ClickAsync(window, "按档案 ID 只读核验");
                Check(VisibleText(window).Contains("此页只读", StringComparison.Ordinal), "the actual ID verification button did not open the current owner's canonicalized archive");
                await ReadArchivedDialogAsync(window, oldBodies[1], history[1].BodyJson);
                Check(Engine(window).Snapshot.Outbox.Count == 3 && Engine(window).Snapshot.Drafts[draftKey].Text == draft.Text,
                    "opening a historical original imported executable work or modified its separate current draft");
                SaveEvidence(window, "archive-readonly-after-reopen.png");
                await InvokeAsync(window, "OpenOfflineProfileAsync", secondIdentity);
                await ClickAsync(window, "历史档案");
                Check(Engine(window).Snapshot.HistoryArchives.Count == 0 && !VisibleText(window).Contains(reference.Id[..8], StringComparison.Ordinal) &&
                    !VisibleText(window).Contains(oldBodies[0], StringComparison.Ordinal), "another private profile discovered or displayed A's archive");
                Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single(box => !box.IsReadOnly).Text = reference.Id;
                await ClickAsync(window, "按档案 ID 只读核验");
                Check(Field<TextBlock>(window, "heading").Text == "历史档案" && Field<TextBlock>(window, "status").Text.StartsWith("操作未完成", StringComparison.Ordinal) &&
                    !VisibleText(window).Contains("此页只读", StringComparison.Ordinal) && !VisibleText(window).Contains(oldBodies[0], StringComparison.Ordinal) &&
                    !VisibleText(window).Contains(oldBodies[1], StringComparison.Ordinal), "entering A's archive ID while in B displayed foreign evidence or failed to reject the scoped read");
                Check((await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondBytes) && DraftText(Engine(window).Snapshot, draftKey) == "乙私有草稿不可改写",
                    "archiving or reading A changed B's private workspace or same-key draft");
                Check(handler.Calls == 0 && sockets.Connects == 0, "local history preview commit or reading issued HTTP or opened a real socket");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ReadArchivedDialogAsync(MainWindow owner, string title, string exactBody)
    {
        var finished = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = owner.Dispatcher.BeginInvoke(DispatcherPriority.Background, () =>
        {
            Window? dialog = null;
            try
            {
                dialog = Application.Current.Windows.OfType<Window>().Single(window => window != owner && window.IsVisible && window.Owner == owner);
                var text = Descendants(dialog).OfType<TextBox>().Single();
                Check(text.IsReadOnly && text.Text.Contains(exactBody, StringComparison.Ordinal), "reopened encrypted archive did not preserve the exact original request in its real read-only dialog");
                finished.SetResult();
            }
            catch (Exception error) { finished.SetException(error); }
            finally { if (dialog?.IsVisible == true) dialog.Close(); }
        });
        await SelectListItemAsync(owner, title);
        await finished.Task;
    }
}
