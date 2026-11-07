using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Haoduoyu.Core;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> ReadOnlyRecoveryCases =>
    [
        ("Shown native history recovery previews a near-32 MiB opaque original without changing identity, queue, or source and exports complete JSON", () => RunWithDispatcher(ReadOnlyHistoryRecoveryAsync)),
        ("Shown native history recovery can salvage an unreadable current workspace without an engine and refuses foreign scope", () => RunWithDispatcher(ReadOnlyHistoryWithoutEngineAsync))
    ];

    private static async Task ReadOnlyHistoryRecoveryAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var scope = new string('e', 64); var path = Path.Combine(root, scope, "workspace.bin");
            var prefix = " \n{\"ScopeId\":\"" + scope + "\",\"Schema\":999,\"Outbox\":[{\"future_invalid_queue\":true}],\"future_body\":\"";
            var json = prefix + new string('x', ReadOnlyWorkspaceRecovery.MaxPreviewCharacters - prefix.Length - 1) + "🐟";
            json += new string('x', ReadOnlyWorkspaceRecovery.MaxBytes - 4096 - Encoding.UTF8.GetByteCount(json) - 4) + "\"}\r\n";
            await SeedOpaqueHistoryAsync(path, json);
            var original = await File.ReadAllBytesAsync(path);
            var noteId = Guid.NewGuid().ToString(); var noteKey = "/api/v1/note-entries/" + noteId;
            await SeedRecoveryPartitionAsync(root, "public:unbound", noteKey,
                Object(("id", noteId), ("version", 2), ("category", "life"), ("date", Day), ("text", "本机正文")),
                "当前工作区的中文草稿不能被历史预览改写", Guid.NewGuid().ToString());
            var window = await ShowAsync(root, handler);
            try
            {
                var engine = Engine(window); var store = Field<AtomicWorkspaceStore?>(window, "store");
                var identity = Field<string?>(window, "currentIdentity"); var before = JsonSerializer.Serialize(engine.Snapshot);
                await ClickAsync(window, "本机与恢复");
                await ClickAsync(window, "读取历史分区清单（只读）");
                Check(VisibleText(window).Contains("已完成有界发现", StringComparison.Ordinal), "native discovery did not report completion and budget");
                var observed = ObserveReadOnlyHistoryDialogAsync(window, box =>
                {
                    Check(box.Text.Length <= ReadOnlyWorkspaceRecovery.MaxPreviewCharacters && !char.IsHighSurrogate(box.Text[^1]),
                        "real native preview was unbounded or split an emoji surrogate pair");
                    Check(NormalizeHistoryVisualText(box.Text).StartsWith(NormalizeHistoryVisualText(prefix), StringComparison.Ordinal) &&
                        !box.Text.Contains("🐟", StringComparison.Ordinal), "native preview changed JSON beyond visual CR/LF normalization");
                }, truncated: true);
                await ClickAsync(window, "只读查看 " + scope); await observed;
                Check(ReferenceEquals(Engine(window), engine) && ReferenceEquals(Field<AtomicWorkspaceStore?>(window, "store"), store) &&
                    Field<string?>(window, "currentIdentity") == identity && JsonSerializer.Serialize(engine.Snapshot) == before,
                    "opening/closing the foreign historical original changed active engine, identity, drafts, queue or fences");
                // Exercise the exact post-SaveFileDialog writer with the full original, not the preview.
                // Native file picker, MessageBox confirmation and accepting export in the modal are not automated.
                var snapshot = await Task.Run(() => ReadOnlyWorkspaceRecovery.ReadAsync(root, scope, new WindowsProtector()));
                var exported = Path.Combine(root, "chosen-full-original.txt");
                await InvokeAsync(window, "ExportTextToPathAsync", exported, snapshot.OriginalJson);
                Check(await File.ReadAllTextAsync(exported, new UTF8Encoding(false, true)) == json, "native export dropped unknown JSON, whitespace or the non-preview tail");
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(original), "read-only preview/export modified original encrypted bytes");
                Check(Directory.GetFiles(Path.GetDirectoryName(path)!).Select(Path.GetFileName).SequenceEqual(new[] { "workspace.bin" }),
                    "read-only foreign partition acquired a lock, backup or other generated file");
                Check(handler.Calls == 0 && sockets.Connects == 0, "read-only historical recovery contacted a service");
                SaveEvidence(window, "readonly-history-large-preview-closed.png");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task ReadOnlyHistoryWithoutEngineAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin(denyEveryRequest: true);
            var window = await ShowAsync(root, handler);
            try
            {
                var scope = Field<AtomicWorkspaceStore>(window, "store").ScopeId;
                var path = Field<AtomicWorkspaceStore>(window, "store").FilePath;
                var json = "{\"ScopeId\":\"" + scope + "\",\"Schema\":1,\"Drafts\":{\"raw\":\"可以抢救的原始中文 🐟\"},\"Outbox\":[{\"broken\":true}],\"future\":42}";
                await SeedOpaqueHistoryAsync(path, json);
                // Force the real normal open path to inspect the corrupt graph, without automating a
                // startup MessageBox. The independent original reader must remain available afterward.
                typeof(MainWindow).GetField("engine", Private)!.SetValue(window, null);
                try { await InvokeAsync(window, "OpenWorkspaceAsync", "public:unbound"); throw new Exception("normal workspace accepted the broken graph fixture"); }
                catch (InvalidDataException) { }
                var before = await File.ReadAllBytesAsync(path);
                await ClickAsync(window, "本机与恢复"); await ClickAsync(window, "读取历史分区清单（只读）");
                var observed = ObserveReadOnlyHistoryDialogAsync(window, box => Check(NormalizeHistoryVisualText(box.Text) == NormalizeHistoryVisualText(json), "engine-less recovery lost salvageable opaque JSON"), truncated: false);
                await ClickAsync(window, "只读查看 " + scope); await observed;
                Check(Field<SyncEngine?>(window, "engine") == null && Field<AtomicWorkspaceStore?>(window, "store") == null &&
                    Field<string?>(window, "currentIdentity") == null && Field<string?>(window, "failedIdentity") == "public:unbound",
                    "salvage recovery installed a workspace or changed its failed identity");
                // Read failures must leave this same recovery page and original file intact.
                var foreign = json.Replace(scope, new string('d', 64), StringComparison.Ordinal);
                await SeedOpaqueHistoryAsync(path, foreign); var foreignBefore = await File.ReadAllBytesAsync(path);
                await ClickAsync(window, "只读查看 " + scope);
                Check(Field<TextBlock>(window, "status").Text.Contains("ScopeId", StringComparison.Ordinal) &&
                    Field<TextBlock>(window, "heading").Text == "本机与恢复" && Field<SyncEngine?>(window, "engine") == null &&
                    (await File.ReadAllBytesAsync(path)).SequenceEqual(foreignBefore), "wrong-scope failure changed source or selected a workspace");
                await File.WriteAllBytesAsync(path, before);
                using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
                typeof(MainWindow).GetField("actionCancellation", Private)!.SetValue(window, cancellation);
                try
                {
                    try { await InvokeAsync(window, "OpenHistoryPartitionAsync", scope); throw new Exception("pre-cancelled native recovery opened a preview"); }
                    catch (OperationCanceledException) { }
                }
                finally { typeof(MainWindow).GetField("actionCancellation", Private)!.SetValue(window, null); }
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(before) && handler.Calls == 0 && sockets.Connects == 0,
                    "failed or cancelled engine-less recovery changed original or sent a request");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task SeedOpaqueHistoryAsync(string path, string json)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var clear = new UTF8Encoding(false, true).GetBytes(json);
        try
        {
            var cipher = new WindowsProtector().Protect(clear);
            await File.WriteAllBytesAsync(path, "HDYWS1\n"u8.ToArray().Concat(cipher).ToArray());
        }
        finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(clear); }
    }

    private static string NormalizeHistoryVisualText(string text) => text.Replace("\r\n", "\n", StringComparison.Ordinal).Replace('\r', '\n');

    private static Task ObserveReadOnlyHistoryDialogAsync(MainWindow owner, Action<TextBox> inspect, bool truncated)
    {
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var started = DateTimeOffset.UtcNow;
        var timer = new DispatcherTimer(DispatcherPriority.Background, owner.Dispatcher) { Interval = TimeSpan.FromMilliseconds(15) };
        timer.Tick += (_, _) =>
        {
            var dialog = Application.Current.Windows.OfType<Window>().SingleOrDefault(candidate => candidate != owner && candidate.IsVisible && candidate.Owner == owner && candidate.Title == "历史分区原件（只读）");
            if (dialog == null)
            {
                if (DateTimeOffset.UtcNow - started > TimeSpan.FromSeconds(45)) { timer.Stop(); completed.TrySetException(new TimeoutException("The native history preview did not appear.")); }
                return;
            }
            timer.Stop();
            try
            {
                var box = Descendants(dialog).OfType<TextBox>().Single();
                Check(box.Name == "HistorySnapshotPreview" && box.IsReadOnly && box.TextWrapping == TextWrapping.NoWrap &&
                    box.Text.Length <= ReadOnlyWorkspaceRecovery.MaxPreviewCharacters &&
                    (box.Text.Length == 0 || !char.IsHighSurrogate(box.Text[^1])), "native recovery rendered an editable, wrapped, unbounded or surrogate-split document");
                var labels = string.Join("\n", Descendants(dialog).OfType<TextBlock>().Select(x => x.Text));
                Check(labels.Contains("不会导入或发送其队列", StringComparison.Ordinal) && (!truncated || labels.Contains("仅预览", StringComparison.Ordinal)),
                    "native historical original omitted readonly/partial-preview disclosure");
                Check(Descendants(dialog).OfType<Button>().Any(button => button.Content?.ToString() == "导出完整原始 JSON（未加密）"), "native history preview omitted full-original export");
                inspect(box); completed.SetResult();
            }
            catch (Exception error) { completed.SetException(error); }
            finally { dialog.Close(); }
        };
        timer.Start(); return completed.Task;
    }
}
