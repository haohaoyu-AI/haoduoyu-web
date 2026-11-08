#!/usr/bin/env python3
"""Copy an explicitly reviewed immutable frontend checkpoint; never edits the shared frontend."""
import hashlib, json, os, pathlib, re, sys
if len(sys.argv) != 4:
    raise SystemExit('Usage: adopt-shared-bundle.py <checkpoint/site> <checkpoint/manifest.json> <reviewed manifest sha256>')
site, source_manifest, pin = pathlib.Path(sys.argv[1]).absolute(), pathlib.Path(sys.argv[2]).absolute(), sys.argv[3]
root = pathlib.Path(__file__).resolve().parent.parent
allowed = {'index.html','app.js','favicon.svg','manifest.webmanifest','tokens.css','style.css','memos.css','glass.css','workbench.css','mobile.css','sw-update.css','offline.css','review.css'}
def no_links(path):
    for p in [path, *path.parents]:
        if p.is_symlink(): raise SystemExit('Rejected linked path: '+str(p))
def read(path):
    no_links(path)
    with path.open('rb') as f:
        if os.fstat(f.fileno()).st_nlink != 1: raise SystemExit('Rejected hardlinked file: '+str(path))
        data=f.read(10*1024*1024+1)
        if len(data)>10*1024*1024: raise SystemExit('Oversized asset')
    return data
if not re.fullmatch('[a-f0-9]{64}', pin): raise SystemExit('Explicit reviewed manifest hash is required')
manifest_bytes = read(source_manifest)
if hashlib.sha256(manifest_bytes).hexdigest() != pin: raise SystemExit('Shared manifest hash mismatch')
m = json.loads(manifest_bytes)
if m.get('networkTransportIncluded') is not False or m.get('originalShell') != '9ee30aaf90e1117f092292da432619cecbc62abd63443b5bd4c8b06d92e9d59a':
    raise SystemExit('Unexpected frontend contract/baseline')
expected = dict(m['unchangedAssets']); expected['app.js'] = m['scriptSha256']
if set(expected) != allowed: raise SystemExit('Asset allowlist mismatch')
no_links(site)
if {p.name for p in site.iterdir()} != allowed: raise SystemExit('Unexpected/missing shared files')
data = {}
for name, sha in expected.items():
    data[name] = read(site/name)
    if not data[name] or hashlib.sha256(data[name]).hexdigest() != sha: raise SystemExit('Shared asset digest mismatch: '+name)
if sum(map(len, data.values()))>50*1024*1024: raise SystemExit('Bundle too large')
bundle = root/'bundle'
if bundle.exists(): raise SystemExit('Refusing to overwrite an existing checkpoint. Review a new isolated copy instead.')
no_links(root)
(bundle/'site').mkdir(parents=True)
for name, value in data.items(): (bundle/'site'/name).write_bytes(value)
host_manifest = {'schemaVersion':1,'bundleId':'original-ui-'+pin[:20], 'entryPoint':'index.html',
    'assets':[{'path':name,'size':len(data[name]),'sha256':expected[name]} for name in sorted(data)]}
(bundle/'host-assets.manifest.json').write_text(json.dumps(host_manifest,ensure_ascii=False,indent=2)+'\n')
(bundle/'source-build-manifest.json').write_bytes(manifest_bytes)
(bundle/'provenance.json').write_text(json.dumps({'sourceManifestSha256':pin,'sourceCheckpoint':str(site),'copyMethod':'byte-for-byte, all file digests verified'},indent=2)+'\n')
print('Adopted shared checkpoint:',host_manifest['bundleId'])
print('Host manifest SHA256:',hashlib.sha256((bundle/'host-assets.manifest.json').read_bytes()).hexdigest())
print('Rebuild Host to embed this manifest. Windows actual execution remains required.')
