"""Loopback-only reconciliation acceptance; temporary D1 and synthetic records."""
from pathlib import Path
import subprocess,json,hashlib
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
out=root/'docs/article-reconciliation-evidence';out.mkdir(exist_ok=True)
server=subprocess.Popen(['node','tests/reconciliation-browser-server.mjs'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
origin=server.stdout.readline().strip();assert origin.startswith('http://127.0.0.1:')
report={'synthetic':True,'real_worker':True,'checks':[],'pageerrors':[],
        'worker_sha256':hashlib.sha256((root/'dist/server/index.js').read_bytes()).hexdigest()}
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in [1440,375]:
   context=browser.new_context(viewport={'width':width,'height':950});page=context.new_page()
   page.on('pageerror',lambda e:report['pageerrors'].append(str(e)))
   page.goto(origin+'/');expect(page.locator('h1')).to_contain_text('每日待办')
   page.goto(origin+'/?page=dashboard')
   page.locator('[data-action="article-overview-mode"][data-mode="reconciliation"]').click()
   expect(page.locator('#reconciliation-results')).to_contain_text('完整授权范围 4 条')
   expect(page.locator('.article-reconciliation')).to_contain_text('应产出：未配置')
   expect(page.locator('.article-reconciliation')).to_contain_text('4（2条）')
   expect(page.locator('.article-reconciliation')).to_contain_text('5–7')
   page.screenshot(path=str(out/('actual-'+str(width)+'.png')),full_page=True)
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),'viewport overflow'
   page.locator('#reconciliation-filters [name="run_date"]').select_option('2026-10-24')
   expect(page.locator('#reconciliation-results tbody tr')).to_have_count(1)
   page.locator('#reconciliation-filters [name="writer"]').select_option('gemini_web')
   expect(page.locator('#reconciliation-results')).to_contain_text('没有符合条件')
   page.reload();expect(page.locator('#reconciliation-results')).to_contain_text('完整授权范围 4 条')
   page.route('**/api/v1/article-reconciliation',lambda route:route.fulfill(status=503,
              content_type='application/json',body='{"error":{"message":"合成读取失败"}}'))
   page.reload();expect(page.locator('.error-panel')).to_contain_text('本次数据读取失败')
   page.unroute('**/api/v1/article-reconciliation')
   page.goto(origin+'/?page=memos');expect(page.locator('#memos')).to_be_visible()
   report['checks'].append(str(width)+' navigation, totals/duplicates/gaps, filters/empty, route, error, todo/memo')
   context.close()
  browser.close()
 assert not report['pageerrors']
 (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False))
finally:
 server.terminate();server.wait(timeout=15)
