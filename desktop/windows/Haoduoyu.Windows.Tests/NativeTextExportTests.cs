using System.IO;
using System.Text;
using System.Windows.Controls;
using Haoduoyu.Windows;

namespace Haoduoyu.Windows.Tests;

internal static partial class NativeWorkflowTests
{
    private static IReadOnlyList<(string Name, Action Run)> TextExportCases =>
    [
        ("Shown native text export atomically replaces a chosen synthetic file without changing workspace or sending requests", () => RunWithDispatcher(NativeTextExportAsync)),
        ("Shown native export preserves the old target and editable text after encoding failure or cancellation", () => RunWithDispatcher(NativeTextExportFailureAsync))
    ];

    private static async Task NativeTextExportAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin();
            var window = await ShowAsync(root, handler);
            try
            {
                await ClickAsync(window, "生活记录");
                var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
                await InvokeAsync(window, "EditAsync", "note", Object(("id", id), ("version", 0), ("category", "life"), ("date", Day), ("text", "")), key);
                const string text = "  合成导出 🐟\r\n原换行\nTAB\t组合 e\u0301。  ";
                BodyEditor(window).Text = text;
                var editorBefore = BodyEditor(window).Text;
                await ClickAsync(window, "保存本机草稿");
                var before = System.Text.Json.JsonSerializer.Serialize(Engine(window).Snapshot);
                var path = Path.Combine(root, "selected-export.txt");
                await File.WriteAllTextAsync(path, "已存在且应完整保留直到提交的旧副本", new UTF8Encoding(false, true));
                // Exercise the exact writer invoked after SaveFileDialog accepts a path.
                // The Windows file picker and its overwrite confirmation are not automated here.
                await InvokeAsync(window, "ExportTextToPathAsync", path, text);
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(new UTF8Encoding(false, true).GetBytes(text)), "native export changed Unicode whitespace line separators or inserted a BOM");
                Check(System.Text.Json.JsonSerializer.Serialize(Engine(window).Snapshot) == before && BodyEditor(window).Text == editorBefore,
                    "successful export changed workspace state or the open editor");
                Check(Field<TextBlock>(window, "status").Text.Contains("已完整导出", StringComparison.Ordinal), "export did not report completion after atomic commit");
                Check(handler.Calls == 0 && sockets.Connects == 0, "local text export contacted the service");
                await InvokeAsync(window, "ExportTextToPathAsync", path, "");
                Check(new FileInfo(path).Length == 0, "explicit empty export was replaced with old content");
                Check(Directory.GetFiles(root).All(file => !file.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)), "successful export left a plaintext temporary file");
            }
            finally { await CloseIfOpenAsync(window); }
        });
    }

    private static async Task NativeTextExportFailureAsync()
    {
        await WithDirectoryAsync(async root =>
        {
            using var sockets = new SocketProbe(); using var handler = new SyntheticOrigin();
            var window = await ShowAsync(root, handler);
            Func<Task>? saver = null;
            try
            {
                await ClickAsync(window, "生活记录");
                var id = Guid.NewGuid().ToString(); var key = "/api/v1/note-entries/" + id;
                await InvokeAsync(window, "EditAsync", "note", Object(("id", id), ("version", 0), ("category", "life"), ("date", Day), ("text", "")), key);
                const string text = "工作区保存失败时仍要能导出的中文原稿。";
                BodyEditor(window).Text = text;
                saver = Field<Func<Task>>(window, "saveEditor");
                typeof(MainWindow).GetField("saveEditor", Private)!.SetValue(window, (Func<Task>)(() => throw new IOException("synthetic encrypted workspace disk failure")));
                var path = Path.Combine(root, "recovery-export.txt");
                // Export must remain a recovery route even when the normal draft writer fails.
                await InvokeAsync(window, "ExportTextToPathAsync", path, text);
                Check(await File.ReadAllTextAsync(path, new UTF8Encoding(false, true)) == text && Field<bool>(window, "draftDirty"),
                    "export depended on a successful workspace flush or falsely cleared the dirty editor");
                typeof(MainWindow).GetField("saveEditor", Private)!.SetValue(window, saver);
                var before = await File.ReadAllBytesAsync(path);
                try { await InvokeAsync(window, "ExportTextToPathAsync", path, "invalid \ud800"); throw new Exception("unpaired UTF-16 was silently exported"); }
                catch (EncoderFallbackException) { }
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(before) && BodyEditor(window).Text == text, "encoding failure damaged the previous target or editor");
                using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
                typeof(MainWindow).GetField("actionCancellation", Private)!.SetValue(window, cancellation);
                try
                {
                    try { await InvokeAsync(window, "ExportTextToPathAsync", path, "不应替换旧文件"); throw new Exception("cancelled export completed"); }
                    catch (OperationCanceledException) { }
                }
                finally { typeof(MainWindow).GetField("actionCancellation", Private)!.SetValue(window, null); }
                Check((await File.ReadAllBytesAsync(path)).SequenceEqual(before) && BodyEditor(window).Text == text && handler.Calls == 0 && sockets.Connects == 0,
                    "cancelled export altered original bytes editor or sent HTTP");
                await ClickAsync(window, "保存本机草稿");
                Check(DraftText(Engine(window).Snapshot, key) == text, "export failure prevented subsequent normal draft saving");
                Check(Directory.GetFiles(root).All(file => !file.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)), "failed export left an unreported plaintext temporary file");
            }
            finally
            {
                if (saver != null && window.IsVisible) typeof(MainWindow).GetField("saveEditor", Private)!.SetValue(window, saver);
                typeof(MainWindow).GetField("actionCancellation", Private)!.SetValue(window, null);
                await CloseIfOpenAsync(window);
            }
        });
    }
}
