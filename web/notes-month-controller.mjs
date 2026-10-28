import {dailyNotesToday} from './core/daily-notes-state.mjs';
import {validNoteMonth,shiftNoteMonth,noteMonthWeeks,checkedNoteMonth} from './core/notes-month.mjs';

export function renderNotesMonthMarkup() {
  return '<details id="notes-month-panel" class="notes-month-panel"><summary>月历与历史</summary>'+
    '<div class="notes-month-controls"><button class="btn" type="button" data-notes-month-step="-1" aria-label="上个月">‹</button>'+
    '<label>月份 <input id="notes-month-input" class="input" type="month"></label>'+
    '<button class="btn" type="button" data-notes-month-step="1" aria-label="下个月">›</button>'+
    '<label>分类 <select id="notes-month-category" class="input"><option value="">全部</option>'+
    '<option value="life">生活</option><option value="work">工作</option></select></label>'+
    '<button class="btn text" type="button" data-notes-month-refresh>刷新</button></div>'+
    '<p id="notes-month-status" role="status" aria-live="polite"></p>'+
    '<div class="notes-month-weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span>'+
    '<span>四</span><span>五</span><span>六</span><span>日</span></div>'+
    '<div id="notes-month-grid" class="notes-month-grid"></div><h3 id="notes-month-day-title"></h3>'+
    '<div id="notes-month-history" class="notes-entry-list"></div></details>';
}
export function mountNotesMonth(root,{request,selectDate,identity}) {
  const panel=root.querySelector('#notes-month-panel');
  if(!panel)return ()=>{};
  const find=selector=>panel.querySelector(selector),doc=root.ownerDocument;
  const identityNow=typeof identity==='function'?identity:()=>identity,expected=identityNow();
  let disposed=false,sequence=0,days=new Map(),loaded='',selected=dailyNotesToday(),month=selected.slice(0,7),category='';
  const active=()=>!disposed&&root.isConnected&&identityNow()===expected;
  const visibleRows=date=>(days.get(date)||[]).filter(item=>!category||item.category===category);
  find('#notes-month-input').value=month;
  function node(tag,text,className='') {
    const result=doc.createElement(tag);result.textContent=text;if(className)result.className=className;return result;
  }
  function paintHistory() {
    const rows=visibleRows(selected),list=find('#notes-month-history');list.replaceChildren();
    find('#notes-month-day-title').textContent=selected+' · '+rows.length+' 条记录';
    for(const item of rows) {
      const card=node('article','','note-entry note-entry-saved'),head=node('div','','note-entry-head');
      head.append(node('span',item.displayLabel+(item.source==='legacy_daily_note'?' · 原有记录':'')));
      const time=node('time',new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.updated_at)));
      time.dateTime=item.updated_at;head.append(time);card.append(head,node('div',item.text||'这条记录没有文字。','note-entry-reader'));
      const open=node('button','查看当天','btn text');open.type='button';
      open.addEventListener('click',()=>{if(active())void selectDate(selected,item.category);});card.append(open);list.append(card);
    }
    if(!rows.length)list.append(node('p','这一天没有符合分类的已同步记录。','notes-empty'));
  }
  function paint() {
    const grid=find('#notes-month-grid');grid.replaceChildren();
    for(const date of noteMonthWeeks(month).flat()) {
      if(!date){grid.append(node('span',''));continue;}
      const count=visibleRows(date).length,button=node('button',String(Number(date.slice(-2)))+(count?' · '+count:''),'btn');
      button.type='button';button.dataset.notesMonthDate=date;button.setAttribute('aria-label',date+'，'+count+' 条记录');
      button.setAttribute('aria-pressed',String(date===selected));button.classList.toggle('has-records',count>0);grid.append(button);
    }
    paintHistory();
  }
  async function load(force=false) {
    if(!active()||!panel.open||!validNoteMonth(month)||!force&&loaded===month)return;
    const current=++sequence,target=month;loaded='';days=new Map();
    find('#notes-month-grid').replaceChildren();find('#notes-month-history').replaceChildren();
    find('#notes-month-day-title').textContent='';
    find('#notes-month-status').textContent='正在读取月记录…';
    try {
      const data=await request('/note-entries/month?month='+target);
      if(!active()||current!==sequence||target!==month)return;
      days=checkedNoteMonth(data,target);loaded=target;
      if(!selected.startsWith(target+'-'))selected=[...days.keys()][0]||target+'-01';
      find('#notes-month-status').textContent='仅展示已同步记录；待同步草稿请在原日期查看。';paint();
    } catch(error) {
      if(!active()||current!==sequence)return;
      find('#notes-month-status').textContent=error.message||'月记录读取失败，请重试。';
    }
  }
  function toggle(){if(panel.open)void load();}
  function change(event) {
    if(!active())return;
    if(event.target.id==='notes-month-input') {
      if(!validNoteMonth(event.target.value)){find('#notes-month-status').textContent='请选择有效月份。';return;}
      month=event.target.value;void load();
    } else if(event.target.id==='notes-month-category'){category=event.target.value;if(loaded===month)paint();}
  }
  function click(event) {
    if(!active())return;
    const target=event.target.closest('[data-notes-month-step],[data-notes-month-date],[data-notes-month-refresh]');
    if(!target||!panel.contains(target))return;event.preventDefault();
    if(target.dataset.notesMonthStep) {
      try {month=shiftNoteMonth(month,Number(target.dataset.notesMonthStep));find('#notes-month-input').value=month;void load();}
      catch(error){find('#notes-month-status').textContent=error.message;}
    } else if(target.dataset.notesMonthDate){selected=target.dataset.notesMonthDate;paint();}
    else void load(true);
  }
  panel.addEventListener('toggle',toggle);panel.addEventListener('change',change);panel.addEventListener('click',click);
  return ()=>{disposed=true;sequence++;panel.removeEventListener('toggle',toggle);
    panel.removeEventListener('change',change);panel.removeEventListener('click',click);};
}
