import { state } from "./state.mjs";
import { todoOwner } from "./todos-state.mjs";
const todoTemplatesState = { owner: "" };
function templateState() {
  const owner = todoOwner();
  if (todoTemplatesState.owner !== owner) {
    Object.assign(todoTemplatesState, { owner, items: [], loaded: false, loading: false, sequence: 0, revision: 0,
      draft: "", create: null, adding: false, error: "", editing: null, editDraft: "", pending: new Set(), readDate: "", readVersion: -1 });
  }
  return todoTemplatesState;
}
function templateSessionActive(owner) {
  return Boolean(state.me) && owner === todoOwner() && owner === todoTemplatesState.owner;
}
function mergeTodoTemplate(item) {
  const store = templateState(), index = store.items.findIndex((row) => row.id === item.id);
  if (index < 0) store.items.push(item);
  else if (store.items[index].version <= item.version) store.items[index] = item;
}
export { mergeTodoTemplate, templateSessionActive, templateState, todoTemplatesState };
