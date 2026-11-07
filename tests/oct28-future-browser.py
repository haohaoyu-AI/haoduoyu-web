import os,subprocess,time,json,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
p=subprocess.Popen(['node','tests/unify-offline-notes-browser-server.mjs'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 origin=p.stdout.readline().strip(); assert origin.startswith('http://127.0.0.1:'),origin
 with sync_playwright() as w:
  browser=w.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  ctx=browser.new_context(viewport={'width':1440,'height':900},timezone_id='Asia/Shanghai')
  ctx.route('**/*',lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
  probe=w.request.new_context(base_url=origin,extra_http_headers={'X-Public-Business':'1'})
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(origin+'/?page=todos'); expect(page.locator('#todo-text')).to_be_visible(timeout=15000)
  page.locator('[data-action=todo-panel][data-panel=future]').click();expect(page.locator('#todo-future-text')).to_be_visible()
  response=probe.get('/api/v1/unscheduled-todos');assert response.status==200,(response.status,response.text())
  assert response.json()['data']['items']==[]
  page.locator('#todo-future-text').fill('   ');page.locator('#todo-future-form button').click()
  expect(page.locator('#todo-future-error')).to_contain_text('请填写')
  ctx.set_offline(True);page.wait_for_timeout(300)
  page.locator('#todo-future-text').fill('未定日期合成事项');page.locator('#todo-future-form button').click()
  expect(page.locator('#todo-future-items')).to_contain_text('未定日期合成事项',timeout=10000)
  assert probe.get('/api/v1/unscheduled-todos').json()['data']['items']==[]
  ctx.set_offline(False);deadline=time.monotonic()+20;items=[]
  while time.monotonic()<deadline:
   items=probe.get('/api/v1/unscheduled-todos').json()['data']['items']
   if items:break
   page.wait_for_timeout(500)
  assert len(items)==1 and items[0]['text']=='未定日期合成事项' and 'date' not in items[0],items
  for key,section in [('history','#todo-history'),('templates','#todo-templates'),('','#todo-main'),('future','#todo-future')]:
   page.locator('[data-action=todo-panel][data-panel="'+key+'"]').click();expect(page.locator(section)).to_be_visible()
  page.locator('[data-action=todo-panel][data-panel=history]').click();expect(page.locator('#todo-history')).to_be_visible()
  page.go_back();expect(page.locator('#todo-future')).to_be_visible()
  for width in (1440,375,390):
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(200)
   for key,section in [('future','#todo-future'),('history','#todo-history'),('templates','#todo-templates'),('','#todo-main')]:
    page.locator('[data-action=todo-panel][data-panel="'+key+'"]').click();expect(page.locator(section)).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),('overflow',width,key)
  dated='2027-01-01'
  seed=probe.post('/api/v1/todos',headers={'Origin':origin},
                  data={'id':str(uuid.uuid4()),'date':dated,'text':'指定日期合成计划'})
  assert seed.status in (200,201),(seed.status,seed.text())
  isolated=browser.new_context(viewport={'width':390,'height':850},timezone_id='Asia/Shanghai')
  isolated.route('**/*',lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
  deep=isolated.new_page(); deep.on('pageerror',lambda e:errors.append(str(e)))
  deep.goto(origin+'/?page=todos&date='+dated+'&todo_panel=future')
  expect(deep.locator('#todo-future-text')).to_be_visible(timeout=15000)
  deep.locator('[data-action=todo-panel][data-panel=history]').click()
  expect(deep.locator('#todo-history')).to_be_visible()
  expect(deep.locator('#todo-main')).to_contain_text('指定日期合成计划',timeout=15000)
  deep.go_back();expect(deep.locator('#todo-future')).to_be_visible()
  isolated.close()
  assert not errors,errors
  print(json.dumps({'synthetic':True,'error_feedback':'ok','offline_visible':True,'server_before_sync':0,'server_after_sync':1,'unscheduled':True,'history_common_today_back':'ok','viewport':[1440,375,390],'pageerrors':errors},ensure_ascii=False))
  browser.close()
finally:
 p.terminate();p.wait(timeout=8)
