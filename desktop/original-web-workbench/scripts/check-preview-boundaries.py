#!/usr/bin/env python3
"""Static regression assertions only; not a proof of complete file or OS isolation."""
from pathlib import Path
root=Path(__file__).resolve().parent.parent
policy=(root/'src/HostPolicy/BackupPreview.cs').read_text()
window=(root/'src/Host/BackupPreviewWindow.cs').read_text()
both=policy+window
checks={
 'read-only handle': 'FileMode.Open, FileAccess.Read, FileShare.Read' in policy,
 'bounded bytes rows depth': all(x in policy for x in ['MaxBytes = 20 * 1024 * 1024','MaxRows = 100000','MaxDepth = 16']),
 'no file mutations': not any(x in both for x in ['File.Write','File.Delete','File.Move','File.Copy','Directory.Create','Directory.Delete','FileMode.Create','FileMode.OpenOrCreate','FileAccess.Write']),
 'no database operations': not any(x in both for x in ['IndexedDB','SqliteConnection','IDBDatabase','PrepareProfile(','db.transaction','restoreIntoEmptyDatabase']),
 'no web or native bridge': not any(x in both for x in ['ExecuteScript','AddHostObject','WebMessage','WebView2','InnerHtml','Process.Start','HttpClient','WebRequest','Socket(']),
 'exact supported contract': 'SupportedFormat = "haoduoyu-matrix-d1-v9"' in policy and 'Exact(tables, Columns.Keys.ToArray())' in policy,
 'summary cannot grant import': 'public bool CanImport => false' in policy,
 'sensitive table exclusion': all('"'+name+'"' in policy.split('private static readonly HashSet<string> Excluded',1)[1].split(';',1)[0] for name in ['users','api_keys','audit','idempotency']),
 'no raw error presentation': 'catch {' in window and 'ex.Message' not in window and 'ex.ToString' not in window,
 'native selected local path only': 'new OpenFileDialog' in window and 'picker.FileName' in window,
 'cancelled read guarded': 'cancellation.IsCancellationRequested' in window and 'catch (OperationCanceledException)' in window,
 'link checks on open handle': 'FileLinkCount.RequireSingleLink(input.SafeFileHandle)' in policy,
 'remote path guard precedes filesystem probe': policy.index('path.StartsWith("\\\\\\\\"') < policy.index('FileSystemTrust.RejectLinksInExistingPath(fullPath)') and 'new DriveInfo(root).DriveType' in policy,
 'no dialog recent-item addition': 'AddToRecent=false' in window,
 'no source record DTO': 'JsonElement' not in policy.split('public sealed record BackupPreviewResult',1)[1].split('/// <summary>',1)[0],
}
for name,ok in checks.items(): print(('PASS ' if ok else 'FAIL ')+name)
if not all(checks.values()):raise SystemExit(1)
print('PASS preview static assertions='+str(len(checks)))
