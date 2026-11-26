import {api,apiNetwork} from '../core/api.mjs';
import {$,e} from '../core/dom.mjs';
import {runtime,state} from '../core/state.mjs';
import {validTodoDate,mergeTodo,todosState,todoOwner} from '../core/todos-state.mjs';
import {bjtDate} from '../core/format.mjs';
import {getOfflineRuntime} from '../offline/runtime.mjs';
import {toast} from '../ui/toast.mjs';
import {todoNoteField} from './todo-note-field.mjs';
import {PERIOD_GROUPS,dueGroup,dueLabel,dueSoon,daysUntil,periodChoices,periodFits,periodGroup,periodPast} from '../../shared/todo-period.mjs';
import {FUTURE_SCOPE,confirmSmartTodo,paintSmartTodo,smartTodoActive,smartTodoReady,smartTodoWanted,startSmartTodo} from './todo-smart.mjs';
// The add menu also offers the two repeats; they land in 本周 / 本月 and come back every week or month.
const ADD_CHOICES=[...PERIOD_GROUPS.slice(0,4),['every_week','每周'],['every_month','每月'],PERIOD_GROUPS[4]];
const REPEAT_OF={every_week:'week',every_month:'month'},REPEAT_LABEL={week:'每周',month:'每月'};
/** The period and repeat a menu choice stands for today. */
function choiceValue(choice,today=bjtDate()) {
  const choices=periodChoices(today),recurrence=REPEAT_OF[choice]||null;
  const period=recurrence==='week'?choices.week:recurrence==='month'?choices.month:choices[choice]||null;
  return {period,recurrence};
}
import {readPeriodWords} from '../../shared/todo-period-words.mjs';
import {MAX_TIMES,leftLabel,needsNudge,readTimes,repeatGroups,timesLabel} from '../../shared/todo-times.mjs';

const cache={owner:'',items:[],draft:'',loaded:false,loading:false,error:'',notice:'',pending:false,request:null,dates:{},
  uncertain:{},noteEdit:null,noteError:'',picking:{},open:'',newPeriod:'none',manualPeriod:false,dues:{}};
let paintingFuture=false;
const owner=()=>JSON.stringify([runtime.sessionEpoch,state.me?.id??null,getOfflineRuntime()?.state.scope??null]);
function current() {
  const key=owner();
  if(cache.owner!==key)Object.assign(cache,{owner:key,items:[],draft:'',loaded:false,loading:false,error:'',notice:'',pending:false,request:null,dates:{},
    uncertain:{},noteEdit:null,noteError:'',picking:{},open:'',newPeriod:'none',manualPeriod:false,dues:{}});
  return cache;
}
const visible=()=>Boolean(state.me)&&state.page==='todos'&&state.todoPanel==='future';
// 今日 shows future to-dos that are due soon, so moving one from there is allowed on either panel.
const onTodos=()=>Boolean(state.me)&&state.page==='todos';
export function renderUnscheduledTodos() {
  const v=current();
  return `<section id="todo-future" aria-label="未来待办" ${visible()?'':'hidden'}>
<form id="todo-future-form" class="daily-todo-form"><label class="sr-only" for="todo-future-text">未来待办</label>
<input id="todo-future-text" class="input" name="text" maxlength="500" required autocomplete="off" placeholder="还没确定日期的事" value="${e(v.draft)}">
<label class="sr-only" for="todo-future-period">大概什么时候</label><select id="todo-future-period" class="input todo-future-period" name="period">` +
  ADD_CHOICES.map(([key,label])=>`<option value="${key}" ${v.newPeriod===key?'selected':''}>${label}</option>`).join('') + `</select>
<button class="btn primary" type="submit" ${v.pending?'disabled':''}>添加</button></form>
<p id="todo-future-heard" class="todo-future-heard" aria-live="polite">${e(heardText(v))}</p>
<p class="todo-future-help">可以直接说「下周看电影」「每周跑步」「每周两次总结数据」「12月16号之前退订会员」；勾选＝做完了，移到今日；点 ▾ 定日子、改时间或截止日。</p>
<p id="todo-future-status" class="daily-todo-status" role="status"></p><p id="todo-future-error" class="form-message" role="alert"></p>
<ul id="todo-future-items" class="daily-todo-items"></ul></section>`;
}
export function futureTodoView() { return current(); }
export function futureRepainting() { return paintingFuture; }
const shiftDay=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const shortDay=date=>`${Number(date.slice(5,7))}/${Number(date.slice(8))}`;
/** 今天, 明天 and the next weekend day not already covered by 明天, so the three buttons never name the same day:
 * Saturday (周末) on Sunday to Thursday, Sunday (周日) on Friday, next Saturday (下周六) on Saturday. */
export function futureQuickDates(today=bjtDate()) {
  const weekday=new Date(today+'T00:00:00Z').getUTCDay();
  const third=weekday===5?['周日',shiftDay(today,2)]:weekday===6?['下周六',shiftDay(today,7)]:['周末',shiftDay(today,(6-weekday+7)%7||7)];
  return [['今天',today],['明天',shiftDay(today,1)],third];
}
const GROUP_LABEL=Object.fromEntries(PERIOD_GROUPS);
const WEEK=['周日','周一','周二','周三','周四','周五','周六'];
/** The date field for "选日期…", and for a move whose result still needs checking. */
function dateField(item,v,off) {
  const id=e(item.id);
  return `<div class="todo-future-schedule"><input class="input" type="date" data-future-date-id="${id}" value="${e(v.dates[item.id] || '')}" ` +
    `aria-label="为 ${e(item.text)} 选择日期" ${off}><button class="btn small" type="button" data-action="todo-future-schedule" data-id="${id}" ` +
    `${v.pending?'disabled':''}>${v.uncertain[item.id]?'核实移动结果':'移至该日期'}</button></div>`;
}
/** One ▾ per row opens this panel: a concrete day, a rough time, or delete. */
function futurePanel(item,v,off) {
  const id=e(item.id),today=bjtDate(),choices=periodChoices(today),mine=item.period||null;
  const days=futureQuickDates(today).map(([label,date])=>{
    const name=label==='周末'?WEEK[6]:label;
    return `<button class="btn small" type="button" data-action="todo-future-quick" data-id="${id}" data-date="${date}" ` +
      `aria-label="把 ${e(item.text)} 移到${name}（${shortDay(date)}）" ${off}>${name} <span class="todo-future-day">${shortDay(date)}</span></button>`;
  }).join('') + `<button class="btn small text" type="button" data-action="todo-future-pick" data-id="${id}" ${off}>选日期…</button>`;
  const repeats=[['','不重复'],['week','每周'],['month','每月']].map(([value,label])=>{
    const on=(item.recurrence||'')===value;
    return `<button class="btn small${on?' is-on':''}" type="button" data-action="todo-future-repeat" data-id="${id}" data-repeat="${value}" ` +
      `aria-pressed="${on}" ${off}>${label}</button>`;
  }).join('');
  const periods=PERIOD_GROUPS.map(([key,label])=>{
    const value=key==='none'?'':choices[key],on=(mine||'')===value;
    return `<button class="btn small${on?' is-on':''}" type="button" data-action="todo-future-period" data-id="${id}" data-period="${value}" ` +
      `aria-pressed="${on}" ${off}>${label}</button>`;
  }).join('');
  return `<div class="todo-future-panel" id="todo-future-panel-${id}">` +
    `<div class="todo-future-panel-row"><span class="todo-future-panel-label">定具体日子</span><div class="todo-future-chips">${days}</div></div>` +
    (v.picking[item.id]?dateField(item,v,off):'') +
    `<div class="todo-future-panel-row"><span class="todo-future-panel-label">大概什么时候</span><div class="todo-future-chips">${periods}</div></div>` +
    `<div class="todo-future-panel-row"><span class="todo-future-panel-label">重复</span><div class="todo-future-chips">${repeats}</div></div>` +
    (item.recurrence?timesRow(item,1,off):'') +
    `<div class="todo-future-panel-row"><span class="todo-future-panel-label">截止日（前三天起每天出现在今日）</span><div class="todo-future-schedule">` +
    `<input class="input" type="date" data-future-due-id="${id}" value="${e(v.dues[item.id]??item.due_date??'')}" ` +
    `aria-label="${e(item.text)} 的截止日" ${off}>` +
    `<button class="btn small" type="button" data-action="todo-future-due" data-id="${id}" ${off}>设为截止日</button>` +
    (item.due_date?`<button class="btn small text" type="button" data-action="todo-future-due-clear" data-id="${id}" ${off}>去掉</button>`:'') +
    `</div></div>` +
    `<div class="todo-future-panel-foot">` +
    `<button class="btn small text" type="button" data-action="todo-edit-text" data-id="${id}" ` +
    `data-future="1" ${off}>修改文字</button>` +
    `<button class="btn small text danger" type="button" data-action="todo-future-delete" ` +
    `data-id="${id}" ${off}>` +
    `删除</button></div></div>`;
}
/** One tap: the chosen day goes through the same checked move as the date field. */
export function quickScheduleUnscheduledTodo(id,date) {
  if(!validTodoDate(date))return;
  current().dates[id]=date;
  return scheduleUnscheduledTodo(id);
}
export function pickUnscheduledTodoDate(id) {
  current().picking[id]=true;paintUnscheduledTodos();
  $(`[data-future-date-id="${CSS.escape(id)}"]`)?.focus();
}
export function toggleUnscheduledTodoPanel(id) {
  const v=current();v.open=v.open===id?'':id;paintUnscheduledTodos();
}
/** 每周 / 每月 做几次: 1 to 7 chips; more than one keeps that many copies and shows 本周 1/2. */
function timesRow(item,times,off) {
  const span=item.recurrence==='week'?'每周':'每月',id=e(item.id);
  const chips=Array.from({length:MAX_TIMES},(_,i)=>i+1).map(n=>`<button class="btn small${n===times?' is-on':''}" type="button" ` +
    `data-action="todo-future-times" data-id="${id}" data-times="${n}" aria-pressed="${n===times}" ${off}>${n} 次</button>`).join('');
  return `<div class="todo-future-panel-row"><span class="todo-future-panel-label">${span}做几次（日子不固定，做一次勾一次）</span>` +
    `<div class="todo-future-chips">${chips}</div></div>`;
}
/** Several copies of one repeating to-do, as one row: tick = one more done. */
function groupRow(group) {
  const v=current(),lead=group.open[0]||group.copies[0],busy=v.pending||group.copies.some(x=>v.uncertain[x.id]),off=busy?'disabled':'';
  const full=!group.open.length,check=`future-check-${lead.id}`,open=v.open===lead.id;
  const panel=`<div class="todo-future-panel" id="todo-future-panel-${e(lead.id)}">${timesRow(lead,group.times,off)}` +
    `<div class="todo-future-panel-foot"><button class="btn small text danger" type="button" data-action="todo-future-delete-all" ` +
    `data-id="${e(lead.id)}" ${off}>删除</button></div></div>`;
  return `<li class="daily-todo-row todo-future-times-row${full?' is-complete':''}${open?' is-open':''}">` +
    `<label class="daily-todo-check" for="${e(check)}"><input id="${e(check)}" type="checkbox" ` +
    `${full?`data-future-extra-id="${e(lead.id)}" ${off} aria-label="${e(group.text)} 又做了一次（已做够）"`:
      `data-future-todo-id="${e(lead.id)}" ${off} aria-label="${e(group.text)} 做了一次"`}></label>` +
    `<div class="daily-todo-main"><label class="daily-todo-text" for="${e(check)}">${e(group.text)}</label>` +
    `<span class="todo-future-repeat">${REPEAT_LABEL[group.recurrence]} ${group.times} 次</span>` +
    `<span class="todo-future-times${full?' is-full':''}">${timesLabel(group)}</span></div>` +
    `<button class="icon-button todo-future-more" type="button" data-action="todo-future-menu" data-id="${e(lead.id)}" ` +
    `aria-expanded="${open}" aria-controls="todo-future-panel-${e(lead.id)}" aria-label="安排 ${e(group.text)}">▾</button>` +
    (open?panel:'') + `</li>`;
}
function futureRow(item) {
  if(item.group)return groupRow(item.group);
  const v=current(),busy=v.pending||v.uncertain[item.id],off=busy?'disabled':'',check=`future-check-${item.id}`,open=v.open===item.id;
  const note=todoNoteField(item,{pending:busy,editing:v.noteEdit,error:v.noteError,future:true});
  const badge=item.recurrence?`<span class="todo-future-repeat">${REPEAT_LABEL[item.recurrence]||''}</span>`:'';
  const today=bjtDate(),due=item.due_date?`<span class="todo-future-due${dueSoon(item.due_date,today)?' is-soon':''}` +
    `${daysUntil(item.due_date,today)<0?' is-over':''}">${dueLabel(item.due_date,today)}</span>`:'';
  const late=!item.recurrence&&!item.due_date&&periodPast(item.period,today)?
    `<span class="todo-future-late">${item.period.includes('W')?'上周':'上个月'}没做完</span>`:'';
  return `<li class="daily-todo-row${item.completed?' is-complete':''}${open?' is-open':''}">` +
    `<label class="daily-todo-check" for="${e(check)}"><input id="${e(check)}" type="checkbox" data-future-todo-id="${e(item.id)}" ` +
    `${item.completed?'checked':''} ${off}></label>` +
    `<div class="daily-todo-main"><label class="daily-todo-text" for="${e(check)}">${e(item.text)}</label>${badge}${due}${late}${note}</div>` +
    `<button class="icon-button todo-future-more" type="button" data-action="todo-future-menu" data-id="${e(item.id)}" ` +
    `aria-expanded="${open}" aria-controls="todo-future-panel-${e(item.id)}" aria-label="安排 ${e(item.text)}">▾</button>` +
    (v.uncertain[item.id]?dateField(item,v,''):open?futurePanel(item,v,off):'') + `</li>`;
}
/** The list in groups: 本周, 下周, 本月, 下个月, 不定; empty groups are left out. */
export function futureGroups(items,today=bjtDate()) {
  const groups=new Map(PERIOD_GROUPS.map(([key])=>[key,[]]));
  for(const item of items)groups.get(item.due_date?dueGroup(item.due_date,today):periodGroup(item.period,today)).push(item);
  // Within a group the nearest deadline comes first; the rest keep their order.
  for(const rows of groups.values())rows.sort((a,b)=>(a.due_date||'9999')<(b.due_date||'9999')?-1:(a.due_date||'9999')>(b.due_date||'9999')?1:0);
  return [...groups].filter(([,rows])=>rows.length);
}
/** Copies of one 每周 N 次 to-do become one row, placed in 本周 / 本月. A repeat done once stays as it was. */
export function collapseTimes(rows,today=bjtDate()) {
  const multi=repeatGroups(rows,today).filter(group=>group.times>1),taken=new Map();
  for(const group of multi)for(const copy of [...group.copies,...group.extras])taken.set(copy.id,group);
  const out=[],seen=new Set();
  for(const row of rows) {
    const group=taken.get(row.id);
    if(!group){out.push(row);continue;}
    if(seen.has(group.key)||!group.copies.includes(row))continue;seen.add(group.key);
    out.push({id:(group.open[0]||group.copies[0]).id,text:group.text,period:group.current,group});
  }
  return out;
}
export function paintUnscheduledTodos() {
  paintingFuture=true;
  try { paintFutureList(); paintDueList(); }
  finally { paintingFuture=false; }
}
function paintFutureList() {
  const v=current(),root=$('#todo-future');if(!root)return;
  root.hidden=!visible();
  const input=$('#todo-future-text',root),button=$('#todo-future-form button',root),status=$('#todo-future-status',root),
    error=$('#todo-future-error',root),list=$('#todo-future-items',root);
  if(input&&document.activeElement!==input&&input.value!==v.draft)input.value=v.draft;
  if(button)button.disabled=v.pending;
  if(status)status.textContent=v.notice || (v.loading&&!v.loaded?'':v.loaded&&v.items.length===0?'还没有未来待办。':'');
  if(error)error.textContent=v.error;
  const live=document.activeElement;
  const keep=live?.matches?.('[data-todo-note-input][data-future="1"]')&&live.isConnected&&v.noteEdit?.id===live.dataset.id;
  const rows=collapseTimes(v.items.filter(x=>!x.deleted_at&&!x.deleted)),groups=futureGroups(rows),only=groups.length===1&&groups[0][0]==='none';
  if(list&&!keep)list.innerHTML=groups.map(([key,items])=>(only?'':`<li class="todo-future-group" role="presentation">${GROUP_LABEL[key]}` +
    `<span class="todo-future-count">${items.length}</span></li>`)+items.map(futureRow).join('')).join('');
  paintSmartTodo(root,{date:FUTURE_SCOPE});
}
/** Future to-dos due within three days, or overdue, shown on 今日 until they are done. */
export function dueTodos(items,today=bjtDate()) {
  return items.filter(x=>!x.deleted_at&&!x.deleted&&!x.completed&&dueSoon(x.due_date,today)).sort((a,b)=>a.due_date<b.due_date?-1:1);
}
function paintDueList() {
  const list=$('#todo-due');if(!list)return;
  const v=current(),today=bjtDate(),show=!state.todoPanel&&(!state.todoDate||state.todoDate===today);
  const due=show?dueTodos(v.items,today):[],dueIds=new Set(due.map(x=>x.id));
  const nudges=show?repeatGroups(v.items,today).filter(group=>needsNudge(group,today)&&!group.open.some(x=>dueIds.has(x.id))):[];
  const html=due.map(item=>{
    const check=`due-check-${item.id}`,busy=v.pending||v.uncertain[item.id],over=daysUntil(item.due_date,today)<0;
    return `<li class="daily-todo-row todo-due-row${over?' is-over':''}"><label class="daily-todo-check" for="${e(check)}"><input id="${e(check)}" ` +
      `type="checkbox" data-future-todo-id="${e(item.id)}" ${busy?'disabled':''}></label><div class="daily-todo-main"><label class="daily-todo-text" ` +
      `for="${e(check)}">${e(item.text)}</label><span class="todo-future-due is-soon${over?' is-over':''}">${dueLabel(item.due_date,today)}</span></div></li>`;
  }).join('')+nudges.map(group=>{
    const lead=group.open[0],check=`due-check-${lead.id}`,busy=v.pending||v.uncertain[lead.id];
    return `<li class="daily-todo-row todo-due-row todo-due-times"><label class="daily-todo-check" for="${e(check)}"><input id="${e(check)}" ` +
      `type="checkbox" data-future-todo-id="${e(lead.id)}" ${busy?'disabled':''} aria-label="${e(group.text)} 做了一次"></label>` +
      `<div class="daily-todo-main"><label class="daily-todo-text" for="${e(check)}">${e(group.text)}</label>` +
      `<span class="todo-future-due is-soon">${leftLabel(group)}${group.times>1?`（${group.done.length}/${group.times}）`:''}</span></div></li>`;
  }).join('');
  if(list.innerHTML!==html)list.innerHTML=html;
  list.hidden=!html;
}
/** 今日 asks for the future list once, quietly, to find what is due. */
export async function loadDueTodos() {
  // Only 今日 on today needs it.
  if(!onTodos()||state.todoPanel||(state.todoDate&&state.todoDate!==bjtDate()))return;
  const v=current(),key=v.owner;if(v.loading||v.loaded)return paintDueList();
  v.loading=true;
  try {const data=await api('/unscheduled-todos');if(v.owner!==key||owner()!==key||!Array.isArray(data.items))return;v.items=data.items;v.loaded=true;}
  catch {}
  finally {if(v.owner===key&&owner()===key){v.loading=false;paintUnscheduledTodos();}}
}
/** Reads 未来待办 again after a change made elsewhere (a sentence on 今日 that completed or moved one). */
export function refreshFutureTodos() {
  current().loaded=false;void loadUnscheduledTodos();void loadDueTodos();
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
const GROUP_NAME=Object.fromEntries(ADD_CHOICES);
/** "认出「下周」，会存成「看电影」" while the sentence names a rough time and the menu still agrees with it. */
function heardText(v) {
  if(smartTodoActive(FUTURE_SCOPE))return '';
  const times=readTimes(v.draft);
  if(times&&REPEAT_OF[v.newPeriod]){const span=v.newPeriod==='every_week'?'周':'月';
    return `认出「每${span} ${times.times} 次」，会存成「${times.text}」：本${span}做 ${times.times} 次，做一次勾一次，下${span==='周'?'周':'个月'}重新算`;}
  const heard=readPeriodWords(v.draft);
  if(!heard||v.newPeriod!==heard.period)return '';
  return REPEAT_OF[heard.period]?`认出「${GROUP_NAME[heard.period]}」重复，做完会自动出现${heard.period==='every_week'?'下周':'下个月'}的一条`:
    `认出「${GROUP_NAME[heard.period]}」，会存成「${heard.text}」`;
}
function paintHeard(v) {
  const select=$('#todo-future-period'),line=$('#todo-future-heard');
  if(select&&select.value!==v.newPeriod)select.value=v.newPeriod;
  if(line)line.textContent=heardText(v);
}
export function inputUnscheduledTodo(el) {
  if(el.id==='todo-future-text') {
    const v=current();v.draft=el.value;
    // The menu follows the sentence until it is changed by hand.
    if(!v.manualPeriod)v.newPeriod=readPeriodWords(el.value)?.period||readTimes(el.value)?.every||'none';
    paintHeard(v);
  }
  if(el.id==='todo-future-period') {const v=current();v.newPeriod=el.value;v.manualPeriod=true;paintHeard(v);}
  if(el.dataset?.futureDateId)current().dates[el.dataset.futureDateId]=el.value;
  if(el.dataset?.futureDueId)current().dues[el.dataset.futureDueId]=el.value;
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
  if (!onTodos()) return;
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
      // The full index was retired (426); the small scope endpoint answers the same three fields.
      const index=await timedNetwork('/workbench-snapshot/scope'); guard();
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
      if(result.next?.id&&!v.items.some(item=>item.id===result.next.id))v.items=[...v.items,result.next]; // 每周 / 每月 come back
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
let bridge=null;
/** 今日 lends its own ways of adding to a day and to 常用, so a sentence typed here can go there too. */
export function setFutureBridge(given) { bridge=given; }
const FUTURE_DAY={date:FUTURE_SCOPE};
const done=(v,typed,message)=>{
  if(v.draft.trim()===typed){v.draft='';v.newPeriod='none';v.manualPeriod=false;paintHeard(v);}
  const input=$('#todo-future-text');if(input&&input.value.trim()===typed)input.value='';
  if(message){v.notice=message;toast(message);}
};
const futureHooks={
  repaint:()=>paintUnscheduledTodos(),
  plain:(day,text)=>addTyped(text,'none'),
  commandItems:()=>bridge?.todayItems?.()||[],
  consume:(day,sentence)=>done(current(),sentence),
  refresh:()=>{refreshFutureTodos();bridge?.refreshToday?.();},
  async saveElsewhere(day,request,label,note) {const v=current();await bridge.toDay(request,note);done(v,smartSentence(v),`已添加到 ${label}`);},
  async saveDaily(day,text,note) {const v=current();await bridge.daily(text,note);done(v,smartSentence(v),'已存为常用并加到今天');},
  async saveFuture(day,proposal,label) {const v=current();await addFutureTodo(proposal);done(v,smartSentence(v),`已加到 ${label}`);},
};
const smartSentence=v=>v.smartTyped||'';
export async function submitUnscheduledTodo({data}) {
  if(!visible())return;const v=current(),typed=String(data.text||'').trim();
  if(v.pending)return;if(!typed||typed.length>500){v.error='请填写 1–500 字的内容。';paintUnscheduledTodos();return;}
  // A menu chosen by hand wins; otherwise a sentence with a time in it is read by the model, as on 今日.
  // "每周两次…" is read here, not by the model, so the count is never lost.
  const times=readTimes(typed);
  if(times&&(times.every||readPeriodWords(typed)?.period?.startsWith('every_')||REPEAT_OF[data.period]))return addTyped(typed,String(data.period||'none'));
  if(!v.manualPeriod&&smartTodoReady(typed,FUTURE_SCOPE))return confirmSmartTodo(FUTURE_DAY);
  if(!v.manualPeriod&&smartTodoWanted(typed)){v.smartTyped=typed;v.error='';return startSmartTodo(FUTURE_DAY,typed,futureHooks);}
  return addTyped(typed,String(data.period||'none'));
}
/** Adds the sentence as typed; the menu (or the local word list behind it) gives its rough time. */
async function addTyped(typed,choice) {
  const v=current(),key=v.owner,heard=readPeriodWords(typed);
  if(choice==='none'&&!v.manualPeriod&&heard)choice=heard.period; // model switched off: the word list still works
  const counted=readTimes(typed);
  if(choice==='none'&&!v.manualPeriod&&counted?.every)choice=counted.every;
  // The time words are dropped from the saved text only when the menu still shows what they said.
  const {period,recurrence}=choiceValue(choice),times=recurrence&&counted?counted.times:1;
  const text=times>1?counted.text:heard&&heard.period===choice?heard.text:typed;
  if(!v.request||v.request.text!==text)v.request={id:crypto.randomUUID(),text};
  const submitted=v.request;v.pending=true;v.error='';paintUnscheduledTodos();
  try {const row=await api('/unscheduled-todos',{method:'POST',body:submitted});if(v.owner!==key||owner()!==key)return;
    // Shown in its group at once; addMeta saves it and takes the mark back off if that fails.
    v.items=[...v.items.filter(x=>x.id!==row.id),period?{...row,period,...(recurrence?{recurrence}:{})}:row];v.request=null;
    done(v,typed);
    if(period)void addMeta(row.id,recurrence?{period,recurrence}:{period},key);
    for(let i=1;i<times;i++)await addFutureTodo({text,period,recurrence});
    if(times>1)toast(`已加：${text}，${recurrence==='week'?'每周':'每月'} ${times} 次`);}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}
/** A confirmed reading for 未来待办, from either page: a rough time, a repeat or a deadline. */
export async function addFutureTodo(proposal) {
  const counted=proposal.recurrence&&readTimes(proposal.text);
  if(counted&&counted.times>1) {
    const one={...proposal,text:counted.text};let first=null;
    for(let i=0;i<counted.times;i++){const row=await addOne(one);first??=row;}
    return first;
  }
  return addOne(proposal);
}
async function addOne(proposal) {
  const v=current(),key=v.owner,change={period:proposal.period||null};
  if(proposal.recurrence)change.recurrence=proposal.recurrence;
  if(proposal.due_date)change.due_date=proposal.due_date;
  const row=await api('/unscheduled-todos',{method:'POST',body:{id:crypto.randomUUID(),text:proposal.text}});
  if(v.owner!==key||owner()!==key)return row;
  v.items=[...v.items.filter(x=>x.id!==row.id),{...row,...Object.fromEntries(Object.entries(change).filter(([,value])=>value))}];
  paintUnscheduledTodos();
  if(change.period||change.recurrence||change.due_date)void addMeta(row.id,change,key);
  return row;
}
// A new to-do is created first (that request may wait in the offline queue), then gets its period.
// Until the queued create reaches the server the period request finds nothing (404) or meets a busy connection,
// so it keeps trying for about ten seconds; before giving up it reads the row back, because a lost reply may still have saved.
const transient=error=>error.status===404||error.status===409||error.status===429||error.status>=500||
  error.code==='NETWORK_UNAVAILABLE'||!error.status;
const same=(saved,change)=>Object.entries(change).every(([name,value])=>(saved[name]??null)===value);
async function addMeta(id,change,key) {
  const v=current(),live=()=>v.owner===key&&owner()===key,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let last=null;
  for(let attempt=0;attempt<10;attempt++) {
    if(attempt)await wait(Math.min(400*attempt,2000));
    const row=v.items.find(x=>x.id===id);if(!row||!live())return;
    try {
      const saved=await api('/unscheduled-todos/'+encodeURIComponent(id));if(!live())return;
      if(same(saved,change)){v.items=v.items.map(x=>x.id===id?saved:x);paintUnscheduledTodos();return;}
      const updated=await api('/unscheduled-todos/'+encodeURIComponent(id)+'/period',{method:'PATCH',body:{...change,version:saved.version}});
      if(live()){v.items=v.items.map(x=>x.id===id?updated:x);paintUnscheduledTodos();}return;
    } catch(error){last=error;if(error.staleSession||!transient(error))break;}
  }
  undo(id,key,last);
}
function undo(id,key,error) {
  const v=current();if(v.owner!==key||owner()!==key)return;
  v.items=v.items.map(x=>{if(x.id!==id)return x;const {period,recurrence,due_date,...rest}=x;return rest;});
  v.error=`时间没保存上，这条先放在「不定」，可以点 ▾ 再选一次（${error?.message||'请稍后再试'}）`;paintUnscheduledTodos();
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
export function deleteUnscheduledTodo(id) {const v=current();if(v.open===id)v.open='';return change(id,'DELETE',{});}
/** 每周 / 每月 / 不重复 from the panel. A repeat needs a week or a month, so one is chosen when the current period does not fit. */
export function setUnscheduledTodoRepeat(id,repeat) {
  const v=current(),row=v.items.find(x=>x.id===id);if(!row)return;
  const recurrence=repeat||null,choices=periodChoices(bjtDate());
  const period=!recurrence?row.period||null:periodFits(row.period,recurrence)?row.period:recurrence==='week'?choices.week:choices.month;
  return savePeriod(id,{period,recurrence});
}
/** 截止日 from the panel; "" (去掉) clears it. */
export function setUnscheduledTodoDue(id,clear=false) {
  const v=current(),row=v.items.find(x=>x.id===id);if(!row)return;
  const value=clear?null:v.dues[id]??row.due_date??'';
  if(!clear&&!validTodoDate(value)){v.error='请先选一个截止日。';paintUnscheduledTodos();return;}
  delete v.dues[id];
  return savePeriod(id,{period:row.period||null,due_date:value});
}
/** A rough time: "" clears it (不定). The row moves to its group and the panel closes. */
export function setUnscheduledTodoPeriod(id,period) {
  const row=current().items.find(x=>x.id===id);if(!row)return;
  return savePeriod(id,{period:period||null});
}
async function savePeriod(id,change) {
  if(!visible())return;const v=current(),key=v.owner,row=v.items.find(x=>x.id===id);if(!row||v.pending)return;
  if(same(row,change)){v.open='';paintUnscheduledTodos();return;}
  v.pending=true;v.error='';paintUnscheduledTodos();
  try {const updated=await api('/unscheduled-todos/'+encodeURIComponent(id)+'/period',{method:'PATCH',body:{...change,version:row.version}});
    if(v.owner===key&&owner()===key){v.items=v.items.map(x=>x.id===id?updated:x);v.open='';}}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}

/** 做几次 from the panel: adds copies of this repeat, or deletes the ones still to do first. */
export async function setUnscheduledTodoTimes(id,times) {
  const v=current(),key=v.owner,row=v.items.find(x=>x.id===id);
  if(!row||!row.recurrence||v.pending||!Number.isInteger(times)||times<1||times>MAX_TIMES)return;
  const group=repeatGroups(v.items,bjtDate()).find(g=>g.copies.some(x=>x.id===id));if(!group)return;
  if(times===group.times){v.open='';paintUnscheduledTodos();return;}
  v.pending=true;v.error='';paintUnscheduledTodos();
  try {
    if(times>group.times) {
      v.pending=false;
      for (let i = group.times; i < times; i++) {
        await addOne({text:group.text,period:group.current,recurrence:group.recurrence});
        if (v.owner !== key || owner() !== key) return;
      }
    } else {
      const drop=[...group.open].reverse().concat([...group.done].reverse()).slice(0,group.times-times);
      for(const copy of drop)await removeCopy(copy,key);
    }
    if(v.owner===key&&owner()===key){v.open='';toast(`改成${group.recurrence==='week'?'每周':'每月'} ${times} 次`);}
  } catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}
async function removeCopy(copy,key) {
  const v=current(),latest=v.items.find(x=>x.id===copy.id)||copy;
  const updated=await api('/unscheduled-todos/'+encodeURIComponent(copy.id),{method:'DELETE',body:{version:latest.version}});
  if(v.owner===key&&owner()===key)v.items=v.items.map(x=>x.id===copy.id?updated:x);
}
/** 删除 on a 每周 N 次 row removes every copy (each one can still be restored like any deleted to-do). */
export async function deleteUnscheduledTodoTimes(id) {
  const v=current(),key=v.owner;if(v.pending)return;
  const group=repeatGroups(v.items,bjtDate()).find(g=>g.copies.some(x=>x.id===id));if(!group)return deleteUnscheduledTodo(id);
  v.pending=true;v.error='';v.open='';paintUnscheduledTodos();
  try {for(const copy of [...group.copies,...group.extras])await removeCopy(copy,key);}
  catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}

/** A tick on a week already done enough: keeps a finished one-off in this week (counted as 3/2)
 * and adds a finished to-do on 今日, so the extra time shows in today's done list too. */
export async function addUnscheduledTodoExtra(el) {
  const v=current(),key=v.owner,id=el.dataset.futureExtraId,today=bjtDate();
  const group=repeatGroups(v.items,today).find(g=>g.copies.some(x=>x.id===id));
  if(!group||group.open.length||v.pending){el.checked=false;return;}
  v.pending=true;v.error='';paintUnscheduledTodos();
  try {
    // The create may wait in the offline queue, so the period and 完成 steps retry like addMeta does.
    const made=await api('/unscheduled-todos',{method:'POST',body:{id:crypto.randomUUID(),text:group.text}});
    if(v.owner!==key||owner()!==key)return;
    v.items=[...v.items.filter(x=>x.id!==made.id),{...made,completed:true,period:group.current}];
    await addMeta(made.id,{period:group.current},key);
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    for(let attempt=0;;attempt++) {
      const latest=await api('/unscheduled-todos/'+encodeURIComponent(made.id));
      try {const row=await api('/unscheduled-todos/'+encodeURIComponent(made.id),{method:'PATCH',body:{completed:true,version:latest.version}});
        if(v.owner===key&&owner()===key)v.items=v.items.map(x=>x.id===row.id?row:x);break;}
      catch(error){if(attempt>=5||!transient(error))throw error;await pause(500*(attempt+1));}
    }
    const todo=await api('/todos',{method:'POST',body:{id:crypto.randomUUID(),date:today,text:group.text}});
    await api('/todos/'+encodeURIComponent(todo.id),{method:'PATCH',body:{completed:true,version:todo.version}});
    if(v.owner===key&&owner()===key)toast(`又做了一次：${group.text}`);
  } catch(error){if(v.owner===key&&owner()===key&&!error.staleSession)v.error=error.message;}
  finally {if(v.owner===key&&owner()===key){v.pending=false;paintUnscheduledTodos();}}
}
