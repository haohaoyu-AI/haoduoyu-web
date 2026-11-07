import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paintAiReports, reportAuthorClass, reportGroup} from '../web/pages/ai-reports.mjs';

const authors = ['ChatGPT-dot小鱼', 'Grok Bot-小小鱼', 'Gemini'];
const classes = ['gpt', 'grok', 'gemini'];

test('each current AI has a stable distinct color, including its existing aliases', () => {
  const aliases = [['GPT', 'chatgpt', ' ChatGPT-dot小鱼 '], ['Grok bot', 'GROK BOT-小小鱼'], ['Gemini', ' GEMINI ']];
  for (const [index, values] of aliases.entries()) {
    for (const author of values) assert.equal(reportAuthorClass(author), `ai-report-author ai-report-author--${classes[index]}`);
  }
  assert.equal(new Set(authors.map(reportAuthorClass)).size, 3);
  for (const unknown of ['另一位作者', '', null, '<img src=x onerror=x>', 'constructor']) {
    assert.equal(reportGroup(unknown), '其他作者');
    assert.equal(reportAuthorClass(unknown), 'ai-report-author ai-report-author--other');
  }
});

test('color remains on author names through rerenders without altering reports or Markdown', () => {
  const elements = new Map();
  const root = {querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  }};
  const originalDocument = globalThis.document;
  globalThis.document = {querySelector: () => root};
  const items = authors.map(author => ({author, content: '2026-11-06\n**重点**\n\n- 保留原文', created_at: '2026-11-07T01:00:00Z'}));
  const originalItems = JSON.stringify(items);
  try {
    for (const date of ['2026-11-07', '2026-11-06', '2026-11-07']) {
      paintAiReports(items, '', false, date);
      const html = elements.get('#ai-report-list').innerHTML;
      for (const [index, author] of authors.entries()) {
        assert.ok(html.includes(`<strong class="ai-report-author ai-report-author--${classes[index]}">${author}：</strong>`));
      }
      assert.match(html, /<h3 class="ai-report-author ai-report-author--grok">Grok bot<\/h3>/);
      assert.equal((html.match(/<div class="ai-report-markdown"><p><strong>重点<\/strong><\/p><ul><li>保留原文<\/li><\/ul><\/div>/g) || []).length, 3);
      assert.doesNotMatch(html, /style="[^"]*color|<h3[^>]*>(?:GPT|Gemini)<\/h3>/);
    }
    assert.equal(JSON.stringify(items), originalItems);
    paintAiReports(items, '', true);
    assert.equal(elements.get('#ai-report-list').innerHTML, '');
    paintAiReports(items, '读取失败');
    assert.equal(elements.get('#ai-report-list').innerHTML, '');
    paintAiReports([{author: '"><img src=x onerror=x>', content: '原文', created_at: 'invalid'}]);
    const html = elements.get('#ai-report-list').innerHTML;
    assert.match(html, /class="ai-report-author ai-report-author--other">&quot;&gt;&lt;img src=x onerror=x&gt;：<\/strong>/);
    assert.doesNotMatch(html, /<img\b/);
  } finally { globalThis.document = originalDocument; }
});

function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}

test('author colors are scoped and meet normal text contrast on existing light surfaces', () => {
  const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  const colors = [...classes, 'other'].map(name => {
    const match = css.match(new RegExp(`\\.ai-report-author--${name} \\{ color:(#[0-9a-f]{6}); \\}`));
    assert.ok(match, `missing ${name} author color`);
    for (const background of ['#ffffff', '#fffaf7', '#f3efec', '#eee7e2']) {
      const contrast = (luminance(background) + .05) / (luminance(match[1]) + .05);
      assert.ok(contrast >= 4.5, `${name} contrast ${contrast} on ${background}`);
    }
    return match[1];
  });
  assert.equal(new Set(colors).size, 4);
});
