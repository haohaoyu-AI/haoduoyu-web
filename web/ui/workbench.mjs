import {nav} from '../core/constants.mjs';
import {e, icon} from '../core/dom.mjs';
import {state} from '../core/state.mjs';
import {storage} from '../core/storage.mjs';
import {dailyNotesRouteCategory} from '../core/daily-notes-state.mjs';
import {isMobileLayout} from '../core/router.mjs';

const mediaPages = new Set(['dashboard', 'articles', 'reviews']);
function navigationLink(item, mobile = false) {
  const selected = item.id === state.page && (!item.category || item.category === dailyNotesRouteCategory());
  const query = item.id === 'settings' ? '&amp;tab=workspace' : item.category ? '&amp;notes_category=' + item.category : '';
  return `<a href="?page=${e(item.id)}${query}" data-nav="${e(item.id)}" ${item.category ? `data-notes-category="${item.category}"` : ''}
title="${e(item.label)}"
class="${mobile ? 'mobile-nav-item' : 'nav-item'}${selected ? ' active' : ''}" aria-label="${e(item.label)}"
${selected ? 'aria-current="page"' : ''}>${icon(item.icon, 18)}<span class="nav-label">${e(item.label)}</span></a>`;
}
export function mediaNavigation(mobile = false) {
  const active = mediaPages.has(state.page), name = mobile ? 'mobile-nav-item' : 'nav-item';
  return `<a href="?page=dashboard" data-nav="dashboard" class="${name} media-link${active ? ' active' : ''}"
aria-label="好多鱼图文" ${active ? 'aria-current="page"' : ''}>${icon('articles',18)}\
<span class="nav-label">${mobile ? '图文' : '好多鱼图文'}</span></a>`;
}
export function renderMediaTabs() {
  if (!mediaPages.has(state.page)) return '';
  return '<nav class="media-page-tabs" aria-label="图文页面">' +
    [['dashboard','数据总览'],['articles','文章详情']].map(([page,label]) =>
      `<a href="?page=${page}" data-nav="${page}" class="btn media-page-tab${state.page === page ? ' active' : ''}"
${state.page === page ? 'aria-current="page"' : ''}>${label}</a>`).join('') + '</nav>';
}
export function notesNavigation(mobile = false) {
  const active = state.page === 'notes', name = mobile ? 'mobile-notes-nav' : 'notes-nav';
  return `<details class="${name}${active ? ' active' : ''}" ${!mobile && active ? 'open' : ''}>
<summary ${mobile ? 'data-action="notes-menu"' : ''} title="碎碎念" aria-label="碎碎念" aria-expanded="${!mobile && active}">
${icon('edit', 18)}<span class="nav-label">碎碎念</span></summary><div class="notes-subnav">
${['life', 'work'].map(category => navigationLink({id:'notes',category,icon:'edit',label:category === 'work' ? '工作碎碎念' : '生活碎碎念'})).join('')}
</div></details>`;
}
export function sidebarNavigation() {
  return mediaNavigation() + nav.filter(item => !mediaPages.has(item.id) && item.id !== 'settings')
    .map(item => item.id === 'notes' ? notesNavigation() : navigationLink(item)).join('');
}
export function settingsNavigation() { return navigationLink(nav.find(item => item.id === 'settings')); }
export function mobileNavigation() {
  const items = [['todos','待办'],['notes','碎碎念'],['memos','备忘录'],['reminders','提醒']];
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${items.map(([id,label]) =>
    navigationLink({...nav.find(item => item.id === id),label,...(id === 'notes' ? {category:dailyNotesRouteCategory()} : {})},true))
    .join('')}${mediaNavigation(true)}</nav>`;
}
export function mobileSettingsMenu() {
  return `<nav id="mobile-settings-menu" class="mobile-settings-menu" aria-label="设置菜单" hidden>
${settingsNavigation()}${state.me?.publicBusiness ? '' : `<button class="btn text" data-action="logout">${icon('logout',18)}退出登录</button>`}</nav>`;
}
export function syncWorkbenchNavigation() {
  const active = mediaPages.has(state.page);
  const notes = document.querySelector('.mobile-nav [data-nav="notes"]');
  if (notes) {
    notes.dataset.notesCategory = dailyNotesRouteCategory();
    notes.setAttribute('href','?page=notes&notes_category=' + dailyNotesRouteCategory());
  }
  for (const link of document.querySelectorAll('.media-link')) {
    link.classList.toggle('active',active);
    if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  }
  for (const menu of document.querySelectorAll('.notes-nav,.mobile-notes-nav')) {
    menu.open = state.page === 'notes' && menu.classList.contains('notes-nav');
    menu.classList.toggle('active', state.page === 'notes'); syncMediaExpanded(menu);
  }
  for (const link of document.querySelectorAll('[data-notes-category]')) {
    const selected = state.page === 'notes' && link.dataset.notesCategory === dailyNotesRouteCategory();
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  const mobile = document.querySelector('.mobile-media-nav');
  if (mobile) { mobile.open = false; mobile.classList.toggle('active', active); syncMediaExpanded(mobile); }
}
export function closeMediaNavigation(target = null) {
  for (const menu of document.querySelectorAll('.mobile-media-nav[open],.mobile-notes-nav[open]'))
    if (!target || !menu.contains(target)) { menu.open = false; syncMediaExpanded(menu); }
}

function syncMediaExpanded(menu) {
  menu?.querySelector?.('summary')?.setAttribute('aria-expanded', String(menu.open));
}
const sidebarWidthKey = 'haoduoyu.workbench.sidebar-width.v1';
let sidebarPreference, sidebarDrag = null, sidebarResizeEvents = false;
function readSidebarWidth() {
  if (sidebarPreference === undefined) {
    const saved = Number(storage.get(sidebarWidthKey));
    sidebarPreference = Number.isFinite(saved) && saved >= 88 && saved <= 420 ? saved : null;
  }
  return sidebarPreference;
}
export function sidebarWidthLimits(viewport, shellWidth) {
  if (viewport < 768) return null;
  const min = viewport < 1200 ? 88 : 200;
  return {min, max: Math.max(min, Math.min(420, Math.floor(shellWidth - (viewport < 1200 ? 420 : 540))))};
}
export function renderSidebarResizer() {
  return '<div id="sidebar-resizer" class="sidebar-resizer" role="separator" tabindex="0" aria-orientation="vertical" ' +
    'aria-label="调整导航宽度" aria-controls="site-nav main" aria-valuemin="200" aria-valuemax="420" aria-valuenow="232" ' +
    'title="拖动调整导航宽度；方向键微调，Home / End 调到最小 / 最大"></div>';
}
function applySidebarWidth(value = readSidebarWidth(), persist = false) {
  const shell = document.querySelector('.shell'), handle = document.querySelector('#sidebar-resizer');
  if (!shell?.style?.setProperty || !handle || typeof window.innerWidth !== 'number') return null;
  const limits = sidebarWidthLimits(window.innerWidth, shell.clientWidth);
  handle.hidden = !limits;
  if (!limits) { shell.style.removeProperty('--sidebar-w'); delete shell.dataset.sidebarExpanded; return null; }
  const fallback = window.innerWidth < 1200 ? 88 : 232;
  const width = Math.round(Math.max(limits.min, Math.min(limits.max, value ?? fallback)));
  shell.style.setProperty('--sidebar-w', width + 'px'); shell.dataset.sidebarExpanded = String(width >= 200);
  for (const [name, number] of Object.entries({min: limits.min, max: limits.max, now: width}))
    handle.setAttribute('aria-value' + name, String(number));
  handle.setAttribute('aria-valuetext', '导航宽度 ' + width + ' 像素');
  if (persist) { sidebarPreference = width; storage.set(sidebarWidthKey, String(width)); }
  return width;
}
function finishSidebarDrag(cancel = false) {
  const drag = sidebarDrag; if (!drag) return;
  sidebarDrag = null;
  if (cancel) { sidebarPreference = drag.preference; applySidebarWidth(drag.width); }
  else applySidebarWidth(Number(drag.handle.getAttribute('aria-valuenow')), true);
  drag.shell.classList.remove('sidebar-resizing');
  if (drag.handle.hasPointerCapture?.(drag.pointer)) drag.handle.releasePointerCapture(drag.pointer);
}
function startSidebarDrag(event) {
  const handle = event.target.closest?.('#sidebar-resizer');
  if (!handle || event.button !== 0 || event.isPrimary === false || window.innerWidth < 768) return;
  event.preventDefault(); finishSidebarDrag();
  const shell = handle.closest('.shell');
  sidebarDrag = {handle, shell, pointer: event.pointerId, x: event.clientX,
    width: Number(handle.getAttribute('aria-valuenow')), preference: readSidebarWidth()};
  shell.classList.add('sidebar-resizing'); handle.focus({preventScroll: true});
  handle.setPointerCapture(event.pointerId);
}
function moveSidebarDrag(event) {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.pointer) return;
  event.preventDefault(); applySidebarWidth(sidebarDrag.width + event.clientX - sidebarDrag.x);
}
function keySidebarResize(event) {
  if (sidebarDrag && event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation(); finishSidebarDrag(true); return;
  }
  const handle = event.target.closest?.('#sidebar-resizer');
  if (!handle || handle.hidden || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const current = Number(handle.getAttribute('aria-valuenow')), step = event.shiftKey ? 32 : 16;
  const next = event.key === 'Home' ? Number(handle.getAttribute('aria-valuemin')) :
    event.key === 'End' ? Number(handle.getAttribute('aria-valuemax')) : current + (event.key === 'ArrowRight' ? step : -step);
  applySidebarWidth(next, true);
}
export function setupSidebarResize() {
  if (applySidebarWidth() === null && typeof window.innerWidth !== 'number') return;
  if (sidebarResizeEvents) return;
  sidebarResizeEvents = true;
  document.addEventListener('toggle', event => {
    if (event.target.matches?.('.media-nav,.mobile-media-nav,.notes-nav,.mobile-notes-nav')) syncMediaExpanded(event.target);
  }, true);
  document.addEventListener('pointerdown', startSidebarDrag);
  document.addEventListener('pointermove', moveSidebarDrag);
  document.addEventListener('pointerup', event => { if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(); });
  document.addEventListener('pointercancel', event => { if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(true); });
  document.addEventListener('lostpointercapture', event => { if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(); });
  document.addEventListener('keydown', keySidebarResize, true);
  window.addEventListener('resize', () => { finishSidebarDrag(true); applySidebarWidth(); syncMobileViewport(); });
}

let mobileViewportEvents = false;
function keepMobileInputVisible() {
  const field = document.activeElement, viewport = window.visualViewport;
  if (!isMobileLayout() || !viewport || !field?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
  requestAnimationFrame(() => {
    if (document.activeElement !== field || !field.isConnected) return;
    const rect = field.getBoundingClientRect(), top = viewport.offsetTop || 0;
    if (rect.bottom > top + viewport.height - 16 || rect.top < top + 12) field.scrollIntoView?.({block:'nearest'});
  });
}
export function syncMobileViewport() {
  const root = document.documentElement;
  if (!root?.style?.setProperty) return;
  if (!isMobileLayout()) {
    for (const key of ['height','top','keyboard']) root.style.removeProperty('--mobile-viewport-' + key);
    delete root.dataset.mobileKeyboard;
    return;
  }
  const viewport = window.visualViewport, height = viewport?.height || window.innerHeight, top = viewport?.offsetTop || 0;
  if (!Number.isFinite(height) || height <= 0) return;
  const editing = document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  const keyboard = editing ? Math.max(0,(window.innerHeight || height) - height - top) : 0;
  root.style.setProperty('--mobile-viewport-height',Math.round(height) + 'px');
  root.style.setProperty('--mobile-viewport-top',Math.round(top) + 'px');
  root.style.setProperty('--mobile-viewport-keyboard',Math.round(keyboard) + 'px');
  root.dataset.mobileKeyboard = String(keyboard > 80);
  keepMobileInputVisible();
}
export function setupMobileViewport() {
  syncMobileViewport();
  if (mobileViewportEvents) return;
  mobileViewportEvents = true;
  window.visualViewport?.addEventListener('resize',syncMobileViewport);
  window.visualViewport?.addEventListener('scroll',syncMobileViewport);
  document.addEventListener('focusin',syncMobileViewport);
  document.addEventListener('focusout',() => requestAnimationFrame(syncMobileViewport));
}
