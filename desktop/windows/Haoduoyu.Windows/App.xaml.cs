using System.Windows;

namespace Haoduoyu.Windows;

public partial class App : Application
{
    private Mutex? instance;
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        instance = new Mutex(true, "Local\\Haoduoyu.NativeWorkbench.v1", out var first);
        if (!first)
        {
            MessageBox.Show("好多鱼独立工作台已运行。请返回已打开的窗口。", "好多鱼");
            Shutdown();
            return;
        }
        var window = new MainWindow();
        MainWindow = window;
        window.Show();
    }
    protected override void OnExit(ExitEventArgs e) { instance?.Dispose(); base.OnExit(e); }
}
