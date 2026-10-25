import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {frontendSource} from './frontend-client.mjs';

const source=await frontendSource();
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const publishedData=()=>({cumulative:{article_count:1,data_article_count:1,mean_reads:0,coverage:1,
  no_snapshot_count:0,totals:{reads:0,likes:0,comments:0}},accounts:[],platform_comparison:[],
  top_articles:[],trend:[],due_reviews:[]});
const ledgerRows=[
  {id:'drafting',account_id:'account',status:'drafting',writer:'dedao'},
  {id:'saved',account_id:'account',status:'draft_saved',writer:'human'},
  {id:'published',account_id:'account',status:'published',writer:'dedao'},
];
function ledgerPage(path) {
  const query=new URL(path,'http://localhost').searchParams,page=Number(query.get('page')),
    pageSize=Number(query.get('page_size')),offset=(page-1)*pageSize;
  const rows=ledgerRows.filter(row=>row.status===query.get('status'));
  return {data:rows.slice(offset,offset+pageSize),meta:{total:rows.length,page,page_size:pageSize,
    offset,has_more:offset+pageSize<rows.length}};
}
function responseFor(path) {
  return Response.json(path.includes('/overview?')?{data:publishedData()}:ledgerPage(path));
}
function client({search='',fetch:transport=async path=>responseFor(path)}={}) {
  let uuid=0;
  const events=new Map(),windowEvents=new Map(),nodes=new Map(),historyCalls=[];
  const makeNode=()=>({innerHTML:'',firstChild:null,isConnected:true,dataset:{},style:{},attributes:{},
    querySelector(){return null;},querySelectorAll(){return [];},contains(){return false;},
    setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},focus(){}});
  for(const key of ['#app','#overlay','#page-content'])nodes.set(key,makeNode());
  const body=makeNode(),document={body,activeElement:body,visibilityState:'visible',
    querySelector:key=>nodes.get(key)||null,querySelectorAll:()=>[],
    addEventListener(name,handler){if(!events.has(name))events.set(name,[]);events.get(name).push(handler);}};
  const location={href:'http://localhost/'+search,search};
  const locate=value=>{location.href=String(value);location.search=new URL(value).search;};
  const saveHistory=kind=>(_data,_title,value)=>{historyCalls.push({kind,url:String(value)});locate(value);};
  const context=vm.createContext({document,location,
    history:{pushState:saveHistory('push'),replaceState:saveHistory('replace')},
    localStorage:{getItem(){return null;},setItem(){}},
    window:{addEventListener(name,handler){if(!windowEvents.has(name))windowEvents.set(name,[]);windowEvents.get(name).push(handler);},scrollTo(){}},
    fetch:transport,Response,Headers,AbortController,AbortSignal,DOMException,URL,URLSearchParams,Intl,console,
    structuredClone,crypto:{randomUUID:()=>`synthetic-verification-key-${++uuid}`},
    setTimeout(){return 1;},clearTimeout(){},requestAnimationFrame(){}});
  new vm.Script(source).runInContext(context);
  const run=code=>vm.runInContext(code,context);
  run("state.me={id:'synthetic-router-user',username:'Synthetic user',csrfToken:'synthetic-csrf'};state.accounts=[{id:'account',name:'合成账号',platform:'toutiao',active:1}];readRoute();");
  const dispatch=async(name,event)=>{for(const handler of events.get(name)||[])await handler(event);};
  return {run,nodes,location,historyCalls,put(name,value){context[name]=value;},
    route(search){locate('http://localhost/'+search);run('readRoute()');},
    async click(action,data={}) {
      const target={dataset:{action,...data},closest(){return this;}};
      let prevented=false;
      await dispatch('click',{target,preventDefault(){prevented=true;}});
      return prevented;
    },
    async change(target){await dispatch('change',{target});await settle();},
    async popstate(search){locate('http://localhost/'+search);for(const handler of windowEvents.get('popstate')||[])await handler();},
  };
}

test('article route round trips exact pipeline filters, false flags and selected ledger columns',()=>{
  const app=client();
  for(const status of ['drafting','illustrated','draft_saved','published','failed']) {
    const filters={status,slot:'tt1',writer:'gemini_web',has_warnings:'false',has_pending_verify:'true',
      series_no_min:'1',series_no_max:'200'};
    app.route('?'+new URLSearchParams({page:'articles',account:'account',...filters,columns:'status,writer,verify,unknown'}));
    for(const [key,value] of Object.entries(filters))assert.equal(app.run(`state.filters.${key}`),value,key);
    assert.deepEqual(plain(app.run('[...state.columns]')),['status','writer','verify']);
    app.run('updateRoute(true)');
    const query=new URL(app.location.href).searchParams;
    assert.equal(query.get('status'),status==='draft_saved'?null:status);
    assert.equal(query.get('has_warnings'),'false');
    assert.equal(query.get('has_pending_verify'),'true');
    app.run("state.filters=defaultFilters();state.account='';readRoute()");
    for(const [key,value] of Object.entries(filters))assert.equal(app.run(`state.filters.${key}`),value,key);
    assert.equal(app.run('state.account'),'account');
  }
  assert.ok(app.historyCalls.every(call=>call.kind==='push'));
});

test('invalid pipeline enum, boolean and series range routes cannot broaden the saved-draft cohort',()=>{
  const app=client();
  for(const invalid of [
    {status:'',slot:'tt4',writer:'model',has_warnings:'0',has_pending_verify:'1'},
    {status:'all',slot:'TT1',writer:'Human',has_warnings:'False',has_pending_verify:'TRUE'},
  ]) {
    app.route('?'+new URLSearchParams({page:'articles',...invalid}));
    assert.equal(app.run('state.filters.status'),'draft_saved');
    for(const key of ['slot','writer','has_warnings','has_pending_verify'])assert.equal(app.run(`state.filters.${key}`),'',key);
    app.run('updateRoute()');
    for(const key of Object.keys(invalid))assert.equal(new URL(app.location.href).searchParams.has(key),false,key);
  }
  for(const value of ['0','-1','1.5','1e2',' 2','9007199254740992']) {
    app.route('?'+new URLSearchParams({page:'articles',series_no_min:value,series_no_max:value}));
    assert.equal(app.run('state.filters.series_no_min'),'',value+' minimum');
    assert.equal(app.run('state.filters.series_no_max'),'',value+' maximum');
  }
});

test('series ranges keep valid one-sided bounds and discard reversed ranges',()=>{
  const app=client();
  for(const [min,max,expectedMin,expectedMax] of [
    ['1','','1',''],['','200','','200'],['5','5','5','5'],['200','1','',''],
    ['1','9007199254740991','1','9007199254740991'],
  ]) {
    app.route('?'+new URLSearchParams({page:'articles',series_no_min:min,series_no_max:max}));
    assert.equal(app.run('state.filters.series_no_min'),expectedMin);
    assert.equal(app.run('state.filters.series_no_max'),expectedMax);
  }
});

test('overview scope is bounded without changing todo fallback, notes dates or fresh-login routing',async()=>{
  const app=client();
  for(const [search,page,date,scope] of [
    ['', 'todos',null,'drafts'],['?page=invalid&article_scope=published','todos',null,'published'],
    ['?page=todos&date=2024-02-29&article_scope=all','todos','2024-02-29','drafts'],
    ['?page=notes&date=2026-10-24&article_scope=published','notes','2026-10-24','published'],
    ['?page=dashboard&article_scope=drafts','dashboard',null,'drafts'],
    ['?page=dashboard&article_scope=Published','dashboard',null,'drafts'],
  ]) {
    app.route(search);app.run('updateRoute()');
    assert.equal(app.run('state.page'),page);assert.equal(app.run('state.articleOverviewMode'),scope);
    const query=new URL(app.location.href).searchParams;
    assert.equal(query.get('date'),date);assert.equal(query.get('article_scope'),scope==='published'?'published':null);
    if(page==='notes')assert.equal(app.run('dailyNotesRouteDate()'),date);
    if(page==='todos')assert.equal(app.run('state.todoDate'),date||'');
    const html=app.run('mainContent()');
    if(page==='dashboard')assert.match(html,/data-action="article-overview-mode"/);
    else assert.doesNotMatch(html,/article-overview-mode|data-action="new-article"/);
  }
  const calls=[];
  app.route('');app.put('readLogin',async path=>{calls.push(path);return path==='/auth/me'?{id:'synthetic-login'}:[];});
  app.run('api=readLogin;renderShell=()=>{}');
  await app.run('init({freshLogin:true})');
  assert.deepEqual(calls,['/auth/me','/accounts']);assert.equal(app.run('state.page'),'todos');
  assert.equal(new URL(app.location.href).searchParams.get('page'),'todos');
});

test('default dashboard uses all five complete ledger cohorts with one page context and clears published state',async()=>{
  const app=client({search:'?page=dashboard'}),calls=[];
  app.put('readLedger',async(path,options)=>{calls.push({path,options});return ledgerPage(path);});
  app.run("api=readLedger;state.dashboard={marker:'obsolete-published'}");
  await app.run('renderPage()');
  assert.deepEqual(calls.map(call=>new URL(call.path,'http://localhost').searchParams.get('status')),
    ['drafting','illustrated','draft_saved','published','failed']);
  assert.ok(calls.every(call=>call.path.startsWith('/articles?')&&call.options.envelope===true));
  assert.ok(calls.every(call=>call.options.context===calls[0].options.context));
  assert.equal(calls[0].options.context.kind,'page');assert.equal(app.run('state.dashboard'),null);
  const content=app.nodes.get('#page-content');
  assert.match(content.innerHTML,/文章台账/);assert.match(content.innerHTML,/<dt>草稿 \/ 未发布<\/dt><dd>2<\/dd>/);
  assert.match(content.innerHTML,/<dt>已发布<\/dt><dd>1<\/dd>/);assert.doesNotMatch(content.innerHTML,/dashboard-stats|error-panel/);
  assert.equal(content.attributes['aria-busy'],'false');
});

test('explicit published scope retains the overview endpoint, parameters and real zero metrics',async()=>{
  const calls=[],app=client({search:'?page=dashboard&article_scope=published&period=30d&top_n=12&top_platform=zhihu',
    fetch:async(path,options)=>{calls.push({path,options});return responseFor(path);}});
  await app.run('renderPage()');
  assert.equal(calls.length,1);assert.equal(calls[0].path,'/api/v1/overview?period=30d&top_n=12&top_platform=zhihu');
  assert.equal(calls[0].options.signal.aborted,false);
  assert.equal(app.run('state.dashboard.cumulative.totals.reads'),0);
  const html=app.nodes.get('#page-content').innerHTML;
  assert.match(html,/dashboard-stats/);assert.match(html,/<dt>累计阅读<\/dt><dd class="">0<\/dd>/);
  assert.doesNotMatch(html,/article-ledger-stats|error-panel/);
});

test('native published Top link preserves its cohort and platform through every dashboard refresh and a fresh route',async()=>{
  for(const platform of ['', 'wechat']) {
    const app=client({search:'?page=dashboard&article_scope=published&top_platform='+platform});
    const assertNativeRoute=stage=>{
      const links=app.nodes.get('#page-content').innerHTML.match(/<a\b[^>]*data-action="all-top"[^>]*>/g)||[];
      assert.equal(links.length,1,stage);
      const href=links[0].match(/href="([^"]+)"/)?.[1];
      assert.ok(href,stage);
      const search=href.replaceAll('&amp;','&'),query=new URL(search,'http://localhost').searchParams;
      assert.equal(query.get('page'),'articles',stage);assert.equal(query.get('status'),'published',stage);
      assert.equal(query.get('platform')||'',platform,stage);assert.equal(query.get('sort'),'reads',stage);
      assert.equal(query.get('order'),'desc',stage);
      const opened=client({search});
      assert.equal(opened.run('state.page'),'articles',stage);
      assert.equal(opened.run('state.filters.status'),'published',stage);
      assert.equal(opened.run('state.filters.platform'),platform,stage);
      assert.equal(opened.run('state.filters.sort'),'reads',stage);
      assert.equal(opened.run('state.filters.order'),'desc',stage);
    };
    await app.run('renderPage()');assertNativeRoute('initial overview');
    await app.click('toggle-attention');assertNativeRoute('attention refresh');
    await app.click('trend-tab',{tab:'publication'});assertNativeRoute('trend tab refresh');
    await app.change({id:'trend-date',value:'2026-10-24',dataset:{},closest(){return null;}});
    assertNativeRoute('trend date refresh');
    await app.change({id:'trend-metric',value:'likes',dataset:{},closest(){return null;}});
    assertNativeRoute('trend metric refresh');
  }
});

test('scope switch click and back navigation restore the pressed control and URL without duplicate history',async()=>{
  const app=client({search:'?page=dashboard'}),shells=[];
  app.put('recordShell',html=>shells.push(html));app.run('renderShell=()=>recordShell(mainContent())');
  await app.click('article-overview-mode',{mode:'published'});
  assert.equal(app.run('state.articleOverviewMode'),'published');
  assert.match(shells.at(-1),/data-mode="published" aria-pressed="true"/);
  assert.equal(new URL(app.location.href).searchParams.get('article_scope'),'published');
  assert.equal(app.historyCalls.length,1);assert.equal(app.historyCalls[0].kind,'push');
  await app.click('article-overview-mode',{mode:'published'});await app.click('article-overview-mode',{mode:'all'});
  assert.equal(app.historyCalls.length,1);assert.equal(shells.length,1);
  await app.click('article-overview-mode',{mode:'drafts'});
  assert.equal(new URL(app.location.href).searchParams.has('article_scope'),false);
  assert.match(shells.at(-1),/data-mode="drafts" aria-pressed="true"/);
  await app.popstate('?page=dashboard&article_scope=published');
  assert.equal(app.run('state.articleOverviewMode'),'published');
  assert.match(shells.at(-1),/data-mode="published" aria-pressed="true"/);
  assert.equal(app.historyCalls.filter(call=>call.kind==='push').length,2);
});

test('published metric drilldowns explicitly request published rows and clear incompatible draft filters',async()=>{
  const cases=[
    ['missing-list',{status:'missing_reads'},{data_status:'missing_reads',platform:'',account:'',sort:'published_at'}],
    ['all-top',{}, {data_status:'',platform:'wechat',account:'',sort:'reads'}],
    ['select-platform',{platform:'zhihu'},{data_status:'',platform:'zhihu',account:'',sort:'published_at'}],
    ['select-account',{id:'account'},{data_status:'',platform:'',account:'account',sort:'published_at'}],
  ];
  for(const [action,data,expected] of cases) {
    const app=client({search:'?page=dashboard'}),calls=[];
    app.run("renderShell=()=>{};state.topPlatform='wechat';state.filters={...defaultFilters(),status:'failed',slot:'tt1',writer:'human',has_warnings:'true',series_no_min:'99'};state.account='account';state.listPage=9;");
    const prevented=await app.click(action,data);
    assert.equal(app.run('state.page'),'articles',action);assert.equal(app.run('state.filters.status'),'published',action);
    assert.equal(app.run('state.listPage'),1,action);assert.equal(app.run('state.account'),expected.account,action);
    assert.equal(new URL(app.location.href).searchParams.get('status'),'published',action);
    for(const key of ['slot','writer','has_warnings','series_no_min'])assert.equal(app.run(`state.filters.${key}`),'',action+': '+key);
    for(const key of ['data_status','platform','sort'])assert.equal(app.run(`state.filters.${key}`),expected[key],action+': '+key);
    if(['all-top','select-platform'].includes(action))assert.equal(prevented,true,action);
    app.put('listRead',async(path,options)=>{calls.push({path,options});return {data:[],meta:{total:0,unfiltered_total:0,has_more:false}};});
    app.run('api=listRead');await app.run('renderArticles()');
    const query=new URL(calls[0].path,'http://localhost').searchParams;
    assert.equal(query.get('status'),'published',action);assert.equal(query.get('page'),'1',action);
    assert.equal(query.get('account_id')||'',expected.account,action);
  }
});

test('switching overview scopes cancels old requests and late transport completion cannot overwrite the current page',async()=>{
  for(const initial of ['drafts','published']) {
    const calls=[],holds=[deferred(),deferred()];
    const app=client({search:'?page=dashboard'+(initial==='published'?'&article_scope=published':''),
      fetch(path,options){calls.push({path,options});return calls.length<=2?holds[calls.length-1].promise:Promise.resolve(responseFor(path));}});
    const old=app.run('renderPage()');
    app.run(`state.articleOverviewMode=${JSON.stringify(initial==='drafts'?'published':'drafts')}`);
    const current=app.run('renderPage()');
    assert.equal(calls.length,2);assert.equal(calls[0].options.signal.aborted,true);
    await old;
    const content=app.nodes.get('#page-content');
    assert.equal(content.attributes['aria-busy'],'true','obsolete finally must not clear the current loading state');
    assert.doesNotMatch(content.innerHTML,/error-panel/);
    holds[1].resolve(responseFor(calls[1].path));await current;
    const finished=content.innerHTML;
    assert.match(finished,initial==='drafts'?/dashboard-stats/:/article-ledger-stats/);
    holds[0].resolve(responseFor(calls[0].path));await settle();
    assert.equal(content.innerHTML,finished);assert.equal(content.attributes['aria-busy'],'false');
    if(initial==='published')assert.equal(app.run('state.dashboard'),null);
    else assert.equal(app.run('state.dashboard.cumulative.article_count'),1);
  }
});

test('late overview loader results and stale errors cannot render into a newer page even without transport cancellation',async()=>{
  for(const mode of ['drafts','published']) {
    const app=client({search:'?page=dashboard&article_scope='+mode}),gate=deferred();
    app.put('deferredLoad',()=>gate.promise);
    app.run(mode==='drafts'?'loadArticleLedgerSummary=deferredLoad':'api=deferredLoad');
    const old=app.run('renderPage()');
    app.run("state.page='settings';state.settingsTab='security'");await app.run('renderPage()');
    const current=app.nodes.get('#page-content').innerHTML;
    gate.resolve(mode==='drafts'?{verified:true,total:0}:publishedData());await old;
    assert.equal(app.nodes.get('#page-content').innerHTML,current);assert.match(current,/password-form/);
    assert.equal(app.run('state.dashboard == null'),true);
  }
  for(const error of [new DOMException('Cancelled','AbortError'),Object.assign(new Error('Stale session'),{staleSession:true})]) {
    const app=client({search:'?page=dashboard'});
    app.put('failedLoad',async()=>{throw error;});app.run('loadArticleLedgerSummary=failedLoad');
    await app.run('renderPage()');assert.doesNotMatch(app.nodes.get('#page-content').innerHTML,/error-panel/);
  }
});

test('a genuine overview read failure remains visible and escaped rather than becoming an empty ledger',async()=>{
  const app=client({search:'?page=dashboard'});
  app.put('failedRead',async()=>{throw new Error('<img src=x onerror=1>');});app.run('api=failedRead');
  await app.run('renderPage()');
  const content=app.nodes.get('#page-content');
  assert.match(content.innerHTML,/error-panel/);assert.match(content.innerHTML,/&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(content.innerHTML,/<img|尚未记录文章|<dd>0<\/dd>/);
  assert.equal(content.attributes['aria-busy'],'false');
});

function verificationTarget(value,extra={}) {
  return {type:'select-one',value,dataset:{articleId:'verify',articleVerifyIndex:'0'},
    matches:selector=>selector==='[data-article-verify-index]',closest(){return null;},...extra};
}
function bindVerification(app,remote,read) {
  const views=[];app.put('verificationArticle',remote);app.put('verificationRead',read);
  app.put('recordVerification',value=>views.push(plain(value)));
  app.run('api=verificationRead;const verificationTicket=runtime.modalRequestVersion;bindArticleVerification(verificationArticle,{isCurrent:()=>verificationTicket===runtime.modalRequestVersion,render:recordVerification})');
  return views;
}

test('registered change delegation leaves unknown verification untouched and saves only explicit boolean choices',async()=>{
  const app=client(),writes=[];
  let remote={id:'verify',version:1,verify_items:[{description:'核对来源',done:null,future:{keep:7}}]};
  const views=bindVerification(app,remote,async(path,options={})=>{
    assert.equal(path,'/articles/verify');
    if(options.method==='PUT'){writes.push(plain(options));remote={...remote,version:remote.version+1,verify_items:plain(options.body.verify_items)};}
    return structuredClone(remote);
  });
  await app.change(verificationTarget(''));await app.change(verificationTarget('unknown'));
  assert.equal(writes.length,0);assert.equal(views.length,0);
  await app.change(verificationTarget('false'));
  assert.equal(writes.length,1);assert.equal(writes[0].body.version,1);
  assert.deepEqual(writes[0].body.verify_items,[{description:'核对来源',done:false,future:{keep:7}}]);
  assert.equal(views.at(-1).phase,'saved');
  await app.change(verificationTarget('false',{type:'checkbox',checked:true}));
  assert.equal(writes.length,2);assert.equal(writes[1].body.verify_items[0].done,true);
  await app.change(verificationTarget('false',{dataset:{articleId:'different-article',articleVerifyIndex:'0'}}));
  app.run('runtime.sessionEpoch++');await app.change(verificationTarget('false'));
  assert.equal(writes.length,2,'other articles and a previous session cannot submit through the old binding');
});

test('registered verification refresh and retry actions reconcile before resending the original CAS body and key',async()=>{
  const app=client(),writes=[];let reads=0;
  let remote={id:'verify',version:4,verify_items:[{description:'核对引用',done:false,extra:'保留'}]};
  const views=bindVerification(app,remote,async(_path,options={})=>{
    if(options.method==='PUT') {
      writes.push(plain(options));
      if(writes.length===1)throw new Error('Synthetic uncertain response');
      remote={...remote,version:5,verify_items:plain(options.body.verify_items)};
    } else reads++;
    return structuredClone(remote);
  });
  await app.change(verificationTarget('true'));
  assert.equal(writes.length,1);assert.equal(reads,1);assert.equal(views.at(-1).phase,'unknown');
  await app.change(verificationTarget('false'));assert.equal(writes.length,1);
  await app.click('article-verify-refresh');assert.equal(reads,2);assert.equal(writes.length,1);
  await app.click('article-verify-retry');
  assert.equal(writes.length,2);assert.deepEqual(writes[1],writes[0]);
  assert.equal(writes[0].body.version,4);assert.ok(writes[0].headers['Idempotency-Key']);
  assert.equal(reads,4);assert.equal(views.at(-1).phase,'saved');
  app.run('runtime.modalRequestVersion++');
  await app.click('article-verify-refresh');await app.click('article-verify-retry');
  assert.equal(reads,4);assert.equal(writes.length,2,'a closed/replaced modal cannot keep operating on its article');
});
