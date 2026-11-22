import {fail} from './security.mjs';

export const desktopTodoGuard='desktop-todo-expected-scope-v1';
export const desktopTodoTextGuard='desktop-todo-text-v1';

// Callers supply the read revision of a snapshot or the guarded write transaction.
export async function resolveWorkbenchScope(store,access,memosOwnerId,budget) {
  const control=await store.get('SELECT initialized FROM matrix_control WHERE id=1');
  if(control?.initialized!==1)fail(503,'SETUP_REQUIRED','数据库尚未就绪');
  const scope=await access.resolve(store);
  if(!await store.get('SELECT id FROM matrix_users WHERE id=?',memosOwnerId))
    fail(503,'SNAPSHOT_CONFIG','备忘录数据归属无法核实');
  const scope_id=budget.hash(['haoduoyu-workbench-scope-v1',scope.scope_id,memosOwnerId]);
  return {...scope,memosOwnerId,scope_id};
}
