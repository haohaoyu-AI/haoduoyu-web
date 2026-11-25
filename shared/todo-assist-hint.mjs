import {TODO_PARSE_HINT} from './todo-parse-hint.mjs';
// Shared by the page and the server, so a sentence without any of these words never calls the model.
/** A 碎碎念 worth reading: it names a time, or says the person means to do something. */
export const NOTE_SUGGEST_HINT = new RegExp(TODO_PARSE_HINT.source + '|' +
  '要去|得去|该去|想去|打算|准备|记得|别忘|计划|回头|改天|抽空|找时间|有空|' +
  '约了|预约|报名|提醒|截止|之前|以前|月底|月初|年底|周末|' +
  // Wondering when or whether to do something is a plan too: "啥时候安排阿姨来打扫".
  '安排|啥时候|什么时候|哪天|要不要|该不该|得把|还得|还没|找个|找人|联系|预订|续费|退订');
/** A sentence in the to-do input that handles an existing to-do instead of adding one. */
export const TODO_COMMAND_HINT = new RegExp('删掉|删了|删除|去掉|取消|不用了|不做了|不去了|不看了|不买了|作废|' +
  '做完了|完成了|搞定了|办完了|办好了|弄完了|看完了|买好了|交了|已经.{0,24}[了完]|退订了|' +
  '改到|挪到|推到|延到|延后|推迟|提前到|移到|换到|放到');
