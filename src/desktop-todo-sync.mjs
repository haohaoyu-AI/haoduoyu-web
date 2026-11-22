import {fail} from './security.mjs';
import {snapshotAccess} from './snapshot-access.mjs';
import {snapshotBudget} from './snapshot-budget.mjs';
import {memosOwner} from './memos-validation.mjs';
import {resolveWorkbenchScope} from './workbench-scope.mjs';
import {publicBusinessAccess} from './public-business.mjs';
import {handleTodos} from './todos.mjs';

export const desktopSyncPrefix='/desktop-sync/v1';
const item=/^\/todos\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\/(note|restore|text))?$/;

export async function handleDesktopTodos(db,request,route,env,origin) {
  const path=route.slice(desktopSyncPrefix.length);
  const target=item.exec(path);
  const method=request.method;
  const editingText=target?.[1]==='text'&&method==='PATCH';
  const allowed=path==='/todos'&&method==='POST' || target&&(
    !target[1]&&(method==='PATCH'||method==='DELETE') ||
    target[1]==='note'&&method==='PATCH' || editingText || target[1]==='restore'&&method==='POST');
  if(!allowed)fail(404,'NOT_FOUND','桌面同步操作不存在');
  if(env.PUBLIC_BUSINESS_MODE!=='1'||request.headers.has('Cookie')||request.headers.has('Authorization'))
    fail(403,'DESKTOP_PUBLIC_ONLY','此接口仅接受已绑定的公开工作区');
  const expected=request.headers.get('X-Expected-Workspace-Scope');
  if(!/^[a-f0-9]{64}$/.test(expected??''))fail(412,'DESKTOP_SCOPE_GUARD_REQUIRED','缺少有效的预期工作区');
  const access=await publicBusinessAccess(db,request,path,env,origin,{desktopTodoText:editingText});
  if(!access||access.actor.kind!=='public')fail(403,'DESKTOP_PUBLIC_ONLY','公开工作区不可用');
  const owner=memosOwner(env);
  // mutate() checks the global revision and aborts the complete D1 batch on a race.
  // Resolve again on every attempt, including replayed creates and no-op mutations.
  async function checkScope(store,actor) {
    const scope=await resolveWorkbenchScope(store,snapshotAccess(request,env),owner,snapshotBudget());
    if(scope.mode!=='public'||scope.ownerId!==actor.id||scope.scope_id!==expected)
      fail(412,'WORKSPACE_SCOPE_MISMATCH','工作区已变化，本次待办操作未提交');
  }
  return handleTodos(db,access.request,path,origin,undefined,checkScope);
}
