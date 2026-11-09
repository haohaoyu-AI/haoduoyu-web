using System.Text;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.OriginalUi.Policy;
using Microsoft.Win32;

namespace Haoduoyu.OriginalUi;

/// <summary>Native summary only. No WebView, database adapter, import or export operation.</summary>
internal sealed class BackupPreviewWindow : Window
{
    private readonly TextBox summary = new() { IsReadOnly=true, TextWrapping=TextWrapping.Wrap,
        VerticalScrollBarVisibility=ScrollBarVisibility.Auto, Margin=new Thickness(16), FontSize=14 };
    private readonly Button choose = new() { Content="选择本地 JSON 备份（只读检查）", Margin=new Thickness(16, 12, 16, 0), Padding=new Thickness(12, 6, 12, 6) };
    private readonly CancellationTokenSource cancellation = new();
    private bool busy;

    internal BackupPreviewWindow(Window owner, BackupPreviewResult? initialPreview = null)
    {
        Owner=owner; Title="备份检查 · 仅预览，不导入"; ShowInTaskbar=false;
        WindowStyle=WindowStyle.SingleBorderWindow; ResizeMode=ResizeMode.CanResize;
        WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var area=SystemParameters.WorkArea;
        var fit=StartupWindowBounds.Fit(area.Left, area.Top, area.Width, area.Height);
        Width=Math.Min(680, fit.Width);
        Height=Math.Min(620, fit.Height);
        MinWidth=Math.Min(340, Width); MinHeight=Math.Min(260, Height);
        var layout = new DockPanel(); DockPanel.SetDock(choose, Dock.Top); layout.Children.Add(choose); layout.Children.Add(summary);
        Content=layout;
        summary.Text="选择本地备份后，仅检查文件格式、校验和、表结构、记录标识及基本关联，并显示数量。\n\n" +
            "未导入、未恢复、未同步；不会写入或清空现有本机数据库，也不会上传文件。\n\n" +
            "当前仅支持经过核对的网站 v9 JSON 备份，不把 CSV、旧原生版数据库或其他版本当作兼容格式。\n\n" +
            "校验和不证明来源真实、数据完整或已获授权。请勿为了检查而上传或分享包含凭证的完整备份。";
        if (initialPreview is not null) summary.Text=Format(initialPreview);
        choose.Click += async (_, _) => await SelectAsync();
        Closed += (_, _) => cancellation.Cancel();
    }

    private async Task SelectAsync()
    {
        if (busy) return;
        var picker = new OpenFileDialog { Title="选择本地网站备份，仅只读检查", Filter="JSON 备份 (*.json)|*.json",
            Multiselect=false, CheckFileExists=true, CheckPathExists=true, ValidateNames=true, AddToRecent=false };
        if (picker.ShowDialog(this) != true) return; // Cancel retains the preceding summary and all data.
        busy=true; choose.IsEnabled=false; summary.Text="正在只读检查。没有导入或修改数据。";
        try
        {
            var result = await Task.Run(() => BackupPreview.InspectFileAsync(picker.FileName, cancellation.Token), cancellation.Token);
            if (cancellation.IsCancellationRequested) return;
            summary.Text=Format(result);
        }
        catch (OperationCanceledException) { /* Closing the preview never authorizes another operation. */ }
        catch { if (!cancellation.IsCancellationRequested) summary.Text="未通过检查或无法安全读取。请保留原文件和本机数据，核对文件是否是支持的网站 v9 JSON 备份。\n\n没有导入、覆盖、清空或上传任何记录。"; }
        finally { busy=false; if (!cancellation.IsCancellationRequested) choose.IsEnabled=true; }
    }

    internal static string Format(BackupPreviewResult result)
    {
        var text = new StringBuilder("只读结构检查通过；不是可导入或恢复完成的证明。\n\n");
        text.AppendLine("格式：" + result.Format).AppendLine("导出时间：" + result.ExportedAt)
            .AppendLine("源数据修订号：" + result.SourceRevision).AppendLine("备份内身份数量：" + result.OwnerCount)
            .AppendLine("来源、导出范围与所属关系尚未独立核实。修订号不是软件版本。")
            .AppendLine("校验和一致，但不证明来源真实，也不证明包含全部数据。")
            .AppendLine().AppendLine("记录数量（只读，未与现有本机数据比较）：");
        foreach (var table in result.Tables)
        {
            text.Append(table.Name).Append("：").Append(table.Count);
            if (table.DeletedCount is int count) text.Append("（含删除标记 ").Append(count).Append('）');
            if (table.ExcludedFromFutureImport) text.Append("［安全或历史信息，不作为业务导入数据］");
            text.AppendLine();
        }
        text.AppendLine().AppendLine("文件 SHA-256：").AppendLine(result.FileSha256)
            .AppendLine("备份数据 SHA-256：").AppendLine(result.PayloadSha256)
            .AppendLine().AppendLine("没有显示用户名、正文、密码或令牌散列、审计明细或旧请求响应。")
            .AppendLine("没有导入、恢复、同步、覆盖或清空任何数据。");
        return text.ToString();
    }
}
