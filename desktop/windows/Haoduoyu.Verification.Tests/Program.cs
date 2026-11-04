using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Windows;

var cases = new (string Name, Action Run)[]
{
    ("snapshots detach every checklist object and nested unknown field", SnapshotDetached),
    ("an explicit selection changes only its indexed done boolean", SingleSelection),
    ("untouched unknown done values remain exact and explicit choices may clarify them", UnknownStates),
    ("successive local selections accumulate without mutating earlier drafts", MultipleSelections),
    ("old drafts missing the checklist retain their exact original baseline", MissingFallback),
    ("missing done stays unknown until an explicit false selection", MissingDone),
    ("null and absent inventories never become empty confirmed lists", NullAndAbsent),
    ("an obtained empty inventory remains empty and cannot invent an item", EmptyInventory),
    ("non-array inventories fail closed without converting their contents", InvalidInventories),
    ("non-object inventory entries cannot be edited or silently dropped", InvalidItems),
    ("negative and out-of-range selections cannot redirect an action", InvalidIndices),
    ("append delete reorder and metadata replacement cannot be saved", StructuralChanges),
    ("an existing inventory cannot be erased or replaced from unknown state", ErasureAndUnknown),
    ("new done values require an explicit boolean and cannot remove old evidence", InvalidStates),
    ("the actual article builder merges selected states and all other editor input", BuilderMerge),
    ("actual article updates retain server identity and original CAS version", VersionedUpdate),
    ("article creation retains server-assigned identity and only explicit version zero", VersionedCreate),
    ("missing malformed and unsafe versions cannot create or update an article", InvalidVersions),
    ("invalid Unicode in checklist values and keys is never replaced", InvalidUnicode),
    ("untrusted keys and excessive depth retain the unsent original", UnsafeAndDeep),
    ("excessive node counts fail closed before producing a changed draft", NodeBudget),
    ("Unicode budgets use semantic bytes and still enforce the 64 KiB ceiling", ChecklistByteBudget),
    ("the complete pipeline JSON aggregate remains bounded after a selection", AggregateBudget),
    ("the actual encoded article request retains its independent 256 KiB bound", RequestBudget)
};
var failures = 0;
foreach (var item in cases)
{
    try { item.Run(); Console.WriteLine("PASS " + item.Name); }
    catch (Exception error) { failures++; Console.WriteLine("FAIL " + item.Name + ": " + error.Message); }
}
Console.WriteLine($"Verification form: {cases.Length - failures}/{cases.Length} checks passed; shared actual article builder, synthetic detached JSON, no sockets or real user data.");
return failures == 0 ? 0 : 1;

static void True(bool condition, string message = "assertion failed")
{ if (!condition) throw new InvalidOperationException(message); }
static void Same(JsonNode? first, JsonNode? second, string message = "JSON changed") => True(JsonNode.DeepEquals(first, second), message);
static void Reject(Action action)
{
    try { action(); }
    catch (Exception error) when (error is InvalidOperationException or ArgumentException or JsonException) { return; }
    throw new InvalidDataException("unsafe action was accepted");
}
static JsonObject Original() => new()
{
    ["id"] = "00000000-0000-4000-8000-000000000091", ["account_id"] = "synthetic-account", ["version"] = 7,
    ["title"] = "隔离合成待核文章 😀", ["status"] = "draft_saved", ["production_mode"] = "manual", ["summary"] = "未改概况", ["notes"] = "未改备注",
    ["sample"] = new JsonObject { ["source"] = "原始来源", ["future"] = new JsonArray("😀", 0, null) },
    ["draft_ref"] = new JsonObject { ["pgc_id"] = "synthetic-draft", ["future"] = new JsonObject { ["keep"] = true } },
    ["verify_items"] = new JsonArray(
        new JsonObject { ["id"] = "item-A", ["text"] = "图数待核", ["done"] = false, ["future"] = new JsonObject { ["来源😀"] = new JsonArray(0, "原文", null) } },
        new JsonObject { ["id"] = "item-B", ["text"] = "未知处理状态", ["done"] = "unknown", ["future"] = 0 },
        new JsonObject { ["id"] = "item-C", ["text"] = "尚未记录状态", ["reason"] = null })
};
static JsonObject Values(JsonObject original) => ArticlePipelineFormLogic.FormValues(original);
static JsonArray Items(JsonObject value) => value["verify_items"]!.AsArray();
static JsonObject Item(JsonObject value, int index) => Items(value)[index]!.AsObject();
static void SnapshotDetached()
{
    var original = Original(); var before = original.ToJsonString();
    var copy = ArticleVerificationFormLogic.Snapshot(original)!;
    copy[0]!["future"]!["来源😀"]![1] = "only snapshot"; copy[1]!["done"] = true; copy.RemoveAt(2);
    True(before == original.ToJsonString(), "snapshot leaked nested references");
}
static void SingleSelection()
{
    var original = Original(); var copy = ArticleVerificationFormLogic.SetDone(original, 0, true);
    True(Item(copy, 0)["done"]!.GetValue<bool>() && !Item(original, 0)["done"]!.GetValue<bool>());
    Same(Item(original, 0)["future"], Item(copy, 0)["future"]);
    Same(Item(original, 1), Item(copy, 1)); Same(Item(original, 2), Item(copy, 2));
    Item(copy, 0)["future"]!["来源😀"]![0] = 99;
    True(Item(original, 0)["future"]!["来源😀"]![0]!.GetValue<int>() == 0);
}
static void UnknownStates()
{
    foreach (var unknown in new JsonNode?[] { null, JsonValue.Create("false"), JsonValue.Create(0), new JsonObject { ["future"] = false }, new JsonArray("unknown") })
    {
        var original = Original(); Item(original, 1)["done"] = unknown?.DeepClone();
        var selected = ArticleVerificationFormLogic.SetDone(original, 0, true);
        Same(Item(original, 1), Item(selected, 1));
        var clarified = ArticleVerificationFormLogic.SetDone(selected, 1, false);
        True(Item(clarified, 1)["done"]!.GetValue<bool>() == false);
        _ = ArticleVerificationFormLogic.Merge(original, clarified);
    }
}
static void MultipleSelections()
{
    var original = Original(); var first = ArticleVerificationFormLogic.SetDone(original, 0, true);
    var second = ArticleVerificationFormLogic.SetDone(first, 2, false);
    True(Item(second, 0)["done"]!.GetValue<bool>() && !Item(second, 2)["done"]!.GetValue<bool>());
    True(!Item(first, 2).ContainsKey("done")); Same(Items(second), ArticleVerificationFormLogic.Merge(original, second));
}
static void MissingFallback()
{
    var original = Original(); var values = Values(original); values.Remove("verify_items");
    Same(Items(original), ArticleVerificationFormLogic.Snapshot(original, values));
    Same(Items(original), ArticlePipelineFormLogic.Build(original, values).Body["verify_items"]);
}
static void MissingDone()
{
    var original = Original(); var untouched = ArticleVerificationFormLogic.Snapshot(original)!;
    True(!untouched[2]!.AsObject().ContainsKey("done"));
    var edited = ArticleVerificationFormLogic.SetDone(original, 2, false);
    True(!Item(edited, 2)["done"]!.GetValue<bool>()); Same(Items(edited), ArticleVerificationFormLogic.Merge(original, edited));
}
static void NullAndAbsent()
{
    var original = Original(); original["verify_items"] = null;
    True(ArticleVerificationFormLogic.Snapshot(original) is null); Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true));
    var values = Values(original); values.Remove("verify_items");
    True(ArticlePipelineFormLogic.Build(original, values).Body.ContainsKey("verify_items"));
    original.Remove("verify_items");
    True(ArticleVerificationFormLogic.Snapshot(original) is null);
    True(!ArticlePipelineFormLogic.Build(original, values).Body.ContainsKey("verify_items"));
}
static void EmptyInventory()
{
    var original = Original(); original["verify_items"] = new JsonArray();
    True(ArticleVerificationFormLogic.Snapshot(original)!.Count == 0);
    Same(new JsonArray(), ArticlePipelineFormLogic.Build(original, Values(original)).Body["verify_items"]);
    Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true));
}
static void InvalidInventories()
{
    foreach (var invalid in new JsonNode[] { JsonValue.Create("[]")!, JsonValue.Create(false)!, JsonValue.Create(1)!, new JsonObject() })
    {
        var original = Original(); original["verify_items"] = invalid; var before = original.ToJsonString();
        Reject(() => ArticleVerificationFormLogic.Snapshot(original)); Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true));
        Reject(() => ArticlePipelineFormLogic.Build(original, Values(original))); True(before == original.ToJsonString());
    }
}
static void InvalidItems()
{
    foreach (var invalid in new JsonNode?[] { null, JsonValue.Create("text"), JsonValue.Create(true), new JsonArray() })
    {
        var original = Original(); Items(original).Add(invalid?.DeepClone());
        Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true)); Reject(() => ArticlePipelineFormLogic.Build(original, Values(original)));
    }
}
static void InvalidIndices()
{
    var original = Original(); var before = original.ToJsonString();
    foreach (var index in new[] { -1, int.MinValue, 3, int.MaxValue }) Reject(() => ArticleVerificationFormLogic.SetDone(original, index, true));
    True(before == original.ToJsonString());
}
static void StructuralChanges()
{
    var original = Original();
    var appended = Values(original); Items(appended).Add(new JsonObject { ["text"] = "new" });
    var deleted = Values(original); Items(deleted).RemoveAt(1);
    var reordered = Values(original); var first = Items(reordered)[0]!.DeepClone(); Items(reordered)[0] = Items(reordered)[1]!.DeepClone(); Items(reordered)[1] = first;
    var replaced = Values(original); Item(replaced, 0)["future"]!["来源😀"]![0] = 1;
    foreach (var changed in new[] { appended, deleted, reordered, replaced }) Reject(() => ArticlePipelineFormLogic.Build(original, changed));
}
static void ErasureAndUnknown()
{
    var original = Original(); var erased = Values(original); erased["verify_items"] = null;
    Reject(() => ArticlePipelineFormLogic.Build(original, erased));
    original["verify_items"] = null; var invented = Values(original); invented["verify_items"] = new JsonArray();
    Reject(() => ArticlePipelineFormLogic.Build(original, invented)); original.Remove("verify_items");
    Reject(() => ArticlePipelineFormLogic.Build(original, invented));
}
static void InvalidStates()
{
    var original = Original();
    foreach (var invalid in new JsonNode?[] { null, JsonValue.Create("true"), JsonValue.Create(1), new JsonArray(), new JsonObject() })
    {
        var values = Values(original); Item(values, 0)["done"] = invalid?.DeepClone();
        Reject(() => ArticlePipelineFormLogic.Build(original, values));
    }
    var removed = Values(original); Item(removed, 0).Remove("done"); Reject(() => ArticlePipelineFormLogic.Build(original, removed));
}
static void BuilderMerge()
{
    var original = Original(); var values = ArticleVerificationFormLogic.SetDone(Values(original), 0, true);
    values["title"] = "同步保存的另一个标题"; values["notes"] = "仍保留用户同时修改的备注"; values["draft_pgc_id"] = "next-draft";
    var body = ArticlePipelineFormLogic.Build(original, values).Body;
    Same(Items(values), body["verify_items"]); Same(original["sample"], body["sample"]);
    Same(original["draft_ref"]!["future"], body["draft_ref"]!["future"]);
    True(body["title"]!.GetValue<string>() == "同步保存的另一个标题" && body["notes"]!.GetValue<string>() == "仍保留用户同时修改的备注");
    True(body["draft_ref"]!["pgc_id"]!.GetValue<string>() == "next-draft");
    body["verify_items"]![0]!["done"] = false; True(Item(values, 0)["done"]!.GetValue<bool>());
}
static void VersionedUpdate()
{
    var original = Original(); var values = ArticleVerificationFormLogic.SetDone(Values(original), 0, true);
    values["id"] = "untrusted-new-id"; values["version"] = 9000;
    var command = ArticlePipelineFormLogic.Build(original, values);
    True(command.Method == "PUT" && command.Path == "/api/v1/articles/00000000-0000-4000-8000-000000000091");
    True(command.Body["version"]!.GetValue<long>() == 7 && !command.Body.ContainsKey("id"));
}
static void VersionedCreate()
{
    var original = Original(); original["version"] = 0;
    var command = ArticlePipelineFormLogic.Build(original, ArticleVerificationFormLogic.SetDone(Values(original), 0, true));
    True(command.Method == "POST" && command.Path == "/api/v1/articles" && !command.Body.ContainsKey("id") && !command.Body.ContainsKey("version"));
}
static void InvalidVersions()
{
    foreach (var invalid in new JsonNode?[] { null, JsonValue.Create(-1), JsonValue.Create(1.5), JsonValue.Create("not-a-version"), JsonValue.Create(9007199254740992L) })
    {
        var original = Original(); original["version"] = invalid?.DeepClone(); Reject(() => ArticlePipelineFormLogic.Build(original, Values(original)));
    }
    var missing = Original(); missing.Remove("version"); Reject(() => ArticlePipelineFormLogic.Build(missing, Values(missing)));
}
static void InvalidUnicode()
{
    foreach (var key in new[] { false, true })
    {
        var original = Original();
        if (key) Item(original, 0)["invalid\ud800"] = true; else Item(original, 0)["text"] = "invalid\ud800";
        Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true)); Reject(() => ArticlePipelineFormLogic.Build(original, Values(original)));
    }
}
static void UnsafeAndDeep()
{
    foreach (var key in new[] { "__proto__", "constructor", "prototype" })
    {
        var original = Original(); Item(original, 0)[key] = new JsonObject(); Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true));
    }
    var deep = Original(); var cursor = Item(deep, 0); for (var i = 0; i < 11; i++) { var next = new JsonObject(); cursor["nested"] = next; cursor = next; }
    Reject(() => ArticleVerificationFormLogic.SetDone(deep, 0, true)); Reject(() => ArticlePipelineFormLogic.Build(deep, Values(deep)));
}
static void NodeBudget()
{
    var original = Original(); Item(original, 0)["future"] = new JsonArray(Enumerable.Range(0, 4100).Select(i => (JsonNode?)JsonValue.Create(i)).ToArray());
    Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true)); Reject(() => ArticlePipelineFormLogic.Build(original, Values(original)));
}
static void ChecklistByteBudget()
{
    var original = Original(); Item(original, 0)["text"] = new string('鱼', 12000);
    var selected = ArticleVerificationFormLogic.SetDone(original, 0, true);
    True(Encoding.UTF8.GetByteCount(Items(selected).ToJsonString()) > 65536, "fixture must exceed escaped representation only");
    Same(Items(selected), ArticlePipelineFormLogic.Build(original, selected).Body["verify_items"]);
    Item(original, 0)["text"] = new string('鱼', 22000); Reject(() => ArticleVerificationFormLogic.SetDone(original, 0, true));
    var edge = Original(); Item(edge, 2)["reason"] = "";
    var semantic = new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    Item(edge, 2)["reason"] = new string('a', 65536 - Encoding.UTF8.GetByteCount(Items(edge).ToJsonString(semantic)));
    True(ArticleVerificationFormLogic.Snapshot(edge)!.Count == 3, "exactly bounded baseline must remain readable");
    var before = edge.ToJsonString(); Reject(() => ArticleVerificationFormLogic.SetDone(edge, 2, false));
    True(before == edge.ToJsonString(), "adding a done key past the byte ceiling changed the baseline");
}
static void AggregateBudget()
{
    var original = Original(); Item(original, 0)["text"] = new string('a', 33000);
    original["sample"] = new JsonObject { ["large"] = new string('b', 33000) };
    var selected = ArticleVerificationFormLogic.SetDone(original, 0, true);
    Reject(() => ArticlePipelineFormLogic.Build(original, selected));
}
static void RequestBudget()
{
    var original = Original(); var selected = ArticleVerificationFormLogic.SetDone(Values(original), 0, true);
    selected["notes"] = new string('鱼', 20000); selected["summary"] = new string('鱼', 10000); selected["cover_desc"] = new string('鱼', 10000);
    original["sample"] = new JsonObject { ["evidence"] = new string('鱼', 10000) };
    selected["sample"] = original["sample"]!.DeepClone();
    Reject(() => ArticlePipelineFormLogic.Build(original, selected));
}
