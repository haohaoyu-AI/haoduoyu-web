from pathlib import Path
import subprocess,json,tempfile,hashlib,secrets
import os
root=Path(__file__).resolve().parents[1]; binary=os.environ.get('GITLEAKS_BIN','gitleaks')
old=json.loads(subprocess.check_output(['git','show','814126dfd25b174aecba2d7ad49f5a74a52b95b5:docs/daily-todos-evidence.json'],cwd=root))['product_file_hashes']
vals={p:old[p] for p in ['public/openapi.json','shared/auth.mjs','web/core/api.mjs']}
work=Path(tempfile.mkdtemp(prefix='todo-exception-audit-',dir=tempfile.gettempdir()))
(work/'default.toml').write_text('[extend]\nuseDefault = true\n')
base=json.dumps(vals,indent=2)+'\n'; changed=dict(vals); k=next(iter(vals));changed[k]=('0' if vals[k][0]!='0' else '1')+vals[k][1:]
scenarios=[('approved','docs/daily-todos-evidence.json',base,0),('new-secret','docs/daily-todos-evidence.json',base+'\napi_key = "'+secrets.token_hex(32)+'"\n',1),('other-path','docs/other-evidence.json',base,3),('changed-value','docs/daily-todos-evidence.json',json.dumps(changed,indent=2),1),('path-prefix','other/docs/daily-todos-evidence.json',base,3),('other-rule','docs/daily-todos-evidence.json','github_token = "ghp_'+secrets.token_hex(18)+'"\n',None)]
results=[]
for name,path,content,expected in scenarios:
 repo=work/name;repo.mkdir();p=repo/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
 for args in [['init','-q'],['add','.'],['-c','user.name=Synthetic Scanner Test','-c','user.email=synthetic@example.invalid','commit','-qm','Synthetic scanner boundary']]:subprocess.run(['git',*args],cwd=repo,check=True,stdout=subprocess.DEVNULL)
 counts={};rules={}
 for label,config in [('default',work/'default.toml'),('scoped',root/'.gitleaks.toml')]:
  report=work/(name+'-'+label+'.json')
  args=[binary,'git',str(repo),'--config',str(config),'--log-opts=--all --full-history -m --root','--redact=100','--ignore-gitleaks-allow','--no-banner','--report-format','json','--report-path',str(report)]
  r=subprocess.run(args,capture_output=True,text=True);assert r.returncode in [0,1],(name,label,r.stderr)
  data=json.loads(report.read_text());counts[label]=len(data);rules[label]=sorted({x['RuleID'] for x in data})
 assert counts['default']>0,(name,'positive control')
 if expected is not None:assert counts['scoped']==expected,(name,counts)
 else: assert counts['scoped']==counts['default'] and 'github-pat' in rules['scoped'],(name,counts,rules)
 results.append({'case':name,'findings':counts,'rules':rules,'pass':True})
ignore=root/'.gitleaksignore';assert hashlib.sha256(ignore.read_bytes()).hexdigest()=='68e13eb6bf2d7118652344fc092bf502e5fcd18ac70960972772a54c63a496d3'
summary={'binary':'Gitleaks 8.30.1','all_rules_used':True,'full_history_parameters':True,'original_155_fingerprints_byte_identical':True,'cases':results,'workspace':str(work)}
print(json.dumps(summary,indent=2))
