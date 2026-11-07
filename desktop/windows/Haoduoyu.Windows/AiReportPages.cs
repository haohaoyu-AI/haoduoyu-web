using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using Haoduoyu.Core;

namespace Haoduoyu.Windows;

public sealed partial class MainWindow
{
    private DateTime aiReportDay;
    private List<JsonObject> aiReportHistory=[];
    private string? aiReportHistoryIdentity;
    private int aiReportViewPage;
    private bool aiReportAllDates;
    private bool aiReportHistoryAvailable;
    private const int AiReportPageSize=40;
    private const int AiReportMaximumPages=100;
    private const int AiReportMaximumContentBytes=16*1024*1024;

    private async Task AiReportsAsync()
    {
        await FlushEditorAsync();
        ClearPage();heading.Text="AI汇报";page.Children.Add(heading);
        page.Children.Add(Label("正在核对汇报历史。汇报按提交时间分页；实际工作日期可能更早，需要完整读取后才能按日期筛选。"));
        var identity=currentIdentity;
        var first=await ReadAiReportHistoryPassAsync();
        if(first==null)
        {
            aiReportHistory=[];aiReportHistoryIdentity=identity;aiReportHistoryAvailable=false;
            await RenderAiReportsAsync();return;
        }
        var verified=false;
        for(var attempt=0;attempt<2;attempt++)
        {
            var second=await ReadAiReportHistoryPassAsync();
            if(second==null)throw new InvalidOperationException("汇报历史读取未完成，不能把局部页面当作完整日期历史。本机草稿和原请求保留。");
            var firstCandidate=first;var secondCandidate=second;
            if(await Task.Run(()=>AiReportFingerprint(firstCandidate)==AiReportFingerprint(secondCandidate))){first=second;verified=true;break;}
            first=second;
        }
        if(!verified)throw new InvalidOperationException("汇报历史正在变化，分页未能得到一致结果。请稍后刷新，未把局部结果标为完整历史。");
        if(identity!=currentIdentity)throw new InvalidOperationException("工作区已变化，本次汇报未用于其他分区。");
        aiReportHistory=first;aiReportHistoryIdentity=identity;aiReportViewPage=0;aiReportHistoryAvailable=true;
        await RenderAiReportsAsync();
    }
    private async Task<List<JsonObject>?> ReadAiReportHistoryPassAsync()
    {
        var rows=new Dictionary<string,JsonObject>(StringComparer.Ordinal);var bytes=0;
        for(var pageNumber=0;pageNumber<AiReportMaximumPages;pageNumber++)
        {
            NetworkToken.ThrowIfCancellationRequested();
            var data=await ReadAsync("/api/v1/ai-reports?offset="+(pageNumber*100).ToString(CultureInfo.InvariantCulture));
            if(data==null)
            {
                if(pageNumber==0)return null;
                throw new InvalidOperationException("本机尚未保存后续汇报页面。连接或准备完整离线资料后重试，当前日期可能还有更早提交的汇报。");
            }
            if(data["items"] is not JsonArray items||data["has_more"] is not JsonValue more||!more.TryGetValue<bool>(out var hasMore))
                throw new InvalidDataException("汇报分页不完整，本机旧资料保留。");
            foreach(var row in items.OfType<JsonObject>())
            {
                var id=Text(row,"id");
                if(!Guid.TryParseExact(id,"D",out _))throw new InvalidDataException("汇报缺少明确标识，未完成历史读取。");
                if(rows.TryGetValue(id,out var existing))
                {
                    if(Text(existing,"author")!=Text(row,"author")||Text(existing,"content")!=Text(row,"content")||Text(existing,"created_at")!=Text(row,"created_at"))
                        throw new InvalidDataException("同一汇报出现不同内容，已停止并保留本机资料。");
                    continue;
                }
                rows[id]=(JsonObject)row.DeepClone();bytes+=Encoding.UTF8.GetByteCount(Text(row,"author"))+Encoding.UTF8.GetByteCount(Text(row,"content"));
                if(bytes>AiReportMaximumContentBytes)throw new InvalidOperationException("本次汇报正文超过16MiB完整读取上限。已保留原资料，请保全分区后安排更大资料集的验收，未截断后标为完整。");
            }
            Message($"正在核对AI汇报：已读 {pageNumber+1} 页，{rows.Count} 条。未确认的本机操作保留原保存标识。");
            if(!hasMore)return rows.Values.OrderByDescending(row=>Text(row,"created_at"),StringComparer.Ordinal).ThenBy(row=>Text(row,"id"),StringComparer.Ordinal).ToList();
        }
        throw new InvalidOperationException("汇报超过本次100页完整读取上限，未将局部页面标为完整历史。原本机数据保留。");
    }
    private static string AiReportFingerprint(IEnumerable<JsonObject> rows)
    {
        var stable=new JsonArray(rows.OrderBy(row=>Text(row,"id"),StringComparer.Ordinal).Select(row=>(JsonNode?)Obj(("id",Text(row,"id")),("author",Text(row,"author")),("content",Text(row,"content")),("created_at",Text(row,"created_at")))).ToArray());
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(stable.ToJsonString())));
    }
    private async Task RenderAiReportsAsync()
    {
        await FlushEditorAsync();
        if(aiReportHistoryIdentity!=currentIdentity){await AiReportsAsync();return;}
        currentPage="AI汇报";ClearPage();heading.Text="AI汇报";page.Children.Add(heading);
        page.Children.Add(Label("汇报正文按首行的有效 YYYY-MM-DD 日期归档；旧汇报没有该行时按实际提交时间的北京时间日期归档。原汇报只读，人工补充不会代表任何AI已经执行了任务。"));
        var toolbar=new WrapPanel();page.Children.Add(toolbar);
        var datePicker=new DatePicker {SelectedDate=aiReportDay,DisplayDateEnd=BeijingNow().Date,Margin=new Thickness(0,0,8,8),MinWidth=170};
        toolbar.Children.Add(datePicker);
        datePicker.SelectedDateChanged+=(_,_)=>Run(async()=>
        {
            if(datePicker.SelectedDate is not DateTime selected||selected.Date>BeijingNow().Date)throw new InvalidOperationException("请选择不晚于今天的工作日期。");
            aiReportDay=selected.Date;aiReportAllDates=false;aiReportViewPage=0;await RenderAiReportsAsync();
        });
        toolbar.Children.Add(Button("前一天",async()=>{aiReportDay=aiReportDay.AddDays(-1);aiReportAllDates=false;aiReportViewPage=0;await RenderAiReportsAsync();}));
        toolbar.Children.Add(Button("今天（北京）",async()=>{aiReportDay=BeijingNow().Date;aiReportAllDates=false;aiReportViewPage=0;await RenderAiReportsAsync();}));
        toolbar.Children.Add(Button(aiReportAllDates?"● 全部日期":"全部日期",async()=>{aiReportAllDates=true;aiReportViewPage=0;await RenderAiReportsAsync();}));
        toolbar.Children.Add(Button("刷新完整历史",AiReportsAsync));
        toolbar.Children.Add(Button("＋ 人工补充实际工作汇报",()=>AiReportDraftAsync()));
        var days=aiReportHistory.Select(AiReportWorkDay).Where(day=>day.Length>0).Distinct(StringComparer.Ordinal).OrderDescending(StringComparer.Ordinal).ToArray();
        if(days.Length>0)
        {
            var history=new ComboBox {ItemsSource=days,SelectedItem=aiReportDay.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),MinWidth=170,ToolTip="实际读取的历史工作日期",Margin=new Thickness(0,0,8,8)};
            var historyBar=new WrapPanel();page.Children.Add(historyBar);historyBar.Children.Add(history);
            historyBar.Children.Add(Button("查看所选历史日",async()=>
            {
                if(history.SelectedItem is not string selected||!DateTime.TryParseExact(selected,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var parsed))throw new InvalidOperationException("请先选择实际历史日期。");
                if(parsed.Date>BeijingNow().Date)throw new InvalidOperationException("该条原归档日期晚于今天，可在“全部日期”查看原文；新增人工汇报仍需实际工作日。");
                aiReportDay=parsed;aiReportAllDates=false;aiReportViewPage=0;await RenderAiReportsAsync();
            }));
        }
        if(!connected)page.Children.Add(Label("本机副本 · 历史范围取决于已准备的离线资料，可能落后于其他设备。"));
        if(!aiReportHistoryAvailable)
        {
            page.Children.Add(Label("本机尚未保存汇报历史页面。连接或准备完整离线资料后查看；人工草稿仍可从“本机草稿”恢复。"));
            return;
        }
        var selectedDay=aiReportDay.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
        var visible=aiReportHistory.Where(row=>aiReportAllDates||AiReportWorkDay(row)==selectedDay).ToArray();
        var maximumPage=Math.Max(0,(visible.Length-1)/AiReportPageSize);aiReportViewPage=Math.Clamp(aiReportViewPage,0,maximumPage);
        page.Children.Add(Label((aiReportAllDates?"全部已读取日期":selectedDay)+$" · {visible.Length} 条 · 第 {aiReportViewPage+1} 页"));
        var paging=new WrapPanel();page.Children.Add(paging);
        if(aiReportViewPage>0)paging.Children.Add(Button("上一页",async()=>{aiReportViewPage--;await RenderAiReportsAsync();}));
        if(aiReportViewPage<maximumPage)paging.Children.Add(Button("下一页",async()=>{aiReportViewPage++;await RenderAiReportsAsync();}));
        List(visible.Skip(aiReportViewPage*AiReportPageSize).Take(AiReportPageSize).Select(row=>
        {
            var(_,body)=SplitAiReport(Text(row,"content"));var preview=string.Concat(body.EnumerateRunes().Take(110).Select(rune=>rune.ToString()));
            return (Text(row,"author")+" · "+preview,AiReportWorkDay(row)+LocalSuffix(row),(Func<Task>)(()=>ShowAiReportAsync(row)));
        }));
    }
    private static (string? WorkDate,string Body) SplitAiReport(string content)
    {
        var day=AiReportContentDay(content);var newline=content.IndexOf('\n');
        if(day!=null)return(day,newline<0?"":content[(newline+1)..]);
        return(null,content);
    }
    private static string? AiReportContentDay(string content)
    {
        var end=content.IndexOf('\n');if(end<0)end=content.Length;
        if(end>0&&content[end-1]=='\r')end--;
        if(end!=10)return null;
        var first=content.AsSpan(0,10);
        return DateOnly.TryParseExact(first,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var parsed)&&parsed.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture).AsSpan().SequenceEqual(first)?content[..10]:null;
    }
    private static string AiReportWorkDay(JsonObject row)
    {
        var day=AiReportContentDay(Text(row,"content"));if(day!=null)return day;
        return DateTimeOffset.TryParse(Text(row,"created_at"),CultureInfo.InvariantCulture,DateTimeStyles.None,out var stamp)?stamp.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd",CultureInfo.InvariantCulture):"";
    }
    private async Task ShowAiReportAsync(JsonObject row)
    {
        await FlushEditorAsync();currentPage="AI汇报";ClearPage();heading.Text="AI汇报正文";page.Children.Add(heading);
        var(day,body)=SplitAiReport(Text(row,"content"));
        page.Children.Add(Label("署名："+Text(row,"author")));
        page.Children.Add(Label("工作日期："+(day??AiReportWorkDay(row))));
        var pending=AiReportPending(Text(row,"id"));
        page.Children.Add(Label(pending!=null&&pending.Status!=PendingStatus.Confirmed?"本机保存状态："+StatusLabel(pending.Status)+"。尚未表示服务器已保存。":"提交于："+AiReportSubmission(Text(row,"created_at"))));
        page.Children.Add(new TextBox {Text=body,IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=350,MaxHeight=650,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
        var bar=new WrapPanel();page.Children.Add(bar);
        bar.Children.Add(Button("返回汇报历史",RenderAiReportsAsync));
        bar.Children.Add(Button("导出文字副本",()=>ExportTextAsync("好多鱼AI汇报.txt","署名："+Text(row,"author")+"\n\n"+Text(row,"content"))));
        if(pending?.CanEditQueued==true)bar.Children.Add(Button("继续尚未发送的人工稿",async()=>
        {
            if(await HandlePendingRecordAsync(row))return;
            await AiReportDraftAsync("/api/v1/ai-reports/"+Text(row,"id"));
        }));
        else if(pending!=null&&pending.Status is not(PendingStatus.Confirmed or PendingStatus.Superseded))
            bar.Children.Add(Button("核对原保存",()=>InspectOperationAsync(pending)));
        else bar.Children.Add(Button("另存新的人工补充草稿",()=>NewAiReportCopyAsync(row)));
    }
    private static string AiReportSubmission(string value)=>DateTimeOffset.TryParse(value,CultureInfo.InvariantCulture,DateTimeStyles.None,out var stamp)?stamp.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd HH:mm:ss",CultureInfo.InvariantCulture)+"（北京时间）":"提交时间未取得";
    private PendingOperation? AiReportPending(string reportId)=>Engine.Snapshot.Outbox.LastOrDefault(operation=>operation.Path=="/api/v1/ai-reports/"+reportId&&operation.Method=="PUT"&&operation.Status!=PendingStatus.Superseded);
    private Task NewAiReportCopyAsync(JsonObject row)
    {
        var id=Guid.NewGuid().ToString();var(day,body)=SplitAiReport(Text(row,"content"));
        var values=Obj(("author",""),("report_date",day!=null&&string.CompareOrdinal(day,BeijingNow().ToString("yyyy-MM-dd",CultureInfo.InvariantCulture))<=0?day:""),("content",body));
        return EditAiReportDraftAsync(Obj(("id",id)),values,"/api/v1/ai-reports/"+id);
    }
    private async Task AiReportDraftAsync(string? key=null)
    {
        await FlushEditorAsync();
        if(key==null)
        {
            var id=Guid.NewGuid().ToString();
            await EditAiReportDraftAsync(Obj(("id",id)),Obj(("author",""),("report_date",aiReportDay.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)),("content","")),"/api/v1/ai-reports/"+id);
            return;
        }
        if(Engine.Snapshot.Drafts.TryGetValue(key,out var draft))
        {
            var saved=JsonNode.Parse(draft.Text)?.AsObject()??throw new InvalidDataException("人工汇报草稿无法读取，原文件保留。");
            if(Text(saved,"kind")!="ai-report"||Text(saved,"key")!=key||saved["original"] is not JsonObject original||saved["values"] is not JsonObject values)
                throw new InvalidDataException("人工汇报草稿身份不匹配，未创建替代记录。");
            await EditAiReportDraftAsync(original,values,key);return;
        }
        var queued=Engine.Snapshot.Outbox.LastOrDefault(operation=>operation.ResourceKey==key&&operation.Path==key&&operation.Method=="PUT");
        if(queued?.CanEditQueued!=true)throw new InvalidOperationException("未找到可编辑的尚未发送草稿，原保存与数据保留。");
        var command=JsonNode.Parse(queued.RequestBodyJson)?.AsObject()??throw new InvalidDataException("原汇报请求不完整。");
        var(workDate,body)=SplitAiReport(Text(command,"content"));
        await EditAiReportDraftAsync(Obj(("id",key.Split('/').Last())),Obj(("author",Text(command,"author")),("report_date",workDate),("content",body)),key);
    }
    private async Task EditAiReportDraftAsync(JsonObject original,JsonObject values,string key)
    {
        await FlushEditorAsync();var id=Text(original,"id");var path="/api/v1/ai-reports/"+id;
        if(key!=path||!Guid.TryParseExact(id,"D",out _))throw new InvalidDataException("人工汇报草稿缺少稳定标识，原数据保留。");
        var history=Engine.Snapshot.Outbox.Where(operation=>operation.Path==path&&operation.Method=="PUT").ToArray();
        var immutable=history.LastOrDefault(operation=>operation.Status==PendingStatus.Confirmed||operation.SendAttempts>0||operation.PreparedBodyJson!=null);
        if(immutable!=null||Text(original,"created_at").Length>0||Text(original,"content_hash").Length>0)
        {
            if(immutable?.RemoteJson!=null&&Data(immutable.RemoteJson) is JsonObject receipt&&Text(receipt,"id")==id&&Text(receipt,"created_at").Length>0)
            {await ShowAiReportAsync(receipt);return;}
            ClearPage();heading.Text="原人工汇报稿（只读）";page.Children.Add(heading);
            page.Children.Add(Label("此标识已有保存尝试。服务器上的汇报不可修改；未知原请求不会被替换或另建ID重发。"));
            page.Children.Add(Label("署名："+Text(values,"author")+"\n实际工作日期："+Text(values,"report_date")));
            page.Children.Add(new TextBox {Text=Text(values,"content"),IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,MinHeight=300,MaxHeight=600,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
            page.Children.Add(Button("导出原稿",()=>ExportTextAsync("好多鱼人工汇报原稿.txt",Text(values,"author")+"\n"+Text(values,"report_date")+"\n\n"+Text(values,"content"))));
            if(immutable!=null)page.Children.Add(Button("核对原保存",()=>InspectOperationAsync(immutable)));
            page.Children.Add(Button("返回汇报历史",AiReportsAsync));return;
        }
        currentPage="AI汇报";ClearPage();heading.Text="人工补充实际工作汇报";page.Children.Add(heading);
        page.Children.Add(Label("请填写真实署名、实际工作日期和已发生的工作内容。此表单不会启动AI任务，也不会证明某个AI执行过工作。成功保存后原记录只读。"));
        page.Children.Add(Label("真实署名（必填，最多120个Unicode字符）"));var author=new TextBox {Text=Text(values,"author")};page.Children.Add(author);
        page.Children.Add(Label("实际工作日期（必填，不晚于今天）"));var date=new DatePicker {SelectedDate=DateTime.TryParseExact(Text(values,"report_date"),"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var parsed)?parsed:null,DisplayDateEnd=BeijingNow().Date,Margin=new Thickness(0,0,0,12)};page.Children.Add(date);
        page.Children.Add(Label("实际工作正文（必填，日期行与正文合计最多16KiB）"));var content=new TextBox {Text=Text(values,"content"),AcceptsReturn=true,AcceptsTab=true,TextWrapping=TextWrapping.Wrap,MinHeight=350,MaxHeight=650,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};page.Children.Add(content);
        var generation=0;void Changed(){generation++;draftDirty=true;draftTimer.Stop();draftTimer.Start();}
        author.TextChanged+=(_,_)=>Changed();content.TextChanged+=(_,_)=>Changed();var readDate=ReviewDateInput(date,Text(values,"report_date"),Changed);
        JsonObject Current()
        {
            var result=Obj(("author",author.Text),("report_date",readDate()),("content",content.Text));ReviewEnsureUnicode(result);return result;
        }
        saveEditor=async()=>
        {
            var captured=generation;var value=Current();
            var payload=Obj(("kind","ai-report"),("key",key),("original",original.DeepClone()),("values",value));
            await SaveLocalDraftAsync(new LocalDraft {Key=key,Text=payload.ToJsonString(),Title="人工汇报 · "+Text(value,"report_date")+" · "+Text(value,"author"),BaseVersion=0});
            draftDirty=generation!=captured;if(draftDirty){draftTimer.Stop();draftTimer.Start();}
        };
        var bar=new WrapPanel {Margin=new Thickness(0,12,0,0)};page.Children.Add(bar);
        bar.Children.Add(Button(connected?"保存并同步人工汇报":"存入本机待同步队列",async()=>
        {
            var sent=Engine.Snapshot.Outbox.LastOrDefault(operation=>operation.Path==path&&operation.Method=="PUT"&&(operation.SendAttempts>0||operation.PreparedBodyJson!=null||operation.Status==PendingStatus.Confirmed));
            if(sent!=null)throw new InvalidOperationException("该汇报已尝试保存，不能修改原ID正文。当前草稿保留，请先核对原保存。");
            var command=BuildAiReportCommand(original,Current());draftDirty=true;currentPage="AI汇报";
            await QueueAsync("PUT",command.Path,command.Body,key);
        }));
        bar.Children.Add(Button("保存本机草稿",async()=>{draftDirty=true;await SaveDraftSafelyAsync();}));
        bar.Children.Add(Button("导出文字",()=>ExportTextAsync("好多鱼人工汇报草稿.txt",author.Text+"\n"+readDate()+"\n\n"+content.Text)));
        bar.Children.Add(Button("返回汇报历史",AiReportsAsync));draftDirty=true;await saveEditor();
    }
    private sealed record AiReportCommand(string Path,JsonObject Body);
    private AiReportCommand BuildAiReportCommand(JsonObject original,JsonObject values)
    {
        var id=Text(original,"id");if(!Guid.TryParseExact(id,"D",out var uuid)||uuid.ToString("D")!=id)throw new InvalidOperationException("汇报必须保留原始稳定标识。");
        if(Text(original,"created_at").Length>0||Text(original,"content_hash").Length>0)throw new InvalidOperationException("已提交汇报不可改写；请保留原文并明确另存新的人工稿。");
        var rawAuthor=Text(values,"author");var rawBody=Text(values,"content");
        if(rawAuthor.Any(AiReportForbiddenControl)||rawBody.Any(AiReportForbiddenControl))throw new InvalidOperationException("署名或正文含无效控制字符，原稿保留，请明确移除后再保存。");
        var author=AiReportTrim(rawAuthor.Replace("\r\n","\n").Replace('\r','\n'));
        var body=rawBody.Replace("\r\n","\n").Replace('\r','\n');
        var day=Text(values,"report_date");
        if(!DateOnly.TryParseExact(day,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date)||date.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture)!=day||date>DateOnly.FromDateTime(BeijingNow().Date))
            throw new InvalidOperationException("请填写不晚于今天的实际工作日期。");
        var(pastedDay,pastedBody)=SplitAiReport(AiReportTrim(body));
        if(pastedDay!=null)
        {
            if(pastedDay!=day)throw new InvalidOperationException("正文首行日期与工作日期不同，请明确核对后再保存。原稿保留。");
            body=AiReportTrimEnd(pastedBody);
        }
        else body=AiReportTrimEnd(body);
        var encoded=new UTF8Encoding(false,true);int bytes;
        try{_=encoded.GetByteCount(author);bytes=encoded.GetByteCount(day+"\n"+body);}
        catch(EncoderFallbackException){throw new InvalidOperationException("署名或正文包含不完整Unicode字符，请保留当前输入并完成后再保存。");}
        if(author.Length==0||author.EnumerateRunes().Count()>120||author.Any(c=>c<' '||c==127))throw new InvalidOperationException("请填写1–120个Unicode字符的真实单行署名。");
        if(AiReportTrim(body).Length==0||bytes>16384)throw new InvalidOperationException("请填写实际工作正文；连同日期行最多16KiB，不含无效控制字符。");
        return new("/api/v1/ai-reports/"+id,Obj(("author",author),("content",day+"\n"+body)));
    }
    private static bool AiReportForbiddenControl(char value)=>value<=8||value is '\u000b' or '\u000c'||value>=14&&value<=31||value==127;
    private static bool AiReportWhitespace(char value)=>value is '\u0009' or '\u000a' or '\u000b' or '\u000c' or '\u000d' or '\u0020' or '\u00a0' or '\u1680' or '\u2028' or '\u2029' or '\u202f' or '\u205f' or '\u3000' or '\ufeff'||value>='\u2000'&&value<='\u200a';
    private static string AiReportTrim(string value)
    {
        var start=0;var end=value.Length;while(start<end&&AiReportWhitespace(value[start]))start++;while(end>start&&AiReportWhitespace(value[end-1]))end--;return value[start..end];
    }
    private static string AiReportTrimEnd(string value)
    {
        var end=value.Length;while(end>0&&AiReportWhitespace(value[end-1]))end--;return value[..end];
    }
}
