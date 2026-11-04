using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Data;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private EncryptedLedgerViewStore? articleLedgerPreferenceStore;
    private LedgerViewSnapshot? articleLedgerPreferenceSnapshot;
    private string? articleLedgerPreferenceIdentity, articleLedgerPreferenceScope, articleLedgerPreferenceError;
    private long articleLedgerPresentationEpoch;

    private void ResetArticleLedgerPreferences()
    {
        articleLedgerPreferenceStore = null; articleLedgerPreferenceSnapshot = null;
        articleLedgerPreferenceIdentity = null; articleLedgerPreferenceScope = null; articleLedgerPreferenceError = null;
        articleLedgerPresentationEpoch = checked(articleLedgerPresentationEpoch + 1);
    }

    private static bool LedgerPreferenceFailure(Exception error) => error is IOException or InvalidDataException or
        UnauthorizedAccessException or CryptographicException or JsonException or ArgumentException;

    private async Task LoadArticleLedgerPreferencesAsync(string? identity, string scope)
    {
        if (articleLedgerPreferenceIdentity == identity && articleLedgerPreferenceScope == scope && articleLedgerPreferenceStore is not null) return;
        var target = Engine; var workspace = store ?? throw new InvalidOperationException("本机工作区尚未打开。");
        EncryptedLedgerViewStore? localStore = null;
        LedgerViewSnapshot? snapshot = null; string? failure = null;
        try
        {
            localStore = new EncryptedLedgerViewStore(Path.GetDirectoryName(workspace.FilePath)!, scope, protector);
            snapshot = await Task.Run(localStore.Read);
        }
        catch (Exception error) when (LedgerPreferenceFailure(error))
        { failure = "本机视图配置未读取；当前仅使用临时默认布局，原配置与备份保留。"; }
        EnsureArticleLedgerOwner(identity, scope);
        if (!ReferenceEquals(target, engine) || !ReferenceEquals(workspace, store))
            throw new InvalidOperationException("工作区已切换，本次视图配置未绑定到新工作区。");
        articleLedgerPreferenceStore = localStore; articleLedgerPreferenceSnapshot = snapshot;
        articleLedgerPreferenceIdentity = identity; articleLedgerPreferenceScope = scope; articleLedgerPreferenceError = failure;
    }

    private LedgerViewPreferences CurrentLedgerPreferences => articleLedgerPreferenceSnapshot?.Preferences ?? new LedgerViewPreferences();

    private void RenderArticleLedgerViewControls(string? identity, string scope, Action redraw)
    {
        var target = Engine; var workspace = store ?? throw new InvalidOperationException("本机工作区尚未打开。");
        var localStore = articleLedgerPreferenceStore;
        var epoch = articleLedgerPresentationEpoch = checked(articleLedgerPresentationEpoch + 1);
        void Guard()
        {
            EnsureArticleLedgerOwner(identity, scope);
            if (!ReferenceEquals(target, engine) || !ReferenceEquals(workspace, store) || !ReferenceEquals(localStore, articleLedgerPreferenceStore) || epoch != articleLedgerPresentationEpoch)
                throw new InvalidOperationException("此视图控件所属页面或工作区已变化，请回到当前台账操作。");
        }
        var body = new StackPanel();
        var expander = new Expander { Header = "本机视图与表格设置", Content = body, IsExpanded = false, Margin = new Thickness(0, 8, 0, 12) };
        AutomationProperties.SetAutomationId(expander, "article-ledger-view-settings"); page.Children.Add(expander);
        var storageStatus = Label(""); AutomationProperties.SetAutomationId(storageStatus, "article-ledger-view-storage"); body.Children.Add(storageStatus);
        var commands = new StackPanel(); body.Children.Add(commands);
        commands.Children.Add(Label("先应用筛选，再保存当前视图。保存内容包括已应用的筛选、状态、排序、每页条数和已应用列布局；不保存页码或联网来源，也不改业务记录。"));
        var views = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", MinWidth = 260 };
        AutomationProperties.SetAutomationId(views, "article-ledger-view-select"); commands.Children.Add(views);
        var name = new TextBox { MaxLength = 240, ToolTip = "视图名称最多60个字符，仅在当前工作区保存。" };
        AutomationProperties.SetAutomationId(name, "article-ledger-view-name"); commands.Children.Add(Label("视图名称")); commands.Children.Add(name);
        var viewButtons = new WrapPanel(); commands.Children.Add(viewButtons);
        var layouts = new Expander { Header = "列的显示、顺序与宽度", IsExpanded = false };
        var layoutBody = new StackPanel(); layouts.Content = layoutBody; commands.Children.Add(layouts);
        var columns = new ListBox { Height = 240, MinHeight = 120, SelectionMode = SelectionMode.Single };
        AutomationProperties.SetAutomationId(columns, "article-ledger-columns"); layoutBody.Children.Add(columns);
        var editors = new Dictionary<string, (CheckBox Visible, TextBox Width)>(StringComparer.Ordinal);
        var columnButtons = new WrapPanel(); layoutBody.Children.Add(columnButtons);
        var grouping = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", ItemsSource = new[]
        { new KeyValuePair<string, string>("none", "不分组（保留当前页顺序）"), new("account", "按运营账号分组（仅当前页）") } };
        AutomationProperties.SetAutomationId(grouping, "article-ledger-group"); layoutBody.Children.Add(grouping);
        layoutBody.Children.Add(Label("分组只整理当前筛选页，组内保留原顺序；本页条数不是全台账总量。拖动表头边界仅调整当前显示，点击“记录当前列宽”才会保存。"));
        var layoutButtons = new WrapPanel(); layoutBody.Children.Add(layoutButtons);
        void UpdateStorageStatus(string? saved = null)
        {
            commands.IsEnabled = articleLedgerPreferenceSnapshot is not null && articleLedgerPreferenceError is null;
            storageStatus.Text = articleLedgerPreferenceError ?? saved ?? "本机视图配置 · 当前身份独立加密保存，不同步到网站或其他账号。";
        }
        string? SelectedId() => views.SelectedValue as string;
        SavedLedgerView SelectedView() => CurrentLedgerPreferences.Views.SingleOrDefault(view => view.Id == SelectedId())
            ?? throw new InvalidOperationException("请先选择当前工作区中已保存的视图。");
        void RefreshViews(string? selected = null)
        {
            var previous = selected ?? SelectedId();
            views.ItemsSource = CurrentLedgerPreferences.Views.Select(view => new KeyValuePair<string, string>(view.Id, view.Name)).ToArray();
            views.SelectedValue = CurrentLedgerPreferences.Views.Any(view => view.Id == previous) ? previous : null;
        }
        void RefreshLayout()
        {
            var layout = CurrentLedgerPreferences.Layout;
            columns.Items.Clear(); editors.Clear();
            var active = layout.Columns.ToDictionary(column => column.Key, StringComparer.Ordinal);
            var ordered = layout.Columns.Select(column => column.Key).Concat(ArticleLedgerViews.ColumnCatalog.Where(column => !active.ContainsKey(column.Key)).Select(column => column.Key));
            foreach (var key in ordered)
            {
                var definition = ArticleLedgerViews.ColumnCatalog.Single(column => column.Key == key);
                var line = new StackPanel { Orientation = Orientation.Horizontal };
                var visible = new CheckBox { Content = definition.Label, IsChecked = active.ContainsKey(key), IsEnabled = key != "title", Width = 250, VerticalAlignment = VerticalAlignment.Center };
                var width = new TextBox { Width = 100, Text = (active.GetValueOrDefault(key)?.Width ?? definition.DefaultWidth).ToString("0.##", CultureInfo.InvariantCulture), Margin = new Thickness(4, 0, 4, 0) };
                AutomationProperties.SetAutomationId(visible, "article-ledger-column-visible-" + key); AutomationProperties.SetAutomationId(width, "article-ledger-column-width-" + key);
                line.Children.Add(visible); line.Children.Add(width); line.Children.Add(Label("像素（64–1200）"));
                columns.Items.Add(new ListBoxItem { Tag = key, Content = line }); editors[key] = (visible, width);
            }
            grouping.SelectedValue = layout.GroupBy;
        }
        views.SelectionChanged += (_, _) => { if (CurrentLedgerPreferences.Views.SingleOrDefault(view => view.Id == SelectedId()) is { } selected) name.Text = selected.Name; };
        async Task Persist(LedgerViewPreferences candidate, string? selected = null)
        {
            Guard();
            var previous = articleLedgerPreferenceSnapshot ?? throw new InvalidOperationException("视图配置尚未安全读取，原文件保留。");
            LedgerViewSnapshot saved;
            try { saved = await Task.Run(() => localStore!.Write(candidate, previous.ETag)); }
            catch (Exception error) when (LedgerPreferenceFailure(error))
            {
                Guard(); articleLedgerPreferenceError = "本机视图配置保存未完成，原配置保留；请重新读取后再操作。";
                UpdateStorageStatus(); throw;
            }
            Guard(); articleLedgerPreferenceSnapshot = saved; articleLedgerPreferenceError = null;
            RefreshViews(selected); RefreshLayout(); redraw(); UpdateStorageStatus("本机视图配置已保存 · 未改动业务记录或发送请求。");
        }
        IReadOnlyDictionary<string, string> AppliedQuery() => ArticleLedgerViews.NormalizeQuery(ArticleLedgerSelection(pageNumber: 1).Values
            .Where(pair => pair.Key != "page").ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal));
        Button Action(string label, string id, Func<Task> action)
        { var button = Button(label, action); AutomationProperties.SetAutomationId(button, id); return button; }
        viewButtons.Children.Add(Action("保存新视图", "article-ledger-view-save-new", async () =>
        {
            Guard(); var previousIds = CurrentLedgerPreferences.Views.Select(view => view.Id).ToHashSet(StringComparer.Ordinal);
            var candidate = ArticleLedgerViews.SaveView(CurrentLedgerPreferences, name.Text, AppliedQuery(), CurrentLedgerPreferences.Layout);
            await Persist(candidate, candidate.Views.Single(view => !previousIds.Contains(view.Id)).Id);
        }));
        viewButtons.Children.Add(Action("更新所选视图", "article-ledger-view-update", async () =>
        { Guard(); var selected = SelectedView(); await Persist(ArticleLedgerViews.SaveView(CurrentLedgerPreferences, name.Text, AppliedQuery(), CurrentLedgerPreferences.Layout, selected.Id), selected.Id); }));
        viewButtons.Children.Add(Action("删除所选视图", "article-ledger-view-delete", async () =>
        { Guard(); var selected = SelectedView(); await Persist(ArticleLedgerViews.DeleteView(CurrentLedgerPreferences, selected.Id)); views.SelectedValue = null; name.Text = ""; }));
        viewButtons.Children.Add(Action("应用所选视图", "article-ledger-view-apply", async () =>
        {
            Guard(); var selected = SelectedView(); var normalized = ArticleLedgerViews.NormalizeQuery(selected.Query);
            var values = normalized.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal); values["page"] = "1";
            var query = ArticleLedgerQuery.Parse(values);
            await Persist(ArticleLedgerViews.WithLayout(CurrentLedgerPreferences, selected.Layout), selected.Id);
            Guard(); articleStatus = query.Status; articlePage = 1; articleLedgerPageSize = query.PageSize ?? 50;
            articleLedgerFilters = normalized.Where(pair => pair.Key is not ("status" or "page_size")).ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
            await NavigateAsync("文章台账");
        }));
        void MoveColumn(int movement)
        {
            Guard(); var index = columns.SelectedIndex; var next = index + movement;
            if (index < 0 || next < 0 || next >= columns.Items.Count) return;
            var item = columns.Items[index]; columns.Items.RemoveAt(index); columns.Items.Insert(next, item); columns.SelectedIndex = next;
        }
        columnButtons.Children.Add(Action("上移所选列", "article-ledger-column-up", () => { MoveColumn(-1); return Task.CompletedTask; }));
        columnButtons.Children.Add(Action("下移所选列", "article-ledger-column-down", () => { MoveColumn(1); return Task.CompletedTask; }));
        layoutButtons.Children.Add(Action("应用列与分组", "article-ledger-layout-apply", async () =>
        {
            Guard();
            var selected = columns.Items.Cast<ListBoxItem>().Select(item => (string)item.Tag).Where(key => editors[key].Visible.IsChecked == true)
                .Select(key => new LedgerColumn(key, double.Parse(editors[key].Width.Text, NumberStyles.Float, CultureInfo.InvariantCulture))).ToArray();
            await Persist(ArticleLedgerViews.WithLayout(CurrentLedgerPreferences, new LedgerLayout { GroupBy = grouping.SelectedValue?.ToString() ?? "none", Columns = selected }));
        }));
        layoutButtons.Children.Add(Action("记录当前列宽", "article-ledger-widths-save", async () =>
        {
            Guard();
            var table = FindLedgerTable(); var grid = table?.View as GridView ?? throw new InvalidOperationException("当前页尚无可记录列宽的台账表格。");
            var widths = grid.Columns.ToDictionary(column => ((GridViewColumnHeader)column.Header).Tag.ToString()!, column => Math.Clamp(column.ActualWidth, 64, 1200), StringComparer.Ordinal);
            var layout = CurrentLedgerPreferences.Layout;
            var updated = layout with { Columns = layout.Columns.Select(column => column with { Width = widths.GetValueOrDefault(column.Key, column.Width) }).ToArray() };
            await Persist(ArticleLedgerViews.WithLayout(CurrentLedgerPreferences, updated));
        }));
        layoutButtons.Children.Add(Action("恢复默认列布局", "article-ledger-layout-reset", () =>
        { Guard(); return Persist(ArticleLedgerViews.WithLayout(CurrentLedgerPreferences, ArticleLedgerViews.DefaultLayout())); }));
        async Task ReadPreferences(bool restore)
        {
            Guard();
            LedgerViewSnapshot result;
            try { result = await Task.Run(() => restore ? localStore!.RestoreBackup() : localStore!.Read()); }
            catch (Exception error) when (LedgerPreferenceFailure(error))
            {
                Guard(); articleLedgerPreferenceSnapshot = null;
                articleLedgerPreferenceError = "本机视图配置未读取；当前仅使用临时默认布局，原配置与备份保留。";
                RefreshViews(); RefreshLayout(); redraw(); UpdateStorageStatus(); throw;
            }
            Guard(); articleLedgerPreferenceSnapshot = result; articleLedgerPreferenceError = null;
            RefreshViews(); RefreshLayout(); redraw();
            UpdateStorageStatus(restore ? "本机视图配置备份已恢复；原配置已保留，业务工作区未改变。" : "已重新读取当前工作区的本机视图配置。");
        }
        var recovery = new WrapPanel { IsEnabled = localStore is not null }; body.Children.Add(recovery);
        recovery.Children.Add(Action("重新读取视图配置", "article-ledger-views-reload", async () =>
        {
            await ReadPreferences(false);
        }));
        recovery.Children.Add(Action("恢复视图配置备份", "article-ledger-views-restore", async () =>
        {
            await ReadPreferences(true);
        }));
        if (localStore is null) body.Children.Add(Label("本机视图配置路径不可用；请修复该独立配置路径后重新打开台账。当前临时布局尚未保存，业务工作区仍可正常查看。"));
        RefreshViews(); RefreshLayout(); UpdateStorageStatus();
    }

    private ListView? FindLedgerTable() => page.Children.OfType<StackPanel>().SelectMany(host => host.Children.OfType<ListView>())
        .SingleOrDefault(list => AutomationProperties.GetAutomationId(list) == "article-ledger-table");

    private void RenderArticleLedgerTable(StackPanel host, IReadOnlyList<JsonObject> rows, string? identity, string scope)
    {
        EnsureArticleLedgerOwner(identity, scope); host.Children.Clear();
        var layout = CurrentLedgerPreferences.Layout;
        var items = rows.Select(row => new WorkspaceListItem(Text(row, "title"), ArticleLedgerSubtitle(row), () => OpenArticleLedgerRowAsync(row, identity, scope))
        { LedgerCells = ArticleLedgerViews.Cells(row), LedgerGroup = ArticleLedgerViews.AccountGroupKey(row) }).ToArray();
        var list = new ListView { Height = 360, MinHeight = 160, MaxHeight = 490, ItemsSource = items, SelectionMode = SelectionMode.Single };
        AutomationProperties.SetAutomationId(list, "article-ledger-table");
        VirtualizingPanel.SetIsVirtualizing(list, true); VirtualizingPanel.SetVirtualizationMode(list, VirtualizationMode.Recycling);
        VirtualizingPanel.SetIsVirtualizingWhenGrouping(list, true); ScrollViewer.SetCanContentScroll(list, true);
        ScrollViewer.SetHorizontalScrollBarVisibility(list, ScrollBarVisibility.Auto); ScrollViewer.SetVerticalScrollBarVisibility(list, ScrollBarVisibility.Auto);
        var grid = new GridView { AllowsColumnReorder = false };
        foreach (var column in layout.Columns)
        {
            var definition = ArticleLedgerViews.ColumnCatalog.Single(value => value.Key == column.Key);
            grid.Columns.Add(new GridViewColumn { Header = new GridViewColumnHeader { Content = definition.Label, Tag = column.Key }, Width = column.Width,
                DisplayMemberBinding = new Binding(column.Key == "title" ? "Title" : "LedgerCells[" + column.Key + "]") });
        }
        list.View = grid;
        if (layout.GroupBy == "account")
        {
            var view = (ListCollectionView)CollectionViewSource.GetDefaultView(items);
            view.GroupDescriptions.Add(new PropertyGroupDescription(nameof(WorkspaceListItem.LedgerGroup)));
            var labels = items.GroupBy(item => item.LedgerGroup).ToDictionary(group => group.Key, group => group.First().LedgerCells["account"], StringComparer.Ordinal);
            var header = new FrameworkElementFactory(typeof(TextBlock));
            header.SetValue(TextBlock.FontWeightProperty, FontWeights.SemiBold); header.SetValue(TextBlock.MarginProperty, new Thickness(8, 12, 8, 6));
            header.SetBinding(TextBlock.TextProperty, new Binding { Converter = new LedgerGroupHeader(labels) });
            list.GroupStyle.Add(new GroupStyle { HeaderTemplate = new DataTemplate { VisualTree = header },
                Panel = new ItemsPanelTemplate(new FrameworkElementFactory(typeof(VirtualizingStackPanel))) });
            host.Children.Add(LedgerNotice("按运营账号整理当前页 · 组内保留原页顺序，以下每组仅统计本页条数，不是全台账聚合。", "article-ledger-group-coverage"));
        }
        list.SelectionChanged += (_, _) => { if (list.SelectedItem is WorkspaceListItem selected) Run(selected.Open); };
        host.Children.Add(list);
        if (items.Length == 0) host.Children.Add(Label("当前清单为空。"));
    }

    private sealed class LedgerGroupHeader(IReadOnlyDictionary<string, string> labels) : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => value is CollectionViewGroup group
            ? labels.GetValueOrDefault(group.Name?.ToString() ?? "", "账号未取得") + " · 本页 " + group.ItemCount.ToString(CultureInfo.InvariantCulture) + " 条" : "本页分组";
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => Binding.DoNothing;
    }
}
