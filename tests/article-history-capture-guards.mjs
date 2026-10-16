import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {seedSettledUploadReceipts,syntheticReadbacks} from './helpers/isolated-upload-receipts.mjs';
const sql=new DatabaseSync(':memory:'),migrations=fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
for(const f of migrations.filter(f=>!f.startsWith('0050_')))sql.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const sha='a'.repeat(64),size=100,title='OFFLINE actual same Word title';
function seed({created=new Date(Date.now()-1000).toISOString(),mutate=()=>{},omitEnd=[],paragraphs=[title]}={}){
 const id=randomUUID(),owner='OFFLINE:'+id,readbacks=syntheticReadbacks({sha,title}),row={sha,size,verification:{word_sha256:sha}},a={url:readbacks.toutiao.draft_url},d={url:readbacks.zhihu.draft_url};
 mutate({readbacks,row,a,d});
 sql.prepare('INSERT INTO articles(id,owner,title,filename,source_key,paragraphs,created,state) VALUES(?,?,?,?,?,?,?,?)').run(id,owner,title,'fixture.docx','OFFLINE/source',JSON.stringify(paragraphs),created,'uploaded');
 sql.prepare("INSERT INTO article_deliveries(id,owner,article_id,platform,state,draft_url,updated,readback) VALUES(?,?,?,'zhihu','saved',?,?,?)").run(randomUUID(),owner,id,d.url,new Date().toISOString(),JSON.stringify(readbacks.zhihu));
 const ends=seedSettledUploadReceipts(sql,{owner,articleId:id,sha,size,title,readbacks,omitEnd});
 sql.prepare("UPDATE articles SET state='completed',result_key='OFFLINE/result',result_meta=?,draft_url=?,draft_readback=? WHERE id=?").run(JSON.stringify({sha256:row.sha,size:row.size,verification:row.verification}),a.url,JSON.stringify(readbacks.toutiao),id);
 return {id,owner,readbacks,ends};
}
// Existing upload before cutoff, genuinely completed later: backfill must use completion.
const beforeStart=seed({created:'2026-10-11T12:00:00.000Z'});
const blankPrefixBackfill=seed({paragraphs:['','  ',title,'BODY']});
const badBackfill=seed({mutate:({readbacks})=>{readbacks.toutiao.word_sha256='c'.repeat(64);readbacks.zhihu.word_sha256='c'.repeat(64);readbacks.toutiao.title=readbacks.zhihu.title='OTHER DOCUMENT';}});
sql.exec(fs.readFileSync('drizzle/0050_colossal_catseye.sql','utf8'));
const count=id=>sql.prepare('SELECT count(*) AS n FROM article_history WHERE article_id=?').get(id).n;
assert.equal(count(beforeStart.id),0);assert.equal(count(badBackfill.id),0);
assert.equal(sql.prepare('SELECT count(*) n FROM article_history_backfill_candidates WHERE article_id=?').get(beforeStart.id).n,1);assert.equal(sql.prepare('SELECT count(*) n FROM article_history_backfill_candidates WHERE article_id=?').get(badBackfill.id).n,0);
assert.equal(count(blankPrefixBackfill.id),0,'schema install never backfills');assert.equal(sql.prepare('SELECT count(*) n FROM article_history_backfill_candidates WHERE article_id=?').get(blankPrefixBackfill.id).n,1,'candidate first nonempty paragraph');
assert.deepEqual(JSON.parse(sql.prepare('SELECT paragraphs FROM articles WHERE id=?').get(blankPrefixBackfill.id).paragraphs),['','  ',title,'BODY']);
for(const paragraphs of [['',title,'BODY'],['  ','',title,'BODY'],['\t\n\u00a0\ufeff',title,'BODY'],['','  ']]){
 const row=seed({paragraphs});assert.equal(count(row.id),paragraphs.includes(title)?1:0,'main capture first nonempty paragraph');
 sql.prepare("UPDATE article_deliveries SET state='saved' WHERE article_id=?").run(row.id);assert.equal(count(row.id),paragraphs.includes(title)?1:0,'delivery capture first nonempty paragraph');
}
const blankPrefixEnd=seed({paragraphs:['',title,'BODY'],omitEnd:['zhihu']});assert.equal(count(blankPrefixEnd.id),0);blankPrefixEnd.ends.find(e=>e.platform==='zhihu').end();assert.equal(count(blankPrefixEnd.id),1,'end capture first nonempty paragraph');
const wrongBlankTitle=seed({paragraphs:['',title,'BODY'],mutate:({readbacks})=>{readbacks.toutiao.title='';}});assert.equal(count(wrongBlankTitle.id),0,'blank paragraph is not a verified title');
const cases=[
 ['both mismatched SHAs',({readbacks})=>{readbacks.toutiao.word_sha256=readbacks.zhihu.word_sha256='c'.repeat(64);}],
 ['Toutiao SHA mismatch',({readbacks})=>{readbacks.toutiao.word_sha256='c'.repeat(64);}],
 ['Zhihu SHA mismatch',({readbacks})=>{readbacks.zhihu.word_sha256='c'.repeat(64);}],
 ['wrong title',({readbacks})=>{readbacks.zhihu.title='OTHER DOCUMENT';}],
 ['wrong account',({readbacks})=>{readbacks.toutiao.target_account='OTHER ACCOUNT';}],
 ['wrong readback URL',({readbacks})=>{readbacks.toutiao.draft_url+='&preview=1';}],
 ['noncanonical stored URL',({a,readbacks})=>{a.url+='&preview=1';readbacks.toutiao.draft_url=a.url;}],
 ['unverified Word receipt',({row})=>{row.verification.word_sha256='c'.repeat(64);}],
 ['not independently reopened',({readbacks})=>{readbacks.zhihu.independently_reopened=false;}],
 ['invalid time order',({readbacks})=>{readbacks.toutiao.saved_at='2099-01-01T00:00:00Z';}],
 ];
for(const [name,mutate] of cases){const row=seed({mutate});assert.equal(count(row.id),0,name+' main trigger');sql.prepare("UPDATE article_deliveries SET state='saved' WHERE article_id=?").run(row.id);assert.equal(count(row.id),0,name+' delivery trigger');}
const pending=seed({omitEnd:['zhihu']});assert.equal(count(pending.id),0,'missing uploader end receipt');pending.ends.find(e=>e.platform==='zhihu').end();assert.equal(count(pending.id),1,'last genuine end receipt captures exactly once');
sql.prepare("UPDATE article_deliveries SET state='saved' WHERE article_id=?").run(pending.id);assert.equal(count(pending.id),1);
const good=seed({created:'2026-10-11T12:00:00.000Z'});assert.equal(count(good.id),1,'new completion of pre-cutoff upload included');
const stored=JSON.parse(sql.prepare('SELECT record_json FROM article_history WHERE article_id=?').get(good.id).record_json);assert.equal(stored.word.sha256,sha);assert.equal(stored.title,title);assert.equal(stored.platforms.toutiao.account_id,'61556093362');assert.equal(stored.public_publication.status,'not_observed');
assert.throws(()=>sql.prepare('DELETE FROM article_history').run(),/immutable_article_history/);
sql.close();console.log('PASS all current actual migrations: backfill/main/delivery/end capture reject wrong SHA/title/account/URL/Word receipt/readback/order/unsettled uploader; capture later completion of pre-cutoff upload once; immutable metadata. ZERO production/platform I/O.');
