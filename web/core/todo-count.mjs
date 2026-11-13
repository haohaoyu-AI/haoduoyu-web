// A counted to-do keeps its tally at the front of the ordinary note ("2/5 次 · 原备注", or "3/∞ 次" without a target),
// so it syncs, backs up and shows in every client without a schema change.
// The note can also be edited by hand, which joins lines and drops the " · " separator, so the tally is read
// leniently: anything may follow "次", and stale tallies left at the front of the rest are dropped.
const tally = /^\s*(\d{1,3})\/(\d{1,3}|∞) ?次[\s·]*/;
export const TODO_COUNT_MAX = 99;
export const TODO_COUNT_OPEN_MAX = 999;
function read(text) {
  const match = tally.exec(text);
  if (!match) return null;
  const done = Number(match[1]), target = match[2] === "∞" ? null : Number(match[2]);
  if (target !== null && (target < 1 || target > TODO_COUNT_MAX || done > target)) return null;
  return { done, target, length: match[0].length };
}
export function todoCount(note) {
  const text = String(note ?? ""), first = read(text);
  if (!first) return null;
  let rest = text.slice(first.length);
  for (let stale = read(rest); stale; stale = read(rest)) rest = rest.slice(stale.length);
  return { done: first.done, target: first.target, rest: rest.trim() };
}
export function todoCountNote(done, target, rest = "") {
  return `${done}/${target ?? "∞"} 次${rest ? ` · ${rest}` : ""}`;
}
/** The note after one counting action; null when the action does not apply. A null target counts without a limit. */
export function todoCountChange(note, action, target = 0) {
  const current = todoCount(note), text = String(note ?? "").trim();
  if (action === "set") {
    if (target !== null && (!Number.isInteger(target) || target < 1 || target > TODO_COUNT_MAX)) return null;
    const done = current?.done ?? 0;
    return todoCountNote(target === null ? done : Math.min(done, target), target, current ? current.rest : text);
  }
  if (!current) return null;
  if (action === "clear") return current.rest;
  const limit = current.target ?? TODO_COUNT_OPEN_MAX;
  if (action === "add") return current.done < limit ? todoCountNote(current.done + 1, current.target, current.rest) : null;
  if (action === "undo") return current.done > 0 ? todoCountNote(current.done - 1, current.target, current.rest) : null;
  return null;
}
