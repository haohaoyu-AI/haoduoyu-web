import os,subprocess,time,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
p=subprocess.Popen(['node','tests/unify-offline-notes-browser-server.mjs'],cwd=root,env={**os.environ,'DAILY_NOTES_REAL_BACKEND':'1'},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 origin=p.stdout.readline().strip(); assert origin.startswith('http://127.0.0.1:'),origin
 with sync_playwright() as w:
  browser=w.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  ctx=browser.new_context(viewport={'width':390,'height':850},timezone_id='Asia/Shanghai')
  ctx.route('**/*',lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
  probe=w.request.new_context(base_url=origin,extra_http_headers={'X-Note-Labels-Version':'1'})
  page=ctx.new_page(); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(origin+'/?page=notes');expect(page.locator('#daily-notes')).to_be_visible(timeout=15000)
  page.locator('#notes-new-label').fill('兴趣');page.locator('[data-notes-action=create-label]').click()
  expect(page.locator('#notes-compose-label')).to_have_value('兴趣',timeout=10000)
  page.locator('[data-notes-action=new]').click(); page.locator('[data-note-entry-editor]').fill('离线标签合成正文')
  send=page.get_by_role('button',name='发送',exact=True)
  expect(send).to_be_visible()
  page.mouse.move(0,0)
  visual=send.evaluate("""el=>{const s=getComputedStyle(el), arrow=getComputedStyle(el,'::before'), r=el.getBoundingClientRect();return {width:r.width,height:r.height,radius:s.borderRadius,background:s.backgroundColor,color:arrow.color,content:arrow.content}}""")
  assert visual['width']>=44 and visual['height']>=44,visual
  assert visual['radius']=='50%' and visual['background']=='rgb(18, 102, 214)',visual
  assert visual['color']=='rgb(255, 255, 255)' and '↑' in visual['content'],visual
  page.wait_for_timeout(500); page.reload()
  expect(page.locator('#notes-compose-label option[value=兴趣]')).to_have_count(1,timeout=15000)
  page.locator('#notes-compose-label').select_option('兴趣')
  expect(page.locator('[data-note-entry-editor]')).to_have_value('离线标签合成正文',timeout=10000)
  day=page.locator('#notes-date').input_value(); url='/api/v1/note-entries?category=life&date='+day
  assert not probe.get(url).json()['data']['entries'], 'unsent draft visible to server'
  page.evaluate("window._syntheticOnlineEvents=[]; for(const name of ['online','offline']) window.addEventListener(name,()=>window._syntheticOnlineEvents.push([name,navigator.onLine]));")
  ctx.set_offline(True); page.wait_for_timeout(300); page.locator('[data-note-entry-action=save]').click()
  expect(page.locator('#daily-notes')).to_contain_text('待同步',timeout=10000)
  assert not probe.get(url).json()['data']['entries'], 'offline queued item already on server'
  ctx.set_offline(False)
  deadline=time.monotonic()+20; rows=[]
  while time.monotonic()<deadline:
   response=probe.get(url); rows=response.json()['data']['entries'];
   if rows: break
   page.wait_for_timeout(500)
  debug=page.evaluate("""async()=>{const db=await new Promise((ok,fail)=>{let r=indexedDB.open('haoduoyu-offline');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});const rows=await new Promise((ok,fail)=>{let r=db.transaction('outbox').objectStore('outbox').getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});db.close();return {online:navigator.onLine,events:window._syntheticOnlineEvents,sw:!!navigator.serviceWorker.controller,operations:rows.map(o=>({status:o.status,attempts:o.attempts,next_attempt_at:o.next_attempt_at,error_code:o.error_code}))}}""")
  calls=probe.get('/__offline-test/calls').json();print('DEBUG',json.dumps({'state':debug,'requests':[{'method':x.get('method'),'path':x.get('path'),'status':x.get('status')} for x in calls if x.get('path','').startswith('/api/v1/note-entries')][-15:]},ensure_ascii=False))
  assert len(rows)==1 and rows[0].get('label')=='兴趣' and rows[0].get('labels_version')==1,rows
  page.reload(); expect(page.locator('#notes-compose-label option[value=兴趣]')).to_have_count(1,timeout=15000)
  page.locator('#notes-compose-label').select_option('兴趣')
  expect(page.locator('#notes-entry-list')).to_contain_text('离线标签合成正文',timeout=10000)
  page.locator('[data-notes-view=history]').click()
  expect(page.locator('#notes-history-list')).to_contain_text('离线标签合成正文',timeout=10000)
  page.locator('#notes-history-label').select_option('兴趣')
  expect(page.locator('#notes-history-list')).to_contain_text('离线标签合成正文')
  page.locator('#notes-history-label').select_option('工作')
  assert '离线标签合成正文' not in page.locator('#notes-history-list').inner_text()
  for width in (375,390):
   page.set_viewport_size({'width':width,'height':850}); page.wait_for_timeout(150)
   assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), ('overflow',width)
  page.locator('[data-notes-view=today]').click()
  page.locator('#notes-compose-label').select_option('兴趣')
  page.locator('[data-notes-action=new]').click()
  page.locator('[data-note-entry-editor]').fill('在线发送反馈合成记录')
  page.locator('[data-note-entry-action=save]').click()
  expect(page.locator('#daily-notes')).to_contain_text('发送成功',timeout=10000)
  assert not errors,errors
  print(json.dumps({'synthetic':True,'unsent_server_count':0,'offline_feedback':'待同步','synchronized_count':len(rows),'label':rows[0]['label'],'pageerrors':errors},ensure_ascii=False))
  browser.close()
finally:
 p.terminate();p.wait(timeout=8)
