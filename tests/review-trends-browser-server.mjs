// Disposable synthetic D1 only; all outbound traffic is blocked.
import {Miniflare} from 'miniflare';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {applyFixtureMigrations} from './harness.mjs';
const owner='11111111-1111-4111-8111-111111111111',origin='http://127.0.0.1:8921';
const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
const mf=new Miniflare({modules:true,cf:false,scriptPath:fileURLToPath(new URL('../dist/server/index.js',import.meta.url)),
  compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],
  host:'127.0.0.1',port:8921,inspectorPort:0,
  bindings:{SITE_ORIGIN:origin,PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,PUBLIC_BUSINESS_ACCOUNT_IDS:'[]',
    DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner},
  outboundService:async()=>new Response('Synthetic fixture blocks outbound traffic',{status:502})});
const db=await mf.getD1Database('DB');await applyFixtureMigrations(db);
await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
  .bind(owner,'synthetic-trends-owner','not-a-real-password','2026-11-01T00:00:00Z').run();
await db.prepare('INSERT INTO matrix_control(id,initialized) VALUES(1,1)').run();
for(let index=0;index<12;index++) {
  const id=`22222222-2222-4222-8222-${String(index).padStart(12,'0')}`;
  const date=index<10?`2026-11-${String(index+1).padStart(2,'0')}`:index===10?'2026-11-11':null;
  await db.prepare('INSERT INTO matrix_review_articles(user_id,id,account,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .bind(owner,id,'V字',`合成验收样本 ${index+1}`,date,'2026-11-01T00:00:00Z','2026-11-01T00:00:00Z').run();
  if(index<10 && index!==5) await db.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,age_hours,reads,ctr,completion_rate,avg_read_seconds) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(owner,`33333333-3333-4333-8333-${String(index).padStart(12,'0')}`,id,'2026-11-10',index===9?12:24,index*500,index,25+index,30+index).run();
}
for(const path of ['/auth/me','/accounts','/review/articles?account=V%E5%AD%97&offset=0']) {
  const response=await mf.dispatchFetch(origin+'/api/v1'+path);
  if(!response.ok)throw new Error('Synthetic browser fixture is not readable: '+path+' '+response.status);
}
console.log('SYNTHETIC_TRENDS_READY '+String(await mf.ready));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await mf.dispose();process.exit(0);});
