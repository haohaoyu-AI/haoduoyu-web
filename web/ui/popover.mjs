import { runtime } from "../core/state.mjs";
function closePopover({ restoreFocus = true } = {}) {
  if (!runtime.activePopover) return;
  const { node, trigger } = runtime.activePopover;
  runtime.activePopover = null;
  node.remove();
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus && trigger.isConnected) trigger.focus();
}
function popover(trigger, body, { menu = false, label = "说明" } = {}) {
  if (runtime.activePopover?.trigger === trigger) {
    closePopover();
    return;
  }
  closePopover();
  const id = trigger.getAttribute("aria-controls") || `popover-${++runtime.popoverId}`, node = document.createElement("div");
  trigger.setAttribute("aria-controls", id);
  trigger.setAttribute("aria-expanded", "true");
  node.id = id;
  node.className = "popover";
  node.setAttribute("role", menu ? "menu" : "dialog");
  node.setAttribute("aria-label", label);
  node.tabIndex = -1;
  node.innerHTML = body;
  (trigger.closest("[role=dialog]") || document.body).append(node);
  runtime.activePopover = { node, trigger, menu };
  const anchor = trigger.getBoundingClientRect(), r = node.getBoundingClientRect();
  node.style.left = `var(--popover-left,${Math.max(16, Math.min(anchor.right - r.width, innerWidth - r.width - 16))}px)`;
  node.style.top = `var(--popover-top,${Math.max(16, Math.min(anchor.bottom + 8, innerHeight - r.height - 16))}px)`;
  (node.querySelector('button,a[href],input:not([type=hidden]),select,[tabindex="0"]') || node).focus();
}
export {
  closePopover,
  popover
};
