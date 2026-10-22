// Isolated browser-only adapter. No production network, configuration or data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import worker from '../dist/server/index.js';

const BASELINE='a1babd8558d7869ab61fe6bc463615a04eec6eb9';
const NOW='2026-10-22T08:00:00.000Z';
const root=new URL('../',import.meta.url),cleanups=[],servers=[];
const lifecycle={after:fn=>cleanups.push(fn)},context=new AsyncLocalStorage();
const original=execFileSync('git',['show',BASELINE+':public/app.js'],{cwd:root,maxBuffer:1024*1024});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const oldCss=execFileSync('git',['show',BASELINE+':public/style.css'],{cwd:root});
const oldWorker=execFileSync('git',['show',BASELINE+':src/worker.mjs'],{cwd:root,encoding:'utf8'});
const oldPolicy=oldWorker.match(/'Content-Security-Policy':"([^"]+)"/)[1];
// Both variants intentionally use the same unchanged backend. Only the shipped
// frontend differs, so writes cannot introduce historical-backend differences.
const files=execFileSync('git',['ls-tree','-r','--name-only',BASELINE,'src','shared','drizzle','public/style.css',
  'public/index.html','runtime.json','.openai/hosting.json'],{cwd:root,encoding:'utf8'}).trim().split('\n');
for(const file of files.filter(file=>file!=='src/assets.generated.mjs')) {
  const old=execFileSync('git',['show',BASELINE+':'+file],{cwd:root,maxBuffer:1024*1024});
  let expected=old;
  if(file==='src/worker.mjs')expected=Buffer.from(old.toString().replace("style-src 'self' 'unsafe-inline'","style-src 'self'"));
  if(file==='public/style.css')expected=Buffer.from(old.toString()
    .replace('.legend-dot { display:inline-block; width:var(--s2); height:var(--s2); margin-right:var(--s2); border-radius:50%; }',
      '.legend-dot { display:inline-block; width:var(--s2); height:var(--s2); margin-right:var(--s2); border-radius:50%; background:var(--plot-color); }')
    .replace('.publication-bars i { display:block; width:var(--s3); border-radius:var(--r-sm); background:var(--p-other); }',
      '.publication-bars i { display:block; width:var(--s3); height:var(--h); border-radius:var(--r-sm); background:var(--plot-color); }'));
  assert.deepEqual(await readFile(new URL(file,root)),expected,'Only the exact D5 policy and two CSS rules may differ: '+file);
}
const NativeDate=Date,clock=Date.parse(NOW);
globalThis.Date=class extends NativeDate {
  constructor(...args){super(...(args.length?args:[clock]));}
  static now(){return clock;}
};

async function seed(db) {
  await db.prepare('INSERT INTO matrix_accounts(id,platform,name,active,created_at) VALUES(?,?,?,?,?)')
    .bind('synthetic-other','other','Synthetic other account',1,NOW).run();
  const accounts=(await db.prepare('SELECT id,platform FROM matrix_accounts ORDER BY id').all()).results;
  for(const row of accounts)await db.prepare('UPDATE matrix_accounts SET name=?,created_at=? WHERE id=?')
    .bind('Synthetic '+row.platform+' account',NOW,row.id).run();
  await db.prepare('DELETE FROM matrix_audit').run();
  const zhihu=accounts.find(row=>row.platform==='zhihu').id;
  const toutiao=accounts.find(row=>row.platform==='toutiao').id;
  const wechat=accounts.find(row=>row.platform==='wechat').id;
  for(let i=0;i<25;i++) {
    const id='synthetic-ui-'+i,account=i<12?zhihu:i%2?toutiao:wechat;
    const published=i<7?'2026-10-20T00:00:00.000Z':i<12?'2026-10-19T00:00:00.000Z':
      i===24?'2026-11-01T00:00:00.000Z':'2026-10-18T00:00:00.000Z';
    const title=i===23?'Synthetic long title '+('长标题 & <安全> '.repeat(15)):'Synthetic article '+String(i).padStart(2,'0');
    await db.prepare(`INSERT INTO matrix_articles
      (id,account_id,title,url,published_at,started_at,production_mode,summary,notes,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,account,title,'https://example.invalid/synthetic/article/'+i,
      published,'2026-10-17T00:00:00.000Z',i%2?'manual':'automatic','Synthetic summary',
      i===22?'[date-unverified] Synthetic only':'Synthetic note',NOW,NOW).run();
    if(i<12)await db.prepare(`INSERT INTO matrix_daily_metrics
      (id,account_id,article_id,date,metrics_json,source,updated_at) VALUES(?,?,?,?,?,?,?)`)
      .bind('synthetic-daily-'+i,account,id,i<7?'2026-10-21':'2026-10-20',
        JSON.stringify({reads:i<7?30:10,likes:0,approvals:1,comments:0}),'synthetic-browser',NOW).run();
    if(i>=7&&i!==22&&i!==24)await db.prepare(`INSERT INTO matrix_observations
      (id,article_id,as_of,collected_at,kind,metrics_json,source,note,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind('synthetic-snapshot-'+i,id,'2026-10-21T08:00:00.000Z',NOW,'latest',
        JSON.stringify(i===7?{reads:0,likes:0,approvals:2}:{reads:i*10,likes:i,comments:0}),
        'synthetic-browser','Synthetic only',NOW).run();
  }
  return {accounts,articles:25,clock:NOW,article:'synthetic-ui-7',missing:'synthetic-ui-0'};
}

for(const [variant,port] of [['baseline',8835],['candidate',8836]]) {
  const app=await fixture(lifecycle),metadata=await seed(app.db),receipts=[];
  const origin='http://127.0.0.1:'+port;
  const db=countingDb(app.db,{before:sql=>{
    const row=context.getStore();if(row){row.d1.sql++;if(/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql))row.d1.write_statements++;}
  },after:(_sql,result)=>{const row=context.getStore();if(row){row.d1.rows_read+=result.meta.rows_read;row.d1.rows_written+=result.meta.rows_written;}}});
  const batch=db.batch.bind(db);
  db.batch=async statements=>{
    const row=context.getStore();if(row){row.d1.sql+=statements.length;
      row.d1.write_statements+=statements.filter(s=>/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s.sql)).length;}
    const results=await batch(statements);
    if(row)for(const result of results){row.d1.rows_read+=result.meta.rows_read;row.d1.rows_written+=result.meta.rows_written;}
    return results;
  };
  const server=createServer(async(incoming,outgoing)=>{
    if(incoming.method==='GET'&&['/__synthetic-metrics','/__synthetic-fixture'].includes(incoming.url)) {
      outgoing.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      outgoing.end(JSON.stringify(incoming.url==='/__synthetic-metrics'?receipts:{...metadata,baseline:BASELINE,
        variant,original_app_sha256:sha(original)}));return;
    }
    const row={seq:receipts.length,variant,path:incoming.url,method:incoming.method,status:null,bytes:null,
      d1:{sql:0,write_statements:0,rows_read:0,rows_written:0}};
    receipts.push(row);
    await context.run(row,async()=>{
      try {
        const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
        const body=Buffer.concat(chunks),request=new Request(new URL(incoming.url,origin),{
          method:incoming.method,headers:incoming.headers,...(body.length?{body}:{})});
        const response=await worker.fetch(request,{DB:db,SITE_ORIGIN:origin});
        let bytes=Buffer.from(await response.arrayBuffer()),status=response.status;
        const headers=Object.fromEntries(response.headers);
        if(variant==='baseline') {
          headers['content-security-policy']=oldPolicy;
          if(incoming.method==='GET'&&['/app.js','/style.css'].includes(incoming.url)) {
            bytes=incoming.url==='/app.js'?original:oldCss;status=200;
            headers.etag='"'+sha(bytes)+'"';headers['content-length']=String(bytes.length);
          }
        }
        row.status=status;row.bytes=bytes.length;
        outgoing.writeHead(status,headers);outgoing.end(bytes);
      } catch {
        row.status=500;outgoing.writeHead(500);outgoing.end('Synthetic browser adapter failure');
      }
    });
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));servers.push(server);
  console.log(`${variant}: independent synthetic D1 ready at ${origin}; ${metadata.articles} articles.`);
}
console.log('Frontend comparison ready. Browser requests use real Cookie/CSRF; baseline serves its own JS/CSS and original policy.');
async function stop(){for(const server of servers)await new Promise(resolve=>server.close(resolve));
  for(const cleanup of cleanups.reverse())await cleanup();process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
