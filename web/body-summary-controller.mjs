import {api} from './core/api.mjs';

/** The label whose history view shows the weekly summary card. */
export const BODY_SUMMARY_LABEL = '大小便记录';
const STATS = [['bowel','排便'],['normal','正常'],['loose','偏稀'],['hard','偏硬'],['accidents','意外'],['discomfort','不适']];
const REFRESH_MS = 5 * 60000;
const view = {data:null, loadedAt:0, loading:null, busy:'', error:'', contextOpen:false};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const short = date => `${Number(date.slice(5,7))}/${Number(date.slice(8))}`;
const time = stamp => {
  const value = Date.parse(stamp);
  return Number.isFinite(value) ? new Date(value + 8 * 3600000).toISOString().slice(5,16).replace('T',' ').replace('-','/') : '';
};

/** Shown above the history list only while the label filter is the bowel/bladder label. */
export function paintBodySummary(root, label) {
  const section = root.querySelector('#body-summary');
  if (!section) return;
  const wasHidden = section.hidden;
  section.hidden = label !== BODY_SUMMARY_LABEL;
  if (section.hidden) return;
  if (!view.loading && (!view.data || Date.now() - view.loadedAt > REFRESH_MS)) return void load(section);
  // Other history repaints leave the card alone, so a background note being typed is not lost.
  if (wasHidden || !section.childElementCount) draw(section);
}

async function load(section) {
  view.error = '';
  view.loading = (async () => {
    try {
      view.data = await api('/body-summary'); view.loadedAt = Date.now();
      // Opening the page is enough: last week's summary is written the first time it is missing.
      if (view.data.configured && !view.data.last) await generate(section, 'last', false);
    } catch (error) { view.error = error.message || '小结读取失败'; }
    finally { view.loading = null; draw(section); }
  })();
  draw(section);
}
async function generate(section, week, redo) {
  view.busy = week; view.error = ''; draw(section);
  try {
    const saved = await api('/body-summary', {method:'POST', body:{week, redo}});
    view.data = {...view.data, [week]:saved};
  } catch (error) { view.error = error.message || '生成失败，请稍后再试'; }
  finally { view.busy = ''; draw(section); }
}
async function saveContext(section, text) {
  view.busy = 'context'; view.error = ''; draw(section);
  try {
    const saved = await api('/body-summary/context', {method:'PUT', body:{text}});
    view.data = {...view.data, context:saved.text}; view.contextOpen = false;
  } catch (error) { view.error = error.message || '保存失败'; }
  finally { view.busy = ''; draw(section); }
}

/** This week's summary once it exists, otherwise last week's. */
function shown(data) {
  const current = data?.current, last = data?.last;
  return current && !current.empty ? current : last;
}
function stats(summary) {
  const row = el('div', 'body-summary-stats');
  for (const [key, name] of STATS) {
    const value = summary.stats?.[key];
    if (value === null || value === undefined) continue;
    const chip = el('span', 'body-summary-stat');
    chip.append(el('b', '', String(value)), el('span', '', name));
    const before = summary.previous?.[key];
    if (before !== null && before !== undefined) {
      chip.title = `${summary.previous_weeks ? `前 ${summary.previous_weeks} 周（有记录的周）` : '前几周'}平均 ${before}`;
      chip.append(el('small', '', `均 ${before}`));
    }
    row.append(chip);
  }
  return row;
}
function body(summary) {
  const nodes = [];
  if (summary.alerts?.length) {
    const box = el('div', 'body-summary-alert'); box.setAttribute('role', 'alert');
    box.append(el('strong', '', '建议联系医生'), ...summary.alerts.map(text => el('p', '', text)));
    nodes.push(box);
  }
  nodes.push(el('p', 'body-summary-headline', summary.headline), stats(summary));
  for (const part of summary.sections || []) {
    const block = el('div', 'body-summary-section'), list = el('ul');
    list.append(...part.points.map(point => el('li', '', point)));
    block.append(el('h4', '', part.title), list); nodes.push(block);
  }
  return nodes;
}
function contextEditor(section) {
  const details = el('details', 'body-summary-context');
  details.open = view.contextOpen;
  details.addEventListener('toggle', () => { view.contextOpen = details.open; });
  const area = el('textarea', 'input'); area.maxLength = 600; area.rows = 3; area.value = view.data?.context || '';
  area.placeholder = '写给 AI 的背景：长期情况、你的习惯说法等。只用于生成小结。';
  const save = el('button', 'btn text', view.busy === 'context' ? '保存中…' : '保存说明');
  save.type = 'button'; save.disabled = Boolean(view.busy);
  save.addEventListener('click', () => saveContext(section, area.value));
  details.append(el('summary', '', '背景说明'), area, save);
  return details;
}
function draw(section) {
  const data = view.data, summary = shown(data);
  const head = el('div', 'body-summary-head'), title = el('h3', '', '大小便周小结');
  const meta = el('span', 'body-summary-meta', summary ?
    `${short(summary.week_start)}–${short(summary.week_end)}${summary.complete ? '' : ' · 本周未完'}` : '');
  head.append(title, meta);
  const parts = [head];
  if (view.loading && !data) parts.push(el('p', 'body-summary-note', '正在读取…'));
  else if (data && !data.configured) parts.push(el('p', 'body-summary-note', '服务器还没有配置 AI，暂时不能生成小结。'));
  else if (view.busy === 'last' || view.busy === 'current') parts.push(el('p', 'body-summary-note', '正在整理记录，大约需要半分钟…'));
  else if (summary?.empty) parts.push(el('p', 'body-summary-note', '这一周没有相关记录。'));
  else if (summary) parts.push(...body(summary));
  if (view.error) parts.push(el('p', 'body-summary-error', view.error));
  if (data?.configured) {
    const actions = el('div', 'body-summary-actions');
    const refresh = el('button', 'btn text', '更新到今天'); refresh.type = 'button'; refresh.disabled = Boolean(view.busy || view.loading);
    refresh.addEventListener('click', () => generate(section, 'current', true));
    const stamp = summary?.generated_at ? el('span', 'body-summary-meta', `生成于 ${time(summary.generated_at)}`) : null;
    actions.append(...[stamp, refresh].filter(Boolean));
    parts.push(actions, contextEditor(section));
  }
  parts.push(el('p', 'body-summary-foot', '只整理你写下的记录，不是诊断。'));
  section.replaceChildren(...parts);
}
