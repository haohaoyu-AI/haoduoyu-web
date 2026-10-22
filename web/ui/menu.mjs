import { $, $$ } from "../core/dom.mjs";
import { runtime } from "../core/state.mjs";
import { closePopover } from "./popover.mjs";
function syncMenu() {
  const side = $(".sidebar");
  if (side) side.inert = Boolean(window.matchMedia?.("(max-width:760px)").matches && !$(".shell")?.classList.contains("menu-open"));
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
    $(".sidebar .brand")?.focus();
  } else if (runtime.menuFocus?.isConnected) {
    runtime.menuFocus.focus();
    runtime.menuFocus = null;
  }
}
export {
  setMenu,
  syncMenu
};
