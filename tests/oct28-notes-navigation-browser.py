"""Category route compatibility in Chromium against a synthetic Worker and temporary D1."""
from datetime import datetime,timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import json,subprocess
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen(['node','tests/unify-offline-notes-browser-server.mjs'],cwd=ROOT,
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
 origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:'),origin
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
  context=browser.new_context(viewport={'width':390,'height':844},locale='zh-CN',timezone_id='Asia/Shanghai')
  context.route('**/*',lambda route:route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
  page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(origin+'/?page=notes');expect(page.locator('#notes-compose-label')).to_have_value('生活',timeout=15000)
  expect(page.locator('#notes-legacy-saved')).to_contain_text('【自动测试】只读原有记录')
  expect(page.locator('.mobile-nav [data-nav=notes]')).to_have_attribute('aria-current','page')
  yesterday=(datetime.now(ZoneInfo('Asia/Shanghai'))-timedelta(days=1)).date().isoformat()
  page.goto(origin+'/?page=notes&notes_category=work&date='+yesterday)
  expect(page.locator('#daily-notes')).to_have_attribute('data-category','work')
  expect(page.locator('#notes-compose-label')).to_have_value('工作')
  expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】快照未打开work')
  page.locator('#notes-compose-label').select_option('生活')
  expect(page.locator('#daily-notes')).to_have_attribute('data-category','life')
  expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】快照未打开life')
  assert '【自动测试】快照未打开work' not in page.locator('#notes-entry-list').inner_text()
  page.go_back();expect(page.locator('#notes-compose-label')).to_have_value('工作')
  expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】快照未打开work')
  page.go_forward();expect(page.locator('#notes-compose-label')).to_have_value('生活')
  expect(page.locator('#notes-entry-list')).to_contain_text('【自动测试】快照未打开life')
  assert not errors,errors
  print(json.dumps({'synthetic':True,'real_worker':True,'default':'生活','deep_link':'工作',
                    'switch_back_forward':True,'legacy_visible':True,'aria_current':True,'pageerrors':errors},ensure_ascii=False))
  browser.close()
finally:
 server.terminate();server.wait(timeout=8)
