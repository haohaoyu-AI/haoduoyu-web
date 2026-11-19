import { api } from "../core/api.mjs";
import { bjtDate } from "../core/format.mjs";
import { NOTE_SUGGEST_HINT } from "../../shared/todo-assist-hint.mjs";
import { addFutureTodo } from "./unscheduled-todos.mjs";
import { smartDayLabel } from "./todo-smart.mjs";

// "AI 读碎碎念": after a 碎碎念 is sent, one that names a time or a plan is read once; under it the page offers
// "看起来有件事要做：…" and "建议标签：…". Nothing is added or labelled until the person taps it.
const readings = new Map();
let repaint = () => {};
export function setNoteSuggestRepaint(callback) { repaint = callback; }
const FUTURE = { this_week: "本周", next_week: "下周", this_month: "本月", next_month: "下个月", every_week: "每周", every_month: "每月" };
function whenLabel(todo, today = bjtDate()) {
  if (todo.when === "day" && todo.date) return smartDayLabel(todo.date, today);
  if (todo.when === "deadline" && todo.due_date) return `${Number(todo.due_date.slice(5, 7))}/${Number(todo.due_date.slice(8))} 之前`;
  return FUTURE[todo.when] || "今天";
}

/** Reads a just-sent 碎碎念 once per saved version. labels are the ones that exist; the note's own are left out. */
export async function suggestForNote(item, labels) {
  const text = String(item?.serverText ?? item?.draft ?? "").trim(), key = `${item?.id}:${item?.version}`;
  if (!item?.id || !text || !NOTE_SUGGEST_HINT.test(text) || readings.get(item.id)?.key === key) return;
  const reading = { key, status: "reading", todo: null, labels: [], done: {}, error: "" };
  readings.set(item.id, reading); repaint();
  try {
    const data = await api("/note-suggest", { method: "POST", body: { text, labels, current: item.labels || [] } });
    if (readings.get(item.id) !== reading) return;
    if (!data.needs_model || !data.todo && !data.labels?.length) { readings.delete(item.id); repaint(); return; }
    Object.assign(reading, { status: "ready", todo: data.todo, labels: data.labels || [] });
  } catch { readings.delete(item.id); }
  repaint();
}

/** Under a saved 碎碎念: the reading, while there is something left to offer. */
export function paintNoteSuggestion(node, item) {
  const reading = readings.get(item.id);
  let box = node.querySelector(":scope > .note-suggest");
  if (!reading || item.deleted) { box?.remove(); return; }
  if (!box) { box = document.createElement("div"); box.className = "note-suggest"; box.setAttribute("role", "status"); node.append(box); }
  const key = JSON.stringify([reading.status, reading.done, reading.error, reading.busy]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const parts = [];
  const line = (text, action, label) => {
    const row = document.createElement("p"); row.className = "note-suggest-line"; row.textContent = text;
    if (action) {
      const button = document.createElement("button"); button.type = "button"; button.className = "btn small text";
      button.dataset.noteSuggest = action; button.dataset.noteSuggestId = item.id; button.textContent = label; button.disabled = Boolean(reading.busy);
      row.append(" ", button);
    }
    parts.push(row);
  };
  if (reading.status === "reading") line("AI 正在看这条…");
  else {
    if (reading.todo) line(reading.done.todo ? `已加到待办 · ${reading.done.todo}` :
      `看起来有件事要做：${reading.todo.text} · ${whenLabel(reading.todo)}`, reading.done.todo ? "" : "todo", "加到待办");
    if (reading.labels.length) line(reading.done.labels ? `已贴上：${reading.labels.join("、")}` :
      `建议标签：${reading.labels.join("、")}`, reading.done.labels ? "" : "labels", "贴上");
    if (reading.error) line(reading.error);
    const close = document.createElement("button"); close.type = "button"; close.className = "btn small text note-suggest-close";
    close.dataset.noteSuggest = "dismiss"; close.dataset.noteSuggestId = item.id;
    close.textContent = reading.done.todo || reading.done.labels ? "关闭" : "忽略"; parts.push(close);
  }
  box.replaceChildren(...parts);
}

/** A tap on 加到待办 / 贴上 / 忽略. relabel(id, labels) saves the note's new labels and resolves true when it did. */
export async function actOnNoteSuggestion(target, { relabel, current }) {
  const id = target.dataset.noteSuggestId, reading = readings.get(id), action = target.dataset.noteSuggest;
  if (!reading || reading.busy) return;
  if (action === "dismiss") { readings.delete(id); repaint(); return; }
  reading.busy = true; reading.error = ""; repaint();
  try {
    if (action === "todo" && reading.todo) {
      const todo = reading.todo, today = bjtDate();
      if (FUTURE[todo.when] || todo.when === "deadline") await addFutureTodo(todo);
      else {
        const date = todo.when === "day" && todo.date ? todo.date : today;
        await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date, text: todo.text } });
      }
      reading.done = { ...reading.done, todo: FUTURE[todo.when] || todo.when === "deadline" ? `未来 · ${whenLabel(todo)}` : whenLabel(todo) };
    } else if (action === "labels") {
      const merged = [...new Set([...(current(id) || []), ...reading.labels])];
      if (!await relabel(id, merged)) throw new Error("标签没贴上，可以点「编辑」手动选");
      reading.done = { ...reading.done, labels: true };
    }
  } catch (error) { reading.error = error?.message || "没能完成，请稍后再试"; }
  reading.busy = false; repaint();
}
