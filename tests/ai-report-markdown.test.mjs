import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSafeMarkdown} from '../web/core/safe-markdown.mjs';

test('safe report Markdown supports headings, lists, emphasis, links and plain text',()=>{
  const html=renderSafeMarkdown('# 标题\n\n普通一行\n下一行\n\n- **重点**\n- *强调*\n\n1. 第一项\n2. 第二项\n\n[文档](https://example.com/a?q=1&x=2)');
  assert.match(html,/<h3>标题<\/h3>/);
  assert.match(html,/<p>普通一行<br>下一行<\/p>/);
  assert.match(html,/<ul><li><strong>重点<\/strong><\/li><li><em>强调<\/em><\/li><\/ul>/);
  assert.match(html,/<ol start="1"><li>第一项<\/li><li>第二项<\/li><\/ol>/);
  assert.match(html,/<a href="https:\/\/example\.com\/a\?q=1&amp;x=2" target="_blank" rel="noopener noreferrer">文档<\/a>/);
});
test('raw HTML, malicious URLs, attributes and code are escaped',()=>{
  const html=renderSafeMarkdown('<img src=x onerror=alert(1)>\n[坏](javascript:alert(1))\n[坏二](data:text/html,x)\n[伪装](https://user:pass@example.com/)\n[引号](https://example.com/"onmouseover="x)\n```\n<script>alert(1)</script>\n```');
  assert.doesNotMatch(html,/<img|<script|href="(?:javascript|data):|href="https:\/\/user:/i);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/\[坏\]\(javascript:alert\(1\)\)/);
  assert.match(html,/<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /"onmouseover="/);
});
test('plain text and unmatched punctuation remain visible',()=>{
  assert.equal(renderSafeMarkdown('旧记录\n第二行 <内容>'),'<p>旧记录<br>第二行 &lt;内容&gt;</p>');
  assert.equal(renderSafeMarkdown('未闭合 **标记'),'<p>未闭合 **标记</p>');
});

test('unsupported or incomplete syntax stays literal and empty input is safe', () => {
  for (const value of ['', null, undefined]) assert.equal(renderSafeMarkdown(value), '');
  for (const value of ['*', '**', '_', '__', '`', '[open', '[label](', '**unfinished', 'plain <&>']) {
    const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert.equal(renderSafeMarkdown(value), `<p>${escaped}</p>`);
  }
  assert.equal(renderSafeMarkdown('a\r\nb\rc'), '<p>a<br>b<br>c</p>');
});

test('only absolute HTTP(S) links without credentials or control characters are clickable', () => {
  const blocked = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<svg/onload=alert(1)>', 'vbscript:msgbox(1)',
    'file:///etc/passwd', 'blob:https://example.com/id', 'mailto:test@example.com', '//example.com/x', '/local',
    'java&#115;cript:alert(1)', 'https://user@example.com/', 'https://user:pass@example.com/',
    'https://example.com/has space', 'https://example.com/\tpath', 'https://example.com/\u0000path', 'https://example.com/\u007fpath'
  ];
  for (const url of blocked) assert.doesNotMatch(renderSafeMarkdown(`[link](${url})`), /<a\b/, url);
  assert.match(renderSafeMarkdown('[safe](HTTPS://example.com/a?x=1&y=2#part)'),
    /href="https:\/\/example.com\/a\?x=1&amp;y=2#part" target="_blank" rel="noopener noreferrer"/);
  assert.match(renderSafeMarkdown('[safe](http://example.com/)'), /href="http:\/\/example.com\/"/);
});

test('HTML, entities, images, embeds and attribute payloads cannot create active markup', () => {
  const payload = '<svg onload=alert(1)><foreignObject><iframe srcdoc="<script>x</script>"></iframe></foreignObject></svg>' +
    '\n<style>body{display:none}</style>\n<img src=x onerror=x>\n![track](https://example.com/pixel)' +
    '\n[<img src=x onerror=x>](https://example.com/"onclick="x)' +
    '\n&lt;script&gt;alert(1)&lt;/script&gt;';
  const html = renderSafeMarkdown(payload);
  assert.doesNotMatch(html, /<(?:svg|foreignObject|iframe|script|style|img|object|embed)\b/i);
  assert.doesNotMatch(html, /"(?:onclick|onload|onerror)="/i);
  assert.match(html, /&amp;lt;script&amp;gt;/);
  assert.match(html, /&lt;img src=x onerror=x&gt;/);
  assert.match(html, /href="https:\/\/example.com\/%22onclick=%22x"/);
});

test('code remains inert, all opened containers close, and lists may switch types', () => {
  assert.equal(renderSafeMarkdown('`<img src=x>`'), '<p><code>&lt;img src=x&gt;</code></p>');
  assert.equal(renderSafeMarkdown('```js\n<script>x</script>\n**bold**'),
    '<pre><code>&lt;script&gt;x&lt;/script&gt;\n**bold**\n</code></pre>');
  assert.equal(renderSafeMarkdown('3. third\n- bullet\n\nend'),
    '<ol start="3"><li>third</li></ol><ul><li>bullet</li></ul><p>end</p>');
  assert.equal(renderSafeMarkdown('###### deepest'), '<h6>deepest</h6>');
});

test('large unmatched opening delimiters remain intact without excessive backtracking', () => {
  const source = '['.repeat(100000) + '\n' + '[a]('.repeat(25000);
  const started = performance.now();
  assert.equal(renderSafeMarkdown(source), '<p>' + source.replace('\n', '<br>') + '</p>');
  assert.ok(performance.now() - started < 2000, 'unmatched syntax must not block the UI');
});
