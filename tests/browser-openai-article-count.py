"""Exercise only the disposable loopback synthetic count server, never production."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
os.environ['XDG_CONFIG_HOME']='/tmp/ai-count-browser-config'
URL='http://127.0.0.1:8917/?page=ai-diagnosis&diagnosis_tab=help'
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1280,'height':900},service_workers='block')
    page=context.new_page(); posts=[]; errors=[]
    page.on('request',lambda request: posts.append(request.post_data_json) if request.method=='POST' and request.url.endswith('/api/v1/openai-review/runs') else None)
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.goto(URL,wait_until='networkidle')
    button=page.locator('[data-openai-action="start"]')
    expect(button).to_be_enabled(); expect(page.get_by_text('测试阶段：只统计文章数量',exact=True)).to_be_visible()
    page.screenshot(path=str(ROOT/'artifacts/count-browser-before.png'),full_page=True)
    # Dispatch twice in one event turn to verify the UI's synchronous busy guard.
    button.evaluate('(button) => {button.click(); button.click();}')
    expect(page.get_by_text('在诊断报告查看这条记录',exact=True)).to_be_visible(timeout=20000)
    assert len(posts)==1, posts
    assert posts[0]['task']=='article_count_v1', posts
    page.get_by_text('在诊断报告查看这条记录',exact=True).click()
    expect(page.get_by_text('本站文章复盘库共有 3 篇文章。',exact=True)).to_be_visible(timeout=20000)
    page.screenshot(path=str(ROOT/'artifacts/count-browser-result.png'),full_page=True)
    # Reload and browser history must not replay the paid POST.
    page.reload(wait_until='networkidle')
    expect(page.get_by_text('本站文章复盘库共有 3 篇文章。',exact=True)).to_be_visible()
    page.go_back(wait_until='networkidle'); page.go_forward(wait_until='networkidle')
    assert len(posts)==1, posts
    assert not errors, errors
    context.close(); browser.close()
receipts=json.loads((ROOT/'artifacts/count-browser-provider-receipt.json').read_text())
assert len(receipts)==1, receipts
assert receipts[0]['body']['max_output_tokens']==1024
assert 'tools' not in receipts[0]['body']
assert json.loads(receipts[0]['body']['input'][0]['content'])['article_count']==3
report={'ui_posts':len(posts),'provider_calls':len(receipts),'article_count':3,'repeat_click_reload_history_reposts':0,'page_errors':errors,'production_called':False}
(ROOT/'artifacts/count-browser-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
