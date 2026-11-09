// Local synthetic browser fixture only. Every provider request is intercepted;
// no production credentials, network calls, releases or existing records.
import {Miniflare} from 'miniflare';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {applyFixtureMigrations} from './harness.mjs';
const origin='http://127.0.0.1:8917',owner='11111111-1111-4111-8111-111111111111';
const runtime=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
let providerCalls=0;const receipts=[];
const mf=new Miniflare({modules:true,cf:false,scriptPath:fileURLToPath(new URL('../dist/server/index.js',import.meta.url)),
  compatibilityDate:runtime.compatibility_date,compatibilityFlags:runtime.compatibility_flags,d1Databases:['DB'],
  host:'127.0.0.1',port:8917,inspectorPort:0,
  bindings:{SITE_ORIGIN:origin,PUBLIC_BUSINESS_MODE:'1',DAILY_NOTES_OWNER_ID:owner,MEMOS_OWNER_ID:owner,
    OPENAI_API_KEY:'synthetic-count-browser-key',OPENAI_REVIEW_MODEL:'gpt-6.1-sol'},
  outboundService:async request=>{
    if(request.url!=='https://api.openai.com/v1/responses')return new Response('Synthetic fixture blocks all other outbound traffic',{status:502});
    providerCalls++;const body=await request.json();receipts.push({providerCalls,body});
    await new Promise(resolve=>setTimeout(resolve,1800));
    await writeFile(new URL('../artifacts/count-browser-provider-receipt.json',import.meta.url),JSON.stringify(receipts,null,2));
    return Response.json({id:'resp_synthetic_browser',status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({article_count:JSON.parse(body.input[0].content).article_count})}]}]});
  }});
const db=await mf.getD1Database('DB');await applyFixtureMigrations(db);
await db.prepare('INSERT INTO matrix_users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(owner,'synthetic-count-owner','not-a-real-password','2026-11-09T00:00:00Z').run();
await db.prepare('INSERT INTO matrix_control(id,initialized) VALUES(1,1)').run();
for(let i=1;i<=3;i++)await db.prepare('INSERT INTO matrix_review_articles(user_id,id,account,title,published_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .bind(owner,'22222222-2222-4222-8222-22222222222'+i,i===3?'好多鱼':'V字','合成计数样本 '+i,'2026-11-09','2026-11-09T00:00:00Z','2026-11-09T00:00:00Z').run();
await db.prepare('INSERT INTO matrix_review_snapshots(user_id,id,article_id,snapshot_date,reads) VALUES(?,?,?,?,?)').bind(owner,'33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222221','2026-11-09',200).run();
console.log('SYNTHETIC_COUNT_BROWSER_READY '+String(await mf.ready));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await mf.dispose();process.exit(0);});
