import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../web/core/state.mjs';
import {sidebarNavigation, mobileSettingsMenu} from '../web/ui/workbench.mjs';
import {renderAiReports, paintAiReports} from '../web/pages/ai-reports.mjs';

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

test('report reading page has no manual entry controls and retains pagination', () => {
  const html = renderAiReports();
  assert.doesNotMatch(html, /<(?:details|summary|form|input|textarea)\b/i);
  assert.doesNotMatch(html, /ai-report-(?:form|author|content|message|author-hint)/);
  assert.match(html, /id="ai-report-list-status"/);
  assert.match(html, /id="ai-report-list"/);
  assert.match(html, /id="ai-report-pagination"/);
  assert.match(html, /data-ai-report-prev/);
  assert.match(html, /data-ai-report-next/);
});

test('report reading distinguishes declared work dates from submission time and escapes text', () => {
  const elements = new Map();
  const root = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  }};
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector: () => root};
  try {
    paintAiReports([
      {author:'dot小鱼', content:'2026-10-29\n完成 <script>alert(1)</script>', created_at:'2026-10-30T03:00:00Z'},
      {author:'旧记录', content:'2026-02-30\n原文保留', created_at:'2026-10-30T03:00:00Z'}
    ]);
    const html = elements.get('#ai-report-list').innerHTML;
    assert.match(html, /<h3[^>]*>2026年10月29日<\/h3>/);
    assert.doesNotMatch(html, /2026-10-29/);
    assert.match(html, /提交日期 · 2026\/10\/30/);
    assert.match(html, /title="提交于 2026\/10\/30 11:00（北京时间）"/);
    assert.match(html, /<strong>dot小鱼：<\/strong>完成/);
    assert.match(html, /2026-02-30<br>原文保留/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  } finally { globalThis.document = originalDocument; }
});

test('report errors and pagination remain visible and actionable', () => {
  const elements = new Map();
  const root = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  }};
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector: () => root};
  try {
    paintAiReports([], 'Network error', false, 100, false);
    assert.equal(elements.get('#ai-report-list-status').textContent, 'Network error');
    assert.equal(elements.get('#ai-report-pagination').hidden, false);
    assert.equal(elements.get('[data-ai-report-prev]').disabled, false);
    assert.equal(elements.get('[data-ai-report-next]').disabled, true);
    paintAiReports([{author: 'A', content: 'B', created_at: '2026-10-30T03:00:00Z'}], '', false, 0, true);
    assert.equal(elements.get('[data-ai-report-prev]').disabled, true);
    assert.equal(elements.get('[data-ai-report-next]').disabled, false);
  } finally { globalThis.document = originalDocument; }
});
