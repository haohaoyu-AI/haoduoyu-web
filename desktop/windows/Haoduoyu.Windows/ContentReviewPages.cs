using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private string reviewAccount = "", reviewKind = "overview", reviewRange = "7d", reviewWeek = "this";
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
        ClearPage(); heading.Text = "内容复盘"; page.Children.Add(heading);
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
        page.Children.Add(Button("＋ 新建" + ReviewKinds[reviewKind], () => ReviewDraftAsync("review:" + reviewKind)));
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
        if (reviewAccount.Length == 0)
        {
            var records=await ReadAsync("/api/v1/review/articles?offset=0");
            var accounts=Rows(records?["items"]).Select(row=>Text(row,"account")).Where(name=>name.Length>0).Distinct(StringComparer.Ordinal).ToArray();
            if(accounts.Length>0)
            {
                page.Children.Add(Label("从实际读取的复盘文章中选择账号后查看总览。"));
                var picker=new ComboBox {ItemsSource=accounts,MinWidth=220};page.Children.Add(picker);
                page.Children.Add(Button("查看所选账号总览",async()=>
                {
                    if(picker.SelectedItem is not string selected)throw new InvalidOperationException("请先选择一个实际账号。");
                    reviewAccount=selected;reviewOffset=0;reviewReadRevision=null;await ContentReviewAsync();
                }));
            }
            else page.Children.Add(Label(records==null?"本机尚未保存可用复盘账号。连接后读取已有资料，或直接填写自己的原生记录。":"当前读取的复盘文章清单为空。填写真实账号和资料后即可开始复盘。"));
            page.Children.Add(Button("录入复盘文章",()=>ReviewDraftAsync("review:articles")));
            page.Children.Add(Button("新建复盘报告",()=>ReviewDraftAsync("review:reports")));
            page.Children.Add(Button("新建写作规则库",()=>ReviewDraftAsync("review:playbooks")));
            return;
        }
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
        await FlushEditorAsync(); ClearPage(); heading.Text = ReviewKinds[kind]; page.Children.Add(heading);
        var actionsBar = new WrapPanel(); page.Children.Add(actionsBar);
        actionsBar.Children.Add(Button("返回内容复盘", ContentReviewAsync));
        actionsBar.Children.Add(Button("编辑本机草稿", async () =>
        {
            if(await HandlePendingRecordAsync(record))return;
            await EditReviewAsync(kind,record,path);
        }));
        if (kind == "articles") actionsBar.Children.Add(Button("为此文章录入快照", async () =>
        {
            if(await HandlePendingRecordAsync(record))return;
            var id = Guid.NewGuid().ToString();
            var snapshot=ReviewFormLogic.New("snapshots",id,reviewAccount,Day);snapshot["article_id"]=Text(record,"id");
            await EditReviewAsync("snapshots", snapshot,"/api/v1/review/snapshots/" + id);
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

    private static IReadOnlyList<ReviewFormField> ReviewFields(string kind) => ReviewFormLogic.Fields(kind);
    private Task ReviewDraftAsync(string kind, string? key = null)
    {
        var resource = kind.StartsWith("review:", StringComparison.Ordinal) ? kind[7..] : kind;
        if (!ReviewFormLogic.Kinds.Contains(resource)) throw new InvalidOperationException("草稿类型无法识别，原文保留。");
        if (key != null && Engine.Snapshot.Drafts.TryGetValue(key, out var draft))
        {
            var saved = JsonNode.Parse(draft.Text)?.AsObject() ?? throw new InvalidDataException("复盘草稿格式损坏，原文件保留。");
            return EditReviewAsync(resource, saved["original"]!.DeepClone().AsObject(), key);
        }
        if (key != null) throw new InvalidOperationException("该本机草稿未找到，未创建替代记录。原分区文件保留。");
        var id = Guid.NewGuid().ToString();
        var record = ReviewFormLogic.New(resource, id, reviewAccount, Day);
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
        var options = await LoadReviewOptionsAsync(ReviewFields(kind));
        ClearPage(); heading.Text = ReviewKinds[kind]; page.Children.Add(heading);
        page.Children.Add(Label("先保存到本机加密草稿，点击保存才会排队。未知指标留空，真实为零才填 0；关联从现有资料选择。所有表格行和未编辑的嵌套资料都会保留。"));
        var hash = Text(original,"content_hash");
        if (hash.Length > 0) page.Children.Add(Label("本机草稿保留原读取版本：" + hash[..Math.Min(12,hash.Length)] + "。服务器出现更新时会停止并保留两份内容。"));
        var controls = new Dictionary<string, Func<JsonNode?>>();
        var pendingControls = new Dictionary<string,Func<JsonObject?>>(); var generation = 0;
        void Changed() { generation++; draftDirty=true; draftTimer.Stop(); draftTimer.Start(); }
        foreach (var field in ReviewFields(kind))
        {
            page.Children.Add(Label(field.Label + (field.Required ? " *" : "")));
            if (field.Type is "strings" or "references" or "rules" or "verdicts" or "findings" or "metrics" or "object" or "structure" or "notice")
            {
                var editor=BuildReviewStructuredControl(field,values[field.Name],options,Changed,values["__native_pending_"+field.Name] as JsonObject);
                page.Children.Add(editor.View);controls[field.Name]=editor.Read;pendingControls[field.Name]=editor.Pending;
            }
            else if(field.Type=="reference")
            {
                var selected=Text(values,field.Name);
                var references=options.GetValueOrDefault(field.ReferenceKind??"",[]).ToList();
                if(selected.Length>0&&references.All(r=>r.Id!=selected))references.Add(new(selected,"原关联记录（"+selected[..Math.Min(8,selected.Length)]+"）"));
                references.Insert(0,new("","未选择"));
                var combo=new ComboBox {ItemsSource=references,DisplayMemberPath="Title",SelectedValuePath="Id",SelectedValue=selected};
                controls[field.Name]=()=>JsonValue.Create(combo.SelectedValue?.ToString()??"");combo.SelectionChanged+=(_,_)=>Changed();page.Children.Add(combo);
            }
            else if(field.Type is "choice" or "boolean")
            {
                var choices=field.Type=="boolean"?new[]{"true","false"}:field.Choices??[];
                if(kind=="reports"&&field.Name=="period_type"&&Text(original,"period_type")!="three_day")choices=choices.Where(value=>value!="three_day").ToArray();
                var rows=new[]{new ReviewArticleChoice("","未选择")}.Concat(choices.Select(value=>new ReviewArticleChoice(value,ReviewChoiceLabel(value)))).ToArray();
                var combo=new ComboBox {ItemsSource=rows,DisplayMemberPath="Title",SelectedValuePath="Id",SelectedValue=Text(values,field.Name).ToLowerInvariant()};
                controls[field.Name]=()=>JsonValue.Create(combo.SelectedValue?.ToString()??"");combo.SelectionChanged+=(_,_)=>Changed();page.Children.Add(combo);
            }
            else if(field.Type=="date")
            {
                var picker=new DatePicker {SelectedDate=DateTime.TryParseExact(Text(values,field.Name),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var selected)?selected:null,Margin=new Thickness(0,4,0,12)};
                var readDate=ReviewDateInput(picker,Text(values,field.Name),Changed);
                controls[field.Name]=()=>JsonValue.Create(readDate());page.Children.Add(picker);
            }
            else
            {
                var text=field.Type=="time"?ReviewTimeDisplay(values[field.Name]):Text(values,field.Name);
                var multiline=field.Type is "content" or "longtext";
                var box=new TextBox {Text=text,AcceptsReturn=multiline,TextWrapping=TextWrapping.Wrap,MinHeight=multiline?150:40,MaxHeight=420,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
                controls[field.Name]=()=>JsonValue.Create(box.Text);box.TextChanged+=(_,_)=>Changed();page.Children.Add(box);
                if(field.Type=="time")page.Children.Add(Label("可填日期或北京时间 YYYY-MM-DD HH:mm:ss；留空表示未取得。"));
            }
        }
        JsonObject Current()
        {
            var current=(JsonObject)values.DeepClone();
            foreach(var(name,read)in controls)current[name]=read()?.DeepClone();
            foreach(var(name,read)in pendingControls)
            {
                var pending=read();var property="__native_pending_"+name;
                if(pending==null)current.Remove(property);else current[property]=pending.DeepClone();
            }
            // Reject incomplete UTF-16 before the JSON serializer could replace it in a durable draft.
            ReviewEnsureUnicode(current);return current;
        }
        saveEditor=async()=>
        {
            var captured=generation;var value=Current();
            var saved=Obj(("kind","review:"+kind),("key",key),("original",original.DeepClone()),("values",value));
            var title=Text(value,"title");if(title.Length==0)title=Text(value,"name");if(title.Length==0)title=ReviewKinds[kind]+" · "+Text(value,"snapshot_date")+Text(value,"period_start")+Text(value,"observed_on");
            await SaveLocalDraftAsync(new LocalDraft {Key=key,Text=saved.ToJsonString(),Title=title,BaseVersion=0});
            draftDirty=generation!=captured;if(draftDirty){draftTimer.Stop();draftTimer.Start();}
        };
        var bar=new WrapPanel {Margin=new Thickness(0,12,0,0)};page.Children.Add(bar);
        bar.Children.Add(Button(connected?"保存并同步":"存入本机待同步队列",async()=>
        {
            var value=Current();var command=BuildReviewSave(kind,original,value);draftDirty=true;
            reviewKind=kind;reviewOffset=0;reviewReadRevision=null;currentPage="内容复盘";
            if(Text(value,"account") is {Length:>0} account)reviewAccount=account;
            await QueueAsync(command.Method,command.Path,command.Body,key);
        }));
        bar.Children.Add(Button("保存本机草稿",async()=>{draftDirty=true;await SaveDraftSafelyAsync();}));
        bar.Children.Add(Button("导出文字",()=>ExportTextAsync("好多鱼复盘草稿.txt",ReviewPlainText(Current()))));
        bar.Children.Add(Button("返回内容复盘",ContentReviewAsync));
        draftDirty=true;await saveEditor();
    }
    private async Task<Dictionary<string,List<ReviewArticleChoice>>> LoadReviewOptionsAsync(IReadOnlyList<ReviewFormField> fields)
    {
        var needed=new HashSet<string>(fields.Where(f=>f.ReferenceKind!=null).Select(f=>f.ReferenceKind!),StringComparer.Ordinal);
        if(fields.Any(f=>f.Type is "rules" or "verdicts"))needed.Add("articles");
        if(fields.Any(f=>f.Type is "rules" or "findings"))needed.Add("rules");
        var result=new Dictionary<string,List<ReviewArticleChoice>>(StringComparer.Ordinal);
        foreach(var target in needed)
        {
            var resource=target=="rules"?"playbooks":target;var choices=new List<ReviewArticleChoice>();long? revision=null;
            for(var offset=0;offset<10000;offset+=100)
            {
                var path="/api/v1/review/"+resource+"?offset="+offset.ToString(CultureInfo.InvariantCulture);
                if(reviewAccount.Length>0)path+="&account="+Uri.EscapeDataString(reviewAccount);
                if(revision.HasValue)path+="&read_revision="+revision.Value.ToString(CultureInfo.InvariantCulture);
                var data=await ReadAsync(path);if(data==null)break;
                if(data["read_revision"] is JsonValue rev&&rev.TryGetValue<long>(out var number))revision=number;
                foreach(var row in Rows(data["items"]))
                {
                    if(target=="rules")foreach(var rule in Rows(row["rules"]))
                    {
                        var ruleId=Text(rule,"rule_id");if(choices.All(c=>c.Id!=ruleId))choices.Add(new(ruleId,ruleId+" · "+Text(rule,"text")));
                    }
                    else choices.Add(new(Text(row,"id"),(Text(row,"title") is {Length:>0}title?title:Text(row,"name"))+" · "+Text(row,"account")));
                }
                if(!Flag(data,"has_more"))break;
                if(offset==9900)throw new InvalidOperationException("关联资料超过本次完整选择上限，已保留草稿。请按具体账号筛选后重新打开。");
            }
            result[target]=choices;
        }
        return result;
    }
    private static string ReviewChoiceLabel(string value)=>value switch
    {
        "daily"=>"日复盘","weekly"=>"周复盘","three_day"=>"历史三日复盘","draft"=>"草稿","active"=>"使用中","archived"=>"已归档",
        "insight"=>"观察洞见","decision"=>"决策","diagnosis"=>"诊断","account_health"=>"账号健康","normal"=>"正常","manual"=>"手工录入","toutiao_excel"=>"头条导出表","true"=>"是","false"=>"否",_=>value
    };
    private static void ReviewEnsureUnicode(JsonNode? value)
    {
        if(value is JsonValue scalar&&scalar.TryGetValue<string>(out var text))
        {try{_=new UTF8Encoding(false,true).GetByteCount(text);}catch(EncoderFallbackException){throw new InvalidOperationException("输入中存在不完整的Unicode字符，请保持窗口并完成输入后再保存。");}}
        else if(value is JsonObject obj)foreach(var(_,child)in obj)ReviewEnsureUnicode(child);
        else if(value is JsonArray array)foreach(var child in array)ReviewEnsureUnicode(child);
    }
    private sealed record ReviewArticleChoice(string Id,string Title);
    private static string ReviewTimeDisplay(JsonNode? value) => ReviewFormLogic.TimeDisplay(value);
    private sealed record ReviewSave(string Method,string Path,JsonObject Body);
    private static ReviewSave BuildReviewSave(string kind,JsonObject original,JsonObject values)
    {
        var command = ReviewFormLogic.Build(kind, original, values);
        return new(command.Method, command.Path, command.Body);
    }

    private async Task RebaseReviewDraftsAsync()
    {
        foreach(var operation in Engine.Snapshot.Outbox.Where(o=>o.Status==PendingStatus.Confirmed&&o.RemoteJson!=null&&o.Path.StartsWith("/api/v1/review/",StringComparison.Ordinal)).OrderBy(o=>o.ConfirmedRevision))
        {
            if(!Engine.Snapshot.Drafts.TryGetValue(operation.ResourceKey,out var draft))continue;
            if(operation.ConfirmedRevision<=draft.BaselineConfirmedRevision)continue;
            var saved=JsonNode.Parse(draft.Text)?.AsObject();var kind=Text(saved,"kind");
            if(!kind.StartsWith("review:", StringComparison.Ordinal)||!ReviewFormLogic.Kinds.Contains(kind[7..])||saved?["original"] is not JsonObject original||saved["values"] is not JsonObject values)continue;
            var queuedBody=JsonNode.Parse(operation.RequestBodyJson)?.AsObject();
            var targetPath="/api/v1/review/"+kind[7..]+"/"+Text(original,"id");
            var targetMethod=Text(original,"content_hash").Length==0?"PUT":"PATCH";
            if(targetMethod!=operation.Method||targetPath!=operation.Path||queuedBody==null||Text(original,"content_hash")!=Text(queuedBody,"expected_hash"))continue;
            if(Data(operation.RemoteJson!) is not JsonObject remote||Text(remote,"id")!=Text(original,"id")||Text(remote,"content_hash").Length!=64)continue;
            saved["original"]=remote.DeepClone();
            await SaveLocalDraftAsync(draft with {Text=saved.ToJsonString(),BaselineConfirmedRevision=operation.ConfirmedRevision});
        }
    }
}
