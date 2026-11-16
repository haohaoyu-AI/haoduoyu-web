import { api } from "../core/api.mjs";
import { bjtDate } from "../core/format.mjs";
import { TODO_PARSE_HINT } from "../../shared/todo-parse-hint.mjs";

// "一句话加待办": a sentence that names a day, a rough time, a repeat, a deadline or a count is read by the model first.
// 今日 and 未来 share this reader; the reading is shown in one row under that page's input and nothing is saved until
// it is confirmed. A sentence without any time goes where it was typed: today on 今日, 不定 on 未来.
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
export const FUTURE_SCOPE = "future";
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
/** The to-do text as it will be saved. */
export function smartTodoText(proposal) {
  return proposal.text;
}
/** A count is kept where the counter reads it, at the front of the note ("0/4 次", "0/∞ 次"), never in the title. */
export function smartTodoNote(proposal) {
  return proposal.count ? `0/${proposal.count} 次` : "";
}
const countLabel = proposal => proposal.count === "∞" ? "不限次数" : proposal.count ? `${proposal.count} 次` : "";
const FUTURE_LABEL = { this_week: "本周", next_week: "下周", this_month: "本月", next_month: "下个月", every_week: "每周重复",
  every_month: "每月重复" };
/** Where a confirmed reading goes: "today", "day" (another date), "future" (未来待办) or "daily" (常用). */
export function smartTarget(proposal, scope) {
  if (proposal.kind === "daily") return "daily";
  if (proposal.when === "day" && proposal.date) return scope !== FUTURE_SCOPE && proposal.date === scope ? "today" : "day";
  if (FUTURE_LABEL[proposal.when] || proposal.when === "deadline") return "future";
  return scope === FUTURE_SCOPE ? "future" : "today";
}
/** The words in front of the reading: "加到 明天", "加到 未来 · 下周", "加到 未来 · 12/16 截止". */
export function smartPlace(proposal, scope, today = bjtDate()) {
  const target = smartTarget(proposal, scope);
  if (target === "daily") return "存为常用并加到今天";
  if (target === "today") return `加到 ${smartDayLabel(scope === FUTURE_SCOPE ? today : scope, today)}`;
  if (target === "day") return `加到 ${smartDayLabel(proposal.date, today)}`;
  if (proposal.when === "deadline") return `加到 未来 · ${Number(proposal.due_date.slice(5, 7))}/${Number(proposal.due_date.slice(8))} 截止`;
  return `加到 未来 · ${FUTURE_LABEL[proposal.when] || "不定"}`;
}
export function smartTodoWanted(text) {
  return TODO_PARSE_HINT.test(text);
}
/** True while a proposal for this exact sentence is on screen for this scope, so pressing Enter again confirms it. */
export function smartTodoReady(text, scope) {
  return smart.status === "ready" && smart.sentence === text && !smart.busy && (scope === undefined || smart.date === scope);
}
/** True while a sentence typed in this scope is being read or waits for confirmation. */
export function smartTodoActive(scope) {
  return Boolean(smart.status) && smart.date === scope;
}
export function clearSmartTodo() {
  smart.sequence++;
  Object.assign(smart, { sentence: "", date: "", status: "", proposal: null, error: "", busy: false });
}

/** day is the shown day ({date}) on 今日, or {date: FUTURE_SCOPE} on 未来.
 * hooks: save(day, request, note) adds to the shown day; saveElsewhere(day, request, label, note) adds to another day;
 * saveDaily(day, text, note) stores a 常用 item and adds it today; saveFuture(day, proposal, label) adds to 未来待办;
 * plain(day, text) adds the sentence as typed; repaint(). */
export async function startSmartTodo(day, sentence, given) {
  hooks = given;
  const sequence = ++smart.sequence;
  Object.assign(smart, { sentence, date: day.date, status: "reading", proposal: null, error: "", busy: false });
  hooks.repaint();
  try {
    const context = day.date === FUTURE_SCOPE ? "future" : "today";
    const data = await api("/todo-parse", { method: "POST", body: { text: sentence, context } });
    if (sequence !== smart.sequence) return;
    if (!data.needs_model) { clearSmartTodo(); hooks.repaint(); await hooks.plain(day, sentence, data); return; }
    smart.status = "ready"; smart.proposal = data;
  } catch (error) {
    if (sequence !== smart.sequence) return;
    smart.status = "error"; smart.error = error?.message || "没能读懂这句话";
  }
  hooks.repaint();
}

export async function confirmSmartTodo(day) {
  const proposal = smart.proposal;
  if (!proposal || smart.busy || !hooks || smart.date !== day.date) return;
  smart.busy = true; smart.error = ""; hooks.repaint();
  const text = smartTodoText(proposal), note = smartTodoNote(proposal), sequence = smart.sequence, target = smartTarget(proposal, day.date);
  try {
    if (target === "daily") await hooks.saveDaily(day, text, note);
    else if (target === "today") {
      const date = day.date === FUTURE_SCOPE ? bjtDate() : day.date;
      if (day.date === FUTURE_SCOPE) await hooks.saveElsewhere(day, { id: crypto.randomUUID(), date, text }, "今天", note);
      else await hooks.save(day, { id: crypto.randomUUID(), date, text }, note);
    } else if (target === "day") await hooks.saveElsewhere(day, { id: crypto.randomUUID(), date: proposal.date, text }, smartDayLabel(proposal.date), note);
    else await hooks.saveFuture(day, proposal, smartPlace(proposal, day.date).replace(/^加到 /, ""));
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

function summary(proposal, scope) {
  const text = smartTodoText(proposal), count = countLabel(proposal);
  const parts = [[smartPlace(proposal, scope), "todo-smart-day"], [text, "todo-smart-text"]];
  if (count) parts.push([`计数：${count}`, "todo-smart-count"]);
  return parts;
}
function hint(proposal, scope) {
  if (proposal.kind === "daily") return proposal.count ? "常用里一点就能加到当天，计数会自动从 0 开始。" : "常用里一点就能加到当天，不会自动每天出现。";
  if (smartTarget(proposal, scope) !== "future") return "";
  if (proposal.when === "deadline") return "截止前三天起，每天都会出现在今日，直到你点完成。";
  if (proposal.recurrence) return `做完后会自动出现${proposal.recurrence === "week" ? "下周" : "下个月"}的一条。`;
  return "";
}
/** Kept right under the page's add form; drawn again on every repaint of that page. */
export function paintSmartTodo(root, day) {
  const future = day.date === FUTURE_SCOPE, id = future ? "todo-smart-future" : "todo-smart";
  const form = root.querySelector(future ? "#todo-future-form" : "#todo-form");
  let row = root.querySelector("#" + id);
  if (!smart.status || smart.date !== day.date || !form) { row?.remove(); return; }
  if (!row) { row = el("div", "todo-smart"); row.id = id; row.setAttribute("role", "status"); }
  if (form.nextElementSibling !== row) form.after(row);
  const key = [smart.sequence, smart.status, smart.busy, smart.error].join("|");
  if (row.dataset.key === key) return;
  row.dataset.key = key;
  const parts = [];
  if (smart.status === "reading") parts.push(el("span", "todo-smart-wait", "正在看这句话…"));
  else if (smart.status === "ready") {
    const line = el("p", "todo-smart-line");
    for (const [text, className] of summary(smart.proposal, day.date)) line.append(el("span", className, text));
    parts.push(line);
    const tip = hint(smart.proposal, day.date);
    if (tip) parts.push(el("p", "todo-smart-hint", tip));
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
