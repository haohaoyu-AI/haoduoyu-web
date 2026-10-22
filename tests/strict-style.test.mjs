import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendSource} from './frontend-client.mjs';
import worker from '../dist/server/index.js';
import {fixture} from './harness.mjs';

const source=await frontendSource();
const POLICY="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
const SECURITY={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
function client() {
  const context=vm.createContext({AbortController,AbortSignal,DOMException,Headers,URL,URLSearchParams,Intl,
    document:{querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},body:{style:{}}},
    window:{addEventListener(){}},localStorage:{getItem(){},setItem(){}},location:{href:'http://localhost/',search:''},
    setTimeout,clearTimeout,requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  return script=>vm.runInContext(script,context);
}
test('chart renderers emit escaped data instead of any parser-applied inline style',()=>{
  const run=client();
  run("state.accounts=[{id:'a',platform:'zhihu',name:'Synthetic <safe>'}];state.trendMetric='reads'");
  const data={accounts:[{id:'a',platform:'zhihu',name:'Synthetic <safe>'}],
    publication_trend:[{date:'2026-10-20',accounts:[{account_id:'a',count:2}]}],
    trend:[{date:'2026-10-20',accounts:[{account_id:'a',metrics:{reads:0}}]},
      {date:'2026-10-21',accounts:[{account_id:'a',metrics:{reads:2}}]}]};
  run('syntheticChart='+JSON.stringify(data));
  for(const renderer of ['renderPublicationTrend','renderTrend']) {
    const html=run(renderer+'(syntheticChart)');
    assert.doesNotMatch(html,/\sstyle\s*=/i,'baseline still emits inline style attributes');
    assert.match(html,/data-chart-color=/);assert.match(html,/Synthetic &lt;safe&gt;/);
  }
});
test('strict style policy and every other security header apply to HTML, assets, API, 304 and errors',async t=>{
  const check=response=>{
    assert.equal(response.headers.get('Content-Security-Policy'),POLICY);
    for(const [key,value]of Object.entries(SECURITY))assert.equal(response.headers.get(key),value,key);
  };
  for(const [path,status]of [['/',200],['/index.html',200],['/api-docs',200],['/app.js',200],
    ['/style.css',200],['/favicon.svg',200],['/openapi.json',200],['/missing',404]]) {
    const response=await worker.fetch(new Request('http://localhost'+path),{});
    assert.equal(response.status,status,path);check(response);await response.text();
  }
  for(const path of ['/app.js','/style.css']) {
    const fresh=await worker.fetch(new Request('http://localhost'+path),{});
    const conditional=await worker.fetch(new Request('http://localhost'+path,{headers:{'If-None-Match':fresh.headers.get('ETag')}}),{});
    assert.equal(conditional.status,304);check(conditional);assert.equal((await conditional.text()).length,0);
    assert.equal(conditional.headers.get('Cache-Control'),'no-cache');await fresh.text();
  }
  const app=await fixture(t),session=await app.login();
  for(const [path,headers,status]of [['/api/v1/accounts',{},401],
    ['/api/v1/accounts',{Cookie:session.cookie},200],['/api/v1/overview?period=invalid',{Cookie:session.cookie},400]]) {
    const response=await worker.fetch(new Request(app.origin+path,{headers}),{DB:app.db,SITE_ORIGIN:app.origin});
    assert.equal(response.status,status);check(response);assert.equal(response.headers.get('Cache-Control'),'no-store');await response.text();
  }
  const failure=await worker.fetch(new Request(app.origin+'/api/v1/auth/me'),{DB:{prepare(){throw Error('Synthetic storage failure');}}});
  assert.equal(failure.status,500);check(failure);await failure.text();
});
