using Haoduoyu.Core;

internal static class BeijingDayChecks
{
    internal static int Run()
    {
        var tests = new (string Name, Action Run)[]
        {
            ("Beijing day switches at UTC 16:00 rather than UTC or machine-local midnight", () =>
            {
                var watch = New("2026-11-07T15:59:59.9999999Z");
                Check(watch.CurrentDay == new DateOnly(2026, 11, 7));
                Check(watch.Observe(At("2026-11-07T16:00:00Z")) && watch.CurrentDay == new DateOnly(2026, 11, 8));
                Check(!watch.Observe(At("2026-11-07T23:59:59Z")));
            }),
            ("Equivalent instants with different UTC offsets share one Beijing date", () =>
            {
                var watch = New("2026-11-07T16:00:00Z");
                Check(!watch.Observe(At("2026-11-08T00:00:00+08:00")));
                Check(!watch.Observe(At("2026-11-07T08:00:00-08:00")));
                Check(!watch.Observe(At("2026-11-08T05:00:00+13:00")));
            }),
            ("Resume after several days observes the latest date once without replaying missed days", () =>
            {
                var watch = New("2026-11-07T15:00:00Z");
                Check(watch.Observe(At("2026-11-12T01:00:00Z")) && watch.CurrentDay == new DateOnly(2026, 11, 12));
                Check(!watch.Observe(At("2026-11-12T07:00:00Z")));
            }),
            ("Clock correction backwards is detected once and does not stay stuck in the future", () =>
            {
                var watch = New("2026-11-09T00:00:00Z");
                Check(watch.Observe(At("2026-11-07T20:00:00Z")) && watch.CurrentDay == new DateOnly(2026, 11, 8));
                Check(!watch.Observe(At("2026-11-07T21:00:00Z")));
                Check(watch.Observe(At("2026-11-08T16:00:00Z")));
            }),
            ("Beijing date observes month year and leap-day boundaries", () =>
            {
                foreach (var (before, after, date) in new[]
                {
                    ("2026-12-31T15:59:59Z", "2026-12-31T16:00:00Z", new DateOnly(2027, 1, 1)),
                    ("2028-02-28T15:59:59Z", "2028-02-28T16:00:00Z", new DateOnly(2028, 2, 29)),
                    ("2028-02-29T15:59:59Z", "2028-02-29T16:00:00Z", new DateOnly(2028, 3, 1))
                })
                { var watch = New(before); Check(watch.Observe(At(after)) && watch.CurrentDay == date); }
            }),
            ("Independent windows observe dates separately without static shared state", () =>
            {
                var first = New("2026-11-07T15:59:59Z"); var second = New("2026-11-07T15:59:59Z");
                Check(first.Observe(At("2026-11-07T16:00:00Z")));
                Check(second.CurrentDay == new DateOnly(2026, 11, 7));
                Check(second.Observe(At("2026-11-07T16:00:00Z")));
            })
        };
        var failures = 0;
        foreach (var (name, run) in tests)
            try { run(); Console.WriteLine("PASS " + name); }
            catch (Exception error) { failures++; Console.Error.WriteLine("FAIL " + name + ": " + error); }
        Console.WriteLine($"Beijing day checks: {tests.Length - failures}/{tests.Length} passed");
        return failures;
    }

    private static DateTimeOffset At(string value) => DateTimeOffset.Parse(value, System.Globalization.CultureInfo.InvariantCulture);
    private static BeijingDayTracker New(string value) => new(At(value));
    private static void Check(bool condition) { if (!condition) throw new Exception("Beijing date observation mismatch"); }
}
