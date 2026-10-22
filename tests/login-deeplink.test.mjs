import {frontendSource} from './frontend-client.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source = await frontendSource();
test('route reader takes no parameters while fresh-login expansion reset remains live', () => {
  assert.match(source, /function readRoute\(\)/);
  assert.doesNotMatch(source, /readRoute\(\{freshLogin\}\)/, 'the ignored route-reader argument must be absent');
  assert.match(source, /async function init\(\{\s*freshLogin\s*=\s*false\s*\}\s*=\s*\{\}\)/);
  assert.match(source, /if\s*\(freshLogin\)\s*\{\s*state\.trendOpen\s*=\s*false;\s*state\.attentionExpanded\s*=\s*false;\s*\}/);
});

test('executable route restoration characterizes existing deep-link behavior, not authentication', async () => {
  const events = {};
  const url = new URL('http://localhost/?page=articles&q=synthetic&platform=zhihu&sort=reads&order=asc&page_size=10&account=a&period=7d&top_n=3');
  const context = vm.createContext({AbortController, AbortSignal, DOMException, Headers,
    document: {addEventListener(name, callback) {events[name] = callback;}, body: {style: {}},
      querySelector() {}, querySelectorAll: () => []},
    window: {addEventListener() {}, scrollTo() {}},
    location: {href: url.href, search: url.search},
    history: {replaceState() {}}, localStorage: {getItem() {}},
    URL, URLSearchParams, Intl, setTimeout, clearTimeout, requestAnimationFrame() {},
  });
  new vm.Script(source.replace(/init\(\);\s*$/, '')).runInContext(context);
  vm.runInContext("state.accounts=[{id:'a'}];readRoute();", context);
  const result = JSON.parse(vm.runInContext('JSON.stringify({page:state.page,account:state.account,filters:state.filters,pageSize:state.pageSize,period:state.overviewPeriod,topN:state.topN})', context));
  assert.equal(result.page, 'articles');assert.equal(result.account, 'a');
  assert.equal(result.filters.q, 'synthetic');assert.equal(result.filters.platform, 'zhihu');
  assert.equal(result.filters.sort, 'reads');assert.equal(result.filters.order, 'asc');
  assert.equal(result.pageSize, 10);assert.equal(result.period, '7d');assert.equal(result.topN, 3);
});
