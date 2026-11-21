"""Verify the cockpit with synthetic data from review-trends-browser-server.mjs."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ORIGIN = 'http://127.0.0.1:8921'
URL = ORIGIN + '/?page=review&account=V%E5%AD%97'
OUT = Path(os.environ.get('COCKPIT_ARTIFACTS', 'artifacts/review-cockpit-mobile'))
PHASE = os.environ.get('COCKPIT_PHASE', 'after')
CLOCK = "const OriginalDate=Date; globalThis.Date=class extends OriginalDate {" \
        "constructor(...args){super(...(args.length?args:['2026-11-10T04:00:00Z']));}" \
        "static now(){return OriginalDate.parse('2026-11-10T04:00:00Z');}};"


def fixture_request(route):
    request = route.request
    if not request.url.startswith(ORIGIN + '/') or request.method not in ('GET', 'HEAD'):
        route.abort()
        return
    path = urlsplit(request.url).path
    if path not in ('/api/v1/review/articles', '/api/v1/review/snapshots'):
        route.continue_()
        return
    response = route.fetch()
    body = response.json()
    for item in body['data']['items']:
        if path.endswith('/articles'):
            item['title'] += '：用一个较长的合成标题检查排行榜在手机上怎么显示'
        else:
            index = int(item['article_id'].split('-')[-1])
            item['ctr'] = [0, 5, 46, 50, 62, 66, 80, 96, 8, 12][index]
    route.fulfill(response=response, json=body)


def geometry(page):
    return page.locator('.review-overview-metrics').evaluate("""cockpit => {
      const rect = element => {
        const {left,right,top,bottom,width,height} = element.getBoundingClientRect();
        return {left,right,top,bottom,width,height};
      };
      const visible = selector => [...cockpit.querySelectorAll(selector)].filter(el => el.getClientRects().length);
      const points = visible('.review-quadrant-figure text').map(el => ({text:el.textContent, ...rect(el)}));
      const title = cockpit.querySelector('.review-rank-title');
      const bar = cockpit.querySelector('.review-rank-bar');
      const row = cockpit.querySelector('.review-rank-item');
      return {viewport:innerWidth, width:document.documentElement.scrollWidth, points,
        cockpit:rect(cockpit), title:rect(title), bar:rect(bar), row:rect(row),
        stats:visible('.review-stat').map(rect)};
    }""")


def capture(browser, width):
    context = browser.new_context(viewport={'width':width, 'height':960}, is_mobile=width < 600,
                                  has_touch=width < 600, service_workers='block', reduced_motion='reduce')
    context.add_init_script(CLOCK)
    context.route('**/*', fixture_request)
    page = context.new_page()
    errors, writes = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.method) if request.method not in ('GET', 'HEAD') else None)
    page.goto(URL)
    control = page.locator('[data-review-filter="metricsRange"]')
    expect(control).to_be_visible(timeout=20000)
    control.select_option('last')
    expect(page.locator('.review-quadrant-figure svg')).to_be_visible()
    expect(page.locator('.review-rank-item')).to_have_count(7)
    control.evaluate('el => el.blur()')
    current = geometry(page)
    page.screenshot(path=OUT / f'{PHASE}-{width}.png', full_page=True)
    if width < 600:
        page.locator('.review-quadrant-figure').evaluate(
            'chart => window.scrollTo(0, scrollY + chart.getBoundingClientRect().top - 60)')
        page.screenshot(path=OUT / f'{PHASE}-{width}-chart.png')
    if PHASE == 'after':
        check_cockpit(page, current, width)
    assert not errors, errors
    assert not writes, writes
    context.close()
    return current


def check_cockpit(page, current, width):
    assert current['width'] <= width + 1, current
    expect(page.locator('.review-stat')).to_have_count(6)
    first_row = page.locator('.review-rank-item').first
    if width < 600:
        for marker in current['points']:
            assert marker['left'] >= current['cockpit']['left'] - 1, marker
            assert marker['right'] <= current['cockpit']['right'] + 1, marker
        axis = [marker for marker in current['points'] if marker['text'].removesuffix('%').isdigit()
                and marker['text'].endswith('%')]
        assert 4 <= len(axis) <= 6, axis
        assert all(left['right'] + 2 <= right['left'] for left, right in zip(axis, axis[1:])), axis
        assert current['title']['width'] >= width * .55, current['title']
        assert current['title']['height'] >= 44, current['title']
        assert current['bar']['height'] > 0, current['bar']
        expect(first_row.locator('.review-rank-reads')).to_be_visible()
        expect(first_row.locator('.review-rank-ctr')).to_be_visible()
        expect(page.locator('.review-quadrant-guides')).to_be_visible()
    else:
        expect(page.locator('.review-quadrant-guides')).to_be_hidden()
    point = page.locator('.review-quadrant-figure .review-trend-dot').last
    if width < 600:
        point.tap()
    else:
        point.click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    title = first_row.get_by_role('button')
    if width < 600:
        title.tap()
    else:
        title.click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.keyboard.press('Escape')
    control = page.locator('[data-review-filter="metricsRange"]')
    control.select_option('this')
    expect(page.locator('.review-quadrant-figure')).to_be_visible()
    control.select_option('30d')
    expect(page.locator('.review-trends svg')).to_have_count(2)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        executable = os.environ.get('REVIEW_CHROMIUM', '/usr/bin/chromium')
        browser = playwright.chromium.launch(executable_path=executable, args=['--no-sandbox'])
        report = {width:capture(browser, width) for width in (375,390,1280)}
        browser.close()
    (OUT / f'{PHASE}-geometry.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'{PHASE}: 375px, 390px, 1280px cockpit captured')
