using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var cases = new (string Name, Action Run)[]
{
    ("query round trip keeps literal Unicode and independent filters", QueryRoundTrip),
    ("query rejects invalid lifecycle, duplicate filters and unsafe ranges", InvalidQueries),
    ("default article view is published and never an invented all-status query", PublishedDefault),
    ("search uses all four raw fields and treats wildcard characters literally", LiteralSearch),
    ("shared scalar filters select the complete set before paging", ScalarFilters),
    ("day ranges use Beijing boundaries and timestamp upper bounds stay inclusive", DateBoundaries),
    ("nested metric sorting preserves real zero and places missing values last", MetricSort),
    ("publication tie ordering and duration follow raw publication facts", PublicationAndDuration),
    ("warning recomputation counts Unicode code points and current raw pipeline values", Warnings),
    ("pending verification remains three-state and recomputes after local writes", Verification),
    ("topics and metrics status derive from current metadata instead of stale labels", DerivedFacts),
    ("pagination supports two hundred rows and reports filtered versus status totals", GlobalPagination),
    ("pending status changes move between lifecycle views without rewriting requests", PendingLifecycle),
    ("pending account changes reassociate platform and name without retaining old facts", PendingAccount),
    ("ordinary partial pages never become complete global inventory or server totals", PartialPage),
    ("old unmarked canonical arrays remain partial despite usable known rows", UnmarkedCanonical),
    ("malformed complete markers never supply deletion authority", MalformedCanonical),
    ("soft deletion and unknown requests preserve honest local provenance", DeletionAndUnknown),
    ("foreign partition caches cannot leak through ledger queries", ScopeIsolation),
    ("querying and changing returned objects never mutate workspace state", Purity)
};
var failures = 0;
foreach (var item in cases)
{
    try { item.Run(); Console.WriteLine("PASS " + item.Name); }
    catch (Exception error) { failures++; Console.WriteLine("FAIL " + item.Name + ": " + error.Message); }
}
Console.WriteLine($"Ledger model: {cases.Length - failures}/{cases.Length} checks passed; synthetic detached rows, no sockets or real user data.");
return failures == 0 ? 0 : 1;

static void True(bool condition, string message = "assertion failed")
{ if (!condition) throw new InvalidOperationException(message); }
static void Equal<T>(T expected, T actual)
{ if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new InvalidOperationException($"expected {expected}, got {actual}"); }
static void Reject(string path)
{
    try { ArticleLedgerQuery.Parse(path); }
    catch (Exception error) when (error is ArgumentException or InvalidDataException) { return; }
    throw new InvalidOperationException("query was accepted: " + path);
}
static string Id(int number) => "00000000-0000-4000-8000-" + number.ToString("D12", System.Globalization.CultureInfo.InvariantCulture);
static JsonObject Article(int number, string? status = "published", string? published = "2026-11-04T01:00:00.000Z") => new()
{
    ["id"] = Id(number), ["account_id"] = "account-a", ["account_name"] = "好多鱼", ["platform"] = "toutiao", ["version"] = 7,
    ["status"] = status, ["title"] = "合成文章 " + number, ["url"] = status == "published" ? "https://example.invalid/synthetic/" + number : null,
    ["summary"] = "原始合成摘要", ["notes"] = "原始合成记录", ["published_at"] = published, ["started_at"] = "2026-11-04T00:59:00.000Z",
    ["production_mode"] = "manual", ["slot"] = "tt1", ["writer"] = "dedao", ["run_date"] = "2026-11-04", ["series_no"] = null,
    ["sample"] = new JsonObject { ["original"] = "保留😀" }, ["verify_items"] = new JsonArray(), ["draft_ref"] = new JsonObject { ["pgc_id"] = "synthetic-draft" },
    ["char_count"] = 2100, ["subheading_count"] = 6, ["image_count"] = 25,
    ["latest_metrics"] = status == "published" ? new JsonObject { ["reads"] = 10, ["impressions"] = 20, ["likes"] = 2, ["comments"] = 1, ["favorites"] = 0, ["shares"] = 0, ["approvals"] = 0, ["reading_users"] = 0 } : null,
    ["latest_as_of"] = status == "published" ? "2026-11-04T02:00:00.000Z" : null, ["latest_collected_at"] = status == "published" ? "2026-11-04T02:01:00.000Z" : null,
    // Intentionally stale derived values prove the view recomputes current facts.
    ["warnings"] = new JsonArray("STALE_DERIVED_WARNING"), ["has_pending_verify"] = true, ["verify_state"] = "pending",
    ["topic"] = "unknown", ["topic_source"] = "unknown", ["date_status"] = "unverified", ["snapshot_status"] = "not_collected",
    ["missing_metrics"] = new JsonArray("reads", "likes", "comments"), ["duration_seconds"] = 999999
};
static WorkspaceState State(params JsonObject[] rows)
{
    var state = new WorkspaceState { ScopeId = "synthetic-ledger-partition", LocalRevision = 9 };
    state.Cache["/api/v1/articles"] = new JsonObject
    {
        ["data"] = new JsonArray(rows.Select(row => (JsonNode?)row.DeepClone()).ToArray()), ["_local_complete"] = true,
        ["_local_scope_id"] = state.ScopeId, ["meta"] = new JsonObject { ["total"] = rows.Length, ["has_more"] = false }
    }.ToJsonString();
    state.CacheRevisions["/api/v1/articles"] = 5;
    state.Cache["/api/v1/accounts"] = new JsonObject { ["data"] = new JsonArray(
        new JsonObject { ["id"] = "account-a", ["name"] = "好多鱼", ["platform"] = "toutiao" },
        new JsonObject { ["id"] = "account-b", ["name"] = "小鱼儿真保鲜", ["platform"] = "wechat" }) }.ToJsonString();
    state.CacheRevisions["/api/v1/accounts"] = 5;
    return state;
}
static JsonObject Project(WorkspaceState state, string query = "")
{
    var path = "/api/v1/articles" + (query.Length == 0 ? "" : "?" + query);
    return JsonNode.Parse(WorkspaceProjection.Project(path, state.Cache.GetValueOrDefault(path), state) ?? throw new InvalidOperationException("missing projection"))!.AsObject();
}
static JsonObject[] Rows(JsonObject envelope) => envelope["data"]!.AsArray().Select(row => row!.AsObject()).ToArray();
static string Ids(JsonObject envelope) => string.Join(',', Rows(envelope).Select(row => row["id"]!.GetValue<string>()));
static JsonObject Ledger(JsonObject envelope) => envelope["_local_ledger"]!.AsObject();
static long Number(JsonNode? value) => value!.GetValue<long>();
static PendingOperation Op(int number, JsonObject body, PendingStatus status = PendingStatus.Queued, string method = "PUT") => new()
{
    Id = "synthetic-operation-" + number, ResourceKey = "/api/v1/articles/" + Id(number), Path = "/api/v1/articles/" + Id(number),
    Method = method, BodyJson = body.ToJsonString(), Status = status,
    CreatedAt = DateTimeOffset.Parse("2026-11-04T03:00:00Z", System.Globalization.CultureInfo.InvariantCulture)
};

static void QueryRoundTrip()
{
    var query = ArticleLedgerQuery.Parse(new Dictionary<string, string>
    {
        ["status"] = "draft_saved", ["q"] = "中文 😀 %_!\\", ["account_id"] = "account-a", ["platform"] = "toutiao", ["mode"] = "mixed",
        ["slot"] = "tt1", ["writer"] = "human", ["has_warnings"] = "true", ["has_pending_verify"] = "false",
        ["series_no_min"] = "1", ["series_no_max"] = "20", ["sort"] = "reads", ["order"] = "asc", ["page"] = "2", ["page_size"] = "200"
    });
    var path = query.ToPath();
    Equal(path, ArticleLedgerQuery.Parse(path).ToPath());
    True(Uri.UnescapeDataString(path.Replace("+", " ", StringComparison.Ordinal)).Contains("中文 😀 %_!\\", StringComparison.Ordinal));
    True(path.Contains("status=draft_saved", StringComparison.Ordinal) && path.Contains("page_size=200", StringComparison.Ordinal));
}
static void InvalidQueries()
{
    foreach (var query in new[] { "status=all", "status=unknown", "status=draft", "status=published&status=failed", "has_pending_verify=1", "series_no_min=3&series_no_max=2", "page_size=201", "from=2026-02-30", "sort=title" })
        Reject("/api/v1/articles?" + query);
}
static void PublishedDefault()
{
    var state = State(Article(1), Article(2, "drafting", null), Article(3, null, null), Article(4, "future_state", null));
    var view = Project(state);
    Equal(Id(1), Ids(view)); True(Ledger(view)["baseline_complete"]!.GetValue<bool>()); Equal(1L, Number(view["meta"]!["total"]));
    Equal(Id(2), Ids(Project(state, "status=drafting")));
}
static void LiteralSearch()
{
    var rows = Enumerable.Range(1, 6).Select(n => Article(n)).ToArray();
    rows[0]["title"] = "字面 %_!\\ 😀"; rows[1]["url"] = "https://example.invalid/needle";
    rows[2]["summary"] = "summary NEEDLE"; rows[3]["notes"] = "notes needle"; rows[4]["title"] = "ÁBC"; rows[5]["title"] = "ábc";
    var state = State(rows);
    Equal(Id(1), Ids(Project(state, "q=" + Uri.EscapeDataString("%_!\\ 😀"))));
    Equal(string.Join(',', new[] { Id(2), Id(3), Id(4) }), Ids(Project(state, "q=needle")));
    Equal(Id(6), Ids(Project(state, "q=" + Uri.EscapeDataString("ábc"))));
}
static void ScalarFilters()
{
    var target = Article(1); target["production_mode"] = "mixed"; target["writer"] = "human"; target["series_no"] = 12;
    var other = Article(2); other["account_id"] = "account-b"; other["account_name"] = "小鱼儿真保鲜"; other["platform"] = "wechat";
    var state = State(target, other, Article(3));
    Equal(Id(1), Ids(Project(state, "account_id=account-a&platform=toutiao&mode=mixed&slot=tt1&writer=human&series_no_min=10&series_no_max=12")));
    Equal("", Ids(Project(state, "series_no_min=13")));
}
static void DateBoundaries()
{
    var state = State(Article(1, published: "2026-11-03T15:59:59.999Z"), Article(2, published: "2026-11-03T16:00:00.000Z"),
        Article(3, published: "2026-11-04T15:59:59.999Z"), Article(4, published: "2026-11-04T16:00:00.000Z"));
    Equal(string.Join(',', new[] { Id(3), Id(2) }), Ids(Project(state, "from=2026-11-04&to=2026-11-04")));
    Equal(Id(2), Ids(Project(state, "from=2026-11-03T16%3A00%3A00.000Z&to=2026-11-03T16%3A00%3A00.000Z")));
}
static void MetricSort()
{
    var one = Article(1); one["latest_metrics"]!["reads"] = 2;
    var two = Article(2); two["latest_metrics"]!["reads"] = 0;
    var three = Article(3); three["latest_metrics"] = null;
    var state = State(one, two, three);
    Equal(string.Join(',', new[] { Id(2), Id(1), Id(3) }), Ids(Project(state, "sort=reads&order=asc")));
    Equal(string.Join(',', new[] { Id(1), Id(2), Id(3) }), Ids(Project(state, "sort=reads&order=desc")));
    Equal(Id(2), Ids(Project(state, "data_status=zero_reads")));
}
static void PublicationAndDuration()
{
    var one = Article(1, published: "2026-11-04T01:01:00.000Z"); one["started_at"] = "2026-11-04T01:00:00.000Z";
    var two = Article(2, published: "2026-11-04T01:02:00.000Z"); two["started_at"] = "2026-11-04T01:00:00.000Z";
    var three = Article(3, published: "2026-11-04T01:02:00.000Z"); three["started_at"] = "2026-11-04T01:00:00.000Z";
    var state = State(one, two, three);
    Equal(string.Join(',', new[] { Id(2), Id(3), Id(1) }), Ids(Project(state, "sort=likes&order=asc")));
    Equal(string.Join(',', new[] { Id(1), Id(2), Id(3) }), Ids(Project(state, "sort=duration&order=asc")));
    Equal(60L, Number(Rows(Project(state, "sort=duration&order=asc"))[0]["duration_seconds"]));
}
static void Warnings()
{
    var one = Article(1); one["title"] = string.Concat(Enumerable.Repeat("😀", 30));
    var two = Article(2); two["title"] = string.Concat(Enumerable.Repeat("😀", 31));
    var three = Article(3, "draft_saved", null); three["draft_ref"] = null;
    var state = State(one, two, three);
    Equal(Id(2), Ids(Project(state, "has_warnings=true")));
    Equal(Id(1), Ids(Project(state, "has_warnings=false")));
    Equal("DRAFT_CREDENTIAL_MISSING", Rows(Project(state, "status=draft_saved&has_warnings=true")).Single()["warnings"]![0]!.GetValue<string>());
    state.Outbox.Add(Op(1, new JsonObject { ["version"] = 7, ["char_count"] = 1800 }));
    Equal(string.Join(',', new[] { Id(1), Id(2) }), Ids(Project(state, "has_warnings=true")));
}
static void Verification()
{
    var one = Article(1); one["verify_items"] = null;
    var two = Article(2); two["verify_items"] = new JsonArray(new JsonObject { ["text"] = "未定" });
    var three = Article(3); three["verify_items"] = new JsonArray();
    var four = Article(4); four["verify_items"] = new JsonArray(new JsonObject { ["text"] = "待核", ["done"] = false });
    var state = State(one, two, three, four);
    Equal(Id(3), Ids(Project(state, "has_pending_verify=false"))); Equal(Id(4), Ids(Project(state, "has_pending_verify=true")));
    state.Outbox.Add(Op(3, new JsonObject { ["version"] = 7, ["verify_items"] = new JsonArray(new JsonObject { ["text"] = "新增待核", ["done"] = false }) }, PendingStatus.Unknown));
    Equal(string.Join(',', new[] { Id(3), Id(4) }), Ids(Project(state, "has_pending_verify=true")));
    Equal("Unknown", Rows(Project(state, "has_pending_verify=true")).First()["_local_status"]!.GetValue<string>());
}
static void DerivedFacts()
{
    var one = Article(1); one["latest_metrics"] = null;
    var two = Article(2); two["notes"] = "发布日期待确认"; two["latest_metrics"]!.AsObject().Remove("likes");
    var three = Article(3); three["account_id"] = "account-b"; three["platform"] = "wechat"; three["account_name"] = "小鱼儿真保鲜";
    var state = State(one, two, three);
    Equal(Id(3), Ids(Project(state, "topic=insurance"))); Equal(Id(1), Ids(Project(state, "data_status=no_snapshot")));
    Equal(string.Join(',', new[] { Id(1), Id(2) }), Ids(Project(state, "data_status=missing_likes")));
    Equal(Id(2), Ids(Project(state, "data_status=date_unverified")));
    state.Outbox.Add(Op(2, new JsonObject { ["version"] = 7, ["notes"] = "原始记录已核实" }));
    Equal("", Ids(Project(state, "data_status=date_unverified")));
}
static void GlobalPagination()
{
    var rows = Enumerable.Range(1, 205).Select(n => Article(n)).Append(Article(1000, "drafting", null)).ToArray();
    var state = State(rows); var first = Project(state, "page=1&page_size=200"); var second = Project(state, "page=2&page_size=200");
    Equal(200, Rows(first).Length); Equal(5, Rows(second).Length); Equal(205L, Number(second["meta"]!["total"]));
    Equal(205L, Number(second["meta"]!["unfiltered_total"])); True(!second["meta"]!["has_more"]!.GetValue<bool>());
    var query = Project(state, "q=" + Uri.EscapeDataString("合成文章 20") + "&page=2&page_size=2");
    Equal(7L, Number(query["meta"]!["total"])); Equal(205L, Number(query["meta"]!["unfiltered_total"])); Equal(2, Rows(query).Length);
}
static void PendingLifecycle()
{
    var withoutSnapshots = Article(1); withoutSnapshots["latest_metrics"] = null; withoutSnapshots["latest_as_of"] = null; withoutSnapshots["latest_collected_at"] = null;
    var state = State(withoutSnapshots, Article(2, "drafting", null));
    state.Outbox.Add(Op(1, new JsonObject { ["version"] = 7, ["status"] = "drafting", ["url"] = null, ["published_at"] = null }, PendingStatus.Unknown));
    state.Outbox.Add(Op(2, new JsonObject { ["version"] = 7, ["status"] = "published", ["url"] = "https://example.invalid/new", ["published_at"] = "2026-11-04T16:00:00.000Z" }));
    Equal(Id(2), Ids(Project(state))); Equal(Id(1), Ids(Project(state, "status=drafting")));
    Equal(Id(2), Ids(Project(state, "from=2026-11-05&to=2026-11-05")));
    Equal("Unknown", Rows(Project(state, "status=drafting")).Single()["_local_status"]!.GetValue<string>());
}
static void PendingAccount()
{
    var state = State(Article(1)); state.Outbox.Add(Op(1, new JsonObject { ["version"] = 7, ["account_id"] = "account-b" }));
    var changed = Rows(Project(state, "platform=wechat&topic=insurance")).Single();
    Equal("小鱼儿真保鲜", changed["account_name"]!.GetValue<string>()); Equal("", Ids(Project(state, "platform=toutiao")));
    state.Outbox[0] = state.Outbox[0] with { BodyJson = new JsonObject { ["version"] = 7, ["account_id"] = "account-missing" }.ToJsonString() };
    var unknown = Project(state); var row = Rows(unknown).Single();
    True(row["platform"]?.ToString() != "toutiao" && row["account_name"]?.ToString() != "好多鱼");
    True(!Ledger(unknown)["complete"]!.GetValue<bool>() && Number(Ledger(unknown)["unknown_count"]) > 0);
}
static void PartialPage()
{
    const string query = "status=published&page=2&page_size=20"; const string path = "/api/v1/articles?" + query;
    var state = new WorkspaceState { ScopeId = "synthetic-ledger-partition" };
    state.Cache[path] = new JsonObject { ["data"] = new JsonArray(Enumerable.Range(1, 20).Select(n => (JsonNode?)Article(n)).ToArray()), ["meta"] = new JsonObject
    { ["total"] = 56, ["unfiltered_total"] = 70, ["page"] = 2, ["page_size"] = 20, ["offset"] = 20, ["has_more"] = true } }.ToJsonString();
    var view = Project(state, query);
    True(!Ledger(view)["baseline_complete"]!.GetValue<bool>() && !Ledger(view)["complete"]!.GetValue<bool>());
    True(view["meta"]!["total"] == null && view["meta"]!["unfiltered_total"] == null);
    Equal(20L, Number(Ledger(view)["known_total"]));
}
static void UnmarkedCanonical()
{
    var state = State(Article(1), Article(2)); var root = JsonNode.Parse(state.Cache["/api/v1/articles"])!.AsObject(); root.Remove("_local_complete");
    state.Cache["/api/v1/articles"] = root.ToJsonString();
    var view = Project(state, "page=1&page_size=20"); Equal(2, Rows(view).Length);
    True(!Ledger(view)["baseline_complete"]!.GetValue<bool>() && view["meta"]!["total"] == null);
}
static void MalformedCanonical()
{
    var state = State(Article(1)); var root = JsonNode.Parse(state.Cache["/api/v1/articles"])!.AsObject(); root["data"]!.AsArray().Add(Article(1));
    state.Cache["/api/v1/articles"] = root.ToJsonString();
    var view = Project(state); True(!Ledger(view)["baseline_complete"]!.GetValue<bool>() && view["meta"]!["total"] == null);
}
static void DeletionAndUnknown()
{
    var state = State(Article(1), Article(2)); state.Outbox.Add(Op(1, new JsonObject { ["version"] = 7 }, PendingStatus.Unknown, "DELETE"));
    var local = new JsonObject { ["account_id"] = "account-a", ["title"] = "尚未确认的合成新增", ["version"] = 0,
        ["status"] = "published", ["url"] = "https://example.invalid/pending", ["published_at"] = "2026-11-04T01:00:00.000Z",
        ["started_at"] = null, ["production_mode"] = "unknown", ["summary"] = null, ["notes"] = null };
    state.Outbox.Add(Op(3, local, PendingStatus.Unknown) with { Path = "/api/v1/articles", Method = "POST" });
    var view = Project(state); Equal(string.Join(',', new[] { Id(2), Id(3) }), Ids(view));
    var added = Rows(view).Single(row => row["id"]!.GetValue<string>() == Id(3));
    Equal("Unknown", added["_local_status"]!.GetValue<string>()); True(added["_local_request"] != null);
    Equal("", Ids(Project(state, "data_status=no_snapshot")));
    Equal(Id(2), Ids(Project(state, "has_warnings=false")));
}
static void ScopeIsolation()
{
    var state = State(Article(1)); var root = JsonNode.Parse(state.Cache["/api/v1/articles"])!.AsObject(); root["_local_scope_id"] = "other-partition";
    state.Cache["/api/v1/articles"] = root.ToJsonString();
    try { Project(state); } catch (InvalidDataException) { return; }
    throw new InvalidOperationException("foreign scope was projected");
}
static void Purity()
{
    var state = State(Article(1)); state.Outbox.Add(Op(1, new JsonObject { ["version"] = 7, ["notes"] = "本机尚未确认😀" }, PendingStatus.Unknown));
    state.Drafts["unchanged"] = new() { Key = "unchanged", Text = "未提交的原始草稿" };
    var before = JsonSerializer.Serialize(state); var view = Project(state, "q=" + Uri.EscapeDataString("尚未确认😀"));
    Rows(view).Single()["notes"] = "修改返回对象"; Ledger(view)["complete"] = false;
    Equal(before, JsonSerializer.Serialize(state));
    Equal("本机尚未确认😀", Rows(Project(state)).Single()["notes"]!.GetValue<string>());
}
