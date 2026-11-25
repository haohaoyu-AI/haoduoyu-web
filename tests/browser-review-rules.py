"""Run scripts/preview-review-rules.mjs first; synthetic local data only.

Uses Playwright's installed Chromium, not a hardcoded OS executable.
The fixture exercises shared copyReviewPrompt with its synthetic click handler;
this is not a test of production event-registration lifecycle.
"""
import json
import os
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/review-rules-prompts'
OUT.mkdir(parents=True, exist_ok=True)
PORT = int(os.environ.get('RULES_BROWSER_PORT', '8796'))
assert 1024 <= PORT <= 65535
ORIGIN = f'http://127.0.0.1:{PORT}'
ACCOUNTS = [('V字', 'vzi'), ('鱼见', 'yujian'), ('公众号', 'wechat')]
REPORT = {'synthetic': True, 'origin': ORIGIN, 'checks': [], 'screenshots': [],
          'page_errors': [], 'http_errors': [], 'blocked_requests': [],
          'copy_coverage': 'Shared copyReviewPrompt helper and synthetic fixture click handler'}


def geometry(page, width, account, phase):
    result = page.locator('.review-rule-hierarchy').evaluate('''root => {
      const selectors = '.review-v13-rule-row,.review-v13-rule-id,.review-markdown,' +
        '.review-markdown code,.review-prompt-copy-actions .btn,.review-note,summary';
      const text = [...root.querySelectorAll(selectors)].filter(el => el.getClientRects().length).map(el => {
        const style = getComputedStyle(el);
        return {tag:el.tagName,className:el.className,fontSize:parseFloat(style.fontSize),
          lineHeight:parseFloat(style.lineHeight)};
      });
      return {viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,text};
    }''')
    assert result['pageWidth'] <= width + 1, (account, phase, result)
    if width <= 560:
        assert result['text'], (account, phase)
        for item in result['text']:
            assert item['fontSize'] >= 15, (account, phase, item)
            assert item['lineHeight'] >= item['fontSize'] * 1.55, (account, phase, item)
    REPORT['checks'].append({'width': width, 'account': account, 'phase': phase, 'geometry': result})


def check_account(page, width, account, scope):
    response = page.goto(f'{ORIGIN}/?account={quote(account)}', wait_until='networkidle')
    assert response and response.ok
    expect(page).to_have_title('规则与提示词 · 合成验收')
    root = page.locator('.review-rule-hierarchy')
    scopes = ['wechat'] if scope == 'wechat' else ['global', 'toutiao', scope]
    assert root.locator('.review-rule-layer').evaluate_all('(els)=>els.map(el=>el.dataset.ruleScope)') == scopes
    for other_account, other_scope in ACCOUNTS:
        if other_scope != scope:
            assert root.locator(f'[data-rule-scope="{other_scope}"]').count() == 0
            assert other_account + '独有规则' not in root.text_content()
    assert root.locator('.review-overridden-rule').count() == (0 if scope == 'wechat' else 2)
    assert root.locator('[data-rule-state="effective"]').count() == (2 if scope == 'wechat' else 4)
    assert root.locator('[data-rule-state="overridden"]').count() == (0 if scope == 'wechat' else 2)
    for layer_scope in scopes:
        layer = root.locator(f'[data-rule-scope="{layer_scope}"]')
        assert layer.evaluate('(el)=>el.open') == (layer_scope == scope)
    geometry(page, width, account, 'initial')
    for layer_scope in scopes:
        layer = root.locator(f'[data-rule-scope="{layer_scope}"]')
        summary = layer.locator(':scope > summary')
        if not layer.evaluate('(el)=>el.open'):
            summary.click()
        expect(layer).to_have_attribute('open', '')
        expect(summary).to_contain_text('2 条规则')
        expect(summary).to_contain_text('2 条当前生效' if layer_scope == scope else '1 条当前生效')
        if layer_scope != scope:
            expect(summary).to_contain_text('1 条被覆盖')
            overwritten = layer.locator('.review-overridden-rule')
            assert not overwritten.evaluate('(el)=>el.open')
            expect(overwritten.locator('summary')).to_contain_text(f'已被{account}账号规则覆盖')
            original = overwritten.locator('p').first
            expect(original).to_be_hidden()
            overwritten.locator('summary').click()
            expect(original).to_be_visible()
            overwritten.locator('summary').click()
            expect(original).to_be_hidden()
        summary.click()
        expect(layer.locator('.review-v13-rules')).to_be_hidden()
        summary.click()
        expect(layer.locator('.review-v13-rules')).to_be_visible()
    assert root.locator('svg').count() == 0
    expect(root).to_contain_text('<svg onload=alert(1)>应当显示为文字</svg>')
    prompt = root.locator(f'[data-rule-scope="{scope}"] .review-current-prompt')
    assert not prompt.evaluate('(el)=>el.open')
    prompt.locator('summary').click()
    expect(prompt).to_contain_text('v2')
    expect(prompt).to_contain_text('2026-11-10 12:00')
    button = prompt.locator('[data-review-action="copy-prompt"]')
    raw = f'# 合成提示词 {scope}\n**完整原文**\n> 测试引用\n\n```\n' + 'long_code_' * 90 + '\n```\n'
    for iteration in range(3):
        page.evaluate("navigator.clipboard.writeText('sentinel')")
        button.click()
        expect(prompt.locator('[data-prompt-copy-status]')).to_have_text('已复制完整提示词。')
        page.wait_for_function('(raw)=>navigator.clipboard.readText().then(text=>text===raw)', arg=raw)
        assert page.evaluate('navigator.clipboard.readText()') == raw, iteration
    code = prompt.locator('pre')
    scroll = code.evaluate('''el => {
      const style=getComputedStyle(el);el.scrollLeft=150;
      return {width:el.clientWidth,scrollWidth:el.scrollWidth,left:el.scrollLeft,
        whiteSpace:style.whiteSpace,overflowWrap:style.overflowWrap};
    }''')
    assert scroll['scrollWidth'] > scroll['width'] and scroll['left'] > 0, scroll
    assert scroll['whiteSpace'] == 'pre' and scroll['overflowWrap'] == 'normal', scroll
    code.evaluate('(el)=>el.scrollLeft=0')
    geometry(page, width, account, 'expanded')
    screenshot = OUT / f'rules-{scope}-{width}.png'
    page.screenshot(path=str(screenshot), full_page=True)
    REPORT['screenshots'].append(str(screenshot.relative_to(ROOT)))
    REPORT['checks'].append({'width': width, 'account': account, 'copy_count': 3, 'code_scroll': scroll})
    prompt.locator('summary').click()
    expect(button).to_be_hidden()
    prompt.locator('summary').click()
    expect(button).to_be_visible()


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for width in [1440, 390, 375]:
                context = browser.new_context(viewport={'width': width, 'height': 1000},
                    timezone_id='Asia/Shanghai', reduced_motion='reduce', service_workers='block',
                    permissions=['clipboard-read', 'clipboard-write'])
                def local_only(route):
                    if route.request.url.startswith(ORIGIN + '/') and route.request.method == 'GET':
                        route.continue_()
                    else:
                        REPORT['blocked_requests'].append({'url': route.request.url, 'method': route.request.method})
                        route.abort()
                context.route('**/*', local_only)
                page = context.new_page()
                page.on('pageerror', lambda error: REPORT['page_errors'].append(str(error)))
                page.on('response', lambda response: REPORT['http_errors'].append(
                    {'url': response.url, 'status': response.status}) if response.status >= 400 else None)
                try:
                    for account, scope in ACCOUNTS:
                        check_account(page, width, account, scope)
                    assert not REPORT['page_errors'], REPORT['page_errors']
                    assert not REPORT['http_errors'], REPORT['http_errors']
                    assert not REPORT['blocked_requests'], REPORT['blocked_requests']
                except Exception:
                    failure = OUT / f'failure-{width}.png'
                    page.screenshot(path=str(failure), full_page=True)
                    REPORT['screenshots'].append(str(failure.relative_to(ROOT)))
                    raise
                finally:
                    context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    try:
        main()
        REPORT['status'] = 'passed'
    except Exception as error:
        REPORT['status'] = 'failed'
        REPORT['error'] = repr(error)
        raise
    finally:
        (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2), encoding='utf-8')
