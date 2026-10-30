import {e} from '../core/dom.mjs';

export function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI 汇报">
    <div class="field-spaced"><h2>汇报记录</h2><p id="ai-report-list-status" role="status"></p>
      <div id="ai-report-list" aria-live="polite"></div>
      <div class="field-spaced" id="ai-report-pagination" hidden>
        <button class="btn" type="button" data-ai-report-prev>上一页</button>
        <span id="ai-report-page"></span>
        <button class="btn" type="button" data-ai-report-next>下一页</button>
      </div></div>
  </section>`;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
});
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false
});

function reportContent(value) {
  const content = String(value ?? '');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(firstLine) ? new Date(`${firstLine}T00:00:00Z`) : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== firstLine)
    return {workDate: null, body: content};
  return {workDate: firstLine, body: content.slice(firstLine.length).replace(/^\r?\n/, '')};
}

export function paintAiReports(items, error = '', loading = false, offset = 0, hasMore = false) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  const status = root.querySelector('#ai-report-list-status');
  status.textContent = error || (loading ? '正在读取汇报…' : items.length ? '' : '暂无汇报');
  const pager = root.querySelector('#ai-report-pagination');
  pager.hidden = loading || (!items.length && offset === 0);
  root.querySelector('[data-ai-report-prev]').disabled = loading || offset === 0;
  root.querySelector('[data-ai-report-next]').disabled = loading || !hasMore;
  root.querySelector('#ai-report-page').textContent = `第 ${Math.floor(offset / 100) + 1} 页`;
  const groups = new Map();
  for (const row of items) {
    const date = new Date(row.created_at);
    const validDate = Number.isFinite(date.getTime());
    const submissionDay = validDate ? dateFormatter.format(date) : '日期未知';
    const {workDate, body} = reportContent(row.content);
    const group = workDate ? `${Number(workDate.slice(0, 4))}年${Number(workDate.slice(5, 7))}月${Number(workDate.slice(8, 10))}日` : `提交日期 · ${submissionDay}`;
    const stamp = validDate ? `${submissionDay} ${timeFormatter.format(date)}（北京时间）` : String(row.created_at ?? '未知');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(`<article class="card field-spaced" style="overflow-wrap:anywhere" title="提交于 ${e(stamp)}"><p><strong>${e(row.author)}：</strong><br><br>${e(body).replace(/\n/g, '<br>')}</p></article>`);
  }
  root.querySelector('#ai-report-list').innerHTML = [...groups].map(([group, rows]) =>
    `<h3 class="field-spaced">${e(group)}</h3>${rows.join('')}`).join('');
}
