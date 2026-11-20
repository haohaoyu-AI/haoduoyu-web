"""Read-only browser regression. Start tests/review-trends-browser-server.mjs first."""
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ORIGIN = 'http://127.0.0.1:8921'
URL = ORIGIN + '/?page=review&account=V%E5%AD%97&review_section=articles'
OUT = Path(os.environ.get('REVIEW_ARTICLE_SCREENSHOTS', 'artifacts/review-article-list'))
TITLE = '标题归类'
ARTICLE = '正文结构'
DRAFT = '77777777-7777-4777-8777-777777777777'
UNMATCHED = '88888888-8888-4888-8888-888888888888'


def fixture_request(route, with_tags=True):
    request = route.request
    if not request.url.startswith(ORIGIN + '/') or request.method not in ('GET', 'HEAD'):
        route.abort()
        return
    path = urlsplit(request.url).path
    if path == '/api/v1/review/ai/tags':
        tags = {}
        if with_tags:
            for i in range(11):
                key = f'22222222-2222-4222-8222-{i:012}'
                tags[key] = {TITLE: '反差疑问' if i < 6 else '数字切入',
                             ARTICLE: '事件复盘' if i % 2 == 0 else '经历叙述'}
            tags['22222222-2222-4222-8222-000000000010'][TITLE] = '其他'
        route.fulfill(json={'data': {'dimensions': [ARTICLE, TITLE] if with_tags else [], 'tags': tags}})
    elif path == '/api/v1/review/articles':
        response = route.fetch()
        body = response.json()
        articles = body['data']['items']
        for index, article in enumerate(articles):
            if article['published_at']:
                article['published_at'] += 'T01:30:00Z'
            else:
                article['publish_status'] = 'pending'
            if index == 0:
                article['title'] += '：用于检查长标题的省略展示和完整标题提示的额外文字'
        articles += [
            {'id': DRAFT, 'account': 'V字', 'title': '合成草稿：在雨天整理资料',
             'draft_saved_at': '2026-11-11T04:00:00Z', 'publish_status': 'pending'},
            {'id': UNMATCHED, 'account': 'V字', 'title': '合成待核对记录',
             'published_at': '2026-11-10', 'publish_status': 'unmatched'},
        ]
        route.fulfill(response=response, json=body)
    else:
        route.continue_()


def check_layout(page, width, row):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    assert row.locator('button[data-review-article]').evaluate(
        'element => element.title === element.textContent')
    if width == 375:
        assert row.evaluate('row => getComputedStyle(row).display') == 'grid'
        boxes = [row.locator('.review-cell-' + key).bounding_box()
                 for key in ('title', 'published', 'title-pattern', 'reads', 'ctr', 'verdict')]
        assert boxes[0]['y'] < boxes[1]['y']
        assert max(box['y'] for box in boxes[1:]) - min(box['y'] for box in boxes[1:]) < 2
        expect(row.locator('.review-cell-article-pattern')).to_be_hidden()
        expect(row.locator('.review-cell-completion_rate')).to_be_hidden()
    else:
        assert row.evaluate('row => getComputedStyle(row).display') == 'table-row'
        assert len(row.locator('td:visible').all()) == 8


def review_modes(browser, width):
    context = browser.new_context(
        viewport={'width': width, 'height': 960 if width == 375 else 900},
        timezone_id='America/Los_Angeles', is_mobile=(width == 375), has_touch=(width == 375),
        service_workers='block', reduced_motion='reduce',
    )
    context.route('**/*', fixture_request)
    page = context.new_page()
    errors = []
    writes = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.method) if request.method not in ('GET', 'HEAD') else None)
    page.goto(URL)
    table = page.locator('.review-articles-table')
    first_row = page.locator('[data-review-row]:visible').first
    title_mode = page.get_by_role('button', name='按标题套路', exact=True)
    article_mode = page.get_by_role('button', name='按文章套路', exact=True)
    total_mode = page.get_by_role('button', name='总表', exact=True)
    expect(title_mode).to_be_enabled(timeout=20000)
    expect(total_mode).to_have_attribute('aria-pressed', 'true')
    page.locator('[data-review-filter="range"]').select_option('all')
    expect(page.locator('.review-week-summary')).to_have_count(3)
    expect(table.locator('[data-review-row]')).to_have_count(11)
    expect(page.locator(f'[data-review-row="{DRAFT}"], [data-review-row="{UNMATCHED}"]')).to_have_count(0)
    expect(page.locator('.review-unmatched')).to_contain_text('未能对上 1 篇')
    drafts = page.locator('.review-article-drafts')
    expect(drafts).not_to_have_attribute('open', '')
    check_layout(page, width, first_row)
    page.locator('[data-review-filter="range"]').evaluate('control => control.blur()')
    page.screenshot(path=OUT / f'{width}-total.png', full_page=True)

    for mode, label in [(title_mode, 'title-pattern'), (article_mode, 'article-pattern')]:
        mode.click()
        expect(mode).to_have_attribute('aria-pressed', 'true')
        expect(page.locator('.review-article-group[open]')).to_have_count(0)
        first_group = page.locator('.review-article-group').first
        expect(first_group.locator('summary')).to_contain_text('爆率')
        first_group.locator('summary').click()
        check_layout(page, width, first_row)
        page.evaluate('window.scrollTo(0, 0)')
        page.screenshot(path=OUT / f'{width}-{label}.png', full_page=True)

    page.reload()
    expect(article_mode).to_have_attribute('aria-pressed', 'true')
    total_mode.click()
    page.locator('[data-review-filter="range"]').select_option('all')
    sort = page.locator('[data-review-sort="reads"]')
    sort.click()
    expect(page.locator('.review-week-summary')).to_have_count(0)
    expect(page.locator('th.review-cell-reads')).to_have_attribute('aria-sort', 'descending')
    sort.click()
    expect(page.locator('th.review-cell-reads')).to_have_attribute('aria-sort', 'ascending')
    first_row.locator('.review-cell-title-pattern button').click()
    expect(page.locator('[data-review-pattern-clear]')).to_be_visible()
    expect(page.locator('[data-review-row]')).to_have_count(6)
    page.locator('[data-review-pattern-clear]').click()
    expect(page.locator('[data-review-row]')).to_have_count(11)
    search = page.locator('[data-review-search]')
    search.fill('样本 3')
    expect(page.locator('[data-review-row]')).to_have_count(1)
    expect(search).to_be_focused()
    expect(first_row).to_contain_text('样本 3')
    first_row.locator('[data-review-article]').click()
    drawer = page.get_by_role('dialog')
    expect(drawer).to_contain_text('合成验收样本 3')
    expect(drawer).to_contain_text('判定依据')
    expect(drawer).to_contain_text('反差疑问')
    page.keyboard.press('Escape')
    expect(drawer).to_have_count(0)
    search.fill('')
    expect(page.locator('[data-review-row]')).to_have_count(11)
    drafts.locator('summary').click()
    drafts.locator(f'[data-review-article="{DRAFT}"]').click()
    expect(drawer).to_contain_text('合成草稿')
    page.keyboard.press('Escape')
    expect(drafts).to_have_attribute('open', '')
    expect(drafts.locator(f'[data-review-article="{DRAFT}"]')).to_be_focused()
    assert not errors, errors
    assert not writes, writes
    context.close()
    print(f'{width}px: three modes, two sort directions, title/tag filters, draft and drawer passed', flush=True)


def no_tags(browser):
    context = browser.new_context(service_workers='block')
    context.route('**/*', lambda route: fixture_request(route, with_tags=False))
    page = context.new_page()
    page.goto(URL)
    expect(page.get_by_text('还没有套路标签', exact=False)).to_be_visible(timeout=20000)
    for label in ('按标题套路', '按文章套路'):
        expect(page.get_by_role('button', name=label, exact=True)).to_be_disabled()
    context.close()


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        executable = os.environ.get('REVIEW_CHROMIUM', '/usr/bin/chromium')
        browser = playwright.chromium.launch(executable_path=executable, args=['--no-sandbox'])
        for width in (1280, 375):
            review_modes(browser, width)
        no_tags(browser)
        browser.close()
