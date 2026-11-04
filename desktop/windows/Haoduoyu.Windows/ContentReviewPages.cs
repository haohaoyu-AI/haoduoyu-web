using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string reviewAccount = "V字", reviewKind = "overview", reviewRange = "7d", reviewWeek = "this";
    private int reviewOffset;
    private long? reviewReadRevision;
    private static readonly Dictionary<string, string> ReviewKinds = new()
    {
        ["overview"] = "内容复盘总览", ["articles"] = "复盘文章", ["snapshots"] = "指标快照", ["reports"] = "复盘报告",
        ["playbooks"] = "写作规则库", ["benchmark-accounts"] = "对标账号", ["benchmark-articles"] = "对标文章",
        ["notes"] = "复盘笔记", ["account-health"] = "账号健康"
    };
    private static readonly Dictionary<string, string> ReviewLabels = new()
    {
        ["account"]="账号", ["platform"]="平台", ["title"]="标题", ["url"]="文章链接", ["published_at"]="发布时间",
        ["topic_category"]="题材", ["title_pattern"]="标题形式", ["sample_title"]="参考标题", ["sample_url"]="参考链接",
        ["reference_article_id"]="对标文章", ["image_count"]="图片数", ["source_chat"]="材料来源", ["platform_article_id"]="平台文章标识",
        ["playbook_version_used"]="使用的规则库版本", ["applied_rule_ids"]="应用的规则", ["article_id"]="所属文章",
        ["snapshot_date"]="快照日期", ["age_hours"]="发布后小时数", ["source"]="数据来源", ["impressions"]="展现量",
        ["fan_impressions"]="粉丝展现量", ["reads"]="阅读量", ["fan_reads"]="粉丝阅读量", ["ctr"]="点击率（%）",
        ["completion_rate"]="读完率（%）", ["avg_read_seconds"]="平均阅读秒数", ["likes"]="点赞", ["comments"]="评论",
        ["reposts"]="转发", ["shares"]="分享", ["favorites"]="收藏", ["revenue"]="收益", ["traffic_sources"]="流量来源",
        ["completion_curve"]="阅读完成曲线", ["audience"]="受众", ["period_type"]="复盘周期", ["period_start"]="开始日期",
        ["period_end"]="结束日期", ["summary_md"]="复盘摘要", ["verdicts"]="文章结论", ["findings"]="规则检验",
        ["metrics"]="复盘指标", ["playbook_version"]="规则库版本", ["version"]="版本", ["published_on"]="发布日期",
        ["content_md"]="规则正文", ["rules"]="规则明细", ["changelog_md"]="修订记录", ["sent_to_gemini_at"]="交接时间",
        ["status"]="状态", ["name"]="名称", ["profile_url"]="主页", ["fans"]="粉丝数", ["is_featured_author"]="优质作者",
        ["posting_cadence"]="发布频率", ["topic_focus"]="题材重点", ["title_patterns"]="标题特征", ["structure_notes_md"]="结构观察",
        ["benchmark_account_id"]="所属对标账号", ["topic"]="选题", ["news_hook"]="新闻切入点", ["word_count"]="字数",
        ["collected_on"]="采集日期", ["used_by_article_ids"]="被哪些文章引用", ["note_date"]="笔记日期", ["kind"]="笔记类型",
        ["body_md"]="正文", ["tags"]="标签", ["related_article_ids"]="相关文章", ["related_rule_ids"]="相关规则", ["decided_by"]="决策人",
        ["observed_on"]="观察日期", ["impressions_per_day"]="日均展现", ["reads_per_day"]="日均阅读", ["since_date"]="起始日期",
        ["platform_notice"]="平台通知", ["judgement"]="判断", ["action"]="后续动作", ["resume_on"]="恢复日期",
        ["reads_24h"]="约24小时阅读", ["ctr_24h"]="约24小时点击率", ["completion_24h"]="约24小时读完率",
        ["verdict"]="当前结论", ["verdict_reliable"]="样本是否充分", ["sample24h"]="采用的近24小时样本",
        ["created_at"]="创建时间", ["updated_at"]="更新时间", ["deleted_at"]="删除时间", ["rule_id"]="规则编号",
        ["section"]="规则分类", ["text"]="规则文字", ["evidence"]="证据", ["evidence_note"]="证据说明", ["trials"]="试验次数",
        ["verified"]="已验证", ["overturned"]="已推翻", ["reason"]="原因", ["count"]="发布篇数", ["hit_rate"]="爆款率（%）",
        ["miss_rate"]="低表现率（%）", ["ctr_median"]="点击率中位数（%）", ["missing_24h_count"]="缺少近24小时样本",
        ["judged_count"]="可判断篇数", ["hits"]="爆款数", ["flops"]="低表现数", ["message"]="提示", ["date"]="日期"
    };
    private static string ReviewLabel(string name) => ReviewLabels.GetValueOrDefault(name, name);
    private static string ReviewValue(JsonNode? value) => value == null ? "未取得" : value.ToString() switch
    { "true" => "是", "false" => "否", "manual" => "手工录入", "toutiao_excel" => "头条导出表", "toutiao" => "今日头条", var text => text };

    private async Task ContentReviewAsync()
    {
        await FlushEditorAsync();
        page.Children.Clear(); heading.Text = "内容复盘"; page.Children.Add(heading);
        var toolbar = new WrapPanel(); page.Children.Add(toolbar);
        var account = new TextBox { Text = reviewAccount, Width = 160, ToolTip = "现有内容复盘账号名称" };
        toolbar.Children.Add(account);
        toolbar.Children.Add(Button("按账号查看", async () =>
        {
            reviewAccount = account.Text.Trim(); reviewOffset = 0; reviewReadRevision = null;
            await ContentReviewAsync();
        }));
        toolbar.Children.Add(Button("全部账号清单", async () => { reviewAccount = ""; reviewOffset = 0; reviewReadRevision = null; if(reviewKind=="overview")reviewKind="articles"; await ContentReviewAsync(); }));
        toolbar.Children.Add(Button("从第一页刷新", async () => { reviewOffset = 0; reviewReadRevision = null; await ContentReviewAsync(); }));
        var tabs = new WrapPanel(); page.Children.Add(tabs);
        foreach (var (kind, label) in ReviewKinds)
        {
            var selected = kind;
            tabs.Children.Add(Button((reviewKind == kind ? "● " : "") + label, async () =>
            { reviewKind = selected; reviewOffset = 0; reviewReadRevision = null; await ContentReviewAsync(); }));
        }
        if (reviewKind == "overview") { await ReviewOverviewAsync(); return; }
        if (reviewKind is "articles" or "snapshots")
            page.Children.Add(Button("＋ " + (reviewKind == "articles" ? "录入复盘文章" : "录入指标快照"), () => ReviewDraftAsync("review:" + reviewKind)));
        var basePath = "/api/v1/review/" + reviewKind;
        var query = "offset=" + reviewOffset.ToString(CultureInfo.InvariantCulture);
        if (reviewAccount.Length > 0) query += "&account=" + Uri.EscapeDataString(reviewAccount);
        if (reviewReadRevision.HasValue) query += "&read_revision=" + reviewReadRevision.Value.ToString(CultureInfo.InvariantCulture);
        var data = await ReadAsync(basePath + "?" + query); Missing(data);
        if (data?["read_revision"] is JsonValue revision && revision.TryGetValue<long>(out var value)) reviewReadRevision = value;
        page.Children.Add(Label($"{ReviewKinds[reviewKind]} · 第 {reviewOffset / 100 + 1} 页，每页最多 100 条。翻页固定读取版本；若服务提示已变化，请从第一页刷新。"));
        var paging = new WrapPanel(); page.Children.Add(paging);
        if (reviewOffset > 0) paging.Children.Add(Button("上一页", async () => { reviewOffset = Math.Max(0, reviewOffset - 100); await ContentReviewAsync(); }));
        if (Flag(data, "has_more")) paging.Children.Add(Button("下一页", async () => { reviewOffset += 100; await ContentReviewAsync(); }));
        var selectedKind = reviewKind;
        List(Rows(data?["items"]).Select(row =>
        {
            var title = Text(row, "title"); if (title.Length == 0) title = Text(row, "name");
            if (title.Length == 0) title = Text(row, "snapshot_date");
            if (title.Length == 0) title = selectedKind == "playbooks" ? "规则库 v" + Text(row, "version") : Text(row, "period_start") + Text(row, "observed_on");
            var subtitle = Text(row, "account") + " · " + (Text(row, "verdict") is { Length: > 0 } verdict ? verdict : ReviewKinds[selectedKind]);
            if (row["reads_24h"] != null) subtitle += " · 约24小时阅读 " + ReviewValue(row["reads_24h"]);
            return (title, subtitle, (Func<Task>)(() => ReviewDetailAsync(selectedKind, row)));
        }));
    }

    private async Task ReviewOverviewAsync()
    {
        if (reviewAccount.Length == 0) { page.Children.Add(Label("总览需要选择一个现有账号。可先在复盘文章清单查看账号名称。")); return; }
        var choices = new WrapPanel(); page.Children.Add(choices);
        choices.Children.Add(Button(reviewWeek == "this" ? "● 本周" : "本周", async () => { reviewWeek = "this"; await ContentReviewAsync(); }));
        choices.Children.Add(Button(reviewWeek == "last" ? "● 上周" : "上周", async () => { reviewWeek = "last"; await ContentReviewAsync(); }));
        choices.Children.Add(Button(reviewRange == "7d" ? "● 7天趋势" : "7天趋势", async () => { reviewRange = "7d"; await ContentReviewAsync(); }));
        choices.Children.Add(Button(reviewRange == "30d" ? "● 30天趋势" : "30天趋势", async () => { reviewRange = "30d"; await ContentReviewAsync(); }));
        var data = await ReadAsync("/api/v1/review/overview?account=" + Uri.EscapeDataString(reviewAccount) + "&range=" + reviewRange + "&week=" + reviewWeek);
        Missing(data); if (data == null) return;
        page.Children.Add(Label(Text(data, "start") + " — " + Text(data, "end")));
        page.Children.Add(new TextBlock { Text = Text(data, "summary"), FontSize = 20, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 12, 0, 16) });
        var metrics = new WrapPanel(); page.Children.Add(metrics);
        foreach (var name in new[] { "count", "hit_rate", "miss_rate", "ctr_median", "judged_count", "missing_24h_count" })
        {
            var panel = new StackPanel { Margin = new Thickness(0, 0, 22, 16), MinWidth = 150 };
            panel.Children.Add(Label(ReviewLabel(name)));
            panel.Children.Add(new TextBlock { Text = ReviewValue(data["current"]?[name]), FontSize = 26, FontWeight = FontWeights.SemiBold });
            if (data["changes"]?[name] is JsonObject change) panel.Children.Add(Label("较前一周：" + ReviewValue(change["delta"])));
            metrics.Children.Add(panel);
        }
        foreach (var alert in Rows(data["alerts"])) page.Children.Add(Label("提示：" + Text(alert, "message")));
        page.Children.Add(Label(Text(data, "conclusion")));
        if (data["trend"] is JsonArray trend)
        {
            var table = new DataGrid { IsReadOnly = true, AutoGenerateColumns = false, CanUserAddRows = false, MaxHeight = 320 };
            foreach (var (key, label) in new[] { ("date", "日期"), ("reads_median", "阅读中位数"), ("ctr_median", "点击率中位数（%）"), ("completion_median", "读完率中位数（%）") })
                table.Columns.Add(new DataGridTextColumn { Header = label, Binding = new System.Windows.Data.Binding("[" + key + "]") });
            table.ItemsSource = trend.OfType<JsonObject>().Select(r => r.ToDictionary(kv => kv.Key, kv => ReviewValue(kv.Value))).ToArray();
            page.Children.Add(table);
        }
    }

    private async Task ReviewDetailAsync(string kind, JsonObject row)
    {
        var path = "/api/v1/review/" + kind + "/" + Text(row, "id");
        var full = await ReadAsync(path);
        if (full is not JsonObject record) throw new InvalidOperationException("本机没有完整详情，请连接后读取。原记录不会用列表字段覆盖。");
        await FlushEditorAsync(); page.Children.Clear(); heading.Text = ReviewKinds[kind]; page.Children.Add(heading);
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("返回内容复盘", ContentReviewAsync));
        if (kind is "articles" or "snapshots") actionsBar.Children.Add(Button("编辑本机草稿", () => EditReviewAsync(kind, record, path)));
        if (kind == "articles") actionsBar.Children.Add(Button("为此文章录入快照", () =>
        {
            var id = Guid.NewGuid().ToString();
            return EditReviewAsync("snapshots", Obj(("id", id), ("article_id", Text(record, "id")), ("snapshot_date", Day), ("source", "manual")),
                "/api/v1/review/snapshots/" + id);
        }));
        actionsBar.Children.Add(Button("导出文字副本", () => ExportTextAsync("好多鱼内容复盘.txt", ReviewPlainText(record))));
        var tree = new TreeView { Margin = new Thickness(0, 12, 0, 0), BorderThickness = new Thickness(0) };
        foreach (var (key, value) in record)
        {
            if (key is "content_hash" or "id") continue;
            tree.Items.Add(ReviewTreeItem(key, value));
        }
        page.Children.Add(tree);
    }
    private static TreeViewItem ReviewTreeItem(string key, JsonNode? value)
    {
        var item = new TreeViewItem { IsExpanded = value is not JsonArray, Margin = new Thickness(0, 0, 0, 8) };
        if (value is JsonObject obj)
        {
            item.Header = ReviewLabel(key);
            foreach (var (name, child) in obj) item.Items.Add(ReviewTreeItem(name, child));
        }
        else if (value is JsonArray array)
        {
            item.Header = ReviewLabel(key) + "（" + array.Count + "项）";
            for (var index = 0; index < array.Count; index++) item.Items.Add(ReviewTreeItem((index + 1).ToString(CultureInfo.InvariantCulture), array[index]));
        }
        else item.Header = new TextBlock { Text = ReviewLabel(key) + "：" + ReviewValue(value), TextWrapping = TextWrapping.Wrap, MaxWidth = 880 };
        return item;
    }
    private static string ReviewPlainText(JsonNode? node, int depth = 0)
    {
        var indent = new string(' ', depth * 2);
        return node switch
        {
            JsonObject obj => string.Join("\n", obj.Where(kv => kv.Key is not "content_hash").Select(kv => indent + ReviewLabel(kv.Key) + "：" + (kv.Value is JsonValue || kv.Value == null ? ReviewValue(kv.Value) : "\n" + ReviewPlainText(kv.Value, depth + 1)))),
            JsonArray array => string.Join("\n", array.Select((value, index) => indent + (index + 1) + ". " + ReviewPlainText(value, depth + 1))),
            _ => ReviewValue(node)
        };
    }

    private sealed record ReviewField(string Name, string Label, string Type = "text", bool Required = false, bool Integer = false, double? Maximum = null);
    private static ReviewField[] ReviewFields(string kind) => kind switch
    {
        "articles" => [new("account","账号名称",Required:true),new("title","文章标题",Required:true),new("url","公开文章链接"),new("published_at","发布时间（北京时间，可填日期或 YYYY-MM-DD HH:mm:ss）","time"),
            new("platform_article_id","平台文章标识"),new("topic_category","题材分类"),new("title_pattern","标题形式"),new("sample_title","参考标题"),new("sample_url","参考文章链接"),
            new("reference_article_id","关联的对标文章标识"),new("image_count","图片数量","number",Integer:true),new("source_chat","素材或讨论来源"),new("playbook_version_used","采用的规则库版本","number",Integer:true),
            new("applied_rule_ids","采用的规则编号（每行一个，未知时留空）","lines")],
        "snapshots" => [new("article_id","所属复盘文章","article",true),new("snapshot_date","快照日期","date",true),new("age_hours","发布后小时数","number",Integer:true),
            new("source","数据来源","source"),new("impressions","展现量","number",Integer:true),new("fan_impressions","粉丝展现量","number",Integer:true),new("reads","阅读量","number",Integer:true),new("fan_reads","粉丝阅读量","number",Integer:true),
            new("ctr","点击率（百分数）","number",Maximum:100),new("completion_rate","读完率（百分数）","number",Maximum:100),new("avg_read_seconds","平均阅读秒数","number"),
            new("likes","点赞","number",Integer:true),new("comments","评论","number",Integer:true),new("reposts","转发","number",Integer:true),new("shares","分享","number",Integer:true),new("favorites","收藏","number",Integer:true),new("revenue","收益","number")],
        _ => throw new InvalidOperationException("此类复盘记录当前提供阅读与导出。")
    };
    private Task ReviewDraftAsync(string kind, string? key = null)
    {
        var resource = kind.StartsWith("review:", StringComparison.Ordinal) ? kind[7..] : kind;
        if (resource is not ("articles" or "snapshots")) throw new InvalidOperationException("草稿类型无法识别，原文保留。");
        if (key != null && Engine.Snapshot.Drafts.TryGetValue(key, out var draft))
        {
            var saved = JsonNode.Parse(draft.Text)?.AsObject() ?? throw new InvalidDataException("复盘草稿格式损坏，原文件保留。");
            return EditReviewAsync(resource, saved["original"]!.DeepClone().AsObject(), key);
        }
        if (key != null) throw new InvalidOperationException("该本机草稿未找到，未创建替代记录。原分区文件保留。");
        var id = Guid.NewGuid().ToString();
        var record = resource == "articles" ? Obj(("id", id), ("account", reviewAccount.Length == 0 ? "V字" : reviewAccount), ("platform", "toutiao")) :
            Obj(("id", id), ("snapshot_date", Day), ("source", "manual"));
        return EditReviewAsync(resource, record, "/api/v1/review/" + resource + "/" + id);
    }
    private async Task EditReviewAsync(string kind, JsonObject record, string key)
    {
        await FlushEditorAsync();
        var original = (JsonObject)record.DeepClone(); var values = (JsonObject)record.DeepClone();
        if (Engine.Snapshot.Drafts.TryGetValue(key, out var draft))
        {
            var saved = JsonNode.Parse(draft.Text)?.AsObject() ?? throw new InvalidDataException("复盘草稿无法读取。");
            if (Text(saved,"kind") != "review:" + kind || Text(saved,"key") != key) throw new InvalidDataException("复盘草稿身份不一致。");
            original = saved["original"]!.DeepClone().AsObject(); values = saved["values"]!.DeepClone().AsObject();
        }
        var articleOptions = new List<ReviewArticleChoice>();
        if (kind == "snapshots")
        {
            var articles = await ReadAsync("/api/v1/review/articles?offset=0");
            articleOptions.AddRange(Rows(articles?["items"]).Select(r => new ReviewArticleChoice(Text(r,"id"),Text(r,"title"))));
            var selected = Text(values,"article_id");
            if (selected.Length > 0 && articleOptions.All(a=>a.Id != selected)) articleOptions.Add(new ReviewArticleChoice(selected,"原记录所属文章（" + selected[..Math.Min(8,selected.Length)] + "）"));
        }
        page.Children.Clear(); heading.Text = kind == "articles" ? "复盘文章" : "指标快照"; page.Children.Add(heading);
        page.Children.Add(Label("先保存在本机加密草稿，点击保存才会排队。未知指标留空；真实为零才填写 0。现有未编辑的分析、规则关联和嵌套数据会保留。"));
        var hash = Text(original,"content_hash");
        if (hash.Length > 0) page.Children.Add(Label("本机草稿保留原读取版本：" + hash[..Math.Min(12,hash.Length)] + "。服务器出现更新时会停止并保留两份内容。"));
        var controls = new Dictionary<string, Func<string>>(); var generation = 0;
        foreach (var field in ReviewFields(kind))
        {
            page.Children.Add(Label(field.Label + (field.Required ? " *" : "")));
            if (field.Type == "article")
            {
                var combo = new ComboBox { ItemsSource = articleOptions, DisplayMemberPath="Title", SelectedValuePath="Id", SelectedValue=Text(values,field.Name) };
                controls[field.Name]=()=>combo.SelectedValue?.ToString()??"";
                combo.SelectionChanged+=(_,_)=>Changed(); page.Children.Add(combo);
            }
            else if (field.Type == "date")
            {
                var picker=new DatePicker { SelectedDate=DateTime.TryParseExact(Text(values,field.Name),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var selected)?selected:null, Margin=new Thickness(0,4,0,12) };
                controls[field.Name]=()=>picker.SelectedDate?.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)??"";
                picker.SelectedDateChanged+=(_,_)=>Changed(); page.Children.Add(picker);
            }
            else if (field.Type == "source")
            {
                var combo = new ComboBox { ItemsSource=new[] {new ReviewArticleChoice("manual","手工录入"),new ReviewArticleChoice("toutiao_excel","头条导出表")},DisplayMemberPath="Title",SelectedValuePath="Id",SelectedValue=Text(values,field.Name) };
                controls[field.Name]=()=>combo.SelectedValue?.ToString()??"";combo.SelectionChanged+=(_,_)=>Changed();page.Children.Add(combo);
            }
            else
            {
                var text=field.Type=="lines"&&values[field.Name] is JsonArray lines?string.Join("\n",lines.Select(ReviewValue)):field.Type=="time"?ReviewTimeDisplay(values[field.Name]):Text(values,field.Name);
                var box=new TextBox { Text=text, AcceptsReturn=field.Type=="lines",TextWrapping=TextWrapping.Wrap,MinHeight=field.Type=="lines"?90:40,MaxHeight=220,VerticalScrollBarVisibility=ScrollBarVisibility.Auto };
                controls[field.Name]=()=>box.Text;box.TextChanged+=(_,_)=>Changed();page.Children.Add(box);
            }
        }
        void Changed(){generation++;draftDirty=true;draftTimer.Stop();draftTimer.Start();}
        JsonObject Current()
        {
            var current=(JsonObject)values.DeepClone();
            foreach(var (name,read) in controls)
            {
                var text=read();
                try { _ = new UTF8Encoding(false,true).GetByteCount(text); }
                catch(EncoderFallbackException) { throw new InvalidOperationException("输入中存在不完整的 Unicode 字符，请保留当前窗口并完成输入后再保存。"); }
                current[name]=text;
            }
            return current;
        }
        saveEditor=async()=>
        {
            var captured=generation;var value=Current();
            var saved=Obj(("kind","review:"+kind),("key",key),("original",original.DeepClone()),("values",value));
            await SaveLocalDraftAsync(new LocalDraft {Key=key,Text=saved.ToJsonString(),Title=Text(value,"title") is {Length:>0}title?title:"指标快照 · "+Text(value,"snapshot_date"),BaseVersion=0});
            draftDirty=generation!=captured;if(draftDirty){draftTimer.Stop();draftTimer.Start();}
        };
        var bar=new WrapPanel {Margin=new Thickness(0,12,0,0)};page.Children.Add(bar);
        bar.Children.Add(Button(connected?"保存并同步":"存入本机待同步队列",async()=>
        {
            var command=BuildReviewSave(kind,original,Current());draftDirty=true;
            await QueueAsync(command.Method,command.Path,command.Body,key);
        }));
        bar.Children.Add(Button("保存本机草稿",async()=>{draftDirty=true;await SaveDraftSafelyAsync();}));
        bar.Children.Add(Button("导出文字",()=>ExportTextAsync("好多鱼复盘草稿.txt",string.Join("\n\n",ReviewFields(kind).Select(f=>f.Label+"\n"+controls[f.Name]())))));
        bar.Children.Add(Button("返回内容复盘",ContentReviewAsync));
        draftDirty=true;await saveEditor();
    }
    private sealed record ReviewArticleChoice(string Id,string Title);
    private static string ReviewTimeDisplay(JsonNode? value)
    {
        var text=value?.ToString()??"";
        if(text.Length==10)return text;
        return DateTimeOffset.TryParse(text,CultureInfo.InvariantCulture,DateTimeStyles.None,out var stamp)?stamp.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd HH:mm:ss",CultureInfo.InvariantCulture):text;
    }
    private sealed record ReviewSave(string Method,string Path,JsonObject Body);
    private static ReviewSave BuildReviewSave(string kind,JsonObject original,JsonObject values)
    {
        var id=Text(original,"id");if(!Guid.TryParseExact(id,"D",out _))throw new InvalidOperationException("本机记录缺少稳定标识，原稿保留。");
        var body=new JsonObject();
        var originalHash=Text(original,"content_hash");
        if(originalHash.Length>0&&(originalHash.Length!=64||originalHash.Any(c=>!char.IsAsciiHexDigitLower(c))))throw new InvalidOperationException("原记录校验标识无效，已保留本机稿，请重新读取完整详情。");
        var editing=originalHash.Length==64;
        if(editing)body["expected_hash"]=Text(original,"content_hash");
        else if(kind=="articles")body["platform"]="toutiao";
        foreach(var field in ReviewFields(kind))
        {
            var fieldText = field.Type == "lines" && values[field.Name] is JsonArray array ? string.Join("\n",array.Select(ReviewValue)) : Text(values,field.Name);
            var raw=fieldText.Replace("\r\n","\n").Replace('\r','\n').Trim();
            var maximumBytes=field.Name switch { "account"=>120,"title" or "sample_title"=>2000,"platform_article_id" or "topic_category"=>240,"title_pattern"=>1000,_=>4096 };
            int length;
            try { length=new UTF8Encoding(false,true).GetByteCount(raw); }
            catch(EncoderFallbackException) { throw new InvalidOperationException(field.Label+"含不完整的Unicode字符，请保留草稿后完成输入。"); }
            if(raw.Any(ch=>ch<32&&ch is not '\n' and not '\t'||ch==127)||length>maximumBytes)throw new InvalidOperationException(field.Label+"内容过长或包含无效字符，原稿保留。");
            if(field.Required&&raw.Length==0)throw new InvalidOperationException("请填写"+field.Label+"。");
            JsonNode? value;
            if(raw.Length==0)value=null;
            else if(field.Type=="number")
            {
                if(!decimal.TryParse(raw,NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out var number)||number<0||number>9007199254740991M||field.Integer&&decimal.Truncate(number)!=number||field.Maximum.HasValue&&number>(decimal)field.Maximum.Value)
                    throw new InvalidOperationException(field.Label+"须为有效非负数；未知时留空。");
                value=field.Integer?JsonValue.Create((long)number):JsonValue.Create(number);
                if(field.Name=="playbook_version_used"&&number<1)throw new InvalidOperationException("规则库版本应从 1 开始。");
            }
            else if(field.Type=="date")
            {
                if(!DateOnly.TryParseExact(raw,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date))throw new InvalidOperationException("请选择有效快照日期。");
                value=JsonValue.Create(date.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture));
            }
            else if(field.Type=="time")
            {
                if(raw==ReviewTimeDisplay(original[field.Name])||raw==Text(original,field.Name))value=original[field.Name]?.DeepClone();
                else if(DateOnly.TryParseExact(raw,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date))value=JsonValue.Create(date.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture));
                else if(DateTime.TryParseExact(raw,new[]{"yyyy-MM-dd HH:mm","yyyy-MM-dd HH:mm:ss"},CultureInfo.InvariantCulture,DateTimeStyles.None,out var local))value=JsonValue.Create(new DateTimeOffset(DateTime.SpecifyKind(local,DateTimeKind.Unspecified),TimeSpan.FromHours(8)).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture));
                else throw new InvalidOperationException("发布时间请填有效日期或北京时间 YYYY-MM-DD HH:mm:ss。");
            }
            else if(field.Type=="lines")
            {
                var lines=raw.Split('\n',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries);
                if(lines.Distinct(StringComparer.Ordinal).Count()!=lines.Length||lines.Any(line=>Encoding.UTF8.GetByteCount(line)>120))throw new InvalidOperationException("规则编号不可重复，每条最多 120 字节。");
                value=new JsonArray(lines.Select(line=>(JsonNode?)JsonValue.Create(line)).ToArray());
            }
            else
            {
                if(field.Name is "url" or "sample_url")
                {
                    if(!Uri.TryCreate(raw,UriKind.Absolute,out var url)||url.Scheme is not("http" or "https")||url.UserInfo.Length>0)throw new InvalidOperationException("请填写不含账号口令的HTTP/HTTPS链接。");
                }
                if(field.Name is "article_id" or "reference_article_id"&&!Guid.TryParseExact(raw,"D",out _))throw new InvalidOperationException("关联文章标识无效，请重新选择。");
                if(field.Type=="source"&&raw is not("manual" or "toutiao_excel"))throw new InvalidOperationException("请选择已支持的数据来源。");
                value=JsonValue.Create(raw);
            }
            body[field.Name]=value;
        }
        // PATCH changes only native form fields, retaining all unexposed nested analytics and provider data.
        // PUT for new records uses the server defaults for nullable nested fields.
        return new(editing?"PATCH":"PUT","/api/v1/review/"+kind+"/"+id,body);
    }

    private async Task RebaseReviewDraftsAsync()
    {
        foreach(var operation in Engine.Snapshot.Outbox.Where(o=>o.Status==PendingStatus.Confirmed&&o.RemoteJson!=null&&o.Path.StartsWith("/api/v1/review/",StringComparison.Ordinal)))
        {
            if(!Engine.Snapshot.Drafts.TryGetValue(operation.ResourceKey,out var draft))continue;
            var saved=JsonNode.Parse(draft.Text)?.AsObject();var kind=Text(saved,"kind");
            if(kind is not("review:articles" or "review:snapshots")||saved?["original"] is not JsonObject original||saved["values"] is not JsonObject values)continue;
            ReviewSave command;
            try { command=BuildReviewSave(kind[7..],original,values); }
            catch(Exception error) when(error is InvalidOperationException or ArgumentException or FormatException or OverflowException)
            { continue; } // A later invalid draft is retained and must not prevent confirmation of other records.
            if(command.Method!=operation.Method||command.Path!=operation.Path||!JsonNode.DeepEquals(command.Body,JsonNode.Parse(operation.BodyJson)))continue;
            if(Data(operation.RemoteJson!) is not JsonObject remote||Text(remote,"id")!=Text(original,"id")||Text(remote,"content_hash").Length!=64)continue;
            saved["original"]=remote.DeepClone();
            await SaveLocalDraftAsync(draft with {Text=saved.ToJsonString()});
        }
    }
}
