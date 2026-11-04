namespace Haoduoyu.Windows;

// Data items let WPF create and recycle only the visible native row containers.
public sealed record WorkspaceListItem(string Title, string Subtitle, Func<Task> Open)
{
    public IReadOnlyDictionary<string, string> LedgerCells { get; init; } = new Dictionary<string, string>();
    public string LedgerGroup { get; init; } = "";
}
