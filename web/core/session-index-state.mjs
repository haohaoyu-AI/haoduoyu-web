import { cancelPageRequests } from "./requests.mjs";
import { runtime, state } from "./state.mjs";
import { resetTodos } from "./todos-state.mjs";
const articleIndexes = /* @__PURE__ */ new Map();
function clearArticleIndexes() {
  runtime.articleIndexGeneration++;
  articleIndexes.clear();
  state.reviewArticles = [];
}
function resetSessionIndexes() {
  cancelPageRequests();
  runtime.sessionEpoch++;
  resetTodos();
  clearArticleIndexes();
}
export {
  articleIndexes,
  clearArticleIndexes,
  resetSessionIndexes
};
