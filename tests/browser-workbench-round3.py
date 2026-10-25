"""Third-round seven-item acceptance: real Worker, disposable D1 and synthetic text only."""
import json,select,subprocess,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-round3';OUT.mkdir(parents=True,exist_ok=True)
report={'synthetic':True,'baseline':'8649a55ef74a4b58ddab09b0720b871bd1962654','completed':False,'checks':[],'pageerrors':[],'http_errors':[],'captures':[]}
server=None
def uid():return str(uuid.uuid4())
def mark(text):report['checks'].append(text);print('Passed: '+text,flush=True)
def snap(page,name):
 expect(page.locator('#page-content')).to_be_visible()
 expect(page.locator('h1')).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
 page.screenshot(path=str(OUT/(name+'.png')),animations='disabled',full_page=True);report['captures'].append(name+'.png')
def held_request(page,held):
 for _ in range(80):
  if held:break
  page.wait_for_timeout(50)
 assert len(held)==1
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium')
  for width in [1440,375,390]:
   server=subprocess.Popen(['node','tests/article-pipeline-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   assert select.select([server.stdout],[],[],45)[0]
   origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
   page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
   page.on('response',lambda r:report['http_errors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
   def api(path,method='GET',data=None):
    r=page.request.fetch(origin+'/api/v1'+path,method=method,headers={'Origin':origin,'X-Public-Business':'1'},data=data)
    assert r.ok,(path,r.status,r.text());return r.json()['data']
   page.goto(origin+'/?page=notes');editor=page.locator('#notes-editor');expect(editor).to_be_visible();day=page.locator('#notes-date').input_value()
   if width==1440:
    held=[];life_url=origin+'/api/v1/daily-notes/'+day
    def hold_life(route):
     if route.request.method=='PUT' and '?' not in route.request.url:held.append(route)
     else:route.continue_()
    page.route(life_url,hold_life);editor.fill('生活：先发送的文字');held_request(page,held);editor.fill('生活：迟到响应不能丢失的新文字')
   if width!=1440:api('/daily-notes/'+day,'PUT',{'text':'生活：迟到响应不能丢失的新文字','version':0,'save_id':uid()})
   page.locator('.notes-categories [data-notes-category=work]').click();expect(page.locator('h1')).to_have_text('工作碎碎念');expect(page.locator('#daily-notes')).to_have_attribute('data-category','work')
   expect(editor).to_be_visible();editor.fill('工作：独立保存 '+str(width));expect(page.locator('#notes-status')).to_have_attribute('data-phase','saved')
   if width==1440:
    held.pop().continue_();page.unroute(life_url,hold_life);expect(editor).to_have_value('工作：独立保存 1440')
   page.locator('.notes-categories [data-notes-category=life]').click();expect(page.locator('h1')).to_have_text('生活碎碎念')
   expect(editor).to_have_value('生活：迟到响应不能丢失的新文字');expect(page.locator('#notes-status')).to_have_attribute('data-phase','saved')
   assert api('/daily-notes?date='+day)['text']=='生活：迟到响应不能丢失的新文字'
   assert api('/daily-notes?date='+day+'&category=work')['text']=='工作：独立保存 '+str(width)
   page.go_back();expect(page.locator('h1')).to_have_text('工作碎碎念');expect(editor).to_have_value('工作：独立保存 '+str(width));page.reload();expect(editor).to_have_value('工作：独立保存 '+str(width))
   snap(page,'work-notes-'+str(width));mark('life/work independent text, dates, delayed acknowledgement, refresh and Back '+str(width))
   group=uid();api('/memos/groups/'+group,'PUT',{'title':'合成旧集合','position':0,'version':0,'save_id':uid()});active=uid();deleted=uid()
   for note,title in [(active,'正式合成笔记'),(deleted,'待恢复合成笔记')]:api('/memos/notes/'+note,'PUT',{'group_id':group,'title':title,'body':'只用于本机验收的正文','position':0,'version':0,'save_id':uid()})
   api('/memos/notes/'+deleted,'DELETE',{'version':1,'save_id':uid()})
   page.goto(origin+'/?page=memos');body=page.locator('#memo-body');expect(body).to_have_value('只用于本机验收的正文');body.focus()
   assert body.evaluate("e=>getComputedStyle(e).outlineStyle==='none'&&getComputedStyle(e).boxShadow==='none'")
   body.evaluate("e=>{e.dataset.identity='original-editor';e.setSelectionRange(2,4)}")
   split=page.locator('#memo-resizer')
   if width>600:
    expect(split).to_be_visible();before=int(split.get_attribute('aria-valuenow'));box=split.bounding_box();x=box['x']+box['width']/2;y=box['y']+80
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+60,y,steps=8);page.mouse.up();assert int(split.get_attribute('aria-valuenow'))==before+60, {'before':before,'after':split.get_attribute('aria-valuenow'),'box':box,'area':page.locator('.memo-layout').evaluate('e=>e.clientWidth'),'ratio':page.evaluate("localStorage.getItem('haoduoyu.memos.split-ratio.v1')")}
    assert body.evaluate("e=>e.dataset.identity==='original-editor'&&e.selectionStart===2&&e.selectionEnd===4")
    saved=page.evaluate("localStorage.getItem('haoduoyu.memos.split-ratio.v1')");assert saved
    split.focus();page.keyboard.press('Home');assert split.get_attribute('aria-valuenow')==split.get_attribute('aria-valuemin')
    page.keyboard.press('End');assert split.get_attribute('aria-valuenow')==split.get_attribute('aria-valuemax')
    page.reload();expect(body).to_be_visible();assert page.evaluate("localStorage.getItem('haoduoyu.memos.split-ratio.v1')")!=saved
   else:expect(split).to_be_hidden()
   snap(page,'memos-'+str(width));mark('internal memo splitter and gentle editing focus '+str(width))
   page.goto(origin+'/?page=settings');page.locator('[data-action=memo-tools][data-tool=trash]').click();expect(page.locator('h1')).to_have_text('备忘录回收站');assert 'memo_view=trash' in page.url
   if width<600 and page.locator('[data-memo-action=back-notes]').is_visible():page.locator('[data-memo-action=back-notes]').click()
   expect(page.locator('#memo-group-list')).not_to_contain_text('正式合成笔记')
   if width==1440:
    expect(page.locator('#memo-group-list')).to_contain_text('待恢复合成笔记');page.locator('[data-memo-note="'+deleted+'"]').click();expect(page.locator('h1')).to_have_text('备忘录回收站');expect(page.locator('#memo-body')).to_be_hidden()
   page.reload();expect(page.locator('h1')).to_have_text('备忘录回收站');page.go_back();expect(page.locator('h1')).to_have_text('设置');page.go_forward();expect(page.locator('h1')).to_have_text('备忘录回收站')
   if width==1440:
    page.locator('.memo-flat-row [data-memo-action=restore-note][data-memo-target="'+deleted+'"]').click();expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(0);expect(page.locator('h1')).to_have_text('备忘录回收站');assert 'memo_view=trash' in page.url
   snap(page,'memo-trash-'+str(width));page.locator('[data-memo-action=exit-trash]').click();expect(page.locator('h1')).to_have_text('设置');mark('standalone trash scope survives selection, refresh, Back/Forward and restore '+str(width))
   page.goto(origin+'/?page=dashboard');expect(page.locator('#page-content')).not_to_be_empty();assert page.locator('#page-header [data-action=new-article]').count()==0
   favicon=page.locator('link[rel=icon]').get_attribute('href');assert 'warm-20261025' in favicon;svg=page.request.get(origin+favicon).text();assert '#dba078' in svg and '#a66045' in svg and '#11756e' not in svg
   mark('warm versioned favicon and results-first dashboard; article API retained '+str(width))
   if width<600:
    for destination in ['settings','todos','notes','memos']:
     if not page.locator('.mobile-media-nav[open]').count():page.locator('.mobile-media-nav>summary').click()
     menu=page.locator('.mobile-media-nav>.media-subnav');expect(menu).to_be_visible()
     for link in menu.locator('a').all():
      b=link.bounding_box();assert b['x']>=0 and b['x']+b['width']<=width and link.evaluate('e=>e.scrollWidth<=e.clientWidth')
     page.locator('.mobile-nav [data-nav=articles]').click();expect(page.locator('h1')).to_have_text('文章')
     if destination=='notes':page.locator('.mobile-notes-nav>summary').click();expect(page.locator('#daily-notes')).to_be_visible()
     else:page.locator('.mobile-nav .mobile-nav-item[data-nav='+destination+']').click()
     expect(menu).to_be_hidden();assert page.locator('.mobile-media-nav[open]').count()==0
     page.reload();expect(page.locator('#page-content')).to_be_visible();expect(menu).to_be_hidden()
     page.go_back();expect(page.locator('#page-content')).to_be_visible();expect(menu).to_be_hidden()
     page.go_forward();expect(page.locator('#page-content')).to_be_visible();expect(menu).to_be_hidden()
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.goto(origin+'/?page=settings');expect(page.locator('.workbench-settings')).to_be_visible();snap(page,'mobile-navigation-'+str(width));mark('media submenu does not leak or clip across four modules, refresh and history '+str(width))
   context.close();server.terminate();server.wait(timeout=10);server=None
  assert not report['pageerrors'] and not report['http_errors'];report['completed']=True;browser.close()
finally:
 if server is not None:
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
