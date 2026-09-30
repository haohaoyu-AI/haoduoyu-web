const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = readFileSync(join(__dirname, '../article_hub/console_page.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
new vm.Script(script);
const fn = script.slice(script.indexOf('async function softRefresh(){'), script.indexOf('var TABS ='));
function fixture(request) {
  const button = {disabled:false};
  const events = [];
  const context = vm.createContext({actionPending:false, closed:false, pollTimer:1,
    requestToken:'old', document:{getElementById:()=>button}, request,
    clearInterval:()=>events.push('stop-poll'), message:text=>events.push(text),
    refresh:async()=>events.push('refresh-state'), setTimeout:fn=>fn(), AbortSignal,
    fetch:async()=>({ok:true,text:async()=>'var requestToken = "new";'}),
    location:{reload:()=>events.push('reload')},
  });
  vm.runInContext(fn, context);
  return {context,button,events};
}
test('single refresh button waits for new service before reloading', async()=>{
  assert(!html.includes('onclick="restartConsole()"'));
  const f=fixture(async url=>{assert.equal(url,'/api/refresh');});
  await f.context.softRefresh();
  assert(f.events.includes('reload'));
  assert.equal(f.button.disabled,false);
});
test('busy rejection preserves polling and shows explanation',async()=>{
  const f=fixture(async()=>{throw new Error('任务正在运行');});
  await f.context.softRefresh();
  assert(!f.events.includes('reload'));
  assert(!f.events.includes('stop-poll'));
  assert(f.events.some(e=>e.includes('任务正在运行')));
  assert.equal(f.button.disabled,false);
});
