import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build,transform} from 'esbuild';

// Bundle in memory to exercise current module bindings without changing app.js.
const root=fileURLToPath(new URL('../',import.meta.url));
const bundled=await build({absWorkingDir:root,stdin:{resolveDir:root,contents:`
  import {state,runtime} from './web/core/state.mjs';
  import {readRoute,updateRoute,isMobileLayout,mobilePage} from './web/core/router.mjs';
  import {mobileNavigation,mobileSettingsMenu,renderMediaTabs,sidebarNavigation,sidebarWidthLimits,
    syncWorkbenchNavigation,syncMobileViewport} from './web/ui/workbench.mjs';
  import {setMenu,syncMenu,closeMobileMenuOutside,trapMobileMenuFocus} from './web/ui/menu.mjs';
  import {navigate,navigateLink,renderShell,handleResponsiveLayout} from './web/controller.mjs';
  import {renderDailyNotes} from './web/pages/daily-notes.mjs';
  globalThis.mobileTest={state,runtime,readRoute,updateRoute,isMobileLayout,mobilePage,mobileNavigation,mobileSettingsMenu,
    renderMediaTabs,sidebarNavigation,sidebarWidthLimits,syncWorkbenchNavigation,syncMobileViewport,setMenu,syncMenu,
    closeMobileMenuOutside,trapMobileMenuFocus,navigate,navigateLink,renderShell,handleResponsiveLayout,renderDailyNotes};
`},bundle:true,format:'esm',write:false,treeShaking:false,charset:'utf8'});
const source=bundled.outputFiles[0].text;
function browser({width=390,search='?page=todos',shell=true}={}) {
  const nodes=new Map(),events={},windowEvents={},entries=['http://localhost/'+search];let index=0;
  const classes=()=>{const values=new Set();return {contains:value=>values.has(value),toggle(value,on){
    if(on===undefined)on=!values.has(value);if(on)values.add(value);else values.delete(value);return on;
  },add:value=>values.add(value),remove:value=>values.delete(value)};};
  const style=()=>{const values=new Map();return {setProperty:(key,value)=>values.set(key,value),removeProperty:key=>values.delete(key),
    getPropertyValue:key=>values.get(key)||''};};
  let document;
  function node(extra={}) {
    const attributes=new Map();return {innerHTML:'',firstChild:null,hidden:false,inert:false,isConnected:true,dataset:{},style:style(),
      classList:classes(),clientWidth:width,querySelectorAll(){return [];},querySelector(){return null;},contains(){return false;},
      setAttribute:(key,value)=>attributes.set(key,String(value)),getAttribute:key=>attributes.get(key),removeAttribute:key=>attributes.delete(key),
      focus(){document.activeElement=this;},...extra};
  }
  const panel=node(),settings=node(),logout=node(),trigger=node(),side=node(),main=node(),overlay=node();
  panel.querySelectorAll=()=>[settings,logout];panel.contains=value=>value===settings||value===logout||value===panel;
  for(const item of [settings,logout])item.closest=selector=>selector.includes('mobile-settings-menu')?panel:null;
  trigger.closest=selector=>selector.includes('data-action')?trigger:null;
  const shellNode=node({dataset:{session:'0',user:'synthetic-user'}});
  nodes.set('#app',node());nodes.set('#overlay',overlay);nodes.set('#main',main);nodes.set('.sidebar',side);
  nodes.set('#mobile-settings-menu',panel);nodes.set('#mobile-settings-menu a[href]',settings);nodes.set('.mobile-settings-trigger',trigger);
  if(shell)nodes.set('.shell',shellNode);
  const location={href:entries[0],search};
  const locate=value=>{location.href=String(value);location.search=new URL(value).search;};
  const changes={push:0,replace:0};
  const history={replaceState(_state,_title,url){changes.replace++;entries[index]=String(url);locate(url);},
    pushState(_state,_title,url){changes.push++;entries.splice(++index);entries[index]=String(url);locate(url);}};
  document={activeElement:trigger,body:node(),documentElement:node(),
    querySelector:selector=>nodes.get(selector)||null,
    querySelectorAll:selector=>selector==='[data-action=menu]'?[trigger]:[],
    addEventListener(name,handler){(events[name]||=[]).push(handler);}};
  const window={innerWidth:width,innerHeight:844,matchMedia:()=>({matches:window.innerWidth<768}),
    visualViewport:{height:844,offsetTop:0,addEventListener(){}},scrollTo(){},
    addEventListener(name,handler){(windowEvents[name]||=[]).push(handler);}};
  const context=vm.createContext({window,document,location,history,localStorage:{getItem(){return null;},setItem(){}},
    URL,URLSearchParams,Headers,AbortController,AbortSignal,DOMException,Intl,console,structuredClone,setTimeout,clearTimeout,
    requestAnimationFrame:callback=>callback()});
  new vm.Script(source).runInContext(context);
  const run=value=>vm.runInContext(value,context);
  run("state.me={id:'synthetic-user',username:'合成用户'};state.accounts=[{id:'a',name:'合成账号',platform:'zhihu'}];renderPage=()=>{};");
  return {run,nodes,window,document,location,history,entries,changes,panel,settings,logout,trigger,side,main,overlay,shellNode,node,
    back(){assert.ok(index>0);locate(entries[--index]);},forward(){assert.ok(index+1<entries.length);locate(entries[++index]);}};
}

test('phone bottom navigation has exactly five ordered destinations, with settings and private logout in the top menu',()=>{
  const app=browser(),html=app.run('mobileNavigation()');
  assert.deepEqual([...html.matchAll(/data-nav="([^"]+)"/g)].map(match=>match[1]),['todos','notes','memos','reminders','dashboard']);
  assert.doesNotMatch(html,/<details|data-nav="settings"|data-nav="articles"/);
  assert.match(app.run('mobileSettingsMenu()'),/data-nav="settings"/);
  assert.match(app.run('mobileSettingsMenu()'),/data-action="logout"/);
  app.run('state.me.publicBusiness=true');assert.doesNotMatch(app.run('mobileSettingsMenu()'),/data-action="logout"/);
  assert.match(app.run('sidebarNavigation()'),/好多鱼图文/);
  const fresh=browser({shell:false});fresh.run('renderShell()');
  assert.match(fresh.nodes.get('#app').innerHTML,/class="icon-button mobile-settings-trigger"[^>]*aria-label="设置菜单"/);
  assert.match(fresh.nodes.get('#app').innerHTML,/aria-controls="mobile-settings-menu"/);
});

test('767px article entry is replaced with overview while 768px and desktop keep their article route and filters',()=>{
  for(const width of [390,767,768,1199,1440]) {
    const app=browser({width,search:'?page=articles&account=a&q=literal&list_page=3'});
    app.run('readRoute();updateRoute()');
    assert.equal(app.run('state.page'),width<768?'dashboard':'articles');
    assert.equal(new URL(app.location.href).searchParams.get('page'),width<768?'dashboard':'articles');
    assert.equal(app.run('state.filters.q'),'literal');assert.equal(app.run('state.listPage'),3);
    assert.equal(app.changes.push,0);assert.equal(app.changes.replace,1);
    assert.equal(app.run('state.account'),width<768?'':'a');
  }
});

test('initial history, back and forward canonicalize an article entry without adding a redirect loop',()=>{
  const app=browser();
  app.history.pushState({},'','http://localhost/?page=articles');
  app.run('readRoute();updateRoute()');assert.equal(app.entries.length,2);
  assert.equal(new URL(app.entries[1]).searchParams.get('page'),'dashboard');
  app.back();app.run('readRoute();updateRoute()');assert.equal(app.run('state.page'),'todos');
  app.forward();app.run('readRoute();updateRoute()');assert.equal(app.run('state.page'),'dashboard');
  assert.equal(app.entries.length,2);assert.equal(app.changes.push,1);
});

test('phone navigation and resize replace articles once, preserve an open editor, and never restore articles when widened',()=>{
  const app=browser({search:'?page=notes'});
  app.run('readRoute();let shellCalls=0;renderShell=()=>shellCalls++;navigate("articles")');
  assert.equal(app.run('state.page'),'dashboard');assert.equal(app.changes.push,0);assert.equal(app.changes.replace,1);
  app.run('navigateLink("articles")');assert.equal(app.run('shellCalls'),1);assert.equal(app.changes.replace,1);
  app.window.innerWidth=1440;app.run('navigate("articles")');assert.equal(app.run('state.page'),'articles');assert.equal(app.changes.push,1);
  app.overlay.innerHTML='<textarea>unsaved synthetic draft</textarea>';
  const version=app.run('runtime.modalRequestVersion');app.window.innerWidth=767;
  assert.equal(app.run('handleResponsiveLayout()'),true);assert.equal(app.run('state.page'),'dashboard');
  assert.match(app.overlay.innerHTML,/unsaved synthetic draft/);assert.equal(app.run('runtime.modalRequestVersion'),version);
  const replaced=app.changes.replace;assert.equal(app.run('handleResponsiveLayout()'),false);assert.equal(app.changes.replace,replaced);
  app.window.innerWidth=1440;assert.equal(app.run('handleResponsiveLayout()'),false);assert.equal(app.run('state.page'),'dashboard');
});

test('settings menu manages focus, outside closing, and the settings active marker without a sixth bottom item',()=>{
  const app=browser();app.run('state.page="settings";setMenu(true)');
  assert.equal(app.panel.hidden,false);assert.equal(app.side.inert,true);assert.equal(app.document.activeElement,app.settings);
  assert.equal(app.trigger.getAttribute('aria-current'),'page');assert.equal(app.trigger.getAttribute('aria-expanded'),'true');
  let prevented=0;app.document.activeElement=app.logout;
  const event={key:'Tab',shiftKey:false,preventDefault(){prevented++;}};
  // Pass actual DOM test objects through the exported binding.
  const trap=app.run('mobileTest.trapMobileMenuFocus');assert.equal(trap(event),true);
  assert.equal(prevented,1);assert.equal(app.document.activeElement,app.settings);
  app.run('mobileTest.closeMobileMenuOutside')({closest(){return null;}});
  assert.equal(app.panel.hidden,true);assert.equal(app.document.activeElement,app.trigger);
  app.window.innerWidth=768;app.run('syncMenu()');assert.equal(app.side.inert,false);assert.equal(app.panel.hidden,true);
});

test('existing life/work controls stay at the top and bottom notes navigation remembers the selected category',()=>{
  const app=browser({search:'?page=notes&notes_category=work'});app.run('readRoute()');
  const html=app.run('renderDailyNotes()');
  assert.equal((html.match(/data-notes-category=/g)||[]).length,2);
  assert.match(html,/data-notes-category="work" aria-pressed="true"/);
  assert.match(app.run('mobileNavigation()'),/data-nav="notes" data-notes-category="work"/);
  assert.ok(html.indexOf('notes-categories')<html.indexOf('notes-toolbar'));
});

test('visual viewport keyboard bounds fit the drawer and clean up on desktop without changing input text',()=>{
  const app=browser(),properties=app.document.documentElement.style;
  const field=app.node({value:'unmodified draft',matches:()=>true,getBoundingClientRect:()=>({top:90,bottom:740}),scrollIntoView(){this.scrolled=true;}});
  app.document.activeElement=field;app.window.visualViewport.height=420;app.window.visualViewport.offsetTop=12;
  app.run('syncMobileViewport()');
  assert.equal(properties.getPropertyValue('--mobile-viewport-height'),'420px');
  assert.equal(properties.getPropertyValue('--mobile-viewport-top'),'12px');
  assert.equal(properties.getPropertyValue('--mobile-viewport-keyboard'),'412px');
  assert.equal(app.document.documentElement.dataset.mobileKeyboard,'true');assert.equal(field.scrolled,true);
  assert.equal(field.value,'unmodified draft');
  app.document.activeElement=app.trigger;app.run('syncMobileViewport()');
  assert.equal(app.document.documentElement.dataset.mobileKeyboard,'false','browser chrome alone never hides navigation');
  app.window.innerWidth=768;app.run('syncMobileViewport()');
  assert.equal(properties.getPropertyValue('--mobile-viewport-height'),'');
  assert.equal(app.document.documentElement.dataset.mobileKeyboard,undefined);
});

test('mobile-only stylesheet covers safe area, touch inputs, bottom drawers and tablet drawers without desktop selectors',async()=>{
  const css=await readFile(new URL('../public/mobile.css',import.meta.url),'utf8');
  await transform(css,{loader:'css'});
  assert.match(css,/@media \(max-width:767px\)/);assert.match(css,/@media \(min-width:768px\) and \(max-width:1199px\)/);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css,/\.media-page-tabs \{ display:none; \}/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);assert.match(css,/min-height:44px/);
  assert.match(css,/font-size:var\(--font-size-16,16px\)!important/);
  assert.match(css,/align-items:flex-end/);assert.match(css,/var\(--mobile-viewport-height,100dvh\)/);
  assert.doesNotMatch(css,/@media[^\{]*min-width:1200px/);
  const app=browser();assert.equal(app.run('sidebarWidthLimits(767,767)'),null);
  assert.equal(app.run('sidebarWidthLimits(768,768).min'),88);assert.equal(app.run('sidebarWidthLimits(1200,1200).min'),200);
});
