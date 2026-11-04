using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Automation;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private sealed record Field(string Name, string Label, bool Multiline = false, string[]? Choices = null);
    private static Field[] Fields(string kind) => kind switch
    {
        "todo" or "template" => [new("text", "内容（最多 500 字符）")],
        "note" or "legacy" => [new("text", "正文", true)],
        "memo" => [new("title", "标题"), new("body", "正文", true)],
        "group" => [new("title", "分组名称")],
        "reminder" => [new("summary", "提醒摘要", true)],
        "article" => [new("title", "文章标题"), new("account_id", "运营账号 ID"),
            new("status", "文章状态", Choices: ["drafting", "illustrated", "draft_saved", "published", "failed"]),
            new("url", "公开链接（仅已发布状态填写）"), new("published_at", "实际发布时间（ISO 8601，含时区）"),
            new("started_at", "生产开始时间（ISO 8601，含时区）"),
            new("production_mode", "生产方式", Choices: ["unknown", "automatic", "manual", "mixed"]),
            new("summary", "摘要", true), new("notes", "备注", true),
            new("platform_article_id", "平台文章标识（未知留空）"),
            new("slot", "槽位（未知留空）", Choices: ["zh1", "zh2", "tt1", "tt2", "zh3", "tt3", "gzh"]),
            new("writer", "写作者（未知留空）", Choices: ["dedao", "gemini_web", "human", "other"]),
            new("illustrator", "配图者（未知留空）", Choices: ["codex", "pil", "human"]),
            new("run_dir", "流水线标识（仅文字，不会打开或执行）"), new("run_date", "存稿日期（YYYY-MM-DD，未知留空）"),
            new("series_no", "系列编号（正整数，未知留空）"), new("char_count", "字数（非负整数，未知留空）"),
            new("subheading_count", "小标题数（非负整数，未知留空）"), new("image_count", "图数（非负整数，未知留空）"),
            new("cover_desc", "封面描述", true), new("finished_at", "流水线结束（ISO 8601，含时区）"),
            new("draft_pgc_id", "头条草稿 pgc_id（未知留空）"), new("draft_appmsgid", "公众号草稿 appmsgid（未知留空）"),
            new("draft_editor_url", "草稿编辑链接（仅文字，不会打开）")],
        _ => throw new InvalidOperationException("该记录没有可用编辑器。")
    };

    private async Task EditAsync(string kind, JsonObject record, string key)
    {
        await FlushEditorAsync();
        ClearPage(); heading.Text = kind switch { "note" => "碎碎念", "legacy" => "旧版日页", "memo" => "备忘录", "article" => "文章记录", _ => "编辑记录" };
        page.Children.Add(heading);
        var original = (JsonObject)record.DeepClone();
        var values = (JsonObject)record.DeepClone();
        if (Engine.Snapshot.Drafts.TryGetValue(key, out var saved))
        {
            var recovered = JsonNode.Parse(saved.Text)?.AsObject() ?? throw new InvalidDataException("本机草稿无效，原文件已保留。");
            if (Text(recovered, "kind") != kind || Text(recovered, "key") != key) throw new InvalidDataException("草稿身份与当前记录不一致。");
            original = recovered["original"]?.DeepClone().AsObject() ?? throw new InvalidDataException("草稿缺少原始版本。");
            values = recovered["values"]?.DeepClone().AsObject() ?? throw new InvalidDataException("草稿缺少正文。");
            page.Children.Add(Label($"已恢复本机草稿 · 基于版本 {saved.BaseVersion}；本次读取的远端版本 {Version(record)}。保存仍使用草稿原版本。"));
            if (saved.RecoveredAtRevision > 0 && kind == "article" && Version(original) == 0)
                page.Children.Add(Label("此稿来自回退备份，可能漏掉后来已创建的服务器文章。可继续本机编辑和导出；创建前请从台账核对并打开实际服务器记录，不能直接再次创建。"));
        }
        if (kind == "article")
        {
            values = ArticlePipelineFormLogic.FormValues(values);
            page.Children.Add(Label("流水线时间须显式填写时区（如 2026-01-01T18:30:00+08:00），按服务端毫秒精度保存。未知数字留空，真实零请填 0；原始结构、来源与待核清单在详情中只读保留。"));
        }
        page.Children.Add(Label("修改会先保存在本机加密草稿中。Ctrl+S 保存本机草稿；点击下方按钮才会排队并同步。"));
        var controls = new Dictionary<string, Func<string>>();
        var editorVersion = 0;
        var labelChoices = new Dictionary<string, CheckBox>();
        if (kind == "note")
        {
            var selected = values["labels"] is JsonArray selectedArray ? selectedArray.Select(n => n?.ToString() ?? "").ToHashSet(StringComparer.Ordinal) :
                new HashSet<string>([Text(original, "category") == "work" ? "工作" : "生活"], StringComparer.Ordinal);
            var names = new HashSet<string>(selected, StringComparer.Ordinal) { "生活", "工作" };
            var catalog = await ProjectedDataAsync("/api/v1/note-entries/labels");
            foreach (var row in Rows(catalog?["labels"])) names.Add(Text(row, "name"));
            page.Children.Add(Label("标签（新标签可在侧栏“标签”中创建）"));
            var labelsPanel = new WrapPanel();
            foreach (var name in names.Order(StringComparer.Ordinal))
            {
                var check = new CheckBox { Content = name, IsChecked = selected.Contains(name), Margin = new Thickness(0, 4, 18, 12) };
                check.Checked += (_, _) => Changed(); check.Unchecked += (_, _) => Changed();
                labelChoices[name] = check; labelsPanel.Children.Add(check);
            }
            page.Children.Add(labelsPanel);
        }
        foreach (var field in Fields(kind))
        {
            page.Children.Add(Label(field.Label));
            if (field.Name == "account_id" && Engine.Snapshot.Cache.TryGetValue("/api/v1/accounts", out var accountJson))
            {
                var accounts = Rows(Data(accountJson)).Select(a => new KeyValuePair<string, string>(Text(a, "id"), Text(a, "name") + " · " + Text(a, "platform"))).ToList();
                var selectedAccount = Text(values, field.Name);
                if (selectedAccount.Length > 0 && accounts.All(account => account.Key != selectedAccount))
                    accounts.Add(new(selectedAccount, "未在当前列表中核实 · " + selectedAccount));
                var combo = new ComboBox { Tag = field.Name, ItemsSource = accounts, DisplayMemberPath = "Value", SelectedValuePath = "Key", SelectedValue = selectedAccount };
                AutomationProperties.SetAutomationId(combo, kind + "-" + field.Name);
                controls[field.Name] = () => combo.SelectedValue?.ToString() ?? "";
                combo.SelectionChanged += (_, _) => Changed(); page.Children.Add(combo);
            }
            else if (field.Choices != null)
            {
                string Name(string key) => key switch { "drafting" => "起草中", "illustrated" => "已配图", "draft_saved" => "草稿已存", "published" => "已发布", "failed" => "受阻", "automatic" => "自动化", "manual" => "人工", "mixed" => "人工与自动化", "unknown" => "未记录", "zh1" => "知乎 1", "zh2" => "知乎 2", "zh3" => "知乎 3", "tt1" => "头条 1", "tt2" => "头条 2", "tt3" => "头条 3", "gzh" => "公众号", "dedao" => "得到大脑", "gemini_web" => "Gemini", "human" => "本人", "other" => "其他", "codex" => "Codex", "pil" => "PIL", _ => key };
                var currentChoice = Text(values, field.Name);
                var choices = field.Choices.Select(key => new KeyValuePair<string, string>(key, Name(key))).ToList();
                if (kind == "article") choices.Insert(0, new("", field.Name is "status" or "production_mode" ? "请选择（原值未知）" : "未标注"));
                if (currentChoice.Length > 0 && !field.Choices.Contains(currentChoice, StringComparer.Ordinal))
                    choices.Add(new(currentChoice, "不支持的原值 · " + currentChoice));
                var combo = new ComboBox { Tag = field.Name, ItemsSource = choices,
                    DisplayMemberPath = "Value", SelectedValuePath = "Key", SelectedValue = currentChoice, IsEditable = false };
                AutomationProperties.SetAutomationId(combo, kind + "-" + field.Name);
                controls[field.Name] = () => combo.SelectedValue?.ToString() ?? "";
                combo.SelectionChanged += (_, _) => Changed(); page.Children.Add(combo);
            }
            else
            {
                var box = new TextBox { Tag = field.Name, Text = Text(values, field.Name), AcceptsReturn = field.Multiline,
                    TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = field.Multiline ? ScrollBarVisibility.Auto : ScrollBarVisibility.Disabled,
                    MinHeight = field.Multiline ? kind is "note" or "legacy" or "memo" ? 300 : 90 : 40,
                    MaxHeight = field.Multiline ? 600 : 100, AcceptsTab = field.Multiline };
                AutomationProperties.SetAutomationId(box, kind + "-" + field.Name);
                controls[field.Name] = () => box.Text;
                box.TextChanged += (_, _) => Changed(); page.Children.Add(box);
            }
        }
        void Changed() { editorVersion++; draftDirty = true; draftTimer.Stop(); draftTimer.Start(); }
        JsonObject Current()
        {
            var value = (JsonObject)values.DeepClone();
            foreach (var (name, read) in controls)
            {
                var text = read();
                _ = new UTF8Encoding(false, true).GetByteCount(text);
                // Preserve unsupported original JSON types until the user actually changes the text.
                if (kind != "article" || !values.ContainsKey(name) || !string.Equals(text, Text(values, name), StringComparison.Ordinal)) value[name] = text;
            }
            if (kind == "note") value["labels"] = new JsonArray(labelChoices.Where(p => p.Value.IsChecked == true).Select(p => (JsonNode?)JsonValue.Create(p.Key)).ToArray());
            return value;
        }
        saveEditor = async () =>
        {
            var generation = editorVersion;
            var value = Current();
            var payload = Obj(("kind", kind), ("key", key), ("original", original.DeepClone()), ("values", value));
            await SaveLocalDraftAsync(new LocalDraft { Key = key, Text = payload.ToJsonString(),
                Title = Text(value, "title") is { Length: > 0 } title ? title : Text(value, "text")[..Math.Min(40, Text(value, "text").Length)],
                BaseVersion = Version(original) });
            draftDirty = generation != editorVersion;
            if (draftDirty) { draftTimer.Stop(); draftTimer.Start(); }
        };
        var buttons = new WrapPanel { Margin = new Thickness(0, 16, 0, 0) };
        var saveQueued = Button(connected ? "保存并同步" : "保存到待同步队列", async () =>
        {
            var value = Current();
            var (method, path, body) = BuildSave(kind, original, value);
            draftDirty = true;
            await QueueAsync(method, path, body, key);
        });
        if (kind == "article" && Version(original) == 0 && Engine.Snapshot.Drafts.TryGetValue(key, out var recoveredDraft) && recoveredDraft.RecoveredAtRevision > 0)
        {
            saveQueued.Content = "恢复稿创建待核对"; saveQueued.IsEnabled = false;
            saveQueued.ToolTip = "请先从文章台账核对是否已有服务器记录。可继续保存本机草稿或导出原文。";
        }
        buttons.Children.Add(saveQueued);
        buttons.Children.Add(Button("保存本机草稿", async () => { draftDirty = true; await SaveDraftSafelyAsync(); }));
        buttons.Children.Add(Button("导出文字副本", () => ExportTextAsync("好多鱼本机草稿.txt", string.Join("\n\n", controls.Select(x => x.Key + "\n" + x.Value())))));
        if (kind == "article") buttons.Children.Add(Button("查看流水线详情", () => ArticlePipelineDetailAsync(original, key)));
        buttons.Children.Add(Button("返回清单", () => NavigateAsync(currentPage)));
        page.Children.Add(buttons);
        // Persist even an untouched new record's UUID, category, date and base version before it can be lost.
        draftDirty = true;
        await saveEditor();
    }

    private static (string method, string path, JsonObject body) BuildSave(string kind, JsonObject original, JsonObject value)
    {
        var id = Text(original, "id"); var version = Version(original);
        var save = Guid.NewGuid().ToString();
        string Content(string name, int bytes, bool required = false)
        {
            var text = Text(value, name).Replace("\r\n", "\n").Replace('\r', '\n');
            if (new UTF8Encoding(false, true).GetByteCount(text) > bytes || text.Any(ch => ch < 32 && ch is not '\n' and not '\t' || ch == 127))
                throw new InvalidOperationException("正文超出容量或包含无效控制字符，请保留草稿后修改。");
            if (required && string.IsNullOrWhiteSpace(text)) throw new InvalidOperationException("请填写内容。");
            return text;
        }
        var versionBody = Obj(("version", version), ("save_id", save));
        switch (kind)
        {
            case "todo":
            case "template":
                var text = Content("text", 2000, true).Trim();
                if (text.Length > 500) throw new InvalidOperationException("内容最多 500 字符。");
                if (kind == "template") return version == 0 ? ("POST", "/api/v1/todo-templates", Obj(("id", id), ("text", text))) :
                    ("PATCH", "/api/v1/todo-templates/" + id, Obj(("text", text), ("version", version)));
                return ("POST", "/api/v1/todos", Obj(("id", id), ("date", Text(original, "date")), ("text", text)));
            case "note":
                versionBody["category"] = Text(original, "category"); versionBody["date"] = Text(original, "date");
                versionBody["text"] = Content("text", 65536);
                if (value["labels"] is JsonArray labels) versionBody["labels"] = labels.DeepClone();
                return ("PUT", "/api/v1/note-entries/" + id, versionBody);
            case "legacy":
                versionBody["text"] = Content("text", 65536);
                return ("PUT", "/api/v1/daily-notes/" + Text(original, "date") + "?category=" + Text(original, "category"), versionBody);
            case "group":
            case "memo":
                var title = Content("title", 480, true).Trim();
                if (title.Length > 120) throw new InvalidOperationException("标题最多 120 字符。");
                versionBody["title"] = title;
                versionBody["position"] = original["position"]?.DeepClone() ?? JsonValue.Create(0);
                if (kind == "memo") { versionBody["group_id"] = Text(original, "group_id"); versionBody["body"] = Content("body", 65536); }
                return ("PUT", "/api/v1/memos/" + (kind == "memo" ? "notes/" : "groups/") + id, versionBody);
            case "reminder":
                versionBody["date"] = Text(original, "date"); versionBody["source_key"] = Text(original, "source_key");
                versionBody["summary"] = Content("summary", 16384);
                return ("PUT", "/api/v1/work-reminders/" + id, versionBody);
            case "article":
                return ArticlePipelineFormLogic.Build(original, value);
            default: throw new InvalidOperationException("不支持此编辑类型。");
        }
    }
}
