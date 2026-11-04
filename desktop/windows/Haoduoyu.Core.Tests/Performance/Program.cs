using System.Diagnostics;
using System.Runtime;
using System.Reflection;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Haoduoyu.Core;

var relaxed = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
var reports = new List<object>();
var repositoryRoot = FindRepository();
foreach (var setup in new[] { (Name:"12k_ascii_medium", Chars:500, Cjk:false), (Name:"12k_ascii_near_download_limit", Chars:1600, Cjk:false), (Name:"12k_cjk_near_download_limit", Chars:533, Cjk:true) })
{
    Console.WriteLine("START " + setup.Name);
    var state = Build(setup.Chars, setup.Cjk);
    var rawBytes = state.Cache.Sum(pair => (long)Encoding.UTF8.GetByteCount(pair.Value));
    var serializedBytes = JsonSerializer.SerializeToUtf8Bytes(state, ActualOptions()).LongLength;
    var engine = new SyncEngine(new MemoryStore(state), new NoNetwork());
    await engine.InitializeAsync();
    const string path = "/api/v1/todos?date=2026-11-04";
    var measurements = new Dictionary<string, object>();
    measurements["snapshot"] = Measure(() => engine.Snapshot);
    measurements["structural_copy_reference"] = Measure(() => StructuralCopy(state));
    measurements["project_todo_only"] = Measure(() => WorkspaceProjection.Project(path, state.Cache[path], state));
    measurements["project_review_page_only"] = Measure(() => WorkspaceProjection.Project("/api/v1/review/articles?account=A&offset=0", null, state));
    measurements["legacy_ui_two_snapshots_and_todo_project"] = Measure(() =>
    {
        var cached = engine.Snapshot.Cache.GetValueOrDefault(path);
        var projected = WorkspaceProjection.Project(path, cached, engine.Snapshot);
        return JsonNode.Parse(projected!)!["data"];
    });
    measurements["single_snapshot_todo_projection_worker_wall"] = Measure(() => Task.Run(() =>
    {
        var snapshot = engine.Snapshot;
        var projected = WorkspaceProjection.Project(path, snapshot.Cache.GetValueOrDefault(path), snapshot);
        return JsonNode.Parse(projected!)!["data"];
    }).GetAwaiter().GetResult());
    var storageProbe = ProbeStorage(state);
    var row = new { scenario=setup.Name, row_count=14_620, cache_keys=state.Cache.Count, raw_cache_utf8_bytes=rawBytes,
        serialized_workspace_utf8_bytes=serializedBytes, under_24MiB_download_limit=rawBytes<=24L*1024*1024,
        measurements, storage_probe=storageProbe };
    reports.Add(row); Console.WriteLine(JsonSerializer.Serialize(row));
}
var result = new { kind="synthetic-performance-observation", timestamp_utc=DateTimeOffset.UtcNow,
    runtime=Environment.Version.ToString(), os=System.Runtime.InteropServices.RuntimeInformation.OSDescription,
    processors=Environment.ProcessorCount, server_gc=GCSettings.IsServerGC, samples=3,
    implementation="Product structural snapshots and compact local encrypted JSON; projection algorithm unchanged",
    source_files_sha256 = new[] { "Models.cs", "AtomicWorkspaceStore.cs", "WorkspaceProjection.cs" }.ToDictionary(name => name,
        name => Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(File.ReadAllBytes(Path.Combine(repositoryRoot,"desktop/windows/Haoduoyu.Core",name))))),
    limitations=new[] { "Linux cloud CPU and GC observations; not a Windows device or interactive UI test", "Synthetic 12000 review articles plus many date/detail caches; no production data or network", "Legacy two-snapshot measurements reproduce the former call pattern, not the current asynchronous UI", "Single-worker wall time includes awaiting a worker in this console and does not measure WPF responsiveness", "Measurements are observations, not pass/fail tests" }, results=reports };
var target = args.Length > 0 ? Path.GetFullPath(args[0]) : Path.Combine(Path.GetTempPath(), "haoduoyu-core-perf-"+DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmss")+".json");
Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.WriteAllText(target, JsonSerializer.Serialize(result,new JsonSerializerOptions { WriteIndented=true }));
Console.WriteLine("REPORT " + target);

WorkspaceState Build(int chars, bool cjk)
{
    var state = new WorkspaceState { ScopeId="synthetic-performance", LocalRevision=1 };
    var payload = new string(cjk ? '鱼' : 'x', chars);
    var rows = Enumerable.Range(0,12_000).Select(index => new JsonObject
    {
        ["id"]=GuidFrom(index), ["account"]=index%2==0?"A":"B", ["title"]="合成文章 "+index,
        ["published_at"]="2026-11-03T12:00:00Z", ["content_hash"]=new string('a',64), ["notes"]=payload
    }).ToArray();
    Put("/api/v1/review/articles", new JsonObject { ["_local_complete"]=true, ["data"]=new JsonObject { ["items"]=new JsonArray(rows.Select(row=>(JsonNode?)row).ToArray()), ["has_more"]=false, ["read_revision"]=1 } });
    for (var index=0;index<120;index++) Put("/api/v1/review/articles/"+GuidFrom(index), new JsonObject { ["data"]=rows[index].DeepClone() });
    for (var day=0;day<30;day++)
    {
        var date=new DateOnly(2026,11,4).AddDays(-day).ToString("yyyy-MM-dd");
        var todos=Enumerable.Range(0,50).Select(index=>(JsonNode?)new JsonObject { ["id"]=GuidFrom(20_000+day*50+index), ["date"]=date, ["text"]="合成待办 "+index, ["version"]=3, ["completed"]=false }).ToArray();
        Put("/api/v1/todos?date="+date, new JsonObject { ["data"]=new JsonObject { ["date"]=date, ["today"]="2026-11-04", ["items"]=new JsonArray(todos), ["completed_mode"]="strike", ["preferences_version"]=1 } });
    }
    for(var day=0;day<20;day++)
    {
        var date=new DateOnly(2026,11,4).AddDays(-day).ToString("yyyy-MM-dd");
        var notes=Enumerable.Range(0,50).Select(index=>(JsonNode?)new JsonObject { ["id"]=GuidFrom(30_000+day*50+index), ["date"]=date, ["category"]="work", ["text"]="合成笔记\n"+new string('鱼',128), ["version"]=4, ["content_hash"]=new string('b',64) }).ToArray();
        Put("/api/v1/note-entries?date="+date+"&category=work",new JsonObject { ["data"]=new JsonObject { ["date"]=date,["category"]="work",["entries"]=new JsonArray(notes) } });
    }
    for(var index=0;index<25;index++) state.Drafts["draft"+index]=new LocalDraft { Key="draft"+index,Text="纯合成本机草稿"+payload,BaseVersion=3 };
    return state;
    void Put(string key,JsonObject value) { state.Cache[key]=value.ToJsonString(relaxed);state.CacheRevisions[key]=1; }
}
static string GuidFrom(int number) => "00000000-0000-4000-8000-"+number.ToString("000000000000");
static string FindRepository()
{
    for(var directory=new DirectoryInfo(AppContext.BaseDirectory);directory!=null;directory=directory.Parent)
        if(File.Exists(Path.Combine(directory.FullName,"desktop/windows/Haoduoyu.Core/Models.cs")))return directory.FullName;
    throw new InvalidOperationException("Run this project from its repository checkout");
}
static JsonSerializerOptions ActualOptions() => (JsonSerializerOptions)(typeof(SyncEngine).Assembly.GetType("Haoduoyu.Core.WorkspaceJson")!
    .GetField("Options",BindingFlags.Static|BindingFlags.NonPublic)!.GetValue(null)!);
static WorkspaceState StructuralCopy(WorkspaceState source) => source with
{
    Cache=new(source.Cache,StringComparer.Ordinal), CacheRevisions=new(source.CacheRevisions,StringComparer.Ordinal),
    Drafts=new(source.Drafts,StringComparer.Ordinal), Outbox=source.Outbox.Select(operation=>operation with { DependencyIds=operation.DependencyIds.ToArray() }).ToList()
};
static object Measure(Func<object?> action)
{
    GC.KeepAlive(action()); // Warm code and serializers for a repeatable steady-state observation.
    var times=new List<double>(); var allocations=new List<long>(); var gen2=new List<int>();
    for(var sample=0;sample<3;sample++)
    {
        GC.Collect();GC.WaitForPendingFinalizers();GC.Collect();
        var allocated=GC.GetTotalAllocatedBytes(true);var before2=GC.CollectionCount(2);var watch=Stopwatch.StartNew();
        var value=action();watch.Stop();GC.KeepAlive(value);
        times.Add(watch.Elapsed.TotalMilliseconds);allocations.Add(GC.GetTotalAllocatedBytes(true)-allocated);gen2.Add(GC.CollectionCount(2)-before2);
    }
    return new { min_ms=times.Min(),median_ms=times.Order().ElementAt(1),max_ms=times.Max(),median_allocated_bytes=allocations.Order().ElementAt(1), max_gen2_collections=gen2.Max() };
}
static object ProbeStorage(WorkspaceState state)
{
    var root=Path.Combine(Path.GetTempPath(),"haoduoyu-perf-storage-"+Guid.NewGuid().ToString("N"));
    var protector=new ProbeProtector();
    try
    {
        using var store=new AtomicWorkspaceStore(root,"https://haoduoyu.xyz","synthetic-perf",protector);
        var value=state with { ScopeId=store.ScopeId };
        var serialized=JsonSerializer.SerializeToUtf8Bytes(value, ActualOptions()).LongLength;
        // Keep the successful path metadata-only: this probe specifically verifies the actual product rejection before protection/file write.
        if(serialized<=32L*1024*1024) return new { serialized_bytes=serialized, outcome="fits_product_32MiB_plaintext_check; write_not_attempted", protector_calls=0 };
        try { store.SaveAsync(value).GetAwaiter().GetResult();return new { serialized_bytes=serialized,outcome="unexpected_success",protector_calls=protector.Calls }; }
        catch(InvalidDataException) { return new { serialized_bytes=serialized,outcome="rejected_by_actual_product_size_check_before_ciphertext_write",protector_calls=protector.Calls }; }
    }
    finally { if(Directory.Exists(root))Directory.Delete(root,true); }
}
sealed class MemoryStore(WorkspaceState value):IWorkspaceStore
{
    public string ScopeId=>value.ScopeId;
    public Task<WorkspaceState> LoadAsync(CancellationToken cancellationToken=default)=>Task.FromResult(value);
    public Task SaveAsync(WorkspaceState state,CancellationToken cancellationToken=default)=>throw new InvalidOperationException("Benchmark does not mutate state");
}
sealed class NoNetwork:IRemoteApi
{
    public Task<ApiResult> SendAsync(string method,string path,string? body,string operation,CancellationToken cancellationToken=default)=>throw new InvalidOperationException("Benchmark forbids network");
}
sealed class ProbeProtector:IStateProtector
{
    public int Calls;
    public byte[] Protect(byte[] data){Calls++;throw new InvalidOperationException("Oversized size probe must fail before protection");}
    public byte[] Unprotect(byte[] data)=>throw new NotSupportedException();
}
