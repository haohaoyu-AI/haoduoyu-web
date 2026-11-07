namespace Haoduoyu.Core;

/// <summary>Observes calendar changes only. It never changes a selected date or performs work.</summary>
public sealed class BeijingDayTracker(DateTimeOffset initialInstant)
{
    public DateOnly CurrentDay { get; private set; } = DateAt(initialInstant);

    public static DateOnly DateAt(DateTimeOffset instant) =>
        DateOnly.FromDateTime(instant.ToOffset(TimeSpan.FromHours(8)).DateTime);

    public bool Observe(DateTimeOffset instant)
    {
        var day = DateAt(instant);
        if (day == CurrentDay) return false;
        CurrentDay = day;
        return true;
    }
}
