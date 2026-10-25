"""Round4 integration: real loopback Worker, disposable D1, synthetic content only."""
import json,select,subprocess,uuid
from pathlib import Path
from datetime import date,timedelta
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-round4';OUT.mkdir(parents=True,exist_ok=True)
report={'synthetic':True,'baseline':'4aefa4d4d596ad540324bc78898ae208121647b4','completed':False,'checks':[],'pageerrors':[],'http_errors':[],'captures':[]}
server=None
def uid():return str(uuid.uuid4())
def mark(text):report['checks'].append(text);print('Passed: '+text,flush=True)
def snap(page,name):
 expect(page.locator('#page-content')).to_be_visible();expect(page.locator('h1')).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
 page.screenshot(path=str(OUT/(name+'.png')),full_page=True,animations='disabled');report['captures'].append(name+'.png')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium')
  for width in [1440,375,390]:
   server=subprocess.Popen(['node','tests/article-pipeline-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   assert select.select([server.stdout],[],[],45)[0];origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
   page=context.new_page();page.set_default_timeout(15000)
   page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
   page.on('response',lambda r:report['http_errors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
   def api(path,method='GET',data=None):
    r=page.request.fetch(origin+'/api/v1'+path,method=method,headers={'Origin':origin,'X-Public-Business':'1'},data=data)
    assert r.ok,(path,r.status,r.text());return r.json()['data']
   page.goto(origin+'/?page=notes');expect(page.locator('[data-notes-action=new]')).to_be_visible();today=page.locator('#notes-date').input_value()
   assert page.locator('.sidebar .user-row').count()==0
   assert page.locator('.notes-categories button[aria-pressed=true]').count()==1
   colors=page.locator('.notes-categories button').evaluate_all('es=>es.map(e=>getComputedStyle(e).backgroundColor)');assert colors[0]!=colors[1]
   for index in range(2):
    page.locator('[data-notes-action=new]').click();editor=page.locator('#notes-entry-list textarea').nth(index);editor.fill('合成生活记录'+str(index+1))
    tile=page.locator('#notes-entry-list .note-entry').nth(index);expect(tile.locator('.note-entry-status')).to_have_text('已保存')
    assert editor.evaluate("e=>getComputedStyle(e).outlineStyle==='none'")
   rows=api('/note-entries?category=life&date='+today)['entries'];assert len(rows)==2 and len(set(x['id'] for x in rows))==2
   assert all(x['created_at'] and x['content_hash'] for x in rows)
   page.locator('.notes-categories [data-notes-category=work]').click();expect(page.locator('h1')).to_have_text('工作碎碎念')
   expect(page.locator('[data-notes-action=new]')).to_be_visible();page.locator('[data-notes-action=new]').click()
   editor=page.locator('#notes-entry-list textarea');editor.fill('合成工作记录');expect(page.locator('#notes-entry-list .note-entry-status')).to_have_text('已保存')
   assert page.locator('.notes-categories button[aria-pressed=true]').get_attribute('data-notes-category')=='work'
   page.reload();expect(page.locator('#notes-entry-list textarea')).to_have_value('合成工作记录')
   snap(page,'notes-'+str(width));mark('real multi-entry autosave, server timestamps, selected category and quiet focus '+str(width))
   page.goto(origin+'/?page=todos');expect(page.locator('#todo-text')).to_be_visible()
   page.locator('[data-action=todo-panel][data-panel=history]').click();expect(page.locator('#todo-history')).to_be_visible()
   future=(date.fromisoformat(today)+timedelta(days=2)).isoformat();page.locator('#todo-date').fill(future);page.locator('#todo-date').dispatch_event('change')
   expect(page.locator('#todo-form')).to_have_attribute('data-date',future);expect(page.locator('#todo-text')).to_be_visible()
   page.locator('#todo-text').fill('合成未来计划');page.locator('#todo-form button[type=submit]').click();expect(page.locator('.daily-todo-text')).to_contain_text(['合成未来计划'])
   assert any(x['text']=='合成未来计划' and x['date']==future for x in api('/todos?date='+future)['items'])
   page.reload();expect(page.locator('#todo-text')).to_be_visible();expect(page.locator('.daily-todo-text')).to_contain_text(['合成未来计划'])
   snap(page,'calendar-'+str(width))
   template=uid();api('/todo-templates','POST',{'id':template,'text':'合成常用计划'})
   page.locator('[data-action=todo-panel][data-panel=templates]').click();expect(page.locator('#todo-templates')).to_be_visible()
   row=page.locator('[data-template-id="'+template+'"]');row.locator('[data-action=todo-template-use]').click();expect(row.locator('[data-template-added]')).to_be_visible()
   expect(row.locator('[data-template-added]')).to_have_text('当日已添加')
   page.locator('#todo-templates [data-action=todo-panel-close]').click();expect(page.locator('#todo-form')).to_have_attribute('data-date',today)
   mark('future calendar input and persistence, chosen-day templates, return today '+str(width))
   group=uid();note=uid();api('/memos/groups/'+group,'PUT',{'title':'合成旧集合','position':0,'version':0,'save_id':uid()})
   api('/memos/notes/'+note,'PUT',{'group_id':group,'title':'合成待恢复笔记','body':'合成回收内容','position':0,'version':0,'save_id':uid()})
   api('/memos/notes/'+note,'DELETE',{'version':1,'save_id':uid()})
   page.goto(origin+'/?page=settings');expect(page.locator('#memo-group-list')).to_contain_text('合成待恢复笔记')
   expect(page.locator('.workbench-settings')).to_contain_text('30天');expect(page.locator('h1')).to_have_text('设置')
   nav=page.locator('.mobile-nav [data-nav=settings]' if width<600 else '.sidebar [data-nav=settings]');expect(nav).to_have_attribute('aria-current','page')
   page.locator('[data-memo-note="'+note+'"]').click();expect(page.locator('h1')).to_have_text('设置')
   if width<600:page.locator('[data-memo-action=back-notes]').click()
   page.reload();expect(page.locator('#memo-group-list')).to_contain_text('合成待恢复笔记');snap(page,'settings-trash-'+str(width))
   page.locator('.memo-flat-row [data-memo-action=restore-note][data-memo-target="'+note+'"]').click()
   expect(page.locator('#memo-group-list')).not_to_contain_text('合成待恢复笔记');expect(page.locator('h1')).to_have_text('设置')
   page.goto(origin+'/?page=memos&memo_view=trash');expect(page.locator('h1')).to_have_text('设置');expect(nav).to_have_attribute('aria-current','page')
   mark('settings directly owns trash, restore stays settings, legacy URL compatibility '+str(width))
   reminder=uid();payload={'date':today,'source_key':'synthetic-projects','summary':'合成项目摘要：核对已允许公开的进度','version':0,'save_id':uid()}
   saved=api('/work-reminders/'+reminder,'PUT',payload);assert api('/work-reminders/'+reminder,'PUT',payload)['content_hash']==saved['content_hash']
   page.goto(origin+'/?page=reminders');expect(page.locator('h1')).to_have_text('每日工作提醒');expect(page.locator('#reminder-list')).to_contain_text('合成项目摘要')
   snap(page,'reminders-'+str(width));index=api('/workbench-snapshot/index');details=api('/workbench-snapshot?date='+today)
   assert index['complete'] and details['complete'] and index['manifest_hash']==details['manifest_hash']
   assert any(x['entity_id'].startswith('note-entry:') for x in index['entities'])
   assert all('content_hash' in x and 'updated_at' in x and 'can_edit' not in x for x in index['entities'])
   mark('daily reminders idempotent readback and complete stable sync manifest '+str(width))
   if width==1440:
    page.goto(origin+'/?page=settings&tab=accounts');expect(page.locator('.accounts-table')).to_be_visible();page.locator('[data-action=new-account]').click()
    page.locator('#account-form [name=profile_url]').fill('https://www.zhihu.com/people/synthetic-round4')
    page.locator('#account-form [name=name]').fill('合成主页账号');page.locator('#account-form button[type=submit]').click()
    expect(page.locator('.accounts-table')).to_contain_text('合成主页账号');expect(page.locator('.accounts-table a[href="https://www.zhihu.com/people/synthetic-round4"]')).to_be_visible()
    count=len(api('/accounts'));page.locator('[data-action=new-account]').click();page.locator('#account-form [name=profile_url]').fill('https://zhihu.com/people/synthetic-round4/answers')
    page.locator('#account-form [name=name]').fill('重复主页不得新增');page.locator('#account-form button[type=submit]').click()
    expect(page.locator('#account-form')).to_have_count(0);assert len(api('/accounts'))==count
    snap(page,'account-profile');mark('paste public profile, safe saved link, duplicate account reused')
   page.goto(origin+'/?page=dashboard');expect(page.locator('[data-action=article-overview-mode]')).to_have_count(3)
   assert page.locator('[data-action=article-overview-mode]').all_text_contents()==['文章列表','文章数据','发布情况']
   page.locator('[data-action=article-overview-mode][data-mode=reconciliation]').click();expect(page.locator('#page-content')).to_contain_text('发布情况')
   assert 'run_date' not in page.locator('#page-content').inner_text() and '完整授权范围' not in page.locator('#page-content').inner_text()
   snap(page,'publishing-'+str(width));mark('plain article labels and concise content '+str(width))
   context.close();server.terminate();server.wait(timeout=10);server=None
  assert not report['pageerrors'] and not report['http_errors'];report['completed']=True;browser.close()
finally:
 if server:
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
