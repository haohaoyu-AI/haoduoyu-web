import test from 'node:test';
import assert from 'node:assert/strict';
import {state} from '../web/core/state.mjs';
import {sidebarNavigation, mobileSettingsMenu} from '../web/ui/workbench.mjs';
import {renderAiReports, paintAiReports, reportDay} from '../web/pages/ai-reports.mjs';
import {readAllAiReports, aiReportsYesterday, sortAiReports} from '../web/ai-reports-controller.mjs';

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

test('report reading page has no report entry controls and offers date navigation', () => {
  const html = renderAiReports();
  assert.doesNotMatch(html, /<(?:details|summary|form|textarea)\b/i);
  assert.doesNotMatch(html, /ai-report-(?:form|author|content|message|author-hint)/);
  assert.match(html, /id="ai-report-list-status"/);
  assert.match(html, /id="ai-report-list"/);
  assert.doesNotMatch(html, /id="ai-report-pagination"/);
  assert.match(html, /id="ai-report-date"[^>]*type="date"/);
  assert.match(html, /data-ai-report-previous/);
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
    ], '', false, '2026-10-29');
    const html = elements.get('#ai-report-list').innerHTML;
    assert.match(html, /<h3[^>]*>2026年10月29日<\/h3>/);
    assert.doesNotMatch(html, /2026-10-29/);
    assert.equal((html.match(/<h3\b/g) || []).length, 1);
    assert.match(html, /title="提交于 2026\/10\/30 11:00（北京时间）"/);
    assert.match(html, /<strong>dot小鱼：<\/strong><br><br>完成/);
    assert.match(html, /2026-02-30<br>原文保留/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  } finally { globalThis.document = originalDocument; }
});

test('report author is emphasized above four escaped, line-separated items', () => {
  const elements = new Map();
  const root = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  }};
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector: () => root};
  try {
    paintAiReports([{
      author: 'ChatGPT-dot\u5c0f\u9c7c',
      content: '2026-10-29\n1. First\n2. Second\n3. <script>alert(1)</script>\n4. Fourth',
      created_at: '2026-10-30T03:00:00Z'
    }]);
    const html = elements.get('#ai-report-list').innerHTML;
    assert.ok(html.includes('<strong>ChatGPT-dot\u5c0f\u9c7c\uff1a</strong><br><br>1. First<br>2. Second<br>3. &lt;script&gt;alert(1)&lt;/script&gt;<br>4. Fourth'));
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /\*\*ChatGPT-dot/);
  } finally { globalThis.document = originalDocument; }
});

test('report errors and date navigation remain visible and actionable', () => {
  const elements = new Map();
  const root = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  }};
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector: () => root};
  try {
    paintAiReports([], 'Network error', false, '2026-10-29');
    assert.equal(elements.get('#ai-report-list-status').textContent, 'Network error');
    assert.equal(elements.get('#ai-report-date').value, '2026-10-29');
    assert.equal(elements.get('[data-ai-report-next]').disabled, '2026-10-29' >= elements.get('#ai-report-date').max);
  } finally { globalThis.document = originalDocument; }
});

test('declared work date takes precedence; otherwise use the Beijing submission date', () => {
  assert.equal(reportDay({content:'2026-10-29\nwork',created_at:'2026-10-30T03:00:00Z'}),'2026-10-29');
  assert.equal(reportDay({content:'2026-02-30\nwork',created_at:'2026-10-29T17:00:00Z'}),'2026-10-30');
});

test('default date is yesterday across month, year and leap-day boundaries', () => {
  assert.equal(aiReportsYesterday('2026-10-30'), '2026-10-29');
  assert.equal(aiReportsYesterday('2026-01-01'), '2025-12-31');
  assert.equal(aiReportsYesterday('2024-03-01'), '2024-02-29');
});

test('report order is GPT, BOT, GEMINI then other authors regardless of input order', () => {
  const rows = [
    {id:'g',author:'Gemini',created_at:'2026-10-29T08:00:00Z'},
    {id:'o',author:'Other',created_at:'2026-10-29T01:00:00Z'},
    {id:'b',author:'Grok Bot-小小鱼',created_at:'2026-10-29T03:00:00Z'},
    {id:'a',author:'ChatGPT-dot小鱼',created_at:'2026-10-29T09:00:00Z'},
    {id:'a2',author:'ChatGPT-dot小鱼',created_at:'2026-10-29T02:00:00Z'}
  ];
  const expected = ['a2','a','b','g','o'];
  assert.deepEqual(sortAiReports(rows).map(row => row.id), expected);
  assert.deepEqual(sortAiReports([...rows].reverse()).map(row => row.id), expected);
  assert.equal(rows[0].id, 'g');
});

test('reads all pages before selecting a day, including more than 100 reports', async () => {
  const first = Array.from({length:100}, (_, i) => ({id:String(i),content:'2026-10-29\nwork',created_at:'2026-10-30T03:00:00Z'}));
  const paths=[];
  const rows=await readAllAiReports(async path => { paths.push(path); return paths.length===1 ?
    {items:first,has_more:true} : {items:[{id:'100',content:'2026-10-29\nmore',created_at:'2026-10-30T03:00:00Z'}],has_more:false}; });
  assert.equal(rows.filter(row=>reportDay(row)==='2026-10-29').length,101);
  assert.deepEqual(paths,['/ai-reports?offset=0','/ai-reports?offset=100']);
});
