import {bodyFor,stable,fail} from './security.mjs';
import {storeFor,consistentRead,mutate} from './storage.mjs';
import {reviewUuid,reviewHash,reviewScope,reviewContentHash,reviewSpecs} from './content-review-validation.mjs';

const fields=['prompt_key','scope','version','status','title','content_md','changelog_md'];
const statuses=['draft','active','archived'];
const bad=message=>{throw fail(400,'VALIDATION_ERROR',message);};
const json=(data,status=200)=>Response.json({data},{status});
function text(value,max,empty=false) {
  if(typeof value!=='string'||!value.isWellFormed()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)||Buffer.byteLength(value,'utf8')>max||!empty&&!value.trim())bad('Invalid prompt text');
  return value.replace(/\r\n?/g,'\n');
}
function input(value,patch=false) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key))||patch&&!Object.keys(value).length)bad('Invalid prompt fields');
  if(!patch&&['prompt_key','scope','version','title','content_md'].some(key=>!Object.hasOwn(value,key)))bad('Missing prompt fields');
  const row=patch?{}:{status:'draft',changelog_md:''};
  for(const [key,item] of Object.entries(value)) {
    if(key==='prompt_key') {if(typeof item!=='string'||!/^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(item)||item.length>64)bad('prompt_key must be a short lowercase slug');row[key]=item;}
    else if(key==='scope')row[key]=reviewScope(item);
    else if(key==='version'){if(!Number.isSafeInteger(item)||item<1)bad('version must be a positive safe integer');row[key]=item;}
    else if(key==='status'){if(!statuses.includes(item))bad('Invalid prompt status');row[key]=item;}
    else row[key]=text(item,key==='title'?500:131072,key==='changelog_md');
  }
  return row;
}
export function promptView(row) {
  if(!row)return null;
  const data=Object.fromEntries(['id',...fields,'created_at','updated_at'].map(key=>[key,row[key]]));
  return {...data,content_hash:reviewContentHash(data)};
}
const equal=(a,b)=>JSON.stringify(stable(Object.fromEntries(fields.map(key=>[key,a[key]]))))===JSON.stringify(stable(b));
const read=(store,owner,id)=>store.get('SELECT * FROM matrix_review_prompt_versions WHERE user_id=? AND id=?',owner,id).then(promptView);
export const isReviewPromptRoute=route=>route==='/review/prompts'||route.startsWith('/review/prompts/');
export function promptScopesForAccount(account) {
  account=reviewSpecs.articles.fields.account(account);
  const accounts={'global':'global','整体':'global','头条':'toutiao','V字':'vzi','鱼见':'yujian','公众号':'wechat',vzi:'vzi',yujian:'yujian',wechat:'wechat',toutiao:'toutiao'};
  const mapped=Object.hasOwn(accounts,account)?accounts[account]:'global';
  if(mapped==='global')return ['global'];
  return mapped==='wechat'?['wechat']:['global','toutiao',...(mapped==='toutiao'?[]:[mapped])];
}
export async function handleReviewPrompts(db,request,route,env,origin,initialRevision,{owner,actorFor,writeLimit}) {
  const method=request.method,url=new URL(request.url),currentRoute=route==='/review/prompts/current';
  const match=/^\/review\/prompts\/([a-f0-9-]+)$/.exec(route),id=!currentRoute?match?.[1]:null;
  if(!(route==='/review/prompts'||currentRoute||id&&reviewUuid.test(id))||!['GET',...(id?['PUT','PATCH']:[])].includes(method))throw fail(404,'NOT_FOUND','Prompt endpoint not found');
  const query=url.searchParams,allowed=method==='GET'&&!id?['scope','prompt_key','account','offset','read_revision',...(!currentRoute?['status']:[])]:[];
  if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))bad('Invalid prompt query');
  const where=[],args=[];
  for(const key of ['scope','prompt_key','status'])if(query.has(key)){const checked=input({[key]:query.get(key)},true);where.push(key+'=?');args.push(checked[key]);}
  if(query.has('account')){const scopes=promptScopesForAccount(query.get('account'));where.push('scope IN ('+scopes.map(()=>'?').join(',')+')');args.push(...scopes);}
  for(const key of ['offset','read_revision'])if(query.has(key)&&(!/^(0|[1-9]\d*)$/.test(query.get(key))||!Number.isSafeInteger(Number(query.get(key)))))bad('Invalid pagination');
  if(currentRoute)where.push("status='active'");
  if(method==='GET')return consistentRead(db,async(store,revision)=>{
    await actorFor(store,request,owner,env,origin);
    if(query.has('read_revision')&&Number(query.get('read_revision'))!==revision)throw fail(409,'READ_REVISION_CHANGED','Read again from the first page');
    if(id){const row=await read(store,owner,id);if(!row)throw fail(404,'NOT_FOUND','Prompt not found');return json(row);}
    const rows=await store.all('SELECT * FROM matrix_review_prompt_versions WHERE user_id=?'+where.map(sql=>' AND '+sql).join('')+' ORDER BY scope,prompt_key,version DESC,id LIMIT 101 OFFSET ?',owner,...args,Number(query.get('offset')||0));
    return json({items:rows.slice(0,100).map(promptView),has_more:rows.length>100,read_revision:revision});
  },initialRevision);
  const actor=await actorFor(storeFor(db),request,owner,env,origin,true);writeLimit(actor,owner);
  const body=await bodyFor(request),{expected_hash,...changes}=body;
  if(method==='PUT'&&Object.hasOwn(body,'expected_hash'))bad('PUT does not accept expected_hash');
  if(method==='PATCH'&&(typeof expected_hash!=='string'||!reviewHash.test(expected_hash)))bad('PATCH requires expected_hash');
  const values=input(method==='PUT'?body:changes,method==='PATCH');
  return (await mutate(db,async store=>{
    const actor=await actorFor(store,request,owner,env,origin,true),previous=await read(store,owner,id);
    if(method==='PUT'&&previous){if(!equal(previous,values))throw fail(409,'IDEMPOTENCY_CONFLICT','UUID already identifies different content');return {replayed:true,response:json(previous)};}
    if(method==='PATCH'&&!previous)throw fail(404,'NOT_FOUND','Prompt not found');
    if(method==='PATCH'&&previous.content_hash!==expected_hash)throw fail(409,'VERSION_CONFLICT','Prompt changed; read it again');
    const next=method==='PATCH'?{...Object.fromEntries(fields.map(key=>[key,previous[key]])),...values}:values;
    if(previous) {
      if(['prompt_key','scope','version'].some(key=>next[key]!==previous[key]))throw fail(409,'PROMPT_IDENTITY_IMMUTABLE','Create a new UUID/version');
      if(equal(previous,next))return {replayed:true,response:json(previous)};
      if(previous.status!=='draft'&&['title','content_md','changelog_md'].some(key=>next[key]!==previous[key]))throw fail(409,'PROMPT_CONTENT_IMMUTABLE','Published version content is immutable; create a new version');
      if(previous.status==='archived'||previous.status==='active'&&next.status!=='archived')throw fail(409,'PROMPT_STATUS_CONFLICT','Only draft activation or archival and active archival are allowed');
    }
    const duplicate=await store.get('SELECT id FROM matrix_review_prompt_versions WHERE user_id=? AND prompt_key=? AND scope=? AND version=? AND id<>?',owner,next.prompt_key,next.scope,next.version,id);
    if(duplicate)throw fail(409,'REVIEW_UNIQUE_CONFLICT','This prompt version already exists');
    if(!previous&&await store.get('SELECT id FROM matrix_review_prompt_versions WHERE user_id=? AND prompt_key=? AND scope=? AND version>=?',owner,next.prompt_key,next.scope,next.version))throw fail(409,'PROMPT_VERSION_ORDER','New versions must exceed all existing versions in this scope');
    const time=new Date().toISOString();
    if(next.status==='active') {
      const newer=await store.get("SELECT id FROM matrix_review_prompt_versions WHERE user_id=? AND prompt_key=? AND scope=? AND status IN ('active','archived') AND version>=? AND id<>?",owner,next.prompt_key,next.scope,next.version,id);
      if(newer)throw fail(409,'PROMPT_VERSION_ORDER','Activation requires a newer version than prior active/archived versions');
      const active=await store.get("SELECT id FROM matrix_review_prompt_versions WHERE user_id=? AND prompt_key=? AND scope=? AND status='active' AND id<>?",owner,next.prompt_key,next.scope,id);
      if(active){store.queue("UPDATE matrix_review_prompt_versions SET status='archived',updated_at=? WHERE user_id=? AND id=?",time,owner,active.id);store.expectChange();store.audit(actor.actor,'review.prompts.archive',active.id,{replacement_id:id});}
    }
    const row={id,...next,created_at:previous?.created_at||time,updated_at:time};
    if(previous){store.queue('UPDATE matrix_review_prompt_versions SET status=?,title=?,content_md=?,changelog_md=?,updated_at=? WHERE user_id=? AND id=?',row.status,row.title,row.content_md,row.changelog_md,time,owner,id);store.expectChange();}
    else store.queue('INSERT INTO matrix_review_prompt_versions(user_id,id,prompt_key,scope,version,status,title,content_md,changelog_md,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',owner,id,...fields.map(key=>row[key]),time,time);
    store.audit(actor.actor,'review.prompts.'+(previous?'update':'create'),id,{prompt_key:row.prompt_key,scope:row.scope,version:row.version,status:row.status});
    return {actor,response:json(promptView(row),previous?200:201)};
  })).response;
}
