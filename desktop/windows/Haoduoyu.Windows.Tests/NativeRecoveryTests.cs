using System.IO;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Windows.Controls;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> RecoveryCases =>
    [
        ("Shown private profile and workspace backup recovery keeps partitions isolated and fences old creation drafts", () => RunWithDispatcher(PrivateBackupRecoveryAsync))
    ];

    private static async Task PrivateBackupRecoveryAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var publicScope = new string('a', 64); var firstScope = new string('b', 64); var secondScope = new string('c', 64);
            const string firstUser = "10000000-0000-4000-8000-000000000101", secondUser = "10000000-0000-4000-8000-000000000102";
            var firstIdentity = "user:" + firstUser + ":" + firstScope; var secondIdentity = "user:" + secondUser + ":" + secondScope;
            var noteId = Guid.NewGuid().ToString(); var noteKey = "/api/v1/note-entries/" + noteId;
            var articleId = Guid.NewGuid().ToString(); var articleKey = "/api/v1/articles/new:" + articleId;
            var note = Object(("id", noteId), ("version", 2), ("category", "life"), ("date", Day), ("text", "原始合成笔记"));
            var article = Object(("id", articleId), ("version", 0), ("title", "恢复前的合成文章创建稿"),
                ("account_id", "10000000-0000-4000-8000-000000000103"), ("status", "drafting"), ("production_mode", "unknown"));
            var firstOperation = Guid.NewGuid().ToString(); var secondOperation = Guid.NewGuid().ToString();
            var firstPath = await SeedRecoveryPartitionAsync(root, firstIdentity, noteKey, note, "甲分区独有的中文恢复稿", firstOperation, articleKey, article);
            var secondPath = await SeedRecoveryPartitionAsync(root, secondIdentity, noteKey, note, "乙分区独有的中文恢复稿", secondOperation);
            var firstPrimary = await File.ReadAllBytesAsync(firstPath); var firstBackup = await File.ReadAllBytesAsync(firstPath + ".bak");
            var secondPrimary = await File.ReadAllBytesAsync(secondPath);
            // Both profiles are known in both settings snapshots; only the selected private owner changes.
            RememberProfiles(root, publicScope, firstUser, firstScope, secondUser, secondScope, firstIdentity);
            RememberProfiles(root, publicScope, firstUser, firstScope, secondUser, secondScope, secondIdentity);
            var settingsPrimary = await File.ReadAllBytesAsync(Path.Combine(root, "settings.bin"));
            var window = await ShowAsync(root, handler);
            try
            {
                Check(Field<string>(window, "currentIdentity") == secondIdentity && DraftText(Engine(window).Snapshot, noteKey) == "乙分区独有的中文恢复稿",
                    "synthetic recovery fixture did not start in the selected private B partition");
                await ClickAsync(window, "本机恢复");
                var api = Field<WorkbenchApi>(window, "api"); api.BindScope(secondScope);
                typeof(MainWindow).GetField("connected", Private)!.SetValue(window, true);
                // Invoke the same post-confirmation body used by the real recovery button; do not automate a native MessageBox.
                await InvokeAsync(window, "RestoreSettingsBackupAsync");
                Check(Field<string>(window, "currentIdentity") == firstIdentity && DraftText(Engine(window).Snapshot, noteKey) == "甲分区独有的中文恢复稿",
                    "restoring settings selected another owner or crossed private drafts with the same resource key");
                Check(api.PublicMode && api.UserId == null && api.ExpectedScopeId == null && !Field<bool>(window, "connected"),
                    "restoring a private profile kept a previous service binding or permission to send");
                Check((await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondPrimary), "settings recovery rewrote the other private business partition");
                Check(Directory.GetFiles(root, "settings.bin.damaged-*").Any(path => File.ReadAllBytes(path).SequenceEqual(settingsPrimary)),
                    "settings recovery did not preserve the exact replaced configuration");
                await ClickAsync(window, "本机恢复");
                await InvokeAsync(window, "RestoreWorkspaceBackupAsync");
                var restored = Engine(window).Snapshot; var recoveredRevision = restored.BackupRecoveryRevision;
                Check(Field<string>(window, "currentIdentity") == firstIdentity && recoveredRevision > 0 && restored.BackupRecoveredAt != null,
                    "workspace recovery did not keep its owner and durable recovery provenance");
                var oldOperation = restored.Outbox.Single();
                Check(oldOperation.Id == firstOperation && oldOperation.Status == PendingStatus.Unknown && !oldOperation.CanEditQueued && oldOperation.SendAttempts == 0,
                    "a backup's old queued request became eligible to send or fabricated a send attempt");
                Check(restored.Drafts[noteKey].RecoveredAtRevision == recoveredRevision && restored.Drafts[articleKey].RecoveredAtRevision == recoveredRevision,
                    "restored drafts were not durably tied to the recovery revision");
                Check((await File.ReadAllBytesAsync(firstPath + ".bak")).SequenceEqual(firstBackup) &&
                    Directory.GetFiles(Path.GetDirectoryName(firstPath)!, "workspace.bin.damaged-*").Any(path => File.ReadAllBytes(path).SequenceEqual(firstPrimary)),
                    "workspace recovery changed its source backup or failed to preserve the exact newer primary");
                await InvokeAsync(window, "EditAsync", "article", article, articleKey);
                Check(Engine(window).Snapshot.Drafts[articleKey].RecoveredAtRevision == recoveredRevision,
                    "opening the recovered article editor erased the recovery fence during its initial automatic draft save");
                await AssertRecoveredArticleCannotQueueAsync(window, articleKey);
                Check(Engine(window).Snapshot.Outbox.Count == 1 && Engine(window).Snapshot.Outbox.Single().Id == firstOperation,
                    "a recovered article creation draft with no reliable newer outbox queued a fresh server-assigned article ID");
                await InvokeAsync(window, "EditAsync", "note", note, noteKey);
                const string continued = "甲分区恢复后继续写中文，乙分区必须仍完整。";
                BodyEditor(window).Text = continued;
                await CloseAsync(window);
                window = await ShowAsync(root, handler);
                Check(Field<string>(window, "currentIdentity") == firstIdentity && DraftText(Engine(window).Snapshot, noteKey) == continued,
                    "recovery followed by native close/reopen lost A's latest input or selected B");
                Check(Engine(window).Snapshot.Drafts[articleKey].RecoveredAtRevision == recoveredRevision && Engine(window).Snapshot.Drafts[noteKey].RecoveredAtRevision == recoveredRevision,
                    "later editing or restart washed recovery provenance out of an existing draft key");
                await InvokeAsync(window, "EditAsync", "article", article, articleKey);
                await AssertRecoveredArticleCannotQueueAsync(window, articleKey);
                Check(Engine(window).Snapshot.Outbox.Count == 1 && Engine(window).Snapshot.Outbox.Single().Status == PendingStatus.Unknown,
                    "restarting a recovered editor removed its creation fence or replayed the old backup queue");
                Check((await File.ReadAllBytesAsync(secondPath)).SequenceEqual(secondPrimary), "continuing work in restored A changed B's private file");
                Check(handler.Calls == 0 && sockets.Connects == 0, "private settings or workspace recovery contacted a service or opened a real socket");
                SaveEvidence(window, "private-backup-recovery-fenced-article.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task AssertRecoveredArticleCannotQueueAsync(MainWindow window, string key)
    {
        var creation = Descendants(Field<StackPanel>(window, "page")).OfType<Button>().Single(button => button.Content?.ToString() == "恢复稿创建待核对");
        Check(!creation.IsEnabled && VisibleText(window).Contains("回退备份", StringComparison.Ordinal),
            "the actual recovered article editor did not disable creation and explain its backup provenance");
        var saved = SavedAppDraft(Engine(window), key);
        var command = PrepareAppSave("article", saved["original"]!.AsObject(), saved["values"]!.AsObject());
        var rejected = false;
        try { await InvokeAsync(window, "QueueAsync", command.Method, command.Path, command.Body, key); }
        catch (InvalidOperationException error) when (error.Message.Contains("备份", StringComparison.Ordinal)) { rejected = true; }
        Check(rejected, "calling the actual native queue path bypassed the recovered article creation fence");
    }

    private static async Task<string> SeedRecoveryPartitionAsync(string root, string identity, string noteKey, JsonObject original,
        string text, string operationId, string? articleKey = null, JsonObject? article = null)
    {
        using var store = new AtomicWorkspaceStore(root, WorkbenchApi.ServiceOrigin.ToString(), identity, new WindowsProtector());
        var value = (JsonObject)original.DeepClone(); value["text"] = text;
        var payload = Object(("kind", "note"), ("key", noteKey), ("original", original.DeepClone()), ("values", value));
        var state = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 1 };
        state.Drafts[noteKey] = new LocalDraft { Key = noteKey, Text = payload.ToJsonString(), Title = text, BaseVersion = 2 };
        if (articleKey != null && article != null)
            state.Drafts[articleKey] = new LocalDraft { Key = articleKey, Title = article["title"]!.ToString(),
                Text = Object(("kind", "article"), ("key", articleKey), ("original", article.DeepClone()), ("values", article.DeepClone())).ToJsonString() };
        state.Outbox.Add(new PendingOperation { Id = operationId, ResourceKey = noteKey, Method = "PUT", Path = noteKey,
            BodyJson = Object(("category", "life"), ("date", Day), ("version", 2), ("text", text), ("save_id", operationId)).ToJsonString() });
        await store.SaveAsync(state);
        var newer = state with { LocalRevision = 2, Cache = new Dictionary<string, string>(state.Cache) };
        newer.Cache["/api/v1/todos?date=" + Day] = Wrap(Object(("date", Day), ("today", Day), ("completed_mode", "strike"), ("preferences_version", 0), ("items", new JsonArray())));
        await store.SaveAsync(newer);
        return store.FilePath;
    }
}
