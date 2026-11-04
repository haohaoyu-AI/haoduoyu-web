using System.Globalization;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private sealed record ReviewStructuredEditor(UIElement View,Func<JsonNode?> Read,Func<JsonObject?> Pending);
    private sealed record ReviewTableRow(string Group,JsonObject Value);
    private static readonly string[] RuleSections=["keep_topic","drop_topic","title","body","audience","checklist"];
    private static readonly string[] RuleStatuses=["candidate","trial","kept","dropped","hold"];

    private ReviewStructuredEditor BuildReviewStructuredControl(ReviewFormField field,JsonNode? source,
        Dictionary<string,List<ReviewArticleChoice>> options,Action changed,JsonObject? pending=null)
    {
        return field.Type switch
        {
            "references"=>BuildReviewReferenceControl(field,source,options,changed),
            "strings"=>BuildReviewStringsControl(field,source,changed,pending),
            "rules" or "verdicts" or "findings"=>BuildReviewRowsControl(field,source,options,changed,pending),
            "notice"=>BuildReviewNoticeControl(source,changed),
            "rulecheck"=>BuildReviewCheckControl(source,changed),
            "ruleevidence"=>BuildReviewEvidenceControl(source,changed),
            _=>BuildReviewNodeControl(field,source,changed,pending)
        };
    }
    private static Button ReviewLocalButton(string label,Action action)
    {
        var button=new Button {Content=label};
        button.Click+=(_,_)=>
        {
            try{action();}
            catch(Exception error){MessageBox.Show(error.Message,"请保留输入并核对",MessageBoxButton.OK,MessageBoxImage.Information);}
        };
        return button;
    }
    private static Func<string> ReviewDateInput(DatePicker picker,string initial,Action changed)
    {
        picker.SelectedDateFormat=DatePickerFormat.Short;
        var raw=initial;
        if(initial.Length>0&&picker.SelectedDate==null)picker.Text=initial;
        picker.SelectedDateChanged+=(_,_)=>{raw=picker.SelectedDate?.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)??picker.Text??"";changed();};
        picker.DateValidationError+=(_,error)=>{error.ThrowException=false;raw=error.Text;changed();};
        picker.AddHandler(TextBox.TextChangedEvent,new TextChangedEventHandler((_,error)=>
        {
            if(error.OriginalSource is not TextBox box)return;
            var text=box.Text;
            if(DateOnly.TryParseExact(text,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var iso))raw=iso.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
            else if(picker.SelectedDate is DateTime selected&&DateTime.TryParseExact(text,CultureInfo.CurrentCulture.DateTimeFormat.ShortDatePattern,CultureInfo.CurrentCulture,DateTimeStyles.None,out var localized)&&localized.Date==selected.Date)raw=selected.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
            else raw=text;
            changed();
        }),true);
        return ()=>raw;
    }
    private ReviewStructuredEditor BuildReviewReferenceControl(ReviewFormField field,JsonNode? source,
        Dictionary<string,List<ReviewArticleChoice>> options,Action changed)
    {
        var originalIds=source is JsonArray original?original.Select(ReviewFormLogic.Scalar).ToArray():[];
        var selected=originalIds.ToHashSet(StringComparer.Ordinal);
        var available=options.GetValueOrDefault(field.ReferenceKind??"",[]).ToList();
        foreach(var id in selected)if(available.All(row=>row.Id!=id))available.Add(new(id,"保留原关联（"+id+"）"));
        var panel=new StackPanel {Margin=new Thickness(0,0,0,12)};
        var list=new StackPanel();
        foreach(var row in available)
        {
            var checkbox=new CheckBox {Content=new TextBlock {Text=row.Title,TextWrapping=TextWrapping.Wrap},IsChecked=selected.Contains(row.Id),Margin=new Thickness(4,4,4,8)};
            checkbox.Checked+=(_,_)=>{selected.Add(row.Id);changed();};checkbox.Unchecked+=(_,_)=>{selected.Remove(row.Id);changed();};list.Children.Add(checkbox);
        }
        if(available.Count==0)list.Children.Add(Label("本机没有可选择的现有资料。连接后读取相关清单；不会猜测关联标识。"));
        panel.Children.Add(new ScrollViewer {Content=list,MaxHeight=220,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
        var dirty=false;
        foreach(var checkbox in list.Children.OfType<CheckBox>()){checkbox.Checked+=(_,_)=>dirty=true;checkbox.Unchecked+=(_,_)=>dirty=true;}
        return new(panel,()=>!dirty?source?.DeepClone():new JsonArray(originalIds.Where(selected.Contains).Concat(available.Where(row=>selected.Contains(row.Id)&&!originalIds.Contains(row.Id,StringComparer.Ordinal)).Select(row=>row.Id)).Select(id=>(JsonNode?)JsonValue.Create(id)).ToArray()),()=>null);
    }
    private ReviewStructuredEditor BuildReviewStringsControl(ReviewFormField field,JsonNode? source,Action changed,JsonObject? pending)
    {
        var values=source is JsonArray array?array.Select(ReviewFormLogic.Scalar).ToList():new List<string>();
        var panel=new StackPanel {Margin=new Thickness(0,0,0,12)};var list=new ListBox {MaxHeight=200};panel.Children.Add(list);
        JsonObject? pendingValue=pending?.DeepClone().AsObject();Func<JsonObject>? pendingReader=null;var dirty=false;
        void Refresh(){list.ItemsSource=null;list.ItemsSource=values.ToArray();}
        JsonObject? ReadPending()=>pendingReader?.Invoke()??pendingValue?.DeepClone().AsObject();
        void Edit(int index,bool resume=false)
        {
            if(!resume&&ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消上次未确认的条目。");
            var saved=resume?ReadPending():null;var at=saved?["index"]?.GetValue<int>()??index;
            var box=new TextBox {Text=saved?["text"]?.GetValue<string>()??(at>=0&&at<values.Count?values[at]:""),AcceptsReturn=false};
            var body=new StackPanel {Margin=new Thickness(24)};body.Children.Add(Label(field.Label+"（一项）"));body.Children.Add(box);
            var dialog=Dialog("编辑"+field.Label,body,600,300);var settled=false;
            pendingReader=()=>Obj(("index",at),("text",box.Text));box.TextChanged+=(_,_)=>changed();changed();
            body.Children.Add(ReviewLocalButton("确定",()=>
            {
                var text=ReviewFormLogic.Clean(box.Text,field.ItemBytes,false,field.Label);
                if(values.Where((_,i)=>i!=at).Contains(text,StringComparer.Ordinal))throw new InvalidOperationException("条目不能重复。");
                if(at>=0&&at<values.Count)values[at]=text;else values.Add(text);
                dirty=true;pendingReader=null;pendingValue=null;settled=true;Refresh();changed();dialog.DialogResult=true;
            }));
            body.Children.Add(ReviewLocalButton("取消此条编辑",()=>{pendingReader=null;pendingValue=null;settled=true;changed();dialog.DialogResult=false;}));
            dialog.Closed+=(_,_)=>{if(!settled){pendingValue=ReadPending();pendingReader=null;changed();}};dialog.ShowDialog();
        }
        var bar=new WrapPanel();panel.Children.Add(bar);bar.Children.Add(ReviewLocalButton("新增条目",()=>Edit(-1)));
        bar.Children.Add(ReviewLocalButton("编辑所选",()=>{if(list.SelectedIndex<0)throw new InvalidOperationException("请先选择条目。");Edit(list.SelectedIndex);}));
        bar.Children.Add(ReviewLocalButton("移除此本地条目",()=>{if(ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消未确认编辑，防止条目位置变化。");if(list.SelectedIndex<0)throw new InvalidOperationException("请先选择条目。");if(Confirm("从当前草稿移除此条目？尚未写入服务器。")){values.RemoveAt(list.SelectedIndex);dirty=true;Refresh();changed();}}));
        bar.Children.Add(ReviewLocalButton("恢复未确认编辑",()=>{if(ReadPending()==null)throw new InvalidOperationException("没有未确认的条目。");Edit(-1,true);}));Refresh();
        return new(panel,()=>source==null&&!dirty?null:new JsonArray(values.Select(v=>(JsonNode?)JsonValue.Create(v)).ToArray()),ReadPending);
    }
    private static ReviewFormField[] ReviewRowFields(string type)=>type switch
    {
        "rules"=>[new("rule_id","规则编号",Required:true,MaximumBytes:120),new("section","分类","choice",true,Choices:RuleSections),new("text","规则文字","longtext",true,MaximumBytes:16384),
            new("status","状态","choice",Choices:RuleStatuses),new("check","检查方式","rulecheck"),new("evidence","证据","ruleevidence"),new("evidence_note","证据说明","longtext",MaximumBytes:2000),
            new("support_ids","支持文章","references",ReferenceKind:"articles"),new("counter_ids","反例文章","references",ReferenceKind:"articles"),new("trials","试验次数","number",Integer:true)],
        "verdicts"=>[new("article_id","文章","reference",true,ReferenceKind:"articles"),new("verdict","结论","choice",true,Choices:["爆","中","扑"]),new("reason","具体原因","longtext",true,MaximumBytes:8192)],
        "findings"=>[new("finding_group","检验结果","choice",true,Choices:["verified","overturned"]),new("rule_id","规则","reference",true,ReferenceKind:"rules"),new("reason","依据与说明","longtext",MaximumBytes:8192)],
        _=>throw new InvalidOperationException("无法识别表格。")
    };
    private ReviewStructuredEditor BuildReviewRowsControl(ReviewFormField field,JsonNode? source,Dictionary<string,List<ReviewArticleChoice>> options,Action changed,JsonObject? pending)
    {
        var rows=new List<ReviewTableRow>();
        if(field.Type=="rules"&&source is JsonArray rules)rows.AddRange(rules.OfType<JsonObject>().Select(row=>new ReviewTableRow("",(JsonObject)row.DeepClone())));
        if(field.Type=="verdicts"&&source is JsonObject verdicts)foreach(var(id,node)in verdicts)
        {var row=node!.DeepClone().AsObject();row["article_id"]=id;rows.Add(new("",row));}
        if(field.Type=="findings"&&source is JsonObject findings)foreach(var group in new[]{"verified","overturned"})foreach(var row in Rows(findings[group]))rows.Add(new(group,(JsonObject)row.DeepClone()));
        JsonObject? pendingValue=pending?.DeepClone().AsObject();Func<JsonObject>? pendingReader=null;
        var panel=new StackPanel {Margin=new Thickness(0,0,0,12)};var list=new ListBox {MaxHeight=280};panel.Children.Add(list);
        JsonObject? ReadPending()=>pendingReader?.Invoke()??pendingValue?.DeepClone().AsObject();
        JsonNode ReadRows(IEnumerable<ReviewTableRow> data)
        {
            if(field.Type=="rules")return new JsonArray(data.Select(row=>(JsonNode?)row.Value.DeepClone()).ToArray());
            if(field.Type=="verdicts")
            {
                var result=new JsonObject();foreach(var row in data){var value=(JsonObject)row.Value.DeepClone();var id=Text(value,"article_id");value.Remove("article_id");if(result.ContainsKey(id))throw new InvalidOperationException("同一篇文章只能保存一条结论。");result[id]=value;}return result;
            }
            return Obj(("verified",new JsonArray(data.Where(r=>r.Group=="verified").Select(r=>(JsonNode?)r.Value.DeepClone()).ToArray())),("overturned",new JsonArray(data.Where(r=>r.Group=="overturned").Select(r=>(JsonNode?)r.Value.DeepClone()).ToArray())));
        }
        void Refresh()
        {
            list.ItemsSource=null;list.ItemsSource=rows.Select(row=>field.Type switch
            {"rules"=>Text(row.Value,"rule_id")+" · "+Text(row.Value,"text"),"verdicts"=>Text(row.Value,"article_id")+" · "+Text(row.Value,"verdict")+" · "+Text(row.Value,"reason"),_=>ReviewChoiceLabel(row.Group)+" · "+Text(row.Value,"rule_id")+" · "+Text(row.Value,"reason")}).ToArray();
        }
        void Edit(int index,bool resume=false)
        {
            if(!resume&&ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消上次未确认的行。");
            var saved=resume?ReadPending():null;var at=saved?["index"]?.GetValue<int>()??index;
            var candidate=saved?["row"]?.DeepClone().AsObject()??(at>=0&&at<rows.Count?(JsonObject)rows[at].Value.DeepClone():new JsonObject());
            if(field.Type=="findings"&&!candidate.ContainsKey("finding_group"))candidate["finding_group"]=at>=0&&at<rows.Count?rows[at].Group:null;
            var form=new StackPanel {Margin=new Thickness(24)};var dialog=Dialog("编辑"+field.Label,form,850,760);var readers=new Dictionary<string,Func<JsonNode?>>();
            foreach(var cell in ReviewRowFields(field.Type))
            {
                form.Children.Add(Label(cell.Label+(cell.Required?" *":"")));
                if(cell.Type is "references" or "rulecheck" or "ruleevidence")
                {var editor=BuildReviewStructuredControl(cell,candidate[cell.Name],options,changed);form.Children.Add(editor.View);readers[cell.Name]=editor.Read;}
                else if(cell.Type is "choice" or "reference")
                {
                    var choices=cell.Type=="reference"?options.GetValueOrDefault(cell.ReferenceKind??"",[]).ToList():(cell.Choices??[]).Select(v=>new ReviewArticleChoice(v,ReviewChoiceLabel(v))).ToList();
                    var current=Text(candidate,cell.Name);if(current.Length>0&&choices.All(c=>c.Id!=current))choices.Add(new(current,"保留原关联（"+current+"）"));choices.Insert(0,new("","未选择"));
                    var combo=new ComboBox {ItemsSource=choices,DisplayMemberPath="Title",SelectedValuePath="Id",SelectedValue=current};readers[cell.Name]=()=>combo.SelectedValue?.ToString()==current&&candidate.ContainsKey(cell.Name)?candidate[cell.Name]?.DeepClone():JsonValue.Create(combo.SelectedValue?.ToString()??"");combo.SelectionChanged+=(_,_)=>changed();form.Children.Add(combo);
                }
                else
                {
                    var initial=Text(candidate,cell.Name);var box=new TextBox {Text=initial,AcceptsReturn=cell.Type=="longtext",TextWrapping=TextWrapping.Wrap,MinHeight=cell.Type=="longtext"?100:40,MaxHeight=260,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};readers[cell.Name]=()=>box.Text==initial&&candidate.ContainsKey(cell.Name)?candidate[cell.Name]?.DeepClone():JsonValue.Create(box.Text);box.TextChanged+=(_,_)=>changed();form.Children.Add(box);
                }
            }
            JsonObject Current()
            {
                var value=(JsonObject)candidate.DeepClone();foreach(var(name,read)in readers)value[name]=read()?.DeepClone();ReviewEnsureUnicode(value);return value;
            }
            pendingReader=()=>Obj(("index",at),("row",Current()));var settled=false;changed();
            form.Children.Add(ReviewLocalButton("确认此行",()=>
            {
                var value=Current();var group=Text(value,"finding_group");value.Remove("finding_group");
                foreach(var cell in ReviewRowFields(field.Type))
                {
                    if(cell.Name=="finding_group")continue;
                    if(cell.Required&&Text(value,cell.Name).Length==0)throw new InvalidOperationException("请填写"+cell.Label+"。");
                    var preserveNull=candidate.ContainsKey(cell.Name)&&candidate[cell.Name]==null&&value[cell.Name]==null&&cell.Type is "text" or "longtext";
                    if(cell.Type is "text" or "longtext")
                    {if(Text(value,cell.Name).Length>0)value[cell.Name]=ReviewFormLogic.Clean(Text(value,cell.Name),cell.MaximumBytes,cell.Type=="longtext",cell.Label);else if(!cell.Required&&!preserveNull)value.Remove(cell.Name);}
                    if(!cell.Required&&!preserveNull&&(value[cell.Name]==null||value[cell.Name] is JsonValue&&Text(value,cell.Name).Length==0))value.Remove(cell.Name);
                }
                var proposed=rows.ToList();var replacement=new ReviewTableRow(group,value);if(at>=0&&at<proposed.Count)proposed[at]=replacement;else proposed.Add(replacement);
                _=ReviewFormLogic.NormalizeStructured(field.Type,ReadRows(proposed));
                rows=proposed;pendingReader=null;pendingValue=null;settled=true;Refresh();changed();dialog.DialogResult=true;
            }));
            form.Children.Add(ReviewLocalButton("取消此行编辑",()=>{pendingReader=null;pendingValue=null;settled=true;changed();dialog.DialogResult=false;}));
            dialog.Closed+=(_,_)=>{if(!settled){pendingValue=ReadPending();pendingReader=null;changed();}};dialog.ShowDialog();
        }
        var bar=new WrapPanel();panel.Children.Add(bar);bar.Children.Add(ReviewLocalButton("新增一行",()=>Edit(-1)));
        bar.Children.Add(ReviewLocalButton("编辑所选行",()=>{if(list.SelectedIndex<0)throw new InvalidOperationException("请先选一行。");Edit(list.SelectedIndex);}));
        bar.Children.Add(ReviewLocalButton("移除此草稿行",()=>{if(ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消未确认行，防止行位置变化。");if(list.SelectedIndex<0)throw new InvalidOperationException("请先选一行。");if(Confirm("从当前草稿移除此行？服务器尚未改变。")){rows.RemoveAt(list.SelectedIndex);Refresh();changed();}}));
        bar.Children.Add(ReviewLocalButton("恢复未确认行",()=>{if(ReadPending()==null)throw new InvalidOperationException("没有未确认行。");Edit(-1,true);}));Refresh();
        return new(panel,()=>ReadRows(rows),ReadPending);
    }
    private ReviewStructuredEditor BuildReviewCheckControl(JsonNode? source,Action changed)
    {
        var panel=new StackPanel();var original=source?.DeepClone();
        var type=source is JsonObject?Text(source,"type"):source?.ToString()??"";
        var combo=new ComboBox {ItemsSource=new[]{new ReviewArticleChoice("","未记录"),new ReviewArticleChoice("manual","人工检查"),new ReviewArticleChoice("regex","保存匹配表达式（不执行）")},DisplayMemberPath="Title",SelectedValuePath="Id",SelectedValue=type};
        var pattern=new TextBox {Text=source is JsonObject?Text(source,"value"):"",ToolTip="只作为规则文字保存，客户端和服务端均不会运行表达式。"};panel.Children.Add(combo);panel.Children.Add(pattern);panel.Children.Add(Label("匹配表达式仅是惰性元数据，不执行。"));var dirty=false;
        combo.SelectionChanged+=(_,_)=>{dirty=true;changed();};pattern.TextChanged+=(_,_)=>{dirty=true;changed();};
        return new(panel,()=>!dirty?original?.DeepClone():combo.SelectedValue?.ToString() switch {"manual"=>Obj(("type","manual")),"regex"=>Obj(("type","regex"),("value",pattern.Text)),_=>null},()=>null);
    }
    private ReviewStructuredEditor BuildReviewEvidenceControl(JsonNode? source,Action changed)
    {
        var panel=new StackPanel();var enabled=new CheckBox {Content="记录两组证据",IsChecked=source!=null,Margin=new Thickness(0,4,0,8)};panel.Children.Add(enabled);
        var dirty=false;
        var readers=new Dictionary<string,TextBox>();foreach(var(name,label)in new[]{("metric","指标名称"),("with_median","应用规则组中位数"),("without_median","未应用规则组中位数"),("n_with","应用规则组样本数"),("n_without","未应用规则组样本数")})
        {panel.Children.Add(Label(label));var box=new TextBox {Text=Text(source,name)};readers[name]=box;box.TextChanged+=(_,_)=>{dirty=true;changed();};panel.Children.Add(box);}
        enabled.Checked+=(_,_)=>{dirty=true;changed();};enabled.Unchecked+=(_,_)=>{dirty=true;changed();};
        return new(panel,()=>
        {
            if(!dirty)return source?.DeepClone();if(enabled.IsChecked!=true)return null;var result=source is JsonObject original?(JsonObject)original.DeepClone():new JsonObject();
            foreach(var(name,box)in readers)result[name]=box.Text.Length==0?null:JsonValue.Create(box.Text);
            return result;
        },()=>null);
    }
    private ReviewStructuredEditor BuildReviewNoticeControl(JsonNode? source,Action changed)
    {
        var panel=new StackPanel();var text=new TextBox {Text=source is JsonObject?Text(source,"text"):source?.ToString()??""};
        var date=new DatePicker {SelectedDate=DateTime.TryParseExact(Text(source is JsonObject?source:null,"date"),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var day)?day:null,Margin=new Thickness(0,0,0,12)};
        panel.Children.Add(Label("通知原文"));panel.Children.Add(text);panel.Children.Add(Label("通知日期（可留空）"));panel.Children.Add(date);var dirty=false;
        var readDate=ReviewDateInput(date,source is JsonObject?Text(source,"date"):"",()=>{dirty=true;changed();});
        text.TextChanged+=(_,_)=>{dirty=true;changed();};
        return new(panel,()=>!dirty?source?.DeepClone():text.Text.Length==0&&readDate().Length==0?null:Obj(("text",text.Text),("date",readDate().Length==0?null:JsonValue.Create(readDate()))),()=>null);
    }

    private ReviewStructuredEditor BuildReviewNodeControl(ReviewFormField field,JsonNode? source,Action changed,JsonObject? pending)
    {
        JsonNode? current=source?.DeepClone();JsonObject? pendingValue=pending?.DeepClone().AsObject();Func<JsonObject>? pendingReader=null;
        var panel=new StackPanel {Margin=new Thickness(0,0,0,12)};var list=new ListBox {MaxHeight=240};panel.Children.Add(list);
        JsonObject? ReadPending()=>pendingReader?.Invoke()??pendingValue?.DeepClone().AsObject();
        string[] Keys()=>current is JsonObject obj?obj.Select(kv=>kv.Key).ToArray():current is JsonArray array?Enumerable.Range(0,array.Count).Select(i=>i.ToString(CultureInfo.InvariantCulture)).ToArray():[];
        JsonNode? At(string key)=>current is JsonObject obj?obj[key]:current is JsonArray array&&int.TryParse(key,out var index)&&index<array.Count?array[index]:null;
        void Refresh(){list.ItemsSource=null;list.ItemsSource=Keys().Select(key=>key+"："+(At(key) is JsonObject?"子字段":At(key) is JsonArray a?"数组（"+a.Count+"）":ReviewValue(At(key)))).ToArray();}
        void Edit(string? selected,bool resume=false)
        {
            if(!resume&&ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消尚未确认的字段。");
            var saved=resume?ReadPending():null;selected=saved?["selected"]?.GetValue<string>()??selected;
            var key=saved?["key"]?.GetValue<string>()??selected??"";var old=At(selected??key)?.DeepClone();
            var type=saved?["type"]?.GetValue<string>()??(old is JsonObject?"object":old is JsonArray?"array":old is JsonValue scalar&&scalar.TryGetValue<bool>(out _)?"boolean":old is JsonValue number&&number.GetValueKind()==System.Text.Json.JsonValueKind.Number?"number":old==null?"null":"text");
            var form=new StackPanel {Margin=new Thickness(24)};var name=new TextBox {Text=key};if(current is not JsonArray){form.Children.Add(Label("字段名称"));form.Children.Add(name);}
            var selector=new ComboBox {ItemsSource=new[]{new ReviewArticleChoice("text","文字"),new ReviewArticleChoice("number","数值"),new ReviewArticleChoice("boolean","布尔值"),new ReviewArticleChoice("null","未取得"),new ReviewArticleChoice("object","子字段"),new ReviewArticleChoice("array","数组")},DisplayMemberPath="Title",SelectedValuePath="Id",SelectedValue=type};form.Children.Add(Label("值类型"));form.Children.Add(selector);
            var raw=new TextBox {Text=saved?["raw"]?.GetValue<string>()??(old is JsonValue?old.ToString():""),AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=80};form.Children.Add(raw);
            var nestedSource=saved?["nested"]?.DeepClone()??old;
            var nested=BuildReviewNodeControl(new("nested","子字段","structure"),nestedSource is JsonObject or JsonArray?nestedSource:selector.SelectedValue?.ToString()=="array"?new JsonArray():new JsonObject(),changed,saved?["child_pending"] as JsonObject);
            form.Children.Add(Label("选择子字段或数组时，在下方编辑结构；不会读取或执行任何脚本。"));form.Children.Add(nested.View);
            var dialog=Dialog("编辑结构化字段",form,780,720);var settled=false;
            pendingReader=()=>Obj(("key",name.Text),("selected",selected),("type",selector.SelectedValue?.ToString()??"null"),("raw",raw.Text),("nested",nested.Read()),("child_pending",nested.Pending()));
            name.TextChanged+=(_,_)=>changed();raw.TextChanged+=(_,_)=>changed();selector.SelectionChanged+=(_,_)=>changed();changed();
            form.Children.Add(ReviewLocalButton("确认字段",()=>
            {
                if(nested.Pending()!=null)throw new InvalidOperationException("请先完成子字段编辑。");
                var chosen=selector.SelectedValue?.ToString()??"null";JsonNode? value=chosen switch
                {
                    "text"=>JsonValue.Create(raw.Text),"number"=>old is JsonValue originalNumber&&originalNumber.GetValueKind()==System.Text.Json.JsonValueKind.Number&&raw.Text==originalNumber.ToString()?originalNumber.DeepClone():double.TryParse(raw.Text,NumberStyles.Float,CultureInfo.InvariantCulture,out var number)&&double.IsFinite(number)?JsonValue.Create(number):throw new InvalidOperationException("请输入有效有限数值。"),
                    "boolean"=>bool.TryParse(raw.Text,out var flag)?JsonValue.Create(flag):throw new InvalidOperationException("布尔值填写 true 或 false。"),"object" or "array"=>nested.Read(),_=>null
                };
                if(chosen=="object"&&value is not JsonObject||chosen=="array"&&value is not JsonArray)throw new InvalidOperationException("子结构类型不匹配，请先选择正确的结构。创建对象和数组后可继续增添字段。");
                ReviewEnsureUnicode(value);
                if(current is JsonArray array)
                {if(selected!=null&&int.TryParse(selected,out var index)&&index<array.Count)array[index]=value;else array.Add(value);}
                else
                {
                    var property=ReviewFormLogic.Clean(name.Text,2000,false,"字段名称");if(property is "__proto__" or "constructor" or "prototype")throw new InvalidOperationException("字段名称被保留。");
                    current??=new JsonObject();var obj=current.AsObject();if(property!=selected&&obj.ContainsKey(property))throw new InvalidOperationException("字段名称不能重复。");if(selected!=null&&property!=selected)obj.Remove(selected);obj[property]=value;
                }
                pendingReader=null;pendingValue=null;settled=true;Refresh();changed();dialog.DialogResult=true;
            }));
            form.Children.Add(ReviewLocalButton("取消字段编辑",()=>{pendingReader=null;pendingValue=null;settled=true;changed();dialog.DialogResult=false;}));
            dialog.Closed+=(_,_)=>{if(!settled){pendingValue=ReadPending();pendingReader=null;changed();}};dialog.ShowDialog();
        }
        var bar=new WrapPanel();panel.Children.Add(bar);
        bar.Children.Add(ReviewLocalButton("新增字段/数据点",()=>Edit(null)));
        bar.Children.Add(ReviewLocalButton("编辑所选",()=>{if(list.SelectedIndex<0)throw new InvalidOperationException("请先选择字段。");Edit(Keys()[list.SelectedIndex]);}));
        bar.Children.Add(ReviewLocalButton("移除此本地字段",()=>{if(ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消未确认字段，防止位置变化。");if(list.SelectedIndex<0)throw new InvalidOperationException("请先选择字段。");if(Confirm("从当前草稿移除此字段？尚未改变服务器。")){var key=Keys()[list.SelectedIndex];if(current is JsonObject obj)obj.Remove(key);else if(current is JsonArray array)array.RemoveAt(int.Parse(key,CultureInfo.InvariantCulture));Refresh();changed();}}));
        if(field.Type=="structure")bar.Children.Add(ReviewLocalButton("创建空数组",()=>{if(ReadPending()!=null)throw new InvalidOperationException("请先恢复或取消未确认字段。");if(current!=null&&Keys().Length>0)throw new InvalidOperationException("现有结构含数据，请先导出并明确处理；不会用空数组覆盖。");current=new JsonArray();Refresh();changed();}));
        bar.Children.Add(ReviewLocalButton("恢复未确认字段",()=>{if(ReadPending()==null)throw new InvalidOperationException("没有未确认字段。");Edit(null,true);}));Refresh();
        return new(panel,()=>current?.DeepClone(),ReadPending);
    }
}
