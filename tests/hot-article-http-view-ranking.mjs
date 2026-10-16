// Entirely synthetic; no provider, network, account, article save or production.
import assert from 'node:assert/strict';
import {HotArticleViewFence,rememberHotArticleView} from '../lib/hot-article-view.ts';
import {readHotArticleRefresh,hotArticleQuery} from '../lib/hot-article-http.ts';
import {sortPublicArticles,hotArticleRankingBasis} from '../lib/hot-article-public.ts';

const fence = new HotArticleViewFence();
const initial = fence.capture(), oldPoll = fence.capture(), newRefresh = fence.begin();
assert.equal(fence.accepts(initial),false);
assert.equal(fence.accepts(oldPoll),false);
assert.equal(fence.accepts(newRefresh),true);
const historySelection = fence.begin();
assert.equal(fence.accepts(newRefresh),false,'Late refresh cannot replace newer history selection');
assert.equal(fence.accepts(historySelection),true);
const makeView = (id,created,state='queued') => ({batch:{id,created,state}});
const newer = makeView('new','2026-10-08T01:00:00Z'), older = makeView('old','2026-10-08T00:00:00Z');
assert.deepEqual(rememberHotArticleView([newer],older).map(v=>v.batch.id),['new','old']);
assert.equal(rememberHotArticleView([newer,older],makeView('old',older.batch.created,'blocked'))[1].batch.state,'blocked');

const url = query => new URL('https://synthetic.invalid/api/imitation'+query);
assert.deepEqual(hotArticleQuery(url('?view=settings')),{settings:true,args:{}});
for (const query of ['?view=other','?view=settings&id=x','?id=x&request_key=y','?id=','?id=a&id=b','?extra=1']) assert.throws(()=>hotArticleQuery(url(query)));
const request = (body,type='application/json') => new Request(url(''),{method:'POST',headers:{'content-type':type},body});
const intent = {request_key:'11111111-1111-4111-8111-111111111111',writer:'xiaoyu_agent0YYLX'};
assert.deepEqual(await readHotArticleRefresh(request(JSON.stringify(intent))),intent);
for (const body of ['{','[]','null','{"extra":true}']) await assert.rejects(readHotArticleRefresh(request(body)),error=>error.status===400);
await assert.rejects(readHotArticleRefresh(request('{}','text/plain')),error=>error.status===415);
let cancelled = false;
const stream = new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('鱼'.repeat(1001)));},cancel(){cancelled=true;}});
await assert.rejects(readHotArticleRefresh(new Request(url(''),{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'})),error=>error.status===413);
assert.equal(cancelled,true,'Unknown-length oversized stream is stopped before buffering the whole body');

const metric = value => ({value,evidence:value===null?null:{url:'https://synthetic.invalid/source',observed_at:'2026-10-08T00:00:00Z',label:'OFFLINE SYNTHETIC'}});
const article = (id,reads,likes,comments) => ({id,url:'https://synthetic.invalid/article/'+id,reads:metric(reads),likes:metric(likes),comments:metric(comments)});
const broad = article('broad',1000,500,200), singleLarge = article('large',1000000,1,1);
assert.equal(sortPublicArticles([singleLarge,broad])[0].id,'broad','Likes and comments materially affect rank, beyond read-count tie breakers');
const missing = article('missing',null,100,10), present = article('present',1000000,50,5);
assert.equal(sortPublicArticles([present,missing])[0].id,'missing','Use two common measured dimensions when reads are not available for every candidate');
assert.equal(missing.reads.value,null);assert.match(hotArticleRankingBasis([present,missing]),/点赞、评论/);
const mixed = [article('a',null,10,1),article('b',20,null,2),article('c',30,15,null)];
assert.match(hotArticleRankingBasis(mixed),/可比性有限/);sortPublicArticles(mixed);assert.equal(mixed[0].reads.value,null);
assert.equal(sortPublicArticles(Array.from({length:8},(_,i)=>article(String(i),0,0,0))).length,5);
assert.deepEqual(sortPublicArticles([article('z',0,0,0),article('a',0,0,0)]).map(x=>x.id),['a','z']);
console.log('PASS synthetic view races, retained history, bounded HTTP/strict queries and real multidimensional ranking; zero live/provider requests');
