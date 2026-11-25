import {e} from './dom.mjs';

// Small allowlisted grammar: source text is always escaped, never parsed as HTML.
// Links navigate only on a click; images, embeds, styles and raw HTML are unsupported.
function safeLink(value) {
  try {
    if (/[\u0000-\u0020\u007f]/.test(value)) return '';
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function inlineToken(part) {
  const link = part.match(/^\[([^\[\]\n]+)\]\(([^()\n]+)\)$/);
  if (link) {
    const href = safeLink(link[2]);
    return href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(link[1])}</a>` : e(part);
  }
  if (part.startsWith('**') || part.startsWith('__')) return `<strong>${e(part.slice(2, -2))}</strong>`;
  if (part.startsWith('`')) return `<code>${e(part.slice(1, -1))}</code>`;
  return `<em>${e(part.slice(1, -1))}</em>`;
}

function inline(value) {
  const text = String(value);
  const tokens = /\[[^\[\]\n]+\]\([^()\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`/g;
  let output = '', offset = 0;
  for (const match of text.matchAll(tokens)) {
    output += e(text.slice(offset, match.index)) + inlineToken(match[0]);
    offset = match.index + match[0].length;
  }
  return output + e(text.slice(offset));
}

export function renderSafeMarkdown(value) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  let out = '', list = '', paragraph = [], code = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      out += '<p>' + paragraph.map(inline).join('<br>') + '</p>';
      paragraph = [];
    }
  };
  const closeList = () => { if (list) { out += `</${list}>`; list = ''; } };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph();
      closeList();
      out += code ? '</code></pre>' : '<pre><code>';
      code = !code;
      continue;
    }
    if (code) { out += e(line) + '\n'; continue; }
    const item = line.match(/^\s*(?:(- |\* |\+ )|([0-9]{1,8})[.)] )(.*)$/);
    if (item) {
      flushParagraph();
      const type = item[2] ? 'ol' : 'ul';
      if (list !== type) {
        closeList();
        list = type;
        out += type === 'ol' ? `<ol start="${Number(item[2])}">` : '<ul>';
      }
      out += `<li>${inline(item[3])}</li>`;
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 2, 6);
      out += `<h${level}>${inline(heading[2])}</h${level}>`;
      continue;
    }
    if (!line.trim()) { flushParagraph(); continue; }
    paragraph.push(line);
  }
  flushParagraph();
  closeList();
  if (code) out += '</code></pre>';
  return out;
}
