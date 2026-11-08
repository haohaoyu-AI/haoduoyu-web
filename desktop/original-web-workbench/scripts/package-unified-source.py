#!/usr/bin/env python3
"""LOCAL ONLY: map reviewed shared export + host scope + independent workflow for approval."""
import hashlib, json, pathlib, re, sys, zipfile
if len(sys.argv)!=4 or not re.fullmatch('[a-f0-9]{64}',sys.argv[3]):
    raise SystemExit('Usage: package-unified-source.py <reviewed-shared-export> <reviewed-shared-scope.json> <scope-sha256>')
root=pathlib.Path(__file__).resolve().parent.parent
shared=pathlib.Path(sys.argv[1]).resolve(); scope_path=pathlib.Path(sys.argv[2]).resolve(); pin=sys.argv[3]
def read(p):
    for x in [p,*p.parents]:
        if x.is_symlink(): raise SystemExit('Linked source path rejected: '+str(p))
    if p.stat().st_nlink!=1: raise SystemExit('Hardlinked source rejected: '+str(p))
    return p.read_bytes()
def sha(b):return hashlib.sha256(b).hexdigest()
raw=read(scope_path)
if sha(raw)!=pin: raise SystemExit('Reviewed shared-scope hash mismatch')
s=json.loads(raw); host=json.loads(read(root/'artifacts/windows-original-ui-acceptance-SOURCE-SCOPE.json'))
if s['file_count']!=173 or len(s['files'])!=173: raise SystemExit('Unexpected reviewed shared scope count')
items={};files={}
def add(name,value,group):
    if name in items or name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts: raise SystemExit('Duplicate/unsafe target: '+name)
    items[name]=value;files[name]={'bytes':len(value),'sha256':sha(value),'group':group}
seen=set()
for f in s['files']:
    n=f['path']
    if not n.startswith('local-ui/') or n in seen or '..' in pathlib.PurePosixPath(n).parts: raise SystemExit('Unsafe shared path')
    seen.add(n); b=read(shared/n)
    if len(b)!=f['bytes'] or sha(b)!=f['sha256']: raise SystemExit('Shared byte mismatch: '+n)
    add(n,b,'sharedRebuildSource')
if {p.relative_to(shared).as_posix() for p in shared.rglob('*') if p.is_file()}!=seen: raise SystemExit('Extra/missing files in reviewed shared export')
proposal='staging/windows-acceptance/windows-acceptance.workflow.yml.disabled'
for n,f in host['files'].items():
    b=read(root/n)
    if len(b)!=f['size'] or sha(b)!=f['sha256']: raise SystemExit('Host scope stale; rerun package-source.py: '+n)
    if n==proposal: continue # activated only at the explicitly enumerated independent workflow path
    group='sharedBuiltSite' if n.startswith('bundle/site/') else 'sharedBundleMetadata' if n.startswith('bundle/') else 'hostSource'
    add('desktop/original-web-workbench/'+n,b,group)
add('.github/workflows/windows-original-interface-acceptance.yml',read(root/proposal),'independentWorkflow')
files=dict(sorted(files.items())); tree_sha=sha(json.dumps(files,sort_keys=True,separators=(',',':')).encode())
base=root/'artifacts'; name='phase2b-'+tree_sha[:16]; candidate=base/('unified-candidate-'+name)
if candidate.exists():
    if {p.relative_to(candidate).as_posix() for p in candidate.rglob('*') if p.is_file()}!=set(items): raise SystemExit('Existing candidate differs; refusing overwrite')
    for n,b in items.items():
        if read(candidate/n)!=b: raise SystemExit('Existing candidate changed; refusing overwrite')
else:
    candidate.mkdir()
    for n,b in items.items():
        p=candidate/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
groups={g:[n for n,f in files.items() if f['group']==g] for g in sorted({f['group'] for f in files.values()})}
manifest={'schemaVersion':1,'scope':'Exact candidate source tree for one approval; NO external action performed',
  'repository':'haohaoyu-AI/haoduoyu-web','proposedBranch':'desktop/original-interface-webview2','proposedBaseCommitPrefix':'8ce45ba',
  'sharedSourceCommit':s['source_commit'],'sharedReviewedScopeSha256':pin,
  'sourceBuildManifestSha256':sha(read(root/'bundle/source-build-manifest.json')),
  'hostManifestSha256':sha(read(root/'bundle/host-assets.manifest.json')),
  'treeSha256':tree_sha,'fileCount':len(files),'totalBytes':sum(f['bytes'] for f in files.values()),
  'windowsRuntimeExecuted':False,'actualScreenshots':[],'groups':groups,'files':files}
manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode(); manifest_path=base/('unified-source-'+name+'-SOURCE-SCOPE.json');manifest_path.write_bytes(manifest_bytes)
archive=base/('unified-source-'+name+'.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for n in sorted(items):
        info=zipfile.ZipInfo(n,(2026,11,8,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,items[n])
result={'candidateDirectory':str(candidate),'archive':str(archive),'archiveSha256':sha(read(archive)),
        'scopeFile':str(manifest_path),'scopeFileSha256':sha(manifest_bytes),'treeSha256':tree_sha,
        'fileCount':len(files),'groups':{g:len(v) for g,v in groups.items()},'sourceOnly':True,'externalActions':False}
(base/'unified-source-phase2b-RESULT.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
