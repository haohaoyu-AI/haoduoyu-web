using System.Collections.ObjectModel;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

public sealed record OfflineDownloadLimits(int MaxCacheBytes = 24 * 1024 * 1024,
    int MaxDates = 1000, int MaxRows = 50000, int MaxRequests = 10000);
public sealed record OfflineDownloadProgress(string Stage, int Requests, long Records, long Bytes, int Dates);
public sealed record OfflineDownloadResult(string ScopeId, string ManifestHash,
    IReadOnlyDictionary<string, string> CacheEntries, int Dates, long Records, int Requests, long Bytes);

// Stages a read-only, complete batch in memory. The caller applies it atomically only after success.
// No cache, draft, outbox, store, file or session is changed by this downloader.
public sealed class OfflineDownload(IRemoteApi api, OfflineDownloadLimits? limits = null,
    Func<DateTimeOffset>? clock = null)
{
    public Task<OfflineDownloadResult> FetchAsync(string expectedScopeId, string cacheScopeId,
        IProgress<OfflineDownloadProgress>? progress = null, CancellationToken cancellationToken = default)
        => new Download(api, limits ?? new(), clock ?? (() => DateTimeOffset.UtcNow), progress, cancellationToken)
            .FetchAsync(expectedScopeId, cacheScopeId);

    private sealed class Download(IRemoteApi api, OfflineDownloadLimits limits, Func<DateTimeOffset> clock,
        IProgress<OfflineDownloadProgress>? progress, CancellationToken cancellationToken)
    {
        private static readonly JsonSerializerOptions JsonOptions = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        private static readonly string[] ReviewKinds = ["articles", "snapshots", "reports", "playbooks", "benchmark-accounts", "benchmark-articles", "notes", "account-health"];
        private static readonly string[] ArticleStatuses = ["drafting", "illustrated", "draft_saved", "published", "failed"];
        private static readonly string[] SnapshotCollections = ["todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos", "unscheduled_todos", "note_labels"];
        private readonly Dictionary<string, string> cache = new(StringComparer.Ordinal);
        private readonly HashSet<string> records = new(StringComparer.Ordinal);
        private readonly HashSet<string> accounts = new(StringComparer.Ordinal);
        private int requests, dateCount;
        private long bytes, wireBytes;
        private string stage = "核对工作区";

        public async Task<OfflineDownloadResult> FetchAsync(string expectedScopeId, string cacheScopeId)
        {
            ArgumentNullException.ThrowIfNull(api);
            if (!HashValue(expectedScopeId)) throw Incomplete("缺少已确认的服务工作区身份");
            if (string.IsNullOrWhiteSpace(cacheScopeId)) throw Incomplete("缺少本机缓存分区身份");
            if (limits.MaxCacheBytes is < 1 or > 24 * 1024 * 1024 || limits.MaxDates is < 1 or > 1000 ||
                limits.MaxRows is < 1 or > 50000 || limits.MaxRequests is < 1 or > 10000)
                throw new ArgumentOutOfRangeException(nameof(limits), "下载预算只能在安全上限内设置。");
            var today = BeijingDay(clock());
            var revision = Revision(Data(await Get("/api/v1/review/articles?offset=0")));
            var firstEnvelope = await Get("/api/v1/workbench-snapshot/index?version=2");
            var first = VerifyIndex(firstEnvelope, expectedScopeId);
            Add("/api/v1/workbench-snapshot/index?version=2", firstEnvelope);
            var days = first.Dates.Append(today).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
            dateCount = days.Length;
            if (dateCount > limits.MaxDates) throw Incomplete("日期超过完整下载预算");

            stage = "核对文章对账与运营账号";
            var articleAccounts = await FetchArticleAccounts();
            var (reconciliationEnvelope, reconciliation) = await GetReconciliation(articleAccounts);
            var reconciliationObservedAt = clock().ToUniversalTime();

            stage = "核对离线回收站";
            await FetchRecycle(days, first, expectedScopeId);

            stage = "下载内容复盘";
            foreach (var kind in ReviewKinds) await FetchReview(kind, revision);
            stage = "下载 AI 汇报";
            await FetchAiReports();
            stage = "下载文章台账";
            await FetchArticles(reconciliation);
            stage = "下载日常资料";
            foreach (var day in days) await FetchDay(day, today);
            var templateLists = await FetchTemplateLists(today, expectedScopeId, cacheScopeId);
            await FetchShared();
            stage = "下载账号复盘总览";
            foreach (var account in accounts.Order(StringComparer.Ordinal))
                foreach (var range in new[] { "7d", "30d" })
                    foreach (var week in new[] { "this", "last" })
                    {
                        var path = "/api/v1/review/overview?account=" + Uri.EscapeDataString(account) + "&range=" + range + "&week=" + week;
                        var envelope = await Get(path);
                        if (Revision(Data(envelope)) != revision) throw Incomplete("复盘总览读取版本已变化");
                        Add(path, envelope);
                    }

            stage = "核对完整下载";
            // Archived templates are outside the business manifest. Independently reread each
            // full list; compare business data, not local observation timestamps or request IDs.
            foreach (var (path, firstList) in templateLists)
            {
                var (_, lastList) = await GetTemplateList(path, today);
                if (!JsonNode.DeepEquals(firstList.Data, lastList.Data)) throw Incomplete("下载期间常用事项活动或归档列表已变化");
            }
            // The reconciliation route has no server revision. These bookends detect changed
            // inventories; they do not turn the intervening reads into a transaction or prevent ABA.
            var (_, lastReconciliation) = await GetReconciliation(articleAccounts);
            if (!JsonNode.DeepEquals(reconciliation.Data, lastReconciliation.Data))
                throw Incomplete("下载期间文章对账资料已变化");
            var barrier = Data(await Get("/api/v1/review/articles?offset=0&read_revision=" + Number(revision)));
            if (Revision(barrier) != revision) throw Incomplete("下载期间业务资料已变化");
            var last = VerifyIndex(await Get("/api/v1/workbench-snapshot/index?version=2"), expectedScopeId);
            if (last.ManifestHash != first.ManifestHash || last.GlobalHash != first.GlobalHash ||
                !last.Dates.SequenceEqual(first.Dates, StringComparer.Ordinal) ||
                BeijingDay(clock()) != today || last.ServerDay != first.ServerDay)
                throw Incomplete("下载期间工作区、资料或日期已变化");
            cancellationToken.ThrowIfCancellationRequested();
            reconciliationEnvelope["_local_reconciliation"] = new JsonObject
            {
                ["scope_id"] = expectedScopeId,
                ["account_ids"] = new JsonArray(articleAccounts.Order(StringComparer.Ordinal).Select(x => (JsonNode?)JsonValue.Create(x)).ToArray()),
                ["observed_at_utc"] = reconciliationObservedAt.ToString("O", CultureInfo.InvariantCulture)
            };
            Add("/api/v1/article-reconciliation", reconciliationEnvelope);
            stage = "完整下载已核对"; Report();
            cancellationToken.ThrowIfCancellationRequested();
            return new(expectedScopeId, first.ManifestHash, new ReadOnlyDictionary<string, string>(cache),
                dateCount, records.Count, requests, bytes);
        }

        private async Task FetchReview(string kind, long revision)
        {
            var rows = new JsonArray(); var ids = new HashSet<string>(StringComparer.Ordinal);
            var includeDeleted = kind is "benchmark-accounts" or "benchmark-articles" or "notes" or "account-health";
            for (var offset = 0; ; offset = checked(offset + 100))
            {
                var path = "/api/v1/review/" + kind + "?offset=" + Number(offset) + "&read_revision=" + Number(revision) + (includeDeleted ? "&include_deleted=1" : "");
                var data = Object(Data(await Get(path)));
                if (Revision(data) != revision) throw Incomplete("复盘分页读取版本不一致");
                var page = Array(data["items"]); var more = Boolean(data["has_more"]);
                if (page.Count > 100 || more && page.Count != 100 || offset > 0 && page.Count == 0) throw Incomplete("复盘分页缺失或不完整");
                foreach (var value in page)
                {
                    var row = Object(value); var id = SafeId(row, "id", uuid: true);
                    if (!ids.Add(id)) throw Incomplete("复盘分页存在重复记录");
                    Record("review/" + kind + "/" + id);
                    if (row["account"] is JsonValue account && account.TryGetValue<string>(out var accountName)) Account(accountName);
                    var detailPath = "/api/v1/review/" + kind + "/" + id;
                    var detailEnvelope = await Get(detailPath); var detail = Object(Data(detailEnvelope));
                    if (SafeId(detail, "id", uuid: true) != id || RequiredHash(row, "content_hash") != RequiredHash(detail, "content_hash"))
                        throw Incomplete("复盘列表与完整详情不一致");
                    Add(detailPath, detailEnvelope);
                    rows.Add(row.DeepClone());
                }
                if (!more) break;
            }
            Add("/api/v1/review/" + kind, new JsonObject { ["data"] = new JsonObject
            { ["items"] = rows, ["has_more"] = false, ["read_revision"] = revision } });
        }

        private async Task FetchRecycle(IReadOnlyList<string> days, VerifiedIndex initial, string scope)
        {
            var deleted = new JsonObject(SnapshotCollections.Select(name => KeyValuePair.Create<string, JsonNode?>(name, new JsonArray())));
            var seen = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var day in days)
            {
                var snapshot = Object(Data(await Get("/api/v1/workbench-snapshot?date=" + day + "&version=2")));
                if (String(snapshot["snapshot_format"]) != "haoduoyu-workbench-snapshot-v2" ||
                    String(snapshot["projection"]) != "current" || !Boolean(snapshot["complete"]) ||
                    String(snapshot["timezone"]) != "Asia/Shanghai" || String(snapshot["scope_id"]) != scope || Date(snapshot["date"]) != day ||
                    RequiredHash(snapshot, "manifest_hash") != initial.ManifestHash || RequiredHash(snapshot, "global_content_hash") != initial.GlobalHash)
                    throw Incomplete("删除快照日期、工作区或完整索引已变化");
                var entities = Array(snapshot["entities"]);
                if (Hash(new JsonObject { ["snapshot_format"] = "haoduoyu-workbench-snapshot-v2", ["scope_id"] = scope, ["entities"] = entities.DeepClone() }) != initial.ManifestHash)
                    throw Incomplete("删除快照的完整实体索引哈希无效");
                var global = new JsonArray(entities.Where(x => Object(x)["date"] is null).Select(x => x!.DeepClone()).ToArray());
                var dated = new JsonArray(entities.Where(x => Object(x)["date"] is not null && Date(Object(x)["date"]) == day).Select(x => x!.DeepClone()).ToArray());
                if (Hash(new JsonObject { ["scope_id"] = scope, ["entities"] = global }) != initial.GlobalHash ||
                    Hash(new JsonObject { ["scope_id"] = scope, ["entities"] = dated }) != RequiredHash(snapshot, "date_content_hash"))
                    throw Incomplete("删除快照的全局或日期哈希无效");
                var data = Object(snapshot["data"]);
                if (data.Count != SnapshotCollections.Length || SnapshotCollections.Any(name => data[name] is not JsonArray) ||
                    Hash(new JsonObject { ["snapshot_format"] = "haoduoyu-workbench-snapshot-v2", ["scope_id"] = scope,
                        ["date"] = day, ["timezone"] = "Asia/Shanghai", ["data"] = data.DeepClone() }) != RequiredHash(snapshot, "content_hash"))
                    throw Incomplete("删除快照正文不完整或哈希校验失败");
                var expected = entities.Where(x => Object(x)["date"] is null || Date(Object(x)["date"]) == day)
                    .Select(Object).ToDictionary(x => String(x["entity_id"]), StringComparer.Ordinal);
                var dailySeen = new HashSet<string>(StringComparer.Ordinal);
                foreach (var collection in SnapshotCollections)
                    foreach (var value in Array(data[collection]))
                    {
                        var row = Object(value); ValidateSnapshotRow(row, collection, day);
                        var id = String(row["entity_id"]);
                        if (!dailySeen.Add(id) || !expected.TryGetValue(id, out var manifest)) throw Incomplete("删除快照实体重复或不在完整索引中");
                        var summary = new JsonObject();
                        foreach (var key in new[] { "entity_id", "entity_type", "date", "updated_at", "deleted_at", "content_hash" }) summary[key] = row[key]?.DeepClone();
                        var unhashed = new JsonObject(row.Where(x => x.Key != "content_hash").Select(x => KeyValuePair.Create(x.Key, x.Value?.DeepClone())));
                        if (Hash(summary) != Hash(manifest) || Hash(unhashed) != RequiredHash(row, "content_hash"))
                            throw Incomplete("删除记录的原始版本或内容哈希无法核对");
                        var rowHash = Hash(row);
                        if (seen.TryGetValue(id, out var old))
                        {
                            if (old != rowHash || row["date"] is not null) throw Incomplete("跨日期快照中的重复实体内容冲突");
                            continue;
                        }
                        seen.Add(id, rowHash); Record("snapshot/" + id);
                        if (row["deleted_at"] is not null) Array(deleted[collection]).Add(row.DeepClone());
                    }
                if (dailySeen.Count != expected.Count) throw Incomplete("删除快照缺少完整索引中的记录");
            }
            // This is a native derived cache, not a server snapshot. Never attach a server hash to cropped data.
            Add("/local/recycle/all", new JsonObject { ["data"] = new JsonObject
            { ["complete"] = true, ["scope_id"] = scope, ["format"] = "native-trash-v1", ["data"] = deleted } });
        }

        private static void ValidateSnapshotRow(JsonObject row, string collection, string day)
        {
            var source = String(row["source"]); var id = String(row["source_id"]);
            var category = row["category"] is null ? null : String(row["category"]);
            var (expectedCollection, type, prefix, dated) = source switch
            {
                "todo" => ("todos", "todo", "todo", true),
                "unscheduled_todo" => ("unscheduled_todos", "unscheduled_todo", "unscheduled_todo", false),
                "legacy_daily_note" when category is "life" or "work" => (category + "_notes", category + "_note", "legacy-" + category, true),
                "note_entry" when category is "life" or "work" => (category + "_notes", category + "_note", "note-entry", true),
                "work_reminder" => ("work_reminders", "work_reminder", "work-reminder", true),
                "memo_group" => ("memo_groups", "memo_group", "memo-group", false),
                "memo_note" => ("memos", "memo_note", "memo-note", false),
                "note_label" => ("note_labels", "note_label", "note-label", false),
                _ => throw Incomplete("删除快照出现未知来源或分类")
            };
            if (collection != expectedCollection || String(row["entity_type"]) != type || String(row["entity_id"]) != prefix + ":" + id ||
                Integer(row["version"]) < 1 || !row.ContainsKey("date") || !row.ContainsKey("created_at") || !row.ContainsKey("deleted_at") ||
                (dated ? row["date"] is null || Date(row["date"]) != day : row["date"] is not null))
                throw Incomplete("删除记录来源、日期或真实版本不一致");
            if (source == "legacy_daily_note") { if (Date(row["source_id"]) != day) throw Incomplete("旧版日页来源日期不一致"); }
            else if (source != "note_label") SafeId(row, "source_id", uuid: true);
            else if (id.Length == 0) throw Incomplete("标签来源标识缺失");
            if (source == "memo_note") SafeId(row, "group_id", uuid: true);
            if (row.ContainsKey("change_seq")) Integer(row["change_seq"]);
            foreach (var key in new[] { "created_at", "updated_at", "deleted_at" })
                if (!(key != "updated_at" && row[key] is null) && !DateTimeOffset.TryParse(String(row[key]), CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                    throw Incomplete("删除记录原始时间无效");
        }

        private async Task<HashSet<string>> FetchArticleAccounts()
        {
            const string path = "/api/v1/accounts";
            var envelope = await Get(path); var rows = Array(Data(envelope));
            CountRows("accounts", rows);
            var ids = rows.Select(x => SafeId(Object(x), "id")).ToHashSet(StringComparer.Ordinal);
            Add(path, envelope); return ids;
        }

        private async Task<(JsonObject Envelope, ArticleReconciliationSnapshot Snapshot)> GetReconciliation(IReadOnlySet<string> allowedAccounts)
        {
            ArticleReconciliationSnapshot? snapshot = null;
            // Validate the original wire JSON so surrogate escaping cannot change the server's
            // one-MiB row budget when native nodes are serialized again.
            var envelope = await Get("/api/v1/article-reconciliation", raw => snapshot = ArticleReconciliation.Parse(raw, allowedAccounts));
            return (envelope, snapshot ?? throw Incomplete("完整文章对账缺失"));
        }

        private async Task FetchArticles(ArticleReconciliationSnapshot reconciliation)
        {
            var rows = new JsonArray(); var ids = new HashSet<string>(StringComparer.Ordinal);
            var inventory = reconciliation.Rows.ToDictionary(x => SafeId(x, "id"), StringComparer.Ordinal);
            foreach (var status in ArticleStatuses)
            {
                long? total = null; long read = 0;
                for (var page = 1; ; page = checked(page + 1))
                {
                    var path = "/api/v1/articles?page=" + Number(page) + "&page_size=100&status=" + status;
                    var envelope = await Get(path); var items = Array(Data(envelope)); var meta = Object(envelope["meta"]);
                    var count = Integer(meta["total"]); var more = Boolean(meta["has_more"]);
                    var offset = checked((long)(page - 1) * 100);
                    if (Integer(meta["page"]) != page || Integer(meta["page_size"]) != 100 || Integer(meta["offset"]) != offset ||
                        total is not null && total != count || count < offset || items.Count != Math.Min(100, count - offset) ||
                        more != (offset + items.Count < count))
                        throw Incomplete("文章分页总数、页码或完整性无法核对");
                    total = count;
                    foreach (var value in items)
                    {
                        var row = Object(value); var id = SafeId(row, "id");
                        if (!ids.Add(id) || String(row["status"]) != status || !inventory.TryGetValue(id, out var recorded))
                            throw Incomplete("文章分页重复、状态不一致或不在完整对账中");
                        VerifyArticleMetadata(recorded, row);
                        Record("articles/" + id);
                        var detailPath = "/api/v1/articles/" + id; var detailEnvelope = await Get(detailPath);
                        var detail = Object(Data(detailEnvelope));
                        VerifyArticleMetadata(recorded, detail);
                        // Every list property is also present on the full detail route. Refuse
                        // changes outside the reconciliation's smaller metadata projection too.
                        if (row.Any(field => !detail.ContainsKey(field.Key) || !JsonNode.DeepEquals(field.Value, detail[field.Key])))
                            throw Incomplete("文章列表与详情内容已变化");
                        Add(detailPath, detailEnvelope); rows.Add(row.DeepClone()); read++;
                    }
                    if (!more) { if (read != total) throw Incomplete("文章分页没有读全"); break; }
                }
            }
            foreach (var recorded in reconciliation.Rows)
            {
                var id = SafeId(recorded, "id");
                var known = recorded["status"] is JsonValue status && status.TryGetValue<string>(out var text) && ArticleStatuses.Contains(text, StringComparer.Ordinal);
                if (known)
                {
                    if (!ids.Contains(id)) throw Incomplete("文章分页缺少完整对账中的已知状态文章");
                    continue;
                }
                // /articles defaults to published and only accepts the five known states.
                // Null and future state strings therefore require explicit detail reads.
                if (!ids.Add(id)) throw Incomplete("文章完整对账重复");
                Record("articles/" + id);
                var path = "/api/v1/articles/" + id; var envelope = await Get(path);
                var detail = Object(Data(envelope)); VerifyArticleMetadata(recorded, detail);
                Add(path, envelope); rows.Add(detail.DeepClone());
            }
            if (ids.Count != reconciliation.Total) throw Incomplete("文章台账与完整对账数量不一致");
            Add("/api/v1/articles", new JsonObject { ["data"] = rows,
                ["meta"] = new JsonObject { ["total"] = rows.Count, ["has_more"] = false } });
        }

        private static void VerifyArticleMetadata(JsonObject recorded, JsonObject actual)
        {
            foreach (var field in new[] { "id", "account_id", "title", "status", "slot", "writer", "run_date", "series_no", "sample", "warnings", "has_pending_verify", "verify_state" })
                if (!actual.ContainsKey(field) || !JsonNode.DeepEquals(recorded[field], actual[field]))
                    throw Incomplete("文章对账与列表或详情元资料不一致");
        }

        private async Task FetchAiReports()
        {
            var rows = new JsonArray(); var ids = new HashSet<string>(StringComparer.Ordinal);
            for (var offset = 0; ; offset = checked(offset + 100))
            {
                // This endpoint has no detail route or read_revision parameter. The download's
                // global revision bookends cover report creation/deletion as well as other writes.
                var data = Object(Data(await Get("/api/v1/ai-reports?offset=" + Number(offset))));
                var page = Array(data["items"]); var more = Boolean(data["has_more"]);
                if (page.Count > 100 || more && page.Count != 100 || offset > 0 && page.Count == 0)
                    throw Incomplete("AI 汇报分页缺失或不完整");
                foreach (var value in page)
                {
                    var row = Object(value); var id = SafeId(row, "id", uuid: true);
                    if (!ids.Add(id)) throw Incomplete("AI 汇报分页存在重复记录");
                    RequiredHash(row, "content_hash");
                    if (string.IsNullOrWhiteSpace(String(row["author"])) || string.IsNullOrWhiteSpace(String(row["content"])) ||
                        !DateTimeOffset.TryParse(String(row["created_at"]), CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
                        throw Incomplete("AI 汇报缺少原始署名、正文或创建时间");
                    Record("ai-reports/" + id); rows.Add(row.DeepClone());
                }
                if (!more) break;
            }
            Add("/api/v1/ai-reports", new JsonObject { ["data"] = new JsonObject { ["items"] = rows, ["has_more"] = false } });
        }

        private async Task FetchDay(string day, string today)
        {
            var path = "/api/v1/todos?date=" + day; var envelope = await Get(path); var data = Object(Data(envelope));
            if (String(data["date"]) != day || String(data["today"]) != today) throw Incomplete("待办日期已变化，请重新下载");
            CountRows("todos", Array(data["items"])); Add(path, envelope);
            path = "/api/v1/work-reminders?date=" + day; envelope = await Get(path); data = Object(Data(envelope));
            if (String(data["date"]) != day) throw Incomplete("工作提醒日期不一致");
            CountRows("work-reminders", Array(data["items"])); Add(path, envelope);
            foreach (var category in new[] { "life", "work" })
            {
                path = "/api/v1/note-entries?category=" + category + "&date=" + day;
                envelope = await Get(path); data = Object(Data(envelope));
                if (String(data["date"]) != day || String(data["category"]) != category) throw Incomplete("记录日期或分类不一致");
                var entries = Array(data["entries"]); CountRows("note-entries", entries); Add(path, envelope);
                foreach (var entry in entries)
                {
                    var row = Object(entry); var id = SafeId(row, "id", uuid: true);
                    var detailPath = "/api/v1/note-entries/" + id; var detailEnvelope = await Get(detailPath);
                    var detail = Object(Data(detailEnvelope));
                    if (SafeId(detail, "id", uuid: true) != id || String(detail["category"]) != category || String(detail["date"]) != day ||
                        Integer(row["version"]) != Integer(detail["version"])) throw Incomplete("记录列表与完整详情不一致");
                    Add(detailPath, detailEnvelope);
                }
                path = "/api/v1/daily-notes?date=" + day + "&category=" + category;
                envelope = await Get(path); data = Object(Data(envelope));
                if (String(data["date"]) != day) throw Incomplete("旧版日页日期不一致");
                Integer(data["version"]); Record("daily-notes/" + category + "/" + day); Add(path, envelope);
            }
        }

        private async Task FetchShared()
        {
            foreach (var (name, field, idField) in new[]
            {
                ("unscheduled-todos", "items", "id"),
                ("account-profiles", "", "account_id"),
                ("observations", "", "id"), ("daily-metrics", "", "id")
            })
            {
                var path = "/api/v1/" + name; var envelope = await Get(path); var data = Data(envelope);
                CountRows(name, Array(field.Length == 0 ? data : Object(data)[field]), idField); Add(path, envelope);
            }
            foreach (var name in new[] { "todo-preferences", "overview", "due-reviews" })
            {
                var path = "/api/v1/" + name; var envelope = await Get(path);
                if (name == "due-reviews")
                {
                    var seen = new HashSet<string>(StringComparer.Ordinal);
                    foreach (var value in Array(Data(envelope)))
                    {
                        var row = Object(value); var key = SafeId(row, "id") + ":" + String(row["due_kind"]);
                        if (!seen.Add(key)) throw Incomplete("到期观察重复"); Record(name + "/" + key);
                    }
                }
                else Object(Data(envelope));
                Add(path, envelope);
            }
            var labelsPath = "/api/v1/note-entries/labels"; var labelsEnvelope = await Get(labelsPath); var labels = Object(Data(labelsEnvelope));
            CountRows("labels", Array(labels["labels"]), "name", pathId: false);
            if (labels["archived_labels"] is not JsonArray archived) throw Incomplete("标签响应缺少完整归档资料");
            CountRows("archived-labels", archived, "name", pathId: false); Add(labelsPath, labelsEnvelope);
            var memoPath = "/api/v1/memos"; var memoEnvelope = await Get(memoPath); var memos = Object(Data(memoEnvelope));
            var groups = Array(memos["groups"]); var notes = Array(memos["notes"]);
            CountRows("memos/groups", groups); CountRows("memos/notes", notes); Add(memoPath, memoEnvelope);
            var groupIds = groups.Select(x => SafeId(Object(x), "id")).ToHashSet(StringComparer.Ordinal);
            foreach (var note in notes)
            {
                var row = Object(note); var id = SafeId(row, "id", uuid: true);
                if (!groupIds.Contains(String(row["group_id"]))) throw Incomplete("备忘录分组缺失");
                var detailPath = "/api/v1/memos/notes/" + id; var detailEnvelope = await Get(detailPath); var detail = Object(Data(detailEnvelope));
                if (SafeId(detail, "id", uuid: true) != id || String(detail["group_id"]) != String(row["group_id"]) ||
                    Integer(detail["version"]) != Integer(row["version"])) throw Incomplete("备忘录列表与正文不一致");
                if (detail["body"] is not JsonValue body || !body.TryGetValue<string>(out _)) throw Incomplete("备忘录正文缺失");
                Add(detailPath, detailEnvelope);
            }
        }

        private async Task<Dictionary<string, TemplateArchiveList>> FetchTemplateLists(string today, string serviceScope, string cacheScope)
        {
            var lists = new Dictionary<string, TemplateArchiveList>(StringComparer.Ordinal);
            var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var archived in new[] { false, true })
            {
                var path = TemplateArchive.ListPath(archived);
                var (envelope, list) = await GetTemplateList(path, today);
                foreach (var row in list.Items)
                {
                    var id = String(row["id"]);
                    if (!ids.Add(id)) throw Incomplete("常用事项活动及归档列表包含相同模板");
                    if (ids.Count > TemplateArchive.MaximumItems) throw Incomplete("常用事项两列表超过本机预览行数预算");
                    Record("todo-templates/" + id.ToLowerInvariant());
                }
                envelope["_local_scope_id"] = cacheScope;
                envelope["_local_template_archive"] = new JsonObject
                {
                    ["scope_id"] = cacheScope, ["service_scope_id"] = serviceScope, ["query_path"] = path,
                    ["observed_at_utc"] = clock().ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)
                };
                Add(path, envelope); lists.Add(path, list);
            }
            return lists;
        }

        private async Task<(JsonObject Envelope, TemplateArchiveList List)> GetTemplateList(string path, string today)
        {
            TemplateArchiveList? list = null;
            var envelope = await Get(path, raw => list = TemplateArchive.ParseList(path, raw));
            if (envelope.Any(field => field.Key.StartsWith("_local_", StringComparison.Ordinal) || field.Key == "_operation_id"))
                throw Incomplete("模板网络响应包含本机来源标记");
            if (list is null || list.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) != today)
                throw Incomplete("模板统计日期已变化或来源过期");
            return (envelope, list);
        }

        private async Task<JsonObject> Get(string path, Action<string>? validateRaw = null)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (++requests > limits.MaxRequests) throw Incomplete("请求次数超过完整下载预算");
            var result = await api.SendAsync("GET", path, null, "", cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            if (result.StatusCode != 200) throw new ApiCallException("完整下载中止，未替换任何本机资料（HTTP " + result.StatusCode + "）。", result.StatusCode, result.RequestId);
            var size = Encoding.UTF8.GetByteCount(result.Json); wireBytes += size;
            var responseLimit = path.Split('?')[0] switch
            {
                "/api/v1/ai-reports" => WorkbenchApi.MaximumAiReportsResponseBytes,
                "/api/v1/article-reconciliation" when path == "/api/v1/article-reconciliation" => WorkbenchApi.MaximumReconciliationResponseBytes,
                _ => WorkbenchApi.MaximumResponseBytes
            };
            if (size > responseLimit || wireBytes > (long)limits.MaxCacheBytes * 4)
                throw Incomplete("响应大小超过完整下载预算");
            try
            {
                using var document = JsonDocument.Parse(result.Json); CheckProperties(document.RootElement);
                var envelope = JsonNode.Parse(result.Json) as JsonObject ?? throw Incomplete("响应不是完整 JSON 对象");
                if (envelope["data"] is not (JsonArray or JsonObject)) throw Incomplete("响应没有完整业务数据");
                validateRaw?.Invoke(result.Json);
                Report(); return envelope;
            }
            catch (JsonException error) { throw new InvalidDataException("完整下载响应损坏；本机原资料未改变。", error); }
        }

        private void Add(string path, JsonObject envelope)
        {
            envelope["_local_complete"] = true;
            var json = envelope.ToJsonString(JsonOptions);
            if (cache.TryGetValue(path, out var previous)) bytes -= Encoding.UTF8.GetByteCount(path) + Encoding.UTF8.GetByteCount(previous);
            bytes += Encoding.UTF8.GetByteCount(path) + Encoding.UTF8.GetByteCount(json);
            if (bytes > limits.MaxCacheBytes) throw Incomplete("本机缓存超过完整下载预算");
            cache[path] = json; Report();
        }

        private void CountRows(string kind, JsonArray rows, string idField = "id", bool pathId = true)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var value in rows)
            {
                var row = Object(value); var id = pathId ? SafeId(row, idField) : String(row[idField]);
                if (id.Length == 0 || !seen.Add(id) || records.Contains(kind + "/" + id)) throw Incomplete("完整列表包含重复或跨日期重复记录");
                Record(kind + "/" + id);
            }
        }

        private void Record(string id)
        {
            records.Add(id);
            if (records.Count > limits.MaxRows) throw Incomplete("记录数量超过完整下载预算");
        }
        private void Account(string name)
        {
            if (string.IsNullOrWhiteSpace(name) || Encoding.UTF8.GetByteCount(name) > 120 || name.Any(char.IsControl))
                throw Incomplete("复盘账号名称无效");
            accounts.Add(name);
        }
        private void Report() => progress?.Report(new(stage, requests, records.Count, bytes, dateCount));

        private static VerifiedIndex VerifyIndex(JsonObject envelope, string expectedScope)
        {
            var index = Object(Data(envelope));
            if (String(index["snapshot_format"]) != "haoduoyu-workbench-snapshot-v2" || String(index["projection"]) != "current" ||
                !Boolean(index["complete"]) || String(index["timezone"]) != "Asia/Shanghai" || String(index["scope_id"]) != expectedScope)
                throw Incomplete("完整索引与当前工作区身份不匹配");
            var manifest = RequiredHash(index, "manifest_hash"); var entities = Array(index["entities"]);
            var dates = Array(index["dates"]); var groups = new SortedDictionary<string, JsonArray>(StringComparer.Ordinal);
            var global = new JsonArray(); var ids = new HashSet<string>(StringComparer.Ordinal); string? previous = null;
            foreach (var value in entities)
            {
                var row = Object(value); var id = String(row["entity_id"]);
                if (id.Length == 0 || !ids.Add(id) || previous is not null && string.CompareOrdinal(previous, id) >= 0)
                    throw Incomplete("完整索引实体重复或顺序无效");
                previous = id; String(row["entity_type"]); String(row["updated_at"]); RequiredHash(row, "content_hash");
                if (row["date"] is null) global.Add(row.DeepClone());
                else
                {
                    var day = Date(row["date"]);
                    if (!groups.TryGetValue(day, out var group)) groups[day] = group = [];
                    group.Add(row.DeepClone());
                }
            }
            var calculated = Hash(new JsonObject { ["snapshot_format"] = "haoduoyu-workbench-snapshot-v2", ["scope_id"] = expectedScope, ["entities"] = entities.DeepClone() });
            var globalHash = Hash(new JsonObject { ["scope_id"] = expectedScope, ["entities"] = global });
            if (manifest != calculated || RequiredHash(index, "index_hash") != manifest || RequiredHash(index, "global_content_hash") != globalHash || dates.Count != groups.Count)
                throw Incomplete("完整索引哈希校验失败");
            var names = new List<string>(); var position = 0;
            foreach (var (day, group) in groups)
            {
                var entry = Object(dates[position++]);
                if (Date(entry["date"]) != day || RequiredHash(entry, "content_hash") != Hash(new JsonObject { ["scope_id"] = expectedScope, ["entities"] = group }))
                    throw Incomplete("完整日期索引哈希校验失败");
                names.Add(day);
            }
            if (!DateTimeOffset.TryParse(String(index["generated_at"]), CultureInfo.InvariantCulture, DateTimeStyles.None, out var generated))
                throw Incomplete("完整索引生成时间无效");
            return new(manifest, globalHash, names.ToArray(), BeijingDay(generated));
        }

        private static string Hash(JsonNode value)
        {
            // Match JSON.stringify(stable(value)), including literal non-BMP Unicode. The .NET
            // encoder may escape surrogate pairs, which is valid JSON but a different source hash.
            var canonical = new StringBuilder(); Canonical(canonical, value);
            return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(canonical.ToString())));
        }
        private static void Canonical(StringBuilder output, JsonNode? value)
        {
            switch (value)
            {
                case null: output.Append("null"); break;
                case JsonObject obj:
                    output.Append('{'); var first = true;
                    foreach (var item in obj.OrderBy(x => x.Key, StringComparer.Ordinal))
                    { if (!first) output.Append(','); first = false; Quote(output, item.Key); output.Append(':'); Canonical(output, item.Value); }
                    output.Append('}'); break;
                case JsonArray array:
                    output.Append('[');
                    for (var i = 0; i < array.Count; i++) { if (i != 0) output.Append(','); Canonical(output, array[i]); }
                    output.Append(']'); break;
                case JsonValue scalar when scalar.TryGetValue<string>(out var text): Quote(output, text); break;
                default: output.Append(value.ToJsonString(JsonOptions)); break;
            }
        }
        private static void Quote(StringBuilder output, string value)
        {
            output.Append('"');
            for (var i = 0; i < value.Length; i++)
            {
                var c = value[i];
                switch (c)
                {
                    case '"': output.Append("\\\""); break;
                    case '\\': output.Append("\\\\"); break;
                    case '\b': output.Append("\\b"); break;
                    case '\f': output.Append("\\f"); break;
                    case '\n': output.Append("\\n"); break;
                    case '\r': output.Append("\\r"); break;
                    case '\t': output.Append("\\t"); break;
                    default:
                        if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])) output.Append(c).Append(value[++i]);
                        else if (c < 32 || char.IsSurrogate(c)) output.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else output.Append(c);
                        break;
                }
            }
            output.Append('"');
        }
        private static void CheckProperties(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Object)
            {
                var names = new HashSet<string>(StringComparer.Ordinal);
                foreach (var field in value.EnumerateObject())
                { if (!names.Add(field.Name)) throw Incomplete("JSON 响应有重复字段"); CheckProperties(field.Value); }
            }
            else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) CheckProperties(item);
        }
        private static string SafeId(JsonObject row, string field, bool uuid = false)
        {
            var id = String(row[field]);
            if (uuid ? !Guid.TryParseExact(id, "D", out _) : id.Length is < 1 or > 160 || id.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_')))
                throw Incomplete("记录标识无效");
            return id;
        }
        private static JsonNode Data(JsonObject envelope) => envelope["data"] ?? throw Incomplete("业务数据缺失");
        private static JsonObject Object(JsonNode? value) => value as JsonObject ?? throw Incomplete("业务对象缺失");
        private static JsonArray Array(JsonNode? value) => value as JsonArray ?? throw Incomplete("完整列表缺失");
        private static string String(JsonNode? value) => value is JsonValue text && text.TryGetValue<string>(out var result) ? result : throw Incomplete("业务文字字段无效");
        private static bool Boolean(JsonNode? value) => value is JsonValue item && item.TryGetValue<bool>(out var result) ? result : throw Incomplete("分页完整性字段无效");
        private static long Integer(JsonNode? value) => value is JsonValue item && item.TryGetValue<long>(out var number) && number is >= 0 and <= 9007199254740991L ? number : throw Incomplete("业务数值或版本无效");
        private static long Revision(JsonNode value) => Integer(Object(value)["read_revision"]);
        private static bool HashValue(string? value) => value is { Length: 64 } && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
        private static string RequiredHash(JsonObject value, string field) => HashValue(String(value[field])) ? String(value[field]) : throw Incomplete("业务哈希字段无效");
        private static string Date(JsonNode? value) => DateOnly.TryParseExact(String(value), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : throw Incomplete("业务日期无效");
        private static string BeijingDay(DateTimeOffset at) => at.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        private static string Number(long value) => value.ToString(CultureInfo.InvariantCulture);
        private static InvalidDataException Incomplete(string reason) => new("完整下载中止：" + reason + "；本机原资料、草稿和待同步队列均未改变。");
        private sealed record VerifiedIndex(string ManifestHash, string GlobalHash, string[] Dates, string ServerDay);
    }
}
