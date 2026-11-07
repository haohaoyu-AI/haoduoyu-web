using Haoduoyu.Core;

namespace Haoduoyu.Api;

/// <summary>Checks an original complete month response before replacing a cache entry.</summary>
public static class NoteHistoryResponse
{
    public static void Validate(string path, string envelopeJson, string? expectedScope = null)
    {
        RoutePolicy.Validate("GET", path, allowAuthWrite: false);
        var parts = path.Split('?', 2);
        if (parts[0] != "/api/v1/note-entries/month" || parts.Length != 2)
            throw new ArgumentException("完整月读取需要已确认的月份路由。", nameof(path));
        var query = parts[1].Split('&').Select(part => part.Split('=', 2)).ToArray();
        if (query.Length != 1 || query[0].Length != 2 || query[0][0] != "month")
            throw new ArgumentException("完整月读取只接受月份参数。", nameof(path));
        var month = Uri.UnescapeDataString(query[0][1].Replace('+', ' '));
        NoteHistory.ValidateSource(envelopeJson, month, expectedScope);
    }
}
