// Test-only loopback adapter and receipts; never part of the Worker artifact.
import {createServer} from 'node:http';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fixture} from './harness.mjs';
import {countingDb} from './counting-d1.mjs';
import {BENCHMARK, seedBenchmark} from './bench-fixture.mjs';
import {referenceWorker} from './overview-cache-reference.mjs';
import current from '../dist/server/index.js';
const cleanups=[],lifecycle={after:action=>cleanups.push(action)};
const legacy=await referenceWorker(lifecycle,'937503d3e8e1b5ba2aeaf154714900b62e46152e'),app=await fixture(lifecycle);
const accounts=(await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
const ordered=['toutiao','zhihu','wechat'].map(p=>accounts.find(row=>row.platform===p));
for(const [i,account] of ordered.entries())
  await app.db.prepare('UPDATE matrix_accounts SET name=? WHERE id=?').bind('Synthetic visual account '+(i+1),account.id).run();
await seedBenchmark(app.db,ordered.map(row=>row.id),{articles:12});
const NativeDate=globalThis.Date,clock=Date.parse(BENCHMARK.now);
globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const servers=[],context=new AsyncLocalStorage(),clientHooks=process.env.SYNTHETIC_REVIEW_HOOKS==='1';
for(const [variant,port,worker] of [['baseline',8793,legacy],['candidate',8794,current]]) {
  const origin='http://127.0.0.1:'+port,receipts=[];
  const db=countingDb(app.db,{before:sql=>{
    const row=context.getStore();if(row){row.d1.sql++;if(/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql))row.d1.write_statements++;}
  },after:(_sql,result)=>{const row=context.getStore();if(row){row.d1.rows_read+=result.meta.rows_read;row.d1.rows_written+=result.meta.rows_written;}}});
  const batch=db.batch.bind(db);
  db.batch=async statements=>{
    const row=context.getStore();if(row){row.d1.sql+=statements.length;row.d1.write_statements+=statements.filter(s=>/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s.sql)).length;}
    const results=await batch(statements);
    if(row)for(const result of results){row.d1.rows_read+=result.meta.rows_read;row.d1.rows_written+=result.meta.rows_written;}
    return results;
  };
  const server=createServer(async(incoming,outgoing)=>{
    if(incoming.url==='/__synthetic-metrics'){outgoing.writeHead(200,{'Content-Type':'application/json'});outgoing.end(JSON.stringify(receipts));return;}
    const row={seq:receipts.length,variant,path:incoming.url,method:incoming.method,status:null,bytes:null,d1:{sql:0,write_statements:0,rows_read:0,rows_written:0}};
    receipts.push(row);
    await context.run(row,async()=>{
      try {
        const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
        const body=Buffer.concat(chunks),request=new Request(new URL(incoming.url,origin),{
          method:incoming.method,headers:incoming.headers,...(body.length?{body}:{}),});
        const response=await worker.fetch(request,{DB:db,SITE_ORIGIN:origin});
        let bytes=Buffer.from(await response.arrayBuffer());const headers=Object.fromEntries(response.headers);
        if(variant==='candidate'&&clientHooks&&incoming.method==='GET'&&incoming.url==='/app.js'&&response.status===200){
          // Private-module probes only in this isolated test adapter, never src/Worker.
          const probe='\nObject.defineProperty(globalThis,"syntheticClient",{value:{api,articleIndex,clearArticleIndexes,get cacheSize(){return articleIndexes.size},get me(){return state.me},get reviewArticles(){return state.reviewArticles},get epoch(){return sessionEpoch}}});\n';
          bytes=Buffer.concat([bytes,Buffer.from(probe)]);delete headers['content-length'];delete headers.etag;headers['cache-control']='no-store';
        }
        row.status=response.status;row.bytes=bytes.length;
        outgoing.writeHead(response.status,headers);outgoing.end(bytes);
      } catch {row.status=500;outgoing.writeHead(500);outgoing.end('Synthetic browser adapter failure');}
    });
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));servers.push(server);
}
console.log('Paired synthetic review fixtures ready on loopback ports 8793 and 8794.');
async function stop(){for(const server of servers)await new Promise(resolve=>server.close(resolve));for(const cleanup of cleanups.reverse())await cleanup();process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
