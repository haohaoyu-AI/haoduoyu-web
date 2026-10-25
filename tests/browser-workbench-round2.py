"""Round-two acceptance on a real local Worker with disposable synthetic D1 data."""
import datetime,json,select,subprocess,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-round2';OUT.mkdir(parents=True,exist_ok=True)
report={'baseline':'e284dd5031a195fd8cff549a5b34fbdcce195cef','synthetic':True,'completed':False,'checks':[],'pageerrors':[],'captures':[]}
server=subprocess.Popen(['node','tests/article-pipeline-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def uid():return str(uuid.uuid4())
def mark(text):report['checks'].append(text);print('Passed: '+text,flush=True)
def snap(page,name):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
 page.screenshot(path=str(OUT/(name+'.png')),animations='disabled',full_page=True);report['captures'].append(name+'.png')
def wait_request(page,held):
 for _ in range(70):
  if held:break
  page.wait_for_timeout(50)
 assert len(held)==1
try:
 assert select.select([server.stdout],[],[],45)[0]
 origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium')
  for width in [1440,375,390]:
   context=browser.new_context(viewport={'width':width,'height':1000 if width==1440 else 844},is_mobile=width<600,has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
   page=context.new_page();page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
   headers={'X-Public-Business':'1','Origin':origin,'Content-Type':'application/json'}
   def api(path,method='GET',body=None):
    result=page.request.fetch(origin+'/api/v1'+path,method=method,headers=headers,data=body)
    assert result.ok,(path,result.status,result.text());return result.json()['data']
   page.goto(origin+'/?page=todos');expect(page.locator('#todo-text')).to_be_visible();today=page.locator('#daily-todos').get_attribute('data-date')
   past=(datetime.date.fromisoformat(today)-datetime.timedelta(days=1)).isoformat()
   if width==1440:
    for name,completed in [('历史未完成',False),('历史已完成',True)]:
     item=api('/todos','POST',{'id':uid(),'date':past,'text':name})
     if completed:api('/todos/'+item['id'],'PATCH',{'version':item['version'],'completed':True})
    prefs=api('/todo-preferences');api('/todo-preferences','PATCH',{'version':prefs['version'],'completed_mode':'hide'})
    template=api('/todo-templates','POST',{'id':uid(),'text':'合成常用记录'})
    groups=[];notes=[]
    for index in range(3):
     group=api('/memos/groups/'+uid(),'PUT',{'title':'旧分组'+str(index),'position':index,'version':0,'save_id':uid()});groups.append(group)
     note=api('/memos/notes/'+uid(),'PUT',{'group_id':group['id'],'title':'旧笔记'+str(index),'body':'原正文'+str(index),'position':index,'version':0,'save_id':uid()});notes.append(note)
    api('/memos/groups/'+groups[2]['id'],'DELETE',{'version':groups[2]['version'],'confirm_title':groups[2]['title'],'confirm_note_count':1,'save_id':uid()})
   page.locator('[data-action=todo-panel][data-panel=history]').click();page.locator('#todo-date').fill(past);page.locator('#todo-date').dispatch_event('change')
   expect(page.locator('#todo-items')).to_be_visible();expect(page.locator('#todo-items .daily-todo-row')).to_have_count(2)
   expect(page.locator('#todo-items')).to_contain_text('历史已完成');expect(page.locator('#todo-items')).to_contain_text('历史未完成')
   assert api('/todo-preferences')['completed_mode']=='hide';assert page.locator('#todo-form').is_hidden()
   snap(page,'history-'+str(width));mark('history shows full selected day without changing hide preference '+str(width))
   page.locator('[data-action=todo-panel][data-panel=templates]').click()
   expect(page.locator('#daily-todos')).to_have_attribute('data-date',today)
   row=page.locator('[data-template-id="'+template['id']+'"]');expect(row).to_be_visible()
   if width==1440:
    assert row.locator('[data-template-added]').is_hidden();row.locator('[data-action=todo-template-use]').click()
   expect(row.locator('[data-template-added]')).to_be_visible();expect(row).to_contain_text('今日已添加')
   if width==1440:
    added=next(item for item in api('/todos?date='+today)['items'] if item.get('template_id')==template['id'])
    api('/todos/'+added['id'],'DELETE',{'date':today,'version':added['version']});page.reload();expect(row).to_be_visible();expect(row.locator('[data-template-added]')).to_be_hidden()
    row.locator('[data-action=todo-template-use]').click();expect(row.locator('[data-template-added]')).to_be_visible()
   snap(page,'templates-'+str(width));mark('today-added reflects actual linked rows, deletion, and refresh '+str(width))
   page.goto(origin+'/?page=memos');expect(page.locator('#memo-body')).to_be_visible()
   if width<600:page.locator('[data-memo-action=back-notes]').click()
   expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(2 if width==1440 else 4)
   assert page.locator('[data-memo-group],[data-memo-action=new-group],[data-memo-action=rename-group]').count()==0
   if width==1440:
    page.locator('[data-memo-action=new-note]').click();expect(page.locator('#memo-title')).to_be_focused();expect(page.locator('#memo-dialog')).to_be_hidden()
    page.locator('#memo-title').fill('新建简洁笔记');body=page.locator('#memo-body');body.fill('待保存的正文')
    expect(page.locator('#memo-status')).to_have_attribute('data-phase','saved')
    created=next(n for n in api('/memos')['notes'] if n['title']=='新建简洁笔记');path=origin+'/api/v1/memos/notes/'+created['id'];held=[]
    def hold(route):
     if route.request.method=='PUT':held.append(route)
     else:route.continue_()
    page.route(path,hold);body.fill('放大前正在保存的正文');wait_request(page,held)
   else:
    page.locator('#memo-group-list [data-memo-note]').first.click();body=page.locator('#memo-body')
   body.evaluate("e=>{e.dataset.identity='same-editor';e.focus();e.setSelectionRange(3,5);e.scrollTop=0}")
   selection=body.evaluate('e=>[e.selectionStart,e.selectionEnd]')
   before=body.input_value();phase=page.locator('#memo-status').get_attribute('data-phase')
   page.locator('[data-memo-action=fullscreen]').click();expect(page.locator('#memo-fullscreen')).to_have_attribute('open','')
   assert body.evaluate("(e,s)=>e.dataset.identity==='same-editor'&&document.activeElement===e&&e.selectionStart===s[0]&&e.selectionEnd===s[1]",selection)
   expect(body).to_have_value(before);assert page.locator('#memo-status').get_attribute('data-phase')==phase
   geometry=page.locator('#memo-fullscreen').bounding_box();assert geometry['width']>=width-26 and geometry['height']>700
   if width==1440:
    held.pop().continue_();page.unroute(path,hold);expect(page.locator('#memo-status')).to_have_attribute('data-phase','saved')
   snap(page,'fullscreen-'+str(width));page.locator('[data-memo-action=fullscreen]').click();expect(page.locator('#memo-fullscreen')).not_to_have_attribute('open','')
   assert body.evaluate("(e,s)=>e.dataset.identity==='same-editor'&&document.activeElement===e&&e.selectionStart===s[0]&&e.selectionEnd===s[1]",selection)
   page.locator('[data-memo-action=fullscreen]').click();page.keyboard.press('Escape');expect(page.locator('#memo-fullscreen')).not_to_have_attribute('open','');expect(body).to_be_focused()
   mark('fullscreen preserves node, selection, text, phase and Escape return '+str(width))
   if width==1440:
    page.route(path,hold);body.fill('删除前最后输入也必须保留');wait_request(page,held)
    page.locator('.memo-flat-row [data-memo-action=delete-note][data-memo-target="'+created['id']+'"]').click()
    expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(3);held.pop().continue_();page.unroute(path,hold)
    expect(page.locator('#memo-dialog')).to_be_hidden();expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(2)
    deleted=api('/memos/notes/'+created['id']);assert deleted['deleted_at'] and deleted['body']=='删除前最后输入也必须保留'
    page.goto(origin+'/?page=settings');page.locator('[data-action=memo-tools][data-tool=trash]').click();expect(page.locator('#memo-groups-heading')).to_have_text('回收站')
    expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(2)
    page.locator('.memo-flat-row [data-memo-action=restore-note][data-memo-target="'+created['id']+'"]').click();expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(1)
    page.locator('.memo-flat-row [data-memo-action=restore-note][data-memo-target="'+notes[2]['id']+'"]').click();expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(0)
    page.locator('[data-memo-action=exit-trash]').click();expect(page.locator('#memo-group-list [data-memo-note]')).to_have_count(4)
    final=api('/memos');assert len(final['groups'])==3 and len(final['notes'])==4
    for note in notes:assert api('/memos/notes/'+note['id'])['body']==note['body']
    mark('flat legacy notes preserved; direct plus and soft delete without confirmation; all trash restores')
   if width<600:page.locator('[data-memo-action=back-notes]').click()
   snap(page,'flat-notes-'+str(width));context.close()
  assert not report['pageerrors'];report['completed']=True;browser.close()
finally:
 server.terminate()
 try:server.wait(timeout=10)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
