import {normalizeReviewData} from './core/review-data.mjs';
import {renderContentReviewContent, REVIEW_VIEWS} from './pages/content-review.mjs';

const resources = ['articles','snapshots','reports','playbooks','benchmark-accounts','benchmark-articles','notes','account-health'];
let data = normalizeReviewData(), sequence = 0, registered = false, identity = '', pageContext;
let vm = {account:'V字',view:'overview',week:'this',date:'',start:'',end:'',periods:[],filters:{},article:'',version:'',compare:'',loading:true,error:''};
const root = () => typeof document === 'undefined' ? null : document.querySelector('#content-review');
function staleRead(message = '复盘资料在读取时发生变化，请重新读取。') {
  return Object.assign(new Error(message),{code:'READ_REVISION_CHANGED'});
}

/** Read-only, offset pagination. An invalid page is an error, never a partial success. */
export async function readReviewCollection(read, resource, selectedAccount, current = () => true) {
  if (!resources.includes(resource)) throw new Error('未知的复盘资料类型。');
  const items = [], seen = new Set();
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
      if (resource !== 'snapshots' && row.account !== selectedAccount) throw new Error('复盘资料与当前账号不一致。');
      seen.add(String(row.id)); items.push(row);
    }
    if (!page.has_more) return {items,read_revision:revision};
  }
}
export async function readContentReviewData(read, selectedAccount, current = () => true) {
  const results = await Promise.all(resources.map(name => readReviewCollection(read,name,selectedAccount,current)));
  if (!current() || results.some(result => result === null)) return null;
  const revisions = results.map(result => result.read_revision).filter(value => value !== undefined);
  if (revisions.length && revisions.some(value => value !== revisions[0])) throw staleRead();
  const result = normalizeReviewData(Object.fromEntries(resources.map((key,index) => [key,results[index].items])));
  const articles = new Set(result.articles.map(row => String(row.id)));
  if (result.snapshots.some(row => !articles.has(String(row.article_id)))) throw staleRead('快照对应的文章不完整，请重新读取。');
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
  return {account:p.get('account')?.trim() || defaultAccount,view,week:p.get('review_week') === 'last' ? 'last' : 'this',article:p.get('review_article') || '',version:p.get('review_version') || ''};
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
let returnFocusId = '', returnScroll = 0;
export function paintContentReviewPage() {
  const node = root(); if (!node) return;
  node.innerHTML = renderContentReviewContent(data,vm);
  const dialog = node.querySelector('[role="dialog"]');
  for (const child of node.children) if (child !== dialog?.parentElement && dialog) child.inert = true;
  if (dialog) dialog.querySelector('.review-drawer-close')?.focus({preventScroll:true});
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
    data = result; syncViewFromRoute(); paintContentReviewPage();
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
  vm.view = view; vm.article = ''; writeRoute({view,article:''}); paintContentReviewPage();
  if (focus) root()?.querySelector(`#review-tab-${view}`)?.focus({preventScroll:true});
}
function registerEvents() {
  if (registered || typeof document === 'undefined') return;
  registered = true;
  document.addEventListener('click',event => {
    const node = root(); if (event.target.closest?.('a')) return;
    const target = event.target.closest?.('button,[data-review-row]');
    if (!target || !node?.contains(target)) return;
    if (target.dataset.reviewAction === 'show-health') {
      if (vm.view !== 'overview') {
        vm.view = 'overview'; vm.article = '';
        writeRoute({view:'overview',article:''}); paintContentReviewPage();
      }
      const details = node.querySelector('#review-health-history');
      if (details) {
        details.open = true; details.scrollIntoView({behavior:'smooth',block:'start'});
        details.querySelector('summary')?.focus({preventScroll:true});
      }
      return;
    }
    if (target.dataset.reviewAction === 'refresh') { void loadContentReview(pageContext); return; }
    if (vm.loading || vm.error) return;
    if (target.dataset.reviewView) { selectTab(target.dataset.reviewView,true); return; }
    if (target.dataset.reviewWeek) { vm.week = target.dataset.reviewWeek; writeRoute({week:vm.week}); paintContentReviewPage(); root()?.querySelector(`[data-review-week="${vm.week}"]`)?.focus({preventScroll:true}); return; }
    if (target.dataset.reviewAction === 'close-article') { closeArticle(); return; }
    const article = target.dataset.reviewArticle || target.dataset.reviewRow;
    if (article) { returnFocusId = article; returnScroll = window.scrollY; vm.article = article; writeRoute({article}); paintContentReviewPage(); }
  });
  document.addEventListener('change',event => {
    const target = event.target;
    if (!root()?.contains(target) || vm.loading || vm.error || !target.dataset.reviewFilter) return;
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
    if (event.target.matches('[role="tab"]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault(); const ids = REVIEW_VIEWS.map(([id]) => id), index = ids.indexOf(vm.view);
      selectTab(event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : ids[(index + (event.key === 'ArrowRight' ? 1 : ids.length-1)) % ids.length],true);
    }
  });
  window.addEventListener('popstate',() => { if (!root()) return; const next = route(); if (next.account !== vm.account) void loadContentReview(pageContext); else { syncViewFromRoute(); paintContentReviewPage(); } });
}
