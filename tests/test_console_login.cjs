const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'article_hub', 'console_login.html'), 'utf8');
const consolePage = fs.readFileSync(path.join(__dirname, '..', 'article_hub', 'console_page.html'), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(script, 'login page includes its inline controller');
assert.match(consolePage, /id="logout"/);
assert.match(consolePage, /credentials:'same-origin'/);
assert.match(consolePage, /X-Haoduoyu-Token/);
assert.match(consolePage, /request\('\/api\/logout'/);

function setupPage({configured = true, response = {ok: true, json: async () => ({ok: true})}} = {}) {
  const handlers = {};
  const replacements = [];
  const calls = [];
  const elements = {
    'login-form': {addEventListener(name, fn) { handlers[name] = fn; }},
    'submit': {disabled: false},
    'setup-status': {textContent: configured ? '请输入开发区本地账号和密码。' : '本机登录尚未配置。'},
    'message': {textContent: ''},
    'username': {value: 'fixture-user'},
    'password': {value: 'fixture-password'},
  };
  const context = {
    document: {getElementById(id) { return elements[id]; }},
    fetch: async (url, options) => { calls.push({url, options}); return response; },
    window: {location: {replace(url) { replacements.push(url); }}},
  };
  vm.runInNewContext(script[1], context);
  return {handlers, elements, calls, replacements};
}

(async () => {
  const pageState = setupPage();
  let prevented = false;
  await pageState.handlers.submit({preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  assert.equal(pageState.calls.length, 1);
  assert.equal(pageState.calls[0].url, '/api/login');
  assert.equal(pageState.calls[0].options.method, 'POST');
  assert.equal(pageState.calls[0].options.credentials, 'same-origin');
  assert.equal(JSON.parse(pageState.calls[0].options.body).username, 'fixture-user');
  assert.equal(pageState.elements.password.value, '');
  assert.deepEqual(pageState.replacements, ['/']);

  const failed = setupPage({response: {ok: false, json: async () => ({error: '登录失败'})}});
  await failed.handlers.submit({preventDefault() {}});
  assert.equal(failed.elements.message.textContent, '登录失败');
  assert.equal(failed.elements.submit.disabled, false);

  const unconfigured = setupPage({configured: false});
  assert.equal(unconfigured.elements.submit.disabled, true);
  console.log('PASS login page submits same-origin credentials, clears password, and fails closed when unconfigured');
})().catch(error => { console.error(error); process.exitCode = 1; });
