import {api} from '../core/api.mjs';
import {$,e} from '../core/dom.mjs';
import {runtime,state} from '../core/state.mjs';

const cache={owner:'',items:[],draft:'',loaded:false,loading:false,error:'',pending:false,request:null};
const owner=()=>JSON.stringify([runtime.sessionEpoch,state.me?.id??null]);
function current() {
  const key=owner();
  if(cache.owner!==key)Object.assign(cache,{owner:key,items:[],draft:'',loaded:false,loading:false,error:'',pending:false,request:null});
  return cache;
}
const visible=()=>Boolean(state.me)&&state.page==='todos'&&state.todoPanel==='future';
export function renderUnscheduledTodos() {
  const v=current();
  return `<section id="todo-future" aria-label="未来待办" ${visible()?'':'hidden'}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<button class="btn primary" type="submit" ${v.pending?'disabled':''}>添加</button></form>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
export function paintUnscheduledTodos() {
  const v=current(),root=$('#todo-future');if(!root)return;
  root.hidden=!visible();
  const input=$('#todo-future-text',root),button=$('#todo-future-form button',root),status=$('#todo-future-status',root),error=$('#todo-future-error',root),list=$('#todo-future-items',root);
  if(input&&document.activeElement!==input&&input.value!==v.draft)input.value=v.draft;
  if(button)button.disabled=v.pending;
  if(status)status.textContent=v.loading&&!v.loaded?'正在读取…':v.loaded&&v.items.length===0?'还没有未来待办。':'';
  if(error)error.textContent=v.error;
  if(list)list.innerHTML=v.items.filter(x=>!x.deleted_at&&!x.deleted).map(x=>`<li class="daily-todo-row${x.completed?' is-complete':''}">
<label><input type="checkbox" data-future-todo-id="${e(x.id)}" ${x.completed?'checked':''} ${v.pending?'disabled':''}>
<span class="daily-todo-text">${e(x.text)}</span></label><button class="icon-button" type="button" data-action="todo-future-delete" data-id="${e(x.id)}" aria-label="删除 ${e(x.text)}" ${v.pending?'disabled':''}>×</button></li>`).join('');
}
export async function loadUnscheduledTodos() {
  if(!visible())return;
  const v=current(),key=v.owner;if(v.loading)return;v.loading=true;v.error='';paintUnscheduledTodos();
  try {const data=await api('/unscheduled-todos');if(v.owner!==key||owner()!==key||!Array.isArray(data.items))return;v.items=data.items;v.loaded=true;}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession&&error.name!=='AbortError')v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.loading=false;paintUnscheduledTodos();}}
}
export function inputUnscheduledTodo(el) {if(el.id==='todo-future-text')current().draft=el.value;}
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
