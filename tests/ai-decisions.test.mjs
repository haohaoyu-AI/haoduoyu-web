import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionsFrom,decisionCount,decisionCards,decisionHistory,decisionStatus} from '../web/pages/ai-decisions.mjs';

// Synthetic reminder in the same shape as the daily one: bold section headings, a numbered 待你拍板 list, then a closing line.
const SAMPLE=['合成助手','**昨天（11-13）做了什么**','合成：发了 3 篇。','**数据**','- 合成：点击率 5%。',
  '**正在执行的改动**','- 合成：标题试验。','**待你拍板**','1. 合成：明天要不要恢复写作：建议恢复，',
  '   你说一声我就打开。','2. 合成：那篇不在表里：建议你在后台看一眼。','已按你的决定执行：合成：标签已填满。'].join('\n');

test('only the 待你拍板 items are taken, with wrapped lines kept on their item',()=>{
  assert.deepEqual(decisionsFrom(SAMPLE),['合成：明天要不要恢复写作：建议恢复，你说一声我就打开。','合成：那篇不在表里：建议你在后台看一眼。']);
  assert.equal(decisionCount([{summary:SAMPLE}]),2);
  assert.deepEqual(decisionsFrom('## 待你拍板\n- 合成：一件\n## 其他\n- 不算'),['合成：一件']);
  assert.deepEqual(decisionsFrom('**待你拍板**\n\n**数据**\n- 不算'),[],'an empty section means nothing waits');
  assert.equal(decisionsFrom('合成：没有这一段\n- 一条'),null);
});

test('the page lists only the questions: no full reminder, other shapes point to AI汇报',()=>{
  const other=decisionCards([{summary:'合成：另一种写法'}]);
  assert.doesNotMatch(other,/合成：另一种写法/);assert.match(other,/详细内容在「AI汇报」/);
  const cards=decisionCards([{summary:SAMPLE}]);
  assert.match(cards,/<ol class="ai-decision-list"><li class="ai-report-markdown">/);
  assert.doesNotMatch(cards,/看完整提醒|点击率|标签已填满/);
});

test('statuses Grok writes after a chat reply are shown as a mark, and history is a timeline',()=>{
  assert.deepEqual(decisionStatus('合成：恢复写作【已采纳】'),{text:'合成：恢复写作',status:'已采纳'});
  assert.deepEqual(decisionStatus('合成：停掉鱼见 → 已否决'),{text:'合成：停掉鱼见',status:'已否决'});
  assert.deepEqual(decisionStatus('合成：（待定）换封面'),{text:'合成：换封面',status:'待定'});
  assert.deepEqual(decisionStatus('合成：没有标记'),{text:'合成：没有标记',status:''});
  const history=decisionHistory([{date:'2026-11-13',items:[{summary:'**待你拍板**\n1. 合成：恢复写作【已采纳】\n2. 合成：换封面（待定）'}]},
    {date:'2026-11-12',items:[{summary:'合成：旧写法'}]},{date:'2026-11-11',items:[]}]);
  assert.match(history,/^<div class="notes-tl">/);
  assert.equal((history.match(/class="notes-tl-day/g)||[]).length,2,'a day without a reminder is left out');
  assert.match(history,/<li class="ai-report-markdown is-yes"><span class="ai-decision-status">已采纳<\/span>/);
  assert.match(history,/is-wait/);assert.match(history,/11月13日 · 2 件/);assert.match(history,/11月12日 · 无待拍板/);
});
