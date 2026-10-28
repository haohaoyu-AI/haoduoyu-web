import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {frontendSource} from './frontend-client.mjs';

const source = await frontendSource();
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');
const item = (id, date, extra = {}) => ({
  id, date, text: `Synthetic ${id}`, completed: false, version: 1,
  created_at: '2026-10-23T08:00:00Z', updated_at: '2026-10-23T08:00:00Z', ...extra,
});

test('calendar presents selected-day plans and completed rows without changing today hide preference',()=>{
  const c=client();
  c.put('done',item('history-completed','2026-10-22',{completed:true}));
  c.run("todoPreferences().mode='hide';state.todoDate='2026-10-22';state.todoPanel='history';todoDay().items=[done];todoDay().loaded=true");
  assert.match(c.run('renderTodos()'),/history-completed/);
  assert.doesNotMatch(c.run('renderTodos()'),/id="todo-main" hidden/);
  assert.match(c.run('renderTodos()'),/>日历<|>待办日历</);
  assert.match(c.run('renderTodos()'),/<form id="todo-form"[^>]*data-date="2026-10-22"/);
  assert.equal(c.run('todoPreferences().mode'),'hide');
  c.run("state.todoPanel=''");
  assert.doesNotMatch(c.run('renderTodos()'),/data-todo-id="history-completed"/);
});

test('a direct future view starts without showing the dated todo editor',()=>{
  const c=client({search:'?page=todos&todo_panel=future'});c.run('readRoute()');
  assert.equal(c.run('state.todoPanel'),'future');const html=c.run('renderTodos()');
  assert.match(html, /id="todo-main" hidden/);assert.match(html, /id="todo-future"[^>]*>/);
  assert.doesNotMatch(html, /id="todo-future"[^>]*hidden/);
});

test('opening history from a direct future link reads the selected date',async()=>{
  const c=client({search:'?page=todos&date=2027-01-01&todo_panel=future'});
  c.run("readRoute();paintTodos=()=>{};let todoLoads=0;loadTodos=async()=>{todoLoads++}");
  await c.run("setTodoPanel('history')");
  assert.equal(c.run('todoLoads'),1);assert.equal(c.run('state.todoDate'),'2027-01-01');
});

test('today-added is based on acknowledged linked items and clears after actual soft deletion',()=>{
  const c=client();
  c.run("templateState().items=[{id:'common',text:'常用'}];todoDay().adding=true;todoDay().submitting={template_id:'common'}");
  assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added hidden/);
  c.put('linked',item('today-linked','2026-10-23',{template_id:'common'}));
  c.run('todoDay().items=[linked]');
  assert.doesNotMatch(c.run('todoTemplateRows(templateState())'),/data-template-added hidden/);
  c.run("todoDay().items[0].deleted_at='2026-10-23T08:01:00Z'");
  assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added hidden/);
});

test('common templates use the selected calendar day and only show acknowledged membership on that day',async()=>{
  for (const date of ['2026-10-20','2026-10-24']) {
    const c=client({search:`?page=todos&date=${date}&todo_panel=templates`});
    c.run("readRoute();paintTodos=()=>{};api=async(path,options)=>({...options.body,completed:false,version:1});let template={id:'common',text:'所选日事项'};templateState().items=[template]");
    assert.equal(c.run('todoDate()'),date);
    await c.run('submitTodoTemplate(template)');
    assert.equal(c.run('todoDay().items[0].date'),date);
    assert.equal(c.run("todoDay('2026-10-23').items.length"),0);
    assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added >当日已添加/);
    c.run("state.todoDate=''");
    assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added hidden>今日已添加/);
    c.run(`todoDay().items=todoDay('${date}').items`);
    assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added hidden>今日已添加/,
      'a linked row from another date cannot produce a today badge');
  }
});

test('inline common templates sit directly below the plan input and use the actual selected-day membership',()=>{
  const c=client();
  c.run("templateState().loaded=true;templateState().items=[{id:'common',text:'<常用事项>'}];todoDay().loaded=true");
  const html=c.run('renderTodos()');
  assert.match(html,/<\/form><div id="todo-inline-templates" class="todo-inline-templates"/);
  assert.ok(html.indexOf('id="todo-inline-templates"')<html.indexOf('id="todo-feedback"'));
  assert.match(html,/管理常用/);
  let chips=c.run('renderInlineTodoTemplates()');
  assert.match(chips,/class="todo-template-chip"[^>]*data-action="todo-template-use"[^>]*data-id="common"/);
  assert.match(chips,/&lt;常用事项&gt;/);
  assert.doesNotMatch(chips,/<button[^>]*disabled|今日已添加/);
  c.put('linked',item('hidden-completed-template','2026-10-23',{template_id:'common',completed:true}));
  c.run("todoDay().items=[linked];todoPreferences().mode='hide'");
  chips=c.run('renderInlineTodoTemplates()');
  assert.match(chips,/class="todo-template-chip is-added"[^>]*disabled/);
  assert.match(chips,/>今日已添加</);
  c.run("state.todoDate='2026-10-24';todoDay().loaded=true;todoDay().items=[linked]");
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/is-added|已添加/,
    'another date cannot mark the selected future day as added');
  c.run("todoDay().items=[{...linked,date:'2026-10-24'}]");
  assert.match(c.run('renderInlineTodoTemplates()'),/>当日已添加</);
  c.run("todoDay().items[0].deleted_at='2026-10-23T09:00:00Z'");
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/is-added|已添加/);
});

test('the daily page loads common templates immediately and waits for the day before permitting a single click add',async()=>{
  const c=client();
  c.run(`paintTodos=()=>{};let reads=[],writes=[],finishTemplates,finishDay,finishAdd;
    api=(path,options={})=>{
      if(options.method){writes.push(options.body);return new Promise(resolve=>finishAdd=resolve)}
      reads.push(path);return new Promise(resolve=>{if(path==='/todo-templates')finishTemplates=resolve;else finishDay=resolve})};
    let reading=loadTodos()`);
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(reads)')),['/todo-templates','/todos?date=2026-10-23']);
  c.run("finishTemplates({items:[{id:'common',text:'常用事项'}]})");
  await Promise.resolve();
  await c.run("useTodoTemplate('common')");
  assert.equal(c.run('writes.length'),0,'membership must be read before a template can be added');
  assert.match(c.run('renderInlineTodoTemplates()'),/<button[^>]*disabled/);
  c.run('finishDay({items:[]})');
  await c.run('reading');
  c.run("todoDay().draft='正在输入的中文草稿';let adding=useTodoTemplate('common')");
  await c.run("useTodoTemplate('common')");
  assert.equal(c.run('writes.length'),1);
  assert.equal(c.run('writes[0].date'),'2026-10-23');
  assert.match(c.run('renderInlineTodoTemplates()'),/<button[^>]*disabled/);
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/今日已添加/,'pending optimistic rows are not acknowledged membership');
  c.run('finishAdd({...writes[0],completed:false,version:1})');
  await c.run('adding');
  await c.run("useTodoTemplate('common')");
  assert.equal(c.run('writes.length'),1,'an acknowledged template cannot be added again to the same day');
  assert.match(c.run('renderInlineTodoTemplates()'),/is-added[^>]*disabled/);
  assert.equal(c.run('todoDay().draft'),'正在输入的中文草稿');
});

test('failed inline template adds keep one request identity and retries on the selected future date',async()=>{
  const c=client();
  c.run(`paintTodos=()=>{};state.todoDate='2026-10-24';todoDay().loaded=true;templateState().loaded=true;
    templateState().items=[{id:'common',text:'未来日常用事项'}];let requests=[],rejectAdd;
    api=(_path,options)=>{requests.push(options.body);return new Promise((_,reject)=>rejectAdd=reject)};
    let adding=useTodoTemplate('common')`);
  c.run("rejectAdd(new Error('离线暂未添加'))");
  await c.run('adding');
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/is-added|当日已添加|<button[^>]*disabled/);
  const first=c.run('JSON.stringify(requests[0])');
  c.run("api=async(_path,options)=>{requests.push(options.body);return {...options.body,completed:false,version:1}}");
  await c.run("useTodoTemplate('common')");
  assert.equal(c.run('JSON.stringify(requests[1])'),first);
  assert.equal(c.run('requests[1].date'),'2026-10-24');
  assert.match(c.run('renderInlineTodoTemplates()'),/>当日已添加</);
  c.run("state.todoDate='';todoDay().loaded=true");
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/is-added|已添加/);
});

test('template reads from an earlier selected date cannot replace the current inline list',async()=>{
  const c=client();
  c.run(`paintTodos=()=>{};let templateReads=[];
    api=path=>path==='/todo-templates'?new Promise(resolve=>templateReads.push(resolve)):Promise.resolve({items:[]});
    let firstRead=loadTodos();state.todoDate='2026-10-24';let secondRead=loadTodos()`);
  assert.equal(c.run('templateReads.length'),2);
  c.run("templateReads[1]({items:[{id:'current',text:'当前选定日期可用'}]})");
  await c.run('secondRead');
  await Promise.resolve();
  c.run("templateReads[0]({items:[{id:'obsolete',text:'旧请求不得覆盖'}]})");
  await c.run('firstRead');
  await Promise.resolve();
  assert.match(c.run('renderInlineTodoTemplates()'),/当前选定日期可用/);
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/旧请求不得覆盖/);
  assert.equal(c.run('templateState().loading'),false);
});

function client({search = '', now = '2026-10-23T08:00:00Z', mobile = false} = {}) {
  let currentTime = Date.parse(now), uuid = 0, timerId = 0, index = 0;
  const timers = new Map(), events = new Map(), windowEvents = new Map(), nodes = new Map();
  const entries = [`http://localhost/${search}`], location = {href: entries[0], search};
  const node = () => ({
    innerHTML: '', firstChild: null, isConnected: true, dataset: {}, style: {},
    querySelectorAll() {return [];}, querySelector() {return null;}, contains() {return false;},
    setAttribute() {}, removeAttribute() {}, focus() {},
  });
  for (const selector of ['#app', '#overlay', '#page-content']) nodes.set(selector, node());
  const body = node(), document = {
    body, activeElement: body, visibilityState: 'visible',
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: () => [], addEventListener: (name, handler) => {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(handler);
    },
  };
  const locate = value => {
    location.href = String(value);
    location.search = new URL(value).search;
  };
  const history = {
    replaceState(_data, _title, value) {entries[index] = String(value);locate(value);},
    pushState(_data, _title, value) {entries.splice(++index);entries[index] = String(value);locate(value);},
  };
  class Clock extends Date {
    constructor(...args) {super(...(args.length ? args : [currentTime]));}
    static now() {return currentTime;}
  }
  const setTimer = callback => {const id = ++timerId;timers.set(id, callback);return id;};
  const context = vm.createContext({
    AbortController, AbortSignal, DOMException, Headers, Response, URL, URLSearchParams, Intl, console,
    Date: Clock, crypto: {randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`},
    document, location, history, localStorage: {getItem() {return null;}, setItem() {}},
    window: {
      addEventListener: (name, handler) => windowEvents.set(name, handler), scrollTo() {},
      matchMedia: query => ({matches: mobile && query === '(max-width:760px)'}),
    },
    setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    setInterval: setTimer, clearInterval: id => timers.delete(id), requestAnimationFrame() {},
  });
  new vm.Script(source).runInContext(context);
  const run = script => vm.runInContext(script, context);
  run("state.me={id:'synthetic-todo-user',username:'Synthetic user',csrfToken:'synthetic-csrf'};state.page='todos'");
  return {
    run, nodes, events, windowEvents, location, timers,
    setNow(value) {currentTime = Date.parse(value);},
    put(name, value) {context[name] = value;},
    async dispatch(name, event) {for (const handler of events.get(name) || []) await handler(event);},
    back() {locate(entries[--index]);windowEvents.get('popstate')?.();},
    get historyLength() {return entries.length;},
  };
}

function prepareForm(c, {date = '2026-10-23', text = '写下今天的计划'} = {}) {
  const form = {dataset: {date}, isConnected: true, querySelector() {return null;}};
  c.put('syntheticTodoForm', form);
  c.put('todoData', {text});
  c.run(`paintTodos=()=>{};todoDay(${JSON.stringify(date)}).draft=${JSON.stringify(text)}`);
  return form;
}

test('future calendar plans save and reload on the chosen date and returning today preserves that day',async()=>{
  const c=client({search:'?page=todos&date=2027-01-01&todo_panel=history'});
  c.run("readRoute();let saved=[],calls=[];paintTodos=()=>{};api=async(path,options)=>{calls.push({path,options});if(options?.method){const row={...options.body,completed:false,version:1};saved.push(row);return row}return {items:saved.filter(row=>row.date===new URL('http://localhost'+path).searchParams.get('date'))}};");
  const html=c.run('renderTodos()');
  assert.match(html,/<form id="todo-form"[^>]*data-date="2027-01-01"/);
  assert.doesNotMatch(html,/<form[^>]*hidden[^>]*id="todo-form"/);
  assert.match(html,/data-action="todo-panel-close">‹ 返回今日待办/);
  prepareForm(c,{date:'2027-01-01',text:'提前安排元旦计划'});
  await c.run('submitTodo({form:syntheticTodoForm,data:todoData})');
  assert.equal(c.run('calls[0].options.body.date'),'2027-01-01');
  assert.equal(c.run("todoDay('2026-10-23').items.length"),0);
  c.run('todoDay().items=[]');
  await c.run('loadTodos()');
  assert.equal(c.run('todoDay().items[0].text'),'提前安排元旦计划');
  await c.run("setTodoPanel('')");
  assert.equal(c.run('todoDate()'),'2026-10-23');
  assert.equal(c.run('state.todoPanel'),'');
  assert.equal(new URL(c.location.href).searchParams.has('date'),false);
  assert.equal(new URL(c.location.href).searchParams.has('todo_panel'),false);
  assert.equal(c.run("todoDay('2027-01-01').items[0].text"),'提前安排元旦计划');
});

test('a selected calendar date stays pinned across Beijing midnight and template badges follow the actual day',async()=>{
  const c=client({now:'2026-10-23T15:59:59Z'});
  c.run("paintTodos=()=>{};api=async()=>({items:[]});templateState().loaded=true;templateState().items=[{id:'common',text:'常用'}];state.todoPanel='history';selectTodoDate('2026-10-23')");
  c.put('linked',item('selected-today-linked','2026-10-23',{template_id:'common'}));
  c.run('todoDay().items=[linked]');
  assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added >今日已添加/);
  assert.match(c.run('renderInlineTodoTemplates()'),/>今日已添加</);
  c.setNow('2026-10-23T16:00:00Z');
  c.run('syncTodoDay()');
  assert.equal(c.run('todoDate()'),'2026-10-23');
  assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added >当日已添加/);
  assert.match(c.run('renderInlineTodoTemplates()'),/>当日已添加</);
  await c.run("setTodoPanel('')");
  assert.equal(c.run('todoDate()'),'2026-10-24');
  assert.match(c.run('todoTemplateRows(templateState())'),/data-template-added hidden>今日已添加/);
  assert.doesNotMatch(c.run('renderInlineTodoTemplates()'),/is-added|已添加/);
  assert.equal(c.run("todoDay('2026-10-23').items[0].date"),'2026-10-23');
});

test('today follows Beijing midnight while explicit history and unfinished items stay on their original date', () => {
  const c = client({now: '2026-10-23T15:59:59Z'});
  c.run('syncTodoDay()');
  assert.equal(c.run('todoDate()'), '2026-10-23');
  c.put('oldItem', item('unfinished', '2026-10-23'));
  c.run("todoDay().items=[oldItem];todoDay().draft='昨天没提交的输入'");
  c.setNow('2026-10-23T16:00:00Z');
  assert.equal(c.run('syncTodoDay()'), true);
  assert.equal(c.run('todoDate()'), '2026-10-24');
  assert.equal(c.run('todoDay().items.length'), 0);
  assert.equal(c.run("todoDay('2026-10-23').items[0].completed"), false);
  assert.equal(c.run("todoDay('2026-10-23').draft"), '昨天没提交的输入');
  c.run("state.page='todos';state.todoDate='2026-10-23'");
  assert.equal(c.run('todoDate()'), '2026-10-23');
  assert.equal(c.run('todoDay().items[0].id'), 'unfinished');
  assert.equal(c.run('syncTodoDay()'), false);
});

test('date route validation retains real history dates and rejects impossible calendar days', () => {
  const c = client({search: '?page=todos&date=2026-10-20'});
  c.run('readRoute();updateRoute()');
  assert.equal(c.run('state.page'), 'todos');
  assert.equal(c.run('todoDate()'), '2026-10-20');
  assert.equal(new URL(c.location.href).searchParams.get('date'), '2026-10-20');
  for (const date of ['2024-02-29', '2026-01-01', '2026-12-31']) {
    assert.equal(c.run(`validTodoDate(${JSON.stringify(date)})`), true, date);
  }
  for (const date of ['0000-01-01', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '<script>']) {
    assert.equal(c.run(`validTodoDate(${JSON.stringify(date)})`), false, date);
  }
});

test('phones and desktop open daily plans by default while explicit page links keep their destinations', () => {
  for (const [mobile, search, expected] of [
    [true, '', 'todos'], [false, '', 'todos'],
    [true, '?page=dashboard', 'dashboard'], [true, '?page=articles', 'articles'],
    [false, '?page=dashboard', 'dashboard'], [false, '?page=articles', 'articles'],
    [true, '?page=settings&tab=keys', 'settings'], [true, '?page=todos&date=2026-10-20', 'todos'],
  ]) {
    const c = client({mobile, search});
    c.run('readRoute();updateRoute()');
    assert.equal(c.run('state.page'), expected, `${mobile}: ${search}`);
    assert.equal(new URL(c.location.href).searchParams.get('page'), expected);
    if (search.includes('date=')) assert.equal(c.run('todoDate()'), '2026-10-20');
  }
});

test('calendar browsing handles leap months and year boundaries without changing the selected date or draft', () => {
  const c = client({search: '?page=todos&date=2024-02-29'});
  c.run("readRoute();todoDay().draft='保留所选日的草稿';let calendarReads=0;api=()=>{calendarReads++}");
  const february = c.run('todoCalendar(todoDate())');
  assert.equal((february.match(/data-action="todo-calendar-date"/g) || []).length, 29);
  assert.match(february, /data-date="2024-02-29"[^>]*aria-pressed="true"/);
  c.run('moveTodoMonth(-1)');
  assert.match(c.run('todoCalendar(todoDate())'), /2024年1月/);
  assert.equal(c.run('todoDate()'), '2024-02-29');
  assert.equal(c.run('todoDay().draft'), '保留所选日的草稿');
  c.run("state.todoDate='2026-12-31';todoCalendar(todoDate());moveTodoMonth(1)");
  assert.match(c.run('todoCalendar(todoDate())'), /2027年1月/);
  assert.equal(c.run('todoDate()'), '2026-12-31');
  for (const [date, offset] of [['0001-01-01', -1], ['9999-12-31', 1]]) {
    c.run(`state.todoDate='${date}';todoCalendar(todoDate());moveTodoMonth(${offset})`);
    assert.equal(c.run('todosState.calendarMonth'), date.slice(0, 7));
  }
  assert.equal(c.run('calendarReads'), 0, 'browsing another month does not read or write daily data');
  c.run("resetSessionIndexes();state.me={id:'another-user'};todoDay()");
  assert.equal(c.run('todosState.calendarMonth'), '');
  assert.equal(c.run('todosState.calendarDate'), '');
});

test('daily list escapes text and renders checked items without inline styles', () => {
  const c = client();
  c.put('completedItem', item('completed', '2026-10-23', {text: '<img onerror="bad">', completed: true}));
  c.run('todoDay().items=[completedItem];todoDay().loaded=true');
  const html = c.run('renderTodos()');
  assert.match(html, /type="checkbox"/);
  assert.match(html, /checked/);
  assert.match(html, /daily-todo-row is-complete/);
  assert.match(css, /\.daily-todo-row\.is-complete\s+\.daily-todo-text\s*\{[^}]*text-decoration:\s*line-through/);
  assert.match(html, /&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.doesNotMatch(html, /<img|\sstyle\s*=/i);
  assert.match(html, /maxlength="500"/);
});

test('an in-flight create is single-submit; a failed create preserves the draft and UUID for retry', async () => {
  const c = client();
  prepareForm(c);
  c.run(`let calls=[], rejectCreate;
    api=(path, options)=>{calls.push({path,options});return new Promise((_,reject)=>rejectCreate=reject)};
    let pendingCreate=submitTodo({form:syntheticTodoForm,data:todoData})`);
  await c.run('submitTodo({form:syntheticTodoForm,data:todoData})');
  assert.equal(c.run('calls.length'), 1);
  assert.equal(c.run('todoDay().adding'), true);
  c.run("rejectCreate(new Error('Synthetic offline'))");
  await c.run('pendingCreate').catch(() => {});
  assert.equal(c.run('todoDay().draft'), '写下今天的计划');
  assert.equal(c.run('todoDay().adding'), false);
  const first = c.run('JSON.stringify(calls[0].options.body)');
  c.run(`api=async(path,options)=>{calls.push({path,options});return {...options.body,completed:false,version:1}}`);
  await c.run('submitTodo({form:syntheticTodoForm,data:todoData})');
  assert.equal(c.run('calls.length'), 2);
  assert.equal(c.run('JSON.stringify(calls[1].options.body)'), first);
  assert.equal(c.run('todoDay().items.length'), 1);
  assert.equal(c.run('todoDay().draft'), '');
  assert.equal(c.run('todoDay().adding'), false);
  assert.match(c.run('renderTodos()'), /已添加/, 'successful create has visible confirmation');
});

test('invalid input remains editable and does not send a create request', async () => {
  for (const text of ['   ', '😀'.repeat(251)]) {
    const c = client();
    prepareForm(c, {text});
    c.run('let writes=0;api=async()=>{writes++;return {}}');
    await c.run('submitTodo({form:syntheticTodoForm,data:todoData})');
    assert.equal(c.run('writes'), 0);
    assert.equal(c.run('todoDay().draft'), text);
    assert.equal(c.run('todoDay().adding'), false);
    assert.ok(c.run('todoDay().error'));
  }
});

test('late history reads cannot overwrite a new date or disclose the old user after a session reset', async () => {
  for (const switchSession of [false, true]) {
    const c = client();
    c.run(`paintTodos=()=>{};state.page='todos';state.todoDate='2026-10-22';
      let finishOld;api=()=>new Promise(resolve=>finishOld=resolve);let oldRead=loadTodos()`);
    if (switchSession) c.run("resetSessionIndexes();state.me={id:'second-user'}");
    c.run("state.todoDate='2026-10-23';runtime.renderVersion++");
    c.put('fresh', item('fresh', '2026-10-23'));
    c.run("api=async()=>({date:'2026-10-23',today:'2026-10-23',items:[fresh]})");
    await c.run('loadTodos()');
    c.put('obsolete', item('obsolete-private', '2026-10-22'));
    c.run("finishOld({date:'2026-10-22',today:'2026-10-23',items:[obsolete]})");
    await c.run('oldRead');
    assert.equal(c.run('todoDay().items[0].id'), 'fresh');
    assert.equal(c.run("todoDay('2026-10-22').items.length"), 0);
  }
});

test('late creates and errors from a signed-out session leave the next user draft and list untouched', async () => {
  for (const fail of [false, true]) {
    const c = client();
    prepareForm(c);
    c.run(`let finishOld,rejectOld;
      api=()=>new Promise((resolve,reject)=>{finishOld=resolve;rejectOld=reject});
      let oldCreate=submitTodo({form:syntheticTodoForm,data:todoData})`);
    c.run("resetSessionIndexes();state.me={id:'second-user'};todoDay().draft='下一位用户的输入'");
    c.put('oldResult', item('old-private', '2026-10-23'));
    c.run(fail ? "rejectOld(new Error('old private failure'))" : 'finishOld(oldResult)');
    await c.run('oldCreate').catch(() => {});
    assert.equal(c.run('todoDay().draft'), '下一位用户的输入');
    assert.equal(c.run('todoDay().items.length'), 0);
    assert.equal(c.run('todoDay().error'), '');
    assert.equal(c.run('todoDay().adding'), false);
  }
});

test('a completion conflict reloads the saved state and keeps the item available to retry', async () => {
  const c = client();
  c.put('original', item('complete-me', '2026-10-23'));
  c.put('latest', item('complete-me', '2026-10-23', {completed: true, version: 2}));
  c.put('checkbox', {dataset: {todoId: 'complete-me', date: '2026-10-23'}, checked: true, isConnected: true});
  c.run(`paintTodos=()=>{};todoDay().items=[original];todoDay().loaded=true;let calls=[];
    api=async(path,options={})=>{calls.push({path,options});
      if(options.method==='PATCH')throw Object.assign(new Error('Synthetic conflict'),{status:409,code:'VERSION_CONFLICT'});
      return {date:'2026-10-23',today:'2026-10-23',items:[latest]}}`);
  await c.run('toggleTodo(checkbox)').catch(() => {});
  assert.equal(c.run("calls.filter(call=>call.options.method==='PATCH').length"), 1);
  assert.equal(c.run('calls[0].options.body.version'), 1);
  assert.equal(c.run('todoDay().items[0].completed'), true);
  assert.equal(c.run('todoDay().items[0].version'), 2);
  assert.equal(c.run('todoDay().updates.size'), 0);
});

test('a stale pre-write read is refreshed before replacing the successfully added item', async () => {
  const c = client();
  prepareForm(c);
  c.run(`let getCount=0,finishRead,created;
    api=(path,options={})=>{
      if(path==='/todo-templates')return Promise.resolve({items:[]});
      if(options.method==='POST'){created={...options.body,completed:false,version:1};return Promise.resolve(created)}
      if(++getCount===1)return new Promise(resolve=>finishRead=resolve);
      return Promise.resolve({date:'2026-10-23',today:'2026-10-23',items:[created]})};
    let staleRead=loadTodos()`);
  await c.run('submitTodo({form:syntheticTodoForm,data:todoData})');
  c.run("finishRead({date:'2026-10-23',today:'2026-10-23',items:[]})");
  await c.run('staleRead');
  assert.equal(c.run('getCount'), 2);
  assert.equal(c.run('todoDay().items.length'), 1);
  assert.equal(c.run('todoDay().items[0].text'), '写下今天的计划');
  assert.equal(c.run('todoDay().loading'), false);
});

test('pending completion requests cannot be duplicated and can be undone after saving', async () => {
  const c = client();
  c.put('original', item('check-once', '2026-10-23'));
  c.put('checkbox', {dataset: {todoId: 'check-once', date: '2026-10-23'}, checked: true});
  c.run(`paintTodos=()=>{};todoDay().items=[original];let calls=[],finishPatch;
    api=(path,options)=>{calls.push({path,options});return new Promise(resolve=>finishPatch=resolve)};
    let firstPatch=toggleTodo(checkbox)`);
  await c.run('toggleTodo(checkbox)');
  assert.equal(c.run('calls.length'), 1);
  c.run('finishPatch({...original,completed:true,version:2})');
  await c.run('firstPatch');
  assert.equal(c.run('todoDay().items[0].completed'), true);
  c.run(`checkbox.checked=false;
    api=async(path,options)=>{calls.push({path,options});return {...original,completed:false,version:3}}`);
  await c.run('toggleTodo(checkbox)');
  assert.equal(c.run('calls[1].options.body.version'), 2);
  assert.equal(c.run('calls[1].options.body.completed'), false);
  assert.equal(c.run('todoDay().items[0].completed'), false);
  assert.doesNotMatch(c.run('todoStatus(todoDay())'), /已保存/, 'routine completion does not add a save banner');
});

test('completion and undo respond before the network and roll back to saved state after a failure', async () => {
  for (const saved of [false, true]) {
    const c = client();
    c.put('original', item('instant-feedback', '2026-10-23', {completed: saved, version: 4}));
    c.put('checkbox', {dataset: {todoId: 'instant-feedback', date: '2026-10-23'}, checked: !saved});
    c.run(`paintTodos=()=>{};todoDay().items=[original];todoDay().loaded=true;let calls=[],rejectPatch;
      api=(path,options)=>{calls.push({path,options});return new Promise((_,reject)=>rejectPatch=reject)};
      let pendingPatch=toggleTodo(checkbox)`);
    const pending = c.run('renderTodos()');
    assert.equal(/class="daily-todo-row[^\"]*\bis-complete\b/.test(pending), !saved, 'strike state changes before response');
    assert.equal(/\bchecked(?:\s|>)/.test(pending), !saved, 'checkbox changes before response');
    assert.doesNotMatch(pending, /保存中/, "fast pending updates do not flash duplicate saving text");
    assert.equal(c.run('todoDay().items[0].completed'), saved, 'persisted state remains the rollback source');
    c.run(`checkbox.checked=${saved}`);
    await c.run('toggleTodo(checkbox)');
    assert.equal(c.run('calls.length'), 1, 'repeated pending click does not send a second write');
    assert.equal(c.run('checkbox.checked'), !saved, 'repeated pending click keeps the requested visual state');
    assert.equal(c.run('calls[0].options.body.version'), 4);
    assert.equal(c.run('calls[0].options.body.completed'), !saved);
    c.run("rejectPatch(new Error('Synthetic save failure'))");
    await c.run('pendingPatch');
    const failed = c.run('renderTodos()');
    assert.equal(/class="daily-todo-row[^\"]*\bis-complete\b/.test(failed), saved);
    assert.equal(/\bchecked(?:\s|>)/.test(failed), saved);
    assert.match(failed, /Synthetic save failure/);
    assert.equal(c.run('todoDay().items[0].version'), 4);
    assert.equal(c.run('todoDay().updates.size'), 0);
    assert.equal(c.run('calls.length'), 1, 'failure does not replay the write');
  }
});

test('one failed row remains visibly failed when another concurrent completion succeeds', async () => {
  const c = client();
  c.put('first', item('failed-row', '2026-10-23'));
  c.put('second', item('saved-row', '2026-10-23'));
  c.run(`paintTodos=()=>{};todoDay().items=[first,second];todoDay().loaded=true;
    let rejectFirst,finishSecond;
    api=(path)=>path.endsWith('failed-row')?new Promise((_,reject)=>rejectFirst=reject):new Promise(resolve=>finishSecond=resolve);
    let firstWrite=toggleTodo({dataset:{todoId:first.id,date:first.date},checked:true});
    let secondWrite=toggleTodo({dataset:{todoId:second.id,date:second.date},checked:true});
    rejectFirst(new Error('First row failed'))`);
  await c.run('firstWrite');
  assert.equal(c.run('todoDay().updates.size'), 1);
  c.run('finishSecond({...second,completed:true,version:2})');
  await c.run('secondWrite');
  assert.equal(c.run('todoDay().items[0].completed'), false);
  assert.equal(c.run('todoDay().items[1].completed'), true);
  assert.match(c.run('renderTodos()'), /First row failed/);
  assert.doesNotMatch(c.run('todoStatus(todoDay())'), /已保存/);
});

test('late template reads and writes cannot replace the next session private list or draft', async () => {
  for (const kind of ['read', 'create', 'failure']) {
    const c = client();
    c.run(`paintTodoTemplates=()=>{};templateState().draft='old private draft';let finish,reject;
      api=()=>new Promise((resolve,fail)=>{finish=resolve;reject=fail})`);
    c.run(kind === 'read' ? 'let oldOperation=loadTodoTemplates()' :
      "let oldOperation=submitTodoTemplateForm({data:{text:'old private draft'}})");
    c.run("resetSessionIndexes();state.me={id:'new-template-owner'};templateState().draft='new private draft'");
    c.run(kind === 'failure' ? "reject(new Error('old private error'))" :
      kind === 'read' ? "finish({items:[{id:'old-private-template',text:'private'}]})" :
      "finish({id:'old-private-template',text:'private',version:1})");
    await c.run('oldOperation');
    assert.equal(c.run('templateState().draft'), 'new private draft', kind);
    assert.equal(c.run('templateState().items.length'), 0, kind);
    assert.equal(c.run('templateState().error'), '', kind);
    assert.equal(c.run('templateState().adding'), false, kind);
  }
});

test('a template conflict cannot update another edit target or a new session after its follow-up read', async () => {
  for (const switchSession of [false, true]) {
    const c = client();
    c.run(`paintTodoTemplates=()=>{};
      templateState().items=[{id:'template-a',text:'A',version:1},{id:'template-b',text:'B',version:1}];
      editTodoTemplate('template-a');let rejectWrite,finishRead;
      api=(_path,options={})=>options.method==='PATCH'?new Promise((_,reject)=>rejectWrite=reject):new Promise(resolve=>finishRead=resolve);
      let failedWrite=writeTodoTemplate('template-a','Updated A');
      editTodoTemplate('template-b');templateState().editDraft='My unchanged B draft';
      rejectWrite(Object.assign(new Error('Synthetic version conflict'),{status:409,code:'VERSION_CONFLICT'}))`);
    await Promise.resolve();
    assert.equal(c.run('typeof finishRead'), 'function');
    if (switchSession) c.run(`resetSessionIndexes();state.me={id:'new-owner-after-conflict'};
      templateState().items=[{id:'template-b',text:'Private B',version:1}];
      editTodoTemplate('template-b');templateState().editDraft='New owner draft'`);
    c.run("finishRead({items:[{id:'template-a',text:'Remote A',version:2},{id:'template-b',text:'Remote B',version:2}]})");
    await c.run('failedWrite');
    assert.equal(c.run('templateState().editing.id'), 'template-b');
    assert.equal(c.run('templateState().editing.version'), 1, 'a different editor keeps its original CAS version');
    assert.equal(c.run('templateState().editDraft'), switchSession ? 'New owner draft' : 'My unchanged B draft');
    if (switchSession) {
      assert.equal(c.run('templateState().items[0].text'), 'Private B');
      assert.equal(c.run('templateState().error'), '');
    }
  }
});

test('daily plans and explicit statistics overview render and request independently', async () => {
  const c = client();
  c.run(`state.page='todos';paintTodos=()=>{};let reads=[];
    api=async path=>{reads.push(path);return {date:'2026-10-23',today:'2026-10-23',items:[]}}`);
  await c.run('renderPage()');
  assert.match(c.nodes.get('#page-content').innerHTML, /id="todo-form"/);
  assert.deepEqual(JSON.parse(c.run('JSON.stringify(reads)')), ['/todo-templates','/todos?date=2026-10-23']);
  c.run(`state.page='dashboard';reads=[];renderDashboardSummary=()=>'<section>Independent statistics</section>';
    api=async path=>{reads.push(path);
      if(path.startsWith('/overview?'))return {items:[]};
      throw new Error('Unexpected statistics read: '+path)}`);
  await c.run('renderPage()');
  assert.deepEqual(JSON.parse(c.run("JSON.stringify(reads.map(path=>new URL(path,'http://localhost').pathname))")),
    ['/overview']);
  assert.match(c.run('reads[0]'), /^\/overview\?/);
  assert.match(c.nodes.get('#page-content').innerHTML, /Independent statistics/);
  assert.doesNotMatch(c.nodes.get('#page-content').innerHTML, /todo-form|daily-todos/);
});

test('midnight timer and returning-tab events switch today automatically without moving yesterday items', async () => {
  for (const trigger of ['timer', 'focus', 'visibilitychange']) {
    const c = client({now: '2026-10-23T15:59:59Z'});
    c.put('yesterday', item('yesterday', '2026-10-23'));
    c.run(`paintTodos=()=>{};todoDay().items=[yesterday];let reads=[];
      api=async path=>{reads.push(path);return {date:'2026-10-24',today:'2026-10-24',items:[]}}`);
    c.setNow('2026-10-23T16:00:01Z');
    if (trigger === 'timer') c.timers.values().next().value();
    else if (trigger === 'focus') c.windowEvents.get('focus')();
    else await c.dispatch('visibilitychange', {});
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(c.run('todoDate()'), '2026-10-24', trigger);
    assert.equal(c.run("reads.find(path=>path.startsWith('/todos?'))"), '/todos?date=2026-10-24', trigger);
    assert.equal(c.run('todoDay().items.length'), 0, trigger);
    assert.equal(c.run("todoDay('2026-10-23').items[0].id"), 'yesterday', trigger);
  }
});

test('list updates preserve input and caret while pinned-day labels follow Beijing midnight', () => {
  const c = client(), slots = new Map();
  const input = {value: '正在输入计划', selectionStart: 3, selectionEnd: 3, readOnly: false, placeholder: '今天想完成什么？'};
  const label = {textContent: '今天想完成什么？'};
  const button = {disabled: false, textContent: '添加', setAttribute() {}};
  for (const id of ['todo-caption', 'todo-status', 'todo-items', 'todo-feedback']) slots.set('#' + id, {innerHTML: ''});
  slots.set('#todo-text', input);
  slots.set('label[for="todo-text"]', label);
  slots.set('button[type=submit]', button);
  const root = {setAttribute() {}, querySelectorAll:()=>[], dataset: {date: '2026-10-23'}, querySelector: selector => slots.get(selector) || null};
  Object.defineProperty(root, 'outerHTML', {set() {assert.fail('same-day refresh must retain the existing form');}});
  c.nodes.set('#daily-todos', root);
  c.put('syntheticInput', input);
  c.run("document.activeElement=syntheticInput;todoDay().draft='正在输入计划';todoDay().loaded=true;paintTodos()");
  assert.equal(c.run('document.activeElement===syntheticInput'), true);
  assert.equal(input.value, '正在输入计划');
  assert.equal(input.selectionStart, 3);
  assert.equal(input.selectionEnd, 3);
  c.run("state.todoDate='2026-10-23'");
  c.setNow('2026-10-23T16:00:00Z');
  c.run('syncTodoDay();paintTodos()');
  assert.equal(c.run('todoDate()'), '2026-10-23');
  assert.equal(input.placeholder, '这一天的计划');
  assert.equal(label.textContent, '这一天的计划');
  assert.equal(c.run('document.activeElement===syntheticInput'), true);
  assert.equal(input.value, '正在输入计划');
  assert.equal(input.selectionStart, 3);
  assert.equal(input.selectionEnd, 3);
});

test('saving a task does not recreate an active history date control', () => {
  const c = client(), slots = new Map(), dateInput = {value: '2026-10-22', dataset: {}};
  const heading = {};
  Object.defineProperty(heading, 'innerHTML', {set() {assert.fail('caption updates must retain the date input');}});
  slots.set('#todo-heading', heading);
  slots.set('#todo-date', dateInput);
  for (const id of ['todo-caption', 'todo-status', 'todo-items', 'todo-feedback']) slots.set('#' + id, {innerHTML: ''});
  const root = {setAttribute() {}, querySelectorAll:()=>[], dataset: {date: '2026-10-22'}, querySelector: selector => slots.get(selector) || null};
  Object.defineProperty(root, 'outerHTML', {set() {assert.fail('same-date save must retain the date controls');}});
  c.nodes.set('#daily-todos', root);
  c.put('syntheticDateInput', dateInput);
  c.put('completedTask', item('completed-history', '2026-10-22', {completed: true}));
  c.run("state.page='todos';state.todoDate='2026-10-22';document.activeElement=syntheticDateInput;todoDay().items=[completedTask];paintTodos()");
  assert.equal(c.run('document.activeElement===syntheticDateInput'), true);
  assert.equal(dateInput.value, '2026-10-22');
  assert.match(slots.get('#todo-items').innerHTML, /is-complete/, 'row still updates without replacing the date control');
});

test('repeated canonical navigation retains history, legacy reviews resolves to articles, and explicit actions refresh', () => {
  for (const page of ['dashboard', 'todos', 'articles', 'settings']) {
    const c = client({search: `?page=${page}&tab=workspace`, mobile: true});
    c.run('readRoute();updateRoute();let rendered=0;renderShell=()=>{rendered++}');
    const length = c.historyLength;
    c.run(`navigateLink(${JSON.stringify(page)})`);
    assert.equal(c.historyLength, length, page);
    assert.equal(c.run('rendered'), 0, page);
    assert.equal(c.run('state.page'), page);
    if (page === 'articles') {
      c.run("actionMissingList({target:{dataset:{status:'missing_reads'}}})");
      assert.equal(c.run('state.filters.data_status'), 'missing_reads');
      assert.equal(c.run('rendered'), 1, 'same-page article filter action still renders');
      assert.equal(c.historyLength, length + 1);
    }
  }
  const legacy=client({search:'?page=reviews',mobile:true});
  legacy.run('readRoute();updateRoute();let rendered=0;renderShell=()=>{rendered++}');
  assert.equal(legacy.run('state.page'),'articles');
  assert.equal(new URL(legacy.location.href).searchParams.get('page'),'articles');
  const length=legacy.historyLength;
  legacy.run("navigateLink('articles')");
  assert.equal(legacy.historyLength,length);
  assert.equal(legacy.run('rendered'),0);
  legacy.run("navigate('reviews')");
  assert.equal(legacy.run('state.page'),'articles');
  assert.equal(new URL(legacy.location.href).searchParams.get('page'),'articles');
  assert.equal(legacy.historyLength,length+1);
  assert.equal(legacy.run('rendered'),1);
});

test('daily-plan navigation returns historical dates to today and settings navigation returns to workspace', () => {
  for (const [search, page, check] of [
    ['?page=todos&date=2026-10-22', 'todos', "state.todoDate===''&&todoDate()==='2026-10-23'"],
    ['?page=settings&tab=keys', 'settings', "state.settingsTab==='workspace'"],
  ]) {
    const c = client({search, mobile: true});
    c.run('readRoute();updateRoute();let rendered=0;renderShell=()=>{rendered++}');
    c.run(`navigateLink(${JSON.stringify(page)})`);
    assert.equal(c.run(check), true, search);
    assert.equal(c.run('rendered'), 1, search);
    assert.equal(c.historyLength, 2, search);
  }
});

test('navigation reuses the shell within one session and rebuilds it after the user or session changes', () => {
  for (const change of ['session', 'user']) {
    const c = client(), links = ['dashboard', 'todos'].map(page => ({
      dataset: {nav: page}, active: false,
      classList: {toggle(_name, current) {this.current = current;}},
      setAttribute(name, value) {this[name] = value;}, removeAttribute(name) {delete this[name];},
    }));
    const shellClasses = new Set(['menu-open']);
    const shell = {
      dataset: {session: '0', user: 'synthetic-todo-user'},
      classList: {
        contains(name) {return shellClasses.has(name);},
        toggle(name, force = !shellClasses.has(name)) {
          if (force) shellClasses.add(name);else shellClasses.delete(name);
          return force;
        },
      }, querySelectorAll: () => links,
    };
    const main = {innerHTML: ''};
    c.nodes.set('.shell', shell);
    c.nodes.set('#main', main);
    let appWrites = 0, appHTML = '';
    Object.defineProperty(c.nodes.get('#app'), 'innerHTML', {
      get() {return appHTML;}, set(value) {appWrites++;appHTML = value;},
    });
    c.run("state.page='todos';let renders=0;renderPage=()=>{renders++};renderShell()");
    assert.equal(appWrites, 0, change);
    assert.equal(shell.classList.contains('menu-open'), false, 'shell reuse also closes the real navigation menu state');
    assert.match(main.innerHTML, /每日待办/);
    assert.equal(links[0].classList.current, false);
    assert.equal(links[1].classList.current, true);
    assert.equal(links[1]['aria-current'], 'page');
    c.run(change === 'session' ? 'runtime.sessionEpoch++' : "state.me={id:'other-user',username:'Other user'}");
    c.run('renderShell()');
    assert.equal(appWrites, 1, change);
    assert.equal(c.run('renders'), 2);
    assert.match(appHTML, change === 'session' ? /data-session="1"/ : /data-user="other-user"/);
  }
});

test('hidden completion reacts immediately and a failed save restores the row without replay', async () => {
  const c = client();
  c.put('original', item('hide-failure', '2026-10-23'));
  c.run(`paintTodos=()=>{};todoDay().items=[original];todoDay().loaded=true;receiveTodoPreferences('hide',2);
    let calls=0,rejectSave;api=()=>{calls++;return new Promise((_,reject)=>rejectSave=reject)};
    let save=toggleTodo({dataset:{todoId:original.id,date:original.date},checked:true})`);
  assert.doesNotMatch(c.run('renderTodos()'), /data-todo-id="hide-failure"/);
  assert.doesNotMatch(c.run('renderTodos()'), /保存中/);
  c.run("rejectSave(new Error('Synthetic completion failed'))");
  await c.run('save');
  assert.match(c.run('renderTodos()'), /data-todo-id="hide-failure"/);
  assert.match(c.run('renderTodos()'), /Synthetic completion failed/);
  assert.equal(c.run('todoDay().items[0].completed'), false);
  assert.equal(c.run('calls'), 1);
});

test('display preference writes are single-submit, optimistic, reversible and independent of todo writes', async () => {
  const c = client();
  c.put('done', item('completed-mode', '2026-10-23', {completed:true}));
  c.run(`paintTodos=()=>{};todoDay().items=[done];receiveTodoPreferences('strike',0);
    let calls=[],rejectSave;api=(path,options)=>{calls.push({path,options});return new Promise((_,reject)=>rejectSave=reject)};
    let save=changeTodoCompletedMode('hide')`);
  await c.run("changeTodoCompletedMode('hide')");
  assert.doesNotMatch(c.run('renderTodos()'), /data-todo-id="completed-mode"/);
  assert.equal(c.run('calls.length'), 1);
  assert.equal(c.run('calls[0].path'), '/todo-preferences');
  assert.equal(c.run('calls[0].options.body.version'), 0);
  c.run("rejectSave(new Error('Synthetic mode save failed'))");
  await c.run('save');
  assert.equal(c.run('todoCompletedMode()'), 'strike');
  assert.match(c.run('renderTodos()'), /data-todo-id="completed-mode"/);
  assert.match(c.run('renderTodos()'), /Synthetic mode save failed/);
  assert.equal(c.run('todoDay().items[0].version'), 1);
  c.run("api=async(path,options)=>{calls.push({path,options});return {completed_mode:'hide',version:1}}");
  await c.run("changeTodoCompletedMode('hide')");
  c.run("receiveTodoPreferences('strike',0)");
  assert.equal(c.run('todoCompletedMode()'), 'hide', 'old list reads cannot undo a saved preference');
  assert.equal(c.run('calls.every(call=>call.path===\"/todo-preferences\")'), true);
});

test('late preference success or conflict reload cannot change the next signed-in user', async () => {
  for (const conflict of [false,true]) {
    const c = client();
    c.run(`paintTodos=()=>{};receiveTodoPreferences('strike',1);let finish,reject;
      api=(_path,options)=>options?new Promise((resolve,fail)=>{finish=resolve;reject=fail}):new Promise(resolve=>finish=resolve);
      let save=changeTodoCompletedMode('hide')`);
    if (conflict) {
      c.run("reject(Object.assign(new Error('conflict'),{status:409}))");
      await Promise.resolve();
    }
    c.run("resetSessionIndexes();state.me={id:'new-mode-owner'};receiveTodoPreferences('strike',7);finish({completed_mode:'hide',version:2})");
    await c.run('save');
    assert.equal(c.run('todoCompletedMode()'), 'strike');
    assert.equal(c.run('todoPreferences().version'), 7);
    assert.equal(c.run('todoPreferences().error'), '');
  }
});

test('soft deletion is optimistic and single-submit, failure restores the row, and undo respects the completion filter', async () => {
  const c = client();
  c.put('original', item('recover-me', '2026-10-23', {completed:true}));
  c.run(`paintTodos=()=>{};todoDay().items=[original];todoDay().loaded=true;receiveTodoPreferences('strike',0);
    let calls=[],rejectDelete;api=(path,options)=>{calls.push({path,options});return new Promise((_,reject)=>rejectDelete=reject)};
    let __todoFixtureDeletion=deleteTodo({id:original.id,date:original.date})`);
  await c.run('deleteTodo({id:original.id,date:original.date})');
  assert.doesNotMatch(c.run('renderTodos()'), /data-todo-id="recover-me"/);
  assert.match(c.run('renderTodos()'), /删除中/);
  assert.equal(c.run('calls.length'), 1);
  c.run("rejectDelete(new Error('Synthetic delete failed'))");
  await c.run('__todoFixtureDeletion');
  assert.match(c.run('renderTodos()'), /data-todo-id="recover-me"/);
  assert.match(c.run('renderTodos()'), /Synthetic delete failed/);
  c.run(`api=async(path,options)=>{calls.push({path,options});return {...original,deleted_at:'2026-10-23T09:00:00Z',version:2}}`);
  await c.run('deleteTodo({id:original.id,date:original.date})');
  assert.match(c.run('renderTodoUndo(todoDay())'), /撤销/);
  c.run(`receiveTodoPreferences('hide',1);let finishRestore;
    api=(path,options)=>{calls.push({path,options});return new Promise(resolve=>finishRestore=resolve)};
    let restoration=restoreTodo({id:original.id,date:original.date})`);
  await c.run('restoreTodo({id:original.id,date:original.date})');
  assert.equal(c.run('calls.length'), 3);
  assert.equal(c.run('calls[2].options.body.version'), 2);
  assert.doesNotMatch(c.run('renderTodos()'), /data-todo-id="recover-me"/);
  c.run('finishRestore({...original,deleted_at:null,version:3})');
  await c.run('restoration');
  assert.equal(c.run('todoDay().removals.size'), 0);
  assert.equal(c.run('todoDay().items[0].completed'), true);
  c.run("receiveTodoPreferences('strike',2)");
  assert.match(c.run('renderTodos()'), /data-todo-id="recover-me"/);
  assert.match(c.run('renderTodos()'), /is-complete/);
});

test('late delete results and failures cannot leak into another owner or a different date', async () => {
  for (const fail of [false,true]) {
    const c = client();
    c.put('original', item('private-removal', '2026-10-23'));
    c.run(`paintTodos=()=>{};todoDay().items=[original];let finish,reject;
      api=()=>new Promise((resolve,failed)=>{finish=resolve;reject=failed});
      let __todoFixtureDeletion=deleteTodo({id:original.id,date:original.date});
      resetSessionIndexes();state.me={id:'new-delete-owner'};state.todoDate='2026-10-24';todoDay().draft='Keep new draft'`);
    c.run(fail?"reject(new Error('old private deletion error'))":"finish({...original,deleted_at:'2026-10-23T09:00:00Z',version:2})");
    await c.run('__todoFixtureDeletion');
    assert.equal(c.run('todoDay().items.length'),0);
    assert.equal(c.run('todoDay().removals.size'),0);
    assert.equal(c.run('todoDay().error'),'');
    assert.equal(c.run('todoDay().draft'),'Keep new draft');
  }
});

test('adding a common template from a row retains its request identity after failure and blocks repeated clicks', async () => {
  const c = client();
  c.put('original', item('promote-me', '2026-10-23'));
  c.run(`paintTodos=()=>{};todoDay().items=[original];let calls=[],rejectLink;
    api=(path,options)=>{calls.push({path,options});return new Promise((_,reject)=>rejectLink=reject)};
    let promotion=changeTodoTemplate({id:original.id,date:original.date})`);
  await c.run('changeTodoTemplate({id:original.id,date:original.date})');
  assert.equal(c.run('calls.length'),1);
  const request=c.run('JSON.stringify(calls[0].options.body)');
  c.run("rejectLink(new Error('Synthetic template link failed'))");
  await c.run('promotion');
  c.run(`api=async(path,options)=>{if(path==='/todo-templates')return {items:templateState().items};calls.push({path,options});return {
    todo:{...original,version:2,template_id:options.body.template_id,template_active:true,template_version:1},
    template:{id:options.body.template_id,text:original.text,version:1}}}`);
  await c.run('changeTodoTemplate({id:original.id,date:original.date})');
  assert.equal(c.run('JSON.stringify(calls[1].options.body)'),request);
  assert.equal(c.run('todoDay().items[0].template_id===templateState().items[0].id'),true);
  assert.equal(c.run('todoDay().templateWrites.size'),0);
  assert.match(c.run('renderTodos()'),/已添加为常用/);
});

test('delete and restore conflicts refresh open common counters after reading the saved row', async () => {
  for (const operation of ['delete','restore']) {
    const c=client();
    c.put('original',item('counter-conflict','2026-10-23',{completed:true,template_id:'stable-common'}));
    c.run(`paintTodos=()=>{};todoDay().items=[original];let calls=[];
      api=async(path,options={})=>{calls.push(path);if(options.method)throw Object.assign(new Error('conflict'),{status:409});
        return {date:original.date,today:original.date,items:[{...original,completed:false,version:3}]}};
      refreshOpenTodoTemplates=()=>{calls.push('refresh-common')}`);
    if(operation==='restore')c.run(`todoDay().items=[];todoDay().removals.set(original.id,
      {item:{...original,deleted_at:'2026-10-23T09:00:00Z',version:2},phase:'ready',timer:null})`);
    await c.run(`${operation==='delete'?'deleteTodo':'restoreTodo'}({id:original.id,date:original.date})`);
    assert.equal(c.run('calls.at(-1)'),'refresh-common',operation);
    assert.equal(c.run('todoDay().items[0].completed'),false,operation);
    assert.equal(c.run('calls.filter(path=>path===\"refresh-common\").length'),1,operation);
  }
});
