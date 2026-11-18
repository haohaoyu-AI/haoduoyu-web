import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleContentReview} from '../src/content-review.mjs';
import {digest,csrfFor} from '../src/security.mjs';

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

test('a saved draft is written immediately and a later published title updates that same row',async t=>{
  const app=fixture(t);
  assert.equal((await app.call('drafts','POST',{...draftBody(),account:'好多鱼'})).status,400);
  const z=await app.call('drafts','POST',draftBody('Z极客'));
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
  const cross=await app.call('publications','POST',{account:'Z极客',title:'备选丙',published_at:'2026-11-18T09:00:00+08:00',sample_title:'对标原文',sample_url:'https://www.toutiao.com/article/sample'});
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
  const byId=await app.call('articles/'+randomUUID(),'PUT',{account:'V字',title:'现场另选的标题',published_at:'2026-11-18T09:30:00+08:00',platform_article_id:'item-V字'});
  assert.equal(byId.status,200);assert.equal(byId.data.id,saved.data.id);assert.equal(byId.data.publish_status,'published');assert.equal(byId.data.title,'现场另选的标题');
  assert.equal((await app.call('articles?account='+encodeURIComponent('V字'))).data.items.filter(row=>row.platform_article_id==='item-V字').length,1);
});
