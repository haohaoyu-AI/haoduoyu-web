import {apiNetwork} from './core/api.mjs';

const checked=(value,date)=>{
  if(value?.date!==date||typeof value.title!=='string'||!Number.isSafeInteger(value.version)||value.version<0)
    throw new Error('小标题读取结果不完整。');
  return value;
};

async function saveDiaryTitle(session) {
  const day=session.date(),p=session.page(day),who=session.owner(),title=p.draft.trim();
  if(!session.visible()||session.isGuest()||p.denied||!p.loaded||p.loading||p.saving||title===p.base)return;
  p.saving=true;p.status='保存中…';session.paint();
  try {
    if(p.attempt&&p.attempt.title!==title) {
      const last=p.attempt,live=checked(await session.get(day),day);
      if(!session.active(who,day,p))return;
      p.attempt=null;session.adopt(p,live);
      if(live.version!==last.version&&live.title!==last.title) {
        p.status='另一处已更新，输入保留，请核对后再保存';return;
      }
    }
    p.attempt??={title,version:p.version,save_id:session.uuid()};
    const data=checked(await session.request('/diary-titles/'+day,{method:'PUT',body:p.attempt,suppressAuthRedirect:true}),day);
    if(session.active(who,day,p)) {
      p.base=data.title;p.draft=data.title;p.version=data.version;p.attempt=null;p.status='已保存';
    }
  } catch(error) {
    if(!session.active(who,day,p))return;
    if(error.status===409) {
      try {
        const data=checked(await session.get(day),day);
        if(!session.active(who,day,p))return;
        session.adopt(p,data);p.attempt=null;p.status='另一处已更新，输入保留，请核对后再保存';
      } catch {
        p.status='暂时无法核对，输入已保留';
      }
    } else {
      if(error.status>=400&&error.status<500)p.attempt=null;
      p.status=error.status>=400&&error.status<500?(error.message||'没有保存，输入已保留'):'保存结果待核对，输入已保留';
    }
  } finally {if(session.active(who,day,p)){p.saving=false;session.paint();}}
}

// Drafts are scoped to the current login, kept per day, and never written to shared browser storage.
export function createDiaryTitleController({identity,date,visible,isGuest,root,onLogin,uuid=()=>crypto.randomUUID(),request=apiNetwork}) {
  let owner, pages=new Map();
  function page(day) {
    const current=identity();
    if(current!==owner){owner=current;pages=new Map();}
    if(!pages.has(day))pages.set(day,{base:'',draft:'',version:0,loaded:false,loading:false,saving:false,attempt:null,status:'',denied:false});
    return pages.get(day);
  }
  function paint() {
    if(!visible())return;
    const node=root(); if(!node)return;
    const value=page(date()),guest=isGuest(),locked=guest||value.denied;
    const editor=node.querySelector('.diary-title-fields'),login=node.querySelector('[data-diary-title-login]');
    // Not signed in: the whole 小标题 box stays out of sight rather than offering a login button.
    node.hidden=guest;
    editor.hidden=locked;
    login.hidden=true;
    const field=node.querySelector('input'),button=node.querySelector('[type=submit]');
    if(field.value!==value.draft)field.value=value.draft;
    field.disabled=!value.loaded||value.saving||locked;
    button.disabled=field.disabled||value.draft.trim()===value.base;
    const status=node.querySelector('[role=status]');
    const message=guest?'':value.denied?'仅网站所有者可填写':value.status||(!value.loaded&&value.loading?'正在读取…':'');
    if(status.textContent!==message)status.textContent=message;
  }
  const get=day=>request('/diary-titles/'+day,{suppressAuthRedirect:true});
  const active=(who,day,p)=>identity()===who&&owner===who&&pages.get(day)===p;
  function adopt(p,value) {
    const changed=p.draft!==p.base;
    p.base=value.title;p.version=value.version;p.loaded=true;
    if(!changed)p.draft=p.base;
  }
  async function load(day) {
    const p=page(day),who=owner;
    if(isGuest()||p.loading||p.saving){paint();return;}
    p.loading=true;paint();
    try {
      const data=checked(await get(day),day);
      if(active(who,day,p)) {
        // An unresolved PUT must be reconciled before a different save can use a new version.
        if(p.attempt&&data.title===p.attempt.title&&data.version>=p.attempt.version) {
          p.attempt=null;
          p.status='已保存';
        } else if(p.attempt&&data.version!==p.attempt.version) {
          p.attempt=null;
          p.status='另一处已更新，输入保留，请核对后再保存';
        }
        adopt(p,data);p.denied=false;
      }
    } catch(error){
      if(active(who,day,p)) {
        p.denied=[401,403].includes(error.status);
        p.status=p.denied?'':'小标题未读到，可切换日期后重试';
      }
    } finally {if(active(who,day,p)){p.loading=false;paint();}}
  }
  function edit(value) {
    const p=page(date());
    if(!p.loaded||p.saving||isGuest())return;
    p.draft=value;
    if(p.status==='已保存')p.status='';
    paint();
  }
  const session={date,page,owner:()=>owner,visible,isGuest,paint,active,get,adopt,request,uuid};
  async function save() { await saveDiaryTitle(session); }
  return {paint,load,edit,save,login:onLogin};
}
