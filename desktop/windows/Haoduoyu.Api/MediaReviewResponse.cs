using Haoduoyu.Core;

namespace Haoduoyu.Api;

/// <summary>Checks original read-only media responses before replacing their exact-query cache.</summary>
public static class MediaReviewResponse
{
    public static void Validate(string path, string envelopeJson, string? expectedScope = null)
    {
        RoutePolicy.Validate("GET", path, allowAuthWrite: false);
        MediaReview.ValidateSource(path, envelopeJson, expectedScope);
    }
}
