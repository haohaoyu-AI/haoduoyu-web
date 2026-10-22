import { platforms } from "../core/constants.mjs";
import { e } from "../core/dom.mjs";
function segmented(action, items, selected, label, attribute = "tab", classes = "") {
  return `<div class="segmented${classes ? " " + e(classes) : ""}" role="group" aria-label="${e(label)}">${items.map(([value, text]) => `<bu\
tton type="button" class="btn" data-action="${e(action)}" data-${e(attribute)}="${e(value)}" aria-pressed="${selected === value}">${e(text)}\
</button>`).join("")}</div>`;
}
function platformFilter(action, selected, label = "平台") {
  return segmented(action, [["", "全部"], ...Object.entries(platforms)], selected, label, "platform");
}
export {
  platformFilter,
  segmented
};
