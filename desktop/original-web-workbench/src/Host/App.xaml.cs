using System.IO;
using System.Reflection;
using System.Windows;
using Haoduoyu.OriginalUi.Policy;

namespace Haoduoyu.OriginalUi;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        // No command line URL, profile override, remote content or installer entry points.
        try
        {
            using var manifest = Assembly.GetExecutingAssembly().GetManifestResourceStream("HostAssetManifest")
                ?? throw new InvalidDataException("此版本尚未装入经过核验的网页资源。请使用完整的离线构建包。");
            using var buffer = new MemoryStream(); manifest.CopyTo(buffer);
            var assets = AssetCatalog.Load(Path.Combine(AppContext.BaseDirectory, "site"), buffer.ToArray());
            var profile = FileSystemTrust.PrepareProfile(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
            var window = new OriginalUiWindow(assets, profile);
            MainWindow = window; window.Show();
        }
        catch (Exception ex)
        {
            MessageBox.Show("无法启动本机网页工作台。未删除或重置任何已有数据。\n\n" + ex.Message,
                "好多鱼 · 本机网页工作台", MessageBoxButton.OK, MessageBoxImage.Error);
            Shutdown(1);
        }
    }
}
