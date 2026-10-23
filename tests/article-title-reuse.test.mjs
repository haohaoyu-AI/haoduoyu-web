import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const BASE = '99357d89e8ec423281c50a0b2be7b6ee82823e13';
const root = new URL('../', import.meta.url);
const previous = execFileSync('git', ['show', BASE + ':public/app.js'], {cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024});
const candidate = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
function client(source) {
  const body = {style: {}}, overlay = {firstChild: null, contains() {return false;}};
  const document = {body, activeElement: body, querySelector: selector => selector === '#overlay' ? overlay : null,
    querySelectorAll: () => [], addEventListener() {}};
  const NativeDate = Date, stamp = Date.parse('2001-01-03T04:00:00Z');
  class FixedDate extends NativeDate {constructor(...args) {super(...(args.length ? args : [stamp]));}static now() {return stamp;}}
  const context = vm.createContext({Date: FixedDate, AbortController, AbortSignal, DOMException, Headers, document,
    window: {addEventListener() {}}, location: {href: 'http://localhost/', search: ''}, history: {replaceState() {}},
    URL, URLSearchParams, Intl, localStorage: {getItem() {}}, requestAnimationFrame() {}, setTimeout, clearTimeout});
  assert.match(source, /init\(\);\s*$/);
  new vm.Script(source.replace(/init\(\);\s*$/, '')).runInContext(context);
  const run = text => vm.runInContext(text, context);
  run(`state.accounts=[{id:'synthetic-account',platform:'zhihu',name:'虚构账号',active:true}];
    state.me={id:'synthetic-me'};state.columns=new Set(['account','reads','likes','approvals','published','mode']);
    state.filters={...defaultFilters(),group:'account'};
    function fixtureRecord(id,title){return {id,title,account_id:'synthetic-account',account_name:'虚构账号',platform:'zhihu',
      published_at:'2001-01-01T00:00:00Z',date_status:'recorded',production_mode:'manual',duration_seconds:0,
      latest_metrics:{reads:0,likes:null,comments:1,approvals:0},period_metrics:{reads:0,likes:0,comments:null,approvals:0},
      comparisons:{},attention:{kind:'up'},coverage:{expected_days:1,metric_days:{reads:1}},
      action:'article.create',actor:'user:synthetic-me',entity_id:id,entity_label:title,created_at:'2001-01-01T00:00:00Z'};}`);
  return run;
}
const views = ['renderAttentionArticles([row])', 'renderTopTable([row])', 'articleTable([row])', 'renderAudit([row])'];
test('four complete renderers retain exact HTML for ordinary, missing, zero, long and hostile title/ID values', () => {
  const before = client(previous), after = client(candidate);
  const pairs = [[null, null], [0, false], ['', ''], ['synthetic-id', '纯合成标题'],
    ['<id " &\'>', '<img src=x onerror="synthetic"> & \'quoted\''], ['合成😀', '中文😀标题'],
    ['synthetic-long', '纯合成长标题'.repeat(300)]];
  let comparisons = 0;
  for (const [id, title] of pairs) for (const expression of views) {
    const setup = `row=fixtureRecord(${JSON.stringify(id)},${JSON.stringify(title)})`;
    before(setup);after(setup);
    const oldHTML = before(expression), newHTML = after(expression);
    assert.equal(newHTML, oldHTML, 'complete renderer HTML retained');assert.equal(newHTML.includes('<img'), false);comparisons++;
  }
  before('row=fixtureRecord(undefined,undefined)');after('row=fixtureRecord(undefined,undefined)');
  for (const expression of views) {assert.equal(after(expression), before(expression));comparisons++;}
  assert.equal(comparisons, 32);
});
test('property access and e() coercion preserve their original order, including throwing coercions', () => {
  for (const expression of views) for (const throws of [false, true]) {
    const before = client(previous), after = client(candidate), audit = expression.startsWith('renderAudit');
    const idKey = audit ? 'entity_id' : 'id', titleKey = audit ? 'entity_label' : 'title';
    const setup = `events=[];row=fixtureRecord('synthetic-id','before');titleValue='before';
      Object.defineProperty(row,${JSON.stringify(idKey)},{get(){events.push('get-id');return {toString(){events.push('escape-id');
        ${throws ? "throw new Error('Synthetic coercion failure');" : "titleValue='<changed & title>';return '<synthetic-id>';"}}};}});
      Object.defineProperty(row,${JSON.stringify(titleKey)},{get(){events.push('get-title');return titleValue;}});`;
    before(setup);after(setup);
    const evaluate = `(()=>{try{return {html:${expression}};}catch(error){return {failure:error.name+':'+error.message};}})()`;
    assert.equal(JSON.stringify(after(evaluate)), JSON.stringify(before(evaluate)), 'output or exception retained');
    assert.equal(after('JSON.stringify(events)'), before('JSON.stringify(events)'), 'exact getter/coercion order');
  }
});
