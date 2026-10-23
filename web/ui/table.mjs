import { e } from "../core/dom.mjs";
import { state } from "../core/state.mjs";
function sortHeading(key, label) {
  return `<button class="sort-heading" data-action="sort-column" data-sort="${e(key)}" aria-label="按${e(label)}排序">${e(label)} ${state.
  filters.sort === key ? state.filters.order === "asc" ? "↑" : "↓" : "↕"}</button>`;
}
function dataTable(className, header, body, scrollClass = "table-scroll", bodyClass = null) {
  return `<div class="${scrollClass}"><table class="${className}"><thead><tr>${header()}</tr></thead>\
<tbody${bodyClass === null ? "" : ` class="${bodyClass}"`}>${body()}</tbody></table></div>`;
}
function metricTableCell(escapedLabel, content) {
  return `<td data-label="${escapedLabel}">${content()}</td>`;
}
function articleIdentityCell(article, lead = null, meta = null) {
  return `<td class="title-cell">${lead ? lead() : ""}\
<button class="article-link" data-action="article-detail" data-id="${e(article.id)}">${e(article.title)}</button>\
${meta ? meta() : ""}</td>`;
}
export {
  articleIdentityCell, dataTable, metricTableCell,
  sortHeading
};
