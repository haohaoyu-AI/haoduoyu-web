// Manual paired browser fixture. Both ports own only one temporary synthetic D1.
import {createServer} from 'node:http';
import {fixture} from './harness.mjs';
import {BENCHMARK, seedBenchmark} from './bench-fixture.mjs';
import {referenceWorker} from './overview-cache-reference.mjs';
import current from '../dist/server/index.js';
const cleanups=[],lifecycle={after:action=>cleanups.push(action)};
const legacy=await referenceWorker(lifecycle),app=await fixture(lifecycle);
const accounts=(await app.db.prepare('SELECT id,platform FROM matrix_accounts').all()).results;
const ordered=['toutiao','zhihu','wechat'].map(p=>accounts.find(row=>row.platform===p));
for(const [i,account] of ordered.entries())
  await app.db.prepare('UPDATE matrix_accounts SET name=? WHERE id=?').bind('Synthetic visual account '+(i+1),account.id).run();
await seedBenchmark(app.db,ordered.map(row=>row.id),{articles:12});
const NativeDate=globalThis.Date,clock=Date.parse(BENCHMARK.now);
globalThis.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const servers=[];
for(const [port,worker] of [[8791,legacy],[8792,current]]) {
  const origin='http://127.0.0.1:'+port;
  const server=createServer(async(incoming,outgoing)=>{
    try {
      const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
      const body=Buffer.concat(chunks),request=new Request(new URL(incoming.url,origin),{
        method:incoming.method,headers:incoming.headers,...(body.length?{body}:{}),});
      const response=await worker.fetch(request,{DB:app.db,SITE_ORIGIN:origin});
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {outgoing.writeHead(500);outgoing.end('Synthetic browser adapter failure');}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));servers.push(server);
}
console.log('Paired synthetic browser fixtures ready on loopback ports 8791 and 8792.');
async function stop(){for(const server of servers)await new Promise(resolve=>server.close(resolve));
  for(const cleanup of cleanups.reverse())await cleanup();process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
