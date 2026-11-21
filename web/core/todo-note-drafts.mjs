import { state } from "./state.mjs";

function draftKey(day, id) {
  return state.me?.id ? `haoduoyu:todo-note:${JSON.stringify([state.me.id, day.date, id])}` : "";
}

export function dailyTodoDraft(day, id) {
  if (day.noteDrafts.has(id)) return day.noteDrafts.get(id);
  const key = draftKey(day, id);
  try {
    const stored = key && JSON.parse(sessionStorage.getItem(key));
    if (stored && typeof stored.text === "string" && typeof stored.base === "string" && (stored.text !== stored.base || stored.check === true)) {
      const draft = {id, text: stored.text, base: stored.base, check: stored.check === true};
      day.noteDrafts.set(id, draft);
      return draft;
    }
  } catch { /* The editor still works when browser storage is unavailable. */ }
  return null;
}

export function persistDailyTodoDraft(day, draft) {
  const key = draftKey(day, draft.id);
  if (!key) return;
  try {
    if (!draft.check && draft.text === draft.base) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify({text: draft.text, base: draft.base, check: draft.check}));
  } catch { /* The in-memory draft remains available. */ }
}
