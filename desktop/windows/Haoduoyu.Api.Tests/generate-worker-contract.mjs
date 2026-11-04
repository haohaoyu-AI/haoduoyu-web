// Run only against the isolated, exact production-source worktree. Never a production database.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceCommit='c30a8a956715b6ea809db4b87c0f4fcddf8f61de';
const [fixtureDirectory,outputPath]=process.argv.slice(2);
if(!fixtureDirectory||!outputPath)throw new Error('Usage: node generate-worker-contract.mjs <isolated-source-worktree> <output.json>');
const root=resolve(fixtureDirectory);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceCommit,'Use the exact isolated source commit');
const {fixture}=await import(pathToFileURL(resolve(root,'tests/harness.mjs')));
const {default:worker}=await import(pathToFileURL(resolve(root,'dist/server/index.js')));
const app=await fixture();
const originalFetch=globalThis.fetch;
let externalFetchAttempts=0;
globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)){
    externalFetchAttempts++;
    throw new Error('External fetch disabled in synthetic Worker contract test');
  }
  return originalFetch(input,options);
};
const samples=[],reconciliations=[];
try {
  const session=await app.login();
  const owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  const env={DB:app.db,SITE_ORIGIN:app.origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'["toutiao-haoduoyu"]'};
  async function call(name,method,path,body,{expected=200}={}) {
    const headers=new Headers({Origin:app.origin,'X-Public-Business':'1'});
    if(path.startsWith('/api/v1/note-'))headers.set('X-Note-Labels-Version','3');
    if(path.split('?')[0]==='/api/v1/note-entries/labels')headers.set('X-Note-Labels-Archive','1');
    if(body!==undefined){headers.set('Content-Type','application/json');headers.set('Idempotency-Key',randomUUID());}
    const request=new Request(app.origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const response=await worker.fetch(request,env);
    const responseJson=await response.text();
    assert.equal(response.status,expected,name+' returned '+responseJson);
    const parsed=JSON.parse(responseJson);
    // Cookie, password, CSRF, bootstrap values and authorization headers are never recorded.
    samples.push({name,method,path,...(body===undefined?{}:{body_json:JSON.stringify(body)}),status:response.status,response_json:responseJson});
    return parsed.data;
  }
  const marker=version=>({version,save_id:randomUUID()});
  const fixedDate=(await call('server-beijing-today','GET','/api/v1/todos')).today;
  const scope=await call('complete-v2-scope-index','GET','/api/v1/workbench-snapshot/index?version=2');
  assert.equal(scope.complete,true);assert.match(scope.scope_id,/^[a-f0-9]{64}$/);
  const todoId=randomUUID(),templateId=randomUUID();
  const todo=await call('todo-create','POST','/api/v1/todos',{id:todoId,date:fixedDate,text:'本次合成待办'},{expected:201});
  const done=await call('todo-complete','PATCH','/api/v1/todos/'+todoId,{completed:true,version:todo.version});
  await call('todo-real-cas-conflict','PATCH','/api/v1/todos/'+todoId,{completed:false,version:todo.version},{expected:409});
  const linked=await call('todo-add-template-nested-response','POST','/api/v1/todos/'+todoId+'/template',{date:fixedDate,version:done.version,template_id:templateId,template_version:0});
  const removedTodo=await call('todo-soft-delete','DELETE','/api/v1/todos/'+todoId,{date:fixedDate,version:linked.todo.version});
  await call('todo-restore','POST','/api/v1/todos/'+todoId+'/restore',{date:fixedDate,version:removedTodo.version});
  const template=await call('template-rename','PATCH','/api/v1/todo-templates/'+templateId,{version:linked.template.version,text:'合成模板改名'});
  await call('template-soft-delete-no-version-response','DELETE','/api/v1/todo-templates/'+templateId,{version:template.version});
  const preference=await call('preference-hide','PATCH','/api/v1/todo-preferences',{completed_mode:'hide',version:0});
  await call('preference-no-op','PATCH','/api/v1/todo-preferences',{completed_mode:'hide',version:preference.version});
  const futureId=randomUUID();
  const future=await call('future-create','POST','/api/v1/unscheduled-todos',{id:futureId,text:'合成未来待办'},{expected:201});
  await call('future-move','POST','/api/v1/unscheduled-todos/'+futureId+'/move',{date:fixedDate,version:future.version});

  const label='本次合成标签',noteId=randomUUID();
  await call('label-create-v3','POST','/api/v1/note-entries/labels',{name:label,save_id:randomUUID()});
  const noteBody={...marker(0),category:'life',date:fixedDate,text:'合成正文\n第二行',labels:['生活',label]};
  const note=await call('note-v3-create-with-labels','PUT','/api/v1/note-entries/'+noteId,noteBody);
  assert.equal(note.labels_version,3);assert.deepEqual(note.labels.slice().sort(),['生活',label].sort());
  const noteReceipt=await call('note-real-save-receipt','GET','/api/v1/note-entries/operations/'+noteBody.save_id);
  const noteEntity=await call('note-receipt-current-entity','GET','/api/v1/note-entries/'+noteId);
  reconciliations.push({name:'note-real-receipt-and-content-hash',method:'PUT',path:'/api/v1/note-entries/'+noteId,body_json:JSON.stringify(noteBody),receipt_json:JSON.stringify({data:noteReceipt}),entity_json:JSON.stringify({data:noteEntity})});
  const updatedNote=await call('note-v3-edit-preserve-labels','PUT','/api/v1/note-entries/'+noteId,{...marker(note.version),category:'life',date:fixedDate,text:'合成正文修改',labels:note.labels});
  await call('note-real-cas-conflict','PUT','/api/v1/note-entries/'+noteId,{...marker(note.version),category:'life',date:fixedDate,text:'过期合成稿'},{expected:409});
  await call('note-v3-read-current-labels','GET','/api/v1/note-entries/'+noteId);
  await call('legacy-work-save','PUT','/api/v1/daily-notes/'+fixedDate+'?category=work',{...marker(0),text:'独立合成工作日页'});
  await call('legacy-life-save','PUT','/api/v1/daily-notes/'+fixedDate+'?category=life',{...marker(0),text:'独立合成生活日页'});
  await call('label-archive','POST','/api/v1/note-entries/labels',{name:label,action:'archive',save_id:randomUUID()});
  await call('label-restore','POST','/api/v1/note-entries/labels',{name:label,action:'restore',save_id:randomUUID()});
  await call('label-delete-removes-associations','POST','/api/v1/note-entries/labels',{name:label,action:'delete',save_id:randomUUID()});
  const afterLabelDelete=await call('note-label-delete-retains-text-and-increments-version','GET','/api/v1/note-entries/'+noteId);
  assert.equal(afterLabelDelete.text,updatedNote.text);assert.ok(afterLabelDelete.version>updatedNote.version);assert.ok(!afterLabelDelete.labels.includes(label));
  const month=await call('note-month-correct-mounted-path','GET','/api/v1/note-entries/month?month='+fixedDate.slice(0,7));
  assert.ok(month.days.some(day=>day.date===fixedDate));

  const groupId=randomUUID(),memoId=randomUUID();
  const group=await call('memo-group-create','PUT','/api/v1/memos/groups/'+groupId,{...marker(0),title:'本次合成分组',position:0});
  const memoBody={...marker(0),title:'合成笔记',body:'合成笔记正文\n第二行',group_id:groupId,position:0};
  const memo=await call('memo-note-create','PUT','/api/v1/memos/notes/'+memoId,memoBody);
  const memoReceipt=await call('memo-real-save-receipt','GET','/api/v1/memos/operations/'+memoBody.save_id);
  const memoEntity=await call('memo-receipt-current-entity','GET','/api/v1/memos/notes/'+memoId);
  reconciliations.push({name:'memo-real-receipt-and-entity-hash',method:'PUT',path:'/api/v1/memos/notes/'+memoId,body_json:JSON.stringify(memoBody),receipt_json:JSON.stringify({data:memoReceipt}),entity_json:JSON.stringify({data:memoEntity})});
  const updatedMemo=await call('memo-note-edit','PUT','/api/v1/memos/notes/'+memoId,{...marker(memo.version),title:'合成笔记改名',body:'合成改稿',group_id:groupId,position:0});
  const deletedMemo=await call('memo-note-soft-delete','DELETE','/api/v1/memos/notes/'+memoId,marker(updatedMemo.version));
  await call('memo-note-restore','POST','/api/v1/memos/notes/'+memoId+'/restore',marker(deletedMemo.version));
  const renamedGroup=await call('memo-group-edit','PUT','/api/v1/memos/groups/'+groupId,{...marker(group.version),title:'合成分组改名',position:0});
  const deletedGroup=await call('memo-group-soft-delete-with-count','DELETE','/api/v1/memos/groups/'+groupId,{...marker(renamedGroup.version),confirm_title:renamedGroup.title,confirm_note_count:1});
  await call('memo-group-restore','POST','/api/v1/memos/groups/'+groupId+'/restore',marker(deletedGroup.version));

  const reminderId=randomUUID(),reminderBody={...marker(0),date:fixedDate,source_key:'desktop-contract:'+reminderId,summary:'合成提醒正文'};
  const reminder=await call('reminder-create','PUT','/api/v1/work-reminders/'+reminderId,reminderBody);
  const unchanged=await call('reminder-same-content-no-op','PUT','/api/v1/work-reminders/'+reminderId,{...reminderBody,...marker(reminder.version)});
  assert.equal(unchanged.version,reminder.version);
  const deletedReminder=await call('reminder-soft-delete','DELETE','/api/v1/work-reminders/'+reminderId,marker(reminder.version));
  await call('reminder-restore','POST','/api/v1/work-reminders/'+reminderId+'/restore',marker(deletedReminder.version));

  const oldArticleBody={account_id:'toutiao-haoduoyu',title:'合成旧图文记录',status:'drafting',url:null,published_at:null,started_at:null,production_mode:'unknown',summary:'合成摘要',notes:'合成备注'};
  const oldArticle=await call('legacy-article-create','POST','/api/v1/articles',oldArticleBody,{expected:201});
  await call('legacy-article-edit','PUT','/api/v1/articles/'+oldArticle.id,{...oldArticleBody,version:oldArticle.version,summary:'修改后的合成摘要'});
  const publishedBody={...oldArticleBody,title:'合成已发布记录',status:'published',url:'https://EXAMPLE.invalid:443/synthetic#removed',
    published_at:'2026-11-04T08:00:00.1234567+08:00',started_at:'2026-11-04T07:00:00.0000000+08:00',summary:'  带空白的合成摘要  ',notes:'  合成备注  ',
    draft_ref:{pgc_id:'synthetic-pgc',provider_unknown:{kept:true}},timings:{finished_at:'2026-11-04T07:30:00.0000000+08:00',synthetic_unknown:'kept'}};
  const published=await call('legacy-published-timestamps-url-and-nested-metadata','POST','/api/v1/articles',publishedBody,{expected:201});
  assert.equal(published.draft_ref.provider_unknown.kept,true);assert.equal(published.timings.synthetic_unknown,'kept');

  const reviewId=randomUUID(),snapshotId=randomUUID();
  const review=await call('review-article-create','PUT','/api/v1/review/articles/'+reviewId,{account:'V字',platform:'toutiao',title:'合成内容复盘文章',url:'https://example.invalid/synthetic#retained',published_at:'2026-11-04T00:00:00.000Z',image_count:0,playbook_version_used:1,applied_rule_ids:['synthetic-rule']},{expected:201});
  const patchedReview=await call('review-article-hash-patch','PATCH','/api/v1/review/articles/'+reviewId,{expected_hash:review.content_hash,title:'合成内容复盘改名'});
  await call('review-article-hash-no-op','PATCH','/api/v1/review/articles/'+reviewId,{expected_hash:patchedReview.content_hash,title:patchedReview.title});
  await call('review-real-hash-cas-conflict','PATCH','/api/v1/review/articles/'+reviewId,{expected_hash:review.content_hash,title:'过期复盘修改'},{expected:409});
  const snapshot=await call('review-snapshot-create-zero-and-null','PUT','/api/v1/review/snapshots/'+snapshotId,{article_id:reviewId,snapshot_date:fixedDate,reads:0,impressions:null,ctr:0,source:'manual',traffic_sources:{synthetic_unknown:{kept:true}}},{expected:201});
  const editedSnapshot=await call('review-snapshot-hash-patch','PATCH','/api/v1/review/snapshots/'+snapshotId,{expected_hash:snapshot.content_hash,reads:12,ctr:2.5});
  await call('review-snapshot-hash-no-op','PATCH','/api/v1/review/snapshots/'+snapshotId,{expected_hash:editedSnapshot.content_hash,reads:editedSnapshot.reads});
  const finalSnapshot=await call('review-snapshot-read-retains-unknown-json','GET','/api/v1/review/snapshots/'+snapshotId);
  assert.deepEqual(finalSnapshot.traffic_sources,{synthetic_unknown:{kept:true}});assert.equal(finalSnapshot.impressions,null);
  assert.equal(externalFetchAttempts,0);
  await mkdir(dirname(resolve(outputPath)),{recursive:true});
  await writeFile(resolve(outputPath),JSON.stringify({source_commit:sourceCommit,synthetic_only:true,
    fixture:'existing tests/harness.mjs temporary Miniflare D1 + compiled Worker.fetch; outboundService denied by harness; global fetch denies external hosts',
    external_fetch_attempts:externalFetchAttempts,generated_at:new Date().toISOString(),samples,reconciliations},null,2)+'\n');
  console.log('Generated '+samples.length+' actual Worker contract samples; synthetic temporary D1; zero external fetch attempts.');
} finally {
  globalThis.fetch=originalFetch;
  await app.mf.dispose();
}
