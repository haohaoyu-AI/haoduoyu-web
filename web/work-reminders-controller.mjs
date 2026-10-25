import {api} from './core/api.mjs';
import {bjtDate} from './core/format.mjs';
import {state,runtime} from './core/state.mjs';
import {updateRoute} from './core/router.mjs';
import {validTodoDate} from './core/todos-state.mjs';
import {paintWorkReminders} from './pages/work-reminders.mjs';

let reminderSequence = 0, reminderEvents = false;
export async function loadWorkReminders() {
  registerReminderEvents();
  const sequence = ++reminderSequence, session = runtime.sessionEpoch, date = state.reminderDate || bjtDate();
  const current = () => sequence === reminderSequence && session === runtime.sessionEpoch && state.page === 'reminders';
  paintWorkReminders({date,items:[],loading:true});
  try {
    const data = await api('/work-reminders?date=' + encodeURIComponent(date));
    if (current()) paintWorkReminders(data);
  } catch (error) { if (current()) paintWorkReminders({date,items:[]},error.message || '提醒读取失败，请稍后重试'); }
}
function selectReminderDate(value) {
  if (!validTodoDate(value)) return;
  state.reminderDate = value; updateRoute(true); void loadWorkReminders();
}
function registerReminderEvents() {
  if (reminderEvents) return;
  reminderEvents = true;
  document.addEventListener('change', event => {
    if (state.page === 'reminders' && event.target.id === 'reminder-date') selectReminderDate(event.target.value);
  });
  document.addEventListener('click', event => {
    if (state.page === 'reminders' && event.target.closest('[data-reminder-today]')) selectReminderDate(bjtDate());
  });
}
