import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionsFrom,decisionCount,decisionCards} from '../web/pages/ai-decisions.mjs';

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

test('a reminder without the heading is shown whole; with it, the full text stays one tap away',()=>{
  const whole=decisionCards([{summary:'合成：另一种写法'}]);
  assert.match(whole,/合成：另一种写法/);assert.doesNotMatch(whole,/看完整提醒/);
  const cards=decisionCards([{summary:SAMPLE}]);
  assert.match(cards,/<ol class="ai-decision-list"><li class="ai-report-markdown">/);
  assert.match(cards,/<details class="ai-decision-full"><summary>看完整提醒<\/summary>/);
  assert.match(cards.split('<details')[0],/合成：那篇不在表里/);assert.doesNotMatch(cards.split('<details')[0],/点击率/);
});
