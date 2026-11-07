using System.Globalization;
using System.Text.Json.Nodes;

namespace Haoduoyu.Core;

/// <summary>Known local rows and the server's last copied count are different observations.</summary>
public sealed class MemoGroupCounts
{
    public long? LocalKnown { get; }
    public long? ServerCopy { get; }
    private MemoGroupCounts(long? localKnown, long? serverCopy) { LocalKnown = localKnown; ServerCopy = serverCopy; }
    public static MemoGroupCounts Read(JsonObject group)
    {
        ArgumentNullException.ThrowIfNull(group);
        return new(Count(group["_local_active_note_count"]), Count(group["active_note_count"]));
    }

    public string Description => "本机已知活动数 " + Show(LocalKnown) + " · 服务端副本活动数 " + Show(ServerCopy);

    public long RequireServerDeleteCount() => ServerCopy ?? throw new InvalidOperationException(
        "此分组缺少可核实的服务端活动笔记数。请连接原工作区刷新后再确认删除；不会用本机已知数或猜测的0代替。原稿和队列保留。");

    private static string Show(long? value) => value is { } count ? count.ToString(CultureInfo.InvariantCulture) + " 篇" : "未取得";
    private static long? Count(JsonNode? node)
    {
        if (node is not JsonValue value) return null;
        long count;
        if (!value.TryGetValue<long>(out count))
        {
            if (!value.TryGetValue<int>(out var small)) return null;
            count = small;
        }
        return count is >= 0 and <= 9_007_199_254_740_991L ? count : null;
    }
}
