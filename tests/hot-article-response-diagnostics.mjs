// Entirely synthetic inputs, isolated SQLite and R2 map; no source/model requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {loadTS} from './hot-discovery-loader.mjs';
let clock=Date.parse('2026-10-08T08:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync('drizzle/0034_parallel_doctor_spectrum.sql','utf8'));
sqlite.function('strftime',{varargs:true},()=>new Clock().toISOString());
const db={prepare(sql){let args=[];return {bind(...v){args=v;return this;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};
const objects=new Map(),ops=[];let failPut=false,failList=false,getHook=null,putHook=null;
const bucket={async list(options){ops.push(['list',options]);if(failList)throw Error('private list failure');return {objects:[...objects].filter(([k])=>k.startsWith(options.prefix)).slice(0,options.limit).map(([key,v])=>({key,customMetadata:v.metadata})),truncated:false};},async put(key,body,options){ops.push(['put',key]);if(failPut)throw Error('private put failure');objects.set(key,{body,metadata:options.customMetadata});if(putHook)await putHook();},async get(key){ops.push(['get',key]);if(getHook)await getHook();const v=objects.get(key);return v?{size:Buffer.byteLength(v.body),async json(){return JSON.parse(v.body);}}:null;},async delete(keys){ops.push(['delete',keys]);for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
const seam={'./test-store':{db:()=>db,diagnosticBucket:()=>bucket}},globals={Date:Clock};
const diag=loadTS('lib/hot-response-diagnostics.ts',seam,globals),store=loadTS('lib/hot-article-discovery-store.ts',seam,globals);
const {scanBenchmarkAccounts}=loadTS('lib/hot-article-discovery.ts',{},globals);
const owner='SYNTHETIC-owner-a',other='SYNTHETIC-owner-b';
const saved=await store.addBenchmark(owner,{name:'TEST ONLY',url:'https://www.toutiao.com/c/user/123456789/'}),account=saved.accounts[0];
const article='https://www.toutiao.com/article/1000000000000000001/';
const card=`<main><ul><li class="article-card"><h3><a href="${article}">TEST ONLY 电影卡片</a></h3><a rel="author" class="author-name" data-author="visible" href="${account.url}">TEST ONLY 作者</a><time datetime="2026-10-07T08:00:00Z">2026-10-07</time><div class="article-stats"><span>12万阅读</span><span>0赞</span><span>8评论</span></div></li></ul></main>`;
const privateBits=`<script>SCRIPT_SECRET</script><form><input value="FORM_SECRET"><p>FORM_LABEL</p></form><div data-token="ATTR_SECRET">ATTR_TEXT</div><div hidden>HIDDEN_SECRET</div><p>token=TEXT_SECRET https://private.example/?secret=URL_SECRET ABCDEFGHIJKLMNOPQRSTUVWXYZ</p><a href="https://www.toutiao.com/c/user/123456789/?token=LINK_SECRET">bad</a><noscript><input value="NOSCRIPT_SECRET"></noscript><details><summary>SUMMARY</summary>DETAIL_SECRET</details><dialog>DIALOG_SECRET</dialog><div onclick="HANDLER_SECRET">safe</div><template>TEMPLATE_SECRET</template>`;
const sample=await diag.deriveResponse(card+privateBits+'<noscript>JavaScript required</noscript>');
for(const value of ['12万阅读','0赞','8评论',article,account.url,'rel="author"','author-name','datetime="2026-10-07T08:00:00Z"','SUMMARY'])assert.ok(sample.dom.includes(value),value);
for(const value of ['SCRIPT_SECRET','FORM_SECRET','FORM_LABEL','ATTR_SECRET','ATTR_TEXT','HIDDEN_SECRET','TEXT_SECRET','URL_SECRET','LINK_SECRET','NOSCRIPT_SECRET','DETAIL_SECRET','DIALOG_SECRET','HANDLER_SECRET','TEMPLATE_SECRET','ABCDEFGHIJKLMNOPQRSTUVWXYZ'])assert.ok(!sample.dom.includes(value),value);
assert.equal(sample.derived,true);assert.equal(sample.can_verify_metrics,false);assert.equal(sample.js_hint,true);assert.equal(sample.counts.explicit_author,1);assert.equal(sample.counts.article_links,1);assert.equal(sample.counts.script,1);
assert.equal(sample.source_sha256,createHash('sha256').update(card+privateBits+'<noscript>JavaScript required</noscript>').digest('hex'));
const publicProfile='https://www.toutiao.com/c/user/token/MS4wLjABAAAAKda3SPxLYUAYE5PQgzUPHTc5BRIff5H/';
assert.ok((await diag.deriveResponse(`<a rel="author" href="${publicProfile}">作者</a>`)).dom.includes(publicProfile),'public profile ID is not an authorization token');
assert.match((await diag.deriveResponse('<details open><summary>S</summary>OPEN_BODY</details><dialog open>OPEN_DIALOG</dialog>')).dom,/OPEN_BODY/);
assert.ok(!(await diag.deriveResponse('<script><main><li>FAKE_CARD 99万阅读</li></main></script>')).dom.includes('FAKE_CARD'));
for(const text of ['中'.repeat(40000),'\\\n\u0001'.repeat(30000)]){const bounded=await diag.deriveResponse(`<main>${text}</main>`);assert.equal(bounded.truncated,true);assert.ok(Buffer.byteLength(bounded.dom)<=60*1024);assert.ok(Buffer.byteLength(JSON.stringify(bounded))<64*1024);assert.ok(bounded.dom.endsWith('</body></html>'));}
const response=html=>new Response(html,{headers:{'content-type':'text/html'}});let calls=0,captures=0;
const stamp=new Clock().toISOString(),baseline=await scanBenchmarkAccounts([account],async()=>response(card),stamp);
const observed=await scanBenchmarkAccounts([account],async()=>{calls++;return response(card);},stamp,async()=>{captures++;return {state:'unavailable',derived:true,can_verify_metrics:false};});
delete observed.observations[0].response_diagnostic;assert.equal(JSON.stringify(observed),JSON.stringify(baseline));assert.equal(calls,1);assert.equal(captures,1);assert.equal(observed.articles[0].reads.exact,null);
for(const blockedResponse of [new Response('',{status:403}),response('<html><title>登录</title>captcha</html>')]){captures=0;const blocked=await scanBenchmarkAccounts([account],async()=>blockedResponse,stamp,async()=>{captures++;throw Error('must not capture restricted response');});assert.equal(blocked.status,'blocked');assert.equal(captures,0);}
const releases=[];calls=0;const delayed=scanBenchmarkAccounts([account,{...account,id:crypto.randomUUID()}],async()=>{calls++;return response(card);},stamp,()=>new Promise(resolve=>releases.push(resolve)));
while(releases.length<2)await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,2,'slow R2 does not serialize account fetches');for(const release of releases)release({state:'unavailable',derived:true,can_verify_metrics:false});await delayed;
const key=crypto.randomUUID();calls=0;
const view=await store.refreshDiscovery(owner,key,async()=>{calls++;return response(card+privateBits);});
assert.equal(view.scan.state,'ready');assert.equal(view.scan.result.observations[0].response_diagnostic.state,'stored');assert.equal(calls,1);assert.equal(objects.size,1);
const storedKey=[...objects.keys()][0];assert.ok(!storedKey.includes(owner));assert.ok(!objects.get(storedKey).body.includes('FORM_SECRET'));
const challengeOps=ops.length;for(const challenge of ['<p>验证码</p><form>PRIVATE_CHALLENGE</form>','<p>请登录后阅读</p>']){const refused=await diag.captureResponseDiagnostic(owner,view.scan.id,account,challenge,200,view.scan.created);assert.equal(refused.reason,'restricted_response');assert.equal(ops.length,challengeOps,'restricted response is not retained');}
const record=await diag.readResponseDiagnostic(owner,view.scan.id,account.id);assert.equal(record.dom.includes('12万阅读'),true);assert.equal(record.can_verify_metrics,false);
const before=ops.length;await store.refreshDiscovery(owner,key,()=>{throw Error('no repeated request');});assert.equal(ops.length,before,'idempotent refresh does not read/write R2');
for(const [user,scan,acct,status] of [[other,view.scan.id,account.id,404],[owner,view.scan.id,crypto.randomUUID(),404],[owner,'bad',account.id,400]]){const start=ops.length;await assert.rejects(()=>diag.readResponseDiagnostic(user,scan,acct),e=>e.status===status);assert.equal(ops.length,start,'invalid scope never touches R2');}
const route=loadTS('app/api/imitation/discovery/diagnostic/route.ts',{'../../../../../lib/test-store':{owner:r=>r.headers.get('oai-authenticated-user-id')},'../../../../../lib/hot-response-diagnostics':diag},globals);
const req=query=>new Request('https://private.example/api/imitation/discovery/diagnostic?'+query,{headers:{'oai-authenticated-user-id':owner}});
assert.equal((await route.GET(new Request('https://private.example/api/imitation/discovery/diagnostic'))).status,401);
const query=`scan_id=${view.scan.id}&account_id=${account.id}`;
assert.equal((await route.GET(req(query+'&url=https://private.example/'))).status,400);assert.equal((await route.GET(req(query+'&scan_id='+view.scan.id))).status,400);
const api=await route.GET(req(query));assert.equal(api.status,200);assert.match(api.headers.get('cache-control'),/private, no-store/);assert.equal(route.POST,undefined);
const corrupt=JSON.parse(objects.get(storedKey).body);corrupt.token='EXTRA_PRIVATE';corrupt.counts.token='EXTRA_PRIVATE';objects.get(storedKey).body=JSON.stringify(corrupt);assert.ok(!JSON.stringify(await diag.readResponseDiagnostic(owner,view.scan.id,account.id)).includes('EXTRA_PRIVATE'));
getHook=()=>{clock+=86400000;};await assert.rejects(()=>diag.readResponseDiagnostic(owner,view.scan.id,account.id),e=>e.status===410);getHook=null;
const expiredOps=ops.length;await assert.rejects(()=>diag.readResponseDiagnostic(owner,view.scan.id,account.id),e=>e.status===410);assert.equal(ops.length,expiredOps);assert.ok(objects.has(storedKey),'expiry denies read but performs no background delete');
objects.set('articles/SYNTHETIC.json',{body:'KEEP',metadata:{}});objects.set('hot-benchmark-response-v1/other-owner/KEEP',{body:'KEEP',metadata:{diagnostic_version:'response-diagnostic-1'}});
const privatePrefix=storedKey.slice(0,storedKey.indexOf(view.scan.id));objects.set(privatePrefix+'unknown-object',{body:'KEEP',metadata:{}});
clock+=1000;const second=await store.refreshDiscovery(owner,crypto.randomUUID(),async()=>response(card));assert.ok(!objects.has(storedKey),'next normal refresh lazily deletes expired diagnostic only');
assert.ok(objects.has('articles/SYNTHETIC.json'));assert.ok(objects.has('hot-benchmark-response-v1/other-owner/KEEP'));assert.ok(objects.has(privatePrefix+'unknown-object'));
clock+=1000;const third=await store.refreshDiscovery(owner,crypto.randomUUID(),async()=>response(card));clock+=1000;await store.refreshDiscovery(owner,crypto.randomUUID(),async()=>response(card));await assert.rejects(()=>diag.readResponseDiagnostic(owner,second.scan.id,account.id),e=>e.status===410);assert.ok(![...objects.keys()].some(k=>k.includes(second.scan.id)));assert.equal((await diag.readResponseDiagnostic(owner,third.scan.id,account.id)).derived,true);
failPut=true;clock+=1000;const failed=await store.refreshDiscovery(owner,crypto.randomUUID(),async()=>response(card));assert.equal(failed.scan.state,'ready');assert.equal(failed.scan.result.observations[0].response_diagnostic.state,'unavailable');failPut=false;
failList=true;clock+=1000;const noStorage=await store.refreshDiscovery(owner,crypto.randomUUID(),async()=>response('<html>JavaScript required</html>'));assert.equal(noStorage.scan.state,'incomplete');assert.equal(noStorage.scan.result.observations[0].response_diagnostic.state,'unavailable');failList=false;
// A delayed write loses its scope if two later scans have already been accepted.
const old=sqlite.prepare('SELECT * FROM hot_benchmark_scans WHERE id=?').get(noStorage.scan.id);
putHook=()=>{for(let i=0;i<2;i++)sqlite.prepare('INSERT INTO hot_benchmark_scans(id,owner,request_key,state,accounts_json,created,expires,updated) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),owner,crypto.randomUUID(),'incomplete',old.accounts_json,old.created,old.expires,old.updated);};
const late=await diag.captureResponseDiagnostic(owner,old.id,account,card,200,old.created);assert.equal(late.state,'unavailable');assert.ok(![...objects.keys()].some(k=>k.includes(old.id)));putHook=null;
clock+=1000;let finish;const acceptedKey=crypto.randomUUID(),pending=store.refreshDiscovery(owner,acceptedKey,()=>new Promise(resolve=>{finish=resolve;}));while(!finish)await new Promise(resolve=>setImmediate(resolve));const busyOps=ops.length;await assert.rejects(()=>store.refreshDiscovery(owner,crypto.randomUUID(),()=>{throw Error('no extra request');}),e=>e instanceof store.DiscoveryBusyError);assert.equal(ops.length,busyOps,'unaccepted busy refresh never touches R2');finish(new Response('',{status:403}));await pending;
const failedRoute=loadTS('app/api/imitation/discovery/diagnostic/route.ts',{'../../../../../lib/test-store':{owner:()=>owner},'../../../../../lib/hot-response-diagnostics':{...diag,readResponseDiagnostic:async()=>{throw Error('PRIVATE_STORAGE_DETAIL');}}},globals);const safeFailure=await failedRoute.GET(req(query));assert.equal(safeFailure.status,503);assert.ok(!(await safeFailure.text()).includes('PRIVATE_STORAGE_DETAIL'));
sqlite.close();console.log('PASS diagnostic isolation/redaction/UTF-8 JSON cap, no metrics promotion or extra fetch, denied-source stop, idempotency, private API, 24h delayed-read denial, recent-two lazy scoped cleanup, storage failure and delayed-write cleanup; synthetic only');
