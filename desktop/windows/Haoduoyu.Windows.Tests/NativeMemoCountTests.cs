using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows.Controls;
using Haoduoyu.Core;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> MemoCountCases =>
    [
        ("Shown native memo groups distinguish queued and cancelled local child counts from the unchanged server count", () => RunWithDispatcher(NativeMemoCountSourcesAsync)),
        ("Shown native group with missing server count refuses deletion before confirmation without inventing zero", () => RunWithDispatcher(NativeMemoMissingCountAsync))
    ];

    private static async Task NativeMemoCountSourcesAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                var groupId = Guid.NewGuid().ToString(); var oldId = Guid.NewGuid().ToString(); var addedId = Guid.NewGuid().ToString();
                await Engine(window).CacheAsync("/api/v1/memos", Wrap(Object(
                    ("groups", new JsonArray(Object(("id", groupId), ("title", "数量来源合成分组"), ("position", 0), ("version", 3), ("deleted_at", null), ("active_note_count", 1)))),
                    ("notes", new JsonArray(Object(("id", oldId), ("group_id", groupId), ("title", "已有笔记"), ("position", 0), ("version", 2), ("deleted_at", null)))))));
                var operation = new PendingOperation { ResourceKey = "/api/v1/memos/notes/" + addedId, Path = "/api/v1/memos/notes/" + addedId,
                    BodyJson = Object(("group_id", groupId), ("title", "本机待同步笔记"), ("body", "未确认原文"), ("position", 0), ("version", 0), ("save_id", Guid.NewGuid().ToString())).ToJsonString() };
                await Engine(window).QueueAsync(operation);
                var before = JsonSerializer.Serialize(Engine(window).Snapshot);
                await ClickAsync(window, "备忘录");
                var visible = VisibleText(window);
                Check(visible.Contains("本机已知活动数 2 篇", StringComparison.Ordinal) && visible.Contains("服务端副本活动数 1 篇", StringComparison.Ordinal),
                    "memo list displayed a stale server count as the current local projection");
                await SelectListItemAsync(window, "数量来源合成分组");
                visible = VisibleText(window);
                Check(visible.Contains("本机已知活动数 2 篇", StringComparison.Ordinal) && visible.Contains("服务端副本活动数 1 篇", StringComparison.Ordinal) && visible.Contains("本机待同步笔记", StringComparison.Ordinal),
                    "memo group detail lost count provenance or hid the pending child");
                Check(JsonSerializer.Serialize(Engine(window).Snapshot) == before, "count rendering changed the server baseline original queue or cache");
                SaveEvidence(window, "memo-count-local-versus-server.png");
                var snapshot = Engine(window).Snapshot;
                var projected = JsonNode.Parse(WorkspaceProjection.Project("/api/v1/memos", snapshot.Cache["/api/v1/memos"], snapshot)!)!["data"]!["groups"]![0]!.AsObject();
                // Exercise the same action reached after the Win32 confirmation is accepted.
                // This synthetic workflow does not automate that confirmation dialog.
                await InvokeAsync(window, "DeleteMemoGroupConfirmedAsync", projected);
                var deletion = Engine(window).Snapshot.Outbox.Single(item => item.Method == "DELETE");
                Check(JsonTestValue.Integer(JsonNode.Parse(deletion.BodyJson)?["confirm_note_count"]) == 1 &&
                    JsonTestValue.Integer(JsonNode.Parse(deletion.BodyJson)?["version"]) == 3 &&
                    Engine(window).Snapshot.Outbox.Single(item => item.Id == operation.Id).BodyJson == operation.BodyJson,
                    "confirmed delete used the local projected child count guessed a version or changed the child request");
                await Engine(window).CancelQueuedAsync(deletion.Id);
                await Engine(window).CancelQueuedAsync(operation.Id);
                await ClickAsync(window, "备忘录");
                visible = VisibleText(window);
                Check(visible.Contains("本机已知活动数 1 篇", StringComparison.Ordinal) && visible.Contains("服务端副本活动数 1 篇", StringComparison.Ordinal),
                    "cancelling an unsent child failed to recompute local counts or rewrote the server count");
                Check(Engine(window).Snapshot.Outbox.All(item => item.Status == PendingStatus.Superseded) && handler.Calls == 0 && sockets.Connects == 0,
                    "count rendering or local cancellation sent a request or discarded operation history");
                var newGroup = Guid.NewGuid().ToString(); var newNote = Guid.NewGuid().ToString();
                var parentId = Guid.NewGuid().ToString(); var childId = Guid.NewGuid().ToString();
                var parent = new PendingOperation { Id = parentId, ResourceKey = "/api/v1/memos/groups/" + newGroup, Path = "/api/v1/memos/groups/" + newGroup,
                    BodyJson = Object(("title", "仅本机新分组"), ("position", 0), ("version", 0), ("save_id", parentId)).ToJsonString() };
                var child = WithDependencies(new PendingOperation { Id = childId, ResourceKey = "/api/v1/memos/notes/" + newNote, Path = "/api/v1/memos/notes/" + newNote,
                    BodyJson = Object(("group_id", newGroup), ("title", "取消父组仍保留的子稿"), ("body", "原文 🐟 不得丢失"), ("position", 0), ("version", 0), ("save_id", childId)).ToJsonString() }, parent.Id);
                var childDraft = AppDraft("memo", child.ResourceKey, Object(("id", newNote), ("group_id", newGroup), ("version", 0)), JsonNode.Parse(child.BodyJson)!.AsObject());
                await Engine(window).SaveDraftAsync(childDraft);
                await Engine(window).QueueAsync(parent); await Engine(window).QueueAsync(child);
                await ClickAsync(window, "备忘录");
                snapshot = Engine(window).Snapshot;
                projected = JsonNode.Parse(WorkspaceProjection.Project("/api/v1/memos", snapshot.Cache["/api/v1/memos"], snapshot)!)!["data"]!["groups"]!.AsArray()
                    .OfType<JsonObject>().Single(item => item["id"]?.GetValue<string>() == newGroup);
                await InvokeAsync(window, "DeleteMemoGroupConfirmedAsync", projected);
                snapshot = Engine(window).Snapshot;
                Check(snapshot.Outbox.Single(item => item.Id == parent.Id).Status == PendingStatus.Superseded &&
                    snapshot.Outbox.Single(item => item.Id == child.Id).Status == PendingStatus.Queued &&
                    snapshot.Outbox.Single(item => item.Id == child.Id).BodyJson == child.BodyJson && snapshot.Drafts[child.ResourceKey].Text == childDraft.Text &&
                    !snapshot.Outbox.Any(item => item.Method == "DELETE" && item.Path == parent.Path) && handler.Calls == 0 && sockets.Connects == 0,
                    "cancelling a local new group required a guessed server count deleted its child draft or queued a remote delete");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task NativeMemoMissingCountAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                var groupId = Guid.NewGuid().ToString();
                // A legacy/incomplete local copy is not upgraded to a server-verified zero.
                await Engine(window).CacheAsync("/api/v1/memos", Wrap(Object(
                    ("groups", new JsonArray(Object(("id", groupId), ("title", "缺少服务端计数的合成分组"), ("position", 0), ("version", 3), ("deleted_at", null)))),
                    ("notes", new JsonArray()))));
                await ClickAsync(window, "备忘录");
                Check(VisibleText(window).Contains("服务端副本活动数 未取得", StringComparison.Ordinal), "missing server count was presented as zero");
                await SelectListItemAsync(window, "缺少服务端计数的合成分组");
                var noteId = Guid.NewGuid().ToString(); var draftKey = "/api/v1/memos/notes/" + noteId;
                await Engine(window).SaveDraftAsync(AppDraft("memo", draftKey, Object(("id", noteId), ("group_id", groupId), ("version", 0)),
                    Object(("title", "计数缺失仍保留的未完成稿"), ("body", "  中文原稿 🐟\n第二行。  "))));
                var before = JsonSerializer.Serialize(Engine(window).Snapshot);
                await ClickAsync(window, "软删除分组");
                Check(Field<TextBlock>(window, "status").Text.Contains("缺少可核实的服务端活动笔记数", StringComparison.Ordinal),
                    "missing-count delete did not fail before its Win32 confirmation");
                Check(JsonSerializer.Serialize(Engine(window).Snapshot) == before && Engine(window).Snapshot.Outbox.Count == 0 && handler.Calls == 0 && sockets.Connects == 0,
                    "missing server count created a destructive request or changed workspace state");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }
}
