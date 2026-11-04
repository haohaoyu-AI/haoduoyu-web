using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace Haoduoyu.Windows;

// Pure request construction shared by the native controls and real Worker contract tests.
public sealed record ReviewFormField(string Name, string Label, string Type = "text", bool Required = false,
    bool Integer = false, decimal? Maximum = null, int MaximumBytes = 2000, string[]? Choices = null,
    string? ReferenceKind = null, int ItemBytes = 200, decimal Minimum = 0);
public sealed record ReviewFormCommand(string Method, string Path, JsonObject Body);

public static class ReviewFormLogic
{
    public static readonly string[] Kinds = ["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health"];
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly JsonSerializerOptions JsonBytes = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    public static IReadOnlyList<ReviewFormField> Fields(string kind) => kind switch
    {
        "articles" => [F("account","账号名称",required:true,max:120),F("title","文章标题",required:true),F("url","公开文章链接","url",max:4096),F("published_at","发布时间（北京）","time"),
            F("platform_article_id","平台文章标识",max:240),F("topic_category","题材分类",max:240),F("title_pattern","标题形式",max:1000),F("sample_title","参考标题"),F("sample_url","参考文章链接","url",max:4096),
            F("reference_article_id","关联对标文章","reference",reference:"benchmark-articles"),N("image_count","图片数量",integer:true),F("source_chat","材料或讨论来源",max:4096),N("playbook_version_used","采用的规则库版本",integer:true,min:1),
            F("applied_rule_ids","采用的规则","references",reference:"rules",itemBytes:120)],
        "snapshots" => [F("article_id","所属复盘文章","reference",true,reference:"articles"),F("snapshot_date","快照日期","date",true),N("age_hours","发布后小时数",integer:true),F("source","数据来源","choice",choices:["manual","toutiao_excel"]),
            N("impressions","展现量",integer:true),N("fan_impressions","粉丝展现量",integer:true),N("reads","阅读量",integer:true),N("fan_reads","粉丝阅读量",integer:true),N("ctr","点击率（%）",max:100),N("completion_rate","读完率（%）",max:100),N("avg_read_seconds","平均阅读秒数"),
            N("likes","点赞",integer:true),N("comments","评论",integer:true),N("reposts","转发",integer:true),N("shares","分享",integer:true),N("favorites","收藏",integer:true),N("revenue","收益"),
            F("traffic_sources","流量来源","object"),F("completion_curve","阅读完成曲线","structure"),F("audience","受众信息","object")],
        "reports" => [F("account","账号名称",required:true,max:120),F("period_type","复盘周期","choice",true,choices:["daily","weekly","three_day"]),F("period_start","开始日期","date",true),F("period_end","结束日期","date",true),
            F("summary_md","复盘摘要（日复盘最多两句）","content",max:131072),F("verdicts","逐篇结论","verdicts",true),F("findings","规则验证与推翻","findings",true),F("metrics","复盘指标","metrics",true),N("playbook_version","规则库版本",integer:true,min:1)],
        "playbooks" => [F("account","账号名称",required:true,max:120),F("status","规则库状态","choice",true,choices:["draft","active","archived"]),N("version","版本号",true,true,min:1),F("published_on","发布日期","date",true),
            F("content_md","规则库正文","content",max:131072),F("rules","规则表","rules",true),F("changelog_md","修订说明","content",max:131072),F("sent_to_gemini_at","交接时间（北京）","time")],
        "benchmark-accounts" => [F("account","所属复盘账号",required:true,max:120),F("platform","平台",required:true,max:120),F("name","对标账号名称",required:true),F("profile_url","账号主页","url",max:4096),N("fans","粉丝数",integer:true),F("is_featured_author","优质作者","boolean"),
            F("posting_cadence","发布频率"),F("topic_focus","题材重点"),F("title_patterns","标题特征","strings",itemBytes:2000),F("structure_notes_md","结构观察","longtext",max:131072)],
        "benchmark-articles" => [F("benchmark_account_id","所属对标账号","reference",true,reference:"benchmark-accounts"),F("title","对标文章标题",required:true),F("url","原文链接","url",true,max:4096),N("reads","阅读量",integer:true),F("published_at","发布时间（北京）","time"),
            F("title_pattern","标题形式","choice",choices:["dialogue","外媒","又一","数字开头","央视曝光","其他"]),F("topic","选题"),F("news_hook","新闻切入点"),N("word_count","字数",integer:true),N("image_count","图片数",integer:true),F("collected_on","采集日期","date")],
        "notes" => [F("account","账号名称",required:true,max:120),F("note_date","笔记日期","date",true),F("kind","笔记类型","choice",true,choices:["insight","decision","diagnosis","account_health"]),F("title","笔记标题",required:true),F("body_md","正文","longtext",max:131072),
            F("tags","标签","strings"),F("related_article_ids","相关文章","references",reference:"articles"),F("related_rule_ids","相关规则","references",reference:"rules",itemBytes:120),F("decided_by","决策人")],
        "account-health" => [F("account","账号名称",required:true,max:120),F("platform","平台",required:true,max:120),F("observed_on","观察日期","date",true),N("impressions_per_day","日均展现",integer:true),N("reads_per_day","日均阅读",integer:true),N("ctr","点击率（%）",max:100),
            F("since_date","状态起始日期","date"),F("platform_notice","平台通知","notice"),F("judgement","当前判断","choice",choices:["normal","限流","降权","封禁"]),F("action","后续动作",max:131072),F("resume_on","恢复日期","date")],
        _ => throw new InvalidOperationException("无法识别复盘记录类型，原稿保留。")
    };
    private static ReviewFormField F(string name,string label,string type="text",bool required=false,int max=2000,string[]? choices=null,string? reference=null,int itemBytes=200)=>new(name,label,type,required,MaximumBytes:max,Choices:choices,ReferenceKind:reference,ItemBytes:itemBytes);
    private static ReviewFormField N(string name,string label,bool required=false,bool integer=false,decimal? max=null,decimal min=0)=>new(name,label,"number",required,integer,max,Minimum:min);
    public static JsonObject New(string kind,string id,string account,string date)
    {
        Uuid(id); Date(date);
        var value=new JsonObject { ["id"]=id };
        foreach(var field in Fields(kind))value[field.Name]=null;
        if(value.ContainsKey("account"))value["account"]=account;
        foreach(var name in new[]{"snapshot_date","period_start","period_end","published_on","note_date","observed_on"})if(value.ContainsKey(name))value[name]=date;
        if(kind=="articles")value["platform"]="toutiao";
        if(kind=="snapshots")value["source"]="manual";
        if(kind=="reports") { value["summary_md"]="";value["verdicts"]=new JsonObject();value["findings"]=new JsonObject{["verified"]=new JsonArray(),["overturned"]=new JsonArray()};value["metrics"]=new JsonObject(); }
        if(kind=="playbooks") { value["status"]="draft";value["content_md"]="";value["changelog_md"]="";value["rules"]=new JsonArray(); }
        return value;
    }
    public static string TimeDisplay(JsonNode? value)
    {
        var text=Scalar(value);if(text.Length==10)return text;
        return DateTimeOffset.TryParse(text,CultureInfo.InvariantCulture,DateTimeStyles.None,out var stamp)?stamp.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd HH:mm:ss",CultureInfo.InvariantCulture):text;
    }
    public static ReviewFormCommand Build(string kind,JsonObject original,JsonObject values)
    {
        if(values.Any(pair=>pair.Key.StartsWith("__native_pending_",StringComparison.Ordinal)&&pair.Value!=null))Invalid("请先完成或取消尚未确认的表格条目编辑；所有输入保留在本机草稿中。");
        var id=Scalar(original["id"]);Uuid(id);
        var hash=Scalar(original["content_hash"]);if(hash.Length>0&&(hash.Length!=64||hash.Any(c=>!char.IsAsciiHexDigitLower(c))))Invalid("原记录校验标识无效，请重新读取完整详情。");
        var editing=hash.Length>0;var body=new JsonObject();
        if(editing)body["expected_hash"]=hash;
        if(kind=="articles"&&!editing)body["platform"]="toutiao";
        foreach(var field in Fields(kind))
        {
            var input=values[field.Name];JsonNode? normalized;
            if(field.Type is "object" or "structure" or "rules" or "verdicts" or "findings" or "metrics" or "notice") normalized=Complex(field,input);
            else if(field.Type is "strings" or "references")normalized=ArrayValue(field,input);
            else
            {
                var raw=Scalar(input).Replace("\r\n","\n").Replace('\r','\n').Trim();
                if(raw.Length==0)
                {
                    if(field.Required)Invalid("请填写"+field.Label+"。");
                    normalized=field.Type=="content"?JsonValue.Create(""):null;
                }
                else if(field.Type=="number")
                {
                    normalized=Number(raw,field.Integer,field.Minimum,field.Maximum??9007199254740991M,field.Label);
                    if(raw==Scalar(original[field.Name])&&original[field.Name] is JsonValue originalNumber&&originalNumber.GetValueKind()==JsonValueKind.Number)normalized=originalNumber.DeepClone();
                }
                else if(field.Type=="boolean")normalized=raw is "true" or "True" or "是"?JsonValue.Create(true):raw is "false" or "False" or "否"?JsonValue.Create(false):throw new InvalidOperationException("请选择"+field.Label+"。");
                else if(field.Type=="date")normalized=JsonValue.Create(Date(raw));
                else if(field.Type=="time")
                {
                    if(raw==TimeDisplay(original[field.Name])||raw==Scalar(original[field.Name]))normalized=original[field.Name]?.DeepClone();
                    else normalized=JsonValue.Create(Timestamp(raw));
                }
                else
                {
                    var text=Clean(raw,field.MaximumBytes,field.Type is "longtext" or "content",field.Label);
                    if(field.Type=="url")Url(text);
                    if(field.Type=="reference")Uuid(text);
                    if(field.Choices!=null&&!field.Choices.Contains(text,StringComparer.Ordinal))Invalid("请选择"+field.Label+"的有效值。");
                    normalized=JsonValue.Create(text);
                }
            }
            body[field.Name]=normalized;
        }
        if(kind=="reports")
        {
            if(string.CompareOrdinal(Scalar(body["period_start"]),Scalar(body["period_end"]))>0)Invalid("结束日期不能早于开始日期。");
            if(Scalar(body["period_type"])=="three_day"&&(!editing||Scalar(original["period_type"])!="three_day"))Invalid("三日复盘已停止新增，请选择日复盘或周复盘。");
            if(Scalar(body["period_type"])=="daily"&&Regex.Split(Scalar(body["summary_md"]),@"(?:[。！？!?]+|\.(?=\s|$))\s*").Count(part=>part.Trim().Length>0)>2)Invalid("日复盘摘要最多两句，请保留完整草稿后精简。");
        }
        return new(editing?"PATCH":"PUT","/api/v1/review/"+kind+"/"+id,body);
    }
    public static JsonNode? NormalizeStructured(string type,JsonNode? value) => Complex(new("value","结构化内容",type),value);
    private static JsonNode? Complex(ReviewFormField field,JsonNode? input)
    {
        if(input==null)
        {
            if(field.Required)Invalid("请完成"+field.Label+"。");
            return null;
        }
        if(field.Type=="notice")
        {
            if(input is JsonValue)return JsonValue.Create(Clean(Scalar(input),4000,false,field.Label));
            if(input is not JsonObject notice||notice.Any(kv=>kv.Key is not("text" or "date")))Invalid("平台通知需要文字与可选日期。");
            var result=(JsonObject)input.DeepClone();result["text"]=Clean(Scalar(result["text"]),4000,false,field.Label);
            if(result["date"]!=null)result["date"]=Date(Scalar(result["date"]));return result;
        }
        if(field.Type=="rules")return Rules(input);
        if(field.Type=="verdicts")
        {
            if(input is not JsonObject)Invalid("逐篇结论需要关联具体文章。");
            var result=(JsonObject)input.DeepClone();foreach(var (id,node) in result)
            {
                Uuid(id);if(node is not JsonObject row||row.Count!=2||!row.ContainsKey("verdict")||!row.ContainsKey("reason")||Scalar(row["verdict"]) is not("爆" or "中" or "扑"))Invalid("结论需要选择文章、爆中扑与具体原因。");
                node!["reason"]=Clean(Scalar(node["reason"]),8192,true,"结论原因");
            }
            Budget(result);return result;
        }
        if(field.Type=="findings")
        {
            if(input is not JsonObject obj||obj.Count!=2||obj["verified"] is not JsonArray||obj["overturned"] is not JsonArray)Invalid("规则检验需要已验证与已推翻两类记录。");
            var result=(JsonObject)input.DeepClone();foreach(var type in new[]{"verified","overturned"})foreach(var node in result[type]!.AsArray())
            { if(node is not JsonObject)Invalid("请选择具体规则。");node!["rule_id"]=Clean(Scalar(node["rule_id"]),120,false,"规则编号"); }
            Budget(result);return result;
        }
        if(field.Type=="structure") { if(input is not(JsonObject or JsonArray))Invalid("曲线需要结构化的数据点。"); }
        else if(input is not JsonObject)Invalid(field.Label+"需要结构化字段。");
        Budget(input);return input.DeepClone();
    }
    private static JsonArray Rules(JsonNode input)
    {
        if(input is not JsonArray)Invalid("规则需要逐条填写。");
        var result=(JsonArray)input.DeepClone();var seen=new HashSet<string>(StringComparer.Ordinal);
        foreach(var node in result)
        {
            if(node is not JsonObject)Invalid("规则数据无效。");
            var rule=node!.AsObject();var id=Clean(Scalar(rule["rule_id"]),120,false,"规则编号");if(!seen.Add(id))Invalid("规则编号不能重复。");rule["rule_id"]=id;
            if(rule.Any(pair=>!new[]{"rule_id","section","text","check","status","evidence","evidence_note","support_ids","counter_ids","trials"}.Contains(pair.Key,StringComparer.Ordinal)))Invalid("规则含当前服务尚不支持的字段；原稿完整保留，不会截断后写入。");
            if(Scalar(rule["section"]) is not("keep_topic" or "drop_topic" or "title" or "body" or "audience" or "checklist"))Invalid("请选择规则分类。");
            rule["text"]=Clean(Scalar(rule["text"]),16384,true,"规则文字");
            if(rule.ContainsKey("status")&&Scalar(rule["status"]) is not("candidate" or "trial" or "kept" or "dropped" or "hold"))Invalid("请选择有效规则状态。");
            if(rule.TryGetPropertyValue("check",out var check))
            {
                if(check is JsonValue&&Scalar(check)=="manual") { }
                else if(check is JsonObject c&&Scalar(c["type"])=="manual"&&c.Count==1) { }
                else if(check is JsonObject regex&&Scalar(regex["type"])=="regex"&&regex.Count==2&&regex.ContainsKey("value"))regex["value"]=Clean(Scalar(regex["value"]),2000,false,"人工核对模式");
                else Invalid("规则检查方式需要人工检查或保存的匹配表达式；表达式不会执行。");
            }
            foreach(var key in new[]{"support_ids","counter_ids"})if(rule.TryGetPropertyValue(key,out var refs))rule[key]=ArrayValue(new(key,key,"references",ReferenceKind:"articles"),refs)??new JsonArray();
            if(rule.ContainsKey("trials"))rule["trials"]=Number(Scalar(rule["trials"]),true,0,9007199254740991M,"试验次数");
            if(rule.ContainsKey("evidence_note")&&rule["evidence_note"]!=null)rule["evidence_note"]=Clean(Scalar(rule["evidence_note"]),2000,true,"证据说明");
            if(rule.TryGetPropertyValue("evidence",out var evidence))
            {
                if(evidence is not JsonObject e||new[]{"metric","with_median","without_median","n_with","n_without"}.Any(k=>!e.ContainsKey(k)))Invalid("证据需要指标、两组中位数与样本数量。");
                var evalue=evidence!.AsObject();evalue["metric"]=Clean(Scalar(evalue["metric"]),120,false,"证据指标");
                if(evalue.Count!=5)Invalid("证据含当前服务尚不支持的字段；原稿保留。");
                foreach(var key in new[]{"with_median","without_median"})if(evalue[key]!=null)evalue[key]=Number(Scalar(evalue[key]),false,0,9007199254740991M,"证据中位数");
                foreach(var key in new[]{"n_with","n_without"})evalue[key]=Number(Scalar(evalue[key]),true,0,9007199254740991M,"证据样本数");
            }
        }
        Budget(result);return result;
    }
    private static JsonNode? ArrayValue(ReviewFormField field,JsonNode? input)
    {
        if(input==null||input is JsonValue&&Scalar(input).Length==0)return null;
        var entries=input is JsonArray array?array.Select(Scalar).ToArray():Scalar(input).Split('\n',StringSplitOptions.TrimEntries|StringSplitOptions.RemoveEmptyEntries);
        if(entries.Length>1000)Invalid(field.Label+"最多1000项。");
        var seen=new HashSet<string>(StringComparer.Ordinal);var result=new JsonArray();foreach(var entry in entries)
        {
            var text=Clean(entry,field.ItemBytes,false,field.Label);if(field.ReferenceKind is "articles" or "benchmark-articles" or "benchmark-accounts")Uuid(text);
            if(!seen.Add(text))Invalid(field.Label+"不能重复。");result.Add(text);
        }
        Budget(result);return result;
    }
    public static string Clean(string value,int maximumBytes,bool multiline,string label)
    {
        value=value.Replace("\r\n","\n").Replace('\r','\n').Trim();
        int bytes;try{bytes=Utf8.GetByteCount(value);}catch(EncoderFallbackException){throw new InvalidOperationException(label+"包含不完整的Unicode字符，请保留窗口并完成输入。");}
        if(value.Length==0||bytes>maximumBytes||value.Any(c=>c<32&&c is not '\n' and not '\t'||c==127)||!multiline&&value.Any(c=>c is '\n' or '\t'))Invalid(label+"为空、过长或含无效字符。");
        return value;
    }
    public static string Scalar(JsonNode? node)=>node?.ToString()??"";
    public static string Date(string value)=>DateOnly.TryParseExact(value,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date)?date.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture):throw new InvalidOperationException("请填写有效的YYYY-MM-DD日期。");
    public static void Uuid(string value){if(!Guid.TryParseExact(value,"D",out var uuid)||uuid.ToString("D")!=value)Invalid("请选择有效的已有记录，不能猜测关联标识。");}
    private static void Url(string value){if(!Uri.TryCreate(value,UriKind.Absolute,out var url)||url.Scheme is not("http" or "https")||url.UserInfo.Length>0)Invalid("链接须为不含账号口令的HTTP/HTTPS地址。");}
    private static JsonNode Number(string raw,bool integer,decimal minimum,decimal maximum,string label)
    {
        if(!double.TryParse(raw,NumberStyles.AllowDecimalPoint|NumberStyles.AllowExponent,CultureInfo.InvariantCulture,out var value)||!double.IsFinite(value)||value<(double)minimum||value>(double)maximum||integer&&Math.Truncate(value)!=value)throw new InvalidOperationException(label+"须为有效非负数；未知时留空。");
        return integer?JsonValue.Create((long)value)!:JsonValue.Create(value)!;
    }
    private static string Timestamp(string raw)
    {
        if(DateOnly.TryParseExact(raw,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date))return date.ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
        if(DateTime.TryParseExact(raw,new[]{"yyyy-MM-dd HH:mm","yyyy-MM-dd HH:mm:ss"},CultureInfo.InvariantCulture,DateTimeStyles.None,out var local))return new DateTimeOffset(DateTime.SpecifyKind(local,DateTimeKind.Unspecified),TimeSpan.FromHours(8)).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture);
        if(DateTimeOffset.TryParse(raw,CultureInfo.InvariantCulture,DateTimeStyles.None,out var stamp)&&raw.Contains('T')&&(raw.EndsWith('Z')||Regex.IsMatch(raw,@"[+-]\d{2}:\d{2}$")))return stamp.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",CultureInfo.InvariantCulture);
        throw new InvalidOperationException("时间请填有效日期或北京时间YYYY-MM-DD HH:mm:ss。");
    }
    private static void Budget(JsonNode node)
    {
        var count=0;void Visit(JsonNode? value,int depth)
        {
            if(++count>10000||depth>12)Invalid("结构化内容过大或嵌套过深。");
            if(value is JsonObject obj)foreach(var(k,v)in obj){if(k is "__proto__" or "prototype" or "constructor")Invalid("结构化字段包含保留名称。");Visit(v,depth+1);}
            else if(value is JsonArray array)foreach(var child in array)Visit(child,depth+1);
            else if(value is JsonValue scalar&&scalar.TryGetValue<string>(out var text))
            {try{_=Utf8.GetByteCount(text);}catch(EncoderFallbackException){Invalid("结构化内容包含不完整Unicode字符。");}if(text.Any(c=>c<32&&c is not '\n' and not '\t'||c==127))Invalid("结构化内容包含无效字符。");}
        }
        Visit(node,0);if(Utf8.GetByteCount(node.ToJsonString(JsonBytes))>65536)Invalid("结构化内容最多64KiB。");
    }
    private static void Invalid(string message)=>throw new InvalidOperationException(message);
}
