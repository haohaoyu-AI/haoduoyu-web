import {e} from './dom.mjs';

export function safeReviewUrl(value) {
  try { const url = new URL(String(value)); return ['https:','http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
// Cache missing closing delimiters so long malformed input cannot trigger quadratic scans.
function inline(value, depth = 0) {
  const text = String(value);
  if (depth >= 8) return e(text);
  const last = new Map(['[/red]','[/blue]','[/green]','[/amber]','**','`','](',')']
    .map(token => [token,text.lastIndexOf(token)]));
  let out = '', plain = 0, pos = 0;
  const emit = (end,html) => { out += e(text.slice(plain,pos)) + html; pos = end; plain = end; };
  while (pos < text.length) {
    const color = text[pos] === '[' ? text.slice(pos,pos+7).match(/^\[(red|blue|green|amber)\]/) : null;
    if (color) {
      const close = `[/${color[1]}]`, start = pos+color[0].length;
      const end = last.get(close) >= start ? text.indexOf(close,start) : -1;
      if (end >= start) {
        emit(end+close.length,`<span class="review-color-${color[1]}">${inline(text.slice(start,end),depth+1)}</span>`);
        continue;
      }
    }
    const token = text.startsWith('**',pos) ? '**' : text[pos] === '`' ? '`' : '';
    if (token && last.get(token) > pos+token.length) {
      const end = text.indexOf(token,pos+token.length), content = text.slice(pos+token.length,end);
      emit(end+token.length,token === '`' ? `<code>${e(content)}</code>` : `<strong>${inline(content,depth+1)}</strong>`);
      continue;
    }
    if (text[pos] === '[' && last.get('](') > pos && last.get(')') > last.get('](')) {
      const middle = text.indexOf('](',pos+1), end = text.indexOf(')',middle+2);
      const label = text.slice(pos+1,middle), href = safeReviewUrl(text.slice(middle+2,end));
      emit(end+1,href ? `<a href="${e(href)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>` : e(label));
      continue;
    }
    pos++;
  }
  return out + e(text.slice(plain));
}
// Deliberately small Markdown grammar: raw HTML and arbitrary URL schemes never enter the DOM.
export function renderReviewMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g,'\n').split('\n');
  let list = false, code = false, out = '';
  for (const line of lines) {
    if (/^\s*```/.test(line)) { if (list) { out += '</ul>'; list = false; } out += code ? '</code></pre>' : '<pre><code>'; code = !code; continue; }
    if (code) { out += e(line) + '\n'; continue; }
    const item = line.match(/^\s*[-*]\s+(.+)$/);
    if (item) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(item[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { const h = Math.min(heading[1].length + 1,5); out += `<h${h}>${inline(heading[2])}</h${h}>`; }
    else if (line.trim()) out += /^>\s?/.test(line) ? `<blockquote>${inline(line.replace(/^>\s?/,''))}</blockquote>` : `<p>${inline(line)}</p>`;
  }
  return out + (list ? '</ul>' : '') + (code ? '</code></pre>' : '');
}
