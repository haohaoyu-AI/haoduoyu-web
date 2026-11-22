import {loadReviewAi, reviewAiClick, reviewAiInput, reviewAiView, watchReviewAi} from './review-ai-controller.mjs';
import {currentPrompts} from './core/review-rule-scopes.mjs';
import {diagnosisPromptText} from '../shared/article-diagnosis.mjs';
import {normalizeReviewData} from './core/review-data.mjs';
import {renderContentReviewContent, REVIEW_VIEWS, REVIEW_SECTIONS, REVIEW_SECTION_GROUPS} from './pages/content-review.mjs';
import {articleDensity, reviewSortKeys} from './pages/review-article-list.mjs';
import {day,shiftDay} from './core/review-data.mjs';
import {canAccessReviewArchive} from './core/review-archive-state.mjs';

const resources = ['articles','snapshots','reports','playbooks','benchmark-accounts','benchmark-articles','notes','account-health','prompts/current'];
let data = normalizeReviewData(), sequence = 0, registered = false, identity = '', pageContext;
let vm = {
  account:'V字',view:'overview',secondary:'cockpit',week:'this',date:'',start:'',end:'',periods:[],filters:{},
  diagnoses:{},
  article:'',version:'',compare:'',loading:true,error:'',
};
const root = () => typeof document === 'undefined' ? null : document.querySelector('#content-review');
function staleRead(message = '复盘资料在读取时发生变化，请重新读取。') {
  return Object.assign(new Error(message),{code:'READ_REVISION_CHANGED'});
}

/** Pages fetched together once a collection has more than one page; each answer still pins the first page's revision. */
export const REVIEW_PAGE_AHEAD = 3;
/** Read-only, offset pagination. An invalid page is an error, never a partial success. */
export async function readReviewCollection(read, resource, selectedAccount, current = () => true) {
  if (!resources.includes(resource)) throw new Error('未知的复盘资料类型。');
  const items = [], seen = new Set(), foreignIds = new Set();
  const accountQuery = resource === 'playbooks' ? '' : `account=${encodeURIComponent(selectedAccount)}&`;
  let revision;
  const fetchPage = offset => read(`/review/${resource}?${accountQuery}offset=${offset}` +
    (revision === undefined ? '' : `&read_revision=${encodeURIComponent(revision)}`));
  const accept = page => {
    if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean' || page.items.length > 100 ||
      (page.has_more && page.items.length !== 100)) throw new Error('复盘分页资料不完整，请重新读取。');
    if (page.read_revision !== undefined) {
      if (revision !== undefined && revision !== page.read_revision) throw staleRead();
      revision = page.read_revision;
    }
    for (const row of page.items) {
      if (!row || typeof row !== 'object' || row.id === null || row.id === undefined || seen.has(String(row.id)))
        throw staleRead('复盘资料存在重复或无效记录，请重新读取。');
      seen.add(String(row.id));
      if (!['snapshots','playbooks','prompts/current'].includes(resource) && row.account !== selectedAccount) {
        foreignIds.add(String(row.id)); continue;
      }
      items.push(row);
    }
    return page.has_more;
  };
  const first = await fetchPage(0);
  if (!current()) return null;
  // Later pages are requested a few at a time instead of one after another; they are accepted strictly in order
  // and anything after the last page is ignored, so the result is the same as reading page by page.
  for (let offset = 100, more = accept(first); more; offset += 100 * REVIEW_PAGE_AHEAD) {
    const pages = await Promise.all(Array.from({length:REVIEW_PAGE_AHEAD},(_,index) => fetchPage(offset + index * 100)));
    if (!current()) return null;
    for (const page of pages) if (more) more = accept(page);
  }
  return {items,read_revision:revision,foreignIds};
}
export async function readContentReviewData(read, selectedAccount, current = () => true) {
  const results = await Promise.all(resources.map(name => readReviewCollection(read,name,selectedAccount,current)));
  if (!current() || results.some(result => result === null)) return null;
  const revisions = results.map(result => result.read_revision).filter(value => value !== undefined);
  if (revisions.length && revisions.some(value => value !== revisions[0])) throw staleRead();
  const result = normalizeReviewData(Object.fromEntries(resources.map((key,index) => [key,results[index].items])));
  const articles = new Set(result.articles.map(row => String(row.id)));
  const foreignArticles = results[0].foreignIds;
  if (result.snapshots.some(row => !articles.has(String(row.article_id)) && !foreignArticles.has(String(row.article_id))))
    throw staleRead('快照对应的文章不完整，请重新读取。');
  result.snapshots = result.snapshots.filter(row => articles.has(String(row.article_id)));
  result.playbooks.sort((a,b) => String(b.published_on || '').localeCompare(String(a.published_on || '')) || 
    String(b.version).localeCompare(String(a.version),undefined,{numeric:true}));
  result.reports.sort((a,b) => String(b.period_end).localeCompare(String(a.period_end)) || String(b.id).localeCompare(String(a.id)));
  result.loadedAt = new Date().toISOString();
  return result;
}
export async function readContentReviewDataWithRetry(read, selectedAccount, current = () => true) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await readContentReviewData(read,selectedAccount,current); }
    catch (error) {
      if (!current()) return null;
      if (error.code !== 'READ_REVISION_CHANGED' || attempt) throw error;
    }
  }
}
export function reviewRoute(href,defaultAccount = vm.account) {
  const p = new URL(href).searchParams, legacy = p.get('review_view');
  const requested = p.get('tab') || (legacy === 'playbooks' ? 'playbook' : legacy);
  const view = REVIEW_VIEWS.some(([id]) => id === requested) ? requested : 'overview';
  const section = p.get('review_section');
  const benchmark = p.get('review_benchmark') || '';
  const listed = REVIEW_SECTIONS.some(([id]) => id === section) ? section : '';
  const secondary = benchmark ? 'library' : listed || (section === 'trends' ? 'cockpit' : '') ||
    (section === 'review' || section === 'playbook' || view === 'playbook' ? 'rules' :
    view === 'articles' ? 'articles' : 'cockpit');
  const trendRange = p.get('review_trend_range');
  const trends = {range:['7d','30d','custom'].includes(trendRange) ? trendRange : '30d',
    from:p.get('review_trend_from') || '',to:p.get('review_trend_to') || ''};
  return {account:p.get('account')?.trim() || defaultAccount,view,secondary,trends,
    week:p.get('review_week') === 'last' ? 'last' : 'this',article:benchmark ? '' : p.get('review_article') || '',
    benchmark,version:p.get('review_version') || ''};
}
const route = () => reviewRoute(location.href);
function writeRoute(values) {
  const url = new URL(location.href);
  for (const [key,value] of Object.entries(values)) {
    const name = key === 'view' ? 'tab' : `review_${key}`;
    if (value) url.searchParams.set(name,value); else url.searchParams.delete(name);
  }
  for (const key of ['review_view','review_date','review_period','review_compare']) url.searchParams.delete(key);
  if (!url.searchParams.has('tab')) url.searchParams.set('tab',vm.view);
  history.replaceState({},'',url);
}
function syncViewFromRoute() { vm = {...vm,...route(),loading:false,error:''}; }
function focusBenchmark(id) {
  if (!id) return;
  const node = document.getElementById(`review-benchmark-${encodeURIComponent(id)}`);
  if (!node || !root()?.contains(node)) return;
  node.scrollIntoView({block:'start'});
  node.focus({preventScroll:true});
}
let searchTimer;
let returnFocusId = '', returnScroll = 0;
function syncReviewFullscreen() {
  const node = root(), button = node?.querySelector('[data-review-action="toggle-fullscreen"]');
  if (!button) return;
  const active = node.classList.contains('review-list-fullscreen');
  button.textContent = active ? '退出全屏' : '全屏展示';
  button.setAttribute('aria-pressed', String(active));
}
async function toggleReviewFullscreen() {
  const node = root();
  if (!node) return;
  if (node.classList.contains('review-list-fullscreen')) {
    node.classList.remove('review-list-fullscreen');
    if (document.fullscreenElement === node) await document.exitFullscreen().catch(() => {});
  } else {
    node.classList.add('review-list-fullscreen');
    if (node.requestFullscreen) await node.requestFullscreen().catch(() => {});
  }
  syncReviewFullscreen();
}
const aiContext = () => ({account:vm.account, playbooks:() => data.playbooks, reload:() => void loadContentReview(pageContext),
  applyPlaybook:saved => { data = {...data, playbooks:data.playbooks.map(item => String(item.id) === String(saved.id) ? {...item, ...saved} : item)}; }});
export function paintContentReviewPage() {
  const node = root(); if (!node) return;
  vm.ai = reviewAiView();
  // Keep an open one-off selector and its focus across the repaint an AI update triggers.
  const focused = document.activeElement;
  const aiSelection = focused?.dataset?.aiOnce;
  const search = focused?.matches('[data-review-search]') ? focused : null;
  const open = new Set([...node.querySelectorAll('[data-review-keep-open][open]')].map(el => el.dataset.reviewKeepOpen));
  node.innerHTML = renderContentReviewContent(data,vm);
  for (const details of node.querySelectorAll('[data-review-keep-open]')) {
    details.open = open.has(details.dataset.reviewKeepOpen);
  }
  if (aiSelection) node.querySelector(`[data-ai-once="${aiSelection}"]`)?.focus({preventScroll:true});
  const nextSearch = search && node.querySelector('[data-review-search]');
  if (nextSearch) {
    nextSearch.value = search.value;
    nextSearch.focus({preventScroll:true});
    if (search.selectionStart !== null) nextSearch.setSelectionRange(search.selectionStart,search.selectionEnd,search.selectionDirection);
  }
  syncReviewFullscreen();
  const dialog = node.querySelector('[role="dialog"]');
  for (const child of node.children) if (child !== dialog?.parentElement && dialog) child.inert = true;
  if (dialog) dialog.querySelector('.review-drawer-close')?.focus({preventScroll:true});
}
export async function loadContentReview(context) {
  registerEvents(); pageContext = context;
  const [{apiNetwork},{state,runtime}] = await Promise.all([import('./core/api.mjs'),import('./core/state.mjs')]);
  const requested = route(), currentIdentity = `${runtime.sessionEpoch}:${state.me?.id || ''}:${requested.account}`;
  if (identity !== currentIdentity) {
    clearTimeout(searchTimer);
    data = normalizeReviewData(); vm.filters = savedArticleView(); vm.tags = null; vm.diagnoses = {}; identity = currentIdentity;
  }
  vm = {...vm,...requested,archiveAllowed:canAccessReviewArchive(state.me,requested.account),loading:true,error:''}; paintContentReviewPage();
  const ticket = ++sequence, epoch = runtime.sessionEpoch;
  const current = () => ticket === sequence && epoch === runtime.sessionEpoch && state.page === 'review' && route().account === requested.account && 
    Boolean(root());
  const read = path => apiNetwork(path,context ? {context} : {});
  try {
    const result = await readContentReviewDataWithRetry(read,requested.account,current);
    if (!current() || !result) return;
    data = result; syncViewFromRoute(); paintContentReviewPage(); focusBenchmark(vm.benchmark);
    void loadReviewAi(requested.account, {force:true});
    void loadArticleTags(read, requested.account, current);
    if (vm.article) void loadStoredDiagnosis(vm.article);
  } catch (error) {
    if (!current() || error.name === 'AbortError') return;
    vm.loading = false; vm.error = error.message || '读取失败，请稍后重试。'; paintContentReviewPage();
  }
}
// The total table stays available when pattern tags cannot be read.
async function loadArticleTags(read, account, current) {
  try {
    const tags = await read('/review/ai/tags?account=' + encodeURIComponent(account));
    if (!current()) return;
    vm.tags = tags && Array.isArray(tags.dimensions) ? tags : null; paintContentReviewPage();
  } catch { if (current()) { vm.tags = null; paintContentReviewPage(); } }
}
function closeArticle() {
  vm.article = ''; writeRoute({article:''}); paintContentReviewPage();
  const node = [...(root()?.querySelectorAll('[data-review-article]') || [])].find(el => el.dataset.reviewArticle === returnFocusId);
  node?.focus({preventScroll:true}); window.scrollTo({top:returnScroll,behavior:'instant'});
}
function changeTrend(target) {
  const key = target.dataset.reviewTrend;
  if (!['range','from','to'].includes(key)) return;
  const today = day(new Date().toISOString());
  vm.trends = {...vm.trends,[key]:target.value};
  if (key === 'range' && vm.trends.range === 'custom') {
    vm.trends.from ||= shiftDay(today,-6); vm.trends.to ||= today;
  }
  // The metric picker is gone; drop its parameter from links saved before the redesign.
  writeRoute({...Object.fromEntries(Object.entries(vm.trends).map(([name,value]) => [`trend_${name}`,value])),trend_metric:''});
  paintContentReviewPage();
  root()?.querySelector(`[data-review-trend="${key}"]`)?.focus({preventScroll:true});
}
export async function copyReviewPrompt(prompts,account,id,clipboard = globalThis.navigator?.clipboard) {
  const prompt = currentPrompts(prompts,account).find(row => String(row.id) === String(id));
  if (!prompt) throw new Error('提示词已更新，请重新读取后复制。');
  if (!clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板，请从页面上的全文手动复制。');
  try { await clipboard.writeText(String(prompt.content_md || '')); }
  catch { throw new Error('复制失败，请允许剪贴板访问，或从页面上的全文手动复制。'); }
}
async function reviewWrite(path, options) {
  const {apiNetwork} = await import('./core/api.mjs');
  return apiNetwork(path, options || {});
}
async function loadStoredDiagnosis(articleId) {
  const current = vm.diagnoses?.[articleId];
  if (!articleId || current?.text || current?.checked || current?.status === 'saving') return;
  vm.diagnoses = {...vm.diagnoses, [articleId]:{status:'checking', checked:false}};
  try {
    const row = await reviewWrite('/review/articles/' + encodeURIComponent(articleId) + '/diagnosis');
    const latest = vm.diagnoses?.[articleId];
    if (latest?.text || latest?.status === 'saving') return;
    const text = typeof row?.result_text === 'string' ? row.result_text : '';
    vm.diagnoses = {...vm.diagnoses, [articleId]:{status:text ? 'saved' : 'ready', text, checked:true}};
  } catch {
    const latest = vm.diagnoses?.[articleId];
    if (latest?.text || latest?.status === 'saving') return;
    vm.diagnoses = {...vm.diagnoses, [articleId]:{status:'ready', text:'', checked:true}};
  }
  if (vm.article === articleId) paintContentReviewPage();
}
async function runArticleDiagnosis(articleId) {
  const current = vm.diagnoses?.[articleId];
  if (!articleId || current?.text || current?.status === 'saving') return;
  vm.diagnoses = {...vm.diagnoses, [articleId]:{status:'saving', text:'', checked:true}};
  paintContentReviewPage();
  try {
    const row = await reviewWrite('/review/articles/' + encodeURIComponent(articleId) + '/diagnosis', {method:'POST', body:{}});
    const text = typeof row?.result_text === 'string' ? row.result_text : '';
    if (!text) throw new Error('没有得到诊断结果。');
    vm.diagnoses = {...vm.diagnoses, [articleId]:{status:'saved', text, checked:true}};
  } catch (error) {
    vm.diagnoses = {...vm.diagnoses, [articleId]:{status:'error', text:'', error:error.message || '诊断失败，请稍后重试。', checked:true}};
  }
  if (vm.article === articleId) paintContentReviewPage();
}
async function copyPromptText(button, text) {
  const status = button.closest('.review-prompt-card')?.querySelector('[data-prompt-copy-status]');
  button.disabled = true;
  if (status) status.textContent = '正在复制…';
  try {
    if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持剪贴板，请从页面上的全文手动复制。');
    await navigator.clipboard.writeText(text);
    if (status?.isConnected) status.textContent = '已复制完整提示词。';
  } catch (error) {
    if (status?.isConnected) status.textContent = error.message || '复制失败，请从页面上的全文手动复制。';
  } finally { if (button.isConnected) button.disabled = false; }
}
async function copyPromptButton(button) {
  const status = button.closest('.review-prompt-card, .review-current-prompt')?.querySelector('[data-prompt-copy-status]');
  button.disabled = true;
  if (status) status.textContent = '正在复制…';
  try {
    await copyReviewPrompt(data.prompts,vm.account,button.dataset.promptId);
    if (status?.isConnected) status.textContent = '已复制完整提示词。';
  } catch (error) {
    if (status?.isConnected) status.textContent = error.message;
  } finally { if (button.isConnected) button.disabled = false; }
}
// Hovering a chart point names the article under the plot; leaving restores the period's best one.
function describeTrendPoint(event,leaving) {
  const point = event.target.closest?.('[data-trend-readout]');
  const target = point?.closest('.review-trend-figure')?.querySelector('[data-trend-readout-target]');
  if (target && root()?.contains(target)) target.textContent = leaving ? target.dataset.default : point.dataset.trendReadout;
}
function onReviewClick(event) {
  const node = root();
  const benchmarkLink = event.target.closest?.('a[data-review-benchmark]');
  if (benchmarkLink && node?.contains(benchmarkLink)) {
    event.preventDefault();
    vm.article = ''; vm.secondary = 'library'; vm.benchmark = benchmarkLink.dataset.reviewBenchmark;
    writeRoute({section:'library',article:'',benchmark:vm.benchmark}); paintContentReviewPage();
    focusBenchmark(vm.benchmark); return;
  }
  if (event.target.closest?.('a')) return;
  const target = event.target.closest?.('button,[data-review-row]');
  if (!target || !node?.contains(target)) return;
  if (target.dataset.reviewAction === 'toggle-fullscreen') { void toggleReviewFullscreen(); return; }
  if (target.dataset.reviewAction === 'show-health') {
    vm.view = 'overview'; vm.secondary = 'attention'; vm.article = '';
    writeRoute({view:'overview',section:'attention',article:''}); paintContentReviewPage();
    const history = node.querySelector('#review-health-history');
    history?.scrollIntoView({behavior:'smooth',block:'start'});
    history?.focus({preventScroll:true});
    return;
  }
  if (target.dataset.reviewAction === 'refresh') { void loadContentReview(pageContext); return; }
  if (vm.loading || vm.error) return;
  if (target.dataset.reviewView) { chooseArticleView(target.dataset.reviewView); return; }
  if (changeArticleList(target)) return;
  if (target.dataset.aiAction) { reviewAiClick(target, aiContext()); return; }
  if (target.dataset.reviewAction === 'toggle-prompt') {
    const source = target.closest('.review-prompt-card')?.querySelector('.review-prompt-source'), folded = source?.classList.toggle('is-folded');
    target.textContent = folded ? '展开全文' : '收起'; target.setAttribute('aria-expanded', String(!folded)); return;
  }
  if (target.dataset.reviewAction === 'copy-prompt') { void copyPromptButton(target); return; }
  if (target.dataset.reviewAction === 'copy-diagnosis-prompt') { void copyPromptText(target, diagnosisPromptText(data.prompts, vm.account)); return; }
  if (target.dataset.reviewAction === 'copy-prompt-block') {
    void copyPromptText(target, target.closest('.review-prompt-card')?.querySelector('pre')?.textContent || ''); return;
  }
  if (target.dataset.reviewAction === 'diagnose-article') { void runArticleDiagnosis(target.dataset.articleId); return; }
  if (target.dataset.reviewSecondary) {
    vm.secondary = target.dataset.reviewSecondary; vm.benchmark = ''; writeRoute({section:vm.secondary,benchmark:''}); paintContentReviewPage();
    root()?.querySelector(`#review-secondary-${vm.secondary}`)?.focus({preventScroll:true}); return;
  }
  if (target.dataset.reviewWeek) { vm.week = target.dataset.reviewWeek; writeRoute({week:vm.week}); paintContentReviewPage();
    root()?.querySelector(`[data-review-week="${vm.week}"]`)?.focus({preventScroll:true}); return; }
  if (target.dataset.reviewAction === 'close-article') { closeArticle(); return; }
  const article = target.dataset.reviewArticle || target.dataset.reviewRow;
  if (article) { returnFocusId = article; returnScroll = window.scrollY; vm.article = article; vm.benchmark = ''; writeRoute({article,benchmark:''});
    paintContentReviewPage(); void loadStoredDiagnosis(article); }
}
function onReviewKeydown(event) {
  const node = root(); if (!node?.contains(event.target)) return;
  const dialog = node.querySelector('[role="dialog"]');
  if (dialog) {
    if (event.key === 'Escape') { event.preventDefault(); closeArticle(); return; }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],summary,[tabindex="0"]')].filter(el => !el.hidden &&
        el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  if (event.key === 'Escape' && node.classList.contains('review-list-fullscreen')) {
    event.preventDefault(); void toggleReviewFullscreen(); return;
  }
  if (event.target.matches('[data-review-secondary]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    const ids = REVIEW_SECTION_GROUPS.flatMap(([, , groupIds]) => groupIds);
    const current = vm.secondary === 'review' ? 'rules' : vm.secondary, index = Math.max(0, ids.indexOf(current));
    vm.secondary = event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : ids[(index + (event.key === 'ArrowRight' ? 1 : ids.length-1)) %
      ids.length];
    vm.benchmark = ''; writeRoute({section:vm.secondary,benchmark:''}); paintContentReviewPage();
      root()?.querySelector(`#review-secondary-${vm.secondary}`)?.focus({preventScroll:true}); return;
  }
  if (event.target.matches('[data-review-view]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    const enabled = [...node.querySelectorAll('[data-review-view]:not([disabled])')];
    const index = enabled.indexOf(event.target), step = event.key === 'ArrowRight' ? 1 : -1;
    const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(index + step + enabled.length) % enabled.length];
    if (next) chooseArticleView(next.dataset.reviewView);
  }
}
function registerEvents() {
  if (registered || typeof document === 'undefined') return;
  registered = true;
  watchReviewAi(() => { if (root() && !vm.loading) paintContentReviewPage(); });
  document.addEventListener('fullscreenchange', () => {
    const node = root();
    if (node?.classList.contains('review-list-fullscreen') && !document.fullscreenElement && node.dataset.nativeFullscreen === 'true') {
      node.classList.remove('review-list-fullscreen'); node.dataset.nativeFullscreen = '';
    } else if (node && document.fullscreenElement === node) node.dataset.nativeFullscreen = 'true';
    syncReviewFullscreen();
  });
  document.addEventListener('input',onArticleSearch);
  document.addEventListener('compositionend',onArticleSearch);
  document.addEventListener('click', onReviewClick);
  document.addEventListener('mouseover',event => describeTrendPoint(event,false));
  document.addEventListener('mouseout',event => describeTrendPoint(event,true));
  document.addEventListener('change',event => {
    const target = event.target;
    const node = root();
    if (!node?.contains(target) || vm.loading || vm.error) return;
    if (reviewAiInput(target)) return;
    if (target.dataset.reviewTrend) { changeTrend(target); return; }
    if (!target.dataset.reviewFilter) return;
    const key = target.dataset.reviewFilter;
    vm.filters[key] = target.value;
    paintContentReviewPage();
    const filterRoot = target.closest('.review-trends') ? root()?.querySelector('.review-trends') : root();
    filterRoot?.querySelector(`[data-review-filter="${key}"]`)?.focus({preventScroll:true});
  });
  document.addEventListener('keydown', onReviewKeydown);
  window.addEventListener('popstate',() => { if (!root()) return; const next = route(); if (next.account !== vm.account) void loadContentReview(pageContext); 
    else { syncViewFromRoute(); paintContentReviewPage(); focusBenchmark(vm.benchmark); } });
}

const ARTICLE_VIEW_KEY = 'haoduoyu-review-article-view';
const ARTICLE_DENSITY_KEY = 'haoduoyu-review-article-density';
function savedArticleView() {
  try { return {group:localStorage.getItem(ARTICLE_VIEW_KEY) || '',density:articleDensity(localStorage.getItem(ARTICLE_DENSITY_KEY))}; }
  catch { return {}; }
}
function chooseArticleDensity(value) {
  vm.filters.density = articleDensity(value);
  try { localStorage.setItem(ARTICLE_DENSITY_KEY,vm.filters.density); } catch { /* The VM still retains the choice. */ }
  paintContentReviewPage();
  root()?.querySelector(`[data-review-density="${CSS.escape(vm.filters.density)}"]`)?.focus({preventScroll:true});
}
function chooseArticleView(value) {
  vm.filters.group = value;
  try { localStorage.setItem(ARTICLE_VIEW_KEY,value); } catch { /* The VM still retains the choice. */ }
  paintContentReviewPage();
  root()?.querySelector(`[data-review-view="${CSS.escape(value)}"]`)?.focus({preventScroll:true});
}
function changeArticleList(target) {
  const {reviewSort,reviewPattern,reviewDimension,reviewPatternClear,reviewDensity} = target.dataset;
  if (reviewDensity !== undefined) { chooseArticleDensity(reviewDensity); return true; }
  if (reviewSortKeys.includes(reviewSort)) {
    const current = vm.filters.sort;
    const ascending = current?.key === reviewSort && current.direction === 'descending';
    const group = target.closest('[data-review-keep-open]')?.dataset.reviewKeepOpen;
    vm.filters.sort = {key:reviewSort,direction:ascending ? 'ascending' : 'descending'};
    paintContentReviewPage();
    const container = group ? [...root().querySelectorAll('[data-review-keep-open]')].find(el => el.dataset.reviewKeepOpen === group) : root();
    container?.querySelector(`[data-review-sort="${reviewSort}"]`)?.focus({preventScroll:true});
    return true;
  }
  if (reviewPattern === undefined && reviewPatternClear === undefined) return false;
  vm.filters.pattern = reviewPattern === undefined ? null : {dimension:reviewDimension,name:reviewPattern};
  paintContentReviewPage();
  const selector = vm.filters.pattern ? '[data-review-pattern-clear]' : '[data-review-search]';
  root()?.querySelector(selector)?.focus({preventScroll:true});
  return true;
}
function onArticleSearch(event) {
  const target = event.target;
  if (!target.matches?.('[data-review-search]') || !root()?.contains(target)) return;
  clearTimeout(searchTimer);
  if (event.isComposing) return;
  const query = target.value;
  searchTimer = setTimeout(() => {
    vm.filters.query = query;
    if (!vm.loading && !vm.error) paintContentReviewPage();
  },200);
}
