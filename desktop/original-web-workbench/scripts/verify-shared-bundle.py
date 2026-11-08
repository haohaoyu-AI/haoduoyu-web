#!/usr/bin/env python3
"""Read-only verification of adopted immutable bytes, on any platform."""
import hashlib, json, pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 2 or not re.fullmatch('[a-f0-9]{64}', sys.argv[1]):
    raise SystemExit('Usage: verify-shared-bundle.py <explicit reviewed source-manifest sha256>')
pin = sys.argv[1]
def read(p):
    for parent in [p, *p.parents]:
        if parent.is_symlink(): raise SystemExit('Linked path rejected: '+str(parent))
    if p.stat().st_nlink != 1: raise SystemExit('Hardlink rejected: '+str(p))
    return p.read_bytes()
def unique(pairs):
    result={}
    for k,v in pairs:
        if k in result: raise SystemExit('Duplicate manifest member: '+k)
        result[k]=v
    return result
bundle=root/'bundle'
source=read(bundle/'source-build-manifest.json')
assert hashlib.sha256(source).hexdigest()==pin, 'Source manifest pin differs'
m=json.loads(source, object_pairs_hook=unique)
assert m['networkTransportIncluded'] is False
assert m['originalShell']=='9ee30aaf90e1117f092292da432619cecbc62abd63443b5bd4c8b06d92e9d59a'
expected=dict(m['unchangedAssets']); expected['app.js']=m['scriptSha256']
host=json.loads(read(bundle/'host-assets.manifest.json'), object_pairs_hook=unique)
assert host['schemaVersion']==1 and host['entryPoint']=='index.html'
assert host['bundleId']=='original-ui-'+pin[:20]
assert {a['path'] for a in host['assets']}==set(expected)
assert len(host['assets'])==len(expected)==13
assert {p.name for p in (bundle/'site').iterdir()}==set(expected)
for a in host['assets']:
    value=read(bundle/'site'/a['path'])
    assert len(value)==a['size'] and hashlib.sha256(value).hexdigest()==a['sha256']==expected[a['path']], a['path']
assert json.loads(read(bundle/'provenance.json'))['sourceManifestSha256']==pin
print('PASS 13 shared assets byte-exact, source pin and embedded-host input match:',host['bundleId'])
print('Lifecycle implementation semantics and actual Windows execution require separate tests; this verifies only bytes.')
