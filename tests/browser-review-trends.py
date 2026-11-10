"""Local synthetic data only. Run review-trends-browser-server.mjs first."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/data-trends';OUT.mkdir(parents=True,exist_ok=True)
ORIGIN='http://127.0.0.1:8921'
URL=ORIGIN+'/?page=review&account=V%E5%AD%97&review_section=trends'
CLOCK="""const NativeDate=Date;globalThis.Date=class extends NativeDate {
constructor(...args){super(...(args.length?args:['2026-11-10T04:00:00Z']));}
static now(){return 1794283200000;}};"""
report={'synthetic':True,'checks':[],'screenshots':[],'writes':[],'page_errors':[],
        'http_errors':[], 'service_workers':'blocked for deterministic network-failure injection; separate service-worker regressions apply'}
widths=[1440,390,375]
if os.environ.get('TRENDS_BROWSER_WIDTH'):
    width=int(os.environ['TRENDS_BROWSER_WIDTH'])
    assert width in widths,'Unsupported test width'
    widths=[width]
def assert_readable_trends(page, width, phase):
    geometry=page.locator('.review-trends').evaluate("""section => {
        const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
        const controls=[...section.querySelectorAll('.review-trend-controls select')].map(select=>{
            const style=getComputedStyle(select);context.font=style.font;
            const textWidth=Math.max(...[...select.options].map(option=>context.measureText(option.text).width));
            const rect=select.getBoundingClientRect();
            const padding=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);
            return {label:select.parentElement.firstChild.textContent.trim(),width:rect.width,
                available:select.clientWidth-padding,textWidth,fontSize:parseFloat(style.fontSize)};
        });
        const chart=section.querySelector('.review-trend-chart').getBoundingClientRect();
        const labels=[...section.querySelectorAll('.review-trend-chart text')].map(text=>{
            const matrix=text.getScreenCTM(),rect=text.getBoundingClientRect();
            return {text:text.textContent,fontSize:parseFloat(getComputedStyle(text).fontSize)*Math.hypot(matrix.c,matrix.d),
                height:rect.height,left:rect.left,right:rect.right};
        });
        const points=[...section.querySelectorAll('.review-trend-point')].map(point=>{
            const rect=point.getBoundingClientRect();return {width:rect.width,height:rect.height};
        });
        return {controls,labels,points,chart:{left:chart.left,right:chart.right}};
    }""")
    assert len(geometry['controls'])==3,geometry
    for control in geometry['controls']:
        assert control['width']>=140,(width,phase,'narrow trend control',control)
        assert control['fontSize']>=14,(width,phase,'small control text',control)
        assert control['available']>=control['textWidth']+4,(width,phase,'clipped option label',control)
    assert len(geometry['labels'])>=4,geometry
    for label in geometry['labels']:
        assert label['fontSize']>=12 and label['height']>=12,(width,phase,'scaled-down chart label',label)
        assert label['left']>=geometry['chart']['left']-1,(width,phase,'clipped left axis',label)
        assert label['right']<=geometry['chart']['right']+1,(width,phase,'clipped right axis',label)
    assert geometry['points'],geometry
    for point in geometry['points']:
        # Percentage positions can round an 8px DOM rectangle by a few ten-thousandths of a pixel.
        assert point['width']+0.001>=8 and point['height']+0.001>=8,(width,phase,'scaled-down chart point',point)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth+1')
    report.setdefault('readability',[]).append({'width':width,'phase':phase,**geometry})

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for width in widths:
        context=browser.new_context(viewport={'width':width,'height':1000},timezone_id='Asia/Shanghai',reduced_motion='reduce',service_workers='block')
        context.add_init_script(CLOCK)
        context.route('**/*',lambda route: route.continue_() if route.request.url.startswith(ORIGIN+'/') else route.abort())
        page=context.new_page()
        page.on('response',lambda response:report['http_errors'].append({'status':response.status,'url':response.url}) if response.status>=400 else None)
        page.on('pageerror',lambda error:report['page_errors'].append(str(error)))
        page.on('request',lambda request:report['writes'].append({'method':request.method,'path':request.url.split(ORIGIN)[-1]}) if request.method not in ['GET','HEAD'] else None)
        try:
            page.goto(URL)
            expect(page.locator('.review-trends')).to_be_visible(timeout=20000)
            expect(page.locator('[data-review-trend="range"]')).to_have_value('7d')
            expect(page.locator('.review-trend-stat').nth(1).locator('strong')).to_have_text('—')
            expect(page.locator('.review-trend-warning')).to_contain_text('未满24h暂定 1 篇')
            assert_readable_trends(page,width,'default7')
            screenshot=OUT/f'trends-{width}.png'
            page.locator('.review-secondary').screenshot(path=str(screenshot))
            report['screenshots'].append(str(screenshot.relative_to(ROOT)))
            page.select_option('[data-review-trend="range"]','30d')
            assert_readable_trends(page,width,'30d')
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
            assert_readable_trends(page,width,'custom-ctr')
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
                blocked=[]
                def fail_articles(route):
                    blocked.append(route.request.url)
                    route.abort()
                page.route('**/api/v1/review/articles?**',fail_articles)
                page.locator('.review-trends [data-review-action="refresh"]').click()
                expect(page.locator('#content-review [role="alert"]')).to_contain_text('内容复盘读取失败')
                assert blocked,'The failed refresh must actually intercept an article read'
                expect(page.locator('.review-trends')).to_have_count(0)
                page.unroute('**/api/v1/review/articles?**')
                page.locator('#content-review [data-review-action="refresh"]').click()
                expect(page.locator('.review-trends')).to_be_visible(timeout=20000)
            page.goto(ORIGIN+'/?page=review&account=V%E5%AD%97&review_section=review')
            page.go_back()
            expect(page.locator('.review-trends')).to_be_visible(timeout=20000)
            page.go_forward()
            expect(page.locator('[data-review-secondary="review"]')).to_have_attribute('aria-selected','true')
            report['checks'].append({'width':width,'status':'passed','flows':['default7','30d','custom','metric','refresh','tabs','keyboard','invalid-range','verdict','back-forward','no-overflow','control-label-width','chart-text-size','chart-point-size']})
        except Exception as error:
            report['status']='failed'
            report['failure']={'width':width,'url':page.url,'error':str(error),'text':page.locator('body').inner_text()}
            page.screenshot(path=str(OUT/f'trends-failure-{width}.png'),full_page=True)
            (OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
            print(json.dumps(report,ensure_ascii=False,indent=2))
            raise
        finally:
            context.close()
    browser.close()
assert not report['writes'],report['writes']
assert not report['page_errors'],report['page_errors']
report['status']='passed'
(OUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
