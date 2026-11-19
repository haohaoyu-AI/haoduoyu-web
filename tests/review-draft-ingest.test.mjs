import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor} from '../src/security.mjs';
import {reviewOverviewMetrics} from '../web/core/review-overview-metrics.mjs';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
  for(const {tag} of journal.entries)for(const statement of readFileSync(new URL('../drizzle/'+tag+'.sql',import.meta.url),'utf8').split('--> statement-breakpoint').map(value=>value.trim()).filter(Boolean))sql.exec(statement);
  const db={prepare(text){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(text).get(...values)||null;},async all(){return {results:sql.prepare(text).all(...values)};},async run(){const result=sql.prepare(text).run(...values);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){sql.exec('BEGIN');try{for(const statement of statements)await statement.run();sql.exec('COMMIT');}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const owner=randomUUID(),token=randomBytes(32).toString('hex'),origin='http://localhost';
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'owner','synthetic',new Date().toISOString());
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+60000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,initialized) VALUES(1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner,PUBLIC_BUSINESS_MODE:'1'},headers={Origin:origin,'X-Public-Business':'1'};
  async function call(path,method='GET',data,extra) {
    const h=new Headers({...headers,...extra});if(data!==undefined)h.set('Content-Type','application/json');
    const request=new Request(origin+'/api/v1/review/'+path,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});
    try{const response=await handleContentReview(db,request,new URL(request.url).pathname.slice('/api/v1'.length),env,origin);return {status:response.status,...await response.json()};}
    catch(error){if(!error.status)throw error;return {status:error.status,error:{code:error.code,message:error.message,...(error.existing_id?{existing_id:error.existing_id}:{})}};}
  }
  return {sql,owner,call,auth:{...headers,Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)}};
}
const alternates=['备选甲','备选乙','备选丙','备选丁'];
const draftBody=(account='V字')=>({account,platform_article_id:'item-'+account,title:'草稿标题',alternate_titles:alternates,
  sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',draft_saved_at:'2026-11-18T01:05:00+08:00'});
const crossAccountEvidence={body:[
  '工厂试验台在复验阶段更换陶瓷轴承，三号传感器在下午第一次测得回流口温度恢复到规定范围。',
  '后续检查记录了电机绕组和绝缘层的组装顺序，两位值班技师分别测量了固定夹具的偏心量。',
  '这一轮结果由复核组逐条对照原始台账，确认之前的故障集中在转轴停机后的降温过程。',
].join('\n\n'),source_urls:['https://example.org/source/1','https://example.org/source/2','https://example.org/source/3'],
  people:['合成人物'],events:['陶瓷轴承试验'],numbers:['27.4%','73摄氏度']};

test('a saved draft is written immediately and a later published title updates that same row',async t=>{
  const app=fixture(t);
  assert.equal((await app.call('drafts','POST',{...draftBody(),account:'好多鱼'})).status,400);
  const z=await app.call('drafts','POST',{...draftBody('Z极客'),match_evidence:crossAccountEvidence});
  const v=await app.call('drafts','POST',draftBody('V字'));
  assert.equal(v.status,201);assert.equal(v.data.publish_status,'pending');assert.equal(v.data.account,'V字');
  assert.equal(v.data.draft_saved_at,'2026-11-17T17:05:00.000Z');
  const again=await app.call('drafts','POST',{...draftBody('V字'),title:'改过的草稿标题'});
  assert.equal(again.status,200);assert.equal(again.data.id,v.data.id);assert.equal(again.data.title,'改过的草稿标题');
  assert.equal((await app.call('articles?account='+encodeURIComponent('V字'))).data.items.filter(row=>row.publish_status==='pending').length,1);
  const published=await app.call('publications','POST',{account:'V字',platform_article_id:'item-V字',title:'备选丙',url:'https://www.toutiao.com/article/item-V',
    published_at:'2026-11-18T09:00:00+08:00',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',
    snapshot:{snapshot_date:'2026-11-18',reads:320,ctr:4.5,source:'toutiao_excel',age_hours:2}});
  assert.equal(published.status,200);assert.equal(published.data.matched,true);assert.equal(published.data.id,v.data.id);
  assert.equal(published.data.publish_status,'published');assert.equal(published.data.title,'备选丙');
  assert.equal(published.data.snapshot.reads,320);
  const rows=(await app.call('articles?account='+encodeURIComponent('V字'))).data.items;
  assert.equal(rows.length,1);assert.equal(rows[0].id,v.data.id);
  assert.equal(z.data.account,'Z极客');assert.notEqual(z.data.id,v.data.id);
  const cross=await app.call('publications','POST',{account:'Z极客',title:'备选丙',published_at:'2026-11-18T09:00:00+08:00',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',match_evidence:crossAccountEvidence});
  assert.equal(cross.data.id,z.data.id);assert.equal(cross.data.publish_status,'published');
});

test('an unmatched publication is stored visibly and is not a second counted article',async t=>{
  const app=fixture(t);
  await app.call('drafts','POST',draftBody('V字'));
  const flagged=await app.call('publications','POST',{account:'V字',platform_article_id:'different-item',title:'完全不同的标题',
    published_at:'2026-11-18T10:00:00+08:00',sample_title:'另一篇原文',sample_url:'https://www.toutiao.com/article/other'});
  assert.equal(flagged.status,201);assert.equal(flagged.data.publish_status,'unmatched');assert.equal(flagged.data.matched,false);
  const rows=(await app.call('articles?account='+encodeURIComponent('V字'))).data.items;
  assert.equal(rows.filter(row=>row.publish_status==='pending').length,1);
  assert.equal(rows.filter(row=>row.publish_status==='unmatched').length,1);
  const legacy=await app.call('articles/'+randomUUID(),'PUT',{account:'V字',title:'旧表直接发布',published_at:'2026-11-18T11:00:00+08:00',platform_article_id:'excel-new'});
  assert.equal(legacy.status,201);assert.equal(legacy.data.publish_status,'unmatched');
});

test('title-only published writes do not attach to a draft, and the same platform id does',async t=>{
  const app=fixture(t),draft=await app.call('drafts','POST',{...draftBody('V字'),platform_article_id:null});
  assert.equal(draft.status,400);
  const saved=await app.call('drafts','POST',draftBody('V字'));
  const byTitle=await app.call('articles/'+randomUUID(),'PUT',{account:'V字',title:'备选甲',published_at:'2026-11-18T09:00:00+08:00'});
  assert.equal(byTitle.data.publish_status,'unmatched');assert.notEqual(byTitle.data.id,saved.data.id);
  const publicationPath='articles/'+randomUUID();
  const publication={account:'V字',title:'现场另选的标题',published_at:'2026-11-18T09:30:00+08:00',platform_article_id:'item-V字'};
  const byId=await app.call(publicationPath,'PUT',publication);
  assert.equal(byId.status,200);assert.equal(byId.data.id,saved.data.id);assert.equal(byId.data.publish_status,'published');assert.equal(byId.data.title,'现场另选的标题');
  const replay=await app.call(publicationPath,'PUT',publication);
  assert.equal(replay.status,200);assert.equal(replay.data.id,saved.data.id);
  const conflict=await app.call(publicationPath,'PUT',{...publication,title:'另一篇发布正文'});
  assert.equal(conflict.error.code,'IDEMPOTENCY_CONFLICT');
  assert.equal((await app.call('articles?account='+encodeURIComponent('V字'))).data.items.filter(row=>row.platform_article_id==='item-V字').length,1);
});

test('an identical second publication stays unmatched until it really matches the pending draft',async t=>{
  const app=fixture(t);
  const saved=await app.call('drafts','POST',draftBody('V字'));
  const body={account:'V字',platform_article_id:'published-item',title:'完全不同的标题',published_at:'2026-11-18T10:00:00+08:00',
    sample_title:'另一篇原文',sample_url:'https://www.toutiao.com/article/other',
    snapshot:{snapshot_date:'2026-11-18',reads:9000,ctr:8,source:'toutiao_excel',age_hours:3}};
  const first=await app.call('publications','POST',body);
  assert.equal(first.status,201);assert.equal(first.data.publish_status,'unmatched');assert.equal(first.data.matched,false);
  const second=await app.call('publications','POST',body);
  assert.equal(second.status,200);assert.equal(second.data.id,first.data.id);
  assert.equal(second.data.publish_status,'unmatched');assert.equal(second.data.matched,false);
  const rows=(await app.call('articles?account='+encodeURIComponent('V字'))).data.items;
  assert.equal(rows.filter(row=>row.publish_status==='pending').map(row=>row.id).join(),saved.data.id);
  assert.equal(rows.filter(row=>row.publish_status==='unmatched').length,1);
  assert.equal(rows.filter(row=>row.publish_status==='published').length,0);
  const snapshots=(await app.call('snapshots?account='+encodeURIComponent('V字'))).data.items;
  const stats=reviewOverviewMetrics({articles:rows,snapshots},{account:'V字',range:'30d',now:'2026-11-18T12:00:00Z'});
  assert.equal(stats.count,0);assert.equal(stats.pendingCount,1);assert.equal(stats.unmatchedCount,1);assert.equal(stats.readsMedian,null);
  const linked=await app.call('publications','POST',{account:'V字',platform_article_id:'item-V字',title:'备选甲',
    published_at:'2026-11-18T11:00:00+08:00',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample'});
  assert.equal(linked.status,200);assert.equal(linked.data.matched,true);assert.equal(linked.data.id,saved.data.id);
  assert.equal(linked.data.publish_status,'published');
  const after=(await app.call('articles?account='+encodeURIComponent('V字'))).data.items;
  assert.deepEqual(after.map(row=>row.id).sort(),[saved.data.id,first.data.id].sort());
  assert.equal(after.find(row=>row.id===saved.data.id).publish_status,'published');
  assert.equal(after.find(row=>row.id===first.data.id).publish_status,'unmatched');
});

test('a matched publication can be posted again without a second row',async t=>{
  const app=fixture(t);
  const saved=await app.call('drafts','POST',draftBody('V字'));
  const body={account:'V字',platform_article_id:'item-V字',title:'备选丙',published_at:'2026-11-18T09:00:00+08:00',
    sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample',
    snapshot:{snapshot_date:'2026-11-18',reads:320,ctr:4.5,source:'toutiao_excel',age_hours:2}};
  const first=await app.call('publications','POST',body);
  const second=await app.call('publications','POST',body);
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(first.data.id,saved.data.id);assert.equal(second.data.id,saved.data.id);
  assert.equal(second.data.publish_status,'published');assert.equal(second.data.matched,true);
  const rows=(await app.call('articles?account='+encodeURIComponent('V字'))).data.items;
  assert.equal(rows.length,1);assert.equal(rows[0].publish_status,'published');
});
