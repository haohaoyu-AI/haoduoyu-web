import { api } from "../core/api.mjs";
import { bjtDate } from "../core/format.mjs";
import { TODO_PARSE_HINT } from "../../shared/todo-parse-hint.mjs";

// "一句话加待办": a sentence that names a day, a count or "每天" is read by the model first.
// The reading is shown in one row under the input and nothing is saved until it is confirmed.
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const smart = { sentence: "", date: "", status: "", proposal: null, error: "", busy: false, sequence: 0 };
let hooks = null;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const shiftDay = (date, days) => new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
/** "今天", "明天", "后天", otherwise "11月20日 周五". */
export function smartDayLabel(date, today = bjtDate()) {
  if (date === today) return "今天";
  if (date === shiftDay(today, 1)) return "明天";
  if (date === shiftDay(today, 2)) return "后天";
  const weekday = WEEKDAYS[new Date(date + "T00:00:00Z").getUTCDay()];
  return `${date.slice(0, 4) === today.slice(0, 4) ? "" : date.slice(0, 4) + "年"}${Number(date.slice(5, 7))}月${Number(date.slice(8))}日 周${weekday}`;
}
/** The to-do text as it will be saved: a count becomes the "0/N 次" prefix the counter already understands. */
export function smartTodoText(proposal) {
  return proposal.count ? `0/${proposal.count} 次 ${proposal.text}` : proposal.text;
}
export function smartTodoWanted(text) {
  return TODO_PARSE_HINT.test(text);
}
/** True while a proposal for this exact sentence is on screen, so pressing Enter again confirms it. */
export function smartTodoReady(text) {
  return smart.status === "ready" && smart.sentence === text && !smart.busy;
}
export function clearSmartTodo() {
  smart.sequence++;
  Object.assign(smart, { sentence: "", date: "", status: "", proposal: null, error: "", busy: false });
}

/** hooks: save(day, request) adds to the shown day; saveElsewhere(request) adds to another day;
 * saveDaily(text) stores a 常用 item and adds it today; plain(day, text) adds the sentence as typed; repaint(). */
export async function startSmartTodo(day, sentence, given) {
  hooks = given;
  const sequence = ++smart.sequence;
  Object.assign(smart, { sentence, date: day.date, status: "reading", proposal: null, error: "", busy: false });
  hooks.repaint();
  try {
    const data = await api("/todo-parse", { method: "POST", body: { text: sentence } });
    if (sequence !== smart.sequence) return;
    if (!data.needs_model) { clearSmartTodo(); hooks.repaint(); await hooks.plain(day, sentence); return; }
    smart.status = "ready"; smart.proposal = data;
  } catch (error) {
    if (sequence !== smart.sequence) return;
    smart.status = "error"; smart.error = error?.message || "没能读懂这句话";
  }
  hooks.repaint();
}

export async function confirmSmartTodo(day) {
  const proposal = smart.proposal;
  if (!proposal || smart.busy || !hooks) return;
  smart.busy = true; smart.error = ""; hooks.repaint();
  const text = smartTodoText(proposal), sequence = smart.sequence;
  try {
    if (proposal.kind === "daily") await hooks.saveDaily(day, text);
    else if (proposal.date === day.date) await hooks.save(day, { id: crypto.randomUUID(), date: day.date, text });
    else await hooks.saveElsewhere(day, { id: crypto.randomUUID(), date: proposal.date, text }, smartDayLabel(proposal.date));
    if (sequence === smart.sequence) clearSmartTodo();
  } catch (error) {
    if (sequence === smart.sequence) { smart.busy = false; smart.error = error?.message || "添加失败，请稍后再试"; }
  }
  hooks.repaint();
}
async function plainSmartTodo(day) {
  const sentence = smart.sentence;
  clearSmartTodo(); hooks.repaint();
  await hooks.plain(day, sentence);
}

function summary(proposal) {
  const text = smartTodoText(proposal);
  if (proposal.kind === "daily") return [["存为常用并加到今天", ""], [text, "todo-smart-text"]];
  return [[`加到 ${smartDayLabel(proposal.date)}`, "todo-smart-day"], [text, "todo-smart-text"]];
}
/** Kept right under the add form; drawn again on every to-do repaint. */
export function paintSmartTodo(root, day) {
  const form = root.querySelector("#todo-form");
  let row = root.querySelector("#todo-smart");
  if (!smart.status || smart.date !== day.date || !form) { row?.remove(); return; }
  if (!row) { row = el("div", "todo-smart"); row.id = "todo-smart"; row.setAttribute("role", "status"); }
  if (form.nextElementSibling !== row) form.after(row);
  const key = [smart.sequence, smart.status, smart.busy, smart.error].join("|");
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  const parts = [];
  if (smart.status === "reading") parts.push(el("span", "todo-smart-wait", "正在看这句话…"));
  else if (smart.status === "ready") {
    const line = el("p", "todo-smart-line");
    for (const [text, className] of summary(smart.proposal)) line.append(el("span", className, text));
    parts.push(line);
    if (smart.proposal.kind === "daily") parts.push(el("p", "todo-smart-hint", "常用里一点就能加到当天，不会自动每天出现。"));
  } else parts.push(el("p", "todo-smart-error", `${smart.error}，可以按原文添加。`));
  if (smart.error && smart.status === "ready") parts.push(el("p", "todo-smart-error", smart.error));
  const actions = el("div", "todo-smart-actions"), button = (label, className, run) => {
    const node = el("button", className, label); node.type = "button"; node.disabled = smart.busy;
    node.addEventListener("click", run); actions.append(node);
  };
  if (smart.status === "ready") button(smart.busy ? "正在添加…" : "确认", "btn primary", () => void confirmSmartTodo(day));
  if (smart.status !== "reading") button("按原文添加", "btn text", () => void plainSmartTodo(day));
  button("取消", "btn text", () => { clearSmartTodo(); hooks?.repaint(); });
  parts.push(actions);
  row.replaceChildren(...parts);
}
