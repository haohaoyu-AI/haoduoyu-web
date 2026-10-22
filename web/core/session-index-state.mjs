import { runtime, state } from "./state.mjs";
const articleIndexes = /* @__PURE__ */ new Map();
function clearArticleIndexes() {
  runtime.articleIndexGeneration++;
  articleIndexes.clear();
  state.reviewArticles = [];
}
function resetSessionIndexes() {
  runtime.sessionEpoch++;
  clearArticleIndexes();
}
export {
  articleIndexes,
  clearArticleIndexes,
  resetSessionIndexes
};
