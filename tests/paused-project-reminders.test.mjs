import test from 'node:test';
import assert from 'node:assert/strict';
import {paintAiDailyReminders,renderAiReports} from '../web/pages/ai-reports.mjs';
import {paintWorkReminders,renderWorkReminders} from '../web/pages/work-reminders.mjs';

function reminderDom(t) {
  const original=globalThis.document,roots=new Map();
  for(const selector of ['#ai-reports','#work-reminders']) {
    const nodes=new Map();
    roots.set(selector,{nodes,querySelector(key){if(!nodes.has(key))nodes.set(key,{});return nodes.get(key);}});
  }
  globalThis.document={querySelector:key=>roots.get(key),activeElement:null};
  t.after(()=>{globalThis.document=original;});
  return {ai:()=>roots.get('#ai-reports').nodes,legacy:()=>roots.get('#work-reminders').nodes};
}
const at='2026-11-14T01:00:00Z';
const item=(summary,source={})=>Object.freeze({summary,updated_at:at,...source});

test('both reminder entrances hide only the exact paused source and retain mixed/unsourced rows in order',t=>{
  const dom=reminderDom(t);
  const items=Object.freeze([
    item('hidden-project',{source_key:'tencent.daily-summary'}),
    item('keep-other',{source_key:'another.daily-summary'}),
    item('keep-prefix',{source_key:'tencent.daily-summary.extra'}),
    item('keep-case',{source_key:'Tencent.daily-summary'}),
    item('keep-missing',{source:'tencent.daily-summary'}),
    item('keep-null',{source_key:null}),item('keep-empty',{source_key:''})
  ]);
  const data=Object.freeze({date:'2026-11-14',items}),before=JSON.stringify(data);
  paintAiDailyReminders(data);paintWorkReminders(data);
  // 待拍板 shows each kept reminder's questions in its one card; the old entrance still shows whole reminders.
  const decisions=dom.ai().get('#ai-reminder-list').innerHTML;
  assert.match(decisions,/没有单列「待你拍板」/);assert.equal((decisions.match(/<article /g)||[]).length,1);
  for(const html of [dom.legacy().get('#reminder-list').innerHTML]) {
    assert.doesNotMatch(html,/hidden-project/);
    const kept=items.slice(1).map(row=>row.summary);
    for(const summary of kept)assert.ok(html.includes(summary),summary);
    for(let i=1;i<kept.length;i++)assert.ok(html.indexOf(kept[i-1])<html.indexOf(kept[i]));
    assert.equal((html.match(/<article /g)||[]).length,6);
  }
  assert.equal(JSON.stringify(data),before);
});
test('all paused records produce the existing empty state in both entrances',t=>{
  const dom=reminderDom(t),data={date:'2026-11-14',items:[item('hidden-project',{source_key:'tencent.daily-summary'})]};
  paintAiDailyReminders(data);paintWorkReminders(data);
  assert.equal(dom.ai().get('#ai-reminder-list').innerHTML,'<p>暂无工作提醒</p>');
  assert.match(dom.legacy().get('#reminder-list').innerHTML,/reminder-empty.*暂无工作提醒/);
  paintAiDailyReminders({items:[]});paintWorkReminders({items:[]});
  assert.doesNotMatch(dom.ai().get('#ai-reminder-list').innerHTML,/<article/);
  assert.doesNotMatch(dom.legacy().get('#reminder-list').innerHTML,/<article/);
});
test('loading and errors remain visible without displaying a paused card',t=>{
  const dom=reminderDom(t);
  paintAiDailyReminders(null,'',true);paintWorkReminders({loading:true,items:[]});
  assert.equal(dom.ai().get('#ai-reminder-status').textContent,'正在读取工作提醒…');
  assert.equal(dom.ai().get('#ai-reminder-list').innerHTML,'');assert.equal(dom.legacy().get('#reminder-list').innerHTML,'');
  paintAiDailyReminders(null,'读取失败');paintWorkReminders({items:[]},'读取失败');
  assert.equal(dom.ai().get('#ai-reminder-status').textContent,'读取失败');
  assert.equal(dom.legacy().get('#reminder-error').textContent,'读取失败');assert.equal(dom.legacy().get('#reminder-error').hidden,false);
});
test('daily reminders, AI reports, calendar, experiments and the legacy date picker remain available',()=>{
  const html=renderAiReports();
  for(const marker of ['data-ai-daily-tab="reminders"','data-ai-daily-tab="reports"','ai-report-calendar','ai-experiments'])
    assert.ok(html.includes(marker),marker);
  assert.match(renderWorkReminders(),/reminder-date/);
});
