"""Local synthetic data only. Run review-trends-browser-server.mjs first."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/data-trends';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:8921'
URL=ORIGIN+'/?page=review&account=V%E5%AD%97&review_section=trends'
CLOCK="""const NativeDate=Date;globalThis.Date=class extends NativeDate {
constructor(...args){super(...(args.length?args:['2026-11-10T04:00:00Z']));}
static now(){return 1794283200000;}};"""
report={'synthetic':True,'checks':[],'screenshots':[],'writes':[],'page_errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in [1440,390,375]:
        context=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Asia/Shanghai',reduced_motion='reduce')
        context.add_init_script(CLOCK)
        context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(ORIGIN+'/') else route.abort())
        page=context.new_page()
        page.on('pageerror',lambda error:report['page_errors'].append(str(error)))
        page.on('request',lambda request:report['writes'].append({'method':request.method,'path':request.url.split(ORIGIN)[-1]}) if request.method not in ['GET','HEAD'] else None)
        page.goto(URL)
        expect(page.locator('.review-trends')).to_be_visible(timeout=20000)
        expect(page.locator('[data-review-trend="range"]')).to_have_value('7d')
        expect(page.locator('.review-trend-stat').nth(1).locator('strong')).to_have_text('—')
        expect(page.locator('.review-trend-warning')).to_contain_text('未满24h暂定 1 篇')
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
        screenshot=OUT/f'trends-{width}.png'
        page.locator('.review-secondary').screenshot(path=str(screenshot))
        report['screenshots'].append(str(screenshot.relative_to(ROOT)))
        page.select_option('[data-review-trend="range"]','30d')
        page.locator('.review-trend-details summary').click()
        expect(page.locator('.review-trend-table tbody tr')).to_have_count(30)
        page.select_option('[data-review-trend="range"]','custom')
        page.locator('[data-review-trend="from"]').fill('2026-11-06')
        page.locator('[data-review-trend="from"]').dispatch_event('change')
        page.locator('[data-review-trend="to"]').fill('2026-11-08')
        page.locator('[data-review-trend="to"]').dispatch_event('change')
        page.locator('.review-trend-details summary').click()
        expect(page.locator('.review-trend-table tbody tr')).to_have_count(3)
        page.select_option('[data-review-trend="metric"]','average_ctr')
        expect(page.locator('.review-trend-chart svg')).to_have_attribute('aria-label',__import__('re').compile('平均点击率'))
        page.reload()
        expect(page.locator('[data-review-trend="range"]')).to_have_value('custom',timeout=20000)
        expect(page.locator('[data-review-trend="from"]')).to_have_value('2026-11-06')
        expect(page.locator('[data-review-trend="metric"]')).to_have_value('average_ctr')
        page.locator('[data-review-secondary="review"]').click()
        expect(page.locator('.review-trends')).to_have_count(0)
        page.locator('[data-review-secondary="trends"]').click()
        expect(page.locator('[data-review-trend="range"]')).to_have_value('custom')
        page.locator('[data-review-secondary="trends"]').focus()
        page.keyboard.press('ArrowLeft')
        expect(page.locator('[data-review-secondary="review"]')).to_have_attribute('aria-selected','true')
        page.keyboard.press('End')
        expect(page.locator('[data-review-secondary="trends"]')).to_have_attribute('aria-selected','true')
        page.locator('[data-review-trend="from"]').fill('2026-11-09')
        page.locator('[data-review-trend="from"]').dispatch_event('change')
        expect(page.locator('.review-trends [role="alert"]')).to_contain_text('结束日期不能早于')
        page.select_option('[data-review-trend="range"]','7d')
        page.select_option('.review-trends [data-review-filter="verdict"]','爆')
        expect(page.locator('.review-trends .review-note').filter(has_text='有发布时间记录')).to_contain_text('6 篇')
        page.select_option('.review-trends [data-review-filter="verdict"]','')
        if width==1440:
            page.route('**/api/v1/review/articles?**',lambda route:route.abort())
            page.locator('.review-trends [data-review-action="refresh"]').click()
            expect(page.locator('#content-review [role="alert"]')).to_contain_text('内容复盘读取失败')
            expect(page.locator('.review-trends')).to_have_count(0)
            page.unroute('**/api/v1/review/articles?**')
            page.locator('#content-review [data-review-action="refresh"]').click()
            expect(page.locator('.review-trends')).to_be_visible(timeout=20000)
        page.goto(ORIGIN+'/?page=review&account=V%E5%AD%97&review_section=review')
        page.go_back()
        expect(page.locator('.review-trends')).to_be_visible(timeout=20000)
        page.go_forward()
        expect(page.locator('[data-review-secondary="review"]')).to_have_attribute('aria-selected','true')
        report['checks'].append({'width':width,'status':'passed','flows':['default7','30d','custom','metric','refresh','tabs','keyboard','invalid-range','verdict','back-forward','no-overflow']})
        context.close()
    browser.close()
assert not report['writes'],report['writes']
assert not report['page_errors'],report['page_errors']
report['status']='passed'
(OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
