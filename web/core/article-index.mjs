import {api} from './api.mjs';
import {articleIndexes} from './session-index-state.mjs';
import {runtime, state} from './state.mjs';
import {backgroundRequests} from './requests.mjs';
const indexRequests = new WeakMap();
async function articleIndex(query = '', context) {
  const identity = state.me?.id, generation = runtime.articleIndexGeneration;
  if (!identity) throw Object.assign(new Error('索引会话已失效'), {staleIndex: true});
  const scope = context || backgroundRequests();
  const params = new URLSearchParams(Object.entries(Object.fromEntries(new URLSearchParams(query)))
    .sort(([a], [b]) => a.localeCompare(b)));
  params.set('fields', 'index');
  const key = identity + ':' + params.toString();
  let pending = articleIndexes.get(key);
  const owner = pending && indexRequests.get(pending);
  if (owner && !owner.done && owner.scope !== scope) pending = null;
  if (!pending) {
    const entry = {scope, done: false};
    pending = api('/articles?' + params, {context: scope}).then(rows => {
      entry.done = true;
      return Object.freeze(rows.map(row => Object.freeze(row)));
    });
    indexRequests.set(pending, entry);
    articleIndexes.set(key, pending);
    if (articleIndexes.size > 10) articleIndexes.delete(articleIndexes.keys().next().value);
    pending.catch(() => {if (articleIndexes.get(key) === pending) articleIndexes.delete(key);});
  }
  const rows = await pending;
  if (generation !== runtime.articleIndexGeneration || identity !== state.me?.id) {
    if (!state.me || identity !== state.me.id) throw Object.assign(new Error('索引会话已失效'), {staleIndex: true});
    return articleIndex(query, context);
  }
  return rows;
}
export {articleIndex};
