import {nav} from '../core/constants.mjs';
import {e, icon} from '../core/dom.mjs';
import {state} from '../core/state.mjs';

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
<summary title="好多鱼图文" aria-label="好多鱼图文">${icon('articles', 18)}<span class="nav-label">好多鱼图文</span></summary>
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
  if (side) { side.open = active; side.classList.toggle('active', active); }
  const mobile = document.querySelector('.mobile-media-nav');
  if (mobile) { mobile.open = false; mobile.classList.toggle('active', active); }
}
export function closeMediaNavigation(target = null) {
  const menu = document.querySelector('.mobile-media-nav[open]');
  if (menu && (!target || !menu.contains(target))) menu.open = false;
}
