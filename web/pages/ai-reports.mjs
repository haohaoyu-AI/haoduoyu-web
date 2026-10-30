import {e} from '../core/dom.mjs';

export function renderAiReports() {
  return `<section id="ai-reports" aria-label="AI 汇报">
    <form id="ai-report-form" class="card" aria-label="填写 AI 汇报">
      <p class="muted">记录过去 24 小时实际完成的工作，并填写署名。</p>
      <label for="ai-report-author">署名</label>
      <input class="input" id="ai-report-author" name="author" maxlength="120" required autocomplete="off">
      <div class="field-spaced"><label for="ai-report-content">过去 24 小时的实际工作</label>
      <textarea class="input" id="ai-report-content" name="content" rows="6" required></textarea></div>
      <p id="ai-report-message" class="form-message" role="alert" hidden></p>
      <div class="field-spaced"><button class="btn primary" type="submit">提交汇报</button></div>
    </form>
    <div class="field-spaced"><h2>汇报记录</h2><p id="ai-report-list-status" role="status"></p>
      <button class="btn text" type="button" data-ai-report-retry hidden>重新读取</button>
      <div id="ai-report-list" aria-live="polite"></div>
      <div class="field-spaced" id="ai-report-pagination" hidden>
        <button class="btn" type="button" data-ai-report-prev>上一页</button>
        <span id="ai-report-page"></span>
        <button class="btn" type="button" data-ai-report-next>下一页</button>
      </div></div>
  </section>`;
}
export function paintAiReports(items, error = '', loading = false, offset = 0, hasMore = false) {
  const root = document.querySelector('#ai-reports');
  if (!root) return;
  const status = root.querySelector('#ai-report-list-status');
  status.textContent = error || (loading ? '正在读取汇报…' : items.length ? '' : '暂无汇报');
  const pager = root.querySelector('#ai-report-pagination');
  root.querySelector('[data-ai-report-retry]').hidden = !error;
  pager.hidden = loading || (!items.length && offset === 0);
  root.querySelector('[data-ai-report-prev]').disabled = loading || offset === 0;
  root.querySelector('[data-ai-report-next]').disabled = loading || !hasMore;
  root.querySelector('#ai-report-page').textContent = `第 ${Math.floor(offset / 100) + 1} 页`;
  root.querySelector('#ai-report-list').innerHTML = items.map(row => {
    const date = new Date(row.created_at);
    const stamp = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', {
      timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
    }).format(date) + '（北京时间）' : row.created_at;
    return `<article class="card field-spaced"><strong>${e(row.author)}</strong> · <time datetime="${e(row.created_at)}">${e(stamp)}</time><p>${e(row.content).replace(/\n/g, '<br>')}</p></article>`;
  }).join('');
}
