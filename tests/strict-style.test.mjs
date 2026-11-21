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
    window:{addEventListener(){},setInterval(){return 0;},clearInterval(){}},localStorage:{getItem(){},setItem(){}},location:{href:'http://localhost/',search:''},
    setTimeout,clearTimeout,requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  return script=>vm.runInContext(script,context);
}
test('active page renderers emit escaped data without any inline style attributes',()=>{
  const run=client();
  run(`state.me={id:'u1',username:'Synthetic <safe>'};
    reviewSample=normalizeReviewData({
      articles:[{id:'a1',account:'V字',title:'Synthetic <safe>',published_at:'2026-10-20T03:00:00Z'}],
      snapshots:[{id:'s1',article_id:'a1',snapshot_date:'2026-10-21',age_hours:24,reads:1200,impressions:10000,ctr:12}]
    });
    reviewVm={account:'V字',now:'2026-10-22T00:00:00Z',filters:{},secondary:'cockpit',article:'',loading:false,error:''};`);
  for(const html of [
    run('renderContentReviewContent(reviewSample, reviewVm)'),
    run('renderAiReports()'),
    run('renderTodos()')
  ]) {
    assert.doesNotMatch(html,/\sstyle\s*=/i,'active renderers must not emit inline style attributes under strict CSP');
  }
  assert.match(run('renderContentReviewContent(reviewSample, reviewVm)'),/Synthetic &lt;safe&gt;/);
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
  const failingDb={prepare(sql){
    if(/\bFROM matrix_accounts\b/.test(sql))throw Error('Synthetic authenticated read failure');
    return app.db.prepare(sql);
  }};
  const failure=await worker.fetch(new Request(app.origin+'/api/v1/accounts',{headers:{Cookie:session.cookie}}),{DB:failingDb,SITE_ORIGIN:app.origin});
  assert.equal(failure.status,500);check(failure);await failure.text();
});
test('CSSOM hydration accepts only finite bounded heights and existing platform variables',()=>{
  const run=client();
  const cases=[['0','var(--p-zhihu)','0px','var(--p-zhihu)'],['80','var(--p-toutiao)','80px','var(--p-toutiao)'],
    ['12.5','var(--p-wechat)','12.5px','var(--p-wechat)'],['NaN','var(--p-other)','0px','var(--p-other)'],
    ['Infinity','url(https://example.invalid/blocked)','0px','var(--p-other)'],['-1','red;display:none','0px','var(--p-other)'],
    ['81','var(--accent)','0px','var(--p-other)'],['1px;background:red','var(--p-zhihu)','0px','var(--p-zhihu)']];
  for(const [height,color,wantHeight,wantColor]of cases) {
    run('syntheticElement={dataset:'+JSON.stringify({chartHeight:height,chartColor:color})+
      ',hasAttribute:key=>key==="data-chart-height",style:{values:{},setProperty(k,v){this.values[k]=v}}}');
    run('applyChartStyles({querySelectorAll:()=>[syntheticElement]})');
    assert.equal(run('syntheticElement.style.values["--h"]'),wantHeight);
    assert.equal(run('syntheticElement.style.values["--plot-color"]'),wantColor);
    assert.equal(run('Object.keys(syntheticElement.style.values).length'),2);
  }
  run('syntheticElement={dataset:{chartColor:"var(--p-other)"},hasAttribute:()=>false,style:{values:{},setProperty(k,v){this.values[k]=v}}}');
  run('applyChartStyles({querySelectorAll:()=>[syntheticElement]})');
  assert.equal(run('Object.keys(syntheticElement.style.values).join()'),'--plot-color');
});
