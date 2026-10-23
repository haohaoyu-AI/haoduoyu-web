import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

const BASE='ce18a7b7a09f8acbfb9fe7c397b97e5d87a20ac6';
const root=new URL('../',import.meta.url);
const baseline=execFileSync('git',['show',BASE+':public/app.js'],{cwd:root});
const candidate=await readFile(new URL('public/app.js',root));
class FrozenDate extends Date {constructor(...args){super(...(args.length?args:['2026-10-23T00:00:00Z']));}static now(){return Date.parse('2026-10-23T00:00:00Z');}}
function client(bytes){
  const body={};
  const context=vm.createContext({AbortController,AbortSignal,DOMException,Headers,Date:FrozenDate,
    document:{querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},body,activeElement:body},
    window:{addEventListener(){}},location:{href:'http://localhost/',search:''},history:{replaceState(){},pushState(){}},
    localStorage:{getItem(){return null;},setItem(){}},URL,URLSearchParams,Intl,console,setTimeout,clearTimeout,requestAnimationFrame(){}});
  const source=bytes.toString('utf8');assert.match(source,/init\(\);\s*$/);
  new vm.Script(source.replace(/init\(\);\s*$/,'')).runInContext(context);
  const run=code=>vm.runInContext(code,context);
  run('state.accounts='+JSON.stringify([{id:'a',name:'虚构<&账号>',platform:'zhihu'},{id:'b',name:'合成账号二',platform:'wechat'}])+';state.filters={...defaultFilters()};');
  return {run};
}
const articles=()=>Array.from({length:4},(_,i)=>({id:'synthetic-'+i,title:'<合成标题> "& '+i,account_id:i%2?'b':'a',
  account_name:i%2?'合成账号二':'虚构<&账号>',platform:i%2?'wechat':'zhihu',production_mode:i%2?'automatic':'manual',
  date_status:i===2?'unverified':'recorded',published_at:i===2?null:'2026-10-20T08:00:00.000Z',duration_seconds:i?null:0,
  latest_as_of:i===3?null:'2026-10-21T08:00:00.000Z',latest_metrics:i===3?null:{reads:i===1?null:0,likes:0,comments:2,approvals:i?null:0},
  period_metrics:{reads:i?null:0,likes:0,comments:2,approvals:i?null:0},attention:{kind:['up','down','normal','insufficient'][i]}}));
function compare(before,after,code,label){
  const expected=before.run(code),actual=after.run(code);assert.equal(typeof expected,'string');
  assert.ok(actual===expected,label+': complete rendered string differs');
}

test('bounded table candidate must save at least 3000 bytes without minification',()=>{
  assert.equal(baseline.length,115637);
  assert.ok(candidate.length<=baseline.length-3000,
    `Candidate ${candidate.length} B; baseline ${baseline.length} B; net saved ${baseline.length-candidate.length} B; required 3000 B.`);
});

test('six scoped table renderers retain complete strings for synthetic columns, grouping and missing values',t=>{
  const before=client(baseline),after=client(candidate);let count=0;
  const run=(code,label)=>{compare(before,after,code,label);count++;};
  for(const rows of [[],articles().slice(0,1),articles()]){
    for(const c of [before,after])c.run('rows='+JSON.stringify(rows));
    for(const group of ['', 'account','mode'])for(const columns of [[],['reads','as_of'],null]){
      for(const c of [before,after])c.run('state.filters={...defaultFilters(),group:'+JSON.stringify(group)+'};state.columns=new Set('+
        (columns===null?'Object.keys(articleColumns)':JSON.stringify(columns))+');');
      run('articleTable(rows)','articleTable');
    }
    for(const offset of [0,5])run('renderTopTable(rows,'+offset+')','renderTopTable');
    run('renderAttentionArticles(rows)','renderAttentionArticles');
  }
  for(const accounts of [[],[{id:'a',name:'虚构<&账号>',platform:'zhihu',article_count:0,totals:{reads:0},mean_reads:0,median_reads:null,
    period_metrics:{reads:0,likes:null,comments:2,approvals:0}}],
    [{id:'a',name:'合成账号',platform:'wechat',article_count:2,totals:{reads:null},mean_reads:null,median_reads:0,period_metrics:{reads:null,comments:0}}]]){
    for(const c of [before,after])c.run('accounts='+JSON.stringify(accounts));
    run('renderPlatformTable(accounts)','renderPlatformTable');run('renderPeriodAccounts(accounts)','renderPeriodAccounts');
    for(const tab of ['metrics','publication'])for(const metric of ['reads','comments']){
      for(const c of [before,after])c.run('state.trendTab='+JSON.stringify(tab)+';state.trendMetric='+JSON.stringify(metric)+';');
      run('renderDailyTable({accounts,trend:[{date:"2026-10-20",accounts:accounts.map(a=>({account_id:a.id,metrics:{reads:0,comments:null}}))}],'+
        'publication_trend:[{date:"2026-10-20",accounts:accounts.map(a=>({account_id:a.id,count:0}))}]})','renderDailyTable');
    }
  }
  t.diagnostic(count+' exact complete-string baseline/candidate comparisons; no browser or pixel equivalence claim.');
});

test('article identity preserves getter and coercion ordering in all three scoped renderers',t=>{
  for(const expression of ['articleTable([observed])','renderTopTable([observed],rank)','renderAttentionArticles([observed])']){
    const values=[];
    for(const bytes of [baseline,candidate]){
      const c=client(bytes);c.run('state.columns=new Set();state.filters={...defaultFilters()};trace=[];observed='+JSON.stringify(articles()[0])+';');
      c.run(`for(const key of ['id','title','account_name'])Object.defineProperty(observed,key,{get(){trace.push('get:'+key);return {
        [Symbol.toPrimitive](hint){trace.push('coerce:'+key+':'+hint);return '<synthetic-'+key+'>';}};}});
        rank={[Symbol.toPrimitive](hint){trace.push('rank:'+hint);return 5;}};`);
      const html=c.run(expression);values.push({html,trace:JSON.parse(c.run('JSON.stringify(trace)'))});
    }
    assert.ok(values[0].html===values[1].html,expression+' complete HTML');assert.deepEqual(values[1].trace,values[0].trace,expression);
  }
  t.diagnostic('Three full renderers compared with observable property/coercion traces.');
});

test('render-level mutation controls detect action, escaping and prefix-order changes',()=>{
  for(const mutation of [
    `articleIdentityCell=(...args)=>originalIdentity(...args).replace('article-detail','changed-action');`,
    `articleIdentityCell=(...args)=>originalIdentity(...args).replace('&lt;','<');`,
    `articleIdentityCell=(article,lead,meta)=>originalIdentity(article,meta,lead);`,
  ]){
    const before=client(baseline),after=client(candidate);
    for(const c of [before,after])c.run('rows='+JSON.stringify(articles())+';');
    after.run('const originalIdentity=articleIdentityCell;'+mutation);
    assert.notEqual(after.run('renderTopTable(rows)'),before.run('renderTopTable(rows)'));
  }
});
