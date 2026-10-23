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

function client({search = '', now = '2026-10-23T08:00:00Z'} = {}) {
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
    window: {addEventListener: (name, handler) => windowEvents.set(name, handler), scrollTo() {}},
    setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    setInterval: setTimer, clearInterval: id => timers.delete(id), requestAnimationFrame() {},
  });
  new vm.Script(source).runInContext(context);
  const run = script => vm.runInContext(script, context);
  run("state.me={id:'synthetic-todo-user',username:'Synthetic user',csrfToken:'synthetic-csrf'}");
  return {
    run, nodes, events, windowEvents, location, timers,
    setNow(value) {currentTime = Date.parse(value);},
    put(name, value) {context[name] = value;},
    async dispatch(name, event) {for (const handler of events.get(name) || []) await handler(event);},
    back() {locate(entries[--index]);windowEvents.get('popstate')?.();},
  };
}

function prepareForm(c, {date = '2026-10-23', text = '写下今天的计划'} = {}) {
  const form = {dataset: {date}, isConnected: true, querySelector() {return null;}};
  c.put('syntheticTodoForm', form);
  c.put('todoData', {text});
  c.run(`paintTodos=()=>{};todoDay(${JSON.stringify(date)}).draft=${JSON.stringify(text)}`);
  return form;
}

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
});

test('homepage accepts a plan before the overview finishes and retains it when overview loading fails', async () => {
  const c = client();
  prepareForm(c);
  c.run(`let failOverview,serverItems=[];
    api=(path,options={})=>{
      if(options.method==='POST'){
        const created={...options.body,completed:false,version:1};serverItems.push(created);return Promise.resolve(created)}
      if(path.startsWith('/todos'))return Promise.resolve({date:'2026-10-23',today:'2026-10-23',items:serverItems.slice()});
      return new Promise((_,reject)=>failOverview=reject)};
    let pendingPage=renderPage()`);
  const first = c.nodes.get('#page-content').innerHTML;
  assert.match(first, /^<section id="daily-todos"/);
  assert.match(first, /id="todo-form"/);
  await c.run('submitTodo({form:syntheticTodoForm,data:todoData})');
  c.run("failOverview(new Error('Synthetic overview failure'))");
  await c.run('pendingPage');
  const failed = c.nodes.get('#page-content').innerHTML;
  assert.match(failed, /^<section id="daily-todos"/);
  assert.match(failed, /写下今天的计划/);
  assert.match(failed, /Synthetic overview failure/);
  assert.equal(c.run('todoDay().items.length'), 1);
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
    assert.equal(c.run('reads[0]'), '/todos?date=2026-10-24', trigger);
    assert.equal(c.run('todoDay().items.length'), 0, trigger);
    assert.equal(c.run("todoDay('2026-10-23').items[0].id"), 'yesterday', trigger);
  }
});
