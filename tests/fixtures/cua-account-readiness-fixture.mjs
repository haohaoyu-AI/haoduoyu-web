// Synthetic supported-browser surface; no browser, computer, network or account.
export const TIME = '2026-10-10T14:00:00.000Z';
export const HOME = 'https://www.zhihu.com/';
export const ACCOUNT = 'ren-zhe-ai-chi-yu-52';
export const accountContext = () => ({article_id:'mock-article',platform:'zhihu',target_account:ACCOUNT,browser_session:'mock-browser',executor_id:'mock-executor',tab_id:'mock-editor',editor_url:'https://zhuanlan.zhihu.com/write',purpose:'account_identity',request_id:'account-1',requested_at:TIME});

export function accountFixture(options = {}) {
  let milliseconds = Date.parse(TIME), url = HOME, menuIndex = 0, linkIndex = 0;
  let menuReading, linkReading, blocker = options.blocker || '知乎首页', identityTag = options.identityTag || 'BUTTON';
  const state = {navigations:0,menuClicks:0,waits:[],conditionWaits:[],menuCounts:0,linkCounts:0,visibilityReads:0,enabledReads:0,identityReads:0,snapshots:0,urlReads:0,steps:[]};
  const now = () => new Date(milliseconds).toISOString();
  const invoke = (step, value) => {
    state.steps.push(step);
    if (options.errorAt === step) throw options.error || Error('Synthetic failure');
    return value;
  };
  const reading = (list, index) => list?.[Math.min(index, list.length - 1)] || {count:1,visible:true,enabled:true};
  const menu = {
    count:async()=>{state.menuCounts++;menuReading=state.identityReads && options.afterIdentityMenu || reading(options.menu,menuIndex++);return invoke('menu_count',menuReading.count);},
    isVisible:async()=>{state.visibilityReads++;return invoke('menu_visible',menuReading.visible ?? true);},
    isEnabled:async()=>{state.enabledReads++;return invoke('menu_enabled',menuReading.enabled ?? true);},
    innerText:async()=>invoke('menu_label',options.menuLabel || '好多鱼'),
    getAttribute:async()=>null,
    evaluate:async fn=>{
      state.identityReads++;
      milliseconds += options.identityAdvanceBy || 0;
      if (options.afterIdentityBlocker !== undefined) blocker = options.afterIdentityBlocker;
      if (options.afterIdentityUrl !== undefined) url = options.afterIdentityUrl;
      return invoke('menu_identity',fn({tagName:identityTag,getAttribute:key=>key==='type'?'button':null}));
    },
    click:async()=>{invoke('menu_click');state.menuClicks++;}
  };
  const link = {
    count:async()=>{state.linkCounts++;linkReading=reading(options.link,linkIndex++);return invoke('link_count',linkReading.count);},
    isVisible:async()=>invoke('link_visible',linkReading.visible ?? true),
    getAttribute:async()=>invoke('link_href','https://www.zhihu.com/people/'+ACCOUNT)
  };
  if (options.documentedWaitFor) {
    const conditionWait = prefix => async parameters => {
      if (Object.keys(parameters).sort().join(',') !== 'state,timeoutMs' || parameters.state !== 'visible' ||
          !Number.isSafeInteger(parameters.timeoutMs) || parameters.timeoutMs < 1) throw Error('Invalid documented condition wait parameters');
      state.conditionWaits.push({control:prefix,parameters:{...parameters}});
      invoke(prefix+'_wait_for');
      if (options.conditionAdvanceBy !== undefined) milliseconds += options.conditionAdvanceBy;
      if (options.afterWaitBlocker !== undefined) blocker = options.afterWaitBlocker;
      if (options.afterWaitUrl !== undefined) url = options.afterWaitUrl;
      if (options.afterWaitIdentityTag !== undefined) identityTag = options.afterWaitIdentityTag;
    };
    menu.waitFor = conditionWait('menu');
    link.waitFor = conditionWait('link');
  }
  const verificationTab = {
    id:'mock-verification',
    goto:async value=>{invoke('navigation');state.navigations++;url=options.navigationUrl || value;milliseconds += options.navigationAdvanceBy || 0;},
    url:async()=>{state.urlReads++;return invoke('page_url',url);},
    playwright:{domSnapshot:async()=>{state.snapshots++;return invoke('page_blockers',blocker);},locator:key=>key==='avatar'?menu:link}
  };
  const waitForReadiness = async duration => {
    state.waits.push(duration);
    if (!options.frozenClock) milliseconds += options.advanceBy ?? duration;
    invoke('wait');
  };
  const argumentsForReader = {verificationTab,menu:{css:'avatar',observed_at:TIME,observed_url:HOME,identity:{tag:'BUTTON',type:'button',aria_label:null,title:null}},accountLink:{css:'profile',observed_at:TIME,observed_url:HOME},now,
    waitForReadiness,readinessTimeoutMs:500,readinessIntervalMs:100,readinessMaxChecks:5};
  return {state,now,verificationTab,argumentsForReader};
}
