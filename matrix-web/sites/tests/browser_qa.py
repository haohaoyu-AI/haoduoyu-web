"""Opt-in real Chromium QA. Requires Python Playwright and system Chromium.

Only temporary Miniflare D1 and the bundled Worker on loopback are used. Random test
passwords pass through stdin, never command arguments, screenshots, or reports.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from playwright.sync_api import expect, sync_playwright

APP = Path(__file__).resolve().parents[1]
ARTIFACTS = None
CHROMIUM = os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium')



class BrowserQa(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path=CHROMIUM, headless=True, args=['--no-sandbox'])
        print('Chromium ' + cls.browser.version, flush=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='matrix-browser-')
        self.addCleanup(self.temporary.cleanup)
        self.password = secrets.token_hex(24)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        self.base = f'http://127.0.0.1:{port}'
        self.process = subprocess.Popen(
            ['node', 'scripts/browser-fixture.mjs'], cwd=APP,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(self.stop_fixture)
        self.process.stdin.write(json.dumps({
            'file': str(Path(self.temporary.name) / 'matrix.sqlite'),
            'password': self.password, 'port': port}))
        self.process.stdin.close()
        ready = self.process.stdout.readline()
        self.assertTrue(ready, 'Isolated browser fixture could not start')
        self.assertEqual(json.loads(ready)['port'], port)
        self.profile = 'mobile' if self._testMethodName.endswith('mobile') else 'desktop'
        self.mobile = self.profile == 'mobile'
        self.context = self.browser.new_context(
            viewport={'width': 390 if self.mobile else 1440, 'height': 844 if self.mobile else 1000},
            is_mobile=self.mobile, has_touch=self.mobile, locale='zh-CN', timezone_id='Asia/Shanghai')
        self.addCleanup(self.context.close)
        self.page = self.context.new_page()
        self.page.set_default_timeout(8000)
        self.errors = []
        self.failed_requests = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.on('requestfailed', lambda request: self.failed_requests.append(request.url))
        # No real account, production domain, publishing platform or external asset is contacted.
        self.page.route('**/*', lambda route: route.continue_()
                        if route.request.url.startswith(self.base + '/') else route.abort())
        now = datetime.now(timezone(timedelta(hours=8)))
        self.today = now.strftime('%Y-%m-%d')
        self.published = (now - timedelta(days=2)).strftime('%Y-%m-%dT%H:%M')
        self.started = (now - timedelta(days=2, hours=1)).strftime('%Y-%m-%dT%H:%M')
        self.as_of = (now - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')
        self.older_as_of = (now - timedelta(hours=2)).strftime('%Y-%m-%dT%H:%M')
        self.collected = now.strftime('%Y-%m-%dT%H:%M')

    def stop_fixture(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)
        self.process.stdout.close()
        self.process.stderr.close()
        self.password = None

    def shot(self, name):
        if ARTIFACTS:
            if name in ('dashboard', 'dashboard-320'):
                expect(self.page.locator('#toasts .toast')).to_have_count(0, timeout=10000)
            self.page.screenshot(path=str(ARTIFACTS / f'{self.profile}-{name}.png'), full_page=True)

    def layout(self, name):
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),
                             self.page.viewport_size['width'], name + ': page overflow')
        if self.mobile:
            self.page.set_viewport_size({'width': 320, 'height': 844})
            self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'), 320,
                                 name + ': page overflow at 320px')
            if name in ('login', 'dashboard'):
                self.shot(name + '-320')
            self.page.set_viewport_size({'width': 390, 'height': 844})
        self.shot(name)

    def loaded(self):
        expect(self.page.locator('.page-loading')).to_have_count(0)
        expect(self.page.locator('.error-panel')).to_have_count(0)

    def navigate(self, target, label):
        if self.mobile:
            self.page.get_by_role('button', name='打开导航').click()
            expect(self.page.locator('.shell')).to_have_class('shell menu-open')
        self.page.locator(f'.nav-list [data-nav={target}]').click()
        expect(self.page.locator('h1')).to_have_text(label)
        self.loaded()
        if self.mobile:
            expect(self.page.locator('.shell')).to_have_class('shell')

    def account(self, value):
        self.page.locator('#global-account').select_option(value)
        self.loaded()
        expect(self.page.locator('#global-account')).to_have_value(value)

    def create_article(self, title, url, known_duration=False):
        self.page.locator('.head-actions [data-action=new-article]').click()
        form = self.page.locator('#article-form')
        form.locator('[name=title]').fill(title)
        form.locator('[name=url]').fill(url)
        form.locator('[name=published_at]').fill(self.published)
        if known_duration:
            form.locator('[name=started_at]').fill(self.started)
            form.locator('[name=production_mode]').select_option('manual')
        form.locator('[name=summary]').fill('<script>window.__qaExecuted=true</script> 合成概况')
        form.get_by_role('button', name='保存发布记录', exact=True).click()
        expect(self.page.get_by_role('dialog')).to_have_count(0)
        self.loaded()

    def snapshot(self, article_id, reads, as_of):
        self.page.locator('.head-actions [data-action=new-review]').click()
        form = self.page.locator('#review-form')
        form.locator('[name=article_id]').select_option(article_id)
        form.locator('[name=as_of]').fill(as_of)
        form.locator('[name=collected_at]').fill(self.collected)
        form.locator('[name=source]').fill('合成浏览器 QA')
        form.locator('[name=metric_reads]').fill(str(reads))
        form.locator('[name=metric_likes]').fill('0')
        form.get_by_role('button', name='追加快照', exact=True).click()
        expect(self.page.get_by_role('dialog')).to_have_count(0)
        self.loaded()

    def flow(self):
        page = self.page
        page.goto(self.base)
        expect(page.locator('#login-form')).to_be_visible()
        self.layout('login')
        page.locator('#username').fill('browser-test-only')
        page.locator('#password').fill('synthetic-wrong-password')
        page.get_by_role('button', name='登录工作空间').click()
        expect(page.locator('#login-form .form-message')).to_have_text('账号或密码错误')
        page.locator('#password').fill(self.password)
        page.get_by_role('button', name='登录工作空间').click()
        expect(page.locator('h1')).to_have_text('驾驶舱')
        self.loaded()
        expect(page.locator('.account-card')).to_have_count(3)
        expect(page.locator('.account-card .big-value')).to_have_text(['—', '—', '—'])
        self.layout('empty-dashboard')

        self.navigate('articles', '发布统计')
        self.account('toutiao-haoduoyu')
        title_a = f'{self.profile} QA <img src=x onerror=window.__qaExecuted=true>'
        url_a = f'https://example.test/{self.profile}/article-a'
        self.create_article(title_a, url_a)
        row = page.locator('#article-table tbody tr')
        expect(row).to_have_count(1)
        expect(row).to_contain_text('未记录')
        article_a = row.locator('[data-action=article-detail]').get_attribute('data-id')
        self.assertIsNone(page.evaluate('window.__qaExecuted'))

        # A duplicate link is an existing-record error, not a stale writer.
        page.locator('.head-actions [data-action=new-article]').click()
        form = page.locator('#article-form')
        form.locator('[name=title]').fill('重复登记回归样本')
        form.locator('[name=url]').fill(url_a)
        form.locator('[name=published_at]').fill(self.published)
        with page.expect_response(lambda r: r.url.endswith('/api/v1/articles') and r.request.method == 'POST') as duplicate:
            form.get_by_role('button', name='保存发布记录', exact=True).click()
        self.assertEqual(duplicate.value.status, 409)
        self.assertEqual(duplicate.value.json()['error']['code'], 'ARTICLE_EXISTS')
        expect(form.locator('.form-message')).to_have_text('该平台文章或链接已经登记')
        self.shot('duplicate-error')
        page.keyboard.press('Escape')
        expect(page.get_by_role('dialog')).to_have_count(0)

        self.account('zhihu-haoduoyu')
        expect(page.locator('#article-table .article-link')).to_have_count(0)
        self.create_article(f'{self.profile} 知乎独立文章', f'https://example.test/{self.profile}/article-b', True)
        expect(page.locator('#article-table tbody tr')).to_have_count(1)
        expect(page.locator('#article-table')).to_contain_text('1 小时')
        self.account('wechat-xiaoyuer')
        expect(page.locator('#article-table .article-link')).to_have_count(0)
        self.account('toutiao-haoduoyu')
        expect(page.locator('#article-table .article-link')).to_have_text(title_a)
        self.layout('articles')

        # Two real browser pages edit the same version. Only the first wins.
        page.locator('#article-table [data-action=edit-article]').click()
        second = self.context.new_page()
        second.goto(self.base + '/?page=articles&account=toutiao-haoduoyu')
        expect(second.locator('#article-table [data-action=edit-article]')).to_be_visible()
        second.locator('#article-table [data-action=edit-article]').click()
        second.locator('#field-notes').fill('另一浏览器页面先保存的备注')
        second.get_by_role('button', name='保存修改', exact=True).click()
        expect(second.get_by_role('dialog')).to_have_count(0)
        second.close()
        page.locator('#field-notes').fill('过期页面不能覆盖')
        with page.expect_response(lambda r: r.url.endswith('/articles/' + article_a) and r.request.method == 'PUT') as conflict:
            page.get_by_role('button', name='保存修改', exact=True).click()
        self.assertEqual(conflict.value.json()['error']['code'], 'VERSION_CONFLICT')
        expect(page.locator('#article-form .form-message')).to_contain_text('已被其他人或 AI 更新')
        page.keyboard.press('Escape')
        page.locator('#article-table .article-link').click()
        expect(page.get_by_role('dialog')).to_contain_text('另一浏览器页面先保存的备注')
        expect(page.get_by_role('dialog')).not_to_contain_text('过期页面不能覆盖')
        self.assertIsNone(page.evaluate('window.__qaExecuted'))
        page.keyboard.press('Escape')

        self.navigate('reviews', '复盘')
        self.snapshot(article_a, 20, self.as_of)
        self.snapshot(article_a, 99, self.older_as_of)
        expect(page.locator('.table-footer')).to_contain_text('2 条记录')
        cells = page.locator('.data-table tbody tr').first.locator('td')
        expect(cells.nth(2)).to_have_text('20')
        expect(cells.nth(3)).to_have_text('—')
        expect(cells.nth(4)).to_have_text('0')
        self.layout('reviews')
        page.locator('[data-action=record-detail]').first.click()
        expect(page.get_by_role('dialog')).to_contain_text('合成浏览器 QA')
        page.keyboard.press('Escape')
        self.account('zhihu-haoduoyu')
        expect(page.locator('.data-table tbody tr')).to_have_count(0)
        self.account('toutiao-haoduoyu')
        expect(page.locator('.data-table tbody tr')).to_have_count(2)
        page.get_by_role('tab', name='每日新增数据').click()
        self.loaded()
        page.locator('.head-actions [data-action=new-review]').click()
        form = page.locator('#review-form')
        expect(form.locator('[name=account_id]')).to_have_value('toutiao-haoduoyu')
        expect(form.locator('[name=article_id]')).to_have_value('')
        expect(form.locator('[name=date]')).to_have_value(self.today)
        form.locator('[name=source]').fill('合成每日总体')
        form.locator('[name=metric_reads]').fill('0')
        form.get_by_role('button', name='保存每日数据', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        self.loaded()
        expect(page.locator('.table-footer')).to_contain_text('1 条记录')
        self.layout('daily')

        self.navigate('dashboard', '驾驶舱')
        expect(page.locator('.account-card')).to_have_count(1)
        expect(page.locator('.account-card .big-value')).to_have_text('0')
        expect(page.locator('.account-card')).to_contain_text('已采集部分')
        page.locator('.chart-header select').select_option('comments')
        expect(page.locator('.chart-blank')).to_contain_text('还没有评论趋势')
        page.locator('.chart-header select').select_option('reads')
        expect(page.locator('svg.chart')).to_be_visible()
        self.layout('dashboard')
        self.account('zhihu-haoduoyu')
        expect(page.locator('.account-card .big-value')).to_have_text('—')
        page.reload()
        self.loaded()
        expect(page.locator('#global-account')).to_have_value('zhihu-haoduoyu')
        if self.mobile:
            page.get_by_role('button', name='打开导航').click()
        page.get_by_role('button', name='退出登录').click()
        expect(page.locator('#login-form')).to_be_visible()
        response = self.context.request.get(self.base + '/api/v1/accounts')
        self.assertEqual(response.status, 401)
        self.assertEqual(self.errors, [], 'Uncaught page JavaScript errors')
        self.assertEqual(self.failed_requests, [], 'Unexpected failed or external requests')

    def check_flow(self):
        try:
            self.flow()
        except Exception:
            # A failure capture must never preserve a password field.
            self.page.locator('input[type=password]').evaluate_all("els => els.forEach(el => el.value='')")
            self.shot('failure')
            raise

    def test_desktop(self):
        self.check_flow()

    def test_mobile(self):
        self.check_flow()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, help='Optional local PNG evidence directory; no credentials/traces')
    args, rest = parser.parse_known_args()
    if args.artifacts:
        ARTIFACTS = args.artifacts.resolve()
        ARTIFACTS.mkdir(parents=True, exist_ok=True, mode=0o700)
    unittest.main(argv=[__file__, *rest], verbosity=2)
