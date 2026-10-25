// Loopback-only browser fixture: real built Worker and synthetic temporary D1.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {fixture} from './harness.mjs';
import worker from '../dist/server/index.js';

let app,environment;
const ids={};
const title='黄婷婷九年没提的名字，被一句“更容易做朋友”说死了';
const server=createServer(async(request,response)=>{
  if(request.url==='/__fixture') {
    response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    response.end(JSON.stringify({synthetic:true,ids,title}));return;
  }
  try {
    const chunks=[];let size=0;
    for await(const chunk of request){size+=chunk.length;if(size>262144)throw Error('Synthetic request limit');chunks.push(chunk);}
    const body=Buffer.concat(chunks),incoming=new Request(environment.SITE_ORIGIN+request.url,{
      method:request.method,headers:request.headers,
      ...(!['GET','HEAD'].includes(request.method)&&body.length?{body}:{}),
    });
    const result=await worker.fetch(incoming,environment);
    response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));
  }catch{
    response.writeHead(500,{'Content-Type':'application/json'});
    response.end(JSON.stringify({error:{code:'SYNTHETIC_FIXTURE_ERROR',message:'Synthetic fixture request failed'}}));
  }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
try {
  app=await fixture(null,{persist:false,origin});
  const session=await app.login(),owner=(await app.request('/api/v1/auth/me',{session})).data.id;
  environment={DB:app.db,SITE_ORIGIN:origin,DAILY_NOTES_OWNER_ID:owner,
    PUBLIC_BUSINESS_MODE:'1',PUBLIC_BUSINESS_USER_ID:owner,
    PUBLIC_BUSINESS_ACCOUNT_IDS:JSON.stringify(['toutiao-haoduoyu','zhihu-haoduoyu','wechat-xiaoyuer'])};
  const create=async(key,value,method='PATCH')=>{
    const result=await app.request('/api/v1/articles',{method,session,body:value});
    assert.equal(result.status,201,'Synthetic article seeding failed');ids[key]=result.data.id;return result.data;
  };
  const exact=await create('tt1',{
    account_id:'toutiao-haoduoyu',title,run_dir:'tt1_1024',slot:'tt1',run_date:'2026-10-24',status:'draft_saved',
    writer:'dedao',illustrator:'codex',series_no:17,char_count:2236,subheading_count:5,image_count:25,
    draft_ref:{pgc_id:'7699934907375567402',future:{keep:true}},reruns:{watchdog:1},
    started_at:'2026-10-24T00:00:00.000Z',timings:{finished_at:'2026-10-24T00:31:00.000Z',writing:{seconds:540}},
    sample:{source:'合成来源 <script>globalThis.syntheticXSS=true</script>',confirmed:false},
    blockers:[{type:'source',message:'合成阻塞 <img src=x onerror=alert(1)>'}],
    verify_items:[{label:'合成核对',done:false,future:{keep:true}},{label:'未确认资料',future:'keep'}],
  });
  assert.deepEqual(exact.warnings,[],'tt1 boundary fixture must have no warnings');
  await create('unknown',{
    account_id:'toutiao-haoduoyu',title:'合成缺字段草稿',run_dir:'synthetic/unknown',slot:'tt2',run_date:'2026-10-24',
    status:'draft_saved',writer:'human',draft_ref:{pgc_id:'000123000',editor_url:'https://example.invalid/synthetic-editor',future:{keep:'draft metadata'}},
    timings:{future:{keep:'timing metadata'}},verify_items:null,
  });
  await create('unsafe',{
    account_id:'zhihu-haoduoyu',title:'<img src=x onerror="alert(1)">合成安全文本',run_dir:'synthetic/unsafe',slot:'zh1',
    run_date:'2026-10-24',status:'draft_saved',writer:'gemini_web',draft_ref:{editor_url:'javascript:alert(1)'},
  });
  await create('failed',{
    account_id:'zhihu-haoduoyu',title:'合成失败记录',run_dir:'synthetic/failed',slot:'zh2',run_date:'2026-10-24',
    status:'failed',writer:'other',blockers:[{type:'synthetic',message:'合成失败，不安排任何槽位'}],
  });
  const published=await create('published',{
    account_id:'toutiao-haoduoyu',title:'合成已发布零阅读',url:'https://example.invalid/synthetic-published',
    published_at:'2026-10-01T00:00:00.000Z',started_at:'2026-09-30T23:50:00.000Z',production_mode:'manual',writer:'human',status:'published',
  },'POST');
  const metric=await app.request('/api/v1/observations',{method:'POST',session,body:{article_id:published.id,
    as_of:'2026-10-02T00:00:00.000Z',collected_at:'2026-10-02T00:00:00.000Z',kind:'latest',
    metrics:{reads:0,likes:0,comments:0},source:'Synthetic browser fixture'}});
  assert.equal(metric.status,201);
  const note=await worker.fetch(new Request(origin+'/api/v1/daily-notes/2026-10-24',{method:'PUT',headers:{
    Cookie:session.cookie,'X-CSRF-Token':session.csrfToken,Origin:origin,'Content-Type':'application/json',
  },body:JSON.stringify({version:0,save_id:randomUUID(),text:'合成碎碎念，公开只读，未改变权限。'})}),environment);
  assert.equal(note.status,200,'Synthetic private-note seeding failed');
  console.log(origin);
}catch(error){
  server.close();await app?.mf.dispose();throw new Error('Synthetic article browser setup failed',{cause:error});
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{
  server.closeAllConnections();server.close();await app?.mf.dispose();
});
