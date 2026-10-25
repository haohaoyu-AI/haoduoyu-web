"""Screenshot-confirmed global navigation: hidden scrollbars and accessible persistent resizing."""
import json,select,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-round2';OUT.mkdir(parents=True,exist_ok=True)
report={'synthetic':True,'completed':False,'checks':[],'pageerrors':[],'captures':[]}
server=subprocess.Popen(['node','tests/article-pipeline-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def mark(text):report['checks'].append(text);print('Passed: '+text,flush=True)
def snap(page,name):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
 page.screenshot(path=str(OUT/(name+'.png')),animations='disabled',full_page=True);report['captures'].append(name+'.png')
try:
 assert select.select([server.stdout],[],[],45)[0]
 origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium');context=browser.new_context(viewport={'width':1440,'height':500});page=context.new_page()
  page.on('pageerror',lambda e:report['pageerrors'].append(str(e)));page.goto(origin+'/?page=settings');expect(page.locator('.workbench-settings')).to_be_visible()
  summary=page.locator('.media-nav>summary');expect(summary).to_have_attribute('aria-expanded','false');summary.click();expect(summary).to_have_attribute('aria-expanded','true')
  assert summary.evaluate("e=>getComputedStyle(e,'::after').content")=='none'
  nav=page.locator('.sidebar .nav-list');assert nav.evaluate("e=>getComputedStyle(e).scrollbarWidth==='none'&&getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight")
  nav.hover();page.mouse.wheel(0,600);page.wait_for_function("()=>document.querySelector('.nav-list').scrollTop>0")
  nav.evaluate('e=>e.scrollTop=0');nav.focus();page.keyboard.press('End');page.wait_for_function("()=>document.querySelector('.nav-list').scrollTop>0")
  summary.scroll_into_view_if_needed();summary.click();expect(summary).to_have_attribute('aria-expanded','false')
  mark('hidden navigation scrollbar still scrolls by wheel and keyboard; media toggle retains expanded state without v')
  handle=page.locator('#sidebar-resizer');expect(handle).to_be_visible();expect(handle).to_have_attribute('role','separator')
  def width():return round(page.locator('.sidebar').bounding_box()['width'])
  def drag(delta,finish=True):
   box=handle.bounding_box();x=box['x']+box['width']/2;y=100
   page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+delta,y,steps=8)
   if finish:page.mouse.up()
  drag(88);assert width()==320;expect(handle).to_have_attribute('aria-valuenow','320')
  assert page.evaluate("localStorage.getItem('haoduoyu.workbench.sidebar-width.v1')")=='320';snap(page,'sidebar-settings-1440')
  handle.evaluate("e=>e.dataset.identity='persistent-separator'");page.locator('.sidebar .nav-item[data-nav=todos]').click();expect(page.locator('#todo-text')).to_be_visible()
  assert width()==320 and handle.get_attribute('data-identity')=='persistent-separator'
  page.reload();expect(page.locator('#todo-text')).to_be_visible();assert width()==320
  mark('global boundary pointer drag updates width and aria; survives module navigation and reload')
  handle.focus();page.keyboard.press('Home');assert width()==200;page.keyboard.press('ArrowRight');assert width()==216
  page.keyboard.press('Shift+ArrowRight');assert width()==248;page.keyboard.press('End');assert width()==420
  page.keyboard.press('ArrowRight');assert width()==420;mark('keyboard arrows, larger step, Home/End and upper/lower limits')
  drag(-90,False);assert width()==330;page.keyboard.press('Escape');page.mouse.up();assert width()==420
  assert page.evaluate("localStorage.getItem('haoduoyu.workbench.sidebar-width.v1')")=='420'
  assert not page.locator('.shell').evaluate("e=>e.classList.contains('sidebar-resizing')")
  handle.evaluate("e=>e.addEventListener('pointerdown',event=>e.dataset.testPointer=String(event.pointerId))")
  drag(-80,False);handle.evaluate("e=>e.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:Number(e.dataset.testPointer)}))");page.mouse.up();assert width()==420
  mark('Escape and pointer cancellation restore original width and do not leave dragging state')
  page.set_viewport_size({'width':900,'height':600});expect(handle).to_be_visible();assert width()<=int(handle.get_attribute('aria-valuemax'))
  assert page.locator('.sidebar .nav-label').first.is_visible();snap(page,'sidebar-expanded-900')
  page.set_viewport_size({'width':761,'height':600});assert width()<=int(handle.get_attribute('aria-valuemax'))
  assert page.locator('.workspace').bounding_box()['width']>=419;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.set_viewport_size({'width':375,'height':844});expect(handle).to_be_hidden();assert page.locator('.shell').evaluate("e=>e.style.getPropertyValue('--sidebar-w')")==''
  page.locator('.mobile-bar [data-action=menu]').click();expect(page.locator('.shell')).to_have_class('shell menu-open')
  assert page.locator('.sidebar').bounding_box()['width']<=331;snap(page,'sidebar-drawer-375');page.keyboard.press('Escape')
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');expect(handle).to_be_hidden()
  page.set_viewport_size({'width':1440,'height':1000});expect(handle).to_be_visible();assert width()==420
  handle.focus();page.keyboard.press('ArrowLeft');assert width()==404
  mark('narrow viewport clamps content width; mobile drawer stays independent; desktop preference restores without duplicate listeners')
  page.evaluate("localStorage.setItem('haoduoyu.workbench.sidebar-width.v1','9999999')");page.reload();expect(handle).to_be_visible();assert width()==232
  mark('invalid stored preference falls back to normal width')
  assert not report['pageerrors'];report['completed']=True;browser.close()
finally:
 server.terminate()
 try:server.wait(timeout=10)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'sidebar-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
