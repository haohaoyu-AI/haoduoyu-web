"""One bounded baseline/self/candidate control for native form raster differences."""
from pathlib import Path
import hashlib
import json
import re
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/frontend-modules/raster-control'
OUT.mkdir(parents=True, exist_ok=True)
harness = (ROOT / 'tests/harness.mjs').read_text()
username = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
password = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert username.startswith('synthetic-')
clock = """const NativeDate=Date;globalThis.Date=class extends NativeDate {
constructor(...args){super(...(args.length?args:[1792656000000]));}static now(){return 1792656000000;}};"""
rows = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
    version = browser.version
    for variant, port in [('baseline-a', 8795), ('baseline-b', 8795), ('candidate', 8796)]:
        origin = f'http://127.0.0.1:{port}'
        context = browser.new_context(viewport={'width':1440, 'height':900}, reduced_motion='reduce', timezone_id='Asia/Shanghai')
        context.add_init_script(clock)
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.goto(origin + '/?page=articles');page.locator('#login-form').wait_for()
        page.locator('#username').fill(username);page.locator('#password').fill(password)
        page.locator('#login-form [type=submit]').click();page.locator('#page-content[aria-busy=false]').wait_for()
        for view in ['article-new', 'key', 'snapshot']:
            page.goto(origin + '/?page=' + ('settings&tab=keys' if view == 'key' else 'articles'))
            page.locator('#page-content[aria-busy=false]').wait_for()
            if view == 'article-new':page.locator('[data-action=new-article]').click()
            elif view == 'key':page.locator('[data-action=new-key]').click()
            else:
                page.locator('[data-action=article-menu][data-id=synthetic-ui-7]').click()
                page.locator('.popover [data-action=review-article]').click()
            page.locator('.modal').wait_for()
            controls = page.locator('.modal button:not(:disabled),.modal a[href],.modal input:not(:disabled),.modal select:not(:disabled),.modal textarea:not(:disabled),.modal [tabindex="0"]').filter(visible=True)
            controls.first.focus();page.keyboard.press('Shift+Tab');page.keyboard.press('Tab')
            page.evaluate('document.fonts.ready')
            page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            assert page.locator('input[type=password]').evaluate_all('rows=>rows.every(row=>!row.value)')
            assert page.locator('#created-token').count() == 0
            geometry = page.locator('.modal, .modal *').evaluate_all("""nodes=>nodes.map(node=>{
                const c=getComputedStyle(node);return {tag:node.tagName,id:node.id,rect:node.getBoundingClientRect().toJSON(),
                style:['font','color','backgroundColor','border','borderRadius','outline','boxShadow','opacity','transform'].map(k=>[k,c[k]])};})""")
            for full in [False, True]:
                file = OUT / f'{variant}-{view}-{"full" if full else "viewport"}.png'
                page.screenshot(path=str(file), full_page=full, animations='disabled')
                rows.append({'variant':variant,'view':view,'full_page':full,'file':str(file.relative_to(ROOT)),
                    'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'geometry':geometry})
            page.keyboard.press('Escape')
            print(variant + ': ' + view, flush=True)
        context.close()
    browser.close()
comparisons = []
for view in ['article-new','key','snapshot']:
    for full in [False, True]:
        source = next(row for row in rows if row['variant']=='baseline-a' and row['view']==view and row['full_page']==full)
        a = Image.open(ROOT / source['file']).convert('RGB')
        for variant in ['baseline-b','candidate']:
            target = next(row for row in rows if row['variant']==variant and row['view']==view and row['full_page']==full)
            b = Image.open(ROOT / target['file']).convert('RGB');d=ImageChops.difference(a,b)
            mask=ImageChops.lighter(ImageChops.lighter(d.getchannel('R'),d.getchannel('G')),d.getchannel('B'))
            comparisons.append({'view':view,'full_page':full,'against':variant,'pixels_changed':a.width*a.height-mask.histogram()[0],
                'max_channel_delta':mask.getextrema()[1],'bbox':mask.getbbox(),'geometry_equal':source['geometry']==target['geometry']})
report={'browser_version':version,'browser_tool_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'candidate_app_sha256':hashlib.sha256((ROOT/'public/app.js').read_bytes()).hexdigest(),'captures':rows,'comparisons':comparisons}
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(comparisons,indent=2))
