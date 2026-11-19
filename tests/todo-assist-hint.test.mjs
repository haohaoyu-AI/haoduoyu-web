import test from 'node:test';
import assert from 'node:assert/strict';
import {NOTE_SUGGEST_HINT, TODO_COMMAND_HINT} from '../shared/todo-assist-hint.mjs';

test('only a 碎碎念 with a time or a plan is read by the model', () => {
  for (const text of ['明天记得去银行办卡', '打算周末去爬山', '月底前把报销交了', '别忘了给妈妈打电话', '啥时候安排阿姨来家里打扫卫生啊', '要不要换个手机', '还没交电费']) assert.ok(NOTE_SUGGEST_HINT.test(text), text);
  for (const text of ['今天好累，不想说话', '中午吃了面', '心情不错']) assert.ok(!NOTE_SUGGEST_HINT.test(text), text);
});

test('a sentence that handles an existing to-do is told apart from a new one', () => {
  for (const text of ['删掉每周看电影的计划', 'YouTube 已经退订了', '把农业opc改到下周', '交房租搞定了', '体检推迟到下个月'])
    assert.ok(TODO_COMMAND_HINT.test(text), text);
  for (const text of ['下周看一部电影', '明天交房租', '每周跑步']) assert.ok(!TODO_COMMAND_HINT.test(text), text);
});
