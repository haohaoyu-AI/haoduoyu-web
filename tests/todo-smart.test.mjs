import test from 'node:test';
import assert from 'node:assert/strict';
import {smartDayLabel,smartTodoText,smartTodoWanted} from '../web/pages/todo-smart.mjs';
import {renderAiSettings,AI_FEATURES_SHOWN} from '../web/pages/review-ai.mjs';

test('the confirm row names the day plainly and keeps counts in the counter format',()=>{
  assert.equal(smartDayLabel('2026-11-14','2026-11-14'),'今天');
  assert.equal(smartDayLabel('2026-11-15','2026-11-14'),'明天');
  assert.equal(smartDayLabel('2026-11-16','2026-11-14'),'后天');
  assert.equal(smartDayLabel('2026-11-20','2026-11-14'),'11月20日 周五');
  assert.equal(smartDayLabel('2027-01-04','2026-11-14'),'2027年1月4日 周一');
  assert.equal(smartTodoText({text:'上厕所',count:4}),'0/4 次 上厕所');
  assert.equal(smartTodoText({text:'取快递',count:null}),'取快递');
  assert.equal(smartTodoWanted('买牛奶'),false);assert.equal(smartTodoWanted('明天买牛奶'),true);
});

test('AI settings list only the features in use, each with one line, and the to-do reader can be switched off',()=>{
  const features=Object.fromEntries(['weekly','titles','benchmarks','diagnosis','body','todo'].map(name=>[name,{model:'',effort:''}]));
  const html=renderAiSettings({status:'ready',data:{configured:true,default_model:'synthetic-model',settings:{daily_limit:30,features},usage:{used:0,limit:30},runs:[]},
    models:['synthetic-large','synthetic-mini']});
  assert.deepEqual(AI_FEATURES_SHOWN.map(([name])=>name),['body','todo','diagnosis']);
  for(const label of ['大小便周小结','一句话加待办','单篇文章分析'])assert.match(html,new RegExp(label));
  for(const label of ['周报','标题归类','爆文拆解'])assert.doesNotMatch(html,new RegExp('<th scope="row">'+label));
  assert.match(html,/默认模型：<b>synthetic-model<\/b>/);
  assert.match(html,/建议选小模型，比如 synthetic-mini/);
  assert.match(html,/<option value="off">关闭（按原文添加）<\/option>/);
  assert.equal((html.match(/value="off"/g)||[]).length,1,'only the to-do reader has an off choice');
});
