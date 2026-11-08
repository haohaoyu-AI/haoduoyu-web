import {registerEvents} from '../events.mjs';
import {init} from '../controller.mjs';
import {startOfflineUI} from '../offline/ui.mjs';
import {getLocalRuntime,getOfflineRuntime} from './runtime.mjs';
import {installLocalLifecycle} from './lifecycle.mjs';
import {inputTodo} from '../pages/todos.mjs';
import {todoOwner,validTodoDate} from '../core/todos-state.mjs';
import {inputUnscheduledTodo} from '../pages/unscheduled-todos.mjs';
import {toast} from '../ui/toast.mjs';
import {missingLocalCapabilities} from './capabilities.mjs';
// Deliberately no service worker, remote update or online bootstrap.
const missing = missingLocalCapabilities(window);
if (missing.length) {
  const root = document.querySelector('#app') || document.body;
  root.textContent = '当前浏览器组件版本过旧，暂不能安全打开本机数据。Android 请更新 Android System WebView，Windows 请更新 WebView2 后重试。已有本机数据未清除，请勿卸载应用或清除数据。缺少：'+missing.join('、');
  root.setAttribute('role','alert');
} else {
startOfflineUI();
registerEvents();
window.addEventListener('haoduoyu:android-back', event => {
  // The unchanged website already handles Escape for its overlays.
  const overlay = document.querySelector('#overlay');
  const popover = document.querySelector('.popover');
  if (overlay?.firstElementChild || popover) {
    event.preventDefault();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  }
});
window.addEventListener('haoduoyu:local-draft-error',event => toast(event.detail.message,true));
installLocalLifecycle({window, document, getRuntime:getLocalRuntime,getReadyRuntime:getOfflineRuntime,
  capture(detail) {
    const owner = todoOwner();
    for (const {field,snapshot} of detail.editors()) {
      if (!['todo-text','todo-future-text'].includes(snapshot.id)) continue;
      const kind = snapshot.id === 'todo-text' ? 'todo' : 'future';
      const date = kind === 'todo' ? snapshot.form.dataset.date : '';
      detail.stage({field,key:JSON.stringify([kind,owner,date]),valid:() => todoOwner() === owner && (kind !== 'todo' || validTodoDate(date)),
        apply:raw => { if (kind === 'todo') inputTodo(raw); else inputUnscheduledTodo(raw); }});
    }
  },
  reportError:error => toast(error?.message || '本机保存尚未确认，请保留输入。',true)
});
init();

}
