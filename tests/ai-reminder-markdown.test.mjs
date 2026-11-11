import test from 'node:test';
import assert from 'node:assert/strict';
import {paintAiDailyReminders, renderAiReports} from '../web/pages/ai-reports.mjs';

function withReminderDom(t) {
  const previous = globalThis.document;
  const elements = new Map();
  const root = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  }};
  globalThis.document = {querySelector: () => root};
  t.after(() => { globalThis.document = previous; });
  return {
    html: () => elements.get('#ai-reminder-list')?.innerHTML,
    status: () => elements.get('#ai-reminder-status')?.textContent
  };
}

test('default daily reminder panel renders headings, bold field labels and lists', t => {
  const dom = withReminderDom(t);
  assert.match(renderAiReports(), /data-ai-daily-tab="reminders" aria-pressed="true"/);
  paintAiDailyReminders({items: [{summary:
    '# 示例标题\n\n- **日期字段（sample_date）**：2030-01-01\n- **测试状态**：待复核\n\n1. 核对原文\n2. 保留日期'}]});
  const html = dom.html();
  assert.match(html, /class="ai-report-markdown"><h3>示例标题<\/h3>/);
  assert.match(html, /<ul><li><strong>日期字段（sample_date）<\/strong>：2030-01-01<\/li>/);
  assert.match(html, /<li><strong>测试状态<\/strong>：待复核<\/li><\/ul>/);
  assert.match(html, /<ol start="1"><li>核对原文<\/li><li>保留日期<\/li><\/ol>/);
  assert.doesNotMatch(html, /\*\*日期字段|<p># 示例标题/);
});

test('daily reminder links and code use the existing escaped-text Markdown policy', t => {
  const dom = withReminderDom(t);
  paintAiDailyReminders({items: [{summary:
    '[资料](https://example.com/a?x=1&y=2)\n[危险](javascript:alert(1))\n\n```\n<script>alert(1)</script>\n```\n<img src=x onerror=alert(1)>'}]});
  const html = dom.html();
  assert.match(html, /href="https:\/\/example.com\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;\n<\/code><\/pre>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script\b|<img\b|href="javascript:/);
});

test('plain reminder text, line breaks and incomplete markers remain readable', t => {
  const dom = withReminderDom(t);
  paintAiDailyReminders({items: [{summary: '原文 <内容>\n第二行\n未闭合 **标记'}]});
  assert.match(dom.html(), /<p>原文 &lt;内容&gt;<br>第二行<br>未闭合 \*\*标记<\/p>/);
  assert.equal(dom.status(), '');
});

test('empty, loading and error reminder states retain their previous behavior', t => {
  const dom = withReminderDom(t);
  paintAiDailyReminders(null, '', true);
  assert.equal(dom.status(), '正在读取工作提醒…');
  assert.equal(dom.html(), '');
  paintAiDailyReminders(null, '读取失败 <原样>');
  assert.equal(dom.status(), '读取失败 <原样>');
  assert.equal(dom.html(), '');
  paintAiDailyReminders({items: []});
  assert.equal(dom.status(), '');
  assert.equal(dom.html(), '<p>暂无工作提醒</p>');
});

test('repeated rendering preserves every source field, dates, order and summary bytes', t => {
  const dom = withReminderDom(t);
  const rows = Object.freeze([
    Object.freeze({id: 'one', date: '2030-01-01', source_key: 'synthetic:one', summary: '## 第一条\n**重点**'}),
    Object.freeze({id: 'two', date: '2030-01-01', source_key: 'synthetic:two', summary: '第二条'})
  ]);
  const data = Object.freeze({date: '2030-01-01', items: rows});
  const before = JSON.stringify(data);
  paintAiDailyReminders(data);
  const first = dom.html();
  paintAiDailyReminders(data);
  assert.equal(dom.html(), first);
  assert.equal(JSON.stringify(data), before);
  assert.ok(first.indexOf('第一条') < first.indexOf('第二条'));
  assert.equal((first.match(/class="ai-report-markdown"/g) || []).length, 2);
});

test('leaving the page before a reminder render is harmless', t => {
  const previous = globalThis.document;
  globalThis.document = {querySelector: () => null};
  t.after(() => { globalThis.document = previous; });
  assert.doesNotThrow(() => paintAiDailyReminders({items: [{summary: '# 不应插入其他页面'}]}));
});
