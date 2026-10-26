"""Round six: published-only result UI, real loopback Worker/D1, synthetic data."""
import json,re,select,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/workbench-round6';OUT.mkdir(parents=True,exist_ok=True)
report={'synthetic':True,'baseline':'16ff80ef2d857676d81b7c219110c820de5af72b','completed':False,'checks':[],
        'pageerrors':[],'http_errors':[],'captures':[]}
server=None
def mark(text):report['checks'].append(text);print('Passed: '+text,flush=True)
def snap(page,name):
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),name
 for block in page.locator('#page-content > .entry-ready').all():
  block.scroll_into_view_if_needed();expect(block).to_have_class(re.compile(r'\bentry-visible\b'))
 page.evaluate('scrollTo(0,0)')
 page.screenshot(path=str(OUT/(name+'.png')),full_page=True,animations='disabled');report['captures'].append(name+'.png')
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium')
  for width in [1440,375,390]:
   server=subprocess.Popen(['node','tests/workbench-round5-browser-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
   assert select.select([server.stdout],[],[],45)[0];origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
   context=browser.new_context(viewport={'width':width,'height':1000 if width>600 else 844},is_mobile=width<600,
                               has_touch=width<600,locale='zh-CN',timezone_id='Asia/Shanghai')
   page=context.new_page();page.set_default_timeout(20000);requests=[]
   page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
   page.on('response',lambda r:report['http_errors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
   page.on('request',lambda r:requests.append(r.url))
   initial=page.request.get(origin+'/__fixture').json();assert initial['count']==80
   page.goto(origin+'/?page=dashboard');expect(page.locator('.dashboard-stats')).to_contain_text('已发布文章')
   expect(page.locator('.dashboard-stats .stat').first.locator('dd')).to_have_text('15')
   assert page.locator('.article-status-stats,.article-writer-details,.todo-panel,.cycle-panel,[data-action=overview-period],'
                       '[data-action=new-daily],.media-publishing-details').count()==0
   assert page.locator('.media-page-tabs a').all_text_contents()==['数据总览','文章详情']
   results=page.locator('.dashboard-results');card=results.locator('section.card')
   assert abs(results.bounding_box()['width']-card.bounding_box()['width'])<3
   page.locator('#global-account').select_option(initial['accounts'][0])
   expect(page.locator('.dashboard-stats .stat').first.locator('dd')).to_have_text('5')
   page.locator('#global-account').select_option('');expect(page.locator('.dashboard-stats .stat').first.locator('dd')).to_have_text('15')
   snap(page,'overview-'+str(width));mark('three retired overview areas absent, account card fills width, published counts 15/all and 5/account '+str(width))

   page.goto(origin+'/?page=articles&status=all');expect(page.locator('.article-list .pagination')).to_contain_text('15')
   assert not any(value in page.url for value in ['status=all','status=unknown','status=drafting'])
   assert page.locator('#article-filters [name=status]').count()==0
   page.locator('#page-size').select_option('10');expect(page.locator('.article-cards .title-cell')).to_have_count(10)
   page.locator('[data-action=list-next]').click();expect(page.locator('.article-cards .title-cell')).to_have_count(5)
   page.locator('[data-action=list-prev]').click();expect(page.locator('.article-cards .title-cell')).to_have_count(10)
   page.locator('#page-size').select_option('100');expect(page.locator('.article-cards .title-cell')).to_have_count(15)
   page.locator('#global-account').select_option(initial['accounts'][0]);expect(page.locator('.article-cards .title-cell')).to_have_count(5)
   page.locator('#global-account').select_option('');expect(page.locator('.article-cards .title-cell')).to_have_count(15)
   search=page.locator('#article-filters input[name=q]');search.fill('合成文章46');search.press('Enter')
   expect(page.locator('.article-cards .title-cell')).to_have_count(1);expect(page.locator('.article-cards')).to_contain_text('合成文章46')
   expect(page.locator('.article-cards')).to_contain_text('0')
   search.fill('合成文章01');search.press('Enter');expect(page.locator('.article-cards .title-cell')).to_have_count(0)
   expect(page.locator('.article-list .pagination')).to_contain_text('0')
   search.fill('');search.press('Enter');expect(page.locator('.article-cards .title-cell')).to_have_count(15)
   page.locator('[data-action=article-filter]').click();expect(page.locator('#filter-panel')).to_be_visible()
   assert page.locator('#filter-panel select[name=status]').count()==0
   page.keyboard.press('Escape');snap(page,'articles-'+str(width))
   mark('published-only old URL, all/single account, server pagination, search excludes drafts and no status dropdown '+str(width))

   page.goto(origin+'/?page=notes');expect(page.locator('#notes-entry-list .note-entry-saved')).to_have_count(2)
   expect(page.locator('#notes-status')).to_be_hidden()
   for node in page.locator('#notes-entry-list time:visible').all():expect(node).to_have_text(re.compile(r'^\d{2}:\d{2}$'))
   assert '修改' not in page.locator('#notes-entry-list').inner_text()
   snap(page,'notes-'+str(width));page.locator('.notes-categories [data-notes-category=work]').click()
   expect(page.locator('#notes-entry-list .note-entry-saved')).to_have_count(1);expect(page.locator('#notes-status')).to_be_hidden()
   expect(page.locator('#notes-entry-list time:visible')).to_have_text(re.compile(r'^\d{2}:\d{2}$'))
   mark('life/work normal autosave badge hidden and saved record times are HH:mm only '+str(width))
   from urllib.parse import urlparse,parse_qs
   article_reads=[url for url in requests if urlparse(url).path=='/api/v1/articles']
   assert article_reads and all(parse_qs(urlparse(url).query).get('status')==['published'] for url in article_reads)
   assert not any('/article-reconciliation' in url for url in requests)
   final=page.request.get(origin+'/__fixture').json();assert final['count']==80 and final['hash']==initial['hash']
   mark('eighty original synthetic article/observation rows unchanged; every article read explicitly published '+str(width))
   context.close();server.terminate();server.wait(timeout=10);server=None
  assert not report['pageerrors'] and not report['http_errors'];report['completed']=True;browser.close()
finally:
 if server:
  server.terminate()
  try:server.wait(timeout=10)
  except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
