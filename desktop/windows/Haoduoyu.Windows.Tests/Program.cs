using System.IO;
using System.Diagnostics.Tracing;
using System.Threading;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Threading;
using Haoduoyu.Api;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

// Synthetic tests only. Shown-window cases inject a temporary root and a socket-free HTTP handler.
internal static class Program
{
    private static App? application;

    [STAThread]
    private static int Main()
    {
        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("Windows native checks require Windows; no tests were run.");
            return 2;
        }
        var tests = new (string Name, Action Run)[]
        {
            ("Real current-user DPAPI preserves exact Unicode bytes", DpapiRoundTrip),
            ("Real DPAPI rejects damaged and unrelated ciphertext", DpapiRejectsInvalidCipher),
            ("Real DPAPI workspace survives reopen and explicit backup recovery", DurableWorkspace),
            ("Application compiled resources load without running startup", ResourcesLoad),
            ("Main window builds a native WPF control tree without loading data", NativeWindowTree),
            ("Queued native draft saves stay with the workspace captured at invocation", DraftSavesCaptureWorkspace),
            ("Native draft saves commit old and new content in invocation order", DraftSavesKeepInvocationOrder),
            ("A later explicit native draft save recovers after an earlier disk failure", DraftSavesRetryAfterFailure),
            ("Article edits preserve nested production metadata and edited fields", ArticlePayloadPreservesMetadata),
            ("Legacy work/life edits retain distinct server identities", LegacyCategoryIdentity),
            ("New note saves retain the original persisted record UUID", StableNewNoteIdentity),
            ("Review article edits keep hash guards, record UUID, nested data and original timestamp precision", ReviewArticleProperties),
            ("Review metrics keep unknown and zero distinct and reject impossible percentages", ReviewSnapshotProperties)
        }.Concat(NativeWorkflowTests.Cases).ToArray();
        var failures = 0;
        foreach (var (name, run) in tests)
        {
            try { run(); Console.WriteLine($"PASS {name}"); }
            catch (Exception error)
            {
                failures++;
                Console.Error.WriteLine($"FAIL {name}: {error}");
            }
        }
        Console.WriteLine($"Windows native synthetic checks: {tests.Length - failures}/{tests.Length} passed");
        Console.WriteLine("Scope: current-runner DPAPI, temporary synthetic files, compiled WPF controls and shown-window dispatcher workflows with fake HTTP only. No production, physical IME, power-loss or installation acceptance.");
        // Shown-window cases close their own synthetic windows. No real app startup or user data root is used.
        return failures == 0 ? 0 : 1;
    }

    private static void DpapiRoundTrip()
    {
        var original = Encoding.UTF8.GetBytes("好多鱼合成草稿\r\n中文、emoji 🐟、标点：以及\0内嵌字节");
        var first = new WindowsProtector().Protect(original);
        var second = new WindowsProtector().Protect(original);
        Check(!first.SequenceEqual(original) && !first.SequenceEqual(second), "DPAPI did not produce independent protected bytes");
        var recovered = new WindowsProtector().Unprotect(first);
        try { Check(recovered.SequenceEqual(original), "Unicode or binary plaintext changed"); }
        finally { CryptographicOperations.ZeroMemory(original); CryptographicOperations.ZeroMemory(recovered); }
    }

    private static void DpapiRejectsInvalidCipher()
    {
        var protector = new WindowsProtector();
        var protectedBytes = protector.Protect(Encoding.UTF8.GetBytes("本次运行专用合成记录"));
        var damaged = protectedBytes.ToArray(); damaged[^1] ^= 0x80;
        Throws<CryptographicException>(() => protector.Unprotect(damaged));
        Throws<CryptographicException>(() => protector.Unprotect(RandomNumberGenerator.GetBytes(32)));
    }

    private static void DurableWorkspace()
    {
        WithDirectory(root =>
        {
            const string identity = "synthetic-owner-not-a-real-user";
            var secret = "Windows合成持久化草稿-" + Guid.NewGuid().ToString("N");
            string primaryPath, backupPath;
            byte[] firstBytes;
            using (var store = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", identity, new WindowsProtector()))
            {
                primaryPath = store.FilePath; backupPath = store.BackupPath;
                var first = new WorkspaceState { ScopeId = store.ScopeId,
                    Drafts = { ["synthetic:note"] = new LocalDraft { Key = "synthetic:note", Text = secret + "-one", BaseVersion = 4 } } };
                store.SaveAsync(first).GetAwaiter().GetResult();
                firstBytes = File.ReadAllBytes(primaryPath);
                var second = first with { Drafts = new Dictionary<string, LocalDraft>
                    { ["synthetic:note"] = first.Drafts["synthetic:note"] with { Text = secret + "-two" } } };
                store.SaveAsync(second).GetAwaiter().GetResult();
                Check(File.ReadAllBytes(backupPath).SequenceEqual(firstBytes), "backup is not the previous committed encrypted snapshot");
                Check(!Contains(File.ReadAllBytes(primaryPath), Encoding.UTF8.GetBytes(secret)), "workspace contains UTF-8 plaintext");
                Check(!Contains(File.ReadAllBytes(primaryPath), Encoding.Unicode.GetBytes(secret)), "workspace contains UTF-16 plaintext");
            }
            using (var reopened = new AtomicWorkspaceStore(root, "https://haoduoyu.xyz", identity, new WindowsProtector()))
            {
                Check(reopened.LoadAsync().GetAwaiter().GetResult().Drafts["synthetic:note"].Text == secret + "-two", "reopen lost committed data");
                var damaged = File.ReadAllBytes(primaryPath); damaged[^1] ^= 0x40;
                File.WriteAllBytes(primaryPath, damaged);
                Throws<InvalidDataException>(() => reopened.LoadAsync().GetAwaiter().GetResult());
                Throws<InvalidDataException>(() => reopened.SaveAsync(new WorkspaceState { ScopeId = reopened.ScopeId }).GetAwaiter().GetResult());
                Check(File.ReadAllBytes(primaryPath).SequenceEqual(damaged), "invalid primary was silently reset");
                reopened.RestoreBackupAsync().GetAwaiter().GetResult();
                Check(reopened.LoadAsync().GetAwaiter().GetResult().Drafts["synthetic:note"].Text == secret + "-one", "explicit backup recovery failed");
                Check(Directory.GetFiles(Path.GetDirectoryName(primaryPath)!, "workspace.bin.damaged-*")
                    .Any(file => File.ReadAllBytes(file).SequenceEqual(damaged)), "damaged source was destroyed during recovery");
            }
        });
    }

    private static void ResourcesLoad()
    {
        Check(Application.Current == null, "test application was unexpectedly started earlier");
        application = new SyntheticTestApplication { ShutdownMode = ShutdownMode.OnExplicitShutdown };
        application.InitializeComponent();
        Check(Application.Current == application, "compiled Application could not initialize");
        Check(application.MainWindow == null, "loading resources invoked real app startup");
        foreach (var type in new[] { typeof(Window), typeof(Button), typeof(TextBox), typeof(ListBox) })
        {
            Check(application.Resources[type] is Style style && style.TargetType == type,
                $"compiled resource missing or invalid: {type.Name}");
        }
    }

    private static void NativeWindowTree()
    {
        Check(application != null, "Application resource check must pass first");
        Check(Thread.CurrentThread.GetApartmentState() == ApartmentState.STA, "native tests are not running in an STA");
        using var requests = new HttpRequestProbe();
        var window = new MainWindow();
        try
        {
            Check(!window.IsLoaded && !window.IsVisible && new WindowInteropHelper(window).Handle == IntPtr.Zero,
                "test unexpectedly showed or loaded the window");
            Check(window.Content is DockPanel, "native desktop shell could not construct");
            var controls = LogicalDescendants(window).ToArray();
            Check(controls.OfType<ScrollViewer>().Any(), "native scroll content is absent");
            var buttons = controls.OfType<Button>().Select(button => button.Content?.ToString()).ToHashSet();
            foreach (var required in new[] { "待办", "生活记录", "工作记录", "备忘录", "文章台账", "本机草稿", "同步中心", "本机与恢复" })
                Check(buttons.Contains(required), $"required native navigation is absent: {required}");
            Check(controls.All(control => control is not HwndHost), "embedded native browser host was found in the control tree");
            Check(window.InputBindings.OfType<KeyBinding>().Any(binding => binding.Key == Key.S && binding.Modifiers == ModifierKeys.Control),
                "desktop draft shortcut is absent");
            var engine = typeof(MainWindow).GetField("engine", BindingFlags.Instance | BindingFlags.NonPublic)?.GetValue(window);
            Check(engine == null, "unshown construction initialized an actual user workspace");
            Check(!window.IsLoaded, "control inspection triggered Loaded");
            Check(requests.Requests == 0, "unshown construction started an HTTP request");
        }
        finally
        {
            // Constructors allocate transport/timer but issue no requests. Stop those objects without invoking window-closing business logic.
            foreach (var field in typeof(MainWindow).GetFields(BindingFlags.Instance | BindingFlags.NonPublic))
            {
                if (field.GetValue(window) is WorkbenchApi api) api.Dispose();
                if (field.GetValue(window) is DispatcherTimer timer) timer.Stop();
            }
        }
    }

    private static void DraftSavesCaptureWorkspace()
    {
        WithUnshownWindow(window =>
        {
            var storeA = new DraftStore("synthetic-scope-A"); var storeB = new DraftStore("synthetic-scope-B");
            var api = new NoNetworkApi(); var engineA = DraftEngine(storeA, api); var engineB = DraftEngine(storeB, api);
            var predecessor = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            SetWindowField(window, "draftWrites", predecessor.Task);
            SetWindowField(window, "engine", engineA);
            var first = SaveNativeDraft(window, new LocalDraft { Key = "same-key", Text = "账号A的合成草稿" });
            SetWindowField(window, "engine", engineB);
            var second = SaveNativeDraft(window, new LocalDraft { Key = "same-key", Text = "账号B的合成草稿" });
            Check(!first.IsCompleted && !second.IsCompleted, "test did not hold the asynchronous draft queue");
            predecessor.SetResult();
            Wait(Task.WhenAll(first, second));
            Check(engineA.Snapshot.Drafts["same-key"].Text == "账号A的合成草稿" &&
                engineB.Snapshot.Drafts["same-key"].Text == "账号B的合成草稿", "pending draft crossed the switched account boundary");
            Check(storeA.CommittedTexts.SequenceEqual(new[] { "账号A的合成草稿" }) &&
                storeB.CommittedTexts.SequenceEqual(new[] { "账号B的合成草稿" }), "draft was written into the wrong durable partition");
            Check(api.Calls == 0, "local draft saving attempted a network operation");
        });
    }

    private static void DraftSavesKeepInvocationOrder()
    {
        WithUnshownWindow(window =>
        {
            var store = new DraftStore("synthetic-ordered", holdFirst: true); var api = new NoNetworkApi();
            var engine = DraftEngine(store, api); SetWindowField(window, "engine", engine);
            var first = SaveNativeDraft(window, new LocalDraft { Key = "same-key", Text = "旧稿" });
            Wait(store.FirstSaveEntered.Task);
            var second = SaveNativeDraft(window, new LocalDraft { Key = "same-key", Text = "最新稿" });
            Check(store.SaveAttempts == 1 && !second.IsCompleted, "second draft passed an unfinished earlier disk write");
            store.FirstSaveRelease.SetResult();
            Wait(Task.WhenAll(first, second));
            Check(store.CommittedTexts.SequenceEqual(new[] { "旧稿", "最新稿" }), "disk commit order differs from user edit order");
            Check(engine.Snapshot.Drafts["same-key"].Text == "最新稿", "an older asynchronous write replaced the latest draft");
            Check(api.Calls == 0, "ordered local draft saving attempted a network operation");
        });
    }

    private static void DraftSavesRetryAfterFailure()
    {
        WithUnshownWindow(window =>
        {
            var store = new DraftStore("synthetic-retry", failFirst: true); var api = new NoNetworkApi();
            var engine = DraftEngine(store, api); SetWindowField(window, "engine", engine);
            Throws<IOException>(() => Wait(SaveNativeDraft(window, new LocalDraft { Key = "same-key", Text = "未落盘旧稿" })));
            Check(engine.Snapshot.Drafts.Count == 0 && store.CommittedTexts.Count == 0, "failed disk write became a saved draft");
            Wait(SaveNativeDraft(window, new LocalDraft { Key = "same-key", Text = "明确重试后的新稿" }));
            Check(store.SaveAttempts == 2 && store.CommittedTexts.SequenceEqual(new[] { "明确重试后的新稿" }) &&
                engine.Snapshot.Drafts["same-key"].Text == "明确重试后的新稿", "earlier failed task poisoned the later explicit save");
            Check(api.Calls == 0, "retrying a local draft attempted a network operation");
        });
    }

    private static void ReviewArticleProperties()
    {
        var id = Guid.NewGuid().ToString(); var hash = new string('a', 64);
        var original = new JsonObject { ["id"] = id, ["content_hash"] = hash, ["account"] = "synthetic",
            ["platform"] = "toutiao", ["title"] = "原合成标题", ["published_at"] = "2026-10-30T04:05:06.123Z",
            ["applied_rule_ids"] = new JsonArray("rule-a"), ["source_chat"] = null,
            ["nested_provider"] = new JsonObject { ["unexposed"] = new JsonObject { ["future_value"] = 31 } } };
        var before = original.DeepClone(); var values = (JsonObject)original.DeepClone();
        values["title"] = "编辑后的合成标题";
        values["published_at"] = "2026-10-30 12:05:06"; // Native form display is seconds; unchanged display must retain server milliseconds.
        var edited = BuildReviewSave("articles", original, values);
        Check(edited.Method == "PATCH" && edited.Path == "/api/v1/review/articles/" + id &&
            edited.Body["expected_hash"]?.GetValue<string>() == hash, "review edit lost its exact identity or hash precondition");
        Check(!edited.Body.ContainsKey("nested_provider") && JsonNode.DeepEquals(original, before),
            "partial review save would overwrite unexposed nested provider data");
        Check(edited.Body["published_at"]?.GetValue<string>() == "2026-10-30T04:05:06.123Z" &&
            JsonNode.DeepEquals(edited.Body["applied_rule_ids"], original["applied_rule_ids"]),
            "unchanged display truncated original timestamp precision or rule IDs");
        var fresh = (JsonObject)original.DeepClone(); fresh.Remove("content_hash");
        var first = BuildReviewSave("articles", fresh, values); var second = BuildReviewSave("articles", fresh, values);
        Check(first.Method == "PUT" && first.Path == edited.Path && second.Path == first.Path &&
            !first.Body.ContainsKey("expected_hash"), "new review record changed UUID or invented an existing-record hash");
    }

    private static void ReviewSnapshotProperties()
    {
        var hash = new string('b', 64);
        var original = new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["content_hash"] = hash,
            ["article_id"] = Guid.NewGuid().ToString(), ["snapshot_date"] = "2026-10-30", ["source"] = "manual",
            ["reads"] = null, ["impressions"] = 0, ["ctr"] = null,
            ["traffic_sources"] = new JsonObject { ["unexposed_source"] = new JsonObject { ["reads"] = 17 } } };
        var before = original.DeepClone(); var values = (JsonObject)original.DeepClone();
        var result = BuildReviewSave("snapshots", original, values);
        Check(result.Method == "PATCH" && result.Body["expected_hash"]?.GetValue<string>() == hash,
            "snapshot edit lost its exact hash precondition");
        Check(result.Body.ContainsKey("reads") && result.Body["reads"] == null &&
            result.Body["impressions"]?.GetValue<long>() == 0 && result.Body["ctr"] == null,
            "unknown metric was converted to zero, or a real zero became unknown");
        Check(JsonNode.DeepEquals(result.Body["traffic_sources"], original["traffic_sources"]) && JsonNode.DeepEquals(before, original),
            "native structured snapshot form truncated existing nested traffic metrics or mutated its base version");
        values["ctr"] = "101";
        Throws<InvalidOperationException>(() => BuildReviewSave("snapshots", original, values));
    }

    private static void ArticlePayloadPreservesMetadata()
    {
        var id = Guid.NewGuid().ToString();
        var original = new JsonObject
        {
            ["id"] = id, ["version"] = 7, ["account_id"] = "synthetic-account", ["title"] = "原始合成标题",
            ["status"] = "drafting", ["production_mode"] = "manual", ["notes"] = "原生产备注", ["summary"] = "保留摘要",
            ["draft_ref"] = new JsonObject { ["provider"] = "synthetic", ["unknown_nested"] = new JsonObject
                { ["future_values"] = new JsonArray(1, "中文", true) } },
            ["timings"] = new JsonObject { ["future_phase"] = new JsonObject { ["seconds"] = 31, ["label"] = "只保留、不改写" } }
        };
        var before = original.DeepClone(); var value = (JsonObject)original.DeepClone();
        value["title"] = "修改后的合成标题"; value["notes"] = "用户明确编辑的新备注"; value["production_mode"] = "mixed";
        var result = BuildSave("article", original, value);
        Check(result.Method == "PUT" && result.Path == "/api/v1/articles/" + id, "article identity or CAS route changed");
        Check(result.Body["version"]?.GetValue<long>() == 7, "article base version was replaced");
        Check(result.Body["title"]?.GetValue<string>() == "修改后的合成标题" &&
            result.Body["notes"]?.GetValue<string>() == "用户明确编辑的新备注" &&
            result.Body["production_mode"]?.GetValue<string>() == "mixed", "edited production fields were lost");
        Check(JsonNode.DeepEquals(result.Body["draft_ref"], original["draft_ref"]) &&
            JsonNode.DeepEquals(result.Body["timings"], original["timings"]), "unexposed nested metadata was truncated");
        Check(!ReferenceEquals(result.Body["draft_ref"], original["draft_ref"]), "payload aliases the original nested metadata");
        Check(JsonNode.DeepEquals(before, original), "preparing a save mutated the original server version");
    }

    private static void LegacyCategoryIdentity()
    {
        foreach (var category in new[] { "work", "life" })
        {
            var original = new JsonObject { ["date"] = "2026-10-30", ["category"] = category, ["version"] = 3, ["text"] = "旧日页" };
            var edited = (JsonObject)original.DeepClone(); edited["text"] = "合成编辑内容\r\n下一行";
            var result = BuildSave("legacy", original, edited);
            Check(result.Method == "PUT" && result.Path == "/api/v1/daily-notes/2026-10-30?category=" + category,
                "legacy work and life records were merged");
            Check(result.Body["version"]?.GetValue<long>() == 3 && result.Body["text"]?.GetValue<string>() == "合成编辑内容\n下一行",
                "legacy CAS or Unicode content changed");
        }
    }

    private static void StableNewNoteIdentity()
    {
        var id = Guid.NewGuid().ToString();
        var original = new JsonObject { ["id"] = id, ["version"] = 0, ["category"] = "work", ["date"] = "2026-10-30" };
        var edited = (JsonObject)original.DeepClone(); edited["text"] = "合成新记录";
        var first = BuildSave("note", original, edited); var second = BuildSave("note", original, edited);
        Check(first.Path == "/api/v1/note-entries/" + id && second.Path == first.Path,
            "preparing another save regenerated the record identity");
        Check(first.Body["version"]?.GetValue<long>() == 0 && first.Body["date"]?.GetValue<string>() == "2026-10-30" &&
            first.Body["category"]?.GetValue<string>() == "work", "new record identity metadata was lost");
        Check(Guid.TryParse(first.Body["save_id"]?.GetValue<string>(), out _), "save intent is missing its distinct UUID");
    }

    private static (string Method, string Path, JsonObject Body) BuildSave(string kind, JsonObject original, JsonObject value)
    {
        var method = typeof(MainWindow).GetMethod("BuildSave", BindingFlags.Static | BindingFlags.NonPublic)
            ?? throw new MissingMethodException("MainWindow.BuildSave was not found");
        try
        {
            return ((string, string, JsonObject))(method.Invoke(null, [kind, original, value])
                ?? throw new InvalidOperationException("Save preparation returned no request"));
        }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
    }

    private static (string Method, string Path, JsonObject Body) BuildReviewSave(string kind, JsonObject original, JsonObject values)
    {
        var method = typeof(MainWindow).GetMethod("BuildReviewSave", BindingFlags.Static | BindingFlags.NonPublic)
            ?? throw new MissingMethodException("MainWindow.BuildReviewSave was not found");
        object command;
        try { command = method.Invoke(null, [kind, original, values]) ?? throw new InvalidOperationException("Review save returned no command"); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
        var type = command.GetType();
        return ((string)type.GetProperty("Method")!.GetValue(command)!,
            (string)type.GetProperty("Path")!.GetValue(command)!, (JsonObject)type.GetProperty("Body")!.GetValue(command)!);
    }
    private static Task SaveNativeDraft(MainWindow window, LocalDraft draft)
    {
        var method = typeof(MainWindow).GetMethod("SaveLocalDraftAsync", BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingMethodException("MainWindow.SaveLocalDraftAsync was not found");
        try { return (Task)(method.Invoke(window, [draft]) ?? throw new InvalidOperationException("Native save returned no task")); }
        catch (TargetInvocationException error) { throw error.InnerException ?? error; }
    }
    private static void SetWindowField(MainWindow window, string name, object value)
    {
        var field = typeof(MainWindow).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingFieldException("MainWindow", name);
        field.SetValue(window, value);
    }
    private static SyncEngine DraftEngine(IWorkspaceStore store, IRemoteApi api)
    {
        var engine = new SyncEngine(store, api); Wait(engine.InitializeAsync()); return engine;
    }
    private static void Wait(Task task) => task.WaitAsync(TimeSpan.FromSeconds(10)).GetAwaiter().GetResult();
    private static void WithUnshownWindow(Action<MainWindow> action)
    {
        // These helpers operate only on non-UI engine objects after capture; no dispatcher loop or Loaded event is needed.
        var context = SynchronizationContext.Current; SynchronizationContext.SetSynchronizationContext(null);
        var window = new MainWindow();
        using var requests = new HttpRequestProbe();
        try
        {
            Check(!window.IsLoaded && !window.IsVisible, "draft test accidentally loaded a real workspace");
            action(window);
            Check(!window.IsLoaded && requests.Requests == 0, "local draft test loaded data or attempted HTTP");
        }
        finally
        {
            foreach (var field in typeof(MainWindow).GetFields(BindingFlags.Instance | BindingFlags.NonPublic))
            {
                if (field.GetValue(window) is WorkbenchApi api) api.Dispose();
                if (field.GetValue(window) is DispatcherTimer timer) timer.Stop();
            }
            SynchronizationContext.SetSynchronizationContext(context);
        }
    }
    private sealed class NoNetworkApi : IRemoteApi
    {
        public int Calls;
        public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref Calls);
            throw new InvalidOperationException("Synthetic draft tests must never send network requests");
        }
    }
    private sealed class DraftStore : IWorkspaceStore
    {
        private readonly object gate = new();
        private readonly bool failFirst;
        private WorkspaceState state;
        private int attempts;
        private readonly List<string> committed = new();
        public string ScopeId { get; }
        public int SaveAttempts => Volatile.Read(ref attempts);
        public TaskCompletionSource FirstSaveEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource FirstSaveRelease { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public IReadOnlyList<string> CommittedTexts { get { lock (gate) return committed.ToArray(); } }
        public DraftStore(string scope, bool holdFirst = false, bool failFirst = false)
        {
            ScopeId = scope; state = new WorkspaceState { ScopeId = scope }; this.failFirst = failFirst;
            if (!holdFirst) FirstSaveRelease.SetResult();
        }
        public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default)
        { lock (gate) return Task.FromResult(Clone(state)); }
        public async Task SaveAsync(WorkspaceState value, CancellationToken cancellationToken = default)
        {
            var attempt = Interlocked.Increment(ref attempts);
            if (attempt == 1)
            {
                FirstSaveEntered.TrySetResult(); await FirstSaveRelease.Task.WaitAsync(cancellationToken);
                if (failFirst) throw new IOException("synthetic disk failure");
            }
            lock (gate)
            {
                state = Clone(value);
                committed.Add(value.Drafts["same-key"].Text);
            }
        }
        private static WorkspaceState Clone(WorkspaceState value) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(value))!;
    }

    private static IEnumerable<DependencyObject> LogicalDescendants(DependencyObject root)
    {
        var stack = new Stack<DependencyObject>(); var visited = new HashSet<DependencyObject>(ReferenceEqualityComparer.Instance);
        stack.Push(root);
        while (stack.TryPop(out var current))
        {
            if (!visited.Add(current)) continue;
            yield return current;
            foreach (var child in LogicalTreeHelper.GetChildren(current).OfType<DependencyObject>()) stack.Push(child);
        }
    }
    private sealed class HttpRequestProbe : EventListener
    {
        private int requests;
        public int Requests => Volatile.Read(ref requests);
        protected override void OnEventSourceCreated(EventSource source)
        {
            if (source.Name == "System.Net.Http") EnableEvents(source, EventLevel.Informational);
        }
        protected override void OnEventWritten(EventWrittenEventArgs args)
        {
            if (args.EventName == "RequestStart") Interlocked.Increment(ref requests);
        }
    }
    private static bool Contains(byte[] bytes, byte[] value) => bytes.AsSpan().IndexOf(value) >= 0;
    private static void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
    private static void Throws<T>(Action action) where T : Exception
    {
        try { action(); } catch (T) { return; }
        throw new InvalidOperationException($"Expected {typeof(T).Name}");
    }
    private static void WithDirectory(Action<string> action)
    {
        var root = Path.Combine(Path.GetTempPath(), "haoduoyu-windows-synthetic-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try { action(root); } finally { Directory.Delete(root, recursive: true); }
    }
}

// WPF Application's constructor queues OnStartup for the first dispatcher pump, even without Run().
// Keep the production App resources, but intercept startup before it could open the default user-data window.
// Reference: dotnet/wpf PresentationFramework/System/Windows/Application.cs, Application constructor.
internal sealed class SyntheticTestApplication : App
{
    internal int GuardedStartupCalls { get; private set; }
    protected override void OnStartup(StartupEventArgs e) { GuardedStartupCalls++; }
}
