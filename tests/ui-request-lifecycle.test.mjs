import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendSource} from './frontend-client.mjs';
const source = await frontendSource();
const ok = data => Response.json({data});
function client(fetch) {
  const nodes = new Map();
  for (const id of ['#app', '#overlay', '#page-content']) nodes.set(id, {
    innerHTML: '', firstChild: null, querySelectorAll(){return []}, contains() {return false;}, style: {}, setAttribute() {},
  });
  const document = {querySelector: s => nodes.get(s) || null, querySelectorAll: () => [],
    addEventListener() {}, body: {style: {}}, activeElement: null};
  const context = vm.createContext({fetch, Response, Headers, AbortController, AbortSignal, DOMException,
    URL, URLSearchParams, Intl, setTimeout, clearTimeout, document,
    window: {addEventListener() {}}, location: {href: 'http://localhost/', search: ''},
    localStorage: {getItem() {}, setItem() {}}, requestAnimationFrame() {}});
  new vm.Script(source).runInContext(context);
  const run = script => vm.runInContext(script, context);
  run("state.me={id:'synthetic-lifecycle-user',username:'Synthetic user',csrfToken:'synthetic-csrf'}");
  return {run, nodes};
}
function delayed() {
  const pending = [], calls = [];
  return {pending, calls, fetch(path, options) {
    calls.push({path, options});
    return new Promise((resolve, reject) => {
      pending.push({resolve, reject});
      options.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic abort', 'AbortError')));
    });
  }, finish(data = []) {for (const p of pending) p.resolve(ok(data));}};
}
test('same-cycle equivalent pending GETs share one actual transport and independent decoded results', async () => {
  const d = delayed(), c = client(d.fetch);
  const a = c.run("api('/accounts')"), b = c.run("api('/accounts')");
  const count = d.calls.length;d.finish([{name: 'Synthetic'}]);
  const [x, y] = await Promise.all([a, b]);
  assert.equal(count, 1, 'baseline sends two equivalent transports');
  x[0].name = 'changed';assert.equal(y[0].name, 'Synthetic', 'consumers cannot mutate each other');
});
test('request options, render cycles and successful writes prevent joining an older pending GET', async () => {
  const d = delayed(), c = client((path, options) => options.method === 'POST' ? Promise.resolve(ok({saved: true})) : d.fetch(path, options));
  const promises = [c.run("api('/accounts',{headers:{'X-Synthetic':'a'}})"),
    c.run("api('/accounts',{headers:{'X-Synthetic':'b'}})")];
  assert.equal(d.calls.length, 2);
  c.run('runtime.renderVersion++');promises.push(c.run("api('/accounts',{headers:{'X-Synthetic':'a'}})"));
  assert.equal(d.calls.length, 3);
  await c.run("api('/articles',{method:'POST',body:{title:'Synthetic write'}})");
  promises.push(c.run("api('/accounts',{headers:{'X-Synthetic':'a'}})"));
  assert.equal(d.calls.length, 4);d.finish([]);await Promise.all(promises);
});
test('one cancelled GET consumer does not cancel a second consumer of the shared transport', async () => {
  const d = delayed(), c = client(d.fetch);
  c.run('let left=new AbortController(),right=new AbortController()');
  const a = c.run("api('/accounts',{signal:left.signal})").then(() => null, error => error);
  const b = c.run("api('/accounts',{signal:right.signal})");
  c.run('left.abort()');const error = await a;
  const transports = d.calls.length, live = !d.calls.at(-1).options.signal?.aborted;
  d.finish([{name: 'Synthetic survivor'}]);assert.equal((await b)[0].name, 'Synthetic survivor');
  assert.equal(error.name, 'AbortError');assert.equal(transports, 1);assert.equal(live, true);
});
test('a fast page change aborts the previous page GET without replacing the new page or showing an error', async () => {
  const d = delayed(), c = client(d.fetch);
  c.run("state.page='dashboard'");const old = c.run('renderPage()');
  c.run("state.page='settings';state.settingsTab='security'");await c.run('renderPage()');
  const aborted = d.calls[0].options.signal?.aborted === true;
  d.finish({});await old;
  assert.equal(aborted, true, 'baseline leaves the old page fetch running');
  assert.match(c.nodes.get('#page-content').innerHTML, /password-form/);
  assert.doesNotMatch(c.nodes.get('#page-content').innerHTML, /error-panel/);
});
test('refresh starts a new GET; late old results cannot fill the new render', async () => {
  let finish, signal, reads = 0;
  const c = client((_path, options) => {
    if (++reads > 1) return Promise.resolve(ok({marker: 'fresh'}));
    signal = options.signal;return new Promise((resolve, reject) => {
      finish = () => resolve(ok({marker: 'obsolete'}));
      signal?.addEventListener('abort', () => reject(new DOMException('Synthetic refresh abort', 'AbortError')));
    });
  });
  c.run("state.page='dashboard';renderDashboard=data=>data.marker");
  const old = c.run('renderPage()');await c.run('renderPage()');finish();await old;
  assert.equal(reads, 2);assert.equal(signal?.aborted, true);
  assert.equal(c.nodes.get('#page-content').innerHTML, 'fresh');
});
test('non-abort failures still reject and POST mutations are neither merged nor page-cancelled', async () => {
  let writes = 0, finish;
  const c = client((path, options) => {
    if (options.method === 'POST') {
      writes++;return new Promise(resolve => {finish = () => resolve(ok({saved: true}));});
    }
    return Promise.resolve(Response.json({error: {code: 'SYNTHETIC_FAILURE', message: 'Synthetic real failure'}}, {status: 503}));
  });
  await assert.rejects(c.run("api('/accounts')"), error => error.status === 503 && error.message === 'Synthetic real failure');
  const write = c.run("api('/articles',{method:'POST',body:{title:'Synthetic'}})");
  c.run("state.page='settings';state.settingsTab='security'");await c.run('renderPage()');
  finish();assert.equal((await write).saved, true);assert.equal(writes, 1);
});
test('page, dialog and background consumers have independent cancellation ownership', async () => {
  const d = delayed(), c = client(d.fetch);
  c.run('let pageScope=beginPageRequests(),dialogScope=beginModalRequests()');
  const page = c.run("api('/accounts',{context:pageScope})").then(() => null, error => error);
  const dialog = c.run("api('/accounts',{context:dialogScope})");
  const background = c.run("api('/accounts')");
  c.run('beginPageRequests()');
  assert.equal((await page).name, 'AbortError');assert.equal(d.calls.length, 3);
  assert.equal(d.calls[0].options.signal.aborted, true);
  assert.equal(d.calls[1].options.signal.aborted, false);assert.equal(d.calls[2].options.signal.aborted, false);
  d.finish([{name:'Synthetic independent reads'}]);
  assert.equal((await dialog)[0].name, 'Synthetic independent reads');await background;
});
test('identical concurrent writes remain two transports and survive page cancellation', async () => {
  const d = delayed(), c = client(d.fetch);
  const a = c.run("api('/articles',{method:'POST',body:{title:'Synthetic same'}})");
  const b = c.run("api('/articles',{method:'POST',body:{title:'Synthetic same'}})");
  c.run('beginPageRequests();beginPageRequests()');
  assert.equal(d.calls.length, 2);assert.equal(d.calls.every(row=>!row.options.signal), true);
  d.finish({saved:true});assert.equal((await a).saved,true);assert.equal((await b).saved,true);
});
test('an aborted page index cannot delete or refill the next page index entry', async () => {
  const d = delayed(), c = client(d.fetch);
  c.run('let firstScope=beginPageRequests()');
  const old = c.run("articleIndex('',firstScope)").then(() => null,error => error);
  c.run('let nextScope=beginPageRequests()');const next=c.run("articleIndex('',nextScope)");
  d.pending[1].resolve(ok([{id:'fresh',title:'Synthetic fresh'}]));
  assert.equal((await next)[0].id,'fresh');assert.equal((await old).name,'AbortError');
  assert.equal(c.run('articleIndexes.size'),1);
  assert.equal((await c.run("articleIndex('',nextScope)"))[0].id,'fresh');assert.equal(d.calls.length,2);
});
test('last consumer cancellation aborts a response body read and removes the pending transport', async () => {
  let bodyStarted, transportSignal, calls = 0;
  const started = new Promise(resolve => {bodyStarted = resolve;});
  const c = client((_path, options) => {
    calls++;transportSignal = options.signal;
    if (calls > 1) return Promise.resolve(ok(['fresh']));
    return Promise.resolve({ok:true,status:200,text() {
      bodyStarted();return new Promise((_resolve,reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Synthetic body abort','AbortError')));
      });
    }});
  });
  c.run('let bodyController=new AbortController()');
  const pending = c.run("api('/accounts',{signal:bodyController.signal})").then(()=>null,error=>error);
  await started;c.run('bodyController.abort()');
  assert.equal((await pending).name,'AbortError');assert.equal(transportSignal.aborted,true);
  assert.equal((await c.run("api('/accounts')"))[0],'fresh');assert.equal(calls,2);
});
test('a cancelled body consumer leaves its surviving consumer active until the real body completes', async () => {
  let finish, signal;
  const c=client((_path,options)=>{signal=options.signal;return Promise.resolve({ok:true,status:200,
    text:()=>new Promise(resolve=>{finish=()=>resolve(JSON.stringify({data:['body survivor']}));})});});
  c.run('let bodyLeft=new AbortController()');
  const left=c.run("api('/accounts',{signal:bodyLeft.signal})").then(()=>null,error=>error);
  const right=c.run("api('/accounts')");
  await Promise.resolve();await Promise.resolve();c.run('bodyLeft.abort()');
  assert.equal((await left).name,'AbortError');assert.equal(signal.aborted,false);
  finish();assert.equal((await right)[0],'body survivor');
});
test('actual transport, body-read and malformed JSON errors stay errors and failed entries can retry', async t => {
  for(const [name,fail,message] of [
    ['fetch',()=>Promise.reject(new TypeError('Synthetic connection failure')),'暂时无法连接网站，请检查网络后重试。'],
    ['body',()=>Promise.resolve({ok:true,status:200,text:()=>Promise.reject(new TypeError('Synthetic body failure'))}),'服务暂时不可用，请稍后重试。'],
    ['json',()=>Promise.resolve(new Response('Synthetic invalid JSON')),'服务暂时不可用，请稍后重试。'],
  ])await t.test(name,async()=>{
    let count=0;const c=client(()=>++count===1?fail():Promise.resolve(ok(['retry'])));
    await assert.rejects(c.run("api('/accounts')"),error=>error.name==='Error'&&error.message===message);
    assert.equal((await c.run("api('/accounts')"))[0],'retry');assert.equal(count,2);
  });
});
