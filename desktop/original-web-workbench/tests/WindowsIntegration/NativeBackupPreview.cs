using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows.Controls;
using System.Windows.Interop;
using Haoduoyu.OriginalUi;
using Haoduoyu.OriginalUi.Policy;

internal static class NativeBackupPreview
{
    internal static async Task Verify(OriginalUiWindow owner, string root, string phase)
    {
        var input=Path.Combine(AppContext.BaseDirectory,"backup-fixtures","valid.json");
        var before=SHA256.HashData(await File.ReadAllBytesAsync(input));
        var result=await BackupPreview.InspectFileAsync(input);
        for(var attempt=0;attempt<2;attempt++)
        {
            var preview=new BackupPreviewWindow(owner,result); preview.Show(); await Task.Delay(350);
            try
            {
                if(!preview.IsVisible || !ReferenceEquals(preview.Owner,owner) || preview.Content is not DockPanel panel)
                    throw new InvalidOperationException("Native read-only preview did not show.");
                var summary=panel.Children.OfType<TextBox>().Single().Text;
                if(!summary.Contains("没有导入、恢复、同步、覆盖或清空任何数据。",StringComparison.Ordinal) || !summary.Contains(result.PayloadSha256,StringComparison.Ordinal)
                    || summary.Contains("SYNTHETIC",StringComparison.Ordinal) || summary.Contains("password_hash",StringComparison.Ordinal)
                    || summary.Contains("token_hash",StringComparison.Ordinal))
                    throw new InvalidOperationException("Preview lacks its read-only disclosure or leaked a synthetic source value.");
                if(attempt==0) WindowControls.CaptureFrame(new WindowInteropHelper(preview).Handle,Path.Combine(root,phase+"-backup-preview-frame.png"));
            }
            finally {preview.Close();}
            if(preview.IsVisible) throw new InvalidOperationException("Read-only preview failed to close.");
        }
        var after=SHA256.HashData(await File.ReadAllBytesAsync(input));
        if(!before.SequenceEqual(after)) throw new InvalidOperationException("Preview changed its synthetic input.");
        File.WriteAllText(Path.Combine(root,phase+"-backup-preview-result.json"),JsonSerializer.Serialize(new {
            passed=true,source="synthetic v9 fixture only",canImport=result.CanImport,shownAndClosedTwice=true,
            noSourceValuesInUI=true,inputUnchanged=true,checksumMatched=true,
            scope="Native aggregate preview only; file-picker interaction, import and real user data not tested."
        }));
        Console.WriteLine("PASS actual native read-only backup summary; repeated open/close; no source values; input unchanged");
    }
}
