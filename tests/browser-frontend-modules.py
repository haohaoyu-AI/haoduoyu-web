"""Mechanical-module comparison against isolated, independently seeded loopback D1s.

Start frontend-modules-browser-server.mjs first. No product probes or mock login.
Every checkpoint persists only statuses, hashes and synthetic interaction metadata.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import secrets
import subprocess
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
BASELINE = '168f236b05abd12ad1a937a5f506d9d8f9234ece'
WIDTHS = [375, 390, 768, 1440]
EXPECTED_ACTIONS = set(('missing-list list-prev list-next sort-column save-view close-modal menu logout '
    'refresh overview-period show-due toggle-attention new-article edit-article article-detail review-article '
    'new-review review-tab new-account edit-account new-key select-account record-detail revoke-key '
    'copy-token reset-filters').split())
CLOCK = """const NativeDate=Date;globalThis.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:[1792656000000]));}static now(){return 1792656000000;}};"""
TRACE = """document.addEventListener('click',event=>{
  const target=event.target.closest('[data-action]');if(target&&event.isTrusted){
    const rows=JSON.parse(localStorage.getItem('synthetic-actions')||'[]');
    rows.push(target.dataset.action);localStorage.setItem('synthetic-actions',JSON.stringify(rows));
  }},true);"""
parser = argparse.ArgumentParser()
parser.add_argument('--part', choices=['all', 'visual', 'functional'], default='all')
parser.add_argument('--variant', choices=['both', 'baseline', 'candidate'], default='both')
args = parser.parse_args()
OUT = ROOT / 'artifacts/frontend-modules' / args.part
OUT.mkdir(parents=True, exist_ok=True)
harness = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", harness).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", harness).group(1)
assert USERNAME.startswith('synthetic-')
report = {'status': 'running', 'synthetic': True, 'baseline_commit': BASELINE,
    'source_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
    'candidate_app_sha256': hashlib.sha256((ROOT / 'public/app.js').read_bytes()).hexdigest(),
    'candidate_worker_sha256': hashlib.sha256((ROOT / 'dist/server/index.js').read_bytes()).hexdigest(),
    'clock': '2026-10-22T08:00:00.000Z', 'widths': WIDTHS, 'captures': [], 'checks': [],
    'forms': [], 'network': [], 'diagnostics': [], 'actions': {}, 'mismatches': []}


def save():
    (OUT / ('report-' + args.variant + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


class Run:
    def __init__(self, browser, variant, port):
        self.variant, self.origin, self.stage = variant, f'http://127.0.0.1:{port}', 'startup'
        self.context = self.new_context(browser)
        self.page = self.context.new_page()
        self.diagnostics(self.page)
        self.password = PASSWORD
        self.fixture = self.page.request.get(self.origin + '/__synthetic-fixture').json()
        assert self.fixture['baseline'] == BASELINE
        self.article = self.fixture['article']
        self.account = next(row['id'] for row in self.fixture['accounts'] if row['platform'] == 'zhihu')
        self.loaded_hash = hashlib.sha256(self.page.request.get(self.origin + '/app.js').body()).hexdigest()
        assert self.loaded_hash == (self.fixture['original_app_sha256'] if variant == 'baseline'
            else report['candidate_app_sha256'])
        self.browser = browser

    def new_context(self, browser, touch=False, storage=None):
        context = browser.new_context(viewport={'width': 390 if touch else 1440, 'height': 900},
            timezone_id='Asia/Shanghai', reduced_motion='reduce', is_mobile=touch, has_touch=touch,
            permissions=['clipboard-read', 'clipboard-write'], storage_state=storage)
        context.set_default_timeout(12000)
        context.add_init_script(CLOCK)
        context.add_init_script(TRACE)
        context.route('**/*', lambda route: route.continue_()
            if route.request.url.startswith(self.origin + '/') else route.abort())
        return context

    def diagnostics(self, page):
        def record(kind, text):
            # Browser resource failures never include submitted fields/headers.
            report['diagnostics'].append({'variant': self.variant, 'stage': self.stage, 'kind': kind, 'text': text})
        page.on('pageerror', lambda error: record('pageerror', str(error)))
        page.on('console', lambda msg: record(msg.type, msg.text) if msg.type in ['error', 'warning'] else None)
        page.on('requestfailed', lambda req: record('requestfailed', urlsplit(req.url).path + ': ' + str(req.failure)))

    def checkpoint(self, name, **details):
        report['checks'].append({'variant': self.variant, 'name': name, 'passed': True, **details})
        save()
        print(f'{self.variant}: {name}', flush=True)

    def ready(self, page=None):
        page = page or self.page
        page.locator('#page-content[aria-busy=false]').wait_for()
        expect(page.locator('.error-panel')).to_have_count(0)

    def go(self, query, page=None):
        page = page or self.page
        page.goto(self.origin + '/?' + query)
        self.ready(page)

    def login(self, query='page=articles', page=None):
        page = page or self.page
        page.goto(self.origin + '/?' + query)
        page.locator('#login-form').wait_for()
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill(self.password)
        with page.expect_response(lambda response: response.url.endswith('/api/v1/auth/login')
                and response.request.method == 'POST') as response:
            page.locator('#login-form [type=submit]').click()
        assert response.value.status == 200
        self.ready(page)
        identity = page.request.get(self.origin + '/api/v1/auth/me').json()['data']
        assert identity['id'] and identity['csrfToken'] and page.context.cookies(self.origin)
        return identity

    def close(self, page=None):
        page = page or self.page
        page.keyboard.press('Escape')
        expect(page.locator('#overlay [role=dialog]')).to_have_count(0)

    def capture(self, name, width):
        page = self.page
        assert page.locator('input[type=password]').evaluate_all('rows=>rows.every(row=>!row.value)')
        assert page.locator('#created-token').count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        path = OUT / f'{self.variant}-{name}-{width}.png'
        page.screenshot(path=str(path), animations='disabled', full_page=True)
        report['captures'].append({'variant': self.variant, 'view': name, 'width': width,
            'file': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'app_sha256': self.loaded_hash})

    def open_form(self, kind):
        page = self.page
        if kind in ['article-new', 'article-edit', 'snapshot']:
            self.go('page=articles')
            if kind == 'article-new':
                page.locator('[data-action=new-article]').click()
            else:
                page.locator('.article-desktop [data-action=article-menu][data-id="' + self.article + '"]').click()
                page.locator('.popover [data-action=' + ('edit-article' if kind == 'article-edit' else 'review-article') + ']').click()
        elif kind == 'daily':
            self.go('page=reviews&tab=daily')
            page.locator('[data-action=new-review]').click()
        elif kind in ['account-new', 'account-edit']:
            self.go('page=settings&tab=accounts')
            page.locator('[data-action=new-account]' if kind == 'account-new' else
                '[data-action=edit-account][data-id="' + self.account + '"]').click()
        else:
            self.go('page=settings&tab=keys')
            page.locator('[data-action=new-key]' if kind == 'key' else '[data-action=revoke-key]').first.click()
        page.locator('.modal form').wait_for()

    def focus_cycle(self):
        controls = self.page.locator('.modal button:not(:disabled),.modal a[href],.modal input:not(:disabled),'
            '.modal select:not(:disabled),.modal textarea:not(:disabled),.modal [tabindex="0"]').filter(visible=True)
        controls.first.focus()
        self.page.keyboard.press('Shift+Tab')
        assert controls.last.evaluate('e=>e===document.activeElement')
        self.page.keyboard.press('Tab')
        assert controls.first.evaluate('e=>e===document.activeElement')

    def visual(self):
        self.stage = 'visual-login'
        self.page.goto(self.origin + '/?page=articles')
        self.page.locator('#login-form').wait_for()
        for width in WIDTHS:
            self.page.set_viewport_size({'width': width, 'height': 900})
            self.capture('login', width)
        self.page.set_viewport_size({'width': 1440, 'height': 900})
        self.login()
        for width in WIDTHS:
            self.stage = f'visual-{width}'
            self.page.set_viewport_size({'width': width, 'height': 900})
            views = [('dashboard', 'page=dashboard'), ('articles', 'page=articles'),
                ('data', 'page=reviews&tab=observations'), ('accounts', 'page=settings&tab=accounts'),
                ('keys', 'page=settings&tab=keys'), ('security', 'page=settings&tab=security'),
                ('audit', 'page=settings&tab=log')]
            for name, query in views:
                self.go(query)
                self.capture(name, width)
            self.go('page=articles')
            self.page.locator('[data-action=article-detail]:visible').first.click()
            self.page.locator('.drawer').wait_for()
            self.capture('detail', width)
            self.focus_cycle()
            self.close()
            for kind in ['article-new', 'daily', 'account-new', 'key']:
                self.open_form(kind)
                self.focus_cycle()
                self.capture('form-' + kind, width)
                self.close()
            self.go('page=reviews&tab=observations')
            self.page.locator('[data-action=new-review]').click()
            self.page.locator('#review-form').wait_for()
            self.capture('form-snapshot', width)
            self.close()
            self.checkpoint('four-width-shots-' + str(width))
        self.page.set_viewport_size({'width': 1440, 'height': 900})

    def receipts(self):
        return self.page.request.get(self.origin + '/__synthetic-metrics').json()

    def network(self):
        for name in ['data-first', 'modal-first', 'modal-repeat']:
            start = len(self.receipts())
            if name == 'data-first':
                self.go('page=reviews&tab=observations')
            else:
                self.page.locator('[data-action=new-review]').click()
                self.page.locator('#review-form').wait_for()
            rows = [r for r in self.receipts()[start:] if r['method'] == 'GET' and r['path'].startswith('/api/v1/')]
            assert all(r['status'] == 200 for r in rows)
            assert not any(r['path'].startswith('/api/v1/overview') for r in rows)
            assert all('fields=index' in r['path'] for r in rows if r['path'].startswith('/api/v1/articles'))
            report['network'].append({'variant': self.variant, 'phase': name, 'requests': rows,
                'count': len(rows), 'bytes': sum(r['bytes'] for r in rows)})
            if name != 'data-first':
                self.close()
        self.checkpoint('data-index-request-reuse')

    def action_routes(self):
        page = self.page
        self.stage = 'normal-actions'
        self.go('page=dashboard')
        page.locator('[data-action=missing-list]').first.click()
        self.ready()
        assert 'data_status=no_snapshot' in page.url
        self.go('page=dashboard')
        page.locator('[data-action=show-due]').first.click()
        self.ready()
        assert 'tab=pending' in page.url
        self.go('page=dashboard')
        page.locator('[data-action=toggle-attention]').click()
        assert page.locator('.attention-table tbody tr').count() == 7
        page.locator('[data-action=select-account]').first.click()
        self.ready()
        assert 'account=' in page.url
        self.go('page=dashboard')
        page.locator('[data-action=overview-period][data-period="7d"]').click()
        self.ready()
        page.locator('[data-action=page-menu]').first.click()
        page.locator('.popover [data-action=refresh]').click()
        self.ready()
        self.go('page=articles')
        page.locator('[data-action=list-next]').click()
        self.ready()
        assert 'list_page=2' in page.url
        page.locator('[data-action=list-prev]').click()
        self.ready()
        page.locator('[data-action=sort-column][data-sort=reads]').first.click()
        self.ready()
        assert 'sort=reads' in page.url
        page.locator('[data-action=article-filter]').click()
        page.locator('#filter-panel [name=mode]').select_option('manual')
        page.keyboard.press('Escape')
        assert 'mode=' not in page.url
        self.go('page=articles&q=Synthetic&platform=zhihu')
        page.locator('[data-action=reset-filters]').first.click()
        self.ready()
        assert 'q=' not in page.url and 'platform=' not in page.url
        for old, tab in [('management', 'accounts'), ('accounts', 'accounts'), ('keys', 'keys'), ('settings', 'security')]:
            self.go('page=' + old + '&q=preserved')
            assert 'page=settings' in page.url and 'tab=' + tab in page.url and 'q=preserved' in page.url
        self.go('page=reviews&tab=observations')
        page.locator('[data-action=record-detail]').first.click()
        page.locator('.modal').wait_for()
        page.locator('.modal-head [data-action=close-modal]').click()
        page.locator('[data-action=review-tab][data-tab=daily]').click()
        self.ready()
        page.reload()
        self.ready()
        assert 'tab=daily' in page.url
        page.go_back()
        self.ready()
        assert 'tab=observations' in page.url
        page.go_forward()
        self.ready()
        assert 'tab=daily' in page.url
        self.checkpoint('actions-and-route-roundtrips')

    def fill(self, kind):
        page = self.page
        if kind in ['article-new', 'article-edit']:
            page.locator('#field-title').fill('Synthetic submitted ' + kind)
            if kind == 'article-new':
                page.locator('#field-account_id').select_option(self.account)
                page.locator('#field-url').fill('https://example.invalid/synthetic/new-form')
                page.locator('#field-published_at').fill('2026-10-20T09:00')
                page.locator('#field-production_mode').select_option('automatic')
        elif kind in ['snapshot', 'daily']:
            page.locator('#field-source').fill('synthetic-browser-form')
            page.locator('#field-metric_reads').fill('0')
            if kind == 'daily':
                page.locator('#review-account').select_option(self.account)
                page.locator('#review-article').select_option('')
                page.locator('#field-date').fill('2026-10-22')
        elif kind == 'account-new':
            page.locator('#field-name').fill('Synthetic new account')
        elif kind == 'account-edit':
            page.locator('#field-name').fill('Synthetic disabled account')
            page.locator('#account-form input[name=active]').uncheck()
        elif kind == 'key':
            page.locator('#field-name').fill('Synthetic temporary browser key')
            page.locator('#key-form [name=account_ids]').first.check()

    def submit_failure_success(self, kind, path, method):
        page = self.page
        self.open_form(kind)
        self.fill(kind)
        form = page.locator('.modal form')
        values = form.evaluate('e=>[...new FormData(e).entries()]')
        self.stage = 'injected-offline:' + kind
        def abort(route):
            route.abort('internetdisconnected') if route.request.method == method else route.continue_()
        page.route(self.origin + '/api/v1' + path, abort)
        form.locator('[type=submit]').click()
        expect(form.locator('.form-message')).to_contain_text('暂时无法连接')
        assert values == form.evaluate('e=>[...new FormData(e).entries()]')
        expect(form.locator('[type=submit]')).to_be_enabled()
        page.unroute(self.origin + '/api/v1' + path, abort)
        self.stage = 'normal-form:' + kind
        with page.expect_response(lambda response: response.url == self.origin + '/api/v1' + path
                and response.request.method == method) as response:
            form.locator('[type=submit]').click()
        assert 200 <= response.value.status < 300
        if kind == 'key':
            page.locator('#created-token').wait_for()
            token = page.locator('#created-token').inner_text()
            page.locator('[data-action=copy-token]').click()
            assert page.evaluate('navigator.clipboard.readText()') == token
            self.close()
            assert token not in page.content()
            token = None
        else:
            page.locator('.modal').wait_for(state='detached')
        self.ready()
        report['forms'].append({'variant': self.variant, 'form': kind, 'failure': 'injected offline',
            'input_retained': True, 'success_status': response.value.status})
        self.checkpoint('form-' + kind)

    def forms(self):
        for kind, path, method in [('article-new', '/articles', 'POST'), ('snapshot', '/observations', 'POST'),
                ('daily', '/daily-metrics', 'POST'), ('account-new', '/accounts', 'POST'), ('key', '/api-keys', 'POST')]:
            self.submit_failure_success(kind, path, method)
        self.open_form('revoke')
        key_id = self.page.locator('#revoke-form').get_attribute('data-id')
        self.close()
        self.submit_failure_success('revoke', '/api-keys/' + key_id, 'DELETE')
        self.open_form('article-edit')
        self.fill('article-edit')
        form = self.page.locator('#article-form')
        version = int(form.get_attribute('data-version'))
        identity = self.page.request.get(self.origin + '/api/v1/auth/me').json()['data']
        response = self.page.request.put(self.origin + '/api/v1/articles/' + self.article,
            headers={'Origin': self.origin, 'X-CSRF-Token': identity['csrfToken']},
            data={'version': version, 'summary': 'Synthetic concurrent edit'})
        assert response.status == 200
        self.stage = 'injected-conflict:article-edit'
        with self.page.expect_response(lambda r: r.url.endswith('/articles/' + self.article)
                and r.request.method == 'PUT') as conflict:
            form.locator('[type=submit]').click()
        assert conflict.value.status == 409
        expect(form.locator('.form-message')).to_contain_text('已被其他人或 AI 更新')
        expect(self.page.locator('#field-title')).to_have_value('Synthetic submitted article-edit')
        self.close()
        self.open_form('article-edit')
        self.fill('article-edit')
        self.stage = 'normal-form:article-edit'
        self.page.locator('#article-form [type=submit]').click()
        self.page.locator('.modal').wait_for(state='detached')
        self.ready()
        report['forms'].append({'variant': self.variant, 'form': 'article-edit', 'failure': 'real local409',
            'input_retained': True, 'success': True})
        self.checkpoint('form-article-edit-real409')
        # Deactivate the existing scoped account only after article/data/key forms.
        self.submit_failure_success('account-edit', '/accounts/' + self.account, 'PUT')

    def save_view_and_links(self):
        page = self.page
        self.stage = 'normal-local-validation'
        self.go('page=articles')
        page.locator('[data-action=article-filter]').click()
        page.locator('[data-action=save-view]').click()
        page.locator('#field-name').fill('   ')
        page.locator('#save-view-form [type=submit]').click()
        expect(page.locator('#save-view-form .form-message')).to_have_text('请填写视图名称。')
        page.locator('#field-name').fill('Synthetic browser view')
        page.locator('#save-view-form [type=submit]').click()
        page.locator('.modal').wait_for(state='detached')
        assert page.evaluate("JSON.parse(localStorage.getItem('haoduoyu.views')).some(v=>v.name==='Synthetic browser view')")
        report['forms'].append({'variant': self.variant, 'form': 'saved-view', 'failure': 'blank name', 'success': True})
        self.go('page=settings&tab=security')
        with page.expect_download() as download:
            page.locator('a[href="/api/v1/export"]').click()
        data = download.value
        assert data.failure() is None
        raw = Path(data.path()).read_bytes()
        rows = list(csv.reader(io.StringIO(raw.decode('utf-8-sig'))))
        assert len(rows) >= 26
        self.checkpoint('CSV-download', bytes=len(raw), rows=len(rows), sha256=hashlib.sha256(raw).hexdigest())
        self.go('page=settings&tab=keys')
        link = page.locator('a[href="/api-docs"]')
        assert set(link.get_attribute('rel').split()) == {'noopener', 'noreferrer'}
        with self.context.expect_page() as popup:
            link.click()
        docs = popup.value
        docs.wait_for_load_state()
        assert docs.locator('.docs-page').count() == 1 and docs.evaluate('window.opener===null')
        docs.close()
        self.go('page=articles')
        page.locator('[data-action=article-detail]:visible').first.click()
        page.locator('.drawer').wait_for()
        original = page.locator('.drawer a[target=_blank]')
        assert set(original.get_attribute('rel').split()) == {'noopener', 'noreferrer'}
        assert original.get_attribute('href').startswith('https://example.invalid/')
        self.close()
        self.open_form('article-new')
        page.locator('#field-title').fill('Synthetic rejected URL')
        page.locator('#field-published_at').fill('2026-10-20T09:00')
        page.locator('#field-url').evaluate("e=>e.type='text'")
        page.locator('#field-url').fill('javascript:alert(1)')
        page.locator('#article-form [type=submit]').click()
        expect(page.locator('#article-form .form-message')).to_have_text('文章链接请使用 http 或 https 地址。')
        self.close()
        self.checkpoint('saved-view-docs-original-safeURL')

    def keyboard_login(self):
        page = self.page
        self.go('page=articles&q=Synthetic')
        page.locator('[data-action=logout]').click()
        page.locator('#login-form').wait_for()
        self.stage = 'intentional-wrong-password'
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill('synthetic-intentionally-wrong')
        with page.expect_response(lambda r: r.url.endswith('/api/v1/auth/login')) as response:
            page.locator('#login-form [type=submit]').click()
        assert response.value.status == 401
        expect(page.locator('#login-form .form-message')).not_to_be_empty()
        page.locator('#username').fill('')
        page.locator('#password').fill('')
        def tab_to(selector):
            for _ in range(150):
                if page.evaluate('s=>document.activeElement?.matches(s)', selector):
                    return
                page.keyboard.press('Tab')
            raise AssertionError('Keyboard target not reached: ' + selector)
        self.stage = 'normal-keyboard-login'
        tab_to('#username')
        page.keyboard.type(USERNAME)
        page.keyboard.press('Tab')
        assert page.locator('#password').evaluate('e=>e===document.activeElement')
        page.keyboard.type(self.password)
        page.keyboard.press('Tab')
        page.keyboard.press('Enter')
        self.ready()
        assert 'q=Synthetic' in page.url
        tab_to('#article-filters [name=q]')
        page.keyboard.press('Control+A')
        page.keyboard.type('Synthetic article')
        page.wait_for_timeout(500)
        self.ready()
        tab_to('.article-desktop .article-link[data-action=article-detail]')
        page.keyboard.press('Enter')
        page.locator('.drawer').wait_for()
        tab_to('.drawer [data-action=review-article]')
        page.keyboard.press('Enter')
        page.locator('#review-form').wait_for()
        self.close()
        assert page.locator('.article-link').evaluate_all('rows=>rows.includes(document.activeElement)')
        page.keyboard.press('Enter')
        page.locator('.drawer').wait_for()
        self.close()
        report['forms'].append({'variant': self.variant, 'form': 'login', 'failure_status': 401, 'success_status': 200})
        self.checkpoint('keyboard-real-login-filter-detail-review-close')

    def touch(self):
        self.stage = 'normal-touch'
        context = self.new_context(self.browser, touch=True, storage=self.context.storage_state())
        page = context.new_page()
        self.diagnostics(page)
        self.go('page=articles', page)
        assert page.evaluate('matchMedia("(pointer:coarse)").matches')
        page.locator('.mobile-bar [data-action=menu]').click()
        expect(page.locator('#sidebar')).to_be_visible()
        page.locator('[data-nav=reviews]').click()
        self.ready(page)
        page.locator('.mobile-bar [data-action=menu]').click()
        page.locator('[data-nav=articles]').click()
        self.ready(page)
        page.locator('[data-action=article-filter]').click()
        expect(page.locator('#filter-panel')).to_be_visible()
        page.keyboard.press('Escape')
        page.locator('.article-cards [data-action=article-detail]').first.click()
        page.locator('.drawer').wait_for()
        assert page.locator('.drawer').evaluate('e=>e.getBoundingClientRect().width') == 390
        page.locator('.drawer [data-action=review-article]').click()
        page.locator('#review-form').wait_for()
        self.close(page)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        touch_actions = page.evaluate("JSON.parse(localStorage.getItem('synthetic-actions')||'[]')")
        context.close()
        self.checkpoint('coarse-touch-menu-filter-detail-review', actions=sorted(set(touch_actions)))
        return touch_actions

    def change_password(self):
        self.stage = 'normal-password-validation'
        self.go('page=settings&tab=security')
        page = self.page
        new_password = secrets.token_urlsafe(32)
        page.locator('#current-password').fill(self.password)
        page.locator('#new-password').fill(new_password)
        page.locator('#confirm-password').fill(new_password + '-different')
        page.locator('#password-form [type=submit]').click()
        expect(page.locator('#password-form .form-message')).to_have_text('两次输入的新密码不一致。')
        page.locator('#confirm-password').fill(new_password)
        with page.expect_response(lambda r: r.url.endswith('/api/v1/auth/password') and r.request.method == 'PUT') as response:
            page.locator('#password-form [type=submit]').click()
        assert response.value.status == 200
        page.locator('#login-form').wait_for()
        self.password = new_password
        self.login('page=settings&tab=security')
        report['forms'].append({'variant': self.variant, 'form': 'password', 'failure': 'confirmation mismatch',
            'success_status': 200, 'real_relogin': True})
        self.checkpoint('password-mismatch-change-real-relogin')

    def functional(self):
        if args.part == 'functional':
            self.login()
        self.network()
        self.action_routes()
        self.keyboard_login()
        self.save_view_and_links()
        touch_actions = self.touch()
        self.forms()
        self.change_password()
        actions = set(self.page.evaluate("JSON.parse(localStorage.getItem('synthetic-actions')||'[]')")) | set(touch_actions)
        report['actions'][self.variant] = sorted(actions)
        missing = EXPECTED_ACTIONS - actions
        assert not missing, 'Missing trusted actions: ' + ', '.join(sorted(missing))
        assert len([row for row in report['forms'] if row['variant'] == self.variant]) == 11
        self.checkpoint('all-26-actions-and-11-form-flows', actions=len(EXPECTED_ACTIONS))


try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        variants = [('baseline', 8795), ('candidate', 8796)]
        for variant, port in variants:
            if args.variant != 'both' and args.variant != variant:
                continue
            run = Run(browser, variant, port)
            if args.part in ['all', 'visual']:
                run.visual()
            if args.part in ['all', 'functional']:
                run.functional()
            run.context.close()
        browser.close()
    if args.variant == 'both' and args.part in ['all', 'visual']:
        pairs = {(row['view'], row['width']) for row in report['captures']}
        for view, width in sorted(pairs):
            rows = [row for row in report['captures'] if row['view'] == view and row['width'] == width]
            if len(rows) != 2 or rows[0]['sha256'] != rows[1]['sha256']:
                report['mismatches'].append({'view': view, 'width': width})
        assert not report['mismatches'], 'Screenshot differences: ' + repr(report['mismatches'])
    unexpected = [row for row in report['diagnostics'] if row['kind'] == 'pageerror' or row['kind'] == 'warning'
        or ('Content Security Policy' in row['text'])
        or (row['kind'] in ['error', 'requestfailed'] and not (
            row['stage'].startswith(('injected-', 'intentional-'))
            or ('401' in row['text'] and row['stage'] in ['startup', 'visual-login', 'normal-actions',
                'normal-password-validation', 'normal-keyboard-login'])))]
    assert not unexpected, 'Unexpected diagnostics: ' + repr(unexpected)
    report['status'] = 'complete'
    save()
    print(f"Completed: {len(report['captures'])} PNGs, {len(report['forms'])} form flows; diagnostics retained.", flush=True)
except Exception as error:
    report['status'] = 'failed'
    report['failure'] = {'type': type(error).__name__, 'message': str(error)}
    save()
    raise
