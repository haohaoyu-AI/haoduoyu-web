import { api } from "../core/api.mjs";

// 新建标签后，AI 帮旧碎碎念补标签（想法 ②）. Under 标签管理: after a label is added (or 找旧的 is tapped next to one),
// AI lists older 碎碎念 that look like they belong to it. Nothing is labelled until the person taps 贴上.
let current = null, repaint = () => {};
export function setLabelBackfillRepaint(callback) { repaint = callback; }
export function labelBackfillState() { return current; }

/** Asks once for older notes that fit label; a newer request for another label replaces this one. */
export async function findOldNotes(label) {
  const reading = { label, status: "reading", items: [], picked: [], done: [], message: "", busy: false };
  current = reading; repaint();
  try {
    const data = await api("/note-entries/label-backfill", { method: "POST", body: { label } });
    if (current !== reading) return;
    reading.items = Array.isArray(data.items) ? data.items : [];
    reading.picked = reading.items.map(() => true);
    reading.status = data.off ? "off" : reading.items.length ? "ready" : "empty";
  } catch (error) {
    if (current !== reading) return;
    reading.status = "error"; reading.message = error?.message || "没能读完旧碎碎念，请稍后再试";
  }
  repaint();
}

const short = text => { const value = String(text || "").replace(/\s+/g, " ").trim(); return value.length > 80 ? value.slice(0, 80) + "…" : value; };
const day = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

export function paintLabelBackfill(root) {
  const box = root.querySelector("#notes-label-backfill");
  if (!box) return;
  const reading = current;
  box.hidden = !reading;
  if (!reading) { box.replaceChildren(); return; }
  const key = JSON.stringify([reading.label, reading.status, reading.picked, reading.done, reading.busy, reading.message]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  const make = (tag, className, text) => {
    const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node;
  };
  const button = (className, text, action, extra = {}) => {
    const node = make("button", className, text); node.type = "button"; node.dataset.labelBackfill = action;
    for (const [name, value] of Object.entries(extra)) node.dataset[name] = value; return node;
  };
  const head = make("p", "notes-backfill-head");
  const count = reading.picked.filter(Boolean).length, added = reading.done.filter(Boolean).length;
  const title = {
    reading: `AI 在翻以前的碎碎念，看哪些该贴「${reading.label}」…`,
    empty: `最近半年的碎碎念里，没找到明显该贴「${reading.label}」的。`,
    off: "AI 读碎碎念现在是关闭的（设置里的待办模型），没法帮忙找。",
    error: reading.message,
    ready: added ? `已给 ${added} 条贴上「${reading.label}」` : `这 ${reading.items.length} 条可能该贴「${reading.label}」，勾掉不要的再贴：`,
  }[reading.status];
  head.append(make("span", "", title));
  if (reading.status === "ready" && !added) {
    const apply = button("note-suggest-btn", count ? `贴上 ${count} 条` : "先勾要哪几条", "apply");
    apply.disabled = reading.busy || !count; head.append(apply);
  }
  if (reading.status !== "reading") {
    const close = button("note-suggest-close", "×", "close"); close.setAttribute("aria-label", "关闭"); head.append(close);
  }
  const parts = [head];
  if (reading.status === "ready") {
    const list = make("ul", "notes-backfill-list");
    reading.items.forEach((item, index) => {
      const line = make("li");
      if (reading.done[index] === true) line.append(make("span", "note-suggest-done", "✓"));
      else {
        const on = reading.picked[index] !== false;
        const pick = button("note-suggest-check", on ? "☑" : "☐", "pick", { labelBackfillIndex: String(index) });
        pick.disabled = reading.busy || added > 0; pick.setAttribute("aria-pressed", String(on));
        pick.setAttribute("aria-label", (on ? "不贴 " : "贴 ") + short(item.text)); line.append(pick);
      }
      const body = make("span", "note-suggest-text", short(item.text));
      body.prepend(make("small", "", `${day(item.date)} · ${item.category === "work" ? "工作" : "生活"}`));
      line.append(body); list.append(line);
    });
    parts.push(list);
  }
  if (reading.status === "ready" && reading.message) parts.push(make("p", "note-suggest-error", reading.message));
  box.replaceChildren(...parts);
}

/** A tap inside the panel. addLabel(item, label) saves one note's new label and resolves true when it did. */
export async function actOnLabelBackfill(target, { addLabel }) {
  const reading = current, action = target.dataset.labelBackfill;
  if (!reading) return;
  if (action === "close") { current = null; repaint(); return; }
  if (reading.busy || reading.status !== "ready") return;
  if (action === "pick") {
    const index = Number(target.dataset.labelBackfillIndex);
    if (!Number.isInteger(index) || !reading.items[index] || reading.done.some(Boolean)) return;
    reading.picked = reading.picked.map((on, at) => at === index ? !on : on); repaint(); return;
  }
  if (action !== "apply") return;
  reading.busy = true; reading.message = ""; repaint();
  let failed = 0;
  for (const [index, item] of reading.items.entries()) {
    if (reading.picked[index] === false || reading.done[index]) continue;
    let ok = false;
    try { ok = await addLabel(item, reading.label); } catch { ok = false; }
    reading.done[index] = ok; if (!ok) failed++;
    if (current !== reading) return;
    repaint();
  }
  reading.busy = false;
  if (failed) reading.message = `${failed} 条没贴上，可以去那天的碎碎念点「编辑」手动勾选。`;
  repaint();
}
