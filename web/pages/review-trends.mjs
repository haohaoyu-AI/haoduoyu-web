import {e} from '../core/dom.mjs';
import {day, reviewDateTime, shiftDay} from '../core/review-data.mjs';
import {reviewTrends} from '../core/review-trends.mjs';

const RANGES = [['7d','近 7 天'],['30d','近 30 天'],['custom','自定义']];
const KPI_LABELS = {record_count:'发文数',median_reads:'阅读中位数',hit_rate:'爆款率',median_ctr:'点击率中位数'};
const VERDICT_CLASS = {爆:'hit',中:'middle',扑:'flop'};
const known = value => value !== null && value !== undefined && Number.isFinite(value);
const reads = value => !known(value) ? '—' : value >= 10000 ? `${(value / 10000).toFixed(1)} 万`
  : value.toLocaleString('zh-CN',{maximumFractionDigits:1});
const percent = value => known(value) ? `${value.toFixed(1)}%` : '—';
// Axis ticks are round numbers, so they drop the decimal the data labels keep.
const readsTick = value => value >= 10000 ? `${value / 10000} 万` : value.toLocaleString('zh-CN');
const percentTick = value => `${value}%`;
const count = value => known(value) ? value.toLocaleString('zh-CN') : '—';
const options = (values,selected) => values.map(([value,label]) =>
  `<option value="${e(value)}"${value === selected ? ' selected' : ''}>${e(label)}</option>`).join('');

function controls({range,from,to,today}) {
  const dates = range === 'custom' ? `<label>开始日期<input class="input" type="date" data-review-trend="from"
    value="${e(from)}" max="${e(today)}"></label><label>结束日期<input class="input" type="date"
    data-review-trend="to" value="${e(to)}" max="${e(today)}"></label>` : '';
  return `<div class="review-filters review-trend-controls"><label>时间范围<select class="input" data-review-trend="range"
    >${options(RANGES,range)}</select></label>${dates}
    <button class="btn text" type="button" data-review-action="refresh">刷新数据</button></div>`;
}
function change(tile) {
  // With no earlier period at all, one line under the charts says so instead of four tiles.
  if (!known(tile.previous)) return '';
  if (!known(tile.delta)) return '<small class="review-trend-delta">较上期 —</small>';
  const size = Math.abs(tile.delta), flat = size < .05;
  const amount = tile.unit === 'relative' ? `${size.toFixed(1)}%` : tile.unit === 'points' ? `${size.toFixed(1)} 个百分点` : `${count(size)} 篇`;
  // Publishing more or fewer articles is not good or bad by itself, so only quality tiles take a tone.
  const tone = flat || tile.unit === 'count' ? '' : tile.delta > 0 ? ' up' : ' down';
  return `<small class="review-trend-delta${tone}">较上期 ${flat ? '持平' : `${tile.delta > 0 ? '↑' : '↓'} ${amount}`}</small>`;
}
function tiles(result) {
  return `<div class="review-trend-stats">${result.kpis.map(tile => {
    const value = tile.key === 'record_count' ? count(tile.value) : tile.key === 'median_reads' ? reads(tile.value) : percent(tile.value);
    const basis = tile.key === 'record_count' ? '篇' : tile.key === 'hit_rate'
      ? `爆 ${count(tile.hits)} / 可判定 ${tile.sample} 篇` : `${tile.sample} 篇有数据`;
    return `<article class="review-trend-stat"><span>${KPI_LABELS[tile.key]}</span>
      <strong>${e(value)}</strong><small>${e(basis)}</small>${change(tile)}</article>`;
  }).join('')}</div>`;
}
/** Reads span 100 to 100,000+, so the reads plot is logarithmic; rates stay linear from zero. */
function scale(values,kind,top,bottom) {
  const height = bottom - top;
  if (kind === 'log') {
    const positive = values.filter(value => value > 0);
    const floor = Math.floor(Math.log10(positive.length ? Math.min(...positive) : 1));
    // Start on a round power of ten, but stop just above the largest value instead of a decade later.
    const low = floor,high = Math.max(low + 1,Math.log10(Math.max(1,...values)) + .12);
    return {y:value => bottom - (Math.log10(Math.max(value,10 ** low)) - low) / (high - low) * height,
      ticks:Array.from({length:Math.floor(high) - low + 1},(_,index) => 10 ** (low + index))};
  }
  const max = Math.max(5,Math.ceil(Math.max(...values) / 5) * 5);
  return {y:value => bottom - value / max * height,ticks:[0,max / 2,max]};
}
function dateLabels(series) {
  const plotted = series.filter(day => day.position !== null),step = Math.ceil(plotted.length / 6);
  // Anchor on the latest day so "today" is always labelled.
  return plotted.filter((_,index) => (plotted.length - 1 - index) % step === 0);
}
function readout(point) {
  if (!point) return '';
  const when = point.timed ? reviewDateTime(point.published_at) : point.date;
  return `${when}《${point.title || '未命名'}》阅读 ${reads(point.reads)} · 点击率 ${percent(point.ctr)}` +
    `${point.verdict ? ` · ${point.verdict}` : ''}${point.provisional ? ' · 不满 24 小时的数据，暂定' : ''}`;
}
function figure(result,{key,rolling,kind,title,hint,format,tick,height,threshold,daily = true}) {
  const plotted = result.series.filter(day => day.position !== null);
  const points = result.points.filter(point => point[key] !== null), curve = plotted.filter(day => day[rolling] !== null);
  const head = `<div class="review-trend-figure-head"><h3>${e(title)}</h3><span class="review-note">${e(hint)}</span></div>`;
  if (!points.length && !curve.length) return `<section class="review-trend-figure">${head}
    <p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。缺失值不补零。</p></section>`;
  // Keep SVG units in CSS pixels; percentage x coordinates resize only the plot.
  const top = 16,bottom = height - 30;
  const values = [...points.map(point => point[key]),...curve.map(day => day[rolling]),...(known(threshold) ? [threshold] : [])];
  const {y,ticks} = scale(values,kind,top,bottom),x = position => `${(position * 100).toFixed(2)}%`;
  const grid = ticks.map(mark => `<line class="review-trend-grid" x1="0" x2="100%" y1="${y(mark).toFixed(2)}" y2="${y(mark).toFixed(2)}"/>
    <text x="-8" y="${(y(mark) + 4).toFixed(2)}" text-anchor="end">${e(tick(mark))}</text>`).join('');
  const days = dateLabels(result.series).map(day =>
    `<text x="${x(day.position)}" y="${height - 8}" text-anchor="middle">${e(day.date.slice(5))}</text>`).join('');
  const hitLine = known(threshold) ? `<line class="review-trend-threshold" x1="0" x2="100%" y1="${y(threshold).toFixed(2)}" ` +
    `y2="${y(threshold).toFixed(2)}"/>` : '';
  // The label is painted last, with a halo, so points near the line cannot cover it.
  const hitLabel = known(threshold) ? `<text class="review-trend-threshold-label" x="100%" y="${(y(threshold) - 6).toFixed(2)}"
    text-anchor="end">爆款线 ${e(format(threshold))}</text>` : '';
  // Draw hits last so the articles that matter are never buried under ordinary ones.
  const order = {爆:2,扑:1},dots = [...points].sort((a,b) => (order[a.verdict] || 0) - (order[b.verdict] || 0)).map(point =>
    `<circle class="review-trend-dot ${VERDICT_CLASS[point.verdict] || 'unjudged'}${point.provisional ? ' provisional' : ''}"
      cx="${x(point.position)}" cy="${y(point[key]).toFixed(2)}" r="${point.verdict === '爆' ? 5.5 : 4.5}"
      data-review-row="${e(point.id)}" data-trend-readout="${e(readout(point))}"><title>${e(readout(point))}</title></circle>`).join('');
  let previous = null,lines = '';
  for (const day of plotted) {
    // A day without enough samples breaks the curve; it is never bridged.
    if (day[rolling] === null) { previous = null; continue; }
    const now = {x:x(day.position),y:y(day[rolling]).toFixed(2)};
    if (previous) lines += `<line class="review-trend-line" x1="${previous.x}" y1="${previous.y}" x2="${now.x}" y2="${now.y}"/>`;
    previous = now;
  }
  const best = [...points].sort((a,b) => b[key] - a[key])[0];
  const resting = best ? `最高：${readout(best)}` : '';
  const latest = curve.at(-1);
  const curveLabel = latest ? `最新近 ${result.rolling.days} 天中位数 ${format(latest[rolling])}` : '样本不足以画出走势线';
  return `<section class="review-trend-figure">${head}<div class="review-trend-chart"><svg height="${height}" role="img"
    aria-label="${e(title)}：${points.length} 篇文章按北京时间发布时间排列，${curveLabel}。${daily ? '逐日数字见下方表格。' : ''}"
    >${grid}${hitLine}${dots}${lines}${hitLabel}${days}</svg></div>
    <p class="review-trend-readout" data-trend-readout-target data-default="${e(resting)}">${e(resting)}</p></section>`;
}
function legend(result, {showLine = true} = {}) {
  const item = (mark,label) => `<li><i class="review-trend-key ${mark}" aria-hidden="true"></i>${e(label)}</li>`;
  return `<ul class="review-trend-legend">${item('hit','爆')}${item('middle','中')}${item('flop','扑')}
    ${result.summary.provisional_count || result.summary.unknown_age_count ? item('provisional','不满 24 小时的数据，暂定') : ''}
    ${showLine ? item('line',`近 ${result.rolling.days} 天中位数`) : ''}</ul>`;
}
function quadrantFigure(result) {
  const points = result.points.filter(point => known(point.reads) && known(point.ctr));
  const head = '<div class="review-trend-figure-head"><h3>本期每篇文章卡在哪</h3>' +
    '<span class="review-note">横轴点击率、纵轴阅读；右上是爆款区，左下说明标题封面没人点</span></div>';
  if (!points.length) return `<section class="review-trend-figure review-quadrant-figure">${head}
    <p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。缺失值不补零。</p></section>`;
  const height = 270, top = 18, bottom = height - 34;
  const hitThreshold = result.thresholds?.hit;
  const ctrKpi = (result.kpis || []).find(tile => tile.key === 'median_ctr');
  const ctrLine = known(ctrKpi?.previous) ? ctrKpi.previous : known(result.summary.median_ctr) ? result.summary.median_ctr : null;
  const ctrLineLabel = known(ctrKpi?.previous) ? `上期点击率中位 ${percent(ctrKpi.previous)}` : known(ctrLine) ? `本期点击率中位 ${percent(ctrLine)}` : '';
  const ctrMax = Math.max(20, Math.ceil((Math.max(...points.map(point => point.ctr), ctrLine ?? 0) + 2) / 5) * 5);
  const readValues = [...points.map(point => point.reads), ...(known(hitThreshold) ? [hitThreshold] : [])];
  const {y, ticks} = scale(readValues, 'log', top, bottom);
  const x = value => `${(Math.min(1, Math.max(0, value / ctrMax)) * 100).toFixed(2)}%`;
  const ctrStep = ctrMax <= 25 ? 5 : 10;
  const ctrTicks = [];
  for (let mark = 0; mark <= ctrMax; mark += ctrStep) ctrTicks.push(mark);
  const grid = ticks.map(mark => `<line class="review-trend-grid" x1="0" x2="100%" y1="${y(mark).toFixed(2)}" y2="${y(mark).toFixed(2)}"/>
    <text x="-8" y="${(y(mark) + 4).toFixed(2)}" text-anchor="end">${e(readsTick(mark))}</text>`).join('');
  const xLabels = ctrTicks.map(mark =>
    `<text x="${x(mark)}" y="${height - 10}" text-anchor="middle">${e(percentTick(mark))}</text>`).join('');
  const hitY = known(hitThreshold) ? y(hitThreshold) : null;
  const ctrPct = known(ctrLine) ? Math.min(100, Math.max(0, ctrLine / ctrMax * 100)) : null;
  const zones = hitY !== null && ctrPct !== null
    ? `<rect class="review-quad-zone is-hot" x="${ctrPct.toFixed(2)}%" y="${top}" width="${(100 - ctrPct).toFixed(2)}%" height="${Math.max(0, hitY - top).toFixed(2)}"/>
       <rect class="review-quad-zone is-cold" x="0%" y="${hitY.toFixed(2)}" width="${ctrPct.toFixed(2)}%" height="${Math.max(0, bottom - hitY).toFixed(2)}"/>`
    : '';
  const hitLine = hitY !== null ? `<line class="review-trend-threshold" x1="0" x2="100%" y1="${hitY.toFixed(2)}" y2="${hitY.toFixed(2)}"/>` : '';
  const hitLabel = hitY !== null ? `<text class="review-trend-threshold-label" x="100%" y="${(hitY - 6).toFixed(2)}" text-anchor="end">爆款线 ${e(reads(hitThreshold))}</text>` : '';
  const vLine = ctrPct !== null ? `<line class="review-quad-ctr-line" x1="${ctrPct.toFixed(2)}%" x2="${ctrPct.toFixed(2)}%" y1="${top}" y2="${bottom}"/>` : '';
  const vLabel = ctrPct !== null ? `<text class="review-quad-ctr-label" x="${Math.min(92, ctrPct + 1.2).toFixed(2)}%" y="${top + 12}">${e(ctrLineLabel)}</text>` : '';
  const quadLabels = hitY !== null && ctrPct !== null
    ? `<text class="review-quad-label is-hot" x="99%" y="${top + 28}" text-anchor="end">标题好 · 推得动</text>
       <text class="review-quad-label is-cold" x="1%" y="${bottom - 8}">标题没人点</text>
       <text class="review-quad-label" x="99%" y="${bottom - 8}" text-anchor="end">有人点 · 没推起来</text>`
    : '';
  const order = {爆:2,扑:1};
  const dots = [...points].sort((a,b) => (order[a.verdict] || 0) - (order[b.verdict] || 0)).map(point =>
    `<circle class="review-trend-dot ${VERDICT_CLASS[point.verdict] || 'unjudged'}${point.provisional ? ' provisional' : ''}"
      cx="${x(point.ctr)}" cy="${y(point.reads).toFixed(2)}" r="${point.verdict === '爆' ? 6.5 : 5}"
      data-review-row="${e(point.id)}" data-trend-readout="${e(readout(point))}"><title>${e(readout(point))}</title></circle>`).join('');
  const best = [...points].sort((a,b) => b.reads - a.reads)[0];
  const resting = best ? `最高：${readout(best)}` : '';
  return `<section class="review-trend-figure review-quadrant-figure">${head}<div class="review-trend-chart"><svg height="${height}" role="img"
    aria-label="本期每篇文章卡在哪：共 ${points.length} 篇有点击率与阅读数据的文章，横轴为点击率，纵轴为 24 小时阅读。"
    >${zones}${grid}${hitLine}${vLine}${quadLabels}${dots}${hitLabel}${vLabel}${xLabels}</svg></div>
    <p class="review-trend-readout" data-trend-readout-target data-default="${e(resting)}">${e(resting)}</p></section>`;
}
function rankedList(result) {
  const items = [...result.points].sort((a,b) => (known(b.reads) ? 1 : 0) - (known(a.reads) ? 1 : 0) || (b.reads ?? -1) - (a.reads ?? -1));
  const head = '<div class="review-trend-figure-head"><h3>本期文章排行</h3>' +
    '<span class="review-note">按 24 小时阅读排序 · 右侧依次为阅读、点击率，点击打开详情</span></div>';
  if (!items.length) return `<section class="review-cockpit-rank">${head}
    <p class="review-trend-empty" role="status">当前范围没有已发布文章。</p></section>`;
  const maxReads = Math.max(10, result.thresholds?.hit || 0, ...items.map(item => item.reads || 0));
  const maxLog = Math.log10(maxReads);
  const rows = items.map((item, index) => {
    const verdictKey = VERDICT_CLASS[item.verdict] || 'unjudged';
    const verdictLabel = item.verdict || '未判';
    const pct = known(item.reads) && item.reads > 0 ? Math.max(4, Math.min(100, Math.round(Math.log10(Math.max(item.reads, 1)) / maxLog * 100))) : 0;
    const when = item.timed ? reviewDateTime(item.published_at).slice(5) : item.date.slice(5);
    return `<li class="review-rank-item" data-review-row="${e(item.id)}">
      <span class="review-rank-num">${index + 1}</span>
      <span class="review-rank-chip ${verdictKey}">${e(verdictLabel)}</span>
      <button type="button" class="review-rank-title" data-review-article="${e(item.id)}" title="${e(item.title || '未命名')}">${e(item.title || '未命名')}</button>
      <svg class="review-rank-bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="review-rank-bar-track" width="100" height="8" rx="4"/><rect class="review-rank-bar-fill ${verdictKey}${item.provisional ? ' provisional' : ''}" width="${pct}" height="8" rx="4"/></svg>
      <span class="review-rank-reads">${e(reads(item.reads))}</span>
      <span class="review-rank-ctr">${e(percent(item.ctr))}</span>
      <span class="review-rank-meta">${e(when)}${item.provisional ? ' · 不满 24h 暂定' : ''}</span>
    </li>`;
  }).join('');
  return `<section class="review-cockpit-rank" aria-label="本期文章排行">${head}<ol class="review-rank-list">${rows}</ol></section>`;
}
function method(result) {
  const s = result.summary,dates = s.snapshot_start ? `${s.snapshot_start}${s.snapshot_end !== s.snapshot_start ? ' 至 ' + s.snapshot_end : ''}` : '未取得';
  const ages = s.min_hours !== null ? `所用快照年龄 ${s.min_hours}–${s.max_hours} 小时。` : '';
  const status = s.unverified_count ? `发文数是有发布时间的记录数；其中 ${s.unverified_count} 篇没有逐条的平台发布核验。` : '';
  return `<details class="review-trend-method"><summary>统计口径与数据时间</summary>
    <p>每篇取已记录年龄 12–72 小时内最接近 24 小时的快照，按北京时间发布日期归日；不拿长尾累计数补缺，缺失不补零。
    中位数只用有数据的文章。走势线是当天及此前共 ${result.rolling.days} 天内发布文章的中位数，不足 ${result.rolling.min_samples} 篇时断开。
    趋势剔除未来、早于发布时间及观察年龄矛盾的快照；列表原始快照异常时，两处所用样本可能不同。</p>
    <p>爆款沿用账号最近 30 篇有效阅读样本：至少 10 篇时高于 80% 分位数判爆；不足 10 篇时暂用阅读 ≥ 1000。
    爆款率分母为可判定篇数：可判定 ${s.coverage.hits} 篇，未判定 ${s.unjudged_count} 篇，其中暂定判定 ${s.provisional_judged_count} 篇。
    “较上期”对比 ${result.previous.start} 至 ${result.previous.end}。${status}</p>
    <p>所用快照日期：${dates}。${ages}资料读取时间：${e(reviewDateTime(result.loaded_at) || '未记录')}（北京时间）。
    已排除：明确未发布 ${result.excluded.unpublished} 篇，发布时间缺失 ${result.excluded.undated} 篇，未来发布时间 ${result.excluded.future} 篇。</p></details>`;
}
function dailyTable(result) {
  const rows = result.series.map(point => `<tr><th scope="row">${e(point.date)}</th><td>${point.record_count}</td>
    <td>${point.hits ?? 0} / ${point.middles} / ${point.flops}</td><td>${e(reads(point.median_reads))}</td>
    <td>${e(percent(point.median_ctr))}</td><td>${e(reads(point.rolling_reads))}</td></tr>`).join('');
  return `<details class="review-trend-details"><summary>逐日数据</summary>
    <div class="review-trend-table-wrap"><table class="review-trend-table">
    <caption class="review-sr-only">趋势逐日数据，缺失为横线</caption>
    <thead><tr><th>日期</th><th>发文</th><th>爆 / 中 / 扑</th><th>阅读中位数</th><th>点击率中位数</th>
    <th>近 ${result.rolling.days} 天阅读中位数</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
export function renderCockpitMethod(data, vm, window) {
  const now = vm.now || new Date().toISOString();
  return method(reviewTrends(data,{account:vm.account,range:'custom',from:window.start,to:window.end,now}));
}
/** Cockpit view: short windows (this/last week) use CTR×Reads quadrant + ranked list; 30d keeps trend lines. */
export function renderCockpitTrends(data,vm,window) {
  const now = vm.now || new Date().toISOString();
  const result = reviewTrends(data,{account:vm.account,range:'custom',from:window.start,to:window.end,now});
  const pending = result.points.filter(point => point.provisional && (known(point.reads) || known(point.ctr))).length;
  const held = (result.excluded?.pending || 0) + (result.excluded?.unmatched || 0);
  const shortWindow = result.days <= 14;
  const note = `按发布日期统计，阅读取发布后约 24 小时的数据。${pending ? `空心点 ${pending} 篇只有发布后不满 24 小时的数据，为暂定。` : ''}` +
    `${held ? `另有 ${held} 篇待发布或未能对上，不进入阅读和点击率。` : ''}` +
    `${result.end === day(now) ? '今天尚未结束。' : ''}${shortWindow ? '缺失不补零；切换到「近30天」可看中位数走势线。' : `缺失不补零；黑线为当天及此前共 7 天中位数，不足 ${result.rolling.min_samples} 篇时断开。`}`;
  if (shortWindow) {
    return `<section class="review-trends review-cockpit-trends" aria-label="本期文章表现分析">${legend(result,{showLine:false})}
      ${quadrantFigure(result)}
      ${rankedList(result)}
      <p class="review-note review-trend-note">${e(note)}</p></section>`;
  }
  return `<section class="review-trends review-cockpit-trends" aria-label="文章阅读与点击率走势">${legend(result)}
    ${figure(result,{key:'reads',rolling:'rolling_reads',kind:'log',title:'阅读走势',height:260,format:reads,tick:readsTick,
      hint:'每个点是一篇文章，线越往上整体越好',threshold:result.thresholds?.hit,daily:false})}
    ${figure(result,{key:'ctr',rolling:'rolling_ctr',kind:'linear',title:'点击率走势',height:190,format:percent,tick:percentTick,
      hint:'标题和封面吸不吸引人',daily:false})}
    <p class="review-note review-trend-note">${e(note)}</p></section>`;
}
export function renderReviewTrends(data,vm) {
  const now = vm.now || new Date().toISOString(),today = day(now),t = vm.trends || {};
  const range = RANGES.some(([id]) => id === t.range) ? t.range : '30d';
  const from = range === 'custom' ? t.from || '' : shiftDay(today,range === '30d' ? -29 : -6);
  const to = range === 'custom' ? t.to || '' : today;
  const filters = controls({range,from,to,today});
  let result;
  try { result = reviewTrends(data,{account:vm.account,range,from,to,now}); }
  catch (error) {
    return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><h2>数据趋势</h2></div>${filters}
      <p role="alert">${e(error.message)}</p></section>`;
  }
  const s = result.summary,pending = s.provisional_count + s.unknown_age_count;
  const note = `按发布日期统计，阅读取发布后约 24 小时的数据。${pending ? `空心点 ${pending} 篇只有发布后不满 24 小时的数据，为暂定。` : ''}` +
    `${result.end === today ? '今天尚未结束。' : ''}${result.kpis.some(tile => known(tile.previous)) ? '' : '上一个同样长的周期还没有数据，暂不对比。'}`;
  return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><div><h2>数据趋势</h2>
    <span class="review-note">${e(vm.account)} · ${result.start} 至 ${result.end}</span></div>${filters}</div>
    ${tiles(result)}${legend(result)}
    ${figure(result,{key:'reads',rolling:'rolling_reads',kind:'log',title:'阅读走势',height:260,format:reads,tick:readsTick,
      hint:'每个点是一篇文章，线越往上整体越好',threshold:result.thresholds?.hit})}
    ${figure(result,{key:'ctr',rolling:'rolling_ctr',kind:'linear',title:'点击率走势',height:190,format:percent,tick:percentTick,
      hint:'标题和封面吸不吸引人'})}
    <p class="review-note review-trend-note">${e(note)}</p>${dailyTable(result)}${method(result)}</section>`;
}
