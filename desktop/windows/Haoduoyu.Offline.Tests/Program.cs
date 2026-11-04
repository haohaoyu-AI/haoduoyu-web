using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Api;
using Haoduoyu.Core;

var checks = 0;
var source = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "workbench-manifest-c30a8a9.json")))!.AsObject();
var initialIndex = source["initial"]!.AsObject();
var changedIndex = source["changed"]!.AsObject();
var scope = initialIndex["data"]!["scope_id"]!.GetValue<string>();
var at = DateTimeOffset.Parse("2026-11-04T16:42:48.934Z", System.Globalization.CultureInfo.InvariantCulture);

void Check(bool condition, string message)
{ if (!condition) throw new InvalidOperationException(message); checks++; }
async Task Reject(Func<Task> action, string message, int? status = null)
{
    try { await action(); }
    catch (ApiCallException error) when (status is null || error.StatusCode == status) { checks++; return; }
    catch (Exception error) when (status is null && error is InvalidDataException or OperationCanceledException or ArgumentOutOfRangeException) { checks++; return; }
    throw new InvalidOperationException(message);
}
JsonObject Parsed(OfflineDownloadResult result, string path) => JsonNode.Parse(result.CacheEntries[path])!.AsObject();
ApiResult Edit(ApiResult result, Action<JsonObject> edit)
{ var root = JsonNode.Parse(result.Json)!.AsObject(); edit(root); return result with { Json = root.ToJsonString() }; }
FakeApi Api() => new(initialIndex);
Task<OfflineDownloadResult> Fetch(FakeApi api, OfflineDownloadLimits? limits = null, Func<DateTimeOffset>? clock = null,
    IProgress<OfflineDownloadProgress>? progress = null, CancellationToken cancellationToken = default)
    => new OfflineDownload(api, limits, clock ?? (() => at)).FetchAsync(scope, progress, cancellationToken);

Check(source["synthetic_only"]!.GetValue<bool>() && source["source_commit"]!.GetValue<string>() == "c30a8a956715b6ea809db4b87c0f4fcddf8f61de", "fixture provenance mismatch");
var api = Api(); var progress = new CaptureProgress(); var result = await Fetch(api, progress: progress);
Check(result.ScopeId == scope && result.ManifestHash == initialIndex["data"]!["manifest_hash"]!.GetValue<string>(), "source canonical manifest did not verify");
Check(result.Dates == 2 && result.Requests == api.Calls.Count && result.Records > 200 && result.Bytes > 0, "complete batch statistics are wrong");
Check(result.CacheEntries.Count > 200 && result.CacheEntries.All(x => JsonNode.Parse(x.Value)!["_local_complete"]!.GetValue<bool>()), "cache entries are partial or unmarked");
Check(progress.Items.Last().Stage == "完整下载已核对" && progress.Items.All(x => x.Requests <= result.Requests && x.Bytes <= result.Bytes), "progress was missing or invalid");
Check(api.Calls.All(x => x.Method == "GET" && x.Body is null && x.Operation == ""), "downloader issued a write");
var recycle = Parsed(result, "/local/recycle/all")["data"]!;
Check(recycle["format"]!.GetValue<string>() == "native-trash-v1" && recycle["complete"]!.GetValue<bool>() && recycle["scope_id"]!.GetValue<string>() == scope,
    "recycle data was represented as an unverified server snapshot");
var removed = recycle["data"]!.AsObject().SelectMany(x => x.Value!.AsArray()).ToArray();
Check(removed.Length == 8 && removed.All(x => x!["deleted_at"] is not null && x["version"]!.GetValue<int>() == 7), "recycle data lost real source versions or included active records");
Check(removed.Select(x => x!["entity_id"]!.GetValue<string>()).Distinct().Count() == removed.Length, "repeated global tombstones were not deduplicated");
Check(!recycle.AsObject().ContainsKey("content_hash") && !recycle.AsObject().ContainsKey("manifest_hash") && !recycle.AsObject().ContainsKey("snapshot_format"),
    "derived recycle cache kept a misleading original server hash or format");
Check(recycle["data"]!["memo_groups"]!.AsArray().Count == 1 && recycle["data"]!["memos"]!.AsArray().Count == 1 &&
    recycle["data"]!["memos"]![0]!["group_id"]!.GetValue<string>() == FakeApi.Id(4), "deleted memo parent metadata was lost");
Check(api.Calls.Count(x => x.Path.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal)) == 2 &&
    !result.CacheEntries.Keys.Any(x => x.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal)), "daily snapshots were omitted or duplicated as full cached payloads");
Check(Parsed(result, "/api/v1/review/articles")["data"]!["items"]!.AsArray().Count == 101, "review pagination truncated at 100");
var allArticles = Parsed(result, "/api/v1/articles")["data"]!.AsArray();
Check(allArticles.Count == 107, "known, null or future article states or later pages were omitted");
Check(allArticles.Where(x => x!["status"] is not null).Select(x => x!["status"]!.GetValue<string>()).Distinct().Count() == 6, "legacy default published filter hid drafts or future states");
Check(allArticles.Single(x => x!["id"]!.GetValue<string>() == FakeApi.Id(250000))!["status"] is null &&
    allArticles.Single(x => x!["id"]!.GetValue<string>() == FakeApi.Id(260000))!["status"]!.GetValue<string>() == "future_state",
    "null or unrecognized article states were invented or normalized");
Check(allArticles.Single(x => x!["id"]!.GetValue<string>() == FakeApi.Id(260000))!["unknown_nested"]!["arr"]![0]!["unrecognized"]!.GetValue<string>() == "保留😀",
    "future-state full details lost unknown nested original data");
var reconciliation = Parsed(result, "/api/v1/article-reconciliation");
Check(reconciliation["data"]!["total"]!.GetValue<int>() == 107 && reconciliation["data"]!["counts"]!["unknown"]!.GetValue<int>() == 2,
    "complete reconciliation snapshot or unknown counts were omitted");
Check(reconciliation["_local_reconciliation"]!["scope_id"]!.GetValue<string>() == scope &&
    reconciliation["_local_reconciliation"]!["account_ids"]!.AsArray().Select(x => x!.GetValue<string>()).SequenceEqual(["synthetic-account"]) &&
    DateTimeOffset.Parse(reconciliation["_local_reconciliation"]!["observed_at_utc"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture) == at,
    "reconciliation lost the observed account set, service scope or read time");
Check(api.Calls.Count(x => x.Path == "/api/v1/accounts") == 1 && api.Calls.Count(x => x.Path == "/api/v1/article-reconciliation") == 2 &&
    api.Calls.FindIndex(x => x.Path == "/api/v1/accounts") < api.Calls.FindIndex(x => x.Path == "/api/v1/article-reconciliation") &&
    !api.Calls.Any(x => x.Path.StartsWith("/api/v1/article-reconciliation?", StringComparison.Ordinal)), "account-bound reconciliation bookends used a partial or implicit query");
Check(Parsed(result, "/api/v1/review/notes")["data"]!["items"]![0]!["deleted_at"] is not null, "review tombstone was discarded");
var reviewDetail = Parsed(result, "/api/v1/review/articles/" + FakeApi.Id(10000))["data"]!;
Check(reviewDetail["unknown_nested"]!["zero"]!.GetValue<int>() == 0 && reviewDetail["unknown_nested"]!["missing"] is null &&
    reviewDetail["unknown_nested"]!["arr"]![0]!["unrecognized"]!.GetValue<string>() == "保留😀", "review detail lost unknown nested fields, null, zero or Unicode");
Check(Parsed(result, "/api/v1/memos/notes/" + FakeApi.Id(700001))["data"]!["body"]!.GetValue<string>() == "合成正文\n完整第二行", "memo bodies were omitted");
Check(Parsed(result, "/api/v1/note-entries/labels")["data"]!["archived_labels"]!.AsArray().Count == 1, "label archive state was omitted");
var aiReports = Parsed(result, "/api/v1/ai-reports")["data"]!;
Check(aiReports["items"]!.AsArray().Count == 101 && !aiReports["has_more"]!.GetValue<bool>(), "AI reports were truncated at the first 100 items");
var aiReport = aiReports["items"]![0]!;
Check(aiReport["author"]!.GetValue<string>() == "原始合成署名，不推断身份" && aiReport["content"]!.GetValue<string>() == "合成实际记录\n第二行原文" &&
    aiReport["created_at"]!.GetValue<string>() == "2026-11-04T15:00:00.000Z" && aiReport["content_hash"]!.GetValue<string>() == new string('d', 64), "AI report fields or author attribution were invented or changed");
Check(api.Calls.Count(x => x.Path.StartsWith("/api/v1/ai-reports?", StringComparison.Ordinal)) == 2 &&
    !api.Calls.Any(x => x.Path.StartsWith("/api/v1/ai-reports/", StringComparison.Ordinal)), "AI reports used unsupported detail requests");
Check(result.CacheEntries.Keys.Count(x => x.StartsWith("/api/v1/review/overview?", StringComparison.Ordinal)) == 4, "per-account range/week overviews were omitted");
foreach (var day in new[] { "2026-11-04", "2026-11-05" })
{
    Check(result.CacheEntries.ContainsKey("/api/v1/todos?date=" + day) && result.CacheEntries.ContainsKey("/api/v1/work-reminders?date=" + day), "dated business cache is missing");
    foreach (var category in new[] { "life", "work" })
        Check(result.CacheEntries.ContainsKey("/api/v1/note-entries?category=" + category + "&date=" + day) &&
            result.CacheEntries.ContainsKey("/api/v1/daily-notes?date=" + day + "&category=" + category), "new or legacy daily notes were omitted");
}
Check(api.Calls.Last().Path == "/api/v1/workbench-snapshot/index?version=2", "final scope barrier was omitted");
Check(api.Calls[^2].Path == "/api/v1/review/articles?offset=0&read_revision=7", "global revision barrier was omitted");
Check(api.Calls.Any(x => x.Path.Contains("review/articles?offset=100&read_revision=7", StringComparison.Ordinal)), "later review page was not revision-bound");
Check(api.Calls.Where(x => new[] { "benchmark-accounts", "benchmark-articles", "notes", "account-health" }.Any(k => x.Path.StartsWith("/api/v1/review/" + k + "?", StringComparison.Ordinal)))
    .All(x => x.Path.Contains("include_deleted=1", StringComparison.Ordinal)), "resource tombstones were not requested");

// A real Worker-handler replay provides a second independent canonical-hash fixture.
var worker = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "worker-contract-c30a8a9.json")))!;
var realEmpty = worker["samples"]!.AsArray().Single(x => x!["name"]!.GetValue<string>() == "complete-v2-scope-index")!["response_json"]!.GetValue<string>();
var emptyApi = new FakeApi(JsonNode.Parse(realEmpty)!.AsObject());
var emptyResult = await Fetch(emptyApi);
Check(emptyResult.Dates == 1 && emptyResult.ManifestHash == JsonNode.Parse(realEmpty)!["data"]!["manifest_hash"]!.GetValue<string>(), "actual Worker empty manifest did not verify");
Check(Parsed(emptyResult, "/local/recycle/all")["data"]!["data"]!.AsObject().All(x => x.Value!.AsArray().Count == 0), "empty source snapshot fabricated deleted records");

foreach (var field in new[] { "content_hash", "manifest_hash", "global_content_hash", "date_content_hash", "scope_id" })
{
    var badSnapshot = Api(); badSnapshot.Alter = (call, response) => call.Path.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal)
        ? Edit(response, x => x["data"]![field] = new string('f', 64)) : response;
    await Reject(async () => { await Fetch(badSnapshot); }, "invalid snapshot " + field + " was accepted");
}
foreach (var name in source["tampered_snapshots"]!.AsObject().Select(x => x.Key))
{
    var snapshot = source["tampered_snapshots"]![name]!;
    var expectedDay = snapshot["data"]!["date"]!.GetValue<string>();
    var badSnapshot = Api(); badSnapshot.Alter = (call, response) => call.Path == "/api/v1/workbench-snapshot?date=" + expectedDay + "&version=2"
        ? response with { Json = snapshot.ToJsonString() } : response;
    await Reject(async () => { await Fetch(badSnapshot); }, "tampered snapshot with valid outer source hash was accepted: " + name);
}
var missingSnapshot = Api(); missingSnapshot.Alter = (call, response) => call.Path == "/api/v1/workbench-snapshot?date=2026-11-05&version=2" ? new(404, "{\"error\":{\"code\":\"SYNTHETIC_MISSING\"}}") : response;
await Reject(async () => { await Fetch(missingSnapshot); }, "missing promised date snapshot returned a partial recycle batch", 404);
var partialSnapshot = Api(); partialSnapshot.Alter = (call, response) => call.Path.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["complete"] = false) : response;
await Reject(async () => { await Fetch(partialSnapshot); }, "incomplete source snapshot was accepted");
using (var cancelled = new CancellationTokenSource())
{
    var cancellationApi = Api(); cancellationApi.Alter = (call, response) => { if (call.Path.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal)) cancelled.Cancel(); return response; };
    await Reject(async () => { await Fetch(cancellationApi, cancellationToken: cancelled.Token); }, "snapshot cancellation returned a partial recycle batch");
    Check(cancellationApi.Calls.Count(x => x.Path.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal)) == 1 &&
        cancellationApi.Calls.Last().Path.StartsWith("/api/v1/workbench-snapshot?date=", StringComparison.Ordinal), "snapshot cancellation continued downloading later days");
}

foreach (var status in new[] { 403, 409, 413, 503, 206 })
{
    var failing = Api(); failing.Alter = (call, response) => call.Path == "/api/v1/todo-preferences" ? new(status, "{\"error\":{\"code\":\"SYNTHETIC\"}}") : response;
    await Reject(async () => { await Fetch(failing); }, "HTTP failure returned a partial batch", status);
    Check(failing.Calls.All(x => x.Method == "GET"), "failed download attempted a write");
}
var wrongScope = Api();
await Reject(async () => { await new OfflineDownload(wrongScope, clock: () => at).FetchAsync(new string('f', 64)); }, "wrong initial scope was accepted");
Check(wrongScope.Calls.Count == 2, "wrong initial scope fetched unrelated business records");

foreach (var field in new[] { "manifest_hash", "index_hash", "global_content_hash" })
{
    var invalid = Api(); invalid.Alter = (call, response) => call.Path.Contains("workbench-snapshot/index", StringComparison.Ordinal)
        ? Edit(response, x => x["data"]![field] = new string('f', 64)) : response;
    await Reject(async () => { await Fetch(invalid); }, "invalid " + field + " was trusted");
}
var dateHash = Api(); dateHash.Alter = (call, response) => call.Path.Contains("workbench-snapshot/index", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["dates"]![0]!["content_hash"] = new string('f', 64)) : response;
await Reject(async () => { await Fetch(dateHash); }, "invalid per-date hash was trusted");
var missingDate = Api(); missingDate.Alter = (call, response) => call.Path.Contains("workbench-snapshot/index", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["dates"]!.AsArray().RemoveAt(0)) : response;
await Reject(async () => { await Fetch(missingDate); }, "index missing a date was trusted");
var duplicateEntity = Api(); duplicateEntity.Alter = (call, response) => call.Path.Contains("workbench-snapshot/index", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["entities"]!.AsArray().Add(x["data"]!["entities"]![0]!.DeepClone())) : response;
await Reject(async () => { await Fetch(duplicateEntity); }, "duplicate manifest entity was trusted");

var duplicatePage = Api(); duplicatePage.Alter = (call, response) => call.Path.StartsWith("/api/v1/review/articles?offset=100", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["items"]![0]!["id"] = FakeApi.Id(10000)) : response;
await Reject(async () => { await Fetch(duplicatePage); }, "duplicate later review page was accepted");
var absentPage = Api(); absentPage.Alter = (call, response) => call.Path.StartsWith("/api/v1/review/articles?offset=100", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["items"] = new JsonArray()) : response;
await Reject(async () => { await Fetch(absentPage); }, "empty promised later page was accepted");
var shortPage = Api(); shortPage.Alter = (call, response) => call.Path.StartsWith("/api/v1/review/articles?offset=0&", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["items"]!.AsArray().RemoveAt(0)) : response;
await Reject(async () => { await Fetch(shortPage); }, "short review page claiming has_more was accepted");
var pageRevision = Api(); pageRevision.Alter = (call, response) => call.Path.StartsWith("/api/v1/review/articles?offset=100", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]!["read_revision"] = 8) : response;
await Reject(async () => { await Fetch(pageRevision); }, "mixed review read revisions were accepted");
var detailChanged = Api(); detailChanged.Alter = (call, response) => call.Path == "/api/v1/review/articles/" + FakeApi.Id(10000)
    ? Edit(response, x => x["data"]!["content_hash"] = new string('e', 64)) : response;
await Reject(async () => { await Fetch(detailChanged); }, "list/detail hash disagreement was accepted");

foreach (var field in new[] { "id", "author", "content", "created_at", "content_hash" })
{
    var missingReport = Api(); missingReport.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=0"
        ? Edit(response, x => x["data"]!["items"]![0]!.AsObject().Remove(field)) : response;
    await Reject(async () => { await Fetch(missingReport); }, "AI report missing " + field + " was accepted");
}
foreach (var field in new[] { "absent", "string" })
{
    var badReportMore = Api(); badReportMore.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=0"
        ? Edit(response, x => { if (field == "absent") x["data"]!.AsObject().Remove("has_more"); else x["data"]!["has_more"] = "true"; }) : response;
    await Reject(async () => { await Fetch(badReportMore); }, "AI report has_more schema violation was accepted");
}
var duplicateReport = Api(); duplicateReport.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=100"
    ? Edit(response, x => x["data"]!["items"]![0]!["id"] = FakeApi.Id(800000)) : response;
await Reject(async () => { await Fetch(duplicateReport); }, "duplicate AI report across pages was accepted");
var missingReportPage = Api(); missingReportPage.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=100"
    ? Edit(response, x => x["data"]!["items"] = new JsonArray()) : response;
await Reject(async () => { await Fetch(missingReportPage); }, "AI report promised later page was absent");
var shortReportPage = Api(); shortReportPage.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=0"
    ? Edit(response, x => x["data"]!["items"]!.AsArray().RemoveAt(0)) : response;
await Reject(async () => { await Fetch(shortReportPage); }, "AI report short page claiming has_more was accepted");

foreach (var field in new[] { "total", "offset", "page", "page_size" })
{
    var badMeta = Api(); badMeta.Alter = (call, response) => call.Path.StartsWith("/api/v1/articles?page=1", StringComparison.Ordinal)
        ? Edit(response, x => x["meta"]![field] = 999) : response;
    await Reject(async () => { await Fetch(badMeta); }, "invalid legacy pagination " + field + " was accepted");
}
var oldMissing = Api(); oldMissing.Alter = (call, response) => call.Path.StartsWith("/api/v1/articles?page=2", StringComparison.Ordinal)
    ? Edit(response, x => x["data"] = new JsonArray()) : response;
await Reject(async () => { await Fetch(oldMissing); }, "legacy later page was omitted");
var oldStatus = Api(); oldStatus.Alter = (call, response) => call.Path.StartsWith("/api/v1/articles?page=1", StringComparison.Ordinal)
    ? Edit(response, x => x["data"]![0]!["status"] = "published") : response;
await Reject(async () => { await Fetch(oldStatus); }, "wrong legacy status was accepted");

// The complete reconciliation is the inventory authority; known-state pages cannot add,
// omit or silently change its records. Unknown states are read through explicit details.
var foreignReconciliation = Api(); foreignReconciliation.Alter = (call, response) => call.Path == "/api/v1/article-reconciliation"
    ? Edit(response, x => x["data"]!["rows"]![0]!["account_id"] = "foreign-account") : response;
await Reject(async () => { await Fetch(foreignReconciliation); }, "foreign account reconciliation was accepted");
Check(!foreignReconciliation.Calls.Any(x => x.Path.StartsWith("/api/v1/articles?", StringComparison.Ordinal)), "invalid reconciliation fetched unrelated articles");
var badReconciliationCount = Api(); badReconciliationCount.Alter = (call, response) => call.Path == "/api/v1/article-reconciliation"
    ? Edit(response, x => x["data"]!["counts"]!["unknown"] = 0) : response;
await Reject(async () => { await Fetch(badReconciliationCount); }, "invalid reconciliation aggregate was accepted");
var extraPageArticle = Api(); extraPageArticle.Alter = (call, response) => call.Path == "/api/v1/articles?page=1&page_size=100&status=drafting"
    ? Edit(response, x => x["data"]![0]!["id"] = FakeApi.Id(299999)) : response;
await Reject(async () => { await Fetch(extraPageArticle); }, "known page contained an article absent from the full inventory");
var missingKnownArticle = Api(); missingKnownArticle.Alter = (call, response) => call.Path == "/api/v1/articles?page=1&page_size=100&status=failed"
    ? Edit(response, x => { x["data"] = new JsonArray(); x["meta"]!["total"] = 0; x["meta"]!["has_more"] = false; }) : response;
await Reject(async () => { await Fetch(missingKnownArticle); }, "known-state page silently omitted an inventory article");
var changedPageMetadata = Api(); changedPageMetadata.Alter = (call, response) => call.Path == "/api/v1/articles?page=1&page_size=100&status=drafting"
    ? Edit(response, x => x["data"]![0]!["title"] = "分页期间改变的标题") : response;
await Reject(async () => { await Fetch(changedPageMetadata); }, "reconciliation/list metadata disagreement was accepted");
var changedDetailMetadata = Api(); changedDetailMetadata.Alter = (call, response) => call.Path == "/api/v1/articles/" + FakeApi.Id(200000)
    ? Edit(response, x => x["data"]!["notes"] = "详情期间改变的正文") : response;
await Reject(async () => { await Fetch(changedDetailMetadata); }, "list/detail content disagreement was accepted");
var changedUnknown = Api(); changedUnknown.Alter = (call, response) => call.Path == "/api/v1/articles/" + FakeApi.Id(250000)
    ? Edit(response, x => x["data"]!["status"] = "published") : response;
await Reject(async () => { await Fetch(changedUnknown); }, "null-state detail changed state without being rejected");
var missingUnknown = Api(); missingUnknown.Alter = (call, response) => call.Path == "/api/v1/articles/" + FakeApi.Id(260000)
    ? new(404, "{\"error\":{\"code\":\"SYNTHETIC_MISSING\"}}") : response;
await Reject(async () => { await Fetch(missingUnknown); }, "missing future-state detail returned a partial complete batch", 404);
await Reject(async () => { await Fetch(Api(), new(MaxRequests: api.Calls.FindIndex(x => x.Path == "/api/v1/articles/" + FakeApi.Id(260000)))); },
    "request budget exhausted while fetching unknown states returned a partial complete batch");
var changedReconciliation = Api(); changedReconciliation.Alter = (call, response) => call.Path == "/api/v1/article-reconciliation" && call.Occurrence == 2
    ? Edit(response, x => x["data"]!["rows"]![0]!["title"] = "完整下载期间改变的标题") : response;
await Reject(async () => { await Fetch(changedReconciliation); }, "changed but structurally valid reconciliation bookend was accepted");
var oversizedReconciliation = Api(); oversizedReconciliation.Alter = (call, response) => call.Path == "/api/v1/article-reconciliation"
    ? response with { Json = new string('x', WorkbenchApi.MaximumReconciliationResponseBytes + 1) } : response;
await Reject(async () => { await Fetch(oversizedReconciliation); }, "reconciliation envelope response budget was ignored");
var largeReconciliationRows = Api(); largeReconciliationRows.Alter = (call, response) => call.Path == "/api/v1/article-reconciliation"
    ? Edit(response, x => { foreach (var row in x["data"]!["rows"]!.AsArray()) row!["sample"] = new JsonObject { ["original"] = new string('x', 11000) }; }) : response;
await Reject(async () => { await Fetch(largeReconciliationRows); }, "reconciliation rows larger than 1 MiB were accepted");
using (var cancelled = new CancellationTokenSource())
{
    var cancellationApi = Api(); cancellationApi.Alter = (call, response) => { if (call.Path == "/api/v1/article-reconciliation" && call.Occurrence == 2) cancelled.Cancel(); return response; };
    await Reject(async () => { await Fetch(cancellationApi, cancellationToken: cancelled.Token); }, "reconciliation barrier cancellation returned a partial batch");
    Check(cancellationApi.Calls.Last().Path == "/api/v1/article-reconciliation", "reconciliation cancellation continued later barriers");
}

var finalRevision = Api(); finalRevision.Alter = (call, response) => call.Path == "/api/v1/review/articles?offset=0&read_revision=7" && call.Occurrence == 2
    ? new(409, "{\"error\":{\"code\":\"READ_REVISION_CHANGED\"}}") : response;
await Reject(async () => { await Fetch(finalRevision); }, "final revision conflict returned a partial batch", 409);
var finalScope = Api(); finalScope.Alter = (call, response) => call.Path.Contains("workbench-snapshot/index", StringComparison.Ordinal) && call.Occurrence == 2
    ? Edit(response, x => x["data"]!["scope_id"] = new string('f', 64)) : response;
await Reject(async () => { await Fetch(finalScope); }, "changed final scope returned a partial batch");
var changedManifest = Api(); changedManifest.Alter = (call, response) => call.Path.Contains("workbench-snapshot/index", StringComparison.Ordinal) && call.Occurrence == 2
    ? response with { Json = changedIndex.ToJsonString() } : response;
await Reject(async () => { await Fetch(changedManifest); }, "different valid final manifest was accepted");
var dayCalls = 0;
await Reject(async () => { await Fetch(Api(), clock: () => ++dayCalls == 1 ? at : at.AddDays(1)); }, "cross-midnight batch was accepted");

await Reject(async () => { await Fetch(Api(), new(MaxCacheBytes: 1024)); }, "cache budget was ignored");
await Reject(async () => { await Fetch(Api(), new(MaxDates: 1)); }, "date budget was ignored");
await Reject(async () => { await Fetch(Api(), new(MaxRows: 1)); }, "row budget was ignored");
await Reject(async () => { await Fetch(Api(), new(MaxRequests: 3)); }, "request budget was ignored");
await Reject(async () => { await Fetch(Api(), new(MaxRequests: 10001)); }, "higher-than-safe budget was accepted");
var oversized = Api(); oversized.Alter = (_, response) => response with { Json = new string('x', WorkbenchApi.MaximumResponseBytes + 1) };
await Reject(async () => { await Fetch(oversized); }, "oversized response was accepted");
var largeReports = Api(); largeReports.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=0"
    ? Edit(response, x => { foreach (var row in x["data"]!["items"]!.AsArray()) row!["content"] = new string('x', 16384); }) : response;
var largeReportResult = await Fetch(largeReports);
Check(Parsed(largeReportResult, "/api/v1/ai-reports")["data"]!["items"]![0]!["content"]!.GetValue<string>().Length == 16384,
    "legitimate bounded AI report page larger than 1 MiB was rejected");
var oversizedReports = Api(); oversizedReports.Alter = (call, response) => call.Path == "/api/v1/ai-reports?offset=0"
    ? response with { Json = new string('x', WorkbenchApi.MaximumAiReportsResponseBytes + 1) } : response;
await Reject(async () => { await Fetch(oversizedReports); }, "AI report page over 4 MiB was accepted");
var duplicateProperty = Api(); duplicateProperty.Alter = (_, response) => response with { Json = "{\"data\":{},\"data\":{}}" };
await Reject(async () => { await Fetch(duplicateProperty); }, "duplicate JSON properties were accepted");
var noArchives = Api(); noArchives.Alter = (call, response) => call.Path == "/api/v1/note-entries/labels"
    ? Edit(response, x => x["data"]!.AsObject().Remove("archived_labels")) : response;
await Reject(async () => { await Fetch(noArchives); }, "incomplete label archive response was accepted");
using (var cancelled = new CancellationTokenSource())
{
    cancelled.Cancel(); var cancellationApi = Api();
    await Reject(async () => { await Fetch(cancellationApi, cancellationToken: cancelled.Token); }, "pre-cancelled download ran");
    Check(cancellationApi.Calls.Count == 0, "pre-cancelled download made requests");
}
using (var cancelled = new CancellationTokenSource())
{
    var cancellationApi = Api(); cancellationApi.Alter = (call, response) => { if (call.Path.Contains("/review/articles/", StringComparison.Ordinal)) cancelled.Cancel(); return response; };
    await Reject(async () => { await Fetch(cancellationApi, cancellationToken: cancelled.Token); }, "mid-download cancellation returned a partial batch");
    Check(cancellationApi.Calls.Count(x => x.Path.Contains("/review/articles/", StringComparison.Ordinal)) == 1 &&
        cancellationApi.Calls.Last().Path.Contains("/review/articles/", StringComparison.Ordinal), "cancelled download continued requesting");
}

// Integration: the single cache apply happens only after both barriers; failures preserve all state.
var store = new MemoryStore(); var engine = new SyncEngine(store, Api()); await engine.InitializeAsync();
var before = JsonSerializer.Serialize(engine.Snapshot);
var applyFailure = Api(); applyFailure.Alter = finalRevision.Alter;
await Reject(async () => { var partial = await Fetch(applyFailure); await engine.CacheBatchAsync(partial.CacheEntries); }, "failed download was applied");
Check(JsonSerializer.Serialize(engine.Snapshot) == before && store.Saves == 0, "failed download changed a cache, draft, operation or revision");
var reconciliationFailure = Api(); reconciliationFailure.Alter = changedReconciliation.Alter;
await Reject(async () => { var partial = await Fetch(reconciliationFailure); await engine.CacheBatchAsync(partial.CacheEntries); }, "changed reconciliation was applied");
Check(JsonSerializer.Serialize(engine.Snapshot) == before && store.Saves == 0, "reconciliation failure changed old cache, draft or pending operation");
await engine.CacheBatchAsync(result.CacheEntries);
Check(store.Saves == 1 && engine.Snapshot.LocalRevision == 1, "complete cache batch was not one atomic save");
Check(engine.Snapshot.Drafts["synthetic-draft"].Text == "合成离线草稿" && engine.Snapshot.Outbox.Single().Status == PendingStatus.Unknown, "complete cache apply changed drafts or pending operations");
Check(result.CacheEntries.Keys.All(key => engine.Snapshot.CacheRevisions[key] == 1), "batch cache entries have mixed revisions");
Console.WriteLine($"PASS {checks} synthetic complete offline download checks; real-source manifest hashes, all pages/statuses, isolation, barriers, cancellation and budgets; no sockets or real user data.");

sealed class CaptureProgress : IProgress<OfflineDownloadProgress>
{ public List<OfflineDownloadProgress> Items { get; } = []; public void Report(OfflineDownloadProgress value) => Items.Add(value); }
sealed record Call(string Method, string Path, string? Body, string Operation, int Occurrence);

sealed class FakeApi(JsonObject index) : IRemoteApi
{
    private const long Revision = 7;
    private static readonly string[] ReviewKinds = ["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health"];
    private static readonly string[] Statuses = ["drafting", "illustrated", "draft_saved", "published", "failed"];
    private static readonly JsonObject SnapshotFixture = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,
        "Fixtures", "workbench-manifest-c30a8a9.json")))!.AsObject();
    public List<Call> Calls { get; } = [];
    public Func<Call, ApiResult, ApiResult>? Alter { get; set; }
    public static string Id(int number) => "00000000-0000-4000-8000-" + number.ToString("D12", System.Globalization.CultureInfo.InvariantCulture);
    public Task<ApiResult> SendAsync(string method, string path, string? bodyJson, string operationId, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (method != "GET" || bodyJson is not null || operationId.Length != 0) throw new InvalidOperationException("Synthetic API rejects all writes");
        var call = new Call(method, path, bodyJson, operationId, Calls.Count(x => x.Path == path) + 1); Calls.Add(call);
        var result = new ApiResult(200, Build(path).ToJsonString());
        return Task.FromResult(Alter?.Invoke(call, result) ?? result);
    }
    private JsonObject Build(string path)
    {
        var parts = path.Split('?', 2); var route = parts[0];
        var q = parts.Length == 1 ? new Dictionary<string, string>() : parts[1].Split('&').Select(x => x.Split('=', 2)).ToDictionary(x => x[0], x => Uri.UnescapeDataString(x[1]));
        if (route == "/api/v1/workbench-snapshot/index") return index.DeepClone().AsObject();
        if (route == "/api/v1/workbench-snapshot")
        {
            var kind = index["data"]!["entities"]!.AsArray().Count == 0 ? "empty_snapshots" : "snapshots";
            return SnapshotFixture[kind]![q["date"]]!.DeepClone().AsObject();
        }
        if (route == "/api/v1/article-reconciliation")
        {
            if (q.Count != 0) throw new InvalidOperationException("Reconciliation rejects all query parameters");
            var rows = new JsonArray();
            for (var status = 0; status < 7; status++)
                for (var number = 0; number < (status == 0 ? 101 : 1); number++)
                {
                    var article = Legacy(status, number); var row = new JsonObject();
                    foreach (var field in new[] { "id", "account_id", "title", "status", "slot", "writer", "run_date", "series_no", "sample", "warnings", "has_pending_verify", "verify_state" })
                        row[field] = article[field]?.DeepClone();
                    row["missing_fields"] = new JsonArray(new[] { "run_date", "status", "slot", "writer" }
                        .Where(field => row[field] is null).Select(field => (JsonNode?)JsonValue.Create(field)).ToArray());
                    rows.Add(row);
                }
            var counts = new JsonObject(Statuses.Concat(["unknown"]).Select((status, i) => KeyValuePair.Create<string, JsonNode?>(status, JsonValue.Create(i == 0 ? 101 : i == 5 ? 2 : 1))));
            return Wrap(new JsonObject
            {
                ["complete"] = true, ["total"] = 107, ["rows"] = rows, ["counts"] = counts,
                ["dates"] = new JsonArray(new JsonObject { ["date"] = null, ["count"] = 107 }),
                ["schedule"] = new JsonObject { ["configured"] = false, ["expected"] = null, ["missing"] = null, ["overdue"] = null },
                ["insurance"] = new JsonObject
                {
                    ["basis"] = "explicit_gzh_slot", ["recorded"] = 0, ["numbered"] = 0, ["unique_count"] = 0,
                    ["highest"] = null, ["lowest"] = null, ["duplicate_numbers"] = new JsonArray(), ["observed_gap_ranges"] = new JsonArray(),
                    ["start"] = null, ["target"] = null, ["sample_mapping"] = "unknown",
                    ["counts"] = new JsonObject(Statuses.Concat(["unknown"]).Select(status => KeyValuePair.Create<string, JsonNode?>(status, JsonValue.Create(0))))
                }
            });
        }
        if (route == "/api/v1/ai-reports")
        {
            if (q.Keys.Any(x => x != "offset")) throw new InvalidOperationException("AI reports do not accept revision or other query parameters");
            var offset = int.Parse(q["offset"], System.Globalization.CultureInfo.InvariantCulture);
            return Wrap(new JsonObject
            {
                ["items"] = new JsonArray(Enumerable.Range(offset, Math.Max(0, Math.Min(100, 101 - offset))).Select(n => (JsonNode?)new JsonObject
                {
                    ["id"] = Id(800000 + n), ["author"] = "原始合成署名，不推断身份", ["content"] = "合成实际记录\n第二行原文",
                    ["created_at"] = "2026-11-04T15:00:00.000Z", ["content_hash"] = new string('d', 64)
                }).ToArray()), ["has_more"] = offset + 100 < 101
            });
        }
        if (route == "/api/v1/review/overview") return Wrap(new JsonObject { ["account"] = q["account"], ["read_revision"] = Revision,
            ["current"] = new JsonObject { ["count"] = 0, ["ctr_median"] = null } });
        if (route.StartsWith("/api/v1/review/", StringComparison.Ordinal))
        {
            var fields = route[15..].Split('/'); var kind = fields[0]; var kindIndex = System.Array.IndexOf(ReviewKinds, kind);
            if (kindIndex < 0) throw new InvalidOperationException("unexpected review kind " + kind);
            if (fields.Length == 2)
            {
                var number = int.Parse(fields[1][24..], System.Globalization.CultureInfo.InvariantCulture) - (kindIndex + 1) * 10000;
                return Wrap(Review(kindIndex, number, detail: true));
            }
            if (kindIndex >= 4 && q.GetValueOrDefault("include_deleted") != "1") throw new InvalidOperationException("deleted resources were not requested");
            if (q.TryGetValue("read_revision", out var revision) && revision != "7") throw new InvalidOperationException("wrong requested revision");
            var offset = int.Parse(q.GetValueOrDefault("offset", "0"), System.Globalization.CultureInfo.InvariantCulture); var total = kindIndex == 0 ? 101 : 1;
            return Wrap(new JsonObject { ["items"] = new JsonArray(Enumerable.Range(offset, Math.Max(0, Math.Min(100, total - offset))).Select(n => (JsonNode?)Review(kindIndex, n)).ToArray()),
                ["has_more"] = offset + 100 < total, ["read_revision"] = Revision });
        }
        if (route == "/api/v1/articles")
        {
            var status = q["status"]; var statusIndex = System.Array.IndexOf(Statuses, status); var total = statusIndex == 0 ? 101 : 1;
            var page = int.Parse(q["page"], System.Globalization.CultureInfo.InvariantCulture); var offset = (page - 1) * 100;
            return new JsonObject { ["data"] = new JsonArray(Enumerable.Range(offset, Math.Max(0, Math.Min(100, total - offset))).Select(n => (JsonNode?)Legacy(statusIndex, n)).ToArray()),
                ["meta"] = new JsonObject { ["total"] = total, ["page"] = page, ["page_size"] = 100, ["offset"] = offset, ["has_more"] = offset + 100 < total } };
        }
        if (route.StartsWith("/api/v1/articles/", StringComparison.Ordinal))
        {
            var number = int.Parse(route[^12..], System.Globalization.CultureInfo.InvariantCulture) - 200000;
            var row = Legacy(number / 10000, number % 10000); row["unknown_nested"] = Unknown(); return Wrap(row);
        }
        var day = q.GetValueOrDefault("date", "2026-11-05"); var dayNumber = day == "2026-11-04" ? 1 : 2;
        if (route == "/api/v1/todos") return Wrap(new JsonObject { ["date"] = day, ["today"] = "2026-11-05", ["items"] = Rows(new JsonObject { ["id"] = Id(500000 + dayNumber), ["date"] = day, ["version"] = 1 }) });
        if (route == "/api/v1/work-reminders") return Wrap(new JsonObject { ["date"] = day, ["items"] = Rows(new JsonObject { ["id"] = Id(510000 + dayNumber), ["date"] = day, ["version"] = 1 }) });
        if (route == "/api/v1/note-entries")
        {
            var category = q["category"]; var number = 520000 + dayNumber * 10 + (category == "life" ? 1 : 2);
            return Wrap(new JsonObject { ["date"] = day, ["category"] = category, ["entries"] = Rows(Note(number)) });
        }
        if (route == "/api/v1/note-entries/labels") return Wrap(new JsonObject { ["labels"] = Rows(new JsonObject { ["name"] = "合成标签" }), ["archived_labels"] = Rows(new JsonObject { ["name"] = "合成归档" }) });
        if (route.StartsWith("/api/v1/note-entries/", StringComparison.Ordinal)) return Wrap(Note(int.Parse(route[^12..], System.Globalization.CultureInfo.InvariantCulture)));
        if (route == "/api/v1/daily-notes") return Wrap(new JsonObject { ["date"] = day, ["text"] = "合成旧日页", ["version"] = 0, ["deleted"] = false });
        if (route == "/api/v1/todo-templates") return Wrap(new JsonObject { ["items"] = Rows(new JsonObject { ["id"] = Id(600000), ["text"] = "合成模板" }) });
        if (route == "/api/v1/unscheduled-todos") return Wrap(new JsonObject { ["items"] = Rows(new JsonObject { ["id"] = Id(600001), ["text"] = "合成未来事项" }) });
        if (route == "/api/v1/accounts") return Wrap(Rows(new JsonObject { ["id"] = "synthetic-account", ["name"] = "合成运营账号" }));
        if (route == "/api/v1/account-profiles") return Wrap(Rows(new JsonObject { ["account_id"] = "synthetic-account", ["profile_url"] = "https://example.invalid/synthetic" }));
        if (route == "/api/v1/observations") return Wrap(Rows(new JsonObject { ["id"] = Id(600002), ["metrics"] = Unknown() }));
        if (route == "/api/v1/daily-metrics") return Wrap(Rows(new JsonObject { ["id"] = Id(600003), ["metrics"] = Unknown() }));
        if (route == "/api/v1/due-reviews") return Wrap(Rows(new JsonObject { ["id"] = Id(200000), ["due_kind"] = "d1" }, new JsonObject { ["id"] = Id(200000), ["due_kind"] = "d3" }));
        if (route == "/api/v1/todo-preferences") return Wrap(new JsonObject { ["completed_mode"] = "strike", ["version"] = 0 });
        if (route == "/api/v1/overview") return Wrap(new JsonObject { ["unknown_nested"] = Unknown() });
        if (route == "/api/v1/memos") return Wrap(new JsonObject { ["groups"] = Rows(new JsonObject { ["id"] = Id(700000), ["title"] = "合成分组" }),
            ["notes"] = Rows(new JsonObject { ["id"] = Id(700001), ["group_id"] = Id(700000), ["title"] = "合成笔记", ["version"] = 2 }) });
        if (route == "/api/v1/memos/notes/" + Id(700001)) return Wrap(new JsonObject { ["id"] = Id(700001), ["group_id"] = Id(700000),
            ["version"] = 2, ["body"] = "合成正文\n完整第二行", ["unknown_nested"] = Unknown() });
        throw new InvalidOperationException("Unexpected synthetic route " + path);
    }
    private static JsonObject Review(int kind, int number, bool detail = false)
    {
        var row = new JsonObject { ["id"] = Id((kind + 1) * 10000 + number), ["account"] = "合成账号", ["title"] = "合成复盘",
            ["content_hash"] = new string('a', 64), ["deleted_at"] = kind == 6 ? "2026-11-04T15:00:00Z" : null };
        if (detail) row["unknown_nested"] = Unknown(); return row;
    }
    private static JsonObject Legacy(int status, int number) => new()
    {
        ["id"] = Id(200000 + status * 10000 + number), ["status"] = status < 5 ? Statuses[status] : status == 5 ? null : "future_state",
        ["title"] = "合成旧文章", ["account_id"] = "synthetic-account", ["slot"] = null, ["writer"] = null,
        ["run_date"] = null, ["series_no"] = null, ["sample"] = new JsonObject { ["original"] = "原始合成样本😀" },
        ["warnings"] = new JsonArray(), ["has_pending_verify"] = null, ["verify_state"] = "unknown", ["notes"] = "原始合成记录"
    };
    private static JsonObject Note(int number) => new() { ["id"] = Id(number), ["date"] = (number - 520000) / 10 == 1 ? "2026-11-04" : "2026-11-05",
        ["category"] = number % 10 == 1 ? "life" : "work", ["version"] = 1, ["text"] = "合成记录", ["unknown_nested"] = Unknown() };
    private static JsonObject Unknown() => new() { ["zero"] = 0, ["missing"] = null, ["arr"] = Rows(new JsonObject { ["unrecognized"] = "保留😀" }) };
    private static JsonObject Wrap(JsonNode data) => new() { ["data"] = data };
    private static JsonArray Rows(params JsonObject[] rows) => new(rows.Select(x => (JsonNode?)x).ToArray());
}

sealed class MemoryStore : IWorkspaceStore
{
    public string ScopeId => "synthetic-workspace";
    public int Saves { get; private set; }
    private WorkspaceState state = new()
    {
        ScopeId = "synthetic-workspace", Cache = new() { ["old"] = "{\"data\":{\"keep\":true}}" },
        Drafts = new() { ["synthetic-draft"] = new() { Key = "synthetic-draft", Text = "合成离线草稿" } },
        Outbox = [new() { ResourceKey = "/api/v1/todos/" + FakeApi.Id(900000), Path = "/api/v1/todos/" + FakeApi.Id(900000),
            Method = "PATCH", BodyJson = "{\"completed\":true,\"version\":1}", Status = PendingStatus.Unknown }]
    };
    public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken = default) => Task.FromResult(Clone(state));
    public Task SaveAsync(WorkspaceState value, CancellationToken cancellationToken = default) { state = Clone(value); Saves++; return Task.CompletedTask; }
    private static WorkspaceState Clone(WorkspaceState value) => JsonSerializer.Deserialize<WorkspaceState>(JsonSerializer.Serialize(value))!;
}
