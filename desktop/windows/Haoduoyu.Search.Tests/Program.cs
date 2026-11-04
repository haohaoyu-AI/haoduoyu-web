using System.Text;
using System.Text.Json;
using Haoduoyu.Core;

var tests = new (string Name, Action Run)[]
{
    ("Chinese whitespace AND searches across fields", () =>
    {
        var state = State(("/api/v1/note-entries?category=work&date=2026-11-04", Envelope("""
            {"entries":[{"id":"a","text":"处理中文跨模块检索","labels":["夜间"],"date":"2026-11-04","category":"work","version":1}]}
            """)));
        var page = Search(state, "中文\t夜间");
        Check(page.Complete && page.Items.Single().Category == "work" && page.Items[0].Date == "2026-11-04", "Chinese AND metadata");
        Check(Search(state, "中文 不存在").TotalMatches == 0, "AND became OR");
    }),
    ("Cache detail and list duplicate selects later read without synthesizing fields", () =>
    {
        var state = State(("/api/v1/memos", Envelope("""{"groups":[],"notes":[{"id":"a","title":"新标题","version":2}]}""")),
            ("/api/v1/memos/notes/a", Envelope("""{"id":"a","title":"旧标题","body":"旧正文","version":1}""")));
        state.CacheRevisions["/api/v1/memos"] = 8; state.CacheRevisions["/api/v1/memos/notes/a"] = 7;
        var hit = Search(state, "标题").Items.Single();
        Check(hit.Title == "新标题" && !hit.HasFullBody && !hit.SourceText.Contains("旧正文"), "new summary merged old body");
        Check(Search(state, "旧正文").TotalMatches == 0, "old cache duplicate indexed");
    }),
    ("Same revision prefers newer entity version and then full body", () =>
    {
        var state = State(("/api/v1/memos", Envelope("""{"groups":[],"notes":[{"id":"a","title":"共同标题","version":2}]}""")),
            ("/api/v1/memos/notes/a", Envelope("""{"id":"a","title":"共同标题","body":"共同正文","version":2}""")));
        Check(Search(state, "共同").Items.Single().HasFullBody, "same version detail was lost");
        state.Cache["/api/v1/memos"] = Envelope("""{"groups":[],"notes":[{"id":"a","title":"新版标题","version":3}]}""");
        Check(Search(state, "标题").Items.Single().Title == "新版标题", "newer server version was lost");
    }),
    ("Article summary remains a summary and reminder text remains its own body", () =>
    {
        var state = State(("/api/v1/articles/a", Envelope("""{"id":"a","title":"共同标题","summary":"共同摘要"}""")),
            ("/api/v1/work-reminders?date=2026-11-04", Envelope("""{"items":[{"id":"r","date":"2026-11-04","summary":"共同提醒"}]}""")));
        var hits = Search(state, "共同").Items;
        Check(!hits.Single(hit => hit.Kind == "article").HasFullBody && hits.Single(hit => hit.Kind == "reminder").HasFullBody, "article summary promoted to full body");
    }),
    ("Read revision wins without assuming lower version is a current full body", () =>
    {
        var state = State(("/api/v1/articles", Envelope("""[{"id":"a","title":"共同读取","version":9}]""")),
            ("/api/v1/articles/a", Envelope("""{"id":"a","title":"最新读取","version":8}""")));
        state.CacheRevisions["/api/v1/articles"] = 4; state.CacheRevisions["/api/v1/articles/a"] = 5;
        Check(Search(state, "读取").Items.Single().Title == "最新读取", "cache read ordering was ignored");
    }),
    ("Private store marker is enforced while business scope does not impersonate it", () =>
    {
        var state = State(("/api/v1/articles/a", """{"_local_scope_id":"other-account","data":{"id":"a","title":"秘密"}}"""),
            ("/api/v1/articles/b", """{"_local_scope_id":"private-store","data":{"id":"b","title":"本账户","scope_id":"business-api-hash"}}"""));
        var page = Search(state, "秘密");
        Check(page.TotalMatches == 0 && !page.Complete && page.Limitations.Contains("foreign-local-source-excluded"), "foreign cache searched");
        Check(Search(state, "本账户").Items.Single().RecordId == "b", "business scope confused with store identity");
    }),
    ("Foreign row marker and wrong typed marker are excluded", () =>
    {
        var state = State(("/api/v1/articles", Envelope("""[{"id":"a","title":"秘密","_local_scope_id":"elsewhere"}]""")),
            ("/api/v1/articles/b", """{"_local_scope_id":null,"data":{"id":"b","title":"秘密"}}"""));
        Check(Search(state, "秘密").TotalMatches == 0, "invalid nested scope marker searched");
    }),
    ("Unknown original, prepared and remote evidence remain separate with exact raw previews", () =>
    {
        const string body = "{ \"text\" : \"共同 本机版本\", \"version\": 1, \"metric\":0 }";
        const string prepared = "{\"text\":\"共同 本机版本\",\"version\":2,\"metric\":0}";
        const string remote = "{\"data\":{\"id\":\"a\",\"text\":\"共同 远端版本\",\"version\":3,\"metric\":null}}";
        var state = State();
        state.Outbox.Add(new() { Id = "unknown", Path = "/api/v1/note-entries/a", ResourceKey = "/api/v1/note-entries/a",
            BodyJson = body, PreparedBodyJson = prepared, RemoteJson = remote, Status = PendingStatus.Unknown });
        var hits = Search(state, "共同").Items;
        Check(hits.Count == 3 && hits.All(hit => hit.PendingStatus == PendingStatus.Unknown && hit.OperationId == "unknown"), "unknown evidence merged or confirmed");
        Check(hits.Single(hit => hit.Origin == "request").SourceText == body &&
            hits.Single(hit => hit.Origin == "prepared-request").SourceText == prepared &&
            hits.Single(hit => hit.Origin == "remote-evidence").SourceText == remote, "raw request/remote preview rewritten");
    }),
    ("Draft and request for same entity are retained independently", () =>
    {
        var state = State(("/api/v1/note-entries/a", Envelope("""{"id":"a","text":"共同 缓存内容","version":1}""")));
        Draft(state, "/api/v1/note-entries/a", "note", """{"text":"共同 草稿内容"}""", """{"id":"a","text":"隐藏旧基线","version":1}""");
        state.Outbox.Add(new() { Id = "op", Path = "/api/v1/note-entries/a", BodyJson = """{"text":"共同 发送内容","version":1}""", Status = PendingStatus.Conflict });
        var hits = Search(state, "共同").Items;
        Check(hits.Count == 3 && hits.Single(hit => hit.Origin == "draft").LocalDraftKey == "/api/v1/note-entries/a", "draft or request hidden by cache dedup");
        Check(Search(state, "隐藏旧基线").TotalMatches == 0, "old draft baseline presented as current values");
    }),
    ("Draft wrapper identity and business kind must match", () =>
    {
        var state = State(); Draft(state, "/api/v1/articles/new:a", "note", """{"text":"错误身份"}""");
        Draft(state, "/api/v1/articles/new:b", "article", """{"title":"错误身份"}""");
        var b = state.Drafts["/api/v1/articles/new:b"];
        state.Drafts[b.Key] = b with { Text = b.Text.Replace("new:b", "new:c", StringComparison.Ordinal) };
        Check(Search(state, "错误身份").TotalMatches == 0, "mismatched draft indexed");
    }),
    ("Label creation and retained history draft have explicit local source identities", () =>
    {
        var state = State(); var labelKey = "/local/label-create/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        var historyKey = "/local/history/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        Draft(state, labelKey, "label-create", """{"name":"保留的标签"}""");
        Draft(state, historyKey, "history", """{"text":"保留的旧稿"}""");
        var hits = Search(state, "保留").Items;
        Check(hits.Count == 2 && hits.Any(hit => hit.Kind == "label" && hit.LocalDraftKey == labelKey) &&
            hits.Any(hit => hit.Kind == "history" && hit.LocalDraftKey == historyKey), "local business draft missing");
    }),
    ("Legacy work and life on same day remain distinct without changing raw source", () =>
    {
        const string row = "{ \"date\": \"2026-11-04\", \"text\": \"共同记录\", \"version\":1 }";
        var state = State(("/api/v1/daily-notes?date=2026-11-04&category=life", Envelope(row)),
            ("/api/v1/daily-notes?date=2026-11-04&category=work", Envelope(row)));
        var hits = Search(state, "共同").Items;
        Check(hits.Count == 2 && hits.Select(hit => hit.RecordId).Distinct().Count() == 2 && hits.All(hit => hit.SourceText == row), "legacy categories merged or raw record changed");
        Check(hits.All(hit => hit.Date == "2026-11-04" && hit.HasFullBody), "legacy date/body provenance lost");
    }),
    ("Legacy restore request retains its dated work identity", () =>
    {
        var state = State(); state.Outbox.Add(new() { Path = "/api/v1/daily-notes/2026-11-04/restore?category=work", BodyJson = """{"version":2,"reason":"恢复工作日页"}""", Status = PendingStatus.Unknown });
        var hit = Search(state, "恢复工作日页").Items.Single();
        Check(hit.RecordId == "work:2026-11-04" && hit.Date == "2026-11-04" && hit.Category == "work", "restore request lost date");
    }),
    ("Cached labels and archived labels are searchable without invented body", () =>
    {
        var state = State(("/api/v1/note-entries/labels", Envelope("""{"labels":[{"name":"中文标签"}],"archived_labels":[{"name":"归档标签","archived_at":"2026-11-04T00:00:00Z"}]}""")));
        var hits = Search(state, "标签").Items;
        Check(hits.Count == 2 && hits.All(hit => hit.Kind == "label" && !hit.HasFullBody), "labels missing or invented full body");
    }),
    ("Zero and null remain distinct in metrics and raw previews", () =>
    {
        var state = State(("/api/v1/review/snapshots", Envelope("""{"items":[{"id":"zero","title":"观测","metrics":{"reads":0}},{"id":"missing","title":"观测","metrics":{"reads":null}}]}""")));
        var zero = Search(state, "观测 0").Items.Single(); var missing = Search(state, "观测 null").Items.Single();
        Check(zero.RecordId == "zero" && missing.RecordId == "missing" && zero.SourceText.Contains(":0") && missing.SourceText.Contains(":null"), "null fabricated as zero");
    }),
    ("Only explicit business routes are searched", () =>
    {
        var state = State(("/api/v1/auth/me", Envelope("""{"id":"user","username":"控制密钥"}""")),
            ("/api/v1/workbench-snapshot/index?version=2", Envelope("""{"id":"index","title":"控制密钥"}""")),
            ("/api/v1/config", Envelope("""{"id":"config","title":"控制密钥"}""")),
            ("/api/v1/articles/a/unknown-action", Envelope("""{"id":"a","title":"控制密钥"}""")),
            ("/api/v1/note-entries/month?month=2026-11", Envelope("""{"days":[{"text":"控制密钥"}]}""")));
        state.Outbox.Add(new() { Path = "/api/v1/auth/login", BodyJson = """{"username":"控制密钥"}""" });
        Check(Search(state, "控制密钥").TotalMatches == 0, "auth/config/index/summary route searched");
    }),
    ("Control credentials are not included in searchable business text", () =>
    {
        var state = State(("/api/v1/articles/a", Envelope("""{"id":"a","title":"普通标题","csrfToken":"控制密钥","token":"控制密钥","password":"控制密钥","nested":{"secret":"控制密钥"}}""")));
        Check(Search(state, "控制密钥").TotalMatches == 0, "credential field searched");
        var page = Search(state, "普通标题");
        Check(page.Items.Count == 0 && page.Limitations.Contains("sensitive-local-source-excluded"), "credential leaked through original preview");
    }),
    ("Hidden draft baseline credentials cannot leak through whole original preview", () =>
    {
        var state = State(); Draft(state, "/api/v1/articles/new:a", "article", """{"title":"草稿标题"}""", """{"id":"a","csrfToken":"隐藏密钥"}""");
        var page = Search(state, "草稿标题");
        Check(page.Items.Count == 0 && !page.Complete && page.Limitations.Contains("sensitive-local-source-excluded"), "draft raw preview leaked hidden baseline secret");
    }),
    ("Empty query returns no fabricated all-record search", () =>
    {
        var page = Search(State(("/api/v1/articles/a", Envelope("""{"id":"a","title":"内容"}"""))), " \n\t ");
        Check(page.Complete && page.Items.Count == 0 && page.ScannedRecords == 0, "empty query scanned all data");
    }),
    ("Unicode combining accents are normalized and case is insensitive", () =>
    {
        var state = State(("/api/v1/articles/a", Envelope("""{"id":"a","title":"Cafe\u0301 ПРИВЕТ 中文"}""")));
        Check(Search(state, "CAFÉ привет").Items.Count == 1, "Unicode normalization/case matching");
    }),
    ("Emoji snippets and titles never contain broken surrogate pairs", () =>
    {
        var source = new string('前', 240) + "👩‍💻关键" + string.Concat(Enumerable.Repeat("😀", 220));
        var state = State(("/api/v1/note-entries/a", Envelope(JsonSerializer.Serialize(new { id = "a", text = source }))));
        var hit = Search(state, "关键").Items.Single();
        _ = new UTF8Encoding(false, true).GetByteCount(hit.Title); _ = new UTF8Encoding(false, true).GetByteCount(hit.Snippet);
        using var original = JsonDocument.Parse(hit.SourceText);
        Check(hit.Snippet.Contains("关键") && original.RootElement.GetProperty("text").GetString() == source, "snippet omitted match or original");
    }),
    ("Query accepts exactly 256 runes and rejects 257 or invalid UTF16", () =>
    {
        _ = Search(State(), string.Concat(Enumerable.Repeat("😀", 256)));
        Throws<ArgumentException>(() => Search(State(), string.Concat(Enumerable.Repeat("😀", 257))));
        Throws<ArgumentException>(() => Search(State(), "\ud800"));
    }),
    ("Paging is bounded and stable across dictionary insertion order", () =>
    {
        var a = State(("/api/v1/articles/b", Envelope("""{"id":"b","title":"共同"}""")), ("/api/v1/articles/a", Envelope("""{"id":"a","title":"共同"}""")));
        var b = State(a.Cache.Reverse().Select(pair => (pair.Key, pair.Value)).ToArray());
        Check(Search(a, "共同", 0, 1).Items.Single().RecordId == "a" && Search(b, "共同", 1, 1).Items.Single().RecordId == "b", "unstable page order");
        Check(Search(a, "共同", 0, 1).HasMore && !Search(a, "共同", 2, 1).HasMore, "paging has_more");
        Throws<ArgumentOutOfRangeException>(() => Search(a, "共同", -1));
        Throws<ArgumentOutOfRangeException>(() => Search(a, "共同", 10_001));
        Throws<ArgumentOutOfRangeException>(() => Search(a, "共同", 0, 101));
    }),
    ("Cancellation is observable and never represented as a complete empty page", () =>
    {
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        Throws<OperationCanceledException>(() => WorkspaceSearch.Search(State(), "内容", cancellationToken: cancellation.Token));
    }),
    ("Record budget reports the provisional scanned match count", () =>
    {
        var state = State(("/api/v1/articles", Envelope("""[{"id":"a","title":"共同"},{"id":"b","title":"共同"}]""")));
        var page = WorkspaceSearch.Search(state, "共同", limits: new() { MaxRecords = 1 });
        Check(!page.Complete && page.TotalMatches == 1 && page.Limitations.Contains("record-budget"), "record budget silently full");
    }),
    ("Partial count is provisional when an unscanned newer duplicate may remove a match", () =>
    {
        var state = State(("/api/v1/articles", Envelope("""[{"id":"a","title":"旧匹配"}]""")),
            ("/api/v1/articles/a", Envelope("""{"id":"a","title":"新内容"}""")));
        state.CacheRevisions["/api/v1/articles/a"] = 2;
        var partial = WorkspaceSearch.Search(state, "旧匹配", limits: new() { MaxRecords = 1 });
        Check(!partial.Complete && partial.TotalMatches == 1 && Search(state, "旧匹配").TotalMatches == 0, "partial revision semantics changed");
    }),
    ("Source byte budget reports partial without sampling oversized source", () =>
    {
        var state = State(("/api/v1/articles/a", Envelope("""{"id":"a","title":"共同"}""")));
        var page = WorkspaceSearch.Search(state, "共同", limits: new() { MaxSourceBytes = 1 });
        Check(!page.Complete && page.TotalMatches == 0 && page.Limitations.Contains("source-byte-budget"), "source sampled without notice");
    }),
    ("Match budget explicitly reports unenumerated results", () =>
    {
        var state = State(("/api/v1/articles", Envelope("""[{"id":"a","title":"共同"},{"id":"b","title":"共同"}]""")));
        var page = WorkspaceSearch.Search(state, "共同", limits: new() { MaxMatches = 1 });
        Check(!page.Complete && page.TotalMatches == 1 && page.HasMore && page.Limitations.Contains("match-budget"), "match budget silently full");
    }),
    ("Dense nested value budget stops further records and reports partial", () =>
    {
        var metrics = "[" + string.Join(',', Enumerable.Repeat("0", 250_001)) + "]";
        var state = State(("/api/v1/review/snapshots", Envelope("{\"items\":[{\"id\":\"dense\",\"title\":\"共同\",\"metrics\":" + metrics + "},{\"id\":\"later\",\"title\":\"共同\"}]}")));
        var page = Search(state, "共同");
        Check(!page.Complete && page.Limitations.Contains("text-value-budget") && page.ScannedRecords == 1 && page.Items.All(hit => hit.RecordId != "later"), "dense-value scan continued or hid budget");
    }),
    ("Malformed eligible source marks partial while independent good source remains searchable", () =>
    {
        var state = State(("/api/v1/articles/a", "{"), ("/api/v1/articles/b", Envelope("""{"id":"b","title":"有效内容","version":"legacy-version"}""")));
        var page = Search(state, "有效内容");
        Check(page.Items.Single().RecordId == "b" && !page.Complete && page.Limitations.Contains("invalid-local-source"), "malformed source prevented valid search or concealed loss");
    }),
    ("Malformed list shape is partial instead of claiming a complete empty list", () =>
    {
        var state = State(("/api/v1/note-entries?date=2026-11-04&category=work", Envelope("""{"entries":null}""")),
            ("/api/v1/memos", Envelope("""{"groups":[],"notes":{}}""")),
            ("/api/v1/note-entries/labels", Envelope("""{"labels":[],"archived_labels":false}""")));
        var page = Search(state, "内容");
        Check(!page.Complete && page.Limitations.Contains("invalid-local-source"), "invalid collection looked complete");
    }),
    ("Escaped unpaired surrogate in one record does not block independent good records", () =>
    {
        var state = State(("/api/v1/articles", Envelope("""[{"id":"bad","title":"\ud800"},{"id":"good","title":"有效内容"}]""")));
        var page = Search(state, "有效内容");
        Check(page.Items.Single().RecordId == "good" && !page.Complete && page.Limitations.Contains("invalid-local-source"), "invalid Unicode blocked valid records");
    }),
    ("Confirmed receipt is evidence with receipt body completeness, never an invented entity", () =>
    {
        var state = State(); state.Outbox.Add(new() { Id = "receipt", Path = "/api/v1/note-entries/a", ResourceKey = "/api/v1/note-entries/a",
            BodyJson = """{"text":"正文","version":1}""", RemoteJson = """{"data":{"id":"a","version":2,"content_hash":"receiptmarker"}}""", Status = PendingStatus.Confirmed });
        var hit = Search(state, "receiptmarker").Items.Single();
        Check(hit.Origin == "remote-evidence" && !hit.HasFullBody && hit.PendingStatus == PendingStatus.Confirmed && !hit.SourceText.Contains("正文"), "receipt merged with request body");
    }),
    ("Input containers, JSON strings and statuses are never mutated", () =>
    {
        var state = State(("/api/v1/note-entries/a", Envelope("""{"id":"a","text":"共同缓存","version":1}""")));
        Draft(state, "/api/v1/note-entries/a", "note", """{"text":"共同草稿"}""");
        state.Outbox.Add(new() { Id = "op", Path = "/api/v1/note-entries/a", BodyJson = """{"text":"共同请求"}""", Status = PendingStatus.Unknown });
        var before = JsonSerializer.Serialize(state); var cache = state.Cache; var drafts = state.Drafts; var operations = state.Outbox;
        _ = Search(state, "共同");
        Check(JsonSerializer.Serialize(state) == before && ReferenceEquals(cache, state.Cache) && ReferenceEquals(drafts, state.Drafts) && ReferenceEquals(operations, state.Outbox), "search changed workspace");
    }),
    ("Missing scope and attempts to expand hard limits are rejected", () =>
    {
        Throws<ArgumentException>(() => Search(new WorkspaceState(), "内容"));
        Throws<ArgumentOutOfRangeException>(() => WorkspaceSearch.Search(State(), "内容", limits: new() { MaxRecords = 50_001 }));
    })
};

var failed = 0;
foreach (var (name, run) in tests)
{
    try { run(); Console.WriteLine("PASS " + name); }
    catch (Exception error) { failed++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
}
Console.WriteLine($"{tests.Length - failed}/{tests.Length} search checks passed");
return failed == 0 ? 0 : 1;

static WorkspaceState State(params (string Path, string Json)[] cache) => new()
{ ScopeId = "private-store", Cache = cache.ToDictionary(pair => pair.Path, pair => pair.Json, StringComparer.Ordinal) };
static string Envelope(string row) => "{\"data\":" + row + "}";
static WorkspaceSearchPage Search(WorkspaceState state, string text, int offset = 0, int pageSize = 50) => WorkspaceSearch.Search(state, text, offset, pageSize);
static void Draft(WorkspaceState state, string key, string kind, string values, string original = "{}")
{
    var payload = "{\"kind\":" + JsonSerializer.Serialize(kind) + ",\"key\":" + JsonSerializer.Serialize(key) + ",\"values\":" + values + ",\"original\":" + original + "}";
    state.Drafts[key] = new() { Key = key, Text = payload };
}
static void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
static void Throws<T>(Action action) where T : Exception
{
    try { action(); } catch (T) { return; }
    throw new InvalidOperationException("Expected " + typeof(T).Name);
}
