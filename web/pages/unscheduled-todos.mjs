import {api,apiNetwork} from '../core/api.mjs';
import {$,e} from '../core/dom.mjs';
import {runtime,state} from '../core/state.mjs';
import {validTodoDate} from '../core/todos-state.mjs';
import {getOfflineRuntime} from '../offline/runtime.mjs';

const cache={owner:'',items:[],draft:'',loaded:false,loading:false,error:'',notice:'',pending:false,request:null,dates:{}};
const owner=()=>JSON.stringify([runtime.sessionEpoch,state.me?.id??null]);
function current() {
  const key=owner();
  if(cache.owner!==key)Object.assign(cache,{owner:key,items:[],draft:'',loaded:false,loading:false,error:'',notice:'',pending:false,request:null,dates:{}});
  return cache;
}
const visible=()=>Boolean(state.me)&&state.page==='todos'&&state.todoPanel==='future';
export function renderUnscheduledTodos() {
  const v=current();
  return `<section id="todo-future" aria-label="未来待办" ${visible()?'':'hidden'}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<button class="btn primary" type="submit" ${v.pending?'disabled':''}>添加</button></form>
<p class="todo-future-help">选择日期后可添加至当天，原未来待办保留。</p>
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
<label><input type="checkbox" data-future-todo-id="${e(x.id)}" ${x.completed?'checked':''} ${v.pending?'disabled':''}>
<span class="daily-todo-text">${e(x.text)}</span></label><div class="todo-future-schedule"><input class="input" type="date" data-future-date-id="${e(x.id)}" value="${e(v.dates[x.id] || '')}" aria-label="为 ${e(x.text)} 选择日期" ${v.pending?'disabled':''}><button class="btn small" type="button" data-action="todo-future-schedule" data-id="${e(x.id)}" ${v.pending?'disabled':''}>添加至该日期</button></div><button class="icon-button" type="button"
 data-action="todo-future-delete" data-id="${e(x.id)}" aria-label="删除 ${e(x.text)}" ${v.pending?'disabled':''}>×</button></li>`).join('');
}
export async function loadUnscheduledTodos() {
  if(!visible())return;
  const v=current(),key=v.owner;if(v.loading)return;v.loading=true;v.error='';paintUnscheduledTodos();
  try {const data=await api('/unscheduled-todos');if(v.owner!==key||owner()!==key||!Array.isArray(data.items))return;v.items=data.items;v.loaded=true;}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession&&error.name!=='AbortError')v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.loading=false;paintUnscheduledTodos();}}
}
export function inputUnscheduledTodo(el) {
  if(el.id==='todo-future-text')current().draft=el.value;
  if(el.dataset?.futureDateId)current().dates[el.dataset.futureDateId]=el.value;
}
// Check both the local queue and the existing server index before using the
// source UUID as the destination idempotency key. Never remove the source.
export async function planFutureSchedule(row,date,{findTodo,readIndex,create,expectedScope}) {
  if(!validTodoDate(date))throw new Error('请选择有效日期，原未来待办仍保留。');
  const local=await findTodo(row.id);
  if(local) return {existing:true,date:local.date,deleted:Boolean(local.deleted_at || local.deleted)};
  let index;
  try {index=await readIndex();} catch(error) {
    if(error.status===401 || error.status===403)throw error;
    throw new Error('暂时无法联网核对已安排日期，请联网后重试；原未来待办仍保留。');
  }
  if(index?.complete!==true || !Array.isArray(index.entities) || expectedScope && index.scope_id!==expectedScope)
    throw new Error('无法核对已安排日期，请稍后重试；原未来待办仍保留。');
  const existing=index.entities.find(item=>item?.entity_id==='todo:'+row.id);
  if(existing)return {existing:true,date:existing.date,deleted:Boolean(existing.deleted_at)};
  await create({id:row.id,date,text:row.text});
  return {existing:false,date};
}
export async function scheduleUnscheduledTodo(id) {
  if(!visible())return;
  const v=current(),key=v.owner,row=v.items.find(item=>item.id===id && !item.deleted_at && !item.deleted);
  if(!row||v.pending)return;
  const date=v.dates[id] || '';
  v.pending=true;v.error='';v.notice='';paintUnscheduledTodos();
  try {
    const offline=getOfflineRuntime();
    if(!offline)throw new Error('本地数据尚未准备好，请稍后重试；原未来待办仍保留。');
    const result=await planFutureSchedule(row,date,{expectedScope:offline.state.scope,findTodo:todoId=>offline.findTodo(todoId),
      readIndex:()=>apiNetwork('/workbench-snapshot/index?version=2'),
      create:body=>{
        if(v.owner!==key||owner()!==key)throw Object.assign(new Error('账号已切换，原未来待办仍保留。'),{staleSession:true});
        return api('/todos',{method:'POST',body});
      }});
    if(v.owner!==key||owner()!==key)return;
    v.notice=result.existing ? `此待办已安排至 ${result.date || '其他日期'}${result.deleted?'（该日期的记录已删除）':''}；原未来待办保留。` :
      `已添加至 ${result.date}，后台自动同步；原未来待办保留。`;
  } catch(error) {if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
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
export function toggleUnscheduledTodo(el) {return change(el.dataset.futureTodoId,'PATCH',{completed:el.checked});}
export function deleteUnscheduledTodo(id) {return change(id,'DELETE',{});}
