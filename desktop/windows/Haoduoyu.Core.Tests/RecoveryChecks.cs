using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Haoduoyu.Core;

internal static class RecoveryChecks
{
    internal static int Run()
    {
        var tests = new (string, Func<Task>)[]
        {
            ("Restoring an older Queued backup never replays requests from a damaged newer InFlight or Confirmed primary", RollbackNeverReplays),
            ("Restored unknown operations cannot be directly returned to Queued, including dependent children", UnknownParentFencesRetry),
            ("An older Blocked backup cannot retry a create that a newer damaged primary already confirmed", BlockedRollbackNeverReplays),
            ("Recovery provenance survives reopening and later draft-only saves without fabricating operation history", DraftOnlyProvenance),
            ("Recovered new article drafts remain editable but cannot create another server-assigned article after restart", RecoveredArticleFence),
            ("Backup recovery encryption and cancellation failures preserve both source files exactly", FailedRecoveryPreservesFiles),
            ("Invalid backup recovery leaves a valid newer primary untouched", InvalidBackupPreservesPrimary),
            ("Restoring when the primary is missing installs fenced encrypted state and retains the original backup", MissingPrimary)
        };
        var failed = 0;
        foreach (var (name, run) in tests)
        {
            try { run().GetAwaiter().GetResult(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failed++; Console.Error.WriteLine($"FAIL {name}: {error}"); }
        }
        Console.WriteLine($"Backup recovery checks: {tests.Length - failed}/{tests.Length} passed");
        return failed;
    }

    private static async Task RollbackNeverReplays()
    {
        foreach (var newerStatus in new[] { PendingStatus.InFlight, PendingStatus.Confirmed })
        {
            await WithDirectory(async root =>
            {
                var protector = new TestProtector();
                string file;
                string backupPath;
                byte[] backupBytes;
                var corrupt = Encoding.UTF8.GetBytes("damaged-newer-" + newerStatus);
                WorkspaceState expected;
                using (var store = Store(root, protector))
                {
                    file = store.FilePath; backupPath = store.BackupPath;
                    expected = State(store.ScopeId);
                    await store.SaveAsync(expected);
                    var parent = expected.Outbox.First(operation => operation.ResourceKey == "new-article");
                    var newer = expected with
                    {
                        LocalRevision = 11,
                        Outbox = expected.Outbox.Select(operation => operation.Id == parent.Id
                            ? operation with
                            {
                                Status = newerStatus, SendAttempts = 1,
                                ConfirmedRevision = newerStatus == PendingStatus.Confirmed ? 11 : 0,
                                RemoteJson = newerStatus == PendingStatus.Confirmed ? "{\"data\":{\"id\":\"server-assigned\"}}" : null
                            } : operation).ToList()
                    };
                    await store.SaveAsync(newer);
                    backupBytes = await File.ReadAllBytesAsync(backupPath);
                    await File.WriteAllBytesAsync(file, corrupt);
                    await store.RestoreBackupAsync();
                    var restored = await store.LoadAsync();
                    Check(restored.LocalRevision == expected.LocalRevision + 1 && restored.BackupRecoveryRevision == restored.LocalRevision &&
                        restored.BackupRecoveredAt != null, "recovery did not persist provenance before installation");
                    Check(restored.Cache["cached"] == expected.Cache["cached"] && restored.Drafts["new-article"] ==
                        expected.Drafts["new-article"] with { RecoveredAtRevision = restored.BackupRecoveryRevision },
                        "backup drafts or cache changed during fencing");
                    foreach (var original in expected.Outbox)
                    {
                        var actual = restored.Outbox.Single(operation => operation.Id == original.Id);
                        var unresolved = original.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded);
                        var expectedStatus = unresolved ? PendingStatus.Unknown : original.Status;
                        Check(actual.Status == expectedStatus, "a recovered operation was reactivated or lost its unknown fence");
                        Check(Immutable(actual) == Immutable(original), "recovery changed operation identity, original/prepared request, receipts, attempts or dependencies");
                        if (unresolved)
                            Check(actual.RecoveredAtRevision == restored.BackupRecoveryRevision && !actual.CanEditQueued && actual.Error!.Contains("备份") &&
                                (original.Error == null || actual.Error.Contains(original.Error)), "recovery lost prior error or allowed queued replacement");
                        else Check(actual.Error == original.Error, "settled or already fenced history was changed");
                    }
                    var api = new FakeApi(); var engine = new SyncEngine(store, api); await engine.InitializeAsync();
                    await engine.SyncAsync(); await engine.SyncAsync();
                    Check(api.Calls == 0, "restored backup automatically replayed a potentially confirmed POST or child");
                    await Throws<InvalidOperationException>(() => engine.CancelQueuedAsync(parent.Id));
                    await Throws<InvalidOperationException>(() => engine.ReplaceQueuedAsync(parent.Id, parent with { Id = Guid.NewGuid().ToString() }));
                    Check((await File.ReadAllBytesAsync(backupPath)).SequenceEqual(backupBytes), "original backup was overwritten during recovery");
                    var damaged = Directory.GetFiles(Path.GetDirectoryName(file)!, "*.damaged-*");
                    Check(damaged.Length == 1 && (await File.ReadAllBytesAsync(damaged[0])).SequenceEqual(corrupt), "newer damaged primary was not preserved exactly");
                    Check(Directory.GetFiles(Path.GetDirectoryName(file)!, "*.tmp").Length == 0, "recovery staging file leaked");
                }
                // A process restart must observe the same fence without needing another recovery action.
                using var reopened = Store(root, protector);
                var afterRestart = new SyncEngine(reopened, new FakeApi()); await afterRestart.InitializeAsync();
                Check(afterRestart.Snapshot.BackupRecoveryRevision == 11 && afterRestart.Snapshot.Outbox.All(operation => operation.Status != PendingStatus.Queued),
                    "restart discarded the durable rollback fence");
            });
        }
    }

    private static async Task UnknownParentFencesRetry()
    {
        await WithDirectory(async root =>
        {
            using var store = Store(root, new TestProtector());
            var expected = State(store.ScopeId); await store.SaveAsync(expected); await store.SaveAsync(expected);
            await File.WriteAllTextAsync(store.FilePath, "damaged-newer"); await store.RestoreBackupAsync();
            var api = new FakeApi(); var engine = new SyncEngine(store, api); await engine.InitializeAsync();
            var child = engine.Snapshot.Outbox.Single(operation => operation.ResourceKey == "article-child");
            await Throws<InvalidOperationException>(() => engine.RetryUnchangedAsync(child.Id, "{\"data\":null}"));
            var result = await engine.SyncAsync();
            Check(api.Calls == 0 && result.Queued == 0, "child retry bypassed its unknown restored parent");
            var pending = engine.Snapshot.Outbox.Single(operation => operation.Id == child.Id);
            Check(pending.Status == PendingStatus.Unknown && !pending.CanEditQueued && pending.SendAttempts == child.SendAttempts,
                "explicit retry lost history or pretended the recovered child was never attempted");
            await Throws<InvalidOperationException>(() => engine.CancelQueuedAsync(child.Id));
        });
    }

    private static async Task BlockedRollbackNeverReplays()
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector(); string operationId; byte[] originalBackup;
            var damagedPrimary = Encoding.UTF8.GetBytes("damaged-after-real-create-confirmation");
            using (var store = Store(root, protector))
            {
                var blocked = new PendingOperation
                {
                    ResourceKey = "blocked-create-without-draft", Method = "POST", Path = "/api/v1/articles",
                    BodyJson = "{\"title\":\"较旧拒绝记录后来已保存\",\"status\":\"draft\"}", Status = PendingStatus.Blocked,
                    SendAttempts = 1, RemoteJson = "{\"error\":\"HTTP403-old\"}", Error = "HTTP403-old"
                };
                operationId = blocked.Id;
                var backup = new WorkspaceState { ScopeId = store.ScopeId, LocalRevision = 3, Outbox = [blocked] };
                await store.SaveAsync(backup);
                await store.SaveAsync(backup with
                {
                    LocalRevision = 6,
                    Outbox = [blocked with { Status = PendingStatus.Confirmed, SendAttempts = 2, ConfirmedRevision = 6,
                        RemoteJson = "{\"data\":{\"id\":\"server-assigned-real-id\"}}", Error = null }]
                });
                originalBackup = await File.ReadAllBytesAsync(store.BackupPath);
                await File.WriteAllBytesAsync(store.FilePath, damagedPrimary); await store.RestoreBackupAsync();
                var api = new FakeApi(); var engine = new SyncEngine(store, api); await engine.InitializeAsync();
                var recovered = engine.Snapshot.Outbox.Single();
                Check(recovered.Status == PendingStatus.Unknown && recovered.RecoveredAtRevision == engine.Snapshot.BackupRecoveryRevision &&
                    recovered.RemoteJson == blocked.RemoteJson && recovered.Error!.Contains(blocked.Error!) && Immutable(recovered) == Immutable(blocked),
                    "old Blocked status or proof was treated as evidence that the later create never happened");
                await Throws<InvalidOperationException>(() => engine.RetryUnchangedAsync(operationId, "{\"data\":null}"));
                await engine.SyncAsync();
                Check(api.Calls == 0 && engine.Snapshot.Outbox.Single().Status == PendingStatus.Unknown,
                    "restored Blocked create was directly retried through the old rejection path");
                Check((await File.ReadAllBytesAsync(store.BackupPath)).SequenceEqual(originalBackup) &&
                    (await File.ReadAllBytesAsync(Directory.GetFiles(Path.GetDirectoryName(store.FilePath)!, "*.damaged-*").Single())).SequenceEqual(damagedPrimary),
                    "Blocked recovery lost original backup or exact newer damaged primary");
            }
            using var reopened = Store(root, protector); var restartedApi = new FakeApi(); var restarted = new SyncEngine(reopened, restartedApi); await restarted.InitializeAsync();
            await Throws<InvalidOperationException>(() => restarted.RetryUnchangedAsync(operationId, "{\"data\":null}"));
            await restarted.SyncAsync(); Check(restartedApi.Calls == 0, "restart cleared the restored-request retry fence");
            // A transport-verified exact receipt may still settle the original immutable operation without sending it.
            await restarted.ConfirmReconciledAsync(operationId, "{\"data\":{\"id\":\"server-assigned-real-id\"}}");
            Check(restarted.Snapshot.Outbox.Single().Status == PendingStatus.Confirmed && restartedApi.Calls == 0,
                "restored unknown request could not be safely confirmed from exact read-only evidence");
        });
    }

    private static async Task DraftOnlyProvenance()
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector(); long revision;
            using (var store = Store(root, protector))
            {
                var draft = new LocalDraft { Key = "new-article-only", Text = "可能早于已经发送的稿件", BaseVersion = 0 };
                var backup = new WorkspaceState { ScopeId = store.ScopeId, Drafts = { [draft.Key] = draft } };
                await store.SaveAsync(backup); await store.SaveAsync(backup with { LocalRevision = 1 });
                await File.WriteAllTextAsync(store.FilePath, "newer-operation-history-no-longer-readable"); await store.RestoreBackupAsync();
                var api = new FakeApi(); var engine = new SyncEngine(store, api); await engine.InitializeAsync();
                revision = engine.Snapshot.BackupRecoveryRevision;
                Check(revision > 0 && engine.Snapshot.BackupRecoveredAt != null && engine.Snapshot.Outbox.Count == 0 &&
                    engine.Snapshot.Drafts[draft.Key] == draft with { RecoveredAtRevision = revision },
                    "draft-only restoration silently appeared pristine or fabricated operation history");
                await engine.SaveDraftAsync(draft with { Text = "继续保留的草稿" }); await engine.SyncAsync();
                Check(api.Calls == 0 && engine.Snapshot.BackupRecoveryRevision == revision && engine.Snapshot.LocalRevision > revision &&
                    engine.Snapshot.Drafts[draft.Key].RecoveredAtRevision == revision,
                    "later local save cleared recovery provenance or dispatched a draft");
            }
            using var reopened = Store(root, protector);
            Check((await reopened.LoadAsync()).BackupRecoveryRevision == revision, "reopened workspace lost draft recovery warning provenance");
        });
    }

    private static async Task RecoveredArticleFence()
    {
        await WithDirectory(async root =>
        {
            var protector = new TestProtector(); const string key = "new-article-only";
            var create = new PendingOperation { ResourceKey = key, Method = "POST", Path = "/api/v1/articles", BodyJson = "{\"title\":\"恢复的新稿\",\"status\":\"draft\"}" };
            long recoveryRevision;
            using (var store = Store(root, protector))
            {
                var backup = new WorkspaceState { ScopeId = store.ScopeId, Drafts = { [key] = new LocalDraft { Key = key, Text = "恢复的正文" } } };
                await store.SaveAsync(backup); await store.SaveAsync(backup);
                await File.WriteAllTextAsync(store.FilePath, "damaged-later-create-may-have-completed"); await store.RestoreBackupAsync();
                var engine = new SyncEngine(store, new FakeApi()); await engine.InitializeAsync(); recoveryRevision = engine.Snapshot.BackupRecoveryRevision;
                await Throws<InvalidOperationException>(() => engine.QueueAsync(create));
                // Match the editor's first autosave: a fresh object and timestamp must not wash away provenance.
                await engine.SaveDraftAsync(new LocalDraft { Key = key, Text = "恢复后继续编辑", UpdatedAt = DateTimeOffset.UtcNow.AddDays(1) });
                Check(engine.Snapshot.Drafts[key].RecoveredAtRevision == recoveryRevision && engine.Snapshot.Drafts[key].Text == "恢复后继续编辑",
                    "autosave erased the restore fence or blocked local draft editing");
            }
            using var reopened = Store(root, protector); var api = new FakeApi(); var restarted = new SyncEngine(reopened, api); await restarted.InitializeAsync();
            await restarted.SaveDraftAsync(new LocalDraft { Key = key, Text = "重开后仍能编辑" });
            await Throws<InvalidOperationException>(() => restarted.QueueAsync(create));
            Check(restarted.Snapshot.Outbox.Count == 0 && restarted.Snapshot.Drafts[key].RecoveredAtRevision == recoveryRevision,
                "reopen/autosave allowed a recovered draft-only POST to acquire a new server identity");
            var actualId = Guid.NewGuid().ToString();
            var update = create with { Id = Guid.NewGuid().ToString(), Method = "PUT", Path = "/api/v1/articles/" + actualId,
                BodyJson = "{\"title\":\"核对后的更新\",\"version\":8}" };
            await restarted.QueueAsync(update);
            var fresh = create with { Id = Guid.NewGuid().ToString(), ResourceKey = "fresh-new-article" };
            await restarted.SaveDraftAsync(new LocalDraft { Key = fresh.ResourceKey, Text = "明确新写的文章" });
            await restarted.QueueAsync(fresh); await restarted.SyncAsync();
            Check(api.Calls == 2 && restarted.Snapshot.Outbox.All(operation => operation.Status == PendingStatus.Confirmed) &&
                restarted.Snapshot.Drafts[fresh.ResourceKey].RecoveredAtRevision == 0,
                "the narrow restored-create fence blocked a verified existing-ID update or a fresh new draft key");
        });
    }

    private static async Task FailedRecoveryPreservesFiles()
    {
        foreach (var cancel in new[] { false, true })
        {
            await WithDirectory(async root =>
            {
                var protector = new FaultProtector(); using var store = Store(root, protector);
                var state = State(store.ScopeId); await store.SaveAsync(state); await store.SaveAsync(state);
                await File.WriteAllTextAsync(store.FilePath, "damaged-but-preserved");
                var primary = await File.ReadAllBytesAsync(store.FilePath); var backup = await File.ReadAllBytesAsync(store.BackupPath);
                using var cancellation = new CancellationTokenSource();
                if (cancel) protector.AfterProtect = cancellation.Cancel; else protector.FailProtect = true;
                if (cancel) await Throws<OperationCanceledException>(() => store.RestoreBackupAsync(cancellation.Token));
                else await Throws<CryptographicException>(() => store.RestoreBackupAsync());
                Check((await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(primary) && (await File.ReadAllBytesAsync(store.BackupPath)).SequenceEqual(backup),
                    "failed staged recovery modified source files");
                Check(Directory.GetFiles(Path.GetDirectoryName(store.FilePath)!, "*.tmp").Length == 0 &&
                    Directory.GetFiles(Path.GetDirectoryName(store.FilePath)!, "*.damaged-*").Length == 0,
                    "failed recovery left partial staging or appeared committed");
                protector.FailProtect = false; protector.AfterProtect = null;
                await store.RestoreBackupAsync();
                Check((await store.LoadAsync()).Outbox.All(operation => operation.Status != PendingStatus.Queued), "a clean retry after recovery failure did not fence work");
            });
        }
    }

    private static async Task InvalidBackupPreservesPrimary()
    {
        await WithDirectory(async root =>
        {
            using var store = Store(root, new TestProtector());
            var state = State(store.ScopeId); await store.SaveAsync(state); await store.SaveAsync(state with { LocalRevision = 11 });
            var primary = await File.ReadAllBytesAsync(store.FilePath);
            await File.WriteAllTextAsync(store.BackupPath, "invalid-backup"); var backup = await File.ReadAllBytesAsync(store.BackupPath);
            await Throws<InvalidDataException>(() => store.RestoreBackupAsync());
            Check((await File.ReadAllBytesAsync(store.FilePath)).SequenceEqual(primary) && (await File.ReadAllBytesAsync(store.BackupPath)).SequenceEqual(backup) &&
                (await store.LoadAsync()).LocalRevision == 11, "invalid backup damaged the valid primary");
        });
    }

    private static async Task MissingPrimary()
    {
        await WithDirectory(async root =>
        {
            using var store = Store(root, new TestProtector());
            var state = State(store.ScopeId); await store.SaveAsync(state); await store.SaveAsync(state);
            var backup = await File.ReadAllBytesAsync(store.BackupPath); File.Delete(store.FilePath);
            await Throws<InvalidDataException>(() => store.LoadAsync()); await store.RestoreBackupAsync();
            var loaded = await store.LoadAsync();
            Check(loaded.BackupRecoveryRevision > 0 && loaded.Outbox.All(operation => operation.Status != PendingStatus.Queued) &&
                (await File.ReadAllBytesAsync(store.BackupPath)).SequenceEqual(backup), "missing-primary recovery bypassed fencing or deleted its backup");
            Check(!Encoding.UTF8.GetString(await File.ReadAllBytesAsync(store.FilePath)).Contains("合成恢复草稿"), "recovered state was written as plaintext");
            var api = new FakeApi(); var engine = new SyncEngine(store, api); await engine.InitializeAsync(); await engine.SyncAsync();
            Check(api.Calls == 0, "missing-primary restore replayed an old operation");
        });
    }

    private static WorkspaceState State(string scope)
    {
        var confirmed = new PendingOperation { ResourceKey = "old-confirmed", Path = "/api/v1/todos/" + Guid.NewGuid(), Method = "POST", BodyJson = "{}",
            Status = PendingStatus.Confirmed, ConfirmedRevision = 1, SendAttempts = 2, RemoteJson = "{\"data\":{\"version\":3}}" };
        var parent = new PendingOperation { ResourceKey = "new-article", Method = "POST", Path = "/api/v1/articles",
            BodyJson = "{\"title\":\"合成恢复草稿\",\"draft_ref\":{\"content\":\"保留正文\"},\"status\":\"draft\"}" };
        var child = new PendingOperation { ResourceKey = "article-child", Path = "/api/v1/memos/groups/" + Guid.NewGuid(), Method = "PUT",
            BodyJson = "{\"title\":\"依赖父项\",\"version\":0}", DependencyIds = [parent.Id] };
        var prepared = new PendingOperation { ResourceKey = "prepared", Path = "/api/v1/todos/" + Guid.NewGuid(), Method = "PATCH",
            BodyJson = "{\"completed\":true}", PreparedBodyJson = "{\"completed\":true,\"version\":3}",
            DependencyIds = [confirmed.Id], VersionFromDependencyId = confirmed.Id, Status = PendingStatus.InFlight,
            SendAttempts = 4, Error = "previous synthetic transport note", RemoteJson = "{\"earlier_read\":true}" };
        return new WorkspaceState
        {
            ScopeId = scope, LocalRevision = 10, Cache = { ["cached"] = "{\"data\":{\"version\":2}}" }, CacheRevisions = { ["cached"] = 8 },
            Drafts = { ["new-article"] = new LocalDraft { Key = "new-article", Text = "合成恢复草稿", BaselineConfirmedRevision = 1 } },
            Outbox = [confirmed, parent, child, prepared,
                new PendingOperation { ResourceKey = "old-superseded", Path = "/api/v1/memos/groups/" + Guid.NewGuid(), Status = PendingStatus.Superseded, Error = "explicitly cancelled" },
                new PendingOperation { ResourceKey = "old-conflict", Path = "/api/v1/memos/groups/" + Guid.NewGuid(), Status = PendingStatus.Conflict, RemoteJson = "{\"data\":{\"version\":9}}", Error = "HTTP409", SendAttempts = 1 },
                new PendingOperation { ResourceKey = "old-blocked", Path = "/api/v1/memos/groups/" + Guid.NewGuid(), Status = PendingStatus.Blocked, Error = "HTTP403", SendAttempts = 1 }]
        };
    }

    private static string Immutable(PendingOperation operation) => JsonSerializer.Serialize(operation with { Status = PendingStatus.Unknown, Error = null, RecoveredAtRevision = 0 });
    private static AtomicWorkspaceStore Store(string root, IStateProtector protector) => new(root, "https://haoduoyu.xyz", "synthetic-recovery", protector);
    private static void Check(bool value, string reason) { if (!value) throw new InvalidOperationException(reason); }
    private static async Task Throws<T>(Func<Task> action) where T : Exception
    { try { await action(); } catch (T) { return; } throw new InvalidOperationException("Expected " + typeof(T).Name); }
    private static async Task WithDirectory(Func<string, Task> action)
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-recovery-synthetic-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try { await action(root); } finally { Directory.Delete(root, recursive: true); }
    }
    private sealed class FaultProtector : IStateProtector
    {
        private readonly TestProtector inner = new();
        internal bool FailProtect;
        internal Action? AfterProtect;
        public byte[] Protect(byte[] plaintext)
        {
            if (FailProtect) throw new CryptographicException("synthetic recovery protection failure");
            var ciphertext = inner.Protect(plaintext); AfterProtect?.Invoke(); return ciphertext;
        }
        public byte[] Unprotect(byte[] ciphertext) => inner.Unprotect(ciphertext);
    }
}
