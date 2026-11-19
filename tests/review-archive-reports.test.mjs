import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {archiveFixture} from './review-archive-fixture.mjs';

const base='review/archive/reports';
const t0='2026-11-01T02:00:00.000Z';
const notFound=response=>assert.equal(response.status,404,JSON.stringify(response));

async function review(app,{account='V字',owner=app.owner,start='2026-11-01',summary='原复盘内容。'}={}) {
  const id=randomUUID();
  await app.db.prepare(`INSERT INTO matrix_review_reports
    (user_id,id,account,period_type,period_start,period_end,findings_json,summary_md,created_at)
    VALUES(?,?,?,'daily',?,?,'{"overturned":[],"verified":[]}',?,?)`).bind(owner,id,account,start,start,summary,t0).run();
  return id;
}

async function ai(app,{owner=app.owner,author='合成作者',content='原 AI 汇报。'}={}) {
  const id=randomUUID();
  await app.db.prepare('INSERT INTO matrix_ai_reports(user_id,id,author,content,created_at) VALUES(?,?,?,?,?)').bind(owner,id,author,content,t0).run();
  return id;
}

async function anotherOwner(app) {
  const owner=randomUUID();
  await app.db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(owner,'foreign-report-owner','fixture',t0).run();
  return owner;
}

const patch=(app,path,body)=>app.request(path,{method:'PATCH',body});

test('V-only review corrections preserve the original id and immutable full versions in a private overlay',async t=>{
  const app=await archiveFixture(t);
  const target=await review(app), foreignAccount=await review(app,{account:'Z极客'});
  const foreign=await review(app,{owner:await anotherOwner(app)});
  const path=base+'/review/'+target;
  assert.equal((await app.request(base+'?type=review',{auth:false})).status,401);
  notFound(await app.request(base+'/review/'+foreignAccount));
  notFound(await app.request(base+'/review/'+foreign));
  const list=await app.request(base+'?type=review');
  assert.equal(list.status,200,JSON.stringify(list));
  assert.deepEqual(list.data.items.map(row=>row.id),[target]);
  assert.equal('summary_md' in list.data.items[0],false);
  const before=(await app.request(path)).data;
  assert.equal(before.summary_md,'原复盘内容。');
  assert.equal(before.version,1);
  assert.equal(before.account,'V字');
  const first={expected_hash:before.content_hash,changes:{summary_md:'修正后，仍是同一份日报。'}};
  const updated=await patch(app,path,first);
  assert.equal(updated.status,200,JSON.stringify(updated));
  assert.equal(updated.data.id,target);
  assert.equal(updated.data.version,2);
  assert.deepEqual(updated.data.history.map(({version,report})=>[version,report.summary_md]),
    [[2,first.changes.summary_md],[1,before.summary_md]]);
  const revision=await app.revision();
  assert.equal((await patch(app,path,first)).data.version,2);
  assert.equal(await app.revision(),revision);
  const stale=await patch(app,path,{...first,changes:{summary_md:'并发方的不同修改。'}});
  assert.equal(stale.status,409);
  assert.equal((await patch(app,path,{expected_hash:updated.data.content_hash,changes:{account:'Z极客'}})).status,400);
  assert.equal((await app.request(path)).data.summary_md,first.changes.summary_md);
  assert.equal((await app.db.prepare('SELECT summary_md FROM matrix_review_reports WHERE user_id=? AND id=?').bind(app.owner,target).first()).summary_md,before.summary_md);
  assert.equal((await app.request('review/reports/'+target,{auth:false})).data.summary_md,before.summary_md);
  assert.equal((await app.request(base+'?type=review&read_revision='+list.data.read_revision)).status,409);
});

test('AI reports need explicit owner confirmation on an existing exact id, and corrections never replace legacy text',async t=>{
  const app=await archiveFixture(t);
  const target=await ai(app), other=await ai(app,{content:'尚未选择这份。'}), foreign=await ai(app,{owner:await anotherOwner(app)});
  const path=base+'/ai/'+target;
  assert.deepEqual((await app.request(base+'?type=ai')).data.items,[]);
  notFound(await app.request(path));
  notFound(await app.request(base+'/ai/'+foreign+'?confirm_v_account=1'));
  const revision=await app.revision();
  const preview=await app.request(path+'?confirm_v_account=1');
  assert.equal(preview.status,200,JSON.stringify(preview));
  assert.equal(preview.data.account,null);
  assert.equal(preview.data.requires_v_account_confirmation,true);
  assert.equal(await app.revision(),revision);
  notFound(await patch(app,path,{expected_hash:preview.data.content_hash,changes:{content:'须确认后才能保存。'}}));
  const bind={expected_hash:preview.data.content_hash,changes:{},confirm_v_account:true};
  const confirmed=await patch(app,path,bind);
  assert.equal(confirmed.status,200,JSON.stringify(confirmed));
  assert.equal(confirmed.data.account,'V字');
  assert.equal(confirmed.data.requires_v_account_confirmation,false);
  assert.deepEqual(confirmed.data.history.map(entry=>entry.action),['confirmed_v_account']);
  assert.notEqual(confirmed.data.content_hash,preview.data.content_hash);
  const afterBinding=await app.revision();
  assert.equal((await patch(app,path,bind)).data.version,1);
  assert.equal(await app.revision(),afterBinding);
  const changed=await patch(app,path,{expected_hash:confirmed.data.content_hash,changes:{author:'更正署名',content:'修正后的私有内容。'}});
  assert.equal(changed.status,200,JSON.stringify(changed));
  assert.equal(changed.data.id,target);
  assert.equal(changed.data.version,2);
  assert.equal(changed.data.history[1].report.content,preview.data.content);
  assert.deepEqual((await app.request(base+'?type=ai')).data.items.map(row=>row.id),[target]);
  notFound(await app.request(base+'/ai/'+other));
  const publicRead=await app.request('ai-reports',{auth:false});
  assert.equal(publicRead.data.items.find(row=>row.id===target).content,preview.data.content);
  assert.equal((await app.request(path+'?confirm_v_account=1',{auth:false})).status,401);
});

test('report date edits validate effective periods and paginate version history without losing versions',async t=>{
  const app=await archiveFixture(t);
  const target=await review(app), other=await review(app,{start:'2026-11-02'});
  const path=base+'/review/'+target;
  let current=(await app.request(path)).data;
  const duplicated=await patch(app,path,{expected_hash:current.content_hash,changes:{period_start:'2026-11-02',period_end:'2026-11-02'}});
  assert.equal(duplicated.status,409);
  const invalid=await patch(app,path,{expected_hash:current.content_hash,changes:{period_start:'2026-11-05'}});
  assert.equal(invalid.status,400);
  for(let version=2;version<=12;version++) {
    const changed=await patch(app,path,{expected_hash:current.content_hash,changes:{summary_md:`第 ${version} 份记录。`}});
    assert.equal(changed.status,200,JSON.stringify(changed));
    assert.equal(changed.data.version,version);
    current=changed.data;
  }
  const page=(await app.request(path)).data;
  assert.equal(page.history_has_more,true);
  assert.equal(page.history.length,10);
  const past=(await app.request(path+`?history_offset=${page.next_history_offset}&read_revision=${page.read_revision}`)).data;
  assert.deepEqual(past.history.map(entry=>entry.version),[2,1]);
  assert.equal(past.history_has_more,false);
  assert.equal(past.history[1].report.summary_md,'原复盘内容。');
  const out=await patch(app,path,{expected_hash:current.content_hash,changes:{period_start:'2026-11-03',period_end:'2026-11-03'}});
  assert.equal(out.status,200,JSON.stringify(out));
  assert.deepEqual((await app.request(base+'?type=review')).data.items.map(row=>row.id),[target,other]);
});
