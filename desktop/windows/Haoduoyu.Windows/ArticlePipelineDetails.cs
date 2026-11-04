using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private static readonly JsonSerializerOptions ArticleReadableJson = new() { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private async Task ArticlePipelineDetailAsync(JsonObject record, string key)
    {
        await FlushEditorAsync();
        var baseline = (JsonObject)record.DeepClone();
        JsonObject? draft = null;
        if (Engine.Snapshot.Drafts.TryGetValue(key, out var local))
        {
            draft = JsonNode.Parse(local.Text) as JsonObject;
            if (draft is null || Text(draft, "kind") != "article" || Text(draft, "key") != key)
                throw new InvalidDataException("本机文章稿与详情身份不一致，原件保留。");
        }
        ClearPage(); heading.Text = "文章流水线详情"; page.Children.Add(heading);
        page.Children.Add(Label("以下是此文章的已读取记录或编辑基线，不代表服务器实时状态。未取得、未确认与真实零分别显示；路径和链接只作文字，不会打开或执行。"));
        var bar = new WrapPanel(); page.Children.Add(bar);
        bar.Children.Add(Button("返回原稿编辑", () => EditAsync("article", baseline, key)));
        var copy = Obj(("source", "本机保留的文章基线与草稿副本；不是服务器实时查询，也不是可导入请求"),
            ("resource_key", key), ("baseline", baseline.DeepClone()), ("local_draft", draft?.DeepClone()));
        bar.Children.Add(Button("查看完整只读副本", () => { ShowText("文章基线与本机稿（只读）", copy.ToJsonString(ArticleReadableJson)); return Task.CompletedTask; }));
        bar.Children.Add(Button("导出完整文章副本", () => ExportTextAsync("好多鱼文章流水线.txt", copy.ToJsonString(ArticleReadableJson))));

        ArticleDetailSection("记录与流水线", baseline, ["id", "version", "title", "account_id", "account_name", "platform", "status", "slot", "writer", "illustrator", "production_mode", "platform_article_id", "run_dir", "run_date", "series_no", "char_count", "subheading_count", "image_count", "started_at", "published_at", "url", "cover_desc", "summary", "notes", "date_status", "verify_state"]);
        ArticleDetailSection("草稿凭证", baseline["draft_ref"]);
        ArticleDetailSection("阶段时间线", baseline["timings"]);
        ArticleDetailSection("样本来源", baseline["sample"]);
        ArticleDetailSection("重跑记录", baseline["reruns"]);
        ArticleDetailSection("阻塞记录", baseline["blockers"]);
        ArticleDetailSection("待核清单（只读）", baseline["verify_items"]);
        ArticleDetailSection("警告", baseline["warnings"]);
        ArticleDetailSection("已记录的观察快照", baseline["observations"]);
        ArticleDetailSection("观察节点", baseline["nodes"]);
        ArticleDetailSection("快照时间线", baseline["timeline"]);
        ArticleDetailSection("最新指标", baseline["latest_metrics"]);
        ArticleDetailSection("记录来源", baseline, ["recorded_by", "last_modified_by", "created_at", "updated_at", "latest_as_of", "latest_collected_at"]);
        page.Children.Add(Label("本机草稿输入（独立保留）"));
        page.Children.Add(Label("下列输入可能尚未完成、格式无效或尚未同步，不代表服务器已保存；只读详情不会创建请求、核销待核项或改写原稿。返回后仍使用同一草稿与原始版本。"));
        ArticleDetailSection("当前本机输入", draft?["values"]);
    }

    private void ArticleDetailSection(string title, JsonNode? value, string[]? fields = null)
    {
        page.Children.Add(new TextBlock { Text = title, FontSize = 18, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 18, 0, 6) });
        var text = new StringBuilder();
        if (fields is not null && value is JsonObject record)
        {
            foreach (var name in fields) text.Append(ArticleDetailName(name)).Append("：").AppendLine(ArticleDetailValue(name, record[name]));
        }
        else if (value is JsonObject obj)
        {
            if (obj.Count == 0) text.Append("已取得空对象，未记录其他内容。");
            foreach (var pair in obj) text.Append(ArticleDetailName(pair.Key)).Append("：").AppendLine(ArticleDetailValue(pair.Key, pair.Value));
        }
        else if (value is JsonArray items)
        {
            if (items.Count == 0) text.Append("已取得空清单，没有已记录条目。");
            for (var index = 0; index < items.Count; index++)
            {
                text.Append("第 ").Append((index + 1).ToString(CultureInfo.InvariantCulture)).AppendLine(" 项");
                if (items[index] is JsonObject item)
                    foreach (var pair in item) text.Append("  ").Append(ArticleDetailName(pair.Key)).Append("：").AppendLine(ArticleDetailValue(pair.Key, pair.Value));
                else text.Append("  ").AppendLine(ArticleDetailValue("", items[index]));
                text.AppendLine();
            }
        }
        else text.Append(ArticleDetailValue("", value));
        var box = new TextBox { Tag = "article-detail-" + title, Text = text.ToString().TrimEnd(), IsReadOnly = true, AcceptsReturn = true,
            TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, MinHeight = 48, MaxHeight = 360 };
        AutomationProperties.SetAutomationId(box, "article-detail-" + title); page.Children.Add(box);
    }

    private static string ArticleDetailName(string name) => name switch
    {
        "id" => "文章标识", "version" => "版本", "title" => "标题", "account_id" => "运营账号标识", "account_name" => "运营账号", "platform" => "平台",
        "status" => "状态", "slot" => "槽位", "writer" => "写作者", "illustrator" => "配图者", "production_mode" => "生产方式", "platform_article_id" => "平台文章标识",
        "run_dir" => "流水线标识", "run_date" => "存稿日期", "series_no" => "系列编号", "char_count" => "字数", "subheading_count" => "小标题数", "image_count" => "图数",
        "started_at" => "流水线开始", "published_at" => "实际发布时间", "finished_at" => "流水线结束", "url" => "公开链接", "cover_desc" => "封面描述", "summary" => "概况", "notes" => "备注",
        "pgc_id" or "draft_pgc_id" => "头条草稿 pgc_id", "appmsgid" or "draft_appmsgid" => "公众号草稿 appmsgid", "editor_url" or "draft_editor_url" => "草稿编辑链接",
        "date_status" => "日期核验状态", "verify_state" => "待核状态", "done" => "处理状态", "label" => "事项", "description" => "说明", "text" => "内容", "message" => "信息", "type" => "类型",
        "reason" => "原因", "source" => "来源", "watchdog" => "看门狗重跑次数", "as_of" => "数据截至时间", "collected_at" => "采集时间", "kind" => "节点类型",
        "recorded_by" => "录入者", "last_modified_by" => "最后修改者", "created_at" => "录入时间", "updated_at" => "修改时间", "latest_as_of" => "最新指标截至时间", "latest_collected_at" => "最新指标采集时间",
        "draft_ref" => "草稿凭证", "timings" => "阶段时间线", "sample" => "样本来源", "reruns" => "重跑记录", "blockers" => "阻塞记录", "verify_items" => "待核清单",
        _ => name
    };

    private static string ArticleDetailValue(string name, JsonNode? value)
    {
        if (value is null) return name is "done" or "verify_state" ? "未确认" : "未取得";
        if (value is JsonValue primitive)
        {
            if (name == "done" && primitive.TryGetValue<bool>(out var done)) return done ? "已处理（true）" : "待处理（false）";
            if (primitive.TryGetValue<string>(out var raw))
            {
                if (raw.Length == 0) return "空文本（已记录）";
                if (name == "status") return raw switch { "drafting" => "起草中", "illustrated" => "已配图", "draft_saved" => "草稿已存", "published" => "已发布", "failed" => "受阻", _ => "未识别原值 · " + raw };
                if (name == "verify_state") return raw switch { "pending" => "有待处理项", "complete" => "已确认处理状态", "unknown" => "未确认", _ => "未识别原值 · " + raw };
                return raw;
            }
            return primitive.ToJsonString();
        }
        return value.ToJsonString(ArticleReadableJson);
    }
}
