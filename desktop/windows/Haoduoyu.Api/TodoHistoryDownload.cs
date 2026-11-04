using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

namespace Haoduoyu.Api;

public sealed record TodoHistoryDownloadLimits(int MaxWireBytes = 8 * 1024 * 1024,
    int MaxCacheBytes = 12 * 1024 * 1024, int MaxRows = 5000);
public sealed record TodoHistoryDownloadResult(string ScopeId, TodoHistoryRange Range, string BatchId,
    long ReadRevision, DateTimeOffset ObservedAtUtc, IReadOnlyDictionary<string, string> CacheEntries,
    int Dates, int Rows, long WireBytes, long CacheBytes);

/// <summary>Read-only bounded range capture. Returns one complete batch; never holds or modifies an engine/store.</summary>
public sealed class TodoHistoryDownload(IRemoteApi api, TodoHistoryDownloadLimits? limits = null,
    Func<DateTimeOffset>? clock = null)
{
    private static readonly UTF8Encoding Utf8 = new(false, true);
    private static readonly JsonSerializerOptions CacheJson = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private const long MaxSafe = 9_007_199_254_740_991;

    public async Task<TodoHistoryDownloadResult> FetchAsync(string expectedServerScope, TodoHistoryRange range,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(api); ArgumentNullException.ThrowIfNull(range);
        if (!Hash(expectedServerScope)) throw new ArgumentException("缺少已核对的服务工作区身份。", nameof(expectedServerScope));
        var budget = limits ?? new();
        if (budget.MaxWireBytes is < 1 or > 8 * 1024 * 1024 || budget.MaxCacheBytes is < 1 or > 12 * 1024 * 1024 ||
            budget.MaxRows is < 1 or > 5000) throw new ArgumentOutOfRangeException(nameof(limits), "历史读取预算只能在安全上限内设置。");
        var dates = range.Dates.ToArray();
        if (dates.Length is < 1 or > 31 || dates[0] != range.Start || dates[^1] != range.End ||
            dates.Length != range.End.DayNumber - range.Start.DayNumber + 1 ||
            dates.Where((day, index) => day.DayNumber != range.Start.DayNumber + index).Any())
            throw new ArgumentException("历史范围必须是最多31天的连续真实日期。", nameof(range));
        var now = clock ?? (() => DateTimeOffset.UtcNow);
        var beganDay = TodoHistory.BeijingToday(now());
        long wireBytes = 0; long cacheBytes = 0; var rows = 0;
        var staged = new Dictionary<string, string>(StringComparer.Ordinal);
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        TodoHistoryDay? first = null;

        async Task<ApiResult> Get(string path)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await api.SendAsync("GET", path, null, "", cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            if (result.StatusCode != 200) throw new ApiCallException("历史范围读取中止，原缓存保留（HTTP " + result.StatusCode + "）。", result.StatusCode, result.RequestId);
            var size = Utf8.GetByteCount(result.Json);
            wireBytes = checked(wireBytes + size);
            if (size > WorkbenchApi.MaximumResponseBytes || wireBytes > budget.MaxWireBytes)
                throw Incomplete("读取响应超过历史范围预算");
            return result;
        }
        async Task CheckScope()
        {
            var result = await Get("/api/v1/workbench-snapshot/index?version=2"); var data = Data(result.Json);
            if (data["complete"] is not JsonValue complete || !complete.TryGetValue<bool>(out var isComplete) || !isComplete || data["scope_id"] is not JsonValue value ||
                !value.TryGetValue<string>(out var scope) || !Hash(scope) || scope != expectedServerScope)
                throw new ScopeGuardException("历史读取期间服务工作区身份已变化；本批资料未写入本机。");
        }
        static long Revision(string json)
        {
            var data = Data(json);
            if (data["items"] is not JsonArray || data["has_more"] is not JsonValue more || !more.TryGetValue<bool>(out _) ||
                data["read_revision"] is not JsonValue value) throw Incomplete("全局读取修订不完整");
            long revision;
            if (!value.TryGetValue<long>(out revision)) { if (!value.TryGetValue<int>(out var integer)) throw Incomplete("全局读取修订无效"); revision = integer; }
            if (revision < 0 || revision > MaxSafe) throw Incomplete("全局读取修订无效");
            return revision;
        }

        await CheckScope();
        var revision = Revision((await Get("/api/v1/review/articles?offset=0")).Json);
        foreach (var date in dates)
        {
            var path = "/api/v1/todos?date=" + date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var result = await Get(path); var day = TodoHistory.ParseDay(result.Json, date);
            if (first is null) first = day;
            else if (day.Today != first.Today || day.CompletedMode != first.CompletedMode || day.PreferencesVersion != first.PreferencesVersion)
                throw Incomplete("日期或完成显示偏好在历史读取期间发生变化");
            rows = checked(rows + day.Items.Count);
            if (rows > budget.MaxRows) throw Incomplete("历史范围记录数超过预算");
            foreach (var item in day.Items)
                if (!ids.Add(item["id"]!.GetValue<string>())) throw Incomplete("历史范围出现跨日期重复待办标识");
            staged.Add(path, result.Json);
        }
        var barrier = await Get("/api/v1/review/articles?offset=0&read_revision=" + revision.ToString(CultureInfo.InvariantCulture));
        if (Revision(barrier.Json) != revision) throw Incomplete("历史读取期间业务资料已变化");
        await CheckScope();
        var observed = now().ToUniversalTime();
        if (TodoHistory.BeijingToday(observed) != beganDay) throw Incomplete("历史读取跨过北京时间午夜，请重新读取");
        var batchId = Guid.NewGuid().ToString("D");
        var cache = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (path, raw) in staged)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var envelope = JsonNode.Parse(raw)!.AsObject();
            envelope["_local_todo_history"] = new JsonObject
            {
                ["scope_id"] = expectedServerScope, ["batch_id"] = batchId,
                ["range_start"] = range.Start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["range_end"] = range.End.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ["read_revision"] = revision, ["observed_at_utc"] = observed.ToString("O", CultureInfo.InvariantCulture)
            };
            var encoded = envelope.ToJsonString(CacheJson);
            if (Utf8.GetByteCount(encoded) > TodoHistory.MaximumDayCacheBytes) throw Incomplete("历史日期缓存超过单日安全上限");
            cacheBytes = checked(cacheBytes + Utf8.GetByteCount(path) + Utf8.GetByteCount(encoded));
            if (cacheBytes > budget.MaxCacheBytes) throw Incomplete("历史范围缓存超过预算");
            cache.Add(path, encoded);
        }
        cancellationToken.ThrowIfCancellationRequested();
        if (TodoHistory.BeijingToday(now()) != beganDay) throw Incomplete("历史读取跨过北京时间午夜，请重新读取");
        return new(expectedServerScope, range, batchId, revision, observed,
            new ReadOnlyDictionary<string, string>(cache), dates.Length, rows, wireBytes, cacheBytes);
    }

    private static JsonObject Data(string json)
    {
        try { return JsonNode.Parse(json)?["data"] as JsonObject ?? throw Incomplete("读取响应缺少完整业务对象"); }
        catch (Exception error) when (error is JsonException or InvalidOperationException or ArgumentException)
        { throw new InvalidDataException("历史读取响应损坏；原缓存保留。", error); }
    }
    private static bool Hash(string? value) => value is { Length: 64 } && value.All(char.IsAsciiHexDigitLower);
    private static InvalidDataException Incomplete(string reason) => new(reason + "，本批历史未写入；原缓存与本机请求保留。");
}
