import test from 'node:test';
import assert from 'node:assert/strict';
import {pushNotionSnapshot} from '../src/notion-transport.mjs';

const parentId='a'.repeat(32),token='SYNTHETIC-NOTION-TOKEN-NEVER-LOG';
const snapshot=(n=1,hash='b'.repeat(64))=>({snapshot_format:'haoduoyu-business-snapshot-v1',date:'2026-10-24',timezone:'Asia/Shanghai',
  content_hash:hash,generated_at:'2026-10-24T08:00:00.000Z',todos:Array.from({length:n},(_,i)=>({id:String(i),text:'合成待办 '+i,completed:false})),
  templates:[],accounts:[],articles:[],observations:[],daily_metrics:[]});
const json=(value,status=200,headers={})=>Response.json(value,{status,headers});

function notion({pageSize=100,parentPageSize=pageSize}={}) {
  const pages=new Map(),calls=[];let serial=0;
  const options={};
  const fetchImpl=async(url,request)=>{
    calls.push({url,method:request.method,body:request.body});
    assert.equal(new URL(url).origin,'https://api.notion.com');
    assert.equal(request.headers.Authorization,'Bearer '+token);
    assert.equal(request.headers['Notion-Version'],'2026-03-11');
    assert.equal(request.redirect,'manual');
    const path=new URL(url).pathname;
    if(options.readLimit&&request.method==='GET')return json({message:token+' BODY-CANARY'},429,{'Retry-After':'17'});
    if(request.method==='GET') {
      if(options.hugeResponse)return new Response('x'.repeat(513*1024));
      if(path.startsWith('/v1/pages/'))return json({object:'page',id:path.split('/')[3],parent:{type:'page_id',page_id:options.moved?'f'.repeat(32):parentId},archived:false,in_trash:false});
      const blockId=path.split('/')[3],all=blockId===parentId?(options.hideParent?[]:[...pages.entries()].map(([id,p])=>({id,type:'child_page',child_page:{title:p.title}}))):pages.get(blockId)?.children;
      assert.ok(all,'unknown mock page');
      const size=blockId===parentId?parentPageSize:pageSize;
      const start=Number(new URL(url).searchParams.get('start_cursor')||0),results=all.slice(start,start+size);
      const more=start+size<all.length;
      if(options.truncated)return json({results,has_more:true,next_cursor:null});
      return json({results:structuredClone(results),has_more:more,next_cursor:more?String(start+size):null});
    }
    if(request.method==='POST') {
      assert.equal(path,'/v1/pages');
      const data=JSON.parse(request.body),id=(++serial).toString(16).padStart(32,'0');
      assert.equal(data.parent.page_id,parentId);
      assert.ok(data.children.length<=100);
      pages.set(id,{title:data.properties.title.title[0].text.content,children:structuredClone(data.children)});
      if(options.loseCreateResponse)throw Error(token+' BODY-CANARY '+request.body);
      return json({object:'page',id});
    }
    assert.equal(request.method,'PATCH');
    const id=path.split('/')[3];assert.ok(pages.has(id));
    if(options.appendLimit)return json({message:token},429,{'Retry-After':'4'});
    const data=JSON.parse(request.body);assert.ok(data.children.length<=100);
    if(!options.dropAppend)pages.get(id).children.push(...structuredClone(data.children));
    if(options.loseAppendResponse)throw Error(token+' BODY-CANARY');
    return json({object:'list',results:data.children,has_more:false,next_cursor:null});
  };
  const push=value=>pushNotionSnapshot({token,parentId,snapshot:value,fetchImpl});
  return {pages,calls,options,fetchImpl,push};
}

test('create snapshot, fully verify body, skip identical latest hash, and version genuine changes without updating old pages',async()=>{
  const api=notion(),first=await api.push(snapshot());
  assert.equal(first.status,'created');assert.equal(first.version,1);assert.equal(first.verified,true);
  assert.equal(first.counts.todos,1);
  const old=structuredClone(api.pages.get(first.page_id));
  const same=await api.push({...snapshot(),generated_at:'2026-10-24T09:00:00.000Z'});
  assert.equal(same.status,'skipped');assert.equal(same.page_id,first.page_id);
  const second=await api.push(snapshot(2,'c'.repeat(64)));
  assert.equal(second.status,'versioned');assert.equal(second.version,2);
  assert.deepEqual(api.pages.get(first.page_id),old);
  assert.equal(api.calls.filter(c=>c.method==='POST').length,2);
  assert.equal(api.calls.filter(c=>c.method==='PATCH').length,0);
  // Returning to an older content hash is a real change relative to the latest snapshot.
  const third=await api.push(snapshot());assert.equal(third.version,3);assert.equal(third.status,'versioned');
});

test('array reordering and capture time changes keep identical content skippable',async()=>{
  const api=notion(),data=snapshot(3);await api.push(data);
  const again=await api.push({...data,generated_at:'2026-10-25T00:00:00.000Z',todos:[...data.todos].reverse()});
  assert.equal(again.status,'skipped');assert.equal(api.calls.filter(c=>c.method==='POST').length,1);
});

test('saved page ID prevents duplicates after rename or parent-list lag; moved pages fail closed',async()=>{
  const api=notion(),first=await api.push(snapshot());
  const previousDelivery={page_id:first.page_id,version:first.version,content_hash:first.content_hash};
  api.pages.get(first.page_id).title='用户更改的标题';
  const push=()=>pushNotionSnapshot({token,parentId,snapshot:snapshot(),previousDelivery,fetchImpl:api.fetchImpl});
  assert.equal((await push()).status,'skipped');
  api.options.hideParent=true;assert.equal((await push()).status,'skipped');
  api.options.moved=true;
  await assert.rejects(push(),e=>e.code==='NOTION_INCOMPLETE'&&!e.uncertainWrite);
  assert.equal(api.calls.filter(c=>c.method==='POST').length,1);
});

test('an existing same-day manual snapshot is not silently ignored or recreated as v1',async()=>{
  const api=notion();api.pages.set('e'.repeat(32),{title:'2026-10-24 · 业务快照',children:[]});
  await assert.rejects(api.push(snapshot()),e=>e.code==='NOTION_LEGACY_CONFLICT'&&!e.uncertainWrite);
  assert.equal(api.calls.filter(c=>c.method!=='GET').length,0);
});

test('read pagination discovers existing versions, and append uses Insert capability only on the newly-created page',async()=>{
  const api=notion({pageSize:25}),first=await api.push(snapshot(55));
  assert.equal(first.verified,true);
  assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);
  assert.ok(api.calls.some(c=>c.method==='GET'&&c.url.includes('start_cursor=25')));
  api.options.readLimit=false;
  const same=await api.push(snapshot(55));assert.equal(same.status,'skipped');
  for(const c of api.calls.filter(c=>c.method==='PATCH'))assert.equal(new URL(c.url).pathname,'/v1/blocks/'+first.page_id+'/children');
});

test('parent child-page pagination is exhausted before selecting the latest business-marked version',async()=>{
  const api=notion({parentPageSize:1});
  await api.push(snapshot());await api.push(snapshot(2,'c'.repeat(64)));await api.push(snapshot(3,'d'.repeat(64)));
  const same=await api.push(snapshot(3,'d'.repeat(64)));
  assert.equal(same.status,'skipped');assert.equal(same.version,3);
  assert.ok(api.calls.some(c=>c.method==='GET'&&new URL(c.url).pathname==='/v1/blocks/'+parentId+'/children'&&c.url.includes('start_cursor=2')));
});

test('a committed page creation with lost response is reconciled by parent enumeration and full readback, never re-POSTed',async()=>{
  const api=notion();api.options.loseCreateResponse=true;
  const result=await api.push(snapshot());
  assert.equal(result.verified,true);assert.equal(result.status,'created');
  assert.equal(api.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(api.pages.size,1);
});

test('a committed final append with lost response is reconciled without retrying the append',async()=>{
  const api=notion();api.options.loseAppendResponse=true;
  const result=await api.push(snapshot(55));
  assert.equal(result.verified,true);
  assert.equal(api.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(api.calls.filter(c=>c.method==='PATCH').length,1);
});

test('incomplete existing same-hash page cannot skip, be overwritten or receive further appends',async()=>{
  const api=notion(),first=await api.push(snapshot());
  api.pages.get(first.page_id).children.pop();
  const before=api.calls.filter(c=>c.method!=='GET').length;
  await assert.rejects(api.push(snapshot()),e=>e.code==='NOTION_INCOMPLETE'&&e.uncertainWrite===false);
  assert.equal(api.calls.filter(c=>c.method!=='GET').length,before);
});

test('unknown incomplete create/append stops safely instead of retrying writes or treating the prefix as success',async()=>{
  const created=notion();created.options.loseCreateResponse=true;
  await assert.rejects(created.push(snapshot(55)),e=>e.code==='NOTION_INCOMPLETE'&&e.uncertainWrite===true);
  assert.equal(created.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(created.calls.filter(c=>c.method==='PATCH').length,0);
  const appended=notion();appended.options.loseAppendResponse=true;appended.options.dropAppend=true;
  await assert.rejects(appended.push(snapshot(55)),e=>e.code==='NOTION_INCOMPLETE'&&e.uncertainWrite===true);
  assert.equal(appended.calls.filter(c=>c.method==='PATCH').length,1);
});

test('429 exposes a bounded retry delay and accurate uncertainty without automatic write retry or body leakage',async()=>{
  const api=notion();api.options.readLimit=true;
  await assert.rejects(api.push(snapshot()),e=>e.code==='NOTION_RATE_LIMIT'&&e.retryAfter===17&&e.retryable&&
    e.uncertainWrite===false&&!String(e.stack).includes(token)&&!JSON.stringify(e).includes('BODY-CANARY'));
  assert.equal(api.calls.length,1);
  const partial=notion();partial.options.appendLimit=true;
  await assert.rejects(partial.push(snapshot(55)),e=>e.code==='NOTION_RATE_LIMIT'&&e.uncertainWrite===true);
  assert.equal(partial.calls.filter(c=>c.method==='PATCH').length,1);
});

test('request budget is a total hard limit and pagination truncation or oversized responses fail explicitly',async()=>{
  let count=0;
  await assert.rejects(pushNotionSnapshot({token,parentId,snapshot:snapshot(),fetchImpl:async()=>{
    count++;return json({results:[],has_more:true,next_cursor:String(count)});
  }}),e=>e.code==='NOTION_BUDGET'&&e.uncertainWrite===false);
  assert.equal(count,40);
  const api=notion();api.options.truncated=true;
  await assert.rejects(api.push(snapshot()),e=>e.code==='NOTION_RESPONSE_LIMIT');
  assert.equal(api.calls.filter(c=>c.method!=='GET').length,0);
  const large=notion();large.options.hugeResponse=true;
  await assert.rejects(large.push(snapshot()),e=>e.code==='NOTION_RESPONSE_LIMIT');
});

test('fixed origin and bounded business-only input reject credentials and never expose upstream failures',async()=>{
  const api=notion(),bad=snapshot();bad.todos[0].password_hash='SENSITIVE-HASH-CANARY';
  await assert.rejects(api.push(bad),e=>e.code==='NOTION_INVALID_SNAPSHOT'&&!e.message.includes('SENSITIVE'));
  assert.equal(api.calls.length,0);
  await assert.rejects(pushNotionSnapshot({token,parentId:'https://evil.invalid',snapshot:snapshot(),fetchImpl:api.fetchImpl}));
  assert.equal(api.calls.length,0);
  await assert.rejects(pushNotionSnapshot({token,parentId,snapshot:snapshot(),fetchImpl:async()=>{throw Error(token+' FULL-BODY-CANARY');}}),
    e=>e.code==='NOTION_UNAVAILABLE'&&e.uncertainWrite===false&&!JSON.stringify(e).includes(token)&&!e.stack.includes('FULL-BODY-CANARY'));
});
