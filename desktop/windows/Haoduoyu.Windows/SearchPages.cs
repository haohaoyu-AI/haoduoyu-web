using System.Globalization;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string localSearchQuery = "";
    private string? localSearchIdentity;
    private int localSearchOffset;

    private async Task LocalSearchAsync()
    {
        await FlushEditorAsync();
        if (localSearchIdentity != currentIdentity)
        { localSearchIdentity = currentIdentity; localSearchQuery = ""; localSearchOffset = 0; }
        currentPage = "本机检索"; ClearPage(); heading.Text = "本机检索"; page.Children.Add(heading);
        page.Children.Add(Label("仅检索当前工作区已保存在本机的业务资料、草稿与同步历史。多个词用空格分隔；未下载的资料不在检索范围内，不会联网查询。"));
        if (Engine.Snapshot.HistoryArchives.Count > 0)
            page.Children.Add(Label("已归档历史不在活动资料检索范围内，可从侧栏“历史档案”只读查看与导出。"));
        var input = new TextBox { Text = localSearchQuery, MaxLength = 1024, ToolTip = "最多256个Unicode字符，多个词需同时匹配" };
        page.Children.Add(input);
        async Task Submit()
        { localSearchQuery = input.Text; localSearchOffset = 0; await LocalSearchAsync(); }
        input.KeyDown += (_, args) => { if (args.Key == Key.Enter) { args.Handled = true; Run(Submit); } };
        page.Children.Add(Button("检索本机资料", Submit));
        if (string.IsNullOrWhiteSpace(localSearchQuery))
        { page.Children.Add(Label("输入关键词后检索。缓存、草稿、原请求和远端证据会分别标明来源。")); return; }
        var busy = Label("正在检索本机资料，可用顶部“取消当前操作”停止。"); page.Children.Add(busy);
        var target = Engine; var identity = currentIdentity; var query = localSearchQuery; var offset = localSearchOffset;
        var token = NetworkToken;
        var result = await Task.Run(() => WorkspaceSearch.Search(target.Snapshot, query, offset, 50, token));
        if (!ReferenceEquals(target, engine) || currentIdentity != identity)
            throw new InvalidOperationException("工作区已变化，本次检索结果未显示到其他身份。");
        page.Children.Remove(busy);
        page.Children.Add(Label((result.Complete ? "本机可用范围已检索" : "本次为局部结果，请缩小关键词；未读完整的来源不作为缺失依据") +
            $" · {(result.Complete ? "匹配" : "当前找到")} {result.TotalMatches} 条 · 第 {offset / 50 + 1} 页"));
        var paging = new WrapPanel(); page.Children.Add(paging);
        if (offset > 0) paging.Children.Add(Button("上一页", async () => { localSearchOffset = Math.Max(0, offset - 50); await LocalSearchAsync(); }));
        if (result.HasMore && offset + 50 < result.TotalMatches) paging.Children.Add(Button("下一页", async () => { localSearchOffset = offset + 50; await LocalSearchAsync(); }));
        List(result.Items.Select(hit => (hit.Title.Length > 0 ? hit.Title : SearchKindName(hit.Kind),
            SearchKindName(hit.Kind) + " · " + SearchOriginName(hit) + SearchCategoryName(hit.Category) + (hit.Date is { Length: > 0 } foundDay ? " · " + foundDay : "") + (hit.Deleted ? " · 删除/归档来源" : "") + "\n" + hit.Snippet,
            (Func<Task>)(() => OpenSearchHitAsync(hit)))));
        Message("检索完成；仅展示本机来源副本，编辑请回到原模块核对当前版本。");
    }

    private static string SearchOriginName(WorkspaceSearchHit hit)
    {
        var origin = hit.Origin switch
        {
            "cache" => "已保存缓存", "draft" => "本机草稿", "request" => "原请求历史",
            "prepared-request" => "实际冻结请求", "remote-evidence" => "远端响应证据", _ => "本机来源"
        };
        return origin + (hit.PendingStatus is { } status ? " · " + StatusLabel(status) : "");
    }
    private static string SearchCategoryName(string? category) => category switch { "work" => " · 工作", "life" => " · 生活", _ => "" };
    private static string SearchKindName(string kind) => kind switch
    {
        "todo" => "待办", "unscheduled" => "未安排事项", "template" => "常用事项", "note" => "碎碎念",
        "legacy" => "旧版日页", "memo" => "备忘录", "group" => "备忘录分组", "reminder" => "工作提醒",
        "article" => "文章台账", "ai-report" => "AI汇报", "label" => "标签", "history" => "保留的历史稿",
        _ => kind.StartsWith("review:", StringComparison.Ordinal) ? "内容复盘" : "本机资料"
    };

    private async Task OpenSearchHitAsync(WorkspaceSearchHit hit)
    {
        await FlushEditorAsync(); ClearPage(); heading.Text = hit.Title; page.Children.Add(heading);
        page.Children.Add(Label(SearchKindName(hit.Kind) + " · " + SearchOriginName(hit) + SearchCategoryName(hit.Category) + " · " + hit.Date));
        page.Children.Add(Label(hit.Origin == "remote-evidence"
            ? "此处只展示同步历史中的远端内容，是否确认以上方操作状态为准；不会据此自动重发或覆盖。"
            : hit.HasFullBody ? "本机来源副本。资料可能已被其他设备修改；编辑请回到原模块读取当前版本。" : "本机仅有此来源的摘要或部分字段，不代表完整正文；编辑前需回到原模块读取。"));
        string preview;
        try
        {
            var node = JsonNode.Parse(hit.SourceText);
            preview = ReviewPlainText(node is JsonObject obj ? obj["values"] ?? obj["data"] ?? node : node);
        }
        catch (System.Text.Json.JsonException) { preview = hit.SourceText; }
        page.Children.Add(new TextBox { Text = preview, IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap,
            MinHeight = 280, MaxHeight = 560, VerticalScrollBarVisibility = ScrollBarVisibility.Auto });
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("返回检索结果", LocalSearchAsync));
        actionsBar.Children.Add(Button("查看完整来源副本", () => { ShowText("本机来源副本（只读）", hit.SourcePath + "\n\n" + hit.SourceText); return Task.CompletedTask; }));
        actionsBar.Children.Add(Button("导出此来源副本", () => ExportTextAsync("好多鱼本机检索副本.txt", hit.SourceText)));
        if (hit.Kind != "history" && hit.LocalDraftKey is { Length: > 0 } draftKey)
            actionsBar.Children.Add(Button("继续此本机草稿", () => ContinueDraftAsync(draftKey)));
        if (hit.OperationId is { Length: > 0 } operationId)
            actionsBar.Children.Add(Button("核对原同步操作", async () =>
            {
                var operation = Engine.Snapshot.Outbox.SingleOrDefault(item => item.Id == operationId)
                    ?? throw new InvalidOperationException("原同步操作已变化，请返回同步中心核对。");
                await InspectOperationAsync(operation);
            }));
        actionsBar.Children.Add(Button("回到原模块", () => OpenSearchModuleAsync(hit)));
    }

    private Task OpenSearchModuleAsync(WorkspaceSearchHit hit)
    {
        if (DateTime.TryParseExact(hit.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
        { suppressDate = true; try { date.SelectedDate = day; } finally { suppressDate = false; } }
        if (hit.Kind == "ai-report" && day != default) { aiReportDay = day; aiReportAllDates = false; aiReportViewPage = 0; }
        if (hit.Kind == "template") { currentPage = "待办"; return TemplatesAsync(); }
        var module = hit.Kind switch
        {
            "todo" or "template" => "待办", "unscheduled" => "未安排", "note" or "legacy" => hit.Category == "work" ? "工作记录" : "生活记录",
            "memo" or "group" => "备忘录", "reminder" => "工作提醒", "article" => "文章台账", "ai-report" => "AI汇报", "label" => "标签",
            _ => hit.Kind.StartsWith("review:", StringComparison.Ordinal) ? "内容复盘" : "本机草稿"
        };
        if (hit.Kind.StartsWith("review:", StringComparison.Ordinal) && ReviewKinds.ContainsKey(hit.Kind[7..]))
        { reviewKind = hit.Kind[7..]; reviewOffset = 0; reviewReadRevision = null; }
        return NavigateAsync(module);
    }
}
