import {nav} from '../core/constants.mjs';
import {e, icon} from '../core/dom.mjs';
import {state} from '../core/state.mjs';
import {storage} from '../core/storage.mjs';

const mediaPages = new Set(['dashboard', 'articles', 'reviews']);
function navigationLink(item, mobile = false) {
  const selected = item.id === state.page;
  const query = item.id === 'settings' ? '&amp;tab=workspace' : '';
  return `<a href="?page=${e(item.id)}${query}" data-nav="${e(item.id)}" title="${e(item.label)}"
class="${mobile ? 'mobile-nav-item' : 'nav-item'}${selected ? ' active' : ''}" aria-label="${e(item.label)}"
${selected ? 'aria-current="page"' : ''}>${icon(item.icon, 18)}<span class="nav-label">${e(item.label)}</span></a>`;
}
export function mediaNavigation(mobile = false) {
  const active = mediaPages.has(state.page), name = mobile ? 'mobile-media-nav' : 'media-nav';
  return `<details class="${name}${active ? ' active' : ''}" ${!mobile && active ? 'open' : ''}>
<summary title="好多鱼图文" aria-label="好多鱼图文" aria-expanded="${!mobile && active}">${icon('articles', 18)}<span class="nav-label">好多鱼图文</span></summary>
<div class="media-subnav">${nav.filter(item => mediaPages.has(item.id)).map(item => navigationLink(item)).join('')}</div></details>`;
}
export function sidebarNavigation() {
  return mediaNavigation() + nav.filter(item => !mediaPages.has(item.id) && item.id !== 'settings')
    .map(item => navigationLink(item)).join('');
}
export function settingsNavigation() { return navigationLink(nav.find(item => item.id === 'settings')); }
export function mobileNavigation() {
  return `<nav class="mobile-nav workbench-navigation" aria-label="切换模块">${mediaNavigation(true)}${nav
    .filter(item => !mediaPages.has(item.id)).map(item => navigationLink(item, true)).join('')}</nav>`;
}
export function syncWorkbenchNavigation() {
  const active = mediaPages.has(state.page), side = document.querySelector('.media-nav');
  if (side) { side.open = active; side.classList.toggle('active', active); syncMediaExpanded(side); }
  const mobile = document.querySelector('.mobile-media-nav');
  if (mobile) { mobile.open = false; mobile.classList.toggle('active', active); syncMediaExpanded(mobile); }
}
export function closeMediaNavigation(target = null) {
  const menu = document.querySelector('.mobile-media-nav[open]');
  if (menu && (!target || !menu.contains(target))) { menu.open = false; syncMediaExpanded(menu); }
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
  if (viewport <= 760) return null;
  const min = viewport <= 1100 ? 88 : 200;
  return {min, max: Math.max(min, Math.min(420, Math.floor(shellWidth - (viewport <= 1100 ? 420 : 540))))};
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
  const fallback = window.innerWidth <= 1100 ? 88 : 232;
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
  if (!handle || event.button !== 0 || event.isPrimary === false || window.innerWidth <= 760) return;
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
    if (event.target.matches?.('.media-nav,.mobile-media-nav')) syncMediaExpanded(event.target);
  }, true);
  document.addEventListener('pointerdown', startSidebarDrag);
  document.addEventListener('pointermove', moveSidebarDrag);
  document.addEventListener('pointerup', event => { if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(); });
  document.addEventListener('pointercancel', event => { if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(true); });
  document.addEventListener('lostpointercapture', event => { if (event.pointerId === sidebarDrag?.pointer) finishSidebarDrag(); });
  document.addEventListener('keydown', keySidebarResize, true);
  window.addEventListener('resize', () => { finishSidebarDrag(true); applySidebarWidth(); });
}
