import { api } from "../core/api.mjs";
import { bjtDate } from "../core/format.mjs";
import { addFutureTodo } from "./unscheduled-todos.mjs";
import { smartDayLabel } from "./todo-smart.mjs";

// "AI 读碎碎念": after a 碎碎念 is sent it is read once; under it the page may offer a to-do it states or implies
// ("要不要约小黑见个面？") and suggested labels. Nothing is added or labelled until the person taps it.
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
  // Every sent note is read except very short ones and bowel/bladder logs, which are records, not plans.
  const record = (item?.labels || []).includes("大小便记录");
  if (!item?.id || [...text].length < 4 || record || readings.get(item.id)?.key === key) return;
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
  const make = (tag, className, text) => {
    const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node;
  };
  const head = make("p", "note-suggest-head", reading.status === "reading" ? "AI 正在看这条…" : "AI 看了这条");
  if (reading.status !== "reading") {
    const close = make("button", "note-suggest-close", "×"); close.type = "button";
    close.dataset.noteSuggest = "dismiss"; close.dataset.noteSuggestId = item.id;
    close.setAttribute("aria-label", reading.done.todo || reading.done.labels ? "关闭" : "忽略");
    head.append(close);
  }
  const parts = [head];
  // One row per offer: a tag, what was read, and either the button or what was done.
  const row = (tag, text, when, action, label, done) => {
    const line = make("div", "note-suggest-item");
    const body = make("span", "note-suggest-text", text); if (when) body.append(make("em", "", when));
    line.append(make("span", "note-suggest-tag", tag), body);
    if (done) line.append(make("span", "note-suggest-done", done));
    else {
      const button = make("button", "note-suggest-btn", label); button.type = "button"; button.disabled = Boolean(reading.busy);
      button.dataset.noteSuggest = action; button.dataset.noteSuggestId = item.id; line.append(button);
    }
    parts.push(line);
  };
  if (reading.status !== "reading") {
    if (reading.todo) {
      // A to-do read between the lines is offered as a friend's question.
      const text = reading.todo.inferred ? `要不要${reading.todo.text}？` : reading.todo.text;
      const when = reading.todo.inferred && reading.todo.when === "none" ? "" : whenLabel(reading.todo);
      row(reading.todo.inferred ? "灵感" : "待办", text, when, "todo", "加到待办", reading.done.todo ? `✓ 已加到 ${reading.done.todo}` : "");
    }
    if (reading.labels.length) row("标签", reading.labels.join("、"), "", "labels", "贴上", reading.done.labels ? "✓ 已贴上" : "");
    if (reading.error) parts.push(make("p", "note-suggest-error", reading.error));
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
