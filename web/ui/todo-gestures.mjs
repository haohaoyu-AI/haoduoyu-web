function cancelTodoPress(gesture) {
  if (gesture.press) clearTimeout(gesture.press.timer);
  gesture.press = null;
}
function todoPressRow(target) {
  const row = target?.closest?.(".daily-todo-row");
  if (!row || target.closest("button,a,select,textarea,input:not([type=checkbox])")) return null;
  if (row.querySelector('input[aria-disabled="true"]')) return null;
  return row;
}
function todoPressEligible(gesture, press, x = press.x, y = press.y) {
  if (!press.row.isConnected || document.visibilityState === "hidden" || !press.row.getClientRects().length) return false;
  const rect = press.row.getBoundingClientRect();
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return false;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  return gesture.isEligible({ id: press.id, date: press.date, anchor: press.row });
}
function openTodoPress(gesture, press) {
  if (gesture.press !== press) return;
  if (gesture.pointers.size !== 1 || !todoPressEligible(gesture, press)) {
    cancelTodoPress(gesture);
    return;
  }
  gesture.press = null;
  gesture.blocked = { pointerId: press.pointerId, row: press.row, x: press.x, y: press.y, until: Infinity };
  gesture.onOpen({ id: press.id, date: press.date, anchor: press.row });
}
function startTodoPress(gesture, event) {
  gesture.blocked = null;
  cancelTodoPress(gesture);
  if (!["touch", "pen"].includes(event.pointerType)) return;
  gesture.pointers.add(event.pointerId);
  if (gesture.pointers.size !== 1 || event.isPrimary === false || event.button !== 0) return;
  const row = todoPressRow(event.target);
  if (!row) return;
  const press = { row, id: row.dataset.id, date: row.dataset.date || row.querySelector("[data-date]")?.dataset.date,
    pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: null };
  if (!press.id || !press.date || !todoPressEligible(gesture, press)) return;
  gesture.press = press;
  press.timer = setTimeout(() => openTodoPress(gesture, press), 650);
}
function moveTodoPress(gesture, event) {
  const press = gesture.press;
  if (!press || press.pointerId !== event.pointerId) return;
  const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10;
  if (moved || !todoPressEligible(gesture, press, event.clientX, event.clientY)) cancelTodoPress(gesture);
}
function endTodoPress(gesture, event) {
  gesture.pointers.delete(event.pointerId);
  if (gesture.press?.pointerId === event.pointerId) cancelTodoPress(gesture);
  if (gesture.blocked?.pointerId === event.pointerId) gesture.blocked.until = Date.now() + 800;
}
function blockTodoPressClick(gesture, event) {
  const blocked = gesture.blocked;
  if (!blocked || Date.now() > blocked.until || (!event.pointerType && event.detail === 0)) return;
  const samePointer = event.pointerId === blocked.pointerId;
  const samePosition = Math.hypot(event.clientX - blocked.x, event.clientY - blocked.y) <= 25;
  if (!samePointer && !samePosition) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}
function blockTodoPressMenu(gesture, event) {
  if (event.pointerType === "mouse") return;
  const row = gesture.press?.row || (gesture.blocked && Date.now() <= gesture.blocked.until ? gesture.blocked.row : null);
  if (row?.contains(event.target)) event.preventDefault();
}
function resetTodoPress(gesture) {
  cancelTodoPress(gesture);
  gesture.pointers.clear();
  if (gesture.blocked) gesture.blocked.until = Date.now() + 800;
}
function registerTodoGestures(onOpen, isEligible = () => true) {
  const gesture = { onOpen, isEligible, press: null, blocked: null, pointers: new Set() }, listeners = [];
  const listen = (target, name, handler, options = true) => {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  };
  listen(document, "pointerdown", (event) => startTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointermove", (event) => moveTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointerup", (event) => endTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "pointercancel", (event) => endTodoPress(gesture, event), { capture: true, passive: true });
  listen(document, "click", (event) => blockTodoPressClick(gesture, event));
  listen(document, "contextmenu", (event) => blockTodoPressMenu(gesture, event));
  listen(document, "scroll", () => cancelTodoPress(gesture), { capture: true, passive: true });
  listen(document, "visibilitychange", () => resetTodoPress(gesture));
  listen(window, "blur", () => resetTodoPress(gesture));
  listen(window, "popstate", () => cancelTodoPress(gesture));
  return () => {
    resetTodoPress(gesture);
    for (const remove of listeners) remove();
  };
}
export { registerTodoGestures };
