// Loopback-only browser fixture: temporary synthetic D1, real Worker and sessions.
// Run after npm run build. The test clock and control routes never enter assets.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fixture} from './harness.mjs';
import worker from '../dist/server/index.js';

const root=new URL('../',import.meta.url),cleanups=[];
const port=Number(process.env.DAILY_TODOS_PORT||8797);
assert.ok(Number.isInteger(port)&&port>1024&&port<65536);
const origin='http://127.0.0.1:'+port;
const initialNow='2026-10-23T15:59:58.000Z';
const NativeDate=Date;
let clock=NativeDate.parse(initialNow);
globalThis.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:[clock]));}
  static now(){return clock;}
};
const app=await fixture({after:fn=>cleanups.push(fn)},{persist:false,origin});
const accounts=(await app.db.prepare('SELECT id,platform FROM matrix_accounts ORDER BY id').all()).results;
for(const account of accounts)await app.db.prepare('UPDATE matrix_accounts SET name=? WHERE id=?')
  .bind('合成测试 '+account.platform,account.id).run();
for(let i=0;i<3;i++) {
  await app.db.prepare(`INSERT INTO matrix_articles
  (id,account_id,title,url,published_at,production_mode,summary,notes,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?,?,?)`).bind('synthetic-todo-article-'+i,accounts[i].id,
  '合成回归文章 '+(i+1),'https://example.invalid/daily-todos/'+i,
  '2026-10-22T08:00:00.000Z','manual','合成浏览器测试','合成记录',initialNow,initialNow).run();
  await app.db.prepare(`INSERT INTO matrix_observations
    (id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind('synthetic-todo-observation-'+i,'synthetic-todo-article-'+i,'2026-10-23T08:00:00.000Z',
      initialNow,'latest',JSON.stringify({reads:120+i*40,likes:3+i,comments:0}),
      '合成浏览器测试','公开来源核验示例',initialNow).run();
  await app.db.prepare(`INSERT INTO matrix_daily_metrics
    (id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .bind('synthetic-todo-daily-'+i,accounts[i].id,'synthetic-todo-article-'+i,'2026-10-22',
      JSON.stringify({reads:20+i*10,likes:0,comments:0}),'合成浏览器测试',initialNow).run();
}

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function filesIn(path) {
  const children=await readdir(new URL(path+'/',root),{withFileTypes:true});
  const files=[];
  for(const child of children) {
    const name=path+'/'+child.name;
    if(child.isDirectory())files.push(...await filesIn(name));
    else if(child.isFile())files.push(name);
  }
  return files;
}
const paths=['public/app.js','public/style.css','public/index.html','public/openapi.json','runtime.json',
  'dist/server/index.js',...await filesIn('web'),...await filesIn('src'),...await filesIn('shared'),
  ...await filesIn('drizzle'),...await filesIn('db')].sort();
const productHashes={};
for(const path of paths)productHashes[path]=sha(await readFile(new URL(path,root)));
const metadata={synthetic:true,origin,initial_now:initialNow,articles:3,
  source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  product_hashes:productHashes,product_manifest_sha256:sha(JSON.stringify(productHashes)),
  isolation:'Ephemeral Miniflare D1; loopback HTTP adapter; browser blocks non-loopback requests; no production configuration.'};
const receipts=[];
function sendJSON(outgoing,value,status=200) {
  outgoing.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});
  outgoing.end(JSON.stringify(value));
}
const server=createServer(async(incoming,outgoing)=>{
  try {
    // No credentials or request bodies are retained by the evidence endpoint.
    if(incoming.method==='GET'&&incoming.url==='/__synthetic-fixture') {
      sendJSON(outgoing,{...metadata,now:new Date().toISOString()});return;
    }
    if(incoming.method==='GET'&&incoming.url==='/__synthetic-metrics') {
      sendJSON(outgoing,receipts);return;
    }
    const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    if(incoming.method==='POST'&&incoming.url==='/__synthetic-clock') {
      const command=JSON.parse(body.toString());
      assert.equal(typeof command.now,'string');
      const next=NativeDate.parse(command.now);
      assert.ok(Number.isFinite(next)&&next>=NativeDate.parse(initialNow)&&next<NativeDate.parse('2026-10-26T00:00:00Z'));
      clock=next;sendJSON(outgoing,{now:new Date().toISOString()});return;
    }
    const row={seq:receipts.length,method:incoming.method,path:incoming.url,status:null};
    receipts.push(row);
    const request=new Request(new URL(incoming.url,origin),{method:incoming.method,headers:incoming.headers,
      ...(body.length?{body}:{})});
    const response=await worker.fetch(request,{DB:app.db,SITE_ORIGIN:origin});
    row.status=response.status;
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch(error) {
    console.error('Synthetic browser adapter failure:',error.name);
    if(!outgoing.headersSent)sendJSON(outgoing,{error:'Synthetic adapter failure'},500);
    else outgoing.end();
  }
});
await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
console.log('Daily todos synthetic browser fixture ready at '+origin);
let stopping=false;
async function stop() {
  if(stopping)return;stopping=true;
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  for(const cleanup of cleanups.reverse())await cleanup();
  globalThis.Date=NativeDate;
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop().then(()=>process.exit(0)));
