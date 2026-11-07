import {normalizeReviewData} from './core/review-data.mjs';
import {renderContentReviewContent, REVIEW_VIEWS, REVIEW_SECTIONS} from './pages/content-review.mjs';
import {storage} from './core/storage.mjs';

const columnStorageKey = 'haoduoyu.review.columns.v1';
export const REVIEW_METRIC_COLUMNS = Object.freeze(['reads','impressions','fan_impressions','fan_reads','ctr','avg_read_seconds','completion_rate']);
export function readReviewColumnPreference(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return ['reads'];
    const selected = REVIEW_METRIC_COLUMNS.filter(key => parsed.includes(key));
    return parsed.length && !selected.length ? ['reads'] : selected;
  } catch { return ['reads']; }
}

const resources = ['articles','snapshots','reports','playbooks','benchmark-accounts','benchmark-articles','notes','account-health'];
let data = normalizeReviewData(), sequence = 0, registered = false, identity = '', pageContext;
let vm = {account:'V字',view:'overview',secondary:'benchmarks',week:'this',date:'',start:'',end:'',periods:[],filters:{},metricColumns:readReviewColumnPreference(storage.get(columnStorageKey)),metricPickerOpen:false,article:'',version:'',compare:'',loading:true,error:''};
const root = () => typeof document === 'undefined' ? null : document.querySelector('#content-review');
function staleRead(message = '复盘资料在读取时发生变化，请重新读取。') {
  return Object.assign(new Error(message),{code:'READ_REVISION_CHANGED'});
}

/** Read-only, offset pagination. An invalid page is an error, never a partial success. */
export async function readReviewCollection(read, resource, selectedAccount, current = () => true) {
  if (!resources.includes(resource)) throw new Error('未知的复盘资料类型。');
  const items = [], seen = new Set(), foreignIds = new Set();
  let revision;
  for (let offset = 0; ; offset += 100) {
    const page = await read(`/review/${resource}?account=${encodeURIComponent(selectedAccount)}&offset=${offset}${revision === undefined ? '' : `&read_revision=${encodeURIComponent(revision)}`}`);
    if (!current()) return null;
    if (!Array.isArray(page?.items) || typeof page.has_more !== 'boolean' || page.items.length > 100 ||
      (page.has_more && page.items.length !== 100)) throw new Error('复盘分页资料不完整，请重新读取。');
    if (page.read_revision !== undefined) {
      if (revision !== undefined && revision !== page.read_revision) throw staleRead();
      revision = page.read_revision;
    }
    for (const row of page.items) {
      if (!row || typeof row !== 'object' || row.id === null || row.id === undefined || seen.has(String(row.id))) throw staleRead('复盘资料存在重复或无效记录，请重新读取。');
      seen.add(String(row.id));
      if (resource !== 'snapshots' && row.account !== selectedAccount) { foreignIds.add(String(row.id)); continue; }
      items.push(row);
    }
    if (!page.has_more) return {items,read_revision:revision,foreignIds};
  }
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
  result.playbooks.sort((a,b) => String(b.published_on || '').localeCompare(String(a.published_on || '')) || String(b.version).localeCompare(String(a.version),undefined,{numeric:true}));
  result.reports.sort((a,b) => String(b.period_end).localeCompare(String(a.period_end)) || String(b.id).localeCompare(String(a.id)));
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
  const secondary = benchmark ? 'benchmarks' : REVIEW_SECTIONS.some(([id]) => id === section) ? section :
    ['notes','playbook'].includes(section) || view === 'playbook' ? 'review' : 'benchmarks';
  return {account:p.get('account')?.trim() || defaultAccount,view,secondary,week:p.get('review_week') === 'last' ? 'last' : 'this',article:benchmark ? '' : p.get('review_article') || '',benchmark,version:p.get('review_version') || ''};
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
function positionReviewColumnsPicker() {
  const picker = root()?.querySelector('[data-review-columns-picker]');
  if (!picker?.open) return;
  const trigger = picker.querySelector('[data-review-columns-trigger]');
  const menu = picker.querySelector('.review-columns-menu');
  if (!trigger || !menu) return;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  let viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
  const nav = document.querySelector('.mobile-nav');
  if (nav && nav.getClientRects().length && getComputedStyle(nav).visibility !== 'hidden') {
    const rect = nav.getBoundingClientRect();
    if (rect.bottom > viewportTop && rect.top < viewportBottom) viewportBottom = Math.min(viewportBottom,rect.top);
  }
  const rect = trigger.getBoundingClientRect();
  const gap = 8;
  const above = Math.max(0,rect.top - viewportTop - gap);
  const below = Math.max(0,viewportBottom - rect.bottom - gap);
  const placeUp = menu.scrollHeight + 2 > below && above > below;
  picker.dataset.reviewColumnsPlacement = placeUp ? 'up' : 'down';
  menu.style.setProperty('--review-columns-max-height',`${Math.floor(placeUp ? above : below)}px`);
}
let columnPositionFrame = 0;
function scheduleReviewColumnsPosition() {
  if (columnPositionFrame || !root()?.querySelector('[data-review-columns-picker][open]')) return;
  columnPositionFrame = requestAnimationFrame(() => { columnPositionFrame = 0; positionReviewColumnsPicker(); });
}
let returnFocusId = '', returnScroll = 0;
function syncReviewFullscreen() {
  const node = root(), button = node?.querySelector('[data-review-action="toggle-fullscreen"]');
  if (!button) return;
  const active = node.classList.contains('review-list-fullscreen');
  button.textContent = active ? '退出全屏' : '全屏显示';
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
export function paintContentReviewPage() {
  const node = root(); if (!node) return;
  node.innerHTML = renderContentReviewContent(data,vm);
  syncReviewFullscreen();
  const dialog = node.querySelector('[role="dialog"]');
  for (const child of node.children) if (child !== dialog?.parentElement && dialog) child.inert = true;
  if (dialog) dialog.querySelector('.review-drawer-close')?.focus({preventScroll:true});
  if (vm.metricPickerOpen) positionReviewColumnsPicker();
}
export async function loadContentReview(context) {
  registerEvents(); pageContext = context;
  const [{apiNetwork},{state,runtime}] = await Promise.all([import('./core/api.mjs'),import('./core/state.mjs')]);
  const requested = route(), currentIdentity = `${runtime.sessionEpoch}:${state.me?.id || ''}:${requested.account}`;
  if (identity !== currentIdentity) { data = normalizeReviewData(); vm.filters = {}; identity = currentIdentity; }
  vm = {...vm,...requested,loading:true,error:''}; paintContentReviewPage();
  const ticket = ++sequence, epoch = runtime.sessionEpoch;
  const current = () => ticket === sequence && epoch === runtime.sessionEpoch && state.page === 'review' && route().account === requested.account && Boolean(root());
  const read = path => apiNetwork(path,context ? {context} : {});
  try {
    const result = await readContentReviewDataWithRetry(read,requested.account,current);
    if (!current() || !result) return;
    data = result; syncViewFromRoute(); paintContentReviewPage(); focusBenchmark(vm.benchmark);
  } catch (error) {
    if (!current() || error.name === 'AbortError') return;
    vm.loading = false; vm.error = error.message || '读取失败，请稍后重试。'; paintContentReviewPage();
  }
}
function closeArticle() {
  vm.article = ''; writeRoute({article:''}); paintContentReviewPage();
  const node = [...(root()?.querySelectorAll('[data-review-article]') || [])].find(el => el.dataset.reviewArticle === returnFocusId);
  node?.focus({preventScroll:true}); window.scrollTo({top:returnScroll,behavior:'instant'});
}
function selectTab(view,focus = false) {
  vm.view = view; vm.article = ''; vm.benchmark = ''; writeRoute({view,article:'',benchmark:''}); paintContentReviewPage();
  if (focus) root()?.querySelector(`#review-tab-${view}`)?.focus({preventScroll:true});
}
function registerEvents() {
  if (registered || typeof document === 'undefined') return;
  registered = true;
  document.addEventListener('fullscreenchange', () => {
    const node = root();
    if (node?.classList.contains('review-list-fullscreen') && !document.fullscreenElement && node.dataset.nativeFullscreen === 'true') {
      node.classList.remove('review-list-fullscreen'); node.dataset.nativeFullscreen = '';
    } else if (node && document.fullscreenElement === node) node.dataset.nativeFullscreen = 'true';
    syncReviewFullscreen();
  });
  document.addEventListener('toggle',event => {
    const picker = event.target;
    if (picker.matches?.('[data-review-columns-picker]') && root()?.contains(picker)) {
      vm.metricPickerOpen = picker.open;
      if (picker.open) positionReviewColumnsPicker();
    }
  },true);
  window.addEventListener('resize',scheduleReviewColumnsPosition,{passive:true});
  document.addEventListener('scroll',scheduleReviewColumnsPosition,{capture:true,passive:true});
  window.visualViewport?.addEventListener('resize',scheduleReviewColumnsPosition,{passive:true});
  window.visualViewport?.addEventListener('scroll',scheduleReviewColumnsPosition,{passive:true});
  document.addEventListener('click',event => {
    const node = root();
    const picker = node?.querySelector('[data-review-columns-picker]');
    if (picker?.open && !picker.contains(event.target)) { picker.open = false; vm.metricPickerOpen = false; }
    const benchmarkLink = event.target.closest?.('a[data-review-benchmark]');
    if (benchmarkLink && node?.contains(benchmarkLink)) {
      event.preventDefault();
      vm.article = ''; vm.secondary = 'benchmarks'; vm.benchmark = benchmarkLink.dataset.reviewBenchmark;
      writeRoute({section:'benchmarks',article:'',benchmark:vm.benchmark}); paintContentReviewPage();
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
    if (target.dataset.reviewSecondary) {
      vm.secondary = target.dataset.reviewSecondary; vm.benchmark = ''; writeRoute({section:vm.secondary,benchmark:''}); paintContentReviewPage();
      root()?.querySelector(`#review-secondary-${vm.secondary}`)?.focus({preventScroll:true}); return;
    }
    if (target.dataset.reviewView) { selectTab(target.dataset.reviewView,true); return; }
    if (target.dataset.reviewWeek) { vm.week = target.dataset.reviewWeek; writeRoute({week:vm.week}); paintContentReviewPage(); root()?.querySelector(`[data-review-week="${vm.week}"]`)?.focus({preventScroll:true}); return; }
    if (target.dataset.reviewAction === 'close-article') { closeArticle(); return; }
    const article = target.dataset.reviewArticle || target.dataset.reviewRow;
    if (article) { returnFocusId = article; returnScroll = window.scrollY; vm.article = article; vm.benchmark = ''; writeRoute({article,benchmark:''}); paintContentReviewPage(); }
  });
  document.addEventListener('change',event => {
    const target = event.target;
    const node = root();
    if (!node?.contains(target) || vm.loading || vm.error) return;
    const column = target.dataset.reviewColumn;
    if (column !== undefined) {
      if (!REVIEW_METRIC_COLUMNS.includes(column)) return;
      const selected = new Set(vm.metricColumns);
      if (target.checked) selected.add(column); else selected.delete(column);
      vm.metricColumns = REVIEW_METRIC_COLUMNS.filter(key => selected.has(key));
      vm.metricPickerOpen = true;
      storage.set(columnStorageKey,JSON.stringify(vm.metricColumns));
      const scrollLeft = node.querySelector('.review-table-wrap')?.scrollLeft || 0;
      const scrollY = window.scrollY;
      paintContentReviewPage();
      const current = root();
      const picker = current?.querySelector('[data-review-columns-picker]');
      if (picker) picker.open = true;
      const table = current?.querySelector('.review-table-wrap');
      if (table) table.scrollLeft = scrollLeft;
      current?.querySelector(`[data-review-column="${column}"]`)?.focus({preventScroll:true});
      window.scrollTo({top:scrollY,behavior:'instant'});
      positionReviewColumnsPicker();
      return;
    }
    if (!target.dataset.reviewFilter) return;
    const key = target.dataset.reviewFilter;
    vm.filters[key] = target.value; paintContentReviewPage();
    root()?.querySelector(`[data-review-filter="${key}"]`)?.focus({preventScroll:true});
  });
  document.addEventListener('keydown',event => {
    const node = root(); if (!node?.contains(event.target)) return;
    const dialog = node.querySelector('[role="dialog"]');
    if (dialog) {
      if (event.key === 'Escape') { event.preventDefault(); closeArticle(); return; }
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('button:not([disabled]),a[href],summary,[tabindex="0"]')].filter(el => !el.hidden && el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      return;
    }
    const picker = node.querySelector('[data-review-columns-picker]');
    if (event.key === 'Escape' && picker?.open) {
      event.preventDefault(); picker.open = false; vm.metricPickerOpen = false;
      picker.querySelector('[data-review-columns-trigger]')?.focus({preventScroll:true}); return;
    }
    if (event.key === 'Escape' && node.classList.contains('review-list-fullscreen')) {
      event.preventDefault(); void toggleReviewFullscreen(); return;
    }
    if (event.target.matches('[data-review-secondary]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault(); const ids = REVIEW_SECTIONS.map(([id]) => id), index = ids.indexOf(vm.secondary);
      vm.secondary = event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : ids[(index + (event.key === 'ArrowRight' ? 1 : ids.length-1)) % ids.length];
      vm.benchmark = ''; writeRoute({section:vm.secondary,benchmark:''}); paintContentReviewPage(); root()?.querySelector(`#review-secondary-${vm.secondary}`)?.focus({preventScroll:true}); return;
    }
    if (event.target.matches('[data-review-view]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault(); const ids = REVIEW_VIEWS.map(([id]) => id), index = ids.indexOf(vm.view);
      selectTab(event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : ids[(index + (event.key === 'ArrowRight' ? 1 : ids.length-1)) % ids.length],true);
    }
  });
  window.addEventListener('popstate',() => { if (!root()) return; const next = route(); if (next.account !== vm.account) void loadContentReview(pageContext); else { syncViewFromRoute(); paintContentReviewPage(); focusBenchmark(vm.benchmark); } });
}
