"""Test-only probe over the actual bundle and real loopback Cookie/CSRF Worker.

No credential, body, cookie or token is written to the result file.
"""
import hashlib
import json
from pathlib import Path
import re
import time
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/frontend-lifecycle/requests'
OUT.mkdir(parents=True, exist_ok=True)
harness = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
report = {'synthetic': True, 'checks': [], 'variants': {}, 'status': 'running',
          'app_sha256': hashlib.sha256((ROOT/'public/app.js').read_bytes()).hexdigest()}

def save():
    (OUT/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')


def run(browser, variant, port):
    origin = f'http://127.0.0.1:{port}'
    context = browser.new_context(viewport={'width':1440,'height':900})
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin+'/') else route.abort())
    page = context.new_page()
    page.set_default_timeout(20000)
    expect.set_options(timeout=20000)
    diagnostics = []
    page.on('pageerror', lambda err: diagnostics.append({'kind':'pageerror','text':str(err)}))
    page.goto(origin+'/?page=articles')
    page.locator('#username').fill(USERNAME)
    page.locator('#password').fill(PASSWORD)
    page.locator('#login-form button[type=submit]').click()
    expect(page.locator('.shell')).to_be_visible()
    page.goto(origin+'/__synthetic-probe')
    page.wait_for_function('!!window.probe')
    page.evaluate('probe.init()')
    expect(page.locator('.shell')).to_be_visible()
    page.wait_for_timeout(100)
    def metrics():
        return page.request.get(origin+'/__synthetic-metrics').json()
    def control(command=None):
        return page.request.post(origin+'/__synthetic-control',data=command or {}).json()
    def hold(path, method='GET'):
        return control({'hold':{'path':path,'method':method}})[-1]['id']
    def held(gate):
        deadline=time.monotonic()+8
        while time.monotonic()<deadline:
            if next(row for row in control() if row['id']==gate)['stage']=='held':return
            page.wait_for_timeout(20)
        raise AssertionError('synthetic response hold did not arrive')
    def check(name, actual, expected):
        row={'variant':variant,'name':name,'actual':actual,'expected':expected,'passed':actual==expected}
        report['checks'].append(row);save()
        if variant=='candidate':assert row['passed'],row
    def start(script):
        page.evaluate('() => {window.result=null;'+script+'}')
    def result():
        page.wait_for_function('window.result!==null')
        return page.evaluate('window.result')
    # Same render, same real session and effective options: one transport.
    n=len(metrics());gate=hold('/api/v1/accounts')
    start("Promise.all([probe.api('/accounts'),probe.api('/accounts')]).then(v=>window.result={ok:v.length});")
    held(gate)
    count=sum(r['path']=='/api/v1/accounts' for r in metrics()[n:])
    control({'release':gate});result()
    check('equivalent pending GET transport count',count,1)
    # Different effective headers are not equivalent requests.
    n=len(metrics());gate=hold('/api/v1/accounts')
    start("Promise.all([probe.api('/accounts',{headers:{'X-Synthetic':'left'}}),probe.api('/accounts',{headers:{'X-Synthetic':'right'}})]).then(()=>window.result=true);")
    held(gate);control({'release':gate});result()
    check('different request options stay separate',sum(r['path']=='/api/v1/accounts' for r in metrics()[n:]),2)
    # A consumer abort cannot kill a second consumer of the same response.
    n=len(metrics());gate=hold('/api/v1/accounts')
    start("window.left=new AbortController();window.right=new AbortController();Promise.allSettled([probe.api('/accounts',{signal:left.signal}),probe.api('/accounts',{signal:right.signal})]).then(v=>window.result=v.map(x=>({status:x.status,name:x.reason?.name}))); ")
    held(gate);page.evaluate('left.abort()');control({'release':gate});v=result()
    check('consumer cancellation identity',v[0].get('name'),'AbortError')
    check('second consumer remains fulfilled',v[1]['status'],'fulfilled')
    check('shared consumer transport count',sum(r['path']=='/api/v1/accounts' for r in metrics()[n:]),1)
    # Refresh/page transitions own their GETs; old page cannot replace the new UI.
    n=len(metrics());gate=hold('/api/v1/overview?period=yesterday&top_n=5&top_platform=')
    start("probe.state.page='dashboard';probe.state.overviewPeriod='yesterday';probe.state.account='';probe.renderPage().then(()=>window.result=true);")
    held(gate)
    page.locator('[data-nav=articles]').click()
    expect(page.locator('#article-filters')).to_be_visible()
    page.wait_for_timeout(80)
    rows=[r for r in metrics()[n:] if r['path']=='/api/v1/overview?period=yesterday&top_n=5&top_platform=']
    check('page change aborts old HTTP request',bool(rows and rows[0].get('client_aborted')),True)
    control({'release':gate});result()
    check('new article page survives old response',page.locator('#article-filters').count(),1)
    # A real refresh starts a new cycle and aborts the old cycle's read.
    page.locator('[data-nav=dashboard]').first.click()
    page.locator('#page-content[aria-busy=false]').wait_for()
    n=len(metrics());gate=hold('/api/v1/overview?period=yesterday&top_n=5&top_platform=')
    start("probe.state.page='dashboard';probe.renderPage().then(()=>window.result=true);")
    held(gate);page.locator('[data-action=refresh]:visible').first.click()
    page.locator('#page-content[aria-busy=false]').wait_for()
    rows=[r for r in metrics()[n:] if r['path']=='/api/v1/overview?period=yesterday&top_n=5&top_platform=']
    check('refresh sends a separate real GET',len(rows),2)
    check('refresh aborts the previous HTTP request',bool(rows[0].get('client_aborted')),True)
    control({'release':gate});result()
    # A pending mutation is not owned or aborted by page navigation.
    account=page.request.get(origin+'/__synthetic-fixture').json()['accounts'][0]['id']
    old_read_start=len(metrics());old_read_gate=hold('/api/v1/accounts')
    page.evaluate("() => {window.beforeWrite=probe.api('/accounts');}")
    held(old_read_gate)
    n=len(metrics());gate=hold('/api/v1/articles','POST')
    page.evaluate("""account=>{window.result=null;probe.api('/articles',{method:'POST',body:{account_id:account,
      title:'Synthetic lifecycle write',url:'https://example.invalid/lifecycle-write',published_at:'2026-10-20T00:00:00.000Z',
      production_mode:'manual'}}).then(()=>window.result='saved',e=>window.result=e.name)}""",account)
    held(gate);page.locator('[data-nav=settings]').click();control({'release':gate})
    check('mutation completes across navigation',result(),'saved')
    row=next(r for r in metrics()[n:] if r['method']=='POST' and r['path']=='/api/v1/articles')
    check('mutation HTTP request remains active',bool(row.get('client_aborted')),False)
    page.evaluate("probe.api('/accounts')")
    check('successful write prevents joining the older pending GET',
        sum(r['path']=='/api/v1/accounts' for r in metrics()[old_read_start:]),2)
    control({'release':old_read_gate});page.evaluate('window.beforeWrite')
    # Genuine HTTP errors remain rejected errors instead of cancellation/success.
    actual=page.evaluate("probe.api('/synthetic-unknown-route').then(()=>({status:200}),e=>({status:e.status,name:e.name}))")
    check('real non-abort HTTP failure stays rejected',actual,{'status':404,'name':'Error'})
    check('real non-auth failure keeps the current session',page.evaluate('!!probe.state.me'),True)
    # Produce a real 401 with an expired cookie, then re-login the SAME user.
    page.evaluate("probe.api('/auth/logout',{method:'POST'})")
    gate=hold('/api/v1/accounts')
    start("probe.api('/accounts').then(()=>window.result={ok:true},e=>window.result={status:e.status,stale:!!e.staleSession});")
    held(gate)
    page.evaluate("""credentials=>probe.api('/auth/login',{method:'POST',body:credentials}).then(()=>probe.init())""",
                  {'username':USERNAME,'password':PASSWORD})
    expect(page.locator('.shell')).to_be_visible()
    control({'release':gate});v=result()
    check('old real same-user 401 rejects without clearing new session',v,{'status':401,'stale':True})
    check('new authenticated session stays visible',page.evaluate('!!probe.state.me'),True)
    page.evaluate("probe.api('/auth/logout',{method:'POST'})")
    start("probe.api('/accounts').then(()=>window.result=200,e=>window.result=e.status);")
    check('current real 401 remains a rejection',result(),401)
    expect(page.locator('#login-form')).to_be_visible()
    check('current real 401 clears session',page.evaluate('probe.state.me===null'),True)
    report['variants'][variant]={'diagnostics':diagnostics,'actual_worker_cookie_login':True,
        'test_probe_only':True,'request_receipts':metrics()}
    context.close();save()

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    try:
        run(browser,'baseline',8805)
        run(browser,'candidate',8806)
        report['status']='complete'
    finally:
        save();browser.close()
print(json.dumps({'status':report['status'],'checks':len(report['checks']),
    'candidate_pass':sum(r['passed'] for r in report['checks'] if r['variant']=='candidate'),
    'baseline_fail':sum(not r['passed'] for r in report['checks'] if r['variant']=='baseline')}))
