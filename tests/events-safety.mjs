import ts from 'typescript';import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
const source=fs.readFileSync('lib/events.ts','utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let calls=0,mode='ok',lastEvent=null;const sqlDB=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())sqlDB.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const db={prepare:(sql)=>({bind:(...values)=>({first:async()=>sqlDB.prepare(sql).get(...values)||null,all:async()=>({results:sqlDB.prepare(sql).all(...values)}),run:async()=>({meta:{changes:Number(sqlDB.prepare(sql).run(...values).changes)}})})})};
const secret='whsec_'+Buffer.alloc(32,7).toString('base64');
const ex={};vm.runInNewContext(js,{exports:ex,require:()=>({db:()=>db}),URL,TextEncoder,TextDecoder,crypto,Uint8Array,btoa,atob,Response,AbortSignal,setTimeout,Date,fetch:async(url,opts)=>{calls++;assert.equal(opts.redirect,'manual');assert.equal(new URL(url).protocol,'https:');const body=JSON.parse(opts.body);lastEvent=body;const h=opts.headers;const expect='v1,'+createHmac('sha256',Buffer.alloc(32,7)).update(`${h['webhook-id']}.${h['webhook-timestamp']}.${opts.body}`).digest('base64');assert.equal(h['webhook-signature'].split(' ')[0],expect);if(mode==='large')return new Response('x'.repeat(5000));if(body.type==='verification')return Response.json({challenge:body.challenge});if(mode==='retry'&&calls%2===0)return new Response('',{status:503});if(mode==='gone')return new Response('',{status:410});return new Response('',{status:202});}});
for(const u of ['http://example.com','https://127.0.0.1','https://0x7f000001','https://[::1]','https://localhost','https://x.local','https://a.chatgpt.site','https://example.com:8443','https://a:b@example.com'])assert.throws(()=>ex.callbackURL(u));
const p={name:'test.created',arguments:{},delivery:{mode:'webhook',url:'https://receiver.example.org/cb',secret}};
const sub=await ex.subscribe('a',p);assert.equal((await ex.readiness('a')).connected,true);assert.equal((await ex.readiness('b')).connected,false);
assert.match(await ex.dispatch('a','test1',new Date().toISOString()),/送达/);
mode='gone';const before=calls;await ex.dispatch('a','test2',new Date().toISOString());assert.equal(calls,before+1);assert.equal((await ex.readiness('a')).connected,true);
mode='retry';await ex.dispatch('a','test3',new Date().toISOString());
await ex.unsubscribe('b',p);assert.equal((await ex.readiness('a')).connected,true);await ex.unsubscribe('a',p);assert.equal((await ex.readiness('a')).connected,false);
await assert.rejects(ex.subscribe('a',{...p,ttlMs:1.5}));
mode='large';await assert.rejects(ex.subscribe('a',p));assert.equal((await ex.readiness('a')).connected,false);
console.log('URL, HMAC, challenge, owner isolation, delivery, 410, retry, unsubscribe, bounded response passed; mocked network and D1');

mode='ok';
const articleParams={...p,name:'article.submitted'},topicParams={...p,name:'topic.research_requested'};
await ex.subscribe('a',articleParams);await ex.subscribe('a',topicParams);
const articleBefore=JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name='article.submitted'").all());
assert.equal(await ex.dispatchTopicResearch('b','research-a',new Date().toISOString()),false);
assert.equal(await ex.dispatchTopicResearch('a','research-a',new Date().toISOString()),true);
assert.equal(lastEvent.name,'topic.research_requested');assert.equal(JSON.stringify(lastEvent.data),JSON.stringify({research_id:'research-a'}));assert.equal(lastEvent.eventId,'topic_evt_research-a');
await ex.unsubscribe('a',topicParams);
assert.equal(JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name='article.submitted'").all()),articleBefore);
await ex.dispatch('a','article-a',new Date().toISOString(),'article.submitted');assert.equal(lastEvent.name,'article.submitted');assert.equal(JSON.stringify(lastEvent.data),JSON.stringify({article_id:'article-a'}));
console.log('Independent topic subscription, owner scope, signed research-only payload and unchanged article subscription passed');

const editorialParams={...p,name:'editorial.requested'};
const preserved=JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name IN ('article.submitted','topic.research_requested') ORDER BY id").all());
assert.equal(await ex.dispatchEditorialRequest('b','editorial-a',new Date().toISOString()),false);
await ex.subscribe('a',editorialParams);assert.equal((await ex.readiness('a','editorial.requested')).connected,true);
const wakeBefore=calls;assert.equal(await ex.dispatchEditorialRequest('a','editorial-a',new Date().toISOString()),true);assert.equal(calls,wakeBefore+1);assert.equal(lastEvent.name,'editorial.requested');assert.equal(JSON.stringify(lastEvent.data),JSON.stringify({request_id:'editorial-a'}));assert.equal(lastEvent.eventId,'editorial_evt_editorial-a');
await ex.unsubscribe('a',editorialParams);assert.equal(JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name IN ('article.submitted','topic.research_requested') ORDER BY id").all()),preserved);assert.equal((await ex.readiness('a','editorial.requested')).connected,false);
console.log('Independent editorial subscription, fixed signed ID-only wake, owner isolation and unchanged article/topic subscriptions passed; offline only');

const hotParams={...p,name:'hot_article.research_requested'},hotPreserved=JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name!='hot_article.research_requested' ORDER BY id").all());
assert.equal(await ex.dispatchHotArticleResearch('b','hot-a',new Date().toISOString()),false);
await ex.subscribe('a',hotParams);assert.equal((await ex.readiness('a','hot_article.research_requested')).connected,true);
assert.equal(await ex.dispatchHotArticleResearch('a','hot-a',new Date().toISOString()),true);assert.equal(lastEvent.name,'hot_article.research_requested');assert.equal(JSON.stringify(lastEvent.data),JSON.stringify({batch_id:'hot-a'}));assert.equal(lastEvent.eventId,'hot_evt_hot-a');
await ex.unsubscribe('a',hotParams);assert.equal(JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name!='hot_article.research_requested' ORDER BY id").all()),hotPreserved);assert.equal((await ex.readiness('a','hot_article.research_requested')).connected,false);
console.log('PASS isolated hot research event with signed batch ID, owner checks and preserved existing subscriptions; mock delivery only');

// Dynamic native wakes keep exact queue generation in signed event data.
const dedaoParams={...p,name:'dedao.writing_requested'},dedaoPreserved=JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name!='dedao.writing_requested' ORDER BY id").all());
await ex.subscribe('a',dedaoParams);
const revision1='11111111-1111-4111-8111-111111111111',revision2='22222222-2222-4222-8222-222222222222';
sqlDB.prepare("INSERT INTO dedao_batches(id,owner,request_key,queue_revision,total,state,created,updated) VALUES('synthetic-dedao','a',?, ?,1,'queued',?,?)").run(crypto.randomUUID(),revision1,new Date().toISOString(),new Date().toISOString());
sqlDB.prepare("INSERT INTO dedao_items(batch_id,owner,ordinal,id,created,updated) VALUES('synthetic-dedao','a',1,?,?,?)").run(crypto.randomUUID(),new Date().toISOString(),new Date().toISOString());
assert.equal(await ex.dispatchDedao('b','synthetic-dedao',new Date().toISOString(),revision1),false);
assert.equal(await ex.dispatchDedao('a','synthetic-dedao',new Date().toISOString(),revision1),true);
assert.equal(lastEvent.name,'dedao.writing_requested');assert.equal(lastEvent.eventId,'dedao_evt_synthetic-dedao_'+revision1);assert.deepEqual(lastEvent.data,{batch_id:'synthetic-dedao',queue_revision:revision1});
const firstNativeId=lastEvent.eventId;await ex.dispatchDedao('a','synthetic-dedao',new Date().toISOString(),revision1);assert.equal(lastEvent.eventId,firstNativeId,'same generation always uses the same webhook id');
sqlDB.prepare("UPDATE dedao_batches SET queue_revision=? WHERE id='synthetic-dedao'").run(revision2);
await ex.dispatchDedao('a','synthetic-dedao',new Date().toISOString(),revision2);assert.notEqual(lastEvent.eventId,firstNativeId,'legitimate resume has a distinct stable wake id');
await ex.unsubscribe('a',dedaoParams);assert.equal(JSON.stringify(sqlDB.prepare("SELECT * FROM event_subscriptions WHERE event_name!='dedao.writing_requested' ORDER BY id").all()),dedaoPreserved);
console.log('PASS offline dynamic Dedao signed generation payload, stable duplicate IDs, distinct resume IDs, owner filtering and all other subscriptions unchanged; callback fetch is simulated, not real webhook acceptance.');
