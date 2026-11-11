import {api,apiNetwork} from '../core/api.mjs';
import {$,e} from '../core/dom.mjs';
import {runtime,state} from '../core/state.mjs';
import {validTodoDate,mergeTodo,todosState,todoOwner} from '../core/todos-state.mjs';
import {bjtDate} from '../core/format.mjs';
import {getOfflineRuntime} from '../offline/runtime.mjs';
import {toast} from '../ui/toast.mjs';

const cache={owner:'',items:[],draft:'',loaded:false,loading:false,error:'',notice:'',pending:false,request:null,dates:{},uncertain:{}};
const owner=()=>JSON.stringify([runtime.sessionEpoch,state.me?.id??null,getOfflineRuntime()?.state.scope??null]);
function current() {
  const key=owner();
  if(cache.owner!==key)Object.assign(cache,{owner:key,items:[],draft:'',loaded:false,loading:false,error:'',notice:'',pending:false,request:null,dates:{},
    uncertain:{}});
  return cache;
}
const visible=()=>Boolean(state.me)&&state.page==='todos'&&state.todoPanel==='future';
export function renderUnscheduledTodos() {
  const v=current();
  return `<section id="todo-future" aria-label="未来待办" ${visible()?'':'hidden'}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<button class="btn primary" type="submit" ${v.pending?'disabled':''}>添加</button></form>
<p class="todo-future-help">勾选完成后移至今日待办（需联网）；也可选择日期移动。</p>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
export function paintUnscheduledTodos() {
  const v=current(),root=$('#todo-future');if(!root)return;
  root.hidden=!visible();
  const input=$('#todo-future-text',root),button=$('#todo-future-form button',root),status=$('#todo-future-status',root),
    error=$('#todo-future-error',root),list=$('#todo-future-items',root);
  if(input&&document.activeElement!==input&&input.value!==v.draft)input.value=v.draft;
  if(button)button.disabled=v.pending;
  if(status)status.textContent=v.notice || (v.loading&&!v.loaded?'':v.loaded&&v.items.length===0?'还没有未来待办。':'');
  if(error)error.textContent=v.error;
  if(list)list.innerHTML=v.items.filter(x=>!x.deleted_at&&!x.deleted).map(x=>`<li class="daily-todo-row${x.completed?' is-complete':''}">
<label><input type="checkbox" data-future-todo-id="${e(x.id)}" ${x.completed?'checked':''} ${v.pending||v.uncertain[x.id]?'disabled':''}>
<span class="daily-todo-text">${e(x.text)}</span></label><div class="todo-future-schedule"><input class="input" type="date" data-future-date-id="${e(x.id)}" ` +
  `value="${e(v.dates[x.id] || '')}" aria-label="为 ${e(x.text)} 选择日期" ${v.pending||v.uncertain[x.id]?'disabled':''}><button class="btn small" type="button" ` +
    `data-action="todo-future-schedule" data-id="${e(x.id)}" ${v.pending?'disabled':''}>${v.uncertain[x.id]?'核实移动结果':'移至该日期'}</button></div><button ` +
      `class="icon-button" type="button"
 data-action="todo-future-delete" data-id="${e(x.id)}" aria-label="删除 ${e(x.text)}" ${v.pending||v.uncertain[x.id]?'disabled':''}>×</button></li>`).join('');
}
export async function loadUnscheduledTodos() {
  if(!visible())return;
  const v=current(),key=v.owner;if(v.loading)return;v.loading=true;v.error='';paintUnscheduledTodos();
  try {const data=await api('/unscheduled-todos');if(v.owner!==key||owner()!==key||!Array.isArray(data.items))return;
    const ids=new Set(data.items.map(item=>item.id));
    v.items=[...data.items,...Object.values(v.uncertain).map(item=>item.row).filter(item=>!ids.has(item.id))];v.loaded=true;}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession&&error.name!=='AbortError')v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.loading=false;paintUnscheduledTodos();}}
}
export function inputUnscheduledTodo(el) {
  if(el.id==='todo-future-text')current().draft=el.value;
  if(el.dataset?.futureDateId)current().dates[el.dataset.futureDateId]=el.value;
}
function moved(row,date,source,todo,complete = false) {
  const completed=complete ? true : row.completed;
  return source?.id === row.id && source.text === row.text && source.version === row.version + 1 &&
    source.completed === completed && typeof source.deleted_at === 'string' &&
    todo?.id === row.id && todo.date === date && todo.text === row.text && todo.deleted_at === null &&
    Number.isSafeInteger(todo.version) && todo.version >= 1 && todo.completed === completed &&
    Number.isFinite(Date.parse(todo.created_at)) && Number.isFinite(Date.parse(todo.updated_at));
}
function unchanged(row,source) {
  return source?.id === row.id && source.text === row.text && source.version === row.version &&
    source.completed === row.completed && source.deleted_at === null;
}

// Only a matching server tombstone and dated row can confirm an uncertain move.
export async function verifyFutureMove(row,date,{readSource,readDay,guard = () => {},complete = false}) {
  try {
    const source = await readSource(row.id); guard();
    const day = await readDay(date); guard();
    const todo = Array.isArray(day?.items) ? day.items.find(item => item.id === row.id) : null;
    if (moved(row,date,source,todo,complete)) return {state:'confirmed',source,todo};
    const compatible = !todo || todo.date === date && todo.text === row.text && (complete || todo.completed === row.completed) &&
      todo.deleted_at === null && !todo.template_id;
    return unchanged(row,source) && day?.date === date && Array.isArray(day.items) && compatible ?
      {state:'retryable'} : {state:'unknown',source};
  } catch { return {state:'unknown'}; }
}

export async function planFutureMove(row,date,{checkReady,move,readSource,readDay,guard = () => {},priorUncertain = false,complete = false}) {
  if (!validTodoDate(date)) return {state:'not_started',reason:'请选择有效日期'};
  try { await checkReady(row); guard(); }
  catch (error) {
    if (error.staleSession) return {state:'cancelled'};
    if (priorUncertain) return {state:'unknown'};
    if (error.status===429 || error.code==='NETWORK_UNAVAILABLE' || error.name==='AbortError')
      return {state:'not_started',reason:error.message || '请稍后重试'};
    try { const source = await readSource(row.id); guard();
      if (source?.id === row.id && source.deleted_at === null) return {state:'failed',reason:error.message || '暂时无法核对数据'};
    } catch {}
    return {state:'not_started',reason:error.message || '暂时无法核对数据'};
  }
  try {
    const result = await move(row.id,{date,version:row.version}); guard();
    if (moved(row,date,result?.source,result?.todo,complete)) return {state:'confirmed',...result};
  } catch (error) {
    if (error.staleSession) return {state:'unknown'};
    // A rate-limited request was rejected before mutation. Do not immediately
    // issue more reads while the server asks the client to wait.
    if (error.status===429) return priorUncertain ? {state:'unknown'} : {state:'not_started',reason:error.message || '请求较多，请稍后重试'};
    // An explicit non-timeout 4xx proves this request did not commit; check
    // the live source before saying it is retained.
    if (!priorUncertain && error.status >= 400 && error.status < 500 && ![408,425].includes(error.status)) {
      try { const source = await readSource(row.id); guard();
        if (source?.id === row.id && source.deleted_at === null) return {state:'failed',reason:error.message || '请稍后重试'};
      } catch {}
    }
  }
  const result = await verifyFutureMove(row,date,{readSource,readDay,guard,complete});
  return result.state === 'retryable' ? {state:'unknown'} : result;
}

function timedNetwork(path,options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),12000);
  return apiNetwork(path,{...options,signal:controller.signal}).finally(() => clearTimeout(timer));
}
function formatMovedDate(date) { const [,month,day] = date.split('-'); return `${Number(month)}月${Number(day)}日`; }
export async function scheduleUnscheduledTodo(id,{complete = false} = {}) {
  if (!visible()) return;
  const v=current(),key=v.owner,row=v.items.find(item=>item.id===id && !item.deleted_at && !item.deleted);
  if (!row || v.pending) return;
  const unresolved = v.uncertain[id], original = unresolved?.row || structuredClone(row),
    finishing = unresolved?.complete ?? complete, date = unresolved?.date || (finishing ? bjtDate() : v.dates[id] || '');
  v.pending=true; v.error=''; v.notice=''; paintUnscheduledTodos();
  const offline=getOfflineRuntime(), token=offline?.captureRateLimitContext();
  if (!offline || !token) {
    v.pending=false; paintUnscheduledTodos();
    toast('未执行移动：请联网并确认数据后重试',true);
    return;
  }
  const guard = () => {
    const currentToken=offline?.captureRateLimitContext();
    if (v.owner!==key || owner()!==key || !token || !currentToken || currentToken.scope!==token.scope || currentToken.generation!==token.generation)
      throw Object.assign(new Error('账号或数据范围已变化'),{staleSession:true});
  };
  const readSource = sourceId => timedNetwork('/unscheduled-todos/'+encodeURIComponent(sourceId));
  const readDay = day => timedNetwork('/todos?date='+encodeURIComponent(day));
  const services={guard,readSource,readDay,complete:finishing,move:(sourceId,
    body)=>timedNetwork('/unscheduled-todos/'+encodeURIComponent(sourceId)+(finishing?'/complete-today':'/move'),{method:'POST',body}),
    async checkReady(item) {
      guard();
      const index=await timedNetwork('/workbench-snapshot/index?version=2'); guard();
      if (index?.complete!==true || index.projection!=='current' || index.scope_id!==token.scope) throw new Error('无法核对当前数据范围');
      const queue=await offline.queue(); guard();
      const ids=['unscheduled_todo:'+item.id,'todo:'+item.id];
      const pending = value => value.operations.some(op=>ids.includes(op.entity_id)) ||
        value.conflicts.some(conflict=>ids.includes(conflict.entity_id || conflict.operation?.entity_id));
      if (pending(queue)) throw new Error('该待办有未同步内容，请同步后重试');
      const source=await readSource(item.id); guard();
      if (!unchanged(item,source)) throw new Error('待办已变化，请刷新后重试');
      const latest=await offline.queue(); guard();
      if (pending(latest)) throw new Error('该待办有未同步内容，请同步后重试');
    }};
  try {
    let result;
    if (unresolved) {
      result=await verifyFutureMove(original,date,services);
      // Only a fresh, explicit click may retry the same id/date/version.
      if (result.state==='retryable') result=await planFutureMove(original,date,{...services,priorUncertain:true});
    } else result=await planFutureMove(original,date,services);
    if (v.owner!==key || owner()!==key) return;
    try { guard(); } catch { return; }
    if (result.state==='confirmed') {
      delete v.uncertain[id]; v.items=v.items.filter(item=>item.id!==id);
      let cacheStatus='refresh';
      try { cacheStatus=await offline.acceptMovedTodo({source:result.source,todo:result.todo},token); } catch {}
      if (v.owner!==key || owner()!==key) return;
      try { guard(); } catch { return; }
      if (cacheStatus==='saved' && todosState.owner===todoOwner()) { const day=todosState.days.get(date); if(day) { mergeTodo(day,result.todo); 
        day.revision++; } }
      const note=cacheStatus==='pending'?'；本地仍有待处理内容，请在设置中处理':cacheStatus==='saved'?'':'；本地缓存待刷新';
      toast(`已移至 ${formatMovedDate(date)}${note}`);
    } else if (result.state==='failed') {
      toast(`移动失败，原项已保留：${result.reason}`,true);
    } else if (result.state==='not_started') {
      toast(`未执行移动：${result.reason}`,true);
    } else if (result.state==='cancelled') {
      return;
    } else {
      v.uncertain[id]={row:original,date,complete:finishing};
      v.notice='移动结果尚未确认，请联网后点击“核实移动结果”。';
      toast(v.notice,true);
    }
  } finally { if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();} }
}
export async function submitUnscheduledTodo({data}) {
  if(!visible())return;const v=current(),key=v.owner,text=String(data.text||'').trim();
  if(v.pending)return;if(!text||text.length>500){v.error='请填写 1–500 字的内容。';paintUnscheduledTodos();return;}
  if(!v.request||v.request.text!==text)v.request={id:crypto.randomUUID(),text};
  const submitted=v.request;v.pending=true;v.error='';paintUnscheduledTodos();
  try {const row=await api('/unscheduled-todos',{method:'POST',body:submitted});if(v.owner!==key||owner()!==key)return;
    v.items=[...v.items.filter(x=>x.id!==row.id),row];if(v.draft.trim()===text)v.draft='';v.request=null;
    const input=$('#todo-future-text');if(input&&input.value.trim()===text)input.value='';}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}
async function change(id,method,body) {
  if(!visible())return;const v=current(),key=v.owner,row=v.items.find(x=>x.id===id);if(!row||v.pending)return;
  v.pending=true;v.error='';paintUnscheduledTodos();
  try {const updated=await api('/unscheduled-todos/'+encodeURIComponent(id),{method,body:{...body,version:row.version}});
    if(v.owner===key&&owner()===key)v.items=v.items.map(x=>x.id===id?updated:x);}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}
export function toggleUnscheduledTodo(el) {return el.checked ? scheduleUnscheduledTodo(el.dataset.futureTodoId,{complete:true}) : 
  change(el.dataset.futureTodoId,'PATCH',{completed:false});}
export function deleteUnscheduledTodo(id) {return change(id,'DELETE',{});}
