import {e} from '../core/dom.mjs';
import {enrichArticles} from '../../shared/review-analytics.mjs';
import {experiments, patternStats, ruleNames} from '../../shared/review-experiments.mjs';
import {renderReviewMarkdown} from '../core/review-markdown.mjs';

export const AI_FEATURE_LABELS = {weekly:'周报', titles:'标题归类', benchmarks:'爆文拆解', diagnosis:'单篇诊断'};
export const AI_EFFORT_LABELS = [['','模型默认'],['low','低'],['medium','中'],['high','高']];
const known = value => value !== null && value !== undefined && Number.isFinite(value);
const reads = value => !known(value) ? '—' : value >= 10000 ? `${(value / 10000).toFixed(1)} 万` : Math.round(value).toLocaleString('zh-CN');
const rate = value => known(value) ? `${value.toFixed(1)}%` : '—';
const busy = (ai, key) => ai?.busy === key;
// Patterns are often recorded as bare rule codes ("T3"); show the rule's own words first and the code after.
const nameCache = new WeakMap();
function namesOf(data) {
  const books = data?.playbooks;
  if (!Array.isArray(books)) return new Map();
  if (!nameCache.has(books)) nameCache.set(books, ruleNames(books));
  return nameCache.get(books);
}
function patternHtml(pattern, names) {
  return names.has(pattern) ? `${e(names.get(pattern))} <small class="review-pattern-code">${e(pattern)}</small>` : e(pattern);
}
const button = (label, action, attrs = '', kind = 'btn small') =>
  `<button class="${kind}" type="button" data-ai-action="${action}" ${attrs}>${e(label)}</button>`;

/** Model and effort for one run only; the saved defaults stay as they are. */
function onceOptions(ai, feature) {
  if (ai?.options !== feature) return '';
  const models = ai.models?.length ? ai.models : [];
  return `<div class="review-ai-once" role="group" aria-label="仅这一次的模型和强度"><label>模型<select class="input" data-ai-once="model">
    <option value="">按设置</option>${models.map(id => `<option value="${e(id)}"${ai.once?.model === id
      ? ' selected' : ''}>${e(id)}</option>`).join('')}</select></label>
    <label>强度<select class="input" data-ai-once="effort"><option value="">按设置</option>${AI_EFFORT_LABELS.slice(1).map(([id,label]) =>
      `<option value="${id}"${ai.once?.effort === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
    <span class="review-note">${ai.modelsError ? e(ai.modelsError) : models.length ? '只对这一次生效' : '正在读取模型列表…'}</span></div>`;
}
function runControls(ai, feature, label) {
  const working = busy(ai, feature);
  return `<div class="review-ai-run">${button(working ? '正在生成…' : label, 'run', `data-ai-feature="${feature}"${working || ai?.busy ? ' disabled' : ''}`,
    'btn small primary')}
    ${button('⚙', 'options', `data-ai-feature="${feature}" aria-label="这一次用别的模型或强度" aria-expanded="${ai?.options === feature}"`, 'btn small review-ai-gear')}
    ${onceOptions(ai, feature)}</div>`;
}
function notice(ai, feature) {
  const message = ai?.messages?.[feature];
  return message ? `<p class="review-ai-message${message.error ? ' is-error' : ''}" role="${message.error ? 'alert' : 'status'}">${e(message.text)}</p>` : '';
}
function unavailable(ai) {
  if (!ai || ai.status === 'loading') return '<p class="review-note" role="status">正在读取 AI 结果…</p>';
  if (ai.status === 'error') return `<p class="review-ai-message is-error" role="alert">${e(ai.error || 'AI 结果读取失败')} ${button('重试', 'reload')}</p>`;
  if (!ai.data?.configured) return '<p class="review-note">服务器还没有配置 API 密钥和默认模型，AI 功能暂不可用。</p>';
  return '';
}
function evidenceLine(live) {
  if (!live.n_with) return live.tagged ? `已有 ${live.tagged} 篇用了这条，数据还没满 24 小时。` : '还没有文章标明用了这条。';
  const compare = live.n_without ? `；同期没用的 ${live.n_without} 篇：阅读 ${reads(live.reads_without)}，点击率 ${rate(live.ctr_without)}` : '';
  return `用了的 ${live.n_with} 篇：阅读中位数 ${reads(live.reads_with)}，点击率 ${rate(live.ctr_with)}${compare}。`;
}
function ruleCard(rule, ai) {
  const working = ai?.busy === 'rule:' + rule.rule_id, canWrite = Boolean(rule.playbook.content_hash);
  const attrs = `data-rule-id="${e(rule.rule_id)}" data-playbook-id="${e(rule.playbook.id)}"${working || ai?.busy || !canWrite ? ' disabled' : ''}`;
  const trial = rule.status === 'trial', live = rule.live;
  const actions = trial ? `${button('采纳', 'rule-status', `data-status="kept" ${attrs}`, 'btn small primary')}
      ${button('放弃', 'rule-status', `data-status="dropped" ${attrs}`)}${live.ready ? '' : '<span class="review-note">样本还少，建议先继续观察</span>'}`
    : `${button('同意试验', 'rule-status', `data-status="trial" ${attrs}`, 'btn small primary')}${button('不采纳', 'rule-status', `data-status="dropped" ${attrs}`)}`;
  const progress = trial ? `<div class="review-exp-progress"><span class="review-exp-bar"><i class="review-exp-fill review-exp-fill-${Math.min(6,
    live.n_with)}"></i></span>
      <strong>${live.n_with}/${live.needed} 篇</strong>${live.ready ? '<span class="review-exp-ready">可以下结论</span>' : ''}</div>
      <p class="review-exp-evidence">${e(evidenceLine(live))}</p>` : '';
  return `<article class="review-exp-card${trial ? ' is-trial' : ''}"><p class="review-exp-text">${e(rule.text || rule.rule_id)}</p>${progress}
    <div class="review-exp-actions">${actions}</div><span
      class="review-exp-id">${e(rule.rule_id)} · ${e(rule.playbook.account)} v${e(rule.playbook.version)}</span></article>`;
}
/** The experiment loop: suggestions waiting for a yes or no, then trials with live numbers. */
export function renderExperiments(data, vm, {compact = false} = {}) {
  const ai = vm.ai, rows = enrichArticles(data, {account: vm.account});
  const rules = experiments(data.playbooks, rows, {explicit: ai?.data?.candidates || {}});
  const waiting = rules.filter(rule => rule.status === 'candidate').slice(0, 8), running = rules.filter(rule => rule.status === 'trial');
  if (compact && !waiting.length && !running.length) return '';
  const message = ai?.messages?.rules;
  const group = (title, hint, items, none) => `<div class="review-exp-group"><h3>${title} <small>${items.length} 条</small></h3>${items.length
    ? `<p class="review-note">${hint}</p><div class="review-exp-list">${items.map(rule => ruleCard(rule,
      ai)).join('')}</div>` : `<p class="review-note">${none}</p>`}</div>`;
  return `<section class="review-exp" aria-label="小改试验"><div class="review-exp-head"><h2>小改试验</h2></div>
    ${message ? `<p class="review-ai-message${message.error ? ' is-error' : ''}" role="${message.error ? 'alert' : 'status'}">${e(message.text)}</p>` : ''}
    ${group('待你确认', '同意后进入试验；之后的文章标明用了它，数据会自动对比。', waiting, ai?.status === 'ready' ? '没有新的小改建议。' : '正在读取…')}
    ${group('进行中的试验', `每条攒够 ${running[0]?.live.needed ?? 6} 篇有数据的文章再下结论；阅读取发布后约 24 小时。`, running, '没有进行中的试验。')}</section>`;
}
function weeklySection(vm) {
  const ai = vm.ai, gate = unavailable(ai);
  if (gate) return `<section class="review-ai-block"><h2>周报</h2>${gate}</section>`;
  const reports = ai.data.weekly || [], latest = reports[0], due = ai.data.pending?.weekly;
  const body = report => `<div class="review-markdown review-weekly-body">${renderReviewMarkdown(report.summary_md || '')}</div>
    <p class="review-note">${e(report.period_start)} 至 ${e(report.period_end)} · ${e(report.model || '')}${report.effort
      ? ' · 强度' + e(AI_EFFORT_LABELS.find(([id]) => id === report.effort)?.[1] || '') : ''}</p>`;
  const older = reports.slice(1).map(report => `<details
    class="review-weekly-old"><summary>${e(report.period_start)} 至 ${e(report.period_end)}</summary>${body(report)}</details>`).join('');
  const hint = due ? `${due.start} 至 ${due.end} 的周报还没生成。` : latest ? '本期已生成，可以重新生成。' : '';
  return `<section class="review-ai-block" aria-label="周报"><div class="review-ai-head"><h2>周报</h2><span class="review-note">${e(hint)}</span></div>
    ${runControls(ai, 'weekly', latest && !due ? '重新生成' : '立即生成')}${notice(ai, 'weekly')}
    ${latest ? body(latest) : '<p class="review-note">还没有周报。每周日生成上周六到本周五的总结，也可以现在点“立即生成”。</p>'}${older}</section>`;
}
function patternSection(data, vm) {
  const ai = vm.ai, gate = unavailable(ai), rows = enrichArticles(data, {account: vm.account});
  const labels = ai?.data?.titles || {}, stats = patternStats(rows, labels), pending = ai?.data?.pending?.titles || 0, names = namesOf(data);
  const article = item => `<li><button type="button" class="review-title-button" data-review-article="${e(item.id)}"
    aria-haspopup="dialog">${e(item.title || '未命名文章')}</button>
    <span class="review-note">阅读 ${e(reads(item.reads))}${item.verdict ? ' · ' + e(item.verdict) : ''}</span></li>`;
  // A pattern name alone is abstract, so every pattern leads with its best-read real title and opens to all of them.
  const block = item => { const best = item.articles[0], few = item.count < 3;
    const code = item.code && !names.has(item.pattern);
    return `<details class="review-pattern-item"><summary><span class="review-pattern-name">${patternHtml(item.pattern, names)}${code
      ? ` <small class="review-pattern-code">${e(item.code)}</small>` : ''}${few ? ' <small class="review-pattern-code">样本少</small>' : ''}</span>
      <span class="review-pattern-figures"><span><b>${item.count}</b> 篇</span><span>阅读中位数 <b>${e(reads(item.reads))}</b></span>
      <span>点击率 <b>${e(rate(item.ctr))}</b></span><span>爆款 <b>${item.hits}</b></span></span>
      <span class="review-pattern-example">例：${e(best?.title || '未命名文章')}<span class="review-note">（阅读 ${e(reads(best?.reads))}）</span></span></summary>
      <ul class="review-pattern-articles">${item.articles.map(article).join('')}</ul></details>`; };
  const table = stats.length ? `<div class="review-pattern-list">${stats.map(block).join('')}</div>
    <p class="review-note">每个套路下面的“例”是其中阅读最高的一篇，点开可以看全部文章。只统计有 24 小时数据的文章；少于 3 篇的套路仅供参考。</p>`
    : '<p class="review-note">还没有归类好的标题。</p>';
  return `<section class="review-ai-block" aria-label="标题套路"><div class="review-ai-head"><h2>标题套路</h2>
    <span class="review-note">${pending ? `${pending} 篇还没归类` : '全部已归类'}</span></div>
    ${gate || (pending ? runControls(ai, 'titles', `归类 ${Math.min(pending, 60)} 篇`) : '')}${notice(ai, 'titles')}${table}</section>`;
}
export function renderWeeklyPage(data, vm) {
  return `<div class="review-weekly-page">${renderExperiments(data, vm)}${weeklySection(vm)}${patternSection(data, vm)}</div>`;
}
/** Shown above the benchmark library: what the AI made of each headline. */
export function benchmarkAiBar(vm) {
  const ai = vm.ai, gate = unavailable(ai), pending = ai?.data?.pending?.benchmarks || 0;
  return `<div class="review-ai-block review-ai-bar"><div class="review-ai-head"><h2>爆文拆解</h2>
    <span class="review-note">${gate ? '' : pending ? `${pending} 篇还没拆解 · 只根据标题和阅读量` : '全部已拆解 · 只根据标题和阅读量'}</span></div>
    ${gate || (pending ? runControls(ai, 'benchmarks', `拆解 ${Math.min(pending, 30)} 篇`) : '')}${notice(ai, 'benchmarks')}</div>`;
}
/** Every analysed headline, most-read first, so the next imitation can be picked from the list. */
export function renderBenchmarkBreakdown(data, vm) {
  const notes = vm.ai?.data?.benchmarks || {}, accounts = new Map((data.benchmarkAccounts || []).map(item => [String(item.id), item.name]));
  const used = new Set((data.articles || []).map(row => row.reference_article_id).filter(Boolean).map(String));
  const items = (data.benchmarkArticles || []).filter(item => notes[item.id]).sort((a, b) => (b.reads ?? 0) - (a.reads ?? 0)).slice(0, 30);
  const safe = value => { try { const url = new URL(String(value)); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const list = items.map(item => { const url = safe(item.url), title = e(item.title || '未命名文章');
    return `<li class="review-breakdown-item"><div class="review-breakdown-title">${url ? `<a href="${e(url)}" target="_blank"
      rel="noopener noreferrer">${title}</a>` : title}
      <span class="review-note">${e(accounts.get(String(item.benchmark_account_id)) || '')} · 阅读 ${e(reads(item.reads))}${used.has(String(item.id))
        ? ' · 已仿写' : ''}</span></div>
      ${benchmarkAiNote(vm, item.id)}</li>`; }).join('');
  return `${benchmarkAiBar(vm)}${list ? `<ul class="review-breakdown-list">${list}</ul>` : ''}`;
}
export function benchmarkAiNote(vm, id) {
  const note = vm.ai?.data?.benchmarks?.[id];
  if (!note) return '';
  const part = (label, value) => value ? `<span><b>${label}</b>${e(value)}</span>` : '';
  return `<div class="review-ai-note">${part('套路', note.pattern)}${part('钩子', note.hook)}${part('题材', note.topic)}${part('可套用', note.template)}</div>`;
}
export function titlePattern(vm, row, data) {
  const own = row.title_pattern, label = own || vm.ai?.data?.titles?.[row.id], names = namesOf(data);
  const shown = names.has(label) ? names.get(label) : label, origin = own ? '已登记的标题套路' : 'AI 归类';
  return label ? `<span class="review-pattern-tag${own ? '' : ' is-ai'}" title="${e(origin + (shown === label ? '' : '：' + label))}">${e(shown)}</span>` : '';
}
/** Settings → AI: one default per feature, a daily ceiling, and what ran lately. */
export function renderAiSettings(ai) {
  if (!ai || ai.status === 'loading') return '<section id="ai-settings" class="ai-settings"><p role="status">正在读取 AI 设置…</p></section>';
  if (ai.status === 'error') return `<section id="ai-settings" class="ai-settings"><p role="alert">${e(ai.error || '读取失败')}</p>${button('重试',
    'reload')}</section>`;
  const data = ai.data, draft = ai.draft || data.settings, models = ai.models || [];
  const modelSelect = (feature, value) => {
    const list = [...new Set([...(value ? [value] : []), ...models])];
    return `<select class="input" data-ai-setting="model" data-ai-feature="${feature}" aria-label="${AI_FEATURE_LABELS[feature]}的模型">
      <option value="">服务器默认${data.default_model ? `（${e(data.default_model)}）` : ''}</option>${list.map(id =>
        `<option value="${e(id)}"${id === value ? ' selected' : ''}>${e(id)}</option>`).join('')}</select>`;
  };
  const effortSelect = (feature, value) => `<select class="input" data-ai-setting="effort" data-ai-feature="${feature}"
    aria-label="${AI_FEATURE_LABELS[feature]}的强度">
    ${AI_EFFORT_LABELS.map(([id,label]) => `<option value="${id}"${id === value ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
  const rows = Object.entries(AI_FEATURE_LABELS).map(([feature,label]) => `<tr><th scope="row">${label}</th>
    <td data-label="模型">${modelSelect(feature, draft.features[feature].model)}</td><td data-label="强度">${effortSelect(feature,
      draft.features[feature].effort)}</td></tr>`).join('');
  const status = {succeeded:'成功', failed:'失败', running:'进行中'};
  const time = value => value ? new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit',
    minute:'2-digit', hourCycle:'h23'}).format(new Date(value)) : '';
  const runs = (data.runs || []).map(run => `<tr><td>${e(time(run.started_at))}</td><td>${e(AI_FEATURE_LABELS[run.feature]
    || run.feature)}</td><td>${e(run.model || '')}${run.effort ? ' · ' + e(run.effort) : ''}</td>
    <td class="${run.status === 'failed' ? 'ai-run-failed' : ''}">${status[run.status] || run.status}${run.effort_ignored
      ? '（该模型不支持强度，已忽略）' : ''}${run.message ? '：' + e(run.message) : ''}</td>
    <td>${known(run.input_tokens) ? `${run.input_tokens} / ${run.output_tokens ?? '—'}` : '—'}</td></tr>`).join('');
  const message = ai.messages?.settings;
  return `<section id="ai-settings" class="ai-settings" aria-label="AI 设置">
    ${data.configured ? '' : '<p role="alert">服务器还没有配置 API 密钥和默认模型。密钥只保存在服务器后台，不会出现在网页里。</p>'}
    <form id="ai-settings-form"><h2>每个功能的默认模型和强度</h2>
    <div class="ai-settings-table-wrap"><table class="ai-settings-table"><thead><tr><th>功能</th><th>模型</th><th>强度</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="muted">${ai.modelsError ? e(ai.modelsError) : models.length ? '模型列表来自你的 API 账号。强度只对支持推理强度的模型有效，不支持时会自动忽略。' : '正在读取模型列表…'}</p>
    <label class="ai-settings-limit">每日最多调用次数<input class="input" type="number" min="0" max="200" step="1" inputmode="numeric"
      data-ai-setting="daily_limit" value="${draft.daily_limit}"></label>
    <p class="muted">今天已用 ${data.usage.used} / ${data.usage.limit} 次。到上限后当天不再调用；单篇诊断另有每天 20 篇的上限。</p>
    <div class="form-actions"><button class="btn primary" type="submit"${ai.busy === 'settings' || !ai.dirty ? ' disabled' : ''}>${ai.busy === 'settings'
      ? '正在保存…' : '保存'}</button>
    <span role="${message?.error ? 'alert' : 'status'}" class="${message?.error ? 'ai-run-failed' : 'muted'}">${e(message?.text || (ai.dirty
      ? '有未保存的修改' : ''))}</span></div></form>
    <h2>最近运行</h2>${runs ? `<div class="ai-settings-table-wrap"><table
      class="ai-runs-table"><thead><tr><th>时间</th><th>功能</th><th>模型</th><th>结果</th><th>输入 / 输出 token</th></tr></thead><tbody>${runs}</tbody></table></div>
    <p class="muted">这里显示 token 用量；折合金额请以 OpenAI 后台账单为准。</p>` : '<p class="muted">最近三天没有运行记录。</p>'}</section>`;
}
