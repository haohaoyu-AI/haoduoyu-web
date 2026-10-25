"""Focused Phase 7 acceptance: isolated Chromium, real Worker, temporary synthetic D1.

Run after the parent builds the application. This never connects to a shared browser,
production site or database. Browser requests are restricted to the loopback fixture.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import select
import subprocess
import sys
import traceback
import uuid
from urllib.parse import parse_qs, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/article-pipeline'
OUT.mkdir(parents=True, exist_ok=True)
HARNESS = (ROOT / 'tests/harness.mjs').read_text()
USERNAME = re.search(r"export const USERNAME='([^']+)'", HARNESS).group(1)
PASSWORD = re.search(r"export const PASSWORD='([^']+)'", HARNESS).group(1)
assert USERNAME.startswith('synthetic-')
DAY = '2026-10-24'
REPORT = {'synthetic': True, 'real_worker': True, 'temporary_d1': True,
          'shared_browser_used': False, 'completed': False, 'checks': {}, 'captures': [],
          'pageerrors': [], 'dialogs': [], 'blocked_external_requests': [], 'api_responses': [],
          'product_sha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                             for name in ['public/app.js', 'public/style.css', 'dist/server/index.js']}}
expect.set_options(timeout=15000)


def save():
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))


def mark(name, evidence=True):
    REPORT['checks'][name] = evidence
    save()
    print('Passed: ' + name, flush=True)


def path_of(url):
    value = urlsplit(url)
    return value.path + ('?' + value.query if value.query else '')


server = subprocess.Popen(['node', 'tests/article-pipeline-browser-server.mjs'], cwd=ROOT,
                          env=os.environ.copy(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
browser = None
try:
    if not select.select([server.stdout], [], [], 45)[0]:
        raise RuntimeError('Loopback fixture did not start within 45 seconds')
    ORIGIN = server.stdout.readline().strip()
    if not ORIGIN.startswith('http://127.0.0.1:'):
        raise RuntimeError('Synthetic Worker fixture failed to start: ' + ORIGIN)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        REPORT['browser'] = {'executable': '/usr/bin/chromium', 'version': browser.version}

        def new_page(width):
            mobile = width < 600
            context = browser.new_context(viewport={'width': width, 'height': 900 if mobile else 1050},
                                          is_mobile=mobile, has_touch=mobile,
                                          locale='zh-CN', timezone_id='Asia/Shanghai')

            def local_only(route):
                if route.request.url.startswith(ORIGIN + '/'):
                    route.continue_()
                else:
                    REPORT['blocked_external_requests'].append(route.request.url)
                    route.abort()

            context.route('**/*', local_only)
            page = context.new_page()
            page.on('pageerror', lambda error: REPORT['pageerrors'].append(str(error)))
            page.on('dialog', lambda dialog: (REPORT['dialogs'].append(dialog.message), dialog.dismiss()))
            page.on('response', lambda response: REPORT['api_responses'].append({
                'width': width, 'method': response.request.method, 'path': path_of(response.url),
                'status': response.status}) if response.url.startswith(ORIGIN + '/api/v1/') else None)
            return context, page

        def ready(page):
            expect(page.locator('#page-content')).to_have_attribute('aria-busy', 'false')
            expect(page.locator('.error-panel')).to_have_count(0)

        def no_overflow(page, component=None):
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Document overflows viewport'
            if component:
                assert page.locator(component).evaluate('(el) => el.scrollWidth <= el.clientWidth + 1'), component + ' overflows'

        def capture(page, name):
            full_page = page.viewport_size['width'] >= 600 and not page.locator('#overlay [role=dialog]').count()
            page.screenshot(path=str(OUT / (name + '.png')), full_page=full_page, animations='disabled')
            REPORT['captures'].append(name + '.png')
            save()

        def nav(page, name):
            container = '.mobile-nav' if page.viewport_size['width'] < 600 else '.sidebar'
            page.locator(container + ' [data-nav="' + name + '"]').click()
            ready(page)

        def go_articles(page, query=''):
            page.goto(ORIGIN + '/?page=articles' + query)
            ready(page)
            expect(page.locator('#article-filters')).to_be_visible()

        def article(page, identity):
            page.locator('[data-action=article-detail][data-id="' + identity + '"]').click()
            expect(page.locator('[data-article-detail="' + identity + '"]')).to_be_visible()

        def close_modal(page):
            page.locator('#overlay .modal-head [data-action=close-modal]').click()
            expect(page.locator('#overlay [role=dialog]')).to_have_count(0)

        def get_article(page, identity):
            response = page.request.get(ORIGIN + '/api/v1/articles/' + identity)
            assert response.status == 200
            return response.json()['data']

        def put_article(page, identity, body):
            identity_data = page.request.get(ORIGIN + '/api/v1/auth/me').json()['data']
            headers = {'Origin': ORIGIN, 'Idempotency-Key': str(uuid.uuid4())}
            if identity_data.get('publicBusiness'):
                headers['X-Public-Business'] = '1'
            else:
                headers['X-CSRF-Token'] = identity_data['csrfToken']
            response = page.request.put(ORIGIN + '/api/v1/articles/' + identity, data=body, headers=headers)
            assert response.status == 200, 'Independent synthetic update failed: ' + str(response.status)
            return response.json()['data']

        def verify_detail_safety(page, identity):
            article(page, identity)
            detail = page.locator('.article-ledger-detail')
            expect(detail.locator('.article-unpublished')).to_contain_text('未发布')
            expect(detail.locator('[data-action=review-article], .detail-stats, .snapshot-nodes')).to_have_count(0)
            for label, expected in [('样本来源', '<script>'), ('阶段时间线', 'finished_at'), ('阻塞记录', '<img')]:
                section = detail.locator('details').filter(has=page.locator('summary', has_text=label)).first
                section.locator('summary').click()
                expect(section.locator('pre')).to_contain_text(expected)
            expect(detail.locator('script, img, [onerror], [onclick]')).to_have_count(0)
            assert page.evaluate('globalThis.syntheticXSS === undefined')
            expect(detail.locator('[data-article-verify-index="0"]')).to_have_attribute('type', 'checkbox')
            expect(detail.locator('[data-article-verify-index="1"]')).to_have_value('')
            expect(detail.locator('.info-line.warn')).to_have_count(0)
            expect(detail.locator('.detail-grid div').filter(has=page.locator('dt', has_text=re.compile('^图数$'))).locator('dd')).to_have_text('25')
            no_overflow(page, '#overlay .modal-body')

        context, page = new_page(1440)
        fixture = page.request.get(ORIGIN + '/__fixture').json()
        assert fixture['synthetic'] is True
        ids = fixture['ids']
        page.goto(ORIGIN)
        ready(page)
        expect(page.locator('#daily-todos')).to_be_visible()
        expect(page.locator('#todo-text')).to_be_visible()
        assert parse_qs(urlsplit(page.url).query)['page'] == ['todos']
        assert not any('/overview' in row['path'] for row in REPORT['api_responses'])
        no_overflow(page)
        capture(page, 'desktop-todos-landing-1440')
        mark('default_landing_todos_1440')

        page.goto(ORIGIN + '/?page=notes&date=' + DAY)
        ready(page)
        expect(page.locator('#notes-reader')).to_contain_text('合成碎碎念')
        expect(page.locator('#notes-editor')).to_be_hidden()
        public_note = page.request.get(ORIGIN + '/api/v1/daily-notes?date=' + DAY).json()['data']
        assert public_note['can_edit'] is False
        rejected = page.request.put(ORIGIN + '/api/v1/daily-notes/' + DAY,
                                    headers={'Origin': ORIGIN, 'X-Public-Business': '1'},
                                    data={'version': public_note['version'], 'save_id': str(uuid.uuid4()), 'text': 'must not save'})
        assert rejected.status in [401, 403]
        assert page.request.get(ORIGIN + '/api/v1/daily-notes?date=' + DAY).json()['data']['text'] == public_note['text']
        capture(page, 'desktop-notes-public-readonly-1440')
        page.locator('[data-notes-action=login]').click()
        page.locator('#username').fill(USERNAME)
        page.locator('#password').fill(PASSWORD)
        page.locator('#login-form button[type=submit]').click()
        expect(page.locator('#notes-editor')).to_be_visible()
        assert page.request.get(ORIGIN + '/api/v1/daily-notes?date=' + DAY).json()['data']['can_edit'] is True
        mark('notes_public_readonly_owner_login_boundary', {'public_write_status': rejected.status, 'owner_can_edit': True})

        nav(page, 'dashboard')
        expect(page.locator('section.article-ledger-overview')).to_be_visible()
        stats = page.locator('.article-ledger-stats > div')
        assert stats.locator('dd').all_text_contents() == ['4', '3', '1']
        writer_rows = page.locator('.article-ledger-writers tbody tr').evaluate_all(
            '(rows) => rows.map(row => [...row.cells].map(cell => cell.textContent.trim()))')
        assert writer_rows == [['得到大脑', '1', '0'], ['Gemini', '1', '0'], ['人工', '1', '1'], ['其他', '1', '0']]
        capture(page, 'desktop-overview-drafts-1440')
        page.locator('[data-action=article-overview-mode][data-mode=published]').click()
        ready(page)
        expect(page.locator('section.article-ledger-overview')).to_have_count(0)
        assert parse_qs(urlsplit(page.url).query)['article_scope'] == ['published']
        assert any(row['path'].startswith('/api/v1/overview') and row['status'] == 200 for row in REPORT['api_responses'])
        page.locator('[data-action=top-platform][data-platform=toutiao]').click()
        ready(page)
        native_link = page.locator('a[data-action=all-top]')
        native_query = parse_qs(urlsplit(native_link.get_attribute('href')).query)
        assert native_query['status'] == ['published'] and native_query['platform'] == ['toutiao']
        with context.expect_page() as popup:
            native_link.click(button='middle')
        native_page = popup.value
        ready(native_page)
        expect(native_page.locator('#article-filters select[name=status]')).to_have_value('published')
        expect(native_page.locator('.article-cards [data-action=article-detail]')).to_have_count(1)
        native_page.close()
        mark('published_native_middle_click_link_keeps_status_and_platform')
        capture(page, 'desktop-overview-published-1440')
        mark('overview_draft_default_real_counts_and_published_switch', {'unpublished': 4, 'draft_saved': 3, 'published': 1,
                                                                     'writers': writer_rows})

        nav(page, 'articles')
        expect(page.locator('#article-filters select[name=status]')).to_have_value('draft_saved')
        assert page.locator('#article-filters select[name=status] option').evaluate_all('(nodes) => nodes.map(n => n.value)') == [
            'drafting', 'illustrated', 'draft_saved', 'published', 'failed']
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(3)
        headings = [' '.join(value.split()) for value in page.locator('.article-table th').all_text_contents()]
        assert headings == ['标题 / 发布 ↓', '状态', '槽位', '写作者', '警告', '操作'], headings
        no_overflow(page)
        capture(page, 'desktop-default-drafts-1440')
        mark('articles_default_status_five_options_and_columns')

        page.locator('[data-action=article-filter]').click()
        filter_form = page.locator('#filter-panel')
        expect(filter_form).to_be_visible()
        for field, value in [('slot', 'tt1'), ('writer', 'dedao'), ('has_warnings', 'false'), ('has_pending_verify', 'true')]:
            filter_form.locator('[name=' + field + ']').select_option(value)
        for field in ['series_no_min', 'series_no_max']:
            filter_form.locator('[name=' + field + ']').fill('17')
        for value in ['reads', 'char_count', 'subheading_count', 'image_count', 'draft_ref', 'total_duration', 'verify', 'topic']:
            filter_form.locator('[name=columns][value=' + value + ']').check()
        filter_form.locator('button[type=submit]').click()
        ready(page)
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(1)
        row = page.locator('.article-cards tr').first
        expect(row.locator('[data-label=阅读]')).to_have_text('未发布')
        expect(row.locator('[data-label=图数]')).to_have_text('25')
        expect(row.locator('[data-label=警告]')).to_have_text('无警告')
        expect(row.locator('[data-label=字数]')).to_have_text('2,236')
        expect(row.locator('[data-label=草稿凭证]')).to_contain_text('7699934907375567402')
        query = parse_qs(urlsplit(page.url).query)
        assert all(query[key] == [value] for key, value in [('slot', 'tt1'), ('writer', 'dedao'), ('has_warnings', 'false'),
                                                          ('has_pending_verify', 'true'), ('series_no_min', '17'), ('series_no_max', '17')])
        page.reload()
        ready(page)
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(1)
        mark('pipeline_filters_columns_route_roundtrip_tt1_boundary', {'images': 25, 'warnings': []})

        verify_detail_safety(page, ids['tt1'])
        capture(page, 'desktop-detail-safe-json-1440')
        before = get_article(page, ids['tt1'])
        assert before['warnings'] == []
        page.locator('[data-article-verify-index="0"]').click()
        expect(page.locator('[data-article-verify-status]')).to_contain_text('已保存')
        after = get_article(page, ids['tt1'])
        assert after['version'] == before['version'] + 1 and after['verify_items'][0]['done'] is True
        assert 'done' not in after['verify_items'][1] and after['verify_items'][0]['future'] == {'keep': True}
        page.locator('[data-article-verify-index="1"]').select_option('false')
        expect(page.locator('[data-article-verify-index="1"]')).to_have_attribute('type', 'checkbox')
        expect(page.locator('[data-article-verify-status]')).to_contain_text('已保存')
        explicit = get_article(page, ids['tt1'])
        assert explicit['verify_items'][1]['done'] is False and explicit['verify_items'][1]['future'] == 'keep'
        mark('detail_safe_json_unpublished_and_unknown_done_preservation')

        remote_items = json.loads(json.dumps(explicit['verify_items']))
        remote_items[0]['done'] = False
        remote = put_article(page, ids['tt1'], {'version': explicit['version'], 'verify_items': remote_items})
        with page.expect_response(lambda response: response.request.method == 'PUT' and response.url.endswith('/articles/' + ids['tt1'])) as conflict:
            page.locator('[data-article-verify-index="1"]').click()
        assert conflict.value.status == 409
        expect(page.locator('[data-article-verify-status]')).to_contain_text('未保存；已显示最新版本')
        expect(page.locator('[data-article-verify-index="0"]')).not_to_be_checked()
        expect(page.locator('[data-article-verify-index="1"]')).not_to_be_checked()
        assert get_article(page, ids['tt1'])['version'] == remote['version']
        capture(page, 'desktop-detail-cas-conflict-1440')
        mark('verification_real_cas_409_reloads_without_replay')

        attempts = []
        exact_path = ORIGIN + '/api/v1/articles/' + ids['tt1']

        def fail_first_put(route):
            if route.request.method != 'PUT':
                route.continue_()
                return
            attempts.append({'body': route.request.post_data_json, 'key': route.request.headers.get('idempotency-key')})
            if len(attempts) == 1:
                route.fulfill(status=503, content_type='application/json',
                              body=json.dumps({'error': {'code': 'SYNTHETIC_UNCERTAIN', 'message': '合成临时失败'}}))
            else:
                route.continue_()

        page.route(exact_path, fail_first_put)
        page.locator('[data-article-verify-index="0"]').click()
        expect(page.locator('[data-action=article-verify-retry]')).to_be_visible()
        assert get_article(page, ids['tt1'])['version'] == remote['version'] and len(attempts) == 1
        expect(page.locator('[data-article-verify-index="0"]')).to_be_disabled()
        capture(page, 'desktop-detail-explicit-retry-1440')
        page.locator('[data-action=article-verify-retry]').click()
        expect(page.locator('[data-article-verify-status]')).to_contain_text('已保存')
        assert len(attempts) == 2 and attempts[0] == attempts[1] and attempts[0]['key']
        assert get_article(page, ids['tt1'])['version'] == remote['version'] + 1
        page.unroute(exact_path, fail_first_put)
        mark('verification_explicit_retry_same_body_and_idempotency_key', {'attempts': 2, 'same_key': True, 'same_body': True})
        close_modal(page)

        go_articles(page)
        article(page, ids['unsafe'])
        expect(page.locator('#overlay a[href^="javascript:"]')).to_have_count(0)
        expect(page.locator('#modal-title img')).to_have_count(0)
        expect(page.locator('#modal-title')).to_contain_text('<img src=x')
        close_modal(page)
        article(page, ids['unknown'])
        safe_link = page.locator('#overlay a[href="https://example.invalid/synthetic-editor"]')
        expect(safe_link).to_have_attribute('target', '_blank')
        expect(safe_link).to_have_attribute('rel', 'noopener noreferrer')
        expect(page.locator('.article-verification')).to_contain_text('未取得清单')
        page.locator('#overlay [data-action=edit-article]').click()
        form = page.locator('#article-form')
        expect(form.locator('[name=char_count]')).to_have_value('')
        expect(form.locator('[name=image_count]')).to_have_value('')
        expect(form.locator('[name=draft_pgc_id]')).to_have_value('000123000')
        form.locator('[name=image_count]').fill('0')
        form.locator('[name=summary]').fill('合成编辑：空值和零分别保存。')
        capture(page, 'desktop-edit-null-vs-zero-1440')
        form.locator('button[type=submit]').click()
        expect(page.locator('#article-form')).to_have_count(0)
        saved = get_article(page, ids['unknown'])
        assert saved['char_count'] is None and saved['subheading_count'] is None and saved['series_no'] is None
        assert saved['image_count'] == 0 and saved['draft_ref']['pgc_id'] == '000123000'
        assert saved['draft_ref']['future'] == {'keep': 'draft metadata'}
        assert saved['timings']['future'] == {'keep': 'timing metadata'}
        assert saved['url'] is None and saved['published_at'] is None
        mark('safe_and_unsafe_draft_links_edit_null_zero_unknown_json_preservation')

        go_articles(page)
        page.locator('#page-header [data-action=new-article]').click()
        form = page.locator('#article-form')
        expect(form.locator('[name=status]')).to_have_value('draft_saved')
        form.locator('[name=title]').fill('合成浏览器新建：零图数与空字数')
        form.locator('[name=account_id]').select_option('toutiao-haoduoyu')
        form.locator('[name=run_dir]').fill('synthetic/browser-created')
        form.locator('[name=run_date]').fill(DAY)
        form.locator('[name=slot]').select_option('tt3')
        form.locator('[name=writer]').select_option('other')
        form.locator('[name=image_count]').fill('0')
        form.locator('[name=draft_pgc_id]').fill('0000007')
        with page.expect_response(lambda response: response.request.method == 'POST' and response.url.endswith('/api/v1/articles')) as created:
            form.locator('button[type=submit]').click()
        assert created.value.status == 201, created.value.json()
        expect(page.locator('#article-form')).to_have_count(0)
        new_record = get_article(page, created.value.json()['data']['id'])
        assert new_record['status'] == 'draft_saved' and new_record['image_count'] == 0
        assert new_record['char_count'] is None and new_record['subheading_count'] is None and new_record['series_no'] is None
        assert new_record['draft_ref']['pgc_id'] == '0000007' and new_record['url'] is None and new_record['published_at'] is None
        mark('create_draft_without_publication_null_zero_and_text_id')

        go_articles(page, '&status=published&columns=reads,status,writer')
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(1)
        expect(page.locator('.article-cards [data-label=阅读]')).to_have_text('0')
        article(page, ids['published'])
        expect(page.locator('#overlay .detail-stats')).to_be_visible()
        expect(page.locator('#overlay [data-action=review-article]')).to_be_visible()
        expect(page.locator('#overlay .article-unpublished')).to_have_count(0)
        close_modal(page)
        page.locator('#article-filters select[name=status]').select_option('failed')
        ready(page)
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(1)
        page.locator('#article-filters select[name=status]').select_option('drafting')
        ready(page)
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(0)
        page.locator('#article-filters select[name=status]').select_option('illustrated')
        ready(page)
        expect(page.locator('.article-cards [data-action=article-detail]')).to_have_count(0)
        mark('all_five_status_routes_and_published_real_zero_detail')

        for width in [390, 375]:
            mobile_context, mobile = new_page(width)
            mobile.goto(ORIGIN)
            ready(mobile)
            expect(mobile.locator('#daily-todos')).to_be_visible()
            assert len(mobile.locator('.mobile-nav [data-nav]').all()) == 7
            no_overflow(mobile)
            capture(mobile, 'mobile-todos-landing-' + str(width))
            nav(mobile, 'articles')
            expect(mobile.locator('#article-filters select[name=status]')).to_have_value('draft_saved')
            expect(mobile.locator('.article-cards [data-action=article-detail]')).to_have_count(4)
            no_overflow(mobile)
            capture(mobile, 'mobile-default-drafts-' + str(width))
            article(mobile, ids['tt1'])
            no_overflow(mobile, '#overlay .modal-body')
            expect(mobile.locator('.article-unpublished')).to_be_visible()
            capture(mobile, 'mobile-detail-' + str(width))
            mobile.locator('#overlay [data-action=edit-article]').click()
            expect(mobile.locator('#article-form')).to_be_visible()
            no_overflow(mobile, '#overlay .modal-body')
            capture(mobile, 'mobile-edit-form-' + str(width))
            close_modal(mobile)
            mobile.locator('[data-action=article-filter]').click()
            expect(mobile.locator('#filter-panel')).to_be_visible()
            no_overflow(mobile)
            capture(mobile, 'mobile-filter-panel-' + str(width))
            mobile.keyboard.press('Escape')
            nav(mobile, 'dashboard')
            expect(mobile.locator('section.article-ledger-overview')).to_be_visible()
            assert mobile.locator('.article-ledger-stats dd').all_text_contents() == ['5', '4', '1']
            no_overflow(mobile)
            capture(mobile, 'mobile-overview-' + str(width))
            mobile.goto(ORIGIN + '/?page=notes&date=' + DAY)
            ready(mobile)
            expect(mobile.locator('#notes-reader')).to_contain_text('合成碎碎念')
            expect(mobile.locator('#notes-editor')).to_be_hidden()
            no_overflow(mobile)
            capture(mobile, 'mobile-notes-public-readonly-' + str(width))
            mobile.locator('[data-notes-action=login]').click()
            mobile.locator('#username').fill(USERNAME)
            mobile.locator('#password').fill(PASSWORD)
            mobile.locator('#login-form button[type=submit]').click()
            expect(mobile.locator('#notes-editor')).to_be_visible()
            no_overflow(mobile)
            nav(mobile, 'todos')
            expect(mobile.locator('#todo-text')).to_be_visible()
            mark('mobile_' + str(width) + '_navigation_cards_detail_form_filter_overview_notes')
            mobile_context.close()

        assert not REPORT['pageerrors'] and not REPORT['dialogs'] and not REPORT['blocked_external_requests']
        REPORT['completed'] = True
        mark('no_page_errors_xss_dialogs_or_external_requests')
        context.close()
        browser.close()
        browser = None
except BaseException as error:
    REPORT['failure'] = {'type': type(error).__name__, 'message': str(error).replace(PASSWORD, '[redacted]')}
    traceback.print_exc()
finally:
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)
    error_output = server.stderr.read()
    if error_output:
        (OUT / 'fixture-stderr.log').write_text(error_output.replace(PASSWORD, '[redacted]'))
    save()

print(json.dumps({'completed': REPORT['completed'], 'checks': len(REPORT['checks']),
                  'captures': len(REPORT['captures']), 'report': str(OUT / 'report.json')}, ensure_ascii=False))
if not REPORT['completed']:
    raise SystemExit(1)
