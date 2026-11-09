namespace Haoduoyu.OriginalUi.Policy;

/// <summary>All values are device-independent pixels, like WPF's WorkArea and Window bounds.</summary>
public readonly record struct StartupWindowBounds(double Left, double Top, double Width, double Height,
    double MinWidth, double MinHeight)
{
    public static StartupWindowBounds Fit(double left, double top, double width, double height)
    {
        if (!double.IsFinite(left) || !double.IsFinite(top) || !double.IsFinite(width) || !double.IsFinite(height)
            || width <= 0 || height <= 0)
            throw new ArgumentOutOfRangeException(nameof(width), "A finite, positive desktop work area is required.");
        // A fixed 1280 x 850 DIP window can place its caption off-screen on a
        // smaller or scaled desktop. Leave visible space around the entire frame.
        var inset = Math.Min(24, Math.Min(width, height) / 20);
        var fittedWidth = Math.Min(1280, width - 2 * inset);
        var fittedHeight = Math.Min(850, height - 2 * inset);
        return new(left + (width - fittedWidth) / 2, top + (height - fittedHeight) / 2,
            fittedWidth, fittedHeight, Math.Min(400, fittedWidth), Math.Min(420, fittedHeight));
    }
}
