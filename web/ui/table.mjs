import { e } from "../core/dom.mjs";
import { state } from "../core/state.mjs";
function sortHeading(key, label) {
  return `<button class="sort-heading" data-action="sort-column" data-sort="${e(key)}" aria-label="按${e(label)}排序">${e(label)} ${state.filters.sort === key ? state.filters.order === "asc" ? "↑" : "↓" : "↕"}</button>`;
}
export {
  sortHeading
};
