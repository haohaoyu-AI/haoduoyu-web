import { $, $$ } from "../core/dom.mjs";
import { runtime, state } from "../core/state.mjs";
import { isMobileLayout } from "../core/router.mjs";
import { closePopover } from "./popover.mjs";
function syncMenu() {
  const phone = isMobileLayout(), open = Boolean($(".shell")?.classList.contains("menu-open")), side = $(".sidebar");
  if (side) side.inert = phone;
  const panel = $("#mobile-settings-menu");
  if (panel) { panel.hidden = !phone || !open; panel.inert = !phone || !open; }
  const trigger = $(".mobile-settings-trigger");
  if (trigger) {
    trigger.classList.toggle("active",state.page === "settings");
    if (state.page === "settings") trigger.setAttribute("aria-current","page");
    else trigger.removeAttribute("aria-current");
  }
}
function setMenu(open) {
  const shell = $(".shell");
  if (!shell) return;
  closePopover();
  shell.classList.toggle("menu-open", open);
  $$("[data-action=menu]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
  syncMenu();
  if (open) {
    runtime.menuFocus = document.activeElement;
    $(isMobileLayout() ? "#mobile-settings-menu a[href]" : ".sidebar .brand")?.focus();
  } else if (runtime.menuFocus?.isConnected) {
    runtime.menuFocus.focus();
    runtime.menuFocus = null;
  }
}
function closeMobileMenuOutside(target) {
  if (!isMobileLayout() || !$(".shell")?.classList.contains("menu-open")) return;
  if (!target?.closest?.('#mobile-settings-menu,[data-action="menu"]')) setMenu(false);
}
function trapMobileMenuFocus(event) {
  if (event.key !== "Tab" || !isMobileLayout() || !$(".shell")?.classList.contains("menu-open")) return false;
  const panel = $("#mobile-settings-menu");
  if (!panel) return false;
  const nodes = $$('a[href],button:not(:disabled)',panel);
  if (!nodes.length) return false;
  const first = nodes[0], last = nodes.at(-1), outside = !panel.contains(document.activeElement);
  if (outside || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
    event.preventDefault(); (event.shiftKey ? last : first).focus(); return true;
  }
  return false;
}
export {
  closeMobileMenuOutside,
  setMenu,
  syncMenu,
  trapMobileMenuFocus
};
