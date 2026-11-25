import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {digest,csrfFor} from '../src/security.mjs';
import {handleReviewResources} from '../src/review-resources.mjs';
import {renderArticleRemarks,articleRemarks} from '../web/pages/review-remarks.mjs';

// Synthetic data only.
function setup(t) {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');t.after(()=>sql.close());
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())
    for(const stmt of readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))sql.exec(stmt);
  const db={prepare(text){let values=[];return {bind(...v){values=v;return this},async first(){return sql.prepare(text).get(...values)||null},
    async all(){return {results:sql.prepare(text).all(...values)}},async run(){return {meta:{changes:Number(sql.prepare(text).run(...values).changes)}}}}},
  async batch(statements){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
  const owner=randomUUID(),origin='http://localhost',stamp=new Date().toISOString(),token=randomBytes(32).toString('hex');
  sql.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(owner,'synthetic','hash',stamp);
  sql.prepare('INSERT INTO matrix_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(digest(token),owner,new Date(Date.now()+86400000).toISOString());
  sql.exec('INSERT INTO matrix_control(id,revision,initialized) VALUES(1,1,1)');
  const env={DAILY_NOTES_OWNER_ID:owner};
  const call=async (route,method='GET',body)=>{
    const headers={Origin:origin,'Content-Type':'application/json',Cookie:'matrix_session='+token,'X-CSRF-Token':csrfFor(token)};
    const path=route.split('?')[0];
    const response=await handleReviewResources(db,new Request(origin+'/api/v1'+route,{method,headers,body:body&&JSON.stringify(body)}),path,env,origin,1);
    if(!response.ok)throw new Error(JSON.stringify(await response.json()));
    return (await response.json()).data;
  };
  return {sql,owner,call,stamp};
}

test('an article 备注 is a review note of kind article_note linked to the article',async t=>{
  const {sql,owner,call,stamp}=setup(t),article=randomUUID();
  sql.prepare("INSERT INTO matrix_review_articles(user_id,id,account,platform,title,created_at,updated_at) VALUES(?,?,'V字','toutiao','合成文章',?,?)")
    .run(owner,article,stamp,stamp);
  const id=randomUUID();
  const saved=await call('/review/notes/'+id,'PUT',{account:'V字',note_date:'2026-11-14',kind:'article_note',title:'被举报，平台已删除',
    body_md:'合成：11-14 收到通知。',related_article_ids:[article]});
  assert.equal(saved.kind,'article_note');assert.deepEqual(saved.related_article_ids,[article]);
  const listed=await call('/review/notes?account=V%E5%AD%97');
  assert.equal(listed.items.length,1);
  const html=renderArticleRemarks({id:article},listed.items);
  assert.match(html,/<h3>备注<\/h3>/);assert.match(html,/11月14日/);assert.match(html,/被举报，平台已删除/);assert.match(html,/11-14 收到通知/);
  assert.equal(renderArticleRemarks({id:randomUUID()},listed.items),'','another article shows nothing');
});

test('remarks ignore other kinds and deleted notes, newest first, and escape text',()=>{
  const notes=[{kind:'article_note',note_date:'2026-11-10',title:'旧',related_article_ids:'["a"]'},
    {kind:'article_note',note_date:'2026-11-14',title:'<b>新</b>',related_article_ids:['a']},
    {kind:'insight',note_date:'2026-11-15',title:'洞察',related_article_ids:['a']},
    {kind:'article_note',note_date:'2026-11-16',title:'已删',related_article_ids:['a'],deleted_at:'2026-11-16T00:00:00Z'}];
  assert.deepEqual(articleRemarks(notes,'a').map(note=>note.note_date),['2026-11-14','2026-11-10']);
  const html=renderArticleRemarks({id:'a'},notes);
  assert.match(html,/&lt;b&gt;新&lt;\/b&gt;/);assert.doesNotMatch(html,/<b>新/);
});
