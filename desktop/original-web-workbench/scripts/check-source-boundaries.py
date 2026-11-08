#!/usr/bin/env python3
"""Static regression checks only. Not evidence of Windows execution or no-egress."""
import pathlib, re
root=pathlib.Path(__file__).resolve().parent.parent
host=(root/'src/Host/OriginalUiWindow.cs').read_text()
app=(root/'src/Host/App.xaml.cs').read_text()
policy=(root/'src/HostPolicy/RequestPolicy.cs').read_text()
checks={
'no filesystem virtual mapping': 'SetVirtualHostNameToFolderMapping' not in host,
'all source kinds intercepted': 'CoreWebView2WebResourceRequestSourceKinds.All' in host,
'default request denial': 'else { BlockedRequests++; args.Response = Denied(environment); }' in host,
'host objects disabled': 'settings.AreHostObjectsAllowed = false' in host,
'web messages disabled': 'settings.IsWebMessageEnabled = false' in host,
'download unconditional cancellation': 'args.Cancel = true; args.Handled = true; BlockedDownloads++;' in host,
'no selected destination download': 'ResultFilePath' not in host and 'SaveFileDialog' not in host,
'no direct launch or native bridge': not any(v in host+app for v in ['Process.Start(', 'AddHostObjectToScript(', 'WebMessageReceived +=']),
'no profile clearing': not any(v in host+app for v in ['ClearBrowsingData', 'Directory.Delete(', 'File.Delete(', 'DeleteProfile(']),
'no runtime installer': not any(v in host+app for v in ['WebView2Setup', 'Bootstrapper', 'DownloadFile']),
'unified bounded close deadline': 'new CancellationTokenSource(TimeSpan.FromSeconds(10))' in host and host.count('WaitAsync(deadline.Token)') == 2,
'failed close resumes same token': 'haoduoyuLocalLifecycle?.resume' in host,
'only completed close permits': 'if (value == "complete") { closeAuthorized = true; Close(); return; }' in host,
'no remote network CSP': "connect-src 'none'" in policy and "worker-src 'none'" in policy,
'compile-pinned manifest': 'GetManifestResourceStream("HostAssetManifest")' in app,
'no production URL': not re.search(r'https://(?!(?:haoduoyu\.original-ui\.invalid|developer\.microsoft\.com))',host+app+policy),
}
for name, ok in checks.items():
    print(('PASS ' if ok else 'FAIL ')+name)
if not all(checks.values()): raise SystemExit(1)
print('PASS static boundary assertions='+str(len(checks)))
