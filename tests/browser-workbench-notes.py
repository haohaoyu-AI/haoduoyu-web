"""Anonymous notes: in-flight acknowledgement must not disturb Chinese IME or queue an intermediate save."""
import json,select,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-acceptance';OUT.mkdir(parents=True,exist_ok=True)
report={'synthetic':True,'completed':False,'checks':[],'pageerrors':[]}
server=subprocess.Popen(['node','tests/article-pipeline-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 assert select.select([server.stdout],[],[],45)[0]
 origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
 with sync_playwright() as p:
  b=p.chromium.launch(executable_path='/usr/bin/chromium');c=b.new_context(viewport={'width':375,'height':844},is_mobile=True,has_touch=True,locale='zh-CN',timezone_id='Asia/Shanghai');page=c.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
  page.goto(origin+'/?page=notes');field=page.locator('#notes-editor');expect(field).to_be_visible();day=page.locator('#notes-date').input_value();path=origin+'/api/v1/daily-notes/'+day;held=[]
  def hold(route):
   if route.request.method=='PUT':held.append(route)
   else:route.continue_()
  def request():
   for _ in range(60):
    if held:break
    page.wait_for_timeout(50)
   assert len(held)==1
  page.route(path,hold);field.fill('原先发送中的文字');request()
  text='中文长文连续输入'*1000
  field.evaluate('''(e,text)=>{e.dataset.marker='original';e.focus();e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.value=text;e.setSelectionRange(6,6);e.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'中文'}));}''',text)
  held.pop().continue_();expect(page.locator('#notes-status')).to_have_attribute('data-phase','dirty');page.wait_for_timeout(900);assert not held
  expect(field).to_have_value(text);assert field.evaluate("e=>e===document.activeElement&&e.selectionStart===6&&e.dataset.marker==='original'")
  field.dispatch_event('compositionend');request();held.pop().continue_();expect(page.locator('#notes-status')).to_have_attribute('data-phase','saved')
  assert page.request.get(origin+'/api/v1/daily-notes?date='+day).json()['data']['text']==text
  assert page.locator('#notes-drafts').is_hidden() and page.locator('#notes-status').inner_text()=='自动保存'
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'notes-ime-saved-375.png'),animations='disabled',full_page=True)
  # At a short desktop height the footer remains inside the frame even with media children expanded.
  c2=b.new_context(viewport={'width':1440,'height':500});short=c2.new_page();short.goto(origin+'/?page=todos');expect(short.locator('#todo-text')).to_be_visible();short.locator('.media-nav>summary').click()
  geometry=short.evaluate('''()=>{const f=document.querySelector('.sidebar-bottom').getBoundingClientRect(),s=document.querySelector('.sidebar').getBoundingClientRect(),n=document.querySelector('.nav-list');return {footerBottom:f.bottom,sidebarBottom:s.bottom,navClient:n.clientHeight,navScroll:n.scrollHeight};}''');assert geometry['footerBottom']<=geometry['sidebarBottom'];report['short_desktop_geometry']=geometry
  short.screenshot(path=str(OUT/'short-desktop-footer-1440x500.png'),animations='disabled',full_page=True)
  report['checks']=['anonymous editor remains writable','in-flight save preserves composed long text and caret','IME completion sends exactly one final save','server text verified; routine draft banner stays quiet','1440x500 footer inside sidebar with scrollable navigation'];assert not report['pageerrors'];report['completed']=True;c.close();c2.close();b.close()
finally:
 server.terminate()
 try:server.wait(timeout=10)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'notes-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
