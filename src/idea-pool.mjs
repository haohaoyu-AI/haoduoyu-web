// 想法池: every 碎碎念 that carries the 想法池 label, on one page, across all days.
// Ideas stay ordinary 碎碎念; turning one into a 待办 records the link in the audit log
// (action idea.todo, entity = the idea, detail = the to-do), so there is no new table, column
// or migration and backups carry the links as they already carry the audit log.
// 已落地 is worked out when the list is read: every linked to-do that still exists is done.
import {bodyFor,fail} from './security.mjs';
import {authenticateBusiness as authenticate,requireBusinessUser as requireUser,requireBusinessCsrf as requireCsrf} from './business-access.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {dailyNotesOwner} from './daily-notes.mjs';
import {labelsFor,labelsForView} from './note-entries.mjs';
import {handleIdeaTodoText} from './todo-assist.mjs';

export const IDEA_LABEL='想法池';
const LINK='idea.todo';
const MAX_IDEAS=500,MAX_LINKS=20;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields='id,category,date,text,version,created_at,updated_at';
const json=(data,status=200)=>Response.json({data},{status});
const invalid=message=>{throw fail(400,'VALIDATION_ERROR',message);};
const inBatches=async(ids,size,read)=>{const out=[];for(let i=0;i<ids.length;i+=size)out.push(...await read(ids.slice(i,i+size)));return out;};
const marks=list=>list.map(()=>'?').join(',');

export const isIdeaRoute=route=>route==='/ideas'||route.startsWith('/ideas/');

async function ideaRows(store,owner,ids=null) {
  const pattern='%'+JSON.stringify(IDEA_LABEL)+'%';
  const candidates=ids??(await store.all(
    'SELECT entry_id FROM matrix_note_entry_labels WHERE user_id=? AND label=? '+
    'UNION SELECT entry_id FROM matrix_note_entry_label_overrides WHERE user_id=? AND labels_json LIKE ? '+
    'UNION SELECT entry_id FROM matrix_note_entry_label_sets WHERE user_id=? AND labels_json LIKE ?',
    owner,IDEA_LABEL,owner,pattern,owner,pattern)).map(row=>row.entry_id);
  const rows=await inBatches([...new Set(candidates)],80,batch=>store.all(
    'SELECT '+fields+' FROM matrix_note_entries WHERE user_id=? AND deleted_at IS NULL AND id IN ('+marks(batch)+')',owner,...batch));
  const labels=await labelsFor(store,owner,rows,3);
  return rows.map(row=>({...row,labels:labelsForView(row,labels,3)})).filter(row=>row.labels.includes(IDEA_LABEL));
}

async function linksFor(store,ideaIds) {
  const rows=await inBatches(ideaIds,80,batch=>store.all(
    'SELECT entity_id,detail_json,created_at FROM audit WHERE action=? AND entity_id IN ('+marks(batch)+') ORDER BY created_at',LINK,...batch));
  const links=new Map();
  for(const row of rows) {
    let detail;try{detail=JSON.parse(row.detail_json);}catch{continue;}
    if(!uuid.test(detail?.todo_id||''))continue;
    const list=links.get(row.entity_id)??[];
    if(!list.some(link=>link.todo_id===detail.todo_id))list.push({todo_id:detail.todo_id,linked_at:row.created_at});
    links.set(row.entity_id,list);
  }
  return links;
}

async function todosFor(store,user,ids) {
  const found=new Map();
  for(const row of await inBatches(ids,80,batch=>store.all('SELECT id,date,text,completed,deleted_at,updated_at FROM matrix_todos WHERE user_id=? AND id IN ('+marks(batch)+')',user,...batch)))
    found.set(row.id,{id:row.id,kind:'dated',date:row.date,text:row.text,completed:row.completed===1||row.completed===true,deleted:row.deleted_at!==null,updated_at:row.updated_at});
  for(const row of await inBatches(ids.filter(id=>!found.has(id)),80,batch=>store.all('SELECT id,text,completed,deleted_at,updated_at FROM matrix_unscheduled_todos WHERE user_id=? AND id IN ('+marks(batch)+')',user,...batch)))
    found.set(row.id,{id:row.id,kind:'future',date:null,text:row.text,completed:row.completed===1||row.completed===true,deleted:row.deleted_at!==null,updated_at:row.updated_at});
  return found;
}

// 状态 shown on the page: 已落地 once every linked to-do that still exists is done; 已转待办 while
// one is open; otherwise whatever the idea's own 「状态：」 line says (kept as written).
// An idea with no linked to-dos also counts as 已落地 when its own 「状态：」 line says so (starts with ✅ or
// contains 已落地); then the time is when the idea was last edited.
export function ideaStatus(text,todos,editedAt=null) {
  const live=todos.filter(todo=>!todo.deleted);
  if(live.length&&live.every(todo=>todo.completed))
    return {status:'landed',label:'已落地',landed_at:live.map(todo=>todo.updated_at).filter(Boolean).sort().at(-1)??null};
  if(live.length)return {status:'todo',label:'已转待办',landed_at:null};
  const line=/^\s*状态[：:]\s*(.+?)\s*$/m.exec(text)?.[1]??'';
  if(/^✅|已落地/.test(line))return {status:'landed',label:'已落地',landed_at:editedAt};
  return {status:'idea',label:line||'想法',landed_at:null};
}
export function ideaPriority(text) {
  const line=/^\s*优先级[：:]\s*(.+?)\s*$/m.exec(text)?.[1]??'';
  const stars=[...line].filter(char=>char==='⭐').length;
  return {priority:stars||null,priority_label:line||null};
}

async function listIdeas(store,owner,user) {
  const rows=(await ideaRows(store,owner)).sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));
  const truncated=rows.length>MAX_IDEAS,ideas=rows.slice(0,MAX_IDEAS);
  const links=await linksFor(store,ideas.map(row=>row.id));
  const todos=await todosFor(store,user,[...new Set([...links.values()].flat().map(link=>link.todo_id))]);
  const items=ideas.map(row=>{
    const linked=(links.get(row.id)??[]).map(link=>todos.get(link.todo_id)).filter(Boolean);
    return {...row,...ideaStatus(row.text,linked,row.updated_at),...ideaPriority(row.text),todos:linked};
  });
  return {items,total:rows.length,truncated};
}

async function linkTodo(db,request,owner,actor,ideaId) {
  const input=await bodyFor(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='todo_id')||!uuid.test(input.todo_id||''))
    invalid('请提供 todo_id');
  return mutate(db,async store=>{
    const [idea]=await ideaRows(store,owner,[ideaId]);
    if(!idea)throw fail(404,'NOT_FOUND','这条想法不存在，或已不在想法池里');
    const todo=(await todosFor(store,actor.id,[input.todo_id])).get(input.todo_id);
    if(!todo||todo.deleted)throw fail(404,'NOT_FOUND','待办不存在');
    const links=(await linksFor(store,[ideaId])).get(ideaId)??[];
    const view=async()=>{
      const all=await todosFor(store,actor.id,[...new Set([...links.map(link=>link.todo_id),input.todo_id])]);
      const linked=[...all.values()];
      return {...idea,...ideaStatus(idea.text,linked,idea.updated_at),...ideaPriority(idea.text),todos:linked};
    };
    if(links.some(link=>link.todo_id===input.todo_id))return {replayed:true,response:json(await view())};
    if(links.length>=MAX_LINKS)throw fail(409,'IDEA_LINK_LIMIT','一条想法最多关联 20 条待办');
    store.audit(actor.actor,LINK,ideaId,{todo_id:input.todo_id,kind:todo.kind});
    return {actor,response:json(await view(),201)};
  }).then(result=>result.response);
}

export async function handleIdeas(db,request,route,env,origin) {
  const method=request.method,owner=dailyNotesOwner(env);
  if(route==='/ideas/todo-text')return handleIdeaTodoText(db,request,env,origin);
  const link=/^\/ideas\/([^/]+)\/todos$/.exec(route);
  if(route==='/ideas'&&method==='GET') {
    if(new URL(request.url).search)invalid('不接受查询参数');
    return consistentRead(db,async store=>{
      const actor=await authenticate(store,request,'read');requireUser(actor);
      return json(await listIdeas(store,owner,actor.id));
    });
  }
  if(link&&method==='POST') {
    if(!uuid.test(link[1]))throw fail(404,'NOT_FOUND','这条想法不存在');
    const actor=await authenticate(storeFor(db),request,'write');requireUser(actor);requireCsrf(request,actor,origin);
    return linkTodo(db,request,owner,actor,link[1]);
  }
  throw fail(404,'NOT_FOUND','接口不存在');
}
