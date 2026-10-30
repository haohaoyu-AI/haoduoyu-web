import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../web/core/state.mjs';
import {sidebarNavigation, mobileSettingsMenu} from '../web/ui/workbench.mjs';
import {renderAiReports} from '../web/pages/ai-reports.mjs';

test('AI reports are reachable in public and private desktop and mobile navigation', () => {
  for (const publicBusiness of [true, false]) {
    state.me = {id: 'test-user', publicBusiness};
    state.page = 'ai-reports';
    for (const html of [sidebarNavigation(), mobileSettingsMenu()]) {
      assert.match(html, /data-nav="ai-reports"[^>]*aria-current="page"/);
    }
    if (publicBusiness) assert.doesNotMatch(mobileSettingsMenu(), /data-action="logout"/);
  }
});

test('report form explains self-provided attribution and retains required work fields', () => {
  const html = renderAiReports();
  assert.match(html, /id="ai-report-author"[^>]*required[^>]*aria-describedby="ai-report-author-hint"/);
  assert.match(html, /id="ai-report-author-hint">署名由填写者自行提供，不代表身份已获认证。/);
  assert.match(html, /过去 24 小时的实际工作/);
  assert.match(html, /name="content"[^>]*required/);
});
