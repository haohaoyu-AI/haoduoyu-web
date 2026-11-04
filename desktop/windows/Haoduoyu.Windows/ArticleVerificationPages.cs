using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    // Local controls join the existing article draft and save path. Selection and inspection do not save or send.
    private Action<JsonObject> AddArticleVerificationEditor(JsonObject original, JsonObject values, Action changed)
    {
        page.Children.Add(new TextBlock { Text = "待核清单", FontSize = 18, FontWeight = FontWeights.SemiBold, Margin = new Thickness(0, 18, 0, 6) });
        page.Children.Add(Label("选择条目后可明确设为已处理或待处理。选择先保存在同一篇文章的本机草稿中，点击保存按钮才会与其他改动一起排队；此处不代表服务器已确认。原条目内容、顺序及其他信息会保留。"));
        JsonArray? items;
        try { items = ArticleVerificationFormLogic.Snapshot(original, values); }
        catch (InvalidOperationException)
        {
            page.Children.Add(Label("原清单或本机稿无法安全编辑，已保留原件；请查看文章完整只读副本后核对。此处不会替换或清空清单。"));
            return _ => { };
        }
        if (items is null || items.Count == 0)
        {
            page.Children.Add(Label(items is null ? "当前记录未提供可编辑的待核清单，未推断为已核，也不会新建条目。" : "当前已记录空清单，没有可选择的条目。"));
            return _ => { };
        }

        var openedItems = (JsonArray)items.DeepClone();
        var local = new JsonObject { ["verify_items"] = items };
        var includeField = values.ContainsKey("verify_items");
        var rows = new ObservableCollection<WorkspaceListItem>();
        var list = new ListBox { ItemsSource = rows, Height = 240, MinHeight = 120, MaxHeight = 320 };
        VirtualizingPanel.SetIsVirtualizing(list, true);
        VirtualizingPanel.SetVirtualizationMode(list, VirtualizationMode.Recycling);
        ScrollViewer.SetCanContentScroll(list, true);
        AutomationProperties.SetAutomationId(list, "article-verify-items");
        AutomationProperties.SetName(list, "待核清单条目");
        page.Children.Add(list);
        var status = Label("");
        AutomationProperties.SetAutomationId(status, "article-verify-status");
        page.Children.Add(status);
        page.Children.Add(Label("所选条目的处理状态"));
        var choice = new ComboBox { DisplayMemberPath = "Value", SelectedValuePath = "Key", IsEditable = false };
        AutomationProperties.SetAutomationId(choice, "article-verify-done");
        AutomationProperties.SetName(choice, "所选待核条目的处理状态");
        page.Children.Add(choice);
        var detail = new TextBox { IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap,
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto, MinHeight = 64, MaxHeight = 240 };
        AutomationProperties.SetAutomationId(detail, "article-verify-item-detail");
        AutomationProperties.SetName(detail, "所选待核条目完整只读内容");
        page.Children.Add(detail);
        var updating = false;
        Button? undo = null;
        bool ModifiedSinceOpen(int index)
        {
            var current = ((JsonArray)local["verify_items"]!)[index]!.AsObject();
            var opened = openedItems[index]!.AsObject();
            return current.ContainsKey("done") != opened.ContainsKey("done") || !JsonNode.DeepEquals(current["done"], opened["done"]);
        }
        WorkspaceListItem Row(int index)
        {
            var item = ((JsonArray)local["verify_items"]!)[index]!.AsObject();
            var name = new[] { "label", "text", "title", "description", "message" }
                .Select(key => item[key] is JsonValue value && value.TryGetValue<string>(out var text) ? text : "")
                .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text)) ?? "未记录说明，请查看完整内容";
            var preview = string.Concat(name.EnumerateRunes().Take(160).Select(rune => rune.ToString()));
            if (name.EnumerateRunes().Skip(160).Any()) preview += "…";
            var state = Done(item);
            return new WorkspaceListItem((index + 1).ToString(CultureInfo.InvariantCulture) + ". " + preview,
                state == "true" ? "本机选择：已处理" : state == "false" ? "本机选择：待处理" : "处理状态未明确记录，原值保留", () => Task.CompletedTask);
        }
        void Selected()
        {
            if (updating || list.SelectedIndex < 0) return;
            updating = true;
            try
            {
                var index = list.SelectedIndex;
                var item = ((JsonArray)local["verify_items"]!)[index]!.AsObject();
                var state = Done(item);
                var choices = new List<KeyValuePair<string, string>>();
                if (state == "unknown") choices.Add(new("unknown", "未明确记录（原值保留）"));
                choices.Add(new("false", "待处理")); choices.Add(new("true", "已处理"));
                choice.ItemsSource = choices; choice.SelectedValue = state;
                detail.Text = item.ToJsonString(ArticleReadableJson);
                status.Text = $"第 {index + 1} 项 / 共 {rows.Count} 项 · 当前本机稿，未据此确认远端保存结果。";
                if (undo is not null) undo.IsEnabled = ModifiedSinceOpen(index);
            }
            finally { updating = false; }
        }
        list.SelectionChanged += (_, _) => Selected();
        choice.SelectionChanged += (_, _) =>
        {
            if (updating || list.SelectedIndex < 0 || choice.SelectedValue is not string selected || selected is not ("true" or "false")) return;
            var index = list.SelectedIndex;
            var item = ((JsonArray)local["verify_items"]!)[index]!.AsObject();
            if (Done(item) == selected) return;
            try { local = ArticleVerificationFormLogic.SetDone(local, index, selected == "true"); }
            catch (InvalidOperationException error)
            {
                Selected();
                status.Text = "此次选择未应用，原稿保留：" + error.Message;
                return;
            }
            includeField = true;
            updating = true;
            try { rows[index] = Row(index); list.SelectedIndex = index; }
            finally { updating = false; }
            Selected(); changed();
        };
        undo = Button("撤销本次条目修改", () =>
        {
            var index = list.SelectedIndex;
            if (index < 0 || !ModifiedSinceOpen(index)) return Task.CompletedTask;
            var current = ((JsonArray)local["verify_items"]!)[index]!.AsObject();
            var opened = openedItems[index]!.AsObject();
            if (opened.ContainsKey("done")) current["done"] = opened["done"]?.DeepClone(); else current.Remove("done");
            updating = true;
            try { rows[index] = Row(index); list.SelectedIndex = index; }
            finally { updating = false; }
            Selected(); changed();
            return Task.CompletedTask;
        });
        undo.ToolTip = "仅撤销进入本页后的所选条目修改，保留本次打开前已保存的草稿选择。";
        AutomationProperties.SetAutomationId(undo, "article-verify-undo");
        page.Children.Add(undo);
        for (var index = 0; index < items.Count; index++) rows.Add(Row(index));
        list.SelectedIndex = 0;
        return target => { if (includeField) target["verify_items"] = local["verify_items"]!.DeepClone(); };

        static string Done(JsonObject item) => item["done"] is JsonValue value && value.TryGetValue<bool>(out var done) ? done ? "true" : "false" : "unknown";
    }
}
