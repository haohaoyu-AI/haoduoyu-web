import {day, normalizeReviewData, periodsFor, shiftDay} from './core/review-data.mjs';
import {renderContentReviewContent, REVIEW_VIEWS} from './pages/content-review.mjs';

const resources = ['articles','snapshots','reports','playbooks'];
let data = normalizeReviewData(), sequence = 0, registered = false, identity = '', pageContext;
let vm = {account:'V字',view:'daily',date:'',start:'',end:'',periods:[],filters:{},article:'',version:'',compare:'',loading:true,error:''};
const root = () => typeof document === 'undefined' ? null : document.querySelector('#content-review');
function staleRead(message = '复盘资料在读取时发生变化，请重新读取。') { return Object.assign(new Error(message),{code:'REVIEW_READ_CHANGED'}); }

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
function yesterday() {
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return shiftDay(date,-1);
}
function route() {
  const url = new URL(location.href), p = url.searchParams;
  const view = REVIEW_VIEWS.some(([id]) => id === p.get('review_view')) ? p.get('review_view') : 'daily';
  return {account:p.get('account')?.trim() || 'V字',view,date:day(p.get('review_date') || ''),period:p.get('review_period') || '',
    article:p.get('review_article') || '',version:p.get('review_version') || '',compare:p.get('review_compare') || ''};
}
function writeRoute(values) {
  const url = new URL(location.href);
  for (const [key,value] of Object.entries(values)) {
    if (value) url.searchParams.set(`review_${key}`,value); else url.searchParams.delete(`review_${key}`);
  }
  history.replaceState({},'',url);
}
function selectPeriod(selected = '') {
  const type = ['three_day','weekly'].includes(vm.view) ? vm.view : 'daily';
  vm.periods = periodsFor(data,type);
  const period = vm.periods.find(p => `${p.start}|${p.end}` === selected) || vm.periods[0];
  const end = period?.end || vm.date || yesterday();
  vm.start = period?.start || shiftDay(end,type === 'weekly' ? -6 : type === 'three_day' ? -2 : 0);
  vm.end = end;
}
function syncViewFromRoute() {
  const r = route();
  const latestDaily = periodsFor(data,'daily')[0]?.end || yesterday();
  vm = {...vm,...r,date:r.date || latestDaily,periods:[],loading:false,error:''};
  selectPeriod(r.period);
}
export function paintContentReviewPage() {
  const node = root(); if (!node) return;
  node.innerHTML = renderContentReviewContent(data,vm);
}
export async function loadContentReview(context) {
  registerEvents();
  pageContext = context;
  const [{apiNetwork},{state,runtime}] = await Promise.all([import('./core/api.mjs'),import('./core/state.mjs')]);
  const requested = route(), currentIdentity = `${runtime.sessionEpoch}:${state.me?.id || ''}:${requested.account}`;
  if (identity !== currentIdentity) { data = normalizeReviewData(); vm.filters = {}; identity = currentIdentity; }
  vm = {...vm,...requested,loading:true,error:''}; selectPeriod(requested.period); paintContentReviewPage();
  const ticket = ++sequence, epoch = runtime.sessionEpoch;
  const current = () => ticket === sequence && epoch === runtime.sessionEpoch && state.page === 'review' && route().account === requested.account && Boolean(root());
  const read = path => apiNetwork(path,context ? {context} : {});
  try {
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { result = await readContentReviewData(read,requested.account,current); break; }
      catch (error) { if (error.code !== 'REVIEW_READ_CHANGED' || attempt) throw error; }
    }
    if (!current() || !result) return;
    data = result; syncViewFromRoute(); paintContentReviewPage();
  } catch (error) {
    if (!current() || error.name === 'AbortError') return;
    vm.loading = false; vm.error = error.message || '读取失败，请稍后重试。'; paintContentReviewPage();
  }
}
function focusRule(id) {
  const node = document.getElementById(`review-rule-${encodeURIComponent(id)}`);
  if (node) { node.scrollIntoView({block:'center',behavior:'auto'}); node.focus({preventScroll:true}); }
}
function registerEvents() {
  if (registered || typeof document === 'undefined') return;
  registered = true;
  document.addEventListener('click',event => {
    const target = event.target.closest?.('button');
    if (!target || !root()?.contains(target)) return;
    if (target.dataset.reviewAction === 'refresh') { void loadContentReview(pageContext); return; }
    if (vm.loading || vm.error) return;
    if (target.dataset.reviewView) {
      vm.view = target.dataset.reviewView; vm.article = ''; selectPeriod();
      writeRoute({view:vm.view,article:'',period:''}); paintContentReviewPage(); return;
    }
    if (target.dataset.reviewArticle) { vm.article = target.dataset.reviewArticle; writeRoute({article:vm.article}); paintContentReviewPage(); root()?.querySelector('.review-back')?.focus(); return; }
    if (target.dataset.reviewRule) {
      const id = target.dataset.reviewRule, preferred = target.dataset.reviewVersion;
      const book = data.playbooks.find(p => p.version === preferred && p.rules.some(r => r.rule_id === id)) || data.playbooks.find(p => p.rules.some(r => r.rule_id === id));
      if (!book) return;
      vm.view = 'playbooks'; vm.version = book.version; vm.article = ''; vm.compare = '';
      writeRoute({view:vm.view,version:vm.version,article:'',compare:''}); paintContentReviewPage(); focusRule(id); return;
    }
    if (target.dataset.reviewVersion) { vm.version = target.dataset.reviewVersion; vm.compare = ''; writeRoute({version:vm.version,compare:''}); paintContentReviewPage(); return; }
    if (target.dataset.reviewAction === 'close-article') { vm.article = ''; writeRoute({article:''}); paintContentReviewPage(); return; }
    if (target.dataset.reviewAction === 'reset-filters') { vm.filters = {}; paintContentReviewPage(); return; }
    if (target.dataset.reviewAction === 'latest') { vm.date = periodsFor(data,'daily')[0]?.end || yesterday(); writeRoute({date:''}); paintContentReviewPage(); }
  });
  document.addEventListener('change',event => {
    const target = event.target;
    if (!root()?.contains(target) || vm.loading || vm.error) return;
    if (target.dataset.reviewFilter) { vm.filters[target.dataset.reviewFilter] = target.value; paintContentReviewPage(); return; }
    const key = target.dataset.reviewSelect;
    if (key === 'date') { if (!day(target.value)) { target.value = vm.date; return; } vm.date = target.value; writeRoute({date:vm.date}); }
    else if (key === 'period') { selectPeriod(target.value); writeRoute({period:`${vm.start}|${vm.end}`}); }
    else if (key === 'version') { vm.version = target.value; vm.compare = ''; writeRoute({version:vm.version,compare:''}); }
    else if (key === 'compare') { vm.compare = target.value; writeRoute({compare:vm.compare}); }
    else return;
    paintContentReviewPage();
  });
}
