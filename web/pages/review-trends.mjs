import {e} from '../core/dom.mjs';
import {day, reviewDateTime, shiftDay} from '../core/review-data.mjs';
import {reviewTrends, TREND_METRICS} from '../core/review-trends.mjs';

const percentages = new Set(['hit_rate','average_ctr','average_completion']);
const metricLabel = key => TREND_METRICS.find(([id]) => id === key)[1];
function format(value,key = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (percentages.has(key)) return `${value.toFixed(1)}%`;
  if (key === 'average_seconds') return `${value.toFixed(1)} 秒`;
  return value.toLocaleString('zh-CN',{maximumFractionDigits:1});
}
const options = (values,selected) => values.map(([value,label]) =>
  `<option value="${e(value)}"${value === selected ? ' selected' : ''}>${e(label)}</option>`).join('');
const sample = (summary,key) => `${summary.coverage[key]} / ${summary.record_count} 篇`;
function pointLabel(point,key) {
  return `${point.date}：${format(point[key],key)}；样本 ${sample(point,key)}` +
    (point.provisional_count ? `；未满24h暂定 ${point.provisional_count} 篇` : '') +
    (point.unverified_count ? `；发布状态待核实 ${point.unverified_count} 篇` : '');
}
function chart(series,key) {
  const label = metricLabel(key),values = series.map(point => point[key]).filter(value => value !== null);
  if (!values.length) return '<p class="review-trend-empty" role="status">当前范围没有可绘制的有效数据。缺失值不补零。</p>';
  const width=800,left=64,right=776,top=24,bottom=204,height=bottom-top;
  const max=Math.max(1,...values),x=index => left+(series.length===1 ? (right-left)/2 : index/(series.length-1)*(right-left));
  const y=value => bottom-value/max*height;
  let segment=[],lines='',dots='';
  const flush=()=>{if(segment.length>1)lines+=`<polyline class="review-trend-line" points="${segment.join(' ')}"/>`;segment=[];};
  series.forEach((point,index)=>{
    if(point[key]===null){flush();return;}
    const px=x(index).toFixed(2),py=y(point[key]).toFixed(2),description=pointLabel(point,key);
    const provisional=point.provisional_count || point.unknown_age_count;
    segment.push(`${px},${py}`);
    dots+=`<circle class="review-trend-point${provisional ? ' provisional' : ''}" cx="${px}" cy="${py}" r="4"
      tabindex="0" role="img" aria-label="${e(description)}"><title>${e(description)}</title></circle>`;
  });flush();
  const axes=[0,.5,1].map(fraction=>`<line class="review-trend-grid" x1="${left}" x2="${right}"
    y1="${y(max*fraction)}" y2="${y(max*fraction)}"/><text x="${left-8}" y="${y(max*fraction)+4}"
    text-anchor="end">${e(format(max*fraction,key))}</text>`).join('');
  const labels=[...new Set([0,Math.floor((series.length-1)/2),series.length-1])].map(index=>
    `<text x="${x(index)}" y="234" text-anchor="${index===0?'start':index===series.length-1?'end':'middle'}"
    >${e(series[index].date.slice(5))}</text>`).join('');
  return `<div class="review-trend-chart"><svg viewBox="0 0 ${width} 252" role="img"
    aria-label="${e(label)}，按北京时间发布日期分组。缺失值断线；橙色点为暂定或成熟度待核实。"
    >${axes}${lines}${dots}${labels}</svg></div>`;
}
function controls({range,key,from,to,today,verdict}) {
  const dates=range==='custom'?`<label>开始日期<input class="input" type="date" data-review-trend="from"
    value="${e(from)}" max="${e(today)}"></label><label>结束日期<input class="input" type="date"
    data-review-trend="to" value="${e(to)}" max="${e(today)}"></label>`:'';
  return `<div class="review-filters review-trend-controls"><label>趋势范围<select class="input" data-review-trend="range"
    >${options([['7d','近 7 天'],['30d','近 30 天'],['custom','自定义']],range)}</select></label>${dates}
    <label>图表指标<select class="input" data-review-trend="metric">${options(TREND_METRICS,key)}</select></label>
    <label>表现判定<select class="input" data-review-filter="verdict"
    >${options([['','全部判定'],['爆','爆'],['中','中'],['扑','扑']],verdict)}</select></label>
    <button class="btn text" type="button" data-review-action="refresh">刷新数据</button></div>`;
}
function cards(summary) {
  return `<div class="review-trend-stats">${['average_reads','published_count','hits'].map(key=>{
    const note=key==='published_count'&&summary.unverified_count
      ?`状态待核实 ${summary.unverified_count} 篇 · 明确已发布 ${summary.confirmed_count} 篇`:`有效样本 ${sample(summary,key)}`;
    return `<article class="review-trend-stat"><span>${metricLabel(key)}</span><strong>${e(format(summary[key],key))}</strong>
      <small>${note}</small></article>`;
  }).join('')}</div>`;
}
function method(result) {
  const s=result.summary,dates=s.snapshot_start?`${s.snapshot_start}${s.snapshot_end!==s.snapshot_start?' 至 '+s.snapshot_end:''}`:'未取得';
  const ages=s.min_hours!==null?`所用快照年龄 ${s.min_hours}–${s.max_hours} 小时。`:'';
  return `<details class="review-trend-method"><summary>统计口径与数据时间</summary>
    <p>沿用本站口径：每篇选择已记录年龄 12–72 小时内最接近 24 小时的快照；不拿长尾累计数补缺。
    同一快照分别计算各项有效样本；点击率、完成率和阅读时长是文章样本的算术平均，非平台加权总指标。</p>
    <p>爆款沿用账号最近 30 篇有效阅读样本：至少 10 篇时高于 80% 分位数判爆；不足 10 篇时暂用阅读 ≥ 1000。
    爆款率分母为可判定篇数。可判定 ${s.coverage.hits} 篇，未判定 ${s.unjudged_count} 篇；
    其中暂定判定 ${s.provisional_judged_count} 篇，固定阈值暂定 ${s.fixed_threshold_count} 篇。没有可判定样本时爆款数留空。
    账号和表现判定筛选与文章列表一致，趋势日期单独选择。</p>
    <p>所用快照日期：${dates}。源数据仅提供日期，不能当成精确采集时刻。${ages}
    资料读取时间：${e(reviewDateTime(result.loaded_at)||'未记录')}。
    计算时间：${e(reviewDateTime(result.generated_at))}（北京时间）。</p>
    <p>当前账号全部资料中排除：明确未发布 ${result.excluded.unpublished} 篇，发布时间缺失/无效 ${result.excluded.undated} 篇，
    未来发布时间 ${result.excluded.future} 篇。仅用于展示，不回写任何文章、指标或状态。</p></details>`;
}
function dailyTable(result,key) {
  const extra=!['average_reads','published_count','hits','record_count'].includes(key);
  const cell=(point,metric)=>`<td>${e(format(point[metric],metric))}<small>${sample(point,metric)}</small></td>`;
  const rows=result.series.map(point=>{
    const status=(point.provisional_count?`未满24h暂定 ${point.provisional_count} 篇；`:'')+
      (point.unknown_age_count?`成熟度待核实 ${point.unknown_age_count} 篇；`:'')+
      (point.unverified_count?`发布状态待核实 ${point.unverified_count} 篇`:'');
    return `<tr><th scope="row">${e(point.date)}</th><td>${point.record_count}</td><td>${e(format(point.published_count))}</td>
      ${cell(point,'average_reads')}${cell(point,'hits')}${extra?cell(point,key):''}<td>${status||'—'}</td></tr>`;
  }).join('');
  return `<details class="review-trend-details"><summary>逐日数据与样本分母</summary>
    <div class="review-trend-table-wrap"><table class="review-trend-table">
    <caption class="review-sr-only">趋势逐日数据，缺失为横线，样本为有效篇数除以发布时间记录数</caption>
    <thead><tr><th>日期</th><th>时间记录</th><th>已发布</th><th>平均阅读</th><th>爆款数</th>
    ${extra?`<th>${e(metricLabel(key))}</th>`:''}<th>状态</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
export function renderReviewTrends(data,vm) {
  const now=vm.now || new Date().toISOString(),today=day(now),t=vm.trends || {};
  const range=['7d','30d','custom'].includes(t.range)?t.range:'7d';
  const key=TREND_METRICS.some(([id])=>id===t.metric)?t.metric:'average_reads';
  const from=range==='custom' ? t.from || '' : t.from || shiftDay(today,-6);
  const to=range==='custom' ? t.to || '' : t.to || today,verdict=vm.filters?.verdict || '';
  const filters=controls({range,key,from,to,today,verdict});
  let result;
  try { result=reviewTrends(data,{account:vm.account,range,from,to,verdict,now}); }
  catch(error) {
    return `<section class="review-trends" aria-label="数据趋势"><h2>数据趋势</h2>${filters}
      <p role="alert">${e(error.message)}</p></section>`;
  }
  const s=result.summary;
  const todayNote=result.end===today ? '<p class="review-note">范围含今天，今天尚未结束；本日样本与结果仍可能变化。</p>' : '';
  const warning=s.provisional_count||s.unknown_age_count?`<p class="review-trend-warning">未满24h暂定 ${s.provisional_count} 篇；
    成熟度待核实 ${s.unknown_age_count} 篇。后续快照可能改变均值和判定。</p>`:'';
  return `<section class="review-trends" aria-label="数据趋势"><div class="review-panel-head"><h2>数据趋势</h2>
    <span class="review-note">${e(vm.account)} · ${result.start} 至 ${result.end} · 北京时间</span></div>${filters}${cards(s)}${todayNote}
    <p class="review-note">有发布时间记录 ${s.record_count} 篇。复盘库未提供独立发布状态时，“已发布篇数”留空，
    不能把日期记录视为已发布。明确草稿、排期、失败及未来发布时间不计入。</p>${warning}${chart(result.series,key)}
    <p class="review-note">按发布日期分组，非每日新增阅读。平均阅读 = 有效阅读之和 ÷ 有效阅读样本数；
    真实 0 保留，缺失留空并断线。橙色点表示暂定或成熟度待核实。</p>${method(result)}${dailyTable(result,key)}</section>`;
}
