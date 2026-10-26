"""Fifth-round UI acceptance: real local Worker/D1; no production writes or personal screenshots."""
import json,select,subprocess
from pathlib import Path
from datetime import date,timedelta
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-round5';OUT.mkdir(parents=True,exist_ok=True)
report={'synthetic':True,'baseline':'ae1fafe292755ba01df5a8a639b74245eec72752','completed':False,'checks':[],'pageerrors':[],'http_errors':[],'captures':[]}
server=None
def mark(text):report['checks'].append(text);print('Passed: '+text,flush=True)
def snap(page,name):
 expect(page.locator('#page-content')).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
 page.screenshot(path=str(OUT/(name+'.png')),full_page=True,animations='disabled');report['captures'].append(name+'.png')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium')
  for width in [1440,375,390]:
   server=subprocess.Popen(['node','tests/workbench-round5-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   assert select.select([server.stdout],[],[],45)[0];origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
   page=context.new_page();page.set_default_timeout(20000);page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
   page.on('response',lambda r:report['http_errors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
   initial=page.request.get(origin+'/__fixture').json();today=initial['today'];assert initial['count']==80
   page.goto(origin+'/?page=dashboard&article_scope=reconciliation');expect(page.locator('.article-status-stats')).to_contain_text('80')
   expect(page.locator('h1')).to_have_text('数据总览');assert 'article_scope' not in page.url
   assert page.locator('.media-subnav,.mobile-media-nav,[data-action=article-overview-mode]').count()==0
   assert page.locator('.media-page-tabs a').all_text_contents()==['数据总览','文章详情']
   nav=page.locator('.mobile-nav' if width<600 else '.sidebar');assert nav.locator('.media-link').count()==1
   snap(page,'overview-'+str(width));page.locator('.media-page-tabs [data-nav=articles]').click()
   expect(page.locator('h1')).to_have_text('文章详情');expect(page.locator('.article-list .pagination')).to_contain_text('80')
   assert page.locator('#global-account').input_value()=='';page.locator('#page-size').select_option('100')
   expect(page.locator('.article-cards .title-cell')).to_have_count(80)
   page.locator('#global-account').select_option(initial['accounts'][0]);expect(page.locator('.article-list .pagination')).to_contain_text('27')
   expect(page.locator('.article-cards .title-cell')).to_have_count(27)
   page.locator('#global-account').select_option('');expect(page.locator('.article-cards .title-cell')).to_have_count(80)
   page.locator('#article-filters select[name=status]').select_option('unknown');expect(page.locator('.article-cards .title-cell')).to_have_count(5)
   unknown=initial['ids']['articles'][75]['id'];page.locator('[data-action=article-detail][data-id="'+unknown+'"]').click()
   expect(page.locator('.modal-body')).to_contain_text('状态未确认');expect(page.locator('.modal-body')).to_contain_text('合成真实来源')
   assert page.locator('.modal-body [data-action=review-article]').count()==0;page.locator('[data-action=close-modal]').click()
   page.locator('#article-filters select[name=status]').select_option('all');expect(page.locator('.article-cards .title-cell')).to_have_count(80)
   snap(page,'articles-'+str(width));page.go_back();expect(page.locator('#page-content')).to_be_visible();page.go_forward();expect(page.locator('h1')).to_have_text('文章详情')
   mark('single media entry, exactly two pages, complete eighty records, account switch and unknown metrics '+str(width))
   page.goto(origin+'/?page=todos');expect(page.locator('#todo-inline-templates .todo-template-chip')).to_have_count(3)
   expect(page.locator('#todo-inline-templates .todo-template-chip').first).to_be_enabled();field=page.locator('#todo-text');field.focus()
   assert field.evaluate("e=>getComputedStyle(e).outlineStyle==='none'&&getComputedStyle(e).borderColor!=='rgb(168, 78, 51)'")
   first=initial['ids']['templates'][0]['id'];chip=page.locator('#todo-inline-templates [data-id="'+first+'"]');chip.click()
   expect(chip).to_be_disabled();expect(chip).to_contain_text('今日已添加');expect(page.locator('.daily-todo-text')).to_have_count(1)
   chip.evaluate('e=>e.click()');expect(page.locator('.daily-todo-text')).to_have_count(1)
   page.locator('[data-action=todo-panel][data-panel=history]').click();future=(date.fromisoformat(today)+timedelta(days=2)).isoformat()
   page.locator('#todo-date').fill(future);page.locator('#todo-date').dispatch_event('change');expect(chip).to_be_enabled();chip.click()
   expect(chip).to_contain_text('当日已添加');expect(chip).to_be_disabled();expect(page.locator('#todo-form')).to_have_attribute('data-date',future)
   page.locator('#todo-history [data-action=todo-panel-close]').click();expect(chip).to_contain_text('今日已添加')
   snap(page,'todos-'+str(width));mark('quiet todo focus, immediate inline templates, exact date feedback and duplicate guard '+str(width))
   page.goto(origin+'/?page=notes');expect(page.locator('#notes-entry-list .note-entry-saved')).to_have_count(2)
   assert page.locator('.notes-history,#notes-entry-list textarea').count()==0;expect(page.locator('#notes-composer')).to_be_hidden()
   card=page.locator('#notes-entry-list .note-entry-saved').first;assert card.bounding_box()['height']<160
   expect(card.locator('time')).to_contain_text('修改');page.locator('[data-notes-action=new]').click()
   expect(page.locator('#notes-composer')).to_be_visible();editor=page.locator('#notes-composer textarea:not([hidden])')
   editor.fill('合成新记录，自动保存后收起');expect(page.locator('#notes-active-entry .note-entry-status')).to_have_text('已保存')
   assert page.locator('#notes-composer').bounding_box()['y']<page.locator('#notes-entry-list .note-entry-saved').first.bounding_box()['y']
   page.locator('[data-notes-action=collapse]').click();expect(page.locator('#notes-composer')).to_be_hidden();expect(page.locator('#notes-entry-list .note-entry-saved')).to_have_count(3)
   saved=page.locator('#notes-entry-list .note-entry-saved').filter(has_text='合成新记录，自动保存后收起');saved.locator('.note-entry-edit').click();editor=page.locator('#notes-composer textarea:not([hidden])')
   expect(editor).to_have_value('合成新记录，自动保存后收起');editor.fill('合成新记录，重新编辑不丢失')
   expect(page.locator('#notes-active-entry .note-entry-status')).to_have_text('已保存');page.locator('[data-notes-action=collapse]').click()
   expect(page.locator('#notes-composer')).to_be_hidden();expect(page.locator('#notes-entry-list .note-entry-saved').filter(has_text='合成新记录，重新编辑不丢失')).to_be_visible()
   page.reload();expect(page.locator('#notes-entry-list .note-entry-saved')).to_have_count(3);expect(page.locator('#notes-composer')).to_be_hidden()
   snap(page,'notes-'+str(width));page.locator('.notes-categories [data-notes-category=work]').click();expect(page.locator('#notes-entry-list .note-entry-saved')).to_have_count(1)
   expect(page.locator('.note-entry-reader:visible')).to_have_text('合成工作记录');mark('top editor, compact saved edit-time/full-body records, re-edit, reload and category isolation '+str(width))
   final=page.request.get(origin+'/__fixture').json();assert final['count']==80 and final['hash']==initial['hash']
   mark('eighty article IDs and all stored article/metric bytes untouched '+str(width))
   context.close();server.terminate();server.wait(timeout=10);server=None
  assert not report['pageerrors'] and not report['http_errors'];report['completed']=True;browser.close()
finally:
 if server:
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
