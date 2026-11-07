using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string? noteHistoryIdentity;
    private DateOnly noteHistoryAnchor = NoteHistory.BeijingToday(DateTimeOffset.UtcNow);
    private string noteHistorySource = "all", noteHistoryLabel = "", noteHistoryQuery = "";
    private DateOnly? noteHistorySelectedDay;
    private long noteHistoryEpoch;

    private void ResetNoteHistoryView()
    {
        noteHistoryIdentity = null; noteHistoryAnchor = NoteHistory.BeijingToday(DateTimeOffset.UtcNow);
        noteHistorySource = "all"; noteHistoryLabel = ""; noteHistoryQuery = ""; noteHistorySelectedDay = null;
        noteHistoryEpoch = checked(noteHistoryEpoch + 1);
    }

    private async Task OpenNoteHistoryFromDayAsync()
    {
        await FlushEditorAsync();
        if (noteHistoryIdentity != currentIdentity) ResetNoteHistoryView();
        noteHistoryIdentity = currentIdentity;
        noteHistoryAnchor = DateOnly.ParseExact(Day, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        noteHistorySelectedDay = noteHistoryAnchor;
        await NoteHistoryAsync();
    }

    private async Task NoteHistoryAsync()
    {
        await FlushEditorAsync();
        if (noteHistoryIdentity != currentIdentity) { ResetNoteHistoryView(); noteHistoryIdentity = currentIdentity; }
        var target = Engine; var identity = currentIdentity; var state = target.Snapshot; var scope = state.ScopeId; var buildEpoch = noteHistoryEpoch;
        var range = NoteHistory.Month(noteHistoryAnchor);
        var filter = new NoteHistoryFilter(noteHistorySource, noteHistoryLabel, noteHistoryQuery);
        var view = await Task.Run(() => NoteHistory.Build(state, range.Month, filter));
        NetworkToken.ThrowIfCancellationRequested(); EnsureNoteHistoryOwner(identity, scope, target);
        if (buildEpoch != noteHistoryEpoch) throw new InvalidOperationException("月历页面已变化，本次旧投影未替换当前视图。");
        var epoch = noteHistoryEpoch = checked(noteHistoryEpoch + 1);
        var selectedDay = noteHistorySelectedDay is { } selectedDate && selectedDate >= range.Start && selectedDate <= range.End ? selectedDate : (DateOnly?)null;
        void Guard()
        {
            EnsureNoteHistoryOwner(identity, scope, target);
            if (epoch != noteHistoryEpoch) throw new InvalidOperationException("此月历页面已变化，请从当前页面继续。");
        }
        currentPage = "碎碎念月历"; ClearPage(); heading.Text = "碎碎念月历"; page.Children.Add(heading);
        page.Children.Add(Label("本机已知历史 · 北京时间。切换月份和筛选只读取当前工作区的本机副本；点击“刷新当前月”才联网读取此月，不会抓取其他月份。"));
        var controls = new WrapPanel(); page.Children.Add(controls);
        var monthPanel = NoteHistoryField(controls, "月份（YYYY-MM）", 150);
        var month = new TextBox { Text = range.Month, MaxLength = 7, Tag = "note-history-month" };
        AutomationProperties.SetAutomationId(month, "note-history-month"); monthPanel.Children.Add(month);
        controls.Children.Add(NoteHistoryButton("查看此月", "note-history-go", async () =>
        {
            Guard();
            if (!Regex.IsMatch(month.Text, "^[0-9]{4}-[0-9]{2}$", RegexOptions.CultureInvariant) ||
                !DateOnly.TryParseExact(month.Text + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var selected))
                throw new InvalidOperationException("请填写真实月份 YYYY-MM（0001-01 至 9999-12）。原视图保留。");
            noteHistoryAnchor = selected; noteHistorySelectedDay = null; await NoteHistoryAsync();
        }));
        var previous = range.Shift(-1); var next = range.Shift(1);
        var previousButton = NoteHistoryButton("上一月", "note-history-previous", async () =>
        { Guard(); if (previous is null) return; noteHistoryAnchor = previous.Start; noteHistorySelectedDay = null; await NoteHistoryAsync(); });
        previousButton.IsEnabled = previous is not null; controls.Children.Add(previousButton);
        var nextButton = NoteHistoryButton("下一月", "note-history-next", async () =>
        { Guard(); if (next is null) return; noteHistoryAnchor = next.Start; noteHistorySelectedDay = null; await NoteHistoryAsync(); });
        nextButton.IsEnabled = next is not null; controls.Children.Add(nextButton);
        controls.Children.Add(NoteHistoryButton("本月（北京）", "note-history-current", async () =>
        { Guard(); noteHistoryAnchor = NoteHistory.BeijingToday(DateTimeOffset.UtcNow); noteHistorySelectedDay = null; await NoteHistoryAsync(); }));
        controls.Children.Add(NoteHistoryButton("今天（北京）", "note-history-today", async () =>
        { Guard(); noteHistoryAnchor = NoteHistory.BeijingToday(DateTimeOffset.UtcNow); noteHistorySelectedDay = noteHistoryAnchor; await NoteHistoryAsync(); }));
        var filters = new WrapPanel(); page.Children.Add(filters);
        var sourcePanel = NoteHistoryField(filters, "记录来源", 160);
        var source = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", ItemsSource = new[]
        { new KeyValuePair<string, string>("all", "全部来源"), new("life", "生活"), new("work", "工作") }, SelectedValue = noteHistorySource };
        AutomationProperties.SetAutomationId(source, "note-history-source"); sourcePanel.Children.Add(source);
        var labels = view.KnownLabels.Select(label => new KeyValuePair<string, string>(label, label)).ToList();
        labels.Insert(0, new("", "全部已知标签"));
        if (noteHistoryLabel.Length > 0 && !labels.Any(label => label.Key == noteHistoryLabel)) labels.Add(new(noteHistoryLabel, noteHistoryLabel + "（当前月未见）"));
        var labelPanel = NoteHistoryField(filters, "标签", 190);
        var label = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", ItemsSource = labels, SelectedValue = noteHistoryLabel };
        AutomationProperties.SetAutomationId(label, "note-history-label"); labelPanel.Children.Add(label);
        var queryPanel = NoteHistoryField(filters, "本机正文搜索", 240);
        var query = new TextBox { Text = noteHistoryQuery, MaxLength = 500 };
        AutomationProperties.SetAutomationId(query, "note-history-query"); queryPanel.Children.Add(query);
        filters.Children.Add(NoteHistoryButton("应用月历筛选", "note-history-apply", async () =>
        {
            Guard(); var selectedSource = source.SelectedValue?.ToString();
            if (selectedSource is not ("all" or "life" or "work")) throw new InvalidOperationException("请选择有效来源。");
            noteHistorySource = selectedSource; noteHistoryLabel = label.SelectedValue?.ToString() ?? ""; noteHistoryQuery = query.Text;
            await NoteHistoryAsync();
        }));
        filters.Children.Add(NoteHistoryButton("清除筛选", "note-history-clear", async () =>
        { Guard(); noteHistorySource = "all"; noteHistoryLabel = ""; noteHistoryQuery = ""; noteHistorySelectedDay = null; await NoteHistoryAsync(); }));
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(NoteHistoryButton("刷新当前月", "note-history-refresh", () => { Guard(); return RefreshNoteHistoryMonthAsync(); }));
        actionsBar.Children.Add(NoteHistoryButton("导出当前筛选只读副本", "note-history-export", () =>
        { Guard(); return ExportTextAsync("好多鱼碎碎念月历史-" + range.Month + ".txt", NoteHistoryCopy(view, filter, selectedDay).ToJsonString(ArticleReadableJson)); }));
        var coverage = Label($"{range.Month} · {(view.Complete ? "已完整读取此月" : "此月未完整读取")} · 完整日期 {view.CoveredDays}/{range.Dates.Count} · 当前已知记录 {view.Total} · 月基线记录 {view.BaselineTotal} · 当前筛选 {view.FilteredCount} 条 · 活跃日期 {view.ActiveDays}");
        AutomationProperties.SetAutomationId(coverage, "note-history-summary"); page.Children.Add(coverage);
        page.Children.Add(Label("已知统计独立于筛选；本机待同步、冲突和结果待核对的意图可能影响已知记录，均不代表服务端确认。完整空日与尚未取得的日期分别标注。月摘要不含可写版本，点击记录先只读查看。"));
        if (view.UncertainCount > 0 || view.UnattributedOperationCount > 0)
            page.Children.Add(Label($"本机未决操作 {view.UncertainCount} 项（包含可能隐藏的删除意图）；其中 {view.UnattributedOperationCount} 项日期尚未核实。请到同步中心核对，本页不会自动重发。"));
        foreach (var issue in view.Issues.Take(5)) page.Children.Add(Label(issue));
        RenderNoteHistoryCalendar(view, identity, scope, Guard);
        var visible = view.Items.Where(item => selectedDay is null || item.Date == selectedDay).ToArray();
        page.Children.Add(Label(selectedDay is null ? $"当前月筛选结果 · {visible.Length} 条" : $"{selectedDay:yyyy-MM-dd} 筛选结果 · {visible.Length} 条"));
        if (selectedDay is not null) page.Children.Add(NoteHistoryButton("查看本月全部筛选结果", "note-history-all-days", async () =>
        { Guard(); noteHistorySelectedDay = null; await NoteHistoryAsync(); }));
        var records = new ListBox { ItemsSource = visible, Height = 360, MinHeight = 160, MaxHeight = 490, SelectionMode = SelectionMode.Single };
        // A fixed viewport keeps recycling effective even inside the page's outer ScrollViewer.
        ScrollViewer.SetCanContentScroll(records, true); ScrollViewer.SetVerticalScrollBarVisibility(records, ScrollBarVisibility.Auto);
        VirtualizingPanel.SetIsVirtualizing(records, true); VirtualizingPanel.SetVirtualizationMode(records, VirtualizationMode.Recycling);
        var template = new DataTemplate(typeof(NoteHistoryItem));
        var text = new FrameworkElementFactory(typeof(TextBlock)); text.SetBinding(TextBlock.TextProperty, new Binding { Converter = new NoteHistoryDisplayConverter() });
        text.SetValue(TextBlock.TextWrappingProperty, TextWrapping.NoWrap); text.SetValue(TextBlock.TextTrimmingProperty, TextTrimming.CharacterEllipsis);
        text.SetValue(FrameworkElement.MarginProperty, new Thickness(4, 8, 4, 8)); template.VisualTree = text; records.ItemTemplate = template;
        AutomationProperties.SetAutomationId(records, "note-history-records"); page.Children.Add(records);
        records.SelectionChanged += (_, _) =>
        { if (records.SelectedItem is NoteHistoryItem item) Run(async () => { Guard(); await OpenNoteHistoryRecordAsync(item, identity, scope); }); };
        if (visible.Length == 0) page.Children.Add(Label("当前筛选没有本机已知记录；未完整读取的月份不能据此认定没有其他记录。"));
        if (view.LocalDrafts.Count > 0)
        {
            page.Children.Add(Label("此月本机原稿（不计作服务端确认记录，点击继续同一草稿）"));
            foreach (var draft in view.LocalDrafts.Take(100))
                page.Children.Add(NoteHistoryButton(draft.Title, "note-history-local-draft-" + draft.Key,
                    async () => { Guard(); await ContinueNoteHistoryDraftAsync(draft.Key, identity, scope); }));
            if (view.LocalDrafts.Count > 100) page.Children.Add(Label("此处仅列前100份本机原稿，其余可在“本机草稿”中查看。"));
        }
    }

    private void RenderNoteHistoryCalendar(NoteHistoryView view, string? identity, string scope, Action guard)
    {
        var grid = new Grid { Margin = new Thickness(0, 12, 0, 12) }; page.Children.Add(grid);
        for (var column = 0; column < 7; column++) grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var names = new[] { "周一", "周二", "周三", "周四", "周五", "周六", "周日" };
        for (var column = 0; column < 7; column++)
        { var name = Label(names[column]); Grid.SetRow(name, 0); Grid.SetColumn(name, column); grid.Children.Add(name); }
        var first = ((int)view.Range.Start.DayOfWeek + 6) % 7;
        for (var row = 0; row < (first + view.Days.Count + 6) / 7; row++) grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        for (var index = 0; index < view.Days.Count; index++)
        {
            var day = view.Days[index]; var key = day.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var panel = new StackPanel(); panel.Children.Add(new TextBlock { Text = key, FontWeight = FontWeights.SemiBold });
            var today = day.Date == NoteHistory.BeijingToday(DateTimeOffset.UtcNow) ? "今天 · " : "";
            panel.Children.Add(Label(today + (day.Complete ? $"完整 · {day.Total} 条" : $"未完整 · 已知 {day.Total} 条") + $" · 筛选 {day.FilteredCount}"));
            foreach (var item in day.Items.Take(3)) panel.Children.Add(new TextBlock { Text = NoteHistoryPreview(item.Text, 35) + NoteHistoryLocalSuffix(item),
                TextWrapping = TextWrapping.NoWrap, TextTrimming = TextTrimming.CharacterEllipsis, Margin = new Thickness(0, 2, 0, 2) });
            if (day.FilteredCount > 3) panel.Children.Add(Label($"另有 {day.FilteredCount - 3} 条，点击日期查看"));
            if (day.Total == 0) panel.Children.Add(Label(day.UncertainCount > 0 ? "本机暂无可见记录，仍有待核意图" :
                day.Complete && day.BaselineTotal == 0 ? "已完整读取的空日" : day.Complete ? "本机暂无可见记录；月基线曾有记录" : "其他记录尚未取得"));
            else if (day.FilteredCount == 0) panel.Children.Add(Label("当前筛选没有记录"));
            if (day.UncertainCount > 0) panel.Children.Add(Label($"本机待核 {day.UncertainCount} 项"));
            var button = NoteHistoryButton(key, "note-history-day-" + key, async () =>
            { guard(); EnsureNoteHistoryOwner(identity, scope); noteHistorySelectedDay = day.Date; await NoteHistoryAsync(); });
            button.Tag = key; button.Content = panel; button.MinHeight = 155; button.Padding = new Thickness(7); button.Margin = new Thickness(3);
            button.HorizontalContentAlignment = HorizontalAlignment.Stretch; button.VerticalContentAlignment = VerticalAlignment.Top;
            button.Background = day.Complete ? SystemColors.ControlLightLightBrush : new SolidColorBrush(Color.FromRgb(255, 248, 232));
            button.BorderThickness = new Thickness(noteHistorySelectedDay == day.Date ? 2 : 1);
            Grid.SetColumn(button, (first + index) % 7); Grid.SetRow(button, 1 + (first + index) / 7); grid.Children.Add(button);
        }
    }

    private async Task RefreshNoteHistoryMonthAsync()
    {
        await FlushEditorAsync();
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null)
            throw new InvalidOperationException("请先连接或登录原工作区并核对身份，再刷新当前月。旧缓存和本机原稿保留。");
        var target = Engine; var identity = currentIdentity; var scope = target.Snapshot.ScopeId; var expectedScope = api.ExpectedScopeId;
        var month = NoteHistory.Month(noteHistoryAnchor).Month; var epoch = noteHistoryEpoch; var cancellation = NetworkToken;
        if (TodoHistoryServerScope(identity) != expectedScope || NoteHistoryTransportIdentity(expectedScope) != identity)
            throw new InvalidOperationException("当前月读取的工作区归属尚未核实，原副本保留。");
        var path = "/api/v1/note-entries/month?month=" + month;
        Message("正在完整读取当前月；全部核实后才保存一次，旧副本和本机原稿保留。");
        var result = await target.ReadRemoteAsync(path, cancellation);
        if (!result.IsSuccess) throw new InvalidOperationException($"此月读取失败 HTTP {result.StatusCode}。可能超过月资料容量或当前身份无权读取；原缓存、草稿与请求保留。");
        NoteHistoryResponse.Validate(path, result.Json, expectedScope);
        var returnedScope = await ReadNoteHistoryScopeAsync(cancellation);
        cancellation.ThrowIfCancellationRequested(); EnsureNoteHistoryOwner(identity, scope, target);
        if (returnedScope != expectedScope || NoteHistoryTransportIdentity(returnedScope) != identity) connected = false;
        if (api.ExpectedScopeId != expectedScope || returnedScope != expectedScope || NoteHistoryTransportIdentity(returnedScope) != identity || epoch != noteHistoryEpoch || NoteHistory.Month(noteHistoryAnchor).Month != month)
            throw new InvalidOperationException("读取期间工作区或月份已变化，本次资料未写入缓存；旧副本保留。");
        await target.CacheAsync(path, result.Json, cancellation);
        EnsureNoteHistoryOwner(identity, scope, target);
        if (epoch != noteHistoryEpoch) throw new InvalidOperationException("月历页面已变化；已核实的副本保留在原工作区，请重新打开当前月历。");
        await NoteHistoryAsync();
        Message("已完整核对并保存当前月副本。本机草稿和未决请求保留，未发送业务写入。");
    }

    private async Task OpenNoteHistoryRecordAsync(NoteHistoryItem item, string? identity, string scope)
    {
        EnsureNoteHistoryOwner(identity, scope); await FlushEditorAsync(); EnsureNoteHistoryOwner(identity, scope);
        var target = Engine; var epoch = noteHistoryEpoch;
        void Guard() { EnsureNoteHistoryOwner(identity, scope, target); if (epoch != noteHistoryEpoch) throw new InvalidOperationException("此记录所属月历已变化，请重新打开。"); }
        ClearPage(); heading.Text = "碎碎念历史 · 只读原文"; page.Children.Add(heading);
        page.Children.Add(Label($"{item.Date:yyyy-MM-dd} · {(item.Category == "work" ? "工作" : "生活")} · {(item.Source == "note_entry" ? "独立碎碎念" : "旧版日页")} · 标签：{string.Join("、", item.Labels)}"));
        page.Children.Add(Label("来源标识：" + item.EntityId + NoteHistoryLocalSuffix(item) + (item.HasDraft ? " · 有同一记录的本机草稿" : "")));
        page.Children.Add(Label("以下保留本机已知完整原文，仅供阅读。月摘要缺少可写版本；连接读取正式完整记录后才能从真实版本开始编辑。链接仅作为文字显示，不会执行。"));
        var body = new TextBox { Text = item.Text, IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Height = 350, MaxHeight = 600 };
        AutomationProperties.SetAutomationId(body, "note-history-readonly-text"); page.Children.Add(body);
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(NoteHistoryButton("打开原日期", "note-history-open-day", async () =>
        { Guard(); suppressDate = true; try { date.SelectedDate = item.Date.ToDateTime(TimeOnly.MinValue); } finally { suppressDate = false; } await NavigateAsync(item.Category == "work" ? "工作记录" : "生活记录"); }));
        actionsBar.Children.Add(NoteHistoryButton("读取完整记录后编辑", "note-history-edit-prepare", async () =>
        { Guard(); await PrepareNoteHistoryEditAsync(item, identity, scope); }));
        if (item.HasDraft && item.DraftKey is { Length: > 0 } key)
            actionsBar.Children.Add(NoteHistoryButton("继续同一份本机草稿", "note-history-continue-draft", async () =>
            { Guard(); await ContinueNoteHistoryDraftAsync(key, identity, scope); }));
        actionsBar.Children.Add(NoteHistoryButton("导出此条只读副本", "note-history-record-export", () =>
        { Guard(); return ExportTextAsync("好多鱼碎碎念历史.txt", $"只读历史副本，不能导入或重放；不是原始备份。\n{item.Date:yyyy-MM-dd} · {item.EntityId}\n标签：{string.Join("、", item.Labels)}{NoteHistoryLocalSuffix(item)}\n\n{item.Text}"); }));
        actionsBar.Children.Add(NoteHistoryButton("返回碎碎念月历", "note-history-back", () => { Guard(); return NoteHistoryAsync(); }));
    }

    private async Task PrepareNoteHistoryEditAsync(NoteHistoryItem item, string? identity, string scope)
    {
        EnsureNoteHistoryOwner(identity, scope);
        var target = Engine; var epoch = noteHistoryEpoch; var cancellation = NetworkToken;
        var (kind, key, readPath) = NoteHistoryRecordPaths(item);
        // Attempted requests retain their immutable ID/body and must be inspected before any editor is opened.
        if (await HandleNoteHistoryPendingAsync(key)) return;
        JsonObject? full = null;
        if (connected)
        {
            var expectedScope = api.ExpectedScopeId;
            if (expectedScope is null || TodoHistoryServerScope(identity) != expectedScope || NoteHistoryTransportIdentity(expectedScope) != identity)
                throw new InvalidOperationException("请先核对原工作区身份，不能用月份摘要创建可写原稿。");
            var result = await target.ReadRemoteAsync(readPath, cancellation);
            if (!result.IsSuccess) throw new InvalidOperationException($"读取完整记录失败 HTTP {result.StatusCode}。原稿保留，月份摘要仍只读。");
            var raw = Data(result.Json) as JsonObject;
            if (raw is null || !NoteHistoryFullRecord(raw, kind, item.Date, item.Category, key))
                throw new InvalidDataException("完整记录缺少真实版本、正文或身份不符；月份摘要仍只读，原稿保留。");
            var returnedScope = await ReadNoteHistoryScopeAsync(cancellation);
            cancellation.ThrowIfCancellationRequested(); EnsureNoteHistoryOwner(identity, scope, target);
            if (returnedScope != expectedScope || NoteHistoryTransportIdentity(returnedScope) != identity) connected = false;
            if (api.ExpectedScopeId != expectedScope || returnedScope != expectedScope || NoteHistoryTransportIdentity(returnedScope) != identity || epoch != noteHistoryEpoch)
                throw new InvalidOperationException("读取完整记录期间工作区已变化，原稿和缓存保留。");
            await target.CacheAsync(readPath, result.Json, cancellation);
            EnsureNoteHistoryOwner(identity, scope, target);
        }
        else if (!target.Snapshot.Cache.TryGetValue(readPath, out var cached) || Data(cached) is not JsonObject raw ||
            !NoteHistoryFullRecord(raw, kind, item.Date, item.Category, key))
            throw new InvalidOperationException("本机只有月份摘要，尚无独立读取且带真实版本的完整记录。请连接或准备完整离线资料；已有本机草稿可用“继续同一份本机草稿”。");
        var state = target.Snapshot;
        if (state.Cache.TryGetValue(readPath, out var originalJson))
        {
            // Restrict the projection to note sources so unrelated cached business pages cannot affect this read.
            var notes = state with { Cache = state.Cache.Where(pair => pair.Key.StartsWith("/api/v1/note-entries", StringComparison.Ordinal) || pair.Key.StartsWith("/api/v1/daily-notes", StringComparison.Ordinal)).ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal) };
            var projected = WorkspaceProjection.Project(readPath, originalJson, notes);
            full = projected is null ? null : Data(projected) as JsonObject;
        }
        cancellation.ThrowIfCancellationRequested(); EnsureNoteHistoryOwner(identity, scope, target);
        if (epoch != noteHistoryEpoch || full is null || !NoteHistoryFullRecord(full, kind, item.Date, item.Category, key))
            throw new InvalidOperationException("完整记录当前不能安全编辑，原稿和月份摘要保留。");
        if (kind == "legacy") full["category"] = item.Category;
        if (await HandlePendingRecordAsync(full) || await HandleNoteHistoryPendingAsync(key)) return;
        if (target.Snapshot.Drafts.ContainsKey(key))
        { await ContinueNoteHistoryDraftAsync(key, identity, scope); return; }
        await EditAsync(kind, full, key);
    }

    private async Task ContinueNoteHistoryDraftAsync(string key, string? identity, string scope)
    {
        EnsureNoteHistoryOwner(identity, scope);
        if (await HandleNoteHistoryPendingAsync(key)) return;
        if (!Engine.Snapshot.Drafts.TryGetValue(key, out var draft)) throw new InvalidOperationException("原本机草稿已变化，请重新打开月历或本机草稿。");
        var saved = JsonNode.Parse(draft.Text) as JsonObject;
        var kind = Text(saved, "kind");
        if (saved is null || Text(saved, "key") != key || kind is not ("note" or "legacy") ||
            saved["original"] is not JsonObject original || saved["values"] is not JsonObject values ||
            !NoteHistoryExplicitVersion(original, allowNew: true) || Version(original) != draft.BaseVersion ||
            Flag(original, "_local_incomplete") || !original.ContainsKey("text") || original["text"] is not JsonValue originalText || !originalText.TryGetValue<string>(out _) ||
            values["text"] is not JsonValue valuesText || !valuesText.TryGetValue<string>(out _))
            throw new InvalidDataException("此本机草稿缺少已核实原始版本或正文。原稿保留，请从本机草稿导出并连接核对，不会以摘要补成版本0。");
        var category = Text(original, "category"); var rawDay = Text(original, "date");
        if (category is not ("life" or "work") || !DateOnly.TryParseExact(rawDay, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) ||
            kind == "note" && (!Guid.TryParseExact(Text(original, "id"), "D", out _) || key != "/api/v1/note-entries/" + Text(original, "id")) ||
            kind == "legacy" && key != $"/api/v1/daily-notes/{day:yyyy-MM-dd}?category={category}")
            throw new InvalidDataException("此本机草稿身份与原记录不一致，原稿保留。");
        if (await HandlePendingRecordAsync(original)) return;
        await EditAsync(kind, (JsonObject)original.DeepClone(), key);
        Message("已继续同一份本机草稿，正文、原始版本及原请求围栏保留。未按月摘要重建记录。");
    }

    private async Task<bool> HandleNoteHistoryPendingAsync(string key)
    {
        var pending = Engine.Snapshot.Outbox.LastOrDefault(operation => operation.ResourceKey == key && operation.Status is not (PendingStatus.Confirmed or PendingStatus.Superseded));
        return pending is not null && await HandlePendingRecordAsync(Obj(("_operation_id", pending.Id)));
    }

    private async Task OpenLegacyNoteFromDayAsync(JsonObject record, string day, string category)
    {
        var key = $"/api/v1/daily-notes/{day}?category={category}";
        if (await HandleNoteHistoryPendingAsync(key)) return;
        if (!DateOnly.TryParseExact(day, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDay) ||
            !NoteHistoryFullRecord(record, "legacy", parsedDay, category, key))
        {
            ShowText("旧版日页 · 只读摘要", "此本机副本缺少真实版本或完整字段。请连接或准备完整离线资料后再编辑；不会使用猜测版本0。\n\n" + Text(record, "text"));
            return;
        }
        if (await HandlePendingRecordAsync(record)) return;
        if (Engine.Snapshot.Drafts.ContainsKey(key)) { await ContinueNoteHistoryDraftAsync(key, currentIdentity, Engine.Snapshot.ScopeId); return; }
        await EditAsync("legacy", record, key);
    }

    private static (string Kind, string Key, string ReadPath) NoteHistoryRecordPaths(NoteHistoryItem item)
    {
        var day = item.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (item.Category is not ("life" or "work")) throw new InvalidDataException("历史记录来源无法核实。");
        if (item.Source == "note_entry" && item.EntityId.StartsWith("note-entry:", StringComparison.Ordinal) &&
            Guid.TryParseExact(item.EntityId[11..], "D", out _))
        { var path = "/api/v1/note-entries/" + item.EntityId[11..]; return ("note", path, path); }
        if (item.Source == "legacy_daily_note" && item.EntityId == $"legacy-{item.Category}:{day}")
            return ("legacy", $"/api/v1/daily-notes/{day}?category={item.Category}", $"/api/v1/daily-notes?date={day}&category={item.Category}");
        throw new InvalidDataException("历史记录身份无法核实，原副本保留。");
    }
    private static bool NoteHistoryExplicitVersion(JsonObject row, bool allowNew = false) =>
        row["version"] is JsonValue version && version.TryGetValue<long>(out var value) && value >= (allowNew ? 0 : 1);
    private static bool NoteHistoryFullRecord(JsonObject row, string kind, DateOnly day, string category, string key)
    {
        if (Flag(row, "_local_incomplete") || Flag(row, "deleted") || EffectiveDeleted(row) || !NoteHistoryExplicitVersion(row) ||
            row["text"] is not JsonValue text || !text.TryGetValue<string>(out _) || Text(row, "date") != day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)) return false;
        if (kind == "legacy") return Text(row, "category") is "" || Text(row, "category") == category;
        return Text(row, "category") == category && key == "/api/v1/note-entries/" + Text(row, "id") &&
            Guid.TryParseExact(Text(row, "id"), "D", out _) && row["labels"] is JsonArray &&
            Regex.IsMatch(Text(row, "content_hash"), "^[a-f0-9]{64}$", RegexOptions.CultureInvariant);
    }
    private void EnsureNoteHistoryOwner(string? identity, string scope, SyncEngine? target = null)
    {
        if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope || target is not null && !ReferenceEquals(target, engine))
            throw new InvalidOperationException("工作区已变化，本次碎碎念历史未用于其他身份。");
    }
    private string NoteHistoryTransportIdentity(string serverScope) => api.PublicMode ? "public:" + serverScope : "user:" + api.UserId + ":" + serverScope;
    private async Task<string> ReadNoteHistoryScopeAsync(CancellationToken cancellation)
    {
        try { return await api.ReadScopeIdAsync(cancellation); }
        catch (ScopeGuardException) { connected = false; throw; }
    }
    private Button NoteHistoryButton(string label, string id, Func<Task> action)
    { var button = Button(label, action); AutomationProperties.SetAutomationId(button, id); return button; }
    private static StackPanel NoteHistoryField(Panel owner, string label, double width)
    { var panel = new StackPanel { Width = width, Margin = new Thickness(0, 0, 12, 8) }; panel.Children.Add(Label(label)); owner.Children.Add(panel); return panel; }
    private static string NoteHistoryPreview(string text, int limit) => string.Concat(text.EnumerateRunes().Take(limit).Select(rune => rune.ToString())).Replace('\r', ' ').Replace('\n', ' ');
    private static string NoteHistoryLocalSuffix(NoteHistoryItem item) => item.LocalStatus is { Length: > 0 } status ? " · 本机" + (status switch
    {
        "Queued" => "待同步", "InFlight" => "发送中", "Unknown" => "结果待核对", "Conflict" => "版本冲突",
        "Blocked" => "同步受阻", "Confirmed" => "已收到回执", _ => status
    }) : "";
    private sealed class NoteHistoryDisplayConverter : IValueConverter
    {
        public object Convert(object value, Type targetType, object parameter, CultureInfo culture) => value is NoteHistoryItem item
            ? $"{item.Date:yyyy-MM-dd} · {(item.Category == "work" ? "工作" : "生活")} · {string.Join("、", item.Labels)} · {NoteHistoryPreview(item.Text, 100)}{NoteHistoryLocalSuffix(item)}" : "";
        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) => throw new NotSupportedException();
    }
    private static JsonObject NoteHistoryCopy(NoteHistoryView view, NoteHistoryFilter filter, DateOnly? selectedDay)
    {
        var selectedItems = view.Items.Where(item => selectedDay is null || item.Date == selectedDay).ToArray();
        var items = new JsonArray(selectedItems.Select(item => (JsonNode?)Obj(("date", item.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            ("entity_id", item.EntityId), ("source", item.Source), ("category", item.Category), ("labels", new JsonArray(item.Labels.Select(label => (JsonNode?)JsonValue.Create(label)).ToArray())),
            ("text", item.Text), ("local_status", item.LocalStatus), ("has_local_draft", item.HasDraft))).ToArray());
        return Obj(("source", "当前工作区本机碎碎念月历史筛选只读副本；不是原始备份，不能导入或重放。包含未确认本机意图，不是服务端实时快照。"),
            ("month", view.Range.Month), ("complete", view.Complete), ("known_total", view.Total), ("baseline_total", view.BaselineTotal),
            ("month_filtered_count", view.FilteredCount), ("exported_count", selectedItems.Length), ("filter_date", selectedDay?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            ("filter_source", filter.Source), ("filter_label", filter.Label), ("filter_query", filter.Query), ("items", items));
    }
}
