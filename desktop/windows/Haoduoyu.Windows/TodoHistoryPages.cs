using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using Haoduoyu.Api;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string? todoHistoryIdentity;
    private DateOnly todoHistoryAnchor = TodoHistory.BeijingToday(DateTimeOffset.UtcNow);
    private TodoHistoryPeriod todoHistoryPeriod = TodoHistoryPeriod.Month;
    private bool? todoHistoryCompleted;

    private void ResetTodoHistoryView()
    {
        todoHistoryIdentity = null; todoHistoryAnchor = TodoHistory.BeijingToday(DateTimeOffset.UtcNow);
        todoHistoryPeriod = TodoHistoryPeriod.Month; todoHistoryCompleted = null;
    }
    private TodoHistoryRange CurrentTodoHistoryRange() => todoHistoryPeriod == TodoHistoryPeriod.Week
        ? TodoHistory.Week(todoHistoryAnchor) : TodoHistory.Month(todoHistoryAnchor);

    private async Task OpenTodoHistoryFromDayAsync()
    {
        await FlushEditorAsync();
        if (todoHistoryIdentity != currentIdentity) ResetTodoHistoryView();
        todoHistoryIdentity = currentIdentity;
        todoHistoryAnchor = DateOnly.ParseExact(Day, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        await TodoHistoryAsync();
    }

    private async Task TodoHistoryAsync()
    {
        await FlushEditorAsync();
        if (todoHistoryIdentity != currentIdentity)
        { ResetTodoHistoryView(); todoHistoryIdentity = currentIdentity; }
        var target = Engine; var identity = currentIdentity; var state = target.Snapshot; var scope = state.ScopeId;
        var range = CurrentTodoHistoryRange(); var filter = new TodoHistoryFilter(Completed: todoHistoryCompleted);
        var (available, excluded) = TodoHistoryStateForCurrentOwner(state, range);
        var view = await Task.Run(() => TodoHistory.Build(available, range, filter));
        NetworkToken.ThrowIfCancellationRequested(); EnsureTodoHistoryOwner(identity, scope);
        currentPage = "待办日历"; ClearPage(); heading.Text = "待办日历"; page.Children.Add(heading);
        page.Children.Add(Label("当前本机视图。周从周一至周日，跨月显示；日期按北京时间选择。只展示本工作区已有记录，不会自动联网读取其他日期。"));
        if (range.IsClipped) page.Children.Add(Label("已到可用日期边界，仅显示范围内的有效日期。"));
        var controls = new WrapPanel(); page.Children.Add(controls);
        var anchorPanel = new StackPanel { Width = 185, Margin = new Thickness(0, 0, 12, 8) }; controls.Children.Add(anchorPanel);
        anchorPanel.Children.Add(Label("所选日期"));
        var anchor = new DatePicker { Tag = "todo-history-anchor", SelectedDate = todoHistoryAnchor.ToDateTime(TimeOnly.MinValue),
            DisplayDateStart = DateTime.MinValue.Date, DisplayDateEnd = DateTime.MaxValue.Date };
        AutomationProperties.SetAutomationId(anchor, "todo-history-anchor"); anchorPanel.Children.Add(anchor);
        anchor.SelectedDateChanged += (_, _) =>
        {
            if (anchor.SelectedDate is not { } selected) return;
            var selectedDay = DateOnly.FromDateTime(selected);
            if (selectedDay == todoHistoryAnchor) return;
            Run(async () => { EnsureTodoHistoryOwner(identity, scope); todoHistoryAnchor = selectedDay; await TodoHistoryAsync(); });
        };
        controls.Children.Add(Button("周视图", async () => { EnsureTodoHistoryOwner(identity, scope); todoHistoryPeriod = TodoHistoryPeriod.Week; await TodoHistoryAsync(); }));
        controls.Children.Add(Button("月视图", async () => { EnsureTodoHistoryOwner(identity, scope); todoHistoryPeriod = TodoHistoryPeriod.Month; await TodoHistoryAsync(); }));
        var previous = range.Shift(-1); var next = range.Shift(1);
        var previousButton = Button(todoHistoryPeriod == TodoHistoryPeriod.Week ? "上一周" : "上一月", async () =>
        {
            EnsureTodoHistoryOwner(identity, scope); if (previous is null) return;
            todoHistoryAnchor = previous.Anchor; await TodoHistoryAsync();
        }); previousButton.IsEnabled = previous is not null; controls.Children.Add(previousButton);
        var nextButton = Button(todoHistoryPeriod == TodoHistoryPeriod.Week ? "下一周" : "下一月", async () =>
        {
            EnsureTodoHistoryOwner(identity, scope); if (next is null) return;
            todoHistoryAnchor = next.Anchor; await TodoHistoryAsync();
        }); nextButton.IsEnabled = next is not null; controls.Children.Add(nextButton);
        controls.Children.Add(Button("日历今天（北京）", async () =>
        { EnsureTodoHistoryOwner(identity, scope); todoHistoryAnchor = TodoHistory.BeijingToday(DateTimeOffset.UtcNow); await TodoHistoryAsync(); }));
        var monthPanel = new StackPanel { Width = 150, Margin = new Thickness(0, 0, 12, 8) }; controls.Children.Add(monthPanel);
        monthPanel.Children.Add(Label("月份（YYYY-MM）"));
        var month = new TextBox { Tag = "todo-history-month", Text = todoHistoryAnchor.ToString("yyyy-MM", CultureInfo.InvariantCulture), MaxLength = 7 };
        AutomationProperties.SetAutomationId(month, "todo-history-month"); monthPanel.Children.Add(month);
        controls.Children.Add(Button("查看此月", async () =>
        {
            EnsureTodoHistoryOwner(identity, scope);
            if (!Regex.IsMatch(month.Text, "^[0-9]{4}-[0-9]{2}$", RegexOptions.CultureInvariant) ||
                !DateOnly.TryParseExact(month.Text + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var selected))
                throw new InvalidOperationException("请填写真实月份 YYYY-MM，原范围保留。");
            todoHistoryAnchor = selected; todoHistoryPeriod = TodoHistoryPeriod.Month; await TodoHistoryAsync();
        }));
        var statusPanel = new StackPanel { Width = 160, Margin = new Thickness(0, 0, 12, 8) }; controls.Children.Add(statusPanel);
        statusPanel.Children.Add(Label("任务状态"));
        var status = new ComboBox { Tag = "todo-history-status", DisplayMemberPath = "Value", SelectedValuePath = "Key",
            ItemsSource = new[] { new KeyValuePair<string, string>("all", "全部任务"), new("open", "未完成"), new("done", "已完成") },
            SelectedValue = todoHistoryCompleted is null ? "all" : todoHistoryCompleted.Value ? "done" : "open" };
        AutomationProperties.SetAutomationId(status, "todo-history-status"); statusPanel.Children.Add(status);
        controls.Children.Add(Button("应用日历筛选", async () =>
        {
            EnsureTodoHistoryOwner(identity, scope);
            todoHistoryCompleted = status.SelectedValue?.ToString() switch
            { "all" => null, "done" => true, "open" => false, _ => throw new InvalidOperationException("请选择有效任务状态。") };
            await TodoHistoryAsync();
        }));
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("刷新当前范围", RefreshTodoHistoryRangeAsync));
        var copy = TodoHistoryCopy(view, state, excluded);
        actionsBar.Children.Add(Button("查看当前视图副本", () =>
        { EnsureTodoHistoryOwner(identity, scope); ShowText("待办日历副本（只读）", copy.ToJsonString(ArticleReadableJson)); return Task.CompletedTask; }));
        actionsBar.Children.Add(Button("导出当前视图副本", () =>
        { EnsureTodoHistoryOwner(identity, scope); return ExportTextAsync("好多鱼待办日历.txt", copy.ToJsonString(ArticleReadableJson)); }));

        var completeWord = view.Complete ? "已完整覆盖" : "未完整读取";
        page.Children.Add(Label($"{range.Start:yyyy-MM-dd} 至 {range.End:yyyy-MM-dd} · {completeWord} {view.CoveredDays}/{range.Dates.Count} 日 · 当前筛选 {view.FilteredCount} 项"));
        var known = view.Complete ? "范围任务" : "当前已知任务";
        var rate = view.Total == 0 ? "—（已知范围无任务）" : Math.Round(view.Done * 100d / view.Total, MidpointRounding.AwayFromZero).ToString(CultureInfo.InvariantCulture) + "%";
        page.Children.Add(Label($"当前本机视图：{known} {view.Total} · 已完成 {view.Done} · 未完成 {view.Open} · 活跃天数 {view.ActiveDays} · {(view.Complete ? "完成率" : "已知任务完成率")} {rate}"));
        page.Children.Add(Label("统计包含本机可见的活动待办，可能含尚未同步或结果待核对的意图，不代表服务端确认。状态筛选只影响预览和筛选条数；日常隐藏已完成的偏好不影响历史统计。"));
        if (!view.Complete) page.Children.Add(Label("未完整读取的日期不能当成零任务。本页只汇总当前已知记录；连接后可显式刷新当前范围，已有副本会保留到整批读取成功。"));
        if (view.UncertainCount > 0) page.Children.Add(Label($"当前有 {view.UncertainCount} 项本机未决操作影响此视图，包含可能已从清单隐藏的删除意图；请到同步中心核对，不会在日历中自动重发。"));
        if (view.UnattributedOperationCount > 0) page.Children.Add(Label($"其中 {view.UnattributedOperationCount} 项待办操作的日期尚未核实，未猜测归入某日。"));
        if (excluded > 0) page.Children.Add(Label($"有 {excluded} 个日期副本的来源与当前身份不一致或无法核实，未用于本视图；原缓存保留。"));
        var observed = view.Days.Where(day => day.ObservedAtUtc.HasValue).Select(day => day.ObservedAtUtc!.Value).ToArray();
        if (observed.Length > 0) page.Children.Add(Label("记录读取时间：" + observed.Min().ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'", CultureInfo.InvariantCulture) +
            " 至 " + observed.Max().ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'", CultureInfo.InvariantCulture) + "；资料可能来自多次读取，不能当成同一瞬间的服务端快照。"));
        var grid = new Grid { Margin = new Thickness(0, 14, 0, 14) }; page.Children.Add(grid);
        for (var column = 0; column < 7; column++) grid.ColumnDefinitions.Add(new ColumnDefinition());
        grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        var dayNames = new[] { "周一", "周二", "周三", "周四", "周五", "周六", "周日" };
        for (var column = 0; column < dayNames.Length; column++)
        {
            var label = new TextBlock { Text = dayNames[column], FontWeight = FontWeights.SemiBold, Margin = new Thickness(6) };
            Grid.SetRow(label, 0); Grid.SetColumn(label, column); grid.Children.Add(label);
        }
        var firstColumn = ((int)range.Start.DayOfWeek + 6) % 7;
        var rows = (firstColumn + range.Dates.Count + 6) / 7;
        for (var row = 0; row < rows; row++) grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        for (var index = 0; index < view.Days.Count; index++)
        {
            var day = view.Days[index]; var key = day.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var panel = new StackPanel();
            panel.Children.Add(new TextBlock { Text = key, FontWeight = FontWeights.SemiBold });
            var marker = day.Date == TodoHistory.BeijingToday(DateTimeOffset.UtcNow) ? "今天 · " : "";
            panel.Children.Add(new TextBlock { Text = marker + (day.Complete ? $"{day.FilteredCount} 项" : $"未完整 · 已知 {day.FilteredCount} 项"), TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 4, 0, 5) });
            foreach (var item in day.Items.Take(4))
            {
                var text = Text(item, "text"); var preview = string.Concat(text.EnumerateRunes().Take(80).Select(rune => rune.ToString()));
                panel.Children.Add(new TextBlock { Text = (Flag(item, "completed") ? "✓ " : "○ ") + preview + LocalSuffix(item),
                    TextTrimming = TextTrimming.CharacterEllipsis, TextWrapping = TextWrapping.NoWrap, Margin = new Thickness(0, 3, 0, 0), ToolTip = text + LocalSuffix(item) });
                panel.Children.Add(new TextBlock { Text = TodoNotePreview(item), TextTrimming = TextTrimming.CharacterEllipsis,
                    TextWrapping = TextWrapping.NoWrap, Margin = new Thickness(0, 2, 0, 2) });
            }
            if (day.FilteredCount > 4) panel.Children.Add(new TextBlock { Text = $"还有 {day.FilteredCount - 4} 项，打开日期查看", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 5, 0, 0) });
            if (day.UncertainCount > 0) panel.Children.Add(new TextBlock { Text = $"本机未决 {day.UncertainCount} 项", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 5, 0, 0) });
            if (day.FilteredCount == 0) panel.Children.Add(new TextBlock { Text = day.Complete ? "当前筛选没有任务" : "其余记录尚未取得", TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 5, 0, 0) });
            var button = Button(key, () => OpenTodoHistoryDayAsync(day.Date, identity, scope));
            button.Tag = key; button.Content = panel; button.MinHeight = 170; button.Padding = new Thickness(8); button.Margin = new Thickness(3);
            button.HorizontalContentAlignment = HorizontalAlignment.Stretch; button.VerticalContentAlignment = VerticalAlignment.Top;
            button.Background = day.Complete ? SystemColors.ControlLightLightBrush : new SolidColorBrush(Color.FromRgb(255, 248, 232));
            button.BorderThickness = new Thickness(day.Date == todoHistoryAnchor ? 2 : 1);
            AutomationProperties.SetAutomationId(button, "todo-history-day-" + key);
            Grid.SetColumn(button, (firstColumn + index) % 7); Grid.SetRow(button, 1 + (firstColumn + index) / 7); grid.Children.Add(button);
        }
        page.Children.Add(Label("按日待办与备注原文（只读）· 点击查看本机来源，不会联网、修改待办或排入保存请求。"));
        var noteRows = view.Days.SelectMany(day => day.Items.Select(item => (Day: day.Date, Item: item))).ToArray();
        var noteList = List(noteRows.Select(entry => ($"{entry.Day:yyyy-MM-dd} · " + Text(entry.Item, "text"), TodoNotePreview(entry.Item) + LocalSuffix(entry.Item),
            (Func<Task>)(() =>
            {
                EnsureTodoHistoryOwner(identity, scope);
                if (!ReferenceEquals(target, engine)) throw new InvalidOperationException("原待办日历工作区已变化，未显示旧资料。");
                var note = TodoNoteReadSafe(entry.Item);
                ShowText("待办历史备注 · 只读原文", "原日期：" + entry.Day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "\n待办原文：" + Text(entry.Item, "text") +
                    "\n备注来源：" + TodoNoteSourceName(note.Source) + LocalSuffix(entry.Item) + "\n" + (note.Known ? "备注原文（含明确空串）：\n" + note.Note : "备注未取得，不能当作空串。") +
                    "\n\n保留字段（只读副本，不是原始备份或可重放请求）：\n" + entry.Item.ToJsonString(ArticleReadableJson));
                return Task.CompletedTask;
            }))));
        AutomationProperties.SetAutomationId(noteList, "todo-history-note-records");
    }

    private async Task OpenTodoHistoryDayAsync(DateOnly selected, string? identity, string scope)
    {
        EnsureTodoHistoryOwner(identity, scope); await FlushEditorAsync();
        suppressDate = true; try { date.SelectedDate = selected.ToDateTime(TimeOnly.MinValue); } finally { suppressDate = false; }
        await NavigateAsync("待办");
    }

    private async Task RefreshTodoHistoryRangeAsync()
    {
        await FlushEditorAsync();
        if (!connected || currentIdentity is null || api.ExpectedScopeId is null)
            throw new InvalidOperationException("请先连接或登录原工作区并核对身份，再刷新当前日期范围。原缓存保留。");
        var target = Engine; var identity = currentIdentity; var scope = target.Snapshot.ScopeId;
        var expectedScope = api.ExpectedScopeId; var range = CurrentTodoHistoryRange(); var cancellation = NetworkToken;
        if (TodoHistoryServerScope(identity) != expectedScope) throw new InvalidOperationException("当前工作区归属尚未核实，原日期副本保留。");
        Message("正在完整读取当前日期范围；未全部核实前保留原视图和本机副本。");
        var result = await new TodoHistoryDownload(api).FetchAsync(expectedScope, range, cancellation);
        cancellation.ThrowIfCancellationRequested(); EnsureTodoHistoryOwner(identity, scope);
        if (!ReferenceEquals(target, engine) || api.ExpectedScopeId != expectedScope || result.ScopeId != expectedScope ||
            result.Range.Start != range.Start || result.Range.End != range.End || result.Range.Period != range.Period)
            throw new InvalidOperationException("读取期间工作区或日期范围已变化，本次资料未用于其他身份，原副本保留。");
        await Task.Run(() => target.CacheBatchAsync(result.CacheEntries, cancellation));
        await TodoHistoryAsync();
        Message($"已完整核对并保存 {result.Dates} 个日期的 {result.Rows} 条记录。本机草稿与未决请求保留，未发送业务写入。");
    }

    private void EnsureTodoHistoryOwner(string? identity, string scope)
    {
        if (currentIdentity != identity || engine is null || engine.Snapshot.ScopeId != scope)
            throw new InvalidOperationException("工作区已变化，本次日历结果未用于其他身份。");
    }
    private static string? TodoHistoryServerScope(string? identity)
    {
        var scope = identity?.Split(':').LastOrDefault();
        return scope is not null && Regex.IsMatch(scope, "^[a-f0-9]{64}$", RegexOptions.CultureInvariant) ? scope : null;
    }
    private (WorkspaceState State, int ExcludedDays) TodoHistoryStateForCurrentOwner(WorkspaceState state, TodoHistoryRange range)
    {
        var serverScope = TodoHistoryServerScope(currentIdentity); Dictionary<string, string>? available = null;
        Dictionary<string, long>? revisions = null; var excluded = 0;
        foreach (var day in range.Dates)
        {
            var key = "/api/v1/todos?date=" + day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (!state.Cache.TryGetValue(key, out var json)) continue;
            var reject = false;
            try
            {
                var root = JsonNode.Parse(json);
                if (root is JsonObject obj && obj.ContainsKey("_local_todo_history"))
                {
                    var proof = obj["_local_todo_history"] as JsonObject;
                    reject = proof?["scope_id"] is not JsonValue value || !value.TryGetValue<string>(out var sourceScope) || serverScope is null || sourceScope != serverScope;
                }
            }
            catch (Exception error) when (error is JsonException or ArgumentException or InvalidOperationException)
            { /* The strict day model identifies malformed/duplicate raw cache as incomplete without changing it. */ }
            if (!reject) continue;
            available ??= new Dictionary<string, string>(state.Cache, StringComparer.Ordinal);
            revisions ??= new Dictionary<string, long>(state.CacheRevisions, StringComparer.Ordinal);
            available.Remove(key); revisions.Remove(key); excluded++;
        }
        return (available is null ? state : state with { Cache = available, CacheRevisions = revisions! }, excluded);
    }
    private static JsonObject TodoHistoryCopy(TodoHistoryView view, WorkspaceState state, int excluded)
    {
        var days = new JsonArray();
        foreach (var day in view.Days)
            days.Add(Obj(("date", day.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("complete", day.Complete),
                ("has_baseline", day.HasBaseline), ("issue", day.Issue), ("known_total", day.Total), ("known_done", day.Done),
                ("known_open", day.Open), ("filtered_count", day.FilteredCount), ("uncertain_operations", day.UncertainCount),
                ("items", new JsonArray(day.Items.Select(row => (JsonNode?)row.DeepClone()).ToArray())),
                ("note_entries", new JsonArray(day.Entries.Select(entry => (JsonNode?)Obj(("id", entry.Id), ("date", entry.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                    ("text", entry.Text), ("completed", entry.Completed), ("note", entry.NoteKnown ? entry.Note : null), ("note_known", entry.NoteKnown),
                    ("note_source", entry.NoteSource))).ToArray()))));
        return Obj(("source", "当前身份筛选后的本机待办日历副本，包含本机意图；范围统计不随筛选改变，不是服务端实时或同一瞬间快照，也不是可导入请求"),
            ("range_start", view.Range.Start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)), ("range_end", view.Range.End.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            ("view", view.Range.Period.ToString()), ("complete", view.Complete), ("covered_days", view.CoveredDays), ("known_total", view.Total),
            ("known_done", view.Done), ("known_open", view.Open), ("filtered_count", view.FilteredCount), ("uncertain_operations", view.UncertainCount),
            ("unattributed_operations", view.UnattributedOperationCount), ("excluded_foreign_days", excluded), ("local_revision", state.LocalRevision), ("days", days));
    }
}
