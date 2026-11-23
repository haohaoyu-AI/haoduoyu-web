// 想法池: every 碎碎念 labelled 想法池 on one page. An idea becomes one or more 待办 here (转成待办);
// once every linked 待办 is done it shows as 已落地. The ideas themselves stay ordinary 碎碎念.
import { api } from "../core/api.mjs";
import { e } from "../core/dom.mjs";
import { bjtDate } from "../core/format.mjs";
import { replacePageContent } from "../ui/entry.mjs";
import { closeModal, openModal } from "../ui/modal.mjs";
import { toast } from "../ui/toast.mjs";
import { smartDayLabel } from "./todo-smart.mjs";
import { settleQueuedTodo } from "./todo-actions.mjs";

const FILTERS = [["all", "全部"], ["idea", "想法"], ["todo", "已转待办"], ["landed", "已落地"]];
const view = { items: [], total: 0, truncated: false, filter: "all", open: new Set(), loaded: false, error: "" };

const day = value => value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : "";
// The first line is the idea's name; a leading 「想法 ⑧：」 is kept as written.
// A first line such as 「✅ 已落地 11/19」 is a stamp, not the name; the status already says it.
const stamp = line => /^\s*✅/.test(line);
function titleIndex(lines) {
  const index = lines.findIndex(line => line.trim() && !stamp(line));
  return index >= 0 ? index : lines.findIndex(line => line.trim());
}
export function ideaTitle(text) {
  const lines = String(text || "").split("\n"), index = titleIndex(lines);
  return index >= 0 ? lines[index].trim() : "（空）";
}
function ideaBody(text) {
  const lines = String(text || "").split("\n"), index = titleIndex(lines);
  return lines.slice(index + 1).filter(line => !/^\s*(状态|优先级)[：:]/.test(line)).join("\n").trim();
}
// What 转成待办 offers by default: the name without a 「想法 ⑧：」 style prefix.
export function todoTextFor(text) {
  return ideaTitle(text).replace(/^想法\s*[^：:]{0,4}[：:]\s*/, "").slice(0, 500) || ideaTitle(text).slice(0, 500);
}
function todoLine(todo) {
  const when = todo.kind === "future" ? "未来待办" : smartDayLabel(todo.date, bjtDate());
  return `<li class="idea-todo${todo.completed ? " done" : ""}${todo.deleted ? " gone" : ""}"><span class="idea-todo-mark" aria-hidden="true">${
    todo.deleted ? "×" : todo.completed ? "✓" : "○"}</span><span class="idea-todo-text">${e(todo.text)}</span><em>${
    todo.deleted ? "已删除" : e(when)}</em></li>`;
}
function card(item) {
  const body = ideaBody(item.text), open = view.open.has(item.id), long = body.length > 120 || body.split("\n").length > 3;
  const stars = item.priority ? `<span class="idea-stars" aria-label="优先级 ${item.priority} 星">${"⭐".repeat(Math.min(item.priority, 5))}</span>` : "";
  const landed = item.status === "landed" ? `<span class="idea-landed-at">${e(day(bjtDate(item.landed_at || Date.now())))}落地</span>` : "";
  return `<article class="idea-card" data-status="${e(item.status)}" data-idea="${e(item.id)}">
<header class="idea-card-head"><span class="idea-status idea-status-${e(item.status)}">${e(item.label)}</span>${stars}
<time datetime="${e(item.created_at)}">${e(day(item.date))}</time>${landed}</header>
<h3 class="idea-title">${e(ideaTitle(item.text))}</h3>
${body ? `<p class="idea-body${long && !open ? " clamped" : ""}">${e(body)}</p>${long ? `<button class="btn text small" type="button" data-action="idea-expand" data-id="${
  e(item.id)}">${open ? "收起" : "展开"}</button>` : ""}` : ""}
${item.todos.length ? `<ul class="idea-todos" aria-label="关联的待办">${item.todos.map(todoLine).join("")}</ul>` : ""}
<footer class="idea-card-foot"><a class="btn text small" href="/?page=notes&date=${e(item.date)}${item.category === "work" ? "&notes_category=work" : ""}">在碎碎念里看</a>
${item.status === "landed" ? "" : `<button class="btn small primary" type="button" data-action="idea-todo" data-id="${e(item.id)}">转成待办</button>`}</footer>
</article>`;
}
export function renderIdeas(state = view) {
  if (!state.loaded && !state.error) return '<section class="ideas-page" aria-busy="true"><p class="muted">正在读取想法池…</p></section>';
  if (state.error) return `<section class="ideas-page"><p class="form-message" role="alert">${e(state.error)}</p>
<button class="btn" type="button" data-action="ideas-reload">重新读取</button></section>`;
  const counts = Object.fromEntries(FILTERS.map(([id]) => [id, id === "all" ? state.items.length : state.items.filter(item => item.status === id).length]));
  const shown = state.items.filter(item => state.filter === "all" || item.status === state.filter);
  const tabs = FILTERS.map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.filter === id}" data-action="ideas-filter" data-filter="${
    id}">${label}<span>${counts[id]}</span></button>`).join("");
  const empty = state.items.length ? `<p class="ideas-empty">这一栏还没有想法。</p>` :
    `<div class="ideas-empty"><p>想法池还是空的。</p><p class="muted">在碎碎念里点一条下面的「放进想法池」，它就会出现在这里。</p></div>`;
  return `<section class="ideas-page">
<p class="ideas-intro">碎碎念里贴了「想法池」标签的都在这里。想好了就「转成待办」，待办都做完，想法就算落地了。</p>
<div class="ideas-filters" role="tablist" aria-label="按状态看">${tabs}</div>
${state.truncated ? `<p class="muted">只显示最新的 ${state.items.length} 条（共 ${state.total} 条）。</p>` : ""}
<div class="ideas-list">${shown.length ? shown.map(card).join("") : empty}</div>
</section>`;
}
function paint() { replacePageContent(renderIdeas()); }
export async function loadIdeas(context) {
  view.error = "";
  try {
    const data = await api("/ideas", { context });
    Object.assign(view, { items: data.items || [], total: data.total || 0, truncated: Boolean(data.truncated), loaded: true });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    view.error = error?.message || "想法池没读出来，请稍后再试。";
  }
  return renderIdeas();
}
export function setIdeasFilter(filter) {
  if (FILTERS.some(([id]) => id === filter)) { view.filter = filter; paint(); }
}
export function toggleIdea(id) {
  if (view.open.has(id)) view.open.delete(id); else view.open.add(id);
  paint();
}
export async function reloadIdeas() { view.loaded = false; paint(); await loadIdeas(); paint(); }

export function openIdeaTodo(id) {
  const item = view.items.find(row => row.id === id);
  if (!item) return;
  const today = bjtDate(), tomorrow = bjtDate(Date.now() + 864e5);
  openModal("转成待办", `<form id="idea-todo-form" data-id="${e(id)}">
<p class="muted idea-todo-source">来自想法：${e(ideaTitle(item.text))}</p>
<label for="idea-todo-text">待办内容</label>
<input class="input" id="idea-todo-text" name="text" maxlength="500" required value="${e(todoTextFor(item.text))}" autocomplete="off">
<fieldset class="idea-todo-when"><legend>什么时候做</legend>
<label><input type="radio" name="when" value="future" checked> 未来待办（先不定日子）</label>
<label><input type="radio" name="when" value="${today}"> 今天</label>
<label><input type="radio" name="when" value="${tomorrow}"> 明天</label>
<label><input type="radio" name="when" value="pick"> 选日子 <input class="input" type="date" name="date" min="${today}" aria-label="选日子"></label>
</fieldset>
<p class="muted">待办做完后，这条想法会自动显示「已落地」。原来的碎碎念不会被改动。</p>
<p class="form-message" role="alert"></p>
<div class="form-actions"><button class="btn primary" type="submit">转成待办</button></div></form>`);
}
export async function submitIdeaTodo({ form, data }) {
  const id = form.dataset.id, message = form.querySelector(".form-message"), button = form.querySelector("button[type=submit]");
  const text = String(data.text ?? "").replace(/\r?\n/g, " ").trim();
  const date = data.when === "pick" ? data.date : data.when;
  if (!text || text.length > 500) { message.textContent = "待办内容需要 1 至 500 个字"; return; }
  if (date !== "future" && !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) { message.textContent = "请选一个日子"; return; }
  if (button.disabled) return;
  button.disabled = true; message.textContent = "";
  let todo = null;
  try {
    todo = date === "future"
      ? await api("/unscheduled-todos", { method: "POST", body: { id: crypto.randomUUID(), text } })
      : await api("/todos", { method: "POST", body: { id: crypto.randomUUID(), date, text } });
    // A new 待办 may first wait in the offline queue; link it once the server has it.
    await settleQueuedTodo(date === "future" ? "unscheduled_todo" : "todo", todo.id);
    let linked = null;
    for (let attempt = 0; !linked; attempt++) {
      try { linked = await api(`/ideas/${encodeURIComponent(id)}/todos`, { method: "POST", body: { todo_id: todo.id } }); }
      catch (error) { if (error?.status !== 404 || attempt >= 5) throw error; await new Promise(done => setTimeout(done, 800)); }
    }
    const index = view.items.findIndex(row => row.id === id);
    if (index >= 0) view.items[index] = linked;
    closeModal(); paint();
    toast(date === "future" ? "已转成未来待办" : `已加到${smartDayLabel(date, bjtDate())}的待办`);
  } catch (error) {
    // A 待办 that was made but not linked stays a 待办; say so rather than make it twice.
    message.textContent = todo ? "待办已经建好了，但没能和这条想法连上。请稍后在想法池里刷新看看。" : error?.message || "没转成，请稍后再试。";
  } finally { button.disabled = false; }
}
