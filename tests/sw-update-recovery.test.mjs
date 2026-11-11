import test from 'node:test';
import assert from 'node:assert/strict';
import {startServiceWorker} from '../web/offline/sw-client.mjs';

function worker(state = 'activated') {
  const value = new EventTarget();
  value.state = state;
  value.messages = [];
  value.postMessage = message => value.messages.push(message);
  return value;
}
function fixture() {
  class Element extends EventTarget { setAttribute() {} remove() {} }
  const previous = worker(), waiting = worker('installed');
  const registration = new EventTarget();
  Object.assign(registration, {active: previous, waiting, update: async () => {}});
  const serviceWorker = new EventTarget();
  Object.assign(serviceWorker, {controller: previous, register: async () => registration});
  const document = new EventTarget(), page = new EventTarget(), buttons = [];
  document.querySelector = () => ({content: 'a'.repeat(64)});
  document.createElement = () => new Element();
  document.body = {append: value => buttons.push(value)};
  let reloads = 0;
  page.CustomEvent = CustomEvent;
  page.location = {reload: () => {reloads++;}};
  return {navigator: {serviceWorker}, window: page, document, registration, previous, waiting, buttons,
    get reloads() {return reloads;}};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes;reject = no;});
  return {promise, resolve, reject};
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function supersede(browser, state = 'activated') {
  browser.waiting.state = 'redundant';
  browser.registration.waiting = null;
  browser.registration.active = worker(state);
  browser.navigator.serviceWorker.controller = browser.registration.active;
  browser.navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  return browser.registration.active;
}

test('two releases replace the noticed worker: only reload after draft persistence, using the newer active worker', async () => {
  const browser = fixture(), write = deferred();
  let attempts = 0, resumed = 0;
  browser.window.addEventListener('haoduoyu:before-refresh', event => {
    attempts++;event.detail.waitUntil(write.promise);event.detail.onFailure(() => {resumed++;});
  });
  const handle = await startServiceWorker(browser), button = browser.buttons[0];
  button.dispatchEvent(new Event('click'));button.dispatchEvent(new Event('click'));
  const latest = supersede(browser);
  await nextTurn();
  assert.equal(attempts, 1);assert.equal(browser.reloads, 0);assert.equal(latest.messages.length, 1);
  write.resolve();await nextTurn();
  assert.equal(browser.reloads, 1);assert.equal(resumed, 0);
  assert.equal(browser.waiting.messages.length, 0);
  assert.ok(!latest.messages.some(message => message.type === 'HAODUOYU_SHELL_ACTIVATE'));
  browser.navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  assert.equal(browser.reloads, 1);handle.destroy();
});

test('a superseding active worker still activating is awaited instead of rejecting the update', async () => {
  const browser = fixture(), handle = await startServiceWorker(browser);
  const latest = supersede(browser, 'activating');
  browser.buttons[0].dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(browser.reloads, 0);
  assert.ok(latest.messages.some(message => message.type === 'HAODUOYU_SHELL_ACTIVATE'));
  latest.state = 'activated';latest.dispatchEvent(new Event('statechange'));
  assert.equal(browser.reloads, 1);handle.destroy();
});

test('an unchanged active worker is not mistaken for an update; failure resumes editors and a later update is retryable', async () => {
  const browser = fixture();let attempts = 0, resumed = 0;
  browser.window.addEventListener('haoduoyu:before-refresh', event => {
    attempts++;event.detail.waitUntil(Promise.resolve());event.detail.onFailure(() => {resumed++;});
  });
  const handle = await startServiceWorker(browser), button = browser.buttons[0];
  browser.waiting.state = 'redundant';browser.registration.waiting = null;
  button.dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(button.textContent, '更新失败，点此重试');assert.equal(button.disabled, false);
  assert.equal(browser.reloads, 0);assert.equal(resumed, 1);
  assert.ok(!browser.previous.messages.some(message => message.type === 'HAODUOYU_SHELL_ACTIVATE'));
  supersede(browser);button.dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(browser.reloads, 1);assert.equal(attempts, 2);assert.equal(resumed, 1);handle.destroy();
});

test('a newer active worker cannot bypass failed draft persistence', async () => {
  const browser = fixture();let resumed = 0;
  browser.window.addEventListener('haoduoyu:before-refresh', event => {
    event.detail.waitUntil(Promise.reject(Error('synthetic draft storage failure')));
    event.detail.onFailure(() => {resumed++;});
  });
  const handle = await startServiceWorker(browser), latest = supersede(browser);
  browser.buttons[0].dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(browser.buttons[0].textContent, '草稿保存失败，点此重试');
  assert.equal(browser.buttons[0].disabled, false);assert.equal(browser.reloads, 0);assert.equal(resumed, 1);
  assert.ok(!latest.messages.some(message => message.type === 'HAODUOYU_SHELL_ACTIVATE'));handle.destroy();
});

test('when another release is waiting it is preferred over an already activated intermediate release', async () => {
  const browser = fixture(), handle = await startServiceWorker(browser), intermediate = supersede(browser);
  const latest = worker('installed');browser.registration.waiting = latest;
  browser.buttons[0].dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(browser.reloads, 0);assert.equal(latest.messages.length, 1);
  assert.ok(!intermediate.messages.some(message => message.type === 'HAODUOYU_SHELL_ACTIVATE'));
  latest.state = 'activated';latest.dispatchEvent(new Event('statechange'));
  assert.equal(browser.reloads, 1);handle.destroy();
});

test('a captured worker that already activated is safely navigated without redundant activation messaging', async () => {
  const browser = fixture(), handle = await startServiceWorker(browser);
  browser.waiting.state = 'activated';browser.registration.waiting = null;
  browser.registration.active = browser.waiting;
  browser.waiting.postMessage = () => {throw Error('must not message an already active worker');};
  browser.buttons[0].dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(browser.reloads, 1);handle.destroy();
});

test('a failed activation message leaves the notice visible and retryable, without a later controller-change reload', async () => {
  const browser = fixture();let resumed = 0;
  browser.window.addEventListener('haoduoyu:before-refresh', event => event.detail.onFailure(() => {resumed++;}));
  const handle = await startServiceWorker(browser), button = browser.buttons[0];
  let removed = 0;button.remove = () => {removed++;};
  browser.waiting.postMessage = () => {throw Error('synthetic detached worker');};
  button.dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(button.textContent, '更新失败，点此重试');assert.equal(button.disabled, false);
  assert.equal(resumed, 1);assert.equal(removed, 0);assert.equal(browser.reloads, 0);
  browser.navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  browser.waiting.state = 'activated';browser.waiting.dispatchEvent(new Event('statechange'));
  await nextTurn();
  assert.equal(browser.reloads, 0);assert.equal(removed, 0);
  assert.equal(button.textContent, '更新失败，点此重试');
  browser.registration.waiting = null;browser.registration.active = browser.waiting;
  button.dispatchEvent(new Event('click'));await nextTurn();
  assert.equal(browser.reloads, 1);handle.destroy();
});
