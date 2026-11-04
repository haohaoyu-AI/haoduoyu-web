using System.Text.Json.Nodes;
using System.Windows.Controls;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> SearchCases =>
    [
        ("Shown local search labels cache draft and unknown evidence, continues the same draft and resets across private profiles", () => RunWithDispatcher(PrivateLocalSearchAsync))
    ];

    private static async Task PrivateLocalSearchAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var publicScope = new string('a', 64); var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            const string firstUser = "10000000-0000-4000-8000-000000000201", secondUser = "10000000-0000-4000-8000-000000000202";
            var firstIdentity = "user:" + firstUser + ":" + firstScope; var secondIdentity = "user:" + secondUser + ":" + secondScope;
            const string query = "共同检索词";
            var draftId = Guid.NewGuid().ToString(); var draftKey = "/api/v1/note-entries/" + draftId;
            var original = Object(("id", draftId), ("version", 0), ("category", "life"), ("date", Day), ("text", ""));
            var operationId = Guid.NewGuid().ToString(); var operationRecord = Guid.NewGuid().ToString();
            var originalRequest = Object(("version", 0), ("category", "life"), ("date", Day), ("save_id", operationId), ("text", query + " 甲原请求材料")).ToJsonString();
            var remoteEvidence = Wrap(Object(("id", operationRecord), ("version", 1), ("category", "life"), ("date", Day), ("text", query + " 甲远端响应材料")));
            using (var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), firstIdentity, new WindowsProtector()))
            {
                var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
                var cached = Object(("id", Guid.NewGuid().ToString()), ("version", 3), ("category", "life"), ("date", Day), ("text", query + " 甲缓存资料"),
                    ("labels", new JsonArray("生活")), ("can_edit", true), ("deleted", false), ("deleted_at", null), ("content_hash", new string('d', 64)));
                var path = "/api/v1/note-entries?category=life&date=" + Day;
                state.Cache[path] = Wrap(Object(("category", "life"), ("date", Day), ("can_edit", true), ("labels_version", 3), ("entries", new JsonArray(cached))));
                state.CacheRevisions[path] = 1;
                var values = (JsonObject)original.DeepClone(); values["text"] = query + " 甲草稿正文";
                state.Drafts[draftKey] = AppDraft("note", draftKey, original, values) with { Title = query + " 甲本机草稿" };
                state.Outbox.Add(new PendingOperation { Id = operationId, ResourceKey = "/api/v1/note-entries/" + operationRecord,
                    Path = "/api/v1/note-entries/" + operationRecord, Method = "PUT", BodyJson = originalRequest,
                    Status = PendingStatus.Unknown, SendAttempts = 1, RemoteJson = remoteEvidence, Error = "合成未确认保存，不代表成功" });
                await store.SaveAsync(state);
            }
            await SeedDraftAsync(root, secondIdentity, draftKey, query + " 乙私有独有资料", original);
            RememberProfiles(root, publicScope, firstUser, firstScope, secondUser, secondScope, firstIdentity);
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "本机检索");
                SearchInput(window).Text = query; await ClickAsync(window, "检索本机资料");
                var rows = SearchRows(window);
                Check(rows.Length == 4 && new[] { "已保存缓存", "本机草稿", "原请求历史", "远端响应证据" }.All(origin => rows.Any(row => row.Subtitle.Contains(origin, StringComparison.Ordinal))),
                    "native search did not separately label its cached draft original-request and remote-evidence sources");
                Check(!VisibleText(window).Contains("乙私有独有资料", StringComparison.Ordinal) && rows.All(row => !row.Subtitle.Contains("乙私有独有资料", StringComparison.Ordinal)),
                    "search in private A exposed private B's matching local content");
                await SelectListItemAsync(window, "甲远端响应材料");
                var preview = Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single();
                Check(preview.IsReadOnly && preview.Text.Contains("甲远端响应材料", StringComparison.Ordinal) && VisibleText(window).Contains("远端响应证据 · 结果未知", StringComparison.Ordinal),
                    "search presented unknown remote evidence as an editable or confirmed server record");
                Check(Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown && Engine(window).Snapshot.Outbox.Single().BodyJson == originalRequest &&
                    Engine(window).Snapshot.Outbox.Single().RemoteJson == remoteEvidence,
                    "opening a search evidence preview altered or confirmed the original pending request");
                await ClickAsync(window, "返回检索结果"); await SelectListItemAsync(window, "甲本机草稿");
                Check(Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single() is { IsReadOnly: true } draftPreview && draftPreview.Text.Contains("甲草稿正文", StringComparison.Ordinal),
                    "the draft search hit did not first open a read-only source preview");
                await ClickAsync(window, "继续此本机草稿");
                Check(BodyEditor(window).Text == query + " 甲草稿正文" && Engine(window).Snapshot.Drafts.Keys.SequenceEqual(new[] { draftKey }),
                    "continuing a search hit created a different draft key or lost the original current values");
                var continued = query + " 甲从检索继续写中文 🐟";
                BodyEditor(window).Text = continued; await ClickAsync(window, "保存本机草稿");
                Check(DraftText(Engine(window).Snapshot, draftKey) == continued && Engine(window).Snapshot.Drafts.Count == 1,
                    "editing a search result did not preserve the original local draft identity");
                await ClickAsync(window, "本机检索");
                Check(SearchInput(window).Text == query, "returning to search in the same owner unexpectedly discarded its query");
                await InvokeAsync(window, "OpenOfflineProfileAsync", secondIdentity);
                await ClickAsync(window, "本机检索");
                Check(Field<string>(window, "currentIdentity") == secondIdentity && SearchInput(window).Text.Length == 0 &&
                    !Descendants(Field<StackPanel>(window, "page")).OfType<ListBox>().Any(),
                    "switching private profiles retained the previous owner's query or rendered search hits");
                SearchInput(window).Text = query; await ClickAsync(window, "检索本机资料");
                var secondRows = SearchRows(window);
                Check(secondRows.Length == 1 && secondRows[0].Subtitle.Contains("乙私有独有资料", StringComparison.Ordinal) &&
                    !VisibleText(window).Contains("甲缓存资料", StringComparison.Ordinal) && !VisibleText(window).Contains("甲从检索", StringComparison.Ordinal),
                    "searching private B returned A's cached evidence or continued draft");
                using (var firstStore = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), firstIdentity, new WindowsProtector()))
                    Check(DraftText(await firstStore.LoadAsync(), draftKey) == continued, "switching to B lost A's saved continuation");
                Check(handler.Calls == 0 && sockets.Connects == 0, "local search, preview or continuation issued HTTP or opened a real socket");
                SaveEvidence(window, "local-search-private-isolation.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static TextBox SearchInput(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<TextBox>().Single(box => !box.IsReadOnly);
    private static WorkspaceListItem[] SearchRows(MainWindow window) => Descendants(Field<StackPanel>(window, "page")).OfType<ListBox>().Single().Items.Cast<WorkspaceListItem>().ToArray();
}
