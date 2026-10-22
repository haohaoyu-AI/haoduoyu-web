import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const appSource = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const accounts = [
  { id: 'account-a', name: '<script>alert(1)</script>', platform: 'zhihu', active: 1 },
  { id: 'account-b', name: '第二账号', platform: 'toutiao', active: 1 },
];
const articles = [
  { id: 'article-a', account_id: 'account-a', platform: 'zhihu', account_name: accounts[0].name, title: '<img src=x onerror="alert(1)">' },
  { id: 'article-b', account_id: 'account-b', platform: 'toutiao', account_name: accounts[1].name, title: '第二篇文章' },
];

async function client(rows = articles) {
  // Only host primitives are stubbed. The application, its escaping, modal
  // construction and registered event handlers all run unchanged in the VM.
  const nodes = new Map(['#app', '#overlay', '#review-article'].map(id => [id, { innerHTML: '', firstChild: null, contains(){return false} }]));
  const events = new Map(), requests = [];
  const document = {
    querySelector: selector => nodes.get(selector) ?? null,
    querySelectorAll: () => [],
    addEventListener: (name, handler) => events.set(name, handler),
    body: { style: {} }, activeElement: null,
  };
  const context = vm.createContext({
    document, window: { addEventListener() {} }, localStorage: { getItem: () => null },
    requestAnimationFrame() {}, URL, URLSearchParams, Intl,
    fixture: { me: {id:'synthetic-ui-user'}, accounts: structuredClone(accounts), account: 'account-a', reviewTab: 'observations' },
    fetch: async (path, options) => {
      requests.push({ path, method: options.method ?? 'GET' });
      if (path === '/api/v1/auth/me') return { ok: false, status: 401, json: async () => ({ error: { message: 'Synthetic signed-out session' } }) };
      if (path === '/api/v1/articles?fields=index') return { ok: true, status: 200, json: async () => ({ data: structuredClone(rows) }) };
      throw new Error('Unexpected request in isolated UI test');
    },
  });
  await new vm.Script(appSource, { filename: 'public/app.js' }).runInContext(context);
  vm.runInContext('Object.assign(state, fixture)', context);
  return { nodes, events, context, requests, run: script => vm.runInContext(script, context) };
}

test('review modal: a real article opens the cumulative form and escapes business text', async () => {
  const app = await client();
  // A direct article action remains cumulative even when the daily tab is open.
  app.run("state.reviewTab = 'daily'");
  await app.run("reviewModal('article-a', 'd3')");
  const html = app.nodes.get('#overlay').innerHTML;
  assert.match(html, /<form\b[^>]*id="review-form"[^>]*data-type="observation"/);
  assert.match(html, /<option\b[^>]*value="article-a"[^>]*selected/);
  assert.match(html, /<option\b[^>]*value="d3"[^>]*selected/);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.doesNotMatch(html, /<(?:img|script)\b/i);
  assert.ok(app.requests.every(request => request.method === 'GET'));
});

test('review modal: daily account selection and its change handler filter actual article options', async () => {
  const app = await client();
  app.run("state.reviewTab = 'daily'");
  await app.run('reviewModal()');
  const html = app.nodes.get('#overlay').innerHTML;
  assert.match(html, /<form\b[^>]*id="review-form"[^>]*data-type="daily"/);
  const options = html.match(/<select\b[^>]*id="review-article"[^>]*>([\s\S]*?)<\/select>/)?.[1];
  assert.ok(options, 'daily form exposes the article selector');
  assert.match(options, /value="article-a"/); assert.doesNotMatch(options, /value="article-b"/);
  assert.ok(options.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.doesNotMatch(options, /<img\b/i);
  const change = app.events.get('change');
  change({ target: { id: 'review-account', value: 'account-b', dataset: {}, closest: () => null } });
  assert.match(app.nodes.get('#review-article').innerHTML, /value="article-b"/);
  assert.doesNotMatch(app.nodes.get('#review-article').innerHTML, /value="article-a"/);
  change({ target: { id: 'review-account', value: 'account-a', dataset: {}, closest: () => null } });
  assert.ok(app.nodes.get('#review-article').innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.doesNotMatch(app.nodes.get('#review-article').innerHTML, /<img\b/i);
  assert.ok(app.requests.every(request => request.method === 'GET'));
});

test('a direct review target absent from a cached index is refreshed once and never defaults to another article',async()=>{
  const app=await client([articles[0]]);await app.run("reviewModal('article-a')");app.run('closeModal()');
  app.run("let reads=0;api=async()=>{reads++;return [{id:'article-a',account_id:'account-a',title:'Synthetic old'},{id:'external-new',account_id:'account-a',title:'Synthetic external new'}]}");
  await app.run("reviewModal('external-new')");assert.equal(app.run('reads'),1);
  assert.match(app.nodes.get('#overlay').innerHTML,/value="external-new" selected/);
  app.run('closeModal();api=async()=>[]');
  await assert.rejects(app.run("reviewModal('missing-target')"),/文章不存在或无权访问/);
  assert.equal(app.nodes.get('#overlay').innerHTML,'');
});
