import { api } from "./api.mjs";
import { articleIndexes } from "./session-index-state.mjs";
import { runtime, state } from "./state.mjs";
async function articleIndex(query = "") {
  const identity = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query))).sort(([a], [b]) => a.localeCompare(b)));
  params.set("fields", "index");
  const key = identity + ":" + params.toString();
  let pending = articleIndexes.get(key);
  if (!pending) {
    pending = api("/articles?" + params).then((rows) => Object.freeze(rows.map((row) => Object.freeze(row))));
    articleIndexes.set(key, pending);
    if (articleIndexes.size > 10) articleIndexes.delete(articleIndexes.keys().next().value);
    pending.catch(() => {
      if (articleIndexes.get(key) === pending) articleIndexes.delete(key);
    });
  }
  const rows = await pending;
  if (generation !== runtime.articleIndexGeneration || identity !== state.me?.id) {
    if (!state.me || identity !== state.me.id) throw Object.assign(new Error("索引会话已失效"), { staleIndex: true });
    return articleIndex(query);
  }
  return rows;
}
export {
  articleIndex
};
