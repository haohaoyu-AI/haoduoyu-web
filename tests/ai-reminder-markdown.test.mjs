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

// 待拍板 shows only the 待你拍板 items of a reminder, rendered with the same safe Markdown as before.
const ask = (...items) => '**昨天做了什么**\n- 合成：其他段落不显示\n**待你拍板**\n' + items.map((text, i) => `${i + 1}. ${text}`).join('\n') +
  '\n已按你的决定执行：合成：不显示';
test('the 待拍板 panel renders only the decision items, with bold and lists', t => {
  const dom = withReminderDom(t);
  assert.match(renderAiReports(), /data-ai-daily-tab="reminders" aria-pressed="false">待拍板/);
  paintAiDailyReminders({items: [{summary: ask('**日期字段**：2030-01-01', '核对原文')}]});
  const html = dom.html();
  assert.match(html, /<li class="ai-report-markdown"><p><strong>日期字段<\/strong>：2030-01-01<\/p><\/li>/);
  assert.match(html, /核对原文/);
  assert.match(html, /2 件待你拍板/);
  assert.doesNotMatch(html, /其他段落不显示|已按你的决定执行|\*\*日期字段/);
});

test('decision links and markup use the existing escaped-text Markdown policy', t => {
  const dom = withReminderDom(t);
  paintAiDailyReminders({items: [{summary: ask('[资料](https://example.com/a?x=1&y=2)', '[危险](javascript:alert(1))',
    '<img src=x onerror=alert(1)> <script>alert(1)</script>')}]});
  const html = dom.html();
  assert.match(html, /href="https:\/\/example.com\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script\b|<img\b|href="javascript:/);
});

test('plain decision text and incomplete markers remain readable', t => {
  const dom = withReminderDom(t);
  paintAiDailyReminders({items: [{summary: ask('原文 <内容> 未闭合 **标记')}]});
  assert.match(dom.html(), /<p>原文 &lt;内容&gt; 未闭合 \*\*标记<\/p>/);
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

test('repeated rendering preserves every source field, order and summary bytes', t => {
  const dom = withReminderDom(t);
  const rows = Object.freeze([
    Object.freeze({id: 'one', date: '2030-01-01', source_key: 'synthetic:one', summary: ask('第一条')}),
    Object.freeze({id: 'two', date: '2030-01-01', source_key: 'synthetic:two', summary: ask('第二条')})
  ]);
  const data = Object.freeze({date: '2030-01-01', items: rows});
  const before = JSON.stringify(data);
  paintAiDailyReminders(data);
  const first = dom.html();
  paintAiDailyReminders(data);
  assert.equal(dom.html(), first);
  assert.equal(JSON.stringify(data), before);
  assert.ok(first.indexOf('第一条') < first.indexOf('第二条'));
  assert.equal((first.match(/<li class="ai-report-markdown"/g) || []).length, 2);
});

test('leaving the page before a reminder render is harmless', t => {
  const previous = globalThis.document;
  globalThis.document = {querySelector: () => null};
  t.after(() => { globalThis.document = previous; });
  assert.doesNotThrow(() => paintAiDailyReminders({items: [{summary: '# 不应插入其他页面'}]}));
});
