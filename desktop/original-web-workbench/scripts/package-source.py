#!/usr/bin/env python3
"""Produce a deterministic LOCAL source-only archive and exact approved-upload scope."""
import hashlib, json, pathlib, zipfile
root=pathlib.Path(__file__).resolve().parent.parent
fixed=['.gitattributes','.gitignore','Directory.Build.props','NuGet.Config','global.json','README.md']
files=[root/p for p in fixed]
for folder in ['src','tests','scripts','docs','staging/windows-acceptance','bundle']:
    base=root/folder
    if not base.exists(): continue
    for p in base.rglob('*'):
        if p.is_file() and not set(p.relative_to(base).parts)&{'bin','obj','__pycache__'}:
            files.append(p)
items={}
for p in sorted(set(files)):
    for parent in [p,*p.parents]:
        if parent.is_symlink(): raise SystemExit('Refusing linked source path: '+str(p))
    if p.stat().st_nlink!=1: raise SystemExit('Refusing hardlinked source: '+str(p))
    name=p.relative_to(root).as_posix()
    if any(t in name.lower() for t in ['credential','secret','profile','.nuget']): raise SystemExit('Suspicious package path: '+name)
    if p.suffix not in {'.cs','.csproj','.xaml','.manifest','.json','.html','.js','.css','.svg','.webmanifest','.py','.sh','.ps1','.md','.disabled','.props','.Config'} and p.name not in {'.gitattributes','.gitignore'}: raise SystemExit('Unreviewed source file type: '+name)
    items[name]=p.read_bytes()
manifest={'schemaVersion':1,'scope':'LOCAL source only; no upload approval implied','windowsRuntimeExecuted':False,
          'frontendBundled':'bundle/source-build-manifest.json' in items,
          'scopeGroups':{'hostSource':[n for n in items if not n.startswith('bundle/')],
                         'sharedBuiltSite':[n for n in items if n.startswith('bundle/site/')],
                         'sharedBundleMetadata':[n for n in items if n.startswith('bundle/') and not n.startswith('bundle/site/')],
                         'sharedRebuildSource':[]},
          'sharedRebuildSourceIncluded':False,
          'files':{n:{'size':len(v),'sha256':hashlib.sha256(v).hexdigest()} for n,v in items.items()}}
out=root/'artifacts';out.mkdir(exist_ok=True)
manifest_bytes=(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()
archive=out/'windows-original-ui-acceptance-source.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for n,v in {**items,'SOURCE-SCOPE.json':manifest_bytes}.items():
        info=zipfile.ZipInfo(n,(2026,11,8,0,0,0));info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,v)
(out/'windows-original-ui-acceptance-SOURCE-SCOPE.json').write_bytes(manifest_bytes)
print('SOURCE FILES:',len(items));print('ARCHIVE:',archive);print('SHA256:',hashlib.sha256(archive.read_bytes()).hexdigest())
print('No binary/profile/cache/credential, remote upload, workflow creation, install or production action performed.')
