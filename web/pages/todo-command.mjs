import { api } from "../core/api.mjs";
import { bjtDate } from "../core/format.mjs";
import { periodFits } from "../../shared/todo-period.mjs";

// "一句话处理已有待办": the page lists the to-dos it knows about, the model picks one and an action,
// and nothing changes until the person confirms. Today's to-dos come from the shown day; 未来待办 are read fresh.

/** The rows the model may choose from, keyed by id, and the list sent to the server (no versions or notes). */
export async function commandCandidates(dayItems = []) {
  const today = dayItems.filter(row => !row.deleted_at && !row.completed)
    .map(row => ({ row, item: { id: row.id, text: row.text, where: "today", date: row.date } }));
  let future = [];
  try {
    const data = await api("/unscheduled-todos");
    future = (data.items || []).filter(row => !row.deleted_at && !row.deleted && !row.completed)
      .map(row => ({ row, item: { id: row.id, text: row.text, where: "future", ...(row.period ? { period: row.period } : {}) } }));
  } catch { /* 今日 alone still works */ }
  const all = [...today, ...future].slice(0, 150);
  return { rows: new Map(all.map(({ row, item }) => [item.id, { ...row, where: item.where }])), items: all.map(({ item }) => item) };
}

/** Carries out a confirmed reading. Returns the message to show and, for a deletion, how to take it back. */
export async function runTodoCommand(proposal, rows) {
  const row = rows.get(proposal.id);
  if (!row) throw new Error("这条待办已经找不到了，请刷新后再说一次");
  const id = encodeURIComponent(row.id), today = bjtDate();
  if (row.where === "today") {
    if (proposal.action === "complete") {
      await api(`/todos/${id}`, { method: "PATCH", body: { completed: true, version: row.version } });
      return { message: `已标为完成：${row.text}` };
    }
    if (proposal.action === "delete") {
      const saved = await api(`/todos/${id}`, { method: "DELETE", body: { date: row.date, version: row.version } });
      return { message: `已删除：${row.text}`, undo: () => api(`/todos/${id}/restore`,
        { method: "POST", body: { date: row.date, version: saved.version } }) };
    }
    // A day's to-do has no move of its own: it is added on the new day, then taken off the old one.
    await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date: proposal.date, text: row.text } });
    await api(`/todos/${id}`, { method: "DELETE", body: { date: row.date, version: row.version } });
    return { message: `已改到 ${proposal.date}：${row.text}` };
  }
  if (proposal.action === "complete") {
    await api(`/unscheduled-todos/${id}/complete-today`, { method: "POST", body: { date: today, version: row.version } });
    return { message: `已标为完成：${row.text}` };
  }
  if (proposal.action === "delete") {
    const saved = await api(`/unscheduled-todos/${id}`, { method: "DELETE", body: { version: row.version } });
    return { message: `已删除：${row.text}`, undo: () => api(`/unscheduled-todos/${id}/restore`,
      { method: "POST", body: { version: saved.version } }) };
  }
  if (proposal.date) {
    await api(`/unscheduled-todos/${id}/move`, { method: "POST", body: { date: proposal.date, version: row.version } });
    return { message: `已改到 ${proposal.date}：${row.text}` };
  }
  const body = { period: proposal.period, version: row.version };
  if (row.recurrence && periodFits(proposal.period, row.recurrence)) body.recurrence = row.recurrence;
  await api(`/unscheduled-todos/${id}/period`, { method: "PATCH", body });
  return { message: `已改到 ${proposal.periodLabel || proposal.period}：${row.text}` };
}
