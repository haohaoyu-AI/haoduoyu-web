using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private EncryptedHistoryArchiveStore OpenHistoryArchiveStore()
    {
        var active = store ?? throw new InvalidOperationException("请先打开可读取的本机工作区，再查看档案。");
        return new EncryptedHistoryArchiveStore(Path.GetDirectoryName(active.FilePath)!, active.ScopeId, protector);
    }

    private async Task HistoryArchivesAsync()
    {
        await FlushEditorAsync(); currentPage = "历史档案"; ClearPage(); heading.Text = "历史档案"; page.Children.Add(heading);
        page.Children.Add(Label("当前身份的加密历史档案。仅归档从未发出、已被替代且不再被引用的旧请求；最新记录、草稿、未决和已尝试/确认的证据继续保留。档案只读，不会导入可执行队列。"));
        page.Children.Add(Label("归档减小活动工作区中的历史正文，档案和备份仍占磁盘；请保全整个身份目录及 history 子目录。Windows 当前用户加密通常不能直接迁往其他用户或电脑。"));
        page.Children.Add(Button("预览可归档历史", PreviewHistoryArchiveAsync));
        var archiveId = new TextBox { MaxLength = 36, ToolTip = "档案文件名中的 UUID；只在当前身份目录内核验" };
        page.Children.Add(Label("可粘贴备份目录中的档案 ID 单独核验；有限扫描不代表其余文件缺失。"));
        page.Children.Add(archiveId);
        page.Children.Add(Button("按档案 ID 只读核验", () => OpenHistoryArchiveByIdAsync(archiveId.Text)));
        var target = Engine; var identity = currentIdentity; var archives = OpenHistoryArchiveStore();
        var files = (await Task.Run(() => archives.ListAsync(NetworkToken))).ToList();
        if (!ReferenceEquals(target, engine) || currentIdentity != identity) throw new InvalidOperationException("工作区已变化，本次档案列表未用于其他身份。");
        var references = target.Snapshot.HistoryArchives.ToDictionary(reference => reference.Id, StringComparer.Ordinal);
        foreach (var reference in references.Values)
            if (files.All(file => file.Id != reference.Id)) files.Add(new HistoryArchiveFile
            { Id = reference.Id, FileName = reference.FileName, Bytes = reference.Bytes });
        List(files.Select(file =>
        {
            var known = file.Id != null && references.TryGetValue(file.Id, out var reference) ? reference : null;
            var title = known == null ? "未登记档案 · " + file.FileName : "历史档案 · " + known.Count + " 条 · " + known.Id[..8];
            var subtitle = file.Error ?? (known == null ? "只读核对来源后可查看；不自动导入或删除" : known.CreatedAt.ToLocalTime().ToString("g") + " · 已登记") + " · " + ByteSize(file.Bytes);
            return (title, subtitle, (Func<Task>)(async () =>
            {
                if (file.Id == null) { ShowText("档案文件保留", file.FileName + "\n\n" + file.Error); return; }
                var result = known == null
                    ? await Task.Run(() => archives.ReadUnindexedAsync(file.Id, NetworkToken))
                    : new HistoryArchiveReadResult { Reference = known, Document = await Task.Run(() => archives.ReadAsync(known, NetworkToken)) };
                await ShowHistoryArchiveAsync(result.Reference, result.Document);
            }));
        }));
    }

    private async Task OpenHistoryArchiveByIdAsync(string input)
    {
        if (!Guid.TryParseExact(input.Trim(), "D", out var id) || id == Guid.Empty)
            throw new InvalidOperationException("请输入档案文件名中的完整 UUID，不填写目录或文件路径。");
        var canonical = id.ToString("D"); var archives = OpenHistoryArchiveStore();
        var known = Engine.Snapshot.HistoryArchives.SingleOrDefault(reference => reference.Id == canonical);
        var result = known == null
            ? await Task.Run(() => archives.ReadUnindexedAsync(canonical, NetworkToken))
            : new HistoryArchiveReadResult { Reference = known, Document = await Task.Run(() => archives.ReadAsync(known, NetworkToken)) };
        await ShowHistoryArchiveAsync(result.Reference, result.Document);
    }

    private async Task PreviewHistoryArchiveAsync()
    {
        await FlushEditorAsync(); currentPage = "历史档案"; ClearPage(); heading.Text = "归档计划"; page.Children.Add(heading);
        var target = Engine; var identity = currentIdentity;
        var plan = await Task.Run(() => target.CreateHistoryArchivePlan());
        NetworkToken.ThrowIfCancellationRequested();
        if (!ReferenceEquals(target, engine) || currentIdentity != identity) throw new InvalidOperationException("工作区已变化，归档计划未生效。");
        page.Children.Add(Label($"本轮可归档 {plan.CandidateIds.Count} 条旧历史，编码正文与元数据约 {ByteSize(plan.EncodedBytes)}。本轮之外的全部记录保留。"));
        page.Children.Add(Label("只移出从未发出、已被替代的旧请求。当前稿、未决请求、已尝试/确认的记录、最新历史和依赖证据均不移出。所有原始内容会先完整写入独立加密档案并读回核验。"));
        page.Children.Add(Label("首次归档会升级当前工作区格式，旧版候选将停止读取/写入该工作区；请使用新版继续。原主文件通过正常备份保留。档案与备份使磁盘总占用可能增加。"));
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("返回历史档案", HistoryArchivesAsync));
        if (plan.CandidateIds.Count == 0) { page.Children.Add(Label("当前没有可安全移出的旧历史，不会改变工作区格式或创建空档案。")); return; }
        actionsBar.Children.Add(Button("确认归档此计划", async () =>
        {
            if (!Confirm($"将这 {plan.CandidateIds.Count} 条已审阅的旧历史移入当前身份的加密档案？写入并核验成功后才缩减活动正文，操作ID索引保留；工作区格式将升级，旧版不能继续写入。")) return;
            await ArchiveHistoryConfirmedAsync(plan);
        }));
        var selected = plan.CandidateIds.ToHashSet(StringComparer.Ordinal);
        List(target.Snapshot.Outbox.Where(operation => selected.Contains(operation.Id)).Select(operation =>
            (ArchiveOperationTitle(operation), "从未发出 · 已替代 · " + operation.Id, (Func<Task>)(() =>
            { ShowText("归档前的原始历史（只读）", ArchiveOperationText(operation)); return Task.CompletedTask; }))));
    }

    // Same post-confirmation body as the real button. Revalidation and commit occur inside the engine gate.
    private async Task ArchiveHistoryConfirmedAsync(HistoryArchivePlan plan)
    {
        await FlushEditorAsync();
        var target = Engine; var identity = currentIdentity; var archives = OpenHistoryArchiveStore();
        var reference = await Task.Run(() => target.ArchiveSupersededHistoryAsync(plan, archives, NetworkToken));
        if (!ReferenceEquals(target, engine) || currentIdentity != identity) throw new InvalidOperationException("原身份归档步骤已结束，未显示到其他工作区。");
        await HistoryArchivesAsync();
        Message(reference == null ? "当前没有可归档历史，原工作区保留。" : $"已将 {reference.Count} 条旧历史保存为独立加密档案，并缩减活动工作区正文。当前资料与未决请求保留。");
    }

    private async Task ShowHistoryArchiveAsync(HistoryArchiveReference reference, HistoryArchiveDocument document)
    {
        await FlushEditorAsync(); currentPage = "历史档案"; ClearPage(); heading.Text = "加密历史档案"; page.Children.Add(heading);
        page.Children.Add(Label($"已核验当前身份、加密文件完整性与 {document.Operations.Count} 条历史原文。此页只读，不会重试、恢复或重新排队这些请求。"));
        page.Children.Add(Label(reference.CreatedAt.ToLocalTime().ToString("g") + " · " + reference.Id + " · " + ByteSize(reference.Bytes)));
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("返回历史档案", HistoryArchivesAsync));
        actionsBar.Children.Add(Button("导出此档案明文副本", () => ExportTextAsync("好多鱼历史档案.txt", JsonSerializer.Serialize(document, new JsonSerializerOptions { WriteIndented = true }))));
        List(document.Operations.Select(operation => (ArchiveOperationTitle(operation), "只读历史 · " + operation.Id,
            (Func<Task>)(() => { ShowText("历史原件（只读，不会发送）", ArchiveOperationText(operation)); return Task.CompletedTask; }))));
    }

    private static string ArchiveOperationTitle(PendingOperation operation)
    {
        try
        {
            var body = JsonNode.Parse(operation.BodyJson);
            var text = Text(body, "title"); if (text.Length == 0) text = Text(body, "text");
            if (text.Length == 0) text = Text(body, "summary");
            if (text.Length > 0) return string.Concat(text.EnumerateRunes().Take(80).Select(rune => rune.ToString()));
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException) { }
        return operation.Method + " " + operation.Path;
    }
    private static string ArchiveOperationText(PendingOperation operation) =>
        "历史请求（从未发出，已被替代）\n" + operation.Method + " " + operation.Path + "\n\n" + operation.BodyJson +
        "\n\n完整元数据\n" + JsonSerializer.Serialize(operation, new JsonSerializerOptions { WriteIndented = true });
    private static string ByteSize(long bytes) => bytes >= 1024 * 1024 ? (bytes / (1024d * 1024)).ToString("0.##") + " MiB" : bytes >= 1024 ? (bytes / 1024d).ToString("0.##") + " KiB" : bytes + " B";
}
