"""Monthly notes through real Chromium, real Worker and isolated synthetic D1."""
import json, subprocess, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen(['node','tests/unify-offline-notes-browser-server.mjs'],cwd=ROOT,
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:'),origin
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  context=browser.new_context(viewport={'width':1440,'height':900},timezone_id='Asia/Shanghai')
  context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
  request=p.request.new_context(base_url=origin,extra_http_headers={'Origin':origin,'X-Public-Business':'1','X-Note-Labels-Version':'1'})
  for date,category,label,text in [('2026-09-01','life','兴趣','兴趣月历合成'),('2026-09-08','work',None,'工作月历合成')]:
   body={'category':category,'date':date,'text':text,'version':0,'save_id':str(uuid.uuid4())}
   if label:body['label']=label
   response=request.put('/api/v1/note-entries/'+str(uuid.uuid4()),data=body)
   assert response.status==200,(response.status,response.text())
  page=context.new_page();errors=[];month_urls=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.on('request',lambda req:month_urls.append(req.url) if '/api/v1/note-entries/month?' in req.url else None)
  page.goto(origin+'/?page=notes');expect(page.locator('[data-notes-view=history]')).to_be_visible(timeout=15000)
  page.locator('[data-notes-view=history]').click();expect(page.locator('#notes-history-month')).not_to_have_value('')
  page.locator('#notes-history-month').fill('2026-09');expect(page.locator('#notes-history-summary')).to_contain_text('2026-09')
  cells=page.locator('#notes-history-grid button');assert cells.nth(0).is_disabled()
  assert cells.nth(1).get_attribute('data-notes-history-day')=='2026-09-01'
  expect(page.locator('[data-notes-history-day="2026-09-01"]')).to_contain_text('兴趣月历合成')
  expect(page.locator('[data-notes-history-day="2026-09-08"]')).to_contain_text('工作月历合成')
  page.locator('#notes-history-label').select_option('兴趣')
  expect(page.locator('[data-notes-history-day="2026-09-01"]')).to_contain_text('1 条')
  expect(page.locator('[data-notes-history-day="2026-09-08"]')).to_contain_text('0 条')
  page.locator('[data-notes-history-day="2026-09-01"]').click()
  expect(page.locator('#notes-history-list')).to_contain_text('兴趣月历合成')
  page.locator('#notes-history-week').select_option('2')
  assert page.locator('#notes-history-date').input_value()=='2026-09-07'
  page.locator('#notes-history-date').select_option('2026-09-01')
  assert page.locator('#notes-history-week').input_value()==''
  page.locator('[data-notes-month=prev]').click();expect(page.locator('#notes-history-summary')).to_contain_text('2026-08')
  page.locator('#notes-history-label').select_option('')
  expect(page.locator('#notes-history-status')).to_contain_text('本月没有已同步记录')
  page.locator('[data-notes-month=next]').click();expect(page.locator('#notes-history-summary')).to_contain_text('2026-09')
  page.route('**/api/v1/note-entries/month?month=2026-07',lambda route:route.fulfill(status=503,content_type='application/json',body='{"error":{"message":"合成错误"}}'))
  page.locator('#notes-history-month').fill('2026-07')
  expect(page.locator('#notes-history-status')).to_contain_text('读取失败')
  assert page.locator('#notes-history-month').input_value()=='2026-09'
  expect(page.locator('[data-notes-history-day="2026-09-01"]')).to_contain_text('兴趣月历合成')
  page.unroute('**/api/v1/note-entries/month?month=2026-07')
  page.locator('#notes-history-month').fill('2026-07')
  expect(page.locator('#notes-history-summary')).to_contain_text('2026-07')
  page.locator('#notes-history-month').fill('2026-09')
  expect(page.locator('#notes-history-summary')).to_contain_text('2026-09')
  page.locator('#notes-history-date').select_option('2026-09-01')
  page.locator('aside [data-nav=todos]').first.click()
  expect(page.locator('#todo-main')).to_be_visible()
  page.locator('aside [data-nav=notes]').first.click()
  expect(page.locator('#notes-history')).to_be_visible()
  expect(page.locator('#notes-history-summary')).to_contain_text('2026-09')
  assert page.locator('#notes-history-date').input_value()=='2026-09-01'
  expect(page.locator('#notes-history-list')).to_contain_text('兴趣月历合成')
  for width in (1440,375,390):
   page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),('overflow',width)
  assert not errors,errors
  calls=request.get('/__offline-test/calls').json();months=[call for call in calls if call['path']=='/api/v1/note-entries/month']
  assert len(months)==7, (len(months),month_urls)
  print(json.dumps({'synthetic':True,'real_worker':True,'monday_first':True,'month_filter_day_week':True,
    'empty_and_error':True,'month_requests':len(months),'widths':[1440,375,390],'pageerrors':errors},ensure_ascii=False))
  browser.close()
finally:
 server.terminate();server.wait(timeout=8)
